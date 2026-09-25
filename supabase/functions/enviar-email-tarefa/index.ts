// enviar-email-tarefa — notifica responsáveis/observadores/criador internos e,
// opcionalmente, o fornecedor vinculado (parte externa). Reaproveita o wrapper
// visual de enviar-email-viagem. verify_jwt = true (chamada pelo frontend após a RPC).
// Eventos: atribuicao | prazo_alterado | concluida | comentario | subtarefa.
// "subtarefa" avisa o responsável da subtarefa; se for fornecedor, envia os
// anexos da subtarefa e Reply-To com o token da subtarefa (resposta → comentário).
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL  = 'https://fundobrasilonu-plataforma.vercel.app'
const ASSETS    = `${SITE_URL}/assets`

const PRIORIDADE_LABEL: Record<string, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
}
const fmtData = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function wrapHtml(corpo: string, linkBtn?: { url: string; label: string }): string {
  const linhas = corpo.split('\n')
  let html = '', emBloco = false
  for (const linha of linhas) {
    const isItem = /^[A-ZÇÁÉÍÓÚÃÕ\s]{3,16}\s*:/.test(linha)
    if (isItem) {
      if (!emBloco) { html += '<table style="width:100%;border-collapse:collapse;margin:12px 0">'; emBloco = true }
      const sep = linha.indexOf(':')
      const chave = linha.slice(0, sep).trim(), valor = linha.slice(sep + 1).trim()
      html += `<tr>
        <td style="padding:4px 10px 4px 0;font-size:12px;font-weight:700;color:#6B7280;white-space:nowrap;vertical-align:top;width:120px">${chave}</td>
        <td style="padding:4px 0;font-size:13px;color:#111827;vertical-align:top">${valor || '—'}</td>
      </tr>`
    } else {
      if (emBloco) { html += '</table>'; emBloco = false }
      html += linha.trim() === ''
        ? '<br>'
        : `<p style="margin:4px 0;font-size:13px;color:#1F2937;line-height:1.6">${linha}</p>`
    }
  }
  if (emBloco) html += '</table>'
  if (linkBtn) {
    html += `<div style="margin:24px 0 8px;text-align:center">
        <a href="${linkBtn.url}" style="display:inline-block;background:#166534;color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">${linkBtn.label}</a>
      </div>`
  }
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:#1B4332;border-radius:8px 8px 0 0;padding:18px 24px">
    <table width="100%"><tr>
      <td style="vertical-align:middle"><img src="${ASSETS}/logo-resiliencia.png" alt="Projeto DIMA" height="52" style="display:block;border:0"></td>
      <td style="vertical-align:middle;text-align:right">
        <span style="color:#D1FAE5;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Painel de Tarefas</span><br>
        <span style="color:#ffffff;font-size:15px;font-weight:700">Projeto DIMA</span><br>
        <span style="color:#A7F3D0;font-size:11px">UNESCO / SEMA-AC</span>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:12px 24px;border-bottom:1px solid #E5E7EB">
    <table width="100%"><tr>
      <td align="center" style="padding:0 6px"><img src="${ASSETS}/1695134345-1-horizontal-verde-solo.png" alt="SEMA/AC" height="32" style="display:block;border:0"></td>
      <td align="center" style="padding:0 6px"><img src="${ASSETS}/UNESCO_logo_hor_blue_transparent.png.png" alt="UNESCO" height="28" style="display:block;border:0"></td>
      <td align="center" style="padding:0 6px"><img src="${ASSETS}/UNCT_Logo_RGB_Brazil_Portuguese_horiz_color.png" alt="ONU Brasil" height="28" style="display:block;border:0"></td>
      <td align="center" style="padding:0 6px"><img src="${ASSETS}/logo-fundo-brasil-onu.png" alt="Fundo Brasil-ONU" height="32" style="display:block;border:0"></td>
      <td align="center" style="padding:0 6px"><img src="${ASSETS}/logo-consorcio-amazonia.png" alt="Consórcio Amazônia" height="36" style="display:block;border:0"></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:28px 24px 20px">${html}</td></tr>
  <tr><td style="background:#F9FAFB;border-top:1px solid #E5E7EB;border-radius:0 0 8px 8px;padding:14px 24px;text-align:center">
    <p style="margin:0;font-size:11px;color:#6B7280">Equipe de Gestão – <strong>Projeto DIMA</strong> · UNESCO / SEMA-AC<br>
      <a href="mailto:fundobrasilonuacre@gmail.com" style="color:#059669;text-decoration:none">fundobrasilonuacre@gmail.com</a></p>
  </td></tr>
</table></td></tr></table></body></html>`
}

// caminho no bucket a partir da URL "portadora" (/object/public/tarefas-anexos/<path>)
const pathAnexo = (url: string) => {
  const rel = (url || '').split('/tarefas-anexos/')[1]
  return rel ? decodeURIComponent(rel.split('?')[0]) : null
}
const LIMITE_ANEXOS = 15 * 1024 * 1024 // Gmail aceita 25 MB; margem p/ base64

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const {
      tarefa_id, evento = 'atribuicao', autor_id = null,
      destinatarios = null,   // uuid[] opcional: restringe os destinatários internos
      checklist_id = null,    // evento 'subtarefa'
      comentario_id = null,   // evento 'comentario'
    } = await req.json()
    if (!tarefa_id) throw new Error('tarefa_id obrigatório')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // O chamador precisa enxergar a tarefa (e editá-la, para disparar e-mail de
    // subtarefa — que pode levar anexos a um fornecedor externo).
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    })
    const { data: pode } = await userClient.rpc(
      evento === 'subtarefa' ? 'fn_tarefa_pode_editar' : 'fn_pode_ver_tarefa', { p_id: tarefa_id })
    if (pode !== true) throw new Error('sem acesso a esta tarefa')

    const { data: t, error: eT } = await supabase
      .from('tarefas')
      .select('id,codigo,titulo,descricao,status,prioridade,dt_prazo,criado_por,fornecedor_id,notificar_fornecedor,' +
              'fornecedor:fornecedores(nome,email,responsavel_nome),' +
              'criador:usuarios(nome_completo,email)')
      .eq('id', tarefa_id).single()
    if (eT || !t) throw new Error('tarefa não encontrada')

    const { data: parts } = await supabase
      .from('tarefa_participantes')
      .select('papel, usuario_id, usuario:usuarios(nome_completo,email)')
      .eq('tarefa_id', tarefa_id)
    const responsaveis = (parts || []).filter((p: any) => p.papel === 'responsavel')
    const observadores = (parts || []).filter((p: any) => p.papel === 'observador')

    // destinatários internos (dedup por e-mail, excluindo quem originou a ação)
    const filtro: string[] | null = Array.isArray(destinatarios) ? destinatarios : null
    const rec = new Map<string, { nome: string; papel: string }>()
    const add = (id: string | null, email?: string, nome?: string, papel = '') => {
      if (!email || id === autor_id) return
      if (filtro && (!id || !filtro.includes(id))) return
      if (!rec.has(email)) rec.set(email, { nome: nome || '', papel })
    }
    const addP = (p: any) => add(p.usuario_id, p.usuario?.email, p.usuario?.nome_completo, p.papel)

    // subtarefa (evento 'subtarefa')
    let sub: any = null
    if (evento === 'subtarefa') {
      if (!checklist_id) throw new Error('checklist_id obrigatório')
      const { data } = await supabase.from('tarefa_checklist')
        .select('id,tarefa_id,descricao,dt_prazo,concluida,responsavel_usuario_id,responsavel_fornecedor_id,' +
                'usuario:usuarios!tarefa_checklist_responsavel_usuario_id_fkey(nome_completo,email),' +
                'fornecedor:fornecedores!tarefa_checklist_responsavel_fornecedor_id_fkey(nome,email,responsavel_nome)')
        .eq('id', checklist_id).maybeSingle()
      if (!data || data.tarefa_id !== tarefa_id) throw new Error('subtarefa não encontrada')
      sub = data
    }

    if (evento === 'concluida') {
      add(t.criado_por, t.criador?.email, t.criador?.nome_completo)
      observadores.forEach(addP)
    } else if (evento === 'comentario') {
      add(t.criado_por, t.criador?.email, t.criador?.nome_completo)
      responsaveis.forEach(addP)
      observadores.forEach(addP)
    } else if (evento === 'prazo_alterado') {
      responsaveis.forEach(addP)
      observadores.forEach(addP)
    } else if (evento === 'subtarefa') {
      if (sub.responsavel_usuario_id) {
        const p = (parts || []).find((x: any) => x.usuario_id === sub.responsavel_usuario_id)
        add(sub.responsavel_usuario_id, sub.usuario?.email, sub.usuario?.nome_completo, p?.papel || 'observador')
      }
    } else {
      // atribuicao: responsáveis e observadores (texto próprio para cada papel)
      responsaveis.forEach(addP)
      observadores.forEach(addP)
    }

    const prazoTxt = fmtData(t.dt_prazo)
    const prioTxt  = PRIORIDADE_LABEL[t.prioridade] || t.prioridade
    const linkApp  = { url: `${SITE_URL}/pages/tarefas.html?tarefa=${t.id}`, label: 'Abrir no painel' }

    // comentário (o indicado, ou o último) + nomes dos anexos ligados a ele
    let comentTxt = '', comentAnexos: string[] = []
    if (evento === 'comentario') {
      let q = supabase.from('tarefa_comentarios').select('id,corpo').eq('tarefa_id', tarefa_id)
      q = comentario_id ? q.eq('id', comentario_id) : q.order('criado_em', { ascending: false }).limit(1)
      const { data: c } = await q.maybeSingle()
      comentTxt = c?.corpo || ''
      if (c?.id) {
        const { data: ax } = await supabase.from('tarefa_anexos').select('arquivo_nome').eq('comentario_id', c.id)
        comentAnexos = (ax || []).map((a: any) => a.arquivo_nome)
      }
    }

    const assunto: Record<string, string> = {
      atribuicao:     `Nova tarefa ${t.codigo}: ${t.titulo}`,
      prazo_alterado: `Prazo alterado — ${t.codigo}: ${t.titulo}`,
      concluida:      `Tarefa concluída — ${t.codigo}: ${t.titulo}`,
      comentario:     `Novo comentário — ${t.codigo}: ${t.titulo}`,
      subtarefa:      `Subtarefa atribuída — ${t.codigo}: ${t.titulo}`,
    }
    const abertura = (papel: string): string => {
      if (evento === 'atribuicao' && papel === 'observador')
        return 'Você foi incluído(a) como <b>observador(a)</b> de uma tarefa no painel do Projeto DIMA. ' +
               'Você receberá os avisos de comentários, mudança de prazo e conclusão para acompanhar o andamento.'
      if (evento === 'subtarefa')
        return 'Uma subtarefa foi atribuída a você no painel do Projeto DIMA.' +
               (papel === 'observador' ? ' Você também passa a acompanhar a tarefa principal como observador(a).' : '')
      return ({
        atribuicao:     'Uma tarefa foi atribuída a você no painel do Projeto DIMA.',
        prazo_alterado: 'O prazo de uma tarefa que você acompanha mudou.',
        concluida:      'Uma tarefa que você acompanha foi concluída.',
        comentario:     'Há um novo comentário em uma tarefa que você acompanha.',
      } as Record<string, string>)[evento] || 'Atualização em uma tarefa do painel do Projeto DIMA.'
    }

    const corpoInterno = (papel: string) =>
      `${abertura(papel)}\n\n` +
      `TAREFA: ${esc(t.codigo)} — ${esc(t.titulo)}\n` +
      (sub ? `SUBTAREFA: ${esc(sub.descricao)}\n` : '') +
      (sub ? `PRAZO: ${fmtData(sub.dt_prazo)}\n` : '') +
      (!sub && t.descricao ? `DESCRIÇÃO: ${esc(t.descricao)}\n` : '') +
      `PRIORIDADE: ${esc(prioTxt)}\n` +
      (sub ? `PRAZO DA TAREFA: ${prazoTxt}\n` : `PRAZO: ${prazoTxt}\n`) +
      (papel ? `SEU PAPEL: ${papel === 'observador' ? 'Observador(a)' : 'Responsável'}\n` : '') +
      (comentTxt ? `COMENTÁRIO: ${esc(comentTxt)}\n` : '') +
      (comentAnexos.length ? `ANEXOS: ${comentAnexos.map(esc).join(', ')}\n` : '') +
      (t.fornecedor ? `FORNECEDOR: ${esc(t.fornecedor.nome)}\n` : '')

    const envios: any[] = []
    // Reply-To com token da tarefa: a resposta do e-mail vira comentário
    // (recebido por receber-email-tarefa).
    const replyTo = `fundobrasilonuacre+${t.id}@gmail.com`
    for (const [email, r] of rec) {
      envios.push({
        to: email,
        assunto: assunto[evento] || assunto.atribuicao,
        html: wrapHtml(`Olá, ${esc((r.nome || '').split(' ')[0])}.\n\n${corpoInterno(r.papel)}`, linkApp),
        replyTo,
      })
    }

    // fornecedor da tarefa (parte externa) — só em atribuição / prazo, sem link de login
    if ((evento === 'atribuicao' || evento === 'prazo_alterado') && !filtro &&
        t.notificar_fornecedor && t.fornecedor?.email) {
      const saud = t.fornecedor.responsavel_nome
        ? `Prezado(a) ${esc(t.fornecedor.responsavel_nome)}`
        : `Prezados(as), ${esc(t.fornecedor.nome)}`
      const corpoExt =
        `${saud},\n\n` +
        `Registramos no Projeto DIMA uma pendência sob sua responsabilidade:\n\n` +
        `ITEM: ${esc(t.titulo)}\n` +
        (t.descricao ? `DETALHE: ${esc(t.descricao)}\n` : '') +
        `PRAZO: ${prazoTxt}\n\n` +
        `Em caso de dúvida, responda a este e-mail ou fale com a equipe de gestão.`
      envios.push({
        to: t.fornecedor.email,
        assunto: `Projeto DIMA — pendência: ${t.titulo}`,
        html: wrapHtml(corpoExt),
      })
    }

    // fornecedor responsável pela subtarefa — recebe a subtarefa com os anexos
    // e responde por e-mail (Reply-To com o token da subtarefa → comentário).
    if (evento === 'subtarefa' && sub.responsavel_fornecedor_id && sub.fornecedor?.email) {
      const f = sub.fornecedor
      const { data: axs } = await supabase.from('tarefa_anexos')
        .select('arquivo_url,arquivo_nome,mime,tamanho').eq('checklist_id', sub.id).order('criado_em')
      const attachments: any[] = [], soNome: string[] = []
      let total = 0
      for (const a of axs || []) {
        const p = pathAnexo(a.arquivo_url)
        if (!p || total + (a.tamanho || 0) > LIMITE_ANEXOS) { soNome.push(a.arquivo_nome); continue }
        const dl = await supabase.storage.from('tarefas-anexos').download(p)
        if (dl.error || !dl.data) { soNome.push(a.arquivo_nome); continue }
        const bytes = new Uint8Array(await dl.data.arrayBuffer())
        if (total + bytes.length > LIMITE_ANEXOS) { soNome.push(a.arquivo_nome); continue }
        total += bytes.length
        attachments.push({ filename: a.arquivo_nome, content: bytes, contentType: a.mime || undefined })
      }
      const saud = f.responsavel_nome ? `Prezado(a) ${esc(f.responsavel_nome)}` : `Prezados(as), ${esc(f.nome)}`
      const corpoExt =
        `${saud},\n\n` +
        `A equipe do Projeto DIMA registrou uma atividade sob sua responsabilidade:\n\n` +
        `ATIVIDADE: ${esc(sub.descricao)}\n` +
        `REFERENTE A: ${esc(t.titulo)}\n` +
        `PRAZO: ${fmtData(sub.dt_prazo)}\n` +
        (attachments.length ? `ANEXOS: ${attachments.map(a => esc(a.filename)).join(', ')}\n` : '') +
        (soNome.length ? `NÃO ANEXADOS: ${soNome.map(esc).join(', ')} (grandes demais; solicite à equipe)\n` : '') +
        `\n<b>Para responder, basta responder a este e-mail.</b> Sua mensagem e os arquivos que anexar ` +
        `serão registrados automaticamente junto a esta atividade.`
      envios.push({
        to: f.email,
        assunto: `Projeto DIMA — ${sub.descricao.slice(0, 80)}`,
        html: wrapHtml(corpoExt),
        replyTo: `fundobrasilonuacre+${sub.id}@gmail.com`,
        attachments,
      })
    }

    if (!envios.length) {
      return new Response(JSON.stringify({ ok: true, enviados: 0, falhas: 0, aviso: 'nenhum destinatário com e-mail' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: 'fundobrasilonuacre@gmail.com', pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
    })

    const results = await Promise.allSettled(
      envios.map(e => transporter.sendMail({
        from: REMETENTE, to: e.to, subject: e.assunto, html: e.html, replyTo: e.replyTo,
        attachments: e.attachments,
      })),
    )
    const enviados = results.filter(r => r.status === 'fulfilled').length
    const falhas   = results.length - enviados
    results.forEach(r => { if (r.status === 'rejected') console.error('sendMail:', (r.reason as Error)?.message) })

    return new Response(JSON.stringify({ ok: enviados > 0, enviados, falhas }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
