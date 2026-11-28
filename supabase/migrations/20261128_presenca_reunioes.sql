-- 28/11/2026 · Lista de presença das reuniões do Painel de Tarefas.
-- Toda tarefa do tipo 'reuniao' ganha UMA lista (presenca_listas), aberta de 15 min antes do início até 2 h depois do
-- término (o organizador pode reabrir por 2 h ou encerrar antes). 10 min depois do início, cada convidado (criador +
-- responsáveis + observadores) recebe por e-mail um LINK PESSOAL (presenca_convites, só o SHA-256 fica no banco) e a
-- lista também pode ser assinada pelo QR projetado na reunião (página pública pages/presenca.html).
-- Campos: nome, e-mail, telefone, sexo/gênero, cor ou raça (dado SENSÍVEL — LGPD art. 5º, II e art. 11) e a
-- autorização de uso de imagem (consentimento, com a versão e o SHA-256 do termo lido — presenca_termos_imagem).
-- Uma assinatura por usuário e um e-mail por lista. Tudo por RPC SECURITY DEFINER: as tabelas não têm policy nem grant.
-- Sem palavra de comando de apagar no texto (o apply_migration espera confirmação nela).

-- ── 1. Termo de autorização de uso de imagem (versões imutáveis) ─────────
create table if not exists public.presenca_termos_imagem (
  id            uuid primary key default gen_random_uuid(),
  versao        int  not null unique,
  texto         text not null check (length(btrim(texto)) >= 200),
  sha256        text not null,
  vigente       boolean not null default false,
  publicado_por uuid references public.usuarios(id),
  publicado_em  timestamptz not null default now()
);
create unique index if not exists presenca_termo_vigente_uk on public.presenca_termos_imagem ((true)) where vigente;
alter table public.presenca_termos_imagem enable row level security;

-- versão publicada não muda: só a troca de "vigente" (feita pela função de publicar) passa
create or replace function public.fn_trg_presenca_termo_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.texto is distinct from old.texto or new.sha256 is distinct from old.sha256 or new.versao is distinct from old.versao then
    raise exception 'presenca:termo_imutavel' using hint = 'Corrigir o termo = publicar uma versão nova.';
  end if;
  return new;
end $$;
create or replace trigger trg_presenca_termo_imutavel before update on public.presenca_termos_imagem
  for each row execute function public.fn_trg_presenca_termo_imutavel();
revoke execute on function public.fn_trg_presenca_termo_imutavel() from public, anon, authenticated;

insert into public.presenca_termos_imagem (versao, texto, sha256, vigente)
select 1, t, encode(sha256(convert_to(t, 'UTF8')), 'hex'), true from (select
'TERMO DE AUTORIZAÇÃO DE USO DE IMAGEM

Ao marcar "Autorizo", eu autorizo, de forma gratuita, a Secretaria de Estado do Meio Ambiente do Acre (SEMA/AC), no âmbito do Projeto 218BRA2001 executado com a UNESCO e o Fundo Brasil-ONU, a usar a minha imagem (fotografias e vídeos) registrada nesta reunião ou evento.

1. Para que as imagens serão usadas: relatórios técnicos e de prestação de contas do projeto aos financiadores (Fundo Brasil-ONU e UNESCO); divulgação das atividades do projeto no site, nas redes sociais e em materiais institucionais da SEMA/AC e dos parceiros; e registro histórico do projeto.

2. O que não será feito: as imagens não serão vendidas nem usadas em propaganda comercial ou político-partidária, e não serão usadas de forma que prejudique a minha honra, a minha reputação ou a minha dignidade.

3. Prazo: a autorização vale durante a execução do projeto e pelo tempo de guarda dos documentos de prestação de contas. Materiais já publicados antes de eventual retirada da autorização podem continuar disponíveis.

4. Retirar a autorização: posso retirar esta autorização a qualquer momento, sem custo, pedindo ao organizador da reunião ou à coordenação do projeto. A retirada vale dali em diante e não afeta a minha presença registrada nesta lista.

5. Não autorizar: marcar "Não autorizo" não impede o registro da minha presença.

6. Meus dados: a SEMA/AC trata os dados desta lista conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). O uso da imagem tem como base o meu consentimento (art. 7º, I) e o direito de imagem (Código Civil, art. 20).' as t) x
where not exists (select 1 from public.presenca_termos_imagem);

-- ── 2. Listas de presença (uma por reunião) ──────────────────────────────
create table if not exists public.presenca_listas (
  id                  uuid primary key default gen_random_uuid(),
  tarefa_id           uuid not null unique references public.tarefas(id),
  token               text not null unique,          -- vai no QR (pages/presenca.html?l=…)
  inicio_reuniao      timestamptz not null,
  abre_em             timestamptz not null,
  fecha_em            timestamptz not null,
  reaberta_ate        timestamptz,                    -- reabertura manual (2 h)
  encerrada_em        timestamptz,                    -- encerramento manual ou reunião cancelada
  encerrada_por       uuid references public.usuarios(id),
  email_enfileirado_em timestamptz,                   -- a rotina dos 10 minutos já pôs os convites na fila
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index if not exists idx_presenca_listas_email on public.presenca_listas (inicio_reuniao) where email_enfileirado_em is null;
alter table public.presenca_listas enable row level security;

-- ── 3. Assinaturas ───────────────────────────────────────────────────────
create table if not exists public.presenca_assinaturas (
  id                  uuid primary key default gen_random_uuid(),
  lista_id            uuid not null references public.presenca_listas(id),
  usuario_id          uuid references public.usuarios(id),     -- NULL = convidado sem conta
  nome                text not null check (length(btrim(nome)) between 3 and 160),
  email               text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone            text,
  sexo_genero         text not null check (sexo_genero in ('mulher','homem','outro','prefere_nao_responder')),
  sexo_genero_outro   text,
  cor_raca            text not null check (cor_raca in ('branca','preta','parda','amarela','indigena','prefere_nao_responder')),
  origem              text not null check (origem in ('convite','qr')),
  imagem_autoriza     boolean not null,
  termo_id            uuid not null references public.presenca_termos_imagem(id),
  termo_sha256        text not null,
  imagem_revogada_em  timestamptz,
  imagem_revogada_por uuid references public.usuarios(id),
  imagem_revogacao_motivo text,
  assinado_em         timestamptz not null default now()
);
create unique index if not exists presenca_assin_email_uk   on public.presenca_assinaturas (lista_id, lower(email));
create unique index if not exists presenca_assin_usuario_uk on public.presenca_assinaturas (lista_id, usuario_id) where usuario_id is not null;
create index if not exists idx_presenca_assin_lista on public.presenca_assinaturas (lista_id);
alter table public.presenca_assinaturas enable row level security;
-- trilha (quem mudou a autorização de imagem e quando)
create or replace trigger trg_audit_presenca_assinaturas after insert or update on public.presenca_assinaturas
  for each row execute function public.fn_trg_audit();

-- ── 4. Convites pessoais (link do e-mail) e fila de e-mail ───────────────
create table if not exists public.presenca_convites (
  id          uuid primary key default gen_random_uuid(),
  lista_id    uuid not null references public.presenca_listas(id),
  usuario_id  uuid not null references public.usuarios(id),
  token_hash  text not null unique,
  criado_em   timestamptz not null default now(),
  usado_em    timestamptz
);
create index if not exists idx_presenca_conv_lista on public.presenca_convites (lista_id, usuario_id);
alter table public.presenca_convites enable row level security;

create table if not exists public.presenca_notificacoes (
  id          uuid primary key default gen_random_uuid(),
  lista_id    uuid not null references public.presenca_listas(id),
  usuario_id  uuid not null references public.usuarios(id),
  para_email  text not null,
  tentativas  int  not null default 0,
  erro        text,
  enviado_em  timestamptz,
  criado_em   timestamptz not null default now(),
  unique (lista_id, usuario_id)
);
create index if not exists idx_presenca_notif_pend on public.presenca_notificacoes (criado_em) where enviado_em is null;
alter table public.presenca_notificacoes enable row level security;

create table if not exists public.presenca_exportacoes (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.usuarios(id),
  formato     text not null check (formato in ('a4','xlsx','csv')),
  listas      uuid[] not null,
  n_linhas    int not null,
  com_sensiveis boolean not null,
  criado_em   timestamptz not null default now()
);
alter table public.presenca_exportacoes enable row level security;

-- ── 5. Datas da reunião (hora local do Acre, UTC-5 fixo — igual ao convite .ics) ──
create or replace function public.fn_presenca_hora(p_txt text)
returns timestamptz language plpgsql immutable set search_path = public as $$
begin
  if p_txt is null or p_txt !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then return null; end if;
  return (substr(p_txt, 1, 16) || ':00-05:00')::timestamptz;
exception when others then return null;
end $$;

-- cria ou acerta a lista da reunião (chamada pelo gatilho de tarefas)
create or replace function public.fn_presenca_sincronizar(p_tarefa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t   public.tarefas;
  v_i timestamptz; v_f timestamptz;
  l   public.presenca_listas;
begin
  select * into t from public.tarefas where id = p_tarefa;
  if not found then return; end if;
  select * into l from public.presenca_listas where tarefa_id = p_tarefa;

  if t.tipo is distinct from 'reuniao' or not t.ativo or t.status = 'cancelada' then
    if found and l.encerrada_em is null then
      update public.presenca_listas set encerrada_em = now(), atualizado_em = now() where id = l.id;
    end if;
    return;
  end if;

  v_i := public.fn_presenca_hora(t.dados_tipo->>'inicio');
  if v_i is null then return; end if;
  v_f := coalesce(public.fn_presenca_hora(t.dados_tipo->>'fim'), v_i + interval '2 hours');
  if v_f < v_i then v_f := v_i + interval '2 hours'; end if;

  if l.id is null then
    insert into public.presenca_listas (tarefa_id, token, inicio_reuniao, abre_em, fecha_em)
    values (p_tarefa, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
            v_i, v_i - interval '15 minutes', v_f + interval '2 hours')
    on conflict (tarefa_id) do nothing;
  else
    update public.presenca_listas set
      inicio_reuniao = v_i, abre_em = v_i - interval '15 minutes', fecha_em = v_f + interval '2 hours',
      -- remarcada para o futuro: o e-mail dos 10 minutos volta a valer para a nova data
      email_enfileirado_em = case when v_i is distinct from l.inicio_reuniao and v_i > now() then null else email_enfileirado_em end,
      -- reunião que volta de "cancelada": a lista reabre pelas datas
      encerrada_em = case when l.encerrada_por is null then null else l.encerrada_em end,
      atualizado_em = now()
    where id = l.id;
  end if;
end $$;
revoke execute on function public.fn_presenca_sincronizar(uuid) from public, anon, authenticated;

create or replace function public.fn_trg_presenca_tarefa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'reuniao' or (tg_op = 'UPDATE' and old.tipo = 'reuniao') then
    perform public.fn_presenca_sincronizar(new.id);
  end if;
  return null;
end $$;
revoke execute on function public.fn_trg_presenca_tarefa() from public, anon, authenticated;
create or replace trigger trg_presenca_tarefa
  after insert or update of tipo, dados_tipo, status, ativo on public.tarefas
  for each row execute function public.fn_trg_presenca_tarefa();

-- reuniões já cadastradas que ainda não terminaram ganham a lista agora
do $$ declare r record; begin
  for r in select id from public.tarefas
           where tipo = 'reuniao' and ativo and status <> 'cancelada'
             and public.fn_presenca_hora(dados_tipo->>'inicio') > now() - interval '1 day'
  loop perform public.fn_presenca_sincronizar(r.id); end loop;
end $$;

-- ── 6. Regras de acesso ──────────────────────────────────────────────────
create or replace function public.fn_presenca_aberta(l public.presenca_listas)
returns boolean language sql stable set search_path = public as $$
  select l.encerrada_em is null and (now() between l.abre_em and l.fecha_em or coalesce(l.reaberta_ate > now(), false));
$$;

-- administra (projetar QR, reabrir, encerrar, exportar, retirar autorização de imagem):
-- criador da reunião, responsáveis dela, coordenação e super_admin (ativos)
create or replace function public.fn_presenca_pode_gerir(p_lista uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_perfil_atual() in ('super_admin', 'coordenacao'), false) or exists (
    select 1 from public.presenca_listas l join public.tarefas t on t.id = l.tarefa_id
    where l.id = p_lista and (t.criado_por = auth.uid() or exists (
      select 1 from public.tarefa_participantes tp
      where tp.tarefa_id = t.id and tp.usuario_id = auth.uid() and tp.papel = 'responsavel'))
      and public.fn_perfil_atual() is not null);
$$;
-- sexo/gênero e cor ou raça por pessoa: só coordenação e super_admin (os demais veem só os totais)
create or replace function public.fn_presenca_ve_sensivel()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_perfil_atual() in ('super_admin', 'coordenacao'), false);
$$;
revoke execute on function public.fn_presenca_pode_gerir(uuid) from public, anon;
revoke execute on function public.fn_presenca_ve_sensivel() from public, anon;
grant execute on function public.fn_presenca_pode_gerir(uuid), public.fn_presenca_ve_sensivel() to authenticated;

-- ── 7. Página pública: dados da lista e assinatura ───────────────────────
create or replace function public.fn_presenca_hash(p text)
returns text language sql immutable set search_path = public as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

-- p_lista_token = QR (?l=); p_convite = link pessoal do e-mail (?c=). Um dos dois.
create or replace function public.fn_publico_presenca_lista(p_lista_token text default null, p_convite text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  l public.presenca_listas; t public.tarefas; c public.presenca_convites; tm public.presenca_termos_imagem;
  u public.usuarios; v_uid uuid; v_ja boolean := false; v_ant public.presenca_assinaturas;
begin
  if nullif(p_convite, '') is not null then
    select * into c from public.presenca_convites where token_hash = public.fn_presenca_hash(p_convite);
    if not found then return jsonb_build_object('encontrado', false); end if;
    select * into l from public.presenca_listas where id = c.lista_id;
    v_uid := c.usuario_id;
  elsif nullif(p_lista_token, '') is not null then
    select * into l from public.presenca_listas where token = p_lista_token;
    if not found then return jsonb_build_object('encontrado', false); end if;
    if auth.uid() is not null and public.fn_perfil_atual() is not null then v_uid := auth.uid(); end if;
  else
    return jsonb_build_object('encontrado', false);
  end if;

  select * into t from public.tarefas where id = l.tarefa_id;
  select * into tm from public.presenca_termos_imagem where vigente;
  if v_uid is not null then
    select * into u from public.usuarios where id = v_uid;
    v_ja := exists (select 1 from public.presenca_assinaturas where lista_id = l.id and usuario_id = v_uid);
    -- respostas da última lista que a pessoa assinou (para não digitar de novo)
    select * into v_ant from public.presenca_assinaturas where usuario_id = v_uid order by assinado_em desc limit 1;
  end if;

  return jsonb_build_object(
    'encontrado', true,
    'titulo', t.titulo,
    'codigo', t.codigo,
    'inicio', t.dados_tipo->>'inicio',
    'fim', t.dados_tipo->>'fim',
    'formato', t.dados_tipo->>'formato',
    'local', t.dados_tipo->>'local',
    'aberta', public.fn_presenca_aberta(l),
    'abre_em', l.abre_em,
    'fecha_em', case when coalesce(l.reaberta_ate > l.fecha_em, false) then l.reaberta_ate else l.fecha_em end,
    'encerrada', l.encerrada_em is not null,
    'pessoal', v_uid is not null,
    'ja_assinou', v_ja,
    'pre', case when v_uid is null then null else jsonb_build_object(
      'nome', u.nome_completo, 'email', u.email, 'telefone', coalesce(v_ant.telefone, u.telefone),
      'sexo_genero', v_ant.sexo_genero, 'sexo_genero_outro', v_ant.sexo_genero_outro, 'cor_raca', v_ant.cor_raca) end,
    'termo', jsonb_build_object('id', tm.id, 'versao', tm.versao, 'texto', tm.texto, 'sha256', tm.sha256));
end $$;
revoke execute on function public.fn_publico_presenca_lista(text, text) from public;
grant execute on function public.fn_publico_presenca_lista(text, text) to anon, authenticated;

-- p_dados = {nome, email, telefone, sexo_genero, sexo_genero_outro, cor_raca, imagem_autoriza (true|false), termo_id}
create or replace function public.fn_publico_presenca_assinar(p_lista_token text, p_convite text, p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  l public.presenca_listas; c public.presenca_convites; tm public.presenca_termos_imagem; u public.usuarios;
  v_uid uuid; v_origem text; v_email text; v_nome text; v_tel text; v_img boolean; v_n int;
begin
  if nullif(p_convite, '') is not null then
    select * into c from public.presenca_convites where token_hash = public.fn_presenca_hash(p_convite) for update;
    if not found then raise exception 'presenca:link_invalido'; end if;
    select * into l from public.presenca_listas where id = c.lista_id for update;
    v_uid := c.usuario_id; v_origem := 'convite';
  else
    select * into l from public.presenca_listas where token = coalesce(p_lista_token, '') for update;
    if not found then raise exception 'presenca:lista_inexistente'; end if;
    v_origem := 'qr';
    if auth.uid() is not null and public.fn_perfil_atual() is not null then v_uid := auth.uid(); end if;
  end if;
  if not public.fn_presenca_aberta(l) then raise exception 'presenca:lista_fechada'; end if;

  -- termo: tem de ser o vigente que a pessoa leu
  select * into tm from public.presenca_termos_imagem where vigente;
  if tm.id is null or (p_dados->>'termo_id') is distinct from tm.id::text then raise exception 'presenca:termo_mudou'; end if;
  if (p_dados->>'imagem_autoriza') not in ('true', 'false') then raise exception 'presenca:imagem_obrigatoria'; end if;
  v_img := (p_dados->>'imagem_autoriza')::boolean;

  v_nome := btrim(regexp_replace(coalesce(p_dados->>'nome', ''), '\s+', ' ', 'g'));
  v_email := lower(btrim(coalesce(p_dados->>'email', '')));
  v_tel := nullif(regexp_replace(coalesce(p_dados->>'telefone', ''), '\D', '', 'g'), '');
  if length(v_nome) < 3 then raise exception 'presenca:nome_invalido'; end if;
  if v_tel is not null and length(v_tel) not between 10 and 13 then raise exception 'presenca:telefone_invalido'; end if;

  if v_uid is not null then
    -- usuário da plataforma assina como ele mesmo: o e-mail é o do cadastro
    select * into u from public.usuarios where id = v_uid;
    v_email := lower(u.email);
  else
    if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'presenca:email_invalido'; end if;
    -- e-mail de um usuário ativo: conta como a assinatura dele (uma por pessoa)
    select id into v_uid from public.usuarios where lower(email) = v_email and ativo limit 1;
  end if;

  if (p_dados->>'sexo_genero') not in ('mulher','homem','outro','prefere_nao_responder') then raise exception 'presenca:sexo_obrigatorio'; end if;
  if (p_dados->>'cor_raca') not in ('branca','preta','parda','amarela','indigena','prefere_nao_responder') then raise exception 'presenca:raca_obrigatoria'; end if;

  select count(*) into v_n from public.presenca_assinaturas where lista_id = l.id;
  if v_n >= 1000 then raise exception 'presenca:lista_cheia'; end if;

  begin
    insert into public.presenca_assinaturas (lista_id, usuario_id, nome, email, telefone, sexo_genero, sexo_genero_outro,
      cor_raca, origem, imagem_autoriza, termo_id, termo_sha256)
    values (l.id, v_uid, v_nome, v_email, v_tel, p_dados->>'sexo_genero',
      case when p_dados->>'sexo_genero' = 'outro' then left(nullif(btrim(p_dados->>'sexo_genero_outro'), ''), 60) end,
      p_dados->>'cor_raca', v_origem, v_img, tm.id, tm.sha256);
  exception when unique_violation then
    raise exception 'presenca:ja_assinou';
  end;
  if c.id is not null then update public.presenca_convites set usado_em = now() where id = c.id; end if;
  return jsonb_build_object('ok', true, 'nome', v_nome);
end $$;
revoke execute on function public.fn_publico_presenca_assinar(text, text, jsonb) from public;
grant execute on function public.fn_publico_presenca_assinar(text, text, jsonb) to anon, authenticated;

-- ── 8. Painel de Tarefas: resumo da lista, contagem do QR, reabrir/encerrar ──
create or replace function public.fn_presenca_da_tarefa(p_tarefa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l public.presenca_listas; v_conv int; v_assin int; v_conv_assin int;
begin
  if not public.fn_pode_ver_tarefa(p_tarefa) then raise exception 'presenca:sem_acesso'; end if;
  select * into l from public.presenca_listas where tarefa_id = p_tarefa;
  if not found then return null; end if;
  select count(*) into v_assin from public.presenca_assinaturas where lista_id = l.id;
  select count(*), count(*) filter (where exists (select 1 from public.presenca_assinaturas a where a.lista_id = l.id and a.usuario_id = x.uid))
    into v_conv, v_conv_assin from public.fn_presenca_convidados(p_tarefa) x;
  return jsonb_build_object('id', l.id, 'aberta', public.fn_presenca_aberta(l), 'abre_em', l.abre_em,
    'fecha_em', greatest(l.fecha_em, coalesce(l.reaberta_ate, l.fecha_em)), 'encerrada_em', l.encerrada_em,
    'email_enviado_em', l.email_enfileirado_em, 'assinaturas', v_assin, 'convidados', v_conv,
    'convidados_assinaram', v_conv_assin, 'pode_gerir', public.fn_presenca_pode_gerir(l.id),
    'token', case when public.fn_presenca_pode_gerir(l.id) then l.token end);
end $$;

-- convidados = criador + participantes ativos (com e-mail)
create or replace function public.fn_presenca_convidados(p_tarefa uuid)
returns table(uid uuid, nome text, email text) language sql stable security definer set search_path = public as $$
  select u.id, u.nome_completo, u.email from public.usuarios u
  where u.ativo and coalesce(btrim(u.email), '') <> '' and u.id in (
    select criado_por from public.tarefas where id = p_tarefa
    union select usuario_id from public.tarefa_participantes where tarefa_id = p_tarefa);
$$;
revoke execute on function public.fn_presenca_convidados(uuid) from public, anon, authenticated;

create or replace function public.fn_presenca_contagem(p_lista uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when public.fn_presenca_pode_gerir(p_lista)
    then (select count(*)::int from public.presenca_assinaturas where lista_id = p_lista) end;
$$;

create or replace function public.fn_presenca_reabrir(p_lista uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.fn_presenca_pode_gerir(p_lista) then raise exception 'presenca:sem_permissao'; end if;
  if exists (select 1 from public.presenca_listas l join public.tarefas t on t.id = l.tarefa_id
             where l.id = p_lista and t.status = 'cancelada') then raise exception 'presenca:reuniao_cancelada'; end if;
  update public.presenca_listas set encerrada_em = null, encerrada_por = null,
    reaberta_ate = now() + interval '2 hours', atualizado_em = now() where id = p_lista;
end $$;

create or replace function public.fn_presenca_encerrar(p_lista uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.fn_presenca_pode_gerir(p_lista) then raise exception 'presenca:sem_permissao'; end if;
  update public.presenca_listas set encerrada_em = now(), encerrada_por = auth.uid(), reaberta_ate = null,
    atualizado_em = now() where id = p_lista;
end $$;

-- retirada da autorização de imagem (consentimento revogável): a escolha antiga fica na trilha
create or replace function public.fn_presenca_revogar_imagem(p_assinatura uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.presenca_assinaturas;
begin
  select * into a from public.presenca_assinaturas where id = p_assinatura for update;
  if not found or not public.fn_presenca_pode_gerir(a.lista_id) then raise exception 'presenca:sem_permissao'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'presenca:motivo_curto'; end if;
  if not a.imagem_autoriza or a.imagem_revogada_em is not null then raise exception 'presenca:nada_a_retirar'; end if;
  update public.presenca_assinaturas set imagem_revogada_em = now(), imagem_revogada_por = auth.uid(),
    imagem_revogacao_motivo = btrim(p_motivo) where id = p_assinatura;
end $$;

-- detalhe da lista (gerenciador): telefone só para quem administra; sexo/raça por pessoa só coordenação/super_admin
create or replace function public.fn_presenca_detalhe(p_lista uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l public.presenca_listas; t public.tarefas; v_gerir boolean; v_sens boolean;
begin
  select * into l from public.presenca_listas where id = p_lista;
  if not found or not public.fn_pode_ver_tarefa(l.tarefa_id) then raise exception 'presenca:sem_acesso'; end if;
  select * into t from public.tarefas where id = l.tarefa_id;
  v_gerir := public.fn_presenca_pode_gerir(p_lista); v_sens := public.fn_presenca_ve_sensivel();
  return jsonb_build_object(
    'lista', jsonb_build_object('id', l.id, 'aberta', public.fn_presenca_aberta(l), 'abre_em', l.abre_em,
      'fecha_em', greatest(l.fecha_em, coalesce(l.reaberta_ate, l.fecha_em)), 'encerrada_em', l.encerrada_em,
      'email_enviado_em', l.email_enfileirado_em, 'token', case when v_gerir then l.token end),
    'tarefa', jsonb_build_object('id', t.id, 'codigo', t.codigo, 'titulo', t.titulo, 'dados', t.dados_tipo,
      'atividade', (select jsonb_build_object('codigo', a.codigo, 'nome', a.nome_pt) from public.atividades a where a.id = t.atividade_id),
      'organizador', (select nome_completo from public.usuarios where id = t.criado_por)),
    'pode_gerir', v_gerir, 've_sensivel', v_sens,
    'assinaturas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'nome', a.nome, 'email', a.email, 'interno', a.usuario_id is not null, 'origem', a.origem,
        'assinado_em', a.assinado_em,
        'telefone', case when v_gerir then a.telefone end,
        'sexo_genero', case when v_sens then a.sexo_genero end,
        'sexo_genero_outro', case when v_sens then a.sexo_genero_outro end,
        'cor_raca', case when v_sens then a.cor_raca end,
        'imagem', case when not a.imagem_autoriza then 'nao' when a.imagem_revogada_em is not null then 'retirada' else 'sim' end,
        'imagem_revogada_em', a.imagem_revogada_em, 'termo_versao', tm.versao) order by a.assinado_em)
      from public.presenca_assinaturas a join public.presenca_termos_imagem tm on tm.id = a.termo_id
      where a.lista_id = l.id), '[]'::jsonb),
    'convidados', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome,
        'assinou', exists (select 1 from public.presenca_assinaturas a where a.lista_id = l.id and a.usuario_id = x.uid)) order by x.nome)
      from public.fn_presenca_convidados(t.id) x), '[]'::jsonb),
    'totais', (select jsonb_build_object(
        'sexo', coalesce((select jsonb_object_agg(k, n) from (select sexo_genero k, count(*) n from public.presenca_assinaturas where lista_id = l.id group by 1) s), '{}'::jsonb),
        'raca', coalesce((select jsonb_object_agg(k, n) from (select cor_raca k, count(*) n from public.presenca_assinaturas where lista_id = l.id group by 1) s), '{}'::jsonb))));
end $$;

-- gerenciador: reuniões que a pessoa enxerga, com contagens, e os indicadores do período
create or replace function public.fn_presenca_painel(p_inicio date default null, p_fim date default null,
  p_atividade uuid default null, p_formato text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if public.fn_perfil_atual() is null then raise exception 'presenca:sem_acesso'; end if;
  with ls as (
    select l.*, t.codigo, t.titulo, t.status as t_status, t.dados_tipo, t.atividade_id,
           (select count(*) from public.fn_presenca_convidados(t.id)) as n_conv
    from public.presenca_listas l join public.tarefas t on t.id = l.tarefa_id
    where t.ativo and public.fn_pode_ver_tarefa(t.id)
      and (p_inicio is null or l.inicio_reuniao >= (p_inicio::text || ' 00:00-05')::timestamptz)
      and (p_fim is null or l.inicio_reuniao < ((p_fim + 1)::text || ' 00:00-05')::timestamptz)
      and (p_atividade is null or t.atividade_id = p_atividade)
      and (p_formato is null or t.dados_tipo->>'formato' = p_formato)
  ), ass as (
    select a.*, ls.n_conv from public.presenca_assinaturas a join ls on ls.id = a.lista_id
  )
  select jsonb_build_object(
    'reunioes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', ls.id, 'tarefa_id', ls.tarefa_id, 'codigo', ls.codigo, 'titulo', ls.titulo, 'inicio', ls.inicio_reuniao,
        'formato', ls.dados_tipo->>'formato', 'cancelada', ls.t_status = 'cancelada',
        'atividade', (select codigo from public.atividades where id = ls.atividade_id),
        'aberta', public.fn_presenca_aberta((select pl from public.presenca_listas pl where pl.id = ls.id)), 'convidados', ls.n_conv,
        'assinaturas', (select count(*) from ass where ass.lista_id = ls.id),
        'convidados_assinaram', (select count(*) from ass where ass.lista_id = ls.id and ass.usuario_id in (select uid from public.fn_presenca_convidados(ls.tarefa_id))),
        'sem_imagem', (select count(*) from ass where ass.lista_id = ls.id and (not ass.imagem_autoriza or ass.imagem_revogada_em is not null)),
        'pode_gerir', public.fn_presenca_pode_gerir(ls.id)
      ) order by ls.inicio_reuniao desc) from ls), '[]'::jsonb),
    'indicadores', jsonb_build_object(
      'reunioes_realizadas', (select count(*) from ls where ls.t_status <> 'cancelada' and ls.inicio_reuniao <= now()),
      'presencas', (select count(*) from ass),
      'pessoas', (select count(distinct coalesce(usuario_id::text, email)) from ass),
      'internos', (select count(*) from ass where usuario_id is not null),
      'externos', (select count(*) from ass where usuario_id is null),
      'convidados', (select coalesce(sum(n_conv), 0) from ls where ls.t_status <> 'cancelada' and ls.inicio_reuniao <= now()),
      'convidados_assinaram', (select count(*) from ass a join ls on ls.id = a.lista_id
                               where a.usuario_id in (select uid from public.fn_presenca_convidados(ls.tarefa_id))),
      'sem_imagem', (select count(*) from ass where not imagem_autoriza or imagem_revogada_em is not null),
      'sexo', coalesce((select jsonb_object_agg(k, n) from (select sexo_genero k, count(*) n from ass group by 1) s), '{}'::jsonb),
      'raca', coalesce((select jsonb_object_agg(k, n) from (select cor_raca k, count(*) n from ass group by 1) s), '{}'::jsonb),
      'formato', coalesce((select jsonb_object_agg(k, n) from (select coalesce(dados_tipo->>'formato', '—') k, count(*) n from ls group by 1) s), '{}'::jsonb)))
  into v;
  return v;
end $$;

-- exportação (Excel/CSV/A4): uma linha por assinatura; registra quem exportou. Só quem administra cada lista.
create or replace function public.fn_presenca_exportar(p_listas uuid[], p_formato text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_sens boolean := public.fn_presenca_ve_sensivel(); v_rows jsonb; v_n int; x uuid;
begin
  if p_formato not in ('a4', 'xlsx', 'csv') or coalesce(array_length(p_listas, 1), 0) = 0 then raise exception 'presenca:pedido_invalido'; end if;
  foreach x in array p_listas loop
    if not public.fn_presenca_pode_gerir(x) then raise exception 'presenca:sem_permissao'; end if;
  end loop;
  -- o PDF A4 é o documento que circula: nunca leva sexo nem raça
  if p_formato = 'a4' then v_sens := false; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'reuniao', t.codigo || ' — ' || t.titulo, 'data', l.inicio_reuniao, 'formato', t.dados_tipo->>'formato',
      'nome', a.nome, 'email', a.email, 'telefone', a.telefone, 'interno', a.usuario_id is not null, 'origem', a.origem,
      'sexo_genero', case when v_sens then a.sexo_genero end, 'sexo_genero_outro', case when v_sens then a.sexo_genero_outro end,
      'cor_raca', case when v_sens then a.cor_raca end,
      'imagem', case when not a.imagem_autoriza then 'nao' when a.imagem_revogada_em is not null then 'retirada' else 'sim' end,
      'termo_versao', tm.versao, 'assinado_em', a.assinado_em) order by l.inicio_reuniao, a.assinado_em), '[]'::jsonb), count(*)
    into v_rows, v_n
  from public.presenca_assinaturas a join public.presenca_listas l on l.id = a.lista_id
  join public.tarefas t on t.id = l.tarefa_id join public.presenca_termos_imagem tm on tm.id = a.termo_id
  where a.lista_id = any(p_listas);
  insert into public.presenca_exportacoes (usuario_id, formato, listas, n_linhas, com_sensiveis)
  values (auth.uid(), p_formato, p_listas, v_n, v_sens);
  return jsonb_build_object('com_sensiveis', v_sens, 'linhas', v_rows,
    'exportado_por', (select nome_completo from public.usuarios where id = auth.uid()), 'exportado_em', now());
end $$;

-- novo texto do termo (super_admin): vira a versão vigente; as assinaturas antigas seguem com a versão que viram
create or replace function public.fn_presenca_termo_publicar(p_texto text)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not exists (select 1 from public.usuarios where id = auth.uid() and perfil = 'super_admin' and ativo) then
    raise exception 'presenca:sem_permissao';
  end if;
  if length(btrim(coalesce(p_texto, ''))) < 200 then raise exception 'presenca:termo_curto'; end if;
  select coalesce(max(versao), 0) + 1 into v from public.presenca_termos_imagem;
  update public.presenca_termos_imagem set vigente = false where vigente;
  insert into public.presenca_termos_imagem (versao, texto, sha256, vigente, publicado_por)
  values (v, btrim(p_texto), public.fn_presenca_hash(btrim(p_texto)), true, auth.uid());
  return v;
end $$;

create or replace function public.fn_presenca_termos()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.fn_perfil_atual() is null then null else coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'versao', versao, 'texto', texto, 'sha256', sha256, 'vigente', vigente, 'publicado_em', publicado_em,
    'publicado_por', (select nome_completo from public.usuarios u where u.id = publicado_por)) order by versao desc), '[]'::jsonb) end
  from public.presenca_termos_imagem;
$$;

do $$ declare f text; begin
  foreach f in array array[
    'public.fn_presenca_da_tarefa(uuid)', 'public.fn_presenca_contagem(uuid)', 'public.fn_presenca_reabrir(uuid)',
    'public.fn_presenca_encerrar(uuid)', 'public.fn_presenca_revogar_imagem(uuid, text)', 'public.fn_presenca_detalhe(uuid)',
    'public.fn_presenca_painel(date, date, uuid, text)', 'public.fn_presenca_exportar(uuid[], text)',
    'public.fn_presenca_termo_publicar(text)', 'public.fn_presenca_termos()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.fn_presenca_hora(text), public.fn_presenca_hash(text),
  public.fn_presenca_aberta(public.presenca_listas) from public, anon;

-- ── 9. Rotina dos 10 minutos + convites pessoais (Edge Function presenca-emails) ──
-- Põe na fila um e-mail por convidado de cada reunião que começou há 10 min ou mais (até 6 h, para não
-- disparar reuniões antigas). Devolve quantos e-mails estão pendentes (o cron só chama a Edge Function se > 0).
create or replace function public.fn_presenca_rotina()
returns int language plpgsql security definer set search_path = public as $$
declare l record; v_pend int;
begin
  for l in
    select pl.id, pl.tarefa_id from public.presenca_listas pl join public.tarefas t on t.id = pl.tarefa_id
    where pl.email_enfileirado_em is null and pl.encerrada_em is null and t.ativo and t.status <> 'cancelada'
      and pl.inicio_reuniao + interval '10 minutes' <= now() and pl.inicio_reuniao > now() - interval '6 hours'
    for update of pl skip locked
  loop
    insert into public.presenca_notificacoes (lista_id, usuario_id, para_email)
    select l.id, x.uid, x.email from public.fn_presenca_convidados(l.tarefa_id) x
    on conflict (lista_id, usuario_id) do nothing;
    update public.presenca_listas set email_enfileirado_em = now() where id = l.id;
  end loop;
  select count(*) into v_pend from public.presenca_notificacoes where enviado_em is null and tentativas < 5;
  return v_pend;
end $$;
revoke execute on function public.fn_presenca_rotina() from public, anon, authenticated;

-- a Edge Function gera o token do link, guarda aqui só o SHA-256 e recebe os dados do e-mail
create or replace function public.fn_presenca_convite_emitir(p_notificacao uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n public.presenca_notificacoes; t public.tarefas; u public.usuarios; l public.presenca_listas;
begin
  select * into n from public.presenca_notificacoes where id = p_notificacao;
  if not found then return null; end if;
  select * into l from public.presenca_listas where id = n.lista_id;
  select * into t from public.tarefas where id = l.tarefa_id;
  select * into u from public.usuarios where id = n.usuario_id;
  insert into public.presenca_convites (lista_id, usuario_id, token_hash) values (n.lista_id, n.usuario_id, p_token_hash);
  return jsonb_build_object('nome', u.nome_completo, 'titulo', t.titulo, 'codigo', t.codigo, 'inicio', t.dados_tipo->>'inicio',
    'formato', t.dados_tipo->>'formato', 'local', t.dados_tipo->>'local', 'fecha_em', l.fecha_em,
    'ja_assinou', exists (select 1 from public.presenca_assinaturas a where a.lista_id = l.id and a.usuario_id = n.usuario_id));
end $$;
revoke execute on function public.fn_presenca_convite_emitir(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_presenca_convite_emitir(uuid, text) to service_role;
grant execute on function public.fn_presenca_rotina() to service_role;

-- cron: a cada minuto roda a rotina e, se houver e-mail pendente, chama a Edge Function presenca-emails
-- (cabeçalho copiado do job remanejamento-emails, para nenhuma chave ficar escrita no repositório)
do $$
declare v_cmd text;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') and not exists (select 1 from cron.job where jobname = 'presenca-emails') then
    select replace(replace(command, '/functions/v1/assinar-remanejamento', '/functions/v1/presenca-emails'),
                   '{"acao":"drenar"}', '{}')
      into v_cmd from cron.job where jobname = 'remanejamento-emails';
    if v_cmd ~* '^\s*select\s+net\.http_post' then
      perform cron.schedule('presenca-emails', '* * * * *',
        regexp_replace(v_cmd, ';\s*$', '') || ' where public.fn_presenca_rotina() > 0');
    elsif v_cmd is not null then
      perform cron.schedule('presenca-rotina', '* * * * *', 'select public.fn_presenca_rotina()');
      perform cron.schedule('presenca-emails', '*/2 * * * *', v_cmd);
    end if;
  end if;
end $$;

-- ── 10. ROPA (registro do tratamento) ────────────────────────────────────
insert into public.lgpd_tratamentos (codigo, nome, modulo, finalidade, operadores, base_legal, base_legal_detalhe,
  categorias_titulares, categorias_dados, tabelas, compartilhamento, transferencia_internacional, retencao_criterio,
  medidas_seguranca)
values ('TRAT-008', 'Lista de presença das reuniões e autorização de uso de imagem', 'tarefas',
  'Registrar a presença nas reuniões do projeto (prestação de contas aos financiadores), contar reuniões e participantes, '
  || 'produzir indicadores de gênero e raça exigidos pelos financiadores e registrar quem autorizou o uso da própria imagem.',
  'Supabase (banco e funções); Google (Gmail: envio do link da lista); Vercel (hospedagem)',
  'art11_ii_b_politica_publica',
  'Presença, contato, sexo/gênero e cor ou raça (dado sensível, art. 5º, II): art. 7º, III e art. 11, II, b (execução de '
  || 'política pública pela administração — Projeto 218BRA2001), sempre com a opção "Prefere não responder". Uso de imagem: '
  || 'consentimento (art. 7º, I) e direito de imagem (Código Civil, art. 20), com o texto do termo versionado e revogável.',
  array['servidores, técnicos e consultores com conta na plataforma', 'convidados externos das reuniões'],
  array['nome, e-mail e telefone', 'sexo/gênero e cor ou raça autodeclarados (sensível)', 'presença em reunião (data e hora)',
        'autorização de uso de imagem e versão do termo lido'],
  array['presenca_listas', 'presenca_assinaturas', 'presenca_convites', 'presenca_notificacoes', 'presenca_exportacoes', 'presenca_termos_imagem'],
  'Nenhum. Nome e presença aparecem para quem vê a reunião; telefone para quem a administra; sexo e raça por pessoa só '
  || 'para coordenação e super_admin (os demais veem totais). O PDF A4 da lista não leva sexo nem raça.',
  'Supabase/Vercel/Google (art. 33) — pendência geral do DIMA',
  'Até a prestação de contas final do projeto; revisar prazo com o Encarregado.',
  'Escrita só por funções do banco; tabelas sem policy nem grant; link pessoal guardado só como SHA-256; e-mail único por '
  || 'lista; exportações registradas (presenca_exportacoes); trilha de alterações no audit_log.')
on conflict do nothing;
