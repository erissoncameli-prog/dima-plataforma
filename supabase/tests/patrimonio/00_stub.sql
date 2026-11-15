-- Stub mínimo do Supabase + peças do DIMA usadas pelo Patrimônio (NÃO aplicar em produção).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant all on sequences to authenticated, service_role;

create schema storage;
grant usage on schema storage to authenticated, anon;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;

create type public.perfil_usuario as enum ('super_admin','coordenacao','tecnico','financeiro','consultor_externo','visualizador');
create type public.status_tarefa as enum ('a_fazer','em_andamento','em_revisao','bloqueada','concluida','cancelada');
create type public.prioridade_tarefa as enum ('baixa','media','alta','urgente');

create table public.usuarios (id uuid primary key, nome_completo text not null, email text not null,
  perfil public.perfil_usuario not null, ativo boolean not null default true, criado_em timestamptz default now());
create table public.usuario_permissoes (id uuid primary key default gen_random_uuid(), usuario_id uuid not null, modulo text not null,
  ativo boolean not null default true, valido_de timestamptz not null default now() - interval '1 day', valido_ate timestamptz,
  concedido_em timestamptz default now());

create function public.fn_perfil_atual() returns public.perfil_usuario language sql stable security definer set search_path = public as $$
  select perfil from public.usuarios where id = auth.uid() and ativo $$;
create function public.tem_permissao(p_modulo text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuario_permissoes p join public.usuarios u on u.id = p.usuario_id and u.ativo
    where p.usuario_id = auth.uid() and p.modulo = p_modulo and p.ativo and p.valido_de <= now()
      and (p.valido_ate is null or p.valido_ate > now())) $$;

create table public.fornecedores (id uuid primary key default gen_random_uuid(), nome text not null, cpf_cnpj text);
create table public.atividades (id uuid primary key default gen_random_uuid(), codigo varchar not null);
create table public.tdrs (id uuid primary key default gen_random_uuid(), numero varchar not null, atividade_id uuid);
create table public.contratos (id uuid primary key default gen_random_uuid(), numero varchar not null, tipo varchar,
  status text not null default 'vigente', fornecedor_id uuid, atividade_id uuid, tdr_id uuid, objeto_pt text);
create table public.execucao_financeira (id uuid primary key default gen_random_uuid(), contrato_id uuid, numero_produto int,
  situacao text, valor_brl numeric, valor_usd_unesco numeric, dt_pagamento date, criado_em timestamptz default now());
create table public.contratos_produtos (id uuid primary key default gen_random_uuid(), contrato_id uuid not null,
  numero_produto int, descricao text not null, valor_brl numeric, valor_aprovado numeric, situacao text, lancamento_id uuid,
  criado_em timestamptz default now(), atualizado_em timestamptz default now());

create table public.tarefas (id uuid primary key default gen_random_uuid(), titulo text not null, descricao text,
  status public.status_tarefa not null default 'a_fazer', prioridade public.prioridade_tarefa not null default 'media',
  criado_por uuid not null, dt_inicio date, dt_prazo date, dt_conclusao timestamptz, entidade_tipo varchar, entidade_id uuid,
  atividade_id uuid, ativo boolean not null default true, criado_em timestamptz default now(), tipo text not null default 'outras');
create table public.tarefa_participantes (id uuid primary key default gen_random_uuid(), tarefa_id uuid, usuario_id uuid, papel text,
  unique (tarefa_id, usuario_id));
create table public.tarefa_tdrs (tarefa_id uuid, tdr_id uuid, primary key (tarefa_id, tdr_id));
create table public.tarefa_historico (id uuid primary key default gen_random_uuid(), tarefa_id uuid, autor_id uuid, tipo text,
  de text, para text, motivo text, criado_em timestamptz default now());
create table public.tarefa_comentarios (id uuid primary key default gen_random_uuid(), tarefa_id uuid, autor_id uuid, corpo text, origem text);
create table public.notificacoes (id uuid primary key default gen_random_uuid(), usuario_id uuid, tipo text, titulo text, mensagem text,
  link text, entidade_tipo text, entidade_id uuid);
create function public.fn_tarefa_notificar(p_usuarios uuid[], p_tipo text, p_titulo text, p_msg text, p_tarefa_id uuid, p_excluir uuid)
returns void language sql security definer set search_path = public as $$
  insert into notificacoes (usuario_id, tipo, titulo, mensagem, entidade_tipo, entidade_id)
  select u, p_tipo, p_titulo, p_msg, 'tarefa', p_tarefa_id from unnest(p_usuarios) u where u is not null $$;
create function public.fn_lic_fechar_tarefa(p_tarefa uuid, p_status text, p_autor uuid, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update tarefas set status = p_status::status_tarefa, dt_conclusao = now() where id = p_tarefa;
  insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem) values (p_tarefa, p_autor, p_texto, 'painel');
end $$;
-- fornecedor do contrato: liga pelo GUC de teste
create function public.fn_eh_fornecedor_do_contrato(p_contrato_id uuid) returns boolean language sql stable as $$
  select coalesce(current_setting('teste.fornecedor', true), '') = 'sim' $$;

create table public.audit_log (id bigserial primary key, usuario_id uuid, operacao text, tabela text, registro_id text,
  dados_antes jsonb, dados_depois jsonb, campos_alterados jsonb, criado_em timestamptz default now());
create function public.fn_trg_audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (usuario_id, operacao, tabela, registro_id, dados_depois)
  values (auth.uid(), tg_op, tg_table_name, to_jsonb(new) ->> 'id', to_jsonb(new));
  return new;
end $$;

create table public.rem_cargo_titulares (cargo text, usuario_id uuid, vigencia_fim date);
create table public.lgpd_tratamentos (
  id uuid primary key default gen_random_uuid(), codigo text not null unique, nome text not null,
  modulo text, finalidade text not null, controlador text not null default 'SEMA/AC', operadores text,
  base_legal text not null, base_legal_detalhe text not null,
  categorias_titulares text[] not null default '{}', categorias_dados text[] not null default '{}',
  dado_sensivel boolean not null default false, dado_de_menor boolean not null default false,
  tabelas text[] not null default '{}', compartilhamento text not null, transferencia_internacional text,
  retencao_prazo interval, retencao_criterio text not null, medidas_seguranca text, ripd text,
  ativo boolean not null default true);

create function public.fn_cotacao_usd(p_data date)
returns table (data_cotacao date, ptax_venda numeric, ptax_compra numeric, data_pedida date, defasagem_dias integer)
language sql stable as $$ select p_data, 5.0::numeric, 4.99::numeric, p_data, 0 $$;

-- ── Dados ───────────────────────────────────────────────────────────────────
insert into public.usuarios (id, nome_completo, email, perfil, criado_em) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin',      'a@x', 'super_admin',       now() - interval '9 day'),
  ('00000000-0000-0000-0000-0000000000c1', 'Coord',      'c@x', 'coordenacao',       now() - interval '8 day'),
  ('00000000-0000-0000-0000-0000000000d1', 'Gestor',     'g@x', 'tecnico',           now() - interval '7 day'),
  ('00000000-0000-0000-0000-0000000000b1', 'Tecnico',    't@x', 'tecnico',           now() - interval '6 day'),
  ('00000000-0000-0000-0000-0000000000f1', 'Financeiro', 'f@x', 'financeiro',        now() - interval '5 day'),
  ('00000000-0000-0000-0000-0000000000a2', 'Visual',     'v@x', 'visualizador',      now() - interval '4 day'),
  ('00000000-0000-0000-0000-0000000000e1', 'Externo',    'e@x', 'consultor_externo', now() - interval '3 day');
insert into public.usuario_permissoes (usuario_id, modulo) values ('00000000-0000-0000-0000-0000000000d1', 'patrimonio_gestor');

insert into public.fornecedores (id, nome) values ('00000000-0000-0000-0000-00000000f0f0', 'Som Ltda');
insert into public.atividades (id, codigo) values ('00000000-0000-0000-0000-0000000a0214', '2.1.4');
insert into public.tdrs (id, numero, atividade_id) values ('00000000-0000-0000-0000-00000000d006', '2.1.4-006', '00000000-0000-0000-0000-0000000a0214');
insert into public.contratos (id, numero, tipo, status, fornecedor_id, atividade_id, tdr_id, objeto_pt) values
  ('00000000-0000-0000-0000-0000000c0001', '4500574049', 'Equipamentos', 'encerrado', '00000000-0000-0000-0000-00000000f0f0',
   '00000000-0000-0000-0000-0000000a0214', '00000000-0000-0000-0000-00000000d006', 'Sonorização'),
  ('00000000-0000-0000-0000-0000000c0002', '4500550430', 'Consumo', 'vigente', '00000000-0000-0000-0000-00000000f0f0',
   '00000000-0000-0000-0000-0000000a0214', null, 'Coffee break');
insert into public.execucao_financeira (id, contrato_id, numero_produto, situacao, valor_brl, valor_usd_unesco, dt_pagamento) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000c0001', 1, 'pago', 20714.50, 4122.29, '2026-10-27');
insert into public.contratos_produtos (id, contrato_id, numero_produto, descricao, valor_brl, valor_aprovado, situacao) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000c0001', 1, 'Equipamentos de som', 20714.50, 20714.50, 'pago'),
  ('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-0000000c0002', 1, 'Coffee break', 25000, 25000, 'pago');
