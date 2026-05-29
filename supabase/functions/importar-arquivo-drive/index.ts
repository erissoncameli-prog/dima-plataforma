// ── DIMA UNESCO · Importar Arquivo do Google Drive ───────────────────────────
// Baixa um arquivo do Google Drive no servidor e salva no Supabase Storage.
// Evita CORS e a necessidade de download manual pelo usuário.

import { createClient } from 'npm:@supabase/supabase-js'

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowed = [
    'https://fundobrasilonu-plataforma.vercel.app',
  ]
  const allowedOrigin = allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function extrairIdDrive(url: string): { id: string; tipo: 'docs' | 'drive' } | null {
  // Google Docs: docs.google.com/document/d/{id}/...
  const docsMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (docsMatch) return { id: docsMatch[1], tipo: 'docs' }

  // Google Drive file: drive.google.com/file/d/{id}/...
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (driveFileMatch) return { id: driveFileMatch[1], tipo: 'drive' }

  // Google Drive open: drive.google.com/open?id={id}
  const driveOpenMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/)
  if (driveOpenMatch) return { id: driveOpenMatch[1], tipo: 'drive' }

  return null
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { tdr_id, drive_url } = await req.json()
    if (!tdr_id || !drive_url) {
      return new Response(JSON.stringify({ error: 'tdr_id e drive_url são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const parsed = extrairIdDrive(drive_url)
    if (!parsed) {
      return new Response(JSON.stringify({ error: 'URL do Google Drive não reconhecida. Verifique se o link é de um documento ou arquivo do Drive.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Construir URL de download conforme o tipo
    let downloadUrl: string
    let nomeArquivo: string
    let contentType: string

    if (parsed.tipo === 'docs') {
      // Google Docs → exportar como PDF
      downloadUrl = `https://docs.google.com/document/d/${parsed.id}/export?format=pdf`
      nomeArquivo = `tdr-${tdr_id}.pdf`
      contentType = 'application/pdf'
    } else {
      // Google Drive → download direto (confirm=t ignora aviso de vírus em arquivos grandes)
      downloadUrl = `https://drive.google.com/uc?export=download&id=${parsed.id}&confirm=t`
      nomeArquivo = `tdr-${tdr_id}.pdf`
      contentType = 'application/pdf'
    }

    // Fazer o download no servidor (sem restrição de CORS)
    const resp = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DIMA-UNESCO/1.0)' },
      redirect: 'follow',
    })

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Google Drive retornou erro ${resp.status}. Verifique se o arquivo está compartilhado publicamente.` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Se o Drive retornou HTML, o arquivo é privado ou gerou aviso de vírus
    const respType = resp.headers.get('content-type') || ''
    if (respType.includes('text/html')) {
      return new Response(JSON.stringify({ error: 'Arquivo não acessível. Certifique-se que o link do Google Drive está como "Qualquer pessoa com o link pode visualizar".' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Tentar extrair nome real do arquivo pelo header Content-Disposition
    const disposition = resp.headers.get('content-disposition') || ''
    const nameMatch = disposition.match(/filename\*?=(?:UTF-8'')?([^;\n"]+)/i)
    if (nameMatch) {
      const nome = decodeURIComponent(nameMatch[1].replace(/["']/g, '').trim())
      if (nome) nomeArquivo = nome
    }

    const fileBuffer = await resp.arrayBuffer()
    if (fileBuffer.byteLength === 0) {
      return new Response(JSON.stringify({ error: 'O arquivo baixado está vazio. Verifique as permissões do Google Drive.' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ext = nomeArquivo.split('.').pop()?.toLowerCase() || 'pdf'
    const storagePath = `tdr-${tdr_id}/drive-import-${Date.now()}.${ext}`
    const finalContentType = respType.split(';')[0] || contentType

    const { error: upError } = await supabase.storage
      .from('tdrs-arquivos')
      .upload(storagePath, new Uint8Array(fileBuffer), { upsert: true, contentType: finalContentType })

    if (upError) throw upError

    const { data: urlData } = supabase.storage.from('tdrs-arquivos').getPublicUrl(storagePath)

    await supabase.from('tdrs').update({
      arquivo_url: urlData.publicUrl,
      arquivo_nome: nomeArquivo,
    }).eq('id', tdr_id)

    return new Response(JSON.stringify({
      ok: true,
      arquivo_url: urlData.publicUrl,
      arquivo_nome: nomeArquivo,
      tamanho_bytes: fileBuffer.byteLength,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[importar-arquivo-drive]', err)
    return new Response(JSON.stringify({ error: (err as Error).message ?? 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
