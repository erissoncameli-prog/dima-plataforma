// Semente de estresse dos relatórios V1–V4 (Fornecedores), P1–P5 (Produtos/Entregas), U1 e U4 (Usuários).
// Dados realistas e pesados: nomes e descrições longas, CNPJ/CPF, valores em milhões, nulos misturados, todos os enums.
'use strict'
const id = (p, n) => `${p}${String(n).padStart(12, '0')}`.replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-').slice(0, 36)
const uid = (p, n) => `${p}-0000-4000-8000-${String(n).padStart(12, '0')}`
const PAL = ['Interinstitucional', 'Socioambiental', 'Desenvolvimento', 'Sustentabilidade', 'Agroextrativista', 'Georreferenciamento',
  'Biodiversidade', 'Fortalecimento', 'Monitoramento', 'Comunitário', 'Capacitação', 'Implementação', 'Recuperação', 'Florestal']
const txt = (n, alvo) => { let s = ''; let i = n; while (s.length < alvo) { s += (s ? ' ' : '') + PAL[i % PAL.length]; i += 3 } return s }
const dt = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const ativ = Array.from({ length: 6 }, (_, i) => ({ id: uid('a0000001', i + 1), codigo: `2.${(i % 4) + 1}.${i + 1}`, nome_pt: 'Atividade ' + txt(i, 90), ativo: true }))
const usuariosExtra = Array.from({ length: 80 }, (_, i) => {
  const perfis = ['super_admin', 'coordenacao', 'tecnico', 'financeiro', 'consultor_externo', 'visualizador']
  const nunca = i % 7 === 0
  return {
    id: uid('u0000001', i + 1),
    nome_completo: i % 5 === 0 ? 'Maria Aparecida Conceição dos Santos Albuquerque de Vasconcelos Figueiredo ' + i : `Usuário ${i} da Silva Pereira`,
    email: i % 4 === 0 ? `consultoria.especializada.socioambiental.${i}@instituto-de-pesquisa-amazonia-ocidental.org.br` : `u${i}@sema.ac.gov.br`,
    perfil: perfis[i % 6], ativo: i % 9 !== 0,
    criado_em: '2025-02-01T10:00:00Z',
    primeiro_acesso_em: nunca ? null : `2025-0${(i % 9) + 1}-1${i % 9}T13:${String(i % 60).padStart(2, '0')}:00Z`,
    ultimo_acesso_em: nunca ? null : new Date(Date.now() - (i * 3 + 1) * 864e5).toISOString(),
  }
})
const fornecedores = Array.from({ length: 60 }, (_, i) => {
  const pj = i % 3 !== 0
  return {
    id: uid('f0000001', i + 1), codigo_interno: i + 1, tipo: pj ? 'PJ' : 'PF', ativo: i % 8 !== 0,
    nome: i % 4 === 0 ? `Consórcio ${txt(i, 220)} Ltda ${i}` : pj ? `Empresa ${txt(i, 60)} S.A. ${i}` : `João Batista ${txt(i, 40)} ${i}`,
    cpf_cnpj: i % 10 === 5 ? null : pj ? `${10 + i}.345.678/0001-${String(i % 100).padStart(2, '0')}` : `123.456.${String(100 + i).slice(-3)}-${String(i % 100).padStart(2, '0')}`,
    email: i % 6 === 5 ? null : i % 2 ? `contato.administrativo.financeiro.${i}@empresa-de-consultoria-ambiental-e-florestal-amazonica.com.br` : `f${i}@ex.com`,
  }
})
const STC = ['vigente', 'encerrado', 'rescindido', 'suspenso', 'aguardando_cobertura', 'cancelado']
const contratos = []
fornecedores.forEach((f, i) => {
  const n = (i % 3) + 1
  for (let k = 0; k < n; k++) {
    const j = contratos.length
    const a = ativ[j % ativ.length]
    contratos.push({
      id: uid('c0000001', j + 1), numero: `45005${String(63000 + j)}-ADT-${k}/2026-UNESCO-BRA`, fornecedor_id: f.id, atividade_id: a.id,
      tipo: ['PF', 'PJ', 'Equipamentos', 'Serviços de consultoria'][j % 4], status: STC[j % STC.length],
      valor_total_brl: 120000 + j * 98765.43 + (j % 5 === 0 ? 12500000 : 0), valor_utilizado_brl: j % 4 === 0 ? null : 50000 + j * 1234.5,
      dt_inicio: dt(2025 + (j % 2), (j % 12) + 1, (j % 27) + 1), dt_fim: j % 6 === 0 ? null : dt(2027, (j % 12) + 1, 10),
      fornecedores: { id: f.id, nome: f.nome, tipo: f.tipo, cpf_cnpj: f.cpf_cnpj }, fornecedor: { nome: f.nome },
      atividades: { codigo: a.codigo }, atividade: { codigo: a.codigo, nome_pt: a.nome_pt },
    })
  }
})
fornecedores.forEach(f => { f.contratos = contratos.filter(c => c.fornecedor_id === f.id).map(c => ({ id: c.id, valor_total_brl: c.valor_total_brl, status: c.status, dt_inicio: c.dt_inicio })) })

const STP = ['pendente', 'entrega_parcial', 'em_analise', 'devolvido', 'aprovado', 'pago', 'cancelado']
const produtos = Array.from({ length: 120 }, (_, i) => {
  const c = contratos[i % contratos.length], f = fornecedores.find(x => x.id === c.fornecedor_id)
  const sit = STP[i % STP.length]
  const entregue = i % 3 !== 0
  const venc = dt(2025 + (i % 2), (i % 12) + 1, (i % 27) + 1)
  return {
    id: uid('p0000001', i + 1), contrato_id: c.id, numero_produto: (i % 12) + 1,
    descricao: i % 3 === 0 ? `Produto ${i}: Relatório ${txt(i, 280)} contemplando a área de abrangência` : `Produto ${i} — ${txt(i, 120)}`,
    valor_brl: 45000 + i * 15432.1 + (i % 9 === 0 ? 3200000 : 0), situacao: sit,
    dt_vencimento: venc, dt_entrega: entregue ? dt(2025 + (i % 2), (i % 12) + 1, Math.min(28, (i % 27) + 3)) : null,
    avaliado_em: entregue && i % 2 === 0 ? `2026-0${(i % 9) + 1}-2${i % 8}T15:00:00Z` : null,
    pct_aprovado: i % 4 === 3 ? null : [100, 85.5, 60, 40, 100, 72.3][i % 6], valor_aprovado: i % 4 === 3 ? null : 40000 + i * 9000,
    'contratos.fornecedor_id': c.fornecedor_id,
    contrato: { numero: c.numero, atividade_id: c.atividade_id, fornecedor_id: c.fornecedor_id, fornecedor: { nome: f.nome }, atividade: { codigo: c.atividades.codigo } },
  }
})
const STE = ['pendente', 'em_analise', 'aprovada', 'devolvida']
const nomesU = usuariosExtra.map(u => u.nome_completo)
const entregas = []
produtos.forEach((p, i) => {
  const n = i % 4 === 0 ? 0 : (i % 3) + 1
  for (let k = 0; k < n; k++) {
    const j = entregas.length
    entregas.push({
      id: uid('e0000001', j + 1), produto_id: p.id, contrato_id: p.contrato_id, situacao: STE[j % 4],
      dt_entrega: j % 11 === 0 ? null : dt(2026, (j % 11) + 1, (j % 27) + 1),
      despacho_numero: j % 3 === 0 ? null : `SEI-0820.012${String(j).padStart(4, '0')}/2026-DESPACHO-SEMA/DIMA/DEUC`,
      despacho_data: j % 3 === 0 ? null : dt(2026, (j % 11) + 1, 28),
      nota_tecnica_url: j % 2 ? null : `https://x.supabase.co/storage/v1/object/public/entregas-docs/produtos/${p.id}/nota-tecnica-${j}.pdf`,
      nota_tecnica_nome: j % 2 ? null : `Nota_Tecnica_${j}_SEI_${txt(j, 50).replace(/ /g, '_')}.pdf`,
      pct_entregue: [100, 50, 75, null][j % 4],
      criado_por_u: j % 5 === 4 ? null : { nome_completo: nomesU[j % nomesU.length] },
      despachado_por_u: j % 3 === 0 ? null : { nome_completo: nomesU[(j + 7) % nomesU.length] },
      lancamento: j % 4 === 2 ? { dt_pagamento: dt(2026, (j % 11) + 1, 15) } : null,
      documentos: Array.from({ length: j % 4 }, (_, d) => ({ arquivo_url: `https://x/object/public/entregas-docs/produtos/${p.id}/doc${d}.pdf`, arquivo_nome: `Documento_${d}_${txt(d + j, 40)}.pdf`, tipo_documento: ['Relatório Técnico', 'Nota Fiscal', 'Lista de Presença', 'Declaração/Atestado'][d] })),
    })
  }
})
const execucao = Array.from({ length: 50 }, (_, i) => {
  const f = fornecedores[(i * 7) % 20]
  return {
    id: uid('x0000001', i + 1), fornecedor_id: f.id, contrato_id: null, atividade_id: ativ[0].id,
    descricao: `Passagens e diárias — ${txt(i, 160)} — protocolo VGM-2026-${String(i).padStart(3, '0')}`,
    valor_brl: 1800 + i * 731.2, valor_usd: 340 + i * 10, valor_usd_unesco: i % 2 ? null : 330 + i * 10,
    situacao: ['pago', 'a_pagar', 'pago', 'cancelado'][i % 4], dt_pagamento: i % 2 ? null : dt(2026, (i % 11) + 1, 12), dt_vencimento: dt(2026, (i % 11) + 1, 10),
    fornecedor: { nome: f.nome, tipo: f.tipo }, atividade: { codigo: ativ[0].codigo }, tdr: { numero: '2.1.7-001' },
  }
})

module.exports = {
  banco: {
    atividades: ativ, fornecedores, contratos, contratos_produtos: produtos, contratos_produtos_entregas: entregas,
    execucao_financeira: execucao, usuarios: usuariosExtra, viagem_protocolos: [], viagem_viajantes: [], tdrs: [], resultados: [],
    __rpc: { fn_fornecedores_diretorio: fornecedores.map(f => ({ id: f.id, nome: f.nome, tipo: f.tipo, ativo: f.ativo, tem_email: !!f.email })) },
  },
  filtros: { V3: { 'fil-fornecedor': fornecedores[4].id } },
}
