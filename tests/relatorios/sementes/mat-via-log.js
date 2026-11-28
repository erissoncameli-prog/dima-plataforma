// Semente de estresse: Matriz (M1/M2/M4), Viagens (Vi1–Vi5) e Logs (L1/L4/L5).
// Textos longos, nulos misturados, enums válidos. Só para tests/relatorios/rodar.js.
'use strict'
let s = 7
const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 }
const pick = a => a[Math.floor(rnd() * a.length)]
const uid = (p, i) => `${p}000000-0000-0000-0000-${String(i).padStart(12, '0')}`
const dia = d => { const x = new Date(Date.UTC(2026, 0, 1) + d * 864e5); return x.toISOString().slice(0, 10) }
const ts = d => new Date(Date.UTC(2026, 0, 1, 13, 30) + d * 864e5).toISOString()
const PAL = 'monitoramento participativo das comunidades extrativistas ribeirinhas da APA do Lago do Amapá com levantamento socioambiental georreferenciado oficinas de capacitação produção de material didático bilíngue articulação interinstitucional SEMA UNESCO consórcio fortalecimento da governança territorial restauração florestal sistemas agroflorestais'.split(' ')
const texto = n => { let t = ''; while (t.length < n) t += pick(PAL) + ' '; return t.trim().replace(/^./, c => c.toUpperCase()) + '.' }

const USU = [1, 2, 3, 4].map(i => ({ id: uid('b', i), nome_completo: ['Bruno Técnico de Campo Ferreira', 'Carla Coordenação Albuquerque Monteiro', 'Davi Financeiro Nascimento', 'Elisa Responsável Rodrigues de Souza'][i - 1], email: `u${i}@x.br`, perfil: pick(['tecnico', 'coordenacao', 'financeiro']), ativo: true }))

// ── Matriz ──
const matriz_itens = [], vw_matriz_progresso = []
for (let i = 1; i <= 80; i++) {
  const meta = i % 7 === 0 ? null : Math.round(rnd() * 400) + 1
  const it = { id: uid('a', i), produto_codigo: `P${1 + (i % 9)}`, produto_titulo: texto(60), indicador: texto(180 + Math.floor(rnd() * 120)),
    meios_verificacao: texto(220), resultado: 1 + (i % 4), unidade: pick(['famílias atendidas', 'hectares', 'oficinas', null, 'documentos técnicos publicados']),
    meta_numerica: meta, ordem: i, ods: [String(1 + (i % 17))], metas_km: [], ativo: true }
  matriz_itens.push(it)
  const r = rnd()
  vw_matriz_progresso.push({ id: it.id, realizado_confirmado: meta ? (r < .3 ? 0 : Math.round(meta * r * 1.3)) : 0, realizado_pendente: r > .6 ? Math.round(rnd() * 40) : 0 })
}
// contribuições das entregas (vw_matriz_contribuicoes): 0 a 4 por indicador
const vw_matriz_contribuicoes = []
matriz_itens.forEach((it, i) => {
  for (let k = 0; k < (i % 5); k++) vw_matriz_contribuicoes.push({ id: uid('p', i * 10 + k), produto_id: uid('l', 1 + ((i + k) % 70)), matriz_item_id: it.id,
    valor: Math.round(rnd() * 60) + 1, unidade: k % 3 ? null : it.unidade, observacao: k === 2 ? texto(80) : null, status: pick(['confirmado', 'pendente', 'rejeitado']),
    criado_em: ts(i + k), entrega_numero: 1 + k, entrega_dt: dia(i + k * 7), entrega_situacao: pick(['aprovada', 'em_analise']), entrega_tipo_documento: pick(['Relatório técnico', 'Nota Fiscal', null]) })
})

// ── Atividades / viagens ──
const atividades = [1, 2, 3, 4, 5, 6].map(i => ({ id: uid('c', i), codigo: `2.1.${i}`, nome_pt: texto(110), orcamento_usd: 50000 + i * 31000, ativo: true, resultado_id: null,
  contratos: [{ valor_comprometido_brl: 12000 * i, valor_utilizado_brl: 5000 * i }] }))
const SITS = ['rascunho', 'solicitado', 'aprovado', 'em_prestacao', 'realizado', 'nao_realizado', 'cancelado', 'rejeitado']
const viagem_protocolos = [], viagem_viajantes = [], vw_viagens_execucao = []
const NOMES = ['Maria Aparecida dos Santos Oliveira Cavalcante', 'João Batista Nogueira', 'Francisca das Chagas Lima de Araújo', 'Raimundo Nonato Pereira da Silva Filho', 'Ana Beatriz Montenegro', 'Pedro Henrique Barbosa', 'Luzia Gonçalves Bezerra']
for (let i = 1; i <= 60; i++) {
  const ds = 20 + i * 4, sit = SITS[i % SITS.length], atv = atividades[i % atividades.length]
  const viajantes = []
  const nV = 1 + (i % 4)
  for (let k = 0; k < nV; k++) {
    const vid = uid('d', i * 10 + k)
    const trechos = [0, 1, 2].slice(0, 1 + (k % 3)).map(t => ({ id: uid('e', i * 100 + k * 10 + t), origem: pick(['Rio Branco (AC)', 'Cruzeiro do Sul (AC)', 'Brasília (DF)']), destino: pick(['Brasília — Distrito Federal (Aeroporto Internacional Presidente Juscelino Kubitschek)', 'Sena Madureira (AC)', 'Paris (França) — Sede da UNESCO, Place de Fontenoy']),
      tipo: pick(['IDA', 'VOLTA', 'Ida', null]), dt_saida: dia(ds + t), valor: Math.round(rnd() * 380000) / 100 }))
    const diarias = [{ id: uid('f', i * 100 + k), tipo_diaria: pick(['Nacional integral', 'Meia diária', 'Internacional']), quantidade: 1 + (k % 5), valor_unitario: pick([335.5, 177.25, 1200]) }]
    const v = { id: vid, protocolo_id: uid('g', i), nome: NOMES[(i + k) % NOMES.length], funcao: pick(['Técnico de campo', 'Consultor', null, 'Coordenadora do componente de governança territorial']),
      relatorio_url: k % 2 ? null : '/object/public/viagens-arquivos/rel.pdf', relatorio_nome: k % 2 ? null : 'Relatório de viagem — ' + texto(40), relatorio_data: ts(ds + 6),
      cartoes_embarque_urls: k % 2 ? [] : ['/object/public/viagens-arquivos/c1.jpg', '/object/public/viagens-arquivos/c2.jpg', '/object/public/viagens-arquivos/c3.jpg'], desfecho: null, trechos, diarias }
    viajantes.push(v); viagem_viajantes.push({ id: vid, nome: v.nome })
    const pas = trechos.reduce((t, x) => t + x.valor, 0), dia2 = diarias[0].quantidade * diarias[0].valor_unitario
    const temLanc = !['rascunho', 'solicitado'].includes(sit)
    vw_viagens_execucao.push({ protocolo_id: uid('g', i), protocolo: `VGM-2026-${String(i).padStart(3, '0')}`, dt_saida: dia(ds), destino_principal: null, atividade_id: atv.id, atividade_codigo: atv.codigo,
      tdr_numero: '2.1.7-001', protocolo_situacao: sit, lancamento_id: temLanc ? uid('h', i * 10 + k) : null, lancamento_situacao: temLanc ? pick(['pago', 'a_pagar']) : null,
      passagens_brl: pas, diarias_brl: dia2, usd: (pas + dia2) / 5.25, usd_estimado: k % 2 === 0, passagens_usd: pas / 5.25, diarias_usd: dia2 / 5.25,
      devolvido_brl: k === 2 ? 300 : 0, devolvido_usd: k === 2 ? 57 : 0, custo_cancelamento_brl: k === 3 ? 450.9 : 0, credito_companhia_brl: k === 3 ? 1200 : 0, devolucoes_pendentes: k === 3 ? 1 : 0,
      liquido_brl: pas + dia2 - (k === 2 ? 300 : 0), liquido_usd: (pas + dia2) / 5.25 })
  }
  const destino = i % 5 === 0 ? null : pick(['Sena Madureira — Comunidades da Reserva Extrativista Cazumbá-Iracema e entorno', 'Brasília (DF)', 'Paris — Sede da UNESCO, reunião do comitê técnico do Fundo Brasil-ONU'])
  vw_viagens_execucao.filter(x => x.protocolo_id === uid('g', i)).forEach(x => { x.destino_principal = destino })
  viagem_protocolos.push({ id: uid('g', i), numero: `VGM-2026-${String(i).padStart(3, '0')}`, numero_sei: i % 3 ? `0820.0123${i}.000${i}/2026-${i}` : null,
    objetivo: i % 9 === 0 ? null : texto(300 + Math.floor(rnd() * 250)), destino_principal: destino, dt_saida: dia(ds), dt_retorno: dia(ds + 2 + (i % 6)), situacao: sit,
    atividade_id: atv.id, atividade: { id: atv.id, codigo: atv.codigo, nome_pt: atv.nome_pt, orcamento_usd: atv.orcamento_usd },
    criado_em: ts(ds - 10), criado_por: USU[i % 4].id, email_solicitante: i % 2 ? `solicitante.${i}@sema.ac.gov.br` : null,
    aprovado_em: ['aprovado', 'em_prestacao', 'realizado', 'nao_realizado'].includes(sit) ? ts(ds - 5) : null, aprovado_por: USU[1].id,
    rejeitado_em: sit === 'rejeitado' || i % 11 === 0 ? ts(ds - 7) : null, rejeitado_motivo: sit === 'rejeitado' || i % 11 === 0 ? texto(200) : null,
    realizado_em: sit === 'realizado' ? ts(ds + 15) : null, observacoes: i % 4 ? null : texto(260), viajantes })
}
const vw_tdr_execucao_direta = atividades.slice(0, 4).map((a, i) => ({ tdr_numero: `2.1.7-00${i + 1}`, atividade_id: a.id, atividade_codigo: a.codigo, planejado_usd: 76190.48, planejado_brl: 400000,
  consumido_usd: 30000 + i * 15000, consumido_brl: 157500 + i * 70000, pago_usd: 20000, a_pagar_usd: 10000 + i * 15000, resta_usd: 46190.48 - i * 15000, pct_consumido: 39.4 + i * 20 }))
const execucao_financeira = atividades.map((a, i) => ({ id: uid('i', i), atividade_id: a.id, contrato_id: null, valor_brl: 3000 + i * 1000, situacao: 'a_pagar' }))

// ── Logs ──
const FASES = ['rascunho', 'revisao_interna', 'ajustes', 'enviado_unesco', 'retorno_unesco', 'aprovado', 'em_licitacao', 'contratado', 'cancelado', null]
const tdr_acoes = []
const ACOES = ['enviado_unesco', 'contratado', 'em_licitacao', 'aprovado_final', 'devolvido_ajuste', 'editado', 'cancelado', 'enviado_revisao', 'substituto_designado']
for (let i = 1; i <= 90; i++) tdr_acoes.push({ id: uid('j', i), tdr_id: uid('k', i % 25), usuario_id: USU[i % 4].id, acao: ACOES[i % ACOES.length], criado_em: ts(i * 2),
  status_anterior: FASES[i % FASES.length], status_novo: i % 4 === 0 ? FASES[i % FASES.length] : FASES[(i + 1) % FASES.length], comentario: i % 6 ? texto(150 + Math.floor(rnd() * 300)) : null,
  usuario: i % 13 ? { nome_completo: USU[i % 4].nome_completo } : null, tdr: { numero: `TDR-2026-${String(i % 25).padStart(3, '0')}`, objeto_pt: texto(120), atividade: { codigo: atividades[i % 6].codigo } } })
const contratos_produtos = []
for (let i = 1; i <= 70; i++) {
  const pct = [100, 80, 50, 30, null][i % 5]
  contratos_produtos.push({ id: uid('l', i), contrato_id: uid('m', i % 12), numero_produto: 1 + (i % 6), descricao: texto(120 + Math.floor(rnd() * 140)), valor_brl: 18000 + i * 333, situacao: 'aprovado',
    pct_aprovado: pct, valor_aprovado: pct == null ? null : (18000 + i * 333) * pct / 100, avaliado_em: ts(i * 3), parecer_avaliador: i % 7 ? texto(300 + Math.floor(rnd() * 300)) : null,
    avaliador: i % 9 ? { nome_completo: USU[i % 4].nome_completo } : null, contrato: { numero: `45005${71600 + i % 12}`, fornecedor: { nome: pick(['Instituto de Pesquisa Ambiental da Amazônia e Desenvolvimento Sustentável — IPAAD', 'Maria Aparecida dos Santos Oliveira Cavalcante', 'Coop. Agroextrativista']) }, atividade: { codigo: atividades[i % 6].codigo } } })
}
const CAMPOS = ['nome_local', 'apa', 'tipo_atividade', 'responsavel', 'data_implantacao', 'observacao', 'lat', 'lng', 'foto_url', 'foto_nome', 'status']
const snap = i => Object.fromEntries(CAMPOS.map(c => [c, c === 'lat' ? -9.97 - i / 1000 : c === 'lng' ? -67.8 - i / 1000 : c === 'foto_url' ? 'https://wfymnmlinonvdqfucjya.supabase.co/storage/v1/object/public/pontos-mapa/' + 'abcdef0123456789'.repeat(5) + `/foto_${i}.jpg` : c === 'observacao' ? texto(400) : texto(40)]))
const mapa_pontos_log = []
for (let i = 1; i <= 50; i++) {
  const acao = ['criar', 'editar', 'excluir'][i % 3]
  const a = snap(i), d = snap(i + 1000)
  if (i % 4 === 0) { a.vertices = Array.from({ length: 40 }, (_, k) => [k, k]); d.vertices = Array.from({ length: 55 }, (_, k) => [k, k]) }
  mapa_pontos_log.push({ id: uid('n', i), acao, criado_em: ts(i * 4), usuario_id: USU[i % 4].id, usuario_email: `u${i % 4}@x.br`, usuario_nome: USU[i % 4].nome_completo,
    ponto_nome: i % 8 ? texto(70) : null, geometry_type: pick(['ponto', 'poligono', 'trilha', 'caminho', null]), apa: pick(['APA Lago do Amapá', 'APA Igarapé São Francisco', null]),
    dados_antes: acao === 'criar' ? null : a, dados_depois: acao === 'excluir' ? null : d })
}

module.exports = {
  banco: {
    usuarios: USU, atividades, matriz_itens, vw_matriz_progresso, vw_matriz_contribuicoes,
    vw_saldo_atividade: atividades.map((a, i) => ({ id: a.id, orcamento_usd: a.orcamento_usd, comprometido_usd: a.orcamento_usd * (0.4 + i * 0.15), pago_usd: a.orcamento_usd * 0.2,
      a_pagar_usd: a.orcamento_usd * 0.1, liberado_usd: i === 2 ? 5000 : 0, saldo_livre_usd: a.orcamento_usd * (0.6 - i * 0.15) + (i === 2 ? 5000 : 0), status_saldo: i > 3 ? 'extrapolado' : 'ok', excedente_contrato_usd: 0 })), viagem_protocolos, viagem_viajantes, vw_viagens_execucao, vw_tdr_execucao_direta,
    execucao_financeira, cotacoes_usd: [{ cotacao: 5.25, data_ref: '2026-11-27' }], tdr_acoes, contratos_produtos, mapa_pontos_log,
    resultados: [1, 2, 3, 4].map(i => ({ id: uid('o', i), codigo: 'R' + i, nome_pt: texto(60) })), ods_refs: [], fornecedores: [], tdrs: [], contratos: [],
  },
  filtros: {},
}
