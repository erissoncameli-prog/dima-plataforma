// ═══════════════════════════════════════════════════════════════════════
// remanejamentos.js — Remanejamento de recursos entre atividades
// ═══════════════════════════════════════════════════════════════════════
// A tela só EXIBE e PEDE. Toda regra mora no banco (docs/remanejamento/plano.md):
//   · saldo, procedência e reserva: vw_orcamento_atividade / vw_orcamento_fontes_saldo
//   · rascunho: fn_rem_salvar (coordenação)
//   · enviar / aprovar / devolver / recusar / cancelar: Edge Function
//     assinar-remanejamento, que reconfirma a senha NO SERVIDOR e chama
//     fn_rem_assinar (service_role). Nunca verificar senha aqui.
//   · titulares: fn_rem_designar_titular (super_admin)
//   · contrato travado (aguardando_cobertura): o banco trava e libera sozinho;
//     aqui só se monta o pedido tipo 'cobertura_contrato' para a atividade dele
//   · estorno: fn_rem_criar_estorno monta o espelho do pedido efetivado (itens e
//     fontes não se editam); segue a mesma cadeia e, efetivado, marca o original
//     'estornado'. Só cabe se o destino não gastou nem repassou o que recebeu.
// "Aguardando minha análise" é calculado aqui só para a fila; quem pode
// assinar de fato é decidido por fn_rem_assinar.
// ═══════════════════════════════════════════════════════════════════════

const REM = {
  aba: 'saldos', filtro: 'minha',
  ativs: [], fontes: [], resultados: [], pedidos: [], etapas: [], resp: [],
  cargos: [], titulares: [], usuarios: {},
  travados: [], pendencias: [],  // contratos aguardando cobertura (fase 5) e o déficit de cada um
  abertos: new Set(),           // atividades expandidas no quadro
  editando: null,               // id do rascunho em edição (null = novo)
  form: null,                   // { justificativa, ceder: {fonte_id: valor}, destinos: [{atividade_id, valor}] }
  detalhe: null,                // pedido aberto no modal
  assinar: null,                // { decisao }
}

const REM_STATUS = {
  rascunho: ['Rascunho', 'badge-cinza'], em_aprovacao: ['Em aprovação', 'badge-blue'],
  efetivado: ['Efetivado', 'badge-verde'], recusado: ['Recusado', 'badge-erro'],
  cancelado: ['Cancelado', 'badge-cinza'], estornado: ['Estornado', 'badge-ouro'],
}
const REM_PAPEL = {
  solicitacao: 'Solicitação (coordenação)', liberacao_origem: 'Liberação da atividade de origem',
  unesco: 'UNESCO', diretoria: 'Diretoria', secretaria: 'Secretaria',
}
const REM_FONTE = {
  dotacao_original: 'Dotação original', revisao_orcamentaria: 'Revisão orçamentária',
  economia_contratacao: 'Economia de contratação', encerramento_contrato: 'Encerramento de contrato',
  remanejamento_recebido: 'Remanejamento recebido',
}
const REM_EVENTO = {
  criado: 'Pedido criado', rascunho_salvo: 'Rascunho salvo', enviado: 'Enviado para a cadeia',
  aprovado_etapa: 'Aprovou a etapa', devolvido: 'Devolveu', recusado: 'Recusou', cancelado: 'Cancelou',
  editado_apos_devolucao: 'Editou após devolução (nova versão)', efetivado: 'Efetivado no razão',
  estorno_solicitado: 'Pediu o estorno', estornado: 'Estornado (lançamentos espelhados)',
}
const REM_ERRO = {
  SENHA_INVALIDA: 'Senha incorreta.',
  SENHA_BLOQUEADA: 'Assinatura bloqueada por excesso de tentativas. Tente de novo mais tarde.',
}

// ── Ícones (SVG, sem emoji) ───────────────────────────────────────────
const RM_IC = {
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  chev:'<path d="m6 9 6 6 6-6"/>',
  troca:'<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
  cadeado:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  alerta:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  doc:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  mais:'<path d="M12 5v14M5 12h14"/>',
  volta:'<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  livro:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>',
  relogio:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sol:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'
}
function rmIc(n, cls) { return '<svg class="rm-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (RM_IC[n] || '') + '</svg>' }
document.querySelectorAll('i[data-ic]').forEach(e => { e.outerHTML = rmIc(e.dataset.ic, 'p') })

// Tema claro/escuro: mesmo 'diag_tema' da mesa do Diagnóstico e das demais guias (componente .dgm-tema)
function seletorTema() {
  const tb = document.querySelector('.topbar'); if (!tb || tb.querySelector('.dgm-tema') || typeof DiagTema === 'undefined') return
  const d = document.createElement('div')
  d.className = 'dgm-tema'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Tema')
  d.innerHTML = [['claro', 'sol', 'Claro'], ['escuro', 'lua', 'Escuro']].map(x =>
    `<button type="button" data-tema="${x[0]}" aria-pressed="${DiagTema.atual() === x[0]}">${rmIc(x[1])}${x[2]}</button>`).join('')
  const bc = tb.querySelector('.topbar-breadcrumb')
  if (bc) bc.parentNode.insertBefore(d, bc); else tb.appendChild(d)
  d.addEventListener('click', ev => {
    const b = ev.target.closest('[data-tema]'); if (!b) return
    DiagTema.definir(b.dataset.tema)
    d.querySelectorAll('[data-tema]').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
  })
}

// ── Janelas: pilha (Esc fecha a de cima), foco no primeiro controle, Tab preso, foco volta ──
const RM_FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]):not([type=file]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
const rmPilha = []
function rmAbrir(id, alvo) {
  const el = document.getElementById(id)
  if (!el.classList.contains('aberto')) { rmPilha.push({ id, volta: document.activeElement }); el.classList.add('aberto') }
  requestAnimationFrame(() => {
    const f = (alvo && document.getElementById(alvo)) || el.querySelector('.modal-close')
    if (f) f.focus({ preventScroll: true })
  })
}
function rmFechar(id) {
  const el = document.getElementById(id); if (!el) return
  el.classList.remove('aberto')
  const k = rmPilha.findIndex(x => x.id === id)
  if (k >= 0) { const { volta } = rmPilha.splice(k, 1)[0]; if (volta && document.contains(volta)) volta.focus({ preventScroll: true }) }
}
const RM_FECHAR = { 'rm-modal-pedido': () => remFecharPedido(), 'rm-modal-assinar': () => remFecharAssinar(), 'rm-ajuda-pop': () => remAjudaFechar() }
document.addEventListener('keydown', e => {
  const topo = rmPilha[rmPilha.length - 1]; if (!topo) return
  const el = document.getElementById(topo.id)
  if (e.key === 'Escape') { e.preventDefault(); (RM_FECHAR[topo.id] || (() => rmFechar(topo.id)))() }
  else if (e.key === 'Tab') {
    const f = [...el.querySelectorAll(RM_FOCAVEIS)].filter(x => x.offsetParent !== null)
    if (!f.length) return
    const pri = f[0], ult = f[f.length - 1]
    if (!el.contains(document.activeElement)) { e.preventDefault(); pri.focus() }
    else if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus() }
    else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus() }
  }
})
;['rm-modal-pedido', 'rm-modal-assinar'].forEach(id => document.getElementById(id)?.addEventListener('click', e => { if (e.target.id === id) RM_FECHAR[id]() }))

const usd2 = v => 'US$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = v => Math.round(Number(v || 0) * 100) / 100
const dataHora = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const nomeU = id => REM.usuarios[id]?.nome_completo || '—'
const podeMontar = () => ['coordenacao', 'super_admin'].includes(appState.perfil)

;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { window.location.href = '../index.html'; return }

  document.getElementById('app').innerHTML =
    gerarLayout('Remanejamento de recursos', 'remanejamentos') +
    `<div class="fade-in rm">
      <div class="rm-cab"><div>
        <p>Remaneja saldo livre entre atividades com origem rastreada até o centavo. O pedido passa pela coordenação,
        pelo responsável de cada atividade que cede, pela UNESCO, pela diretoria e pela secretaria, nessa ordem, cada um
        assinando com a própria senha. Só depois da última assinatura o valor muda no orçamento.</p>
      </div></div>
      <div class="rm-kpis" id="rm-kpis"></div>
      <div class="rm-abas" id="rm-abas" role="tablist" aria-label="Remanejamento"></div>
      <div id="rm-corpo"><p class="rm-vazio">Carregando…</p></div>
    </div>` + '</div></div></div>'
  carregarLogosSidebar()
  seletorTema()

  REM.inicio = true
  await remCarregar()
  const qs = new URLSearchParams(location.search)
  if (qs.get('id')) remAbrirPedido(qs.get('id'))
  else if (qs.get('cobertura')) remCobertura(qs.get('cobertura'))
})()

async function remCarregar() {
  const r = await Promise.all([
    db.from('vw_orcamento_atividade').select('*').order('codigo'),
    db.from('resultados').select('id,codigo,nome_pt').order('codigo'),
    db.from('vw_orcamento_fontes_saldo').select('*'),
    db.from('remanejamentos').select('*, itens:remanejamento_itens(atividade_id, valor_usd, ativo)').order('criado_em', { ascending: false }),
    db.from('remanejamento_etapas').select('id, remanejamento_id, versao, ordem, papel, cargo, atividade_id, assinatura_id'),
    db.from('atividade_responsaveis').select('atividade_id, usuario_id, papel, ativo').eq('ativo', true).eq('papel', 'responsavel'),
    db.from('rem_cargos').select('*').order('ordem'),
    db.from('rem_cargo_titulares').select('*').is('vigencia_fim', null),
    db.from('usuarios').select('id, nome_completo, perfil, ativo'),
    db.from('contratos').select('id, numero, valor_total_brl, tdr_id, atividade_id, tdrs(numero, atividade_id)').eq('status', 'aguardando_cobertura'),
    db.from('contrato_coberturas').select('contrato_id, atividade_id, deficit_usd, delta_usd, evento, criado_em').eq('situacao', 'aguardando').order('seq'),
  ])
  const erro = r.find(x => x.error)
  if (erro) {
    document.getElementById('rm-corpo').innerHTML =
      '<p class="rm-vazio">Não foi possível carregar: ' + esc(erro.error.message) + '</p>'
    return
  }
  ;[REM.ativs, REM.resultados, REM.fontes, REM.pedidos, REM.etapas, REM.resp, REM.cargos, REM.titulares] = r.map(x => x.data || [])
  // itens retirados do rascunho ficam guardados com ativo = false; não entram na conta
  for (const p of REM.pedidos) p.itens = (p.itens || []).filter(i => i.ativo !== false)
  REM.usuarios = Object.fromEntries((r[8].data || []).map(u => [u.id, u]))
  REM.travados = r[9].data || []
  REM.pendencias = r[10].data || []
  if (REM.inicio) { REM.inicio = false; if (REM.pedidos.some(remMinhaVez)) { REM.aba = 'pedidos'; REM.filtro = 'minha' } }
  remRender()
}

// ── Quem assina a etapa atual (só para a fila; o banco decide) ─────────
function remTitular(cargo) {
  const t = REM.titulares.find(x => x.cargo === cargo)
  return t && REM.usuarios[t.usuario_id]?.ativo ? t.usuario_id : null
}
function remSignatarios(etapa) {
  if (!etapa) return []
  if (etapa.papel === 'liberacao_origem')
    return REM.resp.filter(r => r.atividade_id === etapa.atividade_id && REM.usuarios[r.usuario_id]?.ativo).map(r => r.usuario_id)
  const t = remTitular(etapa.cargo)
  return t ? [t] : []
}
function remEtapaAtual(p) {
  return REM.etapas.find(e => e.remanejamento_id === p.id && e.versao === p.versao && e.ordem === p.etapa_atual)
}
function remMinhaVez(p) {
  const eu = appState.usuario.id
  if (p.status === 'rascunho') return p.criado_por === eu || remTitular('coordenacao_solicitante') === eu
  if (p.status !== 'em_aprovacao') return false
  return remSignatarios(remEtapaAtual(p)).includes(eu)
}

// ── Abas ───────────────────────────────────────────────────────────────
function remRender() {
  const minhas = REM.pedidos.filter(remMinhaVez).length
  const abas = [
    ['saldos', 'Saldos por resultado'],
    ['pedidos', 'Pedidos' + ` <span class="rm-cont${minhas ? ' vez' : ''}" title="${minhas ? 'aguardando sua análise' : 'pedidos'}">${minhas || REM.pedidos.length}</span>`],
    ...(podeMontar() ? [['novo', REM.editando ? 'Editar rascunho' : 'Novo pedido']] : []),
    ['titulares', 'Signatários'],
    ['guia', 'Como funciona'],
  ]
  document.getElementById('rm-abas').innerHTML = abas.map(([k, l]) =>
    `<button type="button" role="tab" aria-selected="${REM.aba === k}" class="rm-aba ${REM.aba === k ? 'ativa' : ''}" onclick="remAba('${k}')">${l}</button>`).join('')
  remKpis()
  const el = document.getElementById('rm-corpo')
  el.innerHTML = { saldos: remSaldosHTML, pedidos: remPedidosHTML, novo: remNovoHTML, titulares: remTitularesHTML, guia: remGuiaHTML }[REM.aba]()
}
function remAba(k) {
  if (k === 'novo' && !REM.form) remNovoForm(null)
  REM.aba = k
  remRender()
}

// ── 1. Saldos por resultado ────────────────────────────────────────────
// Diferença de arredondamento (déficit abaixo de US$ 1) não é déficit de verdade: fica em cinza
const RM_CENTAVOS = 1
function remKpis() {
  const A = REM.ativs
  const soma = k => A.reduce((s, a) => s + Number(a[k] || 0), 0)
  const defs = A.filter(a => Number(a.deficit_usd) >= RM_CENTAVOS)
  const vDef = defs.reduce((s, a) => s + Number(a.deficit_usd), 0)
  const kpi = (ic, l, q, v, s, cls) => `<div class="rm-kpi"><div class="rm-kpi-l">${rmIc(ic)}${l} ${remQ(q)}</div><div class="rm-kpi-v ${cls || ''}">${v}</div><div class="rm-kpi-s">${s}</div></div>`
  const el = document.getElementById('rm-kpis'); if (!el) return
  el.innerHTML =
      kpi('troca', 'Remanejável', 'remanejavel', usd2(soma('remanejavel_usd')), 'livre de TDR, despesa e reserva')
    + kpi('cadeado', 'Reservado', 'reservado', usd2(soma('reservado_usd')), 'por pedidos em aprovação')
    + kpi('alerta', 'Déficit', 'deficit', usd2(vDef), defs.length ? `em ${defs.length} atividade${defs.length === 1 ? '' : 's'} (${defs.map(a => esc(a.codigo)).join(', ')})` : 'nenhuma atividade', defs.length ? 'erro' : '')
    + kpi('doc', 'Contratos travados', 'cobertura', REM.travados.length, 'aguardando cobertura', REM.travados.length ? 'al' : '')
}
function remBarra(comp, vig, res) {
  const v = Number(vig || 0), c = Number(comp || 0), pct = v > 0 ? c / v * 100 : (c > 0 ? 101 : 0)
  const acima = c - v >= RM_CENTAVOS   // centavos de arredondamento não pintam a barra de vermelho
  const rot = acima ? Math.max(101, Math.round(pct)) : Math.min(100, Math.round(pct))
  return `<div class="rm-bar"><div class="tr"><i class="${acima && !res ? 'acima' : ''}" style="width:${Math.min(pct, 100)}%"></i></div>
    <div class="lg"><span><b>${usd2(c)}</b> de ${usd2(v)}</span>${res ? '' : `<span>${rot}%</span>`}</div></div>`
}
function remSaldosHTML() {
  const A = REM.ativs
  const soma = k => A.reduce((s, a) => s + Number(a[k] || 0), 0)
  let h = `${remTravadosHTML()}
  <p class="rm-sub" style="margin:0">Clique numa atividade para ver de onde vem cada dólar (fontes do razão, na ordem de consumo). ${remQ('fontes')} Dúvidas? Veja a aba <a href="#" onclick="event.preventDefault();remIrGuia('visao')">Como funciona</a>.</p>
  <div class="card"><div class="table-wrap"><table class="rm-tab larga">
    <thead><tr><th>Atividade</th><th>Comprometido ${remQ('comprometido')} × vigente ${remQ('orcamento_vigente')}</th>
      <th class="n">Saldo ${remQ('saldo')}</th><th class="n">Reservado ${remQ('reservado')}</th><th class="n">Remanejável ${remQ('remanejavel')}</th><th></th></tr></thead><tbody>`
  REM.resultados.forEach((r, ir) => {
    const as = A.filter(a => a.resultado_id === r.id)
    if (!as.length) return
    const s = k => as.reduce((t, a) => t + Number(a[k] || 0), 0)
    h += `<tr class="rm-res" style="--c:var(--rm-r${Math.min(ir + 1, 4)})"><td><span class="rm-rtag">${esc(r.codigo)}</span>${esc(r.nome_pt || '')}</td>
      <td>${remBarra(s('debito_usd'), s('orcamento_vigente_usd'), true)}</td><td class="n">${usd2(s('saldo_usd'))}</td>
      <td class="n">${usd2(s('reservado_usd'))}</td><td class="n">${usd2(s('remanejavel_usd'))}</td><td></td></tr>`
    for (const a of as) {
      const saldo = Number(a.saldo_usd), def = Number(a.deficit_usd), aberto = REM.abertos.has(a.atividade_id)
      const orig = a.orcamento_original_usd != null && num(a.orcamento_original_usd) !== num(a.orcamento_vigente_usd)
        ? `<div class="rm-sub">original ${usd2(a.orcamento_original_usd)}</div>` : ''
      const selo = def >= RM_CENTAVOS ? ` <span class="badge badge-erro">${rmIc('alerta', 'p')}déficit ${usd2(def)}</span>`
        : def > 0 ? ` <span class="badge badge-cinza" title="Diferença de arredondamento: ${usd2(def)}">diferença de centavos</span>` : ''
      h += `<tr class="rm-atv${aberto ? ' aberta' : ''}" tabindex="0" aria-expanded="${aberto}" onclick="remAlternar('${a.atividade_id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();remAlternar('${a.atividade_id}')}">
        <td><div class="nm"><span class="rm-cod">${esc(a.codigo)}</span> ${esc(a.nome_pt || '')}${selo}
          ${Number(a.tdrs_sem_valor_usd) > 0 ? ' <span class="badge badge-ouro">TDR sem valor em US$</span>' : ''}</div>${orig}</td>
        <td>${remBarra(a.debito_usd, a.orcamento_vigente_usd)}</td>
        <td class="n ${saldo < 0 && def >= RM_CENTAVOS ? 'rm-neg' : ''}">${usd2(saldo)}</td>
        <td class="n ${Number(a.reservado_usd) ? '' : 'rm-mut'}">${usd2(a.reservado_usd)}</td>
        <td class="n ${Number(a.remanejavel_usd) > 0 ? 'rm-pos' : 'rm-mut'}"><b>${usd2(a.remanejavel_usd)}</b></td>
        <td>${rmIc('chev', 'chev')}</td></tr>`
      if (aberto) h += `<tr class="rm-fontes"><td colspan="6"><div class="rm-fontes-in">${remFontesHTML(a.atividade_id)}</div></td></tr>`
    }
  })
  h += `<tr class="rm-tot"><td>Total do projeto · ${A.length} atividades</td><td>${remBarra(soma('debito_usd'), soma('orcamento_vigente_usd'), true)}<div class="rm-sub">orçamento vigente total</div></td>
    <td class="n">${usd2(soma('saldo_usd'))}</td><td class="n">${usd2(soma('reservado_usd'))}</td><td class="n">${usd2(soma('remanejavel_usd'))}</td><td></td></tr>`
  return h + '</tbody></table></div></div>'
}
// Contratos travados: o valor acima do TDR não coube no saldo livre da atividade.
// Liberam sozinhos quando o saldo cobrir (o banco reavalia a cada crédito).
function remDeficitContrato(cid) {
  return num(REM.pendencias.filter(x => x.contrato_id === cid).reduce((s, x) => s + Number(x.deficit_usd), 0))
}
function remAtivContrato(c) { return c.tdrs?.atividade_id || c.atividade_id }
function remTravadosHTML() {
  if (!REM.travados.length) return ''
  let h = `<div class="card rm-travados"><div class="cab">
    <b>${rmIc('alerta', 'p')} Contratos travados aguardando cobertura</b> ${remQ('cobertura')}
    <p class="rm-sub" style="margin:0 0 6px">O valor acima do TDR não coube no saldo livre da atividade. Sem produtos, pagamentos nem PDF assinado
    até a cobertura; o contrato libera sozinho quando o saldo cobrir (remanejamento efetivado, economia, encerramento ou redução do contrato).</p></div>
    <div class="table-wrap"><table class="rm-tab larga"><thead><tr><th>Contrato</th><th>TDR</th><th>Atividade</th>
    <th class="n">Falta cobrir ${remQ('falta_cobrir')}</th><th>Pedido</th><th></th></tr></thead><tbody>`
  for (const c of REM.travados) {
    const a = REM.ativs.find(x => x.atividade_id === remAtivContrato(c))
    const ped = REM.pedidos.find(p => p.contrato_id === c.id && ['rascunho', 'em_aprovacao'].includes(p.status))
    h += `<tr><td><b>${esc(c.numero)}</b></td><td>${esc(c.tdrs?.numero || 'sem TDR')}</td>
      <td><span class="rm-cod">${esc(a?.codigo || '?')}</span></td><td class="n"><b>${usd2(remDeficitContrato(c.id))}</b></td>
      <td>${ped ? `<a href="#" onclick="event.preventDefault();remAbrirPedido('${ped.id}')">${esc(ped.numero)}</a> · ${esc((REM_STATUS[ped.status] || [ped.status])[0])}` : '—'}</td>
      <td>${!ped && podeMontar() ? `<button type="button" class="btn btn-primary btn-sm" onclick="remCobertura('${c.id}')">Pedir cobertura</button>` : ''}</td></tr>`
  }
  return h + '</tbody></table></div></div>'
}
function remCobertura(cid) {
  const c = REM.travados.find(x => x.id === cid)
  if (!c) { toast('Este contrato não está aguardando cobertura (pode já ter sido liberado).', 'info'); return }
  if (!podeMontar()) { toast('Só a coordenação monta o pedido de cobertura.', 'warning'); return }
  remNovoForm(null)
  REM.form.cobertura = { contrato_id: c.id, numero: c.numero }
  REM.form.destinos = [{ atividade_id: remAtivContrato(c), valor: remDeficitContrato(c.id) }]
  REM.form.justificativa = `Cobertura do contrato ${c.numero}${c.tdrs?.numero ? ' (TDR ' + c.tdrs.numero + ')' : ''}: o valor contratado excede o TDR e o saldo livre da atividade.`
  REM.aba = 'novo'
  remRender()
}

function remAlternar(id) {
  REM.abertos.has(id) ? REM.abertos.delete(id) : REM.abertos.add(id)
  remRender()
}
function remProcedencia(f) {
  if (f.tipo === 'remanejamento_recebido') {
    const o = REM.fontes.find(x => x.fonte_id === f.fonte_origem_id)
    const p = REM.pedidos.find(x => x.id === f.remanejamento_id)
    return `de ${esc(o?.atividade_codigo || '?')} (${esc(REM_FONTE[o?.tipo] || '')})${p ? ' · ' + esc(p.numero) : ''}`
  }
  if (f.contrato_numero) return `contrato ${esc(f.contrato_numero)}${f.tdr_numero ? ' · TDR ' + esc(f.tdr_numero) : ''}`
  return esc(f.descricao || '')
}
function remFontesHTML(atvId) {
  const fs = REM.fontes.filter(f => f.atividade_id === atvId).sort((a, b) => a.ordem_consumo - b.ordem_consumo)
  if (!fs.length) return '<p class="rm-vazio">Sem fontes no razão.</p>'
  return `<table class="rm-tab"><thead><tr><th>#</th><th>Fonte ${remQ('fontes')}</th><th>Procedência</th><th class="n">Valor líquido</th>
    <th class="n">Consumido ${remQ('consumido')}</th><th class="n">Disponível</th><th class="n">Reservado ${remQ('reservado')}</th><th class="n">Livre ${remQ('consumido')}</th></tr></thead><tbody>` +
    fs.map(f => `<tr><td>${f.ordem_consumo}</td><td>${esc(REM_FONTE[f.tipo] || f.tipo)}</td><td>${remProcedencia(f)}</td>
      <td class="n">${usd2(f.liquido_usd)}</td><td class="n">${usd2(f.consumido_usd)}</td><td class="n">${usd2(f.disponivel_usd)}</td>
      <td class="n">${usd2(f.reservado_usd)}</td><td class="n"><b>${usd2(f.livre_usd)}</b></td></tr>`).join('') +
    '</tbody></table><p class="rm-sub" style="margin:6px 0 0">Os compromissos consomem primeiro a dotação original e depois as demais fontes na ordem em que entraram.' +
    ` <button type="button" class="btn btn-secondary btn-sm" style="margin-left:8px" onclick="event.stopPropagation();relAbrirExtratoA4('${atvId}')">${rmIc('livro', 'p')}Extrato (A4)</button> ${remQ('extrato')}</p>`
}

// ── 2. Pedidos ─────────────────────────────────────────────────────────
function remPedidosHTML() {
  const f = REM.filtro
  const lista = REM.pedidos.filter(p => f === 'todos' ? true : f === 'minha' ? remMinhaVez(p) : p.status === 'em_aprovacao')
  const chip = (k, l) => `<button type="button" class="rm-chip ${f === k ? 'ativo' : ''}" aria-pressed="${f === k}" onclick="REM.filtro='${k}';remRender()">${l}</button>`
  let h = `<div class="rm-chips">${chip('minha', 'Aguardando minha análise (' + REM.pedidos.filter(remMinhaVez).length + ')')}
    ${chip('andamento', 'Em aprovação')}${chip('todos', 'Todos')} ${remQ('minha_vez')} ${remQ('cadeia')}</div>`
  if (!REM.pedidos.length) return h + `<div class="card"><div class="rm-vazio-g"><span class="ic-g">${rmIc('troca')}</span><b>Nenhum pedido de remanejamento ainda</b>
    <span>Um pedido tira saldo livre de uma ou mais atividades e leva para outras. Ele fica reservado enquanto passa pelas cinco assinaturas e só muda o orçamento depois da última.</span>
    ${podeMontar() ? `<button type="button" class="btn btn-primary" onclick="remAba('novo')">${rmIc('mais', 'p')}Novo pedido</button>` : ''}</div></div>`
  if (!lista.length) return h + `<div class="card"><div class="rm-vazio-g"><b>${f === 'minha' ? 'Nenhum pedido aguardando a sua análise' : 'Nenhum pedido em aprovação'}</b>
    <span>Veja a lista completa em "Todos".</span></div></div>`
  h += `<div class="card"><div class="table-wrap"><table class="rm-tab larga"><thead><tr><th>Pedido</th><th>Situação</th>
    <th>Etapa atual</th><th>Origem → destino</th><th class="n">Valor</th><th>Criado</th></tr></thead><tbody>`
  for (const p of lista) {
    const [st, cls] = REM_STATUS[p.status] || [p.status, 'badge-cinza']
    const et = remEtapaAtual(p)
    const quem = p.status === 'em_aprovacao' && et
      ? `${esc(REM_PAPEL[et.papel])}<div class="rm-sub">${remSignatarios(et).map(nomeU).map(esc).join(', ') || 'sem signatário'}</div>` : '—'
    const cod = id => esc(REM.ativs.find(a => a.atividade_id === id)?.codigo || '?')
    const orig = (p.itens || []).filter(i => i.valor_usd < 0).map(i => cod(i.atividade_id)).join(', ')
    const dest = (p.itens || []).filter(i => i.valor_usd > 0).map(i => cod(i.atividade_id)).join(', ')
    const total = (p.itens || []).filter(i => i.valor_usd > 0).reduce((s, i) => s + Number(i.valor_usd), 0)
    const ct = (p.tipo === 'cobertura_contrato'
      ? ' <span class="badge badge-blue">cobertura ' + esc(REM.travados.find(c => c.id === p.contrato_id)?.numero || 'de contrato') + '</span>' : '')
      + (p.estorno_de ? ' <span class="badge badge-ouro">estorno de ' + esc(REM.pedidos.find(x => x.id === p.estorno_de)?.numero || '?') + '</span>' : '')
    h += `<tr class="rm-atv" tabindex="0" onclick="remAbrirPedido('${p.id}')" onkeydown="if(event.key==='Enter'){event.preventDefault();remAbrirPedido('${p.id}')}"><td><b>${esc(p.numero)}</b>${ct}${remMinhaVez(p) ? ' <span class="badge badge-ouro">sua vez</span>' : ''}</td>
      <td><span class="badge ${cls}">${st}</span></td><td>${quem}</td><td>${orig || '—'} → ${dest || '—'}</td>
      <td class="n">${usd2(total)}</td><td style="white-space:nowrap">${dataHora(p.criado_em)}</td></tr>`
  }
  return h + '</tbody></table></div></div>'
}

// ── 3. Novo pedido / editar rascunho ───────────────────────────────────
function remNovoForm(pedido, itens, alocs) {
  REM.editando = pedido?.id || null
  REM.form = { justificativa: pedido?.justificativa === '(rascunho)' ? '' : (pedido?.justificativa || ''), ceder: {}, destinos: [] }
  if (pedido?.tipo === 'cobertura_contrato')
    REM.form.cobertura = { contrato_id: pedido.contrato_id, numero: REM.travados.find(c => c.id === pedido.contrato_id)?.numero || '' }
  for (const a of alocs || []) REM.form.ceder[a.fonte_id] = num(a.valor_usd)
  for (const i of (itens || []).filter(i => i.valor_usd > 0)) REM.form.destinos.push({ atividade_id: i.atividade_id, valor: num(i.valor_usd) })
  if (!REM.form.destinos.length) REM.form.destinos.push({ atividade_id: '', valor: 0 })
}
function remNovoHTML() {
  if (!REM.form) remNovoForm(null)
  const F = REM.form
  // fontes que podem ceder: livre > 0, ou já alocadas neste rascunho
  const porAtv = {}
  for (const f of REM.fontes) {
    const ja = F.ceder[f.fonte_id] || 0
    if (Number(f.livre_usd) <= 0 && !ja) continue
    ;(porAtv[f.atividade_id] = porAtv[f.atividade_id] || []).push(f)
  }
  const ativOrd = REM.ativs.filter(a => porAtv[a.atividade_id])
  const aviso = !remTitular('coordenacao_solicitante')
    ? '<div class="rm-aviso">O cargo de coordenação solicitante ainda não tem titular designado: o rascunho pode ser salvo, mas só será enviado depois da designação (aba Signatários).</div>' : ''

  const cob = F.cobertura
    ? `<div class="rm-aviso trava">Pedido de <b>cobertura do contrato ${esc(F.cobertura.numero)}</b>.
       O destino precisa ser a atividade do contrato; quando o pedido for efetivado, o contrato é liberado automaticamente.
       Se o saldo for coberto antes por outro caminho, este pedido é cancelado sozinho.</div>` : ''
  let h = `<div class="rm-form">${aviso}${cob}
    <h3>1. De onde sai o recurso ${remQ('pedido_origem')}</h3>
    <p class="rm-ajuda">Informe quanto cada fonte cede. Só aparece saldo realmente livre: já descontados TDRs, despesas, outras reservas e déficits.</p>`
  if (!ativOrd.length) h += '<p class="rm-vazio">Nenhuma atividade com saldo livre para ceder.</p>'
  else {
    h += `<div class="card"><div class="table-wrap"><table class="rm-tab larga"><thead><tr><th>Atividade</th><th>Fonte</th>
      <th>Procedência</th><th class="n">Livre ${remQ('consumido')}</th><th class="n">Ceder (US$) ${remQ('pedido_ceder')}</th></tr></thead><tbody>`
    for (const a of ativOrd) for (const f of porAtv[a.atividade_id]) {
      const v = F.ceder[f.fonte_id] || ''
      h += `<tr><td><span class="rm-cod">${esc(a.codigo)}</span></td><td>${esc(REM_FONTE[f.tipo] || f.tipo)}</td>
        <td class="rm-sub">${remProcedencia(f)}</td><td class="n">${usd2(f.livre_usd)}</td>
        <td class="n"><input class="form-control rm-in" type="number" min="0" step="0.01" value="${v}"
          aria-label="Ceder da fonte ${esc(REM_FONTE[f.tipo] || f.tipo)} de ${esc(a.codigo)}" oninput="remCeder('${f.fonte_id}', this.value)"></td></tr>`
    }
    h += '</tbody></table></div></div>'
  }
  h += `<h3>2. Para onde vai ${remQ('pedido_destino')}</h3><p class="rm-ajuda">A soma dos destinos precisa ser igual ao total cedido. Uma atividade não pode ceder e receber no mesmo pedido.</p>`
  F.destinos.forEach((d, i) => {
    h += `<div class="rm-dest">
      <select class="form-control rm-dest-atv" aria-label="Atividade de destino ${i + 1}" onchange="remDestino(${i}, 'atividade_id', this.value)">
        <option value="">Selecione a atividade de destino…</option>
        ${REM.ativs.map(a => `<option value="${a.atividade_id}" ${a.atividade_id === d.atividade_id ? 'selected' : ''}>${esc(a.codigo)} — ${esc(a.nome_pt || '')}${Number(a.deficit_usd) > 0 ? ' (déficit ' + usd2(a.deficit_usd) + ')' : ''}</option>`).join('')}
      </select>
      <input class="form-control rm-in rm-dest-valor" type="number" min="0" step="0.01" value="${d.valor || ''}" aria-label="Valor do destino ${i + 1} (US$)" oninput="remDestino(${i}, 'valor', this.value)">
      <button type="button" class="btn btn-ghost btn-sm" onclick="remTirarDestino(${i})" title="Remover destino" aria-label="Remover destino ${i + 1}">${rmIc('x', 'p')}</button></div>`
  })
  h += `<div><button type="button" class="btn btn-secondary btn-sm" onclick="REM.form.destinos.push({atividade_id:'',valor:0});remRender()">${rmIc('mais', 'p')}Outro destino</button></div>
    <div class="rm-tot-b" id="rm-tot" aria-live="polite">${remTotaisHTML()}</div>
    <h3>3. Justificativa ${remQ('pedido_justificativa')}</h3>
    <textarea class="form-control" rows="4" aria-label="Justificativa" oninput="REM.form.justificativa=this.value" placeholder="Por que remanejar, o que deixa de ser feito na origem e o que o recurso viabiliza no destino.">${esc(F.justificativa)}</textarea>
    <div class="rm-acoes" style="margin-top:6px">
      <button type="button" class="btn btn-primary" onclick="remSalvarRascunho()">${REM.editando ? 'Salvar alterações' : 'Salvar rascunho'}</button>
      <button type="button" class="btn btn-ghost" onclick="REM.form=null;REM.editando=null;remAba('pedidos')">Descartar</button>
    </div>
    <p class="rm-sub" style="margin:0">${remQ('rascunho')} Salvar não compromete saldo. O valor só fica reservado depois que o pedido é enviado (com sua senha) a partir da aba Pedidos.</p>
  </div>`
  return h
}
// Totais do formulário (atualizados sem redesenhar a tela, para não perder o foco)
function remTotais() {
  const F = REM.form
  const ced = num(Object.values(F.ceder).reduce((s, v) => s + Number(v || 0), 0))
  const des = num(F.destinos.reduce((s, d) => s + Number(d.valor || 0), 0))
  return { ced, des, dif: num(ced - des) }
}
function remTotaisHTML() {
  const { ced, des, dif } = remTotais()
  return `<span>Cedido: <b>${usd2(ced)}</b></span><span>Destinado: <b>${usd2(des)}</b></span>
    <span>Diferença: <b class="${dif === 0 && ced > 0 ? 'ok' : 'erro'}">${usd2(dif)}</b></span>`
}
function remAtualizarTotais() {
  const el = document.getElementById('rm-tot')
  if (el) el.innerHTML = remTotaisHTML()
}
function remCeder(fonteId, v) {
  const n = num(v)
  if (n > 0) REM.form.ceder[fonteId] = n; else delete REM.form.ceder[fonteId]
  remAtualizarTotais()
}
function remDestino(i, campo, v) {
  REM.form.destinos[i][campo] = campo === 'valor' ? num(v) : v
  remAtualizarTotais()
}
function remTirarDestino(i) {
  REM.form.destinos.splice(i, 1)
  if (!REM.form.destinos.length) REM.form.destinos.push({ atividade_id: '', valor: 0 })
  remRender()
}
async function remSalvarRascunho() {
  const F = REM.form
  const origem = {}
  const alocacoes = []
  for (const [fonteId, v] of Object.entries(F.ceder)) {
    const f = REM.fontes.find(x => x.fonte_id === fonteId)
    if (!f || !(v > 0)) continue
    origem[f.atividade_id] = num((origem[f.atividade_id] || 0) + v)
    alocacoes.push({ atividade_id: f.atividade_id, fonte_id: fonteId, valor_usd: v })
  }
  const destinos = F.destinos.filter(d => d.atividade_id && d.valor > 0)
  const dup = destinos.find(d => origem[d.atividade_id] || destinos.filter(x => x.atividade_id === d.atividade_id).length > 1)
  if (dup) { toast('Uma atividade aparece duas vezes (ou cede e recebe ao mesmo tempo).', 'error'); return }
  if (!alocacoes.length && !destinos.length) { toast('Informe ao menos uma origem e um destino.', 'error'); return }
  const itens = [
    ...Object.entries(origem).map(([atividade_id, v]) => ({ atividade_id, valor_usd: -v })),
    ...destinos.map(d => ({ atividade_id: d.atividade_id, valor_usd: d.valor })),
  ]
  const dados = { justificativa: F.justificativa || '', itens, alocacoes }
  if (!REM.editando && F.cobertura) Object.assign(dados, { tipo: 'cobertura_contrato', contrato_id: F.cobertura.contrato_id })
  if (!REM.editando) dados.uuid_cliente = REM.uuidNovo || (REM.uuidNovo = crypto.randomUUID())
  const { data, error } = await db.rpc('fn_rem_salvar', { p_id: REM.editando, p_dados: dados })
  if (error) { toast(remMsg(error.message), 'error'); return }
  const { dif, ced } = remTotais()
  if (dif !== 0 || !ced || !destinos.length) toast('Rascunho salvo, mas a soma ainda não fecha — ajuste antes de enviar.', 'warning')
  else toast('Rascunho salvo.', 'success')
  REM.form = null; REM.editando = null; REM.uuidNovo = null
  REM.aba = 'pedidos'; REM.filtro = 'todos'
  await remCarregar()
  remAbrirPedido(data)
}

// ── 4. Signatários (titulares) ─────────────────────────────────────────
function remTitularesHTML() {
  const sa = appState.perfil === 'super_admin'
  let h = `<p class="rm-sub" style="font-size:13px;color:var(--txt-2);margin:0;line-height:1.55">${remQ('signatarios')} Cada cargo tem um titular nominal, sem substituto.
    Quem ocupa um cargo não pode ser o único responsável pela atividade que cede. A liberação da origem é assinada pelo
    responsável cadastrado na atividade (não pelo substituto).</p>
    <div class="card"><div class="table-wrap"><table class="rm-tab larga"><thead><tr><th>Etapa</th><th>Cargo</th><th>Titular</th><th>Desde</th><th>Ato</th>${sa ? '<th></th>' : ''}</tr></thead><tbody>`
  for (const c of REM.cargos) {
    const t = REM.titulares.find(x => x.cargo === c.codigo)
    h += `<tr><td class="mono">${c.ordem}</td><td><b>${esc(c.nome)}</b>${c.perfis_exigidos ? `<div class="rm-sub">perfil: ${esc(c.perfis_exigidos.join(', '))}</div>` : ''}</td>
      <td>${t ? esc(nomeU(t.usuario_id)) : `<span class="badge badge-erro">${rmIc('alerta', 'p')}sem titular</span>`}</td>
      <td>${t ? dataHora(t.vigencia_inicio) : '—'}</td><td>${t ? esc(t.ato) : '—'}</td>
      ${sa ? `<td><button type="button" class="btn btn-secondary btn-sm" onclick="remDesignar('${c.codigo}')">Designar</button></td>` : ''}</tr>`
    if (c.ordem === 1) h += `<tr><td class="mono">2</td><td><b>Responsável pela atividade de origem</b></td><td colspan="${sa ? 4 : 3}" class="rm-sub">Definido no cadastro de cada atividade (Atividades › Responsáveis).</td></tr>`
  }
  h += '</tbody></table></div></div>'
  if (sa) h += `<div id="rm-designar"></div>`
  return h
}
function remDesignar(cargo) {
  const c = REM.cargos.find(x => x.codigo === cargo)
  const ocupados = new Set(REM.titulares.filter(t => t.cargo !== cargo).map(t => t.usuario_id))
  const cand = Object.values(REM.usuarios)
    .filter(u => u.ativo && !ocupados.has(u.id) && (!c.perfis_exigidos || c.perfis_exigidos.includes(u.perfil)))
    .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo))
  document.getElementById('rm-designar').innerHTML = `<div class="card"><div class="rm-designar">
    <b>Designar titular · ${esc(c.nome)}</b>
    <div class="rm-grid2">
      <div class="form-group"><label class="form-label" for="rm-dg-u">Pessoa</label><select class="form-control" id="rm-dg-u">
        <option value="">(deixar o cargo vago)</option>${cand.map(u => `<option value="${u.id}">${esc(u.nome_completo)} · ${esc(u.perfil)}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label" for="rm-dg-ato">Ato de designação (portaria, SEI…)</label><input class="form-control" id="rm-dg-ato"></div>
    </div>
    <div class="rm-acoes"><button type="button" class="btn btn-primary" onclick="remConfirmarDesignacao('${cargo}')">Confirmar</button>
      <button type="button" class="btn btn-ghost" onclick="document.getElementById('rm-designar').innerHTML=''">Cancelar</button></div>
    <p class="rm-sub" style="margin:0">A designação anterior é encerrada e fica no histórico. Pedidos em andamento passam a aguardar o novo titular.</p>
  </div></div>`
  document.getElementById('rm-dg-u').focus()
}
async function remConfirmarDesignacao(cargo) {
  const u = document.getElementById('rm-dg-u').value || null
  const ato = document.getElementById('rm-dg-ato').value.trim()
  if (!ato) { toast('Informe o ato da designação.', 'error'); return }
  const { error } = await db.rpc('fn_rem_designar_titular', { p_cargo: cargo, p_usuario_id: u, p_ato: ato })
  if (error) { toast(remMsg(error.message), 'error'); return }
  toast('Titular atualizado.', 'success')
  await remCarregar()
}

// ── Pedido (modal) ─────────────────────────────────────────────────────
async function remAbrirPedido(id) {
  const [p, it, al, et, as, hi, hs] = await Promise.all([
    db.from('remanejamentos').select('*').eq('id', id).maybeSingle(),
    db.from('remanejamento_itens').select('id, atividade_id, valor_usd').eq('remanejamento_id', id).eq('ativo', true),
    db.from('remanejamento_alocacoes').select('item_id, fonte_id, valor_usd').eq('remanejamento_id', id).eq('ativo', true),
    db.from('remanejamento_etapas').select('*').eq('remanejamento_id', id).order('ordem'),
    db.from('vw_remanejamento_assinaturas').select('*').eq('remanejamento_id', id).order('criado_em'),
    db.from('remanejamento_historico').select('*').eq('remanejamento_id', id).order('criado_em'),
    db.rpc('fn_rem_hash', { p_id: id }),
  ])
  if (p.error || !p.data) { toast('Pedido não encontrado.', 'error'); return }
  const P = p.data
  REM.detalhe = { P, itens: it.data || [], alocs: al.data || [], etapas: (et.data || []).filter(e => e.versao === P.versao),
                  assin: as.data || [], hist: hi.data || [], hash: hs.data }
  const D = REM.detalhe
  const atv = idA => REM.ativs.find(a => a.atividade_id === idA)
  const [st, cls] = REM_STATUS[P.status] || [P.status, 'badge-cinza']
  document.getElementById('rm-mp-titulo').innerHTML = `${esc(P.numero)} <span class="badge ${cls}">${st}</span>${remMinhaVez(P) ? ' <span class="badge badge-ouro">sua vez</span>' : ''}`
  document.getElementById('rm-mp-sub').textContent = `Versão ${P.versao} · criado por ${nomeU(P.criado_por)} em ${dataHora(P.criado_em)}`

  const itensH = D.itens.slice().sort((a, b) => a.valor_usd - b.valor_usd).map(i => {
    const a = atv(i.atividade_id)
    const fontes = D.alocs.filter(x => x.item_id === i.id).map(x => {
      const f = REM.fontes.find(y => y.fonte_id === x.fonte_id)
      return `<div class="rm-sub">${usd2(x.valor_usd)} de ${esc(REM_FONTE[f?.tipo] || 'fonte')}${f ? ' — ' + remProcedencia(f) : ''}</div>`
    }).join('')
    return `<div class="rm-mov"><div style="min-width:0"><div><span class="rm-cod">${esc(a?.codigo || '?')}</span> ${esc(a?.nome_pt || '')}</div>${fontes}</div>
      <span class="v ${i.valor_usd < 0 ? 'rm-neg' : 'rm-pos'}">${i.valor_usd < 0 ? 'cede ' : 'recebe '}${usd2(Math.abs(i.valor_usd))}</span></div>`
  }).join('')

  const cadeia = D.etapas.length ? D.etapas.map(e => {
    const ok = !!e.assinatura_id
    const atual = P.status === 'em_aprovacao' && P.etapa_atual === e.ordem
    const a = D.assin.find(x => x.id === e.assinatura_id)
    const nomeEt = REM_PAPEL[e.papel] + (e.atividade_id ? ' — ' + esc(atv(e.atividade_id)?.codigo || '') : '')
    const quem = ok ? `Aprovado por ${esc(a?.nome_completo || '')} em ${dataHora(a?.criado_em)}`
      : `${atual ? 'Aguardando' : 'Pendente'}: ${remSignatarios(e).map(nomeU).map(esc).join(', ') || '<b>sem signatário</b>'}`
    return `<li class="${ok ? 'ok' : atual ? 'atual' : ''}"><div class="rm-bola">${ok ? rmIc('check', 'p') : e.ordem}</div><div><b>${nomeEt}</b><div class="rm-sub">${quem}</div></div></li>`
  }).join('') : '<li><div class="rm-bola">–</div><div class="rm-sub">A cadeia é montada quando o pedido é enviado.</div></li>'

  const hist = D.hist.map(h => `<div>${dataHora(h.criado_em)} · <b>${esc(nomeU(h.usuario_id))}</b> — ${esc(REM_EVENTO[h.evento] || h.evento)}${h.etapa_ordem ? ' (etapa ' + h.etapa_ordem + ')' : ''}${h.motivo ? ': ' + esc(h.motivo) : ''}</div>`).join('')

  const orig = P.estorno_de && REM.pedidos.find(x => x.id === P.estorno_de)
  const estornos = REM.pedidos.filter(x => x.estorno_de === P.id && x.status !== 'cancelado' && x.status !== 'recusado')
  const vinc = (x, txt) => `<a href="#" onclick="event.preventDefault();remAbrirPedido('${x.id}')">${esc(x.numero)}</a>${txt}`
  document.getElementById('rm-mp-corpo').innerHTML = `
    ${orig ? `<div class="rm-aviso">${remQ('estorno')} <b>Estorno de ${vinc(orig, '')}.</b> Devolve o que foi recebido às fontes de onde saiu; itens e fontes espelham o original e não se editam.</div>` : ''}
    ${estornos.length ? `<div class="rm-aviso">Estorno: ${estornos.map(x => vinc(x, ' (' + esc((REM_STATUS[x.status] || [x.status])[0]) + ')')).join(', ')}</div>` : ''}
    ${P.motivo_encerramento ? `<div class="rm-aviso"><b>Motivo do encerramento:</b> ${esc(P.motivo_encerramento)}</div>` : ''}
    <p class="rm-just"><b>Justificativa:</b> ${esc(P.justificativa)}</p>
    <div class="rm-grid2">
      <div><h4>Movimentação</h4>${itensH || '<p class="rm-sub">Sem itens.</p>'}</div>
      <div><h4>Cadeia de aprovação ${remQ('cadeia')} ${remQ('decisoes')}</h4><ol class="rm-cadeia">${cadeia}</ol></div>
    </div>
    <div><h4>Histórico</h4><div class="rm-hist">${hist || '<div class="rm-sub">—</div>'}</div></div>
    <p class="rm-hash" title="SHA-256 do conteúdo do pedido">${remQ('hash')} Impressão digital do documento (SHA-256): ${esc(D.hash || '')}</p>`

  const eu = appState.usuario.id
  const ac = []
  const editar = P.estorno_de ? 'remEditarJustificativa()' : 'remEditar()'
  if (P.status === 'rascunho' && (P.criado_por === eu || appState.perfil === 'super_admin'))
    ac.push(`<button type="button" class="btn btn-secondary" onclick="${editar}">${P.estorno_de ? 'Editar justificativa' : 'Editar'}</button>`)
  if (P.status === 'em_aprovacao' && P.etapa_atual === 1 && (P.criado_por === eu || appState.perfil === 'super_admin'))
    ac.push(`<button type="button" class="btn btn-secondary" onclick="${editar}">Editar (abre nova versão)</button>`)
  if (P.status === 'efetivado' && !P.estorno_de && !estornos.length && podeMontar())
    ac.push(`<button type="button" class="btn btn-secondary" onclick="remPedirEstorno()">${rmIc('volta', 'p')}Pedir estorno</button>`)
  if (remMinhaVez(P)) {
    if (P.status === 'rascunho') {
      ac.push(`<button type="button" class="btn btn-ghost" onclick="remPedirAssinatura('cancelar')">Cancelar pedido</button>`)
      if (remTitular('coordenacao_solicitante') === eu) ac.push(`<button type="button" class="btn btn-primary" onclick="remPedirAssinatura('aprovar')">Enviar para aprovação</button>`)
    } else if (P.etapa_atual === 1) {
      ac.push(`<button class="btn btn-ghost" onclick="remPedirAssinatura('cancelar')">Cancelar pedido</button>`)
      ac.push(`<button type="button" class="btn btn-primary" onclick="remPedirAssinatura('aprovar')">Reenviar sem alterar</button>`)
    } else {
      ac.push(`<button type="button" class="btn btn-danger" onclick="remPedirAssinatura('recusar')">Recusar</button>`)
      ac.push(`<button type="button" class="btn btn-secondary" onclick="remPedirAssinatura('devolver')">${rmIc('volta', 'p')}Devolver à etapa anterior</button>`)
      ac.push(`<button type="button" class="btn btn-primary" onclick="remPedirAssinatura('aprovar')">${rmIc('check', 'p')}Aprovar e assinar</button>`)
    }
  }
  ac.push(`<button type="button" class="btn btn-secondary" onclick="remRelatorioA4()">${rmIc('livro', 'p')}Relatório A4</button>`)
  ac.push(`<button type="button" class="btn btn-ghost" onclick="remFecharPedido()">Fechar</button>`)
  document.getElementById('rm-mp-acoes').innerHTML = ac.join('')
  document.getElementById('rm-mp-corpo').scrollTop = 0
  rmAbrir('rm-modal-pedido')
}
function remRelatorioA4() {
  relAbrirPedidoA4(REM.detalhe, {
    atv: id => REM.ativs.find(a => a.atividade_id === id),
    fonte: id => REM.fontes.find(f => f.fonte_id === id),
    procedencia: f => remProcedencia(f).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
    nome: nomeU,
    evento: e => REM_EVENTO[e] || e,
    pedido: id => REM.pedidos.find(p => p.id === id),
  })
}
function remFecharPedido() {
  rmFechar('rm-modal-pedido')
  REM.detalhe = null
  if (location.search.includes('id=')) history.replaceState(null, '', location.pathname)
}
// Estorno: o banco monta o espelho; aqui só se pede a justificativa
function remCaixaTexto(titulo, ajuda, rotulo, acao) {
  const corpo = document.getElementById('rm-mp-corpo')
  if (document.getElementById('rm-caixa')) return
  corpo.insertAdjacentHTML('beforeend', `<div id="rm-caixa" class="rm-aviso">
    <b>${titulo}</b><p class="rm-sub" style="margin:4px 0 6px">${ajuda}</p>
    <textarea class="form-control" id="rm-caixa-txt" rows="3" aria-label="${esc(rotulo)}"></textarea>
    <div class="rm-acoes" style="margin-top:8px"><button type="button" class="btn btn-primary btn-sm" onclick="${acao}">${rotulo}</button>
    <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('rm-caixa').remove()">Voltar</button></div></div>`)
  document.getElementById('rm-caixa-txt').focus()
}
function remPedirEstorno() {
  remCaixaTexto('Pedir estorno deste remanejamento ' + remQ('estorno'),
    'Cria um rascunho que devolve às atividades de origem tudo o que foi recebido, para as mesmas fontes de onde saiu. ' +
    'Passa pela mesma cadeia de assinaturas. Só é possível se o destino ainda não usou nem repassou o valor.',
    'Criar rascunho do estorno', 'remConfirmarEstorno()')
}
async function remConfirmarEstorno() {
  const j = (document.getElementById('rm-caixa-txt').value || '').trim()
  if (j.length < 15) { toast('Escreva a justificativa do estorno (mínimo 15 caracteres).', 'error'); return }
  const { data, error } = await db.rpc('fn_rem_criar_estorno', { p_rem: REM.detalhe.P.id, p_justificativa: j })
  if (error) { toast(remMsg(error.message), 'error'); return }
  toast('Rascunho do estorno criado. Confira e envie para aprovação.', 'success')
  await remCarregar()
  remAbrirPedido(data)
}
function remEditarJustificativa() {
  remCaixaTexto('Editar justificativa do estorno', 'Itens e fontes do estorno espelham o original e não mudam.',
    'Salvar justificativa', 'remSalvarJustificativa()')
  document.getElementById('rm-caixa-txt').value = REM.detalhe.P.justificativa === '(rascunho)' ? '' : REM.detalhe.P.justificativa
}
async function remSalvarJustificativa() {
  const j = (document.getElementById('rm-caixa-txt').value || '').trim()
  const { error } = await db.rpc('fn_rem_salvar', { p_id: REM.detalhe.P.id, p_dados: { justificativa: j } })
  if (error) { toast(remMsg(error.message), 'error'); return }
  toast('Justificativa salva.', 'success')
  await remCarregar()
  remAbrirPedido(REM.detalhe.P.id)
}
function remEditar() {
  const D = REM.detalhe
  remNovoForm(D.P, D.itens, D.alocs)
  remFecharPedido()
  REM.aba = 'novo'
  remRender()
}

// ── Assinatura (senha conferida no servidor) ───────────────────────────
function remPedirAssinatura(decisao) {
  const D = REM.detalhe
  REM.assinar = { decisao }
  const textos = {
    aprovar: D.P.status === 'rascunho'
      ? 'Você envia o pedido para a cadeia de aprovação. O valor cedido fica reservado nas fontes de origem até a decisão final.'
      : 'Você aprova esta etapa. O pedido segue para a próxima etapa, que será avisada por e-mail.',
    devolver: 'O pedido volta para a etapa anterior, que será avisada por e-mail com o seu motivo. A assinatura dela é reaberta.',
    recusar: 'O pedido é encerrado e a reserva de saldo é liberada. O solicitante e quem já assinou serão avisados.',
    cancelar: 'O pedido é cancelado e a reserva, se houver, é liberada.',
  }
  const titulos = { aprovar: D.P.status === 'rascunho' ? 'Enviar para aprovação' : 'Aprovar e assinar', devolver: 'Devolver', recusar: 'Recusar', cancelar: 'Cancelar pedido' }
  document.getElementById('rm-as-titulo').textContent = `${titulos[decisao]} — ${D.P.numero}`
  document.getElementById('rm-as-texto').textContent = textos[decisao]
  const comMotivo = decisao !== 'aprovar'
  document.getElementById('rm-as-motivo-grp').hidden = false
  document.getElementById('rm-as-motivo-lbl').textContent = comMotivo ? 'Motivo (obrigatório)' : 'Observação (opcional)'
  document.getElementById('rm-as-motivo').value = ''
  document.getElementById('rm-as-senha').value = ''
  document.getElementById('rm-as-erro').hidden = true
  document.getElementById('rm-as-hash').textContent = 'Você assina este conteúdo: ' + (D.hash || '')
  const b = document.getElementById('rm-as-ok'); b.disabled = false; b.textContent = titulos[decisao]
  b.className = 'btn ' + (decisao === 'recusar' ? 'btn-danger' : 'btn-primary')
  rmAbrir('rm-modal-assinar', comMotivo ? 'rm-as-motivo' : 'rm-as-senha')
}
function remFecharAssinar() {
  rmFechar('rm-modal-assinar')
  document.getElementById('rm-as-senha').value = ''
  REM.assinar = null
}
async function remConfirmarAssinatura() {
  const D = REM.detalhe, decisao = REM.assinar?.decisao
  const motivo = document.getElementById('rm-as-motivo').value.trim()
  const senha = document.getElementById('rm-as-senha').value
  const erro = m => { const e = document.getElementById('rm-as-erro'); e.textContent = m; e.hidden = false }
  if (decisao !== 'aprovar' && !motivo) { erro('Informe o motivo.'); return }
  if (!senha) { erro('Digite sua senha.'); return }
  const b = document.getElementById('rm-as-ok'); b.disabled = true; b.textContent = 'Conferindo…'
  try {
    const { data: { session } } = await db.auth.getSession()
    const r = await fetch(SUPABASE_URL + '/functions/v1/assinar-remanejamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || ''), apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ acao: 'assinar', remanejamento_id: D.P.id, decisao, motivo: motivo || null, hash: D.hash, senha }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) {
      document.getElementById('rm-as-senha').value = ''
      erro(remMsg(j.erro || ('Falha (' + r.status + ')')) +
        (j.bloqueado_ate ? ' Liberada às ' + new Date(j.bloqueado_ate).toLocaleTimeString('pt-BR', { timeStyle: 'short' }) + '.' : ''))
      b.disabled = false; b.textContent = 'Tentar de novo'
      return
    }
    remFecharAssinar()
    const st = j.resultado?.status
    toast(st === 'efetivado' ? 'Remanejamento efetivado no razão.' : st === 'recusado' ? 'Pedido recusado.' :
          st === 'cancelado' ? 'Pedido cancelado.' : decisao === 'devolver' ? 'Pedido devolvido à etapa anterior.' : 'Assinatura registrada.', 'success')
    if (j.emails?.falhas) toast(`${j.emails.falhas} e-mail(s) não saíram agora; serão reenviados automaticamente.`, 'warning')
    await remCarregar()
    remAbrirPedido(D.P.id)
  } catch (e) {
    erro('Sem conexão com o servidor. Nada foi assinado.')
    b.disabled = false; b.textContent = 'Tentar de novo'
  }
}

// Mensagens do banco → texto para a pessoa (tira o prefixo técnico)
function remMsg(m) {
  if (!m) return 'Erro desconhecido.'
  if (REM_ERRO[m]) return REM_ERRO[m]
  if (/Could not find the function public\.fn_rem_salvar/i.test(m))
    return 'A função de rascunho ainda não foi instalada no banco (arquivo 20261003_rem_03g_sql_editor.sql).'
  return m.replace(/^[A-Z_]+:\s*/, '')
}
