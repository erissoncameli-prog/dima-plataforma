-- Testes do pedido de acesso à API por e-mail (20261101_api_pedidos_email) e da chave (20261031_api_dados).
create role authenticator noinherit login;
grant anon, authenticated, service_role to authenticator;

create or replace function pg_temp.espera_erro(sql text, trecho text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ESPERAVA ERRO "%" em: %', trecho, sql;
exception when others then
  if sqlerrm like 'ESPERAVA ERRO%' then raise; end if;
  if position(trecho in sqlerrm) = 0 then raise exception 'erro errado em % → % (esperava %)', sql, sqlerrm, trecho; end if;
end $$;

create or replace function pg_temp.ped(gid text, email text, aut boolean) returns jsonb language sql as $$
  select public.fn_api_pedido_registrar(jsonb_build_object(
    'gmail_message_id', gid, 'email_message_id', '<' || gid || '@mail>', 'remetente_email', email,
    'remetente_nome', 'Fulana', 'assunto', 'Pedido de acesso à API', 'corpo', 'Órgão: SEPLAN',
    'campos', jsonb_build_object('orgao', 'SEPLAN', 'site', 'https://painel.ac.gov.br', 'inventado', 'x'),
    'autenticado', aut, 'autenticacao', 'dmarc=pass'))
$$;

do $t$
declare r jsonb; r2 jsonb; v_id uuid; v_id2 uuid; v_id3 uuid; h text; tok text; ch jsonb; n int; c record;
  adm uuid := '00000000-0000-0000-0000-0000000000a1'; coord uuid := '00000000-0000-0000-0000-0000000000c1';
begin
  -- 1. registro autenticado: número, aviso "recebido", campos filtrados; sino ausente não derruba
  r := pg_temp.ped('g1', 'Fulana@SEPLAN.ac.gov.br', true);
  v_id := (r->>'id')::uuid;
  if r->>'numero' !~ '^API-\d{4}-001$' or not (r->>'responder')::boolean then raise exception '1: %', r; end if;
  if (select remetente_email from api_pedidos where id = v_id) <> 'fulana@seplan.ac.gov.br' then raise exception '1: e-mail não normalizado'; end if;
  if (select campos ? 'inventado' from api_pedidos where id = v_id) then raise exception '1: campo desconhecido gravado'; end if;
  if (select count(*) from api_pedido_notificacoes where pedido_id = v_id and evento = 'recebido') <> 1 then raise exception '1: sem aviso recebido'; end if;

  -- 2. mesmo e-mail do Gmail = mesmo pedido
  r2 := pg_temp.ped('g1', 'fulana@seplan.ac.gov.br', true);
  if (r2->>'novo')::boolean or r2->>'id' <> r->>'id' then raise exception '2: %', r2; end if;

  -- 3. remetente não autenticado: registra, sem resposta automática
  r2 := pg_temp.ped('g2', 'alguem@gmail.com', false);
  v_id2 := (r2->>'id')::uuid;
  if (r2->>'responder')::boolean or exists (select 1 from api_pedido_notificacoes where pedido_id = v_id2) then raise exception '3: %', r2; end if;

  -- 4. limite de 3 por remetente em 24 h
  perform pg_temp.ped('g3', 'alguem@gmail.com', false);
  perform pg_temp.ped('g4', 'alguem@gmail.com', false);
  r2 := pg_temp.ped('g5', 'alguem@gmail.com', false);
  if r2->>'ignorado' <> 'limite_remetente' then raise exception '4: %', r2; end if;

  -- 5. só super_admin decide; hash confere
  h := fn_api_pedido_hash(v_id);
  perform pg_temp.espera_erro(format('select fn_api_pedido_decidir(%L, %L, ''aprovar'', null, null, %L)', coord, v_id, h), 'API_SO_SUPER_ADMIN');
  perform pg_temp.espera_erro(format('select fn_api_pedido_decidir(%L, %L, ''aprovar'', null, null, ''x'')', adm, v_id), 'DOCUMENTO_ALTERADO');

  -- 6. recusar exige parecer
  perform pg_temp.espera_erro(format('select fn_api_pedido_decidir(%L, %L, ''recusar'', ''curto'', null, %L)', adm, v_id2, fn_api_pedido_hash(v_id2)), 'PARECER_OBRIGATORIO');
  r2 := fn_api_pedido_decidir(adm, v_id2, 'recusar', 'Sem vínculo com o projeto.', null, fn_api_pedido_hash(v_id2));
  if r2->>'status' <> 'recusado' or not exists (select 1 from api_pedido_notificacoes where pedido_id = v_id2 and evento = 'recusado') then raise exception '6: %', r2; end if;

  -- 7. aprovar: valida origem e validade; padrão = 3 rotas, 1 ano; cliente sem chave
  perform pg_temp.espera_erro(format('select fn_api_pedido_decidir(%L, %L, ''aprovar'', null, %L, %L)', adm, v_id,
          '{"origens":["javascript:alert(1)"]}', h), 'API_ORIGEM_INVALIDA');
  perform pg_temp.espera_erro(format('select fn_api_pedido_decidir(%L, %L, ''aprovar'', null, %L, %L)', adm, v_id,
          jsonb_build_object('expira_em', now() + interval '3 years'), h), 'API_VALIDADE_INVALIDA');
  perform pg_temp.espera_erro(format('select fn_api_pedido_decidir(%L, %L, ''aprovar'', null, %L, %L)', adm, v_id,
          '{"escopos":["financeiro"]}', h), 'API_ESCOPO_INVALIDO');
  r2 := fn_api_pedido_decidir(adm, v_id, 'aprovar', null, '{"origens":["https://Painel.ac.gov.br/"]}', h);
  select * into c from api_clientes where id = (r2->>'cliente_id')::uuid;
  if c.chave_hash is not null or c.nome <> 'SEPLAN' or c.escopos <> array['resumo','atividades','matriz']
     or c.origens <> array['https://painel.ac.gov.br'] or c.expira_em not between now() + interval '364 days' and now() + interval '366 days'
     or c.contato_email <> 'fulana@seplan.ac.gov.br' then raise exception '7: %', row_to_json(c); end if;
  perform pg_temp.espera_erro(format('select fn_api_pedido_decidir(%L, %L, ''aprovar'', null, null, %L)', adm, v_id, fn_api_pedido_hash(v_id)), 'PEDIDO_JA_DECIDIDO');

  -- 8. retirada: token de uso único; chave só nasce aqui e passa a autenticar
  tok := fn_api_emitir_retirada(v_id);
  if length(tok) <> 64 then raise exception '8: token %', tok; end if;
  if (select retirada_hash from api_pedidos where id = v_id) = tok then raise exception '8: token em texto no banco'; end if;
  perform pg_temp.espera_erro('select fn_publico_api_retirar(''' || repeat('0', 64) || ''')', 'LINK_INVALIDO');
  ch := fn_publico_api_retirar(tok);
  if ch->>'chave' !~ '^dima_[0-9a-f]{64}$' or (select status from api_pedidos where id = v_id) <> 'retirado' then raise exception '8: %', ch; end if;
  if not exists (select 1 from fn_api_cliente(ch->>'chave')) then raise exception '8: chave retirada não autentica'; end if;
  perform pg_temp.espera_erro(format('select fn_publico_api_retirar(%L)', tok), 'LINK_INVALIDO');
  if fn_api_emitir_retirada(v_id) is not null then raise exception '8: emitiu link para pedido já retirado'; end if;

  -- 9. link vencido → rotina marca expirado → reenviar gera novo link que funciona
  r := pg_temp.ped('g6', 'beltrano@unesco.org', true); v_id3 := (r->>'id')::uuid;
  perform fn_api_pedido_decidir(adm, v_id3, 'aprovar', null, null, fn_api_pedido_hash(v_id3));
  tok := fn_api_emitir_retirada(v_id3);
  update api_pedidos set retirada_expira_em = now() - interval '1 minute' where id = v_id3;
  perform pg_temp.espera_erro(format('select fn_publico_api_retirar(%L)', tok), 'LINK_EXPIRADO');
  r2 := fn_api_rotina();
  if (select status from api_pedidos where id = v_id3) <> 'expirado' then raise exception '9: rotina %', r2; end if;
  perform pg_temp.espera_erro(format('select fn_publico_api_retirar(%L)', tok), 'LINK_INVALIDO');
  perform fn_api_pedido_decidir(adm, v_id3, 'reenviar', null, null, fn_api_pedido_hash(v_id3));
  if (select count(*) from api_pedido_notificacoes where pedido_id = v_id3 and evento = 'aprovado') <> 2 then raise exception '9: reenvio sem aviso'; end if;
  tok := fn_api_emitir_retirada(v_id3);
  if (fn_publico_api_retirar(tok)->>'chave') is null then raise exception '9: retirada após reenvio'; end if;

  -- 10. acesso revogado antes da retirada: link não entrega a chave
  r := pg_temp.ped('g7', 'ciclano@ac.gov.br', true);
  perform fn_api_pedido_decidir(adm, (r->>'id')::uuid, 'aprovar', null, null, fn_api_pedido_hash((r->>'id')::uuid));
  tok := fn_api_emitir_retirada((r->>'id')::uuid);
  update api_clientes set ativo = false where pedido_id = (r->>'id')::uuid;
  perform pg_temp.espera_erro(format('select fn_publico_api_retirar(%L)', tok), 'ACESSO_REVOGADO');
  if fn_api_emitir_retirada((r->>'id')::uuid) is not null then raise exception '10: emitiu link de acesso revogado'; end if;

  -- 11. aviso de vencimento: uma vez só
  update api_clientes set expira_em = now() + interval '10 days' where pedido_id = v_id;
  perform fn_api_rotina(); perform fn_api_rotina();
  if (select count(*) from api_pedido_notificacoes n join api_clientes k on k.id = n.cliente_id
       where k.pedido_id = v_id and n.evento = 'vencendo') <> 1 then raise exception '11: aviso de vencimento'; end if;

  -- 12. chave criada direto (SQL Editor) vale 1 ano por padrão; site e validade conferidos
  perform pg_temp.espera_erro('select fn_api_criar_cliente(''Painel X'', null, null, array[''https://x.gov.br/painel''])', 'API_ORIGEM_INVALIDA');
  perform pg_temp.espera_erro('select fn_api_criar_cliente(''Painel X'', null, null, null, now() + interval ''5 years'')', 'API_VALIDADE_INVALIDA');
  perform pg_temp.espera_erro('select fn_api_criar_cliente(''Painel X'', null, array[]::text[])', 'API_ESCOPO_INVALIDO');
  r := fn_api_criar_cliente('Painel teste');
  if (select expira_em from api_clientes where id = (r->>'id')::uuid) not between now() + interval '364 days' and now() + interval '366 days'
    then raise exception '12: validade padrão'; end if;
end $t$;

-- 13. permissões
do $t$
begin
  if has_function_privilege('anon', 'public.fn_api_pedido_registrar(jsonb)', 'execute')
  or has_function_privilege('authenticated', 'public.fn_api_pedido_registrar(jsonb)', 'execute')
  or has_function_privilege('authenticated', 'public.fn_api_pedido_decidir(uuid,uuid,text,text,jsonb,text)', 'execute')
  or has_function_privilege('anon', 'public.fn_api_emitir_retirada(uuid)', 'execute')
  or has_function_privilege('authenticated', 'public.fn_api_cliente(text)', 'execute')
  or has_function_privilege('anon', 'public.fn_api_pedidos()', 'execute')
  or has_function_privilege('anon', 'public.fn_api_rotina()', 'execute')
  or not has_function_privilege('anon', 'public.fn_publico_api_retirar(text)', 'execute')
  or not has_function_privilege('service_role', 'public.fn_api_pedido_decidir(uuid,uuid,text,text,jsonb,text)', 'execute')
  or has_table_privilege('authenticated', 'public.api_pedidos', 'select')
  or has_table_privilege('anon', 'public.api_pedido_notificacoes', 'select')
  then raise exception '13: permissão errada'; end if;
end $t$;

-- 14. pela API REST (sessão authenticator): anon e coordenação não administram; super_admin sim
set session authorization authenticator;
set role anon;
select pg_temp.espera_erro('select * from public.fn_api_criar_cliente(''Intruso'')', 'permission denied');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select pg_temp.espera_erro('select * from public.fn_api_pedidos()', 'API_SO_SUPER_ADMIN');
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.espera_erro('select * from public.fn_api_pedidos()', 'API_SO_SUPER_ADMIN');   -- authenticated sem uid
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $t$ begin if (select count(*) from public.fn_api_pedidos()) < 5 then raise exception '14: super_admin não lista'; end if; end $t$;
reset role;
reset session authorization;
