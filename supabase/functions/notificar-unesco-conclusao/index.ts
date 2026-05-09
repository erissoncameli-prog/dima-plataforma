import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const UNESCO_EMAIL = 'projetounesco.acre@gmail.com'

function fmtData(s: string | null): string {
  if (!s) return '—'
  const parts = s.split('T')[0].split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

async function downloadBuffer(url: string): Promise<Uint8Array | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const ab = await resp.arrayBuffer()
    return new Uint8Array(ab)
  } catch {
    return null
  }
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { protocolo_id, enviado_por } = await req.json()
    if (!protocolo_id) throw new Error('protocolo_id é obrigatório')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: proto, error } = await supabase
      .from('viagem_protocolos')
      .select('*, viajantes:viagem_viajantes(id, nome, funcao, relatorio_url, cartoes_embarque_urls)')
      .eq('id', protocolo_id)
      .single()

    if (error || !proto) throw new Error('Protocolo não encontrado')

    const num   = proto.numero || '—'
    const dest  = proto.destino_principal || '—'
    const saida = fmtData(proto.dt_saida)
    const ret   = fmtData(proto.dt_retorno)
    const obj   = proto.objetivo || '—'

    const attachments: { filename: string; content: Uint8Array }[] = []
    let benefLines = ''

    for (const v of (proto.viajantes || [])) {
      const slug = slugNome(v.nome)
      benefLines += `  • ${v.nome || '—'} (${v.funcao || '—'})\n`

      if (v.relatorio_url) {
        const buf = await downloadBuffer(v.relatorio_url)
        if (buf) attachments.push({ filename: `relatorio_${slug}.pdf`, content: buf })
      }

      for (let i = 0; i < (v.cartoes_embarque_urls || []).length; i++) {
        const url = v.cartoes_embarque_urls[i]
        const buf = await downloadBuffer(url)
        if (buf) {
          const ext = extFromUrl(url)
          attachments.push({ filename: `embarque_${slug}_${i + 1}.${ext}`, content: buf })
        }
      }
    }

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
    : '. Nenhum documento de prestação foi localizado no sistema'
}.

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
      JSON.stringify({ ok: true, anexos: attachments.length }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
