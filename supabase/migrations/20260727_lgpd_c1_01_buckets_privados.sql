-- ═══════════════════════════════════════════════════════════════════════════
-- LGPD · Camada 1 · 01 — Buckets de documentos passam a privados
--
-- CONTEXTO
-- Os 9 buckets de Storage eram públicos: qualquer pessoa com a URL lia o
-- arquivo, sem autenticação. Isso expunha:
--
--   · viagens-arquivos     — cartões de embarque (nome completo, CPF, itinerário)
--   · financeiro-docs      — notas fiscais e comprovantes bancários
--   · contratos-docs       — contratos com dados de pessoa física
--   · tdrs-arquivos        — TDRs com dados de consultores PF
--   · entregas-docs        — documentos de entrega
--   · produtos-evidencias  — evidências de produtos
--
-- Havia ainda a policy `tdrs_arquivos_viagens_public_select`, que liberava
-- explicitamente todo o prefixo `viagens/%` a usuários não autenticados.
--
-- PERMANECEM PÚBLICOS (sem dado pessoal / exigidos pelo portal público):
--   · plataforma-assets — logos institucionais, usados inclusive em e-mails
--   · pontos-mapa       — fotos das entregas exibidas em pages/publico.html
--   · avatares          — foto de perfil da equipe, renderizada no sidebar de
--                         todas as páginas; caminho baseado em uuid
--
-- COMPATIBILIDADE
-- As tabelas guardam a URL no formato `/object/public/<bucket>/<path>`. Essa
-- string continua válida como PORTADORA DO CAMINHO — não é preciso migrar
-- dado algum. A leitura passa a ser assinada em runtime pelos helpers
-- `urlAssinada()` / `abrirDoc()` / `assinarImagens()` de js/config.js.
--
-- O fluxo de prestação de contas (sem login) não é afetado: a Edge Function
-- `prestacao-publica` usa service_role e `createSignedUploadUrl`, que
-- funcionam normalmente em bucket privado.
--
-- Base legal: LGPD art. 46 (medidas de segurança) e art. 6º, VII.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Remove as policies de leitura pública ──────────────────────────────
drop policy if exists "Public read entregas-docs"          on storage.objects;
drop policy if exists "Public read financeiro-docs"        on storage.objects;
drop policy if exists "contratos_docs_public_select"       on storage.objects;
drop policy if exists "contratos_docs_read"                on storage.objects;
drop policy if exists "produtos_evid_public_read"          on storage.objects;
drop policy if exists "viagens_arquivos_select"            on storage.objects;
drop policy if exists "tdrs_arquivos_viagens_public_select" on storage.objects;

-- ── 2. Leitura restrita a autenticados ────────────────────────────────────
-- Necessária para que createSignedUrl() funcione: assinar exige SELECT.
create policy "entregas_docs_auth_select" on storage.objects
  for select to authenticated using (bucket_id = 'entregas-docs');

create policy "financeiro_docs_auth_select" on storage.objects
  for select to authenticated using (bucket_id = 'financeiro-docs');

create policy "contratos_docs_auth_select" on storage.objects
  for select to authenticated using (bucket_id = 'contratos-docs');

create policy "produtos_evid_auth_select" on storage.objects
  for select to authenticated using (bucket_id = 'produtos-evidencias');

create policy "viagens_arquivos_auth_select" on storage.objects
  for select to authenticated using (bucket_id = 'viagens-arquivos');

-- ── 3. Fecha os buckets ───────────────────────────────────────────────────
update storage.buckets
   set public = false
 where id in ('tdrs-arquivos','contratos-docs','financeiro-docs',
              'entregas-docs','viagens-arquivos','produtos-evidencias');
