-- ═══════════════════════════════════════════════════════════════════════
-- SITE PÚBLICO — Galeria de Produtos (fn_publico_galeria_produtos)
-- ═══════════════════════════════════════════════════════════════════════
-- Alimenta site-publico/produtos.html (TdR 3.2/3.3).
--
-- Regras (política do Produto 1 + decisões da coordenação, pauta do Produto 3):
--   • entra só o produto com pelo menos um arquivo marcado como público no
--     Acervo e ainda válido (vw_acervo_publicacoes.valida = marcado, vigente,
--     classe produto, entrega aprovada). A marcação é a do Acervo
--     (fn_acervo_definir_publico, só super_admin) — no lugar da coluna
--     autorizado_divulgacao_publica prevista no Produto 1;
--   • mostra título, objeto do contrato, resultado, atividade, autoria (nome do
--     fornecedor/consultor — decisão de 01/10, confirmada na pauta) e a data da
--     aprovação; só a capa, sem download do arquivo;
--   • nunca valor, número de contrato, nota técnica, nome do arquivo ou
--     qualquer outro dado do fornecedor além do nome.
--
-- Capa: fn_publico_capa_caminho devolve o caminho no bucket privado
-- acervo-capas para a Edge Function publico-capa, que entrega a imagem. O
-- caminho é montado aqui a partir do midia_id (mesmo padrão de
-- js/acervo-capas.js: <obra_id>/<midia_id com [^a-zA-Z0-9._-] → '_'>.jpg), nunca lido de
-- acervo_capas.arquivo_url, que qualquer usuário logado pode alterar.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_publico_galeria_produtos()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with pub as (
    select p.obra_id, p.midia_id, m.rotulo
    from vw_acervo_publicacoes p
    join vw_acervo_midias m on m.midia_id = p.midia_id
    where p.valida
  ),
  capa as (
    -- 1ª capa já gerada entre os arquivos publicados da obra
    select distinct on (pub.obra_id) pub.obra_id, pub.midia_id
    from pub
    join acervo_capas c on c.midia_id = pub.midia_id and c.status = 'ok'
    order by pub.obra_id, pub.midia_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'obra_id',          o.obra_id,
           'numero_produto',   o.numero_produto,
           'titulo',           o.titulo,
           'objeto',           o.contrato_objeto,
           'resultado_codigo', r.codigo,
           'resultado_nome_pt', r.nome_pt,
           'resultado_nome_en', r.nome_en,
           'resultado_nome_es', r.nome_es,
           'atividade_codigo', a.codigo,
           'atividade_nome_pt', a.nome_pt,
           'atividade_nome_en', a.nome_en,
           'atividade_nome_es', a.nome_es,
           'eixo',             a.eixo,
           'autoria',          o.fornecedor_nome,
           'aprovado_em',      o.entrega_ref_data,
           'rotulos',          (select jsonb_agg(distinct pub.rotulo) from pub where pub.obra_id = o.obra_id),
           'capa',             (select capa.midia_id from capa where capa.obra_id = o.obra_id)
         ) order by r.codigo, a.codigo, o.numero_produto), '[]'::jsonb)
  from vw_acervo_obras o
  join atividades a on a.id = o.atividade_id
  join resultados r on r.id = a.resultado_id
  where o.obra_id in (select obra_id from pub)
$function$;

revoke all on function public.fn_publico_galeria_produtos() from public;
grant execute on function public.fn_publico_galeria_produtos() to anon, authenticated, service_role;

-- Caminho da capa no bucket acervo-capas, só para arquivo publicado e válido
-- com capa gerada. Só a Edge Function (service_role) chama.
create or replace function public.fn_publico_capa_caminho(p_midia_id text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.obra_id::text || '/' || regexp_replace(p.midia_id, '[^a-zA-Z0-9._-]', '_', 'g') || '.jpg'
  from vw_acervo_publicacoes p
  join acervo_capas c on c.midia_id = p.midia_id and c.status = 'ok'
  where p.midia_id = p_midia_id and p.valida
$function$;

revoke all on function public.fn_publico_capa_caminho(text) from public, anon, authenticated;
grant execute on function public.fn_publico_capa_caminho(text) to service_role;

-- ROPA: nome de autor (consultor pessoa física) passa a ser divulgado no site
insert into public.lgpd_tratamentos (
  codigo, nome, modulo, finalidade, operadores, base_legal, base_legal_detalhe,
  categorias_titulares, categorias_dados, tabelas, compartilhamento,
  transferencia_internacional, retencao_criterio, medidas_seguranca)
values (
  'TRAT-005',
  'Galeria de Produtos do site público (autoria dos produtos técnicos)',
  'acervo',
  'Divulgar no site público os produtos técnicos aprovados do Programa, com a autoria (nome do consultor ou da empresa), para transparência da execução e reconhecimento do trabalho.',
  'Supabase (banco e armazenamento); hospedagem do site público',
  'art7_iii_politica_publica',
  'Art. 7º, III (execução de políticas públicas — transparência da execução do Projeto 218BRA2001); autoria em produto contratado com recurso público. Não usa consentimento.',
  array['consultores pessoa física e representantes de empresas autores de produtos'],
  array['nome do autor (fornecedor)', 'capa do produto (1ª página do documento)'],
  array['acervo_publicacoes', 'acervo_capas', 'fornecedores'],
  'Público: qualquer visitante do site vê o nome do autor e a capa dos produtos liberados.',
  'Supabase (art. 33) — pendência geral do DIMA',
  'Enquanto o produto estiver marcado como público no Acervo; desmarcar ou reentregar o produto tira da galeria na hora.',
  'Só aparece o que o super_admin marca, arquivo a arquivo, no Acervo (com lembrete de conferir CPF e dados bancários na 1ª página); só arquivo vigente de produto aprovado; nunca valor, contrato, nota técnica, nome do arquivo nem outro dado do fornecedor; capa entregue por Edge Function a partir do bucket privado, sem copiar para bucket público.'
)
on conflict (codigo) do nothing;
