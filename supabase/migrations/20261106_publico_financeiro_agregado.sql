-- ═══════════════════════════════════════════════════════════════════════
-- SITE PÚBLICO — Transparência Financeira (fn_publico_financeiro_agregado)
-- ═══════════════════════════════════════════════════════════════════════
-- Alimenta site-publico/transparencia-financeira.html (TdR 3.2/3.3), que
-- reproduz as guias Financiadores e Resultados × Financeiro da Visão Geral
-- (pedido da coordenação, pauta do Produto 3).
--
-- Regras (política de privacidade do Produto 1 + decisões da coordenação):
--   • valores em US$ só no TOTAL do Programa e por RESULTADO: orçamento,
--     comprometido em TDR, a pagar, pago e livre — os mesmos estágios da
--     Visão Geral;
--   • atividade aparece só em destaque e só com PERCENTUAL (pago ÷ orçamento
--     da atividade), nunca valor: a atividade com um único contrato não
--     revela o valor do contrato;
--   • nunca contrato, fornecedor, nota fiscal, TDR individual ou pessoa;
--   • "dados atualizados em": último registro em execucao_financeira;
--   • reais (decisão da coordenação): pago e a pagar em R$ são os valores
--     LANÇADOS (execucao_financeira.valor_brl) — o pago em US$ já é o da
--     cotação UNESCO do dia do pagamento (valor_usd = valor_usd_unesco quando
--     existe). Orçamento, reservado em TDR e livre só existem em US$: a
--     página converte pela última PTAX de venda gravada (cotacoes_ptax),
--     devolvida aqui com a data. Leitura direta da tabela,
--     não fn_cotacao_usd: aquela dá erro com a PTAX parada há mais de 7 dias
--     e derrubaria a página pública; aqui a data da cotação vai junto.
--
-- Fonte: vw_saldo_atividade (a mesma da Visão Geral), em USD. Estágios como
-- no painel (renderFinanciadores): comprometido_tdr = comprometido − pago −
-- a pagar (piso 0); livre = orçamento − comprometido (piso 0).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_publico_financeiro_agregado()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ativ as (
    select a.resultado_id, a.codigo, a.nome_pt, a.nome_en, a.nome_es,
           s.orcamento_usd, s.comprometido_usd, s.pago_usd, s.a_pagar_usd,
           coalesce(b.pago_brl, 0) as pago_brl, coalesce(b.apagar_brl, 0) as apagar_brl
    from atividades a
    join vw_saldo_atividade s on s.id = a.id
    left join lateral (
      select sum(ef.valor_brl) filter (where ef.situacao = 'pago')    as pago_brl,
             sum(ef.valor_brl) filter (where ef.situacao = 'a_pagar') as apagar_brl
      from execucao_financeira ef where ef.atividade_id = a.id
    ) b on true
    where a.ativo
  ),
  res as (
    select r.id, r.codigo, r.nome_pt, r.nome_en, r.nome_es,
           coalesce(sum(t.orcamento_usd), 0)    as orc,
           coalesce(sum(t.comprometido_usd), 0) as comp,
           coalesce(sum(t.pago_usd), 0)         as pago,
           coalesce(sum(t.a_pagar_usd), 0)      as apagar,
           coalesce(sum(t.pago_brl), 0)         as pago_brl,
           coalesce(sum(t.apagar_brl), 0)       as apagar_brl
    from resultados r
    left join ativ t on t.resultado_id = r.id
    where r.ativo
    group by r.id
  ),
  tot as (
    select sum(orc) as orc, sum(comp) as comp, sum(pago) as pago, sum(apagar) as apagar,
           sum(pago_brl) as pago_brl, sum(apagar_brl) as apagar_brl from res
  )
  select jsonb_build_object(
    'atualizado_em', (select max(atualizado_em) from execucao_financeira),
    'cotacao', (select jsonb_build_object('data', c.data, 'ptax_venda', c.ptax_venda)
                from cotacoes_ptax c where c.data <= current_date order by c.data desc limit 1),
    'total', (
      select jsonb_build_object(
               'orcamento_usd',        round(orc, 2),
               'pago_usd',             round(pago, 2),
               'a_pagar_usd',          round(apagar, 2),
               'pago_brl',             round(pago_brl, 2),
               'a_pagar_brl',          round(apagar_brl, 2),
               'comprometido_tdr_usd', round(greatest(comp - pago - apagar, 0), 2),
               'livre_usd',            round(greatest(orc - comp, 0), 2),
               'pct_executado',        case when orc > 0 then round(pago / orc * 100, 1) else 0 end,
               'pct_comprometido',     case when orc > 0 then round(comp / orc * 100, 1) else 0 end,
               'pct_a_pagar',          case when orc > 0 then round(apagar / orc * 100, 1) else 0 end)
      from tot),
    'resultados', coalesce((
      select jsonb_agg(jsonb_build_object(
               'codigo',               x.codigo,
               'nome_pt',              x.nome_pt,
               'nome_en',              x.nome_en,
               'nome_es',              x.nome_es,
               'orcamento_usd',        round(x.orc, 2),
               'pago_usd',             round(x.pago, 2),
               'a_pagar_usd',          round(x.apagar, 2),
               'pago_brl',             round(x.pago_brl, 2),
               'a_pagar_brl',          round(x.apagar_brl, 2),
               'comprometido_tdr_usd', round(greatest(x.comp - x.pago - x.apagar, 0), 2),
               'livre_usd',            round(greatest(x.orc - x.comp, 0), 2),
               'pct_executado',        case when x.orc > 0 then round(x.pago / x.orc * 100, 1) else 0 end,
               'pct_comprometido',     case when x.orc > 0 then round(x.comp / x.orc * 100, 1) else 0 end,
               'tem_execucao',         x.pago > 0,
               'destaques', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'codigo',        d.codigo,
                          'nome_pt',       d.nome_pt,
                          'nome_en',       d.nome_en,
                          'nome_es',       d.nome_es,
                          'pct_executado', round(d.pago_usd / d.orcamento_usd * 100, 1)
                        ) order by d.pago_usd desc)
                 from (select * from ativ t
                       where t.resultado_id = x.id and t.pago_usd > 0 and t.orcamento_usd > 0
                       order by t.pago_usd desc limit 3) d
               ), '[]'::jsonb)
             ) order by x.codigo)
      from res x
    ), '[]'::jsonb)
  )
$function$;

revoke all on function public.fn_publico_financeiro_agregado() from public;
grant execute on function public.fn_publico_financeiro_agregado() to anon, authenticated, service_role;
