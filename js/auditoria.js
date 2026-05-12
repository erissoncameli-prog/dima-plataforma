// ── DIMA UNESCO · Módulo de Auditoria IA ──────────────────────

const DOMINIOS = {
  tdr_contrato:    { label: 'TDR / Contrato',    cor: '#7C3AED' },
  financeiro:      { label: 'Financeiro',         cor: '#DC2626' },
  produtos:        { label: 'Produtos',           cor: '#059669' },
  viagens:         { label: 'Viagens',            cor: '#2563EB' },
  matriz:          { label: 'Matriz',             cor: '#D97706' },
  qualidade_dados: { label: 'Qualidade de Dados', cor: '#6B7280' },
}

const SEV_ORDEM = { critico: 0, alto: 1, medio: 2, baixo: 3, info: 4 }

let _achados      = []
let _filtroStatus = 'todos'
let _filtroDom    = null
let _resolvendoId = null

// ── Chat state ─────────────────────────────────────────────────
let _chatMessages   = []
let _chatAberto     = false
let _chatExecucaoId = null
let _chatEnviando   = false

// ── Inicialização ──────────────────────────────────────────────
;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { window.location.href = '../index.html'; return }

  if (!['super_admin', 'coordenacao'].includes(appState.perfil)) {
    document.getElementById('app').innerHTML =
      gerarLayout('Auditoria IA', 'auditoria') +
      '<div style="padding:60px;text-align:center;color:var(--cinza-500)">' +
      '<div style="font-size:48px;margin-bottom:16px">🔒</div>' +
      '<div style="font-size:16px;font-weight:600">Acesso restrito</div>' +
      '<div style="font-size:13px;margin-top:8px">Este módulo é exclusivo para Coordenação e Super Admin.</div>' +
      '</div></div></div></div>'
    carregarLogosSidebar()
    return
  }

  // ── Montar estrutura da página ──────────────────────────────
  const html =
    '<div class="fade-in">' +
    // topbar da página
    '<div class="aud-topbar">' +
      '<div class="aud-topbar-left">' +
        '<h2>Auditoria IA</h2>' +
        '<p>Varredura automatizada de conformidade e consistência dos dados do projeto</p>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<span id="ultima-execucao" style="font-size:11px;color:var(--cinza-500)"></span>' +
        '<button class="btn-auditar" id="btn-auditar" onclick="dispararAuditoria()">' +
          '<span>🔍</span> Rodar Auditoria' +
        '</button>' +
      '</div>' +
    '</div>' +
    // banner execução
    '<div class="exec-banner" id="exec-banner" style="display:none">' +
      '<div class="exec-icon idle" id="exec-icon">🔍</div>' +
      '<div class="exec-meta">' +
        '<div class="exec-titulo" id="exec-titulo">Iniciando...</div>' +
        '<div class="exec-sub" id="exec-sub"></div>' +
        '<div class="exec-resumo" id="exec-resumo" style="display:none"></div>' +
      '</div>' +
    '</div>' +
    // grid principal
    '<div class="aud-grid">' +
      // coluna esquerda
      '<div>' +
        '<div class="stats-bar" id="stats-bar" style="display:none">' +
          '<div class="stat-pill"><span class="stat-dot dot-critico"></span><span class="stat-num" id="cnt-critico">0</span>&nbsp;Crítico</div>' +
          '<div class="stat-pill"><span class="stat-dot dot-alto"></span><span class="stat-num" id="cnt-alto">0</span>&nbsp;Alto</div>' +
          '<div class="stat-pill"><span class="stat-dot dot-medio"></span><span class="stat-num" id="cnt-medio">0</span>&nbsp;Médio</div>' +
          '<div class="stat-pill"><span class="stat-dot dot-baixo"></span><span class="stat-num" id="cnt-baixo">0</span>&nbsp;Baixo</div>' +
          '<div class="stat-pill"><span class="stat-dot dot-info"></span><span class="stat-num" id="cnt-info">0</span>&nbsp;Info</div>' +
        '</div>' +
        '<div class="filtros" id="filtros" style="display:none">' +
          '<button class="filtro-btn ativo" onclick="filtrar(\'todos\',this)">Todos</button>' +
          '<button class="filtro-btn" onclick="filtrar(\'aberto\',this)">Abertos</button>' +
          '<button class="filtro-btn" onclick="filtrar(\'resolvido\',this)">Resolvidos</button>' +
          '<div class="filtros-sep"></div>' +
          '<button class="filtro-btn" onclick="filtrarDom(\'tdr_contrato\',this)">TDR/Contrato</button>' +
          '<button class="filtro-btn" onclick="filtrarDom(\'financeiro\',this)">Financeiro</button>' +
          '<button class="filtro-btn" onclick="filtrarDom(\'produtos\',this)">Produtos</button>' +
          '<button class="filtro-btn" onclick="filtrarDom(\'viagens\',this)">Viagens</button>' +
          '<button class="filtro-btn" onclick="filtrarDom(\'matriz\',this)">Matriz</button>' +
          '<button class="filtro-btn" onclick="filtrarDom(\'qualidade_dados\',this)">Qualidade</button>' +
        '</div>' +
        '<div id="lista-achados">' +
          '<div class="empty" id="empty-state">' +
            '<div class="empty-icon">🔍</div>' +
            '<div class="empty-msg">Nenhuma auditoria executada ainda</div>' +
            '<div class="empty-sub">Clique em "Rodar Auditoria" para iniciar a varredura</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // coluna direita (painel)
      '<div>' +
        '<div class="painel-card" id="painel-dominios" style="display:none">' +
          '<div class="painel-titulo">Achados abertos por domínio</div>' +
          '<div id="dom-chart"></div>' +
        '</div>' +
        '<div class="painel-card">' +
          '<div class="painel-titulo">Histórico de execuções</div>' +
          '<div id="historico-execucoes">' +
            '<div style="font-size:12px;color:var(--cinza-400);text-align:center;padding:16px 0">Nenhuma execução ainda</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '</div>'

  document.getElementById('app').innerHTML = gerarLayout('Auditoria IA', 'auditoria') + html + '</div></div></div>'
  carregarLogosSidebar()

  await Promise.all([carregarUltimaExecucao(), carregarHistorico()])
})()

// ── Carregar última execução ───────────────────────────────────
async function carregarUltimaExecucao() {
  const { data: execucao } = await db
    .from('auditoria_execucoes')
    .select('*')
    .eq('status', 'concluido')
    .order('concluido_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!execucao) return
  mostrarBannerExecucao(execucao)
  await carregarAchados(execucao.id)
}

// ── Banner de execução ─────────────────────────────────────────
function mostrarBannerExecucao(execucao) {
  const banner = document.getElementById('exec-banner')
  const icon   = document.getElementById('exec-icon')
  const titulo = document.getElementById('exec-titulo')
  const sub    = document.getElementById('exec-sub')
  const resumo = document.getElementById('exec-resumo')
  const ultima = document.getElementById('ultima-execucao')

  if (!banner) return
  banner.style.display = 'flex'

  const criticos = execucao.achados_criticos || 0
  const altos    = execucao.achados_altos || 0
  const total    = execucao.total_achados || 0

  if (criticos > 0) {
    icon.className = 'exec-icon crit'; icon.textContent = '🚨'
  } else if (altos > 0) {
    icon.className = 'exec-icon warn'; icon.textContent = '⚠️'
  } else if (total > 0) {
    icon.className = 'exec-icon warn'; icon.textContent = '📋'
  } else {
    icon.className = 'exec-icon ok'; icon.textContent = '✅'
  }

  titulo.textContent = total === 0
    ? 'Sistema sem inconsistências detectadas'
    : total + ' achado' + (total > 1 ? 's' : '') + ' — ' + criticos + ' crítico' + (criticos !== 1 ? 's' : '') + ', ' + altos + ' alto' + (altos !== 1 ? 's' : '')

  const dt = execucao.concluido_em ? new Date(execucao.concluido_em).toLocaleString('pt-BR') : '—'
  sub.textContent = 'Auditoria executada em ' + dt
  if (ultima) ultima.textContent = 'Última: ' + dt

  if (execucao.resumo_geral) {
    resumo.textContent = execucao.resumo_geral
    resumo.style.display = 'block'
  }
}

// ── Carregar achados de uma execução ──────────────────────────
async function carregarAchados(execucaoId) {
  const { data } = await db
    .from('auditoria_registros')
    .select('*')
    .eq('execucao_id', execucaoId)
    .order('severidade')

  _achados = data || []
  renderAchados()
  renderStats()
  renderDomChart()

  const statsBar   = document.getElementById('stats-bar')
  const filtrosEl  = document.getElementById('filtros')
  const painelDom  = document.getElementById('painel-dominios')
  if (statsBar)  statsBar.style.display  = _achados.length ? 'flex'  : 'none'
  if (filtrosEl) filtrosEl.style.display = _achados.length ? 'flex'  : 'none'
  if (painelDom) painelDom.style.display = _achados.length ? 'block' : 'none'
}

// ── Render lista de achados ────────────────────────────────────
function renderAchados() {
  const lista = document.getElementById('lista-achados')
  if (!lista) return

  let filtrados = _achados.slice()
  if (_filtroStatus !== 'todos') filtrados = filtrados.filter(a => a.status === _filtroStatus)
  if (_filtroDom)                filtrados = filtrados.filter(a => a.dominio === _filtroDom)

  const ordemStatus = { aberto: 0, em_analise: 1, resolvido: 2, ignorado: 3 }
  filtrados.sort((a, b) => {
    const ds = (ordemStatus[a.status] || 0) - (ordemStatus[b.status] || 0)
    if (ds !== 0) return ds
    return (SEV_ORDEM[a.severidade] || 99) - (SEV_ORDEM[b.severidade] || 99)
  })

  if (filtrados.length === 0) {
    lista.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">' + (_achados.length ? '🎉' : '🔍') + '</div>' +
        '<div class="empty-msg">' + (_achados.length ? 'Nenhum achado neste filtro' : 'Nenhuma auditoria executada') + '</div>' +
        '<div class="empty-sub">' + (_achados.length ? 'Tente remover os filtros' : 'Clique em "Rodar Auditoria" para iniciar') + '</div>' +
      '</div>'
    return
  }

  lista.innerHTML = filtrados.map(renderAchadoCard).join('')
}

function renderAchadoCard(a) {
  const dom    = DOMINIOS[a.dominio] || { label: a.dominio, cor: '#6B7280' }
  const aberto = a.status === 'aberto' || a.status === 'em_analise'
  return (
    '<div class="achado-card" id="card-' + a.id + '">' +
      '<div class="achado-header" onclick="toggleCard(\'' + a.id + '\')">' +
        '<div class="sev-strip sev-' + a.severidade + '"></div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="achado-titulo">' + esc(a.titulo) + '</div>' +
          '<div class="achado-meta">' +
            '<span class="sev-badge ' + a.severidade + '">' + labelSev(a.severidade) + '</span>' +
            '<span class="dom-badge" style="border-left:3px solid ' + dom.cor + '">' + dom.label + '</span>' +
            (a.referencia_label ? '<span class="achado-ref">' + esc(a.referencia_label) + '</span>' : '') +
            '<span class="achado-status-tag tag-' + a.status + '">' + labelStatus(a.status) + '</span>' +
          '</div>' +
        '</div>' +
        '<span class="achado-chevron">▾</span>' +
      '</div>' +
      '<div class="achado-body">' +
        '<div class="achado-desc">' + esc(a.descricao) + '</div>' +
        (a.recomendacao
          ? '<div class="achado-rec"><strong>Recomendação</strong>' + esc(a.recomendacao) + '</div>'
          : '') +
        (a.comentario_resolucao
          ? '<div style="margin-top:8px;font-size:11px;color:var(--cinza-500)"><strong>Resolução:</strong> ' + esc(a.comentario_resolucao) + '</div>'
          : '') +
        (aberto
          ? '<div class="achado-acoes">' +
              '<button class="btn-acao resolver" onclick="abrirModalResolucao(\'' + a.id + '\',\'' + esc(a.titulo).replace(/'/g, "\\'") + '\')">✓ Marcar como resolvido</button>' +
              '<button class="btn-acao" onclick="ignorarAchado(\'' + a.id + '\')">Ignorar</button>' +
            '</div>'
          : '') +
      '</div>' +
    '</div>'
  )
}

function labelSev(s) {
  return { critico: 'Crítico', alto: 'Alto', medio: 'Médio', baixo: 'Baixo', info: 'Info' }[s] || s
}
function labelStatus(s) {
  return { aberto: 'Aberto', em_analise: 'Em análise', resolvido: 'Resolvido', ignorado: 'Ignorado' }[s] || s
}

function toggleCard(id) {
  const card = document.getElementById('card-' + id)
  if (card) card.classList.toggle('aberto')
}

// ── Stats pills ────────────────────────────────────────────────
function renderStats() {
  const contagem = { critico: 0, alto: 0, medio: 0, baixo: 0, info: 0 }
  _achados
    .filter(a => a.status === 'aberto' || a.status === 'em_analise')
    .forEach(a => { if (a.severidade in contagem) contagem[a.severidade]++ })
  for (const [k, v] of Object.entries(contagem)) {
    const el = document.getElementById('cnt-' + k)
    if (el) el.textContent = v
  }
}

// ── Gráfico de domínios ────────────────────────────────────────
function renderDomChart() {
  const cont = document.getElementById('dom-chart')
  if (!cont) return
  const counts = {}
  _achados
    .filter(a => a.status === 'aberto' || a.status === 'em_analise')
    .forEach(a => { counts[a.dominio] = (counts[a.dominio] || 0) + 1 })
  const max = Math.max(...Object.values(counts), 1)
  cont.innerHTML = Object.entries(DOMINIOS).map(function([key, meta]) {
    const n   = counts[key] || 0
    const pct = Math.round((n / max) * 100)
    return (
      '<div class="dom-row">' +
        '<div class="dom-nome">' + meta.label + '</div>' +
        '<div class="dom-barra-bg"><div class="dom-barra-fill" style="width:' + pct + '%;background:' + meta.cor + '"></div></div>' +
        '<div class="dom-count">' + n + '</div>' +
      '</div>'
    )
  }).join('')
}

// ── Histórico de execuções ─────────────────────────────────────
async function carregarHistorico() {
  const { data } = await db
    .from('auditoria_execucoes')
    .select('id,concluido_em,total_achados,achados_criticos,status')
    .order('concluido_em', { ascending: false })
    .limit(8)

  const cont = document.getElementById('historico-execucoes')
  if (!cont || !data?.length) return

  cont.innerHTML = data.map(function(e) {
    const dtFmt = e.concluido_em
      ? new Date(e.concluido_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Rodando...'
    return (
      '<div class="exec-row" onclick="carregarExecucao(\'' + e.id + '\')">' +
        '<span class="exec-row-data">' + dtFmt + '</span>' +
        '<span style="flex:1;font-weight:600">' + (e.total_achados || 0) + ' achados</span>' +
        ((e.achados_criticos || 0) > 0
          ? '<span class="exec-row-crit">⚠ ' + e.achados_criticos + ' crítico' + (e.achados_criticos > 1 ? 's' : '') + '</span>'
          : '<span style="color:var(--sucesso)">✓ ok</span>') +
      '</div>'
    )
  }).join('')
}

async function carregarExecucao(execucaoId) {
  const { data: execucao } = await db
    .from('auditoria_execucoes')
    .select('*')
    .eq('id', execucaoId)
    .single()
  if (execucao) mostrarBannerExecucao(execucao)
  await carregarAchados(execucaoId)
}

// ── Filtros ────────────────────────────────────────────────────
function filtrar(status, btn) {
  _filtroStatus = status
  _filtroDom    = null
  document.querySelectorAll('.filtro-btn').forEach(function(b) { b.classList.remove('ativo') })
  btn.classList.add('ativo')
  renderAchados()
}

function filtrarDom(dominio, btn) {
  _filtroDom    = _filtroDom === dominio ? null : dominio
  _filtroStatus = 'todos'
  document.querySelectorAll('.filtro-btn').forEach(function(b) { b.classList.remove('ativo') })
  if (_filtroDom) btn.classList.add('ativo')
  else document.querySelector('.filtro-btn')?.classList.add('ativo')
  renderAchados()
}

// ── Disparar auditoria ─────────────────────────────────────────
async function dispararAuditoria() {
  const btn = document.getElementById('btn-auditar')
  if (!btn) return
  btn.disabled = true
  btn.innerHTML = '<span class="spin"></span> Auditando...'

  const icon   = document.getElementById('exec-icon')
  const titulo = document.getElementById('exec-titulo')
  const sub    = document.getElementById('exec-sub')
  const resumo = document.getElementById('exec-resumo')
  const banner = document.getElementById('exec-banner')

  if (banner) banner.style.display = 'flex'
  if (icon)   { icon.className = 'exec-icon idle'; icon.textContent = '⏳' }
  if (titulo) titulo.textContent = 'Auditoria em andamento...'
  if (sub)    sub.textContent = '6 agentes especialistas varrendo o sistema. Aguarde (pode levar até 1 min).'
  if (resumo) resumo.style.display = 'none'

  try {
    const { data: { session } } = await db.auth.getSession()

    const res = await fetch(
      SUPABASE_URL + '/functions/v1/auditor-ia',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (session?.access_token || ''),
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ usuario_id: appState.usuario?.id }),
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Erro HTTP ' + res.status)
    }

    const resultado = await res.json()
    const tipo = resultado.achados_criticos > 0 ? 'error' : resultado.total_achados > 0 ? 'warning' : 'success'
    toast('Auditoria concluída: ' + resultado.total_achados + ' achados (' + resultado.achados_criticos + ' críticos)', tipo)

    await Promise.all([carregarUltimaExecucao(), carregarHistorico()])

  } catch (e) {
    console.error('[auditoria]', e)
    toast('Erro ao executar auditoria: ' + e.message, 'error')
    if (icon)   icon.textContent = '❌'
    if (titulo) titulo.textContent = 'Erro na execução'
    if (sub)    sub.textContent = e.message
  } finally {
    btn.disabled = false
    btn.innerHTML = '<span>🔍</span> Rodar Auditoria'
  }
}

// ── Resolver achado ────────────────────────────────────────────
function abrirModalResolucao(id, titulo) {
  _resolvendoId = id
  const mt = document.getElementById('modal-titulo')
  const mc = document.getElementById('modal-comentario')
  if (mt) mt.textContent = 'Resolver: ' + titulo.slice(0, 55) + (titulo.length > 55 ? '...' : '')
  if (mc) mc.value = ''
  const modal = document.getElementById('modal-resolucao')
  if (modal) modal.style.display = 'flex'
  setTimeout(function() { if (mc) mc.focus() }, 50)
}

function fecharModal(e) {
  if (e && e.target !== document.getElementById('modal-resolucao')) return
  const modal = document.getElementById('modal-resolucao')
  if (modal) modal.style.display = 'none'
  _resolvendoId = null
}

async function confirmarResolucao() {
  if (!_resolvendoId) return
  const comentario = (document.getElementById('modal-comentario')?.value || '').trim()
  if (!comentario) { toast('Informe o que foi feito para resolver o achado.', 'warning'); return }

  const btn = document.getElementById('modal-btn-ok')
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...' }

  try {
    const { error } = await db
      .from('auditoria_registros')
      .update({
        status: 'resolvido',
        resolvido_por: appState.usuario?.id,
        resolvido_em: new Date().toISOString(),
        comentario_resolucao: comentario,
      })
      .eq('id', _resolvendoId)

    if (error) throw error

    const idx = _achados.findIndex(function(a) { return a.id === _resolvendoId })
    if (idx >= 0) {
      _achados[idx].status = 'resolvido'
      _achados[idx].comentario_resolucao = comentario
    }

    toast('Achado marcado como resolvido.', 'success')
    renderAchados()
    renderStats()
    renderDomChart()
    const modal = document.getElementById('modal-resolucao')
    if (modal) modal.style.display = 'none'
    _resolvendoId = null

  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'error')
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar resolução' }
  }
}

async function ignorarAchado(id) {
  const { error } = await db
    .from('auditoria_registros')
    .update({ status: 'ignorado' })
    .eq('id', id)

  if (error) { toast('Erro ao ignorar achado.', 'error'); return }

  const idx = _achados.findIndex(function(a) { return a.id === id })
  if (idx >= 0) _achados[idx].status = 'ignorado'

  toast('Achado ignorado.', 'info')
  renderAchados()
  renderStats()
  renderDomChart()
}
