-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 01 — estrutura, acesso e RLS
-- Plano: docs/diagnostico/plano.md (§3 banco, §4 acesso).
--
-- Desenho:
--   · diag_questionarios — instrumento versionado (jsonb); versão publicada
--     é imutável (correção = nova versão).
--   · diag_fichas — uma entrevista; respostas em jsonb validadas contra a
--     estrutura da versão aplicada. Sem dado que identifique a família.
--   · diag_fichas_identificacao / diag_moradores_identificacao — nome do
--     entrevistado, GPS e nomes dos moradores em tabelas SEPARADAS: o
--     consultor externo lê a ficha, mas não a identificação, e RLS é por
--     linha, não por coluna (mesma razão de beneficiario_dados_bancarios).
--     Retenção de 2 anos = DELETE nessas tabelas.
--   · Escrita de ficha/moradores/fotos SÓ pela RPC diag_enviar_ficha
--     (migration 02): as tabelas não têm policy de INSERT/UPDATE/DELETE para o
--     cliente, então a validação não pode ser contornada.
--
-- Acesso (decisões de 26/09/2026):
--   aplicar   = tecnico + tem_permissao('diagnostico'), ou super_admin
--               (coordenação NÃO aplica)
--   gerir     = coordenacao / super_admin (validar, devolver, exportar)
--   consultar = consultor_externo + tem_permissao('diagnostico'):
--               lê fichas, NUNCA identificação nem fotos
--   números   = os anteriores + visualizador, via fn_diag_agregados (03)
--   financeiro: sem acesso.
-- tem_permissao() não confere usuarios.ativo — por isso as funções abaixo
-- conferem, e todas as policies passam por elas (regra num lugar só).
-- ════════════════════════════════════════════════════════════════════════

-- ── Funções de acesso ───────────────────────────────────────────────────
create or replace function public.fn_diag_perfil_ativo()
returns public.perfil_usuario language sql stable security definer
set search_path = public as $$
  select perfil from public.usuarios where id = auth.uid() and ativo
$$;

create or replace function public.fn_diag_pode_aplicar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    fn_diag_perfil_ativo() = 'super_admin'
    or (fn_diag_perfil_ativo() = 'tecnico' and tem_permissao('diagnostico')),
  false)
$$;

create or replace function public.fn_diag_pode_gerir()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(fn_diag_perfil_ativo() in ('super_admin','coordenacao'), false)
$$;

create or replace function public.fn_diag_pode_consultar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(fn_diag_perfil_ativo() = 'consultor_externo' and tem_permissao('diagnostico'), false)
$$;

create or replace function public.fn_diag_pode_ver_numeros()
returns boolean language sql stable security definer set search_path = public as $$
  select fn_diag_pode_aplicar() or fn_diag_pode_gerir() or fn_diag_pode_consultar()
         or coalesce(fn_diag_perfil_ativo() = 'visualizador', false)
$$;

-- ── Catálogos ───────────────────────────────────────────────────────────
create table if not exists public.diag_municipios (
  ibge   integer primary key,
  nome   text not null unique,
  sigla  char(3) not null unique      -- entra no código da ficha gerado no aparelho
);

-- 22 municípios do Acre (código IBGE de 7 dígitos)
insert into public.diag_municipios (ibge, nome, sigla) values
  (1200013,'Acrelândia','ACR'), (1200054,'Assis Brasil','ASB'), (1200104,'Brasiléia','BRA'),
  (1200138,'Bujari','BUJ'), (1200179,'Capixaba','CAP'), (1200203,'Cruzeiro do Sul','CZS'),
  (1200252,'Epitaciolândia','EPI'), (1200302,'Feijó','FEI'), (1200328,'Jordão','JOR'),
  (1200336,'Mâncio Lima','MLI'), (1200344,'Manoel Urbano','MUR'), (1200351,'Marechal Thaumaturgo','MTH'),
  (1200385,'Plácido de Castro','PCA'), (1200393,'Porto Walter','PWT'), (1200401,'Rio Branco','RBR'),
  (1200427,'Rodrigues Alves','RAL'), (1200435,'Santa Rosa do Purus','SRP'), (1200450,'Senador Guiomard','SGU'),
  (1200500,'Sena Madureira','SMD'), (1200609,'Tarauacá','TRC'), (1200708,'Xapuri','XAP'),
  (1200807,'Porto Acre','PAC')
on conflict (ibge) do nothing;

create table if not exists public.diag_comunidades (
  id              uuid primary key default gen_random_uuid(),
  municipio_ibge  integer not null references public.diag_municipios(ibge),
  nome            text not null check (length(btrim(nome)) between 2 and 150),
  ativo           boolean not null default true,
  criado_por      uuid references public.usuarios(id) default auth.uid(),
  criado_em       timestamptz not null default now()
);
create unique index if not exists uq_diag_comunidade_nome
  on public.diag_comunidades (municipio_ibge, lower(btrim(nome)));

-- ── Questionário versionado ─────────────────────────────────────────────
-- convert_to() é só STABLE (depende do encoding); o banco é UTF8 fixo, então
-- o wrapper pode ser IMMUTABLE e servir à coluna gerada.
create or replace function public.fn_diag_sha256(p text)
returns text language sql immutable strict set search_path = public as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

create table if not exists public.diag_questionarios (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null,
  versao              integer not null check (versao >= 1),
  titulo              text not null,
  estrutura           jsonb not null,
  aviso_entrevistado  text not null,
  -- prova de qual versão foi aplicada; não pode divergir do conteúdo
  hash_sha256         text generated always as
                        (public.fn_diag_sha256(estrutura::text || aviso_entrevistado)) stored,
  status              text not null default 'rascunho'
                        check (status in ('rascunho','publicado','arquivado')),
  publicado_em        timestamptz,
  publicado_por       uuid references public.usuarios(id),
  criado_em           timestamptz not null default now(),
  unique (codigo, versao)
);

create or replace function public.fn_diag_questionario_guarda() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'diag:questionario_publicado: versão publicada não pode ser apagada; arquive-a';
    end if;
    return old;
  end if;
  if old.status <> 'rascunho' then
    if new.estrutura is distinct from old.estrutura
       or new.aviso_entrevistado is distinct from old.aviso_entrevistado
       or new.codigo <> old.codigo or new.versao <> old.versao then
      raise exception 'diag:questionario_publicado: versão publicada é imutável; crie uma nova versão';
    end if;
    if old.status = 'arquivado' and new.status <> 'arquivado' then
      raise exception 'diag:questionario_arquivado: versão arquivada não volta a ser usada';
    end if;
  end if;
  if new.status = 'publicado' and old.status = 'rascunho' then
    new.publicado_em := now();
    new.publicado_por := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_diag_questionario_guarda on public.diag_questionarios;
create trigger trg_diag_questionario_guarda before update or delete on public.diag_questionarios
  for each row execute function public.fn_diag_questionario_guarda();

-- ── Fichas ──────────────────────────────────────────────────────────────
create table if not exists public.diag_fichas (
  id                 uuid primary key default gen_random_uuid(),
  -- idempotência da fila: UNIQUE CONSTRAINT (não índice parcial — o
  -- ON CONFLICT do PostgREST não infere índice parcial; achado do SIGUC).
  uuid_cliente       uuid not null constraint uq_diag_fichas_uuid_cliente unique,
  codigo             text not null constraint uq_diag_fichas_codigo unique
                       check (length(codigo) between 5 and 40),
  questionario_id    uuid not null references public.diag_questionarios(id),
  municipio_ibge     integer not null references public.diag_municipios(ibge),
  comunidade_id      uuid references public.diag_comunidades(id),
  comunidade_nova    text check (comunidade_nova is null or length(btrim(comunidade_nova)) between 2 and 150),
  dt_entrevista      date not null,
  iniciada_em        timestamptz,
  finalizada_em      timestamptz not null,
  entrevistador_id   uuid not null references public.usuarios(id),
  aviso_lido         boolean not null,
  aceitou_participar boolean not null,
  respostas          jsonb not null default '{}'::jsonb check (jsonb_typeof(respostas) = 'object'),
  alertas            jsonb not null default '[]'::jsonb check (jsonb_typeof(alertas) = 'array'),
  status             text not null default 'enviada'
                       check (status in ('enviada','devolvida','validada','descartada')),
  motivo_devolucao   text,
  validado_por       uuid references public.usuarios(id),
  validado_em        timestamptz,
  descartado_em      timestamptz,
  usou_carencia      boolean not null default false,
  identificacao_apagada_em timestamptz,
  app_versao         text,
  dispositivo_id     text,
  enviado_em         timestamptz not null default now(),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint ck_diag_ficha_comunidade check (comunidade_id is not null or comunidade_nova is not null),
  constraint ck_diag_ficha_recusa check (aceitou_participar or respostas = '{}'::jsonb),
  constraint ck_diag_ficha_validada check (status <> 'validada' or validado_em is not null),
  constraint ck_diag_ficha_devolvida check (status <> 'devolvida' or motivo_devolucao is not null)
);
create index if not exists idx_diag_fichas_entrevistador on public.diag_fichas (entrevistador_id);
create index if not exists idx_diag_fichas_comunidade on public.diag_fichas (comunidade_id);
create index if not exists idx_diag_fichas_status on public.diag_fichas (status);

create table if not exists public.diag_fichas_identificacao (
  id                uuid primary key default gen_random_uuid(),
  ficha_id          uuid not null unique references public.diag_fichas(id) on delete cascade,
  entrevistado_nome text check (entrevistado_nome is null or length(btrim(entrevistado_nome)) between 1 and 150),
  lat               numeric(9,6) check (lat between -90 and 90),
  lon               numeric(9,6) check (lon between -180 and 180),
  gps_precisao_m    numeric(8,1),
  gps_em            timestamptz,
  obs_localizacao   text check (obs_localizacao is null or length(obs_localizacao) <= 300),
  constraint ck_diag_ident_nao_vazia check (
    entrevistado_nome is not null or lat is not null or obs_localizacao is not null)
);

create table if not exists public.diag_moradores (
  id                   uuid primary key default gen_random_uuid(),
  ficha_id             uuid not null references public.diag_fichas(id) on delete cascade,
  ordem                smallint not null check (ordem between 1 and 30),
  idade                smallint check (idade between 0 and 120),
  sexo_genero          text,
  sexo_genero_outro    text check (sexo_genero_outro is null or length(sexo_genero_outro) <= 120),
  parentesco           text check (parentesco is null or length(parentesco) <= 80),
  escolaridade         text check (escolaridade is null or length(escolaridade) <= 80),
  atividade_principal  text check (atividade_principal is null or length(atividade_principal) <= 80),
  e_entrevistado       boolean not null default false,
  unique (ficha_id, ordem)
);
create unique index if not exists uq_diag_morador_entrevistado
  on public.diag_moradores (ficha_id) where e_entrevistado;

create table if not exists public.diag_moradores_identificacao (
  id          uuid primary key default gen_random_uuid(),
  morador_id  uuid not null unique references public.diag_moradores(id) on delete cascade,
  nome        text not null check (length(btrim(nome)) between 1 and 150)
);

create table if not exists public.diag_fotos (
  id              uuid primary key default gen_random_uuid(),
  ficha_id        uuid not null references public.diag_fichas(id) on delete cascade,
  uuid_cliente    uuid not null constraint uq_diag_fotos_uuid_cliente unique,
  tema            text not null check (tema in ('moradia','agua','esgoto','lixo','producao','acesso','ambiental','outro')),
  pergunta_chave  text,
  legenda         text check (legenda is null or length(legenda) <= 200),
  -- formato /object/public/<bucket>/<path> — só portador do caminho (regra de Storage do DIMA)
  arquivo_url     text not null,
  tirada_em       timestamptz,
  criado_por      uuid references public.usuarios(id),
  criado_em       timestamptz not null default now()
);
create index if not exists idx_diag_fotos_ficha on public.diag_fotos (ficha_id);

create table if not exists public.diag_fichas_historico (
  id           bigserial primary key,
  ficha_id     uuid not null references public.diag_fichas(id) on delete cascade,
  status_de    text,
  status_para  text not null,
  motivo       text,
  por          uuid references public.usuarios(id),
  em           timestamptz not null default now()
);
create index if not exists idx_diag_hist_ficha on public.diag_fichas_historico (ficha_id);

create table if not exists public.diag_sugestoes_ocultas (
  chave             text not null,
  texto_normalizado text not null,
  ocultado_por      uuid references public.usuarios(id) default auth.uid(),
  ocultado_em       timestamptz not null default now(),
  primary key (chave, texto_normalizado)
);

-- fila de arquivos a remover do Storage (retenção e remoção de foto).
-- Apagar arquivo exige a API do Storage; a fila é drenada por Edge Function.
create table if not exists public.diag_expurgo_arquivos (
  id           bigserial primary key,
  bucket       text not null,
  caminho      text not null,
  motivo       text not null,
  agendado_em  timestamptz not null default now(),
  removido_em  timestamptz
);

-- ── Leitura por ficha (usada nas policies de tabelas filhas) ────────────
create or replace function public.fn_diag_pode_ver_ficha(p_ficha_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.diag_fichas f
    where f.id = p_ficha_id
      and ( fn_diag_pode_gerir()
            or fn_diag_pode_consultar()
            or (f.entrevistador_id = auth.uid() and fn_diag_pode_aplicar()) ))
$$;

-- identificação e fotos: NUNCA o consultor externo
create or replace function public.fn_diag_pode_ver_identificacao(p_ficha_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.diag_fichas f
    where f.id = p_ficha_id
      and ( fn_diag_pode_gerir()
            or (f.entrevistador_id = auth.uid() and fn_diag_pode_aplicar()) ))
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['diag_municipios','diag_comunidades','diag_questionarios','diag_fichas',
    'diag_fichas_identificacao','diag_moradores','diag_moradores_identificacao','diag_fotos',
    'diag_fichas_historico','diag_sugestoes_ocultas','diag_expurgo_arquivos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
grant insert, update on public.diag_comunidades, public.diag_questionarios to authenticated;
grant delete on public.diag_questionarios to authenticated;
grant insert, delete on public.diag_sugestoes_ocultas to authenticated;
grant delete on public.diag_fotos to authenticated;

create policy diag_municipios_select on public.diag_municipios for select to authenticated
  using (fn_diag_pode_ver_numeros());

create policy diag_comunidades_select on public.diag_comunidades for select to authenticated
  using (fn_diag_pode_ver_numeros());
create policy diag_comunidades_insert on public.diag_comunidades for insert to authenticated
  with check (fn_diag_pode_gerir());
create policy diag_comunidades_update on public.diag_comunidades for update to authenticated
  using (fn_diag_pode_gerir()) with check (fn_diag_pode_gerir());

create policy diag_quest_select on public.diag_questionarios for select to authenticated
  using (fn_diag_pode_ver_numeros());
create policy diag_quest_insert on public.diag_questionarios for insert to authenticated
  with check (fn_diag_pode_gerir() and status = 'rascunho');
create policy diag_quest_update on public.diag_questionarios for update to authenticated
  using (fn_diag_pode_gerir()) with check (fn_diag_pode_gerir());
create policy diag_quest_delete on public.diag_questionarios for delete to authenticated
  using (fn_diag_pode_gerir() and status = 'rascunho');

create policy diag_fichas_select on public.diag_fichas for select to authenticated
  using ( fn_diag_pode_gerir() or fn_diag_pode_consultar()
          or (entrevistador_id = auth.uid() and fn_diag_pode_aplicar()) );

create policy diag_ident_select on public.diag_fichas_identificacao for select to authenticated
  using (fn_diag_pode_ver_identificacao(ficha_id));

create policy diag_moradores_select on public.diag_moradores for select to authenticated
  using (fn_diag_pode_ver_ficha(ficha_id));

create policy diag_mor_ident_select on public.diag_moradores_identificacao for select to authenticated
  using (exists (select 1 from public.diag_moradores m
                 where m.id = morador_id and fn_diag_pode_ver_identificacao(m.ficha_id)));

create policy diag_fotos_select on public.diag_fotos for select to authenticated
  using (fn_diag_pode_ver_identificacao(ficha_id));
-- coordenação apaga foto com pessoa (o arquivo vai para diag_expurgo_arquivos via trigger)
create policy diag_fotos_delete on public.diag_fotos for delete to authenticated
  using (fn_diag_pode_gerir());

create policy diag_hist_select on public.diag_fichas_historico for select to authenticated
  using (fn_diag_pode_ver_ficha(ficha_id));

create policy diag_sug_ocultas_select on public.diag_sugestoes_ocultas for select to authenticated
  using (fn_diag_pode_gerir());
create policy diag_sug_ocultas_insert on public.diag_sugestoes_ocultas for insert to authenticated
  with check (fn_diag_pode_gerir());
create policy diag_sug_ocultas_delete on public.diag_sugestoes_ocultas for delete to authenticated
  using (fn_diag_pode_gerir());

create policy diag_expurgo_select on public.diag_expurgo_arquivos for select to authenticated
  using (fn_diag_pode_gerir());

-- ── Triggers auxiliares ─────────────────────────────────────────────────
create or replace function public.fn_diag_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.atualizado_em := now(); return new; end $$;

drop trigger if exists trg_diag_fichas_touch on public.diag_fichas;
create trigger trg_diag_fichas_touch before update on public.diag_fichas
  for each row execute function public.fn_diag_touch();

-- histórico de status gravado pelo BANCO (vale até para UPDATE direto)
create or replace function public.fn_diag_ficha_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into diag_fichas_historico (ficha_id, status_de, status_para, por)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into diag_fichas_historico (ficha_id, status_de, status_para, motivo, por)
    values (new.id, old.status, new.status,
            case when new.status = 'devolvida' then new.motivo_devolucao
                 else current_setting('diag.motivo', true) end,
            auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_diag_ficha_historico on public.diag_fichas;
create trigger trg_diag_ficha_historico after insert or update on public.diag_fichas
  for each row execute function public.fn_diag_ficha_historico();

-- foto removida (pela coordenação ou pela retenção) → arquivo entra na fila
create or replace function public.fn_diag_foto_expurgo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into diag_expurgo_arquivos (bucket, caminho, motivo)
  values ('diagnostico-fotos',
          regexp_replace(old.arquivo_url, '^.*/diagnostico-fotos/', ''),
          coalesce(nullif(current_setting('diag.motivo', true), ''), 'foto removida'));
  return old;
end $$;

drop trigger if exists trg_diag_foto_expurgo on public.diag_fotos;
create trigger trg_diag_foto_expurgo after delete on public.diag_fotos
  for each row execute function public.fn_diag_foto_expurgo();

-- auditoria redigida: sabe-se QUEM mudou O QUÊ, nunca o valor
-- (respostas incluem dado sensível; identificação é dado pessoal)
drop trigger if exists trg_audit_diag_fichas on public.diag_fichas;
create trigger trg_audit_diag_fichas after insert or update or delete on public.diag_fichas
  for each row execute function public.fn_trg_audit('redigir');
drop trigger if exists trg_audit_diag_ident on public.diag_fichas_identificacao;
create trigger trg_audit_diag_ident after insert or update or delete on public.diag_fichas_identificacao
  for each row execute function public.fn_trg_audit('redigir');
drop trigger if exists trg_audit_diag_mor_ident on public.diag_moradores_identificacao;
create trigger trg_audit_diag_mor_ident after insert or update or delete on public.diag_moradores_identificacao
  for each row execute function public.fn_trg_audit('redigir');
drop trigger if exists trg_audit_diag_fotos on public.diag_fotos;
create trigger trg_audit_diag_fotos after insert or update or delete on public.diag_fotos
  for each row execute function public.fn_trg_audit('redigir');
drop trigger if exists trg_audit_diag_questionarios on public.diag_questionarios;
create trigger trg_audit_diag_questionarios after insert or update or delete on public.diag_questionarios
  for each row execute function public.fn_trg_audit('redigir');

-- ── Privilégios de função ──────────────────────────────────────────────
-- Em produção funções novas nascem executáveis por anon (pg_default_acl).
revoke execute on function public.fn_diag_sha256(text) from public, anon;
grant execute on function public.fn_diag_sha256(text) to authenticated;
-- sequências das tabelas de log: só as funções do banco escrevem
revoke all on sequence public.diag_fichas_historico_id_seq, public.diag_expurgo_arquivos_id_seq from anon, authenticated;
revoke execute on function public.fn_diag_perfil_ativo(), public.fn_diag_pode_aplicar(),
  public.fn_diag_pode_gerir(), public.fn_diag_pode_consultar(), public.fn_diag_pode_ver_numeros(),
  public.fn_diag_pode_ver_ficha(uuid), public.fn_diag_pode_ver_identificacao(uuid)
  from public, anon;
grant execute on function public.fn_diag_perfil_ativo(), public.fn_diag_pode_aplicar(),
  public.fn_diag_pode_gerir(), public.fn_diag_pode_consultar(), public.fn_diag_pode_ver_numeros(),
  public.fn_diag_pode_ver_ficha(uuid), public.fn_diag_pode_ver_identificacao(uuid)
  to authenticated;
revoke execute on function public.fn_diag_questionario_guarda(), public.fn_diag_touch(),
  public.fn_diag_ficha_historico(), public.fn_diag_foto_expurgo()
  from public, anon, authenticated;

comment on column public.usuario_permissoes.modulo is
  'ID do módulo: dashboard | atividades | tdrs | matriz | fornecedores | contratos | produtos | financeiro | viagens | repositorio | usuarios | relatorios_* | dashboard_cobertura | diagnostico';
