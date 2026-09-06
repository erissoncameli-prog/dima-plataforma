// enviar-email-tarefa — notifica responsáveis internos e, opcionalmente, o
// fornecedor vinculado (parte externa). Reaproveita o wrapper visual de
// enviar-email-viagem. verify_jwt = true (chamada pelo frontend logo após a RPC).
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL  = 'https://fundobrasilonu-plataforma.vercel.app'
const ASSETS    = `${SITE_URL}/assets`

const PRIORIDADE_LABEL: Record<string, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
}
const fmtData = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

// ── Wrapper HTML (mesma barra de logos das demais notificações) ──────────
function wrapHtml(corpo: string, linkBtn?: { url: string; label: string }): string {
  const linhas = corpo.split('\n')
  let html = '', emBloco = false
  for (const linha of linhas) {
    const isItem = /^[A-ZÇÁÉÍÓÚÃÕ\s]{3,16}\s*:/.test(linha)
    if (isItem) {
      if (!emBloco) { html += '<table style="width:100%;border-collapse:collapse;margin:12px 0">'; emBloco = true }
      const sep = linha.indexOf(':')
      const chave = linha.slice(0, sep).trim(), valor = linha.slice(sep + 1).trim()
      html += `<tr>
        <td style="padding:4px 10px 4px 0;font-size:12px;font-weight:700;color:#6B7280;white-space:nowrap;vertical-align:top;width:120px">${chave}</td>
        <td style="padding:4px 0;font-size:13px;color:#111827;vertical-align:top">${valor || '—'}</td>
      </tr>`
    } else {
      if (emBloco) { html += '</table>'; emBloco = false }
      html += linha.trim() === ''
        ? '<br>'
        : `<p style="margin:4px 0;font-size:13px;color:#1F2937;line-height:1.6">${linha}</p>`
    }
  }
  if (emBloco) html += '</table>'
  if (linkBtn) {
    html += `<div style="margin:24px 0 8px;text-align:center">
        <a href="${linkBtn.url}" style="display:inline-block;background:#166534;color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">${linkBtn.label}</a>
      </div>`
  }
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:#1B4332;border-radius:8px 8px 0 0;padding:18px 24px">
    <table width="100%"><tr>
      <td style="vertical-align:middle"><img src="${ASSETS}/logo-resiliencia.png" alt="Projeto DIMA" height="52" style="display:block;border:0"></td>
      <td style="vertical-align:middle;text-align:right">
        <span style="color:#D1FAE5;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Painel de Tarefas</span><br>
        <span style="color:#ffffff;font-size:15px;font-weight:700">Projeto DIMA</span><br>
        <span style="color:#A7F3D0;font-size:11px">UNESCO / SEMA-AC</span>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:12px 24px;border-bottom:1px solid #E5E7EB">
    <table width="100%"><tr>
      <td align="center" style="padding:0 6px"><img src="${ASSETS}/1695134345-1-horizontal-verde-solo.png" alt="SEMA/AC" height="32" style="display:block;border:0"></td>
      <td align="center" style="padding:0 6px"><img src="${ASSETS}/UNESCO_logo_hor_blue_transparent.png.png" alt="UNESCO" height="28" style="display:block;border:0"></td>
      <td align="center" style="padding:0 6px"><img src="${ASSETS}/UNCT_Logo_RGB_Brazil_Portuguese_horiz_color.png" alt="ONU Brasil" height="28" style="display:block;border:0"></td>
      <td align="center" style="padding:0 6px"><img src="${ASSETS}/logo-fundo-brasil-onu.png" alt="Fundo Brasil-ONU" height="32" style="display:block;border:0"></td>
      <td align="center" style="padding:0 6px"><img src="${ASSETS}/logo-consorcio-amazonia.png" alt="Consórcio Amazônia" height="36" style="display:block;border:0"></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:28px 24px 20px">${html}</td></tr>
  <tr><td style="background:#F9FAFB;border-top:1px solid #E5E7EB;border-radius:0 0 8px 8px;padding:14px 24px;text-align:center">
    <p style="margin:0;font-size:11px;color:#6B7280">Equipe de Gestão – <strong>Projeto DIMA</strong> · UNESCO / SEMA-AC<br>
      <a href="mailto:fundobrasilonuacre@gmail.com" style="color:#059669;text-decoration:none">fundobrasilonuacre@gmail.com</a></p>
  </td></tr>
</table></td></tr></table></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { tarefa_id, evento = 'atribuicao' } = await req.json()
    if (!tarefa_id) throw new Error('tarefa_id obrigatório')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Tarefa + fornecedor
    const { data: t, error: eT } = await supabase
      .from('tarefas')
      .select('id,codigo,titulo,descricao,status,prioridade,dt_prazo,fornecedor_id,notificar_fornecedor,' +
              'fornecedor:fornecedores(nome,email,responsavel_nome)')
      .eq('id', tarefa_id).single()
    if (eT || !t) throw new Error('tarefa não encontrada')

    // Participantes (com e-mail)
    const { data: parts } = await supabase
      .from('tarefa_participantes')
      .select('papel, usuario:usuarios(nome_completo,email)')
      .eq('tarefa_id', tarefa_id)

    const responsaveis = (parts || []).filter((p: any) => p.papel === 'responsavel')
    const observadores = (parts || []).filter((p: any) => p.papel === 'observador')

    // Destinatários internos por evento
    let internos: any[] = []
    if (evento === 'concluida') internos = observadores
    else internos = responsaveis

    const prazoTxt = fmtData(t.dt_prazo)
    const prioTxt  = PRIORIDADE_LABEL[t.prioridade] || t.prioridade
    const linkApp  = { url: `${SITE_URL}/pages/tarefas.html?tarefa=${t.id}`, label: 'Abrir no painel' }

    const assuntoBase: Record<string, string> = {
      atribuicao:     `Nova tarefa ${t.codigo}: ${t.titulo}`,
      prazo_alterado: `Prazo alterado — ${t.codigo}: ${t.titulo}`,
      concluida:      `Tarefa concluída — ${t.codigo}: ${t.titulo}`,
    }
    const abertura: Record<string, string> = {
      atribuicao:     'Uma tarefa foi atribuída a você no painel do Projeto DIMA.',
      prazo_alterado: 'O prazo de uma tarefa sob sua responsabilidade mudou.',
      concluida:      'Uma tarefa que você acompanha foi concluída.',
    }

    const corpoInterno =
      `${abertura[evento] || abertura.atribuicao}\n\n` +
      `TAREFA: ${t.codigo} — ${t.titulo}\n` +
      (t.descricao ? `DESCRIÇÃO: ${t.descricao}\n` : '') +
      `PRIORIDADE: ${prioTxt}\n` +
      `PRAZO: ${prazoTxt}\n` +
      (t.fornecedor ? `FORNECEDOR: ${t.fornecedor.nome}\n` : '')

    const envios: any[] = []
    for (const p of internos) {
      const email = p.usuario?.email
      if (!email) continue
      envios.push({
        to: email,
        assunto: assuntoBase[evento] || assuntoBase.atribuicao,
        html: wrapHtml(`Olá, ${(p.usuario?.nome_completo || '').split(' ')[0] || ''}.\n\n${corpoInterno}`, linkApp),
      })
    }

    // Fornecedor (parte externa) — só em atribuição / prazo, sem link de login
    if ((evento === 'atribuicao' || evento === 'prazo_alterado') &&
        t.notificar_fornecedor && t.fornecedor?.email) {
      const saud = t.fornecedor.responsavel_nome
        ? `Prezado(a) ${t.fornecedor.responsavel_nome}`
        : `Prezados(as), ${t.fornecedor.nome}`
      const corpoExt =
        `${saud},\n\n` +
        `Registramos no Projeto DIMA uma pendência sob sua responsabilidade:\n\n` +
        `ITEM: ${t.titulo}\n` +
        (t.descricao ? `DETALHE: ${t.descricao}\n` : '') +
        `PRAZO: ${prazoTxt}\n\n` +
        `Em caso de dúvida, responda a este e-mail ou fale com a equipe de gestão.`
      envios.push({
        to: t.fornecedor.email,
        assunto: `Projeto DIMA — pendência: ${t.titulo}`,
        html: wrapHtml(corpoExt), // sem botão de login
      })
    }

    if (!envios.length) {
      return new Response(JSON.stringify({ ok: true, enviados: 0, falhas: 0, aviso: 'nenhum destinatário com e-mail' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: 'fundobrasilonuacre@gmail.com', pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
    })

    const results = await Promise.allSettled(
      envios.map(e => transporter.sendMail({ from: REMETENTE, to: e.to, subject: e.assunto, html: e.html })),
    )
    const enviados = results.filter(r => r.status === 'fulfilled').length
    const falhas   = results.length - enviados

    return new Response(JSON.stringify({ ok: enviados > 0, enviados, falhas }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
