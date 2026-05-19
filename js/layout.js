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

// ── Barra de progresso de navegação ──────────────────────────
;(function() {
  const bar = document.createElement('div');
  bar.id = 'dima-progress-bar';
  document.body.appendChild(bar);
  // Double rAF garante que o CSS já foi aplicado antes de animar
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '42%'; }));
  setTimeout(() => { bar.style.width = '72%'; }, 460);
  window._dimaBar = bar;
})();

function _dimaBarCompleta() {
  const bar = window._dimaBar || document.getElementById('dima-progress-bar');
  if (!bar || bar._concluida) return;
  bar._concluida = true;
  bar.style.transition = 'width 0.18s ease';
  bar.style.width = '100%';
  setTimeout(() => {
    bar.style.transition = 'width 0.18s ease, opacity 0.32s ease';
    bar.style.opacity = '0';
  }, 210);
}

function _dimaAtivarNavLinks() {
  document.querySelectorAll('a.nav-item[href]').forEach(link => {
    if (link._dimaNav) return;
    link._dimaNav = true;
    link.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      e.preventDefault();
      document.body.classList.add('dima-saindo');
      setTimeout(() => { window.location.href = href; }, 160);
    });
  });
}

function gerarLayout(tituloPagina, paginaAtiva) {
  window.AJUDA_NAV_ID = paginaAtiva;

  // SVG paths inline — sem dependência de CDN, renderiza instantaneamente
  const iconePills = {
    dashboard:    { svg: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',                                                                                           cor: '#60a5fa', bg: 'rgba(96,165,250,0.22)'  },
    atividades:   { svg: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',                                                                                                                                                                                  cor: '#34d399', bg: 'rgba(52,211,153,0.22)'  },
    tdrs:         { svg: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',                                                                                                                       cor: '#a78bfa', bg: 'rgba(167,139,250,0.22)' },
    matriz:       { svg: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',                                                                                                                                                                                                 cor: '#f59e0b', bg: 'rgba(245,158,11,0.22)'  },
    fornecedores: { svg: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',                                             cor: '#38bdf8', bg: 'rgba(56,189,248,0.22)'  },
    contratos:    { svg: '<path d="M20 19.5v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8.5L18 5.5"/><path d="M8 18h1"/><path d="M18.42 9.61a2.1 2.1 0 1 1 2.97 2.97L16.95 17 13 18l.99-3.95 4.43-4.44Z"/>',                                                                                                      cor: '#fb7185', bg: 'rgba(251,113,133,0.22)' },
    produtos:     { svg: '<path d="m16 16 2 2 4-4"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 2 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/>',                            cor: '#4ade80', bg: 'rgba(74,222,128,0.22)'  },
    financeiro:   { svg: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',                                                                                                                                                          cor: '#fbbf24', bg: 'rgba(251,191,36,0.22)'  },
    viagens:      { svg: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 2c-2-2-4-2-5.5-.5L10 5 1.8 6.2a.27.27 0 0 0-.1.5l1.7 1.7 4.4-1.1L4.3 11l.6.6L9 10l1.1 4.4 1.7 1.7a.27.27 0 0 0 .5-.1z"/>',                                                                                                                   cor: '#67e8f9', bg: 'rgba(103,232,249,0.22)' },
    beneficiarios:{ svg: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',                                                                                                                               cor: '#c084fc', bg: 'rgba(192,132,252,0.22)' },
    relatorios:   { svg: '<line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>',                                                                                                                                                                           cor: '#f97316', bg: 'rgba(249,115,22,0.22)'  },
    mapa:         { svg: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',                                                                                                                                                                                                     cor: '#2dd4bf', bg: 'rgba(45,212,191,0.22)'  },
    repositorio:  { svg: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',                                                                                            cor: '#94a3b8', bg: 'rgba(148,163,184,0.18)' },
    auditoria:    { svg: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',                                                                                   cor: '#ef4444', bg: 'rgba(239,68,68,0.22)'   },
    usuarios:     { svg: '<circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m21.7 16.4-.9-.3"/><path d="m15.2 13.9-.9-.3"/><path d="m16.6 18.7.3-.9"/><path d="m19.1 12.2.3-.9"/><path d="m19.6 18.7-.4-1"/><path d="m16.8 12.3-.4-1"/><path d="m14.3 16.6 1-.4"/><path d="m20.7 13.8 1-.4"/>', cor: '#e2e8f0', bg: 'rgba(226,232,240,0.15)' },
    configuracoes:{ svg: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',                                                                                                                                                                                           cor: '#94a3b8', bg: 'rgba(148,163,184,0.18)' },
    dados_sistema:{ svg: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>', cor: '#94a3b8', bg: 'rgba(148,163,184,0.18)' },
    banco_dados:  { svg: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',                                                                                                                                                                                cor: '#38bdf8', bg: 'rgba(56,189,248,0.22)'  },
    ajuda:        { svg: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',                                                                                                                                                                                           cor: '#a3e635', bg: 'rgba(163,230,53,0.22)'  },
  };

  function renderPill(id, size) {
    const p = iconePills[id] || { svg: '<circle cx="12" cy="12" r="4"/>', cor: '#94a3b8', bg: 'rgba(148,163,184,0.18)' };
    const px = size || 28;
    return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${px}px;height:${px}px;border-radius:7px;background:${p.bg};flex-shrink:0">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="${p.cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p.svg}</svg>
    </span>`;
  }

  const navItems = [
    // ── Visão geral ──────────────────────────────────────────
    { id: 'dashboard',    href: 'dashboard.html',    perfis: null },
    // ── Planejamento ─────────────────────────────────────────
    { id: 'atividades',   href: 'atividades.html',   perfis: null },
    { id: 'tdrs',         href: 'tdrs.html',         perfis: null },
    { id: 'matriz',       href: 'matriz.html',       perfis: null },
    // ── Execução ─────────────────────────────────────────────
    { id: 'fornecedores', href: 'fornecedores.html', perfis: ['super_admin','coordenacao','financeiro'] },
    { id: 'contratos',    href: 'contratos.html',    perfis: ['super_admin','coordenacao','financeiro'] },
    { id: 'produtos',     href: 'produtos.html',     perfis: ['super_admin','coordenacao','tecnico'] },
    { id: 'financeiro',   href: 'financeiro.html',   perfis: ['super_admin','coordenacao','financeiro'] },
    // ── Apoio ────────────────────────────────────────────────
    { id: 'viagens',       href: 'viagens.html',                   perfis: ['super_admin','coordenacao','financeiro','tecnico'] },
    { id: 'beneficiarios', href: 'viagens.html?aba=beneficiarios', perfis: ['super_admin','coordenacao'] },
    { id: 'relatorios',    href: 'relatorios.html',                perfis: ['super_admin','coordenacao','financeiro'] },
    { id: 'mapa',          href: 'mapa.html',                      perfis: null },
    { id: 'repositorio',   href: 'repositorio.html',               perfis: null },
    { id: 'auditoria',     href: 'auditoria.html',                 perfis: ['super_admin','coordenacao'] },
    { id: 'ajuda',         href: 'ajuda.html',                     perfis: null },
    { id: 'usuarios',      href: 'usuarios.html',                  perfis: ['super_admin'] },
    { id: 'configuracoes', href: null,                             perfis: ['super_admin'], collapsible: true },
    { id: 'dados_sistema', href: 'configuracoes.html',             perfis: ['super_admin'], parent: 'configuracoes' },
    { id: 'banco_dados',   href: 'banco-dados.html',               perfis: ['super_admin'], parent: 'configuracoes' },
  ];

  const u = appState.usuario;
  const iniciais = u?.nome_completo?.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase() || 'US';

  const navGroups = [
    { label: null,           key: null,            ids: ['dashboard'] },
    { label: 'Planejamento', key: 'planejamento',  ids: ['atividades','tdrs','matriz'] },
    { label: 'Execução',     key: 'execucao',      ids: ['fornecedores','contratos','produtos','financeiro'] },
    { label: 'Apoio',        key: 'apoio',         ids: ['viagens','beneficiarios','relatorios','mapa','repositorio','auditoria','ajuda','usuarios'] },
    { label: 'Sistema',      key: 'sistema',       ids: ['configuracoes'] },
  ];

  function grupoAberto(key, ids) {
    if (ids.includes(paginaAtiva)) return true; // sempre aberto se página ativa está no grupo
    const saved = localStorage.getItem('dima_nav_grupo_' + key);
    return saved === null ? true : saved === '1'; // padrão: aberto
  }

  const navHtml = navGroups.map(group => {
    const itens = navItems.filter(item => group.ids.includes(item.id));
    const linhas = itens.map(item => {
      if (item.parent) return ''; // sub-items renderizados pelo pai
      // Acesso por perfil (regra base) OU por permissão extra dinâmica
      const temPerfil = !item.perfis || item.perfis.includes(appState.perfil);
      const perms = appState.permissoes || [];
      const temPermissao = item.id === 'relatorios'
        ? perms.some(p => p.startsWith('relatorios_'))
        : perms.includes(item.id);
      if (!temPerfil && !temPermissao) return '';

      // ── Item recolhível (ex: Configurações) ──────────────────
      if (item.collapsible) {
        const filhos = navItems.filter(si => si.parent === item.id && (!si.perfis || si.perfis.includes(appState.perfil)));
        if (!filhos.length) return '';
        // Expandir apenas se a página atual é um sub-item — recolhe ao sair
        const aberto = filhos.some(si => paginaAtiva === si.id || (si.id === 'dados_sistema' && paginaAtiva === 'configuracoes'));
        const subHtml = filhos.map(si => {
          const siAtivo = (paginaAtiva === si.id || (si.id === 'dados_sistema' && paginaAtiva === 'configuracoes')) ? 'ativo' : '';
          return `<a class="nav-item ${siAtivo}" href="${si.href}"
            style="display:flex;align-items:center;gap:8px;padding-left:22px;font-size:12.5px">
            <span style="color:rgba(255,255,255,.25);font-size:10px;flex-shrink:0">└</span>
            ${renderPill(si.id, 24)}
            <span style="flex:1">${t('nav', si.id)}</span>
          </a>`;
        }).join('');
        return `
          <button class="nav-item" onclick="toggleNavGroup('${item.id}')"
            style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:none;border:none;cursor:pointer;font-family:inherit;color:rgba(255,255,255,.75);">
            ${renderPill(item.id)}
            <span style="flex:1">${t('nav', item.id)}</span>
            <span id="nav-chevron-${item.id}"
              style="font-size:9px;flex-shrink:0;transition:transform .2s;${aberto ? 'transform:rotate(90deg)' : ''}">▶</span>
          </button>
          <div id="nav-children-${item.id}"
            style="overflow:hidden;transition:max-height .22s ease;max-height:${aberto ? '200px' : '0px'}">
            ${subHtml}
          </div>`;
      }

      // ── Item normal ───────────────────────────────────────────
      const ativo = paginaAtiva === item.id ? 'ativo' : '';
      const extraTag = (!temPerfil && temPermissao)
        ? `<span style="font-size:8px;background:rgba(255,255,255,.18);color:rgba(255,255,255,.8);padding:1px 5px;border-radius:99px;margin-left:auto;flex-shrink:0" title="Acesso extra concedido pelo administrador">extra</span>`
        : '';
      return `<a class="nav-item ${ativo}" href="${item.href}" style="display:flex;align-items:center;gap:8px">
        ${renderPill(item.id)}
        <span style="flex:1">${t('nav', item.id)}</span>
        ${extraTag}
      </a>`;
    }).join('');
    if (!linhas.trim()) return '';
    if (!group.label) return linhas;
    const aberto = grupoAberto(group.key, group.ids);
    return `
      <button onclick="toggleGrupoNav('${group.key}')"
        style="display:flex;align-items:center;width:100%;text-align:left;background:none;border:none;
               cursor:pointer;padding:14px 14px 5px;gap:6px;font-family:inherit;
               border-top:1px solid rgba(255,255,255,.08);margin-top:4px;">
        <span style="flex:1;font-size:11px;font-weight:700;letter-spacing:0.8px;
                     color:rgba(255,255,255,.7)">${group.label}</span>
        <span id="nav-group-chevron-${group.key}"
          style="font-size:9px;color:rgba(255,255,255,.45);transition:transform .2s;
                 ${aberto ? '' : 'transform:rotate(-90deg)'}">▼</span>
      </button>
      <div id="nav-group-${group.key}"
        style="overflow:hidden;transition:max-height .25s ease;max-height:${aberto ? '800px' : '0px'}">
        ${linhas}
      </div>`;
  }).join('');

  return `
  <div class="app-layout">
    <aside class="sidebar" id="sidebar" style="background:linear-gradient(175deg,#2a7a50 0%,#1F4E2C 40%,#143520 75%,#0a1f12 100%);">
      <div class="sidebar-brand" style="background:linear-gradient(180deg,#020d06 0%,#0d2318 55%,#1a3d22 100%);margin:-0px;padding:18px 14px 14px;border-bottom:1px solid rgba(255,255,255,.06);">
        <div id="sidebar-logos-topo" style="display:flex;align-items:center;justify-content:center;gap:10px;min-height:40px;margin-bottom:10px;">
          <img src="../assets/brasao-acre.png" alt="Governo do Acre" style="height:48px;width:auto;object-fit:contain;flex-shrink:0;">
          <div style="width:1px;height:36px;background:rgba(255,255,255,.25);flex-shrink:0;"></div>
          <img src="../assets/sema-branco.png" alt="SEMA" style="height:28px;width:auto;object-fit:contain;flex-shrink:0;max-width:120px;">
        </div>
        <div class="sidebar-brand-sub" id="sidebar-brand-sub" style="color:rgba(255,255,255,.45);">UNESCO · DIMA · 218BRA2001</div>
      </div>

      <div class="sidebar-user" onclick="window.location.href='usuarios.html'"
        style="cursor:pointer;transition:background .15s;border-radius:var(--raio)"
        onmouseover="this.style.background='rgba(255,255,255,.08)'"
        onmouseout="this.style.background=''" title="Meu perfil">
        <div class="sidebar-avatar" style="${u?.avatar_url?'background:transparent;padding:0;overflow:hidden':''}">
          ${u?.avatar_url
            ? `<img src="${u.avatar_url}" alt="${iniciais}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'">`
            : iniciais}
        </div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-nome">${u?.nome_completo || 'Usuário'}</div>
          <div class="sidebar-user-perfil">${t('perfis', appState.perfil)}</div>
        </div>
        <span style="font-size:11px;color:rgba(255,255,255,.4);flex-shrink:0">✎</span>
      </div>

      <div class="sidebar-lang">
        <button class="lang-btn ${appState.idioma==='pt'?'ativo':''}" onclick="trocarIdioma('pt')">PT</button>
        <button class="lang-btn ${appState.idioma==='en'?'ativo':''}" onclick="trocarIdioma('en')">EN</button>
        <button class="lang-btn ${appState.idioma==='es'?'ativo':''}" onclick="trocarIdioma('es')">ES</button>
      </div>

      <nav class="sidebar-nav">
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
        <div style="display:flex;align-items:center;gap:12px;margin-left:auto">
          <div class="topbar-breadcrumb">
            <span>SEMA/AC</span>
            <span>›</span>
            <span>${tituloPagina}</span>
          </div>
          <!-- SINO DE NOTIFICAÇÕES -->
          <div style="position:relative" id="sino-wrap">
            <button id="sino-btn" onclick="toggleSino()"
              style="width:36px;height:36px;border-radius:50%;border:1px solid var(--borda);
                background:var(--branco);cursor:pointer;display:flex;align-items:center;
                justify-content:center;font-size:16px;position:relative;transition:all .15s;"
              onmouseover="this.style.background='var(--cinza-50)'"
              onmouseout="this.style.background='var(--branco)'">
              🔔
              <span id="sino-badge" style="display:none;position:absolute;top:-2px;right:-2px;
                background:#DC2626;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;
                border-radius:99px;display:none;align-items:center;justify-content:center;padding:0 4px;
                font-family:var(--font-mono)">0</span>
            </button>
            <!-- Dropdown de notificações -->
            <div id="sino-dropdown" style="display:none;position:absolute;right:0;top:44px;
              width:360px;background:var(--branco);border:1px solid var(--borda);
              border-radius:var(--raio-lg);box-shadow:0 8px 32px rgba(0,0,0,.12);z-index:1000;overflow:hidden">
              <div style="padding:12px 16px;border-bottom:1px solid var(--borda);display:flex;align-items:center;justify-content:space-between">
                <span style="font-size:13px;font-weight:600;color:var(--cinza-900)">Notificações</span>
                <button onclick="marcarTodasLidas()" style="font-size:11px;color:var(--verde-medio);border:none;background:none;cursor:pointer;font-family:var(--font-sans)">Marcar todas como lidas</button>
              </div>
              <div id="sino-lista" style="max-height:380px;overflow-y:auto">
                <div style="padding:20px;text-align:center;color:var(--cinza-400);font-size:12px">Carregando...</div>
              </div>
            </div>
          </div>
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

async function carregarLogosSidebar() {
  try {
    const { data } = await db.from('configuracoes_sistema')
      .select('*').eq('projeto_id', 'default').single();
    if (!data) return;

    const wrap = document.getElementById('sidebar-logos-topo');
    if (wrap) {
      const logos = [...(data.logos_topo || [])].sort((a, b) => a.ordem - b.ordem);
      if (logos.length) {
        const alturas = { pequeno: '18px', medio: '24px', grande: '32px' };
        wrap.innerHTML = logos.map((l, i) =>
          `${i > 0 ? '<div style="width:1px;height:22px;background:rgba(255,255,255,.25);flex-shrink:0"></div>' : ''}
           <img src="${l.url}" alt="${l.alt || ''}" style="height:${alturas[l.tamanho || 'medio']};width:auto;object-fit:contain">`
        ).join('');
      }
    }

    const sub = document.getElementById('sidebar-brand-sub');
    if (sub && data.projeto_codigo) sub.textContent = data.projeto_codigo;
  } catch(e) { console.error('[sidebar-logos]', e); }
}

async function initPagina(tituloPagina, paginaAtiva, callback) {
  const usuario = await carregarUsuario();
  if (!usuario) { localStorage.setItem('dima_redirect', window.location.href); window.location.href = '../index.html'; return; }
  document.getElementById('app').innerHTML =
    gerarLayout(tituloPagina, paginaAtiva) + `</div></div></div>`;
  carregarLogosSidebar();
  if (callback) await callback();
}

// ── Grupos do nav (Planejamento, Execução, Apoio…) ───────────
function toggleGrupoNav(key) {
  const wrap    = document.getElementById('nav-group-' + key);
  const chevron = document.getElementById('nav-group-chevron-' + key);
  if (!wrap) return;
  const aberto = wrap.style.maxHeight !== '0px';
  wrap.style.maxHeight = aberto ? '0px' : '800px';
  if (chevron) chevron.style.transform = aberto ? 'rotate(-90deg)' : '';
  localStorage.setItem('dima_nav_grupo_' + key, aberto ? '0' : '1');
}

// ── Sub-menu recolhível (ex: Configurações) ───────────────────
function toggleNavGroup(id) {
  const children = document.getElementById(`nav-children-${id}`);
  const chevron  = document.getElementById(`nav-chevron-${id}`);
  if (!children) return;
  const aberto = children.style.maxHeight !== '0px';
  if (aberto) {
    children.style.maxHeight = '0px';
    if (chevron) chevron.style.transform = '';
  } else {
    children.style.maxHeight = '200px';
    if (chevron) chevron.style.transform = 'rotate(90deg)';
  }
}

// ── SINO DE NOTIFICAÇÕES ──────────────────────────────────────
let sinoAberto = false;
let notifCache = [];

async function iniciarSino() {
  await carregarNotificacoes();
  // Fechar ao clicar fora
  document.addEventListener('click', e => {
    if (sinoAberto && !document.getElementById('sino-wrap')?.contains(e.target)) {
      fecharSino();
    }
  });
}

async function carregarNotificacoes() {
  if (!appState?.usuario?.id) return;
  const { data } = await db.from('notificacoes')
    .select('*')
    .eq('usuario_id', appState.usuario.id)
    .eq('lida', false)
    .order('criado_em', { ascending: false })
    .limit(20);

  notifCache = data || [];
  renderBadge();
}

function renderBadge() {
  const badge = document.getElementById('sino-badge');
  if (!badge) return;
  const total = notifCache.length;
  if (total > 0) {
    badge.style.display = 'flex';
    badge.textContent = total > 9 ? '9+' : total;
  } else {
    badge.style.display = 'none';
  }
}

function toggleSino() {
  sinoAberto ? fecharSino() : abrirSino();
}

async function abrirSino() {
  sinoAberto = true;
  const dropdown = document.getElementById('sino-dropdown');
  if (dropdown) dropdown.style.display = 'block';
  await carregarNotificacoes();
  renderListaNotif();
}

function fecharSino() {
  sinoAberto = false;
  const dropdown = document.getElementById('sino-dropdown');
  if (dropdown) dropdown.style.display = 'none';
}

function renderListaNotif() {
  const lista = document.getElementById('sino-lista');
  if (!lista) return;

  if (!notifCache.length) {
    lista.innerHTML = `<div style="padding:24px;text-align:center;color:var(--cinza-400);font-size:12px">
      ✓ Nenhuma notificação pendente
    </div>`;
    return;
  }

  const icones = {
    produto_para_avaliar: '📋',
    produto_aprovado:     '✅',
    produto_devolvido:    '↩',
    tdr_para_revisar:     '📄',
    viagem_solicitada:    '✈️',
    viagem_aprovada:      '✅',
    viagem_prestacao:     '🧾',
  };

  lista.innerHTML = notifCache.map(n => {
    const needsAction = (n.tipo === 'produto_para_avaliar' || n.tipo === 'produto_devolvido') && !n.lida;
    const badgeBg  = n.tipo === 'produto_devolvido' ? '#FEF2F2' : '#FEF3C7';
    const badgeCor = n.tipo === 'produto_devolvido' ? '#DC2626'  : '#92400E';
    const badgeTxt = n.tipo === 'produto_devolvido' ? 'Corrigir' : 'Aguarda ação';
    const badgePendente = needsAction
      ? `<span style="font-size:9px;background:${badgeBg};color:${badgeCor};padding:1px 6px;border-radius:99px;font-weight:700;margin-left:4px">${badgeTxt}</span>`
      : '';
    const rowBg = n.lida ? 'var(--branco)' : (n.tipo === 'produto_devolvido' ? '#FFF5F5' : '#F0FDF4');
    return `
    <div onclick="clicarNotif('${n.id}','${n.link||''}','${n.entidade_id||''}')"
      style="padding:12px 16px;border-bottom:1px solid var(--borda);cursor:pointer;
        background:${rowBg};transition:background .1s"
      onmouseover="this.style.background='var(--cinza-50)'"
      onmouseout="this.style.background='${n.lida?'var(--branco)':'#F0FDF4'}'">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:18px;flex-shrink:0">${icones[n.tipo]||'🔔'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--cinza-900);margin-bottom:2px">
            ${n.titulo||''}${badgePendente}
          </div>
          <div style="font-size:11px;color:var(--cinza-600);line-height:1.4">${n.mensagem||''}</div>
          <div style="font-size:10px;color:var(--cinza-400);margin-top:4px">
            ${n.criado_em ? new Date(n.criado_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}
            ${isProduto ? '<span style="color:#1E40AF;margin-left:6px">→ Clique para avaliar</span>' : ''}
          </div>
        </div>
        ${!n.lida ? '<div style="width:7px;height:7px;background:#059669;border-radius:50%;flex-shrink:0;margin-top:4px"></div>' : ''}
      </div>
    </div>`}).join('');
}

async function clicarNotif(id, link, entidadeId) {
  fecharSino();

  // Se for notificação de produto para avaliar: navegar com params, NÃO marcar lida ainda
  if(link && link.includes('produtos.html') && entidadeId){
    window.location.href = `${link}?entrega=${entidadeId}&notif=${id}`;
    return;
  }

  // Para outros tipos: marcar como lida e navegar normalmente
  await db.from('notificacoes').update({ lida: true, lida_em: new Date().toISOString() }).eq('id', id);
  notifCache = notifCache.filter(n => n.id !== id);
  renderBadge();
  if (link) window.location.href = link;
}

async function marcarTodasLidas() {
  await db.rpc('marcar_notificacoes_lidas');
  notifCache = [];
  renderBadge();
  renderListaNotif();
}

// Iniciar sino após carregar a página
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(iniciarSino, 500);
});
