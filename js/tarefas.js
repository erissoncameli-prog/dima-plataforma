// tarefas.js — Painel de Tarefas & Delegações · DIMA (UNESCO/SEMA-AC)
// Atores: responsável interno (usuarios) opera; fornecedor (parte externa) é
// notificado por e-mail. Escrita via RPCs SECURITY DEFINER; e-mail via
// Edge Function enviar-email-tarefa.

;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { localStorage.setItem('dima_redirect', window.location.href); window.location.href = '../index.html'; return }

  // ── Constantes de apresentação ────────────────────────────────────────
  // Cores dos status vêm dos tokens de css/tarefas.css (--st-*)
  const COLS = [
    { k: 'a_fazer',      nm: 'A fazer',      v: 'todo' },
    { k: 'em_andamento', nm: 'Em andamento', v: 'doing' },
    { k: 'em_revisao',   nm: 'Em revisão',   v: 'review' },
    { k: 'bloqueada',    nm: 'Bloqueada',    v: 'block' },
    { k: 'concluida',    nm: 'Concluída',    v: 'done' },
  ]
  const ST_VAR = { ...Object.fromEntries(COLS.map(c => [c.k, c.v])), cancelada: 'todo' }
  const ST_NM  = { ...Object.fromEntries(COLS.map(c => [c.k, c.nm])), cancelada: 'Cancelada' }
  const PRIOS  = [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta'], ['urgente', 'Urgente']]
  const PRIO_NM = Object.fromEntries(PRIOS)

  const podeDelegarGlobal = ['super_admin', 'coordenacao'].includes(appState.perfil)

  // ── Estado ────────────────────────────────────────────────────────────
  const S = {
    tarefas: [], usuarios: [], atividades: [], fornecedores: [], progresso: {},
    aba: 'kanban', fResp: '', fPrio: '', fTipo: '', fBusca: '', fAtraso: false, fRestrita: false, editId: null, tipos: [],
  }

  // ── Ícones (sprite SVG em pages/tarefas.html) ─────────────────────────
  const ic = (nome, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${nome}"/></svg>`
  const TIPO_IC = { reuniao: 'cal', diligencia: 'send', acao_administrativa: 'clip', analise: 'search', outras: 'pin' }
  const status = st => `<span class="status st-${ST_VAR[st] || 'todo'}">${ST_NM[st] || st}</span>`
  const prioTag = p => `<span class="tag prio prio-${p}">${ic('flag')}${PRIO_NM[p] || p}</span>`

  // Progresso: só quando a tarefa tem subtarefas
  function progressoDe (t) {
    const p = S.progresso[t.id]
    if (p && p.total > 0) return { pct: p.pct, feitas: p.feitas, total: p.total }
    return null
  }
  const barra = pct => `<span class="bar"><i style="width:${pct}%"></i></span>`

  // ── Datas ─────────────────────────────────────────────────────────────
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const parseD = s => (s ? new Date(s + 'T00:00:00') : null)
  const diasAte = s => { const d = parseD(s); return d ? Math.round((d - hoje) / 86400000) : null }
  const fmtBR = s => { const d = parseD(s); return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '').replace(' de ', ' ') : '' }

  // ── Avatares ──────────────────────────────────────────────────────────
  const AV_CORES = ['#2F6E4C', '#0E7490', '#6D4AD8', '#B45309', '#BE123C', '#0E8C80', '#4F46E5', '#C2410C']
  const iniciais = n => (n || '?').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()
  const avCor = id => AV_CORES[[...String(id || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_CORES.length]
  const avatar = u => `<span class="av" style="--ac:${avCor(u.id)}" title="${esc(u.nome_completo || '')}">${esc(iniciais(u.nome_completo))}</span>`

  const nomeUsuario = id => (S.usuarios.find(u => u.id === id) || {}).nome_completo || '—'
  const nomeFornecedor = id => (S.fornecedores.find(f => f.id === id) || {}).nome || 'Fornecedor'
  const nomeCurto = n => { const p = (n || '').split(' ').filter(Boolean); return p.length > 1 ? p[0] + ' ' + p[p.length - 1] : (n || '') }
  const respsDe = t => (t.participantes || []).filter(p => p.papel === 'responsavel')
  const obsDe   = t => (t.participantes || []).filter(p => p.papel === 'observador')
  const souResponsavel = t => respsDe(t).some(p => p.usuario_id === usuario.id)
  const pilhaAvatares = (t, n = 3) => `<span class="avs">${respsDe(t).slice(0, n)
    .map(p => avatar({ id: p.usuario_id, nome_completo: nomeUsuario(p.usuario_id) })).join('')}</span>`
  // TDRs vinculados: t.vinc_tdrs[].tdr é null quando o usuário não enxerga o TDR (RLS)
  function chipTdrs (t) {
    const v = t.vinc_tdrs || []; if (!v.length) return ''
    const vis = v.filter(x => x.tdr).map(x => x.tdr.numero)
    const txt = vis.length ? vis[0] : 'TDR'
    const tt = vis.length ? 'TDR: ' + vis.join(', ') + (vis.length < v.length ? ' + vinculado(s) de acesso restrito' : '') : 'TDR vinculado (acesso restrito)'
    return `<span class="tag" title="${esc(tt)}">${ic('doc')}<span class="mono">${esc(txt)}</span>${v.length > 1 ? ' +' + (v.length - 1) : ''}</span>`
  }
  // Tipo da tarefa (catálogo em tarefa_tipos). O emoji do catálogo segue nos
  // e-mails; na tela o tipo usa o ícone SVG do código (ou uma etiqueta).
  const TIPO_PADRAO = { codigo: 'outras', nome: 'Outras', icone: '📌', cor: '#6B7580', campos: [] }
  const tipoDe = cod => S.tipos.find(x => x.codigo === cod) || TIPO_PADRAO
  const icTipo = cod => TIPO_IC[cod] || 'tag'
  const podeGerirTipos = ['super_admin', 'coordenacao'].includes(appState.perfil)
  const iconeTipo = (t, cls = '') => { const tp = tipoDe(t.tipo || t.codigo); return `<span class="tipo-ic ${cls}" style="--tc:${tp.cor}" title="${esc(tp.nome)}">${ic(icTipo(tp.codigo))}</span>` }
  const chipTipo = cod => { const tp = tipoDe(cod); return `<span class="chip-tipo"><span class="tipo-ic" style="--tc:${tp.cor}">${ic(icTipo(tp.codigo))}</span>${esc(tp.nome)}</span>` }
  const horaReuniao = t => t.tipo === 'reuniao' && t.dados_tipo && t.dados_tipo.inicio ? String(t.dados_tipo.inicio).slice(11, 16) : ''
  const LOCK = `<span class="lock" title="Tarefa restrita: visível só para os envolvidos">${ic('lock', 's')}</span>`
  const cadeado = t => t && t.restrita ? LOCK : ''

  // ── Carregar dados ────────────────────────────────────────────────────
  async function carregarTudo () {
    const [tj, uj, aj, fj, pj, ttj] = await Promise.all([
      db.from('tarefas').select(
        'id,codigo,titulo,descricao,status,prioridade,dt_inicio,dt_prazo,dt_conclusao,' +
        'entidade_tipo,entidade_id,atividade_id,fornecedor_id,notificar_fornecedor,restrita,tipo,dados_tipo,ordem,criado_por,criado_em,atualizado_em,' +
        'participantes:tarefa_participantes(usuario_id,papel),' +
        'atividade:atividades(id,codigo,nome_pt),' +
        'vinc_tdrs:tarefa_tdrs(tdr_id,tdr:tdrs(id,numero,tipo,status,objeto_pt)),' +
        'fornecedor:fornecedores(id,nome)'
      ).eq('ativo', true).order('ordem', { ascending: true }).order('criado_em', { ascending: false }),
      db.from('usuarios').select('id,nome_completo,perfil,email').eq('ativo', true).order('nome_completo'),
      db.from('atividades').select('id,codigo,nome_pt').eq('ativo', true).order('codigo'),
      db.from('fornecedores').select('id,nome,email').eq('ativo', true).order('nome'),
      db.from('vw_tarefa_progresso').select('tarefa_id,total,feitas,pct'),
      db.from('tarefa_tipos').select('codigo,nome,icone,cor,ordem,ativo,campos').order('ordem'),
    ])
    S.tipos = ttj.data || []
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
  function resumoTopo () {
    const abertas = S.tarefas.filter(t => t.status !== 'concluida' && t.status !== 'cancelada')
    const atras = abertas.filter(t => { const d = diasAte(t.dt_prazo); return d !== null && d < 0 }).length
    const semana = abertas.filter(t => { const d = diasAte(t.dt_prazo); return d !== null && d >= 0 && d <= 7 }).length
    const pl = (n, s, p) => `${n} ${n === 1 ? s : p}`
    return `${pl(abertas.length, 'aberta', 'abertas')} · ${pl(atras, 'atrasada', 'atrasadas')} · ${pl(semana, 'vence', 'vencem')} esta semana`
  }

  function render () {
    const html =
      '<div class="tk fade-in">' +
        `<div class="tk-head"><div><h1>Tarefas</h1><div class="tk-sub" id="tk-sub">${resumoTopo()}</div></div>
          <button class="btn btn-pri" onclick="TK.novo()">${ic('plus')}Nova tarefa</button></div>` +
        toolbar() +
        `<div id="tk-view">${viewAtual()}</div>` +
      '</div>'
    document.getElementById('app').innerHTML =
      gerarLayout('Tarefas', 'tarefas') + html + '</div></div></div>'
    carregarLogosSidebar()
    if (S.aba === 'kanban') ligarDragDrop()
  }

  function toolbar () {
    const optUsers = ['<option value="">Responsável</option>']
      .concat(S.usuarios.map(u => `<option value="${u.id}" ${S.fResp === u.id ? 'selected' : ''}>${esc(u.nome_completo)}</option>`)).join('')
    const optTipo = ['<option value="">Tipo</option>']
      .concat(S.tipos.map(x => `<option value="${x.codigo}" ${S.fTipo === x.codigo ? 'selected' : ''}>${esc(x.nome)}</option>`)).join('')
    const optPrio = ['<option value="">Prioridade</option>']
      .concat(PRIOS.map(([k, v]) => `<option value="${k}" ${S.fPrio === k ? 'selected' : ''}>${v}</option>`)).join('')
    const aba = (k, icone, nm) => `<button class="${S.aba === k ? 'on' : ''}" onclick="TK.aba('${k}')">${ic(icone, 's')}${nm}</button>`
    const filtrar = S.aba === 'kanban' || S.aba === 'lista' || S.aba === 'calendario'
    return `<div class="toolbar">
      <div class="seg" role="tablist">${aba('kanban', 'board', 'Quadro')}${aba('lista', 'list', 'Lista')}${aba('calendario', 'cal', 'Calendário')}${aba('minhas', 'user', 'Minhas')}</div>
      ${filtrar ? `
      <label class="search" for="tk-busca">${ic('search', 's')}<input id="tk-busca" placeholder="Buscar por número ou título" value="${esc(S.fBusca)}" oninput="TK.busca(this.value)"></label>
      <select class="filtro ${S.fResp ? 'on' : ''}" onchange="TK.filtroResp(this.value)" aria-label="Responsável">${optUsers}</select>
      <select class="filtro ${S.fTipo ? 'on' : ''}" onchange="TK.filtroTipo(this.value)" aria-label="Tipo">${optTipo}</select>
      <select class="filtro ${S.fPrio ? 'on' : ''}" onchange="TK.filtroPrio(this.value)" aria-label="Prioridade">${optPrio}</select>
      <button class="filtro ${S.fAtraso ? 'on' : ''}" onclick="TK.toggleAtraso(this)">${ic('alert', 's')}Atrasadas</button>
      <button class="filtro ${S.fRestrita ? 'on' : ''}" onclick="TK.toggleRestrita(this)" title="Tarefas visíveis só para os envolvidos">${ic('lock', 's')}Restritas</button>` : ''}
      <span class="sp"></span>
      ${podeGerirTipos ? `<button class="btn btn-ghost btn-icon" onclick="TK.tipos()" title="Tipos de tarefa">${ic('sliders')}</button>` : ''}
    </div>`
  }

  function passaFiltro (t) {
    if (S.fResp && !respsDe(t).some(p => p.usuario_id === S.fResp)) return false
    if (S.fPrio && t.prioridade !== S.fPrio) return false
    if (S.fTipo && t.tipo !== S.fTipo) return false
    if (S.fRestrita && !t.restrita) return false
    if (S.fAtraso) { const d = diasAte(t.dt_prazo); if (!(d !== null && d < 0 && t.status !== 'concluida')) return false }
    if (S.fBusca) {
      const q = semAcento(S.fBusca).trim()
      if (q && !semAcento((t.codigo || '') + ' ' + t.titulo).includes(q)) return false
    }
    return true
  }

  // ── Kanban ────────────────────────────────────────────────────────────
  function viewKanban () {
    const ts = S.tarefas.filter(t => t.status !== 'cancelada' && passaFiltro(t))
    return '<div class="board">' + COLS.map(c => {
      const nesta = ts.filter(t => t.status === c.k)
      return `<div class="col" data-status="${c.k}">
        <div class="col-h">${status(c.k)}<span class="ct">${nesta.length}</span>
          <button class="add" onclick="TK.novo()" title="Nova tarefa">${ic('plus', 's')}</button></div>
        <div class="col-b">${nesta.map(cardKanban).join('') || '<div class="col-vazia">Arraste tarefas para cá</div>'}</div>
      </div>`
    }).join('') + '</div>'
  }

  function badgePrazo (t) {
    if (t.status === 'concluida') {
      const d = t.dt_conclusao ? t.dt_conclusao.slice(0, 10) : t.dt_prazo
      return d ? `<span class="tag ok">${ic('check')}${fmtBR(d)}</span>` : ''
    }
    const d = diasAte(t.dt_prazo)
    if (d === null) return ''
    if (d < 0) return `<span class="tag late">${ic('alert')}${-d === 1 ? '1 dia atrasada' : -d + ' dias atrasada'}</span>`
    if (d === 0) return `<span class="tag today">${ic('cal')}Hoje</span>`
    if (d === 1) return `<span class="tag">${ic('cal')}Amanhã</span>`
    return `<span class="tag">${ic('cal')}${fmtBR(t.dt_prazo)}</span>`
  }

  function cardKanban (t) {
    const hr = horaReuniao(t)
    const pr = progressoDe(t)
    const frn = t.fornecedor ? `<span class="tag" title="${esc(t.fornecedor.nome)}">${ic('build')}${esc(nomeCurto(t.fornecedor.nome))}</span>` : ''
    const atv = t.atividade ? `<span class="tag" title="${esc(t.atividade.nome_pt || '')}"><span class="mono">${esc(t.atividade.codigo)}</span></span>` : ''
    return `<article class="card${t.status === 'concluida' ? ' feito' : ''}" draggable="true" data-id="${t.id}" onclick="TK.abrir('${t.id}')">
      <div class="c-top">${iconeTipo(t)}<span class="num">${esc(t.codigo || '')}</span>${hr ? `<span class="hora">${hr}</span>` : ''}${cadeado(t)}</div>
      <h3 class="c-tit">${esc(t.titulo)}</h3>
      <div class="c-meta">${prioTag(t.prioridade)}${badgePrazo(t)}${atv}${chipTdrs(t)}${frn}</div>
      <div class="c-foot">${pilhaAvatares(t)}${pr ? `<span class="cnt">${ic('checks', 's')}${pr.feitas}/${pr.total}</span>${barra(pr.pct)}` : ''}</div>
      ${linhaCriador(t)}
    </article>`
  }

  // "Criada por" no rodapé do card: primeiro + último nome
  function linhaCriador (t) {
    if (!t.criado_por) return ''
    const nome = nomeUsuario(t.criado_por)
    const quando = t.criado_em ? new Date(t.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''
    return `<div class="criador" title="Criada por ${esc(nome)}${quando ? ' em ' + quando : ''}">por ${esc(nomeCurto(nome))}${quando ? ' · ' + quando : ''}</div>`
  }

  // ── Tabela agrupada (Lista e Minhas tarefas) ──────────────────────────
  function linhaTabela (t) {
    const pr = progressoDe(t)
    const vinc = t.atividade
      ? `<span class="mono" title="${esc(t.atividade.nome_pt || '')}">${esc(t.atividade.codigo)}</span> ${chipTdrs(t)}`
      : (t.fornecedor ? `<span class="tag">${ic('build')}${esc(nomeCurto(t.fornecedor.nome))}</span>` : '<span class="fraco">—</span>')
    return `<tr onclick="TK.abrir('${t.id}')">
      <td><div class="t-tit">${iconeTipo(t)}<span class="num">${esc(t.codigo || '')}</span><span class="t-txt">${esc(t.titulo)}</span>${cadeado(t)}</div></td>
      <td>${pilhaAvatares(t) || '<span class="fraco">—</span>'}</td>
      <td>${prioTag(t.prioridade)}</td>
      <td>${badgePrazo(t) || '<span class="fraco">—</span>'}</td>
      <td>${vinc}</td>
      <td>${pr ? `<div class="t-prog">${barra(pr.pct)}<span class="mono">${pr.feitas}/${pr.total}</span></div>` : '<span class="fraco">—</span>'}</td>
    </tr>`
  }
  function tabelaAgrupada (grupos, vazio) {
    const corpo = grupos.filter(g => g.itens.length).map(g =>
      `<tr class="grp"><td colspan="6">${g.rotulo}<span class="g-ct">${g.itens.length}</span></td></tr>${g.itens.map(linhaTabela).join('')}`).join('')
    if (!corpo) return `<div class="vazio">${ic('checks')}<p>${vazio}</p></div>`
    return `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Tarefa</th><th>Responsável</th><th>Prioridade</th><th>Prazo</th><th>Vínculo</th><th>Progresso</th></tr></thead>
      <tbody>${corpo}</tbody></table></div>`
  }
  const porPrazo = (a, b) => (a.dt_prazo || '9999').localeCompare(b.dt_prazo || '9999')

  function viewLista () {
    const ts = S.tarefas.filter(t => t.status !== 'cancelada' && passaFiltro(t)).sort(porPrazo)
    return tabelaAgrupada(COLS.map(c => ({ rotulo: status(c.k), itens: ts.filter(t => t.status === c.k) })), 'Nenhuma tarefa com esses filtros.')
  }

  function viewMinhas () {
    const minhas = S.tarefas.filter(t => souResponsavel(t) && t.status !== 'cancelada').sort(porPrazo)
    const ativas = minhas.filter(t => t.status !== 'concluida')
    const g = (rotulo, fn) => ({ rotulo: `<span class="g-nm">${rotulo}</span>`, itens: ativas.filter(fn) })
    return tabelaAgrupada([
      g('Atrasadas',   t => { const d = diasAte(t.dt_prazo); return d !== null && d < 0 }),
      g('Hoje',        t => diasAte(t.dt_prazo) === 0),
      g('Esta semana', t => { const d = diasAte(t.dt_prazo); return d !== null && d > 0 && d <= 7 }),
      g('Depois',      t => { const d = diasAte(t.dt_prazo); return d !== null && d > 7 }),
      g('Sem prazo',   t => diasAte(t.dt_prazo) === null),
      { rotulo: '<span class="g-nm">Concluídas</span>', itens: minhas.filter(t => t.status === 'concluida') },
    ], 'Nenhuma tarefa atribuída a você.')
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
      const chips = its.map(t => `<div class="cal-chip st-${ST_VAR[t.status] || 'todo'}" onclick="event.stopPropagation();TK.abrir('${t.id}')"
          title="${esc((t.codigo || '') + ' · ' + tipoDe(t.tipo).nome + ' · ' + t.titulo)}">${iconeTipo(t, 'xs')}<b class="mono">${esc(t.codigo || '')}</b>${horaReuniao(t) ? `<span class="mono">${horaReuniao(t)}</span>` : ''}<span class="cal-txt">${esc(t.titulo)}</span></div>`).join('')
      celulas += `<div class="cal-cell ${foraMes ? 'fora' : ''} ${isHoje ? 'hoje' : ''}">
        <div class="cal-dia">${d.getDate()}</div>${chips}${mais > 0 ? `<div class="cal-mais">+${mais}</div>` : ''}
      </div>`
      d.setDate(d.getDate() + 1)
    }
    return `<div class="cal">
      <div class="cal-head">
        <button class="btn btn-ghost btn-icon" onclick="TK.calMes(-1)" title="Mês anterior">${ic('left')}</button>
        <span class="cal-titulo">${nomeMes}</span>
        <button class="btn btn-ghost btn-icon" onclick="TK.calMes(1)" title="Próximo mês">${ic('right')}</button>
        <button class="btn btn-sec" onclick="TK.calHoje()">Hoje</button>
      </div>
      <div class="cal-grid cal-dow">${dows.map(w => `<div>${w}</div>`).join('')}</div>
      <div class="cal-grid">${celulas}</div></div>`
  }

  // ── Drag & drop ───────────────────────────────────────────────────────
  let dragId = null
  function ligarDragDrop () {
    document.querySelectorAll('.card').forEach(el => {
      el.addEventListener('dragstart', e => { dragId = el.dataset.id; el.classList.add('arrastando'); e.dataTransfer.effectAllowed = 'move' })
      el.addEventListener('dragend', () => { dragId = null; el.classList.remove('arrastando') })
    })
    document.querySelectorAll('.board .col').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('alvo') })
      col.addEventListener('dragleave', () => col.classList.remove('alvo'))
      col.addEventListener('drop', async e => {
        e.preventDefault(); col.classList.remove('alvo')
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
    if (novo === 'concluida') { toast('Tarefa concluída', 'success'); chamarEmail(t.id, 'concluida') }
  }

  function viewAtual () {
    if (S.aba === 'lista') return viewLista()
    if (S.aba === 'calendario') return viewCalendario()
    if (S.aba === 'minhas') return viewMinhas()
    return viewKanban()
  }

  function refreshView () {
    document.getElementById('tk-view').innerHTML = viewAtual()
    const sub = document.getElementById('tk-sub'); if (sub) sub.textContent = resumoTopo()
    if (S.aba === 'kanban') ligarDragDrop()
  }

  // ══ MODAL ═════════════════════════════════════════════════════════════
  // Tarefa existente abre em modo leitura; os campos só liberam com
  // "Editar tarefa" (S.modoEdicao). O banco registra toda alteração salva.
  function abrirModal (t, manterAba = false) {
    S.editId = t ? t.id : null
    if (!t) S.modoEdicao = true
    S.det = null; S.editChk = null
    if (!manterAba) S.detAba = 'checklist'
    S.podeEditar = !t || podeDelegarGlobal || t.criado_por === usuario.id || souResponsavel(t)
    S.form = {
      resp: t ? respsDe(t).map(p => p.usuario_id) : [usuario.id],
      obs:  t ? obsDe(t).map(p => p.usuario_id) : [],
      podeDelegar: podeDelegarGlobal || !t, // validação real no servidor
    }
    const ov = document.getElementById('tk-overlay')
    const md = document.getElementById('tk-modal')
    md.classList.toggle('estreito', !t)
    md.innerHTML = montarModal(t)
    ov.classList.add('on')
    const emForm = !t || S.modoEdicao
    if (emForm) {
      aplicarPrazoDoTipo()
      TK.onCampoTipo('formato')
      renderPessoas('resp'); renderPessoas('obs')
      const ds = document.getElementById('f-desc'); if (ds && ds.value) { ds.style.height = 'auto'; ds.style.height = ds.scrollHeight + 'px' }
    }
    if (t) {
      carregarDetalhe(t.id)
      if (emForm) {
        const v = t.vinc_tdrs || []
        return carregarTdrsAtv(t.atividade_id, v.filter(x => x.tdr).map(x => x.tdr_id), v.filter(x => !x.tdr).length)
      }
    }
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
    comentario: 'comentou', edicao: 'editou a tarefa ·', anexo: 'anexou',
    subtarefa_resp: 'atribuiu a subtarefa', comentario_fornecedor: 'resposta por e-mail de',
    restricao: 'alterou a visibilidade',
    tdr_vinculo: 'vinculou o TDR', tdr_desvinculo: 'desvinculou o TDR',
    tipo: 'mudou o tipo', remocao: 'removeu', anexo_removido: 'removeu o anexo',
    subtarefa_criada: 'criou a subtarefa', subtarefa_editada: 'editou a subtarefa', subtarefa_concluida: 'concluiu a subtarefa',
    subtarefa_reaberta: 'reabriu a subtarefa', subtarefa_excluida: 'excluiu a subtarefa',
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
      return `<span class="pill">${avatar({ id: c.responsavel_usuario_id, nome_completo: nm })}${esc(primeiroNome(nm))}</span>`
    }
    if (c.responsavel_fornecedor_id) {
      const nm = nomeFornecedor(c.responsavel_fornecedor_id)
      return `<span class="tag" title="${esc(nm)} — recebe e responde por e-mail">${ic('build')}${esc(nm.length > 24 ? nm.slice(0, 24) + '…' : nm)}</span>`
    }
    return ''
  }
  function badgePrazoChk (c) {
    if (!c.dt_prazo) return ''
    if (c.concluida) return `<span class="tag">${ic('cal')}${fmtBR(c.dt_prazo)}</span>`
    const d = diasAte(c.dt_prazo)
    if (d < 0) return `<span class="tag late">${ic('alert')}${fmtBR(c.dt_prazo)}</span>`
    if (d === 0) return `<span class="tag today">${ic('cal')}Hoje</span>`
    return `<span class="tag">${ic('cal')}${fmtBR(c.dt_prazo)}</span>`
  }
  const chipsAnexos = lista => lista.map(a =>
    `<a href="#" class="tag anexo" data-arquivo="${esc(a.arquivo_url)}" title="${esc(a.arquivo_nome)}">${ic('attach')}<span class="anexo-nm">${esc(a.arquivo_nome)}</span></a>`).join('')
  const lblArquivos = files => !files || !files.length ? '' : files.length === 1 ? files[0].name : `${files.length} arquivos`
  const botaoArquivo = (id, lblId, rotulo = 'Anexar') => `<label class="btn btn-ghost btn-sm arq" title="Anexar arquivo(s)">${ic('attach', 's')}<span id="${lblId}">${rotulo}</span>
      <input type="file" id="${id}" multiple hidden onchange="TK.lblFiles(this,'${lblId}')"></label>`

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
  // Recarrega a tarefa e marca o observador no formulário aberto, senão um
  // "Salvar" em seguida removeria o observador recém-incluído.
  async function refletirObservador (uid) {
    if (!uid) return
    await carregarTudo()
    if (S.form && !S.form.resp.includes(uid) && !S.form.obs.includes(uid)) { S.form.obs.push(uid); renderPessoas('obs') }
  }

  function itemChecklist (c, d) {
    const axs = d.anexos.filter(a => a.checklist_id === c.id)
    if (S.editChk === c.id) {
      return `<div class="sub editando">
        <div class="sub-form">
          <input type="text" class="inp" id="ck-ed-desc" value="${esc(c.descricao)}">
          <div class="sub-linha">
            <select class="inp" id="ck-ed-resp">${optRespChk(respKey(c))}</select>
            <input type="date" class="inp" id="ck-ed-prazo" value="${c.dt_prazo || ''}">
          </div>
          ${axs.length ? `<div class="pills">${axs.map(a => `<span class="pill-x">${chipsAnexos([a])}
            <button class="x" onclick="TK.delAnexo('${a.id}','${esc(a.arquivo_url)}')" title="Remover anexo">${ic('x', 's')}</button></span>`).join('')}</div>` : ''}
          <div class="sub-linha">
            ${botaoArquivo('ck-ed-file', 'ck-ed-file-lbl')}
            <span class="sp"></span>
            <button class="btn btn-sec btn-sm" onclick="TK.editChk(null)">Cancelar</button>
            <button class="btn btn-pri btn-sm" onclick="TK.saveChk('${c.id}')">Salvar</button>
          </div>
        </div>
      </div>`
    }
    const meta = [chipResp(c), badgePrazoChk(c), chipsAnexos(axs)].filter(Boolean).join('')
    return `<div class="sub">
      <input type="checkbox" class="ck" ${c.concluida ? 'checked' : ''} ${podeMexerSub() ? '' : 'disabled'} onchange="TK.toggleChk('${c.id}',this.checked)" aria-label="Concluir subtarefa">
      <div class="sub-main">
        <span class="sub-t ${c.concluida ? 'feito' : ''}">${esc(c.descricao)}</span>
        ${meta ? `<div class="sub-meta">${meta}</div>` : ''}
      </div>
      ${podeMexerSub() ? `<span class="sub-acoes"><button class="x" onclick="TK.editChk('${c.id}')" title="Editar">${ic('pencil', 's')}</button>
      <button class="x" onclick="TK.delChk('${c.id}')" title="Remover">${ic('x', 's')}</button></span>` : ''}
    </div>`
  }

  function renderDetalhe () {
    const el = document.getElementById('tk-detalhe'); if (!el || !S.det) return
    const d = S.det
    const feitas = d.checklist.filter(c => c.concluida).length
    const n = v => `<span class="n">${v}</span>`
    const tabs = [
      ['checklist', 'checks', 'Subtarefas', d.checklist.length ? n(`${feitas}/${d.checklist.length}`) : ''],
      ['coment', 'msg', 'Comentários', d.coment.length ? n(d.coment.length) : ''],
      ['anexos', 'attach', 'Anexos', d.anexos.length ? n(d.anexos.length) : ''],
      ['hist', 'hist', 'Histórico', ''],
    ]
    let corpo = ''
    if (S.detAba === 'checklist') {
      const pct = d.checklist.length ? Math.round(feitas / d.checklist.length * 100) : 0
      const itens = d.checklist.map(c => itemChecklist(c, d)).join('')
      corpo = `${d.checklist.length ? `<div class="prog">${barra(pct)}<span class="mono">${pct}%</span></div>` : ''}
        <div>${itens || `<div class="vazio pq">${ic('checks')}<p>Sem subtarefas.</p></div>`}</div>
        ${S.podeEditar && !S.modoEdicao ? `<p class="dica">Para adicionar, alterar ou concluir subtarefas, clique em <b>Editar</b> no topo.</p>` : ''}
        ${podeMexerSub() ? `<div class="sub-nova">
          <input type="text" class="inp" id="ck-in" placeholder="Nova subtarefa" onkeydown="if(event.key==='Enter')TK.addChk()">
          <div class="sub-linha">
            <select class="inp" id="ck-resp" title="Responsável (usuário ou fornecedor)">${optRespChk('')}</select>
            <input type="date" class="inp" id="ck-prazo" title="Data de entrega">
            ${botaoArquivo('ck-file', 'ck-file-lbl')}
            <button class="btn btn-pri btn-sm" onclick="TK.addChk()">${ic('plus', 's')}Adicionar</button>
          </div>
          <p class="dica">Usuário responsável passa a acompanhar a tarefa como observador. Fornecedor recebe a subtarefa com os anexos por e-mail e responde por e-mail.</p>
        </div>` : ''}`
    } else if (S.detAba === 'coment') {
      const lista = d.coment.map(c => {
        const frn = !!c.autor_fornecedor_id
        const nome = frn ? nomeFornecedor(c.autor_fornecedor_id) : nomeUsuario(c.autor_id)
        const av = frn ? `<span class="av av-frn">${ic('build', 's')}</span>` : avatar({ id: c.autor_id, nome_completo: nome })
        const sub = c.checklist_id ? d.checklist.find(x => x.id === c.checklist_id) : null
        const axs = d.anexos.filter(a => a.comentario_id === c.id)
        return `<div class="cm">
          ${av}
          <div class="cm-c"><div class="cm-h"><b>${esc(nome)}</b><span>${fmtDT(c.criado_em)}</span>
            ${c.origem === 'email' ? `<span class="tag mini">${ic('mail')}via e-mail</span>` : ''}
            ${sub ? `<span class="tag mini">${ic('checks')}${esc(sub.descricao.length > 30 ? sub.descricao.slice(0, 30) + '…' : sub.descricao)}</span>` : ''}</div>
            <div class="cm-b">${esc(c.corpo)}</div>
            ${axs.length ? `<div class="pills">${chipsAnexos(axs)}</div>` : ''}</div>
        </div>`
      }).join('')
      corpo = `<div class="cms">${lista || `<div class="vazio pq">${ic('msg')}<p>Nenhum comentário ainda.</p></div>`}</div>
        <div class="cm-nova"><textarea class="inp" id="cm-in" rows="2" placeholder="Escreva um comentário"></textarea>
          <div class="sub-linha">${botaoArquivo('cm-file', 'cm-file-lbl')}<span class="sp"></span>
            <button class="btn btn-pri btn-sm" onclick="TK.addComent()">Comentar</button></div></div>`
    } else if (S.detAba === 'anexos') {
      const lista = d.anexos.map(a => {
        let origem = ''
        const cm = a.comentario_id ? d.coment.find(c => c.id === a.comentario_id) : null
        const sub = a.checklist_id ? d.checklist.find(c => c.id === a.checklist_id) : null
        if (cm) {
          const nome = cm.autor_fornecedor_id ? nomeFornecedor(cm.autor_fornecedor_id) : nomeUsuario(cm.autor_id)
          origem = `${cm.origem === 'email' ? 'E-mail' : 'Comentário'} de ${esc(nome)} · ${fmtDT(cm.criado_em)}`
        }
        if (sub) origem += `${origem ? ' · ' : ''}Subtarefa: ${esc(sub.descricao)}`
        return `<div class="ax">
          <span class="ax-ic">${ic('doc')}</span>
          <div class="ax-c"><a href="#" data-arquivo="${esc(a.arquivo_url)}">${esc(a.arquivo_nome)}</a>
            ${origem ? `<div class="ax-orig">${origem}</div>` : ''}</div>
          ${S.podeEditar ? `<button class="x" onclick="TK.delAnexo('${a.id}','${esc(a.arquivo_url)}')" title="Remover">${ic('x', 's')}</button>` : ''}
        </div>`
      }).join('')
      corpo = `<div class="axs">${lista || `<div class="vazio pq">${ic('attach')}<p>Nenhum anexo.</p></div>`}</div>
        ${S.podeEditar ? `<label class="btn btn-sec btn-sm arq">${ic('plus', 's')}Anexar arquivo<input type="file" id="ax-in" hidden onchange="TK.uploadAnexo(this)"></label>
        <span id="ax-status" class="dica"></span>` : ''}`
    } else {
      corpo = `<div class="hists">${d.hist.map((h, i) => {
        const det = Array.isArray(h.detalhes) && h.detalhes.length ? h.detalhes : null
        const resumo = det
          ? `<a href="#" class="hist-mais" onclick="event.preventDefault();TK.histToggle(${i})">${esc(h.para || '')}${ic('chev', 's')}</a>`
          : (h.de || h.para ? `<span class="hist-dp">${h.de ? esc(h.de) + ' → ' : ''}${esc(h.para || '')}</span>` : '')
        const lista = det ? `<div class="hist-det" id="hist-det-${i}" hidden>${det.map(x => x.longo
          ? `<div class="hd-i"><b>${esc(x.campo)}</b><div class="hd-long"><span>Antes</span>${esc(x.de || '—')}</div><div class="hd-long"><span>Depois</span>${esc(x.para || '—')}</div></div>`
          : `<div class="hd-i"><b>${esc(x.campo)}:</b> <s>${esc(x.de || '—')}</s> → ${esc(x.para || '—')}</div>`).join('')}</div>` : ''
        return `<div class="hist"><span class="dot${i === 0 ? ' on' : ''}"></span>
          <div class="hist-c"><b>${h.autor_id ? esc(nomeUsuario(h.autor_id)) : 'Fornecedor'}</b> ${HIST_TXT[h.tipo] || h.tipo} ${resumo}
          ${h.motivo ? `<div class="hist-motivo">Motivo: ${esc(h.motivo)}</div>` : ''}
          ${lista}
          <div class="quando">${fmtDT(h.criado_em)}</div></div></div>`
      }).join('') || `<div class="vazio pq">${ic('hist')}<p>Sem histórico.</p></div>`}</div>`
    }
    el.innerHTML = `<div class="tabs">${tabs.map(([k, icone, nm, cont]) =>
      `<button class="${S.detAba === k ? 'on' : ''}" onclick="TK.detAba('${k}')">${ic(icone, 's')}${nm}${cont}</button>`).join('')}</div>
      <div class="det-corpo">${corpo}</div>`
  }
  window.fecharModal = () => {
    if (S.modoEdicao && S.editId && !confirm('Descartar as alterações não salvas?')) return
    S.modoEdicao = false
    document.getElementById('tk-overlay').classList.remove('on')
  }
  // subtarefas só mudam em modo edição
  const podeMexerSub = () => S.podeEditar && S.modoEdicao

  // ── Seletor de atividade (busca + nome completo) ──────────────────────
  // O <select> nativo não mostra o nome ao passar o mouse e as atividades têm
  // nomes de até ~420 caracteres; por isso um seletor próprio com busca.
  const semAcento = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const PK = { itens: [], hl: 0 }
  const rotuloAtv = a => a
    ? `<b class="pk-cod">${esc(a.codigo)}</b><span class="pk-nome">${esc(a.nome_pt || '')}</span>`
    : '<span class="pk-ph">Nenhuma</span>'
  function pickerAtividade (selId) {
    const a = S.atividades.find(x => x.id === selId)
    return `<div class="pk" id="pk-atv">
      <input type="hidden" id="f-atv" value="${selId || ''}">
      <button type="button" class="pk-btn" id="pk-atv-btn" onclick="TK.pkAbrir()" title="${a ? esc(a.codigo + ' · ' + (a.nome_pt || '')) : ''}">${rotuloAtv(a)}${ic('chev', 's pk-seta')}</button>
      <div class="pk-pop" id="pk-atv-pop" hidden>
        <input type="text" class="pk-busca" id="pk-atv-busca" placeholder="Buscar por código ou nome" autocomplete="off"
          oninput="TK.pkFiltrar(this.value)" onkeydown="TK.pkTecla(event)">
        <div class="pk-lista" id="pk-atv-lista"></div>
      </div>
    </div>`
  }
  function pkRender () {
    const sel = document.getElementById('f-atv').value
    const el = document.getElementById('pk-atv-lista'); if (!el) return
    el.innerHTML = PK.itens.map((a, i) => a
      ? `<div class="pk-it ${a.id === sel ? 'sel' : ''} ${i === PK.hl ? 'hl' : ''}" title="${esc(a.codigo + ' · ' + (a.nome_pt || ''))}"
          onmousedown="event.preventDefault();TK.pkEscolher('${a.id}')" onmouseenter="TK.pkHl(${i})">
          <b class="pk-cod">${esc(a.codigo)}</b><span>${esc(a.nome_pt || '')}</span></div>`
      : `<div class="pk-it ${!sel ? 'sel' : ''} ${i === PK.hl ? 'hl' : ''}" onmousedown="event.preventDefault();TK.pkEscolher('')" onmouseenter="TK.pkHl(${i})">
          <span class="pk-ph">Nenhuma</span></div>`).join('')
      || '<div class="pk-vazio">Nenhuma atividade encontrada</div>'
    const hl = el.querySelector('.pk-it.hl'); if (hl) hl.scrollIntoView({ block: 'nearest' })
  }
  function pkFechar () { const p = document.getElementById('pk-atv-pop'); if (p) p.hidden = true }
  document.addEventListener('mousedown', e => {
    const pk = document.getElementById('pk-atv')
    if (pk && !pk.contains(e.target)) pkFechar()
  })

  // ── TDRs vinculados (aparece ao escolher a atividade) ─────────────────
  const TDR_ST = {
    rascunho: 'Rascunho', revisao_interna: 'Revisão interna', ajustes: 'Ajustes', enviado_unesco: 'Enviado à UNESCO',
    retorno_unesco: 'Retorno UNESCO', aprovado: 'Aprovado', cancelado: 'Cancelado', submetido: 'Submetido',
    pendente_correcao: 'Pendente de correção', em_avaliacao: 'Em avaliação', em_revisao_unesco: 'Em revisão UNESCO',
    em_licitacao: 'Em licitação', contratado: 'Contratado',
  }
  // selecionados: ids de TDR marcados; ocultos: quantos vínculos o usuário não
  // enxerga (viram etiqueta "acesso restrito" e nunca são desvinculados por ele)
  async function carregarTdrsAtv (atvId, selecionados = [], ocultos = 0) {
    const wrap = document.getElementById('f-tdr-wrap'), el = document.getElementById('f-tdr-lista')
    if (!wrap || !el) return
    S.tdrsAtv = []; S.tdrOcultos = ocultos
    if (!atvId) { wrap.style.display = 'none'; el.innerHTML = ''; return }
    wrap.style.display = ''
    el.hidden = true
    const chips = document.getElementById('f-tdr-chips'); if (chips) chips.innerHTML = '<span class="fraco">Carregando…</span>'
    const { data } = await db.from('tdrs').select('id,numero,tipo,status,objeto_pt')
      .eq('atividade_id', atvId).order('numero')
    if (document.getElementById('f-atv').value !== atvId) return // trocou de atividade no meio
    const lista = (data || []).filter(d => d.status !== 'cancelado' || selecionados.includes(d.id))
    S.tdrsAtv = lista
    const linhas = lista.map(d => `<label class="tdr-it">
        <input type="checkbox" class="chk-tdr" value="${d.id}" ${selecionados.includes(d.id) ? 'checked' : ''} onchange="TK.tdrMudou()">
        <div class="tdr-txt"><div><b>${esc(d.numero)}</b> · ${esc(d.tipo || '')} · <span class="tdr-st">${esc(TDR_ST[d.status] || d.status)}</span>
          <a class="tdr-abrir" href="tdrs.html?abrir=${d.id}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Abrir TDR${ic('ext', 's')}</a></div>
          ${d.objeto_pt ? `<div class="tdr-obj" title="${esc(d.objeto_pt)}">${esc(d.objeto_pt)}</div>` : ''}</div>
      </label>`).join('')
    el.innerHTML = linhas || '<div class="pk-vazio">Nenhum TDR disponível para esta atividade</div>'
    renderTdrChips()
    if (S.abrirTdrAoCarregar) { S.abrirTdrAoCarregar = false; if (lista.length) TK.tdrPainel(true) }
  }

  // ── Tipo da tarefa: seletor + campos próprios ─────────────────────────
  // Os campos vêm de tarefa_tipos.campos; o banco valida os obrigatórios.
  // Campo com define_prazo (início da reunião, prazo de resposta da
  // diligência) passa a definir o Prazo da tarefa.
  function tiposSelecionaveis (atual) {
    return S.tipos.filter(x => x.ativo || x.codigo === atual)
  }
  function seletorTipo (atual) {
    return `<input type="hidden" id="f-tipo" value="${esc(atual)}">
      <div class="tipo-grid" id="f-tipo-grid">${tiposSelecionaveis(atual).map(x =>
        `<button type="button" class="tipo-op ${x.codigo === atual ? 'on' : ''}" data-tipo="${x.codigo}" style="--tc:${x.cor}" onclick="TK.pickTipo('${x.codigo}')">
          <span class="tipo-ic" style="--tc:${x.cor}">${ic(icTipo(x.codigo))}</span><span>${esc(x.nome)}</span></button>`).join('')}</div>`
  }
  function campoTipoHtml (c, v) {
    const id = 'ft-' + c.chave
    const req = c.obrigatorio ? ' *' : ''
    const dica = c.dica ? `<div class="hint">${esc(c.dica)}</div>` : ''
    const val = v === undefined || v === null ? '' : v
    const onPrazo = c.define_prazo ? ' onchange="TK.syncPrazoTipo()"' : ''
    if (c.tipo === 'boolean') {
      return `<div class="fld tipo-bool"><label class="inline-ck">
        <input type="checkbox" class="sw" id="${id}" ${val === true || val === 'true' ? 'checked' : ''}
          onchange="TK.onCampoTipo('${c.chave}')"> ${esc(c.rotulo)}</label>${dica}</div>`
    }
    let input
    if (c.tipo === 'textarea') input = `<textarea id="${id}" rows="3">${esc(val)}</textarea>`
    else if (c.tipo === 'select') input = `<select id="${id}" onchange="TK.onCampoTipo('${c.chave}')"><option value="">Selecione</option>${
      (c.opcoes || []).map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    else {
      const tp = c.tipo === 'datetime' ? 'datetime-local' : c.tipo === 'date' ? 'date' : c.tipo === 'url' ? 'url' : 'text'
      input = `<input type="${tp}" id="${id}" value="${esc(val)}"${onPrazo}${tp === 'url' ? ' placeholder="https://…"' : ''}>`
    }
    const largo = c.tipo === 'textarea' || c.tipo === 'url' ? ' full' : ''
    return `<div class="fld${largo}" data-campo="${c.chave}"><label>${esc(c.rotulo)}${req}</label>${input}${dica}</div>`
  }
  function blocoTipo (cod, dados) {
    const tp = tipoDe(cod)
    const campos = tp.campos || []
    if (!campos.length) return ''
    const titulo = cod === 'reuniao' ? 'Dados da reunião' : cod === 'diligencia' ? 'Dados da diligência' : 'Dados de ' + tp.nome.toLowerCase()
    return `<div class="tipo-bloco" style="--tc:${tp.cor}">
      <div class="tipo-bloco-h"><span class="tipo-ic xs" style="--tc:${tp.cor}">${ic(icTipo(cod))}</span>${esc(titulo)}${cod === 'reuniao' ? ` <span class="info" title="Os envolvidos recebem um convite de agenda (.ics) por e-mail; mudanças de data, local ou link atualizam o convite e o cancelamento da tarefa cancela o evento.">${ic('info', 's')}</span>` : ''}</div>
      <div class="tipo-campos">${campos.map(c => campoTipoHtml(c, (dados || {})[c.chave])).join('')}</div>
    </div>`
  }
  // lê os campos do tipo no formulário
  function coletarDadosTipo (cod) {
    const dados = {}
    for (const c of (tipoDe(cod).campos || [])) {
      const el = document.getElementById('ft-' + c.chave); if (!el) continue
      if (c.tipo === 'boolean') dados[c.chave] = el.checked
      else { const v = (el.value || '').trim(); if (v) dados[c.chave] = v }
    }
    return dados
  }
  // validações que dependem do tipo (o banco repete as de obrigatoriedade)
  function validarTipo (cod, d) {
    for (const c of (tipoDe(cod).campos || [])) {
      if (c.obrigatorio && (d[c.chave] === undefined || d[c.chave] === '')) return `Preencha "${c.rotulo}".`
    }
    if (cod === 'reuniao') {
      if (d.fim && d.fim <= d.inicio) return 'O término da reunião precisa ser depois do início.'
      if ((d.formato === 'Presencial' || d.formato === 'Híbrida') && !d.local) return 'Informe o local da reunião presencial.'
      if ((d.formato === 'Online' || d.formato === 'Híbrida') && !d.link) return 'Informe o link da reunião online.'
      if (d.link && !/^https?:\/\//i.test(d.link)) return 'O link precisa começar com http:// ou https://'
    }
    if (cod === 'diligencia' && d.respondida && !d.dt_resposta) return 'Informe a data da resposta da diligência.'
    return ''
  }
  function campoPrazoDoTipo (cod) { return (tipoDe(cod).campos || []).find(c => c.define_prazo) }
  function aplicarPrazoDoTipo () {
    const ft = document.getElementById('f-tipo'); if (!ft) return
    const cod = ft.value
    const c = campoPrazoDoTipo(cod)
    const prazo = document.getElementById('f-prazo'), hint = document.getElementById('f-prazo-hint')
    if (!prazo) return
    prazo.readOnly = !!c
    prazo.classList.toggle('ro', !!c)
    if (hint) hint.textContent = c ? `= ${c.rotulo.toLowerCase()}` : ''
    if (c) { const el = document.getElementById('ft-' + c.chave); if (el && el.value) prazo.value = el.value.slice(0, 10) }
  }

  // ── Pessoas (responsáveis / observadores) como campo de adição ────────
  // Estado do formulário em S.form.resp / S.form.obs; o salvar lê daqui.
  function campoPessoas (papel, rotulo, bloqueado) {
    return `<div class="fld"><label>${rotulo}</label>
      <div class="pp" id="pp-${papel}">
        <div class="pp-chips" id="pp-${papel}-chips"></div>
        ${bloqueado ? '' : `<button type="button" class="pp-add" onclick="TK.ppAbrir('${papel}')">${ic('plus', 's')}Adicionar</button>
        <div class="pk-pop pp-pop" id="pp-${papel}-pop" hidden>
          <input type="text" class="pk-busca" id="pp-${papel}-busca" placeholder="Buscar pessoa" autocomplete="off"
            oninput="TK.ppFiltrar('${papel}',this.value)" onkeydown="TK.ppTecla(event,'${papel}')">
          <div class="pk-lista" id="pp-${papel}-lista"></div>
        </div>`}
      </div></div>`
  }
  function renderPessoas (papel) {
    const el = document.getElementById(`pp-${papel}-chips`); if (!el) return
    const ids = S.form[papel]
    const fixo = papel === 'resp' && !S.form.podeDelegar
    el.innerHTML = ids.map(id => {
      const nm = nomeUsuario(id)
      return `<span class="pill">${avatar({ id, nome_completo: nm })}<span>${esc(nm)}</span>${
        fixo ? '' : `<button type="button" class="x" onclick="TK.ppRemover('${papel}','${id}')" title="Remover">${ic('x', 's')}</button>`}</span>`
    }).join('') || `<span class="fraco">${papel === 'resp' ? 'Ninguém' : 'Nenhum'}</span>`
  }
  const PP = { itens: [], hl: 0 }
  function ppRender (papel) {
    const el = document.getElementById(`pp-${papel}-lista`); if (!el) return
    el.innerHTML = PP.itens.map((u, i) => `<div class="pk-it ${i === PP.hl ? 'hl' : ''}"
        onmousedown="event.preventDefault();TK.ppAdicionar('${papel}','${u.id}')" onmouseenter="TK.ppHl('${papel}',${i})">
        ${avatar(u)}<span>${esc(u.nome_completo)} <small class="fraco">${esc(u.perfil || '')}</small></span></div>`).join('')
      || '<div class="pk-vazio">Ninguém encontrado</div>'
  }
  function ppFecharTodos () { document.querySelectorAll('.pp-pop').forEach(p => { p.hidden = true }) }
  document.addEventListener('mousedown', e => { if (!e.target.closest('.pp')) ppFecharTodos() })

  // ── TDRs: só os vinculados à vista; a lista abre com "Vincular TDR" ─
  function renderTdrChips () {
    const el = document.getElementById('f-tdr-chips'); if (!el) return
    const marcados = [...document.querySelectorAll('.chk-tdr:checked')].map(c => (S.tdrsAtv || []).find(d => d.id === c.value)).filter(Boolean)
    const oc = S.tdrOcultos || 0
    el.innerHTML = marcados.map(d => `<span class="pill doc" title="${esc(d.objeto_pt || '')}">${ic('doc', 's')}<b>${esc(d.numero)}</b>${esc(TDR_ST[d.status] || d.status)}
        <button type="button" class="x" onclick="TK.tdrDesmarcar('${d.id}')" title="Desvincular">${ic('x', 's')}</button></span>`).join('') +
      (oc ? `<span class="pill doc">${ic('lock', 's')}${oc > 1 ? oc + ' TDRs' : 'TDR'} (acesso restrito)</span>` : '') ||
      `<span class="fraco">${(S.tdrsAtv || []).length ? 'Nenhum vinculado' : 'Nenhum TDR nesta atividade'}</span>`
    const btn = document.getElementById('f-tdr-btn')
    if (btn) btn.style.display = (S.tdrsAtv || []).length ? '' : 'none'
  }

  // ── Ficha (modo leitura) — clique numa informação entra em edição nela ─
  const fmtDataHoraBR = v => { if (!v) return ''; const [d, h] = String(v).split('T'); const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}${h ? ' ' + h.slice(0, 5) : ''}` }
  function fichaHtml (t) {
    const ed = S.podeEditar
    const vazio = ed ? '<span class="fraco">Adicionar</span>' : ''
    // linha de lista agrupada; sem valor, só aparece para quem pode editar
    const R = (campo, rotulo, valor, alto) => {
      if (!valor && !ed) return ''
      return `<div class="row${ed ? ' ed' : ''}${alto ? ' alto' : ''}"${ed ? ` onclick="TK.editarCampo('${campo}')" title="Clique para editar"` : ''}>
        <span class="k">${rotulo}</span><span class="v">${valor || vazio}</span>${ed ? ic('right', 's chev') : ''}</div>`
    }
    const grupo = (titulo, linhas) => linhas.trim() ? `<div class="grupo"><h4>${titulo}</h4><div class="lista">${linhas}</div></div>` : ''
    const tp = tipoDe(t.tipo), d = t.dados_tipo || {}
    const pessoas = ids => ids.length ? `<span class="pills">${ids.map(id => `<span class="pill">${avatar({ id, nome_completo: nomeUsuario(id) })}${esc(nomeUsuario(id))}</span>`).join('')}</span>` : ''
    const dprazo = diasAte(t.dt_prazo)
    const prazoTxt = t.dt_prazo ? `<span class="mono">${fmtDataHoraBR(t.dt_prazo)}</span>${t.status !== 'concluida' && dprazo !== null
      ? (dprazo < 0 ? ` <span class="tag late">${ic('alert')}${-dprazo} dia${dprazo < -1 ? 's' : ''} de atraso</span>` : dprazo === 0 ? ` <span class="tag today">Hoje</span>` : ` <small>em ${dprazo} dia${dprazo > 1 ? 's' : ''}</small>`) : ''}` : ''
    // campos do tipo
    let tipoLinhas = ''
    if (t.tipo === 'reuniao' && d.inicio) {
      const quando = fmtDataHoraBR(d.inicio) + (d.fim ? '–' + (d.fim.slice(0, 10) === d.inicio.slice(0, 10) ? d.fim.slice(11, 16) : fmtDataHoraBR(d.fim)) : '')
      tipoLinhas += R('ft-inicio', 'Quando', `<span class="mono">${esc(quando)}</span>`)
      tipoLinhas += R('ft-formato', 'Formato', `${esc(d.formato || '')}${d.local ? ' · ' + esc(d.local) : ''}${
        d.link ? ` · <a class="link" href="${esc(d.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Abrir link${ic('ext', 's')}</a>` : ''}`)
      tipoLinhas += R('ft-pauta', 'Pauta', d.pauta ? `<div class="txt">${esc(d.pauta)}</div>` : '', true)
    } else {
      for (const c of (tp.campos || [])) {
        const v = d[c.chave]; if (v === undefined || v === null || v === '') continue
        const txt = c.tipo === 'boolean' ? (v === true || v === 'true' ? 'Sim' : 'Não')
          : c.tipo === 'date' || c.tipo === 'datetime' ? `<span class="mono">${fmtDataHoraBR(v)}</span>`
          : c.tipo === 'url' ? `<a class="link" href="${esc(v)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(v)}</a>`
          : c.tipo === 'textarea' ? `<div class="txt">${esc(v)}</div>` : esc(v)
        tipoLinhas += R('ft-' + c.chave, esc(c.rotulo), txt, c.tipo === 'textarea')
      }
    }
    const tdrs = (t.vinc_tdrs || []).map(x => x.tdr
      ? `<a class="pill doc" href="tdrs.html?abrir=${x.tdr.id}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${esc(x.tdr.objeto_pt || '')}">${ic('doc', 's')}<b>${esc(x.tdr.numero)}</b>${esc(TDR_ST[x.tdr.status] || x.tdr.status)}</a>`
      : `<span class="pill doc">${ic('lock', 's')}Acesso restrito</span>`).join('')
    const obs = obsDe(t).map(p => p.usuario_id), resp = respsDe(t).map(p => p.usuario_id)
    const criado = t.criado_em ? new Date(t.criado_em).toLocaleDateString('pt-BR') : ''
    return `<div class="ficha">
      ${grupo('Resumo',
        R('f-prio', 'Prioridade', prioTag(t.prioridade)) +
        R('f-prazo', 'Prazo', prazoTxt) +
        (t.dt_inicio ? R('f-inicio', 'Início', `<span class="mono">${fmtDataHoraBR(t.dt_inicio)}</span>`) : '') +
        R('f-restrita', 'Restrita', `<small>${t.restrita ? 'Só envolvidos e super admin' : 'Visível pelas regras normais'}</small><span class="switch${t.restrita ? '' : ' off'}"></span>`))}
      ${tipoLinhas ? grupo(esc(t.tipo === 'reuniao' ? 'Reunião' : tp.nome), tipoLinhas) : ''}
      ${grupo('Vínculos',
        R('atividade', 'Atividade', t.atividade ? `<span class="mono cod">${esc(t.atividade.codigo)}</span> ${esc(t.atividade.nome_pt || '')}` : '', true) +
        (t.atividade || tdrs ? R('tdr', 'TDRs', tdrs ? `<span class="pills">${tdrs}</span>` : '') : '') +
        R('f-frn', 'Fornecedor', t.fornecedor ? `${esc(t.fornecedor.nome)}${t.notificar_fornecedor ? ' <small>· recebe e-mail</small>' : ''}` : ''))}
      ${grupo('Pessoas', R('resp', 'Responsáveis', pessoas(resp)) + R('obs', 'Observadores', pessoas(obs)))}
      ${grupo('Descrição', R('f-desc', 'Texto', t.descricao ? `<div class="txt">${esc(t.descricao)}</div>` : '', true))}
      <div class="rodape">Criada por ${esc(nomeUsuario(t.criado_por))}${criado ? ' em ' + criado : ''}</div>
    </div>`
  }

  // ── Formulário (criar / editar) ───────────────────────────────────────
  function formHtml (t) {
    const novo = !t
    const podeRestringir = novo || t.criado_por === usuario.id || appState.perfil === 'super_admin'
    const tipoAtual = t ? (t.tipo || 'outras') : ''
    const optFrn = ['<option value="">Nenhum</option>'].concat(
      S.fornecedores.map(f => `<option value="${f.id}" ${t && t.fornecedor_id === f.id ? 'selected' : ''} data-email="${f.email ? 1 : 0}">${esc(f.nome)}${f.email ? '' : ' (sem e-mail)'}</option>`)).join('')
    const chipsPrio = PRIOS.map(([k, v]) =>
      `<button type="button" class="chip-t ${(t ? t.prioridade : 'media') === k ? 'on' : ''}" data-prio="${k}" onclick="TK.pickPrio(this)">${v}</button>`).join('')
    const info = txt => `<span class="info" title="${esc(txt)}">${ic('info', 's')}</span>`
    return `
      ${!novo ? `<div class="tk-edit-faixa">
        <div>${ic('pencil', 's')}<b>Modo edição</b> — as alterações ficarão registradas no histórico da tarefa.</div>
        <input type="text" id="f-motivo" maxlength="300" placeholder="Motivo da alteração (opcional; obrigatório se o prazo mudar)">
      </div>` : ''}
      <fieldset class="tk-campos">
        <div class="fld"><label>Tipo de tarefa *${novo ? info('Escolha o tipo primeiro: o formulário se ajusta a ele.') : ''}</label>${seletorTipo(tipoAtual)}</div>
        <div class="fld"><label>Título *</label>
          <input type="text" id="f-titulo" value="${t ? esc(t.titulo) : ''}" placeholder="O que precisa ser feito?"></div>
        <div id="f-tipo-bloco">${tipoAtual ? blocoTipo(tipoAtual, t ? t.dados_tipo : {}) : ''}</div>
        <div class="fld-row3">
          <div class="fld"><label>Prioridade</label><div class="chips" id="f-prio">${chipsPrio}</div></div>
          <div class="fld"><label>Início</label><input type="date" id="f-inicio" value="${t && t.dt_inicio ? t.dt_inicio : ''}"></div>
          <div class="fld"><label>Prazo <span class="hint-in" id="f-prazo-hint"></span></label><input type="date" id="f-prazo" value="${t && t.dt_prazo ? t.dt_prazo : ''}"></div>
        </div>
        <div class="fld"><label>Atividade vinculada</label>${pickerAtividade(t ? t.atividade_id : null)}</div>
        <div class="fld" id="f-tdr-wrap" style="display:none"><label>TDRs vinculados <span class="opc">opcional</span></label>
          <div class="pp"><div class="pp-chips" id="f-tdr-chips"></div>
            <button type="button" class="pp-add" id="f-tdr-btn" onclick="TK.tdrPainel()">${ic('plus', 's')}Vincular TDR</button></div>
          <div class="tdr-lista" id="f-tdr-lista" hidden></div></div>
        ${campoPessoas('resp', 'Responsáveis' + (S.form.podeDelegar ? '' : ' <span class="opc">só você</span>'), !S.form.podeDelegar)}
        ${campoPessoas('obs', 'Observadores ' + info('Acompanham a tarefa sem executar; recebem os avisos por e-mail e no sino.'), false)}
        <div class="fld-row">
          <div class="fld"><label>Fornecedor ${info('Parte externa: recebe aviso por e-mail, não acessa a plataforma.')}</label>
            <select id="f-frn" onchange="TK.onFrn()">${optFrn}</select>
            <label class="inline-ck" id="f-frn-wrap" style="${t && t.fornecedor_id ? '' : 'display:none'}">
              <input type="checkbox" class="sw" id="f-notif-frn" ${t && t.notificar_fornecedor ? 'checked' : ''}> Enviar e-mail de cobrança</label></div>
          <div class="fld"><label>Visibilidade ${info('Restrita: só quem criou, responsáveis, observadores e o super admin veem. Coordenação e responsáveis da atividade não veem. Quem entrar como observador ou responsável de subtarefa passa a ver a tarefa inteira.')}</label>
            <label class="inline-ck tk-restr ${t && t.restrita ? 'on' : ''}" id="f-restr-wrap">
              <input type="checkbox" class="sw" id="f-restrita" ${t && t.restrita ? 'checked' : ''} ${podeRestringir ? '' : 'disabled'}
                onchange="document.getElementById('f-restr-wrap').classList.toggle('on',this.checked)"> ${ic('lock', 's')}Tarefa restrita${podeRestringir ? '' : ' <span class="opc">só quem criou altera</span>'}</label></div>
        </div>
        <div class="fld"><label>Descrição ${info('Evite colar CPF ou dados pessoais aqui — este campo é interno.')}</label>
          <textarea id="f-desc" rows="2" placeholder="Contexto, links, critérios de conclusão"
            oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'">${t ? esc(t.descricao || '') : ''}</textarea></div>
      </fieldset>`
  }

  function montarModal (t) {
    const novo = !t
    const leitura = !novo && !S.modoEdicao
    const podeEditar = S.podeEditar
    return `
    <div class="tk-modal-h">
      ${t ? `<span class="num-lg">${esc(t.codigo || '')}</span>${chipTipo(t.tipo)}${status(t.status)}${t.restrita ? `<span class="tag">${ic('lock')}Restrita</span>` : ''}` : ''}
      <span class="acoes">
        ${leitura && podeEditar ? `<button class="btn btn-sec" onclick="TK.editar()">${ic('pencil', 's')}Editar</button>` : ''}
        ${t && S.modoEdicao ? `<span class="modo">${ic('pencil', 's')}Modo edição</span>` : ''}
        <button class="btn btn-ghost btn-icon" onclick="fecharModal()" title="Fechar">${ic('x')}</button>
      </span>
      <h3 class="${novo ? 'em-linha' : leitura && podeEditar ? 'ed' : ''}" ${leitura && podeEditar ? `onclick="TK.editarCampo('f-titulo')" title="Clique para editar"` : ''}>${novo ? 'Nova tarefa' : esc(t.titulo)}</h3>
    </div>
    <div class="tk-modal-b${novo ? ' um' : ''}${leitura ? ' leitura' : ''}" id="tk-form">
      <div class="tk-mcol tk-rol">${leitura ? fichaHtml(t) : formHtml(t)}</div>
      ${t ? `<div class="tk-mcol tk-rol lado"><div id="tk-detalhe"><div class="vazio pq"><p>Carregando…</p></div></div></div>` : ''}
    </div>
    <div class="tk-modal-f">${novo ? `
      <span class="sp"></span>
      <button class="btn btn-sec" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-pri" onclick="TK.salvar()">Criar tarefa</button>` : S.modoEdicao ? `
      <span class="sp"></span>
      <button class="btn btn-sec" onclick="TK.descartar()">Descartar</button>
      <button class="btn btn-pri" onclick="TK.salvar()">Salvar alterações</button>` : `
      ${podeEditar && t.status !== 'cancelada' ? `<button class="btn btn-danger" onclick="TK.cancelar('${t.id}')">Cancelar tarefa</button>` : ''}
      <span class="sp"></span>
      <button class="btn btn-sec" onclick="fecharModal()">Fechar</button>
      ${podeEditar && t.status !== 'concluida' ? `<button class="btn btn-ok" onclick="TK.concluir('${t.id}')">${ic('check', 's')}Concluir</button>` : ''}`}
    </div>`
  }

  // ── Salvar (criar ou editar) ──────────────────────────────────────────
  async function salvar () {
    const g = id => document.getElementById(id)
    const tipo = g('f-tipo').value
    if (!tipo) { toast('Escolha o tipo da tarefa.', 'warning'); return }
    const titulo = g('f-titulo').value.trim()
    if (!titulo) { toast('Informe um título.', 'warning'); return }
    const dados_tipo = coletarDadosTipo(tipo)
    const erroTipo = validarTipo(tipo, dados_tipo)
    if (erroTipo) { toast(erroTipo, 'warning'); return }
    aplicarPrazoDoTipo()
    const prioBtn = document.querySelector('#f-prio .chip-t.on')
    const prioridade = prioBtn ? prioBtn.dataset.prio : 'media'
    const desc = g('f-desc').value.trim() || null
    const dt_inicio = g('f-inicio').value || null
    const dt_prazo  = g('f-prazo').value || null // já sincronizado com o campo do tipo
    const atividade_id = g('f-atv').value || null
    const fornecedor_id = g('f-frn').value || null
    const notificar = !!(g('f-notif-frn') && g('f-notif-frn').checked && fornecedor_id)
    const responsaveis = [...S.form.resp]
    const observadores = S.form.obs.filter(u => !S.form.resp.includes(u))
    const restrita = !!(g('f-restrita') && g('f-restrita').checked)
    const tdrsMarcados = atividade_id ? [...document.querySelectorAll('.chk-tdr:checked')].map(c => c.value) : []

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
        p_tipo: tipo, p_dados_tipo: dados_tipo,
      })
      if (error) { toast('Erro ao criar: ' + error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Criar tarefa' } return }
      await sincronizarTdrs(data, [], tdrsMarcados)
      toast('Tarefa criada', 'success')
      chamarEmail(data, 'atribuicao')
    } else {
      const t = S.tarefas.find(x => x.id === S.editId)
      const prazoAntigo = t ? t.dt_prazo : null
      const motivo = (g('f-motivo') ? g('f-motivo').value : '').trim() || null
      if ((prazoAntigo || null) !== (dt_prazo || null) && !motivo) {
        toast('O prazo mudou: informe o motivo da alteração.', 'warning')
        if (g('f-motivo')) g('f-motivo').focus()
        if (btn) { btn.disabled = false; btn.textContent = 'Salvar alterações' }
        return
      }
      const { error } = await db.rpc('fn_editar_tarefa', {
        p_tarefa_id: S.editId, p_titulo: titulo, p_descricao: desc, p_prioridade: prioridade,
        p_dt_inicio: dt_inicio, p_entidade_tipo: t ? t.entidade_tipo : null, p_entidade_id: t ? t.entidade_id : null,
        p_atividade_id: atividade_id,
        p_fornecedor_id: fornecedor_id, p_notificar_fornecedor: notificar,
        p_tipo: tipo, p_dados_tipo: dados_tipo,
        p_mudar_prazo: true, p_dt_prazo: dt_prazo, p_motivo: motivo,
        p_versao: t ? t.atualizado_em : null, // trava: recusa se alguém salvou no meio tempo
      })
      if (error) { toast(error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar alterações' } return }
      // TDRs: a troca de atividade já remove no banco os vínculos de outra atividade
      const atuais = t && t.atividade_id === atividade_id ? (t.vinc_tdrs || []).filter(x => x.tdr).map(x => x.tdr_id) : []
      await sincronizarTdrs(S.editId, atuais, tdrsMarcados)
      if (t && !!t.restrita !== restrita) {
        const { error: eR } = await db.rpc('fn_definir_restricao_tarefa', { p_tarefa_id: S.editId, p_restrita: restrita })
        if (eR) toast('Restrição não alterada: ' + eR.message, 'error')
      }
      // Sincroniza responsáveis/observadores (diferença simples)
      const novos = await sincronizarParticipantes(S.editId, responsaveis, observadores)
      // Novos responsáveis e observadores recebem e-mail (cada um com o seu papel;
      // numa reunião, o e-mail leva o convite de agenda)
      if (novos.length) chamarEmail(S.editId, 'atribuicao', { destinatarios: novos })
      // Reunião alterada (tipo, título ou dados) → convite atualizado aos demais
      const reuniaoMudou = tipo === 'reuniao' && t && (t.tipo !== 'reuniao' || t.titulo !== titulo ||
        JSON.stringify(t.dados_tipo || {}) !== JSON.stringify(dados_tipo))
      if (reuniaoMudou) {
        const demais = [...new Set([t.criado_por, ...responsaveis, ...observadores])].filter(u => !novos.includes(u))
        if (demais.length) chamarEmail(S.editId, 'reuniao_atualizada', { destinatarios: demais })
      }
      // Prazo alterado? (gravado e registrado por fn_editar_tarefa; na reunião
      // o aviso já vai no convite atualizado)
      if ((prazoAntigo || null) !== (dt_prazo || null)) {
        if (!reuniaoMudou) chamarEmail(S.editId, 'prazo_alterado')
      }
      toast('Tarefa atualizada e registrada no histórico', 'success')
    }
    S.modoEdicao = false
    fecharModal()
    await carregarTudo(); render()
  }

  // Vínculos de TDR que o usuário não enxerga nunca entram em "atuais", então
  // não são removidos por quem não tem acesso a eles.
  async function sincronizarTdrs (id, atuais, marcados) {
    const novos = marcados.filter(x => !atuais.includes(x))
    const saem  = atuais.filter(x => !marcados.includes(x))
    if (novos.length) {
      const { error } = await db.from('tarefa_tdrs').insert(novos.map(tdr_id => ({ tarefa_id: id, tdr_id })))
      if (error) toast('TDR não vinculado: ' + error.message, 'error')
    }
    if (saem.length) {
      const { error } = await db.from('tarefa_tdrs').delete().eq('tarefa_id', id).in('tdr_id', saem)
      if (error) toast('TDR não desvinculado: ' + error.message, 'error')
    }
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
    if (t.tipo === 'reuniao') chamarEmail(id, 'cancelada') // cancela o evento na agenda
    toast('Tarefa cancelada.', 'info'); fecharModal(); await carregarTudo(); render()
  }

  // ── Gestão dos tipos (super_admin / coordenação) ──────────────────────
  function abrirTipos () {
    S.editId = null; S.det = null; S.modoEdicao = false
    document.getElementById('tk-modal').classList.remove('estreito')
    const linhas = S.tipos.map(x => `<tr data-cod="${x.codigo}">
        <td><span class="tipo-ic" style="--tc:${esc(x.cor)}">${ic(icTipo(x.codigo))}</span><input type="hidden" class="tt-ic" value="${esc(x.icone)}"></td>
        <td><input type="text" class="tt-nm" value="${esc(x.nome)}"></td>
        <td><input type="color" class="tt-cor" value="${esc(x.cor)}"></td>
        <td><input type="number" class="tt-ord" value="${x.ordem}" style="width:64px"></td>
        <td style="text-align:center"><input type="checkbox" class="tt-at" ${x.ativo ? 'checked' : ''} ${x.codigo === 'outras' ? 'disabled title="Tipo padrão"' : ''}></td>
        <td class="tt-cp">${(x.campos || []).map(c => esc(c.rotulo)).join(', ') || '—'}</td>
        <td><button class="btn btn-sec btn-sm" onclick="TK.salvarTipo('${x.codigo}')">Salvar</button></td>
      </tr>`).join('')
    document.getElementById('tk-modal').innerHTML = `
      <div class="tk-modal-h"><span class="tipo-ic">${ic('sliders')}</span><h3 class="em-linha">Tipos de tarefa</h3><span class="acoes"><button class="btn btn-ghost btn-icon" onclick="fecharModal()" title="Fechar">${ic('x')}</button></span></div>
      <div class="tk-modal-b1">
        <table class="tt-tbl"><thead><tr><th></th><th>Nome</th><th>Cor</th><th>Ordem</th><th>Ativo</th><th>Campos próprios</th><th></th></tr></thead>
          <tbody>${linhas}</tbody></table>
        <div class="hint">Desativar esconde o tipo na criação de tarefas; as tarefas antigas continuam com ele. "Outras" é o padrão e não pode ser desativado.
          Campos próprios de um tipo novo são configurados pela equipe técnica.</div>
        <div class="tt-novo">
          <input type="hidden" id="tt-novo-ic" value="🏷">
          <input type="text" id="tt-novo-nm" placeholder="Nome do novo tipo">
          <input type="color" id="tt-novo-cor" value="#0891B2">
          <button class="btn btn-pri" onclick="TK.novoTipo()">${ic('plus', 's')}Adicionar tipo</button>
        </div>
      </div>
      <div class="tk-modal-f"><span class="sp"></span><button class="btn btn-sec" onclick="fecharModal()">Fechar</button></div>`
    document.getElementById('tk-overlay').classList.add('on')
  }
  async function recarregarTipos () {
    const { data } = await db.from('tarefa_tipos').select('codigo,nome,icone,cor,ordem,ativo,campos').order('ordem')
    S.tipos = data || S.tipos
    abrirTipos(); render()
  }

  // ── API pública (handlers do HTML) ────────────────────────────────────
  window.TK = {
    aba: a => { S.aba = a; render() },
    filtroResp: v => { S.fResp = v; refreshView() },
    filtroPrio: v => { S.fPrio = v; refreshView() },
    filtroTipo: v => { S.fTipo = v; refreshView() },
    // tipo da tarefa
    pickTipo: cod => {
      const atual = document.getElementById('f-tipo').value
      const dados = atual ? coletarDadosTipo(atual) : {}
      document.getElementById('f-tipo').value = cod
      document.querySelectorAll('#f-tipo-grid .tipo-op').forEach(b => b.classList.toggle('on', b.dataset.tipo === cod))
      document.getElementById('f-tipo-bloco').innerHTML = blocoTipo(cod, dados)
      TK.onCampoTipo('formato')
      aplicarPrazoDoTipo()
      const f = document.querySelector('#f-tipo-bloco input, #f-tipo-bloco select'); if (f) f.focus()
    },
    syncPrazoTipo: () => aplicarPrazoDoTipo(),
    onCampoTipo: chave => {
      if (chave === 'formato') {
        // reunião: presencial pede local, online pede link, híbrida pede os dois
        const el = document.getElementById('ft-formato'); if (!el) return
        const v = el.value
        const marca = (campo, obrig) => {
          const lb = document.querySelector(`[data-campo="${campo}"] label`); if (!lb) return
          lb.textContent = lb.textContent.replace(/ \*$/, '') + (obrig ? ' *' : '')
        }
        marca('local', v === 'Presencial' || v === 'Híbrida')
        marca('link', v === 'Online' || v === 'Híbrida')
      }
      if (chave === 'respondida') {
        const ck = document.getElementById('ft-respondida'), dt = document.getElementById('ft-dt_resposta')
        if (ck && dt && ck.checked && !dt.value) {
          const d = new Date(); dt.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
      }
    },
    // gestão dos tipos
    tipos: () => abrirTipos(),
    salvarTipo: async cod => {
      const tr = document.querySelector(`.tt-tbl tr[data-cod="${cod}"]`); if (!tr) return
      const nome = tr.querySelector('.tt-nm').value.trim()
      if (!nome) { toast('O tipo precisa de um nome.', 'warning'); return }
      const { error } = await db.from('tarefa_tipos').update({
        nome, icone: tr.querySelector('.tt-ic').value.trim() || '📌', cor: tr.querySelector('.tt-cor').value,
        ordem: parseInt(tr.querySelector('.tt-ord').value, 10) || 0, ativo: tr.querySelector('.tt-at').checked,
      }).eq('codigo', cod)
      if (error) { toast(error.message, 'error'); return }
      toast('Tipo atualizado', 'success'); await recarregarTipos()
    },
    novoTipo: async () => {
      const nome = document.getElementById('tt-novo-nm').value.trim()
      if (!nome) { toast('Informe o nome do novo tipo.', 'warning'); return }
      let base = semAcento(nome).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36) || 'tipo'
      let codigo = base, n = 2
      while (S.tipos.some(x => x.codigo === codigo)) codigo = base + '_' + n++
      const ordem = S.tipos.length ? Math.max(...S.tipos.filter(x => x.codigo !== 'outras').map(x => x.ordem)) + 10 : 10
      const { error } = await db.from('tarefa_tipos').insert({
        codigo, nome, icone: document.getElementById('tt-novo-ic').value.trim() || '🏷',
        cor: document.getElementById('tt-novo-cor').value, ordem,
      })
      if (error) { toast(error.message, 'error'); return }
      toast('Tipo criado', 'success'); await recarregarTipos()
    },
    toggleAtraso: btn => { S.fAtraso = !S.fAtraso; if (btn) btn.classList.toggle('on', S.fAtraso); refreshView() },
    toggleRestrita: btn => { S.fRestrita = !S.fRestrita; if (btn) btn.classList.toggle('on', S.fRestrita); refreshView() },
    busca: v => { S.fBusca = v; refreshView() },
    novo: () => abrirModal(null),
    abrir: id => { S.modoEdicao = false; abrirModal(S.tarefas.find(t => t.id === id)) },
    salvar, concluir, cancelar,
    editar: () => {
      const t = S.tarefas.find(x => x.id === S.editId); if (!t) return
      S.modoEdicao = true; abrirModal(t, true)
      const m = document.getElementById('f-titulo'); if (m) m.focus()
    },
    descartar: () => {
      const t = S.tarefas.find(x => x.id === S.editId); if (!t) return
      S.modoEdicao = false; abrirModal(t, true)
    },
    editarCampo: campo => {
      const t = S.tarefas.find(x => x.id === S.editId); if (!t || !S.podeEditar) return
      S.modoEdicao = true
      if (campo === 'tdr') S.abrirTdrAoCarregar = true
      abrirModal(t, true)
      const foco = id => { const el = document.getElementById(id); if (el) { el.scrollIntoView({ block: 'center' }); el.focus() } }
      if (campo === 'atividade') { TK.pkAbrir() }
      else if (campo === 'resp' || campo === 'obs') { const b = document.querySelector(`#pp-${campo} .pp-add`); if (b) { b.scrollIntoView({ block: 'center' }); TK.ppAbrir(campo) } }
      else if (campo === 'tdr') { const w = document.getElementById('f-tdr-wrap'); if (w) w.scrollIntoView({ block: 'center' }) }
      else if (campo === 'f-prazo') {
        const c = campoPrazoDoTipo(t.tipo)
        foco(c ? 'ft-' + c.chave : 'f-prazo')
      } else foco(campo)
    },
    // pessoas
    ppAbrir: papel => {
      const pop = document.getElementById(`pp-${papel}-pop`); if (!pop) return
      const aberto = !pop.hidden; ppFecharTodos(); if (aberto) return
      pop.hidden = false
      const b = document.getElementById(`pp-${papel}-busca`); b.value = ''; TK.ppFiltrar(papel, ''); b.focus()
    },
    ppFiltrar: (papel, q) => {
      const n = semAcento(q).trim()
      PP.itens = S.usuarios.filter(u => !S.form[papel].includes(u.id) && (!n || semAcento(u.nome_completo).includes(n)))
      PP.hl = 0; ppRender(papel)
    },
    ppHl: (papel, i) => { PP.hl = i; document.querySelectorAll(`#pp-${papel}-lista .pk-it`).forEach((el, j) => el.classList.toggle('hl', j === i)) },
    ppTecla: (e, papel) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); PP.hl = Math.min(PP.itens.length - 1, PP.hl + 1); ppRender(papel) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); PP.hl = Math.max(0, PP.hl - 1); ppRender(papel) }
      else if (e.key === 'Enter') { e.preventDefault(); const u = PP.itens[PP.hl]; if (u) TK.ppAdicionar(papel, u.id) }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ppFecharTodos() }
    },
    ppAdicionar: (papel, id) => {
      const outro = papel === 'resp' ? 'obs' : 'resp'
      if (!S.form[papel].includes(id)) S.form[papel].push(id)
      S.form[outro] = S.form[outro].filter(x => x !== id) // um papel por pessoa
      renderPessoas('resp'); renderPessoas('obs')
      const b = document.getElementById(`pp-${papel}-busca`); if (b) { b.value = ''; TK.ppFiltrar(papel, ''); b.focus() }
    },
    ppRemover: (papel, id) => { S.form[papel] = S.form[papel].filter(x => x !== id); renderPessoas(papel) },
    // TDRs
    tdrPainel: forcarAbrir => {
      const el = document.getElementById('f-tdr-lista'), b = document.getElementById('f-tdr-btn'); if (!el) return
      el.hidden = forcarAbrir === true ? false : !el.hidden
      if (b) b.innerHTML = el.hidden ? ic('plus', 's') + 'Vincular TDR' : ic('x', 's') + 'Fechar lista'
    },
    tdrMudou: () => renderTdrChips(),
    tdrDesmarcar: id => { const c = document.querySelector(`.chk-tdr[value="${id}"]`); if (c) c.checked = false; renderTdrChips() },
    histToggle: i => { const el = document.getElementById('hist-det-' + i); if (el) el.hidden = !el.hidden },
    pickPrio: el => { el.parentElement.querySelectorAll('.chip-t').forEach(c => c.classList.remove('on')); el.classList.add('on') },
    pkAbrir: () => {
      const pop = document.getElementById('pk-atv-pop'); if (!pop) return
      if (!pop.hidden) { pkFechar(); return }
      pop.hidden = false
      const b = document.getElementById('pk-atv-busca'); b.value = ''
      TK.pkFiltrar('')
      b.focus()
    },
    pkFiltrar: q => {
      const n = semAcento(q).trim()
      const achou = S.atividades.filter(a => !n || semAcento(a.codigo + ' ' + (a.nome_pt || '')).includes(n))
      PK.itens = n ? achou : [null, ...achou]
      const sel = document.getElementById('f-atv').value
      PK.hl = Math.max(0, PK.itens.findIndex(a => (a ? a.id : '') === sel))
      if (n) PK.hl = 0
      pkRender()
    },
    pkHl: i => { PK.hl = i; document.querySelectorAll('#pk-atv-lista .pk-it').forEach((el, j) => el.classList.toggle('hl', j === i)) },
    pkTecla: e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); PK.hl = Math.min(PK.itens.length - 1, PK.hl + 1); pkRender() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); PK.hl = Math.max(0, PK.hl - 1); pkRender() }
      else if (e.key === 'Enter') { e.preventDefault(); const a = PK.itens[PK.hl]; if (a !== undefined) TK.pkEscolher(a ? a.id : '') }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); pkFechar(); document.getElementById('pk-atv-btn').focus() }
    },
    pkEscolher: id => {
      const inp = document.getElementById('f-atv'); const mudou = inp.value !== id
      inp.value = id
      const a = S.atividades.find(x => x.id === id)
      const btn = document.getElementById('pk-atv-btn')
      btn.innerHTML = rotuloAtv(a) + ic('chev', 's pk-seta')
      btn.title = a ? a.codigo + ' · ' + (a.nome_pt || '') : ''
      pkFechar()
      if (mudou) {
        // vínculos de TDR que o usuário não vê só permanecem se a atividade for a mesma
        const t = S.editId ? S.tarefas.find(x => x.id === S.editId) : null
        const mesma = t && t.atividade_id === id
        const v = mesma ? (t.vinc_tdrs || []) : []
        carregarTdrsAtv(id, v.filter(x => x.tdr).map(x => x.tdr_id), v.filter(x => !x.tdr).length)
      }
    },
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
          toast(f && f.email ? 'Subtarefa enviada ao fornecedor por e-mail' : 'Fornecedor sem e-mail cadastrado — não foi notificado.', f && f.email ? 'success' : 'warning')
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
      if (!v) v = 'Anexo'
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
