-- Limite do TDR de execução direta (viagens: passagens e diárias pagas pela UNESCO).
--
--   vw_tdr_execucao_direta: por TDR de execução direta não cancelado, planejado × consumido (Σ valor_usd dos
--     lançamentos não cancelados com o tdr_id, mesma medida do razão) × resta. Só agregados, só leitura.
--   trg_ef_limite_tdr_direta (BEFORE em execucao_financeira): recusa (TDR_EXECUCAO_DIRETA_ESGOTADO) lançamento que
--     passa a consumir o TDR além do planejado — lançamento novo/ligado ao TDR, reativado ou com R$ aumentado.
--     Só vale para lançamento a pagar: efetivar o pagamento ou corrigir lançamento pago nunca é recusado.
--     Na aprovação do protocolo, o lançamento ganha o TDR no trg_viagem_lanc_tdr_* e o erro desfaz a aprovação inteira.
--   trg_ef_aviso_tdr_direta (AFTER): ao cruzar 80% e 95%, avisa no sino (tipo tdr_execucao_direta_alerta)
--     super_admin, coordenação, financeiro e responsáveis/substitutos ativos da atividade — 1 vez por faixa e valor do TDR.
--     O tipo entra no check de notificacoes pelo _sql_editor.sql desta migração; sem ele só o sino fica mudo.

create or replace view public.vw_tdr_execucao_direta as
select t.id                as tdr_id,
       t.numero            as tdr_numero,
       t.objeto_pt,
       t.atividade_id,
       a.codigo            as atividade_codigo,
       coalesce(t.valor_usd, 0)::numeric(14,2)  as planejado_usd,
       coalesce(t.valor_brl, 0)::numeric(14,2)  as planejado_brl,
       coalesce(c.consumido_usd, 0)::numeric(14,2) as consumido_usd,
       coalesce(c.pago_usd, 0)::numeric(14,2)      as pago_usd,
       coalesce(c.a_pagar_usd, 0)::numeric(14,2)   as a_pagar_usd,
       coalesce(c.consumido_brl, 0)::numeric(14,2) as consumido_brl,
       (coalesce(t.valor_usd, 0) - coalesce(c.consumido_usd, 0))::numeric(14,2) as resta_usd,
       round(coalesce(c.consumido_usd, 0) / nullif(t.valor_usd, 0) * 100, 1)   as pct_consumido
  from public.tdrs t
  join public.atividades a on a.id = t.atividade_id
  left join lateral (
    select sum(ef.valor_usd) as consumido_usd,
           sum(ef.valor_usd) filter (where ef.situacao = 'pago')    as pago_usd,
           sum(ef.valor_usd) filter (where ef.situacao = 'a_pagar') as a_pagar_usd,
           sum(ef.valor_brl) as consumido_brl
      from public.execucao_financeira ef
     where ef.tdr_id = t.id and ef.contrato_id is null and ef.situacao <> 'cancelado') c on true
 where t.execucao_direta and t.status <> 'cancelado';

revoke all on public.vw_tdr_execucao_direta from public, anon, authenticated;
grant select on public.vw_tdr_execucao_direta to authenticated;

-- consumo do TDR fora o próprio lançamento
create or replace function public.fn_tdr_direta_consumo_outros(p_tdr uuid, p_lanc uuid)
 returns numeric
 language sql
 stable
 set search_path to 'public'
as $function$
  select coalesce(sum(ef.valor_usd), 0)
    from public.execucao_financeira ef
   where ef.tdr_id = p_tdr and ef.contrato_id is null and ef.situacao <> 'cancelado'
     and ef.id is distinct from p_lanc
$function$;

revoke all on function public.fn_tdr_direta_consumo_outros(uuid, uuid) from public, anon, authenticated;

create or replace function public.fn_trg_ef_limite_tdr_direta()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_tdr record; v_outros numeric; v_aumenta boolean;
begin
  -- só o que ainda vai ser pago: efetivar pagamento ou corrigir lançamento pago nunca é recusado
  if new.tdr_id is null or new.contrato_id is not null or new.situacao <> 'a_pagar' then return new; end if;

  if tg_op = 'INSERT' then
    v_aumenta := true;
  else
    v_aumenta := old.tdr_id is distinct from new.tdr_id
              or old.situacao = 'cancelado'
              or coalesce(new.valor_brl, 0) > coalesce(old.valor_brl, 0);
  end if;
  if not v_aumenta then return new; end if;

  select t.id, t.numero, t.valor_usd into v_tdr
    from public.tdrs t
   where t.id = new.tdr_id and t.execucao_direta and t.status <> 'cancelado'
     for update;
  if not found then return new; end if;

  v_outros := public.fn_tdr_direta_consumo_outros(v_tdr.id, new.id);
  if v_outros + coalesce(new.valor_usd, 0) > coalesce(v_tdr.valor_usd, 0) + 0.005 then
    raise exception 'TDR_EXECUCAO_DIRETA_ESGOTADO: o TDR % tem US$ % disponível e este lançamento precisa de US$ % (R$ %). '
                    'Peça o aumento do TDR (remanejamento) antes de aprovar.',
      v_tdr.numero,
      translate(to_char(greatest(0, coalesce(v_tdr.valor_usd, 0) - v_outros), 'FM999,999,990.00'), ',.', '.,'),
      translate(to_char(coalesce(new.valor_usd, 0), 'FM999,999,990.00'), ',.', '.,'),
      translate(to_char(coalesce(new.valor_brl, 0), 'FM999,999,990.00'), ',.', '.,');
  end if;
  return new;
end $function$;

revoke all on function public.fn_trg_ef_limite_tdr_direta() from public, anon, authenticated;

create or replace trigger trg_ef_limite_tdr_direta
  before insert or update on public.execucao_financeira
  for each row execute function public.fn_trg_ef_limite_tdr_direta();

create or replace function public.fn_trg_ef_aviso_tdr_direta()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tdr record; v_antes numeric; v_depois numeric; v_faixa int; v_titulo text; v_msg text;
begin
  if new.tdr_id is null or new.contrato_id is not null then return null; end if;

  select t.id, t.numero, t.valor_usd, t.atividade_id into v_tdr
    from public.tdrs t
   where t.id = new.tdr_id and t.execucao_direta and t.status <> 'cancelado';
  if not found or coalesce(v_tdr.valor_usd, 0) <= 0 then return null; end if;

  v_depois := public.fn_tdr_direta_consumo_outros(v_tdr.id, null);
  v_antes  := public.fn_tdr_direta_consumo_outros(v_tdr.id, new.id);
  if tg_op = 'UPDATE' then
    if old.tdr_id is not distinct from new.tdr_id and old.situacao <> 'cancelado' then
      v_antes := v_antes + coalesce(old.valor_usd, 0);
    end if;
  end if;

  v_faixa := case when v_depois >= v_tdr.valor_usd * 0.95 and v_antes < v_tdr.valor_usd * 0.95 then 95
                  when v_depois >= v_tdr.valor_usd * 0.80 and v_antes < v_tdr.valor_usd * 0.80 then 80 end;
  if v_faixa is null then return null; end if;

  v_titulo := 'TDR ' || v_tdr.numero || ' chegou a ' || v_faixa || '% (US$ '
           || translate(to_char(v_tdr.valor_usd, 'FM999,999,990.00'), ',.', '.,') || ')';
  if exists (select 1 from public.notificacoes n
              where n.entidade_tipo = 'tdr' and n.entidade_id = v_tdr.id and n.titulo = v_titulo) then
    return null;
  end if;
  v_msg := 'Viagens (execução direta) já consomem US$ ' || translate(to_char(v_depois, 'FM999,999,990.00'), ',.', '.,')
        || ' do TDR. Restam US$ ' || translate(to_char(greatest(0, v_tdr.valor_usd - v_depois), 'FM999,999,990.00'), ',.', '.,')
        || '. Acima do valor do TDR, nova aprovação de viagem é recusada.';

  begin
    insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    select u.id, 'tdr_execucao_direta_alerta', v_titulo, v_msg, false, 'viagens.html', 'tdr', v_tdr.id
      from public.usuarios u
     where u.ativo
       and (u.perfil in ('super_admin', 'coordenacao', 'financeiro')
            or exists (select 1 from public.atividade_responsaveis r
                        where r.atividade_id = v_tdr.atividade_id and r.usuario_id = u.id and r.ativo));
  exception when check_violation then
    null; -- tipo ainda fora do check de notificacoes (rodar o _sql_editor.sql)
  end;
  return null;
end $function$;

revoke all on function public.fn_trg_ef_aviso_tdr_direta() from public, anon, authenticated;

create or replace trigger trg_ef_aviso_tdr_direta
  after insert or update on public.execucao_financeira
  for each row execute function public.fn_trg_ef_aviso_tdr_direta();
