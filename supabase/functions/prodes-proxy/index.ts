const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PRODES_WFS  = 'https://terrabrasilis.dpi.inpe.br/geoserver/prodes-amazonia-nb/wfs'
const PRODES_TYPE = 'prodes-amazonia-nb:yearly_deforestation_biome'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { bbox } = await req.json()
    // bbox: [minLon, minLat, maxLon, maxLat]
    if (!bbox || bbox.length !== 4) {
      return new Response(JSON.stringify({ error: 'bbox inválido' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const [minLon, minLat, maxLon, maxLat] = bbox
    const bboxStr = `${minLon},${minLat},${maxLon},${maxLat},urn:ogc:def:crs:OGC:1.3:CRS84`

    const url = `${PRODES_WFS}?service=WFS&version=2.0.0&request=GetFeature`
      + `&typeNames=${PRODES_TYPE}&outputFormat=application/json`
      + `&BBOX=${bboxStr}&count=2000`

    const upstream = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(25000),
    })

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `TerraBrasilis retornou HTTP ${upstream.status}` }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const data = await upstream.json()

    return new Response(JSON.stringify(data), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
