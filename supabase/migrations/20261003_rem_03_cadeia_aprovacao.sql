-- ════════════════════════════════════════════════════════════════════════
-- Aplicada em produção (03/10/2026) em partes, mesmo conteúdo: 20261003_rem_03a…03f;
-- fn_rem_salvar e o filtro `ativo` (rascunho sem DELETE) entraram em 20261003_rem_04_rascunho_sem_delete.
-- Remanejamento · Fase 3 — Pedido, cadeia de aprovação e efetivação
-- (docs/remanejamento/plano.md §3 e §4)
--
-- Pedido (remanejamentos) → itens por atividade (− origem / + destino, Σ = 0)
-- → alocações: de QUAL fonte do razão sai cada centavo da origem.
--
-- Cadeia SEQUENCIAL, por PESSOA (sem substituição):
--   1 solicitação ......... titular do cargo coordenacao_solicitante
--   2 liberação ........... responsável (papel 'responsavel') de cada atividade de origem
--   3 UNESCO .............. titular unesco_financeiro (perfil financeiro)
--   4 diretoria ........... titular diretor
--   5 secretaria .......... titular secretario → efetivação automática
-- Aprovar: avança e avisa SÓ o próximo. Devolver: volta UMA etapa e avisa SÓ
-- o anterior (a assinatura dele é reaberta). Recusar: encerra. Só o
-- solicitante edita; editar muda a versão e invalida todas as assinaturas.
--
-- Assinatura = senha de login reconfirmada no SERVIDOR: fn_rem_assinar só
-- tem EXECUTE para service_role e é chamada pela Edge Function
-- `assinar-remanejamento` depois de validar a senha. Cada assinatura grava o
-- SHA-256 do documento que a pessoa viu (fn_rem_hash) — documento alterado
-- depois não casa com a assinatura.
--
-- Reserva: alocações de pedido em aprovação reservam a fonte
-- (vw_orcamento_fontes_saldo.reservado_usd). A efetivação revalida o saldo
-- sob FOR UPDATE; se mudou, recusa e o pedido deve ser devolvido.
-- Efetivação = lançamentos no razão: remanejamento_cedido (−) em cada fonte
-- de origem e remanejamento_recebido (+) no destino com fonte_origem_id
-- (linhagem do centavo).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Cargos e titulares ──────────────────────────────────────────────
create table if not exists public.rem_cargos (
  codigo          text primary key,
  nome            text not null,
  ordem           integer not null,
  perfis_exigidos public.perfil_usuario[]
);
insert into public.rem_cargos (codigo, nome, ordem, perfis_exigidos) values
  ('coordenacao_solicitante', 'Coordenação (solicita)', 1, array['coordenacao','super_admin']::public.perfil_usuario[]),
  ('unesco_financeiro',       'UNESCO (financeiro)',    3, array['financeiro']::public.perfil_usuario[]),
  ('diretor',                 'Diretor(a)',             4, null),
  ('secretario',              'Secretário(a)',          5, null)
on conflict (codigo) do nothing;

create table if not exists public.rem_cargo_titulares (
  id              uuid primary key default gen_random_uuid(),
  cargo           text not null references public.rem_cargos(codigo),
  usuario_id      uuid not null references public.usuarios(id),
  vigencia_inicio timestamptz not null default now(),
  vigencia_fim    timestamptz,
  ato             text not null check (btrim(ato) <> ''),
  designado_por   uuid references public.usuarios(id),
  encerrado_por   uuid references public.usuarios(id),
  criado_em       timestamptz not null default now()
);
comment on table public.rem_cargo_titulares is
  'Titular nominal de cada cargo da cadeia de remanejamento, com vigência e ato (portaria/SEI). '
  'Um titular vigente por cargo e uma pessoa por cargo. Sem substituto. Escrita só por fn_rem_designar_titular.';
create unique index if not exists uq_rem_titular_cargo  on public.rem_cargo_titulares (cargo)      where vigencia_fim is null;
create unique index if not exists uq_rem_titular_pessoa on public.rem_cargo_titulares (usuario_id) where vigencia_fim is null;

create or replace function public.fn_trg_rem_titulares_guarda()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'REM: titularidade não é apagada — encerre a vigência.'; end if;
  if old.vigencia_fim is not null
     or new.cargo is distinct from old.cargo or new.usuario_id is distinct from old.usuario_id
     or new.vigencia_inicio is distinct from old.vigencia_inicio or new.ato is distinct from old.ato
     or new.designado_por is distinct from old.designado_por or new.vigencia_fim is null then
    raise exception 'REM: titularidade só admite encerrar a vigência, uma vez.';
  end if;
  return new;
end $$;
create or replace trigger trg_rem_titulares_guarda before update or delete on public.rem_cargo_titulares
  for each row execute function public.fn_trg_rem_titulares_guarda();

create or replace function public.fn_rem_titular(p_cargo text)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select t.usuario_id from public.rem_cargo_titulares t
    join public.usuarios u on u.id = t.usuario_id and u.ativo
   where t.cargo = p_cargo and t.vigencia_fim is null
$$;

create or replace function public.fn_rem_designar_titular(p_cargo text, p_usuario_id uuid, p_ato text)
returns public.rem_cargo_titulares language plpgsql security definer set search_path to 'public' as $$
declare
  v_cargo public.rem_cargos;
  v_perfil public.perfil_usuario;
  v_row public.rem_cargo_titulares;
begin
  if coalesce(fn_perfil_atual()::text, '') <> 'super_admin' then
    raise exception 'Sem permissão: só super_admin designa titulares da cadeia de remanejamento.';
  end if;
  if coalesce(btrim(p_ato), '') = '' then raise exception 'Informe o ato da designação (portaria, SEI…).'; end if;
  select * into v_cargo from public.rem_cargos where codigo = p_cargo;
  if not found then raise exception 'Cargo inexistente: %', p_cargo; end if;

  if p_usuario_id is not null then
    select perfil into v_perfil from public.usuarios where id = p_usuario_id and ativo;
    if not found then raise exception 'Usuário inexistente ou inativo.'; end if;
    if v_cargo.perfis_exigidos is not null and not (v_perfil = any (v_cargo.perfis_exigidos)) then
      raise exception 'O cargo % exige perfil %, e o usuário tem %.', v_cargo.nome, v_cargo.perfis_exigidos, v_perfil;
    end if;
  end if;

  update public.rem_cargo_titulares
     set vigencia_fim = now(), encerrado_por = auth.uid()
   where cargo = p_cargo and vigencia_fim is null;

  if p_usuario_id is not null then
    insert into public.rem_cargo_titulares (cargo, usuario_id, ato, designado_por)
    values (p_cargo, p_usuario_id, btrim(p_ato), auth.uid())
    returning * into v_row;
  end if;
  return v_row;
end $$;

-- ── 2. Pedido, itens, alocações, etapas, assinaturas ───────────────────
create table if not exists public.remanejamentos (
  id                  uuid primary key default gen_random_uuid(),
  numero              text not null unique,
  tipo                text not null default 'livre' check (tipo in ('livre','cobertura_contrato')),
  contrato_id         uuid references public.contratos(id),
  justificativa       text not null check (btrim(justificativa) <> ''),
  status              text not null default 'rascunho'
                        check (status in ('rascunho','em_aprovacao','efetivado','recusado','cancelado','estornado')),
  etapa_atual         integer,
  versao              integer not null default 1,
  hash_documento      text,
  uuid_cliente        uuid unique,
  criado_por          uuid not null references public.usuarios(id),
  criado_em           timestamptz not null default now(),
  submetido_em        timestamptz,
  efetivado_em        timestamptz,
  encerrado_em        timestamptz,
  motivo_encerramento text,
  atualizado_em       timestamptz not null default now()
);
comment on table public.remanejamentos is
  'Pedido de remanejamento entre atividades. Escrita só por fn_rem_salvar (rascunho) e '
  'fn_rem_assinar (cadeia, via Edge Function assinar-remanejamento). Ver docs/remanejamento/plano.md.';

create table if not exists public.rem_numeracao (ano integer primary key, ultimo integer not null);

create table if not exists public.remanejamento_itens (
  id               uuid primary key default gen_random_uuid(),
  remanejamento_id uuid not null references public.remanejamentos(id),
  atividade_id     uuid not null references public.atividades(id),
  valor_usd        numeric(14,2) not null check (valor_usd <> 0),
  ativo            boolean not null default true,   -- false = retirado do rascunho (nada é apagado)
  unique (remanejamento_id, atividade_id)
);
create table if not exists public.remanejamento_alocacoes (
  id               uuid primary key default gen_random_uuid(),
  remanejamento_id uuid not null references public.remanejamentos(id),
  item_id          uuid not null references public.remanejamento_itens(id),
  fonte_id         uuid not null references public.orcamento_fontes(id),
  valor_usd        numeric(14,2) not null check (valor_usd > 0),
  ativo            boolean not null default true,   -- false = retirada do rascunho (nada é apagado)
  unique (item_id, fonte_id)
);
create index if not exists idx_rem_alocacoes_fonte on public.remanejamento_alocacoes (fonte_id);

create table if not exists public.remanejamento_etapas (
  id               uuid primary key default gen_random_uuid(),
  remanejamento_id uuid not null references public.remanejamentos(id),
  versao           integer not null,
  ordem            integer not null,
  papel            text not null check (papel in ('solicitacao','liberacao_origem','unesco','diretoria','secretaria')),
  cargo            text references public.rem_cargos(codigo),
  atividade_id     uuid references public.atividades(id),
  assinatura_id    uuid,
  unique (remanejamento_id, versao, ordem),
  check ((papel = 'liberacao_origem') = (atividade_id is not null and cargo is null))
);

create table if not exists public.remanejamento_assinaturas (
  id                  uuid primary key default gen_random_uuid(),
  remanejamento_id    uuid not null references public.remanejamentos(id),
  etapa_id            uuid not null references public.remanejamento_etapas(id),
  versao              integer not null,
  usuario_id          uuid not null references public.usuarios(id),
  cargo               text,
  titular_id          uuid references public.rem_cargo_titulares(id),
  decisao             text not null check (decisao in ('aprovar','devolver','recusar','cancelar')),
  motivo              text,
  hash_documento      text not null,
  senha_verificada_em timestamptz not null,
  ip                  text,
  user_agent          text,
  criado_em           timestamptz not null default now(),
  invalidada_em       timestamptz,
  invalidada_motivo   text
);
do $fk$ begin
  if not exists (select 1 from pg_constraint where conname = 'remanejamento_etapas_assinatura_fk') then
    alter table public.remanejamento_etapas
      add constraint remanejamento_etapas_assinatura_fk
      foreign key (assinatura_id) references public.remanejamento_assinaturas(id);
  end if;
end $fk$;

create table if not exists public.remanejamento_historico (
  id               uuid primary key default gen_random_uuid(),
  remanejamento_id uuid not null references public.remanejamentos(id),
  evento           text not null,
  status_de        text,
  status_para      text,
  etapa_ordem      integer,
  versao           integer,
  usuario_id       uuid references public.usuarios(id),
  motivo           text,
  detalhes         jsonb,
  criado_em        timestamptz not null default now()
);
create index if not exists idx_rem_historico on public.remanejamento_historico (remanejamento_id, criado_em);

-- Fila de e-mails (drenada pela Edge Function assinar-remanejamento)
create table if not exists public.remanejamento_notificacoes (
  id               uuid primary key default gen_random_uuid(),
  remanejamento_id uuid not null references public.remanejamentos(id),
  usuario_id       uuid not null references public.usuarios(id),
  evento           text not null check (evento in ('analisar','devolvido','recusado','efetivado','cancelado')),
  motivo           text,
  criado_em        timestamptz not null default now(),
  enviado_em       timestamptz,
  tentativas       integer not null default 0,
  ultimo_erro      text
);
create index if not exists idx_rem_notif_pendentes on public.remanejamento_notificacoes (criado_em) where enviado_em is null;

create table if not exists public.rem_tentativas_senha (
  id         bigserial primary key,
  usuario_id uuid not null,
  sucesso    boolean not null,
  criado_em  timestamptz not null default now()
);
create index if not exists idx_rem_tentativas on public.rem_tentativas_senha (usuario_id, criado_em);

-- ── 3. Guardas (imutabilidade e edição só em rascunho) ─────────────────
create or replace function public.fn_trg_rem_filhos_rascunho()
returns trigger language plpgsql as $$
declare v_status text;
begin
  select status into v_status from public.remanejamentos
   where id = case when tg_op = 'DELETE' then old.remanejamento_id else new.remanejamento_id end;
  if v_status is distinct from 'rascunho' then
    raise exception 'REM: itens e alocações só mudam com o pedido em rascunho (status %).', v_status;
  end if;
  return coalesce(new, old);
end $$;
create or replace trigger trg_rem_itens_rascunho before insert or update or delete on public.remanejamento_itens
  for each row execute function public.fn_trg_rem_filhos_rascunho();
create or replace trigger trg_rem_alocacoes_rascunho before insert or update or delete on public.remanejamento_alocacoes
  for each row execute function public.fn_trg_rem_filhos_rascunho();

create or replace function public.fn_trg_rem_assinaturas_guarda()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'REM: assinatura não é apagada.'; end if;
  if old.invalidada_em is not null or new.invalidada_em is null
     or (to_jsonb(new) - 'invalidada_em' - 'invalidada_motivo') <> (to_jsonb(old) - 'invalidada_em' - 'invalidada_motivo') then
    raise exception 'REM: assinatura é imutável (só pode ser invalidada, uma vez).';
  end if;
  return new;
end $$;
create or replace trigger trg_rem_assinaturas_guarda before update or delete on public.remanejamento_assinaturas
  for each row execute function public.fn_trg_rem_assinaturas_guarda();

create or replace trigger trg_rem_historico_imutavel before update or delete on public.remanejamento_historico
  for each row execute function public.fn_trg_orcamento_fontes_imutavel();

create or replace function public.fn_trg_rem_etapas_guarda()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'REM: etapa não é apagada.'; end if;
  if (to_jsonb(new) - 'assinatura_id') <> (to_jsonb(old) - 'assinatura_id') then
    raise exception 'REM: etapa só muda a assinatura vigente.';
  end if;
  return new;
end $$;
create or replace trigger trg_rem_etapas_guarda before update or delete on public.remanejamento_etapas
  for each row execute function public.fn_trg_rem_etapas_guarda();

create or replace function public.fn_trg_rem_pedido_guarda()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'REM: pedido não é apagado — cancele.'; end if;
  if old.status in ('efetivado','recusado','cancelado','estornado')
     and (to_jsonb(new) - 'atualizado_em') <> (to_jsonb(old) - 'atualizado_em')
     and not (old.status = 'efetivado' and new.status = 'estornado') then
    raise exception 'REM: pedido % encerrado (%) não muda.', old.numero, old.status;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
create or replace trigger trg_rem_pedido_guarda before update or delete on public.remanejamentos
  for each row execute function public.fn_trg_rem_pedido_guarda();

-- ── 4. Hash, reservas e saldo livre por fonte ──────────────────────────
create or replace function public.fn_rem_hash(p_id uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'numero', r.numero, 'tipo', r.tipo, 'contrato_id', r.contrato_id,
    'justificativa', r.justificativa, 'versao', r.versao,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('atividade_id', i.atividade_id, 'valor_usd', i.valor_usd)
                                        order by i.atividade_id), '[]'::jsonb)
                from public.remanejamento_itens i where i.remanejamento_id = r.id and i.ativo),
    'alocacoes', (select coalesce(jsonb_agg(jsonb_build_object('atividade_id', i.atividade_id, 'fonte_id', a.fonte_id,
                                                               'valor_usd', a.valor_usd)
                                            order by i.atividade_id, a.fonte_id), '[]'::jsonb)
                    from public.remanejamento_alocacoes a join public.remanejamento_itens i on i.id = a.item_id
                   where a.remanejamento_id = r.id and a.ativo)
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.remanejamentos r where r.id = p_id
$$;

create or replace view public.vw_rem_reservas as
select a.fonte_id, a.remanejamento_id, sum(a.valor_usd)::numeric(14,2) as reservado_usd
  from public.remanejamento_alocacoes a
  join public.remanejamentos r on r.id = a.remanejamento_id and r.status = 'em_aprovacao'
 where a.ativo
 group by a.fonte_id, a.remanejamento_id;

-- Saldo por fonte ganha reservado e livre (colunas novas no fim; demais iguais à rem_01)
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
), calc as (
  select o.*,
         least(o.liquido_usd, greatest(0, o.debito_usd - o.acumulado_antes_usd))::numeric(14,2) as consumido_calc,
         coalesce((select sum(rr.reservado_usd) from public.vw_rem_reservas rr where rr.fonte_id = o.id), 0)::numeric(14,2) as reservado_calc
    from ord o
)
select o.id as fonte_id, o.atividade_id, a.codigo as atividade_codigo, a.resultado_id,
       o.tipo, o.descricao, o.criado_em, o.criado_por, o.ordem_consumo,
       o.valor_usd as valor_original_usd, o.liquido_usd,
       o.consumido_calc as consumido_usd,
       (o.liquido_usd - o.consumido_calc)::numeric(14,2) as disponivel_usd,
       o.encerramento_id, ce.contrato_id, ct.numero as contrato_numero,
       ce.tdr_id, td.numero as tdr_numero,
       o.fonte_origem_id, o.remanejamento_id,
       o.reservado_calc as reservado_usd,
       greatest(0, o.liquido_usd - o.consumido_calc - o.reservado_calc)::numeric(14,2) as livre_usd
  from calc o
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
       round(v.saldo_livre_usd, 2)                                as saldo_livre_painel_usd,
       coalesce(s.reservado, 0)::numeric(14,2)                    as reservado_usd,
       coalesce(s.livre, 0)::numeric(14,2)                        as remanejavel_usd
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
  ) s on true;

-- Saldo livre de uma fonte para um pedido (desconta reservas de OUTROS pedidos)
create or replace function public.fn_rem_fonte_livre(p_fonte_id uuid, p_remanejamento_id uuid)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select (fs.disponivel_usd
          - coalesce((select sum(rr.reservado_usd) from public.vw_rem_reservas rr
                       where rr.fonte_id = fs.fonte_id and rr.remanejamento_id is distinct from p_remanejamento_id), 0)
         )::numeric(14,2)
    from public.vw_orcamento_fontes_saldo fs
   where fs.fonte_id = p_fonte_id
     and fs.atividade_id = (select atividade_id from public.orcamento_fontes where id = p_fonte_id)
$$;

-- ── 5. Utilitários internos ────────────────────────────────────────────
create or replace function public.fn_rem_log(p_rem uuid, p_evento text, p_de text, p_para text,
                                             p_etapa integer, p_usuario uuid, p_motivo text, p_detalhes jsonb default null)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.remanejamento_historico (remanejamento_id, evento, status_de, status_para, etapa_ordem, versao, usuario_id, motivo, detalhes)
  select p_rem, p_evento, p_de, p_para, p_etapa, r.versao, p_usuario, nullif(btrim(p_motivo), ''), p_detalhes
    from public.remanejamentos r where r.id = p_rem
$$;

-- Quem pode assinar uma etapa (pessoas, sem substituto)
create or replace function public.fn_rem_signatarios_etapa(p_etapa_id uuid)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct u.id
    from public.remanejamento_etapas e
    join public.usuarios u on u.ativo
   where e.id = p_etapa_id
     and (
       (e.papel = 'liberacao_origem' and exists (
          select 1 from public.atividade_responsaveis r
           where r.atividade_id = e.atividade_id and r.usuario_id = u.id and r.ativo and r.papel = 'responsavel'))
       or (e.papel <> 'liberacao_origem' and u.id = public.fn_rem_titular(e.cargo))
     )
$$;

create or replace function public.fn_rem_notificar(p_rem uuid, p_usuarios uuid[], p_evento text, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_numero text;
  v_titulo text;
  u uuid;
begin
  select numero into v_numero from public.remanejamentos where id = p_rem;
  v_titulo := case p_evento
    when 'analisar'  then 'Remanejamento ' || v_numero || ' aguarda sua análise'
    when 'devolvido' then 'Remanejamento ' || v_numero || ' foi devolvido para você'
    when 'recusado'  then 'Remanejamento ' || v_numero || ' foi recusado'
    when 'efetivado' then 'Remanejamento ' || v_numero || ' foi efetivado'
    else 'Remanejamento ' || v_numero || ' foi cancelado' end;
  foreach u in array coalesce(p_usuarios, '{}') loop
    if u is null then continue; end if;
    insert into public.remanejamento_notificacoes (remanejamento_id, usuario_id, evento, motivo)
    values (p_rem, u, p_evento, nullif(btrim(p_motivo), ''));
    -- sino: se o tipo ainda não estiver liberado no check de notificacoes, segue só o e-mail
    begin
      insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
      values (u, 'remanejamento_' || p_evento, v_titulo, nullif(btrim(p_motivo), ''),
              'remanejamentos.html?id=' || p_rem, 'remanejamento', p_rem);
    exception when others then null;
    end;
  end loop;
end $$;

-- Validação completa do pedido (para submeter, reaprovar e efetivar)
create or replace function public.fn_rem_validar(p_rem uuid)
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_soma numeric; v_n_or integer; v_n_de integer;
  r record;
begin
  if (select btrim(justificativa) in ('', '(rascunho)') or length(btrim(justificativa)) < 15
        from public.remanejamentos where id = p_rem) then
    raise exception 'REM_INVALIDO: escreva a justificativa do remanejamento (mínimo 15 caracteres).';
  end if;
  select coalesce(sum(valor_usd), 0), count(*) filter (where valor_usd < 0), count(*) filter (where valor_usd > 0)
    into v_soma, v_n_or, v_n_de
    from public.remanejamento_itens where remanejamento_id = p_rem and ativo;
  if v_n_or = 0 or v_n_de = 0 then
    raise exception 'REM_INVALIDO: o pedido precisa de ao menos uma origem (valor negativo) e um destino (positivo).';
  end if;
  if v_soma <> 0 then
    raise exception 'REM_INVALIDO: a soma dos itens precisa ser zero (está em US$ %).', v_soma;
  end if;

  for r in
    select i.id, i.atividade_id, a.codigo, a.ativo, i.valor_usd,
           coalesce((select sum(x.valor_usd) from public.remanejamento_alocacoes x where x.item_id = i.id and x.ativo), 0) as alocado
      from public.remanejamento_itens i join public.atividades a on a.id = i.atividade_id
     where i.remanejamento_id = p_rem and i.ativo
  loop
    if not r.ativo then raise exception 'REM_INVALIDO: atividade % inativa.', r.codigo; end if;
    if r.valor_usd > 0 and r.alocado <> 0 then
      raise exception 'REM_INVALIDO: destino % não leva alocação de fonte.', r.codigo;
    end if;
    if r.valor_usd < 0 and r.alocado <> -r.valor_usd then
      raise exception 'REM_INVALIDO: as fontes alocadas na origem % somam US$ %, mas a cessão é de US$ %.',
        r.codigo, r.alocado, -r.valor_usd;
    end if;
    if r.valor_usd < 0 and (select tdrs_sem_valor_usd from public.vw_orcamento_debitos where atividade_id = r.atividade_id) > 0 then
      raise exception 'REM_INVALIDO: a origem % tem TDR ativo sem valor em USD — o débito é desconhecido.', r.codigo;
    end if;
  end loop;

  for r in
    select x.fonte_id, x.valor_usd, i.atividade_id, a.codigo, f.atividade_id as fonte_atividade, f.ajusta_fonte_id
      from public.remanejamento_alocacoes x
      join public.remanejamento_itens i on i.id = x.item_id
      join public.atividades a on a.id = i.atividade_id
      join public.orcamento_fontes f on f.id = x.fonte_id
     where x.remanejamento_id = p_rem and x.ativo
  loop
    if r.fonte_atividade <> r.atividade_id or r.ajusta_fonte_id is not null then
      raise exception 'REM_INVALIDO: a fonte % não é um crédito da atividade %.', r.fonte_id, r.codigo;
    end if;
    if r.valor_usd > public.fn_rem_fonte_livre(r.fonte_id, p_rem) then
      raise exception 'SALDO_INSUFICIENTE: a fonte % da atividade % tem US$ % livre, e o pedido aloca US$ %.',
        r.fonte_id, r.codigo, public.fn_rem_fonte_livre(r.fonte_id, p_rem), r.valor_usd;
    end if;
  end loop;
end $$;

-- ── 6. Rascunho (sem senha) ────────────────────────────────────────────
-- p_dados: { justificativa, uuid_cliente, itens:[{atividade_id, valor_usd}],
--            alocacoes:[{atividade_id (origem), fonte_id, valor_usd}] }
create or replace function public.fn_rem_salvar(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid  uuid := auth.uid();
  v_rem  public.remanejamentos;
  v_ano  integer := extract(year from fn_hoje_acre())::integer;
  v_seq  integer;
  v_it   jsonb;
  v_item uuid;
begin
  if coalesce(fn_perfil_atual()::text, '') not in ('coordenacao','super_admin') then
    raise exception 'Sem permissão: só a coordenação monta pedido de remanejamento.';
  end if;
  if coalesce(p_dados->>'tipo', 'livre') <> 'livre' then
    raise exception 'REM: pedido de cobertura de contrato nasce do cadastro do contrato (fase seguinte).';
  end if;

  if p_id is null then
    if p_dados ? 'uuid_cliente' then
      select * into v_rem from public.remanejamentos where uuid_cliente = (p_dados->>'uuid_cliente')::uuid;
      if found then return v_rem.id; end if;
    end if;
    insert into public.rem_numeracao (ano, ultimo) values (v_ano, 1)
      on conflict (ano) do update set ultimo = public.rem_numeracao.ultimo + 1
      returning ultimo into v_seq;
    insert into public.remanejamentos (numero, tipo, justificativa, uuid_cliente, criado_por)
    values ('REM-' || v_ano || '-' || lpad(v_seq::text, 3, '0'), 'livre',
            coalesce(nullif(btrim(p_dados->>'justificativa'), ''), '(rascunho)'),
            (p_dados->>'uuid_cliente')::uuid, v_uid)
    returning * into v_rem;
    perform fn_rem_log(v_rem.id, 'criado', null, 'rascunho', null, v_uid, null);
  else
    select * into v_rem from public.remanejamentos where id = p_id for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if v_rem.criado_por <> v_uid and coalesce(fn_perfil_atual()::text, '') <> 'super_admin' then
      raise exception 'Só quem criou o pedido o edita.';
    end if;
    if v_rem.status = 'em_aprovacao' and v_rem.etapa_atual = 1 then
      -- devolvido ao solicitante: editar abre nova versão; a cadeia recomeça
      update public.remanejamento_assinaturas
         set invalidada_em = now(), invalidada_motivo = 'pedido editado pelo solicitante (nova versão)'
       where remanejamento_id = v_rem.id and versao = v_rem.versao and invalidada_em is null;
      update public.remanejamentos set status = 'rascunho', etapa_atual = null, versao = versao + 1
       where id = v_rem.id returning * into v_rem;
      perform fn_rem_log(v_rem.id, 'editado_apos_devolucao', 'em_aprovacao', 'rascunho', 1, v_uid, null);
    elsif v_rem.status <> 'rascunho' then
      raise exception 'Pedido % em % não pode ser editado.', v_rem.numero, v_rem.status;
    end if;
    update public.remanejamentos
       set justificativa = coalesce(nullif(btrim(p_dados->>'justificativa'), ''), justificativa)
     where id = v_rem.id;
  end if;

  -- Nada é apagado: o que sai do rascunho fica com ativo = false (histórico do rascunho);
  -- o que volta é reativado com o valor novo.
  if p_dados ? 'itens' then
    update public.remanejamento_alocacoes set ativo = false where remanejamento_id = v_rem.id and ativo;
    update public.remanejamento_itens     set ativo = false where remanejamento_id = v_rem.id and ativo;
    for v_it in select * from jsonb_array_elements(p_dados->'itens') loop
      insert into public.remanejamento_itens (remanejamento_id, atividade_id, valor_usd)
      values (v_rem.id, (v_it->>'atividade_id')::uuid, round((v_it->>'valor_usd')::numeric, 2))
      on conflict (remanejamento_id, atividade_id)
        do update set valor_usd = excluded.valor_usd, ativo = true;
    end loop;
    for v_it in select * from jsonb_array_elements(coalesce(p_dados->'alocacoes', '[]'::jsonb)) loop
      select id into v_item from public.remanejamento_itens
       where remanejamento_id = v_rem.id and atividade_id = (v_it->>'atividade_id')::uuid and valor_usd < 0 and ativo;
      if v_item is null then
        raise exception 'Alocação para atividade que não é origem do pedido: %', v_it->>'atividade_id';
      end if;
      insert into public.remanejamento_alocacoes (remanejamento_id, item_id, fonte_id, valor_usd)
      values (v_rem.id, v_item, (v_it->>'fonte_id')::uuid, round((v_it->>'valor_usd')::numeric, 2))
      on conflict (item_id, fonte_id)
        do update set valor_usd = excluded.valor_usd, ativo = true;
    end loop;
  end if;

  update public.remanejamentos set hash_documento = fn_rem_hash(id) where id = v_rem.id;
  perform fn_rem_log(v_rem.id, 'rascunho_salvo', null, null, null, v_uid, null);
  return v_rem.id;
end $$;

-- ── 7. Efetivação (interna) ────────────────────────────────────────────
create or replace function public.fn_rem_efetivar(p_rem uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_rem public.remanejamentos;
  o record; d record;
  v_origens jsonb := '[]'; v_destinos jsonb := '[]';
  i integer := 0; j integer := 0;
  v_resto_o numeric; v_resto_d numeric; v_x numeric;
begin
  select * into v_rem from public.remanejamentos where id = p_rem;

  -- trava as atividades envolvidas em ordem fixa (evita corrida e deadlock)
  perform 1 from public.atividades
   where id in (select atividade_id from public.remanejamento_itens where remanejamento_id = p_rem and ativo)
   order by id for update;

  perform fn_rem_validar(p_rem);   -- revalida saldo/reservas sob a trava

  -- cessões: cada alocação vira lançamento negativo na fonte de origem
  for o in
    select x.id, x.fonte_id, x.valor_usd, i.atividade_id, a.codigo
      from public.remanejamento_alocacoes x
      join public.remanejamento_itens i on i.id = x.item_id
      join public.atividades a on a.id = i.atividade_id
      join public.orcamento_fontes f on f.id = x.fonte_id
     where x.remanejamento_id = p_rem and x.ativo
     order by a.codigo, f.criado_em, f.id
  loop
    insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, ajusta_fonte_id, remanejamento_id, descricao, criado_por)
    values (o.atividade_id, 'remanejamento_cedido', -o.valor_usd, o.fonte_id, p_rem,
            'Cedido em ' || v_rem.numero, p_usuario);
    v_origens := v_origens || jsonb_build_object('fonte_id', o.fonte_id, 'codigo', o.codigo, 'valor', o.valor_usd);
  end loop;

  for d in
    select i.atividade_id, a.codigo, i.valor_usd
      from public.remanejamento_itens i join public.atividades a on a.id = i.atividade_id
     where i.remanejamento_id = p_rem and i.valor_usd > 0 and i.ativo
     order by a.codigo
  loop
    v_destinos := v_destinos || jsonb_build_object('atividade_id', d.atividade_id, 'codigo', d.codigo, 'valor', d.valor_usd);
  end loop;

  -- recebimentos: pareia origens × destinos na ordem (centavo exato, sem rateio)
  v_resto_o := (v_origens->0->>'valor')::numeric;
  v_resto_d := (v_destinos->0->>'valor')::numeric;
  while i < jsonb_array_length(v_origens) and j < jsonb_array_length(v_destinos) loop
    v_x := least(v_resto_o, v_resto_d);
    insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, fonte_origem_id, remanejamento_id, descricao, criado_por)
    values ((v_destinos->j->>'atividade_id')::uuid, 'remanejamento_recebido', v_x,
            (v_origens->i->>'fonte_id')::uuid, p_rem,
            'Recebido em ' || v_rem.numero || ' de ' || (v_origens->i->>'codigo'), p_usuario);
    v_resto_o := v_resto_o - v_x;
    v_resto_d := v_resto_d - v_x;
    if v_resto_o = 0 then
      i := i + 1;
      if i < jsonb_array_length(v_origens) then v_resto_o := (v_origens->i->>'valor')::numeric; end if;
    end if;
    if v_resto_d = 0 then
      j := j + 1;
      if j < jsonb_array_length(v_destinos) then v_resto_d := (v_destinos->j->>'valor')::numeric; end if;
    end if;
  end loop;
  if i < jsonb_array_length(v_origens) or j < jsonb_array_length(v_destinos) then
    raise exception 'REM: pareamento origem × destino não fechou (bug) — nada foi gravado.';
  end if;

  update public.remanejamentos
     set status = 'efetivado', efetivado_em = now(), etapa_atual = null
   where id = p_rem;
  perform fn_rem_log(p_rem, 'efetivado', 'em_aprovacao', 'efetivado', null, p_usuario, null,
                     jsonb_build_object('origens', v_origens, 'destinos', v_destinos));
end $$;

-- ── 8. Assinatura (SÓ service_role, via Edge Function com senha) ───────
create or replace function public.fn_rem_assinar(
  p_usuario_id uuid, p_remanejamento_id uuid, p_decisao text, p_motivo text,
  p_hash text, p_ip text default null, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_rem    public.remanejamentos;
  v_etapa  public.remanejamento_etapas;
  v_ant    public.remanejamento_etapas;
  v_prox   public.remanejamento_etapas;
  v_total  integer;
  v_ass    uuid;
  v_titular uuid;
  v_ordem  integer := 0;
  o record;
  v_avisar uuid[];
begin
  if p_decisao not in ('aprovar','devolver','recusar','cancelar') then
    raise exception 'Decisão inválida: %', p_decisao;
  end if;
  if not exists (select 1 from public.usuarios where id = p_usuario_id and ativo) then
    raise exception 'Usuário inexistente ou inativo.';
  end if;

  select * into v_rem from public.remanejamentos where id = p_remanejamento_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if p_hash is distinct from fn_rem_hash(v_rem.id) then
    raise exception 'DOCUMENTO_ALTERADO: o pedido mudou depois que você o abriu. Recarregue e confira antes de assinar.';
  end if;

  -- ── cancelar (solicitante, antes de sair da mão dele)
  if p_decisao = 'cancelar' then
    if not (v_rem.status = 'rascunho' or (v_rem.status = 'em_aprovacao' and v_rem.etapa_atual = 1)) then
      raise exception 'Só dá para cancelar em rascunho ou quando o pedido está devolvido ao solicitante.';
    end if;
    if p_usuario_id <> v_rem.criado_por and p_usuario_id is distinct from fn_rem_titular('coordenacao_solicitante') then
      raise exception 'Só o solicitante cancela o pedido.';
    end if;
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
    update public.remanejamento_assinaturas set invalidada_em = now(), invalidada_motivo = 'pedido cancelado'
     where remanejamento_id = v_rem.id and versao = v_rem.versao and invalidada_em is null;
    update public.remanejamentos set status = 'cancelado', etapa_atual = null, encerrado_em = now(),
           motivo_encerramento = btrim(p_motivo) where id = v_rem.id;
    perform fn_rem_log(v_rem.id, 'cancelado', v_rem.status, 'cancelado', v_rem.etapa_atual, p_usuario_id, p_motivo);
    return jsonb_build_object('status', 'cancelado');
  end if;

  -- ── submissão (rascunho → cadeia)
  if v_rem.status = 'rascunho' then
    if p_decisao <> 'aprovar' then raise exception 'Pedido em rascunho: só é possível enviar (aprovar) ou cancelar.'; end if;
    v_titular := fn_rem_titular('coordenacao_solicitante');
    if v_titular is null then raise exception 'SEM_SIGNATARIO: o cargo de coordenação solicitante está sem titular.'; end if;
    if p_usuario_id <> v_titular then
      raise exception 'Só o titular da coordenação solicitante envia o pedido.';
    end if;
    perform fn_rem_validar(v_rem.id);

    -- monta a cadeia desta versão
    insert into public.remanejamento_etapas (remanejamento_id, versao, ordem, papel, cargo)
    values (v_rem.id, v_rem.versao, 1, 'solicitacao', 'coordenacao_solicitante');
    v_ordem := 1;
    for o in
      select i.atividade_id, a.codigo from public.remanejamento_itens i join public.atividades a on a.id = i.atividade_id
       where i.remanejamento_id = v_rem.id and i.valor_usd < 0 and i.ativo order by a.codigo
    loop
      v_ordem := v_ordem + 1;
      insert into public.remanejamento_etapas (remanejamento_id, versao, ordem, papel, atividade_id)
      values (v_rem.id, v_rem.versao, v_ordem, 'liberacao_origem', o.atividade_id);
    end loop;
    insert into public.remanejamento_etapas (remanejamento_id, versao, ordem, papel, cargo) values
      (v_rem.id, v_rem.versao, v_ordem + 1, 'unesco',    'unesco_financeiro'),
      (v_rem.id, v_rem.versao, v_ordem + 2, 'diretoria', 'diretor'),
      (v_rem.id, v_rem.versao, v_ordem + 3, 'secretaria','secretario');

    -- toda etapa precisa de alguém que possa assinar e que não assine outra etapa
    for v_etapa in select * from public.remanejamento_etapas
                    where remanejamento_id = v_rem.id and versao = v_rem.versao order by ordem loop
      if not exists (
        select 1 from fn_rem_signatarios_etapa(v_etapa.id) s(uid)
         where v_etapa.papel <> 'liberacao_origem'
            or not exists (select 1 from public.rem_cargo_titulares t
                            where t.usuario_id = s.uid and t.vigencia_fim is null)) then
        raise exception 'SEM_SIGNATARIO: a etapa % (%) não tem quem assine%.', v_etapa.ordem,
          coalesce((select codigo from public.atividades where id = v_etapa.atividade_id), v_etapa.cargo),
          case when v_etapa.papel = 'liberacao_origem'
               then ' — a atividade precisa de um responsável que não ocupe cargo da cadeia' else '' end;
      end if;
    end loop;

    select * into v_etapa from public.remanejamento_etapas
     where remanejamento_id = v_rem.id and versao = v_rem.versao and ordem = 1;
    update public.remanejamentos set status = 'em_aprovacao', submetido_em = now(), etapa_atual = 1
     where id = v_rem.id returning * into v_rem;
    perform fn_rem_log(v_rem.id, 'enviado', 'rascunho', 'em_aprovacao', 1, p_usuario_id, null);
  else
    if v_rem.status <> 'em_aprovacao' then
      raise exception 'Pedido % está % — nada a assinar.', v_rem.numero, v_rem.status;
    end if;
    select * into v_etapa from public.remanejamento_etapas
     where remanejamento_id = v_rem.id and versao = v_rem.versao and ordem = v_rem.etapa_atual;
    if not exists (select 1 from fn_rem_signatarios_etapa(v_etapa.id) s(uid) where s.uid = p_usuario_id) then
      raise exception 'NAO_E_SUA_VEZ: a etapa atual (%) não é sua.', v_etapa.ordem;
    end if;
  end if;

  -- segregação: a mesma pessoa não aprova duas etapas da mesma versão
  -- (o mesmo responsável pode liberar duas atividades de origem; nada além disso)
  if p_decisao = 'aprovar' and exists (
       select 1 from public.remanejamento_assinaturas a
         join public.remanejamento_etapas e2 on e2.id = a.etapa_id
        where a.remanejamento_id = v_rem.id and a.versao = v_rem.versao and a.usuario_id = p_usuario_id
          and a.decisao = 'aprovar' and a.invalidada_em is null and a.etapa_id <> v_etapa.id
          and not (e2.papel = 'liberacao_origem' and v_etapa.papel = 'liberacao_origem')) then
    raise exception 'SEGREGACAO: você já aprovou outra etapa deste pedido.';
  end if;
  if p_decisao in ('devolver','recusar') then
    if v_etapa.ordem = 1 then raise exception 'O solicitante não devolve nem recusa — edite ou cancele.'; end if;
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo (%).', p_decisao; end if;
  end if;
  if p_decisao = 'aprovar' and v_etapa.ordem = 1 and v_rem.submetido_em < now() then
    perform fn_rem_validar(v_rem.id);   -- reaprovação após devolução: revalida
  end if;

  insert into public.remanejamento_assinaturas
    (remanejamento_id, etapa_id, versao, usuario_id, cargo, titular_id, decisao, motivo,
     hash_documento, senha_verificada_em, ip, user_agent)
  values (v_rem.id, v_etapa.id, v_rem.versao, p_usuario_id, v_etapa.cargo,
          (select id from public.rem_cargo_titulares where cargo = v_etapa.cargo and usuario_id = p_usuario_id and vigencia_fim is null),
          p_decisao, nullif(btrim(p_motivo), ''), p_hash, now(), p_ip, left(p_user_agent, 300))
  returning id into v_ass;

  select count(*) into v_total from public.remanejamento_etapas where remanejamento_id = v_rem.id and versao = v_rem.versao;

  if p_decisao = 'aprovar' then
    update public.remanejamento_etapas set assinatura_id = v_ass where id = v_etapa.id;
    perform fn_rem_log(v_rem.id, 'aprovado_etapa', null, null, v_etapa.ordem, p_usuario_id, p_motivo);
    if v_etapa.ordem = v_total then
      perform fn_rem_efetivar(v_rem.id, p_usuario_id);
      select array_agg(distinct u) into v_avisar from (
        select v_rem.criado_por as u
        union select a.usuario_id from public.remanejamento_assinaturas a
               where a.remanejamento_id = v_rem.id and a.versao = v_rem.versao and a.decisao = 'aprovar' and a.invalidada_em is null) x;
      perform fn_rem_notificar(v_rem.id, v_avisar, 'efetivado', null);
      return jsonb_build_object('status', 'efetivado');
    end if;
    update public.remanejamentos set etapa_atual = v_etapa.ordem + 1 where id = v_rem.id;
    select * into v_prox from public.remanejamento_etapas
     where remanejamento_id = v_rem.id and versao = v_rem.versao and ordem = v_etapa.ordem + 1;
    select array_agg(s) into v_avisar from fn_rem_signatarios_etapa(v_prox.id) s;
    perform fn_rem_notificar(v_rem.id, v_avisar, 'analisar', null);
    return jsonb_build_object('status', 'em_aprovacao', 'etapa_atual', v_etapa.ordem + 1);
  end if;

  if p_decisao = 'devolver' then
    select * into v_ant from public.remanejamento_etapas
     where remanejamento_id = v_rem.id and versao = v_rem.versao and ordem = v_etapa.ordem - 1;
    update public.remanejamento_assinaturas
       set invalidada_em = now(), invalidada_motivo = 'devolvido pela etapa ' || v_etapa.ordem
     where id = v_ant.assinatura_id;
    update public.remanejamento_etapas set assinatura_id = null where id = v_ant.id;
    update public.remanejamentos set etapa_atual = v_ant.ordem where id = v_rem.id;
    perform fn_rem_log(v_rem.id, 'devolvido', null, null, v_etapa.ordem, p_usuario_id, p_motivo,
                       jsonb_build_object('para_etapa', v_ant.ordem));
    -- só quem assinou a etapa anterior é avisado
    select array_agg(a.usuario_id) into v_avisar from public.remanejamento_assinaturas a
     where a.id = (select id from public.remanejamento_assinaturas
                    where etapa_id = v_ant.id and decisao = 'aprovar' order by criado_em desc limit 1);
    if v_avisar is null then select array_agg(s) into v_avisar from fn_rem_signatarios_etapa(v_ant.id) s; end if;
    perform fn_rem_notificar(v_rem.id, v_avisar, 'devolvido', p_motivo);
    return jsonb_build_object('status', 'em_aprovacao', 'etapa_atual', v_ant.ordem);
  end if;

  -- recusar
  update public.remanejamentos set status = 'recusado', etapa_atual = null, encerrado_em = now(),
         motivo_encerramento = btrim(p_motivo) where id = v_rem.id;
  perform fn_rem_log(v_rem.id, 'recusado', 'em_aprovacao', 'recusado', v_etapa.ordem, p_usuario_id, p_motivo);
  select array_agg(distinct u) into v_avisar from (
    select v_rem.criado_por as u
    union select a.usuario_id from public.remanejamento_assinaturas a
           where a.remanejamento_id = v_rem.id and a.versao = v_rem.versao and a.decisao = 'aprovar' and a.invalidada_em is null) x;
  perform fn_rem_notificar(v_rem.id, v_avisar, 'recusado', p_motivo);
  return jsonb_build_object('status', 'recusado');
end $$;

-- ── 9. Controle de tentativas de senha (service_role) ──────────────────
create or replace function public.fn_rem_senha_bloqueada_ate(p_usuario_id uuid)
returns timestamptz language sql stable security definer set search_path to 'public' as $$
  with ult_ok as (
    select coalesce(max(criado_em), '-infinity'::timestamptz) as t
      from public.rem_tentativas_senha where usuario_id = p_usuario_id and sucesso
  ), falhas as (
    select criado_em from public.rem_tentativas_senha, ult_ok
     where usuario_id = p_usuario_id and not sucesso
       and criado_em > ult_ok.t and criado_em > now() - interval '30 minutes'
  )
  select case when (select count(*) from falhas) >= 5
              then (select max(criado_em) from falhas) + interval '30 minutes' end
$$;

create or replace function public.fn_rem_registrar_tentativa(p_usuario_id uuid, p_sucesso boolean)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.rem_tentativas_senha (usuario_id, sucesso) values (p_usuario_id, p_sucesso)
$$;

-- ── 10. Conferência: remanejamentos efetivados fecham no razão ─────────
create or replace view public.vw_rem_conferencia as
select r.id, r.numero,
       coalesce((select sum(i.valor_usd) from public.remanejamento_itens i
                  where i.remanejamento_id = r.id and i.valor_usd > 0 and i.ativo), 0)::numeric(14,2) as destinos_usd,
       coalesce((select sum(f.valor_usd) from public.orcamento_fontes f
                  where f.remanejamento_id = r.id and f.tipo = 'remanejamento_recebido'), 0)::numeric(14,2) as recebido_usd,
       coalesce((select -sum(f.valor_usd) from public.orcamento_fontes f
                  where f.remanejamento_id = r.id and f.tipo = 'remanejamento_cedido'), 0)::numeric(14,2)   as cedido_usd
  from public.remanejamentos r
 where r.status = 'efetivado';

-- ── 11. Acesso ─────────────────────────────────────────────────────────
alter table public.rem_cargos                 enable row level security;
alter table public.rem_cargo_titulares        enable row level security;
alter table public.remanejamentos             enable row level security;
alter table public.rem_numeracao              enable row level security;
alter table public.remanejamento_itens        enable row level security;
alter table public.remanejamento_alocacoes    enable row level security;
alter table public.remanejamento_etapas       enable row level security;
alter table public.remanejamento_assinaturas  enable row level security;
alter table public.remanejamento_historico    enable row level security;
alter table public.remanejamento_notificacoes enable row level security;
alter table public.rem_tentativas_senha       enable row level security;

do $pol$
declare t text;
begin
  foreach t in array array['rem_cargos','rem_cargo_titulares','remanejamentos','remanejamento_itens',
                           'remanejamento_alocacoes','remanejamento_etapas','remanejamento_historico'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_select') then
      execute format('create policy %I on public.%I for select to authenticated using (auth.uid() is not null)', t || '_select', t);
    end if;
  end loop;
  -- assinatura guarda IP e navegador: só coordenação/super_admin e o próprio signatário
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'remanejamento_assinaturas'
                  and policyname = 'remanejamento_assinaturas_select') then
    create policy remanejamento_assinaturas_select on public.remanejamento_assinaturas for select to authenticated
      using (usuario_id = auth.uid()
             or (select fn_perfil_atual()) = any (array['super_admin','coordenacao']::public.perfil_usuario[]));
  end if;
end $pol$;

-- Visão das assinaturas sem IP/navegador, para todos os logados
create or replace view public.vw_remanejamento_assinaturas as
select a.id, a.remanejamento_id, a.etapa_id, e.ordem as etapa_ordem, e.papel, a.versao,
       a.usuario_id, u.nome_completo, a.cargo, a.decisao, a.motivo, a.hash_documento,
       a.criado_em, a.invalidada_em, a.invalidada_motivo
  from public.remanejamento_assinaturas a
  join public.remanejamento_etapas e on e.id = a.etapa_id
  join public.usuarios u on u.id = a.usuario_id;

revoke all on public.rem_cargos, public.rem_cargo_titulares, public.remanejamentos, public.rem_numeracao,
              public.remanejamento_itens, public.remanejamento_alocacoes, public.remanejamento_etapas,
              public.remanejamento_assinaturas, public.remanejamento_historico,
              public.remanejamento_notificacoes, public.rem_tentativas_senha,
              public.vw_rem_reservas, public.vw_rem_conferencia, public.vw_remanejamento_assinaturas
  from anon, authenticated, public;
grant select on public.rem_cargos, public.rem_cargo_titulares, public.remanejamentos,
                public.remanejamento_itens, public.remanejamento_alocacoes, public.remanejamento_etapas,
                public.remanejamento_assinaturas, public.remanejamento_historico,
                public.vw_rem_reservas, public.vw_rem_conferencia, public.vw_remanejamento_assinaturas
  to authenticated;
grant select, update on public.remanejamento_notificacoes to service_role;
grant select on public.remanejamentos, public.usuarios to service_role;
revoke all on public.vw_orcamento_fontes_saldo, public.vw_orcamento_atividade from anon, authenticated, public;
grant select on public.vw_orcamento_fontes_saldo, public.vw_orcamento_atividade to authenticated, service_role;

revoke all on function public.fn_trg_rem_titulares_guarda()  from public, anon, authenticated;
revoke all on function public.fn_trg_rem_filhos_rascunho()   from public, anon, authenticated;
revoke all on function public.fn_trg_rem_assinaturas_guarda() from public, anon, authenticated;
revoke all on function public.fn_trg_rem_etapas_guarda()     from public, anon, authenticated;
revoke all on function public.fn_trg_rem_pedido_guarda()     from public, anon, authenticated;
revoke all on function public.fn_rem_log(uuid, text, text, text, integer, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fn_rem_notificar(uuid, uuid[], text, text)                    from public, anon, authenticated;
revoke all on function public.fn_rem_efetivar(uuid, uuid)                                   from public, anon, authenticated;
revoke all on function public.fn_rem_assinar(uuid, uuid, text, text, text, text, text)      from public, anon, authenticated;
revoke all on function public.fn_rem_senha_bloqueada_ate(uuid)                              from public, anon, authenticated;
revoke all on function public.fn_rem_registrar_tentativa(uuid, boolean)                     from public, anon, authenticated;
grant execute on function public.fn_rem_assinar(uuid, uuid, text, text, text, text, text)   to service_role;
grant execute on function public.fn_rem_senha_bloqueada_ate(uuid)                           to service_role;
grant execute on function public.fn_rem_registrar_tentativa(uuid, boolean)                  to service_role;

revoke all on function public.fn_rem_titular(text)                     from public, anon;
revoke all on function public.fn_rem_designar_titular(text, uuid, text) from public, anon;
revoke all on function public.fn_rem_hash(uuid)                        from public, anon;
revoke all on function public.fn_rem_fonte_livre(uuid, uuid)           from public, anon;
revoke all on function public.fn_rem_signatarios_etapa(uuid)           from public, anon;
revoke all on function public.fn_rem_validar(uuid)                     from public, anon;
revoke all on function public.fn_rem_salvar(uuid, jsonb)               from public, anon;
grant execute on function public.fn_rem_titular(text), public.fn_rem_designar_titular(text, uuid, text),
                          public.fn_rem_hash(uuid), public.fn_rem_fonte_livre(uuid, uuid),
                          public.fn_rem_signatarios_etapa(uuid), public.fn_rem_validar(uuid),
                          public.fn_rem_salvar(uuid, jsonb)
  to authenticated, service_role;

-- ── 12. Cron: reenvia e-mails pendentes da cadeia (a cada 15 min) ──────
select cron.schedule(
  'remanejamento-emails',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://wfymnmlinonvdqfucjya.supabase.co/functions/v1/assinar-remanejamento',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmeW1ubWxpbm9udmRxZnVjanlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MzM1NzksImV4cCI6MjA5MDMwOTU3OX0.eC6T9VQ6OzF9mISEGy_pgbIbrOAnG4xp2z6WN-sCMt8'
    ),
    body := '{"acao":"drenar"}'::jsonb
  );
  $$
);
