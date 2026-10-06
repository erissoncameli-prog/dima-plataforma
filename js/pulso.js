// ═══════════════════════════════════════════════════════════════════════
// pulso.js — Pulso da Equipe: gestão (super_admin / coordenação)
// ═══════════════════════════════════════════════════════════════════════
// Cria ciclos, projeta o QR em tela cheia com contador ao vivo e desenha o
// resultado AGREGADO que o banco devolve (fn_pulso_resultado). A tela não
// calcula índice nem decide supressão: < 5 respostas o banco não devolve
// nada além da contagem. Nenhuma leitura direta das tabelas pulso_*.
// Respostas: pages/pulso-responder.html?c=<token> (pública, aberta pelo QR).
// Visual: design system da mesa do Diagnóstico (body.dgm, tema 'diag_tema')
// + componentes em css/pulso.css. Ícones SVG via pIc(nome) — sem emoji.
// ═══════════════════════════════════════════════════════════════════════

const PU_IC = {
  mais: '<path d="M12 5v14M5 12h14"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  parar: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  reabrir: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  tarefa: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  pessoas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  pulso: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  barras: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  aspas: '<path d="M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6"/>',
  roteiro: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  seta_baixo: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  divide: '<path d="M16 3h5v5M8 3H3v5M21 3l-7 7M3 3l7 7M12 22v-8"/>',
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
}
function pIc(n) { return '<svg class="pu-ic" viewBox="0 0 24 24" aria-hidden="true">' + (PU_IC[n] || '') + '</svg>' }

;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { window.location.href = '../index.html'; return }
  if (!['super_admin', 'coordenacao'].includes(appState.perfil)) { window.location.href = 'dashboard.html'; return }

  document.getElementById('app').innerHTML =
    gerarLayout('Pulso da Equipe', 'pulso') +
    '<div class="fade-in pu">' +
      '<div class="pu-cab"><div><div class="pu-eyebrow">Engajamento</div><h2>Pulso da Equipe</h2>' +
      '<p>6 perguntas objetivas e 1 livre, abertas por QR Code. Mede <b>comprometimento</b> (o nível) e <b>sintonia</b> (o quanto a equipe enxerga o projeto do mesmo jeito). ' +
      'Anônimo: cadastrados contam no grupo do perfil, os demais como convidados. Nada aparece com menos de 5 respostas.</p></div>' +
      '<button class="btn btn-primary" onclick="PU.novo()">' + pIc('mais') + 'Novo ciclo</button></div>' +
      '<div class="pu-lay"><nav class="pu-lista" id="pu-lista" aria-label="Ciclos">' + esqueleto(3, 64) + '</nav>' +
      '<section id="pu-det" aria-live="polite">' + esqueleto(1, 120) + esqueleto(1, 280) + '</section></div>' +
    '</div>' + '</div></div></div>'
  carregarLogosSidebar()
  seletorTema()

  const S = { ciclos: [], sel: null, res: null, timer: null, ultimoN: null }
  const fmt = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
  const sinal = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  const urlResposta = c => new URL('pulso-responder.html?c=' + encodeURIComponent(c.token), location.href).href
  const dataBR = s => s ? new Date(s).toLocaleDateString('pt-BR') : ''

  function esqueleto(n, h) { return Array.from({ length: n }, () => '<div class="pu-esq" style="height:' + h + 'px;margin-bottom:10px"></div>').join('') }

  // Tema claro/escuro: mesmo 'diag_tema' da mesa do Diagnóstico (componente .dgm-tema).
  function seletorTema() {
    const tb = document.querySelector('.topbar'); if (!tb || tb.querySelector('.dgm-tema')) return
    const d = document.createElement('div')
    d.className = 'dgm-tema pu-tema-wrap'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Tema')
    d.innerHTML = [['claro', 'sol', 'Claro'], ['escuro', 'lua', 'Escuro']].map(([t, ic, r]) =>
      '<button type="button" data-tema="' + t + '" aria-pressed="' + (DiagTema.atual() === t) + '">' + pIc(ic) + r + '</button>').join('')
    const bc = tb.querySelector('.topbar-breadcrumb')
    if (bc) bc.parentNode.insertBefore(d, bc); else tb.appendChild(d)
    d.addEventListener('click', ev => {
      const b = ev.target.closest('[data-tema]'); if (!b) return
      DiagTema.definir(b.dataset.tema)
      d.querySelectorAll('[data-tema]').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
    })
  }

  async function carregarLista(manterSel) {
    const { data, error } = await db.rpc('fn_pulso_ciclos')
    const el = document.getElementById('pu-lista')
    if (error) { el.innerHTML = '<p class="pu-erro">' + esc(pulsoErro(error)) + '</p>'; document.getElementById('pu-det').innerHTML = ''; return }
    S.ciclos = data || []
    if (!S.ciclos.length) {
      el.innerHTML = ''
      document.getElementById('pu-det').innerHTML = '<div class="pu-anim">' +
        '<div class="pu-box pu-vazio">' + pIc('pulso') + '<b>Nenhum ciclo ainda</b>Crie o primeiro e projete o QR Code na próxima reunião de equipe.' +
        '<div style="margin-top:14px"><button class="btn btn-primary" onclick="PU.novo()">' + pIc('mais') + 'Criar o primeiro ciclo</button></div></div>' +
        guiaHTML() + '</div>'
      return
    }
    if (!manterSel || !S.ciclos.find(c => c.id === S.sel)) S.sel = S.ciclos[0].id
    el.innerHTML = '<div class="pu-lista-tit">Ciclos</div>' + S.ciclos.map(c =>
      '<button type="button" class="pu-ci" data-id="' + c.id + '" aria-current="' + (c.id === S.sel) + '" onclick="PU.abrir(\'' + c.id + '\')">' +
      '<span class="pu-ci-l1"><b>' + esc(c.titulo) + '</b>' + selo(c) + '</span>' +
      '<span class="pu-ci-meta"><span>' + pIc('calendario') + dataBR(c.criado_em) + '</span>' +
      '<span>' + pIc('pessoas') + c.n_respostas + '</span>' +
      (c.indices ? '<span title="Comprometimento · Sintonia">' + pIc('barras') + c.indices.comprometimento + ' · ' + c.indices.sintonia + '</span>' : '') +
      '</span></button>').join('') + historicoHTML()
    await abrir(S.sel)
  }

  function selo(c) { return c.aberto ? '<span class="pu-st ab">Aberto</span>' : '<span class="pu-st en">Encerrado</span>' }

  // Série histórica: só ciclos com índice (≥ 5 respostas), do mais antigo ao mais novo.
  function historicoHTML() {
    const h = S.ciclos.filter(c => c.indices).slice().reverse()
    if (h.length < 2) return ''
    return '<div class="pu-box pu-hist" style="margin-top:8px;padding:14px"><h3 style="font-size:13px;margin-bottom:8px">' + pIc('barras') + 'Evolução</h3>' +
      '<div class="pu-tabw"><table class="pu-tab"><thead><tr><th>Ciclo</th><th class="n" title="Comprometimento">Compr.</th><th class="n">Sint.</th><th class="n">eNPS</th></tr></thead><tbody>' +
      h.map(c => '<tr><td style="white-space:normal">' + esc(c.titulo) + '</td><td class="n">' + c.indices.comprometimento + '</td><td class="n">' + c.indices.sintonia + '</td><td class="n">' + sinal(c.indices.enps) + '</td></tr>').join('') +
      '</tbody></table></div></div>'
  }

  async function abrir(id) {
    S.sel = id
    document.querySelectorAll('.pu-ci').forEach(b => b.setAttribute('aria-current', String(b.dataset.id === id)))
    const det = document.getElementById('pu-det')
    det.innerHTML = esqueleto(1, 120) + esqueleto(1, 280)
    const { data, error } = await db.rpc('fn_pulso_resultado', { p_ciclo: id })
    if (error) { det.innerHTML = '<p class="pu-erro">' + esc(pulsoErro(error)) + '</p>'; return }
    S.res = data
    det.innerHTML = '<div class="pu-anim">' + detalheHTML(S.ciclos.find(c => c.id === id), data) + '</div>'
  }

  // ── Detalhe do ciclo ────────────────────────────────────────────────
  function detalheHTML(c, r) {
    const p = r.participacao || {}
    const pct = p.usuarios_ativos ? Math.round((p.cadastrados || 0) / p.usuarios_ativos * 100) : null
    const cab = '<div class="pu-box"><div class="pu-hdr"><div><h3>' + esc(c.titulo) + selo(c) + '</h3>' +
      '<p>Criado em ' + dataBR(c.criado_em) + (c.fecha_em ? ' · fecha em ' + new Date(c.fecha_em).toLocaleString('pt-BR') : '') +
      ' · convidados: ' + (c.aceita_convidados ? (c.limite_convidados ? 'até ' + c.limite_convidados : 'sem limite') : 'não aceita') + '</p></div></div>' +
      '<div class="pu-acoes">' +
        (c.aberto ? '<button class="btn btn-primary btn-sm" onclick="PU.qr()">' + pIc('qr') + 'Projetar QR Code</button>' : '') +
        '<button class="btn btn-secondary btn-sm" onclick="PU.copiar()">' + pIc('link') + 'Copiar link</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="PU.espelho()">' + pIc('alvo') + (r.espelho?.meu ? 'Rever minha expectativa' : 'Minha expectativa') + '</button>' +
        (c.aberto
          ? '<button class="btn btn-ghost btn-sm" onclick="PU.status(\'encerrado\')">' + pIc('parar') + 'Encerrar</button>'
          : '<button class="btn btn-ghost btn-sm" onclick="PU.status(\'aberto\')">' + pIc('reabrir') + 'Reabrir</button>') +
      '</div></div>'

    if (r.suprimido) {
      return cab +
        '<div class="pu-sup" role="status">' + pIc('escudo') + '<div><b>' + r.n + ' de ' + r.minimo + ' respostas mínimas</b>' +
        '<div class="pu-sup-barra"><i style="width:' + Math.min(100, r.n / r.minimo * 100) + '%"></i></div>' +
        'O resultado aparece a partir de ' + r.minimo + ' respostas, para proteger o anonimato. ' +
        'Cadastrados: ' + (p.cadastrados || 0) + (pct != null ? ' de ' + p.usuarios_ativos + ' (' + pct + '%)' : '') + ' · convidados: ' + (p.convidados || 0) + '.</div></div>' +
        (!r.espelho?.meu ? '<div class="pu-dica">' + pIc('info') + '<div><b>Dica de coach:</b> antes de ver o resultado, registre a média que você <b>espera</b> da equipe em cada pergunta ("Minha expectativa"). A diferença entre expectativa e realidade é um dos melhores assuntos da devolutiva.</div></div>' : '')
    }

    const g = r.geral
    const kpis = '<div class="pu-kpis">' +
      kpi('Comprometimento', g.comprometimento, '/100', g.comprometimento, nivel(g.comprometimento, 70, 50), 'Média de Q1–Q5 em escala 0–100') +
      kpi('Sintonia', g.sintonia, '/100', g.sintonia, nivel(g.sintonia, 60, 45), 'Quanto as respostas convergem') +
      kpi('eNPS', sinal(g.enps), '', (g.enps + 100) / 2, g.enps >= 30 ? ['ok', 'Forte'] : g.enps >= 0 ? ['md', 'Neutro'] : ['dv', 'Crítico'], 'Promotores (9–10) − detratores (0–6)') +
      kpi('Participação', pct != null ? pct : r.n, pct != null ? '%' : '', pct || 0, pct == null ? null : pct >= 70 ? ['ok', 'Boa'] : pct >= 50 ? ['md', 'Média'] : ['dv', 'Baixa'],
        r.n + ' respostas · ' + (p.cadastrados || 0) + ' de ' + (p.usuarios_ativos || 0) + ' cadastrados · ' + (p.convidados || 0) + ' convidado' + (p.convidados === 1 ? '' : 's')) +
      '</div>'

    return cab + kpis + leituraHTML(g) + perguntasHTML(g, r.espelho) + gruposHTML(r.grupos) + textosHTML(r.textos) + devolutivaHTML()
  }

  function nivel(v, alto, medio) { return v >= alto ? ['ok', 'Alto'] : v >= medio ? ['md', 'Médio'] : ['dv', 'Baixo'] }

  function kpi(rot, v, un, pctMed, niv, sub) {
    return '<div class="pu-kpi"><div class="pu-kpi-rot"><span>' + rot + '</span>' + (niv ? '<span class="pu-nivel ' + niv[0] + '">' + niv[1] + '</span>' : '') + '</div>' +
      '<div class="pu-kpi-val">' + esc(String(v ?? '—')) + (un ? '<small>' + un + '</small>' : '') + '</div>' +
      '<div class="pu-medidor" role="img" aria-label="' + esc(rot + ': ' + v + un) + '"><i style="width:' + Math.max(0, Math.min(100, pctMed)) + '%"></i></div>' +
      '<div class="pu-kpi-sub">' + esc(sub) + '</div></div>'
  }

  function leituraHTML(g) {
    const c = g.comprometimento >= 70, s = g.sintonia >= 60
    const q = c && s ? ['Equipe de alta performance', 'Comprometida e na mesma frequência. Proteja o que funciona e reconheça publicamente.']
      : c ? ['Esforço disperso', 'As pessoas estão dedicadas, mas enxergam o projeto de formas diferentes. Realinhe prioridades e o “porquê” de cada entrega.']
      : s ? ['Apatia coletiva', 'A equipe concorda — num patamar baixo. Revise propósito, condições de trabalho e reconhecimento.']
      : ['Fragmentação', 'Baixo comprometimento e visões divergentes. Converse com franqueza, em grupos pequenos, antes de cobrar resultado.']
    const pior = g.medias.slice(0, 5).reduce((a, v, k) => v < g.medias[a] ? k : a, 0)
    const div = g.desvios.reduce((a, v, k) => v > g.desvios[a] ? k : a, 0)
    // quadrante: linhas = comprometimento (alto em cima), colunas = sintonia (baixa à esquerda)
    const cel = (on, t) => '<i class="' + (on ? 'on' : '') + '">' + t + '</i>'
    const quad = '<div class="pu-quad" role="img" aria-label="Quadrante: ' + esc(q[0]) + '">' +
      cel(c && !s, 'Esforço disperso') + cel(c && s, 'Alta performance') + cel(!c && !s, 'Fragmentação') + cel(!c && s, 'Apatia') +
      '<span class="ex-y">Comprometimento ↑</span><span class="ex-x">Sintonia →</span></div>'
    return '<div class="pu-box"><h3>' + pIc('pulso') + 'Leitura</h3><div class="pu-leitura">' + quad +
      '<div class="pu-leitura-txt"><b class="t">' + q[0] + '</b><p>' + q[1] + '</p><div class="pu-pontos">' +
      '<span class="pu-ponto baixo">' + pIc('seta_baixo') + 'Mais baixo: <b>' + PULSO_PERGUNTAS[pior].tema + '</b> · ' + fmt(g.medias[pior]) + '</span>' +
      '<span class="pu-ponto div">' + pIc('divide') + 'Mais dividida: <b>' + PULSO_PERGUNTAS[div].tema + '</b> · dp ' + fmt(g.desvios[div], 2) + '</span>' +
      '</div></div></div></div>'
  }

  // dispersão (desvio-padrão, escala 1–5): < 0,8 alinhada; até 1,2 moderada; acima, dividida
  function tagDisp(d) {
    return d < 0.8 ? '<span class="pu-nivel ok">Alinhada</span>' : d <= 1.2 ? '<span class="pu-nivel md">Moderada</span>' : '<span class="pu-nivel dv">Dividida</span>'
  }

  // barra empilhada com rótulo de % no segmento (≥ 12%) — 2ª codificação além da cor
  function pilha(partes, rotulo) {
    const n = partes.reduce((a, x) => a + x[0], 0) || 1
    return '<div class="pu-pilha" role="img" aria-label="' + esc(rotulo + ': ' + partes.map(x => x[2] + ' ' + x[0]).join('; ')) + '">' +
      partes.map(([v, cls, r]) => {
        if (!v) return ''
        const pc = Math.round(v / n * 100)
        return '<i class="' + cls + '" style="flex:' + v + '" title="' + esc(r + ': ' + v + ' (' + pc + '%)') + '">' + (pc >= 12 ? pc + '%' : '') + '</i>'
      }).join('') + '</div>'
  }

  function perguntasHTML(g, esp) {
    const leg = '<div class="pu-leg">' + PULSO_LIKERT.map((r, k) => '<span><i style="background:var(--pu-d' + (k + 1) + ')"></i>' + r + '</span>').join('') + '</div>'
    const linhas = PULSO_PERGUNTAS.slice(0, 5).map((p, k) => {
      const e = esp?.medias?.[k]
      const dif = e != null ? g.medias[k] - e : null
      return '<div class="pu-q"><div class="pu-q-tx"><em>Q' + (k + 1) + ' · ' + esc(p.tema) + '</em><p>' + esc(p.texto) + '</p></div>' +
        '<div class="pu-q-num"><span class="m">média<b>' + fmt(g.medias[k]) + '</b></span>' + tagDisp(g.desvios[k]) +
        (dif != null ? '<span class="pu-esp">expectativa <b>' + fmt(e) + '</b> <span class="' + (dif < -0.25 ? 'neg' : dif > 0.25 ? 'pos' : '') + '">(' + sinal(Math.round(dif * 10) / 10) + ')</span></span>' : '') + '</div>' +
        pilha(g.distribuicao[k].map((v, j) => [v, 'd' + (j + 1), PULSO_LIKERT[j]]), 'Q' + (k + 1)) + '</div>'
    }).join('')
    const d6 = g.distribuicao[5]
    const det = d6.slice(0, 7).reduce((a, b) => a + b, 0), neu = d6[7] + d6[8], pro = d6[9] + d6[10]
    const q6 = '<div class="pu-q"><div class="pu-q-tx"><em>Q6 · Recomendação</em><p>' + esc(PULSO_PERGUNTAS[5].texto) + '</p></div>' +
      '<div class="pu-q-num"><span class="m">média<b>' + fmt(g.medias[5]) + '</b></span><span class="pu-esp">eNPS <b>' + sinal(g.enps) + '</b></span></div>' +
      pilha([[det, 'd1', 'Detratores (0–6)'], [neu, 'd3', 'Neutros (7–8)'], [pro, 'd5', 'Promotores (9–10)']], 'Q6') + '</div>'
    return '<div class="pu-box"><h3>' + pIc('barras') + 'Por pergunta</h3>' + leg + linhas + q6 +
      '<p class="pu-nota">Na Q6: laranja = detratores (0–6), cinza = neutros (7–8), azul = promotores (9–10). Passe o mouse nas barras para ver os números.</p></div>'
  }

  function gruposHTML(gr) {
    if (!gr || !gr.length) return '<div class="pu-box"><h3>' + pIc('pessoas') + 'Por perfil</h3><p class="pu-sub" style="margin:0">Nenhum perfil chegou a 5 respostas — o recorte fica oculto para proteger o anonimato.</p></div>'
    const menor = k => Math.min(...gr.map(x => x.medias[k]))
    return '<div class="pu-box"><h3>' + pIc('pessoas') + 'Por perfil</h3><div class="pu-tabw"><table class="pu-tab"><thead><tr><th>Grupo</th><th class="n">Resp.</th>' +
      PULSO_PERGUNTAS.slice(0, 5).map((p, k) => '<th class="n" title="' + esc(p.texto) + '">Q' + (k + 1) + '</th>').join('') +
      '<th class="n">Compr.</th><th class="n">Sint.</th><th class="n">eNPS</th></tr></thead><tbody>' +
      gr.map(x => '<tr><td class="gr">' + esc(PULSO_GRUPOS[x.grupo] || x.grupo) + '</td><td class="n">' + x.n + '</td>' +
        x.medias.slice(0, 5).map((v, k) => '<td class="n' + (gr.length > 1 && v === menor(k) ? ' pu-cel-b' : '') + '">' + fmt(v) + '</td>').join('') +
        '<td class="n">' + x.comprometimento + '</td><td class="n">' + x.sintonia + '</td><td class="n">' + sinal(x.enps) + '</td></tr>').join('') +
      '</tbody></table></div><p class="pu-nota">Em vermelho, o grupo com a menor média em cada pergunta. Perfis com menos de 5 respostas entram em “Demais perfis” (quando somam 5) ou ficam só no total.</p></div>'
  }

  function textosHTML(t) {
    if (!t || !t.length) return '<div class="pu-box"><h3>' + pIc('aspas') + 'Uma mudança para o próximo mês</h3><p class="pu-sub" style="margin:0">Nenhum comentário livre neste ciclo.</p></div>'
    return '<div class="pu-box"><h3>' + pIc('aspas') + 'Uma mudança para o próximo mês <span class="pu-nivel ok" style="margin-left:2px">' + t.length + '</span></h3>' +
      '<p class="pu-sub">Ordem embaralhada e sem perfil. Agrupe os temas que se repetem e transforme 2 ou 3 em compromissos.</p>' +
      t.map((x, k) => '<div class="pu-txt">' + pIc('aspas') + '<p>' + esc(x) + '</p><button class="btn btn-secondary btn-sm" onclick="PU.tarefa(' + k + ')" aria-label="Criar tarefa a partir deste comentário">' + pIc('tarefa') + 'Criar tarefa</button></div>').join('') + '</div>'
  }

  function devolutivaHTML() {
    return '<div class="pu-box"><h3>' + pIc('roteiro') + 'Roteiro da devolutiva · 10 min</h3><ol class="pu-passos">' +
      '<li><span>Projete esta tela e leia a <b>Leitura</b> em voz alta — sem defender nem justificar.</span></li>' +
      '<li><span>Pergunte: “O que mais surpreendeu vocês?”</span></li>' +
      '<li><span>Na pergunta marcada como <b>Dividida</b>: “Por que enxergamos isso de formas tão diferentes?”</span></li>' +
      '<li><span>Leia os comentários livres e agrupe os temas repetidos.</span></li>' +
      '<li><span>Escolham no máximo 3 ações, cada uma com responsável e prazo (botão “Criar tarefa”).</span></li>' +
      '<li><span>No próximo ciclo, comece mostrando o que foi feito com estas ações.</span></li></ol>' +
      '<div class="pu-ouro">' + pIc('escudo') + '<span><b>Regra de ouro:</b> nunca pergunte “quem respondeu isso?”.</span></div></div>'
  }

  function guiaHTML() {
    return '<div class="pu-box"><h3>' + pIc('roteiro') + 'Como aplicar</h3><ol class="pu-passos">' +
      '<li><span><b>Abertura (3 min):</b> explique que o objetivo é ouvir para ajustar, não avaliar pessoas; as respostas são anônimas e o resultado volta para todos.</span></li>' +
      '<li><span><b>Aplicação (5 min):</b> projete o QR Code em tela cheia. Quem lidera não olha os celulares.</span></li>' +
      '<li><span><b>Devolutiva (10 min, no mesmo dia ou em até 48h):</b> projete o resultado e siga o roteiro.</span></li>' +
      '<li><span><b>Compromissos (7 min):</b> até 3 ações viram tarefas com responsável e prazo.</span></li>' +
      '<li><span><b>Ritmo:</b> repita a cada 30 a 45 dias com as mesmas perguntas para ver a tendência.</span></li></ol></div>'
  }

  // ── Modais ──────────────────────────────────────────────────────────
  let focoAntes = null
  function modal(html) {
    focoAntes = document.activeElement
    document.getElementById('pu-modal-c').innerHTML = html
    const ov = document.getElementById('pu-modal'); ov.classList.add('aberto')
    setTimeout(() => { const f = ov.querySelector('input, button.btn-primary'); if (f) f.focus() }, 30)
  }
  function fecharModal() {
    document.getElementById('pu-modal').classList.remove('aberto')
    if (focoAntes && focoAntes.focus) focoAntes.focus()
  }
  function cabModal(t) { return '<div class="modal-header"><div class="modal-title">' + esc(t) + '</div><button class="modal-close" onclick="PU.fecharModal()" aria-label="Fechar">&#x2715;</button></div>' }
  document.getElementById('pu-modal').addEventListener('click', ev => { if (ev.target.id === 'pu-modal') fecharModal() })

  function novo() {
    const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    modal(cabModal('Novo ciclo') + '<div class="modal-body">' +
      '<div class="form-group"><label class="form-label" for="pu-f-tit">Título</label><input class="form-control" id="pu-f-tit" maxlength="120" value="Pulso · ' + esc(mes) + '"></div>' +
      '<div class="form-group"><label class="pu-chk"><input type="checkbox" id="pu-f-conv" checked><span>Aceitar convidados<small>Quem não tem cadastro responde como “convidado”.</small></span></label></div>' +
      '<div class="form-group"><label class="form-label" for="pu-f-lim">Limite de convidados <span style="font-weight:400;color:var(--txt-3)">(opcional)</span></label><input class="form-control" id="pu-f-lim" type="number" min="1" inputmode="numeric" placeholder="Sem limite"><div class="form-hint">Útil quando o QR fica exposto fora da sala.</div></div>' +
      '<div class="form-group" style="margin-bottom:0"><label class="form-label" for="pu-f-fecha">Fechar automaticamente em <span style="font-weight:400;color:var(--txt-3)">(opcional)</span></label><input class="form-control" id="pu-f-fecha" type="datetime-local"></div>' +
      '</div><div class="modal-footer"><button class="btn btn-secondary" onclick="PU.fecharModal()">Cancelar</button><button class="btn btn-primary" id="pu-f-ok" onclick="PU.criar()">' + pIc('mais') + 'Criar ciclo</button></div>')
  }

  async function criar() {
    const tit = document.getElementById('pu-f-tit').value.trim()
    if (tit.length < 3) { toast('Informe um título.', 'warning'); document.getElementById('pu-f-tit').focus(); return }
    const lim = document.getElementById('pu-f-lim').value
    const fecha = document.getElementById('pu-f-fecha').value
    const b = document.getElementById('pu-f-ok'); b.disabled = true; b.textContent = 'Criando…'
    const { data, error } = await db.rpc('fn_pulso_criar', {
      p_titulo: tit, p_aceita_convidados: document.getElementById('pu-f-conv').checked,
      p_limite_convidados: lim ? parseInt(lim, 10) : null,
      p_fecha_em: fecha ? new Date(fecha).toISOString() : null,
    })
    if (error) { b.disabled = false; b.innerHTML = pIc('mais') + 'Criar ciclo'; toast(pulsoErro(error), 'error'); return }
    fecharModal(); toast('Ciclo criado', 'success')
    S.sel = data
    await carregarLista(true)
  }

  async function status(st) {
    if (st === 'encerrado' && !confirm('Encerrar o ciclo? Ninguém mais conseguirá responder (é possível reabrir).')) return
    const { error } = await db.rpc('fn_pulso_alterar', { p_ciclo: S.sel, p_dados: { status: st } })
    if (error) { toast(pulsoErro(error), 'error'); return }
    toast(st === 'encerrado' ? 'Ciclo encerrado' : 'Ciclo reaberto', 'success')
    await carregarLista(true)
  }

  function espelho() {
    const meu = (S.res?.espelho?.meu || [4, 4, 4, 4, 4]).map(Number)
    modal(cabModal('Minha expectativa') + '<div class="modal-body">' +
      '<p class="pu-sub" style="margin:0">Que média (1 a 5) você acha que a equipe vai dar em cada pergunta? Fica só para a coordenação e aparece ao lado do resultado real.</p>' +
      '<div class="pu-esp-l">' + PULSO_PERGUNTAS.slice(0, 5).map((p, k) =>
        '<label for="pu-e' + k + '"><span>Q' + (k + 1) + ' · ' + esc(p.tema) + '<br><small>' + esc(p.texto) + '</small></span>' +
        '<input type="range" id="pu-e' + k + '" min="1" max="5" step="0.5" value="' + meu[k] + '" oninput="this.nextElementSibling.value=Number(this.value).toLocaleString(\'pt-BR\',{minimumFractionDigits:1})">' +
        '<output for="pu-e' + k + '">' + fmt(meu[k]) + '</output></label>').join('') + '</div>' +
      '</div><div class="modal-footer"><button class="btn btn-secondary" onclick="PU.fecharModal()">Cancelar</button><button class="btn btn-primary" onclick="PU.salvarEspelho()">Salvar</button></div>')
  }

  async function salvarEspelho() {
    const q = {}; for (let k = 0; k < 5; k++) q['q' + (k + 1)] = Number(document.getElementById('pu-e' + k).value)
    const { error } = await db.rpc('fn_pulso_salvar_espelho', { p_ciclo: S.sel, p_q: q })
    if (error) { toast(pulsoErro(error), 'error'); return }
    fecharModal(); toast('Expectativa registrada', 'success'); await abrir(S.sel)
  }

  // ── QR em tela cheia com contador ao vivo ───────────────────────────
  function qr() {
    const c = S.ciclos.find(x => x.id === S.sel); if (!c) return
    const url = urlResposta(c)
    const q = qrcode(0, 'M'); q.addData(url); q.make()
    document.getElementById('pu-qr-img').src = q.createDataURL(10, 2)
    document.getElementById('pu-qr-tit').textContent = c.titulo
    document.getElementById('pu-qr-url').textContent = url
    document.getElementById('pu-qr-n').textContent = S.ultimoN = c.n_respostas
    document.getElementById('pu-qr').classList.add('aberto')
    document.getElementById('pu-qr-fechar').focus()
    try { document.documentElement.requestFullscreen?.() } catch (e) {}
    clearInterval(S.timer)
    S.timer = setInterval(async () => {
      const { data } = await db.rpc('fn_pulso_contagem', { p_ciclo: c.id })
      if (data == null || data === S.ultimoN) return
      S.ultimoN = data
      const n = document.getElementById('pu-qr-n')
      n.textContent = data; n.classList.remove('pulo'); void n.offsetWidth; n.classList.add('pulo')
    }, 4000)
  }
  async function fecharQR() {
    clearInterval(S.timer); S.timer = null
    document.getElementById('pu-qr').classList.remove('aberto')
    try { if (document.fullscreenElement) await document.exitFullscreen() } catch (e) {}
    await carregarLista(true)
  }
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return
    if (S.timer) fecharQR()
    else if (document.getElementById('pu-modal').classList.contains('aberto')) fecharModal()
  })

  async function copiar() {
    const c = S.ciclos.find(x => x.id === S.sel); if (!c) return
    try { await navigator.clipboard.writeText(urlResposta(c)); toast('Link copiado', 'success') }
    catch (e) { prompt('Copie o link:', urlResposta(c)) }
  }

  // Comentário livre → nova tarefa no Painel de Tarefas (formulário pré-preenchido)
  function tarefa(k) {
    const t = S.res?.textos?.[k]; if (!t) return
    const c = S.ciclos.find(x => x.id === S.sel)
    const titulo = t.length > 80 ? t.slice(0, 77) + '…' : t
    const desc = 'Ação do ' + (c ? c.titulo : 'Pulso da Equipe') + ' (comentário anônimo):\n"' + t + '"'
    location.href = 'tarefas.html?nova=1&titulo=' + encodeURIComponent(titulo) + '&desc=' + encodeURIComponent(desc)
  }

  window.PU = { abrir, novo, criar, status, espelho, salvarEspelho, qr, fecharQR, copiar, tarefa, fecharModal }
  await carregarLista()
})()
