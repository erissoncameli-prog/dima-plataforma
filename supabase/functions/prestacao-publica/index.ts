import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function erro(msg: string, status = 400) {
  return json({ ok: false, error: msg }, status)
}

async function validarToken(supabase: any, token: string) {
  const { data } = await supabase
    .from('prestacao_tokens')
    .select('viajante_id, protocolo_id')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single()
  return data as { viajante_id: string; protocolo_id: string } | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  const action = url.searchParams.get('action') || 'info'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ── GET ?action=info&token=xxx ───────────────────────────────
  // Retorna dados do viajante e protocolo para exibir na página pública
  if (req.method === 'GET' && action === 'info') {
    const token = url.searchParams.get('token')
    if (!token) return erro('Token ausente')

    const { data: tk } = await supabase
      .from('prestacao_tokens')
      .select(`
        viajante_id, protocolo_id, expires_at,
        viajante:viagem_viajantes(id, nome, tem_passagem, relatorio_url, relatorio_nome, cartoes_embarque_urls),
        protocolo:viagem_protocolos(numero, destino_principal, dt_saida, dt_retorno)
      `)
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!tk) return erro('Token inválido ou expirado', 404)

    return json({ ok: true, viajante: tk.viajante, protocolo: tk.protocolo })
  }

  // ── POST ?action=signed-url ──────────────────────────────────
  // Gera URL assinada para upload direto ao Supabase Storage (evita limite de body da Edge Function)
  if (req.method === 'POST' && action === 'signed-url') {
    const body = await req.json().catch(() => null)
    if (!body) return erro('Corpo da requisição inválido')

    const { token, tipo, ext, index = 0 } = body
    if (!token || !tipo || !ext) return erro('token, tipo e ext são obrigatórios')
    if (!['relatorio', 'embarque'].includes(tipo)) return erro('tipo deve ser relatorio ou embarque')

    const tk = await validarToken(supabase, token)
    if (!tk) return erro('Token inválido ou expirado', 404)

    const ts = Date.now()
    const path = tipo === 'relatorio'
      ? `viagens/${tk.protocolo_id}/viajante-${tk.viajante_id}/relatorio-${ts}.${ext}`
      : `viagens/${tk.protocolo_id}/viajante-${tk.viajante_id}/embarque-${ts}-${index}.${ext}`

    const { data: signed, error: errSign } = await supabase.storage
      .from('viagens-arquivos')
      .createSignedUploadUrl(path)

    if (errSign || !signed) return erro('Erro ao gerar URL: ' + (errSign?.message || 'desconhecido'))

    const { data: pub } = supabase.storage.from('viagens-arquivos').getPublicUrl(path)

    return json({ ok: true, signed_url: signed.signedUrl, path, public_url: pub.publicUrl })
  }

  // ── POST ?action=finalizar ───────────────────────────────────
  // Após uploads, registra URLs no banco e notifica admins
  if (req.method === 'POST' && action === 'finalizar') {
    const body = await req.json().catch(() => null)
    if (!body) return erro('Corpo da requisição inválido')

    const { token, relatorio_url, relatorio_nome, cartoes_urls } = body
    if (!token) return erro('token é obrigatório')
    if (!relatorio_url && !cartoes_urls?.length) return erro('Nenhum arquivo informado')

    const tk = await validarToken(supabase, token)
    if (!tk) return erro('Token inválido ou expirado', 404)

    // Buscar cartões já existentes para não sobrescrever
    const { data: vAtual } = await supabase
      .from('viagem_viajantes')
      .select('relatorio_url, relatorio_nome, cartoes_embarque_urls')
      .eq('id', tk.viajante_id)
      .single()

    const updates: Record<string, unknown> = { relatorio_data: new Date().toISOString() }
    if (relatorio_url) {
      updates.relatorio_url = relatorio_url
      updates.relatorio_nome = relatorio_nome || 'relatorio.pdf'
    }
    if (cartoes_urls?.length) {
      updates.cartoes_embarque_urls = [
        ...(vAtual?.cartoes_embarque_urls || []),
        ...cartoes_urls,
      ]
    }

    await supabase.from('viagem_viajantes').update(updates).eq('id', tk.viajante_id)

    // Notificar super_admins
    const { data: proto } = await supabase
      .from('viagem_protocolos')
      .select('numero, destino_principal')
      .eq('id', tk.protocolo_id)
      .single()

    const { data: admins } = await supabase
      .from('usuarios')
      .select('id')
      .eq('perfil', 'super_admin')
      .eq('ativo', true)

    if (admins?.length) {
      await supabase.from('notificacoes').insert(
        admins.map((a: any) => ({
          usuario_id: a.id,
          tipo: 'viagem_prestacao',
          titulo: `Prestação via e-mail — ${proto?.numero || ''}`,
          mensagem: `Documentos enviados pelo link de e-mail — Protocolo ${proto?.numero || ''} (${proto?.destino_principal || '—'}).`,
          lida: false,
          link: 'viagens.html',
          entidade_tipo: 'viagem_protocolos',
          entidade_id: tk.protocolo_id,
        }))
      )
    }

    // Marcar token como usado (não invalida — permite reenvio até expirar)
    await supabase
      .from('prestacao_tokens')
      .update({ usado_em: new Date().toISOString() })
      .eq('token', token)

    return json({ ok: true })
  }

  return erro('Ação inválida', 404)
})
