// Confere os guias "Aprender a usar" (js/guias-plataforma.js) contra o código das telas:
// cada id (#x) e classe (.x) dos `alvo` precisa aparecer no código da tela do guia (ou do layout/autoria,
// para o passeio). Tela mudou e o guia ficou apontando para o vazio ⇒ este teste acusa.
// Uso: node tests/guias/conferir-alvos.js   (sai com código 1 se algo faltar)
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const raiz = path.resolve(__dirname, '..', '..')
const ler = f => { try { return fs.readFileSync(path.join(raiz, f), 'utf8') } catch (e) { return '' } }

// Carrega o módulo num "navegador" mínimo só para obter a lista de guias.
const doc = { currentScript: null, querySelector: () => null, querySelectorAll: () => [], head: { appendChild () {} },
  createElement: () => ({}), body: null, addEventListener () {}, getElementById: () => null }
const win = { document: doc, location: { search: '', href: '' }, history: {}, localStorage: { getItem: () => null } }
win.window = win
const ctx = vm.createContext(Object.assign(win, { URLSearchParams, MutationObserver: function () { this.observe = () => {} },
  console, setTimeout }))
vm.runInContext(ler('js/guias-plataforma.js'), ctx)
const GUIAS = ctx.DimaGuias.guias()

// Código de cada tela (página + js próprio quando houver)
const COMUM = ['js/layout.js', 'js/autoria.js', 'js/ajuda.js', 'js/diag-tema.js'].map(ler).join('\n') +
  ['tdrs', 'atividades', 'contratos', 'financeiro', 'relatorios', 'dashboard'].map(p => ler(`pages/${p}.html`)).join('\n')
const CODIGO = {
  '*': COMUM,
  tarefas: ler('pages/tarefas.html') + ler('js/tarefas.js'),
  produtos: ler('pages/produtos.html') + ler('js/produtos.js'),
  tdrs: ler('pages/tdrs.html'),
  financeiro: ler('pages/financeiro.html'),
  relatorios: ler('pages/relatorios.html'),
  dashboard: ler('pages/dashboard.html'),
  atividades: ler('pages/atividades.html'),
  contratos: ler('pages/contratos.html'),
  remanejamentos: ler('pages/remanejamentos.html') + ler('js/remanejamentos.js'),
  viagens: ler('pages/viagens.html'),
  fornecedores: ler('pages/fornecedores.html'),
  matriz: ler('pages/matriz.html'),
  acervo: ler('pages/acervo.html') + ler('js/acervo.js'),
  mapa: ler('pages/mapa.html'),
  diagnostico: ler('pages/diagnostico.html') + ler('js/diagnostico.js') + ler('js/diagnostico-validacao.js'),
  pulso: ler('pages/pulso.html') + ler('js/pulso.js'),
  usuarios: ler('pages/usuarios.html') + ler('js/usuarios.js'),
}

let falhas = 0, total = 0
const nomes = sel => {
  sel = sel.replace(/\[[^\]]*\]/g, '')   // atributos ([onclick*="x.y"]) não são id nem classe
  const ids = [...sel.matchAll(/#([\w-]+)/g)].map(m => ['id', m[1]])
  const cls = [...sel.matchAll(/\.([\w-]+)/g)].map(m => ['classe', m[1]])
  return ids.concat(cls)
}
for (const g of GUIAS) {
  const codigo = CODIGO[g.pagina]
  if (codigo === undefined) { console.log(`✗ ${g.slug}: tela "${g.pagina}" sem código mapeado no teste`); falhas++; continue }
  g.passos.forEach((p, i) => {
    for (const sel of [p.alvo, (p.tela || '').startsWith('clique:') ? p.tela.slice(7) : null].filter(Boolean)) {
      // Seletor com alternativas ("a, b"): basta uma existir
      const alternativas = sel.split(',').map(s => s.trim())
      const ok = alternativas.some(alt => nomes(alt).every(([tipo, n]) =>
        tipo === 'id' ? new RegExp(`id=["'\\\\]*${n}["'\\\\]|\\.id *= *['"]${n}['"]`).test(codigo)
                      : new RegExp(`[\\s"'.]${n}[\\s"'\`$]|className *= *['"][^'"]*\\b${n}\\b`).test(codigo)))
      total++
      if (!ok) { falhas++; console.log(`✗ ${g.slug} passo ${i + 1} "${p.titulo}": ${sel} não encontrado no código da tela`) }
    }
  })
  for (const p of g.passos) {
    const m = /^abrir:(\w+)/.exec(p.tela || '')
    if (m && !new RegExp(`function ${m[1]}\\b|window\\.${m[1]} *= *(async +)?function`).test(codigo)) { falhas++; console.log(`✗ ${g.slug}: função ${m[1]} não existe na tela`) }
  }
}
console.log(falhas ? `\n${falhas} problema(s) em ${total} alvos.` : `OK: ${total} alvos de ${GUIAS.length} guias encontrados no código.`)
process.exit(falhas ? 1 : 0)
