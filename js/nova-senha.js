// Página do link enviado por e-mail (Edge Function conta-acesso, migração 20261127_acessos_e_retorno_senha):
//   · nova senha — a própria pessoa cria a senha (uso único, 24 h, sem repetir senha que já usou);
//   · voltar a entrar — a pessoa confirma o pedido; só então ele chega ao super_admin.
// Abrir a página não usa o link (leitores de e-mail abrem links sozinhos): só o botão usa.
// Nada é conferido aqui: as regras da senha são só ajuda; quem decide é o servidor.
;(function () {
  const $ = id => document.getElementById(id)
  const params = new URLSearchParams(location.search)
  const token = params.get('t') || ''
  // o código sai da barra de endereço (histórico, captura de tela, quem olha por cima)
  try { history.replaceState(null, '', location.pathname) } catch (e) {}

  const REGRAS = { 'r-min': s => s.length >= 8, 'r-num': s => /\d/.test(s), 'r-mai': s => /[A-Z]/.test(s), 'r-min2': s => /[a-z]/.test(s) }
  const valida = s => Object.values(REGRAS).every(f => f(s))

  async function chamar (corpo) {
    const r = await fetch(SUPABASE_URL + '/functions/v1/conta-acesso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SUPABASE_ANON_KEY, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(corpo),
    })
    let j = {}
    try { j = await r.json() } catch (e) {}
    return j
  }

  const ESTADOS = {
    usado: ['Este link já foi usado', 'Cada link vale uma vez só. Se ainda precisa, peça de novo na tela de entrada.'],
    expirado: ['Este link venceu', 'O link vale por 24 horas. Peça de novo na tela de entrada.'],
    substituido: ['Este link foi substituído', 'Houve um pedido mais novo; use o link do e-mail mais recente ou peça de novo.'],
    conta: ['A conta não está liberada', 'Sua entrada está suspensa ou a conta foi desativada. Na tela de entrada, use "Pedir para voltar a entrar".'],
    invalido: ['Link inválido', 'Confira se abriu o link completo do e-mail. Se continuar assim, peça de novo na tela de entrada.'],
  }
  function fim (titulo, texto, ok) {
    ;['ns-carregando', 'ns-form', 'ns-retorno'].forEach(i => { $(i).hidden = true })
    $('ns-fim-titulo').textContent = titulo
    $('ns-fim-texto').textContent = texto
    $('ns-fim-selo').innerHTML = `<svg class="ts-ic"><use href="#${ok ? 'ts-check' : 'ts-alerta'}"/></svg>`
    $('ns-fim-selo').classList.toggle('ts-selo-alerta', !ok)
    $('ns-fim').hidden = false
    $('ns-fim-titulo').setAttribute('tabindex', '-1'); $('ns-fim-titulo').focus()
  }
  function estadoRuim (e) { const x = ESTADOS[e] || ESTADOS.invalido; fim(x[0], x[1], false) }

  // ── nova senha ──
  function verificar () {
    const s = $('nova-senha').value
    let pontos = 0
    Object.entries(REGRAS).forEach(([id, f]) => {
      const ok = f(s); if (ok) pontos++
      const li = $(id); li.classList.toggle('ok', ok); li.querySelector('use').setAttribute('href', ok ? '#ts-check' : '#ts-ponto')
    })
    $('forca-fill').style.width = (pontos / 4 * 100) + '%'
    $('forca-fill').className = !s ? '' : pontos <= 1 ? 'f1' : pontos <= 3 ? 'f2' : 'f3'
    $('forca-txt').textContent = !s ? '—' : pontos <= 1 ? 'Fraca' : pontos <= 3 ? 'Média' : 'Forte'
    $('erro-nova').hidden = true
    conferirIgual()
  }
  function conferirIgual () {
    const a = $('nova-senha').value, b = $('conf-senha').value, difere = b.length > 0 && a !== b
    $('erro-conf').textContent = difere ? 'As senhas não são iguais.' : ''; $('erro-conf').hidden = !difere
    $('conf-senha').setAttribute('aria-invalid', String(difere))
    $('btn-salvar').disabled = !(valida(a) && a === b)
  }
  document.querySelectorAll('[data-olho]').forEach(btn => btn.addEventListener('click', () => {
    const inp = $(btn.dataset.olho), mostrar = inp.type === 'password'
    inp.type = mostrar ? 'text' : 'password'
    btn.innerHTML = `<svg class="ts-ic"><use href="#${mostrar ? 'ts-olhox' : 'ts-olho'}"/></svg>`
    btn.setAttribute('aria-label', mostrar ? 'Ocultar a senha' : 'Mostrar a senha')
  }))
  $('nova-senha').addEventListener('input', verificar)
  $('conf-senha').addEventListener('input', conferirIgual)
  $('ns-form').addEventListener('submit', async e => {
    e.preventDefault()
    const senha = $('nova-senha').value
    if (!valida(senha) || senha !== $('conf-senha').value) return
    const btn = $('btn-salvar'), rot = btn.querySelector('span')
    btn.disabled = true; rot.textContent = 'Salvando…'
    try {
      const j = await chamar({ acao: 'definir_senha', token, senha })
      if (j.ok) { fim('Senha criada', 'Pronto: entre na plataforma com o seu e-mail e a senha nova. Por segurança, as outras sessões abertas foram encerradas.', true); return }
      if (j.codigo === 'SENHA_REPETIDA' || j.codigo === 'SENHA_FRACA') {
        $('erro-nova').textContent = j.erro; $('erro-nova').hidden = false; $('nova-senha').focus()
      } else if (/^LINK_|CONTA_/.test(j.codigo || '')) {
        estadoRuim(j.codigo === 'LINK_USADO' ? 'usado' : j.codigo === 'LINK_EXPIRADO' ? 'expirado' : j.codigo === 'CONTA_INDISPONIVEL' ? 'conta' : 'invalido'); return
      } else {
        $('erro-nova').textContent = j.erro || 'Não foi possível salvar. Tente de novo.'; $('erro-nova').hidden = false
      }
    } catch (err) {
      $('erro-nova').textContent = 'Sem conexão. Verifique a internet e tente de novo.'; $('erro-nova').hidden = false
    }
    btn.disabled = false; rot.textContent = 'Salvar a nova senha'; conferirIgual()
  })

  // ── voltar a entrar ──
  $('btn-confirmar').addEventListener('click', async () => {
    const btn = $('btn-confirmar'), rot = btn.querySelector('span')
    btn.disabled = true; rot.textContent = 'Confirmando…'
    try {
      const j = await chamar({ acao: 'confirmar_retorno', token })
      if (j.ok) {
        fim('Pedido confirmado', j.ja ? 'Este pedido já estava confirmado. O administrador avisa por e-mail quando decidir.'
          : 'O administrador recebeu o seu pedido. Quando ele decidir, você recebe um e-mail com o resultado.', true)
        return
      }
      if (/^LINK_/.test(j.codigo || '')) { estadoRuim(j.codigo === 'LINK_EXPIRADO' ? 'expirado' : 'invalido'); return }
      $('erro-ret').textContent = j.erro || 'Não foi possível confirmar. Tente de novo.'; $('erro-ret').hidden = false
    } catch (err) {
      $('erro-ret').textContent = 'Sem conexão. Verifique a internet e tente de novo.'; $('erro-ret').hidden = false
    }
    btn.disabled = false; rot.textContent = 'Confirmar o meu pedido'
  })

  // ── início: o que é o link ──
  ;(async () => {
    if (!token) { estadoRuim('invalido'); return }
    let info = {}
    try { info = await chamar({ acao: 'info', token }) } catch (e) {
      fim('Sem conexão', 'Não foi possível conferir o link. Verifique a internet e abra o link de novo.', false); return
    }
    if (info.estado !== 'valido') { estadoRuim(info.estado); return }
    $('ns-carregando').hidden = true
    const ola = info.nome ? `Olá, ${info.nome}. ` : ''
    if (info.finalidade === 'senha') {
      $('ns-sub').textContent = ola + 'Escolha uma senha que você ainda não usou nesta plataforma.'
      $('ns-form').hidden = false; $('nova-senha').focus()
    } else {
      const desat = info.situacao === 'desativada'
      $('ns-ret-titulo').textContent = desat ? 'Confirme o pedido de reativação' : 'Confirme o pedido para voltar a entrar'
      $('ns-ret-sub').textContent = ola + (desat
        ? 'Sua conta está desativada. Ao confirmar, o administrador recebe o pedido de reativação e decide. Se a conta voltar, seus acessos ficam em revisão por alguns dias.'
        : 'Sua entrada está suspensa porque a conta ficou 15 dias sem uso. Ao confirmar, o administrador recebe o pedido e libera a entrada.')
      $('ns-retorno').hidden = false; $('btn-confirmar').focus()
    }
  })()
})()
