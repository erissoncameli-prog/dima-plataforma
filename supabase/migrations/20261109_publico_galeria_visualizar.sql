-- ═══════════════════════════════════════════════════════════════════════
-- SITE PÚBLICO — Galeria de Produtos: visualizar o produto
-- ═══════════════════════════════════════════════════════════════════════
-- Pedido da reunião de homologação do Produto 3 (09/11/2026): na página
-- Produtos do site público, cada produto passa a ter a opção de visualizar o
-- documento. Antes a galeria mostrava só a capa (20261106_publico_galeria_produtos).
--
-- Regras (as mesmas da capa):
--   • só arquivo marcado como público no Acervo e ainda válido
--     (vw_acervo_publicacoes.valida) — a marcação continua só do super_admin,
--     arquivo a arquivo, com o lembrete de conferir CPF e dados bancários;
--   • só PDF (lido na própria página pelo visualizador do site);
--   • o arquivo sai do bucket privado pela Edge Function publico-produto, que
--     pergunta a fn_publico_arquivo_caminho — nada é copiado para bucket
--     público e o site nunca recebe a URL nem o nome do arquivo;
--   • nunca a nota técnica, comprovante, contrato ou versão devolvida
--     (valida já exige vigente, classe produto e entrega aprovada).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_publico_galeria_produtos()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with pub as (
    select p.obra_id, p.midia_id, m.rotulo, m.extensao
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
           'capa',             (select capa.midia_id from capa where capa.obra_id = o.obra_id),
           -- PDFs que o visitante pode ler na página (sem nome nem URL do arquivo)
           'arquivos',         coalesce((select jsonb_agg(jsonb_build_object('m', pub.midia_id, 'rotulo', pub.rotulo)
                                                          order by pub.midia_id)
                                         from pub where pub.obra_id = o.obra_id and lower(pub.extensao) = 'pdf'), '[]'::jsonb)
         ) order by r.codigo, a.codigo, o.numero_produto), '[]'::jsonb)
  from vw_acervo_obras o
  join atividades a on a.id = o.atividade_id
  join resultados r on r.id = a.resultado_id
  where o.obra_id in (select obra_id from pub)
$function$;

revoke all on function public.fn_publico_galeria_produtos() from public;
grant execute on function public.fn_publico_galeria_produtos() to anon, authenticated, service_role;

-- Bucket e caminho do PDF publicado e válido. As tabelas guardam a URL no formato
-- /object/public/<bucket>/<caminho> só como portadora do caminho (ver CLAUDE.md,
-- "Storage"). Só a Edge Function (service_role) chama.
create or replace function public.fn_publico_arquivo_caminho(p_midia_id text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object('bucket', x[1], 'caminho', x[2])
  from vw_acervo_publicacoes p
  join vw_acervo_midias m on m.midia_id = p.midia_id
  cross join lateral regexp_match(m.arquivo_url,
    '/storage/v1/object/(?:public|sign|authenticated)/([^/?]+)/([^?]+)') as x
  where p.midia_id = p_midia_id
    and p.valida
    and lower(m.extensao) = 'pdf'
  limit 1
$function$;

revoke all on function public.fn_publico_arquivo_caminho(text) from public, anon, authenticated;
grant execute on function public.fn_publico_arquivo_caminho(text) to service_role;

-- ROPA: o documento do produto passa a ser lido no site
update public.lgpd_tratamentos
set categorias_dados = array['nome do autor (fornecedor)', 'capa do produto (1ª página do documento)',
                             'documento do produto (leitura no site)'],
    compartilhamento = 'Público: qualquer visitante do site vê o nome do autor, a capa e pode ler o documento dos produtos liberados.',
    medidas_seguranca = 'Só aparece o que o super_admin marca, arquivo a arquivo, no Acervo (com lembrete de conferir CPF e dados bancários no documento); só arquivo vigente de produto aprovado; nunca valor, contrato, nota técnica, nome do arquivo nem outro dado do fornecedor; capa e documento (só PDF) entregues por Edge Function a partir do bucket privado, sem copiar para bucket público nem expor o endereço do arquivo.'
where codigo = 'TRAT-005';
