-- ════════════════════════════════════════════════════════════════════════
-- Bucket tarefas-anexos: storage passa a seguir o acesso da TAREFA.
-- Antes, qualquer autenticado listava/baixava/apagava qualquer arquivo do
-- bucket (policies só checavam bucket_id). O caminho é sempre
-- "<tarefa_id>/<arquivo>", então a 1ª pasta identifica a tarefa.
--   SELECT / INSERT  → quem VÊ a tarefa (observador anexa ao próprio comentário)
--   UPDATE / DELETE  → quem EDITA a tarefa
-- Edge Functions usam service_role e não são afetadas.
-- ════════════════════════════════════════════════════════════════════════

-- uuid da tarefa a partir do caminho (NULL se a 1ª pasta não for uuid)
create or replace function fn_tarefa_id_do_path(p_name text)
returns uuid language sql stable set search_path = public as $$
  select case when (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(p_name))[1])::uuid end;
$$;
revoke execute on function fn_tarefa_id_do_path(text) from public, anon;
grant  execute on function fn_tarefa_id_do_path(text) to authenticated;

drop policy if exists "tarefas_anexos_auth_select" on storage.objects;
drop policy if exists "tarefas_anexos_auth_insert" on storage.objects;
drop policy if exists "tarefas_anexos_auth_update" on storage.objects;
drop policy if exists "tarefas_anexos_auth_delete" on storage.objects;

create policy "tarefas_anexos_auth_select" on storage.objects for select to authenticated
  using (bucket_id = 'tarefas-anexos' and fn_pode_ver_tarefa(fn_tarefa_id_do_path(name)));

create policy "tarefas_anexos_auth_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'tarefas-anexos' and fn_pode_ver_tarefa(fn_tarefa_id_do_path(name)));

create policy "tarefas_anexos_auth_update" on storage.objects for update to authenticated
  using (bucket_id = 'tarefas-anexos' and fn_tarefa_pode_editar(fn_tarefa_id_do_path(name)))
  with check (bucket_id = 'tarefas-anexos' and fn_tarefa_pode_editar(fn_tarefa_id_do_path(name)));

create policy "tarefas_anexos_auth_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'tarefas-anexos' and fn_tarefa_pode_editar(fn_tarefa_id_do_path(name)));
