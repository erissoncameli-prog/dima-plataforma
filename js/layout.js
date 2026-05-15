// ── DIMA · Layout compartilhado ──────────────────────────────

// Injetar sidebar.css se ainda não foi carregado
(function(){
  if (!document.querySelector('link[href*="sidebar.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '../css/sidebar.css';
    document.head.appendChild(link);
  }
  // Injetar Lucide Icons (ícones SVG do nav)
  if (!document.querySelector('script[src*="lucide"]')) {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js';
    document.head.appendChild(s);
  }
})();

function gerarLayout(tituloPagina, paginaAtiva) {
  const iconePills = {
    dashboard:    { lucide: 'layout-dashboard',    cor: '#60a5fa', bg: 'rgba(96,165,250,0.22)'   },
    atividades:   { lucide: 'list-checks',         cor: '#34d399', bg: 'rgba(52,211,153,0.22)'   },
    tdrs:         { lucide: 'file-text',           cor: '#a78bfa', bg: 'rgba(167,139,250,0.22)'  },
    matriz:       { lucide: 'target',              cor: '#f59e0b', bg: 'rgba(245,158,11,0.22)'   },
    fornecedores: { lucide: 'building-2',          cor: '#38bdf8', bg: 'rgba(56,189,248,0.22)'   },
    contratos:    { lucide: 'file-signature',      cor: '#fb7185', bg: 'rgba(251,113,133,0.22)'  },
    produtos:     { lucide: 'package-check',       cor: '#4ade80', bg: 'rgba(74,222,128,0.22)'   },
    financeiro:   { lucide: 'coins',               cor: '#fbbf24', bg: 'rgba(251,191,36,0.22)'   },
    viagens:      { lucide: 'plane',               cor: '#67e8f9', bg: 'rgba(103,232,249,0.22)'  },
    beneficiarios:{ lucide: 'users',               cor: '#c084fc', bg: 'rgba(192,132,252,0.22)'  },
    relatorios:   { lucide: 'bar-chart-2',         cor: '#f97316', bg: 'rgba(249,115,22,0.22)'   },
    mapa:         { lucide: 'map-pin',             cor: '#2dd4bf', bg: 'rgba(45,212,191,0.22)'   },
    repositorio:  { lucide: 'folder-open',         cor: '#94a3b8', bg: 'rgba(148,163,184,0.18)'  },
    auditoria:    { lucide: 'shield-check',        cor: '#ef4444', bg: 'rgba(239,68,68,0.22)'    },
    usuarios:     { lucide: 'user-cog',            cor: '#e2e8f0', bg: 'rgba(226,232,240,0.15)'  },
    configuracoes:{ lucide: 'settings-2',          cor: '#94a3b8', bg: 'rgba(148,163,184,0.18)'  },
    dados_sistema:{ lucide: 'sliders-horizontal',  cor: '#94a3b8', bg: 'rgba(148,163,184,0.18)'  },
    banco_dados:  { lucide: 'database',            cor: '#38bdf8', bg: 'rgba(56,189,248,0.22)'   },
  };

  function renderPill(id, size) {
    const p = iconePills[id] || { lucide: 'circle', cor: '#94a3b8', bg: 'rgba(148,163,184,0.18)' };
    const px = size || 28;
    return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${px}px;height:${px}px;border-radius:7px;background:${p.bg};flex-shrink:0">
      <i data-lucide="${p.lucide}" style="width:15px;height:15px;stroke:${p.cor};stroke-width:2;fill:none"></i>
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
    { id: 'usuarios',      href: 'usuarios.html',                  perfis: ['super_admin'] },
    { id: 'configuracoes', href: null,                             perfis: ['super_admin'], collapsible: true },
    { id: 'dados_sistema', href: 'configuracoes.html',             perfis: ['super_admin'], parent: 'configuracoes' },
    { id: 'banco_dados',   href: 'banco-dados.html',               perfis: ['super_admin'], parent: 'configuracoes' },
  ];

  const u = appState.usuario;
  const iniciais = u?.nome_completo?.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase() || 'US';

  const navGroups = [
    { label: null,          ids: ['dashboard'] },
    { label: 'Planejamento', ids: ['atividades','tdrs','matriz'] },
    { label: 'Execução',     ids: ['fornecedores','contratos','produtos','financeiro'] },
    { label: 'Apoio',        ids: ['viagens','beneficiarios','relatorios','mapa','repositorio','auditoria','usuarios'] },
    { label: 'Sistema',      ids: ['configuracoes'] },
  ];

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
            style="display:flex;align-items:center;gap:8px;padding-left:30px;font-size:12.5px">
            <span style="color:rgba(255,255,255,.25);font-size:10px;flex-shrink:0">└</span>
            <span style="font-size:13px;flex-shrink:0">${si.icone}</span>
            <span style="flex:1">${t('nav', si.id)}</span>
          </a>`;
        }).join('');
        return `
          <button class="nav-item" onclick="toggleNavGroup('${item.id}')"
            style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:none;border:none;cursor:pointer;font-family:inherit;color:rgba(255,255,255,.75);">
            <span style="font-size:14px;flex-shrink:0">${item.icone}</span>
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
        <span style="font-size:14px;flex-shrink:0">${item.icone}</span>
        <span style="flex:1">${t('nav', item.id)}</span>
        ${extraTag}
      </a>`;
    }).join('');
    if (!linhas.trim()) return '';
    const sep = group.label
      ? `<div class="nav-section" style="margin-top:10px">${group.label}</div>`
      : '';
    return sep + linhas;
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

// ── Menu recolhível ───────────────────────────────────────────
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
    avaliacao_produto: '📋',
    produto_aprovado:  '✅',
    produto_devolvido: '↩',
    tdr:               '📄',
  };

  lista.innerHTML = notifCache.map(n => {
    const isProduto = n.tipo === 'produto_para_avaliar';
    const badgePendente = isProduto && !n.lida
      ? `<span style="font-size:9px;background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:99px;font-weight:700;margin-left:4px">Aguarda ação</span>`
      : '';
    return `
    <div onclick="clicarNotif('${n.id}','${n.link||''}','${n.entidade_id||''}')"
      style="padding:12px 16px;border-bottom:1px solid var(--borda);cursor:pointer;
        background:${n.lida?'var(--branco)':'#F0FDF4'};transition:background .1s"
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
