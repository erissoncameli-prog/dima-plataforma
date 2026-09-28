// ── DIMA · Diagnóstico Socioambiental — gravação de áudio das respostas abertas ──
//
// Uma gravação por pergunta de texto aberto (texto_longo), no máximo
// estrutura.audio_max_s (180 s). Só com a autorização da família
// (ficha.audio_autorizado === true, pergunta separada no aviso da v5).
//
// Regras que mandam aqui:
//   • a VOZ identifica a pessoa: o áudio é dado de identificação, como a
//     foto — bucket privado, consultor não ouve, apagado em 2 anos;
//   • guardar como BYTES (ArrayBuffer), nunca Blob: no iPhone o Blob volta
//     vazio do IndexedDB (mesma lição das fotos, js/diag-foto.js);
//   • mono, ~32 kbit/s: 3 min ≈ 0,7 MB. Android grava webm/opus; iPhone,
//     mp4/aac. O tipo sobe SEM ";codecs=…" (o bucket confere o tipo base).
//   • a transcrição é a resposta de texto; o áudio é o apoio. Nada de IA
//     aqui: a voz não sai da SEMA (etapa 2 avalia IA local, pós-piloto).

const DiagAudio = (function () {
  const TIPOS = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac']
  const EXT = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/mpeg': 'mp3' }

  function suportado() {
    return !!(typeof window !== 'undefined' && window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  }

  function tipoEscolhido() {
    if (!suportado()) return ''
    for (const t of TIPOS) { try { if (MediaRecorder.isTypeSupported(t)) return t } catch (e) { /* segue */ } }
    return ''   // deixa o navegador escolher
  }

  function tipoBase(t) { return String(t || '').split(';')[0].trim() || 'audio/webm' }
  function extensao(t) { return EXT[tipoBase(t)] || 'webm' }

  function fmt(s) {
    s = Math.max(0, Math.floor(s))
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
  }

  // Começa a gravar. Devolve { parar() } ou lança (permissão negada, sem microfone).
  //   aoTick(segundos)  — a cada 250 ms
  //   aoFim({ bytes, mime, duracao_s, tamanho }) — ao parar (botão ou limite)
  async function iniciar(opts) {
    const maxS = opts.maxS || 180
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    const tipo = tipoEscolhido()
    let rec
    try { rec = new MediaRecorder(stream, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 }) }
    catch (e) { rec = new MediaRecorder(stream) }
    const partes = []
    const inicio = Date.now()
    let timer = null, parado = false
    const segundos = () => (Date.now() - inicio) / 1000

    rec.ondataavailable = ev => { if (ev.data && ev.data.size) partes.push(ev.data) }
    rec.onstop = async () => {
      clearInterval(timer)
      stream.getTracks().forEach(t => t.stop())
      const mime = tipoBase(rec.mimeType || tipo)
      const duracao = Math.min(Math.round(segundos() * 10) / 10, maxS)
      try {
        const blob = new Blob(partes, { type: mime })
        const bytes = await blob.arrayBuffer()
        opts.aoFim({ bytes, mime, duracao_s: duracao, tamanho: bytes.byteLength })
      } catch (e) { opts.aoFim({ erro: e }) }
    }
    const parar = () => {
      if (parado) return
      parado = true
      try { rec.state !== 'inactive' ? rec.stop() : rec.onstop() } catch (e) { rec.onstop() }
    }
    timer = setInterval(() => {
      const s = segundos()
      if (opts.aoTick) opts.aoTick(s)
      if (s >= maxS) parar()
    }, 250)
    rec.start(1000)
    return { parar, segundos }
  }

  return { suportado, tipoEscolhido, tipoBase, extensao, fmt, iniciar }
})()
if (typeof window !== 'undefined') window.DiagAudio = DiagAudio
