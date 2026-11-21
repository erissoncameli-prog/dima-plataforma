// ════════════════════════════════════════════════════════════════════════
// Acessos por módulo liberado (migrações 20261126_acessos_*) — telas de verdade no Chromium.
// O supabase-js do CDN vira um banco em memória (tabelas + RPCs falsas); nada toca o Supabase.
// Cobre: trava de página → "Sem acesso" e pedido de acesso; vínculo de responsável abre Produtos;
// menu só com o liberado; Usuários (caixas editáveis, revisão confirmada, retirada de módulo,
// liberar entrada); tela de entrada com a conta suspensa ("Pedir liberação").
//   uso: node tests/acessos/telas.js   (precisa do pacote playwright e de python3)
// ════════════════════════════════════════════════════════════════════════
'use strict'
const { chromium } = require('playwright')
const { spawn } = require('node:child_process')
const path = require('node:path')

const RAIZ = path.resolve(__dirname, '..', '..')
const PORTA = 5531
const BASE = `http://127.0.0.1:${PORTA}`
let falhas = 0
const ok = m => console.log('  ✓ ' + m)
const ruim = m => { console.error('  ✗ ' + m); falhas++ }
const conf = (c, m) => (c ? ok(m) : ruim(m))

const SA = '00000000-0000-0000-0000-0000000000a1'
const TEC = '00000000-0000-0000-0000-0000000000b1'
const RESP = '00000000-0000-0000-0000-0000000000b2'
const SUSP = '00000000-0000-0000-0000-0000000000b3'
const futuro = new Date(Date.now() + 10 * 864e5).toISOString()

// Banco falso, injetado na página antes de qualquer script (window.__BANCO / __RPCS / __GRAVADO)
function stub(banco, logado) {
  return `(() => {
  const B = ${JSON.stringify(banco)};
  window.__GRAVADO = []; window.__RPCS = [];
  const usuario = ${JSON.stringify(logado)};
  function q(tabela) {
    const f = []; let acao = 'select', valores = null, unico = false, lim = null;
    const api = {
      select() { return api }, order() { return api }, range() { return api },
      limit(n) { lim = n; return api },
      eq(c, v) { f.push(r => r[c] === v); return api }, neq(c, v) { f.push(r => r[c] !== v); return api },
      in(c, v) { f.push(r => v.includes(r[c])); return api }, lte(c, v) { f.push(r => !r[c] || r[c] <= v); return api },
      gte() { return api }, is(c, v) { f.push(r => (r[c] ?? null) === v); return api }, not() { return api }, or() { return api },
      ilike() { return api }, filter() { return api }, match() { return api },
      single() { unico = true; return api }, maybeSingle() { unico = true; return api },
      update(v) { acao = 'update'; valores = v; return api }, upsert(v) { acao = 'upsert'; valores = v; return api },
      insert(v) { acao = 'insert'; valores = v; return api },
      then(res, rej) {
        let linhas = (B[tabela] || []).filter(r => f.every(fn => fn(r)));
        if (acao !== 'select') { window.__GRAVADO.push({ tabela, acao, valores, n: linhas.length }); return Promise.resolve({ data: null, error: null }).then(res, rej) }
        if (lim) linhas = linhas.slice(0, lim);
        return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null, count: linhas.length }).then(res, rej);
      },
    };
    return api;
  }
  const RPC = B.__rpc || {};
  const cliente = {
    auth: {
      getSession: async () => ({ data: { session: usuario ? { user: { id: usuario }, access_token: 't' } : null } }),
      getUser: async () => ({ data: { user: usuario ? { id: usuario } : null } }),
      signInWithPassword: async () => (B.__login || { data: null, error: { message: 'Invalid login credentials' } }),
      signOut: async () => ({ error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: q,
    rpc: async (nome, args) => { window.__RPCS.push({ nome, args }); return { data: RPC[nome] ?? null, error: null } },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: '' } }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {},
  };
  window.supabase = { createClient: () => cliente };
})();`
}

function bancoBase() {
  return {
    usuarios: [
      { id: SA, nome_completo: 'Ana Admin', email: 'ana@x.br', perfil: 'super_admin', ativo: true, criado_em: '2026-01-01' },
      { id: TEC, nome_completo: 'Tito Técnico', email: 'tito@x.br', perfil: 'tecnico', ativo: true, criado_em: '2026-01-01', ultimo_acesso_em: '2026-11-20' },
      { id: RESP, nome_completo: 'Rita Responsável', email: 'rita@x.br', perfil: 'tecnico', ativo: true, criado_em: '2026-01-01' },
      { id: SUSP, nome_completo: 'Saulo Suspenso', email: 'saulo@x.br', perfil: 'consultor_externo', ativo: true, criado_em: '2026-01-01',
        bloqueado_inatividade_em: '2026-11-20T10:00:00Z' },
    ],
    usuario_permissoes: [
      { usuario_id: TEC, modulo: 'atividades', ativo: true, valido_de: '2026-01-01', valido_ate: futuro, em_revisao: true, revisao_valido_ate_original: null },
      { usuario_id: TEC, modulo: 'viagens', ativo: true, valido_de: '2026-01-01', valido_ate: futuro, em_revisao: true, revisao_valido_ate_original: null },
      { usuario_id: RESP, modulo: 'mapa', ativo: true, valido_de: '2026-01-01', valido_ate: null, em_revisao: false },
    ],
    acesso_modulos: [
      { modulo: 'atividades', rotulo: 'Atividades', nucleo: false, ordem: 10 },
      { modulo: 'contratos', rotulo: 'Contratos', nucleo: false, ordem: 21 },
      { modulo: 'viagens', rotulo: 'Viagens', nucleo: false, ordem: 40 },
      { modulo: 'mapa', rotulo: 'Mapa Interativo', nucleo: false, ordem: 42 },
    ],
    atividade_responsaveis: [{ usuario_id: RESP, ativo: true }],
    usuario_pedidos_acesso: [], solicitacoes_senha: [], configuracoes_sistema: [], notificacoes: [],
    __rpc: { fn_meus_vinculos: {}, fn_acesso_pedir: 'p1', fn_publico_pedir_liberacao: { ok: true } },
  }
}

async function pagina(navegador, banco, logado) {
  const ctx = await navegador.newContext()
  const pg = await ctx.newPage()
  await pg.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: stub(banco, logado) }))
  await pg.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: '' }))
  await pg.addInitScript(() => { try { localStorage.setItem('dima_ultima_atividade', String(Date.now())) } catch (e) {} })
  pg.on('pageerror', e => console.log('    [erro na página] ' + e.message))
  return { ctx, pg }
}

;(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORTA), '--bind', '127.0.0.1'], { cwd: RAIZ, stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 800))
  const nav = await chromium.launch()
  try {
    console.log('Trava de página e "Sem acesso"')
    {
      const banco = bancoBase(); banco.__rpc.fn_meus_vinculos = { responsavel: false }
      const { ctx, pg } = await pagina(nav, banco, TEC)
      await pg.goto(BASE + '/pages/contratos.html')
      await pg.waitForURL(/sem-acesso\.html\?m=contratos/, { timeout: 8000 }).catch(() => {})
      conf(/sem-acesso\.html\?m=contratos/.test(pg.url()), 'técnico sem Contratos é levado a "Sem acesso"')
      await pg.waitForFunction(() => document.querySelectorAll('#sa-modulo option').length > 0, null, { timeout: 8000 })
      conf(await pg.locator('#sa-aviso').innerText().then(t => /Contratos/.test(t)), 'aviso diz qual módulo falta')
      conf(await pg.$eval('#sa-modulo', s => s.value) === 'contratos', 'o pedido já vem com o módulo escolhido')
      const menu = await pg.locator('#sidebar').innerText()
      conf(/Atividades/.test(menu) && !/Contratos/.test(menu) && !/Usuários/.test(menu), 'menu mostra só o liberado (Atividades sim; Contratos e Usuários não)')
      conf(await pg.locator('#sidebar a.nav-item[href="tarefas.html"]').count() === 1 && await pg.locator('#sidebar a.nav-item[href="dashboard.html"]').count() === 1, 'núcleo (Visão Geral e Tarefas) sempre no menu')
      await pg.click('#sa-pedir')
      await pg.waitForFunction(() => window.__RPCS.some(r => r.nome === 'fn_acesso_pedir'))
      const rpc = await pg.evaluate(() => window.__RPCS.find(r => r.nome === 'fn_acesso_pedir'))
      conf(rpc.args.p_modulo === 'contratos', 'pedir acesso chama fn_acesso_pedir com o módulo')
      await ctx.close()
    }
    console.log('Vínculo de responsável')
    {
      const banco = bancoBase(); banco.__rpc.fn_meus_vinculos = { responsavel: true }
      const { ctx, pg } = await pagina(nav, banco, RESP)
      await pg.goto(BASE + '/pages/produtos.html')
      await pg.waitForTimeout(2500)
      conf(/produtos\.html/.test(pg.url()), 'responsável abre Produtos pelo vínculo, sem o módulo')
      await pg.goto(BASE + '/pages/financeiro.html')
      await pg.waitForURL(/sem-acesso/, { timeout: 8000 }).catch(() => {})
      conf(/sem-acesso\.html\?m=financeiro/.test(pg.url()), 'mas Financeiro (sem vínculo) continua fechado')
      await pg.goto(BASE + '/pages/contratos.html')
      await pg.waitForTimeout(2500)
      conf(/contratos\.html/.test(pg.url()), 'responsável abre Contratos pelo vínculo (aprovar encerramento)')
      await ctx.close()
    }
    console.log('Vínculo de viajante')
    {
      const banco = bancoBase(); banco.__rpc.fn_meus_vinculos = { viagem: true }
      const { ctx, pg } = await pagina(nav, banco, RESP)
      await pg.goto(BASE + '/pages/viagens.html')
      await pg.waitForTimeout(2500)
      conf(/viagens\.html/.test(pg.url()), 'quem participa de uma viagem abre Viagens sem o módulo')
      await pg.goto(BASE + '/pages/patrimonio.html')
      await pg.waitForURL(/sem-acesso/, { timeout: 8000 }).catch(() => {})
      conf(/sem-acesso\.html\?m=patrimonio/.test(pg.url()), 'mas Patrimônio (sem bem sob guarda) continua fechado')
      await ctx.close()
    }
    console.log('Usuários (super_admin)')
    {
      const banco = bancoBase()
      const { ctx, pg } = await pagina(nav, banco, SA)
      await pg.goto(BASE + '/pages/usuarios.html')
      await pg.waitForSelector('#tbody-usuarios tr[data-id]', { timeout: 8000 })
      const kpis = await pg.locator('#stats').innerText()
      conf(/Acessos em revisão/.test(kpis) && /Suspensos por inatividade/.test(kpis) && /Pedidos de acesso/.test(kpis), 'números do topo: revisão, suspensos e pedidos')
      conf(/Suspenso por inatividade/.test(await pg.locator(`tr[data-id="${SUSP}"]`).innerText()), 'lista marca quem está suspenso')
      await pg.click(`tr[data-id="${TEC}"]`)
      await pg.waitForSelector('#perm-chk-atividades', { timeout: 8000 })
      conf(await pg.$eval('#pn-acessos', e => !e.hidden), 'pessoa em revisão abre na aba Acessos')
      conf(await pg.$eval('#perm-chk-contratos', c => !c.disabled && !c.checked), 'caixa de módulo fora do perfil é editável')
      conf(await pg.$eval('#perm-chk-atividades', c => !c.disabled && c.checked), 'caixa de módulo do perfil é editável (não fica mais travada)')
      conf(await pg.$eval('#perm-dt-atividades', d => d.disabled), 'prazo de quem está em revisão fica travado até "Revisei"')
      await pg.uncheck('#perm-chk-viagens')
      await pg.check('#perm-confirmar')
      conf(await pg.$eval('#perm-dt-atividades', d => !d.disabled), '"Revisei" destrava o prazo')
      await pg.click('#mu-salvar')
      await pg.waitForFunction(() => window.__GRAVADO.filter(g => g.tabela === 'usuario_permissoes').length >= 2)
      const g = await pg.evaluate(() => window.__GRAVADO.filter(x => x.tabela === 'usuario_permissoes'))
      conf(g.some(x => x.acao === 'update' && x.valores.em_revisao === false && x.valores.revisado_por), 'confirmar a revisão grava em_revisao = false e quem revisou')
      conf(g.some(x => x.acao === 'update' && x.valores.ativo === false), 'desmarcar retira o módulo (ativo = false)')
      await pg.waitForTimeout(400)
      await pg.click(`tr[data-id="${SUSP}"]`)
      await pg.waitForSelector('button:has-text("Liberar entrada")', { timeout: 8000 })
      ok('pessoa suspensa tem o botão "Liberar entrada"')
      await ctx.close()
    }
    console.log('Tela de entrada com a conta suspensa')
    {
      const banco = bancoBase(); banco.__login = { data: null, error: { message: 'User is banned' } }
      const { ctx, pg } = await pagina(nav, banco, null)
      await pg.goto(BASE + '/index.html')
      await pg.fill('#en-email', 'saulo@x.br'); await pg.fill('#en-senha', 'qualquer1')
      await pg.click('#en-entrar')
      await pg.waitForSelector('#en-liberar:not([hidden])', { timeout: 8000 })
      conf(/15 dias sem uso/.test(await pg.locator('#en-erro').innerText()), 'mensagem explica a suspensão')
      await pg.click('#en-liberar')
      conf(/liberação/i.test(await pg.locator('#en-ped-titulo').innerText()), 'abre o pedido de liberação')
      await pg.click('#en-ped-btn')
      await pg.waitForFunction(() => window.__RPCS.some(r => r.nome === 'fn_publico_pedir_liberacao'))
      ok('pedido chama fn_publico_pedir_liberacao')
      await pg.waitForSelector('#en-ped-ok:not([hidden])')
      conf(/3 dias/.test(await pg.locator('#en-ped-ok').innerText()), 'resposta igual para todos, com o prazo de 3 dias')
      await ctx.close()
    }
  } catch (e) { ruim('erro no teste: ' + e.message) }
  finally { await nav.close(); srv.kill() }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.')
  process.exit(falhas ? 1 : 0)
})()
