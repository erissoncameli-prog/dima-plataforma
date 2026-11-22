// E-mails do controle de acesso (migração 20261126_acessos_a_estrutura).
// Fila acesso_notificacoes, preenchida pelo banco (fn_acesso_rotina, fn_acesso_liberar_inatividade):
//   aviso_inatividade — 12 dias sem entrar: "entre até dd/mm para não perder o acesso"
//   bloqueado         — 15 dias sem entrar: entrada suspensa, como pedir a liberação
//   liberado          — o super_admin liberou: entre em até 3 dias
//   resumo_bloqueios  — para cada super_admin: quem foi suspenso hoje
//   (liberado com dados.reativado = conta desativada que voltou; leva também o link para criar senha nova)
// Enviados na hora pela Edge Function conta-acesso (migração 20261127_acessos_e_retorno_senha):
//   senha_link        — link de uso único (24 h) para a pessoa criar a senha nova
//   senha_alterada    — aviso de que a senha mudou ("se não foi você, avise")
//   retorno_confirmar — link para confirmar o pedido de voltar a entrar (conta suspensa ou desativada)
// Drenada pela Edge Function acesso-emails (cron acesso-emails, a cada 15 min).
// Falhou o envio ⇒ tentativas + 1; até 5 tentativas.
import nodemailer from 'npm:nodemailer@6'
import { logosEmail } from './logos-email.ts'
import { moldeEmail } from './email-modelo.ts'

const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL = 'https://fundobrasilonu-plataforma.vercel.app'
const MAX_TENTATIVAS = 5

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const dataBR = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Rio_Branco' }) : '—'
const primeiroNome = (n: unknown) => String(n || '').trim().split(/\s+/)[0] || ''

export function novoToken () {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export async function sha256 (t: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))
  return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join('')
}
export const linkSenha = (t: string) => `${SITE_URL}/pages/nova-senha.html?t=${encodeURIComponent(t)}`

// Envio na hora (conta-acesso): um e-mail, sem fila. Devolve true se o Gmail aceitou.
export async function enviarAcessoAgora (admin: any, para: string, evento: string, dados: any) {
  const logos = await logosEmail(admin)
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: 'fundobrasilonuacre@gmail.com', pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
  })
  const { assunto, html } = montar(evento, dados || {}, logos)
  for (let i = 0; i < 3; i++) {
    try { await transporter.sendMail({ from: REMETENTE, to: para, subject: assunto, html }); return true }
    catch (e) { console.error('enviarAcessoAgora:', (e as Error).message); await new Promise(r => setTimeout(r, 800 * (i + 1))) }
  }
  return false
}

export async function drenarAcessos (admin: any) {
  const { data: fila, error } = await admin.from('acesso_notificacoes')
    .select('id, usuario_id, evento, para_email, dados, tentativas')
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
    const dados = { ...(n.dados || {}) }
    // entrada liberada / conta reativada: o e-mail leva um link para criar senha nova (gerado agora; só o resumo fica no banco)
    if (n.evento === 'liberado' && n.usuario_id && !dados.link_senha) {
      try {
        const t = novoToken()
        const { data: okL } = await admin.rpc('fn_senha_link_emitir', { p_uid: n.usuario_id, p_token_hash: await sha256(t) })
        if (okL) dados.link_senha = linkSenha(t)
      } catch (_) { /* sem o link, o e-mail sai assim mesmo */ }
    }
    const { assunto, html } = montar(n.evento, dados, logos)
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

function montar (evento: string, d: any, logos: any) {
  const ola = d.nome ? `<p>Olá, ${esc(primeiroNome(d.nome))}.</p>` : ''
  const botao = (rot: string, url: string) => `<p style="margin:22px 0"><a href="${esc(url)}" style="background:#1F4E2C;color:#fff;
    text-decoration:none;padding:13px 24px;border-radius:999px;font-size:16px;font-weight:600;display:inline-block">${esc(rot)}</a></p>`
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
      <p>Para voltar, abra a tela de entrada, tente entrar e clique em <strong>Pedir para voltar a entrar</strong>. Você confirma o pedido
      pelo e-mail e o administrador libera a sua entrada.</p>${botao('Abrir a tela de entrada', SITE_URL)}`
  } else if (evento === 'liberado') {
    const reat = !!d.reativado
    assunto = reat ? 'Sua conta na Plataforma DIMA foi reativada' : 'Sua entrada na Plataforma DIMA foi liberada'
    titulo = reat ? 'Conta reativada' : 'Entrada liberada'
    corpo = `${ola}<p>${reat ? 'O administrador reativou a sua conta.' : 'O administrador liberou a sua entrada.'}
      Entre até <strong>${dataBR(d.ate)}</strong> (${esc(d.dias || 3)} dias); se não entrar até lá, a entrada é suspensa de novo.</p>
      ${reat ? '<p>Os seus acessos voltaram <strong>em revisão</strong>: o administrador confirma nos próximos dias os módulos de que você ainda precisa.</p>' : ''}
      ${botao('Entrar na plataforma', SITE_URL)}
      ${d.link_senha ? `<p>Não lembra a senha? Crie uma nova por este link, válido por 24 horas e só uma vez:</p>${botao('Criar uma senha nova', d.link_senha)}` : ''}`
  } else if (evento === 'senha_link') {
    assunto = 'Crie a sua nova senha da Plataforma DIMA'
    titulo = 'Pedido de nova senha'
    corpo = `${ola}<p>Recebemos um pedido de nova senha para a sua conta. Clique no botão para criar a senha.
      O link vale por <strong>24 horas</strong> e só pode ser usado uma vez.</p>${botao('Criar a nova senha', d.link)}
      <p style="color:#6B7280;font-size:12px">Se não foi você que pediu, ignore este e-mail: a sua senha atual continua valendo.
      Nunca repasse este link a outra pessoa.</p>`
  } else if (evento === 'senha_alterada') {
    assunto = 'A senha da sua conta na Plataforma DIMA foi alterada'
    titulo = 'Senha alterada'
    corpo = `${ola}<p>A senha da sua conta foi alterada em <strong>${esc(d.quando || '')}</strong>.</p>
      <p>Se foi você, não precisa fazer nada. <strong>Se não foi você</strong>, avise a coordenação do projeto
      ou o administrador da plataforma imediatamente.</p>${botao('Entrar na plataforma', SITE_URL)}`
  } else if (evento === 'retorno_confirmar') {
    const desat = d.situacao === 'desativada'
    assunto = desat ? 'Confirme o pedido de reativação da sua conta na Plataforma DIMA' : 'Confirme o pedido para voltar a entrar na Plataforma DIMA'
    titulo = desat ? 'Pedido de reativação da conta' : 'Pedido para voltar a entrar'
    corpo = `${ola}<p>${desat ? 'A sua conta está <strong>desativada</strong>.' : 'A sua entrada está <strong>suspensa</strong> porque a conta ficou 15 dias sem uso.'}
      Para o administrador receber o pedido de ${desat ? 'reativação' : 'liberação'}, confirme que foi você que pediu:</p>
      ${botao('Confirmar o meu pedido', d.link)}
      <p>O link vale por 24 horas. Depois de confirmado, o administrador decide; quando ${desat ? 'a conta for reativada' : 'a entrada for liberada'},
      você recebe outro e-mail${desat ? ' (os seus acessos voltam em revisão)' : ''}.</p>
      <p style="color:#6B7280;font-size:12px">Se não foi você que pediu, ignore este e-mail.</p>`
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
  const html = moldeEmail({ logos, sobre: 'Acesso à plataforma', titulo,
    html: `<div style="font-size:15px;line-height:1.6;color:#424245">${corpo}</div>`,
    motivo: 'Mensagem automática da Plataforma DIMA. Não responda a este e-mail.' })
  return { assunto, html }
}
