// E-mails do controle de acesso (migração 20261126_acessos_a_estrutura).
// Fila acesso_notificacoes, preenchida pelo banco (fn_acesso_rotina, fn_acesso_liberar_inatividade):
//   aviso_inatividade — 12 dias sem entrar: "entre até dd/mm para não perder o acesso"
//   bloqueado         — 15 dias sem entrar: entrada suspensa, como pedir a liberação
//   liberado          — o super_admin liberou: entre em até 3 dias
//   resumo_bloqueios  — para cada super_admin: quem foi suspenso hoje
// Drenada pela Edge Function acesso-emails (cron acesso-emails, a cada 15 min).
// Falhou o envio ⇒ tentativas + 1; até 5 tentativas.
import nodemailer from 'npm:nodemailer@6'
import { logosEmail } from './logos-email.ts'

const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL = 'https://fundobrasilonu-plataforma.vercel.app'
const MAX_TENTATIVAS = 5

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const dataBR = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Rio_Branco' }) : '—'
const primeiroNome = (n: unknown) => String(n || '').trim().split(/\s+/)[0] || ''

export async function drenarAcessos (admin: any) {
  const { data: fila, error } = await admin.from('acesso_notificacoes')
    .select('id, evento, para_email, dados, tentativas')
    .is('enviado_em', null).lt('tentativas', MAX_TENTATIVAS).order('criado_em').limit(50)
  if (error) throw error
  if (!fila?.length) return { enviados: 0, falhas: 0 }

  const logos = await logosEmail(admin)
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: 'fundobrasilonuacre@gmail.com', pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
  })
  let enviados = 0, falhas = 0
  for (const n of fila as any[]) {
    const { assunto, html } = montar(n.evento, n.dados || {}, logos)
    try {
      await transporter.sendMail({ from: REMETENTE, to: n.para_email, subject: assunto, html })
      await admin.from('acesso_notificacoes').update({ enviado_em: new Date().toISOString(), erro: null }).eq('id', n.id)
      enviados++
    } catch (e) {
      await admin.from('acesso_notificacoes').update({ tentativas: n.tentativas + 1, erro: (e as Error).message?.slice(0, 300) }).eq('id', n.id)
      falhas++
    }
  }
  return { enviados, falhas }
}

function montar (evento: string, d: any, logos: { cabecalho: string; faixa: string }) {
  const ola = d.nome ? `<p>Olá, ${esc(primeiroNome(d.nome))}.</p>` : ''
  const botao = (rot: string, url: string) => `<p style="text-align:center;margin:22px 0"><a href="${esc(url)}" style="background:#1B4332;color:#fff;
    text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">${esc(rot)}</a></p>`
  let assunto = '', titulo = '', corpo = ''
  if (evento === 'aviso_inatividade') {
    assunto = `Seu acesso à Plataforma DIMA será suspenso em ${dataBR(d.bloqueio_em)}`
    titulo = 'Entre na plataforma para manter o seu acesso'
    corpo = `${ola}<p>Você não entra na Plataforma DIMA desde <strong>${dataBR(d.ultima)}</strong>. Por segurança, quem fica
      15 dias sem entrar tem a entrada suspensa.</p>
      <p>Para manter o acesso, entre na plataforma (ou abra o app de campo com internet) até <strong>${dataBR(d.bloqueio_em)}</strong>.</p>
      ${botao('Entrar na plataforma', SITE_URL)}`
  } else if (evento === 'bloqueado') {
    assunto = 'Sua entrada na Plataforma DIMA foi suspensa'
    titulo = 'Entrada suspensa por falta de uso'
    corpo = `${ola}<p>Sua conta ficou ${esc(d.dias || 15)} dias sem uso (último acesso em <strong>${dataBR(d.ultima)}</strong>) e a entrada
      foi suspensa. Seus dados e acessos continuam guardados.</p>
      <p>Para voltar, abra a tela de entrada, tente entrar e clique em <strong>Pedir liberação ao administrador</strong>. O administrador
      recebe o pedido e libera a sua entrada.</p>${botao('Abrir a tela de entrada', SITE_URL)}`
  } else if (evento === 'liberado') {
    assunto = 'Sua entrada na Plataforma DIMA foi liberada'
    titulo = 'Entrada liberada'
    corpo = `${ola}<p>O administrador liberou a sua entrada. Entre até <strong>${dataBR(d.ate)}</strong>
      (${esc(d.dias || 3)} dias); se não entrar até lá, a entrada é suspensa de novo.</p>${botao('Entrar na plataforma', SITE_URL)}`
  } else {
    const lista = (d.lista || []) as any[]
    assunto = `${lista.length} ${lista.length === 1 ? 'pessoa suspensa' : 'pessoas suspensas'} por inatividade na Plataforma DIMA`
    titulo = 'Entradas suspensas hoje por inatividade'
    corpo = `<p>Estas pessoas ficaram ${esc(d.dias || 15)} dias sem entrar e tiveram a entrada suspensa:</p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px">
        <tr><th style="text-align:left;border-bottom:1px solid #E5E7EB;padding:6px">Pessoa</th>
            <th style="text-align:left;border-bottom:1px solid #E5E7EB;padding:6px">Perfil</th>
            <th style="text-align:left;border-bottom:1px solid #E5E7EB;padding:6px">Último acesso</th></tr>
        ${lista.map(p => `<tr><td style="padding:6px;border-bottom:1px solid #F3F4F6">${esc(p.nome)}<br><span style="color:#6B7280;font-size:11px">${esc(p.email)}</span></td>
          <td style="padding:6px;border-bottom:1px solid #F3F4F6">${esc(p.perfil)}</td>
          <td style="padding:6px;border-bottom:1px solid #F3F4F6">${dataBR(p.ultima)}</td></tr>`).join('')}
      </table>
      <p>Quem ainda precisa do acesso pode ser liberado em Usuários (filtro "Suspensos por inatividade").</p>
      ${botao('Abrir Usuários', SITE_URL + '/pages/usuarios.html?filtro=bloqueado')}`
  }
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:#1B4332;border-radius:8px 8px 0 0;padding:18px 24px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle">${logos.cabecalho}</td>
      <td style="vertical-align:middle;text-align:right">
        <span style="color:#D1FAE5;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Acesso à plataforma</span><br>
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
    Mensagem automática da Plataforma DIMA. Não responda a este e-mail.
  </td></tr>
</table></td></tr></table></body></html>`
  return { assunto, html }
}
