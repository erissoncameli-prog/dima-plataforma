-- ════════════════════════════════════════════════════════════════════════
-- Bucket contratos-docs — acesso por contrato (parte 1: função auxiliar)
--
-- Antes: qualquer usuário logado lia, enviava, substituía e removia qualquer
-- arquivo do bucket (policies só com bucket_id). A parte 2 (policies) está em
-- 20261012_contratos_docs_storage_sql_editor.sql, porque troca policies
-- existentes (o apply_migration não aceita esse texto).
--
-- Caminhos do bucket: contratos/<contrato_id>/… (PDF EN/PT) e
-- encerramentos/<contrato_id>/… (termo de encerramento).
-- ════════════════════════════════════════════════════════════════════════

-- id do contrato a partir do caminho do arquivo (NULL se fora do padrão)
create or replace function public.fn_contrato_id_do_path(p_name text)
returns uuid language sql immutable set search_path to 'public' as $$
  select case
    when split_part(p_name, '/', 1) in ('contratos', 'encerramentos')
     and split_part(p_name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(p_name, '/', 2)::uuid
  end
$$;
revoke all on function public.fn_contrato_id_do_path(text) from public, anon;
grant execute on function public.fn_contrato_id_do_path(text) to authenticated;
