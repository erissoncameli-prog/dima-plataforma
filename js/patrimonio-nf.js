// ── Patrimônio · leitura da nota fiscal (docs/patrimonio/plano.md §18) ──────
// Lê a NF-e no próprio navegador, sem IA e sem mandar o arquivo a serviço nenhum:
//   • XML da NF-e: leitura exata das tags (det/prod, ide, emit, ICMSTot);
//   • PDF (DANFE): o pdf.js extrai o texto com a posição de cada pedaço; as linhas
//     são remontadas pela altura e a tabela "Dados dos produtos" é lida pela ordem
//     fixa das colunas (código, descrição, NCM, CST, CFOP, unidade, quantidade,
//     valor unitário, [desconto], total). Descrição quebrada em duas linhas e nota
//     com mais de uma folha são tratadas. PDF só imagem (escaneado) não tem texto:
//     a tela pede para preencher à mão.
// A leitura só SUGERE: a pessoa confere, marca o que é bem e grava em Incorporar.
// Classificação bem × consumo e categoria são sugestões (palavras da descrição;
// NCM só de apoio, porque o fornecedor nem sempre o preenche bem).
;(function (g) {
  'use strict'

  const num = s => { const t = String(s == null ? '' : s).trim(); if (!t) return NaN
    return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) }
  const digitos = s => String(s || '').replace(/\D/g, '')
  const sa = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  const R2 = v => Math.round(v * 100) / 100

  // ── Sugestões: consumo e categoria ──────────────────────────────────────
  const CONSUMO = /\b(PLUG|PLUGUE|CABO|CABOS|CONECTOR|CONECTORES|PILHA|PILHAS|BATERIA|BATERIAS|ADAPTADOR|FITA|PARAFUSO|ABRACADEIRA|EXTENSAO|CARTUCHO|TONER|PAPEL|LAMPADA|FUSIVEL|ETIQUETA)\b/
  const LIMITE_CONSUMO = 100   // valor unitário abaixo disso vem como consumo
  const CATEGORIAS = [
    ['estruturas', /\b(TENDA|BARRACA|GAZEBO|TOLDO|LONA)\b/],
    ['veiculos', /\b(CARRO|VEICULO|MOTOCICLETA|MOTO|BARCO|CANOA|VOADEIRA|MOTOR DE POPA|REBOQUE|BICICLETA|QUADRICICLO)\b/],
    ['audio_video', /\b(CAIXA|MESA DE SOM|MIC|MIC\.|MICROFONE|PROJETOR|CAMERA|FILMADORA|TELEVISOR|TV|AMPLIFICADOR|MIXER|FONE|SOM|DRONE|LENTE|TRIPE)\b/],
    ['informatica', /\b(NOTEBOOK|COMPUTADOR|DESKTOP|IMPRESSORA|TABLET|SERVIDOR|NOBREAK|ROTEADOR|SWITCH|HD EXTERNO|SSD|MONITOR LED|MONITOR LCD|SCANNER)\b/],
    ['comunicacao', /\b(RADIO|TELEFONE|CELULAR|SMARTPHONE|GPS|ANTENA|WALKIE|SATELITAL|REPETIDORA)\b/],
    ['mobiliario', /\b(MESA|CADEIRA|ARMARIO|ESTANTE|RACK|GAVETEIRO|BANCO|LONGARINA|ARQUIVO)\b/],
  ]
  const NCM_CAT = [['8471', 'informatica'], ['8443', 'informatica'], ['8517', 'comunicacao'], ['8525', 'audio_video'], ['8526', 'comunicacao'],
    ['8518', 'audio_video'], ['8519', 'audio_video'], ['8521', 'audio_video'], ['8528', 'audio_video'], ['9006', 'audio_video'],
    ['9401', 'mobiliario'], ['9403', 'mobiliario'], ['6306', 'estruturas'], ['87', 'veiculos'], ['89', 'veiculos']]
  function classificar(it) {
    const d = sa(it.descricao)
    const consumoPalavra = CONSUMO.test(d), consumoValor = it.valor_unitario > 0 && it.valor_unitario < LIMITE_CONSUMO
    const cat = (CATEGORIAS.find(([, re]) => re.test(d)) || [])[0]
      || (NCM_CAT.find(([p]) => String(it.ncm || '').startsWith(p)) || [])[1] || 'maquinas'
    return { bem: !(consumoPalavra || consumoValor), categoria: cat,
      motivo_consumo: consumoPalavra ? 'parece material de consumo pela descrição' : consumoValor ? 'valor unitário abaixo de R$ ' + LIMITE_CONSUMO : '' }
  }
  // números de série escritos na descrição ou nas informações do item ("S/N: X", "SERIE X", "SN X")
  function series(texto) {
    const out = [], re = /\b(?:S\/N|N[º°O]?\s*S[ÉE]RIE|S[ÉE]RIE|SN)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9\-/]{3,})/gi
    let m; while ((m = re.exec(String(texto || '')))) out.push(m[1])
    return out
  }

  // ── XML da NF-e ─────────────────────────────────────────────────────────
  const tag = (xml, t) => { const m = new RegExp('<(?:\\w+:)?' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + t + '>').exec(xml); return m ? m[1].trim() : '' }
  const desXml = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  function lerXml(xml) {
    if (!/<(?:\w+:)?infNFe/.test(xml)) throw new Error('O arquivo XML não é de uma NF-e.')
    const id = (/<(?:\w+:)?infNFe[^>]*\bId="NFe(\d{44})"/.exec(xml) || [])[1] || ''
    const ide = tag(xml, 'ide'), emit = tag(xml, 'emit'), tot = tag(xml, 'ICMSTot')
    const itens = []
    const reDet = /<(?:\w+:)?det\b[^>]*>([\s\S]*?)<\/(?:\w+:)?det>/g
    let m
    while ((m = reDet.exec(xml))) {
      const b = m[1], prod = tag(b, 'prod'), info = desXml(tag(b, 'infAdProd'))
      const it = { codigo: desXml(tag(prod, 'cProd')), descricao: desXml(tag(prod, 'xProd')), ncm: tag(prod, 'NCM'), unidade: desXml(tag(prod, 'uCom')),
        quantidade: num(tag(prod, 'qCom')), valor_unitario: num(tag(prod, 'vUnCom')), desconto: num(tag(prod, 'vDesc')) || 0,
        valor_bruto: num(tag(prod, 'vProd')), info }
      it.valor_total = R2(it.valor_bruto - it.desconto)
      it.series = series(it.descricao + ' ' + info)
      itens.push(it)
    }
    const dEmi = tag(ide, 'dhEmi') || tag(ide, 'dEmi')
    return completar({ origem: 'xml', chave: id, numero: String(Number(tag(ide, 'nNF')) || ''), serie: tag(ide, 'serie'),
      emissao: dEmi.slice(0, 10), cnpj_emitente: digitos(tag(emit, 'CNPJ') || tag(emit, 'CPF')), emitente: desXml(tag(emit, 'xNome')),
      total_produtos: num(tag(tot, 'vProd')), total_nota: num(tag(tot, 'vNF')), itens })
  }

  // ── PDF (DANFE) ─────────────────────────────────────────────────────────
  // paginas = [[{ s, x, y }]] (y cresce para baixo). Junta pedaços na mesma altura.
  function linhas(itens) {
    const ord = itens.filter(i => i.s && i.s.trim()).sort((a, b) => a.y - b.y || a.x - b.x), out = []
    for (const i of ord) {
      const l = out.length && Math.abs(out[out.length - 1].y - i.y) <= 2.5 ? out[out.length - 1] : null
      if (l) l.p.push(i); else out.push({ y: i.y, p: [i] })
    }
    return out.map(l => { l.p.sort((a, b) => a.x - b.x); l.t = l.p.map(p => p.s.trim()).join(' ').replace(/\s+/g, ' '); l.x0 = l.p[0].x; return l })
  }
  const NUMBR = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2,4}|\\d+,\\d{2,4})'
  const RE_ITEM = new RegExp('^(\\S+)\\s+(.+?)\\s+(\\d{8})\\s+(\\d{3,4})\\s+(\\d{4})\\s+([A-Za-zÇç]{1,6}\\.?)\\s+' + NUMBR + '\\s+' + NUMBR + '((?:\\s+' + NUMBR + ')+)')
  function itemDaLinha(t) {
    const m = RE_ITEM.exec(t); if (!m) return null
    const qtd = num(m[7]), vu = num(m[8]), resto = m[9].trim().split(/\s+/).map(num)
    // depois do valor unitário: [desconto] total … ; acha o total pela conta qtd × unitário
    const bruto = R2(qtd * vu); let desc = 0, total = NaN, confere = true
    if (Math.abs(resto[0] - bruto) <= 0.02) total = resto[0]
    else if (resto.length > 1 && Math.abs(resto[1] - (bruto - resto[0])) <= 0.02) { desc = resto[0]; total = resto[1] }
    else { total = resto.length > 1 ? resto[1] : resto[0]; confere = false }
    return { codigo: m[1], descricao: m[2].trim(), ncm: m[3], unidade: m[6], quantidade: qtd, valor_unitario: vu, desconto: desc,
      valor_total: total, conta_confere: confere }
  }
  // número escrito logo abaixo de um rótulo do quadro: os valores do DANFE são alinhados à direita do rótulo
  function valorAbaixo(ls, rotulo) {
    const fim = q => q.x + (q.w || 0)
    for (let k = 0; k < ls.length; k++) {
      const p = ls[k].p.find(q => sa(q.s).includes(rotulo)); if (!p) continue
      for (let j = k + 1; j < Math.min(ls.length, k + 3); j++) {
        const c = ls[j].p.filter(q => /^\d[\d.]*,\d{2}$/.test(q.s.trim())).sort((a, b) => Math.abs(fim(a) - fim(p)) - Math.abs(fim(b) - fim(p)))[0]
        if (c && Math.abs(fim(c) - fim(p)) < 40) return num(c.s)
      }
    }
    return NaN
  }
  function lerTextoDanfe(paginas) {
    const itens = [], todas = []
    let semTexto = true
    for (const pag of paginas) {
      const ls = linhas(pag); if (ls.length > 8) semTexto = false
      todas.push(...ls)
      let dentro = false, xDesc = null
      for (const l of ls) {
        const T = sa(l.t)
        if (/DESCRI[CÇ][AÃ]O DO PRODUTO/.test(T)) { dentro = true; const d = l.p.find(q => /DESCRI/.test(sa(q.s))); xDesc = d ? d.x : null; continue }
        if (!dentro) continue
        if (/DADOS ADICIONAIS|INFORMA[CÇ][OÕ]ES COMPLEMENTARES|C[AÁ]LCULO DO ISSQN/.test(T)) { dentro = false; continue }
        if (/^(PRODUTO|UNIT[AÁ]RIO|C[OÓ]DIGO)\b/.test(T) || /VALOR\s+VALOR/.test(T)) continue
        const it = itemDaLinha(l.t)
        if (it) { itens.push(it); continue }
        // continuação da descrição: linha só de texto, começando na coluna da descrição
        const ant = itens[itens.length - 1]
        if (ant && !/\d,\d{2}/.test(l.t) && (xDesc == null || l.x0 >= xDesc - 60)) ant.descricao += ' ' + l.t.trim()
      }
    }
    if (semTexto) throw new Error('SEM_TEXTO')
    const texto = todas.map(l => l.t).join('\n')
    const chave = ((/((?:\d{4}\s?){10}\d{4})/.exec(texto) || [])[1] || '').replace(/\s/g, '')
    const nro = (/N[º°o]\.?\s*([\d.]{5,})/i.exec(texto) || [])[1] || ''
    const emissao = (/EMISS[AÃ]O:?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(texto) || /DATA DA EMISS[AÃ]O[\s\S]{0,400}?(\d{2}\/\d{2}\/\d{4})/i.exec(texto) || [])[1] || ''
    const cnpjs = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || []
    const totalProd = valorAbaixo(todas, 'VALOR TOTAL DOS PRODUTOS')
    const totalNota = (/VALOR TOTAL:?\s*([\d.]+,\d{2})/i.exec(texto) || [])[1]
    itens.forEach(it => { it.series = series(it.descricao) })
    return completar({ origem: 'pdf', chave: chave.length === 44 ? chave : '', numero: nro ? String(Number(digitos(nro))) : '',
      serie: (/S[ÉE]RIE\s*(\d+)/i.exec(texto) || [])[1] || '',
      emissao: emissao ? emissao.split('/').reverse().join('-') : '', cnpj_emitente: digitos(cnpjs[0] || ''), emitente: '',
      total_produtos: totalProd, total_nota: totalNota ? num(totalNota) : NaN, itens })
  }

  // avisos e sugestões comuns aos dois formatos
  function completar(nf) {
    nf.itens.forEach((it, i) => { Object.assign(it, classificar(it)); it.n = i + 1 })
    const soma = R2(nf.itens.reduce((s, it) => s + (Number.isFinite(it.valor_total) ? it.valor_total : 0), 0))
    nf.soma = soma
    nf.avisos = []
    if (!nf.itens.length) nf.avisos.push('Nenhum item foi encontrado na tabela de produtos da nota.')
    const ref = Number.isFinite(nf.total_produtos) ? nf.total_produtos : NaN
    if (Number.isFinite(ref) && Math.abs(ref - soma) > 0.02) nf.avisos.push('A soma das linhas lidas (' + fmt(soma) + ') não bate com o total dos produtos da nota (' + fmt(ref) + '). Confira se faltou alguma linha.')
    nf.itens.filter(it => it.conta_confere === false).forEach(it => nf.avisos.push('Item ' + it.n + ': quantidade × valor unitário não bate com o total da linha.'))
    if (!nf.chave) nf.avisos.push('A chave de acesso não foi encontrada; a conferência de nota repetida fica sem efeito.')
    return nf
  }
  const fmt = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // ── Entrada: arquivo escolhido na tela ──────────────────────────────────
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/'
  let pdfjs = null
  async function carregarPdfJs() {
    if (pdfjs) return pdfjs
    const mod = await import(PDFJS + 'pdf.min.mjs')
    try {
      const fonte = await fetch(PDFJS + 'pdf.worker.min.mjs').then(r => r.text())
      mod.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([fonte], { type: 'text/javascript' }))
    } catch (e) { /* sem worker: o pdf.js roda na thread principal */ }
    pdfjs = mod; return mod
  }
  async function paginasDoPdf(dados, lib) {
    const doc = await lib.getDocument({ data: dados }).promise, out = []
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n), alt = pg.getViewport({ scale: 1 }).height
      const tc = await pg.getTextContent()
      out.push(tc.items.map(i => ({ s: i.str, x: i.transform[4], y: alt - i.transform[5], w: i.width || 0 })))
    }
    return out
  }
  async function lerArquivo(arquivo) {
    const nome = (arquivo.name || '').toLowerCase()
    if (nome.endsWith('.xml') || /xml/.test(arquivo.type || '')) return lerXml(await arquivo.text())
    const lib = await carregarPdfJs()
    try { return lerTextoDanfe(await paginasDoPdf(new Uint8Array(await arquivo.arrayBuffer()), lib)) }
    catch (e) {
      if (e.message === 'SEM_TEXTO') throw new Error('Esta nota não tem texto legível (parece digitalizada como imagem). Preencha os itens à mão ou use o XML da nota.')
      throw e
    }
  }

  g.PatNF = { lerArquivo, lerXml, lerTextoDanfe, paginasDoPdf, classificar, series, LIMITE_CONSUMO }
})(typeof window !== 'undefined' ? window : globalThis)
