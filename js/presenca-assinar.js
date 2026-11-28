// presenca-assinar.js — página pública da lista de presença (pages/presenca.html).
// ?l=<chave da lista> (QR projetado) ou ?c=<código pessoal> (link do e-mail). O banco decide tudo:
// fn_publico_presenca_lista (dados, se está aberta, termo vigente, pré-preenchimento) e
// fn_publico_presenca_assinar (valida, grava uma assinatura por pessoa / por e-mail).
;(function () {
  const $ = id => document.getElementById(id)
  const ic = n => `<svg class="ic" aria-hidden="true"><use href="#pa-${n}"/></svg>`
  const anunciar = t => { const a = $('pa-anuncio'); a.textContent = ''; setTimeout(() => { a.textContent = t }, 30) }

  // logos do topo (versão de fundo escuro)
  ;(function () {
    const pinta = L => { const m = $('pa-marca'); if (!m) return; const it = DimaLogos.lista(L.topo, 'escuro', { altura: 22, tamanho: false }); m.innerHTML = it.join(''); m.style.display = it.length ? '' : 'none' }
    pinta(DimaLogos.agora()); DimaLogos.carregar(db).then(pinta)
  })()

  // a chave sai do endereço (histórico, prints de tela, compartilhamento)
  const q = new URLSearchParams(location.search)
  const P = { l: q.get('l') || '', c: q.get('c') || '' }
  if (P.l || P.c) { try { history.replaceState(null, '', location.pathname) } catch (e) {} }

  const SEXO = [['mulher', 'Mulher'], ['homem', 'Homem'], ['outro', 'Outro'], ['prefere_nao_responder', 'Prefiro não responder']]
  const RACA = [['branca', 'Branca'], ['preta', 'Preta'], ['parda', 'Parda'], ['amarela', 'Amarela'], ['indigena', 'Indígena'], ['prefere_nao_responder', 'Prefiro não responder']]
  const ERROS = {
    lista_fechada: 'A lista de presença desta reunião já está fechada.',
    lista_inexistente: 'Lista de presença não encontrada. Confira o QR Code ou o link.',
    link_invalido: 'Este link não é válido. Use o QR Code da reunião.',
    termo_mudou: 'O termo de uso de imagem foi atualizado. A página vai recarregar para você ler a versão nova.',
    ja_assinou: 'Este e-mail já assinou esta lista de presença. Cada pessoa assina uma vez.',
    nome_invalido: 'Escreva o seu nome completo.',
    email_invalido: 'Confira o e-mail: ele parece incompleto.',
    telefone_invalido: 'Confira o telefone: use DDD + número (10 ou 11 dígitos).',
    sexo_obrigatorio: 'Escolha uma opção em Sexo/gênero (pode ser "Prefiro não responder").',
    raca_obrigatoria: 'Escolha uma opção em Cor ou raça (pode ser "Prefiro não responder").',
    imagem_obrigatoria: 'Escolha se autoriza ou não o uso da sua imagem.',
    lista_cheia: 'Esta lista atingiu o limite de assinaturas. Fale com o organizador.',
  }
  const msgErro = e => { const m = String(e && e.message || e).match(/presenca:([a-z_]+)/); return (m && ERROS[m[1]]) || 'Não foi possível registrar agora. Verifique a internet e tente de novo.' }

  const fmtQuando = (ini, fim) => {
    if (!ini) return ''
    const d = new Date(ini.slice(0, 16) + ':00-05:00')
    const dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Rio_Branco' })
    const h = ini.slice(11, 16) + (fim ? '–' + fim.slice(11, 16) : '')
    return dia.charAt(0).toUpperCase() + dia.slice(1) + ', ' + h + ' (horário do Acre)'
  }
  const fmtHora = ts => new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Rio_Branco' })

  let D = null

  function cartaoReuniao () {
    return `<section class="cartao reuniao entra">
      ${D.codigo ? `<div class="cod">${esc(D.codigo)}</div>` : ''}
      <h2>${esc(D.titulo)}</h2>
      ${D.inicio ? `<div class="linha">${ic('cal')}<span>${esc(fmtQuando(D.inicio, D.fim))}</span></div>` : ''}
      ${D.formato || D.local ? `<div class="linha">${ic('local')}<span>${esc(D.formato || '')}${D.local ? ' · ' + esc(D.local) : ''}</span></div>` : ''}
      ${D.aberta ? `<span class="selo">${ic('relogio')}Lista aberta até ${esc(fmtHora(D.fecha_em))}</span>` : ''}
    </section>`
  }

  function telaMensagem (titulo, texto, tipo) {
    $('pa').innerHTML = (D ? cartaoReuniao() : '') + `<section class="cartao entra"><div class="ok">
      <div class="marcador">${ic(tipo === 'ok' ? 'ok' : tipo === 'hora' ? 'relogio' : 'alerta')}</div>
      <h2>${esc(titulo)}</h2><p class="suave">${texto}</p></div></section>`
    anunciar(titulo)
  }

  function opcoes (nome, lista, atual) {
    return `<div class="opcoes">${lista.map(([v, r]) =>
      `<label><input type="radio" name="${nome}" value="${v}" ${atual === v ? 'checked' : ''} required>${esc(r)}</label>`).join('')}</div>`
  }

  function form () {
    const p = D.pre || {}
    $('pa').innerHTML = cartaoReuniao() + `<form class="cartao entra" id="pa-form" novalidate>
      <h2>Seus dados</h2>
      <p class="suave">${D.pessoal ? 'Confira os seus dados e confirme a presença.' : 'Preencha para registrar a sua presença.'}</p>
      <label class="rot" for="pa-nome">Nome completo</label>
      <input type="text" id="pa-nome" autocomplete="name" maxlength="160" value="${esc(p.nome || '')}" required>
      <label class="rot" for="pa-email">E-mail</label>
      <input type="email" id="pa-email" autocomplete="email" inputmode="email" maxlength="160" value="${esc(p.email || '')}" ${D.pessoal ? 'readonly' : ''} required>
      <label class="rot" for="pa-tel">Telefone <small>(opcional)</small></label>
      <input type="tel" id="pa-tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="(68) 99999-9999" value="${esc(p.telefone || '')}">
      <fieldset><legend>Sexo/gênero</legend>${opcoes('sexo', SEXO, p.sexo_genero)}
        <input type="text" class="outro" id="pa-sexo-outro" maxlength="60" placeholder="Como você se identifica (opcional)" value="${esc(p.sexo_genero_outro || '')}" ${p.sexo_genero === 'outro' ? '' : 'hidden'} aria-label="Como você se identifica"></fieldset>
      <fieldset><legend>Cor ou raça <small>(autodeclarada)</small></legend>${opcoes('raca', RACA, p.cor_raca)}</fieldset>

      <div class="bloco-img">
        <h3>${ic('foto')}Uso da sua imagem</h3>
        <p>Podem ser feitas fotos e vídeos desta reunião. Leia o termo e escolha se autoriza. Não autorizar não impede o registro da presença.</p>
        <button type="button" class="btn-termo" id="pa-ler">${ic('doc')}Ler o termo de autorização</button>
        <fieldset class="escolha-img"><legend class="sr">Autorização de uso de imagem</legend>
          <label><input type="radio" name="imagem" value="true" aria-label="Autorizo o uso da minha imagem nos termos que li"><span><b>Autorizo</b><small>o uso da minha imagem nos termos que li</small></span></label>
          <label><input type="radio" name="imagem" value="false" aria-label="Não autorizo o uso da minha imagem"><span><b>Não autorizo</b><small>o uso da minha imagem</small></span></label>
        </fieldset>
      </div>

      <div class="sigilo">${ic('escudo')}<span>Estes dados servem para a prestação de contas do projeto aos financiadores e para indicadores de gênero e raça. Sexo e raça só aparecem por pessoa para a coordenação do projeto; o restante vê apenas os totais. Tratamento conforme a LGPD.</span></div>
      <div id="pa-erro" role="alert"></div>
      <button type="submit" class="btn" id="pa-enviar">${ic('ok')}Confirmar presença</button>
    </form>`

    const f = $('pa-form')
    f.addEventListener('change', ev => {
      if (ev.target.name === 'sexo') $('pa-sexo-outro').hidden = ev.target.value !== 'outro'
    })
    $('pa-ler').addEventListener('click', abrirTermo)
    f.addEventListener('submit', enviar)
  }

  // ── termo ────────────────────────────────────────────────────────────
  let origemFoco = null
  function abrirTermo () {
    origemFoco = document.activeElement
    $('pa-termo-texto').textContent = D.termo.texto
    $('pa-termo-versao').textContent = 'Versão ' + D.termo.versao + ' · ' + D.termo.sha256.slice(0, 12)
    $('pa-termo').hidden = false
    $('pa-termo-texto').scrollTop = 0
    $('pa-termo-texto').focus()
  }
  function fecharTermo () { $('pa-termo').hidden = true; if (origemFoco) origemFoco.focus() }
  $('pa-termo-x').addEventListener('click', fecharTermo)
  $('pa-termo-ok').addEventListener('click', fecharTermo)
  $('pa-termo').addEventListener('click', ev => { if (ev.target.id === 'pa-termo') fecharTermo() })
  document.addEventListener('keydown', ev => {
    if ($('pa-termo').hidden) return
    if (ev.key === 'Escape') { ev.preventDefault(); fecharTermo() }
    if (ev.key === 'Tab') { // foco preso na janela
      const it = [...$('pa-termo').querySelectorAll('button, [tabindex="0"]')]
      const i = it.indexOf(document.activeElement)
      if (ev.shiftKey && i <= 0) { ev.preventDefault(); it[it.length - 1].focus() }
      else if (!ev.shiftKey && i === it.length - 1) { ev.preventDefault(); it[0].focus() }
    }
  })

  // ── envio ────────────────────────────────────────────────────────────
  function erro (t) { $('pa-erro').innerHTML = t ? `<div class="erro">${ic('alerta')}<span>${esc(t)}</span></div>` : ''; if (t) anunciar(t) }

  async function enviar (ev) {
    ev.preventDefault()
    const f = $('pa-form'), val = n => (f.querySelector(`input[name="${n}"]:checked`) || {}).value
    const dados = {
      nome: $('pa-nome').value.trim(), email: $('pa-email').value.trim(), telefone: $('pa-tel').value.trim(),
      sexo_genero: val('sexo'), sexo_genero_outro: $('pa-sexo-outro').value.trim(), cor_raca: val('raca'),
      imagem_autoriza: val('imagem'), termo_id: D.termo.id,
    }
    const tel = dados.telefone.replace(/\D/g, '')
    if (dados.nome.split(/\s+/).length < 2) { erro('Escreva o seu nome completo (nome e sobrenome).'); $('pa-nome').focus(); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dados.email)) { erro(ERROS.email_invalido); $('pa-email').focus(); return }
    if (tel && (tel.length < 10 || tel.length > 13)) { erro(ERROS.telefone_invalido); $('pa-tel').focus(); return }
    if (!dados.sexo_genero) { erro(ERROS.sexo_obrigatorio); return }
    if (!dados.cor_raca) { erro(ERROS.raca_obrigatoria); return }
    if (!dados.imagem_autoriza) { erro(ERROS.imagem_obrigatoria); $('pa-ler').scrollIntoView({ block: 'center' }); return }
    erro('')
    const bt = $('pa-enviar'); bt.disabled = true; bt.textContent = 'Registrando…'
    const { error } = await db.rpc('fn_publico_presenca_assinar', { p_lista_token: P.l || null, p_convite: P.c || null, p_dados: dados })
    if (error) {
      bt.disabled = false; bt.innerHTML = ic('ok') + 'Confirmar presença'
      if (/termo_mudou/.test(error.message)) { erro(ERROS.termo_mudou); setTimeout(carregar, 2500); return }
      if (/ja_assinou/.test(error.message)) { telaMensagem('Presença já registrada', esc(ERROS.ja_assinou), 'ok'); return }
      if (/lista_fechada/.test(error.message)) { telaMensagem('Lista fechada', esc(ERROS.lista_fechada), 'alerta'); return }
      erro(msgErro(error)); return
    }
    telaMensagem('Presença registrada', `Obrigado, ${esc(dados.nome.split(/\s+/)[0])}. Sua presença em <b>${esc(D.titulo)}</b> foi registrada${
      dados.imagem_autoriza === 'true' ? ' e você autorizou o uso da sua imagem.' : '. Você não autorizou o uso da sua imagem.'}`, 'ok')
  }

  // ── início ───────────────────────────────────────────────────────────
  async function carregar () {
    if (!P.l && !P.c) { telaMensagem('Link incompleto', 'Abra a lista pelo QR Code projetado na reunião ou pelo link recebido por e-mail.', 'alerta'); return }
    const { data, error } = await db.rpc('fn_publico_presenca_lista', { p_lista_token: P.l || null, p_convite: P.c || null })
    if (error && /Could not find the function|PGRST202/.test((error.message || '') + (error.code || ''))) { telaMensagem('Lista de presença em instalação', 'Esta função ainda está sendo instalada na plataforma. Tente de novo mais tarde.', 'hora'); return }
    if (error) { telaMensagem('Sem conexão', 'Não foi possível abrir a lista agora. Verifique a internet e recarregue a página.', 'alerta'); return }
    if (!data || !data.encontrado) { D = null; telaMensagem('Lista não encontrada', 'Confira o QR Code ou o link recebido por e-mail.', 'alerta'); return }
    D = data
    document.title = 'Presença · ' + D.titulo
    if (D.ja_assinou) return telaMensagem('Presença já registrada', 'Você já assinou a lista desta reunião. Cada pessoa assina uma vez.', 'ok')
    if (!D.aberta) {
      if (D.encerrada || new Date(D.fecha_em) < new Date()) return telaMensagem('Lista fechada', 'A lista de presença desta reunião já está fechada. Se você participou e não assinou, fale com o organizador.', 'alerta')
      return telaMensagem('A lista ainda não abriu', `A lista abre em <b>${esc(fmtHora(D.abre_em))}</b> (15 minutos antes do início). Volte nesse horário.`, 'hora')
    }
    form()
  }
  carregar()
})()
