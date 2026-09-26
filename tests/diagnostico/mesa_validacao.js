// ════════════════════════════════════════════════════════════════════════
// Aba "Validação" da mesa (pages/diagnostico.html), ponta a ponta.
// Chamado por rodar_app.sh DEPOIS de app_fluxo.js (usa o mesmo banco local).
// O supabase-js do CDN vira um stub que executa cada consulta COMO o
// usuário logado (set role authenticated + jwt sub): o RLS e as RPCs são os
// reais. Cobre: lista e filtros, ficha aberta (avisos, identificação,
// moradores com a escolaridade da v2, foto por URL assinada), apagar foto,
// devolver/validar/reabrir/descartar pela RPC, e a leitura do consultor
// externo sem identificação, sem fotos e sem botões.
// ════════════════════════════════════════════════════════════════════════
'use strict'
const { chromium } = require('playwright')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')

const BASE = process.env.BASE
const TEC = '00000000-0000-0000-0000-0000000000e1'
const COORD = '00000000-0000-0000-0000-0000000000c0'
const CONS = '00000000-0000-0000-0000-0000000000ce'
let usuarioLogado = COORD

function falhar(msg) { console.error('FALHOU: ' + msg); process.exit(1) }
function ok(msg) { console.log('  ✓ ' + msg) }
function lit(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return "'" + String(v).replace(/'/g, "''") + "'"
}
function psql(sql, como) {
  const pre = como ? "set role authenticated; select set_config('request.jwt.claim.sub', '" + como + "', false);\n" : ''
  return execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-qAtX'], { input: pre + sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().split('\n').pop()
}
function consulta(sql) { return JSON.parse(psql("select coalesce(jsonb_agg(t), '[]') from (" + sql + ') t')) }
function erroPg(e) { const m = /ERROR:\s+(.*)/.exec(String(e.stderr || e.message)); return { message: m ? m[1] : 'erro' } }

// supabase-js → SQL (só o que a mesa usa)
function where(filtros) {
  const w = filtros.map(f => f.op === 'eq' ? f.col + ' = ' + lit(f.val)
    : f.op === 'lte' ? f.col + ' <= ' + lit(f.val)
    : f.col + ' in (' + (f.val.length ? f.val.map(lit).join(',') : 'null') + ')')
  return w.length ? ' where ' + w.join(' and ') : ''
}
function pgQuery(q) {
  try {
    if (q.acao === 'update') return { data: null, error: null }          // registrar acesso: irrelevante aqui
    if (q.acao === 'delete') { psql('delete from public.' + q.tabela + where(q.filtros), usuarioLogado); return { data: null, error: null } }
    let sql = 'select ' + q.cols + ' from public.' + q.tabela + where(q.filtros)
    if (q.ordem) sql += ' order by ' + q.ordem.col + (q.ordem.asc ? ' asc' : ' desc')
    const linhas = JSON.parse(psql("select coalesce(jsonb_agg(t), '[]') from (" + sql + ') t', usuarioLogado))
    return { data: q.unico ? (linhas[0] || null) : linhas, error: null }
  } catch (e) { return { data: null, error: erroPg(e) } }
}
function pgRpc(nome, args) {
  const params = Object.entries(args || {}).map(([k, v]) => k + ' := ' + lit(v)).join(', ')
  try { return { data: JSON.parse(psql('select to_json(public.' + nome + '(' + params + '))', usuarioLogado)), error: null } }
  catch (e) { return { data: null, error: erroPg(e) } }
}
// URL assinada: só se o RLS do storage deixar este usuário ler o objeto
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAEUlEQVR4nGNoaGhgwAIGUBQAqu4ZwQ0fQ5UAAAAASUVORK5CYII='
function pgAssinar(bucket, caminho) {
  const pode = psql('select exists (select 1 from storage.objects where bucket_id = ' + lit(bucket) + ' and name = ' + lit(caminho) + ')', usuarioLogado)
  return pode === 't' ? { data: { signedUrl: PNG }, error: null } : { data: null, error: { message: 'Object not found' } }
}

const STUB = `
window.supabase = { createClient: function () {
  function Q(t) { this.q = { tabela: t, cols: '*', filtros: [], unico: false, acao: 'select' } }
  Q.prototype.select = function (c) { this.q.cols = c || '*'; return this }
  Q.prototype.eq = function (c, v) { this.q.filtros.push({ op: 'eq', col: c, val: v }); return this }
  Q.prototype.in = function (c, v) { this.q.filtros.push({ op: 'in', col: c, val: v }); return this }
  Q.prototype.lte = function (c, v) { this.q.filtros.push({ op: 'lte', col: c, val: v }); return this }
  Q.prototype.or = function () { return this }
  Q.prototype.order = function (c, o) { this.q.ordem = { col: c, asc: !o || o.ascending !== false }; return this }
  Q.prototype.limit = function () { return this }
  Q.prototype.single = function () { this.q.unico = true; return this }
  Q.prototype.maybeSingle = function () { this.q.unico = true; return this }
  Q.prototype.update = function () { this.q.acao = 'update'; return this }
  Q.prototype.delete = function () { this.q.acao = 'delete'; return this }
  Q.prototype.then = function (a, b) { return window.__pgQuery(this.q).then(a, b) }
  return {
    auth: {
      getSession: function () { return window.__uid().then(function (u) { return { data: { session: { user: { id: u }, access_token: 'x', expires_at: Date.now() / 1000 + 3600 } } } }) },
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } } },
      signOut: function () { return Promise.resolve({}) },
    },
    from: function (t) { return new Q(t) },
    rpc: function (n, a) { return window.__pgRpc(n, a || {}) },
    storage: { from: function (b) { return { createSignedUrl: function (p) { return window.__assinar(b, p) } } } },
  }
} }`

// ── Dados: duas fichas novas da técnica (v2), com identificação, moradores e foto ──
function semear() {
  const q2 = psql("select id from public.diag_questionarios where codigo = 'DSA' and versao = 2")
  const ficha = (uuid, cod, resp) => JSON.stringify({
    uuid_cliente: uuid, codigo: cod, questionario_id: q2, municipio_ibge: 1200708,
    comunidade_id: '11111111-1111-1111-1111-111111111111', localidade_id: '22222222-2222-2222-2222-222222222221',
    dt_entrevista: '2026-10-02', finalizada_em: new Date().toISOString(), aviso_lido: true, aceitou_participar: true,
    respostas: resp, entrevistado_nome: 'Maria da Silva', lat: -9.9731, lon: -67.8102, gps_precisao_m: 8 })
  const mor = JSON.stringify([
    { ordem: 1, nome: 'Maria da Silva', idade: 40, sexo_genero: 'mulher', parentesco: 'responsável', escolaridade: 'medio_completo', e_entrevistado: true },
    { ordem: 2, nome: 'J.', idade: 10, sexo_genero: 'homem', parentesco: 'filho', escolaridade: 'fundamental_incompleto' }])
  const u1 = 'aaaa1111-0000-0000-0000-000000000001', u2 = 'aaaa1111-0000-0000-0000-000000000002'
  const url = 'https://x.supabase.co/storage/v1/object/public/diagnostico-fotos/' + u1 + '/f0000000-0000-0000-0000-00000000f001.jpg'
  psql("insert into storage.objects (bucket_id, name, owner) values ('diagnostico-fotos', '" + u1 + "/f0000000-0000-0000-0000-00000000f001.jpg', '" + TEC + "')")
  const fotos = JSON.stringify([{ uuid_cliente: 'f0000000-0000-0000-0000-00000000f001', tema: 'moradia', arquivo_url: url, tirada_em: new Date().toISOString() }])
  const rpc = (f, m, ft) => psql('select public.diag_enviar_ficha($a$' + f + '$a$::jsonb, $b$' + m + '$b$::jsonb, $c$' + ft + '$c$::jsonb)', TEC)
  rpc(ficha(u1, 'DSA-XAP-261002-MESA-01', { sexo_genero: 'mulher', idade: 40, qtd_moradores: 2, agua_fonte: 'outro', agua_fonte_outro: 'cacimba', agua_falta: '_nr' }), mor, fotos)
  rpc(ficha(u2, 'DSA-XAP-261002-MESA-02', { sexo_genero: 'mulher', idade: 55, qtd_moradores: 2 }), mor, '[]')
  psql("insert into public.usuarios values ('" + COORD + "','Coord','co@x','coordenacao',true) on conflict do nothing")
  // consultor externo precisa da permissão do módulo
  psql("insert into public.usuarios values ('" + CONS + "','Consultora','ce@x','consultor_externo',true) on conflict do nothing")
  psql("insert into public.usuario_permissoes (usuario_id, modulo, valido_de) values ('" + CONS + "','diagnostico', now()-interval '1 day') on conflict do nothing")
}

;(async () => {
  semear()
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined })
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await context.newPage()
  const errosJs = []
  page.on('pageerror', e => errosJs.push(e.message))
  if (process.env.DEBUG) page.on('console', m => console.log('[console]', m.text()))
  page.on('dialog', d => d.accept())
  await context.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: STUB }))
  // fontes do Google etc.: vazio (a rota do CDN acima fica fora deste filtro)
  await context.route(u => !u.href.startsWith(BASE) && !u.href.startsWith('https://cdn.jsdelivr.net/'), r => r.fulfill({ body: '' }))
  await page.exposeFunction('__pgQuery', pgQuery)
  await page.exposeFunction('__pgRpc', pgRpc)
  await page.exposeFunction('__assinar', pgAssinar)
  await page.exposeFunction('__uid', () => usuarioLogado)
  const foto = async n => { if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/' + n + '.png' }) }
  const linha = cod => page.locator('.dgv-tab tbody tr', { hasText: cod })

  console.log('· mesa — aba Validação')
  await page.goto(BASE + '/pages/diagnostico.html?aba=validacao')
  await page.locator('.dgv-tab').waitFor({ timeout: 15000 })
  if (!(await linha('MESA-01').count()) || !(await linha('MESA-02').count())) falhar('fichas aguardando não listadas')
  if (await page.locator('.dgv-tab tbody tr', { hasText: 'TRE-' }).count()) falhar('treino apareceu sem "mostrar treino"')
  await foto('mesa_lista')
  ok('lista: aguardando validação, treino escondido')

  // ficha aberta
  await linha('MESA-01').click()
  await page.locator('.dgv-gaveta .dgv-ident').waitFor()
  const corpo = await page.textContent('.dgv-g-corpo')
  if (!/Maria da Silva/.test(corpo) || !/GPS -9,9731/.test(corpo)) falhar('identificação ausente para a coordenação')
  if (!/Médio completo/.test(corpo) || !/Fundamental incompleto/.test(corpo)) falhar('escolaridade da v2 sem rótulo')
  if (!/Outra: cacimba/.test(corpo)) falhar('"especifique" não mostrado')
  if (!/aviso\(s\) da revisão/.test(corpo)) falhar('avisos da revisão ausentes')
  if (!(await page.locator('.dgv-resp.aviso', { hasText: 'Não respondeu' }).count())) falhar('"Não respondeu" sem destaque')
  await page.waitForFunction(() => /^data:image/.test((document.querySelector('.dgv-foto img') || {}).src || ''))
  await foto('mesa_ficha')
  ok('ficha: avisos, identificação, moradores (v2), "especifique" e foto assinada')

  // apagar foto
  await page.click('.dgv-foto button')
  await page.waitForFunction(() => !document.querySelector('.dgv-foto'))
  if (consulta("select f.id from diag_fotos f join diag_fichas x on x.id = f.ficha_id where x.codigo = 'DSA-XAP-261002-MESA-01'").length) falhar('foto não apagada')
  if (!consulta("select 1 from diag_expurgo_arquivos where caminho like 'aaaa1111-0000-0000-0000-000000000001/%'").length) falhar('arquivo da foto fora da fila de expurgo')
  ok('apagar foto (registro some, arquivo vai para a fila de expurgo)')

  // devolver: motivo obrigatório
  await page.click('.dgv-dev')
  await page.click('#dgv-acoes .btn-primary')
  if (consulta("select status from diag_fichas where codigo = 'DSA-XAP-261002-MESA-01'")[0].status !== 'enviada') falhar('devolveu sem motivo')
  await page.fill('#dgv-motivo', 'Conferir a P19 com a família')
  await page.click('#dgv-acoes .btn-primary')
  await page.locator('.dgv-g-topo .dgv-st-devolvida').waitFor()
  const d = consulta("select status, motivo_devolucao from diag_fichas where codigo = 'DSA-XAP-261002-MESA-01'")[0]
  if (d.status !== 'devolvida' || d.motivo_devolucao !== 'Conferir a P19 com a família') falhar('devolução no banco: ' + JSON.stringify(d))
  if (!/Aguardando → Devolvida.*Conferir a P19/.test(await page.textContent('.dgv-hist'))) falhar('histórico sem a devolução')
  ok('devolver ao técnico (motivo obrigatório, histórico)')
  await page.click('.dgv-g-topo button')

  // validar (com aviso de confirmação) e reabrir
  await linha('MESA-02').click()
  await page.locator('#dgv-acoes .btn-primary').waitFor()
  await page.click('#dgv-acoes .btn-primary')                     // Validar (confirm aceito)
  await page.locator('.dgv-g-topo .dgv-st-validada').waitFor()
  const v = consulta("select status, validado_em, validado_por from diag_fichas where codigo = 'DSA-XAP-261002-MESA-02'")[0]
  if (v.status !== 'validada' || !v.validado_em || v.validado_por !== COORD) falhar('validação no banco: ' + JSON.stringify(v))
  await page.click('.dgv-dev')                                     // Reabrir
  await page.fill('#dgv-motivo', 'Reabrir: idade da P6 divergente')
  await page.click('#dgv-acoes .btn-primary')
  await page.locator('.dgv-g-topo .dgv-st-devolvida').waitFor()
  await page.click('.dgv-desc')                                    // descartar a devolvida
  await page.fill('#dgv-motivo', 'Entrevista duplicada')
  await page.click('#dgv-acoes .btn-danger')
  await page.locator('.dgv-g-topo .dgv-st-descartada').waitFor()
  const hist = consulta("select h.status_para from diag_fichas_historico h join diag_fichas f on f.id = h.ficha_id where f.codigo = 'DSA-XAP-261002-MESA-02' order by h.id").map(h => h.status_para)
  if (hist.join('>') !== 'enviada>validada>devolvida>descartada') falhar('transições: ' + hist.join('>'))
  if (await page.locator('#dgv-acoes .btn').count()) falhar('ficha descartada ainda com botões')
  ok('validar → reabrir → descartar, pela RPC (histórico completo)')
  await page.click('.dgv-g-topo button')
  await page.click('.dgv-chip:has-text("Todas")')
  await page.check('.dgv-check input')
  const temTreino = consulta('select 1 from diag_fichas where treino').length > 0   // criado pelo app_fluxo.js
  if (temTreino && !(await page.locator('.dgv-tab tbody tr', { hasText: 'TRE-' }).count())) falhar('"mostrar treino" não mostrou o treino')
  ok('filtros: todas e mostrar treino')

  // consultor externo: lê sem identificação, fotos e botões
  usuarioLogado = CONS
  await page.goto(BASE + '/pages/diagnostico.html?aba=validacao')
  await page.locator('.dgv-chips').waitFor({ timeout: 15000 })
  if ((await page.textContent('.dg-aba[data-aba="validacao"]')).trim() !== 'Fichas') falhar('aba do consultor deveria se chamar "Fichas"')
  if (await page.locator('.dg-aba[data-aba="admin"]').count()) falhar('consultor vê a aba Admin')
  await page.click('.dgv-chip:has-text("Todas")')
  await linha('MESA-01').click()
  await page.locator('.dgv-g-corpo .dgv-bloco').first().waitFor()
  const c = await page.textContent('.dgv-g-corpo')
  if (/Maria da Silva/.test(c) || /GPS/.test(c) || (await page.locator('.dgv-ident').count())) falhar('consultor viu identificação')
  if (await page.locator('.dgv-foto, #dgv-acoes .btn').count()) falhar('consultor viu fotos ou botões')
  if (!/Médio completo/.test(c)) falhar('consultor não vê as respostas')
  await foto('mesa_consultor')
  ok('consultor externo: lê respostas sem nome, GPS, fotos e botões')

  if (errosJs.length) falhar('erros de JavaScript: ' + errosJs.join(' | '))
  await browser.close()
  console.log('OK — mesa de validação passou')
})().catch(e => { console.error(e); process.exit(1) })
