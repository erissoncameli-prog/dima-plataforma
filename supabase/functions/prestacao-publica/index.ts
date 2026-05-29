import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL  = 'https://fundobrasilonu-plataforma.vercel.app'
const ASSETS    = `${SITE_URL}/assets`

function emailPrestacaoAdmin(proto: any, viajante: any): string {
  const num  = proto?.numero || '—'
  const dest = proto?.destino_principal || '—'
  const nome = viajante?.nome || '—'
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' })

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <tr><td style="background:#1B4332;border-radius:8px 8px 0 0;padding:18px 24px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle">
        <img src="${ASSETS}/logo-resiliencia.png" alt="Projeto DIMA" height="52" style="display:block;border:0">
      </td>
      <td style="vertical-align:middle;text-align:right">
        <span style="color:#D1FAE5;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Plataforma de Gestão</span><br>
        <span style="color:#fff;font-size:15px;font-weight:700">Projeto DIMA</span><br>
        <span style="color:#A7F3D0;font-size:11px">UNESCO / SEMA-AC</span>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="background:#fff;padding:28px 24px 20px">
    <p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#1B4332">📋 Prestação de contas enviada — aguarda validação</p>
    <p style="margin:4px 0;font-size:13px;color:#1F2937">O viajante abaixo enviou os documentos de prestação de contas pelo link de e-mail e a submissão aguarda sua validação na plataforma.</p>
    <table style="width:100%;border-collapse:collapse;margin:18px 0">
      <tr>
        <td style="padding:5px 10px 5px 0;font-size:12px;font-weight:700;color:#6B7280;white-space:nowrap;width:110px">VIAJANTE</td>
        <td style="padding:5px 0;font-size:13px;color:#111827">${nome}</td>
      </tr>
      <tr>
        <td style="padding:5px 10px 5px 0;font-size:12px;font-weight:700;color:#6B7280;white-space:nowrap">PROTOCOLO</td>
        <td style="padding:5px 0;font-size:13px;color:#111827">${num}</td>
      </tr>
      <tr>
        <td style="padding:5px 10px 5px 0;font-size:12px;font-weight:700;color:#6B7280;white-space:nowrap">DESTINO</td>
        <td style="padding:5px 0;font-size:13px;color:#111827">${dest}</td>
      </tr>
      <tr>
        <td style="padding:5px 10px 5px 0;font-size:12px;font-weight:700;color:#6B7280;white-space:nowrap">ENVIADO EM</td>
        <td style="padding:5px 0;font-size:13px;color:#111827">${agora} (horário de Brasília)</td>
      </tr>
    </table>
    <div style="margin:24px 0 8px;text-align:center">
      <a href="${SITE_URL}/pages/viagens.html" style="display:inline-block;background:#166534;color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">
        ✅ Validar Prestação de Contas
      </a>
    </div>
  </td></tr>

  <tr><td style="background:#F9FAFB;border-top:1px solid #E5E7EB;border-radius:0 0 8px 8px;padding:14px 24px;text-align:center">
    <p style="margin:0;font-size:11px;color:#6B7280">
      Equipe de Gestão – <strong>Projeto DIMA</strong> · UNESCO / SEMA-AC<br>
      <a href="mailto:fundobrasilonuacre@gmail.com" style="color:#059669;text-decoration:none">fundobrasilonuacre@gmail.com</a>
      &nbsp;·&nbsp;
      <a href="${SITE_URL}" style="color:#059669;text-decoration:none">Acessar Plataforma</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
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

    // Buscar dados do viajante para o e-mail
    const { data: viajante } = await supabase
      .from('viagem_viajantes')
      .select('nome')
      .eq('id', tk.viajante_id)
      .single()

    if (admins?.length) {
      // Notificação interna (sino da plataforma)
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

      // E-mail para cada super_admin
      try {
        const adminEmails: string[] = []
        for (const a of admins) {
          const { data: usr } = await supabase.auth.admin.getUserById(a.id)
          const email = usr?.user?.email
          if (email) adminEmails.push(email)
        }

        if (adminEmails.length) {
          const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
              user: 'fundobrasilonuacre@gmail.com',
              pass: Deno.env.get('GMAIL_APP_PASSWORD')!,
            },
          })

          const htmlEmail = emailPrestacaoAdmin(proto, viajante)
          const assunto   = `[DIMA] 📋 Prestação de contas aguarda validação — Protocolo ${proto?.numero || ''}`

          await Promise.allSettled(
            adminEmails.map(to =>
              transporter.sendMail({
                from: REMETENTE,
                to,
                subject: assunto,
                html: htmlEmail,
              })
            )
          )
        }
      } catch (_) { /* e-mail não crítico — notificação interna já foi inserida */ }
    }

    // Expirar token imediatamente após envio bem-sucedido
    const agora = new Date().toISOString()
    await supabase
      .from('prestacao_tokens')
      .update({ usado_em: agora, expires_at: agora })
      .eq('token', token)

    return json({ ok: true })
  }

  // ── POST ?action=expirar ─────────────────────────────────────
  // Chamado pelo sistema (viagens.html) após envio via interface
  if (req.method === 'POST' && action === 'expirar') {
    const body = await req.json().catch(() => null)
    if (!body) return erro('Corpo da requisição inválido')

    const { viajante_ids } = body
    if (!Array.isArray(viajante_ids) || !viajante_ids.length) return erro('viajante_ids é obrigatório')

    const agora = new Date().toISOString()
    await supabase
      .from('prestacao_tokens')
      .update({ usado_em: agora, expires_at: agora })
      .in('viajante_id', viajante_ids)
      .gt('expires_at', agora)

    return json({ ok: true })
  }

  return erro('Ação inválida', 404)
})
