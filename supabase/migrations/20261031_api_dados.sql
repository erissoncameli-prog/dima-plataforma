-- ════════════════════════════════════════════════════════════════════════════
-- API de dados para outras plataformas (painel HTML e BI) — somente leitura,
-- somente números agregados (o mesmo conteúdo da ficha A5, sem nome de pessoa,
-- sem fornecedor, sem texto livre).
--
--   Outra plataforma ──HTTPS + chave──▶ Edge Function `api-dados`
--                                        └─ fn_api_cliente (confere a chave)
--                                        └─ fn_api_resumo / fn_api_atividades / fn_api_matriz
--                                        └─ fn_api_registrar (trilha de acesso)
--
-- Regras:
--   * Chave guardada só como SHA-256 (api_clientes.chave_hash); a chave aparece uma vez.
--   * api_clientes / api_acessos sem policy nem grant: só service_role e as funções.
--   * fn_api_* de dados e de autenticação: EXECUTE só para service_role.
--   * Criar/revogar chave: só super_admin ativo ou o SQL Editor (fn_api_pode_administrar).
--   * Saldo vem de vw_saldo_atividade e progresso de vw_matriz_progresso (fontes da verdade).
--   * Revogar = ativo=false (nada se apaga).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.api_clientes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  descricao     text,
  chave_prefixo text not null,                 -- só para reconhecer a chave na tela (ex.: dima_3f9a…)
  chave_hash    text not null unique,          -- SHA-256 hex da chave inteira
  escopos       text[] not null default array['resumo','atividades','matriz'],
  origens       text[] not null default '{}',  -- domínios do navegador liberados no CORS (painel HTML)
  limite_minuto integer not null default 60 check (limite_minuto between 1 and 1000),
  ativo         boolean not null default true,
  expira_em     timestamptz,
  criado_por    uuid references public.usuarios(id),
  criado_em     timestamptz not null default now(),
  revogado_por  uuid references public.usuarios(id),
  revogado_em   timestamptz,
  constraint api_clientes_escopos_ck check (escopos <@ array['resumo','atividades','matriz'])
);

create table if not exists public.api_acessos (
  id         bigint generated always as identity primary key,
  cliente_id uuid not null references public.api_clientes(id),
  rota       text not null,
  formato    text,
  status     integer not null,
  linhas     integer,
  criado_em  timestamptz not null default now()
);
create index if not exists api_acessos_cliente_em on public.api_acessos (cliente_id, criado_em desc);

alter table public.api_clientes enable row level security;
alter table public.api_acessos  enable row level security;
revoke all on public.api_clientes from public, anon, authenticated;
revoke all on public.api_acessos  from public, anon, authenticated;

-- ── Administração (super_admin) ─────────────────────────────────────────────

-- Quem administra chaves: super_admin ativo logado, ou o SQL Editor (sessão direta do dono do
-- banco). Pela API REST a sessão é sempre `authenticator`, então anon/authenticated não passam.
create or replace function public.fn_api_pode_administrar()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = auth.uid() and perfil = 'super_admin' and ativo)
      or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'));
$$;

-- Cria o cliente e devolve a chave em texto UMA vez (depois só fica o hash).
create or replace function public.fn_api_criar_cliente(
  p_nome text, p_descricao text default null, p_escopos text[] default null,
  p_origens text[] default null, p_expira_em timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_chave text; v_id uuid;
begin
  if not fn_api_pode_administrar() then
    raise exception 'API_SO_SUPER_ADMIN';
  end if;
  if coalesce(length(trim(p_nome)), 0) < 3 then raise exception 'API_NOME_OBRIGATORIO'; end if;
  v_chave := 'dima_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into api_clientes (nome, descricao, chave_prefixo, chave_hash, escopos, origens, expira_em, criado_por)
  values (trim(p_nome), p_descricao, left(v_chave, 12),
          encode(sha256(convert_to(v_chave, 'UTF8')), 'hex'),
          coalesce(p_escopos, array['resumo','atividades','matriz']),
          coalesce(p_origens, '{}'), p_expira_em, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'chave', v_chave,
    'aviso', 'Guarde a chave agora: ela não será exibida de novo.');
end $$;

create or replace function public.fn_api_revogar_cliente(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_api_pode_administrar() then
    raise exception 'API_SO_SUPER_ADMIN';
  end if;
  update api_clientes set ativo = false, revogado_por = auth.uid(), revogado_em = now()
   where id = p_id and ativo;
end $$;

-- Lista para a futura tela de Integrações (sem o hash).
create or replace function public.fn_api_clientes()
returns table (id uuid, nome text, descricao text, chave_prefixo text, escopos text[], origens text[],
               limite_minuto integer, ativo boolean, expira_em timestamptz, criado_em timestamptz,
               revogado_em timestamptz, ultimo_acesso timestamptz, acessos_30d bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not fn_api_pode_administrar() then
    raise exception 'API_SO_SUPER_ADMIN';
  end if;
  return query
  select c.id, c.nome, c.descricao, c.chave_prefixo, c.escopos, c.origens, c.limite_minuto, c.ativo,
         c.expira_em, c.criado_em, c.revogado_em,
         (select max(a.criado_em) from api_acessos a where a.cliente_id = c.id),
         (select count(*) from api_acessos a where a.cliente_id = c.id and a.criado_em > now() - interval '30 days')
    from api_clientes c order by c.criado_em desc;
end $$;

-- ── Autenticação e trilha (só service_role, chamadas pela Edge Function) ────

-- Devolve o cliente se a chave vale (ativo, não vencido) e quantas chamadas fez no último minuto.
create or replace function public.fn_api_cliente(p_chave text)
returns table (id uuid, nome text, escopos text[], origens text[], limite_minuto integer, chamadas_minuto bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.nome, c.escopos, c.origens, c.limite_minuto,
         (select count(*) from api_acessos a where a.cliente_id = c.id and a.criado_em > now() - interval '1 minute')
    from api_clientes c
   where c.chave_hash = encode(sha256(convert_to(coalesce(p_chave, ''), 'UTF8')), 'hex')
     and c.ativo
     and (c.expira_em is null or c.expira_em > now());
$$;

create or replace function public.fn_api_registrar(p_cliente uuid, p_rota text, p_formato text, p_status integer, p_linhas integer)
returns void language sql security definer set search_path = public as $$
  insert into api_acessos (cliente_id, rota, formato, status, linhas)
  values (p_cliente, left(p_rota, 120), left(p_formato, 10), p_status, p_linhas);
$$;

-- ── Dados (agregados) ───────────────────────────────────────────────────────

-- Uma linha por atividade ativa, com os blocos numéricos da ficha A5.
create or replace function public.fn_api_atividades()
returns jsonb language sql stable security definer set search_path = public as $$
with hoje as (select (now() at time zone 'America/Rio_Branco')::date as d),
atv as (
  select a.id, a.codigo, a.nome_pt, a.fase::text as fase, a.orcamento_original_usd, r.codigo as resultado
    from atividades a left join resultados r on r.id = a.resultado_id
   where coalesce(a.ativo, true)
),
ctr_tdr as (   -- contratos não cancelados por TDR
  select tdr_id, count(*) n, sum(valor_total_brl) valor
    from contratos where tdr_id is not null and status::text <> 'cancelado' group by tdr_id
),
tdr as (
  select t.atividade_id,
         count(*) filter (where t.status::text <> 'cancelado')                         as total,
         count(*) filter (where t.status::text = 'cancelado')                          as cancelados,
         coalesce(sum(t.valor_brl) filter (where t.status::text <> 'cancelado'), 0)    as valor_brl,
         coalesce(sum(t.valor_usd) filter (where t.status::text <> 'cancelado'), 0)    as valor_usd,
         count(*) filter (where t.status::text in ('aprovado','em_licitacao')
                            and not coalesce(t.execucao_direta, false) and c.tdr_id is null) as aprovados_sem_contrato,
         count(*) filter (where c.n > 0 and c.valor > t.valor_brl + 0.005)             as contrato_acima_do_tdr,
         coalesce(sum(c.valor) filter (where t.status::text <> 'cancelado'), 0)       as contratado_brl
    from tdrs t left join ctr_tdr c on c.tdr_id = t.id
   group by t.atividade_id
),
tdr_st as (
  select atividade_id, jsonb_object_agg(status, n) por_status
    from (select atividade_id, status::text status, count(*) n from tdrs group by 1, 2) x group by atividade_id
),
ef as (        -- lançamentos por contrato (ou sem contrato = execução direta)
  select atividade_id, contrato_id is not null as com_contrato,
         coalesce(sum(valor_brl) filter (where situacao::text = 'pago'), 0)    pago_brl,
         coalesce(sum(valor_brl) filter (where situacao::text = 'a_pagar'), 0) a_pagar_brl
    from execucao_financeira group by 1, 2
),
ctr as (
  select atividade_id,
         count(*) filter (where status::text <> 'cancelado')                       as total,
         count(*) filter (where status::text = 'aguardando_cobertura')             as aguardando_cobertura,
         coalesce(sum(valor_total_brl) filter (where status::text <> 'cancelado'), 0) as valor_total_brl
    from contratos group by atividade_id
),
ctr_st as (
  select atividade_id, jsonb_object_agg(status, n) por_status
    from (select atividade_id, status::text status, count(*) n from contratos group by 1, 2) x group by atividade_id
),
prod as (
  select c.atividade_id,
         count(*) filter (where p.situacao <> 'cancelado') as total,
         count(*) filter (where p.situacao = 'pago') as pagos,
         count(*) filter (where p.situacao in ('aprovado','entrega_parcial')) as a_pagar,
         count(*) filter (where p.situacao not in ('pago','aprovado','entrega_parcial','cancelado')) as em_aberto,
         count(*) filter (where p.situacao = 'em_analise') as em_analise,
         count(*) filter (where p.situacao = 'devolvido') as devolvidos,
         coalesce(sum(case when coalesce(p.valor_aprovado, 0) > 0 then p.valor_aprovado else p.valor_brl end)
                    filter (where p.situacao = 'pago'), 0) as valor_pago_brl,
         coalesce(sum(case when coalesce(p.valor_aprovado, 0) > 0 then p.valor_aprovado else p.valor_brl end)
                    filter (where p.situacao in ('aprovado','entrega_parcial')), 0) as valor_a_pagar_brl,
         coalesce(sum(p.valor_brl) filter (where p.situacao <> 'cancelado'), 0) as valor_total_brl
    from contratos_produtos p join contratos c on c.id = p.contrato_id
   where c.status::text <> 'cancelado'
   group by c.atividade_id
),
mz as (
  select am.atividade_id,
         count(*) as indicadores,
         count(*) filter (where coalesce(v.meta_numerica, 0) = 0) as qualitativos,
         count(*) filter (where v.meta_numerica > 0 and v.realizado_confirmado >= v.meta_numerica) as atingidos,
         count(*) filter (where v.meta_numerica > 0 and v.realizado_confirmado < v.meta_numerica
                            and (v.realizado_confirmado > 0 or v.realizado_pendente > 0)) as em_andamento,
         count(*) filter (where v.meta_numerica > 0 and coalesce(v.realizado_confirmado, 0) = 0
                            and coalesce(v.realizado_pendente, 0) = 0) as sem_registro,
         round(avg(least(100, v.realizado_confirmado / v.meta_numerica * 100)) filter (where v.meta_numerica > 0), 1) as progresso_medio_pct
    from atividade_matriz am
    join matriz_itens i on i.id = am.matriz_item_id and i.ativo
    join vw_matriz_progresso v on v.id = i.id
   group by am.atividade_id
),
tk as (        -- tarefas: sem as restritas (nem a contagem delas sai)
  select t.atividade_id,
         count(*) filter (where t.status::text in ('a_fazer','em_andamento','em_revisao','bloqueada')) as abertas,
         count(*) filter (where t.status::text in ('a_fazer','em_andamento','em_revisao','bloqueada')
                            and t.dt_prazo < (select d from hoje)) as atrasadas,
         count(*) filter (where t.status::text = 'bloqueada') as bloqueadas,
         count(*) filter (where t.status::text = 'concluida') as concluidas
    from tarefas t
   where t.ativo and not coalesce(t.restrita, false) and t.atividade_id is not null
   group by t.atividade_id
),
resp as (
  select atividade_id,
         count(*) filter (where papel = 'responsavel') as responsaveis,
         count(*) filter (where papel <> 'responsavel') as substitutos
    from atividade_responsaveis where ativo group by atividade_id
)
select coalesce(jsonb_agg(jsonb_build_object(
  'id', a.id, 'codigo', a.codigo, 'nome', a.nome_pt, 'resultado', a.resultado, 'fase', a.fase,
  'tem_responsavel', coalesce(rp.responsaveis, 0) > 0,
  'orcamento', jsonb_build_object(
     'original_usd', a.orcamento_original_usd, 'vigente_usd', s.orcamento_usd,
     'comprometido_usd', s.comprometido_usd, 'excedente_contrato_usd', s.excedente_contrato_usd,
     'pago_usd', s.pago_usd, 'a_pagar_usd', s.a_pagar_usd, 'liberado_usd', s.liberado_usd,
     'saldo_livre_usd', s.saldo_livre_usd, 'pct_comprometido', s.pct_comprometido, 'pct_pago', s.pct_pago,
     'situacao_saldo', s.status_saldo),
  'tdrs', jsonb_build_object(
     'total', coalesce(t.total, 0), 'cancelados', coalesce(t.cancelados, 0),
     'valor_brl', coalesce(t.valor_brl, 0), 'valor_usd', coalesce(t.valor_usd, 0),
     'contratado_brl', coalesce(t.contratado_brl, 0),
     'aprovados_sem_contrato', coalesce(t.aprovados_sem_contrato, 0),
     'contrato_acima_do_tdr', coalesce(t.contrato_acima_do_tdr, 0),
     'por_status', coalesce(ts.por_status, '{}'::jsonb)),
  'contratos', jsonb_build_object(
     'total', coalesce(c.total, 0), 'valor_total_brl', coalesce(c.valor_total_brl, 0),
     'pago_brl', coalesce(ec.pago_brl, 0), 'a_pagar_brl', coalesce(ec.a_pagar_brl, 0),
     'saldo_brl', coalesce(c.valor_total_brl, 0) - coalesce(ec.pago_brl, 0),
     'aguardando_cobertura', coalesce(c.aguardando_cobertura, 0),
     'por_status', coalesce(cs.por_status, '{}'::jsonb)),
  'execucao_direta', jsonb_build_object(
     'pago_brl', coalesce(ed.pago_brl, 0), 'a_pagar_brl', coalesce(ed.a_pagar_brl, 0)),
  'produtos', jsonb_build_object(
     'total', coalesce(p.total, 0), 'pagos', coalesce(p.pagos, 0), 'a_pagar', coalesce(p.a_pagar, 0),
     'em_aberto', coalesce(p.em_aberto, 0), 'em_analise', coalesce(p.em_analise, 0),
     'devolvidos', coalesce(p.devolvidos, 0), 'valor_total_brl', coalesce(p.valor_total_brl, 0),
     'valor_pago_brl', coalesce(p.valor_pago_brl, 0), 'valor_a_pagar_brl', coalesce(p.valor_a_pagar_brl, 0)),
  'matriz', jsonb_build_object(
     'indicadores', coalesce(m.indicadores, 0), 'atingidos', coalesce(m.atingidos, 0),
     'em_andamento', coalesce(m.em_andamento, 0), 'sem_registro', coalesce(m.sem_registro, 0),
     'qualitativos', coalesce(m.qualitativos, 0), 'progresso_medio_pct', m.progresso_medio_pct),
  'tarefas', jsonb_build_object(
     'abertas', coalesce(k.abertas, 0), 'atrasadas', coalesce(k.atrasadas, 0),
     'bloqueadas', coalesce(k.bloqueadas, 0), 'concluidas', coalesce(k.concluidas, 0))
  ) order by a.codigo), '[]'::jsonb)
from atv a
left join vw_saldo_atividade s on s.id = a.id
left join tdr t   on t.atividade_id = a.id
left join tdr_st ts on ts.atividade_id = a.id
left join ctr c   on c.atividade_id = a.id
left join ctr_st cs on cs.atividade_id = a.id
left join ef ec   on ec.atividade_id = a.id and ec.com_contrato
left join ef ed   on ed.atividade_id = a.id and not ed.com_contrato
left join prod p  on p.atividade_id = a.id
left join mz m    on m.atividade_id = a.id
left join tk k    on k.atividade_id = a.id
left join resp rp on rp.atividade_id = a.id;
$$;

-- Indicadores da Matriz de Resultados (texto do indicador é institucional, não pessoal).
create or replace function public.fn_api_matriz()
returns jsonb language sql stable security definer set search_path = public as $$
with base as (
  select i.*, v.realizado_confirmado, v.realizado_pendente,
         row_number() over (partition by i.produto_codigo order by i.ordem, i.id) as pos
    from matriz_itens i join vw_matriz_progresso v on v.id = i.id
   where i.ativo
)
select coalesce(jsonb_agg(jsonb_build_object(
  'id', b.id, 'codigo', coalesce(b.produto_codigo, '?') || '·' || b.pos,
  'resultado', 'R' || b.resultado, 'produto', b.produto_titulo, 'indicador', b.indicador,
  'unidade', b.unidade, 'meta', b.meta_numerica,
  'confirmado', coalesce(b.realizado_confirmado, 0), 'pendente', coalesce(b.realizado_pendente, 0),
  'pct_confirmado', case when b.meta_numerica > 0 then round(b.realizado_confirmado / b.meta_numerica * 100, 1) end,
  'situacao', case when coalesce(b.meta_numerica, 0) = 0 then 'qualitativa'
                   when b.realizado_confirmado >= b.meta_numerica then 'atingida'
                   when b.realizado_confirmado > 0 or b.realizado_pendente > 0 then 'em_andamento'
                   else 'sem_registro' end,
  'ods', to_jsonb(coalesce(b.ods, '{}')), 'metas_km', to_jsonb(coalesce(b.metas_km, '{}')),
  'atividades', (select coalesce(jsonb_agg(a.codigo order by a.codigo), '[]'::jsonb)
                   from atividade_matriz am join atividades a on a.id = am.atividade_id
                  where am.matriz_item_id = b.id)
  ) order by b.resultado, b.produto_codigo, b.pos), '[]'::jsonb)
from base b;
$$;

-- Totais do projeto (soma das atividades) + totais por resultado.
create or replace function public.fn_api_resumo()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_atv jsonb := fn_api_atividades(); v_mz jsonb := fn_api_matriz(); v_cot record;
begin
  begin select * into v_cot from fn_cotacao_usd(current_date); exception when others then v_cot := null; end;
  return jsonb_build_object(
    'gerado_em', now(),
    'ptax', case when v_cot is null then null else to_jsonb(v_cot) end,
    'projeto', (select jsonb_build_object(
        'atividades', count(*),
        'orcamento_usd',        round(sum((x->'orcamento'->>'vigente_usd')::numeric), 2),
        'comprometido_usd',     round(sum((x->'orcamento'->>'comprometido_usd')::numeric), 2),
        'pago_usd',             round(sum((x->'orcamento'->>'pago_usd')::numeric), 2),
        'a_pagar_usd',          round(sum((x->'orcamento'->>'a_pagar_usd')::numeric), 2),
        'liberado_usd',         round(sum((x->'orcamento'->>'liberado_usd')::numeric), 2),
        'saldo_livre_usd',      round(sum((x->'orcamento'->>'saldo_livre_usd')::numeric), 2),
        'tdrs',                 sum((x->'tdrs'->>'total')::int),
        'contratos',            sum((x->'contratos'->>'total')::int),
        'contratos_valor_brl',  round(sum((x->'contratos'->>'valor_total_brl')::numeric), 2),
        'contratos_pago_brl',   round(sum((x->'contratos'->>'pago_brl')::numeric), 2),
        'produtos',             sum((x->'produtos'->>'total')::int),
        'produtos_pagos',       sum((x->'produtos'->>'pagos')::int),
        'tarefas_abertas',      sum((x->'tarefas'->>'abertas')::int),
        'tarefas_atrasadas',    sum((x->'tarefas'->>'atrasadas')::int))
      from jsonb_array_elements(v_atv) x),
    'matriz', (select jsonb_build_object(
        'indicadores', count(*),
        'atingidos',    count(*) filter (where y->>'situacao' = 'atingida'),
        'em_andamento', count(*) filter (where y->>'situacao' = 'em_andamento'),
        'sem_registro', count(*) filter (where y->>'situacao' = 'sem_registro'),
        'qualitativos', count(*) filter (where y->>'situacao' = 'qualitativa'),
        'progresso_medio_pct', round(avg(least(100, (y->>'pct_confirmado')::numeric)), 1))
      from jsonb_array_elements(v_mz) y),
    'por_resultado', (select coalesce(jsonb_agg(r order by r->>'resultado'), '[]'::jsonb) from (
        select jsonb_build_object('resultado', coalesce(x->>'resultado', 'sem resultado'), 'atividades', count(*),
          'orcamento_usd',    round(sum((x->'orcamento'->>'vigente_usd')::numeric), 2),
          'comprometido_usd', round(sum((x->'orcamento'->>'comprometido_usd')::numeric), 2),
          'pago_usd',         round(sum((x->'orcamento'->>'pago_usd')::numeric), 2),
          'saldo_livre_usd',  round(sum((x->'orcamento'->>'saldo_livre_usd')::numeric), 2)) r
        from jsonb_array_elements(v_atv) x group by x->>'resultado') z)
  );
end $$;

-- ── Permissões ──────────────────────────────────────────────────────────────
revoke execute on function public.fn_api_pode_administrar() from public, anon;
grant  execute on function public.fn_api_pode_administrar() to authenticated;
revoke execute on function public.fn_api_criar_cliente(text, text, text[], text[], timestamptz) from public, anon;
revoke execute on function public.fn_api_revogar_cliente(uuid) from public, anon;
revoke execute on function public.fn_api_clientes() from public, anon;
grant  execute on function public.fn_api_criar_cliente(text, text, text[], text[], timestamptz) to authenticated;
grant  execute on function public.fn_api_revogar_cliente(uuid) to authenticated;
grant  execute on function public.fn_api_clientes() to authenticated;

revoke execute on function public.fn_api_cliente(text) from public, anon, authenticated;
revoke execute on function public.fn_api_registrar(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.fn_api_atividades() from public, anon, authenticated;
revoke execute on function public.fn_api_matriz() from public, anon, authenticated;
revoke execute on function public.fn_api_resumo() from public, anon, authenticated;
grant  execute on function public.fn_api_cliente(text) to service_role;
grant  execute on function public.fn_api_registrar(uuid, text, text, integer, integer) to service_role;
grant  execute on function public.fn_api_atividades() to service_role;
grant  execute on function public.fn_api_matriz() to service_role;
grant  execute on function public.fn_api_resumo() to service_role;
