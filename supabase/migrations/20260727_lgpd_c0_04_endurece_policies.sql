-- ═══════════════════════════════════════════════════════════════════════════
-- LGPD · Camada 0 (Contenção) · 04 — Endurecimento de policies e funções
--
-- CONTEXTO
-- Várias policies foram criadas para o papel `{public}` (que abrange `anon`)
-- com `USING true`. A migração 01 já revogou os grants de tabela do `anon`,
-- mas as policies permaneciam abertas — bastaria um `GRANT` acidental futuro
-- para reabrir a exposição. Esta migração alinha a intenção declarada das
-- policies ao acesso realmente pretendido (defesa em profundidade).
--
-- Além disso:
--   · trilha_metadata e geometria_fotos aceitavam INSERT/UPDATE/DELETE de
--     `{public}` — risco de integridade, não só de confidencialidade.
--   · fn_atualizar_indicador é SECURITY DEFINER, não checa permissão e altera
--     public.indicadores. Com EXECUTE concedido a PUBLIC, qualquer chamador
--     podia inflar os indicadores do projeto.
--
-- NOTA: configuracoes_sistema, geometria_fotos e trilha_metadata mantêm SELECT
-- público — são as 3 tabelas que pages/publico.html lê com a chave anônima.
-- Nenhuma contém dado pessoal.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Leitura restrita a autenticados ────────────────────────────────────
drop policy if exists leitura_autenticados on public.agente_analises;
create policy leitura_autenticados on public.agente_analises
  for select to authenticated using (true);

drop policy if exists car_dados_select on public.car_dados_locais;
create policy car_dados_select on public.car_dados_locais
  for select to authenticated using (true);

drop policy if exists car_marcados_select on public.car_marcados;
create policy car_marcados_select on public.car_marcados
  for select to authenticated using (true);

drop policy if exists pontos_mapa_select on public.produto_pontos_mapa;
create policy pontos_mapa_select on public.produto_pontos_mapa
  for select to authenticated using (true);

drop policy if exists leitura_versoes on public.tdr_versoes;
create policy leitura_versoes on public.tdr_versoes
  for select to authenticated using (true);

drop policy if exists pi_select on public.produto_indicador;
create policy pi_select on public.produto_indicador
  for select to authenticated using (true);

-- ── 2. Escrita restrita a autenticados (era `{public}`) ───────────────────
drop policy if exists trilha_metadata_insert on public.trilha_metadata;
create policy trilha_metadata_insert on public.trilha_metadata
  for insert to authenticated with check (true);

drop policy if exists trilha_metadata_update on public.trilha_metadata;
create policy trilha_metadata_update on public.trilha_metadata
  for update to authenticated using (true);

drop policy if exists trilha_metadata_delete on public.trilha_metadata;
create policy trilha_metadata_delete on public.trilha_metadata
  for delete to authenticated using (true);

drop policy if exists geometria_fotos_insert on public.geometria_fotos;
create policy geometria_fotos_insert on public.geometria_fotos
  for insert to authenticated with check (true);

drop policy if exists geometria_fotos_delete on public.geometria_fotos;
create policy geometria_fotos_delete on public.geometria_fotos
  for delete to authenticated using (true);

-- ── 3. Função SECURITY DEFINER sem checagem: fecha para anon/PUBLIC ───────
revoke execute on function public.fn_atualizar_indicador(uuid) from public, anon;
