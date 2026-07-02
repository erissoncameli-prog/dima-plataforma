import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'
import { Buffer } from 'node:buffer'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function corsHeaders(_req: Request): Record<string, string> {
  return CORS
}

const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const UNESCO_EMAIL = 'm.lang@unesco.org'
const SITE_URL = 'https://fundobrasilonu-plataforma.vercel.app'
const ASSETS   = `${SITE_URL}/assets`

// Limite de tamanho total de anexos (20 MB, abaixo do limite de 25 MB do Gmail)
const MAX_TOTAL_BYTES = 20 * 1024 * 1024
// Timeout por arquivo: 20 segundos
const FILE_TIMEOUT_MS = 20_000

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

function fmtData(s: string | null): string {
  if (!s) return '—'
  const parts = s.split('T')[0].split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function slugNome(nome: string): string {
  return (nome || 'beneficiario')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
    .substring(0, 30)
}

function extFromUrl(url: string): string {
  const clean = url.split('?')[0]
  const ext = clean.split('.').pop()?.toLowerCase() || ''
  return ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
}

// Baixa um arquivo com timeout. Retorna null se falhar ou exceder o tempo.
async function downloadWithTimeout(url: string): Promise<Uint8Array | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FILE_TIMEOUT_MS)
    const resp = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!resp.ok) return null
    const ab = await resp.arrayBuffer()
    return new Uint8Array(ab)
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { protocolo_id, enviado_por } = await req.json()
    if (!protocolo_id) throw new Error('protocolo_id é obrigatório')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: proto, error } = await supabase
      .from('viagem_protocolos')
      .select('*, viajantes:viagem_viajantes(id, nome, funcao, relatorio_url, relatorio_nome, cartoes_embarque_urls)')
      .eq('id', protocolo_id)
      .single()

    if (error || !proto) throw new Error('Protocolo não encontrado')

    const num   = proto.numero || '—'
    const dest  = proto.destino_principal || '—'
    const saida = fmtData(proto.dt_saida)
    const ret   = fmtData(proto.dt_retorno)
    const obj   = proto.objetivo || '—'

    // Montar lista de todos os arquivos a baixar em paralelo
    type FileJob = {
      url: string
      filename: string
    }
    const jobs: FileJob[] = []
    let benefLines = ''
    const linksPorViajante: string[] = []

    for (const v of (proto.viajantes || [])) {
      const slug = slugNome(v.nome)
      benefLines += `  • ${v.nome || '—'} (${v.funcao || '—'})\n`

      const linksV: string[] = []

      if (v.relatorio_url) {
        jobs.push({ url: v.relatorio_url, filename: `relatorio_${slug}.pdf` })
        linksV.push(`    Relatório: ${v.relatorio_url}`)
      }

      for (let i = 0; i < (v.cartoes_embarque_urls || []).length; i++) {
        const url = v.cartoes_embarque_urls[i]
        const ext = extFromUrl(url)
        jobs.push({ url, filename: `embarque_${slug}_${i + 1}.${ext}` })
        linksV.push(`    Cartão ${i + 1}: ${url}`)
      }

      if (linksV.length) {
        linksPorViajante.push(`  ${v.nome || '—'}:\n${linksV.join('\n')}`)
      }
    }

    // Baixar todos os arquivos em paralelo
    const buffers = await Promise.all(jobs.map(j => downloadWithTimeout(j.url)))

    // Montar anexos respeitando o limite de tamanho total
    const attachments: { filename: string; content: Buffer }[] = []
    const skipped: string[] = []
    let totalBytes = 0

    for (let i = 0; i < jobs.length; i++) {
      const buf = buffers[i]
      if (!buf) {
        skipped.push(jobs[i].filename)
        continue
      }
      if (totalBytes + buf.byteLength > MAX_TOTAL_BYTES) {
        skipped.push(jobs[i].filename)
        continue
      }
      attachments.push({ filename: jobs[i].filename, content: Buffer.from(buf) })
      totalBytes += buf.byteLength
    }

    const linksSection = linksPorViajante.length
      ? `\nLINKS DIRETOS DOS DOCUMENTOS (caso os anexos não abram):\n${linksPorViajante.join('\n\n')}`
      : ''

    const skipNote = skipped.length
      ? `\n\nObservação: ${skipped.length} arquivo(s) não puderam ser anexados por excederem o limite de tamanho ou por falha no download. Os links acima permitem acesso direto aos originais.`
      : ''

    const corpo = `Prezados,

Informamos que o Protocolo de Viagem ${num} foi concluído e encerrado com sucesso na Plataforma FundoBrasilONU.

PROTOCOLO : ${num}
DESTINO   : ${dest}
PERÍODO   : ${saida} a ${ret}
OBJETIVO  : ${obj}

BENEFICIÁRIOS:
${benefLines || '  —\n'}
Seguem em anexo os documentos de prestação de contas de todos os beneficiários${
  attachments.length > 0
    ? ` (${attachments.length} arquivo(s) — relatórios de viagem e/ou cartões de embarque)`
    : '. Os links abaixo permitem acesso direto aos documentos no sistema'
}.
${linksSection}${skipNote}

Atenciosamente,
Equipe de Gestão – Projeto DIMA
UNESCO / SEMA-AC
fundobrasilonuacre@gmail.com`

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'fundobrasilonuacre@gmail.com',
        pass: Deno.env.get('GMAIL_APP_PASSWORD')!,
      },
    })

    await transporter.sendMail({
      from: REMETENTE,
      to: UNESCO_EMAIL,
      subject: `[DIMA] Protocolo ${num} — Conclusão e Prestação de Contas`,
      text: corpo,
      html: wrapHtml(corpo, { url: `${SITE_URL}/pages/viagens.html`, label: '🔗 Ver na Plataforma' }),
      attachments,
    })

    // Registrar data de envio no protocolo
    await supabase
      .from('viagem_protocolos')
      .update({ notificado_unesco_conclusao_em: new Date().toISOString() })
      .eq('id', protocolo_id)

    // Log para aparecer na timeline
    const logInsert: Record<string, unknown> = {
      protocolo_id,
      evento: 'conclusao_unesco',
      total_enviados: 1,
    }
    if (enviado_por) logInsert.enviado_por = enviado_por
    await supabase.from('viagem_notif_log').insert(logInsert)

    return new Response(
      JSON.stringify({ ok: true, anexos: attachments.length, ignorados: skipped.length }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
