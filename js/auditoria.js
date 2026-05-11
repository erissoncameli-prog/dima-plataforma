// ── DIMA UNESCO · Módulo de Auditoria IA ──────────────────────

const DOMINIOS = {
  tdr_contrato:   { label: 'TDR / Contrato',   cor: '#7C3AED' },
  financeiro:     { label: 'Financeiro',        cor: '#DC2626' },
  produtos:       { label: 'Produtos',          cor: '#059669' },
  viagens:        { label: 'Viagens',           cor: '#2563EB' },
  matriz:         { label: 'Matriz',            cor: '#D97706' },
  qualidade_dados:{ label: 'Qualidade de Dados',cor: '#6B7280' },
}

const SEV_ORDEM = { critico: 0, alto: 1, medio: 2, baixo: 3, info: 4 }

let _achados    = []
let _filtroStatus = 'todos'
let _filtroDom    = null
let _resolvendoId = null

// ── Inicialização ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const usuario = await carregarUsuario()
  if (!usuario) { window.location.href = '../index.html'; return }

  if (!['super_admin', 'coordenacao'].includes(appState.perfil)) {
    document.getElementById('main').innerHTML = `
      <div style="padding:60px;text-align:center;color:var(--cinza-500)">
        <div style="font-size:48px;margin-bottom:16px">🔒</div>
        <div style="font-size:16px;font-weight:600">Acesso restrito</div>
        <div style="font-size:13px;margin-top:8px">Este módulo é exclusivo para Coordenação e Super Admin.</div>
      </div>`
    return
  }

  renderLayout('auditoria')
  await Promise.all([carregarUltimaExecucao(), carregarHistorico()])
})

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

  banner.style.display = 'flex'

  const criticos = execucao.achados_criticos || 0
  const altos    = execucao.achados_altos || 0
  const total    = execucao.total_achados || 0

  if (criticos > 0) {
    icon.className = 'exec-icon crit'
    icon.textContent = '🚨'
  } else if (altos > 0) {
    icon.className = 'exec-icon warn'
    icon.textContent = '⚠️'
  } else if (total > 0) {
    icon.className = 'exec-icon warn'
    icon.textContent = '📋'
  } else {
    icon.className = 'exec-icon ok'
    icon.textContent = '✅'
  }

  titulo.textContent = total === 0
    ? 'Sistema sem inconsistências detectadas'
    : `${total} achado${total > 1 ? 's' : ''} identificado${total > 1 ? 's' : ''} — ${criticos} crítico${criticos !== 1 ? 's' : ''}, ${altos} alto${altos !== 1 ? 's' : ''}`

  const dataExec = execucao.concluido_em ? new Date(execucao.concluido_em) : null
  const dataFmt  = dataExec ? dataExec.toLocaleString('pt-BR') : '—'

  sub.textContent = `Auditoria executada em ${dataFmt}`
  ultima.textContent = `Última: ${dataFmt}`

  if (execucao.resumo_geral) {
    resumo.textContent = execucao.resumo_geral
    resumo.style.display = 'block'
  }
}

// ── Carregar achados ───────────────────────────────────────────
async function carregarAchados(execucaoId) {
  const { data } = await db
    .from('auditoria_registros')
    .select('*')
    .eq('execucao_id', execucaoId)
    .order('status')
    .order('severidade')

  _achados = data || []
  renderAchados()
  renderStats()
  renderDomChart()

  document.getElementById('stats-bar').style.display = _achados.length ? 'flex' : 'none'
  document.getElementById('filtros').style.display   = _achados.length ? 'flex' : 'none'
  document.getElementById('painel-dominios').style.display = _achados.length ? 'block' : 'none'
}

// ── Render lista de achados ────────────────────────────────────
function renderAchados() {
  const lista = document.getElementById('lista-achados')
  const empty = document.getElementById('empty-state')

  let filtrados = _achados.slice()

  if (_filtroStatus !== 'todos') {
    filtrados = filtrados.filter(a => a.status === _filtroStatus)
  }
  if (_filtroDom) {
    filtrados = filtrados.filter(a => a.dominio === _filtroDom)
  }

  // Ordenar: status aberto primeiro, depois por severidade
  filtrados.sort((a, b) => {
    if (a.status !== b.status) {
      const ordemStatus = { aberto: 0, em_analise: 1, resolvido: 2, ignorado: 3 }
      return (ordemStatus[a.status] || 0) - (ordemStatus[b.status] || 0)
    }
    return (SEV_ORDEM[a.severidade] || 99) - (SEV_ORDEM[b.severidade] || 99)
  })

  if (filtrados.length === 0) {
    lista.innerHTML = `
      <div class="empty">
        <div class="empty-icon">${_achados.length ? '🎉' : '🔍'}</div>
        <div class="empty-msg">${_achados.length ? 'Nenhum achado neste filtro' : 'Nenhuma auditoria executada ainda'}</div>
        <div class="empty-sub">${_achados.length ? 'Tente remover os filtros' : 'Clique em "Rodar Auditoria" para iniciar'}</div>
      </div>`
    return
  }

  lista.innerHTML = filtrados.map(a => renderAchadoCard(a)).join('')
}

function renderAchadoCard(a) {
  const dom   = DOMINIOS[a.dominio] || { label: a.dominio, cor: '#6B7280' }
  const aberto = a.status === 'aberto' || a.status === 'em_analise'

  return `
  <div class="achado-card" id="card-${a.id}">
    <div class="achado-header" onclick="toggleCard('${a.id}')">
      <div class="sev-strip sev-${a.severidade}"></div>
      <div style="flex:1;min-width:0">
        <div class="achado-titulo">${esc(a.titulo)}</div>
        <div class="achado-meta">
          <span class="sev-badge ${a.severidade}">${labelSev(a.severidade)}</span>
          <span class="dom-badge" style="border-left:3px solid ${dom.cor}">${dom.label}</span>
          ${a.referencia_label ? `<span class="achado-ref">${esc(a.referencia_label)}</span>` : ''}
          <span class="achado-status-tag tag-${a.status}">${labelStatus(a.status)}</span>
        </div>
      </div>
      <span class="achado-chevron">▾</span>
    </div>
    <div class="achado-body">
      <div class="achado-desc">${esc(a.descricao)}</div>
      ${a.recomendacao ? `
        <div class="achado-rec">
          <strong>Recomendação</strong>
          ${esc(a.recomendacao)}
        </div>` : ''}
      ${a.comentario_resolucao ? `
        <div style="margin-top:10px;font-size:11px;color:var(--cinza-500)">
          <strong>Resolução registrada:</strong> ${esc(a.comentario_resolucao)}
        </div>` : ''}
      ${aberto ? `
        <div class="achado-acoes">
          <button class="btn-acao resolver" onclick="abrirModalResolucao('${a.id}','${esc(a.titulo)}')">✓ Marcar como resolvido</button>
          <button class="btn-acao ignorar" onclick="ignorarAchado('${a.id}')">Ignorar</button>
        </div>` : ''}
    </div>
  </div>`
}

function labelSev(s) {
  return { critico: 'Crítico', alto: 'Alto', medio: 'Médio', baixo: 'Baixo', info: 'Info' }[s] || s
}
function labelStatus(s) {
  return { aberto: 'Aberto', em_analise: 'Em análise', resolvido: 'Resolvido', ignorado: 'Ignorado' }[s] || s
}

function toggleCard(id) {
  document.getElementById(`card-${id}`)?.classList.toggle('aberto')
}

// ── Stats ──────────────────────────────────────────────────────
function renderStats() {
  const contagem = { critico: 0, alto: 0, medio: 0, baixo: 0, info: 0 }
  _achados.filter(a => a.status === 'aberto' || a.status === 'em_analise')
    .forEach(a => { if (contagem[a.severidade] !== undefined) contagem[a.severidade]++ })

  for (const [k, v] of Object.entries(contagem)) {
    const el = document.getElementById(`cnt-${k}`)
    if (el) el.textContent = v
  }
}

// ── Gráfico de domínios (barras simples) ──────────────────────
function renderDomChart() {
  const cont = document.getElementById('dom-chart')
  if (!cont) return

  const counts = {}
  _achados.filter(a => a.status === 'aberto' || a.status === 'em_analise')
    .forEach(a => { counts[a.dominio] = (counts[a.dominio] || 0) + 1 })

  const max = Math.max(...Object.values(counts), 1)

  cont.innerHTML = Object.entries(DOMINIOS).map(([key, meta]) => {
    const n = counts[key] || 0
    const pct = Math.round((n / max) * 100)
    return `
      <div class="dom-row">
        <div class="dom-nome">${meta.label}</div>
        <div class="dom-barra-bg">
          <div class="dom-barra-fill" style="width:${pct}%;background:${meta.cor}"></div>
        </div>
        <div class="dom-count">${n}</div>
      </div>`
  }).join('')
}

// ── Histórico de execuções ─────────────────────────────────────
async function carregarHistorico() {
  const { data } = await db
    .from('auditoria_execucoes')
    .select('id,iniciado_em,concluido_em,total_achados,achados_criticos,status')
    .order('iniciado_em', { ascending: false })
    .limit(8)

  const cont = document.getElementById('historico-execucoes')
  if (!data?.length) return

  cont.innerHTML = data.map(e => {
    const data_fmt = e.concluido_em
      ? new Date(e.concluido_em).toLocaleString('pt-BR', { day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit' })
      : 'Rodando...'
    return `
      <div class="exec-row" onclick="carregarAchados('${e.id}')">
        <span class="exec-row-data">${data_fmt}</span>
        <span class="exec-row-achados">${e.total_achados ?? '—'} achados</span>
        ${(e.achados_criticos || 0) > 0
          ? `<span class="exec-row-crit">⚠ ${e.achados_criticos} crítico${e.achados_criticos > 1 ? 's' : ''}</span>`
          : '<span style="color:var(--sucesso)">✓</span>'}
      </div>`
  }).join('')
}

// ── Filtros ────────────────────────────────────────────────────
function filtrar(status, btn) {
  _filtroStatus = status
  _filtroDom    = null
  document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('ativo'))
  btn.classList.add('ativo')
  renderAchados()
}

function filtrarDom(dominio, btn) {
  _filtroDom    = _filtroDom === dominio ? null : dominio
  _filtroStatus = 'todos'
  document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('ativo'))
  if (_filtroDom) btn.classList.add('ativo')
  else document.querySelector('.filtro-btn')?.classList.add('ativo')
  renderAchados()
}

// ── Disparar auditoria ─────────────────────────────────────────
async function dispararAuditoria() {
  const btn = document.getElementById('btn-auditar')
  btn.disabled = true
  btn.innerHTML = `<span class="spinner"></span> Auditando...`

  const banner = document.getElementById('exec-banner')
  const icon   = document.getElementById('exec-icon')
  const titulo = document.getElementById('exec-titulo')
  const sub    = document.getElementById('exec-sub')
  const resumo = document.getElementById('exec-resumo')

  banner.style.display = 'flex'
  icon.className = 'exec-icon idle'
  icon.textContent = '⏳'
  titulo.textContent = 'Auditoria em andamento...'
  sub.textContent = 'Os 6 agentes especialistas estão varrendo o sistema. Aguarde.'
  resumo.style.display = 'none'

  try {
    const { data: { session } } = await db.auth.getSession()

    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/auditor-ia`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ usuario_id: appState.usuario?.id }),
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Erro HTTP ${res.status}`)
    }

    const resultado = await res.json()

    toast(`Auditoria concluída: ${resultado.total_achados} achados (${resultado.achados_criticos} críticos)`,
      resultado.achados_criticos > 0 ? 'error' : resultado.total_achados > 0 ? 'warning' : 'success')

    // Recarregar tudo
    await Promise.all([carregarUltimaExecucao(), carregarHistorico()])

  } catch (e) {
    console.error('[auditoria] Erro:', e)
    toast('Erro ao executar auditoria: ' + e.message, 'error')
    titulo.textContent = 'Erro na execução'
    sub.textContent = e.message
    icon.textContent = '❌'
  } finally {
    btn.disabled = false
    btn.innerHTML = `<span>🔍</span> Rodar Auditoria`
  }
}

// ── Resolver achado ────────────────────────────────────────────
function abrirModalResolucao(id, titulo) {
  _resolvendoId = id
  document.getElementById('modal-titulo').textContent = 'Resolver: ' + titulo.slice(0, 60)
  document.getElementById('modal-comentario').value = ''
  document.getElementById('modal-resolucao').style.display = 'flex'
  setTimeout(() => document.getElementById('modal-comentario').focus(), 50)
}

function fecharModal(e) {
  if (e && e.target !== document.getElementById('modal-resolucao')) return
  document.getElementById('modal-resolucao').style.display = 'none'
  _resolvendoId = null
}

async function confirmarResolucao() {
  if (!_resolvendoId) return
  const comentario = document.getElementById('modal-comentario').value.trim()
  if (!comentario) { toast('Informe o que foi feito para resolver o achado.', 'warning'); return }

  const btn = document.getElementById('modal-btn-ok')
  btn.disabled = true
  btn.textContent = 'Salvando...'

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

    // Atualiza localmente
    const idx = _achados.findIndex(a => a.id === _resolvendoId)
    if (idx >= 0) {
      _achados[idx].status = 'resolvido'
      _achados[idx].comentario_resolucao = comentario
    }

    toast('Achado marcado como resolvido.', 'success')
    renderAchados()
    renderStats()
    renderDomChart()
    document.getElementById('modal-resolucao').style.display = 'none'
    _resolvendoId = null

  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'error')
  } finally {
    btn.disabled = false
    btn.textContent = 'Confirmar resolução'
  }
}

async function ignorarAchado(id) {
  const { error } = await db
    .from('auditoria_registros')
    .update({ status: 'ignorado' })
    .eq('id', id)

  if (error) { toast('Erro ao ignorar achado.', 'error'); return }

  const idx = _achados.findIndex(a => a.id === id)
  if (idx >= 0) _achados[idx].status = 'ignorado'

  toast('Achado ignorado.', 'info')
  renderAchados()
  renderStats()
  renderDomChart()
}
