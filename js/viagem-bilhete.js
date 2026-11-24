// Leitura do roteiro/e-ticket de passagem (PDF) no navegador, sem IA e sem enviar o arquivo a lugar nenhum.
// Formato conhecido: "Roteiro da Viagem" da Flytour (agência da UNESCO). Outro formato devolve o que achar;
// quem anexa confere e completa à mão. Usado por pages/viagens.html (janela #modal-comp).
;(function () {
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/'
  let pdfjs = null
  async function carregar() {
    if (pdfjs) return pdfjs
    const mod = await import(PDFJS + 'pdf.min.mjs')
    try {
      const fonte = await fetch(PDFJS + 'pdf.worker.min.mjs').then(r => r.text())
      mod.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([fonte], { type: 'text/javascript' }))
    } catch (e) { /* sem worker: roda na thread principal */ }
    pdfjs = mod; return mod
  }
  async function texto(file) {
    const lib = await carregar()
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    let t = ''
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n)
      const c = await pg.getTextContent()
      t += c.items.map(i => i.str + (i.hasEOL ? '\n' : ' ')).join('') + '\n'
    }
    return t.replace(/[ \t]+/g, ' ')
  }
  const MES = { jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, abr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, out: 10, nov: 11, dec: 12, dez: 12 }
  function data(s) {
    if (!s) return null
    let m = /([a-z]{3})\/(\d{1,2})\/(\d{4})/i.exec(s)
    if (m && MES[m[1].toLowerCase()]) return `${m[3]}-${String(MES[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`
    m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
  }
  const num = s => s == null ? null : Number(String(s).replace(/\./g, '').replace(',', '.'))
  const pega = (t, re) => { const m = re.exec(t); return m ? m[1].trim() : null }

  // { agencia, ordem_servico, localizador, bilhete, dt_emissao, tarifa_brl, taxas_brl, valor_brl, passageiro, achou }
  function interpretar(t) {
    const r = {
      agencia: pega(t, /Ag[êe]ncia:\s*([A-Za-zÀ-ú0-9 .&-]+?)(?:\s{2,}|\s+Solicitante|\n)/i),
      ordem_servico: pega(t, /O\.S\.\s*(\d+)/i),
      localizador: pega(t, /LOCALIZADOR:\s*([A-Z0-9]{5,8})/i),
      bilhete: pega(t, /BILHETE:\s*(\d{10,14})/i),
      dt_emissao: data(pega(t, /Data Emiss[ãa]o:\s*([^\s]+)/i)),
      tarifa_brl: num(pega(t, /Valor:\s*BRL\s*([\d.]+,\d{2})/i)),
      taxas_brl: null,
      valor_brl: num(pega(t, /Total:\s*BRL\s*([\d.]+,\d{2})/i)),
      passageiro: pega(t, /\n\s*([A-ZÀ-Ú][A-ZÀ-Ú ]{5,}?)\s+O\.S\./),
    }
    const tx = /Taxas \+ Repasse:\s*BRL\s*([\d.]+,\d{2})\s*\+\s*BRL\s*([\d.]+,\d{2})/i.exec(t)
    if (tx) r.taxas_brl = Math.round((num(tx[1]) + num(tx[2])) * 100) / 100
    if (r.valor_brl == null && r.tarifa_brl != null) r.valor_brl = Math.round((r.tarifa_brl + (r.taxas_brl || 0)) * 100) / 100
    r.achou = ['localizador', 'bilhete', 'valor_brl'].filter(k => r[k] != null).length
    return r
  }
  async function ler(file) {
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return { achou: 0, motivo: 'nao_pdf' }
    const t = await texto(file)
    if (t.replace(/\s/g, '').length < 30) return { achou: 0, motivo: 'sem_texto' }
    return interpretar(t)
  }
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
  // passageiro do bilhete × viajante: confere as palavras do nome (ordem livre)
  function mesmoNome(a, b) {
    const pa = norm(a).split(' ').filter(p => p.length > 2), pb = new Set(norm(b).split(' '))
    return pa.length > 0 && pa.filter(p => pb.has(p)).length >= Math.min(2, pa.length)
  }
  // Miniatura da 1ª página de um PDF (URL já assinada) → dataURL JPEG; null se não der.
  async function miniatura(url, largura = 320) {
    try {
      const lib = await carregar()
      const doc = await lib.getDocument({ url }).promise
      const pg = await doc.getPage(1)
      const v0 = pg.getViewport({ scale: 1 })
      const vp = pg.getViewport({ scale: largura / v0.width })
      const cv = document.createElement('canvas')
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height)
      await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise
      doc.destroy()
      return cv.toDataURL('image/jpeg', 0.8)
    } catch (e) { return null }
  }
  window.ViagemBilhete = { ler, interpretar, mesmoNome, miniatura }
})()
