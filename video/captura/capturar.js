// Captura telas REAIS da plataforma com o banco em memória (stub.js + dados.js).
//   uso: node video/captura/capturar.js [nome-da-tela ...]
'use strict'
const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const RAIZ = path.resolve(__dirname, '..', '..')
const NM = path.resolve(__dirname, '..', 'node_modules')
const SAIDA = path.resolve(__dirname, '..', 'build', 'telas')
const PORTA = 5617
const BASE = `http://127.0.0.1:${PORTA}`
fs.mkdirSync(SAIDA, { recursive: true })

const STUB = fs.readFileSync(path.join(__dirname, 'stub.js'), 'utf8')
const D = require('./extras.js')
const TELAS = require('./telas.js')

// CDN → node_modules (a rede desta máquina não alcança jsdelivr/unpkg/cdnjs)
function deCdn(url) {
  let m
  if (/@supabase\/supabase-js/.test(url)) return { stub: true }
  if (/chart(\.js|\.umd)/i.test(url) && /chart/i.test(url)) return { arq: path.join(NM, 'chart.js/dist/chart.umd.js') }
  if ((m = url.match(/(?:unpkg\.com|cdn\.jsdelivr\.net\/npm)\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/))) {
    let p = path.join(NM, m[1], m[2])
    if (!fs.existsSync(p) && m[1] === '@turf/turf') p = path.join(NM, '@turf/turf/turf.min.js')
    if (fs.existsSync(p)) return { arq: p }
  }
  return { vazio: true }
}

async function abrir(nav, tela) {
  const banco = Object.assign({}, D.base, tela.dados ? tela.dados(D) : {})
  if (banco.__rpcExtra) { banco.__rpc = Object.assign({}, D.base.__rpc, banco.__rpcExtra); delete banco.__rpcExtra }
  const ctx = await nav.newContext({ viewport: tela.viewport || { width: 1600, height: 1000 }, deviceScaleFactor: tela.escala || 2,
    isMobile: !!tela.celular, hasTouch: !!tela.celular, locale: 'pt-BR', timezoneId: 'America/Rio_Branco' })
  const pg = await ctx.newPage()
  // o site público traz o supabase-js na própria pasta (vendor): também vira o banco em memória
  await pg.route(/site-publico\/vendor\/supabase-js[^/]*\/supabase\.js/, r => r.fulfill({ contentType: 'application/javascript',
    body: `window.__DADOS=${JSON.stringify(banco)};window.__UID=null;\n` + STUB }))
  await pg.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)\//, r => {
    const u = r.request().url(), d = deCdn(u)
    if (d.stub) return r.fulfill({ contentType: 'application/javascript', body: `window.__DADOS=${JSON.stringify(banco)};window.__UID=${JSON.stringify(tela.uid === undefined ? D.U.ana : tela.uid)};\n` + STUB })
    if (d.arq) return r.fulfill({ path: d.arq, contentType: d.arq.endsWith('.css') ? 'text/css' : 'application/javascript' })
    return r.fulfill({ contentType: u.endsWith('.css') ? 'text/css' : 'application/javascript', body: '' })
  })
  await pg.route(/supabase\.co\//, r => r.fulfill({ contentType: 'application/json', body: '{}' }))
  // satélite do Google (bloqueado aqui) → mesmo tile do ArcGIS World Imagery
  await pg.route(/google\.com\/vt/, async r => {
    const u = r.request().url(), g = k => (u.match(new RegExp('[&?/]' + k + '=(\\d+)')) || [])[1], x = g('x'), y = g('y'), z = g('z')
    try { return await r.continue({ url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}` }) }
    catch (e) { return r.fulfill({ status: 404, body: '' }) }
  })
  await pg.route(/mapbiomas|googleapis\.com\/storage|tile\.openstreetmap/, r => r.fulfill({ status: 404, body: '' }))
  await pg.addInitScript(t => {
    try {
      localStorage.setItem('dima_ultima_atividade', String(Date.now() + 9e8))
      localStorage.setItem('diag_tema', t.tema || 'escuro')
      localStorage.setItem('dima_idioma', 'pt')
      localStorage.setItem('siguc_guia_plataforma', JSON.stringify({ visto: true, convite: true, dispensado: true }))
      for (const [k, v] of Object.entries(t.ls || {})) localStorage.setItem(k, v)
    } catch (e) {}
    // relógio fixo: datas do vídeo não mudam conforme o dia da renderização
    const Agora = new Date('2026-11-24T14:30:00-05:00').getTime(), Real = Date, delta = Agora - Real.now()
    class F extends Real { constructor(...a) { a.length ? super(...a) : super(Real.now() + delta) } static now() { return Real.now() + delta } }
    window.Date = F
  }, { tema: tela.tema, ls: tela.ls })
  pg.on('pageerror', e => console.log(`   [${tela.nome}] erro: ${e.message.slice(0, 160)}`))
  return { ctx, pg }
}

;(async () => {
  const filtro = process.argv.slice(2)
  const srv = spawn('python3', ['-m', 'http.server', String(PORTA), '--bind', '127.0.0.1'], { cwd: RAIZ, stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 700))
  const nav = await chromium.launch()
  try {
    for (const tela of TELAS) {
      if (filtro.length && !filtro.includes(tela.nome)) continue
      const { ctx, pg } = await abrir(nav, tela)
      try {
        await pg.goto(BASE + tela.url, { waitUntil: 'load' })
        await pg.waitForTimeout(tela.espera || 2500)
        if (tela.prep) await tela.prep(pg, D)
        await pg.waitForTimeout(600)
        // esconde convites/toasts que poluem a captura
        await pg.addStyleTag({ content: '.guia-convite,.siguc-convite,#toast-container,.toast,.dg-convite{display:none!important}' + (tela.css || '') })
        for (const [i, cena] of (tela.capturas || [{}]).entries()) {
          if (cena.antes) await cena.antes(pg, D)
          await pg.waitForTimeout(cena.espera || 300)
          const arq = path.join(SAIDA, `${tela.nome}${cena.sufixo ? '-' + cena.sufixo : ''}.png`)
          await pg.screenshot({ path: arq, fullPage: !!cena.inteira, clip: cena.clip })
          console.log('✓', path.relative(RAIZ, arq))
        }
        const log = await pg.evaluate(() => [...new Set(window.__LOG || [])])
        if (log.length) console.log('   faltou:', log.join(' | '))
      } catch (e) { console.log('✗', tela.nome, e.message.slice(0, 200)) }
      await ctx.close()
    }
  } finally { await nav.close(); srv.kill() }
})()
