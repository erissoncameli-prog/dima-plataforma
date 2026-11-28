// Conferência dos mini gráficos dos números do topo (js/kpi-graficos.js) com banco falso.
// Abre TDRs, Contratos e Financeiro em computador e celular, temas claro e escuro, e:
//   • confere erros na página, se cada quadro ganhou o gráfico (.kg-tem) e se algo passa da largura do quadro;
//   • salva uma imagem da linha de números de cada combinação em tests/kpi-graficos/saida/.
// uso: node tests/kpi-graficos/conferir.js
'use strict'
const { chromium } = require('playwright')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const { stub, montar, SA } = require('../relatorios/banco-falso')

const RAIZ = path.resolve(__dirname, '..', '..')
const SAIDA = path.join(__dirname, 'saida')
const PORTA = 5900 + Math.floor(Math.random() * 90)
const BASE = `http://127.0.0.1:${PORTA}`
fs.mkdirSync(SAIDA, { recursive: true })

const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const ts = n => dia(n) + 'T12:00:00Z'
let seq = 0; const id = p => `${p}-${String(++seq).padStart(4, '0')}`

// ── TDRs: todas as fases, rascunhos de várias idades, atrasados, contratos acima e abaixo do TDR
const ATV = { id: 'atv-1', codigo: '1.1.1-01', nome_pt: 'Atividade teste', responsavel_id: SA, responsavel: { id: SA, nome_completo: 'Ana Admin da Silva' } }
const tdrs = []
const T = (status, o = {}) => tdrs.push(Object.assign({ id: id('tdr'), numero: `TDR-${seq}`, atividade_id: ATV.id, atividades: ATV, tipo: 'PJ', status,
  valor_brl: 100000 + seq * 3000, valor_usd: 20000, objeto_pt: 'Objeto ' + seq, criado_em: ts(-10), prazo_limite: null, contratos: [] }, o))
;[-5, -12, -40, -70, -120, -200].forEach(n => T('rascunho', { criado_em: ts(n) }))
T('submetido', { prazo_limite: dia(-3) }); T('submetido'); T('revisao_interna'); T('pendente_correcao', { prazo_limite: dia(-20) })
T('em_avaliacao', { prazo_limite: dia(-45) }); T('em_revisao_unesco', { prazo_limite: dia(-90) }); T('enviado_unesco')
T('rascunho', { prazo_limite: dia(-8), criado_em: ts(-30) })
T('aprovado'); T('aprovado'); T('em_licitacao'); T('em_licitacao')
for (let i = 0; i < 9; i++) T('contratado', { contratos: [{ id: id('c'), numero: 'X', valor_total_brl: 90000 + i * 2000, status: 'vigente' }] })
T('contratado', { valor_brl: 50000, contratos: [{ id: id('c'), numero: 'Y', valor_total_brl: 80000, status: 'vigente' }] })
T('cancelado', { prazo_limite: dia(-50) }); T('cancelado')

// ── Contratos: vigentes com prazos variados e execução atrás/à frente do tempo
const FORN = ['Consultoria Alfa Ltda', 'Beta Engenharia', 'Gama Serviços', 'Delta', 'Épsilon', 'Zeta']
const contratos = []
const C = (status, o = {}) => contratos.push(Object.assign({ id: id('ct'), numero: '45005' + seq, status, fornecedor_id: 'f' + (seq % 6), fornecedores: { id: 'f' + (seq % 6), nome: FORN[seq % 6], tipo: 'PJ' },
  atividade_id: ATV.id, atividades: { id: ATV.id, codigo: ATV.codigo, nome_pt: ATV.nome_pt }, tdrs: null, objeto_pt: 'Objeto', valor_total_brl: 200000,
  valor_utilizado_brl: 0, valor_comprometido_brl: 0, dt_inicio: dia(-200), dt_fim: dia(160), contrato_assinado_url: 'x.pdf', criado_em: ts(-200) }, o))
C('vigente', { valor_total_brl: 900000, valor_utilizado_brl: 100000, dt_inicio: dia(-300), dt_fim: dia(20) })
C('vigente', { valor_total_brl: 500000, valor_utilizado_brl: 400000, dt_inicio: dia(-100), dt_fim: dia(200) })
C('vigente', { valor_total_brl: 300000, valor_utilizado_brl: 50000, dt_inicio: dia(-400), dt_fim: dia(-10), contrato_assinado_url: null })
C('vigente', { valor_utilizado_brl: 150000, dt_fim: dia(60) }); C('vigente', { valor_utilizado_brl: 20000, dt_inicio: dia(-20), dt_fim: dia(300) })
C('vigente', { valor_total_brl: 120000, valor_utilizado_brl: 0, dt_inicio: dia(-150), dt_fim: dia(25) })
C('encerrado', { contrato_assinado_url: null }); C('cancelado', { contrato_assinado_url: null }); C('aguardando_cobertura')

// ── Financeiro: pagamentos nos últimos 12 meses, a pagar com vencimentos variados
const lanc = []
const L = (situacao, o = {}) => lanc.push(Object.assign({ id: id('l'), situacao, valor_brl: 20000, valor_usd_unesco: 3800, cotacao_unesco: 5.2,
  atividade_id: ATV.id, atividades: { id: ATV.id, codigo: ATV.codigo, nome_pt: ATV.nome_pt, resultado_id: null }, contratos: null, fornecedores: { id: 'f1', nome: 'Beta', tipo: 'PJ' },
  descricao: 'Lançamento', dt_vencimento: dia(10), dt_pagamento: null, criado_em: ts(-30) }, o))
for (let m = 0; m < 12; m++) for (let k = 0; k <= (m * 7) % 4; k++) L('pago', { dt_pagamento: dia(-m * 30 - k), dt_vencimento: dia(-m * 30 - k), valor_brl: 15000 + k * 9000 + m * 1000 })
;[-5, -45, -75, -130, 3, 6, 20, 60, null].forEach((n, i) => L('a_pagar', { dt_vencimento: n === null ? null : dia(n), valor_brl: 10000 + i * 5000, valor_usd_unesco: null }))
L('cancelado')

const banco = montar({
  tdrs, contratos, execucao_financeira: lanc, atividades: [ATV], fornecedores: FORN.map((n, i) => ({ id: 'f' + i, nome: n, tipo: 'PJ' })), resultados: [],
  tdr_cancelamentos: [], cotacoes_usd: [{ id: 'q', data_ref: dia(0), cotacao: 5.4, criado_em: ts(0) }],
  __rpc: { fn_cob_livre: 0 },
})

const PAGINAS = [['tdrs', '#stats'], ['contratos', '#stats'], ['financeiro', '#stats']]
const VISTAS = [['computador', { width: 1600, height: 900 }], ['notebook', { width: 1280, height: 800 }], ['celular', { width: 390, height: 844 }]]

;(async () => {
  // servidor de arquivos simples (sem depender do python)
  const TIPOS = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }
  const srv = http.createServer((req, res) => {
    const arq = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]))
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream' }); fs.createReadStream(arq).pipe(res)
  })
  await new Promise(r => srv.listen(PORTA, '127.0.0.1', r))
  // PW_CANAL=msedge usa o Edge instalado; PW_CHROME=<caminho> usa outro executável
  const nav = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : process.env.PW_CANAL ? { channel: process.env.PW_CANAL } : {})
  const problemas = []
  try {
    for (const tema of ['claro', 'escuro']) for (const [vista, vp] of VISTAS) {
      const ctx = await nav.newContext({ viewport: vp, deviceScaleFactor: 2 })
      for (const [pag, sel] of PAGINAS) {
        const pg = await ctx.newPage()
        const erros = []
        pg.on('pageerror', e => erros.push(e.message))
        await pg.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: stub(banco, SA) }))
        await pg.route(/cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|unpkg\.com/, r => r.fulfill({ body: '' }))
        await pg.addInitScript(t => { try { localStorage.setItem('dima_ultima_atividade', String(Date.now())); localStorage.setItem('diag_tema', t); localStorage.setItem('siguc_guia_plataforma', '{"visto":true}') } catch (e) {} }, tema)
        await pg.goto(`${BASE}/pages/${pag}.html`)
        await pg.waitForSelector(sel + ' .kg-tem', { timeout: 15000 }).catch(() => {})
        await pg.waitForTimeout(300)
        const r = await pg.evaluate(s => {
          const cards = [...document.querySelectorAll(s + ' > *')]
          return cards.map(c => {
            const b = c.getBoundingClientRect(); let fora = 0
            c.querySelectorAll('*').forEach(e => { const x = e.getBoundingClientRect(); if (x.width && (x.right > b.right + 1 || x.left < b.left - 1)) fora++ })
            return { grafico: c.classList.contains('kg-tem'), fora, texto: (c.querySelector('.kg-ler') || {}).textContent || '' }
          })
        }, sel)
        const nome = `${pag}-${vista}-${tema}`
        r.forEach((c, i) => { if (!c.grafico) problemas.push(`${nome}: quadro ${i + 1} sem gráfico`); if (c.fora) problemas.push(`${nome}: quadro ${i + 1} com ${c.fora} elemento(s) fora`) })
        erros.forEach(e => problemas.push(`${nome}: erro na página: ${e}`))
        if (tema === 'claro' && vista === 'computador') console.log(pag + ': ' + r.map(c => c.texto.trim()).join(' | '))
        const el = await pg.$(sel)
        if (el) await el.screenshot({ path: path.join(SAIDA, nome + '.png') })
        await pg.close()
      }
      await ctx.close()
    }
  } finally { await nav.close(); srv.close() }
  console.log(problemas.length ? 'PROBLEMAS:\n' + problemas.join('\n') : 'OK: todos os quadros com gráfico, nada fora do quadro, sem erro na página.')
  console.log('Imagens em ' + SAIDA)
})()
