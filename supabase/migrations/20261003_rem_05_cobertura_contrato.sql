-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · Fase 5 — cobertura obrigatória do contrato
-- Especificação: docs/remanejamento/plano.md §5 (revisada em 03/10/2026).
--
-- Regra (decisão da coordenação, 03/10/2026):
--   * o TDR COMPROMETE o orçamento pelo valor planejado — só nasce/aumenta se
--     couber no saldo livre da atividade (trg_tdr_saldo, agora sobre o razão);
--   * o contrato DERIVA do TDR: até o valor do TDR (Σ contratos do mesmo TDR)
--     já está comprometido e não pede nada;
--   * o que passar do TDR (ou o contrato inteiro, se não houver TDR) é
--     EXCEDENTE: entra no débito em USD pela PTAX do dia e, se não couber no
--     saldo livre, o contrato fica `aguardando_cobertura` — totalmente travado
--     até que um remanejamento (ou economia/encerramento/redução) cubra;
--   * os negativos de hoje não são regularizados: o contrato só espera pelo
--     que ELE acrescentou (piso = saldo livre antes dele, se já era negativo).
--
-- Comparação TDR × contrato em R$ (o contrato deriva do TDR em reais); só o
-- excedente é convertido, pela PTAX do dia do cadastro/aditivo, e congelado.
--
-- Nada é removido (apply_migration trava com isso): create or replace e
-- tabela-razão imutável sem policy de escrita.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Contrato guarda o status de antes da trava ──────────────────────
alter table public.contratos
  add column if not exists status_antes_cobertura public.status_contrato;
comment on column public.contratos.status_antes_cobertura is
  'Status a restaurar quando a cobertura for liberada. Só os triggers da fase 5 gravam.';

-- ── 2. Razão de coberturas (excedente do contrato sobre o TDR) ─────────
create table if not exists public.contrato_coberturas (
  id                   uuid primary key default gen_random_uuid(),
  seq                  bigint generated always as identity unique,
  grupo                uuid not null,       -- tdr_id; sem TDR, o próprio contrato
  contrato_id          uuid references public.contratos(id) deferrable initially deferred,
  tdr_id               uuid references public.tdrs(id),
  atividade_id         uuid not null references public.atividades(id),
  evento               text not null check (evento in
                         ('carga_inicial','cadastro','aditivo','reducao','cancelamento',
                          'vinculo','desvinculo','tdr_alterado')),
  valor_anterior_brl   numeric(14,2),
  valor_novo_brl       numeric(14,2),
  excedente_antes_brl  numeric(14,2) not null,
  excedente_depois_brl numeric(14,2) not null check (excedente_depois_brl >= 0),
  cotacao              numeric(12,4),
  cotacao_data         date,
  delta_usd            numeric(14,2) not null,
  livre_antes_usd      numeric(14,2),
  deficit_usd          numeric(14,2) not null default 0 check (deficit_usd >= 0),
  piso_usd             numeric(14,2),
  situacao             text not null default 'sem_deficit'
                         check (situacao in ('sem_deficit','aguardando','coberto','cancelado')),
  resolvido_em         timestamptz,
  resolucao            text,
  criado_por           uuid,
  criado_em            timestamptz not null default clock_timestamp()
);
create index if not exists idx_cob_grupo     on public.contrato_coberturas (grupo, seq);
create index if not exists idx_cob_atividade on public.contrato_coberturas (atividade_id, seq);
create index if not exists idx_cob_pendentes on public.contrato_coberturas (atividade_id, seq) where situacao = 'aguardando';
comment on table public.contrato_coberturas is
  'Razão do excedente de contrato sobre o TDR (fase 5). Σ delta_usd por atividade entra no débito. '
  'Imutável: só situacao aguardando → coberto/cancelado muda. Escrita só pelos triggers.';

create or replace function public.fn_trg_cob_imutavel()
returns trigger language plpgsql as $$
begin
  if old.situacao = 'aguardando' and new.situacao in ('coberto','cancelado')
     and (to_jsonb(new) - 'situacao' - 'resolvido_em' - 'resolucao')
       = (to_jsonb(old) - 'situacao' - 'resolvido_em' - 'resolucao') then
    return new;
  end if;
  raise exception 'COBERTURA: lançamento imutável (só pendência aguardando → coberto/cancelado).';
end $$;
create or replace trigger trg_cob_imutavel before update on public.contrato_coberturas
  for each row execute function public.fn_trg_cob_imutavel();

alter table public.contrato_coberturas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'contrato_coberturas' and policyname = 'cob_select') then
    create policy cob_select on public.contrato_coberturas for select to authenticated
      using (exists (select 1 from public.contratos c where c.id = contrato_coberturas.contrato_id)
             or exists (select 1 from public.tdrs t where t.id = contrato_coberturas.tdr_id));
  end if;
end $$;
revoke all on public.contrato_coberturas from anon, authenticated;
grant select on public.contrato_coberturas to authenticated;
grant all on public.contrato_coberturas to service_role;

-- ── 3. Débito passa a incluir o excedente; contrato sem TDR não conta 2× ──
create or replace view public.vw_orcamento_debitos as
select a.id as atividade_id,
       coalesce(t.planejado, 0)::numeric(14,2)          as tdr_planejado_usd,
       coalesce(t.reserva_direta, 0)::numeric(14,2)     as reserva_execucao_direta_usd,
       coalesce(d.direta, 0)::numeric(14,2)             as execucao_direta_realizada_usd,
       coalesce(p.ct_sem_tdr, 0)::numeric(14,2)         as pagamentos_contrato_sem_tdr_usd,
       (coalesce(t.planejado, 0)
        + greatest(coalesce(t.reserva_direta, 0), coalesce(d.direta, 0))
        + coalesce(p.ct_sem_tdr, 0)
        + coalesce(e.excedente, 0))::numeric(14,2)      as debito_usd,
       coalesce(t.sem_usd, 0)                           as tdrs_sem_valor_usd,
       coalesce(e.excedente, 0)::numeric(14,2)          as contratos_excedente_usd
  from public.atividades a
  left join lateral (
    select sum(x.valor_usd) filter (where not x.execucao_direta) as planejado,
           sum(x.valor_usd) filter (where x.execucao_direta)     as reserva_direta,
           count(*) filter (where x.valor_usd is null)           as sem_usd
      from public.tdrs x
     where x.atividade_id = a.id and x.status <> 'cancelado'
  ) t on true
  left join lateral (
    select sum(ef.valor_usd) filter (
             where ef.contrato_id is null and (ef.tdr_id is null or td.execucao_direta)) as direta
      from public.execucao_financeira ef
      left join public.tdrs td on td.id = ef.tdr_id
     where ef.atividade_id = a.id and ef.situacao <> 'cancelado'
  ) d on true
  -- contrato sem TDR: o excedente (= valor inteiro) já está no débito; pagamento só
  -- conta no que passar dele (contratos antigos, sem lançamento de cobertura)
  left join lateral (
    select sum(greatest(0, q.pago - coalesce(q.exc, 0))) as ct_sem_tdr
      from (select ef.contrato_id, sum(ef.valor_usd) as pago,
                   (select sum(cc.delta_usd) from public.contrato_coberturas cc
                     where cc.grupo = ef.contrato_id) as exc
              from public.execucao_financeira ef
              join public.contratos c on c.id = ef.contrato_id
             where ef.atividade_id = a.id and ef.situacao <> 'cancelado' and c.tdr_id is null
             group by ef.contrato_id) q
  ) p on true
  left join lateral (
    select sum(cc.delta_usd) as excedente
      from public.contrato_coberturas cc where cc.atividade_id = a.id
  ) e on true;

create or replace view public.vw_orcamento_atividade as
select a.id as atividade_id, a.codigo, a.nome_pt, a.resultado_id,
       a.orcamento_original_usd,
       a.orcamento_usd                                            as orcamento_vigente_usd,
       coalesce(c.orcamentario, 0)::numeric(14,2)                 as orcamento_razao_usd,
       coalesce(c.liberado, 0)::numeric(14,2)                     as liberado_usd,
       coalesce(c.total, 0)::numeric(14,2)                        as creditos_usd,
       d.tdr_planejado_usd, d.reserva_execucao_direta_usd, d.execucao_direta_realizada_usd,
       d.pagamentos_contrato_sem_tdr_usd, d.debito_usd, d.tdrs_sem_valor_usd,
       (coalesce(c.total, 0) - d.debito_usd)::numeric(14,2)       as saldo_usd,
       coalesce(s.disponivel, 0)::numeric(14,2)                   as disponivel_fontes_usd,
       greatest(0, d.debito_usd - coalesce(c.total, 0))::numeric(14,2) as deficit_usd,
       round(v.saldo_livre_usd, 2)                                as saldo_livre_painel_usd,
       coalesce(s.reservado, 0)::numeric(14,2)                    as reservado_usd,
       coalesce(s.livre, 0)::numeric(14,2)                        as remanejavel_usd,
       d.contratos_excedente_usd,
       coalesce(k.n, 0)::integer                                  as contratos_aguardando,
       coalesce(k.deficit, 0)::numeric(14,2)                      as cobertura_pendente_usd
  from public.atividades a
  join public.vw_orcamento_debitos d on d.atividade_id = a.id
  left join public.vw_saldo_atividade v on v.id = a.id
  left join lateral (
    select sum(f.valor_usd) filter (where f.orcamentaria)     as orcamentario,
           sum(f.valor_usd) filter (where not f.orcamentaria) as liberado,
           sum(f.valor_usd)                                   as total
      from public.orcamento_fontes f where f.atividade_id = a.id
  ) c on true
  left join lateral (
    select sum(fs.disponivel_usd) as disponivel, sum(fs.reservado_usd) as reservado, sum(fs.livre_usd) as livre
      from public.vw_orcamento_fontes_saldo fs where fs.atividade_id = a.id
  ) s on true
  left join lateral (
    select count(distinct cc.contrato_id) as n, sum(cc.deficit_usd) as deficit
      from public.contrato_coberturas cc
     where cc.atividade_id = a.id and cc.situacao = 'aguardando'
  ) k on true;

-- ── 4. Utilitários ─────────────────────────────────────────────────────
-- Saldo livre COM SINAL (créditos − débitos − reservas de remanejamento).
-- remanejavel_usd não serve aqui: é Σ fontes livres e nunca fica negativo.
create or replace function public.fn_cob_livre(p_atividade uuid)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce((select o.saldo_usd - o.reservado_usd from public.vw_orcamento_atividade o
                    where o.atividade_id = p_atividade), 0)::numeric(14,2)
$$;

-- Excedente em R$ de um grupo (TDR ou contrato sem TDR) no estado "virtual":
-- p_contrato é a linha que está mudando (fica de fora da soma da tabela) e
-- p_valor é quanto ela passa a valer DENTRO do grupo (0 se saiu/cancelou).
create or replace function public.fn_cob_excedente_brl(p_grupo uuid, p_tdr uuid, p_contrato uuid, p_valor numeric)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select greatest(0,
           coalesce((select sum(c.valor_total_brl) from public.contratos c
                      where coalesce(c.tdr_id, c.id) = p_grupo
                        and c.id is distinct from p_contrato
                        and c.status <> 'cancelado'), 0)
         + coalesce(p_valor, 0)
         - coalesce((select t.valor_brl from public.tdrs t
                      where t.id = p_tdr and t.status <> 'cancelado'), 0))::numeric(14,2)
$$;

-- Registra a variação do excedente de um grupo. Devolve o lançamento (ou nulo
-- se nada mudou). p_pode_travar: só cadastro/aditivo/vínculo de contrato travam.
create or replace function public.fn_cob_registrar(
  p_grupo uuid, p_tdr uuid, p_atividade uuid, p_contrato uuid, p_evento text,
  p_valor_ant numeric, p_valor_novo numeric, p_depois_brl numeric, p_pode_travar boolean)
returns public.contrato_coberturas language plpgsql security definer set search_path to 'public' as $$
declare
  v_antes   numeric(14,2);
  v_delta   numeric(14,2);
  v_usd     numeric(14,2);
  v_cot     numeric(12,4);
  v_cot_dt  date;
  v_tot_usd numeric(14,2);
  v_livre   numeric(14,2);
  v_deficit numeric(14,2) := 0;
  v_piso    numeric(14,2);
  v_row     public.contrato_coberturas;
begin
  select cc.excedente_depois_brl into v_antes
    from public.contrato_coberturas cc where cc.grupo = p_grupo order by cc.seq desc limit 1;
  v_antes := coalesce(v_antes, 0);
  v_delta := round(p_depois_brl, 2) - v_antes;
  if v_delta = 0 then return null; end if;
  if p_atividade is null then
    raise exception 'CONTRATO_SEM_ATIVIDADE: informe a atividade do contrato — o valor acima do TDR precisa de orçamento.';
  end if;

  -- trava a atividade: dois cadastros simultâneos não usam o mesmo saldo
  perform 1 from public.atividades where id = p_atividade for update;

  if v_delta > 0 then
    select q.ptax_venda, q.data_cotacao into v_cot, v_cot_dt from public.fn_cotacao_usd(null) q;
    v_usd := round(v_delta / v_cot, 2);
  else
    select coalesce(sum(cc.delta_usd), 0) into v_tot_usd from public.contrato_coberturas cc where cc.grupo = p_grupo;
    v_usd := case when round(p_depois_brl, 2) = 0 then -v_tot_usd
                  else round(v_delta * v_tot_usd / nullif(v_antes, 0), 2) end;
  end if;

  if p_pode_travar and v_usd > 0 then
    v_livre   := fn_cob_livre(p_atividade);
    v_deficit := greatest(0, v_usd - greatest(0, v_livre));
    if v_deficit > 0 then
      -- piso herdado da 1ª pendência da atividade (fila única); senão, o saldo
      -- antes deste contrato se já era negativo (não regulariza o passado)
      select cc.piso_usd into v_piso from public.contrato_coberturas cc
       where cc.atividade_id = p_atividade and cc.situacao = 'aguardando' order by cc.seq limit 1;
      v_piso := coalesce(v_piso, least(0, v_livre));
    end if;
  end if;

  insert into public.contrato_coberturas (grupo, contrato_id, tdr_id, atividade_id, evento,
         valor_anterior_brl, valor_novo_brl, excedente_antes_brl, excedente_depois_brl,
         cotacao, cotacao_data, delta_usd, livre_antes_usd, deficit_usd, piso_usd, situacao, criado_por)
  values (p_grupo, p_contrato, p_tdr, p_atividade, p_evento,
          p_valor_ant, p_valor_novo, v_antes, round(p_depois_brl, 2),
          v_cot, v_cot_dt, v_usd, v_livre, v_deficit, v_piso,
          case when v_deficit > 0 then 'aguardando' else 'sem_deficit' end, auth.uid())
  returning * into v_row;
  return v_row;
end $$;

-- Cancela pedidos de cobertura abertos de um contrato (não efetivados)
create or replace function public.fn_cob_cancelar_pedidos(p_contrato uuid, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record; v_avisar uuid[];
begin
  for r in
    select * from public.remanejamentos x
     where x.contrato_id = p_contrato and x.tipo = 'cobertura_contrato'
       and x.status in ('rascunho','em_aprovacao')
       and not exists (select 1 from public.orcamento_fontes f where f.remanejamento_id = x.id)
     for update
  loop
    select array_agg(distinct u) into v_avisar from (
      select r.criado_por as u
      union select s.usuario_id from public.remanejamento_assinaturas s
             where s.remanejamento_id = r.id and s.versao = r.versao and s.invalidada_em is null) z;
    update public.remanejamento_assinaturas set invalidada_em = now(), invalidada_motivo = 'pedido cancelado: ' || p_motivo
     where remanejamento_id = r.id and versao = r.versao and invalidada_em is null;
    update public.remanejamentos set status = 'cancelado', etapa_atual = null, encerrado_em = now(),
           motivo_encerramento = p_motivo where id = r.id;
    perform fn_rem_log(r.id, 'cancelado', r.status, 'cancelado', r.etapa_atual, null, p_motivo);
    perform fn_rem_notificar(r.id, v_avisar, 'cancelado', p_motivo);
  end loop;
end $$;

-- Libera, em ordem de chegada, os contratos cuja cobertura o saldo já cobre.
-- Pendência i sai quando livre + Σ(excedentes pendentes depois dela) ≥ piso.
create or replace function public.fn_cob_reavaliar(p_atividade uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_livre numeric; v_piso numeric; v_cauda numeric; v_n integer := 0;
  r record;
begin
  if p_atividade is null then return 0; end if;
  if not exists (select 1 from public.contrato_coberturas
                  where atividade_id = p_atividade and situacao = 'aguardando') then
    return 0;
  end if;
  v_livre := fn_cob_livre(p_atividade);
  for r in
    select * from public.contrato_coberturas
     where atividade_id = p_atividade and situacao = 'aguardando' order by seq
  loop
    -- uma chamada aninhada (pedido cancelado → reserva liberada) pode ter resolvido esta
    continue when not exists (select 1 from public.contrato_coberturas
                               where id = r.id and situacao = 'aguardando');
    if v_piso is null then v_piso := r.piso_usd; end if;
    select coalesce(sum(delta_usd), 0) into v_cauda from public.contrato_coberturas
     where atividade_id = p_atividade and situacao = 'aguardando' and seq > r.seq;
    exit when v_livre + v_cauda < v_piso;

    update public.contrato_coberturas
       set situacao = 'coberto', resolvido_em = now(), resolucao = 'saldo da atividade cobre o excedente'
     where id = r.id;
    v_n := v_n + 1;

    if not exists (select 1 from public.contrato_coberturas
                    where contrato_id = r.contrato_id and situacao = 'aguardando') then
      perform set_config('dima.cobertura', 'liberar', true);
      update public.contratos
         set status = coalesce(status_antes_cobertura, 'vigente'), status_antes_cobertura = null
       where id = r.contrato_id and status = 'aguardando_cobertura';
      perform set_config('dima.cobertura', '', true);
      perform fn_cob_cancelar_pedidos(r.contrato_id, 'contrato coberto pelo saldo da atividade — pedido dispensado');
    end if;
  end loop;
  return v_n;
end $$;

-- ── 5. Trigger do contrato: trava, excedente e cancelamento ────────────
create or replace function public.fn_trg_contrato_cobertura()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_liberando boolean := coalesce(current_setting('dima.cobertura', true), '') = 'liberar';
  v_old_grupo uuid; v_new_grupo uuid;
  v_old_tdr uuid; v_old_ativ uuid; v_new_ativ uuid;
  v_valor_novo numeric;
  v_evento text;
  v_cob public.contrato_coberturas;
begin
  if v_liberando then return new; end if;

  -- status do sistema: ninguém põe/tira "aguardando_cobertura" na mão
  if new.status = 'aguardando_cobertura'
     and (tg_op = 'INSERT' or old.status <> 'aguardando_cobertura') then
    raise exception 'CONTRATO_STATUS: "aguardando cobertura" é definido pelo sistema, não pelo formulário.';
  end if;
  if tg_op = 'UPDATE' then
    new.status_antes_cobertura := old.status_antes_cobertura;
    if old.status = 'cancelado' and new.status <> 'cancelado' then
      raise exception 'CONTRATO_CANCELADO: contrato % foi cancelado e não volta.', old.numero;
    end if;
    if old.status = 'aguardando_cobertura' then
      if new.status not in ('aguardando_cobertura','cancelado') then
        raise exception 'CONTRATO_AGUARDANDO_COBERTURA: o contrato % está travado até o saldo cobrir o excedente — '
                        'só é possível reduzir o valor ou cancelar.', old.numero;
      end if;
      if new.contrato_assinado_url is distinct from old.contrato_assinado_url and new.contrato_assinado_url is not null then
        raise exception 'CONTRATO_AGUARDANDO_COBERTURA: não anexe o contrato assinado antes da cobertura do contrato %.', old.numero;
      end if;
    end if;
    if new.status = 'cancelado' and old.status <> 'cancelado' and exists (
         select 1 from public.execucao_financeira ef
          where ef.contrato_id = new.id and ef.situacao <> 'cancelado') then
      raise exception 'CONTRATO_COM_PAGAMENTO: contrato % tem lançamento financeiro; encerre em vez de cancelar.', old.numero;
    end if;
  else
    new.status_antes_cobertura := null;
    if new.status = 'cancelado' then
      raise exception 'CONTRATO_STATUS: não se cadastra contrato já cancelado.';
    end if;
  end if;

  -- só valor, TDR, atividade e cancelamento mexem no excedente
  if tg_op = 'UPDATE'
     and new.valor_total_brl is not distinct from old.valor_total_brl
     and new.tdr_id is not distinct from old.tdr_id
     and new.atividade_id is not distinct from old.atividade_id
     and (new.status = 'cancelado') = (old.status = 'cancelado') then
    return new;
  end if;

  if new.tdr_id is not null then
    select atividade_id into v_new_ativ from public.tdrs where id = new.tdr_id;
  else
    v_new_ativ := new.atividade_id;
  end if;
  v_new_grupo  := coalesce(new.tdr_id, new.id);
  v_valor_novo := case when new.status = 'cancelado' then 0 else coalesce(new.valor_total_brl, 0) end;

  if tg_op = 'UPDATE' then
    v_old_grupo := coalesce(old.tdr_id, old.id);
    v_old_tdr   := old.tdr_id;
    if old.tdr_id is not null then
      select atividade_id into v_old_ativ from public.tdrs where id = old.tdr_id;
    else
      v_old_ativ := old.atividade_id;
    end if;
    if v_old_grupo <> v_new_grupo or v_old_ativ is distinct from v_new_ativ then
      -- saiu do grupo antigo (ou mudou de atividade): o excedente de lá recalcula
      perform fn_cob_registrar(v_old_grupo, v_old_tdr, v_old_ativ, new.id, 'desvinculo',
                               old.valor_total_brl, 0,
                               case when v_old_grupo = new.id and v_old_ativ is distinct from v_new_ativ then 0
                                    else fn_cob_excedente_brl(v_old_grupo, v_old_tdr, new.id, 0) end,
                               false);
    end if;
  end if;

  v_evento := case
    when tg_op = 'INSERT' then 'cadastro'
    when new.status = 'cancelado' and old.status <> 'cancelado' then 'cancelamento'
    when v_old_grupo <> v_new_grupo or v_old_ativ is distinct from v_new_ativ then 'vinculo'
    when coalesce(new.valor_total_brl, 0) > coalesce(old.valor_total_brl, 0) then 'aditivo'
    else 'reducao' end;

  if new.status = 'cancelado' and tg_op = 'UPDATE' and old.status <> 'cancelado' then
    update public.contrato_coberturas set situacao = 'cancelado', resolvido_em = now(), resolucao = 'contrato cancelado'
     where contrato_id = new.id and situacao = 'aguardando';
  end if;

  v_cob := fn_cob_registrar(v_new_grupo, new.tdr_id, v_new_ativ, new.id, v_evento,
                            case when tg_op = 'UPDATE' then old.valor_total_brl end, new.valor_total_brl,
                            fn_cob_excedente_brl(v_new_grupo, new.tdr_id, new.id, v_valor_novo),
                            v_evento in ('cadastro','aditivo','vinculo'));

  if v_cob.situacao = 'aguardando' then
    new.status_antes_cobertura := case when tg_op = 'UPDATE' and old.status = 'aguardando_cobertura'
                                       then old.status_antes_cobertura else new.status end;
    new.status := 'aguardando_cobertura';
  end if;
  return new;
end $$;
create or replace trigger trg_contrato_cobertura before insert or update on public.contratos
  for each row execute function public.fn_trg_contrato_cobertura();

-- Depois de reduzir/cancelar/mudar de grupo: reavalia as filas envolvidas
create or replace function public.fn_trg_contrato_cobertura_pos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(current_setting('dima.cobertura', true), '') = 'liberar' then return null; end if;
  if new.status = 'cancelado' and old.status <> 'cancelado' then
    perform fn_cob_cancelar_pedidos(new.id, 'contrato cancelado');
  end if;
  perform fn_cob_reavaliar(coalesce((select atividade_id from public.tdrs where id = old.tdr_id), old.atividade_id));
  perform fn_cob_reavaliar(coalesce((select atividade_id from public.tdrs where id = new.tdr_id), new.atividade_id));
  return null;
end $$;
create or replace trigger trg_contrato_cobertura_pos after update on public.contratos
  for each row
  when (old.valor_total_brl is distinct from new.valor_total_brl
        or old.tdr_id is distinct from new.tdr_id
        or old.atividade_id is distinct from new.atividade_id
        or old.status is distinct from new.status)
  execute function public.fn_trg_contrato_cobertura_pos();

-- ── 6. Contrato travado: sem produto e sem pagamento ───────────────────
create or replace function public.fn_trg_cob_trava_execucao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_status text; v_numero text;
begin
  if new.contrato_id is null then return new; end if;
  select status::text, numero into v_status, v_numero from public.contratos where id = new.contrato_id;
  if v_status = 'aguardando_cobertura' then
    if tg_table_name = 'execucao_financeira' and new.situacao = 'cancelado' then return new; end if;
    raise exception 'CONTRATO_AGUARDANDO_COBERTURA: o contrato % está travado até a cobertura do orçamento '
                    '(sem produtos nem pagamentos). Peça o remanejamento em Remanejamento › Pedidos.', v_numero;
  end if;
  if v_status = 'cancelado' and tg_op = 'INSERT' then
    raise exception 'CONTRATO_CANCELADO: o contrato % foi cancelado.', v_numero;
  end if;
  return new;
end $$;
create or replace trigger trg_cob_trava_produto before insert or update on public.contratos_produtos
  for each row execute function public.fn_trg_cob_trava_execucao();
create or replace trigger trg_cob_trava_financeiro before insert or update on public.execucao_financeira
  for each row execute function public.fn_trg_cob_trava_execucao();

-- ── 7. TDR compromete o orçamento: trava sobre o saldo livre do razão ──
-- Substitui a regra antiga (Σ TDRs ≤ orcamento_usd, sem rascunho), que
-- ignorava excedente de contrato, execução direta e reservas de remanejamento.
create or replace function public.fn_trg_verificar_saldo()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_antes numeric := 0; v_depois numeric := 0; v_livre numeric; v_codigo text;
begin
  if tg_op = 'UPDATE' then
    if new.status = 'cancelado' and old.status <> 'cancelado'
       and exists (select 1 from public.contratos c where c.tdr_id = new.id and c.status <> 'cancelado') then
      raise exception 'TDR_COM_CONTRATO: o TDR % tem contrato ativo — cancele/encerre o contrato antes.', new.numero;
    end if;
    if new.atividade_id is distinct from old.atividade_id
       and exists (select 1 from public.contratos c where c.tdr_id = new.id and c.status <> 'cancelado') then
      raise exception 'TDR_COM_CONTRATO: o TDR % tem contrato — não muda de atividade.', new.numero;
    end if;
    if old.status <> 'cancelado' and old.atividade_id = new.atividade_id then
      v_antes := coalesce(old.valor_usd, 0);
    end if;
  end if;
  if new.status <> 'cancelado' then v_depois := coalesce(new.valor_usd, 0); end if;
  if v_depois <= v_antes then return new; end if;

  perform 1 from public.atividades where id = new.atividade_id for update;
  v_livre := fn_cob_livre(new.atividade_id);
  if v_depois - v_antes > greatest(0, v_livre) then
    select codigo into v_codigo from public.atividades where id = new.atividade_id;
    raise exception 'SALDO_INSUFICIENTE: o TDR compromete US$ % e a atividade % tem US$ % livre '
                    '(descontados TDRs, contratos acima do TDR, execução direta e reservas de remanejamento). '
                    'Solicite remanejamento.',
      round(v_depois - v_antes, 2), v_codigo, round(greatest(0, v_livre), 2);
  end if;
  return new;
end $$;

-- TDR mudou de valor em R$ ou foi cancelado: recalcula o excedente do grupo
create or replace function public.fn_trg_tdr_cobertura_pos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if exists (select 1 from public.contratos c where c.tdr_id = new.id) then
    perform fn_cob_registrar(new.id, new.id, new.atividade_id, null, 'tdr_alterado',
                             null, null, fn_cob_excedente_brl(new.id, new.id, null, 0), false);
  end if;
  perform fn_cob_reavaliar(new.atividade_id);
  return null;
end $$;
create or replace trigger trg_tdr_cobertura_pos after update on public.tdrs
  for each row
  when (old.valor_brl is distinct from new.valor_brl
        or old.valor_usd is distinct from new.valor_usd
        or old.status is distinct from new.status)
  execute function public.fn_trg_tdr_cobertura_pos();

-- ── 8. Crédito novo / reserva liberada: reavalia a fila da atividade ───
create or replace function public.fn_trg_fonte_cobertura_pos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform fn_cob_reavaliar(new.atividade_id);
  return null;
end $$;
create or replace trigger trg_fonte_cobertura_pos after insert on public.orcamento_fontes
  for each row execute function public.fn_trg_fonte_cobertura_pos();

create or replace function public.fn_trg_rem_cobertura_pos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  -- pedido saiu da cadeia sem efetivar: a reserva das origens volta a ser saldo
  for r in select distinct atividade_id from public.remanejamento_itens
            where remanejamento_id = new.id and ativo and valor_usd < 0 loop
    perform fn_cob_reavaliar(r.atividade_id);
  end loop;
  return null;
end $$;
create or replace trigger trg_rem_cobertura_pos after update on public.remanejamentos
  for each row
  when (old.status = 'em_aprovacao' and new.status in ('recusado','cancelado','rascunho'))
  execute function public.fn_trg_rem_cobertura_pos();

-- ── 9. Carga inicial: excedentes que já existem (sem travar ninguém) ───
-- PTAX da data do cadastro do contrato; nenhum contrato existente é travado.
insert into public.contrato_coberturas (grupo, contrato_id, tdr_id, atividade_id, evento,
       valor_anterior_brl, valor_novo_brl, excedente_antes_brl, excedente_depois_brl,
       cotacao, cotacao_data, delta_usd, situacao, resolucao)
select g.grupo, g.contrato_id, g.tdr_id, g.atividade_id, 'carga_inicial',
       null, g.valor_brl, 0, g.excedente, q.ptax_venda, q.data_cotacao,
       round(g.excedente / q.ptax_venda, 2), 'sem_deficit',
       'excedente existente na implantação da fase 5 (não travado)'
  from (
    select coalesce(c.tdr_id, c.id) as grupo,
           (array_agg(c.id order by c.criado_em desc))[1] as contrato_id,
           c.tdr_id,
           coalesce(max(t.atividade_id::text)::uuid, max(c.atividade_id::text)::uuid) as atividade_id,
           sum(c.valor_total_brl) as valor_brl,
           max(c.criado_em)::date as data_ref,
           greatest(0, sum(c.valor_total_brl) - coalesce(max(t.valor_brl), 0))::numeric(14,2) as excedente
      from public.contratos c
      left join public.tdrs t on t.id = c.tdr_id and t.status <> 'cancelado'
     where c.status <> 'cancelado'
     group by coalesce(c.tdr_id, c.id), c.tdr_id
  ) g
  cross join lateral public.fn_cotacao_usd(g.data_ref) q
 where g.excedente > 0
   and not exists (select 1 from public.contrato_coberturas cc where cc.grupo = g.grupo);

-- ── 10. Permissões ─────────────────────────────────────────────────────
revoke all on function public.fn_trg_cob_imutavel()                 from public, anon, authenticated;
revoke all on function public.fn_cob_excedente_brl(uuid, uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.fn_cob_registrar(uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, boolean)
                                                                     from public, anon, authenticated;
revoke all on function public.fn_cob_cancelar_pedidos(uuid, text)   from public, anon, authenticated;
revoke all on function public.fn_cob_reavaliar(uuid)                from public, anon, authenticated;
revoke all on function public.fn_trg_contrato_cobertura()           from public, anon, authenticated;
revoke all on function public.fn_trg_contrato_cobertura_pos()       from public, anon, authenticated;
revoke all on function public.fn_trg_cob_trava_execucao()           from public, anon, authenticated;
revoke all on function public.fn_trg_verificar_saldo()              from public, anon, authenticated;
revoke all on function public.fn_trg_tdr_cobertura_pos()            from public, anon, authenticated;
revoke all on function public.fn_trg_fonte_cobertura_pos()          from public, anon, authenticated;
revoke all on function public.fn_trg_rem_cobertura_pos()            from public, anon, authenticated;
revoke all on function public.fn_cob_livre(uuid)                    from public, anon;
grant execute on function public.fn_cob_livre(uuid)                 to authenticated, service_role;
grant execute on function public.fn_cob_reavaliar(uuid)             to service_role;
revoke all on public.vw_orcamento_debitos, public.vw_orcamento_atividade from anon;
grant select on public.vw_orcamento_debitos, public.vw_orcamento_atividade to authenticated;
