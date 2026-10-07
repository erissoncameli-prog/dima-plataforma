// ════════════════════════════════════════════════════════════════
// I18N — idiomas do site público (português, inglês e espanhol)
//
// O português é o texto do próprio HTML: cada elemento traduzível ganha
// data-i18n="chave" e o texto original fica como está. Inglês e espanhol
// vêm dos dicionários js/i18n-en.js e js/i18n-es.js (mesmas chaves).
// Conteúdo que vem do banco (indicadores, locais do mapa, legendas,
// atividades) não é traduzido — continua em português.
//
// Marcações no HTML:
//   data-i18n="chave"                 → troca o conteúdo (aceita HTML)
//   data-i18n-n="2"                   → preenche o {n} da tradução
//   data-i18n-attr="alt:chave,..."    → troca atributos
//   data-num="30004"                  → número no formato do idioma
//   data-num + data-moeda="BRL|USD"   → valor em moeda, sem centavos
//   data-data="2025-09-01"            → data curta (01 set 2025)
//
// Textos gerados por JS usam t('chave', {variavel}) — o português desses
// fica em TEXTOS_PT abaixo. Ao trocar de idioma a página recebe o evento
// 'idioma' em document, para redesenhar o que monta por JS. Não usar
// data-i18n em HTML montado com t(): a marcação guarda o primeiro texto
// que vê como "português", e a página pode ter aberto em outro idioma.
// Ordem dos scripts em cada página: i18n.js, i18n-en.js, i18n-es.js,
// layout.js — o layout.js aplica a tradução depois de montar header/rodapé.
// ════════════════════════════════════════════════════════════════

const IDIOMAS = {
  pt: { html: 'pt-BR', locale: 'pt-BR',  sigla: 'PT', nome: 'Português' },
  en: { html: 'en',    locale: 'en-US',  sigla: 'EN', nome: 'English' },
  // Espanhol da América Latina: "BRL 994,781" fica mais claro que "994.781 BRL"
  es: { html: 'es',    locale: 'es-419', sigla: 'ES', nome: 'Español' },
};
const I18N_DIC = { pt: {}, en: {}, es: {} };

function registrarIdioma(idioma, textos) { Object.assign(I18N_DIC[idioma], textos); }

// Português dos textos montados por JavaScript (o resto está no HTML)
const TEXTOS_PT = {
  'idioma.grupo': 'Idioma do site',
  'nav.inicio': 'Início',
  'nav.mapa': 'Mapa Interativo',
  'nav.resultados': 'Resultados',
  'nav.financeiro': 'Transparência Financeira',
  'nav.tempo': 'Linha do Tempo',
  'nav.produtos': 'Produtos',
  'nav.sobre': 'Sobre o Projeto',
  'nav.login': 'Fazer Login →',
  'nav.abrir_menu': 'Abrir menu',
  'marca.alt': 'Resiliência Socioambiental — Áreas de Proteção Ambiental Igarapé São Francisco e Lago do Amapá',
  'rodape.logos_alt': 'Governo do Canadá, Nações Unidas Brasil, Fundo Brasil-ONU, Consórcio Interestadual Amazônia Legal, UNESCO, Resiliência Socioambiental, SEMA e Governo do Acre',
  'rodape.texto': 'Programa de Resiliência Socioambiental nas Áreas de Proteção Ambiental do Lago do Amapá e do Igarapé São Francisco — Rio Branco, Acre. Realização SEMA/AC, com apoio da UNESCO e do Fundo Brasil-ONU.',
  'rodape.cartilha': 'Baixar a cartilha do Programa (PDF)',
  'construcao.selo': 'Protótipo · Produto 2',
  'construcao.texto': 'Esta página ainda não foi desenhada nesta versão do protótipo. A navegação já funciona entre as 7 páginas do site; o conteúdo de cada uma entra nas próximas iterações do Produto 2.',

  // Início
  'inicio.foto_n_de': 'Mostrar foto {n} de {total}',

  // Resultados
  'res.erro': 'Erro ao carregar a matriz de resultados.',
  'res.progresso_medio': 'Progresso médio',
  'res.contrib_confirmadas': 'Contribuições confirmadas',
  'res.metas_atingidas': 'Metas atingidas',
  'res.de_com_meta': 'de {n} com meta definida',
  'res.aguardam': 'Aguardam confirmação',
  'res.com_pendencias': 'indicadores com pendências',
  'res.em_risco': 'Em risco (&lt;40%)',
  'res.de_indicadores': 'de {n} indicadores',
  'res.resultado': 'Resultado {n}',
  'res.ind_abrev': '{n} ind.',
  'res.meta_atingida': 'Meta atingida',
  'res.em_dia': 'Em dia',
  'res.atencao': 'Atenção',
  'res.risco': 'Risco',
  'res.sem_meta': 'Sem meta',
  'res.pendente': '⏳ pend.',
  'res.ods': 'ODS',
  'res.vazio': 'Nenhum indicador cadastrado na Matriz de Resultados.',

  // Produtos
  'prod.eixo_r1': 'Bioeconomia',
  'prod.eixo_r2': 'Segurança Hídrica',
  'prod.eixo_r3': 'Governança',
  'prod.eixo_r4': 'Gestão do Programa',
  'prod.exemplo': 'Exemplo',
  'prod.nenhum': 'Nenhum produto autorizado para este resultado ainda.',

  // Mapa
  'mapa.ver_tela_cheia': 'Ver em tela cheia',
  'mapa.apa': 'APA',
  'mapa.implantacao': 'Implantação',
  'mapa.obs': 'Obs.',
  'mapa.area': 'Área',
  'mapa.distancia': 'Distância',
  'mapa.vertices': 'Vértices',
  'mapa.pontos': 'Pontos',
  'mapa.assistir_video_trilha': '▶ Assistir vídeo da trilha',
  'mapa.assistir_video': 'Assistir vídeo',
  'mapa.pontos_interesse': 'Pontos de interesse',
  'mapa.inicio_trilha': 'Início',
  'mapa.fim_trilha': 'Fim',
  'mapa.poligono': 'Polígono',
  'mapa.trilha': 'Trilha',
  'mapa.nenhum_ponto': 'Nenhum ponto visível.',
  'mapa.erro': 'Erro ao carregar pontos.',
  'mapa.marcar_todos': 'Marcar todos',
  'mapa.desmarcar_todos': 'Desmarcar todos',
  'mapa.nenhuma_camada': 'Nenhuma camada cadastrada',
  'mapa.nenhum_tipo': 'Nenhum tipo cadastrado',
  'mapa.sem_apa': 'Sem filtro de APA',
  'mapa.camadas_ponto': '{n} camadas neste ponto',
  'mapa.nome': 'Nome',
  'mapa.regime': 'Regime',
  'mapa.comprimento': 'Comprimento',
  'mapa.decreto': 'Decreto',
  'mapa.criacao': 'Criação',
  'mapa.municipios': 'Municípios',
  'mapa.gestao': 'Gestão',
  'mapa.plano_manejo': 'Pl. Manejo',
  'mapa.subbacia': 'Sub-bacia',
  'mapa.area_fragmento': 'Área (fragmento)',
  'mapa.app_total': 'APP total: {pct}% da sub-bacia',
  'mapa.norte': 'Norte',
  'mapa.rosa': 'N,S,L,O',
  'mapa.pe_descanso': 'Área de descanso',
  'mapa.pe_igarape': 'Igarapé / Córrego',
  'mapa.pe_lago': 'Lago / Lagoa',
  'mapa.pe_arvore': 'Árvore histórica',
  'mapa.pe_mirante': 'Mirante / Vista',
  'mapa.pe_outro': 'Ponto de interesse',

  // Apresentação (página Sobre, js/apresentacao.js)
  'apres.titulo': 'Apresentação do Programa',
  'apres.pausar': 'Pausar',
  'apres.continuar': 'Continuar',
  'apres.reiniciar': 'Assistir de novo',
  'apres.fechar': 'Fechar',
  'apres.ligar_som': 'Ligar o som',
  'apres.desligar_som': 'Desligar o som',
  'apres.cena': 'Cena {n} de {total}: {nome}',
  'apres.n1': 'Abertura',
  'apres.n2': 'As APAs',
  'apres.n3': 'Moradores',
  'apres.n4': 'Desafios',
  'apres.n5': 'Resiliência',
  'apres.n6': 'Eixos',
  'apres.n7': 'Agenda global',
  'apres.n8': 'Parceiros',
  'apres.n9': 'Encerramento',
  'apres.c1_titulo': 'Resiliência Socioambiental',
  'apres.c1_sub': 'nas APAs Igarapé São Francisco e Lago do Amapá',
  'apres.c2_titulo': 'Duas Áreas de Proteção Ambiental',
  'apres.c2_sub': 'em Rio Branco, capital do Acre',
  'apres.apa_sf': 'APA Igarapé São Francisco',
  'apres.apa_la': 'APA Lago do Amapá',
  'apres.hectares': 'hectares',
  'apres.c3_pre': 'onde vivem cerca de',
  'apres.c3_unid': 'moradores',
  'apres.c3_sub': 'que dependem dessas águas e florestas',
  'apres.c4_titulo': 'Os desafios do território',
  'apres.d_queimadas': 'Queimadas',
  'apres.d_enchentes': 'Enchentes',
  'apres.d_secas': 'Secas extremas',
  'apres.d_desmatamento': 'Desmatamento',
  'apres.d_clima': 'Mudanças climáticas',
  'apres.c5_pre': 'Resiliência é a capacidade de',
  'apres.v_enfrentar': 'enfrentar,',
  'apres.v_adaptar': 'adaptar-se',
  'apres.v_recuperar': 'e recuperar-se',
  'apres.c5_sub': 'sem perder a qualidade de vida das pessoas e da natureza',
  'apres.c6_titulo': 'Quatro eixos de ação',
  'apres.e_gov': 'Governança',
  'apres.e_rest': 'Restauração Florestal',
  'apres.e_bio': 'Bioeconomia',
  'apres.e_hid': 'Segurança Hídrica',
  'apres.e_transv': '+ igualdade de gênero, equidade étnico-racial e inclusão social em todas as ações',
  'apres.c7_titulo': 'Uma contribuição global',
  'apres.c7_ods': 'Objetivos de Desenvolvimento Sustentável',
  'apres.c7_km': 'metas do Marco Global de Biodiversidade de Kunming-Montreal',
  'apres.c8_titulo': 'Uma parceria entre governo, ONU e cooperação internacional',
  'apres.c9_titulo': 'Acompanhe o Programa',
  'apres.c9_sub': 'Entregas, resultados e recursos — num só lugar, abertos a todos.',
  'apres.explorar_mapa': 'Explorar o mapa interativo →',
  // Legenda do modo contínuo = fala da narração em cada cena (roteiro)
  'apres.fala1': 'Este é o Programa de Resiliência Socioambiental, nas Áreas de Proteção Ambiental Igarapé São Francisco e Lago do Amapá.',
  'apres.fala2': 'São duas Áreas de Proteção Ambiental em Rio Branco, que somam mais de trinta e cinco mil hectares.',
  'apres.fala3': 'Nelas vivem cerca de onze mil e trezentas pessoas, que dependem dessas águas e dessas florestas.',
  'apres.fala4': 'Um território pressionado por queimadas, enchentes, secas extremas, desmatamento e pelas mudanças do clima.',
  'apres.fala5': 'Resiliência é a capacidade de enfrentar, adaptar-se e recuperar-se, sem perder a qualidade de vida.',
  'apres.fala6': 'O Programa atua em quatro eixos: governança, restauração florestal, bioeconomia e segurança hídrica. Sempre com igualdade de gênero e inclusão social.',
  'apres.fala7': 'E contribui com quinze Objetivos de Desenvolvimento Sustentável e doze metas globais para a biodiversidade.',
  'apres.fala8': 'Uma parceria entre o Governo do Acre, a ONU, por meio da UNESCO, e a cooperação internacional.',
  'apres.fala9': 'Acompanhe as entregas, os resultados e os recursos do Programa, aqui, neste portal.',
  'apres.iniciar': 'Iniciar apresentação',
  'apres.continuo_dica': 'Apresentação contínua: português, inglês e espanhol, sem parar. Esc para sair.',
};

// Idioma inicial: ?lang= na URL > escolha salva > idioma do navegador > português
function _idiomaInicial() {
  const daUrl = new URLSearchParams(location.search).get('lang');
  if (daUrl && IDIOMAS[daUrl]) { _salvarIdioma(daUrl); return daUrl; }
  try {
    const salvo = localStorage.getItem('site_idioma');
    if (salvo && IDIOMAS[salvo]) return salvo;
  } catch (e) { /* armazenamento bloqueado: segue sem lembrar */ }
  for (const l of (navigator.languages || [navigator.language || ''])) {
    const base = String(l).slice(0, 2).toLowerCase();
    if (IDIOMAS[base]) return base;
  }
  return 'pt';
}
function _salvarIdioma(idioma) {
  try { localStorage.setItem('site_idioma', idioma); } catch (e) { /* sem armazenamento */ }
}

let idiomaAtual = _idiomaInicial();
document.documentElement.lang = IDIOMAS[idiomaAtual].html;

// Texto de uma chave no idioma atual; {nome} é trocado por vars.nome.
// Sem tradução, cai no português (TEXTOS_PT) e por fim na própria chave.
function t(chave, vars) {
  let txt = I18N_DIC[idiomaAtual][chave] ?? TEXTOS_PT[chave] ?? chave;
  if (vars) txt = txt.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return txt;
}

function localeAtual() { return IDIOMAS[idiomaAtual].locale; }

function fmtNum(n, opcoes) { return new Intl.NumberFormat(localeAtual(), opcoes).format(n); }
function fmtMoeda(n, moeda) {
  return new Intl.NumberFormat(localeAtual(), { style: 'currency', currency: moeda, maximumFractionDigits: 0 }).format(n);
}
// "01 set 2025" / "01 Sep 2025" / "01 sept 2025"
function fmtDataCurta(iso) {
  const d = new Date(iso + 'T12:00');
  const mes = new Intl.DateTimeFormat(localeAtual(), { month: 'short' }).format(d).replace('.', '');
  return `${String(d.getDate()).padStart(2, '0')} ${mes} ${d.getFullYear()}`;
}
function fmtData(iso) { return new Date(iso + 'T12:00').toLocaleDateString(localeAtual()); }

// Aplica o idioma atual em toda a página (ou só dentro de raiz)
function traduzirPagina(raiz) {
  const base = raiz || document;
  const dic = I18N_DIC[idiomaAtual];

  base.querySelectorAll('[data-i18n]').forEach(el => {
    // O português original fica guardado na primeira passada, pra poder voltar
    if (el.dataset.i18nPt === undefined) el.dataset.i18nPt = el.innerHTML;
    const chave = el.dataset.i18n;
    let txt = idiomaAtual === 'pt' ? el.dataset.i18nPt : (dic[chave] ?? el.dataset.i18nPt);
    // data-i18n-n preenche o {n} da tradução (ex.: "Meta {n}" → "Target 2")
    if (el.dataset.i18nN !== undefined) txt = txt.replace('{n}', el.dataset.i18nN);
    el.innerHTML = txt;
  });

  base.querySelectorAll('[data-i18n-attr]').forEach(el => {
    el.dataset.i18nAttr.split(',').forEach(par => {
      const [attr, chave] = par.split(':').map(s => s.trim());
      const guarda = 'i18nPt_' + attr.replace(/-/g, '_');
      if (el.dataset[guarda] === undefined) el.dataset[guarda] = el.getAttribute(attr) || '';
      el.setAttribute(attr, idiomaAtual === 'pt' ? el.dataset[guarda] : (dic[chave] ?? el.dataset[guarda]));
    });
  });

  base.querySelectorAll('[data-num]').forEach(el => {
    const n = parseFloat(el.dataset.num);
    el.textContent = el.dataset.moeda ? fmtMoeda(n, el.dataset.moeda) : fmtNum(n);
  });

  base.querySelectorAll('[data-data]').forEach(el => { el.textContent = fmtDataCurta(el.dataset.data); });

  document.querySelectorAll('.seletor-idioma button').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.idioma === idiomaAtual));
  });
}

function mudarIdioma(idioma) {
  if (!IDIOMAS[idioma] || idioma === idiomaAtual) return;
  idiomaAtual = idioma;
  _salvarIdioma(idioma);
  document.documentElement.lang = IDIOMAS[idioma].html;
  // Mantém o ?lang= da URL coerente, pra quem copiar o link levar o idioma junto
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', idioma);
    history.replaceState(null, '', url);
  }
  traduzirPagina();
  document.dispatchEvent(new CustomEvent('idioma', { detail: idioma }));
}

// Botões PT · EN · ES (usados no header, no menu do celular e no rodapé)
function htmlSeletorIdioma(classeExtra) {
  const botoes = Object.entries(IDIOMAS).map(([cod, i]) =>
    `<button type="button" data-idioma="${cod}" lang="${i.html}" title="${i.nome}" aria-label="${i.nome}" aria-pressed="${cod === idiomaAtual}" onclick="mudarIdioma('${cod}')">${i.sigla}</button>`
  ).join('');
  return `<div class="seletor-idioma ${classeExtra || ''}" role="group" aria-label="${t('idioma.grupo')}">${botoes}</div>`;
}
