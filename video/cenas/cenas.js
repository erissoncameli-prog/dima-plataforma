// Motion design do vídeo publicitário — GSAP numa linha do tempo pausada.
// Cada quadro é desenhado por window.__render(t): tl.seek(t) + efeitos procedurais (partículas, legenda).
// Os tempos vêm de build/linha.json (gerado da locução), então voz, legenda e imagem andam juntas.
;(async function () {
  const L = await (await fetch('../build/linha.json')).json()
  // formato: horizontal 1920×1080 (padrão) ou vertical 1080×1920 (?formato=vertical, Reels/TikTok/Shorts)
  const V = new URLSearchParams(location.search).get('formato') === 'vertical'
  const W = V ? 1080 : 1920, H = V ? 1920 : 1080
  if (V) document.documentElement.classList.add('v')
  const G = (hz, vt) => (V ? vt : hz)
  // tela padrão de cada cena: à direita no horizontal; no vertical, no meio, entre o título e a legenda
  const STD = G({ x: 1250, y: 470, w: 1060 }, { x: 540, y: 1022, w: 960, h: 740 })
  const C = Object.fromEntries(L.cenas.map(c => [c.id, c]))
  const tl = gsap.timeline({ paused: true })
  const palco = document.getElementById('palco'), cenasEl = document.getElementById('cenas')
  const T = n => '../build/telas/' + n + '.png'
  const iniciados = new WeakSet()
  // fromTo sem render imediato; o 1º tween de cada alvo define o estado inicial (antes dele, o alvo fica como no "de")
  const ft = (alvo, de, para, em) => {
    for (const a of (alvo.length !== undefined && !alvo.nodeType ? [...alvo] : [alvo])) if (a && !iniciados.has(a)) { iniciados.add(a); gsap.set(a, de) }
    return tl.fromTo(alvo, de, { ...para, immediateRender: false }, em)
  }

  // tempo da palavra falada (para sincronizar chips e zooms com a voz)
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  function wt(id, palavra, n = 0) {
    const c = C[id], alvo = norm(palavra)
    const hits = c.palavras.filter(p => norm(p.w).startsWith(alvo))
    return hits[n] ? hits[n].ini : c.voz + 0.6
  }

  const IC = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    moeda: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2-1.4 0-2.6-.6-3.2-1.6M12 6v2m0 8v2"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lista: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    chave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-3 3 2 2m-5 1 2 2"/>',
    digital: '<path d="M12 11v4M8.5 8.5A5 5 0 0 1 17 12v1.5M7 12c0 3.5 1 5.5 2.5 7.5M12 3a9 9 0 0 1 9 9v1M3 12a9 9 0 0 1 3-6.7M15.5 20a14 14 0 0 0 1.4-4"/>',
    hist: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    semRede: '<path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.1-1.6M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 10.7 5M12 20h.01"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    escudo: '<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    olho: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    caixa: '<path d="m21 8-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4"/>',
  }
  const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`
  const el = (html, pai) => { const d = document.createElement('div'); d.innerHTML = html.trim(); const e = d.firstElementChild; (pai || cenasEl).appendChild(e); return e }

  // ── componentes ─────────────────────────────────────────────────────────────
  const BARRA = 34
  function tela(pai, { img, x, y, w, h, url = 'plataforma de gestão de projetos', ry = -14, rx = 4, hl = [], pulsos = [] }) {
    h = Math.round(h || w * 0.625)
    const iw = Math.max(w, h / 0.625), ih = iw * 0.625          // a captura (16:10) cobre a janela, como object-fit: cover
    if (V) { ry *= .45; rx = 6 }
    const d = el(`<div class="dev" style="left:${x - w / 2}px;top:${y - (h + BARRA) / 2}px;width:${w}px;height:${h + BARRA}px">
      <div class="dev-bar"><i></i><i></i><i></i><span>${url}</span></div>
      <div class="dev-tela" style="width:${w}px;height:${h}px"><div class="zoom" style="width:${iw}px;height:${ih}px"><img src="${T(img)}">
        ${hl.map((r, i) => `<div class="hl" data-i="${i}" style="left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%"></div>`).join('')}
        ${pulsos.map(p => `<div class="pulso" style="left:${p[0] * 100}%;top:${p[1] * 100}%"></div>`).join('')}
      </div><div class="brilho"></div></div></div>`, pai)
    gsap.set(d, { rotationY: ry, rotationX: rx, transformPerspective: 2400 })
    return { d, w, h, iw, ih, zoom: d.querySelector('.zoom'), hls: [...d.querySelectorAll('.hl')], pulsos: [...d.querySelectorAll('.pulso')] }
  }
  // câmera dentro da tela: centra o ponto (fx, fy) com escala s
  function camera(t, chaves) {
    const pos = ({ s, x, y }) => ({ scale: s, x: gsap.utils.clamp(t.w - t.iw * s, 0, t.w / 2 - x * t.iw * s), y: gsap.utils.clamp(t.h - t.ih * s, 0, t.h / 2 - y * t.ih * s) })
    gsap.set(t.zoom, pos(chaves[0]))
    for (let i = 1; i < chaves.length; i++) {
      const k = chaves[i]
      tl.to(t.zoom, { ...pos(k), duration: k.d || 1.1, ease: k.ease || 'power3.inOut' }, k.t)
    }
  }
  function realce(t, i, de, ate) {
    const h = t.hls[i]; if (!h) return
    ft(h, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: .35, ease: 'power2.out' }, de)
    tl.to(h, { opacity: 0, duration: .3 }, ate)
  }
  function esquerda(pai, { n, kicker, titulo, chips = [] }) {
    const e = el(`<div class="esq"><div class="kicker"><b>${String(n).padStart(2, '0')}</b><i></i>${kicker}</div><div class="titulo">${titulo}</div>
      <div class="chips">${chips.map(c => `<div class="chip"><span class="ic">${ic(c.ic || 'check')}</span>${c.tx}</div>`).join('')}</div></div>`, pai)
    return { e, k: e.querySelector('.kicker'), t: e.querySelector('.titulo'), chips: [...e.querySelectorAll('.chip')], box: e.querySelector('.chips') }
  }
  function entradaEsq(E, a, tempos) {
    ft(E.k, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: .6, ease: 'power3.out' }, a + .1)
    ft(E.t, { opacity: 0, y: 34, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: .8, ease: 'power3.out' }, a + .22)
    E.chips.forEach((c, i) => ft(c, { opacity: 0, x: -30, scale: .9 }, { opacity: 1, x: 0, scale: 1, duration: .5, ease: 'back.out(2)' }, tempos[i]))
  }
  function entradaTela(t, a, f, ry = -14, ryFim = -7) {
    if (V) { ry *= .45; ryFim *= .45 }
    ft(t.d, { rotationY: ry - 16, z: -420, opacity: 0, filter: 'blur(14px)' }, { rotationY: ry, z: 0, opacity: 1, filter: 'blur(0px)', duration: 1.15, ease: 'expo.out' }, a - .1)
    tl.to(t.d, { rotationY: ryFim, duration: f - a - 1, ease: 'sine.inOut' }, a + 1.05)
  }
  function cena(id) { return el(`<div class="cena" id="c-${id}"></div>`) }

  // transições: a cena que sai cresce e desfoca; a que entra chega em 3D (feito pelos componentes)
  function janela(e, id, entrada = 'padrao') {
    const c = C[id]
    tl.set(e, { opacity: 1 }, c.ini - .3)
    if (entrada === 'padrao') ft(e, { opacity: 0 }, { opacity: 1, duration: .35, ease: 'power1.out' }, c.ini - .3)
    const prox = L.cenas[L.cenas.indexOf(c) + 1]
    if (prox) {
      ft(e, { scale: 1, filter: 'blur(0px)' }, { scale: 1.12, filter: 'blur(16px)', duration: .5, ease: 'power2.in' }, prox.ini - .35)
      tl.to(e, { opacity: 0, duration: .3, ease: 'power1.in' }, prox.ini - .15)
      tl.set(e, { opacity: 0 }, prox.ini + .2)
    }
  }
  const varredura = document.getElementById('varredura'), flash = document.getElementById('flash')
  L.cenas.slice(2).forEach(c => ft(varredura, { left: -500, opacity: 1 }, { left: W + 300, opacity: 1, duration: .55, ease: 'power2.inOut' }, c.ini - .38))
  iniciados.add(flash)
  function clarao(t, forte = .85) { ft(flash, { opacity: forte }, { opacity: 0, duration: .9, ease: 'power2.out' }, t) }

  // ── 1. GANCHO ───────────────────────────────────────────────────────────────
  {
    const c = C.gancho, e = cena('gancho')
    const g = el(`<div class="gancho">
      <div class="frase">Cada <em>real</em> investido.</div><div class="frase">Cada <em>entrega.</em></div><div class="frase">Cada <em>resultado.</em></div></div>`, e)
    tl.set(e, { opacity: 1 }, 0)
    const fr = [...g.querySelectorAll('.frase')], ts = [wt('gancho', 'cada', 0), wt('gancho', 'cada', 1), wt('gancho', 'cada', 2)]
    fr.forEach((f, i) => ft(f, { opacity: 0, scale: 1.35, filter: 'blur(18px)', y: 30 }, { opacity: 1, scale: 1, filter: 'blur(0px)', y: 0, duration: .55, ease: 'expo.out' }, ts[i] - .08))
    tl.to(fr[0], { opacity: .4, duration: .4 }, ts[1]); tl.to(fr[1], { opacity: .4, duration: .4 }, ts[2])
    tl.to(fr, { opacity: 1, duration: .3 }, c.fim_voz + .1)
    tl.to(g, { scale: 1.25, opacity: 0, filter: 'blur(20px)', duration: .45, ease: 'power2.in' }, C.marca.ini - .3)
  }

  // ── 2. MARCA ────────────────────────────────────────────────────────────────
  {
    const c = C.marca, e = cena('marca')
    const imgs = ['dashboard-financiadores', 'tdrs', 'mapa', 'matriz', 'contratos', 'remanejamentos-pedido', 'patrimonio', 'auditoria', 'relatorios-m1', 'atividades', 'dashboard-tarefas', 'financeiro']
    if (V) imgs.push(...imgs.slice(0, 6))
    const parede = el(`<div class="parede">${imgs.map(i => `<img src="${T(i)}">`).join('')}</div>`, e)
    el('<div class="parede-veu"></div>', e)
    const mc = el(`<div class="marca-centro"><img src="../../assets/logo-resiliencia.png" alt="">
      <div class="marca-nome">${'Plataforma Inteligente de Gestão de Projetos'.split(' ').map(w => `<span>${w}</span>`).join(' ')}</div>
      <div class="marca-sub">SEMA/AC · Fundo Brasil-ONU · <b>UNESCO</b> · Projeto 218BRA2001</div></div>`, e)
    tl.set(e, { opacity: 1 }, c.ini - .05)
    clarao(c.ini, 1)
    ft(parede, { opacity: 0, y: 300, scale: 1.15 }, { opacity: .95, y: 0, scale: 1, duration: 2, ease: 'expo.out' }, c.ini)
    tl.to(parede, { y: -260, x: 120, duration: c.fim - c.ini, ease: 'none' }, c.ini + .5)
    ft(mc.querySelector('img'), { opacity: 0, scale: .6, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .9, ease: 'back.out(1.6)' }, c.ini + .15)
    const ws = [...mc.querySelectorAll('.marca-nome span')]
    ws.forEach((w, i) => ft(w, { opacity: 0, y: 40, rotationX: -70 }, { opacity: 1, y: 0, rotationX: 0, duration: .55, ease: 'expo.out' }, Math.max(c.ini + .5, wt('marca', 'plataforma') - .15) + i * .09))
    ft(mc.querySelector('.marca-sub'), { opacity: 0, letterSpacing: '.3em' }, { opacity: 1, letterSpacing: '.08em', duration: 1, ease: 'power3.out' }, wt('marca', 'tudo') - .2)
    janela(e, 'marca', 'nenhuma')
  }

  // ── 3. VISÃO GERAL ──────────────────────────────────────────────────────────
  {
    const id = 'visao', c = C[id], e = cena(id); janela(e, id)
    const E = esquerda(e, { n: 1, kicker: 'Visão Geral', titulo: 'O orçamento<br><em>em tempo real</em>', chips: [{ tx: 'Pago', ic: 'moeda' }, { tx: 'Comprometido', ic: 'lista' }, { tx: 'Livre para usar', ic: 'check' }] })
    const t = tela(e, { img: 'dashboard-financiadores', ...STD, url: 'Visão Geral · Financiadores',
      hl: [{ x: .168, y: .125, w: .27, h: .148 }, { x: .446, y: .125, w: .535, h: .148 }, { x: .168, y: .424, w: .27, h: .405 }] })
    entradaTela(t, c.ini, c.fim); entradaEsq(E, c.ini, [wt(id, 'pago'), wt(id, 'comprometido'), wt(id, 'livre')])
    camera(t, [{ s: 1, x: .5, y: .5 }, { t: c.voz + .7, s: 1.8, x: .31, y: .21 }, { t: wt(id, 'pago') - .2, s: 1.7, x: .7, y: .21 }, { t: wt(id, 'livre') - .1, s: 1.45, x: .45, y: .6, d: 1.3 }])
    realce(t, 0, c.voz + 1.4, wt(id, 'pago') - .2); realce(t, 1, wt(id, 'pago') + .5, wt(id, 'livre') - .2); realce(t, 2, wt(id, 'livre') + .9, c.fim - .5)
  }

  // ── 4. MINHAS TAREFAS ───────────────────────────────────────────────────────
  {
    const id = 'tarefas', c = C[id], e = cena(id); janela(e, id)
    const E = esquerda(e, { n: 2, kicker: 'Minhas tarefas', titulo: 'O dia começa<br><em>organizado</em>', chips: [{ tx: 'Avaliações pendentes', ic: 'doc' }, { tx: 'Prazos', ic: 'relogio' }, { tx: 'Editais publicados', ic: 'lista' }] })
    const t = tela(e, { img: 'dashboard-tarefas', ...STD, url: 'Visão Geral · Minhas tarefas', ry: -10,
      hl: [{ x: .17, y: .605, w: .4, h: .36 }, { x: .58, y: .605, w: .4, h: .16 }, { x: .17, y: .257, w: .81, h: .317 }] })
    entradaTela(t, c.ini, c.fim, -10, -5); entradaEsq(E, c.ini, [wt(id, 'avaliacoes'), wt(id, 'prazos'), wt(id, 'editais')])
    camera(t, [{ s: 1.25, x: .55, y: .2 }, { t: wt(id, 'avaliacoes') - .3, s: 1.75, x: .37, y: .78 }, { t: wt(id, 'prazos') - .2, s: 1.75, x: .78, y: .7 }, { t: wt(id, 'editais') - .2, s: 1.45, x: .58, y: .42 }])
    realce(t, 0, wt(id, 'avaliacoes') + .5, wt(id, 'prazos') - .2); realce(t, 1, wt(id, 'prazos') + .5, wt(id, 'editais') - .2); realce(t, 2, wt(id, 'editais') + .7, c.fim - .5)
  }

  // ── 5. TDRs ─────────────────────────────────────────────────────────────────
  {
    const id = 'tdrs', c = C[id], e = cena(id); janela(e, id)
    const E = esquerda(e, { n: 3, kicker: 'TDRs e licitação', titulo: 'Do termo de referência<br><em>à contratação</em>' })
    const FS = ['Elaboração', 'Revisão', 'UNESCO', 'Licitação', 'Contratado']
    E.box.innerHTML = `<div class="fases">${FS.map((f, i) => `<div class="fase">${f}</div>${i < FS.length - 1 ? '<span class="seta">›</span>' : ''}</div>`).join('')}`
    E.box.style.flexDirection = 'row'
    const fases = [...E.box.querySelectorAll('.fase')]
    const t = tela(e, { img: 'tdrs', ...STD, url: 'TDRs · Termos de Referência' })
    entradaTela(t, c.ini, c.fim); entradaEsq(E, c.ini, [])
    ft(E.box, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .5 }, c.voz + .3)
    const t0 = wt(id, 'cada'), t1 = wt(id, 'rodadas')
    fases.forEach((f, i) => { ft(f, { opacity: .35, background: 'rgba(16,34,24,.62)' }, { opacity: 1, background: 'rgba(198,243,107,.22)', duration: .3 }, t0 + i * (t1 - t0) / 5) })
    camera(t, [{ s: 1, x: .5, y: .5 }, { t: c.voz + .4, s: 1.55, x: .55, y: .13 }, { t: wt(id, 'fase') - .2, s: 1.7, x: .6, y: .48 }, { t: wt(id, 'licitacao') - .2, s: 1.55, x: .6, y: .8, d: 1.4 }])
    realce(t, 0, wt(id, 'fase') + .6, wt(id, 'licitacao') - .3)
  }

  // ── 6. CONTRATOS + FINANCEIRO ──────────────────────────────────────────────
  {
    const id = 'contratos', c = C[id], e = cena(id); janela(e, id)
    const E = esquerda(e, { n: 4, kicker: 'Contratos e Financeiro', titulo: 'Tudo conectado,<br><em>com rastro</em>', chips: [{ tx: 'Contratos', ic: 'doc' }, { tx: 'Produtos entregues', ic: 'caixa' }, { tx: 'Pagamentos com senha', ic: 'cadeado' }] })
    const t = tela(e, { img: 'contratos', ...G({ x: 1190, y: 420, w: 980 }, { x: 520, y: 880, w: 900, h: 520 }), url: 'Contratos', ry: -12 })
    const t2 = tela(e, { img: 'financeiro', ...G({ x: 1480, y: 650, w: 680 }, { x: 610, y: 1170, w: 700, h: 400 }), url: 'Execução Financeira', ry: -16 })
    entradaTela(t, c.ini, c.fim, -12, -6); entradaEsq(E, c.ini, [wt(id, 'contratos'), wt(id, 'produtos'), wt(id, 'pagamentos')])
    ft(t2.d, { opacity: 0, x: 260, z: -300, rotationY: -36 }, { opacity: 1, x: 0, z: G(120, 60), rotationY: G(-16, -7), duration: 1, ease: 'expo.out' }, wt(id, 'pagamentos') - .1)
    camera(t, [{ s: 1, x: .5, y: .5 }, { t: c.voz + .3, s: 1.5, x: .55, y: .4, d: 1.6 }])
    camera(t2, [{ s: 1.3, x: .55, y: .2 }, { t: wt(id, 'rastro') - .3, s: 1.6, x: .6, y: .45, d: 1.4 }])
  }

  // ── 7. REMANEJAMENTO ───────────────────────────────────────────────────────
  {
    const id = 'remanej', c = C[id], e = cena(id); janela(e, id)
    const E = esquerda(e, { n: 5, kicker: 'Remanejamento', titulo: 'Assinaturas<br><em>em cadeia</em>', chips: [{ tx: 'Senha confirmada no servidor', ic: 'chave' }, { tx: 'Histórico que não se apaga', ic: 'hist' }] })
    const hash = el(`<div class="hash"><span>SHA-256 · </span><span class="hx"></span></div>`, E.e)
    const t = tela(e, { img: 'remanejamentos-pedido', ...STD, url: 'Remanejamento · REM-2026-007',
      hl: [{ x: .497, y: .295, w: .235, h: .265 }, { x: .205, y: .757, w: .59, h: .04 }] })
    entradaTela(t, c.ini, c.fim); entradaEsq(E, c.ini, [wt(id, 'senha'), wt(id, 'documento')])
    camera(t, [{ s: 1.15, x: .5, y: .45 }, { t: wt(id, 'cadeia') - .3, s: 1.9, x: .62, y: .42 }, { t: wt(id, 'impressao') - .4, s: 1.6, x: .5, y: .74, d: 1.2 }])
    realce(t, 0, wt(id, 'cadeia') + .55, wt(id, 'impressao') - .4); realce(t, 1, wt(id, 'impressao') + .7, c.fim - .4)
    const hx = hash.querySelector('.hx'), H = '9c1e4b7a02d6f35e8a41c7b9d0e2f6a13b58c94e7d21a0f6c3b8e5d47a92f1c0'
    ft(hash, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .4 }, wt(id, 'impressao') - .2)
    const st = { n: 0 }; tl.to(st, { n: 44, duration: 1.6, ease: 'none', onUpdate: () => { hx.textContent = H.slice(0, Math.round(st.n)) } }, wt(id, 'impressao'))
    window.__hash = () => { hx.textContent = H.slice(0, Math.round(st.n)) }
  }

  // ── 8. MATRIZ ───────────────────────────────────────────────────────────────
  {
    const id = 'matriz', c = C[id], e = cena(id); janela(e, id)
    const E = esquerda(e, { n: 6, kicker: 'Matriz de Resultados', titulo: 'Cada entrega<br><em>conta para a meta</em>' })
    const ODS = [[1, '#E5243B', 'Erradicação da pobreza'], [4, '#C5192D', 'Educação de qualidade'], [5, '#FF3A21', 'Igualdade de gênero'], [8, '#A21942', 'Trabalho decente'],
      [13, '#3F7E44', 'Ação climática'], [15, '#56C02B', 'Vida terrestre'], [17, '#19486A', 'Parcerias'], [18, '#7B3110', 'Igualdade étnico-racial']]
    E.box.innerHTML = `<div class="ods">${ODS.map(o => `<div style="background:${o[1]}">${o[0]}<small>${o[2]}</small></div>`).join('')}</div>`
    const t = tela(e, { img: 'matriz', ...STD, url: 'Matriz de Resultados', hl: [{ x: .17, y: .065, w: .81, h: .1 }] })
    entradaTela(t, c.ini, c.fim); entradaEsq(E, c.ini, [])
    E.box.querySelectorAll('.ods div').forEach((d, i) => ft(d, { opacity: 0, scale: .4, rotation: -12 }, { opacity: 1, scale: 1, rotation: 0, duration: .45, ease: 'back.out(2.2)' }, wt(id, 'objetivos') - .2 + i * .07))
    camera(t, [{ s: 1, x: .5, y: .5 }, { t: c.voz + .3, s: 1.5, x: .55, y: .12 }, { t: wt(id, 'objetivos') - .2, s: 1.45, x: .55, y: .62, d: 1.5 }])
    realce(t, 0, c.voz + .9, wt(id, 'objetivos') - .3)
  }

  // ── 9. MAPA ─────────────────────────────────────────────────────────────────
  {
    const id = 'mapa', c = C[id], e = cena(id); janela(e, id)
    const E = esquerda(e, { n: 7, kicker: 'Mapa Interativo', titulo: 'O projeto<br><em>no território</em>', chips: [{ tx: 'Entregas georreferenciadas', ic: 'alvo' }, { tx: 'Camadas ambientais', ic: 'olho' }] })
    const P = [[.456, .358], [.51, .34], [.507, .41], [.516, .48], [.449, .527], [.429, .646], [.547, .629], [.494, .714], [.526, .79], [.458, .727], [.387, .418], [.583, .635]]
    const t = tela(e, { img: 'mapa', ...STD, url: 'Mapa Interativo · APAs', pulsos: P })
    entradaTela(t, c.ini, c.fim, -12, -6); entradaEsq(E, c.ini, [wt(id, 'territorio') - .2, wt(id, 'onde')])
    camera(t, [{ s: 1.05, x: .5, y: .5 }, { t: c.voz + .2, s: 2.1, x: .48, y: .55, d: 2.6, ease: 'power2.inOut' }])
    t.pulsos.forEach((p, i) => {
      iniciados.add(p)
      const t0 = c.voz + .6 + i * .12
      for (let k = 0; k < 3; k++) ft(p, { opacity: .95, scale: .6 }, { opacity: 0, scale: 3.2, duration: 1.1, ease: 'power2.out' }, t0 + k * 1.15)
    })
  }

  // ── 10. APP DE CAMPO ───────────────────────────────────────────────────────
  {
    const id = 'campo', c = C[id], e = cena(id); janela(e, id)
    el(`<div style="position:absolute;inset:0;background:url(${T('mapa')}) 60% 50%/150% no-repeat;opacity:.16;filter:blur(6px) saturate(1.2)"></div>`, e)
    const cel = el(`<div class="celular" style="${G('left:330px;top:90px', 'left:60px;top:560px')}"><div class="ilha"></div><div class="tela-cel"><img src="${T('diag-app')}"></div></div>`, e)
    const k = el(`<div class="kicker" style="position:absolute;${G('left:880px;top:200px', 'left:72px;top:250px')}"><b>08</b><i></i>Diagnóstico Socioambiental</div>`, e)
    const tit = el(`<div class="titulo" style="position:absolute;${G('left:880px;top:250px;width:900px', 'left:72px;top:300px;width:940px')}">No campo,<br><em>mesmo sem internet</em></div>`, e)
    const fs = el(`<div class="feats" style="${G('left:880px;top:500px', 'left:466px;top:640px;width:560px')}">
      <div class="feat"><div class="ic">${ic('semRede')}</div><div><b>Funciona offline</b><span>a ficha é enviada quando o sinal volta</span></div></div>
      <div class="feat"><div class="ic">${ic('camera')}</div><div><b>Fotos georreferenciadas</b><span>com data, hora e posição GPS</span></div></div>
      <div class="feat"><div class="ic">${ic('cadeado')}</div><div><b>Privacidade desde a coleta</b><span>identificação separada das respostas</span></div></div></div>`, e)
    ft(cel, { opacity: 0, y: 200, rotationY: 30, rotationZ: -6 }, { opacity: 1, y: 0, rotationY: 12, rotationZ: -3, duration: 1.2, ease: 'expo.out' }, c.ini - .1)
    tl.to(cel, { rotationY: 4, rotationZ: 0, y: -16, duration: c.fim - c.ini - 1, ease: 'sine.inOut' }, c.ini + 1.1)
    ft(k, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: .6 }, c.ini + .15)
    ft(tit, { opacity: 0, y: 34, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: .8, ease: 'power3.out' }, c.ini + .3)
    ;[...fs.children].forEach((f, i) => ft(f, { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: .55, ease: 'back.out(1.8)' }, [wt(id, 'internet'), wt(id, 'fotos'), wt(id, 'privacidade')][i] - .1))
  }

  // ── 11. PATRIMÔNIO ─────────────────────────────────────────────────────────
  {
    const id = 'patrimonio', c = C[id], e = cena(id); janela(e, id)
    const E = esquerda(e, { n: 9, kicker: 'Patrimônio', titulo: 'Cada bem<br><em>sob controle</em>', chips: [{ tx: 'Ficha com valor e depreciação', ic: 'doc' }, { tx: 'Termo de responsabilidade', ic: 'pessoas' }, { tx: 'Inventário digital', ic: 'qr' }] })
    const t = tela(e, { img: 'patrimonio', ...G({ x: 1160, y: 460, w: 980 }, STD), url: 'Patrimônio', ry: -10 })
    const q = qrcode(0, 'M'); q.addData(location.origin + '/pages/patrimonio.html?bem=PAT-000143'); q.make()
    const placa = el(`<div class="placa" style="${G('left:1480px;top:440px', 'left:700px;top:1030px')}"><div class="top">Patrimônio do projeto</div><div class="qr">${q.createSvgTag({ cellSize: 6, margin: 0, scalable: true })}</div>
      <div class="num">PAT-000143</div><div class="rod">Adquirido com recurso do projeto</div></div>`, e)
    entradaTela(t, c.ini, c.fim, -10, -5); entradaEsq(E, c.ini, [wt(id, 'ficha'), wt(id, 'termo'), wt(id, 'inventario')])
    ft(placa, { opacity: 0, rotationY: -80, rotationZ: 10, x: 200, z: 200 }, { opacity: 1, rotationY: -12, rotationZ: 4, x: 0, z: 200, duration: 1.1, ease: 'expo.out' }, wt(id, 'placa') - .15)
    tl.to(placa, { rotationY: 6, rotationZ: 2, y: -20, duration: 3, ease: 'sine.inOut' }, wt(id, 'placa') + 1)
    camera(t, [{ s: 1, x: .5, y: .5 }, { t: c.voz + .3, s: 1.5, x: .45, y: .18, d: 1.5 }, { t: wt(id, 'inventario') - .4, s: 1.35, x: .55, y: .6, d: 1.3 }])
  }

  // ── 12. AUDITORIA IA ───────────────────────────────────────────────────────
  {
    const id = 'auditoria', c = C[id], e = cena(id); janela(e, id)
    const E = esquerda(e, { n: 10, kicker: 'Auditoria IA', titulo: 'Riscos apontados<br><em>antes do problema</em>' })
    E.box.innerHTML = '<div class="sev"><div class="s-c"><b>1</b>crítico</div><div class="s-a"><b>2</b>altos</div><div class="s-m"><b>3</b>médios</div></div>'
    const t = tela(e, { img: 'auditoria', ...STD, url: 'Auditoria IA' })
    const scan = el('<div class="scan"></div>', t.d.querySelector('.dev-tela'))
    entradaTela(t, c.ini, c.fim); entradaEsq(E, c.ini, [])
    E.box.querySelectorAll('.sev div').forEach((d, i) => ft(d, { opacity: 0, y: 24, scale: .8 }, { opacity: 1, y: 0, scale: 1, duration: .45, ease: 'back.out(2)' }, wt(id, 'riscos') + i * .14))
    for (let k = 0; k < 2; k++) ft(scan, { top: -160 }, { top: t.h + 20, duration: 1.6, ease: 'sine.inOut' }, wt(id, 'vigia') - .3 + k * 1.9)
    camera(t, [{ s: 1, x: .5, y: .5 }, { t: c.voz + .5, s: 1.6, x: .55, y: .12 }, { t: wt(id, 'riscos') - .3, s: 1.55, x: .45, y: .55, d: 1.4 }])
    realce(t, 0, c.voz + 1.1, wt(id, 'riscos') - .3)
  }

  // ── 13. RELATÓRIOS ─────────────────────────────────────────────────────────
  {
    const id = 'relatorios', c = C[id], e = cena(id); janela(e, id)
    const E = esquerda(e, { n: 11, kicker: 'Relatórios', titulo: 'Prestação de contas<br><em>em um clique</em>' })
    E.box.innerHTML = '<div class="fmt"><div class="f-pdf">PDF<small>folha A4</small></div><div class="f-xls">XLSX<small>planilha</small></div><div class="f-ppt">PPTX<small>apresentação</small></div></div>'
    const t = tela(e, { img: 'relatorios-m1', ...STD, url: 'Relatórios · Central', ry: -10 })
    entradaTela(t, c.ini, c.fim, -10, -5); entradaEsq(E, c.ini, [])
    E.box.querySelectorAll('.fmt div').forEach((d, i) => ft(d, { opacity: 0, y: 40, rotation: -8 }, { opacity: 1, y: 0, rotation: 0, duration: .5, ease: 'back.out(2)' }, [wt(id, 'pdf'), wt(id, 'planilha'), wt(id, 'apresentacao')][i] - .1))
    camera(t, [{ s: 1.1, x: .6, y: .45 }, { t: c.voz + .2, s: 1.75, x: .67, y: .7, d: 1.6 }])
  }

  // ── 14. SEGURANÇA ──────────────────────────────────────────────────────────
  {
    const id = 'seguranca', c = C[id], e = cena(id); janela(e, id)
    const tit = el(`<div class="titulo" style="position:absolute;left:0;right:0;top:${G(110, 300)}px;text-align:center">Segurança ${G('', '<br>')}<em>de ponta a ponta</em></div>`, e)
    const aneis = G([380, 560, 760], [360, 540, 740]).map(r => el(`<div class="anel" style="width:${r}px;height:${r}px;margin:-${r / 2}px 0 0 -${r / 2}px"></div>`, e))
    const esc = el(`<div class="escudo"><svg viewBox="0 0 24 24" fill="none" stroke="url(#gq)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <defs><linearGradient id="gq" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C6F36B"/><stop offset="1" stop-color="#5CE0A0"/></linearGradient></defs>
      <path d="M12 2.5 4 5.6v6.2c0 5.1 3.4 8.5 8 9.7 4.6-1.2 8-4.6 8-9.7V5.6z" fill="rgba(198,243,107,.08)"/><path d="m8.6 12.1 2.4 2.4 4.6-4.8" stroke-width="1.8"/></svg></div>`, e)
    const IT = [['chave', 'Assinatura com senha', 250, 420], ['hist', 'Trilha de auditoria imutável', 1250, 420], ['pessoas', 'Acesso por perfil e módulo', 250, 700], ['cadeado', 'Conformidade com a LGPD', 1250, 700]]
    if (V) IT.forEach((it, i) => { it[2] = null; it[3] = 1090 + i * 82 })
    const its = IT.map(([i, tx, x, y]) => el(`<div class="seg-item" style="${x == null ? 'left:50%;margin-left:-260px;width:520px' : 'left:' + x + 'px'};top:${y}px"><span class="ic">${ic(i)}</span>${tx}</div>`, e))
    ft(tit, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .7, ease: 'power3.out' }, c.ini + .1)
    ft(esc, { opacity: 0, scale: .4, rotationY: 180 }, { opacity: 1, scale: 1, rotationY: 0, duration: 1.2, ease: 'expo.out' }, c.ini)
    aneis.forEach((a, i) => { iniciados.add(a); for (let k = 0; k < 2; k++) ft(a, { opacity: .7, scale: .5 }, { opacity: 0, scale: 1.3, duration: 2.2, ease: 'power2.out' }, c.ini + .4 + i * .35 + k * 2.4) })
    its.forEach((d, i) => ft(d, { opacity: 0, x: i % 2 ? 80 : -80 }, { opacity: 1, x: 0, duration: .6, ease: 'back.out(1.7)' }, c.voz + .4 + i * .55))
  }

  // ── 15. FECHO ──────────────────────────────────────────────────────────────
  {
    const id = 'fecho', c = C[id], e = cena(id)
    tl.set(e, { opacity: 1 }, c.ini - .05)
    clarao(c.ini, 1)
    const tag = el(`<div class="fecho-tag"><div class="l">Transparência <em>que se vê.</em></div><div class="l">Resultados <em>que ficam.</em></div></div>`, e)
    const ls = [...tag.children]
    ls.forEach((l, i) => ft(l, { opacity: 0, y: 50, filter: 'blur(16px)', scale: 1.1 }, { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1, duration: .8, ease: 'expo.out' }, [wt(id, 'transparencia'), wt(id, 'resultados')][i] - .12))
    const t2 = c.fim_voz + .5
    tl.to(tag, { opacity: 0, scale: .92, filter: 'blur(12px)', duration: .5, ease: 'power2.in' }, t2)
    const fim = el(`<div class="fecho-fim">
      <div class="topo"><img src="../../assets/brasao-acre.png" alt=""><img src="../../assets/sema-branco.png" alt=""><img class="res" src="../../assets/logo-resiliencia.png" alt=""></div>
      <div class="nome">Plataforma Inteligente de Gestão de Projetos</div>
      <div class="faixa-parc"><img src="../../assets/UNESCO_logo_hor_blue_transparent.png.png" alt=""><img src="../../assets/UNCT_Logo_RGB_Brazil_Portuguese_horiz_color.png" alt="">
        <img class="g" src="../../assets/logo-fundo-brasil-onu.png" alt=""><img class="g" src="../../assets/logo-consorcio-amazonia.png" alt=""></div>
      <div class="credito"><span class="p">Concepção e Desenvolvimento</span><br><b>Erisson Cameli Santiago</b> · © 2025–2026</div></div>`, e)
    ft(fim, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 1, ease: 'power3.out' }, t2 + .3)
    ;[...fim.children].forEach((ch, i) => ft(ch, { y: 30 }, { y: 0, duration: .9, ease: 'expo.out' }, t2 + .3 + i * .12))
    tl.to(palco, { opacity: 0, duration: 1.2, ease: 'power1.in' }, L.total - 1.2)
  }

  // aviso discreto: telas com dados de demonstração
  const demo = el('<div class="demo">Telas reais da plataforma com dados fictícios de demonstração</div>', palco)
  gsap.set(demo, { opacity: 0 })
  ft(demo, { opacity: 0 }, { opacity: 1, duration: .6 }, C.visao.ini); tl.to(demo, { opacity: 0, duration: .4 }, C.seguranca.ini - .3)

  // ── procedurais: fundo, partículas, grão e legenda ───────────────────────────
  const blobs = [...document.querySelectorAll('.blob')], grade = document.getElementById('grade'), grao = document.getElementById('grao')
  const cv = document.getElementById('part'), g2 = cv.getContext('2d')
  let s = 9; const r = () => (s = (s * 16807) % 2147483647) / 2147483647
  cv.width = W; cv.height = H
  const PT = Array.from({ length: G(110, 120) }, () => ({ x: r() * W, y: r() * H, v: 8 + r() * 26, z: .4 + r() * 1.6, f: r() * 6 }))
  const legenda = document.getElementById('legenda')
  const LEG = L.cenas.filter(c => !['gancho', 'fecho'].includes(c.id))
  let legAtual = null
  function procedural(t) {
    const sx = W / 1920, sy = H / 1080
    blobs[0].style.transform = `translate(${(-200 + Math.sin(t * .23) * 260) * sx}px, ${(-250 + Math.cos(t * .17) * 160) * sy}px)`
    blobs[1].style.transform = `translate(${(1150 + Math.cos(t * .19) * 240) * sx}px, ${(380 + Math.sin(t * .21) * 200) * sy}px)`
    blobs[2].style.transform = `translate(${(600 + Math.sin(t * .13) * 300) * sx}px, ${(650 + Math.cos(t * .11) * 120) * sy}px)`
    grade.style.backgroundPosition = `0 ${(t * 40) % 80}px`
    grao.style.backgroundPosition = `${(Math.floor(t * 30) * 73) % 220}px ${(Math.floor(t * 30) * 151) % 220}px`
    g2.clearRect(0, 0, W, H)
    for (const p of PT) {
      const y = ((p.y - p.v * t) % H + H) % H, x = (p.x + Math.sin(t * .5 + p.f) * 20)
      const a = (.25 + .35 * Math.sin(t * 1.3 + p.f) ** 2) * (p.z / 2)
      g2.fillStyle = `rgba(198,243,107,${a})`; g2.beginPath(); g2.arc(x, y, p.z * 1.4, 0, 7); g2.fill()
    }
    // legenda karaokê
    const c = LEG.find(c => t >= c.voz - .15 && t <= c.fim_voz + .45)
    if (!c) { legenda.style.opacity = 0; return }
    if (legAtual !== c.id) { legenda.innerHTML = c.palavras.map(p => `<span class="w">${p.w}</span>`).join(' '); legAtual = c.id }
    const ws = legenda.children
    c.palavras.forEach((p, i) => { ws[i].className = 'w' + (t >= p.fim ? ' dito' : t >= p.ini - .05 ? ' agora' : '') })
    legenda.style.opacity = Math.min(1, (t - c.voz + .15) / .2, (c.fim_voz + .45 - t) / .2)
  }

  window.__total = L.total
  window.__render = t => { tl.seek(t, false); if (window.__hash) window.__hash(); procedural(t) }
  await document.fonts.ready
  await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(ok => { i.onload = i.onerror = ok })))
  window.__render(0)
  window.__pronto = true
})()
