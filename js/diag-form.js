// ── DIMA · Diagnóstico Socioambiental — formulário renderizado da estrutura ──
//
// O formulário NÃO está no código: é montado a partir de
// diag_questionarios.estrutura (baixada e guardada no aparelho). Mudar texto,
// opção ou salto = nova versão do questionário no banco, sem publicar app.
//
// Quem decide o que aparece é js/diag-regras.js (o mesmo cálculo do banco).
// Este arquivo só desenha e grava. Toda mudança é salva no IndexedDB na hora
// (rascunho contínuo) — ver diag-app.js → salvarFichaAtual().
//
// Re-desenho: escolha (única/múltipla/"Não respondeu") pode mudar saltos, então
// redesenha o bloco. Texto e número não mudam saltos: só gravam, sem redesenhar
// (senão o teclado do celular fecharia a cada letra).

const DiagForm = (function () {
  'use strict'

  const R = window.DiagRegras
  let ctx = null   // { ficha, estrutura, sugestoes, aoMudar(redesenhar), aoIrPara(chave) }

  function h(s) { return esc(s) }

  function iniciar(c) { ctx = c }

  // ── Blocos (telas) da ficha: os do questionário + Fotos ─────────────
  function blocos() {
    return ctx.estrutura.blocos.map(b => ({ id: b.id, titulo: b.titulo, lembrete: b.lembrete, perguntas: b.perguntas }))
      .concat([{ id: '_fotos', titulo: 'Fotos (opcional)', perguntas: [] }])
  }

  function respostasComDerivadas() {
    return R.comDerivadas(ctx.estrutura, ctx.ficha.respostas || {}, ctx.ficha.moradores || [])
  }

  function aplicaveisSet() {
    return new Set(R.aplicaveis(ctx.estrutura, respostasComDerivadas()))
  }

  // ── Render de um bloco ───────────────────────────────────────────────
  function renderBloco(indice, destacarChave) {
    const b = blocos()[indice]
    const apl = aplicaveisSet()
    const der = R.derivar(ctx.ficha.moradores || [])
    let html = '<h2 class="bloco-titulo">' + h(b.titulo) + '</h2>'
    if (b.lembrete) html += '<div class="lembrete">' + h(b.lembrete) + '</div>'
    if (b.id === '_fotos') return html + renderFotos()
    b.perguntas.forEach(p => {
      if (p.coluna_fixa) return
      if (p.tipo === 'tabela') { html += renderMoradores(p); return }
      if (p.destino === 'identificacao') { html += renderIdentificacao(p); return }
      if (!apl.has(p.chave)) return
      html += renderPergunta(p, der, destacarChave === p.chave)
    })
    return html
  }

  // ── Modo pendências: UMA pergunta (ou a tabela da P9) fora do bloco ──
  // Usado pela revisão para ir direto ao que falta, sem passar pelos blocos
  // já respondidos. Mesmo render e mesmos eventos do bloco inteiro.
  function renderPendencia(chave) {
    const bs = blocos()
    const der = R.derivar(ctx.ficha.moradores || [])
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i]
      const p = b.perguntas.find(x => chave === 'moradores' ? x.tipo === 'tabela' : x.chave === chave)
      if (!p) continue
      return '<p class="pend-contexto">Bloco ' + (i + 1) + ' · ' + h(b.titulo) + '</p>' +
        (b.lembrete ? '<div class="lembrete">' + h(b.lembrete) + '</div>' : '') +
        (p.tipo === 'tabela' ? renderMoradores(p) : renderPergunta(p, der, true))
    }
    return ''
  }

  function cabecalhoPergunta(p) {
    return '<div class="p-num">P' + p.n + (p.opcional ? ' · opcional' : '') + '</div>' +
           '<div class="p-texto" id="lbl-' + h(p.chave) + '">' + h(p.texto) + '</div>' +
           (p.ajuda ? '<p class="dica">' + h(p.ajuda) + '</p>' : '')
  }

  function renderPergunta(p, der, destacar) {
    const resp = ctx.ficha.respostas || {}
    const v = resp[p.chave]
    const nr = v === R.NR
    let corpo = ''
    if (p.derivada) {
      const d = der[p.derivada] === 'sim' ? 'Sim' : 'Não'
      return '<div class="pergunta" data-chave="' + h(p.chave) + '">' + cabecalhoPergunta(p) +
             '<div class="derivada" role="status">' + d + ' — calculado pela lista de moradores</div></div>'
    }
    if (p.tipo === 'unica' || p.tipo === 'multipla') {
      const ops = R.opcoesVisiveis(p, der)
      corpo = '<div class="opcoes" role="' + (p.tipo === 'unica' ? 'radiogroup' : 'group') + '" aria-labelledby="lbl-' + h(p.chave) + '">' +
        ops.map(o => {
          const marcado = !nr && (p.tipo === 'unica' ? v === o.v : Array.isArray(v) && v.includes(o.v))
          return '<button type="button" class="opcao' + (o.exclusiva ? ' exclusiva' : '') + '" data-tipo="' + p.tipo +
            '" data-acao="opcao" data-chave="' + h(p.chave) + '" data-v="' + h(o.v) + '" aria-pressed="' + marcado + '"' +
            (p.tipo === 'unica' ? ' role="radio" aria-checked="' + marcado + '"' : '') + '>' +
            '<span class="marca" aria-hidden="true">' + (marcado ? '✓' : '') + '</span><span>' + h(o.r) + '</span></button>'
        }).join('') + '</div>'
      if (!nr && (v === 'outro' || (Array.isArray(v) && v.includes('outro')))) {
        corpo += '<label class="rot" for="outro-' + h(p.chave) + '">Especifique</label>' +
          '<input class="campo" id="outro-' + h(p.chave) + '" data-acao="outro" data-chave="' + h(p.chave) +
          '" maxlength="' + (ctx.estrutura.outro_max_len || 120) + '" value="' + h(resp[p.chave + '_outro'] || '') + '">'
      }
    } else if (p.tipo === 'inteiro' || p.tipo === 'decimal') {
      corpo = '<input class="campo" type="number" data-acao="numero" data-chave="' + h(p.chave) + '"' +
        ' inputmode="' + (p.tipo === 'inteiro' ? 'numeric' : 'decimal') + '"' +
        (p.min !== undefined ? ' min="' + p.min + '"' : '') + (p.max !== undefined ? ' max="' + p.max + '"' : '') +
        (p.tipo === 'decimal' ? ' step="0.1"' : ' step="1"') +
        ' aria-labelledby="lbl-' + h(p.chave) + '" value="' + (typeof v === 'number' ? v : '') + '"' + (nr ? ' disabled' : '') + '>' +
        (p.unidade ? '<p class="dica">em ' + h(p.unidade === 'ha' ? 'hectares (ha)' : p.unidade) + '</p>' : '')
    } else {
      const longo = p.tipo === 'texto_longo'
      corpo = (longo ? '<textarea class="campo"' : '<input class="campo"') +
        ' data-acao="texto" data-chave="' + h(p.chave) + '" aria-labelledby="lbl-' + h(p.chave) + '"' +
        ' maxlength="' + (p.max_len || ctx.estrutura.texto_max_len || 2000) + '"' + (nr ? ' disabled' : '') +
        (longo ? '>' + h(typeof v === 'string' && !nr ? v : '') + '</textarea>'
               : ' value="' + h(typeof v === 'string' && !nr ? v : '') + '">')
      if (p.sugestoes) corpo += renderChips(p.chave, 'resposta')
    }
    return '<div class="pergunta' + (nr ? ' nr' : '') + (destacar ? ' destaque' : '') + '" data-chave="' + h(p.chave) + '" id="perg-' + h(p.chave) + '">' +
      cabecalhoPergunta(p) + corpo +
      '<div class="linha-acoes"><button type="button" class="btn-nr" data-acao="nr" data-chave="' + h(p.chave) +
      '" aria-pressed="' + nr + '">Não respondeu</button></div></div>'
  }

  // sugestões (respostas repetidas de outras fichas + do próprio aparelho): tocar ACRESCENTA
  function renderChips(chave, alvo, indice) {
    const lista = (ctx.sugestoes[chave] || []).slice(0, 12)
    if (!lista.length) return ''
    return '<div class="chips" aria-label="Sugestões">' + lista.map(t =>
      '<button type="button" class="chip" data-acao="sugestao" data-alvo="' + alvo + '" data-chave="' + h(chave) + '"' +
      (indice !== undefined ? ' data-i="' + indice + '"' : '') + ' data-texto="' + h(t) + '">' + h(t) + '</button>').join('') + '</div>'
  }

  // P4 (nome, opcional) + localização: vão para a tabela de identificação
  function renderIdentificacao(p) {
    const f = ctx.ficha
    const gps = f.lat != null
      ? 'Localização registrada (±' + Math.round(f.gps_precisao_m || 0) + ' m)'
      : 'Localização não registrada'
    return '<div class="pergunta" id="perg-' + h(p.chave) + '">' + cabecalhoPergunta(p) +
      '<input class="campo" data-acao="ident" data-campo="entrevistado_nome" maxlength="150" autocomplete="off"' +
      ' aria-labelledby="lbl-' + h(p.chave) + '" value="' + h(f.entrevistado_nome || '') + '"></div>' +
      '<div class="pergunta"><div class="p-texto">Localização da casa</div>' +
      '<p class="dica">' + h(gps) + '. Não é obrigatório.</p>' +
      '<button type="button" class="btn btn-sec" data-acao="gps">📍 Registrar localização agora</button>' +
      '<label class="rot" for="obs-loc">Referência (opcional)</label>' +
      '<input class="campo" id="obs-loc" data-acao="ident" data-campo="obs_localizacao" maxlength="300"' +
      ' placeholder="Ex.: casa azul depois da ponte" value="' + h(f.obs_localizacao || '') + '"></div>'
  }

  // P9 — tabela de moradores. 1ª linha = o entrevistado (decisão de 26/09)
  function renderMoradores(p) {
    const f = ctx.ficha
    const cols = ctx.estrutura.moradores.colunas
    const sexo = cols.find(c => c.chave === 'sexo_genero')
    const ms = f.moradores || []
    let html = '<div class="pergunta" id="perg-moradores"><div class="p-num">P' + p.n + '</div>' +
      '<div class="p-texto">' + h(p.texto) + '</div>' +
      '<p class="dica">A 1ª pessoa é o(a) entrevistado(a). Nome é opcional — pode usar só as iniciais.</p>'
    ms.forEach((m, i) => {
      html += '<div class="morador" data-i="' + i + '"><div class="morador-topo"><span>' +
        (m.e_entrevistado ? 'Entrevistado(a)' : 'Pessoa ' + (i + 1)) + '</span>' +
        (m.e_entrevistado ? '' : '<button type="button" class="btn-icone" data-acao="mor-remover" data-i="' + i + '" aria-label="Remover pessoa ' + (i + 1) + '">✕</button>') +
        '</div>' +
        '<label class="rot">Nome ou iniciais (opcional)</label>' +
        '<input class="campo" data-acao="mor" data-i="' + i + '" data-campo="nome" maxlength="150" autocomplete="off" value="' + h(m.nome || '') + '">' +
        '<div class="grade-2"><div><label class="rot">Idade</label>' +
        '<input class="campo" type="number" inputmode="numeric" min="0" max="120" data-acao="mor" data-i="' + i + '" data-campo="idade" value="' + (m.idade ?? '') + '"></div>' +
        '<div><label class="rot">Sexo/gênero</label><select class="campo" data-acao="mor" data-i="' + i + '" data-campo="sexo_genero">' +
        '<option value="">—</option>' + sexo.opcoes.map(o => '<option value="' + h(o.v) + '"' + (m.sexo_genero === o.v ? ' selected' : '') + '>' + h(o.r) + '</option>').join('') +
        '</select></div></div>' +
        (m.sexo_genero === 'outro'
          ? '<label class="rot">Especifique</label><input class="campo" data-acao="mor" data-i="' + i + '" data-campo="sexo_genero_outro" maxlength="120" value="' + h(m.sexo_genero_outro || '') + '">'
          : '')
      ;['parentesco', 'escolaridade', 'atividade_principal'].forEach(c => {
        const col = cols.find(x => x.chave === c)
        html += '<label class="rot">' + h(col.rotulo) + '</label>'
        if (col.tipo === 'unica') {
          // lista fechada (escolaridade a partir da v2), agrupada por "g"
          const grupos = []
          col.opcoes.forEach(o => {
            const g = grupos.find(x => x.g === (o.g || ''))
            if (g) g.os.push(o); else grupos.push({ g: o.g || '', os: [o] })
          })
          const opt = o => '<option value="' + h(o.v) + '"' + (m[c] === o.v ? ' selected' : '') + '>' + h(o.r) + '</option>'
          html += '<select class="campo" data-acao="mor" data-i="' + i + '" data-campo="' + c + '"><option value="">—</option>' +
            grupos.map(g => g.g ? '<optgroup label="' + h(g.g) + '">' + g.os.map(opt).join('') + '</optgroup>' : g.os.map(opt).join('')).join('') +
            '</select>'
        } else {
          html += '<input class="campo" data-acao="mor" data-i="' + i + '" data-campo="' + c + '" maxlength="80" value="' + h(m[c] || '') + '">' +
            renderChips('moradores.' + c, 'morador', i)
        }
      })
      html += '</div>'
    })
    html += '<button type="button" class="btn btn-sec btn-bloco" data-acao="mor-adicionar">＋ Adicionar pessoa</button></div>'
    return html
  }

  function renderFotos() {
    const n = (ctx.fotos || []).length
    let html = '<div class="faixa faixa-aviso"><b>Nunca fotografe pessoas.</b> Só a casa, a fonte de água, o esgoto, o lixo, a área de produção, o acesso ou o problema ambiental. A família pode recusar.</div>'
    html += '<div class="fotos">' + (ctx.fotos || []).map(ft =>
      '<div class="foto"><img alt="Foto: ' + h(ft.tema) + '" src="' + h(ft._url || '') + '">' +
      '<span class="rot-foto">' + h(ROTULO_TEMA[ft.tema] || ft.tema) + (ft.legenda ? ' · ' + h(ft.legenda) : '') + '</span>' +
      (ft.enviada ? '' : '<button type="button" class="remover" data-acao="foto-remover" data-uuid="' + h(ft.uuid_cliente) + '" aria-label="Remover foto">✕</button>') +
      '</div>').join('') + '</div>'
    if (n < 8) {
      html += '<label class="rot" for="foto-tema">O que vai fotografar?</label><select class="campo" id="foto-tema">' +
        Object.keys(ROTULO_TEMA).map(k => '<option value="' + k + '">' + ROTULO_TEMA[k] + '</option>').join('') + '</select>' +
        '<label class="rot" for="foto-legenda">Legenda (opcional)</label><input class="campo" id="foto-legenda" maxlength="200">' +
        '<label class="btn btn-prim btn-bloco" style="margin-top:12px">📷 Tirar foto<input type="file" accept="image/*" capture="environment" data-acao="foto" hidden></label>'
    } else {
      html += '<p class="dica">Limite de 8 fotos por ficha.</p>'
    }
    return html
  }

  const ROTULO_TEMA = { moradia: 'Moradia', agua: 'Fonte de água', esgoto: 'Esgoto', lixo: 'Lixo',
                        producao: 'Produção', acesso: 'Acesso', ambiental: 'Problema ambiental', outro: 'Outro' }

  // ── Eventos (delegados no container do bloco) ────────────────────────
  function tratarClique(ev) {
    const el = ev.target.closest('[data-acao]')
    if (!el) return
    const f = ctx.ficha
    f.respostas = f.respostas || {}
    const chave = el.dataset.chave
    const perg = chave && R.porChave(ctx.estrutura)[chave]
    switch (el.dataset.acao) {
      case 'opcao': {
        const v = el.dataset.v
        if (perg.tipo === 'unica') {
          f.respostas[chave] = f.respostas[chave] === v ? undefined : v
        } else {
          let atual = Array.isArray(f.respostas[chave]) ? f.respostas[chave].slice() : []
          const excl = (perg.opcoes || []).filter(o => o.exclusiva).map(o => o.v)
          if (atual.includes(v)) atual = atual.filter(x => x !== v)
          else if (excl.includes(v)) atual = [v]                       // exclusiva desmarca as outras
          else atual = atual.filter(x => !excl.includes(x)).concat(v)  // e vice-versa
          f.respostas[chave] = atual.length ? atual : undefined
        }
        if (f.respostas[chave] === undefined) delete f.respostas[chave]
        const vv = f.respostas[chave]
        if (!(vv === 'outro' || (Array.isArray(vv) && vv.includes('outro')))) delete f.respostas[chave + '_outro']
        sincronizarEntrevistado()
        ctx.aoMudar(true)
        break
      }
      case 'nr':
        if (f.respostas[chave] === R.NR) delete f.respostas[chave]
        else { f.respostas[chave] = R.NR; delete f.respostas[chave + '_outro'] }
        ctx.aoMudar(true)
        break
      case 'sugestao': {
        const t = el.dataset.texto
        if (el.dataset.alvo === 'morador') {
          const m = f.moradores[+el.dataset.i]
          const campo = chave.replace('moradores.', '')
          m[campo] = t
        } else {
          const atual = typeof f.respostas[chave] === 'string' && f.respostas[chave] !== R.NR ? f.respostas[chave].trim() : ''
          f.respostas[chave] = atual ? (atual.includes(t) ? atual : atual + ', ' + t) : t
        }
        ctx.aoMudar(true)
        break
      }
      case 'mor-adicionar':
        f.moradores = f.moradores || []
        f.moradores.push({ ordem: f.moradores.length + 1, nome: '', idade: null, sexo_genero: null, e_entrevistado: false })
        ctx.aoMudar(true)
        break
      case 'mor-remover':
        f.moradores.splice(+el.dataset.i, 1)
        f.moradores.forEach((m, i) => { m.ordem = i + 1 })
        ctx.aoMudar(true)
        break
      case 'gps':
        ctx.aoPedirGps()
        break
      case 'foto-remover':
        ctx.aoRemoverFoto(el.dataset.uuid)
        break
    }
  }

  function tratarEntrada(ev) {
    const el = ev.target
    const f = ctx.ficha
    f.respostas = f.respostas || {}
    const chave = el.dataset.chave
    switch (el.dataset.acao) {
      case 'texto':
        if (el.value === '') delete f.respostas[chave]; else f.respostas[chave] = el.value
        ctx.aoMudar(false)
        break
      case 'numero': {
        const n = el.value === '' ? null : Number(el.value)
        if (n === null || !isFinite(n)) delete f.respostas[chave]; else f.respostas[chave] = n
        sincronizarEntrevistado()
        ctx.aoMudar(false)
        break
      }
      case 'outro':
        if (el.value === '') delete f.respostas[chave + '_outro']; else f.respostas[chave + '_outro'] = el.value
        ctx.aoMudar(false)
        break
      case 'ident':
        f[el.dataset.campo] = el.value
        ctx.aoMudar(false)
        break
      case 'mor': {
        const m = f.moradores[+el.dataset.i]
        const c = el.dataset.campo
        if (c === 'idade') m.idade = el.value === '' ? null : Math.round(Number(el.value))
        else m[c] = el.value === '' ? null : el.value
        if (c === 'sexo_genero' && m.sexo_genero !== 'outro') m.sexo_genero_outro = null
        // select muda o layout (campo "especifique"); texto não
        ctx.aoMudar(el.tagName === 'SELECT')
        break
      }
    }
  }

  function tratarArquivo(ev) {
    const el = ev.target
    if (el.dataset.acao !== 'foto' || !el.files || !el.files[0]) return
    const tema = document.getElementById('foto-tema').value
    const legenda = document.getElementById('foto-legenda').value
    ctx.aoFoto(el.files[0], tema, legenda)
    el.value = ''
  }

  // 1ª linha da P9 acompanha idade/sexo da P5/P6 (o entrevistado não é digitado duas vezes)
  function sincronizarEntrevistado() {
    const f = ctx.ficha
    f.moradores = f.moradores || []
    let m = f.moradores.find(x => x.e_entrevistado)
    if (!m) {
      m = { ordem: 1, nome: f.entrevistado_nome || '', idade: null, sexo_genero: null, e_entrevistado: true }
      f.moradores.unshift(m)
      f.moradores.forEach((x, i) => { x.ordem = i + 1 })
    }
    const r = f.respostas || {}
    if (typeof r.idade === 'number') m.idade = r.idade
    if (typeof r.sexo_genero === 'string' && r.sexo_genero !== R.NR) {
      m.sexo_genero = r.sexo_genero
      m.sexo_genero_outro = r.sexo_genero === 'outro' ? (r.sexo_genero_outro || null) : null
    }
  }

  return { iniciar, blocos, renderBloco, renderPendencia, tratarClique, tratarEntrada, tratarArquivo, sincronizarEntrevistado, ROTULO_TEMA }
})()
