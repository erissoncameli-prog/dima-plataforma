// receber-email-tarefa — endpoint chamado pela push subscription do Pub/Sub
// quando chega e-mail em fundobrasilonuacre@gmail.com. Para cada mensagem nova:
//   1) acha o alvo pelo endereço fundobrasilonuacre+<uuid>@gmail.com — o uuid é
//      de uma tarefa OU de uma subtarefa (tarefa_checklist, e-mail ao fornecedor)
//   2) confirma o remetente: usuário INTERNO (usuarios.email) ou, se o alvo é
//      subtarefa de fornecedor, o e-mail cadastrado desse fornecedor
//   3) limpa a citação e vira comentário (fn_comentar_tarefa_sistema /
//      fn_comentar_tarefa_fornecedor)
//   4) salva anexos no bucket tarefas-anexos LIGADOS ao comentário (comentario_id)
//   5) marca a mensagem como lida
// Idempotência (20261125): cada mensagem é RESERVADA em tarefa_email_recebidos antes de
//   comentar — o Pub/Sub dispara várias execuções em paralelo a partir da mesma baseline
//   (TR-051: cada "Ciente" virou até 4 comentários). Quem perde a reserva pula.
// Fornecedor da TAREFA (tarefas.fornecedor_id) também é aceito como autor. E-mail antigo,
//   sem o código no endereço, é casado pelo assunto "Projeto DIMA — pendência: <título>"
//   (só para o fornecedor da tarefa). ?varrer_fornecedores=1 (&simular=1) procura essas
//   respostas na caixa dos últimos 120 dias.
// Endereço fundobrasilonuacre+api@gmail.com = PEDIDO DE ACESSO À API (20261101_api_pedidos_email):
//   vira linha em api_pedidos (fn_api_pedido_registrar), sem passar pela lógica de tarefas;
//   além do histórico, cada execução varre os +api dos últimos 3 dias (o que já é pedido é pulado);
//   remetente autenticado (DMARC/DKIM do Gmail) recebe o aviso "recebido"; resposta
//   automática, lista e devolução são ignoradas. A decisão é do super_admin (tela Integrações).
// Autenticação do endpoint: ?key=RECEBER_EMAIL_KEY (segredo compartilhado com a
// subscription). verify_jwt = false (o Pub/Sub não manda JWT do Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { drenarApiPedidos } from '../_shared/api-pedidos-email.ts'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const EMAIL_CONTA = 'fundobrasilonuacre@gmail.com'
// fundobrasilonuacre+<uuid>@gmail.com
const RE_TOKEN = /fundobrasilonuacre\+([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})@gmail\.com/

function b64urlToStr (s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='
  return new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)))
}
function b64urlToBytes (s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}
const emailDe = (h: string) => (h.match(/<([^>]+)>/)?.[1] || h).trim().toLowerCase()
const RE_API = /fundobrasilonuacre\+api@gmail\.com/i

// Remove citação/assinatura da resposta, mantendo só o texto novo.
function limparCorpo (txt: string): string {
  const linhas = txt.replace(/\r/g, '').split('\n')
  const out: string[] = []
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]
    if (/^\s*>/.test(l)) break
    if (/^\s*(Em|On)\s.+(escreveu|wrote):\s*$/.test(l)) break
    // Gmail quebra a atribuição em duas linhas: "Em ter., 10 de nov. … Projeto DIMA – UNESCO/SE" + "MA-AC <…> escreveu:"
    if (/^\s*(Em|On)\s.+\d/.test(l) && /(escreveu|wrote):\s*$/.test(linhas[i + 1] || '')) break
    if (/^-{2,}\s*(Mensagem original|Original Message|Forwarded message)/i.test(l)) break
    if (/^________+/.test(l)) break
    if (/^De:\s|^From:\s/.test(l) && out.length) break
    if (/^--\s*$/.test(l) && out.length) break                                   // separador de assinatura (RFC 3676)
    if (/^\s*(enviado (do|de)\s|sent from|get outlook|baixe o outlook)/i.test(l) && out.length) break // rodapé de app de e-mail
    out.push(l)
  }
  return out.join('\n').trim()
}

async function accessToken (): Promise<string> {
  const body = new URLSearchParams({
    client_id: Deno.env.get('GMAIL_CLIENT_ID')!,
    client_secret: Deno.env.get('GMAIL_CLIENT_SECRET')!,
    refresh_token: Deno.env.get('GMAIL_REFRESH_TOKEN')!,
    grant_type: 'refresh_token',
  })
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('falha ao renovar access_token: ' + JSON.stringify(j))
  return j.access_token
}

function acharParte (payload: any, mime: string): string {
  if (!payload) return ''
  if (payload.mimeType === mime && payload.body?.data) return b64urlToStr(payload.body.data)
  for (const p of payload.parts || []) { const r = acharParte(p, mime); if (r) return r }
  return ''
}
function coletarAnexos (payload: any, acc: any[] = []): any[] {
  if (!payload) return acc
  if (payload.filename && payload.body?.attachmentId) {
    // imagem embutida no corpo (logo de assinatura, print colado) não é anexo
    const disp = header(payload, 'Content-Disposition').toLowerCase()
    const inline = /^image\//i.test(payload.mimeType || '') &&
      (disp.startsWith('inline') || (!disp && !!header(payload, 'Content-ID')))
    if (!inline) acc.push({ nome: payload.filename, mime: payload.mimeType, attachmentId: payload.body.attachmentId })
  }
  for (const p of payload.parts || []) coletarAnexos(p, acc)
  return acc
}
// fornecedores.email pode trazer mais de um endereço (", " ou ";")
const emailsDe = (s: string | null) =>
  (s || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean)
const header = (payload: any, nome: string) =>
  (payload?.headers || []).find((h: any) => h.name.toLowerCase() === nome.toLowerCase())?.value || ''

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    if (url.searchParams.get('key') !== Deno.env.get('RECEBER_EMAIL_KEY')) {
      return new Response('unauthorized', { status: 401 })
    }
    // Pub/Sub manda { message: { data: base64(...) } } — só usamos como gatilho.
    await req.json().catch(() => ({}))

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: estado } = await sb.from('gmail_sync_state').select('history_id').eq('id', 'gmail').maybeSingle()
    const startHistoryId = estado?.history_id
    if (!startHistoryId) {
      // ainda não semeado — o gmail-watch-renovar cria a baseline
      return new Response(JSON.stringify({ ok: true, aviso: 'sem baseline; rode gmail-watch-renovar' }),
        { headers: { 'Content-Type': 'application/json' } })
    }

    const token = await accessToken()
    const H = { Authorization: 'Bearer ' + token }

    // Respostas antigas de fornecedor (sem o código no endereço) — só sob pedido; não mexe na baseline.
    if (url.searchParams.get('varrer_fornecedores') === '1') {
      const fornecedores = await varrerFornecedores(sb, H, url.searchParams.get('simular') === '1')
      return new Response(JSON.stringify({ ok: true, fornecedores }), { headers: { 'Content-Type': 'application/json' } })
    }

    // Varredura pedida pela fila tarefa_email_varreduras (uma por vez; quem chegar primeiro reserva).
    try {
      const { data: pend } = await sb.from('tarefa_email_varreduras').select('id,simular')
        .is('feito_em', null).order('id').limit(1).maybeSingle()
      if (pend) {
        const { data: reservada } = await sb.from('tarefa_email_varreduras')
          .update({ feito_em: new Date().toISOString() }).eq('id', pend.id).is('feito_em', null).select('id').maybeSingle()
        if (reservada) {
          const resultado = await varrerFornecedores(sb, H, pend.simular)
          await sb.from('tarefa_email_varreduras').update({ resultado, feito_em: new Date().toISOString() }).eq('id', pend.id)
        }
      }
    } catch (e) { console.error('varredura fornecedores:', (e as Error).message) }

    // novos ids desde o último historyId processado
    const hr = await fetch(`${GMAIL}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded&labelId=INBOX`, { headers: H })
    const hj = await hr.json()
    const ids = new Set<string>()
    for (const h of hj.history || []) for (const m of h.messagesAdded || []) if (m.message?.id) ids.add(m.message.id)

    let comentados = 0, pedidosApi = 0
    for (const id of ids) {
      try {
        const mr = await fetch(`${GMAIL}/messages/${id}?format=full`, { headers: H })
        const msg = await mr.json()
        const payload = msg.payload
        const to = `${header(payload, 'To')} ${header(payload, 'Delivered-To')} ${header(payload, 'Cc')}`
        if (RE_API.test(to)) {
          pedidosApi += await registrarPedidoApi(sb, id, payload)
          await fetch(`${GMAIL}/messages/${id}/modify`, {
            method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
          })
          continue
        }
        const r = await processarMensagem(sb, H, id, payload, false)
        if (r === 'comentado') comentados++
      } catch (e) { console.error('msg', id, (e as Error).message) }
    }

    // Varredura do +api: pedido que não veio no histórico (push perdido, corrida com o Gmail)
    // é pego aqui. Idempotente: e-mail que já virou pedido não é buscado de novo.
    let varredura = 0
    try {
      const q = encodeURIComponent('to:fundobrasilonuacre+api@gmail.com newer_than:3d')
      const lj = await (await fetch(`${GMAIL}/messages?q=${q}&maxResults=20`, { headers: H })).json()
      const candidatos = (lj.messages || []).map((m: any) => m.id).filter((x: string) => !ids.has(x))
      if (candidatos.length) {
        const { data: ja } = await sb.from('api_pedidos').select('gmail_message_id').in('gmail_message_id', candidatos)
        const feitos = new Set((ja || []).map((r: any) => r.gmail_message_id))
        for (const mid of candidatos) {
          if (feitos.has(mid)) continue
          const m = await (await fetch(`${GMAIL}/messages/${mid}?format=full`, { headers: H })).json()
          if ((m.labelIds || []).includes('SENT')) continue   // cópia enviada pela própria conta
          const n = await registrarPedidoApi(sb, mid, m.payload)
          varredura += n; pedidosApi += n
        }
      }
    } catch (e) { console.error('varredura api:', (e as Error).message) }
    console.log('receber-email-tarefa:', JSON.stringify({ novos: ids.size, comentados, pedidosApi, varredura }))

    // avança a baseline para o historyId mais recente
    const novoHist = hj.historyId ? String(hj.historyId) : startHistoryId
    await sb.from('gmail_sync_state').update({ history_id: novoHist, atualizado_em: new Date().toISOString() }).eq('id', 'gmail')

    // sempre 200 para o Pub/Sub confirmar (evita reentrega em loop)
    return new Response(JSON.stringify({ ok: true, novos: ids.size, comentados, pedidosApi }),
      { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('receber-email-tarefa:', (e as Error).message)
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }) // 200 p/ não reentregar em loop
  }
})

// ── Mensagem → comentário de tarefa ───────────────────────────────────────
// Devolve 'comentado' | 'repetida' | 'ignorada' | 'simulada:<tarefa>'.
async function processarMensagem (sb: any, H: Record<string, string>, id: string, payload: any, simular: boolean): Promise<string> {
  const to = `${header(payload, 'To')} ${header(payload, 'Delivered-To')} ${header(payload, 'Cc')}`
  const fromEmail = emailDe(header(payload, 'From'))
  if (!fromEmail || fromEmail === EMAIL_CONTA) return 'ignorada'

  let tarefaId: string | null = null, checklistId: string | null = null, subFornecedor: string | null = null
  const tok = to.match(RE_TOKEN)
  if (tok) {
    tarefaId = tok[1]
    // o token é de uma tarefa ou de uma subtarefa?
    const { data: ck } = await sb.from('tarefa_checklist')
      .select('id,tarefa_id,responsavel_fornecedor_id').eq('id', tok[1]).maybeSingle()
    if (ck) { tarefaId = ck.tarefa_id; checklistId = ck.id; subFornecedor = ck.responsavel_fornecedor_id }
  } else {
    // e-mail ao fornecedor da tarefa enviado antes do Reply-To com código: casa pelo assunto
    tarefaId = await tarefaPorAssunto(sb, fromEmail, header(payload, 'Subject'))
    if (!tarefaId) return 'ignorada'
  }

  // tarefa precisa existir e estar ativa
  const { data: t } = await sb.from('tarefas').select('id,ativo,fornecedor_id').eq('id', tarefaId).maybeSingle()
  if (!t || t.ativo === false) return 'ignorada'

  // remetente: usuário interno ativo, ou o fornecedor da subtarefa / da tarefa
  let autorUsuario: string | null = null, autorFornecedor: string | null = null
  if (tok) {
    const { data: u } = await sb.from('usuarios').select('id,ativo').eq('email', fromEmail).maybeSingle()
    if (u && u.ativo !== false) autorUsuario = u.id
  }
  if (!autorUsuario) {
    for (const fid of [subFornecedor, t.fornecedor_id]) {
      if (!fid || autorFornecedor) continue
      const { data: f } = await sb.from('fornecedores').select('id,email').eq('id', fid).maybeSingle()
      if (f && emailsDe(f.email).includes(fromEmail)) autorFornecedor = f.id
    }
  }
  if (!autorUsuario && !autorFornecedor) return 'ignorada'

  let corpo = acharParte(payload, 'text/plain')
  if (!corpo) corpo = acharParte(payload, 'text/html').replace(/<[^>]+>/g, ' ')
  corpo = limparCorpo(corpo)
  const anexos = coletarAnexos(payload)
  // resposta só com anexo não pode ser descartada
  if (!corpo && anexos.length) corpo = '📎 Anexo enviado por e-mail'
  if (!corpo) return 'ignorada'

  if (simular) {
    const { data: ja } = await sb.from('tarefa_email_recebidos').select('gmail_message_id').eq('gmail_message_id', id).maybeSingle()
    return ja ? 'repetida' : `simulada:${tarefaId}`
  }

  // reserva a mensagem: quem perder a corrida (execução paralela) não comenta de novo
  const { error: eRes } = await sb.from('tarefa_email_recebidos')
    .insert({ gmail_message_id: id, tarefa_id: tarefaId, checklist_id: checklistId })
  if (eRes) {
    if (eRes.code === '23505') { await marcarLida(H, id); return 'repetida' }
    console.error('reserva:', eRes.message); return 'ignorada'
  }

  const { data: comentarioId, error: eRpc } = autorUsuario
    ? await sb.rpc('fn_comentar_tarefa_sistema', {
        p_tarefa_id: tarefaId, p_autor_id: autorUsuario, p_corpo: corpo, p_origem: 'email',
        p_checklist_id: checklistId,
      })
    : await sb.rpc('fn_comentar_tarefa_fornecedor', {
        p_tarefa_id: tarefaId, p_fornecedor_id: autorFornecedor, p_corpo: corpo,
        p_checklist_id: checklistId,
      })
  if (eRpc) {
    console.error('rpc comentar:', eRpc.message)
    await sb.from('tarefa_email_recebidos').delete().eq('gmail_message_id', id) // libera para nova tentativa
    return 'ignorada'
  }
  await sb.from('tarefa_email_recebidos').update({ comentario_id: comentarioId }).eq('gmail_message_id', id)

  // anexos → bucket tarefas-anexos, ligados ao comentário (e à subtarefa)
  for (const a of anexos) {
    try {
      const ar = await fetch(`${GMAIL}/messages/${id}/attachments/${a.attachmentId}`, { headers: H })
      const aj = await ar.json()
      if (!aj.data) continue
      const bytes = b64urlToBytes(aj.data)
      const safe = (a.nome || 'anexo').replace(/[^\w.\-]+/g, '_')
      const path = `${tarefaId}/${Date.now()}_${safe}`
      const up = await sb.storage.from('tarefas-anexos').upload(path, bytes, { contentType: a.mime || 'application/octet-stream', upsert: false })
      if (up.error) { console.error('upload anexo:', up.error.message); continue }
      const publicUrl = sb.storage.from('tarefas-anexos').getPublicUrl(path).data.publicUrl
      const { error: eAx } = await sb.from('tarefa_anexos').insert({
        tarefa_id: tarefaId, arquivo_url: publicUrl, arquivo_nome: a.nome, mime: a.mime || null,
        tamanho: bytes.length, enviado_por: autorUsuario, enviado_por_fornecedor_id: autorFornecedor,
        comentario_id: comentarioId, checklist_id: checklistId,
      })
      if (eAx) console.error('insert anexo:', eAx.message)
    } catch (e) { console.error('anexo:', (e as Error).message) }
  }

  await marcarLida(H, id)
  return 'comentado'
}

async function marcarLida (H: Record<string, string>, id: string) {
  await fetch(`${GMAIL}/messages/${id}/modify`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  })
}

// "Re: Projeto DIMA — pendência: <título>" vindo do e-mail do fornecedor da tarefa
const normTit = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
async function tarefaPorAssunto (sb: any, fromEmail: string, assunto: string): Promise<string | null> {
  const m = (assunto || '').match(/pend[eê]ncia:\s*(.+)$/i)
  if (!m) return null
  const titulo = normTit(m[1])
  const { data: ts } = await sb.from('tarefas')
    .select('id,titulo,criado_em,fornecedor:fornecedores(email)')
    .eq('ativo', true).eq('notificar_fornecedor', true).not('fornecedor_id', 'is', null)
    .order('criado_em', { ascending: false }).limit(500)
  const achou = (ts || []).find((t: any) => normTit(t.titulo) === titulo && emailsDe(t.fornecedor?.email).includes(fromEmail))
  return achou ? achou.id : null
}

// Varredura única das respostas antigas de fornecedores (sem código no endereço).
async function varrerFornecedores (sb: any, H: Record<string, string>, simular: boolean) {
  const q = encodeURIComponent('subject:("pendência" OR "pendencia") -from:fundobrasilonuacre@gmail.com newer_than:120d')
  const out: any[] = []
  let pageToken = ''
  for (let pag = 0; pag < 5; pag++) {
    const lj = await (await fetch(`${GMAIL}/messages?q=${q}&maxResults=100${pageToken ? '&pageToken=' + pageToken : ''}`, { headers: H })).json()
    for (const m of lj.messages || []) {
      const msg = await (await fetch(`${GMAIL}/messages/${m.id}?format=full`, { headers: H })).json()
      if ((msg.labelIds || []).includes('SENT')) continue
      const to = `${header(msg.payload, 'To')} ${header(msg.payload, 'Delivered-To')} ${header(msg.payload, 'Cc')}`
      if (RE_TOKEN.test(to) || RE_API.test(to)) continue  // essas já passam pelo fluxo normal
      const r = await processarMensagem(sb, H, m.id, msg.payload, simular)
      if (r !== 'ignorada') out.push({ id: m.id, de: emailDe(header(msg.payload, 'From')), assunto: header(msg.payload, 'Subject'),
        data: header(msg.payload, 'Date'), resultado: r })
    }
    if (!lj.nextPageToken) break
    pageToken = lj.nextPageToken
  }
  return out
}

// ── Pedido de acesso à API ────────────────────────────────────────────────
// Remetente autenticado = o Gmail confirmou o domínio (DMARC pass, ou DKIM pass do
// mesmo domínio do From). Sem isso o pedido entra marcado e não recebe resposta.
function autenticacao (payload: any, fromEmail: string) {
  const ars = (payload?.headers || [])
    .filter((h: any) => h.name.toLowerCase() === 'authentication-results' && /^\s*mx\.google\.com/i.test(h.value))
    .map((h: any) => h.value as string)
  const ar = ars[0] || ''
  const dominio = fromEmail.split('@')[1] || ''
  const dmarc = /\bdmarc=pass\b/i.test(ar)
  const dkim = [...ar.matchAll(/dkim=pass[^;]*?header\.(?:i=@?|d=)([a-z0-9.-]+)/gi)]
    .some(m => dominio === m[1].toLowerCase() || dominio.endsWith('.' + m[1].toLowerCase()))
  const resumo = ['spf', 'dkim', 'dmarc'].map(k => (ar.match(new RegExp(`\\b${k}=(\\w+)`, 'i')) || [])[0]).filter(Boolean).join(' ')
  return { autenticado: dmarc || dkim, resumo: resumo || 'sem Authentication-Results' }
}

// Resposta automática, lista de e-mail ou devolução: não vira pedido nem recebe resposta.
function ehAutomatico (payload: any, fromEmail: string) {
  const auto = header(payload, 'Auto-Submitted').toLowerCase()
  if (auto && auto !== 'no') return true
  if (/^(bulk|junk|list|auto_reply)$/i.test(header(payload, 'Precedence').trim())) return true
  if (header(payload, 'List-Id') || header(payload, 'X-Autoreply') || header(payload, 'X-Autorespond')) return true
  return /^(mailer-daemon|postmaster|no-?reply|bounces?)([+.@-]|$)/i.test(fromEmail)
}

// "Órgão: X" etc. — campos do modelo do guia; o resto fica só no corpo.
const CAMPOS_API: [string, RegExp][] = [
  ['orgao', /^(?:órg[aã]o|orgao|institui[cç][aã]o)\s*:\s*(.+)$/im],
  ['responsavel', /^respons[aá]vel(?:\s+t[eé]cnico)?\s*:\s*(.+)$/im],
  ['finalidade', /^(?:finalidade|objetivo|uso)\s*:\s*(.+)$/im],
  ['site', /^(?:site|dom[ií]nio|endere[cç]o do painel)[^:]*:\s*(.+)$/im],
  ['rotas', /^(?:rotas|dados)[^:]*:\s*(.+)$/im],
  ['prazo', /^(?:prazo|validade)[^:]*:\s*(.+)$/im],
]

async function registrarPedidoApi (sb: any, gmailId: string, payload: any): Promise<number> {
  const fromH = header(payload, 'From')
  const fromEmail = emailDe(fromH)
  if (!fromEmail || fromEmail === EMAIL_CONTA || ehAutomatico(payload, fromEmail)) return 0
  let corpo = acharParte(payload, 'text/plain')
  if (!corpo) corpo = acharParte(payload, 'text/html').replace(/<[^>]+>/g, ' ')
  corpo = limparCorpo(corpo)
  const campos: Record<string, string> = {}
  for (const [k, re] of CAMPOS_API) { const m = corpo.match(re); if (m) campos[k] = m[1].trim() }
  const { autenticado, resumo } = autenticacao(payload, fromEmail)
  const nome = fromH.includes('<') ? fromH.split('<')[0].replace(/"/g, '').trim() : ''
  const { data: r, error } = await sb.rpc('fn_api_pedido_registrar', { p: {
    gmail_message_id: gmailId, email_message_id: header(payload, 'Message-ID') || null,
    remetente_email: fromEmail, remetente_nome: nome || null, assunto: header(payload, 'Subject') || null,
    corpo, campos, autenticado, autenticacao: resumo,
  } })
  if (error) { console.error('pedido api:', error.message); return 0 }
  if (r?.ignorado) { console.log('pedido api ignorado:', r.ignorado); return 0 }
  if (r?.novo && r?.responder) {
    try { await drenarApiPedidos(sb, r.id) } catch (e) { console.error('aviso api:', (e as Error).message) }
  }
  return r?.novo ? 1 : 0
}
