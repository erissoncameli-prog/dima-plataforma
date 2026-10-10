// ── Administração · utilitários comuns ──────────────────────────────────
// Usuários, Dados do sistema, Armazenamento e ROPA (css/administracao.css, prefixo ad-).
// adIc(nome) = ícone SVG (sem emoji); adSeletorTema() = Claro/Escuro no topo (diag_tema);
// adAbrir/adFechar = pilha de janelas .ad-ov (Esc fecha a de cima, Tab preso, foco volta);
// adConfirmar({...}) = confirmação em janela própria (no lugar do confirm()), devolve Promise<boolean>.

const AD_IC = {
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  escudo: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  lapis: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  olhoX: '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/>',
  copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  dado: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/><circle cx="15.5" cy="8.5" r="1.2"/><circle cx="8.5" cy="15.5" r="1.2"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  lixo: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  hist: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  predio: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/>',
  contrato: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/>',
  pacote: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  moeda: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
  aviao: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  campo: '<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M9 20v-6h6v6"/>',
  frasco: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
  graf: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  imagem: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m22 8-6 4 6 4z"/>',
  alca: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  trocar: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  salvar: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  nuvem: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z"/>',
  banco: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  pasta: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
  tabela: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  imprimir: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  globo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  paleta: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c1.7 0 2-1.3 2-2 0-.6-.3-1-.6-1.4-.3-.3-.5-.7-.5-1.2 0-1 .8-1.6 1.7-1.6H17a5 5 0 0 0 5-5c0-4.4-4.5-8.8-10-8.8z"/>',
  play: '<path d="m6 4 14 8-14 8z"/>',
  cv: '<path d="m6 9 6 6 6-6"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
function adIc(n, cls) { return '<svg class="ad-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (AD_IC[n] || '') + '</svg>'; }
function adTrocarIcones(raiz) { (raiz || document).querySelectorAll('i[data-ic]').forEach(e => { e.outerHTML = adIc(e.dataset.ic, e.dataset.cls || 'p'); }); }
adTrocarIcones();

// Tema claro/escuro (componente .dgm-tema da mesa)
function adSeletorTema() {
  const tb = document.querySelector('.topbar'); if (!tb || tb.querySelector('.dgm-tema') || typeof DiagTema === 'undefined') return;
  const d = document.createElement('div');
  d.className = 'dgm-tema'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Tema');
  d.innerHTML = [['claro', 'sol', 'Claro'], ['escuro', 'lua', 'Escuro']].map(x =>
    `<button type="button" data-tema="${x[0]}" aria-pressed="${DiagTema.atual() === x[0]}">${adIc(x[1])}${x[2]}</button>`).join('');
  const bc = tb.querySelector('.topbar-breadcrumb');
  if (bc) bc.parentNode.insertBefore(d, bc); else tb.appendChild(d);
  d.addEventListener('click', ev => {
    const b = ev.target.closest('[data-tema]'); if (!b) return;
    DiagTema.definir(b.dataset.tema);
    d.querySelectorAll('[data-tema]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
}

// ── Janelas: pilha, foco, Esc, Tab ──────────────────────────────────────
const AD_FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const adPilha = [];
const AD_FECHAR = {}; // id → função de fechar própria (ex.: pede confirmação)
function adAbrir(id, alvo) {
  const el = document.getElementById(id); if (!el) return;
  if (!el.classList.contains('aberto')) { adPilha.push({ id, volta: document.activeElement }); el.classList.add('aberto'); }
  requestAnimationFrame(() => {
    const f = (alvo && document.getElementById(alvo)) || el.querySelector('.modal-close') || el.querySelector(AD_FOCAVEIS);
    if (f) f.focus({ preventScroll: true });
  });
}
function adFechar(id) {
  const el = document.getElementById(id); if (!el) return;
  el.classList.remove('aberto');
  const k = adPilha.findIndex(x => x.id === id);
  if (k >= 0) { const { volta } = adPilha.splice(k, 1)[0]; if (volta && document.contains(volta)) volta.focus({ preventScroll: true }); }
}
function adFecharTopo(id) { (AD_FECHAR[id] || (() => adFechar(id)))(); }
document.addEventListener('keydown', e => {
  const topo = adPilha[adPilha.length - 1]; if (!topo) return;
  const el = document.getElementById(topo.id);
  if (e.key === 'Escape') { e.preventDefault(); adFecharTopo(topo.id); }
  else if (e.key === 'Tab') {
    const f = [...el.querySelectorAll(AD_FOCAVEIS)].filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const pri = f[0], ult = f[f.length - 1];
    if (!el.contains(document.activeElement)) { e.preventDefault(); pri.focus(); }
    else if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
    else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
  }
});
document.addEventListener('click', e => {
  const ov = e.target.classList && e.target.classList.contains('ad-ov') && e.target.classList.contains('aberto') ? e.target : null;
  if (ov && ov.id && ov.dataset.fundoFecha !== 'nao') adFecharTopo(ov.id);
});

// ── Confirmação em janela própria ───────────────────────────────────────
let _adConfResolve = null;
function adConfirmar({ titulo, texto, ok = 'Confirmar', perigo = false }) {
  let ov = document.getElementById('ad-conf');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'modal-overlay ad-ov'; ov.id = 'ad-conf';
    ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'ad-conf-tit');
    ov.innerHTML = `<div class="modal estreito">
      <div class="modal-header"><div class="modal-title" id="ad-conf-tit"></div>
        <button type="button" class="modal-close" aria-label="Fechar" data-conf="0">${adIc('x', 'p')}</button></div>
      <div class="modal-body"><p class="ad-dica" id="ad-conf-txt" style="margin:0"></p></div>
      <div class="modal-footer"><span class="ad-sp"></span>
        <button type="button" class="btn btn-secondary" data-conf="0">Cancelar</button>
        <button type="button" class="btn" id="ad-conf-ok" data-conf="1"></button></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { const b = e.target.closest('[data-conf]'); if (b) _adConfFim(b.dataset.conf === '1'); });
    AD_FECHAR['ad-conf'] = () => _adConfFim(false);
  }
  ov.querySelector('#ad-conf-tit').textContent = titulo;
  ov.querySelector('#ad-conf-txt').textContent = texto;
  const b = ov.querySelector('#ad-conf-ok');
  b.textContent = ok; b.className = 'btn ' + (perigo ? 'btn-danger' : 'btn-primary');
  if (_adConfResolve) _adConfResolve(false);
  return new Promise(res => { _adConfResolve = res; adAbrir('ad-conf', 'ad-conf-ok'); });
}
function _adConfFim(v) {
  adFechar('ad-conf');
  const r = _adConfResolve; _adConfResolve = null;
  if (r) r(v);
}
