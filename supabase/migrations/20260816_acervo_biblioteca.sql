-- ═══════════════════════════════════════════════════════════════════════
-- ACERVO DIMA — Biblioteca Virtual de Produtos e Relatórios Técnicos
-- ═══════════════════════════════════════════════════════════════════════
-- Cria a camada catalográfica (somente leitura) que alimenta pages/acervo.html.
--
-- Princípios:
--   1. NENHUMA tabela nova. O acervo é uma *visão* sobre os arquivos que já
--      existem em contratos_produtos / contratos_produtos_entregas /
--      entrega_documentos. Não há duplicação de dado nem novo ponto de escrita.
--   2. security_invoker = true em todas as views — a visibilidade do acervo
--      cai automaticamente da policy `contratos_select` (super_admin,
--      coordenacao, financeiro, quem tem permissão extra, ou o responsável
--      pela atividade). Nenhuma policy nova é necessária.
--   3. As URLs continuam no formato /object/public/<bucket>/<path> por serem
--      apenas portadoras do caminho. O frontend assina toda leitura com os
--      helpers de js/config.js (buckets são privados).
-- ═══════════════════════════════════════════════════════════════════════


-- ── Helpers de classificação de mídia ─────────────────────────────────
-- Extraem extensão e tipo a partir do nome do arquivo (com fallback na URL),
-- para que view e frontend usem exatamente a mesma taxonomia.

create or replace function public.fn_acervo_extensao(p_nome text, p_url text default null)
returns text
language sql
immutable
parallel safe
as $$
  select lower(
    coalesce(
      substring(coalesce(p_nome, '') from '\.([A-Za-z0-9]{1,5})\s*$'),
      substring(split_part(coalesce(p_url, ''), '?', 1) from '\.([A-Za-z0-9]{1,5})$'),
      ''
    )
  )
$$;

comment on function public.fn_acervo_extensao(text, text) is
  'Extensão normalizada de um arquivo do acervo (minúscula, sem ponto).';


create or replace function public.fn_acervo_tipo_midia(p_nome text, p_url text default null)
returns text
language sql
immutable
parallel safe
as $$
  select case public.fn_acervo_extensao(p_nome, p_url)
    when 'pdf'  then 'documento'
    when 'doc'  then 'documento'
    when 'docx' then 'documento'
    when 'odt'  then 'documento'
    when 'rtf'  then 'documento'
    when 'txt'  then 'documento'
    when 'xls'  then 'planilha'
    when 'xlsx' then 'planilha'
    when 'ods'  then 'planilha'
    when 'csv'  then 'planilha'
    when 'ppt'  then 'apresentacao'
    when 'pptx' then 'apresentacao'
    when 'odp'  then 'apresentacao'
    when 'jpg'  then 'imagem'
    when 'jpeg' then 'imagem'
    when 'png'  then 'imagem'
    when 'gif'  then 'imagem'
    when 'webp' then 'imagem'
    when 'heic' then 'imagem'
    when 'svg'  then 'imagem'
    when 'mp4'  then 'video'
    when 'mov'  then 'video'
    when 'avi'  then 'video'
    when 'mkv'  then 'video'
    when 'webm' then 'video'
    when 'm4v'  then 'video'
    when 'mp3'  then 'audio'
    when 'wav'  then 'audio'
    when 'ogg'  then 'audio'
    when 'm4a'  then 'audio'
    when 'zip'  then 'pacote'
    when 'rar'  then 'pacote'
    when '7z'   then 'pacote'
    else 'outro'
  end
$$;

comment on function public.fn_acervo_tipo_midia(text, text) is
  'Taxonomia de mídia do acervo: documento | planilha | apresentacao | imagem | video | audio | pacote | outro.';


-- ── vw_acervo_midias — uma linha por ARQUIVO ──────────────────────────
-- Unifica as cinco origens de arquivo hoje espalhadas no modelo de produtos.
-- `midia_id` é sintético e estável (origem + id de origem + índice).

drop view if exists public.vw_acervo_midias cascade;

create view public.vw_acervo_midias
with (security_invoker = true) as
with brutas as (

  -- 1. Documentos anexados à entrega (fonte principal e já categorizada)
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

  -- 2. Arquivo principal da entrega
  select
    'entrega:' || e.id::text,
    'entrega_arquivo',
    e.produto_id,
    e.id,
    'Produto entregue',
    e.arquivo_url,
    coalesce(e.arquivo_nome, 'Produto entregue'),
    null::bigint,
    coalesce(e.arquivo_data, e.criado_em),
    e.criado_por
  from public.contratos_produtos_entregas e
  where e.arquivo_url is not null

  union all

  -- 3. Nota técnica de avaliação da entrega
  select
    'nota:' || e.id::text,
    'nota_tecnica',
    e.produto_id,
    e.id,
    'Nota Técnica',
    e.nota_tecnica_url,
    coalesce(e.nota_tecnica_nome, 'Nota Técnica'),
    null::bigint,
    coalesce(e.nota_tecnica_data, e.criado_em),
    e.despachado_por
  from public.contratos_produtos_entregas e
  where e.nota_tecnica_url is not null

  union all

  -- 4. Fotos de evidência (array paralelo url/nome)
  select
    'foto:' || e.id::text || ':' || u.ord::text,
    'foto_evidencia',
    e.produto_id,
    e.id,
    'Registro fotográfico',
    u.url,
    coalesce(e.fotos_nomes[u.ord], 'Foto ' || u.ord::text),
    null::bigint,
    coalesce(e.arquivo_data, e.criado_em),
    e.criado_por
  from public.contratos_produtos_entregas e
  cross join lateral unnest(e.fotos_urls) with ordinality as u(url, ord)
  where e.fotos_urls is not null and u.url is not null

  union all

  -- 5. Arquivo legado gravado direto no produto (antes do modelo de entregas)
  select
    'produto:' || cp.id::text,
    'produto_arquivo',
    cp.id,
    null::uuid,
    'Produto entregue',
    cp.arquivo_entrega_url,
    coalesce(cp.arquivo_entrega_nome, 'Produto entregue'),
    null::bigint,
    coalesce(cp.arquivo_entrega_data, cp.criado_em),
    cp.criado_por
  from public.contratos_produtos cp
  where cp.arquivo_entrega_url is not null
)
select
  b.midia_id,
  b.origem,
  b.obra_id,
  b.entrega_id,
  b.rotulo,
  b.arquivo_url,
  b.arquivo_nome,
  b.arquivo_tamanho,
  b.adicionado_em,
  b.adicionado_por,
  public.fn_acervo_extensao(b.arquivo_nome, b.arquivo_url)   as extensao,
  public.fn_acervo_tipo_midia(b.arquivo_nome, b.arquivo_url) as midia_tipo,
  e.numero_entrega,
  e.situacao        as entrega_situacao,
  e.tipo_decisao    as entrega_decisao,
  e.despacho_numero,
  e.dt_entrega      as entrega_data,
  cp.contrato_id,
  c.atividade_id
from brutas b
left join public.contratos_produtos_entregas e on e.id = b.entrega_id
join public.contratos_produtos cp on cp.id = b.obra_id
join public.contratos c            on c.id = cp.contrato_id;

comment on view public.vw_acervo_midias is
  'Catálogo do acervo — uma linha por arquivo entregue, unificando entrega_documentos, arquivo/nota técnica/fotos da entrega e o arquivo legado do produto.';


-- ── vw_acervo_obras — uma linha por PRODUTO CONTRATADO ────────────────
-- A "obra" da biblioteca. Inclui produtos ainda sem arquivo (prateleira
-- "Em produção"), por isso o agregado de mídias é LEFT JOIN LATERAL.

drop view if exists public.vw_acervo_obras cascade;

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

  coalesce(m.total_midias, 0)                  as total_midias,
  coalesce(m.tipos_midia, array[]::text[])     as tipos_midia,
  coalesce(m.rotulos, array[]::text[])         as rotulos_midia,
  m.publicado_em,
  -- Data usada para ordenar a estante: última mídia, senão entrega, senão criação
  coalesce(m.publicado_em, cp.dt_entrega::timestamptz, cp.criado_em) as ordenacao_em
from public.contratos_produtos cp
join public.contratos c        on c.id = cp.contrato_id
left join public.atividades a  on a.id = c.atividade_id
left join public.resultados r  on r.id = a.resultado_id
left join public.fornecedores f on f.id = c.fornecedor_id
left join lateral (
  select
    count(*)                                            as total_midias,
    array_agg(distinct vm.midia_tipo)                   as tipos_midia,
    array_agg(distinct vm.rotulo) filter (where vm.rotulo is not null) as rotulos,
    max(vm.adicionado_em)                               as publicado_em
  from public.vw_acervo_midias vm
  where vm.obra_id = cp.id
) m on true;

comment on view public.vw_acervo_obras is
  'Obras do acervo — uma linha por produto contratado, com metadados de contrato/atividade/resultado/fornecedor e agregados de mídia. Produtos sem arquivo aparecem com total_midias = 0.';


-- ── Grants ────────────────────────────────────────────────────────────
-- Somente authenticated. O papel anon NUNCA recebe grant (ver CLAUDE.md).
grant select on public.vw_acervo_midias to authenticated;
grant select on public.vw_acervo_obras  to authenticated;

revoke all on public.vw_acervo_midias from anon;
revoke all on public.vw_acervo_obras  from anon;
