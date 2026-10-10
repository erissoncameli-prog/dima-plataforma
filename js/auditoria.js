// ── DIMA UNESCO · Módulo de Auditoria IA ──────────────────────
// Visual: design system da mesa (body.dgm + css/auditoria.css, prefixo au-).
// Severidade = classe .s-<severidade> (token --au-*); nada de cor solta aqui.

const DOMINIOS = {
  tdr_contrato:    'TDR / Contrato',
  financeiro:      'Financeiro',
  orcamento:       'Orçamento',          // virtual: domínio financeiro com título "Orçamento: …"
  produtos:        'Produtos',
  viagens:         'Viagens',
  matriz:          'Matriz',
  qualidade_dados: 'Qualidade de dados',
}

const SEV_ORDEM = { critico: 0, alto: 1, medio: 2, baixo: 3, info: 4 }
const DIAS_VELHA = 7   // acima disso a faixa avisa que a auditoria está velha (não há rotina automática)

let _achados      = []
let _filtroStatus = 'aberto'   // aberto (inclui em_analise) | resolvido | ignorado | todos
let _filtroDom    = ''
let _modal        = null       // { id, modo: 'resolver' | 'ignorar' }
let _execAtual    = null       // execução exibida
let _ultimaId     = null       // execução concluída mais recente
let _rodando      = false

// ── Chat state ─────────────────────────────────────────────────
let _chatMessages   = []
let _chatAberto     = false
let _chatExecucaoId = null
let _chatEnviando   = false

// ── Ícones (SVG, sem emoji) ────────────────────────────────────
const AU_IC = {
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  escudo: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  ia: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  dir: '<path d="m9 18 6-6-6-6"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  volta: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
}
function auIc(n, cls) { return '<svg class="au-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (AU_IC[n] || '') + '</svg>' }
document.querySelectorAll('i[data-ic]').forEach(function (e) { e.outerHTML = auIc(e.dataset.ic, 'p') })

// Tema claro/escuro: mesmo 'diag_tema' da mesa do Diagnóstico e das demais guias (componente .dgm-tema)
function seletorTema() {
  const tb = document.querySelector('.topbar'); if (!tb || tb.querySelector('.dgm-tema') || typeof DiagTema === 'undefined') return
  const d = document.createElement('div')
  d.className = 'dgm-tema'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Tema')
  d.innerHTML = [['claro', 'sol', 'Claro'], ['escuro', 'lua', 'Escuro']].map(function (x) {
    return '<button type="button" data-tema="' + x[0] + '" aria-pressed="' + (DiagTema.atual() === x[0]) + '">' + auIc(x[1]) + x[2] + '</button>'
  }).join('')
  const bc = tb.querySelector('.topbar-breadcrumb')
  if (bc) bc.parentNode.insertBefore(d, bc); else tb.appendChild(d)
  d.addEventListener('click', function (ev) {
    const b = ev.target.closest('[data-tema]'); if (!b) return
    DiagTema.definir(b.dataset.tema)
    d.querySelectorAll('[data-tema]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)) })
  })
}

const fmtDtHr = function (s) {
  return s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}
const fmtCurto = function (s) {
  return s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
}
const plural = function (n, um, varios) { return n + ' ' + (n === 1 ? um : varios) }
const ehAberto = function (a) { return a.status === 'aberto' || a.status === 'em_analise' }
// Achado do agente de orçamento: gravado como domínio financeiro (o check de
// auditoria_registros.dominio não tem 'orcamento'), com título "Orçamento: …".
function domDe(a) {
  if (a.dominio === 'financeiro' && /^or[çc]amento\s*:/i.test(a.titulo || '')) return 'orcamento'
  return a.dominio
}

// ── Inicialização ──────────────────────────────────────────────
;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { localStorage.setItem('dima_redirect', window.location.href); window.location.href = '../index.html'; return }

  if (!['super_admin', 'coordenacao'].includes(appState.perfil)) {
    document.getElementById('app').innerHTML =
      gerarLayout('Auditoria IA', 'auditoria') +
      '<div class="au-restrito">' + auIc('cadeado') +
      '<b>Acesso restrito</b>Este módulo é exclusivo para Coordenação e Super Admin.</div>' +
      '</div></div></div>'
    carregarLogosSidebar(); seletorTema()
    return
  }

  const html =
    '<div class="fade-in">' +
    '<div class="au-topo">' +
      '<div><h2>Auditoria IA</h2><p>Varredura automatizada de conformidade e consistência dos dados do projeto.</p></div>' +
      '<div class="au-topo-ac">' +
        '<button type="button" class="btn btn-secondary" id="btn-chat" onclick="toggleChat()" aria-expanded="false" aria-controls="chat-panel">' + auIc('ia', 'p') + 'Assistente</button>' +
        '<button type="button" class="btn btn-primary" id="btn-auditar" onclick="dispararAuditoria()">' + auIc('busca', 'p') + 'Rodar auditoria</button>' +
      '</div>' +
    '</div>' +
    '<div class="au-run" id="au-run" role="status"></div>' +
    '<div class="au-kpis" id="au-kpis"></div>' +
    '<div class="au-g">' +
      '<div class="au-lista">' +
        '<div class="au-filtros" id="au-filtros" hidden></div>' +
        '<div id="lista-achados" class="au-lista"></div>' +
      '</div>' +
      '<div class="au-side">' +
        '<div class="au-card" id="painel-dominios" hidden><h4>Abertos por domínio</h4><div id="dom-chart"></div></div>' +
        '<div class="au-card"><h4 id="hist-tit">Execuções</h4><div id="historico-execucoes"><div class="au-mini">Nenhuma execução ainda</div></div></div>' +
      '</div>' +
    '</div>' +
    '</div>'

  document.getElementById('app').innerHTML = gerarLayout('Auditoria IA', 'auditoria') + html + '</div></div></div>'
  carregarLogosSidebar()
  seletorTema()
  ligarEventos()

  renderFaixa()
  await Promise.all([carregarUltimaExecucao(), carregarHistorico()])
})()

function ligarEventos() {
  document.querySelectorAll('[data-sug]').forEach(function (b) { b.addEventListener('click', function () { enviarSugestao(b.dataset.sug) }) })
  const inp = document.getElementById('chat-input')
  inp.addEventListener('keydown', chatKeydown)
  inp.addEventListener('input', function () { autoResizeTextarea(inp) })
  document.getElementById('au-modal').addEventListener('click', function (e) { if (e.target.id === 'au-modal') fecharModal() })
  document.addEventListener('keydown', function (e) {
    const modal = document.getElementById('au-modal')
    if (modal.classList.contains('aberto')) {
      if (e.key === 'Escape') { e.preventDefault(); fecharModal() }
      else if (e.key === 'Tab') prenderTab(e, modal)
      return
    }
    if (e.key === 'Escape' && _chatAberto) { e.preventDefault(); toggleChat(false) }
  })
}
const AU_FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
function prenderTab(e, el) {
  const f = [...el.querySelectorAll(AU_FOCAVEIS)].filter(function (x) { return x.offsetParent !== null })
  if (!f.length) return
  const pri = f[0], ult = f[f.length - 1]
  if (!el.contains(document.activeElement)) { e.preventDefault(); pri.focus() }
  else if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus() }
  else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus() }
}

// ── Carregar última execução ───────────────────────────────────
async function carregarUltimaExecucao() {
  const { data: execucao } = await db
    .from('auditoria_execucoes')
    .select('*')
    .eq('status', 'concluido')
    .order('concluido_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!execucao) { renderFaixa(); renderAchados(); renderKpis(); return }
  _ultimaId = execucao.id
  await mostrarExecucao(execucao)
}

async function carregarExecucao(execucaoId) {
  const { data: execucao } = await db.from('auditoria_execucoes').select('*').eq('id', execucaoId).single()
  if (execucao) await mostrarExecucao(execucao)
}

async function mostrarExecucao(execucao) {
  _execAtual = execucao
  setChatExecucao(execucao.id, execucao.concluido_em)
  renderFaixa()
  document.querySelectorAll('.au-hr').forEach(function (r) { r.classList.toggle('on', r.dataset.exec === execucao.id) })
  await carregarAchados(execucao.id)
}

// ── Faixa da execução (com aviso de auditoria velha) ──────────
function renderFaixa(estado, msgErro) {
  const el = document.getElementById('au-run')
  if (!el) return
  const btnRodar = '<button type="button" class="btn btn-primary btn-sm" onclick="dispararAuditoria()"' + (_rodando ? ' disabled' : '') + '>' + auIc('busca', 'p') + 'Rodar agora</button>'

  if (estado === 'rodando') {
    el.className = 'au-run'
    el.innerHTML = '<span class="au-run-ic"><span class="au-spin"></span></span>' +
      '<div class="au-run-tx"><b>Auditoria em andamento…</b><small>Os agentes especialistas e o agente de orçamento estão varrendo o sistema. Pode levar até 1 minuto.</small></div>'
    return
  }
  if (estado === 'erro') {
    el.className = 'au-run erro'
    el.innerHTML = '<span class="au-run-ic">' + auIc('alerta') + '</span>' +
      '<div class="au-run-tx"><b>Erro na execução</b><small>' + esc(msgErro || '') + '</small></div>' + btnRodar
    return
  }
  const e = _execAtual
  if (!e) {
    el.className = 'au-run'
    el.innerHTML = '<span class="au-run-ic">' + auIc('busca') + '</span>' +
      '<div class="au-run-tx"><b>Nenhuma auditoria executada ainda</b><small>A auditoria só roda pelo botão: não há rotina automática.</small></div>' + btnRodar
    return
  }

  const total = e.total_achados || 0, crit = e.achados_criticos || 0, altos = e.achados_altos || 0
  const dias = e.concluido_em ? Math.floor((Date.now() - new Date(e.concluido_em).getTime()) / 86400000) : null
  const antiga = _ultimaId && e.id !== _ultimaId
  const velha = !antiga && dias != null && dias > DIAS_VELHA
  const quando = dias == null ? '' : dias === 0 ? 'hoje' : dias === 1 ? 'há 1 dia' : 'há ' + dias + ' dias'

  el.className = 'au-run' + (velha ? ' velha' : crit ? ' crit' : total === 0 ? ' ok' : '')
  const tit = antiga
    ? 'Vendo a execução de ' + fmtDtHr(e.concluido_em) + ' (não é a mais recente)'
    : 'Última auditoria ' + quando + ' · ' + fmtDtHr(e.concluido_em)
  const resumo = total === 0
    ? 'Nenhuma inconsistência detectada.'
    : plural(total, 'achado', 'achados') + ', ' + (crit ? plural(crit, 'crítico', 'críticos') : 'nenhum crítico') + (altos ? ', ' + plural(altos, 'alto', 'altos') : '') + '.'
  const sub = resumo + (velha ? ' A auditoria só roda pelo botão: não há rotina automática.' : '')
  el.innerHTML = '<span class="au-run-ic">' + auIc(velha ? 'relogio' : crit ? 'alerta' : 'escudo') + '</span>' +
    '<div class="au-run-tx"><b>' + esc(tit) + '</b><small>' + esc(sub) + '</small></div>' +
    (antiga ? '<button type="button" class="btn btn-secondary btn-sm" onclick="carregarExecucao(\'' + _ultimaId + '\')">' + auIc('volta', 'p') + 'Ver a mais recente</button>' : btnRodar) +
    (e.resumo_geral ? '<div class="au-resumo">' + esc(e.resumo_geral) + '</div>' : '')
}

// ── Carregar achados de uma execução ──────────────────────────
async function carregarAchados(execucaoId) {
  const { data } = await db
    .from('auditoria_registros')
    .select('*')
    .eq('execucao_id', execucaoId)
    .order('severidade')

  _achados = data || []
  renderTudo()
}
function renderTudo() { renderKpis(); renderFiltros(); renderAchados(); renderDomChart() }

// ── Números (abertos por severidade) ───────────────────────────
function renderKpis() {
  const el = document.getElementById('au-kpis')
  if (!el) return
  if (!_achados.length) { el.innerHTML = ''; el.hidden = true; return }
  el.hidden = false
  const c = { critico: 0, alto: 0, medio: 0, baixo: 0, info: 0 }
  _achados.filter(ehAberto).forEach(function (a) { if (a.severidade in c) c[a.severidade]++ })
  const k = function (s, rot, sub) {
    return '<div class="au-kpi s-' + s + '"><span class="au-kpi-l"><i></i>' + rot + '</span>' +
      '<span class="au-kpi-v' + (c[s] ? '' : ' z') + '">' + c[s] + '</span><span class="au-kpi-s">' + sub + '</span></div>'
  }
  el.innerHTML = k('critico', 'Crítico', c.critico === 1 ? 'aberto' : 'abertos') + k('alto', 'Alto', c.alto === 1 ? 'aberto' : 'abertos') +
    k('medio', 'Médio', c.medio === 1 ? 'aberto' : 'abertos') +
    k('baixo', 'Baixo', (c.baixo === 1 ? 'aberto' : 'abertos') + (c.info ? ' · + ' + plural(c.info, 'informativo', 'informativos') : ''))
}

// ── Filtros (situação + domínio) ───────────────────────────────
function renderFiltros() {
  const el = document.getElementById('au-filtros')
  if (!el) return
  el.hidden = !_achados.length
  if (!_achados.length) return
  const n = {
    aberto: _achados.filter(ehAberto).length,
    resolvido: _achados.filter(function (a) { return a.status === 'resolvido' }).length,
    ignorado: _achados.filter(function (a) { return a.status === 'ignorado' }).length,
    todos: _achados.length,
  }
  const rot = { aberto: 'Abertos', resolvido: 'Resolvidos', ignorado: 'Ignorados', todos: 'Todos' }
  const doms = Object.keys(DOMINIOS).filter(function (d) { return _achados.some(function (a) { return domDe(a) === d }) })
  el.innerHTML =
    '<span class="au-seg" role="group" aria-label="Situação">' +
    Object.keys(rot).map(function (s) {
      return '<button type="button" class="' + (_filtroStatus === s ? 'on' : '') + '" aria-pressed="' + (_filtroStatus === s) + '" onclick="filtrar(\'' + s + '\')">' +
        rot[s] + ' <span class="n">' + n[s] + '</span></button>'
    }).join('') + '</span>' +
    '<select class="au-sel" aria-label="Domínio" onchange="filtrarDom(this.value)">' +
    '<option value="">Todos os domínios</option>' +
    doms.map(function (d) { return '<option value="' + d + '"' + (_filtroDom === d ? ' selected' : '') + '>' + DOMINIOS[d] + '</option>' }).join('') +
    '</select>' +
    '<span class="au-cont" id="au-cont"></span>'
}
function filtrar(status) { _filtroStatus = status; renderFiltros(); renderAchados() }
function filtrarDom(d) { _filtroDom = d || ''; renderAchados() }

// ── Lista de achados (informativos agrupados no fim) ───────────
function renderAchados() {
  const lista = document.getElementById('lista-achados')
  if (!lista) return

  let f = _achados.slice()
  if (_filtroStatus === 'aberto') f = f.filter(ehAberto)
  else if (_filtroStatus !== 'todos') f = f.filter(function (a) { return a.status === _filtroStatus })
  if (_filtroDom) f = f.filter(function (a) { return domDe(a) === _filtroDom })

  const ordemStatus = { aberto: 0, em_analise: 1, resolvido: 2, ignorado: 3 }
  f.sort(function (a, b) {
    return ((SEV_ORDEM[a.severidade] ?? 99) - (SEV_ORDEM[b.severidade] ?? 99)) || ((ordemStatus[a.status] || 0) - (ordemStatus[b.status] || 0))
  })
  const cont = document.getElementById('au-cont')
  if (cont) cont.textContent = plural(f.length, 'achado', 'achados')

  if (!f.length) {
    lista.innerHTML = _achados.length
      ? '<div class="au-vazio">' + auIc('check') + '<b>Nenhum achado neste filtro</b>Troque a situação ou o domínio para ver os demais.</div>'
      : (_execAtual
        ? '<div class="au-vazio">' + auIc('escudo') + '<b>Nenhuma inconsistência nesta execução</b>Os agentes não encontraram achados.</div>'
        : '<div class="au-vazio">' + auIc('busca') + '<b>Nenhuma auditoria executada ainda</b>Clique em "Rodar auditoria" para iniciar a varredura.</div>')
    return
  }

  const acao = f.filter(function (a) { return a.severidade !== 'info' })
  const info = f.filter(function (a) { return a.severidade === 'info' })
  let h = acao.map(renderAchadoCard).join('')
  if (info.length) {
    const porDom = {}
    info.forEach(function (a) { const d = DOMINIOS[domDe(a)] || domDe(a); porDom[d] = (porDom[d] || 0) + 1 })
    const resumo = Object.keys(porDom).map(function (d) { return d + ' ' + porDom[d] }).join(' · ')
    h += '<details class="au-grupo s-info"' + (acao.length ? '' : ' open') + '><summary>' + auIc('dir', 'gira') +
      '<span style="flex:1;min-width:0"><b>' + plural(info.length, 'informativo', 'informativos') + '</b><span class="sub">' + esc(resumo) + ' · não pedem ação imediata</span></span>' +
      '<span class="au-pill sev">Info</span></summary>' +
      '<div class="au-grupo-l">' + info.map(renderAchadoCard).join('') + '</div></details>'
  }
  lista.innerHTML = h
}

function renderAchadoCard(a) {
  const aberto = ehAberto(a)
  const d = domDe(a)
  return (
    '<div class="au-ach s-' + esc(a.severidade) + '" id="card-' + esc(a.id) + '">' +
      '<button type="button" class="au-ach-h" aria-expanded="false" onclick="toggleCard(\'' + esc(a.id) + '\')">' +
        '<span class="au-ach-st"></span>' +
        '<span style="min-width:0"><span class="au-ach-t">' + esc(a.titulo) + '</span>' +
          '<span class="au-meta">' +
            '<span class="au-pill sev">' + labelSev(a.severidade) + '</span>' +
            '<span class="au-pill dom">' + esc(DOMINIOS[d] || d) + '</span>' +
            (a.referencia_label ? '<span class="au-ref">' + esc(a.referencia_label) + '</span>' : '') +
            '<span class="au-pill st-' + esc(a.status) + '">' + labelStatus(a.status) + '</span>' +
          '</span></span>' +
        '<span class="au-chev">' + auIc('chev') + '</span>' +
      '</button>' +
      '<div class="au-ach-b">' +
        '<div>' + esc(a.descricao) + '</div>' +
        (a.recomendacao ? '<div class="au-rec"><small>Recomendação</small>' + esc(a.recomendacao) + '</div>' : '') +
        (a.comentario_resolucao
          ? '<div class="au-res"><small>' + (a.status === 'ignorado' ? 'Motivo para ignorar' : 'Resolução') + '</small>' + esc(a.comentario_resolucao) + '</div>'
          : '') +
        '<div class="au-ac">' +
          (aberto
            ? '<button type="button" class="btn btn-secondary btn-sm" onclick="abrirModal(\'' + esc(a.id) + '\',\'resolver\')">' + auIc('check', 'p') + 'Marcar como resolvido</button>' +
              '<button type="button" class="btn btn-secondary btn-sm" onclick="abrirModal(\'' + esc(a.id) + '\',\'ignorar\')">Ignorar…</button>'
            : '') +
          '<button type="button" class="btn btn-secondary btn-sm" onclick="perguntarSobre(\'' + esc(a.id) + '\')">' + auIc('ia', 'p') + 'Perguntar ao assistente</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  )
}

function labelSev(s) {
  return { critico: 'Crítico', alto: 'Alto', medio: 'Médio', baixo: 'Baixo', info: 'Info' }[s] || esc(s)
}
function labelStatus(s) {
  return { aberto: 'Aberto', em_analise: 'Em análise', resolvido: 'Resolvido', ignorado: 'Ignorado' }[s] || esc(s)
}

function toggleCard(id) {
  const card = document.getElementById('card-' + id)
  if (!card) return
  const aberto = card.classList.toggle('aberto')
  card.querySelector('.au-ach-h').setAttribute('aria-expanded', String(aberto))
}

// ── Domínios (abertos) ─────────────────────────────────────────
function renderDomChart() {
  const painel = document.getElementById('painel-dominios')
  const cont = document.getElementById('dom-chart')
  if (!cont) return
  painel.hidden = !_achados.length
  const counts = {}
  _achados.filter(ehAberto).forEach(function (a) { const d = domDe(a); counts[d] = (counts[d] || 0) + 1 })
  const max = Math.max.apply(null, Object.values(counts).concat([1]))
  cont.innerHTML = Object.keys(DOMINIOS)
    .sort(function (a, b) { return (counts[b] || 0) - (counts[a] || 0) })
    .map(function (key) {
      const n = counts[key] || 0
      return '<div class="au-dr' + (n ? '' : ' zero') + '"><span>' + DOMINIOS[key] + '</span>' +
        '<span class="b"><i style="width:' + Math.round(n / max * 100) + '%"></i></span><span class="n">' + n + '</span></div>'
    }).join('')
}

// ── Histórico de execuções ─────────────────────────────────────
async function carregarHistorico() {
  const [{ data }, { count }] = await Promise.all([
    db.from('auditoria_execucoes').select('id,concluido_em,total_achados,achados_criticos,status')
      .order('concluido_em', { ascending: false }).limit(8),
    db.from('auditoria_execucoes').select('id', { count: 'exact', head: true }),
  ])

  const cont = document.getElementById('historico-execucoes')
  const tit = document.getElementById('hist-tit')
  if (tit && count) tit.textContent = 'Execuções (' + count + ')'
  if (!cont || !data || !data.length) return

  cont.innerHTML = data.map(function (e) {
    const rodando = !e.concluido_em
    return (
      '<button type="button" class="au-hr' + (_execAtual && _execAtual.id === e.id ? ' on' : '') + '" data-exec="' + esc(e.id) + '"' +
        (rodando ? ' disabled' : ' onclick="carregarExecucao(\'' + esc(e.id) + '\')"') + '>' +
        '<span class="d">' + (rodando ? 'rodando…' : fmtCurto(e.concluido_em)) + '</span>' +
        '<span>' + plural(e.total_achados || 0, 'achado', 'achados') + '</span>' +
        ((e.achados_criticos || 0) > 0
          ? '<span class="au-pill cr">' + plural(e.achados_criticos, 'crítico', 'críticos') + '</span>'
          : '<span class="au-pill ok">sem crítico</span>') +
      '</button>'
    )
  }).join('')
}

// ── Disparar auditoria ─────────────────────────────────────────
function setRodando(sim) {
  _rodando = sim
  const btn = document.getElementById('btn-auditar')
  if (btn) {
    btn.disabled = sim
    btn.innerHTML = sim ? '<span class="au-spin"></span>Auditando…' : auIc('busca', 'p') + 'Rodar auditoria'
  }
  if (sim) renderFaixa('rodando')
}

async function chamarAuditor() {
  const { data: { session } } = await db.auth.getSession()
  const res = await fetch(SUPABASE_URL + '/functions/v1/auditor-ia', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (session?.access_token || ''),
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ usuario_id: appState.usuario?.id }),
  })
  const json = await res.json().catch(function () { return {} })
  if (!res.ok) throw new Error(json.error || 'Erro HTTP ' + res.status)
  return json
}

async function dispararAuditoria() {
  if (_rodando) return
  setRodando(true)
  try {
    const resultado = await chamarAuditor()
    const tipo = resultado.achados_criticos > 0 ? 'error' : resultado.total_achados > 0 ? 'warning' : 'success'
    toast('Auditoria concluída: ' + resultado.total_achados + ' achados (' + resultado.achados_criticos + ' críticos)', tipo)
    setRodando(false)
    await Promise.all([carregarUltimaExecucao(), carregarHistorico()])
  } catch (e) {
    console.error('[auditoria]', e)
    toast('Erro ao executar auditoria: ' + e.message, 'error')
    setRodando(false)
    renderFaixa('erro', e.message)
  }
}

// ── Resolver / ignorar (motivo obrigatório nos dois) ───────────
let _modalVolta = null
function abrirModal(id, modo) {
  const a = _achados.find(function (x) { return x.id === id })
  if (!a) return
  _modal = { id: id, modo: modo }
  const ign = modo === 'ignorar'
  document.getElementById('au-modal-tit').textContent = ign ? 'Ignorar achado' : 'Resolver achado'
  document.getElementById('au-modal-sub').textContent = a.titulo || ''
  document.getElementById('au-modal-lbl').textContent = ign ? 'Por que ignorar? *' : 'O que foi feito para corrigir? *'
  const txt = document.getElementById('au-modal-txt')
  txt.value = ''
  txt.placeholder = ign
    ? 'Ex.: indicador só recebe contribuição no 2º ano, conforme o plano de trabalho.'
    : 'Ex.: TDR aprovado em reunião de coordenação em 10/05/2026…'
  document.getElementById('au-modal-ok').textContent = ign ? 'Ignorar' : 'Confirmar resolução'
  _modalVolta = document.activeElement
  document.getElementById('au-modal').classList.add('aberto')
  requestAnimationFrame(function () { txt.focus() })
}

function fecharModal() {
  document.getElementById('au-modal').classList.remove('aberto')
  _modal = null
  if (_modalVolta && document.contains(_modalVolta)) _modalVolta.focus({ preventScroll: true })
  _modalVolta = null
}

async function confirmarModal() {
  if (!_modal) return
  const ign = _modal.modo === 'ignorar'
  const comentario = (document.getElementById('au-modal-txt').value || '').trim()
  if (!comentario) { toast(ign ? 'Informe por que o achado será ignorado.' : 'Informe o que foi feito para resolver o achado.', 'warning'); return }

  const btn = document.getElementById('au-modal-ok')
  const rot = btn.textContent
  btn.disabled = true; btn.textContent = 'Salvando…'
  const id = _modal.id
  try {
    const novo = {
      status: ign ? 'ignorado' : 'resolvido',
      resolvido_por: appState.usuario?.id,
      resolvido_em: new Date().toISOString(),
      comentario_resolucao: comentario,
    }
    const { error } = await db.from('auditoria_registros').update(novo).eq('id', id)
    if (error) throw error

    const a = _achados.find(function (x) { return x.id === id })
    if (a) Object.assign(a, novo)
    toast(ign ? 'Achado ignorado.' : 'Achado marcado como resolvido.', ign ? 'info' : 'success')
    fecharModal()
    renderTudo()
  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'error')
  } finally {
    btn.disabled = false; btn.textContent = rot
  }
}

// ── Chat ────────────────────────────────────────────────────────
function setChatExecucao(id, dt) {
  _chatExecucaoId = id
  const sub = document.getElementById('chat-header-sub')
  if (sub) sub.textContent = 'Contexto: auditoria de ' + (dt ? fmtDtHr(dt) : '?')
}

let _chatVolta = null
function toggleChat(forcar) {
  const abrir = typeof forcar === 'boolean' ? forcar : !_chatAberto
  if (abrir === _chatAberto) return
  _chatAberto = abrir
  const panel = document.getElementById('chat-panel')
  const btnChat = document.getElementById('btn-chat')
  panel.classList.toggle('aberto', abrir)
  panel.setAttribute('aria-hidden', String(!abrir))
  if (btnChat) { btnChat.classList.toggle('au-on', abrir); btnChat.setAttribute('aria-expanded', String(abrir)) }
  if (abrir) {
    _chatVolta = document.activeElement
    requestAnimationFrame(function () { document.getElementById('chat-input').focus() })
  } else if (_chatVolta && document.contains(_chatVolta)) {
    _chatVolta.focus({ preventScroll: true }); _chatVolta = null
  }
}

function perguntarSobre(id) {
  const a = _achados.find(function (x) { return x.id === id })
  if (!a) return
  toggleChat(true)
  const input = document.getElementById('chat-input')
  input.value = 'Sobre o achado "' + (a.titulo || '') + '"' + (a.referencia_label ? ' (' + a.referencia_label + ')' : '') + ': o que pode ter causado e como resolver?'
  autoResizeTextarea(input)
  input.focus()
}

function enviarSugestao(texto) {
  const input = document.getElementById('chat-input')
  if (input) { input.value = texto; autoResizeTextarea(input) }
  enviarMensagemChat()
}

async function enviarMensagemChat() {
  if (_chatEnviando) return
  const input = document.getElementById('chat-input')
  const texto = (input?.value || '').trim()
  if (!texto) return

  input.value = ''
  autoResizeTextarea(input)
  const welcome = document.getElementById('chat-welcome')
  if (welcome) welcome.style.display = 'none'

  if (texto.startsWith('/')) { await executarComandoChat(texto); return }

  _chatMessages.push({ role: 'user', content: texto })
  adicionarBolha('user', texto)

  const msgsEl = document.getElementById('chat-msgs')
  const typing = document.createElement('div')
  typing.id = 'chat-typing'
  typing.className = 'chat-msg assistant'
  typing.innerHTML = '<div class="chat-bubble"><div class="chat-thinking" aria-label="Pensando"><div class="chat-dot"></div><div class="chat-dot"></div><div class="chat-dot"></div></div></div>'
  if (msgsEl) { msgsEl.appendChild(typing); msgsEl.scrollTop = msgsEl.scrollHeight }

  _chatEnviando = true
  const sendBtn = document.getElementById('chat-send')
  if (sendBtn) sendBtn.disabled = true

  try {
    const { data: { session } } = await db.auth.getSession()
    const res = await fetch(SUPABASE_URL + '/functions/v1/chat-auditor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (session?.access_token || ''),
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ messages: _chatMessages, execucao_id: _chatExecucaoId }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Erro HTTP ' + res.status)

    _chatMessages.push({ role: 'assistant', content: json.resposta })
    document.getElementById('chat-typing')?.remove()
    adicionarBolha('assistant', json.resposta)
  } catch (e) {
    document.getElementById('chat-typing')?.remove()
    const msg = 'Não consegui processar sua pergunta. ' + e.message
    _chatMessages.push({ role: 'assistant', content: msg })
    adicionarBolha('assistant', msg)
  } finally {
    _chatEnviando = false
    if (sendBtn) sendBtn.disabled = false
    const m = document.getElementById('chat-msgs')
    if (m) m.scrollTop = m.scrollHeight
  }
}

// Texto do assistente vem do modelo: escapa tudo e só então aplica **negrito** e quebras
function adicionarBolha(role, texto) {
  const msgsEl = document.getElementById('chat-msgs')
  if (!msgsEl) return
  const div = document.createElement('div')
  div.className = 'chat-msg ' + role
  const safe = esc(String(texto || ''))
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
  div.innerHTML = '<div class="chat-bubble">' + safe + '</div>'
  msgsEl.appendChild(div)
  msgsEl.scrollTop = msgsEl.scrollHeight
}

function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagemChat() }
}

function autoResizeTextarea(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 96) + 'px'
}

// ── Comandos do chat ───────────────────────────────────────────
async function executarComandoChat(cmd) {
  const cmdBase = cmd.trim().toLowerCase().split(/\s+/)[0]
  adicionarBolha('user', cmd)

  if (cmdBase === '/auditar') { await _cmdAuditar(); return }
  if (cmdBase === '/ajuda' || cmdBase === '/help') {
    adicionarBolha('assistant',
      'Comandos disponíveis:\n\n' +
      '• /auditar — roda a auditoria completa (agentes especialistas, agente de orçamento e supervisor)\n' +
      '• /ajuda — mostra esta mensagem\n\n' +
      'Ou escreva uma pergunta sobre os achados.')
    return
  }
  adicionarBolha('assistant', 'Comando não reconhecido: ' + cmdBase + '\n\nUse /ajuda para ver os comandos disponíveis.')
}

async function _cmdAuditar() {
  if (_rodando) { adicionarBolha('assistant', 'Já há uma auditoria em andamento. Aguarde o resultado.'); return }
  const sendBtn = document.getElementById('chat-send')
  _chatEnviando = true
  if (sendBtn) sendBtn.disabled = true
  setRodando(true)

  adicionarBolha('assistant',
    'Iniciando a varredura completa do sistema: TDR / Contratos, Financeiro, Orçamento, Produtos, Viagens, Matriz e Qualidade de dados.\n\n' +
    'Aguarde — pode levar até 1 minuto…')

  try {
    const resultado = await chamarAuditor()
    const total = resultado.total_achados || 0
    const criticos = resultado.achados_criticos || 0
    const altos = resultado.achados_altos || 0
    const porDom = resultado.por_dominio || {}

    if (resultado.execucao_id) setChatExecucao(resultado.execucao_id, new Date().toISOString())

    let msg = '**Auditoria concluída.**\n\n'
    if (total === 0) {
      msg += 'Nenhuma inconsistência detectada.'
    } else {
      msg += '**' + plural(total, 'achado encontrado', 'achados encontrados') + '**'
      if (criticos > 0) msg += '\n• ' + plural(criticos, 'crítico', 'críticos') + ' — ação urgente'
      if (altos > 0) msg += '\n• ' + plural(altos, 'alto', 'altos')
      const linhasDom = Object.entries(porDom)
        .filter(function (kv) { return (kv[1] || 0) > 0 })
        .map(function (kv) { return '  ' + (DOMINIOS[kv[0]] || kv[0]) + ': ' + kv[1] })
      if (linhasDom.length) msg += '\n\nPor domínio:\n' + linhasDom.join('\n')
    }
    if (resultado.resumo) msg += '\n\n' + resultado.resumo
    if (total > 0) msg += '\n\nPosso detalhar os achados. Pergunte, por exemplo:\n• "O que resolver primeiro?"\n• "Resumo por domínio"'
    adicionarBolha('assistant', msg)

    setRodando(false)
    await Promise.all([carregarUltimaExecucao(), carregarHistorico()])
    toast('Auditoria concluída: ' + total + ' achados', criticos > 0 ? 'error' : total > 0 ? 'warning' : 'success')
  } catch (e) {
    console.error('[chat /auditar]', e)
    adicionarBolha('assistant', 'Erro ao executar a auditoria: ' + e.message + '\n\nTente de novo ou use o botão "Rodar auditoria" no topo da página.')
    setRodando(false)
    renderFaixa('erro', e.message)
  } finally {
    _chatEnviando = false
    if (sendBtn) sendBtn.disabled = false
  }
}
