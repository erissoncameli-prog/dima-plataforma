import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMETENTE           = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL            = 'https://fundobrasilonu-plataforma.vercel.app'
const ASSETS              = `${SITE_URL}/assets`
const COORDENADOR_UNESCO  = Deno.env.get('COORDENADOR_UNESCO_EMAIL') || ''

// ── Wrapper HTML com barra de logos (mesmo padrão de enviar-email-produto) ────
function wrapHtml(corpo: string, linkBtn?: { url: string; label: string }): string {
  const linhas = corpo.split('\n')
  let html = ''
  let emBloco = false

  for (const linha of linhas) {
    const isItem    = /^[A-ZÇÁÉÍÓÚÃÕ\s]{3,15}\s*:/.test(linha)
    const isParecer = linha.startsWith('MOTIVO') || linha.startsWith('DESPACHO')

    if (isParecer) {
      if (emBloco) { html += '</table>'; emBloco = false }
      html += `<p style="margin:4px 0 2px;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em">${linha}</p>`
    } else if (isItem) {
      if (!emBloco) { html += '<table style="width:100%;border-collapse:collapse;margin:12px 0">'; emBloco = true }
      const sep   = linha.indexOf(':')
      const chave = linha.slice(0, sep).trim()
      const valor = linha.slice(sep + 1).trim()
      const valorHtml = valor.match(/^https?:\/\//)
        ? `<a href="${valor}" style="color:#059669;word-break:break-all">${valor}</a>`
        : (valor || '—')
      html += `<tr>
        <td style="padding:4px 10px 4px 0;font-size:12px;font-weight:700;color:#6B7280;white-space:nowrap;vertical-align:top;width:110px">${chave}</td>
        <td style="padding:4px 0;font-size:13px;color:#111827;vertical-align:top">${valorHtml}</td>
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
      </div>
      <p style="margin:8px 0 0;font-size:11px;color:#9CA3AF;text-align:center">
        Se o botão não funcionar, copie e cole este link no navegador:<br>
        <span style="color:#059669;word-break:break-all">${linkBtn.url}</span>
      </p>`
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

async function gerarTokenPrestacao(supabase: any, viajante_id: string, protocolo_id: string): Promise<string> {
  const { data: existing } = await supabase
    .from('prestacao_tokens')
    .select('token')
    .eq('viajante_id', viajante_id)
    .gt('expires_at', new Date().toISOString())
    .order('criado_em', { ascending: false })
    .limit(1)
    .single()

  if (existing?.token) return existing.token

  const token = crypto.randomUUID()
  const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('prestacao_tokens').insert({ token, viajante_id, protocolo_id, expires_at })
  return token
}

function fmtData(s: string | null): string {
  if (!s) return '—'
  const parts = s.split('T')[0].split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

// Retorna "passagens e diárias", "passagens", "diárias" ou "benefícios"
function descSPD(temPassagem: boolean, temDiaria: boolean): string {
  if (temPassagem && temDiaria) return 'passagens e diárias'
  if (temPassagem) return 'passagens'
  if (temDiaria) return 'diárias'
  return 'benefícios'
}

// Lista de documentos obrigatórios na prestação de contas por viajante
function docsObrigatorios(temPassagem: boolean): string {
  const lista = ['  • Relatório de viagem (PDF assinado)']
  if (temPassagem) lista.push('  • Cartões de embarque (ida e volta)')
  return lista.join('\n')
}

const ASS = `\n\nAtenciosamente,\nEquipe de Gestão – Projeto DIMA\nUNESCO / SEMA-AC\nfundobrasilonuacre@gmail.com`

type Tpl = { assunto: string; corpo: string; linkBtn?: { url: string; label: string } }

// ── Templates criador (mensagem detalhada) ────────────────────────────────────
function tplCriador(evento: string, p: any): Tpl | null {
  const num   = p.numero || '—'
  const sei   = p.numero_sei ? ` | SEI: ${p.numero_sei}` : ''
  const dest  = p.destino_principal || '—'
  const saida = fmtData(p.dt_saida)
  const ret   = fmtData(p.dt_retorno)
  const obj   = p.objetivo || '—'

  // Lista de viajantes com o que cada um solicitou
  const viaj = (p.viajantes || [])
    .map((v: any) => {
      const spd = [v.tem_passagem && 'passagem', v.tem_diaria && 'diária'].filter(Boolean).join(' + ')
      return `  • ${v.nome || '—'} (${v.funcao || '—'})${spd ? ` — ${spd}` : ''}`
    })
    .join('\n') || '  —'

  const nomes = (p.viajantes || []).map((v: any) => v.nome?.split(' ')[0] || '').filter(Boolean).join(', ') || '—'

  // Flags do protocolo: o que foi solicitado por pelo menos um viajante
  const algumPassagem = (p.viajantes || []).some((v: any) => v.tem_passagem)
  const algumaDiaria  = (p.viajantes || []).some((v: any) => v.tem_diaria)
  const spd = descSPD(algumPassagem, algumaDiaria)

  if (evento === 'solicitado') return {
    assunto: `[DIMA] Protocolo ${num} | ${nomes} — Solicitação registrada`,
    corpo: `Prezado(a) solicitante,

Sua solicitação de viagem foi registrada com sucesso na Plataforma DIMA.

PROTOCOLO : ${num}${sei}
DESTINO   : ${dest}
PERÍODO   : ${saida} a ${ret}
OBJETIVO  : ${obj}

VIAJANTES E SOLICITAÇÕES:
${viaj}

A solicitação está aguardando análise e aprovação pela coordenação. Você será notificado(a) sobre os próximos passos.${ASS}`,
    linkBtn: { url: `${SITE_URL}/pages/viagens.html`, label: '🔗 Acompanhar na Plataforma' },
  }

  if (evento === 'aprovado') return {
    assunto: `[DIMA] Protocolo ${num} | ${nomes} — APROVADO ✓`,
    corpo: `Prezado(a) solicitante,

A solicitação de viagem foi APROVADA.

PROTOCOLO : ${num}${sei}
DESTINO   : ${dest}
PERÍODO   : ${saida} a ${ret}
OBJETIVO  : ${obj}

VIAJANTES APROVADOS:
${viaj}

Os respectivos SPDs de ${spd} serão processados junto à UNESCO.${ASS}`,
    linkBtn: { url: `${SITE_URL}/pages/viagens.html`, label: '🔗 Ver na Plataforma' },
  }

  if (evento === 'rejeitado') return {
    assunto: `[DIMA] Protocolo ${num} | ${nomes} — Não aprovado`,
    corpo: `Prezado(a) solicitante,

Informamos que o Protocolo ${num} não foi aprovado.

MOTIVO:
${p.rejeitado_motivo || '—'}

Caso necessário, entre em contato com a coordenação do projeto para esclarecimentos ou realize os ajustes indicados e reenvie a solicitação.${ASS}`,
  }

  if (evento === 'em_prestacao') {
    // Documentos exigidos: relatório sempre; embarques apenas para quem tem passagem
    const temAlgumPassagem = algumPassagem
    const docsTxt = temAlgumPassagem
      ? '  • Relatório de viagem (PDF assinado)\n  • Cartões de embarque — somente viajantes com passagem'
      : '  • Relatório de viagem (PDF assinado)'

    return {
      assunto: `[DIMA] Protocolo ${num} | ${nomes} — Fase de prestação de contas`,
      corpo: `Prezado(a) solicitante,

O Protocolo ${num} entrou na fase de prestação de contas.

PROTOCOLO : ${num}${sei}
DESTINO   : ${dest}
PERÍODO   : ${saida} a ${ret}

Cada viajante receberá um e-mail individual com o link e os documentos exigidos conforme o que foi solicitado (${spd}). Os documentos obrigatórios são:
${docsTxt}${ASS}`,
      linkBtn: { url: `${SITE_URL}/pages/viagens.html`, label: '📋 Gerenciar Prestação de Contas' },
    }
  }

  if (evento === 'realizado') return {
    assunto: `[DIMA] Protocolo ${num} | ${nomes} — Concluído ✓`,
    corpo: `Prezado(a) solicitante,

O Protocolo ${num} foi concluído e encerrado com sucesso na Plataforma DIMA.

PROTOCOLO : ${num}${sei}
DESTINO   : ${dest}
PERÍODO   : ${saida} a ${ret}

Os valores referentes a ${spd} foram lançados no módulo financeiro.${ASS}`,
    linkBtn: { url: `${SITE_URL}/pages/viagens.html`, label: '🔗 Ver na Plataforma' },
  }

  if (evento === 'cancelado') return {
    assunto: `[DIMA] Protocolo ${num} | ${nomes} — Cancelado`,
    corpo: `Prezado(a) solicitante,

Informamos que o Protocolo ${num} foi CANCELADO.

PROTOCOLO : ${num}${sei}
DESTINO   : ${dest}
PERÍODO   : ${saida} a ${ret}
OBJETIVO  : ${obj}

DESPACHO DE CANCELAMENTO:
${p.cancelado_motivo || '—'}

Caso tenha dúvidas, entre em contato com a equipe de gestão do projeto.${ASS}`,
  }

  return null
}

// ── Templates viajante (mensagem individual e personalizada) ──────────────────
function tplViajante(evento: string, p: any, v: any, linkPrestacao?: string): Tpl | null {
  const num    = p.numero || '—'
  const dest   = p.destino_principal || '—'
  const saida  = fmtData(p.dt_saida)
  const ret    = fmtData(p.dt_retorno)
  const obj    = p.objetivo || '—'
  const nome   = v.nome || 'Prezado(a)'
  const pass   = !!v.tem_passagem
  const diaria = !!v.tem_diaria
  const spd    = descSPD(pass, diaria)

  if (evento === 'solicitado') return {
    assunto: `[DIMA] Protocolo ${num} | ${nome} — Incluído(a) como viajante`,
    corpo: `Prezado(a) ${nome},

Informamos que você foi incluído(a) em uma solicitação de viagem na Plataforma DIMA.

PROTOCOLO  : ${num}
DESTINO    : ${dest}
PERÍODO    : ${saida} a ${ret}
OBJETIVO   : ${obj}
SOLICITADO : ${spd}

A solicitação está em análise. Você receberá uma nova notificação quando houver aprovação.${ASS}`,
  }

  if (evento === 'aprovado') return {
    assunto: `[DIMA] Protocolo ${num} | ${nome} — Viagem confirmada ✓`,
    corpo: `Prezado(a) ${nome},

Sua participação no Protocolo ${num} foi aprovada.

DESTINO    : ${dest}
PERÍODO    : ${saida} a ${ret}
OBJETIVO   : ${obj}
APROVADO   : ${spd}

${pass && diaria
  ? 'As passagens e as diárias serão processadas pela equipe responsável. Fique atento(a) às orientações da coordenação.'
  : pass
    ? 'As passagens serão processadas pela equipe responsável. Fique atento(a) às orientações da coordenação.'
    : diaria
      ? 'As diárias serão processadas pela equipe responsável.'
      : 'O protocolo será processado pela equipe responsável.'
}${ASS}`,
  }

  if (evento === 'em_prestacao') return {
    assunto: `[DIMA] Protocolo ${num} | ${nome} — Envie sua prestação de contas`,
    corpo: `Prezado(a) ${nome},

O Protocolo ${num} está na fase de prestação de contas.

DESTINO  : ${dest}
PERÍODO  : ${saida} a ${ret}
OBJETIVO : ${obj}

Por favor, envie os documentos obrigatórios referentes à sua ${spd}:
${docsObrigatorios(pass)}

Você pode enviar os documentos sem precisar de login utilizando o botão abaixo.${ASS}`,
    linkBtn: linkPrestacao
      ? { url: linkPrestacao, label: '📤 Enviar Documentos Agora' }
      : { url: `${SITE_URL}/pages/viagens.html`, label: '🔗 Acessar Plataforma DIMA' },
  }

  if (evento === 'realizado') return {
    assunto: `[DIMA] Protocolo ${num} | ${nome} — Encerrado`,
    corpo: `Prezado(a) ${nome},

Informamos que o Protocolo ${num} foi encerrado com sucesso na Plataforma DIMA.

DESTINO  : ${dest}
PERÍODO  : ${saida} a ${ret}
OBJETIVO : ${obj}

Obrigado(a) pela sua participação!${ASS}`,
  }

  if (evento === 'cancelado') return {
    assunto: `[DIMA] Protocolo ${num} | ${nome} — Cancelado`,
    corpo: `Prezado(a) ${nome},

Informamos que o Protocolo ${num} foi CANCELADO.

DESTINO  : ${dest}
PERÍODO  : ${saida} a ${ret}
OBJETIVO : ${obj}

Em caso de dúvidas, entre em contato com a equipe de gestão do projeto.${ASS}`,
  }

  return null
}

// ── Template super_admin: nova solicitação aguardando aprovação ───────────────
function tplSuperAdmin(p: any): Tpl {
  const num   = p.numero || '—'
  const sei   = p.numero_sei ? ` | SEI: ${p.numero_sei}` : ''
  const dest  = p.destino_principal || '—'
  const saida = fmtData(p.dt_saida)
  const ret   = fmtData(p.dt_retorno)
  const obj   = p.objetivo || '—'

  const viaj = (p.viajantes || [])
    .map((v: any) => {
      const spd = [v.tem_passagem && 'passagem', v.tem_diaria && 'diária'].filter(Boolean).join(' + ')
      return `  • ${v.nome || '—'} (${v.funcao || '—'})${spd ? ` — ${spd}` : ''}`
    })
    .join('\n') || '  —'

  return {
    assunto: `[DIMA] ⏳ Protocolo ${num} aguarda sua aprovação`,
    corpo: `Prezado(a) Administrador(a),

Um novo protocolo de viagem foi registrado na Plataforma DIMA e está aguardando sua aprovação.

PROTOCOLO : ${num}${sei}
DESTINO   : ${dest}
PERÍODO   : ${saida} a ${ret}
OBJETIVO  : ${obj}

VIAJANTES:
${viaj}

Acesse a plataforma para analisar e aprovar ou rejeitar a solicitação.${ASS}`,
    linkBtn: { url: `${SITE_URL}/pages/viagens.html`, label: '🔍 Analisar Solicitação' },
  }
}

// ── Template coordenador UNESCO: protocolo aprovado, providenciar SPD ─────────
function tplCoordenadorUnesco(p: any): Tpl {
  const num   = p.numero || '—'
  const sei   = p.numero_sei ? ` | SEI: ${p.numero_sei}` : ''
  const dest  = p.destino_principal || '—'
  const saida = fmtData(p.dt_saida)
  const ret   = fmtData(p.dt_retorno)
  const obj   = p.objetivo || '—'

  const algumPassagem = (p.viajantes || []).some((v: any) => v.tem_passagem)
  const algumaDiaria  = (p.viajantes || []).some((v: any) => v.tem_diaria)
  const spd = descSPD(algumPassagem, algumaDiaria)

  const viaj = (p.viajantes || [])
    .map((v: any) => {
      const itens = [v.tem_passagem && 'passagem', v.tem_diaria && 'diária'].filter(Boolean).join(' + ')
      return `  • ${v.nome || '—'} (${v.funcao || '—'})${itens ? ` — ${itens}` : ''}`
    })
    .join('\n') || '  —'

  return {
    assunto: `[DIMA] ✅ Protocolo ${num} aprovado — Providenciar ${spd}`,
    corpo: `Prezado(a) Coordenador(a),

O Protocolo de viagem abaixo foi aprovado pela gestão do Projeto DIMA. Solicitamos as providências junto à UNESCO para emissão dos SPDs de ${spd}.

PROTOCOLO : ${num}${sei}
DESTINO   : ${dest}
PERÍODO   : ${saida} a ${ret}
OBJETIVO  : ${obj}

VIAJANTES E BENEFÍCIOS APROVADOS:
${viaj}

Em caso de dúvidas ou necessidade de informações complementares, entre em contato com a equipe de gestão.${ASS}`,
    linkBtn: { url: `${SITE_URL}/pages/viagens.html`, label: '📋 Ver Protocolo na Plataforma' },
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { protocolo_id, evento } = await req.json()
    if (!protocolo_id || !evento) throw new Error('protocolo_id e evento são obrigatórios')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Buscar protocolo + viajantes com flags de passagem e diária
    const { data: proto, error: errProto } = await supabase
      .from('viagem_protocolos')
      .select('*, viajantes:viagem_viajantes(id, nome, funcao, email, tem_passagem, tem_diaria)')
      .eq('id', protocolo_id)
      .single()

    if (errProto || !proto) throw new Error('Protocolo não encontrado')

    let criadorEmail: string | null = null
    if (proto.criado_por) {
      const { data: usr } = await supabase.auth.admin.getUserById(proto.criado_por)
      criadorEmail = usr?.user?.email ?? null
    }

    // Coletar e-mails de todos os super_admins ativos
    const superAdminEmails: string[] = []
    if (evento === 'solicitado') {
      const { data: admins } = await supabase
        .from('usuarios')
        .select('id')
        .eq('perfil', 'super_admin')
        .eq('ativo', true)

      for (const a of (admins || [])) {
        const { data: usr } = await supabase.auth.admin.getUserById(a.id)
        const email = usr?.user?.email
        if (email) superAdminEmails.push(email)
      }
    }

    const envios: Array<{ to: string; assunto: string; corpo: string; linkBtn?: { url: string; label: string } }> = []

    // 1. E-mail para o criador do protocolo
    if (criadorEmail) {
      const tpl = tplCriador(evento, proto)
      if (tpl) envios.push({ to: criadorEmail, ...tpl })
    }

    // 2. E-mail para cada viajante individualmente
    for (const v of (proto.viajantes || [])) {
      if (!v.email) continue
      if (v.email === criadorEmail) continue

      let linkPrestacao: string | undefined
      if (evento === 'em_prestacao' && v.id) {
        try {
          const tk = await gerarTokenPrestacao(supabase, v.id, protocolo_id)
          linkPrestacao = `${SITE_URL}/pages/prestacao-publica.html?token=${tk}`
        } catch (_) { /* não crítico */ }
      }

      const tpl = tplViajante(evento, proto, v, linkPrestacao)
      if (tpl) envios.push({ to: v.email, ...tpl })
    }

    // 3. Evento SOLICITADO → notificar super_admins (exceto se já é o criador)
    if (evento === 'solicitado') {
      const tplAdmin = tplSuperAdmin(proto)
      for (const email of superAdminEmails) {
        if (email === criadorEmail) continue // evita duplicata se o admin criou
        envios.push({ to: email, ...tplAdmin })
      }
    }

    // 4. Evento APROVADO → notificar coordenador UNESCO + viajantes (já incluídos acima)
    if (evento === 'aprovado' && COORDENADOR_UNESCO) {
      const tplCoord = tplCoordenadorUnesco(proto)
      // Só adiciona se não for o mesmo e-mail do criador (evita duplicata)
      if (COORDENADOR_UNESCO !== criadorEmail) {
        envios.push({ to: COORDENADOR_UNESCO, ...tplCoord })
      }
    }

    if (envios.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Nenhum destinatário com e-mail cadastrado.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'fundobrasilonuacre@gmail.com',
        pass: Deno.env.get('GMAIL_APP_PASSWORD')!,
      },
    })

    const results = await Promise.allSettled(
      envios.map(e =>
        transporter.sendMail({
          from: REMETENTE,
          to: e.to,
          subject: e.assunto,
          text: e.corpo,
          html: wrapHtml(e.corpo, e.linkBtn),
        })
      )
    )

    const enviados = results.filter(r => r.status === 'fulfilled').length
    const falhas   = results.filter(r => r.status === 'rejected').length
    const erros    = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason?.message || 'erro desconhecido')

    return new Response(
      JSON.stringify({ ok: true, enviados, falhas, total: envios.length, erros }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
