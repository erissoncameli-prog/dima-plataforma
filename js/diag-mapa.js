// ── DIMA · Diagnóstico Socioambiental — mapa leve (app de campo e mesa) ──
//
// Mapa sem biblioteca externa, para abrir sem internet no app de campo:
// desenha em SVG os setores, os pontos das casas e a posição atual, numa
// projeção Web Mercator. Com sinal, põe por baixo o satélite (Esri World
// Imagery); sem sinal, ou se a imagem falhar, fica só o desenho.
//
// Arrastar move; pinça, roda do mouse, duplo toque e os botões + e − mudam o
// zoom. Toque num ponto chama opcoes.aoTocar(ponto).
//
// Uso:
//   const m = DiagMapa.criar(el, { satelite: true, aoTocar: p => … })
//   m.dados({ poligonos: [{ geojson, classe, rotulo }],
//             pontos: [{ lat, lon, classe, r, rotulo, … }],
//             eu: { lat, lon, precisao } | null })
//   m.ajustar(bbox [oeste, sul, leste, norte])  ·  m.centrar(lat, lon, zMin)
//   m.satelite(bool)  ·  m.destruir()
//   opcoes.estatico = prévia sem gestos (a página rola por cima; toque → aoTocar(null))
;(function (raiz) {
  const T = 256, ZMIN = 3, ZMAX = 19, ZTILE = 18
  const URL_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'
  const NS = 'http://www.w3.org/2000/svg'

  function mundo(lat, lon, z) {
    const n = T * Math.pow(2, z)
    const s = Math.sin(Math.max(-85, Math.min(85, lat)) * Math.PI / 180)
    return [(lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]
  }
  function geo(x, y, z) {
    const n = T * Math.pow(2, z)
    const lon = x / n * 360 - 180
    const m = Math.PI - 2 * Math.PI * y / n
    return [180 / Math.PI * Math.atan(0.5 * (Math.exp(m) - Math.exp(-m))), lon]
  }
  // metros por pixel na latitude
  function mpp(lat, z) { return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z) }

  function aneis(g) {
    if (!g) return []
    if (g.type === 'Polygon') return g.coordinates
    if (g.type === 'MultiPolygon') return [].concat(...g.coordinates)
    if (g.type === 'Feature') return aneis(g.geometry)
    return []
  }

  function criar(el, opcoes) {
    opcoes = opcoes || {}
    el.classList.add('dmapa')
    el.innerHTML = '<div class="dmapa-tiles" aria-hidden="true"></div>' +
      '<svg class="dmapa-svg" xmlns="' + NS + '" role="img" aria-label="' + (opcoes.rotulo || 'Mapa') + '"></svg>' +
      '<div class="dmapa-ctl"><button type="button" data-z="1" aria-label="Aproximar">+</button>' +
      '<button type="button" data-z="-1" aria-label="Afastar">−</button></div>' +
      '<div class="dmapa-cred" hidden>Imagem: Esri, Maxar, Earthstar Geographics</div>'
    const tilesEl = el.querySelector('.dmapa-tiles'), svg = el.querySelector('.dmapa-svg'), cred = el.querySelector('.dmapa-cred')
    const st = { z: 14, cx: 0, cy: 0, w: 0, h: 0, d: { poligonos: [], pontos: [], eu: null },
                 sat: opcoes.satelite !== false, tiles: new Map(), quadro: 0, vivo: true }

    function medir() { const r = el.getBoundingClientRect(); st.w = Math.max(1, r.width); st.h = Math.max(1, r.height) }
    function tela(lat, lon) { const p = mundo(lat, lon, st.z); return [p[0] - st.cx + st.w / 2, p[1] - st.cy + st.h / 2] }

    function desenharTiles() {
      const on = st.sat && navigator.onLine !== false
      if (!on) { cred.hidden = true; tilesEl.innerHTML = ''; st.tiles.clear(); return }
      const zt = Math.min(st.z, ZTILE), esc = Math.pow(2, st.z - zt), lado = T * esc
      const x0 = st.cx - st.w / 2, y0 = st.cy - st.h / 2
      const n = Math.pow(2, zt)
      const i0 = Math.floor(x0 / lado), i1 = Math.floor((x0 + st.w) / lado)
      const j0 = Math.max(0, Math.floor(y0 / lado)), j1 = Math.min(n - 1, Math.floor((y0 + st.h) / lado))
      const vistos = new Set()
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const xi = ((i % n) + n) % n, k = zt + '/' + j + '/' + xi
        vistos.add(k)
        let img = st.tiles.get(k)
        if (!img) {
          img = document.createElement('img')
          img.alt = ''; img.decoding = 'async'; img.draggable = false
          img.onerror = () => { img.style.visibility = 'hidden' }
          img.onload = () => { cred.hidden = false }     // crédito só com imagem de verdade
          img.src = URL_SAT + k
          st.tiles.set(k, img); tilesEl.appendChild(img)
        }
        img.style.width = img.style.height = lado + 'px'
        img.style.transform = 'translate(' + Math.round(i * lado - x0) + 'px,' + Math.round(j * lado - y0) + 'px)'
      }
      for (const [k, img] of st.tiles) if (!vistos.has(k)) { img.remove(); st.tiles.delete(k) }
    }

    function el_(nome, at) { const e = document.createElementNS(NS, nome); for (const k in at) e.setAttribute(k, at[k]); return e }

    function desenharSvg() {
      svg.setAttribute('viewBox', '0 0 ' + st.w + ' ' + st.h)
      svg.setAttribute('width', st.w); svg.setAttribute('height', st.h)
      while (svg.firstChild) svg.removeChild(svg.firstChild)
      for (const pg of st.d.poligonos) {
        let dd = ''
        for (const a of aneis(pg.geojson)) {
          a.forEach((c, i) => { const p = tela(c[1], c[0]); dd += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) })
          dd += 'Z'
        }
        const path = el_('path', { d: dd, class: 'dmapa-pol ' + (pg.classe || ''), 'fill-rule': 'evenodd' })
        if (pg.cor) path.style.setProperty('--dmapa-pol-cor', pg.cor)
        if (pg.rotulo) { const t = el_('title', {}); t.textContent = pg.rotulo; path.appendChild(t) }
        svg.appendChild(path)
      }
      for (const pg of st.d.poligonos) {
        if (!pg.rotulo || !pg.centro) continue
        const p = tela(pg.centro[0], pg.centro[1])
        // rótulo junto à borda de cima do setor: não cobre os pontos do meio
        const t = el_('text', { x: p[0], y: Math.max(14, p[1] + 16), class: 'dmapa-rot', 'text-anchor': 'middle' })
        t.textContent = pg.rotuloCurto || pg.rotulo
        svg.appendChild(t)
      }
      for (const pt of st.d.pontos) {
        const p = tela(pt.lat, pt.lon)
        if (p[0] < -20 || p[1] < -20 || p[0] > st.w + 20 || p[1] > st.h + 20) continue
        const c = el_('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: pt.r || 7, class: 'dmapa-pt ' + (pt.classe || '') })
        if (pt.cor) c.style.setProperty('--dmapa-cor', pt.cor)
        if (pt.rotulo) { const t = el_('title', {}); t.textContent = pt.rotulo; c.appendChild(t) }
        svg.appendChild(c)
      }
      const eu = st.d.eu
      if (eu) {
        const p = tela(eu.lat, eu.lon)
        const r = Math.min(Math.max(st.w, st.h), (eu.precisao || 0) / mpp(eu.lat, st.z))
        if (r > 8) svg.appendChild(el_('circle', { cx: p[0], cy: p[1], r, class: 'dmapa-eu-prec' }))
        const g = el_('circle', { cx: p[0], cy: p[1], r: 8, class: 'dmapa-eu' })
        const t = el_('title', {}); t.textContent = 'Você está aqui'; g.appendChild(t)
        svg.appendChild(g)
      }
    }

    function desenhar() {
      if (!st.vivo) return
      cancelAnimationFrame(st.quadro)
      st.quadro = requestAnimationFrame(() => { medir(); desenharTiles(); desenharSvg() })
    }

    function zoomEm(nz, px, py) {
      nz = Math.max(ZMIN, Math.min(ZMAX, Math.round(nz)))
      if (nz === st.z) return
      if (px == null) { px = st.w / 2; py = st.h / 2 }
      const f = Math.pow(2, nz - st.z)
      const wx = st.cx - st.w / 2 + px, wy = st.cy - st.h / 2 + py
      st.cx = wx * f - px + st.w / 2; st.cy = wy * f - py + st.h / 2; st.z = nz
      desenhar()
    }

    function ajustar(bbox, margem) {
      if (!bbox || bbox.length < 4) return
      medir()
      const mg = margem == null ? 24 : margem
      let z = ZMAX
      for (; z > ZMIN; z--) {
        const a = mundo(bbox[3], bbox[0], z), b = mundo(bbox[1], bbox[2], z)
        if (b[0] - a[0] <= st.w - 2 * mg && b[1] - a[1] <= st.h - 2 * mg) break
      }
      const a = mundo(bbox[3], bbox[0], z), b = mundo(bbox[1], bbox[2], z)
      st.z = Math.min(z, 18); const f = Math.pow(2, st.z - z)
      st.cx = (a[0] + b[0]) / 2 * f; st.cy = (a[1] + b[1]) / 2 * f
      desenhar()
    }
    function centrar(lat, lon, zMin) {
      if (zMin && st.z < zMin) st.z = zMin
      const p = mundo(lat, lon, st.z); st.cx = p[0]; st.cy = p[1]; desenhar()
    }
    // está à vista (com folga) na tela atual?
    function aVista(lat, lon, folga) {
      const p = tela(lat, lon), f = folga == null ? 0.2 : folga
      return p[0] > st.w * f && p[0] < st.w * (1 - f) && p[1] > st.h * f && p[1] < st.h * (1 - f)
    }

    // ── gestos ── (estático = prévia: não arrasta nem dá zoom, a página rola por cima; toque chama aoTocar(null))
    if (opcoes.estatico) {
      el.classList.add('dmapa-estatico')
      el.addEventListener('click', () => { if (opcoes.aoTocar) opcoes.aoTocar(null) })
    }
    const ptrs = new Map()
    let arr = null, pinca = null, ultToque = 0, moveu = false
    el.addEventListener('pointerdown', ev => {
      if (opcoes.estatico || ev.target.closest('.dmapa-ctl')) return
      el.setPointerCapture && el.setPointerCapture(ev.pointerId)
      ptrs.set(ev.pointerId, [ev.clientX, ev.clientY])
      moveu = false
      if (ptrs.size === 1) arr = { x: ev.clientX, y: ev.clientY, cx: st.cx, cy: st.cy }
      if (ptrs.size === 2) { const v = [...ptrs.values()]; pinca = { d: Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]), z: st.z }; arr = null }
    })
    el.addEventListener('pointermove', ev => {
      if (!ptrs.has(ev.pointerId)) return
      ptrs.set(ev.pointerId, [ev.clientX, ev.clientY])
      if (pinca && ptrs.size === 2) {
        const v = [...ptrs.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1])
        const alvo = pinca.z + Math.round(Math.log2(d / pinca.d))
        if (alvo !== st.z) {
          const r = el.getBoundingClientRect()
          zoomEm(alvo, (v[0][0] + v[1][0]) / 2 - r.left, (v[0][1] + v[1][1]) / 2 - r.top)
        }
        moveu = true
      } else if (arr) {
        const dx = ev.clientX - arr.x, dy = ev.clientY - arr.y
        if (Math.abs(dx) + Math.abs(dy) > 4) moveu = true
        st.cx = arr.cx - dx; st.cy = arr.cy - dy
        if (moveu && opcoes.aoArrastar) opcoes.aoArrastar()
        desenhar()
      }
    })
    function soltar(ev) {
      if (!ptrs.has(ev.pointerId)) return
      ptrs.delete(ev.pointerId)
      if (ptrs.size < 2) pinca = null
      if (ptrs.size === 1) { const v = [...ptrs.values()][0]; arr = { x: v[0], y: v[1], cx: st.cx, cy: st.cy } }
      if (ptrs.size === 0) {
        arr = null
        if (!moveu && ev.type === 'pointerup') {
          const r = el.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top
          const agora = Date.now()
          if (agora - ultToque < 300) { ultToque = 0; zoomEm(st.z + 1, px, py); return }
          ultToque = agora
          tocar(px, py)
        }
      }
    }
    el.addEventListener('pointerup', soltar)
    el.addEventListener('pointercancel', soltar)
    el.addEventListener('wheel', ev => {
      if (opcoes.estatico) return
      ev.preventDefault()
      const r = el.getBoundingClientRect()
      zoomEm(st.z + (ev.deltaY < 0 ? 1 : -1), ev.clientX - r.left, ev.clientY - r.top)
    }, { passive: false })
    el.querySelector('.dmapa-ctl').addEventListener('click', ev => {
      const b = ev.target.closest('[data-z]'); if (b) zoomEm(st.z + Number(b.dataset.z))
    })
    function tocar(px, py) {
      if (!opcoes.aoTocar) return
      let melhor = null, dm = 22
      for (const pt of st.d.pontos) {
        const p = tela(pt.lat, pt.lon), d = Math.hypot(p[0] - px, p[1] - py)
        if (d < dm) { dm = d; melhor = pt }
      }
      opcoes.aoTocar(melhor)
    }

    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => desenhar()) : null
    if (ro) ro.observe(el)
    const naRede = () => desenhar()
    window.addEventListener('online', naRede); window.addEventListener('offline', naRede)

    return {
      dados(d) { st.d = Object.assign({ poligonos: [], pontos: [], eu: null }, d); desenhar() },
      eu(p) { st.d.eu = p; desenhar() },
      ajustar, centrar, aVista,
      satelite(on) { st.sat = !!on; desenhar() },
      get zoom() { return st.z },
      destruir() {
        st.vivo = false; if (ro) ro.disconnect()
        window.removeEventListener('online', naRede); window.removeEventListener('offline', naRede)
        el.innerHTML = ''; el.classList.remove('dmapa')
      },
    }
  }

  // distância em metros (haversine)
  function distancia(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2
    return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)))
  }
  // ponto do rótulo: meio da borda de cima da caixa do maior anel
  function centro(g) {
    let maior = null, area = -1
    for (const a of aneis(g)) {
      let s = 0; for (let i = 1; i < a.length; i++) s += a[i - 1][0] * a[i][1] - a[i][0] * a[i - 1][1]
      if (Math.abs(s) > area) { area = Math.abs(s); maior = a }
    }
    if (!maior) return null
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    maior.forEach(c => { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]) })
    return [y1, (x0 + x1) / 2]
  }
  function bboxDe(lista) {
    let b = null
    lista.forEach(x => { if (!x || x.length < 4) return
      b = b ? [Math.min(b[0], +x[0]), Math.min(b[1], +x[1]), Math.max(b[2], +x[2]), Math.max(b[3], +x[3])] : x.map(Number) })
    return b
  }

  // cor de cada setor (Paul Tol "muted", legível em daltonismo; diferente da paleta dos pontos)
  const CORES_SETOR = ['#332288', '#CC6677', '#117733', '#DDCC77', '#88CCEE', '#AA4499', '#44AA99', '#999933', '#882255']
  function corSetor(i) { return CORES_SETOR[((i % CORES_SETOR.length) + CORES_SETOR.length) % CORES_SETOR.length] }

  raiz.DiagMapa = { criar, distancia, centro, bboxDe, mpp, corSetor }
})(window)
