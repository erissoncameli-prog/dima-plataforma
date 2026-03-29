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
      viagens: 'Viagens', matriz: 'Matriz de Resultados', usuarios: 'Usuários', sair: 'Sair'
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
      viagens: 'Travel', matriz: 'Results Matrix', usuarios: 'Users', sair: 'Sign out'
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
      viagens: 'Viajes', matriz: 'Matriz de Resultados', usuarios: 'Usuarios', sair: 'Salir'
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
  sessao: null
};

function t(secao, chave) {
  return i18n[appState.idioma]?.[secao]?.[chave] || i18n.pt[secao]?.[chave] || chave;
}

// ── Auth helpers ──────────────────────────────────────────────
async function carregarUsuario() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return null;
  appState.sessao = session;
  const { data: usuario } = await db.from('usuarios').select('*').eq('id', session.user.id).single();
  if (usuario) {
    appState.usuario = usuario;
    appState.perfil = usuario.perfil;
    appState.idioma = usuario.idioma_pref || appState.idioma;
  }
  return usuario;
}

async function sair() {
  await db.auth.signOut();
  localStorage.removeItem('dima_idioma');
  window.location.href = '../index.html';
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
  return new Date(d).toLocaleDateString('pt-BR');
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
    .select('cotacao,data_ref').order('data_ref', { ascending: false }).limit(1).single();
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
  editarAtividade:  () => ['super_admin','coordenacao','tecnico'].includes(appState.perfil),
  aprovarProduto:   () => ['super_admin','coordenacao'].includes(appState.perfil),
  gerirUsuarios:    () => appState.perfil === 'super_admin',
  verAuditLog:      () => ['super_admin','coordenacao'].includes(appState.perfil),
  editarTDR:        () => ['super_admin','coordenacao','tecnico'].includes(appState.perfil),
};
