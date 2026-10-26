-- ═══════════════════════════════════════════════════════════════════════════
-- Segurança: atividade_responsaveis e notificacoes
--
-- 1. atividade_responsaveis tinha INSERT/UPDATE com `true`: qualquer logado se
--    punha como responsável/substituto de qualquer atividade e, com isso, passava
--    em fn_pode_avaliar_contrato (aprovar produto), na etapa 2 do remanejamento e
--    no cancelamento de TDR. Agora só super_admin/coordenação ativos designam ou
--    desativam (a tela de Atividades é o único caminho do cliente). A policy de
--    exclusão está em 20261026_seg_responsaveis_notificacoes_sql_editor.sql.
-- 2. notificacoes aceitava INSERT de qualquer um (notif_insert era TO public, ou
--    seja, até o anon) para qualquer usuario_id: dava para forjar aviso no sino de
--    outra pessoa. O cliente agora só grava para si; aviso para outra pessoa nasce
--    em função/trigger SECURITY DEFINER. Os três triggers que avisavam outros como
--    SECURITY INVOKER passam a DEFINER, e os dois avisos que a tela de Viagens
--    gravava direto (prestação enviada, protocolo realizado) viram trigger.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. atividade_responsaveis ────────────────────────────────────────────────
alter policy ativ_resp_escrita on public.atividade_responsaveis
  to authenticated
  with check (public.fn_perfil_atual() in ('super_admin','coordenacao'));

alter policy ativ_resp_update on public.atividade_responsaveis
  to authenticated
  using (public.fn_perfil_atual() in ('super_admin','coordenacao'))
  with check (public.fn_perfil_atual() in ('super_admin','coordenacao'));

-- ── 2. notificacoes: o cliente só grava para si ──────────────────────────────
alter policy notif_escrita on public.notificacoes
  to authenticated
  with check (usuario_id = auth.uid());

alter policy notif_insert on public.notificacoes
  to authenticated
  with check (usuario_id = auth.uid());

alter policy notif_select on public.notificacoes
  to authenticated
  using (usuario_id = auth.uid());

alter policy notif_update on public.notificacoes
  to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- Triggers que avisam outras pessoas: passam a SECURITY DEFINER.
alter function public.fn_notificar_protocolo_criado()  security definer set search_path = public;
alter function public.fn_notificar_viagem_solicitada() security definer set search_path = public;
alter function public.fn_notificar_solicitacao_senha() security definer set search_path = public;
revoke execute on function public.fn_notificar_protocolo_criado()  from public, anon;
revoke execute on function public.fn_notificar_viagem_solicitada() from public, anon;
revoke execute on function public.fn_notificar_solicitacao_senha() from public, anon;

-- Avisos de Viagens que a tela gravava direto (pages/viagens.html).
create or replace function public.fn_notificar_protocolo_situacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.situacao is not distinct from old.situacao then
    return new;
  end if;

  if new.situacao = 'em_prestacao' then
    insert into public.notificacoes
      (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    select u.id, 'viagem_prestacao',
           'Prestação de contas — ' || coalesce(new.numero,''),
           'Protocolo ' || coalesce(new.numero,'') || ' (' || coalesce(new.destino_principal,'—') ||
             ') aguarda confirmação.',
           false, 'viagens.html', 'viagem_protocolos', new.id
      from public.usuarios u
     where u.perfil = 'super_admin' and u.ativo;

  elsif new.situacao = 'realizado' and new.criado_por is not null then
    insert into public.notificacoes
      (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    values (new.criado_por, 'viagem_aprovada',
            'Protocolo ' || coalesce(new.numero,'') || ' realizado',
            'O protocolo ' || coalesce(new.numero,'') ||
              ' foi confirmado como realizado e os valores foram lançados no financeiro.',
            false, 'viagens.html', 'viagem_protocolos', new.id);
  end if;

  return new;
end;
$$;
revoke execute on function public.fn_notificar_protocolo_situacao() from public, anon;

create or replace trigger trg_notif_protocolo_situacao
  after update of situacao on public.viagem_protocolos
  for each row execute function public.fn_notificar_protocolo_situacao();
