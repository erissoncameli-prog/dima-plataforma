-- ════════════════════════════════════════════════════════════════════════════
-- PATRIMÔNIO · Fase 1 — cadastro, valor e depreciação (docs/patrimonio/plano.md)
-- ════════════════════════════════════════════════════════════════════════════
-- Ficha do bem (pat_bens) + razão de eventos imutável (pat_eventos). Situação,
-- condição, local, responsável e os campos de valor da ficha são CACHE: só as
-- funções fn_pat_* gravam (chave dima.pat_evento), cada mudança vira um evento.
-- Depreciação linear mensal calculada (fn_pat_depreciacao), nunca gravada.
-- Entrada pelo contrato de equipamentos: produto aprovado/pago ⇒ tarefa
-- "Incorporar bens ao patrimônio"; a incorporação confere Σ bens ≤ valor do produto.
-- Patrimônio NÃO mexe no saldo das atividades (vw_saldo_atividade/orcamento_fontes).
-- Escrita só por RPC SECURITY DEFINER; tabelas sem policy de escrita para o cliente.
-- Nada se apaga: anular cadastro = estorno da incorporação (situação 'anulado').
-- Sem a palavra que remove linhas no texto (o apply_migration ficaria esperando
-- confirmação): imutabilidade por ausência de policy, como o audit_log.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Acesso ──────────────────────────────────────────────────────────────────
-- gerir = super_admin/coordenação ativos ou acesso extra 'patrimonio_gestor'
create or replace function public.fn_pat_pode_gerir()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_perfil_atual() in ('super_admin','coordenacao'), false)
      or (public.fn_perfil_atual() is not null and public.tem_permissao('patrimonio_gestor'))
$$;

-- coordenar = decisões que mudam valor ou anulam cadastro (nunca o gestor sozinho)
create or replace function public.fn_pat_pode_coordenar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_perfil_atual() in ('super_admin','coordenacao'), false)
$$;

-- ver o catálogo = todo perfil ativo, menos consultor externo (sem acesso extra)
create or replace function public.fn_pat_pode_ver()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_perfil_atual() in ('super_admin','coordenacao','financeiro','tecnico','visualizador'), false)
      or public.fn_pat_pode_gerir()
      or (public.fn_perfil_atual() is not null and public.tem_permissao('patrimonio'))
$$;

-- ver valores e depreciação = gerir, financeiro ou acesso extra 'patrimonio'
create or replace function public.fn_pat_pode_ver_valor()
returns boolean language sql stable security definer set search_path = public as $$
  select public.fn_pat_pode_gerir()
      or coalesce(public.fn_perfil_atual() = 'financeiro', false)
      or (public.fn_perfil_atual() is not null and public.tem_permissao('patrimonio'))
$$;

-- ── Catálogos ───────────────────────────────────────────────────────────────
create table if not exists public.pat_categorias (
  codigo          text primary key check (codigo ~ '^[a-z][a-z0-9_]{1,39}$'),
  nome            text not null check (length(btrim(nome)) >= 3),
  vida_util_meses integer not null check (vida_util_meses between 1 and 1200),
  residual_pct    numeric(5,2) not null default 10 check (residual_pct >= 0 and residual_pct < 100),
  controle        text not null default 'individual' check (controle in ('individual','lote')),
  exige_serie     boolean not null default false,
  icone           text not null default 'caixa',
  referencia      text,
  ordem           integer not null default 0,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.pat_locais (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(btrim(nome)) >= 3),
  tipo          text not null default 'outro'
                check (tipo in ('sede','escritorio','unidade_conservacao','deposito','externo','outro')),
  local_pai_id  uuid references public.pat_locais(id),
  endereco      text,
  municipio     text,
  lat           numeric(9,6) check (lat between -90 and 90),
  lon           numeric(9,6) check (lon between -180 and 180),
  ativo         boolean not null default true,
  criado_por    uuid references public.usuarios(id),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists pat_locais_nome_uk on public.pat_locais (lower(btrim(nome)));

-- ── Incorporação (lote de entrada: uma NF, um ou vários bens) ───────────────
create table if not exists public.pat_incorporacoes (
  id                      uuid primary key,             -- gerado no navegador (idempotência e pasta da NF)
  origem                  text not null check (origem in ('compra_projeto','cessao','doacao_recebida','outra')),
  origem_detalhe          text,
  contrato_produto_id     uuid references public.contratos_produtos(id),
  contrato_id             uuid references public.contratos(id),
  lancamento_id           uuid references public.execucao_financeira(id),
  fornecedor_id           uuid references public.fornecedores(id),
  atividade_id            uuid references public.atividades(id),
  tdr_id                  uuid references public.tdrs(id),
  nf_numero               text,
  nf_data                 date,
  nf_url                  text,
  nf_nome                 text,
  valor_total_brl         numeric(14,2) not null default 0,
  justificativa_diferenca text,          -- incorporação concluída abaixo do valor do produto
  registrado_por          uuid not null references public.usuarios(id),
  registrado_em           timestamptz not null default now()
);
create index if not exists pat_incorp_produto_ix on public.pat_incorporacoes (contrato_produto_id);

-- ── Ficha do bem ────────────────────────────────────────────────────────────
create sequence if not exists public.pat_bens_numero_seq;

create table if not exists public.pat_bens (
  id                   uuid primary key default gen_random_uuid(),
  numero               text not null unique,                 -- PAT-000123 (gerado; nunca reaproveitado)
  numero_unesco        text,
  numero_sema          text,
  categoria_codigo     text not null references public.pat_categorias(codigo),
  descricao            text not null check (length(btrim(descricao)) >= 3),
  marca                text,
  modelo               text,
  numero_serie         text,
  especificacao        text,
  quantidade           integer not null default 1 check (quantidade > 0),
  unidade              text not null default 'un',
  incorporacao_id      uuid not null references public.pat_incorporacoes(id),
  origem               text not null check (origem in ('compra_projeto','cessao','doacao_recebida','outra')),
  contrato_produto_id  uuid references public.contratos_produtos(id),
  contrato_id          uuid references public.contratos(id),
  fornecedor_id        uuid references public.fornecedores(id),
  atividade_id         uuid references public.atividades(id),
  tdr_id               uuid references public.tdrs(id),
  dt_aquisicao         date not null,
  dt_inicio_uso        date,                                  -- NULL = ainda não entrou em uso (não deprecia)
  valor_aquisicao_brl  numeric(14,2) not null check (valor_aquisicao_brl >= 0),
  cotacao_ptax         numeric(12,6),                         -- reserva p/ US$ sem pagamento UNESCO
  cotacao_ptax_data    date,
  vida_util_meses      integer not null check (vida_util_meses between 1 and 1200),
  residual_pct         numeric(5,2) not null check (residual_pct >= 0 and residual_pct < 100),
  garantia_ate         date,
  garantia_obs         text,
  titularidade         text not null default 'unesco_projeto' check (titularidade in ('unesco_projeto','sema','terceiro')),
  situacao             text not null default 'em_estoque'
                       check (situacao in ('em_estoque','em_uso','emprestado','em_manutencao','extraviado','baixado','transferido','anulado')),
  condicao             text not null default 'novo' check (condicao in ('novo','bom','regular','ruim','inservivel')),
  local_id             uuid references public.pat_locais(id),
  responsavel_id       uuid references public.usuarios(id),
  ultimo_inventario_em date,
  dt_baixa             date,
  observacoes          text,
  criado_por           uuid not null references public.usuarios(id),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  check (dt_inicio_uso is null or dt_inicio_uso >= dt_aquisicao)
);
create unique index if not exists pat_bens_serie_uk on public.pat_bens (lower(btrim(numero_serie)))
  where numero_serie is not null and btrim(numero_serie) <> '' and situacao <> 'anulado';
create index if not exists pat_bens_produto_ix on public.pat_bens (contrato_produto_id);
create index if not exists pat_bens_local_ix on public.pat_bens (local_id);
create index if not exists pat_bens_resp_ix on public.pat_bens (responsavel_id);

-- ── Razão de eventos (imutável) ─────────────────────────────────────────────
create table if not exists public.pat_eventos (
  id               uuid primary key default gen_random_uuid(),
  bem_id           uuid not null references public.pat_bens(id),
  tipo             text not null check (tipo in (
                     'incorporacao','condicao','correcao','estorno',
                     -- fases seguintes (já aceitos pelo check para não exigir troca depois)
                     'distribuicao','transferencia_interna','devolucao','emprestimo',
                     'manutencao_saida','manutencao_retorno','reavaliacao','ocorrencia',
                     'inventario','baixa','transferencia_definitiva')),
  dt_evento        date not null default current_date,
  local_de         uuid references public.pat_locais(id),
  local_para       uuid references public.pat_locais(id),
  responsavel_de   uuid references public.usuarios(id),
  responsavel_para uuid references public.usuarios(id),
  condicao_de      text,
  condicao_para    text,
  detalhes         jsonb not null default '{}'::jsonb,
  observacao       text,
  estorno_de       uuid references public.pat_eventos(id),
  registrado_por   uuid not null references public.usuarios(id),
  registrado_em    timestamptz not null default now()
);
create index if not exists pat_eventos_bem_ix on public.pat_eventos (bem_id, registrado_em);
create unique index if not exists pat_eventos_estorno_uk on public.pat_eventos (estorno_de) where estorno_de is not null;

-- ── Documentos do bem (fotos, laudo, garantia…) — a NF fica na incorporação ─
create table if not exists public.pat_documentos (
  id             uuid primary key default gen_random_uuid(),
  bem_id         uuid not null references public.pat_bens(id),
  tipo           text not null check (tipo in ('foto','laudo','garantia','manual','termo','bo','outro')),
  url            text not null,
  nome           text not null,
  tamanho        bigint,
  ativo          boolean not null default true,
  enviado_por    uuid not null references public.usuarios(id),
  enviado_em     timestamptz not null default now(),
  removido_por   uuid references public.usuarios(id),
  removido_em    timestamptz,
  motivo_remocao text
);
create index if not exists pat_docs_bem_ix on public.pat_documentos (bem_id);

-- ── Travas ──────────────────────────────────────────────────────────────────
-- Ficha: cache e campos de valor só com a chave das funções (cada mudança = evento)
create or replace function public.fn_pat_trg_guarda_bem()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('dima.pat_evento', true), '') <> '1' then
      raise exception 'PAT_SO_PELA_INCORPORACAO: bem nasce só pela incorporação (fn_pat_incorporar)';
    end if;
    if new.numero is null or new.numero = '' then
      new.numero := 'PAT-' || lpad(nextval('public.pat_bens_numero_seq')::text, 6, '0');
    end if;
    return new;
  end if;
  if new.numero is distinct from old.numero or new.incorporacao_id is distinct from old.incorporacao_id
     or new.origem is distinct from old.origem or new.contrato_produto_id is distinct from old.contrato_produto_id
     or new.criado_por is distinct from old.criado_por or new.criado_em is distinct from old.criado_em then
    raise exception 'PAT_CAMPO_FIXO: número, origem e incorporação do bem não mudam';
  end if;
  if coalesce(current_setting('dima.pat_evento', true), '') <> '1' and (
       new.situacao is distinct from old.situacao or new.condicao is distinct from old.condicao
    or new.local_id is distinct from old.local_id or new.responsavel_id is distinct from old.responsavel_id
    or new.ultimo_inventario_em is distinct from old.ultimo_inventario_em or new.dt_baixa is distinct from old.dt_baixa
    or new.valor_aquisicao_brl is distinct from old.valor_aquisicao_brl or new.dt_aquisicao is distinct from old.dt_aquisicao
    or new.dt_inicio_uso is distinct from old.dt_inicio_uso or new.categoria_codigo is distinct from old.categoria_codigo
    or new.vida_util_meses is distinct from old.vida_util_meses or new.residual_pct is distinct from old.residual_pct
    or new.quantidade is distinct from old.quantidade or new.titularidade is distinct from old.titularidade) then
    raise exception 'PAT_CACHE_PROTEGIDO: situação, condição, local, responsável e valores do bem mudam só por evento';
  end if;
  if old.situacao = 'anulado' then
    raise exception 'PAT_ANULADO: cadastro anulado não se altera';
  end if;
  new.atualizado_em := now();
  return new;
end $$;
create or replace trigger trg_pat_guarda_bem before insert or update on public.pat_bens
  for each row execute function public.fn_pat_trg_guarda_bem();

create or replace function public.fn_pat_trg_evento_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'PAT_EVENTO_IMUTAVEL: evento do patrimônio não se altera (corrija com estorno)';
end $$;
create or replace trigger trg_pat_evento_imutavel before update on public.pat_eventos
  for each row execute function public.fn_pat_trg_evento_imutavel();

create or replace function public.fn_pat_trg_incorp_guarda()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.id is distinct from old.id or new.origem is distinct from old.origem
     or new.contrato_produto_id is distinct from old.contrato_produto_id
     or new.registrado_por is distinct from old.registrado_por or new.registrado_em is distinct from old.registrado_em then
    raise exception 'PAT_CAMPO_FIXO: origem e autoria da incorporação não mudam';
  end if;
  return new;
end $$;
create or replace trigger trg_pat_incorp_guarda before update on public.pat_incorporacoes
  for each row execute function public.fn_pat_trg_incorp_guarda();

create or replace function public.fn_pat_trg_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.atualizado_em := now(); return new; end $$;
create or replace trigger trg_pat_cat_touch before update on public.pat_categorias
  for each row execute function public.fn_pat_trg_touch();
create or replace trigger trg_pat_local_touch before update on public.pat_locais
  for each row execute function public.fn_pat_trg_touch();

-- trilha (audit_log)
create or replace trigger trg_audit_pat_bens after insert or update on public.pat_bens
  for each row execute function public.fn_trg_audit();
create or replace trigger trg_audit_pat_categorias after insert or update on public.pat_categorias
  for each row execute function public.fn_trg_audit();
create or replace trigger trg_audit_pat_locais after insert or update on public.pat_locais
  for each row execute function public.fn_trg_audit();
create or replace trigger trg_audit_pat_incorporacoes after insert or update on public.pat_incorporacoes
  for each row execute function public.fn_trg_audit();

-- ── RLS: leitura por função; escrita só pelas fn_pat_* ──────────────────────
alter table public.pat_categorias    enable row level security;
alter table public.pat_locais        enable row level security;
alter table public.pat_incorporacoes enable row level security;
alter table public.pat_bens          enable row level security;
alter table public.pat_eventos       enable row level security;
alter table public.pat_documentos    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pat_categorias','pat_locais','pat_bens','pat_eventos','pat_documentos'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_select') then
      execute format('create policy %I on public.%I for select to authenticated using (public.fn_pat_pode_ver())', t || '_select', t);
    end if;
  end loop;
  -- incorporação traz NF e fornecedor: só quem vê valores
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pat_incorporacoes' and policyname = 'pat_incorporacoes_select') then
    create policy pat_incorporacoes_select on public.pat_incorporacoes for select to authenticated
      using (public.fn_pat_pode_ver_valor());
  end if;
end $$;

revoke all on public.pat_categorias, public.pat_locais, public.pat_incorporacoes, public.pat_bens,
              public.pat_eventos, public.pat_documentos from anon, authenticated;
grant select on public.pat_categorias, public.pat_locais, public.pat_incorporacoes, public.pat_bens,
                public.pat_eventos, public.pat_documentos to authenticated;
revoke all on sequence public.pat_bens_numero_seq from anon, authenticated;

-- ── Depreciação (linear mensal; cota reconhecida no fechamento do mês) ──────
-- Começa no mês seguinte ao início de uso; só conta mês completo até p_data;
-- para no valor residual e no mês da baixa (p_fim). Última cota fecha o centavo.
create or replace function public.fn_pat_depreciacao(
  p_valor numeric, p_residual_pct numeric, p_vida integer, p_inicio_uso date, p_data date, p_fim date default null)
returns table (meses integer, cota_mensal numeric, depreciacao_acumulada numeric, valor_contabil numeric, valor_residual numeric)
language sql immutable set search_path = public as $$
  with b as (
    select coalesce(p_valor, 0) as valor,
           round(coalesce(p_valor, 0) * coalesce(p_residual_pct, 0) / 100, 2) as residual,
           greatest(coalesce(p_vida, 1), 1) as vida,
           (date_trunc('month', p_inicio_uso) + interval '1 month')::date as ini,
           least(p_data, coalesce(p_fim, p_data)) as ate
  ), m as (
    select b.*,
           case when b.ini is null or b.ate is null or b.ate + 1 <= b.ini then 0
                else least(b.vida, (extract(year from age(b.ate + 1, b.ini)) * 12
                                  + extract(month from age(b.ate + 1, b.ini)))::integer) end as n
    from b
  )
  select m.n,
         round((m.valor - m.residual) / m.vida, 2),
         case when m.n >= m.vida then m.valor - m.residual
              else round((m.valor - m.residual) * m.n / m.vida, 2) end,
         m.valor - case when m.n >= m.vida then m.valor - m.residual
                        else round((m.valor - m.residual) * m.n / m.vida, 2) end,
         m.residual
  from m
$$;

-- Lançamento (pagamento) de um produto de contrato: o ligado no produto ou o do
-- mesmo contrato + nº do produto (mesma regra do relatório A5)
create or replace function public.fn_pat_lancamento_do_produto(p_produto uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(p.lancamento_id,
           (select e.id from execucao_financeira e
             where e.contrato_id = p.contrato_id and e.numero_produto = p.numero_produto
               and e.situacao <> 'cancelado'
             order by (e.situacao = 'pago') desc, e.dt_pagamento desc nulls last, e.criado_em desc
             limit 1))
    from contratos_produtos p where p.id = p_produto
$$;

-- Câmbio do bem: o da UNESCO no pagamento (como o razão) ou, sem ele, a PTAX guardada
create or replace function public.fn_pat_cotacao_bem(p_bem uuid)
returns table (cotacao numeric, origem text)
language sql stable security definer set search_path = public as $$
  select case when e.situacao = 'pago' and coalesce(e.valor_usd_unesco, 0) > 0 then round(e.valor_brl / e.valor_usd_unesco, 6)
              else b.cotacao_ptax end,
         case when e.situacao = 'pago' and coalesce(e.valor_usd_unesco, 0) > 0 then 'unesco_pagamento'
              when b.cotacao_ptax is not null then 'ptax'
              else null end
    from pat_bens b
    left join pat_incorporacoes i on i.id = b.incorporacao_id
    left join execucao_financeira e on e.id = coalesce(i.lancamento_id, public.fn_pat_lancamento_do_produto(b.contrato_produto_id))
   where b.id = p_bem
$$;

-- ── Views ───────────────────────────────────────────────────────────────────
create or replace view public.vw_pat_bens with (security_invoker = true) as
select b.id, b.numero, b.numero_unesco, b.numero_sema, b.categoria_codigo, c.nome as categoria_nome,
       c.controle, c.icone as categoria_icone, b.descricao, b.marca, b.modelo, b.numero_serie, b.especificacao,
       b.quantidade, b.unidade, b.incorporacao_id, b.origem, b.contrato_produto_id, b.contrato_id,
       ct.numero as contrato_numero, b.fornecedor_id, f.nome as fornecedor_nome,
       b.atividade_id, a.codigo as atividade_codigo, b.tdr_id, t.numero as tdr_numero,
       b.dt_aquisicao, b.dt_inicio_uso, b.garantia_ate, b.garantia_obs, b.titularidade,
       b.situacao, b.condicao, b.local_id, l.nome as local_nome, b.responsavel_id,
       r.nome_completo as responsavel_nome, b.ultimo_inventario_em, b.dt_baixa, b.observacoes,
       b.criado_por, b.criado_em, b.atualizado_em,
       case when v.ok then (i.nf_url is null and b.origem = 'compra_projeto') end as nf_pendente,
       case when v.ok then i.nf_numero end as nf_numero,
       case when v.ok then i.nf_data end as nf_data,
       case when v.ok then i.nf_url end as nf_url,
       case when v.ok then i.nf_nome end as nf_nome,
       case when v.ok then b.valor_aquisicao_brl end as valor_aquisicao_brl,
       case when v.ok then b.vida_util_meses end as vida_util_meses,
       case when v.ok then b.residual_pct end as residual_pct,
       case when v.ok then d.meses end as meses_depreciados,
       case when v.ok then d.cota_mensal end as cota_mensal_brl,
       case when v.ok then d.depreciacao_acumulada end as depreciacao_acumulada_brl,
       case when v.ok then d.valor_contabil end as valor_contabil_brl,
       case when v.ok then d.valor_residual end as valor_residual_brl,
       case when v.ok then (d.meses >= b.vida_util_meses) end as totalmente_depreciado,
       case when v.ok then x.cotacao end as cotacao,
       case when v.ok then x.origem end as cotacao_origem,
       case when v.ok and x.cotacao > 0 then round(b.valor_aquisicao_brl / x.cotacao, 2) end as valor_aquisicao_usd,
       case when v.ok and x.cotacao > 0 then round(d.valor_contabil / x.cotacao, 2) end as valor_contabil_usd,
       (select count(*) from pat_documentos dc where dc.bem_id = b.id and dc.ativo and dc.tipo = 'foto')::int as n_fotos,
       (select dc.url from pat_documentos dc where dc.bem_id = b.id and dc.ativo and dc.tipo = 'foto'
         order by dc.enviado_em limit 1) as foto_url
  from pat_bens b
  join pat_categorias c on c.codigo = b.categoria_codigo
  left join pat_incorporacoes i on i.id = b.incorporacao_id
  left join pat_locais l on l.id = b.local_id
  left join usuarios r on r.id = b.responsavel_id
  left join contratos ct on ct.id = b.contrato_id
  left join fornecedores f on f.id = b.fornecedor_id
  left join atividades a on a.id = b.atividade_id
  left join tdrs t on t.id = b.tdr_id
  cross join lateral (select public.fn_pat_pode_ver_valor() as ok) v
  cross join lateral public.fn_pat_depreciacao(b.valor_aquisicao_brl, b.residual_pct, b.vida_util_meses,
                                               b.dt_inicio_uso, current_date, b.dt_baixa) d
  cross join lateral public.fn_pat_cotacao_bem(b.id) x;

create or replace view public.vw_pat_eventos with (security_invoker = true) as
select e.id, e.bem_id, e.tipo, e.dt_evento, e.local_de, ld.nome as local_de_nome, e.local_para, lp.nome as local_para_nome,
       e.responsavel_de, rd.nome_completo as responsavel_de_nome, e.responsavel_para, rp.nome_completo as responsavel_para_nome,
       e.condicao_de, e.condicao_para,
       case when public.fn_pat_pode_ver_valor() then e.detalhes
            else e.detalhes - 'antes' - 'depois' - 'valor_brl' end as detalhes,
       e.observacao, e.estorno_de, e.registrado_por, u.nome_completo as registrado_por_nome, e.registrado_em,
       exists (select 1 from pat_eventos z where z.estorno_de = e.id) as estornado
  from pat_eventos e
  left join pat_locais ld on ld.id = e.local_de
  left join pat_locais lp on lp.id = e.local_para
  left join usuarios rd on rd.id = e.responsavel_de
  left join usuarios rp on rp.id = e.responsavel_para
  left join usuarios u on u.id = e.registrado_por;

revoke all on public.vw_pat_bens, public.vw_pat_eventos from anon, authenticated;
grant select on public.vw_pat_bens, public.vw_pat_eventos to authenticated;

-- ── Gestor patrimonial padrão (quem recebe a tarefa de incorporar) ──────────
create or replace function public.fn_pat_gestor_padrao()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.usuario_id from usuario_permissoes p join usuarios u on u.id = p.usuario_id and u.ativo
      where p.modulo = 'patrimonio_gestor' and p.ativo and p.valido_de <= now()
        and (p.valido_ate is null or p.valido_ate > now())
      order by p.valido_de, p.concedido_em limit 1),
    (select x.usuario_id from rem_cargo_titulares x join usuarios u on u.id = x.usuario_id and u.ativo
      where x.cargo = 'coordenacao_solicitante' and x.vigencia_fim is null limit 1),
    (select id from usuarios where ativo and perfil = 'coordenacao' order by criado_em limit 1),
    (select id from usuarios where ativo and perfil = 'super_admin' order by criado_em limit 1))
$$;

-- Valor de referência de um produto (aprovado, se houver) e quanto já foi incorporado
create or replace function public.fn_pat_produto_saldo(p_produto uuid)
returns table (valor_ref numeric, incorporado numeric, restante numeric, concluida boolean)
language sql stable security definer set search_path = public as $$
  select v.ref, v.inc, greatest(v.ref - v.inc, 0),
         (v.ref - v.inc <= 0.01) or exists (select 1 from pat_incorporacoes i
                                             where i.contrato_produto_id = p_produto and i.justificativa_diferenca is not null)
    from (select coalesce(nullif(p.valor_aprovado, 0), p.valor_brl, 0) as ref,
                 coalesce((select sum(b.valor_aquisicao_brl) from pat_bens b
                            where b.contrato_produto_id = p.id and b.situacao <> 'anulado'), 0) as inc
            from contratos_produtos p where p.id = p_produto) v
$$;

-- Tarefa "Incorporar bens ao patrimônio" (idempotente)
create or replace function public.fn_pat_tarefa_incorporar(p_produto uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare p contratos_produtos%rowtype; c contratos%rowtype; v_resp uuid; v_id uuid; v_forn text; s record;
begin
  select * into p from contratos_produtos where id = p_produto;
  if p.id is null then return null; end if;
  select * into c from contratos where id = p.contrato_id;
  if c.id is null or c.tipo is distinct from 'Equipamentos' or c.status = 'cancelado' then return null; end if;
  if p.situacao not in ('aprovado','entrega_parcial','pago') then return null; end if;
  select * into s from fn_pat_produto_saldo(p_produto);
  if s.concluida then return null; end if;
  select id into v_id from tarefas where entidade_tipo = 'pat_incorporacao' and entidade_id = p_produto and ativo
                                    and status not in ('concluida','cancelada') limit 1;
  if v_id is not null then return v_id; end if;
  v_resp := fn_pat_gestor_padrao();
  if v_resp is null then return null; end if;
  select nome into v_forn from fornecedores where id = c.fornecedor_id;

  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo, entidade_tipo, entidade_id,
                       atividade_id, criado_por, tipo)
  values ('Incorporar bens ao patrimônio — contrato ' || c.numero,
          'O produto ' || coalesce(p.numero_produto::text, '') || ' do contrato ' || c.numero
            || coalesce(' (' || v_forn || ')', '') || ' é de equipamentos e foi aprovado. '
            || 'Cadastre os bens recebidos, com a nota fiscal, em Patrimônio › Painel › "A incorporar". '
            || 'A tarefa é concluída sozinha quando o valor do produto estiver todo incorporado.',
          'alta', current_date, current_date + 15, 'pat_incorporacao', p_produto, c.atividade_id, v_resp, 'outras')
  returning id into v_id;
  insert into tarefa_participantes (tarefa_id, usuario_id, papel) values (v_id, v_resp, 'responsavel')
    on conflict (tarefa_id, usuario_id) do nothing;
  if c.tdr_id is not null and c.atividade_id is not null
     and exists (select 1 from tdrs where id = c.tdr_id and atividade_id = c.atividade_id) then
    insert into tarefa_tdrs (tarefa_id, tdr_id) values (v_id, c.tdr_id) on conflict do nothing;
  end if;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (v_id, v_resp, 'criacao', 'Criada pelo sistema: produto de equipamentos aprovado (contrato ' || c.numero || ')');
  perform fn_tarefa_notificar(array[v_resp], 'tarefa_atribuida',
    'Nova tarefa: incorporar bens ao patrimônio', 'Contrato ' || c.numero, v_id, null);
  return v_id;
end $$;

create or replace function public.fn_pat_trg_produto_tarefa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.situacao in ('aprovado','entrega_parcial','pago')
     and (tg_op = 'INSERT' or new.situacao is distinct from old.situacao) then
    begin
      perform public.fn_pat_tarefa_incorporar(new.id);
    exception when others then
      raise warning 'tarefa de incorporação do produto % não criada: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;
create or replace trigger trg_pat_produto_tarefa after insert or update of situacao on public.contratos_produtos
  for each row execute function public.fn_pat_trg_produto_tarefa();

create or replace function public.fn_pat_fechar_tarefa_incorporar(p_produto uuid, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare v_t uuid;
begin
  for v_t in select id from tarefas where entidade_tipo = 'pat_incorporacao' and entidade_id = p_produto
                                       and ativo and status not in ('concluida','cancelada') loop
    perform fn_lic_fechar_tarefa(v_t, 'concluida', auth.uid(), p_texto);
  end loop;
end $$;

-- ── Produtos de equipamentos a incorporar (só quem gere) ────────────────────
create or replace function public.fn_pat_a_incorporar()
returns table (contrato_produto_id uuid, contrato_id uuid, contrato_numero text, objeto text, fornecedor_id uuid,
               fornecedor_nome text, atividade_id uuid, atividade_codigo text, tdr_id uuid, tdr_numero text,
               numero_produto integer, produto_descricao text, situacao text, valor_ref numeric, incorporado numeric,
               restante numeric, lancamento_id uuid, pago_em date, tarefa_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, c.id, c.numero::text, c.objeto_pt, c.fornecedor_id, f.nome, c.atividade_id, a.codigo::text,
         c.tdr_id, t.numero::text, p.numero_produto, p.descricao, p.situacao, s.valor_ref, s.incorporado, s.restante,
         l.id, case when e.situacao = 'pago' then e.dt_pagamento end,
         (select tk.id from tarefas tk where tk.entidade_tipo = 'pat_incorporacao' and tk.entidade_id = p.id and tk.ativo
           order by tk.criado_em desc limit 1)
    from contratos_produtos p
    join contratos c on c.id = p.contrato_id
    left join fornecedores f on f.id = c.fornecedor_id
    left join atividades a on a.id = c.atividade_id
    left join tdrs t on t.id = c.tdr_id
    cross join lateral public.fn_pat_produto_saldo(p.id) s
    left join lateral (select public.fn_pat_lancamento_do_produto(p.id) as id) l on true
    left join execucao_financeira e on e.id = l.id
   where public.fn_pat_pode_gerir()
     and c.tipo = 'Equipamentos' and c.status <> 'cancelado'
     and p.situacao in ('aprovado','entrega_parcial','pago')
     and not s.concluida
   order by c.numero, p.numero_produto
$$;

-- ── Arquivo no bucket (confere que existe antes de gravar a URL) ────────────
create or replace function public.fn_pat_caminho_da_url(p_url text)
returns text language sql immutable set search_path = public as $$
  select nullif(substring(p_url from '/storage/v1/object/(?:public|sign)/patrimonio-docs/([^?]+)'), '')
$$;

create or replace function public.fn_pat_arquivo_existe(p_url text, p_prefixo text)
returns boolean language plpgsql stable security definer set search_path = public, storage as $$
declare v_path text := public.fn_pat_caminho_da_url(p_url);
begin
  if v_path is null or left(v_path, length(p_prefixo)) <> p_prefixo then return false; end if;
  return exists (select 1 from storage.objects o where o.bucket_id = 'patrimonio-docs' and o.name = v_path);
end $$;

-- ── Incorporar (pelo contrato ou por origem declarada) ──────────────────────
-- p = { id, origem, contrato_produto_id?, origem_detalhe?, nf_numero?, nf_data?, nf_url?, nf_nome?,
--       dt_aquisicao, dt_inicio_uso?, local_id, titularidade?, justificativa_diferenca?,
--       itens: [{ categoria, descricao, marca?, modelo?, numeros_serie?: [..], especificacao?, quantidade,
--                 valor_total, garantia_ate?, numero_unesco?, numero_sema?, observacoes? }] }
create or replace function public.fn_pat_incorporar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_origem text := coalesce(p->>'origem', 'compra_projeto');
  v_prod contratos_produtos%rowtype; c contratos%rowtype;
  v_lanc uuid; v_ptax numeric; v_ptax_data date;
  v_dt_aq date := nullif(p->>'dt_aquisicao', '')::date;
  v_dt_uso date := nullif(p->>'dt_inicio_uso', '')::date;
  v_local uuid := nullif(p->>'local_id', '')::uuid;
  v_tit text := coalesce(nullif(p->>'titularidade', ''), case when v_origem = 'compra_projeto' then 'unesco_projeto' else 'sema' end);
  v_just text := nullif(btrim(coalesce(p->>'justificativa_diferenca', '')), '');
  v_it jsonb; v_cat pat_categorias%rowtype; v_qtd int; v_total numeric; v_unit numeric; v_resto numeric;
  v_series text[]; v_soma numeric := 0; k int; v_bem uuid; v_num text; v_valor numeric;
  v_saida jsonb := '[]'::jsonb; s record; v_restante numeric; v_concluida boolean;
begin
  if v_uid is null or not public.fn_pat_pode_gerir() then
    raise exception 'PAT_SEM_PERMISSAO: incorporar bens é do gestor patrimonial, da coordenação ou do super_admin';
  end if;
  if v_id is null then raise exception 'PAT_DADOS: identificador da incorporação ausente'; end if;
  if exists (select 1 from pat_incorporacoes where id = v_id) then
    return jsonb_build_object('incorporacao_id', v_id, 'repetida', true,
      'bens', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'numero', b.numero) order by b.numero)
                          from pat_bens b where b.incorporacao_id = v_id), '[]'::jsonb));
  end if;
  if v_origem not in ('compra_projeto','cessao','doacao_recebida','outra') then raise exception 'PAT_DADOS: origem inválida'; end if;
  if v_dt_aq is null then raise exception 'PAT_DADOS: informe a data de aquisição (da nota fiscal ou do recebimento)'; end if;
  if v_dt_aq > current_date then raise exception 'PAT_DADOS: data de aquisição no futuro'; end if;
  if v_dt_uso is not null and (v_dt_uso < v_dt_aq or v_dt_uso > current_date) then
    raise exception 'PAT_DADOS: início de uso deve ficar entre a aquisição e hoje';
  end if;
  if v_local is null or not exists (select 1 from pat_locais where id = v_local and ativo) then
    raise exception 'PAT_DADOS: escolha o local onde o bem está';
  end if;
  if v_tit not in ('unesco_projeto','sema','terceiro') then raise exception 'PAT_DADOS: titularidade inválida'; end if;
  if jsonb_typeof(p->'itens') is distinct from 'array' or jsonb_array_length(p->'itens') = 0 then
    raise exception 'PAT_DADOS: inclua ao menos um bem';
  end if;
  if nullif(p->>'nf_url', '') is not null and not public.fn_pat_arquivo_existe(p->>'nf_url', 'incorporacoes/' || v_id || '/') then
    raise exception 'PAT_ARQUIVO: o PDF da nota fiscal não foi encontrado no armazenamento';
  end if;

  if v_origem = 'compra_projeto' then
    select * into v_prod from contratos_produtos where id = nullif(p->>'contrato_produto_id', '')::uuid;
    if v_prod.id is null then raise exception 'PAT_DADOS: compra do projeto exige o produto do contrato'; end if;
    select * into c from contratos where id = v_prod.contrato_id;
    if c.status = 'cancelado' then raise exception 'PAT_CONTRATO: contrato cancelado'; end if;
    if v_prod.situacao not in ('aprovado','entrega_parcial','pago') then
      raise exception 'PAT_CONTRATO: o produto ainda não foi aprovado (situação %)', v_prod.situacao;
    end if;
    if public.fn_eh_fornecedor_do_contrato(c.id) then
      raise exception 'PAT_FORNECEDOR: o fornecedor do contrato não incorpora os próprios bens';
    end if;
    perform 1 from contratos_produtos where id = v_prod.id for update;
    v_lanc := public.fn_pat_lancamento_do_produto(v_prod.id);
  else
    if not public.fn_pat_pode_coordenar() then
      raise exception 'PAT_SEM_PERMISSAO: bem fora de contrato (cessão, doação) só a coordenação ou o super_admin incorpora';
    end if;
    if length(coalesce(btrim(p->>'origem_detalhe'), '')) < 10 then
      raise exception 'PAT_DADOS: descreva a origem (órgão, documento de cessão ou doação) com ao menos 10 caracteres';
    end if;
  end if;

  -- PTAX da data (reserva para o US$ quando não houver pagamento UNESCO)
  begin
    select ptax_venda, data_cotacao into v_ptax, v_ptax_data from public.fn_cotacao_usd(v_dt_aq);
  exception when others then v_ptax := null; v_ptax_data := null;
  end;

  perform set_config('dima.pat_evento', '1', true);
  insert into pat_incorporacoes (id, origem, origem_detalhe, contrato_produto_id, contrato_id, lancamento_id, fornecedor_id,
                                 atividade_id, tdr_id, nf_numero, nf_data, nf_url, nf_nome, registrado_por)
  values (v_id, v_origem, nullif(btrim(p->>'origem_detalhe'), ''), v_prod.id, c.id, v_lanc, c.fornecedor_id,
          c.atividade_id, c.tdr_id, nullif(btrim(p->>'nf_numero'), ''), nullif(p->>'nf_data', '')::date,
          nullif(p->>'nf_url', ''), nullif(p->>'nf_nome', ''), v_uid);

  for v_it in select * from jsonb_array_elements(p->'itens') loop
    select * into v_cat from pat_categorias where codigo = v_it->>'categoria' and ativo;
    if v_cat.codigo is null then raise exception 'PAT_DADOS: categoria inválida ou desativada (%)', v_it->>'categoria'; end if;
    if length(coalesce(btrim(v_it->>'descricao'), '')) < 3 then raise exception 'PAT_DADOS: descreva cada bem'; end if;
    v_qtd := coalesce(nullif(v_it->>'quantidade', '')::int, 1);
    v_total := round(coalesce(nullif(v_it->>'valor_total', '')::numeric, -1), 2);
    if v_qtd < 1 or v_qtd > 500 then raise exception 'PAT_DADOS: quantidade entre 1 e 500'; end if;
    if v_total < 0 then raise exception 'PAT_DADOS: informe o valor de cada item (pode ser zero em doação)'; end if;
    select coalesce(array_agg(btrim(x)) filter (where btrim(x) <> ''), '{}') into v_series
      from jsonb_array_elements_text(coalesce(v_it->'numeros_serie', '[]'::jsonb)) x;
    if v_cat.controle = 'lote' then
      if cardinality(v_series) > 1 then raise exception 'PAT_DADOS: bem em lote não leva vários números de série'; end if;
    else
      if cardinality(v_series) > v_qtd then raise exception 'PAT_DADOS: mais números de série que unidades em "%"', v_it->>'descricao'; end if;
      if v_cat.exige_serie and cardinality(v_series) <> v_qtd then
        raise exception 'PAT_SERIE: "%" (%) exige um número de série por unidade (% de %)',
          v_it->>'descricao', v_cat.nome, cardinality(v_series), v_qtd;
      end if;
    end if;
    v_soma := v_soma + v_total;

    -- lote = 1 ficha com a quantidade; individual = 1 ficha por unidade (centavo que sobra vai na última)
    for k in 1 .. case when v_cat.controle = 'lote' then 1 else v_qtd end loop
      if v_cat.controle = 'lote' then v_valor := v_total;
      else
        v_unit := trunc(v_total / v_qtd, 2);
        v_valor := case when k = v_qtd then v_total - v_unit * (v_qtd - 1) else v_unit end;
      end if;
      insert into pat_bens (numero, numero_unesco, numero_sema, categoria_codigo, descricao, marca, modelo, numero_serie,
                            especificacao, quantidade, unidade, incorporacao_id, origem, contrato_produto_id, contrato_id,
                            fornecedor_id, atividade_id, tdr_id, dt_aquisicao, dt_inicio_uso, valor_aquisicao_brl,
                            cotacao_ptax, cotacao_ptax_data, vida_util_meses, residual_pct, garantia_ate, garantia_obs,
                            titularidade, situacao, condicao, local_id, observacoes, criado_por)
      values ('', case when v_qtd = 1 then nullif(btrim(v_it->>'numero_unesco'), '') end,
              case when v_qtd = 1 then nullif(btrim(v_it->>'numero_sema'), '') end,
              v_cat.codigo, btrim(v_it->>'descricao'), nullif(btrim(v_it->>'marca'), ''), nullif(btrim(v_it->>'modelo'), ''),
              case when v_cat.controle = 'lote' then v_series[1] else v_series[k] end,
              nullif(btrim(v_it->>'especificacao'), ''),
              case when v_cat.controle = 'lote' then v_qtd else 1 end,
              coalesce(nullif(btrim(v_it->>'unidade'), ''), 'un'),
              v_id, v_origem, v_prod.id, c.id, c.fornecedor_id, c.atividade_id, c.tdr_id, v_dt_aq, v_dt_uso, v_valor,
              v_ptax, v_ptax_data, v_cat.vida_util_meses, v_cat.residual_pct, nullif(v_it->>'garantia_ate', '')::date,
              nullif(btrim(v_it->>'garantia_obs'), ''), v_tit,
              case when v_dt_uso is not null then 'em_uso' else 'em_estoque' end, 'novo', v_local,
              nullif(btrim(v_it->>'observacoes'), ''), v_uid)
      returning id, numero into v_bem, v_num;
      insert into pat_eventos (bem_id, tipo, dt_evento, local_para, condicao_para, detalhes, observacao, registrado_por)
      values (v_bem, 'incorporacao', v_dt_aq, v_local, 'novo',
              jsonb_build_object('incorporacao_id', v_id, 'valor_brl', v_valor, 'origem', v_origem,
                                 'contrato', c.numero, 'nf', nullif(btrim(p->>'nf_numero'), '')),
              case when v_origem = 'compra_projeto' then 'Entrada pelo contrato ' || c.numero
                   else 'Entrada: ' || btrim(p->>'origem_detalhe') end, v_uid);
      v_saida := v_saida || jsonb_build_object('id', v_bem, 'numero', v_num);
    end loop;
  end loop;

  update pat_incorporacoes set valor_total_brl = v_soma where id = v_id;

  if v_origem = 'compra_projeto' then
    select * into s from fn_pat_produto_saldo(v_prod.id);
    if s.incorporado > s.valor_ref + 0.01 then
      raise exception 'PAT_VALOR_EXCEDE: a soma dos bens (R$ %) passa o valor do produto (R$ %)',
        to_char(s.incorporado, 'FM999999990.00'), to_char(s.valor_ref, 'FM999999990.00');
    end if;
    if s.restante > 0.01 and v_just is not null then
      if length(v_just) < 10 then raise exception 'PAT_DADOS: justifique a diferença com ao menos 10 caracteres'; end if;
      update pat_incorporacoes set justificativa_diferenca = v_just where id = v_id;
      select * into s from fn_pat_produto_saldo(v_prod.id);
    end if;
    if s.concluida then
      perform public.fn_pat_fechar_tarefa_incorporar(v_prod.id,
        'Bens incorporados ao patrimônio (' || jsonb_array_length(v_saida) || ' ficha(s)).'
        || coalesce(' Diferença justificada: ' || v_just, ''));
    end if;
    v_restante := s.restante; v_concluida := s.concluida;
  end if;
  perform set_config('dima.pat_evento', '', true);

  return jsonb_build_object('incorporacao_id', v_id, 'bens', v_saida, 'valor_total', v_soma,
                            'restante', v_restante, 'concluida', v_concluida);
end $$;

-- NF depois (incorporação provisória)
create or replace function public.fn_pat_anexar_nf(p_incorporacao uuid, p_numero text, p_data date, p_url text, p_nome text)
returns void language plpgsql security definer set search_path = public as $$
declare i pat_incorporacoes%rowtype;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  select * into i from pat_incorporacoes where id = p_incorporacao for update;
  if i.id is null then raise exception 'PAT_DADOS: incorporação não encontrada'; end if;
  if i.nf_url is not null and not public.fn_pat_pode_coordenar() then
    raise exception 'PAT_SEM_PERMISSAO: trocar uma NF já anexada é da coordenação';
  end if;
  if not public.fn_pat_arquivo_existe(p_url, 'incorporacoes/' || p_incorporacao || '/') then
    raise exception 'PAT_ARQUIVO: o PDF da nota fiscal não foi encontrado no armazenamento';
  end if;
  update pat_incorporacoes set nf_numero = coalesce(nullif(btrim(p_numero), ''), nf_numero),
         nf_data = coalesce(p_data, nf_data), nf_url = p_url, nf_nome = p_nome
   where id = p_incorporacao;
end $$;

-- ── Ficha: campos descritivos (gestor) ──────────────────────────────────────
create or replace function public.fn_pat_editar_ficha(p_bem uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare b pat_bens%rowtype; v_cat pat_categorias%rowtype;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  select * into b from pat_bens where id = p_bem for update;
  if b.id is null then raise exception 'PAT_DADOS: bem não encontrado'; end if;
  if b.situacao in ('anulado','baixado','transferido') then raise exception 'PAT_ENCERRADO: bem fora do patrimônio ativo'; end if;
  select * into v_cat from pat_categorias where codigo = b.categoria_codigo;
  if p ? 'descricao' and length(coalesce(btrim(p->>'descricao'), '')) < 3 then raise exception 'PAT_DADOS: descrição curta demais'; end if;
  if v_cat.exige_serie and p ? 'numero_serie' and coalesce(btrim(p->>'numero_serie'), '') = '' then
    raise exception 'PAT_SERIE: % exige número de série', v_cat.nome;
  end if;
  update pat_bens set
    descricao     = case when p ? 'descricao' then btrim(p->>'descricao') else descricao end,
    marca         = case when p ? 'marca' then nullif(btrim(p->>'marca'), '') else marca end,
    modelo        = case when p ? 'modelo' then nullif(btrim(p->>'modelo'), '') else modelo end,
    numero_serie  = case when p ? 'numero_serie' then nullif(btrim(p->>'numero_serie'), '') else numero_serie end,
    especificacao = case when p ? 'especificacao' then nullif(btrim(p->>'especificacao'), '') else especificacao end,
    numero_unesco = case when p ? 'numero_unesco' then nullif(btrim(p->>'numero_unesco'), '') else numero_unesco end,
    numero_sema   = case when p ? 'numero_sema' then nullif(btrim(p->>'numero_sema'), '') else numero_sema end,
    unidade       = case when p ? 'unidade' then coalesce(nullif(btrim(p->>'unidade'), ''), 'un') else unidade end,
    garantia_ate  = case when p ? 'garantia_ate' then nullif(p->>'garantia_ate', '')::date else garantia_ate end,
    garantia_obs  = case when p ? 'garantia_obs' then nullif(btrim(p->>'garantia_obs'), '') else garantia_obs end,
    observacoes   = case when p ? 'observacoes' then nullif(btrim(p->>'observacoes'), '') else observacoes end
   where id = p_bem;
end $$;

-- ── Correção de valor/datas/categoria (evento 'correcao') ───────────────────
-- Gestor pode só informar o início de uso quando ainda está vazio; o resto é da coordenação.
create or replace function public.fn_pat_corrigir(p_bem uuid, p jsonb, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  b pat_bens%rowtype; n pat_bens%rowtype; v_cat pat_categorias%rowtype; v_ev uuid;
  v_antes jsonb := '{}'; v_depois jsonb := '{}'; k text; s record;
  v_so_inicio boolean := (select coalesce(array_agg(x), '{}') from jsonb_object_keys(p) x) <@ array['dt_inicio_uso'];
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  select * into b from pat_bens where id = p_bem for update;
  if b.id is null then raise exception 'PAT_DADOS: bem não encontrado'; end if;
  if b.situacao in ('anulado','baixado','transferido') then raise exception 'PAT_ENCERRADO: bem fora do patrimônio ativo'; end if;
  if not (v_so_inicio and b.dt_inicio_uso is null) and not public.fn_pat_pode_coordenar() then
    raise exception 'PAT_SEM_PERMISSAO: corrigir valor, datas ou categoria é da coordenação (o gestor só informa o início de uso)';
  end if;
  if length(coalesce(btrim(p_motivo), '')) < 10 and not (v_so_inicio and b.dt_inicio_uso is null) then
    raise exception 'PAT_DADOS: explique a correção com ao menos 10 caracteres';
  end if;
  n := b;
  if p ? 'valor_aquisicao_brl' then n.valor_aquisicao_brl := round((p->>'valor_aquisicao_brl')::numeric, 2); end if;
  if p ? 'dt_aquisicao' then n.dt_aquisicao := (p->>'dt_aquisicao')::date; end if;
  if p ? 'dt_inicio_uso' then n.dt_inicio_uso := nullif(p->>'dt_inicio_uso', '')::date; end if;
  if p ? 'categoria_codigo' then
    select * into v_cat from pat_categorias where codigo = p->>'categoria_codigo' and ativo;
    if v_cat.codigo is null then raise exception 'PAT_DADOS: categoria inválida'; end if;
    if v_cat.controle is distinct from (select controle from pat_categorias where codigo = b.categoria_codigo) then
      raise exception 'PAT_DADOS: não dá para trocar entre categoria de lote e individual (anule e incorpore de novo)';
    end if;
    n.categoria_codigo := v_cat.codigo;
    if not (p ? 'vida_util_meses') then n.vida_util_meses := v_cat.vida_util_meses; end if;
    if not (p ? 'residual_pct') then n.residual_pct := v_cat.residual_pct; end if;
  end if;
  if p ? 'vida_util_meses' then n.vida_util_meses := (p->>'vida_util_meses')::int; end if;
  if p ? 'residual_pct' then n.residual_pct := (p->>'residual_pct')::numeric; end if;
  if p ? 'quantidade' then
    if (select controle from pat_categorias where codigo = n.categoria_codigo) <> 'lote' then
      raise exception 'PAT_DADOS: só bem em lote tem quantidade';
    end if;
    n.quantidade := (p->>'quantidade')::int;
  end if;
  if n.valor_aquisicao_brl < 0 or n.quantidade < 1 or n.vida_util_meses not between 1 and 1200
     or n.residual_pct < 0 or n.residual_pct >= 100 then raise exception 'PAT_DADOS: valor fora do permitido'; end if;
  if n.dt_aquisicao > current_date then raise exception 'PAT_DADOS: data de aquisição no futuro'; end if;
  if n.dt_inicio_uso is not null and (n.dt_inicio_uso < n.dt_aquisicao or n.dt_inicio_uso > current_date) then
    raise exception 'PAT_DADOS: início de uso deve ficar entre a aquisição e hoje';
  end if;

  foreach k in array array['valor_aquisicao_brl','dt_aquisicao','dt_inicio_uso','categoria_codigo','vida_util_meses','residual_pct','quantidade'] loop
    if (to_jsonb(b)->k) is distinct from (to_jsonb(n)->k) then
      v_antes := v_antes || jsonb_build_object(k, to_jsonb(b)->k);
      v_depois := v_depois || jsonb_build_object(k, to_jsonb(n)->k);
    end if;
  end loop;
  if v_depois = '{}'::jsonb then raise exception 'PAT_DADOS: nada mudou'; end if;

  perform set_config('dima.pat_evento', '1', true);
  update pat_bens set valor_aquisicao_brl = n.valor_aquisicao_brl, dt_aquisicao = n.dt_aquisicao,
         dt_inicio_uso = n.dt_inicio_uso, categoria_codigo = n.categoria_codigo, vida_util_meses = n.vida_util_meses,
         residual_pct = n.residual_pct, quantidade = n.quantidade,
         situacao = case when b.situacao = 'em_estoque' and n.dt_inicio_uso is not null and b.dt_inicio_uso is null
                         then 'em_uso' else situacao end
   where id = p_bem;
  insert into pat_eventos (bem_id, tipo, detalhes, observacao, registrado_por)
  values (p_bem, 'correcao', jsonb_build_object('antes', v_antes, 'depois', v_depois,
            'situacao_antes', b.situacao),
          coalesce(nullif(btrim(p_motivo), ''), 'Início de uso informado'), auth.uid())
  returning id into v_ev;
  if b.contrato_produto_id is not null and v_depois ? 'valor_aquisicao_brl' then
    select * into s from fn_pat_produto_saldo(b.contrato_produto_id);
    if s.incorporado > s.valor_ref + 0.01 then
      raise exception 'PAT_VALOR_EXCEDE: com a correção, a soma dos bens passa o valor do produto (R$ %)', to_char(s.valor_ref, 'FM999999990.00');
    end if;
    if s.concluida then
      perform public.fn_pat_fechar_tarefa_incorporar(b.contrato_produto_id, 'Valor do produto todo incorporado (correção do bem ' || b.numero || ').');
    end if;
  end if;
  perform set_config('dima.pat_evento', '', true);
  return v_ev;
end $$;

-- ── Condição do bem ─────────────────────────────────────────────────────────
create or replace function public.fn_pat_registrar_condicao(p_bem uuid, p_condicao text, p_motivo text, p_data date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare b pat_bens%rowtype; v_ev uuid;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  select * into b from pat_bens where id = p_bem for update;
  if b.id is null then raise exception 'PAT_DADOS: bem não encontrado'; end if;
  if b.situacao in ('anulado','baixado','transferido') then raise exception 'PAT_ENCERRADO: bem fora do patrimônio ativo'; end if;
  if p_condicao not in ('novo','bom','regular','ruim','inservivel') then raise exception 'PAT_DADOS: condição inválida'; end if;
  if p_condicao = b.condicao then raise exception 'PAT_DADOS: o bem já está nessa condição'; end if;
  if p_condicao = 'novo' and b.condicao <> 'novo' then raise exception 'PAT_DADOS: bem usado não volta a "novo"'; end if;
  if length(coalesce(btrim(p_motivo), '')) < 10 then raise exception 'PAT_DADOS: descreva o motivo com ao menos 10 caracteres'; end if;
  if p_data is null or p_data > current_date or p_data < b.dt_aquisicao then raise exception 'PAT_DADOS: data inválida'; end if;
  perform set_config('dima.pat_evento', '1', true);
  update pat_bens set condicao = p_condicao where id = p_bem;
  insert into pat_eventos (bem_id, tipo, dt_evento, condicao_de, condicao_para, observacao, registrado_por)
  values (p_bem, 'condicao', p_data, b.condicao, p_condicao, btrim(p_motivo), auth.uid()) returning id into v_ev;
  perform set_config('dima.pat_evento', '', true);
  return v_ev;
end $$;

-- ── Estorno: só o último evento vivo do bem; coordenação/super_admin ────────
-- incorporação estornada = cadastro anulado (o número PAT não volta a ser usado)
create or replace function public.fn_pat_estornar(p_evento uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare e pat_eventos%rowtype; b pat_bens%rowtype; v_ultimo uuid; v_ev uuid;
begin
  if auth.uid() is null or not public.fn_pat_pode_coordenar() then
    raise exception 'PAT_SEM_PERMISSAO: estorno é da coordenação ou do super_admin';
  end if;
  if length(coalesce(btrim(p_motivo), '')) < 10 then raise exception 'PAT_DADOS: explique o estorno com ao menos 10 caracteres'; end if;
  select * into e from pat_eventos where id = p_evento;
  if e.id is null then raise exception 'PAT_DADOS: evento não encontrado'; end if;
  if e.tipo = 'estorno' then raise exception 'PAT_ESTORNO: estorno não se estorna'; end if;
  if e.tipo not in ('incorporacao','condicao','correcao') then raise exception 'PAT_ESTORNO: este tipo de evento não se estorna aqui'; end if;
  select * into b from pat_bens where id = e.bem_id for update;
  if b.situacao = 'anulado' then raise exception 'PAT_ANULADO: cadastro já anulado'; end if;
  select x.id into v_ultimo from pat_eventos x
   where x.bem_id = e.bem_id and x.tipo <> 'estorno' and not exists (select 1 from pat_eventos z where z.estorno_de = x.id)
   order by x.registrado_em desc, x.id desc limit 1;
  if v_ultimo is distinct from e.id then
    raise exception 'PAT_ESTORNO: só o último evento do bem pode ser estornado (estorne os mais recentes antes)';
  end if;

  perform set_config('dima.pat_evento', '1', true);
  if e.tipo = 'incorporacao' then
    update pat_bens set situacao = 'anulado' where id = b.id;
  elsif e.tipo = 'condicao' then
    update pat_bens set condicao = e.condicao_de where id = b.id;
  else -- correcao: volta os campos ao valor de antes, numa única atualização (respeita as regras de data)
    update pat_bens t set
      valor_aquisicao_brl = case when a ? 'valor_aquisicao_brl' then (a->>'valor_aquisicao_brl')::numeric else t.valor_aquisicao_brl end,
      dt_aquisicao        = case when a ? 'dt_aquisicao' then (a->>'dt_aquisicao')::date else t.dt_aquisicao end,
      dt_inicio_uso       = case when a ? 'dt_inicio_uso' then (a->>'dt_inicio_uso')::date else t.dt_inicio_uso end,
      categoria_codigo    = case when a ? 'categoria_codigo' then a->>'categoria_codigo' else t.categoria_codigo end,
      vida_util_meses     = case when a ? 'vida_util_meses' then (a->>'vida_util_meses')::int else t.vida_util_meses end,
      residual_pct        = case when a ? 'residual_pct' then (a->>'residual_pct')::numeric else t.residual_pct end,
      quantidade          = case when a ? 'quantidade' then (a->>'quantidade')::int else t.quantidade end,
      situacao            = coalesce(e.detalhes->>'situacao_antes', t.situacao)
      from (select coalesce(e.detalhes->'antes', '{}'::jsonb) as a) x
     where t.id = b.id;
  end if;
  insert into pat_eventos (bem_id, tipo, estorno_de, detalhes, observacao, registrado_por)
  values (b.id, 'estorno', e.id, jsonb_build_object('tipo_estornado', e.tipo), btrim(p_motivo), auth.uid())
  returning id into v_ev;
  perform set_config('dima.pat_evento', '', true);
  -- bem de contrato anulado reabre a pendência de incorporação
  if e.tipo = 'incorporacao' and b.contrato_produto_id is not null then
    perform public.fn_pat_tarefa_incorporar(b.contrato_produto_id);
  end if;
  return v_ev;
end $$;

-- ── Documentos do bem ───────────────────────────────────────────────────────
create or replace function public.fn_pat_anexar(p_bem uuid, p_tipo text, p_url text, p_nome text, p_tamanho bigint default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  if not exists (select 1 from pat_bens where id = p_bem and situacao <> 'anulado') then raise exception 'PAT_DADOS: bem não encontrado'; end if;
  if p_tipo not in ('foto','laudo','garantia','manual','termo','bo','outro') then raise exception 'PAT_DADOS: tipo de documento inválido'; end if;
  if not public.fn_pat_arquivo_existe(p_url, 'bens/' || p_bem || '/') then
    raise exception 'PAT_ARQUIVO: arquivo não encontrado no armazenamento';
  end if;
  insert into pat_documentos (bem_id, tipo, url, nome, tamanho, enviado_por)
  values (p_bem, p_tipo, p_url, left(coalesce(nullif(btrim(p_nome), ''), 'arquivo'), 200), p_tamanho, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.fn_pat_remover_anexo(p_doc uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  if length(coalesce(btrim(p_motivo), '')) < 5 then raise exception 'PAT_DADOS: diga por que o arquivo sai'; end if;
  update pat_documentos set ativo = false, removido_por = auth.uid(), removido_em = now(), motivo_remocao = btrim(p_motivo)
   where id = p_doc and ativo;
  if not found then raise exception 'PAT_DADOS: documento não encontrado'; end if;
end $$;

-- ── Catálogos: salvar ───────────────────────────────────────────────────────
create or replace function public.fn_pat_salvar_categoria(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_cod text := lower(btrim(coalesce(p->>'codigo', '')));
begin
  if auth.uid() is null or not public.fn_pat_pode_coordenar() then
    raise exception 'PAT_SEM_PERMISSAO: categorias são da coordenação ou do super_admin';
  end if;
  insert into pat_categorias (codigo, nome, vida_util_meses, residual_pct, controle, exige_serie, icone, referencia, ordem, ativo)
  values (v_cod, btrim(p->>'nome'), (p->>'vida_util_meses')::int, coalesce((p->>'residual_pct')::numeric, 10),
          coalesce(p->>'controle', 'individual'), coalesce((p->>'exige_serie')::boolean, false),
          coalesce(nullif(p->>'icone', ''), 'caixa'), nullif(btrim(p->>'referencia'), ''),
          coalesce((p->>'ordem')::int, 0), coalesce((p->>'ativo')::boolean, true))
  on conflict (codigo) do update set
    nome = excluded.nome, vida_util_meses = excluded.vida_util_meses, residual_pct = excluded.residual_pct,
    exige_serie = excluded.exige_serie, icone = excluded.icone, referencia = excluded.referencia,
    ordem = excluded.ordem, ativo = excluded.ativo,
    -- lote ↔ individual não muda depois que a categoria tem bens
    controle = case when exists (select 1 from pat_bens where categoria_codigo = excluded.codigo)
                    then pat_categorias.controle else excluded.controle end;
  return v_cod;
end $$;

create or replace function public.fn_pat_salvar_local(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_pai uuid := nullif(p->>'local_pai_id', '')::uuid;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  if v_pai is not null and v_pai = v_id then raise exception 'PAT_DADOS: o local não pode estar dentro de si mesmo'; end if;
  if coalesce((p->>'ativo')::boolean, true) = false and v_id is not null
     and exists (select 1 from pat_bens where local_id = v_id and situacao not in ('anulado','baixado','transferido')) then
    raise exception 'PAT_DADOS: há bens neste local; mova-os antes de desativar';
  end if;
  if v_id is null then
    insert into pat_locais (nome, tipo, local_pai_id, endereco, municipio, lat, lon, criado_por)
    values (btrim(p->>'nome'), coalesce(nullif(p->>'tipo', ''), 'outro'), v_pai, nullif(btrim(p->>'endereco'), ''),
            nullif(btrim(p->>'municipio'), ''), nullif(p->>'lat', '')::numeric, nullif(p->>'lon', '')::numeric, auth.uid())
    returning id into v_id;
  else
    update pat_locais set nome = btrim(p->>'nome'), tipo = coalesce(nullif(p->>'tipo', ''), 'outro'), local_pai_id = v_pai,
           endereco = nullif(btrim(p->>'endereco'), ''), municipio = nullif(btrim(p->>'municipio'), ''),
           lat = nullif(p->>'lat', '')::numeric, lon = nullif(p->>'lon', '')::numeric,
           ativo = coalesce((p->>'ativo')::boolean, true)
     where id = v_id;
    if not found then raise exception 'PAT_DADOS: local não encontrado'; end if;
  end if;
  return v_id;
end $$;

-- ── Bucket privado patrimonio-docs ──────────────────────────────────────────
-- bens/<bem_id>/… (fotos, laudos) · incorporacoes/<incorporacao_id>/… (NF).
-- Ler = quem vê o patrimônio; enviar = quem gere. Sem troca nem remoção pelo cliente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patrimonio-docs', 'patrimonio-docs', false, 20971520,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'patrimonio_docs_ler') then
    create policy patrimonio_docs_ler on storage.objects for select to authenticated
      using (bucket_id = 'patrimonio-docs' and public.fn_pat_pode_ver());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'patrimonio_docs_enviar') then
    create policy patrimonio_docs_enviar on storage.objects for insert to authenticated
      with check (bucket_id = 'patrimonio-docs' and public.fn_pat_pode_gerir()
                  and split_part(name, '/', 1) in ('bens','incorporacoes'));
  end if;
end $$;

-- ── Carga das categorias (referência STN, Macrofunção SIAFI 02.03.30 — a conferir) ──
insert into public.pat_categorias (codigo, nome, vida_util_meses, residual_pct, controle, exige_serie, icone, referencia, ordem) values
  ('informatica',  'Equipamentos de processamento de dados', 60, 10, 'individual', true,  'computador', 'STN 02.03.30 — processamento de dados: 5 anos, 10%', 10),
  ('comunicacao',  'Aparelhos e equipamentos de comunicação', 120, 20, 'individual', true,  'radio',      'STN 02.03.30 — comunicação: 10 anos, 20%', 20),
  ('audio_video',  'Equipamentos de áudio, vídeo e foto', 120, 10, 'individual', true,  'som',        'STN 02.03.30 — áudio, vídeo e foto: 10 anos, 10%', 30),
  ('maquinas',     'Máquinas, utensílios e equipamentos diversos', 120, 10, 'individual', false, 'ferramenta', 'STN 02.03.30 — máquinas e equipamentos diversos: 10 anos, 10%', 40),
  ('mobiliario',   'Mobiliário em geral', 120, 10, 'individual', false, 'cadeira',    'STN 02.03.30 — mobiliário: 10 anos, 10%', 50),
  ('estruturas',   'Tendas, barracas e estruturas desmontáveis', 60, 10, 'lote', false, 'tenda', 'Sugerido pelo projeto (uso em campo) — confirmar com a contabilidade', 60),
  ('veiculos',     'Veículos e embarcações', 180, 10, 'individual', true,  'veiculo',    'STN 02.03.30 — veículos: 15 anos, 10%', 70)
on conflict (codigo) do nothing;

insert into public.pat_locais (nome, tipo, municipio)
select 'Sede da SEMA/AC', 'sede', 'Rio Branco'
 where not exists (select 1 from public.pat_locais where lower(nome) = lower('Sede da SEMA/AC'));
insert into public.pat_locais (nome, tipo, municipio)
select 'Depósito do projeto', 'deposito', 'Rio Branco'
 where not exists (select 1 from public.pat_locais where lower(nome) = lower('Depósito do projeto'));

-- ── ROPA ────────────────────────────────────────────────────────────────────
insert into public.lgpd_tratamentos (codigo, nome, modulo, finalidade, controlador, operadores, base_legal, base_legal_detalhe,
       categorias_titulares, categorias_dados, dado_sensivel, dado_de_menor, tabelas, compartilhamento, transferencia_internacional,
       retencao_prazo, retencao_criterio, medidas_seguranca, ativo)
select 'TRAT-006', 'Patrimônio — guarda e controle dos bens do projeto', 'patrimonio',
       'Registrar os bens adquiridos pelo projeto, quem os cadastrou, quem é responsável pela guarda, onde estão e o que aconteceu com eles (prestação de contas à UNESCO e à SEMA/AC).',
       'SEMA/AC', 'Supabase (banco e armazenamento); Vercel (hospedagem)', 'art7_iii_politica_publica',
       'Art. 7º, III (execução de políticas públicas — controle patrimonial dos bens adquiridos com recurso do Projeto 218BRA2001). Não usa consentimento.',
       array['servidores, colaboradores e consultores responsáveis pela guarda ou que registram eventos'],
       array['nome do responsável pela guarda e de quem registrou cada evento','fotos do bem (podem mostrar pessoas ou ambientes)','nota fiscal do fornecedor PJ'],
       false, false, array['pat_bens','pat_eventos','pat_documentos','pat_incorporacoes'],
       'Nenhum. Relatórios internos e prestação de contas à UNESCO.',
       'Supabase/Vercel (art. 33) — pendência geral do DIMA', null,
       'Enquanto o bem existir e até a prestação de contas final do projeto e a transferência dos bens; revisar prazo com o Encarregado.',
       'Escrita só por funções do banco; razão de eventos sem alteração; arquivos em bucket privado com URL assinada; leitura de valores e NF restrita; trilha no audit_log.',
       true
 where not exists (select 1 from public.lgpd_tratamentos where codigo = 'TRAT-006');

-- ── Permissões das funções ──────────────────────────────────────────────────
revoke execute on function public.fn_pat_pode_gerir(), public.fn_pat_pode_coordenar(), public.fn_pat_pode_ver(),
  public.fn_pat_pode_ver_valor(), public.fn_pat_depreciacao(numeric, numeric, integer, date, date, date),
  public.fn_pat_lancamento_do_produto(uuid), public.fn_pat_cotacao_bem(uuid), public.fn_pat_gestor_padrao(),
  public.fn_pat_produto_saldo(uuid), public.fn_pat_tarefa_incorporar(uuid), public.fn_pat_fechar_tarefa_incorporar(uuid, text),
  public.fn_pat_a_incorporar(), public.fn_pat_caminho_da_url(text), public.fn_pat_arquivo_existe(text, text),
  public.fn_pat_incorporar(jsonb), public.fn_pat_anexar_nf(uuid, text, date, text, text),
  public.fn_pat_editar_ficha(uuid, jsonb), public.fn_pat_corrigir(uuid, jsonb, text),
  public.fn_pat_registrar_condicao(uuid, text, text, date), public.fn_pat_estornar(uuid, text),
  public.fn_pat_anexar(uuid, text, text, text, bigint), public.fn_pat_remover_anexo(uuid, text),
  public.fn_pat_salvar_categoria(jsonb), public.fn_pat_salvar_local(jsonb)
  from public, anon;

-- predicados (as policies e views chamam), cálculo e RPCs da tela
grant execute on function public.fn_pat_pode_gerir(), public.fn_pat_pode_coordenar(), public.fn_pat_pode_ver(),
  public.fn_pat_pode_ver_valor(), public.fn_pat_depreciacao(numeric, numeric, integer, date, date, date),
  public.fn_pat_cotacao_bem(uuid), public.fn_pat_a_incorporar(),
  public.fn_pat_incorporar(jsonb), public.fn_pat_anexar_nf(uuid, text, date, text, text),
  public.fn_pat_editar_ficha(uuid, jsonb), public.fn_pat_corrigir(uuid, jsonb, text),
  public.fn_pat_registrar_condicao(uuid, text, text, date), public.fn_pat_estornar(uuid, text),
  public.fn_pat_anexar(uuid, text, text, text, bigint), public.fn_pat_remover_anexo(uuid, text),
  public.fn_pat_salvar_categoria(jsonb), public.fn_pat_salvar_local(jsonb)
  to authenticated;

-- internas: só o banco (triggers e as próprias fn_pat_*)
revoke execute on function public.fn_pat_lancamento_do_produto(uuid), public.fn_pat_gestor_padrao(),
  public.fn_pat_produto_saldo(uuid), public.fn_pat_tarefa_incorporar(uuid), public.fn_pat_fechar_tarefa_incorporar(uuid, text),
  public.fn_pat_caminho_da_url(text), public.fn_pat_arquivo_existe(text, text)
  from authenticated;
revoke execute on function public.fn_pat_trg_guarda_bem(), public.fn_pat_trg_evento_imutavel(),
  public.fn_pat_trg_incorp_guarda(), public.fn_pat_trg_touch(), public.fn_pat_trg_produto_tarefa()
  from public, anon, authenticated;

-- ── Pendência já existente: produtos de equipamentos aprovados/pagos sem bem ──
select public.fn_pat_tarefa_incorporar(p.id)
  from contratos_produtos p join contratos c on c.id = p.contrato_id
 where c.tipo = 'Equipamentos' and c.status <> 'cancelado' and p.situacao in ('aprovado','entrega_parcial','pago');
