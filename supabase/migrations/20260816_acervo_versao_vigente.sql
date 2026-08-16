-- ═══════════════════════════════════════════════════════════════════════
-- ACERVO — Edição de referência (versão vigente x versão superada)
-- ═══════════════════════════════════════════════════════════════════════
-- Corrige um defeito conceitual da primeira versão do acervo: ela tratava
-- "o arquivo existe" como "o arquivo vale". Quando um produto é devolvido
-- para correção e reentregue, a biblioteca listava a versão devolvida e a
-- aprovada lado a lado, com o mesmo peso, ordenadas só por data.
--
-- Uma biblioteca precisa da noção de EDIÇÃO DE REFERÊNCIA. Três camadas:
--
--   vigente   — arquivos da entrega de referência (a que vale hoje)
--   superada  — arquivos de entregas anteriores, preservados no histórico
--   instrucao — nota técnica, NF, despacho: não são versões do produto,
--               são a trilha que comprova a aprovação
--
-- A regra mora AQUI, na view, e não no JavaScript, para que relatórios,
-- auditoria e prestação de contas herdem a mesma resposta.
--
-- Entrega de referência = a entrega aprovada de maior número. Se nenhuma
-- foi aprovada ainda, é a última entrega submetida — e `situacao_acervo`
-- qualifica esse estado (em_correcao / em_avaliacao), de modo que a
-- biblioteca nunca apresente como aprovado algo que não foi.
-- ═══════════════════════════════════════════════════════════════════════

drop view if exists public.vw_acervo_obras cascade;
drop view if exists public.vw_acervo_midias cascade;
drop view if exists public.vw_acervo_entrega_ref cascade;


-- ── Entrega de referência por produto ─────────────────────────────────
create view public.vw_acervo_entrega_ref
with (security_invoker = true) as
select distinct on (e.produto_id)
  e.produto_id,
  e.id             as entrega_id,
  e.numero_entrega,
  e.situacao,
  e.tipo_decisao,
  e.pct_entregue,
  e.dt_entrega,
  e.despacho_numero,
  e.despacho_data
from public.contratos_produtos_entregas e
order by
  e.produto_id,
  (e.situacao = 'aprovada') desc,   -- aprovadas ganham de qualquer outra
  e.numero_entrega desc nulls last, -- entre elas, a mais recente
  e.criado_em desc;

comment on view public.vw_acervo_entrega_ref is
  'Entrega que vale por produto: a aprovada de maior número; se nenhuma foi aprovada, a última submetida.';


-- ── Mídias, agora com camada de versão ────────────────────────────────
create view public.vw_acervo_midias
with (security_invoker = true) as
with brutas as (
  select
    'documento:'  || ed.id::text                     as midia_id,
    'entrega_documento'::text                        as origem,
    e.produto_id                                     as obra_id,
    ed.entrega_id                                    as entrega_id,
    ed.tipo_documento::text                          as rotulo,
    ed.arquivo_url                                   as arquivo_url,
    ed.arquivo_nome                                  as arquivo_nome,
    ed.arquivo_tamanho                               as arquivo_tamanho,
    coalesce(ed.inserido_em, e.criado_em)            as adicionado_em,
    ed.inserido_por                                  as adicionado_por
  from public.entrega_documentos ed
  join public.contratos_produtos_entregas e on e.id = ed.entrega_id
  where ed.arquivo_url is not null

  union all

  select
    'entrega:' || e.id::text, 'entrega_arquivo', e.produto_id, e.id,
    'Produto entregue', e.arquivo_url, coalesce(e.arquivo_nome, 'Produto entregue'),
    null::bigint, coalesce(e.arquivo_data, e.criado_em), e.criado_por
  from public.contratos_produtos_entregas e
  where e.arquivo_url is not null

  union all

  select
    'nota:' || e.id::text, 'nota_tecnica', e.produto_id, e.id,
    'Nota Técnica', e.nota_tecnica_url, coalesce(e.nota_tecnica_nome, 'Nota Técnica'),
    null::bigint, coalesce(e.nota_tecnica_data, e.criado_em), e.despachado_por
  from public.contratos_produtos_entregas e
  where e.nota_tecnica_url is not null

  union all

  select
    'foto:' || e.id::text || ':' || u.ord::text, 'foto_evidencia', e.produto_id, e.id,
    'Registro fotográfico', u.url, coalesce(e.fotos_nomes[u.ord], 'Foto ' || u.ord::text),
    null::bigint, coalesce(e.arquivo_data, e.criado_em), e.criado_por
  from public.contratos_produtos_entregas e
  cross join lateral unnest(e.fotos_urls) with ordinality as u(url, ord)
  where e.fotos_urls is not null and u.url is not null

  union all

  select
    'produto:' || cp.id::text, 'produto_arquivo', cp.id, null::uuid,
    'Produto entregue', cp.arquivo_entrega_url, coalesce(cp.arquivo_entrega_nome, 'Produto entregue'),
    null::bigint, coalesce(cp.arquivo_entrega_data, cp.criado_em), cp.criado_por
  from public.contratos_produtos cp
  where cp.arquivo_entrega_url is not null
),
classificadas as (
  select
    b.*,
    -- Instrução = artefato administrativo que NUNCA é o entregável em si.
    -- Nota Fiscal e Declaração/Atestado ficam de fora de propósito: em
    -- contratos de fornecimento (coffee-break, bens) não existe relatório
    -- técnico, e a NF é a própria evidência da entrega.
    case
      when b.origem = 'nota_tecnica' then 'instrucao'
      when b.rotulo in ('Comprovante de Pagamento', 'Contrato / Aditivo') then 'instrucao'
      else 'produto'
    end as classe
  from brutas b
)
select
  c.midia_id,
  c.origem,
  c.obra_id,
  c.entrega_id,
  c.rotulo,
  c.arquivo_url,
  c.arquivo_nome,
  c.arquivo_tamanho,
  c.adicionado_em,
  c.adicionado_por,
  c.classe,
  public.fn_acervo_extensao(c.arquivo_nome, c.arquivo_url)   as extensao,
  public.fn_acervo_tipo_midia(c.arquivo_nome, c.arquivo_url) as midia_tipo,
  case
    when c.classe = 'instrucao'                then 'instrucao'
    when c.entrega_id is null                  then 'vigente'   -- arquivo legado, sem entrega
    when c.entrega_id = ref.entrega_id         then 'vigente'
    else 'superada'
  end as versao_status,
  e.numero_entrega,
  e.situacao        as entrega_situacao,
  e.tipo_decisao    as entrega_decisao,
  e.despacho_numero,
  e.dt_entrega      as entrega_data,
  cp.contrato_id,
  cont.atividade_id
from classificadas c
left join public.contratos_produtos_entregas e on e.id = c.entrega_id
join public.contratos_produtos cp    on cp.id = c.obra_id
join public.contratos cont           on cont.id = cp.contrato_id
left join public.vw_acervo_entrega_ref ref on ref.produto_id = c.obra_id;

comment on view public.vw_acervo_midias is
  'Catálogo do acervo — uma linha por arquivo, classificada em vigente | superada | instrucao segundo a entrega de referência do produto.';


-- ── Obras, com estado de acervo e contagens por camada ────────────────
create view public.vw_acervo_obras
with (security_invoker = true) as
select
  cp.id                                        as obra_id,
  cp.numero_produto,
  cp.descricao                                 as titulo,
  cp.situacao                                  as situacao_produto,
  cp.observacoes,
  cp.valor_brl,
  cp.valor_aprovado,
  cp.pct_aprovado,
  cp.dt_vencimento,
  cp.dt_entrega,
  cp.parecer_avaliador,
  cp.total_entregas,
  cp.criado_em,
  cp.atualizado_em,

  c.id                                         as contrato_id,
  c.numero                                     as contrato_numero,
  c.objeto_pt                                  as contrato_objeto,
  c.status::text                               as contrato_status,

  a.id                                         as atividade_id,
  a.codigo                                     as atividade_codigo,
  a.nome_pt                                    as atividade_nome,

  r.id                                         as resultado_id,
  r.codigo                                     as resultado_codigo,
  r.nome_pt                                    as resultado_nome,

  f.id                                         as fornecedor_id,
  f.nome                                       as fornecedor_nome,
  f.tipo                                       as fornecedor_tipo,

  -- Edição de referência
  ref.entrega_id                               as entrega_ref_id,
  ref.numero_entrega                           as entrega_ref_numero,
  ref.situacao                                 as entrega_ref_situacao,
  ref.tipo_decisao                             as entrega_ref_decisao,
  ref.dt_entrega                               as entrega_ref_data,
  ref.despacho_numero                          as entrega_ref_despacho,
  coalesce(ref.tipo_decisao = 'aprovacao_parcial', false) as aprovacao_parcial,

  -- Estado do produto do ponto de vista da biblioteca
  case
    when ref.entrega_id is null          then 'sem_entrega'
    when ref.situacao = 'aprovada'       then 'aprovado'
    when ref.situacao = 'devolvida'      then 'em_correcao'
    else 'em_avaliacao'
  end                                          as situacao_acervo,

  -- Contagens por camada
  coalesce(m.total_midias, 0)                  as total_midias,
  coalesce(m.total_vigentes, 0)                as total_vigentes,
  coalesce(m.total_superadas, 0)               as total_superadas,
  coalesce(m.total_instrucao, 0)               as total_instrucao,

  -- Formato/rótulo da EDIÇÃO VIGENTE: definem ícone da capa e prateleiras
  coalesce(m.tipos_midia, array[]::text[])     as tipos_midia,
  coalesce(m.rotulos_vigentes, array[]::text[]) as rotulos_vigentes,
  -- Todos os rótulos, inclusive instrução: alimentam o filtro por categoria
  coalesce(m.rotulos_todos, array[]::text[])   as rotulos_midia,

  m.publicado_em,
  coalesce(m.publicado_em, cp.dt_entrega::timestamptz, cp.criado_em) as ordenacao_em
from public.contratos_produtos cp
join public.contratos c         on c.id = cp.contrato_id
left join public.atividades a   on a.id = c.atividade_id
left join public.resultados r   on r.id = a.resultado_id
left join public.fornecedores f on f.id = c.fornecedor_id
left join public.vw_acervo_entrega_ref ref on ref.produto_id = cp.id
left join lateral (
  select
    count(*)                                                                       as total_midias,
    count(*) filter (where vm.versao_status = 'vigente')                           as total_vigentes,
    count(*) filter (where vm.versao_status = 'superada')                          as total_superadas,
    count(*) filter (where vm.versao_status = 'instrucao')                         as total_instrucao,
    array_agg(distinct vm.midia_tipo) filter (where vm.versao_status = 'vigente')  as tipos_midia,
    array_agg(distinct vm.rotulo)
      filter (where vm.versao_status = 'vigente' and vm.rotulo is not null)        as rotulos_vigentes,
    array_agg(distinct vm.rotulo) filter (where vm.rotulo is not null)             as rotulos_todos,
    max(vm.adicionado_em) filter (where vm.versao_status = 'vigente')              as publicado_em
  from public.vw_acervo_midias vm
  where vm.obra_id = cp.id
) m on true;

comment on view public.vw_acervo_obras is
  'Obras do acervo — um produto contratado por linha, com a edição de referência, o estado de acervo (aprovado | em_correcao | em_avaliacao | sem_entrega) e contagens por camada de versão.';


-- ── Grants ────────────────────────────────────────────────────────────
grant select on public.vw_acervo_entrega_ref to authenticated;
grant select on public.vw_acervo_midias      to authenticated;
grant select on public.vw_acervo_obras       to authenticated;

revoke all on public.vw_acervo_entrega_ref from anon;
revoke all on public.vw_acervo_midias      from anon;
revoke all on public.vw_acervo_obras       from anon;
