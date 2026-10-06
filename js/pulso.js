// ═══════════════════════════════════════════════════════════════════════
// pulso.js — Pulso da Equipe: gestão (super_admin / coordenação)
// ═══════════════════════════════════════════════════════════════════════
// Cria ciclos, projeta o QR em tela cheia com contador ao vivo e desenha o
// resultado AGREGADO que o banco devolve (fn_pulso_resultado). A tela não
// calcula índice nem decide supressão: < 5 respostas o banco não devolve
// nada além da contagem. Nenhuma leitura direta das tabelas pulso_*.
// Respostas: pages/pulso-responder.html?c=<token> (pública, aberta pelo QR).
// ═══════════════════════════════════════════════════════════════════════

;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { window.location.href = '../index.html'; return }
  if (!['super_admin', 'coordenacao'].includes(appState.perfil)) { window.location.href = 'dashboard.html'; return }

  document.getElementById('app').innerHTML =
    gerarLayout('Pulso da Equipe', 'pulso') +
    '<div class="fade-in pu">' +
      '<div class="pu-cab"><div><h2>Pulso da Equipe</h2>' +
      '<p>Questionário de 6 perguntas objetivas + 1 livre, aberto por QR Code, para medir <b>comprometimento</b> (média) e <b>sintonia</b> (o quanto as respostas convergem). ' +
      'Respostas anônimas: quem tem cadastro conta no grupo do seu perfil; quem não tem entra como convidado. Nada aparece com menos de 5 respostas.</p></div>' +
      '<button class="btn btn-primary" onclick="PU.novo()">+ Novo ciclo</button></div>' +
      '<div class="pu-lay"><div class="pu-lista" id="pu-lista"><p class="pu-vazio">Carregando…</p></div>' +
      '<div id="pu-det"></div></div>' +
    '</div>' + '</div></div></div>'
  carregarLogosSidebar()

  const S = { ciclos: [], sel: null, res: null, timer: null }
  const fmt = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
  const urlResposta = c => new URL('pulso-responder.html?c=' + encodeURIComponent(c.token), location.href).href
  const dataBR = s => s ? new Date(s).toLocaleDateString('pt-BR') : ''

  async function carregarLista(manterSel) {
    const { data, error } = await db.rpc('fn_pulso_ciclos')
    const el = document.getElementById('pu-lista')
    if (error) { el.innerHTML = '<p class="pu-vazio">' + esc(pulsoErro(error)) + '</p>'; return }
    S.ciclos = data || []
    if (!S.ciclos.length) {
      el.innerHTML = '<p class="pu-vazio">Nenhum ciclo ainda. Crie o primeiro e projete o QR Code na próxima reunião de equipe.</p>'
      document.getElementById('pu-det').innerHTML = guiaHTML()
      return
    }
    if (!manterSel || !S.ciclos.find(c => c.id === S.sel)) S.sel = S.ciclos[0].id
    el.innerHTML = S.ciclos.map(c =>
      '<button class="pu-ci' + (c.id === S.sel ? ' sel' : '') + '" onclick="PU.abrir(\'' + c.id + '\')">' +
      '<b>' + esc(c.titulo) + '<span class="pu-st ' + (c.aberto ? 'ab">Aberto' : 'en">Encerrado') + '</span></b>' +
      '<small>' + dataBR(c.criado_em) + ' · ' + c.n_respostas + ' resposta' + (c.n_respostas === 1 ? '' : 's') +
      (c.indices ? ' · C ' + c.indices.comprometimento + ' · S ' + c.indices.sintonia : '') + '</small></button>').join('') +
      historicoHTML()
    await abrir(S.sel)
  }

  // Série histórica: só ciclos com índice (≥ 5 respostas), do mais antigo ao mais novo.
  function historicoHTML() {
    const h = S.ciclos.filter(c => c.indices).slice().reverse()
    if (h.length < 2) return ''
    return '<div class="pu-box" style="margin-top:6px;padding:12px 14px"><h3 style="font-size:13px">Evolução</h3>' +
      '<table class="pu-tab"><thead><tr><th>Ciclo</th><th class="n" title="Comprometimento">C</th><th class="n" title="Sintonia">S</th><th class="n">eNPS</th></tr></thead><tbody>' +
      h.map(c => '<tr><td>' + esc(c.titulo) + '</td><td class="n">' + c.indices.comprometimento + '</td><td class="n">' + c.indices.sintonia + '</td><td class="n">' + c.indices.enps + '</td></tr>').join('') +
      '</tbody></table></div>'
  }

  async function abrir(id) {
    S.sel = id
    document.querySelectorAll('.pu-ci').forEach(b => b.classList.toggle('sel', b.getAttribute('onclick').includes(id)))
    const det = document.getElementById('pu-det')
    det.innerHTML = '<p class="pu-vazio">Carregando resultado…</p>'
    const { data, error } = await db.rpc('fn_pulso_resultado', { p_ciclo: id })
    if (error) { det.innerHTML = '<p class="pu-vazio">' + esc(pulsoErro(error)) + '</p>'; return }
    S.res = data
    det.innerHTML = detalheHTML(S.ciclos.find(c => c.id === id), data)
  }

  // ── Detalhe do ciclo ────────────────────────────────────────────────
  function detalheHTML(c, r) {
    const p = r.participacao || {}
    const cab = '<div class="pu-box"><h3>' + esc(c.titulo) + ' <span class="pu-st ' + (c.aberto ? 'ab">Aberto' : 'en">Encerrado') + '</span></h3>' +
      '<p class="pu-vazio" style="margin-bottom:12px">Criado em ' + dataBR(c.criado_em) +
      (c.fecha_em ? ' · fecha em ' + new Date(c.fecha_em).toLocaleString('pt-BR') : '') +
      ' · convidados: ' + (c.aceita_convidados ? (c.limite_convidados ? 'até ' + c.limite_convidados : 'sem limite') : 'não aceita') + '</p>' +
      '<div class="pu-acoes">' +
        (c.aberto ? '<button class="btn btn-primary btn-sm" onclick="PU.qr()">Projetar QR Code</button>' : '') +
        '<button class="btn btn-secondary btn-sm" onclick="PU.copiar()">Copiar link</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="PU.espelho()">' + (r.espelho?.meu ? 'Rever minha expectativa' : 'Registrar minha expectativa') + '</button>' +
        (c.aberto
          ? '<button class="btn btn-ghost btn-sm" onclick="PU.status(\'encerrado\')">Encerrar ciclo</button>'
          : '<button class="btn btn-ghost btn-sm" onclick="PU.status(\'aberto\')">Reabrir</button>') +
      '</div></div>'

    const part = 'Cadastrados: <b>' + (p.cadastrados || 0) + '</b> de ' + (p.usuarios_ativos || 0) + ' usuários ativos' +
      (p.usuarios_ativos ? ' (' + Math.round((p.cadastrados || 0) / p.usuarios_ativos * 100) + '%)' : '') +
      ' · convidados: <b>' + (p.convidados || 0) + '</b>'

    if (r.suprimido) {
      return cab + '<div class="pu-sup"><b>' + r.n + ' de ' + r.minimo + ' respostas mínimas.</b> O resultado aparece a partir de ' + r.minimo +
        ' respostas para proteger o anonimato.<br>' + part + '</div>' +
        (!r.espelho?.meu ? '<p class="pu-vazio" style="margin-top:12px">Dica de coach: antes de ver o resultado, registre a média que você <b>espera</b> da equipe em cada pergunta (botão acima). A diferença entre expectativa e realidade é um dos melhores assuntos da devolutiva.</p>' : '')
    }

    const g = r.geral
    const kpis = '<div class="pu-kpis">' +
      kpi('Comprometimento', g.comprometimento, '0–100 · média de Q1–Q5') +
      kpi('Sintonia', g.sintonia, '0–100 · convergência das respostas') +
      kpi('eNPS', (g.enps > 0 ? '+' : '') + g.enps, '−100 a +100 · Q6') +
      kpi('Respostas', r.n, part.replace(/<[^>]+>/g, '')) + '</div>'

    return cab + kpis +
      '<div class="pu-box"><h3>Leitura</h3><div class="pu-quad">' + leitura(g) + '</div></div>' +
      perguntasHTML(g, r.espelho) +
      gruposHTML(r.grupos) +
      textosHTML(r.textos) +
      devolutivaHTML()
  }

  function kpi(rot, v, sub) { return '<div class="pu-kpi"><span>' + rot + '</span><b>' + esc(String(v ?? '—')) + '</b><small>' + esc(sub) + '</small></div>' }

  function leitura(g) {
    const c = g.comprometimento >= 70, s = g.sintonia >= 60
    const q = c && s ? ['Equipe de alta performance', 'Comprometida e na mesma frequência. Proteja o que funciona e reconheça publicamente.']
      : c ? ['Esforço disperso', 'As pessoas estão dedicadas, mas enxergam o projeto de formas diferentes. Realinhe prioridades e o “porquê” de cada entrega.']
      : s ? ['Apatia coletiva', 'A equipe concorda — num patamar baixo. Revise propósito, condições de trabalho e reconhecimento.']
      : ['Fragmentação', 'Baixo comprometimento e visões divergentes. Converse com franqueza, em grupos pequenos, antes de cobrar resultado.']
    const pior = g.medias.slice(0, 5).reduce((a, v, k) => v < g.medias[a] ? k : a, 0)
    const div = g.desvios.reduce((a, v, k) => v > g.desvios[a] ? k : a, 0)
    return '<b>' + q[0] + '.</b> ' + q[1] +
      '<br>Ponto mais baixo: <b>' + PULSO_PERGUNTAS[pior].tema + '</b> (média ' + fmt(g.medias[pior]) + '). ' +
      'Onde a equipe mais diverge: <b>' + PULSO_PERGUNTAS[div].tema + '</b> (dispersão ' + fmt(g.desvios[div], 2) + ').'
  }

  // dispersão (desvio-padrão, escala 1–5): < 0,8 alinhada; até 1,2 moderada; acima, dividida
  function tagDisp(d) {
    return d < 0.8 ? '<span class="pu-tag ok">Alinhada</span>' : d <= 1.2 ? '<span class="pu-tag md">Moderada</span>' : '<span class="pu-tag dv">Dividida</span>'
  }

  function perguntasHTML(g, esp) {
    const cores = ['--pu-d1', '--pu-d2', '--pu-d3', '--pu-d4', '--pu-d5']
    const leg = '<div class="pu-leg">' + PULSO_LIKERT.map((r, k) => '<span><i style="background:var(' + cores[k] + ')"></i>' + r + '</span>').join('') + '</div>'
    const linhas = PULSO_PERGUNTAS.slice(0, 5).map((p, k) => {
      const dist = g.distribuicao[k], n = dist.reduce((a, b) => a + b, 0) || 1
      const e = esp?.medias?.[k]
      return '<div class="pu-q"><div class="tx"><em>Q' + (k + 1) + ' · ' + esc(p.tema) + '</em>' + esc(p.texto) + '</div>' +
        '<div class="num">média <b>' + fmt(g.medias[k]) + '</b>' + tagDisp(g.desvios[k]) +
        (e != null ? '<br>expectativa da coordenação: ' + fmt(e) + ' (' + (g.medias[k] - e >= 0 ? '+' : '') + fmt(g.medias[k] - e) + ')' : '') + '</div>' +
        '<div class="pu-pilha" role="img" aria-label="' + esc(dist.map((v, j) => PULSO_LIKERT[j] + ': ' + v).join('; ')) + '">' +
        dist.map((v, j) => v ? '<i style="flex:' + v + ';background:var(' + cores[j] + ')" title="' + esc(PULSO_LIKERT[j] + ': ' + v + ' (' + Math.round(v / n * 100) + '%)') + '"></i>' : '').join('') +
        '</div></div>'
    }).join('')
    const d6 = g.distribuicao[5], n6 = d6.reduce((a, b) => a + b, 0) || 1
    const det = d6.slice(0, 7).reduce((a, b) => a + b, 0), neu = d6[7] + d6[8], pro = d6[9] + d6[10]
    const q6 = '<div class="pu-q"><div class="tx"><em>Q6 · Recomendação</em>' + esc(PULSO_PERGUNTAS[5].texto) + '</div>' +
      '<div class="num">média <b>' + fmt(g.medias[5]) + '</b> · eNPS <b>' + (g.enps > 0 ? '+' : '') + g.enps + '</b></div>' +
      '<div class="pu-pilha" role="img" aria-label="Detratores ' + det + ', neutros ' + neu + ', promotores ' + pro + '">' +
      [[det, '--pu-d1', 'Detratores (0–6)'], [neu, '--pu-d3', 'Neutros (7–8)'], [pro, '--pu-d5', 'Promotores (9–10)']]
        .map(([v, c, r]) => v ? '<i style="flex:' + v + ';background:var(' + c + ')" title="' + r + ': ' + v + ' (' + Math.round(v / n6 * 100) + '%)"></i>' : '').join('') +
      '</div></div>'
    return '<div class="pu-box"><h3>Por pergunta</h3>' + leg + linhas + q6 +
      '<p class="pu-vazio" style="margin-top:8px;font-size:12px">Na Q6: laranja = detratores (0–6), cinza = neutros (7–8), azul = promotores (9–10). Passe o mouse nas barras para ver os números.</p></div>'
  }

  function gruposHTML(gr) {
    if (!gr || !gr.length) return '<div class="pu-box"><h3>Por perfil</h3><p class="pu-vazio">Nenhum perfil chegou a 5 respostas — o recorte fica oculto para proteger o anonimato.</p></div>'
    return '<div class="pu-box"><h3>Por perfil</h3><div style="overflow-x:auto"><table class="pu-tab"><thead><tr><th>Grupo</th><th class="n">Respostas</th>' +
      PULSO_PERGUNTAS.slice(0, 5).map((p, k) => '<th class="n" title="' + esc(p.texto) + '">Q' + (k + 1) + '</th>').join('') +
      '<th class="n">Compr.</th><th class="n">Sintonia</th><th class="n">eNPS</th></tr></thead><tbody>' +
      gr.map(x => '<tr><td>' + esc(PULSO_GRUPOS[x.grupo] || x.grupo) + '</td><td class="n">' + x.n + '</td>' +
        x.medias.slice(0, 5).map(v => '<td class="n">' + fmt(v) + '</td>').join('') +
        '<td class="n">' + x.comprometimento + '</td><td class="n">' + x.sintonia + '</td><td class="n">' + x.enps + '</td></tr>').join('') +
      '</tbody></table></div><p class="pu-vazio" style="margin-top:8px;font-size:12px">Perfis com menos de 5 respostas entram em “Demais perfis” (quando somam 5) ou ficam só no total.</p></div>'
  }

  function textosHTML(t) {
    if (!t || !t.length) return '<div class="pu-box"><h3>Uma mudança para o próximo mês</h3><p class="pu-vazio">Nenhum comentário livre.</p></div>'
    return '<div class="pu-box"><h3>Uma mudança para o próximo mês (' + t.length + ')</h3>' +
      '<p class="pu-vazio" style="font-size:12px;margin-bottom:4px">Ordem embaralhada e sem perfil. Agrupe os temas que se repetem e transforme 2 ou 3 em compromissos.</p>' +
      t.map((x, k) => '<div class="pu-txt"><p>' + esc(x) + '</p><button class="btn btn-ghost btn-xs" onclick="PU.tarefa(' + k + ')">Criar tarefa</button></div>').join('') + '</div>'
  }

  function devolutivaHTML() {
    return '<div class="pu-box"><h3>Roteiro da devolutiva (10 min)</h3><ol class="pu-vazio" style="padding-left:18px">' +
      '<li>Projete esta tela e leia a <b>Leitura</b> em voz alta — sem defender nem justificar.</li>' +
      '<li>Pergunte: “O que mais surpreendeu vocês?”</li>' +
      '<li>Na pergunta marcada como <b>Dividida</b>: “Por que enxergamos isso de formas tão diferentes?”</li>' +
      '<li>Leia os comentários livres e agrupe os temas repetidos.</li>' +
      '<li>Escolham no máximo 3 ações, cada uma com responsável e prazo (botão “Criar tarefa”).</li>' +
      '<li>No próximo ciclo, comece mostrando o que foi feito com estas ações.</li></ol>' +
      '<p class="pu-vazio" style="margin-top:8px"><b>Regra de ouro:</b> nunca pergunte “quem respondeu isso?”.</p></div>'
  }

  function guiaHTML() {
    return '<div class="pu-box"><h3>Como aplicar</h3><ol class="pu-vazio" style="padding-left:18px">' +
      '<li><b>Abertura (3 min):</b> explique que o objetivo é ouvir para ajustar, não avaliar pessoas; as respostas são anônimas e o resultado volta para todos.</li>' +
      '<li><b>Aplicação (5 min):</b> projete o QR Code em tela cheia. Quem lidera não olha os celulares.</li>' +
      '<li><b>Devolutiva (10 min, no mesmo dia ou em até 48h):</b> projete o resultado e siga o roteiro.</li>' +
      '<li><b>Compromissos (7 min):</b> até 3 ações viram tarefas com responsável e prazo.</li>' +
      '<li><b>Ritmo:</b> repita a cada 30 a 45 dias com as mesmas perguntas para ver a tendência.</li></ol></div>'
  }

  // ── Modais ──────────────────────────────────────────────────────────
  function modal(html) { document.getElementById('pu-modal-c').innerHTML = html; document.getElementById('pu-modal').classList.add('aberto') }
  function fecharModal() { document.getElementById('pu-modal').classList.remove('aberto') }
  function cabModal(t) { return '<div class="modal-header"><div class="modal-title">' + esc(t) + '</div><button class="modal-close" onclick="PU.fecharModal()">&#x2715;</button></div>' }

  function novo() {
    const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    modal(cabModal('Novo ciclo') + '<div class="modal-body">' +
      '<div class="form-group"><label class="form-label">Título</label><input class="form-control" id="pu-f-tit" maxlength="120" value="Pulso · ' + esc(mes) + '"></div>' +
      '<div class="form-group"><label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" id="pu-f-conv" checked> Aceitar convidados (sem cadastro)</label></div>' +
      '<div class="form-group"><label class="form-label">Limite de convidados (opcional)</label><input class="form-control" id="pu-f-lim" type="number" min="1" placeholder="sem limite"><div class="form-hint">Útil quando o QR fica exposto fora da sala.</div></div>' +
      '<div class="form-group"><label class="form-label">Fechar automaticamente em (opcional)</label><input class="form-control" id="pu-f-fecha" type="datetime-local"></div>' +
      '</div><div class="modal-footer"><button class="btn btn-secondary" onclick="PU.fecharModal()">Cancelar</button><button class="btn btn-primary" id="pu-f-ok" onclick="PU.criar()">Criar ciclo</button></div>')
  }

  async function criar() {
    const tit = document.getElementById('pu-f-tit').value.trim()
    if (tit.length < 3) { toast('Informe um título.', 'warning'); return }
    const lim = document.getElementById('pu-f-lim').value
    const fecha = document.getElementById('pu-f-fecha').value
    const b = document.getElementById('pu-f-ok'); b.disabled = true
    const { data, error } = await db.rpc('fn_pulso_criar', {
      p_titulo: tit, p_aceita_convidados: document.getElementById('pu-f-conv').checked,
      p_limite_convidados: lim ? parseInt(lim, 10) : null,
      p_fecha_em: fecha ? new Date(fecha).toISOString() : null,
    })
    b.disabled = false
    if (error) { toast(pulsoErro(error), 'error'); return }
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
    const meu = S.res?.espelho?.meu || [4, 4, 4, 4, 4]
    modal(cabModal('Minha expectativa') + '<div class="modal-body">' +
      '<p class="pu-vazio">Que média (1 a 5) você acha que a equipe vai dar em cada pergunta? Fica registrada só para a coordenação e aparece ao lado do resultado real.</p>' +
      '<div class="pu-esp-l">' + PULSO_PERGUNTAS.slice(0, 5).map((p, k) =>
        '<label for="pu-e' + k + '" title="' + esc(p.texto) + '">Q' + (k + 1) + ' · ' + esc(p.tema) + '<input type="range" id="pu-e' + k + '" min="1" max="5" step="0.5" value="' + meu[k] + '" oninput="this.closest(\'.pu-esp-l\').querySelector(\'#pu-ev' + k + '\').textContent=Number(this.value).toLocaleString(\'pt-BR\',{minimumFractionDigits:1})"></label>' +
        '<b id="pu-ev' + k + '" style="text-align:right">' + fmt(meu[k]) + '</b>').join('') + '</div>' +
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
    document.getElementById('pu-qr-n').textContent = c.n_respostas
    document.getElementById('pu-qr').classList.add('aberto')
    try { document.documentElement.requestFullscreen?.() } catch (e) {}
    clearInterval(S.timer)
    S.timer = setInterval(async () => {
      const { data } = await db.rpc('fn_pulso_contagem', { p_ciclo: c.id })
      if (data != null) document.getElementById('pu-qr-n').textContent = data
    }, 4000)
  }
  async function fecharQR() {
    clearInterval(S.timer); S.timer = null
    document.getElementById('pu-qr').classList.remove('aberto')
    try { if (document.fullscreenElement) await document.exitFullscreen() } catch (e) {}
    await carregarLista(true)
  }
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.timer) fecharQR() })

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
