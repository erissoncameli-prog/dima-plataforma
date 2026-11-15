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
    assina: '<path d="M3 17c3-1 4-6 6-6s1 5 3 5 3-4 5-4 2 3 4 3"/><path d="M3 21h18"/>',
    pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    trocar: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    imprimir: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
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
  const OC_TIPO = { avaria: 'Avaria', defeito: 'Defeito', mau_uso: 'Mau uso', extravio: 'Extravio', furto: 'Furto', roubo: 'Roubo', sinistro: 'Sinistro (incêndio, alagamento, acidente)' }
  const OC_SIT = { aberta: 'Aberta', em_apuracao: 'Em apuração', concluida: 'Concluída' }
  const OC_DESF = { localizado: 'Localizado', reparado: 'Reparado', ressarcido: 'Ressarcido', indenizado: 'Indenizado pelo seguro', baixa: 'Baixa', arquivada: 'Arquivada (sem dano)' }
  const BX_MOT = { inservivel: 'Inservível', sinistro_perda_total: 'Perda total por sinistro', furto_roubo: 'Furto ou roubo', extravio_nao_localizado: 'Extravio não localizado',
    obsolescencia: 'Obsolescência', doacao: 'Doação', alienacao: 'Alienação (venda)' }
  const BX_SIT = { aguardando: 'Aguardando aprovação', aprovada: 'Aprovada', devolvida: 'Devolvida', cancelada: 'Cancelada' }
  const TERMO_SIT = { aguardando_aceite: 'Aguardando aceite', aceito: 'Aceito', recusado: 'Recusado', cancelado: 'Cancelado' }
  const TERMO_TIPO = { responsabilidade: 'Termo de responsabilidade', emprestimo: 'Termo de empréstimo' }
  const FOTO_SLOT = { frente: 'Frente', placa: 'Placa ou nº de série', detalhe: 'Detalhe ou conjunto' }
  const FOTO_DICA = { frente: 'obrigatória · vira a capa', placa: 'etiqueta do fabricante, série', detalhe: 'acessórios, estado, conjunto' }
  const DOC_TIPO = { foto: 'Foto', laudo: 'Laudo', garantia: 'Termo de garantia', manual: 'Manual', termo: 'Termo', bo: 'Boletim de ocorrência', outro: 'Outro' }

  // ── Estado ────────────────────────────────────────────────────────────────
  const S = {
    bens: [], cats: [], locais: [], fila: [], pode: { gerir: false, coord: false, valor: false },
    aba: 'painel', filtro: { q: '', cat: '', local: '', sit: 'ativos', cond: '', aviso: '' }, sel: new Set(),
    ficha: null, fichaAba: 'dados', eventos: [], docs: [],
    termos: [], usuarios: [], soMeus: false, eu: null, termo: null, ocorrencias: [], baixas: [], doc: null,
    invs: [], inv: null, invUi: null,
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
  FECHAR['pt-inv'] = () => { pararCamera(); ptFechar('pt-inv') }
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
      S.eu = appState.usuario?.id || null
      // sem acesso ao catálogo: só "Meus bens" (bens sob a própria guarda e termos para aceitar)
      if (!v) { S.soMeus = true; S.aba = 'meus' }
    } catch (e) { $('pt-pg').innerHTML = '<div class="pt-card"><div class="pt-vazio">' + ptIc('alerta') + esc(erroMsg(e)) + '</div></div>'; return }
    const q = new URLSearchParams(location.search)
    if (['painel', 'bens', 'meus', 'termos', 'ocorrencias', 'inventarios', 'cadastros', 'guia'].includes(q.get('aba')) && (!S.soMeus || q.get('aba') === 'inventarios')) S.aba = q.get('aba')
    await carregar()
    if (q.get('termo')) abrirTermo(q.get('termo'))
    if (q.get('ocorrencia')) abrirOcorrencia(q.get('ocorrencia'))
    if (q.get('baixa')) abrirBaixa(q.get('baixa'))
    if (q.get('inventario')) { S.aba = 'inventarios'; render(); abrirInventario(q.get('inventario')) }
    const alvo = q.get('bem')
    if (alvo) {
      const b = S.bens.find(x => x.numero === alvo.toUpperCase() || x.id === alvo)
      if (b) abrirFicha(b.id); else toast('Bem ' + alvo + ' não encontrado (ou sem acesso).', 'warning')
    }
    if (q.get('incorporar') && S.pode.gerir) abrirIncorporar(q.get('incorporar'))
  })()

  async function carregar() {
    try {
      const [b, c, l, f, t, u, o, x, iv] = await Promise.all([
        db.from('vw_pat_bens').select('*').order('numero'),
        db.from('pat_categorias').select('*').order('ordem').order('nome'),
        db.from('pat_locais').select('*').order('nome'),
        S.pode.gerir ? db.rpc('fn_pat_a_incorporar') : Promise.resolve({ data: [] }),
        db.from('pat_termos').select('id,numero,tipo,situacao,responsavel_id,local_id,devolver_ate,finalidade,criado_em,decidido_em,devolvido_em,'
          + 'responsavel:usuarios!pat_termos_responsavel_id_fkey(nome_completo),criador:usuarios!pat_termos_criado_por_fkey(nome_completo),'
          + 'local:pat_locais!pat_termos_local_id_fkey(nome),pat_termo_itens(count)').order('criado_em', { ascending: false }),
        S.pode.gerir ? db.from('usuarios').select('id,nome_completo,perfil').eq('ativo', true).order('nome_completo') : Promise.resolve({ data: [] }),
        db.from('pat_ocorrencias').select('*,bem:pat_bens!pat_ocorrencias_bem_id_fkey(numero,descricao),registrador:usuarios!pat_ocorrencias_registrado_por_fkey(nome_completo)')
          .order('registrado_em', { ascending: false }),
        S.soMeus ? Promise.resolve({ data: [] }) : db.from('pat_baixas').select('id,numero,bem_id,ocorrencia_id,motivo,situacao,pedido_por,pedido_em,decidido_em,'
          + 'bem:pat_bens!pat_baixas_bem_id_fkey(numero,descricao),pedidor:usuarios!pat_baixas_pedido_por_fkey(nome_completo)').order('pedido_em', { ascending: false }),
        db.rpc('fn_pat_inv_lista'),
      ])
      for (const r of [b, c, l, f, t, u, o, x, iv]) if (r.error) throw r.error
      S.invs = iv.data || []
      S.ocorrencias = o.data || []; S.baixas = x.data || []
      S.bens = b.data || []; S.cats = c.data || []; S.locais = l.data || []; S.fila = f.data || []
      S.termos = t.data || []; S.usuarios = u.data || []
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
      vencido: at.filter(b => b.devolver_ate && b.devolver_ate < h),
      manutencao: at.filter(b => b.situacao === 'em_manutencao'),
      termo: at.filter(b => b.termo_pendente),
      ocorrencia: at.filter(b => b.ocorrencia_aberta),
      baixa: at.filter(b => b.baixa_pendente),
    }
  }
  const AVISO_TXT = {
    nf: ['alerta', 'al', 'sem nota fiscal anexada', 'Anexe o PDF da NF na ficha (aba Dados).'],
    estoque: ['relogio', 'in', 'sem início de uso', 'Sem início de uso o bem não deprecia. Informe a data na ficha.'],
    garantia: ['escudo', 'al', 'com garantia vencendo em até 30 dias', 'Se houver defeito, acione a garantia antes do vencimento.'],
    foto: ['camera', 'in', 'sem foto', 'Uma foto ajuda a identificar o bem no inventário.'],
    ruim: ['alerta', 'al', 'em condição ruim ou inservível', 'Avalie manutenção ou baixa.'],
    vencido: ['relogio', 'al', 'com empréstimo vencido', 'Cobre a devolução de quem está com o bem.'],
    termo: ['assina', 'in', 'em termo aguardando aceite', 'Só o aceite com senha muda o responsável.'],
    manutencao: ['ferramenta', 'in', 'em manutenção', 'Registre a volta quando o serviço terminar.'],
    ocorrencia: ['alerta', 'al', 'com ocorrência em aberto', 'Apure e registre o desfecho em Ocorrências e baixas.'],
    baixa: ['assina', 'in', 'com pedido de baixa aguardando', 'Quem aprova é a coordenação (ou o super_admin) que não pediu, com a senha.'],
  }

  function render() {
    const av = avisos(), nAv = S.fila.length + av.nf.length + av.vencido.length
    const meusPend = S.termos.filter(t => t.responsavel_id === S.eu && t.situacao === 'aguardando_aceite').length
    const abas = S.soMeus ? [['meus', 'pessoa', 'Meus bens', meusPend]]
      : [['painel', 'painel', 'Painel', nAv], ['bens', 'lista', 'Bens', 0], ['meus', 'pessoa', 'Meus bens', meusPend]]
    if (S.pode.gerir) abas.push(['termos', 'assina', 'Termos', S.termos.filter(t => t.situacao === 'aguardando_aceite').length])
    if (!S.soMeus) abas.push(['ocorrencias', 'alerta', 'Ocorrências e baixas',
      S.ocorrencias.filter(o => o.situacao !== 'concluida').length + (S.pode.coord ? S.baixas.filter(x => x.situacao === 'aguardando' && x.pedido_por !== S.eu).length : 0)])
    if (!S.soMeus || S.invs.some(v => v.eu_membro))
      abas.push(['inventarios', 'qr', 'Inventários', S.invs.filter(v => v.falta_minha_assinatura || (v.eu_membro && v.situacao === 'em_andamento')).length])
    if (S.pode.gerir) abas.push(['cadastros', 'engrenagem', 'Categorias e locais', 0])
    abas.push(['guia', 'livro', 'Como funciona', 0])
    $('pt-pg').innerHTML =
      '<div class="pt-abas" role="tablist" aria-label="Seções do patrimônio">' + abas.map(a =>
        '<button type="button" class="pt-aba" role="tab" data-acao="aba" data-aba="' + a[0] + '" aria-selected="' + (S.aba === a[0]) + '">' +
        ptIc(a[1], 'p') + a[2] + (a[3] ? '<span class="n">' + a[3] + '</span>' : '') + '</button>').join('') + '</div>' +
      '<div id="pt-conteudo"></div>'
    if (S.soMeus && !['guia', 'inventarios'].includes(S.aba)) S.aba = 'meus'
    if (S.aba === 'bens') renderBens()
    else if (S.aba === 'meus') renderMeus()
    else if (S.aba === 'termos' && S.pode.gerir) renderTermos()
    else if (S.aba === 'ocorrencias' && !S.soMeus) renderOcorrencias()
    else if (S.aba === 'inventarios') renderInventarios()
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
    kpis.push(['alerta', 'Pendências', S.fila.length + av.nf.length + av.vencido.length + av.termo.length,
      (S.pode.gerir ? S.fila.length + ' a incorporar · ' : '') + av.nf.length + ' sem NF · ' + av.termo.length + ' em termo · ' + av.vencido.length + ' empréstimo vencido', ''])

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
        '<span id="pt-lote" hidden style="display:contents">' +
          '<button type="button" class="pt-btn" data-acao="termo-sel">' + ptIc('assina', 'p') + 'Entregar com termo</button>' +
          '<button type="button" class="pt-btn" data-acao="local-sel">' + ptIc('local', 'p') + 'Mudar de local</button>' +
          '<button type="button" class="pt-btn" data-acao="devolver-sel">' + ptIc('desfazer', 'p') + 'Registrar devolução</button></span>' +
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
    const lote = $('pt-lote'); if (lote) lote.hidden = !(n && S.pode.gerir)
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
        '<td class="c-local">' + esc(b.local_nome || '—') + (b.responsavel_nome ? '<div class="pt-sub">com ' + esc(b.responsavel_nome) + '</div>' : '') + '</td>' +
        '<td class="c-sit"><div class="pt-selos" style="margin:0">' + selo('s-' + b.situacao, SIT[b.situacao] || b.situacao) + selo('c-' + b.condicao, COND[b.condicao] || b.condicao) +
          (b.nf_pendente ? selo('al', 'sem NF') : '') + (b.termo_pendente ? selo('al', 'termo ' + b.termo_pendente) : '') +
          (b.devolver_ate ? selo(b.devolver_ate < hoje() ? 'er' : 'ne', 'devolver até ' + dt(b.devolver_ate)) : '') +
          (b.ocorrencia_aberta ? selo('al', 'ocorrência ' + b.ocorrencia_aberta) : '') + (b.baixa_pendente ? selo('ne', 'baixa ' + b.baixa_pendente) : '') + '</div></td>' +
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

  // ── Fase 4: inventário por campanha ───────────────────────────────────────
  // A tela só desenha e chama as RPCs fn_pat_inv_*; quem confere, a lista esperada, o hash e o efeito
  // do fechamento (eventos, extravio, regularização) são do banco. Assinar = Edge Function com a senha.
  const INV_TIPO = { anual: 'Anual', parcial: 'Parcial', extraordinario: 'Extraordinário', encerramento: 'Encerramento do projeto' }
  const INV_SIT = { em_andamento: 'Em conferência', em_assinatura: 'Em assinatura', concluido: 'Concluído', cancelado: 'Cancelado' }
  const INV_RES = { pendente: 'Pendente', conferido: 'Conferido', local_divergente: 'Outro local', condicao_divergente: 'Condição mudou',
    nao_esperado: 'Fora da lista', nao_localizado: 'Não localizado', ausente: 'Ausente por registro' }
  const INV_RES_CLS = { pendente: 'ne', conferido: 't-aceito', local_divergente: 'al', condicao_divergente: 'al', nao_esperado: 'al', nao_localizado: 'er', ausente: 'ne' }
  // resultado para exibição: pendente em inventário fechado vira não localizado / ausente (como o banco efetiva)
  function invRes(i, v) {
    if (i.resultado !== 'pendente' || v.situacao === 'em_andamento') return i.resultado
    return ['emprestado', 'em_manutencao', 'extraviado'].includes(i.situacao_esperada) ? 'ausente' : 'nao_localizado'
  }
  function invContagem(I) {
    const v = I.inventario, it = (I.itens || []).filter(i => i.esperado || i.resultado !== 'pendente'), c = { total: 0, conf: 0, pend: 0, div: 0, fora: 0 }
    it.forEach(i => {
      if (i.esperado) c.total++
      if (i.conferido_em) c.conf++
      const r = invRes(i, v)
      if (['local_divergente', 'condicao_divergente'].includes(r)) c.div++
      if (r === 'nao_esperado') c.fora++
      if (i.esperado && !i.conferido_em) c.pend++
    })
    return c
  }

  function renderInventarios() {
    const l = S.invs
    $('pt-conteudo').innerHTML = '<div class="pt-card"><div class="pt-card-h">' + ptIc('qr', 'p') + 'Inventários' +
      '<span class="pt-sub">a comissão confere cada bem pelo QR da etiqueta e assina o resultado com a senha</span>' +
      (S.pode.gerir ? '<button type="button" class="pt-btn pri" style="margin-left:auto" data-acao="inv-novo">' + ptIc('mais', 'p') + 'Abrir inventário</button>' : '') + '</div>' +
      (l.length ? l.map(v => {
        const pct = v.esperados ? Math.round(100 * Math.min(v.conferidos, v.esperados) / v.esperados) : 0
        return '<div class="pt-termo-card"><div class="t"><b>' + esc(v.numero) + ' · ' + esc(v.titulo) + '</b>' +
          '<span>' + esc(INV_TIPO[v.tipo] || v.tipo) + ' · ' + (v.locais_nomes.length ? esc(v.locais_nomes.join(', ')) : 'todos os locais') + ' · aberto em ' + dtHora(v.aberto_em) + '</span>' +
          '<div class="pt-inv-barra" role="img" aria-label="' + v.conferidos + ' de ' + v.esperados + ' conferidos"><i style="width:' + pct + '%"></i></div>' +
          '<span class="pt-sub">' + v.conferidos + ' de ' + v.esperados + ' conferidos' + (v.divergentes ? ' · ' + v.divergentes + ' com divergência' : '') +
          (v.situacao === 'em_assinatura' ? ' · ' + v.assinaturas + ' de ' + v.membros + ' assinaturas' : '') + '</span></div>' +
          selo(v.situacao === 'concluido' ? 't-aceito' : v.situacao === 'cancelado' ? 't-cancelado' : 'al', INV_SIT[v.situacao]) +
          '<button type="button" class="pt-btn' + (v.falta_minha_assinatura || (v.eu_membro && v.situacao === 'em_andamento') ? ' pri' : '') + '" data-acao="inv" data-id="' + esc(v.id) + '">' +
          (v.falta_minha_assinatura ? ptIc('assina', 'p') + 'Assinar' : v.eu_membro && v.situacao === 'em_andamento' ? ptIc('qr', 'p') + 'Conferir' : 'Abrir') + '</button></div>'
      }).join('') : '<div class="pt-vazio">' + ptIc('qr') + 'Nenhum inventário ainda.' + (S.pode.gerir ? ' Abra o primeiro e escolha a comissão.' : '') + '</div>') + '</div>'
  }

  function formInventario() {
    const us = S.usuarios
    const opc = us.map(u => '<option value="' + esc(u.id) + '">' + esc(u.nome_completo) + '</option>').join('')
    abrirForm({ titulo: 'Abrir inventário', sub: 'O sistema congela agora a lista dos bens esperados nos locais escolhidos.', botao: 'Abrir inventário',
      corpo: '<div class="form-group"><label class="form-label" for="fi-t">Título</label><input class="form-control" id="fi-t" value="Inventário anual ' + new Date().getFullYear() + '"></div>' +
        '<div class="form-group"><label class="form-label" for="fi-tipo">Tipo</label><select class="form-control" id="fi-tipo">' +
          Object.entries(INV_TIPO).map(([k, t]) => '<option value="' + k + '">' + esc(t) + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><span class="form-label">Locais <span class="pt-sub">(nenhum marcado = todos)</span></span><div class="pt-checks">' +
          S.locais.filter(x => x.ativo !== false).map(x => '<label><input type="checkbox" class="fi-loc" value="' + esc(x.id) + '"> ' + esc(x.nome) + '</label>').join('') + '</div></div>' +
        '<div class="form-group"><label class="form-label" for="fi-pres">Presidente da comissão</label><select class="form-control" id="fi-pres"><option value="">Escolha…</option>' + opc + '</select></div>' +
        '<div class="form-group"><span class="form-label">Demais membros <span class="pt-sub">(ao menos 1; todos assinam com a senha)</span></span><div class="pt-checks pt-checks-alto">' +
          us.map(u => '<label><input type="checkbox" class="fi-mem" value="' + esc(u.id) + '"> ' + esc(u.nome_completo) + '</label>').join('') + '</div></div>' +
        '<div class="form-group"><label class="form-label" for="fi-obs">Observação <span class="pt-sub">(opcional)</span></label><textarea class="form-control" id="fi-obs" rows="2"></textarea></div>',
      aoSalvar: async r => {
        const pres = val(r, '#fi-pres')
        if (!pres) throw new Error('PAT_DADOS: escolha quem preside a comissão')
        const mem = [...r.querySelectorAll('.fi-mem:checked')].map(x => x.value).filter(x => x !== pres)
        const res = await rpc('fn_pat_inv_abrir', { p: { titulo: val(r, '#fi-t'), tipo: val(r, '#fi-tipo'), observacao: val(r, '#fi-obs'),
          locais: [...r.querySelectorAll('.fi-loc:checked')].map(x => x.value), comissao: [pres, ...mem] } })
        toast('Inventário ' + res.numero + ' aberto com ' + res.bens + ' bens esperados. A comissão recebeu uma tarefa.', 'success')
        await carregar(); await abrirInventario(res.inventario_id)
      } })
  }

  async function abrirInventario(id) {
    $('pt-inv-tit').textContent = 'Inventário'; $('pt-inv-sub').textContent = ''
    $('pt-inv-corpo').innerHTML = '<div class="pt-carregando">Carregando…</div>'; $('pt-inv-rodape').innerHTML = ''
    ptAbrir('pt-inv')
    await recarregarInventario(id)
  }
  async function recarregarInventario(id) {
    try { S.inv = await rpc('fn_pat_inv_detalhe', { p_inv: id || S.inv.inventario.id }) } catch (e) { S.inv = null }
    if (!S.inv) { $('pt-inv-corpo').innerHTML = '<div class="pt-aviso-f er">' + ptIc('alerta', 'p') + '<span>Inventário não encontrado ou sem acesso.</span></div>'; return }
    const v = S.inv.inventario
    if (!S.invUi || S.invUi.id !== v.id) {
      const locs = v.locais && v.locais.length ? v.locais : []
      S.invUi = { id: v.id, local: locs.length === 1 ? locs[0] : (S.invUi?.local || ''), filtro: 'pendentes', q: '', alvo: null }
    }
    renderInventario()
  }

  function renderInventario() {
    const I = S.inv, v = I.inventario, U = S.invUi, c = invContagem(I)
    const conferindo = v.situacao === 'em_andamento' && I.eu_membro
    $('pt-inv-tit').textContent = v.numero + ' · ' + v.titulo
    $('pt-inv-sub').innerHTML = selo(v.situacao === 'concluido' ? 't-aceito' : v.situacao === 'cancelado' ? 't-cancelado' : 'al', INV_SIT[v.situacao]) +
      ' <span class="pt-sub">' + esc(INV_TIPO[v.tipo] || v.tipo) + ' · ' + (v.locais_nomes.length ? esc(v.locais_nomes.join(', ')) : 'todos os locais') +
      ' · aberto por ' + esc(v.aberto_por_nome || '—') + ' em ' + dtHora(v.aberto_em) + '</span>'
    const pct = c.total ? Math.round(100 * (c.total - c.pend) / c.total) : 0
    const itens = (I.itens || []).filter(i => {
      const r = invRes(i, v)
      if (U.filtro === 'pendentes' && !(i.esperado && !i.conferido_em)) return false
      if (U.filtro === 'conferidos' && !i.conferido_em) return false
      if (U.filtro === 'divergencias' && !['local_divergente', 'condicao_divergente', 'nao_esperado', 'nao_localizado'].includes(r)) return false
      if (U.q) { const q = semAcento(U.q); if (!semAcento([i.numero, i.descricao, i.numero_serie, i.marca, i.modelo].join(' ')).includes(q)) return false }
      return true
    })
    const locOpc = '<option value="">Escolha o local…</option>' + S.locais.filter(x => x.ativo !== false || x.id === U.local).map(x =>
      '<option value="' + esc(x.id) + '"' + (x.id === U.local ? ' selected' : '') + '>' + esc(x.nome) + '</option>').join('')
    $('pt-inv-corpo').innerHTML = '<div id="pt-inv-erro"></div>' +
      '<div class="pt-inv-kpis"><div><b class="mono">' + c.total + '</b><span>esperados</span></div><div><b class="mono">' + (c.total - c.pend) + '</b><span>conferidos</span></div>' +
        '<div><b class="mono">' + c.pend + '</b><span>' + (v.situacao === 'em_andamento' ? 'faltam' : 'não conferidos') + '</span></div>' +
        '<div><b class="mono">' + (c.div + c.fora) + '</b><span>divergências</span></div></div>' +
      '<div class="pt-inv-barra g" role="img" aria-label="' + pct + '% conferido"><i style="width:' + pct + '%"></i></div>' +
      (conferindo ? '<div class="pt-inv-ler">' +
        '<div class="pt-inv-onde"><label class="form-label" for="pt-inv-local">' + ptIc('local', 'p') + 'Estou conferindo em</label><select class="form-control" id="pt-inv-local">' + locOpc + '</select></div>' +
        '<div class="pt-inv-acoes"><button type="button" class="pt-btn pri" data-acao="inv-camera">' + ptIc('camera', 'p') + 'Ler QR da etiqueta</button>' +
          '<div class="pt-inv-num"><input class="form-control" id="pt-inv-numero" placeholder="Nº do bem, série ou nome" autocomplete="off" inputmode="search">' +
          '<button type="button" class="pt-btn" data-acao="inv-procurar">' + ptIc('busca', 'p') + 'Procurar</button></div></div>' +
        '<div id="pt-inv-cam" hidden><video id="pt-inv-video" playsinline muted></video><div class="pt-inv-mira" aria-hidden="true"></div>' +
          '<button type="button" class="pt-btn" data-acao="inv-camera-parar">' + ptIc('x', 'p') + 'Fechar câmera</button></div>' +
        '<div id="pt-inv-alvo"></div></div>' : '') +
      (v.situacao === 'em_assinatura' ? blocoAssinaturaInv() : '') +
      (v.situacao === 'concluido' ? '<div class="pt-aviso-f ok" style="margin-top:12px">' + ptIc('check', 'p') + '<span>Concluído em ' + dtHora(v.concluido_em) +
        '. Os bens conferidos ganharam o registro de inventário; os não localizados viraram ocorrência de extravio; as divergências foram para o gestor.</span></div>' +
        '<div class="pt-hash" style="margin-top:6px">Assinado pela comissão · SHA-256 ' + esc(v.hash || '') + '</div>' : '') +
      (v.situacao === 'cancelado' ? '<div class="pt-aviso-f ne" style="margin-top:12px">' + ptIc('info', 'p') + '<span>Cancelado em ' + dtHora(v.cancelado_em) + ': ' + esc(v.motivo_cancelamento || '') + '</span></div>' : '') +
      '<div class="pt-sec" style="margin-top:16px">' + ptIc('pessoa', 'p') + 'Comissão</div><div class="pt-inv-com">' + I.comissao.map(m =>
        '<span class="pt-pill ' + (m.assinado_em ? 't-aceito' : 'ne') + '">' + ptIc(m.assinado_em ? 'check' : 'pessoa', 'p') + esc(m.nome) + (m.papel === 'presidente' ? ' (presidente)' : '') +
        (m.assinado_em ? ' · assinou ' + dtHora(m.assinado_em) : '') + '</span>').join('') + '</div>' +
      '<div class="pt-sec" style="margin-top:16px">' + ptIc('lista', 'p') + 'Bens</div>' +
      '<div class="pt-inv-filtros"><div class="pt-seg" role="group" aria-label="Filtrar bens">' + [['pendentes', v.situacao === 'em_andamento' ? 'Faltam' : 'Não conferidos'], ['conferidos', 'Conferidos'], ['divergencias', 'Divergências'], ['todos', 'Todos']].map(f =>
        '<button type="button" data-acao="inv-filtro" data-f="' + f[0] + '" aria-pressed="' + (U.filtro === f[0]) + '">' + f[1] + '</button>').join('') + '</div>' +
        '<input class="form-control" id="pt-inv-q" placeholder="Filtrar a lista" value="' + esc(U.q) + '"></div>' +
      (itens.length ? '<div class="pt-tbl-w"><table class="pt-mini pt-inv-tbl"><thead><tr><th>Nº</th><th>Bem</th><th>Esperado em</th><th>Achado</th><th>Situação</th><th></th></tr></thead><tbody>' +
        itens.map(i => { const r = invRes(i, v)
          return '<tr><td class="mono">' + esc(i.numero) + '</td><td>' + esc(i.descricao) + '<div class="pt-sub">' + esc([i.marca, i.modelo, i.numero_serie && 'S/N ' + i.numero_serie].filter(Boolean).join(' · ')) + '</div></td>' +
            '<td>' + (i.esperado ? esc(i.local_esperado_nome || '—') + '<div class="pt-sub">' + esc(COND[i.condicao_esperada] || i.condicao_esperada) + (i.responsavel_esperado_nome ? ' · ' + esc(i.responsavel_esperado_nome) : '') + '</div>' : '<span class="pt-sub">fora da lista</span>') + '</td>' +
            '<td>' + (i.conferido_em ? esc(i.local_encontrado_nome || '—') + '<div class="pt-sub">' + esc(COND[i.condicao_encontrada] || '') + ' · ' + esc(i.conferido_por_nome || '') + ' ' + dtHora(i.conferido_em) +
              (i.observacao ? '<br>' + esc(i.observacao) : '') + '</div>' : '—') + '</td>' +
            '<td>' + selo(INV_RES_CLS[r] || 'ne', INV_RES[r] || r) + '</td>' +
            '<td class="dir">' + (conferindo ? (i.conferido_em ? '<button type="button" class="pt-btn peq" data-acao="inv-desfazer" data-id="' + esc(i.bem_id) + '" title="Desfazer a conferência">' + ptIc('desfazer', 'p') + '</button>'
              : '<button type="button" class="pt-btn peq" data-acao="inv-alvo" data-id="' + esc(i.bem_id) + '">Conferir</button>') : '') + '</td></tr>' }).join('') + '</tbody></table></div>'
        : '<div class="pt-vazio">' + ptIc('check') + (U.filtro === 'pendentes' && v.situacao === 'em_andamento' ? 'Todos os bens esperados foram conferidos.' : 'Nada nesta lista.') + '</div>') +
      (v.observacao ? '<div class="pt-aviso-f ne" style="margin-top:12px;white-space:pre-line">' + ptIc('info', 'p') + '<span>' + esc(v.observacao) + '</span></div>' : '')
    const q = $('pt-inv-q'); if (q) q.oninput = () => { U.q = q.value; const p = q.selectionStart; renderInventario(); const n = $('pt-inv-q'); n.focus(); n.setSelectionRange(p, p) }
    const sl = $('pt-inv-local'); if (sl) sl.onchange = () => { U.local = sl.value; if (U.alvo) renderAlvo() }
    const nu = $('pt-inv-numero'); if (nu) nu.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); procurarInv(nu.value) } }
    if (U.alvo) renderAlvo(); else if (U.fotoBem) renderFotoInv()
    $('pt-inv-rodape').innerHTML = '<span class="esq">' +
      (S.pode.gerir && ['em_andamento', 'em_assinatura'].includes(v.situacao) ? '<button type="button" class="pt-btn perigo" data-acao="inv-cancelar">Cancelar inventário</button>' : '') + '</span>' +
      '<button type="button" class="pt-btn" data-acao="inv-imprimir">' + ptIc('imprimir', 'p') + 'Relatório (A4)</button>' +
      (v.situacao === 'em_assinatura' && (I.eu_membro || I.eu_conduzo) ? '<button type="button" class="pt-btn" data-acao="inv-reabrir">' + ptIc('desfazer', 'p') + 'Reabrir conferência</button>' : '') +
      (v.situacao === 'em_andamento' && I.eu_conduzo ? '<button type="button" class="pt-btn pri" data-acao="inv-enviar">' + ptIc('assina', 'p') + 'Enviar para assinatura</button>' : '')
  }

  function blocoAssinaturaInv() {
    const I = S.inv, c = invContagem(I)
    const resumo = c.pend ? c.pend + ' bem(ns) esperado(s) não conferido(s): os que deviam estar no local viram ocorrência de extravio na última assinatura.' : 'Todos os bens esperados foram conferidos.'
    return '<div class="pt-declara">' + esc('A comissão declara que conferiu os bens deste inventário nos locais indicados, que o resultado acima reflete o que foi encontrado e que ' +
        'as divergências serão regularizadas pelo gestor patrimonial. ' + resumo) + '</div>' +
      (I.eu_membro && !I.eu_assinei ? '<div class="pt-sec">' + ptIc('chave', 'p') + 'Assinar com a sua senha</div>' +
        '<div class="pt-assina"><div><label class="form-label" for="pt-inv-senha">Senha de entrada na plataforma</label><input class="form-control" type="password" id="pt-inv-senha" autocomplete="current-password"></div>' +
        '<span></span><button type="button" class="pt-btn pri" data-acao="inv-assinar">' + ptIc('assina', 'p') + 'Assinar o resultado</button></div>'
        : I.eu_assinei ? '<div class="pt-aviso-f ok">' + ptIc('check', 'p') + '<span>Você já assinou. Falta o restante da comissão; quem falta recebeu uma tarefa.</span></div>'
        : '<div class="pt-aviso-f in">' + ptIc('relogio', 'p') + '<span>Aguardando as assinaturas da comissão.</span></div>') +
      '<div class="pt-hash" style="margin-top:8px">Resultado conferido: SHA-256 ' + esc(I.inventario.hash || '') +
        (I.assinaturas_anteriores ? ' · ' + I.assinaturas_anteriores + ' assinatura(s) de versão anterior (sem efeito)' : '') + '</div>'
  }

  // ── Conferir: bem escolhido (QR, busca ou lista) ──
  function procurarInv(txt) {
    const I = S.inv, t = String(txt || '').trim(); if (!t) return
    const num = (t.toUpperCase().match(/PAT-\d+/) || [])[0]
    let achado = num ? (I.itens.find(i => i.numero === num) || S.bens.find(b => b.numero === num)) : null
    if (!achado) {
      const q = semAcento(t)
      const cand = [...I.itens, ...S.bens.filter(b => ativo(b) && !I.itens.some(i => i.bem_id === b.id))]
        .filter(b => semAcento([b.numero, b.numero_serie, b.descricao, b.marca, b.modelo].join(' ')).includes(q))
      if (cand.length === 1) achado = cand[0]
      else if (cand.length > 1) { S.invUi.q = t; S.invUi.filtro = 'todos'; renderInventario(); toast(cand.length + ' bens combinam. Escolha na lista abaixo.', 'info'); return }
    }
    if (!achado && num) { S.invUi.alvo = { numero: num }; renderAlvo(); return }   // o banco procura (bem que a pessoa não vê no catálogo)
    if (!achado) { invErro('Nenhum bem encontrado com "' + t + '".'); return }
    S.invUi.alvo = { bem_id: achado.bem_id || achado.id }; renderAlvo()
  }
  function invErro(m) { const e = $('pt-inv-erro'); if (e) { e.innerHTML = m ? '<div class="pt-aviso-f er">' + ptIc('alerta', 'p') + '<span>' + esc(m) + '</span></div>' : ''; if (m) $('pt-inv-corpo').scrollTop = 0 } }
  function renderAlvo() {
    const box = $('pt-inv-alvo'), U = S.invUi; if (!box || !U.alvo) return
    const I = S.inv, a = U.alvo
    const it = a.bem_id ? I.itens.find(i => i.bem_id === a.bem_id) : null
    const b = it || (a.bem_id ? S.bens.find(x => x.id === a.bem_id) : null)
    const cond = U.cond || it?.condicao_encontrada || it?.condicao_esperada || b?.condicao || 'bom'
    const outroLocal = it && it.esperado && U.local && it.local_esperado && U.local !== it.local_esperado
    box.innerHTML = '<div class="pt-inv-alvo">' +
      '<div class="t"><b>' + esc(b ? b.numero + ' · ' + b.descricao : a.numero) + '</b>' +
        (b ? '<span class="pt-sub">' + esc([b.marca, b.modelo, b.numero_serie && 'S/N ' + b.numero_serie].filter(Boolean).join(' · ')) + '</span>' : '<span class="pt-sub">o banco confere o número ao gravar</span>') +
        (it ? (it.esperado ? '<span>esperado em <b>' + esc(it.local_esperado_nome || '—') + '</b>, condição ' + esc(COND[it.condicao_esperada] || it.condicao_esperada) + '</span>' : '')
          : '<span>' + selo('al', 'fora da lista deste inventário') + '</span>') +
        (it?.conferido_em ? '<span>' + selo('t-aceito', 'já conferido') + ' — gravar de novo substitui</span>' : '') +
        (outroLocal ? '<span>' + selo('al', 'achado em outro local') + '</span>' : '') + '</div>' +
      '<div class="pt-seg" role="group" aria-label="Condição em que o bem está">' + Object.entries(COND).map(([k, t]) =>
        '<button type="button" data-acao="inv-cond" data-c="' + k + '" aria-pressed="' + (cond === k) + '">' + esc(t) + '</button>').join('') + '</div>' +
      '<input class="form-control" id="pt-inv-obs" placeholder="Observação (opcional): ex.: na caixa do palco" value="' + esc(U.obs || '') + '">' +
      '<div class="pt-inv-alvo-b"><button type="button" class="pt-btn" data-acao="inv-alvo-sair">Agora não</button>' +
        '<button type="button" class="pt-btn pri" data-acao="inv-confirmar">' + ptIc('check', 'p') + 'Confirmar conferência</button></div></div>'
    U.cond = cond
    const o = $('pt-inv-obs'); if (o) o.oninput = () => { U.obs = o.value }
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  async function confirmarInv() {
    const U = S.invUi, a = U.alvo; if (!a) return
    if (!U.local) { invErro('Escolha o local em que você está conferindo.'); $('pt-inv-local')?.focus(); return }
    const b = $('pt-inv-corpo').querySelector('[data-acao="inv-confirmar"]'); if (b) b.disabled = true
    try {
      const r = await rpc('fn_pat_inv_conferir', { p: { inventario_id: S.inv.inventario.id, bem_id: a.bem_id || null, numero: a.numero || null,
        local_id: U.local, condicao: U.cond, metodo: a.metodo || (a.numero ? 'qr' : 'lista'), observacao: U.obs || null } })
      toast(r.numero + ': ' + (INV_RES[r.resultado] || r.resultado).toLowerCase() + '.', r.resultado === 'conferido' ? 'success' : 'warning')
      U.alvo = null; U.cond = null; U.obs = ''
      invErro('')
      await recarregarInventario()
      // bem sem as 3 fotos: aproveita que está com ele na mão (a câmera de leitura pausa enquanto isso)
      const { data: fts } = await db.from('pat_documentos').select('slot').eq('bem_id', r.bem_id).eq('ativo', true).not('slot', 'is', null)
      const falta = fts ? ['frente', 'placa', 'detalhe'].filter(k => !fts.some(x => x.slot === k)) : []
      if (falta.length) { U.fotoBem = { id: r.bem_id, numero: r.numero, falta }; renderFotoInv(); return }
      if (U.cam) iniciarCamera()   // segue lendo o próximo
      else $('pt-inv-numero')?.focus()
    } catch (e) { invErro(erroMsg(e)); if (b) b.disabled = false }
  }

  function renderFotoInv() {
    const U = S.invUi, F = U.fotoBem, box = $('pt-inv-alvo'); if (!box || !F) return
    box.innerHTML = '<div class="pt-inv-alvo"><div class="t"><b>' + esc(F.numero) + ' conferido.</b><span>Faltam ' + F.falta.length + ' de 3 fotos deste bem. Aproveite para fotografar agora:</span></div>' +
      '<div class="pt-fslots">' + F.falta.map(k => fotoSlot(k, '', 'data-invfoto="' + k + '"', { editar: true })).join('') + '</div>' +
      '<div class="pt-inv-alvo-b"><button type="button" class="pt-btn" data-acao="inv-foto-pular">Pular as fotos</button></div></div>'
    box.querySelectorAll('input[data-invfoto]').forEach(inp => inp.onchange = async () => {
      const f0 = inp.files[0]; if (!f0) return
      const slot = inp.dataset.invfoto, c = inp.closest('.pt-fslot'); c.classList.add('enviando')
      try { await definirFoto(F.id, slot, f0); F.falta = F.falta.filter(k => k !== slot); toast('Foto salva.', 'success') }
      catch (er) { invErro(erroMsg(er)); c.classList.remove('enviando'); return }
      if (F.falta.length) renderFotoInv(); else fimFotoInv()
    })
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  function fimFotoInv() {
    const U = S.invUi; U.fotoBem = null; const box = $('pt-inv-alvo'); if (box) box.innerHTML = ''
    if (U.cam) iniciarCamera(); else $('pt-inv-numero')?.focus()
  }

  // ── Câmera: BarcodeDetector quando existe; senão jsQR (js/vendor, carregado no 1º uso) ──
  let camStream = null, camLoop = 0, detector = null
  function carregarJsQR() {
    if (window.jsQR) return Promise.resolve()
    return new Promise((ok, falha) => { const s = document.createElement('script'); s.src = '../js/vendor/jsqr-1.4.0.js'; s.onload = ok; s.onerror = () => falha(new Error('O leitor de QR não carregou.')); document.head.appendChild(s) })
  }
  async function iniciarCamera() {
    const U = S.invUi
    if (!U.local) { invErro('Escolha primeiro o local em que você está conferindo.'); $('pt-inv-local')?.focus(); return }
    if (!navigator.mediaDevices?.getUserMedia) { invErro('Este navegador não dá acesso à câmera. Digite o número da etiqueta.'); return }
    try {
      if ('BarcodeDetector' in window) {
        try { const f = await window.BarcodeDetector.getSupportedFormats(); if (f.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] }) } catch (e) { detector = null }
      }
      if (!detector) await carregarJsQR()
      if (!camStream) camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      const box = $('pt-inv-cam'), vid = $('pt-inv-video'); if (!box || !vid) return pararCamera()
      box.hidden = false; vid.srcObject = camStream; await vid.play().catch(() => {})
      U.cam = true
      const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true })
      let ult = 0
      const passo = async t => {
        if (!camStream || !U.cam) return
        camLoop = requestAnimationFrame(passo)
        if (t - ult < 220 || vid.readyState < 2 || U.alvo || U.fotoBem) return
        ult = t
        let txt = null
        try {
          if (detector) { const r = await detector.detect(vid); txt = r[0]?.rawValue || null }
          else {
            const w = Math.min(640, vid.videoWidth), h = Math.round(vid.videoHeight * w / vid.videoWidth)
            cv.width = w; cv.height = h; cx.drawImage(vid, 0, 0, w, h)
            const r = window.jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' }); txt = r?.data || null
          }
        } catch (e) { txt = null }
        if (!txt) return
        const num = (String(txt).toUpperCase().match(/PAT-\d+/) || [])[0]
        if (!num) { invErro('Este QR não é de uma etiqueta do patrimônio.'); return }
        if (navigator.vibrate) navigator.vibrate(60)
        invErro('')
        const it = S.inv.itens.find(i => i.numero === num) || S.bens.find(b => b.numero === num)
        U.alvo = it ? { bem_id: it.bem_id || it.id, metodo: 'qr' } : { numero: num, metodo: 'qr' }
        U.cond = null; renderAlvo()
      }
      camLoop = requestAnimationFrame(passo)
    } catch (e) {
      pararCamera()
      invErro(/NotAllowed|Permission/i.test(e?.name || e?.message || '') ? 'A câmera foi bloqueada. Libere o acesso à câmera para esta página nas configurações do navegador, ou digite o número.' : erroMsg(e))
    }
  }
  function pararCamera() {
    cancelAnimationFrame(camLoop); camLoop = 0
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null }
    if (S.invUi) S.invUi.cam = false
    const box = $('pt-inv-cam'); if (box) box.hidden = true
  }

  async function assinarInv() {
    const I = S.inv, senha = $('pt-inv-senha')?.value || ''
    if (!senha) { invErro('Digite a sua senha.'); $('pt-inv-senha')?.focus(); return }
    const bts = $('pt-inv').querySelectorAll('button'); bts.forEach(b => b.disabled = true)
    try {
      const { data: { session } } = await db.auth.getSession()
      const r = await fetch(SUPABASE_URL + '/functions/v1/patrimonio-termo', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || ''), apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ acao: 'assinar_inventario', inventario_id: I.inventario.id, hash: I.inventario.hash, senha }) })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) {
        const e = String(j.erro || '')
        if (e === 'SENHA_INVALIDA') invErro('Senha incorreta.')
        else if (e === 'SENHA_BLOQUEADA') invErro('Muitas tentativas com senha errada. Tente de novo depois de ' + dtHora(j.bloqueado_ate) + '.')
        else if (e.includes('DOCUMENTO_ALTERADO')) { toast('O resultado mudou desde que você abriu. Confira de novo.', 'warning'); await recarregarInventario() }
        else invErro(erroMsg(e))
        return
      }
      const x = j.resultado || {}
      toast(x.situacao === 'concluido' ? 'Inventário concluído: ' + x.conferidos + ' conferidos, ' + x.divergencias + ' divergências, ' + x.extravios + ' extravios registrados.'
        : 'Assinatura registrada. Faltam ' + x.faltam + '.', 'success')
      await carregar(); await recarregarInventario()
    } catch (e) { invErro(erroMsg(e)) } finally { bts.forEach(b => b.disabled = false); const s = $('pt-inv-senha'); if (s) s.value = '' }
  }
  async function enviarInv() {
    const c = invContagem(S.inv)
    const ok = await ptConfirmar({ titulo: 'Enviar para assinatura', ok: 'Enviar',
      texto: (c.pend ? c.pend + ' bem(ns) ainda não foram conferidos. Os que deviam estar no local viram ocorrência de extravio quando a comissão assinar. ' : '') +
        'Depois de enviar, a conferência fica travada; para mudar, é preciso reabrir (e todos assinam de novo).' })
    if (!ok) return
    try { await rpc('fn_pat_inv_enviar', { p_inv: S.inv.inventario.id }); pararCamera(); toast('Enviado. Cada membro da comissão assina com a senha.', 'success'); await carregar(); await recarregarInventario() }
    catch (e) { invErro(erroMsg(e)) }
  }
  function formReabrirInv() {
    abrirForm({ titulo: 'Reabrir a conferência', sub: S.inv.inventario.numero, botao: 'Reabrir',
      corpo: '<p class="pt-sub" style="font-size:13px">As assinaturas já feitas perdem efeito se o resultado mudar; todos assinam de novo.</p>' +
        '<div class="form-group"><label class="form-label" for="fri-m">Por que reabrir?</label><input class="form-control" id="fri-m" placeholder="ex.: faltou conferir o depósito"></div>',
      aoSalvar: async r => { await rpc('fn_pat_inv_reabrir', { p_inv: S.inv.inventario.id, p_motivo: val(r, '#fri-m') }); toast('Conferência reaberta.', 'success'); await carregar(); await recarregarInventario() } })
  }
  function formCancelarInv() {
    abrirForm({ titulo: 'Cancelar inventário', sub: S.inv.inventario.numero, botao: 'Cancelar inventário', perigo: true,
      corpo: '<p class="pt-sub" style="font-size:13px">Nada muda nos bens; o inventário fica registrado como cancelado e as tarefas da comissão são canceladas.</p>' +
        '<div class="form-group"><label class="form-label" for="fci-m">Motivo</label><input class="form-control" id="fci-m"></div>',
      aoSalvar: async r => { await rpc('fn_pat_inv_cancelar', { p_inv: S.inv.inventario.id, p_motivo: val(r, '#fci-m') }); pararCamera(); toast('Inventário cancelado.', 'success'); await carregar(); await recarregarInventario() } })
  }

  // Relatório de inventário (Pt6) — FolhaA4; também usado pela aba Relatórios
  function imprimirInventario() {
    const I = S.inv; if (!I || typeof FolhaA4 === 'undefined') return
    const w = FolhaA4.janela()
    FolhaA4.escrever(w, { titulo: 'Relatório de inventário ' + I.inventario.numero, selo: 'Patrimônio', tema: 'patrimonio', paisagem: true,
      corpo: PatRel.inventario(I), nomeArquivo: 'inventario-' + I.inventario.numero })
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
        campo('Local', esc(b.local_nome)) + campo('Responsável pela guarda', b.responsavel_nome
          ? esc(b.responsavel_nome) + (b.termo_vigente ? ' · <button type="button" class="pt-link" data-acao="termo-num" data-num="' + esc(b.termo_vigente) + '">' + esc(b.termo_vigente) + '</button>' : '')
          : '<span class="pt-nada">ninguém (em estoque)</span>') +
        (b.devolver_ate ? campo('Devolver até', '<span class="' + (b.devolver_ate < hoje() ? 'pt-pill er' : '') + '">' + dt(b.devolver_ate) + '</span>') : '') +
        (b.ocorrencia_aberta ? campo('Ocorrência aberta', '<button type="button" class="pt-link" data-acao="oc-num" data-num="' + esc(b.ocorrencia_aberta) + '">' + esc(b.ocorrencia_aberta) + '</button>') : '') +
        (b.baixa_pendente ? campo('Pedido de baixa', '<button type="button" class="pt-link" data-acao="bx-num" data-num="' + esc(b.baixa_pendente) + '">' + esc(b.baixa_pendente) + '</button> aguardando aprovação') : '') +
        (b.termo_pendente ? campo('Termo pendente', '<button type="button" class="pt-link" data-acao="termo-num" data-num="' + esc(b.termo_pendente) + '">' + esc(b.termo_pendente) + '</button> aguardando aceite') : '') +
        campo('Situação', esc(SIT[b.situacao])) + campo('Condição', esc(COND[b.condicao])) +
        campo('Último inventário', b.ultimo_inventario_em ? dt(b.ultimo_inventario_em) : '') + campo('Titularidade', esc(TIT[b.titularidade] || b.titularidade)) +
      '</div>' +
      (G ? barraMov(b) : '') +
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
    const doSlot = k => S.docs.find(d => d.tipo === 'foto' && d.slot === k)
    const soltas = S.docs.filter(d => d.tipo === 'foto' && !d.slot && !d.ocorrencia_id && !d.baixa_id)
    const deOc = S.docs.filter(d => d.tipo === 'foto' && (d.ocorrencia_id || d.baixa_id))
    const outros = S.docs.filter(d => d.tipo !== 'foto')
    const pode = ativo(b) && (G || b.responsavel_id === S.eu)
    return '<div class="pt-sec">' + ptIc('camera', 'p') + 'Fotos do bem<span class="pt-sub">' + (['frente', 'placa', 'detalhe'].filter(doSlot).length) + ' de 3</span></div>' +
      '<div class="pt-fslots">' + ['frente', 'placa', 'detalhe'].map(k => { const d = doSlot(k)
        return fotoSlot(k, d?.url, 'data-ffoto="' + k + '"', { editar: pode, exigir: true,
          extra: d ? '<span class="pt-fslot-a"><button type="button" class="pt-link" data-acao="foto" data-url="' + esc(d.url) + '">Ampliar</button>' +
            (G && k !== 'frente' ? ' · <button type="button" class="pt-link" data-acao="rm-doc" data-id="' + esc(d.id) + '">Tirar</button>' : '') + '</span>' : '' }) }).join('') + '</div>' +
      (pode ? '<p class="pt-sub" style="margin-top:6px">Clique numa posição para tirar ou trocar a foto. A foto antiga sai do quadro, mas fica guardada no histórico. A de frente não pode ficar vazia.</p>' : '') +
      (soltas.length ? '<div class="pt-sub" style="margin-top:10px">Fotos anteriores ao quadro</div><div class="pt-fotos">' + soltas.map(f => '<div class="pt-foto"><img alt="Foto do bem ' + esc(b.numero) + '" data-arquivo-src="' + esc(f.url) + '" data-acao="foto" data-url="' + esc(f.url) + '">' +
        (G ? '<button type="button" class="rm" data-acao="rm-doc" data-id="' + esc(f.id) + '" aria-label="Tirar foto">' + ptIc('x', 'p') + '</button>' : '') + '</div>').join('') + '</div>' : '') +
      (deOc.length ? '<div class="pt-sub" style="margin-top:10px">Fotos de ocorrências e baixas</div><div class="pt-fotos">' + deOc.map(f => '<div class="pt-foto"><img alt="Foto de ocorrência" data-arquivo-src="' + esc(f.url) + '" data-acao="foto" data-url="' + esc(f.url) + '"></div>').join('') + '</div>' : '') +
      '<div class="pt-sec">' + ptIc('doc', 'p') + 'Documentos</div>' +
      (outros.length ? outros.map(d => '<div class="pt-doc">' + ptIc('doc', 'p') + '<span class="t"><a href="#" data-arquivo="' + esc(d.url) + '">' + esc(d.nome) + '</a>' +
        '<div class="pt-sub">' + esc(DOC_TIPO[d.tipo] || d.tipo) + ' · ' + dtHora(d.enviado_em) + '</div></span>' +
        (G ? '<button type="button" class="pt-btn peq" data-acao="rm-doc" data-id="' + esc(d.id) + '">Tirar</button>' : '') + '</div>').join('')
        : '<p class="pt-sub">Nenhum documento além da nota fiscal (que fica na aba Dados).</p>') +
      (G ? '<div class="pt-envio"><select class="form-control" id="pt-doc-tipo" aria-label="Tipo do arquivo">' +
        Object.keys(DOC_TIPO).filter(k => k !== 'foto').map(k => '<option value="' + k + '">' + DOC_TIPO[k] + '</option>').join('') + '</select>' +
        '<button type="button" class="pt-btn pri" data-acao="enviar-doc">' + ptIc('upload', 'p') + 'Enviar arquivo</button>' +
        '<input type="file" id="pt-doc-arq" accept="image/*,application/pdf" multiple hidden>' +
        '<span class="pt-sub">Laudo, garantia, manual (PDF ou imagem), até 20 MB. As fotos do bem ficam no quadro acima. Arquivo enviado não se apaga: “Tirar” só esconde e registra o motivo.</span></div>' : '')
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
    else if (['distribuicao', 'transferencia_interna', 'emprestimo'].includes(e.tipo)) {
      if (d.so_local) partes.push('local: ' + (e.local_de_nome || '—') + ' → ' + (e.local_para_nome || '—'))
      else {
        if (e.responsavel_de_nome) partes.push('de ' + e.responsavel_de_nome)
        if (e.responsavel_para_nome) partes.push('para ' + e.responsavel_para_nome)
        if (e.local_para_nome) partes.push('local: ' + e.local_para_nome)
        if (d.termo) partes.push('termo ' + d.termo)
        if (d.devolver_ate) partes.push('devolver até ' + dt(d.devolver_ate))
        if (d.inicio_uso_no_aceite) partes.push('início de uso no aceite')
      }
    } else if (e.tipo === 'devolucao') {
      if (e.responsavel_de_nome) partes.push('devolvido por ' + e.responsavel_de_nome)
      if (e.local_para_nome) partes.push('guardado em ' + e.local_para_nome)
      if (e.condicao_de !== e.condicao_para) partes.push((COND[e.condicao_de] || e.condicao_de) + ' → ' + (COND[e.condicao_para] || e.condicao_para))
    } else if (e.tipo === 'ocorrencia') {
      if (d.ocorrencia) partes.push(d.ocorrencia)
      if (d.tipo) partes.push(OC_TIPO[d.tipo] || d.tipo)
      if (d.desfecho) partes.push('desfecho: ' + (OC_DESF[d.desfecho] || d.desfecho))
      if (d.bo) partes.push('BO ' + d.bo)
      if (d.valor_brl != null) partes.push(brl(d.valor_brl))
      if (d.situacao_antes && d.situacao_depois && d.situacao_antes !== d.situacao_depois) partes.push((SIT[d.situacao_antes] || d.situacao_antes) + ' → ' + (SIT[d.situacao_depois] || d.situacao_depois))
      if (e.condicao_de !== e.condicao_para) partes.push((COND[e.condicao_de] || e.condicao_de) + ' → ' + (COND[e.condicao_para] || e.condicao_para))
    } else if (e.tipo === 'baixa') {
      if (d.baixa) partes.push(d.baixa)
      if (d.motivo) partes.push(BX_MOT[d.motivo] || d.motivo)
      if (d.destino) partes.push('para ' + d.destino)
    } else if (e.tipo === 'manutencao_saida') {
      if (d.prestador) partes.push(d.prestador)
      if (d.previsao) partes.push('previsão ' + dt(d.previsao))
    } else if (e.tipo === 'manutencao_retorno') {
      if (d.prestador) partes.push(d.prestador)
      partes.push('condição ' + (COND[e.condicao_para] || e.condicao_para))
      if (d.custo_brl != null) partes.push('custo ' + brl(d.custo_brl))
    }
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
  // Toda foto é refeita no navegador (≤ 1600 px, JPEG): fica leve e perde os dados escondidos do
  // arquivo (GPS, aparelho, data). Formato que o navegador não lê (ex.: HEIC fora do iPhone) é recusado.
  async function reduzirImagem(f) {
    if (!/^image\//.test(f.type || '')) return f
    try {
      const bmp = await createImageBitmap(f)
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85))
      if (!blob) throw new Error('sem imagem')
      return new File([blob], (f.name || 'foto').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
    } catch (e) { throw new Error('PAT_ARQUIVO: não foi possível ler esta foto. Use JPG ou PNG (ou tire a foto pela câmera).') }
  }
  // quadro de fotos: cada posição é um <label> com o seletor de arquivo (no celular abre câmera ou galeria)
  function fotoSlot(slot, src, attrs, opt) {
    opt = opt || {}
    const img = src ? (opt.local ? '<img alt="" src="' + esc(src) + '">' : '<img alt="" data-arquivo-src="' + esc(src) + '">') : ''
    return '<div class="pt-fslot' + (src ? ' tem' : '') + (slot === 'frente' && !src && opt.exigir ? ' falta' : '') + '">' +
      (opt.editar ? '<label class="pt-fslot-c">' : '<div class="pt-fslot-c">') +
        (img || '<span class="vz">' + ptIc('camera') + '<span>' + (opt.editar ? 'Tirar ou escolher' : 'Sem foto') + '</span></span>') +
        (opt.editar ? '<input type="file" accept="image/*" class="pt-fin" aria-label="' + esc((FOTO_SLOT[slot] || 'Foto') + ': tirar ou escolher foto') + '" ' + attrs + '></label>' : '</div>') +
      '<div class="pt-fslot-t"><b>' + esc(FOTO_SLOT[slot] || slot) + (slot === 'frente' && opt.exigir ? ' *' : '') + '</b><span>' + esc(FOTO_DICA[slot] || '') + '</span>' +
      (opt.extra || '') + '</div></div>'
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
  // foto numa posição do quadro (ficha ou inventário)
  async function definirFoto(bemId, slot, f0) {
    const f = await reduzirImagem(f0)
    const url = await enviarArquivo('bens/' + bemId + '/' + slot + '-' + Date.now() + '.jpg', f)
    await rpc('fn_pat_foto_definir', { p_bem: bemId, p_slot: slot, p_url: url, p_nome: f0.name || (slot + '.jpg'), p_tamanho: f.size })
  }
  document.addEventListener('change', async e => {
    const t = e.target
    if (t.matches && t.matches('input[data-ffoto]') && t.files[0] && S.ficha) {
      const slot = t.dataset.ffoto, box = t.closest('.pt-fslot'); if (box) box.classList.add('enviando')
      try { await definirFoto(S.ficha.id, slot, t.files[0]); toast('Foto (' + FOTO_SLOT[slot].toLowerCase() + ') salva.', 'success'); S.fichaAba = 'arquivos'; await recarregarFicha(); await carregar() }
      catch (er) { toast(erroMsg(er), 'error'); if (box) box.classList.remove('enviando') }
    }
  })
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
  const novoItem = () => ({ categoria: '', descricao: '', marca: '', modelo: '', quantidade: '1', valor: '', series: '', garantia: '', especificacao: '', fotos: {} })
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
    soltarPrevias(INC); INC = null; ptFechar('pt-inc')
  }
  function soltarPrevias(I) { (I?.itens || []).forEach(it => Object.values(it.fotos || {}).forEach(f => { try { URL.revokeObjectURL(f.prev) } catch (e) {} })) }
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
          '<div class="form-label" style="margin-top:10px">Fotos do bem <span class="pt-sub">— a de frente é obrigatória' +
            ((Number(it.quantidade) || 1) > 1 && !lote ? '; valem para todas as unidades deste item (depois dá para trocar na ficha de cada uma)' : '') + '</span></div>' +
          '<div class="pt-fslots">' + ['frente', 'placa', 'detalhe'].map(k => fotoSlot(k, it.fotos[k]?.prev, 'data-ifoto="' + k + '" data-i="' + i + '"',
            { editar: true, exigir: true, local: true,
              extra: it.fotos[k] ? '<span class="pt-fslot-a"><button type="button" class="pt-link" data-acao="inc-foto-rm" data-i="' + i + '" data-slot="' + k + '">Tirar</button></span>' : '' })).join('') + '</div>' +
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
    if (t.dataset.ifoto && t.files[0]) {
      const it = INC.itens[Number(t.dataset.i)], slot = t.dataset.ifoto, f0 = t.files[0]
      reduzirImagem(f0).then(f => {
        if (!INC || !INC.itens.includes(it)) return
        if (it.fotos[slot]) { try { URL.revokeObjectURL(it.fotos[slot].prev) } catch (e) {} }
        it.fotos[slot] = { file: f, nome: f0.name, prev: URL.createObjectURL(f), url: '' }; INC.sujo = true; renderIncorporar()
      }).catch(er => toast(erroMsg(er), 'error'))
    }
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
      if (!it.fotos.frente) return erro('Item ' + (i + 1) + ' (' + it.descricao.trim() + '): falta a foto de frente.')
      itens.push({ _it: it, categoria: c.codigo, descricao: it.descricao.trim(), marca: it.marca, modelo: it.modelo, quantidade: Number(it.quantidade) || 1,
        valor_total: v, numeros_serie: series, garantia_ate: it.garantia, especificacao: it.especificacao })
    }
    const btn = $('inc-ok'); I.enviando = true; btn.disabled = true; btn.textContent = 'Incorporando…'
    try {
      if (I.nf.arquivo && !I.nf.url) I.nf.url = await enviarArquivo('incorporacoes/' + I.id + '/nf-' + Date.now() + '.pdf', I.nf.arquivo)
      btn.textContent = 'Enviando fotos…'
      for (const [i, x] of itens.entries()) {
        x.fotos = []
        for (const k of ['frente', 'placa', 'detalhe']) {
          const ft = x._it.fotos[k]; if (!ft) continue
          if (!ft.url) ft.url = await enviarArquivo('incorporacoes/' + I.id + '/fotos/' + (i + 1) + '-' + k + '-' + Date.now() + '.jpg', ft.file)
          x.fotos.push({ slot: k, url: ft.url, nome: ft.nome, tamanho: ft.file.size })
        }
        delete x._it
      }
      btn.textContent = 'Incorporando…'
      const r = await rpc('fn_pat_incorporar', { p: {
        id: I.id, origem: I.origem, contrato_produto_id: compra ? I.produto : null, origem_detalhe: compra ? null : I.origem_detalhe,
        nf_numero: I.nf.numero, nf_data: I.nf.data, nf_url: I.nf.url || null, nf_nome: I.nf.arquivo?.name || null,
        dt_aquisicao: I.dt_aquisicao, dt_inicio_uso: I.dt_inicio_uso, local_id: I.local, titularidade: I.titularidade,
        justificativa_diferenca: compra && I.justificar ? I.justificativa : null, itens } })
      const novos = (r.bens || []).map(x => x.id)
      soltarPrevias(INC); INC = null; ptFechar('pt-inc')
      toast((r.bens || []).length + ' bem(ns) incorporado(s): ' + (r.bens || []).map(x => x.numero).join(', ') +
        (r.concluida ? '. A tarefa do contrato foi concluída.' : r.restante > 0 ? '. Ainda falta ' + fmtBRL(r.restante) + ' do produto.' : ''), 'success')
      await carregar()
      if (novos.length && await ptConfirmar({ titulo: 'Imprimir as placas?', texto: 'Cada bem novo recebe uma placa adesiva com o número e um QR que abre a ficha.', ok: 'Escolher folha' })) formEtiquetas(novos)
    } catch (e) {
      erro(erroMsg(e))
    } finally {
      if (INC) { INC.enviando = false; const b = $('inc-ok'); if (b) { b.disabled = false; b.innerHTML = ptIc('check', 'p') + 'Incorporar' } }
    }
  }

  // ── Placas e etiquetas com QR (folha A4 adesiva) ──────────────────────────
  // Exceção ao molde FolhaA4: folha adesiva não leva cabeçalho/rodapé (CLAUDE.md, Patrimônio).
  // Medidas em mm a partir do canto da folha (impressão em tamanho real, margem 0). Modelos pré-cortados
  // seguem as medidas publicadas (Avery L7165/L7160 e equivalentes); "personalizada" aceita qualquer folha.
  const ETQ = {
    placa_6x8: { nome: 'Placa 6 × 8 cm em pé — folha adesiva A4 inteira, 9 por folha (corte nas marcas)', w: 60, h: 80, cols: 3, rows: 3, mt: 28.5, ml: 15, gx: 0, gy: 0, corte: true },
    placa_8x6: { nome: 'Placa 8 × 6 cm deitada — folha adesiva A4 inteira, 8 por folha (corte nas marcas)', w: 80, h: 60, cols: 2, rows: 4, mt: 28.5, ml: 25, gx: 0, gy: 0, corte: true },
    pre_99x67: { nome: 'Etiqueta pré-cortada 99,1 × 67,7 mm, 8 por folha (Avery L7165 e equivalentes) — placa 8 × 6 cm no centro', w: 99.1, h: 67.7, cols: 2, rows: 4, mt: 13.1, ml: 4.65, gx: 2.5, gy: 0, placa: { w: 80, h: 60 } },
    pequena: { nome: 'Etiqueta pequena 63,5 × 38,1 mm, 21 por folha (Avery L7160 e equivalentes) — para bens pequenos', w: 63.5, h: 38.1, cols: 3, rows: 7, mt: 15.15, ml: 7.25, gx: 2.5, gy: 0 },
    personalizada: { nome: 'Outra folha (informar as medidas da embalagem)' },
  }
  const ETQ_PADRAO = { modelo: 'placa_6x8', w: 60, h: 80, cols: 3, rows: 3, mt: 28.5, ml: 15, gx: 0, gy: 0 }
  function etqPref() { try { return Object.assign({}, ETQ_PADRAO, JSON.parse(localStorage.getItem('pat_etiqueta') || '{}')) } catch (e) { return Object.assign({}, ETQ_PADRAO) } }
  function etqModelo(pref) {
    if (pref.modelo !== 'personalizada' && ETQ[pref.modelo]) return Object.assign({ id: pref.modelo }, ETQ[pref.modelo])
    const m = { id: 'personalizada', nome: 'Folha personalizada' }
    ;['w', 'h', 'cols', 'rows', 'mt', 'ml', 'gx', 'gy'].forEach(k => { m[k] = Number(pref[k]) || 0 })
    return m
  }
  // desenho: em pé (alta), deitada (larga) ou pequena, pela área útil da placa
  const etqDesenho = m => { const a = m.placa || m; return a.h >= a.w * 1.15 && a.w >= 45 ? 'pe' : (a.w >= 70 && a.h >= 50 ? 'deitada' : 'pequena') }
  function etqConferir(m) {
    if (!(m.w > 10 && m.h > 10 && m.cols >= 1 && m.rows >= 1)) return 'Informe largura, altura, colunas e linhas.'
    const larg = m.ml + m.cols * m.w + (m.cols - 1) * m.gx, alt = m.mt + m.rows * m.h + (m.rows - 1) * m.gy
    if (larg > 210.5 || alt > 297.5) return 'As medidas passam do A4 (' + fmtNum(larg) + ' × ' + fmtNum(alt) + ' mm de 210 × 297).'
    return ''
  }

  function formEtiquetas(ids) {
    const lista = ids.map(id => S.bens.find(b => b.id === id)).filter(Boolean)
    if (!lista.length) { toast('Marque os bens na lista (caixa à esquerda) para imprimir as etiquetas.', 'warning'); return }
    const pref = etqPref()
    const num = (id, rot, v, dica) => '<div class="form-group"><label class="form-label" for="' + id + '">' + rot + '</label><input class="form-control mono" inputmode="decimal" id="' + id + '" value="' + esc(String(v).replace('.', ',')) + '">' + (dica ? '<div class="pt-dica">' + dica + '</div>' : '') + '</div>'
    abrirForm({
      titulo: 'Placas de patrimônio', sub: lista.length + ' placa' + (lista.length > 1 ? 's' : '') + ' com QR', botao: 'Abrir para imprimir',
      corpo: '<div class="form-group"><label class="form-label" for="fq-mod">Folha</label><select class="form-control" id="fq-mod">' +
          Object.keys(ETQ).map(k => '<option value="' + k + '"' + (pref.modelo === k ? ' selected' : '') + '>' + esc(ETQ[k].nome) + '</option>').join('') + '</select></div>' +
        '<div id="fq-pers"' + (pref.modelo === 'personalizada' ? '' : ' hidden') + '><div class="pt-dica" style="margin-bottom:8px">' + ptIc('info', 'p') + 'Medidas em milímetros, como estão na embalagem da folha. Margens contadas a partir da borda do papel.</div>' +
          '<div class="pt-g3">' + num('fq-w', 'Largura da etiqueta', pref.w) + num('fq-h', 'Altura da etiqueta', pref.h) + num('fq-cols', 'Colunas', pref.cols) +
          num('fq-rows', 'Linhas', pref.rows) + num('fq-mt', 'Margem de cima', pref.mt) + num('fq-ml', 'Margem da esquerda', pref.ml) +
          num('fq-gx', 'Espaço entre colunas', pref.gx) + num('fq-gy', 'Espaço entre linhas', pref.gy) + '</div></div>' +
        '<div class="pt-g2"><div class="form-group"><label class="form-label" for="fq-ini">Começar na posição</label><input class="form-control mono" type="number" min="1" id="fq-ini" value="1">' +
          '<div class="pt-dica" id="fq-ini-d"></div></div>' +
        '<div class="form-group"><span class="form-label">Opções</span>' +
          '<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="fq-teste"> Folha de teste: só os contornos, em papel comum</label>' +
          '<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:6px"><input type="checkbox" id="fq-cont"> Contorno fino em volta de cada placa</label></div></div>' +
        '<div class="pt-aviso-f in">' + ptIc('info', 'p') + '<span>Imprima em <b>tamanho real (100%)</b>, sem "ajustar à página". Antes de usar a folha adesiva, imprima a folha de teste em papel comum, ' +
          'sobreponha à folha de etiquetas contra a luz e confira o alinhamento. Para bem que vai a campo, prefira <b>vinil adesivo</b> (resiste a água e sol). ' +
          'O QR leva só ao endereço da ficha (com login); não há valor nem nome de pessoa na placa.</span></div>',
      aoSalvar: async r => {
        const p = { modelo: val(r, '#fq-mod') }
        if (p.modelo === 'personalizada') ['w', 'h', 'cols', 'rows', 'mt', 'ml', 'gx', 'gy'].forEach(k => { p[k] = parseValor(val(r, '#fq-' + k)) || 0 })
        const m = etqModelo(Object.assign({}, etqPref(), p)), erroM = etqConferir(m)
        if (erroM) throw new Error('PAT_DADOS: ' + erroM)
        try { localStorage.setItem('pat_etiqueta', JSON.stringify(Object.assign(etqPref(), p))) } catch (e) {}
        const porFolha = m.cols * m.rows
        abrirEtiquetas(lista, Math.min(porFolha, Math.max(1, Number(val(r, '#fq-ini')) || 1)), m, { teste: $('fq-teste').checked, contorno: $('fq-cont').checked })
      },
    })
    const sel = $('fq-mod'), dica = () => { const pp = Object.assign(etqPref(), { modelo: sel.value }); const m = etqModelo(pp)
      $('fq-pers').hidden = sel.value !== 'personalizada'
      $('fq-ini-d').textContent = m.cols && m.rows ? 'Esta folha tem ' + (m.cols * m.rows) + ' posições, da esquerda para a direita, de cima para baixo. Use para aproveitar uma folha já começada.' : '' }
    sel.onchange = dica; dica()
  }

  function abrirEtiquetas(lista, inicio, m, op) {
    m = m || etqModelo(etqPref()); op = op || {}
    const w = window.open('', '_blank')
    if (!w) { toast('O navegador bloqueou a nova aba. Permita janelas deste site.', 'warning'); return }
    const base = new URL('patrimonio.html', location.href).href
    const des = etqDesenho(m), area = m.placa || { w: m.w, h: m.h }
    const L = typeof DimaLogos !== 'undefined' ? DimaLogos.agora() : null
    const logos = (L?.topo || []).map(l => { const e = DimaLogos.escolher(l, 'claro'); return e.src ? '<img class="lg" alt="' + esc(l.alt) + '" src="' + esc(DimaLogos.url(e.src)) + '">' : '' }).join('')
    const placa = b => {
      const q = qrcode(0, 'M'); q.addData(base + '?bem=' + encodeURIComponent(b.numero)); q.make()
      const qr = '<img class="qr" alt="" src="' + q.createDataURL(6, 0) + '">'
      const desc = '<div class="d">' + esc(b.descricao) + (b.quantidade > 1 ? ' (lote de ' + b.quantidade + ')' : '') + '</div>' + (b.numero_serie ? '<div class="s">S/N ' + esc(b.numero_serie) + '</div>' : '')
      const rod = '<div class="p">SEMA/AC · Fundo Brasil-ONU</div>'
      if (des === 'pequena') return '<div class="pl pq">' + qr + '<div class="tx"><div class="k">PATRIMÔNIO</div><div class="n">' + esc(b.numero) + '</div>' + desc + rod + '</div></div>'
      if (des === 'deitada') return '<div class="pl dt"><div class="cab">' + (logos ? '<span class="lgs">' + logos + '</span>' : '') + '<span class="k">PATRIMÔNIO</span></div>' +
        '<div class="corpo">' + qr + '<div class="tx"><div class="n">' + esc(b.numero) + '</div>' + desc + '</div></div><div class="rp">' + rod + '<div class="nr">Bem público · não remover esta placa</div></div></div>'
      return '<div class="pl pe"><div class="cab">' + (logos ? '<span class="lgs">' + logos + '</span>' : '') + '<span class="k">PATRIMÔNIO</span></div>' + qr +
        '<div class="n">' + esc(b.numero) + '</div>' + desc + '<div class="rp">' + rod + '<div class="nr">Bem público · não remover esta placa</div></div></div>'
    }
    const por = m.cols * m.rows
    const itens = op.teste ? Array(por).fill('') : Array(inicio - 1).fill(null).concat(lista.map(placa))
    const px = n => (Math.round(n * 100) / 100) + 'mm'
    const folhas = []
    for (let f = 0; f < itens.length; f += por) {
      let h = ''
      itens.slice(f, f + por).forEach((cel, k) => {
        const c = k % m.cols, l = Math.floor(k / m.cols)
        const x = m.ml + c * (m.w + m.gx), y = m.mt + l * (m.h + m.gy)
        h += '<div class="cel' + (op.teste || op.contorno ? ' cont' : '') + '" style="left:' + px(x) + ';top:' + px(y) + ';width:' + px(m.w) + ';height:' + px(m.h) + '">' +
          (cel ? '<div class="area" style="width:' + px(area.w) + ';height:' + px(area.h) + '">' + cel + '</div>' : (op.teste ? '<span class="tst">' + (k + 1) + '<br>' + fmtNum(m.w) + ' × ' + fmtNum(m.h) + ' mm</span>' : '')) + '</div>'
      })
      if (m.corte || op.teste) {   // marcas de corte nas margens, alinhadas às bordas das placas
        const xs = new Set(), ys = new Set()
        for (let c = 0; c < m.cols; c++) { xs.add(m.ml + c * (m.w + m.gx)); xs.add(m.ml + c * (m.w + m.gx) + m.w) }
        for (let l = 0; l < m.rows; l++) { ys.add(m.mt + l * (m.h + m.gy)); ys.add(m.mt + l * (m.h + m.gy) + m.h) }
        const topo = m.mt, base2 = m.mt + m.rows * m.h + (m.rows - 1) * m.gy, esq = m.ml, dir = m.ml + m.cols * m.w + (m.cols - 1) * m.gx
        xs.forEach(x => { if (topo > 4) h += '<i class="mc v" style="left:' + px(x) + ';top:' + px(Math.max(0, topo - 7)) + ';height:' + px(Math.min(6, topo - 1)) + '"></i>'
          if (297 - base2 > 4) h += '<i class="mc v" style="left:' + px(x) + ';top:' + px(base2 + 1) + ';height:' + px(Math.min(6, 297 - base2 - 1)) + '"></i>' })
        ys.forEach(y => { if (esq > 4) h += '<i class="mc h" style="top:' + px(y) + ';left:' + px(Math.max(0, esq - 7)) + ';width:' + px(Math.min(6, esq - 1)) + '"></i>'
          if (210 - dir > 4) h += '<i class="mc h" style="top:' + px(y) + ';left:' + px(dir + 1) + ';width:' + px(Math.min(6, 210 - dir - 1)) + '"></i>' })
      }
      folhas.push('<div class="folha">' + h + '</div>')
    }
    const nTxt = op.teste ? 'Folha de teste (só contornos) · ' : lista.length + ' placa(s) · '
    w.document.open()
    w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="author" content="Erisson Cameli Santiago"><title>Placas de patrimônio</title><style>' +
      '@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#e9edea;font-family:"DM Sans",Arial,sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.barra{position:sticky;top:0;z-index:2;background:#1D5A3C;color:#fff;padding:10px 16px;display:flex;gap:12px;align-items:center;font-size:13px;flex-wrap:wrap}' +
      '.barra button{background:#fff;color:#1D5A3C;border:0;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer}' +
      '.folha{position:relative;width:210mm;height:297mm;margin:12px auto;background:#fff;overflow:hidden;page-break-after:always;break-after:page}' +
      '.cel{position:absolute;display:flex;align-items:center;justify-content:center;overflow:hidden}.cel.cont{outline:.2mm solid #9aa59f;outline-offset:-.1mm}' +
      '.tst{font-size:9pt;color:#777;text-align:center;font-family:"DM Mono",monospace}' +
      '.mc{position:absolute;background:#000}.mc.v{width:.2mm}.mc.h{height:.2mm}' +
      '.area{display:flex}.pl{width:100%;height:100%;overflow:hidden}' +
      '.k{font-size:6.5pt;letter-spacing:.14em;font-weight:700;color:#1D5A3C}.n{font-family:"DM Mono",monospace;font-weight:700;letter-spacing:-.02em}' +
      '.d{line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.s{font-family:"DM Mono",monospace;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.p{color:#444}.nr{color:#666}' +
      '.qr{image-rendering:pixelated;flex-shrink:0}.lgs{display:flex;gap:1.5mm;align-items:center}.lg{height:5.5mm;width:auto;max-width:22mm;object-fit:contain}' +
      '.pe{display:flex;flex-direction:column;align-items:center;text-align:center;padding:3.5mm 3.5mm 3mm;gap:1.2mm}' +
      '.pe .cab{display:flex;justify-content:space-between;align-items:center;width:100%;gap:2mm}.pe .qr{width:38mm;height:38mm;margin-top:.5mm}' +
      '.pe .n{font-size:15pt}.pe .d{font-size:7.5pt}.pe .s{font-size:6.5pt;max-width:100%}.pe .rp{margin-top:auto;display:flex;flex-direction:column;align-items:center;gap:.3mm}.pe .p{font-size:6pt}.pe .nr{font-size:5.5pt}' +
      '.dt{display:flex;flex-direction:column;padding:3mm 3.5mm 2.5mm;gap:1.5mm}.dt .cab{display:flex;justify-content:space-between;align-items:center;gap:2mm}' +
      '.dt .corpo{display:flex;gap:3mm;align-items:center;flex:1;min-height:0}.dt .qr{width:34mm;height:34mm}.dt .tx{min-width:0;display:flex;flex-direction:column;gap:1.2mm}' +
      '.dt .n{font-size:14pt}.dt .d{font-size:7.5pt}.dt .s{font-size:6.5pt}.dt .rp{display:flex;justify-content:space-between;align-items:baseline;gap:2mm}.dt .p{font-size:6pt}.dt .nr{font-size:5.5pt}' +
      '.pq{display:flex;gap:2.5mm;align-items:center;padding:2.5mm 3mm}.pq .qr{width:26mm;height:26mm}.pq .tx{min-width:0;display:flex;flex-direction:column;gap:.6mm}' +
      '.pq .n{font-size:12pt}.pq .d{font-size:7pt}.pq .s{font-size:6.5pt}.pq .p{font-size:6pt}' +
      '@media print{body{background:#fff}.barra{display:none}.folha{margin:0}}' +
      '</style></head><body><div class="barra"><button type="button" onclick="print()">Imprimir</button><span>' + nTxt + esc(m.nome) + ' · imprima em tamanho real (100%), sem ajustar à página.</span></div>' +
      folhas.join('') + '</body></html>')
    w.document.close()
  }

  // ── Fase 2: guarda e movimentação ─────────────────────────────────────────
  function barraMov(b) {
    if (!ativo(b)) return ''
    if (b.situacao === 'extraviado') {
      const bt = (a, ic, t) => '<button type="button" class="pt-btn peq" data-acao="' + a + '">' + ptIc(ic, 'p') + t + '</button>'
      return '<div class="pt-mov"><span>Bem extraviado</span>' + (b.ocorrencia_aberta ? bt('oc-num-ficha', 'alerta', 'Abrir a ocorrência') : '') +
        (!b.baixa_pendente ? bt('baixa-um', 'lixo', 'Pedir baixa') : '') + '</div>'
    }
    const livre = ['em_estoque', 'em_uso'].includes(b.situacao) && !b.termo_pendente
    const bt = (a, ic, t) => '<button type="button" class="pt-btn peq" data-acao="' + a + '">' + ptIc(ic, 'p') + t + '</button>'
    return '<div class="pt-mov"><span>Movimentar</span>' +
      (livre ? bt('termo-um', 'assina', b.responsavel_id ? 'Transferir com termo' : 'Entregar com termo') + bt('emprestar-um', 'relogio', 'Emprestar') : '') +
      (b.responsavel_id && ['em_uso', 'emprestado'].includes(b.situacao) && !b.termo_pendente ? bt('devolver-um', 'desfazer', 'Registrar devolução') : '') +
      (['em_estoque', 'em_uso', 'emprestado'].includes(b.situacao) && !b.termo_pendente ? bt('local-um', 'local', 'Mudar de local') : '') +
      (livre ? bt('manut-saida', 'ferramenta', 'Mandar para manutenção') : '') +
      (b.situacao === 'em_manutencao' ? bt('manut-volta', 'check', 'Registrar volta da manutenção') : '') +
      bt('ocorrencia-um', 'alerta', 'Registrar ocorrência') +
      (['em_estoque', 'extraviado'].includes(b.situacao) && !b.baixa_pendente ? bt('baixa-um', 'lixo', 'Pedir baixa') : '') +
      (b.termo_pendente ? '<span class="pt-sub" style="font-weight:400">Bem no termo ' + esc(b.termo_pendente) + ': aguarde o aceite ou cancele o termo.</span>' : '') +
      '</div>'
  }
  const optLocais = sel => '<option value="">Escolha…</option>' + S.locais.filter(l => l.ativo).map(l =>
    '<option value="' + esc(l.id) + '"' + (sel === l.id ? ' selected' : '') + '>' + esc(l.nome) + '</option>').join('')
  const bensDe = ids => ids.map(id => S.bens.find(b => b.id === id)).filter(Boolean)
  const tabelaBens = (lista, extra) => '<div class="pt-lista-bens"><table class="pt-mini"><thead><tr><th>Nº</th><th>Bem</th><th>Hoje</th>' + (extra ? '<th>' + extra.tit + '</th>' : '') +
    '</tr></thead><tbody>' + lista.map(b => '<tr><td class="mono">' + esc(b.numero) + '</td><td>' + esc(b.descricao) + (b.numero_serie ? '<div class="pt-sub">S/N ' + esc(b.numero_serie) + '</div>' : '') +
    '</td><td>' + esc(b.responsavel_nome || 'em estoque') + '<div class="pt-sub">' + esc(b.local_nome || '') + '</div></td>' + (extra ? '<td>' + extra.cel(b) + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>'

  function formTermo(ids, tipo) {
    const lista = bensDe(ids), recusa = lista.filter(b => !['em_estoque', 'em_uso'].includes(b.situacao) || b.termo_pendente)
    if (!lista.length) { toast('Escolha os bens.', 'warning'); return }
    if (recusa.length) { toast('Fora do termo: ' + recusa.map(b => b.numero).join(', ') + ' (emprestado, em manutenção ou já em termo pendente).', 'warning'); return }
    const emp = tipo === 'emprestimo'
    const lim = new Date(); lim.setDate(lim.getDate() + 30)
    abrirForm({
      titulo: emp ? 'Emprestar bens' : 'Entregar bens com termo', botao: 'Enviar para aceite',
      sub: lista.length + ' bem(ns). O responsável recebe uma tarefa e aceita com a senha; só então o bem muda de mãos.',
      corpo: '<div class="pt-radio" role="radiogroup" aria-label="Tipo de termo">' +
          '<label><input type="radio" name="ft-tipo" value="responsabilidade"' + (emp ? '' : ' checked') + '> Responsabilidade (uso contínuo)</label>' +
          '<label><input type="radio" name="ft-tipo" value="emprestimo"' + (emp ? ' checked' : '') + '> Empréstimo (com data para devolver)</label></div>' +
        '<div class="pt-g2" style="margin-top:12px"><div class="form-group"><label class="form-label" for="ft-resp">Quem recebe *</label><select class="form-control" id="ft-resp"><option value="">Escolha…</option>' +
          S.usuarios.map(u => '<option value="' + esc(u.id) + '">' + esc(u.nome_completo) + '</option>').join('') + '</select>' +
          '<div class="pt-dica">' + ptIc('info', 'p') + 'Precisa ter acesso à plataforma (aceita com a própria senha).</div></div>' +
        '<div class="form-group"><label class="form-label" for="ft-local">Onde o bem vai ficar *</label><select class="form-control" id="ft-local">' + optLocais(lista[0].local_id) + '</select></div></div>' +
        '<div class="form-group" id="ft-ate-w"' + (emp ? '' : ' hidden') + '><label class="form-label" for="ft-ate">Devolver até *</label><input class="form-control" type="date" id="ft-ate" min="' + hoje() + '" value="' + lim.toISOString().slice(0, 10) + '"></div>' +
        '<div class="form-group"><label class="form-label" for="ft-fin">Para quê (opcional)</label><input class="form-control" id="ft-fin" placeholder="ex.: oficinas na APA Amapá; uso no escritório"></div>' +
        tabelaBens(lista),
      aoSalvar: async r => {
        const tp = r.querySelector('input[name="ft-tipo"]:checked').value
        const res = await rpc('fn_pat_termo_criar', { p: { tipo: tp, responsavel_id: val(r, '#ft-resp'), local_id: val(r, '#ft-local'),
          devolver_ate: tp === 'emprestimo' ? val(r, '#ft-ate') : null, finalidade: val(r, '#ft-fin'), bens: lista.map(b => b.id) } })
        toast('Termo ' + res.numero + ' enviado. A pessoa indicada recebeu uma tarefa para aceitar com a senha.', 'success')
        S.sel.clear(); await recarregarFicha(); abrirTermo(res.termo_id)
      },
    })
    $('pt-form-corpo').querySelectorAll('input[name="ft-tipo"]').forEach(x => x.onchange = () => { $('ft-ate-w').hidden = x.value !== 'emprestimo' || !x.checked })
  }

  function formDevolver(ids) {
    const lista = bensDe(ids).filter(b => b.responsavel_id && ['em_uso', 'emprestado'].includes(b.situacao) && !b.termo_pendente)
    if (!lista.length) { toast('Nenhum dos bens escolhidos está com alguém para devolver.', 'warning'); return }
    const condSel = b => '<select class="form-control" data-cond="' + esc(b.id) + '" aria-label="Condição de ' + esc(b.numero) + '">' +
      Object.keys(COND).filter(k => k !== 'novo' || b.condicao === 'novo').map(k => '<option value="' + k + '"' + (k === b.condicao ? ' selected' : '') + '>' + COND[k] + '</option>').join('') + '</select>'
    abrirForm({
      titulo: 'Registrar devolução', botao: 'Registrar devolução',
      sub: 'Quem recebe confere cada bem. Eles voltam para o estoque e saem da responsabilidade de quem devolveu.',
      corpo: tabelaBens(lista, { tit: 'Condição na volta', cel: condSel }) +
        '<div class="pt-g2" style="margin-top:12px"><div class="form-group"><label class="form-label" for="fd-local">Guardar em *</label><select class="form-control" id="fd-local">' +
          optLocais((S.locais.find(l => l.tipo === 'deposito' && l.ativo) || {}).id) + '</select></div>' +
        '<div class="form-group"><label class="form-label" for="fd-data">Data</label><input class="form-control" type="date" id="fd-data" max="' + hoje() + '" value="' + hoje() + '"></div></div>' +
        '<div class="form-group"><label class="form-label" for="fd-obs">Observação</label><input class="form-control" id="fd-obs" placeholder="ex.: voltou sem a capa de proteção"></div>',
      aoSalvar: async r => {
        const itens = lista.map(b => ({ bem_id: b.id, condicao: r.querySelector('[data-cond="' + b.id + '"]').value }))
        const res = await rpc('fn_pat_devolver', { p: { local_id: val(r, '#fd-local'), data: val(r, '#fd-data'), observacao: val(r, '#fd-obs'), itens } })
        toast(res.devolvidos + ' bem(ns) devolvido(s).', 'success'); S.sel.clear(); await recarregarFicha()
      },
    })
  }

  function formMudarLocal(ids) {
    const lista = bensDe(ids)
    abrirForm({
      titulo: 'Mudar de local', sub: lista.length + ' bem(ns). O responsável continua o mesmo; para trocar de responsável, use o termo.',
      corpo: '<div class="form-group"><label class="form-label" for="fm-local">Novo local *</label><select class="form-control" id="fm-local">' + optLocais('') + '</select></div>' +
        '<div class="form-group"><label class="form-label" for="fm-obs">Motivo *</label><input class="form-control" id="fm-obs" placeholder="ex.: guardado no depósito entre eventos"></div>' + tabelaBens(lista),
      aoSalvar: async r => {
        const n = await rpc('fn_pat_mudar_local', { p_bens: lista.map(b => b.id), p_local: val(r, '#fm-local'), p_observacao: val(r, '#fm-obs') })
        toast(n + ' bem(ns) mudaram de local.', 'success'); S.sel.clear(); await recarregarFicha()
      },
    })
  }

  function formManutSaida() {
    const b = S.ficha
    abrirForm({
      titulo: 'Mandar para manutenção', sub: b.numero + ' · ' + b.descricao,
      corpo: '<div class="form-group"><label class="form-label" for="fo-prest">Oficina ou assistência *</label><input class="form-control" id="fo-prest"></div>' +
        '<div class="form-group"><label class="form-label" for="fo-mot">Defeito ou serviço *</label><textarea class="form-control" id="fo-mot"></textarea></div>' +
        '<div class="pt-g2"><div class="form-group"><label class="form-label" for="fo-data">Saída</label><input class="form-control" type="date" id="fo-data" max="' + hoje() + '" value="' + hoje() + '"></div>' +
        '<div class="form-group"><label class="form-label" for="fo-prev">Previsão de volta</label><input class="form-control" type="date" id="fo-prev" min="' + hoje() + '"></div></div>' +
        (b.garantia_ate && b.garantia_ate >= hoje() ? '<div class="pt-aviso-f al">' + ptIc('escudo', 'p') + '<span>Em garantia até ' + dt(b.garantia_ate) + ': acione o fornecedor antes de pagar conserto.</span></div>' : ''),
      aoSalvar: async r => {
        await rpc('fn_pat_manutencao_saida', { p_bem: b.id, p_prestador: val(r, '#fo-prest'), p_motivo: val(r, '#fo-mot'), p_previsao: val(r, '#fo-prev') || null, p_data: val(r, '#fo-data') })
        toast('Saída para manutenção registrada.', 'success'); await recarregarFicha()
      },
    })
  }

  function formManutVolta() {
    const b = S.ficha
    abrirForm({
      titulo: 'Volta da manutenção', sub: b.numero + ' · ' + b.descricao,
      corpo: '<div class="pt-g2"><div class="form-group"><label class="form-label" for="fv-c">Condição na volta *</label><select class="form-control" id="fv-c">' +
          Object.keys(COND).filter(k => k !== 'novo' || b.condicao === 'novo').map(k => '<option value="' + k + '"' + (k === 'bom' ? ' selected' : '') + '>' + COND[k] + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><label class="form-label" for="fv-data">Data</label><input class="form-control" type="date" id="fv-data" max="' + hoje() + '" value="' + hoje() + '"></div></div>' +
        '<div class="form-group"><label class="form-label" for="fv-s">O que foi feito *</label><textarea class="form-control" id="fv-s"></textarea></div>' +
        '<div class="form-group"><label class="form-label" for="fv-custo">Custo (R$, opcional)</label><input class="form-control mono" id="fv-custo" inputmode="decimal" placeholder="0,00">' +
          '<div class="pt-dica">' + ptIc('info', 'p') + 'Só registro. O pagamento, se houver, é lançado no Financeiro.</div></div>',
      aoSalvar: async r => {
        const c = val(r, '#fv-custo'), custo = c ? parseValor(c) : null
        if (c && !(custo >= 0)) throw new Error('PAT_DADOS: custo inválido')
        await rpc('fn_pat_manutencao_retorno', { p_bem: b.id, p_condicao: val(r, '#fv-c'), p_servico: val(r, '#fv-s'), p_custo_brl: custo, p_data: val(r, '#fv-data') })
        toast('Volta da manutenção registrada.', 'success'); await recarregarFicha()
      },
    })
  }

  // ── Meus bens ─────────────────────────────────────────────────────────────
  function renderMeus() {
    const pend = S.termos.filter(t => t.responsavel_id === S.eu && t.situacao === 'aguardando_aceite')
    const meus = S.bens.filter(b => b.responsavel_id === S.eu && ativo(b))
    const h = hoje()
    $('pt-conteudo').innerHTML =
      (pend.length ? '<div class="pt-card"><div class="pt-card-h">' + ptIc('assina', 'p') + 'Termos para você aceitar</div>' + pend.map(t =>
        '<div class="pt-termo-card"><div class="t"><b>' + esc(t.numero) + ' · ' + esc(TERMO_TIPO[t.tipo]) + '</b>' +
        '<span>' + (t.pat_termo_itens?.[0]?.count ?? '') + ' bem(ns) · local ' + esc(t.local?.nome || '—') + (t.devolver_ate ? ' · devolver até ' + dt(t.devolver_ate) : '') + '</span>' +
        '<span class="pt-sub">enviado por ' + esc(t.criador?.nome_completo || '—') + ' em ' + dtHora(t.criado_em) + '</span></div>' +
        '<button type="button" class="pt-btn pri" data-acao="termo" data-id="' + esc(t.id) + '">' + ptIc('assina', 'p') + 'Conferir e aceitar</button></div>').join('') + '</div>' : '') +
      '<div class="pt-card"' + (pend.length ? ' style="margin-top:16px"' : '') + '><div class="pt-card-h">' + ptIc('pessoa', 'p') + 'Bens sob a sua guarda<span class="pt-sub">' + meus.length + '</span></div>' +
      (meus.length ? '<table class="pt-mini"><thead><tr><th>Nº</th><th>Bem</th><th>Local</th><th>Termo</th><th></th></tr></thead><tbody>' + meus.map(b =>
        '<tr' + (S.soMeus ? '' : ' data-acao="ficha" data-id="' + esc(b.id) + '" style="cursor:pointer"') + '><td class="mono">' + esc(b.numero) + '</td><td>' + esc(b.descricao) +
        (b.numero_serie ? '<div class="pt-sub">S/N ' + esc(b.numero_serie) + '</div>' : '') + '</td><td>' + esc(b.local_nome || '—') + '</td><td>' +
        (b.termo_vigente ? '<button type="button" class="pt-link" data-acao="termo-num" data-num="' + esc(b.termo_vigente) + '">' + esc(b.termo_vigente) + '</button>' : '—') +
        (b.devolver_ate ? '<div>' + selo(b.devolver_ate < h ? 'er' : 'ne', 'devolver até ' + dt(b.devolver_ate)) + '</div>' : '') + '</td>' +
        '<td class="dir"><button type="button" class="pt-btn peq" data-acao="ocorrencia-bem" data-id="' + esc(b.id) + '">' + ptIc('alerta', 'p') + 'Comunicar ocorrência</button></td></tr>').join('') + '</tbody></table>'
        : '<div class="pt-vazio">' + ptIc('caixa') + 'Nenhum bem do projeto está sob a sua guarda.</div>') +
      '<div class="pt-aviso in">' + ptIc('info', 'p') + '<span class="t">Quem guarda um bem responde por ele: comunique ao gestor patrimonial qualquer avaria, extravio, furto ou acidente, e devolva quando for pedido ou no prazo do empréstimo.</span></div></div>'
  }

  // ── Termos (gestor) ───────────────────────────────────────────────────────
  function renderTermos() {
    const l = S.termos
    $('pt-conteudo').innerHTML = '<div class="pt-card"><div class="pt-card-h">' + ptIc('assina', 'p') + 'Termos de responsabilidade e empréstimo' +
      '<span class="pt-sub">para fazer um termo, marque os bens na aba Bens (ou abra a ficha) e use "Entregar com termo"</span></div>' +
      (l.length ? '<div class="pt-tbl-w"><table class="pt-mini"><thead><tr><th>Termo</th><th>Para</th><th>Local</th><th class="dir">Bens</th><th>Situação</th><th>Data</th><th></th></tr></thead><tbody>' +
        l.map(t => '<tr><td class="mono">' + esc(t.numero) + '<div class="pt-sub">' + (t.tipo === 'emprestimo' ? 'empréstimo' + (t.devolver_ate ? ' até ' + dt(t.devolver_ate) : '') : 'responsabilidade') + '</div></td>' +
          '<td>' + esc(t.responsavel?.nome_completo || '—') + '</td><td>' + esc(t.local?.nome || '—') + '</td><td class="dir mono">' + (t.pat_termo_itens?.[0]?.count ?? '') + '</td>' +
          '<td>' + selo('t-' + t.situacao, TERMO_SIT[t.situacao]) + (t.devolvido_em ? '<div class="pt-sub">devolvido ' + dtHora(t.devolvido_em) + '</div>' : '') + '</td>' +
          '<td class="mono">' + dtHora(t.decidido_em || t.criado_em) + '</td>' +
          '<td class="dir"><button type="button" class="pt-btn peq" data-acao="termo" data-id="' + esc(t.id) + '">Abrir</button></td></tr>').join('') + '</tbody></table></div>'
        : '<div class="pt-vazio">' + ptIc('assina') + 'Nenhum termo ainda.</div>') + '</div>'
  }

  // ── Janela do termo: conferir, aceitar com senha, recusar, cancelar, imprimir ──
  async function abrirTermo(id) {
    $('pt-termo-tit').textContent = 'Termo'; $('pt-termo-sub').textContent = ''
    $('pt-termo-corpo').innerHTML = '<div class="pt-carregando">Carregando…</div>'; $('pt-termo-rodape').innerHTML = ''
    ptAbrir('pt-termo')
    try { S.termo = await rpc('fn_pat_termo_detalhe', { p_termo: id }) } catch (e) { S.termo = null }
    if (!S.termo) { $('pt-termo-corpo').innerHTML = '<div class="pt-aviso-f er">' + ptIc('alerta', 'p') + '<span>Termo não encontrado ou sem acesso.</span></div>'; return }
    renderTermo()
  }
  function declaracao(t) {
    return 'Declaro que recebi os bens listados acima, conferi a condição informada, e assumo a responsabilidade por sua guarda, conservação e uso ' +
      'nas atividades do projeto. Comprometo-me a comunicar ao gestor patrimonial qualquer avaria, extravio, furto ou sinistro e a devolvê-los ' +
      (t.tipo === 'emprestimo' ? 'até ' + dt(t.devolver_ate) + ' ou antes, se solicitado.' : 'quando solicitado.')
  }
  function renderTermo() {
    const t = S.termo, euIndicado = t.responsavel_id === S.eu, pend = t.situacao === 'aguardando_aceite'
    $('pt-termo-tit').textContent = t.numero + ' · ' + TERMO_TIPO[t.tipo]
    $('pt-termo-sub').innerHTML = selo('t-' + t.situacao, TERMO_SIT[t.situacao]) + ' <span class="pt-sub">emitido por ' + esc(t.criado_por_nome) + ' em ' + dtHora(t.criado_em) + '</span>'
    $('pt-termo-corpo').innerHTML = '<div id="pt-termo-erro"></div><div class="pt-dados">' +
      campo('Responsável', esc(t.responsavel_nome)) + campo('Local', esc(t.local_nome)) +
      (t.devolver_ate ? campo('Devolver até', dt(t.devolver_ate)) : '') + (t.finalidade ? campo('Para quê', esc(t.finalidade)) : '') +
      (t.decidido_em ? campo(t.situacao === 'aceito' ? 'Aceito em' : 'Decidido em', dtHora(t.decidido_em)) : '') +
      (t.devolvido_em ? campo('Devolvido em', dtHora(t.devolvido_em)) : '') + '</div>' +
      (t.motivo_decisao ? '<div class="pt-aviso-f ' + (t.situacao === 'recusado' ? 'er' : 'al') + '" style="margin-top:12px">' + ptIc('info', 'p') + '<span>' + (t.situacao === 'recusado' ? 'Motivo da recusa: ' : 'Motivo: ') + esc(t.motivo_decisao) + '</span></div>' : '') +
      '<div class="pt-sec" style="margin-top:14px">' + ptIc('caixa', 'p') + 'Bens (' + (t.bens || []).length + ')</div>' +
      '<div class="pt-lista-bens" style="max-height:none"><table class="pt-mini"><thead><tr><th>Nº</th><th>Bem</th><th>Série</th><th>Condição</th><th>Estava com</th></tr></thead><tbody>' +
        (t.bens || []).map(b => '<tr><td class="mono">' + esc(b.numero) + '</td><td>' + esc(b.descricao) + (b.quantidade > 1 ? ' (' + b.quantidade + ' ' + esc(b.unidade) + ')' : '') +
          '<div class="pt-sub">' + esc([b.marca, b.modelo].filter(Boolean).join(' ')) + '</div></td><td class="mono">' + esc(b.numero_serie || '—') + '</td>' +
          '<td>' + esc(COND[b.condicao] || b.condicao) + '</td><td>' + esc(b.responsavel_de || 'estoque') + '<div class="pt-sub">' + esc(b.local_de || '') + '</div></td></tr>').join('') + '</tbody></table></div>' +
      '<div class="pt-declara">' + esc(declaracao(t)) + '</div>' +
      (t.situacao === 'aceito' ? '<div class="pt-hash">Aceito eletronicamente com senha por ' + esc(t.responsavel_nome) + ' em ' + dtHora(t.decidido_em) + ' · SHA-256 ' + esc(t.hash_aceito || '') + '</div>' : '') +
      (pend && euIndicado ? '<div class="pt-sec" style="margin-top:16px">' + ptIc('chave', 'p') + 'Aceitar com a sua senha</div>' +
        '<div class="pt-assina"><div><label class="form-label" for="pt-senha">Senha de entrada na plataforma</label><input class="form-control" type="password" id="pt-senha" autocomplete="current-password"></div>' +
        '<button type="button" class="pt-btn" data-acao="termo-recusar">Recusar</button><button type="button" class="pt-btn pri" data-acao="termo-aceitar">' + ptIc('assina', 'p') + 'Aceitar o termo</button></div>' +
        '<div id="pt-recusa" hidden style="margin-top:10px"><label class="form-label" for="pt-recusa-m">Por que você recusa?</label><textarea class="form-control" id="pt-recusa-m" placeholder="ex.: não recebi o microfone; a caixa veio com defeito"></textarea>' +
        '<div style="margin-top:8px;text-align:right"><button type="button" class="pt-btn perigo" data-acao="termo-recusar-ok">Recusar com a senha</button></div></div>' +
        '<div class="pt-hash" style="margin-top:8px">Documento conferido: SHA-256 ' + esc(t.hash) + '</div>'
        : pend ? '<div class="pt-aviso-f in">' + ptIc('relogio', 'p') + '<span>Aguardando o aceite de ' + esc(t.responsavel_nome) + ', que recebeu uma tarefa. Os bens só mudam de mãos com o aceite.</span></div>' : '')
    $('pt-termo-rodape').innerHTML = '<span class="esq">' + (pend && S.pode.gerir ? '<button type="button" class="pt-btn perigo" data-acao="termo-cancelar">Cancelar termo</button>' : '') + '</span>' +
      '<button type="button" class="pt-btn" data-acao="termo-imprimir">' + ptIc('imprimir', 'p') + 'Imprimir (A4)</button>'
  }
  async function decidirTermo(decisao) {
    const t = S.termo, senha = $('pt-senha')?.value || '', erro = m => { $('pt-termo-erro').innerHTML = '<div class="pt-aviso-f er">' + ptIc('alerta', 'p') + '<span>' + esc(m) + '</span></div>'; $('pt-termo-corpo').scrollTop = 0 }
    const motivo = decisao === 'recusar' ? ($('pt-recusa-m')?.value || '').trim() : null
    if (!senha) { erro('Digite a sua senha.'); $('pt-senha').focus(); return }
    if (decisao === 'recusar' && motivo.length < 10) { erro('Explique a recusa com ao menos 10 caracteres.'); return }
    const bts = $('pt-termo').querySelectorAll('button'); bts.forEach(b => b.disabled = true)
    try {
      const { data: { session } } = await db.auth.getSession()
      const r = await fetch(SUPABASE_URL + '/functions/v1/patrimonio-termo', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || ''), apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ termo_id: t.id, decisao, motivo, hash: t.hash, senha }) })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) {
        const e = String(j.erro || '')
        if (e === 'SENHA_INVALIDA') erro('Senha incorreta.')
        else if (e === 'SENHA_BLOQUEADA') erro('Muitas tentativas com senha errada. Tente de novo depois de ' + dtHora(j.bloqueado_ate) + '.')
        else if (e.includes('DOCUMENTO_ALTERADO')) { toast('O termo mudou desde que você abriu. Confira de novo.', 'warning'); await abrirTermo(t.id); return }
        else erro(erroMsg(e))
        return
      }
      toast(decisao === 'aceitar' ? 'Termo aceito. Os bens estão sob a sua guarda.' : 'Termo recusado. O gestor foi avisado.', 'success')
      await carregar(); await abrirTermo(t.id)
    } catch (e) { erro(erroMsg(e)) } finally { bts.forEach(b => b.disabled = false); const s = $('pt-senha'); if (s) s.value = '' }
  }
  function formCancelarTermo() {
    const t = S.termo
    abrirForm({ titulo: 'Cancelar termo', sub: t.numero, botao: 'Cancelar termo', perigo: true,
      corpo: '<p class="pt-sub" style="font-size:13px">O termo fica registrado como cancelado e os bens ficam livres para outro termo.</p>' +
        '<div class="form-group"><label class="form-label" for="fc-m">Motivo</label><input class="form-control" id="fc-m" placeholder="ex.: pessoa errada no termo"></div>',
      aoSalvar: async r => { await rpc('fn_pat_termo_cancelar', { p_termo: t.id, p_motivo: val(r, '#fc-m') }); toast('Termo cancelado.', 'success'); await carregar(); await abrirTermo(t.id) } })
  }
  function imprimirTermo() {
    const t = S.termo; if (!t || typeof FolhaA4 === 'undefined') return
    const w = FolhaA4.janela()
    const linhas = (t.bens || []).map(b => '<tr><td class="mono">' + esc(b.numero) + '</td><td>' + esc(b.descricao) + (b.quantidade > 1 ? ' (' + b.quantidade + ' ' + esc(b.unidade) + ')' : '') +
      (b.marca || b.modelo ? '<br><small>' + esc([b.marca, b.modelo].filter(Boolean).join(' ')) + '</small>' : '') + '</td><td class="mono">' + esc(b.numero_serie || '—') + '</td><td>' + esc(COND[b.condicao] || b.condicao) + '</td></tr>').join('')
    const corpo = '<div class="rep-secao"><table class="rep-tbl"><tbody>' +
        '<tr><td class="c-min"><b>Termo</b></td><td class="mono">' + esc(t.numero) + ' — ' + esc(TERMO_TIPO[t.tipo]) + '</td></tr>' +
        '<tr><td class="c-min"><b>Responsável</b></td><td>' + esc(t.responsavel_nome) + '</td></tr>' +
        '<tr><td class="c-min"><b>Local</b></td><td>' + esc(t.local_nome) + '</td></tr>' +
        (t.devolver_ate ? '<tr><td class="c-min"><b>Devolver até</b></td><td class="mono">' + dt(t.devolver_ate) + '</td></tr>' : '') +
        (t.finalidade ? '<tr><td class="c-min"><b>Finalidade</b></td><td>' + esc(t.finalidade) + '</td></tr>' : '') +
        '<tr><td class="c-min"><b>Emitido por</b></td><td>' + esc(t.criado_por_nome) + ' em ' + dtHora(t.criado_em) + '</td></tr>' +
        '<tr><td class="c-min"><b>Situação</b></td><td>' + esc(TERMO_SIT[t.situacao]) + (t.decidido_em ? ' em ' + dtHora(t.decidido_em) : '') + '</td></tr></tbody></table></div>' +
      '<div class="rep-secao"><div class="rep-secao-titulo">Bens (' + (t.bens || []).length + ')</div><table class="rep-tbl"><thead><tr><th>Nº</th><th>Bem</th><th>Série</th><th>Condição</th></tr></thead><tbody>' + linhas + '</tbody></table></div>' +
      '<div class="rep-secao"><div class="rep-secao-titulo">Declaração</div><p>' + esc(declaracao(t)) + '</p>' +
        (t.situacao === 'aceito' ? '<p class="mono" style="font-size:8pt">Aceito eletronicamente com senha de acesso por ' + esc(t.responsavel_nome) + ' em ' + dtHora(t.decidido_em) + '. SHA-256 do documento: ' + esc(t.hash_aceito || '') + '</p>'
          : '<p><b>' + esc(TERMO_SIT[t.situacao]) + '.</b> Este documento só vale como termo depois do aceite eletrônico.</p>') + '</div>' +
      '<div class="rep-secao"><table class="rep-tbl"><tbody><tr><td style="height:22mm;vertical-align:bottom;text-align:center">______________________________<br>' + esc(t.criado_por_nome) + '<br><small>entregou</small></td>' +
        '<td style="height:22mm;vertical-align:bottom;text-align:center">______________________________<br>' + esc(t.responsavel_nome) + '<br><small>recebeu</small></td></tr></tbody></table></div>'
    FolhaA4.escrever(w, { titulo: TERMO_TIPO[t.tipo] + ' ' + t.numero, selo: 'Patrimônio', tema: 'patrimonio', corpo, nomeArquivo: 'termo-' + t.numero })
  }

  // ── Fase 3: ocorrências, sinistros e baixa ────────────────────────────────
  function renderOcorrencias() {
    const oc = S.ocorrencias, bx = S.baixas
    const linhaOc = o => '<tr><td class="mono">' + esc(o.numero) + '</td><td><b>' + esc(o.bem?.numero || '') + '</b> ' + esc(o.bem?.descricao || '') + '</td>' +
      '<td>' + esc(OC_TIPO[o.tipo] || o.tipo) + (o.bo_numero ? '<div class="pt-sub">BO ' + esc(o.bo_numero) + '</div>' : '') + '</td>' +
      '<td class="mono">' + dt(o.dt_ocorrencia) + '</td><td>' + selo(o.situacao === 'concluida' ? 't-aceito' : o.situacao === 'em_apuracao' ? 'ne' : 'al', OC_SIT[o.situacao]) +
      (o.desfecho ? '<div class="pt-sub">' + esc(OC_DESF[o.desfecho]) + '</div>' : '') + '</td>' +
      '<td class="dir"><button type="button" class="pt-btn peq" data-acao="oc" data-id="' + esc(o.id) + '">Abrir</button></td></tr>'
    const linhaBx = x => '<tr><td class="mono">' + esc(x.numero) + '</td><td><b>' + esc(x.bem?.numero || '') + '</b> ' + esc(x.bem?.descricao || '') + '</td>' +
      '<td>' + esc(BX_MOT[x.motivo] || x.motivo) + '</td><td>' + esc(x.pedidor?.nome_completo || '—') + '<div class="pt-sub">' + dtHora(x.pedido_em) + '</div></td>' +
      '<td>' + selo(x.situacao === 'aprovada' ? 't-aceito' : x.situacao === 'aguardando' ? 'al' : 'ne', BX_SIT[x.situacao]) + '</td>' +
      '<td class="dir"><button type="button" class="pt-btn peq' + (x.situacao === 'aguardando' && S.pode.coord && x.pedido_por !== S.eu ? ' pri' : '') + '" data-acao="bx" data-id="' + esc(x.id) + '">' +
        (x.situacao === 'aguardando' && S.pode.coord && x.pedido_por !== S.eu ? 'Decidir' : 'Abrir') + '</button></td></tr>'
    $('pt-conteudo').innerHTML =
      '<div class="pt-card"><div class="pt-card-h">' + ptIc('alerta', 'p') + 'Ocorrências<span class="pt-sub">avaria, defeito, extravio, furto, roubo, sinistro — registre pela ficha do bem (Movimentar) ou em Meus bens</span></div>' +
        (oc.length ? '<div class="pt-tbl-w"><table class="pt-mini"><thead><tr><th>Nº</th><th>Bem</th><th>Tipo</th><th>Data</th><th>Situação</th><th></th></tr></thead><tbody>' + oc.map(linhaOc).join('') + '</tbody></table></div>'
          : '<div class="pt-vazio">' + ptIc('check') + 'Nenhuma ocorrência registrada.</div>') + '</div>' +
      '<div class="pt-card" style="margin-top:16px"><div class="pt-card-h">' + ptIc('lixo', 'p') + 'Pedidos de baixa<span class="pt-sub">aprovados com senha pela coordenação ou super_admin que não pediu</span></div>' +
        (bx.length ? '<div class="pt-tbl-w"><table class="pt-mini"><thead><tr><th>Nº</th><th>Bem</th><th>Motivo</th><th>Pedido por</th><th>Situação</th><th></th></tr></thead><tbody>' + bx.map(linhaBx).join('') + '</tbody></table></div>'
          : '<div class="pt-vazio">' + ptIc('caixa') + 'Nenhum pedido de baixa.</div>') + '</div>'
  }

  function formOcorrencia(bemId) {
    const b = S.bens.find(x => x.id === bemId); if (!b) return
    abrirForm({
      titulo: 'Registrar ocorrência', sub: b.numero + ' · ' + b.descricao, botao: 'Registrar',
      corpo: '<div class="pt-g2"><div class="form-group"><label class="form-label" for="fo2-tipo">O que aconteceu *</label><select class="form-control" id="fo2-tipo">' +
          Object.keys(OC_TIPO).map(k => '<option value="' + k + '">' + OC_TIPO[k] + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><label class="form-label" for="fo2-data">Quando *</label><input class="form-control" type="date" id="fo2-data" max="' + hoje() + '" value="' + hoje() + '"></div></div>' +
        '<div class="form-group" id="fo2-bo-w" hidden><label class="form-label" for="fo2-bo">Nº do boletim de ocorrência *</label><input class="form-control mono" id="fo2-bo">' +
          '<div class="pt-dica">' + ptIc('info', 'p') + 'Furto ou roubo exige o boletim. O PDF pode ser anexado depois, na ocorrência.</div></div>' +
        '<div class="form-group"><label class="form-label" for="fo2-onde">Onde</label><input class="form-control" id="fo2-onde" placeholder="ex.: evento na APA, transporte, escritório"></div>' +
        '<div class="form-group"><label class="form-label" for="fo2-desc">Descreva *</label><textarea class="form-control" id="fo2-desc" placeholder="o que aconteceu, como, quem estava"></textarea></div>' +
        '<div class="form-group" id="fo2-cond-w"><label class="form-label" for="fo2-cond">Condição do bem agora</label><select class="form-control" id="fo2-cond"><option value="">sem mudança</option>' +
          ['bom', 'regular', 'ruim', 'inservivel'].map(k => '<option value="' + k + '">' + COND[k] + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><span class="form-label">Fotos <span class="pt-sub">(até 3: o dano, o local, o que ajudar a entender)</span></span><div class="pt-fslots pt-ocf" id="fo2-fotos"></div></div>' +
        '<div class="pt-aviso-f in">' + ptIc('info', 'p') + '<span>O gestor patrimonial recebe uma tarefa para apurar. Extravio, furto e roubo tiram o bem de circulação até o desfecho.</span></div>',
      aoSalvar: async r => {
        const fotos = []
        for (const [n, ft] of OCF.entries()) {
          if (!ft.url) ft.url = await enviarArquivo('bens/' + b.id + '/ocorrencia-' + Date.now() + '-' + (n + 1) + '.jpg', ft.file)
          fotos.push({ url: ft.url, nome: ft.nome, tamanho: ft.file.size })
        }
        const res = await rpc('fn_pat_ocorrencia_registrar', { p: { bem_id: b.id, tipo: val(r, '#fo2-tipo'), dt_ocorrencia: val(r, '#fo2-data'),
          bo_numero: val(r, '#fo2-bo'), onde: val(r, '#fo2-onde'), descricao: val(r, '#fo2-desc'), condicao: val(r, '#fo2-cond'), fotos } })
        OCF.forEach(ft => { try { URL.revokeObjectURL(ft.prev) } catch (e) {} }); OCF = []
        toast('Ocorrência ' + res.numero + ' registrada. O gestor patrimonial foi avisado.', 'success')
        await recarregarFicha(); abrirOcorrencia(res.ocorrencia_id)
      },
    })
    const t = $('fo2-tipo'); t.onchange = () => { const perda = ['extravio', 'furto', 'roubo'].includes(t.value); $('fo2-bo-w').hidden = !['furto', 'roubo'].includes(t.value); $('fo2-cond-w').hidden = perda }
    OCF = []; renderOcFotos()
  }
  let OCF = []   // fotos do registro da ocorrência (até 3), enviadas só ao clicar em Registrar
  function renderOcFotos() {
    const box = $('fo2-fotos'); if (!box) return
    box.innerHTML = OCF.map((ft, n) => '<div class="pt-fslot tem"><div class="pt-fslot-c"><img alt="" src="' + esc(ft.prev) + '"></div>' +
        '<div class="pt-fslot-t"><b>Foto ' + (n + 1) + '</b><span class="pt-fslot-a"><button type="button" class="pt-link" data-ocf-rm="' + n + '">Tirar</button></span></div></div>').join('') +
      (OCF.length < 3 ? '<div class="pt-fslot"><label class="pt-fslot-c"><span class="vz">' + ptIc('camera') + '<span>Tirar ou escolher</span></span>' +
        '<input type="file" accept="image/*" class="pt-fin" aria-label="Tirar ou escolher foto da ocorrência" id="fo2-foto-in"></label><div class="pt-fslot-t"><b>Foto ' + (OCF.length + 1) + '</b><span>opcional</span></div></div>' : '')
    const inp = $('fo2-foto-in')
    if (inp) inp.onchange = () => { const f0 = inp.files[0]; if (!f0) return
      reduzirImagem(f0).then(f => { OCF.push({ file: f, nome: f0.name, prev: URL.createObjectURL(f), url: '' }); renderOcFotos() }).catch(er => toast(erroMsg(er), 'error')) }
    box.querySelectorAll('[data-ocf-rm]').forEach(bt => bt.onclick = () => { const n = Number(bt.dataset.ocfRm); try { URL.revokeObjectURL(OCF[n].prev) } catch (e) {} OCF.splice(n, 1); renderOcFotos() })
  }

  async function abrirOcorrencia(id) {
    $('pt-termo-tit').textContent = 'Ocorrência'; $('pt-termo-sub').textContent = ''
    $('pt-termo-corpo').innerHTML = '<div class="pt-carregando">Carregando…</div>'; $('pt-termo-rodape').innerHTML = ''
    ptAbrir('pt-termo')
    const o = S.ocorrencias.find(x => x.id === id)
    if (!o) { $('pt-termo-corpo').innerHTML = '<div class="pt-aviso-f er">' + ptIc('alerta', 'p') + '<span>Ocorrência não encontrada ou sem acesso.</span></div>'; return }
    const { data: docs } = await db.from('pat_documentos').select('*').eq('ocorrencia_id', id).eq('ativo', true).order('enviado_em')
    S.doc = { tipo: 'oc', o, docs: docs || [] }
    renderOcorrencia()
  }
  function renderOcorrencia() {
    const { o, docs } = S.doc, b = S.bens.find(x => x.id === o.bem_id), aberta = o.situacao !== 'concluida'
    const podeAnexar = aberta && (S.pode.gerir || o.registrado_por === S.eu || b?.responsavel_id === S.eu)
    $('pt-termo-tit').textContent = o.numero + ' · ' + (OC_TIPO[o.tipo] || o.tipo)
    $('pt-termo-sub').innerHTML = selo(o.situacao === 'concluida' ? 't-aceito' : 'al', OC_SIT[o.situacao]) + ' <span class="pt-sub">registrada por ' + esc(o.registrador?.nome_completo || '—') + ' em ' + dtHora(o.registrado_em) + '</span>'
    $('pt-termo-corpo').innerHTML = '<div class="pt-dados">' +
      campo('Bem', '<b>' + esc(o.bem?.numero || '') + '</b> ' + esc(o.bem?.descricao || '')) + campo('Data', dt(o.dt_ocorrencia)) +
      campo('Onde', esc(o.onde)) + campo('Boletim', esc(o.bo_numero)) +
      campo('Bem antes', esc((SIT[o.situacao_bem_antes] || o.situacao_bem_antes) + ' · ' + (COND[o.condicao_antes] || o.condicao_antes))) +
      (o.desfecho ? campo('Desfecho', esc(OC_DESF[o.desfecho])) : '') + (o.valor_brl ? campo('Valor recebido', brl(o.valor_brl)) : '') +
      (o.seguradora ? campo('Seguradora', esc(o.seguradora) + (o.sinistro_numero ? ' · sinistro ' + esc(o.sinistro_numero) : '')) : '') + '</div>' +
      '<div class="pt-sec" style="margin-top:14px">O que aconteceu</div><div class="pt-obs">' + esc(o.descricao) + '</div>' +
      (o.parecer ? '<div class="pt-sec">Parecer da apuração</div><div class="pt-obs">' + esc(o.parecer) + '</div>' : '') +
      '<div class="pt-sec">' + ptIc('doc', 'p') + 'Documentos e fotos</div>' +
      (docs.length ? docs.map(d => '<div class="pt-doc">' + ptIc(d.tipo === 'foto' ? 'camera' : 'doc', 'p') + '<span class="t"><a href="#" data-arquivo="' + esc(d.url) + '">' + esc(d.nome) + '</a><div class="pt-sub">' +
        esc(DOC_TIPO[d.tipo] || d.tipo) + ' · ' + dtHora(d.enviado_em) + '</div></span></div>').join('') : '<p class="pt-sub">Nenhum arquivo.</p>') +
      (podeAnexar ? '<div class="pt-envio"><select class="form-control" id="pt-oc-dtipo" aria-label="Tipo do arquivo"><option value="bo">Boletim de ocorrência</option><option value="foto">Foto</option><option value="laudo">Laudo</option><option value="outro">Outro</option></select>' +
        '<button type="button" class="pt-btn" data-acao="oc-anexar">' + ptIc('upload', 'p') + 'Anexar arquivo</button><input type="file" id="pt-oc-arq" accept="image/*,application/pdf" multiple hidden></div>' : '')
    const G = S.pode.gerir && aberta, perda = ['extravio', 'furto', 'roubo'].includes(o.tipo)
    $('pt-termo-rodape').innerHTML = '<span class="esq">' + (G && b && ['em_estoque', 'extraviado'].includes(b.situacao) && !b.baixa_pendente
        ? '<button type="button" class="pt-btn" data-acao="oc-baixa">' + ptIc('lixo', 'p') + 'Pedir baixa</button>' : '') + '</span>' +
      (G && o.situacao === 'aberta' ? '<button type="button" class="pt-btn" data-acao="oc-apurar">' + ptIc('busca', 'p') + 'Iniciar apuração</button>' : '') +
      (G ? '<button type="button" class="pt-btn pri" data-acao="oc-concluir">' + ptIc('check', 'p') + (perda ? 'Registrar que foi localizado' : 'Concluir com desfecho') + '</button>' : '')
  }
  async function anexarOcorrencia(files) {
    const { o } = S.doc, tipo = $('pt-oc-dtipo').value
    let ok = 0
    for (const f0 of files) {
      try {
        const f = tipo === 'foto' ? await reduzirImagem(f0) : f0
        const url = await enviarArquivo('bens/' + o.bem_id + '/oc-' + Date.now() + '-' + nomeSeguro(f.name), f)
        await rpc('fn_pat_anexar_vinculo', { p_tipo: tipo, p_url: url, p_nome: f0.name, p_tamanho: f.size, p_ocorrencia: o.id, p_baixa: null })
        ok++
      } catch (e) { toast(f0.name + ': ' + erroMsg(e), 'error') }
    }
    if (ok) { toast(ok + ' arquivo(s) anexado(s).', 'success'); await abrirOcorrencia(o.id) }
  }
  function formApurar() {
    const { o } = S.doc
    abrirForm({ titulo: 'Iniciar apuração', sub: o.numero, botao: 'Iniciar apuração',
      corpo: '<div class="form-group"><label class="form-label" for="fa-p">Primeiras anotações (opcional)</label><textarea class="form-control" id="fa-p" placeholder="o que vai ser verificado, com quem"></textarea></div>',
      aoSalvar: async r => { await rpc('fn_pat_ocorrencia_apurar', { p_oc: o.id, p_parecer: val(r, '#fa-p') }); toast('Apuração iniciada.', 'success'); await carregar(); await abrirOcorrencia(o.id) } })
  }
  function formConcluirOc() {
    const { o } = S.doc, perda = ['extravio', 'furto', 'roubo'].includes(o.tipo)
    const desf = perda ? ['localizado'] : ['reparado', 'ressarcido', 'indenizado', 'arquivada']
    abrirForm({ titulo: perda ? 'Bem localizado' : 'Concluir ocorrência', sub: o.numero + (perda ? ' · se o bem não aparecer, use "Pedir baixa"' : ''), botao: 'Concluir',
      corpo: '<div class="pt-g2"><div class="form-group"><label class="form-label" for="fx2-d">Desfecho *</label><select class="form-control" id="fx2-d">' +
          desf.map(k => '<option value="' + k + '">' + OC_DESF[k] + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><label class="form-label" for="fx2-c">Condição do bem</label><select class="form-control" id="fx2-c"><option value="">sem mudança</option>' +
          ['bom', 'regular', 'ruim', 'inservivel'].map(k => '<option value="' + k + '">' + COND[k] + '</option>').join('') + '</select></div></div>' +
        '<div class="pt-g3" id="fx2-val-w" hidden><div class="form-group"><label class="form-label" for="fx2-v">Valor recebido (R$)</label><input class="form-control mono" id="fx2-v" inputmode="decimal"></div>' +
          '<div class="form-group"><label class="form-label" for="fx2-s">Seguradora</label><input class="form-control" id="fx2-s"></div>' +
          '<div class="form-group"><label class="form-label" for="fx2-n">Nº do sinistro</label><input class="form-control mono" id="fx2-n"></div></div>' +
        '<div class="form-group"><label class="form-label" for="fx2-p">Parecer da apuração *</label><textarea class="form-control" id="fx2-p" placeholder="o que foi apurado, responsabilidade, providências"></textarea></div>' +
        (!perda ? '<div class="pt-dica">' + ptIc('info', 'p') + 'Ressarcimento ou indenização só registra o valor; o recebimento entra no Financeiro. Se o bem não tem mais uso, conclua e peça a baixa.</div>' : ''),
      aoSalvar: async r => {
        const v = val(r, '#fx2-v'), valor = v ? parseValor(v) : null
        await rpc('fn_pat_ocorrencia_concluir', { p_oc: o.id, p: { desfecho: val(r, '#fx2-d'), parecer: val(r, '#fx2-p'), condicao: val(r, '#fx2-c'),
          valor_brl: valor, seguradora: val(r, '#fx2-s'), sinistro_numero: val(r, '#fx2-n') } })
        toast('Ocorrência concluída.', 'success'); await carregar(); await abrirOcorrencia(o.id)
      } })
    const d = $('fx2-d'); d.onchange = () => { $('fx2-val-w').hidden = !['ressarcido', 'indenizado'].includes(d.value) }
  }

  function formBaixa(bemId, ocId) {
    const b = S.bens.find(x => x.id === bemId); if (!b) return
    const oc = ocId ? S.ocorrencias.find(x => x.id === ocId) : S.ocorrencias.find(x => x.bem_id === bemId && x.situacao !== 'concluida')
    const extr = b.situacao === 'extraviado'
    const motivos = extr ? ['furto_roubo', 'extravio_nao_localizado'] : ['inservivel', 'sinistro_perda_total', 'obsolescencia', 'doacao', 'alienacao']
    abrirForm({
      titulo: 'Pedir baixa', sub: b.numero + ' · ' + b.descricao, botao: 'Enviar para aprovação',
      corpo: '<div class="pt-aviso-f al">' + ptIc('alerta', 'p') + '<span>Baixa tira o bem do patrimônio de vez (a depreciação para). Quem aprova, com a senha, é a coordenação ou o super_admin — nunca quem pediu.</span></div>' +
        '<div class="pt-g2"><div class="form-group"><label class="form-label" for="fb-m">Motivo *</label><select class="form-control" id="fb-m">' +
          motivos.map(k => '<option value="' + k + '">' + BX_MOT[k] + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><label class="form-label">Ocorrência ligada</label><input class="form-control mono" value="' + esc(oc ? oc.numero + ' · ' + (OC_TIPO[oc.tipo] || '') : 'nenhuma') + '" disabled></div></div>' +
        '<div class="form-group" id="fb-dest-w" hidden><label class="form-label" for="fb-d">Para quem vai *</label><input class="form-control" id="fb-d" placeholder="instituição e documento (termo de doação, nota de venda)"></div>' +
        '<div class="form-group"><label class="form-label" for="fb-j">Justificativa *</label><textarea class="form-control" id="fb-j" placeholder="por que o bem sai do patrimônio; laudo, apuração, decisão"></textarea><div class="pt-dica">Ao menos 30 caracteres. Laudo e outros documentos podem ser anexados no pedido, antes da aprovação.</div></div>',
      aoSalvar: async r => {
        const res = await rpc('fn_pat_baixa_pedir', { p: { bem_id: b.id, motivo: val(r, '#fb-m'), justificativa: val(r, '#fb-j'), destino: val(r, '#fb-d'), ocorrencia_id: oc ? oc.id : null } })
        toast('Pedido ' + res.numero + ' enviado para aprovação.', 'success'); await recarregarFicha(); abrirBaixa(res.baixa_id)
      },
    })
    const m = $('fb-m'); m.onchange = () => { $('fb-dest-w').hidden = !['doacao', 'alienacao'].includes(m.value) }
  }

  async function abrirBaixa(id) {
    $('pt-termo-tit').textContent = 'Pedido de baixa'; $('pt-termo-sub').textContent = ''
    $('pt-termo-corpo').innerHTML = '<div class="pt-carregando">Carregando…</div>'; $('pt-termo-rodape').innerHTML = ''
    ptAbrir('pt-termo')
    let x = null; try { x = await rpc('fn_pat_baixa_detalhe', { p_baixa: id }) } catch (e) { x = null }
    if (!x) { $('pt-termo-corpo').innerHTML = '<div class="pt-aviso-f er">' + ptIc('alerta', 'p') + '<span>Pedido não encontrado ou sem acesso.</span></div>'; return }
    S.doc = { tipo: 'bx', x }
    renderBaixa()
  }
  function renderBaixa() {
    const { x } = S.doc, agu = x.situacao === 'aguardando'
    $('pt-termo-tit').textContent = x.numero + ' · Baixa de ' + x.bem.numero
    $('pt-termo-sub').innerHTML = selo(x.situacao === 'aprovada' ? 't-aceito' : agu ? 'al' : 'ne', BX_SIT[x.situacao]) + ' <span class="pt-sub">pedido por ' + esc(x.pedido_por_nome) + ' em ' + dtHora(x.pedido_em) + '</span>'
    $('pt-termo-corpo').innerHTML = '<div id="pt-termo-erro"></div><div class="pt-dados">' +
      campo('Bem', '<b>' + esc(x.bem.numero) + '</b> ' + esc(x.bem.descricao)) + campo('Série', esc(x.bem.serie)) +
      campo('Situação do bem', esc(SIT[x.bem.situacao] || x.bem.situacao)) + campo('Condição', esc(COND[x.bem.condicao] || x.bem.condicao)) +
      campo('Motivo', esc(BX_MOT[x.motivo] || x.motivo)) + campo('Ocorrência', x.ocorrencia ? '<button type="button" class="pt-link" data-acao="oc-num" data-num="' + esc(x.ocorrencia) + '">' + esc(x.ocorrencia) + '</button>' : '') +
      (x.destino ? campo('Para quem vai', esc(x.destino)) : '') + (x.decidido_em ? campo('Decidido por', esc(x.decidido_por_nome) + ' em ' + dtHora(x.decidido_em)) : '') + '</div>' +
      '<div class="pt-sec" style="margin-top:14px">Justificativa</div><div class="pt-obs">' + esc(x.justificativa) + '</div>' +
      (x.parecer ? '<div class="pt-sec">Parecer</div><div class="pt-obs">' + esc(x.parecer) + '</div>' : '') +
      '<div class="pt-sec">' + ptIc('doc', 'p') + 'Documentos do pedido</div>' +
      ((x.docs || []).length ? x.docs.map(d => '<div class="pt-doc">' + ptIc('doc', 'p') + '<span class="t"><a href="#" data-arquivo="' + esc(d.url) + '">' + esc(d.nome) + '</a><div class="pt-sub">' + esc(DOC_TIPO[d.tipo] || d.tipo) + '</div></span></div>').join('')
        : '<p class="pt-sub">Nenhum documento anexado ao pedido.</p>') +
      (agu && S.pode.gerir ? '<div class="pt-envio"><select class="form-control" id="pt-bx-dtipo" aria-label="Tipo do arquivo"><option value="laudo">Laudo</option><option value="termo">Termo (doação, venda)</option><option value="foto">Foto</option><option value="outro">Outro</option></select>' +
        '<button type="button" class="pt-btn" data-acao="bx-anexar">' + ptIc('upload', 'p') + 'Anexar ao pedido</button><input type="file" id="pt-bx-arq" accept="image/*,application/pdf" multiple hidden>' +
        '<span class="pt-sub">Anexar depois de aberto muda o documento: quem for aprovar precisa abrir de novo.</span></div>' : '') +
      (x.pode_decidir ? '<div class="pt-sec" style="margin-top:16px">' + ptIc('chave', 'p') + 'Decidir com a sua senha</div>' +
        '<div class="form-group"><label class="form-label" for="pt-bx-par">Parecer (obrigatório para devolver)</label><textarea class="form-control" id="pt-bx-par"></textarea></div>' +
        '<div class="pt-assina"><div><label class="form-label" for="pt-senha">Senha de entrada na plataforma</label><input class="form-control" type="password" id="pt-senha" autocomplete="current-password"></div>' +
        '<button type="button" class="pt-btn" data-acao="bx-devolver">Devolver</button><button type="button" class="pt-btn pri" data-acao="bx-aprovar">' + ptIc('assina', 'p') + 'Aprovar a baixa</button></div>' +
        '<div class="pt-hash" style="margin-top:8px">Documento conferido: SHA-256 ' + esc(x.hash) + '</div>'
        : agu ? '<div class="pt-aviso-f in" style="margin-top:12px">' + ptIc('relogio', 'p') + '<span>Aguardando a decisão da coordenação ou do super_admin (quem pediu não aprova).</span></div>'
        : (x.hash_decidido ? '<div class="pt-hash" style="margin-top:12px">Decidido com senha · SHA-256 ' + esc(x.hash_decidido) + '</div>' : ''))
    $('pt-termo-rodape').innerHTML = '<span class="esq">' + (agu && (x.pedido_por === S.eu || S.pode.coord) ? '<button type="button" class="pt-btn perigo" data-acao="bx-cancelar">Cancelar pedido</button>' : '') + '</span>'
  }
  async function anexarBaixa(files) {
    const { x } = S.doc, tipo = $('pt-bx-dtipo').value
    let ok = 0
    for (const f0 of files) {
      try {
        const f = tipo === 'foto' ? await reduzirImagem(f0) : f0
        const url = await enviarArquivo('bens/' + x.bem.id + '/bx-' + Date.now() + '-' + nomeSeguro(f.name), f)
        await rpc('fn_pat_anexar_vinculo', { p_tipo: tipo, p_url: url, p_nome: f0.name, p_tamanho: f.size, p_ocorrencia: null, p_baixa: x.id })
        ok++
      } catch (e) { toast(f0.name + ': ' + erroMsg(e), 'error') }
    }
    if (ok) { toast(ok + ' arquivo(s) anexado(s).', 'success'); await abrirBaixa(x.id) }
  }
  async function decidirBaixa(decisao) {
    const { x } = S.doc, senha = $('pt-senha')?.value || '', parecer = ($('pt-bx-par')?.value || '').trim()
    const erro = m => { $('pt-termo-erro').innerHTML = '<div class="pt-aviso-f er">' + ptIc('alerta', 'p') + '<span>' + esc(m) + '</span></div>'; $('pt-termo-corpo').scrollTop = 0 }
    if (!senha) { erro('Digite a sua senha.'); return }
    if (decisao === 'devolver' && parecer.length < 10) { erro('Para devolver, escreva o parecer (ao menos 10 caracteres).'); return }
    const bts = $('pt-termo').querySelectorAll('button'); bts.forEach(b => b.disabled = true)
    try {
      const { data: { session } } = await db.auth.getSession()
      const r = await fetch(SUPABASE_URL + '/functions/v1/patrimonio-termo', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || ''), apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ acao: 'decidir_baixa', baixa_id: x.id, decisao, motivo: parecer || null, hash: x.hash, senha }) })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) {
        const e = String(j.erro || '')
        if (e === 'SENHA_INVALIDA') erro('Senha incorreta.')
        else if (e === 'SENHA_BLOQUEADA') erro('Muitas tentativas com senha errada. Tente de novo depois de ' + dtHora(j.bloqueado_ate) + '.')
        else if (e.includes('DOCUMENTO_ALTERADO')) { toast('O pedido mudou desde que você abriu. Confira de novo.', 'warning'); await abrirBaixa(x.id); return }
        else erro(erroMsg(e))
        return
      }
      toast(decisao === 'aprovar' ? 'Baixa aprovada. O bem saiu do patrimônio.' : 'Pedido devolvido a quem pediu.', 'success')
      await carregar(); await abrirBaixa(x.id)
    } catch (e) { erro(erroMsg(e)) } finally { bts.forEach(b => b.disabled = false); const s = $('pt-senha'); if (s) s.value = '' }
  }
  function formCancelarBaixa() {
    const { x } = S.doc
    abrirForm({ titulo: 'Cancelar pedido de baixa', sub: x.numero, botao: 'Cancelar pedido', perigo: true,
      corpo: '<div class="form-group"><label class="form-label" for="fcb-m">Motivo</label><input class="form-control" id="fcb-m"></div>',
      aoSalvar: async r => { await rpc('fn_pat_baixa_cancelar', { p_baixa: x.id, p_motivo: val(r, '#fcb-m') }); toast('Pedido cancelado.', 'success'); await carregar(); await abrirBaixa(x.id) } })
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
      case 'inc-foto-rm': { e.preventDefault(); const it = INC.itens[Number(el.dataset.i)]; const ft = it.fotos[el.dataset.slot]
        if (ft) { try { URL.revokeObjectURL(ft.prev) } catch (er) {} delete it.fotos[el.dataset.slot] } renderIncorporar(); break }
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
      case 'termo-sel': formTermo([...S.sel], 'responsabilidade'); break
      case 'local-sel': formMudarLocal([...S.sel]); break
      case 'devolver-sel': formDevolver([...S.sel]); break
      case 'termo-um': formTermo([S.ficha.id], 'responsabilidade'); break
      case 'emprestar-um': formTermo([S.ficha.id], 'emprestimo'); break
      case 'devolver-um': formDevolver([S.ficha.id]); break
      case 'local-um': formMudarLocal([S.ficha.id]); break
      case 'manut-saida': formManutSaida(); break
      case 'manut-volta': formManutVolta(); break
      case 'termo': abrirTermo(el.dataset.id); break
      case 'termo-num': { const t = S.termos.find(x => x.numero === el.dataset.num); if (t) abrirTermo(t.id); break }
      case 'termo-aceitar': decidirTermo('aceitar'); break
      case 'termo-recusar': $('pt-recusa').hidden = false; $('pt-recusa-m').focus(); break
      case 'termo-recusar-ok': decidirTermo('recusar'); break
      case 'termo-cancelar': formCancelarTermo(); break
      case 'termo-imprimir': imprimirTermo(); break
      case 'ocorrencia-um': formOcorrencia(S.ficha.id); break
      case 'ocorrencia-bem': formOcorrencia(el.dataset.id); break
      case 'baixa-um': formBaixa(S.ficha.id); break
      case 'oc': abrirOcorrencia(el.dataset.id); break
      case 'oc-num': { const o = S.ocorrencias.find(x => x.numero === el.dataset.num); if (o) abrirOcorrencia(o.id); break }
      case 'oc-num-ficha': { const o = S.ocorrencias.find(x => x.numero === S.ficha.ocorrencia_aberta); if (o) abrirOcorrencia(o.id); break }
      case 'oc-anexar': { const inp = $('pt-oc-arq'); inp.value = ''; inp.onchange = () => { if (inp.files.length) anexarOcorrencia([...inp.files]) }; inp.click(); break }
      case 'oc-apurar': formApurar(); break
      case 'oc-concluir': formConcluirOc(); break
      case 'oc-baixa': formBaixa(S.doc.o.bem_id, S.doc.o.id); break
      case 'bx': abrirBaixa(el.dataset.id); break
      case 'bx-num': { const x = S.baixas.find(y => y.numero === el.dataset.num); if (x) abrirBaixa(x.id); break }
      case 'bx-anexar': { const inp = $('pt-bx-arq'); inp.value = ''; inp.onchange = () => { if (inp.files.length) anexarBaixa([...inp.files]) }; inp.click(); break }
      case 'bx-aprovar': decidirBaixa('aprovar'); break
      case 'bx-devolver': decidirBaixa('devolver'); break
      case 'bx-cancelar': formCancelarBaixa(); break
      case 'inv-novo': formInventario(); break
      case 'inv': abrirInventario(el.dataset.id); break
      case 'inv-filtro': S.invUi.filtro = el.dataset.f; renderInventario(); break
      case 'inv-camera': iniciarCamera(); break
      case 'inv-camera-parar': pararCamera(); break
      case 'inv-procurar': procurarInv($('pt-inv-numero')?.value); break
      case 'inv-alvo': S.invUi.alvo = { bem_id: el.dataset.id, metodo: 'lista' }; S.invUi.cond = null; S.invUi.obs = ''; renderAlvo(); break
      case 'inv-alvo-sair': S.invUi.alvo = null; S.invUi.cond = null; S.invUi.obs = ''; $('pt-inv-alvo').innerHTML = ''; break
      case 'inv-cond': S.invUi.cond = el.dataset.c; renderAlvo(); break
      case 'inv-confirmar': confirmarInv(); break
      case 'inv-foto-pular': fimFotoInv(); break
      case 'inv-desfazer': rpc('fn_pat_inv_desfazer', { p_inv: S.inv.inventario.id, p_bem: el.dataset.id }).then(() => recarregarInventario()).catch(er => invErro(erroMsg(er))); break
      case 'inv-enviar': enviarInv(); break
      case 'inv-assinar': assinarInv(); break
      case 'inv-reabrir': formReabrirInv(); break
      case 'inv-cancelar': formCancelarInv(); break
      case 'inv-imprimir': imprimirInventario(); break
    }
  })
})()
