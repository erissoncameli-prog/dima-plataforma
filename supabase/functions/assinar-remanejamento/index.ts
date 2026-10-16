// assinar-remanejamento — única porta de assinatura da cadeia de remanejamento.
//
// { acao: 'assinar', remanejamento_id, decisao: 'aprovar'|'devolver'|'recusar'|'cancelar',
//   motivo?, hash, senha }   (JWT do usuário)
//   1. identifica o usuário pelo JWT;
//   2. bloqueio: 5 senhas erradas em 30 min ⇒ 30 min sem assinar (rem_tentativas_senha);
//   3. RECONFIRMA A SENHA DE LOGIN no Auth (grant_type=password) com o e-mail do
//      próprio JWT; a sessão criada é encerrada na hora; a senha nunca é gravada
//      nem logada;
//   4. só então chama fn_rem_assinar com service_role (a RPC não tem EXECUTE
//      para authenticated — sem passar por aqui não há assinatura). `hash` é o
//      fn_rem_hash que a pessoa viu na tela: documento alterado ⇒ recusa;
//   5. envia os e-mails da fila remanejamento_notificacoes deste pedido.
//
// { acao: 'assinar_cancelamento', cancelamento_id, decisao, motivo?, hash, senha }
//   mesma porta (mesma senha, mesmo bloqueio) para o PEDIDO DE CANCELAMENTO DE TDR
//   (20261012_tdr_cancelamento): chama fn_tcan_assinar (service_role) e envia a fila
//   tdr_cancelamento_notificacoes do pedido.
//
// { acao: 'decidir_encerramento', pedido_id, decisao: 'aprovar'|'devolver', motivo?, hash, senha }
//   mesma porta para o PEDIDO DE ENCERRAMENTO DE CONTRATO (20261013_encerramento_aprovacao):
//   o responsável/substituto da atividade aprova ou devolve com a senha; chama
//   fn_encp_decidir (service_role), que efetiva o encerramento na aprovação.
//
// { acao: 'decidir_viagem', protocolo_id, decisao: 'aprovar'|'devolver'|'rejeitar', motivo?, hash, senha }
//   mesma porta para o PROTOCOLO DE VIAGEM (20261016_viagem_aprovacao_segregada): super_admin
//   aprova/devolve/rejeita o solicitado; super_admin ou financeiro devolvem o aprovado; quem
//   pediu ou viaja nunca decide. Chama fn_viagem_decidir (service_role).
//
// { acao: 'drenar' }   (cron 'remanejamento-emails') — reenvia a fila pendente,
//   inclusive os avisos de contrato travado/liberado (cobertura_notificacoes, rem_11)
//   e os do cancelamento de TDR.
//
// A aprovação nunca depende do e-mail: ele sai da fila depois do COMMIT e o
// que falhar fica pendente para o cron.
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'
import { logosEmail } from '../_shared/logos-email.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL  = 'https://fundobrasilonu-plataforma.vercel.app'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MAX_TENTATIVAS_EMAIL = 5

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const usd = (v: number) => 'US$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  let corpo: any = {}
  try { corpo = await req.json() } catch { /* vazio */ }

  if (corpo.acao === 'drenar') {
    const r = await drenarEmails(admin, null)
    let cobertura = { enviados: 0, falhas: 0 }, cancelamento = { enviados: 0, falhas: 0 }
    try { cobertura = await drenarCobertura(admin) } catch (e) { console.error('cobertura:', (e as Error).message) }
    try { cancelamento = await drenarCancelamentos(admin, null) } catch (e) { console.error('cancelamento:', (e as Error).message) }
    return resp({ ok: true, ...r, cobertura, cancelamento })
  }
  if (!['assinar', 'assinar_cancelamento', 'decidir_encerramento', 'decidir_viagem'].includes(corpo.acao)) return resp({ ok: false, erro: 'acao inválida' }, 400)
  const ehCancelamento = corpo.acao === 'assinar_cancelamento'
  const ehEncerramento = corpo.acao === 'decidir_encerramento'
  const ehViagem = corpo.acao === 'decidir_viagem'

  // 1. quem é
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: u, error: eU } = await admin.auth.getUser(token)
  if (eU || !u?.user?.email) return resp({ ok: false, erro: 'Sessão inválida. Entre de novo.' }, 401)
  const usuarioId = u.user.id

  const { remanejamento_id, cancelamento_id, pedido_id, protocolo_id, decisao, motivo, hash, senha } = corpo
  const pedidoId = ehViagem ? protocolo_id : ehEncerramento ? pedido_id : ehCancelamento ? cancelamento_id : remanejamento_id
  if (!pedidoId || !decisao || !hash || typeof senha !== 'string' || !senha) {
    return resp({ ok: false, erro: 'Dados incompletos (pedido, decisão, hash e senha).' }, 400)
  }

  // 2. bloqueio por tentativas
  const { data: bloqueadoAte } = await admin.rpc('fn_rem_senha_bloqueada_ate', { p_usuario_id: usuarioId })
  if (bloqueadoAte) {
    return resp({ ok: false, erro: 'SENHA_BLOQUEADA', bloqueado_ate: bloqueadoAte }, 429)
  }

  // 3. senha de login reconfirmada no servidor
  const ok = await conferirSenha(u.user.email, senha)
  await admin.rpc('fn_rem_registrar_tentativa', { p_usuario_id: usuarioId, p_sucesso: ok })
  if (!ok) return resp({ ok: false, erro: 'SENHA_INVALIDA' }, 401)

  // 4. assinatura
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
  if (ehViagem) {
    const { data: resV, error: eV } = await admin.rpc('fn_viagem_decidir', {
      p_usuario_id: usuarioId, p_protocolo: protocolo_id, p_decisao: decisao,
      p_motivo: motivo ?? null, p_hash: hash,
    })
    if (eV) return resp({ ok: false, erro: eV.message }, 409)
    return resp({ ok: true, resultado: resV })
  }
  if (ehEncerramento) {
    const { data: resE, error: eE } = await admin.rpc('fn_encp_decidir', {
      p_usuario_id: usuarioId, p_pedido: pedido_id, p_decisao: decisao,
      p_parecer: motivo ?? null, p_hash: hash, p_ip: ip, p_user_agent: req.headers.get('user-agent'),
    })
    if (eE) return resp({ ok: false, erro: eE.message }, 409)
    // a liberação entra no razão e pode destravar contrato (cobertura)
    try { await drenarCobertura(admin) } catch (e) { console.error('cobertura:', (e as Error).message) }
    return resp({ ok: true, resultado: resE })
  }
  if (ehCancelamento) {
    const { data: resC, error: eC } = await admin.rpc('fn_tcan_assinar', {
      p_usuario_id: usuarioId, p_cancelamento_id: cancelamento_id, p_decisao: decisao,
      p_motivo: motivo ?? null, p_hash: hash, p_ip: ip, p_user_agent: req.headers.get('user-agent'),
    })
    if (eC) return resp({ ok: false, erro: eC.message }, 409)
    let emailsC = { enviados: 0, falhas: 0 }
    try { emailsC = await drenarCancelamentos(admin, cancelamento_id) } catch (e) { console.error('emails:', (e as Error).message) }
    // cancelar o TDR libera saldo: pode destravar contrato (cobertura)
    try { await drenarCobertura(admin) } catch (e) { console.error('cobertura:', (e as Error).message) }
    return resp({ ok: true, resultado: resC, emails: emailsC })
  }
  const { data: res, error: eA } = await admin.rpc('fn_rem_assinar', {
    p_usuario_id: usuarioId, p_remanejamento_id: remanejamento_id, p_decisao: decisao,
    p_motivo: motivo ?? null, p_hash: hash, p_ip: ip, p_user_agent: req.headers.get('user-agent'),
  })
  if (eA) return resp({ ok: false, erro: eA.message }, 409)

  // 5. e-mails (não derruba a assinatura se falhar)
  let emails = { enviados: 0, falhas: 0 }
  try { emails = await drenarEmails(admin, remanejamento_id) } catch (e) { console.error('emails:', (e as Error).message) }
  // efetivar pode liberar contrato travado (cobertura): manda o aviso já
  try { await drenarCobertura(admin) } catch (e) { console.error('cobertura:', (e as Error).message) }
  return resp({ ok: true, resultado: res, emails })
})

async function conferirSenha(email: string, senha: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  })
  if (!r.ok) return false
  const j = await r.json().catch(() => null)
  // encerra a sessão criada só para conferir a senha
  if (j?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${j.access_token}` },
    }).catch(() => {})
  }
  return !!j?.access_token
}

const ETAPA_NOME: Record<string, string> = {
  solicitacao: 'Solicitação (coordenação)', liberacao_origem: 'Liberação pela atividade de origem',
  unesco: 'UNESCO', diretoria: 'Diretoria', secretaria: 'Secretaria',
}

async function drenarEmails(admin: any, remanejamentoId: string | null) {
  let q = admin.from('remanejamento_notificacoes')
    .select('id, remanejamento_id, usuario_id, evento, motivo, tentativas')
    .is('enviado_em', null).lt('tentativas', MAX_TENTATIVAS_EMAIL).order('criado_em').limit(50)
  if (remanejamentoId) q = q.eq('remanejamento_id', remanejamentoId)
  const { data: fila, error } = await q
  if (error) throw error
  if (!fila?.length) return { enviados: 0, falhas: 0 }
  const logos = await logosEmail(admin)

  const remIds = [...new Set(fila.map((f: any) => f.remanejamento_id))]
  const usuIds = [...new Set(fila.map((f: any) => f.usuario_id))]
  const [{ data: rems }, { data: usus }, { data: itens }, { data: etapas }] = await Promise.all([
    admin.from('remanejamentos').select('id, numero, justificativa, status, etapa_atual, versao').in('id', remIds),
    admin.from('usuarios').select('id, nome_completo, email, ativo').in('id', usuIds),
    admin.from('remanejamento_itens').select('remanejamento_id, valor_usd, atividades(codigo, nome_pt)').in('remanejamento_id', remIds).eq('ativo', true),
    admin.from('remanejamento_etapas').select('remanejamento_id, versao, ordem, papel, atividades(codigo)').in('remanejamento_id', remIds),
  ])
  const remPor = new Map((rems || []).map((r: any) => [r.id, r]))
  const usuPor = new Map((usus || []).map((u: any) => [u.id, u]))

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: 'fundobrasilonuacre@gmail.com', pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
  })

  let enviados = 0, falhas = 0
  for (const n of fila as any[]) {
    const r: any = remPor.get(n.remanejamento_id)
    const u: any = usuPor.get(n.usuario_id)
    if (!r || !u?.email || !u.ativo) {
      await admin.from('remanejamento_notificacoes')
        .update({ tentativas: MAX_TENTATIVAS_EMAIL, ultimo_erro: 'destinatário sem e-mail ou inativo' }).eq('id', n.id)
      falhas++; continue
    }
    const its = (itens || []).filter((i: any) => i.remanejamento_id === r.id)
    const et = (etapas || []).filter((e: any) => e.remanejamento_id === r.id && e.versao === r.versao && e.ordem === r.etapa_atual)[0]
    const { assunto, html } = montarEmail(n, r, u, its, et, logos)
    try {
      await transporter.sendMail({ from: REMETENTE, to: u.email, subject: assunto, html })
      await admin.from('remanejamento_notificacoes').update({ enviado_em: new Date().toISOString(), ultimo_erro: null }).eq('id', n.id)
      enviados++
    } catch (e) {
      await admin.from('remanejamento_notificacoes')
        .update({ tentativas: n.tentativas + 1, ultimo_erro: (e as Error).message?.slice(0, 300) }).eq('id', n.id)
      falhas++
    }
  }
  return { enviados, falhas }
}

// ── Aviso de contrato travado / liberado (cobertura_notificacoes, rem_11) ──
async function drenarCobertura(admin: any) {
  const { data: fila, error } = await admin.from('cobertura_notificacoes')
    .select('id, contrato_id, atividade_id, usuario_id, evento, deficit_usd, tentativas')
    .is('enviado_em', null).lt('tentativas', MAX_TENTATIVAS_EMAIL).order('criado_em').limit(50)
  if (error) throw error
  if (!fila?.length) return { enviados: 0, falhas: 0 }
  const logos = await logosEmail(admin)

  const ctIds = [...new Set(fila.map((f: any) => f.contrato_id))]
  const usuIds = [...new Set(fila.map((f: any) => f.usuario_id))]
  const atvIds = [...new Set(fila.map((f: any) => f.atividade_id).filter(Boolean))]
  const [{ data: cts }, { data: usus }, { data: atvs }] = await Promise.all([
    admin.from('contratos').select('id, numero, objeto_pt, valor_total_brl, status, tdrs(numero), fornecedores(nome)').in('id', ctIds),
    admin.from('usuarios').select('id, nome_completo, email, ativo').in('id', usuIds),
    admin.from('atividades').select('id, codigo, nome_pt').in('id', atvIds.length ? atvIds : ['00000000-0000-0000-0000-000000000000']),
  ])
  const ctPor = new Map((cts || []).map((c: any) => [c.id, c]))
  const usuPor = new Map((usus || []).map((u: any) => [u.id, u]))
  const atvPor = new Map((atvs || []).map((a: any) => [a.id, a]))

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: 'fundobrasilonuacre@gmail.com', pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
  })
  let enviados = 0, falhas = 0
  for (const n of fila as any[]) {
    const c: any = ctPor.get(n.contrato_id)
    const u: any = usuPor.get(n.usuario_id)
    if (!c || !u?.email || !u.ativo) {
      await admin.from('cobertura_notificacoes')
        .update({ tentativas: MAX_TENTATIVAS_EMAIL, ultimo_erro: 'destinatário sem e-mail ou inativo' }).eq('id', n.id)
      falhas++; continue
    }
    const { assunto, html } = montarEmailCobertura(n, c, u, atvPor.get(n.atividade_id), logos)
    try {
      await transporter.sendMail({ from: REMETENTE, to: u.email, subject: assunto, html })
      await admin.from('cobertura_notificacoes').update({ enviado_em: new Date().toISOString(), ultimo_erro: null }).eq('id', n.id)
      enviados++
    } catch (e) {
      await admin.from('cobertura_notificacoes')
        .update({ tentativas: n.tentativas + 1, ultimo_erro: (e as Error).message?.slice(0, 300) }).eq('id', n.id)
      falhas++
    }
  }
  return { enviados, falhas }
}

function montarEmailCobertura(n: any, c: any, u: any, a: any, logos: { cabecalho: string }) {
  const travado = n.evento === 'travado'
  const link = travado ? `${SITE_URL}/pages/remanejamentos.html?cobertura=${c.id}` : `${SITE_URL}/pages/contratos.html`
  const brl = (v: number) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const assunto = travado
    ? `Contrato ${c.numero} travado: aguarda cobertura de orçamento`
    : `Contrato ${c.numero} liberado: o saldo da atividade cobriu o valor`
  const intro = travado
    ? `O contrato passou do valor do TDR e a diferença <strong>não coube no saldo livre</strong> da atividade. Ele fica
       <strong>travado</strong> — sem produtos, pagamentos nem PDF assinado — até o saldo cobrir${n.deficit_usd ? ` os <strong>${usd(n.deficit_usd)}</strong> que faltam` : ''}.
       Ele libera sozinho quando houver saldo (remanejamento de cobertura, economia, encerramento ou redução do contrato).`
    : `O saldo da atividade passou a cobrir o valor do contrato. Ele voltou ao status <strong>${esc(c.status)}</strong> e já pode receber produtos e pagamentos.`
  const corpo = `
    <p style="margin:0 0 10px;font-size:13px;color:#1F2937">Olá, ${esc(u.nome_completo)}.</p>
    <p style="margin:0 0 14px;font-size:13px;color:#1F2937;line-height:1.6">${intro}</p>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 12px;font-size:13px;color:#111827">
      <tr><td style="padding:4px 10px 4px 0;color:#6B7280">Contrato</td><td style="padding:4px 0"><strong>${esc(c.numero)}</strong>${c.fornecedores?.nome ? ' — ' + esc(c.fornecedores.nome) : ''}</td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#6B7280">TDR</td><td style="padding:4px 0">${esc(c.tdrs?.numero || 'sem TDR')}</td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#6B7280">Atividade</td><td style="padding:4px 0">${esc(a?.codigo || '')} ${a?.nome_pt ? '— ' + esc(a.nome_pt) : ''}</td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#6B7280">Valor do contrato</td><td style="padding:4px 0">${brl(c.valor_total_brl)}</td></tr>
    </table>
    <div style="margin:24px 0 8px;text-align:center">
      <a href="${link}" style="display:inline-block;background:#166534;color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">${travado ? 'Ver e pedir cobertura' : 'Abrir contratos'}</a>
    </div>`
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:#1B4332;border-radius:8px 8px 0 0;padding:18px 24px">
    <table width="100%"><tr>
      <td style="vertical-align:middle">${logos.cabecalho}</td>
      <td style="vertical-align:middle;text-align:right">
        <span style="color:#D1FAE5;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Cobertura de contrato</span><br>
        <span style="color:#ffffff;font-size:15px;font-weight:700">Projeto DIMA</span><br>
        <span style="color:#A7F3D0;font-size:11px">UNESCO / SEMA-AC</span>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:28px 24px 20px">${corpo}</td></tr>
  <tr><td style="background:#F9FAFB;border-top:1px solid #E5E7EB;border-radius:0 0 8px 8px;padding:14px 24px;text-align:center">
    <p style="margin:0;font-size:11px;color:#6B7280">Equipe de Gestão – <strong>Projeto DIMA</strong> · UNESCO / SEMA-AC<br>
      Mensagem automática do razão orçamentário.</p>
  </td></tr>
</table></td></tr></table></body></html>`
  return { assunto, html }
}

function montarEmail(n: any, r: any, u: any, itens: any[], etapa: any, logos: { cabecalho: string }) {
  const link = `${SITE_URL}/pages/remanejamentos.html?id=${r.id}`
  const linhasItens = itens
    .sort((a, b) => a.valor_usd - b.valor_usd)
    .map(i => `<tr>
        <td style="padding:4px 10px 4px 0;font-size:13px;color:#111827">${esc(i.atividades?.codigo)} — ${esc(i.atividades?.nome_pt)}</td>
        <td style="padding:4px 0;font-size:13px;text-align:right;white-space:nowrap;color:${i.valor_usd < 0 ? '#B91C1C' : '#166534'}">
          ${i.valor_usd < 0 ? 'cede ' : 'recebe '}${usd(Math.abs(i.valor_usd))}</td></tr>`).join('')
  const titulo: Record<string, string> = {
    analisar:  `Remanejamento ${r.numero} aguarda sua análise`,
    devolvido: `Remanejamento ${r.numero} foi devolvido para você`,
    recusado:  `Remanejamento ${r.numero} foi recusado`,
    efetivado: `Remanejamento ${r.numero} foi efetivado`,
    cancelado: `Remanejamento ${r.numero} foi cancelado`,
  }
  const intro: Record<string, string> = {
    analisar:  `O pedido chegou à sua etapa${etapa ? ` (<strong>${esc(ETAPA_NOME[etapa.papel] || etapa.papel)}${etapa.atividades?.codigo ? ' — ' + esc(etapa.atividades.codigo) : ''}</strong>)` : ''}. A etapa anterior aprovou. Analise e assine com a sua senha.`,
    devolvido: `A etapa seguinte devolveu o pedido para você. Veja o que foi pedido e, se estiver de acordo, aprove de novo ou devolva à etapa anterior.`,
    recusado:  `O pedido foi recusado e encerrado. O saldo reservado foi liberado.`,
    efetivado: `O pedido recebeu todas as assinaturas e foi lançado no razão orçamentário.`,
    cancelado: `O pedido foi cancelado pelo solicitante.`,
  }
  const motivo = n.motivo
    ? `<div style="margin:14px 0;padding:10px 12px;background:#FEF3C7;border-left:4px solid #D97706;font-size:13px;color:#78350F"><strong>Motivo:</strong> ${esc(n.motivo)}</div>`
    : ''
  const corpo = `
    <p style="margin:0 0 10px;font-size:13px;color:#1F2937">Olá, ${esc(u.nome_completo)}.</p>
    <p style="margin:0 0 14px;font-size:13px;color:#1F2937;line-height:1.6">${intro[n.evento]}</p>
    ${motivo}
    <table style="width:100%;border-collapse:collapse;margin:8px 0 12px">${linhasItens}</table>
    <p style="margin:6px 0;font-size:12px;color:#6B7280"><strong>Justificativa:</strong> ${esc(r.justificativa)}</p>
    <div style="margin:24px 0 8px;text-align:center">
      <a href="${link}" style="display:inline-block;background:#166534;color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">Abrir o pedido ${esc(r.numero)}</a>
    </div>`
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:#1B4332;border-radius:8px 8px 0 0;padding:18px 24px">
    <table width="100%"><tr>
      <td style="vertical-align:middle">${logos.cabecalho}</td>
      <td style="vertical-align:middle;text-align:right">
        <span style="color:#D1FAE5;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Remanejamento de recursos</span><br>
        <span style="color:#ffffff;font-size:15px;font-weight:700">Projeto DIMA</span><br>
        <span style="color:#A7F3D0;font-size:11px">UNESCO / SEMA-AC</span>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:28px 24px 20px">${corpo}</td></tr>
  <tr><td style="background:#F9FAFB;border-top:1px solid #E5E7EB;border-radius:0 0 8px 8px;padding:14px 24px;text-align:center">
    <p style="margin:0;font-size:11px;color:#6B7280">Equipe de Gestão – <strong>Projeto DIMA</strong> · UNESCO / SEMA-AC<br>
      Mensagem automática da cadeia de aprovação. A assinatura é feita só dentro da plataforma, com a sua senha.</p>
  </td></tr>
</table></td></tr></table></body></html>`
  return { assunto: titulo[n.evento], html }
}


// ── Pedido de cancelamento de TDR (tdr_cancelamento_notificacoes) ──────
const MOTIVO_CANC: Record<string, string> = {
  licitacao_deserta: 'Licitação deserta (sem propostas)', licitacao_fracassada: 'Licitação fracassada (propostas recusadas)',
  sem_necessidade: 'Objeto deixou de ser necessário', substituido: 'Substituído por outro TDR', outro: 'Outro motivo',
}
const ETAPA_CANC: Record<string, string> = {
  solicitacao: 'Solicitação (coordenação)', responsavel_atividade: 'Responsável da atividade', unesco: 'UNESCO',
}

async function drenarCancelamentos(admin: any, cancelamentoId: string | null) {
  let q = admin.from('tdr_cancelamento_notificacoes')
    .select('id, cancelamento_id, usuario_id, evento, motivo, tentativas')
    .is('enviado_em', null).lt('tentativas', MAX_TENTATIVAS_EMAIL).order('criado_em').limit(50)
  if (cancelamentoId) q = q.eq('cancelamento_id', cancelamentoId)
  const { data: fila, error } = await q
  if (error) throw error
  if (!fila?.length) return { enviados: 0, falhas: 0 }
  const logos = await logosEmail(admin)

  const ids = [...new Set(fila.map((f: any) => f.cancelamento_id))]
  const usuIds = [...new Set(fila.map((f: any) => f.usuario_id))]
  const [{ data: peds }, { data: usus }, { data: etapas }] = await Promise.all([
    admin.from('tdr_cancelamentos').select('id, numero, tdr_numero, tdr_objeto, valor_usd, valor_brl, motivo_tipo, justificativa, status, etapa_atual, versao, atividades(codigo, nome_pt)').in('id', ids),
    admin.from('usuarios').select('id, nome_completo, email, ativo').in('id', usuIds),
    admin.from('tdr_cancelamento_etapas').select('cancelamento_id, versao, ordem, papel').in('cancelamento_id', ids),
  ])
  const pedPor = new Map((peds || []).map((r: any) => [r.id, r]))
  const usuPor = new Map((usus || []).map((u: any) => [u.id, u]))
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: 'fundobrasilonuacre@gmail.com', pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
  })
  let enviados = 0, falhas = 0
  for (const n of fila as any[]) {
    const p: any = pedPor.get(n.cancelamento_id)
    const u: any = usuPor.get(n.usuario_id)
    if (!p || !u?.email || !u.ativo) {
      await admin.from('tdr_cancelamento_notificacoes')
        .update({ tentativas: MAX_TENTATIVAS_EMAIL, ultimo_erro: 'destinatário sem e-mail ou inativo' }).eq('id', n.id)
      falhas++; continue
    }
    const et = (etapas || []).find((e: any) => e.cancelamento_id === p.id && e.versao === p.versao && e.ordem === p.etapa_atual)
    const { assunto, html } = montarEmailCancelamento(n, p, u, et, logos)
    try {
      await transporter.sendMail({ from: REMETENTE, to: u.email, subject: assunto, html })
      await admin.from('tdr_cancelamento_notificacoes').update({ enviado_em: new Date().toISOString(), ultimo_erro: null }).eq('id', n.id)
      enviados++
    } catch (e) {
      await admin.from('tdr_cancelamento_notificacoes')
        .update({ tentativas: n.tentativas + 1, ultimo_erro: (e as Error).message?.slice(0, 300) }).eq('id', n.id)
      falhas++
    }
  }
  return { enviados, falhas }
}

function montarEmailCancelamento(n: any, p: any, u: any, etapa: any, logos: { cabecalho: string }) {
  const link = `${SITE_URL}/pages/remanejamentos.html?can=${p.id}`
  const brl = (v: number) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const titulo: Record<string, string> = {
    analisar:  `Cancelamento do TDR ${p.tdr_numero} (${p.numero}) aguarda sua análise`,
    devolvido: `Cancelamento do TDR ${p.tdr_numero} (${p.numero}) foi devolvido para você`,
    recusado:  `Cancelamento do TDR ${p.tdr_numero} (${p.numero}) foi recusado`,
    efetivado: `TDR ${p.tdr_numero} cancelado (${p.numero}): valor liberado`,
    cancelado: `Pedido ${p.numero} (cancelamento do TDR ${p.tdr_numero}) foi cancelado`,
  }
  const intro: Record<string, string> = {
    analisar:  `O pedido de cancelamento chegou à sua etapa${etapa ? ` (<strong>${esc(ETAPA_CANC[etapa.papel] || etapa.papel)}</strong>)` : ''}. Leia a nota técnica e assine com a sua senha.`,
    devolvido: `A etapa seguinte devolveu o pedido para você. Veja o motivo e, se estiver de acordo, aprove de novo ou devolva à etapa anterior.`,
    recusado:  `O pedido foi recusado e encerrado. O TDR segue como estava.`,
    efetivado: `O pedido recebeu todas as assinaturas. O TDR foi cancelado e o valor dele voltou ao saldo livre da atividade — pode ser usado em um TDR novo ou em remanejamento.`,
    cancelado: `O pedido foi cancelado pelo solicitante. O TDR segue como estava.`,
  }
  const motivo = n.motivo
    ? `<div style="margin:14px 0;padding:10px 12px;background:#FEF3C7;border-left:4px solid #D97706;font-size:13px;color:#78350F"><strong>Motivo:</strong> ${esc(n.motivo)}</div>`
    : ''
  const corpo = `
    <p style="margin:0 0 10px;font-size:13px;color:#1F2937">Olá, ${esc(u.nome_completo)}.</p>
    <p style="margin:0 0 14px;font-size:13px;color:#1F2937;line-height:1.6">${intro[n.evento]}</p>
    ${motivo}
    <table style="width:100%;border-collapse:collapse;margin:8px 0 12px;font-size:13px;color:#111827">
      <tr><td style="padding:4px 10px 4px 0;color:#6B7280">TDR</td><td style="padding:4px 0"><strong>${esc(p.tdr_numero)}</strong>${p.tdr_objeto ? ' — ' + esc(String(p.tdr_objeto).slice(0, 220)) : ''}</td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#6B7280">Atividade</td><td style="padding:4px 0">${esc(p.atividades?.codigo || '')} ${p.atividades?.nome_pt ? '— ' + esc(p.atividades.nome_pt) : ''}</td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#6B7280">Valor ${n.evento === 'efetivado' ? 'liberado' : 'a liberar'}</td><td style="padding:4px 0">${usd(p.valor_usd || 0)} (${brl(p.valor_brl)})</td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#6B7280">Motivo</td><td style="padding:4px 0">${esc(MOTIVO_CANC[p.motivo_tipo] || p.motivo_tipo)}</td></tr>
    </table>
    <p style="margin:6px 0;font-size:12px;color:#6B7280"><strong>Justificativa:</strong> ${esc(p.justificativa)}</p>
    <div style="margin:24px 0 8px;text-align:center">
      <a href="${link}" style="display:inline-block;background:#166534;color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">Abrir o pedido ${esc(p.numero)}</a>
    </div>`
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:#1B4332;border-radius:8px 8px 0 0;padding:18px 24px">
    <table width="100%"><tr>
      <td style="vertical-align:middle">${logos.cabecalho}</td>
      <td style="vertical-align:middle;text-align:right">
        <span style="color:#D1FAE5;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Cancelamento de TDR</span><br>
        <span style="color:#ffffff;font-size:15px;font-weight:700">Projeto DIMA</span><br>
        <span style="color:#A7F3D0;font-size:11px">UNESCO / SEMA-AC</span>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:28px 24px 20px">${corpo}</td></tr>
  <tr><td style="background:#F9FAFB;border-top:1px solid #E5E7EB;border-radius:0 0 8px 8px;padding:14px 24px;text-align:center">
    <p style="margin:0;font-size:11px;color:#6B7280">Equipe de Gestão – <strong>Projeto DIMA</strong> · UNESCO / SEMA-AC<br>
      Mensagem automática da cadeia de aprovação. A assinatura é feita só dentro da plataforma, com a sua senha.</p>
  </td></tr>
</table></td></tr></table></body></html>`
  return { assunto: titulo[n.evento], html }
}
