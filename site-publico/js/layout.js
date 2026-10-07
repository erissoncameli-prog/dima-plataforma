// ════════════════════════════════════════════════════════════════
// LAYOUT — header e rodapé compartilhados do site público
// Site próprio, separado de js/layout.js (sistema interno de gestão)
// Depende de js/i18n.js (t, htmlSeletorIdioma, traduzirPagina)
// ════════════════════════════════════════════════════════════════

const SITE_PAGINAS = [
  { id: 'inicio',     href: 'index.html' },
  { id: 'mapa',       href: 'mapa.html' },
  { id: 'resultados', href: 'resultados.html' },
  { id: 'financeiro', href: 'transparencia-financeira.html' },
  { id: 'tempo',      href: 'linha-do-tempo.html' },
  { id: 'produtos',   href: 'produtos.html' },
  { id: 'sobre',      href: 'sobre.html' },
];

function gerarHeaderSite(paginaAtiva) {
  const links = SITE_PAGINAS.map(p =>
    `<a href="${p.href}"${p.id === paginaAtiva ? ' class="ativo" aria-current="page"' : ''}>${t('nav.' + p.id)}</a>`
  ).join('');
  // Seletor de idioma aparece em dois lugares: no header (telas maiores) e
  // dentro do menu (celular, onde não cabe ao lado da marca) — o CSS
  // mostra só um de cada vez
  return `
    <div class="container">
      <a href="index.html" class="site-brand">
        <picture>
          <source srcset="assets/identidade/logo-horizontal-branca.svg" media="(prefers-color-scheme: dark)">
          <img src="assets/identidade/logo-horizontal.svg" alt="${t('marca.alt')}" width="219" height="46">
        </picture>
      </a>
      <nav class="site-nav">${links}${htmlSeletorIdioma('seletor-idioma-menu')}<a href="../index.html" class="site-nav-login">${t('nav.login')}</a></nav>
      ${htmlSeletorIdioma('seletor-idioma-header')}
      <a href="../index.html" class="site-login">${t('nav.login')}</a>
      <button class="site-nav-toggle" onclick="document.querySelector('.site-nav').classList.toggle('aberto')" aria-label="${t('nav.abrir_menu')}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>`;
}

function gerarFooterSite() {
  return `
    <div class="footer-grafismo" aria-hidden="true"></div>
    <div class="container">
      <!-- Barra de logos oficial do manual de identidade (ordem e proporções definidas pela designer) -->
      <div class="footer-logos">
        <picture>
          <source srcset="assets/identidade/barra-logos-branca.svg" media="(prefers-color-scheme: dark)">
          <img src="assets/identidade/barra-logos.svg" alt="${t('rodape.logos_alt')}" width="789" height="43" loading="lazy">
        </picture>
      </div>
      <div class="footer-linha">
        <p class="footer-texto">${t('rodape.texto')} <a href="assets/cartilha/cartilha-programa-resiliencia-socioambiental.pdf" class="footer-link" download>${t('rodape.cartilha')}</a></p>
        ${htmlSeletorIdioma('seletor-idioma-rodape')}
      </div>
    </div>`;
}

function montarPaginaEmConstrucao(nomePagina) {
  return `
    <div class="em-construcao">
      <span class="selo">${t('construcao.selo')}</span>
      <h1>${nomePagina}</h1>
      <p>${t('construcao.texto')}</p>
    </div>`;
}

function _montarHeaderRodape() {
  const headerSlot = document.getElementById('site-header-slot');
  const footerSlot = document.getElementById('site-footer-slot');
  if (headerSlot) headerSlot.innerHTML = gerarHeaderSite(headerSlot.dataset.pagina || '');
  if (footerSlot) footerSlot.innerHTML = gerarFooterSite();
  _ajustarMenu();
}

// Recolhe o menu no botão ☰ quando os links não cabem na linha do header.
// Mede com o menu aberto na linha (sem a classe) e decide; o tamanho dos
// rótulos muda com o idioma, então um @media fixo não serve pra todos.
function _ajustarMenu() {
  const header = document.querySelector('.site-header');
  const nav = header?.querySelector('.site-nav');
  if (!nav) return;
  header.classList.remove('menu-recolhido');
  if (nav.scrollWidth > nav.clientWidth + 1) header.classList.add('menu-recolhido');
}

document.addEventListener('DOMContentLoaded', () => {
  _montarHeaderRodape();
  traduzirPagina();
  const header = document.querySelector('.site-header');
  if (header && 'ResizeObserver' in window) {
    let largura = 0;
    // Só reage a mudança de largura (abrir o menu não deve remedir)
    new ResizeObserver(([e]) => {
      if (e.contentRect.width !== largura) { largura = e.contentRect.width; _ajustarMenu(); }
    }).observe(header);
  }
  // A fonte web muda a largura dos rótulos depois de carregar
  document.fonts?.ready.then(_ajustarMenu);
});
// Header e rodapé são montados com t(), então são refeitos na troca de idioma
document.addEventListener('idioma', _montarHeaderRodape);
