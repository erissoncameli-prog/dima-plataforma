-- Indicadores do site público (site-publico/index.html e pages/publico.html).
--
-- tdrs_aprovados contava só status = 'aprovado'; em_licitacao e contratado são
-- fases pós-aprovação e ficavam de fora (o site mostrava 10/62 com 40/63 no banco).
--
-- Novos campos:
--   atividades_ativas   — atividades com ativo = true
--   produtos_entregues  — produtos de contrato com entrega aprovada, pela mesma
--                         regra do Acervo (vw_acervo_obras.situacao_acervo)
--   pontos_mapa         — o que o mapa público desenha (fn_publico_mapa)
-- produtos_total (tabela produtos_entregues) fica por compatibilidade.
-- Só contagens: nenhum dado pessoal sai daqui.

create or replace function public.fn_publico_operacional()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'atividades_total',
      (select count(*)::int from atividades),
    'atividades_ativas',
      (select count(*)::int from atividades where ativo),
    'atividades_por_fase',
      coalesce((
        select jsonb_object_agg(fase::text, cnt)
        from (select fase::text, count(*)::int as cnt from atividades group by fase) t
      ), '{}'::jsonb),
    'tdrs_total',
      (select count(*)::int from tdrs where status::text != 'cancelado'),
    'tdrs_aprovados',
      (select count(*)::int from tdrs
        where status::text in ('aprovado', 'em_licitacao', 'contratado')),
    'tdrs_por_status',
      coalesce((
        select jsonb_object_agg(status::text, cnt)
        from (
          select status::text, count(*)::int as cnt
          from tdrs where status::text != 'cancelado'
          group by status
        ) t
      ), '{}'::jsonb),
    'produtos_entregues',
      (select count(*)::int from vw_acervo_obras where situacao_acervo = 'aprovado'),
    'produtos_total',
      (select count(*)::int from produtos_entregues),
    'pontos_mapa',
      (select count(*)::int from fn_publico_mapa()),
    'indicadores_total',
      (select count(*)::int from indicadores where ativo = true),
    'indicadores_com_progresso',
      (select count(*)::int from indicadores
       where ativo = true and coalesce(valor_atingido, 0) > 0)
  )
$function$;
