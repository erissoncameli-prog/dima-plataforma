// Visão Geral — exportar as guias num arquivo só: PDF, Excel, PowerPoint ou HTML.
// Lê o que a tela já desenhou em #pane-<guia> (números do topo, gráficos, barras de composição, tabelas,
// alertas) e os gráficos do Chart.js pela ponte window.VGExp (pages/dashboard.html). Os gráficos são
// redesenhados fora da tela, no tema claro, em alta resolução — o arquivo sai igual com a tela clara ou escura.
//   PDF        = folha A4 padrão (FolhaA4), texto pesquisável; gráfico = imagem + tabela de dados
//   Excel      = ExcelJS: aba Resumo + uma aba por guia (imagem do gráfico + dados em número)
//   PowerPoint = PptxGenJS: gráficos nativos (editáveis); bolhas e o SVG de distância viram imagem
//   HTML       = arquivo único, abre sem internet (imagens embutidas)
// Nada sai do navegador. Minhas tarefas e Cobertura de indicadores não entram (VGExp.abas()).
;(function () {
  'use strict'

  // ── Bibliotecas: carregadas só no clique ─────────────────────────────────
  const LIB = {}
  function puxLib (src, global) {
    if (window[global]) return Promise.resolve()
    if (LIB[src]) return LIB[src]
    LIB[src] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src
      s.onload = res; s.onerror = () => { delete LIB[src]; rej(new Error('Não foi possível carregar a biblioteca de exportação.')) }
      document.head.appendChild(s)
    })
    return LIB[src]
  }

  const FORMATOS = [
    ['pdf', 'PDF', 'Folha A4 para imprimir ou salvar em PDF'],
    ['xlsx', 'Excel', 'Uma aba por guia, gráficos e dados em número'],
    ['pptx', 'PowerPoint', 'Um slide por gráfico, editável'],
    ['html', 'HTML', 'Página única que abre sem internet'],
  ]
  const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : ''
  const hoje = () => new Date().toISOString().slice(0, 10)
  const agora = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // ── Células: { t: texto exibido, v: valor (número ou texto), f: formato do Excel } ──
  const cel = t => ({ t: String(t ?? ''), v: String(t ?? '') })
  function numDe (t) {
    const m = /^(US\$|R\$)?\s*(-?[\d.]+(?:,\d+)?)\s*(%)?$/.exec(String(t).trim())
    if (!m) return null
    const n = Number(m[2].replace(/\./g, '').replace(',', '.'))
    if (!isFinite(n)) return null
    return { v: n, f: m[1] === 'US$' ? '"US$" #,##0.00' : m[1] === 'R$' ? '"R$" #,##0.00' : m[3] ? '0.0"%"' : '#,##0.##' }
  }
  // número só quando a coluna é numérica (td.n) ou o texto traz moeda/% — "1.1.1" é código, não número
  function celTexto (t, numerica) {
    t = String(t ?? '').replace(/\s+/g, ' ').trim()
    const n = (numerica || /^(US\$|R\$)|%$/.test(t)) ? numDe(t) : null
    return n ? { t, v: n.v, f: n.f } : cel(t)
  }
  const celPct = v => ({ t: Math.round(v) + '%', v: Math.round(v * 10) / 10, f: '0.0"%"' })

  // Tabela HTML → { cab, linhas, rodape } (colspan vira células vazias)
  function tabelaDe (tbl) {
    const linha = tr => {
      const out = []
      ;[...tr.children].forEach(td => {
        out.push(celTexto(td.textContent, td.classList.contains('n')))
        for (let i = 1; i < (td.colSpan || 1); i++) out.push(cel(''))
      })
      return out
    }
    return {
      cab: [...tbl.querySelectorAll('thead th')].map(txt),
      linhas: [...tbl.querySelectorAll('tbody tr')].map(linha),
      rodape: [...tbl.querySelectorAll('tfoot tr')].map(linha),
    }
  }
  function tabelaDeHtml (html) {
    const d = document.createElement('div'); d.innerHTML = html
    const t = d.querySelector('table')
    return t ? tabelaDe(t) : null
  }

  // ── Cores: qualquer cor CSS → 'RRGGBB' (transparência composta sobre branco) ──
  function hex (cor) {
    if (!cor) return '8C9A92'
    const el = document.createElement('i'); el.style.color = String(cor); document.body.appendChild(el)
    const c = getComputedStyle(el).color; el.remove()
    let r, g, b, a = 1, m
    if ((m = /rgba?\(([^)]+)\)/.exec(c))) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); [r, g, b] = p; if (p.length > 3) a = p[3] }
    else if ((m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(c))) { r = m[1] * 255; g = m[2] * 255; b = m[3] * 255; if (m[4]) a = +m[4] }
    else return '8C9A92'
    const mix = v => Math.round(v * a + 255 * (1 - a))
    return [mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
  }

  // Exporta sempre no tema claro (papel); a tela volta ao tema da pessoa no fim
  async function comTemaClaro (fn) {
    const html = document.documentElement, antes = html.dataset.tema
    if (antes !== 'claro') { html.dataset.tema = 'claro'; VGExp.temaChart() }
    try { return await fn() } finally {
      if (antes !== 'claro') { html.dataset.tema = antes; VGExp.temaChart() }
    }
  }

  // ── Gráficos do Chart.js ──────────────────────────────────────────────────
  const cfgDe = c => (c && c.config && (c.config._config || c.config)) || {}
  const FUNDO = { id: 'vgxFundo', afterDraw (ch) {
    const x = ch.ctx; x.save(); x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#FFFFFF'
    x.fillRect(0, 0, ch.width, ch.height); x.restore()
  } }

  function tabelaGraf (c) {
    const src = cfgDe(c)
    if (typeof src._tabela === 'function') { const t = tabelaDeHtml(src._tabela()); if (t) return t }
    const fmt = src._fmt || (v => v == null ? '—' : Number(v).toLocaleString('pt-BR'))
    const dss = c.data.datasets.filter(d => !d._semTabela)
    return {
      cab: [src._rotulo || 'Item', ...dss.map(d => d.label || 'Valor')],
      linhas: (c.data.labels || []).map((l, i) => [cel((src._nomes && src._nomes[i]) || l),
        ...dss.map(d => { const v = d.data[i], t = fmt(v, d), n = numDe(t)
          return v == null ? cel('—') : { t, v: Number(v), f: n ? n.f : '#,##0.##' } })]),
      rodape: [],
    }
  }

  // Redesenha o gráfico fora da tela (tema claro, 2x) e devolve a imagem PNG
  function imagemGraf (id, c) {
    const src = cfgDe(c), tipo = src.type
    const wrap = document.getElementById(id + '-wrap')
    const h0 = parseInt(wrap && wrap.style.height, 10) || 260, w0 = parseInt(wrap && wrap.style.width, 10) || 0
    const dss = src.data.datasets.filter(d => !d._semTabela)
    const rosca = tipo === 'doughnut', legenda = rosca || dss.length > 1
    const W = rosca ? 760 : Math.max(1000, w0), H = rosca ? 320 : Math.max(240, h0 + (legenda ? 40 : 0))
    const data = { labels: (src.data.labels || []).slice(),
      datasets: src.data.datasets.map(d => Object.assign({}, d, { data: Array.isArray(d.data) ? d.data.slice() : d.data })) }
    const plug = Object.assign({}, src.options.plugins, {
      tooltip: { enabled: false },
      legend: { display: legenda, position: rosca ? 'right' : 'bottom',
        labels: { boxWidth: 12, boxHeight: 12, padding: 14, font: { size: 12 },
          filter: (it, d) => { const ds = d.datasets[it.datasetIndex]; return !ds || !ds._semTabela } } },
    })
    const options = Object.assign({}, src.options, { responsive: false, maintainAspectRatio: false, animation: false,
      devicePixelRatio: 2, events: [], onClick: null, onHover: null, plugins: plug })
    const cfg = { type: tipo, data, options, plugins: [FUNDO] }
    VGExp.pinta(cfg)
    const box = document.createElement('div')
    box.style.cssText = 'position:fixed;left:-30000px;top:0;width:' + W + 'px;height:' + H + 'px'
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H
    cv.style.width = W + 'px'; cv.style.height = H + 'px'
    box.appendChild(cv); document.body.appendChild(box)
    let ch
    try {
      ch = new Chart(cv, cfg)
      return { src: ch.toBase64Image('image/png', 1), w: W, h: H }
    } finally { if (ch) ch.destroy(); box.remove() }
  }

  // Gráfico nativo do PowerPoint (editável). Bolhas não têm equivalente: null = vai como imagem.
  function pptxSpec (c) {
    const src = cfgDe(c), tipo = src.type
    if (tipo !== 'bar' && tipo !== 'line' && tipo !== 'doughnut') return null
    const labels = (c.data.labels || []).map(String)
    const dss = c.data.datasets.filter(d => !d._semTabela)
    const lista = v => [].concat(v)
    const nums = d => d.data.map(v => v == null ? null : Number(v))
    // cor pelo token do dataset (_bg/_bd), lida no tema claro — a cor pintada na tela pode ser a do tema escuro
    const tok = (d, k) => lista(d[k]).map(t => hex(String(t).indexOf('--') === 0 ? VGExp.cor(t, k === '_bg' ? d._bgA : null) : t))
    const corBg = d => d._bg ? tok(d, '_bg') : lista(d.backgroundColor).map(hex)
    const corBd = d => d._bd ? tok(d, '_bd') : lista(d.borderColor).map(hex)
    if (tipo === 'doughnut') {
      return { tipo, legenda: true, dados: [{ name: dss[0].label || 'Valor', labels, values: nums(dss[0]).map(v => v || 0) }], cores: corBg(dss[0]) }
    }
    if (tipo === 'line') return { tipo, legenda: dss.length > 1, dados: dss.map(d => ({ name: d.label, labels, values: nums(d) })), cores: dss.map(d => corBd(d)[0]) }
    const sc = src.options.scales || {}
    const horiz = src.options.indexAxis === 'y'
    const empilhado = !!((sc.x && sc.x.stacked) || (sc.y && sc.y.stacked))
    if (dss.length === 1 && Array.isArray(dss[0].backgroundColor)) {
      // uma cor por barra: uma série por categoria, empilhadas — cada barra fica na sua cor
      const d = dss[0], v = nums(d)
      return { tipo, horiz, empilhado: true, legenda: false, cores: corBg(d),
        dados: labels.map((l, i) => ({ name: l, labels, values: labels.map((_, j) => j === i ? (v[j] || 0) : 0) })) }
    }
    return { tipo, horiz, empilhado, legenda: dss.length > 1, cores: dss.map(d => corBg(d)[0]),
      dados: dss.map(d => ({ name: d.label, labels, values: nums(d).map(x => x || 0) })) }
  }

  // SVG desenhado à mão (ex.: distância entre comprometido e pago) → PNG com as cores já resolvidas
  function svgParaPng (svg, larg) {
    return new Promise(res => {
      const vb = (svg.getAttribute('viewBox') || '0 0 460 200').split(/\s+/).map(Number)
      const k = svg.cloneNode(true), orig = svg.querySelectorAll('*'), copia = k.querySelectorAll('*')
      const P = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'opacity', 'font-size', 'font-weight']
      orig.forEach((el, i) => {
        const cs = getComputedStyle(el)
        copia[i].setAttribute('style', P.map(p => p + ':' + cs.getPropertyValue(p)).join(';') + ';font-family:Arial,sans-serif')
      })
      k.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); k.setAttribute('width', vb[2]); k.setAttribute('height', vb[3])
      const W = larg || 1000, H = Math.round(W * vb[3] / vb[2])
      const img = new Image()
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2
        const x = cv.getContext('2d'); x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, cv.width, cv.height)
        x.drawImage(img, 0, 0, cv.width, cv.height)
        res({ src: cv.toDataURL('image/png'), w: W, h: H })
      }
      img.onerror = () => res(null)
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(k))
    })
  }

  // ── Leitura das guias (o que a tela desenhou) ─────────────────────────────
  function kpisDe (box) {
    return [...box.querySelectorAll('.vg-kpi')].map(k => {
      const l = txt(k.querySelector('.vg-kpi-l')), s = txt(k.querySelector('.vg-kpi-s'))
      return l ? { l, v: txt(k.querySelector('.vg-kpi-v')), s } : { l: s, v: txt(k.querySelector('.vg-kpi-v')), s: '' }
    })
  }
  function filtrosTexto (box) {
    const f = [...box.querySelectorAll('label')].map(l => {
      const i = l.querySelector('input,select'); if (!i || !i.value) return null
      const nome = (l.firstChild && l.firstChild.textContent || '').trim()
      const val = i.tagName === 'SELECT' ? txt(i.selectedOptions[0]) : new Date(i.value + 'T12:00:00').toLocaleDateString('pt-BR')
      return nome + ': ' + val
    }).filter(Boolean)
    return 'Filtros dos lançamentos: ' + (f.length ? f.join(' · ') : 'nenhum (todos os lançamentos)') +
      '. "Projeto em US$" e "Contratos em R$" não mudam com os filtros.'
  }
  function legendaItens (card) {
    return [...card.querySelectorAll('.vg-leg > span')].map(s => {
      const b = s.querySelector('b'), sw = s.querySelector('i')
      return { rot: s.textContent.replace(b ? b.textContent : '', '').trim(), valor: b ? txt(b) : '', cor: sw ? getComputedStyle(sw).backgroundColor : '' }
    })
  }

  function lerGuia (id) {
    const pane = document.getElementById('pane-' + id)
    const blocos = []
    if (!pane) return blocos
    const addKpis = (itens, titulo) => {
      if (!itens.length) return
      const u = blocos[blocos.length - 1]
      if (u && u.t === 'kpis' && !titulo && !u.titulo) u.itens.push(...itens)
      else blocos.push({ t: 'kpis', titulo: titulo || '', itens })
    }
    const notas = card => [...card.querySelectorAll(':scope > .vg-nota, :scope .vg-card-h ~ div > .vg-nota')].map(txt).filter(Boolean).join(' ')

    function cartao (card) {
      const titulo = txt(card.querySelector('.vg-tit'))
      // "clique para detalhes" só vale na tela
      let sub = txt(card.querySelector('.vg-card-h .vg-sub')).replace(/\s*·\s*clique[^·]*/gi, '')
      const pills = [...card.querySelectorAll('.vg-card-h .vg-pill')].map(txt)
      if (pills.length) sub += (sub ? ' · ' : '') + pills.join(' · ')
      if (card.classList.contains('vg-hero-n')) {
        addKpis([{ l: txt(card.querySelector('.vg-eyebrow')), v: txt(card.querySelector('.vg-big')), s: txt(card.querySelector('.vg-sub')) }]); return
      }
      const cv = card.querySelector('canvas')
      if (cv) {
        let s = sub
        if (cv.id === 'ch-acumulado-mensal') { const m = VGExp.acumModo(); s += ' · Período: ' + (m === 'todos' ? 'todos os meses' : m) }
        blocos.push({ t: 'graf', id: cv.id, titulo, sub: s, nota: txt(card.querySelector(':scope > .vg-nota')) }); return
      }
      if (card.querySelector('.vg-ind')) {   // Matriz de Resultados
        const k = card.querySelector('.vg-kpis'); if (k) addKpis(kpisDe(k), titulo)
        blocos.push({ t: 'tabela', titulo: titulo + ' — progresso por resultado', sub,
          cab: ['Resultado', 'Nome', 'Progresso médio', 'Indicadores', 'Situação'],
          linhas: [...card.querySelectorAll('.vg-ind')].map(b => [cel(txt(b.querySelector('.vg-res'))), cel(txt(b.querySelector('.vg-sub'))),
            celTexto(txt(b.querySelector('.vg-ring span')), true), cel(txt(b.querySelector('.vg-nota'))),
            cel(b.querySelector('.vg-pill') ? 'aguarda confirmação' : '')]), rodape: [] })
        return
      }
      const svg = card.querySelector('svg[role="img"]')
      if (svg) {
        const halt = /Percentual pago e comprometido/.test(svg.getAttribute('aria-label') || '')
        blocos.push({ t: 'svg', el: svg, titulo, sub,
          tabela: halt ? { cab: ['Resultado', 'Nome', '% pago', '% comprometido'],
            linhas: VGExp.halteres().map(r => [cel(r[0]), cel(r[1]), celPct(r[2]), celPct(r[3])]), rodape: [] } : null })
        return
      }
      if (card.querySelector('.vg-indrow') || card.querySelector(':scope > .vg-meter')) {   // card de um resultado
        const res = txt(card.querySelector('.vg-res'))
        blocos.push({ t: 'tabela', titulo: (res ? res + ' — ' : '') + titulo,
          sub: legendaItens(card).map(i => i.rot + ' ' + i.valor).join(' · '),
          cab: ['Progresso', 'Indicador', 'Meta'],
          linhas: [...card.querySelectorAll('.vg-indrow')].map(r => [celTexto(txt(r.querySelector('.vg-pill')), true),
            cel(r.querySelector('.nm') ? (r.querySelector('.nm').getAttribute('title') || txt(r.querySelector('.nm'))) : ''),
            cel(txt(r.querySelector('.mt')).replace(/^meta\s*/, ''))]),
          rodape: [], nota: [...card.querySelectorAll(':scope > .vg-nota')].map(txt).join(' ') })
        return
      }
      const comp = card.querySelector('.vg-comp')
      if (comp) {
        const partes = [...comp.querySelectorAll('button')].map(b => {
          const a = b.getAttribute('aria-label') || '', m = /^(.*?):\s*(.*?)\s*\(([^)]*)\)$/.exec(a)
          return { rot: m ? m[1] : a, valor: m ? m[2] : '', pct: m ? m[3] : '', cor: getComputedStyle(b).backgroundColor, w: parseFloat(b.style.width) || 0 }
        })
        legendaItens(card).forEach(l => { if (l.rot && !partes.some(p => p.rot === l.rot)) partes.push({ rot: l.rot, valor: l.valor, pct: '', cor: l.cor, w: 0 }) })
        blocos.push({ t: 'comp', titulo, sub, partes, nota: notas(card) }); return
      }
      const grades = [...card.querySelectorAll('div[style*="grid-template-columns"]')]
      if (grades.length) {   // Atividades por situação do saldo
        blocos.push({ t: 'tabela', titulo, sub, cab: ['Situação', 'Atividades'],
          linhas: grades.map(g => [cel(txt(g.querySelector('.vg-pill'))), celTexto(txt(g.querySelector('.mono')), true)]),
          rodape: [], nota: txt(card.querySelector('.vg-nota')) })
        return
      }
      const itens = [...card.querySelectorAll('.vg-item')]
      if (itens.length) {   // lista de alertas (todos, mesmo com filtro na tela)
        blocos.push({ t: 'tabela', titulo, sub: '', cab: ['Nível', 'Código', 'Alerta', 'Detalhe'],
          linhas: itens.map(it => { const cod = txt(it.querySelector('.vg-it-t .vg-cod'))
            return [cel(txt(it.querySelector('.vg-it-a .vg-pill'))), cel(cod), cel(txt(it.querySelector('.vg-it-t')).replace(cod, '').trim()), cel(txt(it.querySelector('.vg-it-s')))] }),
          rodape: [] })
        return
      }
      const tbl = [...card.querySelectorAll('table.vg-tbl')].find(t => !t.closest('.vg-dados'))
      if (tbl) { blocos.push(Object.assign({ t: 'tabela', titulo, sub }, tabelaDe(tbl))); return }
      const resto = txt(card.querySelector('.vg-vazio')) || txt(card.querySelector('.vg-nota'))
      if (titulo || resto) blocos.push({ t: 'nota', titulo, texto: resto })
    }

    ;(function visitar (el) {
      for (const ch of el.children) {
        if (ch.matches('.vg-acoes, .vg-seg, script, style')) continue
        if (ch.matches('.vg-filtros')) { blocos.push({ t: 'nota', texto: filtrosTexto(ch) }); continue }
        if (ch.matches('.vg-kpis')) { addKpis(kpisDe(ch)); continue }
        if (ch.matches('.vg-card')) { cartao(ch); continue }
        if (ch.matches('.empty-state')) { const t = txt(ch); if (t) blocos.push({ t: 'nota', texto: t }); continue }
        visitar(ch)
      }
    })(pane)
    return blocos
  }

  // Monta o conteúdo: guias marcadas, com imagem/tabela/gráfico nativo de cada gráfico (tema claro)
  async function montar (ids, comNativo) {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready } catch (e) {} }
    const nomes = Object.fromEntries(VGExp.abas().map(a => [a[0], a[1]]))
    return comTemaClaro(async () => {
      const charts = VGExp.charts()
      const guias = []
      for (const id of ids) {
        const blocos = lerGuia(id)
        for (const b of blocos) {
          if (b.t === 'graf') {
            const c = charts[b.id]
            if (!c) { b.t = 'nota'; b.texto = 'Gráfico sem dados.'; continue }
            b.img = imagemGraf(b.id, c); b.tabela = tabelaGraf(c)
            if (comNativo) b.pptx = pptxSpec(c)
          } else if (b.t === 'svg') {
            b.img = await svgParaPng(b.el, 1000)
          } else if (b.t === 'comp') {
            b.partes.forEach(p => { p.hex = hex(p.cor) })
          }
        }
        guias.push({ id, nome: nomes[id] || id, blocos })
      }
      await (window.FolhaA4 ? FolhaA4.pronto : Promise.resolve())
      const P = window.FolhaA4 && FolhaA4.projeto ? (FolhaA4.projeto() || {}) : {}
      return { guias, geradoEm: agora(), por: (appState.usuario && appState.usuario.nome_completo) || '', projeto: P,
        cor: hex(VGExp.cor('--pri-600')) }
    })
  }

  // ── HTML dos blocos (PDF e arquivo HTML) ──────────────────────────────────
  const VGX_CSS = `
.vgx-guia-t { font-size: 15px; font-weight: 700; color: #1F4E2C; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 2px solid #1F4E2C; }
.vgx-bloco { margin: 0 0 12px; }
.vgx-fig { break-inside: avoid; page-break-inside: avoid; }
.vgx-sub { font-size: 9.5px; color: #5B6B62; margin: -2px 0 6px; }
.vgx-img { display: block; margin: 0 auto 6px; }
.vgx-nota { font-size: 9.5px; color: #5B6B62; margin: 4px 0 8px; }
.vgx-kpis { display: grid; gap: 6px; margin: 0 0 12px; }
.vgx-kpi { border: 1px solid #D9E2DC; border-radius: 6px; padding: 6px 8px; background: #F6F9F7; }
.vgx-kpi-l { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #5B6B62; }
.vgx-kpi-v { font-size: 15px; font-weight: 700; color: #14251B; margin: 2px 0; }
.vgx-kpi-s { font-size: 9px; color: #5B6B62; }
.vgx-comp { display: flex; height: 14px; border-radius: 4px; overflow: hidden; background: #E3E8E5; margin: 4px 0 6px; }
.vgx-comp i { display: block; height: 100%; }
.vgx-sw { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
.vgx-intro { font-size: 11px; color: #14251B; margin: 0 0 10px; }
.vgx-intro li { margin: 2px 0; }
`
  const escT = s => esc(String(s ?? ''))
  function tabelaHtml (tb, classe) {
    if (!tb) return ''
    const td = c => typeof c.v === 'number' ? `<td class="mono" style="text-align:right">${escT(c.t)}</td>` : `<td>${escT(c.t)}</td>`
    return `<table class="${classe}"><thead><tr>${tb.cab.map(h => `<th>${escT(h)}</th>`).join('')}</tr></thead>
      <tbody>${tb.linhas.length ? tb.linhas.map(l => `<tr>${l.map(td).join('')}</tr>`).join('') : `<tr><td colspan="${tb.cab.length || 1}">Sem dados.</td></tr>`}</tbody>
      ${tb.rodape && tb.rodape.length ? `<tfoot>${tb.rodape.map(l => `<tr>${l.map(td).join('')}</tr>`).join('')}</tfoot>` : ''}</table>`
  }
  function kpisHtml (b) {
    const n = Math.min(b.itens.length, 5)
    return (b.titulo ? `<div class="rep-secao-titulo">${escT(b.titulo)}</div>` : '') +
      `<div class="vgx-kpis" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${b.itens.map(k =>
        `<div class="vgx-kpi"><div class="vgx-kpi-l">${escT(k.l)}</div><div class="vgx-kpi-v">${escT(k.v)}</div>${k.s ? `<div class="vgx-kpi-s">${escT(k.s)}</div>` : ''}</div>`).join('')}</div>`
  }
  function compTabela (b) {
    return { cab: ['Parte', 'Valor', '%'], linhas: b.partes.map(p => [cel(p.rot), celTexto(p.valor, true), celTexto(p.pct, true)]), rodape: [] }
  }
  // Tamanho fixo pela proporção (a imagem é 2x; sem isso a folha mede antes de carregar e o gráfico passa da página).
  // PDF: no máximo ~110 mm de altura na folha deitada (277 mm úteis). HTML: o tamanho de tela do gráfico.
  function imgHtml (im, alt, modo) {
    const est = modo === 'pdf'
      ? `width:${Math.min(100, (110 * im.w / im.h) / 277 * 100).toFixed(1)}%;height:auto`
      : `width:${im.w}px;max-width:100%;height:auto`
    return `<img class="vgx-img" src="${im.src}" width="${im.w}" height="${im.h}" style="${est}" alt="${escT(alt)}">`
  }
  // modo: 'pdf' (folha A4) | 'html' (dados dos gráficos recolhidos em <details>)
  function blocoHtml (b, modo) {
    const tcls = modo === 'pdf' ? 'rep-tbl' : 'vgx-tbl'
    const tit = b.titulo ? `<div class="rep-secao-titulo">${escT(b.titulo)}</div>` : ''
    const sub = b.sub ? `<div class="vgx-sub">${escT(b.sub)}</div>` : ''
    const nota = b.nota ? `<p class="vgx-nota">${escT(b.nota)}</p>` : ''
    const img = b.img ? imgHtml(b.img, b.titulo, modo) : ''
    const dados = tb => !tb ? '' : modo === 'html'
      ? `<details><summary>Ver os dados do gráfico</summary>${tabelaHtml(tb, tcls)}</details>` : tabelaHtml(tb, tcls)
    switch (b.t) {
      case 'kpis': return `<div class="vgx-bloco">${kpisHtml(b)}</div>`
      // título + legenda + imagem não se separam entre páginas (break-inside: avoid no .vgx-fig)
      case 'graf': case 'svg': return `<div class="vgx-bloco"><div class="vgx-fig">${tit}${sub}${img}</div>${nota}${dados(b.tabela)}</div>`
      case 'tabela': return `<div class="vgx-bloco">${tit}${sub}${tabelaHtml(b, tcls)}${b.nota ? `<p class="vgx-nota">${escT(b.nota)}</p>` : ''}</div>`
      case 'nota': return `<div class="vgx-bloco">${tit}<p class="vgx-nota">${escT(b.texto)}</p></div>`
    }
    return ''
  }
  // a tabela da composição leva a cor de cada parte
  function compHtml (b, tcls) {
    return `<table class="${tcls}"><thead><tr><th>Parte</th><th>Valor</th><th>%</th></tr></thead><tbody>${b.partes.map(p =>
      `<tr><td><span class="vgx-sw" style="background:#${p.hex}"></span>${escT(p.rot)}</td><td class="mono" style="text-align:right">${escT(p.valor)}</td><td class="mono" style="text-align:right">${escT(p.pct || '—')}</td></tr>`).join('')}</tbody></table>`
  }
  function blocoHtmlFinal (b, modo) {
    if (b.t !== 'comp') return blocoHtml(b, modo)
    const tcls = modo === 'pdf' ? 'rep-tbl' : 'vgx-tbl'
    return `<div class="vgx-bloco vgx-fig">${b.titulo ? `<div class="rep-secao-titulo">${escT(b.titulo)}</div>` : ''}${b.sub ? `<div class="vgx-sub">${escT(b.sub)}</div>` : ''}
      <div class="vgx-comp">${b.partes.filter(p => p.w > 0).map(p => `<i style="width:${p.w.toFixed(2)}%;background:#${p.hex}"></i>`).join('')}</div>
      ${compHtml(b, tcls)}${b.nota ? `<p class="vgx-nota">${escT(b.nota)}</p>` : ''}</div>`
  }
  const listaGuias = M => `<ul>${M.guias.map(g => `<li>${escT(g.nome)}</li>`).join('')}</ul>`

  // ── PDF: folha A4 padrão em outra aba ─────────────────────────────────────
  function gerarPdf (w, M) {
    const corpo = `<div class="vgx-intro"><b>Guias incluídas:</b>${listaGuias(M)}<p class="vgx-nota">Gráficos redesenhados no tema claro; abaixo de cada um, a tabela com os dados. Os valores são os da tela no momento da exportação.</p></div>` +
      M.guias.map((g, i) => `<div class="vgx-guia"${i ? ' style="break-before:page"' : ''}><h2 class="vgx-guia-t">${escT(g.nome)}</h2>${g.blocos.map(b => blocoHtmlFinal(b, 'pdf')).join('')}</div>`).join('')
    FolhaA4.escrever(w, { titulo: 'Visão Geral', selo: 'VISÃO GERAL', tema: 'atividades', corpo, paisagem: true, css: VGX_CSS, nomeArquivo: 'Visao_Geral' })
  }

  // ── HTML: arquivo único ───────────────────────────────────────────────────
  function gerarHtml (M) {
    const P = M.projeto || {}
    const ancora = id => 'guia-' + id
    const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Visão Geral — ${escT(P.projeto_codigo || 'DIMA')} — ${escT(M.geradoEm)}</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#14251B;background:#F3F5F3}
header{background:#1F4E2C;color:#fff;padding:20px 16px}
header h1{margin:0;font-size:22px}
header p{margin:4px 0 0;opacity:.85;font-size:13px}
nav{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #D9E2DC;padding:8px 16px;display:flex;gap:6px;flex-wrap:wrap}
nav a{color:#1F4E2C;text-decoration:none;font-weight:600;font-size:13px;padding:5px 10px;border-radius:999px;border:1px solid #D9E2DC}
nav a:hover,nav a:focus-visible{background:#E8F1EC;outline:none}
main{max-width:1180px;margin:0 auto;padding:16px}
section{background:#fff;border:1px solid #D9E2DC;border-radius:12px;padding:16px;margin:0 0 16px;scroll-margin-top:60px}
.rep-secao-titulo{font-size:13px;font-weight:700;color:#1F4E2C;text-transform:uppercase;letter-spacing:.03em;margin:14px 0 4px}
.vgx-tbl{width:100%;border-collapse:collapse;font-size:12.5px;margin:6px 0}
.vgx-tbl th{text-align:left;background:#F0F4F1;color:#3C4C43;font-size:11.5px;padding:6px 8px;border-bottom:1px solid #D9E2DC}
.vgx-tbl td{padding:5px 8px;border-bottom:1px solid #EEF2EF;vertical-align:top}
.vgx-tbl tfoot td{font-weight:700;background:#F6F9F7}
.mono{font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;white-space:nowrap}
.vgx-wrap{overflow-x:auto}
details{margin:4px 0 8px}summary{cursor:pointer;color:#1F4E2C;font-weight:600;font-size:13px}
footer{text-align:center;color:#5B6B62;font-size:12px;padding:8px 16px 24px}
@media (max-width:700px){.vgx-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media print{nav{display:none}body{background:#fff}section{break-inside:auto;border:0;padding:0}}
${VGX_CSS}
.vgx-kpi-v{font-size:20px}.vgx-kpi-l{font-size:10.5px}.vgx-kpi-s,.vgx-sub,.vgx-nota{font-size:12px}
.vgx-guia-t{font-size:18px}
</style></head><body>
<header><h1>Visão Geral</h1><p>${[P.projeto_codigo ? 'Projeto ' + escT(P.projeto_codigo) : '', escT(P.projeto_nome || ''), escT(P.projeto_localizacao || '')].filter(Boolean).join(' · ')}</p>
<p>Gerado em ${escT(M.geradoEm)}${M.por ? ' por ' + escT(M.por) : ''} · Plataforma DIMA · SEMA/AC</p></header>
<nav aria-label="Guias">${M.guias.map(g => `<a href="#${ancora(g.id)}">${escT(g.nome)}</a>`).join('')}</nav>
<main>${M.guias.map(g => `<section id="${ancora(g.id)}"><h2 class="vgx-guia-t">${escT(g.nome)}</h2>${g.blocos.map(b => blocoHtmlFinal(b, 'html')).join('').replace(/<table class="vgx-tbl"/g, '<div class="vgx-wrap"><table class="vgx-tbl"').replace(/<\/table>/g, '</table></div>')}</section>`).join('')}</main>
<footer>Valores da tela no momento da exportação. Gráficos no tema claro; os dados de cada um ficam em "Ver os dados do gráfico".</footer>
</body></html>`
    baixar(new Blob([doc], { type: 'text/html;charset=utf-8' }), 'Visao_Geral_' + hoje() + '.html')
  }

  function baixar (blob, nome) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nome })
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  // ── Excel ─────────────────────────────────────────────────────────────────
  async function gerarXlsx (M) {
    await puxLib('../js/vendor/exceljs-4.4.0.bare.min.js', 'ExcelJS')
    const wb = new ExcelJS.Workbook(); wb.creator = 'DIMA · Visão Geral'; wb.created = new Date()
    const VERDE = 'FF' + M.cor, P = M.projeto || {}
    const usados = new Set()
    const nomeAba = n => { let b = n.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim(), k = b, i = 2; while (usados.has(k)) k = b.slice(0, 28) + ' ' + i++; usados.add(k); return k }

    const res = wb.addWorksheet(nomeAba('Resumo'))
    res.columns = [{ width: 26 }, { width: 90 }]
    res.getCell('A1').value = 'Visão Geral — exportação'; res.getCell('A1').font = { bold: true, size: 16, color: { argb: VERDE } }
    ;[['Projeto', [P.projeto_codigo, P.projeto_nome].filter(Boolean).join(' — ')], ['Localização', P.projeto_localizacao || ''],
      ['Gerado em', M.geradoEm], ['Gerado por', M.por], ['Guias', M.guias.map(g => g.nome).join(', ')],
      ['Observação', 'Valores da tela no momento da exportação. Cada gráfico aparece como imagem, com os dados logo abaixo (em número, prontos para somar).']]
      .forEach((l, i) => { const r = res.getRow(i + 3); r.values = l; r.getCell(1).font = { bold: true }; r.getCell(2).alignment = { wrapText: true, vertical: 'top' } })

    M.guias.forEach(g => {
      const ws = wb.addWorksheet(nomeAba(g.nome))
      ws.columns = [{ width: 38 }, ...Array.from({ length: 11 }, () => ({ width: 18 }))]
      let r = 1
      const linha = (vals, estilo) => { const row = ws.getRow(r++); row.values = vals; if (estilo) estilo(row); return row }
      const titulo = (t, tam) => linha([t], row => { row.getCell(1).font = { bold: true, size: tam || 12, color: { argb: VERDE } } })
      const fraco = t => t && linha([t], row => { row.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF5B6B62' } } })
      const tabela = tb => {
        if (!tb) return
        linha(tb.cab, row => row.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } } }))
        const pinta = (l, neg) => { const row = ws.getRow(r++)
          l.forEach((c, i) => { const x = row.getCell(i + 1); x.value = c.v === '' ? null : c.v; if (typeof c.v === 'number' && c.f) x.numFmt = c.f; if (neg) x.font = { bold: true } }) }
        tb.linhas.forEach(l => pinta(l)); (tb.rodape || []).forEach(l => pinta(l, true))
      }
      titulo(g.nome, 16); r++
      g.blocos.forEach(b => {
        if (b.t === 'kpis') {
          if (b.titulo) titulo(b.titulo)
          tabela({ cab: ['Indicador', 'Valor', 'Detalhe'], linhas: b.itens.map(k => [cel(k.l), celTexto(k.v), cel(k.s)]) })
        } else if (b.t === 'graf' || b.t === 'svg') {
          titulo(b.titulo); fraco(b.sub)
          if (b.img) {
            const larg = Math.min(900, b.img.w), alt = Math.round(b.img.h * larg / b.img.w)
            const id = wb.addImage({ base64: b.img.src.split(',')[1], extension: 'png' })
            ws.addImage(id, { tl: { col: 0, row: r - 1 }, ext: { width: larg, height: alt } })
            r += Math.ceil(alt / 20) + 1
          }
          fraco(b.nota); tabela(b.tabela)
        } else if (b.t === 'comp') {
          titulo(b.titulo); fraco(b.sub); tabela(compTabela(b)); fraco(b.nota)
        } else if (b.t === 'tabela') {
          titulo(b.titulo); fraco(b.sub); tabela(b); fraco(b.nota)
        } else if (b.t === 'nota') {
          if (b.titulo) titulo(b.titulo); fraco(b.texto)
        }
        r++
      })
    })
    const buf = await wb.xlsx.writeBuffer()
    baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Visao_Geral_' + hoje() + '.xlsx')
  }

  // ── PowerPoint ────────────────────────────────────────────────────────────
  async function gerarPptx (M) {
    await puxLib('../js/vendor/pptxgenjs-3.12.0.bundle.js', 'PptxGenJS')
    const pres = new PptxGenJS(); pres.layout = 'LAYOUT_WIDE'   // 13,33 × 7,5 pol
    const P = M.projeto || {}, F = 'Calibri', VERDE = M.cor, CINZA = '5B6B62', TEXTO = '14251B'
    pres.title = 'Visão Geral'; pres.company = 'SEMA/AC'
    const rodape = ['Visão Geral', P.projeto_codigo ? 'Projeto ' + P.projeto_codigo : '', 'SEMA/AC', M.geradoEm].filter(Boolean).join(' · ')
    pres.defineSlideMaster({ title: 'VG', background: { color: 'FFFFFF' }, objects: [
      { rect: { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: VERDE } } },
      { text: { text: rodape, options: { x: 0.5, y: 7.05, w: 10.5, h: 0.3, fontFace: F, fontSize: 9, color: CINZA } } },
    ], slideNumber: { x: 12.4, y: 7.05, fontFace: F, fontSize: 9, color: CINZA } })
    const novo = () => pres.addSlide({ masterName: 'VG' })
    const cab = (s, t, sub) => {
      s.addText(t, { x: 0.5, y: 0.3, w: 12.3, h: 0.6, fontFace: F, fontSize: 24, bold: true, color: VERDE, fit: 'shrink' })
      if (sub) s.addText(sub, { x: 0.5, y: 0.88, w: 12.3, h: 0.45, fontFace: F, fontSize: 12, color: CINZA, fit: 'shrink' })
    }
    const notasDe = tb => !tb ? '' : [tb.cab.join(' | '), ...tb.linhas.map(l => l.map(c => c.t).join(' | '))].join('\n')
    const tabelaPptx = (s, tb, y, h) => {
      const lin = [tb.cab.map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: VERDE } } })),
        ...tb.linhas.map(l => l.map(c => ({ text: c.t, options: typeof c.v === 'number' ? { align: 'right' } : {} }))),
        ...(tb.rodape || []).map(l => l.map(c => ({ text: c.t, options: { bold: true, align: typeof c.v === 'number' ? 'right' : 'left' } })))]
      s.addTable(lin, { x: 0.5, y, w: 12.3, fontFace: F, fontSize: tb.cab.length > 6 ? 9 : 11, color: TEXTO, border: { type: 'solid', pt: 0.5, color: 'D9E2DC' }, autoPage: false, valign: 'middle', h })
    }
    const imagem = (s, img, y, hMax) => {
      const wMax = 12.3, k = Math.min(wMax / img.w, hMax / img.h), w = img.w * k, h = img.h * k
      s.addImage({ data: img.src, x: 0.5 + (wMax - w) / 2, y, w, h })
    }

    // capa
    const capa = novo()
    capa.addText('Visão Geral', { x: 0.7, y: 2.2, w: 12, h: 1, fontFace: F, fontSize: 40, bold: true, color: VERDE })
    capa.addText([P.projeto_codigo ? 'Projeto ' + P.projeto_codigo : '', P.projeto_nome || ''].filter(Boolean).join(' — '), { x: 0.7, y: 3.2, w: 12, h: 0.6, fontFace: F, fontSize: 18, color: TEXTO })
    capa.addText('Gerado em ' + M.geradoEm + (M.por ? ' por ' + M.por : ''), { x: 0.7, y: 3.8, w: 12, h: 0.4, fontFace: F, fontSize: 13, color: CINZA })
    capa.addText(M.guias.map(g => ({ text: g.nome, options: { bullet: true } })), { x: 0.7, y: 4.5, w: 12, h: 2.2, fontFace: F, fontSize: 14, color: TEXTO, valign: 'top' })

    M.guias.forEach(g => {
      // abertura da guia: números do topo + observações
      const sec = novo(); cab(sec, g.nome)
      const kpis = g.blocos.filter(b => b.t === 'kpis').flatMap(b => b.itens)
      const porLinha = 5, kw = (12.3 - 0.2 * (porLinha - 1)) / porLinha
      kpis.slice(0, 15).forEach((k, i) => {
        const x = 0.5 + (i % porLinha) * (kw + 0.2), y = 1.5 + Math.floor(i / porLinha) * 1.55
        sec.addShape(pres.ShapeType.roundRect, { x, y, w: kw, h: 1.4, fill: { color: 'F6F9F7' }, line: { color: 'D9E2DC', width: 0.75 }, rectRadius: 0.08 })
        sec.addText([{ text: (k.l || '').toUpperCase(), options: { fontSize: 9, bold: true, color: CINZA, breakLine: true } },
          { text: k.v || '', options: { fontSize: 22, bold: true, color: TEXTO, breakLine: true } },
          { text: k.s || '', options: { fontSize: 9.5, color: CINZA } }],
        { x: x + 0.08, y: y + 0.05, w: kw - 0.16, h: 1.3, fontFace: F, valign: 'top', fit: 'shrink' })
      })
      const obs = g.blocos.filter(b => b.t === 'nota' && b.texto).map(b => (b.titulo ? b.titulo + ': ' : '') + b.texto)
      if (obs.length) sec.addText(obs.join('\n'), { x: 0.5, y: 6.15, w: 12.3, h: 0.8, fontFace: F, fontSize: 11, color: CINZA, valign: 'top', fit: 'shrink' })

      g.blocos.forEach(b => {
        if (b.t === 'graf' || b.t === 'svg') {
          const s = novo(); cab(s, b.titulo, b.sub)
          const sp = b.pptx
          if (sp) {
            const o = { x: 0.5, y: 1.45, w: 12.3, h: b.nota ? 5.0 : 5.45, fontFace: F, chartColors: sp.cores,
              catAxisLabelFontFace: F, valAxisLabelFontFace: F, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, catAxisLabelColor: TEXTO, valAxisLabelColor: CINZA,
              valAxisLabelFormatCode: '#,##0', valGridLine: { color: 'E3E8E5', size: 0.5 }, catGridLine: { style: 'none' },
              showLegend: sp.legenda, legendPos: sp.tipo === 'doughnut' ? 'r' : 'b', legendFontFace: F, legendFontSize: 10 }
            if (sp.tipo === 'bar') Object.assign(o, { barDir: sp.horiz ? 'bar' : 'col', barGrouping: sp.empilhado ? 'stacked' : 'clustered', barGapWidthPct: 60, catAxisOrientation: sp.horiz ? 'maxMin' : 'minMax' })
            if (sp.tipo === 'doughnut') Object.assign(o, { holeSize: 60, showPercent: true, dataLabelColor: 'FFFFFF', dataLabelFontSize: 10 })
            if (sp.tipo === 'line') Object.assign(o, { lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 5 })
            s.addChart(sp.tipo === 'bar' ? pres.ChartType.bar : sp.tipo === 'line' ? pres.ChartType.line : pres.ChartType.doughnut, sp.dados, o)
          } else if (b.img) imagem(s, b.img, 1.45, b.nota ? 5.0 : 5.45)
          if (b.nota) s.addText(b.nota, { x: 0.5, y: 6.5, w: 12.3, h: 0.45, fontFace: F, fontSize: 10.5, color: CINZA, fit: 'shrink' })
          const n = notasDe(b.tabela); if (n) s.addNotes('Dados do gráfico:\n' + n)
        } else if (b.t === 'comp') {
          const s = novo(); cab(s, b.titulo, b.sub)
          const partes = b.partes.filter(p => p.w > 0)
          if (partes.length) {
            s.addChart(pres.ChartType.bar, partes.map(p => ({ name: p.rot, labels: [' '], values: [numDe(p.valor) ? numDe(p.valor).v : p.w] })),
              { x: 0.5, y: 1.5, w: 12.3, h: 1.6, barDir: 'bar', barGrouping: 'percentStacked', chartColors: partes.map(p => p.hex), showLegend: true, legendPos: 'b',
                legendFontFace: F, legendFontSize: 10, valAxisHidden: true, catAxisHidden: true, valGridLine: { style: 'none' }, barGapWidthPct: 20 })
          }
          tabelaPptx(s, compTabela(b), 3.4)
          if (b.nota) s.addText(b.nota, { x: 0.5, y: 6.4, w: 12.3, h: 0.5, fontFace: F, fontSize: 10.5, color: CINZA, fit: 'shrink' })
        } else if (b.t === 'tabela') {
          const POR = b.cab.length > 6 ? 7 : 11, total = Math.max(1, Math.ceil(b.linhas.length / POR))
          for (let i = 0; i < total; i++) {
            const s = novo(); cab(s, b.titulo + (total > 1 ? ` (${i + 1} de ${total})` : ''), i === 0 ? b.sub : '')
            tabelaPptx(s, { cab: b.cab, linhas: b.linhas.slice(i * POR, (i + 1) * POR), rodape: i === total - 1 ? b.rodape : [] }, 1.45)
            if (b.nota && i === total - 1) s.addText(b.nota, { x: 0.5, y: 6.5, w: 12.3, h: 0.45, fontFace: F, fontSize: 10.5, color: CINZA, fit: 'shrink' })
          }
        }
      })
    })
    await pres.writeFile({ fileName: 'Visao_Geral_' + hoje() + '.pptx' })
  }

  // ── Janela de exportação ──────────────────────────────────────────────────
  let JAN = null, voltar = null, ocupado = false
  function janela () {
    if (JAN) return JAN
    JAN = document.createElement('div')
    JAN.className = 'vg-ov vg-exp-ov'; JAN.id = 'vg-exp'; JAN.hidden = true
    JAN.setAttribute('role', 'dialog'); JAN.setAttribute('aria-modal', 'true'); JAN.setAttribute('aria-labelledby', 'vg-exp-t')
    document.body.appendChild(JAN)
    JAN.addEventListener('click', e => { if (e.target === JAN && !ocupado) fechar() })
    JAN.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !ocupado) { e.preventDefault(); fechar() }
      else if (e.key === 'Tab') {
        const f = [...JAN.querySelectorAll('button:not([disabled]),input:not([disabled])')].filter(x => x.offsetParent !== null)
        if (!f.length) return
        const a = f[0], z = f[f.length - 1]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
      }
    })
    return JAN
  }
  function abrir () {
    if (!window.VGExp || !VGExp.pronto()) { if (typeof toast === 'function') toast('Aguarde a Visão Geral terminar de carregar.', 'warning'); return }
    const j = janela(), ic = VGExp.ic
    const abas = VGExp.abas()
    j.innerHTML = `<div class="vg-exp">
      <div class="vg-exp-h"><h2 id="vg-exp-t">${ic('upload')}Exportar a Visão Geral</h2>
        <button type="button" class="vg-exp-x" data-fechar aria-label="Fechar">${ic('x')}</button></div>
      <fieldset class="vg-exp-f"><legend>Formato</legend><div class="vg-exp-fmts">
        ${FORMATOS.map((f, i) => `<label class="vg-exp-fmt"><input type="radio" name="vg-exp-fmt" value="${f[0]}"${i ? '' : ' checked'}>
          <span><b>${f[1]}</b><small>${f[2]}</small></span></label>`).join('')}
      </div></fieldset>
      <fieldset class="vg-exp-f"><legend>Guias</legend>
        <div class="vg-exp-gs">${abas.map(a => `<label class="vg-exp-g"><input type="checkbox" value="${a[0]}" checked>${ic(a[2])}${esc(a[1])}</label>`).join('')}</div>
        <div class="vg-exp-ac"><button type="button" class="vg-link" data-todas="1">Marcar todas</button><button type="button" class="vg-link" data-todas="0">Desmarcar todas</button></div>
      </fieldset>
      <p class="vg-nota">Sai o que está na tela agora — a Execução financeira com os filtros escolhidos. Os gráficos vão no tema claro, cada um com a tabela de dados. Minhas tarefas e Cobertura de indicadores não entram.</p>
      <div class="vg-exp-st" role="status" aria-live="polite"></div>
      <div class="vg-exp-rod"><button type="button" class="vg-btn" data-fechar>Cancelar</button>
        <button type="button" class="vg-btn pri" data-ir>${ic('upload')}Exportar</button></div>
    </div>`
    j.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fechar))
    j.querySelectorAll('[data-todas]').forEach(b => b.addEventListener('click', () => j.querySelectorAll('.vg-exp-g input').forEach(i => { i.checked = b.dataset.todas === '1' })))
    j.querySelector('[data-ir]').addEventListener('click', exportar)
    voltar = document.activeElement
    j.hidden = false; document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => { const r = j.querySelector('input[name="vg-exp-fmt"]:checked'); if (r) r.focus() })
  }
  function fechar () {
    if (!JAN || JAN.hidden) return
    JAN.hidden = true; document.body.style.overflow = ''
    if (voltar && document.contains(voltar)) voltar.focus()
  }
  function status (t, erro) {
    const s = JAN.querySelector('.vg-exp-st'); s.textContent = t || ''; s.classList.toggle('erro', !!erro)
  }

  async function exportar () {
    if (ocupado) return
    const fmt = (JAN.querySelector('input[name="vg-exp-fmt"]:checked') || {}).value || 'pdf'
    const ids = [...JAN.querySelectorAll('.vg-exp-g input:checked')].map(i => i.value)
    if (!ids.length) { status('Marque pelo menos uma guia.', true); return }
    // PDF abre a aba antes de qualquer espera (senão o navegador bloqueia o pop-up)
    const w = fmt === 'pdf' ? FolhaA4.janela() : null
    if (fmt === 'pdf' && !w) { status('O navegador bloqueou a nova aba. Permita pop-ups deste site e tente de novo.', true); return }
    ocupado = true
    const btn = JAN.querySelector('[data-ir]'); btn.disabled = true
    try {
      status('Preparando os gráficos…')
      const M = await montar(ids, fmt === 'pptx')
      status(fmt === 'pdf' ? 'Montando a folha A4…' : 'Gerando o arquivo…')
      if (fmt === 'pdf') gerarPdf(w, M)
      else if (fmt === 'xlsx') await gerarXlsx(M)
      else if (fmt === 'pptx') await gerarPptx(M)
      else gerarHtml(M)
      status('Pronto.' + (fmt === 'pdf' ? ' A folha abriu em outra aba.' : ' O arquivo foi baixado.'))
      if (typeof toast === 'function') toast('Visão Geral exportada.', 'success')
    } catch (e) {
      console.error('exportar visão geral', e)
      if (w) try { w.close() } catch (x) {}
      status('Não foi possível exportar: ' + (e && e.message ? e.message : e), true)
    } finally { ocupado = false; btn.disabled = false }
  }

  window.VGExportar = { abrir, fechar }
})()
