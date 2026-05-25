import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'
import { Buffer } from 'node:buffer'

const ALLOWED_ORIGINS = [
  'https://erissoncameli-prog.github.io',
  'https://fundobrasilonu-plataforma.vercel.app',
]

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const UNESCO_EMAIL = 'projetounesco.acre@gmail.com'

// Limite de tamanho total de anexos (20 MB, abaixo do limite de 25 MB do Gmail)
const MAX_TOTAL_BYTES = 20 * 1024 * 1024
// Timeout por arquivo: 20 segundos
const FILE_TIMEOUT_MS = 20_000

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
