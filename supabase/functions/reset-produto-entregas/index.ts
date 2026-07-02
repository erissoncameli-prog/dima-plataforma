import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Extrai bucket + path a partir de uma URL pública do Storage
function parsePublicUrl(url: string): { bucket: string; path: string } | null {
  const m = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
  if (!m) return null
  return { bucket: m[1], path: decodeURIComponent(m[2]) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { produto_id } = await req.json()
    if (!produto_id) throw new Error('produto_id é obrigatório')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: produto, error: errProduto } = await supabase
      .from('contratos_produtos')
      .select('id, numero_produto')
      .eq('id', produto_id)
      .single()

    if (errProduto || !produto) throw new Error('Produto não encontrado')

    const { data: entregas, error: errEntregas } = await supabase
      .from('contratos_produtos_entregas')
      .select('id, nota_tecnica_url, documentos:entrega_documentos(arquivo_url)')
      .eq('produto_id', produto_id)

    if (errEntregas) throw errEntregas

    // Coletar todos os arquivos (relatórios + notas técnicas) agrupados por bucket
    const porBucket: Record<string, string[]> = {}
    for (const e of (entregas || [])) {
      const urls = [
        e.nota_tecnica_url,
        ...((e.documentos || []).map((d: any) => d.arquivo_url)),
      ].filter(Boolean) as string[]

      for (const url of urls) {
        const parsed = parsePublicUrl(url)
        if (!parsed) continue
        if (!porBucket[parsed.bucket]) porBucket[parsed.bucket] = []
        porBucket[parsed.bucket].push(parsed.path)
      }
    }

    let arquivosRemovidos = 0
    for (const [bucket, paths] of Object.entries(porBucket)) {
      const { data: removidos, error: errRemove } = await supabase.storage.from(bucket).remove(paths)
      if (errRemove) throw errRemove
      arquivosRemovidos += removidos?.length || 0
    }

    // Apaga as entregas (cascata remove entrega_documentos automaticamente)
    const { error: errDelEntregas } = await supabase
      .from('contratos_produtos_entregas')
      .delete()
      .eq('produto_id', produto_id)

    if (errDelEntregas) throw errDelEntregas

    // Reseta o produto para o estado pendente
    const { error: errUpdate } = await supabase
      .from('contratos_produtos')
      .update({
        situacao: 'pendente',
        pct_aprovado: 0,
        valor_aprovado: 0,
        dt_entrega: null,
        observacoes: null,
      })
      .eq('id', produto_id)

    if (errUpdate) throw errUpdate

    return new Response(
      JSON.stringify({
        ok: true,
        produto_numero: produto.numero_produto,
        entregas_removidas: (entregas || []).length,
        arquivos_removidos: arquivosRemovidos,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
