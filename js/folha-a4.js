// Folha A4 dos relatórios — PADRÃO ÚNICO da plataforma (aba Relatórios, CAR do Mapa, Remanejamento,
// Visão Geral). Todo relatório novo deve sair por aqui; estilo em css/folha-a4.css. Depende de js/logos.js.
//
//   FolhaA4.html({ titulo, selo, tema, periodo, corpo, paisagem, usuario, perfil })
//     → a folha: cabeçalho (logos do topo à esquerda, logo do projeto à direita, título + selo + "Gerado em"),
//       identificação do projeto, corpo e rodapé (parceiros centralizados + "Impresso por"). A folha é uma
//       <table>: thead/tfoot se repetem em toda página impressa; "Página X de Y" vem do @page (paginaCss).
//   FolhaA4.ajustar(folha) → se algo passa da largura útil, liga .doc-fit e depois .doc-fit-max (letra menor,
//       quebra de palavra) e devolve { compacto, ainda }.
//   FolhaA4.paginaCss('portrait'|'landscape') → @page do A4 (margens 10/10/12 mm, número da página).
//   FolhaA4.janela() → abre a aba ANTES de qualquer await (senão o navegador bloqueia o pop-up);
//   FolhaA4.escrever(win, { ...html, css, nomeArquivo }) → escreve a folha nessa aba, com barra Retrato/Paisagem
//       e "Imprimir ou salvar em PDF" (motor de impressão do navegador: texto de verdade, nada sai do navegador).
//   FolhaA4.escopo(css) → prefixa regras simples com .doc-body (CSS próprio do relatório não vaza para a folha).
;(function (g) {
  const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const PERFIS = { super_admin: 'Super Admin', coordenacao: 'Coordenação', tecnico: 'Técnico', financeiro: 'Financeiro', consultor_externo: 'Consultor externo', visualizador: 'Visualizador' }
  const agora = () => new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  function raiz() {
    const p = location.pathname, i = p.indexOf('/pages/')
    return location.origin + (i >= 0 ? p.slice(0, i + 1) : p.replace(/[^/]*$/, ''))
  }

  // logos: as que já foram lidas do banco nesta página (DimaLogos.carregar), senão as guardadas no aparelho
  let L = null
  if (g.DimaLogos) { try { DimaLogos.carregar().then(x => { L = x }) } catch (e) {} }
  const logos = () => L || (g.DimaLogos ? DimaLogos.agora() : { topo: [], projeto: null, parceiros: [] })

  function cabecalho(o) {
    const lg = logos()
    const esq = lg.topo.map(l => DimaLogos.img(l, 'claro', { altura: 34, classe: 'doc-header-logo', cors: true })).filter(Boolean).join('<div class="doc-header-sep"></div>')
    const dir = lg.projeto ? DimaLogos.img(lg.projeto, 'claro', { altura: 34, classe: 'doc-header-logo', cors: true, tamanho: false }) : ''
    return `<div class="doc-header">
      <div class="doc-header-logos"><div class="doc-header-logos-esq">${esq}</div><div class="doc-header-logos-dir">${dir}</div></div>
      <div class="doc-header-titulo-wrap">
        <div class="doc-header-titulo">${escH(o.titulo)}${o.selo ? `<span class="doc-header-badge" data-tema="${escH(o.tema || '')}">${escH(o.selo)}</span>` : ''}</div>
        <div class="doc-header-meta">${o.periodo ? `<div>${escH(o.periodo)}</div>` : ''}<div>Gerado em: <strong>${agora()}</strong></div></div>
      </div>
    </div>`
  }
  const intro = () => `<div class="doc-intro">
      <div class="doc-header-projeto">Projeto 218BRA2001 · UNESCO / Fundo Multipartes das Nações Unidas</div>
      <div class="doc-header-programa">Programa de Resiliência Socioambiental nas APAs Igarapé São Francisco e Lago do Amapá</div>
      <div class="doc-header-local">Rio Branco, Acre — SEMA/AC</div>
    </div>`
  function rodape(o) {
    const parc = DimaLogos.lista(logos().parceiros, 'claro', { altura: 24, classe: 'doc-footer-logo', cors: true })
    return `<div class="doc-footer">
      ${parc.length ? `<div class="doc-footer-logos">${parc.join('')}</div>` : ''}
      <div class="doc-footer-txt">Impresso por <strong>${escH(o.usuario || 'Usuário')}</strong>${o.perfil ? ' · ' + escH(o.perfil) : ''} · Plataforma DIMA · SEMA/AC · UNESCO 218BRA2001</div>
    </div>`
  }
  function marcaDagua() {
    const p = logos().projeto, src = p && (p.url || p.url_escuro)
    return src ? `<div class="doc-watermark"><img src="${escH(DimaLogos.url(src))}" alt="" crossorigin="anonymous"></div>` : ''
  }

  // o: { titulo, selo, tema, periodo, corpo (HTML já escapado), paisagem, usuario, perfil, id }
  function html(o) {
    // appState do config.js é const global (não fica em window)
    const st = (typeof appState !== 'undefined' && appState) || {}
    const usuario = o.usuario || st.usuario?.nome_completo || st.usuario?.email
    const perfil = o.perfil || PERFIS[st.perfil] || st.perfil || ''
    return `<div class="doc-wrap${o.paisagem ? ' doc-paisagem' : ''}" data-paisagem="${o.paisagem ? 'true' : 'false'}"${o.id ? ` id="${escH(o.id)}"` : ''}>
    ${marcaDagua()}
    <table class="doc-pg" role="presentation">
      <thead><tr><td>${cabecalho(o)}</td></tr></thead>
      <tfoot><tr><td>${rodape({ usuario, perfil })}</td></tr></tfoot>
      <tbody><tr><td>${intro()}<div class="doc-body">${o.corpo || ''}</div></td></tr></tbody>
    </table>
  </div>`
  }

  // Sem dependências: é copiada como texto para a janela própria do relatório.
  function ajustar(w) {
    const passa = () => {
      const corpo = w.querySelector('.doc-body'); if (!corpo) return false
      const lim = w.getBoundingClientRect().right - parseFloat(getComputedStyle(w).paddingRight) + 1
      return [...corpo.querySelectorAll('*')].some(e => e.getBoundingClientRect().right > lim)
    }
    w.classList.remove('doc-fit', 'doc-fit-max')
    let compacto = false, ainda = false
    if (passa()) {
      w.classList.add('doc-fit'); compacto = true
      if (passa()) { w.classList.add('doc-fit-max'); ainda = passa() }
    }
    return { compacto, ainda }
  }
  function aviso(r, orient) {
    if (r.ainda) return orient === 'portrait' ? 'Algumas colunas não cabem em retrato: use Paisagem.' : 'Algumas colunas não cabem nem em paisagem; o texto foi reduzido ao mínimo.'
    if (r.compacto) return 'A letra foi reduzida para a tabela caber na folha.' + (orient === 'portrait' ? ' Em Paisagem fica mais legível.' : '')
    return ''
  }

  const paginaCss = orient => `@page { size: A4 ${orient === 'landscape' ? 'landscape' : 'portrait'}; margin: 10mm 10mm 12mm;
    @bottom-center { content: "Página " counter(page) " de " counter(pages); font: 600 8.5pt Arial, Helvetica, sans-serif; color: #6B7280; } }`

  // Prefixa cada regra simples (sem @media/@page) com .doc-body
  function escopo(css) {
    return String(css || '').split('}').map(b => {
      const i = b.indexOf('{'); if (i < 0) return b.trim() ? b : ''
      const sel = b.slice(0, i).trim(), corpo = b.slice(i)
      if (!sel || sel[0] === '@') return ''
      return sel.split(',').map(s => '.doc-body ' + s.trim().replace(/^(body|html)\b/, '').trim()).join(',') + corpo + '}'
    }).join('\n')
  }

  function janela() {
    const w = window.open('', '_blank')
    if (!w) { if (typeof g.toast === 'function') toast('Permita pop-ups neste site para gerar o relatório.', 'warning'); return null }
    w.document.write('<!doctype html><meta charset="utf-8"><title>Gerando relatório…</title><body style="font-family:Arial,sans-serif;color:#6B7280;padding:40px;text-align:center">Gerando relatório A4…</body>')
    w.document.close()  // fechado: senão o documento escrito depois fica "carregando" e não baixa CSS nem imagens
    return w
  }

  // Escreve o relatório na aba aberta por janela(). o = opções de html() + { css, nomeArquivo, imprimir }
  function escrever(w, o) {
    if (!w) return
    const orient = o.paisagem ? 'landscape' : 'portrait'
    const nome = (o.nomeArquivo || o.titulo || 'relatorio').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) + '_' + new Date().toISOString().slice(0, 10)
    const css = new URL('css/folha-a4.css', raiz()).href
    w.document.open()
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escH(nome)}</title><link rel="stylesheet" href="${escH(css)}"><style id="fa4-pagina">${paginaCss(orient)}</style>
${o.css ? `<style>${escopo(o.css)}</style>` : ''}</head>
<body class="fa4-janela">
<div class="fa4-barra" role="toolbar" aria-label="Folha A4">
  <b>${escH(o.titulo || 'Relatório')}</b>
  <button type="button" data-o="portrait" aria-pressed="${orient === 'portrait'}">Retrato</button>
  <button type="button" data-o="landscape" aria-pressed="${orient === 'landscape'}">Paisagem</button>
  <button type="button" class="pri" data-imprimir>Imprimir ou salvar em PDF</button>
  <span class="fa4-aviso" role="status"></span>
</div>
${html(o)}
<script>
(function(){
  var ajustar=${ajustar.toString()};
  var aviso=${aviso.toString()};
  var paginaCss=${paginaCss.toString()};
  var w=document.querySelector('.doc-wrap'), orient=${JSON.stringify(orient)};
  function aplicar(o){ orient=o; w.classList.toggle('doc-paisagem', o==='landscape');
    document.getElementById('fa4-pagina').textContent=paginaCss(o);
    document.querySelectorAll('[data-o]').forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.o===o)); });
    document.querySelector('.fa4-aviso').textContent=aviso(ajustar(w), o); }
  document.querySelectorAll('[data-o]').forEach(function(b){ b.onclick=function(){ aplicar(b.dataset.o); }; });
  document.querySelector('[data-imprimir]').onclick=function(){ window.print(); };
  function pronto(){ aplicar(orient); ${o.imprimir === false ? '' : 'setTimeout(function(){ window.print(); }, 300);'} }
  // espera as imagens (logos, mapas) para medir e imprimir
  var imgs=[].slice.call(document.images).filter(function(i){ return !i.complete; });
  if(!imgs.length) pronto(); else { var n=imgs.length, f=function(){ if(--n<=0) pronto(); };
    imgs.forEach(function(i){ i.addEventListener('load', f); i.addEventListener('error', f); }); setTimeout(function(){ if(n>0){ n=0; pronto(); } }, 4000); }
})();
<\/script>
</body></html>`)
    w.document.close()
    w.focus()
  }

  g.FolhaA4 = { html, ajustar, aviso, paginaCss, escopo, janela, escrever, PERFIS }
})(window)
