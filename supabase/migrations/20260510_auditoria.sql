-- ── Tabela de achados de auditoria ──────────────────────────────
create table if not exists auditoria_registros (
  id               uuid primary key default gen_random_uuid(),
  numero           serial,

  -- Domínio do achado
  dominio          text not null check (dominio in (
    'tdr_contrato', 'financeiro', 'produtos', 'viagens', 'matriz', 'qualidade_dados'
  )),

  -- Severidade (aligned com CVSS-like)
  severidade       text not null check (severidade in ('critico','alto','medio','baixo','info')),

  -- Descrição
  titulo           text not null,
  descricao        text not null,
  recomendacao     text,

  -- Referência ao registro problemático
  referencia_tabela text,
  referencia_id     uuid,
  referencia_label  text,   -- ex: "Contrato 012 / Fornecedor ABC"

  -- Ciclo de vida
  status           text not null default 'aberto' check (status in (
    'aberto','em_analise','resolvido','ignorado'
  )),
  resolvido_por    uuid references usuarios(id),
  resolvido_em     timestamptz,
  comentario_resolucao text,

  -- Execução da auditoria
  execucao_id      uuid,           -- agrupa achados de uma mesma rodada
  modelo_ia        text,
  tokens_usados    int,

  criado_em        timestamptz not null default now(),
  updated_em       timestamptz not null default now()
);

-- Tabela de execuções (cada vez que o auditor roda)
create table if not exists auditoria_execucoes (
  id               uuid primary key default gen_random_uuid(),
  iniciado_em      timestamptz not null default now(),
  concluido_em     timestamptz,
  status           text not null default 'rodando' check (status in ('rodando','concluido','erro')),
  disparado_por    uuid references usuarios(id),
  resumo_geral     text,
  total_achados    int default 0,
  achados_criticos int default 0,
  achados_altos    int default 0,
  tokens_usados    int default 0,
  erro_msg         text
);

-- Índices úteis
create index if not exists idx_aud_status     on auditoria_registros(status);
create index if not exists idx_aud_dominio    on auditoria_registros(dominio);
create index if not exists idx_aud_severidade on auditoria_registros(severidade);
create index if not exists idx_aud_execucao   on auditoria_registros(execucao_id);
create index if not exists idx_aud_ref        on auditoria_registros(referencia_tabela, referencia_id);

-- Trigger updated_em
create or replace function set_updated_em()
returns trigger language plpgsql as $$
begin new.updated_em = now(); return new; end;
$$;

drop trigger if exists trg_auditoria_updated on auditoria_registros;
create trigger trg_auditoria_updated
  before update on auditoria_registros
  for each row execute function set_updated_em();

-- RLS
alter table auditoria_registros  enable row level security;
alter table auditoria_execucoes  enable row level security;

-- Coordenação e super_admin podem ver tudo
create policy "auditoria_select" on auditoria_registros for select
  using (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid()
        and u.perfil in ('super_admin','coordenacao')
    )
  );

create policy "auditoria_update" on auditoria_registros for update
  using (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid()
        and u.perfil in ('super_admin','coordenacao')
    )
  );

create policy "execucoes_select" on auditoria_execucoes for select
  using (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid()
        and u.perfil in ('super_admin','coordenacao')
    )
  );
