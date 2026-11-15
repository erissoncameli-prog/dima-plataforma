-- Testes do Patrimônio · Fase 5 (posição numa data e regras do auditor)
\set ON_ERROR_STOP 1
create or replace function pg_temp.como(p_uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', case when p_uid = '' then '' else '00000000-0000-0000-0000-0000000000' || p_uid end, false); end $$;
create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin if p_cond is distinct from true then raise exception 'FALHOU: %', p_msg; end if; end $$;

select pg_temp.como('d1');
select pg_temp.ok((select count(*) from fn_pat_posicao(current_date)) >= 3, 'posição lista os bens do ano');
select pg_temp.ok((select bool_and(valor_contabil_brl is not null) from fn_pat_posicao(current_date)), 'gestor vê valores');
select pg_temp.ok((select bool_and(valor_contabil_brl <= valor_aquisicao_brl and depreciacao_no_ano_brl <= depreciacao_acumulada_brl)
                     from fn_pat_posicao(current_date + 400)), 'contábil ≤ aquisição; no ano ≤ acumulada');
select pg_temp.ok((select count(*) from fn_pat_posicao('2000-01-01')) = 0, 'nada antes da aquisição');
select pg_temp.como('a2');   -- visualizador: lista sem valor
select pg_temp.ok((select bool_and(valor_contabil_brl is null) and count(*) > 0 from fn_pat_posicao(current_date)), 'visualizador sem valor');
select pg_temp.como('e1');
select pg_temp.ok((select count(*) from fn_pat_posicao(current_date)) = 0, 'consultor externo não vê');
select pg_temp.como('');
select pg_temp.ok((select count(*) from fn_auditoria_patrimonio() where titulo like 'Patrimônio:%') >= 0, 'auditoria roda');
select pg_temp.ok(not exists (select 1 from fn_auditoria_patrimonio() where severidade not in ('critico','alto','medio','baixo','info')), 'severidades válidas');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.fn_auditoria_patrimonio()', 'execute'), 'auditoria só service_role');
select pg_temp.ok(not has_function_privilege('anon', 'public.fn_pat_posicao(date)', 'execute'), 'anon sem posição');
\echo 'Patrimônio (fase 5): todos os testes passaram.'
