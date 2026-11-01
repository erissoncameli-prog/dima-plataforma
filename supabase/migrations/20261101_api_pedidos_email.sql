-- ════════════════════════════════════════════════════════════════════════════
-- Pedido de acesso à API por e-mail (depende de 20261031_api_dados).
--
--   1. Quem quer a chave escreve para fundobrasilonuacre+api@gmail.com.
--      receber-email-tarefa registra o pedido (fn_api_pedido_registrar), confere se o
--      remetente é autêntico (DMARC/DKIM) e, se for, responde "recebido".
--   2. super_admin decide na tela Integrações (API), COM A SENHA (Edge Function
--      assinar-remanejamento, acao 'decidir_api' → fn_api_pedido_decidir).
--   3. Aprovado ⇒ o cliente nasce em api_clientes SEM chave e o solicitante recebe um
--      LINK DE RETIRADA (uso único, 72 h). O token do link é gerado na hora do envio
--      (fn_api_emitir_retirada) e só o hash fica no banco.
--   4. Abrir o link e clicar em "Mostrar minha chave" (fn_publico_api_retirar) GERA a
--      chave nesse momento, grava o hash e mostra a chave uma única vez.
--      A chave nunca viaja por e-mail nem fica guardada em texto.
--
-- Regras: só super_admin aprova; qualquer remetente pode pedir (o não autenticado fica
-- marcado e não recebe resposta automática); validade padrão 1 ano (máx. 2); nada se
-- apaga (recusado/expirado/cancelado são situações). Tabelas sem policy nem grant.
-- Dado pessoal do solicitante: TRAT-004 (ROPA).
-- O tipo de aviso 'api_pedido' do sino entra pelo 20261101_api_pedidos_email_sql_editor.sql;
-- sem ele o pedido é registrado normalmente, só o sino fica mudo.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.api_clientes add column if not exists pedido_id uuid;

create table if not exists public.api_pedidos (
  id                   uuid primary key default gen_random_uuid(),
  numero               text not null unique,                     -- API-2026-001
  gmail_message_id     text unique,                              -- idempotência do receptor
  email_message_id     text,                                     -- Message-ID do e-mail (para responder no mesmo fio)
  remetente_email      text not null,
  remetente_nome       text,
  assunto              text,
  corpo                text,
  campos               jsonb not null default '{}'::jsonb,       -- órgão, finalidade, site, rotas (lidos do modelo)
  autenticado          boolean not null default false,           -- DMARC/DKIM do domínio do remetente
  autenticacao         text,                                     -- resumo do Authentication-Results
  status               text not null default 'recebido'
                         check (status in ('recebido','aprovado','recusado','retirado','expirado')),
  decidido_por         uuid references public.usuarios(id),
  decidido_em          timestamptz,
  parecer              text,
  cliente_id           uuid references public.api_clientes(id),
  retirada_hash        text unique,
  retirada_expira_em   timestamptz,
  retirada_enviada_em  timestamptz,
  retirado_em          timestamptz,
  criado_em            timestamptz not null default now()
);
create index if not exists api_pedidos_remetente_em on public.api_pedidos (remetente_email, criado_em desc);

create table if not exists public.api_pedido_notificacoes (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid references public.api_pedidos(id),
  cliente_id  uuid references public.api_clientes(id),
  evento      text not null check (evento in ('recebido','aprovado','recusado','vencendo')),
  para_email  text not null,
  tentativas  integer not null default 0,
  ultimo_erro text,
  enviado_em  timestamptz,
  criado_em   timestamptz not null default now()
);
create index if not exists api_ped_notif_pend on public.api_pedido_notificacoes (criado_em) where enviado_em is null;

alter table public.api_pedidos             enable row level security;
alter table public.api_pedido_notificacoes enable row level security;
revoke all on public.api_pedidos             from public, anon, authenticated;
revoke all on public.api_pedido_notificacoes from public, anon, authenticated;

-- ── Registro (receptor de e-mail, service_role) ─────────────────────────────
-- p = {gmail_message_id, email_message_id, remetente_email, remetente_nome, assunto, corpo,
--      campos, autenticado, autenticacao}. Devolve {id, numero, novo, responder} ou {ignorado}.
create or replace function public.fn_api_pedido_registrar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p->>'remetente_email'));
  v_ex record; v_id uuid; v_num text; v_ano text := to_char(now() at time zone 'America/Rio_Branco', 'YYYY');
  v_aut boolean := coalesce((p->>'autenticado')::boolean, false);
  v_campos jsonb := '{}'::jsonb; k text;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ignorado', 'remetente_invalido'); end if;

  select id, numero into v_ex from api_pedidos where gmail_message_id = p->>'gmail_message_id';
  if found then return jsonb_build_object('id', v_ex.id, 'numero', v_ex.numero, 'novo', false, 'responder', false); end if;

  -- limites: 3 por remetente em 24 h; 20 no total por hora (evita virar canhão de e-mail)
  if (select count(*) from api_pedidos where remetente_email = v_email and criado_em > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ignorado', 'limite_remetente');
  end if;
  if (select count(*) from api_pedidos where criado_em > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ignorado', 'limite_global');
  end if;

  -- só os campos conhecidos do modelo, curtos
  foreach k in array array['orgao','responsavel','finalidade','site','rotas','prazo'] loop
    if coalesce(trim(p->'campos'->>k), '') <> '' then
      v_campos := v_campos || jsonb_build_object(k, left(trim(p->'campos'->>k), 300));
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtext('api_pedidos_numero'));
  select 'API-' || v_ano || '-' || lpad((count(*) + 1)::text, 3, '0') into v_num
    from api_pedidos where numero like 'API-' || v_ano || '-%';

  insert into api_pedidos (numero, gmail_message_id, email_message_id, remetente_email, remetente_nome, assunto, corpo,
                           campos, autenticado, autenticacao)
  values (v_num, p->>'gmail_message_id', left(p->>'email_message_id', 300), v_email, left(trim(p->>'remetente_nome'), 200),
          left(p->>'assunto', 300), left(p->>'corpo', 6000), v_campos, v_aut, left(p->>'autenticacao', 300))
  returning id into v_id;

  -- resposta "recebido" só para remetente autenticado (não responde a endereço forjado)
  if v_aut then
    insert into api_pedido_notificacoes (pedido_id, evento, para_email) values (v_id, 'recebido', v_email);
  end if;

  -- sino dos super_admin (o tipo depende do _sql_editor; sem ele, segue sem sino)
  begin
    insert into notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
    select u.id, 'api_pedido', 'Pedido de acesso à API ' || v_num,
           v_email || case when v_aut then '' else ' (remetente não confirmado)' end || ' pediu uma chave da API.',
           'integracoes.html?pedido=' || v_id, 'api_pedido', v_id
      from usuarios u where u.perfil = 'super_admin' and u.ativo;
  exception when check_violation then null;
  end;

  return jsonb_build_object('id', v_id, 'numero', v_num, 'novo', true, 'responder', v_aut);
end $$;

-- Hash do que a pessoa viu na tela (pedido é imutável depois de recebido; o hash
-- garante que a decisão vale para aquele pedido e aquela situação).
create or replace function public.fn_api_pedido_hash(p_pedido uuid)
returns text language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to(concat_ws('|', id, numero, remetente_email, coalesce(assunto, ''),
                coalesce(corpo, ''), campos::text, status), 'UTF8')), 'hex')
    from api_pedidos where id = p_pedido;
$$;

-- ── Leitura para a tela (super_admin) ───────────────────────────────────────
create or replace function public.fn_api_pedidos()
returns table (id uuid, numero text, remetente_email text, remetente_nome text, assunto text, corpo text, campos jsonb,
               autenticado boolean, autenticacao text, status text, decidido_por_nome text, decidido_em timestamptz,
               parecer text, cliente_id uuid, cliente_nome text, retirada_expira_em timestamptz,
               retirada_enviada_em timestamptz, retirado_em timestamptz, criado_em timestamptz, hash text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_api_pode_administrar() then raise exception 'API_SO_SUPER_ADMIN'; end if;
  return query
  select p.id, p.numero, p.remetente_email, p.remetente_nome, p.assunto, p.corpo, p.campos, p.autenticado, p.autenticacao,
         p.status, u.nome_completo, p.decidido_em, p.parecer, p.cliente_id, c.nome, p.retirada_expira_em,
         p.retirada_enviada_em, p.retirado_em, p.criado_em, fn_api_pedido_hash(p.id)
    from api_pedidos p
    left join usuarios u on u.id = p.decidido_por
    left join api_clientes c on c.id = p.cliente_id
   order by (p.status = 'recebido') desc, p.criado_em desc;
end $$;

create or replace function public.fn_api_acessos(p_limite integer default 200)
returns table (criado_em timestamptz, cliente text, rota text, formato text, status integer, linhas integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_api_pode_administrar() then raise exception 'API_SO_SUPER_ADMIN'; end if;
  return query
  select a.criado_em, c.nome, a.rota, a.formato, a.status, a.linhas
    from api_acessos a join api_clientes c on c.id = a.cliente_id
   order by a.criado_em desc limit least(greatest(coalesce(p_limite, 200), 1), 1000);
end $$;

-- ── Decisão (só service_role, depois da senha conferida na Edge Function) ───
-- p_config = {nome, escopos[], origens[], limite_minuto, expira_em}
create or replace function public.fn_api_pedido_decidir(p_usuario_id uuid, p_pedido uuid, p_decisao text,
                                                        p_parecer text, p_config jsonb, p_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p api_pedidos; v_cfg jsonb := coalesce(p_config, '{}'::jsonb);
  v_nome text; v_esc text[]; v_ori text[]; v_lim integer; v_exp timestamptz; v_cli uuid; o text;
begin
  if not exists (select 1 from usuarios where id = p_usuario_id and perfil = 'super_admin' and ativo) then
    raise exception 'API_SO_SUPER_ADMIN';
  end if;
  select * into v_p from api_pedidos where id = p_pedido for update;
  if not found then raise exception 'PEDIDO_NAO_ENCONTRADO'; end if;
  if fn_api_pedido_hash(p_pedido) is distinct from p_hash then raise exception 'DOCUMENTO_ALTERADO'; end if;

  if p_decisao = 'reenviar' then
    -- novo link de retirada (o anterior perde efeito quando o novo é emitido)
    if v_p.status not in ('aprovado','expirado') then raise exception 'PEDIDO_SEM_LINK'; end if;
    if not exists (select 1 from api_clientes where id = v_p.cliente_id and ativo and chave_hash is null) then
      raise exception 'ACESSO_REVOGADO';
    end if;
    update api_pedidos set status = 'aprovado', retirada_hash = null, retirada_expira_em = null where id = p_pedido;
    insert into api_pedido_notificacoes (pedido_id, cliente_id, evento, para_email)
    values (p_pedido, v_p.cliente_id, 'aprovado', v_p.remetente_email);
    return jsonb_build_object('status', 'aprovado', 'reenviado', true);
  end if;

  if v_p.status <> 'recebido' then raise exception 'PEDIDO_JA_DECIDIDO'; end if;

  if p_decisao = 'recusar' then
    if coalesce(length(trim(p_parecer)), 0) < 10 then raise exception 'PARECER_OBRIGATORIO'; end if;
    update api_pedidos set status = 'recusado', decidido_por = p_usuario_id, decidido_em = now(), parecer = trim(p_parecer)
     where id = p_pedido;
    insert into api_pedido_notificacoes (pedido_id, evento, para_email) values (p_pedido, 'recusado', v_p.remetente_email);
    return jsonb_build_object('status', 'recusado');
  end if;

  if p_decisao <> 'aprovar' then raise exception 'DECISAO_INVALIDA'; end if;

  v_nome := coalesce(nullif(trim(v_cfg->>'nome'), ''), nullif(v_p.campos->>'orgao', ''), v_p.remetente_email);
  v_esc  := case when jsonb_typeof(v_cfg->'escopos') = 'array' then array(select jsonb_array_elements_text(v_cfg->'escopos'))
                 else array['resumo','atividades','matriz'] end;
  v_ori  := case when jsonb_typeof(v_cfg->'origens') = 'array'
                 then array(select rtrim(lower(trim(x)), '/') from jsonb_array_elements_text(v_cfg->'origens') x where trim(x) <> '')
                 else '{}' end;
  v_lim  := coalesce((v_cfg->>'limite_minuto')::integer, 60);
  v_exp  := coalesce((v_cfg->>'expira_em')::timestamptz, now() + interval '1 year');

  if length(v_nome) < 3 then raise exception 'API_NOME_OBRIGATORIO'; end if;
  if cardinality(v_esc) = 0 or not v_esc <@ array['resumo','atividades','matriz'] then raise exception 'API_ESCOPO_INVALIDO'; end if;
  foreach o in array v_ori loop
    if o !~ '^https?://[a-z0-9.-]+(:[0-9]{1,5})?$' then raise exception 'API_ORIGEM_INVALIDA: %', o; end if;
  end loop;
  if v_lim not between 1 and 1000 then raise exception 'API_LIMITE_INVALIDO'; end if;
  if v_exp <= now() + interval '1 day' or v_exp > now() + interval '2 years' then raise exception 'API_VALIDADE_INVALIDA'; end if;

  insert into api_clientes (nome, descricao, escopos, origens, limite_minuto, expira_em, criado_por, contato_email, pedido_id)
  values (v_nome, 'Pedido ' || v_p.numero || ' por e-mail', v_esc, v_ori, v_lim, v_exp, p_usuario_id, v_p.remetente_email, p_pedido)
  returning id into v_cli;

  update api_pedidos set status = 'aprovado', decidido_por = p_usuario_id, decidido_em = now(),
         parecer = nullif(trim(coalesce(p_parecer, '')), ''), cliente_id = v_cli
   where id = p_pedido;
  insert into api_pedido_notificacoes (pedido_id, cliente_id, evento, para_email)
  values (p_pedido, v_cli, 'aprovado', v_p.remetente_email);
  return jsonb_build_object('status', 'aprovado', 'cliente_id', v_cli);
end $$;

-- ── Link de retirada (gerado na hora do envio do e-mail; só o hash fica) ────
create or replace function public.fn_api_emitir_retirada(p_pedido uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_tok text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  update api_pedidos
     set retirada_hash = encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'),
         retirada_expira_em = now() + interval '72 hours', retirada_enviada_em = now()
   where id = p_pedido and status = 'aprovado'
     and exists (select 1 from api_clientes c where c.id = cliente_id and c.ativo and c.chave_hash is null);
  if not found then return null; end if;
  return v_tok;
end $$;

-- Página pública api-retirar.html: troca o token do link pela chave, uma vez.
create or replace function public.fn_publico_api_retirar(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p api_pedidos; v_c api_clientes; v_chave text;
begin
  if coalesce(length(p_token), 0) <> 64 then raise exception 'LINK_INVALIDO'; end if;
  select * into v_p from api_pedidos
   where retirada_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found then raise exception 'LINK_INVALIDO'; end if;
  if v_p.status <> 'aprovado' then raise exception 'LINK_INVALIDO'; end if;
  if v_p.retirada_expira_em < now() then raise exception 'LINK_EXPIRADO'; end if;
  select * into v_c from api_clientes where id = v_p.cliente_id for update;
  if not found or not v_c.ativo or v_c.chave_hash is not null then raise exception 'ACESSO_REVOGADO'; end if;

  v_chave := 'dima_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update api_clientes set chave_hash = encode(sha256(convert_to(v_chave, 'UTF8')), 'hex'),
         chave_prefixo = left(v_chave, 12), retirada_em = now()
   where id = v_c.id;
  update api_pedidos set status = 'retirado', retirado_em = now(), retirada_hash = null where id = v_p.id;

  return jsonb_build_object('chave', v_chave, 'nome', v_c.nome, 'escopos', to_jsonb(v_c.escopos),
    'origens', to_jsonb(v_c.origens), 'limite_minuto', v_c.limite_minuto, 'expira_em', v_c.expira_em,
    'pedido', v_p.numero);
end $$;

-- ── Rotina diária: links vencidos e aviso de vencimento da chave (15 dias) ──
create or replace function public.fn_api_rotina()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_exp integer; v_av integer;
begin
  update api_pedidos set status = 'expirado', retirada_hash = null
   where status = 'aprovado' and retirada_expira_em < now();
  get diagnostics v_exp = row_count;

  with alvo as (
    update api_clientes set aviso_vencimento_em = now()
     where ativo and chave_hash is not null and contato_email is not null and aviso_vencimento_em is null
       and expira_em between now() and now() + interval '15 days'
    returning id, contato_email
  )
  insert into api_pedido_notificacoes (cliente_id, evento, para_email)
  select id, 'vencendo', contato_email from alvo;
  get diagnostics v_av = row_count;

  return jsonb_build_object('links_expirados', v_exp, 'avisos_vencimento', v_av);
end $$;

-- ── ROPA ────────────────────────────────────────────────────────────────────
insert into public.lgpd_tratamentos (codigo, nome, modulo, finalidade, controlador, operadores, base_legal, base_legal_detalhe,
       categorias_titulares, categorias_dados, dado_sensivel, dado_de_menor, tabelas, compartilhamento, transferencia_internacional,
       retencao_prazo, retencao_criterio, medidas_seguranca, ativo)
select 'TRAT-004', 'Pedidos de acesso à API de dados', 'api',
       'Receber, analisar e responder pedidos de chave da API de dados agregados do DIMA (painéis e BI de outras instituições), e avisar o vencimento da chave.',
       'SEMA/AC', 'Supabase (banco e funções); Google (Gmail: recebimento e envio dos e-mails); Vercel (hospedagem)', 'art7_iii_politica_publica',
       'Art. 7º, III (execução de políticas públicas — transparência e compartilhamento institucional dos resultados do Projeto 218BRA2001). Não usa consentimento.',
       array['servidores e técnicos de outras instituições que pedem acesso à API'],
       array['nome e e-mail do remetente','órgão, finalidade e site informados no pedido','texto do e-mail do pedido'],
       false, false, array['api_pedidos','api_pedido_notificacoes','api_clientes'],
       'Nenhum. A API devolve só números agregados; nenhum dado do pedido sai por ela.',
       'Supabase/Vercel/Google (art. 33) — pendência geral do DIMA', null,
       'Guardado enquanto a chave existir e até a prestação de contas do projeto; revisar prazo com o Encarregado.',
       'Tabelas sem policy nem grant (só funções do banco); leitura só pelo super_admin; decisão com senha; chave e link de retirada guardados só como SHA-256; link de uso único (72 h).',
       true
 where not exists (select 1 from public.lgpd_tratamentos where codigo = 'TRAT-004');

-- ── Permissões ──────────────────────────────────────────────────────────────
revoke execute on function public.fn_api_pedido_registrar(jsonb) from public, anon, authenticated;
revoke execute on function public.fn_api_pedido_hash(uuid) from public, anon, authenticated;
revoke execute on function public.fn_api_pedido_decidir(uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.fn_api_emitir_retirada(uuid) from public, anon, authenticated;
revoke execute on function public.fn_api_rotina() from public, anon, authenticated;
grant  execute on function public.fn_api_pedido_registrar(jsonb) to service_role;
grant  execute on function public.fn_api_pedido_hash(uuid) to service_role;
grant  execute on function public.fn_api_pedido_decidir(uuid, uuid, text, text, jsonb, text) to service_role;
grant  execute on function public.fn_api_emitir_retirada(uuid) to service_role;
grant  execute on function public.fn_api_rotina() to service_role;

revoke execute on function public.fn_api_pedidos() from public, anon;
revoke execute on function public.fn_api_acessos(integer) from public, anon;
grant  execute on function public.fn_api_pedidos() to authenticated;
grant  execute on function public.fn_api_acessos(integer) to authenticated;

revoke execute on function public.fn_publico_api_retirar(text) from public;
grant  execute on function public.fn_publico_api_retirar(text) to anon, authenticated;

select cron.schedule('api-rotina', '23 9 * * *', 'select public.fn_api_rotina()');

notify pgrst, 'reload schema';
