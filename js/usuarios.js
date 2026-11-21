// ── Usuários (super_admin) e Meu perfil (demais) ─────────────────────────
// Visual: css/administracao.css (prefixo ad-) + js/administracao.js (adIc, adAbrir/adFechar, adConfirmar).
// Regras de quem pode o quê ficam no banco: perfil/ativo protegidos por trigger em usuarios,
// fn_criar_usuario e fn_resetar_senha_usuario só para super_admin ativo (rem. 20261010_seg_senha_e_mapa).

const PERFIS = {
  super_admin: 'Super Admin', coordenacao: 'Coordenação', tecnico: 'Técnico',
  financeiro: 'Financeiro', consultor_externo: 'Consultor Externo', visualizador: 'Visualizador',
};
const PERFIS_LIST = Object.keys(PERFIS);

// Módulos liberáveis (migrações 20261126_acessos_*). O PERFIL é o teto — perfis = o que "Aplicar o padrão
// do perfil" marca (null = todos os perfis; [] = nenhum, só por concessão); a LIBERAÇÃO é a chave: usuário novo
// nasce sem nada. Espelha a tabela acesso_modulos (rótulo e teto) — mudou num, muda no outro.
// dados: true = o módulo também abre os dados no banco (fn_modulo_liberado / tem_permissao nas policies);
// sem `dados`, o módulo abre a página e os dados seguem as regras do perfil.
const MODULOS_NUCLEO = 'Visão Geral, Minhas tarefas, Manual do sistema e Meu perfil';
const MODULOS_LISTA = [
  { id: 'atividades',   ic: 'lista',   label: 'Atividades',           perfis: null },
  { id: 'tdrs',         ic: 'doc',     label: 'TDRs',                 perfis: null },
  { id: 'matriz',       ic: 'alvo',    label: 'Matriz de Resultados', perfis: null },
  { id: 'remanejamentos', ic: 'trocar', label: 'Remanejamento',       perfis: null },
  { id: 'fornecedores', ic: 'predio',  label: 'Fornecedores',         perfis: ['super_admin', 'coordenacao', 'financeiro'], dados: true },
  { id: 'contratos',    ic: 'contrato', label: 'Contratos',           perfis: ['super_admin', 'coordenacao', 'financeiro'], dados: true },
  { id: 'produtos',     ic: 'pacote',  label: 'Produtos Entregues',   perfis: ['super_admin', 'coordenacao', 'tecnico'] },
  { id: 'acervo',       ic: 'pasta',   label: 'Acervo Digital',       perfis: ['super_admin', 'coordenacao', 'financeiro', 'tecnico'] },
  { id: 'financeiro',   ic: 'moeda',   label: 'Financeiro',           perfis: ['super_admin', 'coordenacao', 'financeiro'], dados: true },
  // Patrimônio: catálogo (ver os bens; coordenação também gere), valores/NF e gestor patrimonial (designação das tarefas)
  { id: 'patrimonio_catalogo', ic: 'pacote', label: 'Patrimônio — catálogo', perfis: ['super_admin', 'coordenacao', 'financeiro', 'tecnico', 'visualizador'], dados: true },
  { id: 'patrimonio',   ic: 'pacote',  label: 'Patrimônio — ver valores', perfis: ['super_admin', 'coordenacao', 'financeiro'], dados: true },
  { id: 'patrimonio_gestor', ic: 'pacote', label: 'Patrimônio — gestor patrimonial', perfis: ['super_admin'], dados: true },
  // Diagnóstico: VER os dados (coordenação gere; técnico vê números; consultor lê fichas sem identificação)
  { id: 'diagnostico',  ic: 'campo',   label: 'Diagnóstico Socioambiental', perfis: ['super_admin', 'coordenacao'], dados: true,
    efeito: 'ver os dados; não faz de ninguém entrevistador' },
  // Entrevistador (diag_27): faz entrevista no app e entra na designação; qualquer perfil; só o super_admin concede (trigger no banco)
  { id: 'diagnostico_entrevistador', ic: 'campo', label: 'Diagnóstico — entrevistador (app de campo)', perfis: [], dados: true,
    efeito: 'faz entrevistas no app e pode ser designado a um setor; não dá a mesa' },
  { id: 'diagnostico_treino', ic: 'frasco', label: 'Diagnóstico — modo treino', perfis: ['super_admin'], dados: true },
  { id: 'viagens',      ic: 'aviao',   label: 'Viagens',              perfis: ['super_admin', 'coordenacao', 'financeiro', 'tecnico'], dados: true,
    efeito: 'técnico vê só os próprios protocolos; fora do perfil, vê todos' },
  { id: 'beneficiarios', ic: 'users',  label: 'Beneficiários (com dados bancários)', perfis: ['super_admin', 'coordenacao'], dados: true },
  { id: 'mapa',         ic: 'globo',   label: 'Mapa Interativo',      perfis: null },
  { id: 'repositorio',  ic: 'link',    label: 'Repositório',          perfis: null },
  { id: 'formularios',  ic: 'form',    label: 'Guia Formulários',     perfis: null },
  { id: 'pulso',        ic: 'graf',    label: 'Pulso da Equipe',      perfis: null },
  { id: 'auditoria',    ic: 'escudo',  label: 'Auditoria IA',         perfis: ['super_admin', 'coordenacao'] },
  { id: 'ropa',         ic: 'escudo',  label: 'Privacidade (ROPA)',   perfis: ['super_admin', 'coordenacao'] },
  { id: 'usuarios',     ic: 'users',   label: 'Usuários',             perfis: ['super_admin'] },
  // Central de Relatórios (prefixo relatorios_)
  { id: 'relatorios_financeiro',   ic: 'moeda',    label: 'Financeiro',        grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_contratos',    ic: 'contrato', label: 'Contratos',         grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_fornecedores', ic: 'predio',   label: 'Fornecedores',      grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_produtos',     ic: 'pacote',   label: 'Produtos/Entregas', grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_tdrs',         ic: 'doc',      label: 'TDRs',              grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_atividades',   ic: 'lista',    label: 'Atividades',        grupo: 'relatorios', perfis: ['super_admin', 'coordenacao', 'financeiro'] },
  { id: 'relatorios_orcamento',    ic: 'moeda',    label: 'Orçamento e remanejamento', grupo: 'relatorios', perfis: ['super_admin', 'coordenacao', 'financeiro'] },
  { id: 'relatorios_matriz',       ic: 'alvo',     label: 'Matriz',            grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_viagens',      ic: 'aviao',    label: 'Viagens',           grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_patrimonio',   ic: 'pacote',   label: 'Patrimônio',        grupo: 'relatorios', perfis: ['super_admin', 'coordenacao', 'financeiro'] },
  // Aba especial da Visão Geral
  { id: 'dashboard_cobertura', ic: 'graf', label: 'Cobertura de Indicadores', grupo: 'dashboard_extra', perfis: ['super_admin', 'coordenacao'] },
];
const GRUPOS = { '': 'Módulos', relatorios: 'Central de Relatórios', dashboard_extra: 'Painéis extras da Visão Geral' };
const modLabel = id => { const m = MODULOS_LISTA.find(x => x.id === id); return m ? (m.grupo === 'relatorios' ? 'Relatório ' + m.label : m.label) : id; };
const modDoPerfil = (m, perfil) => !m.perfis || m.perfis.includes(perfil);

let todosUsuarios = [], solicitacoes = [], permsTodas = [], pedidosAcesso = [], responsaveis = new Set();
let usuarioAtual = null, permIni = {}, abaAtual = 'dados', editando = false;
const filtro = { busca: '', perfil: '', situacao: 'ativo', rapido: '' };

const fmtDT = d => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtD = d => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
function fmtAcesso(d) {
  if (!d) return 'nunca entrou';
  const dt = new Date(d), hoje = new Date(); const ini = x => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dias = Math.round((ini(hoje) - ini(dt)) / 864e5);
  if (dias === 0) return 'hoje, ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (dias === 1) return 'ontem';
  if (dias < 7) return 'há ' + dias + ' dias';
  return dt.toLocaleDateString('pt-BR');
}
const semAcento = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Último acesso: o mais recente entre a mesa e o app de campo
function ultimoDe(u) {
  const a = u.ultimo_acesso_em, b = u.ultimo_acesso_app_em;
  return !a ? b : !b ? a : (new Date(a) > new Date(b) ? a : b);
}
function mkIniciais(nome) { return (nome || 'U').trim().split(/\s+/).filter(Boolean).map(p => p[0]).join('').substring(0, 2).toUpperCase() || 'U'; }
// Avatar: iniciais por baixo e a foto por cima (se a foto falhar, some e ficam as iniciais)
function mkAvatar(u, extra) {
  const ini = esc(mkIniciais(u.nome_completo));
  return `<span class="ad-av${u.ativo === false ? ' off' : ''}${extra ? ' ' + extra : ''}">${ini}${u.avatar_url ? `<img src="${esc(u.avatar_url)}" alt="" onerror="this.remove()">` : ''}</span>`;
}
const pillPerfil = p => `<span class="ad-pill ad-pf" style="--c:var(--ad-p-${PERFIS[p] ? p : 'visualizador'})">${esc(PERFIS[p] || p || '—')}</span>`;

// ── Início ─────────────────────────────────────────────────────────────
(async () => {
  const u = await carregarUsuario();
  if (!u) { window.location.href = '../index.html'; return; }
  const isAdmin = appState.perfil === 'super_admin';
  if (isAdmin) {
    document.getElementById('app').innerHTML = gerarLayout('Usuários', 'usuarios') + `
      <div class="fade-in">
        <div class="ad-topo"><div><h2>Usuários</h2><p>Quem entra na plataforma, com que perfil e quais acessos tem além do perfil.</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-secondary" onclick="relatorioAcessos()">${adIc('imprimir', 'p')}Quem acessa o quê</button>
            <button type="button" class="btn btn-primary" onclick="abrirFormNovo()">${adIc('mais', 'p')}Novo usuário</button></div></div>
        <div class="ad-kpis" id="stats"></div>
        <div class="ad-filtros">
          <label class="ad-busca">${adIc('busca', 'p')}<input id="f-busca" type="search" placeholder="Buscar nome ou e-mail" aria-label="Buscar nome ou e-mail"></label>
          <div class="ad-seg" role="group" aria-label="Perfil" id="f-perfil"></div>
          <select class="ad-sel" id="f-situacao" aria-label="Situação">
            <option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="">Todos</option>
          </select>
          <span class="ad-cont" id="f-cont"></span>
        </div>
        <div class="ad-card ad-tab-wrap">
          <table class="ad-tab">
            <thead><tr><th>Pessoa</th><th>Perfil</th><th>Acessos</th><th>Último acesso</th><th>Situação</th></tr></thead>
            <tbody id="tbody-usuarios"></tbody>
          </table>
        </div>
      </div>` + '</div></div></div>';
    adSeletorTema(); carregarLogosSidebar();
    document.getElementById('f-busca').addEventListener('input', e => { filtro.busca = e.target.value; filtrar(); });
    document.getElementById('f-situacao').addEventListener('change', e => { filtro.situacao = e.target.value; filtrar(); });
    await carregarDados();
    const qs = new URLSearchParams(location.search);
    if (qs.get('self') === '1') abrirUsuario(appState.usuario.id);
    else if (qs.get('pedidos') === '1') abrirPedidos();
    else if (['revisao', 'bloqueado'].includes(qs.get('filtro'))) filtroRapido(qs.get('filtro'));
  } else {
    document.getElementById('app').innerHTML = gerarLayout('Meu Perfil', 'usuarios') +
      '<div class="fade-in"><div class="ad-perfil" id="perfil-content"></div></div>' + '</div></div></div>';
    adSeletorTema(); carregarLogosSidebar();
    renderPerfilPessoal();
  }
})();

// ══════════════════════════════════════════════════════════════════════
// PAINEL ADMIN
// ══════════════════════════════════════════════════════════════════════
async function carregarDados() {
  const [{ data: u }, { data: s }, { data: p }, { data: pa }, { data: ar }] = await Promise.all([
    db.from('usuarios').select('*').order('nome_completo'),
    db.from('solicitacoes_senha').select('*').eq('status', 'pendente'),
    db.from('usuario_permissoes').select('usuario_id,modulo,valido_ate,em_revisao,concedido_em').eq('ativo', true),
    db.from('usuario_pedidos_acesso').select('id,tipo,usuario_id,modulo,justificativa,origem,criado_em').eq('status', 'pendente').order('criado_em'),
    db.from('atividade_responsaveis').select('usuario_id').eq('ativo', true),
  ]);
  todosUsuarios = u || []; solicitacoes = s || []; permsTodas = p || []; pedidosAcesso = pa || [];
  responsaveis = new Set((ar || []).map(x => x.usuario_id));
  renderStats(); renderSegPerfil(); filtrar();
}

function renderStats() {
  const t = todosUsuarios, ativos = t.filter(u => u.ativo);
  const trocar = t.filter(u => u.ativo && u.deve_trocar_senha).length;
  const pedidos = new Set(solicitacoes.map(s => s.usuario_id)).size;
  const emRevisao = t.filter(u => u.ativo && emRevisaoDe(u).length).length;
  const bloq = t.filter(u => u.ativo && u.bloqueado_inatividade_em).length;
  const pedAc = pedidosAcesso.length;
  const cont = {}; ativos.forEach(u => { cont[u.perfil] = (cont[u.perfil] || 0) + 1; });
  const mix = PERFIS_LIST.filter(p => cont[p]).map(p => `<i style="flex:${cont[p]};background:var(--ad-p-${p})" title="${esc(PERFIS[p])}: ${cont[p]}"></i>`).join('');
  const leg = PERFIS_LIST.filter(p => cont[p]).map(p => `${cont[p]} ${esc(PERFIS[p].split(' ')[0].toLowerCase())}`).join(' · ');
  const rap = (k, cls, ic, l, v, s) => `<button type="button" class="ad-kpi${cls}" aria-pressed="${filtro.rapido === k}" onclick="filtroRapido('${k}')">
      <span class="ad-kpi-l">${adIc(ic, 'p')}${l}</span><span class="ad-kpi-v">${v}</span><span class="ad-kpi-s">${s}</span></button>`;
  document.getElementById('stats').innerHTML = `
    <div class="ad-kpi"><span class="ad-kpi-l">${adIc('users', 'p')}Ativos</span><span class="ad-kpi-v">${ativos.length}</span><span class="ad-kpi-s">de ${t.length} cadastrados</span></div>
    <div class="ad-kpi"><span class="ad-kpi-l">${adIc('escudo', 'p')}Por perfil</span><div class="ad-mix" role="img" aria-label="${esc(leg)}">${mix}</div><span class="ad-kpi-s">${leg || '—'}</span></div>
    ${rap('trocar', '', 'chave', 'Devem trocar a senha', trocar, trocar ? 'senha temporária em uso · ver só esses' : 'nenhum pendente')}
    ${rap('pedido', pedidos ? ' al' : '', 'sino', 'Pedidos de nova senha', pedidos, pedidos ? 'aguardando você · ver só esses' : 'nenhum pedido')}
    ${rap('revisao', emRevisao ? ' al' : '', 'relogio', 'Acessos em revisão', emRevisao, emRevisao ? 'pessoas a revisar · ver só essas' : 'nada a revisar')}
    ${rap('bloqueado', bloq ? ' al' : '', 'cadeado', 'Suspensos por inatividade', bloq, bloq ? '15 dias sem entrar · ver só esses' : 'ninguém suspenso')}
    <button type="button" class="ad-kpi${pedAc ? ' al' : ''}" onclick="abrirPedidos()">
      <span class="ad-kpi-l">${adIc('enviar', 'p')}Pedidos de acesso</span><span class="ad-kpi-v">${pedAc}</span><span class="ad-kpi-s">${pedAc ? 'aguardando você · abrir' : 'nenhum pedido'}</span></button>`;
}
function filtroRapido(k) { filtro.rapido = filtro.rapido === k ? '' : k; if (filtro.rapido) { filtro.situacao = ''; document.getElementById('f-situacao').value = ''; } renderStats(); filtrar(); }

function renderSegPerfil() {
  const presentes = PERFIS_LIST.filter(p => todosUsuarios.some(u => u.perfil === p));
  const b = (k, l) => `<button type="button" aria-pressed="${filtro.perfil === k}" data-p="${k}">${esc(l)}</button>`;
  const el = document.getElementById('f-perfil');
  el.innerHTML = b('', 'Todos') + presentes.map(p => b(p, PERFIS[p])).join('');
  el.onclick = e => { const x = e.target.closest('[data-p]'); if (!x) return; filtro.perfil = x.dataset.p; renderSegPerfil(); filtrar(); };
}

// Liberações vivas (ativas e no prazo) de uma pessoa
function vivosDe(u) {
  const agora = new Date();
  return permsTodas.filter(p => p.usuario_id === u.id && (!p.valido_ate || new Date(p.valido_ate) > agora));
}
function emRevisaoDe(u) { return vivosDe(u).filter(p => p.em_revisao); }
function pillsExtras(u) {
  if (u.perfil === 'super_admin') return '<span class="ad-pill ad-in">todos os módulos</span>';
  const vivos = vivosDe(u);
  if (!vivos.length) return '<span class="ad-mono ad-nada">nenhum módulo</span>';
  const extras = vivos.filter(p => { const m = MODULOS_LISTA.find(x => x.id === p.modulo); return m && !modDoPerfil(m, u.perfil); });
  const rev = vivos.filter(p => p.em_revisao).length;
  return `<div class="ad-extras"><span class="ad-pill ad-in">${vivos.length} ${vivos.length === 1 ? 'módulo' : 'módulos'}</span>`
    + (rev ? `<span class="ad-pill ad-al">${rev} em revisão</span>` : '')
    + extras.slice(0, 2).map(p => `<span class="ad-pill ad-ne" title="Fora do padrão do perfil">${esc(modLabel(p.modulo))}</span>`).join('')
    + (extras.length > 2 ? `<span class="ad-pill ad-ne">+${extras.length - 2} extras</span>` : '') + '</div>';
}
function situacaoDe(u) {
  if (!u.ativo) return '<span class="ad-pill ad-ne">Inativo</span>';
  if (u.bloqueado_inatividade_em) return `<span class="ad-pill ad-al">${adIc('cadeado')}Suspenso por inatividade</span>`;
  if (solicitacoes.some(s => s.usuario_id === u.id)) return `<span class="ad-pill ad-al">${adIc('sino')}Pediu nova senha</span>`;
  if (u.deve_trocar_senha) return `<span class="ad-pill ad-ne">${adIc('chave')}Senha temporária</span>`;
  return '<span class="ad-pill ad-ok">Ativo</span>';
}

function filtrar() {
  const b = semAcento(filtro.busca).trim();
  const fil = todosUsuarios.filter(u => {
    if (filtro.perfil && u.perfil !== filtro.perfil) return false;
    if (filtro.situacao === 'ativo' && !u.ativo) return false;
    if (filtro.situacao === 'inativo' && u.ativo) return false;
    if (filtro.rapido === 'trocar' && !(u.ativo && u.deve_trocar_senha)) return false;
    if (filtro.rapido === 'pedido' && !solicitacoes.some(s => s.usuario_id === u.id)) return false;
    if (filtro.rapido === 'revisao' && !(u.ativo && emRevisaoDe(u).length)) return false;
    if (filtro.rapido === 'bloqueado' && !(u.ativo && u.bloqueado_inatividade_em)) return false;
    if (b && !semAcento((u.nome_completo || '') + ' ' + (u.email || '')).includes(b)) return false;
    return true;
  });
  const tbody = document.getElementById('tbody-usuarios'); if (!tbody) return;
  document.getElementById('f-cont').textContent = fil.length + (fil.length === 1 ? ' pessoa' : ' pessoas');
  tbody.innerHTML = fil.length ? fil.map(u => `<tr class="${u.ativo ? '' : 'off'}" data-id="${esc(u.id)}" tabindex="0" aria-label="Abrir ${esc(u.nome_completo || 'usuário')}">
      <td class="c-pess"><div class="ad-pess">${mkAvatar(u)}<div><b>${esc(u.nome_completo || '—')}${u.id === appState.usuario.id ? ' <span class="ad-pill ad-ne">você</span>' : ''}</b><small>${esc(u.email || '—')}</small></div></div></td>
      <td>${pillPerfil(u.perfil)}</td>
      <td class="c-extras">${pillsExtras(u)}</td>
      <td class="c-acesso ad-mono">${esc(fmtAcesso(ultimoDe(u)))}${u.ultimo_acesso_app_em && u.ultimo_acesso_app_em === ultimoDe(u) ? ' <small>(app)</small>' : ''}</td>
      <td>${situacaoDe(u)}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="ad-vazio">Nenhum usuário com esses filtros.</td></tr>';
}
document.addEventListener('click', e => { const tr = e.target.closest('#tbody-usuarios tr[data-id]'); if (tr) abrirUsuario(tr.dataset.id); });
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('#tbody-usuarios tr[data-id]')) { e.preventDefault(); abrirUsuario(e.target.dataset.id); } });

// ── Janela da pessoa (abas) ─────────────────────────────────────────────
function abas(lista) {
  const el = document.getElementById('mu-abas');
  if (!lista) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = lista.map(([k, l, ic, n]) => `<button type="button" role="tab" id="aba-${k}" aria-controls="pn-${k}" aria-selected="${abaAtual === k}" data-aba="${k}">${ic ? adIc(ic, 'p') : ''}${l}${n ? `<span class="ad-n">${n}</span>` : ''}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('[data-aba]'); if (b) mostrarAba(b.dataset.aba); };
}
function mostrarAba(k) {
  abaAtual = k;
  document.querySelectorAll('#mu-abas [data-aba]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === k)));
  document.querySelectorAll('#mu-body .ad-painel').forEach(p => { p.hidden = p.id !== 'pn-' + k; });
}

async function abrirUsuario(id, abaInicial) {
  const u = todosUsuarios.find(x => x.id === id); if (!u) return;
  usuarioAtual = u; editando = true;
  const proprio = u.id === appState.usuario.id;
  const solUser = solicitacoes.filter(s => s.usuario_id === id);
  const { data: permsDB } = await db.from('usuario_permissoes').select('*').eq('usuario_id', id).eq('ativo', true);
  const permsMap = {}; (permsDB || []).forEach(p => { permsMap[p.modulo] = p; });

  document.getElementById('mu-titulo').textContent = u.nome_completo || 'Usuário';
  document.getElementById('mu-sub').textContent = `${PERFIS[u.perfil] || u.perfil} · ${u.email || ''}`;
  abaAtual = abaInicial || (solUser.length ? 'senha' : (u.bloqueado_inatividade_em || emRevisaoDe(u).length ? 'acessos' : 'dados'));
  abas([['dados', 'Dados', 'user'], ['acessos', 'Acessos', 'escudo'], ['senha', 'Senha', 'chave', solUser.length || ''], ['historico', 'Histórico', 'hist']]);

  document.getElementById('mu-body').innerHTML = `
    <section class="ad-painel" id="pn-dados" role="tabpanel" aria-labelledby="aba-dados">
      <div class="ad-cab">
        <button type="button" class="ad-foto-btn" onclick="${u.avatar_url ? "abrirModalFoto('admin')" : "document.getElementById('inp-avatar-admin').click()"}" aria-label="${u.avatar_url ? 'Ver ou trocar a foto' : 'Adicionar uma foto'}" id="avatar-admin-btn">
          <span id="avatar-admin-wrap">${mkAvatar(u)}</span><span class="ad-cam">${adIc('camera')}</span></button>
        <input type="file" id="inp-avatar-admin" hidden accept=".jpg,.jpeg,.png,.webp" onchange="uploadAvatarAdmin('${esc(u.id)}',this.files[0])">
        <div style="min-width:0"><b>${esc(u.nome_completo || '—')}</b><span class="ad-sub">${esc(u.email || '')}</span>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${pillPerfil(u.perfil)}${situacaoDe(u)}</div></div>
      </div>
      <div class="ad-g2">
        <div class="form-group"><label class="form-label" for="eu-nome">Nome completo</label><input class="form-control" id="eu-nome" type="text" value="${esc(u.nome_completo || '')}"></div>
        <div class="form-group"><label class="form-label" for="eu-perfil">Perfil</label>
          <select class="form-control" id="eu-perfil" ${proprio ? 'disabled aria-describedby="eu-perfil-dica"' : ''}>${PERFIS_LIST.map(p => `<option value="${p}" ${u.perfil === p ? 'selected' : ''}>${esc(PERFIS[p])}</option>`).join('')}</select>
          ${proprio ? '<div class="form-hint" id="eu-perfil-dica">Você não pode mudar o seu próprio perfil.</div>' : ''}</div>
        <div class="form-group"><label class="form-label" for="eu-tel">Telefone</label><input class="form-control" id="eu-tel" type="tel" value="${esc(u.telefone || '')}"></div>
        <div class="form-group"><span class="form-label">WhatsApp</span><label class="ad-chk"><input type="checkbox" id="eu-whats" ${u.telefone_whatsapp ? 'checked' : ''}>Este telefone é WhatsApp</label></div>
      </div>
    </section>
    <section class="ad-painel" id="pn-acessos" role="tabpanel" aria-labelledby="aba-acessos" hidden>
      <p class="ad-dica">Marque só o que a pessoa precisa. <b>${MODULOS_NUCLEO}</b> ficam sempre abertos. O perfil diz o que pode ser
        liberado ("do perfil"); fora dele é <b>extra</b>. Data de fim é opcional (vazio = sem fim). Salvar grava só o que mudou.</p>
      ${responsaveis.has(u.id) ? `<div class="ad-aviso">${adIc('info', 'p')}<span>Responsável ou substituto de atividade: Atividades, TDRs, Produtos e Remanejamento abrem pelo vínculo, mesmo sem o módulo.</span></div>` : ''}
      ${renderPermissoes(u, permsMap)}
    </section>
    <section class="ad-painel" id="pn-senha" role="tabpanel" aria-labelledby="aba-senha" hidden>
      ${solUser.length ? `<div class="ad-aviso">${adIc('sino', 'p')}<span>Pediu nova senha em ${esc(fmtDT(solUser[0].criado_em))}. Defina uma senha temporária abaixo e salve.</span></div>` : ''}
      ${campoSenha('eu-senha', 'Nova senha temporária')}
      <div class="form-hint">A pessoa será obrigada a trocar no próximo acesso. Deixe vazio para não mudar a senha.</div>
    </section>
    <section class="ad-painel" id="pn-historico" role="tabpanel" aria-labelledby="aba-historico" hidden>
      <dl class="ad-dl">
        <dt>Criado em</dt><dd class="ad-mono">${esc(fmtDT(u.criado_em))}</dd>
        <dt>Primeiro acesso</dt><dd class="ad-mono">${esc(fmtDT(u.primeiro_acesso_em))}</dd>
        <dt>Último acesso (mesa)</dt><dd class="ad-mono">${esc(fmtDT(u.ultimo_acesso_em))}</dd>
        <dt>Último acesso (app de campo)</dt><dd class="ad-mono">${esc(fmtDT(u.ultimo_acesso_app_em))}</dd>
        <dt>Entrada</dt><dd>${u.bloqueado_inatividade_em ? 'Suspensa por inatividade em ' + esc(fmtDT(u.bloqueado_inatividade_em))
          : u.liberado_inatividade_em ? 'Liberada em ' + esc(fmtDT(u.liberado_inatividade_em)) : (u.perfil === 'super_admin' ? 'Super Admin nunca é suspenso' : 'Normal')}</dd>
        <dt>Senha temporária</dt><dd>${u.deve_trocar_senha ? 'Sim — ainda não trocou' : 'Não'}</dd>
      </dl>
    </section>`;
  mostrarAba(abaAtual);
  permIni = estadoPerms();

  document.getElementById('mu-footer').innerHTML = `
    ${proprio ? '' : `<button type="button" class="btn ${u.ativo ? 'ad-btn-perigo' : 'btn-secondary'}" onclick="toggleAtivo('${esc(u.id)}',${!!u.ativo})">${u.ativo ? 'Desativar acesso' : 'Reativar acesso'}</button>`}
    ${u.ativo && u.bloqueado_inatividade_em ? `<button type="button" class="btn btn-secondary" onclick="liberarEntrada('${esc(u.id)}')">${adIc('cadeado', 'p')}Liberar entrada</button>` : ''}
    <span class="ad-sp"></span>
    <button type="button" class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
    <button type="button" class="btn btn-primary" id="mu-salvar" onclick="salvarUsuario('${esc(u.id)}')">${adIc('salvar', 'p')}Salvar</button>`;
  adAbrir('modal-usr');
}

function campoSenha(id, rotulo) {
  return `<div class="form-group"><label class="form-label" for="${id}">${rotulo}</label>
    <div class="ad-senha">
      <input class="form-control" id="${id}" type="password" autocomplete="new-password" placeholder="Mínimo de 8 caracteres" oninput="avaliarSenha(this.value,'${id}-bar')">
      <button type="button" class="btn btn-secondary ad-ib" onclick="verSenha('${id}',this)" aria-label="Mostrar a senha" title="Mostrar">${adIc('olho', 'p')}</button>
      <button type="button" class="btn btn-secondary ad-ib" onclick="copiarSenha('${id}')" aria-label="Copiar a senha" title="Copiar">${adIc('copiar', 'p')}</button>
      <button type="button" class="btn btn-secondary" onclick="gerarSenhaAleatoria('${id}')">${adIc('dado', 'p')}Gerar</button>
    </div>
    <div class="ad-forca"><i id="${id}-bar"></i></div></div>`;
}
function verSenha(id, btn) {
  const el = document.getElementById(id); if (!el) return;
  const mostrar = el.type === 'password'; el.type = mostrar ? 'text' : 'password';
  btn.innerHTML = adIc(mostrar ? 'olhoX' : 'olho', 'p');
  btn.setAttribute('aria-label', mostrar ? 'Ocultar a senha' : 'Mostrar a senha'); btn.title = mostrar ? 'Ocultar' : 'Mostrar';
}
async function copiarSenha(id) {
  const v = document.getElementById(id)?.value; if (!v) { toast('Nenhuma senha para copiar.', 'warning'); return; }
  try { await navigator.clipboard.writeText(v); toast('Senha copiada.', 'success'); }
  catch (e) { toast('Não foi possível copiar. Use "mostrar" e copie à mão.', 'warning'); }
}

// ── Acessos ─────────────────────────────────────────────────────────────
// Toda caixa é editável (menos para super_admin, que tem tudo). Em revisão = liberação da migração
// de 26/11/2026 que sai sozinha no prazo se não for confirmada ("Revisei: confirmar…").
const isoLocal = d => d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
function renderPermissoes(u, permsMap) {
  if (u.perfil === 'super_admin') return `<div class="ad-aviso">${adIc('escudo', 'p')}<span>Super Admin tem todos os módulos, sempre. Não há o que liberar ou retirar.</span></div>`;
  const agora = new Date();
  const vivo = p => p && (!p.valido_ate || new Date(p.valido_ate) > agora);
  const rev = Object.values(permsMap).filter(p => vivo(p) && p.em_revisao);
  const prazoRev = rev.length ? rev.map(p => p.valido_ate).sort()[0] : null;
  const topo = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px">
      <button type="button" class="btn btn-secondary" onclick="aplicarPadraoPerfil()">${adIc('check', 'p')}Aplicar o padrão do perfil</button>
      <button type="button" class="btn btn-secondary" onclick="desmarcarTodos()">${adIc('x', 'p')}Desmarcar todos</button></div>
    ${rev.length ? `<div class="ad-aviso">${adIc('relogio', 'p')}<span><b>${rev.length} ${rev.length === 1 ? 'acesso em revisão' : 'acessos em revisão'}</b>:
      saem em ${esc(fmtD(prazoRev))} se não forem confirmados. Desmarque o que a pessoa não precisa e confirme o resto.
      <label class="ad-chk" style="margin-top:6px"><input type="checkbox" id="perm-confirmar" onchange="toggleConfirmarRevisao()">
      Revisei: confirmar os acessos marcados ao salvar</label></span></div>` : ''}`;
  return topo + Object.keys(GRUPOS).map(g => {
    const mods = MODULOS_LISTA.filter(m => (m.grupo || '') === g); if (!mods.length) return '';
    const cab = `<div class="ad-grp">${esc(GRUPOS[g])}${g ? `<button type="button" onclick="toggleGrupo('${g}',true)">marcar todos</button><button type="button" onclick="toggleGrupo('${g}',false)">nenhum</button>` : ''}</div>`;
    return cab + '<div class="ad-perms">' + mods.map(m => {
      const doPerfil = modDoPerfil(m, u.perfil);
      const perm = permsMap[m.id];
      const vv = vivo(perm), venc = perm && !vv, emRev = vv && perm.em_revisao;
      const ate = emRev ? isoLocal(perm.revisao_valido_ate_original) : (vv ? isoLocal(perm.valido_ate) : '');
      const tipo = doPerfil ? 'do perfil' : 'extra';
      const sit = emRev ? `<small class="v">${tipo} · em revisão · sai em ${esc(fmtD(perm.valido_ate))}</small>`
        : vv ? `<small>${tipo} · liberado${perm.valido_ate ? ' até ' + esc(fmtD(perm.valido_ate)) : ' sem fim'}</small>`
        : venc ? `<small class="v">${tipo} · venceu em ${esc(fmtD(perm.valido_ate))}</small>`
        : `<small>${doPerfil ? 'do perfil · não liberado' : 'sem acesso'}</small>`;
      const efeito = `<small class="ad-efeito">${esc(m.efeito || (m.dados ? 'abre os dados no banco' : 'abre a página; os dados seguem o perfil'))}</small>`;
      return `<div class="ad-perm${vv ? ' on' : ''}" id="perm-row-${m.id}">
        <input type="checkbox" id="perm-chk-${m.id}" ${vv ? 'checked' : ''} data-rev="${emRev ? 1 : 0}" onchange="togglePermRow('${m.id}')" aria-describedby="perm-sit-${m.id}">
        ${adIc(m.ic, 'p')}<label for="perm-chk-${m.id}">${esc(m.label)}</label>
        <span id="perm-sit-${m.id}" style="grid-column:3">${sit}</span>${efeito}
        <span class="ad-ate" id="perm-dt-wrap-${m.id}" ${vv ? '' : 'hidden'}><label for="perm-dt-${m.id}">até</label><input type="datetime-local" class="form-control" id="perm-dt-${m.id}" value="${ate}" ${emRev ? 'disabled title="Marque “Revisei” para mudar o prazo"' : ''}></span>
      </div>`;
    }).join('') + '</div>';
  }).join('');
}
function toggleGrupo(g, marcar) {
  MODULOS_LISTA.filter(m => m.grupo === g).forEach(m => { const c = document.getElementById('perm-chk-' + m.id); if (c) { c.checked = marcar; togglePermRow(m.id); } });
}
function aplicarPadraoPerfil() {
  const perfil = usuarioAtual?.perfil;
  MODULOS_LISTA.forEach(m => { const c = document.getElementById('perm-chk-' + m.id); if (c && modDoPerfil(m, perfil) && !c.checked) { c.checked = true; togglePermRow(m.id); } });
  toast('Marcados os módulos do perfil. Desmarque o que não for preciso e salve.', 'info');
}
function desmarcarTodos() {
  MODULOS_LISTA.forEach(m => { const c = document.getElementById('perm-chk-' + m.id); if (c && c.checked) { c.checked = false; togglePermRow(m.id); } });
}
function toggleConfirmarRevisao() {
  const ok = !!document.getElementById('perm-confirmar')?.checked;
  document.querySelectorAll('[id^="perm-chk-"][data-rev="1"]').forEach(c => {
    const d = document.getElementById('perm-dt-' + c.id.slice(9)); if (d) d.disabled = !ok;
  });
}
function togglePermRow(id) {
  const c = document.getElementById('perm-chk-' + id), w = document.getElementById('perm-dt-wrap-' + id);
  if (w) w.hidden = !c.checked;
  document.getElementById('perm-row-' + id)?.classList.toggle('on', c.checked);
}
// Estado atual dos módulos: { modulo: { marcado, ate, rev } } + _confirmar (revisão confirmada)
function estadoPerms() {
  const st = {};
  MODULOS_LISTA.forEach(m => {
    const c = document.getElementById('perm-chk-' + m.id); if (!c) return;
    st[m.id] = { marcado: c.checked, ate: document.getElementById('perm-dt-' + m.id)?.value || '', rev: c.dataset.rev === '1' };
  });
  st._confirmar = !!document.getElementById('perm-confirmar')?.checked;
  return st;
}
// Grava só o que mudou: liberação nova, revisão confirmada, mudança de data ou retirada. Devolve erro ou null.
async function _persistirPermissoes(userId) {
  const eu = appState.usuario.id, agora = new Date().toISOString();
  const atual = estadoPerms(), ops = [];
  const confirmar = atual._confirmar;
  for (const [mod, a] of Object.entries(atual)) {
    if (mod[0] === '_') continue;
    const i = permIni[mod] || { marcado: false, ate: '', rev: false };
    const ate = a.ate ? new Date(a.ate).toISOString() : null;
    if (a.marcado && !i.marcado) {
      ops.push(db.from('usuario_permissoes').upsert({
        usuario_id: userId, modulo: mod, ativo: true, valido_de: agora, valido_ate: ate,
        concedido_por: eu, concedido_em: agora, revogado_por: null, revogado_em: null, motivo: null,
        em_revisao: false, revisao_valido_ate_original: null, aviso_vencimento_em: null,
      }, { onConflict: 'usuario_id,modulo' }));
    } else if (a.marcado && i.marcado && i.rev) {
      if (confirmar) ops.push(db.from('usuario_permissoes').update({
        em_revisao: false, valido_ate: ate, revisao_valido_ate_original: null, revisado_por: eu, revisado_em: agora, aviso_vencimento_em: null,
      }).eq('usuario_id', userId).eq('modulo', mod).eq('ativo', true));
    } else if (a.marcado && i.marcado && a.ate !== i.ate) {
      ops.push(db.from('usuario_permissoes').update({ valido_ate: ate, aviso_vencimento_em: null }).eq('usuario_id', userId).eq('modulo', mod).eq('ativo', true));
    } else if (!a.marcado && i.marcado) {
      ops.push(db.from('usuario_permissoes').update({ ativo: false, em_revisao: false, revogado_por: eu, revogado_em: agora }).eq('usuario_id', userId).eq('modulo', mod).eq('ativo', true));
    }
  }
  if (!ops.length) return null;
  const r = await Promise.all(ops);
  const e = r.find(x => x.error);
  return e ? e.error.message : null;
}

// Liberar a entrada de quem foi suspenso por inatividade (3 dias para entrar)
async function liberarEntrada(id) {
  const u = todosUsuarios.find(x => x.id === id);
  const ok = await adConfirmar({ titulo: 'Liberar a entrada?', texto: `${u?.nome_completo || 'Esta pessoa'} volta a entrar com os módulos que já tinha. Ela tem 3 dias para entrar; se não entrar, a entrada é suspensa de novo. Ela recebe um e-mail avisando.`, ok: 'Liberar entrada' });
  if (!ok) return;
  const { error } = await db.rpc('fn_acesso_liberar_inatividade', { p_usuario: id });
  if (error) { toast('Não foi possível liberar: ' + error.message.replace(/^[A-Z_]+: /, ''), 'error'); return; }
  toast('Entrada liberada.', 'success');
  editando = false; fecharModal(true); await carregarDados();
}

async function salvarUsuario(id) {
  const proprio = id === appState.usuario.id;
  const nome = document.getElementById('eu-nome')?.value.trim();
  const perfil = document.getElementById('eu-perfil')?.value;
  const tel = document.getElementById('eu-tel')?.value.trim();
  const whats = document.getElementById('eu-whats')?.checked;
  const senha = document.getElementById('eu-senha')?.value.trim() || '';
  // Tudo validado ANTES de gravar qualquer coisa
  if (!nome) { mostrarAba('dados'); toast('Informe o nome.', 'error'); document.getElementById('eu-nome').focus(); return; }
  if (senha && senha.length < 8) { mostrarAba('senha'); toast('A senha temporária precisa ter pelo menos 8 caracteres.', 'error'); document.getElementById('eu-senha').focus(); return; }
  const btn = document.getElementById('mu-salvar'); if (btn) btn.disabled = true;
  try {
    const dados = { nome_completo: nome, telefone: tel || null, telefone_whatsapp: whats, atualizado_em: new Date().toISOString() };
    if (!proprio) dados.perfil = perfil;
    const { error } = await db.from('usuarios').update(dados).eq('id', id);
    if (error) { toast('Erro ao salvar os dados: ' + error.message, 'error'); return; }
    const erroPerm = await _persistirPermissoes(id);
    if (erroPerm) { toast('Dados salvos, mas houve erro nos acessos: ' + erroPerm, 'error'); return; }
    if (senha) {
      const { error: sErr } = await db.rpc('fn_resetar_senha_usuario', { p_usuario_id: id, p_nova_senha: senha });
      if (sErr) { toast('Dados salvos, mas a senha não foi trocada: ' + sErr.message, 'error'); return; }
      toast('Alterações e senha temporária salvas.', 'success');
    } else toast('Alterações salvas.', 'success');
    editando = false; fecharModal(true); await carregarDados();
  } finally { if (btn) btn.disabled = false; }
}

async function toggleAtivo(id, estaAtivo) {
  if (id === appState.usuario.id) { toast('Você não pode desativar o seu próprio acesso.', 'warning'); return; }
  const u = todosUsuarios.find(x => x.id === id);
  const ok = await adConfirmar(estaAtivo
    ? { titulo: 'Desativar acesso?', texto: `${u?.nome_completo || 'Esta pessoa'} não conseguirá mais entrar na plataforma. O histórico fica guardado e o acesso pode ser reativado depois.`, ok: 'Desativar', perigo: true }
    : { titulo: 'Reativar acesso?', texto: `${u?.nome_completo || 'Esta pessoa'} volta a entrar com o perfil atual.`, ok: 'Reativar' });
  if (!ok) return;
  const { error } = await db.from('usuarios').update({ ativo: !estaAtivo, atualizado_em: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Não foi possível ' + (estaAtivo ? 'desativar' : 'reativar') + ': ' + error.message, 'error'); return; }
  toast(estaAtivo ? 'Acesso desativado.' : 'Acesso reativado.', 'success');
  editando = false; fecharModal(true); await carregarDados();
}

// ── Novo usuário ────────────────────────────────────────────────────────
function abrirFormNovo() {
  usuarioAtual = null; editando = true; abas(null);
  document.getElementById('mu-titulo').textContent = 'Novo usuário';
  document.getElementById('mu-sub').textContent = 'A pessoa entra com a senha temporária e troca no primeiro acesso. Ela nasce sem módulos: você libera na etapa seguinte.';
  document.getElementById('mu-body').innerHTML = `
    <div class="form-group"><label class="form-label" for="nu-nome">Nome completo <span class="obrig">*</span></label><input class="form-control" id="nu-nome" type="text" autocomplete="off"></div>
    <div class="form-group"><label class="form-label" for="nu-email">E-mail <span class="obrig">*</span></label><input class="form-control" id="nu-email" type="email" placeholder="nome@sema.ac.gov.br" autocomplete="off"></div>
    <div class="ad-g2">
      <div class="form-group"><label class="form-label" for="nu-perfil">Perfil <span class="obrig">*</span></label>
        <select class="form-control" id="nu-perfil">${PERFIS_LIST.map(p => `<option value="${p}" ${p === 'tecnico' ? 'selected' : ''}>${esc(PERFIS[p])}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label" for="nu-tel">Telefone</label><input class="form-control" id="nu-tel" type="tel" placeholder="(68) 99999-9999"></div>
    </div>
    ${campoSenha('nu-senha', 'Senha temporária <span class="obrig">*</span>')}`;
  document.getElementById('mu-footer').innerHTML = `<span class="ad-sp"></span>
    <button type="button" class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
    <button type="button" class="btn btn-primary" id="nu-criar" onclick="criarUsuario()">${adIc('mais', 'p')}Criar usuário</button>`;
  adAbrir('modal-usr', 'nu-nome');
}
async function criarUsuario() {
  const nome = document.getElementById('nu-nome')?.value.trim();
  const email = document.getElementById('nu-email')?.value.trim();
  const perfil = document.getElementById('nu-perfil')?.value;
  const tel = document.getElementById('nu-tel')?.value.trim();
  const senha = document.getElementById('nu-senha')?.value.trim();
  if (!nome || !email || !senha) { toast('Nome, e-mail e senha são obrigatórios.', 'error'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('E-mail inválido.', 'error'); return; }
  if (senha.length < 8) { toast('A senha temporária precisa ter pelo menos 8 caracteres.', 'error'); return; }
  const btn = document.getElementById('nu-criar'); if (btn) btn.disabled = true;
  const { data: novo, error } = await db.rpc('fn_criar_usuario', { p_email: email, p_senha: senha, p_nome: nome, p_perfil: perfil, p_telefone: tel || null });
  if (btn) btn.disabled = false;
  if (error) { toast('Erro ao criar usuário: ' + error.message, 'error'); return; }
  toast('Usuário criado, sem módulos. Agora marque o que a pessoa precisa (ou "Aplicar o padrão do perfil") e salve.', 'success');
  editando = false; fecharModal(true); await carregarDados();
  if (novo && novo.id) abrirUsuario(novo.id, 'acessos');
}

// Fechar a janela: se houve edição, confirma antes de descartar
async function fecharModal(forcar) {
  if (forcar !== true && editando && houveMudanca()) {
    const ok = await adConfirmar({ titulo: 'Descartar alterações?', texto: 'As mudanças feitas nesta janela ainda não foram salvas.', ok: 'Descartar', perigo: true });
    if (!ok) return;
  }
  editando = false; usuarioAtual = null;
  adFechar('modal-usr');
}
AD_FECHAR['modal-usr'] = () => fecharModal();
function houveMudanca() {
  const ids = ['eu-senha', 'nu-nome', 'nu-email', 'nu-senha', 'nu-tel'];
  if (ids.some(i => document.getElementById(i)?.value)) return true;
  const u = usuarioAtual; if (!u) return false;
  if ((document.getElementById('eu-nome')?.value ?? u.nome_completo) !== (u.nome_completo || '')) return true;
  if ((document.getElementById('eu-tel')?.value ?? '') !== (u.telefone || '')) return true;
  if (document.getElementById('eu-perfil') && document.getElementById('eu-perfil').value !== u.perfil) return true;
  if (document.getElementById('eu-whats') && document.getElementById('eu-whats').checked !== !!u.telefone_whatsapp) return true;
  return JSON.stringify(estadoPerms()) !== JSON.stringify(permIni);
}

// ══════════════════════════════════════════════════════════════════════
// MEU PERFIL (todos os perfis)
// ══════════════════════════════════════════════════════════════════════
let idiomaTemp = 'pt';
async function renderPerfilPessoal() {
  const u = appState.usuario; if (!u) return;
  idiomaTemp = u.idioma_pref || 'pt';
  const { data: sols } = await db.from('solicitacoes_senha').select('*').eq('usuario_id', u.id).order('criado_em', { ascending: false }).limit(3);
  const temPend = (sols || []).some(s => s.status === 'pendente');
  const sitSol = s => s.status === 'pendente' ? ['ad-al', 'Aguardando o administrador'] : s.status === 'atendido' ? ['ad-ok', 'Atendido'] : ['ad-ne', 'Cancelado'];
  document.getElementById('perfil-content').innerHTML = `
    <div class="ad-ident">
      <button type="button" class="ad-foto-btn" id="avatar-proprio-btn" onclick="${u.avatar_url ? "abrirModalFoto('proprio')" : "document.getElementById('inp-avatar').click()"}" aria-label="${u.avatar_url ? 'Ver ou trocar a foto' : 'Adicionar uma foto'}">
        <span id="avatar-proprio-wrap">${mkAvatar(u)}</span><span class="ad-cam">${adIc('camera')}</span></button>
      <input type="file" id="inp-avatar" hidden accept=".jpg,.jpeg,.png,.webp" onchange="uploadAvatar(this.files[0])">
      <div style="min-width:0"><b>${esc(u.nome_completo || '—')}</b><small>${esc(u.email || '—')}</small><span class="ad-pill">${esc(PERFIS[u.perfil] || u.perfil || '')}</span></div>
    </div>

    <section class="ad-sec"><h3>${adIc('user', 'p')}Dados pessoais</h3><div class="ad-sec-b">
      <div class="form-group"><label class="form-label" for="p-nome">Nome completo</label><input class="form-control" id="p-nome" type="text" value="${esc(u.nome_completo || '')}"></div>
      <div class="ad-g2">
        <div class="form-group"><label class="form-label" for="p-tel">Telefone</label><input class="form-control" id="p-tel" type="tel" value="${esc(u.telefone || '')}" placeholder="(68) 99999-9999"></div>
        <div class="form-group"><span class="form-label">WhatsApp</span><label class="ad-chk"><input type="checkbox" id="p-whats" ${u.telefone_whatsapp ? 'checked' : ''}>Este telefone é WhatsApp</label></div>
      </div>
      <div class="form-group"><span class="form-label" id="p-idioma-l">Idioma preferido</span>
        <div class="ad-seg" role="group" aria-labelledby="p-idioma-l" id="p-idioma">${['pt', 'en', 'es'].map(l => `<button type="button" data-l="${l}" aria-pressed="${idiomaTemp === l}">${{ pt: 'Português', en: 'English', es: 'Español' }[l]}</button>`).join('')}</div></div>
      <button type="button" class="btn btn-primary" onclick="salvarPerfilPessoal()">${adIc('salvar', 'p')}Salvar dados</button>
    </div></section>

    <section class="ad-sec"><h3>${adIc('cadeado', 'p')}Segurança</h3><div class="ad-sec-b">
      <h4>Alterar minha senha</h4>
      <div class="form-group"><label class="form-label" for="p-senha-atual">Senha atual <span class="obrig">*</span></label><input class="form-control" id="p-senha-atual" type="password" autocomplete="current-password"></div>
      <div class="ad-g2">
        <div class="form-group"><label class="form-label" for="p-senha-nova">Nova senha <span class="obrig">*</span></label><input class="form-control" id="p-senha-nova" type="password" autocomplete="new-password" placeholder="Mínimo de 8 caracteres" oninput="avaliarSenha(this.value,'p-senha-bar')"><div class="ad-forca"><i id="p-senha-bar"></i></div></div>
        <div class="form-group"><label class="form-label" for="p-senha-conf">Confirmar a nova senha <span class="obrig">*</span></label><input class="form-control" id="p-senha-conf" type="password" autocomplete="new-password"></div>
      </div>
      <button type="button" class="btn btn-primary" onclick="trocarSenhaPropria()">${adIc('chave', 'p')}Alterar senha</button>
      <div class="ad-div"></div>
      <h4>Esqueci a senha atual</h4>
      <p class="ad-dica">Peça ao administrador uma senha temporária. Você troca no próximo acesso.</p>
      ${temPend ? `<div class="ad-aviso">${adIc('relogio', 'p')}<span>Você já tem um pedido aguardando o administrador.</span></div>` : ''}
      <button type="button" class="btn btn-secondary" ${temPend ? 'disabled' : ''} onclick="solicitarResetAdmin()">${adIc('enviar', 'p')}Pedir senha temporária</button>
      ${(sols || []).length ? `<ul class="ad-sols" aria-label="Pedidos recentes">${sols.map(s => { const [c, t] = sitSol(s); return `<li><span>${t}</span><span class="ad-pill ${c}">${esc(fmtDT(s.criado_em))}</span></li>`; }).join('')}</ul>` : ''}
    </div></section>
    <p class="ad-rodape">Cadastrado em ${esc(fmtDT(u.criado_em))} · Último acesso: ${esc(fmtDT(u.ultimo_acesso_em))}</p>`;
  document.getElementById('p-idioma').onclick = e => {
    const b = e.target.closest('[data-l]'); if (!b) return; idiomaTemp = b.dataset.l;
    document.querySelectorAll('#p-idioma [data-l]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  };
}
async function salvarPerfilPessoal() {
  const nome = document.getElementById('p-nome')?.value.trim();
  const tel = document.getElementById('p-tel')?.value.trim();
  const whats = document.getElementById('p-whats')?.checked;
  if (!nome) { toast('Informe o nome.', 'error'); return; }
  const { error } = await db.from('usuarios').update({ nome_completo: nome, telefone: tel || null, telefone_whatsapp: whats, idioma_pref: idiomaTemp, atualizado_em: new Date().toISOString() }).eq('id', appState.usuario.id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  if (idiomaTemp !== appState.idioma) { appState.idioma = idiomaTemp; try { localStorage.setItem('dima_idioma', idiomaTemp); } catch (e) {} }
  appState.usuario.nome_completo = nome; appState.usuario.telefone = tel;
  toast('Dados salvos.', 'success');
}
async function trocarSenhaPropria() {
  const atual = document.getElementById('p-senha-atual')?.value;
  const nova = document.getElementById('p-senha-nova')?.value;
  const conf = document.getElementById('p-senha-conf')?.value;
  if (!atual || !nova || !conf) { toast('Preencha os três campos de senha.', 'error'); return; }
  if (nova.length < 8) { toast('A nova senha precisa ter pelo menos 8 caracteres.', 'error'); return; }
  if (nova !== conf) { toast('A nova senha e a confirmação não são iguais.', 'error'); return; }
  // Confere a senha atual entrando de novo e restaura a sessão original
  const email = appState.usuario.email;
  const { data: sessaoOriginal } = await db.auth.getSession();
  const { error: loginErr } = await db.auth.signInWithPassword({ email, password: atual });
  if (sessaoOriginal?.session) await db.auth.setSession(sessaoOriginal.session);
  if (loginErr) { toast('Senha atual incorreta.', 'error'); return; }
  const { error } = await db.auth.updateUser({ password: nova });
  if (error) { toast('Erro ao alterar a senha: ' + error.message, 'error'); return; }
  await db.from('usuarios').update({ deve_trocar_senha: false, senha_temporaria_usada: true, atualizado_em: new Date().toISOString() }).eq('id', appState.usuario.id);
  ['p-senha-atual', 'p-senha-nova', 'p-senha-conf'].forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
  avaliarSenha('', 'p-senha-bar');
  toast('Senha alterada.', 'success');
}
async function solicitarResetAdmin() {
  const { error } = await db.from('solicitacoes_senha').insert({ usuario_id: appState.usuario.id, status: 'pendente', motivo: 'Solicitação via sistema' });
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Pedido enviado. O administrador vai definir uma senha temporária.', 'success');
  renderPerfilPessoal();
}

// ══════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ══════════════════════════════════════════════════════════════════════
function avaliarSenha(senha, barId) {
  const bar = document.getElementById(barId); if (!bar) return;
  let f = 0;
  if (senha.length >= 8) f += 25; if (senha.length >= 12) f += 15;
  if (/[A-Z]/.test(senha)) f += 20; if (/[0-9]/.test(senha)) f += 20; if (/[^A-Za-z0-9]/.test(senha)) f += 20;
  bar.style.width = f + '%'; bar.className = !senha ? '' : f < 40 ? 'f1' : f < 70 ? 'f2' : 'f3';
}
// Senha aleatória (crypto); fica no campo, oculta — use "mostrar" ou "copiar"
function gerarSenhaAleatoria(campoId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
  const r = new Uint32Array(12); crypto.getRandomValues(r);
  const senha = Array.from(r, n => chars[n % chars.length]).join('');
  const el = document.getElementById(campoId); if (!el) return;
  el.value = senha; avaliarSenha(senha, campoId + '-bar');
  toast('Senha gerada no campo. Use "copiar" para passá-la à pessoa.', 'info');
}

// ── Foto de perfil (bucket público 'avatares', caminho por uuid) ────────
function validarFoto(file) {
  if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) { toast('Formato inválido. Use JPG, PNG ou WEBP.', 'error'); return false; }
  if (file.size > 2 * 1024 * 1024) { toast('Imagem muito grande. Máximo de 2 MB.', 'error'); return false; }
  return true;
}
async function enviarFoto(usuarioId, file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `avatares/${usuarioId}/avatar.${ext}`;
  const { error: upErr } = await db.storage.from('avatares').upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) { toast('Erro no envio: ' + upErr.message, 'error'); return null; }
  const { data } = db.storage.from('avatares').getPublicUrl(path);
  const url = data.publicUrl + '?t=' + Date.now();
  const { error } = await db.from('usuarios').update({ avatar_url: url, atualizado_em: new Date().toISOString() }).eq('id', usuarioId);
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return null; }
  return url;
}
function atualizarSidebarAvatar(u) {
  const sb = document.querySelector('.sidebar-avatar'); if (!sb) return;
  if (u.avatar_url) {
    sb.style.background = 'transparent'; sb.style.padding = '0';
    sb.innerHTML = ''; const img = document.createElement('img'); img.src = u.avatar_url; img.alt = ''; img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%'; sb.appendChild(img);
  } else { sb.style.background = ''; sb.style.padding = ''; sb.textContent = mkIniciais(u.nome_completo); }
}
function redesenharFoto(contexto, u) {
  const wrap = document.getElementById(contexto === 'admin' ? 'avatar-admin-wrap' : 'avatar-proprio-wrap');
  const btn = document.getElementById(contexto === 'admin' ? 'avatar-admin-btn' : 'avatar-proprio-btn');
  if (wrap) wrap.innerHTML = mkAvatar(u);
  if (btn) {
    btn.setAttribute('onclick', u.avatar_url ? `abrirModalFoto('${contexto}')` : `document.getElementById('${contexto === 'admin' ? 'inp-avatar-admin' : 'inp-avatar'}').click()`);
    btn.setAttribute('aria-label', u.avatar_url ? 'Ver ou trocar a foto' : 'Adicionar uma foto');
  }
}
async function uploadAvatar(file) {
  if (!file || !validarFoto(file)) return;
  toast('Enviando foto…', 'info');
  const url = await enviarFoto(appState.usuario.id, file); if (!url) return;
  appState.usuario.avatar_url = url;
  redesenharFoto('proprio', appState.usuario); atualizarSidebarAvatar(appState.usuario);
  toast('Foto atualizada.', 'success');
}
async function uploadAvatarAdmin(usuarioId, file) {
  if (!file || !validarFoto(file)) return;
  toast('Enviando foto…', 'info');
  const url = await enviarFoto(usuarioId, file); if (!url) return;
  const uLocal = todosUsuarios.find(x => x.id === usuarioId); if (uLocal) uLocal.avatar_url = url;
  if (usuarioAtual && usuarioAtual.id === usuarioId) { usuarioAtual.avatar_url = url; redesenharFoto('admin', usuarioAtual); }
  if (usuarioId === appState.usuario.id) { appState.usuario.avatar_url = url; atualizarSidebarAvatar(appState.usuario); }
  filtrar();
  toast('Foto atualizada.', 'success');
}
let _fotoContexto = null; // 'proprio' | 'admin'
function abrirModalFoto(contexto) {
  const u = contexto === 'admin' ? usuarioAtual : appState.usuario;
  if (!u?.avatar_url) return;
  _fotoContexto = contexto;
  document.getElementById('modal-foto-img').src = u.avatar_url;
  document.getElementById('modal-foto-nome').textContent = u.nome_completo || '—';
  document.getElementById('modal-foto-cargo').textContent = PERFIS[u.perfil] || u.perfil || '';
  adAbrir('modal-foto');
}
function trocarFotoModal() {
  adFechar('modal-foto');
  const inputId = _fotoContexto === 'admin' ? 'inp-avatar-admin' : 'inp-avatar';
  setTimeout(() => document.getElementById(inputId)?.click(), 120);
}
async function removerFotoModal() {
  const u = _fotoContexto === 'admin' ? usuarioAtual : appState.usuario; if (!u) return;
  const ok = await adConfirmar({ titulo: 'Remover a foto?', texto: 'A foto de perfil deixa de aparecer e voltam as iniciais.', ok: 'Remover', perigo: true });
  if (!ok) return;
  const { error } = await db.from('usuarios').update({ avatar_url: null, atualizado_em: new Date().toISOString() }).eq('id', u.id);
  if (error) { toast('Erro ao remover a foto: ' + error.message, 'error'); return; }
  adFechar('modal-foto');
  u.avatar_url = null;
  const uLocal = todosUsuarios.find(x => x.id === u.id); if (uLocal) uLocal.avatar_url = null;
  redesenharFoto(_fotoContexto, u);
  if (u.id === appState.usuario.id) { appState.usuario.avatar_url = null; atualizarSidebarAvatar(appState.usuario); }
  if (_fotoContexto === 'admin') filtrar();
  toast('Foto removida.', 'success');
}

// ══════════════════════════════════════════════════════════════════════
// PEDIDOS DE ACESSO (fn_acesso_pedir / fn_publico_pedir_liberacao → fn_acesso_decidir)
// ══════════════════════════════════════════════════════════════════════
function abrirPedidos() {
  usuarioAtual = null; editando = false; abas(null);
  document.getElementById('mu-titulo').textContent = 'Pedidos de acesso';
  document.getElementById('mu-sub').textContent = 'Módulos pedidos pelas pessoas e pedidos de liberação da entrada (suspensos por inatividade).';
  const nome = id => todosUsuarios.find(u => u.id === id)?.nome_completo || 'Usuário';
  document.getElementById('mu-body').innerHTML = pedidosAcesso.length ? pedidosAcesso.map(p => `
    <div class="ad-card" style="padding:12px;margin-bottom:10px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <b style="flex:1;min-width:160px">${esc(nome(p.usuario_id))}</b>
        <span class="ad-pill ${p.tipo === 'liberacao' ? 'ad-al' : 'ad-in'}">${p.tipo === 'liberacao' ? 'Liberar a entrada' : esc(modLabel(p.modulo))}</span>
        <small class="ad-mono">${esc(fmtDT(p.criado_em))}${p.origem === 'entrada' ? ' · pela tela de entrada' : ''}</small>
      </div>
      ${p.justificativa ? `<p class="ad-dica" style="margin:6px 0 0">${esc(p.justificativa)}</p>` : ''}
      <div class="ad-g2" style="margin-top:8px">
        ${p.tipo === 'modulo' ? `<div class="form-group"><label class="form-label" for="pa-ate-${p.id}">Liberar até (opcional)</label>
          <input type="datetime-local" class="form-control" id="pa-ate-${p.id}"></div>` : '<div></div>'}
        <div class="form-group"><label class="form-label" for="pa-par-${p.id}">Parecer (opcional)</label>
          <input type="text" class="form-control" id="pa-par-${p.id}" maxlength="1000"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-secondary" onclick="decidirPedido('${esc(p.id)}', false)">Recusar</button>
        <button type="button" class="btn btn-primary" onclick="decidirPedido('${esc(p.id)}', true)">${adIc('check', 'p')}${p.tipo === 'liberacao' ? 'Liberar entrada' : 'Liberar módulo'}</button>
      </div>
    </div>`).join('') : '<p class="ad-vazio">Nenhum pedido aguardando.</p>';
  document.getElementById('mu-footer').innerHTML = `<span class="ad-sp"></span><button type="button" class="btn btn-secondary" onclick="fecharModal(true)">Fechar</button>`;
  adAbrir('modal-usr');
}
async function decidirPedido(id, aprovar) {
  const ate = document.getElementById('pa-ate-' + id)?.value;
  const parecer = document.getElementById('pa-par-' + id)?.value.trim() || null;
  const { error } = await db.rpc('fn_acesso_decidir', { p_pedido: id, p_aprovar: aprovar,
    p_valido_ate: ate ? new Date(ate).toISOString() : null, p_parecer: parecer });
  if (error) { toast('Não foi possível decidir: ' + error.message.replace(/^[A-Z_]+: /, ''), 'error'); return; }
  toast(aprovar ? 'Acesso liberado.' : 'Pedido recusado.', 'success');
  await carregarDados(); abrirPedidos();
}

// ══════════════════════════════════════════════════════════════════════
// RELATÓRIO "QUEM ACESSA O QUÊ" (A4 pela FolhaA4 + planilha ExcelJS)
// ══════════════════════════════════════════════════════════════════════
function _acessosLinhas() {
  const agora = new Date();
  return todosUsuarios.filter(u => u.ativo).map(u => {
    const vivos = u.perfil === 'super_admin' ? [] : permsTodas.filter(p => p.usuario_id === u.id && (!p.valido_ate || new Date(p.valido_ate) > agora));
    return { u, vivos: vivos.sort((a, b) => MODULOS_LISTA.findIndex(m => m.id === a.modulo) - MODULOS_LISTA.findIndex(m => m.id === b.modulo)) };
  });
}
function _origemTxt(u, p) {
  const m = MODULOS_LISTA.find(x => x.id === p.modulo);
  return m && modDoPerfil(m, u.perfil) ? 'do perfil' : 'extra';
}
function relatorioAcessos() {
  const w = FolhaA4.janela(); if (!w) return;   // antes de qualquer await (pop-up)
  const linhas = _acessosLinhas();
  const sit = u => u.bloqueado_inatividade_em ? 'Suspenso por inatividade' : 'Ativo';
  const corpo = `
    <div class="rep-stats">
      <div class="rep-stat"><div class="rep-stat-lbl">Pessoas ativas</div><div class="rep-stat-val">${linhas.length}</div></div>
      <div class="rep-stat"><div class="rep-stat-lbl">Com acesso em revisão</div><div class="rep-stat-val">${linhas.filter(l => l.vivos.some(p => p.em_revisao)).length}</div></div>
      <div class="rep-stat"><div class="rep-stat-lbl">Suspensas por inatividade</div><div class="rep-stat-val">${linhas.filter(l => l.u.bloqueado_inatividade_em).length}</div></div>
    </div>
    <p style="font-size:9px;color:#555">Sempre abertos para todos: ${esc(MODULOS_NUCLEO)}. Responsáveis e substitutos de atividade abrem Atividades, TDRs,
      Produtos e Remanejamento pelo vínculo. "do perfil" = está no padrão do perfil; "extra" = além dele.</p>
    <table class="rep-tbl"><thead><tr><th>Pessoa</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th>Módulos liberados</th></tr></thead><tbody>
    ${linhas.map(({ u, vivos }) => `<tr><td><b>${esc(u.nome_completo || '—')}</b><br><small>${esc(u.email || '')}</small>${responsaveis.has(u.id) ? '<br><small>responsável de atividade</small>' : ''}</td>
      <td>${esc(PERFIS[u.perfil] || u.perfil)}</td><td>${esc(sit(u))}</td><td class="mono">${esc(fmtDT(ultimoDe(u)))}</td>
      <td>${u.perfil === 'super_admin' ? 'Todos os módulos' : vivos.length ? vivos.map(p => esc(modLabel(p.modulo))
        + ` <small>(${_origemTxt(u, p)}${p.em_revisao ? ', em revisão até ' + esc(fmtD(p.valido_ate)) : p.valido_ate ? ', até ' + esc(fmtD(p.valido_ate)) : ''})</small>`).join('; ') : 'Nenhum (só o núcleo)'}</td></tr>`).join('')}
    </tbody></table>`;
  FolhaA4.escrever(w, { titulo: 'Quem acessa o quê', selo: 'Usuários', tema: 'usuarios', paisagem: true,
    periodo: 'Situação em ' + new Date().toLocaleDateString('pt-BR'), corpo, nomeArquivo: 'Acessos_por_usuario' });
  _planilhaAcessos(linhas).catch(e => console.warn('[usuarios] planilha:', e));
}
async function _planilhaAcessos(linhas) {
  if (!window.ExcelJS) await new Promise((ok, erro) => {
    const sc = document.createElement('script'); sc.src = '../js/vendor/exceljs-4.4.0.bare.min.js'; sc.onload = ok; sc.onerror = erro; document.head.appendChild(sc);
  });
  const wb = new ExcelJS.Workbook();
  const sh = wb.addWorksheet('Acessos');
  sh.columns = [
    { header: 'Pessoa', key: 'nome', width: 32 }, { header: 'E-mail', key: 'email', width: 32 }, { header: 'Perfil', key: 'perfil', width: 16 },
    { header: 'Situação', key: 'sit', width: 22 }, { header: 'Módulo', key: 'mod', width: 34 }, { header: 'Origem', key: 'orig', width: 12 },
    { header: 'Em revisão', key: 'rev', width: 11 }, { header: 'Vale até', key: 'ate', width: 14 }, { header: 'Liberado em', key: 'em', width: 14 },
    { header: 'Último acesso', key: 'ult', width: 18 },
  ];
  sh.getRow(1).font = { bold: true }; sh.views = [{ state: 'frozen', ySplit: 1 }];
  const dt = d => d ? new Date(d) : null;
  linhas.forEach(({ u, vivos }) => {
    const base = { nome: u.nome_completo, email: u.email, perfil: PERFIS[u.perfil] || u.perfil,
      sit: u.bloqueado_inatividade_em ? 'Suspenso por inatividade' : 'Ativo', ult: dt(ultimoDe(u)) };
    if (u.perfil === 'super_admin') sh.addRow({ ...base, mod: 'Todos os módulos', orig: 'perfil' });
    else if (!vivos.length) sh.addRow({ ...base, mod: 'Nenhum (só o núcleo)' });
    else vivos.forEach(p => sh.addRow({ ...base, mod: modLabel(p.modulo), orig: _origemTxt(u, p), rev: p.em_revisao ? 'sim' : 'não',
      ate: dt(p.valido_ate), em: dt(p.concedido_em) }));
  });
  ['ate', 'em', 'ult'].forEach(k => { sh.getColumn(k).numFmt = 'dd/mm/yyyy'; });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = 'Acessos_por_usuario_' + new Date().toISOString().slice(0, 10) + '.xlsx';
  document.body.appendChild(a); a.click(); a.remove();
}
