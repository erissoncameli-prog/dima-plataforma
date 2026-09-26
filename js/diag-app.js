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

const DIAG_APP_VERSAO = '1.6.2'
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
  pend: null,           // modo pendências: { seq: [{chave, n}], atual, vistas: Set }
  abaIni: 'entrevistas',
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
  // perfil que não aplica ficha real (coordenação) usa o app SÓ em treino
  App.soTreino = !!(App.usuario && App.usuario.so_treino)
  App.treinoAtivo = App.podeTreinar && (App.soTreino || !!(await dConfigGet('modo_treino_' + uid)))
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
    navigator.serviceWorker.register('../diagnostico-sw.js', { scope: './diagnostico-app.html' })
      .then(reg => { App.swReg = reg; vigiarAtualizacao(reg) })
      .catch(e => console.warn(e))
  }
  atualizarBotoesInstalar()
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
    // coordenação não aplica ficha real; com o módulo "modo treino" entra só para treinar
    const { data: treina } = pode ? { data: false } : await diagDb.rpc('fn_diag_pode_treinar')
    const pendentes = (await dFichasNaoEnviadas(uid)).length
    if (!pode && !treina && !pendentes) {
      await diagDb.auth.signOut()
      throw new Error(u.perfil === 'coordenacao'
        ? 'A coordenação não aplica questionários pelo app. Para testar e treinar, peça ao super_admin a permissão "Diagnóstico — modo treino". A gestão das fichas fica na página Diagnóstico da plataforma.'
        : u.perfil === 'tecnico'
          ? 'Seu usuário não tem acesso ao Diagnóstico. Peça a liberação ao super_admin.'
          : 'Seu perfil não aplica questionários pelo app. A consulta fica na página Diagnóstico da plataforma.')
    }
    if (!pode && treina) await dConfigSet('pode_treinar_' + uid, true)
    const { data: perm } = await diagDb.from('usuario_permissoes').select('valido_ate,ativo')
      .eq('usuario_id', uid).eq('modulo', 'diagnostico').maybeSingle()
    App.usuario = { id: u.id, nome_completo: u.nome_completo, perfil: u.perfil,
                    acesso_ate: perm && perm.ativo ? perm.valido_ate : null, so_treino: !pode && !!treina }
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
  if (App.soTreino) avisos += '<div class="faixa faixa-treino-info">Seu perfil (' + esc(ROTULO_PERFIL[u.perfil] || u.perfil) + ') usa o app só em <b>modo treino</b>: as entrevistas saem com código TRE-, não contam nos números e a coordenação apaga depois.</div>'
  else if (App.treinoAtivo) avisos += '<div class="faixa faixa-treino-info">Modo treino ligado: as entrevistas novas saem com código TRE-, usam a versão mais nova do questionário (mesmo em rascunho) e não contam nos números. Desligue em ⚙ Configurações.</div>'
  else if (!q) avisos += '<div class="faixa faixa-aviso">Nenhum questionário publicado neste aparelho. Conecte à internet e sincronize. Se continuar assim, a coordenação ainda não publicou a versão do questionário.</div>'
  if (u.acesso_ate && Date.parse(u.acesso_ate) < Date.now())
    avisos += '<div class="faixa faixa-aviso">Seu acesso ao Diagnóstico venceu em ' + new Date(u.acesso_ate).toLocaleDateString('pt-BR') +
      '. Fichas concluídas até essa data ainda são aceitas por 15 dias. Peça a renovação ao super_admin.</div>'
  document.getElementById('ini-avisos').innerHTML = avisos
  document.getElementById('btn-nova').disabled = !q
  trocarAbaInicio(App.abaIni, true)

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
async function abrirFicha(uuidFicha, irParaChave, irParaRevisao) {
  const f = await dFichaObter(uuidFicha)
  let qs = (await dCacheGet('questionarios')) || {}
  if (!qs[f.questionario_id] && diagDb && await dSyncTemConexao()) {
    await dSyncGarantirVersoes(App.usuario.id)          // versão antiga (ex.: devolvida na v1)
    qs = (await dCacheGet('questionarios')) || {}
  }
  const q = qs[f.questionario_id] || await dCacheGet('questionario')
  if (!q || q.id !== f.questionario_id) { aviso('A versão do questionário desta ficha não está no aparelho. Conecte à internet e toque em Sincronizar.', 'erro'); return }
  App.ficha = f; App.estrutura = q.estrutura
  App.bloco = f.bloco_atual || 0
  sairModoPendencias()
  await carregarFotos()
  DiagForm.iniciar({
    ficha: f, estrutura: q.estrutura, sugestoes: await sugestoesCombinadas(), fotos: App.fotos,
    aoMudar: redesenhar => { salvarFichaAtual(); if (redesenhar) redesenharFicha() },
    aoPedirGps: capturarGps, aoFoto: adicionarFoto, aoRemoverFoto: removerFoto,
  })
  DiagForm.sincronizarEntrevistado()
  document.getElementById('ficha-codigo').textContent = f.codigo
  document.getElementById('ficha-devolvida').innerHTML = f.status_servidor === 'devolvida' && f.motivo_devolucao
    ? '<div class="faixa faixa-aviso"><b>Devolvida pela coordenação:</b> ' + esc(f.motivo_devolucao) + '</div>' : ''
  if (irParaChave) App.bloco = blocoDaChave(irParaChave)
  // devolvida: abre na revisão (motivo + pendências agrupadas), não no bloco 1
  if (irParaRevisao) { abrirRevisao(); return }
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
  document.getElementById('revisao-devolvida').innerHTML = f.status_servidor === 'devolvida' && f.motivo_devolucao
    ? '<div class="faixa faixa-aviso"><b>Devolvida pela coordenação:</b> ' + esc(f.motivo_devolucao) + '</div>' : ''
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
  const btnPend = document.getElementById('btn-pendencias')
  const nPend = erroEstrutura ? 0 : pendentesAgora().length
  btnPend.hidden = nPend === 0
  btnPend.textContent = nPend === 1 ? 'Resolver a pendência →' : 'Resolver as ' + nPend + ' pendências, uma por vez →'
  mostrar('t-revisao')
}

// ── Modo pendências ────────────────────────────────────────────────────
// Da revisão, vai direto a cada pergunta em branco, uma por vez, sem passar
// pelos blocos já respondidos. A lista é recalculada a cada resposta (mesma
// regra da revisão, DiagRegras.alertas): pergunta que passa a valer por salto
// entra na fila; a que deixa de valer sai (se ainda não foi vista).
function pendentesAgora() {
  const f = App.ficha
  try {
    const norm = DiagRegras.normalizar(App.estrutura, f.respostas || {}, f.moradores || [])
    return DiagRegras.alertas(App.estrutura, norm, f.moradores || [], { comunidade_nova: !f.comunidade_id })
      .filter(a => a.tipo === 'pendente' && a.chave)
      .map(a => ({ chave: a.chave, n: a.n }))
      .sort((a, b) => a.n - b.n)
  } catch (e) { return [] }
}

function abrirPendencias(chaveInicial) {
  const lista = pendentesAgora()
  if (!lista.length) { abrirRevisao(); return }
  const ini = lista.find(p => p.chave === chaveInicial) || lista[0]
  App.pend = { seq: lista, atual: ini.chave, vistas: new Set([ini.chave]) }
  document.getElementById('bloco-nav').hidden = true
  document.getElementById('pend-nav').hidden = false
  document.getElementById('pend-barra').hidden = false
  mostrar('t-ficha')
  desenharPendencia()
}

function sairModoPendencias() {
  App.pend = null
  document.getElementById('bloco-nav').hidden = false
  document.getElementById('pend-nav').hidden = true
  document.getElementById('pend-barra').hidden = true
}

// a sequência só cresce com o que o salto abriu; o que já foi visto fica
// (para o "Anterior" continuar funcionando e o ponto ficar verde)
function atualizarSeqPendencias() {
  const agora = pendentesAgora()
  const emAberto = new Set(agora.map(p => p.chave))
  const pd = App.pend
  pd.seq = pd.seq.filter(p => emAberto.has(p.chave) || pd.vistas.has(p.chave))
  agora.forEach(p => { if (!pd.seq.some(x => x.chave === p.chave)) pd.seq.push(p) })
  pd.seq.sort((a, b) => a.n - b.n)
  return emAberto
}

function proximaPendencia(emAberto) {
  const pd = App.pend
  const i = pd.seq.findIndex(p => p.chave === pd.atual)
  return pd.seq.slice(i + 1).find(p => emAberto.has(p.chave)) || null
}

function desenharPendencia() {
  const pd = App.pend
  const emAberto = atualizarSeqPendencias()
  const i = pd.seq.findIndex(p => p.chave === pd.atual)
  document.getElementById('ficha-bloco').textContent = 'Corrigindo pendências'
  document.getElementById('ficha-prog').style.width = Math.round(100 * (i + 1) / pd.seq.length) + '%'
  const feitas = pd.seq.filter(p => !emAberto.has(p.chave)).length
  // pontos só enquanto cabem numa linha; com muitas, só a contagem de resolvidas
  document.getElementById('pend-barra').innerHTML = '<b>Pendência ' + (i + 1) + ' de ' + pd.seq.length + '</b>' +
    (pd.seq.length <= 15
      ? '<span class="pend-pontos" aria-hidden="true">' + pd.seq.map(p =>
          '<i class="' + (p.chave === pd.atual ? 'atual' : emAberto.has(p.chave) ? '' : 'feita') + '"></i>').join('') + '</span>'
      : ' <span class="pend-feitas">' + feitas + ' resolvida' + (feitas === 1 ? '' : 's') + '</span>')
  const corpo = document.getElementById('ficha-corpo')
  corpo.innerHTML = DiagForm.renderPendencia(pd.atual)
  corpo.querySelectorAll('.foto img').forEach((img, k) => { if (App.fotos[k] && App.fotos[k]._url) img.src = App.fotos[k]._url })
  document.getElementById('btn-pend-anterior').disabled = i <= 0
  const prox = proximaPendencia(emAberto)
  const perg = prox && prox.chave !== 'moradores' ? DiagRegras.porChave(App.estrutura)[prox.chave] : null
  document.getElementById('btn-pend-proxima').innerHTML = prox
    ? 'Próxima →<small>P' + prox.n + (perg ? ' · ' + esc(perg.texto) : ' · Moradores') + '</small>'
    : 'Concluir →<small>voltar à revisão</small>'
}

function navegarPendencia(delta) {
  const pd = App.pend
  salvarFichaAtual()
  if (delta > 0) {
    const prox = proximaPendencia(atualizarSeqPendencias())
    if (!prox) { sairModoPendencias(); abrirRevisao(); return }
    pd.atual = prox.chave
  } else {
    const i = pd.seq.findIndex(p => p.chave === pd.atual)
    if (i <= 0) return
    pd.atual = pd.seq[i - 1].chave
  }
  pd.vistas.add(pd.atual)
  desenharPendencia()
  window.scrollTo(0, 0)
}

function redesenharFicha() {
  if (App.pend) desenharPendencia(); else desenharBloco()
}

// ── Meu painel ─────────────────────────────────────────────────────────
// Só as fichas de quem está logado. Base = foto do servidor
// (diag_meu_painel, trazida na sincronização e guardada no aparelho, abre
// sem sinal) + as concluídas que ainda estão na fila deste aparelho (ainda
// não chegaram ao servidor). Treino fica sempre à parte.
function trocarAbaInicio(aba, soDesenhar) {
  App.abaIni = aba
  document.getElementById('aba-entrevistas').setAttribute('aria-selected', aba === 'entrevistas')
  document.getElementById('aba-painel').setAttribute('aria-selected', aba === 'painel')
  document.getElementById('ini-entrevistas').hidden = aba !== 'entrevistas'
  document.getElementById('ini-painel').hidden = aba !== 'painel'
  if (aba === 'painel') desenharPainel()
  if (!soDesenhar) window.scrollTo(0, 0)
}

const _fmtN = n => Number(n || 0).toLocaleString('pt-BR')
function _diaIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }

async function desenharPainel() {
  const u = App.usuario
  const el = document.getElementById('ini-painel')
  const srv = (await dConfigGet('painel_' + u.id)) || null
  const fichas = await dFichasDoUsuario(u.id)
  // concluídas que ainda não estão no servidor (nunca enviadas)
  const naFila = fichas.filter(f => !f.servidor_id && !f.status_servidor &&
    ['pronta', 'enviando', 'erro', 'aguardando_permissao'].includes(f.estado))
  const locais = naFila.filter(f => !f.treino)
  const treino = ((srv && srv.treino) || 0) + naFila.filter(f => f.treino).length
  const rodape = '<p class="dica" style="text-align:center">' + (srv
    ? 'Atualizado em ' + new Date(srv.gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : 'Sincronize com internet para trazer os números do servidor.') +
    (treino ? ' · treino fora da conta (' + treino + ' ficha' + (treino > 1 ? 's' : '') + ' TRE-)' : '') + '</p>'

  if (App.soTreino) {
    el.innerHTML = '<div class="pn-total"><b>' + _fmtN(treino) + '</b><span>fichas de treino feitas por você</span></div>' +
      '<div class="faixa faixa-treino-info">Seu perfil usa o app só em modo treino. Fichas de treino não contam nos números do diagnóstico.</div>' + rodape
    return
  }

  const st = (srv && srv.por_status) || {}
  const total = ((srv && srv.total) || 0) + locais.length
  const aceitasLoc = locais.filter(f => f.aceitou_participar)
  const recusas = ((srv && srv.recusas) || 0) + (locais.length - aceitasLoc.length)
  const pessoas = ((srv && srv.pessoas) || 0) + aceitasLoc.reduce((s, f) => s + (f.moradores || []).length, 0)
  const porDia = {}
  ;((srv && srv.por_dia) || []).forEach(d => { porDia[d.dia] = (porDia[d.dia] || 0) + d.n })
  locais.forEach(f => { porDia[f.dt_entrevista] = (porDia[f.dt_entrevista] || 0) + 1 })
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0)
  const dias = []
  for (let k = 13; k >= 0; k--) { const d = new Date(hoje); d.setDate(d.getDate() - k); dias.push(_diaIso(d)) }
  const nHoje = porDia[dias[13]] || 0
  const nSemana = dias.slice(7).reduce((s, d) => s + (porDia[d] || 0), 0)
  const max = Math.max(1, ...dias.map(d => porDia[d] || 0))
  const ddmm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7)

  const comunidades = (await dCacheGet('comunidades')) || []
  const porCom = {}
  ;((srv && srv.por_comunidade) || []).forEach(c => { porCom[c.nome] = (porCom[c.nome] || 0) + c.n })
  locais.forEach(f => {
    const nome = f.comunidade_nova || (comunidades.find(c => c.id === f.comunidade_id) || {}).nome || '—'
    porCom[nome] = (porCom[nome] || 0) + 1
  })
  const coms = Object.entries(porCom).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  const selo = (cls, txt, n) => n ? '<span class="selo ' + cls + '">' + txt.replace('#', _fmtN(n)) + '</span>' : ''
  el.innerHTML =
    '<div class="pn-total"><b>' + _fmtN(total) + '</b><span>entrevista' + (total === 1 ? '' : 's') + ' feita' + (total === 1 ? '' : 's') + ' por você</span></div>' +
    '<div class="pn-status">' +
      selo('selo-validada', '✓ # validada' + ((st.validada || 0) === 1 ? '' : 's'), st.validada) +
      selo('selo-pronta', '● # em conferência', st.enviada) +
      selo('selo-devolvida', '↺ # para corrigir', st.devolvida) +
      selo('selo-rascunho', '# no aparelho', locais.length) +
      selo('selo-rascunho', '# descartada' + ((st.descartada || 0) === 1 ? '' : 's'), st.descartada) +
    '</div>' +
    '<div class="pn-kpis">' +
      '<div class="pn-kpi"><b>' + _fmtN(nHoje) + '</b><span>hoje · ' + _fmtN(nSemana) + ' em 7 dias</span></div>' +
      '<div class="pn-kpi"><b>' + _fmtN(pessoas) + '</b><span>pessoas nos domicílios</span></div>' +
      '<div class="pn-kpi"><b>' + (srv && srv.tempo_medio_min != null ? _fmtN(srv.tempo_medio_min) + ' min' : '—') + '</b><span>tempo médio de entrevista</span></div>' +
      '<div class="pn-kpi"><b>' + _fmtN(recusas) + '</b><span>recusa' + (recusas === 1 ? '' : 's') +
        (total ? ' · ' + Math.round(100 * (total - recusas) / total) + '% aceitaram' : '') + '</span></div>' +
    '</div>' +
    '<div class="pn-cartao"><h3>Entrevistas por dia · últimos 14 dias</h3>' +
      '<div class="pn-barras" role="img" aria-label="' + esc(dias.map(d => ddmm(d) + ': ' + (porDia[d] || 0)).join('; ')) + '">' +
      dias.map((d, k) => {
        const n = porDia[d] || 0
        return '<span class="col' + (k === 13 ? ' hoje' : '') + '" title="' + ddmm(d) + ': ' + n + '">' +
          (n && n === max ? '<em style="bottom:calc(' + Math.round(100 * n / max) + '% + 2px)">' + n + '</em>' : '') +
          '<i style="height:' + (n ? Math.max(4, Math.round(100 * n / max)) : 0) + '%"></i></span>'
      }).join('') + '</div>' +
      '<div class="pn-eixo"><span>' + ddmm(dias[0]) + '</span><span>hoje</span></div></div>' +
    (coms.length ? '<div class="pn-cartao"><h3>Por comunidade</h3>' +
      coms.map(([nome, n]) => '<div class="pn-com"><span>' + esc(nome) + '</span><b>' + _fmtN(n) + '</b></div>').join('') + '</div>' : '') +
    rodape
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
// Mesmo conjunto dos apps de campo do SIGUC (Água, Brigadas, Frota,
// Biomonitor), no que cabe aqui: perfil, armazenamento, listas, PIN,
// instalar (aqui e em outro aparelho por QR), atualização, privacidade.
const ROTULO_PERFIL = { super_admin: 'Super admin', coordenacao: 'Coordenação', tecnico: 'Técnico(a) de campo',
  consultor_externo: 'Consultor externo', visualizador: 'Visualizador', financeiro: 'Financeiro' }
async function abrirConfig() {
  const u = App.usuario
  const fichas = await dFichasDoUsuario(u.id)
  const naoEnv = (await dFichasNaoEnviadas(u.id)).length
  document.getElementById('cfg-avatar').textContent = (u.nome_completo || '?').trim().charAt(0).toUpperCase()
  document.getElementById('cfg-nome').textContent = u.nome_completo
  document.getElementById('cfg-perfil').textContent = (ROTULO_PERFIL[u.perfil] || u.perfil || '') +
    (u.acesso_ate ? ' · acesso até ' + new Date(u.acesso_ate).toLocaleDateString('pt-BR') : '')
  document.getElementById('cfg-aparelho').textContent = 'Aparelho ' + (await dDispositivoId()) + (ehInstalado() ? ' · app instalado' : ' · aberto no navegador')
  document.getElementById('cfg-versao').textContent = 'Versão do app ' + DIAG_APP_VERSAO
  document.getElementById('cfg-fichas').textContent = fichas.length + ' ficha(s) neste aparelho · ' + naoEnv + ' ainda não enviada(s)'
  try {
    const e = await navigator.storage.estimate()
    const pct = e.quota ? Math.min(100, Math.round(100 * e.usage / e.quota)) : 0
    document.getElementById('cfg-quota-barra').style.width = Math.max(pct, 1) + '%'
    const prot = navigator.storage.persisted ? await navigator.storage.persisted() : false
    document.getElementById('cfg-quota').textContent = (e.usage / 1048576).toFixed(1) + ' MB usados de ' +
      Math.round((e.quota || 0) / 1048576) + ' MB · ' + (prot ? 'dados protegidos contra limpeza automática' : 'o sistema pode limpar se faltar espaço')
  } catch (e) { document.getElementById('cfg-quota').textContent = 'Não disponível neste navegador' }
  const q = await questionarioAtual()
  document.getElementById('cfg-quest').textContent = q ? 'Questionário ' + q.codigo + ' v' + q.versao + (q.status === 'rascunho' ? ' (rascunho — treino)' : '') : 'Nenhum questionário baixado'
  const ult = await dConfigGet('ultima_sync_' + u.id)
  document.getElementById('cfg-sync').textContent = ult ? 'Última sincronização: ' + new Date(ult).toLocaleString('pt-BR') : 'Ainda não sincronizado neste aparelho'
  const nTreino = fichas.filter(f => f.treino).length
  document.getElementById('btn-cfg-limpar-treino').hidden = !nTreino
  document.getElementById('cfg-n-treino').textContent = nTreino + ' ficha(s) TRE-'
  await carregarTreino()
  document.getElementById('config-treino-wrap').hidden = !App.podeTreinar
  document.getElementById('config-treino').checked = !!App.treinoAtivo
  document.getElementById('config-treino').disabled = App.soTreino
  document.getElementById('config-treino-so').hidden = !App.soTreino
  atualizarBotoesInstalar()
  mostrar('t-config')
}

function abrirOv(id) { document.getElementById(id).hidden = false }
function fecharOv(el) { el.closest('.ov').hidden = true }

// QR com o endereço da página de instalação (gerado no aparelho, sem internet)
function abrirQRInstalacao() {
  const url = new URL('instalar-diagnostico.html', location.href).href
  const img = document.getElementById('ov-qr-img')
  try {
    const qr = qrcode(0, 'M'); qr.addData(url); qr.make()
    img.src = qr.createDataURL(8, 4); img.hidden = false
  } catch (e) { img.hidden = true }
  document.getElementById('ov-qr-link').textContent = url
  abrirOv('ov-qr')
}

// ── Instalar neste aparelho (Android: prompt do Chrome; iPhone: Safari) ──
let _pedidoInstalar = null
window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); _pedidoInstalar = ev; atualizarBotoesInstalar() })
window.addEventListener('appinstalled', () => { _pedidoInstalar = null; atualizarBotoesInstalar(); aviso('App instalado. Use sempre pelo ícone.', 'ok') })
function ehIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) }
function ehInstalado() {
  try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true } catch (e) { return false }
}
function atualizarBotoesInstalar() {
  const mostrar = !ehInstalado()
  ;['btn-cfg-instalar', 'btn-login-instalar'].forEach(id => { const b = document.getElementById(id); if (b) b.hidden = !mostrar })
}
async function instalarAqui() {
  if (_pedidoInstalar) {
    _pedidoInstalar.prompt()
    try { await _pedidoInstalar.userChoice } catch (e) { /* ignorado */ }
    _pedidoInstalar = null; atualizarBotoesInstalar(); return
  }
  const passos = ehIOS()
    ? ['Abra esta página no <b>Safari</b> (no Chrome do iPhone não funciona).',
       'Toque em <b>compartilhar</b> (quadrado com seta para cima).',
       'Toque em <b>Adicionar à Tela de Início</b> → <b>Adicionar</b>.',
       'Use sempre pelo ícone: aberto pelo Safari, o iPhone pode apagar os dados guardados.']
    : ['Abra esta página no <b>Google Chrome</b>.',
       'Toque no menu <b>⋮</b> (canto de cima).',
       'Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b> → <b>Instalar</b>.',
       'Use sempre pelo ícone <b>Diagnóstico</b> da tela inicial.']
  document.getElementById('ov-instalar-passos').innerHTML = passos.map(p => '<li>' + p + '</li>').join('')
  abrirOv('ov-instalar')
}

// ── Atualização do app (service worker) ──────────────────────────────
// O SW novo se instala sozinho (skipWaiting) quando VERSAO muda; aqui só
// avisamos e recarregamos. Recarregar não perde nada: a ficha já está
// gravada no aparelho a cada toque.
function vigiarAtualizacao(reg) {
  const tinhaControle = !!navigator.serviceWorker.controller
  reg.addEventListener('updatefound', () => {
    const nw = reg.installing
    if (!nw) return
    nw.addEventListener('statechange', () => {
      if (nw.state !== 'activated') return
      if (App.atualizandoManual) { aviso('Atualização encontrada — recarregando…', 'ok'); setTimeout(() => location.reload(), 900) }
      else if (tinhaControle) document.getElementById('banner-update').hidden = false
    })
  })
  if (navigator.onLine) reg.update().catch(() => {})
}
async function verificarAtualizacao() {
  if (!navigator.onLine || !(await dSyncTemConexao().catch(() => false))) { aviso('Sem internet para verificar agora.', 'aviso'); return }
  const reg = App.swReg || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration('./diagnostico-app.html'))
  if (!reg) { location.reload(); return }
  aviso('Verificando atualização…', 'info')
  App.atualizandoManual = true
  let achou = false
  const marca = () => { achou = true }
  reg.addEventListener('updatefound', marca, { once: true })
  try { await reg.update() } catch (e) { /* segue */ }
  setTimeout(() => {
    if (!achou && !reg.installing && !reg.waiting) { App.atualizandoManual = false; aviso('O app já está atualizado (versão ' + DIAG_APP_VERSAO + ').', 'ok') }
  }, 3000)
}

// ── Aviso de privacidade (o que o app coleta e guarda) ────────────────
async function abrirPrivacidade() {
  const q = await questionarioAtual()
  document.getElementById('ov-priv-corpo').innerHTML =
    '<h4>Aviso lido ao entrevistado</h4><div class="aviso-txt">' + esc(q ? q.aviso_entrevistado : 'Sincronize para baixar o questionário.') + '</div>' +
    '<h4>O que fica neste celular</h4><ul>' +
      '<li>Fichas ainda não enviadas e as fotos delas (apagadas do aparelho 7 dias depois de enviadas).</li>' +
      '<li>Seu nome, o questionário e as listas de municípios e comunidades, para funcionar sem internet.</li>' +
      '<li>O PIN, guardado só como código cifrado (não dá para ler o número).</li></ul>' +
    '<h4>Cuidados</h4><ul>' +
      '<li>Não fotografe pessoas. Nome do entrevistado e dos moradores é opcional (iniciais bastam).</li>' +
      '<li>Mantenha o bloqueio de tela do celular ligado. "Sair deste aparelho" não apaga fichas pendentes.</li>' +
      '<li>Nome, localização e fotos são apagados do sistema 2 anos após a validação da ficha.</li></ul>' +
    '<h4>Dúvidas e pedidos sobre dados pessoais</h4>' +
    '<p>Encarregada de Dados da SEMA/AC: Luciana Rôla — <b>divbioac@gmail.com</b>. Pedido feito em campo: anote e encaminhe a esse e-mail.</p>'
  abrirOv('ov-privacidade')
}

async function limparTreinoLocal() {
  const lista = (await dFichasDoUsuario(App.usuario.id)).filter(f => f.treino)
  if (!lista.length) return
  if (!confirm('Apagar deste celular ' + lista.length + ' ficha(s) de TREINO (TRE-)?\n\nFichas reais não são tocadas. As que já foram enviadas continuam no sistema até a coordenação apagar o treino.')) return
  for (const f of lista) await dFichaApagarLocal(f.uuid_cliente)
  aviso(lista.length + ' ficha(s) de treino apagada(s) do aparelho.', 'ok')
  abrirConfig()
}

async function sincronizarPelaConfig() {
  await sincronizar(false)
  if (!document.getElementById('t-config').hidden) abrirConfig()
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
  document.getElementById('btn-ficha-sair').addEventListener('click', async () => {
    if (App.ficha) await dFichaSalvar(App.ficha)
    if (App.pend) { sairModoPendencias(); abrirRevisao() } else irInicio()
  })
  document.getElementById('btn-revisao-voltar').addEventListener('click', () => { sairModoPendencias(); mostrar('t-ficha'); desenharBloco() })
  document.getElementById('btn-pendencias').addEventListener('click', () => abrirPendencias())
  document.getElementById('btn-pend-anterior').addEventListener('click', () => navegarPendencia(-1))
  document.getElementById('btn-pend-proxima').addEventListener('click', () => navegarPendencia(1))
  document.getElementById('btn-pend-revisao').addEventListener('click', () => { salvarFichaAtual(); sairModoPendencias(); abrirRevisao() })
  document.getElementById('aba-entrevistas').addEventListener('click', () => trocarAbaInicio('entrevistas'))
  document.getElementById('aba-painel').addEventListener('click', () => trocarAbaInicio('painel'))
  document.getElementById('btn-concluir').addEventListener('click', concluirFicha)
  document.getElementById('btn-trocar-pin').addEventListener('click', () => abrirPin('criar'))
  document.getElementById('btn-sair').addEventListener('click', sairDoAparelho)
  document.getElementById('config-treino').addEventListener('change', mudarModoTreino)
  document.getElementById('btn-cfg-listas').addEventListener('click', sincronizarPelaConfig)
  document.getElementById('btn-cfg-instalar').addEventListener('click', instalarAqui)
  document.getElementById('btn-login-instalar').addEventListener('click', instalarAqui)
  document.getElementById('btn-cfg-qr').addEventListener('click', abrirQRInstalacao)
  document.getElementById('btn-cfg-update').addEventListener('click', verificarAtualizacao)
  document.getElementById('btn-cfg-privacidade').addEventListener('click', abrirPrivacidade)
  document.getElementById('btn-cfg-limpar-treino').addEventListener('click', limparTreinoLocal)
  document.getElementById('btn-update-agora').addEventListener('click', () => location.reload())
  document.getElementById('btn-update-depois').addEventListener('click', () => { document.getElementById('banner-update').hidden = true })
  document.querySelectorAll('.ov').forEach(ov => ov.addEventListener('click', ev => {
    if (ev.target === ov || ev.target.closest('[data-fechar]')) fecharOv(ev.target)
  }))
  document.querySelectorAll('[data-voltar]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.voltar === 't-inicio') irInicio(); else mostrar(b.dataset.voltar)
  }))
  const corpo = document.getElementById('ficha-corpo')
  corpo.addEventListener('click', ev => DiagForm.tratarClique(ev))
  corpo.addEventListener('input', ev => { if (ev.target.type !== 'file') DiagForm.tratarEntrada(ev) })
  // número mexe na 1ª linha da P9 e em avisos: redesenha ao sair do campo
  corpo.addEventListener('change', ev => {
    if (ev.target.type === 'file') DiagForm.tratarArquivo(ev)
    else if (ev.target.type === 'number' && ev.target.dataset.acao === 'numero') redesenharFicha()
  })
  document.getElementById('ini-lista').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-uuid]'); if (!b) return
    const f = await dFichaObter(b.dataset.uuid)
    if (f.estado === 'rascunho') abrirFicha(f.uuid_cliente, null, f.status_servidor === 'devolvida')
    else if (f.estado === 'erro' || f.estado === 'conflito' || f.estado === 'aguardando_permissao') {
      if (f.estado === 'erro' && f.aceitou_participar && confirm((f.erro_msg || 'Problema no envio') + '\n\nAbrir a ficha para corrigir?')) {
        f.estado = 'rascunho'; await dFichaSalvar(f); abrirFicha(f.uuid_cliente)
      } else if (f.estado !== 'erro') aviso(f.erro_msg || ROTULO_ESTADO[f.estado], 'aviso')
    } else aviso('Ficha ' + f.codigo + ': ' + (f.status_servidor === 'validada' ? 'validada pela coordenação' : ROTULO_ESTADO[f.estado]) + '.', 'info')
  })
  document.getElementById('revisao-lista').addEventListener('click', ev => {
    const b = ev.target.closest('[data-ir]'); if (!b || !b.dataset.ir) return
    // pergunta em branco: entra no modo pendências a partir dela
    if (pendentesAgora().some(p => p.chave === b.dataset.ir)) { abrirPendencias(b.dataset.ir); return }
    App.bloco = blocoDaChave(b.dataset.ir)
    mostrar('t-ficha'); desenharBloco(b.dataset.ir)
  })
  window.addEventListener('online', () => { if (App.usuario && !document.getElementById('t-inicio').hidden) sincronizar(true) })
  document.addEventListener('visibilitychange', () => { if (document.hidden && App.ficha) dFichaSalvar(App.ficha) })
}

boot().catch(e => { console.error('[diag-app] falha no boot:', e); mostrar('t-login') })
