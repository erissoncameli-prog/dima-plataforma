-- Correções pós code-review (Fase 2):
-- 1) fn_editar_tarefa passa a persistir dt_inicio.
-- 2) fn_criar_tarefa passa a exigir permissão de delegação também ao vincular
--    a tarefa a uma atividade (alinha o código ao comentário/intenção).

-- ── fn_editar_tarefa: + p_dt_inicio ──────────────────────────────────────
drop function if exists fn_editar_tarefa(uuid,text,text,prioridade_tarefa,text,uuid,uuid,uuid,boolean);

create or replace function fn_editar_tarefa(
  p_tarefa_id uuid, p_titulo text, p_descricao text, p_prioridade prioridade_tarefa,
  p_dt_inicio date, p_entidade_tipo text, p_entidade_id uuid, p_atividade_id uuid,
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
    dt_inicio = p_dt_inicio,
    entidade_tipo = p_entidade_tipo, entidade_id = p_entidade_id,
    atividade_id = p_atividade_id,
    fornecedor_id = p_fornecedor_id,
    notificar_fornecedor = coalesce(p_notificar_fornecedor, notificar_fornecedor)
  where id = p_tarefa_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo) values (p_tarefa_id, auth.uid(), 'edicao');
end $$;

revoke execute on function fn_editar_tarefa(uuid,text,text,prioridade_tarefa,date,text,uuid,uuid,uuid,boolean) from public;
grant  execute on function fn_editar_tarefa(uuid,text,text,prioridade_tarefa,date,text,uuid,uuid,uuid,boolean) to authenticated;

-- ── fn_criar_tarefa: gate inclui atividade_id ────────────────────────────
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

  -- Precisa de permissão de delegação se atribui a terceiros, adiciona
  -- observadores, vincula fornecedor, ou prende a tarefa a uma atividade.
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
                       fornecedor_id, notificar_fornecedor, criado_por)
  values (btrim(p_titulo), p_descricao, coalesce(p_prioridade,'media'),
          p_dt_inicio, p_dt_prazo, p_entidade_tipo, p_entidade_id, p_atividade_id,
          p_fornecedor_id, coalesce(p_notificar_fornecedor,false), v_caller)
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

  return v_id;
end $$;
