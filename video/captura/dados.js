// Dados FICTÍCIOS para as capturas do vídeo publicitário.
// Nenhum nome, CPF, contrato ou valor real: tudo aqui foi inventado para demonstração.
'use strict'

let n = 0
const id = p => `${p}-0000-4000-8000-${String(++n).padStart(12, '0')}`
const hoje = new Date('2026-11-24T12:00:00Z')
const dia = d => new Date(hoje.getTime() + d * 864e5).toISOString().slice(0, 10)
const ts = d => new Date(hoje.getTime() + d * 864e5).toISOString()
const COT = 5.42
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647 })()
const pick = a => a[Math.floor(rnd() * a.length)]

const U = {
  ana: id('a0000001'), carlos: id('a0000002'), julia: id('a0000003'), rafael: id('a0000004'), bia: id('a0000005'), igor: id('a0000006'),
}
const usuarios = [
  { id: U.ana, nome_completo: 'Ana Ribeiro', email: 'ana@exemplo.org', perfil: 'super_admin', ativo: true, idioma_pref: 'pt', cargo: 'Coordenação geral', criado_em: ts(-400), ultimo_acesso_em: ts(0) },
  { id: U.carlos, nome_completo: 'Carlos Menezes', email: 'carlos@exemplo.org', perfil: 'coordenacao', ativo: true, criado_em: ts(-380), ultimo_acesso_em: ts(-1) },
  { id: U.julia, nome_completo: 'Júlia Prado', email: 'julia@exemplo.org', perfil: 'tecnico', ativo: true, criado_em: ts(-300), ultimo_acesso_em: ts(-2) },
  { id: U.rafael, nome_completo: 'Rafael Costa', email: 'rafael@exemplo.org', perfil: 'financeiro', ativo: true, criado_em: ts(-280), ultimo_acesso_em: ts(0) },
  { id: U.bia, nome_completo: 'Beatriz Nunes', email: 'beatriz@exemplo.org', perfil: 'tecnico', ativo: true, criado_em: ts(-200), ultimo_acesso_em: ts(-3) },
  { id: U.igor, nome_completo: 'Igor Albuquerque', email: 'igor@exemplo.org', perfil: 'tecnico', ativo: true, criado_em: ts(-150), ultimo_acesso_em: ts(-1) },
]
const equipe = [U.julia, U.bia, U.igor, U.carlos]

const resultados = [
  { id: id('b0000001'), codigo: 'R1', nome_pt: 'Gestão das Áreas Protegidas fortalecida', ordem: 1 },
  { id: id('b0000002'), codigo: 'R2', nome_pt: 'Cadeias produtivas da sociobiodiversidade', ordem: 2 },
  { id: id('b0000003'), codigo: 'R3', nome_pt: 'Regularização ambiental e monitoramento', ordem: 3 },
  { id: id('b0000004'), codigo: 'R4', nome_pt: 'Educação ambiental e participação social', ordem: 4 },
]

const ATV = [
  ['1.1.1', 'Plano de manejo da APA do Lago Azul', 0, 'CONTRATADO', 420000, [15, 13], [3]],
  ['1.1.2', 'Sinalização e infraestrutura de uso público', 0, 'LICITACAO', 260000, [15, 11], [3, 12]],
  ['1.2.1', 'Monitoramento da biodiversidade com armadilhas fotográficas', 0, 'CONTRATADO', 310000, [15], [4, 21]],
  ['2.1.1', 'Assistência técnica às cadeias da castanha e do açaí', 1, 'CONTRATADO', 380000, [8, 1, 2], [9, 10]],
  ['2.1.2', 'Boas práticas de manejo florestal comunitário', 1, 'ELABORACAO', 190000, [15, 8], [10]],
  ['2.2.1', 'Feira e vitrine digital da sociobiodiversidade', 1, 'ELABORADO', 140000, [12, 8], [16]],
  ['3.1.1', 'Análise e validação do Cadastro Ambiental Rural', 2, 'CONTRATADO', 520000, [15, 16], [1, 2]],
  ['3.1.2', 'Sistema de monitoramento do desmatamento', 2, 'CONTRATADO', 450000, [13, 15], [1, 20]],
  ['3.2.1', 'Diagnóstico socioambiental das APAs', 2, 'CONTRATADO', 230000, [1, 10, 18], [22]],
  ['4.1.1', 'Formação de agentes ambientais comunitários', 3, 'LICITACAO', 210000, [4, 5], [21, 22]],
  ['4.1.2', 'Campanha de comunicação e educação ambiental', 3, 'ELABORACAO', 160000, [4, 13], [16, 21]],
  ['2.1.7', 'Passagens e diárias da equipe técnica', 3, 'CONTRATADO', 76190, [17], []],
]
const atividades = ATV.map(([codigo, nome, r, fase, orc, ods, km], i) => ({
  id: id('c00000' + String(i).padStart(2, '0')), codigo, nome_pt: nome, nome_en: nome, nome_es: nome, fase,
  orcamento_usd: orc, orcamento_original_usd: i === 4 ? orc - 20000 : i === 2 ? orc + 20000 : orc,
  resultado_id: resultados[r].id, responsavel_id: equipe[i % equipe.length], ativo: true, ods, metas_km: km,
  descricao_pt: nome, criado_em: ts(-400 + i), atualizado_em: ts(-i),
}))

const FORN = ['Instituto Floresta Viva', 'Geoterra Consultoria Ambiental', 'Cooperativa Raízes da Amazônia', 'Ecotrilha Engenharia',
  'Núcleo de Estudos Socioambientais', 'Verde Dados Tecnologia', 'Mariana Teles Consultoria', 'Ateliê Comunicação Sustentável',
  'Rede Castanha Viva', 'Fotonatura Equipamentos']
const fornecedores = FORN.map((nome, i) => ({
  id: id('d00000' + String(i).padStart(2, '0')), codigo_interno: 100 + i, nome, tipo: i === 6 ? 'PF' : 'PJ', ativo: true,
  email: 'contato@exemplo.org', cidade: 'Rio Branco', uf: 'AC', criado_em: ts(-350 + i * 10),
}))

// TDRs: [atividade, seq, status, valor_brl, fornecedor, tipo]
const TDR = [
  [0, 1, 'contratado', 980000, 0, 'PJ'], [0, 2, 'em_licitacao', 420000, null, 'PJ'], [1, 1, 'em_licitacao', 780000, null, 'PJ'],
  [2, 1, 'contratado', 1150000, 9, 'PJ'], [2, 2, 'aprovado', 260000, null, 'PF'], [3, 1, 'contratado', 1320000, 2, 'PJ'],
  [3, 2, 'contratado', 410000, 8, 'PJ'], [4, 1, 'revisao_interna', 520000, null, 'PJ'], [4, 2, 'rascunho', 180000, null, 'PF'],
  [5, 1, 'enviado_unesco', 460000, null, 'PJ'], [6, 1, 'contratado', 1980000, 1, 'PJ'], [6, 2, 'contratado', 310000, 6, 'PF'],
  [7, 1, 'contratado', 1760000, 5, 'PJ'], [8, 1, 'contratado', 860000, 4, 'PJ'], [9, 1, 'em_licitacao', 640000, null, 'PJ'],
  [10, 1, 'retorno_unesco', 520000, null, 'PJ'], [10, 2, 'ajustes', 150000, null, 'PF'], [11, 1, 'aprovado', 400000, null, 'PJ'],
  [7, 2, 'cancelado', 220000, null, 'PF'],
]
const OBJ = ['Elaboração do plano de manejo e zoneamento', 'Contratação de serviços de sinalização interpretativa', 'Projeto executivo de infraestrutura de visitação',
  'Aquisição e instalação de armadilhas fotográficas', 'Consultoria em identificação de fauna', 'Assistência técnica e extensão rural às cooperativas',
  'Capacitação em boas práticas de coleta da castanha', 'Plano de manejo florestal comunitário', 'Consultoria em certificação participativa',
  'Plataforma de comercialização da sociobiodiversidade', 'Análise e validação de cadastros ambientais', 'Consultoria jurídica em regularização fundiária',
  'Sistema de alertas de desmatamento por satélite', 'Diagnóstico socioambiental participativo', 'Formação de agentes ambientais',
  'Produção de campanha educativa multimídia', 'Consultoria em comunicação comunitária', 'Passagens e diárias (execução direta)', 'Estudo de capacidade de carga']
const tdrs = TDR.map(([a, s, status, brl, f, tipo], i) => ({
  id: id('e00000' + String(i).padStart(2, '0')), atividade_id: atividades[a].id, numero: `${atividades[a].codigo}-00${s}`, tipo, status,
  objeto_pt: OBJ[i], valor_brl: brl, valor_usd: +(brl / COT).toFixed(2), fornecedor_id: f == null ? null : fornecedores[f].id,
  execucao_direta: a === 11, modalidade_licitacao: status === 'em_licitacao' ? pick(['Pregão eletrônico', 'Concorrência', 'Cotação de preços']) : null,
  numero_processo: status === 'em_licitacao' ? `LIC-2026/0${10 + i}` : null, dt_licitacao: status === 'em_licitacao' ? dia(-10 - i) : null,
  criado_em: ts(-300 + i * 9), atualizado_em: ts(-i * 2), criado_por: U.julia,
}))

const contratadosTdr = tdrs.filter(t => t.status === 'contratado')
const contratos = contratadosTdr.map((t, i) => {
  const total = Math.round(t.valor_brl * (0.86 + rnd() * 0.12))
  const util = Math.round(total * [0.72, 0.45, 0.9, 0.33, 0.6, 0.15, 0.81, 0.52, 0.27][i % 9])
  return {
    id: id('f00000' + String(i).padStart(2, '0')), numero: `45005${70000 + i * 131}`, tdr_id: t.id, fornecedor_id: t.fornecedor_id,
    atividade_id: t.atividade_id, objeto_pt: t.objeto_pt, tipo: i === 1 ? 'Equipamentos' : 'Serviços', valor_total_brl: total,
    valor_utilizado_brl: util, valor_comprometido_brl: Math.round(total * 0.12), saldo_brl: total - util,
    dt_inicio: dia(-260 + i * 12), dt_fim: dia(120 + i * 30), status: i === 7 ? 'aguardando_cobertura' : 'vigente', criado_em: ts(-260 + i * 12),
  }
})

const PROD = ['Plano de trabalho', 'Relatório de diagnóstico', 'Relatório parcial', 'Relatório final', 'Mapa temático', 'Oficinas realizadas']
const contratos_produtos = []
const execucao_financeira = []
contratos.forEach((c, ci) => {
  const nprod = 4
  for (let k = 1; k <= nprod; k++) {
    const v = Math.round(c.valor_total_brl / nprod)
    const sit = k === 1 || (k === 2 && ci % 3 !== 2) ? 'pago' : k === 2 || (k === 3 && ci % 2 === 0) ? (ci % 2 ? 'em_analise' : 'aprovado') : 'pendente'
    const pid = id('aa0000' + String(contratos_produtos.length).padStart(2, '0'))
    contratos_produtos.push({ id: pid, contrato_id: c.id, numero_produto: k, descricao: `Produto ${k} — ${PROD[(k + ci) % PROD.length]}`, valor_brl: v,
      situacao: sit, dt_vencimento: dia(-120 + k * 45 + ci * 3), pct_aprovado: sit === 'pago' ? 100 : null, valor_aprovado: sit === 'pago' ? v : null, criado_em: ts(-200 + k) })
    if (sit === 'pago' || sit === 'aprovado') {
      execucao_financeira.push({ id: id('ab0000' + String(execucao_financeira.length).padStart(2, '0')), atividade_id: c.atividade_id, contrato_id: c.id,
        fornecedor_id: c.fornecedor_id, tdr_id: c.tdr_id, descricao: `Pagamento do produto ${k} — contrato ${c.numero}`, numero_nf: `NF ${2300 + execucao_financeira.length}`,
        valor_brl: v, valor_usd: +(v / COT).toFixed(2), valor_usd_unesco: sit === 'pago' ? +(v / 5.38).toFixed(2) : null, situacao: sit === 'pago' ? 'pago' : 'a_pagar',
        numero_produto: k, dt_vencimento: dia(-90 + k * 30), dt_pagamento: sit === 'pago' ? dia(-100 + k * 28 + ci) : null, criado_em: ts(-120 + k * 20 + ci) })
    }
  }
})
// viagens (execução direta)
for (let i = 0; i < 6; i++) {
  const v = 4200 + i * 1150
  execucao_financeira.push({ id: id('ac0000' + String(i).padStart(2, '0')), atividade_id: atividades[11].id, contrato_id: null, fornecedor_id: null,
    tdr_id: tdrs[17].id, descricao: `Passagens e diárias — missão de campo ${i + 1}`, valor_brl: v, valor_usd: +(v / COT).toFixed(2),
    valor_usd_unesco: +(v / 5.38).toFixed(2), situacao: i < 4 ? 'pago' : 'a_pagar', dt_vencimento: dia(-60 + i * 10), dt_pagamento: i < 4 ? dia(-62 + i * 10) : null, criado_em: ts(-70 + i * 10) })
}

const vw_saldo_atividade = atividades.map(a => {
  const ts_ = tdrs.filter(t => t.atividade_id === a.id && t.status !== 'cancelado')
  const comp = ts_.reduce((s, t) => s + t.valor_usd, 0)
  const lanc = execucao_financeira.filter(l => l.atividade_id === a.id)
  const pago = lanc.filter(l => l.situacao === 'pago').reduce((s, l) => s + (l.valor_usd_unesco || l.valor_usd), 0)
  const ap = lanc.filter(l => l.situacao === 'a_pagar').reduce((s, l) => s + l.valor_usd, 0)
  const comprometido = Math.min(comp, a.orcamento_usd * 0.98)
  return { id: a.id, atividade_id: a.id, codigo: a.codigo, nome_pt: a.nome_pt, resultado_id: a.resultado_id, orcamento_usd: a.orcamento_usd,
    comprometido_usd: comprometido, tdrs_usd: comprometido, excedente_contrato_usd: 0, pago_usd: pago, a_pagar_usd: ap, liberado_usd: 0,
    saldo_livre_usd: a.orcamento_usd - comprometido }
})

const MI = [
  [1, '1.1', 'Áreas protegidas com plano de manejo aprovado', 'Planos de manejo aprovados', 2, 'un', [15], [3], 1, 0],
  [1, '1.1', 'Hectares sob gestão efetiva', 'Hectares sob gestão efetiva', 120000, 'ha', [15, 13], [3], 86000, 9000],
  [1, '1.2', 'Espécies monitoradas por armadilhas fotográficas', 'Espécies registradas', 60, 'espécies', [15], [4], 47, 6],
  [2, '2.1', 'Famílias com assistência técnica', 'Famílias atendidas', 600, 'famílias', [1, 8], [9, 10], 612, 0],
  [2, '2.1', 'Aumento de renda das cooperativas', 'Aumento da renda (%)', 20, '%', [8, 10], [10], 12, 3],
  [2, '2.2', 'Produtos da sociobiodiversidade na vitrine digital', 'Produtos cadastrados', 80, 'produtos', [12], [16], 34, 10],
  [3, '3.1', 'Cadastros ambientais analisados', 'CAR analisados', 4000, 'cadastros', [15, 16], [1], 3120, 240],
  [3, '3.1', 'Alertas de desmatamento qualificados', 'Alertas qualificados', 500, 'alertas', [13, 15], [1, 20], 512, 0],
  [3, '3.2', 'Domicílios entrevistados no diagnóstico', 'Entrevistas realizadas', 200, 'entrevistas', [1, 10, 18], [22], 143, 21],
  [4, '4.1', 'Agentes ambientais formados', 'Agentes formados', 120, 'pessoas', [4, 5], [21, 22], 64, 18],
  [4, '4.1', 'Mulheres e jovens nas formações', 'Participação feminina (%)', 50, '%', [5, 10], [22], 54, 0],
  [4, '4.2', 'Pessoas alcançadas pela campanha', 'Pessoas alcançadas', 50000, 'pessoas', [4, 13], [21], 21000, 4200],
]
const matriz_itens = MI.map(([r, pc, titulo, ind, meta, un, ods, km], i) => ({
  id: id('ad0000' + String(i).padStart(2, '0')), resultado: r, produto_codigo: pc, produto_titulo: titulo, indicador: ind, meta_numerica: meta,
  unidade: un, ods, metas_km: km, ativo: true, ordem: i, linha_base: 0, meios_verificacao: 'Relatórios técnicos aprovados',
}))
const vw_matriz_progresso = MI.map((m, i) => ({ id: matriz_itens[i].id, confirmado: m[8], pendente: m[9], realizado_confirmado: m[8], realizado_pendente: m[9], realizado_total: m[8] + m[9], meta_numerica: m[4],
  pct_confirmado: Math.round(m[8] / m[4] * 1000) / 10, pct_total: Math.round((m[8] + m[9]) / m[4] * 1000) / 10 }))
const atividade_matriz = matriz_itens.map((mi, i) => ({ atividade_id: atividades[[0, 0, 2, 3, 3, 5, 6, 7, 8, 9, 9, 10][i]].id, matriz_item_id: mi.id }))
const vw_matriz_contribuicoes = matriz_itens.flatMap((mi, i) => [0, 1].map(k => ({ id: id('ae0000' + i + k), matriz_item_id: mi.id, produto_id: contratos_produtos[(i * 2 + k) % contratos_produtos.length].id,
  valor: Math.round(MI[i][8] / 2), status: k === 1 && MI[i][9] ? 'pendente' : 'confirmado', entrega_dt: dia(-150 + i * 9 + k * 20), entrega_numero: 1, entrega_situacao: 'aprovada' })))

const ODS_NOMES = ['Erradicação da pobreza', 'Fome zero e agricultura sustentável', 'Saúde e bem-estar', 'Educação de qualidade', 'Igualdade de gênero',
  'Água potável e saneamento', 'Energia limpa e acessível', 'Trabalho decente e crescimento econômico', 'Indústria, inovação e infraestrutura',
  'Redução das desigualdades', 'Cidades e comunidades sustentáveis', 'Consumo e produção responsáveis', 'Ação contra a mudança global do clima',
  'Vida na água', 'Vida terrestre', 'Paz, justiça e instituições eficazes', 'Parcerias e meios de implementação', 'Igualdade étnico-racial']
const ODS_COR = ['#E5243B', '#DDA63A', '#4C9F38', '#C5192D', '#FF3A21', '#26BDE2', '#FCC30B', '#A21942', '#FD6925', '#DD1367', '#FD9D24', '#BF8B2E', '#3F7E44', '#0A97D9', '#56C02B', '#00689D', '#19486A', '#7B3110']
const ods_refs = ODS_NOMES.map((nome, i) => ({ numero: i + 1, id: i + 1, nome_pt: nome, nome: nome, cor: ODS_COR[i], descricao: nome, no_projeto: true }))
const metas_km_refs = Array.from({ length: 23 }, (_, i) => ({ numero: i + 1, id: i + 1, titulo_pt: `Meta ${i + 1}`, resumo: `Meta ${i + 1} do Marco Global Kunming-Montreal`, no_projeto: true }))

const notificacoes = [
  { id: id('af000001'), usuario_id: U.ana, tipo: 'produto_para_avaliar', titulo: 'Produto 3 entregue para avaliação', mensagem: 'Contrato 4500570131', lida: false, criado_em: ts(-0.1), link: '#' },
  { id: id('af000002'), usuario_id: U.ana, tipo: 'remanejamento_analisar', titulo: 'Remanejamento aguardando sua assinatura', mensagem: 'REM-2026-007', lida: false, criado_em: ts(-0.4), link: '#' },
  { id: id('af000003'), usuario_id: U.ana, tipo: 'licitacao_edital', titulo: 'Edital publicado: 1.1.2-001', mensagem: 'Pregão eletrônico', lida: false, criado_em: ts(-1), link: '#' },
]

const TAR = [['Revisar o TDR de sinalização interpretativa', 'em_andamento', 3, 'alta'], ['Aprovar o Produto 3 — monitoramento de fauna', 'a_fazer', 1, 'urgente'],
  ['Assinar o remanejamento REM-2026-007', 'a_fazer', 2, 'alta'], ['Reunião com as cooperativas de castanha', 'a_fazer', 5, 'media'],
  ['Conferir prestação de contas da missão de campo', 'em_revisao', 4, 'media'], ['Atualizar a Matriz de Resultados', 'em_andamento', 8, 'baixa'],
  ['Incorporar armadilhas fotográficas ao patrimônio', 'a_fazer', 6, 'alta'], ['Publicar edital da formação de agentes', 'concluida', -2, 'media']]
const tarefas = TAR.map(([titulo, status, p, prio], i) => ({ id: id('b10000' + i), codigo: `TR-${String(40 + i).padStart(3, '0')}`, titulo, descricao: titulo, status, prioridade: prio,
  dt_prazo: dia(p), criado_por: i % 2 ? U.carlos : U.ana, criado_em: ts(-20 + i), atualizado_em: ts(-i), atividade_id: atividades[i % 11].id, tipo: i === 3 ? 'reuniao' : 'outras',
  restrita: false, responsaveis: [U.ana], progresso: [40, 0, 0, 0, 80, 55, 0, 100][i] }))

const cfg = {
  projeto_id: 'default', projeto_codigo: '218BRA2001', projeto_nome: 'Projeto Resiliência — Gestão Socioambiental no Acre (demonstração)',
  projeto_localizacao: 'Rio Branco · Acre · Brasil', nome_sistema: 'Plataforma Inteligente de Gestão de Projetos', cor_primaria: '#1F4E2C', fotos: [],
  logos_topo: [
    { url: '/assets/3-vertical-verde-conjunto-1024x805.png', url_escuro: '/assets/brasao-acre.png', alt: 'Governo do Acre', tamanho: 'medio', ordem: 0 },
    { url: '/assets/1695134345-1-horizontal-verde-solo.png', url_escuro: '/assets/sema-branco.png', alt: 'SEMA/AC', tamanho: 'medio', ordem: 1 }],
  logo_projeto: { url: '', url_escuro: '/assets/logo-resiliencia.png', alt: 'Projeto', tamanho: 'medio', ordem: 0 },
  logos_parceiros: [
    { url: '/assets/UNESCO_logo_hor_blue_transparent.png.png', alt: 'UNESCO', tamanho: 'medio', ordem: 0 },
    { url: '/assets/UNCT_Logo_RGB_Brazil_Portuguese_horiz_color.png', alt: 'ONU Brasil', tamanho: 'medio', ordem: 1 },
    { url: '/assets/logo-fundo-brasil-onu.png', alt: 'Fundo Brasil-ONU', tamanho: 'medio', ordem: 2 },
    { url: '/assets/logo-consorcio-amazonia.png', alt: 'Consórcio Amazônia Legal', tamanho: 'grande', ordem: 3 }],
}

module.exports = {
  U, COT, id, dia, ts,
  base: {
    usuarios, resultados, atividades, fornecedores, tdrs, contratos, contratos_produtos, execucao_financeira, vw_saldo_atividade,
    matriz_itens, vw_matriz_progresso, atividade_matriz, vw_matriz_contribuicoes, ods_refs, metas_km_refs, notificacoes, tarefas,
    configuracoes_sistema: [cfg], usuario_permissoes: [], indicadores: [], cotacoes_usd: [{ cotacao: COT, data_ref: dia(0), criado_em: ts(0) }],
    cotacoes_ptax: [{ data: dia(0), ptax_venda: 5.4187, ptax_compra: 5.4181 }], contrato_encerramentos: [], viagem_protocolos: [],
    atividade_responsaveis: atividades.map(a => ({ id: id('b2'), atividade_id: a.id, usuario_id: a.responsavel_id, papel: 'responsavel', ativo: true })),
    vw_tdr_execucao_direta: [{ tdr_id: tdrs[17].id, atividade_id: atividades[11].id, numero: '2.1.7-001', planejado_brl: 400000, planejado_usd: 73800, consumido_usd: 6900, resta_usd: 66900, pct: 9.3 }],
    tdr_acoes: [], tarefa_tdrs: [], tarefa_checklist: [], tarefa_tipos: [{ codigo: 'outras', nome: 'Outras', ativo: true, ordem: 9, campos: [] }, { codigo: 'reuniao', nome: 'Reunião', ativo: true, ordem: 1, campos: [] }],
    __rpc: {
      fn_meus_vinculos: { responsavel: true }, fn_fornecedores_diretorio: fornecedores.map(f => ({ id: f.id, nome: f.nome, tipo: f.tipo, ativo: true, tem_email: true })),
      get_minhas_atividades: atividades.map(a => ({ id: a.id, atividade_id: a.id })), fn_perfil_atual: 'super_admin', tem_permissao: true,
      get_minhas_tarefas: contratos_produtos.filter(p => p.situacao === 'em_analise').concat(contratos_produtos.filter(p => p.situacao === 'pendente').slice(0, 3)).map((p, i) => {
        const c = contratos.find(x => x.id === p.contrato_id), a = atividades.find(x => x.id === c.atividade_id)
        return { id: p.id, entrega_id: p.id, produto_num: p.numero_produto, produto_desc: p.descricao.replace(/^Produto \d+ — /, '') + ' — ' + c.objeto_pt,
          atividade_cod: a.codigo, atividade_nome: a.nome_pt, dias_aguardando: [1, 4, 2, 0, 6, 1][i % 6], dt_entrega: dia(-[1, 4, 2, 0, 6, 1][i % 6]), arquivo_nome: 'relatorio-produto-' + p.numero_produto + '.pdf', contrato_numero: c.numero }
      }),
      get_produtos_vencendo: contratos_produtos.filter(p => p.situacao === 'pendente').slice(0, 4).map((p, i) => {
        const c = contratos.find(x => x.id === p.contrato_id), a = atividades.find(x => x.id === c.atividade_id)
        return { id: p.id, produto_num: p.numero_produto, numero_produto: p.numero_produto, descricao: p.descricao, produto_desc: p.descricao, situacao: 'pendente',
          dt_vencimento: dia(3 + i * 6), dias_restantes: 3 + i * 6, contrato_numero: c.numero, atividade_cod: a.codigo, atividade_nome: a.nome_pt }
      }), get_minhas_entregas_devolvidas: [],
      fn_editais_licitacao: tdrs.filter(t => t.status === 'em_licitacao').map((t, i) => ({ rodada_id: id('b3'), tdr_id: t.id, tdr_numero: t.numero, objeto: t.objeto_pt,
        modalidade: t.modalidade_licitacao, numero_processo: t.numero_processo, abertura: t.dt_licitacao, prazo_em: ts(3 + i * 4), situacao: 'aberta', edital_url: 'https://exemplo.org/edital', criado_em: ts(-i), n_empresas: 4 })),
      fn_cotacao_usd: { cotacao: 5.4187, data: dia(0) },
    },
  },
}
