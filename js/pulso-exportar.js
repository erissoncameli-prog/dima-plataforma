// ═══════════════════════════════════════════════════════════════════════
// pulso-exportar.js — exportação do Pulso da Equipe
// ═══════════════════════════════════════════════════════════════════════
// SÓ AGREGADOS: os dados vêm de fn_pulso_exportar (= fn_pulso_resultado +
// registro em pulso_exportacoes). Nenhuma resposta individual sai daqui, e
// ciclo com < 5 respostas é recusado pelo banco (pulso:exportacao_suprimida).
// Formatos: planilha (ExcelJS, js/vendor), relatório A4 (janela + imprimir) e
// apresentação (PptxGenJS 3.12.0, MIT, js/vendor). Bibliotecas carregadas
// só no clique. Lista de ciclos do painel: fn_pulso_exportar_lista.
// ═══════════════════════════════════════════════════════════════════════

const PUX_COR = { verde: '1F4E2C', verde2: '24704A', claro: '52B788', cinza: '6B7280', borda: 'E5E7EB',
  d: ['A8471F', 'EE9E72', 'D5D8DC', '7EA9D9', '1F5AA0'] }
const PUX_LIB = {}

function puxLib(src, global) {
  if (window[global]) return Promise.resolve()
  if (PUX_LIB[src]) return PUX_LIB[src]
  PUX_LIB[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src
    s.onload = res; s.onerror = () => { delete PUX_LIB[src]; rej(new Error('Não foi possível carregar a biblioteca de exportação.')) }
    document.head.appendChild(s)
  })
  return PUX_LIB[src]
}

const puxNum = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const puxSinal = v => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v)
const puxData = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
const puxE = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
function puxArquivo(titulo, ext) {
  const base = String(titulo || 'pulso').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60)
  return 'pulso-' + base + '-' + new Date().toISOString().slice(0, 10) + '.' + ext
}
function puxBaixar(blob, nome) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
function puxParticipacao(R) {
  const p = R.participacao || {}
  return { cad: p.cadastrados || 0, conv: p.convidados || 0, ativos: p.usuarios_ativos || 0,
    pct: p.usuarios_ativos ? Math.round((p.cadastrados || 0) / p.usuarios_ativos * 100) : null }
}

// Busca no banco (registra) e despacha para o formato.
async function pulsoExportar(cicloId, formato) {
  const { data, error } = await db.rpc('fn_pulso_exportar', { p_ciclo: cicloId, p_formato: formato })
  if (error) throw new Error(/exportacao_suprimida/.test(error.message)
    ? 'O ciclo precisa de pelo menos 5 respostas para ser exportado (anonimato).' : pulsoErro(error))
  if (formato === 'xlsx') return puxXlsx(data)
  if (formato === 'a4') return puxA4(data)
  if (formato === 'pptx') return puxPptx(data)
}

// ── Planilha ──────────────────────────────────────────────────────────
async function puxXlsx(R) {
  await puxLib('../js/vendor/exceljs-4.4.0.bare.min.js', 'ExcelJS')
  const wb = new ExcelJS.Workbook(); wb.creator = 'DIMA · Pulso da Equipe'; wb.created = new Date()
  const g = R.geral, pp = g.por_pergunta, P = R.perguntas, part = puxParticipacao(R), L = pulsoLeitura(g, P)
  const cab = ws => { const r = ws.getRow(1); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + PUX_COR.verde } }; ws.views = [{ state: 'frozen', ySplit: 1 }] }

  const res = wb.addWorksheet('Resumo')
  res.columns = [{ header: 'Item', key: 'k', width: 34 }, { header: 'Valor', key: 'v', width: 70 }]
  ;[['Ciclo', R.ciclo.titulo], ['Criado por', R.autor], ['Criado em', puxData(R.ciclo.criado_em)],
    ['Situação', R.ciclo.status === 'aberto' ? 'Aberto' : 'Encerrado'], ['Perguntas', P.length],
    ['Respostas', R.n], ['Cadastrados que responderam', part.cad + (part.pct != null ? ' de ' + part.ativos + ' usuários ativos (' + part.pct + '%)' : '')],
    ['Convidados', part.conv], ['Comprometimento (0–100)', g.comprometimento ?? '—'], ['Sintonia (0–100)', g.sintonia ?? '—'],
    ['eNPS (−100 a +100)', g.enps ?? '—'], ['Leitura', L ? L.titulo + ' — ' + L.texto : '—'],
    ['Exportado por', R.exportado_por + ' em ' + new Date(R.exportado_em).toLocaleString('pt-BR')],
    ['Anonimato', 'Só agregados. Recortes com menos de 5 respostas não aparecem. Comentários embaralhados e sem perfil.']
  ].forEach(([k, v]) => res.addRow({ k, v }))
  cab(res); res.getColumn(2).alignment = { wrapText: true, vertical: 'top' }

  const per = wb.addWorksheet('Perguntas')
  per.columns = [{ header: 'Nº', key: 'i', width: 5 }, { header: 'Tema', key: 'tema', width: 18 }, { header: 'Pergunta', key: 'txt', width: 60 },
    { header: 'Tipo', key: 'tipo', width: 16 }, { header: 'Respostas', key: 'n', width: 10 }, { header: 'Média', key: 'm', width: 9 },
    { header: 'Média ajustada', key: 'ma', width: 14 }, { header: 'Desvio-padrão', key: 'dp', width: 13 }, { header: 'Alinhamento', key: 'al', width: 13 },
    { header: 'Expectativa', key: 'esp', width: 12 }, { header: 'Distribuição (contagem)', key: 'dist', width: 44 }]
  P.forEach((q, i) => {
    const m = pp[q.chave] || {}
    const dist = q.tipo === 'escala' ? (m.distribuicao || []).map((v, j) => (j + 1) + ': ' + v).join(' · ')
      : q.tipo === 'nps' ? (m.distribuicao || []).map((v, j) => j + ': ' + v).join(' · ')
      : q.tipo === 'escolha' ? q.opcoes.map((o, j) => o + ': ' + ((m.contagem || [])[j] || 0)).join(' · ') : ''
    per.addRow({ i: i + 1, tema: q.tema, txt: q.texto, tipo: (PULSO_TIPOS[q.tipo]?.curto || q.tipo) + (q.invertida ? ' (invertida)' : ''), n: m.n ?? 0,
      m: m.media ?? null, ma: q.tipo === 'escala' ? m.media_ajustada : null, dp: m.dp ?? null, al: pulsoDispersao(m.dp),
      esp: R.espelho?.medias?.[q.chave] ?? null, dist })
  })
  cab(per); per.getColumn('txt').alignment = { wrapText: true, vertical: 'top' }

  const escolhas = P.filter(q => q.tipo === 'escolha')
  if (escolhas.length) {
    const es = wb.addWorksheet('Escolhas')
    es.columns = [{ header: 'Pergunta', key: 'q', width: 46 }, { header: 'Opção', key: 'o', width: 34 }, { header: 'Contagem', key: 'c', width: 11 }, { header: '%', key: 'p', width: 8 }]
    escolhas.forEach(q => { const m = pp[q.chave] || {}; q.opcoes.forEach((o, j) => { const c = (m.contagem || [])[j] || 0; es.addRow({ q: q.tema + ' — ' + q.texto, o, c, p: m.n ? Math.round(c / m.n * 100) : 0 }) }) })
    cab(es)
  }

  const gr = wb.addWorksheet('Por perfil')
  const escalas = P.filter(q => q.tipo === 'escala')
  gr.columns = [{ header: 'Grupo', key: 'g', width: 20 }, { header: 'Respostas', key: 'n', width: 10 }]
    .concat(escalas.map(q => ({ header: q.tema, key: 'e_' + q.chave, width: 12 })))
    .concat([{ header: 'Comprometimento', key: 'c', width: 15 }, { header: 'Sintonia', key: 's', width: 10 }, { header: 'eNPS', key: 'nps', width: 8 }])
  ;(R.grupos || []).forEach(x => {
    const linha = { g: PULSO_GRUPOS[x.grupo] || x.grupo, n: x.n, c: x.comprometimento, s: x.sintonia, nps: x.enps }
    escalas.forEach(q => { linha['e_' + q.chave] = x.por_pergunta[q.chave]?.media ?? null })
    gr.addRow(linha)
  })
  if (!(R.grupos || []).length) gr.addRow({ g: 'Nenhum perfil com 5 respostas ou mais (recorte oculto).' })
  cab(gr)

  const co = wb.addWorksheet('Comentários')
  co.columns = [{ header: 'Pergunta', key: 'q', width: 40 }, { header: 'Comentário (ordem embaralhada, sem perfil)', key: 't', width: 90 }]
  P.filter(q => q.tipo === 'texto').forEach(q => ((R.textos || {})[q.chave] || []).forEach(t => co.addRow({ q: q.tema, t })))
  cab(co); co.getColumn('t').alignment = { wrapText: true, vertical: 'top' }

  const buf = await wb.xlsx.writeBuffer()
  puxBaixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), puxArquivo(R.ciclo.titulo, 'xlsx'))
}

// ── Relatório A4 (imprimir / salvar em PDF) ───────────────────────────
const PUX_A4_CSS = `*{box-sizing:border-box}body{font:11px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111827;margin:24px auto;max-width:780px;padding:0 16px}
h1{font-size:18px;color:#1F4E2C;margin:0}.sub{color:#6B7280;font-size:10px;margin:2px 0 14px}
h2{font-size:12px;color:#1F4E2C;border-bottom:2px solid #1F4E2C;padding-bottom:3px;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.04em}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.kpi{border:1px solid #E5E7EB;border-radius:6px;padding:8px 10px}
.kpi b{display:block;font-size:20px;line-height:1.1}.kpi span{color:#6B7280;font-size:9px}
.lei{border-left:4px solid #24704A;background:#F3F7F4;border-radius:6px;padding:8px 12px}.lei b{font-size:13px}
.q{padding:8px 0;border-bottom:1px solid #E5E7EB;break-inside:avoid}.q em{font-style:normal;font-size:9px;font-weight:700;color:#24704A;text-transform:uppercase;letter-spacing:.05em}
.q .l{display:flex;justify-content:space-between;gap:12px}.q .m{white-space:nowrap;color:#374151}
.pilha{display:flex;gap:1px;height:14px;margin-top:5px;border-radius:4px;overflow:hidden}.pilha i{display:block;height:100%;font-style:normal;font-size:8px;font-weight:700;text-align:center;line-height:14px;color:#111}
.op{display:grid;grid-template-columns:200px 1fr 60px;gap:8px;align-items:center;margin-top:3px}.op .b{height:10px;background:#EEF1EF;border-radius:3px}.op .b i{display:block;height:100%;background:#24704A;border-radius:3px}
.leg{display:flex;gap:10px;flex-wrap:wrap;color:#6B7280;font-size:9px}.leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
table{width:100%;border-collapse:collapse}th{font-size:9px;text-transform:uppercase;color:#6B7280;text-align:left;background:#F0F7F2;border-bottom:2px solid #1F4E2C;padding:4px 6px}
td{padding:4px 6px;border-bottom:1px solid #E5E7EB}.n{text-align:right}.com{border:1px solid #E5E7EB;border-radius:6px;padding:6px 9px;margin:5px 0;break-inside:avoid}
.nota{color:#6B7280;font-size:9px;margin-top:14px}
@media print{@page{size:A4;margin:12mm}body{margin:0;max-width:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`

function puxPilhaHTML(partes) {
  const n = partes.reduce((a, x) => a + x[0], 0) || 1
  return '<div class="pilha">' + partes.map(([v, cor]) => v ? '<i style="flex:' + v + ';background:#' + cor + ';color:' + (['A8471F', '1F5AA0'].includes(cor) ? '#fff' : '#111') + '">' + (v / n >= .12 ? Math.round(v / n * 100) + '%' : '') + '</i>' : '').join('') + '</div>'
}

function puxA4(R) {
  const w = window.open('', '_blank')
  if (!w) { toast('Permita pop-ups neste site para gerar o relatório.', 'warning'); return }
  const g = R.geral, pp = g.por_pergunta, P = R.perguntas, part = puxParticipacao(R), L = pulsoLeitura(g, P)
  const kp = []
  if (g.comprometimento != null) kp.push(['Comprometimento', g.comprometimento + '/100'])
  if (g.sintonia != null) kp.push(['Sintonia', g.sintonia + '/100'])
  if (g.enps != null) kp.push(['eNPS', puxSinal(g.enps)])
  kp.push(['Respostas', R.n + (part.pct != null ? ' · ' + part.pct + '%' : '')])
  const perguntas = P.map((q, i) => {
    const m = pp[q.chave] || {}
    let corpo = '', dir = ''
    if (q.tipo === 'escala') {
      dir = 'média <b>' + puxNum(m.media) + '</b> · ' + pulsoDispersao(m.dp) + (R.espelho?.medias?.[q.chave] != null ? ' · expectativa ' + puxNum(R.espelho.medias[q.chave]) : '')
      corpo = puxPilhaHTML((m.distribuicao || []).map((v, j) => [v, PUX_COR.d[j]]))
    } else if (q.tipo === 'nps') {
      const d = m.distribuicao || []
      dir = 'média <b>' + puxNum(m.media) + '</b> · eNPS <b>' + puxSinal(m.enps) + '</b>'
      corpo = puxPilhaHTML([[d.slice(0, 7).reduce((a, b) => a + b, 0), PUX_COR.d[0]], [(d[7] || 0) + (d[8] || 0), PUX_COR.d[2]], [(d[9] || 0) + (d[10] || 0), PUX_COR.d[4]]])
    } else if (q.tipo === 'escolha') {
      dir = (m.n || 0) + ' respostas'
      corpo = q.opcoes.map((o, j) => { const v = (m.contagem || [])[j] || 0, pc = m.n ? Math.round(v / m.n * 100) : 0
        return '<div class="op"><span>' + puxE(o) + '</span><span class="b"><i style="width:' + pc + '%"></i></span><span class="n">' + pc + '% (' + v + ')</span></div>' }).join('')
    } else dir = (m.n || 0) + ' comentários (abaixo)'
    return '<div class="q"><div class="l"><div><em>' + (i + 1) + ' · ' + puxE(q.tema) + ' · ' + puxE(PULSO_TIPOS[q.tipo]?.curto || q.tipo) + (q.invertida ? ' · invertida' : '') + '</em><br>' + puxE(q.texto) + '</div><div class="m">' + dir + '</div></div>' + corpo + '</div>'
  }).join('')
  const escalas = P.filter(q => q.tipo === 'escala')
  const grupos = (R.grupos || []).length ? '<table><thead><tr><th>Grupo</th><th class="n">Resp.</th>' + escalas.map(q => '<th class="n">' + puxE(q.tema) + '</th>').join('') + '<th class="n">Compr.</th><th class="n">Sint.</th></tr></thead><tbody>' +
    R.grupos.map(x => '<tr><td>' + puxE(PULSO_GRUPOS[x.grupo] || x.grupo) + '</td><td class="n">' + x.n + '</td>' + escalas.map(q => '<td class="n">' + puxNum(x.por_pergunta[q.chave]?.media) + '</td>').join('') + '<td class="n">' + (x.comprometimento ?? '—') + '</td><td class="n">' + (x.sintonia ?? '—') + '</td></tr>').join('') + '</tbody></table>'
    : '<p class="nota">Nenhum perfil com 5 respostas ou mais — recorte oculto para proteger o anonimato.</p>'
  const textos = P.filter(q => q.tipo === 'texto').map(q => { const t = (R.textos || {})[q.chave] || []
    return '<h2>' + puxE(q.tema) + ' (' + t.length + ')</h2><p class="nota" style="margin:0 0 4px">' + puxE(q.texto) + '</p>' + (t.length ? t.map(x => '<div class="com">' + puxE(x) + '</div>').join('') : '<p class="nota">Nenhum comentário.</p>') }).join('')

  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${puxE('Pulso da Equipe — ' + R.ciclo.titulo)}</title><style>${PUX_A4_CSS}</style></head><body>
    <h1>Pulso da Equipe — ${puxE(R.ciclo.titulo)}</h1>
    <div class="sub">Projeto 218BRA2001 · SEMA/AC · UNESCO — criado por ${puxE(R.autor || '—')} em ${puxData(R.ciclo.criado_em)} · exportado em ${new Date(R.exportado_em).toLocaleString('pt-BR')} por ${puxE(R.exportado_por || '')}</div>
    <div class="kpis">${kp.map(k => '<div class="kpi"><span>' + k[0] + '</span><b>' + k[1] + '</b></div>').join('')}</div>
    <p class="nota" style="margin-top:6px">Participação: ${part.cad} cadastrados${part.pct != null ? ' de ' + part.ativos + ' usuários ativos' : ''} · ${part.conv} convidados.</p>
    ${L ? '<h2>Leitura</h2><div class="lei"><b>' + puxE(L.titulo) + '.</b> ' + puxE(L.texto) + (L.pior ? '<br>Mais baixo: <b>' + puxE(L.pior.tema) + '</b> (' + puxNum(L.pior.valor) + ')' : '') + (L.dividida ? ' · mais dividida: <b>' + puxE(L.dividida.tema) + '</b> (dp ' + puxNum(L.dividida.valor, 2) + ')' : '') + '</div>' : ''}
    <h2>Por pergunta</h2>${escalas.length ? '<div class="leg">' + PULSO_LIKERT.map((t, k) => '<span><i style="background:#' + PUX_COR.d[k] + '"></i>' + t + '</span>').join('') + '</div>' : ''}${perguntas}
    <h2>Por perfil</h2>${grupos}
    ${textos}
    <p class="nota">Anonimato: só números agregados; recortes com menos de 5 respostas não aparecem; comentários embaralhados e sem perfil. Comprometimento = média das perguntas de escala em 0–100; Sintonia = 100 − dispersão média; eNPS = % notas 9–10 − % notas 0–6.</p>
    </body></html>`)
  w.document.close(); w.focus()
  setTimeout(() => { try { w.print() } catch (e) {} }, 500)
}

// ── Apresentação (PowerPoint) ─────────────────────────────────────────
async function puxPptx(R) {
  await puxLib('../js/vendor/pptxgenjs-3.12.0.bundle.js', 'PptxGenJS')
  const pp = R.geral.por_pergunta, P = R.perguntas, g = R.geral, part = puxParticipacao(R), L = pulsoLeitura(g, P)
  const pres = new PptxGenJS(); pres.layout = 'LAYOUT_WIDE'   // 13,33 × 7,5 pol
  pres.title = 'Pulso da Equipe — ' + R.ciclo.titulo; pres.company = 'SEMA/AC'
  const F = 'Calibri'
  pres.defineSlideMaster({ title: 'PULSO', background: { color: 'FFFFFF' }, objects: [
    { rect: { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: PUX_COR.verde } } },
    { text: { text: 'Pulso da Equipe · ' + R.ciclo.titulo + ' · Projeto 218BRA2001 · SEMA/AC', options: { x: 0.5, y: 7.05, w: 10, h: 0.3, fontFace: F, fontSize: 9, color: PUX_COR.cinza } } },
  ], slideNumber: { x: 12.4, y: 7.05, fontFace: F, fontSize: 9, color: PUX_COR.cinza } })
  const titulo = (s, t, sub) => {
    s.addText(t, { x: 0.5, y: 0.35, w: 12.3, h: 0.6, fontFace: F, fontSize: 26, bold: true, color: PUX_COR.verde })
    if (sub) s.addText(sub, { x: 0.5, y: 0.95, w: 12.3, h: 0.4, fontFace: F, fontSize: 13, color: PUX_COR.cinza })
  }

  // 1. capa
  let s = pres.addSlide()
  s.background = { color: PUX_COR.verde }
  s.addText('PULSO DA EQUIPE', { x: 0.8, y: 2.0, w: 11.7, h: 0.5, fontFace: F, fontSize: 16, bold: true, color: '7CCBA0', charSpacing: 4 })
  s.addText(R.ciclo.titulo, { x: 0.8, y: 2.5, w: 11.7, h: 1.2, fontFace: F, fontSize: 40, bold: true, color: 'FFFFFF' })
  s.addText(R.n + ' respostas · ' + P.length + ' perguntas · ' + puxData(R.ciclo.criado_em), { x: 0.8, y: 3.8, w: 11.7, h: 0.5, fontFace: F, fontSize: 18, color: 'DDEBE2' })
  s.addText('Projeto 218BRA2001 · SEMA/AC · UNESCO — resultado anônimo e agregado', { x: 0.8, y: 6.4, w: 11.7, h: 0.4, fontFace: F, fontSize: 12, color: 'B7CFC0' })

  // 2. indicadores + leitura
  s = pres.addSlide({ masterName: 'PULSO' }); titulo(s, 'Resultado geral', 'Participação: ' + part.cad + ' cadastrados' + (part.pct != null ? ' (' + part.pct + '% dos usuários ativos)' : '') + ' · ' + part.conv + ' convidados')
  const kp = []
  if (g.comprometimento != null) kp.push(['Comprometimento', g.comprometimento + '/100'])
  if (g.sintonia != null) kp.push(['Sintonia', g.sintonia + '/100'])
  if (g.enps != null) kp.push(['eNPS', puxSinal(g.enps)])
  kp.push(['Respostas', String(R.n)])
  const kw = 12.3 / kp.length
  kp.forEach(([r, v], i) => {
    s.addShape(pres.ShapeType.roundRect, { x: 0.5 + i * kw + 0.08, y: 1.6, w: kw - 0.16, h: 1.6, fill: { color: 'F3F7F4' }, line: { color: PUX_COR.borda }, rectRadius: 0.12 })
    s.addText(r, { x: 0.5 + i * kw + 0.3, y: 1.7, w: kw - 0.6, h: 0.4, fontFace: F, fontSize: 14, color: PUX_COR.cinza })
    s.addText(v, { x: 0.5 + i * kw + 0.3, y: 2.1, w: kw - 0.6, h: 0.9, fontFace: F, fontSize: 40, bold: true, color: '111827' })
  })
  if (L) {
    s.addShape(pres.ShapeType.rect, { x: 0.5, y: 3.6, w: 0.08, h: 2.4, fill: { color: PUX_COR.verde2 }, line: { color: PUX_COR.verde2 } })
    s.addText([
      { text: L.titulo + '\n', options: { fontSize: 24, bold: true, color: '111827' } },
      { text: L.texto + '\n\n', options: { fontSize: 16, color: '374151' } },
      ...(L.pior ? [{ text: 'Ponto mais baixo: ' + L.pior.tema + ' (' + puxNum(L.pior.valor) + ')   ', options: { fontSize: 14, color: 'A8471F', bold: true } }] : []),
      ...(L.dividida ? [{ text: 'Mais dividida: ' + L.dividida.tema + ' (dp ' + puxNum(L.dividida.valor, 2) + ')', options: { fontSize: 14, color: '7A1A12', bold: true } }] : []),
    ], { x: 0.8, y: 3.6, w: 12, h: 2.6, fontFace: F, valign: 'top' })
  }

  // 3. uma lâmina por pergunta (gráfico nativo, editável no PowerPoint)
  P.forEach((q, i) => {
    const m = pp[q.chave] || {}
    s = pres.addSlide({ masterName: 'PULSO' })
    s.addText((i + 1) + ' · ' + q.tema.toUpperCase() + ' · ' + (PULSO_TIPOS[q.tipo]?.curto || q.tipo) + (q.invertida ? ' · invertida' : ''), { x: 0.5, y: 0.35, w: 12.3, h: 0.4, fontFace: F, fontSize: 12, bold: true, color: PUX_COR.verde2, charSpacing: 1 })
    s.addText(q.texto, { x: 0.5, y: 0.75, w: 12.3, h: 0.9, fontFace: F, fontSize: 22, bold: true, color: '111827', valign: 'top' })
    // contagens: eixo em inteiros
    const maxV = Math.max(1, ...((q.tipo === 'escolha' ? m.contagem : m.distribuicao) || [1]))
    const opts = { x: 0.5, y: 1.9, w: 8.6, h: 4.8, fontFace: F, valAxisMajorUnit: Math.max(1, Math.ceil(maxV / 8)), valAxisLabelFormatCode: '0', dataLabelFormatCode: '0', catAxisLabelFontSize: 12, valAxisLabelFontSize: 10, dataLabelFontSize: 11, showValue: true, valGridLine: { color: 'EEEEEE', size: 0.5 } }
    if (q.tipo === 'escala') {
      s.addChart(pres.ChartType.bar, [{ name: 'Respostas', labels: PULSO_LIKERT, values: m.distribuicao || [0, 0, 0, 0, 0] }],
        { ...opts, barDir: 'bar', chartColors: PUX_COR.d, varyColors: true, catAxisOrientation: 'maxMin' })
      const lado = [['Média', puxNum(m.media)], ['Alinhamento', pulsoDispersao(m.dp) + ' (dp ' + puxNum(m.dp, 2) + ')'], ['Respostas', String(m.n ?? 0)]]
      if (R.espelho?.medias?.[q.chave] != null) lado.push(['Expectativa', puxNum(R.espelho.medias[q.chave])])
      lado.forEach(([r, v], k) => s.addText([{ text: r + '\n', options: { fontSize: 12, color: PUX_COR.cinza } }, { text: v, options: { fontSize: 24, bold: true, color: '111827' } }], { x: 9.5, y: 1.9 + k * 1.15, w: 3.3, h: 1.05, fontFace: F, valign: 'top' }))
    } else if (q.tipo === 'nps') {
      const d = m.distribuicao || []
      s.addChart(pres.ChartType.bar, [{ name: 'Notas', labels: d.map((_, j) => String(j)), values: d }],
        { ...opts, barDir: 'col', chartColors: d.map((_, j) => j <= 6 ? PUX_COR.d[0] : j <= 8 ? PUX_COR.d[2] : PUX_COR.d[4]), varyColors: true })
      ;[['eNPS', puxSinal(m.enps)], ['Média', puxNum(m.media)], ['Respostas', String(m.n ?? 0)]].forEach(([r, v], k) =>
        s.addText([{ text: r + '\n', options: { fontSize: 12, color: PUX_COR.cinza } }, { text: v, options: { fontSize: 24, bold: true, color: '111827' } }], { x: 9.5, y: 1.9 + k * 1.15, w: 3.3, h: 1.05, fontFace: F, valign: 'top' }))
      s.addText('Laranja = detratores (0–6) · cinza = neutros (7–8) · azul = promotores (9–10)', { x: 0.5, y: 6.7, w: 9, h: 0.3, fontFace: F, fontSize: 10, color: PUX_COR.cinza })
    } else if (q.tipo === 'escolha') {
      s.addChart(pres.ChartType.bar, [{ name: 'Respostas', labels: q.opcoes, values: q.opcoes.map((_, j) => (m.contagem || [])[j] || 0) }],
        { ...opts, w: 12.3, barDir: 'bar', chartColors: [PUX_COR.verde2], catAxisOrientation: 'maxMin' })
    } else {
      const t = (R.textos || {})[q.chave] || []
      const linhas = t.slice(0, 8).map(x => ({ text: '“' + (x.length > 180 ? x.slice(0, 177) + '…' : x) + '”', options: { bullet: true, breakLine: true } }))
      s.addText(linhas.length ? linhas : [{ text: 'Nenhum comentário.' }], { x: 0.5, y: 1.9, w: 12.3, h: 4.8, fontFace: F, fontSize: 15, color: '374151', valign: 'top', paraSpaceAfter: 8 })
      if (t.length > 8) s.addText('+ ' + (t.length - 8) + ' comentários na planilha / relatório A4 · ordem embaralhada, sem perfil', { x: 0.5, y: 6.7, w: 12.3, h: 0.3, fontFace: F, fontSize: 10, color: PUX_COR.cinza })
    }
  })

  // 4. por perfil
  const escalas = P.filter(q => q.tipo === 'escala')
  if ((R.grupos || []).length && escalas.length) {
    s = pres.addSlide({ masterName: 'PULSO' }); titulo(s, 'Por perfil', 'Só grupos com 5 respostas ou mais')
    const hd = ['Grupo', 'Resp.'].concat(escalas.map(q => q.tema), ['Compr.', 'Sint.']).map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: PUX_COR.verde } } }))
    const rows = [hd].concat(R.grupos.map(x => [PULSO_GRUPOS[x.grupo] || x.grupo, String(x.n)].concat(escalas.map(q => puxNum(x.por_pergunta[q.chave]?.media)), [String(x.comprometimento ?? '—'), String(x.sintonia ?? '—')])))
    s.addTable(rows, { x: 0.5, y: 1.6, w: 12.3, fontFace: F, fontSize: 13, border: { type: 'solid', color: PUX_COR.borda, pt: 0.75 }, align: 'center' })
  }

  // 5. próximos passos (para a devolutiva)
  s = pres.addSlide({ masterName: 'PULSO' }); titulo(s, 'Conversa e compromissos', 'Devolutiva · 10 minutos')
  s.addText([
    { text: 'O que mais surpreendeu vocês?', options: { bullet: { type: 'number' }, breakLine: true } },
    { text: 'Onde estamos menos em sintonia — e por quê?', options: { bullet: { type: 'number' }, breakLine: true } },
    { text: 'Quais temas se repetem nos comentários?', options: { bullet: { type: 'number' }, breakLine: true } },
    { text: 'Até 3 ações, cada uma com responsável e prazo:', options: { bullet: { type: 'number' }, breakLine: true } },
  ], { x: 0.5, y: 1.6, w: 12.3, h: 2.4, fontFace: F, fontSize: 20, color: '111827', paraSpaceAfter: 10 })
  ;[0, 1, 2].forEach(k => s.addShape(pres.ShapeType.roundRect, { x: 0.9 + k * 4.1, y: 4.2, w: 3.8, h: 1.9, fill: { color: 'F3F7F4' }, line: { color: PUX_COR.borda, dashType: 'dash' }, rectRadius: 0.1 }))
  s.addText('Regra de ouro: nunca pergunte “quem respondeu isso?”.', { x: 0.5, y: 6.35, w: 12.3, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: '92400E' })

  await pres.writeFile({ fileName: puxArquivo(R.ciclo.titulo, 'pptx') })
}

// ── Lista de ciclos do painel ─────────────────────────────────────────
async function pulsoExportarLista() {
  const { data, error } = await db.rpc('fn_pulso_exportar_lista')
  if (error) throw new Error(pulsoErro(error))
  await puxLib('../js/vendor/exceljs-4.4.0.bare.min.js', 'ExcelJS')
  const wb = new ExcelJS.Workbook(); wb.creator = 'DIMA · Pulso da Equipe'
  const ws = wb.addWorksheet('Ciclos')
  ws.columns = [{ header: 'Ciclo', key: 't', width: 40 }, { header: 'Criado por', key: 'a', width: 24 }, { header: 'Criado em', key: 'c', width: 12 },
    { header: 'Situação', key: 's', width: 11 }, { header: 'Fecha em', key: 'f', width: 17 }, { header: 'Perguntas', key: 'p', width: 10 },
    { header: 'Respostas', key: 'n', width: 10 }, { header: 'Cadastrados', key: 'cad', width: 11 }, { header: 'Convidados', key: 'conv', width: 11 },
    { header: 'Última resposta', key: 'u', width: 15 }, { header: 'Comprometimento', key: 'comp', width: 15 }, { header: 'Sintonia', key: 'sint', width: 10 }, { header: 'eNPS', key: 'enps', width: 8 }]
  ;(data || []).forEach(c => ws.addRow({ t: c.titulo, a: c.autor, c: puxData(c.criado_em), s: c.aberto ? 'Aberto' : 'Encerrado',
    f: c.fecha_em ? new Date(c.fecha_em).toLocaleString('pt-BR') : '—', p: c.n_perguntas, n: c.n_respostas, cad: c.n_cadastrados, conv: c.n_convidados,
    u: c.ultima_resposta ? puxData(c.ultima_resposta + 'T12:00:00') : '—',
    comp: c.indices?.comprometimento ?? (c.n_respostas < 5 ? 'menos de 5 respostas' : '—'), sint: c.indices?.sintonia ?? '', enps: c.indices?.enps ?? '' }))
  const r = ws.getRow(1); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + PUX_COR.verde } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  const buf = await wb.xlsx.writeBuffer()
  puxBaixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), puxArquivo('ciclos', 'xlsx'))
}
