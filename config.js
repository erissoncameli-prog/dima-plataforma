// ── DIMA · Layout compartilhado ──────────────────────────────
// Gera sidebar + topbar em todas as páginas internas

function gerarLayout(tituloPagina, paginaAtiva) {
  const navItems = [
    { id: 'dashboard', icone: '⊞', href: 'dashboard.html', perfis: null },
    { id: 'atividades', icone: '◈', href: 'atividades.html', perfis: null },
    { id: 'tdrs', icone: '◧', href: 'tdrs.html', perfis: null },
    { id: 'matriz', icone: '◎', href: 'matriz.html', perfis: null },
    { id: 'financeiro', icone: '◉', href: 'financeiro.html', perfis: ['super_admin','coordenacao','financeiro'] },
    { id: 'contratos', icone: '◪', href: 'contratos.html', perfis: ['super_admin','coordenacao','financeiro'] },
    { id: 'viagens', icone: '◫', href: 'viagens.html', perfis: ['super_admin','coordenacao','financeiro'] },
    { id: 'usuarios', icone: '◍', href: 'usuarios.html', perfis: ['super_admin'] },
  ];

  const u = appState.usuario;
  const iniciais = u?.nome_completo?.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase() || 'US';

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
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-brand-logo">DIMA<span style="color:var(--ouro-claro)">.</span></div>
        <div class="sidebar-brand-sub">UNESCO · SEMA/AC · 218BRA2001</div>
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
          <span>DIMA</span>
          <span>›</span>
          <span>${tituloPagina}</span>
        </div>
      </div>
      <div class="page-body" id="page-body">
  `;
}

function fecharLayout() {
  return `</div></div></div>`;
}

async function trocarIdioma(lang) {
  appState.idioma = lang;
  localStorage.setItem('dima_idioma', lang);
  // Atualiza no banco
  if (appState.usuario) {
    await db.from('usuarios').update({ idioma_pref: lang }).eq('id', appState.usuario.id);
  }
  location.reload();
}

// ── Inicialização de página protegida ─────────────────────────
async function initPagina(tituloPagina, paginaAtiva, callback) {
  const usuario = await carregarUsuario();
  if (!usuario) {
    window.location.href = '../index.html';
    return;
  }
  document.getElementById('app').innerHTML =
    gerarLayout(tituloPagina, paginaAtiva);

  // Fechar tag page-body e main-content e app-layout
  document.getElementById('app').innerHTML += `</div></div></div>`;

  if (callback) await callback();
}
