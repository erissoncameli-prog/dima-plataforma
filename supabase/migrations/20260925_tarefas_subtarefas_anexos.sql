-- ════════════════════════════════════════════════════════════════════════
-- Painel de Tarefas — Fase 4
--  1) Subtarefa qualificada: responsável (usuário OU fornecedor), prazo e anexos.
--     Usuário responsável por subtarefa entra automaticamente como observador.
--  2) Anexo vinculado ao comentário (e-mail ou painel) e à subtarefa.
--  3) Fornecedor responde por e-mail → comentário com autor_fornecedor_id.
--  4) Observador passa a ser notificado no sino (inclusão e prazo).
--  5) Backfill: religa anexos antigos de e-mail ao comentário de origem.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) Colunas novas ────────────────────────────────────────────────────
alter table public.tarefa_checklist
  add column if not exists responsavel_usuario_id    uuid references public.usuarios(id),
  add column if not exists responsavel_fornecedor_id uuid references public.fornecedores(id),
  add column if not exists dt_prazo                  date;

alter table public.tarefa_checklist drop constraint if exists tarefa_checklist_um_responsavel;
alter table public.tarefa_checklist add constraint tarefa_checklist_um_responsavel
  check (responsavel_usuario_id is null or responsavel_fornecedor_id is null);

create index if not exists idx_checklist_prazo on public.tarefa_checklist(dt_prazo) where not concluida;

-- Comentário pode ter como autor um fornecedor (resposta de e-mail, sem login)
alter table public.tarefa_comentarios alter column autor_id drop not null;
alter table public.tarefa_comentarios
  add column if not exists autor_fornecedor_id uuid references public.fornecedores(id),
  add column if not exists checklist_id        uuid references public.tarefa_checklist(id) on delete set null;
alter table public.tarefa_comentarios drop constraint if exists tarefa_comentarios_tem_autor;
alter table public.tarefa_comentarios add constraint tarefa_comentarios_tem_autor
  check (autor_id is not null or autor_fornecedor_id is not null);

-- Anexo ligado ao comentário e/ou à subtarefa. "set null" mantém o arquivo na
-- tarefa (aba Anexos) se o comentário/subtarefa for removido.
alter table public.tarefa_anexos
  add column if not exists comentario_id             uuid references public.tarefa_comentarios(id) on delete set null,
  add column if not exists checklist_id              uuid references public.tarefa_checklist(id) on delete set null,
  add column if not exists enviado_por_fornecedor_id uuid references public.fornecedores(id);
create index if not exists idx_anexo_comentario on public.tarefa_anexos(comentario_id) where comentario_id is not null;
create index if not exists idx_anexo_checklist  on public.tarefa_anexos(checklist_id)  where checklist_id  is not null;

-- Coerência: comentário/subtarefa do anexo precisam ser da mesma tarefa
create or replace function fn_tarefa_anexo_coerente() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.comentario_id is not null and not exists (
       select 1 from tarefa_comentarios where id = new.comentario_id and tarefa_id = new.tarefa_id) then
    raise exception 'comentário não pertence a esta tarefa';
  end if;
  if new.checklist_id is not null and not exists (
       select 1 from tarefa_checklist where id = new.checklist_id and tarefa_id = new.tarefa_id) then
    raise exception 'subtarefa não pertence a esta tarefa';
  end if;
  return new;
end $$;
drop trigger if exists trg_tarefa_anexo_coerente on public.tarefa_anexos;
create trigger trg_tarefa_anexo_coerente before insert or update on public.tarefa_anexos
  for each row execute function fn_tarefa_anexo_coerente();

-- ── 2) Anexos: quem comenta (inclusive observador) anexa ao próprio comentário
drop policy if exists anexo_insert on public.tarefa_anexos;
create policy anexo_insert on public.tarefa_anexos for insert to authenticated
  with check (
    enviado_por = auth.uid()
    and (
      fn_tarefa_pode_editar(tarefa_id)
      or (comentario_id is not null and exists (
            select 1 from tarefa_comentarios c
            where c.id = comentario_id and c.tarefa_id = tarefa_anexos.tarefa_id
              and c.autor_id = auth.uid()))
    )
  );

-- ── 3) notificacoes.tipo: + tarefa_observador, tarefa_subtarefa ─────────
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo::text = any (array[
    'tdr_para_revisar','tdr_devolvido','tdr_aprovado','tdr_enviado_unesco',
    'produto_para_avaliar','produto_aprovado','produto_devolvido','produto_aguarda_pagamento',
    'atividade_sem_responsavel','substituto_designado','desempate_necessario',
    'viagem_solicitada','viagem_aprovada','viagem_rejeitada','viagem_prestacao',
    'reset_senha_solicitado','reset_senha_atendido',
    'tarefa_atribuida','tarefa_prazo','tarefa_concluida','tarefa_comentario',
    'tarefa_observador','tarefa_subtarefa'
  ]::text[]));

-- ── 4) Responsável de subtarefa → observador automático + sino + histórico
create or replace function fn_tarefa_checklist_responsavel() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cod text; v_tit text; v_nome text; v_novo_obs boolean := false;
begin
  if tg_op = 'UPDATE'
     and new.responsavel_usuario_id    is not distinct from old.responsavel_usuario_id
     and new.responsavel_fornecedor_id is not distinct from old.responsavel_fornecedor_id then
    return new;
  end if;
  if new.responsavel_usuario_id is null and new.responsavel_fornecedor_id is null then
    return new;
  end if;

  select codigo, titulo into v_cod, v_tit from tarefas where id = new.tarefa_id;

  if new.responsavel_usuario_id is not null then
    insert into tarefa_participantes (tarefa_id, usuario_id, papel)
    values (new.tarefa_id, new.responsavel_usuario_id, 'observador')
    on conflict (tarefa_id, usuario_id) do nothing;
    v_novo_obs := found;

    select nome_completo into v_nome from usuarios where id = new.responsavel_usuario_id;

    perform fn_tarefa_notificar(array[new.responsavel_usuario_id], 'tarefa_subtarefa',
      'Subtarefa atribuída: ' || coalesce(v_cod,''),
      left(new.descricao, 120) ||
        case when new.dt_prazo is not null then ' · prazo ' || to_char(new.dt_prazo,'DD/MM/YYYY') else '' end,
      new.tarefa_id, auth.uid());

    if v_novo_obs then
      insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
      values (new.tarefa_id, auth.uid(), 'responsavel', coalesce(v_nome,'—') || ' (observador)');
    end if;
  else
    select nome into v_nome from fornecedores where id = new.responsavel_fornecedor_id;
  end if;

  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para)
  values (new.tarefa_id, auth.uid(), 'subtarefa_resp', left(new.descricao, 60),
          case when new.responsavel_fornecedor_id is not null then '🏢 ' else '' end || coalesce(v_nome,'—'));
  return new;
end $$;
revoke execute on function fn_tarefa_checklist_responsavel() from public, authenticated, anon;

drop trigger if exists trg_checklist_responsavel on public.tarefa_checklist;
create trigger trg_checklist_responsavel
  after insert or update of responsavel_usuario_id, responsavel_fornecedor_id on public.tarefa_checklist
  for each row execute function fn_tarefa_checklist_responsavel();

-- ── 5) Observador notificado no sino ────────────────────────────────────
-- fn_criar_tarefa: observadores recebem 'tarefa_observador'
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

  select array_agg(usuario_id) into v_obs from tarefa_participantes
  where tarefa_id = v_id and papel = 'observador';
  perform fn_tarefa_notificar(
    v_obs, 'tarefa_observador',
    'Você acompanha: ' || coalesce(v_titulo,''),
    btrim(p_titulo), v_id, v_caller);

  return v_id;
end $$;

-- fn_atribuir_participante: observador também é avisado
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
  values (p_tarefa_id, auth.uid(), 'responsavel',
          coalesce(v_nome, p_papel) || case when p_papel = 'observador' then ' (observador)' else '' end);

  if p_papel = 'responsavel' then
    perform fn_tarefa_notificar(array[p_usuario_id], 'tarefa_atribuida',
      'Você foi atribuído: ' || coalesce(v_cod,''), coalesce(v_tit,''), p_tarefa_id, auth.uid());
  else
    perform fn_tarefa_notificar(array[p_usuario_id], 'tarefa_observador',
      'Você acompanha: ' || coalesce(v_cod,''), coalesce(v_tit,''), p_tarefa_id, auth.uid());
  end if;
end $$;

-- fn_reagendar_tarefa: prazo alterado avisa responsáveis E observadores
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
  where tarefa_id = p_tarefa_id;
  perform fn_tarefa_notificar(v_alvo, 'tarefa_prazo',
    'Prazo alterado: ' || coalesce(v_cod,''),
    'Novo prazo: ' || coalesce(to_char(p_dt_prazo,'DD/MM/YYYY'),'sem prazo'),
    p_tarefa_id, v_caller);
end $$;

-- ── 6) Comentário de sistema com vínculo à subtarefa ────────────────────
drop function if exists fn_comentar_tarefa_sistema(uuid,uuid,text,text);
create or replace function fn_comentar_tarefa_sistema(
  p_tarefa_id uuid, p_autor_id uuid, p_corpo text, p_origem text default 'email',
  p_checklist_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cod text; v_alvo uuid[];
begin
  if coalesce(btrim(p_corpo),'') = '' then raise exception 'comentário vazio'; end if;
  if p_autor_id is null then raise exception 'autor obrigatório'; end if;

  insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem, checklist_id)
  values (p_tarefa_id, p_autor_id, btrim(p_corpo), coalesce(p_origem,'email'), p_checklist_id)
  returning id into v_id;

  select codigo into v_cod from tarefas where id = p_tarefa_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (p_tarefa_id, p_autor_id, 'comentario', left(btrim(p_corpo), 80));

  select array_agg(distinct uid) into v_alvo from (
    select criado_por uid from tarefas where id = p_tarefa_id
    union
    select usuario_id from tarefa_participantes where tarefa_id = p_tarefa_id
  ) s;
  perform fn_tarefa_notificar(v_alvo, 'tarefa_comentario',
    'Novo comentário: ' || coalesce(v_cod,''), left(btrim(p_corpo), 120), p_tarefa_id, p_autor_id);

  return v_id;
end $$;

-- Resposta de fornecedor por e-mail (sem login) — só service_role
create or replace function fn_comentar_tarefa_fornecedor(
  p_tarefa_id uuid, p_fornecedor_id uuid, p_corpo text, p_checklist_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cod text; v_nome text; v_alvo uuid[];
begin
  if coalesce(btrim(p_corpo),'') = '' then raise exception 'comentário vazio'; end if;
  if p_fornecedor_id is null then raise exception 'fornecedor obrigatório'; end if;

  insert into tarefa_comentarios (tarefa_id, autor_id, autor_fornecedor_id, corpo, origem, checklist_id)
  values (p_tarefa_id, null, p_fornecedor_id, btrim(p_corpo), 'email', p_checklist_id)
  returning id into v_id;

  select codigo into v_cod from tarefas where id = p_tarefa_id;
  select nome into v_nome from fornecedores where id = p_fornecedor_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (p_tarefa_id, null, 'comentario_fornecedor',
          coalesce(v_nome,'Fornecedor') || ': ' || left(btrim(p_corpo), 60));

  select array_agg(distinct uid) into v_alvo from (
    select criado_por uid from tarefas where id = p_tarefa_id
    union
    select usuario_id from tarefa_participantes where tarefa_id = p_tarefa_id
  ) s;
  perform fn_tarefa_notificar(v_alvo, 'tarefa_comentario',
    'Resposta do fornecedor: ' || coalesce(v_cod,''),
    coalesce(v_nome,'') || ' — ' || left(btrim(p_corpo), 100), p_tarefa_id, null);

  return v_id;
end $$;

revoke execute on function fn_comentar_tarefa_sistema(uuid,uuid,text,text,uuid)  from public, authenticated, anon;
revoke execute on function fn_comentar_tarefa_fornecedor(uuid,uuid,text,uuid)    from public, authenticated, anon;
grant  execute on function fn_comentar_tarefa_sistema(uuid,uuid,text,text,uuid)  to service_role;
grant  execute on function fn_comentar_tarefa_fornecedor(uuid,uuid,text,uuid)    to service_role;

-- ── 7) Backfill: anexo de e-mail → comentário de origem ─────────────────
-- A Edge Function antiga gravava o comentário e, em seguida, os anexos da
-- mesma mensagem (mesmo autor, segundos depois). Religa pelo comentário de
-- e-mail mais recente do mesmo autor na mesma tarefa, até 2 min antes.
update public.tarefa_anexos a
set comentario_id = (
  select c.id from public.tarefa_comentarios c
  where c.tarefa_id = a.tarefa_id and c.origem = 'email'
    and c.autor_id = a.enviado_por
    and a.criado_em between c.criado_em and c.criado_em + interval '2 minutes'
  order by c.criado_em desc limit 1)
where a.comentario_id is null
  and exists (
    select 1 from public.tarefa_comentarios c
    where c.tarefa_id = a.tarefa_id and c.origem = 'email'
      and c.autor_id = a.enviado_por
      and a.criado_em between c.criado_em and c.criado_em + interval '2 minutes');
