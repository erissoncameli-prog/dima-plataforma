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
    // ── Visão geral ──────────────────────────────────────────
    { id: 'dashboard',    icone: '⊞', href: 'dashboard.html',    perfis: null },
    // ── Planejamento ─────────────────────────────────────────
    { id: 'atividades',   icone: '◈', href: 'atividades.html',   perfis: null },
    { id: 'tdrs',         icone: '◧', href: 'tdrs.html',         perfis: null },
    { id: 'matriz',       icone: '◎', href: 'matriz.html',       perfis: null },
    // ── Execução ─────────────────────────────────────────────
    { id: 'fornecedores', icone: '◫', href: 'fornecedores.html', perfis: ['super_admin','coordenacao','financeiro','tecnico'] },
    { id: 'contratos',    icone: '◪', href: 'contratos.html',    perfis: ['super_admin','coordenacao','financeiro'] },
    { id: 'produtos',     icone: '◉', href: 'produtos.html',     perfis: ['super_admin','coordenacao','tecnico'] },
    { id: 'financeiro',   icone: '◈', href: 'financeiro.html',   perfis: ['super_admin','coordenacao','financeiro'] },
    // ── Apoio ────────────────────────────────────────────────
    { id: 'viagens',      icone: '✈', href: 'viagens.html',      perfis: ['super_admin','coordenacao','financeiro','tecnico'] },
    { id: 'repositorio',  icone: '🔗', href: 'repositorio.html',  perfis: null },
    { id: 'usuarios',     icone: '◍', href: 'usuarios.html',     perfis: ['super_admin'] },
  ];

  const u = appState.usuario;
  const iniciais = u?.nome_completo?.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase() || 'US';

  const navGroups = [
    { label: null,          ids: ['dashboard'] },
    { label: 'Planejamento', ids: ['atividades','tdrs','matriz'] },
    { label: 'Execução',     ids: ['fornecedores','contratos','produtos','financeiro'] },
    { label: 'Apoio',        ids: ['viagens','repositorio','usuarios'] },
  ];

  const navHtml = navGroups.map(group => {
    const itens = navItems.filter(item => group.ids.includes(item.id));
    const linhas = itens.map(item => {
      // Acesso por perfil (regra base) OU por permissão extra dinâmica
      const temPerfil = !item.perfis || item.perfis.includes(appState.perfil);
      const temPermissao = (appState.permissoes || []).includes(item.id);
      if (!temPerfil && !temPermissao) return '';
      const ativo = paginaAtiva === item.id ? 'ativo' : '';
      // Indicador visual de acesso extra (não é do perfil padrão)
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
      <div class="sidebar-brand">
        <div style="background:#fff;border-radius:10px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:8px;box-shadow:0 3px 16px rgba(0,0,0,.25);">
          <div style="font-size:26px;font-weight:700;color:#1F7A3E;letter-spacing:-.5px;line-height:1;font-family:'DM Sans',sans-serif;">SEMA</div>
          <div style="width:3px;height:36px;background:#D4A017;border-radius:2px;flex-shrink:0;"></div>
          <div style="font-size:8.5px;color:#666;line-height:1.4;font-family:'DM Sans',sans-serif;">Secretaria<br>de Estado do<br>Meio Ambiente</div>
        </div>
        <div class="sidebar-brand-sub">UNESCO · DIMA · 218BRA2001</div>
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

async function initPagina(tituloPagina, paginaAtiva, callback) {
  const usuario = await carregarUsuario();
  if (!usuario) { window.location.href = '../index.html'; return; }
  document.getElementById('app').innerHTML =
    gerarLayout(tituloPagina, paginaAtiva) + `</div></div></div>`;
  if (callback) await callback();
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
