-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · Fase 1 — Razão de fontes (docs/remanejamento/plano.md §2)
--
-- Todo dólar do saldo de uma atividade tem PROCEDÊNCIA: uma linha "crédito"
-- em orcamento_fontes (dotação original, revisão orçamentária, economia de
-- contratação, encerramento de contrato, remanejamento recebido). Ajustes
-- (estorno, cessão em remanejamento, revisão para menos) apontam para o
-- crédito que ajustam (ajusta_fonte_id). Nada é alterado nem apagado.
--
-- Débito da atividade (vw_orcamento_debitos):
--   Σ TDRs não cancelados (exceto execução direta)
--   + max(reserva dos TDRs de execução direta, despesas diretas realizadas)
--   + pagamentos de contratos sem TDR
-- Execução direta UNESCO (viagens: diárias e passagens) não tem contrato nem
-- TDR por despesa; o TDR "guarda-chuva" (tdrs.execucao_direta) é a reserva e
-- as despesas a consomem. Só o excedente vira débito extra.
--
-- Regra de consumo (PEPS, vw_orcamento_fontes_saldo): o débito consome os
-- créditos em ordem — dotação original primeiro, depois por criado_em. O que
-- sobra em cada crédito é o disponível COM procedência.
--
-- atividades.orcamento_usd passa a ser cache de Σ créditos/ajustes
-- orçamentários, gravado só aqui (guarda na rem_00). vw_saldo_atividade não
-- muda — dashboard e relatório A4 continuam iguais.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Execução direta ─────────────────────────────────────────────────
alter table public.tdrs add column if not exists execucao_direta boolean not null default false;
comment on column public.tdrs.execucao_direta is
  'TDR guarda-chuva de execução direta UNESCO (ex.: diárias, passagens). Funciona como '
  'reserva: despesas sem contrato da atividade a consomem. Ver docs/remanejamento/plano.md §2.2.';

-- ── 2. Razão de fontes ─────────────────────────────────────────────────
create table if not exists public.orcamento_fontes (
  id               uuid primary key default gen_random_uuid(),
  atividade_id     uuid not null references public.atividades(id),
  tipo             text not null check (tipo in (
                     'dotacao_original','revisao_orcamentaria',
                     'economia_contratacao','encerramento_contrato',
                     'remanejamento_recebido','remanejamento_cedido')),
  orcamentaria     boolean generated always as (tipo in (
                     'dotacao_original','revisao_orcamentaria',
                     'remanejamento_recebido','remanejamento_cedido')) stored,
  valor_usd        numeric(14,2) not null check (valor_usd <> 0),
  valor_brl_ref    numeric(14,2),
  cotacao          numeric,
  ajusta_fonte_id  uuid references public.orcamento_fontes(id),
  estorno_de       uuid unique references public.orcamento_fontes(id),
  fonte_origem_id  uuid references public.orcamento_fontes(id),
  encerramento_id  uuid references public.contrato_encerramentos(id),
  remanejamento_id uuid,
  descricao        text not null check (btrim(descricao) <> ''),
  criado_por       uuid references public.usuarios(id),
  criado_em        timestamptz not null default now(),
  -- crédito: positivo, sem ajuste nem estorno, nunca cessão
  constraint orcamento_fontes_credito_ck check (
    ajusta_fonte_id is not null
    or (estorno_de is null and valor_usd > 0 and tipo <> 'remanejamento_cedido')),
  constraint orcamento_fontes_cessao_ck check (tipo <> 'remanejamento_cedido' or ajusta_fonte_id is not null),
  constraint orcamento_fontes_recebido_ck check (
    tipo <> 'remanejamento_recebido' or ajusta_fonte_id is not null or fonte_origem_id is not null),
  constraint orcamento_fontes_liberacao_ck check (
    tipo not in ('economia_contratacao','encerramento_contrato') or encerramento_id is not null)
);
comment on table public.orcamento_fontes is
  'Razão imutável da procedência do saldo de cada atividade (Opção B do remanejamento). '
  'Linha sem ajusta_fonte_id = crédito; com ajusta_fonte_id = ajuste daquele crédito. '
  'Escrita só por funções SECURITY DEFINER. Ver docs/remanejamento/plano.md.';

create index if not exists idx_orcamento_fontes_atividade on public.orcamento_fontes (atividade_id, criado_em);
create index if not exists idx_orcamento_fontes_ajusta on public.orcamento_fontes (ajusta_fonte_id);
create unique index if not exists uq_orcamento_fontes_dotacao
  on public.orcamento_fontes (atividade_id) where tipo = 'dotacao_original' and ajusta_fonte_id is null;
create unique index if not exists uq_orcamento_fontes_encerramento
  on public.orcamento_fontes (encerramento_id) where encerramento_id is not null and ajusta_fonte_id is null;

alter table public.orcamento_fontes enable row level security;
drop policy if exists orcamento_fontes_select on public.orcamento_fontes;
create policy orcamento_fontes_select on public.orcamento_fontes
  for select to authenticated using (auth.uid() is not null);
revoke all on public.orcamento_fontes from anon, authenticated, public;
grant select on public.orcamento_fontes to authenticated;

-- Validação de cada lançamento
create or replace function public.fn_trg_orcamento_fontes_valida()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_cred    public.orcamento_fontes;
  v_est     public.orcamento_fontes;
  v_liquido numeric;
begin
  if new.ajusta_fonte_id is not null then
    select * into v_cred from public.orcamento_fontes where id = new.ajusta_fonte_id;
    if not found or v_cred.ajusta_fonte_id is not null then
      raise exception 'RAZAO: ajuste deve apontar para um crédito.';
    end if;
    if v_cred.atividade_id <> new.atividade_id then
      raise exception 'RAZAO: ajuste e crédito de atividades diferentes.';
    end if;
    select v_cred.valor_usd + coalesce(sum(valor_usd), 0) into v_liquido
      from public.orcamento_fontes where ajusta_fonte_id = v_cred.id;
    if v_liquido + new.valor_usd < 0 then
      raise exception 'RAZAO: o lançamento deixaria a fonte % negativa (líquido US$ %, lançamento US$ %).',
        v_cred.id, v_liquido, new.valor_usd;
    end if;
  end if;

  if new.estorno_de is not null then
    select * into v_est from public.orcamento_fontes where id = new.estorno_de;
    if not found or v_est.estorno_de is not null then
      raise exception 'RAZAO: estorno deve apontar para um lançamento original.';
    end if;
    if v_est.tipo <> new.tipo or v_est.atividade_id <> new.atividade_id
       or new.valor_usd <> -v_est.valor_usd
       or new.ajusta_fonte_id is distinct from coalesce(v_est.ajusta_fonte_id, v_est.id) then
      raise exception 'RAZAO: estorno precisa espelhar o lançamento original (mesmo tipo, atividade e valor com sinal trocado).';
    end if;
  end if;
  return new;
end $$;

create or replace function public.fn_trg_orcamento_fontes_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'RAZAO: orcamento_fontes é imutável — corrija com estorno.';
end $$;

-- Cache do orçamento vigente (única via de escrita de orcamento_usd)
create or replace function public.fn_orcamento_recalcular_cache(p_atividade_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform set_config('dima.razao_orcamento', 'on', true);
  update public.atividades a
     set orcamento_usd = coalesce((select sum(f.valor_usd) from public.orcamento_fontes f
                                    where f.atividade_id = a.id and f.orcamentaria), 0),
         orcamento_original_usd = (select sum(f.valor_usd) from public.orcamento_fontes f
                                    where f.atividade_id = a.id and f.tipo = 'dotacao_original')
   where a.id = p_atividade_id;
  perform set_config('dima.razao_orcamento', 'off', true);
end $$;

create or replace function public.fn_trg_orcamento_fontes_cache()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.orcamentaria then
    perform fn_orcamento_recalcular_cache(new.atividade_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_orcamento_fontes_valida on public.orcamento_fontes;
create trigger trg_orcamento_fontes_valida before insert on public.orcamento_fontes
  for each row execute function public.fn_trg_orcamento_fontes_valida();
drop trigger if exists trg_orcamento_fontes_imutavel on public.orcamento_fontes;
create trigger trg_orcamento_fontes_imutavel before update or delete on public.orcamento_fontes
  for each row execute function public.fn_trg_orcamento_fontes_imutavel();
drop trigger if exists trg_orcamento_fontes_cache on public.orcamento_fontes;
create trigger trg_orcamento_fontes_cache after insert on public.orcamento_fontes
  for each row execute function public.fn_trg_orcamento_fontes_cache();

-- ── 3. Atividade nova: dotação original vira fonte ─────────────────────
create or replace function public.fn_trg_atividade_dotacao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(new.orcamento_usd, 0) > 0 then
    insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, descricao, criado_por)
    values (new.id, 'dotacao_original', new.orcamento_usd,
            'Dotação original da atividade ' || new.codigo, auth.uid());
  end if;
  return null;
end $$;
drop trigger if exists trg_atividade_dotacao on public.atividades;
create trigger trg_atividade_dotacao after insert on public.atividades
  for each row execute function public.fn_trg_atividade_dotacao();

-- ── 4. Liberações (contrato_encerramentos) entram no razão ─────────────
-- Espelha exatamente o que vw_saldo_atividade soma: valor_liberado_usd das
-- linhas 'ativo' na atividade da linha. Sem USD (taxa não informada) não há
-- crédito — a view também soma zero.
create or replace function public.fn_trg_encerramento_razao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_cred uuid;
begin
  if tg_op = 'INSERT' then
    if new.status = 'ativo' and coalesce(new.valor_liberado_usd, 0) > 0 and new.atividade_id is not null then
      insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, valor_brl_ref, encerramento_id, descricao, criado_por, criado_em)
      values (new.atividade_id, new.tipo, round(new.valor_liberado_usd, 2), new.valor_liberado_brl, new.id,
              new.motivo, new.autorizado_por, new.criado_em);
    end if;
    return null;
  end if;

  -- UPDATE: só ativo → revertido é permitido (guarda abaixo)
  if old.status = 'ativo' and new.status = 'revertido' then
    select id into v_cred from public.orcamento_fontes
     where encerramento_id = new.id and ajusta_fonte_id is null;
    if v_cred is not null then
      insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, ajusta_fonte_id, estorno_de, encerramento_id, descricao, criado_por, criado_em)
      select f.atividade_id, f.tipo, -f.valor_usd, f.id, f.id, f.encerramento_id,
             'Estorno: ' || coalesce(nullif(btrim(new.motivo_reversao), ''), 'liberação revertida'),
             new.revertido_por, coalesce(new.revertido_em, now())
        from public.orcamento_fontes f where f.id = v_cred;
    end if;
  end if;
  return null;
end $$;

create or replace function public.fn_trg_encerramento_guarda()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'RAZAO: liberação de saldo não é apagada — estorne (status revertido).';
  end if;
  if new.valor_liberado_usd is distinct from old.valor_liberado_usd
     or new.valor_liberado_brl is distinct from old.valor_liberado_brl
     or new.atividade_id is distinct from old.atividade_id
     or new.tipo is distinct from old.tipo
     or new.contrato_id is distinct from old.contrato_id then
    raise exception 'RAZAO: valores de uma liberação de saldo são imutáveis — estorne e lance outra.';
  end if;
  if old.status = 'revertido' and new.status = 'ativo' then
    raise exception 'RAZAO: liberação estornada não volta a valer — lance uma nova.';
  end if;
  return new;
end $$;

drop trigger if exists trg_encerramento_guarda on public.contrato_encerramentos;
create trigger trg_encerramento_guarda before update or delete on public.contrato_encerramentos
  for each row execute function public.fn_trg_encerramento_guarda();
drop trigger if exists trg_encerramento_razao on public.contrato_encerramentos;
create trigger trg_encerramento_razao after insert or update of status on public.contrato_encerramentos
  for each row execute function public.fn_trg_encerramento_razao();

-- ── 5. Eventos de TDR (extrato da atividade) ───────────────────────────
create table if not exists public.orcamento_eventos (
  id               uuid primary key default gen_random_uuid(),
  atividade_id     uuid not null references public.atividades(id),
  tdr_id           uuid,               -- sem FK: o TDR pode ser apagado (apagar_tdr)
  tdr_numero       text,
  evento           text not null check (evento in (
                     'tdr_criado','tdr_cancelado','tdr_reativado','tdr_valor_alterado',
                     'tdr_excluido','tdr_saiu_da_atividade','tdr_entrou_na_atividade',
                     'tdr_execucao_direta_alterada')),
  valor_antes_usd  numeric(14,2),
  valor_depois_usd numeric(14,2),
  efeito_usd       numeric(14,2) not null,  -- + consome saldo, − libera
  execucao_direta  boolean not null default false,
  criado_por       uuid,
  criado_em        timestamptz not null default now()
);
comment on table public.orcamento_eventos is
  'Eventos de TDR que alteram o débito da atividade (criação, cancelamento, mudança de valor…). '
  'Alimenta o extrato; o saldo NÃO é calculado daqui (é da vw_orcamento_debitos).';
create index if not exists idx_orcamento_eventos_atividade on public.orcamento_eventos (atividade_id, criado_em);

alter table public.orcamento_eventos enable row level security;
drop policy if exists orcamento_eventos_select on public.orcamento_eventos;
create policy orcamento_eventos_select on public.orcamento_eventos
  for select to authenticated using (auth.uid() is not null);
revoke all on public.orcamento_eventos from anon, authenticated, public;
grant select on public.orcamento_eventos to authenticated;

drop trigger if exists trg_orcamento_eventos_imutavel on public.orcamento_eventos;
create trigger trg_orcamento_eventos_imutavel before update or delete on public.orcamento_eventos
  for each row execute function public.fn_trg_orcamento_fontes_imutavel();

create or replace function public.fn_trg_tdr_evento_orcamento()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_antes  numeric := 0;
  v_depois numeric := 0;
  v_ev     text;
begin
  if tg_op in ('UPDATE','DELETE') and old.status <> 'cancelado' then v_antes := coalesce(old.valor_usd, 0); end if;
  if tg_op in ('INSERT','UPDATE') and new.status <> 'cancelado' then v_depois := coalesce(new.valor_usd, 0); end if;

  if tg_op = 'INSERT' then
    if v_depois = 0 then return null; end if;
    insert into public.orcamento_eventos (atividade_id, tdr_id, tdr_numero, evento, valor_depois_usd, efeito_usd, execucao_direta, criado_por)
    values (new.atividade_id, new.id, new.numero, 'tdr_criado', v_depois, v_depois, new.execucao_direta, auth.uid());
    return null;
  end if;

  if tg_op = 'DELETE' then
    if v_antes = 0 then return null; end if;
    insert into public.orcamento_eventos (atividade_id, tdr_id, tdr_numero, evento, valor_antes_usd, efeito_usd, execucao_direta, criado_por)
    values (old.atividade_id, old.id, old.numero, 'tdr_excluido', v_antes, -v_antes, old.execucao_direta, auth.uid());
    return null;
  end if;

  if new.atividade_id is distinct from old.atividade_id then
    if v_antes <> 0 then
      insert into public.orcamento_eventos (atividade_id, tdr_id, tdr_numero, evento, valor_antes_usd, efeito_usd, execucao_direta, criado_por)
      values (old.atividade_id, old.id, old.numero, 'tdr_saiu_da_atividade', v_antes, -v_antes, old.execucao_direta, auth.uid());
    end if;
    if v_depois <> 0 then
      insert into public.orcamento_eventos (atividade_id, tdr_id, tdr_numero, evento, valor_depois_usd, efeito_usd, execucao_direta, criado_por)
      values (new.atividade_id, new.id, new.numero, 'tdr_entrou_na_atividade', v_depois, v_depois, new.execucao_direta, auth.uid());
    end if;
    return null;
  end if;

  if new.execucao_direta is distinct from old.execucao_direta then
    insert into public.orcamento_eventos (atividade_id, tdr_id, tdr_numero, evento, valor_antes_usd, valor_depois_usd, efeito_usd, execucao_direta, criado_por)
    values (new.atividade_id, new.id, new.numero, 'tdr_execucao_direta_alterada', v_antes, v_depois, v_depois - v_antes, new.execucao_direta, auth.uid());
    return null;
  end if;

  if v_antes = v_depois then return null; end if;
  v_ev := case
    when old.status <> 'cancelado' and new.status = 'cancelado' then 'tdr_cancelado'
    when old.status = 'cancelado' and new.status <> 'cancelado' then 'tdr_reativado'
    else 'tdr_valor_alterado' end;
  insert into public.orcamento_eventos (atividade_id, tdr_id, tdr_numero, evento, valor_antes_usd, valor_depois_usd, efeito_usd, execucao_direta, criado_por)
  values (new.atividade_id, new.id, new.numero, v_ev, v_antes, v_depois, v_depois - v_antes, new.execucao_direta, auth.uid());
  return null;
end $$;

drop trigger if exists trg_tdr_evento_orcamento on public.tdrs;
create trigger trg_tdr_evento_orcamento after insert or update or delete on public.tdrs
  for each row execute function public.fn_trg_tdr_evento_orcamento();

-- ── 6. Débitos, saldo por fonte (PEPS) e resumo ────────────────────────
-- Views com o dono (postgres) — como vw_saldo_atividade —, para enxergar
-- todos os TDRs da atividade independentemente do RLS de tdrs; os números
-- agregados já são públicos para quem está logado. Somente leitura.
create or replace view public.vw_orcamento_debitos as
select a.id as atividade_id,
       coalesce(t.planejado, 0)::numeric(14,2)          as tdr_planejado_usd,
       coalesce(t.reserva_direta, 0)::numeric(14,2)     as reserva_execucao_direta_usd,
       coalesce(d.direta, 0)::numeric(14,2)             as execucao_direta_realizada_usd,
       coalesce(d.ct_sem_tdr, 0)::numeric(14,2)         as pagamentos_contrato_sem_tdr_usd,
       (coalesce(t.planejado, 0)
        + greatest(coalesce(t.reserva_direta, 0), coalesce(d.direta, 0))
        + coalesce(d.ct_sem_tdr, 0))::numeric(14,2)     as debito_usd,
       coalesce(t.sem_usd, 0)                           as tdrs_sem_valor_usd
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
             where ef.contrato_id is null and (ef.tdr_id is null or td.execucao_direta)) as direta,
           sum(ef.valor_usd) filter (
             where ef.contrato_id is not null and c.tdr_id is null)                     as ct_sem_tdr
      from public.execucao_financeira ef
      left join public.tdrs td on td.id = ef.tdr_id
      left join public.contratos c on c.id = ef.contrato_id
     where ef.atividade_id = a.id and ef.situacao <> 'cancelado'
  ) d on true;

create or replace view public.vw_orcamento_fontes_saldo as
with cred as (
  select f.*,
         (f.valor_usd + coalesce((select sum(j.valor_usd) from public.orcamento_fontes j
                                   where j.ajusta_fonte_id = f.id), 0))::numeric(14,2) as liquido_usd,
         (f.tipo <> 'dotacao_original') as ordem_tipo
    from public.orcamento_fontes f
   where f.ajusta_fonte_id is null
), ord as (
  select c.*, d.debito_usd,
         coalesce(sum(c.liquido_usd) over (
           partition by c.atividade_id order by c.ordem_tipo, c.criado_em, c.id
           rows between unbounded preceding and 1 preceding), 0) as acumulado_antes_usd,
         row_number() over (partition by c.atividade_id order by c.ordem_tipo, c.criado_em, c.id) as ordem_consumo
    from cred c
    join public.vw_orcamento_debitos d on d.atividade_id = c.atividade_id
)
select o.id as fonte_id, o.atividade_id, a.codigo as atividade_codigo, a.resultado_id,
       o.tipo, o.descricao, o.criado_em, o.criado_por, o.ordem_consumo,
       o.valor_usd as valor_original_usd, o.liquido_usd,
       least(o.liquido_usd, greatest(0, o.debito_usd - o.acumulado_antes_usd))::numeric(14,2) as consumido_usd,
       (o.liquido_usd - least(o.liquido_usd, greatest(0, o.debito_usd - o.acumulado_antes_usd)))::numeric(14,2) as disponivel_usd,
       o.encerramento_id, ce.contrato_id, ct.numero as contrato_numero,
       ce.tdr_id, td.numero as tdr_numero,
       o.fonte_origem_id, o.remanejamento_id
  from ord o
  join public.atividades a on a.id = o.atividade_id
  left join public.contrato_encerramentos ce on ce.id = o.encerramento_id
  left join public.contratos ct on ct.id = ce.contrato_id
  left join public.tdrs td on td.id = ce.tdr_id;

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
       round(v.saldo_livre_usd, 2)                                as saldo_livre_painel_usd
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
    select sum(fs.disponivel_usd) as disponivel
      from public.vw_orcamento_fontes_saldo fs where fs.atividade_id = a.id
  ) s on true;

revoke all on public.vw_orcamento_debitos, public.vw_orcamento_fontes_saldo, public.vw_orcamento_atividade
  from anon, authenticated, public;
grant select on public.vw_orcamento_debitos, public.vw_orcamento_fontes_saldo, public.vw_orcamento_atividade
  to authenticated, service_role;

-- ── 7. Conferência (invariantes do plano §2.4) ─────────────────────────
create or replace function public.fn_conferir_orcamento()
returns table (verificacao text, atividade_codigo text, esperado numeric, encontrado numeric, ok boolean, observacao text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null and coalesce(fn_perfil_atual()::text, '')
       not in ('super_admin','coordenacao','financeiro') then
    raise exception 'Sem permissão para conferir o razão orçamentário.';
  end if;

  -- 1. cache do orçamento vigente = Σ lançamentos orçamentários
  return query
  select 'orcamento_vigente_igual_razao'::text, a.codigo::text, x.razao, a.orcamento_usd,
         a.orcamento_usd = x.razao, null::text
    from public.atividades a
    cross join lateral (select coalesce(sum(f.valor_usd), 0)::numeric(14,2) as razao
                          from public.orcamento_fontes f where f.atividade_id = a.id and f.orcamentaria) x;

  -- 2. dotação original congelada = Σ dotacao_original
  return query
  select 'dotacao_original_igual_razao'::text, a.codigo::text, x.dot, a.orcamento_original_usd,
         a.orcamento_original_usd is not distinct from x.dot, null::text
    from public.atividades a
    cross join lateral (select sum(f.valor_usd)::numeric(14,2) as dot
                          from public.orcamento_fontes f where f.atividade_id = a.id and f.tipo = 'dotacao_original') x;

  -- 3. liberações no razão = liberações ativas que a vw_saldo_atividade soma
  return query
  select 'liberacoes_iguais_encerramentos'::text, a.codigo::text, e.enc, r.raz, e.enc = r.raz, null::text
    from public.atividades a
    cross join lateral (select coalesce(sum(round(ce.valor_liberado_usd, 2)), 0)::numeric(14,2) as enc
                          from public.contrato_encerramentos ce
                         where ce.atividade_id = a.id and ce.status = 'ativo') e
    cross join lateral (select coalesce(sum(f.valor_usd), 0)::numeric(14,2) as raz
                          from public.orcamento_fontes f
                         where f.atividade_id = a.id and f.tipo in ('economia_contratacao','encerramento_contrato')) r;

  -- 4. PEPS fecha: Σ disponível das fontes = max(0, créditos − débitos)
  return query
  select 'fontes_disponiveis_fecham'::text, o.codigo::text, greatest(0, o.saldo_usd), o.disponivel_fontes_usd,
         o.disponivel_fontes_usd = greatest(0, o.saldo_usd), null::text
    from public.vw_orcamento_atividade o;

  -- 5. nenhuma fonte com líquido negativo
  return query
  select 'fonte_sem_liquido_negativo'::text, fs.atividade_codigo::text, 0::numeric, fs.liquido_usd,
         false, 'fonte ' || fs.fonte_id::text
    from public.vw_orcamento_fontes_saldo fs where fs.liquido_usd < 0;

  -- 6. global: remanejamento não cria dinheiro
  return query
  select 'global_vigente_igual_original_mais_revisoes'::text, null::text,
         (select coalesce(sum(f.valor_usd), 0) from public.orcamento_fontes f
           where f.tipo in ('dotacao_original','revisao_orcamentaria'))::numeric(14,2),
         (select coalesce(sum(a.orcamento_usd), 0) from public.atividades a)::numeric(14,2),
         (select coalesce(sum(f.valor_usd), 0) from public.orcamento_fontes f
           where f.tipo in ('dotacao_original','revisao_orcamentaria'))
         = (select coalesce(sum(a.orcamento_usd), 0) from public.atividades a),
         null::text;

  -- 7. diferença entre o saldo do razão e o saldo livre do painel só pode
  --    vir de execução direta acima da reserva ou de pagamento de contrato sem TDR
  return query
  select 'diferenca_painel_explicada'::text, o.codigo::text,
         (greatest(0, o.execucao_direta_realizada_usd - o.reserva_execucao_direta_usd)
          + o.pagamentos_contrato_sem_tdr_usd)::numeric(14,2),
         (o.saldo_livre_painel_usd - o.saldo_usd)::numeric(14,2),
         (o.saldo_livre_painel_usd - o.saldo_usd)
           = greatest(0, o.execucao_direta_realizada_usd - o.reserva_execucao_direta_usd)
             + o.pagamentos_contrato_sem_tdr_usd,
         null::text
    from public.vw_orcamento_atividade o;

  -- 8. informativo (não bloqueia): resultado × Σ atividades e TDR sem USD
  return query
  select 'info_resultado_igual_atividades'::text, r.codigo::text, r.orcamento_usd,
         coalesce(s.soma, 0)::numeric(14,2), r.orcamento_usd is not distinct from coalesce(s.soma, 0),
         'pré-existente; resultados.orcamento_usd não é derivado ainda'::text
    from public.resultados r
    left join (select resultado_id, sum(orcamento_usd) soma from public.atividades group by 1) s
      on s.resultado_id = r.id;

  return query
  select 'info_tdr_ativo_sem_valor_usd'::text, o.codigo::text, 0::numeric, o.tdrs_sem_valor_usd::numeric,
         o.tdrs_sem_valor_usd = 0, 'TDR conta como zero no débito'::text
    from public.vw_orcamento_atividade o where o.tdrs_sem_valor_usd > 0;
end $$;

comment on function public.fn_conferir_orcamento() is
  'Invariantes do razão orçamentário (docs/remanejamento/plano.md §2.4). Linhas "info_*" '
  'são informativas; qualquer outra com ok=false é inconsistência crítica.';

-- ── 8. Permissões das funções (default ACL dá EXECUTE a anon/authenticated) ─
revoke all on function public.fn_trg_orcamento_fontes_valida()   from public, anon, authenticated;
revoke all on function public.fn_trg_orcamento_fontes_imutavel() from public, anon, authenticated;
revoke all on function public.fn_orcamento_recalcular_cache(uuid) from public, anon, authenticated;
revoke all on function public.fn_trg_orcamento_fontes_cache()    from public, anon, authenticated;
revoke all on function public.fn_trg_atividade_dotacao()         from public, anon, authenticated;
revoke all on function public.fn_trg_encerramento_razao()        from public, anon, authenticated;
revoke all on function public.fn_trg_encerramento_guarda()       from public, anon, authenticated;
revoke all on function public.fn_trg_tdr_evento_orcamento()      from public, anon, authenticated;
revoke all on function public.fn_conferir_orcamento()            from public, anon;
grant execute on function public.fn_conferir_orcamento() to authenticated;

-- ── 9. Carga inicial (idempotente) ─────────────────────────────────────
-- 9.1 TDRs guarda-chuva de viagens da 2.1.7 (decisão de 03/10/2026)
update public.tdrs t set execucao_direta = true
  from public.atividades a
 where a.id = t.atividade_id and a.codigo = '2.1.7'
   and t.numero in ('2.1.7-001','2.1.7-002') and not t.execucao_direta;

-- 9.2 Dotação original = orçamento de hoje
insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, descricao, criado_em)
select a.id, 'dotacao_original', a.orcamento_usd,
       'Dotação original da atividade ' || a.codigo || ' (carga inicial do razão, 03/10/2026)',
       coalesce(a.criado_em, now())
  from public.atividades a
 where a.orcamento_usd > 0
   and not exists (select 1 from public.orcamento_fontes f
                    where f.atividade_id = a.id and f.tipo = 'dotacao_original');

-- 9.3 Liberações já existentes (com o estorno, se revertidas)
insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, valor_brl_ref, encerramento_id, descricao, criado_por, criado_em)
select ce.atividade_id, ce.tipo, round(ce.valor_liberado_usd, 2), ce.valor_liberado_brl, ce.id,
       ce.motivo, ce.autorizado_por, ce.criado_em
  from public.contrato_encerramentos ce
 where coalesce(ce.valor_liberado_usd, 0) > 0 and ce.atividade_id is not null
   and not exists (select 1 from public.orcamento_fontes f where f.encerramento_id = ce.id);

insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, ajusta_fonte_id, estorno_de, encerramento_id, descricao, criado_por, criado_em)
select f.atividade_id, f.tipo, -f.valor_usd, f.id, f.id, f.encerramento_id,
       'Estorno: ' || coalesce(nullif(btrim(ce.motivo_reversao), ''), 'liberação revertida'),
       ce.revertido_por, coalesce(ce.revertido_em, now())
  from public.contrato_encerramentos ce
  join public.orcamento_fontes f on f.encerramento_id = ce.id and f.ajusta_fonte_id is null
 where ce.status = 'revertido'
   and not exists (select 1 from public.orcamento_fontes e where e.estorno_de = f.id);
