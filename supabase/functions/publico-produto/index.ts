// publico-produto — documento (PDF) de um produto da Galeria do site público.
//
// GET /functions/v1/publico-produto?m=<midia_id>  →  application/pdf
//
// Pedido da homologação do Produto 3 (09/11/2026): o visitante pode ler o produto
// na própria página (visualizador do site, pdf.js). O arquivo fica no bucket
// privado de entregas: esta função não copia nada para bucket público e o site
// nunca recebe a URL nem o nome do arquivo. Só entrega PDF marcado como público
// no Acervo e ainda válido — quem decide é fn_publico_arquivo_caminho (migração
// 20261109_publico_galeria_visualizar). Qualquer outro pedido recebe 404, sem dizer
// por quê. O site chama com a chave pública (anon) no cabeçalho, como a publico-capa.
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

  const { data: loc, error } = await admin.rpc('fn_publico_arquivo_caminho', { p_midia_id: midia })
  if (error || !loc?.bucket || !loc?.caminho) return naoEncontrado()

  // O caminho vem da URL gravada; arquivo com espaço/acento pode estar codificado nela
  let r = await admin.storage.from(loc.bucket).download(loc.caminho)
  if (r.error) {
    let decodificado = loc.caminho
    try { decodificado = decodeURIComponent(loc.caminho) } catch { /* fica o original */ }
    if (decodificado !== loc.caminho) r = await admin.storage.from(loc.bucket).download(decodificado)
  }
  if (r.error || !r.data) return naoEncontrado()

  return new Response(r.data, {
    headers: {
      ...CORS,
      'Content-Type': 'application/pdf',
      // Nome genérico: o nome real do arquivo não sai (pode trazer nome de pessoa)
      'Content-Disposition': 'inline; filename="produto.pdf"',
      // Curto: desmarcar o produto no Acervo tira o documento do ar em até 10 min
      'Cache-Control': 'public, max-age=600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
