// ════════════════════════════════════════════════════════════════════════
// Ponta a ponta do app de campo (chamado por rodar_app.sh).
// O supabase-js do CDN é trocado por um stub que encaminha as chamadas que
// importam para o Postgres LOCAL, executando COMO o usuário logado (set role
// authenticated + jwt sub) — ou seja, com RLS e as funções reais do banco.
// Offline é simulado derrubando as rotas do Supabase.
// ════════════════════════════════════════════════════════════════════════
'use strict'
const { chromium } = require('playwright')
const { execFileSync } = require('node:child_process')
const zlib = require('node:zlib')
const fs = require('node:fs')

const BASE = process.env.BASE
const UID_TEC = '00000000-0000-0000-0000-0000000000e1'
const SUPA = 'https://wfymnmlinonvdqfucjya.supabase.co'
let online = true
let usuarioLogado = null

function falhar(msg) { console.error('FALHOU: ' + msg); process.exit(1) }
function ok(msg) { console.log('  ✓ ' + msg) }

// ── Postgres local ──────────────────────────────────────────────────────
function lit(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return "'" + String(v).replace(/'/g, "''") + "'"
}
function jsonLit(o) {
  const tag = '$j' + Math.random().toString(36).slice(2, 8) + '$'
  return tag + JSON.stringify(o) + tag + '::jsonb'
}
function psql(sql, comoUsuario) {
  const pre = comoUsuario
    ? "set role authenticated; select set_config('request.jwt.claim.sub', '" + comoUsuario + "', false);\n" : ''
  return execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-qAtX'], { input: pre + sql, encoding: 'utf8' }).trim().split('\n').pop()
}
function consulta(sql) { return JSON.parse(psql('select coalesce(jsonb_agg(t), \'[]\') from (' + sql + ') t')) }

// select do supabase-js → SQL, com RLS do usuário logado
function pgSelect(q) {
  let sql = 'select ' + q.cols + ' from public.' + q.tabela
  const w = q.filtros.map(f => f.op === 'eq' ? f.col + ' = ' + lit(f.val)
    : f.col + ' in (' + (f.val.length ? f.val.map(lit).join(',') : 'null') + ')')
  if (w.length) sql += ' where ' + w.join(' and ')
  if (q.ordem) sql += ' order by ' + q.ordem.col + (q.ordem.asc ? ' asc' : ' desc')
  if (q.limite) sql += ' limit ' + q.limite
  try {
    const linhas = JSON.parse(psql('select coalesce(jsonb_agg(t), \'[]\') from (' + sql + ') t', usuarioLogado))
    return { data: q.unico ? (linhas[0] || null) : linhas, error: null }
  } catch (e) { return { data: null, error: { message: String(e.stderr || e.message).split('\n')[0] } } }
}
function pgRpc(nome, args) {
  const params = Object.entries(args || {}).map(([k, v]) =>
    k + ' := ' + (v !== null && typeof v === 'object' ? jsonLit(v) : lit(v))).join(', ')
  try {
    const setof = nome === 'fn_diag_sugestoes'
    const sql = setof
      ? "select coalesce(jsonb_agg(t), '[]') from public." + nome + '(' + params + ') t'
      : 'select to_json(public.' + nome + '(' + params + '))'
    return { data: JSON.parse(psql(sql, usuarioLogado)), error: null }
  } catch (e) {
    const m = /ERROR:\s+(.*)/.exec(String(e.stderr || e.message))
    return { data: null, error: { message: m ? m[1] : 'erro' } }
  }
}
function pgUpload(bucket, caminho) {
  try {
    psql('insert into storage.objects (bucket_id, name) values (' + lit(bucket) + ', ' + lit(caminho) + ')', usuarioLogado)
    return { error: null }
  } catch (e) {
    const msg = String(e.stderr || e.message)
    return { error: { message: /duplicate|exist/i.test(msg) ? 'The resource already exists' : msg.split('\n')[0] } }
  }
}

// ── stub do supabase-js (vai para o navegador no lugar do CDN) ──────────
const STUB = `
window.supabase = { createClient: function () {
  function Q(tabela) { this.q = { tabela: tabela, cols: '*', filtros: [], unico: false } }
  Q.prototype.select = function (c) { this.q.cols = c; return this }
  Q.prototype.eq = function (c, v) { this.q.filtros.push({ op: 'eq', col: c, val: v }); return this }
  Q.prototype.in = function (c, v) { this.q.filtros.push({ op: 'in', col: c, val: v }); return this }
  Q.prototype.order = function (c, o) { this.q.ordem = { col: c, asc: !o || o.ascending !== false }; return this }
  Q.prototype.limit = function (n) { this.q.limite = n; return this }
  Q.prototype.single = function () { this.q.unico = true; return this }
  Q.prototype.maybeSingle = function () { this.q.unico = true; return this }
  Q.prototype.then = function (a, b) { return window.__pgSelect(this.q).then(a, b) }
  return {
    auth: {
      signInWithPassword: function (c) { return window.__login(c.email, c.password) },
      getSession: function () { return Promise.resolve({ data: { session: localStorage.getItem('stub-sessao') ? { expires_at: Date.now() / 1000 + 3600 } : null } }) },
      refreshSession: function () { return Promise.resolve({ error: null }) },
      signOut: function () { localStorage.removeItem('stub-sessao'); return Promise.resolve({}) },
    },
    from: function (t) { return new Q(t) },
    rpc: function (n, a) { return window.__pgRpc(n, a || {}) },
    storage: { from: function (b) { return { upload: function (p) { return window.__pgUpload(b, p) } } } },
  }
} }
`

function png1x1() {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
  const chunk = (tipo, dados) => { const l = Buffer.alloc(4); l.writeUInt32BE(dados.length); const td = Buffer.concat([Buffer.from(tipo), dados]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ihdr = Buffer.from([0, 0, 0, 8, 0, 0, 0, 6, 8, 2, 0, 0, 0])   // 8x6, RGB
  const cru = Buffer.alloc(6 * (1 + 8 * 3), 0x7f); for (let y = 0; y < 6; y++) cru[y * 25] = 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(cru)), chunk('IEND', Buffer.alloc(0))])
}

;(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined })
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const errosJs = []
  page.on('pageerror', e => errosJs.push(String(e)))
  if (process.env.DEBUG) page.on('console', m => console.log('    [console] ' + m.type() + ': ' + m.text()))
  await context.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: STUB }))
  await context.route(SUPA + '/**', r => online ? r.fulfill({ status: 200, body: '' }) : r.abort())
  await page.exposeFunction('__pgSelect', q => online ? pgSelect(q) : { data: null, error: { message: 'Failed to fetch' } })
  await page.exposeFunction('__pgRpc', (n, a) => online ? pgRpc(n, a) : { data: null, error: { message: 'Failed to fetch' } })
  await page.exposeFunction('__pgUpload', (b, p) => online ? pgUpload(b, p) : { error: { message: 'Failed to fetch' } })
  await page.exposeFunction('__login', (email, senha) => {
    const uid = { 'tec@x': UID_TEC, 'coord@x': '00000000-0000-0000-0000-0000000000c1', 'coord2@x': '00000000-0000-0000-0000-0000000000c2' }[email]
    if (!uid || senha !== 'senha') return { data: {}, error: { message: 'Invalid login credentials' } }
    usuarioLogado = uid
    return { data: { user: { id: uid } }, error: null }
  })
  await page.addInitScript(() => { window.__marcarSessao = () => localStorage.setItem('stub-sessao', '1') })
  const clicar = sel => page.locator(sel).first().click()
  // SHOTS=<pasta>: salva capturas das telas principais (conferência visual)
  const foto = async nome => { if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/' + nome + '.png', fullPage: false }) }
  const pin = async d => { for (const x of d) await page.click('#teclado button[data-d="' + x + '"]') }

  console.log('· app de campo — ponta a ponta')
  await page.goto(BASE + '/pages/diagnostico-app.html')
  await page.locator('#t-login').waitFor({ state: 'visible' })

  // login errado, depois certo
  await page.fill('#login-email', 'tec@x'); await page.fill('#login-senha', 'errada'); await clicar('#btn-login')
  await page.locator('#login-erro').waitFor({ state: 'visible' })
  if (!/incorretos/.test(await page.textContent('#login-erro'))) falhar('mensagem de senha errada')
  await page.fill('#login-senha', 'senha'); await page.evaluate(() => window.__marcarSessao()); await clicar('#btn-login')
  await page.locator('#t-pin').waitFor({ state: 'visible' })
  await foto('pin')
  await pin('1234')
  await page.waitForFunction(() => /Repita/.test(document.getElementById('pin-titulo').textContent))   // baralho confere antes
  if (await page.locator('#pin-casas .pin-carta').count() !== 4) falhar('baralho de PIN (SIGUC) não montou')
  await pin('1234')
  await page.locator('#t-inicio').waitFor({ state: 'visible' })
  await foto('inicio')
  ok('login + criação de PIN')

  // nova entrevista
  if (await page.isDisabled('#btn-nova')) falhar('botão Nova entrevista desabilitado (questionário não baixado)')
  await clicar('#btn-nova')

  await page.selectOption('#nova-municipio', '1200708'); await page.waitForTimeout(300)   // comunidades recarregam (async)
  await page.selectOption('#nova-comunidade', '11111111-1111-1111-1111-111111111111')
  await page.locator('#nova-loc-wrap').waitFor({ state: 'visible' })   // sublocalidade cadastrada pela coordenação
  await page.selectOption('#nova-localidade', '_nova')
  await clicar('#btn-nova-continuar')
  if (!/sublocalidade/.test(await page.textContent('#nova-erro'))) falhar('aceitou "Outra" sublocalidade sem nome')
  await page.selectOption('#nova-localidade', '22222222-2222-2222-2222-222222222221')
  await clicar('#btn-nova-continuar')
  await page.locator('#t-aviso').waitFor({ state: 'visible' })
  if (!/Encarregada de Dados da SEMA\/AC, pelo e-mail divbioac@gmail\.com/.test(await page.textContent('#aviso-texto'))) falhar('aviso ao entrevistado não carregou')
  await clicar('#btn-aceitou')
  if (await page.isHidden('#aviso-erro')) falhar('deixou começar sem marcar o aviso como lido')
  await page.check('#aviso-lido'); await clicar('#btn-aceitou')
  await page.locator('#t-ficha').waitFor({ state: 'visible' })
  const codigo = await page.textContent('#ficha-codigo')
  if (!/^DSA-XAP-\d{6}-[A-Z0-9]{4}-01$/.test(codigo)) falhar('código da ficha fora do padrão: ' + codigo)
  ok('nova ficha ' + codigo)

  // bloco 1: identificação + moradores
  await page.fill('[data-campo="entrevistado_nome"]', 'Maria da Silva')
  await clicar('[data-chave="sexo_genero"][data-v="mulher"]')
  await page.fill('[data-acao="numero"][data-chave="idade"]', '40'); await page.press('[data-acao="numero"][data-chave="idade"]', 'Tab')
  await clicar('[data-chave="tempo_comunidade"][data-v="nasceu_na_comunidade"]')
  await page.fill('[data-acao="numero"][data-chave="qtd_moradores"]', '3'); await page.press('[data-acao="numero"][data-chave="qtd_moradores"]', 'Tab')
  const idade1 = await page.inputValue('[data-acao="mor"][data-i="0"][data-campo="idade"]')
  if (idade1 !== '40') falhar('1ª linha da P9 não acompanhou a idade do entrevistado (' + idade1 + ')')
  await clicar('[data-acao="mor-adicionar"]'); await clicar('[data-acao="mor-adicionar"]')
  await page.fill('[data-acao="mor"][data-i="1"][data-campo="idade"]', '42')
  await page.selectOption('[data-acao="mor"][data-i="1"][data-campo="sexo_genero"]', 'homem')
  await page.fill('[data-acao="mor"][data-i="1"][data-campo="nome"]', 'João')
  await page.fill('[data-acao="mor"][data-i="2"][data-campo="idade"]', '10')
  await page.selectOption('[data-acao="mor"][data-i="2"][data-campo="sexo_genero"]', 'mulher')
  await page.fill('[data-acao="mor"][data-i="2"][data-campo="parentesco"]', 'filha')
  // v2: escolaridade em lista fechada
  await page.selectOption('[data-acao="mor"][data-i="2"][data-campo="escolaridade"]', 'fundamental_incompleto')
  await foto('bloco1')
  if (process.env.SHOTS) { await page.waitForTimeout(3900); await page.locator('.fim-bloco').scrollIntoViewIfNeeded(); await foto('fim_bloco') }
  ok('P4–P9 com a 1ª linha sincronizada')

  // bloco 2 (moradia) → 3 (água)
  await clicar('#btn-proximo')
  await clicar('[data-chave="moradia_situacao"][data-v="propria"]')
  await clicar('[data-chave="comunicacao_meios"][data-v="celular"]')
  await clicar('[data-chave="comunicacao_meios"][data-v="nenhum"]')   // exclusiva desmarca celular
  const cel = await page.getAttribute('[data-chave="comunicacao_meios"][data-v="celular"]', 'aria-pressed')
  if (cel !== 'false') falhar('opção exclusiva não desmarcou as outras')
  await clicar('#btn-proximo')
  await clicar('[data-chave="agua_fonte"][data-v="outro"]')
  await page.fill('[data-acao="outro"][data-chave="agua_fonte"]', 'cacimba')
  await clicar('[data-chave="agua_tratada"][data-v="sim"]')
  await clicar('[data-chave="agua_tratamento"][data-v="fervura"]')
  await clicar('[data-chave="agua_tratada"][data-v="nao"]')
  if (await page.locator('[data-chave="agua_tratamento"]').count()) falhar('S1: P18 continuou visível com P17 = Não')
  await clicar('[data-acao="nr"][data-chave="agua_falta"]')
  if (await page.getAttribute('[data-acao="nr"][data-chave="agua_falta"]', 'aria-pressed') !== 'true') falhar('botão Não respondeu')
  await foto('agua')
  ok('salto S1, especifique, exclusiva e "Não respondeu"')

  // bloco 4: P26 derivada aparece como calculada
  await clicar('#btn-proximo')
  if (!/Sim — calculado/.test(await page.textContent('[data-chave="tem_escolar"]'))) falhar('P26 derivada (criança de 10 anos) não mostrou Sim')
  ok('P26 calculada pelos moradores')

  // até as fotos
  while (!/Fotos/.test(await page.textContent('#ficha-bloco'))) await clicar('#btn-proximo')
  await page.setInputFiles('input[data-acao="foto"]', { name: 'casa.png', mimeType: 'image/png', buffer: png1x1() })
  await page.locator('.foto img').first().waitFor()
  ok('foto comprimida e guardada no aparelho')

  // revisão: pendências avisam, não travam
  await clicar('#btn-proximo')
  await page.locator('#t-revisao').waitFor({ state: 'visible' })
  const itens = await page.locator('#revisao-lista .item-ficha').count()
  if (itens < 10) falhar('revisão deveria listar pendências (veio ' + itens + ')')
  if (await page.isDisabled('#btn-concluir')) falhar('revisão travou o salvamento')
  await clicar('#revisao-lista [data-ir="saude_onde"]')
  await page.locator('.pergunta.destaque[data-chave="saude_onde"]').waitFor()
  await page.evaluate(() => abrirRevisao())
  await foto('revisao')
  ok('revisão lista ' + itens + ' avisos e leva até a pergunta')

  // salvar SEM sinal: fica na fila
  online = false
  await clicar('#btn-concluir')
  await page.locator('#t-inicio').waitFor({ state: 'visible' })
  await page.waitForTimeout(400)
  if (await page.textContent('#c-fila') !== '1') falhar('ficha deveria estar na fila sem sinal')
  ok('sem sinal: ficha guardada na fila')

  // volta o sinal: envia para o banco (RLS + validação reais)
  online = true
  await clicar('#btn-sync')
  await page.waitForFunction(() => document.getElementById('c-enviada').textContent === '1', null, { timeout: 15000 })
  const f = consulta("select codigo, respostas, alertas, status, localidade_id from diag_fichas where codigo = " + lit(codigo))[0]
  if (!f) falhar('ficha não chegou ao banco')
  if (f.localidade_id !== '22222222-2222-2222-2222-222222222221') falhar('sublocalidade não chegou ao banco')
  if (f.respostas.agua_tratamento) falhar('resposta de pergunta pulada (P18) chegou ao banco')
  if (f.respostas.agua_fonte_outro !== 'cacimba') falhar('especifique não chegou')
  if (f.respostas.agua_falta !== '_nr') falhar('"Não respondeu" não chegou')
  if (f.respostas.tem_escolar !== 'sim') falhar('P26 derivada no banco')
  if (JSON.stringify(f.respostas.comunicacao_meios) !== '["nenhum"]') falhar('exclusiva no banco')
  const mor = consulta("select m.ordem, m.idade, m.e_entrevistado, m.escolaridade, mi.nome from diag_moradores m join diag_fichas f on f.id = m.ficha_id left join diag_moradores_identificacao mi on mi.morador_id = m.id where f.codigo = " + lit(codigo) + ' order by m.ordem')
  if (mor.length !== 3 || !mor[0].e_entrevistado || mor[0].idade !== 40 || mor[1].nome !== 'João' || mor[2].escolaridade !== 'fundamental_incompleto') falhar('moradores no banco: ' + JSON.stringify(mor))
  const ident = consulta("select i.entrevistado_nome from diag_fichas_identificacao i join diag_fichas f on f.id = i.ficha_id where f.codigo = " + lit(codigo))[0]
  if (!ident || ident.entrevistado_nome !== 'Maria da Silva') falhar('nome do entrevistado não foi para a identificação')
  const fotos = consulta("select ft.arquivo_url from diag_fotos ft join diag_fichas f on f.id = ft.ficha_id where f.codigo = " + lit(codigo))
  if (fotos.length !== 1) falhar('foto não registrada no banco')
  const obj = consulta("select name from storage.objects where bucket_id = 'diagnostico-fotos'")
  if (obj.length !== 1 || !fotos[0].arquivo_url.endsWith(obj[0].name)) falhar('arquivo da foto × registro')
  const alertasBanco = f.alertas.map(a => a.tipo + ':' + (a.chave || '')).sort().join('|')
  const alertasApp = (await page.evaluate(([c, u]) => dFichasDoUsuario(u).then(l => l.find(x => x.codigo === c).alertas), [codigo, UID_TEC]))
    .map(a => a.tipo + ':' + (a.chave || '')).sort().join('|')
  if (alertasBanco !== alertasApp) falhar('alertas do banco × app divergem')
  ok('ficha no banco: sublocalidade, respostas normalizadas, 3 moradores, identificação separada, foto no bucket')

  // reenviar não duplica
  await page.evaluate(async c => { const l = await dFichasDoUsuario('00000000-0000-0000-0000-0000000000e1'); const x = l.find(y => y.codigo === c); x.estado = 'pronta'; await dFichaSalvar(x) }, codigo)
  await clicar('#btn-sync')
  await page.waitForFunction(() => document.getElementById('c-fila').textContent === '0', null, { timeout: 15000 })
  if (consulta('select id from diag_fichas').length !== 1) falhar('reenvio duplicou a ficha')
  ok('reenvio idempotente (continua 1 ficha)')

  // recusa
  await clicar('#btn-nova')
  await page.selectOption('#nova-municipio', '1200708'); await page.waitForTimeout(300)   // comunidades recarregam (async)
  await page.selectOption('#nova-comunidade', '_nova'); await page.fill('#nova-com-outra', 'Colocação Nova Esperança')
  await clicar('#btn-nova-continuar')
  await page.locator('#t-aviso').waitFor({ state: 'visible' })
  if (await page.isChecked('#aviso-lido')) falhar('aviso veio marcado da entrevista anterior')
  await page.check('#aviso-lido')
  await clicar('#btn-recusou')
  await page.locator('#t-inicio').waitFor({ state: 'visible' })
  await clicar('#btn-sync')
  await page.waitForFunction(() => document.getElementById('c-enviada').textContent === '2', null, { timeout: 15000 })
  const rec = consulta("select respostas, aceitou_participar, comunidade_nova from diag_fichas where not aceitou_participar")[0]
  if (!rec || JSON.stringify(rec.respostas) !== '{}' || rec.comunidade_nova !== 'Colocação Nova Esperança') falhar('recusa no banco')
  ok('recusa enviada só com comunidade/data/entrevistador')

  // devolução pela coordenação volta para o aparelho
  psql("insert into public.usuarios values ('00000000-0000-0000-0000-0000000000c0','Coord','co@x','coordenacao',true)")
  psql("select public.diag_mudar_status((select id from diag_fichas where codigo = " + lit(codigo) + "), 'devolvida', 'Conferir a P9')", '00000000-0000-0000-0000-0000000000c0')
  await clicar('#btn-sync')
  await page.locator('#ini-lista .selo-devolvida').waitFor({ timeout: 15000 })
  await clicar('#ini-lista .item-ficha:has(.selo-devolvida)')
  await page.locator('#t-ficha').waitFor({ state: 'visible' })
  if (!/Conferir a P9/.test(await page.textContent('#ficha-devolvida'))) falhar('motivo da devolução não apareceu na ficha')
  await clicar('#btn-ficha-sair')
  ok('ficha devolvida voltou ao aparelho com o motivo')

  // modo treino: sem a permissão própria, a chave nem aparece
  await clicar('#btn-config'); await page.locator('#t-config').waitFor({ state: 'visible' })
  if (await page.isVisible('#config-treino-wrap')) falhar('modo treino visível sem a permissão diagnostico_treino')
  await clicar('#t-config [data-voltar]'); await page.locator('#t-inicio').waitFor({ state: 'visible' })
  // v3 em RASCUNHO + permissão de treino: o treino usa a mais nova (v3); a ficha real continua na v2 publicada
  psql("insert into public.diag_questionarios (codigo, versao, titulo, estrutura, aviso_entrevistado) select codigo, 3, titulo, estrutura, aviso_entrevistado from public.diag_questionarios where versao = 2")
  psql("insert into public.usuario_permissoes (usuario_id, modulo, valido_de, valido_ate) values ('00000000-0000-0000-0000-0000000000e1','diagnostico_treino', now()-interval '1 day', now()+interval '10 days')")
  await clicar('#btn-sync'); await page.waitForTimeout(800)
  await clicar('#btn-config'); await page.locator('#config-treino-wrap').waitFor({ state: 'visible' })
  await page.check('#config-treino')
  await page.waitForTimeout(300)
  await clicar('#t-config [data-voltar]'); await page.locator('#t-inicio').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  if (await page.isHidden('#faixa-treino')) falhar('faixa MODO TREINO não apareceu')
  await foto('treino')
  await clicar('#btn-nova')
  await page.selectOption('#nova-municipio', '1200708'); await page.waitForTimeout(300)
  await page.selectOption('#nova-comunidade', '11111111-1111-1111-1111-111111111111')
  await clicar('#btn-nova-continuar')
  await page.locator('#t-aviso').waitFor({ state: 'visible' })
  if (await page.isHidden('#faixa-treino')) falhar('faixa MODO TREINO sumiu no aviso')
  await page.check('#aviso-lido'); await clicar('#btn-recusou')
  await page.locator('#t-inicio').waitFor({ state: 'visible' })
  await clicar('#btn-sync')
  await page.locator('#ini-lista .selo-treino').waitFor({ timeout: 15000 })
  await page.waitForFunction(() => document.getElementById('c-fila').textContent === '0', null, { timeout: 15000 })
  const tr = consulta("select f.codigo, f.treino, q.versao, q.status as q_status from diag_fichas f join diag_questionarios q on q.id = f.questionario_id where f.treino")
  if (tr.length !== 1 || !/^TRE-XAP-\d{6}-[A-Z0-9]{4}-\d{2}$/.test(tr[0].codigo) || tr[0].versao !== 3 || tr[0].q_status !== 'rascunho')
    falhar('ficha de treino no banco: ' + JSON.stringify(tr))
  if (consulta("select ficha_id from vw_diag_respostas r join diag_fichas f on f.id = r.ficha_id where f.treino").length) falhar('treino entrou nos números')
  // coordenação apaga o treino; as reais ficam
  const nApag = JSON.parse(psql('select public.diag_apagar_treino()', '00000000-0000-0000-0000-0000000000c0'))
  if (nApag !== 1 || consulta('select id from diag_fichas').length !== 2) falhar('apagar treino: ' + nApag)
  // desligar: volta ao normal
  await clicar('#btn-config'); await page.locator('#t-config').waitFor({ state: 'visible' })
  await page.uncheck('#config-treino'); await page.waitForTimeout(300)
  await clicar('#t-config [data-voltar]'); await page.locator('#t-inicio').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  if (await page.isVisible('#faixa-treino')) falhar('faixa MODO TREINO ficou com o modo desligado')
  ok('modo treino: TRE- na v3 em rascunho, faixa, fora dos números, apagado pela coordenação')

  // configurações (padrão SIGUC): perfil, QR de instalação, privacidade
  await clicar('#btn-config'); await page.locator('#t-config').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  if (!/Técnica de Campo/.test(await page.textContent('#cfg-nome'))) falhar('config sem o nome do usuário')
  if (!/DSA v2/.test(await page.textContent('#cfg-quest'))) falhar('config sem a versão do questionário: ' + await page.textContent('#cfg-quest'))
  if (await page.isHidden('#btn-cfg-instalar')) falhar('"Instalar neste celular" escondido fora do app instalado')
  await clicar('#btn-cfg-qr'); await page.locator('#ov-qr').waitFor({ state: 'visible' })
  const qrSrc = await page.getAttribute('#ov-qr-img', 'src')
  if (!/^data:image\/(gif|png)/.test(qrSrc || '')) falhar('QR de instalação não gerado')
  if (!/instalar-diagnostico\.html$/.test(await page.textContent('#ov-qr-link'))) falhar('QR não aponta para a página de instalação')
  await clicar('#ov-qr [data-fechar]'); await page.locator('#ov-qr').waitFor({ state: 'hidden' })
  await clicar('#btn-cfg-privacidade'); await page.locator('#ov-privacidade').waitFor({ state: 'visible' })
  if (!/divbioac@gmail\.com/.test(await page.textContent('#ov-priv-corpo'))) falhar('aviso de privacidade sem a Encarregada')
  await clicar('#ov-privacidade [data-fechar]')
  await clicar('#btn-cfg-instalar'); await page.locator('#ov-instalar').waitFor({ state: 'visible' })
  if (!/Chrome|Safari/.test(await page.textContent('#ov-instalar-passos'))) falhar('instruções de instalação vazias')
  await foto('config_instalar')
  await clicar('#ov-instalar [data-fechar]')
  await page.evaluate(() => document.getElementById('t-config').scrollIntoView())
  await foto('config')
  await clicar('#t-config [data-voltar]'); await page.locator('#t-inicio').waitFor({ state: 'visible' })
  // página pública de instalação (aberta pelo QR)
  const pgInst = await browser.newPage({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1' })
  const errosInst = []; pgInst.on('pageerror', e => errosInst.push(e.message))
  await pgInst.goto(BASE + '/pages/instalar-diagnostico.html')
  if (!/\/pages\/diagnostico-app\.html$/.test(await pgInst.textContent('#link-app'))) falhar('link do app na página de instalação')
  if (await pgInst.evaluate(() => document.querySelector('main .cartao').id) !== 'c-ios') falhar('iPhone não vê o cartão do iPhone primeiro')
  if (process.env.SHOTS) await pgInst.screenshot({ path: process.env.SHOTS + '/instalar.png' })
  if (errosInst.length) falhar('erros na página de instalação: ' + errosInst.join(' | '))
  await pgInst.close()
  ok('configurações: perfil, QR de instalação, privacidade, instalar (Android/iPhone)')

  // reabrir o app: PIN (errado, depois certo)
  await page.reload()
  await page.locator('#t-pin').waitFor({ state: 'visible' })
  await pin('9999')
  await page.locator('#pin-erro').waitFor({ state: 'visible' })
  await pin('1234')
  await page.locator('#t-inicio').waitFor({ state: 'visible' })
  ok('reabrir com PIN (errado recusado)')

  // coordenação: sem "modo treino" não entra; com ele, entra SÓ em treino
  page.on('dialog', d => d.accept())
  await clicar('#btn-config'); await page.locator('#t-config').waitFor({ state: 'visible' })
  await clicar('#btn-sair'); await page.locator('#t-login').waitFor({ state: 'visible' })
  await page.fill('#login-email', 'coord2@x'); await page.fill('#login-senha', 'senha'); await clicar('#btn-login')
  await page.locator('#login-erro').waitFor({ state: 'visible' })
  if (!/coordenação não aplica.*modo treino/.test(await page.textContent('#login-erro'))) falhar('mensagem para coordenação sem treino: ' + await page.textContent('#login-erro'))
  await page.fill('#login-email', 'coord@x'); await page.fill('#login-senha', 'senha'); await page.evaluate(() => window.__marcarSessao()); await clicar('#btn-login')
  await page.locator('#t-pin').waitFor({ state: 'visible' })
  await pin('2468')
  await page.waitForFunction(() => /Repita/.test(document.getElementById('pin-titulo').textContent))
  await pin('2468')
  await page.locator('#t-inicio').waitFor({ state: 'visible' }); await page.waitForTimeout(400)
  if (await page.isHidden('#faixa-treino')) falhar('coordenação entrou fora do modo treino')
  if (!/só em modo treino/.test(await page.textContent('#ini-avisos'))) falhar('aviso de "só treino" ausente')
  await clicar('#btn-nova')
  await page.selectOption('#nova-municipio', '1200708'); await page.waitForTimeout(300)
  await page.selectOption('#nova-comunidade', '11111111-1111-1111-1111-111111111111'); await page.waitForTimeout(200)
  await clicar('#btn-nova-continuar'); await page.locator('#t-aviso').waitFor({ state: 'visible' })
  await page.check('#aviso-lido'); await clicar('#btn-recusou')
  await page.locator('#t-inicio').waitFor({ state: 'visible' })
  await clicar('#btn-sync')
  await page.waitForFunction(() => document.getElementById('c-fila').textContent === '0', null, { timeout: 15000 })
  const fc = consulta("select codigo, treino from diag_fichas where entrevistador_id = '00000000-0000-0000-0000-0000000000c1'")
  if (fc.length !== 1 || !fc[0].treino || !/^TRE-/.test(fc[0].codigo)) falhar('ficha da coordenação: ' + JSON.stringify(fc))
  await clicar('#btn-config'); await page.locator('#t-config').waitFor({ state: 'visible' })
  if (!(await page.isDisabled('#config-treino')) || !(await page.isChecked('#config-treino'))) falhar('coordenação conseguiu desligar o treino')
  ok('coordenação: sem "modo treino" não entra; com ele, entra só em treino (TRE-)')

  if (errosJs.length) falhar('erros de JavaScript na página: ' + errosJs.join(' | '))
  await browser.close()
  console.log('OK — app de campo passou de ponta a ponta')
})().catch(e => { console.error(e); process.exit(1) })
