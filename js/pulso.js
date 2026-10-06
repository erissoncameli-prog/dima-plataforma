// ═══════════════════════════════════════════════════════════════════════
// pulso.js — Pulso da Equipe: ciclos, perguntas e resultado
// ═══════════════════════════════════════════════════════════════════════
// Qualquer usuário ativo cria ciclo e personaliza as PRÓPRIAS perguntas
// (fn_pulso_salvar_perguntas: só o criador, e só até a 1ª resposta).
// Vê o resultado quem criou o ciclo; coordenação/super_admin veem todos
// (só leitura). Encerrar/reabrir: criador ou super_admin.
// A tela não calcula índice nem decide supressão: desenha o que o banco
// devolve (fn_pulso_resultado). Nenhuma leitura direta das tabelas pulso_*.
// Respostas: pages/pulso-responder.html?c=<token> (pública, aberta pelo QR).
// Visual: design system da mesa do Diagnóstico (body.dgm) + css/pulso.css.
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
  editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  cima: '<path d="m18 15-6-6-6 6"/>',
  baixo: '<path d="m6 9 6 6 6-6"/>',
  lixo: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  escolha: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
}
function pIc(n) { return '<svg class="pu-ic" viewBox="0 0 24 24" aria-hidden="true">' + (PU_IC[n] || '') + '</svg>' }

;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { window.location.href = '../index.html'; return }
  const ehAdmin = appState.perfil === 'super_admin'

  document.getElementById('app').innerHTML =
    gerarLayout('Pulso da Equipe', 'pulso') +
    '<div class="fade-in pu">' +
      '<div class="pu-cab"><div><div class="pu-eyebrow">Engajamento</div><h2>Pulso da Equipe</h2>' +
      '<p>Questionário rápido e anônimo aberto por QR Code. Comece pelas perguntas padrão ou monte as suas. Mede <b>comprometimento</b> (o nível) e <b>sintonia</b> (o quanto a equipe enxerga o trabalho do mesmo jeito). ' +
      'Cadastrados contam no grupo do perfil, os demais como convidados. Nada aparece com menos de 5 respostas.</p></div>' +
      '<button class="btn btn-primary" onclick="PU.novo()">' + pIc('mais') + 'Novo ciclo</button></div>' +
      '<div class="pu-lay"><nav class="pu-lista" id="pu-lista" aria-label="Ciclos">' + esqueleto(3, 64) + '</nav>' +
      '<section id="pu-det" aria-live="polite">' + esqueleto(1, 120) + esqueleto(1, 280) + '</section></div>' +
    '</div>' + '</div></div></div>'
  carregarLogosSidebar()
  seletorTema()

  const S = { ciclos: [], sel: null, res: null, timer: null, ultimoN: null, ed: null }
  const fmt = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
  const sinal = v => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  const urlResposta = c => new URL('pulso-responder.html?c=' + encodeURIComponent(c.token), location.href).href
  const dataBR = s => s ? new Date(s).toLocaleDateString('pt-BR') : ''
  const cicloSel = () => S.ciclos.find(x => x.id === S.sel)

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

  // ── Lista de ciclos ─────────────────────────────────────────────────
  async function carregarLista(manterSel) {
    const { data, error } = await db.rpc('fn_pulso_ciclos')
    const el = document.getElementById('pu-lista')
    if (error) { el.innerHTML = '<p class="pu-erro">' + esc(pulsoErro(error)) + '</p>'; document.getElementById('pu-det').innerHTML = ''; return }
    S.ciclos = data || []
    if (!S.ciclos.length) {
      el.innerHTML = ''
      document.getElementById('pu-det').innerHTML = '<div class="pu-anim">' +
        '<div class="pu-box pu-vazio">' + pIc('pulso') + '<b>Nenhum ciclo ainda</b>Crie o primeiro, ajuste as perguntas se quiser e projete o QR Code na próxima reunião.' +
        '<div style="margin-top:14px"><button class="btn btn-primary" onclick="PU.novo()">' + pIc('mais') + 'Criar o primeiro ciclo</button></div></div>' +
        guiaHTML() + '</div>'
      return
    }
    if (!manterSel || !S.ciclos.find(c => c.id === S.sel)) S.sel = S.ciclos[0].id
    const meus = S.ciclos.filter(c => c.meu), outros = S.ciclos.filter(c => !c.meu)
    const cartao = c =>
      '<button type="button" class="pu-ci" data-id="' + c.id + '" aria-current="' + (c.id === S.sel) + '" onclick="PU.abrir(\'' + c.id + '\')">' +
      '<span class="pu-ci-l1"><b>' + esc(c.titulo) + '</b>' + selo(c) + '</span>' +
      '<span class="pu-ci-meta"><span>' + pIc('calendario') + dataBR(c.criado_em) + '</span>' +
      '<span>' + pIc('pessoas') + c.n_respostas + '</span>' +
      '<span title="Perguntas">' + pIc('lista') + c.n_perguntas + '</span>' +
      (c.indices && c.indices.comprometimento != null ? '<span title="Comprometimento · Sintonia">' + pIc('barras') + c.indices.comprometimento + ' · ' + c.indices.sintonia + '</span>' : '') +
      '</span>' + (!c.meu && c.autor ? '<span class="pu-ci-autor">por ' + esc(c.autor) + '</span>' : '') + '</button>'
    el.innerHTML =
      (meus.length ? '<div class="pu-lista-tit">Meus ciclos</div>' + meus.map(cartao).join('') : '') +
      (outros.length ? '<div class="pu-lista-tit"' + (meus.length ? ' style="margin-top:8px"' : '') + '>Outros ciclos (acompanhamento)</div>' + outros.map(cartao).join('') : '') +
      historicoHTML()
    await abrir(S.sel)
  }

  function selo(c) { return c.aberto ? '<span class="pu-st ab">Aberto</span>' : '<span class="pu-st en">Encerrado</span>' }

  function historicoHTML() {
    const h = S.ciclos.filter(c => c.meu && c.indices && c.indices.comprometimento != null).slice().reverse()
    if (h.length < 2) return ''
    return '<div class="pu-box pu-hist" style="margin-top:8px;padding:14px"><h3 style="font-size:13px;margin-bottom:8px">' + pIc('barras') + 'Evolução dos meus ciclos</h3>' +
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
    det.innerHTML = '<div class="pu-anim">' + detalheHTML(cicloSel(), data) + '</div>'
  }

  // ── Detalhe do ciclo ────────────────────────────────────────────────
  function detalheHTML(c, r) {
    const p = r.participacao || {}
    const pct = p.usuarios_ativos ? Math.round((p.cadastrados || 0) / p.usuarios_ativos * 100) : null
    const escalas = r.perguntas.filter(q => q.tipo === 'escala')
    const podeStatus = r.meu || ehAdmin
    const cab = '<div class="pu-box"><div class="pu-hdr"><div><h3>' + esc(c.titulo) + selo(c) + '</h3>' +
      '<p>' + (r.meu ? 'Criado por você' : 'Criado por ' + esc(c.autor || '—') + ' · só leitura') + ' em ' + dataBR(c.criado_em) +
      (c.fecha_em ? ' · fecha em ' + new Date(c.fecha_em).toLocaleString('pt-BR') : '') +
      ' · ' + r.perguntas.length + ' pergunta' + (r.perguntas.length === 1 ? '' : 's') +
      ' · convidados: ' + (c.aceita_convidados ? (c.limite_convidados ? 'até ' + c.limite_convidados : 'sem limite') : 'não aceita') + '</p></div></div>' +
      '<div class="pu-acoes">' +
        (c.aberto ? '<button class="btn btn-primary btn-sm" onclick="PU.qr()">' + pIc('qr') + 'Projetar QR Code</button>' : '') +
        '<button class="btn btn-secondary btn-sm" onclick="PU.copiar()">' + pIc('link') + 'Copiar link</button>' +
        (r.pode_editar_perguntas
          ? '<button class="btn btn-secondary btn-sm" onclick="PU.editarPerguntas()">' + pIc('editar') + 'Editar perguntas</button>'
          : '<button class="btn btn-secondary btn-sm" onclick="PU.verPerguntas()">' + pIc('lista') + 'Ver perguntas</button>') +
        (escalas.length ? '<button class="btn btn-secondary btn-sm" onclick="PU.espelho()">' + pIc('alvo') + (r.espelho?.meu ? 'Rever minha expectativa' : 'Minha expectativa') + '</button>' : '') +
        '<button class="btn btn-ghost btn-sm" onclick="PU.novo(\'' + c.id + '\')">' + pIc('copiar') + 'Novo ciclo com estas perguntas</button>' +
        (podeStatus ? (c.aberto
          ? '<button class="btn btn-ghost btn-sm" onclick="PU.status(\'encerrado\')">' + pIc('parar') + 'Encerrar</button>'
          : '<button class="btn btn-ghost btn-sm" onclick="PU.status(\'aberto\')">' + pIc('reabrir') + 'Reabrir</button>') : '') +
      '</div></div>'

    if (r.suprimido) {
      return cab +
        (r.pode_editar_perguntas ? '<div class="pu-dica" style="margin-bottom:16px">' + pIc('editar') + '<div><b>Perguntas editáveis até a 1ª resposta.</b> Depois disso elas travam, para o resultado corresponder exatamente ao que as pessoas leram.</div></div>' : '') +
        '<div class="pu-sup" role="status">' + pIc('escudo') + '<div><b>' + r.n + ' de ' + r.minimo + ' respostas mínimas</b>' +
        '<div class="pu-sup-barra"><i style="width:' + Math.min(100, r.n / r.minimo * 100) + '%"></i></div>' +
        'O resultado aparece a partir de ' + r.minimo + ' respostas, para proteger o anonimato. ' +
        'Cadastrados: ' + (p.cadastrados || 0) + (pct != null ? ' de ' + p.usuarios_ativos + ' (' + pct + '%)' : '') + ' · convidados: ' + (p.convidados || 0) + '.</div></div>' +
        (escalas.length && !r.espelho?.meu ? '<div class="pu-dica">' + pIc('info') + '<div><b>Dica de coach:</b> antes de ver o resultado, registre a média que você <b>espera</b> da equipe em cada pergunta de escala ("Minha expectativa"). A diferença entre expectativa e realidade é um dos melhores assuntos da devolutiva.</div></div>' : '')
    }

    const g = r.geral
    const kp = []
    if (g.comprometimento != null) kp.push(kpi('Comprometimento', g.comprometimento, '/100', g.comprometimento, nivel(g.comprometimento, 70, 50), 'Média das perguntas de escala em 0–100'))
    if (g.sintonia != null) kp.push(kpi('Sintonia', g.sintonia, '/100', g.sintonia, nivel(g.sintonia, 60, 45), 'Quanto as respostas convergem'))
    if (g.enps != null) kp.push(kpi('eNPS', sinal(g.enps), '', (g.enps + 100) / 2, g.enps >= 30 ? ['ok', 'Forte'] : g.enps >= 0 ? ['md', 'Neutro'] : ['dv', 'Crítico'], 'Promotores (9–10) − detratores (0–6)'))
    kp.push(kpi('Participação', pct != null ? pct : r.n, pct != null ? '%' : '', pct || 0, pct == null ? null : pct >= 70 ? ['ok', 'Boa'] : pct >= 50 ? ['md', 'Média'] : ['dv', 'Baixa'],
      r.n + ' respostas · ' + (p.cadastrados || 0) + ' de ' + (p.usuarios_ativos || 0) + ' cadastrados · ' + (p.convidados || 0) + ' convidado' + (p.convidados === 1 ? '' : 's')))

    return cab + '<div class="pu-kpis" style="grid-template-columns:repeat(' + Math.min(4, kp.length) + ',minmax(0,1fr))">' + kp.join('') + '</div>' +
      (g.comprometimento != null ? leituraHTML(g, escalas) : '') +
      perguntasHTML(r) + gruposHTML(r.grupos, escalas) + textosHTML(r) + devolutivaHTML()
  }

  function nivel(v, alto, medio) { return v >= alto ? ['ok', 'Alto'] : v >= medio ? ['md', 'Médio'] : ['dv', 'Baixo'] }

  function kpi(rot, v, un, pctMed, niv, sub) {
    return '<div class="pu-kpi"><div class="pu-kpi-rot"><span>' + rot + '</span>' + (niv ? '<span class="pu-nivel ' + niv[0] + '">' + niv[1] + '</span>' : '') + '</div>' +
      '<div class="pu-kpi-val">' + esc(String(v ?? '—')) + (un ? '<small>' + un + '</small>' : '') + '</div>' +
      '<div class="pu-medidor" role="img" aria-label="' + esc(rot + ': ' + v + un) + '"><i style="width:' + Math.max(0, Math.min(100, pctMed)) + '%"></i></div>' +
      '<div class="pu-kpi-sub">' + esc(sub) + '</div></div>'
  }

  function leituraHTML(g, escalas) {
    const c = g.comprometimento >= 70, s = g.sintonia >= 60
    const q = c && s ? ['Equipe de alta performance', 'Comprometida e na mesma frequência. Proteja o que funciona e reconheça publicamente.']
      : c ? ['Esforço disperso', 'As pessoas estão dedicadas, mas enxergam o trabalho de formas diferentes. Realinhe prioridades e o “porquê” de cada entrega.']
      : s ? ['Apatia coletiva', 'A equipe concorda — num patamar baixo. Revise propósito, condições de trabalho e reconhecimento.']
      : ['Fragmentação', 'Baixo comprometimento e visões divergentes. Converse com franqueza, em grupos pequenos, antes de cobrar resultado.']
    const pp = g.por_pergunta
    const comDados = escalas.filter(x => pp[x.chave] && pp[x.chave].n > 0)
    const pior = comDados.reduce((a, x) => !a || pp[x.chave].media_ajustada < pp[a.chave].media_ajustada ? x : a, null)
    const div = comDados.reduce((a, x) => !a || pp[x.chave].dp > pp[a.chave].dp ? x : a, null)
    const cel = (on, t) => '<i class="' + (on ? 'on' : '') + '">' + t + '</i>'
    const quad = '<div class="pu-quad" role="img" aria-label="Quadrante: ' + esc(q[0]) + '">' +
      cel(c && !s, 'Esforço disperso') + cel(c && s, 'Alta performance') + cel(!c && !s, 'Fragmentação') + cel(!c && s, 'Apatia') +
      '<span class="ex-y">Comprometimento ↑</span><span class="ex-x">Sintonia →</span></div>'
    return '<div class="pu-box"><h3>' + pIc('pulso') + 'Leitura</h3><div class="pu-leitura">' + quad +
      '<div class="pu-leitura-txt"><b class="t">' + q[0] + '</b><p>' + q[1] + '</p><div class="pu-pontos">' +
      (pior ? '<span class="pu-ponto baixo">' + pIc('seta_baixo') + 'Mais baixo: <b>' + esc(pior.tema) + '</b> · ' + fmt(pp[pior.chave].media_ajustada) + '</span>' : '') +
      (div && comDados.length > 1 ? '<span class="pu-ponto div">' + pIc('divide') + 'Mais dividida: <b>' + esc(div.tema) + '</b> · dp ' + fmt(pp[div.chave].dp, 2) + '</span>' : '') +
      '</div></div></div></div>'
  }

  function tagDisp(d) {
    if (d == null) return ''
    return d < 0.8 ? '<span class="pu-nivel ok">Alinhada</span>' : d <= 1.2 ? '<span class="pu-nivel md">Moderada</span>' : '<span class="pu-nivel dv">Dividida</span>'
  }

  // barra empilhada com % no segmento (≥ 12%) — 2ª codificação além da cor
  function pilha(partes, rotulo) {
    const n = partes.reduce((a, x) => a + x[0], 0) || 1
    return '<div class="pu-pilha" role="img" aria-label="' + esc(rotulo + ': ' + partes.map(x => x[2] + ' ' + x[0]).join('; ')) + '">' +
      partes.map(([v, cls, r]) => {
        if (!v) return ''
        const pc = Math.round(v / n * 100)
        return '<i class="' + cls + '" style="flex:' + v + '" title="' + esc(r + ': ' + v + ' (' + pc + '%)') + '">' + (pc >= 12 ? pc + '%' : '') + '</i>'
      }).join('') + '</div>'
  }

  function perguntasHTML(r) {
    const g = r.geral, pp = g.por_pergunta, esp = r.espelho
    const temEscala = r.perguntas.some(q => q.tipo === 'escala')
    const leg = temEscala ? '<div class="pu-leg">' + PULSO_LIKERT.map((t, k) => '<span><i style="background:var(--pu-d' + (k + 1) + ')"></i>' + t + '</span>').join('') + '</div>' : ''
    const linhas = r.perguntas.map((q, i) => {
      const m = pp[q.chave] || {}
      const cab = '<div class="pu-q-tx"><em>' + (i + 1) + ' · ' + esc(q.tema) + '<span class="pu-tipo">' + esc(PULSO_TIPOS[q.tipo]?.curto || q.tipo) + (q.invertida ? ' · invertida' : '') + (!q.obrigatoria ? ' · opcional' : '') + '</span></em><p>' + esc(q.texto) + '</p></div>'
      if (q.tipo === 'escala') {
        const e = esp?.medias?.[q.chave]
        const dif = e != null && m.media != null ? m.media - e : null
        return '<div class="pu-q">' + cab +
          '<div class="pu-q-num"><span class="m">média<b>' + fmt(m.media) + '</b></span>' + tagDisp(m.dp) +
          (dif != null ? '<span class="pu-esp">expectativa <b>' + fmt(e) + '</b> <span class="' + (dif < -0.25 ? 'neg' : dif > 0.25 ? 'pos' : '') + '">(' + sinal(Math.round(dif * 10) / 10) + ')</span></span>' : '') +
          (m.n < r.n ? '<span class="pu-esp">' + m.n + ' de ' + r.n + ' responderam</span>' : '') + '</div>' +
          pilha((m.distribuicao || []).map((v, j) => [v, 'd' + (j + 1), PULSO_LIKERT[j]]), q.tema) + '</div>'
      }
      if (q.tipo === 'nps') {
        const d = m.distribuicao || []
        const det = d.slice(0, 7).reduce((a, b) => a + b, 0), neu = (d[7] || 0) + (d[8] || 0), pro = (d[9] || 0) + (d[10] || 0)
        return '<div class="pu-q">' + cab +
          '<div class="pu-q-num"><span class="m">média<b>' + fmt(m.media) + '</b></span><span class="pu-esp">eNPS <b>' + sinal(m.enps) + '</b></span></div>' +
          pilha([[det, 'd1', 'Detratores (0–6)'], [neu, 'd3', 'Neutros (7–8)'], [pro, 'd5', 'Promotores (9–10)']], q.tema) + '</div>'
      }
      if (q.tipo === 'escolha') {
        const cont = m.contagem || [], tot = m.n || 0, max = Math.max(0, ...cont)
        return '<div class="pu-q">' + cab + '<div class="pu-q-num"><span class="pu-esp">' + tot + ' resposta' + (tot === 1 ? '' : 's') + '</span></div>' +
          '<div class="pu-opcoes">' + q.opcoes.map((o, j) => {
            const v = cont[j] || 0, pc = tot ? Math.round(v / tot * 100) : 0
            return '<div class="pu-op' + (v && v === max ? ' top' : '') + '"><span class="r">' + esc(o) + '</span>' +
              '<span class="b" role="img" aria-label="' + esc(o + ': ' + v + ' (' + pc + '%)') + '"><i style="width:' + pc + '%"></i></span>' +
              '<span class="v">' + pc + '% <small>(' + v + ')</small></span></div>'
          }).join('') + '</div></div>'
      }
      return '<div class="pu-q">' + cab + '<div class="pu-q-num"><span class="pu-esp">' + (m.n || 0) + ' comentário' + (m.n === 1 ? '' : 's') + ' · veja abaixo</span></div></div>'
    }).join('')
    return '<div class="pu-box"><h3>' + pIc('barras') + 'Por pergunta</h3>' + leg + linhas +
      (r.perguntas.some(q => q.tipo === 'nps') ? '<p class="pu-nota">Na nota 0–10: laranja = detratores (0–6), cinza = neutros (7–8), azul = promotores (9–10). Passe o mouse nas barras para ver os números.</p>' : '') + '</div>'
  }

  function gruposHTML(gr, escalas) {
    if (!gr || !gr.length) return '<div class="pu-box"><h3>' + pIc('pessoas') + 'Por perfil</h3><p class="pu-sub" style="margin:0">Nenhum perfil chegou a 5 respostas — o recorte fica oculto para proteger o anonimato.</p></div>'
    const menor = k => Math.min(...gr.map(x => x.por_pergunta[k]?.media ?? 99))
    const temComp = gr.some(x => x.comprometimento != null), temEnps = gr.some(x => x.enps != null)
    return '<div class="pu-box"><h3>' + pIc('pessoas') + 'Por perfil</h3><div class="pu-tabw"><table class="pu-tab"><thead><tr><th>Grupo</th><th class="n">Resp.</th>' +
      escalas.map((q, k) => '<th class="n" title="' + esc(q.texto) + '">' + esc(q.tema.length > 10 ? q.tema.slice(0, 9) + '…' : q.tema) + '</th>').join('') +
      (temComp ? '<th class="n">Compr.</th><th class="n">Sint.</th>' : '') + (temEnps ? '<th class="n">eNPS</th>' : '') + '</tr></thead><tbody>' +
      gr.map(x => '<tr><td class="gr">' + esc(PULSO_GRUPOS[x.grupo] || x.grupo) + '</td><td class="n">' + x.n + '</td>' +
        escalas.map(q => { const v = x.por_pergunta[q.chave]?.media; return '<td class="n' + (gr.length > 1 && v != null && v === menor(q.chave) ? ' pu-cel-b' : '') + '">' + fmt(v) + '</td>' }).join('') +
        (temComp ? '<td class="n">' + (x.comprometimento ?? '—') + '</td><td class="n">' + (x.sintonia ?? '—') + '</td>' : '') +
        (temEnps ? '<td class="n">' + sinal(x.enps) + '</td>' : '') + '</tr>').join('') +
      '</tbody></table></div><p class="pu-nota">Em vermelho, o grupo com a menor média em cada pergunta de escala. Perfis com menos de 5 respostas entram em “Demais perfis” (quando somam 5) ou ficam só no total. Escolha única e texto livre não são recortados por perfil.</p></div>'
  }

  function textosHTML(r) {
    const qs = r.perguntas.filter(q => q.tipo === 'texto')
    return qs.map(q => {
      const t = (r.textos || {})[q.chave] || []
      if (!t.length) return '<div class="pu-box"><h3>' + pIc('aspas') + esc(q.tema) + '</h3><p class="pu-sub" style="margin:0">Nenhum comentário.</p></div>'
      return '<div class="pu-box"><h3>' + pIc('aspas') + esc(q.tema) + ' <span class="pu-nivel ok" style="margin-left:2px">' + t.length + '</span></h3>' +
        '<p class="pu-sub">' + esc(q.texto) + ' · ordem embaralhada e sem perfil.</p>' +
        t.map((x, k) => '<div class="pu-txt">' + pIc('aspas') + '<p>' + esc(x) + '</p><button class="btn btn-secondary btn-sm" onclick="PU.tarefa(\'' + q.chave + '\',' + k + ')" aria-label="Criar tarefa a partir deste comentário">' + pIc('tarefa') + 'Criar tarefa</button></div>').join('') + '</div>'
    }).join('')
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
      '<li><span><b>Perguntas:</b> use o padrão (7 perguntas testadas) ou edite as suas — escala 1–5, nota 0–10, escolha única ou texto. Elas travam na 1ª resposta.</span></li>' +
      '<li><span><b>Abertura (3 min):</b> explique que o objetivo é ouvir para ajustar, não avaliar pessoas; as respostas são anônimas e o resultado volta para todos.</span></li>' +
      '<li><span><b>Aplicação (5 min):</b> projete o QR Code em tela cheia. Quem lidera não olha os celulares.</span></li>' +
      '<li><span><b>Devolutiva (10 min, no mesmo dia ou em até 48h):</b> projete o resultado e siga o roteiro.</span></li>' +
      '<li><span><b>Ritmo:</b> repita a cada 30 a 45 dias com “Novo ciclo com estas perguntas” para comparar.</span></li></ol></div>'
  }

  // ── Modais ──────────────────────────────────────────────────────────
  let focoAntes = null
  function modal(html, largo) {
    focoAntes = document.activeElement
    const ov = document.getElementById('pu-modal')
    ov.querySelector('.modal').classList.toggle('pu-largo', !!largo)
    document.getElementById('pu-modal-c').innerHTML = html
    ov.classList.add('aberto')
    setTimeout(() => { const f = ov.querySelector('input:not([type=checkbox]), textarea, button.btn-primary'); if (f) f.focus() }, 30)
  }
  function fecharModal() {
    document.getElementById('pu-modal').classList.remove('aberto')
    if (focoAntes && focoAntes.focus) focoAntes.focus()
  }
  function cabModal(t) { return '<div class="modal-header"><div class="modal-title">' + esc(t) + '</div><button class="modal-close" onclick="PU.fecharModal()" aria-label="Fechar">&#x2715;</button></div>' }
  document.getElementById('pu-modal').addEventListener('click', ev => { if (ev.target.id === 'pu-modal') fecharModal() })

  // Novo ciclo: perguntas padrão ou cópia das perguntas de um ciclo visível.
  function novo(copiarDe) {
    const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    modal(cabModal('Novo ciclo') + '<div class="modal-body">' +
      '<div class="form-group"><label class="form-label" for="pu-f-tit">Título</label><input class="form-control" id="pu-f-tit" maxlength="120" value="Pulso · ' + esc(mes) + '"></div>' +
      '<div class="form-group"><label class="form-label" for="pu-f-base">Perguntas</label><select class="form-control" id="pu-f-base">' +
        '<option value="">Padrão do Pulso (7 perguntas)</option>' +
        S.ciclos.map(c => '<option value="' + c.id + '"' + (c.id === copiarDe ? ' selected' : '') + '>Copiar de: ' + esc(c.titulo) + ' (' + c.n_perguntas + ')</option>').join('') +
      '</select><div class="form-hint">Copiar mantém as mesmas perguntas, o que permite comparar os ciclos.</div></div>' +
      '<div class="form-group"><label class="pu-chk"><input type="checkbox" id="pu-f-editar"' + (copiarDe ? '' : ' checked') + '><span>Personalizar as perguntas em seguida<small>Abre o editor logo depois de criar.</small></span></label></div>' +
      '<div class="form-group"><label class="pu-chk"><input type="checkbox" id="pu-f-conv" checked><span>Aceitar convidados<small>Quem não tem cadastro responde como “convidado”.</small></span></label></div>' +
      '<div class="form-group"><label class="form-label" for="pu-f-lim">Limite de convidados <span style="font-weight:400;color:var(--txt-3)">(opcional)</span></label><input class="form-control" id="pu-f-lim" type="number" min="1" inputmode="numeric" placeholder="Sem limite"></div>' +
      '<div class="form-group" style="margin-bottom:0"><label class="form-label" for="pu-f-fecha">Fechar automaticamente em <span style="font-weight:400;color:var(--txt-3)">(opcional)</span></label><input class="form-control" id="pu-f-fecha" type="datetime-local"></div>' +
      '</div><div class="modal-footer"><button class="btn btn-secondary" onclick="PU.fecharModal()">Cancelar</button><button class="btn btn-primary" id="pu-f-ok" onclick="PU.criar()">' + pIc('mais') + 'Criar ciclo</button></div>')
  }

  async function criar() {
    const tit = document.getElementById('pu-f-tit').value.trim()
    if (tit.length < 3) { toast('Informe um título.', 'warning'); document.getElementById('pu-f-tit').focus(); return }
    const lim = document.getElementById('pu-f-lim').value
    const fecha = document.getElementById('pu-f-fecha').value
    const editar = document.getElementById('pu-f-editar').checked
    const b = document.getElementById('pu-f-ok'); b.disabled = true; b.textContent = 'Criando…'
    const { data, error } = await db.rpc('fn_pulso_criar_ciclo', {
      p_titulo: tit, p_aceita_convidados: document.getElementById('pu-f-conv').checked,
      p_limite_convidados: lim ? parseInt(lim, 10) : null,
      p_fecha_em: fecha ? new Date(fecha).toISOString() : null,
      p_copiar_de: document.getElementById('pu-f-base').value || null,
    })
    if (error) { b.disabled = false; b.innerHTML = pIc('mais') + 'Criar ciclo'; toast(pulsoErro(error), 'error'); return }
    fecharModal(); toast('Ciclo criado', 'success')
    S.sel = data
    await carregarLista(true)
    if (editar) editarPerguntas()
  }

  async function status(st) {
    if (st === 'encerrado' && !confirm('Encerrar o ciclo? Ninguém mais conseguirá responder (é possível reabrir).')) return
    const { error } = await db.rpc('fn_pulso_alterar', { p_ciclo: S.sel, p_dados: { status: st } })
    if (error) { toast(pulsoErro(error), 'error'); return }
    toast(st === 'encerrado' ? 'Ciclo encerrado' : 'Ciclo reaberto', 'success')
    await carregarLista(true)
  }

  // ── Perguntas: ver / editar ─────────────────────────────────────────
  function verPerguntas() {
    const r = S.res
    modal(cabModal('Perguntas do ciclo') + '<div class="modal-body">' +
      (r.meu ? '<div class="pu-dica" style="margin-bottom:14px">' + pIc('cadeado') + '<div>O ciclo já recebeu respostas, então as perguntas estão travadas. Para mudar, use “Novo ciclo com estas perguntas” e edite no ciclo novo.</div></div>' : '') +
      '<ol class="pu-ver">' + r.perguntas.map(q =>
        '<li><em>' + esc(q.tema) + ' · ' + esc(PULSO_TIPOS[q.tipo]?.curto || q.tipo) + (q.obrigatoria ? '' : ' · opcional') + (q.invertida ? ' · invertida' : '') + '</em>' + esc(q.texto) +
        (q.tipo === 'escolha' ? '<ul>' + q.opcoes.map(o => '<li>' + esc(o) + '</li>').join('') + '</ul>' : '') + '</li>').join('') + '</ol>' +
      '</div><div class="modal-footer"><button class="btn btn-primary" onclick="PU.fecharModal()">Fechar</button></div>', true)
  }

  function chaveNova() {
    const usadas = new Set(S.ed.map(q => q.chave))
    let k; do { k = 'p' + Math.random().toString(36).slice(2, 8) } while (usadas.has(k) || !/^[a-z][a-z0-9_]*$/.test(k))
    return k
  }

  function editarPerguntas() {
    if (!S.res || !S.res.pode_editar_perguntas) { verPerguntas(); return }
    S.ed = JSON.parse(JSON.stringify(S.res.perguntas))
    desenharEditor()
  }

  // Lê o que está na tela de volta para S.ed (antes de mover/remover/salvar).
  function lerEditor() {
    document.querySelectorAll('.pu-ed-q').forEach((el, i) => {
      const q = S.ed[i]; if (!q) return
      q.tipo = el.querySelector('[data-c=tipo]').value
      q.tema = el.querySelector('[data-c=tema]').value.trim()
      q.texto = el.querySelector('[data-c=texto]').value.trim()
      q.obrigatoria = el.querySelector('[data-c=obrigatoria]').checked
      const ind = el.querySelector('[data-c=indice]'), inv = el.querySelector('[data-c=invertida]'), ops = el.querySelector('[data-c=opcoes]')
      if (ind) q.indice = ind.checked
      if (inv) q.invertida = inv.checked
      if (ops) q.opcoes = ops.value.split('\n').map(s => s.trim()).filter(Boolean)
    })
  }

  function desenharEditor(focoIdx) {
    const corpo = S.ed.map((q, i) => {
      const risco = q.tipo === 'escolha' && pulsoRisco(q.texto, q.opcoes)
      return '<fieldset class="pu-ed-q" data-i="' + i + '"><legend>Pergunta ' + (i + 1) + '</legend>' +
        '<div class="pu-ed-l1">' +
          '<select class="form-control" data-c="tipo" aria-label="Tipo da pergunta ' + (i + 1) + '" onchange="PU.edTipo(' + i + ')">' +
            Object.keys(PULSO_TIPOS).map(t => '<option value="' + t + '"' + (q.tipo === t ? ' selected' : '') + '>' + PULSO_TIPOS[t].nome + '</option>').join('') + '</select>' +
          '<input class="form-control" data-c="tema" maxlength="40" placeholder="Tema curto (ex.: Clareza)" aria-label="Tema da pergunta ' + (i + 1) + '" value="' + esc(q.tema || '') + '">' +
          '<span class="pu-ed-bts">' +
            '<button type="button" class="btn btn-ghost btn-icon" onclick="PU.edMover(' + i + ',-1)" ' + (i === 0 ? 'disabled' : '') + ' aria-label="Subir pergunta ' + (i + 1) + '">' + pIc('cima') + '</button>' +
            '<button type="button" class="btn btn-ghost btn-icon" onclick="PU.edMover(' + i + ',1)" ' + (i === S.ed.length - 1 ? 'disabled' : '') + ' aria-label="Descer pergunta ' + (i + 1) + '">' + pIc('baixo') + '</button>' +
            '<button type="button" class="btn btn-ghost btn-icon pu-ed-rm" onclick="PU.edRemover(' + i + ')" aria-label="Remover pergunta ' + (i + 1) + '">' + pIc('lixo') + '</button>' +
          '</span></div>' +
        '<textarea class="form-control" data-c="texto" rows="2" maxlength="300" placeholder="Texto da pergunta, como a pessoa vai ler" aria-label="Texto da pergunta ' + (i + 1) + '" oninput="PU.edRisco(' + i + ')">' + esc(q.texto || '') + '</textarea>' +
        (q.tipo === 'escolha' ? '<label class="form-label" style="margin-top:8px">Opções (uma por linha, de 2 a 10)</label><textarea class="form-control" data-c="opcoes" rows="4" placeholder="Opção 1&#10;Opção 2" oninput="PU.edRisco(' + i + ')">' + esc((q.opcoes || []).join('\n')) + '</textarea>' : '') +
        '<div class="pu-ed-risco" id="pu-ed-risco-' + i + '"' + (risco ? '' : ' hidden') + '>' + pIc('alerta') + '<span>Esta pergunta parece pedir um dado de perfil (idade, cargo, tempo, gênero…). Numa equipe pequena isso pode <b>identificar quem respondeu</b>. Prefira perguntas sobre o trabalho, não sobre a pessoa.</span></div>' +
        '<div class="pu-ed-ops">' +
          '<label><input type="checkbox" data-c="obrigatoria"' + (q.obrigatoria !== false && !(q.tipo === 'texto' && q.obrigatoria == null) ? ' checked' : '') + '> Obrigatória</label>' +
          (q.tipo === 'escala' ? '<label title="Entra no cálculo de Comprometimento e Sintonia"><input type="checkbox" data-c="indice"' + (q.indice !== false ? ' checked' : '') + '> Conta nos índices</label>' +
            '<label title="Para frases negativas (ex.: “Sinto-me sobrecarregado”): concordar puxa o índice para baixo"><input type="checkbox" data-c="invertida"' + (q.invertida ? ' checked' : '') + '> Frase negativa (invertida)</label>' : '') +
        '</div></fieldset>'
    }).join('')
    modal(cabModal('Perguntas do ciclo') + '<div class="modal-body">' +
      '<div class="pu-dica" style="margin-bottom:14px">' + pIc('info') + '<div>Quantas perguntas quiser. Elas <b>travam na 1ª resposta</b>. Dica de coach: questionários curtos (até ~8 perguntas) têm mais adesão; perguntas sobre o trabalho, não sobre a pessoa, protegem o anonimato.</div></div>' +
      '<div id="pu-ed-lista">' + corpo + '</div>' +
      '<div class="pu-ed-add"><span>Adicionar:</span>' +
        Object.keys(PULSO_TIPOS).map(t => '<button type="button" class="btn btn-secondary btn-sm" onclick="PU.edAdd(\'' + t + '\')">' + pIc('mais') + PULSO_TIPOS[t].curto + '</button>').join('') +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="PU.edPadrao()">' + pIc('reabrir') + 'Restaurar padrão</button></div>' +
      '<p class="pu-erro" id="pu-ed-erro" hidden role="alert"></p>' +
      '</div><div class="modal-footer"><span class="pu-ed-cont">' + S.ed.length + ' pergunta' + (S.ed.length === 1 ? '' : 's') + '</span><button class="btn btn-secondary" onclick="PU.fecharModal()">Cancelar</button><button class="btn btn-primary" id="pu-ed-ok" onclick="PU.edSalvar()">Salvar perguntas</button></div>', true)
    if (focoIdx != null) setTimeout(() => {
      const el = document.querySelectorAll('.pu-ed-q')[focoIdx]
      if (el) { el.scrollIntoView({ block: 'center' }); el.querySelector('[data-c=texto]').focus() }
    }, 40)
  }

  function edAdd(tipo) {
    lerEditor()
    const q = { chave: chaveNova(), tipo, tema: '', texto: '', obrigatoria: tipo !== 'texto' }
    if (tipo === 'escala') { q.indice = true; q.invertida = false }
    if (tipo === 'escolha') q.opcoes = ['', '']
    S.ed.push(q); desenharEditor(S.ed.length - 1)
  }
  function edMover(i, d) { lerEditor(); const j = i + d; if (j < 0 || j >= S.ed.length) return; [S.ed[i], S.ed[j]] = [S.ed[j], S.ed[i]]; desenharEditor(j) }
  function edRemover(i) {
    lerEditor()
    if (S.ed.length === 1) { toast('O ciclo precisa de ao menos uma pergunta.', 'warning'); return }
    if ((S.ed[i].texto || '').trim() && !confirm('Remover a pergunta “' + (S.ed[i].tema || S.ed[i].texto) + '”?')) return
    S.ed.splice(i, 1); desenharEditor()
  }
  function edTipo(i) {
    lerEditor()
    const q = S.ed[i]
    if (q.tipo === 'escolha' && !(q.opcoes || []).length) q.opcoes = ['', '']
    if (q.tipo === 'escala') { if (q.indice == null) q.indice = true; if (q.invertida == null) q.invertida = false }
    if (q.tipo !== 'escala') { delete q.indice; delete q.invertida }
    if (q.tipo !== 'escolha') delete q.opcoes
    if (q.tipo === 'texto') q.obrigatoria = false
    desenharEditor(i)
  }
  function edRisco(i) {
    const el = document.querySelectorAll('.pu-ed-q')[i]; if (!el) return
    const tipo = el.querySelector('[data-c=tipo]').value
    const ops = el.querySelector('[data-c=opcoes]')
    const r = tipo === 'escolha' && pulsoRisco(el.querySelector('[data-c=texto]').value, ops ? ops.value.split('\n') : [])
    document.getElementById('pu-ed-risco-' + i).hidden = !r
  }
  async function edPadrao() {
    if (!confirm('Substituir as perguntas atuais pelas 7 perguntas padrão?')) return
    const { data, error } = await db.rpc('fn_pulso_perguntas_padrao')
    if (error) { toast(pulsoErro(error), 'error'); return }
    S.ed = data; desenharEditor()
  }
  async function edSalvar() {
    lerEditor()
    const errEl = document.getElementById('pu-ed-erro')
    const vazia = S.ed.findIndex(q => (q.texto || '').length < 3)
    if (vazia >= 0) { errEl.hidden = false; errEl.textContent = 'A pergunta ' + (vazia + 1) + ' está sem texto.'; return }
    const b = document.getElementById('pu-ed-ok'); b.disabled = true; b.textContent = 'Salvando…'
    const { error } = await db.rpc('fn_pulso_salvar_perguntas', { p_ciclo: S.sel, p_perguntas: S.ed })
    b.disabled = false; b.textContent = 'Salvar perguntas'
    if (error) { errEl.hidden = false; errEl.textContent = pulsoErro(error); return }
    fecharModal(); toast('Perguntas salvas', 'success')
    await carregarLista(true)
  }

  // ── Expectativa (pergunta-espelho) ──────────────────────────────────
  function espelho() {
    const esc_ = S.res.perguntas.filter(q => q.tipo === 'escala')
    const meu = S.res.espelho?.meu || {}
    modal(cabModal('Minha expectativa') + '<div class="modal-body">' +
      '<p class="pu-sub" style="margin:0">Que média (1 a 5) você acha que a equipe vai dar em cada pergunta de escala? Fica só para quem acompanha o ciclo e aparece ao lado do resultado real.</p>' +
      '<div class="pu-esp-l">' + esc_.map(q => {
        const v = meu[q.chave] != null ? Number(meu[q.chave]) : 4
        return '<label for="pu-e-' + q.chave + '"><span>' + esc(q.tema) + '<br><small>' + esc(q.texto) + '</small></span>' +
          '<input type="range" id="pu-e-' + q.chave + '" data-chave="' + q.chave + '" min="1" max="5" step="0.5" value="' + v + '" oninput="this.nextElementSibling.value=Number(this.value).toLocaleString(\'pt-BR\',{minimumFractionDigits:1})">' +
          '<output for="pu-e-' + q.chave + '">' + fmt(v) + '</output></label>'
      }).join('') + '</div>' +
      '</div><div class="modal-footer"><button class="btn btn-secondary" onclick="PU.fecharModal()">Cancelar</button><button class="btn btn-primary" onclick="PU.salvarEspelho()">Salvar</button></div>')
  }

  async function salvarEspelho() {
    const q = {}; document.querySelectorAll('.pu-esp-l input[data-chave]').forEach(i => { q[i.dataset.chave] = Number(i.value) })
    const { error } = await db.rpc('fn_pulso_salvar_espelho', { p_ciclo: S.sel, p_q: q })
    if (error) { toast(pulsoErro(error), 'error'); return }
    fecharModal(); toast('Expectativa registrada', 'success'); await abrir(S.sel)
  }

  // ── QR em tela cheia com contador ao vivo ───────────────────────────
  function qr() {
    const c = cicloSel(); if (!c) return
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
    const c = cicloSel(); if (!c) return
    try { await navigator.clipboard.writeText(urlResposta(c)); toast('Link copiado', 'success') }
    catch (e) { prompt('Copie o link:', urlResposta(c)) }
  }

  // Comentário livre → nova tarefa no Painel de Tarefas (formulário pré-preenchido)
  function tarefa(chave, k) {
    const t = S.res?.textos?.[chave]?.[k]; if (!t) return
    const c = cicloSel()
    const titulo = t.length > 80 ? t.slice(0, 77) + '…' : t
    const desc = 'Ação do ' + (c ? c.titulo : 'Pulso da Equipe') + ' (comentário anônimo):\n"' + t + '"'
    location.href = 'tarefas.html?nova=1&titulo=' + encodeURIComponent(titulo) + '&desc=' + encodeURIComponent(desc)
  }

  window.PU = { abrir, novo, criar, status, espelho, salvarEspelho, qr, fecharQR, copiar, tarefa, fecharModal,
    verPerguntas, editarPerguntas, edAdd, edMover, edRemover, edTipo, edRisco, edPadrao, edSalvar }
  await carregarLista()
})()
