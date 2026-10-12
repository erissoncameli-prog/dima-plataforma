-- ════════════════════════════════════════════════════════════════════════
-- Bucket contratos-docs — acesso por contrato (parte 2: policies)
-- Colar inteiro no SQL Editor do Supabase e executar. Idempotente.
-- Inclui também as travas do termo de encerramento
-- (20261012_encerramento_documento_sql_editor.sql) — pode rodar só este.
--
--   Ler      = quem enxerga o contrato (a consulta a contratos passa pela RLS
--              contratos_select: super_admin/coordenação/financeiro, acesso extra
--              'contratos' ou responsável da atividade). Arquivo fora do padrão
--              contratos/<id>/ ou encerramentos/<id>/ = só super_admin/coordenação.
--   Enviar   = super_admin/coordenação/financeiro (os que gravam contratos), em
--              contratos/<id>/ de contrato existente; encerramentos/<id>/ só
--              super_admin/coordenação (os que anexam o termo).
--   Substituir = os mesmos, só em contratos/<id>/.
--   Remover  = só super_admin, só em contratos/<id>/ (a tela não remove arquivo).
--   encerramentos/: nunca substitui nem remove (policies restritivas).
-- ════════════════════════════════════════════════════════════════════════
begin;

-- policies antigas (só bucket_id: abertas a qualquer logado)
drop policy if exists contratos_docs_insert      on storage.objects;
drop policy if exists contratos_docs_delete      on storage.objects;
drop policy if exists contratos_docs_auth_insert on storage.objects;
drop policy if exists contratos_docs_auth_update on storage.objects;
drop policy if exists contratos_docs_auth_select on storage.objects;

drop policy if exists contratos_docs_ler on storage.objects;
create policy contratos_docs_ler on storage.objects for select to authenticated
  using (bucket_id = 'contratos-docs' and (
    exists (select 1 from public.contratos c where c.id = public.fn_contrato_id_do_path(name))
    or public.fn_perfil_atual() in ('super_admin', 'coordenacao')));

drop policy if exists contratos_docs_enviar on storage.objects;
create policy contratos_docs_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'contratos-docs'
    and exists (select 1 from public.contratos c where c.id = public.fn_contrato_id_do_path(name))
    and (
      (split_part(name, '/', 1) = 'contratos'     and public.fn_perfil_atual() in ('super_admin', 'coordenacao', 'financeiro'))
   or (split_part(name, '/', 1) = 'encerramentos' and public.fn_perfil_atual() in ('super_admin', 'coordenacao'))));

drop policy if exists contratos_docs_substituir on storage.objects;
create policy contratos_docs_substituir on storage.objects for update to authenticated
  using (bucket_id = 'contratos-docs' and split_part(name, '/', 1) = 'contratos'
    and public.fn_perfil_atual() in ('super_admin', 'coordenacao', 'financeiro'))
  with check (bucket_id = 'contratos-docs' and split_part(name, '/', 1) = 'contratos'
    and exists (select 1 from public.contratos c where c.id = public.fn_contrato_id_do_path(name))
    and public.fn_perfil_atual() in ('super_admin', 'coordenacao', 'financeiro'));

drop policy if exists contratos_docs_remover on storage.objects;
create policy contratos_docs_remover on storage.objects for delete to authenticated
  using (bucket_id = 'contratos-docs' and split_part(name, '/', 1) = 'contratos'
    and public.fn_perfil_atual() = 'super_admin');

-- termo de encerramento: nunca substitui nem remove (restritivas)
drop policy if exists contratos_docs_encerramento_sem_remocao on storage.objects;
create policy contratos_docs_encerramento_sem_remocao on storage.objects as restrictive
  for delete to authenticated
  using (not (bucket_id = 'contratos-docs' and name like 'encerramentos/%'));

drop policy if exists contratos_docs_encerramento_sem_troca on storage.objects;
create policy contratos_docs_encerramento_sem_troca on storage.objects as restrictive
  for update to authenticated
  using (not (bucket_id = 'contratos-docs' and name like 'encerramentos/%'));

commit;
