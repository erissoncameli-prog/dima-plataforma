// ═══════════════════════════════════════════════════════════════════════
// pulso-responder.js — página pública do Pulso da Equipe (aberta pelo QR)
// ═══════════════════════════════════════════════════════════════════════
// Quem tem sessão responde no perfil do cadastro; quem não tem pode entrar
// (login aqui mesmo) ou seguir como convidado. O banco decide o perfil e
// barra resposta repetida (por usuário; convidado, por aparelho).
// A resposta não leva usuário nem hora — ver 20261006_pulso_equipe.sql.
// ═══════════════════════════════════════════════════════════════════════

;(async function () {
  const el = document.getElementById('pr')
  const token = new URLSearchParams(location.search).get('c') || ''
  const S = { info: null, passo: 0, resp: {}, loginAqui: false, enviando: false }

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

  function cartao(html) { el.innerHTML = '<div class="cartao">' + html + '</div>' }
  function aviso(titulo, msg) { cartao('<h2>' + esc(titulo) + '</h2><p class="suave">' + esc(msg) + '</p>') }

  async function carregar() {
    if (!token) { aviso('QR Code incompleto', 'O endereço não traz o código do questionário. Leia o QR Code novamente.'); return }
    const { data, error } = await db.rpc('fn_publico_pulso_ciclo', { p_token: token, p_dispositivo: dispositivo() })
    if (error) { aviso('Sem conexão', 'Não foi possível abrir o questionário. Verifique a internet e recarregue.'); return }
    S.info = data
    if (!data.encontrado) { aviso('Questionário não encontrado', PULSO_ERROS['pulso:ciclo_inexistente']); return }
    document.getElementById('pr-sub').textContent = data.titulo
    if (!data.aberto) { aviso('Questionário encerrado', 'Obrigado pelo interesse. O resultado será apresentado à equipe.'); return }
    if (data.ja_respondeu) { telaFim(true); return }
    telaIdentificacao()
  }

  // ── 1. Identificação ───────────────────────────────────────────────
  async function telaIdentificacao(msgErro) {
    const i = S.info
    const sigilo = '<p class="suave" style="margin-top:10px">Suas respostas são <b>anônimas</b>: o sistema registra apenas que você participou, e a resposta entra só no total do seu grupo de perfil. Resultados aparecem apenas com 5 respostas ou mais.</p>'
    if (i.cadastrado) {
      const { data: { session } } = await db.auth.getSession()
      cartao(
        '<h2>Você tem cadastro na plataforma</h2>' +
        '<p class="suave">Conectado como ' + esc(session?.user?.email || '') + '</p>' +
        '<span class="selo">Grupo: ' + esc(PULSO_GRUPOS[i.perfil_grupo] || i.perfil_grupo) + '</span>' +
        sigilo +
        '<button class="btn" id="pr-ir">Começar</button>' +
        '<button class="lnk" id="pr-sair">Não sou eu — sair desta conta</button>')
      document.getElementById('pr-ir').onclick = () => { S.passo = 0; telaPergunta() }
      document.getElementById('pr-sair').onclick = async () => { await db.auth.signOut(); await carregar() }
      return
    }
    cartao(
      '<h2>Antes de começar</h2>' +
      '<p class="suave">Você já tem cadastro na plataforma DIMA?</p>' +
      '<button class="btn" id="pr-tenho">Sim, tenho cadastro — entrar</button>' +
      (i.aceita_convidados
        ? '<button class="btn sec" id="pr-conv">Não tenho — responder como convidado</button>'
        : '<p class="erro">Este questionário aceita apenas pessoas com cadastro.</p>') +
      sigilo + (msgErro ? '<p class="erro">' + esc(msgErro) + '</p>' : ''))
    document.getElementById('pr-tenho').onclick = telaLogin
    const conv = document.getElementById('pr-conv')
    if (conv) conv.onclick = () => { S.passo = 0; telaPergunta() }
  }

  function telaLogin(msgErro) {
    cartao(
      '<h2>Entrar</h2><p class="suave">Use o mesmo e-mail e senha da plataforma. Ao terminar, você sai automaticamente deste aparelho.</p>' +
      '<form id="pr-form" autocomplete="on">' +
      '<label for="pr-email">E-mail</label><input id="pr-email" type="email" autocomplete="username" required>' +
      '<label for="pr-senha">Senha</label><input id="pr-senha" type="password" autocomplete="current-password" required>' +
      (typeof msgErro === 'string' ? '<p class="erro">' + esc(msgErro) + '</p>' : '') +
      '<button class="btn" type="submit" id="pr-entrar">Entrar</button></form>' +
      '<button class="lnk" id="pr-voltar">Voltar</button>')
    document.getElementById('pr-voltar').onclick = () => telaIdentificacao()
    document.getElementById('pr-form').onsubmit = async ev => {
      ev.preventDefault()
      const b = document.getElementById('pr-entrar'); b.disabled = true; b.textContent = 'Entrando…'
      const { error } = await db.auth.signInWithPassword({
        email: document.getElementById('pr-email').value.trim(),
        password: document.getElementById('pr-senha').value,
      })
      if (error) { telaLogin('E-mail ou senha incorretos.'); return }
      S.loginAqui = true
      await carregar()
    }
  }

  // ── 2. Perguntas (uma por tela) ────────────────────────────────────
  function telaPergunta() {
    const p = PULSO_PERGUNTAS[S.passo]
    const total = PULSO_PERGUNTAS.length
    const v = S.resp[p.chave]
    let corpo = ''
    if (p.escala === 'livre') {
      corpo = '<textarea id="pr-txt" maxlength="1000" placeholder="Opcional. Escreva com suas palavras.">' + esc(v || '') + '</textarea>' +
        '<div class="cont"><span id="pr-cont">' + (v || '').length + '</span>/1000</div>' +
        '<p class="suave" style="margin-top:6px">Evite citar nomes ou detalhes que identifiquem você ou colegas.</p>'
    } else if (p.escala === 'nps') {
      corpo = '<div class="nps">' + Array.from({ length: 11 }, (_, n) =>
        '<button class="op" data-v="' + n + '" aria-pressed="' + (v === n) + '">' + n + '</button>').join('') + '</div>' +
        '<div class="nps-leg"><span>0 · nada provável</span><span>10 · muito provável</span></div>'
    } else {
      corpo = '<div class="opcoes">' + PULSO_LIKERT.map((r, k) =>
        '<button class="op" data-v="' + (k + 1) + '" aria-pressed="' + (v === k + 1) + '"><b>' + (k + 1) + '</b>' + esc(r) + '</button>').join('') + '</div>'
    }
    const ultimo = S.passo === total - 1
    cartao(
      '<div class="progresso"><i style="width:' + Math.round((S.passo + 1) / total * 100) + '%"></i></div>' +
      '<div class="tema">' + (S.passo + 1) + ' de ' + total + ' · ' + esc(p.tema) + '</div>' +
      '<div class="pergunta">' + esc(p.texto) + '</div>' + corpo +
      '<div id="pr-erro"></div>' +
      '<div class="nav">' +
        (S.passo > 0 ? '<button class="btn sec" id="pr-ant">Voltar</button>' : '') +
        (p.escala === 'livre' || ultimo ? '<button class="btn" id="pr-prox">' + (ultimo ? 'Enviar respostas' : 'Avançar') + '</button>' : '') +
      '</div>')

    el.querySelectorAll('.op').forEach(b => b.onclick = () => {
      S.resp[p.chave] = Number(b.dataset.v)
      el.querySelectorAll('.op').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
      // escolha avança sozinha (menos toques no celular)
      setTimeout(() => { S.passo++; telaPergunta() }, 180)
    })
    const txt = document.getElementById('pr-txt')
    if (txt) txt.oninput = () => { S.resp.texto = txt.value; document.getElementById('pr-cont').textContent = txt.value.length }
    const ant = document.getElementById('pr-ant'); if (ant) ant.onclick = () => { S.passo--; telaPergunta() }
    const prox = document.getElementById('pr-prox'); if (prox) prox.onclick = enviar
  }

  // ── 3. Envio ───────────────────────────────────────────────────────
  async function enviar() {
    if (S.enviando) return
    const falta = PULSO_PERGUNTAS.findIndex(p => p.escala !== 'livre' && S.resp[p.chave] == null)
    if (falta >= 0) { S.passo = falta; telaPergunta(); document.getElementById('pr-erro').innerHTML = '<p class="erro">Responda esta pergunta para enviar.</p>'; return }
    S.enviando = true
    const b = document.getElementById('pr-prox'); if (b) { b.disabled = true; b.textContent = 'Enviando…' }
    const { error } = await db.rpc('fn_publico_pulso_responder', {
      p_token: token, p_respostas: S.resp, p_dispositivo: dispositivo(),
    })
    S.enviando = false
    if (error) {
      const msg = pulsoErro(error)
      if (/ja_respondeu/.test(error.message)) { telaFim(true); return }
      if (b) { b.disabled = false; b.textContent = 'Enviar respostas' }
      document.getElementById('pr-erro').innerHTML = '<p class="erro">' + esc(msg) + '</p>'
      return
    }
    // login feito só para responder: não deixar a sessão aberta no aparelho
    if (S.loginAqui) { try { await db.auth.signOut() } catch (e) {} }
    telaFim(false)
  }

  function telaFim(jaTinha) {
    el.innerHTML = '<div class="cartao ok">' +
      '<div class="ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div>' +
      '<h2>' + (jaTinha ? 'Você já respondeu' : 'Obrigado!') + '</h2>' +
      '<p class="suave">' + (jaTinha
        ? 'Sua resposta a este questionário já está registrada.'
        : 'Sua resposta foi registrada de forma anônima. O resultado consolidado será apresentado e discutido com a equipe.') +
      '</p></div>'
  }

  await carregar()
})()
