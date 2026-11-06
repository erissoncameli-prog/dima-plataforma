// publico-capa — capa (miniatura da 1ª página) de um produto da Galeria do site público.
//
// GET /functions/v1/publico-capa?m=<midia_id>  →  image/jpeg
//
// O bucket acervo-capas é privado (a 1ª página de produto de consultor PF pode
// trazer nome e CPF): esta função não copia nada para bucket público. Só entrega
// a capa de arquivo marcado como público no Acervo e ainda válido — quem decide é
// fn_publico_capa_caminho (migração 20261106_publico_galeria_produtos), que monta
// o caminho a partir do midia_id. Qualquer outro pedido recebe 404, sem dizer por quê.
// O site chama com a chave pública (anon) no cabeçalho, como as fn_publico_*.
import { createClient } from 'npm:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Max-Age': '600',
}

function naoEncontrado() {
  return new Response('not found', { status: 404, headers: { ...CORS, 'Cache-Control': 'no-store' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405, headers: CORS })

  const midia = new URL(req.url).searchParams.get('m') ?? ''
  if (!/^[a-z_]+:[0-9a-f-]{36}(:\d+)?$/i.test(midia)) return naoEncontrado()

  const { data: caminho, error } = await admin.rpc('fn_publico_capa_caminho', { p_midia_id: midia })
  if (error || !caminho) return naoEncontrado()

  const { data: arquivo, error: erroArq } = await admin.storage.from('acervo-capas').download(caminho)
  if (erroArq || !arquivo) return naoEncontrado()

  return new Response(arquivo, {
    headers: {
      ...CORS,
      'Content-Type': 'image/jpeg',
      // Curto: desmarcar o produto no Acervo tira a capa do ar em até 10 min
      'Cache-Control': 'public, max-age=600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
