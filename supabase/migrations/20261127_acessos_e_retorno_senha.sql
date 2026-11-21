-- 27/11/2026 · Acessos (parte E): voltar a entrar e nova senha por link no e-mail.
-- Decisões do super_admin (21/11/2026):
--  · conta desativada (e conta suspensa por inatividade) só volta com aprovação do super_admin;
--  · conta desativada que volta tem os módulos em revisão (15 dias, como a revisão de 26/11);
--  · a própria pessoa cria a senha por um link de uso único enviado ao e-mail, válido por 24 horas;
--  · não pode repetir uma senha que ela já usou.
-- O e-mail sai pela Edge Function conta-acesso (Gmail). No banco fica só o resumo (SHA-256) do link.
-- Sem palavra de comando de remoção no texto (o apply_migration pede confirmação nela).

-- ── 1. Histórico de senhas (só o hash bcrypt, como o Auth guarda) ─────
create table if not exists public.usuario_senhas_historico (
  id         bigserial primary key,
  usuario_id uuid not null,
  hash       text not null,
  criado_em  timestamptz not null default now()
);
create index if not exists usuario_senhas_historico_u on public.usuario_senhas_historico (usuario_id, criado_em desc);
alter table public.usuario_senhas_historico enable row level security;
revoke all on public.usuario_senhas_historico from public, anon, authenticated;

insert into public.usuario_senhas_historico (usuario_id, hash)
select u.id, u.encrypted_password from auth.users u
 where u.encrypted_password like '$2%'
   and not exists (select 1 from public.usuario_senhas_historico h where h.usuario_id = u.id and h.hash = u.encrypted_password);

-- Toda senha gravada no Auth (link, troca, senha temporária do administrador) entra no histórico.
-- Nunca pode impedir o Auth de gravar: qualquer erro aqui é ignorado.
create or replace function public.fn_trg_auth_senha_historico() returns trigger
language plpgsql security definer set search_path to 'public' as $f$
begin
  begin
    if new.encrypted_password like '$2%'
       and (tg_op = 'INSERT' or new.encrypted_password is distinct from old.encrypted_password) then
      insert into public.usuario_senhas_historico (usuario_id, hash) values (new.id, new.encrypted_password);
    end if;
  exception when others then null;
  end;
  return new;
end $f$;
revoke execute on function public.fn_trg_auth_senha_historico() from public, anon, authenticated;
create or replace trigger trg_auth_senha_historico
  after insert or update of encrypted_password on auth.users
  for each row execute function public.fn_trg_auth_senha_historico();

-- A pessoa já usou esta senha? (as 12 últimas e a atual; o Auth grava $2a$, o pgcrypto compara em $2b$)
create or replace function public.fn_senha_ja_usada(p_uid uuid, p_senha text)
returns boolean language sql stable security definer set search_path to 'public', 'extensions' as $f$
  with h as (
    select hash from (select hash, criado_em from public.usuario_senhas_historico
                       where usuario_id = p_uid order by criado_em desc limit 12) x
    union
    select encrypted_password from auth.users where id = p_uid and encrypted_password like '$2%'
  )
  select exists (select 1 from h
                  where regexp_replace(h.hash, '^\$2a\$', '$2b$')
                        = extensions.crypt(p_senha, regexp_replace(h.hash, '^\$2a\$', '$2b$')));
$f$;
revoke execute on function public.fn_senha_ja_usada(uuid, text) from public, anon, authenticated;

-- ── 2. Links de uso único (nova senha / confirmar o pedido de voltar) ─
create table if not exists public.acesso_links (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.usuarios(id),
  finalidade   text not null check (finalidade in ('senha','retorno','negado')),
  token_hash   text unique,
  dados        jsonb not null default '{}'::jsonb,
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz,
  usado_em     timestamptz,
  cancelado_em timestamptz
);
create index if not exists acesso_links_u on public.acesso_links (usuario_id, criado_em desc);
alter table public.acesso_links enable row level security;
revoke all on public.acesso_links from public, anon, authenticated;

-- Pedido de nova senha (tela de entrada). Devolve o que a Edge Function deve enviar, ou nada.
-- ativa → link de senha (24 h, cancela os anteriores); suspensa → pedido de voltar a entrar (confirmar
-- pelo e-mail); desativada → nada sai (fica registrado para o Auditor).
create or replace function public.fn_senha_pedir(p_email text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_u record;
begin
  if length(v_email) not between 3 and 254 or v_email not like '%_@_%' or coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return '{}'::jsonb;
  end if;
  if (select count(*) from public.acesso_links where criado_em > now() - interval '1 hour') >= 100 then return '{}'::jsonb; end if;
  select id, nome_completo, email, ativo, bloqueado_inatividade_em, coalesce(idioma_pref::text, 'pt') idioma
    into v_u from public.usuarios where lower(email) = v_email limit 1;
  if v_u.id is null then return '{}'::jsonb; end if;
  if (select count(*) from public.acesso_links where usuario_id = v_u.id and criado_em > now() - interval '1 hour') >= 3 then
    return '{}'::jsonb;
  end if;
  if not v_u.ativo then
    insert into public.acesso_links (usuario_id, finalidade, dados) values (v_u.id, 'negado', '{"pedido":"senha"}');
    return '{}'::jsonb;
  end if;
  if v_u.bloqueado_inatividade_em is not null then
    if exists (select 1 from public.usuario_pedidos_acesso where usuario_id = v_u.id and tipo = 'liberacao' and status = 'pendente') then
      return '{}'::jsonb;
    end if;
    insert into public.acesso_links (usuario_id, finalidade, token_hash, dados, expira_em)
    values (v_u.id, 'retorno', p_token_hash, jsonb_build_object('situacao', 'suspensa', 'origem', 'senha'), now() + interval '24 hours');
    return jsonb_build_object('enviar', 'retorno', 'situacao', 'suspensa', 'email', v_u.email, 'nome', v_u.nome_completo, 'idioma', v_u.idioma);
  end if;
  update public.acesso_links set cancelado_em = now()
   where usuario_id = v_u.id and finalidade = 'senha' and usado_em is null and cancelado_em is null;
  insert into public.acesso_links (usuario_id, finalidade, token_hash, expira_em)
  values (v_u.id, 'senha', p_token_hash, now() + interval '24 hours');
  return jsonb_build_object('enviar', 'senha', 'email', v_u.email, 'nome', v_u.nome_completo, 'idioma', v_u.idioma);
end $f$;
revoke execute on function public.fn_senha_pedir(text, text) from public, anon, authenticated;

-- Pedido de voltar a entrar (conta suspensa ou desativada). Só vira pedido ao super_admin depois que a
-- pessoa confirma pelo link do e-mail (fn_retorno_confirmar).
create or replace function public.fn_retorno_pedir(p_email text, p_justificativa text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_u record; v_sit text;
  v_just text := nullif(left(btrim(coalesce(p_justificativa, '')), 1000), '');
begin
  if length(v_email) not between 3 and 254 or v_email not like '%_@_%' or coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return '{}'::jsonb;
  end if;
  if (select count(*) from public.acesso_links where criado_em > now() - interval '1 hour') >= 100 then return '{}'::jsonb; end if;
  select id, nome_completo, email, ativo, bloqueado_inatividade_em, coalesce(idioma_pref::text, 'pt') idioma
    into v_u from public.usuarios where lower(email) = v_email limit 1;
  if v_u.id is null or (v_u.ativo and v_u.bloqueado_inatividade_em is null) then return '{}'::jsonb; end if;
  if (select count(*) from public.acesso_links where usuario_id = v_u.id and criado_em > now() - interval '1 hour') >= 3 then
    return '{}'::jsonb;
  end if;
  if exists (select 1 from public.usuario_pedidos_acesso where usuario_id = v_u.id and tipo = 'liberacao' and status = 'pendente') then
    return '{}'::jsonb;
  end if;
  v_sit := case when v_u.ativo then 'suspensa' else 'desativada' end;
  insert into public.acesso_links (usuario_id, finalidade, token_hash, dados, expira_em)
  values (v_u.id, 'retorno', p_token_hash,
          jsonb_build_object('situacao', v_sit, 'origem', 'entrada', 'justificativa', v_just), now() + interval '24 hours');
  return jsonb_build_object('enviar', 'retorno', 'situacao', v_sit, 'email', v_u.email, 'nome', v_u.nome_completo, 'idioma', v_u.idioma);
end $f$;
revoke execute on function public.fn_retorno_pedir(text, text, text) from public, anon, authenticated;

-- O que o link é (para a página pedir a senha nova ou confirmar o pedido). Abrir não usa o link.
create or replace function public.fn_link_info(p_token_hash text)
returns jsonb language sql stable security definer set search_path to 'public' as $f$
  select coalesce((
    select jsonb_build_object(
      'finalidade', l.finalidade,
      'situacao', l.dados->>'situacao',
      'nome', split_part(btrim(u.nome_completo), ' ', 1),
      'estado', case when l.usado_em is not null then 'usado'
                     when l.cancelado_em is not null then 'substituido'
                     when l.expira_em <= now() then 'expirado'
                     when l.finalidade = 'senha' and (not u.ativo or u.bloqueado_inatividade_em is not null) then 'conta'
                     else 'valido' end)
      from public.acesso_links l join public.usuarios u on u.id = l.usuario_id
     where l.token_hash = p_token_hash and l.finalidade in ('senha','retorno')), '{"estado":"invalido"}'::jsonb);
$f$;
revoke execute on function public.fn_link_info(text) from public, anon, authenticated;

create or replace function public.fn_retorno_confirmar(p_token_hash text)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare l record; v_u record; v_sit text;
begin
  select * into l from public.acesso_links where token_hash = p_token_hash and finalidade = 'retorno' for update;
  if l.id is null then raise exception 'LINK_INVALIDO: link não encontrado'; end if;
  if l.usado_em is not null then return jsonb_build_object('ok', true, 'ja', true); end if;
  if l.cancelado_em is not null or l.expira_em <= now() then raise exception 'LINK_EXPIRADO: o link venceu; peça de novo na tela de entrada'; end if;
  update public.acesso_links set usado_em = now() where id = l.id;
  select id, nome_completo, ativo, bloqueado_inatividade_em into v_u from public.usuarios where id = l.usuario_id;
  if v_u.ativo and v_u.bloqueado_inatividade_em is null then return jsonb_build_object('ok', true, 'ja', true); end if;
  if not exists (select 1 from public.usuario_pedidos_acesso where usuario_id = v_u.id and tipo = 'liberacao' and status = 'pendente') then
    v_sit := case when v_u.ativo then 'suspensa' else 'desativada' end;
    insert into public.usuario_pedidos_acesso (tipo, usuario_id, origem, justificativa)
    values ('liberacao', v_u.id, 'entrada', l.dados->>'justificativa');
    perform public.fn_acesso_avisar_admins('acesso_pedido',
      case when v_sit = 'desativada' then 'Pedido de reativação de conta' else 'Pedido de liberação da entrada' end,
      coalesce(v_u.nome_completo, 'Um usuário')
        || case when v_sit = 'desativada' then ' teve a conta desativada e pediu para voltar.'
                else ' está suspenso por inatividade e pediu para voltar a entrar.' end
        || coalesce(' Motivo: ' || (l.dados->>'justificativa'), ''),
      'usuarios.html?pedidos=1');
  end if;
  return jsonb_build_object('ok', true);
end $f$;
revoke execute on function public.fn_retorno_confirmar(text) from public, anon, authenticated;

-- Antes de gravar a senha nova pelo link: link válido, conta ativa e senha nunca usada. Devolve o usuário.
create or replace function public.fn_senha_validar(p_token_hash text, p_senha text)
returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare l record; v_u record;
begin
  select * into l from public.acesso_links where token_hash = p_token_hash and finalidade = 'senha';
  if l.id is null then raise exception 'LINK_INVALIDO: link não encontrado'; end if;
  if l.usado_em is not null then raise exception 'LINK_USADO: este link já foi usado'; end if;
  if l.cancelado_em is not null or l.expira_em <= now() then raise exception 'LINK_EXPIRADO: o link venceu'; end if;
  select id, ativo, bloqueado_inatividade_em into v_u from public.usuarios where id = l.usuario_id;
  if not v_u.ativo or v_u.bloqueado_inatividade_em is not null then raise exception 'CONTA_INDISPONIVEL: a conta não está liberada'; end if;
  if public.fn_senha_ja_usada(v_u.id, p_senha) then raise exception 'SENHA_REPETIDA: você já usou esta senha; escolha outra'; end if;
  return v_u.id;
end $f$;
revoke execute on function public.fn_senha_validar(text, text) from public, anon, authenticated;

-- Depois que o Auth gravou: marca o link, encerra as outras sessões, tira o "deve trocar a senha" e
-- fecha os pedidos de senha ao administrador. Serve ao link (p_token_hash) e à troca logada (p_uid).
create or replace function public.fn_senha_concluir(p_uid uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_u record;
begin
  if p_token_hash is not null then
    update public.acesso_links set usado_em = now() where token_hash = p_token_hash and finalidade = 'senha' and usado_em is null;
  end if;
  update public.acesso_links set cancelado_em = now()
   where usuario_id = p_uid and finalidade = 'senha' and usado_em is null and cancelado_em is null;
  if p_token_hash is not null then
    begin
      update auth.refresh_tokens set revoked = true where user_id = p_uid::text and not coalesce(revoked, false);
    exception when others then null;
    end;
  end if;
  update public.usuarios set deve_trocar_senha = false, senha_temporaria_usada = true, atualizado_em = now() where id = p_uid;
  update public.solicitacoes_senha set status = 'atendido', atendido_em = now() where usuario_id = p_uid and status = 'pendente';
  select email, nome_completo, coalesce(idioma_pref::text, 'pt') idioma into v_u from public.usuarios where id = p_uid;
  return jsonb_build_object('email', v_u.email, 'nome', v_u.nome_completo, 'idioma', v_u.idioma);
end $f$;
revoke execute on function public.fn_senha_concluir(uuid, text) from public, anon, authenticated;

-- Link de senha para mandar junto do e-mail "entrada liberada"/"conta reativada" (gerado no envio).
create or replace function public.fn_senha_link_emitir(p_uid uuid, p_token_hash text)
returns boolean language plpgsql security definer set search_path to 'public' as $f$
begin
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then return false; end if;
  update public.acesso_links set cancelado_em = now()
   where usuario_id = p_uid and finalidade = 'senha' and usado_em is null and cancelado_em is null;
  insert into public.acesso_links (usuario_id, finalidade, token_hash, dados, expira_em)
  values (p_uid, 'senha', p_token_hash, '{"origem":"liberacao"}', now() + interval '24 hours');
  return true;
end $f$;
revoke execute on function public.fn_senha_link_emitir(uuid, text) from public, anon, authenticated;

-- ── 3. Conta desativada que volta: módulos em revisão (15 dias) ──────
-- Vale para a reativação pelo pedido e pelo botão "Reativar" em Usuários.
create or replace function public.fn_trg_usuario_reativado() returns trigger
language plpgsql security definer set search_path to 'public' as $f$
declare v_r record;
begin
  if old.ativo = false and new.ativo = true and new.perfil <> 'super_admin'
     and current_setting('dima.acesso_migracao', true) is distinct from '1' then
    select * into v_r from public.acesso_regras;
    perform set_config('dima.acesso_migracao', '1', true);   -- um aviso só (abaixo), não um por módulo
    update public.usuario_permissoes p
       set em_revisao = true,
           revisao_valido_ate_original = p.valido_ate,
           valido_ate = least(coalesce(p.valido_ate, 'infinity'::timestamptz), now() + make_interval(days => v_r.dias_revisao))
     where p.usuario_id = new.id and p.ativo and not p.em_revisao
       and (p.valido_ate is null or p.valido_ate > now());
    perform set_config('dima.acesso_migracao', '', true);
    perform set_config('dima.acesso', 'rpc', true);
    update public.usuarios set liberado_inatividade_em = now(), liberado_inatividade_por = auth.uid(),
           aviso_inatividade_em = now(), bloqueado_inatividade_em = null
     where id = new.id;
    perform public.fn_acesso_avisar_admins('acesso_revisao', 'Conta reativada: revise os módulos',
      coalesce(new.nome_completo, 'Um usuário') || ' voltou. Os módulos dele ficam em revisão por '
        || v_r.dias_revisao || ' dias; confirme em Usuários o que ainda é preciso.',
      'usuarios.html?filtro=revisao');
  end if;
  return null;
end $f$;
revoke execute on function public.fn_trg_usuario_reativado() from public, anon, authenticated;
create or replace trigger trg_usuario_reativado
  after update of ativo on public.usuarios
  for each row execute function public.fn_trg_usuario_reativado();

-- Aprovar o pedido de uma conta desativada reativa a conta e manda o e-mail com o link de senha.
create or replace function pg_temp.troca(p regprocedure, padrao text, novo text) returns void
language plpgsql as $t$
declare d text; n int;
begin
  d := pg_get_functiondef(p);
  select count(*) into n from regexp_matches(d, padrao, 'g');
  if n <> 1 then raise exception 'troca em %: % ocorrência(s) de %', p, n, padrao; end if;
  execute regexp_replace(d, padrao, novo);
end $t$;
select pg_temp.troca('public.fn_acesso_decidir(uuid,boolean,timestamptz,text)'::regprocedure,
  'perform public\.fn_acesso_liberar_inatividade\(v_p\.usuario_id\);(\s+)end if;',
  $r$perform public.fn_acesso_liberar_inatividade(v_p.usuario_id);\1end if;\1if not v_u.ativo then
      update public.usuarios set ativo = true, atualizado_em = now() where id = v_p.usuario_id;
      if v_u.email is not null then
        insert into public.acesso_notificacoes (usuario_id, evento, para_email, dados)
        values (v_p.usuario_id, 'liberado', v_u.email,
                jsonb_build_object('nome', v_u.nome_completo, 'reativado', true,
                                   'dias', (select dias_carencia from public.acesso_regras),
                                   'ate', now() + make_interval(days => (select dias_carencia from public.acesso_regras))));
      end if;\1end if;$r$);

-- ── 4. Auditor: pedido de senha de conta desativada e links vencidos sem uso ─
select pg_temp.troca('public.fn_auditoria_acessos()'::regprocedure,
  'union all(\s+)select ''baixo'', ''Acessos: e-mail não enviado''',
  $r$union all
  select 'info', 'Acessos: conta desativada pediu nova senha — ' || u.nome_completo,
         u.nome_completo || ' tem a conta desativada e pediu nova senha na tela de entrada ' || count(*)
           || ' vez(es) nos últimos 30 dias (último em '
           || to_char(max(l.criado_em) at time zone 'America/Rio_Branco', 'DD/MM/YYYY') || '). Nenhum e-mail foi enviado.',
         'Se a pessoa ainda trabalha no projeto, ela pode pedir para voltar pela tela de entrada; se não, nada a fazer.',
         'usuarios', u.id, u.nome_completo
    from acesso_links l join usuarios u on u.id = l.usuario_id
   where l.finalidade = 'negado' and l.criado_em > now() - interval '30 days' and not u.ativo
   group by u.id, u.nome_completo
  union all\1select 'baixo', 'Acessos: e-mail não enviado'$r$);

-- ── 5. ROPA: as tabelas novas entram no TRAT-007 por 20261127_acessos_e_ropa_sql_editor.sql
-- (UPDATE em lgpd_tratamentos faz o apply_migration expirar).
