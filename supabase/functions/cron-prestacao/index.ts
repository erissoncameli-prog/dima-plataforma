import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL = 'https://fundobrasilonu-plataforma.vercel.app'
const ASSETS   = `${SITE_URL}/assets`

// ── Wrapper HTML com barra de logos (mesmo padrão dos demais e-mails do sistema) ──
function wrapHtml(corpo: string, linkBtn?: { url: string; label: string }): string {
  const linhas = corpo.split('\n')
  let html = ''
  let emBloco = false

  for (const linha of linhas) {
    const isItem = /^[A-ZÇÁÉÍÓÚÃÕ\s]{3,15}\s*:/.test(linha)

    if (isItem) {
      if (!emBloco) { html += '<table style="width:100%;border-collapse:collapse;margin:12px 0">'; emBloco = true }
      const sep   = linha.indexOf(':')
      const chave = linha.slice(0, sep).trim()
      const valor = linha.slice(sep + 1).trim()
      html += `<tr>
        <td style="padding:4px 10px 4px 0;font-size:12px;font-weight:700;color:#6B7280;white-space:nowrap;vertical-align:top;width:110px">${chave}</td>
        <td style="padding:4px 0;font-size:13px;color:#111827;vertical-align:top">${valor || '—'}</td>
      </tr>`
    } else {
      if (emBloco) { html += '</table>'; emBloco = false }
      if (linha.trim() === '') {
        html += '<br>'
      } else {
        html += `<p style="margin:4px 0;font-size:13px;color:#1F2937;line-height:1.6">${linha}</p>`
      }
    }
  }
  if (emBloco) html += '</table>'

  if (linkBtn) {
    html += `
      <div style="margin:24px 0 8px;text-align:center">
        <a href="${linkBtn.url}" style="display:inline-block;background:#166534;color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:.02em">${linkBtn.label}</a>
      </div>`
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- Cabeçalho verde -->
  <tr><td style="background:#1B4332;border-radius:8px 8px 0 0;padding:18px 24px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:middle">
          <img src="${ASSETS}/logo-resiliencia.png" alt="Projeto DIMA" height="52" style="display:block;border:0">
        </td>
        <td style="vertical-align:middle;text-align:right">
          <span style="color:#D1FAE5;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Plataforma de Gestão</span><br>
          <span style="color:#ffffff;font-size:15px;font-weight:700">Projeto DIMA</span><br>
          <span style="color:#A7F3D0;font-size:11px">UNESCO / SEMA-AC</span>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Barra de logos parceiros -->
  <tr><td style="background:#ffffff;padding:12px 24px;border-bottom:1px solid #E5E7EB">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:0 6px"><img src="${ASSETS}/1695134345-1-horizontal-verde-solo.png"          alt="SEMA/AC"             height="32" style="display:block;border:0"></td>
        <td align="center" style="padding:0 6px"><img src="${ASSETS}/UNESCO_logo_hor_blue_transparent.png.png"        alt="UNESCO"              height="28" style="display:block;border:0"></td>
        <td align="center" style="padding:0 6px"><img src="${ASSETS}/UNCT_Logo_RGB_Brazil_Portuguese_horiz_color.png" alt="ONU Brasil"          height="28" style="display:block;border:0"></td>
        <td align="center" style="padding:0 6px"><img src="${ASSETS}/logo-fundo-brasil-onu.png"                       alt="Fundo Brasil-ONU"   height="32" style="display:block;border:0"></td>
        <td align="center" style="padding:0 6px"><img src="${ASSETS}/logo-consorcio-amazonia.png"                     alt="Consórcio Amazônia" height="36" style="display:block;border:0"></td>
      </tr>
    </table>
  </td></tr>

  <!-- Corpo -->
  <tr><td style="background:#ffffff;padding:28px 24px 20px">
    ${html}
  </td></tr>

  <!-- Rodapé -->
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

async function gerarTokenPrestacao(supabase: any, viajante_id: string, protocolo_id: string): Promise<string> {
  const { data: existing } = await supabase
    .from('prestacao_tokens')
    .select('token')
    .eq('viajante_id', viajante_id)
    .gt('expires_at', new Date().toISOString())
    .order('criado_em', { ascending: false })
    .limit(1)
    .single()

  if (existing?.token) return existing.token

  const token = crypto.randomUUID()
  const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('prestacao_tokens').insert({ token, viajante_id, protocolo_id, expires_at })
  return token
}

function fmtData(s: string | null): string {
  if (!s) return '—'
  const parts = s.split('T')[0].split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function diasEntre(dtRetorno: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const retorno = new Date(dtRetorno)
  retorno.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - retorno.getTime()) / (1000 * 60 * 60 * 24))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Buscar viajantes com prestação pendente
    const { data: todos, error } = await supabase
      .from('viagem_viajantes')
      .select(`
        id, nome, email, relatorio_url, alerta_prestacao_em, bloqueio_prestacao_em,
        protocolo:viagem_protocolos(id, numero, dt_retorno, situacao)
      `)
      .is('relatorio_url', null)
      .not('email', 'is', null)

    if (error) throw error

    // Filtrar apenas protocolos em fase de prestação ou realizados
    const viajantes = (todos || []).filter((v: any) =>
      ['em_prestacao', 'realizado'].includes(v.protocolo?.situacao) &&
      !!v.protocolo?.dt_retorno
    )

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'fundobrasilonuacre@gmail.com',
        pass: Deno.env.get('GMAIL_APP_PASSWORD')!,
      },
    })

    let alertas = 0, bloqueios = 0

    for (const v of viajantes) {
      const proto = v.protocolo as any
      const dias = diasEntre(proto.dt_retorno)
      const dtLimite = new Date(proto.dt_retorno)
      dtLimite.setDate(dtLimite.getDate() + 30)
      const dtLimiteFmt = fmtData(dtLimite.toISOString())

      // Alerta: atingiu 30 dias e ainda não alertado
      if (dias >= 30 && !v.alerta_prestacao_em) {
        let linkAlerta = ''
        try {
          const tk = await gerarTokenPrestacao(supabase, v.id, proto.id)
          linkAlerta = `${SITE_URL}/pages/prestacao-publica.html?token=${tk}`
        } catch (_) { /* não crítico */ }

        try {
          const corpoAlerta = `Prezado(a) ${v.nome || 'beneficiário(a)'},

O prazo de 30 dias para submissão da prestação de contas do Protocolo ${proto.numero} venceu em ${dtLimiteFmt}.

Você ainda não enviou:
  • Relatório de Viagem (PDF assinado)
  • Cartões de Embarque (ida e volta)

⚠ ATENÇÃO: Caso não regularize sua situação em breve, você ficará IMPEDIDO(A) de participar de novas viagens pelo Projeto DIMA.

${linkAlerta
  ? 'Envie os documentos agora, sem precisar de login, usando o botão abaixo. Ou acesse: Sistema DIMA → Viagens → Protocolo ' + proto.numero + ' → "Prestação de contas".'
  : `Para regularizar, acesse: Sistema DIMA → Viagens → Protocolo ${proto.numero} → "Prestação de contas".`
}

Atenciosamente,
Equipe de Gestão – Projeto DIMA
UNESCO / SEMA-AC
fundobrasilonuacre@gmail.com`
          await transporter.sendMail({
            from: REMETENTE,
            to: v.email,
            subject: `[DIMA] ⚠ Prazo vencido — Prestação de contas obrigatória — ${proto.numero}`,
            text: corpoAlerta,
            html: wrapHtml(corpoAlerta, linkAlerta ? { url: linkAlerta, label: '📤 Enviar Documentos Agora' } : undefined),
          })
          alertas++
        } catch (_) { /* segue para o próximo */ }

        await supabase
          .from('viagem_viajantes')
          .update({ alerta_prestacao_em: new Date().toISOString() })
          .eq('id', v.id)
      }

      // Bloqueio: passou de 30 dias e ainda não bloqueado formalmente
      if (dias > 30 && !v.bloqueio_prestacao_em) {
        let linkBloqueio = ''
        try {
          const tk = await gerarTokenPrestacao(supabase, v.id, proto.id)
          linkBloqueio = `${SITE_URL}/pages/prestacao-publica.html?token=${tk}`
        } catch (_) { /* não crítico */ }

        try {
          const corpoBloqueio = `Prezado(a) ${v.nome || 'beneficiário(a)'},

Informamos que você está BLOQUEADO(A) de participar de novas viagens pelo Projeto DIMA.

MOTIVO: Não foram submetidos os documentos de prestação de contas do Protocolo ${proto.numero} (data de retorno: ${fmtData(proto.dt_retorno)}), ultrapassando o prazo de 30 dias estabelecido.

Para regularizar e remover o bloqueio:
${linkBloqueio
  ? 'Envie os documentos agora, sem precisar de login, usando o botão abaixo. O bloqueio será removido automaticamente após a submissão.'
  : `  1. Acesse o Sistema DIMA → Viagens → Protocolo ${proto.numero}\n  2. Clique em "Prestação de contas"\n  3. Envie o Relatório de Viagem (PDF assinado) e os Cartões de Embarque\n  4. O bloqueio será removido automaticamente após a submissão`
}

Atenciosamente,
Equipe de Gestão – Projeto DIMA
UNESCO / SEMA-AC
fundobrasilonuacre@gmail.com`
          await transporter.sendMail({
            from: REMETENTE,
            to: v.email,
            subject: `[DIMA] 🚫 Bloqueio ativado — Prestação de contas pendente — ${proto.numero}`,
            text: corpoBloqueio,
            html: wrapHtml(corpoBloqueio, linkBloqueio ? { url: linkBloqueio, label: '📤 Enviar Documentos Agora' } : undefined),
          })
          bloqueios++
        } catch (_) { /* segue para o próximo */ }

        await supabase
          .from('viagem_viajantes')
          .update({ bloqueio_prestacao_em: new Date().toISOString() })
          .eq('id', v.id)
      }
    }

    return new Response(
      JSON.stringify({ ok: true, verificados: viajantes.length, alertas, bloqueios }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
