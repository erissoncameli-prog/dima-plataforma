-- ═══════════════════════════════════════════════════════════════════════
-- ACERVO — policies do bucket acervo-capas (colar no SQL Editor na Cloud)
-- ═══════════════════════════════════════════════════════════════════════
-- Complemento de 20261106_acervo_capas_gravacao.sql (rodar depois dela).
-- Antes: qualquer logado enviava/trocava qualquer arquivo do bucket.
-- Agora: só o arquivo da capa vigente de uma obra que a pessoa enxerga, e capa
-- de produto liberado no portal público só o super_admin troca
-- (fn_acervo_capa_objeto_pode_gravar). Leitura segue para todo logado (o
-- Acervo mostra as capas por URL assinada).
-- ═══════════════════════════════════════════════════════════════════════

alter policy acervo_capas_auth_insert on storage.objects
  to authenticated
  with check (bucket_id = 'acervo-capas' and public.fn_acervo_capa_objeto_pode_gravar(name));

alter policy acervo_capas_auth_update on storage.objects
  to authenticated
  using (bucket_id = 'acervo-capas' and public.fn_acervo_capa_objeto_pode_gravar(name))
  with check (bucket_id = 'acervo-capas' and public.fn_acervo_capa_objeto_pode_gravar(name));
