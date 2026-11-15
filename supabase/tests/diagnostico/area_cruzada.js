// ════════════════════════════════════════════════════════════════════════
// Teste cruzado da regra de área de campo: js/diag-area.js (app) × SQL
// (fn_diag_area_classificar, fn_diag_geo_dentro, fn_diag_geo_dist_borda,
// fn_diag_area_celula). Usa os 5 setores REAIS da migração diag_22 e pontos
// com semente fixa: espalhados no retângulo, colados na divisa (onde as duas
// contas mais facilmente divergem) e com precisões de GPS variadas.
//
//   node area_cruzada.js gerar <casos.sql> <saida-esperada.json>
//   node area_cruzada.js comparar <saida-esperada.json> <saida_sql.jsonl>
// O arquivo .sql cria as tabelas temporárias e devolve uma linha JSON por caso.
// ════════════════════════════════════════════════════════════════════════
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const A = require(path.join(__dirname, '../../../js/diag-area.js'))

const MIG = path.join(__dirname, '../../migrations/20261122_diag_22_setores_sao_francisco.sql')
const SETORES = [...fs.readFileSync(MIG, 'utf8').matchAll(
  /fn_diag_setor_carregar\(v_com, '([A-Z0-9]+)', \d+, '[^']*', '[a-z]*', \d+, [\d.]+, (\d+), '(\{[^']*\})'::jsonb, '[^']*'::jsonb, array\[([-\d.,]+)\]/g)]
  .map(m => ({ codigo: m[1], celula_m: +m[2], geojson: JSON.parse(m[3]), bbox: m[4].split(',').map(Number) }))

let s = 20261115
function rnd() { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const pick = a => a[Math.floor(rnd() * a.length)]
const num = v => v == null ? 'null' : String(v)

function gerar(arqSql, arqCasos) {
  if (SETORES.length !== 5) throw new Error('esperava 5 setores na diag_22, achei ' + SETORES.length)
  const casos = []
  let id = 0
  SETORES.forEach((st, i) => {
    const [x0, y0, x1, y1] = st.bbox, folga = 0.01
    for (let k = 0; k < 300; k++) {
      let lat, lon
      if (k % 3 === 0) {             // colado na divisa: vértice + até ~150 m
        const v = pick(st.geojson.coordinates[0])
        lon = v[0] + (rnd() - 0.5) * 0.003; lat = v[1] + (rnd() - 0.5) * 0.003
      } else {
        lon = x0 - folga + rnd() * (x1 - x0 + 2 * folga); lat = y0 - folga + rnd() * (y1 - y0 + 2 * folga)
      }
      casos.push({ id: id++, i, lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6,
                   prec: pick([null, 4, 15, 60, 120, 200]), tol: pick([0, 50, 100]) })
    }
  })
  casos.push({ id: id++, i: 0, lat: null, lon: null, prec: null, tol: 50 })
  const linhas = ['\\o /dev/null', 'create temp table setores (i int, geo jsonb, bbox numeric[], cel int);']
  SETORES.forEach((st, i) => linhas.push(`insert into setores values (${i}, $g$${JSON.stringify(st.geojson)}$g$::jsonb, array[${st.bbox.join(',')}]::numeric[], ${st.celula_m});`))
  linhas.push('create temp table casos (id int, i int, lat float8, lon float8, prec float8, tol float8);')
  casos.forEach(c => linhas.push(`insert into casos values (${c.id}, ${c.i}, ${num(c.lat)}, ${num(c.lon)}, ${num(c.prec)}, ${num(c.tol)});`))
  linhas.push('\\o', `select jsonb_build_object('id', c.id,
  'cls', public.fn_diag_area_classificar(s.geo, c.lat, c.lon, c.prec, c.tol),
  'cel', public.fn_diag_area_celula(s.bbox, s.cel, c.lat, c.lon),
  'din', public.fn_diag_geo_dentro(s.geo, c.lat, c.lon),
  'd', public.fn_diag_geo_dist_borda(s.geo, c.lat, c.lon))::text
from casos c join setores s on s.i = c.i order by c.id;`)
  fs.writeFileSync(arqSql, linhas.join('\n') + '\n')
  fs.writeFileSync(arqCasos, JSON.stringify(casos))
  console.log('· ' + casos.length + ' pontos gerados nos 5 setores reais')
}

function comparar(arqCasos, arqSaida) {
  const casos = JSON.parse(fs.readFileSync(arqCasos, 'utf8'))
  const sql = {}
  fs.readFileSync(arqSaida, 'utf8').trim().split('\n').forEach(l => { const o = JSON.parse(l); sql[o.id] = o })
  let erros = 0; const cont = {}
  for (const c of casos) {
    const st = SETORES[c.i], o = sql[c.id]
    const cls = A.classificar(st.geojson, c.lat, c.lon, c.prec, c.tol)
    const cel = A.celula(st.bbox, st.celula_m, c.lat, c.lon)
    const din = A.dentro(st.geojson, c.lat, c.lon)
    const d = A.distBorda(st.geojson, c.lat, c.lon)
    cont[cls] = (cont[cls] || 0) + 1
    const difD = d == null ? (o.d == null ? 0 : 1) : Math.abs(d - o.d)
    if (!o || cls !== o.cls || cel !== o.cel || din !== o.din || difD > 1e-6) {
      if (erros++ < 10) console.error('DIVERGE', JSON.stringify(c), { js: { cls, cel, din, d }, sql: o })
    }
  }
  if (erros) { console.error('FALHOU: ' + erros + ' divergência(s) na regra de área'); process.exit(1) }
  const faltam = ['dentro', 'borda', 'fora', 'impreciso', 'sem_gps'].filter(k => !cont[k])
  if (faltam.length) { console.error('FALHOU: casos não cobriram ' + faltam.join(', ')); process.exit(1) }
  console.log('· regra de área JS × SQL idêntica em ' + casos.length + ' pontos ' + JSON.stringify(cont))
}

const [cmd, a, b] = process.argv.slice(2)
if (cmd === 'gerar') gerar(a, b)
else if (cmd === 'comparar') comparar(a, b)
else { console.error('uso: area_cruzada.js gerar|comparar ...'); process.exit(2) }
