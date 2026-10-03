-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · Fase 2 — Cotação do dia (docs/remanejamento/plano.md §6)
--
-- Cotação oficial = PTAX de fechamento do Banco Central (API Olinda,
-- CotacaoDolarPeriodo), gravada pela Edge Function `cotacao-ptax` (cron em
-- dias úteis + carga do histórico). Nunca vem do navegador.
--
-- Uso: fn_cotacao_usd(data) devolve a PTAX da data ou, se não houver
-- (fim de semana, feriado, antes do fechamento), a do último dia útil
-- publicado — e diz qual data foi usada. Mais de 7 dias sem PTAX = erro
-- (cron parado), para não converter com taxa velha em silêncio.
--
-- ⚠️ NÃO confundir com public.cotacoes_usd (cotação AwesomeAPI de
-- referência, gravada pelo financeiro e lida por viagens/dashboard/
-- relatórios). Na 1ª aplicação (03/10/2026) este arquivo usava o nome
-- cotacoes_usd, que já existia: os GRANT/trigger caíram na tabela antiga.
-- Corrigido em produção por 20261003_rem_02a (privilégios restaurados,
-- trigger desligada) e 20261003_rem_02c (este conteúdo). Sobras inertes na
-- tabela antiga, a remover quando o DROP puder ser confirmado:
-- trigger trg_cotacoes_imutavel (desligada) e policy cotacoes_usd_select
-- (duplica cotacoes_select_all).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.cotacoes_ptax (
  data              date primary key,
  ptax_compra       numeric(10,4) not null check (ptax_compra > 0),
  ptax_venda        numeric(10,4) not null check (ptax_venda > 0),
  data_hora_cotacao timestamptz,
  fonte             text not null default 'BCB PTAX fechamento (Olinda CotacaoDolarPeriodo)',
  obtida_em         timestamptz not null default now()
);
comment on table public.cotacoes_ptax is
  'PTAX de fechamento USD/BRL do Banco Central, 1 linha por dia útil. Gravada só pela Edge '
  'Function cotacao-ptax (service_role). Imutável. Consultar via fn_cotacao_usd(data).';

alter table public.cotacoes_ptax enable row level security;
do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cotacoes_ptax' and policyname = 'cotacoes_ptax_select') then
    create policy cotacoes_ptax_select on public.cotacoes_ptax
      for select to authenticated using (auth.uid() is not null);
  end if;
end $pol$;
revoke all on public.cotacoes_ptax from anon, authenticated, public;
grant select on public.cotacoes_ptax to authenticated;
grant select, insert on public.cotacoes_ptax to service_role;

create or replace function public.fn_trg_cotacoes_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'COTACAO: PTAX publicada não muda — cotacoes_ptax é imutável.';
end $$;
create or replace trigger trg_cotacoes_ptax_imutavel before update or delete on public.cotacoes_ptax
  for each row execute function public.fn_trg_cotacoes_imutavel();

-- Data "de hoje" do projeto = hora do Acre (UTC-5)
create or replace function public.fn_hoje_acre()
returns date language sql stable as $$
  select (now() at time zone 'America/Rio_Branco')::date
$$;

create or replace function public.fn_cotacao_usd(p_data date default null)
returns table (data_cotacao date, ptax_venda numeric, ptax_compra numeric, data_pedida date, defasagem_dias integer)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_pedida date := coalesce(p_data, fn_hoje_acre());
  v_row    public.cotacoes_ptax;
begin
  select * into v_row from public.cotacoes_ptax c
   where c.data <= v_pedida order by c.data desc limit 1;
  if not found then
    raise exception 'COTACAO_INDISPONIVEL: não há PTAX gravada até %.', v_pedida;
  end if;
  if v_pedida - v_row.data > 7 then
    raise exception 'COTACAO_DESATUALIZADA: última PTAX gravada é de % (pedida %). Verifique o cron cotacao-ptax.',
      v_row.data, v_pedida;
  end if;
  return query select v_row.data, v_row.ptax_venda, v_row.ptax_compra, v_pedida, (v_pedida - v_row.data)::integer;
end $$;
comment on function public.fn_cotacao_usd(date) is
  'PTAX venda/compra da data (ou do último dia útil anterior, até 7 dias). Padrão: hoje no Acre.';

revoke all on function public.fn_trg_cotacoes_imutavel() from public, anon, authenticated;
revoke all on function public.fn_cotacao_usd(date)        from public, anon;
grant execute on function public.fn_cotacao_usd(date)      to authenticated, service_role;
revoke all on function public.fn_hoje_acre()              from anon;

-- ── Cron: dias úteis, depois do fechamento da PTAX (~13h de Brasília) ──
-- 17:20 e 22:20 UTC (14:20 e 19:20 de Brasília; a 2ª cobre atraso de
-- publicação). A função só insere data que ainda não existe: chamada a
-- mais é inofensiva. Mesmo padrão dos demais crons (net.http_post + anon key).
select cron.schedule(
  'cotacao-ptax-diaria',
  '20 17,22 * * 1-5',
  $$
  select net.http_post(
    url := 'https://wfymnmlinonvdqfucjya.supabase.co/functions/v1/cotacao-ptax',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmeW1ubWxpbm9udmRxZnVjanlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MzM1NzksImV4cCI6MjA5MDMwOTU3OX0.eC6T9VQ6OzF9mISEGy_pgbIbrOAnG4xp2z6WN-sCMt8'
    ),
    body := '{}'::jsonb
  );
  $$
);
