-- O Supabase concede EXECUTE a authenticated/anon por default privileges;
-- "revoke ... from public" não remove esses grants diretos. Fecha explicitamente
-- as funções que só devem rodar internamente (definer) ou via service_role.
-- (Sem isso, um usuário logado conseguia forjar autoria de comentário e injetar
--  notificações para qualquer usuário — pego em smoke test.)
revoke execute on function fn_comentar_tarefa_sistema(uuid,uuid,text,text) from authenticated, anon;
revoke execute on function fn_tarefa_notificar(uuid[],text,text,text,uuid,uuid) from authenticated, anon;
grant  execute on function fn_comentar_tarefa_sistema(uuid,uuid,text,text) to service_role;
