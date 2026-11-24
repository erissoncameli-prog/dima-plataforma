// Banco em memória que substitui o supabase-js nas capturas do vídeo.
// Nada toca o Supabase real: todas as linhas vêm de dados.js (fictícias).
// Recebe window.__DADOS (tabelas + __rpc) e window.__UID (usuário logado).
;(() => {
  const B = window.__DADOS || {}
  const RPC = B.__rpc || {}
  const UID = window.__UID
  window.__LOG = []

  const singular = t => {
    t = t.split('_').pop()
    if (/res$/.test(t)) return t.slice(0, -2)           // fornecedores → fornecedor
    if (/oes$/.test(t)) return t.slice(0, -3) + 'ao'    // notificacoes → notificacao
    if (/s$/.test(t)) return t.slice(0, -1)
    return t
  }

  // "id, nome, atividade:atividades!fk(codigo, resultado:resultados(*))" → árvore
  function parseSel(s) {
    const out = []; let i = 0
    s = (s || '*').replace(/\s+/g, ' ')
    function campo() {
      let nome = ''
      while (i < s.length && !',()'.includes(s[i])) nome += s[i++]
      nome = nome.trim()
      let filhos = null
      if (s[i] === '(') { i++; filhos = lista(); i++ }
      return { nome, filhos }
    }
    function lista() {
      const l = []
      while (i < s.length && s[i] !== ')') { const c = campo(); if (c.nome) l.push(c); if (s[i] === ',') i++ }
      return l
    }
    return lista()
  }

  function resolver(tabela, linha, sel) {
    const r = { ...linha }
    for (const c of sel) {
      if (!c.filhos) continue
      let [alias, alvo] = c.nome.includes(':') ? c.nome.split(':') : [c.nome, c.nome]
      alvo = alvo.split('!')[0].trim(); alias = alias.trim()
      if (r[alias] !== undefined && typeof r[alias] === 'object') continue  // já veio pronto nos dados
      const rows = B[alvo] || []
      const fk = [alias + '_id', singular(alvo) + '_id'].find(k => k in linha)
      if (fk) {
        const alvoRow = rows.find(x => x.id === linha[fk])
        r[alias] = alvoRow ? resolver(alvo, alvoRow, c.filhos) : null
      } else {
        const back = singular(tabela) + '_id'
        r[alias] = rows.filter(x => x[back] === linha.id).map(x => resolver(alvo, x, c.filhos))
      }
    }
    return r
  }

  const ord = (a, b) => (a == null) - (b == null) || (a > b ? 1 : a < b ? -1 : 0)

  function q(tabela) {
    const f = []; let acao = 'select', unico = false, lim = null, sel = '*', ordem = null, head = false, faixa = null
    const api = {
      select(s, o) { sel = s || '*'; if (o && o.head) head = true; return api },
      order(c, o) { ordem = { c, asc: !(o && o.ascending === false) }; return api },
      range(a, b) { faixa = [a, b]; return api },
      limit(n) { lim = n; return api },
      eq(c, v) { f.push(r => r[c] === undefined || r[c] === v || String(r[c]) === String(v)); return api },
      neq(c, v) { f.push(r => r[c] !== v); return api },
      in(c, v) { f.push(r => r[c] === undefined || v.includes(r[c])); return api },
      gt(c, v) { f.push(r => r[c] == null || r[c] > v); return api }, gte(c, v) { f.push(r => r[c] == null || r[c] >= v); return api },
      lt(c, v) { f.push(r => r[c] == null || r[c] < v); return api }, lte(c, v) { f.push(r => r[c] == null || r[c] <= v); return api },
      is(c, v) { f.push(r => (r[c] ?? null) === v || r[c] === undefined); return api },
      not() { return api }, or() { return api }, ilike() { return api }, like() { return api }, filter() { return api },
      match() { return api }, contains() { return api }, overlaps() { return api }, textSearch() { return api },
      single() { unico = true; return api }, maybeSingle() { unico = true; return api }, csv() { return api },
      update() { acao = 'update'; return api }, upsert() { acao = 'upsert'; return api },
      insert() { acao = 'insert'; return api }, delete() { acao = 'delete'; return api },
      abortSignal() { return api },
      then(res, rej) {
        if (acao !== 'select') return Promise.resolve({ data: null, error: null }).then(res, rej)
        if (!(tabela in B)) window.__LOG.push('TABELA ' + tabela + ' :: ' + sel)
        let linhas = (B[tabela] || []).filter(r => f.every(fn => fn(r)))
        if (ordem) linhas = [...linhas].sort((a, b) => ordem.asc ? ord(a[ordem.c], b[ordem.c]) : ord(b[ordem.c], a[ordem.c]))
        if (faixa) linhas = linhas.slice(faixa[0], faixa[1] + 1)
        if (lim) linhas = linhas.slice(0, lim)
        const arv = parseSel(sel)
        linhas = linhas.map(l => resolver(tabela, l, arv))
        return Promise.resolve({ data: head ? null : unico ? (linhas[0] || null) : linhas, error: null, count: linhas.length }).then(res, rej)
      },
    }
    return api
  }

  const sessao = UID ? { user: { id: UID, email: 'demo@exemplo.org' }, access_token: 'demo', expires_at: 9e9 } : null
  const cliente = {
    auth: {
      getSession: async () => ({ data: { session: sessao }, error: null }),
      getUser: async () => ({ data: { user: sessao && sessao.user }, error: null }),
      signInWithPassword: async () => ({ data: { session: sessao, user: sessao && sessao.user }, error: null }),
      signOut: async () => ({ error: null }), refreshSession: async () => ({ data: { session: sessao } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: q,
    rpc(nome) {
      const p = (async () => {
        if (!(nome in RPC)) window.__LOG.push('RPC ' + nome)
        let v = RPC[nome]; if (typeof v === 'function') v = v()
        return { data: v === undefined ? [] : v, error: null }
      })()
      p.single = () => p; p.maybeSingle = () => p
      return p
    },
    storage: { from: () => ({
      createSignedUrl: async (p) => ({ data: { signedUrl: '/video/captura/img/vazio.png' } }),
      createSignedUrls: async (ps) => ({ data: ps.map(() => ({ signedUrl: '/video/captura/img/vazio.png' })) }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }), list: async () => ({ data: [] }),
      upload: async () => ({ data: null }), download: async () => ({ data: null }),
    }) },
    functions: { invoke: async () => ({ data: {}, error: null }) },
    channel: () => ({ on() { return this }, subscribe() { return this }, unsubscribe() {} }), removeChannel() {}, removeAllChannels() {},
  }
  window.supabase = { createClient: () => cliente }
})()
