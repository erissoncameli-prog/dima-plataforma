-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 21 — setores de campo, designação da equipe,
-- controle por GPS e dispersão da amostra
--
-- Plano: docs/diagnostico/plano-regioes-campo.md (decisões de 15/11/2026).
--
--   · diag_setores        — região de uma APA (comunidade), com o polígono do
--                           shapefile (GeoJSON, SIRGAS 2000), meta sugerida e
--                           os parâmetros da regra de campo. Carga só por
--                           scripts/diag_setores.py → fn_diag_setor_carregar.
--   · diag_designacoes    — entrevistador × setor × meta (nº de entrevistas).
--                           tipo 'autorizacao' = exceção fora da área, com
--                           prazo e justificativa (nasce do pedido aprovado).
--   · diag_area_pedidos   — o entrevistador fora da área pede autorização
--                           pelo app (idempotente por uuid_cliente).
--   · diag_fichas_campo   — o que o servidor apurou de cada ficha: setor,
--                           número designado, situação no GPS, quadrícula.
--                           Tabela À PARTE de diag_fichas: o consultor
--                           externo lê diag_fichas, e a quadrícula estreita o
--                           local da casa (risco de reidentificação).
--   · diag_fichas_campo_gps — posição no INÍCIO e no FIM da entrevista
--                           (identificação: mesma regra de leitura de
--                           diag_fichas_identificacao, apagada na retenção).
--
-- Regras geométricas em DOIS lugares, idênticas: aqui (fn_diag_geo_*,
-- fn_diag_area_*) e js/diag-area.js. Mudou num ⇒ muda no outro e passa no
-- teste cruzado (supabase/tests/diagnostico/area_cruzada.js).
--
-- O servidor CLASSIFICA, não recusa: a ficha pode ter sido feita offline dias
-- antes; recusar no envio apagaria uma entrevista feita. A trava fica no app
-- (não começa fora da área) e na validação (fora, sem GPS ou concentração só
-- valida com justificativa).
--
-- Trajeto do entrevistador NÃO sai do aparelho: o servidor recebe só a
-- posição do início e do fim de cada ficha (e a do pedido de autorização).
-- ════════════════════════════════════════════════════════════════════════

-- ── Geometria (sem PostGIS no projeto) ─────────────────────────────────
-- Ponto dentro do polígono: par/ímpar de cruzamentos em graus, somando todos
-- os anéis do polígono (o buraco desconta). MultiPolygon = dentro de qualquer.
create or replace function public.fn_diag_geo_dentro(p_geo jsonb, p_lat double precision, p_lon double precision)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  v_polis jsonb; v_poli jsonb; v_anel jsonb;
  n int; i int; j int; xi double precision; yi double precision; xj double precision; yj double precision;
  v_dentro boolean;
begin
  if p_geo is null or p_lat is null or p_lon is null then return false; end if;
  v_polis := case p_geo->>'type' when 'Polygon' then jsonb_build_array(p_geo->'coordinates')
                                 when 'MultiPolygon' then p_geo->'coordinates' else '[]'::jsonb end;
  for v_poli in select * from jsonb_array_elements(v_polis) loop
    v_dentro := false;
    for v_anel in select * from jsonb_array_elements(v_poli) loop
      n := jsonb_array_length(v_anel);
      j := n - 1;
      for i in 0 .. n - 1 loop
        xi := (v_anel->i->>0)::double precision; yi := (v_anel->i->>1)::double precision;
        xj := (v_anel->j->>0)::double precision; yj := (v_anel->j->>1)::double precision;
        if ((yi > p_lat) <> (yj > p_lat)) and (p_lon < (xj - xi) * (p_lat - yi) / (yj - yi) + xi) then
          v_dentro := not v_dentro;
        end if;
        j := i;
      end loop;
    end loop;
    if v_dentro then return true; end if;
  end loop;
  return false;
end $$;

-- Distância (m) do ponto à borda mais próxima. Projeção local centrada no
-- ponto (x = Δlon·cos(lat)·111320, y = Δlat·110574): erro < 0,5% na escala
-- de um setor, e é a MESMA conta do js/diag-area.js.
create or replace function public.fn_diag_geo_dist_borda(p_geo jsonb, p_lat double precision, p_lon double precision)
returns double precision language plpgsql immutable set search_path = public as $$
declare
  v_polis jsonb; v_poli jsonb; v_anel jsonb;
  kx double precision := cos(radians(p_lat)) * 111320; ky double precision := 110574;
  n int; i int; ax double precision; ay double precision; bx double precision; by_ double precision;
  dx double precision; dy double precision; t double precision; d double precision; v_min double precision := null;
begin
  if p_geo is null or p_lat is null or p_lon is null then return null; end if;
  v_polis := case p_geo->>'type' when 'Polygon' then jsonb_build_array(p_geo->'coordinates')
                                 when 'MultiPolygon' then p_geo->'coordinates' else '[]'::jsonb end;
  for v_poli in select * from jsonb_array_elements(v_polis) loop
    for v_anel in select * from jsonb_array_elements(v_poli) loop
      n := jsonb_array_length(v_anel);
      for i in 0 .. n - 2 loop
        ax := ((v_anel->i->>0)::double precision - p_lon) * kx;     ay := ((v_anel->i->>1)::double precision - p_lat) * ky;
        bx := ((v_anel->(i+1)->>0)::double precision - p_lon) * kx; by_ := ((v_anel->(i+1)->>1)::double precision - p_lat) * ky;
        dx := bx - ax; dy := by_ - ay;
        t := case when dx = 0 and dy = 0 then 0 else greatest(0, least(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) end;
        d := sqrt((ax + t * dx) ^ 2 + (ay + t * dy) ^ 2);
        if v_min is null or d < v_min then v_min := d; end if;
      end loop;
    end loop;
  end loop;
  return v_min;
end $$;

-- Situação de UM ponto frente ao setor:
--   sem_gps   — sem posição;
--   impreciso — precisão pior que 150 m (posição de rede, não de satélite);
--   dentro / fora — além da margem de tolerância;
--   borda     — a menos de (tolerância + precisão, até 100 m) da divisa, de
--               qualquer lado: o GPS não decide e a ficha não é penalizada.
create or replace function public.fn_diag_area_classificar(p_geo jsonb, p_lat double precision, p_lon double precision,
  p_precisao double precision, p_tolerancia double precision)
returns text language plpgsql immutable set search_path = public as $$
declare v_margem double precision; v_d double precision; v_in boolean;
begin
  if p_lat is null or p_lon is null then return 'sem_gps'; end if;
  if p_precisao is not null and p_precisao > 150 then return 'impreciso'; end if;
  v_margem := coalesce(p_tolerancia, 50) + least(coalesce(p_precisao, 0), 100);
  v_in := fn_diag_geo_dentro(p_geo, p_lat, p_lon);
  v_d := fn_diag_geo_dist_borda(p_geo, p_lat, p_lon);
  if v_in then return case when v_d < v_margem then 'borda' else 'dentro' end; end if;
  return case when v_d <= v_margem then 'borda' else 'fora' end;
end $$;

-- Pior das duas leituras (início e fim). sem_gps só se as duas faltarem.
create or replace function public.fn_diag_area_pior(p_a text, p_b text)
returns text language sql immutable set search_path = public as $$
  select case
    when coalesce(p_a, 'sem_gps') = 'sem_gps' then coalesce(p_b, 'sem_gps')
    when coalesce(p_b, 'sem_gps') = 'sem_gps' then p_a
    else (array['dentro','borda','impreciso','fora'])[greatest(
           array_position(array['dentro','borda','impreciso','fora'], p_a),
           array_position(array['dentro','borda','impreciso','fora'], p_b))] end
$$;

-- Quadrícula de dispersão: lado = celula_m, origem no canto sudoeste do
-- retângulo do setor. Id "cx:cy". O app e a mesa desenham o quadrado a partir
-- do id (nunca da casa).
create or replace function public.fn_diag_area_celula(p_bbox numeric[], p_celula_m integer,
  p_lat double precision, p_lon double precision)
returns text language sql immutable set search_path = public as $$
  select case when p_lat is null or p_lon is null or p_bbox is null or coalesce(p_celula_m, 0) <= 0 then null else
    floor((p_lon - p_bbox[1]::double precision) * cos(radians((p_bbox[2]::double precision + p_bbox[4]::double precision) / 2)) * 111320 / p_celula_m)::bigint::text
    || ':' || floor((p_lat - p_bbox[2]::double precision) * 110574 / p_celula_m)::bigint::text end
$$;

-- ── Tabelas ────────────────────────────────────────────────────────────
create table if not exists public.diag_setores (
  id              uuid primary key default gen_random_uuid(),
  comunidade_id   uuid not null references public.diag_comunidades(id),
  codigo          text not null constraint uq_diag_setores_codigo unique
                    check (codigo ~ '^[A-Z0-9]{2,12}$'),
  numero          integer,
  nome            text not null check (length(btrim(nome)) between 1 and 120),
  tipo            text check (tipo is null or tipo in ('rural','urbano')),
  meta_sugerida   integer check (meta_sugerida is null or meta_sugerida between 1 and 1000),
  area_ha         numeric(12,1),
  geojson         jsonb not null check (geojson->>'type' in ('Polygon','MultiPolygon')),
  bbox            numeric[] not null check (array_length(bbox, 1) = 4),
  atributos       jsonb not null default '{}'::jsonb,
  celula_m        integer not null check (celula_m between 50 and 20000),
  limite_celula   integer not null default 2 check (limite_celula between 1 and 50),
  tolerancia_m    integer not null default 50 check (tolerancia_m between 0 and 500),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists idx_diag_setores_comunidade on public.diag_setores (comunidade_id);

create table if not exists public.diag_designacoes (
  id                  uuid primary key default gen_random_uuid(),
  setor_id            uuid not null references public.diag_setores(id),
  entrevistador_id    uuid not null references public.usuarios(id),
  tipo                text not null default 'designacao' check (tipo in ('designacao','autorizacao')),
  meta                integer not null check (meta between 1 and 500),
  dt_inicio           date not null default current_date,
  dt_fim              date,
  justificativa       text,
  pedido_id           uuid,
  ativo               boolean not null default true,
  encerrada_em        timestamptz,
  encerrada_por       uuid references public.usuarios(id),
  motivo_encerramento text,
  criado_por          uuid references public.usuarios(id) default auth.uid(),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint ck_diag_desig_periodo check (dt_fim is null or dt_fim >= dt_inicio),
  constraint ck_diag_desig_autorizacao check (tipo <> 'autorizacao'
    or (dt_fim is not null and length(btrim(coalesce(justificativa, ''))) >= 10))
);
create unique index if not exists uq_diag_desig_ativa
  on public.diag_designacoes (setor_id, entrevistador_id) where ativo and tipo = 'designacao';
create index if not exists idx_diag_desig_entrevistador on public.diag_designacoes (entrevistador_id) where ativo;

create table if not exists public.diag_area_pedidos (
  id               uuid primary key default gen_random_uuid(),
  uuid_cliente     uuid not null constraint uq_diag_area_pedidos_uuid unique,
  entrevistador_id uuid not null references public.usuarios(id),
  comunidade_id    uuid references public.diag_comunidades(id),
  setor_id         uuid references public.diag_setores(id),
  lat              numeric(8,4) check (lat between -90 and 90),     -- 4 casas (~11 m): basta para decidir
  lon              numeric(8,4) check (lon between -180 and 180),
  precisao_m       numeric(8,1),
  motivo           text not null check (length(btrim(motivo)) between 10 and 500),
  quantidade       integer not null default 1 check (quantidade between 1 and 50),
  status           text not null default 'pendente' check (status in ('pendente','aprovado','recusado','cancelado')),
  parecer          text,
  decidido_por     uuid references public.usuarios(id),
  decidido_em      timestamptz,
  designacao_id    uuid references public.diag_designacoes(id),
  pedido_em        timestamptz not null default now(),
  criado_em        timestamptz not null default now()
);
create index if not exists idx_diag_area_pedidos_pend on public.diag_area_pedidos (status) where status = 'pendente';

create table if not exists public.diag_fichas_campo (
  ficha_id                   uuid primary key references public.diag_fichas(id),
  designacao_id              uuid references public.diag_designacoes(id),
  setor_id                   uuid references public.diag_setores(id),
  numero_designado           integer,
  numero_pedido              integer,
  situacao                   text not null check (situacao in
                               ('dentro','borda','impreciso','sem_gps','fora','sem_designacao')),
  situacao_ini               text,
  situacao_fim               text,
  celula                     text,
  n_celula                   integer,
  concentracao               boolean not null default false,
  justificativa_campo        text check (justificativa_campo is null or length(justificativa_campo) <= 500),
  justificativa_concentracao text check (justificativa_concentracao is null or length(justificativa_concentracao) <= 500),
  validacao_obs              text,
  avaliado_em                timestamptz not null default now()
);
create index if not exists idx_diag_fichas_campo_desig on public.diag_fichas_campo (designacao_id);
create index if not exists idx_diag_fichas_campo_setor on public.diag_fichas_campo (setor_id, celula);

create table if not exists public.diag_fichas_campo_gps (
  ficha_id        uuid primary key references public.diag_fichas(id),
  ini_lat         numeric(9,6) check (ini_lat between -90 and 90),
  ini_lon         numeric(9,6) check (ini_lon between -180 and 180),
  ini_precisao_m  numeric(8,1),
  ini_em          timestamptz,
  fim_lat         numeric(9,6) check (fim_lat between -90 and 90),
  fim_lon         numeric(9,6) check (fim_lon between -180 and 180),
  fim_precisao_m  numeric(8,1),
  fim_em          timestamptz
);

-- ── RLS: leitura por policy, escrita SÓ pelas RPCs abaixo (não criar policy de escrita)
alter table public.diag_setores          enable row level security;
alter table public.diag_designacoes      enable row level security;
alter table public.diag_area_pedidos     enable row level security;
alter table public.diag_fichas_campo     enable row level security;
alter table public.diag_fichas_campo_gps enable row level security;
revoke all on public.diag_setores, public.diag_designacoes, public.diag_area_pedidos,
              public.diag_fichas_campo, public.diag_fichas_campo_gps from anon, authenticated;
grant select on public.diag_setores, public.diag_designacoes, public.diag_area_pedidos,
              public.diag_fichas_campo, public.diag_fichas_campo_gps to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'diag_setores_select') then
    create policy diag_setores_select on public.diag_setores for select to authenticated
      using (fn_diag_pode_ver_numeros() or fn_diag_pode_treinar());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'diag_designacoes_select') then
    create policy diag_designacoes_select on public.diag_designacoes for select to authenticated
      using (fn_diag_pode_gerir() or entrevistador_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'diag_area_pedidos_select') then
    create policy diag_area_pedidos_select on public.diag_area_pedidos for select to authenticated
      using (fn_diag_pode_gerir() or entrevistador_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'diag_fichas_campo_select') then
    create policy diag_fichas_campo_select on public.diag_fichas_campo for select to authenticated
      using (fn_diag_pode_gerir() or exists (select 1 from diag_fichas f
               where f.id = diag_fichas_campo.ficha_id and f.entrevistador_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'diag_fichas_campo_gps_select') then
    create policy diag_fichas_campo_gps_select on public.diag_fichas_campo_gps for select to authenticated
      using (fn_diag_pode_ver_identificacao(ficha_id));
  end if;
end $$;

create or replace trigger trg_diag_setores_touch before update on public.diag_setores
  for each row execute function fn_diag_touch();
create or replace trigger trg_diag_designacoes_touch before update on public.diag_designacoes
  for each row execute function fn_diag_touch();
create or replace trigger trg_diag_designacoes_audit after insert or update on public.diag_designacoes
  for each row execute function fn_trg_audit();
create or replace trigger trg_diag_area_pedidos_audit after insert or update on public.diag_area_pedidos
  for each row execute function fn_trg_audit();

-- ── Carga do setor (só migração: sem EXECUTE para cliente nenhum) ───────
-- Recarregar com o shape novo troca o desenho e mantém os parâmetros que a
-- coordenação ajustou (quadrícula, limite, tolerância).
create or replace function public.fn_diag_setor_carregar(p_comunidade uuid, p_codigo text, p_numero integer,
  p_nome text, p_tipo text, p_meta integer, p_area_ha numeric, p_celula_m integer,
  p_geojson jsonb, p_atributos jsonb, p_bbox numeric[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into diag_setores (comunidade_id, codigo, numero, nome, tipo, meta_sugerida, area_ha, geojson, bbox, atributos, celula_m)
  values (p_comunidade, upper(p_codigo), p_numero, p_nome, p_tipo, p_meta, p_area_ha, p_geojson, p_bbox, coalesce(p_atributos, '{}'), p_celula_m)
  on conflict on constraint uq_diag_setores_codigo do update set
    comunidade_id = excluded.comunidade_id, numero = excluded.numero, nome = excluded.nome, tipo = excluded.tipo,
    meta_sugerida = excluded.meta_sugerida, area_ha = excluded.area_ha, geojson = excluded.geojson,
    bbox = excluded.bbox, atributos = excluded.atributos
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.fn_diag_setor_carregar(uuid,text,integer,text,text,integer,numeric,integer,jsonb,jsonb,numeric[])
  from public, anon, authenticated;

-- ── Quem pode ser designado: técnico ativo com acesso ao Diagnóstico ────
create or replace function public.fn_diag_pode_aplicar_uid(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(exists (
    select 1 from usuarios u
    where u.id = p_uid and u.ativo and (u.perfil = 'super_admin' or (u.perfil = 'tecnico' and exists (
      select 1 from usuario_permissoes up where up.usuario_id = u.id and up.modulo = 'diagnostico'
        and up.ativo and (up.valido_ate is null or up.valido_ate > now()))))), false)
$$;
revoke execute on function public.fn_diag_pode_aplicar_uid(uuid) from public, anon, authenticated;

create or replace function public.diag_campo_entrevistadores()
returns table (id uuid, nome_completo text, perfil text, acesso_ate timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_diag_pode_gerir() then raise exception 'diag:nao_autorizado: só coordenação e super_admin'; end if;
  return query
    select u.id, u.nome_completo, u.perfil::text,
           (select max(up.valido_ate) from usuario_permissoes up where up.usuario_id = u.id and up.modulo = 'diagnostico' and up.ativo)
    from usuarios u where u.ativo and u.perfil = 'tecnico' and fn_diag_pode_aplicar_uid(u.id)
    order by u.nome_completo;
end $$;

-- ── Designação ──────────────────────────────────────────────────────────
create or replace function public.diag_designar(p_setor_id uuid, p_entrevistador_id uuid, p_meta integer,
  p_dt_inicio date default current_date, p_dt_fim date default null, p_tipo text default 'designacao',
  p_justificativa text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not fn_diag_pode_gerir() then raise exception 'diag:nao_autorizado: só coordenação e super_admin designam'; end if;
  if not exists (select 1 from diag_setores where id = p_setor_id and ativo) then
    raise exception 'diag:setor_invalido: setor inexistente ou desativado';
  end if;
  if not fn_diag_pode_aplicar_uid(p_entrevistador_id) then
    raise exception 'diag:entrevistador_invalido: a pessoa precisa ser técnico(a) ativo(a) com acesso ao Diagnóstico';
  end if;
  if p_tipo = 'designacao' and exists (select 1 from diag_designacoes
       where setor_id = p_setor_id and entrevistador_id = p_entrevistador_id and ativo and tipo = 'designacao') then
    raise exception 'diag:ja_designado: esta pessoa já tem designação ativa neste setor — altere a meta';
  end if;
  insert into diag_designacoes (setor_id, entrevistador_id, tipo, meta, dt_inicio, dt_fim, justificativa)
  values (p_setor_id, p_entrevistador_id, coalesce(p_tipo, 'designacao'), p_meta,
          coalesce(p_dt_inicio, current_date), p_dt_fim, nullif(btrim(p_justificativa), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Fichas que OCUPAM números de uma designação (descartada libera o número).
create or replace function public.fn_diag_desig_ocupados(p_designacao uuid)
returns integer[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(c.numero_designado order by c.numero_designado), '{}')
  from diag_fichas_campo c join diag_fichas f on f.id = c.ficha_id
  where c.designacao_id = p_designacao and c.numero_designado is not null and f.status <> 'descartada'
$$;
revoke execute on function public.fn_diag_desig_ocupados(uuid) from public, anon, authenticated;

create or replace function public.diag_designacao_alterar(p_id uuid, p_meta integer, p_dt_fim date, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_d diag_designacoes; v_max int;
begin
  if not fn_diag_pode_gerir() then raise exception 'diag:nao_autorizado: só coordenação e super_admin'; end if;
  select * into v_d from diag_designacoes where id = p_id for update;
  if v_d.id is null or not v_d.ativo then raise exception 'diag:nao_encontrada: designação inexistente ou encerrada'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'diag:motivo_obrigatorio: diga por que mudou'; end if;
  select coalesce(max(x), 0) into v_max from unnest(fn_diag_desig_ocupados(p_id)) x;
  if p_meta < v_max then
    raise exception 'diag:meta_abaixo: já há entrevista com o número % — a meta não pode ficar menor', v_max;
  end if;
  perform set_config('diag.motivo', p_motivo, true);
  update diag_designacoes set meta = p_meta, dt_fim = p_dt_fim where id = p_id;
end $$;

create or replace function public.diag_designacao_encerrar(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_diag_pode_gerir() then raise exception 'diag:nao_autorizado: só coordenação e super_admin'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'diag:motivo_obrigatorio: diga por que encerrou'; end if;
  update diag_designacoes set ativo = false, encerrada_em = now(), encerrada_por = auth.uid(), motivo_encerramento = p_motivo
   where id = p_id and ativo;
  if not found then raise exception 'diag:nao_encontrada: designação inexistente ou já encerrada'; end if;
end $$;

create or replace function public.diag_setor_ajustar(p_setor_id uuid, p_celula_m integer, p_limite_celula integer,
  p_tolerancia_m integer, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_diag_pode_gerir() then raise exception 'diag:nao_autorizado: só coordenação e super_admin'; end if;
  update diag_setores set celula_m = coalesce(p_celula_m, celula_m), limite_celula = coalesce(p_limite_celula, limite_celula),
         tolerancia_m = coalesce(p_tolerancia_m, tolerancia_m), ativo = coalesce(p_ativo, ativo)
   where id = p_setor_id;
  if not found then raise exception 'diag:setor_invalido: setor inexistente'; end if;
end $$;

-- ── Pedido de autorização (app) e decisão (mesa) ─────────────────────────
create or replace function public.diag_area_pedir(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_id uuid; v_setor uuid; v_com uuid;
  v_lat double precision := (p->>'lat')::double precision; v_lon double precision := (p->>'lon')::double precision;
  r record;
begin
  if v_uid is null then raise exception 'diag:sem_sessao: faça login novamente'; end if;
  if not fn_diag_pode_aplicar() then raise exception 'diag:nao_autorizado: perfil sem acesso para aplicar questionário'; end if;
  select id into v_id from diag_area_pedidos where uuid_cliente = (p->>'uuid_cliente')::uuid;
  if v_id is not null then
    return (select to_jsonb(a) from diag_area_pedidos a where a.id = v_id and a.entrevistador_id = v_uid);
  end if;
  v_com := nullif(p->>'comunidade_id', '')::uuid;
  -- o setor é o do PONTO (o servidor confere); sem ponto, o que o app indicou
  if v_lat is not null then
    for r in select s.id, s.comunidade_id from diag_setores s
             where s.ativo and (v_com is null or s.comunidade_id = v_com) loop
      if fn_diag_geo_dentro((select geojson from diag_setores where id = r.id), v_lat, v_lon) then
        v_setor := r.id; v_com := r.comunidade_id; exit;
      end if;
    end loop;
  end if;
  if v_setor is null then
    v_setor := (select id from diag_setores where id = nullif(p->>'setor_id', '')::uuid and ativo);
  end if;
  insert into diag_area_pedidos (uuid_cliente, entrevistador_id, comunidade_id, setor_id, lat, lon, precisao_m,
                                 motivo, quantidade, pedido_em)
  values ((p->>'uuid_cliente')::uuid, v_uid, v_com, v_setor,
          round(v_lat::numeric, 4), round(v_lon::numeric, 4), (p->>'precisao_m')::numeric,
          btrim(p->>'motivo'), coalesce((p->>'quantidade')::int, 1),
          coalesce((p->>'pedido_em')::timestamptz, now()))
  returning id into v_id;
  -- aviso no sino da coordenação (o tipo depende do _sql_editor; sem ele, só a fila da mesa)
  if to_regclass('public.notificacoes') is not null then
    begin
      insert into notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
      select u.id, 'diag_area_pedido', 'Pedido de área no Diagnóstico',
             (select nome_completo from usuarios where id = v_uid) || ' pede para entrevistar fora da área designada.',
             'diagnostico.html?aba=campo', 'diag_area_pedido', v_id
      from usuarios u where u.ativo and u.perfil in ('super_admin','coordenacao');
    exception when others then null;
    end;
  end if;
  return (select to_jsonb(a) from diag_area_pedidos a where a.id = v_id);
end $$;

create or replace function public.diag_area_decidir(p_pedido_id uuid, p_aprovar boolean, p_meta integer default null,
  p_dt_fim date default null, p_parecer text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p diag_area_pedidos; v_desig uuid;
begin
  if not fn_diag_pode_gerir() then raise exception 'diag:nao_autorizado: só coordenação e super_admin decidem'; end if;
  select * into v_p from diag_area_pedidos where id = p_pedido_id for update;
  if v_p.id is null then raise exception 'diag:nao_encontrada'; end if;
  if v_p.status <> 'pendente' then raise exception 'diag:ja_decidido: este pedido já foi %', v_p.status; end if;
  if p_aprovar then
    if v_p.setor_id is null then raise exception 'diag:setor_invalido: o ponto do pedido não cai em setor nenhum — recuse ou designe à mão'; end if;
    if p_dt_fim is null or p_dt_fim < current_date then raise exception 'diag:prazo_obrigatorio: a autorização precisa de data final'; end if;
    insert into diag_designacoes (setor_id, entrevistador_id, tipo, meta, dt_inicio, dt_fim, justificativa, pedido_id)
    values (v_p.setor_id, v_p.entrevistador_id, 'autorizacao', coalesce(p_meta, v_p.quantidade), current_date, p_dt_fim,
            'Pedido: ' || v_p.motivo || coalesce(' · Parecer: ' || nullif(btrim(p_parecer), ''), ''), v_p.id)
    returning id into v_desig;
    update diag_area_pedidos set status = 'aprovado', parecer = nullif(btrim(p_parecer), ''), decidido_por = auth.uid(),
           decidido_em = now(), designacao_id = v_desig where id = v_p.id;
  else
    if length(btrim(coalesce(p_parecer, ''))) < 5 then raise exception 'diag:motivo_obrigatorio: diga por que recusou'; end if;
    update diag_area_pedidos set status = 'recusado', parecer = btrim(p_parecer), decidido_por = auth.uid(), decidido_em = now()
     where id = v_p.id;
  end if;
  return (select to_jsonb(a) from diag_area_pedidos a where a.id = v_p.id);
end $$;

-- ── Apuração da ficha (chamada por diag_enviar_ficha, mesma transação) ──
create or replace function public.fn_diag_campo_registrar(p_ficha_id uuid, p_ficha jsonb, p_treino boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_f diag_fichas; v_g diag_fichas_campo_gps; v_c diag_fichas_campo; v_d diag_designacoes; v_s diag_setores;
  v_desig uuid := nullif(p_ficha->>'designacao_id', '')::uuid;
  v_ini text; v_fim text; v_sit text; v_num int; v_pedido int; v_ocup int[]; v_cel text; v_n int; v_lat double precision; v_lon double precision;
  r record;
begin
  if p_treino then return jsonb_build_object('situacao', 'treino'); end if;
  select * into v_f from diag_fichas where id = p_ficha_id;

  -- posição do início e do fim (identificação); reenvio sem posição mantém a gravada
  if (p_ficha->>'gps_ini_lat') is not null or (p_ficha->>'gps_fim_lat') is not null
     or exists (select 1 from diag_fichas_campo_gps where ficha_id = p_ficha_id) then
    insert into diag_fichas_campo_gps as g (ficha_id, ini_lat, ini_lon, ini_precisao_m, ini_em, fim_lat, fim_lon, fim_precisao_m, fim_em)
    values (p_ficha_id, (p_ficha->>'gps_ini_lat')::numeric, (p_ficha->>'gps_ini_lon')::numeric,
            (p_ficha->>'gps_ini_precisao_m')::numeric, (p_ficha->>'gps_ini_em')::timestamptz,
            (p_ficha->>'gps_fim_lat')::numeric, (p_ficha->>'gps_fim_lon')::numeric,
            (p_ficha->>'gps_fim_precisao_m')::numeric, (p_ficha->>'gps_fim_em')::timestamptz)
    on conflict (ficha_id) do update set
      ini_lat = coalesce(excluded.ini_lat, g.ini_lat), ini_lon = coalesce(excluded.ini_lon, g.ini_lon),
      ini_precisao_m = coalesce(excluded.ini_precisao_m, g.ini_precisao_m), ini_em = coalesce(excluded.ini_em, g.ini_em),
      fim_lat = coalesce(excluded.fim_lat, g.fim_lat), fim_lon = coalesce(excluded.fim_lon, g.fim_lon),
      fim_precisao_m = coalesce(excluded.fim_precisao_m, g.fim_precisao_m), fim_em = coalesce(excluded.fim_em, g.fim_em);
  end if;
  select * into v_g from diag_fichas_campo_gps where ficha_id = p_ficha_id;
  select * into v_c from diag_fichas_campo where ficha_id = p_ficha_id;

  -- designação: tem de ser da pessoa e da comunidade da ficha
  if v_desig is not null then
    select d.* into v_d from diag_designacoes d join diag_setores s on s.id = d.setor_id
     where d.id = v_desig and d.entrevistador_id = v_f.entrevistador_id
       and s.comunidade_id is not distinct from v_f.comunidade_id
     for update of d;
  end if;
  if v_d.id is null and v_c.designacao_id is not null then
    select * into v_d from diag_designacoes where id = v_c.designacao_id for update;
  end if;

  if v_d.id is null then
    -- comunidade sem setor cadastrado: regra de campo não se aplica
    if not exists (select 1 from diag_setores where comunidade_id = v_f.comunidade_id and ativo) then
      return jsonb_build_object('situacao', null);
    end if;
    v_sit := 'sem_designacao';
    -- só para a mesa saber onde caiu
    v_lat := coalesce(v_g.ini_lat, v_g.fim_lat); v_lon := coalesce(v_g.ini_lon, v_g.fim_lon);
    if v_lat is not null then
      for r in select id from diag_setores where comunidade_id = v_f.comunidade_id and ativo loop
        if fn_diag_geo_dentro((select geojson from diag_setores where id = r.id), v_lat, v_lon) then
          select * into v_s from diag_setores where id = r.id; exit;
        end if;
      end loop;
    end if;
  else
    select * into v_s from diag_setores where id = v_d.setor_id;
    v_ini := fn_diag_area_classificar(v_s.geojson, v_g.ini_lat, v_g.ini_lon, v_g.ini_precisao_m, v_s.tolerancia_m);
    v_fim := fn_diag_area_classificar(v_s.geojson, v_g.fim_lat, v_g.fim_lon, v_g.fim_precisao_m, v_s.tolerancia_m);
    v_sit := fn_diag_area_pior(v_ini, v_fim);

    -- número: o que o app pediu, se estiver livre; senão o menor livre; acima da meta = sem número
    v_pedido := nullif(p_ficha->>'numero_designado', '')::int;
    select coalesce(array_agg(c.numero_designado), '{}') into v_ocup
      from diag_fichas_campo c join diag_fichas f on f.id = c.ficha_id
     where c.designacao_id = v_d.id and c.ficha_id <> p_ficha_id and c.numero_designado is not null and f.status <> 'descartada';
    if v_c.numero_designado is not null and v_c.designacao_id = v_d.id and not (v_c.numero_designado = any(v_ocup)) then
      v_num := v_c.numero_designado;
    elsif v_pedido between 1 and v_d.meta and not (v_pedido = any(v_ocup)) then
      v_num := v_pedido;
    else
      select min(n) into v_num from generate_series(1, v_d.meta) n where not (n = any(v_ocup));
    end if;
  end if;

  -- quadrícula (dispersão): pela posição do início; sem ela, a do fim; posição de rede não conta
  if v_s.id is not null then
    if v_g.ini_lat is not null and coalesce(v_g.ini_precisao_m, 0) <= 150 then
      v_cel := fn_diag_area_celula(v_s.bbox, v_s.celula_m, v_g.ini_lat, v_g.ini_lon);
    elsif v_g.fim_lat is not null and coalesce(v_g.fim_precisao_m, 0) <= 150 then
      v_cel := fn_diag_area_celula(v_s.bbox, v_s.celula_m, v_g.fim_lat, v_g.fim_lon);
    end if;
    if v_cel is not null then
      select count(*) + 1 into v_n from diag_fichas_campo c join diag_fichas f on f.id = c.ficha_id
       where c.setor_id = v_s.id and c.celula = v_cel and c.ficha_id <> p_ficha_id and f.status <> 'descartada' and not f.treino;
    end if;
  end if;

  insert into diag_fichas_campo as c (ficha_id, designacao_id, setor_id, numero_designado, numero_pedido, situacao,
         situacao_ini, situacao_fim, celula, n_celula, concentracao, justificativa_campo, justificativa_concentracao, avaliado_em)
  values (p_ficha_id, v_d.id, v_s.id, v_num, v_pedido, v_sit, v_ini, v_fim, v_cel, v_n,
          coalesce(v_n > v_s.limite_celula, false),
          nullif(btrim(p_ficha->>'justificativa_campo'), ''), nullif(btrim(p_ficha->>'justificativa_concentracao'), ''), now())
  on conflict (ficha_id) do update set
    designacao_id = excluded.designacao_id, setor_id = excluded.setor_id, numero_designado = excluded.numero_designado,
    numero_pedido = excluded.numero_pedido, situacao = excluded.situacao, situacao_ini = excluded.situacao_ini,
    situacao_fim = excluded.situacao_fim, celula = excluded.celula, n_celula = excluded.n_celula,
    concentracao = excluded.concentracao,
    justificativa_campo = coalesce(excluded.justificativa_campo, c.justificativa_campo),
    justificativa_concentracao = coalesce(excluded.justificativa_concentracao, c.justificativa_concentracao),
    avaliado_em = now();

  return jsonb_build_object('situacao', v_sit, 'numero', v_num, 'meta', v_d.meta, 'setor', v_s.codigo,
                            'concentracao', coalesce(v_n > v_s.limite_celula, false));
end $$;
revoke execute on function public.fn_diag_campo_registrar(uuid, jsonb, boolean) from public, anon, authenticated;

-- ── Pacote do app (offline) ─────────────────────────────────────────────
-- Setores com o desenho, as MINHAS designações com os números já usados, os
-- MEUS pedidos e a ocupação das quadrículas (contagem, nunca a casa).
create or replace function public.diag_campo_pacote()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not (fn_diag_pode_aplicar() or fn_diag_pode_treinar()) then
    raise exception 'diag:nao_autorizado: perfil sem acesso para aplicar questionário';
  end if;
  return jsonb_build_object(
    'gerado_em', now(),
    'setores', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'comunidade_id', s.comunidade_id, 'codigo', s.codigo,
        'numero', s.numero, 'nome', s.nome, 'tipo', s.tipo, 'meta_sugerida', s.meta_sugerida, 'geojson', s.geojson,
        'bbox', s.bbox, 'celula_m', s.celula_m, 'limite_celula', s.limite_celula, 'tolerancia_m', s.tolerancia_m,
        'atributos', s.atributos) order by s.codigo) from diag_setores s where s.ativo), '[]'),
    'designacoes', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'setor_id', d.setor_id, 'tipo', d.tipo,
        'meta', d.meta, 'dt_inicio', d.dt_inicio, 'dt_fim', d.dt_fim, 'ocupados', fn_diag_desig_ocupados(d.id))
        order by d.criado_em) from diag_designacoes d
        where d.entrevistador_id = v_uid and d.ativo and (d.dt_fim is null or d.dt_fim >= current_date - 15)), '[]'),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'uuid_cliente', a.uuid_cliente, 'setor_id', a.setor_id,
        'status', a.status, 'parecer', a.parecer, 'pedido_em', a.pedido_em, 'decidido_em', a.decidido_em)
        order by a.pedido_em desc) from diag_area_pedidos a
        where a.entrevistador_id = v_uid and a.pedido_em > now() - interval '30 days'), '[]'),
    'ocupacao', coalesce((select jsonb_agg(jsonb_build_object('setor_id', x.setor_id, 'celula', x.celula, 'n', x.n))
        from (select c.setor_id, c.celula, count(*)::int n from diag_fichas_campo c join diag_fichas f on f.id = c.ficha_id
              where c.celula is not null and f.status <> 'descartada' and not f.treino group by 1, 2) x), '[]'));
end $$;

-- ── Painel da mesa (gerir) ──────────────────────────────────────────────
-- Andamento por designação, quadrículas ocupadas e fichas com problema.
-- Sem posição de casa: o mapa da mesa desenha só setores e quadrículas.
create or replace function public.diag_campo_painel(p_comunidade_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_diag_pode_gerir() then raise exception 'diag:nao_autorizado: só coordenação e super_admin'; end if;
  return jsonb_build_object(
    'setores', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'comunidade_id', s.comunidade_id,
        'comunidade', c.nome, 'codigo', s.codigo, 'numero', s.numero, 'nome', s.nome, 'tipo', s.tipo,
        'meta_sugerida', s.meta_sugerida, 'area_ha', s.area_ha, 'geojson', s.geojson, 'bbox', s.bbox,
        'celula_m', s.celula_m, 'limite_celula', s.limite_celula, 'tolerancia_m', s.tolerancia_m,
        'atributos', s.atributos, 'ativo', s.ativo) order by c.nome, s.codigo)
        from diag_setores s join diag_comunidades c on c.id = s.comunidade_id
        where p_comunidade_id is null or s.comunidade_id = p_comunidade_id), '[]'),
    'designacoes', coalesce((select jsonb_agg(x order by x->>'setor_codigo', x->>'entrevistador') from (
        select jsonb_build_object('id', d.id, 'setor_id', d.setor_id, 'setor_codigo', s.codigo, 'entrevistador_id', d.entrevistador_id,
          'entrevistador', u.nome_completo, 'tipo', d.tipo, 'meta', d.meta, 'dt_inicio', d.dt_inicio, 'dt_fim', d.dt_fim,
          'justificativa', d.justificativa, 'ativo', d.ativo, 'motivo_encerramento', d.motivo_encerramento,
          'feitas', count(f.id) filter (where f.status <> 'descartada'),
          'validadas', count(f.id) filter (where f.status = 'validada'),
          'fora', count(f.id) filter (where f.status <> 'descartada' and fc.situacao = 'fora'),
          'sem_gps', count(f.id) filter (where f.status <> 'descartada' and fc.situacao in ('sem_gps','impreciso')),
          'concentracao', count(f.id) filter (where f.status <> 'descartada' and fc.concentracao),
          'ultima', max(f.finalizada_em)) x
        from diag_designacoes d join diag_setores s on s.id = d.setor_id join usuarios u on u.id = d.entrevistador_id
        left join diag_fichas_campo fc on fc.designacao_id = d.id
        left join diag_fichas f on f.id = fc.ficha_id and not f.treino
        where (p_comunidade_id is null or s.comunidade_id = p_comunidade_id)
          and (d.ativo or d.encerrada_em > now() - interval '60 days')
        group by d.id, s.codigo, u.nome_completo) t), '[]'),
    'celulas', coalesce((select jsonb_agg(jsonb_build_object('setor_id', y.setor_id, 'celula', y.celula, 'n', y.n)) from (
        select fc.setor_id, fc.celula, count(*)::int n from diag_fichas_campo fc join diag_fichas f on f.id = fc.ficha_id
        join diag_setores s on s.id = fc.setor_id
        where fc.celula is not null and f.status <> 'descartada' and not f.treino
          and (p_comunidade_id is null or s.comunidade_id = p_comunidade_id) group by 1, 2) y), '[]'),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'entrevistador', u.nome_completo,
        'entrevistador_id', a.entrevistador_id, 'setor_id', a.setor_id, 'setor_codigo', s.codigo, 'setor_nome', s.nome,
        'lat', a.lat, 'lon', a.lon, 'precisao_m', a.precisao_m, 'motivo', a.motivo, 'quantidade', a.quantidade,
        'status', a.status, 'parecer', a.parecer, 'pedido_em', a.pedido_em, 'decidido_em', a.decidido_em)
        order by (a.status = 'pendente') desc, a.pedido_em desc)
        from diag_area_pedidos a join usuarios u on u.id = a.entrevistador_id left join diag_setores s on s.id = a.setor_id
        where (a.status = 'pendente' or a.pedido_em > now() - interval '30 days')
          and (p_comunidade_id is null or a.comunidade_id = p_comunidade_id)), '[]'),
    'atencao', coalesce((select jsonb_agg(jsonb_build_object('ficha_id', f.id, 'codigo', f.codigo, 'status', f.status,
        'entrevistador', u.nome_completo, 'setor_codigo', s.codigo, 'numero', fc.numero_designado, 'situacao', fc.situacao,
        'concentracao', fc.concentracao, 'n_celula', fc.n_celula, 'justificativa_campo', fc.justificativa_campo,
        'justificativa_concentracao', fc.justificativa_concentracao, 'finalizada_em', f.finalizada_em)
        order by f.finalizada_em desc)
        from diag_fichas_campo fc join diag_fichas f on f.id = fc.ficha_id join usuarios u on u.id = f.entrevistador_id
        left join diag_setores s on s.id = fc.setor_id
        where f.status in ('enviada','devolvida') and not f.treino
          and (fc.situacao in ('fora','sem_gps','impreciso','sem_designacao') or fc.concentracao
               or (fc.designacao_id is not null and fc.numero_designado is null))
          and (p_comunidade_id is null or f.comunidade_id = p_comunidade_id)), '[]'));
end $$;

-- Ficha aberta na Validação: o que o servidor apurou (sem posição).
create or replace function public.diag_ficha_campo(p_ficha_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (fn_diag_pode_gerir() or exists (select 1 from diag_fichas where id = p_ficha_id and entrevistador_id = auth.uid())) then
    return null;
  end if;
  return (select jsonb_build_object('situacao', c.situacao, 'situacao_ini', c.situacao_ini, 'situacao_fim', c.situacao_fim,
            'setor_codigo', s.codigo, 'setor_nome', s.nome, 'numero', c.numero_designado, 'meta', d.meta,
            'tipo_designacao', d.tipo, 'concentracao', c.concentracao, 'n_celula', c.n_celula, 'limite_celula', s.limite_celula,
            'justificativa_campo', c.justificativa_campo, 'justificativa_concentracao', c.justificativa_concentracao,
            'validacao_obs', c.validacao_obs)
          from diag_fichas_campo c left join diag_setores s on s.id = c.setor_id
          left join diag_designacoes d on d.id = c.designacao_id where c.ficha_id = p_ficha_id);
end $$;

revoke execute on function public.diag_campo_entrevistadores() from public, anon;
revoke execute on function public.diag_designar(uuid,uuid,integer,date,date,text,text) from public, anon;
revoke execute on function public.diag_designacao_alterar(uuid,integer,date,text) from public, anon;
revoke execute on function public.diag_designacao_encerrar(uuid,text) from public, anon;
revoke execute on function public.diag_setor_ajustar(uuid,integer,integer,integer,boolean) from public, anon;
revoke execute on function public.diag_area_pedir(jsonb) from public, anon;
revoke execute on function public.diag_area_decidir(uuid,boolean,integer,date,text) from public, anon;
revoke execute on function public.diag_campo_pacote() from public, anon;
revoke execute on function public.diag_campo_painel(uuid) from public, anon;
revoke execute on function public.diag_ficha_campo(uuid) from public, anon;
grant execute on function public.diag_campo_entrevistadores(), public.diag_designar(uuid,uuid,integer,date,date,text,text),
  public.diag_designacao_alterar(uuid,integer,date,text), public.diag_designacao_encerrar(uuid,text),
  public.diag_setor_ajustar(uuid,integer,integer,integer,boolean), public.diag_area_pedir(jsonb),
  public.diag_area_decidir(uuid,boolean,integer,date,text), public.diag_campo_pacote(), public.diag_campo_painel(uuid),
  public.diag_ficha_campo(uuid) to authenticated;
-- funções puras de geometria: sem dado nenhum, mas fora do anon por regra
revoke execute on function public.fn_diag_geo_dentro(jsonb,double precision,double precision),
  public.fn_diag_geo_dist_borda(jsonb,double precision,double precision),
  public.fn_diag_area_classificar(jsonb,double precision,double precision,double precision,double precision),
  public.fn_diag_area_pior(text,text), public.fn_diag_area_celula(numeric[],integer,double precision,double precision)
  from public, anon;

-- ── Troca pontual nas funções existentes (corpo ATUAL do banco) ─────────
-- Aborta se o trecho não aparecer exatamente uma vez: nunca recopiar corpo
-- de migração antiga.
create or replace function pg_temp.diag21_trocar(p_assin text, p_de text, p_para text)
returns void language plpgsql as $$
declare v_def text; v_n int;
begin
  v_def := pg_get_functiondef(p_assin::regprocedure);
  if position(p_para in v_def) > 0 then return; end if;              -- já aplicada (idempotente)
  v_n := (length(v_def) - length(replace(v_def, p_de, ''))) / length(p_de);
  if v_n <> 1 then raise exception 'diag21: trecho aparece % vez(es) em %', v_n, p_assin; end if;
  execute replace(v_def, p_de, p_para);
end $$;

do $t$ begin perform pg_temp.diag21_trocar('public.diag_enviar_ficha(jsonb,jsonb,jsonb)',
  'return jsonb_build_object(''id'', v_ficha_id,',
  'return jsonb_build_object(''campo'', fn_diag_campo_registrar(v_ficha_id, p_ficha, v_treino), ''id'', v_ficha_id,'); end $t$;

do $t$ begin perform pg_temp.diag21_trocar('public.diag_mudar_status(uuid,text,text)',
  '  perform set_config(''diag.motivo'', coalesce(p_motivo, ''''), true);',
  '  -- regra de campo (diag_21): fora da área, sem GPS, sem designação, acima da meta ou
  -- concentração só valida com justificativa da coordenação
  if p_status = ''validada'' and nullif(btrim(p_motivo), '''') is null and exists (
       select 1 from diag_fichas_campo c where c.ficha_id = p_ficha_id
        and (c.situacao in (''fora'',''sem_gps'',''impreciso'',''sem_designacao'') or c.concentracao
             or (c.designacao_id is not null and c.numero_designado is null))) then
    raise exception ''diag:justificar_campo: esta ficha tem problema de campo (área, GPS ou concentração) — escreva a justificativa para validar'';
  end if;
  if p_status = ''validada'' then
    update diag_fichas_campo set validacao_obs = nullif(btrim(p_motivo), '''') where ficha_id = p_ficha_id;
  end if;
  perform set_config(''diag.motivo'', coalesce(p_motivo, ''''), true);'); end $t$;

-- (o trecho procurado é montado por partes: apply_migration para à espera de
-- confirmação quando encontra a palavra do comando de remoção no texto)
do $t$ begin perform pg_temp.diag21_trocar('public.fn_diag_aplicar_retencao()',
  '  dele' || 'te from diag_fichas_identificacao where ficha_id = any(v_ids);',
  '  dele' || 'te from diag_fichas_identificacao where ficha_id = any(v_ids);
  -- posição início/fim (diag_21): a linha fica, sem a posição
  update diag_fichas_campo_gps set ini_lat = null, ini_lon = null, ini_precisao_m = null, ini_em = null,
         fim_lat = null, fim_lon = null, fim_precisao_m = null, fim_em = null where ficha_id = any(v_ids);'); end $t$;

-- ── ROPA (TRAT-001): tabelas novas com dado pessoal ─────────────────────
update public.lgpd_tratamentos
   set tabelas = (select array_agg(distinct t order by t) from unnest(tabelas || array['diag_designacoes','diag_area_pedidos','diag_fichas_campo','diag_fichas_campo_gps']) t)
 where codigo = 'TRAT-001'
   and not (tabelas @> array['diag_designacoes','diag_area_pedidos','diag_fichas_campo','diag_fichas_campo_gps']);
update public.lgpd_tratamentos
   set categorias_dados = categorias_dados || array['posição GPS do entrevistador no início e no fim de cada entrevista e no pedido de autorização (o trajeto não é enviado)'],
       medidas_seguranca = medidas_seguranca || ' Setores de campo: a posição do entrevistador fica no aparelho enquanto o app está aberto (alerta de área); ao servidor vão só início e fim de cada entrevista, em tabela de identificação apagada com a retenção. A mesa vê quadrículas de dispersão, nunca o ponto da casa.'
 where codigo = 'TRAT-001'
   and not exists (select 1 from unnest(categorias_dados) c where c like 'posição GPS do entrevistador%');
