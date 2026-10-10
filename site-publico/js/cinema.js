// ════════════════════════════════════════════════════════════════
// CINEMA — seções guiadas pela rolagem e pelo mouse (página Sobre)
//
// Técnica do vídeo de referência (relógio que abre com a rolagem): um
// vídeo cortado em quadros WebP (assets/cinema/<nome>/{g,p}/NNN.webp —
// g = computador, p = celular) desenhados num <canvas>; a rolagem escolhe
// o quadro (GSAP ScrollTrigger com scrub) e o mouse inclina a cena e move
// camadas em profundidades diferentes (gsap.quickTo). JS puro, GSAP via CDN.
//
// 1) Sequência de quadros — <section class="cine" data-cine="logo" …>
//      data-quadros   nº de quadros          data-rolagem  telas de rolagem (padrão 2,2)
//      data-ajuste    "miolo" (não corta o centro, ex.: logo) | "cobrir" (padrão)
//      data-recua     ponto (0–1) em que a cena recua pra abrir espaço ao texto
//      data-carregar  "ja" = baixa os quadros ao abrir a página; senão só ao chegar perto
//    Dentro: .cine-palco > .cine-cena > canvas.cine-canvas (+ img.cine-camada
//    com data-profundidade, que segue o mouse) e .cine-texto[data-entra][data-sai]
//    (frações 0–1 da rolagem; entra <= 0 = visível desde o início).
//    .cine-num[data-alvo][data-de][data-ate] conta de 0 ao alvo nesse trecho.
//
// 2) Fotos flutuando — <section class="flutua"> com .flutua-foto
//    [data-profundidade] (parallax de mouse e rolagem); no centro, os eixos
//    entram um a um lado a lado e permanecem (.flutua-eixo).
//
// 3) .revela — blocos comuns que sobem e aparecem ao entrar na tela.
//
// 4) .rolagem-palavras — texto que acende palavra por palavra com a rolagem.
//
// 5) .rolagem-itens — os filhos (ícones) surgem um a um com a rolagem.
//
// 7) .mapa-zoom — mapa do território com zoom guiado pela rolagem.
//
// 8) .eixo-cena — uma cena presa por eixo: fotos se abrindo e ações
//    entrando uma a uma.
//
// 9) .faixa-cine — foto larga em parallax.
//
// Quem pede menos movimento (prefers-reduced-motion) vê tudo parado, sem
// pin: último quadro, textos e números finais visíveis.
// ════════════════════════════════════════════════════════════════

gsap.registerPlugin(ScrollTrigger);

const CINE_CELULAR = window.matchMedia('(max-width: 760px)').matches;

function _cineCaminho(nome, i) {
  return `assets/cinema/${nome}/${CINE_CELULAR ? 'p' : 'g'}/${String(i).padStart(3, '0')}.webp`;
}

// Altura do header fixo: as cenas presas ficam logo abaixo dele
function _cineTopo() {
  return 'top ' + (document.querySelector('.site-header')?.offsetHeight || 0) + 'px';
}

// Carrega os quadros: primeiro e último antes (a cena nunca fica vazia,
// nem pra quem pula direto pro fim), depois o resto
function _cineCarregar(nome, total, aoCarregar) {
  const imgs = new Array(total);
  const ordem = [0, total - 1, ...Array.from({ length: total - 2 }, (_, k) => k + 1)];
  ordem.forEach(i => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => aoCarregar(i);
    img.src = _cineCaminho(nome, i);
    imgs[i] = img;
  });
  return imgs;
}

// Quadro mais próximo já carregado (enquanto o resto ainda chega)
function _cineQuadroPronto(imgs, i) {
  if (!imgs) return null;
  for (let d = 0; d < imgs.length; d++) {
    for (const j of [i - d, i + d]) {
      const img = imgs[j];
      if (img && img.complete && img.naturalWidth) return img;
    }
  }
  return null;
}

// Números que contam com a rolagem: progresso p (0–1) da cena
function _cineContadores(secao, p) {
  secao.querySelectorAll('.cine-num').forEach(el => {
    const de = +el.dataset.de, ate = +el.dataset.ate;
    const t = Math.max(0, Math.min(1, (p - de) / (ate - de)));
    el.textContent = fmtNum(Math.round(+el.dataset.alvo * (1 - Math.pow(1 - t, 3))));
  });
}

// Mouse: inclina a cena em 3D e move as camadas conforme a profundidade
function _cineMouse(area, cena, camadasEls, inclinacao) {
  const camadas = camadasEls.map(el => ({
    p: +el.dataset.profundidade || 20,
    x: gsap.quickTo(el, 'x', { duration: 0.8, ease: 'power3' }),
    y: gsap.quickTo(el, 'y', { duration: 0.8, ease: 'power3' }),
  }));
  const rx = cena && gsap.quickTo(cena, 'rotationX', { duration: 1, ease: 'power3' });
  const ry = cena && gsap.quickTo(cena, 'rotationY', { duration: 1, ease: 'power3' });
  const mover = e => {
    // -0,5 … 0,5 a partir do centro da tela
    const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
    if (cena) { ry(nx * inclinacao); rx(-ny * inclinacao * 0.66); }
    camadas.forEach(c => { c.x(nx * c.p); c.y(ny * c.p); });
  };
  area.addEventListener('pointermove', mover);
  return () => area.removeEventListener('pointermove', mover);
}

// Título que cai palavra por palavra (.cine-palavras[data-de][data-ate]):
// as frações são do trecho de rolagem da cena presa (st). Fica num
// ScrollTrigger próprio, sem pin, pra poder ser refeito na troca de idioma
// sem recriar a cena. Devolve a função que desfaz (texto inteiro de volta).
function _quedaPalavras(secao, st) {
  const quedas = [...secao.querySelectorAll('.cine-palavras')].map(el => {
    const q = { el, tw: null };
    q.montar = () => {
      q.tw?.scrollTrigger?.kill(); q.tw?.kill();
      el.innerHTML = el.textContent.trim().split(/\s+/).map(p => `<span class="cp">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join(' ');
      const de = +el.dataset.de, ate = +el.dataset.ate;
      q.tw = gsap.fromTo(el.querySelectorAll('.cp'),
        { autoAlpha: 0, y: () => -window.innerHeight * 0.45, rotation: i => (i % 2 ? 1 : -1) * 28 },
        { autoAlpha: 1, y: 0, rotation: 0, ease: 'back.out(1.5)', stagger: 0.12,
          scrollTrigger: { trigger: secao, start: () => st.start + (st.end - st.start) * de, end: () => st.start + (st.end - st.start) * ate, scrub: 0.6 } });
    };
    q.montar();
    return q;
  });
  const refazer = () => { quedas.forEach(q => q.montar()); ScrollTrigger.refresh(); };
  document.addEventListener('idioma', refazer);
  return () => {
    document.removeEventListener('idioma', refazer);
    quedas.forEach(q => { q.tw?.scrollTrigger?.kill(); q.tw?.kill(); q.el.textContent = q.el.textContent; });
  };
}

// ── 1) Sequência de quadros ─────────────────────────────────────
function montarCinema(secao) {
  const nome = secao.dataset.cine;
  const total = +secao.dataset.quadros;
  const miolo = secao.dataset.ajuste === 'miolo';
  const palco = secao.querySelector('.cine-palco');
  const cena = secao.querySelector('.cine-cena');
  const canvas = secao.querySelector('.cine-canvas');
  const ctx = canvas.getContext('2d');
  const estado = { quadro: 0, progresso: 0 };
  let imgs = null;

  if (miolo) {
    secao.classList.add('cine-miolo');
    // Fundo do palco = 1º quadro (só o desfocado). URL absoluta: url()
    // relativa numa variável CSS resolveria a partir de css/
    palco.style.setProperty('--cine-fundo', `url('${new URL(_cineCaminho(nome, 0), location.href).href}')`);
  }

  function desenhar() {
    const img = _cineQuadroPronto(imgs, Math.round(estado.quadro));
    if (!img) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const iw = img.naturalWidth, ih = img.naturalHeight;
    // cobrir: preenche a tela. miolo: idem, mas no celular em pé encolhe
    // até caber ~50% da largura da imagem, pra não cortar o centro
    let escala = Math.max(w / iw, h / ih);
    if (miolo) escala = Math.min(escala, w / (iw * 0.5));
    const dw = iw * escala, dh = ih * escala, dy = (h - dh) / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, (w - dw) / 2, dy, dw, dh);
    if (dy > 0) {
      // Imagem menor que a tela: esfuma as bordas de cima e de baixo da
      // faixa sobre o fundo desfocado do palco
      const f = dh * 0.22;
      const g = ctx.createLinearGradient(0, dy, 0, dy + dh);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(f / dh, '#000');
      g.addColorStop(1 - f / dh, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function carregar() {
    if (imgs) return;
    imgs = _cineCarregar(nome, total, i => {
      if (Math.abs(i - Math.round(estado.quadro)) <= 1 || i === total - 1) desenhar();
    });
  }
  if (secao.dataset.carregar === 'ja') carregar();
  else ScrollTrigger.create({ trigger: secao, start: 'top bottom+=150%', once: true, onEnter: carregar });
  window.addEventListener('resize', () => requestAnimationFrame(desenhar));

  // Tudo que tem data-entra aparece no seu ponto da rolagem (blocos de texto
  // e também itens dentro deles, como cada cartão de desafio)
  const textos = secao.querySelectorAll('[data-entra]:not(.cine-cai)');
  const caem = [...secao.querySelectorAll('.cine-cai')];
  const mm = gsap.matchMedia();
  mm.add({
    movimento: '(prefers-reduced-motion: no-preference)',
    mouse: '(hover: hover) and (pointer: fine)',
  }, ({ conditions: { movimento, mouse } }) => {
    if (!movimento) {
      // Sem animação: último quadro parado, textos e números finais
      carregar();
      estado.quadro = total - 1;
      desenhar();
      gsap.set(textos, { autoAlpha: 1, y: 0 });
      gsap.set(caem, { autoAlpha: 1 });
      _cineContadores(secao, 1);
      return;
    }

    // Rolagem: a cena fica presa e os quadros avançam (scrub suave)
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: secao,
        start: _cineTopo,
        end: () => '+=' + Math.round(window.innerHeight * (+secao.dataset.rolagem || 2.2)),
        pin: palco,
        scrub: 0.6,
        invalidateOnRefresh: true, // recalcula a subida do [data-sobe] ao redimensionar
      },
      defaults: { ease: 'none' },
      onUpdate() { _cineContadores(secao, this.progress()); },
    });
    // data-fim-quadros: o vídeo termina antes do fim da cena, deixando o resto
    // da rolagem para o que entra depois (ex.: parceiros e título na abertura)
    tl.to(estado, { quadro: total - 1, duration: +secao.dataset.fimQuadros || 1, onUpdate: desenhar }, 0);
    tl.set({}, {}, 1); // a timeline mede sempre 1 (posições = fração da rolagem)
    if (secao.dataset.recua) {
      tl.to(canvas, { scale: 0.74, yPercent: -12, duration: 0.14, ease: 'power2.inOut' }, +secao.dataset.recua);
    }
    textos.forEach(t => {
      const entra = +(t.dataset.entra ?? 0), sai = t.dataset.sai != null ? +t.dataset.sai : null;
      // Item dentro de um bloco [data-sobe] cai do alto e pousa com um quique
      const cai = !!t.parentElement.closest('[data-sobe]');
      if (entra <= 0) gsap.set(t, { autoAlpha: 1, y: 0 });
      else if (cai) tl.fromTo(t, { autoAlpha: 0, y: -70 }, { autoAlpha: 1, y: 0, duration: 0.07, ease: 'back.out(1.4)' }, entra);
      else tl.fromTo(t, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.06, ease: 'power2.out' }, entra);
      if (sai != null) tl.to(t, { autoAlpha: 0, y: -30, duration: 0.06, ease: 'power2.in' }, sai);
    });
    // [data-sobe]: o bloco começa com o título no meio da tela (a lista,
    // ainda invisível, fica abaixo dela) e sobe um degrau a cada item que
    // cai, até a lista inteira caber. Usa yPercent porque o y é da entrada
    // do bloco; o -50 é o translateY(-50%) do .no-meio
    secao.querySelectorAll('[data-sobe]').forEach(bloco => {
      const itens = [...bloco.querySelectorAll('[data-entra]')];
      const lista = itens[0]?.parentElement;
      if (!lista) return;
      const desce = () => (bloco.offsetHeight - lista.offsetTop) / 2 / bloco.offsetHeight * 100;
      tl.fromTo(bloco, { yPercent: () => -50 + desce() }, { yPercent: () => -50 + desce(), duration: 0.001 }, 0);
      itens.forEach((it, i) => {
        const resta = (itens.length - 1 - i) / itens.length;
        tl.to(bloco, { yPercent: () => -50 + desce() * resta, duration: 0.07, ease: 'power2.inOut' }, +it.dataset.entra);
      });
    });
    // .cine-cai: cai do alto girando (sentido alternado) e pousa com um quique
    caem.forEach((el, i) => {
      tl.fromTo(el, { autoAlpha: 0, y: () => -window.innerHeight * 0.6, rotation: (i % 2 ? 1 : -1) * 300, scale: 0.7 },
        { autoAlpha: 1, y: 0, rotation: 0, scale: 1, duration: 0.07, ease: 'back.out(1.6)' }, +el.dataset.entra);
    });

    // .cine-palavras: o título cai palavra por palavra (ver _quedaPalavras)
    const desfazerQuedas = _quedaPalavras(secao, tl.scrollTrigger);

    const soltarMouse = mouse ? _cineMouse(palco, cena, [...secao.querySelectorAll('.cine-camada')], +secao.dataset.inclinacao || 6) : null;
    return () => { desfazerQuedas(); soltarMouse?.(); };
  });

  desenhar();
}

// ── 2) Fotos flutuando ──────────────────────────────────────────
// .flutua: fotos (.flutua-foto[data-profundidade]) em parallax de mouse e
// rolagem; no centro, o título (.flutua-intro), os eixos lado a lado
// (.flutua-eixo — entram um a um e ficam) e o fechamento (.flutua-transversal)
function montarFlutuantes(secao) {
  const palco = secao.querySelector('.flutua-palco');
  const fotos = [...secao.querySelectorAll('.flutua-foto')];
  const introP = secao.querySelector('.flutua-intro p');
  const eixos = [...secao.querySelectorAll('.flutua-eixo')];
  const transversal = secao.querySelector('.flutua-transversal');
  const kicker = secao.querySelector('.flutua-intro .kicker');
  const mm = gsap.matchMedia();
  mm.add({
    movimento: '(prefers-reduced-motion: no-preference)',
    mouse: '(hover: hover) and (pointer: fine)',
  }, ({ conditions: { movimento, mouse } }) => {
    if (!movimento) { secao.classList.add('flutua-parado'); return () => secao.classList.remove('flutua-parado'); }

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: secao,
        start: _cineTopo,
        end: () => '+=' + Math.round(window.innerHeight * (+secao.dataset.rolagem || 3)),
        pin: palco,
        scrub: 0.8,
      },
      defaults: { ease: 'none' },
    });
    // Fotos: as mais "próximas" (profundidade alta) sobem mais rápido que as
    // do fundo — parallax de rolagem; entram de longe e se aproximam
    fotos.forEach(f => {
      const p = +f.dataset.profundidade || 30;
      tl.fromTo(f, { y: p * 6, autoAlpha: 0, scale: 0.85 }, { y: -p * 6, autoAlpha: 1, scale: 1, duration: 1 }, 0);
      tl.to(f, { autoAlpha: 0.35, duration: 0.15 }, 0.85);
    });
    // O texto de apresentação sai pra abrir espaço aos eixos
    if (introP) tl.to(introP, { autoAlpha: 0, height: 0, marginTop: 0, duration: 0.08, ease: 'power2.inOut' }, 0.1);
    if (kicker) tl.fromTo(kicker, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.05, ease: 'power2.out' }, 0.01);
    // Eixos caem do alto girando, um a um, e pousam lado a lado
    const queda = () => -window.innerHeight * 0.7;
    eixos.forEach((e, i) => {
      tl.fromTo(e, { autoAlpha: 0, y: queda, rotation: (i % 2 ? 1 : -1) * 18, scale: 0.9 },
        { autoAlpha: 1, y: 0, rotation: 0, scale: 1, duration: 0.11, ease: 'back.out(1.4)' }, 0.2 + i * 0.12);
    });
    if (transversal) tl.fromTo(transversal, { autoAlpha: 0, y: queda, rotation: -4 },
      { autoAlpha: 1, y: 0, rotation: 0, duration: 0.11, ease: 'back.out(1.3)' }, 0.2 + eixos.length * 0.12 + 0.03);
    // Título "Os quatro eixos…" cai palavra por palavra antes dos cartões
    const desfazerQuedas = _quedaPalavras(secao, tl.scrollTrigger);

    const soltarMouse = mouse ? _cineMouse(palco, null, fotos, 0) : null;
    return () => { desfazerQuedas(); soltarMouse?.(); };
  });
}

// ── 3) Blocos que aparecem ao entrar na tela ────────────────────
function montarRevela() {
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    if (!document.querySelector('.revela')) return;
    gsap.set('.revela', { autoAlpha: 0, y: 40 });
    ScrollTrigger.batch('.revela', {
      start: 'top 88%',
      once: true,
      onEnter: els => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, overwrite: true }),
    });
  });
}

// ── 4) Texto que acende palavra por palavra com a rolagem ──────
// .rolagem-palavras: cada palavra começa apagada e acende conforme o
// elemento sobe na tela (scrub — volta a apagar se a pessoa rolar pra
// cima). O texto é quebrado em <span> por palavra; como a tradução troca
// o conteúdo do elemento, a quebra é refeita a cada troca de idioma.
const _palavras = [];
function _quebrarPalavras(el) {
  const texto = el.textContent;
  el.innerHTML = texto.split(/(\s+)/).map(p => /^\s+$/.test(p) || !p ? p : `<span class="rp">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join('');
  return gsap.fromTo(el.querySelectorAll('.rp'), { opacity: 0.12 }, {
    opacity: 1, stagger: 0.05, ease: 'none',
    scrollTrigger: { trigger: el, start: 'top 88%', end: 'bottom 58%', scrub: true },
  });
}
function montarPalavras() {
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    document.querySelectorAll('.rolagem-palavras').forEach(el => _palavras.push({ el, tw: _quebrarPalavras(el) }));
    return () => {
      // Sem movimento: devolve o texto inteiro, sem os <span>
      _palavras.splice(0).forEach(({ el, tw }) => { tw.scrollTrigger?.kill(); tw.kill(); el.textContent = el.textContent; });
    };
  });
}
// Depois que o i18n trocou os textos, quebra de novo os elementos refeitos
document.addEventListener('idioma', () => {
  _palavras.forEach(item => {
    if (item.el.querySelector('.rp')) return;
    item.tw.scrollTrigger?.kill(); item.tw.kill();
    item.tw = _quebrarPalavras(item.el);
  });
});

// ── 5) Itens que surgem um a um com a rolagem ───────────────────
// .rolagem-itens: os filhos (ex.: ícones dos ODS) surgem em sequência
// conforme o bloco sobe na tela, também em scrub
function montarItens() {
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    document.querySelectorAll('.rolagem-itens').forEach(lista => {
      // Ícones crescem; itens largos (cartões em lista) deslizam da esquerda
      const largos = (lista.firstElementChild?.offsetWidth || 0) > 280;
      gsap.fromTo(lista.children, largos ? { autoAlpha: 0, x: -60 } : { autoAlpha: 0, y: 40, scale: 0.7 }, {
        autoAlpha: 1, x: 0, y: 0, scale: 1, stagger: 0.12, ease: 'power1.out',
        // termina quando a lista inteira está na tela (base a 80% da altura)
        scrollTrigger: { trigger: lista, start: 'top 92%', end: 'bottom 80%', scrub: 0.5 },
      });
    });
  });
}

// ── 7) Mapa com zoom guiado pela rolagem ────────────────────────
// .mapa-zoom: o SVG do território (assets/cinema/mapa/territorio.svg —
// Brasil, Amazônia Legal, Acre, municípios e APAs no mesmo sistema de
// coordenadas) é preso na tela e a rolagem anima o viewBox em etapas:
// Brasil → Amazônia Legal → Acre → Rio Branco e Bujari → APAs. O SVG chega
// por fetch, mas a timeline é criada na hora (com um objeto de progresso)
// pra manter a ordem dos ScrollTriggers de cima pra baixo.
const _MAPA_TEXTOS = {
  'sobre.rot_brasil': 'Brasil',
  'apres.apa_sf': 'APA Igarapé São Francisco',
  'apres.apa_la': 'APA Lago do Amapá',
};
function _mapaTexto(chave) {
  const txt = t(chave);
  return txt === chave ? _MAPA_TEXTOS[chave] : txt;
}
const _limita = v => Math.max(0, Math.min(1, v));
const _rampa = (p, a, b) => _limita((p - a) / (b - a));
const _suave = gsap.parseEase('power2.inOut');

// SVG do território baixado uma vez e reaproveitado (página e apresentação)
let _mapaSvgPromessa = null;
function _mapaSvg() {
  return _mapaSvgPromessa ||= fetch('assets/cinema/mapa/territorio.svg').then(r => r.text());
}

// area(largura, altura) diz onde a câmera põe o alvo: 'direita' (texto à
// esquerda) ou 'cima' (texto embaixo). Padrão: celular em cima, resto à direita.
function _mapaPreparar(svg, area = (cw) => (cw <= 760 ? 'cima' : 'direita')) {
  const NS = 'http://www.w3.org/2000/svg';
  const q = s => svg.querySelector(s);
  const local = q('.m-local');
  const m = local.transform.baseVal.consolidate()?.matrix;
  const dx = m ? m.e : 0, dy = m ? m.f : 0;
  // Caixas no sistema do SVG (o grupo local é deslocado pelo transform)
  const caixa = (el, noLocal) => {
    const b = el.getBBox();
    return { x: b.x + (noLocal ? dx : 0), y: b.y + (noLocal ? dy : 0), w: b.width, h: b.height };
  };
  const une = (a, b) => {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  };
  const folga = (c, f) => ({ x: c.x - c.w * f, y: c.y - c.h * f, w: c.w * (1 + 2 * f), h: c.h * (1 + 2 * f) });

  const vb = svg.viewBox.baseVal;
  const acre = caixa(q('.m-acre'));
  const bujari = caixa(q('.m-bujari'), true), rb = caixa(q('.m-rb'), true);
  const sf = caixa(q('.m-apa-sf'), true), la = caixa(q('.m-apa-la'), true);
  const V = {
    brasil: { x: vb.x, y: vb.y, w: vb.width, h: vb.height },
    acre: folga(acre, 0.2),
    mun: folga(une(bujari, rb), 0.12),
    apas: folga(une(sf, la), 1.4),
  };
  // Quadros-chave do zoom (progresso → viewBox); entre eles a câmera anda
  const QUADROS = [[0, V.brasil], [0.16, V.brasil], [0.36, V.acre], [0.46, V.acre], [0.6, V.mun], [0.68, V.mun], [0.84, V.apas], [1, V.apas]];

  // Rótulos no próprio SVG, com tamanho na escala da etapa em que aparecem
  const rotulos = [];
  function rotulo(chaveOuTexto, x, y, tam, aparece, classe, ancora, linha) {
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('class', 'm-rotulo' + (classe ? ' ' + classe : ''));
    el.setAttribute('x', x); el.setAttribute('y', y);
    el.setAttribute('text-anchor', ancora || 'middle');
    // Linha de chamada do rótulo até a forma (como no mapa da cartilha)
    if (linha) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('class', 'm-chamada');
      l.setAttribute('x1', x); l.setAttribute('y1', linha[1] > y ? y + tam * 0.4 : y - tam * 1.1);
      l.setAttribute('x2', linha[0]); l.setAttribute('y2', linha[1]);
      svg.appendChild(l);
      rotulos.push({ el: l, chave: null, aparece });
    }
    el.setAttribute('font-size', tam);
    el.setAttribute('stroke-width', tam * 0.22);
    svg.appendChild(el);
    rotulos.push({ el, chave: chaveOuTexto, aparece });
  }
  const meio = c => [c.x + c.w / 2, c.y + c.h / 2];
  const tb = V.brasil.w * 0.045, ta = V.acre.w * 0.07, tm = V.mun.w * 0.05, tp = V.apas.w * 0.024;
  rotulo('sobre.rot_brasil', V.brasil.x + V.brasil.w * 0.62, V.brasil.y + V.brasil.h * 0.62, tb, p => 1 - _rampa(p, 0.08, 0.14));
  rotulo('Acre', meio(acre)[0], acre.y + acre.h * 0.42, ta, p => _rampa(p, 0.34, 0.38) * (1 - _rampa(p, 0.5, 0.56)));
  rotulo('Bujari', meio(bujari)[0], meio(bujari)[1] - bujari.h * 0.1, tm, p => _rampa(p, 0.58, 0.62) * (1 - _rampa(p, 0.72, 0.78)));
  rotulo('Rio Branco', rb.x + rb.w * 0.32, rb.y + rb.h * 0.62, tm, p => _rampa(p, 0.58, 0.62) * (1 - _rampa(p, 0.72, 0.78)));
  // APAs: São Francisco (a maior, a oeste) com rótulo embaixo à esquerda,
  // Lago do Amapá (a menor, a leste) embaixo à direita
  const apaVisivel = p => _rampa(p, 0.82, 0.88);
  rotulo('apres.apa_sf', meio(sf)[0], sf.y - tp * 2.6, tp, apaVisivel, 'm-rotulo-apa', 'middle', [meio(sf)[0], sf.y + sf.h * 0.3]);
  rotulo('apres.apa_la', meio(la)[0] + la.w, la.y + la.h + tp * 3.6, tp, apaVisivel, 'm-rotulo-apa', 'middle', [meio(la)[0], la.y + la.h * 0.7]);
  function nomear() {
    rotulos.forEach(r => { if (r.chave) r.el.textContent = r.chave.includes('.') ? _mapaTexto(r.chave) : r.chave; });
  }
  nomear();
  // O SVG da apresentação é recriado a cada cena: solta o ouvinte quando sai
  const aoIdioma = () => { if (svg.isConnected) nomear(); else document.removeEventListener('idioma', aoIdioma); };
  document.addEventListener('idioma', aoIdioma);

  const brasil = q('.m-brasil'), amz = q('.m-amz'), acreEl = q('.m-acre');
  // Câmera: o centro anda na mesma proporção em que a largura encolhe,
  // então o ponto de destino fica parado na tela durante o zoom
  function camera(p) {
    let i = 0;
    while (i < QUADROS.length - 2 && p > QUADROS[i + 1][0]) i++;
    const [p0, a] = QUADROS[i], [p1, b] = QUADROS[i + 1];
    cameraEntre(a, b, _suave(_rampa(p, p0, p1)));
  }
  function cameraEntre(a, b, k) {
    const w = a.w * Math.pow(b.w / a.w, k);
    const s = a.w === b.w ? k : (a.w - w) / (a.w - b.w);
    const cx = a.x + a.w / 2 + (b.x + b.w / 2 - a.x - a.w / 2) * s;
    const cy = a.y + a.h / 2 + (b.y + b.h / 2 - a.y - a.h / 2) * s;
    const h = w * (a.h + (b.h - a.h) * s) / (a.w + (b.w - a.w) * s);
    // O mapa ocupa a cena inteira; o alvo fica na área livre do texto:
    // à direita (58% da largura) no computador, em cima (60%) no celular
    const cw = svg.clientWidth || 1, ch = svg.clientHeight || 1, A = cw / ch;
    let W, H, x, y;
    if (area(cw, ch) === 'cima') {
      H = Math.max(h / 0.6, w / A); W = H * A;
      x = cx - W / 2; y = cy - H * 0.3;
    } else if (estadoParado) {
      H = Math.max(h, w / A); W = H * A;
      x = cx - W / 2; y = cy - H / 2;
    } else {
      W = Math.max(w / 0.58, h * A); H = W / A;
      x = cx - W * 0.7; y = cy - H / 2;
    }
    svg.setAttribute('viewBox', `${x} ${y} ${W} ${H}`);
  }
  let estadoParado = false;
  return {
    // volta (0–1, opcional): depois de chegar nas APAs, a câmera recua até o
    // Acre inteiro, mantendo municípios e APAs marcados (usado na apresentação)
    aplicar(p, volta = 0) {
      estadoParado = false;
      if (volta > 0) cameraEntre(V.apas, V.acre, _suave(volta)); else camera(p);
      const cor = _rampa(p, 0.03, 0.13);
      brasil.style.opacity = 1 - 0.6 * _rampa(p, 0.22, 0.34);
      amz.style.opacity = cor * (1 - 0.65 * _rampa(p, 0.22, 0.34));
      acreEl.style.opacity = cor;
      local.style.opacity = _rampa(p, 0.48, 0.58);
      rotulos.forEach(r => {
        let o = r.aparece(p);
        // Na volta, os rótulos das APAs somem (ficariam minúsculos) e o do Acre entra
        if (volta > 0) o = r.chave === 'Acre' ? _rampa(volta, 0.6, 1) : o * (1 - _rampa(volta, 0, 0.35));
        r.el.style.opacity = o;
      });
    },
    // Movimento reduzido: tudo visível, na escala dos municípios
    parado() {
      estadoParado = true;
      camera(0.64);
      [brasil, amz, acreEl, local].forEach(el => { el.style.opacity = ''; });
      rotulos.forEach(r => { r.el.style.opacity = r.chave === 'sobre.rot_brasil' || r.chave === 'Acre' ? 0 : 1; });
    },
  };
}

function montarMapa(secao) {
  const palco = secao.querySelector('.mapa-palco');
  const caixa = secao.querySelector('.mapa-svg');
  const etapas = secao.querySelectorAll('.mapa-etapa');
  const estado = { p: 0, parado: false };
  let mapa = null;
  const aplicar = () => { if (mapa) estado.parado ? mapa.parado() : mapa.aplicar(estado.p); };

  _mapaSvg().then(txt => {
    caixa.innerHTML = txt;
    mapa = _mapaPreparar(caixa.querySelector('svg'));
    aplicar();
  });
  window.addEventListener('resize', () => requestAnimationFrame(aplicar));

  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    estado.parado = false;
    secao.classList.remove('mapa-parado');
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: secao,
        start: _cineTopo,
        end: () => '+=' + Math.round(window.innerHeight * (+secao.dataset.rolagem || 3)),
        pin: palco,
        scrub: 0.6,
      },
      defaults: { ease: 'none' },
    });
    tl.to(estado, { p: 1, duration: 1, onUpdate: aplicar }, 0);
    etapas.forEach(t => {
      const entra = +(t.dataset.entra ?? 0), sai = t.dataset.sai != null ? +t.dataset.sai : null;
      if (entra <= 0) gsap.set(t, { autoAlpha: 1, y: 0 });
      else tl.fromTo(t, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.05, ease: 'power2.out' }, entra);
      if (sai != null) tl.to(t, { autoAlpha: 0, y: -30, duration: 0.05, ease: 'power2.in' }, sai);
    });
    return () => { estado.parado = true; secao.classList.add('mapa-parado'); aplicar(); };
  });
  // Sem movimento desde o início: o add acima não roda
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    estado.parado = true;
    secao.classList.add('mapa-parado');
  }
}

// ── 8) Cena de cada eixo ────────────────────────────────────────
// .eixo-cena: no computador a cena fica presa; a foto principal se abre
// (clip-path) com zoom lento, as menores entram por cima e o texto chega
// em partes — título, objetivo e as ações uma a uma. No celular (ou tela
// baixa) não prende: cada parte só surge ao entrar na tela.
const _eixosST = {};
function montarEixos(secao) {
  const palco = secao.querySelector('.eixo-palco');
  const f1 = secao.querySelector('.f1'), f2 = secao.querySelector('.f2'), f3 = secao.querySelector('.f3');
  const f1img = f1?.querySelector('img');
  const cab = secao.querySelector('.eixo-cab'), obj = secao.querySelector('.eixo-obj');
  const acoesT = secao.querySelector('.eixo-acoes-t');
  const itens = [...secao.querySelectorAll('.eixo-acoes li')];
  const lado = secao.classList.contains('eixo-inverso') ? -1 : 1;
  const mm = gsap.matchMedia();
  mm.add({
    grande: '(min-width: 901px) and (min-height: 620px)',
    movimento: '(prefers-reduced-motion: no-preference)',
  }, ({ conditions: { grande, movimento } }) => {
    if (!movimento) return;
    if (!grande) {
      const partes = [f1, f2, f3, cab, obj, acoesT, ...itens].filter(Boolean);
      gsap.set(partes, { autoAlpha: 0, y: 30 });
      ScrollTrigger.batch(partes, {
        start: 'top 92%',
        once: true,
        onEnter: els => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.06, ease: 'power2.out', overwrite: true }),
      });
      return;
    }
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: secao,
        start: _cineTopo,
        end: () => '+=' + Math.round(window.innerHeight * (+secao.dataset.rolagem || 1.6)),
        pin: palco,
        scrub: 0.6,
      },
      defaults: { ease: 'none' },
    });
    _eixosST[secao.id] = tl.scrollTrigger;
    const fechado = lado > 0 ? 'inset(0% 100% 0% 0% round 16px)' : 'inset(0% 0% 0% 100% round 16px)';
    tl.fromTo(f1, { clipPath: fechado }, { clipPath: 'inset(0% 0% 0% 0% round 16px)', duration: 0.28, ease: 'power2.out' }, 0);
    tl.fromTo(f1img, { scale: 1.25 }, { scale: 1, duration: 1 }, 0);
    tl.fromTo(f2, { autoAlpha: 0, yPercent: 60 }, { autoAlpha: 1, yPercent: 0, duration: 0.2, ease: 'power2.out' }, 0.18);
    tl.to(f2, { yPercent: -12, duration: 0.62 }, 0.38);
    tl.fromTo(f3, { autoAlpha: 0, scale: 0.6, rotation: -8 * lado }, { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.18, ease: 'back.out(1.6)' }, 0.3);
    tl.fromTo(cab, { autoAlpha: 0, x: 40 * lado }, { autoAlpha: 1, x: 0, duration: 0.14, ease: 'power2.out' }, 0.04);
    tl.fromTo(obj, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.14, ease: 'power2.out' }, 0.14);
    if (acoesT) tl.fromTo(acoesT, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.08 }, 0.26);
    itens.forEach((li, i) => {
      tl.fromTo(li, { autoAlpha: 0, x: 30 * lado }, { autoAlpha: 1, x: 0, duration: 0.1, ease: 'power2.out' }, 0.3 + i * (0.42 / itens.length));
    });
    // Respiro no fim: a cena completa fica parada antes de soltar
    tl.to({}, { duration: 0.15 });
    return () => { delete _eixosST[secao.id]; };
  });
}
// Atalhos dos cartões (#eixo-…): com a cena presa, o início dela ainda
// está vazio — rola até o ponto em que fotos e texto já apareceram
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#eixo-"]');
  const st = a && _eixosST[a.getAttribute('href').slice(1)];
  if (!st) return;
  e.preventDefault();
  window.scrollTo({ top: st.start + (st.end - st.start) * 0.8, behavior: 'smooth' });
});

// ── 9) Faixa com foto em parallax ───────────────────────────────
function montarFaixa(secao) {
  const img = secao.querySelector('img');
  gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
    gsap.fromTo(img, { yPercent: -8 }, {
      yPercent: 8, ease: 'none',
      scrollTrigger: { trigger: secao, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });
}

// ── 10) Cartilha com a foto da capa ─────────────────────────────
// .capa-cine: cena presa; a foto da capa recua do zoom, a faixa verde do
// título entra da esquerda (como na capa da cartilha) e o cartão sobe.
function montarCapa(secao) {
  const palco = secao.querySelector('.capa-palco');
  const foto = secao.querySelector('.capa-foto img');
  const faixa = secao.querySelector('.capa-faixa');
  const cartao = secao.querySelector('.capa-cartao');
  gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: secao,
        start: _cineTopo,
        end: () => '+=' + Math.round(window.innerHeight * (+secao.dataset.rolagem || 1.4)),
        pin: palco,
        scrub: 0.6,
      },
      defaults: { ease: 'none' },
    });
    tl.fromTo(foto, { scale: 1.35 }, { scale: 1, duration: 0.7, ease: 'power1.out' }, 0);
    tl.fromTo(faixa, { autoAlpha: 0, clipPath: 'inset(0% 100% 0% 0%)' }, { autoAlpha: 1, clipPath: 'inset(0% 0% 0% 0%)', duration: 0.25, ease: 'power2.out' }, 0.3);
    tl.fromTo(cartao, { autoAlpha: 0, y: 80 }, { autoAlpha: 1, y: 0, duration: 0.2, ease: 'power2.out' }, 0.55);
    tl.set({}, {}, 1);
  });
}

// ── 6) Trilha sonora ────────────────────────────────────────────
// Botão fixo no canto (criado aqui) liga/desliga a trilha em loop
// (assets/cinema/trilha.mp3: "Bright Horizons", instrumental gerada no
// Suno com 1:38 e alongada para 3:00 emendando compassos parecidos; o
// último compasso é misturado ao primeiro, então o loop não tem fim). Começa
// desligada: o navegador só deixa tocar som depois de um clique. Pausa
// quando a aba fica oculta e enquanto a apresentação (que tem narração
// própria) está aberta.
const TRILHA_VOLUME = 0.35;
const _TRILHA_TEXTOS = { 'cine.som_ligar': 'Ligar trilha sonora', 'cine.som_desligar': 'Desligar trilha sonora' };
function _trilhaTexto(chave) {
  const txt = t(chave);
  return txt === chave ? _TRILHA_TEXTOS[chave] : txt;
}

function montarTrilha() {
  // ?v=: muda a cada troca de trilha, pra o navegador não tocar a antiga do cache
  const audio = new Audio('assets/cinema/trilha.mp3?v=bright-horizons');
  audio.loop = true;
  audio.preload = 'none';
  audio.volume = 0;
  let ligada = false;

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'cine-som';
  botao.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/>' +
    '<path class="cine-som-ondas" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>' +
    '<path class="cine-som-mudo" d="m16 9 6 6M22 9l-6 6"/></svg>';
  document.body.appendChild(botao);

  function rotular() {
    botao.setAttribute('aria-pressed', ligada);
    const rotulo = _trilhaTexto(ligada ? 'cine.som_desligar' : 'cine.som_ligar');
    botao.setAttribute('aria-label', rotulo);
    botao.title = rotulo;
    botao.classList.toggle('ligada', ligada);
  }

  // Sobe ou desce o volume suavemente; pausa de fato só no silêncio
  function tocar() {
    audio.play().then(() => gsap.to(audio, { volume: TRILHA_VOLUME, duration: 1.5, overwrite: true }))
      .catch(() => { ligada = false; rotular(); });
  }
  function calar(duracao = 0.8) {
    gsap.to(audio, { volume: 0, duration: duracao, overwrite: true, onComplete: () => audio.pause() });
  }

  botao.addEventListener('click', () => {
    ligada = !ligada;
    rotular();
    if (ligada) tocar(); else calar();
  });
  document.addEventListener('visibilitychange', () => {
    if (!ligada) return;
    if (document.hidden) calar(0.3); else tocar();
  });

  // A apresentação tem narração: a trilha cala enquanto ela está aberta
  if (typeof abrirApresentacao === 'function') {
    const abrir = abrirApresentacao, fechar = fecharApresentacao;
    window.abrirApresentacao = () => { if (ligada) calar(0.3); abrir(); };
    window.fecharApresentacao = () => { fechar(); if (ligada) tocar(); };
  }

  document.addEventListener('idioma', rotular);
  rotular();
}

document.addEventListener('DOMContentLoaded', () => {
  montarTrilha();
  // Criadas de cima pra baixo, na ordem da página (recomendação do ScrollTrigger)
  document.querySelectorAll('.cine[data-cine], .flutua, .mapa-zoom, .eixo-cena, .faixa-cine, .capa-cine').forEach(s => {
    if (s.classList.contains('flutua')) montarFlutuantes(s);
    else if (s.classList.contains('mapa-zoom')) montarMapa(s);
    else if (s.classList.contains('eixo-cena')) montarEixos(s);
    else if (s.classList.contains('faixa-cine')) montarFaixa(s);
    else if (s.classList.contains('capa-cine')) montarCapa(s);
    else montarCinema(s);
  });
  montarRevela();
  montarPalavras();
  montarItens();
  // Fontes e header mudam a altura da página depois de carregar
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
});
// Troca de idioma muda o tamanho dos textos: recalcula as posições
document.addEventListener('idioma', () => ScrollTrigger.refresh());
