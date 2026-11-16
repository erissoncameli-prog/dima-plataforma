-- ════════════════════════════════════════════════════════════════════════
-- Testes dos setores de campo (diag_21): designação, número, GPS, dispersão,
-- pedido de autorização e quem lê o quê. Roda DEPOIS de 10_testes.sql, no
-- mesmo banco local (reaproveita usuários, questionário v1 e helpers t_*).
-- Setor de teste: quadrado de ~2,2 km em volta do ponto padrão de t_ficha
-- (-10.65, -68.5), na "Comunidade Teste"; quadrícula de 500 m, limite 2.
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
\o /dev/null

reset role;
select public.fn_diag_setor_carregar('11111111-1111-1111-1111-111111111111', 'TS1', 1, 'Teste', 'rural', 3, 484.0, 500,
  '{"type":"Polygon","coordinates":[[[-68.51,-10.66],[-68.49,-10.66],[-68.49,-10.64],[-68.51,-10.64],[-68.51,-10.66]]]}',
  '{}', array[-68.51,-10.66,-68.49,-10.64]);
update public.diag_setores set limite_celula = 2, tolerancia_m = 50 where codigo = 'TS1';
insert into public.t_ctx select 's1', id::text from public.diag_setores where codigo = 'TS1';

-- monta a parte de campo do payload
create function public.t_campo(p_desig text, p_lat float8, p_lon float8, p_prec float8 default 8, p_num int default null)
returns jsonb language sql stable as $$
  select jsonb_build_object('designacao_id', p_desig, 'numero_designado', p_num,
    'gps_ini_lat', p_lat, 'gps_ini_lon', p_lon, 'gps_ini_precisao_m', p_prec, 'gps_ini_em', now(),
    'gps_fim_lat', p_lat, 'gps_fim_lon', p_lon, 'gps_fim_precisao_m', p_prec, 'gps_fim_em', now())
$$;
grant execute on function public.t_campo(text, float8, float8, float8, int) to authenticated;

-- ── C01 anon não executa nada novo ──────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array['diag_designar(uuid,uuid,integer,date,date,text,text)', 'diag_campo_pacote()',
    'diag_campo_painel(uuid)', 'diag_area_pedir(jsonb)', 'diag_area_decidir(uuid,boolean,integer,date,text)',
    'diag_campo_entrevistadores()', 'diag_designacao_alterar(uuid,integer,date,text)', 'diag_designacao_encerrar(uuid,text)',
    'diag_setor_ajustar(uuid,integer,integer,integer,boolean)', 'diag_ficha_campo(uuid)',
    'fn_diag_campo_registrar(uuid,jsonb,boolean)', 'fn_diag_setor_carregar(uuid,text,integer,text,text,integer,numeric,integer,jsonb,jsonb,numeric[])',
    'fn_diag_pode_aplicar_uid(uuid)', 'fn_diag_desig_ocupados(uuid)', 'fn_diag_area_classificar(jsonb,double precision,double precision,double precision,double precision)'] loop
    if has_function_privilege('anon', 'public.' || f, 'execute') then raise exception 'FALHOU C01 anon executa %', f; end if;
  end loop;
  foreach f in array array['fn_diag_campo_registrar(uuid,jsonb,boolean)', 'fn_diag_setor_carregar(uuid,text,integer,text,text,integer,numeric,integer,jsonb,jsonb,numeric[])',
    'fn_diag_pode_aplicar_uid(uuid)', 'fn_diag_desig_ocupados(uuid)'] loop
    if has_function_privilege('authenticated', 'public.' || f, 'execute') then raise exception 'FALHOU C01 cliente executa interna %', f; end if;
  end loop;
end $$;

-- ── C02 só a coordenação designa; só técnico com acesso vira entrevistador ──
set role authenticated;
select public.t_como('00000000-0000-0000-0000-0000000000e1');
select public.t_erro($q$select public.diag_designar((select v::uuid from public.t_ctx where k='s1'), '00000000-0000-0000-0000-0000000000e1', 3)$q$, 'diag:nao_autorizado');
select public.t_erro('select public.diag_campo_painel()', 'diag:nao_autorizado');
select public.t_como('00000000-0000-0000-0000-0000000000c0');
select public.t_erro($q$select public.diag_designar((select v::uuid from public.t_ctx where k='s1'), '00000000-0000-0000-0000-0000000000e3', 3)$q$, 'diag:entrevistador_invalido');
select public.t_erro($q$select public.diag_designar((select v::uuid from public.t_ctx where k='s1'), '00000000-0000-0000-0000-0000000000ce', 3)$q$, 'diag:entrevistador_invalido');
do $$
begin
  insert into public.t_ctx values ('d1', public.diag_designar((select v::uuid from public.t_ctx where k='s1'), '00000000-0000-0000-0000-0000000000e1', 3)::text);
  if not exists (select 1 from public.diag_campo_entrevistadores() where id = '00000000-0000-0000-0000-0000000000e1')
     or exists (select 1 from public.diag_campo_entrevistadores() where id = '00000000-0000-0000-0000-0000000000e3')
    then raise exception 'FALHOU C02 lista de entrevistadores'; end if;
end $$;
select public.t_erro($q$select public.diag_designar((select v::uuid from public.t_ctx where k='s1'), '00000000-0000-0000-0000-0000000000e1', 5)$q$, 'diag:ja_designado');

-- ── C03 ficha dentro da área ganha o número; reenvio mantém ─────────────
select public.t_como('00000000-0000-0000-0000-0000000000e1');
do $$
declare r jsonb; d text := (select v from public.t_ctx where k='d1');
begin
  r := public.diag_enviar_ficha(public.t_ficha('cafe0021-0000-0000-0000-000000000001','DSA-XAP-C01', null, now(),
         public.t_campo(d, -10.65, -68.5)), public.t_mor(), '[]');
  if r->'campo'->>'situacao' <> 'dentro' or (r->'campo'->>'numero')::int <> 1 then raise exception 'FALHOU C03 %', r->'campo'; end if;
  r := public.diag_enviar_ficha(public.t_ficha('cafe0021-0000-0000-0000-000000000001','DSA-XAP-C01', null, now(),
         jsonb_build_object('designacao_id', d)), public.t_mor(), '[]');      -- reenvio sem GPS: mantém o gravado
  if r->'campo'->>'situacao' <> 'dentro' or (r->'campo'->>'numero')::int <> 1 then raise exception 'FALHOU C03 reenvio %', r->'campo'; end if;
  -- outra ficha pedindo o número 1 (outro aparelho) recebe o 2
  r := public.diag_enviar_ficha(public.t_ficha('cafe0021-0000-0000-0000-000000000002','DSA-XAP-C02', null, now(),
         public.t_campo(d, -10.6455, -68.495, 8, 1)), public.t_mor(), '[]');
  if (r->'campo'->>'numero')::int <> 2 then raise exception 'FALHOU C03 número repetido %', r->'campo'; end if;
end $$;

-- ── C04 fora da área, divisa, sem GPS, GPS de rede ──────────────────────
do $$
declare r jsonb; d text := (select v from public.t_ctx where k='d1');
begin
  r := public.diag_enviar_ficha(public.t_ficha('cafe0021-0000-0000-0000-000000000003','DSA-XAP-C03', null, now(),
         public.t_campo(d, -10.70, -68.5) || '{"justificativa_campo":"ramal fechado"}'), public.t_mor(), '[]');
  if r->'campo'->>'situacao' <> 'fora' then raise exception 'FALHOU C04 fora %', r->'campo'; end if;
  insert into public.t_ctx values ('f_fora', r->>'id');
  -- 30 m para fora da divisa leste, GPS bom: tolerância de 50 m ⇒ borda
  if public.fn_diag_area_classificar((select geojson from public.diag_setores where codigo='TS1'), -10.65, -68.48973, 8, 50) <> 'borda'
    then raise exception 'FALHOU C04 borda'; end if;
  if public.fn_diag_area_classificar((select geojson from public.diag_setores where codigo='TS1'), -10.65, -68.5, 400, 50) <> 'impreciso'
    then raise exception 'FALHOU C04 impreciso'; end if;
  if public.fn_diag_area_pior('dentro', 'sem_gps') <> 'dentro' or public.fn_diag_area_pior('borda', 'fora') <> 'fora'
     or public.fn_diag_area_pior('sem_gps', null) <> 'sem_gps' then raise exception 'FALHOU C04 pior'; end if;
end $$;
-- meta 3 cheia: a 4ª ficha fica sem número; a meta não desce abaixo do maior usado
do $$
declare r jsonb; d text := (select v from public.t_ctx where k='d1');
begin
  r := public.diag_enviar_ficha(public.t_ficha('cafe0021-0000-0000-0000-000000000004','DSA-XAP-C04', null, now(),
         jsonb_build_object('designacao_id', d)), public.t_mor(), '[]');
  if r->'campo'->>'numero' is not null or r->'campo'->>'situacao' <> 'sem_gps' then raise exception 'FALHOU C04 acima da meta %', r->'campo'; end if;
end $$;
select public.t_como('00000000-0000-0000-0000-0000000000c0');
select public.t_erro($q$select public.diag_designacao_alterar((select v::uuid from public.t_ctx where k='d1'), 2, null, 'reduzir meta')$q$, 'diag:meta_abaixo');
select public.diag_designacao_alterar((select v::uuid from public.t_ctx where k='d1'), 6, null, 'meta ampliada');

-- ── C05 validação: problema de campo exige justificativa ────────────────
select public.t_erro($q$select public.diag_mudar_status((select v::uuid from public.t_ctx where k='f_fora'), 'validada', null)$q$, 'diag:justificar_campo');
do $$
begin
  perform public.diag_mudar_status((select v::uuid from public.t_ctx where k='f_fora'), 'validada', 'Família mudou-se para a borda; conferido por telefone');
  if (select validacao_obs from public.diag_fichas_campo where ficha_id = (select v::uuid from public.t_ctx where k='f_fora')) is null
    then raise exception 'FALHOU C05 obs não gravada'; end if;
  -- ficha dentro valida sem justificativa
  perform public.diag_mudar_status((select id from public.diag_fichas where codigo = 'DSA-XAP-C01'), 'validada', null);
end $$;

-- ── C06 concentração: 3ª ficha na mesma quadrícula (limite 2) ───────────
select public.t_como('00000000-0000-0000-0000-0000000000e1');
do $$
declare r jsonb; d text := (select v from public.t_ctx where k='d1');
begin
  -- C01 já está na quadrícula do ponto (-10.65, -68.5); +2 fichas a 30 m
  r := public.diag_enviar_ficha(public.t_ficha('cafe0021-0000-0000-0000-000000000005','DSA-XAP-C05', null, now(),
         public.t_campo(d, -10.6502, -68.5002)), public.t_mor(), '[]');
  if (r->'campo'->>'concentracao')::boolean then raise exception 'FALHOU C06 2ª ficha marcada'; end if;
  r := public.diag_enviar_ficha(public.t_ficha('cafe0021-0000-0000-0000-000000000006','DSA-XAP-C06', null, now(),
         public.t_campo(d, -10.6503, -68.5003) || '{"justificativa_concentracao":"só há casas na beira do ramal"}'), public.t_mor(), '[]');
  if not (r->'campo'->>'concentracao')::boolean then raise exception 'FALHOU C06 3ª ficha não marcada %', r->'campo'; end if;
  if (select justificativa_concentracao from public.diag_fichas_campo where ficha_id = (r->>'id')::uuid) is null
    then raise exception 'FALHOU C06 justificativa'; end if;
end $$;

-- ── C07 designação de outra pessoa é ignorada; comunidade sem setor ────
select public.t_como('00000000-0000-0000-0000-0000000000e2');
do $$
declare r jsonb;
begin
  r := public.diag_enviar_ficha(public.t_ficha('cafe0021-0000-0000-0000-000000000007','DSA-XAP-C07', null, now(),
         public.t_campo((select v from public.t_ctx where k='d1'), -10.65, -68.5)), public.t_mor(), '[]');
  if r->'campo'->>'situacao' <> 'sem_designacao' or r->'campo'->>'numero' is not null then raise exception 'FALHOU C07 %', r->'campo'; end if;
  if (select designacao_id from public.diag_fichas_campo where ficha_id = (r->>'id')::uuid) is not null then raise exception 'FALHOU C07 usou designação alheia'; end if;
  -- treino não gera apuração
  if exists (select 1 from public.diag_fichas_campo c join public.diag_fichas f on f.id = c.ficha_id where f.treino)
    then raise exception 'FALHOU C07 treino apurado'; end if;
end $$;

-- ── C08 pedido de autorização: setor pelo ponto, idempotente, decisão na mesa ──
do $$
declare p jsonb; u uuid := 'cafe0022-0000-0000-0000-000000000001';
begin
  p := public.diag_area_pedir(jsonb_build_object('uuid_cliente', u, 'lat', -10.6512345, 'lon', -68.5012345, 'precisao_m', 9,
         'motivo', 'Colega doente, cobrir o setor', 'quantidade', 2, 'comunidade_id', '11111111-1111-1111-1111-111111111111'));
  if p->>'setor_id' <> (select v from public.t_ctx where k='s1') or (p->>'lat')::numeric <> -10.6512 then raise exception 'FALHOU C08 setor/arredondamento %', p; end if;
  if (public.diag_area_pedir(jsonb_build_object('uuid_cliente', u, 'motivo', 'outra coisa qualquer')))->>'id' <> p->>'id'
    then raise exception 'FALHOU C08 duplicou'; end if;
  insert into public.t_ctx values ('p1', p->>'id');
end $$;
select public.t_erro($q$select public.diag_area_decidir((select v::uuid from public.t_ctx where k='p1'), true, 2, current_date + 10)$q$, 'diag:nao_autorizado');
select public.t_como('00000000-0000-0000-0000-0000000000c0');
select public.t_erro($q$select public.diag_area_decidir((select v::uuid from public.t_ctx where k='p1'), true, 2, null)$q$, 'diag:prazo_obrigatorio');
do $$
declare p jsonb;
begin
  p := public.diag_area_decidir((select v::uuid from public.t_ctx where k='p1'), true, 2, current_date + 10, 'ok, por 10 dias');
  if p->>'status' <> 'aprovado' or p->>'designacao_id' is null then raise exception 'FALHOU C08 decisão %', p; end if;
  insert into public.t_ctx values ('d2', p->>'designacao_id');
  if (select tipo from public.diag_designacoes where id = (p->>'designacao_id')::uuid) <> 'autorizacao' then raise exception 'FALHOU C08 tipo'; end if;
end $$;
select public.t_erro($q$select public.diag_area_decidir((select v::uuid from public.t_ctx where k='p1'), false, null, null, 'tarde')$q$, 'diag:ja_decidido');
select public.t_como('00000000-0000-0000-0000-0000000000e2');
do $$
declare r jsonb; pk jsonb;
begin
  r := public.diag_enviar_ficha(public.t_ficha('cafe0021-0000-0000-0000-000000000008','DSA-XAP-C08', null, now(),
         public.t_campo((select v from public.t_ctx where k='d2'), -10.645, -68.505)), public.t_mor(), '[]');
  if r->'campo'->>'situacao' <> 'dentro' or (r->'campo'->>'numero')::int <> 1 then raise exception 'FALHOU C08 ficha autorizada %', r->'campo'; end if;
  pk := public.diag_campo_pacote();
  if jsonb_array_length(pk->'designacoes') <> 1 or pk->'designacoes'->0->>'tipo' <> 'autorizacao'
     or pk->'designacoes'->0->'ocupados' <> '[1]'::jsonb then raise exception 'FALHOU C08 pacote designações %', pk->'designacoes'; end if;
  if not exists (select 1 from jsonb_array_elements(pk->'ocupacao') o where (o->>'n')::int >= 3) then raise exception 'FALHOU C08 ocupação'; end if;
  if pk::text ~ 'ini_lat|fim_lat|-10\.650' then raise exception 'FALHOU C08 pacote vaza posição'; end if;
end $$;

-- ── C09 quem lê o quê ───────────────────────────────────────────────────
do $$
begin
  -- tec2 não vê a posição nem a apuração das fichas do tec1
  if exists (select 1 from public.diag_fichas_campo_gps g join public.diag_fichas f on f.id = g.ficha_id
             where f.entrevistador_id = '00000000-0000-0000-0000-0000000000e1') then raise exception 'FALHOU C09 tec2 vê GPS do tec1'; end if;
  if exists (select 1 from public.diag_fichas_campo c join public.diag_fichas f on f.id = c.ficha_id
             where f.entrevistador_id = '00000000-0000-0000-0000-0000000000e1') then raise exception 'FALHOU C09 tec2 vê apuração do tec1'; end if;
  if exists (select 1 from public.diag_designacoes where entrevistador_id = '00000000-0000-0000-0000-0000000000e1') then raise exception 'FALHOU C09 tec2 vê designação alheia'; end if;
end $$;
select public.t_como('00000000-0000-0000-0000-0000000000ce');
do $$
begin
  if exists (select 1 from public.diag_fichas_campo) or exists (select 1 from public.diag_fichas_campo_gps)
     or exists (select 1 from public.diag_area_pedidos) then raise exception 'FALHOU C09 consultor vê campo'; end if;
end $$;
select public.t_erro('select public.diag_campo_pacote()', 'diag:nao_autorizado');
select public.t_erro($q$select public.diag_area_pedir('{"uuid_cliente":"cafe0022-0000-0000-0000-000000000009","motivo":"qualquer coisa"}')$q$, 'diag:nao_autorizado');
select public.t_como('00000000-0000-0000-0000-0000000000c0');
do $$
declare pn jsonb;
begin
  pn := public.diag_campo_painel('11111111-1111-1111-1111-111111111111');
  if jsonb_array_length(pn->'designacoes') <> 2 then raise exception 'FALHOU C09 painel designações %', pn->'designacoes'; end if;
  if (select (x->>'feitas')::int from jsonb_array_elements(pn->'designacoes') x where x->>'tipo' = 'designacao') <> 6
    then raise exception 'FALHOU C09 painel feitas %', pn->'designacoes'; end if;
  if not exists (select 1 from jsonb_array_elements(pn->'atencao') a where a->>'situacao' = 'sem_designacao')
     or not exists (select 1 from jsonb_array_elements(pn->'atencao') a where (a->>'concentracao')::boolean)
    then raise exception 'FALHOU C09 painel atenção %', pn->'atencao'; end if;
  if pn::text ~ 'ini_lat|fim_lat' then raise exception 'FALHOU C09 painel vaza posição'; end if;
  if (public.diag_ficha_campo((select id from public.diag_fichas where codigo = 'DSA-XAP-C06')))->>'justificativa_concentracao' is null
    then raise exception 'FALHOU C09 ficha campo'; end if;
end $$;

-- ── C11 recusa (diag_23): sem número, fora da quadrícula, não trava validação ──
select public.t_como('00000000-0000-0000-0000-0000000000e1');
do $$
declare r jsonb; d text := (select v from public.t_ctx where k='d1');
begin
  r := public.diag_enviar_ficha(public.t_ficha('cafe0021-0000-0000-0000-000000000011','DSA-XAP-C11', '{}', now(),
         public.t_campo(d, -10.6501, -68.5001) || '{"aceitou_participar":false}'), '[]', '[]');
  if r->'campo'->>'numero' is not null then raise exception 'FALHOU C11 recusa ganhou número %', r->'campo'; end if;
  if (select celula from public.diag_fichas_campo where ficha_id = (r->>'id')::uuid) is not null then raise exception 'FALHOU C11 recusa na quadrícula'; end if;
  insert into public.t_ctx values ('f_rec', r->>'id');
end $$;
select public.t_como('00000000-0000-0000-0000-0000000000c0');
do $$
begin
  perform public.diag_mudar_status((select v::uuid from public.t_ctx where k='f_rec'), 'validada', null);
  if exists (select 1 from jsonb_array_elements((public.diag_campo_painel())->'atencao') a where a->>'codigo' = 'DSA-XAP-C11')
    then raise exception 'FALHOU C11 recusa na fila de atenção'; end if;
  if (select (x->>'recusas')::int from jsonb_array_elements((public.diag_campo_painel())->'designacoes') x where x->>'tipo' = 'designacao') <> 1
    then raise exception 'FALHOU C11 contagem de recusas'; end if;
end $$;

-- ── C10 encerrar designação; descartada libera o número; retenção apaga GPS ──
do $$
declare r jsonb;
begin
  perform public.diag_mudar_status((select id from public.diag_fichas where codigo = 'DSA-XAP-C02'), 'descartada', 'duplicada');
  perform public.diag_designacao_encerrar((select v::uuid from public.t_ctx where k='d2'), 'cobertura concluída');
  if (select ativo from public.diag_designacoes where id = (select v::uuid from public.t_ctx where k='d2')) then raise exception 'FALHOU C10 encerrar'; end if;
end $$;
reset role;
do $$
begin
  if 2 = any(public.fn_diag_desig_ocupados((select v::uuid from public.t_ctx where k='d1'))) then raise exception 'FALHOU C10 descartada segura número'; end if;
  update public.diag_fichas set validado_em = now() - interval '3 years' where codigo = 'DSA-XAP-C01';
  perform public.fn_diag_aplicar_retencao();
  if exists (select 1 from public.diag_fichas_campo_gps where ficha_id = (select id from public.diag_fichas where codigo = 'DSA-XAP-C01')
             and (ini_lat is not null or fim_lat is not null or ini_em is not null))
    then raise exception 'FALHOU C10 retenção não apagou o GPS de campo'; end if;
  if not exists (select 1 from public.diag_fichas_campo where ficha_id = (select id from public.diag_fichas where codigo = 'DSA-XAP-C01'))
    then raise exception 'FALHOU C10 retenção apagou a apuração (que não é identificação)'; end if;
  if not exists (select 1 from public.lgpd_tratamentos where codigo = 'TRAT-001' and tabelas @> array['diag_fichas_campo_gps','diag_designacoes'])
    then raise exception 'FALHOU C10 ROPA'; end if;
end $$;
-- ── C12 meta do setor no painel (diag_24); recarga do shape não desfaz ──
reset role;
select public.fn_diag_setor_carregar('11111111-1111-1111-1111-111111111111', 'TS2', 2, 'Vizinho', 'rural', 4, 484.0, 500,
  '{"type":"Polygon","coordinates":[[[-68.49,-10.66],[-68.47,-10.66],[-68.47,-10.64],[-68.49,-10.64],[-68.49,-10.66]]]}',
  '{}', array[-68.49,-10.66,-68.47,-10.64]);
set role authenticated;
select public.t_como('00000000-0000-0000-0000-0000000000e1');
select public.t_erro($q$select public.diag_setor_meta((select id from public.diag_setores where codigo='TS2'), 9, 'mais casas')$q$, 'diag:nao_autorizado');
select public.t_como('00000000-0000-0000-0000-0000000000c0');
select public.t_erro($q$select public.diag_setor_meta((select id from public.diag_setores where codigo='TS2'), 9, '')$q$, 'diag:motivo_obrigatorio');
select public.t_erro($q$select public.diag_setor_meta((select id from public.diag_setores where codigo='TS2'), 0, 'zero')$q$, 'diag:meta_invalida');
select public.diag_setor_meta((select id from public.diag_setores where codigo='TS2'), 9, 'Contagem de casas maior que a estimada');
reset role;
select public.fn_diag_setor_carregar('11111111-1111-1111-1111-111111111111', 'TS2', 2, 'Vizinho', 'rural', 4, 484.0, 500,
  '{"type":"Polygon","coordinates":[[[-68.49,-10.66],[-68.47,-10.66],[-68.47,-10.64],[-68.49,-10.64],[-68.49,-10.66]]]}',
  '{}', array[-68.49,-10.66,-68.47,-10.64]);
do $$
begin
  if (select meta_sugerida from public.diag_setores where codigo = 'TS2') <> 9 then raise exception 'FALHOU C12 recarga desfez a meta ajustada'; end if;
  if (select meta_motivo from public.diag_setores where codigo = 'TS2') is null then raise exception 'FALHOU C12 motivo'; end if;
  if not exists (select 1 from public.audit_log where tabela = 'diag_setores' and campos_alterados ? 'meta_sugerida') then raise exception 'FALHOU C12 auditoria'; end if;
end $$;

-- ── C13 mesma pessoa em dois setores: cada ficha vai para a designação do setor certo ──
set role authenticated;
select public.t_como('00000000-0000-0000-0000-0000000000c0');
do $$
begin
  insert into public.t_ctx values ('d3', public.diag_designar((select id from public.diag_setores where codigo='TS2'), '00000000-0000-0000-0000-0000000000e1', 5)::text);
  if (select count(*) from public.diag_designacoes where entrevistador_id = '00000000-0000-0000-0000-0000000000e1' and ativo and tipo = 'designacao') <> 2
    then raise exception 'FALHOU C13 duas designações ativas'; end if;
end $$;
select public.t_como('00000000-0000-0000-0000-0000000000e1');
do $$
declare r jsonb;
begin
  r := public.diag_enviar_ficha(public.t_ficha('cafe0021-0000-0000-0000-000000000013','DSA-XAP-C13', null, now(),
         public.t_campo((select v from public.t_ctx where k='d3'), -10.65, -68.48)), public.t_mor(), '[]');
  if r->'campo'->>'situacao' <> 'dentro' or (r->'campo'->>'numero')::int <> 1 or r->'campo'->>'setor' <> 'TS2' then raise exception 'FALHOU C13 %', r->'campo'; end if;
  -- a designação do TS1 no ponto do TS2 = fora (a pessoa tem as duas, mas a ficha diz qual usou)
  r := public.diag_enviar_ficha(public.t_ficha('cafe0021-0000-0000-0000-000000000014','DSA-XAP-C14', null, now(),
         public.t_campo((select v from public.t_ctx where k='d1'), -10.65, -68.48)), public.t_mor(), '[]');
  if r->'campo'->>'situacao' <> 'fora' then raise exception 'FALHOU C13 designação errada para o ponto %', r->'campo'; end if;
  if jsonb_array_length((public.diag_campo_pacote())->'designacoes') < 2 then raise exception 'FALHOU C13 pacote sem as duas áreas'; end if;
end $$;
reset role;
\o
select 'campo ok' as resultado;
