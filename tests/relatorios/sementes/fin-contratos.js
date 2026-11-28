// Semente de estresse para F1–F6 e C1–C5 (Financeiro e Contratos). Datas relativas a hoje.
'use strict'
const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const uid = (p, i) => `${p}-0000-4000-8000-${String(i).padStart(12, '0')}`
let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280
const pick = a => a[Math.floor(rnd() * a.length)]
const LONGO = ['Desenvolvimento-institucional-socioambiental', 'Fortalecimento-interinstitucional', 'Monitoramento-hidrometeorológico', 'Contratação de consultoria especializada para', 'elaboração participativa do plano de gestão territorial e ambiental', 'das terras indígenas e unidades de conservação do Alto Juruá', 'com oficinas comunitárias, levantamento socioeconômico, georreferenciamento e capacitação de multiplicadores locais']
const textoLongo = n => { let t = ''; while (t.length < n) t += pick(LONGO) + ' '; return t.trim().slice(0, n) }
const FORN_NOMES = ['Consórcio Amazônia Sustentável de Desenvolvimento-institucional-socioambiental e Assessoria Técnica Integrada Ltda', 'Maria Aparecida dos Santos Nascimento Ferreira de Albuquerque', 'Instituto de Pesquisa Ambiental da Amazônia Ocidental — Núcleo Acre e Rondônia', 'ABC Eventos', 'Fundação Interinstitucional para o Fortalecimento-interinstitucional das Cadeias Produtivas da Sociobiodiversidade']
const fornecedores = Array.from({ length: 25 }, (_, i) => ({ id: uid('f0000000', i), codigo_interno: i + 1, nome: i < 5 ? FORN_NOMES[i] : `${pick(FORN_NOMES)} ${i}`, tipo: i % 3 ? 'PJ' : 'PF', ativo: i % 7 !== 0 }))
const FASES = ['A_INICIAR', 'ELABORACAO', 'LICITACAO', 'ELABORADO', 'CONTRATADO', 'CONCLUIDO']
const resultados = [1, 2, 3, 4].map(n => ({ id: uid('r0000000', n), codigo: 'R' + n, nome_pt: 'Resultado ' + n + ': ' + textoLongo(120) }))
const atividades = Array.from({ length: 60 }, (_, i) => {
  const r = resultados[i % 4]
  return { id: uid('a0000000', i), codigo: `${(i % 4) + 1}.${Math.floor(i / 10) + 1}.${(i % 10) + 1}`, nome_pt: textoLongo(150 + (i % 5) * 30), fase: FASES[i % 6], ativo: true, resultado_id: r.id, resultado: { codigo: r.codigo, nome_pt: r.nome_pt } }
})
const STS = ['ok', 'atencao', 'critico', 'extrapolado', 'sem_orcamento']
const vw_saldo_atividade = atividades.map((a, i) => {
  const orc = i % 13 === 0 ? 0 : 1234567.89 + i * 98765.43
  const comp = orc * (0.3 + rnd()), pago = comp * rnd()
  return { id: a.id, orcamento_usd: orc, comprometido_usd: comp, pago_usd: pago, a_pagar_usd: i % 4 ? comp * 0.1 : 0, liberado_usd: i % 5 ? 0 : 54043.57, saldo_livre_usd: orc - comp + (i % 5 ? 0 : 54043.57), status_saldo: STS[i % 5], excedente_contrato_usd: 0 }
})
const ST_CONT = ['vigente', 'encerrado', 'rescindido', 'suspenso', 'aguardando_cobertura', 'cancelado']
const TIPOS = ['Servico', 'Consultoria', 'Consumo', 'Equipamentos', null]
const contratos = Array.from({ length: 80 }, (_, i) => {
  const f = fornecedores[i % 25], a = atividades[i % 60]
  const total = 12345678.9 - i * 98765.4
  const util = i % 6 === 0 ? null : total * rnd()
  const c = {
    id: uid('c0000000', i), numero: i % 3 && !process.env.NUM_CURTO ? `4500563${String(100 + i)}/2026-UNESCO-BRA-218BRA2001` : `450056${3100 + i}`,
    fornecedor_id: f.id, atividade_id: a.id, tdr_id: null, objeto_pt: textoLongo(180 + (i % 4) * 40), tipo: TIPOS[i % 5],
    valor_total_brl: total, valor_utilizado_brl: util, saldo_brl: util == null ? null : total - util,
    dt_inicio: i % 11 === 0 ? null : dia(-700 + i * 7), dt_fim: dia(i % 2 ? (i % 85) : 200 + i * 3), status: ST_CONT[i % 6],
    contrato_assinado_url: i % 3 ? null : '/object/public/contratos-docs/x.pdf',
  }
  c.fornecedor = { id: f.id, nome: f.nome }; c.atividade = { id: a.id, codigo: a.codigo, nome_pt: a.nome_pt }
  c.fornecedores = { nome: f.nome, tipo: f.tipo }; c.atividades = { codigo: a.codigo }
  return c
})
const SIT_P = ['pendente', 'em_analise', 'aprovado', 'pago', 'cancelado', 'entrega_parcial', 'devolvido']
const contratos_produtos = []
contratos.forEach((c, ci) => {
  const n = ci < 30 ? 3 : 1
  for (let k = 0; k < n; k++) {
    const i = contratos_produtos.length
    contratos_produtos.push({
      id: uid('p0000000', i), contrato_id: c.id, numero_produto: k + 1, descricao: 'Produto ' + (k + 1) + ' — ' + textoLongo(150 + (i % 5) * 30),
      valor_brl: i % 9 === 0 ? null : 1234567.89 + i * 1111.11, situacao: SIT_P[i % 7],
      dt_vencimento: i % 2 ? dia((i % 85) + 1) : dia(-((i % 200) + 1)),
      contrato: { numero: c.numero, objeto_pt: c.objeto_pt, atividade_id: c.atividade_id, fornecedor_id: c.fornecedor_id, fornecedor: { nome: c.fornecedor.nome }, atividade: { codigo: c.atividade.codigo, nome_pt: c.atividade.nome_pt } },
    })
  }
})
// C3 precisa do embed produtos dentro do contrato
contratos.forEach(c => { c.produtos = contratos_produtos.filter(p => p.contrato_id === c.id).map(p => ({ id: p.id, situacao: p.situacao, valor_brl: p.valor_brl })) })
const SIT_F = ['pago', 'a_pagar', 'cancelado']
const execucao_financeira = Array.from({ length: 110 }, (_, i) => {
  const c = i % 4 === 0 ? null : contratos[i % 80], a = atividades[i % 60], f = fornecedores[i % 25]
  const sit = SIT_F[i % 3], brl = 2345678.9 + i * 12345.67
  return {
    id: uid('e0000000', i), atividade_id: a.id, contrato_id: c ? c.id : null, fornecedor_id: i % 10 === 0 ? null : f.id,
    descricao: i % 7 === 0 ? null : (c ? 'Pagamento do produto ' + (i % 3 + 1) + ' — ' : 'Passagens e diárias — ') + textoLongo(150 + (i % 4) * 40),
    numero_nf: 'NF-' + (1000 + i), valor_brl: brl, valor_usd: i % 5 ? brl / 5.25 : null,
    valor_usd_unesco: sit === 'pago' && i % 2 ? brl / 5.31 : null, cotacao_unesco: sit === 'pago' && i % 2 ? 5.3123 : null,
    situacao: sit, dt_vencimento: i % 2 ? dia((i % 80) + 1) : dia(-((i % 150) + 2)), dt_pagamento: sit === 'pago' ? dia(-(i * 3)) : null,
    contrato: c ? { numero: c.numero } : null, atividade: { codigo: a.codigo }, tdr: c ? null : { numero: `2.1.7-00${i % 3 + 1}/2026-EXECUCAO-DIRETA` },
    fornecedor: i % 10 === 0 ? null : { nome: f.nome },
  }
})
const cotacoes_usd = Array.from({ length: 100 }, (_, i) => {
  const c = 5.1 + Math.sin(i / 7) * 0.4, ant = 5.1 + Math.sin((i - 1) / 7) * 0.4
  return { id: uid('q0000000', i), data_ref: dia(-300 + i * 3), cotacao: c, cotacao_anterior: i ? ant : null, variacao_pct: i ? (c - ant) / ant * 100 : null, fonte: i % 3 ? 'AwesomeAPI — cotação comercial de fechamento (BRL/USD) registrada pelo financeiro' : null }
})
const SIT_E = ['pendente', 'em_analise', 'aprovada', 'devolvida']
const contratos_produtos_entregas = contratos_produtos.slice(0, 90).map((p, i) => ({
  id: uid('d0000000', i), produto_id: p.id, situacao: SIT_E[i % 4], dt_entrega: dia(-(i * 4)), despacho_numero: i % 2 ? `Despacho nº 0012345/2026/SEMA-DIMA-DEUC-${i}` : null,
  despacho_data: i % 2 ? dia(-(i * 4) + 2) : null, nota_tecnica_url: i % 3 ? '/object/public/entregas-docs/nt.pdf' : null,
  nota_tecnica_nome: i % 3 ? `Nota_Tecnica_SEI_0012345_Produto_${i}_Desenvolvimento-institucional-socioambiental.pdf` : null, pct_entregue: i % 5 ? 100 : 60,
  criado_por_u: { nome_completo: 'Maria Aparecida dos Santos Nascimento Ferreira' }, despachado_por_u: i % 2 ? { nome_completo: 'Erisson Cameli Santiago' } : null,
  lancamento: i % 4 === 2 ? { dt_pagamento: dia(-i) } : null,
  documentos: Array.from({ length: i % 4 }, (_, k) => ({ arquivo_url: '/object/public/entregas-docs/d.pdf', arquivo_nome: `Relatorio_tecnico_final_versao_${k}_Fortalecimento-interinstitucional.pdf`, tipo_documento: k % 2 ? null : 'Relatório Técnico' })),
}))
module.exports = {
  banco: { fornecedores, resultados, atividades, vw_saldo_atividade, contratos, contratos_produtos, execucao_financeira, cotacoes_usd, contratos_produtos_entregas, entrega_documentos: [], viagem_protocolos: [], viagem_viajantes: [] },
  filtros: { F2: { 'fil-horizonte': '90' }, C2: { 'fil-horizonte': '90' } },
}
