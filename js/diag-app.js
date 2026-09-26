// ── DIMA · Diagnóstico Socioambiental — app de campo (controlador) ───────
//
// Regra que manda neste arquivo: NADA bloqueia o trabalho de campo.
//   · sem internet: abre com PIN, cria e preenche fichas, guarda fotos;
//   · acesso vencido: continua aplicando (o servidor aceita até 15 dias de
//     carência; depois disso a ficha espera no aparelho, nunca é apagada);
//   · pendências da revisão AVISAM, não travam.
//
// Sessão própria (storageKey 'dima-diag-session'), separada da mesa, e sem
// carregarUsuario() — ver comentário em pages/diagnostico-app.html.

const DIAG_APP_VERSAO = '1.3.0'
const DIAG_PIN_TAMANHO = 4
const DIAG_PIN_TENTATIVAS = 5

let diagDb = null
try {
  if (window.supabase && !window.supabase._stub && typeof window.supabase.createClient === 'function') {
    diagDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: 'dima-diag-session', storage: window.localStorage,
              persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  }
} catch (e) { console.warn('[diag-app] cliente Supabase indisponível:', e) }

const App = {
  usuario: null,        // { id, nome_completo, perfil } — guardado no aparelho
  ficha: null,          // ficha aberta
  estrutura: null,      // estrutura da versão da ficha aberta
  bloco: 0,
  fotos: [],
  pin: '', pinModo: 'entrar', pinPrimeiro: null,
}

// ── Utilidades de tela ─────────────────────────────────────────────────
function mostrar(id) {
  document.querySelectorAll('body > section').forEach(s => { s.hidden = s.id !== id })
  App.tela = id
  aplicarFaixaTreino()
  window.scrollTo(0, 0)
}

// ── Modo treino ────────────────────────────────────────────────────────
// Fichas TRE-… vão para o servidor de verdade, mas ficam fora de números e
// sugestões e são apagadas pela coordenação (diag_apagar_treino). Só com a
// permissão 'diagnostico_treino' (ou super_admin). A faixa laranja aparece
// com o modo ligado e em qualquer ficha de treino aberta.
async function carregarTreino() {
  const uid = App.usuario && App.usuario.id
  App.podeTreinar = !!(uid && await dConfigGet('pode_treinar_' + uid))
  App.treinoAtivo = App.podeTreinar && !!(await dConfigGet('modo_treino_' + uid))
  aplicarFaixaTreino()
}
function aplicarFaixaTreino() {
  const naFicha = ['t-aviso', 't-ficha', 't-revisao'].includes(App.tela)
  const on = naFicha ? !!(App.ficha && App.ficha.treino)
           : !['t-carregando', 't-login', 't-pin'].includes(App.tela) && !!App.treinoAtivo
  document.body.classList.toggle('treino', on)
  document.getElementById('faixa-treino').hidden = !on
}
async function questionarioAtual() {
  return App.treinoAtivo ? dCacheGet('questionario_treino') : dCacheGet('questionario')
}
function aviso(msg, tipo) {
  const cores = { ok: '#047857', erro: '#B91C1C', info: '#1D4ED8', aviso: '#B45309' }
  const el = document.createElement('div')
  el.className = 'aviso-flutuante'; el.setAttribute('role', 'status')
  el.style.background = cores[tipo || 'info']; el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3800)
}
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128
  const x = Array.from(b, v => v.toString(16).padStart(2, '0')).join('')
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20)
}
function hojeIso() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}
async function sha256(txt) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt))
  return Array.from(new Uint8Array(b), v => v.toString(16).padStart(2, '0')).join('')
}

// ── Boot ───────────────────────────────────────────────────────────────
async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('../diagnostico-sw.js', { scope: './diagnostico-app.html' }).catch(e => console.warn(e))
  }
  await dOfflineInit()
  dPersistir()
  ligarEventos()
  App.usuario = await dConfigGet('usuario_atual')
  if (App.usuario && await dConfigGet('pin_' + App.usuario.id)) abrirPin('entrar')
  else mostrar('t-login')
}

// ── Login (online) ─────────────────────────────────────────────────────
async function entrar(ev) {
  ev.preventDefault()
  const erro = document.getElementById('login-erro')
  const btn = document.getElementById('btn-login')
  erro.hidden = true
  if (!diagDb) { erro.textContent = 'Sem internet. O primeiro acesso precisa de conexão.'; erro.hidden = false; return }
  btn.disabled = true; btn.textContent = 'Entrando…'
  try {
    const email = document.getElementById('login-email').value.trim()
    const senha = document.getElementById('login-senha').value
    const { data, error } = await diagDb.auth.signInWithPassword({ email, password: senha })
    if (error) throw new Error(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar. Verifique a internet.')
    const uid = data.user.id
    const { data: u } = await diagDb.from('usuarios').select('id,nome_completo,perfil,ativo').eq('id', uid).single()
    if (!u || !u.ativo) throw new Error('Usuário inativo. Procure a coordenação.')
    const { data: pode } = await diagDb.rpc('fn_diag_pode_aplicar')
    const pendentes = (await dFichasNaoEnviadas(uid)).length
    if (!pode && !pendentes) {
      await diagDb.auth.signOut()
      throw new Error('Seu usuário não tem acesso ao Diagnóstico. Peça a liberação ao super_admin.')
    }
    const { data: perm } = await diagDb.from('usuario_permissoes').select('valido_ate,ativo')
      .eq('usuario_id', uid).eq('modulo', 'diagnostico').maybeSingle()
    App.usuario = { id: u.id, nome_completo: u.nome_completo, perfil: u.perfil,
                    acesso_ate: perm && perm.ativo ? perm.valido_ate : null }
    await dConfigSet('usuario_atual', App.usuario)
    await dSyncBaixarReferencias(uid).catch(e => console.warn('[diag-app] referências:', e))
    if (await dConfigGet('pin_' + uid)) irInicio()
    else abrirPin('criar')
  } catch (e) {
    erro.textContent = e.message; erro.hidden = false
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar'
  }
}

// ── PIN (abre o app offline) ───────────────────────────────────────────
// Mesmo PIN dos apps de campo do SIGUC: js/pin-baralho.js troca as bolinhas
// por cartas que viram um monte enquanto confere (verde = certo; abre de
// volta e treme = errado). Todo uso guarda com typeof: sem o módulo, as
// bolinhas do HTML continuam funcionando.
const pinEl = () => document.getElementById('pin-casas')
function abrirPin(modo) {
  App.pin = ''; App.pinModo = modo; App.pinPrimeiro = null; App.pinOcupado = false
  document.getElementById('pin-titulo').textContent = modo === 'entrar' ? 'Digite seu PIN de campo' : 'Crie um PIN de 4 números'
  document.getElementById('pin-sub').textContent = App.usuario ? App.usuario.nome_completo : ''
  document.getElementById('pin-erro').hidden = true
  if (typeof pinBaralhoMontar === 'function') pinBaralhoMontar(pinEl())
  desenharPin(); mostrar('t-pin')
}
function desenharPin() {
  if (typeof pinBaralhoPintar === 'function' && pinBaralhoPintar(pinEl(), App.pin)) return
  pinEl().querySelectorAll('.pin-dot').forEach((el, i) => el.classList.toggle('cheia', i < App.pin.length))
}
async function pinResultado(certo) {
  if (typeof pinBaralhoAprovar !== 'function') return
  await (certo ? pinBaralhoAprovar(pinEl()) : pinBaralhoRecusar(pinEl()))
}
async function teclaPin(d) {
  if (App.pinOcupado) return
  const erro = document.getElementById('pin-erro')
  if (d === 'apagar') { App.pin = App.pin.slice(0, -1); desenharPin(); return }
  if (d === 'ok') { if (App.pin.length < DIAG_PIN_TAMANHO) return }
  else {
    if (App.pin.length >= DIAG_PIN_TAMANHO) return
    App.pin += d; desenharPin()
    if (App.pin.length < DIAG_PIN_TAMANHO) return
  }
  erro.hidden = true
  App.pinOcupado = true
  try {
    // o monte é o próprio indicador de espera (nada muda de tamanho na tela)
    if (typeof pinBaralhoFechar === 'function') await pinBaralhoFechar(pinEl())
    await conferirPin(erro)
  } finally {
    App.pinOcupado = false
  }
}
async function conferirPin(erro) {
  const uid = App.usuario.id
  if (App.pinModo === 'entrar') {
    const reg = await dConfigGet('pin_' + uid)
    if (reg && await sha256(reg.sal + App.pin) === reg.hash) {
      await dConfigSet('pin_tentativas_' + uid, 0)
      await pinResultado(true)
      irInicio(); return
    }
    const n = (await dConfigGet('pin_tentativas_' + uid) || 0) + 1
    await dConfigSet('pin_tentativas_' + uid, n)
    await pinResultado(false)
    App.pin = ''; desenharPin()
    if (n >= DIAG_PIN_TENTATIVAS) {
      await dConfigSet('pin_' + uid, null)
      erro.textContent = 'PIN errado ' + n + ' vezes. Entre com e-mail e senha (as fichas continuam no aparelho).'
      erro.hidden = false
      setTimeout(() => mostrar('t-login'), 2500)
    } else { erro.textContent = 'PIN incorreto.'; erro.hidden = false }
    return
  }
  // criar / trocar: pede duas vezes
  if (!App.pinPrimeiro) {
    App.pinPrimeiro = App.pin; App.pin = ''
    if (typeof pinBaralhoLimpar === 'function') pinBaralhoLimpar(pinEl())
    desenharPin()
    document.getElementById('pin-titulo').textContent = 'Repita o PIN'
    return
  }
  if (App.pin !== App.pinPrimeiro) {
    await pinResultado(false)
    App.pinPrimeiro = null; App.pin = ''; desenharPin()
    document.getElementById('pin-titulo').textContent = 'Crie um PIN de 4 números'
    erro.textContent = 'Os PINs não conferem. Tente de novo.'; erro.hidden = false
    return
  }
  const sal = uuid()
  await dConfigSet('pin_' + uid, { sal, hash: await sha256(sal + App.pin) })
  await dConfigSet('pin_tentativas_' + uid, 0)
  await pinResultado(true)
  aviso('PIN criado.', 'ok')
  irInicio()
}

// ── Início ─────────────────────────────────────────────────────────────
const ROTULO_ESTADO = {
  rascunho: 'em andamento', pronta: 'na fila', enviando: 'enviando…', enviada: 'enviada',
  erro: 'com problema', aguardando_permissao: 'acesso vencido', conflito: 'já conferida',
}

async function irInicio() {
  mostrar('t-inicio')
  await desenharInicio()
  sincronizar(true)
}

async function desenharInicio() {
  await carregarTreino()
  const u = App.usuario
  document.getElementById('ini-usuario').textContent = u.nome_completo
  atualizarRede()
  const fichas = await dFichasDoUsuario(u.id)
  const q = await questionarioAtual()
  const ult = await dConfigGet('ultima_sync_' + u.id)
  document.getElementById('ini-ultima-sync').textContent = ult
    ? 'Última sincronização: ' + new Date(ult).toLocaleString('pt-BR') : 'Ainda não sincronizado neste aparelho'
  const cont = { rascunho: 0, fila: 0, enviada: 0 }
  fichas.forEach(f => {
    if (f.estado === 'rascunho') cont.rascunho++
    else if (f.estado === 'enviada') cont.enviada++
    else cont.fila++
  })
  document.getElementById('c-rascunho').textContent = cont.rascunho
  document.getElementById('c-fila').textContent = cont.fila
  document.getElementById('c-enviada').textContent = cont.enviada

  let avisos = ''
  if (App.treinoAtivo) avisos += '<div class="faixa faixa-treino-info">Modo treino ligado: as entrevistas novas saem com código TRE-, usam a versão mais nova do questionário (mesmo em rascunho) e não contam nos números. Desligue em ⚙ Configurações.</div>'
  else if (!q) avisos += '<div class="faixa faixa-aviso">Nenhum questionário publicado neste aparelho. Conecte à internet e sincronize. Se continuar assim, a coordenação ainda não publicou a versão do questionário.</div>'
  if (u.acesso_ate && Date.parse(u.acesso_ate) < Date.now())
    avisos += '<div class="faixa faixa-aviso">Seu acesso ao Diagnóstico venceu em ' + new Date(u.acesso_ate).toLocaleDateString('pt-BR') +
      '. Fichas concluídas até essa data ainda são aceitas por 15 dias. Peça a renovação ao super_admin.</div>'
  document.getElementById('ini-avisos').innerHTML = avisos
  document.getElementById('btn-nova').disabled = !q

  const grupos = [
    ['Para corrigir (devolvidas pela coordenação)', fichas.filter(f => f.status_servidor === 'devolvida' && f.estado !== 'enviada')],
    ['Com problema', fichas.filter(f => ['erro', 'conflito', 'aguardando_permissao'].includes(f.estado))],
    ['Em andamento', fichas.filter(f => f.estado === 'rascunho' && f.status_servidor !== 'devolvida')],
    ['Na fila de envio', fichas.filter(f => f.estado === 'pronta' || f.estado === 'enviando')],
    ['Enviadas', fichas.filter(f => f.estado === 'enviada')],
  ]
  const municipios = (await dCacheGet('municipios')) || []
  const comunidades = (await dCacheGet('comunidades')) || []
  const localidades = (await dCacheGet('localidades')) || []
  document.getElementById('ini-lista').innerHTML = grupos.filter(g => g[1].length).map(([tit, l]) =>
    '<h2 class="secao-titulo">' + esc(tit) + ' (' + l.length + ')</h2>' + l.map(f => {
      const com = f.comunidade_nova || (comunidades.find(c => c.id === f.comunidade_id) || {}).nome || ''
      const loc = f.localidade_nova || (localidades.find(l => l.id === f.localidade_id) || {}).nome || ''
      const mun = (municipios.find(m => m.ibge === f.municipio_ibge) || {}).nome || ''
      const selo = f.status_servidor === 'validada' ? 'validada' : f.status_servidor === 'devolvida' && f.estado !== 'enviada' ? 'devolvida' : f.estado
      const rot = selo === 'validada' ? 'validada' : selo === 'devolvida' ? 'devolvida' : ROTULO_ESTADO[f.estado]
      return '<button type="button" class="item-ficha" data-uuid="' + esc(f.uuid_cliente) + '">' +
        '<span class="meio"><span class="cod">' + esc(f.codigo) + (f.treino ? ' <span class="selo selo-treino">treino</span>' : '') + '</span>' +
        '<span class="sub">' + esc([loc ? com + ' / ' + loc : com, mun, f.aceitou_participar ? '' : 'recusa'].filter(Boolean).join(' · ')) + '</span>' +
        (f.erro_msg ? '<span class="sub" style="color:var(--erro)">' + esc(f.erro_msg) + '</span>' : '') +
        (f.motivo_devolucao && f.status_servidor === 'devolvida' ? '<span class="sub" style="color:var(--aviso)">' + esc(f.motivo_devolucao) + '</span>' : '') +
        '</span><span class="selo selo-' + esc(selo) + '">' + esc(rot) + '</span></button>'
    }).join('')).join('') || '<p class="dica" style="text-align:center;margin-top:24px">Nenhuma entrevista neste aparelho.</p>'
}

async function atualizarRede() {
  const el = document.getElementById('ini-rede')
  const on = diagDb && await dSyncTemConexao()
  el.textContent = on ? 'online' : 'sem sinal'
  el.classList.toggle('off', !on)
  return on
}

async function sincronizar(silencioso) {
  const btn = document.getElementById('btn-sync')
  btn.disabled = true; btn.textContent = '⟳ Sincronizando…'
  try {
    const r = await dSyncRodar(App.usuario.id, p => { btn.textContent = '⟳ Enviando ' + p.atual + ' de ' + p.total + '…' })
    if (r.situacao === 'sem_conexao') { if (!silencioso) aviso('Sem sinal. As fichas ficam guardadas e vão depois.', 'aviso') }
    else if (r.situacao === 'sem_sessao') { if (!silencioso) aviso('Sessão expirada. Entre com e-mail e senha para enviar.', 'aviso'); if (!silencioso) mostrar('t-login') }
    else if (r.situacao === 'ok') {
      if (r.enviadas || !silencioso) aviso(r.enviadas + ' ficha(s) enviada(s)' + (r.recusadas ? ', ' + r.recusadas + ' com problema' : '') + '.', r.recusadas ? 'aviso' : 'ok')
    }
  } catch (e) {
    console.warn('[diag-app] sincronização:', e)
    if (!silencioso) aviso('Não foi possível sincronizar agora.', 'erro')
  } finally {
    btn.disabled = false; btn.textContent = '⟳ Sincronizar'
    if (!document.getElementById('t-inicio').hidden) desenharInicio()
  }
}

// ── Nova entrevista ────────────────────────────────────────────────────
async function abrirNova() {
  const municipios = (await dCacheGet('municipios')) || []
  document.getElementById('nova-data').value = hojeIso()
  const sel = document.getElementById('nova-municipio')
  const ultimo = await dConfigGet('ultimo_municipio')
  sel.innerHTML = '<option value="">Escolha…</option>' + municipios.map(m =>
    '<option value="' + m.ibge + '"' + (m.ibge === ultimo ? ' selected' : '') + '>' + esc(m.nome) + '</option>').join('')
  await preencherComunidades()
  document.getElementById('nova-erro').hidden = true
  document.getElementById('nova-loc-outra').value = ''
  mostrar('t-nova')
}
async function preencherComunidades() {
  const ibge = +document.getElementById('nova-municipio').value
  const comunidades = ((await dCacheGet('comunidades')) || []).filter(c => c.municipio_ibge === ibge)
  const ultima = await dConfigGet('ultima_comunidade')
  document.getElementById('nova-comunidade').innerHTML = '<option value="">Escolha…</option>' +
    comunidades.map(c => '<option value="' + esc(c.id) + '"' + (c.id === ultima ? ' selected' : '') + '>' + esc(c.nome) + '</option>').join('') +
    '<option value="_nova">Outra (não está na lista)</option>'
  await mudouComunidade()
}
async function mudouComunidade() {
  const com = document.getElementById('nova-comunidade').value
  document.getElementById('nova-com-outra-wrap').hidden = com !== '_nova'
  // sublocalidades cadastradas pela coordenação (aba Admin da mesa)
  const locs = com && com !== '_nova'
    ? ((await dCacheGet('localidades')) || []).filter(l => l.comunidade_id === com) : []
  const ultima = await dConfigGet('ultima_localidade')
  document.getElementById('nova-loc-wrap').hidden = !locs.length
  document.getElementById('nova-localidade').innerHTML = '<option value="">Não informar</option>' +
    locs.map(l => '<option value="' + esc(l.id) + '"' + (l.id === ultima ? ' selected' : '') + '>' + esc(l.nome) + '</option>').join('') +
    '<option value="_nova">Outra (não está na lista)</option>'
  mudouLocalidade()
}
function mudouLocalidade() {
  document.getElementById('nova-loc-outra-wrap').hidden = document.getElementById('nova-localidade').value !== '_nova'
}
async function continuarNova() {
  const erro = document.getElementById('nova-erro')
  const ibge = +document.getElementById('nova-municipio').value
  const com = document.getElementById('nova-comunidade').value
  const outra = document.getElementById('nova-com-outra').value.trim()
  const data = document.getElementById('nova-data').value
  const temLoc = !document.getElementById('nova-loc-wrap').hidden
  const loc = temLoc ? document.getElementById('nova-localidade').value : ''
  const locOutra = document.getElementById('nova-loc-outra').value.trim()
  if (!data || !ibge || !com || (com === '_nova' && outra.length < 2)) {
    erro.textContent = 'Preencha data, município e comunidade.'; erro.hidden = false; return
  }
  if (loc === '_nova' && locOutra.length < 2) {
    erro.textContent = 'Escreva o nome da sublocalidade ou escolha "Não informar".'; erro.hidden = false; return
  }
  const treino = !!App.treinoAtivo
  const q = await questionarioAtual()
  if (!q) { erro.textContent = 'Questionário não disponível neste aparelho. Sincronize.'; erro.hidden = false; return }
  const mun = ((await dCacheGet('municipios')) || []).find(m => m.ibge === ibge)
  const disp = await dDispositivoId()
  App.ficha = {
    uuid_cliente: uuid(), usuario_id: App.usuario.id, estado: 'rascunho', treino,
    codigo: DiagRegras.gerarCodigo(mun.sigla, data, disp, await dProximoSeq(data), treino ? 'TRE' : 'DSA'),
    questionario_id: q.id, municipio_ibge: ibge,
    comunidade_id: com === '_nova' ? null : com, comunidade_nova: com === '_nova' ? outra : null,
    localidade_id: loc && loc !== '_nova' ? loc : null, localidade_nova: loc === '_nova' ? locOutra : null,
    dt_entrevista: data, iniciada_em: new Date().toISOString(), finalizada_em: null,
    aviso_lido: false, aceitou_participar: null, respostas: {}, moradores: [],
    entrevistado_nome: '', obs_localizacao: '', lat: null, lon: null, dispositivo_id: disp, bloco_atual: 0,
  }
  await dConfigSet('ultimo_municipio', ibge)
  if (com !== '_nova') await dConfigSet('ultima_comunidade', com)
  if (temLoc) await dConfigSet('ultima_localidade', loc && loc !== '_nova' ? loc : null)
  document.getElementById('aviso-texto').textContent = q.aviso_entrevistado
  document.getElementById('aviso-lido').checked = false
  document.getElementById('aviso-erro').hidden = true
  mostrar('t-aviso')
}
async function decidirAviso(aceitou) {
  const lido = document.getElementById('aviso-lido').checked
  if (!lido) {
    const e = document.getElementById('aviso-erro'); e.textContent = 'Marque que o aviso foi lido.'; e.hidden = false; return
  }
  const f = App.ficha
  f.aviso_lido = true; f.aceitou_participar = aceitou
  if (!aceitou) {
    f.estado = 'pronta'; f.finalizada_em = new Date().toISOString()
    await dFichaSalvar(f)
    aviso('Recusa registrada. Obrigado.', 'info')
    irInicio(); return
  }
  await dFichaSalvar(f)
  abrirFicha(f.uuid_cliente)
}

// ── Ficha ──────────────────────────────────────────────────────────────
async function abrirFicha(uuidFicha, irParaChave) {
  const f = await dFichaObter(uuidFicha)
  const qs = (await dCacheGet('questionarios')) || {}
  const q = qs[f.questionario_id] || await dCacheGet('questionario')
  if (!q || q.id !== f.questionario_id) { aviso('A versão do questionário desta ficha não está no aparelho. Sincronize com internet.', 'erro'); return }
  App.ficha = f; App.estrutura = q.estrutura
  App.bloco = f.bloco_atual || 0
  await carregarFotos()
  DiagForm.iniciar({
    ficha: f, estrutura: q.estrutura, sugestoes: await sugestoesCombinadas(), fotos: App.fotos,
    aoMudar: redesenhar => { salvarFichaAtual(); if (redesenhar) desenharBloco() },
    aoPedirGps: capturarGps, aoFoto: adicionarFoto, aoRemoverFoto: removerFoto,
  })
  DiagForm.sincronizarEntrevistado()
  document.getElementById('ficha-codigo').textContent = f.codigo
  document.getElementById('ficha-devolvida').innerHTML = f.status_servidor === 'devolvida' && f.motivo_devolucao
    ? '<div class="faixa faixa-aviso"><b>Devolvida pela coordenação:</b> ' + esc(f.motivo_devolucao) + '</div>' : ''
  if (irParaChave) App.bloco = blocoDaChave(irParaChave)
  mostrar('t-ficha')
  desenharBloco(irParaChave)
}

// sugestões do servidor + respostas que se repetem nas fichas DESTE aparelho
async function sugestoesCombinadas() {
  const s = JSON.parse(JSON.stringify((await dCacheGet('sugestoes')) || {}))
  const fichas = await dFichasDoUsuario(App.usuario.id)
  const add = (k, t) => { if (!t || t === DiagRegras.NR) return; s[k] = s[k] || []; if (!s[k].some(x => x.toLowerCase() === t.toLowerCase())) s[k].push(t) }
  const cont = {}
  fichas.forEach(f => {
    ;['producao_produtos', 'participa_org_quais'].forEach(k => { const t = (f.respostas || {})[k]; if (typeof t === 'string') cont[k + '|' + t.trim()] = (cont[k + '|' + t.trim()] || 0) + 1 })
    ;(f.moradores || []).forEach(m => ['parentesco', 'escolaridade', 'atividade_principal'].forEach(c => { if (m[c]) cont['moradores.' + c + '|' + m[c].trim()] = (cont['moradores.' + c + '|' + m[c].trim()] || 0) + 1 }))
  })
  Object.keys(cont).forEach(k => { if (cont[k] >= 2) { const i = k.indexOf('|'); add(k.slice(0, i), k.slice(i + 1)) } })
  return s
}

let _salvarTimer = null
function salvarFichaAtual() {
  clearTimeout(_salvarTimer)
  _salvarTimer = setTimeout(() => { if (App.ficha) dFichaSalvar(App.ficha) }, 250)
}

function blocoDaChave(chave) {
  if (chave === 'moradores' || chave === 'entrevistado_nome') return 0
  return Math.max(0, DiagForm.blocos().findIndex(b => b.perguntas.some(p => p.chave === chave)))
}

function desenharBloco(destacar) {
  const bs = DiagForm.blocos()
  const b = bs[App.bloco]
  document.getElementById('ficha-bloco').textContent = (App.bloco + 1) + ' de ' + bs.length + ' · ' + b.titulo
  document.getElementById('ficha-prog').style.width = Math.round(100 * (App.bloco + 1) / bs.length) + '%'
  const corpo = document.getElementById('ficha-corpo')
  corpo.innerHTML = DiagForm.renderBloco(App.bloco, destacar)
  corpo.querySelectorAll('.foto img').forEach((img, i) => { if (App.fotos[i] && App.fotos[i]._url) img.src = App.fotos[i]._url })
  // botões ficam no FIM do bloco (depois da última pergunta), não fixos
  document.getElementById('fim-bloco-txt').textContent = 'Fim do bloco ' + (App.bloco + 1) + ' de ' + bs.length + ' · ' + b.titulo
  document.getElementById('btn-anterior').disabled = App.bloco === 0
  document.getElementById('btn-proximo').innerHTML = App.bloco === bs.length - 1
    ? 'Revisar a ficha →' : 'Próximo →<small>' + esc(bs[App.bloco + 1].titulo) + '</small>'
  if (destacar) {
    const el = document.getElementById('perg-' + destacar)
    if (el) setTimeout(() => el.scrollIntoView({ block: 'center' }), 50)
  }
}

function navegar(delta) {
  const bs = DiagForm.blocos()
  if (App.bloco + delta >= bs.length) { abrirRevisao(); return }
  App.bloco = Math.max(0, Math.min(bs.length - 1, App.bloco + delta))
  App.ficha.bloco_atual = App.bloco
  salvarFichaAtual()
  desenharBloco()
  window.scrollTo(0, 0)
}

// GPS pontual: uma leitura, nunca trava (sem sinal = segue sem localização)
function capturarGps() {
  if (!navigator.geolocation) { aviso('Este aparelho não informa localização.', 'aviso'); return }
  aviso('Buscando localização…', 'info')
  navigator.geolocation.getCurrentPosition(p => {
    const f = App.ficha
    f.lat = Math.round(p.coords.latitude * 1e6) / 1e6
    f.lon = Math.round(p.coords.longitude * 1e6) / 1e6
    f.gps_precisao_m = Math.round(p.coords.accuracy * 10) / 10
    f.gps_em = new Date(p.timestamp).toISOString()
    salvarFichaAtual(); desenharBloco()
    aviso('Localização registrada.', 'ok')
  }, () => aviso('Não foi possível obter a localização. Pode seguir sem ela.', 'aviso'),
  { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 })
}

// ── Fotos: comprimidas no aparelho (~1600 px, JPEG). O canvas descarta o
// EXIF — inclusive o GPS gravado na foto; a localização oficial é a da ficha.
async function carregarFotos() {
  App.fotos.forEach(ft => { if (ft._url && ft._url.startsWith('blob:')) URL.revokeObjectURL(ft._url) })
  App.fotos.length = 0
  const lista = await dFotosDaFicha(App.ficha.uuid_cliente)
  lista.forEach(ft => { ft._url = ft.blob ? URL.createObjectURL(ft.blob) : '' ; App.fotos.push(ft) })
}
async function comprimir(arquivo) {
  const img = await createImageBitmap(arquivo)
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.8))
}
async function adicionarFoto(arquivo, tema, legenda) {
  if (App.fotos.length >= 8) { aviso('Limite de 8 fotos por ficha.', 'aviso'); return }
  try {
    const blob = await comprimir(arquivo)
    const ft = { uuid_cliente: uuid(), ficha_uuid: App.ficha.uuid_cliente, blob, tema,
                 legenda: legenda || null, tirada_em: new Date().toISOString(), enviada: false }
    await dFotoSalvar(ft)
    await carregarFotos(); desenharBloco()
  } catch (e) {
    console.warn(e); aviso('Não foi possível guardar a foto.', 'erro')
  }
}
async function removerFoto(uuidFoto) {
  await dFotoApagar(uuidFoto)
  await carregarFotos(); desenharBloco()
}

// ── Revisão antes de salvar ────────────────────────────────────────────
function abrirRevisao() {
  const f = App.ficha
  let alertas = []
  let erroEstrutura = null
  try {
    const norm = DiagRegras.normalizar(App.estrutura, f.respostas || {}, f.moradores || [])
    alertas = DiagRegras.alertas(App.estrutura, norm, f.moradores || [], { comunidade_nova: !f.comunidade_id })
  } catch (e) { erroEstrutura = e.message }
  document.getElementById('revisao-codigo').textContent = f.codigo
  const pend = alertas.filter(a => a.tipo === 'pendente').length
  document.getElementById('revisao-resumo').innerHTML = erroEstrutura
    ? '<div class="faixa faixa-erro">Há uma resposta em formato inválido (' + esc(erroEstrutura) + '). Volte à pergunta e responda de novo.</div>'
    : alertas.length === 0
      ? '<div class="faixa faixa-ok">Tudo respondido. Pode salvar.</div>'
      : '<div class="faixa faixa-aviso">' + (pend ? pend + ' pergunta(s) em branco. ' : '') +
        'Toque para voltar à pergunta e completar, ou marque "Não respondeu". Você pode salvar mesmo assim — a coordenação verá os avisos.</div>'
  document.getElementById('revisao-lista').innerHTML = alertas.map(a =>
    '<button type="button" class="item-ficha" data-ir="' + esc(a.chave || (a.n === 9 ? 'moradores' : '')) + '">' +
    '<span class="meio">' + esc(DiagRegras.descreverAlerta(a, App.estrutura)) + '</span>' +
    (a.chave || a.n === 9 ? '<span class="selo selo-pronta">ir</span>' : '') + '</button>').join('')
  document.getElementById('btn-concluir').disabled = !!erroEstrutura
  mostrar('t-revisao')
}

async function concluirFicha() {
  const f = App.ficha
  f.respostas = DiagRegras.normalizar(App.estrutura, f.respostas || {}, f.moradores || [])
  f.finalizada_em = new Date().toISOString()
  f.estado = 'pronta'
  f.erro_msg = null
  await dFichaSalvar(f)
  App.ficha = null
  aviso('Ficha salva e na fila de envio.', 'ok')
  irInicio()
}

// ── Configurações ──────────────────────────────────────────────────────
async function abrirConfig() {
  const naoEnv = (await dFichasNaoEnviadas(App.usuario.id)).length
  let uso = ''
  try { const e = await navigator.storage.estimate(); uso = Math.round((e.usage || 0) / 1048576) + ' MB usados' } catch (e) { /* opcional */ }
  document.getElementById('config-info').innerHTML =
    '<b>' + esc(App.usuario.nome_completo) + '</b><br>Aparelho: ' + esc(await dDispositivoId()) +
    '<br>Fichas não enviadas: ' + naoEnv + (uso ? '<br>' + uso : '') + '<br>Versão do app: ' + DIAG_APP_VERSAO
  await carregarTreino()
  document.getElementById('config-treino-wrap').hidden = !App.podeTreinar
  document.getElementById('config-treino').checked = !!App.treinoAtivo
  mostrar('t-config')
}
async function mudarModoTreino(ev) {
  await dConfigSet('modo_treino_' + App.usuario.id, ev.target.checked)
  await carregarTreino()
  aviso(App.treinoAtivo ? 'Modo treino ligado. Entrevistas novas serão de teste (TRE-).' : 'Modo treino desligado.', App.treinoAtivo ? 'aviso' : 'info')
}
async function sairDoAparelho() {
  const naoEnv = (await dFichasNaoEnviadas(App.usuario.id)).length
  if (naoEnv && !confirm('Há ' + naoEnv + ' ficha(s) não enviada(s). Elas continuam guardadas neste aparelho e serão enviadas quando você entrar de novo. Sair mesmo assim?')) return
  try { if (diagDb) await diagDb.auth.signOut() } catch (e) { /* offline: segue */ }
  await dConfigSet('usuario_atual', null)
  App.usuario = null
  mostrar('t-login')
}

// ── Eventos ────────────────────────────────────────────────────────────
function ligarEventos() {
  document.getElementById('form-login').addEventListener('submit', entrar)
  document.getElementById('teclado').addEventListener('click', ev => { const b = ev.target.closest('button[data-d]'); if (b) teclaPin(b.dataset.d) })
  document.getElementById('btn-pin-login').addEventListener('click', () => mostrar('t-login'))
  document.getElementById('btn-nova').addEventListener('click', abrirNova)
  document.getElementById('btn-sync').addEventListener('click', () => sincronizar(false))
  document.getElementById('btn-config').addEventListener('click', abrirConfig)
  document.getElementById('nova-municipio').addEventListener('change', preencherComunidades)
  document.getElementById('nova-comunidade').addEventListener('change', mudouComunidade)
  document.getElementById('nova-localidade').addEventListener('change', mudouLocalidade)
  document.getElementById('btn-nova-continuar').addEventListener('click', continuarNova)
  document.getElementById('btn-aceitou').addEventListener('click', () => decidirAviso(true))
  document.getElementById('btn-recusou').addEventListener('click', () => decidirAviso(false))
  document.getElementById('btn-anterior').addEventListener('click', () => navegar(-1))
  document.getElementById('btn-proximo').addEventListener('click', () => navegar(1))
  document.getElementById('btn-ficha-sair').addEventListener('click', async () => { if (App.ficha) await dFichaSalvar(App.ficha); irInicio() })
  document.getElementById('btn-revisao-voltar').addEventListener('click', () => { mostrar('t-ficha'); desenharBloco() })
  document.getElementById('btn-concluir').addEventListener('click', concluirFicha)
  document.getElementById('btn-trocar-pin').addEventListener('click', () => abrirPin('criar'))
  document.getElementById('btn-sair').addEventListener('click', sairDoAparelho)
  document.getElementById('config-treino').addEventListener('change', mudarModoTreino)
  document.querySelectorAll('[data-voltar]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.voltar === 't-inicio') irInicio(); else mostrar(b.dataset.voltar)
  }))
  const corpo = document.getElementById('ficha-corpo')
  corpo.addEventListener('click', ev => DiagForm.tratarClique(ev))
  corpo.addEventListener('input', ev => { if (ev.target.type !== 'file') DiagForm.tratarEntrada(ev) })
  // número mexe na 1ª linha da P9 e em avisos: redesenha ao sair do campo
  corpo.addEventListener('change', ev => {
    if (ev.target.type === 'file') DiagForm.tratarArquivo(ev)
    else if (ev.target.type === 'number' && ev.target.dataset.acao === 'numero') desenharBloco()
  })
  document.getElementById('ini-lista').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-uuid]'); if (!b) return
    const f = await dFichaObter(b.dataset.uuid)
    if (f.estado === 'rascunho') abrirFicha(f.uuid_cliente)
    else if (f.estado === 'erro' || f.estado === 'conflito' || f.estado === 'aguardando_permissao') {
      if (f.estado === 'erro' && f.aceitou_participar && confirm((f.erro_msg || 'Problema no envio') + '\n\nAbrir a ficha para corrigir?')) {
        f.estado = 'rascunho'; await dFichaSalvar(f); abrirFicha(f.uuid_cliente)
      } else if (f.estado !== 'erro') aviso(f.erro_msg || ROTULO_ESTADO[f.estado], 'aviso')
    } else aviso('Ficha ' + f.codigo + ': ' + (f.status_servidor === 'validada' ? 'validada pela coordenação' : ROTULO_ESTADO[f.estado]) + '.', 'info')
  })
  document.getElementById('revisao-lista').addEventListener('click', ev => {
    const b = ev.target.closest('[data-ir]'); if (!b || !b.dataset.ir) return
    App.bloco = blocoDaChave(b.dataset.ir)
    mostrar('t-ficha'); desenharBloco(b.dataset.ir)
  })
  window.addEventListener('online', () => { if (App.usuario && !document.getElementById('t-inicio').hidden) sincronizar(true) })
  document.addEventListener('visibilitychange', () => { if (document.hidden && App.ficha) dFichaSalvar(App.ficha) })
}

boot().catch(e => { console.error('[diag-app] falha no boot:', e); mostrar('t-login') })
