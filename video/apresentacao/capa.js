// Capa da apresentação: a "parede de telas" do vídeo (cena da marca), sem textos.
//   node apresentacao/capa.js   → build/ppt/img/capa-parede.png
'use strict'
const { chromium } = require('playwright'); const { spawn } = require('node:child_process'); const path = require('node:path')
const RAIZ = path.resolve(__dirname, '..', '..'), SAIDA = path.resolve(__dirname, '..', 'build', 'ppt', 'img', 'capa-parede.png')
;(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '5713', '--bind', '127.0.0.1'], { cwd: RAIZ, stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 600))
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  try {
    await p.goto('http://127.0.0.1:5713/video/cenas/index.html'); await p.waitForFunction(() => window.__pronto === true)
    await p.evaluate(() => { window.__render(9.2); document.querySelectorAll('.marca-centro,#legenda,.demo').forEach(e => e.style.display = 'none') })
    await p.screenshot({ path: SAIDA }); console.log('ok', SAIDA)
  } finally { await b.close(); srv.kill() }
})()
