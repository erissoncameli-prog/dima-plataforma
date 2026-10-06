-- Stub mínimo do Supabase + peças do DIMA usadas pelo Pulso (NÃO aplicar em produção).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- produção (conferido 06/10/2026): funções novas nascem executáveis por anon e authenticated
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to authenticated, service_role;

create type public.perfil_usuario as enum
  ('super_admin','coordenacao','tecnico','financeiro','consultor_externo','visualizador');
create table public.usuarios (
  id uuid primary key, nome_completo text not null, email text not null,
  perfil public.perfil_usuario not null, ativo boolean not null default true);
create table public.lgpd_tratamentos (
  id uuid primary key default gen_random_uuid(), codigo text not null unique, nome text not null,
  modulo text, finalidade text not null, controlador text not null default 'SEMA/AC', operadores text,
  base_legal text not null, base_legal_detalhe text not null,
  categorias_titulares text[] not null default '{}', categorias_dados text[] not null default '{}',
  dado_sensivel boolean not null default false, dado_de_menor boolean not null default false,
  tabelas text[] not null default '{}', compartilhamento text not null, transferencia_internacional text,
  retencao_prazo interval, retencao_criterio text not null, medidas_seguranca text, ripd text,
  ativo boolean not null default true);
