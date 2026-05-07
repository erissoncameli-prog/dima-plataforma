-- ─────────────────────────────────────────────────────────────────────────────
-- DIMA UNESCO · Monitoramento do Banco de Dados
-- Função SECURITY DEFINER: retorna apenas metadados (tamanhos, contagens)
-- Nunca retorna conteúdo de dados reais — seguro para exibir na UI de super_admin
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_monitoramento_banco()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_catalog
AS $$
DECLARE
  v_db_size       bigint;
  v_tabelas       jsonb;
  v_storage       jsonb;
  v_caller_perfil text;
BEGIN
  -- Verificação de segurança: apenas super_admin pode chamar esta função
  SELECT perfil INTO v_caller_perfil
  FROM public.usuarios
  WHERE id = auth.uid();

  IF v_caller_perfil IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode consultar métricas do banco';
  END IF;

  -- 1. Tamanho total do banco PostgreSQL
  SELECT pg_database_size(current_database()) INTO v_db_size;

  -- 2. Tamanho e estimativa de linhas por tabela (schema public)
  --    Usa pg_stat_user_tables (catálogo) — nunca expõe dados, apenas metadados
  SELECT jsonb_agg(
    jsonb_build_object(
      'tabela',        relname,
      'linhas',        COALESCE(n_live_tup, 0),
      'tamanho_bytes', pg_total_relation_size(oid)
    ) ORDER BY pg_total_relation_size(oid) DESC
  )
  INTO v_tabelas
  FROM pg_stat_user_tables
  WHERE schemaname = 'public';

  -- 3. Storage por bucket: apenas agregados (COUNT + SUM de tamanho)
  --    Nenhum path ou nome de arquivo é retornado
  BEGIN
    SELECT jsonb_agg(
      jsonb_build_object(
        'bucket_id',      bucket_id,
        'total_arquivos', COUNT(*),
        'tamanho_bytes',  COALESCE(SUM((metadata->>'size')::bigint), 0)
      ) ORDER BY SUM((metadata->>'size')::bigint) DESC NULLS LAST
    )
    INTO v_storage
    FROM storage.objects
    WHERE bucket_id IS NOT NULL
    GROUP BY bucket_id;
  EXCEPTION WHEN OTHERS THEN
    -- Se storage não acessível (permissão ou schema ausente), retorna vazio
    v_storage := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'db_size_bytes',   v_db_size,
    'tabelas',         COALESCE(v_tabelas,  '[]'::jsonb),
    'storage_buckets', COALESCE(v_storage,  '[]'::jsonb),
    'consultado_em',   now()
  );
END;
$$;

-- Revogar acesso público e conceder apenas a usuários autenticados
REVOKE ALL ON FUNCTION get_monitoramento_banco() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_monitoramento_banco() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRAÇÃO PARA PLANO PRO (quando necessário)
-- Nenhuma alteração nesta função é necessária ao mudar de plano.
-- Os limites do plano são gerenciados no frontend em js/configuracoes.html:
--   const PLANOS = { free: {...}, pro: {...} }
--   let planoAtual = 'free';   → alterar para 'pro' na migração
-- ─────────────────────────────────────────────────────────────────────────────
