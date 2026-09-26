// ════════════════════════════════════════════════════════════════════════
// Teste cruzado: js/diag-regras.js (app) × funções SQL do banco.
// As duas implementações interpretam a mesma estrutura do questionário;
// este teste gera casos aleatórios (com semente fixa) — válidos, com saltos,
// "_nr", "especifique" e erros estruturais — e exige resultado IDÊNTICO:
// mesma normalização, mesmos alertas na mesma ordem, mesmo código de erro.
//
//   node regras_cruzadas.js gerar  <arquivo_casos.jsonl>
//   node regras_cruzadas.js comparar <arquivo_casos.jsonl> <saida_sql.jsonl>
// (rodar.sh chama os dois passos em volta do psql)
// ════════════════════════════════════════════════════════════════════════
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const R = require(path.join(__dirname, '../../../js/diag-regras.js'))

const MIG = path.join(__dirname, '../../migrations/20260926_diag_05_questionario_v1.sql')
const est = JSON.parse(/\$estrutura\$([\s\S]*)\$estrutura\$/.exec(fs.readFileSync(MIG, 'utf8'))[1])

// PRNG com semente (mulberry32) — casos reprodutíveis
let s = 20260926
function rnd() { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const pick = a => a[Math.floor(rnd() * a.length)]
const chance = p => rnd() < p

function respostaAleatoria(p) {
  const ops = (p.opcoes || []).map(o => o.v)
  if (chance(0.06)) return '_nr'
  switch (p.tipo) {
    case 'unica': return pick(ops)
    case 'multipla': {
      const excl = (p.opcoes || []).filter(o => o.exclusiva).map(o => o.v)
      if (excl.length && chance(0.2)) return [pick(excl)]
      const n = 1 + Math.floor(rnd() * 3)
      const livres = ops.filter(o => !excl.includes(o))
      return [...new Set(Array.from({ length: n }, () => pick(livres)))]
    }
    case 'inteiro': return Math.floor((p.min || 0) + rnd() * Math.min((p.max || 50) - (p.min || 0), 60))
    case 'decimal': return Math.round(rnd() * 2000 * 10) / 10
    default: return pick(['texto qualquer', '   ', 'Sindicato Rural', '', 'ok\n'])
  }
}

function caso(i) {
  const resp = {}
  R.perguntas(est).forEach(({ p }) => {
    if (R.foraDeRespostas(p) || chance(0.12)) return
    resp[p.chave] = respostaAleatoria(p)
    const temEsp = (p.opcoes || []).some(o => o.especificar)
    if (temEsp && chance(0.5) && (resp[p.chave] === 'outro' || (Array.isArray(resp[p.chave]) && resp[p.chave].includes('outro'))))
      resp[p.chave + '_outro'] = pick(['cacimba', '  ', 'outra coisa'])
  })
  // erros estruturais em parte dos casos
  const tipoErro = i % 20   // ~30% dos casos com erro estrutural
  if (tipoErro === 1) resp.campo_inventado = 'x'
  if (tipoErro === 2) resp.comunicacao_meios = ['celular', 'nenhum']
  if (tipoErro === 3) resp.idade = 500
  if (tipoErro === 4) { resp.agua_fonte = 'poco'; resp.agua_fonte_outro = 'x' }
  if (tipoErro === 5) resp.idade = 30.5
  if (tipoErro === 6) resp.entrevistado_nome = 'não pode estar aqui'
  const nm = Math.floor(rnd() * 6)
  const mor = Array.from({ length: nm }, (_, k) => ({
    ordem: k + 1, idade: chance(0.9) ? Math.floor(rnd() * 90) : null,
    sexo_genero: pick(['mulher', 'homem', 'outro', 'prefere_nao_responder', null]),
    e_entrevistado: k === 0 && chance(0.8),
  }))
  return { id: i, resp, mor }
}

function ordenar(v) {
  if (Array.isArray(v)) return v.map(ordenar)
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => (o[k] = ordenar(v[k]), o), {})
  return v
}

function resultadoJs(c) {
  try {
    const norm = R.normalizar(est, c.resp, c.mor)
    return { resp: norm, alertas: R.alertas(est, norm, c.mor), apl: R.aplicaveis(est, norm) }
  } catch (e) {
    return { erro: String(e.message).split(':').slice(0, 2).join(':') }
  }
}

const [, , modo, a1, a2] = process.argv
if (modo === 'gerar') {
  const N = 1000
  fs.writeFileSync(a1, Array.from({ length: N }, (_, i) => JSON.stringify(caso(i))).join('\n') + '\n')
  console.log('· ' + N + ' casos gerados')
} else if (modo === 'comparar') {
  const casos = fs.readFileSync(a1, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const sql = {}
  fs.readFileSync(a2, 'utf8').trim().split('\n').forEach(l => { const o = JSON.parse(l); sql[o.id] = o.r })
  let falhas = 0, erros = 0
  casos.forEach(c => {
    const js = resultadoJs(c)
    const db = sql[c.id]
    if (db.erro) db.erro = String(db.erro).split(':').slice(0, 2).join(':')
    if (js.erro) erros++
    const a = JSON.stringify(ordenar(js)), b = JSON.stringify(ordenar(db))
    if (a !== b) {
      falhas++
      if (falhas <= 3) console.error('DIVERGÊNCIA no caso ' + c.id + '\n  js : ' + a.slice(0, 600) + '\n  sql: ' + b.slice(0, 600))
    }
  })
  if (falhas) { console.error('FALHOU: ' + falhas + ' de ' + casos.length + ' casos divergem'); process.exit(1) }
  console.log('· regras JS × SQL idênticas em ' + casos.length + ' casos (' + erros + ' com erro esperado)')
} else {
  console.error('uso: gerar <casos> | comparar <casos> <saida_sql>'); process.exit(2)
}
