// ═══════════════════════════════════════════════════════════════════════
// diagnostico-indicadores.js — aba "Indicadores" da mesa do Diagnóstico
// ═══════════════════════════════════════════════════════════════════════
// Números vêm PRONTOS de fn_diag_agregados (vw_diag_indicadores): a mesma
// fonte que alimentará a Matriz de Resultados. Aqui não se recalcula nada —
// só se desenha. Célula com menos de 5 fichas vem suprimida do banco
// (suprimido = true, n_opcao/pct/media nulos) e aparece como "oculto".
// Texto aberto, nomes, GPS e treino nunca chegam a esta função.
//
// Versões do questionário não se somam na tela (perguntas podem mudar entre
// versões): escolhe-se uma versão; a padrão é a que tem mais fichas.
// Bloco "Gênero" é sempre por sexo do entrevistado (plano §3.6).
// ═══════════════════════════════════════════════════════════════════════

const dgInd = { nivel: 'geral', mun: '', sexo: false, conferencia: false, qid: null,
                dados: [], dadosSx: [], quest: {}, municipios: [], emConferencia: null, carregando: false }
const DGI_SEXO = [['mulher', 'Mulheres'], ['homem', 'Homens'], ['outro_ou_nao_informado', 'Outro/não informado']]
// ordem fixa (validada: scripts/validate_palette.js — CVD protan 7,3 → rótulo direto em cada barra)
const DGI_COR_SEXO = { mulher: '#218A5C', homem: '#C07F0A', outro_ou_nao_informado: '#5B6CC4' }
const dgiPct = v => v == null ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const dgiNum = v => Number(v || 0).toLocaleString('pt-BR')

async function dgIndCarregar(forcar) {
  const el = document.getElementById('dg-indicadores')
  if (!el) return
  if (!forcar && dgInd.dados.length) { dgIndDesenhar(); return }
  dgInd.carregando = true
  if (!el.innerHTML) el.innerHTML = '<div class="card"><p style="font-size:13px;color:var(--cinza-500)">Carregando indicadores…</p></div>'
  const args = { p_nivel: dgInd.nivel, p_municipio_ibge: dgInd.mun ? Number(dgInd.mun) : null, p_somente_validadas: !dgInd.conferencia }
  const pedidos = [
    db.rpc('fn_diag_agregados', Object.assign({ p_por_sexo: false }, args)),
    db.rpc('fn_diag_agregados', Object.assign({ p_por_sexo: true }, args)),
  ]
  if (!Object.keys(dgInd.quest).length) {
    pedidos.push(db.from('diag_questionarios').select('id,codigo,versao,status,estrutura').neq('status', 'rascunho'))
    pedidos.push(db.from('diag_municipios').select('ibge,nome').order('nome'))
  }
  // quantas estão fora dos números (em conferência): só quem lê fichas consegue contar
  if (dgPodeGerir || dgPodeConsultar)
    pedidos.push(db.from('diag_fichas').select('id', { count: 'exact', head: true }).eq('status', 'enviada').eq('treino', false))
  const r = await Promise.all(pedidos)
  dgInd.carregando = false
  const erro = r.find(x => x && x.error)
  if (erro) { el.innerHTML = '<div class="card"><p style="color:var(--erro)">' + esc(dgMsgErro(erro.error)) + '</p></div>'; return }
  dgInd.dados = r[0].data || []
  dgInd.dadosSx = r[1].data || []
  let k = 2
  if (!Object.keys(dgInd.quest).length) {
    ;(r[k++].data || []).forEach(q => { dgInd.quest[q.id] = q })
    dgInd.municipios = r[k++].data || []
  }
  if (dgPodeGerir || dgPodeConsultar) dgInd.emConferencia = r[k].count
  // versão padrão: a com mais fichas no cálculo
  const vers = dgIndVersoes()
  if (!dgInd.qid || !vers.some(v => v.id === dgInd.qid)) dgInd.qid = vers.length ? vers.slice().sort((a, b) => b.n - a.n)[0].id : null
  dgIndDesenhar()
}

// fichas no cálculo por versão = maior (respondidas + não respondeu) entre as perguntas, somado por recorte
function dgIndFichasNoCalculo(qid) {
  const porRec = {}
  dgInd.dados.filter(d => d.questionario_id === qid).forEach(d => {
    const t = Number(d.n_validos) + Number(d.n_nr)
    if (!porRec[d.recorte] || t > porRec[d.recorte]) porRec[d.recorte] = t
  })
  return Object.values(porRec).reduce((s, n) => s + n, 0)
}
function dgIndVersoes() {
  const ids = [...new Set(dgInd.dados.map(d => d.questionario_id))]
  return ids.map(id => ({ id, q: dgInd.quest[id], n: dgIndFichasNoCalculo(id) })).filter(v => v.q)
    .sort((a, b) => b.q.versao - a.q.versao)
}

function dgIndFiltro(k, v) {
  dgInd[k] = v
  if (k === 'nivel' || k === 'mun' || k === 'conferencia') dgIndCarregar(true)
  else dgIndDesenhar()
}

function dgIndDesenhar() {
  const el = document.getElementById('dg-indicadores')
  const vers = dgIndVersoes()
  const q = dgInd.quest[dgInd.qid]
  const nFichas = q ? dgIndFichasNoCalculo(q.id) : 0
  const recortes = new Set(dgInd.dados.filter(d => q && d.questionario_id === q.id).map(d => d.recorte))
  const seg = [['geral', 'Geral'], ['municipio', 'Por município'], ['comunidade', 'Por comunidade']]
  let html = `<div class="card dgi-ctrl">
    <div class="dgv-filtros" style="margin:0">
      <label>Recorte<span class="dgi-seg" role="group">${seg.map(([v, r]) =>
        `<button type="button" class="${dgInd.nivel === v ? 'on' : ''}" aria-pressed="${dgInd.nivel === v}" onclick="dgIndFiltro('nivel','${v}')">${r}</button>`).join('')}</span></label>
      <label>Município<select onchange="dgIndFiltro('mun',this.value)"><option value="">Todos</option>
        ${dgInd.municipios.map(m => `<option value="${m.ibge}" ${String(m.ibge) === dgInd.mun ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></label>
      <label>Versão do questionário<select onchange="dgIndFiltro('qid',this.value)">
        ${vers.map(v => `<option value="${v.id}" ${v.id === dgInd.qid ? 'selected' : ''}>v${v.q.versao}${v.q.status === 'publicado' ? ' (vigente)' : ''} · ${dgiNum(v.n)} ficha${v.n === 1 ? '' : 's'}</option>`).join('') || '<option>—</option>'}</select></label>
      <label class="dgv-check"><input type="checkbox" ${dgInd.sexo ? 'checked' : ''} onchange="dgIndFiltro('sexo',this.checked)"> Separar por sexo do entrevistado</label>
      <label class="dgv-check"><input type="checkbox" ${dgInd.conferencia ? 'checked' : ''} onchange="dgIndFiltro('conferencia',this.checked)"> Incluir fichas em conferência</label>
      <span style="flex:1"></span>
      <button type="button" class="btn btn-secondary btn-sm" onclick="dgIndBaixar()" ${q ? '' : 'disabled'}>⤓ Baixar indicadores (.xlsx)</button>
    </div></div>
    <div class="dg-grade dgi-nums">
      <div class="dg-num"><b>${dgiNum(nFichas)}</b><span>fichas ${dgInd.conferencia ? 'no cálculo' : 'validadas no cálculo'}</span></div>
      ${dgInd.emConferencia != null ? `<div class="dg-num"><b>${dgiNum(dgInd.emConferencia)}</b><span>em conferência ${dgInd.conferencia ? '(incluídas)' : '(fora dos números)'}</span></div>` : ''}
      ${dgInd.nivel !== 'geral' ? `<div class="dg-num"><b>${recortes.size}</b><span>${dgInd.nivel === 'municipio' ? 'municípios' : 'comunidades'}</span></div>` : ''}
    </div>`
  if (!q) {
    el.innerHTML = html + '<div class="card"><p style="font-size:13px;color:var(--cinza-500);margin:0">Ainda não há fichas ' +
      (dgInd.conferencia ? '' : 'validadas ') + 'para calcular indicadores.</p></div>'
    return
  }
  const est = q.estrutura
  est.blocos.forEach(b => {
    const sempreSexo = b.id === 'genero'
    const cartoes = []
    b.perguntas.forEach(p => {
      if (!['unica', 'multipla', 'inteiro', 'decimal'].includes(p.tipo) || p.coluna_fixa) return
      cartoes.push(dgIndCartao(p, sempreSexo))
      if (p.chave === 'qtd_moradores') cartoes.push(dgIndCartao({ chave: '_total_moradores', n: 9, tipo: 'inteiro',
        texto: 'Pessoas por domicílio (lista de moradores da P9)' }, sempreSexo))
    })
    const cs = cartoes.filter(Boolean)
    if (!cs.length) return
    html += `<h3 class="dgi-bloco">${esc(b.titulo)}${sempreSexo ? ' · sempre por sexo do entrevistado' : ''}</h3><div class="dgi-grade">${cs.join('')}</div>`
  })
  html += `<p class="dgi-nota">Números calculados no banco (<code>fn_diag_agregados</code>), a mesma fonte que alimentará a Matriz de Resultados.
    Denominador = quem respondeu a pergunta (“Não respondeu” e perguntas puladas ficam fora). Célula com menos de 5 fichas fica oculta para não identificar famílias.
    Texto aberto, nomes e GPS nunca entram aqui. Fichas de treino ficam fora.</p>`
  el.innerHTML = html
}

function dgIndLinhas(chave, porSexo) {
  const fonte = porSexo ? dgInd.dadosSx : dgInd.dados
  return fonte.filter(d => d.questionario_id === dgInd.qid && d.chave === chave)
}

function dgIndCartao(p, sempreSexo) {
  const porSexo = sempreSexo || dgInd.sexo
  const linhas = dgIndLinhas(p.chave, porSexo)
  if (!linhas.length) return null
  const numerico = p.tipo === 'inteiro' || p.tipo === 'decimal'
  const opcoes = numerico ? [] : (p.opcoes || []).map(o => ({ v: o.v, r: o.r }))
  // grupos = recorte × sexo (cada um com sua linha-base)
  const grupos = []
  linhas.forEach(d => {
    const k = d.recorte + '|' + (d.sexo_respondente || '')
    let g = grupos.find(x => x.k === k)
    if (!g) grupos.push(g = { k, rec: d.recorte, nome: d.recorte_nome, sx: d.sexo_respondente, nv: Number(d.n_validos),
                               nnr: Number(d.n_nr), sup: d.suprimido, media: d.media, op: {} })
    if (d.opcao != null) g.op[d.opcao] = d
  })
  const ordSx = s => DGI_SEXO.findIndex(x => x[0] === s)
  grupos.sort((a, b) => String(a.nome).localeCompare(String(b.nome)) || ordSx(a.sx) - ordSx(b.sx))
  const cab = `<h4><span>P${p.n}</span>${esc(p.texto)}</h4>`
  const rotSx = s => (DGI_SEXO.find(x => x[0] === s) || [s, s])[1]

  if (dgInd.nivel === 'geral') {
    if (!porSexo) {
      const g = grupos[0]
      const meta = `<div class="dgi-meta">${dgiNum(g.nv)} responderam${g.nnr ? ' · ' + dgiNum(g.nnr) + ' não responderam' : ''}${p.tipo === 'multipla' ? ' · múltipla escolha (soma passa de 100%)' : ''}</div>`
      if (g.sup) return `<div class="dgi-card">${cab}${meta}${dgIndOculto()}</div>`
      if (numerico) return `<div class="dgi-card">${cab}${meta}<div class="dgi-media">${Number(g.media).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <small>média</small></div></div>`
      return `<div class="dgi-card">${cab}${meta}${opcoes.map(o => {
        const d = g.op[o.v]; const pct = d ? Number(d.pct) : 0; const n = d ? Number(d.n_opcao) : 0
        return `<div class="dgi-bar" title="${esc(o.r)}: ${dgiPct(pct)} (${n} de ${g.nv})"><span class="t">${esc(o.r)}</span>
          <span class="trilho"><i style="width:${pct}%"></i></span><span class="v">${dgiPct(pct)} <small>${n}</small></span></div>`
      }).join('')}</div>`
    }
    // geral por sexo: uma barra por série, cada uma com rótulo direto
    const meta = `<div class="dgi-meta">${grupos.map(g => rotSx(g.sx) + ' ' + dgiNum(g.nv)).join(' · ')} responderam</div>`
    const leg = `<div class="dgi-leg">${grupos.map(g => `<span><i style="background:${DGI_COR_SEXO[g.sx]}"></i>${rotSx(g.sx)}</span>`).join('')}</div>`
    if (numerico) return `<div class="dgi-card">${cab}${meta}${grupos.map(g => `<div class="dgi-bar sx"><span class="t">${rotSx(g.sx)}</span><span></span>
      <span class="v">${g.sup ? '<em>oculto</em>' : Number(g.media).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' <small>média</small>'}</span></div>`).join('')}</div>`
    return `<div class="dgi-card">${cab}${meta}${leg}${opcoes.map(o => `<div class="dgi-opsx"><span class="t">${esc(o.r)}</span><div>${grupos.map(g => {
      if (g.sup) return `<div class="dgi-bar sx"><span class="trilho"></span><span class="v"><em>${rotSx(g.sx)} · oculto</em></span></div>`
      const d = g.op[o.v]; const pct = d ? Number(d.pct) : 0; const n = d ? Number(d.n_opcao) : 0
      return `<div class="dgi-bar sx" title="${esc(o.r)} · ${rotSx(g.sx)}: ${dgiPct(pct)} (${n} de ${g.nv})"><span class="trilho"><i style="width:${pct}%;background:${DGI_COR_SEXO[g.sx]}"></i></span>
        <span class="v">${rotSx(g.sx).slice(0, 1)} ${dgiPct(pct)}</span></div>`
    }).join('')}</div></div>`).join('')}</div>`
  }

  // por município/comunidade: tabela (linha = recorte [× sexo], coluna = opção)
  const colunas = numerico ? [{ v: '_media', r: 'Média' }] : opcoes
  return `<div class="dgi-card dgi-larga">${cab}<div class="dgi-meta">${p.tipo === 'multipla' ? 'múltipla escolha (soma passa de 100%) · ' : ''}% de quem respondeu</div>
    <div style="overflow-x:auto"><table class="dgi-tab"><thead><tr><th>${dgInd.nivel === 'municipio' ? 'Município' : 'Comunidade'}</th>${porSexo ? '<th>Sexo</th>' : ''}<th>n</th>
      ${colunas.map(c => `<th>${esc(c.r)}</th>`).join('')}</tr></thead><tbody>
    ${grupos.map(g => `<tr><td>${esc(g.nome || '—')}</td>${porSexo ? `<td>${rotSx(g.sx)}</td>` : ''}<td>${dgiNum(g.nv)}</td>${g.sup
      ? `<td class="dgi-oc" colspan="${colunas.length}">menos de 5 fichas — oculto</td>`
      : colunas.map(c => {
          if (c.v === '_media') return `<td>${Number(g.media).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>`
          const d = g.op[c.v]; const pct = d ? Number(d.pct) : 0
          return `<td title="${esc(c.r)}: ${dgiPct(pct)} (${d ? d.n_opcao : 0} de ${g.nv})"><span class="dgi-mini"><i style="width:${Math.round(pct * 0.5)}px"></i>${dgiPct(pct)}</span></td>`
        }).join('')}</tr>`).join('')}</tbody></table></div></div>`
}

function dgIndOculto() {
  return '<div class="dgi-oculto">Menos de 5 fichas neste recorte — números ocultos para não identificar famílias.</div>'
}

// planilha com a mesma tabela que o banco devolveu (nada recalculado)
async function dgIndBaixar() {
  try {
    await dgExpCarregarLib()
    const q = dgInd.quest[dgInd.qid]
    const perg = {}; q.estrutura.blocos.forEach(b => b.perguntas.forEach(p => { perg[p.chave] = Object.assign({ _bloco: b.titulo }, p) }))
    perg._total_moradores = { n: 9, texto: 'Pessoas por domicílio (lista de moradores da P9)', _bloco: 'Identificação e perfil', opcoes: [] }
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Indicadores')
    ws.columns = [
      { header: 'Nº', key: 'n', width: 6 }, { header: 'Bloco', key: 'bloco', width: 24 }, { header: 'Pergunta', key: 'texto', width: 50 },
      { header: 'Recorte', key: 'rec', width: 26 }, { header: 'Sexo do entrevistado', key: 'sx', width: 18 }, { header: 'Opção', key: 'op', width: 28 },
      { header: 'Responderam', key: 'nv', width: 12 }, { header: 'Não responderam', key: 'nnr', width: 12 }, { header: 'Marcaram a opção', key: 'nop', width: 12 },
      { header: '%', key: 'pct', width: 8 }, { header: 'Média', key: 'media', width: 8 }, { header: 'Oculto (< 5 fichas)', key: 'sup', width: 12 }]
    const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D6A4F' } }; h.alignment = { wrapText: true, vertical: 'middle' }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    const genero = new Set((q.estrutura.blocos.find(b => b.id === 'genero') || { perguntas: [] }).perguntas.map(p => p.chave))
    const fonte = dgInd.sexo ? dgInd.dadosSx : dgInd.dados.filter(d => !genero.has(d.chave)).concat(dgInd.dadosSx.filter(d => genero.has(d.chave)))
    fonte.filter(d => d.questionario_id === q.id && perg[d.chave]).forEach(d => {
      const p = perg[d.chave]
      ws.addRow({ n: p.n, bloco: p._bloco, texto: p.texto, rec: d.recorte_nome, sx: d.sexo_respondente ? (DGI_SEXO.find(x => x[0] === d.sexo_respondente) || [0, d.sexo_respondente])[1] : 'Todos',
        op: d.opcao ? ((p.opcoes || []).find(o => o.v === d.opcao) || {}).r || d.opcao : '', nv: Number(d.n_validos), nnr: Number(d.n_nr),
        nop: d.n_opcao == null ? '' : Number(d.n_opcao), pct: d.pct == null ? '' : Number(d.pct), media: d.media == null ? '' : Number(d.media), sup: d.suprimido ? 'Sim' : '' })
    })
    const s = wb.addWorksheet('Sobre'); s.columns = [{ width: 28 }, { width: 90 }]
    ;[['Gerado em', new Date().toLocaleString('pt-BR')], ['Questionário', q.codigo + ' v' + q.versao],
      ['Recorte', { geral: 'Geral', municipio: 'Por município', comunidade: 'Por comunidade' }[dgInd.nivel] + (dgInd.mun ? ' · ' + ((dgInd.municipios.find(m => String(m.ibge) === dgInd.mun) || {}).nome || '') : '')],
      ['Fichas', dgInd.conferencia ? 'validadas + em conferência' : 'só validadas'],
      ['Fonte', 'fn_diag_agregados (vw_diag_indicadores) — nada recalculado'],
      ['Supressão', 'células com menos de 5 fichas saem sem número (coluna "Oculto")']].forEach(l => { const r = s.addRow(l); r.getCell(1).font = { bold: true } })
    const buf = await wb.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a'); a.href = url; a.download = 'diagnostico_indicadores_v' + q.versao + '_' + dgInd.nivel + '_' + new Date().toISOString().slice(0, 10) + '.xlsx'
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000)
  } catch (e) { toast(e.message || String(e), 'error') }
}
