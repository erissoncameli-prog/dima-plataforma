// ── DIMA · Diagnóstico Socioambiental — foto de campo (carimbo + EXIF) ────
//
// Decisão de 26/09/2026 (migração 20260926_diag_13_fotos_carimbo.sql):
//   · CARIMBO visível no pé da foto: código da ficha · tema, data/hora do
//     Acre, GPS (com precisão) e entrevistador(a);
//   · EXIF no arquivo: GPS, data/hora da captura (com fuso), Artist
//     (entrevistador), ImageDescription (código · tema), Software;
//   · lado maior 1280 px, JPEG 0,72; teto de 350 KB (reduz qualidade e depois
//     o tamanho até caber). JPEG em todos os aparelhos: é o formato que leva
//     EXIF em qualquer visualizador, e o iPhone não gera WebP;
//   · a foto é devolvida como BYTES (ArrayBuffer), nunca como Blob — Blob
//     guardado no IndexedDB volta vazio no iPhone (fotos chegaram com 0 byte).
// A foto é dado de IDENTIFICAÇÃO (localiza a família): mesmo acesso de
// diag_fotos, nunca em exportação, apagada na retenção de 2 anos.

const DiagFoto = (function () {
  'use strict'

  const LADO = 1280
  const TETO = 350 * 1024
  const TENTATIVAS = [[LADO, 0.72], [LADO, 0.6], [LADO, 0.5], [1024, 0.6], [1024, 0.5]]
  const TZ = 'America/Rio_Branco'   // Acre, UTC-5 fixo

  // ── GPS: leitura no momento da foto (reaproveita uma recente) ─────────
  let _ultimo = null   // { lat, lon, precisao, em }
  function _ler(timeoutMs, maxIdade) {
    return new Promise(res => {
      if (!navigator.geolocation) return res(null)
      let feito = false
      const fim = v => { if (!feito) { feito = true; res(v) } }
      setTimeout(() => fim(null), timeoutMs + 500)
      navigator.geolocation.getCurrentPosition(
        p => { _ultimo = { lat: p.coords.latitude, lon: p.coords.longitude, precisao: p.coords.accuracy, em: Date.now() }; fim(_ultimo) },
        () => fim(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: maxIdade })
    })
  }
  // chamado ao abrir o bloco de fotos: o GPS esquenta enquanto a pessoa enquadra
  function aquecerGps() { _ler(15000, 120000) }
  async function lerGps(timeoutMs) {
    if (_ultimo && Date.now() - _ultimo.em < 120000) return _ultimo
    return _ler(timeoutMs || 10000, 120000)
  }

  // ── texto do carimbo ──────────────────────────────────────────────────
  function dataHoraAcre(d) {
    const p = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
    const g = t => (p.find(x => x.type === t) || {}).value
    return { txt: g('day') + '/' + g('month') + '/' + g('year') + ' ' + g('hour') + ':' + g('minute'),
             exif: g('year') + ':' + g('month') + ':' + g('day') + ' ' + g('hour') + ':' + g('minute') + ':' +
                   String(new Date(d).getSeconds()).padStart(2, '0') }
  }
  function linhasCarimbo(m) {
    const gps = m.gps
      ? 'GPS ' + m.gps.lat.toFixed(6) + ', ' + m.gps.lon.toFixed(6) +
        (m.gps.precisao != null ? ' · ±' + Math.round(m.gps.precisao) + ' m' : '') +
        (m.gpsOrigem === 'ficha' ? ' (local da ficha)' : '')
      : 'GPS indisponível'
    return [m.codigo + ' · ' + m.tema, dataHoraAcre(m.quando).txt + ' (horário do Acre)', gps,
            'Entrevistador(a): ' + (m.entrevistador || '—')]
  }

  function desenhar(img, lado, linhas) {
    const esc = Math.min(1, lado / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * esc)); c.height = Math.max(1, Math.round(img.height * esc))
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0, c.width, c.height)
    // letra pelo lado menor; encolhe até a linha mais longa caber
    const pad0 = Math.round(Math.min(c.width, c.height) / 40)
    let fs = Math.max(12, Math.round(Math.min(c.width, c.height) / 26))
    const fonte = s => '600 ' + s + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    for (; fs > 10; fs--) {
      g.font = fonte(fs)
      if (Math.max(...linhas.map(t => g.measureText(t).width)) <= c.width - 2 * pad0) break
    }
    const pad = Math.round(fs * 0.6), lh = Math.round(fs * 1.3)
    const h = pad * 2 + lh * linhas.length
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, c.height - h, c.width, h)
    g.textBaseline = 'top'; g.fillStyle = '#fff'; g.font = fonte(fs)
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 2
    linhas.forEach((t, i) => g.fillText(t, pad, c.height - h + pad + i * lh))
    // marca só se couber ao lado da 1ª linha
    const marca = 'SEMA/AC · Diagnóstico Socioambiental'
    g.font = '700 ' + Math.round(fs * 0.8) + 'px system-ui, sans-serif'
    const wm = g.measureText(marca).width
    g.font = fonte(fs)
    if (g.measureText(linhas[0]).width + wm + 3 * pad < c.width) {
      g.font = '700 ' + Math.round(fs * 0.8) + 'px system-ui, sans-serif'
      g.fillStyle = 'rgba(255,255,255,.9)'
      g.fillText(marca, c.width - pad - wm, c.height - h + pad)
    }
    g.shadowBlur = 0
    return c
  }

  function canvasParaBytes(c, q) {
    return new Promise((res, rej) => c.toBlob(b => {
      if (!b || !b.size) return rej(new Error('foto vazia ao comprimir'))
      b.arrayBuffer().then(res, rej)
    }, 'image/jpeg', q))
  }

  // ── EXIF (TIFF little-endian) escrito à mão: IFD0 + Exif + GPS ─────────
  const TIPO = { BYTE: [1, 1], ASCII: [2, 1], SHORT: [3, 2], LONG: [4, 4], RATIONAL: [5, 8] }
  // campos ASCII do EXIF são 7 bits: sem acento (leitores exibem "TÃ©cnica" com UTF-8).
  // O carimbo visível mantém os acentos.
  function ascii(s) {
    const t = String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/·/g, '-').replace(/[^\x20-\x7E]/g, '?')
    const o = new Uint8Array(t.length + 1)
    for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i)
    return o
  }
  function racionais(pares) {
    const o = new Uint8Array(pares.length * 8); const v = new DataView(o.buffer)
    pares.forEach(([n, d], i) => { v.setUint32(i * 8, n, true); v.setUint32(i * 8 + 4, d, true) })
    return o
  }
  function grau(x) {
    const a = Math.abs(x), g = Math.floor(a), mf = (a - g) * 60, m = Math.floor(mf), s = (mf - m) * 60
    return racionais([[g, 1], [m, 1], [Math.round(s * 10000), 10000]])
  }
  function tamanhoIfd(ent) {
    return 2 + ent.length * 12 + 4 + ent.reduce((s, e) => s + (e.dados.length > 4 ? e.dados.length + (e.dados.length % 2) : 0), 0)
  }
  function escreverIfd(v, u8, pos, ent) {
    ent.sort((a, b) => a.tag - b.tag)
    v.setUint16(pos, ent.length, true)
    let dadosPos = pos + 2 + ent.length * 12 + 4
    ent.forEach((e, i) => {
      const p = pos + 2 + i * 12
      const [cod, tam] = TIPO[e.tipo]
      v.setUint16(p, e.tag, true); v.setUint16(p + 2, cod, true); v.setUint32(p + 4, e.dados.length / tam, true)
      if (e.dados.length <= 4) u8.set(e.dados, p + 8)
      else { v.setUint32(p + 8, dadosPos, true); u8.set(e.dados, dadosPos); dadosPos += e.dados.length + (e.dados.length % 2) }
    })
    v.setUint32(pos + 2 + ent.length * 12, 0, true)
  }
  function long(n) { const o = new Uint8Array(4); new DataView(o.buffer).setUint32(0, n, true); return o }
  function montarExif(m) {
    const dh = dataHoraAcre(m.quando).exif
    const ifd0 = [
      { tag: 0x010E, tipo: 'ASCII', dados: ascii(m.codigo + ' · ' + m.tema) },
      { tag: 0x0131, tipo: 'ASCII', dados: ascii('DIMA Diagnóstico ' + (m.appVersao || '')) },
      { tag: 0x0132, tipo: 'ASCII', dados: ascii(dh) },
      { tag: 0x013B, tipo: 'ASCII', dados: ascii(m.entrevistador || '') },
      { tag: 0x8769, tipo: 'LONG', dados: long(0) },
    ]
    const exif = [
      { tag: 0x9003, tipo: 'ASCII', dados: ascii(dh) },
      { tag: 0x9011, tipo: 'ASCII', dados: ascii('-05:00') },
    ]
    const gps = m.gps ? [
      { tag: 0x0000, tipo: 'BYTE', dados: new Uint8Array([2, 3, 0, 0]) },
      { tag: 0x0001, tipo: 'ASCII', dados: ascii(m.gps.lat < 0 ? 'S' : 'N') },
      { tag: 0x0002, tipo: 'RATIONAL', dados: grau(m.gps.lat) },
      { tag: 0x0003, tipo: 'ASCII', dados: ascii(m.gps.lon < 0 ? 'W' : 'E') },
      { tag: 0x0004, tipo: 'RATIONAL', dados: grau(m.gps.lon) },
    ] : null
    if (gps && m.gps.precisao != null) gps.push({ tag: 0x001F, tipo: 'RATIONAL', dados: racionais([[Math.round(m.gps.precisao * 10), 10]]) })
    if (gps) ifd0.push({ tag: 0x8825, tipo: 'LONG', dados: long(0) })
    const t0 = 8, t1 = t0 + tamanhoIfd(ifd0), t2 = t1 + tamanhoIfd(exif)
    ifd0.find(e => e.tag === 0x8769).dados = long(t1)
    if (gps) ifd0.find(e => e.tag === 0x8825).dados = long(t2)
    const tiffLen = t2 + (gps ? tamanhoIfd(gps) : 0)
    const tiff = new Uint8Array(tiffLen); const v = new DataView(tiff.buffer)
    tiff.set([0x49, 0x49, 0x2A, 0x00]); v.setUint32(4, 8, true)
    escreverIfd(v, tiff, t0, ifd0); escreverIfd(v, tiff, t1, exif); if (gps) escreverIfd(v, tiff, t2, gps)
    const app1 = new Uint8Array(4 + 6 + tiffLen)
    app1.set([0xFF, 0xE1, ((app1.length - 2) >> 8) & 0xFF, (app1.length - 2) & 0xFF])
    app1.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4)
    app1.set(tiff, 10)
    return app1
  }
  // APP1 logo depois do SOI (FFD8)
  function comExif(jpeg, app1) {
    const src = new Uint8Array(jpeg)
    if (src[0] !== 0xFF || src[1] !== 0xD8) return jpeg
    const out = new Uint8Array(src.length + app1.length)
    out.set(src.subarray(0, 2)); out.set(app1, 2); out.set(src.subarray(2), 2 + app1.length)
    return out.buffer
  }

  // ── ponto de entrada ──────────────────────────────────────────────────
  // meta: { codigo, tema (rótulo), entrevistador, gps, gpsOrigem, quando, appVersao }
  async function processar(arquivo, meta) {
    const img = await createImageBitmap(arquivo)
    const linhas = linhasCarimbo(meta)
    let bytes = null, dim = null
    for (const [lado, q] of TENTATIVAS) {
      const c = desenhar(img, lado, linhas)
      bytes = await canvasParaBytes(c, q)
      dim = [c.width, c.height]
      if (bytes.byteLength <= TETO) break
    }
    if (img.close) img.close()
    bytes = comExif(bytes, montarExif(meta))
    return { bytes, mime: 'image/jpeg', largura: dim[0], altura: dim[1], tamanho: bytes.byteLength }
  }

  return { processar, lerGps, aquecerGps, linhasCarimbo, montarExif, comExif, TETO }
})()
