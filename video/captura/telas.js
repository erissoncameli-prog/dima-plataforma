// Lista de telas capturadas para o vídeo.
'use strict'
const CSS = '#ajuda-btn{display:none!important}'
module.exports = [
  {
    nome: 'dashboard', url: '/pages/dashboard.html', espera: 3500, css: CSS,
    capturas: [
      { sufixo: 'tarefas' },
      { sufixo: 'financiadores', antes: pg => pg.click('.vg-tab[data-aba="financiadores"]'), espera: 1800 },
      { sufixo: 'execucao', antes: pg => pg.click('.vg-tab[data-aba="execucao"]'), espera: 1800 },
      { sufixo: 'resultados', antes: pg => pg.click('.vg-tab[data-aba="resultados"]'), espera: 1800 },
    ],
  },
  { nome: 'atividades', url: '/pages/atividades.html', css: CSS },
  { nome: 'tdrs', url: '/pages/tdrs.html', css: CSS },
  { nome: 'contratos', url: '/pages/contratos.html', css: CSS },
  { nome: 'produtos', url: '/pages/produtos.html', css: CSS },
  { nome: 'financeiro', url: '/pages/financeiro.html', css: CSS },
  { nome: 'remanejamentos', url: '/pages/remanejamentos.html', css: CSS, capturas: [
    { sufixo: 'saldos' },
    { sufixo: 'pedido', antes: (pg, D) => pg.evaluate(id => remAbrirPedido(id), D.base.remanejamentos[0].id), espera: 1500 }] },
  { nome: 'matriz', url: '/pages/matriz.html', css: CSS },
  { nome: 'mapa', url: '/pages/mapa.html', css: CSS + '.mapa-modo-ctrl{display:none!important}', espera: 4000,
    prep: async pg => { await pg.keyboard.press('Escape'); await pg.evaluate(() => { document.querySelectorAll('.basemap-menu,.modo-mapa-menu').forEach(e => e.style.display = 'none'); mapaL.setView([-9.985, -67.85], 12) }); await pg.waitForTimeout(5000) } },
  { nome: 'patrimonio', url: '/pages/patrimonio.html', css: CSS },
  { nome: 'auditoria', url: '/pages/auditoria.html', css: CSS },
  { nome: 'relatorios', url: '/pages/relatorios.html', css: CSS, capturas: [
    { sufixo: 'f1', antes: async pg => { await pg.evaluate(() => { selecionarRel('F1') }); await pg.waitForTimeout(800); await pg.evaluate(() => gerarRelatorio('F1')) }, espera: 3000 },
    { sufixo: 'm1', antes: async pg => { await pg.evaluate(() => { selecionarRel('M1') }); await pg.waitForTimeout(800); await pg.evaluate(() => gerarRelatorio('M1')) }, espera: 3000 }] },
  { nome: 'dashboard-claro', url: '/pages/dashboard.html', espera: 3500, css: CSS, tema: 'claro', capturas: [
    { sufixo: 'fin', antes: pg => pg.click('.vg-tab[data-aba="financiadores"]'), espera: 1800 }] },
  { nome: 'tarefas', url: '/pages/tarefas.html', css: CSS },
  { nome: 'diagnostico', url: '/pages/diagnostico.html', css: CSS },
  { nome: 'diag-app', url: '/pages/diagnostico-app.html', viewport: { width: 390, height: 844 }, escala: 3, celular: true, espera: 3500 },
  // ── telas extras para a apresentação ──
  { nome: 'repositorio', url: '/pages/repositorio.html', css: CSS },
  { nome: 'usuarios', url: '/pages/usuarios.html', css: CSS },
  { nome: 'ajuda', url: '/pages/ajuda.html', css: CSS },
  { nome: 'acervo', url: '/pages/acervo.html', css: CSS, espera: 4000 },
  { nome: 'viagens', url: '/pages/viagens.html', css: CSS },
  { nome: 'fornecedores', url: '/pages/fornecedores.html', css: CSS },
  { nome: 'pulso', url: '/pages/pulso.html', css: CSS },
  { nome: 'site-home', url: '/site-publico/index.html', uid: null, espera: 4000, tema: 'claro' },
  { nome: 'site-galeria', url: '/site-publico/produtos.html', uid: null, espera: 4000, tema: 'claro' },
  { nome: 'contrato-detalhe', url: '/pages/contratos.html', css: CSS, espera: 3000,
    prep: async (pg, D) => { await pg.evaluate(id => toggleDet(id), D.base.contratos[0].id); await pg.waitForTimeout(1200)
      await pg.evaluate(id => document.getElementById('det-' + id).scrollIntoView({ block: 'center' }), D.base.contratos[0].id) } },
  { nome: 'produto-avaliacao', url: '/pages/produtos.html', css: CSS, espera: 3000,
    prep: async (pg, D) => { const p = D.base.contratos_produtos.find(x => x.situacao === 'em_analise'); await pg.evaluate(id => abrirModal(id), p.id); await pg.waitForTimeout(1500) } },
]
