-- ════════════════════════════════════════════════════════════════════════
-- Tarefa restrita: visível só para os envolvidos (criador + responsáveis +
-- observadores) e para super_admin. Coordenação e responsáveis da atividade
-- vinculada deixam de ver/editar quando tarefas.restrita = true.
-- Qualquer usuário cria tarefa restrita; só o criador (ou super_admin) muda
-- a marcação — garantido por trigger, que também registra no histórico.
-- Como fn_pode_ver_tarefa/fn_tarefa_pode_editar governam subtarefas,
-- comentários, anexos, histórico e o bucket tarefas-anexos, tudo segue junto.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tarefas add column if not exists restrita boolean not null default false;

-- ── Visibilidade ────────────────────────────────────────────────────────
create or replace function fn_pode_ver_tarefa(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tarefas t
    where t.id = p_id
      and (
        t.criado_por = auth.uid()
        or fn_perfil_atual() = 'super_admin'
        or exists (select 1 from tarefa_participantes tp
                   where tp.tarefa_id = t.id and tp.usuario_id = auth.uid())
        or (not t.restrita and (
              fn_perfil_atual() = 'coordenacao'
              or (t.atividade_id is not null and exists (
                    select 1 from atividade_responsaveis ar
                    where ar.atividade_id = t.atividade_id
                      and ar.usuario_id = auth.uid() and ar.ativo = true))))
      )
  );
$$;

create or replace function fn_tarefa_pode_editar(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tarefas t
    where t.id = p_id
      and (
        t.criado_por = auth.uid()
        or fn_perfil_atual() = 'super_admin'
        or exists (select 1 from tarefa_participantes tp
                   where tp.tarefa_id = t.id and tp.usuario_id = auth.uid()
                     and tp.papel = 'responsavel')
        or (not t.restrita and (
              fn_perfil_atual() = 'coordenacao'
              or (t.atividade_id is not null and exists (
                    select 1 from atividade_responsaveis ar
                    where ar.atividade_id = t.atividade_id
                      and ar.usuario_id = auth.uid() and ar.ativo = true))))
      )
  );
$$;

drop policy if exists tarefas_select on public.tarefas;
create policy tarefas_select on public.tarefas for select to authenticated
using (
  criado_por = auth.uid()
  or fn_perfil_atual() = 'super_admin'
  or exists (select 1 from tarefa_participantes tp
             where tp.tarefa_id = tarefas.id and tp.usuario_id = auth.uid())
  or (not restrita and (
        fn_perfil_atual() = 'coordenacao'
        or (atividade_id is not null and exists (
              select 1 from atividade_responsaveis ar
              where ar.atividade_id = tarefas.atividade_id
                and ar.usuario_id = auth.uid() and ar.ativo = true))))
);

-- ── Só o criador (ou super_admin) muda a marcação; fica no histórico ────
create or replace function fn_tarefa_guarda_restrita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.restrita is not distinct from old.restrita then return new; end if;
  if auth.uid() is not null and auth.uid() <> old.criado_por
     and fn_perfil_atual() is distinct from 'super_admin' then
    raise exception 'só quem criou a tarefa pode alterar a restrição';
  end if;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para)
  values (new.id, auth.uid(), 'restricao',
          case when old.restrita then 'restrita' else 'aberta' end,
          case when new.restrita then 'restrita' else 'aberta' end);
  return new;
end $$;
revoke execute on function fn_tarefa_guarda_restrita() from public, authenticated, anon;

drop trigger if exists trg_tarefa_guarda_restrita on public.tarefas;
create trigger trg_tarefa_guarda_restrita before update of restrita on public.tarefas
  for each row execute function fn_tarefa_guarda_restrita();

create or replace function fn_definir_restricao_tarefa(p_tarefa_id uuid, p_restrita boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_pode_ver_tarefa(p_tarefa_id) then raise exception 'sem acesso a esta tarefa'; end if;
  update tarefas set restrita = coalesce(p_restrita, false) where id = p_tarefa_id;
end $$;
revoke execute on function fn_definir_restricao_tarefa(uuid,boolean) from public, anon;
grant  execute on function fn_definir_restricao_tarefa(uuid,boolean) to authenticated;

-- ── fn_criar_tarefa: + p_restrita ───────────────────────────────────────
drop function if exists fn_criar_tarefa(text,text,prioridade_tarefa,date,date,text,uuid,uuid,uuid,boolean,uuid[],uuid[]);

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
  p_observadores         uuid[]          default '{}',
  p_restrita             boolean         default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid;
  v_caller  uuid := auth.uid();
  v_delega  boolean;
  u         uuid;
  v_titulo  text;
  v_obs     uuid[];
begin
  if v_caller is null then raise exception 'não autenticado'; end if;
  if coalesce(btrim(p_titulo),'') = '' then raise exception 'título obrigatório'; end if;

  v_delega := exists (
      select 1 from unnest(coalesce(p_responsaveis,'{}')) x where x <> v_caller
    ) or coalesce(array_length(p_observadores,1),0) > 0
      or p_fornecedor_id is not null
      or p_atividade_id is not null;

  if v_delega and not fn_tarefa_pode_delegar(p_atividade_id) then
    raise exception 'sem permissão para delegar tarefas a terceiros';
  end if;

  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo,
                       entidade_tipo, entidade_id, atividade_id,
                       fornecedor_id, notificar_fornecedor, criado_por, restrita)
  values (btrim(p_titulo), p_descricao, coalesce(p_prioridade,'media'),
          p_dt_inicio, p_dt_prazo, p_entidade_tipo, p_entidade_id, p_atividade_id,
          p_fornecedor_id, coalesce(p_notificar_fornecedor,false), v_caller,
          coalesce(p_restrita,false))
  returning id into v_id;

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

  perform fn_tarefa_notificar(
    p_responsaveis, 'tarefa_atribuida',
    'Nova tarefa: ' || coalesce(v_titulo,''),
    btrim(p_titulo), v_id, v_caller);

  select array_agg(usuario_id) into v_obs from tarefa_participantes
  where tarefa_id = v_id and papel = 'observador';
  perform fn_tarefa_notificar(
    v_obs, 'tarefa_observador',
    'Você acompanha: ' || coalesce(v_titulo,''),
    btrim(p_titulo), v_id, v_caller);

  return v_id;
end $$;

revoke execute on function fn_criar_tarefa(text,text,prioridade_tarefa,date,date,text,uuid,uuid,uuid,boolean,uuid[],uuid[],boolean) from public, anon;
grant  execute on function fn_criar_tarefa(text,text,prioridade_tarefa,date,date,text,uuid,uuid,uuid,boolean,uuid[],uuid[],boolean) to authenticated;
