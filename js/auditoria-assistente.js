// ── DIMA UNESCO · Assistente da Auditoria (painel de conversa) ─────────
// Carregado depois de js/auditoria.js (usa esc, auIc, fmtDtHr, plural, DOMINIOS,
// _achados, chamarAuditor, setRodando, renderFaixa, carregarConsumo…).
// Conversa gravada no banco (ia_conversas/ia_mensagens): o histórico enviado à IA
// vem de lá. Resposta em streaming pela Edge Function chat-auditor (stream: true).
// Texto do modelo SEMPRE passa por mdSeguro (escapa tudo antes de formatar).

let _chatMessages   = []
let _chatAberto     = false
let _chatExecucaoId = null
let _chatEnviando   = false
let _chatConversaId = null
let _chatConversasLidas = false
let _chatVolta = null

// Mesmos rótulos de ROTULO_FERRAMENTA na Edge Function chat-auditor
const CHAT_FERRAMENTAS = {
  achados_auditoria: 'achados da auditoria', saldo_atividades: 'saldo das atividades',
  extrato_orcamento_atividade: 'extrato do orçamento', consultar_contrato: 'contratos', consultar_tdr: 'TDRs',
  execucao_direta_tdr: 'execução direta', remanejamentos: 'remanejamentos', produtos_contratos: 'produtos', viagens: 'viagens',
  pessoas: 'pessoas', tarefas: 'tarefas',
}

// Únicos links que a resposta pode abrir (os que as ferramentas devolvem)
const CHAT_LINK_OK = /^(tarefas|contratos|tdrs|remanejamentos)\.html\?(tarefa|contrato|tdr|id)=[0-9a-f-]{36}$/

// ── Markdown seguro: escapa tudo e só então formata ────────────────────
function mdInline(t) {
  return esc(t)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (_m, rotulo, href) {
      const h = href.replace(/&amp;/g, '&')
      return CHAT_LINK_OK.test(h) ? '<a href="' + h + '" class="ach-link">' + rotulo + '</a>' : rotulo
    })
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
}

function mdCelulas(linha) {
  return linha.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim() })
}

function mdSeguro(src) {
  const linhas = String(src || '').replace(/\r/g, '').split('\n')
  const out = []
  let i = 0
  while (i < linhas.length) {
    const l = linhas[i]
    if (!l.trim()) { i++; continue }
    // Tabela: | a | b | + linha |---|---|
    if (/^\s*\|/.test(l) && i + 1 < linhas.length && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1])) {
      const cab = mdCelulas(l)
      i += 2
      const corpo = []
      while (i < linhas.length && /^\s*\|/.test(linhas[i])) { corpo.push(mdCelulas(linhas[i])); i++ }
      out.push('<div class="ach-tab"><table><thead><tr>' + cab.map(function (c) { return '<th>' + mdInline(c) + '</th>' }).join('') +
        '</tr></thead><tbody>' + corpo.map(function (r) {
          return '<tr>' + cab.map(function (_c, k) { return '<td>' + mdInline(r[k] || '') + '</td>' }).join('') + '</tr>'
        }).join('') + '</tbody></table></div>')
      continue
    }
    // Lista (com ou sem número; recuo vira subitem simples)
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const numerada = /^\s*\d+[.)]\s+/.test(l)
      const itens = []
      while (i < linhas.length && /^\s*([-*•]|\d+[.)])\s+/.test(linhas[i])) {
        const sub = /^\s{2,}/.test(linhas[i])
        if (!sub && /^\d+[.)]\s+/.test(linhas[i]) !== numerada) break
        itens.push('<li' + (sub ? ' class="sub"' : '') + '>' + mdInline(linhas[i].replace(/^\s*([-*•]|\d+[.)])\s+/, '')) + '</li>')
        i++
      }
      out.push((numerada ? '<ol>' : '<ul>') + itens.join('') + (numerada ? '</ol>' : '</ul>'))
      continue
    }
    // Título com # (o prompt pede para não usar; se vier, vira negrito)
    if (/^#{1,6}\s/.test(l)) { out.push('<p><strong>' + mdInline(l.replace(/^#{1,6}\s+/, '')) + '</strong></p>'); i++; continue }
    // Parágrafo: junta linhas até uma em branco ou outro bloco
    const par = []
    while (i < linhas.length && linhas[i].trim() && !/^\s*\|/.test(linhas[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(linhas[i]) && !/^#{1,6}\s/.test(linhas[i])) {
      par.push(mdInline(linhas[i])); i++
    }
    out.push('<p>' + par.join('<br>') + '</p>')
  }
  return out.join('')
}

// ── Abrir, fechar, expandir ────────────────────────────────────────────
function setChatExecucao(id, dt) {
  _chatExecucaoId = id
  const sub = document.getElementById('chat-header-sub')
  if (sub) sub.textContent = 'Auditoria de ' + (dt ? fmtDtHr(dt) : '?')
}

function toggleChat(forcar) {
  const abrir = typeof forcar === 'boolean' ? forcar : !_chatAberto
  if (abrir === _chatAberto) return
  _chatAberto = abrir
  const panel = document.getElementById('chat-panel')
  const btnChat = document.getElementById('btn-chat')
  panel.classList.toggle('aberto', abrir)
  panel.setAttribute('aria-hidden', String(!abrir))
  if (btnChat) { btnChat.classList.toggle('au-on', abrir); btnChat.setAttribute('aria-expanded', String(abrir)) }
  if (abrir) {
    _chatVolta = document.activeElement
    saudarChat()
    if (!_chatConversasLidas) { _chatConversasLidas = true; carregarConversasChat(true); carregarUsoChat() }
    requestAnimationFrame(function () { document.getElementById('chat-input').focus() })
  } else {
    alternarHistChat(false)
    if (_chatVolta && document.contains(_chatVolta)) { _chatVolta.focus({ preventScroll: true }); _chatVolta = null }
  }
}

// Saudação com o primeiro nome (appState é preenchido pelo carregarUsuario)
function saudarChat() {
  const n = ((appState.usuario && appState.usuario.nome_completo) || '').trim().split(/\s+/)[0]
  const el = document.getElementById('chat-ola')
  if (el) el.textContent = n ? 'Olá, ' + n : 'Olá'
}

function expandirChat(forcar) {
  const p = document.getElementById('chat-panel')
  const exp = typeof forcar === 'boolean' ? forcar : !p.classList.contains('expandido')
  p.classList.toggle('expandido', exp)
  const b = document.getElementById('chat-btn-exp')
  if (b) {
    b.setAttribute('aria-label', exp ? 'Recolher o painel' : 'Expandir o painel')
    b.title = exp ? 'Recolher' : 'Expandir'
    b.innerHTML = auIc(exp ? 'recolher' : 'expandir')
  }
  if (exp) alternarHistChat(false)
  try { localStorage.setItem('au_chat_expandido', exp ? '1' : '0') } catch (e) { /* sem armazenamento */ }
}

// Lista de conversas: fixa no modo expandido; no estreito abre por cima
function alternarHistChat(forcar) {
  const p = document.getElementById('chat-panel')
  const abrir = typeof forcar === 'boolean' ? forcar : !p.classList.contains('hist-aberto')
  p.classList.toggle('hist-aberto', abrir)
  const b = document.getElementById('chat-btn-hist')
  if (b) b.setAttribute('aria-expanded', String(abrir))
}

// ── Conversas anteriores ───────────────────────────────────────────────
function grupoDia(iso) {
  const d = new Date(iso), hoje = new Date()
  const ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()
  const t = d.getTime()
  if (t >= ini) return 'Hoje'
  if (t >= ini - 86400e3) return 'Ontem'
  if (t >= ini - 6 * 86400e3) return 'Últimos 7 dias'
  return 'Mais antigas'
}

// Conversas da própria pessoa (RLS ia_conversas_select_proprio). retomar = abre a última se for de menos de 12 h
async function carregarConversasChat(retomar) {
  const { data, error } = await db.from('ia_conversas')
    .select('id, titulo, atualizado_em').eq('origem', 'auditoria').is('expurgado_em', null)
    .order('atualizado_em', { ascending: false }).limit(40)
  if (error) { console.warn('[chat] conversas', error.message); return }
  const cont = document.getElementById('chat-hist')
  if (cont) {
    let grupo = ''
    cont.innerHTML = (data || []).length ? (data || []).map(function (c) {
      const g = grupoDia(c.atualizado_em)
      const cab = g !== grupo ? '<div class="ach-grupo">' + g + '</div>' : ''
      grupo = g
      return cab + '<button type="button" class="ach-conv' + (c.id === _chatConversaId ? ' on' : '') + '" data-conv="' + esc(c.id) + '"' +
        (c.id === _chatConversaId ? ' aria-current="true"' : '') + ' title="' + esc(c.titulo || 'Conversa') + '">' + esc(c.titulo || 'Conversa') + '</button>'
    }).join('') : '<div class="ach-vazio">Suas conversas aparecem aqui.</div>'
  }
  const ult = (data || [])[0]
  if (retomar && ult && !_chatConversaId && !_chatMessages.length &&
      Date.now() - new Date(ult.atualizado_em).getTime() < 12 * 3600e3) {
    await abrirConversaChat(ult.id)
  }
}

function marcarConversaAtiva() {
  document.querySelectorAll('#chat-hist .ach-conv').forEach(function (b) {
    const on = b.dataset.conv === _chatConversaId
    b.classList.toggle('on', on)
    if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current')
  })
}

// Uso do próprio mês, no rodapé da lista de conversas
async function carregarUsoChat() {
  const el = document.getElementById('chat-uso')
  if (!el) return
  const per = typeof consumoPeriodo === 'function' ? consumoPeriodo('mes') : null
  if (!per) return
  const { data, error } = await db.rpc('fn_ia_consumo', { p_inicio: per[0], p_fim: per[1] })
  if (error) { el.textContent = ''; return }
  const meu = (data || []).find(function (l) { return l.usuario_id === appState.usuario?.id })
  el.textContent = meu
    ? 'Este mês: ' + plural(Number(meu.perguntas || 0), 'pergunta', 'perguntas') + ' · ' + fmtUsd(meu.custo_usd)
    : 'Este mês: nenhuma pergunta'
}

function limparBolhasChat(mostrarBoasVindas) {
  const msgsEl = document.getElementById('chat-msgs')
  if (!msgsEl) return
  Array.from(msgsEl.children).forEach(function (el) { if (el.id !== 'chat-welcome') el.remove() })
  const welcome = document.getElementById('chat-welcome')
  if (welcome) welcome.hidden = !mostrarBoasVindas
}

async function abrirConversaChat(id) {
  if (_chatEnviando) return
  if (!id) { novaConversaChat(); return }
  const { data, error } = await db.from('ia_mensagens')
    .select('id, papel, conteudo, ferramentas, custo_usd, avaliacao').eq('conversa_id', id).order('criado_em')
  if (error) { toast('Não foi possível abrir a conversa: ' + error.message, 'error'); return }
  _chatConversaId = id
  _chatMessages = (data || []).map(function (m) { return { role: m.papel, content: m.conteudo } })
  limparBolhasChat(!_chatMessages.length)
  let pergunta = ''
  ;(data || []).forEach(function (m) {
    if (m.papel === 'user') { pergunta = m.conteudo; adicionarBolha('user', m.conteudo); return }
    adicionarBolha('assistant', m.conteudo, m.ferramentas, { id: m.id, custo: m.custo_usd, avaliacao: m.avaliacao, pergunta: pergunta })
  })
  marcarConversaAtiva()
  alternarHistChat(false)
}

function novaConversaChat() {
  if (_chatEnviando) return
  _chatConversaId = null
  _chatMessages = []
  limparBolhasChat(true)
  marcarConversaAtiva()
  alternarHistChat(false)
  document.getElementById('chat-input')?.focus()
}

function perguntarSobre(id) {
  const a = _achados.find(function (x) { return x.id === id })
  if (!a) return
  toggleChat(true)
  const input = document.getElementById('chat-input')
  input.value = 'Sobre o achado "' + (a.titulo || '') + '"' + (a.referencia_label ? ' (' + a.referencia_label + ')' : '') + ': o que pode ter causado e como resolver?'
  autoResizeTextarea(input)
  input.focus()
}

function enviarSugestao(texto) {
  const input = document.getElementById('chat-input')
  if (input) { input.value = texto; autoResizeTextarea(input) }
  enviarMensagemChat()
}

// ── Mensagens ──────────────────────────────────────────────────────────
function rolarChat() {
  const m = document.getElementById('chat-msgs')
  if (m) m.scrollTop = m.scrollHeight
}

function fontesHtml(ferramentas, pendente) {
  const lista = (ferramentas || []).map(function (f) { return CHAT_FERRAMENTAS[f] || f })
  return lista.map(function (r, k) {
    const esperando = pendente && k === lista.length - 1
    return '<span class="ach-fonte' + (esperando ? ' rodando' : '') + '">' +
      (esperando ? '<span class="au-spin"></span>' : auIc('check', 'p')) + esc(r) + '</span>'
  }).join('')
}

function acoesHtml(extra) {
  const av = extra && extra.avaliacao
  return '<div class="ach-acoes">' +
    '<button type="button" class="ach-ac" data-acao="copiar" title="Copiar" aria-label="Copiar a resposta">' + auIc('copiar') + '</button>' +
    (extra && extra.pergunta ? '<button type="button" class="ach-ac" data-acao="refazer" title="Perguntar de novo" aria-label="Perguntar de novo">' + auIc('refazer') + '</button>' : '') +
    (extra && extra.id
      ? '<button type="button" class="ach-ac" data-acao="util" aria-pressed="' + (av === 1) + '" title="Resposta útil" aria-label="Resposta útil">' + auIc('polegar') + '</button>' +
        '<button type="button" class="ach-ac inv" data-acao="nao-util" aria-pressed="' + (av === -1) + '" title="Resposta não ajudou" aria-label="Resposta não ajudou">' + auIc('polegar') + '</button>'
      : '') +
    (extra && extra.custo != null ? '<span class="ach-custo" title="Custo estimado desta resposta">≈ ' + esc(fmtUsd(extra.custo)) + '</span>' : '') +
  '</div>'
}

// role: 'user' | 'assistant'. Para o assistente, extra = { id, custo, avaliacao, pergunta }
function adicionarBolha(role, texto, ferramentas, extra) {
  const msgsEl = document.getElementById('chat-msgs')
  if (!msgsEl) return null
  const div = document.createElement('div')
  if (role === 'user') {
    div.className = 'ach-msg u'
    div.innerHTML = '<div class="ach-pilula">' + esc(String(texto || '')) + '</div>'
  } else {
    div.className = 'ach-msg a'
    div._texto = String(texto || '')
    if (extra && extra.id) div.dataset.id = extra.id
    if (extra && extra.pergunta) div._pergunta = extra.pergunta
    div.innerHTML = '<span class="ach-av" aria-hidden="true">' + auIc('ia') + '</span>' +
      '<div class="ach-corpo">' +
        ((ferramentas || []).length ? '<div class="ach-fontes">' + fontesHtml(ferramentas) + '</div>' : '') +
        '<div class="ach-md">' + mdSeguro(texto) + '</div>' +
        acoesHtml(extra) +
      '</div>'
  }
  msgsEl.appendChild(div)
  rolarChat()
  return div
}

// Bloco do assistente que vai sendo preenchido pelo streaming
function novaRespostaAoVivo() {
  const msgsEl = document.getElementById('chat-msgs')
  const div = document.createElement('div')
  div.className = 'ach-msg a ao-vivo'
  div.innerHTML = '<span class="ach-av" aria-hidden="true">' + auIc('ia') + '</span>' +
    '<div class="ach-corpo">' +
      '<div class="ach-fontes"></div>' +
      '<div class="ach-status" role="status"><span class="au-spin"></span><span class="t">Pensando…</span></div>' +
      '<div class="ach-md"></div>' +
    '</div>'
  msgsEl.appendChild(div)
  rolarChat()
  return div
}

// Lê o stream SSE da Edge Function (eventos: conversa, ferramenta, texto, fim, erro)
async function lerEventos(res, aoEvento) {
  const leitor = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await leitor.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let k
    while ((k = buf.indexOf('\n\n')) >= 0) {
      const bloco = buf.slice(0, k); buf = buf.slice(k + 2)
      let ev = 'message', dado = ''
      bloco.split('\n').forEach(function (l) {
        if (l.startsWith('event:')) ev = l.slice(6).trim()
        else if (l.startsWith('data:')) dado += l.slice(5).trim()
      })
      let obj = null
      try { obj = dado ? JSON.parse(dado) : null } catch (e) { obj = null }
      aoEvento(ev, obj)
    }
  }
}

async function enviarMensagemChat() {
  if (_chatEnviando) return
  const input = document.getElementById('chat-input')
  const texto = (input?.value || '').trim()
  if (!texto) return

  input.value = ''
  autoResizeTextarea(input)
  const welcome = document.getElementById('chat-welcome')
  if (welcome) welcome.hidden = true

  if (texto.startsWith('/')) { await executarComandoChat(texto); return }

  _chatMessages.push({ role: 'user', content: texto })
  adicionarBolha('user', texto)
  const vivo = novaRespostaAoVivo()
  const elFontes = vivo.querySelector('.ach-fontes')
  const elStatus = vivo.querySelector('.ach-status')
  const elMd = vivo.querySelector('.ach-md')
  const usadas = []
  let bruto = '', agendado = false

  const desenhar = function () {
    agendado = false
    elMd.innerHTML = mdSeguro(bruto)
    rolarChat()
  }

  _chatEnviando = true
  const sendBtn = document.getElementById('chat-send')
  if (sendBtn) sendBtn.disabled = true
  let fim = null

  try {
    const { data: { session } } = await db.auth.getSession()
    const res = await fetch(SUPABASE_URL + '/functions/v1/chat-auditor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (session?.access_token || ''),
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ pergunta: texto, conversa_id: _chatConversaId, execucao_id: _chatExecucaoId, stream: true }),
    })
    if (!res.ok || !(res.headers.get('content-type') || '').includes('event-stream')) {
      const j = await res.json().catch(function () { return {} })
      throw new Error(j.error || 'Erro HTTP ' + res.status)
    }

    let erro = null
    await lerEventos(res, function (ev, d) {
      if (ev === 'conversa' && d && d.conversa_id) {
        _chatConversaId = d.conversa_id
      } else if (ev === 'ferramenta' && d) {
        // Texto escrito antes de uma consulta é preâmbulo: some quando a consulta começa
        bruto = ''; elMd.innerHTML = ''
        if (!usadas.includes(d.nome)) usadas.push(d.nome)
        elFontes.innerHTML = fontesHtml(usadas, true)
        elStatus.hidden = false
        elStatus.querySelector('.t').textContent = 'Consultando ' + (d.rotulo || d.nome) + '…'
      } else if (ev === 'texto' && d) {
        elStatus.hidden = true
        elFontes.innerHTML = fontesHtml(usadas, false)
        bruto += d.delta || ''
        if (!agendado) { agendado = true; requestAnimationFrame(desenhar) }
      } else if (ev === 'fim') {
        fim = d
      } else if (ev === 'erro') {
        erro = (d && d.error) || 'Erro do assistente.'
      }
    })
    if (erro) throw new Error(erro)
    if (!fim) throw new Error('A resposta foi interrompida. Tente de novo.')

    // Resposta oficial = a gravada no banco (substitui o que veio aos pedaços)
    vivo.remove()
    _chatMessages.push({ role: 'assistant', content: fim.resposta })
    adicionarBolha('assistant', fim.resposta, fim.ferramentas || usadas,
      { id: fim.mensagem_id, custo: fim.custo_usd, avaliacao: null, pergunta: texto })
    if (fim.conversa_id) _chatConversaId = fim.conversa_id
    carregarConversasChat(false)
    carregarUsoChat()
    carregarConsumo()
  } catch (e) {
    vivo.remove()
    // Erro fica só na tela: não entra no histórico
    _chatMessages.pop()
    const div = adicionarBolha('assistant', 'Não foi possível responder agora. ' + e.message)
    if (div) div.classList.add('erro')
  } finally {
    _chatEnviando = false
    if (sendBtn) sendBtn.disabled = false
    rolarChat()
  }
}

// Ações embaixo da resposta (delegação: vale para respostas novas e do histórico)
async function acaoResposta(btn) {
  const msg = btn.closest('.ach-msg')
  if (!msg) return
  const acao = btn.dataset.acao
  if (acao === 'copiar') {
    try { await navigator.clipboard.writeText(msg._texto || msg.querySelector('.ach-md').innerText); toast('Resposta copiada', 'success') }
    catch (e) { toast('Não foi possível copiar.', 'error') }
    return
  }
  if (acao === 'refazer') { if (msg._pergunta) enviarSugestao(msg._pergunta); return }
  if (acao === 'util' || acao === 'nao-util') {
    const id = msg.dataset.id
    if (!id) return
    const valor = acao === 'util' ? 1 : -1
    const ja = btn.getAttribute('aria-pressed') === 'true'
    const { error } = await db.rpc('fn_ia_avaliar', { p_mensagem: id, p_avaliacao: ja ? null : valor })
    if (error) { toast('Não foi possível registrar a avaliação.', 'error'); return }
    msg.querySelectorAll('[data-acao="util"],[data-acao="nao-util"]').forEach(function (b) { b.setAttribute('aria-pressed', 'false') })
    if (!ja) { btn.setAttribute('aria-pressed', 'true'); toast('Obrigado pela avaliação', 'success') }
  }
}

function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagemChat() }
}

function autoResizeTextarea(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

// ── Comandos do chat ───────────────────────────────────────────────────
async function executarComandoChat(cmd) {
  const cmdBase = cmd.trim().toLowerCase().split(/\s+/)[0]
  adicionarBolha('user', cmd)

  if (cmdBase === '/auditar') { await _cmdAuditar(); return }
  if (cmdBase === '/ajuda' || cmdBase === '/help') {
    adicionarBolha('assistant',
      'Comandos disponíveis:\n\n' +
      '- `/auditar` roda a auditoria completa (agentes especialistas, agente de orçamento e supervisor)\n' +
      '- `/ajuda` mostra esta mensagem\n\n' +
      'Ou escreva uma pergunta sobre os achados, contratos, TDRs, saldo, tarefas ou viagens.')
    return
  }
  adicionarBolha('assistant', 'Comando não reconhecido: `' + cmdBase + '`. Use `/ajuda` para ver os comandos.')
}

async function _cmdAuditar() {
  if (_rodando) { adicionarBolha('assistant', 'Já há uma auditoria em andamento. Aguarde o resultado.'); return }
  const sendBtn = document.getElementById('chat-send')
  _chatEnviando = true
  if (sendBtn) sendBtn.disabled = true
  setRodando(true)

  adicionarBolha('assistant',
    'Iniciando a varredura completa: TDR e contratos, financeiro, orçamento, produtos, viagens, Matriz, qualidade de dados, patrimônio e acessos.\n\n' +
    'Pode levar até 1 minuto…')

  try {
    const resultado = await chamarAuditor()
    const total = resultado.total_achados || 0
    const criticos = resultado.achados_criticos || 0
    const altos = resultado.achados_altos || 0
    const porDom = resultado.por_dominio || {}

    if (resultado.execucao_id) setChatExecucao(resultado.execucao_id, new Date().toISOString())

    let msg = '**Auditoria concluída.**\n\n'
    if (total === 0) {
      msg += 'Nenhuma inconsistência detectada.'
    } else {
      msg += '**' + plural(total, 'achado encontrado', 'achados encontrados') + '**\n'
      if (criticos > 0) msg += '- ' + plural(criticos, 'crítico', 'críticos') + ', ação urgente\n'
      if (altos > 0) msg += '- ' + plural(altos, 'alto', 'altos') + '\n'
      const linhasDom = Object.entries(porDom)
        .filter(function (kv) { return (kv[1] || 0) > 0 })
        .map(function (kv) { return '| ' + (DOMINIOS[kv[0]] || kv[0]) + ' | ' + kv[1] + ' |' })
      if (linhasDom.length) msg += '\n| Domínio | Achados |\n|---|---|\n' + linhasDom.join('\n') + '\n'
    }
    if (resultado.resumo) msg += '\n' + resultado.resumo
    if (total > 0) msg += '\n\nPergunte, por exemplo, "O que resolver primeiro?"'
    adicionarBolha('assistant', msg)

    setRodando(false)
    await Promise.all([carregarUltimaExecucao(), carregarHistorico()])
    toast('Auditoria concluída: ' + total + ' achados', criticos > 0 ? 'error' : total > 0 ? 'warning' : 'success')
  } catch (e) {
    console.error('[chat /auditar]', e)
    adicionarBolha('assistant', 'Erro ao executar a auditoria: ' + e.message + '\n\nTente de novo ou use o botão "Rodar auditoria" no topo da página.')
    setRodando(false)
    renderFaixa('erro', e.message)
  } finally {
    _chatEnviando = false
    if (sendBtn) sendBtn.disabled = false
  }
}

// ── Ligações (o painel é HTML fixo, já está no DOM) ────────────────────
;(function ligarChat() {
  const painel = document.getElementById('chat-panel')
  if (!painel) return
  painel.querySelectorAll('[data-sug]').forEach(function (b) { b.addEventListener('click', function () { enviarSugestao(b.dataset.sug) }) })
  const inp = document.getElementById('chat-input')
  inp.addEventListener('keydown', chatKeydown)
  inp.addEventListener('input', function () { autoResizeTextarea(inp) })
  painel.addEventListener('click', function (e) {
    const ac = e.target.closest('.ach-ac')
    if (ac) { acaoResposta(ac); return }
    const cv = e.target.closest('.ach-conv')
    if (cv) abrirConversaChat(cv.dataset.conv)
  })
  let exp = false
  try { exp = localStorage.getItem('au_chat_expandido') === '1' } catch (e) { exp = false }
  if (exp && window.innerWidth > 900) expandirChat(true)
})()
