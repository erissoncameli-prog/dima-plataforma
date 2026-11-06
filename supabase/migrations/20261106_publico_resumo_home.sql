-- ═══════════════════════════════════════════════════════════════════════
-- SITE PÚBLICO — números da página inicial (fn_publico_resumo_home)
-- ═══════════════════════════════════════════════════════════════════════
-- Alimenta site-publico/index.html (TdR 3.2). Pela especificação do Produto 1,
-- só recombina o que as funções públicas já liberam — fn_publico_operacional,
-- fn_publico_resultados, fn_publico_financeiro_agregado, fn_publico_galeria_produtos
-- e fn_publico_linha_tempo —, sem ler tabela nenhuma: o que não pode sair por
-- elas não sai por aqui. Uma chamada só em vez de várias na abertura do site.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_publico_resumo_home()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with op  as (select public.fn_publico_operacional() as d),
       fin as (select public.fn_publico_financeiro_agregado() as d),
       mz  as (select avg(least(coalesce(r.pct_confirmado, 0), 100)) as media,
                      count(*) filter (where coalesce(r.pct_confirmado, 0) > 0) as com_avanco,
                      count(*) as total
               from public.fn_publico_resultados() r),
       mzm as (select avg(least(coalesce(r.pct_confirmado, 0), 100)) as media
               from public.fn_publico_resultados() r where coalesce(r.meta_numerica, 0) > 0)
  select jsonb_build_object(
    'atividades_ativas',     op.d->'atividades_ativas',
    'tdrs_aprovados',        op.d->'tdrs_aprovados',
    'tdrs_total',            op.d->'tdrs_total',
    'produtos_entregues',    op.d->'produtos_entregues',
    'pontos_mapa',           op.d->'pontos_mapa',
    'pct_executado',         fin.d->'total'->'pct_executado',
    'metas_progresso_medio', round(coalesce(mzm.media, 0), 1),
    'indicadores_com_avanco', mz.com_avanco,
    'indicadores_total',     mz.total,
    'produtos_publicados',   jsonb_array_length(public.fn_publico_galeria_produtos()),
    'marcos_publicados',     jsonb_array_length(public.fn_publico_linha_tempo()->'eventos'),
    'atualizado_em',         fin.d->'atualizado_em'
  )
  from op, fin, mz, mzm
$function$;

revoke all on function public.fn_publico_resumo_home() from public;
grant execute on function public.fn_publico_resumo_home() to anon, authenticated, service_role;
