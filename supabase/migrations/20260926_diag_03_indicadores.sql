-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 03 — indicadores, agregados e sugestões
--
-- Cálculo num lugar só:
--   vw_diag_respostas    desmonta o jsonb (1 linha por ficha × pergunta × opção)
--   vw_diag_indicadores  contagens ADITIVAS por comunidade × sexo do
--                        respondente × validada — somar comunidades dá o
--                        município; somar municípios dá o geral
--   fn_diag_agregados    única saída de números para quem não lê fichas
--                        (técnico: só as próprias; visualizador: nenhuma),
--                        com supressão de células com menos de 5 fichas
-- Denominador = fichas em que a pergunta se aplicava E foi respondida
-- ("_nr" fica fora e é contado à parte). Texto aberto nunca entra aqui.
-- Fichas 'enviada' entram marcadas (validada = false), nunca escondidas.
-- ════════════════════════════════════════════════════════════════════════

create or replace view public.vw_diag_respostas
with (security_invoker = true) as
with base as (
  select f.id as ficha_id, f.questionario_id, f.status, (f.status = 'validada') as validada,
         f.municipio_ibge,
         coalesce(f.comunidade_id::text, 'nova:' || lower(btrim(f.comunidade_nova))) as comunidade_chave,
         coalesce(c.nome, f.comunidade_nova) as comunidade_nome,
         case when f.respostas->>'sexo_genero' in ('mulher','homem') then f.respostas->>'sexo_genero'
              else 'outro_ou_nao_informado' end as sexo_respondente,
         f.respostas, q.estrutura
  from public.diag_fichas f
  join public.diag_questionarios q on q.id = f.questionario_id
  left join public.diag_comunidades c on c.id = f.comunidade_id
  where f.status in ('enviada','validada') and f.aceitou_participar
)
select b.ficha_id, b.questionario_id, b.status, b.validada, b.municipio_ibge,
       b.comunidade_chave, b.comunidade_nome, b.sexo_respondente,
       p.bloco, p.pergunta->>'chave' as chave, (p.pergunta->>'n')::int as n, p.pergunta->>'tipo' as tipo,
       (v.val = '"_nr"'::jsonb) as nr,
       case when v.val = '"_nr"'::jsonb then null
            when p.pergunta->>'tipo' = 'unica' then v.val #>> '{}'
            when p.pergunta->>'tipo' = 'multipla' then mm.opcao end as opcao,
       case when p.pergunta->>'tipo' in ('inteiro','decimal') and jsonb_typeof(v.val) = 'number'
            then (v.val #>> '{}')::numeric end as valor_num
from base b
cross join lateral public.fn_diag_perguntas(b.estrutura) p
cross join lateral (select b.respostas -> (p.pergunta->>'chave') as val) v
left join lateral (select jsonb_array_elements_text(v.val) as opcao
                   where jsonb_typeof(v.val) = 'array') mm on true
where v.val is not null
  and p.pergunta->>'tipo' in ('unica','multipla','inteiro','decimal')
union all
-- tamanho do domicílio (linhas da P9) como pergunta numérica derivada
select b.ficha_id, b.questionario_id, b.status, b.validada, b.municipio_ibge,
       b.comunidade_chave, b.comunidade_nome, b.sexo_respondente,
       'identificacao', '_total_moradores', 9, 'inteiro', false, null,
       (select count(*) from public.diag_moradores m where m.ficha_id = b.ficha_id)::numeric
from base b
where exists (select 1 from public.diag_moradores m where m.ficha_id = b.ficha_id);

create or replace view public.vw_diag_indicadores
with (security_invoker = true) as
with por_ficha as (
  select distinct ficha_id, questionario_id, chave, n, tipo, validada, municipio_ibge,
         comunidade_chave, comunidade_nome, sexo_respondente, nr, valor_num
  from public.vw_diag_respostas
)
-- linha 'base': denominador (respondidas), não respostas e soma numérica
select 'base'::text as tipo_linha, questionario_id, chave, n, tipo, null::text as opcao,
       validada, municipio_ibge, comunidade_chave, max(comunidade_nome) as comunidade_nome, sexo_respondente,
       count(*) filter (where not nr) as n_fichas,
       count(*) filter (where nr)     as n_nr,
       sum(valor_num) filter (where not nr) as soma
from por_ficha
group by questionario_id, chave, n, tipo, validada, municipio_ibge, comunidade_chave, sexo_respondente
union all
-- linha 'opcao': quantas fichas marcaram cada opção
select 'opcao', questionario_id, chave, n, tipo, opcao,
       validada, municipio_ibge, comunidade_chave, max(comunidade_nome), sexo_respondente,
       count(distinct ficha_id), 0, null
from public.vw_diag_respostas
where opcao is not null
group by questionario_id, chave, n, tipo, opcao, validada, municipio_ibge, comunidade_chave, sexo_respondente;

-- ── Agregados com supressão ─────────────────────────────────────────────
-- p_nivel: 'geral' | 'municipio' | 'comunidade'
create or replace function public.fn_diag_agregados(
  p_nivel text default 'geral',
  p_municipio_ibge integer default null,
  p_por_sexo boolean default false,
  p_somente_validadas boolean default true,
  p_suprimir boolean default true,
  p_minimo integer default 5)
returns table (
  questionario_id uuid, chave text, n integer, tipo text, opcao text,
  recorte text, recorte_nome text, sexo_respondente text,
  n_validos bigint, n_nr bigint, n_opcao bigint, pct numeric, media numeric, suprimido boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_min int;
begin
  if not fn_diag_pode_ver_numeros() then
    raise exception 'diag:nao_autorizado';
  end if;
  if p_nivel not in ('geral','municipio','comunidade') then
    raise exception 'diag:parametro_invalido: nível %', p_nivel;
  end if;
  -- só quem já lê fichas pode desligar a supressão ou baixar o mínimo
  if (not p_suprimir or p_minimo < 5) and not (fn_diag_pode_gerir() or fn_diag_pode_consultar()) then
    p_suprimir := true; p_minimo := 5;
  end if;
  v_min := greatest(p_minimo, 1);

  return query
  with i as (
    select vi.*,
           case p_nivel when 'geral' then 'geral'
                        when 'municipio' then vi.municipio_ibge::text
                        else vi.comunidade_chave end as rec,
           case p_nivel when 'geral' then 'Todas as comunidades'
                        when 'municipio' then (select m.nome from diag_municipios m where m.ibge = vi.municipio_ibge)
                        else vi.comunidade_nome end as rec_nome,
           case when p_por_sexo then vi.sexo_respondente end as sx
    from vw_diag_indicadores vi
    where (not p_somente_validadas or vi.validada)
      and (p_municipio_ibge is null or vi.municipio_ibge = p_municipio_ibge)
  ),
  den as (
    select i.questionario_id, i.chave, i.n, i.tipo, i.rec, max(i.rec_nome) as rec_nome, i.sx,
           sum(i.n_fichas)::bigint as nv, sum(i.n_nr)::bigint as nnr, sum(i.soma) as soma
    from i where i.tipo_linha = 'base'
    group by i.questionario_id, i.chave, i.n, i.tipo, i.rec, i.sx
  ),
  num as (
    select i.questionario_id, i.chave, i.opcao, i.rec, i.sx, sum(i.n_fichas)::bigint as nop
    from i where i.tipo_linha = 'opcao'
    group by i.questionario_id, i.chave, i.opcao, i.rec, i.sx
  )
  select d.questionario_id, d.chave, d.n, d.tipo, u.opcao, d.rec, d.rec_nome, d.sx,
         d.nv, d.nnr,
         case when p_suprimir and d.nv < v_min then null else coalesce(u.nop, 0) end,
         case when p_suprimir and d.nv < v_min then null
              when u.opcao is null or d.nv = 0 then null
              else round(100.0 * coalesce(u.nop,0) / d.nv, 1) end,
         case when p_suprimir and d.nv < v_min then null
              when d.tipo in ('inteiro','decimal') and d.nv > 0 then round(d.soma / d.nv, 2) end,
         (p_suprimir and d.nv < v_min)
  from den d
  left join num u on u.questionario_id = d.questionario_id and u.chave = d.chave
                 and u.rec = d.rec and u.sx is not distinct from d.sx
  order by d.n, d.rec, d.sx, u.opcao;
end $$;

-- ── Sugestões a partir de respostas repetidas (P55, P31, colunas da P9) ─
create or replace function public.fn_diag_normalizar_texto(p text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(lower(translate(coalesce(p,''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuuccnn')), '\s+', ' ', 'g'))
$$;

-- chaves com sugestão ligada em alguma versão NÃO rascunho do questionário.
-- Colunas da P9 aparecem como 'moradores.<coluna>'.
create or replace function public.fn_diag_chaves_com_sugestao()
returns setof text language sql stable security definer set search_path = public as $$
  select distinct p.pergunta->>'chave'
  from diag_questionarios q, fn_diag_perguntas(q.estrutura) p
  where q.status <> 'rascunho' and coalesce((p.pergunta->>'sugestoes')::boolean, false)
  union
  select distinct 'moradores.' || (c->>'chave')
  from diag_questionarios q, jsonb_array_elements(q.estrutura->'moradores'->'colunas') c
  where q.status <> 'rascunho' and coalesce((c->>'sugestoes')::boolean, false)
$$;

-- p_chave NULL = todas as chaves ligadas (o app baixa tudo numa sincronização).
-- Devolve só o TEXTO: sem ficha, entrevistador, comunidade nem contagem.
create or replace function public.fn_diag_sugestoes(p_chave text default null)
returns table (chave text, texto text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (fn_diag_pode_aplicar() or fn_diag_pode_gerir()) then
    raise exception 'diag:nao_autorizado';
  end if;
  if p_chave is not null and p_chave not in (select * from fn_diag_chaves_com_sugestao()) then
    raise exception 'diag:parametro_invalido: sugestões não habilitadas para %', p_chave;
  end if;
  return query
  with chaves as (
    select k from fn_diag_chaves_com_sugestao() k where p_chave is null or k = p_chave
  ),
  brutos as (
    select k.k as chave, f.id as ficha_id, btrim(f.respostas->>k.k) as t
    from chaves k join diag_fichas f on f.status in ('enviada','validada')
    where k.k not like 'moradores.%' and jsonb_typeof(f.respostas->k.k) = 'string'
      and f.respostas->>k.k <> '_nr'
    union all
    select k.k, m.ficha_id, btrim(to_jsonb(m) ->> substr(k.k, 11))
    from chaves k join diag_moradores m on true
    join diag_fichas f on f.id = m.ficha_id and f.status in ('enviada','validada')
    where k.k like 'moradores.%'
  ),
  grupos as (
    select b.chave, fn_diag_normalizar_texto(b.t) as norm,
           mode() within group (order by b.t) as grafia,
           count(distinct b.ficha_id) as nfichas
    from brutos b
    where b.t is not null and length(b.t) between 2 and 120
    group by b.chave, fn_diag_normalizar_texto(b.t)
    having count(distinct b.ficha_id) >= 2
  )
  select g.chave, g.grafia
  from grupos g
  where not exists (select 1 from diag_sugestoes_ocultas o
                    where o.chave = g.chave and o.texto_normalizado = g.norm)
  order by g.chave, g.nfichas desc, g.grafia;
end $$;

revoke all on public.vw_diag_respostas, public.vw_diag_indicadores from anon, authenticated;
grant select on public.vw_diag_respostas, public.vw_diag_indicadores to authenticated;

revoke execute on function public.fn_diag_agregados(text, integer, boolean, boolean, boolean, integer),
  public.fn_diag_normalizar_texto(text), public.fn_diag_chaves_com_sugestao(),
  public.fn_diag_sugestoes(text)
  from public, anon;
grant execute on function public.fn_diag_agregados(text, integer, boolean, boolean, boolean, integer),
  public.fn_diag_normalizar_texto(text), public.fn_diag_chaves_com_sugestao(),
  public.fn_diag_sugestoes(text)
  to authenticated;
