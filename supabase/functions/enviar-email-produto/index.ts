import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMETENTE  = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const UNESCO_EMAIL = 'projetounesco.acre@gmail.com'
const SITE_URL   = 'https://erissoncameli-prog.github.io/dima-plataforma'

function fmtData(s: string | null): string {
  if (!s) return '—'
  const parts = s.split('T')[0].split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const ASS = `\n\nAtenciosamente,\nEquipe de Gestão – Projeto DIMA\nUNESCO / SEMA-AC\nfundobrasilonuacre@gmail.com`

// ── Template para responsáveis da atividade (evento: entregue) ────────────────
function tplResponsavel(p: any, entrega: any): { assunto: string; corpo: string } {
  const numProd  = p.numero_produto || '—'
  const desc     = p.descricao || '—'
  const cont     = p.contratos?.numero || '—'
  const ativ     = p.contratos?.atividades
  const ativDesc = ativ ? `${ativ.codigo} — ${ativ.nome_pt}` : '—'
  const forn     = p.contratos?.fornecedores?.nome || '—'
  const dtEnt    = fmtData(entrega?.dt_entrega || null)
  const link     = `${SITE_URL}/pages/produtos.html?entrega=${entrega?.id || ''}`

  return {
    assunto: `[DIMA] Produto Nº ${numProd} — Entrega recebida, aguarda avaliação`,
    corpo: `Prezado(a) responsável,

Uma nova entrega foi registrada e aguarda sua avaliação na Plataforma DIMA.

PRODUTO   : Nº ${numProd} — ${desc}
ATIVIDADE : ${ativDesc}
CONTRATO  : ${cont}
FORNECEDOR: ${forn}
ENTREGA   : ${dtEnt}

Acesse a plataforma para avaliar:
${link}${ASS}`,
  }
}

// ── Templates para fornecedor/consultor ──────────────────────────────────────
function tplFornecedor(evento: string, p: any, entrega: any): { assunto: string; corpo: string } | null {
  const numProd  = p.numero_produto || '—'
  const desc     = p.descricao || '—'
  const cont     = p.contratos?.numero || '—'
  const numDesp  = entrega?.despacho_numero || '—'
  const despacho = entrega?.despacho_texto || '—'
  const dtDesp   = fmtData(entrega?.despacho_data || null)
  const pct      = parseFloat(entrega?.pct_entregue || 0)
  const valor    = parseFloat(entrega?.valor_entregue || 0)

  if (evento === 'aprovado') return {
    assunto: `[DIMA] Produto Nº ${numProd} — Aprovado ✓`,
    corpo: `Prezado(a),

Informamos que o Produto Nº ${numProd} foi APROVADO integralmente.

PRODUTO  : ${desc}
CONTRATO : ${cont}
DESPACHO : ${numDesp} (${dtDesp})
VALOR    : ${fmtBRL(valor)}

PARECER TÉCNICO:
${despacho}

O produto será encaminhado para processamento do pagamento pela equipe financeira.${ASS}`,
  }

  if (evento === 'aprovado_parcial') return {
    assunto: `[DIMA] Produto Nº ${numProd} — Aprovação parcial (${pct}%)`,
    corpo: `Prezado(a),

Informamos que o Produto Nº ${numProd} recebeu APROVAÇÃO PARCIAL.

PRODUTO   : ${desc}
CONTRATO  : ${cont}
DESPACHO  : ${numDesp} (${dtDesp})
APROVADO  : ${pct}%
VALOR     : ${fmtBRL(valor)}

PARECER TÉCNICO:
${despacho}

Uma nova entrega poderá ser realizada para o percentual restante. Acesse a Plataforma DIMA para mais informações.${ASS}`,
  }

  if (evento === 'devolvido') return {
    assunto: `[DIMA] Produto Nº ${numProd} — Devolvido para correção`,
    corpo: `Prezado(a),

Informamos que o Produto Nº ${numProd} foi DEVOLVIDO para correção.

PRODUTO  : ${desc}
CONTRATO : ${cont}
DESPACHO : ${numDesp} (${dtDesp})

MOTIVO DA DEVOLUÇÃO:
${despacho}

Por favor, realize os ajustes indicados e registre uma nova entrega na Plataforma DIMA.${ASS}`,
  }

  if (evento === 'pago') return {
    assunto: `[DIMA] Produto Nº ${numProd} — Pagamento confirmado ✓`,
    corpo: `Prezado(a),

Informamos que o pagamento referente ao Produto Nº ${numProd} foi confirmado.

PRODUTO  : ${desc}
CONTRATO : ${cont}

O processo de pagamento foi registrado no módulo financeiro da Plataforma DIMA.${ASS}`,
  }

  return null
}

// ── Template para UNESCO (com anexos) ────────────────────────────────────────
function tplUnesco(evento: string, p: any, entrega: any): { assunto: string; corpo: string } {
  const numProd  = p.numero_produto || '—'
  const desc     = p.descricao || '—'
  const cont     = p.contratos?.numero || '—'
  const ativ     = p.contratos?.atividades
  const ativDesc = ativ ? `${ativ.codigo} — ${ativ.nome_pt}` : '—'
  const forn     = p.contratos?.fornecedores?.nome || '—'
  const numDesp  = entrega?.despacho_numero || '—'
  const despacho = entrega?.despacho_texto || '—'
  const dtDesp   = fmtData(entrega?.despacho_data || null)
  const pct      = parseFloat(entrega?.pct_entregue || 0)
  const valor    = parseFloat(entrega?.valor_entregue || 0)
  const tipo     = evento === 'aprovado' ? 'APROVAÇÃO TOTAL (100%)' : `APROVAÇÃO PARCIAL (${pct}%)`

  return {
    assunto: `[DIMA] Produto Nº ${numProd} aprovado — Encaminhamento de documentos`,
    corpo: `Prezados,

Informamos que o Produto Nº ${numProd} foi avaliado e aprovado na Plataforma DIMA.

PRODUTO   : ${numProd} — ${desc}
ATIVIDADE : ${ativDesc}
CONTRATO  : ${cont}
FORNECEDOR: ${forn}
TIPO      : ${tipo}
VALOR     : ${fmtBRL(valor)}
DESPACHO  : ${numDesp} (${dtDesp})

PARECER TÉCNICO:
${despacho}

Seguem em anexo os documentos da entrega aprovada e a nota técnica de avaliação.${ASS}`,
  }
}

// ── Extrair path do storage a partir da URL pública/assinada ─────────────────
function extrairPathStorage(url: string): string | null {
  const m = url.match(/\/object\/(?:public|sign)\/tdrs-arquivos\/(.+?)(\?.*)?$/)
  return m ? decodeURIComponent(m[1]) : null
}

// ── Baixar arquivo via Supabase Storage (bucket privado) ──────────────────────
// Usa o cliente com service_role para contornar RLS/bucket privado
async function baixarAnexo(supabase: any, url: string, nome: string): Promise<any | null> {
  try {
    const path = extrairPathStorage(url)
    if (!path) return null
    const { data, error } = await supabase.storage.from('tdrs-arquivos').download(path)
    if (error || !data) return null
    const buf = await data.arrayBuffer()
    return { filename: nome, content: Buffer.from(buf) }
  } catch (_) {
    return null
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { produto_id, evento, entrega_id } = await req.json()
    if (!produto_id || !evento) throw new Error('produto_id e evento são obrigatórios')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Buscar produto com contrato, fornecedor e atividade
    const { data: p, error: errP } = await supabase
      .from('contratos_produtos')
      .select(`
        *,
        contratos(
          id, numero, objeto_pt, numero_sei,
          fornecedores(id, nome, email),
          atividades(id, codigo, nome_pt)
        )
      `)
      .eq('id', produto_id)
      .single()

    if (errP || !p) throw new Error('Produto não encontrado')

    // Buscar entrega relevante
    let entrega: any = null
    if (entrega_id) {
      const { data: e } = await supabase
        .from('contratos_produtos_entregas')
        .select('*, documentos:entrega_documentos(arquivo_url, arquivo_nome, tipo_documento)')
        .eq('id', entrega_id)
        .single()
      entrega = e
    } else if (['aprovado', 'aprovado_parcial'].includes(evento)) {
      const { data: e } = await supabase
        .from('contratos_produtos_entregas')
        .select('*, documentos:entrega_documentos(arquivo_url, arquivo_nome, tipo_documento)')
        .eq('produto_id', produto_id)
        .eq('situacao', 'aprovada')
        .order('criado_em', { ascending: false })
        .limit(1)
        .single()
      entrega = e
    }

    // Buscar responsáveis da atividade (para evento entregue)
    // Duas queries separadas — o join implícito usuarios(...) pode falhar silenciosamente
    let responsaveis: any[] = []
    if (evento === 'entregue' && p.contratos?.atividades?.id) {
      const { data: resps } = await supabase
        .from('atividade_responsaveis')
        .select('usuario_id, papel, ativo')
        .eq('atividade_id', p.contratos.atividades.id)
        .eq('ativo', true)

      if (resps && resps.length > 0) {
        const userIds = resps.map((r: any) => r.usuario_id)
        const { data: users } = await supabase
          .from('usuarios')
          .select('id, nome_completo, email')
          .in('id', userIds)

        // Combinar: cada resp recebe o objeto usuario correspondente
        responsaveis = resps.map((r: any) => ({
          ...r,
          usuario: (users || []).find((u: any) => u.id === r.usuario_id) || null,
        }))
      }
    }

    const envios: Array<{ to: string; assunto: string; corpo: string; attachments?: any[] }> = []

    // E-mail #1 — entregue → todos os responsáveis da atividade
    if (evento === 'entregue') {
      for (const r of responsaveis) {
        const email = r.usuario?.email
        if (!email) continue
        const tpl = tplResponsavel(p, entrega)
        envios.push({ to: email, ...tpl })
      }
    }

    // E-mails #2 e #4 — aprovado / aprovado_parcial / devolvido / pago → fornecedor
    if (['aprovado', 'aprovado_parcial', 'devolvido', 'pago'].includes(evento)) {
      const emailForn = p.contratos?.fornecedores?.email
      if (emailForn) {
        const tpl = tplFornecedor(evento, p, entrega)
        if (tpl) envios.push({ to: emailForn, ...tpl })
      }
    }

    // E-mail #3 — aprovado / aprovado_parcial → UNESCO com anexos
    if (['aprovado', 'aprovado_parcial'].includes(evento)) {
      const tpl = tplUnesco(evento, p, entrega)
      const attachments: any[] = []

      // Nota técnica
      if (entrega?.nota_tecnica_url) {
        const anx = await baixarAnexo(supabase, entrega.nota_tecnica_url, entrega.nota_tecnica_nome || 'nota-tecnica.pdf')
        if (anx) attachments.push(anx)
      }

      // Documentos da entrega aprovada (excluindo geo — sem arquivo_url real)
      for (const doc of (entrega?.documentos || [])) {
        if (!doc.arquivo_url) continue
        const anx = await baixarAnexo(supabase, doc.arquivo_url, doc.arquivo_nome || 'documento')
        if (anx) attachments.push(anx)
      }

      envios.push({ to: UNESCO_EMAIL, ...tpl, attachments })
    }

    if (envios.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Nenhum destinatário com e-mail cadastrado.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Envio via Gmail SMTP
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
          attachments: e.attachments,
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
