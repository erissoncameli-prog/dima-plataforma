-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · rem_11 — aviso de contrato travado e liberado (e-mail + sino)
-- Plano §5.3 / pendencias.md B2.
--
-- Quando um contrato entra em 'aguardando_cobertura' (cadastro ou aditivo acima do
-- saldo) ou sai dele (saldo coberto), avisa:
--   · coordenação (perfil coordenacao, ativos);
--   · responsáveis da atividade do contrato (atividade_responsaveis.papel='responsavel');
--   · quem cadastrou o contrato.
-- E-mail: fila cobertura_notificacoes, drenada pela Edge Function assinar-remanejamento
-- (acao 'drenar', mesmo cron 'remanejamento-emails' de 15 min). Sino: tipos
-- contrato_travado / contrato_liberado — dependem do check de notificacoes
-- (rem_11b); sem ele o sino fica mudo e o e-mail sai.
-- Cancelamento do contrato não avisa (foi a própria coordenação que cancelou).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.cobertura_notificacoes (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references public.contratos(id),
  atividade_id uuid references public.atividades(id),
  usuario_id   uuid not null references public.usuarios(id),
  evento       text not null check (evento in ('travado','liberado')),
  deficit_usd  numeric(14,2),
  criado_em    timestamptz not null default now(),
  enviado_em   timestamptz,
  tentativas   integer not null default 0,
  ultimo_erro  text
);
create index if not exists idx_cob_notif_pendentes on public.cobertura_notificacoes (criado_em) where enviado_em is null;
comment on table public.cobertura_notificacoes is
  'Fila de e-mail do aviso de contrato travado/liberado (rem_11). Drenada pela Edge Function assinar-remanejamento.';
alter table public.cobertura_notificacoes enable row level security;
revoke all on public.cobertura_notificacoes from anon, authenticated, public;
grant all on public.cobertura_notificacoes to service_role;

create or replace function public.fn_cob_notificar(p_contrato uuid, p_evento text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  c record; v_ativ uuid; v_cod text; v_deficit numeric; u uuid; v_titulo text; v_msg text;
begin
  select * into c from public.contratos where id = p_contrato;
  v_ativ := coalesce((select atividade_id from public.tdrs where id = c.tdr_id), c.atividade_id);
  select codigo into v_cod from public.atividades where id = v_ativ;
  select sum(deficit_usd) into v_deficit from public.contrato_coberturas
   where contrato_id = p_contrato and situacao = 'aguardando';

  v_titulo := case p_evento
    when 'travado'  then 'Contrato ' || c.numero || ' travado: aguarda cobertura de orçamento'
    else                 'Contrato ' || c.numero || ' liberado: o saldo da atividade cobriu o valor' end;
  v_msg := case p_evento
    when 'travado'  then 'O valor acima do TDR não coube no saldo livre da atividade ' || coalesce(v_cod, '')
                          || '. Falta cobrir US$ ' || coalesce(to_char(v_deficit, 'FM999G999G990D00'), '0,00')
                          || '. Sem produtos nem pagamentos até a cobertura.'
    else                 'O contrato voltou ao status ' || c.status::text || ' e pode receber produtos e pagamentos.' end;

  for u in
    select distinct x.id from (
      select us.id from public.usuarios us where us.ativo and us.perfil = 'coordenacao'
      union
      select r.usuario_id from public.atividade_responsaveis r
        join public.usuarios us on us.id = r.usuario_id and us.ativo
       where r.atividade_id = v_ativ and r.ativo and r.papel = 'responsavel'
      union
      select us.id from public.usuarios us where us.id = c.criado_por and us.ativo
    ) x
  loop
    insert into public.cobertura_notificacoes (contrato_id, atividade_id, usuario_id, evento, deficit_usd)
    values (p_contrato, v_ativ, u, p_evento, v_deficit);
    -- sino: se o tipo ainda não estiver liberado no check de notificacoes, segue só o e-mail
    begin
      insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
      values (u, 'contrato_' || p_evento, v_titulo, v_msg,
              case p_evento when 'travado' then 'remanejamentos.html?cobertura=' || p_contrato else 'contratos.html' end,
              'contrato', p_contrato);
    exception when others then null;
    end;
  end loop;
end $$;
revoke all on function public.fn_cob_notificar(uuid, text) from public, anon, authenticated;

create or replace function public.fn_trg_contrato_aviso_cobertura()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'aguardando_cobertura'
     and (tg_op = 'INSERT' or old.status is distinct from 'aguardando_cobertura') then
    perform fn_cob_notificar(new.id, 'travado');
  elsif tg_op = 'UPDATE' and old.status = 'aguardando_cobertura'
        and new.status not in ('aguardando_cobertura', 'cancelado') then
    perform fn_cob_notificar(new.id, 'liberado');
  end if;
  return null;
end $$;
revoke all on function public.fn_trg_contrato_aviso_cobertura() from public, anon, authenticated;

create or replace trigger trg_contrato_aviso_cobertura after insert or update of status on public.contratos
  for each row execute function public.fn_trg_contrato_aviso_cobertura();

notify pgrst, 'reload schema';
