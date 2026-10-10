// ── Usuários (super_admin) e Meu perfil (demais) ─────────────────────────
// Visual: css/administracao.css (prefixo ad-) + js/administracao.js (adIc, adAbrir/adFechar, adConfirmar).
// Regras de quem pode o quê ficam no banco: perfil/ativo protegidos por trigger em usuarios,
// fn_criar_usuario e fn_resetar_senha_usuario só para super_admin ativo (rem. 20261010_seg_senha_e_mapa).

const PERFIS = {
  super_admin: 'Super Admin', coordenacao: 'Coordenação', tecnico: 'Técnico',
  financeiro: 'Financeiro', consultor_externo: 'Consultor Externo', visualizador: 'Visualizador',
};
const PERFIS_LIST = Object.keys(PERFIS);

// Módulos que podem ser liberados além do perfil. perfis = quem já tem pelo perfil (null = todos).
const MODULOS_LISTA = [
  { id: 'dashboard',    ic: 'painel',  label: 'Visão Geral',          perfis: null },
  { id: 'atividades',   ic: 'lista',   label: 'Atividades',           perfis: null },
  { id: 'tdrs',         ic: 'doc',     label: 'TDRs',                 perfis: null },
  { id: 'matriz',       ic: 'alvo',    label: 'Matriz de Resultados', perfis: null },
  { id: 'fornecedores', ic: 'predio',  label: 'Fornecedores',         perfis: ['super_admin', 'coordenacao', 'financeiro'] },
  { id: 'contratos',    ic: 'contrato', label: 'Contratos',           perfis: ['super_admin', 'coordenacao', 'financeiro'] },
  { id: 'produtos',     ic: 'pacote',  label: 'Produtos Entregues',   perfis: ['super_admin', 'coordenacao', 'tecnico'] },
  { id: 'financeiro',   ic: 'moeda',   label: 'Financeiro',           perfis: ['super_admin', 'coordenacao', 'financeiro'] },
  { id: 'viagens',      ic: 'aviao',   label: 'Viagens',              perfis: ['super_admin', 'coordenacao', 'financeiro', 'tecnico'] },
  { id: 'repositorio',  ic: 'link',    label: 'Repositório',          perfis: null },
  { id: 'formularios',  ic: 'form',    label: 'Guia Formulários',     perfis: null },
  { id: 'usuarios',     ic: 'users',   label: 'Usuários',             perfis: ['super_admin'] },
  // App de campo do Diagnóstico: técnico e consultor externo só com concessão (com prazo)
  { id: 'diagnostico',  ic: 'campo',   label: 'Diagnóstico Socioambiental', perfis: ['super_admin', 'coordenacao'] },
  // Modo treino (fichas TRE-): técnico precisa também de 'diagnostico'; coordenação com este módulo entra SÓ em treino
  { id: 'diagnostico_treino', ic: 'frasco', label: 'Diagnóstico — modo treino', perfis: ['super_admin'] },
  // Central de Relatórios (prefixo relatorios_): super_admin e coordenação nativos; demais por concessão
  { id: 'relatorios_financeiro',   ic: 'moeda',    label: 'Financeiro',        grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_contratos',    ic: 'contrato', label: 'Contratos',         grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_fornecedores', ic: 'predio',   label: 'Fornecedores',      grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_produtos',     ic: 'pacote',   label: 'Produtos/Entregas', grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_tdrs',         ic: 'doc',      label: 'TDRs',              grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_atividades',   ic: 'lista',    label: 'Atividades',        grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_matriz',       ic: 'alvo',     label: 'Matriz',            grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  { id: 'relatorios_viagens',      ic: 'aviao',    label: 'Viagens',           grupo: 'relatorios', perfis: ['super_admin', 'coordenacao'] },
  // Aba especial da Visão Geral
  { id: 'dashboard_cobertura', ic: 'graf', label: 'Cobertura de Indicadores', grupo: 'dashboard_extra', perfis: ['super_admin', 'coordenacao'] },
];
const GRUPOS = { '': 'Módulos', relatorios: 'Central de Relatórios', dashboard_extra: 'Painéis extras da Visão Geral' };
const modLabel = id => { const m = MODULOS_LISTA.find(x => x.id === id); return m ? (m.grupo === 'relatorios' ? 'Relatório ' + m.label : m.label) : id; };
const modDoPerfil = (m, perfil) => !m.perfis || m.perfis.includes(perfil);

let todosUsuarios = [], solicitacoes = [], permsTodas = [];
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
          <button type="button" class="btn btn-primary" onclick="abrirFormNovo()">${adIc('mais', 'p')}Novo usuário</button></div>
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
            <thead><tr><th>Pessoa</th><th>Perfil</th><th>Acessos extras</th><th>Último acesso</th><th>Situação</th></tr></thead>
            <tbody id="tbody-usuarios"></tbody>
          </table>
        </div>
      </div>` + '</div></div></div>';
    adSeletorTema(); carregarLogosSidebar();
    document.getElementById('f-busca').addEventListener('input', e => { filtro.busca = e.target.value; filtrar(); });
    document.getElementById('f-situacao').addEventListener('change', e => { filtro.situacao = e.target.value; filtrar(); });
    await carregarDados();
    if (new URLSearchParams(location.search).get('self') === '1') abrirUsuario(appState.usuario.id);
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
  const [{ data: u }, { data: s }, { data: p }] = await Promise.all([
    db.from('usuarios').select('*').order('nome_completo'),
    db.from('solicitacoes_senha').select('*').eq('status', 'pendente'),
    db.from('usuario_permissoes').select('usuario_id,modulo,valido_ate').eq('ativo', true),
  ]);
  todosUsuarios = u || []; solicitacoes = s || []; permsTodas = p || [];
  renderStats(); renderSegPerfil(); filtrar();
}

function renderStats() {
  const t = todosUsuarios, ativos = t.filter(u => u.ativo);
  const trocar = t.filter(u => u.ativo && u.deve_trocar_senha).length;
  const pedidos = new Set(solicitacoes.map(s => s.usuario_id)).size;
  const cont = {}; ativos.forEach(u => { cont[u.perfil] = (cont[u.perfil] || 0) + 1; });
  const mix = PERFIS_LIST.filter(p => cont[p]).map(p => `<i style="flex:${cont[p]};background:var(--ad-p-${p})" title="${esc(PERFIS[p])}: ${cont[p]}"></i>`).join('');
  const leg = PERFIS_LIST.filter(p => cont[p]).map(p => `${cont[p]} ${esc(PERFIS[p].split(' ')[0].toLowerCase())}`).join(' · ');
  const rap = (k, cls, ic, l, v, s) => `<button type="button" class="ad-kpi${cls}" aria-pressed="${filtro.rapido === k}" onclick="filtroRapido('${k}')">
      <span class="ad-kpi-l">${adIc(ic, 'p')}${l}</span><span class="ad-kpi-v">${v}</span><span class="ad-kpi-s">${s}</span></button>`;
  document.getElementById('stats').innerHTML = `
    <div class="ad-kpi"><span class="ad-kpi-l">${adIc('users', 'p')}Ativos</span><span class="ad-kpi-v">${ativos.length}</span><span class="ad-kpi-s">de ${t.length} cadastrados</span></div>
    <div class="ad-kpi"><span class="ad-kpi-l">${adIc('escudo', 'p')}Por perfil</span><div class="ad-mix" role="img" aria-label="${esc(leg)}">${mix}</div><span class="ad-kpi-s">${leg || '—'}</span></div>
    ${rap('trocar', '', 'chave', 'Devem trocar a senha', trocar, trocar ? 'senha temporária em uso · ver só esses' : 'nenhum pendente')}
    ${rap('pedido', pedidos ? ' al' : '', 'sino', 'Pedidos de nova senha', pedidos, pedidos ? 'aguardando você · ver só esses' : 'nenhum pedido')}`;
}
function filtroRapido(k) { filtro.rapido = filtro.rapido === k ? '' : k; if (filtro.rapido) { filtro.situacao = ''; document.getElementById('f-situacao').value = ''; } renderStats(); filtrar(); }

function renderSegPerfil() {
  const presentes = PERFIS_LIST.filter(p => todosUsuarios.some(u => u.perfil === p));
  const b = (k, l) => `<button type="button" aria-pressed="${filtro.perfil === k}" data-p="${k}">${esc(l)}</button>`;
  const el = document.getElementById('f-perfil');
  el.innerHTML = b('', 'Todos') + presentes.map(p => b(p, PERFIS[p])).join('');
  el.onclick = e => { const x = e.target.closest('[data-p]'); if (!x) return; filtro.perfil = x.dataset.p; renderSegPerfil(); filtrar(); };
}

function extrasDe(u) {
  return permsTodas.filter(p => p.usuario_id === u.id).filter(p => {
    const m = MODULOS_LISTA.find(x => x.id === p.modulo); return !m || !modDoPerfil(m, u.perfil);
  });
}
function pillsExtras(u) {
  const ex = extrasDe(u); if (!ex.length) return '<span class="ad-mono ad-nada">—</span>';
  const agora = new Date();
  const pills = ex.slice(0, 3).map(p => {
    const venc = p.valido_ate && new Date(p.valido_ate) < agora;
    const quando = p.valido_ate ? (venc ? ' · vencido' : ' · até ' + fmtD(p.valido_ate)) : '';
    return `<span class="ad-pill ${venc ? 'ad-ne' : 'ad-in'}">${esc(modLabel(p.modulo))}${quando}</span>`;
  }).join('');
  return `<div class="ad-extras">${pills}${ex.length > 3 ? `<span class="ad-pill ad-ne">+${ex.length - 3}</span>` : ''}</div>`;
}
function situacaoDe(u) {
  if (!u.ativo) return '<span class="ad-pill ad-ne">Inativo</span>';
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
    if (b && !semAcento((u.nome_completo || '') + ' ' + (u.email || '')).includes(b)) return false;
    return true;
  });
  const tbody = document.getElementById('tbody-usuarios'); if (!tbody) return;
  document.getElementById('f-cont').textContent = fil.length + (fil.length === 1 ? ' pessoa' : ' pessoas');
  tbody.innerHTML = fil.length ? fil.map(u => `<tr class="${u.ativo ? '' : 'off'}" data-id="${esc(u.id)}" tabindex="0" aria-label="Abrir ${esc(u.nome_completo || 'usuário')}">
      <td class="c-pess"><div class="ad-pess">${mkAvatar(u)}<div><b>${esc(u.nome_completo || '—')}${u.id === appState.usuario.id ? ' <span class="ad-pill ad-ne">você</span>' : ''}</b><small>${esc(u.email || '—')}</small></div></div></td>
      <td>${pillPerfil(u.perfil)}</td>
      <td class="c-extras">${pillsExtras(u)}</td>
      <td class="c-acesso ad-mono">${esc(fmtAcesso(u.ultimo_acesso_em))}</td>
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

async function abrirUsuario(id) {
  const u = todosUsuarios.find(x => x.id === id); if (!u) return;
  usuarioAtual = u; editando = true;
  const proprio = u.id === appState.usuario.id;
  const solUser = solicitacoes.filter(s => s.usuario_id === id);
  const { data: permsDB } = await db.from('usuario_permissoes').select('*').eq('usuario_id', id).eq('ativo', true);
  const permsMap = {}; (permsDB || []).forEach(p => { permsMap[p.modulo] = p; });

  document.getElementById('mu-titulo').textContent = u.nome_completo || 'Usuário';
  document.getElementById('mu-sub').textContent = `${PERFIS[u.perfil] || u.perfil} · ${u.email || ''}`;
  abaAtual = solUser.length ? 'senha' : 'dados';
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
      <p class="ad-dica">Os acessos <b>pelo perfil</b> ficam marcados e travados. Os <b>extras</b> podem ter data de fim (vazio = sem fim). Salvar grava só o que mudou.</p>
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
        <dt>Último acesso</dt><dd class="ad-mono">${esc(fmtDT(u.ultimo_acesso_em))}</dd>
        <dt>Senha temporária</dt><dd>${u.deve_trocar_senha ? 'Sim — ainda não trocou' : 'Não'}</dd>
      </dl>
    </section>`;
  mostrarAba(abaAtual);
  permIni = estadoPerms();

  document.getElementById('mu-footer').innerHTML = `
    ${proprio ? '' : `<button type="button" class="btn ${u.ativo ? 'ad-btn-perigo' : 'btn-secondary'}" onclick="toggleAtivo('${esc(u.id)}',${!!u.ativo})">${u.ativo ? 'Desativar acesso' : 'Reativar acesso'}</button>`}
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
function renderPermissoes(u, permsMap) {
  const agora = new Date();
  return Object.keys(GRUPOS).map(g => {
    const mods = MODULOS_LISTA.filter(m => (m.grupo || '') === g); if (!mods.length) return '';
    const algumLivre = mods.some(m => !modDoPerfil(m, u.perfil));
    const cab = `<div class="ad-grp">${esc(GRUPOS[g])}${g && algumLivre ? `<button type="button" onclick="toggleGrupo('${g}',true)">marcar todos</button><button type="button" onclick="toggleGrupo('${g}',false)">nenhum</button>` : ''}</div>`;
    return cab + '<div class="ad-perms">' + mods.map(m => {
      const doPerfil = modDoPerfil(m, u.perfil);
      const perm = permsMap[m.id];
      const venc = perm && perm.valido_ate && new Date(perm.valido_ate) < agora;
      const ate = perm && perm.valido_ate ? new Date(new Date(perm.valido_ate).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      const marc = doPerfil || !!perm;
      const sit = doPerfil ? '<small>pelo perfil</small>'
        : perm ? (venc ? `<small class="v">extra vencido em ${esc(fmtD(perm.valido_ate))}</small>` : `<small>extra${perm.valido_ate ? ' · até ' + esc(fmtD(perm.valido_ate)) : ' · sem fim'}</small>`)
        : '<small>sem acesso</small>';
      return `<div class="ad-perm${marc ? ' on' : ''}" id="perm-row-${m.id}">
        <input type="checkbox" id="perm-chk-${m.id}" ${marc ? 'checked' : ''} ${doPerfil ? 'disabled' : ''} onchange="togglePermRow('${m.id}')" aria-describedby="perm-sit-${m.id}">
        ${adIc(m.ic, 'p')}<label for="perm-chk-${m.id}">${esc(m.label)}</label>
        <span id="perm-sit-${m.id}" style="grid-column:3">${sit}</span>
        ${doPerfil ? '' : `<span class="ad-ate" id="perm-dt-wrap-${m.id}" ${perm ? '' : 'hidden'}><label for="perm-dt-${m.id}">até</label><input type="datetime-local" class="form-control" id="perm-dt-${m.id}" value="${ate}"></span>`}
      </div>`;
    }).join('') + '</div>';
  }).join('');
}
function toggleGrupo(g, marcar) {
  MODULOS_LISTA.filter(m => m.grupo === g).forEach(m => { const c = document.getElementById('perm-chk-' + m.id); if (c && !c.disabled) { c.checked = marcar; togglePermRow(m.id); } });
}
function togglePermRow(id) {
  const c = document.getElementById('perm-chk-' + id), w = document.getElementById('perm-dt-wrap-' + id);
  if (w) w.hidden = !c.checked;
  document.getElementById('perm-row-' + id)?.classList.toggle('on', c.checked);
}
// Estado atual dos módulos editáveis: { modulo: { marcado, ate } }
function estadoPerms() {
  const st = {};
  MODULOS_LISTA.forEach(m => {
    const c = document.getElementById('perm-chk-' + m.id); if (!c || c.disabled) return;
    st[m.id] = { marcado: c.checked, ate: document.getElementById('perm-dt-' + m.id)?.value || '' };
  });
  return st;
}
// Grava só o que mudou: concessão nova, mudança de data ou revogação. Devolve erro ou null.
async function _persistirPermissoes(userId) {
  const eu = appState.usuario.id, agora = new Date().toISOString();
  const atual = estadoPerms(), ops = [];
  for (const [mod, a] of Object.entries(atual)) {
    const i = permIni[mod] || { marcado: false, ate: '' };
    const ate = a.ate ? new Date(a.ate).toISOString() : null;
    if (a.marcado && !i.marcado) {
      ops.push(db.from('usuario_permissoes').upsert({
        usuario_id: userId, modulo: mod, ativo: true, valido_de: agora, valido_ate: ate,
        concedido_por: eu, concedido_em: agora, revogado_por: null, revogado_em: null, motivo: null,
      }, { onConflict: 'usuario_id,modulo' }));
    } else if (a.marcado && i.marcado && a.ate !== i.ate) {
      ops.push(db.from('usuario_permissoes').update({ valido_ate: ate }).eq('usuario_id', userId).eq('modulo', mod).eq('ativo', true));
    } else if (!a.marcado && i.marcado) {
      ops.push(db.from('usuario_permissoes').update({ ativo: false, revogado_por: eu, revogado_em: agora }).eq('usuario_id', userId).eq('modulo', mod).eq('ativo', true));
    }
  }
  if (!ops.length) return null;
  const r = await Promise.all(ops);
  const e = r.find(x => x.error);
  return e ? e.error.message : null;
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
  document.getElementById('mu-sub').textContent = 'A pessoa entra com a senha temporária e troca no primeiro acesso.';
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
  const { error } = await db.rpc('fn_criar_usuario', { p_email: email, p_senha: senha, p_nome: nome, p_perfil: perfil, p_telefone: tel || null });
  if (btn) btn.disabled = false;
  if (error) { toast('Erro ao criar usuário: ' + error.message, 'error'); return; }
  toast('Usuário criado. Passe a senha temporária à pessoa por um canal seguro.', 'success');
  editando = false; fecharModal(true); await carregarDados();
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
