// ═══════════════════════════════════════════════════════════════════════
// diagnostico-exportar.js — exportação .xlsx das fichas (mesa do Diagnóstico)
// ═══════════════════════════════════════════════════════════════════════
// O QUE sai é decidido pelo BANCO: diag_exportar() monta o recorte e grava o
// registro (diag_exportacoes) na mesma transação — não existe exportação sem
// registro. Padrão: sem nome, GPS e nomes dos moradores. Identificada: só
// coordenação/super_admin. Consultor externo: também sem texto aberto e sem
// "especifique" (a RPC nem devolve). Treino nunca sai.
// Este arquivo só transforma o JSON em planilha: códigos viram rótulos pela
// estrutura da versão de cada ficha (o questionário é dado, não código).
//
// Planilha: ExcelJS vendorizado (js/vendor/exceljs-4.4.0.bare.min.js, MIT),
// carregado sob demanda — mesma regra do SIGUC: nunca o pacote "xlsx"/SheetJS
// (versão do npm com CVE e sem estilo de célula).
// ═══════════════════════════════════════════════════════════════════════

const dgExp = { status: { validada: true, enviada: false, devolvida: false, descartada: false }, mun: '', com: '',
                identificada: false, ciente: false, ocupado: false, histHtml: '' }

let _dgExpLib = null
function dgExpCarregarLib() {
  if (window.ExcelJS) return Promise.resolve()
  if (_dgExpLib) return _dgExpLib
  _dgExpLib = new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = '../js/vendor/exceljs-4.4.0.bare.min.js'
    s.onload = res; s.onerror = () => { _dgExpLib = null; rej(new Error('Falha ao carregar a biblioteca de planilha.')) }
    document.head.appendChild(s)
  })
  return _dgExpLib
}

function dgExpFichasBase() { return (dgVal.fichas || []).filter(f => !f.treino) }
function dgExpSelecionadas() {
  return dgExpFichasBase().filter(f => dgExp.status[f.status] &&
    (!dgExp.mun || String(f.municipio_ibge) === dgExp.mun) && (!dgExp.com || f.comunidade_id === dgExp.com))
}

function dgExpAbrir() {
  let ov = document.getElementById('dge-ov')
  if (!ov) {
    ov = document.createElement('div')
    ov.id = 'dge-ov'; ov.className = 'dgv-ov dge-ov'
    ov.addEventListener('click', ev => { if (ev.target === ov) dgExpFechar() })
    document.body.appendChild(ov)   // fora do #app (z-index da sidebar)
  }
  dgExp.identificada = false; dgExp.ciente = false
  ov.hidden = false
  dgExpDesenhar()
}
function dgExpFechar() { const ov = document.getElementById('dge-ov'); if (ov) ov.hidden = true }

function dgExpDesenhar() {
  const base = dgExpFichasBase()
  const conta = s => base.filter(f => f.status === s).length
  const sel = dgExpSelecionadas()
  const muns = {}; base.forEach(f => { muns[f.municipio_ibge] = dgVal.municipios[f.municipio_ibge] || f.municipio_ibge })
  const coms = {}; base.filter(f => f.comunidade_id && (!dgExp.mun || String(f.municipio_ibge) === dgExp.mun))
    .forEach(f => { coms[f.comunidade_id] = dgVal.comunidades[f.comunidade_id] || '—' })
  const opts = (o, v) => Object.entries(o).sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .map(([k, r]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(r)}</option>`).join('')
  const st = [['validada', 'Validadas'], ['enviada', 'Aguardando validação'], ['devolvida', 'Devolvidas'], ['descartada', 'Descartadas']]
  const bloqueado = !sel.length || (dgExp.identificada && !dgExp.ciente) || dgExp.ocupado
  document.getElementById('dge-ov').innerHTML = `<div class="dge-modal" role="dialog" aria-modal="true" aria-labelledby="dge-tit">
    <header><h2 id="dge-tit">Exportar planilha (.xlsx)</h2>
      <p>Uso interno da SEMA. Toda exportação fica registrada: quem, quando, quais fichas.</p></header>
    <div class="dge-corpo">
      <p class="dge-sec">Quais fichas</p>
      <div class="dge-linha">${st.map(([s, r]) => `<label class="dgv-check"><input type="checkbox" ${dgExp.status[s] ? 'checked' : ''}
        onchange="dgExp.status['${s}']=this.checked;dgExpDesenhar()"> ${r} <b>${conta(s)}</b></label>`).join('')}</div>
      <div class="dgv-filtros">
        <label>Município<select onchange="dgExp.mun=this.value;dgExp.com='';dgExpDesenhar()"><option value="">Todos</option>${opts(muns, dgExp.mun)}</select></label>
        <label>Comunidade<select onchange="dgExp.com=this.value;dgExpDesenhar()"><option value="">Todas</option>${opts(coms, dgExp.com)}</select></label>
      </div>
      <p class="dge-sec">Tipo</p>
      <label class="dge-op ${dgExp.identificada ? '' : 'on'}"><input type="radio" name="dge-tipo" ${dgExp.identificada ? '' : 'checked'}
        onchange="dgExp.identificada=false;dgExpDesenhar()"><span><b>Padrão — sem identificação</b>
        <small>Sem nome do entrevistado, sem nomes dos moradores, sem GPS. Localização só por comunidade.
        ${dgPodeGerir ? 'Inclui os textos abertos.' : 'Sem os textos abertos e sem os “especifique” (inclui a P55).'}</small></span></label>
      ${dgPodeGerir ? `<label class="dge-op dge-ident ${dgExp.identificada ? 'on' : ''}"><input type="radio" name="dge-tipo" ${dgExp.identificada ? 'checked' : ''}
        onchange="dgExp.identificada=true;dgExpDesenhar()"><span><b>Identificada</b>
        <small>Inclui nome do entrevistado, GPS e nomes dos moradores. Só para a coordenação.</small>
        ${dgExp.identificada ? `<span class="dge-alerta">Contém dado pessoal (inclusive de crianças). Não envie por e-mail nem salve em pasta compartilhada.
          <label><input type="checkbox" id="dge-ciente" ${dgExp.ciente ? 'checked' : ''} onchange="dgExp.ciente=this.checked;dgExpDesenhar()"> Entendi — uso interno da SEMA</label></span>` : ''}
        </span></label>` : ''}
      <p class="dge-sec">A planilha terá 4 abas</p>
      <div class="dge-abas"><span><b>Fichas</b> · 1 linha por ficha, 1 coluna por pergunta, respostas por extenso</span>
        <span><b>Moradores</b> · 1 linha por morador (P9)</span><span><b>Dicionário</b> · código × pergunta × opções</span>
        <span><b>Sobre</b> · data, quem exportou, filtros, versão e hash do questionário</span></div>
    </div>
    <footer><span id="dge-resumo">${sel.length} ficha${sel.length === 1 ? '' : 's'}</span>
      <span class="dge-botoes"><button type="button" class="btn btn-secondary" onclick="dgExpFechar()">Cancelar</button>
      <button type="button" class="btn btn-primary" id="dge-exportar" ${bloqueado ? 'disabled' : ''} onclick="dgExpExportar()">${dgExp.ocupado ? 'Gerando…' : 'Exportar'}</button></span></footer>
  </div>`
}

async function dgExpExportar() {
  if (dgExp.ocupado) return
  dgExp.ocupado = true; dgExpDesenhar()
  try {
    const status = Object.keys(dgExp.status).filter(s => dgExp.status[s])
    const [lib, r] = await Promise.all([dgExpCarregarLib(), db.rpc('diag_exportar', {
      p_identificada: dgExp.identificada, p_status: status,
      p_municipio_ibge: dgExp.mun ? Number(dgExp.mun) : null, p_comunidade_id: dgExp.com || null })])
    void lib
    if (r.error) throw new Error(dgMsgErro(r.error))
    const buf = await dgExpPlanilha(r.data, status)
    const nome = 'diagnostico_fichas_' + (r.data.identificada ? 'IDENTIFICADA' : 'padrao') + '_' +
      new Date().toISOString().slice(0, 10) + '.xlsx'
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    toast('Planilha gerada: ' + r.data.fichas.length + ' ficha(s). Exportação registrada (nº ' + r.data.exportacao_id + ').', 'success')
    dgExpFechar()
    if (dgPodeGerir) dgExpHistorico()
  } catch (e) {
    toast(e.message || String(e), 'error')
  } finally {
    dgExp.ocupado = false
    if (!document.getElementById('dge-ov').hidden) dgExpDesenhar()
  }
}

// ── JSON da RPC → planilha ─────────────────────────────────────────────
function dgExpPerguntasUniao(questionarios) {
  // ordem da versão mais nova; pergunta que só existe em versão antiga entra no fim
  const vistas = new Map()
  ;[...questionarios].sort((a, b) => b.versao - a.versao).forEach(q => {
    ;(q.estrutura.blocos || []).forEach(b => b.perguntas.forEach(p => {
      if (p.coluna_fixa || p.tipo === 'tabela' || p.destino === 'identificacao') return
      if (!vistas.has(p.chave)) vistas.set(p.chave, Object.assign({}, p, { _bloco: b.titulo, _versoes: [] }))
      vistas.get(p.chave)._versoes.push(q.versao)
    }))
  })
  return [...vistas.values()]
}

function dgExpRotulo(p, v) {
  if (v === undefined || v === null || v === '') return ''
  if (v === '_nr') return 'Não respondeu'
  const r = x => ((p.opcoes || []).find(o => o.v === x) || {}).r || x
  if (Array.isArray(v)) return v.map(r).join('; ')
  if (p.tipo === 'unica') return r(v)
  return v
}

async function dgExpPlanilha(d, status) {
  const qs = d.questionarios || []
  const porId = {}; qs.forEach(q => { porId[q.id] = q })
  const porChaveVersao = q => { const m = {}; (q.estrutura.blocos || []).forEach(b => b.perguntas.forEach(p => { m[p.chave] = p })); return m }
  const mapas = {}; qs.forEach(q => { mapas[q.id] = porChaveVersao(q) })
  const perguntas = dgExpPerguntasUniao(qs)
  const comTexto = !!d.com_texto, ident = !!d.identificada, gerir = dgPodeGerir
  const temEspecifique = p => (p.opcoes || []).some(o => o.especificar)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'DIMA · Diagnóstico Socioambiental'; wb.created = new Date()
  const VERDE = 'FF2D6A4F'
  const cabecalho = (ws, colunas) => {
    ws.columns = colunas.map(c => ({ header: c.h, key: c.k, width: c.w || 18 }))
    const h = ws.getRow(1)
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
    h.alignment = { vertical: 'middle', wrapText: true }
    h.height = 48
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } }
  }
  const data = s => s ? new Date(String(s).length === 10 ? s + 'T12:00:00' : s) : null

  // ── Fichas
  const wsF = wb.addWorksheet('Fichas')
  const colF = [
    { h: 'Código', k: 'codigo', w: 26 }, { h: 'Versão', k: 'versao', w: 8 }, { h: 'Situação', k: 'status', w: 14 },
    { h: 'Município', k: 'municipio' }, { h: 'Comunidade', k: 'comunidade', w: 26 }, { h: 'Comunidade nova (não cadastrada)', k: 'com_nova', w: 12 },
    { h: 'Sublocalidade', k: 'localidade', w: 22 }, { h: 'Data da entrevista', k: 'dt', w: 12 }, { h: 'Aceitou participar', k: 'aceitou', w: 10 },
    { h: 'Enviada em', k: 'enviado', w: 16 }, { h: 'Validada em', k: 'validado', w: 16 }, { h: 'Avisos', k: 'avisos', w: 8 },
  ]
  if (gerir) colF.push({ h: 'Entrevistador(a)', k: 'entrevistador', w: 22 }, { h: 'Motivo da devolução', k: 'motivo', w: 30 })
  if (ident) colF.push({ h: 'Nome do entrevistado', k: 'nome', w: 24 }, { h: 'Latitude', k: 'lat', w: 11 },
    { h: 'Longitude', k: 'lon', w: 11 }, { h: 'Precisão GPS (m)', k: 'gps', w: 9 }, { h: 'Referência de localização', k: 'obs', w: 28 },
    { h: 'Identificação apagada (retenção)', k: 'apagada', w: 12 })
  perguntas.forEach(p => {
    if (!comTexto && (p.tipo === 'texto' || p.tipo === 'texto_longo')) return
    colF.push({ h: 'P' + p.n + ' · ' + p.texto, k: 'q_' + p.chave, w: p.tipo === 'texto_longo' ? 40 : 22 })
    if (comTexto && temEspecifique(p)) colF.push({ h: 'P' + p.n + ' · especifique', k: 'q_' + p.chave + '_outro', w: 20 })
  })
  cabecalho(wsF, colF)
  const ROT = { enviada: 'Aguardando validação', devolvida: 'Devolvida', validada: 'Validada', descartada: 'Descartada' }
  d.fichas.forEach(f => {
    const q = porId[f.questionario_id] || {}
    const mp = mapas[f.questionario_id] || {}
    const lin = {
      codigo: f.codigo, versao: q.versao, status: ROT[f.status] || f.status, municipio: f.municipio, comunidade: f.comunidade,
      com_nova: f.comunidade_nova ? 'Sim' : 'Não', localidade: f.localidade || '', dt: data(f.dt_entrevista),
      aceitou: f.aceitou_participar ? 'Sim' : 'Não', enviado: data(f.enviado_em), validado: data(f.validado_em),
      avisos: (f.alertas || []).length, entrevistador: f.entrevistador || '', motivo: f.motivo_devolucao || '',
      nome: f.entrevistado_nome || '', lat: f.lat ?? '', lon: f.lon ?? '', gps: f.gps_precisao_m ?? '', obs: f.obs_localizacao || '',
      apagada: f.identificacao_apagada ? 'Sim' : '',
    }
    const resp = f.respostas || {}
    perguntas.forEach(p => {
      const pv = mp[p.chave] || p
      lin['q_' + p.chave] = dgExpRotulo(pv, resp[p.chave])
      lin['q_' + p.chave + '_outro'] = resp[p.chave + '_outro'] || ''
    })
    wsF.addRow(lin)
  })
  ;['dt', 'enviado', 'validado'].forEach(k => { wsF.getColumn(k).numFmt = k === 'dt' ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm' })

  // ── Moradores
  const wsM = wb.addWorksheet('Moradores')
  const colM = [{ h: 'Código da ficha', k: 'codigo', w: 26 }, { h: 'Ordem', k: 'ordem', w: 7 }, { h: 'É o(a) entrevistado(a)', k: 'entr', w: 11 }]
  if (ident) colM.push({ h: 'Nome ou iniciais', k: 'nome', w: 22 })
  colM.push({ h: 'Idade', k: 'idade', w: 7 }, { h: 'Sexo/gênero', k: 'sexo', w: 16 })
  if (gerir) colM.push({ h: 'Sexo/gênero · especifique', k: 'sexo_outro', w: 16 })
  colM.push({ h: 'Parentesco', k: 'parentesco', w: 16 }, { h: 'Escolaridade', k: 'escolaridade', w: 26 }, { h: 'Atividade principal', k: 'atividade', w: 22 })
  cabecalho(wsM, colM)
  const fichaPorCodigo = {}; d.fichas.forEach(f => { fichaPorCodigo[f.codigo] = f })
  d.moradores.forEach(m => {
    const q = porId[(fichaPorCodigo[m.codigo] || {}).questionario_id]
    const cols = q ? q.estrutura.moradores.colunas : []
    const rot = (chave, v) => { const c = cols.find(x => x.chave === chave); return c && c.tipo === 'unica' ? dgExpRotulo(c, v) : (v === '_nr' ? 'Não respondeu' : v || '') }
    wsM.addRow({ codigo: m.codigo, ordem: m.ordem, entr: m.e_entrevistado ? 'Sim' : 'Não', nome: m.nome || '', idade: m.idade ?? '',
      sexo: rot('sexo_genero', m.sexo_genero), sexo_outro: m.sexo_genero_outro || '', parentesco: rot('parentesco', m.parentesco),
      escolaridade: rot('escolaridade', m.escolaridade), atividade: rot('atividade_principal', m.atividade_principal) })
  })

  // ── Dicionário
  const wsD = wb.addWorksheet('Dicionário')
  cabecalho(wsD, [{ h: 'Nº', k: 'n', w: 6 }, { h: 'Chave', k: 'chave', w: 28 }, { h: 'Bloco', k: 'bloco', w: 26 },
    { h: 'Pergunta', k: 'texto', w: 60 }, { h: 'Tipo', k: 'tipo', w: 12 }, { h: 'Opções (código = rótulo)', k: 'opcoes', w: 70 },
    { h: 'Versões', k: 'versoes', w: 10 }, { h: 'Na planilha', k: 'na', w: 26 }])
  const TIPO = { unica: 'única', multipla: 'múltipla (;)', inteiro: 'número', decimal: 'número', texto: 'texto', texto_longo: 'texto', data: 'data' }
  perguntas.forEach(p => {
    const txt = p.tipo === 'texto' || p.tipo === 'texto_longo'
    wsD.addRow({ n: p.n, chave: p.chave, bloco: p._bloco, texto: p.texto, tipo: TIPO[p.tipo] || p.tipo,
      opcoes: (p.opcoes || []).map(o => o.v + ' = ' + o.r).join(' | '), versoes: p._versoes.sort().join(', '),
      na: !comTexto && txt ? 'não (texto aberto)' : p.derivada ? 'sim (calculada pelos moradores)' : 'sim' })
  })
  const colsMor = qs.length ? [...qs].sort((a, b) => b.versao - a.versao)[0].estrutura.moradores.colunas : []
  colsMor.filter(c => c.destino !== 'identificacao' || ident).forEach(c => wsD.addRow({ n: 9, chave: 'moradores.' + c.chave, bloco: 'Moradores (P9)',
    texto: c.rotulo, tipo: TIPO[c.tipo] || c.tipo, opcoes: (c.opcoes || []).map(o => o.v + ' = ' + o.r).join(' | '), versoes: '', na: 'aba Moradores' }))
  wsD.addRow({})
  wsD.addRow({ texto: '"Não respondeu" = o(a) entrevistado(a) não respondeu. Célula vazia = a pergunta não se aplicava (salto) ou ficou em branco.' })

  // ── Sobre
  const wsS = wb.addWorksheet('Sobre')
  wsS.columns = [{ width: 30 }, { width: 90 }]
  const filtros = []
  filtros.push('Situação: ' + status.map(s => ROT[s]).join(', '))
  if (dgExp.mun) filtros.push('Município: ' + (dgVal.municipios[dgExp.mun] || dgExp.mun))
  if (dgExp.com) filtros.push('Comunidade: ' + (dgVal.comunidades[dgExp.com] || dgExp.com))
  ;[
    ['Diagnóstico Socioambiental', 'Projeto 218BRA2001 · SEMA/AC'],
    ['Gerado em', new Date(d.gerado_em).toLocaleString('pt-BR')],
    ['Exportado por', (appState.usuario && (appState.usuario.nome_completo || appState.usuario.email)) || ''],
    ['Tipo', ident ? 'IDENTIFICADA (nome, GPS e nomes dos moradores)' : 'Padrão — sem identificação'],
    ['Textos abertos', comTexto ? 'incluídos' : 'não incluídos (consultor externo)'],
    ['Filtros', filtros.join(' · ')],
    ['Fichas', d.fichas.length], ['Moradores', d.moradores.length],
    ['Registro da exportação', 'nº ' + d.exportacao_id + ' (diag_exportacoes)'],
    ...qs.map(q => ['Questionário ' + q.codigo + ' v' + q.versao, 'SHA-256 ' + q.hash_sha256]),
    ['Treino', 'Fichas de treino (TRE-) nunca entram.'],
    ['Uso', 'Uso interno da SEMA. Dado pessoal e sensível (LGPD, TRAT-001). Não compartilhar fora da SEMA.'],
  ].forEach(l => { const r = wsS.addRow(l); r.getCell(1).font = { bold: true } })
  if (ident) {
    const r = wsS.getRow(4); r.getCell(2).font = { bold: true, color: { argb: 'FFB91C1C' } }
  }
  return wb.xlsx.writeBuffer()
}

// ── Últimas exportações (só gerir: a policy de diag_exportacoes filtra) ─
async function dgExpHistorico() {
  const el = document.getElementById('dgv-exportacoes')
  if (!el || !dgPodeGerir) return
  const { data, error } = await db.from('diag_exportacoes')
    .select('id,usuario_id,perfil,identificada,com_texto,filtros,n_fichas,criado_em').order('criado_em', { ascending: false }).limit(10)
  if (error) return
  if (!data || !data.length) {
    el.innerHTML = dgExp.histHtml = '<div class="card"><p class="dge-sec">Últimas exportações</p><p style="font-size:13px;color:var(--cinza-500);margin:0">Nenhuma exportação ainda.</p></div>'
    return
  }
  const ids = [...new Set(data.map(x => x.usuario_id))].filter(i => !dgVal.usuarios[i])
  if (ids.length) {
    const { data: us } = await db.from('usuarios').select('id,nome_completo').in('id', ids)
    ;(us || []).forEach(u => { dgVal.usuarios[u.id] = u.nome_completo })
  }
  const ROT = { enviada: 'aguardando', devolvida: 'devolvidas', validada: 'validadas', descartada: 'descartadas' }
  el.innerHTML = dgExp.histHtml = `<div class="card"><p class="dge-sec">Últimas exportações <small>(só a coordenação vê)</small></p>
    <div style="overflow-x:auto"><table class="dgv-tab dge-hist"><thead><tr><th>Quando</th><th>Quem</th><th>Tipo</th><th>Fichas</th><th>Filtro</th></tr></thead><tbody>
    ${data.map(x => {
      const fl = x.filtros || {}
      const filtro = [(fl.status || []).map(s => ROT[s] || s).join(', '), fl.municipio_ibge ? dgVal.municipios[fl.municipio_ibge] || fl.municipio_ibge : '',
        fl.comunidade_id ? dgVal.comunidades[fl.comunidade_id] || 'comunidade' : ''].filter(Boolean).join(' · ')
      const tipo = x.identificada ? '<span class="dge-tag i">Identificada</span>'
        : x.com_texto ? '<span class="dge-tag p">Padrão</span>' : '<span class="dge-tag c">Consultor · sem textos</span>'
      return `<tr style="cursor:default"><td>${dgValDataHora(x.criado_em)}</td><td>${esc(dgVal.usuarios[x.usuario_id] || '—')}</td><td>${tipo}</td><td>${x.n_fichas}</td><td>${esc(filtro)}</td></tr>`
    }).join('')}</tbody></table></div></div>`
}
