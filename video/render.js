// Renderiza o vídeo quadro a quadro (Chromium + GSAP pausado) e monta o MP4 com ffmpeg.
//   node video/render.js previa 3.2 14 40     → PNGs desses instantes em build/previa/
//   node video/render.js video                → build/quadros/*.jpg (4 processos) + saida/plataforma-gestao-projetos.mp4
//   acrescente "vertical" (ex.: node video/render.js video vertical) para a versão 1080×1920 das redes sociais
//   e "corte30" para a montagem de 30 s (build/corte30/, gerada por roteiro-30s.json)
//   "trend" = corte de 30 s no estilo trailer ao pôr do sol (cenas/trend.html + build/trend/, sempre vertical)
'use strict'
const { chromium } = require('playwright')
const { spawn, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const AQUI = __dirname, RAIZ = path.resolve(AQUI, '..'), B = path.join(AQUI, 'build')
const VERT = process.argv.includes('vertical')
const CORTE = (process.argv.find(a => a.startsWith('corte')) || '')            // ex.: corte30 → build/corte30/
const TREND = process.argv.includes('trend')                                     // corte de 30 s no estilo trailer (cenas/trend.html)
const BL = TREND ? path.join(B, 'trend') : CORTE ? path.join(B, CORTE) : B
const FPS = 30, PORTA = 5711, URL = TREND ? `http://127.0.0.1:${PORTA}/video/cenas/trend.html`
  : `http://127.0.0.1:${PORTA}/video/cenas/index.html?${VERT ? 'formato=vertical&' : ''}${CORTE ? 'linha=' + CORTE : ''}`
const VW = VERT || TREND ? 1080 : 1920, VH = VERT || TREND ? 1920 : 1080
const SUF = TREND ? '-30s-trailer-vertical' : (CORTE ? '-' + CORTE.replace('corte', '') + 's' : '') + (VERT ? '-vertical' : '')

async function abrir(nav) {
  const pg = await nav.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 })
  pg.on('pageerror', e => console.log('[erro]', e.message))
  await pg.goto(URL)
  await pg.waitForFunction(() => window.__pronto === true, null, { timeout: 60000 })
  return pg
}

;(async () => {
  const [modo, ...args] = process.argv.slice(2).filter(a => !['vertical', 'trend'].includes(a) && !a.startsWith('corte'))
  const srv = spawn('python3', ['-m', 'http.server', String(PORTA), '--bind', '127.0.0.1'], { cwd: RAIZ, stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 700))
  const nav = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-color-profile=srgb'] })
  try {
    if (modo === 'previa') {
      const dir = path.join(B, 'previa' + SUF); fs.mkdirSync(dir, { recursive: true })
      const pg = await abrir(nav)
      for (const t of args.map(Number)) {
        await pg.evaluate(t => window.__render(t), t)
        await pg.screenshot({ path: path.join(dir, `t${String(t).padStart(6, '0')}.png`) })
        console.log('✓', t)
      }
    } else {
      const total = JSON.parse(fs.readFileSync(path.join(BL, 'linha.json'))).total
      const N = Math.ceil(total * FPS), W = 4, dir = path.join(B, 'quadros' + SUF)
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })
      const t0 = Date.now()
      await Promise.all(Array.from({ length: W }, async (_, w) => {
        const pg = await abrir(nav)
        for (let f = w; f < N; f += W) {
          await pg.evaluate(t => window.__render(t), f / FPS)
          await pg.screenshot({ path: path.join(dir, `q${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 })
          if (w === 0 && f % 300 === 0) console.log(`quadro ${f}/${N} · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
        }
      }))
      const saida = path.join(AQUI, 'saida'); fs.mkdirSync(saida, { recursive: true })
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'q%05d.jpg'), '-i', path.join(BL, 'mix.wav'),
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
        '-c:a', 'aac', '-b:a', '192k', '-shortest',
        '-metadata', 'title=Plataforma Inteligente de Gestão de Projetos', '-metadata', 'artist=Erisson Cameli Santiago',
        path.join(saida, `plataforma-gestao-projetos${SUF}.mp4`)], { stdio: 'inherit' })
      console.log(`✓ saida/plataforma-gestao-projetos${SUF}.mp4`, ((Date.now() - t0) / 1000).toFixed(0), 's')
    }
  } finally { await nav.close(); srv.kill() }
})()
