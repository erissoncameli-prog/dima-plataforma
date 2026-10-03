-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · rem_08 — o painel desconta o contrato acima do TDR
--
-- vw_saldo_atividade (Visão Geral, atividades, viagens) só olhava os TDRs e
-- mostrava como livre o excedente de contrato sobre o TDR que o razão (fase 5)
-- já debita. Agora:
--   comprometido_usd = Σ TDRs não cancelados + excedente de contrato
--   saldo_livre_usd  = orçamento − comprometido + liberado      (fórmula igual)
--   excedente_contrato_usd (coluna nova, no fim) = Σ contrato_coberturas.delta_usd
-- pct_comprometido e status_saldo seguem o novo comprometido. Mesmas colunas e
-- ordem (create or replace); o join lateral também deixa a view NÃO
-- auto-atualizável (reforça o rem_00). Grants inalterados (SELECT authenticated).
-- fn_conferir_orcamento: a diferença painel × razão deixa de incluir o excedente.
-- ════════════════════════════════════════════════════════════════════════

create or replace view public.vw_saldo_atividade as
select a.id, a.codigo, a.nome_pt, a.orcamento_usd,
       (x.tdrs + x.exc)                                     as comprometido_usd,
       x.pago                                               as pago_usd,
       x.apagar                                             as a_pagar_usd,
       x.n_tdrs                                             as tdrs_count,
       (a.orcamento_usd - (x.tdrs + x.exc) + x.lib)         as saldo_livre_usd,
       (a.orcamento_usd - x.pago - x.apagar)                as saldo_disponivel_usd,
       case when a.orcamento_usd > 0 then round((x.tdrs + x.exc - x.lib) / a.orcamento_usd * 100, 1) else 0 end as pct_comprometido,
       case when a.orcamento_usd > 0 then round(x.pago / a.orcamento_usd * 100, 1) else 0 end                   as pct_pago,
       case when a.orcamento_usd > 0 then round(x.apagar / a.orcamento_usd * 100, 1) else 0 end                 as pct_a_pagar,
       case when a.orcamento_usd = 0 then 'sem_orcamento'
            when x.tdrs + x.exc - x.lib >  a.orcamento_usd        then 'extrapolado'
            when x.tdrs + x.exc - x.lib >= a.orcamento_usd * 0.95 then 'critico'
            when x.tdrs + x.exc - x.lib >= a.orcamento_usd * 0.75 then 'atencao'
            else 'ok' end                                   as status_saldo,
       x.lib                                                as liberado_usd,
       x.exc                                                as excedente_contrato_usd
  from public.atividades a
  cross join lateral (
    select coalesce((select sum(t.valor_usd) from public.tdrs t
                      where t.atividade_id = a.id and t.status <> 'cancelado'), 0::numeric)              as tdrs,
           coalesce((select count(*) from public.tdrs t
                      where t.atividade_id = a.id and t.status <> 'cancelado'), 0::bigint)               as n_tdrs,
           coalesce((select sum(ef.valor_usd) from public.execucao_financeira ef
                      where ef.atividade_id = a.id and ef.situacao = 'pago'), 0::numeric)                as pago,
           coalesce((select sum(ef.valor_usd) from public.execucao_financeira ef
                      where ef.atividade_id = a.id and ef.situacao = 'a_pagar'), 0::numeric)             as apagar,
           coalesce((select sum(ce.valor_liberado_usd) from public.contrato_encerramentos ce
                      where ce.atividade_id = a.id and ce.status = 'ativo'), 0::numeric)                 as lib,
           coalesce((select sum(cc.delta_usd) from public.contrato_coberturas cc
                      where cc.atividade_id = a.id), 0::numeric)                                         as exc
  ) x;
comment on view public.vw_saldo_atividade is
  'Saldo do painel: comprometido = TDRs + contrato acima do TDR (contrato_coberturas); '
  'saldo_livre = orçamento − comprometido + liberado. Somente leitura (rem_00/rem_08).';

-- grants: só leitura (a view já não é auto-atualizável, mas não reabrir escrita)
revoke insert, update, truncate, references, trigger on public.vw_saldo_atividade from authenticated, anon, public;
grant select on public.vw_saldo_atividade to authenticated;

-- Conferência: painel − razão agora só pode vir de execução direta acima da
-- reserva ou de pagamento de contrato sem TDR (o excedente está nos dois lados).
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.fn_conferir_orcamento()'::regprocedure);
  n := replace(d, '+ o.pagamentos_contrato_sem_tdr_usd + o.contratos_excedente_usd', '+ o.pagamentos_contrato_sem_tdr_usd');
  if n <> d then execute n; end if;
end $do$;

notify pgrst, 'reload schema';
