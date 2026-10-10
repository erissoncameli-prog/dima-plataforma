import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'
import { Buffer } from 'node:buffer'
import { logosEmail } from '../_shared/logos-email.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMETENTE  = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const UNESCO_EMAILS = ['projetounesco.acre@gmail.com', 'm.lang@unesco.org']
const SITE_URL   = 'https://fundobrasilonu-plataforma.vercel.app'

function wrapHtml(corpo: string, logos: { cabecalho: string; faixa: string }): string {
  const linhas = corpo.split('\n')
  let html = ''
  let emBloco = false

  for (const linha of linhas) {
    const isItem = /^[A-ZÇÁÉÍÓÚÃÕ\s]{3,15}\s*:/.test(linha)
    const isParecer = linha.startsWith('PARECER') || linha.startsWith('MOTIVO')

    if (isParecer) {
      if (emBloco) { html += '</table>'; emBloco = false }
      html += `<p style="margin:4px 0 2px;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.04em">${linha}</p>`
    } else if (isItem) {
      if (!emBloco) { html += '<table style="width:100%;border-collapse:collapse;margin:12px 0">'; emBloco = true }
      const sep = linha.indexOf(':')
      const chave = linha.slice(0, sep).trim()
      const valor = linha.slice(sep + 1).trim()
      html += `<tr>
        <td style="padding:4px 10px 4px 0;font-size:12px;font-weight:700;color:#6B7280;white-space:nowrap;vertical-align:top;width:110px">${chave}</td>
        <td style="padding:4px 0;font-size:13px;color:#111827;vertical-align:top">${valor || '—'}</td>
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

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:#1B4332;border-radius:8px 8px 0 0;padding:18px 24px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:middle">
          ${logos.cabecalho}
        </td>
        <td style="vertical-align:middle;text-align:right">
          <span style="color:#D1FAE5;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Plataforma de Gestão</span><br>
          <span style="color:#ffffff;font-size:15px;font-weight:700">Projeto DIMA</span><br>
          <span style="color:#A7F3D0;font-size:11px">UNESCO / SEMA-AC</span>
        </td>
      </tr>
    </table>
  </td></tr>
  ${logos.faixa ? `<tr><td style="background:#ffffff;padding:12px 24px;border-bottom:1px solid #E5E7EB">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        ${logos.faixa}
      </tr>
    </table>
  </td></tr>` : ''}
  <tr><td style="background:#ffffff;padding:28px 24px 20px">
    ${html}
  </td></tr>
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

function fmtData(s: string | null): string {
  if (!s) return '—'
  const parts = s.split('T')[0].split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const ASS = `\n\nAtenciosamente,\nEquipe de Gestão – Projeto DIMA\nUNESCO / SEMA-AC\nfundobrasilonuacre@gmail.com`

function tplResponsavelAprovado(evento: string, p: any, entrega: any): { assunto: string; corpo: string } {
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
  const parcial  = evento === 'aprovado_parcial'

  return {
    assunto: parcial
      ? `[DIMA | ${forn}] Produto Nº ${numProd} — Aprovação parcial registrada (${pct}%)`
      : `[DIMA | ${forn}] Produto Nº ${numProd} — Aprovação registrada ✓`,
    corpo: `Prezado(a) responsável,\n\n${parcial
      ? `A aprovação parcial (${pct}%) do Produto Nº ${numProd} foi registrada com sucesso na Plataforma DIMA.`
      : `A aprovação integral do Produto Nº ${numProd} foi registrada com sucesso na Plataforma DIMA.`}\n\nPRODUTO   : Nº ${numProd} — ${desc}\nATIVIDADE : ${ativDesc}\nCONTRATO  : ${cont}\nFORNECEDOR: ${forn}\nDESPACHO  : ${numDesp} (${dtDesp})\nVALOR     : ${valor > 0 ? fmtBRL(valor) : '—'}\n\nPARECER TÉCNICO:\n${despacho}\n\nO fornecedor foi notificado e o processo foi encaminhado para pagamento.${ASS}`,
  }
}

function tplResponsavelPago(p: any, entrega: any): { assunto: string; corpo: string } {
  const numProd  = p.numero_produto || '—'
  const desc     = p.descricao || '—'
  const cont     = p.contratos?.numero || '—'
  const ativ     = p.contratos?.atividades
  const ativDesc = ativ ? `${ativ.codigo} — ${ativ.nome_pt}` : '—'
  const forn     = p.contratos?.fornecedores?.nome || '—'
  const valor    = parseFloat(entrega?.valor_entregue || 0)

  return {
    assunto: `[DIMA | ${forn}] Produto Nº ${numProd} — Pagamento confirmado ✓`,
    corpo: `Prezado(a) responsável,\n\nInformamos que o pagamento referente ao Produto Nº ${numProd} foi confirmado e registrado no módulo financeiro da Plataforma DIMA.\n\nPRODUTO   : Nº ${numProd} — ${desc}\nATIVIDADE : ${ativDesc}\nCONTRATO  : ${cont}\nFORNECEDOR: ${forn}\nVALOR PAGO: ${valor > 0 ? fmtBRL(valor) : '—'}${ASS}`,
  }
}

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
    assunto: `[DIMA | ${forn}] Produto Nº ${numProd} — Entrega recebida, aguarda avaliação`,
    corpo: `Prezado(a) responsável,\n\nUma nova entrega foi registrada e aguarda sua avaliação na Plataforma DIMA.\n\nPRODUTO   : Nº ${numProd} — ${desc}\nATIVIDADE : ${ativDesc}\nCONTRATO  : ${cont}\nFORNECEDOR: ${forn}\nENTREGA   : ${dtEnt}\n\nAcesse a plataforma para avaliar:\n${link}${ASS}`,
  }
}

function tplFornecedor(evento: string, p: any, entrega: any): { assunto: string; corpo: string } | null {
  const numProd  = p.numero_produto || '—'
  const desc     = p.descricao || '—'
  const cont     = p.contratos?.numero || '—'
  const forn     = p.contratos?.fornecedores?.nome || '—'
  const numDesp  = entrega?.despacho_numero || '—'
  const despacho = entrega?.despacho_texto || '—'
  const dtDesp   = fmtData(entrega?.despacho_data || null)
  const pct      = parseFloat(entrega?.pct_entregue || 0)
  const valor    = parseFloat(entrega?.valor_entregue || 0)

  if (evento === 'aprovado') return {
    assunto: `[DIMA | ${forn}] Produto Nº ${numProd} — Aprovado ✓`,
    corpo: `Prezado(a),\n\nInformamos que o Produto Nº ${numProd} foi APROVADO integralmente.\n\nPRODUTO  : ${desc}\nCONTRATO : ${cont}\nDESPACHO : ${numDesp} (${dtDesp})\nVALOR    : ${fmtBRL(valor)}\n\nPARECER TÉCNICO:\n${despacho}\n\nO produto será encaminhado para processamento do pagamento pela equipe financeira.${ASS}`,
  }

  if (evento === 'aprovado_parcial') return {
    assunto: `[DIMA | ${forn}] Produto Nº ${numProd} — Aprovação parcial (${pct}%)`,
    corpo: `Prezado(a),\n\nInformamos que o Produto Nº ${numProd} recebeu APROVAÇÃO PARCIAL.\n\nPRODUTO   : ${desc}\nCONTRATO  : ${cont}\nDESPACHO  : ${numDesp} (${dtDesp})\nAPROVADO  : ${pct}%\nVALOR     : ${fmtBRL(valor)}\n\nPARECER TÉCNICO:\n${despacho}\n\nUma nova entrega poderá ser realizada para o percentual restante. Acesse a Plataforma DIMA para mais informações.${ASS}`,
  }

  if (evento === 'devolvido') return {
    assunto: `[DIMA | ${forn}] Produto Nº ${numProd} — Devolvido para correção`,
    corpo: `Prezado(a),\n\nInformamos que o Produto Nº ${numProd} foi DEVOLVIDO para correção.\n\nPRODUTO  : ${desc}\nCONTRATO : ${cont}\nDESPACHO : ${numDesp} (${dtDesp})\n\nMOTIVO DA DEVOLUÇÃO:\n${despacho}\n\nPor favor, realize os ajustes indicados e registre uma nova entrega na Plataforma DIMA.${ASS}`,
  }

  if (evento === 'pago') return {
    assunto: `[DIMA | ${forn}] Produto Nº ${numProd} — Pagamento confirmado ✓`,
    corpo: `Prezado(a),\n\nInformamos que o pagamento referente ao Produto Nº ${numProd} foi confirmado.\n\nPRODUTO  : ${desc}\nCONTRATO : ${cont}\n\nO processo de pagamento foi registrado no módulo financeiro da Plataforma DIMA.${ASS}`,
  }

  return null
}

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
    assunto: `[DIMA | ${forn}] Produto Nº ${numProd} aprovado — Encaminhamento de documentos`,
    corpo: `Prezados,\n\nInformamos que o Produto Nº ${numProd} foi avaliado e aprovado na Plataforma DIMA.\n\nPRODUTO   : ${numProd} — ${desc}\nATIVIDADE : ${ativDesc}\nCONTRATO  : ${cont}\nFORNECEDOR: ${forn}\nTIPO      : ${tipo}\nVALOR     : ${fmtBRL(valor)}\nDESPACHO  : ${numDesp} (${dtDesp})\n\nPARECER TÉCNICO:\n${despacho}\n\nSeguem em anexo os documentos da entrega aprovada e a nota técnica de avaliação.${ASS}`,
  }
}

function extrairPathStorage(url: string): { bucket: string; path: string } | null {
  const m = url.match(/\/object\/(?:public|sign)\/(entregas-docs|tdrs-arquivos)\/(.+?)(\?.*)?$/)
  if (!m) return null
  return { bucket: m[1], path: decodeURIComponent(m[2]) }
}

async function baixarAnexo(supabase: any, url: string, nome: string): Promise<any | null> {
  try {
    const parsed = extrairPathStorage(url)
    if (!parsed) return null
    const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path)
    if (error || !data) return null
    const buf = await data.arrayBuffer()
    return { filename: nome, content: Buffer.from(buf) }
  } catch (_) {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { produto_id, evento, entrega_id } = await req.json()
    if (!produto_id || !evento) throw new Error('produto_id e evento são obrigatórios')

    const EVENTOS_VALIDOS = ['entregue', 'aprovado', 'aprovado_parcial', 'devolvido', 'pago']
    if (!EVENTOS_VALIDOS.includes(evento)) throw new Error(`evento inválido: ${evento}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

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

    let entrega: any = null
    if (entrega_id) {
      const { data: e } = await supabase
        .from('contratos_produtos_entregas')
        .select('*, documentos:entrega_documentos(arquivo_url, arquivo_nome, tipo_documento)')
        .eq('id', entrega_id)
        .single()
      entrega = e
    } else if (['aprovado', 'aprovado_parcial', 'pago'].includes(evento)) {
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

    // O corpo do e-mail deve refletir sempre o percentual REAL aprovado na entrega,
    // não apenas o `evento` recebido — evita divergência caso o percentual gravado
    // não corresponda ao rótulo total/parcial informado pelo chamador.
    let eventoEfetivo = evento
    if (['aprovado', 'aprovado_parcial'].includes(evento) && entrega) {
      const pctEntrega = parseFloat(entrega.pct_entregue ?? 100)
      eventoEfetivo = pctEntrega >= 100 ? 'aprovado' : 'aprovado_parcial'
    }

    let responsaveis: any[] = []
    if (['entregue', 'aprovado', 'aprovado_parcial', 'pago'].includes(evento) && p.contratos?.atividades?.id) {
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

        responsaveis = resps.map((r: any) => ({
          ...r,
          usuario: (users || []).find((u: any) => u.id === r.usuario_id) || null,
        }))
      }
    }

    const envios: Array<{ to: string; assunto: string; corpo: string; attachments?: any[] }> = []

    const montarAnexos = async () => {
      const attachments: any[] = []
      if (entrega?.nota_tecnica_url) {
        const anx = await baixarAnexo(supabase, entrega.nota_tecnica_url, entrega.nota_tecnica_nome || 'nota-tecnica.pdf')
        if (anx) attachments.push(anx)
      }
      for (const doc of (entrega?.documentos || [])) {
        if (!doc.arquivo_url) continue
        const anx = await baixarAnexo(supabase, doc.arquivo_url, doc.arquivo_nome || 'documento')
        if (anx) attachments.push(anx)
      }
      return attachments
    }

    if (evento === 'entregue') {
      for (const r of responsaveis) {
        const email = r.usuario?.email
        if (!email) continue
        envios.push({ to: email, ...tplResponsavel(p, entrega) })
      }
    }

    if (['aprovado', 'aprovado_parcial'].includes(evento)) {
      for (const r of responsaveis) {
        const email = r.usuario?.email
        if (!email) continue
        envios.push({ to: email, ...tplResponsavelAprovado(eventoEfetivo, p, entrega) })
      }
    }

    if (evento === 'pago') {
      for (const r of responsaveis) {
        const email = r.usuario?.email
        if (!email) continue
        envios.push({ to: email, ...tplResponsavelPago(p, entrega) })
      }
    }

    if (['aprovado', 'aprovado_parcial', 'devolvido', 'pago'].includes(evento)) {
      const emailForn = p.contratos?.fornecedores?.email
      if (emailForn) {
        const tpl = tplFornecedor(eventoEfetivo, p, entrega)
        if (tpl) envios.push({ to: emailForn, ...tpl })
      }
    }

    if (['aprovado', 'aprovado_parcial'].includes(evento)) {
      const tpl = tplUnesco(eventoEfetivo, p, entrega)
      const attachments = await montarAnexos()
      for (const emailUnesco of UNESCO_EMAILS) {
        envios.push({ to: emailUnesco, ...tpl, attachments })
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

    const logos = await logosEmail(supabase)
    const results = await Promise.allSettled(
      envios.map(e =>
        transporter.sendMail({
          from: REMETENTE,
          to: e.to,
          subject: e.assunto,
          text: e.corpo,
          html: wrapHtml(e.corpo, logos),
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
