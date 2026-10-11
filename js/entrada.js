// Tela de entrada (index.html). Estilo em css/entrada.css; tema = diag_tema (aplicado no <head>).
// Conteúdo da vitrine (fotos, projeto, logos) vem de Dados do sistema (configuracoes_sistema) e fica
// guardado no aparelho para a próxima abertura — não há mais fotos fixas no HTML (baixava tudo duas vezes).
// Lógica de entrar igual à anterior: conta desativada sai, 1º acesso vai para trocar-senha, dima_redirect.
;(function () {
  const SUPABASE_URL = 'https://wfymnmlinonvdqfucjya.supabase.co'
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmeW1ubWxpbm9udmRxZnVjanlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MzM1NzksImV4cCI6MjA5MDMwOTU3OX0.eC6T9VQ6OzF9mISEGy_pgbIbrOAnG4xp2z6WN-sCMt8'
  const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  const $ = id => document.getElementById(id)
  const ls = { ler(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, gravar(k, v) { try { localStorage.setItem(k, v) } catch (e) {} } }

  // ── Textos (PT · EN · ES) ────────────────────────────────────────────────
  const TX = {
    pt: { titulo: 'Entrar na plataforma', sub: 'Acesse com suas credenciais institucionais', email: 'E-mail', senha: 'Senha', btn: 'Entrar', entrando: 'Entrando…',
      esqueci: 'Esqueceu a senha?', caps: 'Caps Lock ligado', ou: 'ou', publico: 'Visualizar painel público', parceiros: 'Realização e parceiros',
      restrito: 'Acesso restrito a usuários autorizados', claro: 'Claro', escuro: 'Escuro', tema: 'Tema', idioma: 'Idioma',
      mostrar: 'Mostrar senha', ocultar: 'Ocultar senha', pausar: 'Pausar fotos', continuar: 'Continuar fotos', foto: (i, n) => `Foto ${i} de ${n}`,
      vazio: 'Informe o e-mail e a senha.', email_inv: 'Informe um e-mail válido.',
      erro_cred: 'E-mail ou senha incorretos.', erro_gen: 'Não foi possível conectar. Verifique a internet e tente novamente.',
      erro_conf: 'E-mail não confirmado. Peça ao administrador para reenviar a confirmação.', erro_muitas: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      erro_desat: 'Conta desativada. Entre em contato com o administrador.',
      voltar: 'Voltar para entrar', ped_titulo: 'Pedir nova senha', ped_btn: 'Enviar pedido', enviando: 'Enviando…',
      ped_sub: 'Informe o e-mail da sua conta. O administrador da plataforma recebe o pedido e lhe passa uma senha temporária.',
      ped_ok: 'Pedido registrado. Se o e-mail for de uma conta ativa, o administrador recebe o aviso e vai lhe passar uma senha temporária. Se não tiver retorno, procure a coordenação do projeto.' },
    en: { titulo: 'Sign in', sub: 'Access with your institutional credentials', email: 'Email', senha: 'Password', btn: 'Sign in', entrando: 'Signing in…',
      esqueci: 'Forgot your password?', caps: 'Caps Lock is on', ou: 'or', publico: 'View public dashboard', parceiros: 'Implementation and partners',
      restrito: 'Restricted to authorized users', claro: 'Light', escuro: 'Dark', tema: 'Theme', idioma: 'Language',
      mostrar: 'Show password', ocultar: 'Hide password', pausar: 'Pause photos', continuar: 'Resume photos', foto: (i, n) => `Photo ${i} of ${n}`,
      vazio: 'Enter your email and password.', email_inv: 'Enter a valid email.',
      erro_cred: 'Incorrect email or password.', erro_gen: 'Could not connect. Check your internet and try again.',
      erro_conf: 'Email not confirmed. Ask the administrator to resend the confirmation.', erro_muitas: 'Too many attempts. Wait a few minutes and try again.',
      erro_desat: 'Account disabled. Contact the administrator.',
      voltar: 'Back to sign in', ped_titulo: 'Request a new password', ped_btn: 'Send request', enviando: 'Sending…',
      ped_sub: 'Enter your account email. The platform administrator receives the request and gives you a temporary password.',
      ped_ok: 'Request registered. If the email belongs to an active account, the administrator is notified and will give you a temporary password. If you hear nothing back, contact the project coordination.' },
    es: { titulo: 'Iniciar sesión', sub: 'Acceda con sus credenciales institucionales', email: 'Correo electrónico', senha: 'Contraseña', btn: 'Entrar', entrando: 'Entrando…',
      esqueci: '¿Olvidó su contraseña?', caps: 'Bloq Mayús activado', ou: 'o', publico: 'Ver panel público', parceiros: 'Realización y socios',
      restrito: 'Acceso restringido a usuarios autorizados', claro: 'Claro', escuro: 'Oscuro', tema: 'Tema', idioma: 'Idioma',
      mostrar: 'Mostrar contraseña', ocultar: 'Ocultar contraseña', pausar: 'Pausar fotos', continuar: 'Reanudar fotos', foto: (i, n) => `Foto ${i} de ${n}`,
      vazio: 'Ingrese el correo y la contraseña.', email_inv: 'Ingrese un correo válido.',
      erro_cred: 'Correo o contraseña incorrectos.', erro_gen: 'No fue posible conectar. Verifique internet e inténtelo de nuevo.',
      erro_conf: 'Correo no confirmado. Pida al administrador que reenvíe la confirmación.', erro_muitas: 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.',
      erro_desat: 'Cuenta desactivada. Contacte al administrador.',
      voltar: 'Volver a iniciar sesión', ped_titulo: 'Solicitar nueva contraseña', ped_btn: 'Enviar solicitud', enviando: 'Enviando…',
      ped_sub: 'Ingrese el correo de su cuenta. El administrador de la plataforma recibe la solicitud y le entrega una contraseña temporal.',
      ped_ok: 'Solicitud registrada. Si el correo es de una cuenta activa, el administrador recibe el aviso y le entregará una contraseña temporal. Si no recibe respuesta, contacte a la coordinación del proyecto.' },
  }
  let lang = ['pt', 'en', 'es'].includes(ls.ler('dima_idioma')) ? ls.ler('dima_idioma') : 'pt'
  const t = k => (TX[lang] || TX.pt)[k] ?? TX.pt[k]

  function aplicarTextos() {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang
    document.querySelectorAll('[data-t]').forEach(el => { const v = t(el.dataset.t); if (typeof v === 'string') el.textContent = v })
    document.querySelectorAll('[data-t-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.tAria)))
    document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)))
    atualizarOlho(); atualizarPausa(); atualizarDots()
  }
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
    lang = b.dataset.lang; ls.gravar('dima_idioma', lang); aplicarTextos()
  }))

  // ── Tema (mesmo diag_tema das outras telas) ──────────────────────────────
  const temaAtual = () => document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro'
  function marcarTema() { document.querySelectorAll('button[data-tema]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tema === temaAtual()))) }
  document.querySelectorAll('button[data-tema]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.tema
    document.documentElement.dataset.tema = v; ls.gravar('diag_tema', v)
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = v === 'escuro' ? '#0A1A0F' : '#EEF2EF'
    marcarTema(); pintarParceirosLado()
  }))
  marcarTema()

  // ── Logos (Dados do sistema; vitrine = fundo escuro; parceiros do celular = fundo do tema) ──
  let LOGOS = DimaLogos.agora()
  const parcImg = (l, fundo, altura) => DimaLogos.img(l, fundo, { altura, tamanho: false, classe: l.tamanho === 'grande' ? 'en-grande' : '' })
  function pintarLogos(L) {
    LOGOS = L
    const topo = DimaLogos.lista(L.topo, 'escuro', { altura: 30 })
    $('en-logos-topo').innerHTML = topo.join('<span class="en-logos-sep"></span>'); $('en-logos-topo').hidden = !topo.length
    const pj = DimaLogos.img(L.projeto, 'escuro', { altura: 84, tamanho: false })
    $('en-logo-proj').innerHTML = pj; $('en-logo-proj').hidden = !pj
    const pv = L.parceiros.map(l => parcImg(l, 'escuro', 32)).filter(Boolean)
    $('en-parc-vit-logos').innerHTML = pv.join(''); $('en-parc-vit').hidden = !pv.length
    pintarParceirosLado()
  }
  function pintarParceirosLado() {
    const pl = LOGOS.parceiros.map(l => parcImg(l, temaAtual(), 30)).filter(Boolean)
    $('en-parc-lado-logos').innerHTML = pl.join(''); $('en-parc-lado').hidden = !pl.length
  }
  pintarLogos(LOGOS)
  DimaLogos.carregar(db).then(pintarLogos)

  // ── Vitrine: fotos e vídeos de Dados do sistema, carregados aos poucos ───
  const CHAVE_CFG = 'dima_entrada_v1'
  const RESERVA_FOTO = [{ url: 'assets/foto1.jpg', tipo: 'foto', legenda: 'APAs · Rio Branco, Acre' }]
  const menosMov = matchMedia('(prefers-reduced-motion: reduce)')
  const con = navigator.connection || {}
  // celular no 4G/3G ou com economia de dados: só a 1ª foto, sem troca automática
  const economia = !!con.saveData || /(^|-)2g|3g/.test(con.effectiveType || '') || (con.type === 'cellular' && innerWidth <= 960)
  let fotos = [], atual = 0, timer = null, pausado = menosMov.matches || economia, assinaturaFotos = ''

  function carregarMidia(i) {
    const el = $('en-slides').children[i]; if (!el || el.dataset.ok) return
    el.dataset.ok = '1'
    if (el.tagName === 'VIDEO') { el.src = el.dataset.src; el.load() } else el.style.backgroundImage = `url("${el.dataset.src.replace(/"/g, '%22')}")`
  }
  function montarFotos(lista) {
    const sig = JSON.stringify(lista.map(f => [f.url, f.tipo]))
    if (sig === assinaturaFotos) { fotos = lista; atualizarDots(); return }
    assinaturaFotos = sig; fotos = lista; atual = 0; clearTimeout(timer)
    const box = $('en-slides'); box.innerHTML = ''
    lista.forEach((f, i) => {
      const el = f.tipo === 'video' ? Object.assign(document.createElement('video'), { muted: true, playsInline: true, preload: 'metadata' }) : document.createElement('div')
      el.className = 'en-slide' + (i === 0 ? ' ativo' : '')
      el.dataset.src = DimaLogos.url(f.url)
      if (f.tipo === 'video') { el.setAttribute('muted', ''); el.setAttribute('playsinline', '') }
      box.appendChild(el)
    })
    const dots = $('en-dots'); dots.innerHTML = ''
    lista.forEach((f, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'en-dot'
      b.addEventListener('click', () => { irPara(i); if (!pausado) agendar() })
      dots.appendChild(b)
    })
    $('en-slide-ctl').hidden = lista.length < 2
    carregarMidia(0); tocarSeVideo(0); atualizarDots()
    if (!pausado) agendar()
  }
  function tocarSeVideo(i) {
    const el = $('en-slides').children[i]
    if (el && el.tagName === 'VIDEO') { el.currentTime = 0; if (!pausado) el.play().catch(() => {}) }
  }
  function irPara(n) {
    const box = $('en-slides'); if (!fotos.length) return
    const ant = box.children[atual]; if (ant) { ant.classList.remove('ativo'); if (ant.tagName === 'VIDEO') ant.pause() }
    atual = (n + fotos.length) % fotos.length
    carregarMidia(atual); box.children[atual].classList.add('ativo'); tocarSeVideo(atual)
    carregarMidia((atual + 1) % fotos.length)  // a próxima já vem baixando
    atualizarDots()
  }
  function agendar() {
    clearTimeout(timer); if (pausado || fotos.length < 2 || document.hidden) return
    const el = $('en-slides').children[atual]
    if (el && el.tagName === 'VIDEO') el.addEventListener('ended', () => { irPara(atual + 1); agendar() }, { once: true })
    else timer = setTimeout(() => { irPara(atual + 1); agendar() }, 6000)
  }
  function atualizarDots() {
    const n = fotos.length
    ;[...$('en-dots').children].forEach((b, i) => { b.setAttribute('aria-label', t('foto')(i + 1, n)); b.setAttribute('aria-current', String(i === atual)) })
    $('en-legenda').textContent = fotos[atual]?.legenda || ''
  }
  function atualizarPausa() {
    const b = $('en-pausa'); b.setAttribute('aria-pressed', String(pausado)); b.setAttribute('aria-label', t(pausado ? 'continuar' : 'pausar'))
    b.querySelector('use').setAttribute('href', pausado ? '#ic-play' : '#ic-pausa')
  }
  $('en-pausa').addEventListener('click', () => {
    pausado = !pausado; atualizarPausa()
    const el = $('en-slides').children[atual]
    if (pausado) { clearTimeout(timer); if (el && el.tagName === 'VIDEO') el.pause() } else { if (el && el.tagName === 'VIDEO') el.play().catch(() => {}); agendar() }
  })
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else agendar() })
  // setas trocam a foto só quando a pessoa não está num campo
  document.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return
    irPara(atual + (e.key === 'ArrowRight' ? 1 : -1)); agendar()
  })

  function pintarProjeto(c) {
    if (c.projeto_codigo) { $('en-proj-cod').textContent = c.projeto_codigo; $('en-rod-proj').textContent = 'Projeto ' + c.projeto_codigo }
    $('en-proj-cod-wrap').hidden = !c.projeto_codigo
    if (c.projeto_nome) $('en-proj-nome').textContent = c.projeto_nome
    $('en-proj-local').textContent = c.projeto_localizacao || ''
    if (/^#[0-9a-f]{6}$/i.test(c.cor_primaria || '')) document.querySelector('.en-vitrine').style.backgroundColor = c.cor_primaria
    const lista = [...(c.fotos || [])].filter(f => f && f.url).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    montarFotos(lista)
  }
  const guardada = (() => { try { return JSON.parse(ls.ler(CHAVE_CFG) || 'null') } catch (e) { return null } })()
  if (guardada) pintarProjeto(guardada)
  db.from('configuracoes_sistema').select('projeto_codigo,projeto_nome,projeto_localizacao,cor_primaria,fotos').eq('projeto_id', 'default').maybeSingle()
    .then(({ data, error }) => {
      if (error || !data) throw error || new Error('sem configuração')
      ls.gravar(CHAVE_CFG, JSON.stringify(data)); pintarProjeto(data)
    })
    .catch(() => { if (!guardada) montarFotos(RESERVA_FOTO) })

  // ── Celular: teclado aberto encolhe a foto e o campo fica à vista ────────
  const celular = matchMedia('(max-width: 960px)')
  let saida = null
  document.addEventListener('focusin', e => {
    if (!celular.matches || !e.target.matches('input')) return
    clearTimeout(saida); document.body.classList.add('en-teclado')
    setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 260)
  })
  document.addEventListener('focusout', () => { saida = setTimeout(() => { if (!document.activeElement?.matches('input')) document.body.classList.remove('en-teclado') }, 120) })

  // ── Senha: mostrar/ocultar e Caps Lock ───────────────────────────────────
  const senha = $('en-senha')
  function atualizarOlho() {
    const vis = senha.type === 'text', b = $('en-olho')
    b.setAttribute('aria-pressed', String(vis)); b.setAttribute('aria-label', t(vis ? 'ocultar' : 'mostrar'))
    b.querySelector('use').setAttribute('href', vis ? '#ic-olho-x' : '#ic-olho')
  }
  $('en-olho').addEventListener('click', () => {
    const fim = senha.selectionEnd
    senha.type = senha.type === 'password' ? 'text' : 'password'; atualizarOlho()
    senha.focus(); try { senha.setSelectionRange(fim, fim) } catch (e) {}
  })
  const caps = e => { if (e.getModifierState) $('en-caps').hidden = !e.getModifierState('CapsLock') }
  senha.addEventListener('keydown', caps); senha.addEventListener('keyup', caps)
  senha.addEventListener('blur', () => { $('en-caps').hidden = true })

  // ── Entrar ───────────────────────────────────────────────────────────────
  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  function mostrarErro(box, msg) { box.querySelector('span').textContent = msg; box.hidden = !msg }
  function ocupado(btn, sim, chave) {
    btn.disabled = sim
    btn.innerHTML = sim ? `<span class="en-giro" aria-hidden="true"></span><span>${t(chave)}</span>` : `<span data-t="${btn.id === 'en-entrar' ? 'btn' : 'ped_btn'}">${t(btn.id === 'en-entrar' ? 'btn' : 'ped_btn')}</span>`
  }
  function irDestino(deveTrocar) {
    const destino = deveTrocar ? 'pages/trocar-senha.html' : (ls.ler('dima_redirect') || 'pages/dashboard.html')
    try { localStorage.removeItem('dima_redirect') } catch (e) {}
    window.location.replace(destino)
  }

  $('en-form').addEventListener('submit', async e => {
    e.preventDefault()
    const erro = $('en-erro'), btn = $('en-entrar'), inE = $('en-email')
    const email = inE.value.trim(), pw = senha.value
    inE.removeAttribute('aria-invalid'); senha.removeAttribute('aria-invalid')
    if (!email || !pw) {
      if (!email) inE.setAttribute('aria-invalid', 'true'); if (!pw) senha.setAttribute('aria-invalid', 'true')
      mostrarErro(erro, t('vazio')); (email ? senha : inE).focus(); return
    }
    if (!emailOk(email)) { inE.setAttribute('aria-invalid', 'true'); mostrarErro(erro, t('email_inv')); inE.focus(); return }
    mostrarErro(erro, ''); ocupado(btn, true, 'entrando')
    let saindo = false
    try {
      const { data, error } = await db.auth.signInWithPassword({ email, password: pw })
      if (error) {
        const m = error.message || ''
        const msg = /Invalid login credentials|invalid_credentials|User not found/.test(m) ? 'erro_cred'
          : /Email not confirmed|email_not_confirmed/.test(m) ? 'erro_conf'
          : /Too many requests|rate limit/i.test(m) ? 'erro_muitas'
          : /disabled|banned/i.test(m) ? 'erro_desat' : 'erro_gen'
        mostrarErro(erro, t(msg)); if (msg === 'erro_cred') senha.select(); return
      }
      const { data: usuario } = await db.from('usuarios').select('idioma_pref,deve_trocar_senha,ativo').eq('id', data.user.id).single()
      if (!usuario?.ativo) { await db.auth.signOut(); mostrarErro(erro, t('erro_desat')); return }
      if (usuario.idioma_pref) ls.gravar('dima_idioma', usuario.idioma_pref)
      // espera o SDK gravar a sessão antes de navegar (senão a próxima página pode não achar a sessão)
      const { data: { session } } = await db.auth.getSession()
      if (!session) await new Promise(res => {
        const { data: { subscription } } = db.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_IN' && s) { subscription.unsubscribe(); res() } })
        setTimeout(res, 3000)
      })
      saindo = true; irDestino(usuario.deve_trocar_senha)
    } catch (err) {
      mostrarErro(erro, t('erro_gen'))
    } finally {
      if (!saindo) ocupado(btn, false)
    }
  })

  // ── Esqueceu a senha: pedido ao administrador (fn_publico_pedir_nova_senha) ──
  // A resposta é sempre a mesma: a tela não revela se o e-mail existe nem se a conta está ativa.
  function vista(qual) {
    $('en-vista-entrar').hidden = qual !== 'entrar'; $('en-vista-pedido').hidden = qual !== 'pedido'
  }
  $('en-esqueci').addEventListener('click', () => {
    $('en-ped-email').value = $('en-email').value.trim()
    $('en-ped-ok').hidden = true; mostrarErro($('en-ped-erro'), ''); $('en-ped-btn').disabled = false
    vista('pedido'); $('en-ped-titulo').focus()
  })
  $('en-voltar').addEventListener('click', () => { vista('entrar'); $('en-esqueci').focus() })
  $('en-form-pedido').addEventListener('submit', async e => {
    e.preventDefault()
    const inp = $('en-ped-email'), email = inp.value.trim(), btn = $('en-ped-btn'), er = $('en-ped-erro')
    inp.removeAttribute('aria-invalid')
    if (!emailOk(email)) { inp.setAttribute('aria-invalid', 'true'); mostrarErro(er, t('email_inv')); inp.focus(); return }
    mostrarErro(er, ''); ocupado(btn, true, 'enviando')
    try {
      const { error } = await db.rpc('fn_publico_pedir_nova_senha', { p_email: email })
      if (error) throw error
      ocupado(btn, false); btn.disabled = true
      $('en-ped-ok').hidden = false
    } catch (err) {
      ocupado(btn, false); mostrarErro(er, t('erro_gen'))
    }
  })

  // Esc na vista do pedido volta para entrar
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('en-vista-pedido').hidden) $('en-voltar').click() })

  aplicarTextos()

  // Já logado: segue direto
  ;(async () => {
    try {
      const { data: { session } } = await db.auth.getSession()
      if (!session) return
      const { data: u } = await db.from('usuarios').select('deve_trocar_senha').eq('id', session.user.id).single()
      if (u?.deve_trocar_senha) window.location.href = 'pages/trocar-senha.html'
      else { const d = ls.ler('dima_redirect'); try { localStorage.removeItem('dima_redirect') } catch (e) {}; window.location.href = d || 'pages/dashboard.html' }
    } catch (e) { /* fica na tela de entrada */ }
  })()
})()
