-- ════════════════════════════════════════════════════════════════════════
-- Stub mínimo do Supabase para testar as migrations do Diagnóstico em um
-- Postgres local (NÃO aplicar em produção). Reproduz só o que as
-- migrations usam: papéis, auth.uid(), extensions, storage, cron e as
-- peças do DIMA já existentes em produção (conferidas via execute_sql em
-- 26/09/2026: tem_permissao, fn_perfil_atual, fn_trg_audit,
-- fn_redigir_jsonb, audit_log, usuarios, usuario_permissoes).
-- ════════════════════════════════════════════════════════════════════════

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema extensions;
create extension pgcrypto schema extensions;

-- auth.uid() lê o "sub" simulado do JWT (set local request.jwt.claim.sub)
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;

-- storage
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid default auth.uid(), created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1]
$$;
grant usage on schema storage to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

-- pg_cron (só registra)
create schema cron;
create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(p_nome text, p_sched text, p_cmd text) returns bigint
language sql as $$
  insert into cron.job(jobname, schedule, command) values (p_nome, p_sched, p_cmd)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid::bigint
$$;
create function cron.unschedule(p_nome text) returns boolean language sql as $$
  delete from cron.job where jobname = p_nome returning true
$$;

-- ── Peças do DIMA que já existem em produção ─────────────────────────
grant usage on schema public to anon, authenticated, service_role;

create type public.perfil_usuario as enum
  ('super_admin','coordenacao','tecnico','financeiro','consultor_externo','visualizador');
create type public.operacao_audit as enum ('INSERT','UPDATE','DELETE');

create table public.usuarios (
  id uuid primary key, nome_completo text not null, email text not null,
  perfil public.perfil_usuario not null, ativo boolean not null default true
);
alter table public.usuarios enable row level security;
create policy usuarios_select on public.usuarios for select to authenticated using (true);
grant select on public.usuarios to authenticated;

create table public.usuario_permissoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id),
  modulo text not null, ativo boolean not null default true,
  valido_de timestamptz not null default now(), valido_ate timestamptz,
  concedido_por uuid, unique (usuario_id, modulo)
);

-- em produção: uperm_self_select (cada um lê as próprias permissões)
alter table public.usuario_permissoes enable row level security;
create policy uperm_self_select on public.usuario_permissoes for select to authenticated
  using (usuario_id = auth.uid());
grant select on public.usuario_permissoes to authenticated;

create function public.tem_permissao(p_modulo text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.usuario_permissoes
    where usuario_id = auth.uid() and modulo = p_modulo and ativo = true
      and valido_de <= now() and (valido_ate is null or valido_ate > now()))
$$;

create function public.fn_perfil_atual() returns public.perfil_usuario
language sql stable security definer as $$
  select perfil from public.usuarios where id = auth.uid()
$$;

create table public.audit_log (
  id bigserial primary key, usuario_id uuid, operacao public.operacao_audit,
  tabela text, registro_id text, dados_antes jsonb, dados_depois jsonb,
  campos_alterados jsonb, ip_address inet, user_agent text,
  criado_em timestamptz default now()
);

create function public.fn_redigir_jsonb(p jsonb) returns jsonb language sql immutable as $$
  select case when p is null then null else (
    select jsonb_object_agg(k, to_jsonb('[redigido]'::text)) from jsonb_object_keys(p) as k) end
$$;

create function public.fn_trg_audit() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_antes jsonb; v_depois jsonb; v_campos jsonb;
  v_redigir boolean := (tg_nargs > 0 and tg_argv[0] = 'redigir');
begin
  if tg_op = 'DELETE' then v_antes := to_jsonb(old);
  elsif tg_op = 'INSERT' then v_depois := to_jsonb(new);
  else v_antes := to_jsonb(old); v_depois := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, v_depois -> key) into v_campos
      from jsonb_object_keys(v_depois) as key
     where (v_depois -> key) is distinct from (v_antes -> key) and key not in ('atualizado_em');
    if v_campos is null or v_campos = '{}'::jsonb then return new; end if;
  end if;
  if v_redigir then
    v_antes := fn_redigir_jsonb(v_antes); v_depois := fn_redigir_jsonb(v_depois);
    v_campos := fn_redigir_jsonb(v_campos);
  end if;
  insert into public.audit_log (usuario_id, operacao, tabela, registro_id, dados_antes, dados_depois, campos_alterados)
  values (auth.uid(), tg_op::operacao_audit, tg_table_name,
          coalesce(to_jsonb(coalesce(new, old)) ->> 'id', to_jsonb(coalesce(new, old)) ->> 'beneficiario_id'),
          v_antes, v_depois, v_campos);
  return coalesce(new, old);
end $$;

-- Em produção, funções novas nascem com EXECUTE para anon/authenticated
-- (pg_default_acl do papel postgres). Reproduzido aqui para que o teste
-- pegue função esquecida sem REVOKE.
alter default privileges in schema public grant execute on functions to anon, authenticated;
alter default privileges in schema public grant all on tables to authenticated, service_role;
