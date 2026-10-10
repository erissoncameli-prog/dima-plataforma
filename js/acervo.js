// ═══════════════════════════════════════════════════════════════════════
// acervo.js — Biblioteca Virtual de Produtos e Relatórios Técnicos
// ═══════════════════════════════════════════════════════════════════════
// Fonte de dados: vw_acervo_obras + vw_acervo_midias (security_invoker).
//
// Estratégia: o acervo inteiro cabe em duas consultas (dezenas a poucos
// milhares de linhas). Carrega-se tudo uma vez e busca/filtro/ordenação
// acontecem em memória — sem round-trip por tecla, sem índice de texto
// no banco. Se o acervo passar de ~5k obras, mover a busca para o servidor.
//
// EDIÇÃO DE REFERÊNCIA: cada arquivo vem classificado pela view em
// vigente | superada | instrucao. A biblioteca mostra a versão vigente
// como sendo "o produto"; as superadas ficam no histórico da ficha e os
// documentos de instrução (comprovante, contrato) na trilha de
// aprovação. Nunca reclassificar isso aqui — a regra é do banco, para
// que relatórios e auditoria herdem a mesma resposta.
//
// A Nota Técnica NÃO entra na biblioteca (fica só em Produtos) e o valor
// do produto não é exibido.
//
// PORTAL PÚBLICO: o super_admin marca arquivo a arquivo o que poderá ir ao
// portal público (fn_acervo_definir_publico). A situação efetiva vem de
// vw_acervo_publicacoes.valida — marcado E ainda vigente/aprovado.
//
// Buckets são privados: TODA leitura de arquivo passa por urlAssinada()
// ou abrirDoc(). Nunca usar href/src direto (ver CLAUDE.md § Storage).
// ═══════════════════════════════════════════════════════════════════════

let obras = [];              // vw_acervo_obras enriquecida
let midiasPorObra = {};      // obra_id → [midias]
let facetas = { atividades: [], fornecedores: [], resultados: [], anos: [], rotulos: [] };
let obraAberta = null;
let publicos = {};           // midia_id → linha de vw_acervo_publicacoes (publico = true)
let podePublicar = false;    // só super_admin marca para o portal público
let viewerUrlAtual = null;
let totalContratados = 0;   // produtos de contrato que a pessoa enxerga (aprovados ou não)

const CHAVE_RECENTES = 'dima_acervo_recentes';

// Estado de navegação da biblioteca
const filtro = {
  busca: '', rotulo: '', atividade: '', fornecedor: '',
  resultado: '', ano: '', formato: '', publico: '', lacuna: false, ordem: 'recentes', modo: 'estante',
};

const ROTULO_NOTA_TECNICA = 'Nota Técnica';

// ── Estados de acervo ────────────────────────────────────────────────
// Espelham situacao_acervo da view. A faixa do pôster é a classe .e-<situação> (css/acervo.css).
const ESTADOS = {
  aprovado:     { rotulo: 'Aprovado' },
  em_correcao:  { rotulo: 'Em correção' },
  em_avaliacao: { rotulo: 'Em avaliação' },
  sem_entrega:  { rotulo: 'Aguardando entrega' },
};
function estado(o) { return ESTADOS[o.situacao_acervo] || ESTADOS.sem_entrega; }

// ── Ícones de interface (SVG, sem emoji) ─────────────────────────────
const ACV_IC = {
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  livro: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  globo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  estante: '<path d="M3 5h18M3 12h18M3 19h18"/>',
  grade: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  esq: '<path d="m15 18-6-6 6-6"/>',
  dir: '<path d="m9 18 6-6-6-6"/>',
  olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  externo: '<path d="M14 3h7v7M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
};
function acvIc(n, cls) { return '<svg class="acv-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ACV_IC[n] || '') + '</svg>'; }
document.querySelectorAll('i[data-ic]').forEach(e => { e.outerHTML = acvIc(e.dataset.ic, 'p'); });

// Tema claro/escuro: mesmo 'diag_tema' da mesa do Diagnóstico e das demais guias (componente .dgm-tema)
function seletorTema() {
  const tb = document.querySelector('.topbar'); if (!tb || tb.querySelector('.dgm-tema') || typeof DiagTema === 'undefined') return;
  const d = document.createElement('div');
  d.className = 'dgm-tema'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Tema');
  d.innerHTML = [['claro', 'sol', 'Claro'], ['escuro', 'lua', 'Escuro']].map(x =>
    '<button type="button" data-tema="' + x[0] + '" aria-pressed="' + (DiagTema.atual() === x[0]) + '">' + acvIc(x[1]) + x[2] + '</button>').join('');
  const bc = tb.querySelector('.topbar-breadcrumb');
  if (bc) bc.parentNode.insertBefore(d, bc); else tb.appendChild(d);
  d.addEventListener('click', ev => {
    const b = ev.target.closest('[data-tema]'); if (!b) return;
    DiagTema.definir(b.dataset.tema);
    d.querySelectorAll('[data-tema]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
}

// ── Janelas: pilha (Esc fecha a de cima), foco no primeiro controle, Tab preso, foco volta ──
const ACV_FOCAVEIS = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),iframe,video,audio';
const acvPilha = [];
function acAbrir(id, alvo) {
  const el = document.getElementById(id);
  if (!el.classList.contains('aberto')) { acvPilha.push({ id, volta: document.activeElement }); el.classList.add('aberto'); }
  requestAnimationFrame(() => {
    const f = (alvo && document.getElementById(alvo)) || el.querySelector('.modal-close, .acv-vbtn.x');
    if (f) f.focus({ preventScroll: true });
  });
}
function acFechar(id) {
  const el = document.getElementById(id); if (!el) return;
  el.classList.remove('aberto');
  const k = acvPilha.findIndex(x => x.id === id);
  if (k >= 0) { const { volta } = acvPilha.splice(k, 1)[0]; if (volta && document.contains(volta)) volta.focus({ preventScroll: true }); }
}
const ACV_FECHAR = { 'modal-ficha': () => fecharFicha(), 'viewer': () => fecharViewer(), 'modal-pub': () => fecharConfPub(false) };

// ── Paletas de capa ──────────────────────────────────────────────────
// Fallback quando não há capa extraída do PDF. Determinístico a partir do
// id da obra, então a mesma obra tem sempre a mesma capa.
const PALETAS = [
  ['#1F4E2C', '#52B788'], ['#1A3A5C', '#2563EB'], ['#134E4A', '#2DD4BF'],
  ['#4C1D95', '#7C3AED'], ['#7C2D12', '#B5860D'], ['#0C4A6E', '#38BDF8'],
  ['#3F2E12', '#F4D35E'], ['#7F1D1D', '#F87171'], ['#164E63', '#22D3EE'],
  ['#14532D', '#4ADE80'],
];

function hashId(s) {
  let h = 0;
  const t = String(s || '');
  for (let i = 0; i < t.length; i++) { h = ((h << 5) - h + t.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

// ── Ícones por formato de mídia ──────────────────────────────────────
const ICONES = {
  documento:    { svg: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>', cor: '#2563EB', bg: '#EFF6FF' },
  planilha:     { svg: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>', cor: '#059669', bg: '#ECFDF5' },
  apresentacao: { svg: '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-4 5 4"/>', cor: '#D97706', bg: '#FFFBEB' },
  imagem:       { svg: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>', cor: '#7C3AED', bg: '#F5F3FF' },
  video:        { svg: '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/>', cor: '#DC2626', bg: '#FEF2F2' },
  audio:        { svg: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', cor: '#DB2777', bg: '#FDF2F8' },
  pacote:       { svg: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>', cor: '#6B7280', bg: '#F3F4F6' },
  outro:        { svg: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>', cor: '#6B7280', bg: '#F3F4F6' },
};
function icone(tipo) { return ICONES[tipo] || ICONES.outro; }
function svgIcone(tipo, tam, cor) {
  const i = icone(tipo);
  return '<svg viewBox="0 0 24 24" width="' + (tam || 16) + '" height="' + (tam || 16) + '" fill="none" stroke="'
    + (cor || i.cor) + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + i.svg + '</svg>';
}

// ── Utilitários ──────────────────────────────────────────────────────
// Normaliza para busca: minúsculo e sem acento ("relatorio" acha "Relatório")
function normalizar(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function fmtTam(b) {
  if (b == null || b === 0) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function anoDe(v) {
  if (!v) return null;
  const d = new Date(String(v).length === 10 ? v + 'T12:00:00' : v);
  return isNaN(d) ? null : d.getFullYear();
}

// Mídias de uma obra numa camada de versão
function midiasDa(obraId, camada) {
  return (midiasPorObra[obraId] || []).filter(m => m.versao_status === camada);
}

function recentes() {
  try { return JSON.parse(localStorage.getItem(CHAVE_RECENTES) || '[]'); } catch (e) { return []; }
}
function registrarRecente(obraId) {
  const lista = recentes().filter(id => id !== obraId);
  lista.unshift(obraId);
  try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista.slice(0, 12))); } catch (e) { /* cota cheia */ }
}

// ═══ Inicialização ═══════════════════════════════════════════════════
;(async function () {
  const usuario = await carregarUsuario();
  if (!usuario) { localStorage.setItem('dima_redirect', window.location.href); window.location.href = '../index.html'; return; }

  document.getElementById('app').innerHTML =
    gerarLayout('Acervo de Produtos', 'acervo')
    + '<div class="fade-in"><div class="acv-stage" id="palco">'
    + '<div class="acv-carregando" role="status">Carregando o acervo…</div>'
    + '</div></div>'
    + '</div></div></div>';

  carregarLogosSidebar();
  seletorTema();
  podePublicar = appState.perfil === 'super_admin';

  try {
    await carregarAcervo();
  } catch (e) {
    console.error('Falha ao carregar o acervo:', e);
    document.getElementById('palco').innerHTML =
      '<div class="acv-vazio"><div class="acv-vazio-ico">' + acvIc('alerta') + '</div>'
      + '<div class="acv-vazio-tit">Não foi possível carregar o acervo</div>'
      + '<div class="acv-vazio-sub">' + esc((e && e.message) || 'Erro inesperado.') + '</div></div>';
    return;
  }

  montarPalco();
  ligarAtalhos();

  // Deep link: ?obra=<uuid> abre a ficha direto
  const alvo = new URLSearchParams(window.location.search).get('obra');
  if (alvo) abrirFicha(alvo);
})();

// ═══ Carga ═══════════════════════════════════════════════════════════
async function carregarAcervo() {
  const [rObras, rMidias, rPub] = await Promise.all([
    db.from('vw_acervo_obras').select('*'),
    // Nota Técnica fica fora da biblioteca (consulta só em Produtos)
    db.from('vw_acervo_midias').select('*').neq('origem', 'nota_tecnica'),
    db.from('vw_acervo_publicacoes').select('*').eq('publico', true),
  ]);
  if (rObras.error) throw rObras.error;
  if (rMidias.error) throw rMidias.error;
  if (rPub.error) throw rPub.error;

  publicos = {};
  (rPub.data || []).forEach(p => { publicos[p.midia_id] = p; });

  const midias = rMidias.data || [];
  midiasPorObra = {};
  midias.forEach(m => {
    (midiasPorObra[m.obra_id] = midiasPorObra[m.obra_id] || []).push(m);
  });
  // Dentro da obra: vigente antes de superada, e mais recente primeiro
  const peso = { vigente: 0, instrucao: 1, superada: 2 };
  Object.keys(midiasPorObra).forEach(k => {
    midiasPorObra[k].sort((a, b) =>
      (peso[a.versao_status] - peso[b.versao_status])
      || (new Date(b.adicionado_em || 0) - new Date(a.adicionado_em || 0)));
  });

  // Acervo mostra só entregas aprovadas — pendente/em avaliação/em correção
  // ficam no módulo de Avaliação de Produtos, não na biblioteca pública.
  totalContratados = (rObras.data || []).length;
  obras = (rObras.data || []).filter(o => o.situacao_acervo === 'aprovado').map(o => {
    const ms = midiasPorObra[o.obra_id] || [];
    o._ano = anoDe(o.publicado_em || o.dt_entrega || o.criado_em);
    o._formatos = o.tipos_midia || [];        // formatos da edição vigente
    o._rotulos = (o.rotulos_midia || []).filter(r => r !== ROTULO_NOTA_TECNICA); // filtro por categoria
    o._rotulosVig = o.rotulos_vigentes || []; // só vigentes, alimenta as prateleiras
    o._publicos = contarPublicos(o.obra_id);
    // Índice de busca: inclui versões superadas de propósito — quem procura
    // pelo nome de um arquivo antigo deve chegar à obra e ver a versão que vale.
    o._busca = normalizar([
      o.titulo, o.fornecedor_nome, o.atividade_codigo, o.atividade_nome,
      o.contrato_numero, o.resultado_codigo, o.resultado_nome, o.observacoes,
      'produto ' + (o.numero_produto || ''),
      o._rotulos.join(' '),
      ms.map(m => m.arquivo_nome + ' ' + (m.despacho_numero || '')).join(' '),
    ].join(' '));
    return o;
  });

  // Facetas derivadas do que existe de fato no acervo
  const unicos = (arr, chave) => {
    const vistos = new Set();
    arr.forEach(o => { if (o[chave]) vistos.add(o[chave]); });
    return Array.from(vistos, valor => ({ valor, texto: valor }))
      .sort((a, b) => String(a.texto).localeCompare(String(b.texto), 'pt-BR'));
  };
  facetas.atividades = unicos(obras, 'atividade_codigo').map(f => ({
    valor: f.valor,
    texto: f.valor + ' — ' + ((obras.find(o => o.atividade_codigo === f.valor) || {}).atividade_nome || '').substring(0, 42),
  }));
  facetas.fornecedores = unicos(obras, 'fornecedor_nome');
  facetas.resultados = unicos(obras, 'resultado_codigo');
  facetas.anos = Array.from(new Set(obras.map(o => o._ano).filter(Boolean))).sort((a, b) => b - a);

  // Chips = categorias documentais presentes, mais frequentes antes
  const contagem = {};
  midias.forEach(m => { if (m.rotulo) contagem[m.rotulo] = (contagem[m.rotulo] || 0) + 1; });
  facetas.rotulos = Object.keys(contagem).map(r => ({ rotulo: r, n: contagem[r] })).sort((a, b) => b.n - a.n);
}

// Arquivos da obra que irão ao portal público (marcados e ainda válidos)
function contarPublicos(obraId) {
  return Object.values(publicos).filter(p => p.obra_id === obraId && p.valida).length;
}

// ═══ Filtro e ordenação ══════════════════════════════════════════════
function filtrarObras() {
  const termo = normalizar(filtro.busca).trim();
  const palavras = termo ? termo.split(/\s+/) : [];

  const lista = obras.filter(o => {
    if (palavras.length && !palavras.every(p => o._busca.includes(p))) return false;
    if (filtro.rotulo && o._rotulos.indexOf(filtro.rotulo) === -1) return false;
    if (filtro.formato && o._formatos.indexOf(filtro.formato) === -1) return false;
    if (filtro.atividade && o.atividade_codigo !== filtro.atividade) return false;
    if (filtro.fornecedor && o.fornecedor_nome !== filtro.fornecedor) return false;
    if (filtro.resultado && o.resultado_codigo !== filtro.resultado) return false;
    if (filtro.ano && String(o._ano) !== String(filtro.ano)) return false;
    if (filtro.publico === 'sim' && !o._publicos) return false;
    if (filtro.publico === 'nao' && o._publicos) return false;
    if (filtro.lacuna && o.total_vigentes > 0) return false;
    return true;
  });

  const ordens = {
    recentes: (a, b) => new Date(b.ordenacao_em || 0) - new Date(a.ordenacao_em || 0),
    titulo:   (a, b) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR'),
    numero:   (a, b) => (a.numero_produto || 0) - (b.numero_produto || 0),
    arquivos: (a, b) => (b.total_vigentes || 0) - (a.total_vigentes || 0),
  };
  return lista.sort(ordens[filtro.ordem] || ordens.recentes);
}

function filtroAtivo() {
  return !!(filtro.busca.trim() || filtro.rotulo || filtro.formato || filtro.atividade
    || filtro.fornecedor || filtro.resultado || filtro.ano || filtro.publico || filtro.lacuna);
}

// ═══ Render — palco completo ═════════════════════════════════════════
function montarPalco() {
  document.getElementById('palco').innerHTML = palcoHtml();
  renderCorpo();
}
function palcoHtml() {
  return kpisHtml() + barraComando() + '<div class="acv-filtros2">' + chipsHtml() + '</div>'
    + '<div class="acv-corpo" id="acervo-corpo"></div>';
}

// Números do topo. "Aprovados sem arquivo" = lacuna de dado (a entrega aprovada
// não teve arquivo); clicar filtra os produtos — nunca se esconde a lacuna.
function kpisHtml() {
  const nArq = obras.reduce((t, o) => t + (o.total_vigentes || 0), 0);
  const nSup = obras.reduce((t, o) => t + (o.total_superadas || 0), 0);
  const nPub = Object.values(publicos).filter(p => p.valida).length;
  const nLac = obras.filter(o => !o.total_vigentes).length;
  const kpi = (ic, l, v, sub) => '<div class="acv-kpi"><span class="acv-kpi-l">' + acvIc(ic, 'p') + l + '</span>'
    + '<span class="acv-kpi-v">' + v + '</span><span class="acv-kpi-s">' + sub + '</span></div>';
  return '<div class="acv-kpis">'
    + kpi('livro', 'Produtos no acervo', obras.length, 'aprovados' + (totalContratados > obras.length ? ' · ' + (totalContratados - obras.length) + ' ainda sem aprovação' : ''))
    + kpi('doc', 'Arquivos vigentes', nArq, nSup ? nSup + (nSup === 1 ? ' versão anterior' : ' versões anteriores') + ' no histórico' : 'sem versões anteriores')
    + kpi('globo', 'No portal público', nPub, nPub === 1 ? 'arquivo marcado e válido' : 'arquivos marcados e válidos')
    + (nLac
      ? '<button type="button" class="acv-kpi al' + (filtro.lacuna ? ' on' : '') + '" id="acv-lacuna" aria-pressed="' + filtro.lacuna + '">'
        + '<span class="acv-kpi-l">' + acvIc('alerta', 'p') + 'Aprovados sem arquivo</span><span class="acv-kpi-v">' + nLac + '</span>'
        + '<span class="acv-kpi-s">' + (filtro.lacuna ? 'mostrando · clique para voltar' : 'clique para ver') + '</span></button>'
      : kpi('check', 'Aprovados sem arquivo', 0, 'nenhuma lacuna'))
    + '</div>';
}

function barraComando() {
  const opc = (lista, sel, chaveV, chaveT) => lista.map(i => {
    const v = chaveV ? i[chaveV] : i, t = chaveT ? i[chaveT] : i;
    return '<option value="' + esc(v) + '"' + (String(sel) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>';
  }).join('');

  return '<div class="acv-cmd">'
    + '<div class="acv-busca">'
    + acvIc('busca', 'p acv-busca-ico')
    + '<input id="acv-q" type="search" placeholder="Buscar por título, consultor, atividade, arquivo…" aria-label="Buscar no acervo" value="' + esc(filtro.busca) + '" autocomplete="off">'
    + '<span class="acv-busca-kbd">/</span>'
    + '</div>'

    + '<select class="acv-sel" id="acv-ativ" title="Atividade" aria-label="Atividade"><option value="">Todas as atividades</option>'
    + opc(facetas.atividades, filtro.atividade, 'valor', 'texto') + '</select>'

    + '<select class="acv-sel" id="acv-forn" title="Consultor ou fornecedor" aria-label="Consultor ou fornecedor"><option value="">Todos os consultores</option>'
    + opc(facetas.fornecedores, filtro.fornecedor, 'valor', 'texto') + '</select>'

    + (facetas.resultados.length > 1
      ? '<select class="acv-sel" id="acv-res" title="Resultado" aria-label="Resultado"><option value="">Todos os resultados</option>'
        + opc(facetas.resultados, filtro.resultado, 'valor', 'texto') + '</select>'
      : '')

    + '<select class="acv-sel" id="acv-ano" title="Ano" aria-label="Ano"><option value="">Todos os anos</option>'
    + opc(facetas.anos, filtro.ano) + '</select>'

    + '<select class="acv-sel" id="acv-ordem" title="Ordenar" aria-label="Ordenar">'
    + opc([{ v: 'recentes', t: 'Mais recentes' }, { v: 'titulo', t: 'Título A–Z' },
           { v: 'numero', t: 'Nº do produto' }, { v: 'arquivos', t: 'Mais arquivos' }],
          filtro.ordem, 'v', 't') + '</select>'

    + '<div class="acv-toggle" role="group" aria-label="Exibição">'
    + '<button type="button" id="acv-m-estante" class="' + (filtro.modo === 'estante' ? 'on' : '') + '" aria-pressed="' + (filtro.modo === 'estante') + '" title="Prateleiras">'
    + acvIc('estante', 'p') + 'Estante</button>'
    + '<button type="button" id="acv-m-grade" class="' + (filtro.modo === 'grade' ? 'on' : '') + '" aria-pressed="' + (filtro.modo === 'grade') + '" title="Grade">'
    + acvIc('grade', 'p') + 'Grade</button>'
    + '</div>'

    + (filtroAtivo() ? '<button class="acv-limpar" id="acv-limpar" type="button">' + acvIc('x', 'p') + 'Limpar filtros</button>' : '')
    + '</div>';
}

// Filtro do portal público: obra "publicada" = tem ao menos 1 arquivo
// marcado e ainda válido (vw_acervo_publicacoes.valida).
function pubFiltroHtml() {
  const nPub = obras.filter(o => o._publicos).length;
  const opcoes = [
    { v: '', t: 'Todos', n: obras.length },
    { v: 'sim', t: 'Publicados', n: nPub },
    { v: 'nao', t: 'Não publicados', n: obras.length - nPub },
  ];
  return '<div class="acv-pubf" role="group" aria-label="Portal público">'
    + '<span class="acv-pubf-lbl">Portal público</span><span class="acv-pubf-grp">'
    + opcoes.map(op => '<button type="button" class="acv-pubf-btn' + (filtro.publico === op.v ? ' on' : '')
      + '" data-pubf="' + op.v + '" aria-pressed="' + (filtro.publico === op.v) + '">'
      + esc(op.t) + ' <span class="acv-chip-n">' + op.n + '</span></button>').join('')
    + '</span></div>';
}

function chipsHtml() {
  if (!facetas.rotulos.length) return pubFiltroHtml();
  const total = obras.filter(o => o.total_vigentes > 0).length;
  let h = '<div class="acv-chips" role="group" aria-label="Categoria">'
    + '<button type="button" class="acv-chip' + (filtro.rotulo ? '' : ' on') + '" data-rotulo="" aria-pressed="' + !filtro.rotulo + '">Todo o acervo <span class="acv-chip-n">' + total + '</span></button>';
  facetas.rotulos.forEach(r => {
    h += '<button type="button" class="acv-chip' + (filtro.rotulo === r.rotulo ? ' on' : '') + '" data-rotulo="' + esc(r.rotulo) + '" aria-pressed="' + (filtro.rotulo === r.rotulo) + '">'
      + esc(r.rotulo) + ' <span class="acv-chip-n">' + r.n + '</span></button>';
  });
  return h + '</div>' + pubFiltroHtml();
}

function renderCorpo() {
  const lista = filtrarObras();
  const corpo = document.getElementById('acervo-corpo');

  // Com filtro ativo a estante vira resultado de busca — prateleira temática
  // não faz sentido quando o usuário já disse o que procura.
  if (filtro.modo === 'grade' || filtroAtivo()) {
    corpo.innerHTML = lista.length
      ? '<div class="acv-prat-cab" style="padding-top:16px">'
        + '<span class="acv-prat-tit">' + (filtro.lacuna ? 'Aprovados sem arquivo na versão vigente' : filtroAtivo() ? 'Resultados' : 'Todo o acervo') + '</span>'
        + '<span class="acv-prat-n">' + lista.length + (lista.length === 1 ? ' obra' : ' obras') + '</span></div>'
        + '<div class="acv-grade">' + lista.map(cardHtml).join('') + '</div>'
      : vazioHtml();
    ligarCards();
    return;
  }

  corpo.innerHTML = prateleirasHtml(lista);
  ligarCards();
}

function vazioHtml() {
  return '<div class="acv-vazio"><div class="acv-vazio-ico">' + acvIc('busca') + '</div>'
    + '<div class="acv-vazio-tit">Nada encontrado no acervo</div>'
    + '<div class="acv-vazio-sub">Tente outro termo, ou limpe os filtros para ver a coleção completa.</div></div>';
}

// ── Prateleiras ──────────────────────────────────────────────────────
function prateleirasHtml(lista) {
  const publicadas = lista.filter(o => o.total_vigentes > 0);
  const prats = [];

  const vistas = recentes();
  const continuar = vistas.map(id => publicadas.find(o => o.obra_id === id)).filter(Boolean);
  if (continuar.length) prats.push({ titulo: 'Continuar de onde parou', itens: continuar });

  prats.push({ titulo: 'Adicionados recentemente', itens: publicadas.slice(0, 20) });

  // Prateleira temática pelo rótulo da EDIÇÃO VIGENTE — nunca pelo de uma
  // versão devolvida nem por documento de instrução.
  facetas.rotulos.forEach(r => {
    const itens = publicadas.filter(o => o._rotulosVig.indexOf(r.rotulo) !== -1);
    if (itens.length >= 2) prats.push({ titulo: r.rotulo, itens: itens });
  });

  const av = publicadas.filter(o => ['video', 'imagem', 'audio'].some(t => o._formatos.indexOf(t) !== -1));
  if (av.length) prats.push({ titulo: 'Registros audiovisuais', itens: av });

  // Coleções por atividade, das mais volumosas para as menores
  const porAtiv = {};
  publicadas.forEach(o => {
    if (!o.atividade_codigo) return;
    (porAtiv[o.atividade_codigo] = porAtiv[o.atividade_codigo] || []).push(o);
  });
  Object.keys(porAtiv).sort((a, b) => porAtiv[b].length - porAtiv[a].length).slice(0, 6).forEach(cod => {
    const nome = (porAtiv[cod][0].atividade_nome || '').substring(0, 60);
    prats.push({ titulo: 'Atividade ' + cod + (nome ? ' · ' + nome : ''), itens: porAtiv[cod] });
  });

  if (!prats.length) return vazioHtml();

  return prats.map((p, i) => {
    const id = 'trilho-' + i;
    return '<div class="acv-prat">'
      + '<div class="acv-prat-cab"><span class="acv-prat-tit">' + esc(p.titulo) + '</span>'
      + '<span class="acv-prat-n">' + p.itens.length + '</span></div>'
      + '<div class="acv-trilho-wrap">'
      + '<button class="acv-seta acv-seta-e" type="button" data-trilho="' + id + '" data-dir="-1" aria-label="Anterior">' + acvIc('esq') + '</button>'
      + '<div class="acv-trilho" id="' + id + '">' + p.itens.map(cardHtml).join('') + '</div>'
      + '<button class="acv-seta acv-seta-d" type="button" data-trilho="' + id + '" data-dir="1" aria-label="Próximo">' + acvIc('dir') + '</button>'
      + '</div></div>';
  }).join('');
}

// ── Card / pôster ────────────────────────────────────────────────────
function posterHtml(o) {
  const par = PALETAS[hashId(o.obra_id) % PALETAS.length];
  const ang = 135 + (hashId(o.obra_id + 'a') % 60);
  const tipo = (o._formatos && o._formatos[0]) || 'documento';
  const apagado = o.total_vigentes === 0;

  // data-capa-obra: âncora para acervo-capas.js trocar o degradê pela 1ª
  // página do PDF quando o pôster entrar na viewport.
  return '<div class="acv-poster' + (apagado ? ' apagado' : '') + '" data-capa-obra="' + esc(o.obra_id) + '"'
    + ' style="background:linear-gradient(' + ang + 'deg,' + par[0] + ',' + par[1] + ')">'
    + '<div class="acv-poster-selo e-' + esc(o.situacao_acervo || 'sem_entrega') + '"></div>'
    + '<div class="acv-poster-top">'
    + '<span class="acv-poster-tags">'
    + (o.atividade_codigo ? '<span class="acv-poster-ativ">' + esc(o.atividade_codigo) + '</span>' : '')
    + (o.entrega_ref_numero > 1
      ? '<span class="acv-poster-ver" title="Versão vigente após correção">v' + esc(o.entrega_ref_numero) + '</span>' : '')
    + '</span>'
    + '<span class="acv-poster-ico">' + svgIcone(tipo, 17, 'rgba(255,255,255,.92)') + '</span>'
    + '</div>'
    + '<span class="acv-poster-num">' + (o.numero_produto != null ? esc(o.numero_produto) : '') + '</span>'
    + '<div class="acv-poster-tit">' + esc(o.titulo || 'Produto sem descrição') + '</div>'
    + '</div>';
}

function cardHtml(o) {
  const n = o.total_vigentes || 0;
  let info;
  if (n > 0) {
    info = acvIc('doc')
      + '<span>' + n + (n === 1 ? ' arquivo' : ' arquivos') + '</span>';
  } else if (o.situacao_acervo === 'aprovado') {
    // Aprovado sem arquivo na versão vigente: lacuna de dado, não se esconde.
    info = '<span class="acv-card-lacuna">Sem arquivo na versão vigente</span>';
  } else {
    info = '<span>' + esc(estado(o).rotulo) + '</span>';
  }
  return '<button class="acv-card" type="button" data-obra="' + esc(o.obra_id) + '">'
    + posterHtml(o)
    + '<div class="acv-card-pe">'
    + '<div class="acv-card-tit">' + esc(o.titulo || 'Produto sem descrição') + '</div>'
    + '<div class="acv-card-forn">' + esc(o.fornecedor_nome || '—') + '</div>'
    + '<div class="acv-card-info">' + info
    + (o._ano ? '<span>&middot; ' + o._ano + '</span>' : '')
    + (o._publicos ? '<span class="acv-card-pub" title="Arquivo marcado para o portal público">&middot; Público</span>' : '')
    + '</div></div></button>';
}

// ═══ Eventos ═════════════════════════════════════════════════════════
function ligarCards() {
  document.querySelectorAll('[data-obra]').forEach(el => {
    el.onclick = () => abrirFicha(el.dataset.obra);
  });
  // Capas da 1ª página do PDF (acervo-capas.js), se o módulo estiver presente
  if (typeof ligarCapas === 'function') {
    const indice = {};
    obras.forEach(o => { indice[o.obra_id] = o; });
    ligarCapas(indice);
  }
  document.querySelectorAll('.acv-seta').forEach(b => {
    b.onclick = () => {
      const t = document.getElementById(b.dataset.trilho);
      if (t) t.scrollBy({ left: Number(b.dataset.dir) * Math.max(t.clientWidth - 120, 240), behavior: 'smooth' });
    };
  });
}

// Religa a barra de comando após cada re-render, preservando foco e cursor
function religarComando(focoBusca) {
  const q = document.getElementById('acv-q');
  if (q) {
    q.oninput = () => { filtro.busca = q.value; redesenhar(true); };
    if (focoBusca) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  const bind = (id, chave) => {
    const el = document.getElementById(id);
    if (el) el.onchange = () => { filtro[chave] = el.value; redesenhar(false); };
  };
  bind('acv-ativ', 'atividade'); bind('acv-forn', 'fornecedor');
  bind('acv-res', 'resultado');  bind('acv-ano', 'ano');
  bind('acv-ordem', 'ordem');

  const est = document.getElementById('acv-m-estante');
  const gra = document.getElementById('acv-m-grade');
  if (est) est.onclick = () => { filtro.modo = 'estante'; redesenhar(false); };
  if (gra) gra.onclick = () => { filtro.modo = 'grade'; redesenhar(false); };

  const limpar = document.getElementById('acv-limpar');
  if (limpar) limpar.onclick = () => {
    Object.assign(filtro, { busca: '', rotulo: '', atividade: '', fornecedor: '', resultado: '', ano: '', formato: '', publico: '', lacuna: false });
    redesenhar(false);
  };

  const lac = document.getElementById('acv-lacuna');
  if (lac) lac.onclick = () => { filtro.lacuna = !filtro.lacuna; redesenhar(false); };

  document.querySelectorAll('[data-pubf]').forEach(b => {
    b.onclick = () => { filtro.publico = b.dataset.pubf || ''; redesenhar(false); };
  });
  document.querySelectorAll('.acv-chip').forEach(c => {
    c.onclick = () => { filtro.rotulo = c.dataset.rotulo || ''; redesenhar(false); };
  });
}

function redesenhar(focoBusca) {
  const palco = document.getElementById('palco');
  palco.innerHTML = palcoHtml();
  renderCorpo();
  religarComando(focoBusca);
}

function ligarAtalhos() {
  religarComando(false);
  ['modal-ficha', 'modal-pub'].forEach(id => document.getElementById(id).addEventListener('click', e => { if (e.target.id === id) ACV_FECHAR[id](); }));
  document.addEventListener('keydown', ev => {
    const topo = acvPilha[acvPilha.length - 1];
    if (topo) {
      const el = document.getElementById(topo.id);
      if (ev.key === 'Escape') { ev.preventDefault(); (ACV_FECHAR[topo.id] || (() => acFechar(topo.id)))(); }
      else if (ev.key === 'Tab') {
        const f = [...el.querySelectorAll(ACV_FOCAVEIS)].filter(x => x.offsetParent !== null);
        if (!f.length) return;
        const pri = f[0], ult = f[f.length - 1];
        if (!el.contains(document.activeElement)) { ev.preventDefault(); pri.focus(); }
        else if (ev.shiftKey && document.activeElement === pri) { ev.preventDefault(); ult.focus(); }
        else if (!ev.shiftKey && document.activeElement === ult) { ev.preventDefault(); pri.focus(); }
      }
      return;
    }
    // "/" foca a busca, desde que não se esteja digitando em outro campo
    const alvo = ev.target;
    const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT');
    if (ev.key === '/' && !digitando) {
      ev.preventDefault();
      const q = document.getElementById('acv-q');
      if (q) q.focus();
    }
  });
}

// ═══ Ficha da obra ═══════════════════════════════════════════════════
function linhaMidia(m, superada) {
  const tipo = ICONES[m.midia_tipo] ? m.midia_tipo : 'outro';
  return '<div class="acv-midia' + (superada ? ' acv-midia-sup' : '') + '" data-midia="' + esc(m.midia_id) + '" role="button" tabindex="0"'
    + ' aria-label="Visualizar ' + esc(m.arquivo_nome || 'arquivo') + '">'
    + '<div class="acv-midia-ico t-' + tipo + '">' + svgIcone(tipo, 19, 'currentColor') + '</div>'
    + '<div class="acv-midia-corpo">'
    + '<div class="acv-midia-nome">' + esc(m.arquivo_nome || 'Arquivo') + '</div>'
    + '<div class="acv-midia-sub">'
    + (m.rotulo ? '<span class="acv-midia-rot">' + esc(m.rotulo) + '</span>' : '')
    + (superada ? '<span class="acv-midia-rot acv-rot-sup">Devolvida</span>' : '')
    + (m.numero_entrega ? '<span>Entrega ' + esc(m.numero_entrega) + '</span>' : '')
    + (m.extensao ? '<span>' + esc(m.extensao.toUpperCase()) + '</span>' : '')
    + (m.arquivo_tamanho ? '<span>' + esc(fmtTam(m.arquivo_tamanho)) + '</span>' : '')
    + (m.adicionado_em ? '<span>' + esc(fmtData(m.adicionado_em)) + '</span>' : '')
    + (m.despacho_numero ? '<span>Despacho ' + esc(m.despacho_numero) + '</span>' : '')
    + '</div></div>'
    + controlePublico(m)
    + '<span class="acv-midia-acao">' + acvIc('olho', 'p') + 'Visualizar</span>'
    + '</div>';
}

// Portal público: super_admin marca/desmarca; os demais só veem o selo.
// Só arquivo vigente pode ser marcado — o banco recusa o resto.
// Marcado que deixou de valer (produto reentregue) aparece para ser
// desmarcado, mas não vai ao portal (vw_acervo_publicacoes.valida).
function controlePublico(m) {
  const pub = publicos[m.midia_id];
  const vigente = m.versao_status === 'vigente';
  if (pub && !pub.valida) {
    return '<span class="acv-pub-selo acv-pub-invalido" title="Marcado para o portal público, mas deixou de ser a versão vigente — não será exibido">Público (sem efeito)</span>'
      + (podePublicar ? '<button type="button" class="acv-pub-btn" data-pub="' + esc(m.midia_id) + '">Desmarcar</button>' : '');
  }
  if (!vigente) return '';
  if (podePublicar) {
    return '<button type="button" class="acv-pub-btn' + (pub ? ' on' : '') + '" data-pub="' + esc(m.midia_id) + '"'
      + ' title="' + (pub ? 'Clique para tirar do portal público' : 'Clique para liberar no portal público') + '">'
      + (pub ? acvIc('check') + 'Público' : acvIc('globo') + 'Marcar como público') + '</button>';
  }
  return pub ? '<span class="acv-pub-selo" title="Marcado para o portal público">Público</span>' : '';
}

async function alternarPublico(midiaId) {
  const m = (midiasPorObra[obraAberta && obraAberta.obra_id] || []).find(x => x.midia_id === midiaId);
  const marcar = !publicos[midiaId];
  if (marcar && !(await confirmarPub((m && m.arquivo_nome) || 'este arquivo'))) return;

  const { error } = await db.rpc('fn_acervo_definir_publico', { p_midia_id: midiaId, p_publico: marcar });
  if (error) {
    const msgs = {
      'acervo:sem_permissao': 'Só super_admin marca arquivos para o portal público.',
      'acervo:arquivo_administrativo': 'Documento administrativo não vai ao portal público.',
      'acervo:arquivo_nao_vigente': 'Só a versão vigente do produto pode ser marcada.',
      'acervo:produto_nao_aprovado': 'O produto precisa estar aprovado.',
      'acervo:arquivo_inexistente': 'Arquivo não encontrado no acervo.',
    };
    toast(msgs[error.message] || ('Não foi possível salvar: ' + error.message), 'error');
    return;
  }

  // Relê a situação efetiva (valida) da marcação no banco
  const { data } = await db.from('vw_acervo_publicacoes').select('*').eq('midia_id', midiaId).eq('publico', true);
  if (data && data.length) publicos[midiaId] = data[0]; else delete publicos[midiaId];

  const obraId = obraAberta.obra_id;
  const o = obras.find(x => x.obra_id === obraId);
  if (o) o._publicos = contarPublicos(obraId);
  toast(marcar ? 'Arquivo liberado para o portal público.' : 'Arquivo retirado do portal público.', 'success');
  redesenhar(false);
  abrirFicha(obraId);
}

// Janela própria (no lugar do confirm do navegador): mesmo lembrete de dado pessoal, um clique
let pubResolver = null;
function confirmarPub(nome) {
  document.getElementById('pub-arq').textContent = nome;
  acAbrir('modal-pub', 'pub-ok');
  return new Promise(res => { pubResolver = res; });
}
function fecharConfPub(ok) {
  acFechar('modal-pub');
  if (pubResolver) { const r = pubResolver; pubResolver = null; r(!!ok); }
}

function abrirFicha(obraId) {
  const o = obras.find(x => x.obra_id === obraId);
  if (!o) { toast('Produto não encontrado no acervo.', 'warning'); return; }
  obraAberta = o;
  registrarRecente(obraId);

  const vigentes = midiasDa(obraId, 'vigente');
  const superadas = midiasDa(obraId, 'superada');
  const instrucao = midiasDa(obraId, 'instrucao');

  document.getElementById('ficha-cab').innerHTML =
    'Produto ' + esc(o.numero_produto != null ? o.numero_produto : '—')
    + ' &middot; <span style="font-weight:400;color:var(--txt-3)">Contrato ' + esc(o.contrato_numero || '—') + '</span>';

  // `dica` vira title= para o texto que a grade corta em 3 linhas
  const dado = (lbl, val, dica) => '<div><div class="acv-dado-lbl">' + esc(lbl) + '</div>'
    + '<div class="acv-dado-val"' + (dica ? ' title="' + esc(dica) + '"' : '') + '>' + val + '</div></div>';

  let body = '<div class="acv-ficha-topo">'
    + '<div>' + posterHtml(o) + '</div>'
    + '<div>'
    + '<div class="acv-ficha-tit">' + esc(o.titulo || 'Produto sem descrição') + '</div>'
    + '<div class="acv-ficha-meta">'
    + '<span class="acv-selo selo-f-' + esc(o.situacao_acervo || 'sem_entrega') + '">'
    + (o.situacao_acervo === 'aprovado' ? acvIc('check') : '') + esc(estado(o).rotulo) + (o.aprovacao_parcial ? ' · parcial' : '') + '</span>'
    + (o.entrega_ref_numero > 1
      ? '<span class="acv-midia-rot">Versão ' + esc(o.entrega_ref_numero) + '</span>' : '')
    + (o.atividade_codigo ? '<span class="acv-midia-rot neu">Atividade ' + esc(o.atividade_codigo) + '</span>' : '')
    + (o.resultado_codigo ? '<span class="acv-midia-rot res">' + esc(o.resultado_codigo) + '</span>' : '')
    + '</div>'
    + '<div class="acv-ficha-dados">'
    + dado('Consultor / Fornecedor', esc(o.fornecedor_nome || '—'))
    + dado('Atividade', esc(o.atividade_nome || '—'), o.atividade_nome)
    + dado('Entrega', esc(fmtData(o.entrega_ref_data || o.dt_entrega)))
    + dado('Prazo contratual', esc(fmtData(o.dt_vencimento)))
    + dado('Última atualização', esc(o.publicado_em ? fmtData(o.publicado_em) : '—'))
    + '</div></div></div>';

  if (o.aprovacao_parcial) {
    body += '<div class="acv-aviso acv-aviso-info">' + acvIc('info', 'p') + '<span>A entrega de referência foi aprovada '
      + 'parcialmente. Os arquivos abaixo valem, mas o produto ainda não está completo.</span></div>';
  }

  if (o.contrato_objeto) {
    body += '<div class="acv-secao-tit">Objeto do contrato</div>'
      + '<div class="acv-texto">' + esc(o.contrato_objeto) + '</div>';
  }
  if (o.parecer_avaliador) {
    body += '<div class="acv-secao-tit">Parecer do avaliador</div>'
      + '<div class="acv-texto" style="white-space:pre-wrap">' + esc(o.parecer_avaliador) + '</div>';
  }

  // ── Versão vigente ──
  body += '<div class="acv-secao-tit">Versão vigente'
    + (o.entrega_ref_numero ? ' &middot; entrega ' + esc(o.entrega_ref_numero) : '')
    + ' &middot; ' + vigentes.length
    + (o._publicos ? ' &middot; ' + o._publicos + ' no portal público' : '') + '</div>';
  if (podePublicar && vigentes.length) {
    body += '<div class="acv-pub-dica">Marque os arquivos que poderão aparecer no portal público. '
      + 'Só arquivos marcados serão exibidos lá.</div>';
  }
  if (vigentes.length) {
    body += vigentes.map(m => linhaMidia(m, false)).join('');
  } else if (o.situacao_acervo === 'aprovado') {
    body += '<div class="acv-aviso acv-aviso-alerta">' + acvIc('alerta', 'p') + '<span><strong>A entrega aprovada não tem arquivo anexado.</strong> '
      + (superadas.length
        ? 'O único documento no sistema é o da versão devolvida, no histórico abaixo — ele não substitui o produto aprovado.'
        : 'Não há nenhum documento registrado para este produto.')
      + ' Confira no módulo de Avaliação de Produtos se falta anexar o documento final.</span></div>';
  } else {
    body += '<div class="acv-texto" style="padding:10px 0;color:var(--txt-3)">'
      + esc(estado(o).rotulo) + ' — ainda não há arquivo aprovado para este produto.</div>';
  }

  // ── Versões anteriores ──
  if (superadas.length) {
    body += '<details class="acv-hist"><summary>' + acvIc('dir') + 'Versões anteriores &middot; ' + superadas.length
      + '<span class="acv-hist-nota">substituídas pela versão vigente</span></summary>'
      + superadas.map(m => linhaMidia(m, true)).join('')
      + '</details>';
  }

  // ── Trilha de aprovação ──
  if (instrucao.length) {
    body += '<div class="acv-secao-tit">Trilha de aprovação &middot; ' + instrucao.length + '</div>'
      + instrucao.map(m => linhaMidia(m, false)).join('');
  }

  document.getElementById('ficha-body').innerHTML = body;

  // Rodapé: atalho para o módulo de avaliação da entrega de referência
  const entregaAlvo = o.entrega_ref_id || (midiasPorObra[obraId] || []).map(m => m.entrega_id).filter(Boolean)[0];
  document.getElementById('ficha-footer').innerHTML =
    (entregaAlvo ? '<a class="btn btn-secondary" href="produtos.html?entrega=' + esc(entregaAlvo) + '">Abrir na avaliação de produtos</a>' : '')
    + '<button class="btn btn-primary" onclick="fecharFicha()">Fechar</button>';

  document.getElementById('ficha-body').querySelectorAll('[data-midia]').forEach(el => {
    el.onclick = () => abrirViewer(el.dataset.midia);
    el.onkeydown = ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === el) { ev.preventDefault(); abrirViewer(el.dataset.midia); } };
  });
  document.getElementById('ficha-body').querySelectorAll('[data-pub]').forEach(el => {
    el.onclick = ev => { ev.stopPropagation(); el.disabled = true; alternarPublico(el.dataset.pub).finally(() => { el.disabled = false; }); };
  });

  // O pôster da ficha também traz data-capa-obra, mas só ligarCards() (grade/
  // estante) registra o observer — aqui religamos para este pôster específico.
  if (typeof ligarCapas === 'function') {
    const indice = {};
    obras.forEach(x => { indice[x.obra_id] = x; });
    ligarCapas(indice);
  }

  acAbrir('modal-ficha');
  document.getElementById('ficha-body').scrollTop = 0;
}

function fecharFicha() {
  acFechar('modal-ficha');
  obraAberta = null;
}

// ═══ Visualizador ════════════════════════════════════════════════════
async function abrirViewer(midiaId) {
  const m = (midiasPorObra[obraAberta && obraAberta.obra_id] || []).find(x => x.midia_id === midiaId);
  if (!m) return;

  const overlay = document.getElementById('viewer');
  const corpo = document.getElementById('viewer-corpo');
  document.getElementById('viewer-nome').textContent = m.arquivo_nome || 'Arquivo';
  document.getElementById('viewer-sub').textContent =
    [m.versao_status === 'superada' ? 'VERSÃO DEVOLVIDA' : null,
     m.rotulo, m.extensao && m.extensao.toUpperCase(), fmtTam(m.arquivo_tamanho), fmtData(m.adicionado_em)]
      .filter(Boolean).join(' · ');
  corpo.innerHTML = '<div style="color:rgba(255,255,255,.6);font-size:13px">Preparando o arquivo…</div>';
  acAbrir('viewer');

  viewerUrlAtual = m.arquivo_url;
  document.getElementById('viewer-abrir').onclick = () => abrirDoc(m.arquivo_url);

  // Bucket privado: a URL só serve depois de assinada.
  let assinada;
  try {
    assinada = await urlAssinada(m.arquivo_url);
  } catch (e) {
    corpo.innerHTML = '<div style="color:#FCA5A5;font-size:13px">Não foi possível liberar o arquivo.</div>';
    return;
  }
  if (!overlay.classList.contains('aberto') || viewerUrlAtual !== m.arquivo_url) return; // fechou/trocou durante o await

  if (m.midia_tipo === 'imagem') {
    corpo.innerHTML = '<img alt="' + esc(m.arquivo_nome || '') + '">';
    corpo.firstChild.src = assinada;
  } else if (m.midia_tipo === 'video') {
    corpo.innerHTML = '<video controls playsinline preload="metadata"></video>';
    corpo.firstChild.src = assinada;
  } else if (m.midia_tipo === 'audio') {
    corpo.innerHTML = '<audio controls style="width:min(560px,90%)"></audio>';
    corpo.firstChild.src = assinada;
  } else if (m.extensao === 'pdf') {
    corpo.innerHTML = '<iframe title="' + esc(m.arquivo_nome || 'Documento') + '"></iframe>';
    corpo.firstChild.src = assinada;
  } else {
    // Formatos que o navegador não renderiza (docx, xlsx, zip…)
    corpo.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,.72);max-width:380px">'
      + '<div style="margin-bottom:14px">' + svgIcone(m.midia_tipo, 44, 'rgba(255,255,255,.5)') + '</div>'
      + '<div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:7px">Pré-visualização indisponível</div>'
      + '<div style="font-size:13px;line-height:1.55">O navegador não exibe arquivos '
      + esc((m.extensao || 'desse tipo').toUpperCase()) + ' diretamente. Use “Abrir em nova aba” para baixar.</div></div>';
  }
}

function fecharViewer() {
  acFechar('viewer');
  // Zera o src para interromper download/reprodução em andamento
  document.getElementById('viewer-corpo').innerHTML = '';
  viewerUrlAtual = null;
}
