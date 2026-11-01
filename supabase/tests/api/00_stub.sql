-- Stub mínimo do Supabase + peças do DIMA usadas pela API (NÃO aplicar em produção).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to authenticated, service_role;
create schema cron;
create table cron.job (jobname text primary key, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$
  insert into cron.job values (n, s, c) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint
$$;

create type public.perfil_usuario as enum
  ('super_admin','coordenacao','tecnico','financeiro','consultor_externo','visualizador');
create table public.usuarios (
  id uuid primary key, nome_completo text not null, email text not null,
  perfil public.perfil_usuario not null, ativo boolean not null default true);
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(), usuario_id uuid not null, tipo varchar not null
    check (tipo in ('tarefa_atribuida')),              -- sem 'api_pedido': o registro tem de seguir sem o sino
  titulo text not null, mensagem text, lida boolean not null default false, link text,
  entidade_tipo varchar, entidade_id uuid, criado_em timestamptz default now());
create table public.lgpd_tratamentos (
  id uuid primary key default gen_random_uuid(), codigo text not null unique, nome text not null,
  modulo text, finalidade text not null, controlador text not null default 'SEMA/AC', operadores text,
  base_legal text not null, base_legal_detalhe text not null,
  categorias_titulares text[] not null default '{}', categorias_dados text[] not null default '{}',
  dado_sensivel boolean not null default false, dado_de_menor boolean not null default false,
  tabelas text[] not null default '{}', compartilhamento text not null, transferencia_internacional text,
  retencao_prazo interval, retencao_criterio text not null, medidas_seguranca text, ripd text,
  ativo boolean not null default true);

insert into public.usuarios values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', 'admin@x.gov.br', 'super_admin', true),
  ('00000000-0000-0000-0000-0000000000c1', 'Coord', 'coord@x.gov.br', 'coordenacao', true);
