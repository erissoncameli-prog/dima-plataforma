// ═══════════════════════════════════════════════════════════════════════
// diagnostico-transcricao-ia.js — "Sugerir transcrição" com IA LOCAL (mesa)
// ═══════════════════════════════════════════════════════════════════════
// Whisper rodando NO NAVEGADOR (transformers.js + onnxruntime-web, num Web
// Worker para não travar a tela). O modelo é baixado UMA vez do Hugging Face
// e fica no cache do navegador; a VOZ NÃO SAI DESTE COMPUTADOR — a frase do
// aviso ("ouvidas somente pela equipe") continua verdadeira.
//
// Regras:
//   • a IA só preenche um RASCUNHO; quem salva é a pessoa, depois de ouvir.
//     diag_transcrever_audio grava transcricao_origem='ia_local' + modelo;
//   • nada de serviço de nuvem aqui (seria transferência internacional —
//     decisão de 28/09, plano §6.15);
//   • desligar: ATIVA = false (o botão some; a transcrição manual segue).
// ═══════════════════════════════════════════════════════════════════════

const DiagTranscricaoIA = (function () {
  const ATIVA = true
  const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0'
  // em ordem: se o primeiro não carregar, tenta o seguinte
  const MODELOS = ['onnx-community/whisper-small', 'Xenova/whisper-small']
  let worker = null, seq = 0
  const pendentes = new Map()
  let ouvinteProgresso = null
  let teste = null           // injeção para o teste automatizado (sem rede)

  function ativa() {
    return ATIVA && typeof Worker !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext)
  }

  function codigoWorker() {
    return `
import { pipeline, env } from '${LIB}';
env.allowLocalModels = false;
let asr = null, info = null;
async function temWebGPU() {
  try { return !!(self.navigator && navigator.gpu && await navigator.gpu.requestAdapter()); } catch (e) { return false; }
}
async function carregar(modelos) {
  if (asr) return asr;
  const progress_callback = p => self.postMessage({ tipo: 'progresso', p });
  const tentativas = [];
  const gpu = await temWebGPU();
  for (const modelo of modelos) {
    if (gpu) tentativas.push({ modelo, device: 'webgpu', dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4' } });
    tentativas.push({ modelo, device: 'wasm', dtype: 'q8' });
  }
  let ultimo = null;
  for (const t of tentativas) {
    try {
      asr = await pipeline('automatic-speech-recognition', t.modelo, { device: t.device, dtype: t.dtype, progress_callback });
      info = { modelo: t.modelo, device: t.device };
      return asr;
    } catch (e) { ultimo = e; asr = null; }
  }
  throw ultimo || new Error('modelo indisponível');
}
self.onmessage = async ev => {
  const { id, modelos, audio } = ev.data;
  try {
    const t = await carregar(modelos);
    self.postMessage({ id, tipo: 'fase', fase: 'transcrevendo', info });
    const r = await t(audio, { language: 'portuguese', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
    self.postMessage({ id, tipo: 'ok', texto: String((r && r.text) || '').trim(), info });
  } catch (e) {
    self.postMessage({ id, tipo: 'erro', msg: String((e && e.message) || e) });
  }
};`
  }

  function obterWorker() {
    if (worker) return worker
    const url = URL.createObjectURL(new Blob([codigoWorker()], { type: 'text/javascript' }))
    worker = new Worker(url, { type: 'module' })
    worker.onmessage = ev => {
      const m = ev.data || {}
      if (m.tipo === 'progresso') { if (ouvinteProgresso) ouvinteProgresso({ fase: 'baixando', p: m.p }); return }
      const pend = pendentes.get(m.id); if (!pend) return
      if (m.tipo === 'fase') { pend.aoProgresso && pend.aoProgresso({ fase: m.fase, info: m.info }); return }
      pendentes.delete(m.id)
      if (m.tipo === 'ok') pend.resolve({ texto: m.texto, modelo: m.info && m.info.modelo, device: m.info && m.info.device })
      else pend.reject(new Error(m.msg || 'falha na transcrição'))
    }
    worker.onerror = ev => {
      const erro = new Error((ev && ev.message) || 'o módulo de IA não carregou (sem internet para baixar o modelo?)')
      pendentes.forEach(p => p.reject(erro)); pendentes.clear()
      worker = null
    }
    return worker
  }

  // áudio do bucket privado → 16 kHz mono (o que o Whisper espera)
  async function decodificar(url) {
    const assinada = await urlAssinada(url)
    const resp = await fetch(assinada)
    if (!resp.ok) throw new Error('não foi possível baixar o áudio (' + resp.status + ')')
    const buf = await resp.arrayBuffer()
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    let dec
    try { dec = await ctx.decodeAudioData(buf) } finally { try { ctx.close() } catch (e) { /* segue */ } }
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(dec.duration * 16000)), 16000)
    const src = off.createBufferSource(); src.buffer = dec; src.connect(off.destination); src.start()
    const r = await off.startRendering()
    return r.getChannelData(0)
  }

  // url do áudio (formato do banco) → { texto, modelo, device }
  // aoProgresso({ fase: 'decodificando'|'baixando'|'transcrevendo', p?, info? })
  async function transcrever(url, aoProgresso) {
    ouvinteProgresso = aoProgresso || null
    if (aoProgresso) aoProgresso({ fase: 'decodificando' })
    if (teste) {
      const audio = await teste.decodificar(url)
      if (aoProgresso) aoProgresso({ fase: 'transcrevendo', info: { modelo: MODELOS[0], device: 'teste' } })
      return { texto: await teste.motor(audio), modelo: MODELOS[0], device: 'teste' }
    }
    const audio = new Float32Array(await decodificar(url))   // cópia: o buffer vai por transferência ao worker
    const w = obterWorker()
    return new Promise((resolve, reject) => {
      const id = ++seq
      pendentes.set(id, { resolve, reject, aoProgresso })
      w.postMessage({ id, modelos: MODELOS, audio }, [audio.buffer])
    })
  }

  return { ativa, transcrever, MODELOS, _testar: t => { teste = t } }
})()
if (typeof window !== 'undefined') window.DiagTranscricaoIA = DiagTranscricaoIA
