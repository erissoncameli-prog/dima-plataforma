// presenca-emails — envia a fila presenca_notificacoes (migração 20261128_presenca_reunioes).
// Quem enche a fila é o banco: fn_presenca_rotina, 10 min depois do início de cada reunião, põe um e-mail por
// convidado (criador + responsáveis + observadores). Para cada um, esta função gera o LINK PESSOAL da lista
// (token aleatório; só o SHA-256 fica no banco, em presenca_convites) e manda o e-mail.
// Chamada pelo cron 'presenca-emails' (a cada minuto, só quando há pendência). Falhou ⇒ tentativas + 1 (até 5).
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'
import { logosEmail } from '../_shared/logos-email.ts'
import { moldeEmail } from '../_shared/email-modelo.ts'

const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL = 'https://fundobrasilonu-plataforma.vercel.app'
const MAX_TENTATIVAS = 5
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const primeiroNome = (n: unknown) => String(n || '').trim().split(/\s+/)[0] || ''
const horaBR = (iso: string | null) => iso
  ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Rio_Branco', hour: '2-digit', minute: '2-digit' }) : ''
const quando = (ini: string | null) => {
  if (!ini) return ''
  const d = new Date(ini.slice(0, 16) + ':00-05:00')
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Rio_Branco', day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + ini.slice(11, 16)
}

function novoToken () {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function sha256 (t: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))
  return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join('')
}

function montar (d: any, link: string, logos: any) {
  const assunto = `Lista de presença: ${d.titulo}`
  const botao = `<p style="margin:22px 0"><a href="${esc(link)}" style="background:#1F4E2C;color:#fff;text-decoration:none;
    padding:13px 24px;border-radius:999px;font-size:16px;font-weight:600;display:inline-block">Assinar a lista de presença</a></p>`
  const corpo = `<p>Olá, ${esc(primeiroNome(d.nome))}.</p>
    <p>A reunião <strong>${esc(d.titulo)}</strong> começou. Registre a sua presença pelo botão abaixo: os seus dados já vêm
    preenchidos, é só conferir, responder sexo/gênero e cor ou raça (pode escolher "Prefiro não responder") e dizer se autoriza
    o uso da sua imagem.</p>
    <table role="presentation" style="margin:12px 0;font-size:14px;color:#424245">
      <tr><td style="padding:4px 14px 4px 0;color:#86868B">Quando</td><td>${esc(quando(d.inicio))} (horário do Acre)</td></tr>
      ${d.formato ? `<tr><td style="padding:4px 14px 4px 0;color:#86868B">Formato</td><td>${esc(d.formato)}${d.local ? ' · ' + esc(d.local) : ''}</td></tr>` : ''}
      <tr><td style="padding:4px 14px 4px 0;color:#86868B">Lista aberta até</td><td>${esc(horaBR(d.fecha_em))}</td></tr>
    </table>
    ${botao}
    <p style="color:#6B7280;font-size:12px">Este link é pessoal: não repasse. Quem não recebeu o e-mail assina pelo QR Code
    projetado na reunião.</p>`
  const html = moldeEmail({ logos, sobre: 'Painel de Tarefas · ' + (d.codigo || 'Reunião'), titulo: 'Assine a lista de presença',
    html: `<div style="font-size:15px;line-height:1.6;color:#424245">${corpo}</div>`,
    motivo: 'Você recebe este e-mail porque foi convidado(a) para esta reunião na Plataforma DIMA. Não responda a este e-mail.' })
  return { assunto, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    // a rotina também roda aqui (caso o cron chame direto): põe na fila as reuniões que completaram 10 min
    await admin.rpc('fn_presenca_rotina')
    const { data: fila, error } = await admin.from('presenca_notificacoes')
      .select('id, para_email, tentativas').is('enviado_em', null).lt('tentativas', MAX_TENTATIVAS)
      .order('criado_em').limit(60)
    if (error) throw error
    if (!fila?.length) return new Response(JSON.stringify({ ok: true, enviados: 0 }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

    const logos = await logosEmail(admin)
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: 'fundobrasilonuacre@gmail.com', pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
    })
    let enviados = 0, falhas = 0, pulados = 0
    for (const n of fila as any[]) {
      try {
        const token = novoToken()
        const { data: d, error: e1 } = await admin.rpc('fn_presenca_convite_emitir', { p_notificacao: n.id, p_token_hash: await sha256(token) })
        if (e1) throw e1
        if (!d || d.ja_assinou) { // já assinou pelo QR antes do e-mail: não incomoda
          await admin.from('presenca_notificacoes').update({ enviado_em: new Date().toISOString(), erro: d ? 'ja_assinou' : 'sem_dados' }).eq('id', n.id)
          pulados++; continue
        }
        const { assunto, html } = montar(d, `${SITE_URL}/pages/presenca.html?c=${encodeURIComponent(token)}`, logos)
        await transporter.sendMail({ from: REMETENTE, to: n.para_email, subject: assunto, html })
        await admin.from('presenca_notificacoes').update({ enviado_em: new Date().toISOString(), erro: null }).eq('id', n.id)
        enviados++
      } catch (e) {
        await admin.from('presenca_notificacoes').update({ tentativas: n.tentativas + 1, erro: (e as Error).message?.slice(0, 300) }).eq('id', n.id)
        falhas++
      }
    }
    return new Response(JSON.stringify({ ok: true, enviados, falhas, pulados }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('presenca-emails:', (e as Error).message)
    return new Response(JSON.stringify({ ok: false, erro: (e as Error).message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
