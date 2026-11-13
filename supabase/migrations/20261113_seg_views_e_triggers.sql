-- Auditoria de segurança 13/11/2026 — privilégio mínimo em views e funções de gatilho.
--
-- 1) Views só de leitura. Nove views ainda tinham INSERT/UPDATE/DELETE/TRUNCATE/
--    TRIGGER/REFERENCES para authenticated (padrão antigo do Supabase). Hoje
--    nenhuma é auto-atualizável, mas se alguma virar (view simples com dono
--    postgres) qualquer logado passaria a escrever na tabela de baixo ignorando
--    a RLS — foi o que aconteceu com vw_saldo_atividade (ver CLAUDE.md).
--    Nenhuma tela nem Edge Function escreve em vw_* (conferido no código).
-- 2) Funções de gatilho SECURITY DEFINER executáveis pela chave pública (anon)
--    via /rest/v1/rpc. O Postgres não confere EXECUTE quando o gatilho dispara
--    (só no CREATE TRIGGER), então revogar não muda o funcionamento.
-- Sem DROP/DELETE: pode ir pelo apply_migration.

do $$
declare v text;
begin
  foreach v in array array[
    'vw_acervo_entrega_ref','vw_acervo_midias','vw_acervo_obras','vw_dashboard_kpis',
    'vw_fila_revisao','vw_matriz_progresso','vw_pendencias_usuario','vw_produtos_entregues',
    'vw_tarefa_progresso'
  ] loop
    if to_regclass('public.' || v) is not null then
      execute format('revoke insert, update, delete, truncate, trigger, references on public.%I from anon, authenticated, public', v);
    end if;
  end loop;
end $$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
      and p.prosecdef
      and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
  end loop;
end $$;
