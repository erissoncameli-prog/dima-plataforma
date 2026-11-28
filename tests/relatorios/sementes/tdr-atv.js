// Semente de estresse para T1–T5 (TDRs) e A1–A5 (Atividades). Dados fictícios, determinísticos.
'use strict'
let s = 42; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
const pick = a => a[Math.floor(rnd() * a.length)]
const uid = (p, i) => `${p}000000-0000-0000-0000-${String(i).padStart(12, '0')}`
const dia = (base, d) => new Date(Date.parse(base) + d * 864e5).toISOString()
const PAL = ['implementação', 'georreferenciamento', 'fortalecimento', 'socioambiental', 'interinstitucional', 'capacitação', 'comunidades',
  'extrativistas', 'monitoramento', 'biodiversidade', 'Reserva', 'Extrativista', 'Chico', 'Mendes', 'restauração', 'florestal', 'produtiva',
  'consultoria', 'especializada', 'elaboração', 'diagnóstico', 'participativo', 'cadeias', 'castanha', 'açaí', 'borracha', 'assessoria',
  'técnica', 'planejamento', 'zoneamento', 'ecológico-econômico', 'desenvolvimento', 'metodológico', 'sistematização', 'Rio Branco', 'Acre']
const frase = n => { const p = []; let t = 0; while (t < n) { const w = pick(PAL); p.push(w); t += w.length + 1 } const x = p.join(' '); return x[0].toUpperCase() + x.slice(1) + '.' }

const FASES = ['A_INICIAR', 'ELABORACAO', 'LICITACAO', 'ELABORADO', 'CONTRATADO', 'CONCLUIDO']
const ST_TDR = ['rascunho', 'revisao_interna', 'ajustes', 'enviado_unesco', 'retorno_unesco', 'aprovado', 'cancelado', 'submetido',
  'pendente_correcao', 'em_avaliacao', 'em_revisao_unesco', 'em_licitacao', 'contratado']
const ST_CTR = ['vigente', 'encerrado', 'rescindido', 'suspenso', 'aguardando_cobertura', 'cancelado']
const MODS = ['Pregão Eletrônico Internacional', 'Concorrência Pública Internacional', 'Convite', 'Cotação/Shopping (ONU)', 'Dispensa de Licitação', 'Inexigibilidade']
const SIT_LIC = ['aberta', 'com_propostas', 'deserta', 'fracassada', 'sem_proposta', 'cancelada']
const FORN = ['Consórcio Amazônia Viva Engenharia Ambiental e Consultoria Socioeconômica Ltda', 'Instituto de Pesquisa e Desenvolvimento Sustentável da Amazônia Ocidental',
  'Maria Aparecida dos Santos Nascimento Ferreira', 'GeoFloresta Serviços de Georreferenciamento S.A.', 'Cooperativa Agroextrativista do Vale do Juruá']
const PESS = ['Italo do O Ferreira', 'Maria José Albuquerque de Souza Lima', 'Francisco das Chagas Nogueira', 'Raimunda Nonata Pereira da Silva Bezerra',
  'Antônio Carlos de Oliveira Júnior', 'Beatriz Helena Cavalcante Monteiro']
const usuarios = PESS.map((n, i) => ({ id: uid('u', i + 1), nome_completo: n, email: `p${i}@x.br`, perfil: i % 2 ? 'tecnico' : 'coordenacao', ativo: true }))

const atividades = [], tdrs = [], contratos = [], rodadas = [], empresas = [], prorrog = [], encs = [], vwSaldo = [], respons = [],
  ef = [], prods = [], tarefas = [], amz = [], acoes = [], dir = []
const NA = 30
for (let i = 0; i < NA; i++) {
  const id = uid('a', i + 1), r = 1 + (i % 4)
  const codigo = `${r}.${1 + (i % 3)}.${1 + Math.floor(i / 4)}`
  const nome = frase(90 + Math.floor(rnd() * 120))
  const orc = Math.round(rnd() * 3500000 + 80000)
  const resps = i % 7 === 3 ? [] : [usuarios[i % 6], ...(i % 3 === 0 ? [usuarios[(i + 2) % 6]] : [])]
  resps.forEach((u, k) => respons.push({ id: uid('r', i * 10 + k), atividade_id: id, usuario_id: u.id, papel: k ? 'substituto' : 'responsavel', ativo: true, dt_inicio: '2026-01-05', usuario: { id: u.id, nome_completo: u.nome_completo } }))
  const a = { id, codigo, nome_pt: nome, nome_en: null, fase: FASES[i % 6], orcamento_usd: orc, orcamento_original_usd: i % 5 === 0 ? orc - 125000.5 : orc,
    resultado_id: null, responsavel_id: null, ativo: true, criado_em: '2026-01-02T10:00:00Z',
    resultado: { codigo: 'R' + r, nome_pt: 'Resultado ' + r + ' — ' + frase(60) },
    responsaveis: resps.map((u, k) => ({ papel: k ? 'substituto' : 'responsavel', ativo: true, usuario: { id: u.id, nome_completo: u.nome_completo } })), tdrs: [], encerramentos: [] }
  atividades.push(a)
  const nt = i % 6 === 5 ? 0 : 2 + Math.floor(rnd() * 4)
  let comp = 0
  for (let k = 0; k < nt; k++) {
    const tid = uid('t', i * 10 + k), st = (k === 0 || k === 3) && i % 5 !== 2 ? 'contratado' : ST_TDR[(i * 3 + k) % ST_TDR.length]
    const brl = Math.round(rnd() * 2400000 + 15000) + 0.37, usd = Math.round(brl / 5.25 * 100) / 100
    const direta = codigo.endsWith('.1.7') || (i === 4 && k === 0)
    const num = `${codigo}-${String(k + 1).padStart(3, '0')}`
    const t = { id: tid, numero: num, tipo: k % 2 ? 'PF' : 'PJ', status: direta ? 'aprovado' : st, valor_brl: i % 11 === 2 && k === 1 ? null : brl, valor_usd: i % 9 === 4 ? null : usd,
      execucao_direta: direta, atividade_id: id, fornecedor_id: null,
      objeto_pt: frase(200 + Math.floor(rnd() * 200)), modalidade_licitacao: null, numero_processo: null,
      criado_em: dia('2026-02-01', i * 3 + k), atualizado_em: dia('2026-03-01', i),
      atividade: { id, codigo, nome_pt: nome }, elaborador: k % 3 ? { nome_completo: PESS[k % 6] } : null,
      acoes: [{ status_novo: 'enviado_unesco', criado_em: dia('2026-02-10', i + k) }, ...(['aprovado', 'em_licitacao', 'contratado'].includes(st) ? [{ status_novo: 'aprovado', criado_em: dia('2026-03-05', i * 2 + k * 7) }] : [])],
      contratos: [], rodadas: [] }
    if (st !== 'cancelado') comp += usd || 0
    // contratos
    if (!direta && (st === 'contratado' || (st === 'em_licitacao' && k % 2))) {
      const nc = (i + k) % 4 === 0 ? 2 : 1
      for (let c = 0; c < nc; c++) {
        const cid = uid('c', i * 100 + k * 10 + c)
        const fator = (i + k + c) % 5 === 0 ? 1.08 : 0.82 + rnd() * 0.15
        const ctr = { id: cid, numero: `45005${String(60000 + i * 37 + k * 5 + c)}/2026-UNESCO-BRA`, tdr_id: tid, fornecedor_id: uid('f', (i + c) % 5), atividade_id: id,
          tipo: 'Consultoria', valor_total_brl: Math.round((t.valor_brl || 500000) * fator / nc * 100) / 100, valor_utilizado_brl: 0,
          dt_inicio: '2026-04-01', dt_fim: '2027-03-31', status: ST_CTR[(i + k + c) % ST_CTR.length], criado_em: dia('2026-04-01', i),
          fornecedor: { nome: FORN[(i + c) % 5], tipo: 'PJ' }, fornecedores: { nome: FORN[(i + c) % 5] } }
        contratos.push(ctr); t.contratos.push({ id: cid, numero: ctr.numero, status: ctr.status, valor_total_brl: ctr.valor_total_brl, fornecedor: ctr.fornecedor, fornecedores: ctr.fornecedores })
        for (let p = 0; p < 1 + (i + c) % 5; p++) {
          const sp = ['pendente', 'em_analise', 'devolvido', 'entrega_parcial', 'aprovado', 'pago', 'cancelado'][(i + p + k) % 7]
          const v = Math.round(ctr.valor_total_brl / 4 * 100) / 100
          prods.push({ id: uid('p', i * 1000 + k * 100 + c * 10 + p), contrato_id: cid, numero_produto: p + 1, descricao: 'Produto ' + (p + 1) + ': ' + frase(120 + Math.floor(rnd() * 140)),
            valor_brl: v, valor_aprovado: sp === 'entrega_parcial' ? v * 0.6 : null, dt_vencimento: '2026-0' + (5 + p) + '-15', situacao: sp })
          if (sp === 'pago') ef.push({ id: uid('e', ef.length + 1), atividade_id: id, tdr_id: tid, contrato_id: cid, situacao: 'pago', valor_brl: v, valor_usd: v / 5.3, valor_usd_unesco: p % 2 ? v / 5.41 : null, numero_produto: p + 1, dt_pagamento: '2026-07-1' + p })
        }
        if (c === 0 && fator < 1 && (i + k) % 3 === 0) encs.push({ id: uid('x', encs.length + 1), contrato_id: cid, tdr_id: tid, atividade_id: id, tipo: 'economia_contratacao', valor_liberado_brl: 12345.67 + i * 100, valor_liberado_usd: 2300 + i, status: (i % 4 === 0 ? 'revertido' : 'ativo'), motivo: 'Economia', produtos_afetados: [] })
      }
    }
    if (direta) { dir.push({ tdr_id: tid, planejado_usd: usd, consumido_usd: usd * 0.83, resta_usd: usd * 0.17, pct_consumido: 83.4 })
      for (let e = 0; e < 4; e++) ef.push({ id: uid('e', ef.length + 1), atividade_id: id, tdr_id: tid, contrato_id: null, situacao: e === 3 ? 'a_pagar' : 'pago', valor_brl: 18500.5 + e, valor_usd: 3500, valor_usd_unesco: e % 2 ? 3450 : null, numero_produto: null, dt_pagamento: '2026-08-0' + (e + 1) }) }
    // rodadas de licitação
    if (['em_licitacao', 'contratado', 'aprovado'].includes(t.status) && !direta) {
      const nr = 1 + ((i + k) % 3)
      for (let q = 0; q < nr; q++) {
        const rid = uid('l', i * 100 + k * 10 + q), mod = MODS[(i + k + q) % MODS.length]
        const sit = q < nr - 1 ? pick(['deserta', 'fracassada', 'sem_proposta']) : SIT_LIC[(i + k) % SIT_LIC.length]
        const rd = { id: rid, tdr_id: tid, rodada: q + 1, modalidade: mod, situacao: sit, numero_processo: `UNESCO/BRA/PROC/2026/${String(1000 + i * 7 + k)}-LOTE-ÚNICO-${q + 1}`,
          dt_abertura: '2026-05-0' + (q + 1), prazo_original: dia('2026-06-01', q * 10), prazo_em: sit === 'aberta' && (i % 2) ? dia('2026-10-01', k) : dia('2026-12-20', q),
          n_propostas: sit === 'com_propostas' ? 3 : sit === 'aberta' ? null : 0, resultado_obs: q % 2 ? frase(140) : null, medida: q < nr - 1 ? 'relancada' : null,
          medida_motivo: q < nr - 1 ? frase(90) : null, fundamento: mod === 'Inexigibilidade' ? frase(160) : null, fundamento_tipo: mod === 'Inexigibilidade' ? 'notoria' : null,
          edital_url: null, criado_em: dia('2026-05-01', i + q), tdr: { numero: num, atividade_id: id, atividade: { codigo } } }
        rodadas.push(rd); t.rodadas.push({ rodada: rd.rodada, situacao: rd.situacao, modalidade: rd.modalidade })
        for (let e = 0; e < 4; e++) empresas.push({ id: uid('m', empresas.length + 1), rodada_id: rid, empresa: FORN[(e + i) % 5], convidada: e < 3, apresentou_proposta: sit === 'com_propostas' && e % 2 === 0, ativo: true })
        if (q === 0 && i % 3 === 0) prorrog.push({ id: uid('o', prorrog.length + 1), rodada_id: rid })
      }
    }
    tdrs.push(t); a.tdrs.push({ id: tid, numero: num, valor_brl: t.valor_brl, valor_usd: t.valor_usd, status: t.status, execucao_direta: direta, contratos: t.contratos.map(c => ({ ...c })) })
  }
  a.encerramentos = encs.filter(e => e.atividade_id === id).map(e => ({ tdr_id: e.tdr_id, contrato_id: e.contrato_id, tipo: e.tipo, valor_liberado_brl: e.valor_liberado_brl, valor_liberado_usd: e.valor_liberado_usd, status: e.status }))
  const exc = i % 8 === 1 ? 15432.1 : 0
  const pago = ef.filter(e => e.atividade_id === id && e.situacao === 'pago').reduce((x, e) => x + e.valor_usd, 0)
  const lib = encs.filter(e => e.atividade_id === id && e.status === 'ativo').reduce((x, e) => x + e.valor_liberado_usd, 0)
  const saldo = orc - comp - exc + lib
  vwSaldo.push({ id, codigo, orcamento_usd: orc, comprometido_usd: comp + exc, pago_usd: pago, a_pagar_usd: 3500, liberado_usd: lib, saldo_livre_usd: saldo, excedente_contrato_usd: exc,
    status_saldo: saldo < 0 ? 'extrapolado' : orc === 0 ? 'sem_orcamento' : saldo / orc < 0.1 ? 'critico' : saldo / orc < 0.25 ? 'atencao' : 'ok' })
  // tarefas
  for (let k = 0; k < 2 + (i % 4); k++) {
    const t0 = tdrs.filter(t => t.atividade_id === id)[k]
    tarefas.push({ id: uid('k', i * 10 + k), codigo: `TR-${String(i * 10 + k).padStart(3, '0')}`, titulo: frase(70 + Math.floor(rnd() * 90)),
      status: ['a_fazer', 'em_andamento', 'em_revisao', 'bloqueada', 'concluida', 'cancelada'][(i + k) % 6], dt_prazo: k % 2 ? '2026-09-1' + k : '2027-01-20', atividade_id: id, ativo: true,
      participantes: [{ papel: 'responsavel', usuario: { nome_completo: PESS[(i + k) % 6] } }, { papel: 'observador', usuario: { nome_completo: PESS[(i + k + 1) % 6] } }],
      vinc: t0 ? [{ tdr_id: t0.id }] : [] })
  }
}
// matriz
const matriz_itens = [], vw_matriz_progresso = []
for (let m = 0; m < 24; m++) {
  const mid = uid('z', m + 1)
  matriz_itens.push({ id: mid, produto_codigo: 'P' + (1 + Math.floor(m / 4)), produto_titulo: frase(60), indicador: frase(120 + Math.floor(rnd() * 120)), meta_numerica: m % 5 === 0 ? null : 10 + m * 7,
    unidade: m % 3 ? 'famílias' : 'hectares', resultado: 1 + (m % 4), ods: ['15'], ativo: true, ordem: m })
  vw_matriz_progresso.push({ id: mid, realizado_confirmado: m * 3, realizado_pendente: m % 2 ? 4 : 0 })
  amz.push({ atividade_id: atividades[m % NA].id, matriz_item_id: mid }, { atividade_id: atividades[(m * 7) % NA].id, matriz_item_id: mid })
}

module.exports = {
  banco: {
    usuarios, atividades, tdrs, contratos, tdr_licitacao_rodadas: rodadas, tdr_licitacao_empresas: empresas, tdr_licitacao_prorrogacoes: prorrog,
    contrato_encerramentos: encs, vw_saldo_atividade: vwSaldo, atividade_responsaveis: respons, execucao_financeira: ef, contratos_produtos: prods,
    tarefas, atividade_matriz: amz, matriz_itens, vw_matriz_progresso, vw_tdr_execucao_direta: dir, tdr_acoes: acoes,
    viagem_protocolos: [], viagem_viajantes: [],
    cotacoes_usd: [{ cotacao: 5.4321, data_ref: '2026-11-27' }],
    __rpc: { fn_cotacao_usd: [{ ptax_venda: 5.3876, data_cotacao: '2026-11-27' }] },
  },
  filtros: {
    A5: { '#fil-a5-atividades .re-chk:nth-child(-n+5) input': true, '#fil-a5-mostrar input[value="cancelados"]': true },
    T4: { 'fil-sit-saldo': 'com_saldo' },
  },
}
