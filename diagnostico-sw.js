// ── DIMA · Service Worker do app de campo do Diagnóstico Socioambiental ──
// Fica na RAIZ do site para poder controlar /pages/diagnostico-app.html sem
// precisar do header Service-Worker-Allowed; é registrado com escopo
// restrito à página do app ('/pages/diagnostico-app.html'), então não toca
// nas páginas da mesa.
//
// Ao mudar QUALQUER arquivo do shell abaixo, incremente VERSAO — é o que faz
// o aparelho baixar a versão nova.
const VERSAO = 8
const CACHE = 'dima-diag-v' + VERSAO
const SHELL = [
  '/pages/diagnostico-app.html',
  '/css/diagnostico-app.css',
  '/css/pin-baralho.css',
  '/js/pin-baralho.js',
  '/js/qrcode-generator.js',
  '/pwa/diagnostico-192.png',
  '/pwa/diagnostico-512.png',
  '/pwa/diagnostico-apple-180.png',
  '/pwa/logos/acre.png',
  '/pwa/logos/sema.png',
  '/pwa/logos/resiliencia.png',
  '/pwa/logos/resiliencia-simbolo.png',
  '/pwa/logos/unesco.png',
  '/pwa/logos/onu-brasil.png',
  '/pwa/logos/fundo-brasil-onu.png',
  '/pwa/logos/consorcio-amazonia.png',
  '/js/config.js',
  '/js/diag-regras.js',
  '/js/diag-offline.js',
  '/js/diag-sync.js',
  '/js/diag-form.js',
  '/js/diag-app.js',
  '/pwa/diagnostico.webmanifest',
  '/pwa/diagnostico-icone.svg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
]

self.addEventListener('install', ev => {
  // allSettled: CDN fora do ar não impede a instalação do resto
  ev.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()))
})

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('dima-diag-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url)
  // API do Supabase: sempre rede; sem rede, 503 em JSON (a fila trata como "sem conexão")
  if (url.hostname.endsWith('.supabase.co')) {
    ev.respondWith(fetch(ev.request).catch(() => new Response(JSON.stringify({ message: 'offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } })))
    return
  }
  if (ev.request.method !== 'GET') return
  // shell: cache primeiro (abre sem sinal), atualiza em segundo plano.
  // Busca só no cache DESTE app — nunca em caches de outras páginas.
  ev.respondWith(caches.open(CACHE).then(c => c.match(ev.request, { ignoreSearch: true }).then(guardado => {
    const rede = fetch(ev.request).then(r => { if (r.ok) c.put(ev.request, r.clone()); return r }).catch(() => guardado)
    return guardado || rede
  })))
})
