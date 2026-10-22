-- Execução direta de viagens ligada ao TDR (atividade 2.1.7 e qualquer outra com TDR de execução direta).
--
-- Antes: o lançamento de viagem (execucao_financeira, 1 por viajante = passagens + diárias) nascia sem tdr_id,
-- e os relatórios que procuram gasto por TDR/contrato não o achavam.
--   1. fn_viagem_tdr(atividade): o TDR de execução direta não cancelado da atividade (só se houver exatamente um).
--   2. trg_viagem_lanc_tdr: quando o viajante ganha lancamento_id (gatilho fn_financeiro_viajante ou a tela de
--      Viagens), grava o tdr_id no lançamento. Não mexe em lançamento de contrato nem em tdr_id já preenchido.
--   3. Preenche os lançamentos de viagem existentes.
--   4. vw_viagens_execucao: 1 linha por viajante, com passagens e diárias separadas (R$ pelos trechos/diárias;
--      US$ = câmbio UNESCO do pagamento ou, sem ele, o estimado do lançamento, dividido na proporção do R$).
--      Só leitura, security_invoker (vale a RLS de viagens e do financeiro).

create or replace function public.fn_viagem_tdr(p_atividade uuid)
 returns uuid
 language sql
 stable
 set search_path to 'public'
as $function$
  select case when count(*) = 1 then (array_agg(t.id))[1] end
    from public.tdrs t
   where t.atividade_id = p_atividade and t.execucao_direta and t.status <> 'cancelado'
$function$;

revoke all on function public.fn_viagem_tdr(uuid) from public, anon;
grant execute on function public.fn_viagem_tdr(uuid) to authenticated;

create or replace function public.fn_trg_viagem_lanc_tdr()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_ativ uuid;
begin
  if new.lancamento_id is null then return null; end if;
  select p.atividade_id into v_ativ from public.viagem_protocolos p where p.id = new.protocolo_id;
  update public.execucao_financeira ef
     set tdr_id = public.fn_viagem_tdr(v_ativ)
   where ef.id = new.lancamento_id and ef.tdr_id is null and ef.contrato_id is null
     and public.fn_viagem_tdr(v_ativ) is not null;
  return null;
end $function$;

revoke all on function public.fn_trg_viagem_lanc_tdr() from public, anon, authenticated;

create or replace trigger trg_viagem_lanc_tdr_ins
  after insert on public.viagem_viajantes
  for each row when (new.lancamento_id is not null)
  execute function public.fn_trg_viagem_lanc_tdr();

create or replace trigger trg_viagem_lanc_tdr_upd
  after update on public.viagem_viajantes
  for each row when (new.lancamento_id is distinct from old.lancamento_id)
  execute function public.fn_trg_viagem_lanc_tdr();

-- lançamentos de viagem já existentes
update public.execucao_financeira ef
   set tdr_id = public.fn_viagem_tdr(p.atividade_id)
  from public.viagem_viajantes vv
  join public.viagem_protocolos p on p.id = vv.protocolo_id
 where vv.lancamento_id = ef.id
   and ef.tdr_id is null and ef.contrato_id is null
   and public.fn_viagem_tdr(p.atividade_id) is not null;

create or replace view public.vw_viagens_execucao
with (security_invoker = true) as
select vv.id                      as viajante_id,
       vv.nome                    as viajante,
       vv.beneficiario_id,
       p.id                       as protocolo_id,
       p.numero                   as protocolo,
       p.situacao                 as protocolo_situacao,
       p.dt_saida,
       p.dt_retorno,
       p.destino_principal,
       p.atividade_id,
       a.codigo                   as atividade_codigo,
       coalesce(ef.tdr_id, public.fn_viagem_tdr(p.atividade_id)) as tdr_id,
       t.numero                   as tdr_numero,
       pas.brl                    as passagens_brl,
       dia.brl                    as diarias_brl,
       pas.brl + dia.brl          as total_brl,
       ef.id                      as lancamento_id,
       ef.situacao                as lancamento_situacao,
       ef.dt_vencimento,
       ef.dt_pagamento,
       ef.valor_brl               as lancamento_brl,
       ef.cotacao_unesco,
       coalesce(ef.valor_usd_unesco, ef.valor_usd)            as usd,
       (ef.id is not null and ef.valor_usd_unesco is null)    as usd_estimado,
       round(coalesce(ef.valor_usd_unesco, ef.valor_usd) * pas.brl / nullif(pas.brl + dia.brl, 0), 2) as passagens_usd,
       coalesce(ef.valor_usd_unesco, ef.valor_usd)
         - round(coalesce(ef.valor_usd_unesco, ef.valor_usd) * pas.brl / nullif(pas.brl + dia.brl, 0), 2) as diarias_usd
  from public.viagem_viajantes vv
  join public.viagem_protocolos p on p.id = vv.protocolo_id
  left join public.atividades a on a.id = p.atividade_id
  left join public.execucao_financeira ef on ef.id = vv.lancamento_id
  left join public.tdrs t on t.id = coalesce(ef.tdr_id, public.fn_viagem_tdr(p.atividade_id))
  left join lateral (select coalesce(sum(x.valor), 0)::numeric(14,2) as brl
                       from public.viagem_trechos x where x.viajante_id = vv.id) pas on true
  left join lateral (select coalesce(sum(x.quantidade * x.valor_unitario), 0)::numeric(14,2) as brl
                       from public.viagem_diarias_v2 x where x.viajante_id = vv.id) dia on true;

revoke all on public.vw_viagens_execucao from public, anon, authenticated;
grant select on public.vw_viagens_execucao to authenticated;
