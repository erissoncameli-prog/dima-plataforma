/*!
 * Plataforma Inteligente de Gestão de Projetos
 * © 2025–2026 Erisson Cameli Santiago. Todos os direitos reservados.
 * Concepção e Desenvolvimento: Erisson Cameli Santiago <erissoncameli@gmail.com>
 * Ver LICENSE e NOTICE na raiz do repositório.
 */
// ── Autoria do sistema — FONTE ÚNICA ─────────────────────────────────────────────────────
// Toda tela, relatório e app que mostra o crédito lê daqui. Fica no CÓDIGO de propósito, e não em
// configuracoes_sistema: nenhum administrador apaga ou troca a autoria pela tela.
//
//   DimaAutoria.dados           → { sistema, autor, papel, email, telefone, anos, ... } (congelado)
//   DimaAutoria.linha()         → "Plataforma … · Concepção e Desenvolvimento: … · © 2025–2026"
//   DimaAutoria.rodapeMenu()    → HTML do rodapé do menu lateral (layout.js)
//   DimaAutoria.abrirSobre()    → janela "Sobre o sistema" (autor, contato, licença, terceiros)
//   [data-dima-autoria]         → qualquer elemento com esse atributo recebe o crédito ao carregar a página
//                                  (valor "sobre" acrescenta o link para a janela)
// Não depende de config.js nem de layout.js (a tela de entrada e as páginas públicas também usam).
;(function (g) {
  if (g.DimaAutoria) return

  const dados = Object.freeze({
    sistema: 'Plataforma Inteligente de Gestão de Projetos',
    autor: 'Erisson Cameli Santiago',
    email: 'erissoncameli@gmail.com',
    telefone: '+55 (68) 99936-1984',
    telefoneLink: '+5568999361984',
    anos: '2025–2026',
    titular: 'Erisson Cameli Santiago',
    uso: 'SEMA/AC · Projeto 218BRA2001 · Fundo Brasil-ONU',
  })

  const TX = {
    pt: {
      papel: 'Concepção e Desenvolvimento', sobre: 'Sobre o sistema', fechar: 'Fechar', contato: 'Contato',
      direitos: 'Todos os direitos reservados.',
      uso: 'Uso autorizado pelo autor, sem custo, à',
      dados: 'Os dados registrados na plataforma pertencem à SEMA/AC, controladora nos termos da LGPD.',
      proibido: 'É proibido copiar, modificar, redistribuir, registrar ou reivindicar a autoria deste sistema, no todo ou em parte, sem autorização escrita do autor (Lei 9.609/1998 e Lei 9.610/1998).',
      terceiros: 'Componentes de terceiros', terceirosTx: 'Bibliotecas de código aberto usadas sob as licenças de seus autores (lista completa no arquivo NOTICE).',
      publico: 'O painel público (site-publico) é obra de outro autor e não integra esta autoria.',
    },
    en: {
      papel: 'Concept and Development', sobre: 'About the system', fechar: 'Close', contato: 'Contact',
      direitos: 'All rights reserved.',
      uso: 'Use authorized by the author, free of charge, to',
      dados: 'Data recorded on the platform belongs to SEMA/AC, the data controller under the LGPD.',
      proibido: 'Copying, modifying, redistributing, registering or claiming authorship of this system, in whole or in part, without the author’s written permission is prohibited (Brazilian Laws 9,609/1998 and 9,610/1998).',
      terceiros: 'Third-party components', terceirosTx: 'Open-source libraries used under their authors’ licenses (full list in the NOTICE file).',
      publico: 'The public portal (site-publico) is the work of another author and is not part of this authorship.',
    },
    es: {
      papel: 'Concepción y Desarrollo', sobre: 'Acerca del sistema', fechar: 'Cerrar', contato: 'Contacto',
      direitos: 'Todos los derechos reservados.',
      uso: 'Uso autorizado por el autor, sin costo, a',
      dados: 'Los datos registrados en la plataforma pertenecen a la SEMA/AC, responsable del tratamiento según la LGPD.',
      proibido: 'Se prohíbe copiar, modificar, redistribuir, registrar o reivindicar la autoría de este sistema, total o parcialmente, sin autorización escrita del autor (Leyes brasileñas 9.609/1998 y 9.610/1998).',
      terceiros: 'Componentes de terceros', terceirosTx: 'Bibliotecas de código abierto usadas bajo las licencias de sus autores (lista completa en el archivo NOTICE).',
      publico: 'El portal público (site-publico) es obra de otro autor y no forma parte de esta autoría.',
    },
  }
  // Mesma lista do arquivo NOTICE — biblioteca nova entra nos dois
  const TERCEIROS = [
    ['Supabase JS', 'MIT'], ['Chart.js', 'MIT'], ['Leaflet', 'BSD-2-Clause'], ['Leaflet.markercluster', 'MIT'],
    ['Leaflet-MiniMap', 'BSD-2-Clause'], ['Turf.js', 'MIT'], ['shpjs', 'MIT'], ['ExcelJS', 'MIT'], ['SheetJS (xlsx)', 'Apache-2.0'],
    ['PptxGenJS', 'MIT'], ['jsPDF', 'MIT'], ['html2canvas', 'MIT'], ['JSZip', 'MIT'], ['Mammoth', 'BSD-2-Clause'],
    ['Quill', 'BSD-3-Clause'], ['PDF.js', 'Apache-2.0'], ['Transformers.js', 'Apache-2.0'], ['qrcode-generator', 'MIT'],
  ]

  const idioma = () => {
    let l = null
    try { l = (typeof appState !== 'undefined' && appState && appState.idioma) || localStorage.getItem('dima_idioma') } catch (e) {}
    return TX[l] ? l : 'pt'
  }
  const t = k => TX[idioma()][k]
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const copyright = () => `© ${dados.anos} ${dados.autor}`

  // Estilo próprio (css/autoria.css), resolvido a partir do endereço deste script
  const base = (() => {
    const s = document.currentScript && document.currentScript.src
    return s ? s.replace(/js\/autoria\.js(\?.*)?$/, '') : ''
  })()
  if (base && !document.querySelector('link[href*="css/autoria.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = base + 'css/autoria.css'
    document.head.appendChild(l)
  }
  // Metadados da página (o HTML estático também traz <meta name="author">)
  function meta(nome, valor) {
    let m = document.querySelector(`meta[name="${nome}"]`)
    if (!m) { m = document.createElement('meta'); m.name = nome; document.head.appendChild(m) }
    m.content = valor
  }
  meta('author', dados.autor)
  meta('copyright', `${copyright()}. ${TX.pt.direitos}`)

  // Linha usada nos rodapés e nos relatórios A4: sem telefone nem e-mail (contato só na janela "Sobre")
  const linha = () => `${dados.sistema} · ${t('papel')}: ${dados.autor} · © ${dados.anos}`

  const ICONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>'

  function rodapeMenu() {
    return `<div class="aut-menu">
      <div class="aut-menu-sis">${esc(dados.sistema)}</div>
      <div class="aut-menu-papel">${esc(t('papel'))}</div>
      <div class="aut-menu-autor">${esc(dados.autor)}</div>
      <button type="button" class="aut-menu-btn" onclick="DimaAutoria.abrirSobre(this)">${ICONE}<span>${esc(t('sobre'))}</span></button>
    </div>`
  }

  function preencher(raiz) {
    (raiz || document).querySelectorAll('[data-dima-autoria]').forEach(el => {
      const comSobre = el.getAttribute('data-dima-autoria') === 'sobre'
      el.classList.add('aut-credito')
      el.innerHTML = `<span>${esc(dados.sistema)}</span> <span class="aut-sep">·</span> <span>${esc(t('papel'))}: <strong>${esc(dados.autor)}</strong></span> <span class="aut-sep">·</span> <span>© ${esc(dados.anos)}</span>`
        + (comSobre ? ` <span class="aut-sep">·</span> <button type="button" class="aut-link" onclick="DimaAutoria.abrirSobre(this)">${esc(t('sobre'))}</button>` : '')
    })
  }

  // ── Janela "Sobre o sistema" ──────────────────────────────────────
  let ov = null, origem = null
  function fechar() {
    if (!ov) return
    ov.remove(); ov = null
    document.removeEventListener('keydown', teclado, true)
    if (origem && origem.focus) { try { origem.focus() } catch (e) {} }
    origem = null
  }
  function teclado(e) {
    if (!ov) return
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); fechar(); return }
    if (e.key === 'Tab') {
      const f = [...ov.querySelectorAll('a[href],button')]
      if (!f.length) return
      const i = f.indexOf(document.activeElement)
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus() }
    }
  }
  function abrirSobre(btn) {
    if (ov) return
    origem = btn || document.activeElement
    ov = document.createElement('div')
    ov.className = 'aut-ov'
    ov.innerHTML = `<div class="aut-dlg" role="dialog" aria-modal="true" aria-labelledby="aut-titulo">
      <button type="button" class="aut-x" aria-label="${esc(t('fechar'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      <p class="aut-rot">${esc(t('sobre'))}</p>
      <h2 class="aut-titulo" id="aut-titulo">${esc(dados.sistema)}</h2>
      <div class="aut-autor">
        <p class="aut-rot">${esc(t('papel'))}</p>
        <p class="aut-nome">${esc(dados.autor)}</p>
        <p class="aut-contato"><span class="aut-sr">${esc(t('contato'))}: </span>
          <a href="mailto:${esc(dados.email)}">${esc(dados.email)}</a>
          <span class="aut-sep">·</span>
          <a href="tel:${esc(dados.telefoneLink)}">${esc(dados.telefone)}</a></p>
      </div>
      <p class="aut-direitos"><strong>${esc(copyright())}.</strong> ${esc(t('direitos'))}</p>
      <p>${esc(t('uso'))} ${esc(dados.uso)}.</p>
      <p>${esc(t('dados'))}</p>
      <p class="aut-aviso">${esc(t('proibido'))}</p>
      <details class="aut-terceiros">
        <summary>${esc(t('terceiros'))}</summary>
        <p>${esc(t('terceirosTx'))}</p>
        <ul>${TERCEIROS.map(([n, l]) => `<li>${esc(n)} <span>${esc(l)}</span></li>`).join('')}</ul>
        <p>${esc(t('publico'))}</p>
      </details>
    </div>`
    ov.addEventListener('click', e => { if (e.target === ov) fechar() })
    ov.querySelector('.aut-x').addEventListener('click', fechar)
    document.body.appendChild(ov)
    document.addEventListener('keydown', teclado, true)
    ov.querySelector('.aut-x').focus()
  }

  g.DimaAutoria = Object.freeze({ dados, linha, copyright, rodapeMenu, abrirSobre, preencher })

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => preencher())
  else preencher()

  try { console.info(`%c${dados.sistema}%c\n${copyright()}. ${TX.pt.direitos}\n${TX.pt.papel}: ${dados.autor} <${dados.email}>`, 'font-weight:700;color:#1F4E2C', '') } catch (e) {}
})(window)
