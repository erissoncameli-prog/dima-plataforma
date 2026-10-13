// Licitação do TDR em rodadas — tela (pages/tdrs.html). Regras no banco: migração 20261013_licitacao_rodadas.
// Cada envio para licitação/contratação direta é uma rodada (tdr_licitacao_rodadas): edital, prazo com
// prorrogação (tdr_licitacao_prorrogacoes), lista curta (tdr_licitacao_empresas) e resultado sem valores.
// A tela só monta e pede: fn_lic_enviar / fn_lic_editar / fn_lic_prorrogar / fn_lic_resultado / fn_lic_relancar.
// Quem opera = fn_lic_pode (coordenação, super_admin, responsável/substituto da atividade).
// Usa globais da página: db, esc, tdIc, fmtData, tdrAtual, todosTDRs, pedirSenhaTDR, fecharModal,
// abrirTDR, carregar, abrirCancelamento, msgCanc, toast, SUPABASE_URL, SUPABASE_ANON_KEY, appState.

const LIC_CLASSES = { 'Pregão Eletrônico': 'aberta', 'Concorrência': 'aberta', 'Carta-Convite': 'convite',
  'Cotação/Shopping (ONU)': 'cotacao', 'Dispensa de Licitação': 'dispensa', 'Inexigibilidade': 'inexigibilidade' }
const licClasse = m => LIC_CLASSES[m] || 'outra'
// edital/prazo: obr | opc | nao · lista: livre | obr | uma
const LIC_REGRA = {
  aberta: { edital: 'obr', prazo: 'obr', lista: 'livre' },
  convite: { edital: 'opc', prazo: 'obr', lista: 'obr' },
  cotacao: { edital: 'opc', prazo: 'obr', lista: 'obr' },
  dispensa: { edital: 'opc', prazo: 'opc', lista: 'obr' },
  inexigibilidade: { edital: 'nao', prazo: 'nao', lista: 'uma' },
  outra: { edital: 'opc', prazo: 'obr', lista: 'livre' },
}
const LIC_FUND = { exclusivo: 'Fornecedor exclusivo', notoria: 'Notória especialização', outro: 'Outro' }
const LIC_SIT = {
  aberta: 'Aberta', com_propostas: 'Com propostas', deserta: 'Deserta', fracassada: 'Fracassada',
  sem_proposta: 'Sem proposta', cancelada: 'Encerrada (TDR cancelado)',
}
const licSitTexto = (r) => r.situacao === 'deserta' && ['dispensa', 'cotacao'].includes(licClasse(r.modalidade)) ? 'Sem cotações' : (LIC_SIT[r.situacao] || r.situacao)
const LIC_SEM_EXITO = ['deserta', 'fracassada', 'sem_proposta']

let licPorTdr = {}            // cartões: rodada que pede atenção por TDR
let licEst = { rodadas: [], empresas: {}, prorr: {}, pode: false }   // TDR aberto
let licForm = { modo: 'novo', rodada: null, empresas: [] }
let licFornDir = null

const licDtHr = ts => ts ? new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco', dateStyle: 'short', timeStyle: 'short' }) : '—'
const licDias = ts => Math.ceil((new Date(ts) - Date.now()) / 864e5)
const licIso = (d, h) => d ? `${d}T${(h || '17:00')}:00-05:00` : null    // hora do Acre
const licUrlOk = u => /^https?:\/\/[^\s/]+\.[^\s]+/i.test(u || '')
// Endereço colado sem protocolo (www.site.gov.br/…) ganha https://
const licUrlNorm = u => { u = (u || '').trim(); return u && !/^[a-z]+:/i.test(u) && /^[^\s/]+\.[^\s]+$/.test(u) ? 'https://' + u : u }
// Mensagem de erro sempre visível: o corpo da janela rola, então leva a mensagem (e o campo) para a vista.
function licMostrarErro (id, m, campo) {
  const e = document.getElementById(id); if (!e) return
  e.textContent = m || ''; e.hidden = !m
  document.querySelectorAll('.td-campo-erro').forEach(x => { x.classList.remove('td-campo-erro'); x.removeAttribute('aria-invalid') })
  if (!m) return
  e.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  const c = campo && document.getElementById(campo)
  if (c) { c.classList.add('td-campo-erro'); c.setAttribute('aria-invalid', 'true'); c.focus({ preventScroll: false }) }
}
const licAtiva = r => r && (r.situacao === 'aberta' || (LIC_SEM_EXITO.includes(r.situacao) && !r.medida))

// ── lista (cartões) ──────────────────────────────────────────────────────
async function licCarregarLista () {
  const { data, error } = await db.from('tdr_licitacao_rodadas')
    .select('id,tdr_id,rodada,modalidade,situacao,prazo_em,medida')
    .or('situacao.eq.aberta,and(medida.is.null,situacao.in.(deserta,fracassada,sem_proposta))')
  if (error) { console.error('[licitação]', error.message); licPorTdr = {}; return }
  licPorTdr = Object.fromEntries((data || []).map(r => [r.tdr_id, r]))
}
function licSelo (t) {
  const r = licPorTdr[t.id]; if (!r) return ''
  if (r.situacao !== 'aberta') return `<span class="td-selo td-lic-ruim" title="${esc(r.rodada + 'ª rodada · ' + r.modalidade)}">Licitação ${esc(licSitTexto(r).toLowerCase())} · definir medida</span>`
  if (!r.prazo_em) return `<span class="td-selo td-lic-aberta">${licClasse(r.modalidade) === 'inexigibilidade' || licClasse(r.modalidade) === 'dispensa' ? 'Contratação direta em andamento' : 'Licitação sem prazo informado'}</span>`
  const d = licDias(r.prazo_em)
  if (new Date(r.prazo_em) <= new Date()) return `<span class="td-selo td-lic-ruim">Prazo encerrado · registrar resultado</span>`
  if (d <= 2) return `<span class="td-selo td-lic-vence">Propostas até ${esc(licDtHr(r.prazo_em))}</span>`
  return `<span class="td-selo td-lic-aberta">Propostas até ${esc(fmtData(r.prazo_em))} · ${d} dias</span>`
}

// ── TDR aberto ───────────────────────────────────────────────────────────
async function licCarregarTDR (tdrId) {
  licEst = { rodadas: [], empresas: {}, prorr: {}, pode: false }
  const [{ data: rods }, pode] = await Promise.all([
    db.from('tdr_licitacao_rodadas').select('*,abriu:usuarios!tdr_licitacao_rodadas_aberta_por_fkey(nome_completo),registrou:usuarios!tdr_licitacao_rodadas_resultado_por_fkey(nome_completo)')
      .eq('tdr_id', tdrId).order('rodada'),
    db.rpc('fn_lic_pode', { p_tdr: tdrId }),
  ])
  licEst.rodadas = rods || []
  licEst.pode = !!(pode && pode.data)
  const ids = licEst.rodadas.map(r => r.id)
  if (ids.length) {
    const [{ data: emps }, { data: pr }] = await Promise.all([
      db.from('tdr_licitacao_empresas').select('*').in('rodada_id', ids).eq('ativo', true).order('criado_em'),
      db.from('tdr_licitacao_prorrogacoes').select('*,quem:usuarios!tdr_licitacao_prorrogacoes_registrado_por_fkey(nome_completo)').in('rodada_id', ids).order('criado_em'),
    ])
    ;(emps || []).forEach(e => { (licEst.empresas[e.rodada_id] = licEst.empresas[e.rodada_id] || []).push(e) })
    ;(pr || []).forEach(p => { (licEst.prorr[p.rodada_id] = licEst.prorr[p.rodada_id] || []).push(p) })
  }
}
const licAtual = () => licEst.rodadas.filter(licAtiva).slice(-1)[0] || null

function licTabelaEmpresas (lista, comProposta) {
  if (!lista || !lista.length) return '<div class="td-peq">Nenhuma empresa na lista curta.</div>'
  return `<div class="td-lic-tw"><table class="td-lic-tb"><thead><tr><th>Empresa</th><th>Contato</th><th>Telefone</th><th>E-mail</th>${comProposta ? '<th>Proposta</th>' : ''}</tr></thead><tbody>${lista.map(e => `<tr>
    <td><b>${esc(e.empresa)}</b>${e.convidada ? '' : ' <span class="td-peq">(fora da lista)</span>'}</td>
    <td>${esc(e.contato || '—')}</td><td>${esc(e.telefone || '—')}</td>
    <td>${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : '—'}</td>
    ${comProposta ? `<td>${e.apresentou_proposta ? '<span class="td-selo td-c-ok">Apresentou</span>' : '<span class="td-peq">não</span>'}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
}

function licBloco (t) {
  const R = licEst.rodadas
  if (!R.length) return ''
  const atual = licAtual()
  const anteriores = R.filter(r => r !== atual)
  let h = ''
  if (atual) {
    const r = atual, cl = licClasse(r.modalidade), emps = licEst.empresas[r.id] || [], pr = licEst.prorr[r.id] || []
    const venceu = r.prazo_em && new Date(r.prazo_em) <= new Date()
    let estado
    if (r.situacao !== 'aberta') estado = `<span class="td-selo td-lic-ruim">${esc(licSitTexto(r))} · definir medida</span>`
    else if (!r.prazo_em) estado = cl === 'inexigibilidade' ? '<span class="td-selo td-lic-aberta">Aguardando a proposta</span>'
      : `<span class="td-selo td-lic-aberta">${cl === 'dispensa' ? 'Aguardando as cotações (sem prazo)' : 'Prazo não informado'}</span>`
    else if (venceu) estado = `<span class="td-selo td-lic-ruim">Prazo encerrado em ${esc(licDtHr(r.prazo_em))} · registrar resultado</span>`
    else estado = `<span class="td-selo ${licDias(r.prazo_em) <= 2 ? 'td-lic-vence' : 'td-lic-aberta'}">Propostas até ${esc(licDtHr(r.prazo_em))} · ${licDias(r.prazo_em)} dia(s)</span>`
    const dados = [
      r.numero_processo ? `<span>Processo <b class="td-mono">${esc(r.numero_processo)}</b></span>` : '',
      r.dt_abertura ? `<span>Aberta em <b>${fmtData(r.dt_abertura)}</b></span>` : '',
      r.edital_url && licUrlOk(r.edital_url) ? `<a href="${esc(r.edital_url)}" target="_blank" rel="noopener noreferrer">${tdIc('link')}${cl === 'dispensa' || cl === 'cotacao' ? 'Aviso / pedido de cotação' : 'Edital publicado'}</a>` : (cl === 'aberta' ? '<span class="td-lic-falta">Sem link do edital</span>' : ''),
      r.prazo_original && r.prazo_em && r.prazo_original !== r.prazo_em ? `<span>Prazo original ${esc(licDtHr(r.prazo_original))}</span>` : '',
    ].filter(Boolean).join('')
    const fund = r.fundamento_tipo || r.fundamento || r.justificativa ? `<div class="td-lic-fund">
        ${r.fundamento_tipo ? `<b>${esc(LIC_FUND[r.fundamento_tipo] || r.fundamento_tipo)}</b>` : ''}${r.fundamento ? `${r.fundamento_tipo ? ' · ' : '<b>Fundamento:</b> '}${esc(r.fundamento)}` : ''}
        ${r.justificativa ? `<div>${esc(r.justificativa)}</div>` : ''}</div>` : ''
    const prorr = pr.length ? `<div class="td-lic-sub">Prorrogações</div><ul class="td-lic-hist">${pr.map(p => `<li>${esc(licDtHr(p.prazo_anterior))} → <b>${esc(licDtHr(p.prazo_novo))}</b> · ${esc(p.motivo)}
        ${p.aviso_url && licUrlOk(p.aviso_url) ? ` · <a href="${esc(p.aviso_url)}" target="_blank" rel="noopener noreferrer">aviso</a>` : ''} <span class="td-peq">(${esc(p.quem?.nome_completo || '—')}, ${fmtData(p.criado_em)})</span></li>`).join('')}</ul>` : ''
    const incompleto = r.situacao === 'aberta' && ((LIC_REGRA[cl].prazo === 'obr' && !r.prazo_em) || (LIC_REGRA[cl].edital === 'obr' && !r.edital_url) || r.modalidade === 'Não informada')
    const podeRes = r.situacao === 'aberta' && (!r.prazo_em || venceu)
    const acoes = !licEst.pode ? '' : r.situacao === 'aberta'
      ? `<button class="btn btn-sm btn-secondary" onclick="licAbrirEditar()">${tdIc('editar')}Editar dados e lista curta</button>
         ${cl !== 'inexigibilidade' && r.prazo_em ? `<button class="btn btn-sm btn-secondary" onclick="licAbrirProrrogar()">${tdIc('calendario')}Prorrogar prazo</button>` : ''}
         <button class="btn btn-sm ${podeRes ? 'btn-primary' : 'btn-secondary'}" onclick="licAbrirResultado()" ${podeRes ? '' : `disabled title="Disponível depois de ${esc(licDtHr(r.prazo_em))}"`}>${tdIc('check')}Registrar resultado</button>`
      : `<button class="btn btn-sm btn-primary" onclick="licAbrirRelancar()">${tdIc('desfazer')}Relançar (nova rodada)</button>
         ${['super_admin', 'coordenacao'].includes(appState.perfil) ? `<button class="btn btn-sm td-btn-perigo" onclick="licPedirCancelamento()">${tdIc('xcirc')}Pedir cancelamento do TDR</button>` : ''}`
    h += `<section class="td-lic${r.situacao === 'aberta' ? '' : ' ruim'}" aria-label="Licitação">
      <div class="td-lic-h"><b>${r.rodada}ª rodada · ${esc(r.modalidade)}</b>${estado}</div>
      ${incompleto ? `<div class="td-lic-aviso">${tdIc('alerta')}Complete os dados desta licitação (${[r.modalidade === 'Não informada' ? 'modalidade' : '', LIC_REGRA[cl].prazo === 'obr' && !r.prazo_em ? 'prazo para propostas' : '', LIC_REGRA[cl].edital === 'obr' && !r.edital_url ? 'link do edital' : ''].filter(Boolean).join(', ')}) em "Editar dados e lista curta".</div>` : ''}
      ${dados ? `<div class="td-lic-dados">${dados}</div>` : ''}
      ${fund}
      ${r.situacao !== 'aberta' ? `<div class="td-lic-res">${r.n_propostas ? `<b>${r.n_propostas} proposta(s)</b> · ` : ''}${esc(r.resultado_obs || '')}
        <span class="td-peq"> — registrado ${r.resultado_em ? 'em ' + fmtData(r.resultado_em) : ''}${r.registrou ? ' por ' + esc(r.registrou.nome_completo) : ''}</span>
        <div class="td-peq" style="margin-top:4px">Escolha a medida: relançar (abre a próxima rodada, dá para trocar a modalidade e ampliar a lista) ou pedir o cancelamento do TDR.</div></div>` : ''}
      <div class="td-lic-sub">${cl === 'inexigibilidade' ? 'Empresa' : cl === 'dispensa' || cl === 'cotacao' ? 'Empresas consultadas' : 'Lista curta'}${emps.length ? ` (${emps.length})` : ''}</div>
      ${licTabelaEmpresas(emps, r.situacao !== 'aberta')}
      ${cl !== 'inexigibilidade' && emps.filter(e => e.convidada).length > 0 && emps.filter(e => e.convidada).length < 3 && r.situacao === 'aberta' ? `<div class="td-peq td-lic-alerta">${tdIc('alerta')}Menos de 3 empresas na lista — a competição pode ficar fraca.</div>` : ''}
      ${prorr}
      ${acoes ? `<div class="td-lin td-lic-ac">${acoes}</div>` : ''}
    </section>`
  }
  if (anteriores.length) {
    h += `<details class="td-lic-ant"><summary>Rodadas anteriores (${anteriores.length})</summary><ul class="td-lic-hist">${anteriores.map(r => {
      const emps = licEst.empresas[r.id] || []
      const prop = emps.filter(e => e.apresentou_proposta).map(e => e.empresa)
      return `<li><b>${r.rodada}ª · ${esc(r.modalidade)}</b> — ${esc(licSitTexto(r))}${r.n_propostas ? ` (${r.n_propostas} proposta(s)${prop.length ? ': ' + esc(prop.join(', ')) : ''})` : ''}
        · ${emps.filter(e => e.convidada).length} convidada(s)${(licEst.prorr[r.id] || []).length ? ` · ${(licEst.prorr[r.id] || []).length} prorrogação(ões)` : ''}
        ${r.medida ? ` · medida: <b>${r.medida === 'relancada' ? 'relançada' : r.medida === 'cancelamento' ? 'cancelamento' : 'contrato registrado'}</b>${r.medida_motivo ? ' — ' + esc(r.medida_motivo) : ''}` : ''}
        ${r.resultado_obs ? `<div class="td-peq">${esc(r.resultado_obs)}</div>` : ''}</li>`
    }).join('')}</ul></details>`
  }
  return h
}

// ── janela Enviar para licitação / Editar dados ──────────────────────────
function licOpcoesModalidade (atual) {
  const ops = Object.keys(LIC_CLASSES)
  const outro = atual && !ops.includes(atual) && atual !== 'Não informada'
  return `<option value="">Selecionar modalidade…</option>${ops.map(o => `<option value="${esc(o)}"${o === atual ? ' selected' : ''}>${esc(o)}</option>`).join('')}
    <option value="__outro"${outro ? ' selected' : ''}>Outro…</option>`
}
function abrirLicitacao () {
  if (!tdrAtual) return
  // nova rodada: reaproveita a lista curta da rodada anterior (relançamento)
  const ant = licEst.rodadas.slice(-1)[0]
  licForm = { modo: 'novo', rodada: null,
    empresas: ant ? (licEst.empresas[ant.id] || []).filter(e => e.convidada).map(e => ({ empresa: e.empresa, contato: e.contato, telefone: e.telefone, email: e.email, fornecedor_id: e.fornecedor_id })) : [] }
  document.getElementById('lic-tit').textContent = 'Enviar para licitação'
  document.getElementById('lic-intro').innerHTML = `O TDR aprovado avança para <strong>Em Licitação</strong>${ant ? ` (${ant.rodada + 1}ª rodada; a lista curta da rodada anterior já vem preenchida)` : ''}. Os campos mudam conforme a modalidade.`
  document.getElementById('lic-modalidade').innerHTML = licOpcoesModalidade('')
  document.getElementById('lic-modalidade').disabled = false
  document.getElementById('lic-modalidade-outro').value = ''
  document.getElementById('lic-ok').innerHTML = `${tdIc('seta')}Confirmar licitação`
  licRenderCampos({})
  document.getElementById('modal-licitacao').classList.add('aberto')
}
function licAbrirEditar () {
  const r = licAtual(); if (!r) return
  licForm = { modo: 'editar', rodada: r, empresas: (licEst.empresas[r.id] || []).filter(e => e.convidada).map(e => ({ ...e })) }
  document.getElementById('lic-tit').textContent = `Editar dados da ${r.rodada}ª rodada`
  document.getElementById('lic-intro').innerHTML = 'Corrija os dados ou a lista curta. O prazo, depois de informado, só muda por <strong>Prorrogar prazo</strong> (fica no histórico).'
  const sel = document.getElementById('lic-modalidade')
  sel.innerHTML = licOpcoesModalidade(r.modalidade); sel.disabled = r.modalidade !== 'Não informada'
  document.getElementById('lic-modalidade-outro').value = !LIC_CLASSES[r.modalidade] && r.modalidade !== 'Não informada' ? r.modalidade : ''
  document.getElementById('lic-ok').innerHTML = `${tdIc('salvar')}Salvar`
  licRenderCampos(r)
  document.getElementById('modal-licitacao').classList.add('aberto')
}
function toggleModalidadeOutro () { licRenderCampos(licLerCampos(true)) }
function licModalidade () {
  const v = document.getElementById('lic-modalidade').value
  return v === '__outro' ? document.getElementById('lic-modalidade-outro').value.trim() : v
}

function licRenderCampos (v) {
  const sel = document.getElementById('lic-modalidade').value
  document.getElementById('lic-outro-wrap').style.display = sel === '__outro' ? 'block' : 'none'
  const mod = licModalidade(), cl = licClasse(mod === '' ? '__nada' : mod), rg = LIC_REGRA[cl]
  const box = document.getElementById('lic-campos')
  if (!sel) { box.innerHTML = '<p class="td-peq">Escolha a modalidade para ver os campos.</p>'; return }
  const editando = licForm.modo === 'editar', r = licForm.rodada
  const prazoTrav = editando && r && r.prazo_em
  const pz = v.prazo_em ? new Date(v.prazo_em) : null
  const pzD = v._pzD ?? (pz ? pz.toLocaleDateString('en-CA', { timeZone: 'America/Rio_Branco' }) : '')
  const pzH = v._pzH ?? (pz ? pz.toLocaleTimeString('pt-BR', { timeZone: 'America/Rio_Branco', hour: '2-digit', minute: '2-digit' }) : '17:00')
  const ob = s => s === 'obr' ? ' <span class="obrig">*</span>' : ' <span class="td-peq">(opcional)</span>'
  let h = `<div class="grid-2">
    <div class="form-group"><label class="form-label" for="lic-processo">Nº do processo</label>
      <input class="form-control" type="text" id="lic-processo" placeholder="Ex.: 0001/2026" value="${esc(v.numero_processo || '')}"></div>
    <div class="form-group"><label class="form-label" for="lic-data">Data de abertura</label>
      <input class="form-control" type="date" id="lic-data" value="${esc(v.dt_abertura || '')}"></div></div>`
  if (cl === 'dispensa') {
    h += `<div class="form-group"><label class="form-label" for="lic-fund">Fundamento legal <span class="obrig">*</span></label>
      <input class="form-control" type="text" id="lic-fund" placeholder="Ex.: dispensa por valor (art. 75, II) / emergência" value="${esc(v.fundamento || '')}"></div>`
  }
  if (cl === 'inexigibilidade') {
    h += `<fieldset class="form-group td-lic-op"><legend class="form-label">Fundamento <span class="obrig">*</span></legend>
      ${Object.entries(LIC_FUND).map(([k, l]) => `<label><input type="radio" name="lic-ftipo" value="${k}"${v.fundamento_tipo === k ? ' checked' : ''} onchange="licRenderCampos(licLerCampos(true))"> ${esc(l)}</label>`).join('')}</fieldset>
      ${v.fundamento_tipo === 'outro' ? `<div class="form-group"><label class="form-label" for="lic-fund">Qual fundamento <span class="obrig">*</span></label>
        <input class="form-control" type="text" id="lic-fund" value="${esc(v.fundamento || '')}"></div>` : ''}
      <div class="form-group"><label class="form-label" for="lic-just">Justificativa <span class="obrig">*</span></label>
        <textarea class="form-control" id="lic-just" rows="3" placeholder="Por que só esta empresa pode executar o objeto (mínimo 30 caracteres)">${esc(v.justificativa || '')}</textarea></div>`
  }
  if (rg.edital !== 'nao') {
    h += `<div class="form-group"><label class="form-label" for="lic-edital">${cl === 'dispensa' || cl === 'cotacao' ? 'Link do aviso ou do pedido de cotação' : 'Link da publicação do edital'}${ob(rg.edital)}</label>
      <input class="form-control" type="url" id="lic-edital" placeholder="https://…" value="${esc(v.edital_url || '')}"></div>`
  }
  if (rg.prazo !== 'nao') {
    h += `<div class="form-group"><label class="form-label" for="lic-pz-d">${cl === 'dispensa' || cl === 'cotacao' ? 'Cotações até' : 'Propostas até'}${ob(rg.prazo)}</label>
      <div class="td-lic-pz"><input class="form-control" type="date" id="lic-pz-d" value="${esc(pzD)}"${prazoTrav ? ' disabled' : ''}>
      <input class="form-control" type="time" id="lic-pz-h" value="${esc(pzH)}"${prazoTrav ? ' disabled' : ''}><span class="td-peq">hora do Acre</span></div>
      ${prazoTrav ? '<div class="td-peq">Para mudar, use "Prorrogar prazo".</div>' : cl === 'dispensa' ? '<div class="td-peq">Sem prazo, o sistema cria a tarefa de registrar o resultado com 15 dias.</div>' : '<div class="td-peq">Dois dias antes o sistema avisa; no vencimento cria a tarefa de registrar o resultado.</div>'}</div>`
  }
  const tit = cl === 'inexigibilidade' ? 'Empresa (exatamente uma)' : cl === 'dispensa' || cl === 'cotacao' ? 'Empresas consultadas' : 'Lista curta de possíveis fornecedores'
  h += `<div class="td-lic-sub">${tit}${rg.lista === 'obr' ? ' <span class="obrig">*</span>' : ''}</div>
    <div id="lic-emps"></div>
    <div class="td-lin" style="margin-top:8px">
      <button type="button" class="btn btn-sm btn-secondary" onclick="licAddEmpresa()" id="lic-add">${tdIc('mais')}Adicionar empresa</button>
      <select class="form-control td-lic-forn" id="lic-forn" onchange="licAddFornecedor(this)" aria-label="Buscar no cadastro de fornecedores"><option value="">Buscar no cadastro de fornecedores…</option></select>
    </div>
    <div class="td-peq td-lic-alerta" id="lic-emp-aviso" hidden></div>`
  box.innerHTML = h
  licRenderEmpresas()
  licCarregarForn()
}
function licRenderEmpresas () {
  const el = document.getElementById('lic-emps'); if (!el) return
  const cl = licClasse(licModalidade())
  el.innerHTML = licForm.empresas.length ? licForm.empresas.map((e, i) => `<div class="td-lic-linha">
      <input class="form-control" type="text" data-i="${i}" data-k="empresa" placeholder="Empresa *" value="${esc(e.empresa || '')}" aria-label="Empresa">
      <input class="form-control" type="text" data-i="${i}" data-k="contato" placeholder="Contato de referência" value="${esc(e.contato || '')}" aria-label="Contato de referência">
      <input class="form-control" type="tel" data-i="${i}" data-k="telefone" placeholder="Telefone" value="${esc(e.telefone || '')}" aria-label="Telefone">
      <input class="form-control" type="email" data-i="${i}" data-k="email" placeholder="E-mail" value="${esc(e.email || '')}" aria-label="E-mail">
      <button type="button" class="btn btn-sm btn-secondary td-lic-x" onclick="licTirarEmpresa(${i})" aria-label="Tirar ${esc(e.empresa || 'empresa')} da lista">${tdIc('fechar')}</button>
    </div>`).join('') : '<div class="td-peq">Nenhuma empresa ainda.</div>'
  el.querySelectorAll('input[data-k]').forEach(inp => inp.addEventListener('input', () => {
    licForm.empresas[+inp.dataset.i][inp.dataset.k] = inp.value; licAvisoEmpresas()
  }))
  const add = document.getElementById('lic-add'), forn = document.getElementById('lic-forn')
  const cheio = cl === 'inexigibilidade' && licForm.empresas.length >= 1
  if (add) add.disabled = cheio
  if (forn) forn.disabled = cheio
  licAvisoEmpresas()
}
function licAvisoEmpresas () {
  const el = document.getElementById('lic-emp-aviso'); if (!el) return
  const cl = licClasse(licModalidade()), n = licForm.empresas.filter(e => (e.empresa || '').trim()).length
  const msg = cl === 'inexigibilidade' ? (n !== 1 ? 'Informe exatamente uma empresa.' : '')
    : n < 3 ? `${n ? 'Só ' + n + ' empresa(s)' : 'Nenhuma empresa'} na lista — com menos de 3 a competição pode ficar fraca.` : ''
  el.innerHTML = msg ? tdIc('alerta') + esc(msg) : ''; el.hidden = !msg
}
function licAddEmpresa () { licForm.empresas.push({ empresa: '' }); licRenderEmpresas(); const ins = document.querySelectorAll('#lic-emps input[data-k="empresa"]'); ins[ins.length - 1]?.focus() }
function licTirarEmpresa (i) { licForm.empresas.splice(i, 1); licRenderEmpresas() }
async function licCarregarForn () {
  const sel = document.getElementById('lic-forn'); if (!sel) return
  if (!licFornDir) { const { data } = await db.rpc('fn_fornecedores_diretorio'); licFornDir = (data || []).filter(f => f.ativo !== false) }
  sel.innerHTML = '<option value="">Buscar no cadastro de fornecedores…</option>' +
    licFornDir.map(f => `<option value="${f.id}">${esc(f.nome)}${f.tipo ? ' (' + esc(f.tipo) + ')' : ''}</option>`).join('')
}
function licAddFornecedor (sel) {
  const f = (licFornDir || []).find(x => x.id === sel.value); sel.value = ''
  if (!f) return
  if (licForm.empresas.some(e => e.fornecedor_id === f.id)) { toast('Esta empresa já está na lista.', 'info'); return }
  licForm.empresas.push({ empresa: f.nome, fornecedor_id: f.id }); licRenderEmpresas()
}
// lê o formulário; leve=true não valida (usado ao redesenhar)
function licLerCampos () {
  const g = id => document.getElementById(id)
  const ft = document.querySelector('input[name="lic-ftipo"]:checked')
  return {
    numero_processo: g('lic-processo')?.value.trim() || '', dt_abertura: g('lic-data')?.value || '',
    edital_url: licUrlNorm(g('lic-edital')?.value), fundamento: g('lic-fund')?.value.trim() || '',
    fundamento_tipo: ft ? ft.value : '', justificativa: g('lic-just')?.value.trim() || '',
    _pzD: g('lic-pz-d')?.value ?? '', _pzH: g('lic-pz-h')?.value ?? '17:00',
  }
}

async function salvarLicitacao () {
  if (!tdrAtual) return
  const erro = (m, campo) => licMostrarErro('lic-erro', m, campo)
  erro('')
  const mod = licModalidade()
  if (!mod) { erro('Escolha a modalidade.', 'lic-modalidade'); return }
  const cl = licClasse(mod), rg = LIC_REGRA[cl], v = licLerCampos()
  const emps = licForm.empresas.map(e => ({ ...e, empresa: (e.empresa || '').trim() })).filter(e => e.empresa || e.contato || e.email || e.telefone)
  if (emps.some(e => e.empresa.length < 2)) { erro('Informe o nome de cada empresa da lista (ou tire a linha vazia).'); return }
  if (emps.some(e => e.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.email.trim()))) { erro('Há e-mail inválido na lista.'); return }
  if (v.edital_url && !licUrlOk(v.edital_url)) { erro('O link do edital deve ser o endereço completo, começando com http:// ou https://.', 'lic-edital'); return }
  if (rg.edital === 'obr' && !v.edital_url && !(licForm.modo === 'editar' && licForm.rodada?.edital_url)) { erro('Informe o link da publicação do edital.', 'lic-edital'); return }
  const prazo = rg.prazo !== 'nao' && v._pzD ? licIso(v._pzD, v._pzH) : null
  const temPrazo = licForm.modo === 'editar' && licForm.rodada?.prazo_em
  if (rg.prazo === 'obr' && !prazo && !temPrazo && licForm.modo === 'novo') { erro('Informe até quando as propostas são recebidas.', 'lic-pz-d'); return }
  if (prazo && !temPrazo && new Date(prazo) <= new Date()) { erro('O prazo precisa ser uma data futura.', 'lic-pz-d'); return }
  if (rg.lista === 'obr' && !emps.length) { erro('Informe ao menos uma empresa consultada.'); return }
  if (rg.lista === 'uma' && emps.length !== 1) { erro('Na inexigibilidade informe exatamente uma empresa.'); return }
  if (cl === 'dispensa' && v.fundamento.length < 5) { erro('Informe o fundamento legal da dispensa.', 'lic-fund'); return }
  if (cl === 'inexigibilidade') {
    if (!v.fundamento_tipo) { erro('Escolha o fundamento da inexigibilidade.'); return }
    if (v.fundamento_tipo === 'outro' && v.fundamento.length < 5) { erro('Descreva o fundamento.', 'lic-fund'); return }
    if (v.justificativa.length < 30) { erro('Escreva a justificativa (mínimo 30 caracteres).', 'lic-just'); return }
  }
  const p = { modalidade: mod, numero_processo: v.numero_processo, dt_abertura: v.dt_abertura || null, edital_url: v.edital_url,
    fundamento: v.fundamento, fundamento_tipo: v.fundamento_tipo || null, justificativa: v.justificativa,
    empresas: emps.map(e => ({ id: e.id || null, empresa: e.empresa, contato: e.contato || '', telefone: e.telefone || '', email: (e.email || '').trim(), fornecedor_id: e.fornecedor_id || null })) }
  if (prazo && !temPrazo) p.prazo_em = prazo

  if (licForm.modo === 'editar') {
    const { error } = await db.rpc('fn_lic_editar', { p_rodada: licForm.rodada.id, p })
    if (error) { erro(msgCanc(error.message)); return }
    fecharModal('modal-licitacao'); toast('Dados da licitação salvos.', 'success')
    await licRecarregar(); return
  }
  const id = tdrAtual.id, numero = tdrAtual.numero
  fecharModal('modal-licitacao')
  pedirSenhaTDR('Enviar para licitação', `TDR ${numero} → Em Licitação · ${mod}`, async () => {
    const { data, error } = await db.rpc('fn_lic_enviar', { p_tdr: id, p })
    if (error) { toast('Não foi enviado: ' + msgCanc(error.message), 'error', 9000); document.getElementById('modal-licitacao').classList.add('aberto'); return }
    if (data?.tarefa_id) licEmailTarefa(data.tarefa_id)
    toast(cl === 'inexigibilidade' || (cl === 'dispensa' && !prazo)
      ? 'TDR em contratação direta. Foi criada a tarefa de registrar o resultado (15 dias).'
      : 'TDR enviado para licitação. O sistema avisa 2 dias antes do prazo e cria a tarefa do resultado no vencimento.', 'success', 8000)
    fecharModal('modal-tdr'); await carregar()
  })
}

async function licRecarregar () {
  const id = tdrAtual?.id; if (!id) return
  await carregar(); await abrirTDR(id)
}
async function licEmailTarefa (tarefaId) {
  try {
    const { data: { session } } = await db.auth.getSession()
    await fetch(SUPABASE_URL + '/functions/v1/enviar-email-tarefa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || ''), apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ tarefa_id: tarefaId, evento: 'atribuicao', autor_id: appState.usuario.id }),
    })
  } catch (e) { console.error('e-mail da tarefa:', e) }
}

// ── prorrogar ────────────────────────────────────────────────────────────
function licAbrirProrrogar () {
  const r = licAtual(); if (!r) return
  document.getElementById('lpr-sub').textContent = `${r.rodada}ª rodada · prazo atual ${licDtHr(r.prazo_em)}`
  const base = new Date(Math.max(Date.now(), new Date(r.prazo_em).getTime()) + 7 * 864e5)
  document.getElementById('lpr-d').value = base.toLocaleDateString('en-CA', { timeZone: 'America/Rio_Branco' })
  document.getElementById('lpr-h').value = new Date(r.prazo_em).toLocaleTimeString('pt-BR', { timeZone: 'America/Rio_Branco', hour: '2-digit', minute: '2-digit' })
  document.getElementById('lpr-motivo').value = ''; document.getElementById('lpr-aviso').value = ''
  document.getElementById('lpr-erro').hidden = true
  document.getElementById('modal-lic-prorr').classList.add('aberto')
}
async function licProrrogar () {
  const r = licAtual(); if (!r) return
  const erro = (m, campo) => licMostrarErro('lpr-erro', m, campo)
  const d = document.getElementById('lpr-d').value, h = document.getElementById('lpr-h').value
  const mot = document.getElementById('lpr-motivo').value.trim(), aviso = document.getElementById('lpr-aviso').value.trim()
  if (!d) { erro('Informe o novo prazo.'); return }
  const novo = licIso(d, h)
  if (new Date(novo) <= new Date(r.prazo_em)) { erro('O novo prazo precisa ser depois do prazo atual.'); return }
  if (mot.length < 10) { erro('Informe o motivo (mínimo 10 caracteres).'); return }
  if (aviso && !licUrlOk(aviso)) { erro('O link do edital deve ser o endereço completo, começando com http:// ou https://.', 'lic-edital'); return }
  const { error } = await db.rpc('fn_lic_prorrogar', { p_rodada: r.id, p_prazo: novo, p_motivo: mot, p_aviso_url: aviso || null })
  if (error) { erro(msgCanc(error.message)); return }
  fecharModal('modal-lic-prorr'); toast('Prazo prorrogado para ' + licDtHr(novo) + '.', 'success')
  await licRecarregar()
}

// ── resultado ────────────────────────────────────────────────────────────
let licRes = { sit: '', novas: [] }
function licAbrirResultado () {
  const r = licAtual(); if (!r) return
  const cl = licClasse(r.modalidade)
  licRes = { sit: '', novas: [] }
  document.getElementById('lrs-sub').textContent = `${r.rodada}ª rodada · ${r.modalidade}${r.prazo_em ? ' · prazo encerrado em ' + licDtHr(r.prazo_em) : ''}`
  const ops = cl === 'inexigibilidade'
    ? [['com_propostas', 'Proposta recebida'], ['sem_proposta', 'Sem proposta (a empresa recusou ou não apresentou a documentação)']]
    : [['com_propostas', cl === 'dispensa' || cl === 'cotacao' ? 'Houve cotações' : 'Houve propostas'],
       ['deserta', cl === 'dispensa' || cl === 'cotacao' ? 'Nenhuma cotação recebida' : 'Não houve propostas (deserta)'],
       ['fracassada', 'Houve propostas, mas todas foram desclassificadas (fracassada)']]
  document.getElementById('lrs-ops').innerHTML = ops.map(([k, l]) => `<label><input type="radio" name="lrs-sit" value="${k}" onchange="licResSit(this.value)"> ${esc(l)}</label>`).join('')
  document.getElementById('lrs-det').innerHTML = ''
  document.getElementById('lrs-obs').value = ''
  document.getElementById('lrs-erro').hidden = true
  document.getElementById('modal-lic-res').classList.add('aberto')
}
function licResSit (sit) {
  licRes.sit = sit
  const r = licAtual(), cl = licClasse(r.modalidade), emps = (licEst.empresas[r.id] || []).filter(e => e.convidada)
  const el = document.getElementById('lrs-det')
  document.getElementById('lrs-obs-rot').innerHTML = ['deserta', 'fracassada', 'sem_proposta'].includes(sit) ? 'O que aconteceu <span class="obrig">*</span>' : 'Observação <span class="td-peq">(opcional)</span>'
  if (sit === 'deserta' || sit === 'sem_proposta') { el.innerHTML = '<p class="td-peq">Sem propostas. Depois de registrar, o sistema cria a tarefa "definir medida": relançar ou pedir o cancelamento do TDR.</p>'; return }
  el.innerHTML = `${cl === 'inexigibilidade' ? '' : `<div class="form-group"><label class="form-label" for="lrs-n">Quantas ${cl === 'dispensa' || cl === 'cotacao' ? 'cotações' : 'propostas'} foram recebidas <span class="obrig">*</span></label>
      <input class="form-control" type="number" min="1" step="1" id="lrs-n" style="max-width:140px"></div>`}
    <div class="td-lic-sub">Quais empresas apresentaram ${cl === 'dispensa' || cl === 'cotacao' ? 'cotação' : 'proposta'} <span class="td-peq">(sem valores)</span></div>
    <div class="td-lic-op">${emps.map(e => `<label><input type="checkbox" class="lrs-emp" value="${e.id}"${cl === 'inexigibilidade' ? ' checked' : ''}> ${esc(e.empresa)}</label>`).join('') || '<span class="td-peq">Nenhuma empresa na lista curta.</span>'}</div>
    <div id="lrs-novas"></div>
    ${cl === 'inexigibilidade' ? '' : `<button type="button" class="btn btn-sm btn-secondary" style="margin-bottom:12px" onclick="licResNova()">${tdIc('mais')}Empresa fora da lista</button>`}
    ${sit === 'fracassada' ? '<p class="td-peq" style="margin-top:8px">Fracassada também cria a tarefa "definir medida".</p>' : ''}`
  licResNovas()
}
function licResNova () { licRes.novas.push({ empresa: '' }); licResNovas() }
function licResNovas () {
  const el = document.getElementById('lrs-novas'); if (!el) return
  el.innerHTML = licRes.novas.map((e, i) => `<div class="td-lic-linha">
      <input class="form-control" type="text" data-i="${i}" data-k="empresa" placeholder="Empresa *" value="${esc(e.empresa || '')}" aria-label="Empresa">
      <input class="form-control" type="text" data-i="${i}" data-k="contato" placeholder="Contato" value="${esc(e.contato || '')}" aria-label="Contato">
      <input class="form-control" type="tel" data-i="${i}" data-k="telefone" placeholder="Telefone" value="${esc(e.telefone || '')}" aria-label="Telefone">
      <input class="form-control" type="email" data-i="${i}" data-k="email" placeholder="E-mail" value="${esc(e.email || '')}" aria-label="E-mail">
      <button type="button" class="btn btn-sm btn-secondary td-lic-x" onclick="licRes.novas.splice(${i},1);licResNovas()" aria-label="Tirar">${tdIc('fechar')}</button></div>`).join('')
  el.querySelectorAll('input[data-k]').forEach(inp => inp.addEventListener('input', () => { licRes.novas[+inp.dataset.i][inp.dataset.k] = inp.value }))
}
function licSalvarResultado () {
  const r = licAtual(); if (!r) return
  const cl = licClasse(r.modalidade)
  const erro = (m, campo) => licMostrarErro('lrs-erro', m, campo)
  document.getElementById('lrs-erro').hidden = true
  const sit = licRes.sit, obs = document.getElementById('lrs-obs').value.trim()
  if (!sit) { erro('Escolha o resultado.'); return }
  const marcadas = [...document.querySelectorAll('.lrs-emp:checked')].map(x => x.value)
  const novas = licRes.novas.map(e => ({ ...e, empresa: (e.empresa || '').trim() })).filter(e => e.empresa)
  let n = cl === 'inexigibilidade' ? 1 : parseInt(document.getElementById('lrs-n')?.value || '0', 10)
  if (sit === 'deserta' || sit === 'sem_proposta') n = 0
  else {
    if (!(n >= 1)) { erro('Informe quantas propostas foram recebidas.'); return }
    if (!marcadas.length && !novas.length) { erro('Marque ao menos uma empresa que apresentou proposta.'); return }
    if (marcadas.length + novas.length > n) { erro('Há mais empresas marcadas do que propostas.'); return }
  }
  if (sit !== 'com_propostas' && obs.length < 10) { erro('Descreva o que aconteceu (mínimo 10 caracteres).'); return }
  fecharModal('modal-lic-res')
  pedirSenhaTDR('Registrar resultado', `${r.rodada}ª rodada · ${licSitTexto({ ...r, situacao: sit })}`, async () => {
    const { data, error } = await db.rpc('fn_lic_resultado', { p_rodada: r.id, p_situacao: sit, p_n: n,
      p_empresas: sit === 'com_propostas' || sit === 'fracassada' ? marcadas : [], p_novas: sit === 'com_propostas' || sit === 'fracassada' ? novas : [], p_obs: obs })
    if (error) { toast('Resultado não registrado: ' + msgCanc(error.message), 'error', 9000); document.getElementById('modal-lic-res').classList.add('aberto'); return }
    if (data?.tarefa_medida_id) licEmailTarefa(data.tarefa_medida_id)
    toast(sit === 'com_propostas' ? 'Resultado registrado. Registre a contratação quando o contrato for assinado.'
      : 'Resultado registrado. Foi criada a tarefa "definir medida": relançar ou pedir o cancelamento.', 'success', 8000)
    await licRecarregar()
  })
}

// ── medida: relançar ou pedir cancelamento ───────────────────────────────
function licAbrirRelancar () {
  const r = licAtual(); if (!r) return
  document.getElementById('lrl-sub').textContent = `${r.rodada}ª rodada · ${r.modalidade} · ${licSitTexto(r)}`
  document.getElementById('lrl-motivo').value = ''
  document.getElementById('lrl-erro').hidden = true
  document.getElementById('modal-lic-rel').classList.add('aberto')
}
async function licRelancar () {
  const r = licAtual(); if (!r) return
  const mot = document.getElementById('lrl-motivo').value.trim()
  const erro = (m, campo) => licMostrarErro('lrl-erro', m, campo)
  if (mot.length < 10) { erro('Explique o que muda na nova rodada (mínimo 10 caracteres).'); return }
  const { error } = await db.rpc('fn_lic_relancar', { p_rodada: r.id, p_motivo: mot })
  if (error) { erro(msgCanc(error.message)); return }
  fecharModal('modal-lic-rel')
  toast('Rodada encerrada. O TDR voltou para Aprovado: preencha a próxima rodada.', 'success', 7000)
  await licRecarregar()
  abrirLicitacao()
}
function licPedirCancelamento () {
  const r = licAtual(); if (!r) return
  abrirCancelamento({ motivo_tipo: r.situacao === 'deserta' ? 'licitacao_deserta' : r.situacao === 'fracassada' ? 'licitacao_fracassada' : 'outro',
    justificativa: `${r.rodada}ª rodada (${r.modalidade}) ${licSitTexto(r).toLowerCase()}. ${r.resultado_obs || ''}`.trim() })
}
