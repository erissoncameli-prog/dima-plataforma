// prodes-proxy — consulta o desmatamento PRODES (TerraBrasilis/INPE) num retângulo.
// Auditoria de segurança 13/11/2026: exige usuário logado (o Mapa Interativo é da
// plataforma) e valida o bbox como 4 números dentro do Brasil, com área máxima —
// antes o valor ia cru para a URL do WFS (dava para acrescentar parâmetros) e
// qualquer pessoa usava a função como repasse para o servidor do INPE.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { usuarioLogado, statusDoErro } from '../_shared/autorizacao.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PRODES_WFS  = 'https://terrabrasilis.dpi.inpe.br/geoserver/prodes-amazonia-nb/wfs'
const PRODES_TYPE = 'prodes-amazonia-nb:yearly_deforestation_biome'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await usuarioLogado(req, admin)

    const { bbox } = await req.json().catch(() => ({}))
    // bbox: [minLon, minLat, maxLon, maxLat] — números finitos, dentro do Brasil, até ~4° x 4°
    const ok = Array.isArray(bbox) && bbox.length === 4 && bbox.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
      && bbox[0] < bbox[2] && bbox[1] < bbox[3]
      && bbox[0] >= -75 && bbox[2] <= -28 && bbox[1] >= -35 && bbox[3] <= 6
      && (bbox[2] - bbox[0]) <= 4 && (bbox[3] - bbox[1]) <= 4
    if (!ok) {
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
      status: statusDoErro(e, 500), headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
