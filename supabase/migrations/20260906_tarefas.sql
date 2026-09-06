-- ════════════════════════════════════════════════════════════════════════
-- Painel de Tarefas & Delegações — DIMA (UNESCO/SEMA-AC)
-- Fase 1 (MVP): enums, tabelas, RLS, RPCs governadas e integração com o sino.
--
-- Atores:
--   • Responsável interno  → public.usuarios   (opera a tarefa, tem login)
--   • Parte externa        → public.fornecedores (só é cobrada por e-mail)
-- Governança de escrita: RPCs SECURITY DEFINER (padrão do projeto). RLS de
-- tabela funciona como backstop. Nada é exposto ao papel anon.
-- ════════════════════════════════════════════════════════════════════════

-- ── Enums ───────────────────────────────────────────────────────────────
do $$ begin
  create type status_tarefa as enum
    ('a_fazer','em_andamento','em_revisao','bloqueada','concluida','cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type prioridade_tarefa as enum ('baixa','media','alta','urgente');
exception when duplicate_object then null; end $$;

-- ── Sequence do código curto (TR-001, TR-002, …) ────────────────────────
create sequence if not exists seq_tarefa_codigo start 1;

-- ── Tabela: tarefas ─────────────────────────────────────────────────────
create table if not exists public.tarefas (
  id                   uuid primary key default gen_random_uuid(),
  codigo               text unique,
  titulo               text not null,
  descricao            text,
  status               status_tarefa    not null default 'a_fazer',
  prioridade           prioridade_tarefa not null default 'media',
  criado_por           uuid not null references public.usuarios(id),
  dt_inicio            date,
  dt_prazo             date,
  dt_conclusao         timestamptz,
  -- vínculo polimórfico opcional (mesmo par que a tabela notificacoes usa)
  entidade_tipo        varchar,   -- 'atividade' | 'tdr' | 'contrato' | 'produto' | 'viagem'
  entidade_id          uuid,
  -- denormalizado para RLS/filtro (a atividade "dona" da tarefa)
  atividade_id         uuid references public.atividades(id),
  -- parte externa (fornecedor) — sem login, apenas notificada por e-mail
  fornecedor_id        uuid references public.fornecedores(id),
  notificar_fornecedor boolean not null default false,
  ordem                numeric not null default 0,   -- posição na coluna do Kanban
  ativo                boolean not null default true, -- soft-delete
  criado_em            timestamptz default now(),
  atualizado_em        timestamptz default now()
);

create index if not exists idx_tarefas_atividade   on public.tarefas(atividade_id);
create index if not exists idx_tarefas_status       on public.tarefas(status) where ativo;
create index if not exists idx_tarefas_prazo         on public.tarefas(dt_prazo) where ativo;
create index if not exists idx_tarefas_entidade      on public.tarefas(entidade_tipo, entidade_id);
create index if not exists idx_tarefas_fornecedor    on public.tarefas(fornecedor_id);

-- ── Tabela: tarefa_participantes (responsáveis + observadores) ──────────
create table if not exists public.tarefa_participantes (
  id         uuid primary key default gen_random_uuid(),
  tarefa_id  uuid not null references public.tarefas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id),
  papel      text not null default 'responsavel' check (papel in ('responsavel','observador')),
  criado_em  timestamptz default now(),
  unique (tarefa_id, usuario_id)
);
create index if not exists idx_tpart_usuario on public.tarefa_participantes(usuario_id) where papel = 'responsavel';
create index if not exists idx_tpart_tarefa  on public.tarefa_participantes(tarefa_id);

-- ── Tabela: tarefa_historico (feed de atividade + trilha imutável) ──────
create table if not exists public.tarefa_historico (
  id         uuid primary key default gen_random_uuid(),
  tarefa_id  uuid not null references public.tarefas(id) on delete cascade,
  autor_id   uuid references public.usuarios(id),
  tipo       text not null, -- criacao|status|prazo|responsavel|conclusao|reabertura|edicao
  de         text,
  para       text,
  criado_em  timestamptz default now()
);
create index if not exists idx_thist_tarefa on public.tarefa_historico(tarefa_id, criado_em);

-- ── Triggers utilitários ────────────────────────────────────────────────
create or replace function fn_tarefa_set_codigo() returns trigger
language plpgsql as $$
begin
  if new.codigo is null then
    new.codigo := 'TR-' || lpad(nextval('seq_tarefa_codigo')::text, 3, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_tarefa_codigo on public.tarefas;
create trigger trg_tarefa_codigo before insert on public.tarefas
  for each row execute function fn_tarefa_set_codigo();

create or replace function fn_tarefa_touch() returns trigger
language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

drop trigger if exists trg_tarefa_touch on public.tarefas;
create trigger trg_tarefa_touch before update on public.tarefas
  for each row execute function fn_tarefa_touch();

-- ════════════════════════════════════════════════════════════════════════
-- Helpers de permissão (SECURITY DEFINER, evitam recursão de RLS)
-- ════════════════════════════════════════════════════════════════════════

-- Pode delegar/gerir tarefas (coordenação global OU responsável da atividade)
create or replace function fn_tarefa_pode_delegar(p_atividade_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    fn_perfil_atual() in ('super_admin','coordenacao')
    or (p_atividade_id is not null and exists (
          select 1 from atividade_responsaveis ar
          where ar.atividade_id = p_atividade_id
            and ar.usuario_id = auth.uid()
            and ar.ativo = true));
$$;

-- Enxerga a tarefa? (usado nas policies das tabelas-filhas, sem recursão)
create or replace function fn_pode_ver_tarefa(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tarefas t
    where t.id = p_id
      and (
        t.criado_por = auth.uid()
        or fn_perfil_atual() in ('super_admin','coordenacao')
        or exists (select 1 from tarefa_participantes tp
                   where tp.tarefa_id = t.id and tp.usuario_id = auth.uid())
        or (t.atividade_id is not null and exists (
              select 1 from atividade_responsaveis ar
              where ar.atividade_id = t.atividade_id
                and ar.usuario_id = auth.uid() and ar.ativo = true))
      )
  );
$$;

-- Pode escrever/atualizar esta tarefa?
create or replace function fn_tarefa_pode_editar(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tarefas t
    where t.id = p_id
      and (
        t.criado_por = auth.uid()
        or fn_perfil_atual() in ('super_admin','coordenacao')
        or exists (select 1 from tarefa_participantes tp
                   where tp.tarefa_id = t.id and tp.usuario_id = auth.uid()
                     and tp.papel = 'responsavel')
        or (t.atividade_id is not null and exists (
              select 1 from atividade_responsaveis ar
              where ar.atividade_id = t.atividade_id
                and ar.usuario_id = auth.uid() and ar.ativo = true))
      )
  );
$$;

-- ════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════
alter table public.tarefas              enable row level security;
alter table public.tarefa_participantes enable row level security;
alter table public.tarefa_historico     enable row level security;

-- tarefas: leitura para envolvidos; escrita direta só para editores (backstop)
drop policy if exists tarefas_select on public.tarefas;
create policy tarefas_select on public.tarefas for select to authenticated
using (
  criado_por = auth.uid()
  or fn_perfil_atual() in ('super_admin','coordenacao')
  or exists (select 1 from tarefa_participantes tp
             where tp.tarefa_id = tarefas.id and tp.usuario_id = auth.uid())
  or (atividade_id is not null and exists (
        select 1 from atividade_responsaveis ar
        where ar.atividade_id = tarefas.atividade_id
          and ar.usuario_id = auth.uid() and ar.ativo = true))
);

drop policy if exists tarefas_update on public.tarefas;
create policy tarefas_update on public.tarefas for update to authenticated
using (fn_tarefa_pode_editar(id)) with check (fn_tarefa_pode_editar(id));

-- INSERT/DELETE só via RPC (SECURITY DEFINER); sem policy = negado ao cliente.

-- participantes: leitura se a tarefa é visível; escrita só via RPC
drop policy if exists tpart_select on public.tarefa_participantes;
create policy tpart_select on public.tarefa_participantes for select to authenticated
using (fn_pode_ver_tarefa(tarefa_id));

-- histórico: leitura se a tarefa é visível; nunca UPDATE/DELETE (imutável)
drop policy if exists thist_select on public.tarefa_historico;
create policy thist_select on public.tarefa_historico for select to authenticated
using (fn_pode_ver_tarefa(tarefa_id));

-- Grants (RLS ainda filtra). Nada para anon.
grant select, update on public.tarefas              to authenticated;
grant select          on public.tarefa_participantes to authenticated;
grant select          on public.tarefa_historico     to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- Notificação in-app (sino) — helper interno
-- ════════════════════════════════════════════════════════════════════════
create or replace function fn_tarefa_notificar(
  p_usuarios uuid[], p_tipo text, p_titulo text, p_msg text, p_tarefa_id uuid, p_excluir uuid
) returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if p_usuarios is null then return; end if;
  foreach u in array p_usuarios loop
    if u is null or u = p_excluir then continue; end if;
    insert into notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
    values (u, p_tipo, p_titulo, p_msg,
            'tarefas.html?tarefa=' || p_tarefa_id::text, 'tarefa', p_tarefa_id);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- RPCs de escrita governada
-- ════════════════════════════════════════════════════════════════════════

-- Criar tarefa (+ participantes + histórico + notificações do sino)
create or replace function fn_criar_tarefa(
  p_titulo               text,
  p_descricao            text            default null,
  p_prioridade           prioridade_tarefa default 'media',
  p_dt_inicio            date            default null,
  p_dt_prazo             date            default null,
  p_entidade_tipo        text            default null,
  p_entidade_id          uuid            default null,
  p_atividade_id         uuid            default null,
  p_fornecedor_id        uuid            default null,
  p_notificar_fornecedor boolean         default false,
  p_responsaveis         uuid[]          default '{}',
  p_observadores         uuid[]          default '{}'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid;
  v_caller  uuid := auth.uid();
  v_delega  boolean;
  u         uuid;
  v_titulo  text;
begin
  if v_caller is null then raise exception 'não autenticado'; end if;
  if coalesce(btrim(p_titulo),'') = '' then raise exception 'título obrigatório'; end if;

  -- Precisa de permissão de delegação se atribui a terceiros, vincula
  -- fornecedor, ou prende a tarefa a uma atividade.
  v_delega := exists (
      select 1 from unnest(coalesce(p_responsaveis,'{}')) x where x <> v_caller
    ) or coalesce(array_length(p_observadores,1),0) > 0
      or p_fornecedor_id is not null;

  if v_delega and not fn_tarefa_pode_delegar(p_atividade_id) then
    raise exception 'sem permissão para delegar tarefas a terceiros';
  end if;

  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo,
                       entidade_tipo, entidade_id, atividade_id,
                       fornecedor_id, notificar_fornecedor, criado_por)
  values (btrim(p_titulo), p_descricao, coalesce(p_prioridade,'media'),
          p_dt_inicio, p_dt_prazo, p_entidade_tipo, p_entidade_id, p_atividade_id,
          p_fornecedor_id, coalesce(p_notificar_fornecedor,false), v_caller)
  returning id into v_id;

  -- Se ninguém foi indicado, o próprio criador é o responsável.
  if coalesce(array_length(p_responsaveis,1),0) = 0 then
    p_responsaveis := array[v_caller];
  end if;

  foreach u in array coalesce(p_responsaveis,'{}') loop
    if u is not null then
      insert into tarefa_participantes (tarefa_id, usuario_id, papel)
      values (v_id, u, 'responsavel') on conflict (tarefa_id, usuario_id) do nothing;
    end if;
  end loop;

  foreach u in array coalesce(p_observadores,'{}') loop
    if u is not null then
      insert into tarefa_participantes (tarefa_id, usuario_id, papel)
      values (v_id, u, 'observador')
      on conflict (tarefa_id, usuario_id) do update set papel = excluded.papel;
    end if;
  end loop;

  select codigo into v_titulo from tarefas where id = v_id;

  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (v_id, v_caller, 'criacao', btrim(p_titulo));

  -- Sino: avisa responsáveis (menos o próprio criador)
  perform fn_tarefa_notificar(
    p_responsaveis, 'tarefa_atribuida',
    'Nova tarefa: ' || coalesce(v_titulo,''),
    btrim(p_titulo), v_id, v_caller);

  return v_id;
end $$;

-- Mudar status (+ histórico + notificação de conclusão)
create or replace function fn_mudar_status_tarefa(p_tarefa_id uuid, p_status status_tarefa)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_de     status_tarefa;
  v_cod    text;
  v_tit    text;
  v_alvo   uuid[];
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão para alterar esta tarefa';
  end if;

  select status, codigo, titulo into v_de, v_cod, v_tit from tarefas where id = p_tarefa_id;
  if v_de is null then raise exception 'tarefa não encontrada'; end if;
  if v_de = p_status then return; end if;

  update tarefas set status = p_status,
    dt_conclusao = case when p_status = 'concluida' then now() else null end
  where id = p_tarefa_id;

  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para)
  values (p_tarefa_id, v_caller,
          case when p_status = 'concluida' then 'conclusao'
               when v_de = 'concluida' then 'reabertura' else 'status' end,
          v_de::text, p_status::text);

  if p_status = 'concluida' then
    -- avisa criador + observadores (menos quem concluiu)
    select array_agg(uid) into v_alvo from (
      select criado_por uid from tarefas where id = p_tarefa_id
      union
      select usuario_id from tarefa_participantes
      where tarefa_id = p_tarefa_id and papel = 'observador'
    ) s;
    perform fn_tarefa_notificar(v_alvo, 'tarefa_concluida',
      'Tarefa concluída: ' || coalesce(v_cod,''), coalesce(v_tit,''), p_tarefa_id, v_caller);
  end if;
end $$;

-- Reagendar prazo (+ histórico + notificação aos responsáveis)
create or replace function fn_reagendar_tarefa(p_tarefa_id uuid, p_dt_prazo date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_de date; v_cod text; v_tit text; v_alvo uuid[];
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão para alterar esta tarefa';
  end if;
  select dt_prazo, codigo, titulo into v_de, v_cod, v_tit from tarefas where id = p_tarefa_id;

  update tarefas set dt_prazo = p_dt_prazo where id = p_tarefa_id;

  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para)
  values (p_tarefa_id, v_caller, 'prazo',
          coalesce(to_char(v_de,'DD/MM/YYYY'),'—'),
          coalesce(to_char(p_dt_prazo,'DD/MM/YYYY'),'—'));

  select array_agg(usuario_id) into v_alvo from tarefa_participantes
  where tarefa_id = p_tarefa_id and papel = 'responsavel';
  perform fn_tarefa_notificar(v_alvo, 'tarefa_prazo',
    'Prazo alterado: ' || coalesce(v_cod,''),
    'Novo prazo: ' || coalesce(to_char(p_dt_prazo,'DD/MM/YYYY'),'sem prazo'),
    p_tarefa_id, v_caller);
end $$;

-- Editar campos gerais (título, descrição, prioridade, vínculos, fornecedor)
create or replace function fn_editar_tarefa(
  p_tarefa_id uuid, p_titulo text, p_descricao text, p_prioridade prioridade_tarefa,
  p_entidade_tipo text, p_entidade_id uuid, p_atividade_id uuid,
  p_fornecedor_id uuid, p_notificar_fornecedor boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão para editar esta tarefa';
  end if;
  update tarefas set
    titulo = coalesce(btrim(p_titulo), titulo),
    descricao = p_descricao,
    prioridade = coalesce(p_prioridade, prioridade),
    entidade_tipo = p_entidade_tipo, entidade_id = p_entidade_id,
    atividade_id = p_atividade_id,
    fornecedor_id = p_fornecedor_id,
    notificar_fornecedor = coalesce(p_notificar_fornecedor, notificar_fornecedor)
  where id = p_tarefa_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo) values (p_tarefa_id, auth.uid(), 'edicao');
end $$;

-- Atribuir responsável/observador (+ histórico + notificação)
create or replace function fn_atribuir_participante(p_tarefa_id uuid, p_usuario_id uuid, p_papel text default 'responsavel')
returns void language plpgsql security definer set search_path = public as $$
declare v_cod text; v_tit text; v_nome text;
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão para atribuir nesta tarefa';
  end if;
  if p_papel not in ('responsavel','observador') then p_papel := 'responsavel'; end if;

  insert into tarefa_participantes (tarefa_id, usuario_id, papel)
  values (p_tarefa_id, p_usuario_id, p_papel)
  on conflict (tarefa_id, usuario_id) do update set papel = excluded.papel;

  select codigo, titulo into v_cod, v_tit from tarefas where id = p_tarefa_id;
  select nome_completo into v_nome from usuarios where id = p_usuario_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (p_tarefa_id, auth.uid(), 'responsavel', coalesce(v_nome, p_papel));

  if p_papel = 'responsavel' then
    perform fn_tarefa_notificar(array[p_usuario_id], 'tarefa_atribuida',
      'Você foi atribuído: ' || coalesce(v_cod,''), coalesce(v_tit,''), p_tarefa_id, auth.uid());
  end if;
end $$;

create or replace function fn_remover_participante(p_tarefa_id uuid, p_usuario_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão';
  end if;
  delete from tarefa_participantes where tarefa_id = p_tarefa_id and usuario_id = p_usuario_id;
end $$;

grant execute on function fn_criar_tarefa(text,text,prioridade_tarefa,date,date,text,uuid,uuid,uuid,boolean,uuid[],uuid[]) to authenticated;
grant execute on function fn_mudar_status_tarefa(uuid,status_tarefa) to authenticated;
grant execute on function fn_reagendar_tarefa(uuid,date) to authenticated;
grant execute on function fn_editar_tarefa(uuid,text,text,prioridade_tarefa,text,uuid,uuid,uuid,boolean) to authenticated;
grant execute on function fn_atribuir_participante(uuid,uuid,text) to authenticated;
grant execute on function fn_remover_participante(uuid,uuid) to authenticated;
grant execute on function fn_tarefa_pode_delegar(uuid) to authenticated;
