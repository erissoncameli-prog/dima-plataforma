// tarefas.js — Painel de Tarefas & Delegações · DIMA (UNESCO/SEMA-AC)
// Atores: responsável interno (usuarios) opera; fornecedor (parte externa) é
// notificado por e-mail. Escrita via RPCs SECURITY DEFINER; e-mail via
// Edge Function enviar-email-tarefa.

;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { window.location.href = '../index.html'; return }

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
    tarefas: [], usuarios: [], atividades: [], fornecedores: [],
    aba: 'kanban', fResp: '', fPrio: '', fAtraso: false, editId: null,
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
  const respsDe = t => (t.participantes || []).filter(p => p.papel === 'responsavel')
  const obsDe   = t => (t.participantes || []).filter(p => p.papel === 'observador')
  const souResponsavel = t => respsDe(t).some(p => p.usuario_id === usuario.id)

  // ── Carregar dados ────────────────────────────────────────────────────
  async function carregarTudo () {
    const [tj, uj, aj, fj] = await Promise.all([
      db.from('tarefas').select(
        'id,codigo,titulo,descricao,status,prioridade,dt_inicio,dt_prazo,dt_conclusao,' +
        'entidade_tipo,entidade_id,atividade_id,fornecedor_id,notificar_fornecedor,ordem,criado_por,criado_em,' +
        'participantes:tarefa_participantes(usuario_id,papel),' +
        'atividade:atividades(id,codigo,nome_pt),' +
        'fornecedor:fornecedores(id,nome)'
      ).eq('ativo', true).order('ordem', { ascending: true }).order('criado_em', { ascending: false }),
      db.from('usuarios').select('id,nome_completo,perfil,email').eq('ativo', true).order('nome_completo'),
      db.from('atividades').select('id,codigo,nome_pt').eq('ativo', true).order('codigo'),
      db.from('fornecedores').select('id,nome,email').eq('ativo', true).order('nome'),
    ])
    S.tarefas = tj.data || []
    S.usuarios = uj.data || []
    S.atividades = aj.data || []
    S.fornecedores = fj.data || []
  }

  // ── E-mail (Edge Function) ────────────────────────────────────────────
  async function chamarEmail (tarefa_id, evento) {
    try {
      const { data: { session } } = await db.auth.getSession()
      await fetch(SUPABASE_URL + '/functions/v1/enviar-email-tarefa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (session?.access_token || ''),
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ tarefa_id, evento }),
      })
    } catch (e) { console.error('e-mail tarefa:', e) }
  }

  // ══ RENDER ════════════════════════════════════════════════════════════
  function render () {
    const html =
      '<div class="fade-in">' +
        toolbar() +
        `<div id="tk-view">${S.aba === 'kanban' ? viewKanban() : viewMinhas()}</div>` +
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
        <button class="tk-tab ${S.aba === 'minhas' ? 'on' : ''}" onclick="TK.aba('minhas')">Minhas tarefas</button>
      </div>
      ${S.aba === 'kanban' ? `
      <select class="tk-sel" onchange="TK.filtroResp(this.value)">${optUsers}</select>
      <select class="tk-sel" onchange="TK.filtroPrio(this.value)">${optPrio}</select>
      <button class="tk-tab ${S.fAtraso ? 'on' : ''}" style="border:1px solid var(--borda)" onclick="TK.toggleAtraso()">Só atrasadas</button>
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
      <div class="ttl">${esc(t.titulo)}</div>
      <div class="meta">${prio}${atv}${frn}
        <span class="av-stack">${rs}</span>${badgePrazo(t)}</div>
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
        <span class="r-ttl"><span class="r-code">${esc(t.codigo || '')}</span> ${esc(t.titulo)}</span>
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
    t.status = novo; if (novo === 'concluida') t.dt_conclusao = new Date().toISOString()
    refreshView()
    const { error } = await db.rpc('fn_mudar_status_tarefa', { p_tarefa_id: t.id, p_status: novo })
    if (error) { t.status = antigo; refreshView(); toast('Não foi possível mover: ' + error.message, 'error'); return }
    if (novo === 'concluida') { toast('Tarefa concluída ✓', 'success'); chamarEmail(t.id, 'concluida') }
  }

  function refreshView () {
    document.getElementById('tk-view').innerHTML = S.aba === 'kanban' ? viewKanban() : viewMinhas()
    if (S.aba === 'kanban') ligarDragDrop()
  }

  // ══ MODAL ═════════════════════════════════════════════════════════════
  function abrirModal (t) {
    S.editId = t ? t.id : null
    const ov = document.getElementById('tk-overlay')
    document.getElementById('tk-modal').innerHTML = montarModal(t)
    ov.classList.add('on')
  }
  window.fecharModal = () => document.getElementById('tk-overlay').classList.remove('on')

  function montarModal (t) {
    const novo = !t
    const podeEditar = novo || podeDelegarGlobal || (t && t.criado_por === usuario.id) || (t && souResponsavel(t))
    const respIds = t ? respsDe(t).map(p => p.usuario_id) : [usuario.id]
    const obsIds  = t ? obsDe(t).map(p => p.usuario_id) : []
    const podeDelegar = podeDelegarGlobal || novo // validação real no servidor

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
      <h3>${novo ? 'Nova tarefa' : esc(t.titulo)}</h3>
      ${t ? `<span class="code">${esc(t.codigo)}</span>` : ''}
      <button class="tk-x" onclick="fecharModal()">×</button>
    </div>
    <div class="tk-modal-b" id="tk-form" ${podeEditar ? '' : 'style="pointer-events:none;opacity:.7"'}>
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

    const btn = document.querySelector('.tk-modal-f .btn-pri'); if (btn) { btn.disabled = true; btn.textContent = 'Salvando…' }

    if (!S.editId) {
      const { data, error } = await db.rpc('fn_criar_tarefa', {
        p_titulo: titulo, p_descricao: desc, p_prioridade: prioridade,
        p_dt_inicio: dt_inicio, p_dt_prazo: dt_prazo,
        p_entidade_tipo: null, p_entidade_id: null,
        p_atividade_id: atividade_id, p_fornecedor_id: fornecedor_id,
        p_notificar_fornecedor: notificar,
        p_responsaveis: responsaveis, p_observadores: observadores,
      })
      if (error) { toast('Erro ao criar: ' + error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Criar tarefa' } return }
      toast('Tarefa criada ✓', 'success')
      chamarEmail(data, 'atribuicao')
    } else {
      const t = S.tarefas.find(x => x.id === S.editId)
      const prazoAntigo = t ? t.dt_prazo : null
      const { error } = await db.rpc('fn_editar_tarefa', {
        p_tarefa_id: S.editId, p_titulo: titulo, p_descricao: desc, p_prioridade: prioridade,
        p_entidade_tipo: null, p_entidade_id: null, p_atividade_id: atividade_id,
        p_fornecedor_id: fornecedor_id, p_notificar_fornecedor: notificar,
      })
      if (error) { toast('Erro ao salvar: ' + error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar' } return }
      // Sincroniza responsáveis/observadores (diferença simples)
      await sincronizarParticipantes(S.editId, responsaveis, observadores)
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
    const t = S.tarefas.find(x => x.id === id); if (!t) return
    const atuais = t.participantes || []
    const alvo = new Map()
    resp.forEach(u => alvo.set(u, 'responsavel'))
    obs.forEach(u => { if (!alvo.has(u)) alvo.set(u, 'observador') })
    // adicionar / atualizar
    for (const [uid, papel] of alvo) {
      const cur = atuais.find(p => p.usuario_id === uid)
      if (!cur || cur.papel !== papel) await db.rpc('fn_atribuir_participante', { p_tarefa_id: id, p_usuario_id: uid, p_papel: papel })
    }
    // remover os que saíram
    for (const p of atuais) if (!alvo.has(p.usuario_id)) await db.rpc('fn_remover_participante', { p_tarefa_id: id, p_usuario_id: p.usuario_id })
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
    toggleAtraso: () => { S.fAtraso = !S.fAtraso; render() },
    novo: () => abrirModal(null),
    abrir: id => abrirModal(S.tarefas.find(t => t.id === id)),
    salvar, concluir, cancelar,
    pickPrio: el => { el.parentElement.querySelectorAll('.chip-t').forEach(c => c.classList.remove('on')); el.classList.add('on') },
    onFrn: () => { const v = document.getElementById('f-frn').value; document.getElementById('f-frn-wrap').style.display = v ? '' : 'none' },
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  await carregarTudo()
  render()

  // Abrir tarefa direto pela URL (?tarefa=<id>) — vindo do sino/e-mail
  const alvo = new URLSearchParams(location.search).get('tarefa')
  if (alvo) { const t = S.tarefas.find(x => x.id === alvo); if (t) abrirModal(t) }
})()
