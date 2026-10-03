-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · Fase 3 (parte g) — APLICAR PELO SQL EDITOR DO SUPABASE
--
-- Estas instruções contêm DELETE/DROP e o apply_migration do MCP fica
-- esperando uma confirmação que não chega à sessão. Colar este arquivo
-- inteiro no SQL Editor e executar (transação única). Idempotente.
--
-- 1. fn_rem_salvar — monta/edita o rascunho do pedido (o DELETE é dos itens
--    do PRÓPRIO rascunho, permitido só com o pedido em rascunho pela trigger
--    trg_rem_itens_rascunho; pedido enviado nunca perde item).
-- 2. Sino: libera os tipos remanejamento_* em notificacoes (sem isso só o
--    e-mail sai; fn_rem_notificar já trata a ausência).
-- 3. Limpeza das sobras inertes que a 1ª versão da rem_02 deixou na tabela
--    antiga cotacoes_usd (AwesomeAPI).
-- ════════════════════════════════════════════════════════════════════════
begin;

-- ── 6. Rascunho (sem senha) ────────────────────────────────────────────
-- p_dados: { justificativa, uuid_cliente, itens:[{atividade_id, valor_usd}],
--            alocacoes:[{atividade_id (origem), fonte_id, valor_usd}] }
create or replace function public.fn_rem_salvar(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid  uuid := auth.uid();
  v_rem  public.remanejamentos;
  v_ano  integer := extract(year from fn_hoje_acre())::integer;
  v_seq  integer;
  v_it   jsonb;
  v_item uuid;
begin
  if coalesce(fn_perfil_atual()::text, '') not in ('coordenacao','super_admin') then
    raise exception 'Sem permissão: só a coordenação monta pedido de remanejamento.';
  end if;
  if coalesce(p_dados->>'tipo', 'livre') <> 'livre' then
    raise exception 'REM: pedido de cobertura de contrato nasce do cadastro do contrato (fase seguinte).';
  end if;

  if p_id is null then
    if p_dados ? 'uuid_cliente' then
      select * into v_rem from public.remanejamentos where uuid_cliente = (p_dados->>'uuid_cliente')::uuid;
      if found then return v_rem.id; end if;
    end if;
    insert into public.rem_numeracao (ano, ultimo) values (v_ano, 1)
      on conflict (ano) do update set ultimo = public.rem_numeracao.ultimo + 1
      returning ultimo into v_seq;
    insert into public.remanejamentos (numero, tipo, justificativa, uuid_cliente, criado_por)
    values ('REM-' || v_ano || '-' || lpad(v_seq::text, 3, '0'), 'livre',
            coalesce(nullif(btrim(p_dados->>'justificativa'), ''), '(rascunho)'),
            (p_dados->>'uuid_cliente')::uuid, v_uid)
    returning * into v_rem;
    perform fn_rem_log(v_rem.id, 'criado', null, 'rascunho', null, v_uid, null);
  else
    select * into v_rem from public.remanejamentos where id = p_id for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if v_rem.criado_por <> v_uid and coalesce(fn_perfil_atual()::text, '') <> 'super_admin' then
      raise exception 'Só quem criou o pedido o edita.';
    end if;
    if v_rem.status = 'em_aprovacao' and v_rem.etapa_atual = 1 then
      -- devolvido ao solicitante: editar abre nova versão; a cadeia recomeça
      update public.remanejamento_assinaturas
         set invalidada_em = now(), invalidada_motivo = 'pedido editado pelo solicitante (nova versão)'
       where remanejamento_id = v_rem.id and versao = v_rem.versao and invalidada_em is null;
      update public.remanejamentos set status = 'rascunho', etapa_atual = null, versao = versao + 1
       where id = v_rem.id returning * into v_rem;
      perform fn_rem_log(v_rem.id, 'editado_apos_devolucao', 'em_aprovacao', 'rascunho', 1, v_uid, null);
    elsif v_rem.status <> 'rascunho' then
      raise exception 'Pedido % em % não pode ser editado.', v_rem.numero, v_rem.status;
    end if;
    update public.remanejamentos
       set justificativa = coalesce(nullif(btrim(p_dados->>'justificativa'), ''), justificativa)
     where id = v_rem.id;
  end if;

  if p_dados ? 'itens' then
    delete from public.remanejamento_alocacoes where remanejamento_id = v_rem.id;
    delete from public.remanejamento_itens where remanejamento_id = v_rem.id;
    for v_it in select * from jsonb_array_elements(p_dados->'itens') loop
      insert into public.remanejamento_itens (remanejamento_id, atividade_id, valor_usd)
      values (v_rem.id, (v_it->>'atividade_id')::uuid, round((v_it->>'valor_usd')::numeric, 2));
    end loop;
    for v_it in select * from jsonb_array_elements(coalesce(p_dados->'alocacoes', '[]'::jsonb)) loop
      select id into v_item from public.remanejamento_itens
       where remanejamento_id = v_rem.id and atividade_id = (v_it->>'atividade_id')::uuid and valor_usd < 0;
      if v_item is null then
        raise exception 'Alocação para atividade que não é origem do pedido: %', v_it->>'atividade_id';
      end if;
      insert into public.remanejamento_alocacoes (remanejamento_id, item_id, fonte_id, valor_usd)
      values (v_rem.id, v_item, (v_it->>'fonte_id')::uuid, round((v_it->>'valor_usd')::numeric, 2));
    end loop;
  end if;

  update public.remanejamentos set hash_documento = fn_rem_hash(id) where id = v_rem.id;
  perform fn_rem_log(v_rem.id, 'rascunho_salvo', null, null, null, v_uid, null);
  return v_rem.id;
end $$;

revoke all on function public.fn_rem_salvar(uuid, jsonb) from public, anon;
grant execute on function public.fn_rem_salvar(uuid, jsonb) to authenticated, service_role;

-- ── Sino
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo::text = any (array[
  'tdr_para_revisar',
  'tdr_devolvido',
  'tdr_aprovado',
  'tdr_enviado_unesco',
  'produto_para_avaliar',
  'produto_aprovado',
  'produto_devolvido',
  'produto_aguarda_pagamento',
  'atividade_sem_responsavel',
  'substituto_designado',
  'desempate_necessario',
  'viagem_solicitada',
  'viagem_aprovada',
  'viagem_rejeitada',
  'viagem_prestacao',
  'reset_senha_solicitado',
  'reset_senha_atendido',
  'tarefa_atribuida',
  'tarefa_prazo',
  'tarefa_concluida',
  'tarefa_comentario',
  'tarefa_observador',
  'tarefa_subtarefa',
  'tarefa_revisao',
  'tarefa_devolvida',
  'tarefa_reaberta',
  'remanejamento_analisar',
  'remanejamento_devolvido',
  'remanejamento_recusado',
  'remanejamento_efetivado',
  'remanejamento_cancelado'
]::text[]));

-- ── Sobras na cotacoes_usd (AwesomeAPI)
drop trigger if exists trg_cotacoes_imutavel on public.cotacoes_usd;
drop policy if exists cotacoes_usd_select on public.cotacoes_usd;

notify pgrst, 'reload schema';
commit;
