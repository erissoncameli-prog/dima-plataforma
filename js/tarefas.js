// tarefas.js — Painel de Tarefas & Delegações · DIMA (UNESCO/SEMA-AC)
// Atores: responsável interno (usuarios) opera; fornecedor (parte externa) é
// notificado por e-mail. Escrita via RPCs SECURITY DEFINER; e-mail via
// Edge Function enviar-email-tarefa.

;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { localStorage.setItem('dima_redirect', window.location.href); window.location.href = '../index.html'; return }

  // ── Constantes de apresentação ────────────────────────────────────────
  const COLS = [
    { k: 'a_fazer',      nm: 'A fazer',      cor: '#6B7280' },
    { k: 'em_andamento', nm: 'Em andamento', cor: '#2563EB' },
    { k: 'em_revisao',   nm: 'Em revisão',   cor: '#D97706' },
    { k: 'bloqueada',    nm: 'Bloqueada',    cor: '#DC2626' },
    { k: 'concluida',    nm: 'Concluída',    cor: '#059669' },
  ]
  const ST_COR = Object.fromEntries(COLS.map(c => [c.k, c.cor]))
  const ST_NM  = { ...Object.fromEntries(COLS.map(c => [c.k, c.nm])), cancelada: 'Cancelada' }
  const PRIOS  = [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta'], ['urgente', 'Urgente']]
  const PRIO_NM = Object.fromEntries(PRIOS)

  const podeDelegarGlobal = ['super_admin', 'coordenacao'].includes(appState.perfil)

  // ── Estado ────────────────────────────────────────────────────────────
  const S = {
    tarefas: [], usuarios: [], atividades: [], fornecedores: [], progresso: {},
    aba: 'kanban', fResp: '', fPrio: '', fAtraso: false, fRestrita: false, editId: null,
  }

  // Fallback de progresso por status quando a tarefa não tem checklist
  const PCT_STATUS = { a_fazer: 0, em_andamento: 40, em_revisao: 75, bloqueada: 40, concluida: 100, cancelada: 0 }
  function progressoDe (t) {
    if (t.status === 'concluida') return { pct: 100, label: '', tem: false }
    const p = S.progresso[t.id]
    if (p && p.total > 0) return { pct: p.pct, label: `${p.feitas}/${p.total}`, tem: true }
    return { pct: PCT_STATUS[t.status] ?? 0, label: '', tem: false }
  }
  function barraProgresso (t, ctx) {
    const pr = progressoDe(t)
    const cor = pr.pct >= 100 ? 'var(--sucesso)' : (pr.tem ? 'var(--verde-medio)' : 'var(--cinza-300)')
    const tt = pr.tem ? `Checklist ${pr.label}` : `Progresso ${pr.pct}%`
    return `<div class="tk-prog ${ctx}" title="${tt}">
      <div class="tk-prog-bar"><div class="tk-prog-fill" style="width:${pr.pct}%;background:${cor}"></div></div>
      ${pr.tem ? `<span class="tk-prog-lbl">${pr.label}</span>` : ''}
    </div>`
  }

  // ── Datas ─────────────────────────────────────────────────────────────
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const parseD = s => (s ? new Date(s + 'T00:00:00') : null)
  const diasAte = s => { const d = parseD(s); return d ? Math.round((d - hoje) / 86400000) : null }
  const fmtBR = s => { const d = parseD(s); return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '' }

  // ── Avatares ──────────────────────────────────────────────────────────
  const AV_CORES = ['#166534', '#0891b2', '#7c3aed', '#b45309', '#be123c', '#0d9488', '#4f46e5', '#c2410c']
  const iniciais = n => (n || '?').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()
  const avCor = id => AV_CORES[[...String(id || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_CORES.length]
  const avatar = u => `<span class="av" style="background:${avCor(u.id)}" title="${esc(u.nome_completo || '')}">${esc(iniciais(u.nome_completo))}</span>`

  const nomeUsuario = id => (S.usuarios.find(u => u.id === id) || {}).nome_completo || '—'
  const nomeFornecedor = id => (S.fornecedores.find(f => f.id === id) || {}).nome || 'Fornecedor'
  const respsDe = t => (t.participantes || []).filter(p => p.papel === 'responsavel')
  const obsDe   = t => (t.participantes || []).filter(p => p.papel === 'observador')
  const souResponsavel = t => respsDe(t).some(p => p.usuario_id === usuario.id)
  const LOCK = '<span class="tk-lock" title="Tarefa restrita: visível só para os envolvidos">🔒</span>'
  const cadeado = t => t && t.restrita ? LOCK : ''

  // ── Carregar dados ────────────────────────────────────────────────────
  async function carregarTudo () {
    const [tj, uj, aj, fj, pj] = await Promise.all([
      db.from('tarefas').select(
        'id,codigo,titulo,descricao,status,prioridade,dt_inicio,dt_prazo,dt_conclusao,' +
        'entidade_tipo,entidade_id,atividade_id,fornecedor_id,notificar_fornecedor,restrita,ordem,criado_por,criado_em,' +
        'participantes:tarefa_participantes(usuario_id,papel),' +
        'atividade:atividades(id,codigo,nome_pt),' +
        'fornecedor:fornecedores(id,nome)'
      ).eq('ativo', true).order('ordem', { ascending: true }).order('criado_em', { ascending: false }),
      db.from('usuarios').select('id,nome_completo,perfil,email').eq('ativo', true).order('nome_completo'),
      db.from('atividades').select('id,codigo,nome_pt').eq('ativo', true).order('codigo'),
      db.from('fornecedores').select('id,nome,email').eq('ativo', true).order('nome'),
      db.from('vw_tarefa_progresso').select('tarefa_id,total,feitas,pct'),
    ])
    S.tarefas = tj.data || []
    S.usuarios = uj.data || []
    S.atividades = aj.data || []
    S.fornecedores = fj.data || []
    S.progresso = {}
    ;(pj.data || []).forEach(p => { S.progresso[p.tarefa_id] = p })
  }

  // ── E-mail (Edge Function) ────────────────────────────────────────────
  async function chamarEmail (tarefa_id, evento, extra = {}) {
    try {
      const { data: { session } } = await db.auth.getSession()
      await fetch(SUPABASE_URL + '/functions/v1/enviar-email-tarefa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (session?.access_token || ''),
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ tarefa_id, evento, autor_id: usuario.id, ...extra }),
      })
    } catch (e) { console.error('e-mail tarefa:', e) }
  }

  // ══ RENDER ════════════════════════════════════════════════════════════
  function render () {
    const html =
      '<div class="fade-in">' +
        toolbar() +
        `<div id="tk-view">${viewAtual()}</div>` +
      '</div>'
    document.getElementById('app').innerHTML =
      gerarLayout('Tarefas', 'tarefas') + html + '</div></div></div>'
    carregarLogosSidebar()
    if (S.aba === 'kanban') ligarDragDrop()
  }

  function toolbar () {
    const optUsers = ['<option value="">Todos os responsáveis</option>']
      .concat(S.usuarios.map(u => `<option value="${u.id}" ${S.fResp === u.id ? 'selected' : ''}>${esc(u.nome_completo)}</option>`)).join('')
    const optPrio = ['<option value="">Toda prioridade</option>']
      .concat(PRIOS.map(([k, v]) => `<option value="${k}" ${S.fPrio === k ? 'selected' : ''}>${v}</option>`)).join('')
    return `<div class="tk-toolbar">
      <div class="tk-tabs">
        <button class="tk-tab ${S.aba === 'kanban' ? 'on' : ''}" onclick="TK.aba('kanban')">Quadro</button>
        <button class="tk-tab ${S.aba === 'lista' ? 'on' : ''}" onclick="TK.aba('lista')">Lista</button>
        <button class="tk-tab ${S.aba === 'calendario' ? 'on' : ''}" onclick="TK.aba('calendario')">Calendário</button>
        <button class="tk-tab ${S.aba === 'minhas' ? 'on' : ''}" onclick="TK.aba('minhas')">Minhas tarefas</button>
      </div>
      ${(S.aba === 'kanban' || S.aba === 'lista') ? `
      <select class="tk-sel" onchange="TK.filtroResp(this.value)">${optUsers}</select>
      <select class="tk-sel" onchange="TK.filtroPrio(this.value)">${optPrio}</select>
      <button class="tk-tab ${S.fAtraso ? 'on' : ''}" style="border:1px solid var(--borda)" onclick="TK.toggleAtraso(this)">Só atrasadas</button>
      <button class="tk-tab ${S.fRestrita ? 'on' : ''}" style="border:1px solid var(--borda)" onclick="TK.toggleRestrita(this)" title="Tarefas visíveis só para os envolvidos">🔒 Restritas</button>
      ` : ''}
      <div class="tk-spacer"></div>
      <button class="tk-btn" onclick="TK.novo()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Nova tarefa
      </button>
    </div>`
  }

  function passaFiltro (t) {
    if (S.fResp && !respsDe(t).some(p => p.usuario_id === S.fResp)) return false
    if (S.fPrio && t.prioridade !== S.fPrio) return false
    if (S.fRestrita && !t.restrita) return false
    if (S.fAtraso) { const d = diasAte(t.dt_prazo); if (!(d !== null && d < 0 && t.status !== 'concluida')) return false }
    return true
  }

  // ── Kanban ────────────────────────────────────────────────────────────
  function viewKanban () {
    const ts = S.tarefas.filter(t => t.status !== 'cancelada' && passaFiltro(t))
    return '<div class="tk-board">' + COLS.map(c => {
      const nesta = ts.filter(t => t.status === c.k)
      const cards = nesta.length
        ? nesta.map(cardKanban).join('')
        : '<div class="tk-empty">—</div>'
      return `<div class="tk-col" data-status="${c.k}">
        <div class="tk-col-h"><span class="dot" style="background:${c.cor}"></span>
          <span class="nm">${c.nm}</span><span class="ct">${nesta.length}</span></div>
        <div class="tk-col-body">${cards}</div>
      </div>`
    }).join('') + '</div>'
  }

  function badgePrazo (t) {
    if (t.status === 'concluida') return `<span class="due">✓ ${fmtBR(t.dt_conclusao ? t.dt_conclusao.slice(0, 10) : t.dt_prazo)}</span>`
    const d = diasAte(t.dt_prazo)
    if (d === null) return ''
    if (d < 0)  return `<span class="due late">⚠ atrasada</span>`
    if (d === 0) return `<span class="due today">📅 hoje</span>`
    return `<span class="due">📅 ${fmtBR(t.dt_prazo)}</span>`
  }

  function cardKanban (t) {
    const rs = respsDe(t).slice(0, 3)
      .map(p => avatar({ id: p.usuario_id, nome_completo: nomeUsuario(p.usuario_id) })).join('')
    const prio = `<span class="prio prio-${t.prioridade}">${PRIO_NM[t.prioridade]}</span>`
    const atv = t.atividade ? `<span class="lnk">${esc(t.atividade.codigo)}</span>` : ''
    const frn = t.fornecedor ? `<span class="frn" title="${esc(t.fornecedor.nome)}">🏢 ${esc((t.fornecedor.nome || '').split(' ')[0])}</span>` : ''
    return `<div class="tk-card" draggable="true" data-id="${t.id}" onclick="TK.abrir('${t.id}')">
      <div class="code">${esc(t.codigo || '')}</div>
      <div class="ttl">${cadeado(t)}${esc(t.titulo)}</div>
      <div class="meta">${prio}${atv}${frn}
        <span class="av-stack">${rs}</span>${badgePrazo(t)}</div>
      ${barraProgresso(t, 'card')}
    </div>`
  }

  // ── Minhas tarefas ────────────────────────────────────────────────────
  function viewMinhas () {
    const minhas = S.tarefas.filter(t => souResponsavel(t) && t.status !== 'cancelada')
    if (!minhas.length) return `<div class="tk-empty" style="padding:48px">Nenhuma tarefa atribuída a você. 🎉</div>`

    const ativas = minhas.filter(t => t.status !== 'concluida')
    const feitas = minhas.filter(t => t.status === 'concluida')
    const grupos = [
      ['Atrasadas',    t => { const d = diasAte(t.dt_prazo); return d !== null && d < 0 }],
      ['Hoje',         t => diasAte(t.dt_prazo) === 0],
      ['Esta semana',  t => { const d = diasAte(t.dt_prazo); return d !== null && d > 0 && d <= 7 }],
      ['Depois',       t => { const d = diasAte(t.dt_prazo); return d !== null && d > 7 }],
      ['Sem prazo',    t => diasAte(t.dt_prazo) === null],
    ]
    let out = ''
    grupos.forEach(([nm, fn]) => {
      const g = ativas.filter(fn)
      if (g.length) out += grupoLista(nm, g)
    })
    if (feitas.length) out += grupoLista('Concluídas', feitas)
    return out
  }

  function grupoLista (nm, arr) {
    const rows = arr.map(t => {
      const rs = respsDe(t).slice(0, 3).map(p => avatar({ id: p.usuario_id, nome_completo: nomeUsuario(p.usuario_id) })).join('')
      return `<div class="tk-row" onclick="TK.abrir('${t.id}')">
        <span class="st-dot" style="background:${ST_COR[t.status] || '#9CA3AF'}" title="${ST_NM[t.status]}"></span>
        <span class="r-ttl"><span class="r-code">${esc(t.codigo || '')}</span> ${cadeado(t)}${esc(t.titulo)}</span>
        <span class="prio prio-${t.prioridade}">${PRIO_NM[t.prioridade]}</span>
        ${t.atividade ? `<span class="lnk">${esc(t.atividade.codigo)}</span>` : ''}
        <span class="av-stack">${rs}</span>
        ${badgePrazo(t)}
      </div>`
    }).join('')
    return `<div class="tk-group">
      <div class="tk-group-h"><span class="g-nm">${nm}</span><span class="g-ct">${arr.length}</span><span class="g-bar"></span></div>
      ${rows}
    </div>`
  }

  // ── Lista (tabela) ────────────────────────────────────────────────────
  function viewLista () {
    const ts = S.tarefas.filter(t => t.status !== 'cancelada' && passaFiltro(t))
      .sort((a, b) => (a.dt_prazo || '9999').localeCompare(b.dt_prazo || '9999'))
    if (!ts.length) return `<div class="tk-empty" style="padding:40px">Nenhuma tarefa.</div>`
    const linhas = ts.map(t => {
      const rs = respsDe(t).slice(0, 3).map(p => avatar({ id: p.usuario_id, nome_completo: nomeUsuario(p.usuario_id) })).join('')
      return `<tr onclick="TK.abrir('${t.id}')">
        <td class="mono-cell">${esc(t.codigo || '')}</td>
        <td><span class="st-dot" style="background:${ST_COR[t.status] || '#9CA3AF'}"></span> ${cadeado(t)}${esc(t.titulo)}</td>
        <td><span class="prio prio-${t.prioridade}">${PRIO_NM[t.prioridade]}</span></td>
        <td>${ST_NM[t.status] || t.status}</td>
        <td>${t.atividade ? esc(t.atividade.codigo) : (t.fornecedor ? '🏢 ' + esc((t.fornecedor.nome || '').split(' ')[0]) : '—')}</td>
        <td><span class="av-stack">${rs || '—'}</span></td>
        <td>${barraProgresso(t, 'lista')}</td>
        <td>${badgePrazo(t) || '—'}</td>
      </tr>`
    }).join('')
    return `<div class="tk-tbl-wrap"><table class="tk-tbl">
      <thead><tr><th>Código</th><th>Tarefa</th><th>Prioridade</th><th>Status</th><th>Vínculo</th><th>Resp.</th><th>Progresso</th><th>Prazo</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`
  }

  // ── Calendário (grade mensal) ─────────────────────────────────────────
  let calRef = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  function viewCalendario () {
    const ano = calRef.getFullYear(), mes = calRef.getMonth()
    const primeiro = new Date(ano, mes, 1)
    const inicioGrade = new Date(primeiro); inicioGrade.setDate(1 - ((primeiro.getDay() + 6) % 7)) // semana começa seg
    const nomeMes = calRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    const ts = S.tarefas.filter(t => t.status !== 'cancelada' && t.dt_prazo && passaFiltro(t))
    const porDia = {}
    ts.forEach(t => { (porDia[t.dt_prazo] ||= []).push(t) })

    const dows = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
    let celulas = ''
    const d = new Date(inicioGrade)
    for (let i = 0; i < 42; i++) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const foraMes = d.getMonth() !== mes
      const isHoje = d.getTime() === hoje.getTime()
      const its = (porDia[iso] || []).slice(0, 4)
      const mais = (porDia[iso] || []).length - its.length
      const chips = its.map(t => `<div class="cal-chip" style="border-left:3px solid ${ST_COR[t.status] || '#9CA3AF'}"
          onclick="event.stopPropagation();TK.abrir('${t.id}')" title="${esc(t.titulo)}">${t.restrita ? '🔒 ' : ''}${esc(t.titulo)}</div>`).join('')
      celulas += `<div class="cal-cell ${foraMes ? 'fora' : ''} ${isHoje ? 'hoje' : ''}">
        <div class="cal-dia">${d.getDate()}</div>${chips}${mais > 0 ? `<div class="cal-mais">+${mais}</div>` : ''}
      </div>`
      d.setDate(d.getDate() + 1)
    }
    return `<div class="cal-head">
        <button class="cal-nav" onclick="TK.calMes(-1)">‹</button>
        <span class="cal-titulo">${nomeMes}</span>
        <button class="cal-nav" onclick="TK.calMes(1)">›</button>
        <button class="cal-hoje" onclick="TK.calHoje()">Hoje</button>
      </div>
      <div class="cal-grid cal-dow">${dows.map(w => `<div class="cal-dowc">${w}</div>`).join('')}</div>
      <div class="cal-grid">${celulas}</div>`
  }

  // ── Drag & drop ───────────────────────────────────────────────────────
  let dragId = null
  function ligarDragDrop () {
    document.querySelectorAll('.tk-card').forEach(el => {
      el.addEventListener('dragstart', e => { dragId = el.dataset.id; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move' })
      el.addEventListener('dragend', () => { dragId = null; el.classList.remove('dragging') })
    })
    document.querySelectorAll('.tk-col').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over') })
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'))
      col.addEventListener('drop', async e => {
        e.preventDefault(); col.classList.remove('drag-over')
        const novo = col.dataset.status
        const t = S.tarefas.find(x => x.id === dragId)
        if (!t || t.status === novo) return
        await mudarStatus(t, novo)
      })
    })
  }

  async function mudarStatus (t, novo) {
    const antigo = t.status
    t.status = novo; t.dt_conclusao = novo === 'concluida' ? new Date().toISOString() : null
    refreshView()
    const { error } = await db.rpc('fn_mudar_status_tarefa', { p_tarefa_id: t.id, p_status: novo })
    if (error) { t.status = antigo; refreshView(); toast('Não foi possível mover: ' + error.message, 'error'); return }
    if (novo === 'concluida') { toast('Tarefa concluída ✓', 'success'); chamarEmail(t.id, 'concluida') }
  }

  function viewAtual () {
    if (S.aba === 'lista') return viewLista()
    if (S.aba === 'calendario') return viewCalendario()
    if (S.aba === 'minhas') return viewMinhas()
    return viewKanban()
  }

  function refreshView () {
    document.getElementById('tk-view').innerHTML = viewAtual()
    if (S.aba === 'kanban') ligarDragDrop()
  }

  // ══ MODAL ═════════════════════════════════════════════════════════════
  function abrirModal (t) {
    S.editId = t ? t.id : null
    S.det = null; S.detAba = 'checklist'; S.editChk = null
    S.podeEditar = !t || podeDelegarGlobal || t.criado_por === usuario.id || souResponsavel(t)
    const ov = document.getElementById('tk-overlay')
    document.getElementById('tk-modal').innerHTML = montarModal(t)
    ov.classList.add('on')
    if (t) carregarDetalhe(t.id)
  }

  // ── Detalhe (checklist / comentários / anexos / histórico) ────────────
  async function carregarDetalhe (id) {
    const [ck, cm, hi, an] = await Promise.all([
      db.from('tarefa_checklist').select('*').eq('tarefa_id', id).order('ordem'),
      db.from('tarefa_comentarios').select('id,corpo,autor_id,autor_fornecedor_id,checklist_id,origem,criado_em').eq('tarefa_id', id).order('criado_em'),
      db.from('tarefa_historico').select('*').eq('tarefa_id', id).order('criado_em', { ascending: false }),
      db.from('tarefa_anexos').select('*').eq('tarefa_id', id).order('criado_em'),
    ])
    S.det = { id, checklist: ck.data || [], coment: cm.data || [], hist: hi.data || [], anexos: an.data || [] }
    // mantém o cache de progresso em sincronia (barra do card/lista)
    const total = S.det.checklist.length, feitas = S.det.checklist.filter(c => c.concluida).length
    if (total > 0) S.progresso[id] = { tarefa_id: id, total, feitas, pct: Math.round(100 * feitas / total) }
    else delete S.progresso[id]
    renderDetalhe()
  }

  const HIST_TXT = {
    criacao: 'criou a tarefa', status: 'mudou o status', prazo: 'alterou o prazo',
    responsavel: 'atribuiu', conclusao: 'concluiu', reabertura: 'reabriu',
    comentario: 'comentou', edicao: 'editou', anexo: 'anexou',
    subtarefa_resp: 'atribuiu a subtarefa', comentario_fornecedor: 'resposta por e-mail de',
    restricao: 'alterou a visibilidade',
  }
  const fmtDT = s => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
  const primeiroNome = n => (n || '').split(' ')[0]

  // ── Helpers de subtarefa ──────────────────────────────────────────────
  // Responsável da subtarefa: "u:<id>" (usuário) ou "f:<id>" (fornecedor)
  const respKey = c => c.responsavel_usuario_id ? 'u:' + c.responsavel_usuario_id
    : (c.responsavel_fornecedor_id ? 'f:' + c.responsavel_fornecedor_id : '')
  const parseResp = v => ({
    responsavel_usuario_id: v && v.startsWith('u:') ? v.slice(2) : null,
    responsavel_fornecedor_id: v && v.startsWith('f:') ? v.slice(2) : null,
  })
  function optRespChk (sel) {
    const us = S.usuarios.map(u => `<option value="u:${u.id}" ${sel === 'u:' + u.id ? 'selected' : ''}>${esc(u.nome_completo)}</option>`).join('')
    const fs = S.fornecedores.map(f => `<option value="f:${f.id}" ${sel === 'f:' + f.id ? 'selected' : ''}>${esc(f.nome)}${f.email ? '' : ' (sem e-mail)'}</option>`).join('')
    return `<option value="">— responsável —</option><optgroup label="Usuários">${us}</optgroup><optgroup label="Fornecedores">${fs}</optgroup>`
  }
  function chipResp (c) {
    if (c.responsavel_usuario_id) {
      const nm = nomeUsuario(c.responsavel_usuario_id)
      return `<span class="ck-resp">${avatar({ id: c.responsavel_usuario_id, nome_completo: nm })} ${esc(primeiroNome(nm))}</span>`
    }
    if (c.responsavel_fornecedor_id) {
      const nm = nomeFornecedor(c.responsavel_fornecedor_id)
      return `<span class="ck-resp frn" title="${esc(nm)} — recebe e responde por e-mail">🏢 ${esc(nm.length > 24 ? nm.slice(0, 24) + '…' : nm)}</span>`
    }
    return ''
  }
  function badgePrazoChk (c) {
    if (!c.dt_prazo) return ''
    if (c.concluida) return `<span class="due">📅 ${fmtBR(c.dt_prazo)}</span>`
    const d = diasAte(c.dt_prazo)
    if (d < 0) return `<span class="due late" style="margin-left:0">⚠ ${fmtBR(c.dt_prazo)}</span>`
    if (d === 0) return `<span class="due today" style="margin-left:0">📅 hoje</span>`
    return `<span class="due" style="margin-left:0">📅 ${fmtBR(c.dt_prazo)}</span>`
  }
  const chipsAnexos = lista => lista.map(a =>
    `<a href="#" class="ax-chip" data-arquivo="${esc(a.arquivo_url)}" title="${esc(a.arquivo_nome)}">📎 ${esc(a.arquivo_nome)}</a>`).join('')
  const lblArquivos = files => !files || !files.length ? '' : files.length === 1 ? files[0].name : `${files.length} arquivos`

  // Envia arquivos para o bucket e registra em tarefa_anexos com os vínculos
  // informados (checklist_id / comentario_id). Retorna quantos falharam.
  async function enviarArquivos (files, vinculo = {}) {
    let falhas = 0
    for (const f of [...(files || [])]) {
      const safe = f.name.replace(/[^\w.\-]+/g, '_')
      const path = `${S.det.id}/${Date.now()}_${safe}`
      const up = await db.storage.from('tarefas-anexos').upload(path, f, { upsert: false })
      if (up.error) { falhas++; toast('Falha no upload de ' + f.name + ': ' + up.error.message, 'error'); continue }
      const url = db.storage.from('tarefas-anexos').getPublicUrl(path).data.publicUrl
      const { error } = await db.from('tarefa_anexos').insert({
        tarefa_id: S.det.id, arquivo_url: url, arquivo_nome: f.name, mime: f.type || null,
        tamanho: f.size || null, enviado_por: usuario.id, ...vinculo,
      })
      if (error) { falhas++; toast(error.message, 'error') }
    }
    return falhas
  }

  // Usuário responsável por subtarefa vira observador (trigger no banco).
  // Recarrega a tarefa e marca o checkbox no formulário aberto, senão um
  // "Salvar" em seguida removeria o observador recém-incluído.
  async function refletirObservador (uid) {
    if (!uid) return
    await carregarTudo()
    const resp = document.querySelector(`.chk-resp[value="${uid}"]`)
    const obs = document.querySelector(`.chk-obs[value="${uid}"]`)
    if (obs && !(resp && resp.checked)) obs.checked = true
  }

  function itemChecklist (c, d) {
    const axs = d.anexos.filter(a => a.checklist_id === c.id)
    if (S.editChk === c.id) {
      return `<div class="ck-item ck-edit">
        <div class="ck-form">
          <input type="text" id="ck-ed-desc" value="${esc(c.descricao)}">
          <div class="ck-form-row">
            <select id="ck-ed-resp">${optRespChk(respKey(c))}</select>
            <input type="date" id="ck-ed-prazo" value="${c.dt_prazo || ''}">
          </div>
          ${axs.length ? `<div class="ck-axs">${axs.map(a => `<span class="ax-chip-w">${chipsAnexos([a])}
            <button class="ck-x" onclick="TK.delAnexo('${a.id}','${esc(a.arquivo_url)}')" title="Remover anexo">×</button></span>`).join('')}</div>` : ''}
          <div class="ck-form-row">
            <label class="ck-file">📎 <span id="ck-ed-file-lbl">Anexar</span><input type="file" id="ck-ed-file" multiple hidden onchange="TK.lblFiles(this,'ck-ed-file-lbl')"></label>
            <span class="tk-spacer"></span>
            <button class="btn-sec" onclick="TK.editChk(null)">Cancelar</button>
            <button class="btn-pri" onclick="TK.saveChk('${c.id}')">Salvar</button>
          </div>
        </div>
      </div>`
    }
    const meta = [chipResp(c), badgePrazoChk(c)].filter(Boolean).join('')
    return `<div class="ck-item">
      <input type="checkbox" ${c.concluida ? 'checked' : ''} ${S.podeEditar ? '' : 'disabled'} onchange="TK.toggleChk('${c.id}',this.checked)">
      <div class="ck-main">
        <span class="ck-desc ${c.concluida ? 'done' : ''}">${esc(c.descricao)}</span>
        ${meta || axs.length ? `<div class="ck-meta">${meta}${chipsAnexos(axs)}</div>` : ''}
      </div>
      ${S.podeEditar ? `<button class="ck-x ck-ed" onclick="TK.editChk('${c.id}')" title="Editar">✎</button>
      <button class="ck-x" onclick="TK.delChk('${c.id}')" title="Remover">×</button>` : ''}
    </div>`
  }

  function renderDetalhe () {
    const el = document.getElementById('tk-detalhe'); if (!el || !S.det) return
    const d = S.det
    const feitas = d.checklist.filter(c => c.concluida).length
    const tabs = [
      ['checklist', `Subtarefas${d.checklist.length ? ` (${feitas}/${d.checklist.length})` : ''}`],
      ['coment', `Comentários${d.coment.length ? ` (${d.coment.length})` : ''}`],
      ['anexos', `Anexos${d.anexos.length ? ` (${d.anexos.length})` : ''}`],
      ['hist', 'Histórico'],
    ]
    let corpo = ''
    if (S.detAba === 'checklist') {
      const pct = d.checklist.length ? Math.round(feitas / d.checklist.length * 100) : 0
      const itens = d.checklist.map(c => itemChecklist(c, d)).join('')
      corpo = `${d.checklist.length ? `<div class="ck-bar"><div class="ck-fill" style="width:${pct}%"></div></div>` : ''}
        ${itens || '<div class="det-empty">Sem subtarefas.</div>'}
        ${S.podeEditar ? `<div class="ck-add">
          <input type="text" id="ck-in" placeholder="Nova subtarefa…" onkeydown="if(event.key==='Enter')TK.addChk()">
          <div class="ck-form-row">
            <select id="ck-resp" title="Responsável (usuário ou fornecedor)">${optRespChk('')}</select>
            <input type="date" id="ck-prazo" title="Data de entrega">
            <label class="ck-file" title="Anexar arquivo(s)">📎 <span id="ck-file-lbl">Anexar</span><input type="file" id="ck-file" multiple hidden onchange="TK.lblFiles(this,'ck-file-lbl')"></label>
            <button onclick="TK.addChk()">Adicionar</button>
          </div>
          <div class="hint">Usuário responsável passa a acompanhar a tarefa como observador. Fornecedor recebe a subtarefa (com anexos) por e-mail e responde por e-mail.</div>
        </div>` : ''}`
    } else if (S.detAba === 'coment') {
      const lista = d.coment.map(c => {
        const frn = !!c.autor_fornecedor_id
        const nome = frn ? nomeFornecedor(c.autor_fornecedor_id) : nomeUsuario(c.autor_id)
        const av = frn ? '<span class="av" style="background:var(--cinza-400)">🏢</span>'
          : `<span class="av" style="background:${avCor(c.autor_id)}">${esc(iniciais(nome))}</span>`
        const sub = c.checklist_id ? d.checklist.find(x => x.id === c.checklist_id) : null
        const axs = d.anexos.filter(a => a.comentario_id === c.id)
        return `<div class="cm-item">
          ${av}
          <div style="flex:1;min-width:0"><div class="cm-h"><b>${esc(nome)}</b> <span>${fmtDT(c.criado_em)}</span>
            ${c.origem === 'email' ? '<em class="cm-tag">✉ via e-mail</em>' : ''}
            ${sub ? `<em class="cm-tag">☑ ${esc(sub.descricao.length > 30 ? sub.descricao.slice(0, 30) + '…' : sub.descricao)}</em>` : ''}</div>
            <div class="cm-b">${esc(c.corpo)}</div>
            ${axs.length ? `<div class="cm-axs">${chipsAnexos(axs)}</div>` : ''}</div>
        </div>`
      }).join('')
      corpo = `${lista || '<div class="det-empty">Nenhum comentário ainda.</div>'}
        <div class="cm-add"><textarea id="cm-in" placeholder="Escreva um comentário…"></textarea>
          <div class="cm-add-acoes">
            <label class="ck-file" title="Anexar arquivo(s) ao comentário">📎 <span id="cm-file-lbl">Anexar</span><input type="file" id="cm-file" multiple hidden onchange="TK.lblFiles(this,'cm-file-lbl')"></label>
            <button onclick="TK.addComent()">Comentar</button>
          </div></div>`
    } else if (S.detAba === 'anexos') {
      const lista = d.anexos.map(a => {
        let origem = ''
        const cm = a.comentario_id ? d.coment.find(c => c.id === a.comentario_id) : null
        const sub = a.checklist_id ? d.checklist.find(c => c.id === a.checklist_id) : null
        if (cm) {
          const nome = cm.autor_fornecedor_id ? nomeFornecedor(cm.autor_fornecedor_id) : nomeUsuario(cm.autor_id)
          origem = `↳ ${cm.origem === 'email' ? 'e-mail' : 'comentário'} de ${esc(nome)} · ${fmtDT(cm.criado_em)}`
        }
        if (sub) origem += `${origem ? ' · ' : '↳ '}subtarefa: ${esc(sub.descricao)}`
        return `<div class="ax-item">
          <div style="flex:1;min-width:0"><a href="#" data-arquivo="${esc(a.arquivo_url)}">📎 ${esc(a.arquivo_nome)}</a>
            ${origem ? `<div class="ax-orig">${origem}</div>` : ''}</div>
          ${S.podeEditar ? `<button class="ck-x" onclick="TK.delAnexo('${a.id}','${esc(a.arquivo_url)}')" title="Remover">×</button>` : ''}
        </div>`
      }).join('')
      corpo = `${lista || '<div class="det-empty">Nenhum anexo.</div>'}
        ${S.podeEditar ? `<label class="ax-add">📎 Anexar arquivo<input type="file" id="ax-in" style="display:none" onchange="TK.uploadAnexo(this)"></label>
        <span id="ax-status" class="hint"></span>` : ''}`
    } else {
      corpo = d.hist.map(h => `<div class="hist-i"><span class="hi-dot"></span>
        <div><b>${h.autor_id ? esc(nomeUsuario(h.autor_id)) : '🏢'}</b> ${HIST_TXT[h.tipo] || h.tipo}
        ${h.de || h.para ? `<span style="color:var(--cinza-500)">${h.de ? esc(h.de) + ' → ' : ''}${esc(h.para || '')}</span>` : ''}
        <div style="color:var(--cinza-400);font-size:10px">${fmtDT(h.criado_em)}</div></div></div>`).join('')
        || '<div class="det-empty">Sem histórico.</div>'
    }
    el.style.color = 'inherit'
    el.innerHTML = `<div class="det-tabs">${tabs.map(([k, n]) =>
      `<button class="det-tab ${S.detAba === k ? 'on' : ''}" onclick="TK.detAba('${k}')">${n}</button>`).join('')}</div>
      <div class="det-corpo">${corpo}</div>`
  }
  window.fecharModal = () => document.getElementById('tk-overlay').classList.remove('on')

  function montarModal (t) {
    const novo = !t
    const podeEditar = novo || podeDelegarGlobal || (t && t.criado_por === usuario.id) || (t && souResponsavel(t))
    const respIds = t ? respsDe(t).map(p => p.usuario_id) : [usuario.id]
    const obsIds  = t ? obsDe(t).map(p => p.usuario_id) : []
    const podeDelegar = podeDelegarGlobal || novo // validação real no servidor
    // restrição: qualquer um cria; só o criador (ou super_admin) altera depois
    const podeRestringir = novo || t.criado_por === usuario.id || appState.perfil === 'super_admin'

    const optAtv = ['<option value="">— nenhuma —</option>'].concat(
      S.atividades.map(a => `<option value="${a.id}" ${t && t.atividade_id === a.id ? 'selected' : ''}>${esc(a.codigo)} · ${esc((a.nome_pt || '').slice(0, 40))}</option>`)).join('')
    const optFrn = ['<option value="">— nenhum —</option>'].concat(
      S.fornecedores.map(f => `<option value="${f.id}" ${t && t.fornecedor_id === f.id ? 'selected' : ''} data-email="${f.email ? 1 : 0}">${esc(f.nome)}${f.email ? '' : ' (sem e-mail)'}</option>`)).join('')

    const chipsPrio = PRIOS.map(([k, v]) =>
      `<button type="button" class="chip-t ${(t ? t.prioridade : 'media') === k ? 'on' : ''}" data-prio="${k}" onclick="TK.pickPrio(this)">${v}</button>`).join('')

    const listaResp = S.usuarios.map(u =>
      `<label><input type="checkbox" class="chk-resp" value="${u.id}" ${respIds.includes(u.id) ? 'checked' : ''}> ${esc(u.nome_completo)} <span style="color:var(--cinza-400);font-size:11px">${esc(u.perfil)}</span></label>`).join('')
    const listaObs = S.usuarios.map(u =>
      `<label><input type="checkbox" class="chk-obs" value="${u.id}" ${obsIds.includes(u.id) ? 'checked' : ''}> ${esc(u.nome_completo)}</label>`).join('')

    const histHtml = t ? '' : '' // histórico carregado sob demanda (fase 2)

    return `
    <div class="tk-modal-h">
      <h3>${novo ? 'Nova tarefa' : cadeado(t) + esc(t.titulo)}</h3>
      ${t ? `<span class="code">${esc(t.codigo)}</span>` : ''}
      <button class="tk-x" onclick="fecharModal()">×</button>
    </div>
    <div class="tk-modal-b" id="tk-form">
      <div id="tk-campos" style="display:flex;flex-direction:column;gap:14px;${podeEditar ? '' : 'pointer-events:none;opacity:.7'}">
      <div class="fld"><label>Título *</label>
        <input type="text" id="f-titulo" value="${t ? esc(t.titulo) : ''}" placeholder="O que precisa ser feito?"></div>
      <div class="fld"><label>Descrição</label>
        <textarea id="f-desc" placeholder="Contexto, links, critérios de conclusão…">${t ? esc(t.descricao || '') : ''}</textarea>
        <div class="hint">Evite colar CPF ou dados pessoais aqui — este campo é interno.</div></div>
      <div class="fld"><label>Prioridade</label><div class="chips" id="f-prio">${chipsPrio}</div></div>
      <div class="fld-row">
        <div class="fld"><label>Início</label><input type="date" id="f-inicio" value="${t && t.dt_inicio ? t.dt_inicio : ''}"></div>
        <div class="fld"><label>Prazo</label><input type="date" id="f-prazo" value="${t && t.dt_prazo ? t.dt_prazo : ''}"></div>
      </div>
      <div class="fld"><label>Responsáveis internos ${podeDelegar ? '' : '<span style="color:var(--cinza-400);font-weight:400">(só você)</span>'}</label>
        <div class="multi" ${podeDelegar ? '' : 'style="opacity:.6;pointer-events:none"'}>${listaResp}</div></div>
      <div class="fld"><label>Observadores <span style="color:var(--cinza-400);font-weight:400">(acompanham, sem executar)</span></label>
        <div class="multi">${listaObs}</div></div>
      <div class="fld-row">
        <div class="fld"><label>Atividade vinculada</label><select id="f-atv">${optAtv}</select></div>
        <div class="fld"><label>Fornecedor (parte externa)</label><select id="f-frn" onchange="TK.onFrn()">${optFrn}</select></div>
      </div>
      <div class="fld" id="f-frn-wrap" style="${t && t.fornecedor_id ? '' : 'display:none'}">
        <label style="display:flex;align-items:center;gap:8px;font-weight:400;font-size:13px;cursor:pointer">
          <input type="checkbox" id="f-notif-frn" style="width:15px;height:15px;accent-color:var(--verde-medio)" ${t && t.notificar_fornecedor ? 'checked' : ''}>
          Enviar e-mail de cobrança ao fornecedor</label>
        <div class="hint">O fornecedor recebe um aviso por e-mail; ele não acessa a plataforma.</div>
      </div>
      </div>
      <div class="fld tk-restr ${t && t.restrita ? 'on' : ''}" id="f-restr-wrap">
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;cursor:${podeRestringir ? 'pointer' : 'default'}">
          <input type="checkbox" id="f-restrita" style="width:15px;height:15px;accent-color:var(--verde-medio)" ${t && t.restrita ? 'checked' : ''} ${podeRestringir ? '' : 'disabled'}
            onchange="document.getElementById('f-restr-wrap').classList.toggle('on',this.checked)">
          🔒 Tarefa restrita</label>
        <div class="hint">Visível só para quem criou, responsáveis e observadores (e o super admin). A coordenação e os responsáveis da atividade vinculada não veem.
          Quem for incluído como observador ou responsável de subtarefa passa a ver a tarefa inteira.${podeRestringir ? '' : ' Só quem criou a tarefa pode alterar.'}</div>
      </div>
      ${t ? '<div id="tk-detalhe" style="border-top:1px solid var(--borda);margin-top:4px;padding-top:14px;color:var(--cinza-400);font-size:12px">Carregando…</div>' : ''}
    </div>
    <div class="tk-modal-f">
      ${t && podeEditar && t.status !== 'cancelada' ? `<button class="btn-danger-ghost" onclick="TK.cancelar('${t.id}')">Cancelar tarefa</button>` : ''}
      ${t && podeEditar && t.status !== 'concluida' ? `<button class="btn-ok" onclick="TK.concluir('${t.id}')">✓ Concluir</button>` : ''}
      <button class="btn-sec" onclick="fecharModal()">Fechar</button>
      ${podeEditar ? `<button class="btn-pri" onclick="TK.salvar()">${novo ? 'Criar tarefa' : 'Salvar'}</button>` : ''}
    </div>`
  }

  // ── Salvar (criar ou editar) ──────────────────────────────────────────
  async function salvar () {
    const g = id => document.getElementById(id)
    const titulo = g('f-titulo').value.trim()
    if (!titulo) { toast('Informe um título.', 'warning'); return }
    const prioBtn = document.querySelector('#f-prio .chip-t.on')
    const prioridade = prioBtn ? prioBtn.dataset.prio : 'media'
    const desc = g('f-desc').value.trim() || null
    const dt_inicio = g('f-inicio').value || null
    const dt_prazo  = g('f-prazo').value || null
    const atividade_id = g('f-atv').value || null
    const fornecedor_id = g('f-frn').value || null
    const notificar = !!(g('f-notif-frn') && g('f-notif-frn').checked && fornecedor_id)
    const responsaveis = [...document.querySelectorAll('.chk-resp:checked')].map(c => c.value)
    const observadores = [...document.querySelectorAll('.chk-obs:checked')].map(c => c.value)
    const restrita = !!(g('f-restrita') && g('f-restrita').checked)

    const btn = document.querySelector('.tk-modal-f .btn-pri'); if (btn) { btn.disabled = true; btn.textContent = 'Salvando…' }

    if (!S.editId) {
      const { data, error } = await db.rpc('fn_criar_tarefa', {
        p_titulo: titulo, p_descricao: desc, p_prioridade: prioridade,
        p_dt_inicio: dt_inicio, p_dt_prazo: dt_prazo,
        p_entidade_tipo: null, p_entidade_id: null,
        p_atividade_id: atividade_id, p_fornecedor_id: fornecedor_id,
        p_notificar_fornecedor: notificar,
        p_responsaveis: responsaveis, p_observadores: observadores,
        p_restrita: restrita,
      })
      if (error) { toast('Erro ao criar: ' + error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Criar tarefa' } return }
      toast('Tarefa criada ✓', 'success')
      chamarEmail(data, 'atribuicao')
    } else {
      const t = S.tarefas.find(x => x.id === S.editId)
      const prazoAntigo = t ? t.dt_prazo : null
      const { error } = await db.rpc('fn_editar_tarefa', {
        p_tarefa_id: S.editId, p_titulo: titulo, p_descricao: desc, p_prioridade: prioridade,
        p_dt_inicio: dt_inicio, p_entidade_tipo: null, p_entidade_id: null, p_atividade_id: atividade_id,
        p_fornecedor_id: fornecedor_id, p_notificar_fornecedor: notificar,
      })
      if (error) { toast('Erro ao salvar: ' + error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar' } return }
      if (t && !!t.restrita !== restrita) {
        const { error: eR } = await db.rpc('fn_definir_restricao_tarefa', { p_tarefa_id: S.editId, p_restrita: restrita })
        if (eR) toast('Restrição não alterada: ' + eR.message, 'error')
      }
      // Sincroniza responsáveis/observadores (diferença simples)
      const novos = await sincronizarParticipantes(S.editId, responsaveis, observadores)
      // Novos responsáveis e observadores recebem e-mail (cada um com o seu papel)
      if (novos.length) chamarEmail(S.editId, 'atribuicao', { destinatarios: novos })
      // Prazo alterado?
      if ((prazoAntigo || null) !== (dt_prazo || null)) {
        await db.rpc('fn_reagendar_tarefa', { p_tarefa_id: S.editId, p_dt_prazo: dt_prazo })
        chamarEmail(S.editId, 'prazo_alterado')
      }
      toast('Tarefa atualizada ✓', 'success')
    }
    fecharModal()
    await carregarTudo(); render()
  }

  async function sincronizarParticipantes (id, resp, obs) {
    const t = S.tarefas.find(x => x.id === id); if (!t) return []
    const atuais = t.participantes || []
    const alvo = new Map()
    resp.forEach(u => alvo.set(u, 'responsavel'))
    obs.forEach(u => { if (!alvo.has(u)) alvo.set(u, 'observador') })
    const novos = []
    // adicionar / atualizar
    for (const [uid, papel] of alvo) {
      const cur = atuais.find(p => p.usuario_id === uid)
      if (!cur || cur.papel !== papel) {
        novos.push(uid)
        await db.rpc('fn_atribuir_participante', { p_tarefa_id: id, p_usuario_id: uid, p_papel: papel })
      }
    }
    // remover os que saíram
    for (const p of atuais) if (!alvo.has(p.usuario_id)) await db.rpc('fn_remover_participante', { p_tarefa_id: id, p_usuario_id: p.usuario_id })
    return novos
  }

  async function concluir (id) {
    const t = S.tarefas.find(x => x.id === id); if (!t) return
    await mudarStatus(t, 'concluida'); fecharModal(); render()
  }
  async function cancelar (id) {
    const t = S.tarefas.find(x => x.id === id); if (!t) return
    if (!confirm('Cancelar esta tarefa? Ela sai do quadro (o histórico é preservado).')) return
    const { error } = await db.rpc('fn_mudar_status_tarefa', { p_tarefa_id: id, p_status: 'cancelada' })
    if (error) { toast(error.message, 'error'); return }
    toast('Tarefa cancelada.', 'info'); fecharModal(); await carregarTudo(); render()
  }

  // ── API pública (handlers do HTML) ────────────────────────────────────
  window.TK = {
    aba: a => { S.aba = a; render() },
    filtroResp: v => { S.fResp = v; refreshView() },
    filtroPrio: v => { S.fPrio = v; refreshView() },
    toggleAtraso: btn => { S.fAtraso = !S.fAtraso; if (btn) btn.classList.toggle('on', S.fAtraso); refreshView() },
    toggleRestrita: btn => { S.fRestrita = !S.fRestrita; if (btn) btn.classList.toggle('on', S.fRestrita); refreshView() },
    novo: () => abrirModal(null),
    abrir: id => abrirModal(S.tarefas.find(t => t.id === id)),
    salvar, concluir, cancelar,
    pickPrio: el => { el.parentElement.querySelectorAll('.chip-t').forEach(c => c.classList.remove('on')); el.classList.add('on') },
    onFrn: () => { const v = document.getElementById('f-frn').value; document.getElementById('f-frn-wrap').style.display = v ? '' : 'none' },
    // calendário
    calMes: n => { calRef = new Date(calRef.getFullYear(), calRef.getMonth() + n, 1); refreshView() },
    calHoje: () => { calRef = new Date(hoje.getFullYear(), hoje.getMonth(), 1); refreshView() },
    // detalhe
    detAba: a => { S.detAba = a; S.editChk = null; renderDetalhe() },
    lblFiles: (inp, lblId) => { const l = document.getElementById(lblId); if (l) l.textContent = lblArquivos(inp.files) || 'Anexar' },
    addChk: async () => {
      const inp = document.getElementById('ck-in'); const v = (inp.value || '').trim()
      if (!v) { toast('Descreva a subtarefa.', 'warning'); return }
      const resp = parseResp(document.getElementById('ck-resp').value)
      const dt_prazo = document.getElementById('ck-prazo').value || null
      const files = document.getElementById('ck-file').files
      const ordem = S.det.checklist.length ? Math.max(...S.det.checklist.map(c => +c.ordem || 0)) + 1 : 0
      const { data: novo, error } = await db.from('tarefa_checklist')
        .insert({ tarefa_id: S.det.id, descricao: v, ordem, criado_por: usuario.id, dt_prazo, ...resp })
        .select('id').single()
      if (error) { toast(error.message, 'error'); return }
      if (files && files.length) await enviarArquivos(files, { checklist_id: novo.id })
      if (resp.responsavel_usuario_id || resp.responsavel_fornecedor_id) {
        chamarEmail(S.det.id, 'subtarefa', { checklist_id: novo.id })
        if (resp.responsavel_fornecedor_id) {
          const f = S.fornecedores.find(x => x.id === resp.responsavel_fornecedor_id)
          toast(f && f.email ? 'Subtarefa enviada ao fornecedor por e-mail ✓' : 'Fornecedor sem e-mail cadastrado — não foi notificado.', f && f.email ? 'success' : 'warning')
        }
      }
      await refletirObservador(resp.responsavel_usuario_id)
      await carregarDetalhe(S.det.id); refreshView()
    },
    editChk: id => { S.editChk = id; renderDetalhe() },
    saveChk: async id => {
      const c = S.det.checklist.find(x => x.id === id); if (!c) return
      const descricao = (document.getElementById('ck-ed-desc').value || '').trim()
      if (!descricao) { toast('Descreva a subtarefa.', 'warning'); return }
      const resp = parseResp(document.getElementById('ck-ed-resp').value)
      const dt_prazo = document.getElementById('ck-ed-prazo').value || null
      const files = document.getElementById('ck-ed-file').files
      const { error } = await db.from('tarefa_checklist').update({ descricao, dt_prazo, ...resp }).eq('id', id)
      if (error) { toast(error.message, 'error'); return }
      const novosArq = files && files.length ? files.length - await enviarArquivos(files, { checklist_id: id }) : 0
      const mudouResp = respKey(c) !== respKey(resp)
      const temResp = resp.responsavel_usuario_id || resp.responsavel_fornecedor_id
      // reenvia ao responsável se ele mudou, se o prazo mudou ou se há arquivo novo
      if (temResp && (mudouResp || (c.dt_prazo || null) !== dt_prazo || novosArq > 0)) {
        chamarEmail(S.det.id, 'subtarefa', { checklist_id: id })
      }
      if (mudouResp) await refletirObservador(resp.responsavel_usuario_id)
      S.editChk = null
      await carregarDetalhe(S.det.id); refreshView()
    },
    toggleChk: async (id, val) => {
      await db.from('tarefa_checklist').update({ concluida: val, concluida_por: val ? usuario.id : null, concluida_em: val ? new Date().toISOString() : null }).eq('id', id)
      await carregarDetalhe(S.det.id); refreshView()
    },
    delChk: async id => {
      const temAx = S.det.anexos.some(a => a.checklist_id === id)
      if (!confirm('Remover esta subtarefa?' + (temAx ? ' Os anexos dela continuam na aba Anexos.' : ''))) return
      await db.from('tarefa_checklist').delete().eq('id', id); await carregarDetalhe(S.det.id); refreshView()
    },
    addComent: async () => {
      const inp = document.getElementById('cm-in'); let v = (inp.value || '').trim()
      const files = document.getElementById('cm-file').files
      if (!v && !(files && files.length)) return
      if (!v) v = '📎 Anexo'
      const btn = document.querySelector('.cm-add button'); if (btn) { btn.disabled = true; btn.textContent = 'Enviando…' }
      const { data: comentarioId, error } = await db.rpc('fn_comentar_tarefa', { p_tarefa_id: S.det.id, p_corpo: v })
      if (error) { toast(error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Comentar' } return }
      if (files && files.length) await enviarArquivos(files, { comentario_id: comentarioId })
      chamarEmail(S.det.id, 'comentario', { comentario_id: comentarioId })
      await carregarDetalhe(S.det.id)
    },
    uploadAnexo: async inp => {
      const f = inp.files && inp.files[0]; if (!f) return
      const st = document.getElementById('ax-status'); if (st) st.textContent = 'Enviando…'
      await enviarArquivos([f])
      await carregarDetalhe(S.det.id)
    },
    delAnexo: async (id, url) => {
      if (!confirm('Remover este anexo?')) return
      await db.from('tarefa_anexos').delete().eq('id', id)
      const rel = (url || '').split('/tarefas-anexos/')[1]
      if (rel) { try { await db.storage.from('tarefas-anexos').remove([decodeURIComponent(rel)]) } catch (e) {} }
      await carregarDetalhe(S.det.id)
    },
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  await carregarTudo()
  render()

  // Abrir tarefa direto pela URL (?tarefa=<id>) — vindo do sino/e-mail
  const alvo = new URLSearchParams(location.search).get('tarefa')
  if (alvo) { const t = S.tarefas.find(x => x.id === alvo); if (t) abrirModal(t) }
})()
