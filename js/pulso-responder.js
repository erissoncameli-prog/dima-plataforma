// ═══════════════════════════════════════════════════════════════════════
// pulso-responder.js — página pública do Pulso da Equipe (aberta pelo QR)
// ═══════════════════════════════════════════════════════════════════════
// Quem tem sessão responde no perfil do cadastro; quem não tem pode entrar
// (login aqui mesmo) ou seguir como convidado. O banco decide o perfil e
// barra resposta repetida (por usuário; convidado, por aparelho).
// A resposta não leva usuário nem hora — ver 20261006_pulso_equipe.sql.
// As perguntas vêm do ciclo (fn_publico_pulso_ciclo → perguntas); o banco
// valida tudo de novo ao gravar. Teclado: 1–5 (escala), 1–9 (escolha) e
// 0–9 (nota; "1" e "0" seguidos = 10).
// ═══════════════════════════════════════════════════════════════════════

const PR_IC = {
  entrar: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  convidado: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  seta: '<path d="m9 18 6-6-6-6"/>',
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>',
  perfil: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  alerta: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  ok: '<path d="M20 6 9 17l-5-5"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  voltar: '<path d="m15 18-6-6 6-6"/>',
}
function prIc(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (PR_IC[n] || '') + '</svg>' }

;(async function () {
  const el = document.getElementById('pr')
  const anuncio = document.getElementById('pr-anuncio')
  const token = new URLSearchParams(location.search).get('c') || ''
  const S = { info: null, passo: 0, resp: {}, loginAqui: false, enviando: false, tecla: null }

  // Identificador aleatório do aparelho (convidado). Não identifica a pessoa:
  // o banco guarda só o hash dele por ciclo, para barrar a 2ª resposta.
  function dispositivo() {
    try {
      let d = localStorage.getItem('pulso_dispositivo')
      if (!d) { d = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now(); localStorage.setItem('pulso_dispositivo', d) }
      return d
    } catch (e) {
      if (!S._disp) S._disp = 'sem-storage-' + Math.random().toString(36).slice(2) + Date.now()
      return S._disp
    }
  }

  function cartao(html, anim) {
    el.innerHTML = '<div class="cartao ' + (anim || 'entra') + '">' + html + '</div>'
    const h = el.querySelector('h2, .pergunta'); if (h) { h.setAttribute('tabindex', '-1'); anuncio.textContent = h.textContent }
  }
  function aviso(titulo, msg) { cartao('<h2>' + esc(titulo) + '</h2><p class="suave">' + esc(msg) + '</p>') }
  function erroHTML(msg) { return '<p class="erro" role="alert">' + prIc('alerta') + '<span>' + esc(msg) + '</span></p>' }
  const sigilo = '<div class="sigilo">' + prIc('escudo') + '<span>Suas respostas são <b>anônimas</b>: registramos só que você participou, e a resposta entra no total do seu grupo. Resultados aparecem apenas com 5 respostas ou mais.</span></div>'

  async function carregar() {
    if (!token) { aviso('QR Code incompleto', 'O endereço não traz o código do questionário. Leia o QR Code novamente.'); return }
    const { data, error } = await db.rpc('fn_publico_pulso_ciclo', { p_token: token, p_dispositivo: dispositivo() })
    if (error) { aviso('Sem conexão', 'Não foi possível abrir o questionário. Verifique a internet e recarregue a página.'); return }
    S.info = data
    if (!data.encontrado) { aviso('Questionário não encontrado', PULSO_ERROS['pulso:ciclo_inexistente']); return }
    document.getElementById('pr-sub').textContent = data.titulo
    if (!data.aberto) { aviso('Questionário encerrado', 'Obrigado pelo interesse. O resultado será apresentado à equipe.'); return }
    if (data.ja_respondeu) { telaFim(true); return }
    telaIdentificacao()
  }

  // ── 1. Identificação ───────────────────────────────────────────────
  async function telaIdentificacao() {
    const i = S.info
    if (i.cadastrado) {
      const { data: { session } } = await db.auth.getSession()
      cartao(
        '<h2>Olá! Você está conectado</h2>' +
        '<p class="suave">' + esc(session?.user?.email || '') + '</p>' +
        '<span class="selo">' + prIc('perfil') + 'Grupo: ' + esc(PULSO_GRUPOS[i.perfil_grupo] || i.perfil_grupo) + '</span>' +
        sigilo +
        '<button class="btn" id="pr-ir">Começar ' + prIc('seta') + '</button>' +
        '<button class="lnk" id="pr-sair">Não sou eu — sair desta conta</button>')
      document.getElementById('pr-ir').onclick = () => { S.passo = 0; telaPergunta() }
      document.getElementById('pr-sair').onclick = async () => { await db.auth.signOut(); await carregar() }
      return
    }
    cartao(
      '<h2>Antes de começar</h2>' +
      '<p class="suave">Você tem cadastro na plataforma DIMA?</p>' +
      '<button class="escolha" id="pr-tenho"><span class="bolha">' + prIc('entrar') + '</span><span><b>Tenho cadastro</b><small>Entrar com e-mail e senha</small></span>' + prIc('seta').replace('class="ic"', 'class="ic seta"') + '</button>' +
      (i.aceita_convidados
        ? '<button class="escolha" id="pr-conv"><span class="bolha">' + prIc('convidado') + '</span><span><b>Não tenho cadastro</b><small>Responder como convidado</small></span>' + prIc('seta').replace('class="ic"', 'class="ic seta"') + '</button>'
        : erroHTML('Este questionário aceita apenas pessoas com cadastro.')) +
      sigilo)
    document.getElementById('pr-tenho').onclick = () => telaLogin()
    const conv = document.getElementById('pr-conv')
    if (conv) conv.onclick = () => { S.passo = 0; telaPergunta() }
  }

  function telaLogin(msgErro) {
    cartao(
      '<h2>Entrar</h2><p class="suave">Use o mesmo e-mail e senha da plataforma. Ao enviar as respostas, você sai automaticamente deste aparelho.</p>' +
      '<form id="pr-form" autocomplete="on" novalidate>' +
      '<label for="pr-email">E-mail</label><input id="pr-email" type="email" inputmode="email" autocomplete="username" required>' +
      '<label for="pr-senha">Senha</label><input id="pr-senha" type="password" autocomplete="current-password" required>' +
      (msgErro ? erroHTML(msgErro) : '') +
      '<button class="btn" type="submit" id="pr-entrar">' + prIc('entrar') + 'Entrar</button></form>' +
      '<button class="lnk" id="pr-voltar">Voltar</button>', msgErro ? 'x' : 'entra')
    document.getElementById(msgErro ? 'pr-senha' : 'pr-email').focus()
    document.getElementById('pr-voltar').onclick = () => telaIdentificacao()
    document.getElementById('pr-form').onsubmit = async ev => {
      ev.preventDefault()
      const email = document.getElementById('pr-email').value.trim(), senha = document.getElementById('pr-senha').value
      if (!email || !senha) { telaLogin('Informe e-mail e senha.'); return }
      const b = document.getElementById('pr-entrar'); b.disabled = true; b.textContent = 'Entrando…'
      const { error } = await db.auth.signInWithPassword({ email, password: senha })
      if (error) { telaLogin('E-mail ou senha incorretos.'); document.getElementById('pr-email').value = email; return }
      S.loginAqui = true
      await carregar()
    }
  }

  // ── 2. Perguntas (uma por tela) — vêm do ciclo (S.info.perguntas) ────
  const perguntas = () => (S.info && S.info.perguntas) || []
  const ehEscolha = p => p.tipo === 'escala' || p.tipo === 'nps' || p.tipo === 'escolha'

  function telaPergunta(dir) {
    const lista = perguntas()
    const p = lista[S.passo]
    const total = lista.length
    const v = S.resp[p.chave]
    let corpo = ''
    if (p.tipo === 'texto') {
      corpo = '<label class="sr" for="pr-txt">Sua resposta</label><textarea id="pr-txt" maxlength="1000" placeholder="' + (p.obrigatoria ? 'Escreva com suas palavras.' : 'Opcional. Escreva com suas palavras.') + '">' + esc(v || '') + '</textarea>' +
        '<div class="cont"><span id="pr-cont">' + (v || '').length + '</span>/1000</div>' +
        '<p class="dica">Evite citar nomes ou detalhes que identifiquem você ou colegas.</p>'
    } else if (p.tipo === 'nps') {
      corpo = '<div class="nps" role="group" aria-label="Nota de 0 a 10">' + Array.from({ length: 11 }, (_, n) =>
        '<button type="button" class="op" data-v="' + n + '" aria-pressed="' + (v === n) + '">' + n + '</button>').join('') + '</div>' +
        '<div class="nps-leg" aria-hidden="true"><span>0 · nada provável</span><span>10 · muito provável</span></div>'
    } else if (p.tipo === 'escolha') {
      corpo = '<div class="opcoes" role="group" aria-label="Escolha uma opção">' + p.opcoes.map((r, k) =>
        '<button type="button" class="op" data-v="' + k + '" aria-pressed="' + (v === k) + '"><b>' + (k < 9 ? k + 1 : '•') + '</b>' + esc(r) + '</button>').join('') + '</div>'
    } else {
      corpo = '<div class="opcoes" role="group" aria-label="Escala de concordância">' + PULSO_LIKERT.map((r, k) =>
        '<button type="button" class="op" data-v="' + (k + 1) + '" aria-pressed="' + (v === k + 1) + '"><b>' + (k + 1) + '</b>' + esc(r) + '</button>').join('') + '</div>'
    }
    const ultimo = S.passo === total - 1
    const pct = Math.round((S.passo + 1) / total * 100)
    // botão de avançar: texto, pergunta opcional ou a última
    const mostraProx = p.tipo === 'texto' || !p.obrigatoria || ultimo
    cartao(
      '<div class="prog-l"><span>' + esc(p.tema || '') + (p.obrigatoria ? '' : ' · opcional') + '</span><span>' + (S.passo + 1) + ' de ' + total + '</span></div>' +
      '<div class="progresso" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + (S.passo + 1) + '" aria-label="Progresso"><i style="width:' + pct + '%"></i></div>' +
      '<h2 class="pergunta">' + esc(p.texto) + '</h2>' + corpo +
      '<div id="pr-erro"></div>' +
      '<div class="nav">' +
        (S.passo > 0 ? '<button type="button" class="btn sec" id="pr-ant" aria-label="Pergunta anterior">' + prIc('voltar') + '</button>' : '') +
        (mostraProx ? '<button type="button" class="btn" id="pr-prox">' + (ultimo ? prIc('enviar') + 'Enviar respostas' : (ehEscolha(p) && v == null ? 'Pular' : 'Avançar')) + '</button>' : '') +
      '</div>', dir === 'volta' ? 'volta' : 'entra')

    el.querySelectorAll('.op').forEach(b => b.onclick = () => escolher(Number(b.dataset.v)))
    const txt = document.getElementById('pr-txt')
    if (txt) { txt.oninput = () => { S.resp[p.chave] = txt.value; document.getElementById('pr-cont').textContent = txt.value.length }; txt.focus() }
    const ant = document.getElementById('pr-ant'); if (ant) ant.onclick = () => { S.passo--; telaPergunta('volta') }
    const prox = document.getElementById('pr-prox')
    if (prox) prox.onclick = () => {
      if (ultimo) { enviar(); return }
      if (p.obrigatoria && (S.resp[p.chave] == null || String(S.resp[p.chave]).trim() === '')) {
        document.getElementById('pr-erro').innerHTML = erroHTML('Esta pergunta é obrigatória.'); return
      }
      S.passo++; telaPergunta()
    }
    const sel = el.querySelector('.op[aria-pressed="true"]') || el.querySelector('.op'); if (sel && !txt) sel.focus({ preventScroll: true })
  }

  function escolher(n) {
    const lista = perguntas(), p = lista[S.passo]
    S.resp[p.chave] = n
    el.querySelectorAll('.op').forEach(x => x.setAttribute('aria-pressed', String(Number(x.dataset.v) === n)))
    // escolha avança sozinha (menos toques no celular); na última, espera o "Enviar"
    if (S.passo < lista.length - 1) { clearTimeout(S._av); S._av = setTimeout(() => { S.passo++; telaPergunta() }, 220) }
  }

  // atalhos de teclado nas perguntas objetivas
  document.addEventListener('keydown', ev => {
    const p = perguntas()[S.passo]
    if (!p || !ehEscolha(p) || !el.querySelector('.op') || ev.ctrlKey || ev.metaKey || ev.altKey || !/^[0-9]$/.test(ev.key)) return
    const d = Number(ev.key)
    if (p.tipo === 'nps') {
      if (S.tecla === 1 && d === 0) { S.tecla = null; escolher(10); return }
      S.tecla = d; clearTimeout(S._t); S._t = setTimeout(() => { if (S.tecla === d) { S.tecla = null; escolher(d) } }, d === 1 ? 600 : 0)
    } else if (p.tipo === 'escolha') { if (d >= 1 && d <= Math.min(9, p.opcoes.length)) escolher(d - 1) }
    else if (d >= 1 && d <= 5) escolher(d)
  })

  // ── 3. Envio ───────────────────────────────────────────────────────
  async function enviar() {
    if (S.enviando) return
    const lista = perguntas()
    const falta = lista.findIndex(p => p.obrigatoria && (S.resp[p.chave] == null || String(S.resp[p.chave]).trim() === ''))
    if (falta >= 0) { S.passo = falta; telaPergunta('volta'); document.getElementById('pr-erro').innerHTML = erroHTML('Responda esta pergunta para enviar.'); return }
    S.enviando = true
    const b = document.getElementById('pr-prox'); if (b) { b.disabled = true; b.textContent = 'Enviando…' }
    const { error } = await db.rpc('fn_publico_pulso_responder', {
      p_token: token, p_respostas: S.resp, p_dispositivo: dispositivo(),
    })
    S.enviando = false
    if (error) {
      if (/ja_respondeu/.test(error.message)) { telaFim(true); return }
      if (b) { b.disabled = false; b.innerHTML = prIc('enviar') + 'Enviar respostas' }
      document.getElementById('pr-erro').innerHTML = erroHTML(pulsoErro(error))
      return
    }
    // login feito só para responder: não deixar a sessão aberta no aparelho
    if (S.loginAqui) { try { await db.auth.signOut() } catch (e) {} }
    telaFim(false)
  }

  function telaFim(jaTinha) {
    S.passo = -1
    el.innerHTML = '<div class="cartao ok entra">' +
      '<div class="marcador">' + prIc('ok') + '</div>' +
      '<h2 tabindex="-1">' + (jaTinha ? 'Você já respondeu' : 'Obrigado!') + '</h2>' +
      '<p class="suave">' + (jaTinha
        ? 'Sua resposta a este questionário já está registrada.'
        : 'Sua resposta foi registrada de forma anônima. O resultado consolidado será apresentado e discutido com a equipe.') +
      '</p></div>'
    anuncio.textContent = jaTinha ? 'Você já respondeu' : 'Obrigado! Resposta registrada.'
  }

  await carregar()
})()
