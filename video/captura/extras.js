// Dados fictícios extras: auditoria, remanejamento, patrimônio e mapa. Somados à base de dados.js.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const D = require('./dados.js')
const B = D.base
const { id, dia, ts, U } = D
const A = B.atividades

// ── Auditoria IA ──────────────────────────────────────────────
const exec = { id: id('ba000001'), concluido_em: ts(-0.2), iniciado_em: ts(-0.21), status: 'concluido', total_achados: 9, achados_criticos: 1, achados_altos: 2,
  resumo_geral: 'O projeto está saudável: execução dentro do planejado e razão orçamentário conferido. Um contrato aguarda cobertura de saldo e dois produtos estão com avaliação atrasada.' }
const ACH = [
  ['critico', 'financeiro', 'Orçamento: contrato acima do TDR sem cobertura', 'O contrato 4500570917 passou o valor do TDR e aguarda cobertura de saldo.', 'Pedir remanejamento de cobertura para a atividade 3.1.2.', 'Contrato 4500570917'],
  ['alto', 'produtos', 'Produto aguardando avaliação há 6 dias', 'O Produto 2 do contrato 4500570393 foi entregue e ainda não tem parecer.', 'Avaliar a entrega e anexar a nota técnica.', 'Contrato 4500570393 · Produto 2'],
  ['alto', 'tdr_contrato', 'Licitação encerra em 3 dias sem propostas registradas', 'O edital LIC-2026/011 encerra em 27/11 e ainda não há empresas interessadas.', 'Contatar a lista curta de empresas.', 'TDR 1.1.1-002'],
  ['medio', 'viagens', 'Prestação de contas de viagem pendente', 'A missão de campo 5 retornou há 7 dias e a prestação ainda não foi enviada.', 'Lembrar a equipe de anexar os comprovantes.', 'VGM-2026-031'],
  ['medio', 'matriz', 'Indicador sem contribuição registrada há 90 dias', 'O indicador "Produtos cadastrados" não recebe entrega desde agosto.', 'Verificar o cronograma da vitrine digital.', 'Matriz 2.2'],
  ['medio', 'qualidade_dados', 'Patrimônio: bem sem foto de frente', 'Dois bens incorporados em novembro estão sem a foto obrigatória da frente.', 'Fotografar no próximo inventário.', 'PAT-000148'],
  ['baixo', 'financeiro', 'Lançamento a pagar vence amanhã', 'O pagamento do Produto 3 do contrato 4500570131 vence em 25/11.', 'Programar o pagamento.', 'NF 2311'],
  ['info', 'financeiro', 'Orçamento: PTAX atualizada hoje', 'A cotação oficial do Banco Central foi gravada às 17h20.', '', 'PTAX 5,4187'],
  ['info', 'tdr_contrato', 'Três editais publicados nos últimos 30 dias', 'Pregão, concorrência e cotação de preços em andamento.', '', ''],
]
B.auditoria_execucoes = [exec, { ...exec, id: id('ba000002'), concluido_em: ts(-7), total_achados: 12, achados_criticos: 2 }]
B.auditoria_registros = ACH.map(([severidade, dominio, titulo, descricao, recomendacao, ref], i) => ({
  id: id('bb0000' + i), execucao_id: exec.id, severidade, dominio, titulo, descricao, recomendacao, referencia_label: ref, status: 'aberto', criado_em: ts(-0.2) }))

// ── Remanejamento ──────────────────────────────────────────────
B.vw_orcamento_atividade = B.vw_saldo_atividade.map((s, i) => {
  const a = A[i]
  const deb = s.comprometido_usd
  return { atividade_id: a.id, id: a.id, codigo: a.codigo, nome_pt: a.nome_pt, resultado_id: a.resultado_id, orcamento_vigente_usd: a.orcamento_usd,
    orcamento_original_usd: a.orcamento_original_usd, debito_usd: deb, reservado_usd: i === 2 ? 20000 : 0, saldo_usd: a.orcamento_usd - deb,
    remanejavel_usd: Math.max(0, a.orcamento_usd - deb - (i === 2 ? 20000 : 0)), deficit_usd: 0, tdrs_sem_valor_usd: 0 }
})
B.vw_orcamento_fontes_saldo = A.map((a, i) => ({ fonte_id: id('bc'), atividade_id: a.id, tipo: 'dotacao_original', descricao: 'Dotação original',
  liquido_usd: a.orcamento_usd, consumido_usd: B.vw_saldo_atividade[i].comprometido_usd, reservado_usd: i === 2 ? 20000 : 0,
  disponivel_usd: a.orcamento_usd - B.vw_saldo_atividade[i].comprometido_usd, livre_usd: a.orcamento_usd - B.vw_saldo_atividade[i].comprometido_usd, ordem_consumo: 1 }))
B.rem_cargos = [
  { codigo: 'coordenacao_solicitante', nome: 'Coordenação do projeto', ordem: 1 }, { codigo: 'unesco_financeiro', nome: 'UNESCO — Financeiro', ordem: 3 },
  { codigo: 'diretor', nome: 'Diretoria', ordem: 4 }, { codigo: 'secretario', nome: 'Secretaria', ordem: 5 }]
B.rem_cargo_titulares = [['coordenacao_solicitante', U.carlos], ['unesco_financeiro', U.rafael], ['diretor', U.ana], ['secretario', U.igor]]
  .map(([cargo, usuario_id]) => ({ id: id('bd'), cargo, usuario_id, vigencia_inicio: dia(-300), vigencia_fim: null, ato: 'Portaria 12/2026' }))
const rem = { id: id('be000001'), numero: 'REM-2026-007', tipo: 'livre', status: 'em_aprovacao', versao: 1, etapa_atual: 4, criado_por: U.carlos, criado_em: ts(-6),
  justificativa: 'Ampliar a formação de agentes ambientais com a economia do monitoramento de fauna, mantendo as metas da Matriz de Resultados.', total_usd: 20000 }
const rem2 = { ...rem, id: id('be000002'), numero: 'REM-2026-006', status: 'efetivado', etapa_atual: 6, criado_em: ts(-40), efetivado_em: ts(-30) }
const rem3 = { ...rem, id: id('be000003'), numero: 'REM-2026-005', status: 'efetivado', etapa_atual: 6, criado_em: ts(-70), efetivado_em: ts(-60) }
B.remanejamentos = [rem, rem2, rem3]
B.remanejamento_itens = [rem, rem2, rem3].flatMap((r, k) => [
  { id: id('bf'), remanejamento_id: r.id, atividade_id: A[[2, 4, 5][k]].id, valor_usd: -20000, ativo: true },
  { id: id('bf'), remanejamento_id: r.id, atividade_id: A[[9, 3, 6][k]].id, valor_usd: 20000, ativo: true }])
B.remanejamento_alocacoes = [{ item_id: B.remanejamento_itens[0].id, fonte_id: B.vw_orcamento_fontes_saldo[2].fonte_id, valor_usd: 20000, ativo: true, remanejamento_id: rem.id }]
const ETAPAS = [['solicitacao', 'coordenacao_solicitante', null, U.carlos, -6], ['liberacao_origem', null, A[2].id, U.igor, -5],
  ['unesco', 'unesco_financeiro', null, U.rafael, -2], ['diretoria', 'diretor', null, null], ['secretaria', 'secretario', null, null]]
B.vw_remanejamento_assinaturas = []
B.remanejamento_etapas = ETAPAS.map(([papel, cargo, atividade_id, quem, d], i) => {
  let assinatura_id = null
  if (quem) {
    assinatura_id = id('c1')
    B.vw_remanejamento_assinaturas.push({ id: assinatura_id, remanejamento_id: rem.id, usuario_id: quem, nome_completo: B.usuarios.find(u => u.id === quem).nome_completo,
      criado_em: ts(d), etapa_ordem: i + 1, decisao: 'aprovar', hash: 'a3f9…' })
  }
  return { id: id('c0'), remanejamento_id: rem.id, versao: 1, ordem: i + 1, papel, cargo, atividade_id, assinatura_id }
})
B.remanejamento_historico = [
  [U.carlos, 'enviado', -6, null], [U.carlos, 'aprovado', -6, 1], [U.igor, 'aprovado', -5, 2], [U.rafael, 'aprovado', -2, 3]]
  .map(([usuario_id, evento, d, etapa_ordem]) => ({ id: id('c2'), remanejamento_id: rem.id, usuario_id, evento, etapa_ordem, criado_em: ts(d) }))
B.contrato_coberturas = []; B.tdr_cancelamentos = []; B.tdr_cancelamento_etapas = []
B.atividade_responsaveis.push({ id: id('b2'), atividade_id: A[2].id, usuario_id: U.igor, papel: 'responsavel', ativo: true })
B.__rpc.fn_rem_hash = '9c1e4b7a02d6f35e8a41c7b9d0e2f6a13b58c94e7d21a0f6c3b8e5d47a92f1c0'

// ── Patrimônio ─────────────────────────────────────────────────
B.pat_categorias = [['informatica', 'Equipamentos de informática', 'computador'], ['campo', 'Equipamentos de campo', 'camera'], ['mobiliario', 'Mobiliário', 'caixa'], ['veiculos', 'Embarcações e veículos', 'caixa']]
  .map(([codigo, nome, icone], i) => ({ id: id('c3'), codigo, nome, icone, vida_util_meses: [60, 60, 120, 120][i], residual_pct: 10, controle: 'individual', ativo: true }))
B.pat_locais = ['Sede SEMA — Rio Branco', 'Base de campo — APA Lago Azul', 'Almoxarifado central'].map(nome => ({ id: id('c4'), nome, ativo: true }))
const BENS = [['Armadilha fotográfica com sensor infravermelho', 1, 1890, 'em_uso', U.igor, 1], ['Notebook 14" para análise de dados', 0, 6450, 'em_uso', U.julia, 0],
  ['Drone de mapeamento com câmera RGB', 1, 18900, 'em_uso', U.igor, 1], ['GPS de navegação portátil', 1, 2380, 'emprestado', U.bia, 1],
  ['Tablet robusto para coleta de campo', 0, 3120, 'em_uso', U.bia, 1], ['Barco de alumínio 6 m com motor', 3, 42500, 'em_estoque', null, 1],
  ['Estação meteorológica automática', 1, 9800, 'em_uso', U.julia, 1], ['Projetor multimídia', 0, 4100, 'em_manutencao', null, 0],
  ['Mesa de reunião 10 lugares', 2, 3600, 'em_uso', U.carlos, 0], ['Armadilha fotográfica com sensor infravermelho', 1, 1890, 'em_uso', U.igor, 1]]
B.vw_pat_bens = BENS.map(([descricao, c, v, situacao, resp, l], i) => ({
  id: id('c5'), numero: 'PAT-' + String(141 + i).padStart(6, '0'), descricao, categoria_id: B.pat_categorias[c].id, categoria_nome: B.pat_categorias[c].nome,
  categoria_codigo: B.pat_categorias[c].codigo, categoria_icone: B.pat_categorias[c].icone, valor_aquisicao_brl: v, valor_contabil_brl: Math.round(v * (0.78 + 0.02 * i)),
  valor_residual_brl: v * 0.1, situacao, condicao: i === 7 ? 'regular' : 'bom', responsavel_id: resp, responsavel_nome: resp ? B.usuarios.find(u => u.id === resp).nome_completo : null,
  local_id: B.pat_locais[l].id, local_nome: B.pat_locais[l].nome, dt_aquisicao: dia(-200 + i * 9), dt_inicio_uso: dia(-190 + i * 9), quantidade: 1, unidade: 'un',
  origem: 'compra_projeto', titularidade: 'projeto', marca: ['Bushnell', 'Dell', 'DJI', 'Garmin', 'Samsung', 'Levefort', 'Davis', 'Epson', 'Tok', 'Bushnell'][i],
  modelo: 'Modelo demo', numero_serie: 'SN-' + (73200 + i * 17), vida_util_meses: 60, residual_pct: 10, meses_depreciados: 6 + i, contrato_numero: '4500570393',
  nf_numero: String(2210 + i), nf_data: dia(-205 + i * 9), ultimo_inventario_em: ts(-30), termo_vigente: !!resp, termo_pendente: false, ocorrencia_aberta: false, baixa_pendente: false,
}))
B.pat_bens = B.vw_pat_bens
B.pat_termos = []; B.pat_ocorrencias = []; B.pat_baixas = []
Object.assign(B.__rpc, { fn_pat_pode_ver: true, fn_pat_pode_gerir: true, fn_pat_pode_coordenar: true, fn_pat_pode_ver_valor: true, fn_pat_a_incorporar: [],
  fn_pat_inv_lista: [{ id: id('c6'), numero: 'INV-2026-0003', situacao: 'aberto', titulo: 'Inventário anual 2026', criado_em: ts(-3), n_esperados: 148, n_conferidos: 117, n_comissao: 3 }] })

// ── Mapa ───────────────────────────────────────────────────────
const TIPOS = [['Monitoramento da biodiversidade', '📡', '#6366f1'], ['Extrativismo sustentável', '🌿', '#15803d'], ['Saneamento rural (fossa ecológica)', '🚽', '#7c3aed'],
  ['Energia solar comunitária', '⚡', '#ca8a04'], ['Recuperação de nascentes', '💧', '#0284c7']]
TIPOS.forEach(([t, emoji, cor], i) => { const mi = B.matriz_itens[i]; Object.assign(mi, { visivel_no_mapa: true, emoji, cor, produto_titulo: t }) })
B.produto_pontos_mapa = []
const rnd = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647 })()
for (let i = 0; i < 46; i++) {
  const apa = i % 2 ? 'Lago do Amapá' : 'Igarapé São Francisco'
  const c = apa === 'Lago do Amapá' ? [-10.035, -67.84] : [-9.94, -67.86]
  B.produto_pontos_mapa.push({ id: id('c7'), apa, lat: c[0] + (rnd() - 0.5) * 0.07, lng: c[1] + (rnd() - 0.5) * 0.09, nome: 'Ponto ' + (i + 1),
    tipo_atividade: TIPOS[i % TIPOS.length][0], geometry_type: 'ponto', criado_em: ts(-i), descricao: 'Entrega registrada (demonstração)' })
}
const geo = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'data', 'municipios_acre.geojson'), 'utf8'))
const rb = geo.features.filter(f => f.properties.nome === 'Rio Branco')
B.apa_demarcacoes = [{ id: id('c8'), nome: 'Município de Rio Branco', apa_key: 'outra', cor: '#facc15', visivel: true, created_at: ts(-100),
  geojson: { type: 'FeatureCollection', features: rb }, feature_colors: {}, style_config: { fillOpacity: 0.04, strokeWidth: 3 } }]
B.trilha_metadata = []; B.geometria_fotos = []

// ── Repositório de Referências (matérias e veículos inventados) ─────────────
const VEIC = ['Jornal da Floresta', 'Agência Amazônia Hoje', 'Rádio Rio Acre', 'Portal Verde Notícias']
const MAT = [['Projeto leva assistência técnica a extrativistas de castanha', 'Bioeconomia'], ['APAs de Rio Branco ganham plano de manejo participativo', 'Governança'],
  ['Armadilhas fotográficas registram onça-pintada em área protegida', 'Biodiversidade'], ['Agentes ambientais concluem formação nas comunidades', 'Capacitação'],
  ['Mapa interativo reúne as entregas do projeto no território', 'Transparência'], ['Diagnóstico socioambiental ouve 200 famílias das APAs', 'Social']]
B.repositorio_links = []
MAT.forEach(([titulo, cat], i) => (i < 4 ? [0, 1] : [i % 4]).forEach(v => B.repositorio_links.push({ id: id('d1'), titulo, url: `https://exemplo.org/noticias/${i}-${v}`,
  fonte: VEIC[(i + v) % 4], categoria: cat, idioma: 'pt', descricao: titulo + ' (matéria fictícia de demonstração).', imagem_url: null, ativo: true, inserido_em: ts(-60 + i * 9 + v), inserido_por: U.julia })))

// ── Acervo Digital ─────────────────────────────────────────────────────────
B.vw_acervo_obras = B.contratos_produtos.filter(p => ['pago', 'aprovado', 'em_analise'].includes(p.situacao)).slice(0, 14).map((p, i) => {
  const c = B.contratos.find(x => x.id === p.contrato_id), a = A.find(x => x.id === c.atividade_id), f = B.fornecedores.find(x => x.id === c.fornecedor_id)
  const r = B.resultados.find(x => x.id === a.resultado_id)
  return { obra_id: p.id, produto_id: p.id, numero_produto: p.numero_produto, titulo: p.descricao.replace(/^Produto \d+ — /, ''), atividade_codigo: a.codigo, atividade_nome: a.nome_pt,
    resultado_codigo: r.codigo, resultado_nome: r.nome_pt, fornecedor_nome: f.nome, contrato_numero: c.numero, contrato_objeto: c.objeto_pt,
    situacao_acervo: p.situacao === 'em_analise' ? 'em_avaliacao' : 'aprovado', total_vigentes: 2, total_superadas: i % 4 === 0 ? 1 : 0, total_midias: 2,
    entrega_ref_numero: 1, entrega_ref_data: dia(-120 + i * 6), dt_entrega: dia(-120 + i * 6), rotulos_vigentes: ['Relatório', 'Mapa'], rotulos_midia: ['Relatório', 'Mapa'],
    tipos_midia: ['documento', 'imagem'], criado_em: ts(-120 + i * 6), capa_midia_id: null, capa_url: null }
})
B.vw_acervo_midias = B.vw_acervo_obras.flatMap((o, i) => [
  { midia_id: 'm' + i + 'a', obra_id: o.obra_id, arquivo_nome: `relatorio-produto-${o.numero_produto}.pdf`, arquivo_url: '/x', rotulo: 'Relatório', midia_tipo: 'documento', extensao: 'pdf',
    versao_status: 'vigente', arquivo_tamanho: 2400000, adicionado_em: o.criado_em, numero_entrega: 1, origem: 'entrega_documentos' },
  { midia_id: 'm' + i + 'b', obra_id: o.obra_id, arquivo_nome: `mapa-tematico-${i}.png`, arquivo_url: '/x', rotulo: 'Mapa', midia_tipo: 'imagem', extensao: 'png',
    versao_status: 'vigente', arquivo_tamanho: 900000, adicionado_em: o.criado_em, numero_entrega: 1, origem: 'entrega_documentos' }])
B.vw_acervo_publicacoes = B.vw_acervo_obras.slice(0, 5).map((o, i) => ({ midia_id: 'm' + i + 'a', obra_id: o.obra_id, publico: true, valida: true }))
B.acervo_capas = []

// ── Pulso da Equipe ────────────────────────────────────────────────────────
B.__rpc.fn_pulso_ciclos = [['Pulso de novembro', 18, 82, 74, 41, true], ['Pulso de outubro', 22, 78, 70, 33, false], ['Pulso de setembro', 16, 73, 68, 25, false]]
  .map(([titulo, n, comp, sint, enps, aberto], i) => ({ id: id('d2'), titulo, n_respostas: n, aberto, meu: true, autor: 'Ana Ribeiro', criado_em: ts(-i * 30 - 3), fecha_em: ts(-i * 30 + 4),
    n_perguntas: 7, n_exportacoes: i, n_cadastrados: n - 4, n_convidados: 4, aceita_convidados: true, limite_convidados: 20, indices: { comprometimento: comp, sintonia: sint, enps }, token: 'demo', ultima_resposta: dia(-i * 30) }))

// ── Viagens (protocolos de demonstração) ───────────────────────────────────
const VG = [['VGM-2026-034', 'solicitado', 'Cruzeiro do Sul/AC', 'Oficina com cooperativas de açaí', 6], ['VGM-2026-031', 'em_prestacao', 'Brasília/DF', 'Reunião técnica com a UNESCO', -10],
  ['VGM-2026-028', 'aprovado', 'Xapuri/AC', 'Visita às áreas de manejo da castanha', 12], ['VGM-2026-022', 'realizado', 'Manaus/AM', 'Seminário regional de áreas protegidas', -40]]
B.viagem_protocolos = VG.map(([numero, situacao, destino_principal, objetivo, d], i) => ({ id: id('d3'), numero, situacao, destino_principal, objetivo, dt_saida: dia(d), dt_retorno: dia(d + 3),
  tdr_id: B.tdrs[17].id, atividade_id: A[11].id, criado_por: U.julia, criado_em: ts(d - 15), numero_sei: '0047.0123' + i, email_solicitante: 'julia@exemplo.org' }))
B.viagem_viajantes = B.viagem_protocolos.flatMap((p, i) => [['Júlia Prado', 'Analista ambiental'], ['Igor Albuquerque', 'Técnico de campo']].slice(0, i % 2 + 1).map(([nome, cargo]) =>
  ({ id: id('d4'), protocolo_id: p.id, nome, cargo, sit_passagem: p.situacao === 'solicitado' ? 'solicitado' : 'aprovado', sit_diaria: p.situacao === 'solicitado' ? 'solicitado' : 'aprovado', qtd_diarias: 3, valor_diaria: 380 })))
B.viagem_trechos = []; B.viagem_diarias_v2 = []; B.viagem_notif_log = []; B.viagem_devolucoes = []
B.__rpc.fn_viagem_fontes_permitidas = [{ tdr_id: B.tdrs[17].id, atividade_id: A[11].id }]
B.__rpc.fn_viagem_pode_decidir = true

// ── Usuários: módulos liberados (perfil = teto, liberação = chave) ─────────
const MODS = { [U.carlos]: ['atividades', 'tdrs', 'contratos', 'remanejamentos', 'matriz', 'relatorios', 'auditoria'], [U.julia]: ['atividades', 'tdrs', 'viagens', 'mapa', 'diagnostico'],
  [U.rafael]: ['financeiro', 'contratos', 'fornecedores', 'relatorios'], [U.bia]: ['atividades', 'produtos', 'mapa'], [U.igor]: ['patrimonio', 'viagens', 'diagnostico'] }
B.usuario_permissoes = Object.entries(MODS).flatMap(([u, ms]) => ms.map(m => ({ usuario_id: u, modulo: m, ativo: true, valido_de: dia(-200), valido_ate: null, em_revisao: m === 'diagnostico' })))
B.solicitacoes_senha = []; B.usuario_pedidos_acesso = [{ id: id('d5'), tipo: 'modulo', usuario_id: U.bia, modulo: 'acervo', justificativa: 'Consultar os produtos aprovados da atividade', origem: 'tela', criado_em: ts(-1) }]

// ── Site público: números e galeria ────────────────────────────────────────
B.__rpc.fn_publico_resumo_home = { atividades_ativas: 12, tdrs_aprovados: 13, tdrs_total: 19, produtos_entregues: 18, pontos_mapa: 46 }
B.__rpc.fn_publico_galeria_produtos = B.vw_acervo_obras.slice(0, 6).map(o => ({ obra_id: o.obra_id, titulo: o.titulo, objeto: o.contrato_objeto, resultado_codigo: o.resultado_codigo,
  atividade_codigo: o.atividade_codigo, numero_produto: o.numero_produto, autoria: o.fornecedor_nome, aprovado_em: o.entrega_ref_data, capa: null, rotulos: ['Relatório'], arquivos: [] }))

// ── Entregas de produto (avaliação) ────────────────────────────────────────
B.contratos_produtos_entregas = B.contratos_produtos.filter(p => ['em_analise', 'aprovado', 'pago'].includes(p.situacao)).map((p, i) => ({
  id: id('d6'), produto_id: p.id, contrato_produto_id: p.id, numero_entrega: 1, situacao: p.situacao === 'em_analise' ? 'em_analise' : 'aprovada',
  dt_entrega: dia(-[2, 30, 60][i % 3]), descricao: 'Entrega do ' + p.descricao.toLowerCase(), observacoes: 'Relatório e anexos conforme o plano de trabalho.',
  criado_por: U.bia, criado_em: ts(-[2, 30, 60][i % 3]), pct_aprovado: p.situacao === 'em_analise' ? null : 100, arquivo_url: null, fotos_urls: [] }))
B.entrega_documentos = B.contratos_produtos_entregas.map(e => ({ id: id('d7'), entrega_id: e.id, nome: 'relatorio-produto.pdf', rotulo: 'Relatório', url: '/x', criado_em: e.criado_em }))
B.nota_tecnica_conferencias = []; B.produto_notif_log = []; B.produto_matriz_contribuicao = []
Object.assign(B.__rpc, { fn_produto_permissoes: { registrar: true, avaliar: true, fornecedor: false }, fn_pode_avaliar_contrato: true })

module.exports = D
