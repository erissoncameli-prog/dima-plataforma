-- ════════════════════════════════════════════════════════════════════════
-- Termo de encerramento de contrato — parte para o SQL EDITOR do Supabase
-- (o texto tem remoção de policy, e o apply_migration fica esperando uma
--  confirmação que não chega à sessão). Colar inteiro e executar. Idempotente.
--
-- Policies RESTRITIVAS: nenhum cliente remove nem sobrescreve arquivo sob
-- contratos-docs/encerramentos/ (o SHA-256 do termo fica registrado em
-- contrato_encerramento_documentos; um termo corrigido entra como novo anexo).
-- ════════════════════════════════════════════════════════════════════════
begin;

drop policy if exists contratos_docs_encerramento_sem_remocao on storage.objects;
create policy contratos_docs_encerramento_sem_remocao on storage.objects as restrictive
  for delete to authenticated
  using (not (bucket_id = 'contratos-docs' and name like 'encerramentos/%'));

drop policy if exists contratos_docs_encerramento_sem_troca on storage.objects;
create policy contratos_docs_encerramento_sem_troca on storage.objects as restrictive
  for update to authenticated
  using (not (bucket_id = 'contratos-docs' and name like 'encerramentos/%'));

commit;
