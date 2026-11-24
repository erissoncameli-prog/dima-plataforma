// Corte de 30 s, vertical, no estilo "trailer ao pôr do sol" (trend das redes).
// Mesmo protocolo das outras cenas: window.__render(t) desenha o instante t; window.__pronto quando tudo carregou.
// Tempos em build/trend/linha.json (gerado por audio/trilha_trend.py): cada corte cai num compasso da trilha.
;(async function () {
  const L = await (await fetch('../build/trend/linha.json')).json()
  const C = Object.fromEntries(L.cenas.map(c => [c.id, c]))
  const palco = document.getElementById('palco')
  const tl = gsap.timeline({ paused: true })
  const T = n => '../build/telas/' + n + '.png'
  const iniciados = new WeakSet()
  const ft = (alvo, de, para, em) => {
    for (const a of (alvo.length !== undefined && !alvo.nodeType ? [...alvo] : [alvo])) if (a && !iniciados.has(a)) { iniciados.add(a); gsap.set(a, de) }
    return tl.fromTo(alvo, de, { ...para, immediateRender: false }, em)
  }
  const el = (html, pai) => { const d = document.createElement('div'); d.innerHTML = html.trim(); const e = d.firstElementChild; (pai || palco).appendChild(e); return e }
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  const wt = (id, p, n = 0) => (C[id].palavras.filter(w => norm(w.w).startsWith(norm(p)))[n] || {}).ini ?? C[id].voz + .5
  let sem = 21; const rnd = () => (sem = (sem * 16807) % 2147483647) / 2147483647

  // ── paisagem: pôr do sol no rio, com buritis e açaís em silhueta ────────────
  function palmeira(x, base, alt, inclina, folhas, larg) {
    const topo = [x + inclina, base - alt], ctl = [x + inclina * .2, base - alt * .55]
    let s = `<path d="M${x - larg / 2} ${base} Q${ctl[0] - larg * .3} ${ctl[1]} ${topo[0] - 3} ${topo[1]} L${topo[0] + 3} ${topo[1]} Q${ctl[0] + larg * .3} ${ctl[1]} ${x + larg / 2} ${base}Z"/>`
    for (let i = 0; i < folhas; i++) {
      const a = -Math.PI + (i + .5) * Math.PI / folhas + (rnd() - .5) * .25, comp = alt * (.2 + rnd() * .08)
      const p2 = [topo[0] + Math.cos(a) * comp, topo[1] + Math.sin(a) * comp * .3 + comp * .62]      // ponta caída
      const p1 = [topo[0] + Math.cos(a) * comp * .55, topo[1] + Math.sin(a) * comp * .62 - comp * .28]  // arco para cima
      s += `<path d="M${topo[0]} ${topo[1]} Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}" fill="none" stroke-width="5"/>`
      for (let k = 2; k < 13; k += 1) {                                     // folíolos caindo da nervura
        const u = k / 13, bx = (1 - u) ** 2 * topo[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0], by = (1 - u) ** 2 * topo[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]
        const f = comp * .16 * (1 - u * .55)
        s += `<path d="M${bx} ${by} l${Math.cos(a + 1.2) * f * .6} ${f}" stroke-width="3"/><path d="M${bx} ${by} l${Math.cos(a - 1.2) * f * .6} ${f * .9}" stroke-width="3"/>`
      }
    }
    return `<g fill="var(--sil)" stroke="var(--sil)" stroke-linecap="round">${s}</g>`
  }
  function paisagem(pai, { sol = 560 } = {}) {
    const p = el('<div style="position:absolute;inset:0"></div>', pai)
    const ceu = el('<div class="ceu"></div>', p)
    const s = el(`<div class="sol" style="top:${sol}px"></div>`, p)
    el('<div class="mata" style="top:1130px"></div>', p)
    const rio = el('<div class="rio" style="top:1196px"><div class="reflexo"></div></div>', p)
    const aves = el(`<svg class="aves" viewBox="0 0 1080 1920">${[[300, 420], [350, 450], [395, 410], [700, 360], [745, 385]].map(([x, y]) =>
      `<path d="M${x - 16} ${y} q8 -10 16 0 q8 -10 16 0" fill="none" stroke="var(--sil)" stroke-width="3.5" stroke-linecap="round"/>`).join('')}</svg>`, p)
    // só nas bordas, para não cruzar o texto: buriti (copa cheia) e açaí (fino e alto)
    const palmas = el(`<svg class="palmas" viewBox="0 0 1080 1920">${palmeira(40, 1700, 1250, 30, 12, 30)}${palmeira(150, 1820, 1500, 10, 8, 16)}${palmeira(-60, 1640, 900, 40, 11, 26)}
      ${palmeira(1040, 1680, 1200, -30, 12, 30)}${palmeira(940, 1840, 1440, -14, 8, 16)}${palmeira(1150, 1640, 920, -40, 11, 26)}</svg>`, p)
    return { p, ceu, s, rio, aves, palmas }
  }
  function parte(id) { const e = el(`<div class="parte" id="p-${id}"></div>`); const c = C[id]; tl.set(e, { opacity: 1 }, c.ini); tl.set(e, { opacity: 0 }, c.fim); return e }
  const flash = el('<div id="flash"></div>'); iniciados.add(flash)
  const corte = (t, f = .9) => ft(flash, { opacity: f }, { opacity: 0, duration: .32, ease: 'power2.out' }, t)

  // ── 1. ABERTURA: pôr do sol + frase de impacto (voz de Alex) ─────────────────
  {
    const c = C.gancho, e = parte('gancho'), P = paisagem(e, { sol: 600 })
    tl.set(e, { opacity: 1 }, 0)
    const loc = el('<div class="local tag">Rio Branco · Acre · Amazônia</div>', e)
    const g = el(`<div class="gancho"><span class="l anton br">Cada <em class="grad">real</em> investido.</span><span class="l anton br">Cada <em class="grad">entrega.</em></span><span class="l anton br">Cada <em class="grad">resultado.</em></span></div>`, e)
    ft(P.p, { scale: 1.12, y: 60 }, { scale: 1, y: 0, duration: 4.8, ease: 'power2.out' }, 0)
    ft(P.s, { y: -40 }, { y: 50, duration: 4.8, ease: 'none' }, 0)
    ft(P.aves, { x: -40 }, { x: 80, duration: 4.8, ease: 'none' }, 0)
    ft(loc, { opacity: 0, letterSpacing: '.9em' }, { opacity: 1, letterSpacing: '.42em', duration: 1.2, ease: 'power3.out' }, .15)
    ;[...g.children].forEach((l, i) => ft(l, { opacity: 0, scale: 1.35, filter: 'blur(16px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .45, ease: 'expo.out' }, wt('gancho', 'cada', i) - .05))
    tl.to(e, { scale: 1.18, duration: .35, ease: 'power2.in' }, c.fim - .35)
  }

  // ── 2. PAINÉIS EM QUADRINHO, um por tempo ───────────────────────────────────
  {
    const c = C.paineis, e = parte('paineis'); e.classList.add('paineis')
    corte(c.ini, 1)
    // [polígono, captura, largura da imagem, foco x, foco y, proporção altura/largura, centro x, centro y]
    const PN = [
      ['0 0,1080px 0,1080px 560px,0 660px', 'mapa', 2600, .48, .5, .625, 540, 330, { y: -280 }],
      ['0 678px,548px 627px,494px 1312px,0 1282px', 'diag-app', 640, .5, .35, 2.164, 274, 970, { x: -320 }],
      ['566px 625px,1080px 578px,1080px 1350px,512px 1314px', 'remanejamentos-pedido', 2400, .62, .42, .625, 796, 964, { x: 320 }],
      ['0 1300px,1080px 1368px,1080px 1920px,0 1920px', 'dashboard-financiadores', 2600, .32, .55, .625, 540, 1610, { y: 320 }],
    ]
    PN.forEach(([poli, img, w, fx, fy, asp, cx, cy, de], i) => {
      const h = w * asp
      const pn = el(`<div class="painel" style="clip-path:polygon(${poli})"><div class="img" style="width:${w}px;height:${h}px;left:${cx - fx * w}px;top:${cy - fy * h}px;background:url(${T(img)}) 0 0/100% 100%"></div><div class="luz"></div></div>`, e)
      const t0 = c.ini + i * .6
      ft(pn, { opacity: 0, ...de }, { opacity: 1, x: 0, y: 0, duration: .42, ease: 'expo.out' }, t0)
      ft(pn.querySelector('.img'), { scale: 1.12, transformOrigin: `${fx * 100}% ${fy * 100}%` }, { scale: 1.02, duration: c.fim - t0, ease: 'none' }, t0)
      ft(e, { x: i % 2 ? -14 : 14 }, { x: 0, duration: .3, ease: 'elastic.out(1,.35)' }, t0)
    })
    const fx = el(`<div class="faixa"><div class="anton grad">Plataforma Inteligente</div><div class="script">de Gestão de Projetos</div></div>`, e)
    ft(fx, { opacity: 0, scale: 1.7, rotation: -14 }, { opacity: 1, scale: 1, rotation: -6, duration: .5, ease: 'back.out(1.6)' }, c.ini + 4 * .6)
    tl.to(fx, { scale: 1.06, duration: c.fim - c.ini - 2.9, ease: 'none' }, c.ini + 2.9)
  }

  // ── 3. CARTÕES DE APRESENTAÇÃO DOS MÓDULOS ───────────────────────────────────
  const CARTOES = [
    ['visao', 'dashboard-financiadores', 4300, .30, .42, 'Visão Geral', 'o orçamento em tempo real', 'Pago, comprometido e livre — atividade por atividade.'],
    ['remanej', 'remanejamentos-pedido', 4300, .6, .42, 'Remanejamento', 'assinatura em cadeia', 'Cada etapa confirmada com senha e impressão digital do documento.'],
    ['mapa', 'mapa', 3800, .47, .55, 'Mapa Interativo', 'o projeto no território', 'Entregas georreferenciadas nas APAs do Acre.'],
    ['auditoria', 'auditoria', 4300, .42, .45, 'Auditoria IA', 'riscos antes do problema', 'Inteligência artificial que vigia o projeto inteiro.'],
  ]
  const nomes = []
  CARTOES.forEach(([id, img, w, fx, fy, nome, script, desc], i) => {
    const c = C[id], e = parte(id); e.classList.add('cartao')
    const h = w * .625
    const left = gsap.utils.clamp(1080 - w, 0, 540 - fx * w), top = gsap.utils.clamp(1920 - h, 0, 960 - fy * h)
    const fundo = el(`<div class="fundo" style="width:${w}px;height:${h}px;left:${left}px;top:${top}px;background:url(${T(img)}) 0 0/100% 100%"></div>`, e)
    el('<div class="cor"></div>', e); el('<div class="grade"></div>', e)
    el(`<div class="faixa-cine cima"><span>Plataforma Inteligente de Gestão de Projetos</span></div>`, e)
    el(`<div class="faixa-cine baixo"><span>Telas reais · dados fictícios de demonstração</span></div>`, e)
    const n = el(`<div class="nome"><div class="num">Nº ${String(i + 1).padStart(2, '0')} · módulo</div><div class="anton grad">${nome}</div><div class="script">${script}</div><div class="desc">${desc}</div></div>`, e)
    nomes.push(n.querySelector('.anton'))
    corte(c.ini, .85)
    const fo = `${(540 - left) / w * 100}% ${(960 - top) / h * 100}%`
    ft(fundo, { scale: 1.4, transformOrigin: fo }, { scale: 1.12, duration: .55, ease: 'expo.out' }, c.ini)
    tl.to(fundo, { scale: 1.22, x: i % 2 ? 40 : -40, duration: c.fim - c.ini - .55, ease: 'none' }, c.ini + .55)
    ft(n.querySelector('.num'), { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: .4, ease: 'power3.out' }, c.ini + .1)
    ft(n.querySelector('.anton'), { opacity: 0, scale: 1.45, filter: 'blur(14px)', transformOrigin: '0% 100%' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .4, ease: 'expo.out' }, c.ini + .05)
    ft(n.querySelector('.script'), { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: .6, ease: 'power2.out' }, c.ini + .4)
    ft(n.querySelector('.desc'), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .45, ease: 'power3.out' }, c.ini + .8)
  })

  // ── 4. FECHO: pôr do sol, marca, frase (voz de Alex), logos e crédito ────────
  {
    const c = C.fecho, e = parte('fecho'), P = paisagem(e, { sol: 760 })
    corte(c.ini, 1)
    const topo = el(`<div class="logos-topo"><img src="../../assets/brasao-acre.png" alt=""><img src="../../assets/sema-branco.png" alt=""><img class="res" src="../../assets/logo-resiliencia.png" alt=""></div>`, e)
    const m = el(`<div class="marca"><div class="anton grad">Plataforma</div><div class="script">Inteligente de Gestão de Projetos</div></div>`, e)
    const fr = el(`<div class="frases"><div class="anton">Transparência que se vê.</div><div class="anton">Resultados que ficam.</div></div>`, e)
    const pa = el(`<div class="parceiros"><img src="../../assets/UNESCO_logo_hor_blue_transparent.png.png" alt=""><img src="../../assets/UNCT_Logo_RGB_Brazil_Portuguese_horiz_color.png" alt="">
      <img class="g" src="../../assets/logo-fundo-brasil-onu.png" alt=""><img class="g" src="../../assets/logo-consorcio-amazonia.png" alt=""></div>`, e)
    const cr = el(`<div class="credito"><span>Concepção e Desenvolvimento</span>Erisson Cameli Santiago · © 2025–2026</div>`, e)
    ft(P.p, { scale: 1.1 }, { scale: 1, duration: c.fim - c.ini, ease: 'power1.out' }, c.ini)
    ft(P.s, { y: 0 }, { y: 70, duration: c.fim - c.ini, ease: 'none' }, c.ini)
    ft(m.querySelector('.anton'), { opacity: 0, scale: 1.5, filter: 'blur(16px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .5, ease: 'expo.out' }, c.ini + .05)
    ft(m.querySelector('.script'), { opacity: 1, clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: .7, ease: 'power2.out' }, c.ini + .45)
    ft(topo, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: .6 }, c.ini + .3)
    ;[...fr.children].forEach((l, i) => ft(l, { opacity: 0, y: 30, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: .45, ease: 'expo.out' }, wt('fecho', ['transparencia', 'resultados'][i]) - .08))
    ft(pa, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .6, ease: 'power3.out' }, c.ini + 1.1)
    ft(cr, { opacity: 0 }, { opacity: 1, duration: .6 }, c.ini + 1.5)
  }

  // ── camadas por cima: luz quente, vinheta, grão e o preto final ──────────────
  const luz = el('<div id="luz"></div>'); el('<div id="vinheta"></div>'); const grao = el('<div id="grao"></div>')
  const preto = el('<div id="preto"></div>')
  ft(preto, { opacity: 0 }, { opacity: 1, duration: 1, ease: 'power1.in' }, L.total - 1)

  window.__render = t => {
    tl.seek(t, false)
    luz.style.transform = `translate(${-300 + Math.sin(t * .7) * 420}px, ${-260 + Math.cos(t * .5) * 300}px)`
    luz.style.opacity = .55 + .3 * Math.sin(t * 1.9) ** 2
    grao.style.backgroundPosition = `${(Math.floor(t * 30) * 83) % 240}px ${(Math.floor(t * 30) * 131) % 240}px`
  }
  await document.fonts.ready
  await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(ok => { i.onload = i.onerror = ok })))
  // nome do módulo cabe na largura (REMANEJAMENTO é longo)
  for (const n of nomes) { let f = 176; n.style.fontSize = f + 'px'; while (n.scrollWidth > 950 && f > 100) { f -= 4; n.style.fontSize = f + 'px' } }
  window.__total = L.total
  window.__render(0)
  window.__pronto = true
})()
