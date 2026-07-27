-- ═══════════════════════════════════════════════════════════════════════════
-- LGPD · Camada 0 (Contenção) · 01 — Bloqueio de acesso anônimo
--
-- CONTEXTO
-- O papel `anon` — cuja chave está embarcada em js/config.js e é, portanto,
-- pública — detinha SELECT/INSERT/UPDATE/DELETE em TODAS as tabelas do schema
-- `public`. Combinado com policies `{public} USING true`, isso tornava
-- acessível sem qualquer autenticação:
--
--   · car_dados_locais    — 53.594 nomes completos + CPF/CNPJ de proprietários
--                           rurais (LGPD art. 5º, I — dado pessoal)
--   · produto_pontos_mapa — nome do responsável + coordenadas + foto
--   · tdr_versoes, agente_analises, geometria_fotos, car_marcados
--   · trilha_metadata     — inclusive UPDATE e DELETE (integridade)
--
-- ESTRATÉGIA
-- Fechar por padrão (deny-by-default) e reabrir apenas o mínimo que o portal
-- público consome. As 5 RPCs `fn_publico_*` são SECURITY DEFINER e continuam
-- funcionando sem grants de tabela.
--
-- Base legal: LGPD art. 6º, VII (segurança) e art. 46 (medidas técnicas).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Revoga todo o acesso do papel anônimo ──────────────────────────────
revoke all privileges on all tables    in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- ── 2. Tabelas futuras nascem fechadas para o anon ────────────────────────
-- Sem isto, toda tabela nova volta a ser exposta pelo default do Supabase.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ── 3. Allowlist mínima do portal público ─────────────────────────────────
-- Consumido por pages/publico.html e index.html (pré-login).
-- Nenhuma destas tabelas contém dado pessoal.
grant select on public.configuracoes_sistema to anon;  -- branding do projeto
grant select on public.geometria_fotos       to anon;  -- fotos de geometrias
grant select on public.trilha_metadata       to anon;  -- vídeos de trilhas

comment on table public.car_dados_locais is
  'Dados do CAR (SICAR). Contém dado pessoal — acesso restrito a autenticados. '
  'CPF/CNPJ mascarado de forma irreversível (ver migração 20260727_lgpd_c0_03).';
