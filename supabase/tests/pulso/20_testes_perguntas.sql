-- Testes das perguntas personalizáveis (migração c). Roda depois de 05_testes_v1.sql,
-- que deixou dados "legados": ciclo 'Pulso outubro' com 12 respostas e 1 expectativa.
create function pg_temp.como(p_uid text, p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), false);
  execute 'set role ' || p_role;
end $$;
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

\set coord '00000000-0000-0000-0000-000000000002'
\set admin '00000000-0000-0000-0000-000000000001'
\set tec1 '00000000-0000-0000-0000-000000000010'
\set tec2 '00000000-0000-0000-0000-000000000011'
\set fin '00000000-0000-0000-0000-000000000003'

-- 1. legado copiado sem perda
do $$ declare c uuid := (select id from public.pulso_ciclos where titulo = 'Pulso outubro'); begin
  if (select count(*) from public.pulso_respostas_v2 where ciclo_id = c) <> 12 then raise exception 'cópia de respostas'; end if;
  if (select count(*) from public.pulso_respostas_v2 where respostas ? 'q1' and respostas ? 'q6') <> 12 then raise exception 'chaves q1/q6'; end if;
  if (select count(*) from public.pulso_espelho_v2) <> 1 then raise exception 'cópia do espelho'; end if;
  if (select perguntas from public.pulso_ciclos where id = c) <> public.fn_pulso_perguntas_padrao() then raise exception 'perguntas padrão no legado'; end if;
end $$;
select id as legado from public.pulso_ciclos where titulo = 'Pulso outubro' \gset
set t.legado = :'legado';

-- resultado do legado: mesmos números da v1 (12 respostas, eNPS 58, técnico 6 e "demais" 6)
select pg_temp.como(:'coord', 'authenticated');
do $$ declare r jsonb := public.fn_pulso_resultado(current_setting('t.legado')::uuid); begin
  if (r->>'n')::int <> 12 or (r->>'suprimido')::boolean then raise exception 'n legado: %', r->>'n'; end if;
  if (r->'geral'->>'enps')::int <> 58 then raise exception 'eNPS legado: %', r->'geral'->>'enps'; end if;
  if jsonb_array_length(r->'grupos') <> 2 then raise exception 'grupos legado: %', r->'grupos'; end if;
  if jsonb_array_length(r->'textos'->'texto') <> 7 then raise exception 'textos legado'; end if;
  if (r->'espelho'->>'n')::int <> 1 or (r->'espelho'->'medias'->>'q1')::numeric <> 4 then raise exception 'espelho legado: %', r->'espelho'; end if;
  if (r->>'pode_editar_perguntas')::boolean then raise exception 'legado com respostas não pode editar'; end if;
end $$;
reset role;

-- 2. técnico cria ciclo (antes só coordenação) e edita as próprias perguntas
select pg_temp.como(:'tec1', 'authenticated');
select public.fn_pulso_criar_ciclo('Pulso do time técnico') as c1 \gset
set t.c1 = :'c1';
select public.fn_pulso_salvar_perguntas(:'c1', '[
  {"chave":"clareza","tipo":"escala","tema":"Clareza","texto":"Sei o que se espera de mim nesta semana."},
  {"chave":"carga","tipo":"escala","tema":"Carga","texto":"Sinto-me sobrecarregado.","invertida":true},
  {"chave":"canal","tipo":"escolha","tema":"Canal","texto":"Qual canal funciona melhor para alinhar o trabalho?","opcoes":["Reunião semanal","WhatsApp","E-mail"]},
  {"chave":"rec","tipo":"nps","texto":"Recomendaria esta equipe?","obrigatoria":false},
  {"chave":"ideia","tipo":"texto","texto":"Uma ideia para a próxima semana"}
]'::jsonb);
-- validação das perguntas
select pg_temp.falha($q$select public.fn_pulso_salvar_perguntas(current_setting('t.c1')::uuid, '[]')$q$, 'inclua ao menos uma');
select pg_temp.falha($q$select public.fn_pulso_salvar_perguntas(current_setting('t.c1')::uuid, '[{"chave":"a","tipo":"escala","texto":"abc"},{"chave":"a","tipo":"escala","texto":"abc"}]')$q$, 'repetida');
select pg_temp.falha($q$select public.fn_pulso_salvar_perguntas(current_setting('t.c1')::uuid, '[{"chave":"a","tipo":"escolha","texto":"abc","opcoes":["só uma"]}]')$q$, '2 a 10 opções');
select pg_temp.falha($q$select public.fn_pulso_salvar_perguntas(current_setting('t.c1')::uuid, '[{"chave":"A b","tipo":"escala","texto":"abc"}]')$q$, 'chave');
select pg_temp.falha($q$select public.fn_pulso_salvar_perguntas(current_setting('t.c1')::uuid, '[{"chave":"a","tipo":"matriz","texto":"abc"}]')$q$, 'tipo');
reset role;
select token as tok1 from public.pulso_ciclos where id = :'c1' \gset
set t.tok1 = :'tok1';
do $$ begin
  if (select criado_por from public.pulso_ciclos where id = current_setting('t.c1')::uuid) <> '00000000-0000-0000-0000-000000000010' then raise exception 'criador'; end if;
  if jsonb_array_length((select perguntas from public.pulso_ciclos where id = current_setting('t.c1')::uuid)) <> 5 then raise exception 'perguntas salvas'; end if;
end $$;

-- 3. outro técnico não vê nem edita; coordenação vê mas não edita; super_admin só encerra/reabre
select pg_temp.como(:'tec2', 'authenticated');
select pg_temp.falha($q$select public.fn_pulso_resultado(current_setting('t.c1')::uuid)$q$, 'pulso:sem_permissao');
select pg_temp.falha($q$select public.fn_pulso_salvar_perguntas(current_setting('t.c1')::uuid, '[{"chave":"a","tipo":"escala","texto":"abc"}]')$q$, 'pulso:sem_permissao');
select pg_temp.falha($q$select public.fn_pulso_alterar(current_setting('t.c1')::uuid, '{"status":"encerrado"}')$q$, 'pulso:sem_permissao');
select pg_temp.falha($q$select public.fn_pulso_criar_ciclo('Cópia indevida', true, null, null, current_setting('t.c1')::uuid)$q$, 'pulso:sem_permissao');
do $$ begin
  if exists (select 1 from jsonb_array_elements(public.fn_pulso_ciclos()) e where e->>'id' = current_setting('t.c1')) then raise exception 'tec2 não deveria listar o ciclo do tec1'; end if;
end $$;
reset role;
select pg_temp.como(:'coord', 'authenticated');
do $$ declare r jsonb := public.fn_pulso_resultado(current_setting('t.c1')::uuid); begin
  if (r->>'meu')::boolean or (r->>'pode_editar_perguntas')::boolean then raise exception 'coord não é dona'; end if;
end $$;
select pg_temp.falha($q$select public.fn_pulso_salvar_perguntas(current_setting('t.c1')::uuid, '[{"chave":"a","tipo":"escala","texto":"abc"}]')$q$, 'pulso:sem_permissao');
select pg_temp.falha($q$select public.fn_pulso_alterar(current_setting('t.c1')::uuid, '{"status":"encerrado"}')$q$, 'pulso:sem_permissao');
reset role;
select pg_temp.como(:'admin', 'authenticated');
select public.fn_pulso_alterar(:'c1', '{"status":"encerrado"}');
select pg_temp.falha($q$select public.fn_pulso_alterar(current_setting('t.c1')::uuid, '{"titulo":"Renomeado"}')$q$, 'pulso:sem_permissao');
select public.fn_pulso_alterar(:'c1', '{"status":"aberto"}');
reset role;

-- 4. respostas validadas contra as perguntas do ciclo
select pg_temp.como(null, 'anon');
do $$ declare r jsonb := public.fn_publico_pulso_ciclo(current_setting('t.tok1'), null); begin
  if jsonb_array_length(r->'perguntas') <> 5 then raise exception 'público sem perguntas'; end if;
end $$;
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok1'), '{"clareza":4,"carga":2}', 'aparelho-x1-aaaaaaaaaa')$q$, 'resposta_invalida');            -- falta escolha obrigatória
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok1'), '{"clareza":4,"carga":2,"canal":3}', 'aparelho-x1-aaaaaaaaaa')$q$, 'resposta_invalida');  -- opção inexistente
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok1'), '{"clareza":6,"carga":2,"canal":0}', 'aparelho-x1-aaaaaaaaaa')$q$, 'resposta_invalida');  -- fora da escala
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok1'), '{"clareza":4.5,"carga":2,"canal":0}', 'aparelho-x1-aaaaaaaaaa')$q$, 'resposta_invalida');
reset role;
-- 6 respostas: canal 0,0,1,2,0,1 ; clareza 5,4,4,5,3,4 ; carga (invertida) 1,2,2,1,3,2 ; rec só em 3
do $$ declare d text[] := array['aparelho-r1-aaaaaaaaaa','aparelho-r2-aaaaaaaaaa','aparelho-r3-aaaaaaaaaa','aparelho-r4-aaaaaaaaaa','aparelho-r5-aaaaaaaaaa','aparelho-r6-aaaaaaaaaa'];
  cl int[] := array[5,4,4,5,3,4]; ca int[] := array[1,2,2,1,3,2]; ch int[] := array[0,0,1,2,0,1]; i int; r jsonb;
begin
  set local role anon;
  for i in 1..6 loop
    r := jsonb_build_object('clareza', cl[i], 'carga', ca[i], 'canal', ch[i], 'extra_desconhecida', 99);
    if i <= 3 then r := r || jsonb_build_object('rec', 10, 'ideia', 'ideia ' || i); end if;
    perform public.fn_publico_pulso_responder(current_setting('t.tok1'), r, d[i]);
  end loop;
end $$;
do $$ begin
  if exists (select 1 from public.pulso_respostas_v2 where respostas ? 'extra_desconhecida') then raise exception 'chave desconhecida gravada'; end if;
  if (select count(*) from public.pulso_respostas_v2 where ciclo_id = current_setting('t.c1')::uuid) <> 6 then raise exception 'n respostas c1'; end if;
end $$;

-- 5. perguntas travam após a 1ª resposta; resultado genérico
select pg_temp.como(:'tec1', 'authenticated');
select pg_temp.falha($q$select public.fn_pulso_salvar_perguntas(current_setting('t.c1')::uuid, '[{"chave":"a","tipo":"escala","texto":"abc"}]')$q$, 'pulso:perguntas_travadas');
select public.fn_pulso_salvar_espelho(:'c1', '{"clareza":4.5,"carga":2,"canal":1}');   -- 'canal' não é escala: ignorado
do $$ declare r jsonb := public.fn_pulso_resultado(current_setting('t.c1')::uuid); p jsonb; begin
  if (r->>'suprimido')::boolean or not (r->>'meu')::boolean then raise exception 'resultado c1'; end if;
  p := r->'geral'->'por_pergunta';
  if p->'canal'->'contagem' <> '[3,2,1]'::jsonb then raise exception 'contagem escolha: %', p->'canal'; end if;
  if (p->'carga'->>'media')::numeric <> 1.83 or (p->'carga'->>'media_ajustada')::numeric <> 4.17 then raise exception 'invertida: %', p->'carga'; end if;
  if (p->'rec'->>'n')::int <> 3 or (r->'geral'->>'enps')::int <> 100 then raise exception 'nps opcional: %', p->'rec'; end if;
  -- comprometimento = ((4,17 + 4,17)/2 − 1)/4 × 100 = 79
  if (r->'geral'->>'comprometimento')::int <> 79 then raise exception 'comprometimento: %', r->'geral'->>'comprometimento'; end if;
  if jsonb_array_length(r->'textos'->'ideia') <> 3 then raise exception 'textos por chave: %', r->'textos'; end if;
  if r->'espelho'->'meu' <> '{"clareza":4.5,"carga":2}'::jsonb then raise exception 'espelho: %', r->'espelho'->'meu'; end if;
  if jsonb_array_length(public.fn_pulso_ciclos()) <> 1 then raise exception 'tec1 lista só o próprio'; end if;
end $$;
-- novo ciclo copiando as perguntas do anterior (série por chave)
select public.fn_pulso_criar_ciclo('Pulso do time técnico 2', true, null, null, :'c1') as c2 \gset
reset role;
do $$ begin
  if (select perguntas from public.pulso_ciclos where titulo = 'Pulso do time técnico 2')
     <> (select perguntas from public.pulso_ciclos where titulo = 'Pulso do time técnico') then raise exception 'cópia de perguntas'; end if;
end $$;

-- 6. anon e funções internas fechados; tabelas novas sem acesso direto
select pg_temp.como(null, 'anon');
select pg_temp.falha('select * from public.pulso_respostas_v2', 'permission denied');
select pg_temp.falha('select public.fn_pulso_criar_ciclo(''x'')', 'permission denied');
select pg_temp.falha('select public.fn_pulso_validar_perguntas(''[]'')', 'permission denied');
reset role;
select pg_temp.como(:'tec1', 'authenticated');
select pg_temp.falha('select * from public.pulso_espelho_v2', 'permission denied');
select pg_temp.falha('select public.fn_pulso_criar(''x'')', 'permission denied');
reset role;
-- inativo não cria
select pg_temp.como('00000000-0000-0000-0000-000000000009', 'authenticated');
select pg_temp.falha('select public.fn_pulso_criar_ciclo(''x y z'')', 'pulso:sem_permissao');
reset role;

\echo 'pulso (perguntas personalizáveis): todos os testes passaram'
