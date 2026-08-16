// ═══════════════════════════════════════════════════════════════════════
// acervo-capas.js — Capa do pôster a partir da 1ª página do PDF
// ═══════════════════════════════════════════════════════════════════════
// Renderiza a primeira página do produto com pdf.js e guarda a miniatura
// para todo mundo. Estratégia híbrida, escolhida por não exigir runtime de
// renderização no servidor (Deno não tem canvas nativo):
//
//   1. o primeiro usuário que rolar o pôster até a tela gera a capa
//   2. a miniatura (~400px, JPEG) sobe para o bucket privado acervo-capas
//   3. a linha em acervo_capas registra o caminho
//   4. todos os demais só baixam a imagem pronta
//
// O acervo se completa sozinho conforme as pessoas navegam — não há job de
// backfill. PDF ilegível vira status='falha' e não é tentado de novo.
//
// ⚠️ O bucket é PRIVADO de propósito: a página 1 de um produto de consultor
// PF costuma trazer nome e às vezes CPF. A exibição passa por urlAssinada(),
// como todo documento do projeto.
//
// Só se gera capa da EDIÇÃO VIGENTE — a view entrega em `capa_midia_id`
// apenas o PDF vigente mais recente da obra.
// ═══════════════════════════════════════════════════════════════════════

const CAPA_BUCKET = 'acervo-capas';
const CAPA_LARGURA = 400;      // px; suficiente para o pôster de 168px em 2x
const CAPA_QUALIDADE = 0.72;
const CAPA_PARALELAS = 2;      // downloads simultâneos de PDF

const PDFJS_VER = '4.7.76';
const PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/';

let _pdfjs = null;             // módulo carregado sob demanda
let _pdfjsErro = false;
const _emAndamento = new Set();  // midia_id sendo gerados agora
const _fila = [];
let _ativos = 0;
let _observador = null;

// ── Carga sob demanda do pdf.js ──────────────────────────────────────
// Só baixa a biblioteca se houver de fato alguma capa a gerar.
async function carregarPdfJs() {
  if (_pdfjs) return _pdfjs;
  if (_pdfjsErro) return null;
  try {
    const mod = await import(PDFJS_BASE + 'build/pdf.min.mjs');
    // Worker vindo de outra origem é bloqueado pelo navegador. Baixar o
    // script e criar o worker a partir de um blob same-origin contorna isso;
    // se falhar, o pdf.js cai sozinho para a thread principal (mais lento,
    // porém funcional — e cada arquivo só é renderizado uma vez na vida).
    try {
      const fonte = await fetch(PDFJS_BASE + 'build/pdf.worker.min.mjs').then(r => r.text());
      mod.GlobalWorkerOptions.workerSrc =
        URL.createObjectURL(new Blob([fonte], { type: 'text/javascript' }));
    } catch (e) {
      console.warn('Acervo: worker do pdf.js indisponível, renderizando na thread principal.', e);
    }
    _pdfjs = mod;
    return mod;
  } catch (e) {
    console.warn('Acervo: não foi possível carregar o pdf.js; os pôsteres seguem com o degradê.', e);
    _pdfjsErro = true;
    return null;
  }
}

// midia_id tem ':' — inválido como caminho de storage
function caminhoCapa(obra) {
  return obra.obra_id + '/' + String(obra.capa_midia_id).replace(/[^a-zA-Z0-9._-]/g, '_') + '.jpg';
}

// ── Geração ──────────────────────────────────────────────────────────
async function renderizarCapa(obra) {
  const pdfjs = await carregarPdfJs();
  if (!pdfjs) return null;

  const assinada = await urlAssinada(obra.capa_fonte_url);
  const doc = await pdfjs.getDocument({
    url: assinada,
    standardFontDataUrl: PDFJS_BASE + 'standard_fonts/',
    disableAutoFetch: true,
  }).promise;

  try {
    const pagina = await doc.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const vp = pagina.getViewport({ scale: CAPA_LARGURA / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    // PDF sem fundo declarado renderiza transparente e vira preto no JPEG
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport: vp }).promise;

    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', CAPA_QUALIDADE));
    if (!blob) throw new Error('canvas não produziu imagem');
    return { blob: blob, largura: canvas.width, altura: canvas.height };
  } finally {
    doc.destroy();
  }
}

async function gerarEPublicar(obra) {
  const midiaId = obra.capa_midia_id;
  try {
    const capa = await renderizarCapa(obra);
    if (!capa) return null;

    const caminho = caminhoCapa(obra);
    const up = await db.storage.from(CAPA_BUCKET)
      .upload(caminho, capa.blob, { contentType: 'image/jpeg', upsert: true });
    if (up.error) throw up.error;

    // Guarda a URL no mesmo formato dos demais arquivos: a string é apenas
    // portadora do caminho — o bucket é privado e a leitura vai assinada.
    const publica = db.storage.from(CAPA_BUCKET).getPublicUrl(caminho).data.publicUrl;

    const reg = await db.from('acervo_capas').upsert({
      midia_id: midiaId,
      obra_id: obra.obra_id,
      arquivo_url: publica,
      largura: capa.largura,
      altura: capa.altura,
      bytes: capa.blob.size,
      status: 'ok',
      erro: null,
      gerada_em: new Date().toISOString(),
      gerada_por: appState.usuario && appState.usuario.id,
    }, { onConflict: 'midia_id' });
    if (reg.error) throw reg.error;

    obra.capa_url = publica;
    obra.capa_status = 'ok';
    return publica;
  } catch (e) {
    console.warn('Acervo: falha ao gerar capa de', midiaId, e);
    obra.capa_status = 'falha';
    // Marca a falha para não retentar a cada visita
    try {
      await db.from('acervo_capas').upsert({
        midia_id: midiaId,
        obra_id: obra.obra_id,
        status: 'falha',
        erro: String((e && e.message) || e).slice(0, 400),
        gerada_em: new Date().toISOString(),
        gerada_por: appState.usuario && appState.usuario.id,
      }, { onConflict: 'midia_id' });
    } catch (e2) { /* sem permissão de escrita: segue com o degradê */ }
    return null;
  }
}

// ── Fila com paralelismo limitado ────────────────────────────────────
function enfileirar(obra) {
  if (_emAndamento.has(obra.capa_midia_id)) return;
  _emAndamento.add(obra.capa_midia_id);
  _fila.push(obra);
  bombear();
}

function bombear() {
  while (_ativos < CAPA_PARALELAS && _fila.length) {
    const obra = _fila.shift();
    _ativos++;
    gerarEPublicar(obra)
      .then(url => { if (url) aplicarCapa(obra); })
      .finally(() => { _ativos--; bombear(); });
  }
}

// ── Pintura ──────────────────────────────────────────────────────────
// Troca o degradê pela capa em todos os pôsteres da obra que estiverem na
// tela (a mesma obra pode aparecer em várias prateleiras).
async function aplicarCapa(obra) {
  if (!obra.capa_url) return;
  let assinada;
  try { assinada = await urlAssinada(obra.capa_url); } catch (e) { return; }

  document.querySelectorAll('[data-capa-obra="' + obra.obra_id + '"]').forEach(poster => {
    if (poster.querySelector('.acv-poster-capa')) return;
    const img = document.createElement('img');
    img.className = 'acv-poster-capa';
    img.alt = '';
    img.loading = 'lazy';
    img.onload = () => { img.classList.add('on'); poster.classList.add('com-capa'); };
    img.src = assinada;
    poster.insertBefore(img, poster.firstChild);
  });
}

// ── Entrada pública ──────────────────────────────────────────────────
// Chamada após cada render de cards. Observa os pôsteres visíveis e:
//   · com capa pronta  → pinta
//   · sem capa e apto  → gera quando entrar na viewport
function ligarCapas(indice) {
  if (!_observador) {
    _observador = new IntersectionObserver(entradas => {
      entradas.forEach(en => {
        if (!en.isIntersecting) return;
        _observador.unobserve(en.target);
        const obra = indice[en.target.dataset.capaObra];
        if (!obra) return;
        if (obra.capa_url) aplicarCapa(obra);
        else if (obra.capa_midia_id && obra.capa_status !== 'falha') enfileirar(obra);
      });
    }, { rootMargin: '220px' });
  }
  document.querySelectorAll('[data-capa-obra]').forEach(poster => {
    if (poster.dataset.capaObservado) return;
    poster.dataset.capaObservado = '1';
    _observador.observe(poster);
  });
}
