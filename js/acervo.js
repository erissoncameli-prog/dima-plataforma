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
// documentos de instrução (nota técnica, comprovante) na trilha de
// aprovação. Nunca reclassificar isso aqui — a regra é do banco, para
// que relatórios e auditoria herdem a mesma resposta.
//
// Buckets são privados: TODA leitura de arquivo passa por urlAssinada()
// ou abrirDoc(). Nunca usar href/src direto (ver CLAUDE.md § Storage).
// ═══════════════════════════════════════════════════════════════════════

let obras = [];              // vw_acervo_obras enriquecida
let midiasPorObra = {};      // obra_id → [midias]
let facetas = { atividades: [], fornecedores: [], resultados: [], anos: [], rotulos: [] };
let obraAberta = null;
let viewerUrlAtual = null;

const CHAVE_RECENTES = 'dima_acervo_recentes';

// Estado de navegação da biblioteca
const filtro = {
  busca: '', rotulo: '', atividade: '', fornecedor: '',
  resultado: '', ano: '', formato: '', ordem: 'recentes', modo: 'estante',
};

// ── Estados de acervo ────────────────────────────────────────────────
// Espelham situacao_acervo da view. `cor` pinta a faixa do pôster.
const ESTADOS = {
  aprovado:     { rotulo: 'Aprovado',           cor: '#52B788' },
  em_correcao:  { rotulo: 'Em correção',        cor: '#EF4444' },
  em_avaliacao: { rotulo: 'Em avaliação',       cor: '#2563EB' },
  sem_entrega:  { rotulo: 'Aguardando entrega', cor: '#94A3B8' },
};
function estado(o) { return ESTADOS[o.situacao_acervo] || ESTADOS.sem_entrega; }

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
  if (!usuario) { window.location.href = '../index.html'; return; }

  document.getElementById('app').innerHTML =
    gerarLayout('Acervo de Produtos', 'acervo')
    + '<div class="fade-in"><div class="acv-stage" id="palco">'
    + '<div style="padding:60px 22px;text-align:center;color:rgba(255,255,255,.6);font-size:13px">Carregando o acervo…</div>'
    + '</div></div>'
    + '</div></div></div>';

  carregarLogosSidebar();

  try {
    await carregarAcervo();
  } catch (e) {
    console.error('Falha ao carregar o acervo:', e);
    document.getElementById('palco').innerHTML =
      '<div class="acv-vazio"><div class="acv-vazio-ico">&#x26A0;</div>'
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
  const [rObras, rMidias] = await Promise.all([
    db.from('vw_acervo_obras').select('*'),
    db.from('vw_acervo_midias').select('*'),
  ]);
  if (rObras.error) throw rObras.error;
  if (rMidias.error) throw rMidias.error;

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

  obras = (rObras.data || []).map(o => {
    const ms = midiasPorObra[o.obra_id] || [];
    o._ano = anoDe(o.publicado_em || o.dt_entrega || o.criado_em);
    o._formatos = o.tipos_midia || [];        // formatos da edição vigente
    o._rotulos = o.rotulos_midia || [];       // todos, alimenta o filtro por categoria
    o._rotulosVig = o.rotulos_vigentes || []; // só vigentes, alimenta as prateleiras
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
    || filtro.fornecedor || filtro.resultado || filtro.ano);
}

// ═══ Render — palco completo ═════════════════════════════════════════
function montarPalco() {
  document.getElementById('palco').innerHTML = barraComando() + chipsHtml() + '<div id="acervo-corpo"></div>';
  renderCorpo();
}

function barraComando() {
  const opc = (lista, sel, chaveV, chaveT) => lista.map(i => {
    const v = chaveV ? i[chaveV] : i, t = chaveT ? i[chaveT] : i;
    return '<option value="' + esc(v) + '"' + (String(sel) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>';
  }).join('');

  return '<div class="acv-cmd">'
    + '<div class="acv-busca">'
    + '<svg class="acv-busca-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'
    + '<input id="acv-q" type="search" placeholder="Buscar por título, consultor, atividade, arquivo…" value="' + esc(filtro.busca) + '" autocomplete="off">'
    + '<span class="acv-busca-kbd">/</span>'
    + '</div>'

    + '<select class="acv-sel" id="acv-ativ" title="Atividade"><option value="">Todas as atividades</option>'
    + opc(facetas.atividades, filtro.atividade, 'valor', 'texto') + '</select>'

    + '<select class="acv-sel" id="acv-forn" title="Consultor ou fornecedor"><option value="">Todos os consultores</option>'
    + opc(facetas.fornecedores, filtro.fornecedor, 'valor', 'texto') + '</select>'

    + (facetas.resultados.length > 1
      ? '<select class="acv-sel" id="acv-res" title="Resultado"><option value="">Todos os resultados</option>'
        + opc(facetas.resultados, filtro.resultado, 'valor', 'texto') + '</select>'
      : '')

    + '<select class="acv-sel" id="acv-ano" title="Ano"><option value="">Todos os anos</option>'
    + opc(facetas.anos, filtro.ano) + '</select>'

    + '<select class="acv-sel" id="acv-ordem" title="Ordenar">'
    + opc([{ v: 'recentes', t: 'Mais recentes' }, { v: 'titulo', t: 'Título A–Z' },
           { v: 'numero', t: 'Nº do produto' }, { v: 'arquivos', t: 'Mais arquivos' }],
          filtro.ordem, 'v', 't') + '</select>'

    + '<div class="acv-toggle">'
    + '<button type="button" id="acv-m-estante" class="' + (filtro.modo === 'estante' ? 'on' : '') + '" title="Prateleiras">'
    + '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 5h18"/><path d="M3 12h18"/><path d="M3 19h18"/></svg>Estante</button>'
    + '<button type="button" id="acv-m-grade" class="' + (filtro.modo === 'grade' ? 'on' : '') + '" title="Grade">'
    + '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>Grade</button>'
    + '</div>'

    + (filtroAtivo() ? '<button class="acv-limpar" id="acv-limpar" type="button">Limpar filtros</button>' : '')
    + '</div>';
}

function chipsHtml() {
  if (!facetas.rotulos.length) return '';
  const total = obras.filter(o => o.total_vigentes > 0).length;
  let h = '<div class="acv-chips">'
    + '<button class="acv-chip' + (filtro.rotulo ? '' : ' on') + '" data-rotulo="">Todo o acervo <span class="acv-chip-n">' + total + '</span></button>';
  facetas.rotulos.forEach(r => {
    h += '<button class="acv-chip' + (filtro.rotulo === r.rotulo ? ' on' : '') + '" data-rotulo="' + esc(r.rotulo) + '">'
      + esc(r.rotulo) + ' <span class="acv-chip-n">' + r.n + '</span></button>';
  });
  return h + '</div>';
}

function renderCorpo() {
  const lista = filtrarObras();
  const corpo = document.getElementById('acervo-corpo');

  // Com filtro ativo a estante vira resultado de busca — prateleira temática
  // não faz sentido quando o usuário já disse o que procura.
  if (filtro.modo === 'grade' || filtroAtivo()) {
    corpo.innerHTML = lista.length
      ? '<div class="acv-prat-cab" style="padding-top:18px">'
        + '<span class="acv-prat-tit">' + (filtroAtivo() ? 'Resultados' : 'Todo o acervo') + '</span>'
        + '<span class="acv-prat-n">' + lista.length + (lista.length === 1 ? ' obra' : ' obras') + '</span></div>'
        + '<div class="acv-grade">' + lista.map(cardHtml).join('') + '</div>'
      : vazioHtml();
    ligarCards();
    return;
  }

  corpo.innerHTML = heroHtml(lista) + prateleirasHtml(lista);
  ligarCards();
}

function vazioHtml() {
  return '<div class="acv-vazio"><div class="acv-vazio-ico">&#x1F50D;</div>'
    + '<div class="acv-vazio-tit">Nada encontrado no acervo</div>'
    + '<div class="acv-vazio-sub">Tente outro termo, ou limpe os filtros para ver a coleção completa.</div></div>';
}

// ── Hero ─────────────────────────────────────────────────────────────
function heroHtml(lista) {
  const d = lista.filter(o => o.situacao_acervo === 'aprovado' && o.total_vigentes > 0)[0];
  if (!d) return '';
  const pilula = txt => '<span class="acv-selo" style="background:rgba(255,255,255,.13);color:rgba(255,255,255,.88);border:1px solid rgba(255,255,255,.2)">' + esc(txt) + '</span>';
  return '<div class="acv-hero">'
    + '<div class="acv-hero-poster">' + posterHtml(d) + '</div>'
    + '<div>'
    + '<div class="acv-hero-tag">Entrada mais recente</div>'
    + '<h2>' + esc(d.titulo || 'Produto ' + d.numero_produto) + '</h2>'
    + '<div class="acv-hero-meta">'
    + seloHtml(d)
    + (d.atividade_codigo ? pilula('Atividade ' + d.atividade_codigo) : '')
    + pilula(d.total_vigentes + (d.total_vigentes === 1 ? ' arquivo' : ' arquivos'))
    + (d.entrega_ref_numero > 1 ? pilula('Versão ' + d.entrega_ref_numero) : '')
    + '</div>'
    + '<div class="acv-hero-sub">'
    + esc(d.fornecedor_nome || '—') + ' &middot; Contrato ' + esc(d.contrato_numero || '—')
    + (d.publicado_em ? ' &middot; Atualizado em ' + esc(fmtData(d.publicado_em)) : '')
    + (d.atividade_nome ? '<br>' + esc(d.atividade_nome) : '')
    + '</div>'
    + '<div class="acv-hero-acoes">'
    + '<button class="acv-btn acv-btn-play" data-obra="' + esc(d.obra_id) + '">'
    + '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Abrir</button>'
    + '<button class="acv-btn acv-btn-ghost" data-obra="' + esc(d.obra_id) + '">Ficha completa</button>'
    + '</div></div></div>';
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

  const emCorrecao = lista.filter(o => o.situacao_acervo === 'em_correcao');
  if (emCorrecao.length) prats.push({ titulo: 'Devolvidos para correção', itens: emCorrecao });

  const emAvaliacao = lista.filter(o => o.situacao_acervo === 'em_avaliacao');
  if (emAvaliacao.length) prats.push({ titulo: 'Em avaliação', itens: emAvaliacao });

  const pendentes = lista.filter(o => o.situacao_acervo === 'sem_entrega' && o.situacao_produto !== 'cancelado');
  if (pendentes.length) prats.push({ titulo: 'Em produção · aguardando entrega', itens: pendentes });

  if (!prats.length) return vazioHtml();

  return prats.map((p, i) => {
    const id = 'trilho-' + i;
    return '<div class="acv-prat">'
      + '<div class="acv-prat-cab"><span class="acv-prat-tit">' + esc(p.titulo) + '</span>'
      + '<span class="acv-prat-n">' + p.itens.length + '</span></div>'
      + '<div class="acv-trilho-wrap">'
      + '<button class="acv-seta acv-seta-e" type="button" data-trilho="' + id + '" data-dir="-1" aria-label="Anterior">&#x2039;</button>'
      + '<div class="acv-trilho" id="' + id + '">' + p.itens.map(cardHtml).join('') + '</div>'
      + '<button class="acv-seta acv-seta-d" type="button" data-trilho="' + id + '" data-dir="1" aria-label="Próximo">&#x203A;</button>'
      + '</div></div>';
  }).join('');
}

// ── Card / pôster ────────────────────────────────────────────────────
function posterHtml(o) {
  const par = PALETAS[hashId(o.obra_id) % PALETAS.length];
  const ang = 135 + (hashId(o.obra_id + 'a') % 60);
  const tipo = (o._formatos && o._formatos[0]) || 'documento';
  const apagado = o.total_vigentes === 0;

  return '<div class="acv-poster" style="background:linear-gradient(' + ang + 'deg,' + par[0] + ',' + par[1] + ')'
    + (apagado ? ';opacity:.55' : '') + '">'
    + '<div class="acv-poster-selo" style="background:' + estado(o).cor + '"></div>'
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
    info = svgIcone((o._formatos && o._formatos[0]) || 'documento', 11, 'rgba(255,255,255,.5)')
      + '<span>' + n + (n === 1 ? ' arquivo' : ' arquivos') + '</span>';
  } else if (o.situacao_acervo === 'aprovado') {
    // Aprovado sem arquivo na versão vigente: lacuna de dado, não se esconde.
    info = '<span style="color:#FCD34D">Sem arquivo na versão vigente</span>';
  } else {
    info = '<span>' + esc(estado(o).rotulo) + '</span>';
  }
  return '<button class="acv-card" type="button" data-obra="' + esc(o.obra_id) + '">'
    + posterHtml(o)
    + '<div class="acv-card-pe">'
    + '<div class="acv-card-forn">' + esc(o.fornecedor_nome || '—') + '</div>'
    + '<div class="acv-card-info">' + info
    + (o._ano ? '<span>&middot; ' + o._ano + '</span>' : '')
    + '</div></div></button>';
}

function seloHtml(o) {
  const e = estado(o);
  return '<span class="acv-selo selo-' + esc(o.situacao_acervo || 'sem_entrega') + '">' + esc(e.rotulo)
    + (o.aprovacao_parcial ? ' · parcial' : '') + '</span>';
}

// ═══ Eventos ═════════════════════════════════════════════════════════
function ligarCards() {
  document.querySelectorAll('[data-obra]').forEach(el => {
    el.onclick = () => abrirFicha(el.dataset.obra);
  });
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
    Object.assign(filtro, { busca: '', rotulo: '', atividade: '', fornecedor: '', resultado: '', ano: '', formato: '' });
    redesenhar(false);
  };

  document.querySelectorAll('.acv-chip').forEach(c => {
    c.onclick = () => { filtro.rotulo = c.dataset.rotulo || ''; redesenhar(false); };
  });
}

function redesenhar(focoBusca) {
  const palco = document.getElementById('palco');
  palco.innerHTML = barraComando() + chipsHtml() + '<div id="acervo-corpo"></div>';
  renderCorpo();
  religarComando(focoBusca);
}

function ligarAtalhos() {
  religarComando(false);
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      if (document.getElementById('viewer').classList.contains('aberto')) { fecharViewer(); return; }
      if (document.getElementById('modal-ficha').classList.contains('aberto')) fecharFicha();
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
  const ic = icone(m.midia_tipo);
  return '<div class="acv-midia' + (superada ? ' acv-midia-sup' : '') + '" data-midia="' + esc(m.midia_id) + '">'
    + '<div class="acv-midia-ico" style="background:' + ic.bg + '">' + svgIcone(m.midia_tipo, 19) + '</div>'
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
    + '<span class="acv-midia-acao">Visualizar &rsaquo;</span>'
    + '</div>';
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
    + ' &middot; <span style="font-weight:400;color:var(--cinza-500)">Contrato ' + esc(o.contrato_numero || '—') + '</span>';

  // `dica` vira title= para o texto que a grade corta em 3 linhas
  const dado = (lbl, val, dica) => '<div><div class="acv-dado-lbl">' + esc(lbl) + '</div>'
    + '<div class="acv-dado-val"' + (dica ? ' title="' + esc(dica) + '"' : '') + '>' + val + '</div></div>';

  let body = '<div class="acv-ficha-topo">'
    + '<div>' + posterHtml(o) + '</div>'
    + '<div>'
    + '<div class="acv-ficha-tit">' + esc(o.titulo || 'Produto sem descrição') + '</div>'
    + '<div class="acv-ficha-meta">'
    + '<span class="acv-selo selo-f-' + esc(o.situacao_acervo || 'sem_entrega') + '">'
    + esc(estado(o).rotulo) + (o.aprovacao_parcial ? ' · parcial' : '') + '</span>'
    + (o.entrega_ref_numero > 1
      ? '<span class="acv-midia-rot">Versão ' + esc(o.entrega_ref_numero) + '</span>' : '')
    + (o.atividade_codigo ? '<span class="acv-midia-rot">Atividade ' + esc(o.atividade_codigo) + '</span>' : '')
    + (o.resultado_codigo ? '<span class="acv-midia-rot" style="background:var(--verde-bg);color:#166534">' + esc(o.resultado_codigo) + '</span>' : '')
    + '</div>'
    + '<div class="acv-ficha-dados">'
    + dado('Consultor / Fornecedor', esc(o.fornecedor_nome || '—'))
    + dado('Atividade', esc(o.atividade_nome || '—'), o.atividade_nome)
    + dado('Valor do produto', esc(fmtBRL(o.valor_brl)))
    + dado('Entrega', esc(fmtData(o.entrega_ref_data || o.dt_entrega)))
    + dado('Prazo contratual', esc(fmtData(o.dt_vencimento)))
    + dado('Última atualização', esc(o.publicado_em ? fmtData(o.publicado_em) : '—'))
    + '</div></div></div>';

  if (o.aprovacao_parcial) {
    body += '<div class="acv-aviso acv-aviso-info">A entrega de referência foi aprovada '
      + 'parcialmente. Os arquivos abaixo valem, mas o produto ainda não está completo.</div>';
  }

  if (o.contrato_objeto) {
    body += '<div class="acv-secao-tit">Objeto do contrato</div>'
      + '<div style="font-size:13px;color:var(--cinza-600);line-height:1.6">' + esc(o.contrato_objeto) + '</div>';
  }
  if (o.parecer_avaliador) {
    body += '<div class="acv-secao-tit">Parecer do avaliador</div>'
      + '<div style="font-size:13px;color:var(--cinza-600);line-height:1.6;white-space:pre-wrap">' + esc(o.parecer_avaliador) + '</div>';
  }

  // ── Versão vigente ──
  body += '<div class="acv-secao-tit">Versão vigente'
    + (o.entrega_ref_numero ? ' &middot; entrega ' + esc(o.entrega_ref_numero) : '')
    + ' &middot; ' + vigentes.length + '</div>';
  if (vigentes.length) {
    body += vigentes.map(m => linhaMidia(m, false)).join('');
  } else if (o.situacao_acervo === 'aprovado') {
    body += '<div class="acv-aviso acv-aviso-alerta">A entrega aprovada não tem arquivo anexado. '
      + (superadas.length
        ? 'O único documento no sistema é o da versão devolvida, no histórico abaixo — ele não substitui o produto aprovado.'
        : 'Não há nenhum documento registrado para este produto.')
      + ' Confira no módulo de Avaliação de Produtos se falta anexar o documento final.</div>';
  } else {
    body += '<div style="font-size:13px;color:var(--cinza-500);padding:10px 0">'
      + esc(estado(o).rotulo) + ' — ainda não há arquivo aprovado para este produto.</div>';
  }

  // ── Versões anteriores ──
  if (superadas.length) {
    body += '<details class="acv-hist"><summary>Versões anteriores &middot; ' + superadas.length
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
  });

  document.getElementById('modal-ficha').classList.add('aberto');
}

function fecharFicha() {
  document.getElementById('modal-ficha').classList.remove('aberto');
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
  overlay.classList.add('aberto');

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
  const overlay = document.getElementById('viewer');
  overlay.classList.remove('aberto');
  // Zera o src para interromper download/reprodução em andamento
  document.getElementById('viewer-corpo').innerHTML = '';
  viewerUrlAtual = null;
}
