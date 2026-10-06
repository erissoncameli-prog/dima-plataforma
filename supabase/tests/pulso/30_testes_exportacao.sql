-- Exportação do Pulso (migração d). Roda depois de 20_testes_perguntas.sql.
create function pg_temp.como(p_uid text, p_role text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), false); execute 'set role ' || p_role; end $$;
create function pg_temp.falha(p_sql text, p_erro text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm like '%' || p_erro || '%' then return; end if;
    raise exception 'esperava %, veio %', p_erro, sqlerrm;
  end;
  raise exception 'esperava erro % e passou: %', p_erro, p_sql;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

select id as c1 from public.pulso_ciclos where titulo = 'Pulso do time técnico' \gset
select id as c2 from public.pulso_ciclos where titulo = 'Pulso do time técnico 2' \gset
set t.c1 = :'c1'; set t.c2 = :'c2';

-- dono exporta (6 respostas): devolve agregados e registra
select pg_temp.como('00000000-0000-0000-0000-000000000010', 'authenticated');
do $$ declare r jsonb := public.fn_pulso_exportar(current_setting('t.c1')::uuid, 'pptx'); begin
  if (r->>'suprimido')::boolean or r->>'autor' <> 'Tec0' or r->'geral' is null then raise exception 'exportar: %', r; end if;
  if r::text ~ 'dispositivo|usuario_id' then raise exception 'exportação com dado de quem respondeu'; end if;
end $$;
select pg_temp.falha($q$select public.fn_pulso_exportar(current_setting('t.c2')::uuid, 'xlsx')$q$, 'pulso:exportacao_suprimida');  -- 0 respostas
select pg_temp.falha($q$select public.fn_pulso_exportar(current_setting('t.c1')::uuid, 'csv')$q$, 'pulso:formato_invalido');
do $$ declare l jsonb := public.fn_pulso_exportar_lista(); begin
  if jsonb_array_length(l) <> 2 then raise exception 'lista do dono: %', jsonb_array_length(l); end if;
  if (select x->>'ultima_resposta' from jsonb_array_elements(l) x where x->>'id' = current_setting('t.c1')) is null then raise exception 'ultima_resposta'; end if;
  if (select (x->>'n_exportacoes')::int from jsonb_array_elements(l) x where x->>'id' = current_setting('t.c1')) <> 1 then raise exception 'n_exportacoes'; end if;
end $$;
reset role;

-- outro técnico não exporta o ciclo alheio; coordenação exporta (só leitura)
select pg_temp.como('00000000-0000-0000-0000-000000000011', 'authenticated');
select pg_temp.falha($q$select public.fn_pulso_exportar(current_setting('t.c1')::uuid, 'xlsx')$q$, 'pulso:sem_permissao');
select pg_temp.falha('select * from public.pulso_exportacoes', 'permission denied');
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000002', 'authenticated');
select public.fn_pulso_exportar(:'c1', 'a4') is not null;
reset role;
select pg_temp.como(null, 'anon');
select pg_temp.falha($q$select public.fn_pulso_exportar(current_setting('t.c1')::uuid, 'xlsx')$q$, 'permission denied');
reset role;

do $$ begin
  if (select count(*) from public.pulso_exportacoes) <> 3 then raise exception 'registros: %', (select count(*) from public.pulso_exportacoes); end if;
  if not exists (select 1 from public.pulso_exportacoes where ciclo_id is null and formato = 'lista_xlsx') then raise exception 'registro da lista'; end if;
  -- tentativa recusada não registra
  if exists (select 1 from public.pulso_exportacoes where ciclo_id = current_setting('t.c2')::uuid) then raise exception 'registrou exportação suprimida'; end if;
end $$;
\echo 'pulso (exportação): todos os testes passaram'
