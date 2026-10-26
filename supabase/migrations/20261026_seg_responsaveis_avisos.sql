-- ════════════════════════════════════════════════════════════════════════
-- Segurança: responsáveis da atividade e avisos do sino
--
-- Antes: atividade_responsaveis aceitava inclusão/alteração de qualquer logado
-- (WITH CHECK true) — qualquer um se fazia responsável de qualquer atividade e
-- ganhava avaliar produto, assinar a etapa 2 do remanejamento etc. E notificacoes
-- aceitava inserção de qualquer um (até do anon) para qualquer pessoa.
--
-- 1) atividade_responsaveis: incluir e alterar só super_admin/coordenação ativos
--    (os perfis que editam atividade na tela). A remoção física fica só para
--    super_admin no arquivo _sql_editor (o nome da policy trava o apply_migration).
-- 2) notificacoes: o cliente só grava aviso para si mesmo e não troca o dono.
--    Avisos para outras pessoas nascem no banco (triggers/funções SECURITY DEFINER).
-- 3) Os três triggers que avisavam outras pessoas sem privilégio próprio passam a
--    SECURITY DEFINER (senão parariam de avisar).
-- 4) fn_viagem_avisar: os dois avisos que a tela de Viagens gravava direto
--    (prestação enviada, protocolo realizado) — texto montado no banco e
--    conferido contra a situação do protocolo.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Responsáveis
alter policy ativ_resp_escrita on public.atividade_responsaveis
  to authenticated
  with check (public.fn_perfil_atual() in ('super_admin','coordenacao'));

alter policy ativ_resp_update on public.atividade_responsaveis
  to authenticated
  using (public.fn_perfil_atual() in ('super_admin','coordenacao'))
  with check (public.fn_perfil_atual() in ('super_admin','coordenacao'));

-- 2) Avisos
alter policy notif_escrita on public.notificacoes
  to authenticated
  with check (usuario_id = auth.uid());

alter policy notif_insert on public.notificacoes
  to authenticated
  with check (usuario_id = auth.uid());

alter policy notif_update on public.notificacoes
  to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

alter policy notif_select on public.notificacoes
  to authenticated
  using (usuario_id = auth.uid());

-- 3) Triggers que avisam outras pessoas
alter function public.fn_notificar_protocolo_criado()   security definer set search_path to 'public';
alter function public.fn_notificar_viagem_solicitada()  security definer set search_path to 'public';
alter function public.fn_notificar_solicitacao_senha()  security definer set search_path to 'public';
revoke execute on function public.fn_notificar_protocolo_criado()  from public, anon, authenticated;
revoke execute on function public.fn_notificar_viagem_solicitada() from public, anon, authenticated;
revoke execute on function public.fn_notificar_solicitacao_senha() from public, anon, authenticated;

-- 4) Avisos da tela de Viagens
--   'prestacao' — protocolo em_prestacao  → super_admins ativos
--   'realizado' — protocolo realizado por quem chama → quem criou o protocolo
-- Só quem opera Viagens; não repete o mesmo aviso não lido em 10 minutos.
create or replace function public.fn_viagem_avisar(p_protocolo_id uuid, p_evento text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p record;
  v_n integer := 0;
  v_dest uuid;
  v_tipo text; v_titulo text; v_msg text;
begin
  if not (coalesce(public.fn_perfil_atual() in ('super_admin','coordenacao','financeiro','tecnico'), false)
          or public.tem_permissao('viagens')) then
    raise exception 'VIAGEM_AVISO_NEGADO' using errcode = '42501';
  end if;
  select id, numero, destino_principal, situacao, criado_por, realizado_por
    into p from public.viagem_protocolos where id = p_protocolo_id;
  if not found then raise exception 'PROTOCOLO_INEXISTENTE'; end if;

  if p_evento = 'prestacao' then
    if p.situacao is distinct from 'em_prestacao' then raise exception 'VIAGEM_AVISO_FORA_DA_SITUACAO'; end if;
    v_tipo   := 'viagem_prestacao';
    v_titulo := 'Prestação de contas — ' || coalesce(p.numero,'');
    v_msg    := 'Protocolo ' || coalesce(p.numero,'') || ' (' || coalesce(p.destino_principal,'—') || ') aguarda confirmação.';
    for v_dest in select u.id from public.usuarios u where u.perfil = 'super_admin' and u.ativo loop
      if not exists (select 1 from public.notificacoes x
                      where x.usuario_id = v_dest and x.tipo = v_tipo and x.entidade_id = p.id
                        and not x.lida and x.criado_em > now() - interval '10 minutes') then
        insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
        values (v_dest, v_tipo, v_titulo, v_msg, false, 'viagens.html', 'viagem_protocolos', p.id);
        v_n := v_n + 1;
      end if;
    end loop;
  elsif p_evento = 'realizado' then
    if p.situacao is distinct from 'realizado' or p.realizado_por is distinct from auth.uid() then
      raise exception 'VIAGEM_AVISO_FORA_DA_SITUACAO';
    end if;
    if p.criado_por is not null and not exists (
         select 1 from public.notificacoes x
          where x.usuario_id = p.criado_por and x.tipo = 'viagem_aprovada' and x.entidade_id = p.id
            and not x.lida and x.criado_em > now() - interval '10 minutes') then
      insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      values (p.criado_por, 'viagem_aprovada', 'Protocolo ' || coalesce(p.numero,'') || ' realizado',
              'O protocolo ' || coalesce(p.numero,'') || ' foi confirmado como realizado e os valores foram lançados no financeiro.',
              false, 'viagens.html', 'viagem_protocolos', p.id);
      v_n := 1;
    end if;
  else
    raise exception 'VIAGEM_AVISO_EVENTO_INVALIDO';
  end if;
  return v_n;
end;
$$;
revoke all on function public.fn_viagem_avisar(uuid, text) from public, anon;
grant execute on function public.fn_viagem_avisar(uuid, text) to authenticated;
