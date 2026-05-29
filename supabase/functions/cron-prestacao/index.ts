import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL = 'https://erissoncameli-prog.github.io/dima-plataforma'

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

function diasEntre(dtRetorno: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const retorno = new Date(dtRetorno)
  retorno.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - retorno.getTime()) / (1000 * 60 * 60 * 24))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Buscar viajantes com prestação pendente
    const { data: todos, error } = await supabase
      .from('viagem_viajantes')
      .select(`
        id, nome, email, relatorio_url, alerta_prestacao_em, bloqueio_prestacao_em,
        protocolo:viagem_protocolos(id, numero, dt_retorno, situacao)
      `)
      .is('relatorio_url', null)
      .not('email', 'is', null)

    if (error) throw error

    // Filtrar apenas protocolos em fase de prestação ou realizados
    const viajantes = (todos || []).filter((v: any) =>
      ['em_prestacao', 'realizado'].includes(v.protocolo?.situacao) &&
      !!v.protocolo?.dt_retorno
    )

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'fundobrasilonuacre@gmail.com',
        pass: Deno.env.get('GMAIL_APP_PASSWORD')!,
      },
    })

    let alertas = 0, bloqueios = 0

    for (const v of viajantes) {
      const proto = v.protocolo as any
      const dias = diasEntre(proto.dt_retorno)
      const dtLimite = new Date(proto.dt_retorno)
      dtLimite.setDate(dtLimite.getDate() + 30)
      const dtLimiteFmt = fmtData(dtLimite.toISOString())

      // Alerta: atingiu 30 dias e ainda não alertado
      if (dias >= 30 && !v.alerta_prestacao_em) {
        let linkAlerta = ''
        try {
          const tk = await gerarTokenPrestacao(supabase, v.id, proto.id)
          linkAlerta = `${SITE_URL}/pages/prestacao-publica.html?token=${tk}`
        } catch (_) { /* não crítico */ }

        try {
          await transporter.sendMail({
            from: REMETENTE,
            to: v.email,
            subject: `[DIMA] ⚠ Prazo vencido — Prestação de contas obrigatória — ${proto.numero}`,
            text: `Prezado(a) ${v.nome || 'beneficiário(a)'},

O prazo de 30 dias para submissão da prestação de contas do Protocolo ${proto.numero} venceu em ${dtLimiteFmt}.

Você ainda não enviou:
  • Relatório de Viagem (PDF assinado)
  • Cartões de Embarque (ida e volta)

⚠ ATENÇÃO: Caso não regularize sua situação em breve, você ficará IMPEDIDO(A) de participar de novas viagens pelo Projeto DIMA.

${linkAlerta
  ? `➡ ENVIAR DOCUMENTOS AGORA (sem precisar de login):\n${linkAlerta}\n\nOu acesse: Sistema DIMA → Viagens → Protocolo ${proto.numero} → "Prestação de contas".`
  : `Para regularizar, acesse: Sistema DIMA → Viagens → Protocolo ${proto.numero} → "Prestação de contas".`
}

Atenciosamente,
Equipe de Gestão – Projeto DIMA
UNESCO / SEMA-AC
fundobrasilonuacre@gmail.com`,
          })
          alertas++
        } catch (_) { /* segue para o próximo */ }

        await supabase
          .from('viagem_viajantes')
          .update({ alerta_prestacao_em: new Date().toISOString() })
          .eq('id', v.id)
      }

      // Bloqueio: passou de 30 dias e ainda não bloqueado formalmente
      if (dias > 30 && !v.bloqueio_prestacao_em) {
        let linkBloqueio = ''
        try {
          const tk = await gerarTokenPrestacao(supabase, v.id, proto.id)
          linkBloqueio = `${SITE_URL}/pages/prestacao-publica.html?token=${tk}`
        } catch (_) { /* não crítico */ }

        try {
          await transporter.sendMail({
            from: REMETENTE,
            to: v.email,
            subject: `[DIMA] 🚫 Bloqueio ativado — Prestação de contas pendente — ${proto.numero}`,
            text: `Prezado(a) ${v.nome || 'beneficiário(a)'},

Informamos que você está BLOQUEADO(A) de participar de novas viagens pelo Projeto DIMA.

MOTIVO: Não foram submetidos os documentos de prestação de contas do Protocolo ${proto.numero} (data de retorno: ${fmtData(proto.dt_retorno)}), ultrapassando o prazo de 30 dias estabelecido.

Para regularizar e remover o bloqueio:
${linkBloqueio
  ? `➡ ENVIAR DOCUMENTOS AGORA (sem precisar de login):\n${linkBloqueio}\n\nO bloqueio será removido automaticamente após a submissão.`
  : `  1. Acesse o Sistema DIMA → Viagens → Protocolo ${proto.numero}\n  2. Clique em "Prestação de contas"\n  3. Envie o Relatório de Viagem (PDF assinado) e os Cartões de Embarque\n  4. O bloqueio será removido automaticamente após a submissão`
}

Atenciosamente,
Equipe de Gestão – Projeto DIMA
UNESCO / SEMA-AC
fundobrasilonuacre@gmail.com`,
          })
          bloqueios++
        } catch (_) { /* segue para o próximo */ }

        await supabase
          .from('viagem_viajantes')
          .update({ bloqueio_prestacao_em: new Date().toISOString() })
          .eq('id', v.id)
      }
    }

    return new Response(
      JSON.stringify({ ok: true, verificados: viajantes.length, alertas, bloqueios }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
