-- Trava de integridade: impede que uma entrega de produto (ou o produto em si)
-- seja marcada como "em avaliação"/"aprovada" sem nenhum documento, foto, nota
-- técnica ou contribuição de indicador vinculada. Motivo: incidente em que uma
-- entrega foi registrada como 100% entregue sem que os documentos técnicos
-- fossem efetivamente salvos (falha silenciosa no upload).

-- 1) Evidência ao nível da entrega (contratos_produtos_entregas)
create or replace function public.fn_validar_evidencia_entrega()
returns trigger
language plpgsql
as $$
declare
  v_tem_evidencia boolean;
begin
  select
    exists (select 1 from public.entrega_documentos d where d.entrega_id = NEW.id)
    or coalesce(NEW.fotos_total, 0) > 0
    or NEW.nota_tecnica_url is not null
    or exists (select 1 from public.produto_matriz_contribuicao m where m.produto_id = NEW.id)
  into v_tem_evidencia;

  if not v_tem_evidencia then
    raise exception 'Não é possível marcar a entrega como "%" sem nenhum documento, foto, nota técnica ou indicador anexado. Verifique se o envio dos arquivos foi concluído antes de reenviar.', NEW.situacao
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_validar_evidencia_entrega on public.contratos_produtos_entregas;
create trigger trg_validar_evidencia_entrega
before insert or update on public.contratos_produtos_entregas
for each row
when (NEW.situacao in ('em_analise','aprovada'))
execute function public.fn_validar_evidencia_entrega();

-- 2) Evidência ao nível do produto (contratos_produtos) — defesa em profundidade
--    para o caso de alguém alterar a situação do produto diretamente, sem passar
--    pela tabela de entregas (ex.: correção manual, script administrativo).
create or replace function public.fn_validar_evidencia_produto()
returns trigger
language plpgsql
as $$
declare
  v_tem_evidencia boolean;
begin
  select exists (
    select 1
    from public.contratos_produtos_entregas e
    where e.produto_id = NEW.id
      and (
        exists (select 1 from public.entrega_documentos d where d.entrega_id = e.id)
        or coalesce(e.fotos_total, 0) > 0
        or e.nota_tecnica_url is not null
        or exists (select 1 from public.produto_matriz_contribuicao m where m.produto_id = e.id)
      )
  ) into v_tem_evidencia;

  if not v_tem_evidencia then
    raise exception 'Não é possível marcar o produto como "%" sem nenhuma entrega com documento, foto, nota técnica ou indicador vinculado.', NEW.situacao
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_validar_evidencia_produto on public.contratos_produtos;
create trigger trg_validar_evidencia_produto
before update on public.contratos_produtos
for each row
when (NEW.situacao in ('em_analise','aprovado','entrega_parcial') and OLD.situacao is distinct from NEW.situacao)
execute function public.fn_validar_evidencia_produto();

-- 3) fn_notificar_avaliacao_produto passa a disparar também quando a entrega é
--    atualizada (não só inserida) para 'em_analise' — necessário porque o
--    frontend agora insere a entrega como 'pendente' e só promove para
--    'em_analise' depois de confirmar os documentos no banco.
create or replace function public.fn_notificar_avaliacao_produto()
returns trigger
language plpgsql
as $function$
DECLARE
  v_atividade_id uuid;
  v_ativ_codigo  text;
  v_produto_desc text;
  v_produto_num  integer;
  v_cont_numero  text;
  v_titulo       text;
  v_mensagem     text;
  v_uid          record;
  v_notificados  uuid[] := '{}';
BEGIN
  IF NOT (
    (TG_OP = 'INSERT' AND NEW.situacao = 'em_analise')
    OR (TG_OP = 'UPDATE' AND NEW.situacao = 'em_analise' AND OLD.situacao IS DISTINCT FROM 'em_analise')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT cp.descricao, cp.numero_produto, c.numero, c.atividade_id, a.codigo
  INTO v_produto_desc, v_produto_num, v_cont_numero, v_atividade_id, v_ativ_codigo
  FROM contratos_produtos cp
  JOIN contratos c ON c.id = cp.contrato_id
  LEFT JOIN atividades a ON a.id = c.atividade_id
  WHERE cp.id = NEW.produto_id;

  v_titulo   := 'Produto aguardando avaliação — ' || COALESCE(v_ativ_codigo,'');
  v_mensagem := 'Produto ' || COALESCE(v_produto_num::text,'') ||
                ' — ' || COALESCE(v_produto_desc,'') ||
                ' (Contrato ' || COALESCE(v_cont_numero,'') ||
                ') foi entregue e aguarda seu parecer.';

  -- Notificar responsável e substituto ativos da atividade
  IF v_atividade_id IS NOT NULL THEN
    FOR v_uid IN
      SELECT ar.usuario_id
      FROM atividade_responsaveis ar
      WHERE ar.atividade_id = v_atividade_id
        AND ar.ativo = true
        AND ar.papel IN ('responsavel','substituto')
    LOOP
      INSERT INTO notificacoes
        (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      VALUES
        (v_uid.usuario_id, 'produto_para_avaliar', v_titulo, v_mensagem, false,
         'produtos.html', 'contratos_produtos_entregas', NEW.id);
      v_notificados := v_notificados || v_uid.usuario_id;
    END LOOP;
  END IF;

  -- Notificar super_admins ainda não notificados
  FOR v_uid IN
    SELECT id FROM usuarios
    WHERE perfil = 'super_admin' AND ativo = true
      AND id <> ALL(v_notificados)
  LOOP
    INSERT INTO notificacoes
      (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    VALUES
      (v_uid.id, 'produto_para_avaliar', v_titulo, v_mensagem, false,
       'produtos.html', 'contratos_produtos_entregas', NEW.id);
  END LOOP;

  -- Ao resubmeter: dismiss das notificações produto_devolvido para o consultor
  IF NEW.criado_por IS NOT NULL THEN
    UPDATE notificacoes
    SET lida = true, lida_em = now()
    WHERE usuario_id = NEW.criado_por
      AND tipo = 'produto_devolvido'
      AND lida = false
      AND entidade_id IN (
        SELECT id FROM contratos_produtos_entregas
        WHERE produto_id = NEW.produto_id
          AND situacao = 'devolvida'
          AND criado_por = NEW.criado_por
      );
  END IF;

  RETURN NEW;
END;
$function$;

drop trigger if exists trg_notificar_avaliacao on public.contratos_produtos_entregas;
create trigger trg_notificar_avaliacao
after insert or update on public.contratos_produtos_entregas
for each row execute function public.fn_notificar_avaliacao_produto();
