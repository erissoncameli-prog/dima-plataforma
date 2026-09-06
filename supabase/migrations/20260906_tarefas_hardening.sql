-- Hardening do módulo Tarefas (advisors de segurança)
-- 1) search_path fixo nas trigger functions
-- 2) revoga EXECUTE do PUBLIC/anon; mantém apenas authenticated onde é preciso
--    (funções usadas em policies + RPCs chamadas pelo frontend). Helper interno
--    fn_tarefa_notificar fica sem grant (só é chamado por RPCs SECURITY DEFINER).

alter function fn_tarefa_set_codigo() set search_path = public;
alter function fn_tarefa_touch()      set search_path = public;

-- Helpers usados nas policies (authenticated precisa executar)
revoke execute on function fn_pode_ver_tarefa(uuid)      from public;
revoke execute on function fn_tarefa_pode_editar(uuid)   from public;
grant  execute on function fn_pode_ver_tarefa(uuid)      to authenticated;
grant  execute on function fn_tarefa_pode_editar(uuid)   to authenticated;

-- Helper interno: ninguém chama via RPC
revoke execute on function fn_tarefa_notificar(uuid[],text,text,text,uuid,uuid) from public;

-- RPCs do frontend: fecha PUBLIC, mantém authenticated
revoke execute on function fn_tarefa_pode_delegar(uuid) from public;
grant  execute on function fn_tarefa_pode_delegar(uuid) to authenticated;

revoke execute on function fn_criar_tarefa(text,text,prioridade_tarefa,date,date,text,uuid,uuid,uuid,boolean,uuid[],uuid[]) from public;
grant  execute on function fn_criar_tarefa(text,text,prioridade_tarefa,date,date,text,uuid,uuid,uuid,boolean,uuid[],uuid[]) to authenticated;

revoke execute on function fn_mudar_status_tarefa(uuid,status_tarefa) from public;
grant  execute on function fn_mudar_status_tarefa(uuid,status_tarefa) to authenticated;

revoke execute on function fn_reagendar_tarefa(uuid,date) from public;
grant  execute on function fn_reagendar_tarefa(uuid,date) to authenticated;

revoke execute on function fn_editar_tarefa(uuid,text,text,prioridade_tarefa,text,uuid,uuid,uuid,boolean) from public;
grant  execute on function fn_editar_tarefa(uuid,text,text,prioridade_tarefa,text,uuid,uuid,uuid,boolean) to authenticated;

revoke execute on function fn_atribuir_participante(uuid,uuid,text) from public;
grant  execute on function fn_atribuir_participante(uuid,uuid,text) to authenticated;

revoke execute on function fn_remover_participante(uuid,uuid) from public;
grant  execute on function fn_remover_participante(uuid,uuid) to authenticated;
