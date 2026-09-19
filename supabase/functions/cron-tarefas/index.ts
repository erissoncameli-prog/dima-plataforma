// cron-tarefas — digest diário por responsável: tarefas atrasadas, de hoje e de
// amanhã (D-1). Um e-mail agregado por pessoa. Agendada via pg_cron (ver
// migração 20260919_cron_tarefas.sql). Não cria notificação no sino (essas são
// event-driven) para não repetir badge todo dia.
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL  = 'https://fundobrasilonu-plataforma.vercel.app'
const ASSETS    = `${SITE_URL}/assets`
const TZ        = 'America/Rio_Branco' // Acre, UTC-5

// data local (YYYY-MM-DD) no fuso do Acre
function hojeLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }) // en-CA => YYYY-MM-DD
}
function addDias(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const fmtBR = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function bloco(titulo: string, cor: string, itens: any[]): string {
  if (!itens.length) return ''
  const linhas = itens.map(t =>
    `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid #F0F0F0;font-size:12px;color:#9CA3AF;font-family:monospace;white-space:nowrap">${esc(t.codigo)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #F0F0F0;font-size:13px;color:#111827">${esc(t.titulo)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #F0F0F0;font-size:12px;color:#6B7280;white-space:nowrap">${fmtBR(t.dt_prazo)}</td>
    </tr>`).join('')
  return `<p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:${cor}">${titulo} (${itens.length})</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #F0F0F0;border-radius:6px">${linhas}</table>`
}

function wrapHtml(nome: string, corpoTabelas: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:#1B4332;border-radius:8px 8px 0 0;padding:18px 24px">
    <table width="100%"><tr>
      <td style="vertical-align:middle"><img src="${ASSETS}/logo-resiliencia.png" alt="Projeto DIMA" height="52" style="display:block;border:0"></td>
      <td style="vertical-align:middle;text-align:right">
        <span style="color:#D1FAE5;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Suas tarefas de hoje</span><br>
        <span style="color:#ffffff;font-size:15px;font-weight:700">Projeto DIMA</span><br>
        <span style="color:#A7F3D0;font-size:11px">UNESCO / SEMA-AC</span>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:24px">
    <p style="margin:0 0 4px;font-size:13px;color:#1F2937">Bom dia, ${esc(nome)}.</p>
    <p style="margin:0 0 8px;font-size:13px;color:#6B7280">Resumo das suas tarefas com prazo próximo:</p>
    ${corpoTabelas}
    <div style="margin:24px 0 4px;text-align:center">
      <a href="${SITE_URL}/pages/tarefas.html" style="display:inline-block;background:#166534;color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">Abrir minhas tarefas</a>
    </div>
  </td></tr>
  <tr><td style="background:#F9FAFB;border-top:1px solid #E5E7EB;border-radius:0 0 8px 8px;padding:14px 24px;text-align:center">
    <p style="margin:0;font-size:11px;color:#6B7280">Projeto DIMA · UNESCO / SEMA-AC · digest automático diário</p>
  </td></tr>
</table></td></tr></table></body></html>`
}

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const hoje = hojeLocal()
    const amanha = addDias(hoje, 1)

    // responsáveis de tarefas ativas com prazo até amanhã
    const { data: rows, error } = await supabase
      .from('tarefa_participantes')
      .select('usuario_id, usuario:usuarios(nome_completo,email,ativo), ' +
              'tarefa:tarefas!inner(codigo,titulo,dt_prazo,status,ativo)')
      .eq('papel', 'responsavel')
    if (error) throw error

    // agrupa por usuário
    const porUser: Record<string, { nome: string; email: string; atras: any[]; hoje: any[]; amanha: any[] }> = {}
    for (const r of rows || []) {
      const t: any = r.tarefa, u: any = r.usuario
      if (!t || !u || !u.email || u.ativo === false) continue
      if (!t.ativo || t.status === 'concluida' || t.status === 'cancelada') continue
      if (!t.dt_prazo || t.dt_prazo > amanha) continue
      const k = r.usuario_id as string
      porUser[k] ||= { nome: (u.nome_completo || '').split(' ')[0] || '', email: u.email, atras: [], hoje: [], amanha: [] }
      if (t.dt_prazo < hoje) porUser[k].atras.push(t)
      else if (t.dt_prazo === hoje) porUser[k].hoje.push(t)
      else porUser[k].amanha.push(t)
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: 'fundobrasilonuacre@gmail.com', pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
    })

    const alvos = Object.values(porUser)
    const results = await Promise.allSettled(alvos.map(u => {
      const corpo =
        bloco('⚠ Atrasadas', '#DC2626', u.atras) +
        bloco('📅 Para hoje', '#166534', u.hoje) +
        bloco('⏰ Para amanhã', '#D97706', u.amanha)
      return transporter.sendMail({
        from: REMETENTE, to: u.email,
        subject: `Suas tarefas — ${u.atras.length} atrasada(s), ${u.hoje.length} hoje`,
        html: wrapHtml(u.nome, corpo),
      })
    }))
    const enviados = results.filter(r => r.status === 'fulfilled').length

    return new Response(JSON.stringify({ ok: true, usuarios: alvos.length, enviados, data: hoje }),
      { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
})
