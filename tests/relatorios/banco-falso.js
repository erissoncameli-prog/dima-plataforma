// Banco falso do supabase-js para os testes dos relatórios (nada toca o Supabase).
// Injetado no lugar do CDN: window.supabase.createClient() devolve um cliente em memória.
// Registra cada consulta em window.__CONSULTAS (tabela, select, nº de linhas) para saber o que falta semear.
'use strict'
function stub(banco, logado) {
  return `(() => {
  const B = ${JSON.stringify(banco)};
  window.__CONSULTAS = []; window.__RPCS = [];
  const usuario = ${JSON.stringify(logado)};
  const cmp = (a, b) => (a == null ? -1 : b == null ? 1 : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
  function q(tabela) {
    const f = []; let acao = 'select', unico = false, lim = null, sel = '*', ord = [], head = false;
    const api = {
      select(s, o) { sel = s || '*'; if (o && o.head) head = true; return api },
      order(c, o) { ord.push([c, !(o && o.ascending === false)]); return api }, range(a, b) { lim = [a, b]; return api },
      limit(n) { lim = [0, n - 1]; return api },
      eq(c, v) { f.push(r => r[c] === v); return api }, neq(c, v) { f.push(r => r[c] !== v); return api },
      in(c, v) { f.push(r => v.includes(r[c])); return api },
      gte(c, v) { f.push(r => r[c] == null || cmp(r[c], v) >= 0); return api }, gt(c, v) { f.push(r => r[c] == null || cmp(r[c], v) > 0); return api },
      lte(c, v) { f.push(r => r[c] == null || cmp(r[c], v) <= 0); return api }, lt(c, v) { f.push(r => r[c] == null || cmp(r[c], v) < 0); return api },
      is(c, v) { f.push(r => (r[c] ?? null) === v); return api }, not() { return api }, or() { return api },
      ilike() { return api }, like() { return api }, filter() { return api }, match() { return api }, contains() { return api }, overlaps() { return api },
      textSearch() { return api }, csv() { return api }, abortSignal() { return api },
      single() { unico = true; return api }, maybeSingle() { unico = true; return api },
      update() { acao = 'update'; return api }, upsert() { acao = 'upsert'; return api }, insert() { acao = 'insert'; return api }, delete() { acao = 'delete'; return api },
      then(res, rej) {
        if (acao !== 'select') return Promise.resolve({ data: null, error: null }).then(res, rej);
        const semeada = Object.prototype.hasOwnProperty.call(B, tabela);
        let linhas = (B[tabela] || []).filter(r => f.every(fn => fn(r)));
        for (const [c, asc] of ord.slice().reverse()) linhas = linhas.slice().sort((a, b) => asc ? cmp(a[c], b[c]) : cmp(b[c], a[c]));
        const total = linhas.length;
        if (lim) linhas = linhas.slice(lim[0], lim[1] + 1);
        window.__CONSULTAS.push({ tabela, select: String(sel).replace(/\\s+/g, ' ').slice(0, 400), semeada, linhas: linhas.length });
        return Promise.resolve({ data: head ? null : unico ? (linhas[0] || null) : linhas, error: null, count: total }).then(res, rej);
      },
    };
    return api;
  }
  const RPC = B.__rpc || {};
  const cliente = {
    auth: {
      getSession: async () => ({ data: { session: usuario ? { user: { id: usuario }, access_token: 't' } : null } }),
      getUser: async () => ({ data: { user: usuario ? { id: usuario } : null } }),
      signOut: async () => ({ error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: q,
    rpc: async (nome, args) => {
      const tem = Object.prototype.hasOwnProperty.call(RPC, nome);
      window.__RPCS.push({ nome, args, semeada: tem });
      let d = RPC[nome];
      if (d && typeof d === 'object' && !Array.isArray(d) && d.__porArg) d = d[JSON.stringify(args || {})] ?? d.__padrao ?? null;
      return { data: d ?? null, error: null };
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: '' } }), createSignedUrls: async () => ({ data: [] }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {},
    functions: { invoke: async () => ({ data: null, error: null }) },
  };
  window.supabase = { createClient: () => cliente };
})();`
}

const SA = '00000000-0000-0000-0000-0000000000a1'

// Base comum: um super_admin (vê todos os temas) e Dados do sistema. Cada semente acrescenta as tabelas do grupo.
function bancoBase() {
  return {
    usuarios: [{ id: SA, nome_completo: 'Ana Admin da Silva', email: 'ana@x.br', perfil: 'super_admin', ativo: true, criado_em: '2026-01-01T10:00:00Z' }],
    usuario_permissoes: [], acesso_modulos: [], atividade_responsaveis: [], notificacoes: [],
    configuracoes_sistema: [{ projeto_id: 'default', projeto_codigo: '218BRA2001', projeto_nome: 'Projeto de Resiliência Climática no Acre',
      projeto_localizacao: 'Rio Branco — Acre', logos_topo: [], logo_projeto: null, logos_parceiros: [] }],
    __rpc: { fn_meus_vinculos: {}, minhas_permissoes: [], fn_fornecedores_diretorio: [], fn_pat_inv_lista: [] },
  }
}

// Junta a base com a semente do grupo (tabelas somam; __rpc mescla)
function montar(semente) {
  const b = bancoBase()
  for (const [k, v] of Object.entries(semente || {})) {
    if (k === '__rpc') Object.assign(b.__rpc, v)
    else if (Array.isArray(v) && Array.isArray(b[k])) b[k] = b[k].concat(v)
    else b[k] = v
  }
  return b
}

module.exports = { stub, bancoBase, montar, SA }
