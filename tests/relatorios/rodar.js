// ════════════════════════════════════════════════════════════════════════
// Conferência dos relatórios A4 da aba Relatórios, no Chromium de verdade, com banco falso.
// Para cada relatório × orientação (retrato e paisagem):
//   • prévia: algo passa da largura útil da folha? a letra foi reduzida (doc-fit / doc-fit-max)? coluna espremida?
//   • páginas (FolhaA4.paginar): toda página tem cabeçalho, rodapé e "Página X de Y"? corpo cortado? página vazia?
//   • PDF (motor de impressão): tamanho da página bate com a orientação? nº de páginas bate?
//   • erros na página, erro ao gerar, consultas a tabelas não semeadas, relatório sem linhas.
// uso: node tests/relatorios/rodar.js --semente sementes/financeiro.js --ids F1,F2 [--saida DIR]
// ════════════════════════════════════════════════════════════════════════
'use strict'
const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const { stub, montar, SA } = require('./banco-falso')

const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null }
const RAIZ = path.resolve(__dirname, '..', '..')
const sementeArq = path.resolve(__dirname, arg('semente') || 'sementes/vazia.js')
const SEM = require(sementeArq)
const IDS = (arg('ids') || '').split(',').map(s => s.trim()).filter(Boolean)
const SAIDA = path.resolve(arg('saida') || path.join(__dirname, 'saida', path.basename(sementeArq, '.js')))
const PORTA = Number(arg('porta') || 5600 + Math.floor(Math.random() * 300))
const BASE = `http://127.0.0.1:${PORTA}`
fs.mkdirSync(SAIDA, { recursive: true })

// Mede a folha da prévia (largura exata do A4). Roda na página.
function medirFolha() {
  const w = document.querySelector('#exp-preview-content .doc-wrap')
  if (!w) return { erro: 'sem folha na prévia' }
  const cs = getComputedStyle(w), r = w.getBoundingClientRect()
  const limite = r.right - parseFloat(cs.paddingRight) + 0.5
  const fora = []
  for (const e of w.querySelectorAll('.doc-body *')) {
    const b = e.getBoundingClientRect()
    if (b.width > 0 && b.right > limite) fora.push({ tag: e.tagName.toLowerCase(), cls: String(e.className || '').slice(0, 40), excesso_px: Math.round(b.right - limite), txt: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70) })
  }
  fora.sort((a, b) => b.excesso_px - a.excesso_px)
  // coluna espremida: célula estreita com texto que quebra letra a letra
  const espremidas = []
  for (const td of w.querySelectorAll('.doc-body td, .doc-body th')) {
    const t = (td.textContent || '').trim(); if (t.length < 4) continue
    const lh = parseFloat(getComputedStyle(td).lineHeight) || 12
    const linhas = Math.round((td.clientHeight - parseFloat(getComputedStyle(td).paddingTop) - parseFloat(getComputedStyle(td).paddingBottom)) / lh)
    const palavras = t.split(/\s+/).length
    if (td.clientWidth < 34 || (linhas > palavras + 2 && linhas > 3)) espremidas.push({ largura_px: td.clientWidth, linhas, txt: t.slice(0, 50) })
  }
  let menorFonte = 99
  for (const e of w.querySelectorAll('.doc-body td, .doc-body th')) { const fz = parseFloat(getComputedStyle(e).fontSize); if (fz < menorFonte) menorFonte = fz }
  const linhasTabela = w.querySelectorAll('.doc-body table tbody tr').length
  const av = document.getElementById('exp-ajuste')
  return {
    largura_folha_mm: Math.round(r.width / 3.7795), paisagem_classe: w.classList.contains('doc-paisagem'),
    scroll_excesso_px: w.scrollWidth - w.clientWidth, fit: w.classList.contains('doc-fit'), fit_max: w.classList.contains('doc-fit-max'),
    aviso: av && !av.hidden ? av.textContent.trim() : '', menor_fonte_px: menorFonte === 99 ? null : menorFonte,
    fora: fora.slice(0, 6), n_fora: fora.length, espremidas: espremidas.slice(0, 6), n_espremidas: espremidas.length, linhas_tabela: linhasTabela,
    vazio: !linhasTabela,
  }
}

// Confere as páginas montadas por FolhaA4.paginar no #print-area. Roda na página.
function medirPaginas() {
  const pa = document.getElementById('print-area')
  pa.style.cssText = 'display:block;position:absolute;left:-10000px;top:0'
  const pags = [...pa.querySelectorAll('.fa4-pag')]
  const res = pags.map((p, i) => {
    const corpo = p.querySelector('.fa4-corpo')
    const num = p.querySelector('.fa4-num')?.textContent.trim() || ''
    const cr = corpo?.getBoundingClientRect(), pr = p.getBoundingClientRect()
    const limite = pr.right - parseFloat(getComputedStyle(p).paddingRight) + 0.5
    let foraLarg = 0
    if (corpo) for (const e of corpo.querySelectorAll('*')) { const b = e.getBoundingClientRect(); if (b.width && b.right > limite) foraLarg = Math.max(foraLarg, Math.round(b.right - limite)) }
    return {
      i: i + 1, cabecalho: !!p.querySelector('.doc-header'), rodape: !!p.querySelector('.doc-footer'), num,
      num_ok: new RegExp('P[aá]gina\\s*' + (i + 1) + '\\s*de\\s*' + pags.length).test(num),
      cortado_px: corpo ? Math.max(0, corpo.scrollHeight - corpo.clientHeight) : null,
      vazio: corpo ? !corpo.textContent.trim() && !corpo.querySelector('img,svg,canvas') : true,
      fora_largura_px: foraLarg, paisagem: p.classList.contains('doc-paisagem'), largura_mm: Math.round(pr.width / 3.7795),
      zoom: corpo ? [...corpo.querySelectorAll('[style*="zoom"]')].map(e => e.style.zoom).slice(0, 3) : [],
    }
  })
  const css = document.getElementById('_po')?.textContent || ''
  pa.style.cssText = 'display:none'
  return { n: pags.length, paginas: res, page_css: css, sem_paginas: !pags.length, html_curto: pags.length ? '' : pa.innerHTML.slice(0, 200) }
}

function pdfInfo(buf) {
  const s = buf.toString('latin1')
  const mb = [...s.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => [Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])])
  const n = (s.match(/\/Type\s*\/Page[^s]/g) || []).length
  const t = mb[0] || [0, 0]
  return { paginas: n, largura_pt: Math.round(t[0]), altura_pt: Math.round(t[1]), paisagem: t[0] > t[1], tamanhos_distintos: [...new Set(mb.map(x => x.map(Math.round).join('x')))] }
}

;(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORTA), '--bind', '127.0.0.1'], { cwd: RAIZ, stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 900))
  const nav = await chromium.launch()
  const resultados = []
  const banco = montar(SEM.banco || SEM)
  try {
    for (const id of IDS) {
      const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } })
      const pg = await ctx.newPage()
      const errosPagina = []
      await pg.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: stub(banco, SA) }))
      await pg.route(/cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|unpkg\.com/, r => r.fulfill({ body: '' }))
      await pg.addInitScript(() => { try { localStorage.setItem('dima_ultima_atividade', String(Date.now())); localStorage.setItem('diag_tema', 'claro') } catch (e) {} ; window.print = () => {} })
      pg.on('pageerror', e => errosPagina.push('pageerror: ' + e.message))
      pg.on('console', m => { if (m.type() === 'error') errosPagina.push('console: ' + m.text().slice(0, 200)) })
      const R = { id, orientacao_catalogo: null, erro_gerar: '', erros_pagina: errosPagina, por_orientacao: {} }
      try {
        await pg.goto(BASE + '/pages/relatorios.html')
        await pg.waitForSelector('#rel-lista [data-rel]', { timeout: 15000 })
        R.orientacao_catalogo = await pg.evaluate(i => (RELATORIOS.find(r => r.id === i) || {}).paisagem ? 'paisagem' : 'retrato', id)
        await pg.evaluate(i => selecionarRel(i), id)
        await pg.waitForSelector('#preview-area', { timeout: 15000 })
        const fil = (SEM.filtros || {})[id] || {}
        await pg.evaluate(f => {
          for (const [sel, v] of Object.entries(f)) {
            const els = sel.startsWith('#') || sel.startsWith('[') || sel.startsWith('.') ? document.querySelectorAll(sel) : [document.getElementById(sel)]
            for (const el of els) {
              if (!el) continue
              if (el.type === 'checkbox') el.checked = !!v
              else if (el.tagName === 'SELECT' && el.multiple) [...el.options].forEach(o => { o.selected = [].concat(v).includes(o.value) })
              else { if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === v)) el.add(new Option(v, v)); el.value = v }
              el.dispatchEvent(new Event('change', { bubbles: true }))
            }
          }
        }, fil)
        await pg.evaluate(i => gerarRelatorio(i), id)
        await pg.waitForTimeout(400)
        R.erro_gerar = await pg.evaluate(() => document.querySelector('#preview-area .re-erro')?.textContent.trim() || '')
        if (!R.erro_gerar && await pg.$('#doc-content')) {
          await pg.evaluate(() => abrirExport())
          for (const o of ['portrait', 'landscape']) {
            await pg.evaluate(x => expOrientar(x), o)
            await pg.waitForTimeout(150)
            const folha = await pg.evaluate(medirFolha)
            const nome = `${id}_${o === 'portrait' ? 'retrato' : 'paisagem'}`
            const el = await pg.$('#exp-preview-content .doc-wrap')
            if (el) await el.screenshot({ path: path.join(SAIDA, nome + '_previa.png') }).catch(() => {})
            const ok = await pg.evaluate(x => prepararImpressao(x), o)
            const pags = ok ? await pg.evaluate(medirPaginas) : { erro: 'prepararImpressao devolveu false' }
            // PDF pelo motor de impressão (o @page vem de FolhaA4.paginaCss)
            await pg.evaluate(() => { document.getElementById('print-area').style.cssText = '' })
            const buf = await pg.pdf({ preferCSSPageSize: true, printBackground: true }).catch(e => null)
            let pdf = null
            if (buf) { fs.writeFileSync(path.join(SAIDA, nome + '.pdf'), buf); pdf = pdfInfo(buf) }
            await pg.evaluate(() => { document.getElementById('print-area').style.cssText = 'display:none' })
            R.por_orientacao[o === 'portrait' ? 'retrato' : 'paisagem'] = { folha, paginas: pags, pdf }
          }
        }
      } catch (e) { R.erro_gerar = R.erro_gerar || ('falha do teste: ' + e.message.split('\n')[0]) }
      R.consultas = await pg.evaluate(() => window.__CONSULTAS || []).catch(() => [])
      R.rpcs = await pg.evaluate(() => (window.__RPCS || []).map(r => ({ nome: r.nome, semeada: r.semeada }))).catch(() => [])
      R.nao_semeadas = [...new Set(R.consultas.filter(c => !c.semeada).map(c => c.tabela).concat(R.rpcs.filter(r => !r.semeada).map(r => 'rpc:' + r.nome)))]
      R.problemas = problemas(R)
      resultados.push(R)
      console.log(`${id}: ${R.problemas.length ? R.problemas.join(' | ') : 'ok'}`)
      await ctx.close()
    }
  } finally {
    await nav.close(); srv.kill()
    fs.writeFileSync(path.join(SAIDA, 'resultado.json'), JSON.stringify(resultados, null, 2))
    console.log('\nResultado em ' + path.join(SAIDA, 'resultado.json'))
  }
})()

// Resumo legível do que falhou
function problemas(R) {
  const p = []
  if (R.erro_gerar) p.push('ERRO ao gerar: ' + R.erro_gerar.slice(0, 120))
  for (const e of R.erros_pagina) if (!/favicon|ERR_|net::|Failed to load resource/.test(e)) p.push('erro na página: ' + e.slice(0, 120))
  for (const [o, d] of Object.entries(R.por_orientacao)) {
    const f = d.folha || {}, g = d.paginas || {}, pdf = d.pdf
    if (f.n_fora) p.push(`${o}: ${f.n_fora} elemento(s) passam da largura útil (até ${f.fora[0].excesso_px}px: ${f.fora[0].tag} "${f.fora[0].txt.slice(0, 30)}")`)
    if (f.scroll_excesso_px > 1) p.push(`${o}: folha rola de lado ${f.scroll_excesso_px}px`)
    if (f.fit_max) p.push(`${o}: letra reduzida ao mínimo (doc-fit-max)`) ; else if (f.fit) p.push(`${o}: letra reduzida (doc-fit)`)
    if (f.n_espremidas) p.push(`${o}: ${f.n_espremidas} célula(s) espremida(s) (ex.: ${f.espremidas[0].largura_px}px "${f.espremidas[0].txt.slice(0, 25)}")`)
    if (f.vazio) p.push(`${o}: nenhuma linha de tabela (semente incompleta?)`)
    if (g.sem_paginas) p.push(`${o}: paginar não montou páginas`)
    for (const pg of g.paginas || []) {
      if (!pg.cabecalho || !pg.rodape) p.push(`${o}: página ${pg.i} sem ${!pg.cabecalho ? 'cabeçalho' : 'rodapé'}`)
      if (!pg.num_ok) p.push(`${o}: página ${pg.i} numeração "${pg.num}"`)
      if (pg.cortado_px > 2) p.push(`${o}: página ${pg.i} corpo cortado ${pg.cortado_px}px`)
      if (pg.vazio) p.push(`${o}: página ${pg.i} vazia`)
      if (pg.fora_largura_px > 1) p.push(`${o}: página ${pg.i} conteúdo passa da largura ${pg.fora_largura_px}px`)
      if (pg.paisagem !== (o === 'paisagem')) p.push(`${o}: página ${pg.i} montada na orientação errada`)
    }
    if (pdf) {
      if (pdf.paisagem !== (o === 'paisagem')) p.push(`${o}: PDF saiu ${pdf.paisagem ? 'paisagem' : 'retrato'} (${pdf.largura_pt}x${pdf.altura_pt}pt)`)
      if (pdf.tamanhos_distintos.length > 1) p.push(`${o}: PDF com páginas de tamanhos diferentes ${pdf.tamanhos_distintos.join(',')}`)
      if (g.n && pdf.paginas !== g.n) p.push(`${o}: PDF tem ${pdf.paginas} página(s), paginação montou ${g.n} (página em branco ou estouro)`)
    } else if (o) p.push(`${o}: PDF não foi gerado`)
  }
  if (R.nao_semeadas?.length) p.push('não semeadas: ' + R.nao_semeadas.join(', '))
  return p
}
