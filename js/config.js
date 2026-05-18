// ── DIMA UNESCO · Configuração Supabase ──────────────────────
const SUPABASE_URL = 'https://wfymnmlinonvdqfucjya.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmeW1ubWxpbm9udmRxZnVjanlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MzM1NzksImV4cCI6MjA5MDMwOTU3OX0.eC6T9VQ6OzF9mISEGy_pgbIbrOAnG4xp2z6WN-sCMt8';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── i18n ─────────────────────────────────────────────────────
const i18n = {
  pt: {
    login: {
      titulo: 'Entrar na plataforma', email: 'E-mail', senha: 'Senha',
      btn: 'Entrar', erro_credenciais: 'E-mail ou senha incorretos.',
      erro_generico: 'Erro ao conectar. Tente novamente.'
    },
    nav: {
      dashboard: 'Visão Geral', atividades: 'Atividades', tdrs: 'TDRs',
      financeiro: 'Financeiro', contratos: 'Contratos', fornecedores: 'Fornecedores',
      viagens: 'Viagens', beneficiarios: 'Beneficiários', relatorios: 'Relatórios', mapa: 'Mapa de Entregas', repositorio: 'Repositório', produtos: 'Produtos Entregues', matriz: 'Matriz de Resultados', auditoria: 'Auditoria IA', ajuda: 'Ajuda', usuarios: 'Usuários', configuracoes: 'Configurações', dados_sistema: 'Dados do Sistema', banco_dados: 'Armazenamento em Nuvem', sair: 'Sair'
    },
    comum: {
      salvar: 'Salvar', cancelar: 'Cancelar', editar: 'Editar', excluir: 'Excluir',
      novo: 'Novo', buscar: 'Buscar...', carregando: 'Carregando...', sem_dados: 'Nenhum registro encontrado.',
      confirmar: 'Confirmar', sim: 'Sim', nao: 'Não', status: 'Status',
      acoes: 'Ações', voltar: 'Voltar', filtrar: 'Filtrar', exportar: 'Exportar'
    },
    perfis: {
      super_admin: 'Super Admin', coordenacao: 'Coordenação', tecnico: 'Técnico/Focal',
      financeiro: 'Financeiro', consultor_externo: 'Consultor Externo', visualizador: 'Visualizador'
    },
    fases: {
      A_INICIAR: 'A Iniciar', ELABORACAO: 'Elaboração', LICITACAO: 'Licitação',
      ELABORADO: 'Elaborado', CONTRATADO: 'Contratado', CONCLUIDO: 'Concluído'
    },
    status_tdr: {
      rascunho: 'Rascunho', revisao_interna: 'Revisão Interna', ajustes: 'Ajustes',
      enviado_unesco: 'Enviado UNESCO', retorno_unesco: 'Retorno UNESCO',
      aprovado: 'Aprovado', cancelado: 'Cancelado'
    },
    situacao: { pago: 'Pago', a_pagar: 'A Pagar', cancelado: 'Cancelado' },
    dashboard: {
      orcamento: 'Orçamento Total', executado: 'Total Executado', a_pagar: 'A Pagar',
      contratos: 'Contratos Ativos', tdrs_andamento: 'TDRs em andamento',
      indicadores_risco: 'Indicadores em risco', cotacao: 'Cotação USD hoje', bem_vindo: 'Bem-vindo(a)'
    }
  },
  en: {
    login: {
      titulo: 'Sign in', email: 'Email', senha: 'Password',
      btn: 'Sign in', erro_credenciais: 'Incorrect email or password.',
      erro_generico: 'Connection error. Please try again.'
    },
    nav: {
      dashboard: 'Overview', atividades: 'Activities', tdrs: 'TORs',
      financeiro: 'Financial', contratos: 'Contracts', fornecedores: 'Suppliers',
      viagens: 'Travel', relatorios: 'Reports', mapa: 'Delivery Map', repositorio: 'Repository', produtos: 'Delivered Products', matriz: 'Results Matrix', auditoria: 'AI Audit', usuarios: 'Users', configuracoes: 'Settings', dados_sistema: 'System Data', banco_dados: 'Cloud Storage', sair: 'Sign out'
    },
    comum: {
      salvar: 'Save', cancelar: 'Cancel', editar: 'Edit', excluir: 'Delete',
      novo: 'New', buscar: 'Search...', carregando: 'Loading...', sem_dados: 'No records found.',
      confirmar: 'Confirm', sim: 'Yes', nao: 'No', status: 'Status',
      acoes: 'Actions', voltar: 'Back', filtrar: 'Filter', exportar: 'Export'
    },
    perfis: {
      super_admin: 'Super Admin', coordenacao: 'Coordination', tecnico: 'Technical/Focal',
      financeiro: 'Financial', consultor_externo: 'External Consultant', visualizador: 'Viewer'
    },
    fases: {
      A_INICIAR: 'To Start', ELABORACAO: 'Drafting', LICITACAO: 'Procurement',
      ELABORADO: 'Drafted', CONTRATADO: 'Contracted', CONCLUIDO: 'Completed'
    },
    status_tdr: {
      rascunho: 'Draft', revisao_interna: 'Internal Review', ajustes: 'Adjustments',
      enviado_unesco: 'Sent to UNESCO', retorno_unesco: 'UNESCO Feedback',
      aprovado: 'Approved', cancelado: 'Cancelled'
    },
    situacao: { pago: 'Paid', a_pagar: 'Pending', cancelado: 'Cancelled' },
    dashboard: {
      orcamento: 'Total Budget', executado: 'Total Executed', a_pagar: 'Pending Payment',
      contratos: 'Active Contracts', tdrs_andamento: 'TORs in progress',
      indicadores_risco: 'Indicators at risk', cotacao: 'USD rate today', bem_vindo: 'Welcome'
    }
  },
  es: {
    login: {
      titulo: 'Iniciar sesión', email: 'Correo electrónico', senha: 'Contraseña',
      btn: 'Entrar', erro_credenciais: 'Correo o contraseña incorrectos.',
      erro_generico: 'Error de conexión. Inténtelo de nuevo.'
    },
    nav: {
      dashboard: 'Resumen', atividades: 'Actividades', tdrs: 'TDRs',
      financeiro: 'Financiero', contratos: 'Contratos', fornecedores: 'Proveedores',
      viagens: 'Viajes', relatorios: 'Informes', mapa: 'Mapa de Entregas', repositorio: 'Repositorio', produtos: 'Productos Entregados', matriz: 'Matriz de Resultados', auditoria: 'Auditoría IA', usuarios: 'Usuarios', configuracoes: 'Configuración', dados_sistema: 'Datos del Sistema', banco_dados: 'Almacenamiento en Nube', sair: 'Salir'
    },
    comum: {
      salvar: 'Guardar', cancelar: 'Cancelar', editar: 'Editar', excluir: 'Eliminar',
      novo: 'Nuevo', buscar: 'Buscar...', carregando: 'Cargando...', sem_dados: 'No se encontraron registros.',
      confirmar: 'Confirmar', sim: 'Sí', nao: 'No', status: 'Estado',
      acoes: 'Acciones', voltar: 'Volver', filtrar: 'Filtrar', exportar: 'Exportar'
    },
    perfis: {
      super_admin: 'Super Admin', coordenacao: 'Coordinación', tecnico: 'Técnico/Focal',
      financeiro: 'Financiero', consultor_externo: 'Consultor Externo', visualizador: 'Visualizador'
    },
    fases: {
      A_INICIAR: 'Por Iniciar', ELABORACAO: 'Elaboración', LICITACAO: 'Licitación',
      ELABORADO: 'Elaborado', CONTRATADO: 'Contratado', CONCLUIDO: 'Concluido'
    },
    status_tdr: {
      rascunho: 'Borrador', revisao_interna: 'Revisión Interna', ajustes: 'Ajustes',
      enviado_unesco: 'Enviado UNESCO', retorno_unesco: 'Retorno UNESCO',
      aprovado: 'Aprobado', cancelado: 'Cancelado'
    },
    situacao: { pago: 'Pagado', a_pagar: 'Por pagar', cancelado: 'Cancelado' },
    dashboard: {
      orcamento: 'Presupuesto Total', executado: 'Total Ejecutado', a_pagar: 'Por pagar',
      contratos: 'Contratos Activos', tdrs_andamento: 'TDRs en curso',
      indicadores_risco: 'Indicadores en riesgo', cotacao: 'Cotización USD hoy', bem_vindo: 'Bienvenido(a)'
    }
  }
};

// ── Estado global ─────────────────────────────────────────────
let appState = {
  usuario: null, perfil: null,
  idioma: localStorage.getItem('dima_idioma') || 'pt',
  sessao: null,
  permissoes: []   // módulos extras liberados dinamicamente pelo super_admin
};

function t(secao, chave) {
  return i18n[appState.idioma]?.[secao]?.[chave] || i18n.pt[secao]?.[chave] || chave;
}

// ── Auth helpers ──────────────────────────────────────────────
async function carregarUsuario() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return null;

  // ── Verificar inatividade persistida (cobre fechamento de aba/browser) ──
  const ultimaAtiv = localStorage.getItem('dima_ultima_atividade');
  if (ultimaAtiv && Date.now() - parseInt(ultimaAtiv, 10) > 30 * 60 * 1000) {
    await db.auth.signOut();
    localStorage.removeItem('dima_ultima_atividade');
    localStorage.removeItem('dima_idioma');
    return null; // cada página redireciona para login automaticamente
  }

  appState.sessao = session;

  const [{ data: usuario }, { data: permsRaw }] = await Promise.all([
    db.from('usuarios').select('*').eq('id', session.user.id).single(),
    db.from('usuario_permissoes')
      .select('modulo,valido_ate')
      .eq('usuario_id', session.user.id)
      .eq('ativo', true)
      .lte('valido_de', new Date().toISOString())
  ]);

  if (usuario) {
    appState.usuario = usuario;
    appState.perfil = usuario.perfil;
    appState.idioma = usuario.idioma_pref || appState.idioma;

    // Filtrar permissões que ainda não expiraram
    const agora = new Date();
    appState.permissoes = (permsRaw || [])
      .filter(p => !p.valido_ate || new Date(p.valido_ate) > agora)
      .map(p => p.modulo);

    // Registrar acesso
    const agoraISO = agora.toISOString();
    const updates = { ultimo_acesso_em: agoraISO };
    if (!usuario.primeiro_acesso_em) updates.primeiro_acesso_em = agoraISO;
    try {
      await db.from('usuarios').update(updates).eq('id', usuario.id);
    } catch(e) { /* não crítico */ }

    iniciarIdleTimer();
  }
  return usuario;
}

async function sair() {
  await db.auth.signOut();
  localStorage.removeItem('dima_idioma');
  localStorage.removeItem('dima_ultima_atividade');
  window.location.href = '../index.html';
}

// ── Idle Session Timer (30 min) ───────────────────────────────
const iniciarIdleTimer = (() => {
  const AVISO_MS  = 28 * 60 * 1000; // 28 min → exibe aviso
  const LOGOUT_MS = 30 * 60 * 1000; // 30 min → logout automático
  const EVENTOS   = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

  const TEXTOS = {
    pt: { titulo: 'Sessão prestes a expirar', msg: 'Por inatividade, sua sessão será encerrada em:', continuar: 'Continuar sessão', sairAgora: 'Sair agora' },
    en: { titulo: 'Session about to expire',  msg: 'Due to inactivity, your session will end in:',   continuar: 'Stay signed in',   sairAgora: 'Sign out now' },
    es: { titulo: 'Sesión a punto de expirar', msg: 'Por inactividad, su sesión se cerrará en:',     continuar: 'Continuar sesión', sairAgora: 'Salir ahora' }
  };

  let timerAviso, timerLogout, countdownInterval, modalEl;
  let iniciado = false;

  function _textos() { return TEXTOS[appState.idioma] || TEXTOS.pt; }

  function _fecharModal() {
    clearInterval(countdownInterval); countdownInterval = null;
    if (modalEl) { modalEl.remove(); modalEl = null; }
  }

  function _mostrarAviso() {
    if (modalEl) return;
    const tx = _textos();
    const overlay = document.createElement('div');
    overlay.id = 'idle-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:\'DM Sans\',sans-serif';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:36px 40px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:center">
        <div style="font-size:44px;margin-bottom:12px">⏱️</div>
        <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#111827">${tx.titulo}</h2>
        <p style="margin:0 0 6px;color:#6B7280;font-size:14px;line-height:1.6">${tx.msg}</p>
        <p style="margin:0 0 28px"><span id="idle-countdown" style="font-size:32px;font-weight:700;color:#DC2626">2:00</span></p>
        <div style="display:flex;gap:12px;justify-content:center">
          <button id="idle-btn-sair" style="padding:10px 24px;border-radius:8px;border:1px solid #E5E7EB;background:#fff;color:#374151;font-size:14px;font-weight:500;cursor:pointer">${tx.sairAgora}</button>
          <button id="idle-btn-continuar" style="padding:10px 24px;border-radius:8px;border:none;background:#2563EB;color:#fff;font-size:14px;font-weight:600;cursor:pointer">${tx.continuar}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    modalEl = overlay;

    let segs = 120;
    const cdEl = document.getElementById('idle-countdown');
    countdownInterval = setInterval(() => {
      segs--;
      if (cdEl) cdEl.textContent = `${Math.floor(segs/60)}:${String(segs%60).padStart(2,'0')}`;
      if (segs <= 0) clearInterval(countdownInterval);
    }, 1000);

    document.getElementById('idle-btn-continuar').addEventListener('click', () => { _fecharModal(); _resetar(); });
    document.getElementById('idle-btn-sair').addEventListener('click', () => { _fecharModal(); sair(); });
  }

  function _resetar() {
    localStorage.setItem('dima_ultima_atividade', Date.now().toString());
    clearTimeout(timerAviso);
    clearTimeout(timerLogout);
    timerAviso  = setTimeout(_mostrarAviso, AVISO_MS);
    timerLogout = setTimeout(() => { _fecharModal(); sair(); }, LOGOUT_MS);
  }

  function _verificarAoVoltar() {
    if (document.visibilityState !== 'visible') return;
    const ultima = localStorage.getItem('dima_ultima_atividade');
    if (ultima && Date.now() - parseInt(ultima, 10) > 30 * 60 * 1000) {
      _fecharModal();
      sair();
    }
  }

  return function iniciarIdleTimer() {
    if (iniciado) { _resetar(); return; }
    iniciado = true;
    EVENTOS.forEach(ev => document.addEventListener(ev, _resetar, { passive: true }));
    // Cobre retorno à aba após longa inatividade (ex: computador em sleep)
    document.addEventListener('visibilitychange', _verificarAoVoltar);
    _resetar();
  };
})();

// ── SEI ───────────────────────────────────────────────────────
const SEI_BASE_URL = 'https://app.sei.ac.gov.br/sei/controlador.php?acao=pesquisa_rapida&pesquisa_rapida_nr_protocolo=';

function maskSEI(v) {
  v = (v || '').replace(/\D/g, '');
  if (v.length > 21) v = v.slice(0, 21);
  let r = v.slice(0, 4);
  if (v.length > 4)  r += '.' + v.slice(4, 10);
  if (v.length > 10) r += '.' + v.slice(10, 15);
  if (v.length > 15) r += '/' + v.slice(15, 19);
  if (v.length > 19) r += '-' + v.slice(19, 21);
  return r;
}

function linkSEI(num) {
  if (!num) return '—';
  return '<a href="' + SEI_BASE_URL + encodeURIComponent(num) + '" target="_blank" rel="noopener" '
    + 'style="font-family:var(--font-mono);font-size:12px;color:#1E40AF;text-decoration:none;'
    + 'display:inline-flex;align-items:center;gap:4px;font-weight:600">'
    + num + '&nbsp;<span style="font-size:10px">↗</span></a>';
}

// ── Utilitários ───────────────────────────────────────────────
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Formatação ────────────────────────────────────────────────
function fmtBRL(v) {
  if (v == null || v === '') return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function fmtUSD(v) {
  if (v == null || v === '') return '—';
  return 'U$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}
function fmtData(d) {
  if (!d) return '—';
  const s = String(d);
  // Se for só data (YYYY-MM-DD), adiciona T12:00 para evitar shift de fuso horário
  const dt = s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s);
  return dt.toLocaleDateString('pt-BR');
}
function fmtPct(v) {
  if (v == null) return '0%';
  return Math.round(v) + '%';
}

// ── Nome do campo por idioma ──────────────────────────────────
function campo(obj, campo) {
  const lang = appState.idioma;
  return obj[`${campo}_${lang}`] || obj[`${campo}_pt`] || '';
}

// ── Toast notifications ───────────────────────────────────────
function toast(msg, tipo = 'info') {
  const cores = { info: '#2563EB', success: '#059669', error: '#DC2626', warning: '#D97706' };
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
    background:${cores[tipo]};color:#fff;padding:12px 20px;border-radius:8px;
    font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;
    box-shadow:0 4px 20px rgba(0,0,0,.25);
    animation:slideIn .2s ease;max-width:340px;line-height:1.4`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Cotação USD ───────────────────────────────────────────────
async function obterCotacao() {
  const { data } = await db.from('cotacoes_usd')
    .select('cotacao,cotacao_anterior,variacao_pct,data_ref,fonte')
    .order('data_ref', { ascending: false })
    .limit(1).single();
  return data;
}

// ── Badges ────────────────────────────────────────────────────
function badgeFase(fase) {
  const cores = {
    A_INICIAR: 'var(--badge-gray)', ELABORACAO: 'var(--badge-blue)',
    LICITACAO: 'var(--badge-amber)', ELABORADO: 'var(--badge-teal)',
    CONTRATADO: 'var(--badge-green)', CONCLUIDO: 'var(--badge-dark)'
  };
  return `<span class="badge" style="background:${cores[fase]||'var(--badge-gray)'}">${t('fases', fase)}</span>`;
}

function badgeStatusTDR(status) {
  const cores = {
    rascunho: 'var(--badge-gray)', revisao_interna: 'var(--badge-blue)',
    ajustes: 'var(--badge-amber)', enviado_unesco: 'var(--badge-teal)',
    retorno_unesco: 'var(--badge-red)', aprovado: 'var(--badge-green)',
    cancelado: 'var(--badge-dark)'
  };
  return `<span class="badge" style="background:${cores[status]||'var(--badge-gray)'}">${t('status_tdr', status)}</span>`;
}

function badgeSituacao(sit) {
  const cores = { pago: 'var(--badge-green)', a_pagar: 'var(--badge-amber)', cancelado: 'var(--badge-gray)' };
  return `<span class="badge" style="background:${cores[sit]||'var(--badge-gray)'}">${t('situacao', sit)}</span>`;
}

// ── Permissões ────────────────────────────────────────────────
const PODE = {
  verFinanceiro:    () => ['super_admin','coordenacao','financeiro'].includes(appState.perfil),
  editarAtividade:  () => ['super_admin','coordenacao'].includes(appState.perfil),
  verAtividade:     () => ['super_admin','coordenacao','tecnico'].includes(appState.perfil),
  aprovarProduto:   () => ['super_admin','coordenacao'].includes(appState.perfil),
  gerirUsuarios:    () => appState.perfil === 'super_admin',
  verAuditLog:      () => ['super_admin','coordenacao'].includes(appState.perfil),
  verAuditoria:     () => ['super_admin','coordenacao'].includes(appState.perfil),
  editarTDR:        () => ['super_admin','coordenacao','tecnico'].includes(appState.perfil),
};
