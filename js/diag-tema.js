// ── Diagnóstico · tema claro/escuro do app de campo ──────────────────────
// A pessoa escolhe na 1ª abertura (antes do login) e troca em Configurações.
// Fica só no aparelho (localStorage 'diag_tema'); não vai ao banco.
//
// O tema é aplicado ANTES de o CSS pintar por um <script> no <head> de
// pages/diagnostico-app.html (mesma lógica de aplicar() abaixo, sem piscar).
//
// iPhone instalado: a barra de status segue o tema ('default' = texto
// escuro no claro; 'black-translucent' = texto branco no escuro). O iOS lê
// essa meta ao abrir o app, por isso trocar o tema recarrega a página.
// Se ele mantiver a translúcida no claro, a faixa da área segura do topo é
// verde-escura (css) e a hora continua legível.

const DiagTema = (function () {
  const CHAVE = 'diag_tema'
  const COR = { claro: '#F3F5F3', escuro: '#0B120E' }

  function ler() {
    try { const t = localStorage.getItem(CHAVE); return t === 'claro' || t === 'escuro' ? t : null } catch (e) { return null }
  }
  function atual() { return ler() || 'claro' }
  function escolhido() { return !!ler() }

  function aplicar(t) {
    const de = document.documentElement
    de.dataset.tema = t
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.content = COR[t]
    const ios = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    if (ios) ios.content = t === 'escuro' ? 'black-translucent' : 'default'
  }

  // grava e aplica; devolve true se mudou (quem chama decide se recarrega)
  function definir(t) {
    if (t !== 'claro' && t !== 'escuro') return false
    const antes = ler()
    try { localStorage.setItem(CHAVE, t) } catch (e) { /* navegação privada: vale só nesta sessão */ }
    aplicar(t)
    return antes !== t
  }

  // 1ª abertura: mostra #ov-tema e resolve quando a pessoa escolhe
  function perguntar() {
    const ov = document.getElementById('ov-tema')
    if (!ov) return Promise.resolve(atual())
    return new Promise(resolve => {
      const marcar = t => ov.querySelectorAll('[data-tema]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tema === t)))
      marcar(atual())
      ov.querySelectorAll('[data-tema]').forEach(b => { b.onclick = () => { aplicar(b.dataset.tema); marcar(b.dataset.tema) } })
      ov.querySelector('#btn-tema-ok').onclick = () => {
        const t = document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro'
        definir(t); ov.hidden = true; resolve(t)
      }
      ov.hidden = false
    })
  }

  return { atual, escolhido, aplicar, definir, perguntar }
})()
if (typeof window !== 'undefined') window.DiagTema = DiagTema
