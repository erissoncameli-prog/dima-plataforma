-- ════════════════════════════════════════════════════════════════════════
-- Painel de Tarefas — Fase 2
-- Subtarefas (checklist), comentários, anexos, + tipo de notificação.
-- Reusa fn_pode_ver_tarefa / fn_tarefa_pode_editar da Fase 1.
-- ════════════════════════════════════════════════════════════════════════

-- ── Subtarefas (checklist) ──────────────────────────────────────────────
create table if not exists public.tarefa_checklist (
  id            uuid primary key default gen_random_uuid(),
  tarefa_id     uuid not null references public.tarefas(id) on delete cascade,
  descricao     text not null,
  concluida     boolean not null default false,
  ordem         numeric not null default 0,
  concluida_por uuid references public.usuarios(id),
  concluida_em  timestamptz,
  criado_por    uuid references public.usuarios(id),
  criado_em     timestamptz default now()
);
create index if not exists idx_checklist_tarefa on public.tarefa_checklist(tarefa_id, ordem);

-- ── Comentários ─────────────────────────────────────────────────────────
create table if not exists public.tarefa_comentarios (
  id         uuid primary key default gen_random_uuid(),
  tarefa_id  uuid not null references public.tarefas(id) on delete cascade,
  autor_id   uuid not null references public.usuarios(id),
  corpo      text not null,
  criado_em  timestamptz default now()
);
create index if not exists idx_coment_tarefa on public.tarefa_comentarios(tarefa_id, criado_em);

-- ── Anexos (arquivo no bucket privado tarefas-anexos) ───────────────────
create table if not exists public.tarefa_anexos (
  id           uuid primary key default gen_random_uuid(),
  tarefa_id    uuid not null references public.tarefas(id) on delete cascade,
  arquivo_url  text not null,        -- caminho /object/public/tarefas-anexos/... (portador de path)
  arquivo_nome text not null,
  mime         text,
  tamanho      bigint,
  enviado_por  uuid references public.usuarios(id),
  criado_em    timestamptz default now()
);
create index if not exists idx_anexo_tarefa on public.tarefa_anexos(tarefa_id, criado_em);

-- ── Bucket privado + policies (padrão dos demais buckets de documentos) ─
insert into storage.buckets (id, name, public)
values ('tarefas-anexos','tarefas-anexos', false)
on conflict (id) do nothing;

do $$ begin
  create policy "tarefas_anexos_auth_select" on storage.objects for select to authenticated
    using (bucket_id = 'tarefas-anexos');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "tarefas_anexos_auth_insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'tarefas-anexos');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "tarefas_anexos_auth_update" on storage.objects for update to authenticated
    using (bucket_id = 'tarefas-anexos');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "tarefas_anexos_auth_delete" on storage.objects for delete to authenticated
    using (bucket_id = 'tarefas-anexos');
exception when duplicate_object then null; end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.tarefa_checklist   enable row level security;
alter table public.tarefa_comentarios enable row level security;
alter table public.tarefa_anexos      enable row level security;

-- Checklist: vê quem vê a tarefa; escreve quem edita a tarefa
drop policy if exists chk_select on public.tarefa_checklist;
create policy chk_select on public.tarefa_checklist for select to authenticated
  using (fn_pode_ver_tarefa(tarefa_id));
drop policy if exists chk_write on public.tarefa_checklist;
create policy chk_write on public.tarefa_checklist for all to authenticated
  using (fn_tarefa_pode_editar(tarefa_id)) with check (fn_tarefa_pode_editar(tarefa_id));

-- Comentários: lê quem vê; INSERT só via RPC (notifica + loga histórico)
drop policy if exists coment_select on public.tarefa_comentarios;
create policy coment_select on public.tarefa_comentarios for select to authenticated
  using (fn_pode_ver_tarefa(tarefa_id));

-- Anexos: vê quem vê; grava quem edita (e só como autor)
drop policy if exists anexo_select on public.tarefa_anexos;
create policy anexo_select on public.tarefa_anexos for select to authenticated
  using (fn_pode_ver_tarefa(tarefa_id));
drop policy if exists anexo_insert on public.tarefa_anexos;
create policy anexo_insert on public.tarefa_anexos for insert to authenticated
  with check (fn_tarefa_pode_editar(tarefa_id) and enviado_por = auth.uid());
drop policy if exists anexo_delete on public.tarefa_anexos;
create policy anexo_delete on public.tarefa_anexos for delete to authenticated
  using (fn_tarefa_pode_editar(tarefa_id));

grant select, insert, update, delete on public.tarefa_checklist to authenticated;
grant select                          on public.tarefa_comentarios to authenticated;
grant select, insert, delete          on public.tarefa_anexos     to authenticated;

-- ── notificacoes.tipo: adiciona tarefa_comentario ──────────────────────
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo::text = any (array[
    'tdr_para_revisar','tdr_devolvido','tdr_aprovado','tdr_enviado_unesco',
    'produto_para_avaliar','produto_aprovado','produto_devolvido','produto_aguarda_pagamento',
    'atividade_sem_responsavel','substituto_designado','desempate_necessario',
    'viagem_solicitada','viagem_aprovada','viagem_rejeitada','viagem_prestacao',
    'reset_senha_solicitado','reset_senha_atendido',
    'tarefa_atribuida','tarefa_prazo','tarefa_concluida','tarefa_comentario'
  ]::text[]));

-- ── RPC: comentar (insere + histórico + notifica envolvidos) ────────────
create or replace function fn_comentar_tarefa(p_tarefa_id uuid, p_corpo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cod text; v_caller uuid := auth.uid(); v_alvo uuid[];
begin
  if not fn_pode_ver_tarefa(p_tarefa_id) then
    raise exception 'sem acesso a esta tarefa';
  end if;
  if coalesce(btrim(p_corpo),'') = '' then raise exception 'comentário vazio'; end if;

  insert into tarefa_comentarios (tarefa_id, autor_id, corpo)
  values (p_tarefa_id, v_caller, btrim(p_corpo)) returning id into v_id;

  select codigo into v_cod from tarefas where id = p_tarefa_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (p_tarefa_id, v_caller, 'comentario', left(btrim(p_corpo), 80));

  -- notifica criador + responsáveis + observadores (menos o autor)
  select array_agg(distinct uid) into v_alvo from (
    select criado_por uid from tarefas where id = p_tarefa_id
    union
    select usuario_id from tarefa_participantes where tarefa_id = p_tarefa_id
  ) s;
  perform fn_tarefa_notificar(v_alvo, 'tarefa_comentario',
    'Novo comentário: ' || coalesce(v_cod,''), left(btrim(p_corpo), 120), p_tarefa_id, v_caller);

  return v_id;
end $$;

revoke execute on function fn_comentar_tarefa(uuid,text) from public;
grant  execute on function fn_comentar_tarefa(uuid,text) to authenticated;
