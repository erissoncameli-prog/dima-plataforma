// E-mails do pedido de acesso à API (migração 20261101_api_pedidos_email).
// Usado por receber-email-tarefa (aviso "recebido", logo depois de registrar) e por
// assinar-remanejamento (aprovado/recusado na decisão e a fila inteira no { acao: 'drenar' }).
//
// Fila api_pedido_notificacoes: recebido | aprovado | recusado | vencendo.
// "aprovado" leva o LINK DE RETIRADA: o token é gerado aqui, na hora do envio
// (fn_api_emitir_retirada), e só o hash fica no banco. A CHAVE nunca vai no e-mail.
// Falhou o envio ⇒ tentativa + 1; o cron (remanejamento-emails) tenta de novo.
import nodemailer from 'npm:nodemailer@6'
import { logosEmail } from './logos-email.ts'

const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL = 'https://fundobrasilonu-plataforma.vercel.app'
export const API_ENDERECO_PEDIDO = 'fundobrasilonuacre+api@gmail.com'
const API_BASE = 'https://wfymnmlinonvdqfucjya.supabase.co/functions/v1/api-dados/v1'
const MAX_TENTATIVAS = 5
const ROTAS: Record<string, string> = {
  resumo: 'Resumo do projeto', atividades: 'Atividades (ficha numérica)', matriz: 'Matriz de Resultados',
}

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const dataBR = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Rio_Branco' }) : '—'
const horaBR = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco', dateStyle: 'short', timeStyle: 'short' }) : '—'

export async function drenarApiPedidos (admin: any, pedidoId: string | null = null) {
  let q = admin.from('api_pedido_notificacoes')
    .select('id, pedido_id, cliente_id, evento, para_email, tentativas')
    .is('enviado_em', null).lt('tentativas', MAX_TENTATIVAS).order('criado_em').limit(50)
  if (pedidoId) q = q.eq('pedido_id', pedidoId)
  const { data: fila, error } = await q
  if (error) throw error
  if (!fila?.length) return { enviados: 0, falhas: 0 }

  const pedIds = [...new Set(fila.map((f: any) => f.pedido_id).filter(Boolean))]
  const cliIds = [...new Set(fila.map((f: any) => f.cliente_id).filter(Boolean))]
  const [{ data: peds }, { data: clis }] = await Promise.all([
    pedIds.length ? admin.from('api_pedidos').select('id, numero, assunto, email_message_id, status, parecer, cliente_id').in('id', pedIds) : { data: [] },
    cliIds.length ? admin.from('api_clientes').select('id, nome, escopos, origens, limite_minuto, expira_em, chave_prefixo, ativo').in('id', cliIds) : { data: [] },
  ])
  const pedPor = new Map((peds || []).map((p: any) => [p.id, p]))
  const cliPor = new Map((clis || []).map((c: any) => [c.id, c]))
  const logos = await logosEmail(admin)
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: 'fundobrasilonuacre@gmail.com', pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
  })
  const marcar = (id: string, campos: Record<string, unknown>) => admin.from('api_pedido_notificacoes').update(campos).eq('id', id)

  let enviados = 0, falhas = 0
  for (const n of fila as any[]) {
    const p: any = n.pedido_id ? pedPor.get(n.pedido_id) : null
    const c: any = cliPor.get(n.cliente_id || p?.cliente_id)
    let link: string | null = null
    // aviso que perdeu o sentido (pedido já retirado, acesso revogado…) sai da fila sem envio
    let descartar = ''
    if (n.evento === 'aprovado') {
      if (!p || p.status !== 'aprovado' || !c?.ativo) descartar = 'pedido não está aguardando retirada'
      else {
        const { data: tok, error: eTok } = await admin.rpc('fn_api_emitir_retirada', { p_pedido: p.id })
        if (eTok || !tok) descartar = 'link de retirada não emitido: ' + (eTok?.message || 'chave já retirada ou acesso revogado')
        else link = `${SITE_URL}/pages/api-retirar.html?t=${tok}`
      }
    } else if (n.evento === 'vencendo' && !c?.ativo) descartar = 'acesso revogado'
    else if (n.evento !== 'vencendo' && !p) descartar = 'pedido não encontrado'
    if (descartar) { await marcar(n.id, { tentativas: MAX_TENTATIVAS, ultimo_erro: descartar }); falhas++; continue }

    const { assunto, html } = montar(n.evento, p, c, link, logos)
    const extra: Record<string, unknown> = {}
    if (n.evento === 'recebido' && p?.email_message_id) {   // resposta no mesmo fio do pedido
      extra.inReplyTo = p.email_message_id; extra.references = p.email_message_id
    }
    try {
      await transporter.sendMail({ from: REMETENTE, to: n.para_email, replyTo: API_ENDERECO_PEDIDO, subject: assunto, html, ...extra })
      await marcar(n.id, { enviado_em: new Date().toISOString(), ultimo_erro: null })
      enviados++
    } catch (e) {
      await marcar(n.id, { tentativas: n.tentativas + 1, ultimo_erro: (e as Error).message?.slice(0, 300) })
      falhas++
    }
  }
  return { enviados, falhas }
}

function montar (evento: string, p: any, c: any, link: string | null, logos: { cabecalho: string; faixa: string }) {
  let assunto = '', titulo = '', corpo = ''
  const quadroAcesso = c ? `
    <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:13px">
      ${linha('Acesso', esc(c.nome))}
      ${linha('Rotas liberadas', (c.escopos || []).map((r: string) => esc(ROTAS[r] || r)).join('<br>'))}
      ${linha('Sites do painel', (c.origens || []).length ? (c.origens || []).map(esc).join('<br>') : 'Nenhum (só servidor ou BI)')}
      ${linha('Limite', `${esc(c.limite_minuto)} chamadas por minuto`)}
      ${linha('Válida até', dataBR(c.expira_em))}
    </table>` : ''

  if (evento === 'recebido') {
    assunto = `Re: ${p.assunto || 'Pedido de acesso à API'} — recebido (${p.numero})`
    titulo = 'Recebemos seu pedido de acesso à API'
    corpo = `<p>Seu pedido foi registrado com o número <strong>${esc(p.numero)}</strong> e será analisado pela administração do
      DIMA. A resposta virá para este mesmo endereço.</p>
      <p>Não é preciso enviar mais nada. Por segurança, nunca enviaremos a chave da API no corpo de um e-mail.</p>`
  } else if (evento === 'aprovado') {
    assunto = `Acesso à API do DIMA aprovado (${p.numero}) — retire sua chave`
    titulo = 'Seu acesso à API foi aprovado'
    corpo = `<p>O pedido <strong>${esc(p.numero)}</strong> foi aprovado.</p>${quadroAcesso}
      ${p.parecer ? `<p style="color:#374151"><em>${esc(p.parecer)}</em></p>` : ''}
      <p>Para ver a sua chave, abra o link abaixo e clique em <strong>Mostrar minha chave</strong>. O link vale até
      <strong>${horaBR(new Date(Date.now() + 72 * 3600e3).toISOString())}</strong> (72 horas) e funciona <strong>uma vez só</strong>:
      a chave aparece uma única vez, então copie e guarde em local seguro.</p>
      <p style="text-align:center;margin:22px 0"><a href="${esc(link)}" style="background:#1B4332;color:#fff;text-decoration:none;
        padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">Retirar minha chave</a></p>
      <p style="font-size:12px;color:#6B7280">Se o botão não abrir, copie este endereço no navegador:<br>${esc(link)}</p>
      <p style="font-size:12px;color:#6B7280">Endereço da API: ${esc(API_BASE)}. A página da retirada mostra exemplos de uso.
      Se o link vencer, peça um novo respondendo a este e-mail.</p>`
  } else if (evento === 'recusado') {
    assunto = `Pedido de acesso à API do DIMA não aprovado (${p.numero})`
    titulo = 'Seu pedido de acesso à API não foi aprovado'
    corpo = `<p>O pedido <strong>${esc(p.numero)}</strong> foi analisado e não foi aprovado.</p>
      <p><strong>Motivo:</strong> ${esc(p.parecer)}</p>
      <p>Se quiser, envie um novo pedido para <strong>${API_ENDERECO_PEDIDO}</strong> com as informações que faltaram.</p>`
  } else {
    assunto = `Sua chave da API do DIMA vence em ${dataBR(c.expira_em)}`
    titulo = 'Sua chave da API vai vencer'
    corpo = `<p>A chave <strong>${esc(c.chave_prefixo || '')}…</strong> (${esc(c.nome)}) vence em <strong>${dataBR(c.expira_em)}</strong>.
      Depois dessa data a API passa a recusar as chamadas com ela.</p>${quadroAcesso}
      <p>Para continuar, envie um novo pedido para <strong>${API_ENDERECO_PEDIDO}</strong> informando que é uma renovação.</p>`
  }

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:#1B4332;border-radius:8px 8px 0 0;padding:18px 24px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle">${logos.cabecalho}</td>
      <td style="vertical-align:middle;text-align:right">
        <span style="color:#D1FAE5;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">API de dados</span><br>
        <span style="color:#fff;font-size:15px;font-weight:700">Projeto DIMA</span><br>
        <span style="color:#A7F3D0;font-size:11px">UNESCO / SEMA-AC</span>
      </td></tr></table>
  </td></tr>
  ${logos.faixa ? `<tr><td style="background:#ffffff;padding:12px 24px;border-bottom:1px solid #E5E7EB"><table width="100%" cellpadding="0" cellspacing="0"><tr>${logos.faixa}</tr></table></td></tr>` : ''}
  <tr><td style="background:#fff;padding:26px 24px 22px;font-size:14px;line-height:1.55;color:#1F2937">
    <p style="margin:0 0 14px;font-size:16px;font-weight:700;color:#1B4332">${esc(titulo)}</p>
    ${corpo}
  </td></tr>
  <tr><td style="background:#F9FAFB;border-radius:0 0 8px 8px;padding:14px 24px;font-size:11px;color:#6B7280;text-align:center">
    Mensagem automática da Plataforma DIMA. A API entrega só números agregados do projeto, sem dados pessoais.
  </td></tr>
</table></td></tr></table></body></html>`
  return { assunto, html }
}

function linha (rot: string, val: string) {
  return `<tr><td style="padding:5px 10px 5px 0;font-size:11px;font-weight:700;color:#6B7280;white-space:nowrap;vertical-align:top;width:120px;text-transform:uppercase">${esc(rot)}</td>
    <td style="padding:5px 0;color:#111827">${val}</td></tr>`
}
