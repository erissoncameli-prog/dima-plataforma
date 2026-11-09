/*!
 * Plataforma Inteligente de Gestão de Projetos
 * © 2025–2026 Erisson Cameli Santiago. Todos os direitos reservados.
 * Ver LICENSE e NOTICE na raiz do repositório.
 */
// Questionário do Diagnóstico Socioambiental em PDF (documentação do instrumento), na Folha A4 padrão.
// Botão "PDF" na tabela "Versões do questionário" (Visão geral da mesa, só quem gere).
// Lê a versão escolhida de diag_questionarios.estrutura — nada de texto fixo: versão nova sai sozinha.
// Folha em branco (sem ficha, sem dado pessoal). Rascunho sai marcado como "não publicada".
async function dgQuestionarioPdf(codigo, versao) {
  const w = FolhaA4.janela()  // antes de qualquer await (pop-up)
  if (!w) return
  const falhar = msg => { try { w.close() } catch (e) {} toast(msg, 'error') }
  const [q, com] = await Promise.all([
    db.from('diag_questionarios').select('codigo,versao,status,publicado_em,hash_sha256,estrutura')
      .eq('codigo', codigo).eq('versao', versao).maybeSingle(),
    db.from('diag_comunidades').select('nome').eq('ativo', true).order('nome'),
  ])
  if (q.error || !q.data) return falhar('Não foi possível ler o questionário: ' + (q.error?.message || 'versão não encontrada'))
  const E = q.data.estrutura || {}
  if (!Array.isArray(E.blocos)) return falhar('Esta versão do questionário não tem blocos.')
  const vistos = new Set()
  const META = {
    hash: q.data.hash_sha256 || '',
    publicado_em: q.data.publicado_em,
    publicado: q.data.status === 'publicado' || q.data.status === 'arquivado',
    status: q.data.status,
    // mesma APA cadastrada duas vezes (maiúscula/acento) aparece uma vez só
    comunidades: (com.data || []).map(c => c.nome).filter(n => { const k = String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); if (vistos.has(k)) return false; vistos.add(k); return true }),
  }
  E.codigo = E.codigo || q.data.codigo; E.versao = E.versao || q.data.versao
  E.blocos = E.blocos.map(b => ({ ...b, perguntas: b.perguntas || [] }))
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const num = p => p.rotulo || String(p.n)

  // chave → pergunta (para escrever as condições de salto)
  const porChave = {}
  E.blocos.forEach(b => b.perguntas.forEach(p => { porChave[p.chave] = p }))
  const rot = (chave, v) => { const p = porChave[chave]; const o = p && (p.opcoes || []).find(x => x.v === v); return o ? o.r : v }
  const ref = chave => { const p = porChave[chave]; return p ? 'P' + num(p) : chave }
  const lista = arr => arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' nem ' + arr[arr.length - 1]

  function condicao(m) {
    const regras = m.todas || [m]
    const grupos = []
    regras.forEach(r => {
      let g = grupos.find(x => x.se === r.se && x.op === r.op)
      if (!g) { g = { se: r.se, op: r.op, vals: [] }; grupos.push(g) }
      g.vals.push(r.valor)
    })
    return grupos.map(g => {
      const vs = g.vals.map(v => '“' + esc(rot(g.se, v)) + '”')
      const q = '<b>' + esc(ref(g.se)) + '</b>'
      if (g.op === '!=') return `a resposta da ${q} não for ${lista(vs)}`
      if (g.op === 'nao_contem') return `na ${q} não tiver sido marcado ${lista(vs)}`
      if (g.op === '=') return `a resposta da ${q} for ${vs.join(' ou ')}`
      if (g.op === 'contem') return `na ${q} tiver sido marcado ${vs.join(' ou ')}`
      return `${q} ${esc(g.op)} ${vs.join(', ')}`
    }).join(' e ')
  }

  function colunas(ops) {
    const m = Math.max(...ops.map(o => (o.r || '').length + (o.especificar ? 14 : 0) + (o.exclusiva ? 10 : 0)))
    return m <= 20 ? 3 : m <= 40 ? 2 : 1
  }
  function opcoes(p) {
    const ops = p.opcoes || []
    const mk = p.tipo === 'multipla' ? 'mk-q' : 'mk-c'
    return `<div class="ops c${colunas(ops)}">` + ops.map(o => `<div class="op"><span class="mk ${mk}"></span><span>${esc(o.r)}${o.especificar ? ' <span class="esp">— qual?</span><span class="linha-in"></span>' : ''}${o.exclusiva ? ' <span class="exc">(não marcar com outras)</span>' : ''}</span></div>`).join('') + '</div>'
  }

  function tabelaMoradores() {
    const M = E.moradores || {}, cols = M.colunas || []
    const linhas = Array.from({ length: 12 }, (_, i) => `<tr><td class="mono">${i + 1}</td>${cols.map(c => `<td>${i === 0 && c.chave === 'parentesco' && M.primeira_linha === 'entrevistado' ? '<span class="pre">Entrevistado(a)</span>' : ''}</td>`).join('')}</tr>`).join('')
    const legenda = cols.filter(c => c.opcoes).map(c => {
      let atual = null, i = 0
      const itens = c.opcoes.map(o => {
        i++
        const g = o.g && o.g !== atual ? (atual = o.g, `<div class="leg-g">${esc(o.g)}</div>`) : ''
        return g + `<div class="leg-i"><span class="mono">${i}</span> ${esc(o.r)}${o.especificar ? ' (especificar)' : ''}</div>`
      }).join('')
      return `<div class="leg"><div class="leg-t">Códigos — ${esc(c.rotulo)}</div><div class="leg-l${c.opcoes.length > 8 ? ' leg-2' : ''}">${itens}</div></div>`
    }).join('')
    return `<table class="rep-tbl mor"><thead><tr><th class="c-min">Nº</th>${cols.map(c => `<th>${esc(c.rotulo)}${c.opcoes ? ' (código)' : c.tipo === 'inteiro' ? ' (anos)' : ''}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table>
      <div class="nota">Uma linha por pessoa que mora no domicílio, <b>sem nome</b>. A 1ª linha é a pessoa entrevistada. Acrescente folhas se houver mais de 12 moradores.</div>
      <div class="legs">${legenda}</div>`
  }

  function resposta(p) {
    switch (p.tipo) {
      case 'unica': case 'multipla': return opcoes(p)
      case 'texto_longo': return '<div class="linhas"><span></span><span></span><span></span><span></span></div>'
      case 'texto': return '<div class="linhas"><span></span></div>'
      case 'data': return '<div class="campo">Data: <span class="cx">__ / __ / ____</span> &nbsp; Hora de início: <span class="cx">__ : __</span></div>'
      case 'inteiro': return `<div class="campo"><span class="cx cx-n"></span> ${p.chave === 'idade' ? 'anos' : ''}${p.min != null ? ` <span class="esp">(de ${p.min} a ${p.max})</span>` : ''}</div>`
      case 'decimal': return '<div class="campo"><span class="cx cx-n cx-l"></span> <span class="esp">(número, na unidade marcada acima)</span></div>'
      case 'tabela': return tabelaMoradores()
      case 'catalogo': {
        if (p.catalogo === 'comunidades' && META.comunidades.length) return `<div class="ops c2">${META.comunidades.map(n => `<div class="op"><span class="mk mk-c"></span><span>${esc(n)}</span></div>`).join('')}</div>`
        return '<div class="linhas"><span></span></div>'
      }
      default: return '<div class="linhas"><span></span></div>'
    }
  }

  function tags(p) {
    const t = []
    if (p.tipo === 'unica' && !p.derivada) t.push(['Marque uma opção', ''])
    if (p.tipo === 'multipla') t.push([p.max_marcar ? `Marque até ${p.max_marcar}` : 'Marque todas que se aplicam', p.max_marcar ? 't-ate' : ''])
    if (p.tipo === 'texto_longo') t.push(['Resposta aberta', ''])
    if (p.tipo === 'catalogo') t.push([p.catalogo === 'comunidades' ? 'Lista do cadastro' : 'Escrever', ''])
    if (p.derivada) t.push(['Calculada pelo app a partir da P7', 't-calc'])
    if (p.sensivel) t.push(['Dado sensível', 't-sens'])
    if (p.opcional) t.push(['Opcional', ''])
    if (p.destino === 'identificacao') t.push(['Identificação — guardada à parte', 't-ident'])
    if (p.leitura && E.leituras?.[p.leitura]) t.push(['Leitura: ' + E.leituras[p.leitura].titulo, 't-leit'])
    return t.length ? `<div class="tags">${t.map(([x, c]) => `<span class="tag ${c}">${esc(x)}</span>`).join('')}</div>` : ''
  }

  function pergunta(p) {
    const n = num(p)
    return `<div class="q${p.tipo === 'tabela' ? ' q-tab' : ''}">
      <div class="q-cab"><span class="q-n">${p.rotulo === 'Obs.' ? 'Obs.' : 'P' + esc(n)}</span><div class="q-txt">${esc(p.texto)}${tags(p)}</div></div>
      ${p.mostrar_se ? `<div class="cond">↳ Só perguntar se ${condicao(p.mostrar_se)}.</div>` : ''}
      ${p.ajuda ? `<div class="ajuda"><b>Orientação:</b> ${esc(p.ajuda)}</div>` : ''}
      ${p.derivada ? '<div class="ajuda"><b>No papel:</b> marque o maior nível de escolaridade registrado na lista de moradores (P7).</div>' : ''}
      <div class="resp">${resposta(p)}</div>
    </div>`
  }

  // ── Corpo ──
  const blocos = E.blocos
  const todas = blocos.flatMap(b => b.perguntas)
  const nums = todas.filter(p => p.n > 0 && p.rotulo !== 'Obs.').map(p => p.n)
  const faixa = b => { const ns = b.perguntas.filter(p => p.n > 0 && p.rotulo !== 'Obs.').map(p => p.n); const obs = b.perguntas.some(p => p.rotulo === 'Obs.'); return !ns.length && obs ? 'Obs.' : ns.length ? `P${Math.min(...ns)}${Math.max(...ns) !== Math.min(...ns) ? '–P' + Math.max(...ns) : ''}${obs ? ' + Obs.' : ''}` : b.perguntas.map(p => num(p)).join(', ') }
  const dataPub = META.publicado_em ? new Date(META.publicado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Rio_Branco' }) : ''
  const situacao = META.publicado ? `publicada em ${dataPub}` : 'rascunho — não publicada'

  let corpo = `<div class="rep-secao">
    <div class="rep-secao-titulo">Identificação do instrumento</div>
    <div class="rep-stats rep-stats-4">
      <div class="rep-stat"><div class="rep-stat-lbl">Versão</div><div class="rep-stat-val">${esc(E.codigo)} v${E.versao}</div><div class="rep-stat-sub">${esc(situacao)}</div></div>
      <div class="rep-stat"><div class="rep-stat-lbl">Blocos</div><div class="rep-stat-val">${blocos.length}</div><div class="rep-stat-sub">temas da entrevista</div></div>
      <div class="rep-stat"><div class="rep-stat-lbl">Perguntas</div><div class="rep-stat-val">${Math.max(...nums)}</div><div class="rep-stat-sub">P1 a P${Math.max(...nums)} + seção 0</div></div>
      <div class="rep-stat"><div class="rep-stat-lbl">Itens de resposta</div><div class="rep-stat-val">${todas.length}</div><div class="rep-stat-sub">${todas.filter(p => p.mostrar_se).length} com condição de salto</div></div>
    </div>
    <div class="ident">
      <div><span class="rep-det-lbl">Instrumento</span>${esc(E.titulo)} — questionário socioeconômico e ambiental aplicado às famílias das APAs</div>
      <div><span class="rep-det-lbl">Situação</span>${META.publicado ? `Versão ${META.status === 'arquivado' ? 'arquivada' : 'publicada'} e imutável (correção somente por nova versão)` : 'Rascunho: pode mudar até a publicação; não é a versão aplicada em campo'}</div>
      <div><span class="rep-det-lbl">SHA-256</span><span class="mono hash">${esc(META.hash || '— (gerado na publicação)')}</span></div>
      <div class="nota">Documento gerado a partir da estrutura publicada na plataforma (questionário guardado como dado). O hash SHA-256 identifica exatamente a versão aplicada pelo app de campo. Antes da seção 0, o app apresenta o aviso de participação e pede, em separado, as autorizações de fotos e de gravação de áudio — esses textos não fazem parte desta estrutura.</div>
    </div>
  </div>
  <div class="rep-secao">
    <div class="rep-secao-titulo">Como ler este questionário</div>
    <div class="legenda">
      <div><span class="mk mk-c"></span> marque <b>uma</b> opção</div>
      <div><span class="mk mk-q"></span> marque <b>uma ou mais</b> opções (respeitando o limite, quando houver)</div>
      <div><span class="cond-ex">↳ Só perguntar se…</span> pergunta com salto: só é feita quando a condição vale</div>
      <div><span class="tag t-sens">Dado sensível</span> tratamento reforçado (LGPD); a pessoa pode não responder</div>
      <div><span class="tag t-ident">Identificação</span> guardada separada das respostas; não sai nas planilhas</div>
      <div class="nota">Em qualquer pergunta a pessoa pode não responder: o app registra “Não respondeu” e essa resposta fica fora dos indicadores.</div>
    </div>
  </div>
  <div class="rep-secao">
    <div class="rep-secao-titulo">Blocos do questionário</div>
    <table class="rep-tbl"><thead><tr><th class="c-min">Bloco</th><th>Tema</th><th class="c-min">Perguntas</th><th class="c-min">Itens</th></tr></thead><tbody>
    ${blocos.map((b, i) => `<tr><td class="mono">${i}</td><td>${esc(b.titulo)}</td><td class="mono">${faixa(b)}</td><td class="mono">${b.perguntas.length}</td></tr>`).join('')}
    </tbody></table>
  </div>`

  blocos.forEach((b, i) => {
    const leitura = b.perguntas.find(p => p.leitura)
    const L = leitura && E.leituras?.[leitura.leitura]
    corpo += `<div class="bloco">
      <div class="rep-secao-titulo bloco-t"><span class="bl-n">${i}</span>${esc(b.titulo)}</div>
      ${b.lembrete ? `<div class="lembrete"><b>Para o entrevistador:</b> ${esc(b.lembrete)}</div>` : ''}
      ${L ? `<div class="leitura"><div class="leitura-t">${esc(L.titulo)} — texto para ler ao entrevistado</div>${L.texto.split(/\n\n+/).map(x => `<p>${esc(x)}</p>`).join('')}</div>` : ''}
      ${b.perguntas.map(pergunta).join('')}
    </div>`
  })

  const css = `
  .mono { font-family: var(--font-mono); }
  .hash { font-size: 9.5px; word-break: break-all; }
  .ident { display: grid; gap: 4px; font-size: 10.5px; color: var(--cinza-700); }
  .nota { font-size: 9.5px; color: var(--cinza-500); margin-top: 4px; line-height: 1.5; }
  .legenda { display: grid; gap: 5px; font-size: 10.5px; color: var(--cinza-700); }
  .cond-ex { font-size: 9.5px; color: #8A5A00; font-weight: 700; }
  .mk { display: inline-block; width: 10px; height: 10px; border: 1.3px solid #374151; flex: none; margin-top: 2px; vertical-align: -1px; background: #fff; }
  .mk-c { border-radius: 50%; }
  .mk-q { border-radius: 2px; }
  .bloco-t { margin-top: 6px; break-after: avoid; }
  .bl-n { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 4px; background: #1F4E2C; color: #fff; font-size: 10px; margin-right: 4px; }
  .lembrete { font-size: 10px; background: #FFFBEB; border: 1px solid #F3D9A4; border-left: 3px solid #D97706; border-radius: 4px; padding: 6px 9px; margin-bottom: 8px; color: #6B4A00; }
  .leitura { font-size: 10px; background: #F0F7F2; border: 1px solid #C8E6D0; border-left: 3px solid #2D6A4F; border-radius: 4px; padding: 7px 10px; margin-bottom: 8px; color: var(--cinza-700); break-inside: avoid; }
  .leitura p { margin: 3px 0; }
  .leitura-t { font-weight: 700; color: #1F4E2C; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
  .q { break-inside: avoid; padding: 7px 0 8px; border-bottom: 1px solid #E5E7EB; }
  .q-tab { break-inside: auto; }
  .q-cab { display: flex; gap: 8px; align-items: flex-start; }
  .q-n { flex: none; min-width: 38px; font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: #1F4E2C; background: #D8F3DC; border-radius: 3px; padding: 1px 5px; text-align: center; margin-top: 1px; }
  .q-txt { font-size: 11.5px; font-weight: 600; color: var(--cinza-900); line-height: 1.4; min-width: 0; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
  .tag { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 1px 6px; border-radius: 99px; background: #F3F4F6; color: #4B5563; border: 1px solid #E5E7EB; white-space: nowrap; }
  .t-ate { background: #EFF6FF; color: #1F5FBF; border-color: #BFDBFE; }
  .t-sens { background: #FEF2F2; color: #B42318; border-color: #FECACA; }
  .t-ident { background: #F5F3FF; color: #6D28D9; border-color: #DDD6FE; }
  .t-calc { background: #ECFEFF; color: #0E7490; border-color: #A5F3FC; }
  .t-leit { background: #F0F7F2; color: #1F4E2C; border-color: #C8E6D0; }
  .cond { font-size: 9.5px; color: #8A5A00; margin: 3px 0 0 46px; }
  .ajuda { font-size: 9.5px; color: var(--cinza-600); font-style: italic; margin: 3px 0 0 46px; }
  .resp { margin: 5px 0 0 46px; }
  .ops { display: grid; gap: 3px 14px; font-size: 10.5px; color: var(--cinza-700); }
  .ops.c1 { grid-template-columns: 1fr; }
  .ops.c2 { grid-template-columns: 1fr 1fr; }
  .ops.c3 { grid-template-columns: 1fr 1fr 1fr; }
  .op { display: flex; gap: 6px; align-items: flex-start; min-width: 0; }
  .esp { color: var(--cinza-500); font-size: 9.5px; }
  .exc { color: var(--cinza-500); font-size: 8.5px; font-style: italic; }
  .linha-in { display: inline-block; width: 90px; border-bottom: 1px solid #9CA3AF; margin-left: 4px; vertical-align: -2px; }
  .linhas { display: grid; gap: 0; }
  .linhas span { display: block; height: 20px; border-bottom: 1px solid #9CA3AF; }
  .campo { font-size: 10.5px; color: var(--cinza-700); display: flex; align-items: center; gap: 6px; }
  .cx { font-family: var(--font-mono); letter-spacing: .05em; }
  .cx-n { display: inline-block; width: 56px; height: 18px; border: 1px solid #9CA3AF; border-radius: 2px; }
  .cx-l { width: 110px; }
  .mor { margin-bottom: 6px; }
  .mor td { height: 21px; padding: 2px 6px; }
  .mor tbody tr:nth-child(even) td { background: #fff; }
  .mor td { border: 1px solid #D1D5DB; }
  .pre { font-size: 9px; color: var(--cinza-500); font-style: italic; }
  .legs { display: grid; grid-template-columns: 1fr 2.2fr; gap: 14px; margin-top: 6px; break-inside: avoid; }
  .leg-t { font-size: 8.5px; font-weight: 700; color: var(--cinza-500); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 3px; }
  .leg-l { font-size: 9.5px; color: var(--cinza-700); display: grid; gap: 1px; }
  .leg-2 { grid-template-columns: 1fr 1fr; column-gap: 12px; }
  .leg-g { grid-column: 1 / -1; font-size: 8.5px; font-weight: 700; color: #1F4E2C; margin-top: 3px; }
  .leg-i .mono { display: inline-block; min-width: 16px; font-weight: 700; color: #1F4E2C; }
  `

  FolhaA4.escrever(w, {
    titulo: 'Questionário Socioeconômico — Diagnóstico Socioambiental',
    selo: 'Diagnóstico',
    tema: 'atividades',
    periodo: `Versão ${E.versao} (${E.codigo}) · ${situacao}`,
    corpo, css,
    nomeArquivo: 'Questionario_Diagnostico_Socioambiental_v' + E.versao,
  })
}
