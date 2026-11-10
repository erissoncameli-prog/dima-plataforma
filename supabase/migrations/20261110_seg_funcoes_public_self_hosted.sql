-- ═══════════════════════════════════════════════════════════════════════
-- SEGURANÇA — funções do schema public sem EXECUTE para PUBLIC
-- (Produto 4, TdR 4.1: auditoria de segurança das funções públicas)
-- ═══════════════════════════════════════════════════════════════════════
-- Achado da auditoria de 10/11/2026: no ambiente self-hosted (restaurado de
-- dump --no-privileges, e os pacotes de restauração gerados a partir dele),
-- TODAS as funções do public estavam com EXECUTE para PUBLIC (=X/postgres) —
-- o padrão do PostgreSQL, que a Supabase Cloud não usa. Como anon herda de
-- PUBLIC, a chave pública do site conseguia executar 240 funções SECURITY
-- DEFINER, inclusive as que só o servidor deve chamar (fn_rem_assinar,
-- fn_tcan_assinar, fn_encp_decidir, fn_viagem_decidir, fn_api_pedido_decidir —
-- que recebem o usuário por parâmetro e confiam na Edge Function ter
-- conferido a senha —, fn_verificar_senha, fn_audit_log, apagar_tdr...).
-- Na Cloud (produção) essas chamadas já são recusadas (permission denied).
--
-- Conferido antes de revogar (banco local, cópia da produção):
--   • as 86 funções que as telas chamam por rpc() têm GRANT explícito para
--     authenticated e/ou anon; as 21 chamadas pelas Edge Functions têm GRANT
--     explícito para service_role — nenhuma depende do PUBLIC;
--   • nenhuma função sem GRANT explícito para authenticated é usada em
--     policy ou view;
--   • as policies que o anon avalia só usam fn_perfil_atual (GRANT explícito).
-- Funções de trigger não precisam de EXECUTE para disparar.
--
-- Rodar em todo ambiente self-hosted (local, notebook, CIGMA, servidor do
-- governo) e depois de cada restauração de pacote. Na Cloud é inócua (o que
-- já está fechado continua fechado).
-- ═══════════════════════════════════════════════════════════════════════

revoke execute on all functions in schema public from public;

-- Função criada daqui em diante também nasce sem EXECUTE para PUBLIC
-- (o mesmo que a Cloud faz); quem precisa recebe GRANT explícito na migração
alter default privileges for role postgres in schema public revoke execute on functions from public;

-- Conferência: deve devolver 0 linhas (nenhuma função de ação aberta ao anon)
-- select p.proname from pg_proc p
-- where p.pronamespace = 'public'::regnamespace and p.prosecdef
--   and has_function_privilege('anon', p.oid, 'execute')
--   and p.proname !~ '^fn_publico_'
--   and p.proname not in ('fn_perfil_atual','tem_permissao','fn_pode_ver_tarefa','fn_tarefa_pode_editar','fn_tarefa_pode_delegar')
--   and p.prorettype <> 'trigger'::regtype;
