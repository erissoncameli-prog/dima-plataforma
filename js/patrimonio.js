// ── Patrimônio · pages/patrimonio.html ──────────────────────────────────────
// Fase 1 (docs/patrimonio/plano.md): painel, lista de bens, ficha (dados, valor e
// depreciação, arquivos, histórico), incorporação pelo contrato ou por origem
// declarada, correções e estorno, categorias e locais, etiquetas com QR.
// A tela não decide nada: valor contábil e depreciação vêm de vw_pat_bens; toda
// escrita é RPC fn_pat_* (o banco confere permissão, soma e travas). Texto do
// banco sempre por esc(). Ícones SVG por ptIc(), sem emoji. Estilo em css/patrimonio.css.
;(function () {
  'use strict'

  // ── Ícones ────────────────────────────────────────────────────────────────
  const IC = {
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    caixa: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    computador: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="m7 8 10-5M7 14h4M15.5 14h.01"/>',
    som: '<rect x="6" y="2" width="12" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><path d="M12 6h.01"/>',
    ferramenta: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    cadeira: '<path d="M6 3h12v8H6zM5 11h14v4H5zM7 15v6M17 15v6"/>',
    tenda: '<path d="M12 3 2 20h20zM12 3v17M9 20l3-6 3 6"/>',
    veiculo: '<path d="M3 13l2-6h14l2 6v5H3z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/><path d="M3 13h18"/>',
    painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
    contrato: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/>',
    moeda: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
    graf: '<path d="M3 3v18h18"/><path d="m7 9 4 4 3-3 5 5"/>',
    local: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    lapis: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    hist: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    desfazer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
    planilha: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    escudo: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    lixo: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    livro: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    lua: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  }
  function ptIc(n, cls) { return '<svg class="pt-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (IC[n] || IC.caixa) + '</svg>' }
  function trocarIcones(raiz) { (raiz || document).querySelectorAll('i[data-ic]').forEach(e => { e.outerHTML = ptIc(e.dataset.ic, e.dataset.cls || 'p') }) }
  trocarIcones()

  // ── Rótulos (só exibição; as regras moram no banco) ───────────────────────
  const SIT = { em_estoque: 'Em estoque', em_uso: 'Em uso', emprestado: 'Emprestado', em_manutencao: 'Em manutenção',
    extraviado: 'Extraviado', baixado: 'Baixado', transferido: 'Transferido', anulado: 'Cadastro anulado' }
  const FORA = ['anulado', 'baixado', 'transferido']
  const COND = { novo: 'Novo', bom: 'Bom', regular: 'Regular', ruim: 'Ruim', inservivel: 'Inservível' }
  const ORIGEM = { compra_projeto: 'Compra do projeto', cessao: 'Cessão de outro órgão', doacao_recebida: 'Doação recebida', outra: 'Outra origem' }
  const TIT = { unesco_projeto: 'UNESCO (projeto)', sema: 'SEMA/AC', terceiro: 'Terceiro' }
  const LOCAL_TIPO = { sede: 'Sede', escritorio: 'Escritório', unidade_conservacao: 'Unidade de conservação', deposito: 'Depósito', externo: 'Externo', outro: 'Outro' }
  const EVT = { incorporacao: 'Entrada no patrimônio', condicao: 'Condição registrada', correcao: 'Correção da ficha', estorno: 'Estorno',
    distribuicao: 'Entrega ao responsável', transferencia_interna: 'Transferência', devolucao: 'Devolução', emprestimo: 'Empréstimo',
    manutencao_saida: 'Saída para manutenção', manutencao_retorno: 'Volta da manutenção', reavaliacao: 'Reavaliação',
    ocorrencia: 'Ocorrência', inventario: 'Inventário', baixa: 'Baixa', transferencia_definitiva: 'Transferência definitiva' }
  const CAMPO = { valor_aquisicao_brl: 'Valor de aquisição', dt_aquisicao: 'Data de aquisição', dt_inicio_uso: 'Início de uso',
    categoria_codigo: 'Categoria', vida_util_meses: 'Vida útil (meses)', residual_pct: 'Valor residual (%)', quantidade: 'Quantidade' }
  const DOC_TIPO = { foto: 'Foto', laudo: 'Laudo', garantia: 'Termo de garantia', manual: 'Manual', termo: 'Termo', bo: 'Boletim de ocorrência', outro: 'Outro' }

  // ── Estado ────────────────────────────────────────────────────────────────
  const S = {
    bens: [], cats: [], locais: [], fila: [], pode: { gerir: false, coord: false, valor: false },
    aba: 'painel', filtro: { q: '', cat: '', local: '', sit: 'ativos', cond: '', aviso: '' }, sel: new Set(),
    ficha: null, fichaAba: 'dados', eventos: [], docs: [],
  }
  const $ = id => document.getElementById(id)

  // ── Formatação ────────────────────────────────────────────────────────────
  const brl = v => (v == null || v === '') ? '—' : fmtBRL(v)
  const usd = v => (v == null || v === '') ? '—' : 'US$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const dt = d => { if (!d) return '—'; const [a, m, x] = String(d).slice(0, 10).split('-'); return x + '/' + m + '/' + a }
  const dtHora = t => t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const meses = n => { n = Number(n || 0); const a = Math.floor(n / 12), m = n % 12; return [a ? a + (a > 1 ? ' anos' : ' ano') : '', m ? m + (m > 1 ? ' meses' : ' mês') : ''].filter(Boolean).join(' e ') || '0' }
  function parseValor(s) {
    s = String(s ?? '').trim().replace(/[R$\s]/g, '')
    if (!s) return NaN
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
    return Number(s)
  }
  const fmtNum = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  function erroMsg(e) {
    const m = String(e?.message || e || '')
    if (m.includes('pat_bens_serie_uk')) return 'Este número de série já está cadastrado em outro bem.'
    if (m.includes('pat_locais_nome_uk')) return 'Já existe um local com esse nome.'
    if (m.includes('pat_categorias_pkey')) return 'Já existe uma categoria com esse código.'
    const x = m.match(/PAT_[A-Z_]+:?\s*(.*)/)
    if (x) return x[1] || 'Operação recusada pelo banco.'
    if (/permission denied|row-level/i.test(m)) return 'Você não tem permissão para esta ação.'
    return m || 'Não foi possível concluir.'
  }
  const catDe = cod => S.cats.find(c => c.codigo === cod)
  const localDe = id => S.locais.find(l => l.id === id)
  const ativo = b => !FORA.includes(b.situacao)
  function selo(cls, txt) { return '<span class="pt-pill ' + cls + '">' + esc(txt) + '</span>' }
  function avatar(b, cls) {
    return '<span class="pt-av' + (cls ? ' ' + cls : '') + '">' +
      (b.foto_url ? '<img alt="" data-arquivo-src="' + esc(b.foto_url) + '">' : ptIc(b.categoria_icone || 'caixa')) + '</span>'
  }

  // ── Janelas: pilha, foco, Esc, Tab ────────────────────────────────────────
  const FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  const pilha = []
  const FECHAR = {}
  function ptAbrir(id, alvo) {
    const el = $(id); if (!el) return
    if (!el.classList.contains('aberto')) { pilha.push({ id, volta: document.activeElement }); el.classList.add('aberto') }
    requestAnimationFrame(() => {
      const f = (alvo && el.querySelector(alvo)) || el.querySelector('.modal-close') || el.querySelector(FOCAVEIS)
      if (f) f.focus({ preventScroll: true })
    })
  }
  function ptFechar(id) {
    const el = $(id); if (!el) return
    el.classList.remove('aberto')
    const k = pilha.findIndex(x => x.id === id)
    if (k >= 0) { const { volta } = pilha.splice(k, 1)[0]; if (volta && document.contains(volta)) volta.focus({ preventScroll: true }) }
  }
  const fecharTopo = id => (FECHAR[id] || (() => ptFechar(id)))()
  document.addEventListener('keydown', e => {
    const topo = pilha[pilha.length - 1]; if (!topo) return
    const el = $(topo.id)
    if (e.key === 'Escape') { e.preventDefault(); fecharTopo(topo.id) }
    else if (e.key === 'Tab') {
      const f = [...el.querySelectorAll(FOCAVEIS)].filter(x => x.offsetParent !== null)
      if (!f.length) return
      const pri = f[0], ult = f[f.length - 1]
      if (!el.contains(document.activeElement)) { e.preventDefault(); pri.focus() }
      else if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus() }
      else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus() }
    }
  })
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-fechar]'); if (f) { fecharTopo(f.dataset.fechar); return }
    const ov = e.target.classList && e.target.classList.contains('pt-ov') && e.target.classList.contains('aberto') ? e.target : null
    if (ov && ov.id && ov.dataset.fundoFecha !== 'nao') fecharTopo(ov.id)
  })

  // Confirmação em janela própria (no lugar do confirm())
  let confResolve = null
  function ptConfirmar({ titulo, texto, ok = 'Confirmar', perigo = false }) {
    let ov = $('pt-conf')
    if (!ov) {
      ov = document.createElement('div')
      ov.className = 'modal-overlay pt-ov'; ov.id = 'pt-conf'
      ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'pt-conf-tit')
      ov.innerHTML = '<div class="modal pt-medio"><div class="modal-header"><div class="modal-title" id="pt-conf-tit"></div>' +
        '<button type="button" class="modal-close" aria-label="Fechar" data-conf="0">' + ptIc('x', 'p') + '</button></div>' +
        '<div class="modal-body"><p class="pt-sub" id="pt-conf-txt" style="margin:0;font-size:13px;color:var(--txt-forte-2)"></p></div>' +
        '<div class="modal-footer"><span class="esq"></span><button type="button" class="pt-btn" data-conf="0">Cancelar</button>' +
        '<button type="button" class="pt-btn" id="pt-conf-ok" data-conf="1"></button></div></div>'
      document.body.appendChild(ov)
      ov.addEventListener('click', e => { const b = e.target.closest('[data-conf]'); if (b) confFim(b.dataset.conf === '1') })
      FECHAR['pt-conf'] = () => confFim(false)
    }
    $('pt-conf-tit').textContent = titulo
    $('pt-conf-txt').textContent = texto
    const b = $('pt-conf-ok'); b.textContent = ok; b.className = 'pt-btn ' + (perigo ? 'perigo' : 'pri')
    if (confResolve) confResolve(false)
    return new Promise(res => { confResolve = res; ptAbrir('pt-conf', '#pt-conf-ok') })
  }
  function confFim(v) { ptFechar('pt-conf'); const r = confResolve; confResolve = null; if (r) r(v) }

  // Formulário curto genérico (#pt-form)
  let FORM = null
  function abrirForm({ titulo, sub = '', corpo, botao = 'Salvar', perigo = false, aoSalvar, foco }) {
    FORM = { aoSalvar }
    $('pt-form-tit').textContent = titulo
    $('pt-form-sub').textContent = sub
    $('pt-form-corpo').innerHTML = '<div id="pt-form-erro"></div>' + corpo
    $('pt-form-rodape').innerHTML = '<span class="esq"></span><button type="button" class="pt-btn" data-fechar="pt-form">Cancelar</button>' +
      '<button type="button" class="pt-btn ' + (perigo ? 'perigo' : 'pri') + '" id="pt-form-ok">' + esc(botao) + '</button>'
    trocarIcones($('pt-form'))
    $('pt-form-ok').onclick = salvarForm
    ptAbrir('pt-form', foco || 'input,select,textarea')
  }
  async function salvarForm() {
    const b = $('pt-form-ok'); if (!FORM || b.disabled) return
    $('pt-form-erro').innerHTML = ''
    b.disabled = true; const txt = b.textContent; b.textContent = 'Salvando…'
    try {
      const ok = await FORM.aoSalvar($('pt-form-corpo'))
      if (ok !== false) ptFechar('pt-form')
    } catch (e) {
      $('pt-form-erro').innerHTML = '<div class="pt-aviso-f er">' + ptIc('alerta', 'p') + '<span>' + esc(erroMsg(e)) + '</span></div>'
    } finally { b.disabled = false; b.textContent = txt }
  }
  const val = (raiz, sel) => { const el = raiz.querySelector(sel); return el ? el.value.trim() : '' }
  async function rpc(nome, args) {
    const { data, error } = await db.rpc(nome, args)
    if (error) throw error
    return data
  }

  // Tema claro/escuro (componente .dgm-tema da mesa)
  function seletorTema() {
    const tb = document.querySelector('.topbar'); if (!tb || tb.querySelector('.dgm-tema') || typeof DiagTema === 'undefined') return
    const d = document.createElement('div')
    d.className = 'dgm-tema'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Tema')
    d.innerHTML = [['claro', 'sol', 'Claro'], ['escuro', 'lua', 'Escuro']].map(x =>
      '<button type="button" data-tema="' + x[0] + '" aria-pressed="' + (DiagTema.atual() === x[0]) + '">' + ptIc(x[1]) + x[2] + '</button>').join('')
    const bc = tb.querySelector('.topbar-breadcrumb')
    if (bc) bc.parentNode.insertBefore(d, bc); else tb.appendChild(d)
    d.addEventListener('click', ev => {
      const b = ev.target.closest('[data-tema]'); if (!b) return
      DiagTema.definir(b.dataset.tema)
      d.querySelectorAll('[data-tema]').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
    })
  }

  // ── Início ────────────────────────────────────────────────────────────────
  ;(async () => {
    const usuario = await carregarUsuario()
    if (!usuario) { window.location.href = '../index.html'; return }
    $('app').innerHTML = gerarLayout('Patrimônio', 'patrimonio') + '<div class="fade-in pt-pagina" id="pt-pg"></div>' + '</div></div></div>'
    carregarLogosSidebar()
    seletorTema()
    try {
      const [v, g, c, vv] = await Promise.all(['fn_pat_pode_ver', 'fn_pat_pode_gerir', 'fn_pat_pode_coordenar', 'fn_pat_pode_ver_valor'].map(f => rpc(f)))
      S.pode = { gerir: !!g, coord: !!c, valor: !!vv }
      if (!v) {
        $('pt-pg').innerHTML = '<div class="pt-card"><div class="pt-vazio">' + ptIc('escudo') + 'Seu perfil não tem acesso ao patrimônio. Peça o acesso ao administrador.</div></div>'
        return
      }
    } catch (e) { $('pt-pg').innerHTML = '<div class="pt-card"><div class="pt-vazio">' + ptIc('alerta') + esc(erroMsg(e)) + '</div></div>'; return }
    const q = new URLSearchParams(location.search)
    if (['painel', 'bens', 'cadastros', 'guia'].includes(q.get('aba'))) S.aba = q.get('aba')
    await carregar()
    const alvo = q.get('bem')
    if (alvo) {
      const b = S.bens.find(x => x.numero === alvo.toUpperCase() || x.id === alvo)
      if (b) abrirFicha(b.id); else toast('Bem ' + alvo + ' não encontrado (ou sem acesso).', 'warning')
    }
    if (q.get('incorporar') && S.pode.gerir) abrirIncorporar(q.get('incorporar'))
  })()

  async function carregar() {
    try {
      const [b, c, l, f] = await Promise.all([
        db.from('vw_pat_bens').select('*').order('numero'),
        db.from('pat_categorias').select('*').order('ordem').order('nome'),
        db.from('pat_locais').select('*').order('nome'),
        S.pode.gerir ? db.rpc('fn_pat_a_incorporar') : Promise.resolve({ data: [] }),
      ])
      for (const r of [b, c, l, f]) if (r.error) throw r.error
      S.bens = b.data || []; S.cats = c.data || []; S.locais = l.data || []; S.fila = f.data || []
      const ids = new Set(S.bens.map(x => x.id)); S.sel.forEach(id => { if (!ids.has(id)) S.sel.delete(id) })
      render()
    } catch (e) { console.error(e); toast('Erro ao carregar o patrimônio: ' + erroMsg(e), 'error') }
  }

  // ── Página ────────────────────────────────────────────────────────────────
  function avisos() {
    const at = S.bens.filter(ativo)
    const lim = new Date(); lim.setDate(lim.getDate() + 30); const limS = lim.toISOString().slice(0, 10), h = hoje()
    return {
      nf: at.filter(b => b.nf_pendente),
      estoque: at.filter(b => !b.dt_inicio_uso),
      garantia: at.filter(b => b.garantia_ate && b.garantia_ate >= h && b.garantia_ate <= limS),
      foto: at.filter(b => !b.n_fotos),
      ruim: at.filter(b => ['ruim', 'inservivel'].includes(b.condicao)),
    }
  }
  const AVISO_TXT = {
    nf: ['alerta', 'al', 'sem nota fiscal anexada', 'Anexe o PDF da NF na ficha (aba Dados).'],
    estoque: ['relogio', 'in', 'sem início de uso', 'Sem início de uso o bem não deprecia. Informe a data na ficha.'],
    garantia: ['escudo', 'al', 'com garantia vencendo em até 30 dias', 'Se houver defeito, acione a garantia antes do vencimento.'],
    foto: ['camera', 'in', 'sem foto', 'Uma foto ajuda a identificar o bem no inventário.'],
    ruim: ['alerta', 'al', 'em condição ruim ou inservível', 'Avalie manutenção ou baixa.'],
  }

  function render() {
    const av = avisos(), nAv = S.fila.length + av.nf.length
    const abas = [['painel', 'painel', 'Painel', nAv], ['bens', 'lista', 'Bens', 0]]
    if (S.pode.gerir) abas.push(['cadastros', 'engrenagem', 'Categorias e locais', 0])
    abas.push(['guia', 'livro', 'Como funciona', 0])
    $('pt-pg').innerHTML =
      '<div class="pt-abas" role="tablist" aria-label="Seções do patrimônio">' + abas.map(a =>
        '<button type="button" class="pt-aba" role="tab" data-acao="aba" data-aba="' + a[0] + '" aria-selected="' + (S.aba === a[0]) + '">' +
        ptIc(a[1], 'p') + a[2] + (a[3] ? '<span class="n">' + a[3] + '</span>' : '') + '</button>').join('') + '</div>' +
      '<div id="pt-conteudo"></div>'
    if (S.aba === 'bens') renderBens()
    else if (S.aba === 'cadastros' && S.pode.gerir) renderCadastros()
    else if (S.aba === 'guia') renderGuia()
    else renderPainel()
  }

  function renderPainel() {
    const at = S.bens.filter(ativo), av = avisos()
    const soma = k => at.reduce((s, b) => s + Number(b[k] || 0), 0)
    const unid = at.reduce((s, b) => s + Number(b.quantidade || 1), 0)
    const kpis = [
      ['caixa', 'Bens no patrimônio', at.length, unid !== at.length ? unid + ' unidades (com lotes)' : 'fichas ativas', ''],
    ]
    if (S.pode.valor) {
      kpis.push(['moeda', 'Valor de aquisição', brl(soma('valor_aquisicao_brl')), usd(soma('valor_aquisicao_usd')) + ' (câmbio do pagamento)', ''])
      kpis.push(['graf', 'Valor contábil hoje', brl(soma('valor_contabil_brl')), 'depreciação acumulada ' + brl(soma('depreciacao_acumulada_brl')), 'ok'])
    } else {
      kpis.push(['check', 'Em uso', at.filter(b => b.situacao === 'em_uso').length, 'bens em operação', 'ok'])
      kpis.push(['relogio', 'Em estoque', at.filter(b => b.situacao === 'em_estoque').length, 'aguardando uso', ''])
    }
    kpis.push(['alerta', 'Pendências', S.fila.length + av.nf.length,
      (S.pode.gerir ? S.fila.length + ' a incorporar · ' : '') + av.nf.length + ' sem NF', ''])

    const fila = S.pode.gerir ? '<div class="pt-card"><div class="pt-card-h">' + ptIc('contrato', 'p') + 'A incorporar' +
      '<span class="pt-sub">produtos de contratos de equipamentos já aprovados</span>' +
      '<span class="dir"><button type="button" class="pt-btn pri peq" data-acao="incorporar">' + ptIc('mais', 'p') + 'Incorporar bens</button></span></div>' +
      (S.fila.length ? S.fila.map(f =>
        '<div class="pt-fila"><div class="t"><b>Contrato ' + esc(f.contrato_numero) + ' · Produto ' + esc(f.numero_produto ?? '—') + '</b>' +
        '<span>' + esc(f.produto_descricao || f.objeto || '') + '</span>' +
        '<span class="pt-sub">' + esc(f.fornecedor_nome || '') + (f.atividade_codigo ? ' · Atividade ' + esc(f.atividade_codigo) : '') +
        (f.tdr_numero ? ' · TDR ' + esc(f.tdr_numero) : '') + ' · ' + (f.pago_em ? 'pago em ' + dt(f.pago_em) : 'aprovado, ainda não pago') + '</span></div>' +
        '<div class="v">falta incorporar<b>' + brl(f.restante) + '</b>de ' + brl(f.valor_ref) + '</div>' +
        '<button type="button" class="pt-btn pri" data-acao="incorporar" data-produto="' + esc(f.contrato_produto_id) + '">' + ptIc('mais', 'p') + 'Incorporar</button></div>').join('')
        : '<div class="pt-aviso ok">' + ptIc('check', 'p') + '<span class="t">Nenhum produto de equipamentos aguardando. Quando um produto de contrato do tipo <b>Equipamentos</b> for aprovado, ele aparece aqui e o gestor recebe uma tarefa.</span></div>') +
      '</div>' : ''

    const lAv = Object.keys(AVISO_TXT).filter(k => av[k].length).map(k => {
      const [ic, cls, txt, dica] = AVISO_TXT[k]
      return '<div class="pt-aviso ' + cls + '">' + ptIc(ic, 'p') + '<span class="t"><b>' + av[k].length + (av[k].length > 1 ? ' bens' : ' bem') + '</b> ' + txt +
        '. <span class="pt-sub">' + dica + '</span></span><button type="button" class="pt-btn peq" data-acao="ver-aviso" data-aviso="' + k + '">Ver</button></div>'
    }).join('')
    const cardAv = '<div class="pt-card"><div class="pt-card-h">' + ptIc('info', 'p') + 'Avisos</div>' +
      (lAv || '<div class="pt-aviso ok">' + ptIc('check', 'p') + '<span class="t">Nada pendente nos bens cadastrados.</span></div>') + '</div>'

    const agrupar = (chave, nome) => {
      const g = {}
      at.forEach(b => { const k = b[chave] || '—'; const x = g[k] || (g[k] = { nome: nome(b), n: 0, aq: 0, ct: 0 }); x.n++; x.aq += Number(b.valor_aquisicao_brl || 0); x.ct += Number(b.valor_contabil_brl || 0) })
      return Object.values(g).sort((a, b) => b.aq - a.aq || b.n - a.n)
    }
    const tabela = (tit, ic, linhas) => '<div class="pt-card"><div class="pt-card-h">' + ptIc(ic, 'p') + tit + '</div>' +
      (linhas.length ? '<table class="pt-mini"><thead><tr><th>' + (ic === 'local' ? 'Local' : 'Categoria') + '</th><th class="dir">Bens</th>' +
        (S.pode.valor ? '<th class="dir">Aquisição</th><th class="dir">Contábil</th>' : '') + '</tr></thead><tbody>' +
        linhas.map(x => '<tr><td>' + esc(x.nome) + '</td><td class="dir mono">' + x.n + '</td>' +
          (S.pode.valor ? '<td class="dir mono">' + brl(x.aq) + '</td><td class="dir mono">' + brl(x.ct) + '</td>' : '') + '</tr>').join('') + '</tbody></table>'
        : '<div class="pt-vazio">' + ptIc('caixa') + 'Nenhum bem cadastrado ainda.</div>') + '</div>'

    $('pt-conteudo').innerHTML =
      '<div class="pt-kpis">' + kpis.map(k => '<div class="pt-kpi"><span class="pt-kpi-l">' + ptIc(k[0]) + k[1] + '</span>' +
        '<span class="pt-kpi-v ' + k[4] + '">' + esc(String(k[2])) + '</span><span class="pt-kpi-s">' + esc(k[3]) + '</span></div>').join('') + '</div>' +
      fila +
      '<div class="pt-grade2" style="margin-top:16px">' + cardAv + '<div></div></div>' +
      '<div class="pt-grade2" style="margin-top:16px">' +
        tabela('Por categoria', 'caixa', agrupar('categoria_codigo', b => b.categoria_nome)) +
        tabela('Por local', 'local', agrupar('local_id', b => b.local_nome || 'Sem local')) + '</div>'
    // a 2ª coluna da 1ª grade fica vazia de propósito quando não há mais cartões; remove para não sobrar espaço
    const g = $('pt-conteudo').querySelectorAll('.pt-grade2')[0]; if (g) { g.lastElementChild.remove(); g.style.gridTemplateColumns = 'minmax(0,1fr)' }
  }

  // ── Lista de bens ─────────────────────────────────────────────────────────
  function filtrados() {
    const f = S.filtro, q = semAcento(f.q), av = f.aviso ? new Set(avisos()[f.aviso].map(b => b.id)) : null
    return S.bens.filter(b => {
      if (av && !av.has(b.id)) return false
      if (f.sit === 'ativos' ? !ativo(b) : (f.sit && b.situacao !== f.sit)) return false
      if (f.cat && b.categoria_codigo !== f.cat) return false
      if (f.local && b.local_id !== f.local) return false
      if (f.cond && b.condicao !== f.cond) return false
      if (q && !semAcento([b.numero, b.numero_unesco, b.numero_sema, b.descricao, b.marca, b.modelo, b.numero_serie,
        b.local_nome, b.contrato_numero, b.atividade_codigo, b.categoria_nome].join(' ')).includes(q)) return false
      return true
    })
  }

  function renderBens() {
    const f = S.filtro
    const opt = (v, t, s) => '<option value="' + esc(v) + '"' + (s === v ? ' selected' : '') + '>' + esc(t) + '</option>'
    $('pt-conteudo').innerHTML =
      '<div class="pt-filtros" role="group" aria-label="Filtros">' +
        '<label class="pt-busca">' + ptIc('busca', 'p') + '<input type="search" id="pt-q" placeholder="Nº, descrição, série, local, contrato" aria-label="Buscar bem" value="' + esc(f.q) + '"></label>' +
        '<select id="pt-f-sit" aria-label="Situação">' + opt('ativos', 'No patrimônio', f.sit) + opt('', 'Todas as situações', f.sit) +
          Object.keys(SIT).map(k => opt(k, SIT[k], f.sit)).join('') + '</select>' +
        '<select id="pt-f-cat" aria-label="Categoria">' + opt('', 'Todas as categorias', f.cat) + S.cats.map(c => opt(c.codigo, c.nome, f.cat)).join('') + '</select>' +
        '<select id="pt-f-local" aria-label="Local">' + opt('', 'Todos os locais', f.local) + S.locais.map(l => opt(l.id, l.nome + (l.ativo ? '' : ' (inativo)'), f.local)).join('') + '</select>' +
        '<select id="pt-f-cond" aria-label="Condição">' + opt('', 'Qualquer condição', f.cond) + Object.keys(COND).map(k => opt(k, COND[k], f.cond)).join('') + '</select>' +
        (f.aviso ? '<span class="pt-filtro-ativo">' + esc(AVISO_TXT[f.aviso][2]) + '<button type="button" class="pt-link" data-acao="limpar-aviso" aria-label="Tirar filtro">' + ptIc('x', 'p') + '</button></span>' : '') +
        '<span class="pt-cont" id="pt-cont" aria-live="polite"></span>' +
        '<button type="button" class="pt-btn" data-acao="etiquetas" id="pt-btn-etq">' + ptIc('qr', 'p') + 'Etiquetas</button>' +
        '<button type="button" class="pt-btn" data-acao="csv">' + ptIc('planilha', 'p') + 'Planilha</button>' +
        (S.pode.gerir ? '<button type="button" class="pt-btn pri" data-acao="incorporar">' + ptIc('mais', 'p') + 'Incorporar bens</button>' : '') +
      '</div><div class="pt-card" style="margin-top:16px" id="pt-lista"></div>'
    $('pt-q').addEventListener('input', e => { f.q = e.target.value; renderLista() })
    ;[['pt-f-sit', 'sit'], ['pt-f-cat', 'cat'], ['pt-f-local', 'local'], ['pt-f-cond', 'cond']].forEach(([id, k]) =>
      $(id).addEventListener('change', e => { f[k] = e.target.value; renderLista() }))
    renderLista()
  }

  function renderLista() {
    const lista = filtrados(), el = $('pt-lista'); if (!el) return
    $('pt-cont').textContent = lista.length + ' de ' + S.bens.filter(ativo).length + ' bens no patrimônio'
    const n = [...S.sel].length
    $('pt-btn-etq').innerHTML = ptIc('qr', 'p') + 'Etiquetas' + (n ? ' (' + n + ')' : '')
    if (!lista.length) {
      el.innerHTML = '<div class="pt-vazio">' + ptIc('busca') + (S.bens.length ? 'Nenhum bem com esses filtros.' :
        'Nenhum bem cadastrado ainda.' + (S.pode.gerir ? ' Use <b>Incorporar bens</b> para começar.' : '')) + '</div>'
      return
    }
    const todos = lista.every(b => S.sel.has(b.id))
    el.innerHTML = '<div class="pt-tbl-w"><table class="pt-tbl"><thead><tr>' +
      '<th><input type="checkbox" data-acao="sel-todos" aria-label="Selecionar todos para etiqueta"' + (todos ? ' checked' : '') + '></th>' +
      '<th>Nº</th><th>Bem</th><th>Categoria</th><th>Local</th><th>Situação</th>' + (S.pode.valor ? '<th class="dir">Valor</th>' : '') +
      '</tr></thead><tbody>' + lista.map(b =>
        '<tr data-acao="ficha" data-id="' + esc(b.id) + '" class="' + (ativo(b) ? '' : 'fora') + '">' +
        '<td class="c-sel"><input type="checkbox" data-acao="sel" data-id="' + esc(b.id) + '" aria-label="Selecionar ' + esc(b.numero) + '"' + (S.sel.has(b.id) ? ' checked' : '') + '></td>' +
        '<td class="c-num"><span class="pt-num">' + esc(b.numero) + '</span>' + (b.numero_unesco ? '<div class="pt-sub">UNESCO ' + esc(b.numero_unesco) + '</div>' : '') + '</td>' +
        '<td class="c-bem"><div class="pt-bem">' + avatar(b) + '<div><b>' + esc(b.descricao) + (b.quantidade > 1 ? ' · ' + b.quantidade + ' ' + esc(b.unidade) : '') + '</b>' +
          '<span class="pt-sub">' + esc([b.marca, b.modelo].filter(Boolean).join(' ')) + (b.numero_serie ? ' · série ' + esc(b.numero_serie) : '') + '</span>' +
          (b.contrato_numero ? '<div class="pt-sub">Contrato ' + esc(b.contrato_numero) + '</div>' : '') + '</div></div></td>' +
        '<td class="c-cat">' + esc(b.categoria_nome) + '</td>' +
        '<td class="c-local">' + esc(b.local_nome || '—') + '</td>' +
        '<td class="c-sit"><div class="pt-selos" style="margin:0">' + selo('s-' + b.situacao, SIT[b.situacao] || b.situacao) + selo('c-' + b.condicao, COND[b.condicao] || b.condicao) +
          (b.nf_pendente ? selo('al', 'sem NF') : '') + '</div></td>' +
        (S.pode.valor ? '<td class="c-val dir"><span class="pt-val">' + brl(b.valor_contabil_brl) + '<small>aquisição ' + brl(b.valor_aquisicao_brl) + '</small></span></td>' : '') +
        '</tr>').join('') + '</tbody></table></div>'
    assinarImagens(el)
  }

  function exportarCsv() {
    const lista = filtrados()
    if (!lista.length) { toast('Nada para exportar com esses filtros.', 'warning'); return }
    const cols = [['numero', 'Nº'], ['numero_unesco', 'Nº UNESCO'], ['numero_sema', 'Nº SEMA'], ['descricao', 'Descrição'], ['marca', 'Marca'], ['modelo', 'Modelo'],
      ['numero_serie', 'Nº de série'], ['quantidade', 'Quantidade'], ['categoria_nome', 'Categoria'], ['local_nome', 'Local'], ['situacao', 'Situação'],
      ['condicao', 'Condição'], ['origem', 'Origem'], ['contrato_numero', 'Contrato'], ['atividade_codigo', 'Atividade'], ['tdr_numero', 'TDR'],
      ['dt_aquisicao', 'Aquisição'], ['dt_inicio_uso', 'Início de uso'], ['garantia_ate', 'Garantia até'], ['titularidade', 'Titularidade']]
    if (S.pode.valor) cols.push(['nf_numero', 'NF'], ['valor_aquisicao_brl', 'Valor de aquisição (R$)'], ['valor_aquisicao_usd', 'Valor de aquisição (US$)'],
      ['vida_util_meses', 'Vida útil (meses)'], ['residual_pct', 'Residual (%)'], ['meses_depreciados', 'Meses depreciados'],
      ['depreciacao_acumulada_brl', 'Depreciação acumulada (R$)'], ['valor_contabil_brl', 'Valor contábil (R$)'])
    const fmt = (k, v) => {
      if (v == null) return ''
      if (k === 'situacao') return SIT[v] || v
      if (k === 'condicao') return COND[v] || v
      if (k === 'origem') return ORIGEM[v] || v
      if (k === 'titularidade') return TIT[v] || v
      if (/^dt_|garantia_ate/.test(k)) return dt(v)
      if (/_brl$|_usd$|residual_pct/.test(k)) return String(v).replace('.', ',')
      return String(v)
    }
    const linhas = [cols.map(c => c[1])].concat(lista.map(b => cols.map(c => fmt(c[0], b[c[0]]))))
    const csv = '﻿' + linhas.map(l => l.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(';')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'patrimonio-' + hoje() + '.csv'
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
  }

  // ── Categorias e locais ───────────────────────────────────────────────────
  function renderCadastros() {
    const c = S.cats.map(x => '<tr><td>' + ptIc(x.icone, 'p') + ' <b>' + esc(x.nome) + '</b>' + (x.ativo ? '' : ' ' + selo('ne', 'inativa')) +
      '<div class="pt-sub">' + esc(x.referencia || '') + '</div></td><td class="dir mono">' + esc(meses(x.vida_util_meses)) + '</td>' +
      '<td class="dir mono">' + fmtNum(x.residual_pct).replace(',00', '') + '%</td><td>' + (x.controle === 'lote' ? 'Lote (quantidade)' : 'Unidade') +
      (x.exige_serie ? '<div class="pt-sub">série obrigatória</div>' : '') + '</td>' +
      '<td class="dir">' + (S.pode.coord ? '<button type="button" class="pt-btn peq" data-acao="categoria" data-cod="' + esc(x.codigo) + '">' + ptIc('lapis', 'p') + 'Editar</button>' : '') + '</td></tr>').join('')
    const l = S.locais.map(x => {
      const n = S.bens.filter(b => b.local_id === x.id && ativo(b)).length, pai = x.local_pai_id ? localDe(x.local_pai_id) : null
      return '<tr><td><b>' + esc(x.nome) + '</b>' + (x.ativo ? '' : ' ' + selo('ne', 'inativo')) + (pai ? '<div class="pt-sub">dentro de ' + esc(pai.nome) + '</div>' : '') + '</td>' +
        '<td>' + esc(LOCAL_TIPO[x.tipo] || x.tipo) + '</td><td>' + esc(x.municipio || '—') + '</td><td class="dir mono">' + n + '</td>' +
        '<td class="dir"><button type="button" class="pt-btn peq" data-acao="local" data-id="' + esc(x.id) + '">' + ptIc('lapis', 'p') + 'Editar</button></td></tr>'
    }).join('')
    $('pt-conteudo').innerHTML =
      '<div class="pt-card"><div class="pt-card-h">' + ptIc('caixa', 'p') + 'Categorias' +
        '<span class="pt-sub">vida útil e valor residual usados na depreciação (o bem guarda os da data de entrada)</span>' +
        (S.pode.coord ? '<span class="dir"><button type="button" class="pt-btn pri peq" data-acao="categoria">' + ptIc('mais', 'p') + 'Nova categoria</button></span>' : '') + '</div>' +
        '<div class="pt-tbl-w"><table class="pt-mini"><thead><tr><th>Categoria</th><th class="dir">Vida útil</th><th class="dir">Residual</th><th>Controle</th><th></th></tr></thead><tbody>' + c + '</tbody></table></div>' +
        '<div class="pt-aviso in">' + ptIc('info', 'p') + '<span class="t">Valores sugeridos pela tabela do Tesouro Nacional (Macrofunção SIAFI 02.03.30). <b>Confirme com a contabilidade</b> antes de incorporar muitos bens. Mudar a categoria só vale para os bens que entrarem depois.</span></div></div>' +
      '<div class="pt-card" style="margin-top:16px"><div class="pt-card-h">' + ptIc('local', 'p') + 'Locais' +
        '<span class="pt-sub">onde os bens podem estar</span><span class="dir"><button type="button" class="pt-btn pri peq" data-acao="local">' + ptIc('mais', 'p') + 'Novo local</button></span></div>' +
        '<div class="pt-tbl-w"><table class="pt-mini"><thead><tr><th>Local</th><th>Tipo</th><th>Município</th><th class="dir">Bens</th><th></th></tr></thead><tbody>' + l + '</tbody></table></div></div>'
  }

  function formCategoria(cod) {
    const c = cod ? catDe(cod) : null, temBens = c && S.bens.some(b => b.categoria_codigo === c.codigo)
    const ics = ['caixa', 'computador', 'radio', 'som', 'ferramenta', 'cadeira', 'tenda', 'veiculo']
    abrirForm({
      titulo: c ? 'Editar categoria' : 'Nova categoria', sub: c ? c.nome : 'Vida útil e residual valem para os bens que entrarem depois.',
      corpo: '<div class="pt-g2">' +
        '<div class="form-group"><label class="form-label" for="fc-cod">Código</label><input class="form-control mono" id="fc-cod" value="' + esc(c?.codigo || '') + '"' + (c ? ' disabled' : '') + ' placeholder="ex.: drones" maxlength="40"><div class="pt-dica">Letras minúsculas, números e _ (não muda depois).</div></div>' +
        '<div class="form-group"><label class="form-label" for="fc-nome">Nome</label><input class="form-control" id="fc-nome" value="' + esc(c?.nome || '') + '"></div>' +
        '<div class="form-group"><label class="form-label" for="fc-vida">Vida útil (meses)</label><input class="form-control mono" id="fc-vida" type="number" min="1" max="1200" value="' + esc(c?.vida_util_meses || 60) + '"></div>' +
        '<div class="form-group"><label class="form-label" for="fc-res">Valor residual (%)</label><input class="form-control mono" id="fc-res" type="number" min="0" max="99" step="0.5" value="' + esc(c?.residual_pct ?? 10) + '"></div>' +
        '<div class="form-group"><label class="form-label" for="fc-ctl">Controle</label><select class="form-control" id="fc-ctl"' + (temBens ? ' disabled' : '') + '>' +
          '<option value="individual"' + (c?.controle !== 'lote' ? ' selected' : '') + '>Uma ficha por unidade</option><option value="lote"' + (c?.controle === 'lote' ? ' selected' : '') + '>Lote (uma ficha com a quantidade)</option></select>' +
          (temBens ? '<div class="pt-dica">Já há bens nesta categoria: o controle não muda.</div>' : '') + '</div>' +
        '<div class="form-group"><label class="form-label" for="fc-ic">Ícone</label><select class="form-control" id="fc-ic">' + ics.map(i => '<option' + ((c?.icone || 'caixa') === i ? ' selected' : '') + '>' + i + '</option>').join('') + '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label" for="fc-ref">Referência</label><input class="form-control" id="fc-ref" value="' + esc(c?.referencia || '') + '" placeholder="norma ou decisão que define a vida útil"></div>' +
        '<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="fc-serie"' + (c?.exige_serie ? ' checked' : '') + '> Exigir número de série de cada unidade</label>' +
        (c ? '<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:8px"><input type="checkbox" id="fc-ativo"' + (c.ativo ? ' checked' : '') + '> Categoria ativa (desativada não aparece em novas entradas)</label>' : ''),
      aoSalvar: async r => {
        await rpc('fn_pat_salvar_categoria', { p: {
          codigo: c ? c.codigo : val(r, '#fc-cod'), nome: val(r, '#fc-nome'), vida_util_meses: Number(val(r, '#fc-vida')),
          residual_pct: Number(val(r, '#fc-res')), controle: val(r, '#fc-ctl'), exige_serie: r.querySelector('#fc-serie').checked,
          icone: val(r, '#fc-ic'), referencia: val(r, '#fc-ref'), ordem: c?.ordem ?? (S.cats.length + 1) * 10,
          ativo: c ? r.querySelector('#fc-ativo').checked : true } })
        toast('Categoria salva.', 'success'); await carregar()
      },
    })
  }

  function formLocal(id) {
    const l = id ? localDe(id) : null
    abrirForm({
      titulo: l ? 'Editar local' : 'Novo local', sub: l ? l.nome : '',
      corpo: '<div class="form-group"><label class="form-label" for="fl-nome">Nome</label><input class="form-control" id="fl-nome" value="' + esc(l?.nome || '') + '" placeholder="ex.: Escritório da APA Amapá"></div>' +
        '<div class="pt-g2"><div class="form-group"><label class="form-label" for="fl-tipo">Tipo</label><select class="form-control" id="fl-tipo">' +
          Object.keys(LOCAL_TIPO).map(k => '<option value="' + k + '"' + ((l?.tipo || 'outro') === k ? ' selected' : '') + '>' + LOCAL_TIPO[k] + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><label class="form-label" for="fl-mun">Município</label><input class="form-control" id="fl-mun" value="' + esc(l?.municipio || '') + '"></div></div>' +
        '<div class="form-group"><label class="form-label" for="fl-end">Endereço ou referência</label><input class="form-control" id="fl-end" value="' + esc(l?.endereco || '') + '"></div>' +
        '<div class="form-group"><label class="form-label" for="fl-pai">Fica dentro de</label><select class="form-control" id="fl-pai"><option value="">—</option>' +
          S.locais.filter(x => x.id !== id && x.ativo).map(x => '<option value="' + esc(x.id) + '"' + (l?.local_pai_id === x.id ? ' selected' : '') + '>' + esc(x.nome) + '</option>').join('') + '</select></div>' +
        '<div class="pt-g2"><div class="form-group"><label class="form-label" for="fl-lat">Latitude (opcional)</label><input class="form-control mono" id="fl-lat" value="' + esc(l?.lat ?? '') + '" placeholder="-9.97"></div>' +
        '<div class="form-group"><label class="form-label" for="fl-lon">Longitude (opcional)</label><input class="form-control mono" id="fl-lon" value="' + esc(l?.lon ?? '') + '" placeholder="-67.81"></div></div>' +
        (l ? '<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="fl-ativo"' + (l.ativo ? ' checked' : '') + '> Local ativo</label>' : ''),
      aoSalvar: async r => {
        const num = s => { s = s.replace(',', '.'); return s === '' ? '' : s }
        await rpc('fn_pat_salvar_local', { p: { id: l?.id || '', nome: val(r, '#fl-nome'), tipo: val(r, '#fl-tipo'), municipio: val(r, '#fl-mun'),
          endereco: val(r, '#fl-end'), local_pai_id: val(r, '#fl-pai'), lat: num(val(r, '#fl-lat')), lon: num(val(r, '#fl-lon')),
          ativo: l ? r.querySelector('#fl-ativo').checked : true } })
        toast('Local salvo.', 'success'); await carregar()
      },
    })
  }

  // ── Como funciona (conteúdo único em AJUDA.patrimonio, js/ajuda.js) ───────
  function renderGuia() {
    const a = (typeof AJUDA !== 'undefined' && AJUDA.patrimonio && AJUDA.patrimonio.pt) || null
    $('pt-conteudo').innerHTML = a ? '<div class="pt-card"><div class="pt-card-b"><p>' + esc(a.intro) + '</p></div></div>' +
      '<div class="pt-guia" style="margin-top:16px">' + a.secoes.map(s => '<div class="pt-card"><div class="pt-card-h">' + esc(s.titulo) + '</div>' +
        '<div class="pt-card-b"><ul>' + s.itens.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul></div></div>').join('') + '</div>'
      : '<div class="pt-card"><div class="pt-vazio">O guia não carregou.</div></div>'
  }

  // ── Ficha do bem ──────────────────────────────────────────────────────────
  async function abrirFicha(id, aba) {
    const b = S.bens.find(x => x.id === id); if (!b) return
    S.ficha = b; S.fichaAba = aba || (S.ficha && S.ficha.id === id ? S.fichaAba : 'dados')
    $('pt-ficha-ic').innerHTML = avatar(b, 'g')
    $('pt-ficha-tit').textContent = b.numero + ' · ' + b.descricao
    $('pt-ficha-sub').innerHTML = selo('s-' + b.situacao, SIT[b.situacao]) + ' ' + selo('c-' + b.condicao, COND[b.condicao]) + ' <span class="pt-sub">' + esc(b.categoria_nome) + '</span>'
    $('pt-ficha-corpo').innerHTML = '<div class="pt-carregando">Carregando…</div>'
    $('pt-ficha-rodape').innerHTML = ''
    ptAbrir('pt-ficha')
    try {
      const [e, d] = await Promise.all([
        db.from('vw_pat_eventos').select('*').eq('bem_id', id).order('registrado_em'),
        db.from('pat_documentos').select('*').eq('bem_id', id).eq('ativo', true).order('enviado_em'),
      ])
      if (e.error) throw e.error; if (d.error) throw d.error
      S.eventos = e.data || []; S.docs = d.data || []
    } catch (err) { $('pt-ficha-corpo').innerHTML = '<div class="pt-aviso-f er">' + esc(erroMsg(err)) + '</div>'; return }
    renderFicha()
  }

  function ultimoVivo() {
    const v = S.eventos.filter(e => e.tipo !== 'estorno' && !e.estornado)
    return v[v.length - 1] || null
  }

  function renderFicha() {
    const b = S.ficha, G = S.pode.gerir && ativo(b), C = S.pode.coord && ativo(b)
    const abas = [['dados', 'doc', 'Dados', 0]]
    if (S.pode.valor) abas.push(['valor', 'graf', 'Valor e depreciação', 0])
    abas.push(['arquivos', 'camera', 'Fotos e arquivos', S.docs.length], ['hist', 'hist', 'Histórico', S.eventos.length])
    if (!abas.some(a => a[0] === S.fichaAba)) S.fichaAba = 'dados'
    $('pt-ficha-corpo').innerHTML =
      '<div class="pt-tabs" role="tablist">' + abas.map(a => '<button type="button" class="pt-tab" role="tab" data-acao="ficha-aba" data-aba="' + a[0] + '" aria-selected="' + (S.fichaAba === a[0]) + '">' +
        ptIc(a[1], 'p') + a[2] + (a[3] ? '<span class="n">' + a[3] + '</span>' : '') + '</button>').join('') + '</div>' +
      '<div class="pt-painel' + (S.fichaAba === 'dados' ? ' ativo' : '') + '">' + fichaDados(b, G) + '</div>' +
      (S.pode.valor ? '<div class="pt-painel' + (S.fichaAba === 'valor' ? ' ativo' : '') + '">' + fichaValor(b) + '</div>' : '') +
      '<div class="pt-painel' + (S.fichaAba === 'arquivos' ? ' ativo' : '') + '">' + fichaArquivos(b, G) + '</div>' +
      '<div class="pt-painel' + (S.fichaAba === 'hist' ? ' ativo' : '') + '">' + fichaHistorico(b, C) + '</div>'
    assinarImagens($('pt-ficha-corpo'))
    const ult = ultimoVivo()
    $('pt-ficha-rodape').innerHTML = '<span class="esq">' +
      (C && ult && ult.tipo === 'incorporacao' ? '<button type="button" class="pt-btn perigo" data-acao="estornar" data-ev="' + esc(ult.id) + '">' + ptIc('desfazer', 'p') + 'Anular cadastro</button>' : '') +
      '</span>' +
      '<button type="button" class="pt-btn" data-acao="etiqueta-uma">' + ptIc('qr', 'p') + 'Etiqueta</button>' +
      (C ? '<button type="button" class="pt-btn" data-acao="corrigir">' + ptIc('moeda', 'p') + 'Corrigir valores</button>' : '') +
      (G && !b.dt_inicio_uso ? '<button type="button" class="pt-btn" data-acao="inicio-uso">' + ptIc('relogio', 'p') + 'Informar início de uso</button>' : '') +
      (G ? '<button type="button" class="pt-btn" data-acao="condicao">' + ptIc('alerta', 'p') + 'Registrar condição</button>' : '') +
      (G ? '<button type="button" class="pt-btn pri" data-acao="editar">' + ptIc('lapis', 'p') + 'Editar ficha</button>' : '')
  }

  const campo = (r, v) => '<div class="pt-campo"><span>' + esc(r) + '</span><b>' + (v == null || v === '' ? '<span class="pt-nada">—</span>' : v) + '</b></div>'

  function fichaDados(b, G) {
    const nf = b.nf_url ? '<a href="#" data-arquivo="' + esc(b.nf_url) + '">' + esc(b.nf_numero ? 'NF ' + b.nf_numero : (b.nf_nome || 'Nota fiscal')) + '</a>' + (b.nf_data ? ' · ' + dt(b.nf_data) : '')
      : (b.nf_numero ? esc('NF ' + b.nf_numero) + (b.nf_data ? ' · ' + dt(b.nf_data) : '') : '')
    return (!ativo(b) ? '<div class="pt-aviso-f al">' + ptIc('info', 'p') + '<span>' + esc(SIT[b.situacao]) + ': o bem saiu do patrimônio ativo. A ficha fica para consulta.</span></div>' : '') +
      (b.nf_pendente && ativo(b) ? '<div class="pt-aviso-f al">' + ptIc('alerta', 'p') + '<span>A nota fiscal ainda não foi anexada.' +
        (G ? ' <button type="button" class="pt-link" data-acao="nf">Anexar NF</button>' : '') + '</span></div>' : '') +
      '<div class="pt-sec">' + ptIc('caixa', 'p') + 'Identificação</div><div class="pt-dados">' +
        campo('Nº de patrimônio', '<span class="mono">' + esc(b.numero) + '</span>') + campo('Categoria', esc(b.categoria_nome)) +
        campo('Marca', esc(b.marca)) + campo('Modelo', esc(b.modelo)) +
        campo(b.controle === 'lote' ? 'Série/lote' : 'Nº de série', esc(b.numero_serie)) + campo('Quantidade', esc(b.quantidade + ' ' + b.unidade)) +
        campo('Placa UNESCO', esc(b.numero_unesco)) + campo('Placa SEMA', esc(b.numero_sema)) +
      '</div>' +
      (b.especificacao ? '<div class="pt-sec">Especificação</div><div class="pt-obs">' + esc(b.especificacao) + '</div>' : '') +
      '<div class="pt-sec">' + ptIc('local', 'p') + 'Onde está</div><div class="pt-dados">' +
        campo('Local', esc(b.local_nome)) + campo('Responsável pela guarda', b.responsavel_nome ? esc(b.responsavel_nome) : '<span class="pt-nada">termo de responsabilidade chega na próxima fase</span>') +
        campo('Situação', esc(SIT[b.situacao])) + campo('Condição', esc(COND[b.condicao])) +
        campo('Último inventário', b.ultimo_inventario_em ? dt(b.ultimo_inventario_em) : '') + campo('Titularidade', esc(TIT[b.titularidade] || b.titularidade)) +
      '</div>' +
      '<div class="pt-sec">' + ptIc('contrato', 'p') + 'Origem</div><div class="pt-dados">' +
        campo('Origem', esc(ORIGEM[b.origem] || b.origem)) + campo('Contrato', esc(b.contrato_numero)) +
        campo('Atividade', esc(b.atividade_codigo)) + campo('TDR', esc(b.tdr_numero)) +
        campo('Fornecedor', esc(b.fornecedor_nome)) + campo('Nota fiscal', S.pode.valor ? nf + (G && b.nf_url && S.pode.coord ? ' <button type="button" class="pt-link" data-acao="nf">trocar</button>' : '') : '<span class="pt-nada">restrita</span>') +
        campo('Aquisição', dt(b.dt_aquisicao)) + campo('Início de uso', b.dt_inicio_uso ? dt(b.dt_inicio_uso) : '') +
        campo('Garantia até', b.garantia_ate ? dt(b.garantia_ate) + (b.garantia_obs ? ' · ' + esc(b.garantia_obs) : '') : '') + campo('Cadastrado em', dtHora(b.criado_em)) +
      '</div>' +
      (b.observacoes ? '<div class="pt-sec">Observações</div><div class="pt-obs">' + esc(b.observacoes) + '</div>' : '')
  }

  function fichaValor(b) {
    const resumo = '<div class="pt-resumo">' +
      '<div><span>Valor de aquisição</span><b>' + brl(b.valor_aquisicao_brl) + '</b><small>' + usd(b.valor_aquisicao_usd) +
        (b.cotacao ? ' · câmbio ' + Number(b.cotacao).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + (b.cotacao_origem === 'unesco_pagamento' ? ' (UNESCO, no pagamento)' : ' (PTAX da aquisição)') : '') + '</small></div>' +
      '<div><span>Depreciação acumulada</span><b>' + brl(b.depreciacao_acumulada_brl) + '</b><small>' + (b.meses_depreciados || 0) + ' de ' + b.vida_util_meses + ' meses · cota ' + brl(b.cota_mensal_brl) + '/mês</small></div>' +
      '<div><span>Valor contábil hoje</span><b class="ok">' + brl(b.valor_contabil_brl) + '</b><small>' + usd(b.valor_contabil_usd) + ' · residual ' + brl(b.valor_residual_brl) + '</small></div></div>'
    const regra = '<div class="pt-aviso-f in">' + ptIc('info', 'p') + '<span>Depreciação linear: (valor − ' + fmtNum(b.residual_pct).replace(',00', '') + '% de residual) ÷ ' + esc(meses(b.vida_util_meses)) +
      '. Começa no mês seguinte ao início de uso e só conta mês completo. O cálculo é do banco; patrimônio não mexe no saldo das atividades.</span></div>'
    if (!b.dt_inicio_uso) return resumo + '<div class="pt-aviso-f al">' + ptIc('relogio', 'p') + '<span>O bem ainda não deprecia: falta informar o <b>início de uso</b>.</span></div>' + regra
    // curva: linha reta do valor de aquisição ao residual ao longo da vida útil; ponto = hoje (valores da view)
    const W = 600, H = 190, pl = 70, pr = 16, pt = 14, pb = 30, vida = Number(b.vida_util_meses), V = Number(b.valor_aquisicao_brl) || 1
    const x = m => pl + (W - pl - pr) * m / vida, y = v => pt + (H - pt - pb) * (1 - v / V)
    const ini = new Date(b.dt_inicio_uso + 'T12:00:00'); ini.setDate(1); ini.setMonth(ini.getMonth() + 1)
    const fim = new Date(ini); fim.setMonth(fim.getMonth() + vida)
    const mm = d => String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear()
    const m = Math.min(vida, Number(b.meses_depreciados || 0)), R = Number(b.valor_residual_brl || 0), C = Number(b.valor_contabil_brl || 0)
    const svg = '<svg class="pt-curva" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Valor contábil de ' + brl(V) + ' até ' + brl(R) + ' em ' + esc(meses(vida)) + '; hoje ' + brl(C) + '">' +
      '<line class="eixo" x1="' + pl + '" y1="' + y(0) + '" x2="' + (W - pr) + '" y2="' + y(0) + '"/>' +
      '<line class="eixo" x1="' + pl + '" y1="' + pt + '" x2="' + pl + '" y2="' + y(0) + '"/>' +
      '<polygon class="area" points="' + x(0) + ',' + y(0) + ' ' + x(0) + ',' + y(V) + ' ' + x(vida) + ',' + y(R) + ' ' + x(vida) + ',' + y(0) + '"/>' +
      '<polyline class="linha" points="' + x(0) + ',' + y(V) + ' ' + x(vida) + ',' + y(R) + '"/>' +
      '<line class="hoje" x1="' + x(m) + '" y1="' + pt + '" x2="' + x(m) + '" y2="' + y(0) + '"/>' +
      '<circle class="ponto" cx="' + x(m) + '" cy="' + y(C) + '" r="5"/>' +
      '<text x="' + (pl - 6) + '" y="' + (y(V) + 4) + '" text-anchor="end">' + esc(fmtNum(V)) + '</text>' +
      '<text x="' + (pl - 6) + '" y="' + (y(R) + 4) + '" text-anchor="end">' + esc(fmtNum(R)) + '</text>' +
      '<text x="' + x(0) + '" y="' + (H - 10) + '">' + mm(ini) + '</text>' +
      '<text x="' + x(vida) + '" y="' + (H - 10) + '" text-anchor="end">' + mm(fim) + '</text>' +
      '<text class="forte" x="' + Math.min(x(m) + 10, W - pr - 110) + '" y="' + (y(C) - 10 < pt + 14 ? y(C) + 44 : y(C) - 10) + '">hoje ' + esc(fmtNum(C)) + '</text></svg>'
    return resumo + '<div class="pt-sec">' + ptIc('graf', 'p') + 'Valor contábil ao longo da vida útil</div>' + svg + regra
  }

  function fichaArquivos(b, G) {
    const fotos = S.docs.filter(d => d.tipo === 'foto'), outros = S.docs.filter(d => d.tipo !== 'foto')
    return '<div class="pt-sec">' + ptIc('camera', 'p') + 'Fotos</div>' +
      (fotos.length ? '<div class="pt-fotos">' + fotos.map(f => '<div class="pt-foto"><img alt="Foto do bem ' + esc(b.numero) + '" data-arquivo-src="' + esc(f.url) + '" data-acao="foto" data-url="' + esc(f.url) + '">' +
        (G ? '<button type="button" class="rm" data-acao="rm-doc" data-id="' + esc(f.id) + '" aria-label="Tirar foto">' + ptIc('x', 'p') + '</button>' : '') + '</div>').join('') + '</div>'
        : '<p class="pt-sub">Nenhuma foto.</p>') +
      '<div class="pt-sec">' + ptIc('doc', 'p') + 'Documentos</div>' +
      (outros.length ? outros.map(d => '<div class="pt-doc">' + ptIc('doc', 'p') + '<span class="t"><a href="#" data-arquivo="' + esc(d.url) + '">' + esc(d.nome) + '</a>' +
        '<div class="pt-sub">' + esc(DOC_TIPO[d.tipo] || d.tipo) + ' · ' + dtHora(d.enviado_em) + '</div></span>' +
        (G ? '<button type="button" class="pt-btn peq" data-acao="rm-doc" data-id="' + esc(d.id) + '">Tirar</button>' : '') + '</div>').join('')
        : '<p class="pt-sub">Nenhum documento além da nota fiscal (que fica na aba Dados).</p>') +
      (G ? '<div class="pt-envio"><select class="form-control" id="pt-doc-tipo" aria-label="Tipo do arquivo">' +
        Object.keys(DOC_TIPO).map(k => '<option value="' + k + '">' + DOC_TIPO[k] + '</option>').join('') + '</select>' +
        '<button type="button" class="pt-btn pri" data-acao="enviar-doc">' + ptIc('upload', 'p') + 'Enviar arquivo</button>' +
        '<input type="file" id="pt-doc-arq" accept="image/*,application/pdf" multiple hidden>' +
        '<span class="pt-sub">Fotos (JPG, PNG) ou PDF, até 20 MB. Arquivo enviado não se apaga: “Tirar” só esconde e registra o motivo.</span></div>' : '')
  }

  function descrEvento(e) {
    const d = e.detalhes || {}, partes = []
    if (e.tipo === 'incorporacao') {
      if (d.contrato) partes.push('contrato ' + d.contrato)
      if (d.nf) partes.push('NF ' + d.nf)
      if (d.valor_brl != null) partes.push(brl(d.valor_brl))
      if (e.local_para_nome) partes.push('local: ' + e.local_para_nome)
    } else if (e.tipo === 'condicao') partes.push((COND[e.condicao_de] || e.condicao_de) + ' → ' + (COND[e.condicao_para] || e.condicao_para))
    else if (e.tipo === 'correcao' && d.depois) {
      Object.keys(d.depois).forEach(k => {
        const f = v => v == null ? '—' : /^dt_/.test(k) ? dt(v) : k === 'valor_aquisicao_brl' ? brl(v) : k === 'categoria_codigo' ? (catDe(v)?.nome || v) : String(v)
        partes.push((CAMPO[k] || k) + ': ' + f(d.antes?.[k]) + ' → ' + f(d.depois[k]))
      })
    } else if (e.tipo === 'estorno') partes.push('desfez: ' + (EVT[d.tipo_estornado] || d.tipo_estornado))
    return partes.join(' · ')
  }

  function fichaHistorico(b, C) {
    if (!S.eventos.length) return '<p class="pt-sub">Sem eventos.</p>'
    const ult = ultimoVivo()
    return '<ol class="pt-tempo">' + S.eventos.slice().reverse().map(e => {
      const d = descrEvento(e)
      return '<li class="' + (e.estornado ? 'estornado' : '') + (e.tipo === 'estorno' ? ' estorno' : '') + '"><b>' + esc(EVT[e.tipo] || e.tipo) + '</b>' +
        (e.estornado ? ' <span class="pt-pill ne">estornado</span>' : '') +
        '<div class="q">' + dt(e.dt_evento) + ' · registrado por ' + esc(e.registrado_por_nome || '—') + ' em ' + dtHora(e.registrado_em) + '</div>' +
        (d ? '<div class="d">' + esc(d) + '</div>' : '') + (e.observacao ? '<div>' + esc(e.observacao) + '</div>' : '') +
        (C && ult && ult.id === e.id && e.tipo !== 'incorporacao' && ['condicao', 'correcao'].includes(e.tipo)
          ? '<div style="margin-top:6px"><button type="button" class="pt-btn peq" data-acao="estornar" data-ev="' + esc(e.id) + '">' + ptIc('desfazer', 'p') + 'Estornar</button></div>' : '') +
        '</li>'
    }).join('') + '</ol>' +
    '<p class="pt-sub" style="margin-top:14px">O histórico não se apaga. Um erro é corrigido com um estorno (sempre do evento mais recente), que fica registrado.</p>'
  }

  async function recarregarFicha() {
    const id = S.ficha?.id, aba = S.fichaAba
    await carregar()
    if (id && $('pt-ficha').classList.contains('aberto')) abrirFicha(id, aba)
  }

  // ── Ações da ficha ────────────────────────────────────────────────────────
  function formEditar() {
    const b = S.ficha, lote = b.controle === 'lote', exige = catDe(b.categoria_codigo)?.exige_serie
    const inp = (id, r, v, extra) => '<div class="form-group"><label class="form-label" for="' + id + '">' + r + '</label><input class="form-control" id="' + id + '" value="' + esc(v || '') + '"' + (extra || '') + '></div>'
    abrirForm({
      titulo: 'Editar ficha', sub: b.numero + ' · valores, datas e categoria ficam em "Corrigir valores"',
      corpo: inp('fe-desc', 'Descrição', b.descricao) +
        '<div class="pt-g2">' + inp('fe-marca', 'Marca', b.marca) + inp('fe-modelo', 'Modelo', b.modelo) +
        inp('fe-serie', (lote ? 'Série/lote' : 'Nº de série') + (exige ? ' (obrigatório)' : ''), b.numero_serie) + (lote ? inp('fe-un', 'Unidade', b.unidade) : '<div></div>') +
        inp('fe-unesco', 'Placa UNESCO', b.numero_unesco) + inp('fe-sema', 'Placa SEMA', b.numero_sema) +
        inp('fe-gar', 'Garantia até', b.garantia_ate, ' type="date"') + inp('fe-gobs', 'Garantia (observação)', b.garantia_obs) + '</div>' +
        '<div class="form-group"><label class="form-label" for="fe-esp">Especificação</label><textarea class="form-control" id="fe-esp">' + esc(b.especificacao || '') + '</textarea></div>' +
        '<div class="form-group"><label class="form-label" for="fe-obs">Observações</label><textarea class="form-control" id="fe-obs">' + esc(b.observacoes || '') + '</textarea></div>',
      aoSalvar: async r => {
        const p = { descricao: val(r, '#fe-desc'), marca: val(r, '#fe-marca'), modelo: val(r, '#fe-modelo'), numero_serie: val(r, '#fe-serie'),
          numero_unesco: val(r, '#fe-unesco'), numero_sema: val(r, '#fe-sema'), garantia_ate: val(r, '#fe-gar'), garantia_obs: val(r, '#fe-gobs'),
          especificacao: val(r, '#fe-esp'), observacoes: val(r, '#fe-obs') }
        if (lote) p.unidade = val(r, '#fe-un')
        await rpc('fn_pat_editar_ficha', { p_bem: b.id, p })
        toast('Ficha atualizada.', 'success'); await recarregarFicha()
      },
    })
  }

  function formCondicao() {
    const b = S.ficha
    const opcoes = Object.keys(COND).filter(k => k !== b.condicao && k !== 'novo')
    abrirForm({
      titulo: 'Registrar condição', sub: b.numero + ' · hoje: ' + COND[b.condicao],
      corpo: '<div class="pt-g2"><div class="form-group"><label class="form-label" for="fk-c">Nova condição</label><select class="form-control" id="fk-c">' +
          opcoes.map(k => '<option value="' + k + '">' + COND[k] + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><label class="form-label" for="fk-d">Data</label><input class="form-control" type="date" id="fk-d" value="' + hoje() + '" max="' + hoje() + '"></div></div>' +
        '<div class="form-group"><label class="form-label" for="fk-m">O que foi observado</label><textarea class="form-control" id="fk-m" placeholder="ex.: carcaça trincada após transporte; liga normalmente"></textarea><div class="pt-dica">Ao menos 10 caracteres. Avaria grave, furto ou extravio terão registro próprio (ocorrências) na fase 3.</div></div>',
      aoSalvar: async r => {
        await rpc('fn_pat_registrar_condicao', { p_bem: b.id, p_condicao: val(r, '#fk-c'), p_motivo: val(r, '#fk-m'), p_data: val(r, '#fk-d') })
        toast('Condição registrada.', 'success'); await recarregarFicha()
      },
    })
  }

  function formInicioUso() {
    const b = S.ficha
    abrirForm({
      titulo: 'Informar início de uso', sub: b.numero + ' · a depreciação começa no mês seguinte',
      corpo: '<div class="form-group"><label class="form-label" for="fu-d">Começou a ser usado em</label><input class="form-control" type="date" id="fu-d" min="' + esc(b.dt_aquisicao) + '" max="' + hoje() + '" value="' + hoje() + '"></div>' +
        '<div class="pt-dica">' + ptIc('info', 'p') + 'Depois de informado, só a coordenação corrige esta data.</div>',
      aoSalvar: async r => {
        await rpc('fn_pat_corrigir', { p_bem: b.id, p: { dt_inicio_uso: val(r, '#fu-d') }, p_motivo: null })
        toast('Início de uso registrado. O bem passa a "Em uso".', 'success'); await recarregarFicha()
      },
    })
  }

  function formCorrigir() {
    const b = S.ficha, lote = b.controle === 'lote'
    const cats = S.cats.filter(c => c.ativo && c.controle === b.controle)
    abrirForm({
      titulo: 'Corrigir valores', sub: b.numero + ' · fica registrado no histórico com o antes e o depois',
      corpo: '<div class="pt-aviso-f in">' + ptIc('info', 'p') + '<span>Use para erro de digitação ou ajuste comprovado (ex.: NF com valor por item diferente). Para bem de contrato, a soma dos bens não pode passar o valor do produto.</span></div>' +
        '<div class="pt-g2">' +
        '<div class="form-group"><label class="form-label" for="fx-v">Valor de aquisição (R$)</label><input class="form-control mono" id="fx-v" inputmode="decimal" value="' + esc(fmtNum(b.valor_aquisicao_brl)) + '"></div>' +
        (lote ? '<div class="form-group"><label class="form-label" for="fx-q">Quantidade</label><input class="form-control mono" type="number" min="1" id="fx-q" value="' + esc(b.quantidade) + '"></div>' : '<div></div>') +
        '<div class="form-group"><label class="form-label" for="fx-aq">Data de aquisição</label><input class="form-control" type="date" id="fx-aq" max="' + hoje() + '" value="' + esc(b.dt_aquisicao) + '"></div>' +
        '<div class="form-group"><label class="form-label" for="fx-uso">Início de uso</label><input class="form-control" type="date" id="fx-uso" max="' + hoje() + '" value="' + esc(b.dt_inicio_uso || '') + '"></div>' +
        '<div class="form-group"><label class="form-label" for="fx-cat">Categoria</label><select class="form-control" id="fx-cat">' + cats.map(c => '<option value="' + esc(c.codigo) + '"' + (c.codigo === b.categoria_codigo ? ' selected' : '') + '>' + esc(c.nome) + '</option>').join('') + '</select></div>' +
        '<div></div>' +
        '<div class="form-group"><label class="form-label" for="fx-vida">Vida útil (meses)</label><input class="form-control mono" type="number" min="1" max="1200" id="fx-vida" value="' + esc(b.vida_util_meses) + '"></div>' +
        '<div class="form-group"><label class="form-label" for="fx-res">Valor residual (%)</label><input class="form-control mono" type="number" min="0" max="99" step="0.5" id="fx-res" value="' + esc(b.residual_pct) + '"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label" for="fx-m">Motivo da correção</label><textarea class="form-control" id="fx-m"></textarea><div class="pt-dica">Ao menos 10 caracteres.</div></div>',
      aoSalvar: async r => {
        const p = {}, v = parseValor(val(r, '#fx-v'))
        if (!(v >= 0)) throw new Error('PAT_DADOS: valor inválido')
        if (Math.abs(v - Number(b.valor_aquisicao_brl)) > 0.004) p.valor_aquisicao_brl = v
        if (lote && Number(val(r, '#fx-q')) !== Number(b.quantidade)) p.quantidade = Number(val(r, '#fx-q'))
        if (val(r, '#fx-aq') !== b.dt_aquisicao) p.dt_aquisicao = val(r, '#fx-aq')
        if (val(r, '#fx-uso') !== (b.dt_inicio_uso || '')) p.dt_inicio_uso = val(r, '#fx-uso')
        if (val(r, '#fx-cat') !== b.categoria_codigo) p.categoria_codigo = val(r, '#fx-cat')
        if (Number(val(r, '#fx-vida')) !== Number(b.vida_util_meses)) p.vida_util_meses = Number(val(r, '#fx-vida'))
        if (Number(val(r, '#fx-res')) !== Number(b.residual_pct)) p.residual_pct = Number(val(r, '#fx-res'))
        if (!Object.keys(p).length) throw new Error('PAT_DADOS: nada mudou')
        await rpc('fn_pat_corrigir', { p_bem: b.id, p, p_motivo: val(r, '#fx-m') })
        toast('Correção registrada.', 'success'); await recarregarFicha()
      },
    })
  }

  function formEstornar(evId) {
    const e = S.eventos.find(x => x.id === evId); if (!e) return
    const anular = e.tipo === 'incorporacao'
    abrirForm({
      titulo: anular ? 'Anular cadastro' : 'Estornar evento', perigo: true, botao: anular ? 'Anular cadastro' : 'Estornar',
      sub: S.ficha.numero + ' · ' + (EVT[e.tipo] || e.tipo) + ' de ' + dt(e.dt_evento),
      corpo: '<div class="pt-aviso-f ' + (anular ? 'er' : 'al') + '">' + ptIc('alerta', 'p') + '<span>' + (anular
          ? 'O cadastro fica anulado (o número ' + esc(S.ficha.numero) + ' não volta a ser usado) e o bem sai das listas. Se veio de contrato, o valor volta para "A incorporar". Use só para cadastro feito por engano ou em dobro.'
          : 'O evento continua no histórico, marcado como estornado, e a ficha volta ao que era antes dele.') + '</span></div>' +
        '<div class="form-group"><label class="form-label" for="fs-m">Motivo</label><textarea class="form-control" id="fs-m"></textarea><div class="pt-dica">Ao menos 10 caracteres.</div></div>',
      aoSalvar: async r => {
        await rpc('fn_pat_estornar', { p_evento: e.id, p_motivo: val(r, '#fs-m') })
        toast(anular ? 'Cadastro anulado.' : 'Evento estornado.', 'success')
        if (anular) { ptFechar('pt-ficha'); await carregar() } else await recarregarFicha()
      },
    })
  }

  function formNf() {
    const b = S.ficha
    abrirForm({
      titulo: 'Anexar nota fiscal', sub: 'Vale para todos os bens que entraram juntos com ' + b.numero,
      corpo: '<div class="pt-g2"><div class="form-group"><label class="form-label" for="fn-n">Número da NF</label><input class="form-control mono" id="fn-n" value="' + esc(b.nf_numero || '') + '"></div>' +
        '<div class="form-group"><label class="form-label" for="fn-d">Data de emissão</label><input class="form-control" type="date" id="fn-d" max="' + hoje() + '" value="' + esc(b.nf_data || '') + '"></div></div>' +
        '<button type="button" class="upload-zone" id="fn-zona">' + ptIc('upload') + '<b>Escolher o PDF da nota fiscal</b><span class="pt-sub">até 20 MB</span></button>' +
        '<input type="file" id="fn-arq" accept="application/pdf" hidden>',
      aoSalvar: async r => {
        const f = r.querySelector('#fn-arq').files[0]
        if (!f) throw new Error('PAT_DADOS: escolha o PDF da nota fiscal')
        const url = await enviarArquivo('incorporacoes/' + b.incorporacao_id + '/nf-' + Date.now() + '.pdf', f)
        await rpc('fn_pat_anexar_nf', { p_incorporacao: b.incorporacao_id, p_numero: val(r, '#fn-n'), p_data: val(r, '#fn-d') || null, p_url: url, p_nome: f.name })
        toast('Nota fiscal anexada.', 'success'); await recarregarFicha()
      },
    })
    const z = $('fn-zona'), a = $('fn-arq')
    z.onclick = () => a.click()
    a.onchange = () => { const f = a.files[0]; if (f) { z.classList.add('tem-arquivo'); z.innerHTML = ptIc('check') + '<b>' + esc(f.name) + '</b><span class="pt-sub">' + (f.size / 1048576).toFixed(1) + ' MB · clique para trocar</span>' } }
  }

  // ── Arquivos (bucket privado patrimonio-docs) ─────────────────────────────
  const LIMITE = 20 * 1024 * 1024
  async function reduzirImagem(f) {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 900 * 1024) return f
    try {
      const bmp = await createImageBitmap(f)
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85))
      return blob && blob.size < f.size ? new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f
    } catch (e) { return f }
  }
  async function enviarArquivo(caminho, f) {
    if (f.size > LIMITE) throw new Error('PAT_ARQUIVO: arquivo maior que 20 MB')
    const { error } = await db.storage.from('patrimonio-docs').upload(caminho, f, { upsert: false, contentType: f.type || 'application/octet-stream' })
    if (error) throw new Error('PAT_ARQUIVO: não foi possível enviar o arquivo (' + error.message + ')')
    return db.storage.from('patrimonio-docs').getPublicUrl(caminho).data.publicUrl // portadora do caminho; leitura é assinada
  }
  const nomeSeguro = n => semAcento(n).replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-80) || 'arquivo'
  async function enviarDocs(files) {
    const b = S.ficha, tipo = $('pt-doc-tipo').value
    let ok = 0
    for (const f0 of files) {
      try {
        const f = tipo === 'foto' ? await reduzirImagem(f0) : f0
        const url = await enviarArquivo('bens/' + b.id + '/' + Date.now() + '-' + nomeSeguro(f.name), f)
        await rpc('fn_pat_anexar', { p_bem: b.id, p_tipo: tipo, p_url: url, p_nome: f0.name, p_tamanho: f.size })
        ok++
      } catch (e) { toast(f0.name + ': ' + erroMsg(e), 'error') }
    }
    if (ok) { toast(ok + ' arquivo(s) enviado(s).', 'success'); S.fichaAba = 'arquivos'; await recarregarFicha() }
  }
  function formRemoverDoc(id) {
    const d = S.docs.find(x => x.id === id); if (!d) return
    abrirForm({
      titulo: 'Tirar arquivo', sub: d.nome, botao: 'Tirar', perigo: true,
      corpo: '<p class="pt-sub" style="font-size:13px">O arquivo deixa de aparecer na ficha, mas continua guardado e o motivo fica registrado.</p>' +
        '<div class="form-group"><label class="form-label" for="fr-m">Motivo</label><input class="form-control" id="fr-m" placeholder="ex.: foto desfocada"></div>',
      aoSalvar: async r => { await rpc('fn_pat_remover_anexo', { p_doc: id, p_motivo: val(r, '#fr-m') }); toast('Arquivo retirado da ficha.', 'success'); await recarregarFicha() },
    })
  }

  // ── Incorporação ──────────────────────────────────────────────────────────
  let INC = null
  const novoItem = () => ({ categoria: '', descricao: '', marca: '', modelo: '', quantidade: '1', valor: '', series: '', garantia: '', especificacao: '' })
  function abrirIncorporar(produtoId) {
    if (!S.pode.gerir) return
    INC = { id: crypto.randomUUID(), origem: 'compra_projeto', produto: produtoId || (S.fila.length === 1 ? S.fila[0].contrato_produto_id : ''),
      nf: { numero: '', data: '', arquivo: null, url: '' }, dt_aquisicao: '', dt_inicio_uso: '', local: (S.locais.find(l => l.tipo === 'sede' && l.ativo) || {}).id || '',
      origem_detalhe: '', titularidade: '', justificar: false, justificativa: '', itens: [novoItem()], sujo: false, enviando: false }
    if (!S.fila.length && S.pode.coord) INC.origem = 'cessao'
    renderIncorporar()
    ptAbrir('pt-inc')
  }
  FECHAR['pt-inc'] = async () => {
    if (INC && INC.enviando) return
    if (INC && INC.sujo && !(await ptConfirmar({ titulo: 'Descartar o que foi preenchido?', texto: 'Nada foi gravado. Ao fechar, o preenchimento desta incorporação se perde.', ok: 'Descartar', perigo: true }))) return
    INC = null; ptFechar('pt-inc')
  }
  const prodSel = () => S.fila.find(f => f.contrato_produto_id === INC.produto)
  function somaItens() { return INC.itens.reduce((s, i) => { const v = parseValor(i.valor); return s + (v >= 0 ? v : 0) }, 0) }

  function renderIncorporar() {
    const I = INC, compra = I.origem === 'compra_projeto', p = compra ? prodSel() : null
    const radio = (v, t, dis) => '<label><input type="radio" name="inc-origem" value="' + v + '"' + (I.origem === v ? ' checked' : '') + (dis ? ' disabled' : '') + '> ' + t + '</label>'
    const opt = (v, t, s) => '<option value="' + esc(v) + '"' + (s === v ? ' selected' : '') + '>' + esc(t) + '</option>'
    const cats = S.cats.filter(c => c.ativo)
    $('pt-inc-corpo').innerHTML = '<div id="inc-erro"></div>' +
      '<div class="pt-sec" style="margin-top:0">1. De onde vem o bem</div>' +
      '<div class="pt-radio" role="radiogroup" aria-label="Origem">' + radio('compra_projeto', 'Compra do projeto (contrato)', !S.fila.length) +
        radio('cessao', 'Cessão de outro órgão', !S.pode.coord) + radio('doacao_recebida', 'Doação recebida', !S.pode.coord) + radio('outra', 'Outra', !S.pode.coord) + '</div>' +
      (!S.pode.coord ? '<div class="pt-dica">' + ptIc('info', 'p') + 'Bem fora de contrato (cessão, doação) só a coordenação incorpora.</div>' : '') +
      (compra ? (S.fila.length
        ? '<div class="form-group" style="margin-top:12px"><label class="form-label" for="inc-prod">Produto do contrato</label><select class="form-control" id="inc-prod">' +
            opt('', 'Escolha o produto…', I.produto) + S.fila.map(f => opt(f.contrato_produto_id, 'Contrato ' + f.contrato_numero + ' · Produto ' + (f.numero_produto ?? '—') + ' · falta ' + fmtBRL(f.restante), I.produto)).join('') + '</select>' +
            (p ? '<div class="pt-dica">' + ptIc('contrato', 'p') + esc((p.fornecedor_nome || '') + (p.atividade_codigo ? ' · Atividade ' + p.atividade_codigo : '') + (p.tdr_numero ? ' · TDR ' + p.tdr_numero : '') + ' · ' + (p.produto_descricao || '')) + '</div>' : '') + '</div>'
        : '<div class="pt-aviso-f in" style="margin-top:12px">' + ptIc('info', 'p') + '<span>Nenhum produto de contrato de equipamentos aguardando incorporação.</span></div>')
        : '<div class="form-group" style="margin-top:12px"><label class="form-label" for="inc-odet">Descreva a origem</label><input class="form-control" id="inc-odet" value="' + esc(I.origem_detalhe) + '" placeholder="órgão que cedeu/doou e documento (ex.: Termo de cessão nº 12/2026 da SEMA)"></div>') +

      '<div class="pt-sec">2. Nota fiscal e datas</div>' +
      '<div class="pt-g3"><div class="form-group"><label class="form-label" for="inc-nfn">Nº da NF</label><input class="form-control mono" id="inc-nfn" value="' + esc(I.nf.numero) + '"></div>' +
        '<div class="form-group"><label class="form-label" for="inc-nfd">Emissão da NF</label><input class="form-control" type="date" id="inc-nfd" max="' + hoje() + '" value="' + esc(I.nf.data) + '"></div>' +
        '<div class="form-group"><label class="form-label" for="inc-aq">Data de aquisição *</label><input class="form-control" type="date" id="inc-aq" max="' + hoje() + '" value="' + esc(I.dt_aquisicao) + '"><div class="pt-dica">Recebimento ou data da NF.</div></div></div>' +
      '<button type="button" class="upload-zone' + (I.nf.arquivo ? ' tem-arquivo' : '') + '" id="inc-nfz">' + (I.nf.arquivo
        ? ptIc('check') + '<b>' + esc(I.nf.arquivo.name) + '</b><span class="pt-sub">clique para trocar</span>'
        : ptIc('upload') + '<b>Anexar o PDF da nota fiscal</b><span class="pt-sub">' + (compra ? 'pode ficar para depois: o bem aparece como "sem NF"' : 'ou o termo de cessão/doação') + '</span>') + '</button>' +
      '<input type="file" id="inc-nfa" accept="application/pdf" hidden>' +

      '<div class="pt-sec">3. Onde fica e desde quando é usado</div>' +
      '<div class="pt-g3"><div class="form-group"><label class="form-label" for="inc-local">Local *</label><select class="form-control" id="inc-local">' + opt('', 'Escolha…', I.local) +
          S.locais.filter(l => l.ativo).map(l => opt(l.id, l.nome, I.local)).join('') + '</select></div>' +
        '<div class="form-group"><label class="form-label" for="inc-uso">Início de uso</label><input class="form-control" type="date" id="inc-uso" max="' + hoje() + '" value="' + esc(I.dt_inicio_uso) + '"><div class="pt-dica">Vazio = em estoque (ainda não deprecia).</div></div>' +
        '<div class="form-group"><label class="form-label" for="inc-tit">Titularidade</label><select class="form-control" id="inc-tit">' +
          opt('', compra ? 'UNESCO (projeto) — padrão' : 'SEMA/AC — padrão', I.titularidade) + Object.keys(TIT).map(k => opt(k, TIT[k], I.titularidade)).join('') + '</select></div></div>' +

      '<div class="pt-sec">4. Bens recebidos</div>' +
      I.itens.map((it, i) => {
        const c = catDe(it.categoria), lote = c?.controle === 'lote'
        return '<div class="pt-item" data-i="' + i + '"><div class="pt-item-h">Item ' + (i + 1) + (c ? ' · ' + esc(lote ? 'lote: uma ficha com a quantidade' : 'uma ficha por unidade') : '') +
          (I.itens.length > 1 ? '<span class="dir"><button type="button" class="pt-btn peq" data-acao="inc-rm" data-i="' + i + '">' + ptIc('x', 'p') + 'Tirar</button></span>' : '') + '</div>' +
          '<div class="pt-item-l">' +
            '<div><label class="form-label" for="it-cat-' + i + '">Categoria *</label><select class="form-control" id="it-cat-' + i + '" data-k="categoria">' + opt('', 'Escolha…', it.categoria) + cats.map(x => opt(x.codigo, x.nome, it.categoria)).join('') + '</select></div>' +
            '<div><label class="form-label" for="it-desc-' + i + '">Descrição *</label><input class="form-control" id="it-desc-' + i + '" data-k="descricao" value="' + esc(it.descricao) + '" placeholder="ex.: Caixa acústica amplificada 15&quot;"></div>' +
            '<div><label class="form-label" for="it-qtd-' + i + '">Qtd. *</label><input class="form-control mono" type="number" min="1" max="500" id="it-qtd-' + i + '" data-k="quantidade" value="' + esc(it.quantidade) + '"></div>' +
            '<div><label class="form-label" for="it-val-' + i + '">Valor total do item (R$) *</label><input class="form-control mono" inputmode="decimal" id="it-val-' + i + '" data-k="valor" value="' + esc(it.valor) + '" placeholder="0,00"></div>' +
          '</div><div class="pt-item-l2">' +
            '<div><label class="form-label" for="it-marca-' + i + '">Marca</label><input class="form-control" id="it-marca-' + i + '" data-k="marca" value="' + esc(it.marca) + '"></div>' +
            '<div><label class="form-label" for="it-mod-' + i + '">Modelo</label><input class="form-control" id="it-mod-' + i + '" data-k="modelo" value="' + esc(it.modelo) + '"></div>' +
            '<div><label class="form-label" for="it-gar-' + i + '">Garantia até</label><input class="form-control" type="date" id="it-gar-' + i + '" data-k="garantia" value="' + esc(it.garantia) + '"></div>' +
          '</div>' +
          '<div><label class="form-label" for="it-ser-' + i + '">' + (lote ? 'Série ou lote (opcional)' : 'Números de série' + (c?.exige_serie ? ' * — um por linha, um para cada unidade' : ' (opcional) — um por linha')) + '</label>' +
            (lote ? '<input class="form-control mono" id="it-ser-' + i + '" data-k="series" value="' + esc(it.series) + '">'
              : '<textarea class="form-control mono" id="it-ser-' + i + '" data-k="series" rows="2">' + esc(it.series) + '</textarea>') +
            '<div class="pt-dica" data-serie-n="' + i + '"></div></div>' +
          '<div><label class="form-label" for="it-esp-' + i + '">Especificação (opcional)</label><input class="form-control" id="it-esp-' + i + '" data-k="especificacao" value="' + esc(it.especificacao) + '" placeholder="potência, capacidade, cor…"></div>' +
        '</div>'
      }).join('') +
      '<button type="button" class="pt-btn" data-acao="inc-add">' + ptIc('mais', 'p') + 'Adicionar item</button>' +
      '<div id="inc-soma" style="margin-top:14px"></div>'
    $('pt-inc-rodape').innerHTML = '<span class="esq pt-sub">Cada unidade vira uma ficha com número próprio (PAT-…), menos as categorias em lote.</span>' +
      '<button type="button" class="pt-btn" data-fechar="pt-inc">Cancelar</button>' +
      '<button type="button" class="pt-btn pri" id="inc-ok">' + ptIc('check', 'p') + 'Incorporar</button>'
    $('inc-ok').onclick = enviarIncorporacao
    const z = $('inc-nfz'), a = $('inc-nfa')
    z.onclick = () => a.click()
    a.onchange = () => { const f = a.files[0]; if (f) { I.nf.arquivo = f; I.nf.url = ''; I.sujo = true; renderIncorporar() } }
    atualizarSoma()
  }

  function atualizarSoma() {
    const I = INC; if (!I) return
    I.itens.forEach((it, i) => {
      const el = document.querySelector('[data-serie-n="' + i + '"]'); if (!el) return
      const c = catDe(it.categoria); if (!c || c.controle === 'lote') { el.textContent = ''; return }
      const n = it.series.split(/\n+/).map(s => s.trim()).filter(Boolean).length, q = Number(it.quantidade) || 0
      el.textContent = n + ' de ' + q + ' informado' + (n === 1 ? '' : 's') + (c.exige_serie && n !== q ? ' — falta' + (q - n > 1 ? 'm ' : ' ') + Math.max(q - n, 0) : '')
    })
    const s = somaItens(), compra = I.origem === 'compra_projeto', p = compra ? prodSel() : null
    let h = '<div class="pt-soma"><span>Soma dos itens <b>' + fmtBRL(s) + '</b></span>'
    if (p) {
      const resto = Math.round((Number(p.restante) - s) * 100) / 100
      h += '<span>Falta incorporar do produto <b>' + fmtBRL(p.restante) + '</b></span>' +
        (resto < -0.004 ? '<span class="er">' + ptIc('alerta', 'p') + ' passa o valor do produto em ' + fmtBRL(-resto) + '</span>'
          : resto > 0.004 ? '<span>Sobra <b>' + fmtBRL(resto) + '</b> para outra incorporação</span>' : '<span class="ok">' + ptIc('check', 'p') + ' fecha o valor do produto</span>')
      h += '</div>'
      if (resto > 0.004) h += '<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:10px"><input type="checkbox" id="inc-just-c"' + (I.justificar ? ' checked' : '') + '> A diferença não é bem (ex.: instalação, frete, serviço) — concluir a incorporação deste produto</label>' +
        (I.justificar ? '<textarea class="form-control" id="inc-just" style="margin-top:8px" placeholder="Explique a diferença (ao menos 10 caracteres)">' + esc(I.justificativa) + '</textarea>' : '')
    } else h += '</div>'
    $('inc-soma').innerHTML = h
    const jc = $('inc-just-c'); if (jc) jc.onchange = () => { I.justificar = jc.checked; I.sujo = true; atualizarSoma() }
    const jt = $('inc-just'); if (jt) jt.oninput = () => { I.justificativa = jt.value; I.sujo = true }
  }

  // campos da incorporação: guarda no estado sem redesenhar (só troca de categoria/origem redesenha)
  document.addEventListener('input', e => {
    if (!INC || !e.target.closest('#pt-inc')) return
    const t = e.target, item = t.closest('.pt-item')
    if (item && t.dataset.k) { INC.itens[Number(item.dataset.i)][t.dataset.k] = t.value; INC.sujo = true; atualizarSoma(); return }
    const mapa = { 'inc-nfn': v => INC.nf.numero = v, 'inc-nfd': v => INC.nf.data = v, 'inc-aq': v => INC.dt_aquisicao = v, 'inc-uso': v => INC.dt_inicio_uso = v, 'inc-odet': v => INC.origem_detalhe = v }
    if (mapa[t.id]) { mapa[t.id](t.value); INC.sujo = true }
  })
  document.addEventListener('change', e => {
    if (!INC || !e.target.closest('#pt-inc')) return
    const t = e.target, item = t.closest('.pt-item')
    if (t.name === 'inc-origem') { INC.origem = t.value; INC.sujo = true; renderIncorporar(); return }
    if (t.id === 'inc-prod') { INC.produto = t.value; renderIncorporar(); return }
    if (t.id === 'inc-local') { INC.local = t.value; return }
    if (t.id === 'inc-tit') { INC.titularidade = t.value; return }
    if (item && t.dataset.k === 'categoria') { INC.itens[Number(item.dataset.i)].categoria = t.value; INC.sujo = true; renderIncorporar() }
  })

  async function enviarIncorporacao() {
    const I = INC; if (!I || I.enviando) return
    const erro = m => { $('inc-erro').innerHTML = '<div class="pt-aviso-f er">' + ptIc('alerta', 'p') + '<span>' + esc(m) + '</span></div>'; $('pt-inc-corpo').scrollTop = 0 }
    $('inc-erro').innerHTML = ''
    const compra = I.origem === 'compra_projeto'
    if (compra && !I.produto) return erro('Escolha o produto do contrato.')
    if (!I.dt_aquisicao) return erro('Informe a data de aquisição.')
    if (!I.local) return erro('Escolha o local onde os bens estão.')
    const itens = []
    for (const [i, it] of I.itens.entries()) {
      const v = parseValor(it.valor), c = catDe(it.categoria)
      if (!c) return erro('Item ' + (i + 1) + ': escolha a categoria.')
      if (it.descricao.trim().length < 3) return erro('Item ' + (i + 1) + ': descreva o bem.')
      if (!(v >= 0)) return erro('Item ' + (i + 1) + ': informe o valor total do item.')
      const series = c.controle === 'lote' ? (it.series.trim() ? [it.series.trim()] : []) : it.series.split(/\n+/).map(s => s.trim()).filter(Boolean)
      itens.push({ categoria: c.codigo, descricao: it.descricao.trim(), marca: it.marca, modelo: it.modelo, quantidade: Number(it.quantidade) || 1,
        valor_total: v, numeros_serie: series, garantia_ate: it.garantia, especificacao: it.especificacao })
    }
    const btn = $('inc-ok'); I.enviando = true; btn.disabled = true; btn.textContent = 'Incorporando…'
    try {
      if (I.nf.arquivo && !I.nf.url) I.nf.url = await enviarArquivo('incorporacoes/' + I.id + '/nf-' + Date.now() + '.pdf', I.nf.arquivo)
      const r = await rpc('fn_pat_incorporar', { p: {
        id: I.id, origem: I.origem, contrato_produto_id: compra ? I.produto : null, origem_detalhe: compra ? null : I.origem_detalhe,
        nf_numero: I.nf.numero, nf_data: I.nf.data, nf_url: I.nf.url || null, nf_nome: I.nf.arquivo?.name || null,
        dt_aquisicao: I.dt_aquisicao, dt_inicio_uso: I.dt_inicio_uso, local_id: I.local, titularidade: I.titularidade,
        justificativa_diferenca: compra && I.justificar ? I.justificativa : null, itens } })
      const novos = (r.bens || []).map(x => x.id)
      INC = null; ptFechar('pt-inc')
      toast((r.bens || []).length + ' bem(ns) incorporado(s): ' + (r.bens || []).map(x => x.numero).join(', ') +
        (r.concluida ? '. A tarefa do contrato foi concluída.' : r.restante > 0 ? '. Ainda falta ' + fmtBRL(r.restante) + ' do produto.' : ''), 'success')
      await carregar()
      if (novos.length && await ptConfirmar({ titulo: 'Imprimir as etiquetas?', texto: 'Cada bem novo recebe uma etiqueta com o número e um QR que abre a ficha.', ok: 'Escolher folha' })) formEtiquetas(novos)
    } catch (e) {
      erro(erroMsg(e))
    } finally {
      if (INC) { INC.enviando = false; const b = $('inc-ok'); if (b) { b.disabled = false; b.innerHTML = ptIc('check', 'p') + 'Incorporar' } }
    }
  }

  // ── Etiquetas com QR (folha A4 de 3 × 7, 63,5 × 38,1 mm) ──────────────────
  // Exceção ao molde FolhaA4: folha adesiva não leva cabeçalho/rodapé (CLAUDE.md, Patrimônio).
  function formEtiquetas(ids) {
    const lista = ids.map(id => S.bens.find(b => b.id === id)).filter(Boolean)
    if (!lista.length) { toast('Marque os bens na lista (caixa à esquerda) para imprimir as etiquetas.', 'warning'); return }
    abrirForm({
      titulo: 'Etiquetas de patrimônio', sub: lista.length + ' etiqueta' + (lista.length > 1 ? 's' : '') + ' · folha A4 com 21 (3 × 7, 63,5 × 38,1 mm)', botao: 'Abrir para imprimir',
      corpo: '<div class="form-group"><label class="form-label" for="fq-ini">Começar na posição</label><input class="form-control mono" type="number" min="1" max="21" id="fq-ini" value="1"><div class="pt-dica">Para reaproveitar uma folha já usada: as posições contam da esquerda para a direita, de cima para baixo.</div></div>' +
        '<div class="pt-aviso-f in">' + ptIc('info', 'p') + '<span>O QR leva só ao endereço da ficha (com login). Não há valor nem nome de pessoa na etiqueta. Na impressão, escolha <b>tamanho real (100%)</b>, sem ajustar à página.</span></div>',
      aoSalvar: async r => { abrirEtiquetas(lista, Math.min(21, Math.max(1, Number(val(r, '#fq-ini')) || 1))) },
    })
  }
  function abrirEtiquetas(lista, inicio) {
    const w = window.open('', '_blank')
    if (!w) { toast('O navegador bloqueou a nova aba. Permita janelas deste site.', 'warning'); return }
    const base = new URL('patrimonio.html', location.href).href
    const cel = lista.map(b => {
      const q = qrcode(0, 'M'); q.addData(base + '?bem=' + encodeURIComponent(b.numero)); q.make()
      return '<div class="et"><img class="qr" alt="" src="' + q.createDataURL(4, 0) + '"><div class="tx"><div class="k">PATRIMÔNIO</div>' +
        '<div class="n">' + esc(b.numero) + '</div><div class="d">' + esc(b.descricao) + (b.quantidade > 1 ? ' (lote de ' + b.quantidade + ')' : '') + '</div>' +
        (b.numero_serie ? '<div class="s">S/N ' + esc(b.numero_serie) + '</div>' : '') +
        '<div class="p">SEMA/AC · Fundo Brasil-ONU</div></div></div>'
    })
    const todas = Array(inicio - 1).fill('<div class="et vazia"></div>').concat(cel)
    const folhas = []; for (let i = 0; i < todas.length; i += 21) folhas.push('<div class="folha">' + todas.slice(i, i + 21).join('') + '</div>')
    w.document.open()
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="author" content="Erisson Cameli Santiago"><title>Etiquetas de patrimônio</title><style>' +
      '@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#e9edea;font-family:"DM Sans",Arial,sans-serif;color:#111}' +
      '.barra{position:sticky;top:0;background:#1D5A3C;color:#fff;padding:10px 16px;display:flex;gap:12px;align-items:center;font-size:13px;flex-wrap:wrap}' +
      '.barra button{background:#fff;color:#1D5A3C;border:0;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer}' +
      '.folha{width:210mm;height:297mm;margin:12px auto;background:#fff;padding:15.15mm 7.25mm;display:grid;grid-template-columns:repeat(3,63.5mm);grid-auto-rows:38.1mm;column-gap:2.5mm;page-break-after:always;break-after:page}' +
      '.et{display:flex;gap:2.5mm;align-items:center;padding:2.5mm 3mm;overflow:hidden;outline:1px dashed #d0d5d2}.et.vazia{outline-color:#eee}' +
      '.qr{width:26mm;height:26mm;image-rendering:pixelated;flex-shrink:0}.tx{min-width:0;display:flex;flex-direction:column;gap:.6mm}' +
      '.k{font-size:6.5pt;letter-spacing:.12em;font-weight:700;color:#1D5A3C}.n{font-family:"DM Mono",monospace;font-size:12pt;font-weight:700;letter-spacing:-.02em}' +
      '.d{font-size:7pt;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.s{font-family:"DM Mono",monospace;font-size:6.5pt;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.p{font-size:6pt;color:#555}' +
      '@media print{body{background:#fff}.barra{display:none}.folha{margin:0}.et{outline:0}}' +
      '</style></head><body><div class="barra"><button type="button" onclick="print()">Imprimir</button><span>' + lista.length + ' etiqueta(s) · A4 3 × 7 (63,5 × 38,1 mm) · imprima em tamanho real (100%).</span></div>' +
      folhas.join('') + '</body></html>')
    w.document.close()
  }

  // ── Delegação de cliques ──────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-acao]'); if (!el) return
    const a = el.dataset.acao
    if (a === 'sel' || a === 'sel-todos') {
      e.stopPropagation()
      if (a === 'sel') { el.checked ? S.sel.add(el.dataset.id) : S.sel.delete(el.dataset.id) }
      else filtrados().forEach(b => el.checked ? S.sel.add(b.id) : S.sel.delete(b.id))
      renderLista(); return
    }
    switch (a) {
      case 'aba': S.aba = el.dataset.aba; render(); break
      case 'ver-aviso': S.filtro = { q: '', cat: '', local: '', sit: 'ativos', cond: '', aviso: el.dataset.aviso }; S.aba = 'bens'; render(); break
      case 'limpar-aviso': S.filtro.aviso = ''; renderBens(); break
      case 'ficha': abrirFicha(el.dataset.id); break
      case 'ficha-aba': S.fichaAba = el.dataset.aba; renderFicha(); break
      case 'incorporar': abrirIncorporar(el.dataset.produto); break
      case 'inc-add': INC.itens.push(novoItem()); INC.sujo = true; renderIncorporar(); break
      case 'inc-rm': INC.itens.splice(Number(el.dataset.i), 1); INC.sujo = true; renderIncorporar(); break
      case 'categoria': formCategoria(el.dataset.cod); break
      case 'local': formLocal(el.dataset.id); break
      case 'editar': formEditar(); break
      case 'condicao': formCondicao(); break
      case 'inicio-uso': formInicioUso(); break
      case 'corrigir': formCorrigir(); break
      case 'estornar': formEstornar(el.dataset.ev); break
      case 'nf': formNf(); break
      case 'enviar-doc': { const inp = $('pt-doc-arq'); inp.value = ''; inp.onchange = () => { if (inp.files.length) enviarDocs([...inp.files]) }; inp.click(); break }
      case 'rm-doc': e.stopPropagation(); formRemoverDoc(el.dataset.id); break
      case 'foto': abrirDoc(el.dataset.url); break
      case 'etiquetas': formEtiquetas([...S.sel]); break
      case 'etiqueta-uma': formEtiquetas([S.ficha.id]); break
      case 'csv': exportarCsv(); break
    }
  })
})()
