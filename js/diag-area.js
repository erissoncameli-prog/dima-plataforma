// ── DIMA · Diagnóstico Socioambiental — regra de área de campo ──────────
//
// Mesma regra de supabase/migrations/20261122_diag_21_setores_campo.sql
// (fn_diag_geo_dentro, fn_diag_geo_dist_borda, fn_diag_area_classificar,
// fn_diag_area_pior, fn_diag_area_celula). Mudou num ⇒ muda no outro e passa
// no teste cruzado (supabase/tests/diagnostico/area_cruzada.js).
//
// Situações de um ponto frente ao setor:
//   dentro · borda (a menos da margem da divisa, de qualquer lado — o GPS não
//   decide) · impreciso (precisão pior que 150 m) · sem_gps · fora.
// Sem dependência: serve ao app de campo (offline) e à mesa.
;(function (raiz) {
  const KY = 110574
  const kx = lat => Math.cos(lat * Math.PI / 180) * 111320

  function poligonos(geo) {
    if (!geo) return []
    if (geo.type === 'Polygon') return [geo.coordinates]
    if (geo.type === 'MultiPolygon') return geo.coordinates
    return []
  }

  function dentro(geo, lat, lon) {
    if (lat == null || lon == null) return false
    for (const poli of poligonos(geo)) {
      let d = false
      for (const anel of poli) {
        const n = anel.length
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1]
          if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) d = !d
        }
      }
      if (d) return true
    }
    return false
  }

  function distBorda(geo, lat, lon) {
    if (lat == null || lon == null) return null
    const cx = kx(lat)
    let min = null
    for (const poli of poligonos(geo)) for (const anel of poli) {
      for (let i = 0; i < anel.length - 1; i++) {
        const ax = (anel[i][0] - lon) * cx, ay = (anel[i][1] - lat) * KY
        const bx = (anel[i + 1][0] - lon) * cx, by = (anel[i + 1][1] - lat) * KY
        const dx = bx - ax, dy = by - ay
        const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
        const d = Math.sqrt(Math.pow(ax + t * dx, 2) + Math.pow(ay + t * dy, 2))
        if (min === null || d < min) min = d
      }
    }
    return min
  }

  function classificar(geo, lat, lon, precisao, tolerancia) {
    if (lat == null || lon == null) return 'sem_gps'
    if (precisao != null && precisao > 150) return 'impreciso'
    const margem = (tolerancia == null ? 50 : tolerancia) + Math.min(precisao == null ? 0 : precisao, 100)
    const d = distBorda(geo, lat, lon)
    if (dentro(geo, lat, lon)) return d < margem ? 'borda' : 'dentro'
    return d <= margem ? 'borda' : 'fora'
  }

  const ORDEM = ['dentro', 'borda', 'impreciso', 'fora']
  function pior(a, b) {
    if (!a || a === 'sem_gps') return b || 'sem_gps'
    if (!b || b === 'sem_gps') return a
    return ORDEM[Math.max(ORDEM.indexOf(a), ORDEM.indexOf(b))]
  }

  // quadrícula de dispersão: lado celula_m, origem no canto sudoeste do setor
  function celula(bbox, celulaM, lat, lon) {
    if (lat == null || lon == null || !bbox || !(celulaM > 0)) return null
    const latMid = (Number(bbox[1]) + Number(bbox[3])) / 2
    return Math.floor((lon - bbox[0]) * kx(latMid) / celulaM) + ':' + Math.floor((lat - bbox[1]) * KY / celulaM)
  }

  // anel (lon, lat) do quadrado de uma quadrícula — para desenhar, nunca a casa
  function celulaAnel(bbox, celulaM, id) {
    const [cx, cy] = String(id).split(':').map(Number)
    const latMid = (Number(bbox[1]) + Number(bbox[3])) / 2
    const dLon = celulaM / kx(latMid), dLat = celulaM / KY
    const x0 = Number(bbox[0]) + cx * dLon, y0 = Number(bbox[1]) + cy * dLat
    return [[x0, y0], [x0 + dLon, y0], [x0 + dLon, y0 + dLat], [x0, y0 + dLat], [x0, y0]]
  }

  // setor em que o ponto cai (dentro), entre os informados
  function setorDoPonto(setores, lat, lon) {
    return (setores || []).find(s => dentro(s.geojson, lat, lon)) || null
  }

  const ROTULO = {
    dentro: 'Dentro da área', borda: 'Na divisa da área', impreciso: 'Sinal de GPS fraco',
    sem_gps: 'Sem GPS', fora: 'Fora da área', sem_designacao: 'Sem área designada',
  }

  const api = { dentro, distBorda, classificar, pior, celula, celulaAnel, setorDoPonto, ROTULO }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else raiz.DiagArea = api
})(typeof window !== 'undefined' ? window : globalThis)
