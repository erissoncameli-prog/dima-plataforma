// Logos institucionais — fonte única: configuracoes_sistema (Dados do sistema › Logos).
// Não depende do config.js: index.html e publico.html usam o próprio cliente Supabase.
//
// Cada logo: { url, url_escuro, alt, tamanho, ordem }
//   url        = versão para FUNDO CLARO (papel, faixa branca, tema claro)
//   url_escuro = versão para FUNDO ESCURO (menu verde, entrada, cabeçalho de e-mail) — opcional
// Sem a versão do fundo pedido, a logo vai sobre uma placa (clara no fundo escuro, verde no
// fundo claro). Nunca pintar logo por filtro CSS: apaga as cores das logos coloridas.
// Grupos: topo (telas e topo do A4), projeto (marca-d'água, cabeçalho do e-mail), parceiros.
;(function (g) {
  const CHAVE = 'dima_logos_v1'
  const PLACA = { claro: '#FFFFFF', escuro: '#1F4E2C' }
  const ALTURA = { pequeno: 0.75, medio: 1, grande: 1.35 }

  // Reserva = cópias do repositório, só para quando a leitura falhar (sem rede, sem tabela).
  let RESERVA = {
    topo: [
      { url: '/assets/3-vertical-verde-conjunto-1024x805.png', url_escuro: '/assets/brasao-acre.png', alt: 'Governo do Acre', tamanho: 'medio', ordem: 0 },
      { url: '/assets/1695134345-1-horizontal-verde-solo.png', url_escuro: '/assets/sema-branco.png', alt: 'SEMA/AC', tamanho: 'medio', ordem: 1 },
    ],
    projeto: { url: '', url_escuro: '/assets/logo-resiliencia.png', alt: 'Projeto DIMA', tamanho: 'medio', ordem: 0 },
    parceiros: [
      { url: '/assets/UNESCO_logo_hor_blue_transparent.png.png', url_escuro: '', alt: 'UNESCO', tamanho: 'medio', ordem: 0 },
      { url: '/assets/UNCT_Logo_RGB_Brazil_Portuguese_horiz_color.png', url_escuro: '', alt: 'ONU Brasil', tamanho: 'medio', ordem: 1 },
      { url: '/assets/logo-fundo-brasil-onu.png', url_escuro: '', alt: 'Fundo Brasil-ONU', tamanho: 'medio', ordem: 2 },
      { url: '/assets/logo-consorcio-amazonia.png', url_escuro: '', alt: 'Consórcio Amazônia Legal', tamanho: 'grande', ordem: 3 },
    ],
  }

  const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  // Raiz do site: o que vem antes de /pages/ (ou a pasta da página, para index.html e o service worker)
  function raiz() {
    const p = location.pathname, i = p.indexOf('/pages/')
    return location.origin + (i >= 0 ? p.slice(0, i + 1) : p.replace(/[^/]*$/, ''))
  }

  // Caminho do repositório ("assets/x.png", "../assets/x.png", "/assets/x.png") → endereço absoluto
  function url(u) {
    if (!u) return ''
    if (/^(https?:|data:|blob:)/i.test(u)) return u
    return new URL(String(u).replace(/^(\.\.\/)+/, '').replace(/^\.?\/+/, ''), raiz()).href
  }

  function normal(l) {
    if (!l || typeof l !== 'object') return null
    const n = { url: l.url || '', url_escuro: l.url_escuro || '', alt: l.alt || '', tamanho: l.tamanho || 'medio', ordem: l.ordem ?? 0 }
    return n.url || n.url_escuro ? n : null
  }
  const ord = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)
  function normalizar(row) {
    return {
      topo: (row.logos_topo || []).map(normal).filter(Boolean).sort(ord),
      projeto: normal(row.logo_projeto),
      parceiros: (row.logos_parceiros || []).map(normal).filter(Boolean).sort(ord),
    }
  }

  function guardado() {
    try { const j = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (j && Array.isArray(j.topo)) return j } catch (e) {}
    return null
  }

  let promessa = null
  // Lê do banco (anon também lê configuracoes_sistema). Guarda no aparelho para a próxima abertura
  // e para o app do Diagnóstico sem rede.
  function carregar(cliente, forcar) {
    if (promessa && !forcar) return promessa
    // `db` do config.js é const global (não fica em window)
    const c = cliente || (typeof db !== 'undefined' ? db : null)
    promessa = (async () => {
      try {
        if (!c) throw new Error('sem cliente')
        const { data, error } = await c.from('configuracoes_sistema')
          .select('logos_topo,logo_projeto,logos_parceiros').eq('projeto_id', 'default').maybeSingle()
        if (error || !data) throw error || new Error('sem configuração')
        const n = normalizar(data)
        try { localStorage.setItem(CHAVE, JSON.stringify(n)) } catch (e) {}
        return n
      } catch (e) {
        return guardado() || RESERVA
      }
    })()
    return promessa
  }

  // Versão síncrona para a primeira pintura: o que ficou guardado, senão a reserva.
  const agora = () => guardado() || RESERVA

  // Escolhe a imagem para o fundo: { src, placa } — placa = cor da placa quando falta a versão.
  function escolher(l, fundo) {
    if (fundo === 'escuro') return l.url_escuro ? { src: l.url_escuro, placa: '' } : { src: l.url, placa: PLACA.claro }
    return l.url ? { src: l.url, placa: '' } : { src: l.url_escuro, placa: PLACA.escuro }
  }

  // <img> pronta para o fundo. o: { altura (px), classe, estilo, semPlaca, tamanho:false }
  function img(l, fundo, o) {
    o = o || {}
    if (!l) return ''
    const e = escolher(l, fundo)
    if (!e.src) return ''
    const h = Math.round((o.altura || 28) * (o.tamanho === false ? 1 : (ALTURA[l.tamanho] || 1)))
    const tag = `<img src="${escH(url(e.src))}" alt="${escH(l.alt)}" class="dima-logo ${escH(o.classe || '')}" style="height:${h}px;width:auto;max-width:100%;object-fit:contain;display:block;${o.estilo || ''}"${o.cors ? ' crossorigin="anonymous"' : ''}>`
    if (!e.placa || o.semPlaca) return tag
    const p = Math.max(3, Math.round(h * 0.16))
    return `<span class="dima-placa" style="display:inline-flex;align-items:center;background:${e.placa};border-radius:${Math.max(4, Math.round(h * 0.18))}px;padding:${p}px ${p * 2}px;line-height:0">${tag}</span>`
  }
  const lista = (ls, fundo, o) => (ls || []).map(l => img(l, fundo, o)).filter(Boolean)

  // Contraste: fração dos pixels visíveis da logo que se destacam do fundo (razão ≥ 2:1).
  // Devolve null se a imagem não pôde ser lida (CORS); a tela só avisa, não bloqueia.
  function lum(r, gg, b) {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b)
  }
  function contraste(src, fundoHex) {
    return new Promise(res => {
      if (!src) return res(null)
      const im = new Image()
      im.crossOrigin = 'anonymous'
      im.onload = () => {
        try {
          const W = 96, H = Math.max(1, Math.round(96 * im.naturalHeight / Math.max(1, im.naturalWidth)))
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H
          const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, W, H)
          const d = cx.getImageData(0, 0, W, H).data
          const hx = fundoHex.replace('#', '')
          const lb = lum(parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16))
          let vis = 0, ok = 0
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue
            vis++
            const lp = lum(d[i], d[i + 1], d[i + 2])
            const r = (Math.max(lp, lb) + 0.05) / (Math.min(lp, lb) + 0.05)
            if (r >= 2) ok++
          }
          res(vis ? ok / vis : null)
        } catch (e) { res(null) }
      }
      im.onerror = () => res(null)
      im.src = url(src)
    })
  }

  // Página que precisa de outra reserva (o app do Diagnóstico, sem rede no 1º uso: pwa/logos/)
  function usarReserva(r) { if (r) RESERVA = normalizar({ logos_topo: r.topo, logo_projeto: r.projeto, logos_parceiros: r.parceiros }) }

  // Preenche os elementos marcados: <div data-dima-logos="topo|projeto|parceiros" data-fundo="claro|escuro"
  //   data-altura="28" data-sep="html opcional" data-classe="..."> — esconde o elemento se não houver logo.
  function pintar(L, raiz) {
    (raiz || document).querySelectorAll('[data-dima-logos]').forEach(el => {
      const grupo = el.dataset.dimaLogos
      const ls = grupo === 'projeto' ? [L.projeto] : (L[grupo] || [])
      const o = { altura: Number(el.dataset.altura) || 28, classe: el.dataset.classe || '', tamanho: el.dataset.tamanho === 'nao' ? false : undefined }
      const it = lista(ls.filter(Boolean), el.dataset.fundo === 'claro' ? 'claro' : 'escuro', o)
      el.innerHTML = it.join(el.dataset.sep || '')
      el.hidden = !it.length
    })
  }

  g.DimaLogos = { carregar, agora, img, lista, url, escolher, contraste, normalizar, pintar, usarReserva, get RESERVA() { return RESERVA }, PLACA }
})(window)
