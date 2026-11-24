// Confere se a animação é determinística: o mesmo instante tem de sair igual, venha a página de qualquer ponto.
// O render usa 4 processos intercalados; se um tween guardar o valor de partida conforme a ordem dos quadros,
// quadros vizinhos saem diferentes e a imagem "treme".
//   node video/conferir.js [vertical] [corte30|trend] [passo=0.25]
'use strict'
const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const sharp = require('sharp')

const VERT = process.argv.includes('vertical'), TREND = process.argv.includes('trend')
const CORTE = process.argv.find(a => a.startsWith('corte')) || ''
const PASSO = Number(process.argv.find(a => /^[\d.]+$/.test(a)) || 0.25)
const RAIZ = path.resolve(__dirname, '..'), B = path.join(__dirname, 'build')
const BL = TREND ? path.join(B, 'trend') : CORTE ? path.join(B, CORTE) : B
const URL = TREND ? 'http://127.0.0.1:5714/video/cenas/trend.html'
  : `http://127.0.0.1:5714/video/cenas/index.html?${VERT ? 'formato=vertical&' : ''}${CORTE ? 'linha=' + CORTE : ''}`
const VW = VERT || TREND ? 1080 : 1920, VH = VERT || TREND ? 1920 : 1080

async function abrir(nav) {
  const pg = await nav.newPage({ viewport: { width: VW, height: VH } })
  await pg.goto(URL); await pg.waitForFunction(() => window.__pronto === true, null, { timeout: 60000 }); return pg
}
const cru = async buf => (await sharp(buf).resize(480).raw().toBuffer())

;(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '5714', '--bind', '127.0.0.1'], { cwd: RAIZ, stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 700))
  const nav = await chromium.launch()
  const total = JSON.parse(fs.readFileSync(path.join(BL, 'linha.json'))).total
  const a = await abrir(nav), b = await abrir(nav)
  const ruins = []
  let t = 0
  for (let alvo = PASSO; alvo < total; alvo += PASSO) {
    // A: anda quadro a quadro até o alvo (como um processo que renderiza tudo em ordem)
    while (t < alvo - 1e-9) { t = Math.min(alvo, t + 1 / 30); await a.evaluate(x => window.__render(x), t) }
    // B: pula direto (como um processo que chega ao instante vindo de longe)
    await b.evaluate(x => window.__render(x), alvo)
    const [ia, ib] = await Promise.all([a.screenshot(), b.screenshot()].map(p => p.then(cru)))
    let soma = 0; for (let i = 0; i < ia.length; i++) soma += Math.abs(ia[i] - ib[i])
    const dif = soma / ia.length
    if (dif > 0.6) ruins.push([alvo.toFixed(2), dif.toFixed(2)])
  }
  console.log(ruins.length ? 'DIFERENTES (t, diferença média):\n' + ruins.map(r => r.join('  ')).join('\n') : 'ok: todos os instantes iguais pelos dois caminhos')
  await nav.close(); srv.kill()
})()
