import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'

function fmtData(s: string | null): string {
  if (!s) return '—'
  const parts = s.split('T')[0].split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

// ── Templates criador (mensagem detalhada) ────────────────────────────────────
function tplCriador(evento: string, p: any): { assunto: string; corpo: string } | null {
  const num    = p.numero || '—'
  const sei    = p.numero_sei ? ` | SEI: ${p.numero_sei}` : ''
  const dest   = p.destino_principal || '—'
  const saida  = fmtData(p.dt_saida)
  const ret    = fmtData(p.dt_retorno)
  const obj    = p.objetivo || '—'
  const viaj   = (p.viajantes || [])
    .map((v: any) => `  • ${v.nome || '—'} (${v.funcao || '—'})`)
    .join('\n') || '  —'

  const ass = `\n\nAtenciosamente,\nEquipe de Gestão – Projeto DIMA\nUNESCO / SEMA-AC\nprojetounesco.acre@gmail.com`

  if (evento === 'solicitado') return {
    assunto: `[DIMA] Protocolo ${num} — Solicitação registrada`,
    corpo: `Prezado(a) solicitante,

Sua solicitação de viagem foi registrada com sucesso no sistema DIMA.

PROTOCOLO: ${num}${sei}
DESTINO: ${dest}
PERÍODO: ${saida} a ${ret}
OBJETIVO: ${obj}

VIAJANTES:
${viaj}

A solicitação está aguardando análise e aprovação pela coordenação. Você será notificado(a) sobre os próximos passos.${ass}`,
  }

  if (evento === 'aprovado') return {
    assunto: `[DIMA] Protocolo ${num} — APROVADO ✓`,
    corpo: `Prezado(a) solicitante,

Sua solicitação de viagem foi APROVADA.

PROTOCOLO: ${num}${sei}
DESTINO: ${dest}
PERÍODO: ${saida} a ${ret}
OBJETIVO: ${obj}

VIAJANTES APROVADOS:
${viaj}

Os respectivos SPDs (passagens e/ou diárias) serão processados junto à UNESCO. Acompanhe o andamento pelo sistema.${ass}`,
  }

  if (evento === 'rejeitado') return {
    assunto: `[DIMA] Protocolo ${num} — Não aprovado`,
    corpo: `Prezado(a) solicitante,

Informamos que o Protocolo ${num} não foi aprovado.

MOTIVO: ${p.rejeitado_motivo || '—'}

Caso necessário, entre em contato com a coordenação do projeto para esclarecimentos ou realize os ajustes indicados e reenvie a solicitação.${ass}`,
  }

  if (evento === 'em_prestacao') return {
    assunto: `[DIMA] Protocolo ${num} — Fase de prestação de contas`,
    corpo: `Prezado(a) solicitante,

O Protocolo ${num} entrou na fase de prestação de contas.

DESTINO: ${dest}  |  PERÍODO: ${saida} a ${ret}

Solicitamos que cada viajante acesse o sistema e submeta os documentos obrigatórios:
  • Relatório de viagem (PDF assinado)
  • Cartões de embarque (ida e volta)

Acesse o sistema → Viagens → Protocolo ${num} → "Prestação de contas".${ass}`,
  }

  if (evento === 'realizado') return {
    assunto: `[DIMA] Protocolo ${num} — Concluído ✓`,
    corpo: `Prezado(a) solicitante,

O Protocolo ${num} foi concluído e encerrado com sucesso no sistema DIMA.

DESTINO: ${dest}  |  PERÍODO: ${saida} a ${ret}

Os valores correspondentes foram lançados no módulo financeiro do projeto.${ass}`,
  }

  return null
}

// ── Templates viajante (mensagem simplificada) ────────────────────────────────
function tplViajante(evento: string, p: any, v: any): { assunto: string; corpo: string } | null {
  const num   = p.numero || '—'
  const dest  = p.destino_principal || '—'
  const saida = fmtData(p.dt_saida)
  const ret   = fmtData(p.dt_retorno)
  const nome  = v.nome || 'Prezado(a)'

  const ass = `\n\nAtenciosamente,\nEquipe de Gestão – Projeto DIMA\nUNESCO / SEMA-AC`

  if (evento === 'solicitado') return {
    assunto: `[DIMA] Você foi incluído(a) no Protocolo ${num}`,
    corpo: `Prezado(a) ${nome},

Informamos que você foi incluído(a) em uma solicitação de viagem no sistema DIMA.

PROTOCOLO: ${num}
DESTINO: ${dest}
PERÍODO: ${saida} a ${ret}

A solicitação está em análise. Você receberá uma nova notificação quando houver aprovação.${ass}`,
  }

  if (evento === 'aprovado') return {
    assunto: `[DIMA] Protocolo ${num} aprovado — sua viagem foi confirmada`,
    corpo: `Prezado(a) ${nome},

Sua participação no Protocolo ${num} foi aprovada.

DESTINO: ${dest}
PERÍODO: ${saida} a ${ret}

As passagens e/ou diárias serão processadas pela equipe responsável. Fique atento(a) às orientações da coordenação.${ass}`,
  }

  if (evento === 'em_prestacao') return {
    assunto: `[DIMA] Protocolo ${num} — Envie sua prestação de contas`,
    corpo: `Prezado(a) ${nome},

O Protocolo ${num} está na fase de prestação de contas.

Por favor, acesse o sistema DIMA e envie:
  • Relatório de viagem (PDF assinado)
  • Cartões de embarque (ida e volta)

Acesse: Viagens → Protocolo ${num} → "Prestação de contas".${ass}`,
  }

  if (evento === 'realizado') return {
    assunto: `[DIMA] Protocolo ${num} — Encerrado`,
    corpo: `Prezado(a) ${nome},

Informamos que o Protocolo ${num} foi encerrado com sucesso no sistema DIMA.

Obrigado(a) pela sua participação!${ass}`,
  }

  return null
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

    // Buscar protocolo + viajantes
    const { data: proto, error: errProto } = await supabase
      .from('viagem_protocolos')
      .select('*, viajantes:viagem_viajantes(id, nome, funcao, email)')
      .eq('id', protocolo_id)
      .single()

    if (errProto || !proto) throw new Error('Protocolo não encontrado')

    // Buscar e-mail do criador via auth.admin
    let criadorEmail: string | null = null
    if (proto.criado_por) {
      const { data: usr } = await supabase.auth.admin.getUserById(proto.criado_por)
      criadorEmail = usr?.user?.email ?? null
    }

    // Montar lista de envios
    const envios: Array<{ to: string; assunto: string; corpo: string }> = []

    if (criadorEmail) {
      const tpl = tplCriador(evento, proto)
      if (tpl) envios.push({ to: criadorEmail, ...tpl })
    }

    for (const v of (proto.viajantes || [])) {
      if (!v.email) continue
      if (v.email === criadorEmail) continue  // criador já recebeu msg detalhada
      const tpl = tplViajante(evento, proto, v)
      if (tpl) envios.push({ to: v.email, ...tpl })
    }

    if (envios.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Nenhum destinatário com e-mail cadastrado.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Enviar via Gmail SMTP
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'projetounesco.acre@gmail.com',
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
