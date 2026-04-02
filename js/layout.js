// ── DIMA · Layout compartilhado ──────────────────────────────

// Injetar sidebar.css se ainda não foi carregado
(function(){
  if (!document.querySelector('link[href*="sidebar.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '../css/sidebar.css';
    document.head.appendChild(link);
  }
})();

function gerarLayout(tituloPagina, paginaAtiva) {
  const navItems = [
    { id: 'dashboard',    icone: '⊞', href: 'dashboard.html',    perfis: null },
    { id: 'atividades',   icone: '◈', href: 'atividades.html',   perfis: null },
    { id: 'tdrs',         icone: '◧', href: 'tdrs.html',         perfis: null },
    { id: 'matriz',       icone: '◎', href: 'matriz.html',       perfis: null },
    { id: 'financeiro',   icone: '◉', href: 'financeiro.html',   perfis: ['super_admin','coordenacao','financeiro'] },
    { id: 'contratos',    icone: '◪', href: 'contratos.html',    perfis: ['super_admin','coordenacao','financeiro'] },
    { id: 'fornecedores', icone: '◫', href: 'fornecedores.html', perfis: ['super_admin','coordenacao','financeiro','tecnico'] },
    { id: 'produtos',     icone: '◈', href: 'produtos.html',     perfis: ['super_admin','coordenacao','tecnico'] },
    { id: 'viagens',      icone: '✈', href: 'viagens.html',      perfis: ['super_admin','coordenacao','financeiro'] },
    { id: 'usuarios',     icone: '◍', href: 'usuarios.html',     perfis: ['super_admin'] },
  ];

  const u = appState.usuario;
  const iniciais = u?.nome_completo?.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase() || 'US';

  const navHtml = navItems.map(item => {
    if (item.perfis && !item.perfis.includes(appState.perfil)) return '';
    const ativo = paginaAtiva === item.id ? 'ativo' : '';
    return `<a class="nav-item ${ativo}" href="${item.href}">
      <span style="font-size:14px">${item.icone}</span>
      <span>${t('nav', item.id)}</span>
    </a>`;
  }).join('');

  return `
  <div class="app-layout">
    <aside class="sidebar" id="sidebar" style="background:linear-gradient(175deg,#2a7a50 0%,#1F4E2C 40%,#143520 75%,#0a1f12 100%);">
      <div class="sidebar-brand">
        <div style="background:#fff;border-radius:10px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:8px;box-shadow:0 3px 16px rgba(0,0,0,.25);">
          <div style="font-size:26px;font-weight:700;color:#1F7A3E;letter-spacing:-.5px;line-height:1;font-family:'DM Sans',sans-serif;">SEMA</div>
          <div style="width:3px;height:36px;background:#D4A017;border-radius:2px;flex-shrink:0;"></div>
          <div style="font-size:8.5px;color:#666;line-height:1.4;font-family:'DM Sans',sans-serif;">Secretaria<br>de Estado do<br>Meio Ambiente</div>
        </div>
        <div class="sidebar-brand-sub">UNESCO · DIMA · 218BRA2001</div>
      </div>

      <div class="sidebar-user">
        <div class="sidebar-avatar">${iniciais}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-nome">${u?.nome_completo || 'Usuário'}</div>
          <div class="sidebar-user-perfil">${t('perfis', appState.perfil)}</div>
        </div>
      </div>

      <div class="sidebar-lang">
        <button class="lang-btn ${appState.idioma==='pt'?'ativo':''}" onclick="trocarIdioma('pt')">PT</button>
        <button class="lang-btn ${appState.idioma==='en'?'ativo':''}" onclick="trocarIdioma('en')">EN</button>
        <button class="lang-btn ${appState.idioma==='es'?'ativo':''}" onclick="trocarIdioma('es')">ES</button>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section">Menu</div>
        ${navHtml}
      </nav>

      <div class="sidebar-footer">
        <button class="btn-sair" onclick="sair()">
          <span style="font-size:14px">↩</span>
          <span>${t('nav','sair')}</span>
        </button>
      </div>
    </aside>

    <div class="main-content">
      <div class="topbar">
        <div class="topbar-title">${tituloPagina}</div>
        <div class="topbar-breadcrumb">
          <span>SEMA/AC</span>
          <span>›</span>
          <span>${tituloPagina}</span>
        </div>
      </div>
      <div class="page-body" id="page-body" style="overflow-x:hidden;min-width:0;width:100%">
  `;
}

function fecharLayout() {
  return `</div></div></div>`;
}

async function trocarIdioma(lang) {
  appState.idioma = lang;
  localStorage.setItem('dima_idioma', lang);
  if (appState.usuario) {
    await db.from('usuarios').update({ idioma_pref: lang }).eq('id', appState.usuario.id);
  }
  location.reload();
}

async function initPagina(tituloPagina, paginaAtiva, callback) {
  const usuario = await carregarUsuario();
  if (!usuario) { window.location.href = '../index.html'; return; }
  document.getElementById('app').innerHTML =
    gerarLayout(tituloPagina, paginaAtiva) + `</div></div></div>`;
  if (callback) await callback();
}
