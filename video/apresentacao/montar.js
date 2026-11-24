// Apresentação PowerPoint da Plataforma Inteligente de Gestão de Projetos (a partir do vídeo publicitário).
//   node apresentacao/montar.js      → build/ppt/plataforma-gestao-projetos-base.pptx
// Depois: python apresentacao/animar.py (transições Morph e animações de entrada).
// Nomes de objeto "A<ordem><efeito><atraso>_nome" dizem ao animar.py como cada objeto entra:
//   efeito F = aparecer suave, S = subir, Z = zoom, L = entrar da esquerda; ordem = grupo; atraso = degrau de 0,12 s.
'use strict'
const path = require('node:path')
const fs = require('node:fs')
const pptxgen = require('pptxgenjs')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const sharp = require('sharp')
const lu = require('react-icons/lu')
const { applyTheme } = require('/root/.claude/skills/synced/15734333-f023-497f-b98a-fb060a81e62a_3e779bc5-6fdd-457c-b853-519d6e83730e/pptx/scripts/apply_theme.js')

const RAIZ = path.resolve(__dirname, '..', '..'), IMG = path.resolve(__dirname, '..', 'build', 'ppt', 'img')
const SAIDA = path.resolve(__dirname, '..', 'build', 'ppt', 'plataforma-gestao-projetos-base.pptx')
const TAM = JSON.parse(fs.readFileSync(path.join(IMG, 'tamanhos.json')))
const ASSET = n => path.join(RAIZ, 'assets', n)

const THEME = {
  name: 'Plataforma de Gestão — escuro', headFontFace: 'Arial', bodyFontFace: 'Calibri',
  colors: { dk1: '07130D', lt1: 'FFFFFF', dk2: '13281D', lt2: 'A9C2B2', accent1: 'C6F36B', accent2: '5CE0A0', accent3: 'F2C94C',
    accent4: '6FB7FF', accent5: 'FF8A80', accent6: '1F4E2C', hlink: 'C6F36B', folHlink: '5CE0A0' },
}
const HEX = THEME.colors

;(async () => {
  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE'
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace }
  pres.title = 'Plataforma Inteligente de Gestão de Projetos'
  pres.author = 'Erisson Cameli Santiago'
  pres.company = 'SEMA/AC · Projeto 218BRA2001'
  const C = pres.SchemeColor
  const W = 13.333

  // ── ícones (Lucide via react-icons) → PNG ─────────────────────────────────
  const cacheIc = {}
  async function ic(nome, cor = HEX.accent1) {
    const k = nome + cor; if (cacheIc[k]) return cacheIc[k]
    const Comp = lu[nome] || lu.LuCircle
    const svg = renderToStaticMarkup(React.createElement(Comp, { size: 256, color: '#' + cor, strokeWidth: 1.8 }))
    const png = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer()
    return (cacheIc[k] = 'image/png;base64,' + png.toString('base64'))
  }

  // ── layouts ───────────────────────────────────────────────────────────────
  const rodape = { text: 'Plataforma Inteligente de Gestão de Projetos  ·  SEMA/AC  ·  Projeto 218BRA2001',
    options: { x: 0.6, y: 7.02, w: 8, h: 0.3, fontSize: 10, color: C.background2, fontFace: 'Calibri', margin: 0 } }
  pres.defineSlideMaster({ title: 'CAPA', background: { path: path.join(IMG, 'capa-parede.png') }, objects: [] })
  pres.defineSlideMaster({
    title: 'SECAO', background: { path: path.join(IMG, 'bg-secao.png') },
    objects: [
      { placeholder: { options: { name: 'kicker', type: 'body', x: 0.9, y: 2.35, w: 9, h: 0.45, fontSize: 16, bold: true, color: C.accent1, charSpacing: 4, margin: 0 }, text: 'Seção' } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.9, y: 2.8, w: 8.6, h: 1.5, fontSize: 48, bold: true, color: C.background1, align: 'left', valign: 'top', margin: 0 }, text: 'Título da seção' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.9, y: 4.35, w: 8.2, h: 1.2, fontSize: 18, color: C.background2, valign: 'top', margin: 0 }, text: 'Descrição' } },
    ],
  })
  pres.defineSlideMaster({
    title: 'CONTEUDO', background: { path: path.join(IMG, 'bg-escuro.png') },
    objects: [
      { placeholder: { options: { name: 'kicker', type: 'body', x: 0.6, y: 0.3, w: 9, h: 0.32, fontSize: 12, bold: true, color: C.accent1, charSpacing: 3, margin: 0 }, text: 'Módulo' } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.62, w: 12.1, h: 0.75, fontSize: 32, bold: true, color: C.background1, align: 'left', valign: 'top', margin: 0 }, text: 'Título' } },
      { text: rodape },
    ],
    slideNumber: { x: 12.2, y: 7.02, w: 0.6, h: 0.3, fontSize: 10, color: C.background2, align: 'right' },
  })
  pres.defineSlideMaster({ title: 'FECHO', background: { path: path.join(IMG, 'bg-secao.png') }, objects: [] })

  // ── componentes ───────────────────────────────────────────────────────────
  const an = (ordem, efeito = 'S', atraso = 0) => `A${ordem}${efeito}${atraso}_`
  const nomeObj = (a, n) => (a || '') + n
  function conteudo(secao, kicker, titulo) {
    const s = pres.addSlide({ masterName: 'CONTEUDO', sectionTitle: secao })
    s.addText(kicker.toUpperCase(), { placeholder: 'kicker' })
    s.addText(titulo, { placeholder: 'title' })
    return s
  }
  function tela(s, chave, x, y, w, a, nome) {
    const [iw, ih] = TAM[chave]; const h = w * ih / iw
    s.addImage({ path: path.join(IMG, `tela-${chave}.png`), x, y, w, h, objectName: nomeObj(a, nome || 'tela-' + chave), altText: `Tela da plataforma: ${chave} (dados fictícios de demonstração)` })
    return h
  }
  function telaH(chave, w) { const [iw, ih] = TAM[chave]; return w * ih / iw }
  async function bolinha(s, x, y, d, nomeIc, a, n, cor = HEX.accent1) {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: C.text2 }, line: { color: C.accent6, width: 1 }, objectName: nomeObj(a, n + '-circ') })
    s.addImage({ data: await ic(nomeIc, cor), x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52, objectName: nomeObj(a, n + '-ic'), altText: '' })
  }
  // linhas de ícone + título + descrição
  async function linhas(s, itens, x, y, w, passo, ordem0 = 2, tit = 17, desc = 14) {
    for (const [i, [nomeIc, t, d]] of itens.entries()) {
      const a = an(ordem0, 'S', i), yy = y + i * passo
      await bolinha(s, x, yy + 0.02, 0.56, nomeIc, a, 'linha' + i)
      s.addText([{ text: t, options: { bold: true, fontSize: tit, color: C.background1, breakLine: true } },
        { text: d, options: { fontSize: desc, color: C.background2 } }],
      { x: x + 0.75, y: yy - 0.04, w: w - 0.75, h: passo - 0.08, valign: 'top', margin: 0, paraSpaceAfter: 3, isTextBox: true, objectName: nomeObj(a, 'linha' + i + '-tx') })
    }
  }
  function cartao(s, x, y, w, h, a, n, fill = C.text2) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill, transparency: 8 }, line: { color: C.accent6, width: 1 },
      shadow: { type: 'outer', color: '000000', opacity: 0.35, blur: 10, offset: 3, angle: 90 }, objectName: nomeObj(a, n) })
  }
  // fluxo de etapas em "chevrons"
  function fluxo(s, etapas, x, y, w, h, ordem, destaque = -1) {
    const n = etapas.length, gap = 0.08, cw = (w - gap * (n - 1)) / n
    etapas.forEach((t, i) => {
      const a = an(ordem, 'L', i)
      s.addText(t, { shape: i === 0 ? pres.shapes.PENTAGON : pres.shapes.CHEVRON, x: x + i * (cw + gap), y, w: cw, h,
        fill: { color: i === destaque ? C.accent1 : C.text2 }, line: { color: i === destaque ? C.accent1 : C.accent6, width: 1 },
        fontSize: 13, bold: true, color: i === destaque ? C.text1 : C.background1, align: 'center', valign: 'middle', margin: [0, 14, 0, 18],
        objectName: nomeObj(a, 'etapa' + i) })
    })
  }
  const notas = (s, t) => s.addNotes(t)

  // ═══ 1. CAPA ═══════════════════════════════════════════════════════════
  pres.addSection({ title: 'Abertura' })
  {
    const s = pres.addSlide({ masterName: 'CAPA', sectionTitle: 'Abertura' })
    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 7.5, fill: { color: C.text1, transparency: 30 }, line: { type: 'none' }, objectName: 'veu' })
    s.addText('SEMA/AC  ·  FUNDO BRASIL-ONU  ·  UNESCO  ·  PROJETO 218BRA2001', { x: 0.8, y: 1.45, w: 11.5, h: 0.4, fontSize: 14, bold: true, color: C.accent1, charSpacing: 3, margin: 0, isTextBox: true, objectName: an(1, 'F') + 'kicker' })
    s.addText('Plataforma Inteligente\nde Gestão de Projetos', { x: 0.8, y: 1.95, w: 11.5, h: 2.1, fontSize: 56, bold: true, color: C.background1, fontFace: 'Arial', valign: 'top', margin: 0, isTextBox: true, objectName: an(2, 'S') + 'titulo' })
    s.addText('Transparência que se vê. Resultados que ficam.', { x: 0.8, y: 4.15, w: 11, h: 0.6, fontSize: 26, italic: true, color: C.accent2, margin: 0, isTextBox: true, objectName: an(3, 'S') + 'slogan' })
    s.addImage({ path: ASSET('brasao-acre.png'), x: 0.8, y: 5.25, w: 1.5, h: 0.75, objectName: an(4, 'F', 0) + 'logo-acre', altText: 'Governo do Acre' })
    s.addImage({ path: ASSET('sema-branco.png'), x: 2.6, y: 5.35, w: 3.2, h: 0.55, objectName: an(4, 'F', 1) + 'logo-sema', altText: 'SEMA/AC' })
    s.addImage({ path: ASSET('logo-resiliencia.png'), x: 6.15, y: 5.12, w: 2.04, h: 1.0, objectName: an(4, 'F', 2) + 'logo-res', altText: 'Projeto Resiliência Socioambiental' })
    s.addText('Concepção e Desenvolvimento: Erisson Cameli Santiago  ·  © 2025–2026', { x: 0.8, y: 6.65, w: 9, h: 0.35, fontSize: 12, color: C.background2, margin: 0, isTextBox: true, objectName: an(5, 'F') + 'credito' })
    notas(s, 'Abertura. Plataforma Inteligente de Gestão de Projetos, usada pela SEMA/AC no projeto 218BRA2001, com recursos do Fundo Brasil-ONU e cooperação da UNESCO. Todas as telas desta apresentação são reais, com dados fictícios de demonstração.')
  }

  // ═══ 2. GANCHO ═════════════════════════════════════════════════════════
  {
    const s = pres.addSlide({ masterName: 'FECHO', sectionTitle: 'Abertura' })
    const L = [['Cada ', 'real', ' investido.'], ['Cada ', 'entrega', '.'], ['Cada ', 'resultado', '.']]
    L.forEach(([a, b, c], i) => s.addText([{ text: a, options: { color: C.background1 } }, { text: b, options: { color: C.accent1 } }, { text: c, options: { color: C.background1 } }],
      { x: 1.0, y: 1.25 + i * 1.25, w: 11, h: 1.15, fontSize: 64, bold: true, fontFace: 'Arial', margin: 0, isTextBox: true, objectName: an(1 + i, 'S') + 'frase' + i }))
    s.addText('Tudo o que o projeto faz, em um só lugar — do planejamento à prestação de contas.', { x: 1.0, y: 5.3, w: 10.5, h: 0.6, fontSize: 22, color: C.background2, margin: 0, isTextBox: true, objectName: an(4, 'F') + 'sub' })
    notas(s, 'Narração do vídeo: "Cada real investido. Cada entrega. Cada resultado." A plataforma junta, num só lugar, o que antes ficava espalhado em planilhas, e-mails e processos.')
  }

  // ═══ 3. MAPA DOS MÓDULOS ══════════════════════════════════════════════
  {
    const s = conteudo('Abertura', 'Mapa dos módulos', '28 frentes, uma só plataforma')
    const G = [
      ['Projeto', [['LuLayoutDashboard', 'Visão Geral'], ['LuListChecks', 'Tarefas']]],
      ['Planejamento', [['LuTarget', 'Atividades'], ['LuFileText', 'TDRs e licitação'], ['LuChartColumn', 'Matriz de Resultados'], ['LuArrowLeftRight', 'Remanejamento']]],
      ['Execução', [['LuBuilding2', 'Fornecedores'], ['LuFilePen', 'Contratos'], ['LuPackageCheck', 'Produtos Entregues'], ['LuLibrary', 'Acervo Digital'], ['LuWallet', 'Financeiro'], ['LuBox', 'Patrimônio'], ['LuClipboardList', 'Diagnóstico']]],
      ['Apoio', [['LuPlane', 'Viagens e Diárias'], ['LuUsers', 'Beneficiários'], ['LuMap', 'Mapa Interativo'], ['LuFileChartColumn', 'Relatórios'], ['LuNewspaper', 'Repositório'], ['LuActivity', 'Pulso da Equipe'], ['LuBot', 'Auditoria IA'], ['LuCircleHelp', 'Ajuda']]],
      ['Administração', [['LuUserCog', 'Usuários e acessos'], ['LuPalette', 'Dados do sistema'], ['LuHardDrive', 'Armazenamento'], ['LuLock', 'Privacidade (ROPA)'], ['LuPlug', 'Integrações (API)']]],
      ['Público', [['LuGlobe', 'Site público'], ['LuSmartphone', 'App de campo']]],
    ]
    const cw = 1.93, gap = 0.11, y0 = 1.6
    for (const [gi, [g, itens]] of G.entries()) {
      const x = 0.6 + gi * (cw + gap), a = an(2, 'S', gi)
      cartao(s, x, y0, cw, 5.2, a, 'col' + gi)
      s.addText(g.toUpperCase(), { x: x + 0.15, y: y0 + 0.15, w: cw - 0.3, h: 0.35, fontSize: 12, bold: true, color: C.accent1, charSpacing: 2, margin: 0, isTextBox: true, objectName: a + 'grupo' + gi })
      for (const [ii, [nomeIc, t]] of itens.entries()) {
        const yy = y0 + 0.62 + ii * 0.56
        s.addImage({ data: await ic(nomeIc, HEX.accent2), x: x + 0.15, y: yy + 0.04, w: 0.3, h: 0.3, objectName: a + `ic${gi}-${ii}`, altText: '' })
        s.addText(t, { x: x + 0.52, y: yy - 0.02, w: cw - 0.6, h: 0.5, fontSize: 13, color: C.background1, valign: 'top', margin: 0, isTextBox: true, objectName: a + `m${gi}-${ii}` })
      }
    }
    notas(s, 'O menu segue estes grupos. Cada pessoa vê só os módulos liberados para ela (ver o slide Níveis de acesso). O site público e o app de campo usam a mesma base de dados, com regras próprias.')
  }

  // ═══ SEÇÃO 01 ══════════════════════════════════════════════════════════
  function secao(num, kicker, titulo, desc, nota) {
    pres.addSection({ title: titulo })
    const s = pres.addSlide({ masterName: 'SECAO', sectionTitle: titulo })
    s.addText(kicker.toUpperCase(), { placeholder: 'kicker' })
    s.addText(titulo, { placeholder: 'title' })
    s.addText(desc, { placeholder: 'body' })
    s.addText(num, { x: 8.6, y: 2.2, w: 4.4, h: 3.6, fontSize: 220, bold: true, fontFace: 'Arial', color: C.accent1, transparency: 80, align: 'right', margin: 0, isTextBox: true, objectName: an(1, 'Z') + 'numero' })
    notas(s, nota)
    return s
  }
  secao('01', 'Seção 01', 'Planejar e acompanhar', 'Visão Geral, tarefas, atividades, TDRs e licitação, Matriz de Resultados e remanejamento do orçamento.',
    'Primeiro bloco: como o projeto é planejado e acompanhado no dia a dia.')
  const S1 = 'Planejar e acompanhar'

  // Visão Geral
  {
    const s = conteudo(S1, 'Visão Geral', 'O orçamento em tempo real')
    await linhas(s, [
      ['LuWallet', 'Pago, comprometido e livre', 'Por atividade e por resultado, em US$, com a cotação oficial.'],
      ['LuScale', 'Um saldo só', 'A mesma conta no painel, nos relatórios e no razão orçamentário.'],
      ['LuBell', 'Alertas e cobertura', 'Contrato travado, meta parada e prazo vencendo aparecem antes de virar problema.'],
      ['LuDownload', 'Exporta tudo', 'PDF, Excel, PowerPoint ou HTML, com gráficos editáveis.'],
    ], 0.6, 1.75, 5.2, 1.22)
    tela(s, 'dashboard', 6.05, 1.55, 6.9, an(1, 'Z'))
    notas(s, 'Narração: "Na Visão Geral, o orçamento ganha vida: o que foi pago, o que está comprometido e o que ainda está livre." O saldo vem de uma única fonte no banco (vw_saldo_atividade), então painel e relatórios nunca divergem.')
  }
  // Tarefas
  {
    const s = conteudo(S1, 'Minhas tarefas e Painel de Tarefas', 'O dia começa organizado')
    tela(s, 'tarefas-vg', 5.6, 1.5, 5.6, an(1, 'Z'), 'tela-a')
    tela(s, 'kanban', 7.35, 3.55, 5.6, an(2, 'Z'), 'tela-b')
    await linhas(s, [
      ['LuListChecks', 'Minhas tarefas', 'Avaliações pendentes, vencimentos e editais publicados, para cada pessoa.'],
      ['LuSquareCheck', 'Conclusão com aprovação', 'Quem criou aprova a entrega; devolver ou reabrir exige motivo.'],
      ['LuMail', 'Subtarefas por e-mail', 'Fornecedor responde ao e-mail e a resposta vira comentário com anexo.'],
      ['LuCalendar', 'Reuniões e histórico', 'Convite de agenda (.ics) e toda edição registrada com antes e depois.'],
    ], 0.6, 1.75, 4.8, 1.22, 3)
    notas(s, 'Narração: "Cada pessoa começa o dia sabendo o que fazer: avaliações pendentes, prazos e editais publicados." O Painel de Tarefas tem quadro, lista e calendário; tarefa restrita só aparece para quem participa.')
  }
  // Atividades
  {
    const s = conteudo(S1, 'Atividades', 'Cada atividade com orçamento protegido')
    tela(s, 'atividades', 0.45, 1.55, 6.9, an(1, 'Z'))
    await linhas(s, [
      ['LuLock', 'Orçamento que não se altera à mão', 'Só o razão orçamentário grava; a dotação original fica congelada.'],
      ['LuChartColumn', 'Execução em uma barra', 'Pago, comprometido e livre, com alerta quando passa do orçamento.'],
      ['LuLeaf', 'ODS e metas Kunming-Montreal', 'Marcação direta ou herdada dos indicadores da Matriz.'],
      ['LuLink', 'Tudo ligado', 'Responsável, substituto, TDRs e tarefas de cada atividade.'],
    ], 7.6, 1.75, 5.2, 1.22)
    notas(s, 'Atividades organizadas por resultado (R1 a R4). O campo de orçamento é protegido no banco: nenhuma pessoa, nem o super admin, muda o valor direto — só remanejamentos aprovados.')
  }
  // TDRs
  {
    const s = conteudo(S1, 'TDRs e licitação', 'Do termo de referência à contratação')
    fluxo(s, ['Rascunho', 'Revisão interna', 'UNESCO', 'Aprovado', 'Em licitação', 'Contratado'], 0.6, 1.6, 12.1, 0.7, 1, 4)
    tela(s, 'tdrs', 0.45, 2.55, 6.6, an(2, 'Z'))
    await linhas(s, [
      ['LuSparkles', 'Análise por IA', 'Sugestões para o TDR; CPF e CNPJ são retirados antes do envio.'],
      ['LuGavel', 'Licitação em rodadas', 'Modalidade, edital, prazo, prorrogação, resultado e nova rodada.'],
      ['LuBell', 'Editais avisam a equipe', 'Sino e e-mail para responsáveis e coordenação; lista curta de empresas.'],
      ['LuFileCheck', 'Cancelamento só assinado', 'Pedido com nota técnica e cadeia de assinaturas com senha.'],
    ], 7.35, 2.7, 5.4, 1.02, 3, 16, 14)
    notas(s, 'Narração: "Do termo de referência à contratação, cada fase é acompanhada, com licitação em rodadas e prazos sob controle." O TDR compromete o orçamento já no planejamento e não nasce sem valor.')
  }
  // Matriz
  {
    const s = conteudo(S1, 'Matriz de Resultados', 'Cada entrega conta para a meta')
    tela(s, 'matriz', 6.05, 1.55, 6.9, an(1, 'Z'))
    await linhas(s, [
      ['LuTarget', 'Indicadores com meta', 'Situação: atingida, em andamento, sem registro ou qualitativa.'],
      ['LuBadgeCheck', 'Progresso confirmado', 'Vem das entregas aprovadas — não de digitação solta.'],
      ['LuLeaf', 'ODS e Kunming-Montreal', 'Inclui o ODS 18, Igualdade Étnico-Racial, objetivo voluntário do Brasil.'],
    ], 0.6, 1.75, 5.2, 1.2)
    const ODS = [[1, 'E5243B'], [4, 'C5192D'], [5, 'FF3A21'], [8, 'A21942'], [13, '3F7E44'], [15, '56C02B'], [17, '19486A'], [18, '7B3110']]
    ODS.forEach(([n, cor], i) => s.addText(String(n), { x: 0.6 + i * 0.64, y: 5.6, w: 0.56, h: 0.56, fontSize: 18, bold: true, color: 'FFFFFF', fill: { color: cor }, align: 'center', valign: 'middle', margin: 0,
      shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.06, objectName: an(3, 'Z', i) + 'ods' + n }))
    s.addText('ODS ligados aos indicadores', { x: 0.6, y: 6.25, w: 5, h: 0.3, fontSize: 12, color: C.background2, margin: 0, isTextBox: true, objectName: an(3, 'F', 8) + 'ods-leg' })
    notas(s, 'Narração: "A Matriz de Resultados liga cada entrega aos Objetivos de Desenvolvimento Sustentável." O progresso só conta contribuições de entregas aprovadas e confirmadas.')
  }
  // Remanejamento
  {
    const s = conteudo(S1, 'Remanejamento', 'Assinaturas em cadeia, com senha')
    const E = [['1', 'Coordenação', 'solicita'], ['2', 'Responsável', 'libera a origem'], ['3', 'UNESCO', 'financeiro'], ['4', 'Diretoria', 'aprova'], ['5', 'Secretaria', 'efetiva']]
    E.forEach(([n, t, d], i) => {
      const x = 0.6 + i * 2.5, a = an(1, 'L', i)
      s.addText(n, { shape: pres.shapes.OVAL, x, y: 1.6, w: 0.62, h: 0.62, fill: { color: i < 3 ? C.accent2 : C.text2 }, line: { color: C.accent2, width: 1.5 }, fontSize: 18, bold: true,
        color: i < 3 ? C.text1 : C.background1, align: 'center', valign: 'middle', margin: 0, objectName: a + 'n' + i })
      s.addText([{ text: t, options: { bold: true, fontSize: 15, color: C.background1, breakLine: true } }, { text: d, options: { fontSize: 13, color: C.background2 } }],
        { x: x + 0.72, y: 1.55, w: 1.7, h: 0.75, margin: 0, valign: 'middle', isTextBox: true, objectName: a + 't' + i })
    })
    tela(s, 'remanej', 0.45, 2.55, 6.4, an(2, 'Z'))
    await linhas(s, [
      ['LuKeyRound', 'Senha conferida no servidor', 'Cinco erros seguidos bloqueiam por 30 minutos.'],
      ['LuFingerprint', 'Impressão digital SHA-256', 'Documento mudou depois de assinado? A assinatura é recusada.'],
      ['LuLayers', 'Fontes reservadas', 'O dinheiro em análise fica separado até a última assinatura.'],
      ['LuHistory', 'Estorno espelhado', 'Desfazer é um novo pedido, com a mesma cadeia; nada se apaga.'],
    ], 7.2, 2.7, 5.55, 1.02, 3, 16, 14)
    notas(s, 'Narração: "Para remanejar recursos, uma cadeia de assinaturas confirmadas com senha, e cada documento com sua impressão digital." Cada etapa avisa só a próxima pessoa; quem já aprovou uma etapa não aprova outra.')
  }

  // ═══ SEÇÃO 02 ══════════════════════════════════════════════════════════
  secao('02', 'Seção 02', 'Executar com controle', 'Fornecedores, contratos, aprovação de produtos, financeiro, acervo, patrimônio, viagens, diagnóstico de campo e mapa.',
    'Segundo bloco: a execução — do contrato ao pagamento, com as travas que protegem o recurso público.')
  const S2 = 'Executar com controle'
  // Fornecedores
  {
    const s = conteudo(S2, 'Fornecedores', 'Cadastro único, dados protegidos')
    tela(s, 'fornecedores', 6.05, 1.55, 6.9, an(1, 'Z'))
    await linhas(s, [
      ['LuBuilding2', 'Pessoa física e jurídica', 'Contratos vigentes e total pago de cada fornecedor.'],
      ['LuLock', 'Dados bancários à parte', 'Tabela própria, só coordenação e financeiro leem.'],
      ['LuSearch', 'Diretório para escolher', 'Listas abertas mostram só o nome, nunca CPF ou CNPJ.'],
      ['LuUserCheck', 'Acesso do fornecedor', 'Registra as próprias entregas — e nunca as avalia.'],
    ], 0.6, 1.75, 5.2, 1.22)
    notas(s, 'O fornecedor pode ganhar acesso para registrar entregas do próprio contrato; o banco impede que ele avalie ou altere produto do próprio contrato, mesmo que tenha outro perfil.')
  }
  // Contratos 1
  {
    const s = conteudo(S2, 'Gestão de contratos', 'Contratos, produtos e documentos num só lugar')
    tela(s, 'contratos', 0.45, 1.45, 6.6, an(1, 'Z'))
    tela(s, 'contrato-det', 1.05, 4.3, 6.55, an(2, 'Z'))
    await linhas(s, [
      ['LuChartColumn', 'Valor e execução', 'Pago e a pagar na mesma barra; o valor usado vem do Financeiro.'],
      ['LuPackageCheck', 'Produtos do contrato', 'Cronograma, valor e situação de cada produto e entrega.'],
      ['LuFileText', 'Documentos privados', 'PDF assinado com link temporário; tradução PT → EN.'],
      ['LuShieldCheck', 'Trava de cobertura', 'Contrato acima do TDR sem saldo fica travado até o remanejamento.'],
    ], 7.75, 1.75, 5.0, 1.22, 3, 16, 14)
    notas(s, 'Narração: "Contratos, produtos e pagamentos conversam entre si. Nenhum valor muda de lugar sem deixar rastro." Contrato travado não recebe produto, lançamento nem PDF assinado; libera sozinho quando entra saldo.')
  }
  // Contratos 2 — ciclo de vida
  {
    const s = conteudo(S2, 'Gestão de contratos', 'Do contrato vigente ao encerramento aprovado')
    const caixa = (t, d, x, y, w, h, a, n, cor = C.text2, corT = C.background1) => s.addText([{ text: t, options: { bold: true, fontSize: 16, color: corT, breakLine: true } },
      { text: d, options: { fontSize: 13, color: corT === C.background1 ? C.background2 : C.text1 } }], { shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.1, x, y, w, h,
      fill: { color: cor }, line: { color: C.accent6, width: 1 }, margin: [6, 10, 6, 10], valign: 'middle', objectName: a + n })
    const seta = (x1, y1, x2, y2, a, n) => s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001,
      flipV: y2 < y1, line: { color: C.accent2, width: 2, endArrowType: 'triangle' }, objectName: a + n })
    caixa('Vigente', 'execução normal', 0.6, 2.35, 2.2, 1.0, an(1, 'L', 0), 'b-vig', C.accent2, C.text1)
    caixa('Aguardando cobertura', 'passou do TDR sem saldo; libera sozinho', 0.6, 4.1, 2.2, 1.35, an(1, 'L', 1), 'b-cob')
    seta(1.7, 3.35, 1.7, 4.1, an(1, 'F', 2), 's-cob')
    caixa('Pedido de encerramento', 'produtos a cancelar, valor e justificativa', 3.35, 2.35, 2.6, 1.15, an(2, 'L', 0), 'b-ped')
    seta(2.8, 2.85, 3.35, 2.85, an(2, 'F', 0), 's-ped')
    caixa('Aprovação com senha', 'responsável ou substituto da atividade — nunca quem pediu', 6.5, 2.35, 2.9, 1.15, an(2, 'L', 1), 'b-apr', C.accent1, C.text1)
    seta(5.95, 2.92, 6.5, 2.92, an(2, 'F', 1), 's-apr')
    caixa('Encerrado', 'produtos cancelados e saldo liberado', 10.0, 1.65, 2.7, 1.05, an(3, 'L', 0), 'b-enc')
    caixa('Rescindido', 'distrato; indenização vai para "a pagar"', 10.0, 3.1, 2.7, 1.05, an(3, 'L', 1), 'b-res')
    seta(9.4, 2.7, 10.0, 2.2, an(3, 'F', 0), 's-enc'); seta(9.4, 3.1, 10.0, 3.6, an(3, 'F', 1), 's-res')
    caixa('Encerramento automático', 'tudo entregue e pago, nada a pagar: encerra sozinho', 3.35, 4.1, 6.05, 0.95, an(4, 'L', 0), 'b-auto')
    const C3 = [['LuFileCheck', 'Termo de encerramento', 'PDF com SHA-256; tarefa para anexar em 15 dias.'], ['LuWallet', 'Saldo volta ao orçamento', 'Em US$ pela PTAX do dia, direto no razão.'],
      ['LuCalculator', 'Conta que fecha', 'Pago + indenização + liberado = valor do contrato.']]
    for (const [i, [nIc, t, d]] of C3.entries()) {
      const x = 0.6 + i * 4.07, a = an(5, 'S', i)
      cartao(s, x, 5.65, 3.9, 1.15, a, 'cc' + i)
      s.addImage({ data: await ic(nIc), x: x + 0.2, y: 5.88, w: 0.45, h: 0.45, objectName: a + 'ccic' + i, altText: '' })
      s.addText([{ text: t, options: { bold: true, fontSize: 15, color: C.background1, breakLine: true } }, { text: d, options: { fontSize: 13, color: C.background2 } }],
        { x: x + 0.8, y: 5.72, w: 3.0, h: 1.0, margin: 0, valign: 'middle', isTextBox: true, objectName: a + 'cct' + i })
    }
    notas(s, 'O encerramento com produto em aberto só acontece pela aprovação do pedido, com senha, pelo responsável ou substituto da atividade. Distrato exige o Termo de Distrato e põe o contrato em "rescindido", lançando a indenização a pagar.')
  }
  // Produtos 1 — fluxo
  {
    const s = conteudo(S2, 'Aprovação de produtos', 'Da entrega à aprovação, sem atalhos')
    const P = [['LuUpload', 'Registro', 'Fornecedor ou responsável registra a entrega, com documentos e fotos.'], ['LuSearch', 'Avaliação', 'Aprovar total, parcial ou devolver com parecer.'],
      ['LuFileCheck', 'Nota técnica', 'PDF do SEI conferido automaticamente em segundos.'], ['LuKeyRound', 'Senha', 'Quem aprova confirma a senha; vale uma vez, por 10 minutos.'],
      ['LuBadgeCheck', 'Aprovado', 'E-mail à UNESCO com anexos, pagamento liberado e Matriz atualizada.']]
    for (const [i, [nIc, t, d]] of P.entries()) {
      const x = 0.6 + i * 2.45, a = an(1, 'S', i)
      cartao(s, x, 1.55, 2.3, 2.05, a, 'p' + i, i === 4 ? C.accent6 : C.text2)
      s.addText(String(i + 1), { x: x + 0.15, y: 1.68, w: 0.5, h: 0.45, fontSize: 22, bold: true, color: C.accent1, margin: 0, isTextBox: true, objectName: a + 'pn' + i })
      s.addImage({ data: await ic(nIc, HEX.accent2), x: x + 1.7, y: 1.72, w: 0.42, h: 0.42, objectName: a + 'pi' + i, altText: '' })
      s.addText([{ text: t, options: { bold: true, fontSize: 16, color: C.background1, breakLine: true } }, { text: d, options: { fontSize: 13, color: C.background2 } }],
        { x: x + 0.15, y: 2.2, w: 2.02, h: 1.35, margin: 0, valign: 'top', isTextBox: true, objectName: a + 'pt' + i })
    }
    const h = telaH('produto-av', 4.3)
    tela(s, 'produto-av', 8.5, 3.75, 4.3, an(2, 'Z'))
    await linhas(s, [
      ['LuUserX', 'Fornecedor registra, nunca avalia', 'Vale até para quem tem perfil de coordenação ou super admin.'],
      ['LuUsers', 'Quem avalia', 'Responsável ou substituto da atividade, ou super admin.'],
      ['LuMail', 'E-mail à UNESCO garantido', 'Um envio por vez; "Reenviar" só para quem não recebeu.'],
    ], 0.6, 3.95, 7.6, 0.95, 3, 16, 14)
    notas(s, 'Fluxo completo da aprovação de produtos. A tela de avaliação (à direita) traz a decisão, o despacho e a nota técnica obrigatória. A aprovação só vale com a nota conferida e a senha confirmada no servidor.')
  }
  // Produtos 2 — conferência da nota
  {
    const s = conteudo(S2, 'Aprovação de produtos', 'Nota técnica conferida em segundos')
    const R = ['PDF com texto legível', 'Título "Nota Técnica" ou "Parecer"', 'Assinatura eletrônica do SEI', 'Código verificador e CRC', 'Número do contrato citado',
      'Produto e fornecedor citados', 'Assinada há até 60 dias', 'Signatário é o responsável ou quem aprova', 'Nota nunca usada em outro produto']
    for (const [i, t] of R.entries()) {
      const c = i % 3, l = Math.floor(i / 3), x = 0.6 + c * 2.85, y = 1.6 + l * 1.12, a = an(1, 'Z', i)
      cartao(s, x, y, 2.7, 0.95, a, 'r' + i)
      s.addImage({ data: await ic('LuCircleCheck', HEX.accent1), x: x + 0.15, y: y + 0.27, w: 0.4, h: 0.4, objectName: a + 'ri' + i, altText: '' })
      s.addText(t, { x: x + 0.65, y: y + 0.08, w: 1.95, h: 0.8, fontSize: 14, color: C.background1, valign: 'middle', margin: 0, isTextBox: true, objectName: a + 'rt' + i })
    }
    cartao(s, 9.3, 1.6, 3.45, 3.2, an(2, 'S'), 'dest', C.accent6)
    s.addText([{ text: '9', options: { fontSize: 66, bold: true, color: C.accent1, breakLine: true } }, { text: 'regras conferidas antes de qualquer aprovação', options: { fontSize: 16, color: C.background1, breakLine: true } },
      { text: 'Sem IA e sem custo: o texto da nota não sai do servidor.', options: { fontSize: 13, color: C.background2 } }],
    { x: 9.55, y: 1.75, w: 3.0, h: 2.95, margin: 0, valign: 'top', isTextBox: true, objectName: an(2, 'S') + 'dest-t' })
    await linhas(s, [
      ['LuFilePen', 'Modelo pronto', 'A plataforma gera o modelo da nota em .docx, nas 8 seções usadas pelas notas aprovadas.'],
      ['LuLock', 'Nota fixada', 'Aprovada, a nota não é trocada; retirar exige motivo e fica no histórico.'],
    ], 0.6, 5.1, 12.1, 0.85, 3, 16, 14)
    notas(s, 'A conferência é feita por uma função própria que lê o PDF (sem inteligência artificial). Se qualquer regra falhar, a aprovação é bloqueada e a tela mostra qual item corrigir.')
  }
  // Financeiro
  {
    const s = conteudo(S2, 'Financeiro', 'Pagamento só com senha, câmbio rastreado')
    tela(s, 'financeiro', 6.05, 1.55, 6.9, an(1, 'Z'))
    await linhas(s, [
      ['LuKeyRound', 'Efetivar pagamento', 'Só super admin e financeiro, depois de confirmar a senha.'],
      ['LuReceipt', 'Câmbio da UNESCO', 'O US$ do pagamento é o gravado no ato e não muda depois.'],
      ['LuChartColumn', 'PTAX oficial diária', 'Cotação do Banco Central gravada todo dia útil.'],
      ['LuLock', 'Comprovantes privados', 'Notas e comprovantes abrem só por link assinado.'],
    ], 0.6, 1.75, 5.2, 1.22)
    notas(s, 'Os lançamentos a pagar são estimados pela cotação do dia; os pagos usam o câmbio informado pela UNESCO. O saldo oficial continua sendo o da Visão Geral.')
  }
  // Acervo
  {
    const s = conteudo(S2, 'Acervo Digital', 'A biblioteca de tudo o que foi entregue')
    tela(s, 'acervo', 0.45, 1.55, 6.9, an(1, 'Z'))
    await linhas(s, [
      ['LuLibrary', 'Estante e busca', 'Busca sem acento, filtros por atividade, resultado, ano e formato.'],
      ['LuBadgeCheck', 'A versão que vale', 'Mostra a entrega aprovada; versões anteriores ficam no histórico.'],
      ['LuImage', 'Capas automáticas', 'A primeira página do PDF vira a capa do produto.'],
      ['LuGlobe', 'Liberação para o site', 'Arquivo a arquivo, só pelo super admin — nunca nota técnica.'],
    ], 7.6, 1.75, 5.2, 1.22)
    notas(s, 'O Acervo é só leitura: é derivado das entregas, não copiado. Produto aprovado sem arquivo aparece como lacuna, para ser resolvido — nunca escondido.')
  }
  // Patrimônio
  {
    const s = conteudo(S2, 'Patrimônio', 'Cada bem com ficha, placa e dono')
    tela(s, 'patrimonio', 0.45, 1.55, 6.9, an(1, 'Z'))
    s.addImage({ path: path.join(IMG, 'placa.png'), x: 5.55, y: 3.9, w: 1.8, h: 2.4, objectName: an(2, 'Z') + 'placa', altText: 'Placa de patrimônio com QR Code (demonstração)' })
    await linhas(s, [
      ['LuReceipt', 'Entrada pela nota fiscal', 'XML ou DANFE lido no navegador; uma ficha por unidade.'],
      ['LuUserCheck', 'Termo com senha', 'Quem recebe o bem aceita o termo de responsabilidade.'],
      ['LuQrCode', 'Inventário por QR Code', 'Comissão confere no celular e assina com senha.'],
      ['LuCalculator', 'Depreciação calculada', 'Ocorrências, baixa aprovada e valor contábil numa data.'],
    ], 7.75, 1.75, 5.0, 1.22, 3)
    notas(s, 'Narração: "Cada bem tem ficha, placa com código QR, termo de responsabilidade e inventário digital." O patrimônio não mexe no saldo do projeto; registra o que foi comprado e com quem está.')
  }
  // Viagens
  {
    const s = conteudo(S2, 'Viagens e Diárias', 'Do pedido à prestação de contas')
    fluxo(s, ['Solicitação', 'Aprovação com senha', 'UNESCO emite', 'Comprovantes', 'Prestação', 'Realizada'], 0.6, 1.6, 12.1, 0.7, 1, 1)
    tela(s, 'viagens', 0.45, 2.55, 6.6, an(2, 'Z'))
    await linhas(s, [
      ['LuUserX', 'Quem viaja não aprova', 'Aprovação só pelo super admin, fora do protocolo, com senha.'],
      ['LuWallet', 'Fonte por linha', 'Cada viagem sai do TDR de reserva, com alerta em 80% e 95%.'],
      ['LuReceipt', 'Bilhete lido do PDF', 'Financeiro anexa bilhetes e diárias; o valor real acompanha.'],
      ['LuHistory', 'Devoluções', 'Viagem não realizada devolve diárias e reembolsos ao TDR.'],
    ], 7.35, 2.7, 5.4, 1.02, 3, 16, 14)
    notas(s, 'Beneficiários (viajantes externos) têm CPF mascarado na lista e dados bancários só para quem opera o pagamento.')
  }
  // Diagnóstico
  {
    const s = conteudo(S2, 'Diagnóstico Socioambiental', 'No campo, mesmo sem internet')
    s.addImage({ path: path.join(IMG, 'celular.png'), x: 0.7, y: 1.55, w: 2.45, h: 5.15, objectName: an(1, 'Z') + 'celular', altText: 'App de campo do Diagnóstico Socioambiental' })
    await linhas(s, [
      ['LuWifiOff', 'Funciona offline', 'Entra com PIN e envia as fichas quando o sinal volta.'],
      ['LuCamera', 'Fotos com GPS e voz', 'Carimbo de data e local; áudio transcrito por IA no próprio computador.'],
      ['LuLock', 'Identificação separada', 'Nomes e GPS ficam à parte; consultor externo não vê.'],
      ['LuChartColumn', 'Mesa de validação', 'Validar ou devolver; indicadores com supressão abaixo de 5.'],
    ], 3.5, 1.75, 4.5, 1.22, 2, 16, 14)
    tela(s, 'diagnostico', 8.1, 2.2, 4.85, an(3, 'Z'))
    notas(s, 'Narração: "No campo, o aplicativo do Diagnóstico Socioambiental funciona sem internet, com fotos georreferenciadas e privacidade desde a coleta." Identificação e fotos são apagadas dois anos após a validação.')
  }
  // Mapa
  {
    const s = conteudo(S2, 'Mapa Interativo', 'O projeto no território')
    tela(s, 'mapa', 0.45, 1.5, 7.9, an(1, 'Z'))
    await linhas(s, [
      ['LuMapPin', 'Entregas no mapa', 'Pontos, áreas e trilhas por tipo de entrega.'],
      ['LuLayers', 'Camadas ambientais', 'CAR, unidades de conservação, terras indígenas e cobertura vegetal.'],
      ['LuFileText', 'Relatórios em A4', 'Relatório ambiental e do CAR prontos para imprimir.'],
    ], 8.65, 1.85, 4.1, 1.45, 2, 16, 14)
    notas(s, 'Narração: "E o Mapa Interativo mostra, no território, onde o projeto acontece." Só coordenação, super admin e quem avalia a entrega editam pontos.')
  }

  // ═══ SEÇÃO 03 ══════════════════════════════════════════════════════════
  secao('03', 'Seção 03', 'Transparência e controle', 'Auditoria com inteligência artificial, relatórios oficiais, site público, Repositório de Referências e Pulso da Equipe.',
    'Terceiro bloco: como o projeto se mostra para dentro e para fora.')
  const S3 = 'Transparência e controle'
  // Auditoria
  {
    const s = conteudo(S3, 'Auditoria IA', 'Riscos apontados antes do problema')
    tela(s, 'auditoria', 6.05, 1.55, 6.9, an(1, 'Z'))
    await linhas(s, [
      ['LuBot', 'Agentes por área', 'TDRs, contratos, financeiro, produtos, viagens, Matriz, orçamento, patrimônio e acessos.'],
      ['LuFlag', 'Do crítico ao informativo', 'Achados por severidade, com referência e recomendação.'],
      ['LuSquareCheck', 'Tratamento com motivo', 'Resolver ou ignorar exige texto; nada some sem registro.'],
      ['LuSparkles', 'Assistente', 'Perguntas em linguagem natural sobre cada achado.'],
    ], 0.6, 1.75, 5.2, 1.22)
    notas(s, 'Narração: "A Auditoria com inteligência artificial vigia o projeto inteiro e aponta riscos antes que virem problema." Os critérios críticos vêm de conferências no banco; a IA não rebaixa um achado crítico.')
  }
  // Relatórios
  {
    const s = conteudo(S3, 'Relatórios', 'Prestação de contas em um clique')
    tela(s, 'relatorios', 6.05, 1.5, 6.9, an(1, 'Z'))
    s.addText([{ text: '55', options: { fontSize: 60, bold: true, color: C.accent1, breakLine: true } }, { text: 'relatórios no catálogo', options: { fontSize: 16, color: C.background1 } }],
      { x: 0.6, y: 1.55, w: 4, h: 1.35, margin: 0, valign: 'top', isTextBox: true, objectName: an(2, 'Z') + 'num' })
    await linhas(s, [
      ['LuFileText', 'Folha A4 padrão', 'Logos, identificação do projeto e "Página X de Y" em todas as folhas.'],
      ['LuDownload', 'PDF, Excel e CSV', 'PDF pelo navegador, com texto pesquisável; nada vai a servidor externo.'],
      ['LuLayers', 'Temas', 'Financeiro, contratos, TDRs, produtos, Matriz, viagens, patrimônio e orçamento.'],
    ], 0.6, 3.15, 5.2, 1.22, 3)
    notas(s, 'Narração: "E os relatórios oficiais saem prontos, em PDF, planilha ou apresentação." Quem vê cada grupo de relatórios segue as permissões da pessoa.')
  }
  // Site público
  {
    const s = conteudo(S3, 'Painel público', 'Transparência aberta a qualquer pessoa')
    tela(s, 'site-galeria', 2.7, 1.5, 4.9, an(1, 'Z'), 'tela-galeria')
    tela(s, 'site-home', 0.45, 2.6, 5.4, an(2, 'Z'), 'tela-home')
    await linhas(s, [
      ['LuGlobe', 'Página inicial com números', 'Atividades, TDRs aprovados, produtos entregues e pontos no mapa.'],
      ['LuMap', 'Mapa, resultados e finanças', 'Transparência financeira agregada, sem nome nem CPF.'],
      ['LuLibrary', 'Galeria e Linha do Tempo', 'Só produtos aprovados e liberados no Acervo, com leitura do PDF.'],
      ['LuPlug', 'Dados abertos (API)', 'Números agregados para painéis de outras plataformas.'],
    ], 7.85, 1.75, 4.9, 1.2, 3, 16, 14)
    s.addText('O site público é de outra autoria e lê da plataforma só o que as funções públicas liberam.', { x: 7.85, y: 6.5, w: 4.9, h: 0.45, fontSize: 11, italic: true, color: C.background2, margin: 0, isTextBox: true, objectName: an(4, 'F') + 'obs' })
    notas(s, 'O site público não acessa tabelas: lê funções próprias que devolvem só o necessário. Arquivos continuam em armazenamento privado; o site mostra o documento sem botão de download.')
  }
  // Repositório
  {
    const s = conteudo(S3, 'Repositório de Referências', 'O que se fala do projeto, organizado')
    tela(s, 'repositorio', 0.45, 1.55, 6.9, an(1, 'Z'))
    await linhas(s, [
      ['LuNewspaper', 'Uma ficha por matéria', 'O mesmo assunto em vários veículos vira uma ficha com botões.'],
      ['LuShieldCheck', 'Links seguros', 'Só http e https; sem serviço externo rastreando as visitas.'],
      ['LuSearch', 'Sem repetição', 'Avisa se o link já existe ou se a matéria já foi cadastrada.'],
      ['LuHistory', 'Nada se apaga', 'Desativar mantém o registro para consulta.'],
    ], 7.6, 1.75, 5.2, 1.22)
    notas(s, 'Matérias, publicações e documentos externos sobre o projeto. Os títulos e veículos desta tela são fictícios.')
  }
  // Pulso
  {
    const s = conteudo(S3, 'Pulso da Equipe', 'Ouvir a equipe, sem expor ninguém')
    tela(s, 'pulso', 6.05, 1.55, 6.9, an(1, 'Z'))
    await linhas(s, [
      ['LuQrCode', 'Resposta por QR Code', 'Questionário curto, no celular, em poucos minutos.'],
      ['LuEye', 'Anônimo de verdade', 'Resposta sem nome nem hora; resultado só com 5 respostas ou mais.'],
      ['LuActivity', 'Comprometimento e sintonia', 'Evolução ciclo a ciclo e comentários que viram tarefas.'],
      ['LuDownload', 'Exportação agregada', 'Planilha, A4 ou PowerPoint — nunca resposta individual.'],
    ], 0.6, 1.75, 5.2, 1.22)
    notas(s, 'Qualquer pessoa cria um ciclo. Perguntas são editáveis até a primeira resposta.')
  }

  // ═══ SEÇÃO 04 ══════════════════════════════════════════════════════════
  secao('04', 'Seção 04', 'Pessoas, acesso e ajuda', 'Administração do sistema, níveis de acesso, segurança e LGPD, e o apoio para aprender a usar.',
    'Último bloco: quem pode fazer o quê, como os dados são protegidos e como a equipe aprende.')
  const S4 = 'Pessoas, acesso e ajuda'
  // Administração
  {
    const s = conteudo(S4, 'Administração', 'O sistema configurado pela própria equipe')
    tela(s, 'usuarios', 6.05, 1.55, 6.9, an(1, 'Z'))
    await linhas(s, [
      ['LuUserCog', 'Usuários e acessos', 'Perfil, módulos com prazo, revisão, senha e histórico.'],
      ['LuPalette', 'Dados do sistema', 'Identidade, fotos e logos, com prévia da tela de entrada.'],
      ['LuHardDrive', 'Armazenamento', 'Uso do banco e dos arquivos, com alerta em 80% e 95%.'],
      ['LuLock', 'Privacidade (ROPA)', 'Registro dos tratamentos de dados pessoais, conferido com o banco.'],
      ['LuPlug', 'Integrações (API)', 'Pedido de chave por e-mail, decisão com senha e retirada única.'],
    ], 0.6, 1.7, 5.2, 1.02, 2, 16, 14)
    notas(s, 'Administração é restrita ao super admin. A chave da API nunca vai por e-mail: a pessoa retira por um link de uso único.')
  }
  // Níveis de acesso
  {
    const s = conteudo(S4, 'Níveis de acesso', 'Perfil é o teto; a liberação é a chave')
    const cab = { bold: true, color: C.text1, fill: { color: C.accent1 }, fontSize: 14 }
    const lin = (p, d) => [{ text: p, options: { bold: true, color: C.accent1, fontSize: 14 } }, { text: d, options: { color: C.background1, fontSize: 13 } }]
    s.addTable([
      [{ text: 'Perfil', options: cab }, { text: 'Até onde pode ir', options: cab }],
      lin('Super Admin', 'Tudo; libera acessos, designa titulares e aprova viagens. Mínimo de 2 ativos.'),
      lin('Coordenação', 'Planejamento, TDRs, contratos, remanejamento e pedidos de encerramento.'),
      lin('Técnico / Focal', 'As atividades em que é responsável ou substituto; avalia produtos.'),
      lin('Financeiro', 'Pagamentos com senha, fornecedores e confirmações financeiras.'),
      lin('Consultor externo', 'Só o liberado: suas entregas e fichas sem identificação.'),
      lin('Visualizador', 'Leitura de números e painéis.'),
    ], { x: 0.6, y: 1.6, w: 7.6, colW: [2.1, 5.5], rowH: 0.62, fill: { color: C.text2 }, border: { type: 'solid', pt: 0.75, color: HEX.accent6 }, valign: 'middle',
      margin: [4, 8, 4, 8], objectName: an(1, 'S') + 'tabela' })
    cartao(s, 8.5, 1.6, 4.25, 5.2, an(2, 'S'), 'regras', C.accent6)
    s.addText([
      { text: 'Como o acesso funciona', options: { bold: true, fontSize: 17, color: C.accent1, breakLine: true } },
      { text: 'Núcleo sempre aberto: Visão Geral, Tarefas, Manual e Meu perfil.', options: { bullet: true, fontSize: 14, color: C.background1, breakLine: true } },
      { text: 'Cada módulo é liberado por pessoa, com prazo.', options: { bullet: true, fontSize: 14, color: C.background1, breakLine: true } },
      { text: 'Responsável de atividade recebe os módulos na hora.', options: { bullet: true, fontSize: 14, color: C.background1, breakLine: true } },
      { text: '15 dias sem uso suspendem a entrada (aviso no 12º dia).', options: { bullet: true, fontSize: 14, color: C.background1, breakLine: true } },
      { text: 'Nova senha por link de 24 h; a senha nunca vai por e-mail.', options: { bullet: true, fontSize: 14, color: C.background1 } },
    ], { x: 8.75, y: 1.8, w: 3.8, h: 4.85, margin: 0, valign: 'top', paraSpaceAfter: 8, isTextBox: true, objectName: an(2, 'S') + 'regras-t' })
    notas(s, 'As regras valem no banco de dados, não só na tela: sem o módulo liberado, a pessoa não lê os dados daquele módulo, mesmo pelo endereço direto.')
  }
  // Segurança e LGPD
  {
    const s = conteudo(S4, 'Segurança e LGPD', 'Segurança de ponta a ponta')
    const K = [['LuKeyRound', 'Assinatura com senha', 'Remanejamento, encerramento, produtos, pagamentos, viagens, patrimônio e API.'],
      ['LuDatabase', 'Regras no banco', 'Cada perfil lê só o que pode; a tela não decide sozinha.'],
      ['LuHistory', 'Trilha imutável', 'Quem mudou o quê e quando; dados bancários ficam redigidos.'],
      ['LuLock', 'Arquivos privados', 'Documentos abrem só por link assinado e temporário.'],
      ['LuShieldCheck', 'LGPD na prática', 'ROPA vivo, CPF mascarado, dados bancários separados e prazo de retenção.'],
      ['LuSparkles', 'IA com privacidade', 'CPF e CNPJ saem do texto antes da IA; voz transcrita no próprio computador.']]
    for (const [i, [nIc, t, d]] of K.entries()) {
      const c = i % 3, l = Math.floor(i / 3), x = 0.6 + c * 4.07, y = 1.6 + l * 2.65, a = an(1 + l, 'S', c)
      cartao(s, x, y, 3.9, 2.45, a, 'k' + i)
      await bolinha(s, x + 0.25, y + 0.25, 0.7, nIc, a, 'kb' + i)
      s.addText([{ text: t, options: { bold: true, fontSize: 18, color: C.background1, breakLine: true } }, { text: d, options: { fontSize: 14, color: C.background2 } }],
        { x: x + 0.25, y: y + 1.05, w: 3.45, h: 1.3, margin: 0, valign: 'top', isTextBox: true, objectName: a + 'kt' + i })
    }
    notas(s, 'Narração: "Tudo com segurança de ponta a ponta e respeito à Lei Geral de Proteção de Dados." A SEMA/AC é a controladora dos dados; o tratamento se apoia na execução de políticas públicas e de contratos.')
  }
  // Ajuda
  {
    const s = conteudo(S4, 'Ajuda', 'Aprender a usar, dentro da própria tela')
    tela(s, 'ajuda', 0.45, 1.55, 6.9, an(1, 'Z'))
    await linhas(s, [
      ['LuBookOpen', 'Manual do sistema', 'Uma guia por módulo, com busca em todo o manual e "Ir para".'],
      ['LuCircleHelp', 'Botão "?" em cada tela', 'Abre a ajuda daquela página sem sair do que está fazendo.'],
      ['LuGraduationCap', 'Aprender a usar', '18 guias passo a passo que destacam o botão real na tela.'],
      ['LuInfo', 'Sobre o sistema', 'Autoria, licença e componentes de terceiros.'],
    ], 7.6, 1.75, 5.2, 1.22)
    notas(s, 'Os guias passo a passo não salvam nada: abrem a janela, mostram o caminho e fecham ao terminar. O progresso fica só no aparelho da pessoa.')
  }

  // ═══ FECHO ═════════════════════════════════════════════════════════════
  pres.addSection({ title: 'Encerramento' })
  {
    const s = pres.addSlide({ masterName: 'FECHO', sectionTitle: 'Encerramento' })
    s.addText([{ text: 'Transparência ', options: { color: C.background1 } }, { text: 'que se vê.', options: { color: C.accent1 } }],
      { x: 0.9, y: 1.1, w: 11.5, h: 1.1, fontSize: 56, bold: true, fontFace: 'Arial', margin: 0, isTextBox: true, objectName: an(1, 'S') + 'f1' })
    s.addText([{ text: 'Resultados ', options: { color: C.background1 } }, { text: 'que ficam.', options: { color: C.accent1 } }],
      { x: 0.9, y: 2.2, w: 11.5, h: 1.1, fontSize: 56, bold: true, fontFace: 'Arial', margin: 0, isTextBox: true, objectName: an(2, 'S') + 'f2' })
    s.addText('Plataforma Inteligente de Gestão de Projetos', { x: 0.9, y: 3.45, w: 11.5, h: 0.55, fontSize: 24, color: C.background2, margin: 0, isTextBox: true, objectName: an(3, 'F') + 'nome' })
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.9, y: 4.4, w: 11.5, h: 1.3, rectRadius: 0.15, fill: { color: 'FFFFFF' }, line: { type: 'none' }, objectName: an(4, 'S') + 'faixa' })
    const P = [['UNESCO_logo_hor_blue_transparent.png.png', 2.3, 0.49, 'UNESCO'], ['UNCT_Logo_RGB_Brazil_Portuguese_horiz_color.png', 2.6, 0.7, 'ONU Brasil'],
      ['logo-fundo-brasil-onu.png', 1.6, 0.9, 'Fundo Brasil-ONU'], ['logo-consorcio-amazonia.png', 1.35, 0.95, 'Consórcio Amazônia Legal']]
    let x = 1.35
    for (const [f, w, h, alt] of P) { s.addImage({ path: ASSET(f), x, y: 4.4 + (1.3 - h) / 2, w, h, objectName: an(4, 'F', 1) + 'parc-' + alt.replace(/\W+/g, ''), altText: alt }); x += w + 0.75 }
    s.addImage({ path: ASSET('brasao-acre.png'), x: 0.9, y: 6.05, w: 1.3, h: 0.65, objectName: an(5, 'F', 0) + 'acre', altText: 'Governo do Acre' })
    s.addImage({ path: ASSET('sema-branco.png'), x: 2.45, y: 6.13, w: 2.85, h: 0.49, objectName: an(5, 'F', 1) + 'sema', altText: 'SEMA/AC' })
    s.addText([{ text: 'CONCEPÇÃO E DESENVOLVIMENTO', options: { fontSize: 11, bold: true, color: C.accent1, charSpacing: 2, breakLine: true } },
      { text: 'Erisson Cameli Santiago  ·  © 2025–2026', options: { fontSize: 15, color: C.background1 } }],
    { x: 7.6, y: 6.0, w: 4.8, h: 0.75, align: 'right', margin: 0, isTextBox: true, objectName: an(5, 'F', 2) + 'credito' })
    notas(s, 'Encerramento do vídeo: "Transparência que se vê. Resultados que ficam." Telas reais da plataforma com dados fictícios de demonstração. Antes de veicular fora do projeto, confirmar o uso das logos com as assessorias dos parceiros.')
  }

  await pres.writeFile({ fileName: SAIDA })
  await applyTheme(SAIDA, THEME)
  console.log('ok', SAIDA)
})().catch(e => { console.error(e); process.exit(1) })
