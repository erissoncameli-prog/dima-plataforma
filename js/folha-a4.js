// Folha A4 dos relatórios — PADRÃO ÚNICO da plataforma (aba Relatórios, CAR do Mapa, Remanejamento,
// Visão Geral). Todo relatório novo deve sair por aqui; estilo em css/folha-a4.css. Depende de js/logos.js.
//
//   FolhaA4.html({ titulo, selo, tema, periodo, corpo, paisagem, usuario, perfil })
//     → a folha: cabeçalho (logos do topo à esquerda, logo do projeto à direita, título + selo + "Gerado em"),
//       identificação do projeto (Dados do sistema), corpo e rodapé (parceiros centralizados + "Impresso por").
//   FolhaA4.paginar(folha, destino) → páginas A4 (.fa4-pag), cada uma com cabeçalho, rodapé e "Página X de Y"
//       — vale em qualquer navegador, inclusive o Safari do iPhone/iPad. FolhaA4.pronto = logos e projeto lidos.
//   FolhaA4.ajustar(folha) → se algo passa da largura útil, liga .doc-fit e depois .doc-fit-max (letra menor,
//       quebra de palavra) e devolve { compacto, ainda }.
//   FolhaA4.paginaCss('portrait'|'landscape') → @page do A4 (margem 0: a margem está em cada página).
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
  let lendoLogos = Promise.resolve()
  if (g.DimaLogos) { try { lendoLogos = DimaLogos.carregar().then(x => { L = x }, () => {}) } catch (e) {} }
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
  // Identificação do projeto: Dados do sistema (configuracoes_sistema), guardada no aparelho para a próxima abertura
  const CHAVE_PROJ = 'dima_projeto_v1'
  let P = (() => { try { return JSON.parse(localStorage.getItem(CHAVE_PROJ) || 'null') } catch (e) { return null } })() || {}
  function carregarProjeto(cliente) {
    const c = cliente || (typeof db !== 'undefined' ? db : null)  // `db` do config.js é const global
    if (!c) return Promise.resolve(P)
    return c.from('configuracoes_sistema').select('projeto_codigo,projeto_nome,projeto_localizacao').eq('projeto_id', 'default').maybeSingle()
      .then(({ data }) => { if (data) { P = data; try { localStorage.setItem(CHAVE_PROJ, JSON.stringify(data)) } catch (e) {} } return P }, () => P)
  }
  // relatório só é montado depois de ler logos e identificação (await FolhaA4.pronto)
  const pronto = Promise.all([carregarProjeto(), lendoLogos]).then(() => P, () => P)
  const intro = () => `<div class="doc-intro">
      ${P.projeto_codigo ? `<div class="doc-header-projeto">Projeto ${escH(P.projeto_codigo)}</div>` : ''}
      ${P.projeto_nome ? `<div class="doc-header-programa">${escH(P.projeto_nome)}</div>` : ''}
      ${P.projeto_localizacao ? `<div class="doc-header-local">${escH(P.projeto_localizacao)}</div>` : ''}
    </div>`
  function rodape(o) {
    const parc = DimaLogos.lista(logos().parceiros, 'claro', { altura: 24, classe: 'doc-footer-logo', cors: true })
    return `<div class="doc-footer">
      ${parc.length ? `<div class="doc-footer-logos">${parc.join('')}</div>` : ''}
      <div class="doc-footer-txt">Impresso por <strong>${escH(o.usuario || 'Usuário')}</strong>${o.perfil ? ' · ' + escH(o.perfil) : ''} · Plataforma DIMA · SEMA/AC${P.projeto_codigo ? ' · ' + escH(P.projeto_codigo) : ''}</div>
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

  // Paginação própria: divide a folha contínua em páginas A4 de verdade, cada uma com cabeçalho, rodapé e
  // "Página X de Y". Não depende do navegador repetir thead/tfoot nem do @page (o Safari do iPhone/iPad não faz
  // nenhum dos dois). Tabela partida repete o cabeçalho de colunas; título de seção não fica sozinho no fim;
  // `break-before: page` abre página nova; bloco que não cabe numa página inteira é reduzido.
  // Sem dependências: é copiada como texto para a janela própria do relatório.
  function paginar(fonte, destino) {
    const doc = fonte.ownerDocument, q = s => fonte.querySelector(s)
    const cab = q('.doc-header'), intro = q('.doc-intro'), rod = q('.doc-footer'), marca = q('.doc-watermark'), corpoFonte = q('.doc-body')
    if (!cab || !corpoFonte) return 0
    const extra = fonte.className.split(/\s+/).filter(c => c && c !== 'doc-wrap').join(' ')
    const fontes = corpoFonte.cloneNode(true)  // a folha contínua fica intacta (troca de orientação refaz daqui)
    destino.innerHTML = ''
    const paginas = []
    let corpo = null, real = false, pilha = []
    const TITULO = el => el.nodeType === 1 && el.matches('h1,h2,h3,h4,h5,h6,.rep-secao-titulo')
    const estilo = el => doc.defaultView.getComputedStyle(el)
    const quebraAntes = el => { const s = estilo(el); return s.breakBefore === 'page' || s.pageBreakBefore === 'always' }
    const evita = el => { const s = estilo(el); return s.breakInside === 'avoid' || s.pageBreakInside === 'avoid' }
    const estoura = () => corpo.scrollHeight > corpo.clientHeight + 1
    const temConteudo = el => !!(el.textContent.trim() || el.querySelector('img,svg,canvas,hr'))
    const vazia = c => c.tagName === 'TABLE' ? !c.querySelector(':scope > tbody > tr, :scope > tfoot > tr')
      : c.tagName === 'TBODY' ? !c.children.length : !temConteudo(c)
    const filhos = el => [...el.childNodes].filter(n => !(el.tagName === 'TABLE' && n.nodeType === 1 && /^(THEAD|COLGROUP|CAPTION)$/.test(n.tagName)))
    function divisivel(el) {
      if (el.nodeType !== 1 || !/^(DIV|SECTION|ARTICLE|MAIN|TABLE|TBODY|UL|OL|DL|FIELDSET)$/.test(el.tagName)) return false
      if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false
      return filhos(el).filter(n => n.nodeType === 1).length > 1 || (el.tagName === 'TABLE' && !!el.querySelector(':scope > tbody > tr + tr'))
    }
    function casca(el) {
      const c = el.cloneNode(false)
      if (el.tagName === 'TABLE') [...el.children].forEach(f => { if (/^(COLGROUP|CAPTION|THEAD)$/.test(f.tagName)) c.appendChild(f.cloneNode(true)) })
      return c
    }
    function novaPagina() {
      const p = doc.createElement('div')
      p.className = 'doc-wrap fa4-pag' + (extra ? ' ' + extra : '')
      if (marca) p.appendChild(marca.cloneNode(true))
      p.appendChild(cab.cloneNode(true))
      if (!paginas.length && intro) p.appendChild(intro.cloneNode(true))
      corpo = doc.createElement('div'); corpo.className = corpoFonte.className + ' fa4-corpo'; p.appendChild(corpo)
      if (rod) { const r = rod.cloneNode(true), n = doc.createElement('div'); n.className = 'fa4-num'; n.textContent = 'Página 0 de 0'; /* já ocupa a linha ao medir */ r.appendChild(n); p.appendChild(r) }
      destino.appendChild(p); paginas.push(p); real = false
    }
    // fecha a página atual e reabre, na nova, o mesmo caminho de blocos (cascas) onde a colocação estava
    function quebrar() {
      const velhas = pilha.map(x => x.casca)
      const limpar = () => { for (let i = velhas.length - 1; i >= 1; i--) if (velhas[i].isConnected && vazia(velhas[i])) velhas[i].remove() }
      limpar()
      let titulo = null, nivel = -1
      for (let i = velhas.length - 1; i >= 0; i--) {
        if (!velhas[i].isConnected) continue
        const u = velhas[i].lastElementChild
        if (u && TITULO(u)) { u.remove(); if (temConteudo(velhas[0])) { titulo = u; nivel = i } else velhas[i].appendChild(u) }
        break
      }
      if (titulo) limpar()
      novaPagina()
      pilha[0].casca = corpo
      for (let i = 1; i < pilha.length; i++) { const c = casca(pilha[i].orig); pilha[i - 1].casca.appendChild(c); pilha[i].casca = c }
      if (titulo) { const alvo = pilha[nivel].casca; alvo.insertBefore(titulo, nivel + 1 < pilha.length ? pilha[nivel + 1].casca : null); real = true }
    }
    function encolher(no) {
      if (no.nodeType !== 1) return
      const r = corpo.clientHeight / corpo.scrollHeight
      if (r < 1) no.style.zoom = String(Math.max(0.3, r * 0.98))
    }
    function por(no) {
      const alvo = () => pilha[pilha.length - 1].casca
      if (no.nodeType === 3 && !no.textContent.trim()) { alvo().appendChild(no); return }
      if (no.nodeType !== 1 && no.nodeType !== 3) return
      alvo().appendChild(no)  // estilo só é lido com o bloco na página (fora do documento vem vazio)
      const el = no.nodeType === 1, quebra = el && real && quebraAntes(no), avoid = el && evita(no)
      if (quebra) { no.remove(); quebrar(); alvo().appendChild(no) }
      if (!estoura()) { real = true; return }
      no.remove()
      const div = divisivel(no)
      if (div && !(real && avoid)) return descer(no)
      if (real) {
        quebrar(); alvo().appendChild(no)
        if (!estoura()) { real = true; return }
        no.remove()
        if (div) return descer(no)
      }
      alvo().appendChild(no); encolher(no); real = true
    }
    function descer(no) {
      const c = casca(no); pilha[pilha.length - 1].casca.appendChild(c)
      pilha.push({ orig: no, casca: c })
      filhos(no).forEach(por)
      pilha.pop()
    }
    novaPagina()
    pilha = [{ orig: fontes, casca: corpo }]
    filhos(fontes).forEach(por)
    const tot = paginas.length
    paginas.forEach((p, i) => { const n = p.querySelector('.fa4-num'); if (n) n.textContent = 'Página ' + (i + 1) + ' de ' + tot })
    return tot
  }

  // @page do A4 sem margem: a margem (10 mm) e o número da página estão dentro de cada página montada por paginar()
  const paginaCss = orient => `@page { size: A4 ${orient === 'landscape' ? 'landscape' : 'portrait'}; margin: 0; }`

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
    pronto.then(() => escreverJa(w, o), () => escreverJa(w, o))
  }
  function escreverJa(w, o) {
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
<div class="fa4-fonte" aria-hidden="true">${html(o)}</div>
<div class="fa4-folhas"></div>
<script>
(function(){
  var ajustar=${ajustar.toString()};
  var aviso=${aviso.toString()};
  var paginaCss=${paginaCss.toString()};
  var paginar=${paginar.toString()};
  var w=document.querySelector('.fa4-fonte .doc-wrap'), folhas=document.querySelector('.fa4-folhas'), orient=${JSON.stringify(orient)};
  var ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  function aplicar(o){ orient=o; w.classList.toggle('doc-paisagem', o==='landscape');
    document.getElementById('fa4-pagina').textContent=paginaCss(o);
    document.querySelectorAll('[data-o]').forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.o===o)); });
    var msg=aviso(ajustar(w), o);
    if(!paginar(w, folhas)) document.body.classList.add('fa4-sem-paginas');
    if(ios&&o==='landscape') msg=(msg?msg+' ':'')+'No iPhone/iPad, escolha também Paisagem nas opções de impressão.';
    document.querySelector('.fa4-aviso').textContent=msg; }
  document.querySelectorAll('[data-o]').forEach(function(b){ b.onclick=function(){ aplicar(b.dataset.o); }; });
  document.querySelector('[data-imprimir]').onclick=function(){ window.print(); };
  function pronto(){ aplicar(orient); ${o.imprimir === false ? '' : 'setTimeout(function(){ window.print(); }, 400);'} }
  // espera as imagens (logos, mapas) e as fontes para medir, paginar e imprimir
  function esperar(){ var imgs=[].slice.call(document.images).filter(function(i){ return !i.complete; });
    if(!imgs.length) return pronto(); var n=imgs.length, f=function(){ if(--n===0) pronto(); };
    imgs.forEach(function(i){ i.addEventListener('load', f); i.addEventListener('error', f); }); setTimeout(function(){ if(n>0){ n=-1; pronto(); } }, 4000); }
  // fontes: em documento escrito por document.write a promessa pode não resolver — no máximo 1,5 s
  var foi=false, uma=function(){ if(!foi){ foi=true; esperar(); } };
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(uma, uma); setTimeout(uma, 1500);
})();
<\/script>
</body></html>`)
    w.document.close()
    w.focus()
  }

  g.FolhaA4 = { projeto: () => P, html, ajustar, aviso, paginar, paginaCss, escopo, janela, escrever, PERFIS, pronto, carregarProjeto }
})(window)
