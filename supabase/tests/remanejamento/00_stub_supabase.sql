-- ════════════════════════════════════════════════════════════════════════
-- Stub mínimo do Supabase + peças do DIMA usadas pelo remanejamento, para
-- testar as migrations rem_* num Postgres LOCAL (NÃO aplicar em produção).
-- Conferido contra produção via execute_sql em 03/10/2026: colunas de
-- atividades/tdrs/contratos/contrato_encerramentos/execucao_financeira,
-- policies de contrato_encerramentos, vw_saldo_atividade (definição e
-- GRANTs — inclusive o UPDATE indevido que a rem_00 revoga),
-- fn_trg_verificar_saldo e fn_estornar_economia_tdr.
-- ════════════════════════════════════════════════════════════════════════

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema extensions;
create extension pgcrypto schema extensions;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Em produção, objetos novos nascem com privilégios para authenticated
-- (pg_default_acl do papel postgres) — reproduzido para pegar REVOKE esquecido.
alter default privileges in schema public grant execute on functions to anon, authenticated;
alter default privileges in schema public grant all on tables to authenticated, service_role;

create type public.perfil_usuario as enum
  ('super_admin','coordenacao','tecnico','financeiro','consultor_externo','visualizador');
create type public.operacao_audit as enum ('INSERT','UPDATE','DELETE');
create type public.status_tdr as enum ('rascunho','revisao_interna','ajustes','enviado_unesco',
  'retorno_unesco','aprovado','cancelado','submetido','pendente_correcao','em_avaliacao',
  'em_revisao_unesco','em_licitacao','contratado');
create type public.situacao_financeiro as enum ('pago','a_pagar','cancelado');
create type public.status_contrato as enum ('vigente','encerrado','suspenso');

create table public.usuarios (
  id uuid primary key, nome_completo text not null, email text not null,
  perfil public.perfil_usuario not null, ativo boolean not null default true
);
alter table public.usuarios enable row level security;
create policy usuarios_select on public.usuarios for select to authenticated using (true);

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
create function public.fn_trg_audit() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_antes jsonb; v_depois jsonb; v_campos jsonb;
begin
  if tg_op = 'DELETE' then v_antes := to_jsonb(old);
  elsif tg_op = 'INSERT' then v_depois := to_jsonb(new);
  else v_antes := to_jsonb(old); v_depois := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, v_depois -> key) into v_campos
      from jsonb_object_keys(v_depois) as key
     where (v_depois -> key) is distinct from (v_antes -> key) and key not in ('atualizado_em');
    if v_campos is null then return new; end if;
  end if;
  insert into public.audit_log (usuario_id, operacao, tabela, registro_id, dados_antes, dados_depois, campos_alterados)
  values (auth.uid(), tg_op::operacao_audit, tg_table_name,
          to_jsonb(coalesce(new, old)) ->> 'id', v_antes, v_depois, v_campos);
  return coalesce(new, old);
end $$;

create table public.resultados (
  id uuid primary key default gen_random_uuid(), codigo varchar not null,
  nome_pt text, orcamento_usd numeric, ativo boolean default true, criado_em timestamptz default now()
);

create table public.atividades (
  id uuid primary key default gen_random_uuid(),
  resultado_id uuid not null references public.resultados(id),
  codigo varchar not null, nome_pt text,
  orcamento_usd numeric(14,2) not null default 0,
  ano1_usd numeric, ano2_usd numeric,
  responsavel_id uuid references public.usuarios(id), substituto_id uuid,
  ativo boolean not null default true,
  criado_em timestamptz default now(), atualizado_em timestamptz default now()
);
alter table public.atividades enable row level security;
create policy atividades_select_all on public.atividades for select using (auth.uid() is not null);
create policy atividades_write on public.atividades for all
  using ((select fn_perfil_atual()) = any (array['super_admin','coordenacao','tecnico']::perfil_usuario[]));

create table public.tdrs (
  id uuid primary key default gen_random_uuid(),
  atividade_id uuid not null references public.atividades(id),
  numero varchar not null, status public.status_tdr not null default 'rascunho',
  valor_brl numeric, valor_usd numeric, cotacao_registro numeric,
  criado_por uuid, criado_em timestamptz default now(), atualizado_em timestamptz default now()
);
alter table public.tdrs enable row level security;
create policy tdrs_all on public.tdrs for all using (auth.uid() is not null);

-- Trava existente em produção (não alterada pelas rem_*)
create function public.fn_trg_verificar_saldo() returns trigger language plpgsql as $$
declare v_orcamento numeric; v_comprometido numeric;
begin
  if tg_op = 'UPDATE' then
    if (coalesce(new.valor_usd,0) <= coalesce(old.valor_usd,0)) and (new.atividade_id is not distinct from old.atividade_id) then
      return new;
    end if;
  end if;
  select orcamento_usd into v_orcamento from public.atividades where id = new.atividade_id;
  select coalesce(sum(valor_usd),0) into v_comprometido from public.tdrs
   where atividade_id = new.atividade_id and status not in ('cancelado','rascunho')
     and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if (v_comprometido + coalesce(new.valor_usd,0)) > v_orcamento then
    raise exception 'SALDO_INSUFICIENTE';
  end if;
  return new;
end $$;
create trigger trg_tdr_saldo before insert or update on public.tdrs
  for each row execute function public.fn_trg_verificar_saldo();

create table public.contratos (
  id uuid primary key default gen_random_uuid(), numero varchar not null,
  tdr_id uuid references public.tdrs(id), fornecedor_id uuid,
  atividade_id uuid references public.atividades(id),
  valor_total_brl numeric, status public.status_contrato default 'vigente',
  contrato_assinado_url text, valor_utilizado_brl numeric default 0,
  criado_em timestamptz default now()
);

create table public.contratos_produtos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id),
  numero_produto integer, descricao text not null, valor_brl numeric,
  situacao text default 'pendente'
);

create table public.contrato_encerramentos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id),
  atividade_id uuid references public.atividades(id),
  valor_liberado_brl numeric not null default 0,
  valor_liberado_usd numeric,
  motivo text not null,
  produtos_afetados jsonb not null default '[]'::jsonb,
  autorizado_por uuid references public.usuarios(id),
  criado_em timestamptz not null default now(),
  tipo text not null default 'encerramento_contrato'
    check (tipo = any (array['encerramento_contrato','economia_contratacao'])),
  tdr_id uuid references public.tdrs(id) on delete set null,
  status text not null default 'ativo' check (status = any (array['ativo','revertido'])),
  revertido_por uuid references public.usuarios(id), revertido_em timestamptz, motivo_reversao text
);
alter table public.contrato_encerramentos enable row level security;
create policy ce_readonly on public.contrato_encerramentos for select using (auth.uid() is not null);
create policy ce_write on public.contrato_encerramentos for insert
  with check (fn_perfil_atual() = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[]));

create table public.execucao_financeira (
  id uuid primary key default gen_random_uuid(),
  atividade_id uuid not null references public.atividades(id),
  tdr_id uuid references public.tdrs(id), contrato_id uuid references public.contratos(id),
  descricao text, valor_brl numeric not null, valor_usd numeric,
  situacao public.situacao_financeiro not null default 'a_pagar'
);

create function public.fn_estornar_economia_tdr(p_encerramento_id uuid, p_motivo text)
returns public.contrato_encerramentos language plpgsql security definer set search_path to 'public' as $$
declare v_row public.contrato_encerramentos;
begin
  if fn_perfil_atual() is null or fn_perfil_atual() <> all (array['super_admin','coordenacao']::perfil_usuario[]) then
    raise exception 'Sem permissão';
  end if;
  select * into v_row from public.contrato_encerramentos where id = p_encerramento_id;
  if v_row.tipo <> 'economia_contratacao' then raise exception 'tipo'; end if;
  if v_row.status <> 'ativo' then raise exception 'já estornada'; end if;
  update public.contrato_encerramentos
     set status = 'revertido', revertido_por = auth.uid(), revertido_em = now(), motivo_reversao = btrim(p_motivo)
   where id = p_encerramento_id returning * into v_row;
  return v_row;
end $$;

-- Definição de produção (owner = postgres, sem security_invoker) e GRANTs
-- de produção, inclusive escrita — é o que a rem_00 corrige.
create view public.vw_saldo_atividade as
 select id, codigo, nome_pt, orcamento_usd,
    coalesce((select sum(t.valor_usd) from tdrs t where t.atividade_id = a.id and t.status <> 'cancelado'), 0::numeric) as comprometido_usd,
    coalesce((select sum(ef.valor_usd) from execucao_financeira ef where ef.atividade_id = a.id and ef.situacao = 'pago'), 0::numeric) as pago_usd,
    coalesce((select sum(ef.valor_usd) from execucao_financeira ef where ef.atividade_id = a.id and ef.situacao = 'a_pagar'), 0::numeric) as a_pagar_usd,
    coalesce((select count(*) from tdrs t where t.atividade_id = a.id and t.status <> 'cancelado'), 0::bigint) as tdrs_count,
    orcamento_usd
      - coalesce((select sum(t.valor_usd) from tdrs t where t.atividade_id = a.id and t.status <> 'cancelado'), 0::numeric)
      + coalesce((select sum(ce.valor_liberado_usd) from contrato_encerramentos ce where ce.atividade_id = a.id and ce.status = 'ativo'), 0::numeric) as saldo_livre_usd,
    orcamento_usd - 0::numeric as saldo_disponivel_usd,
    0::numeric as pct_comprometido, 0::numeric as pct_pago, 0::numeric as pct_a_pagar, 'ok'::text as status_saldo,
    coalesce((select sum(ce.valor_liberado_usd) from contrato_encerramentos ce where ce.atividade_id = a.id and ce.status = 'ativo'), 0::numeric) as liberado_usd
   from atividades a;
grant all on public.vw_saldo_atividade to authenticated;

-- pg_cron / pg_net (só registram)
create schema cron;
create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(p_nome text, p_sched text, p_cmd text) returns bigint
language sql as $$
  insert into cron.job(jobname, schedule, command) values (p_nome, p_sched, p_cmd)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid::bigint
$$;
create schema net;
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ select 1::bigint $$;

-- Tabela de cotação AwesomeAPI que JÁ EXISTE em produção (não confundir com cotacoes_ptax)
create table public.cotacoes_usd (
  id uuid primary key default gen_random_uuid(), cotacao numeric, fonte text default 'AwesomeAPI',
  data_ref date default current_date, criado_em timestamptz default now(),
  cotacao_anterior numeric, variacao_pct numeric
);
alter table public.cotacoes_usd enable row level security;
create policy cotacoes_select_all on public.cotacoes_usd for select using (auth.uid() is not null);
create policy cotacoes_insert_admin on public.cotacoes_usd for insert
  with check ((select fn_perfil_atual()) = 'super_admin');

-- Responsáveis por atividade e sino (formato de produção, conferido em 03/10/2026)
create table public.atividade_responsaveis (
  id uuid primary key default gen_random_uuid(),
  atividade_id uuid not null references public.atividades(id),
  usuario_id uuid not null references public.usuarios(id),
  papel text not null default 'responsavel', ativo boolean not null default true
);
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(), usuario_id uuid, tipo varchar not null,
  titulo text, mensagem text, lida boolean default false, link text,
  entidade_tipo varchar, entidade_id uuid, criado_em timestamptz default now(),
  constraint notificacoes_tipo_check check (tipo::text = any (array['tarefa_atribuida','remanejamento_analise_placeholder']))
);
