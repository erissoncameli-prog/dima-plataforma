-- ════════════════════════════════════════════════════════════════════════
-- Aplicada em produção (03/10/2026) em partes, mesmo conteúdo: 20261003_rem_00a_coluna_original, _00b_view_saldo_somente_leitura, _00c_audit_atividades, _00d_guarda_orcamento
-- Remanejamento · Fase 0 — Contenção (docs/remanejamento/plano.md §8)
--
-- 1. vw_saldo_atividade tinha GRANT de INSERT/UPDATE/DELETE para
--    authenticated. É uma view simples sobre `atividades` (portanto
--    auto-atualizável em id, codigo, nome_pt, orcamento_usd) e roda com os
--    privilégios do dono (postgres), que ignora RLS: qualquer usuário logado,
--    até visualizador, conseguia mudar orçamento, código e nome de atividade
--    — ou apagá-la — por ela. Fica só SELECT.
-- 2. Trilha de auditoria (fn_trg_audit) em `atividades`.
-- 3. orcamento_usd e orcamento_original_usd só mudam pelo razão de fontes
--    (rem_01). UPDATE direto é recusado para todos, inclusive super_admin;
--    o razão liga a chave de transação `dima.razao_orcamento` e grava o
--    cache de dentro de trigger (pg_trigger_depth() > 1). INSERT de atividade com orçamento: só super_admin (a
--    dotação vira fonte `dotacao_original` na rem_01).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. View de saldo: somente leitura ──────────────────────────────────
revoke all on public.vw_saldo_atividade from anon, authenticated, public;
grant select on public.vw_saldo_atividade to authenticated, service_role;

-- ── 2. Auditoria de atividades ─────────────────────────────────────────
create or replace trigger trg_audit_atividades
  after insert or update or delete on public.atividades
  for each row execute function public.fn_trg_audit();

-- ── 3. Guarda do orçamento ─────────────────────────────────────────────
alter table public.atividades add column if not exists orcamento_original_usd numeric(14,2);
comment on column public.atividades.orcamento_original_usd is
  'Dotação original aprovada (Σ fontes dotacao_original). Congelada; só o razão altera.';
comment on column public.atividades.orcamento_usd is
  'Orçamento VIGENTE = cache de Σ orcamento_fontes orçamentárias. Só o razão altera '
  '(trigger trg_atividade_guarda_orcamento). Ver docs/remanejamento/plano.md.';

create or replace function public.fn_razao_orcamento_ativo()
returns boolean language sql stable as $$
  select coalesce(current_setting('dima.razao_orcamento', true), '') = 'on'
$$;

create or replace function public.fn_trg_atividade_guarda_orcamento()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- Só o razão grava: chave de transação ligada E a escrita vem de dentro
  -- de uma trigger do razão (profundidade > 1). set_config sozinho, num
  -- UPDATE direto, não passa.
  if fn_razao_orcamento_ativo() and pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.orcamento_usd, 0) <> 0
       and coalesce(fn_perfil_atual()::text, '') <> 'super_admin' then
      raise exception 'ORCAMENTO_PROTEGIDO: só super_admin cria atividade com orçamento (vira dotação original no razão).'
        using errcode = 'P0001';
    end if;
    -- a dotação original é registrada pelo razão (trg_atividade_dotacao)
    new.orcamento_original_usd := null;
    return new;
  end if;

  if new.orcamento_usd is distinct from old.orcamento_usd
     or new.orcamento_original_usd is distinct from old.orcamento_original_usd then
    raise exception 'ORCAMENTO_PROTEGIDO: o orçamento da atividade % só muda por remanejamento ou revisão orçamentária registrados no razão.', old.codigo
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace trigger trg_atividade_guarda_orcamento
  before insert or update on public.atividades
  for each row execute function public.fn_trg_atividade_guarda_orcamento();

revoke all on function public.fn_trg_atividade_guarda_orcamento() from public, anon, authenticated;
revoke all on function public.fn_razao_orcamento_ativo() from public, anon, authenticated;
