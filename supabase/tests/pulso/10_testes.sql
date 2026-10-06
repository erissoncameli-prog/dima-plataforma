-- Testes do Pulso da Equipe. Cada bloco falha com exception se a regra quebrar.
insert into public.usuarios values
  ('00000000-0000-0000-0000-000000000001','Admin','a@x','super_admin',true),
  ('00000000-0000-0000-0000-000000000002','Coord','c@x','coordenacao',true),
  ('00000000-0000-0000-0000-000000000003','Fin','f@x','financeiro',true),
  ('00000000-0000-0000-0000-000000000009','Inativo','i@x','tecnico',false);
insert into public.usuarios
  select ('00000000-0000-0000-0000-00000000001' || g)::uuid, 'Tec' || g, 't' || g || '@x', 'tecnico', true
  from generate_series(0, 5) g;

create function pg_temp.como(p_uid text, p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), false);
  execute 'set role ' || p_role;
end $$;
create function pg_temp.resp(a int, b int, c int, d int, e int, f int, t text default null) returns jsonb
language sql as $$ select jsonb_build_object('q1',a,'q2',b,'q3',c,'q4',d,'q5',e,'q6',f,'texto',t) $$;
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

-- 1. anon não lê nem escreve tabela alguma; só as RPCs públicas
select pg_temp.como(null, 'anon');
select pg_temp.falha('select * from public.pulso_respostas', 'permission denied');
select pg_temp.falha('insert into public.pulso_ciclos (titulo) values (''xxx'')', 'permission denied');
select pg_temp.falha('select public.fn_pulso_ciclos()', 'permission denied');
select pg_temp.falha('select public.fn_pulso_resultado(gen_random_uuid())', 'permission denied');
select pg_temp.falha('select public.fn_pulso_metricas(gen_random_uuid(), null)', 'permission denied');
select pg_temp.falha('select public.fn_pulso_criar(''x'')', 'permission denied');
select pg_temp.falha('select public.fn_pulso_contagem(gen_random_uuid())', 'permission denied');
reset role;

-- 2. técnico não cria ciclo nem lê tabelas
select pg_temp.como('00000000-0000-0000-0000-000000000010', 'authenticated');
select pg_temp.falha('select public.fn_pulso_criar(''Ciclo'')', 'pulso:sem_permissao');
select pg_temp.falha('select * from public.pulso_participacoes', 'permission denied');
select pg_temp.falha('select public.fn_pulso_resultado(gen_random_uuid())', 'pulso:sem_permissao');
reset role;

-- 3. coordenação cria ciclo
select pg_temp.como('00000000-0000-0000-0000-000000000002', 'authenticated');
select public.fn_pulso_criar('Pulso outubro', true, 3, null) as ciclo \gset
reset role;
select token from public.pulso_ciclos where id = :'ciclo' \gset

-- 4. convidado (anon) responde; repetir no mesmo aparelho é recusado
set t.tok = :'token';
set t.ciclo = :'ciclo';
select pg_temp.como(null, 'anon');
do $$ declare r jsonb; begin
  r := public.fn_publico_pulso_ciclo(current_setting('t.tok'), 'aparelho-aaaaaaaaaaaa');
  if (r->>'cadastrado')::boolean or r->>'perfil_grupo' <> 'convidado' or not (r->>'aberto')::boolean
    then raise exception 'ciclo público errado: %', r; end if;
  r := public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(4,4,3,5,2,9,'Mais reuniões curtas'), 'aparelho-aaaaaaaaaaaa');
  if r->>'perfil_grupo' <> 'convidado' then raise exception 'grupo errado'; end if;
  if not (public.fn_publico_pulso_ciclo(current_setting('t.tok'), 'aparelho-aaaaaaaaaaaa')->>'ja_respondeu')::boolean
    then raise exception 'deveria constar como respondido'; end if;
end $$;
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(1,1,1,1,1,1), 'aparelho-aaaaaaaaaaaa')$q$, 'pulso:ja_respondeu');
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(1,1,1,1,1,1), null)$q$, 'pulso:dispositivo_invalido');
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(6,1,1,1,1,1), 'aparelho-bbbbbbbbbbbb')$q$, 'pulso:resposta_invalida');
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(1,1,1,1,1,11), 'aparelho-bbbbbbbbbbbb')$q$, 'pulso:resposta_invalida');
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok'), '{"q1":"x"}', 'aparelho-bbbbbbbbbbbb')$q$, 'pulso:resposta_invalida');
select pg_temp.falha($q$select public.fn_publico_pulso_responder('nao-existe', pg_temp.resp(1,1,1,1,1,1), 'aparelho-bbbbbbbbbbbb')$q$, 'pulso:ciclo_inexistente');
select public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(3,3,3,3,3,7), 'aparelho-bbbbbbbbbbbb');
select public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(2,2,2,2,2,5), 'aparelho-cccccccccccc');
-- limite de 3 convidados atingido
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(1,1,1,1,1,1), 'aparelho-dddddddddddd')$q$, 'pulso:limite_convidados');
do $$ begin
  if (public.fn_publico_pulso_ciclo(current_setting('t.tok'), 'aparelho-dddddddddddd')->>'aceita_convidados')::boolean
    then raise exception 'lotado deveria recusar convidado'; end if;
end $$;
reset role;

-- 5. cadastrados respondem com o perfil do BANCO; super_admin conta como coordenação
do $$ declare u uuid; r jsonb; begin
  for u in select id from public.usuarios where perfil = 'tecnico' and ativo loop
    perform set_config('request.jwt.claim.sub', u::text, false);
    set local role authenticated;
    r := public.fn_publico_pulso_ciclo(current_setting('t.tok'), null);
    if not (r->>'cadastrado')::boolean or r->>'perfil_grupo' <> 'tecnico' then raise exception 'perfil errado: %', r; end if;
    perform public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(5,4,4,4,5,10,'ok ' || u), null);
    reset role;
  end loop;
end $$;
select pg_temp.como('00000000-0000-0000-0000-000000000001', 'authenticated');
select public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(5,5,5,5,5,10), null);
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(5,5,5,5,5,10), 'outro-aparelho-xxxxxxx')$q$, 'pulso:ja_respondeu');
reset role;
-- inativo responde como convidado (ciclo lotado de convidados ⇒ recusa)
select pg_temp.como('00000000-0000-0000-0000-000000000009', 'authenticated');
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(5,5,5,5,5,10), 'aparelho-inativo-xxxx')$q$, 'pulso:limite_convidados');
reset role;

do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'pulso_respostas'
             and column_name in ('usuario_id','criado_em','dispositivo_hash'))
    then raise exception 'pulso_respostas não pode ter coluna identificadora'; end if;
  if (select count(*) from public.pulso_respostas where perfil_grupo = 'coordenacao') <> 1 then raise exception 'super_admin deveria contar como coordenacao'; end if;
  if (select count(*) from public.pulso_respostas where perfil_grupo = 'tecnico') <> 6 then raise exception 'esperava 6 técnicos'; end if;
end $$;

-- 6. resultado: supressão por grupo e geral
select pg_temp.como('00000000-0000-0000-0000-000000000002', 'authenticated');
select public.fn_pulso_salvar_espelho(:'ciclo', '{"q1":4,"q2":4,"q3":4,"q4":4,"q5":4}');
do $$ declare r jsonb; g jsonb; begin
  r := public.fn_pulso_resultado(current_setting('t.ciclo')::uuid);
  if (r->>'suprimido')::boolean or (r->>'n')::int <> 10 then raise exception 'geral errado: %', r->>'n'; end if;
  -- técnico (6) sai próprio; convidado (3) + coordenação (1) = 4 < 5 ⇒ sem "demais"
  if jsonb_array_length(r->'grupos') <> 1 or r->'grupos'->0->>'grupo' <> 'tecnico'
    then raise exception 'grupos errados: %', r->'grupos'; end if;
  if jsonb_array_length(r->'textos') <> 7 then raise exception 'textos: %', r->'textos'; end if;
  if r->'espelho'->>'n_gestores' <> '1' then raise exception 'espelho: %', r->'espelho'; end if;
  if (r->'participacao'->>'cadastrados')::int <> 7 or (r->'participacao'->>'convidados')::int <> 3
    then raise exception 'participação: %', r->'participacao'; end if;
  g := r->'geral';
  if (g->>'comprometimento')::int not between 0 and 100 or (g->>'sintonia')::int not between 0 and 100
    then raise exception 'índices fora da faixa: %', g; end if;
  -- eNPS: promotores (9,10×6,10) = 8, detratores (5) = 1, n = 10 ⇒ 70
  if (g->>'enps')::int <> 70 then raise exception 'eNPS esperado 70, veio %', g->>'enps'; end if;
  if jsonb_array_length(g->'distribuicao'->5) <> 11 then raise exception 'distribuição de Q6 deve ter 11 posições'; end if;
  if jsonb_array_length(public.fn_pulso_ciclos()) <> 1 then raise exception 'lista de ciclos'; end if;
  if public.fn_pulso_contagem(current_setting('t.ciclo')::uuid) <> 10 then raise exception 'contagem'; end if;
end $$;

-- 7. encerrar ⇒ ninguém mais responde
select public.fn_pulso_alterar(:'ciclo', '{"status":"encerrado","limite_convidados":null}');
reset role;
select pg_temp.como(null, 'anon');
select pg_temp.falha($q$select public.fn_publico_pulso_responder(current_setting('t.tok'), pg_temp.resp(1,1,1,1,1,1), 'aparelho-eeeeeeeeeeee')$q$, 'pulso:ciclo_encerrado');
reset role;

-- 8. ciclo novo com < 5 respostas fica suprimido
select pg_temp.como('00000000-0000-0000-0000-000000000002', 'authenticated');
select public.fn_pulso_criar('Pequeno') as c2 \gset
set t.c2 = :'c2';
do $$ declare r jsonb; begin
  r := public.fn_pulso_resultado(current_setting('t.c2')::uuid);
  if not (r->>'suprimido')::boolean or r ? 'geral' or r ? 'textos' then raise exception 'deveria suprimir: %', r; end if;
end $$;
reset role;

-- 9. ROPA
do $$ begin
  if not exists (select 1 from public.lgpd_tratamentos where codigo = 'TRAT-002') then raise exception 'ROPA sem TRAT-002'; end if;
end $$;

\echo 'pulso: todos os testes passaram'
