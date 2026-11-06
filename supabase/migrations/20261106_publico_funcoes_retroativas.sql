-- ═══════════════════════════════════════════════════════════════════════
-- SITE PÚBLICO — migração retroativa das funções públicas já existentes
-- ═══════════════════════════════════════════════════════════════════════
-- fn_publico_resultados, fn_publico_mapa, fn_publico_camadas e
-- fn_publico_tipos_mapa foram criadas antes do início do histórico em
-- supabase/migrations/ e nunca tiveram migração. Este arquivo registra a
-- definição que está em produção (extraída com pg_get_functiondef do
-- retrato de 05/11/2026), sem mudar comportamento nem permissões, para que
-- qualquer alteração futura parta de uma versão versionada.
-- fn_publico_operacional já é versionada (20261009_publico_operacional_kpis).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_publico_resultados()
 RETURNS TABLE(id uuid, resultado integer, produto_codigo text, produto_titulo text, indicador text, meta_numerica numeric, meta_descricao text, unidade text, ods text[], metas_km text[], realizado_confirmado numeric, realizado_pendente numeric, realizado_total numeric, pct_confirmado numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    mi.id,
    mi.resultado,
    mi.produto_codigo,
    mi.produto_titulo,
    mi.indicador,
    mi.meta_numerica,
    mi.meta_descricao,
    mi.unidade,
    mi.ods,
    mi.metas_km,
    COALESCE(SUM(CASE WHEN pmc.status = 'confirmado' THEN pmc.valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pmc.status = 'pendente'   THEN pmc.valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pmc.status IN ('confirmado','pendente') THEN pmc.valor ELSE 0 END), 0),
    CASE
      WHEN mi.meta_numerica > 0 THEN
        ROUND(
          COALESCE(SUM(CASE WHEN pmc.status = 'confirmado' THEN pmc.valor ELSE 0 END), 0)
          / mi.meta_numerica * 100, 1
        )
      ELSE NULL
    END
  FROM matriz_itens mi
  LEFT JOIN produto_matriz_contribuicao pmc
    ON pmc.matriz_item_id = mi.id
    AND pmc.status != 'cancelado'
    AND EXISTS (
      SELECT 1 FROM contratos_produtos_entregas cpe
      WHERE cpe.id = pmc.produto_id AND cpe.situacao = 'aprovada'
    )
  WHERE mi.ativo = true
  GROUP BY mi.id, mi.resultado, mi.produto_codigo, mi.produto_titulo,
           mi.indicador, mi.meta_numerica, mi.meta_descricao, mi.unidade,
           mi.ods, mi.metas_km, mi.ordem
  ORDER BY mi.resultado, mi.ordem
$function$

;

CREATE OR REPLACE FUNCTION public.fn_publico_mapa()
 RETURNS TABLE(id uuid, nome_local text, apa text, tipo_atividade text, data_implantacao date, lat double precision, lng double precision, foto_url text, status text, observacao text, geometry_type text, geometry_group text, geometry_order integer, ponto_especial text, video_url text, fotos jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.nome_local,
    p.apa,
    p.tipo_atividade,
    p.data_implantacao,
    p.lat,
    p.lng,
    p.foto_url,
    p.status,
    p.observacao,
    p.geometry_type,
    p.geometry_group,
    p.geometry_order,
    p.ponto_especial,
    p.video_url,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('foto_url', f.foto_url, 'ordem', f.ordem)
               ORDER BY f.ordem)
      FROM geometria_fotos f
      WHERE f.geometry_group = p.geometry_group
        AND f.geometry_type  = p.geometry_type
        AND p.geometry_group IS NOT NULL
    ), '[]'::jsonb)
  FROM produto_pontos_mapa p
  ORDER BY p.criado_em DESC
$function$

;

CREATE OR REPLACE FUNCTION public.fn_publico_camadas()
 RETURNS TABLE(id uuid, nome text, apa_key text, cor text, geojson jsonb, visivel boolean, feature_colors jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, nome, apa_key, cor, geojson, visivel, COALESCE(feature_colors, '{}'::jsonb)
  FROM apa_demarcacoes
  ORDER BY created_at;
$function$

;

CREATE OR REPLACE FUNCTION public.fn_publico_tipos_mapa()
 RETURNS TABLE(produto_titulo text, cor text, emoji text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (produto_titulo)
    produto_titulo,
    cor,
    emoji
  FROM matriz_itens
  WHERE produto_titulo IS NOT NULL
    AND visivel_no_mapa = true
  ORDER BY produto_titulo;
$function$

;

grant execute on function public.fn_publico_resultados() to anon, authenticated, service_role;
grant execute on function public.fn_publico_mapa()       to anon, authenticated, service_role;
grant execute on function public.fn_publico_camadas()    to anon, authenticated, service_role;
grant execute on function public.fn_publico_tipos_mapa() to anon, authenticated, service_role;
