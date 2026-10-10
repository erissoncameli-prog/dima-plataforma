// ════════════════════════════════════════════════════════════════
// APRESENTAÇÃO — "Assistir apresentação" da página Sobre
// Motion design feito em HTML/CSS: uma linha do tempo de cenas, cada
// uma com duração própria. Uma cena por vez no palco; ao entrar, o HTML
// dela é recriado pra reiniciar as animações CSS (css/apresentacao.css).
// Textos por t() (js/i18n.js) — na troca de idioma a cena atual é refeita.
// Números de contagem: <span class="ap-num" data-alvo data-ini data-dur>,
// atualizados no mesmo laço que mede o tempo da cena (respeita a pausa).
// Narração (voz neural Francisca/Jenny/Dalia + a trilha "Bright Horizons"
// baixa por baixo): gerada fala por fala a partir do roteiro, então o início
// de cada cena é conhecido na montagem (AP_NARRACAO.inicios). Quando existe
// para o idioma atual, o próprio áudio vira o relógio das cenas. Sem narração
// no idioma, as cenas seguem o tempo fixo de AP_CENAS[].dur.
// Roteiro: docs/site-publico/.
// ════════════════════════════════════════════════════════════════

const AP_SEM_MOVIMENTO = window.matchMedia('(prefers-reduced-motion: reduce)');

// Segundo do áudio em que cada uma das 9 cenas começa: saem da montagem da
// narração (cada fala começa 0,3 s depois do início da cena, e a cena dura a
// fala + 0,8 s ou o tempo das suas animações, o que for maior). Ao gerar um
// áudio novo, copiar os inícios que o script imprime (passo a passo em
// docs/site-publico/roteiro-narracao-apresentacao.md). ?v= no arquivo: muda a
// cada narração nova, pra o navegador não tocar a antiga do cache.
const AP_NARRACAO = {
  pt: { arquivo: 'assets/apresentacao/narracao-pt.mp3?v=francisca', inicios: [0, 8.66, 16.02, 23.39, 31.4, 39.17, 49.99, 58.17, 65.44] },
  en: { arquivo: 'assets/apresentacao/narracao-en.mp3?v=francisca', inicios: [0, 8.37, 15.62, 22.48, 30.66, 37.71, 49.1, 56.25, 64.29] },
  es: { arquivo: 'assets/apresentacao/narracao-es.mp3?v=francisca', inicios: [0, 8.13, 15.21, 22.69, 31.78, 39.24, 51.1, 58.1, 65.99] },
};

// Logo com versão branca no tema escuro, igual ao resto do site
function _apPicture(claro, escuro, alt, classe) {
  return `<picture><source srcset="${escuro}" media="(prefers-color-scheme: dark)"><img class="${classe}" src="${claro}" alt="${alt}"></picture>`;
}
// Contador: anima de 0 até alvo entre ini e ini+dur segundos da cena
function _apNum(alvo, ini, dur, classe) {
  return `<span class="ap-num ${classe || ''}" data-alvo="${alvo}" data-ini="${ini}" data-dur="${dur || 1.6}">0</span>`;
}

// Parceiros na ordem da barra oficial (assets/identidade/barra-logos.svg),
// recortados um a um em assets/identidade/parceiros/ (e branca/ no tema escuro)
const AP_PARCEIROS = ['canada', 'onu', 'fundo', 'cal', 'unesco', 'resiliencia', 'sema', 'acre'];

// Desafios da cena 4 (chave apres.d_<k>), cada um com a foto em
// assets/apresentacao/desafios/ — carregadas ao abrir a apresentação
const AP_DESAFIOS = ['queimadas', 'enchentes', 'secas', 'desmatamento', 'clima'];
function _apFotoDesafio(k) { return `assets/apresentacao/desafios/desafio-${k}.webp?v=2`; }
const AP_FOTO_RESILIENCIA = 'assets/cinema/marca/marca-paisagem-g.webp';
const AP_FOTO_MORADORES = 'assets/apresentacao/moradores.webp';

const AP_CENAS = [
  { nome: 'apres.n1', dur: 6500, html: () => `
      <div class="ap-simbolo" aria-hidden="true">
        <img class="folhas ap-el ap-cai" style="--d:.2s" src="assets/identidade/folhas.svg" alt="">
        <img class="ap-el ap-esq" style="--d:.7s" src="assets/identidade/curva-azul.svg" alt="">
        <img class="ap-el ap-dir" style="--d:1s" src="assets/identidade/curva-laranja.svg" alt="">
      </div>
      <div class="ap-titulo ap-el ap-sobe" style="--d:1.6s">${t('apres.c1_titulo')}</div>
      <div class="ap-sub ap-el ap-sobe" style="--d:2.1s">${t('apres.c1_sub')}</div>
      <div class="ap-parceiros-cai" role="img" aria-label="${t('rodape.logos_alt')}">
        ${AP_PARCEIROS.map((p, i) => `<span class="ap-el ap-gira-cai" style="--d:${(1.3 + i * 0.16).toFixed(2)}s;--giro:${i % 2 ? 1 : -1}">${_apPicture(`assets/identidade/parceiros/${p}.webp`, `assets/identidade/parceiros/branca/${p}.webp`, '', 'ap-parceiro ap-parceiro-' + p)}</span>`).join('')}
      </div>` },

  // Cena 2: o mapa da página Sobre de fundo (zoom Brasil → Acre → Rio Branco
  // → APAs entre data-ini e data-ini+data-dur segundos) e os dados na frente
  { nome: 'apres.n2', dur: 6500, html: () => `
      <div class="ap-mapa-cena">
        <div class="ap-mapa mapa-svg" data-ini=".2" data-dur="4" data-volta-ini="4.7" data-volta-dur="1.4" aria-hidden="true"></div>
        <div class="ap-mapa-texto">
          <div class="ap-mapa-cartao ap-el ap-sobe" style="--d:.1s">
            <div class="ap-titulo">${t('apres.c2_titulo')}</div>
            <div class="ap-sub">${t('apres.c2_sub')}</div>
          </div>
          <div class="ap-apas">
            <div class="ap-apa ap-el ap-pop" style="--d:3.9s">
              <div class="ap-apa-nome">${t('apres.apa_sf')}</div>
              ${_apNum(30004, 4.1, 1.5, 'ap-destaque-verde')}<div class="ap-unid">${t('apres.hectares')}</div>
            </div>
            <div class="ap-apa ap-el ap-pop" style="--d:4.3s">
              <div class="ap-apa-nome">${t('apres.apa_la')}</div>
              ${_apNum(5208, 4.5, 1.4, 'ap-destaque-azul')}<div class="ap-unid">${t('apres.hectares')}</div>
            </div>
          </div>
        </div>
      </div>` },

  // Cena 3: foto dos moradores (EIXO TRANSVERSAL, dança Huni Kuin "Força
  // feminina": mulheres e crianças de mãos dadas, mata ao fundo) ao lado do
  // número; mesmo layout da cena 5 e os tempos de antes
  { nome: 'apres.n3', dur: 5000, html: () => `
      <div class="ap-dupla">
        <div class="ap-dupla-foto ap-el ap-revela" style="--d:.1s"><img src="${AP_FOTO_MORADORES}" alt=""></div>
        <div class="ap-dupla-texto">
          <div class="ap-sub ap-el ap-sobe" style="--d:.1s">${t('apres.c3_pre')}</div>
          <div class="ap-el ap-pop" style="--d:.4s">${_apNum(11329, .5, 1.8, 'ap-destaque-laranja')}</div>
          <div class="ap-titulo ap-el ap-sobe" style="--d:.9s">${t('apres.c3_unid')}</div>
          <div class="ap-sub ap-el ap-sobe" style="--d:1.6s">${t('apres.c3_sub')}</div>
        </div>
      </div>` },

  // Cena 4: cada desafio entra com a sua foto (FOTOS ILUSTRATIVAS da
  // comunicação), no mesmo ritmo das etiquetas de antes — a cena não mudou
  // de duração. A foto aproxima devagar enquanto a cena dura (.ap-desafio img)
  { nome: 'apres.n4', dur: 6000, html: () => `
      <div class="ap-titulo ap-el ap-sobe" style="--d:.1s">${t('apres.c4_titulo')}</div>
      <div class="ap-desafios">
        ${AP_DESAFIOS.map((k, i) =>
          `<figure class="ap-desafio ap-el ap-pop" style="--d:${(0.7 + i * 0.45).toFixed(2)}s"><span class="ap-desafio-foto"><img src="${_apFotoDesafio(k)}" alt=""></span><figcaption class="ap-chip">${t('apres.d_' + k)}</figcaption></figure>`).join('')}
      </div>` },

  // Cena 5: a foto da pasta RESILIÊNCIA (casas cercadas pela floresta, a
  // mesma do bloco "Por trás da marca") ao lado da definição; tempos de antes
  { nome: 'apres.n5', dur: 6000, html: () => `
      <div class="ap-dupla">
        <div class="ap-dupla-foto ap-el ap-revela" style="--d:.1s"><img src="${AP_FOTO_RESILIENCIA}" alt=""></div>
        <div class="ap-dupla-texto">
          <div class="ap-sub ap-el ap-sobe" style="--d:.1s">${t('apres.c5_pre')}</div>
          <div class="ap-verbos">
            <span class="ap-verbo ap-destaque-verde ap-el ap-marca" style="--d:.7s">${t('apres.v_enfrentar')}</span>
            <span class="ap-verbo ap-destaque-azul ap-el ap-marca" style="--d:1.4s">${t('apres.v_adaptar')}</span>
            <span class="ap-verbo ap-destaque-laranja ap-el ap-marca" style="--d:2.1s">${t('apres.v_recuperar')}</span>
          </div>
          <div class="ap-sub ap-el ap-sobe" style="--d:3s">${t('apres.c5_sub')}</div>
        </div>
      </div>` },

  { nome: 'apres.n6', dur: 7500, html: () => `
      <div class="ap-titulo ap-el ap-sobe" style="--d:.1s">${t('apres.c6_titulo')}</div>
      <div class="ap-eixos">
        ${[['e_gov', 'eixo-governanca.svg'], ['e_rest', 'folhas.svg'], ['e_bio', 'eixo-bioeconomia.svg'], ['e_hid', 'eixo-seguranca-hidrica.svg']].map(([k, ic], i) =>
          `<div class="ap-eixo ap-el ap-pop" style="--d:${(0.7 + i * 0.5).toFixed(2)}s"><img src="assets/identidade/${ic}" alt="">${t('apres.' + k)}</div>`).join('')}
      </div>
      <div class="ap-transversal ap-el ap-sobe" style="--d:3.2s"><img src="assets/identidade/eixo-igualdade-genero.svg" alt="">${t('apres.e_transv')}</div>` },

  { nome: 'apres.n7', dur: 7000, html: () => `
      <div class="ap-titulo ap-el ap-sobe" style="--d:.1s">${t('apres.c7_titulo')}</div>
      <div class="ap-ods" aria-hidden="true">
        ${['01', '02', '03', '04', '05', '06', '08', '10', '11', '12', '13', '15', '16', '17', '18'].map((n, i) =>
          // ODS 18 (igualdade étnico-racial) veio da comunicação em SVG, como na cartilha final
          `<img class="ap-el ap-pop" style="--d:${(0.5 + i * 0.08).toFixed(2)}s" src="assets/ods/ods-${n}.${n === '18' ? 'svg' : 'webp'}" alt="">`).join('')}
      </div>
      <div class="ap-metricas">
        <div class="ap-metrica ap-el ap-sobe" style="--d:2s">${_apNum(15, 2.1, 1, 'ap-destaque-azul')}<span class="ap-unid">${t('apres.c7_ods')}</span></div>
        <div class="ap-metrica ap-el ap-sobe" style="--d:2.6s">${_apNum(12, 2.7, 1, 'ap-destaque-verde')}<span class="ap-unid">${t('apres.c7_km')}</span></div>
      </div>` },

  { nome: 'apres.n8', dur: 5500, html: () => `
      <div class="ap-titulo ap-el ap-sobe" style="--d:.1s">${t('apres.c8_titulo')}</div>
      <div class="ap-parceiros ap-el ap-revela" style="--d:.9s">
        ${_apPicture('assets/identidade/barra-logos.svg', 'assets/identidade/barra-logos-branca.svg', t('rodape.logos_alt'), '')}
      </div>` },

  { nome: 'apres.n9', dur: 7000, final: true, html: () => `
      <div class="ap-el ap-pop" style="--d:.1s">${_apPicture('assets/identidade/logo-vertical.svg', 'assets/identidade/logo-vertical-branca.svg', t('marca.alt'), 'ap-logo-final')}</div>
      <div class="ap-titulo ap-el ap-sobe" style="--d:.8s">${t('apres.c9_titulo')}</div>
      <div class="ap-sub ap-el ap-sobe" style="--d:1.3s">${t('apres.c9_sub')}</div>
      <div class="ap-acoes ap-el ap-sobe" style="--d:2s">
        <button type="button" class="ap-acao ap-acao-primaria" onclick="_apIrPara(0)">↺ ${t('apres.reiniciar')}</button>
        <a class="ap-acao ap-acao-secundaria" href="mapa.html">${t('apres.explorar_mapa')}</a>
      </div>` },
];

const _ap = { aberto: false, idx: 0, decorrido: 0, ultimo: 0, pausado: false, raf: 0, origem: null, audio: null, mudo: false,
  continuo: false, idiomaOriginal: null, trocando: false };

// Lembra se a pessoa desligou o som (só neste navegador)
try { _ap.mudo = localStorage.getItem('site_apres_mudo') === '1'; } catch (e) { /* sem armazenamento */ }

function _apNarracao() { return AP_NARRACAO[idiomaAtual] || null; }

// Duração da cena em ms: com narração, até o início da próxima (a última
// vai até o fim do áudio); sem narração, o tempo fixo da cena
function _apDuracao(i) {
  const n = _apNarracao();
  if (!n || !_ap.audio) return AP_CENAS[i].dur;
  const fim = i + 1 < n.inicios.length ? n.inicios[i + 1] : (_ap.audio.duration || n.inicios[i] + AP_CENAS[i].dur / 1000);
  return (fim - n.inicios[i]) * 1000;
}

// Prepara o <audio> do idioma atual (ou nenhum, se não houver narração)
function _apPrepararAudio() {
  if (_ap.audio) { _ap.audio.pause(); _ap.audio = null; }
  const n = _apNarracao();
  if (!n) return;
  const a = new Audio(n.arquivo);
  a.preload = 'auto';
  a.muted = _ap.mudo;
  // Arquivo que não carrega: segue sem som, no tempo fixo das cenas
  a.addEventListener('error', () => { if (_ap.audio === a) { _ap.audio = null; _apAtualizarControles(); } });
  _ap.audio = a;
}

function _apTocarAudio() {
  if (!_ap.audio || _ap.pausado) return;
  const a = _ap.audio;
  a.play().catch(e => {
    // Navegador recusou tocar: larga o áudio pra apresentação não ficar
    // parada esperando o relógio dele — segue sem som, no tempo fixo.
    // (AbortError é só uma busca interrompida por outra, não recusa)
    if (e.name !== 'AbortError' && _ap.audio === a) { _ap.audio = null; _apAtualizarControles(); }
  });
}

function _apAlternarSom() {
  _ap.mudo = !_ap.mudo;
  try { localStorage.setItem('site_apres_mudo', _ap.mudo ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
  if (_ap.audio) _ap.audio.muted = _ap.mudo;
  _apAtualizarControles();
}

const _AP_ICONES = {
  pausar: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  tocar: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
  reiniciar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  fechar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  som: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  mudo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
};

function _apMontarJanela() {
  let fundo = document.getElementById('ap-fundo');
  if (!fundo) {
    fundo = document.createElement('div');
    fundo.id = 'ap-fundo';
    fundo.className = 'ap-fundo';
    fundo.hidden = true;
    fundo.addEventListener('click', e => { if (e.target === fundo) fecharApresentacao(); });
    fundo.addEventListener('keydown', _apTeclado);
    document.body.appendChild(fundo);
  }
  fundo.innerHTML = `
    <div class="ap-janela" role="dialog" aria-modal="true" aria-label="${t('apres.titulo')}">
      <div class="ap-progresso">
        ${AP_CENAS.map((c, i) => `<button type="button" class="ap-seg" data-i="${i}" aria-label="${t('apres.cena', { n: i + 1, total: AP_CENAS.length, nome: t(c.nome) })}" onclick="_apIrPara(${i})"><span></span></button>`).join('')}
      </div>
      <div class="ap-palco" id="ap-palco" aria-live="polite">
        <div class="ap-selo-idioma" aria-hidden="true">${AP_CICLO.map(l => `<span${l === idiomaAtual ? ' class="atual"' : ''}>${IDIOMAS[l].sigla}</span>`).join('')}</div>
        <div class="ap-legenda" id="ap-legenda"></div>
      </div>
      <div class="ap-controles">
        <button type="button" class="ap-btn" id="ap-pausa" onclick="_apAlternarPausa()"></button>
        <button type="button" class="ap-btn" onclick="_apIrPara(0)" aria-label="${t('apres.reiniciar')}" title="${t('apres.reiniciar')}">${_AP_ICONES.reiniciar}</button>
        <button type="button" class="ap-btn" id="ap-som" onclick="_apAlternarSom()" hidden></button>
        <span class="ap-rotulo" id="ap-rotulo"></span>
        <button type="button" class="ap-btn" onclick="fecharApresentacao()" aria-label="${t('apres.fechar')}" title="${t('apres.fechar')}">${_AP_ICONES.fechar}</button>
      </div>
    </div>`;
  return fundo;
}

function _apAtualizarControles() {
  const btn = document.getElementById('ap-pausa');
  if (btn) {
    const rot = t(_ap.pausado ? 'apres.continuar' : 'apres.pausar');
    btn.innerHTML = _ap.pausado ? _AP_ICONES.tocar : _AP_ICONES.pausar;
    btn.setAttribute('aria-label', rot);
    btn.title = rot;
  }
  const som = document.getElementById('ap-som');
  if (som) {
    // Botão de som só aparece quando há narração no idioma atual
    som.hidden = !_ap.audio;
    const rot = t(_ap.mudo ? 'apres.ligar_som' : 'apres.desligar_som');
    som.innerHTML = _ap.mudo ? _AP_ICONES.mudo : _AP_ICONES.som;
    som.setAttribute('aria-label', rot);
    som.title = rot;
  }
  document.getElementById('ap-palco')?.classList.toggle('pausado', _ap.pausado);
  const rotulo = document.getElementById('ap-rotulo');
  if (rotulo) rotulo.textContent = `${_ap.idx + 1} / ${AP_CENAS.length} · ${t(AP_CENAS[_ap.idx].nome)}`;
  document.querySelectorAll('.ap-seg').forEach((s, i) => {
    s.classList.toggle('feita', i < _ap.idx);
    s.toggleAttribute('aria-current', i === _ap.idx);
    if (i !== _ap.idx) s.querySelector('span').style.width = '';
  });
}

// Coloca a cena idx no palco (a anterior sai com fade). seguirAudio:
// a troca veio do próprio áudio avançando, então não reposiciona a faixa
function _apIrPara(idx, seguirAudio) {
  const palco = document.getElementById('ap-palco');
  if (!palco) return;
  _ap.idx = Math.max(0, Math.min(idx, AP_CENAS.length - 1));
  _ap.decorrido = 0;
  // No fim, "Assistir de novo" volta a tocar mesmo se estava pausado
  if (idx === 0) _ap.pausado = false;
  const n = _apNarracao();
  if (_ap.audio && n && !seguirAudio) {
    _ap.audio.currentTime = n.inicios[_ap.idx];
    _apTocarAudio();
  }
  palco.querySelectorAll('.ap-cena').forEach(c => { c.classList.add('saindo'); setTimeout(() => c.remove(), 450); });
  const cena = document.createElement('div');
  cena.className = 'ap-cena';
  cena.innerHTML = AP_CENAS[_ap.idx].html();
  palco.appendChild(cena);
  // Um quadro depois, pra animação começar do zero
  requestAnimationFrame(() => cena.classList.add('ativa'));
  _apMontarMapa(cena);
  const legenda = document.getElementById('ap-legenda');
  if (legenda) legenda.textContent = t('apres.fala' + (_ap.idx + 1));
  _apAtualizarContadores(cena, AP_SEM_MOVIMENTO.matches ? Infinity : 0);
  _apAtualizarControles();
}

// Mapa da cena (.ap-mapa): usa o SVG e o zoom da página Sobre (js/cinema.js).
// Sem o cinema.js na página (ex.: sobre-antigo.html), a cena fica sem mapa.
function _apMontarMapa(cena) {
  const el = cena.querySelector('.ap-mapa');
  if (!el || typeof _mapaPreparar !== 'function') return;
  _mapaSvg().then(txt => {
    if (!el.isConnected) return;
    el.innerHTML = txt;
    // Palco deitado: APAs à direita do texto; em pé (celular): mapa em cima
    el._mapa = _mapaPreparar(el.querySelector('svg'), (cw, ch) => (cw / ch < 1 ? 'cima' : 'direita'));
    _apAtualizarContadores(cena, AP_SEM_MOVIMENTO.matches ? Infinity : _ap.decorrido / 1000);
  });
}

function _apAtualizarContadores(cena, segundos) {
  // O zoom do mapa anda no mesmo relógio dos números (respeita pausa e narração)
  cena.querySelectorAll('.ap-mapa').forEach(el => {
    if (!el._mapa) return;
    const p = Math.max(0, Math.min(1, (segundos - +el.dataset.ini) / +el.dataset.dur));
    // data-volta-*: depois das APAs, recua até o mapa do Acre inteiro
    const volta = el.dataset.voltaIni ? Math.max(0, Math.min(1, (segundos - +el.dataset.voltaIni) / +el.dataset.voltaDur)) : 0;
    el._mapa.aplicar(p, volta);
  });
  cena.querySelectorAll('.ap-num').forEach(el => {
    const alvo = +el.dataset.alvo, ini = +el.dataset.ini, dur = +el.dataset.dur;
    const p = Math.max(0, Math.min(1, (segundos - ini) / dur));
    const suave = 1 - Math.pow(1 - p, 3);
    el.textContent = fmtNum(Math.round(alvo * suave));
  });
}

// Laço único: conta o tempo da cena (parado na pausa), anima contadores,
// preenche o segmento da barra e passa pra próxima cena quando acaba
function _apQuadro(agora) {
  if (!_ap.aberto) return;
  const delta = _ap.ultimo ? agora - _ap.ultimo : 0;
  _ap.ultimo = agora;
  const cenaCfg = AP_CENAS[_ap.idx];
  const dur = _apDuracao(_ap.idx);
  const n = _apNarracao();
  // Áudio parado sem ninguém ter pausado (busca interrompida, aba voltando
  // do segundo plano…): tenta tocar de novo a cada 1,5 s. Se o navegador
  // recusar, _apTocarAudio larga o áudio e as cenas seguem no tempo fixo —
  // no modo contínuo a apresentação nunca fica travada esperando o áudio.
  if (_ap.audio && n && _ap.audio.paused && !_ap.audio.ended && !_ap.pausado) {
    _ap.audioParado = (_ap.audioParado || 0) + delta;
    if (_ap.audioParado > 1500) { _ap.audioParado = 0; _apTocarAudio(); }
  } else _ap.audioParado = 0;
  if (_ap.audio && n && _ap.audio.ended) {
    // Áudio acabou: a última cena terminou. Sem isso o tempo fica parado uma
    // fração antes do fim (o último quadro lido é anterior ao "ended") e o
    // modo contínuo nunca passava para o próximo idioma
    _ap.decorrido = dur;
  } else if (_ap.audio && n && !_ap.audio.paused) {
    // Com narração tocando, o tempo da cena é o do áudio
    _ap.decorrido = Math.max(0, Math.min((_ap.audio.currentTime - n.inicios[_ap.idx]) * 1000, dur));
  } else if (!_ap.pausado && !(_ap.audio && n)) {
    _ap.decorrido = Math.min(_ap.decorrido + delta, dur);
  }
  const cena = document.querySelector('#ap-palco .ap-cena:not(.saindo)');
  if (cena && !AP_SEM_MOVIMENTO.matches) _apAtualizarContadores(cena, _ap.decorrido / 1000);
  const seg = document.querySelector(`.ap-seg[data-i="${_ap.idx}"] span`);
  if (seg) seg.style.width = (_ap.decorrido / dur * 100) + '%';
  // A última cena fica parada esperando o "Assistir de novo" — no modo
  // contínuo, passa para o próximo idioma e recomeça
  if (!_ap.pausado && _ap.decorrido >= dur) {
    if (!cenaCfg.final) _apIrPara(_ap.idx + 1, true);
    else if (_ap.continuo) _apProximoIdioma();
  }
  _ap.raf = requestAnimationFrame(_apQuadro);
}

function _apAlternarPausa() {
  _ap.pausado = !_ap.pausado;
  if (_ap.audio) { if (_ap.pausado) _ap.audio.pause(); else _apTocarAudio(); }
  _apAtualizarControles();
}

function _apTeclado(e) {
  if (e.key === 'Escape') { e.preventDefault(); fecharApresentacao(); }
  else if (e.key === ' ' && !e.target.closest('button, a')) { e.preventDefault(); _apAlternarPausa(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); _apIrPara(_ap.idx + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); _apIrPara(_ap.idx - 1); }
  else if (e.key === 'Tab') {
    // Mantém o foco dentro da janela enquanto ela está aberta
    const focaveis = [...document.querySelectorAll('#ap-fundo button, #ap-fundo a[href]')];
    const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  }
}

function abrirApresentacao() {
  _ap.origem = document.activeElement;
  const fundo = _apMontarJanela();
  fundo.hidden = false;
  document.body.style.overflow = 'hidden';
  _ap.aberto = true;
  _ap.pausado = false;
  _ap.ultimo = 0;
  // Fotos das cenas 3, 4 e 5 já no cache quando elas chegarem (senão entram vazias)
  [AP_FOTO_MORADORES, ...AP_DESAFIOS.map(_apFotoDesafio), AP_FOTO_RESILIENCIA].forEach(src => { new Image().src = src; });
  // Abrir é um clique da pessoa, então o navegador deixa tocar com som
  _apPrepararAudio();
  _apIrPara(0);
  document.getElementById('ap-pausa').focus();
  cancelAnimationFrame(_ap.raf);
  _ap.raf = requestAnimationFrame(_apQuadro);
}

function fecharApresentacao() {
  if (_ap.continuo) _apSairContinuo();
  _ap.aberto = false;
  cancelAnimationFrame(_ap.raf);
  if (_ap.audio) { _ap.audio.pause(); _ap.audio = null; }
  const fundo = document.getElementById('ap-fundo');
  if (fundo) { fundo.hidden = true; fundo.innerHTML = ''; }
  document.body.style.overflow = '';
  _ap.origem?.focus();
}

// ── Modo contínuo (tela da sala / projetor) ─────────────────────
// sobre.html?modo=continuo (ou Shift + clique em "Assistir apresentação"):
// tela cheia, controles e cursor escondidos (voltam ao mexer o mouse),
// legenda da fala e selo do idioma; no fim de cada volta troca o idioma
// PT → EN → ES → PT… sem parar. Esc sai e devolve o idioma de antes.
// O navegador só toca som depois de um clique: sem ele, aparece o botão
// "Iniciar". No Chrome em modo quiosque com
// --autoplay-policy=no-user-gesture-required, começa sozinho.
const AP_CICLO = ['pt', 'en', 'es'];
let _apOcioso = 0;

function _apIniciarContinuo() {
  document.getElementById('ap-inicio')?.remove();
  _ap.continuo = true;
  _ap.idiomaOriginal = idiomaAtual;
  document.body.classList.add('ap-modo-continuo');
  document.documentElement.requestFullscreen?.().catch(() => { /* quiosque já é tela cheia */ });
  _ap.idx = 0;
  if (idiomaAtual !== 'pt') mudarIdioma('pt');
  abrirApresentacao();
  _apMexeuMouse();
}

function _apProximoIdioma() {
  if (_ap.trocando) return;
  _ap.trocando = true;
  const fundo = document.getElementById('ap-fundo');
  fundo?.classList.add('trocando');
  // Escurece, troca o idioma (o ouvinte de 'idioma' refaz a janela na cena 0) e clareia
  setTimeout(() => {
    _ap.idx = 0;
    mudarIdioma(AP_CICLO[(AP_CICLO.indexOf(idiomaAtual) + 1) % AP_CICLO.length]);
    document.getElementById('ap-fundo')?.classList.remove('trocando');
    _ap.trocando = false;
  }, 700);
}

function _apSairContinuo() {
  _ap.continuo = false;
  document.body.classList.remove('ap-modo-continuo', 'ap-mouse');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  const original = _ap.idiomaOriginal;
  _ap.idiomaOriginal = null;
  if (original && original !== idiomaAtual) setTimeout(() => mudarIdioma(original), 0);
}

// Controles e cursor aparecem ao mexer o mouse e somem depois de 2,5 s parado
function _apMexeuMouse() {
  if (!_ap.continuo) return;
  document.body.classList.add('ap-mouse');
  clearTimeout(_apOcioso);
  _apOcioso = setTimeout(() => document.body.classList.remove('ap-mouse'), 2500);
}
document.addEventListener('mousemove', _apMexeuMouse);

// Tela de início do modo contínuo: tenta começar com som sozinho (quiosque);
// se o navegador recusar, espera o clique em "Iniciar"
function _apTelaContinuo() {
  const teste = new Audio(AP_NARRACAO.pt.arquivo);
  teste.play().then(() => { teste.pause(); _apIniciarContinuo(); }).catch(() => {
    const tela = document.createElement('div');
    tela.id = 'ap-inicio';
    tela.className = 'ap-inicio';
    tela.innerHTML = `
      <img src="assets/identidade/logo-vertical-branca.svg" alt="${t('marca.alt')}">
      <button type="button" class="ap-inicio-btn" onclick="_apIniciarContinuo()">${_AP_ICONES.tocar}<span>${t('apres.iniciar')}</span></button>
      <p>${t('apres.continuo_dica')}</p>`;
    document.body.appendChild(tela);
    tela.querySelector('button').focus();
  });
}
document.addEventListener('DOMContentLoaded', () => {
  if (new URLSearchParams(location.search).get('modo') === 'continuo') _apTelaContinuo();
});

// Troca de idioma com a apresentação aberta: refaz janela e cena atual
document.addEventListener('idioma', () => {
  if (!_ap.aberto) return;
  const idx = _ap.idx;
  _apPrepararAudio();
  _apMontarJanela();
  _apIrPara(idx);
});
