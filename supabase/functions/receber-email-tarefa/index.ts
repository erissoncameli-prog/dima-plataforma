// receber-email-tarefa — endpoint chamado pela push subscription do Pub/Sub
// quando chega e-mail em fundobrasilonuacre@gmail.com. Para cada mensagem nova:
//   1) acha a tarefa pelo endereço fundobrasilonuacre+<tarefa_id>@gmail.com
//   2) confirma que o remetente é usuário INTERNO (usuarios.email)
//   3) limpa a citação e vira comentário (fn_comentar_tarefa_sistema)
//   4) salva anexos no bucket tarefas-anexos
//   5) marca a mensagem como lida
// Autenticação do endpoint: ?key=RECEBER_EMAIL_KEY (segredo compartilhado com a
// subscription). verify_jwt = false (o Pub/Sub não manda JWT do Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2'

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

// Remove citação/assinatura da resposta, mantendo só o texto novo.
function limparCorpo (txt: string): string {
  const linhas = txt.replace(/\r/g, '').split('\n')
  const out: string[] = []
  for (const l of linhas) {
    if (/^\s*>/.test(l)) break
    if (/^\s*(Em|On)\s.+(escreveu|wrote):\s*$/.test(l)) break
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
    acc.push({ nome: payload.filename, mime: payload.mimeType, attachmentId: payload.body.attachmentId })
  }
  for (const p of payload.parts || []) coletarAnexos(p, acc)
  return acc
}
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

    // novos ids desde o último historyId processado
    const hr = await fetch(`${GMAIL}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded&labelId=INBOX`, { headers: H })
    const hj = await hr.json()
    const ids = new Set<string>()
    for (const h of hj.history || []) for (const m of h.messagesAdded || []) if (m.message?.id) ids.add(m.message.id)

    let comentados = 0
    for (const id of ids) {
      try {
        const mr = await fetch(`${GMAIL}/messages/${id}?format=full`, { headers: H })
        const msg = await mr.json()
        const payload = msg.payload
        const to = `${header(payload, 'To')} ${header(payload, 'Delivered-To')} ${header(payload, 'Cc')}`
        const tok = to.match(RE_TOKEN)
        if (!tok) continue
        const tarefaId = tok[1]
        const fromEmail = emailDe(header(payload, 'From'))
        if (!fromEmail || fromEmail === EMAIL_CONTA) continue

        // remetente precisa ser usuário interno ativo
        const { data: u } = await sb.from('usuarios').select('id,ativo').eq('email', fromEmail).maybeSingle()
        if (!u || u.ativo === false) continue

        // tarefa precisa existir e estar ativa
        const { data: t } = await sb.from('tarefas').select('id,ativo').eq('id', tarefaId).maybeSingle()
        if (!t || t.ativo === false) continue

        let corpo = acharParte(payload, 'text/plain')
        if (!corpo) corpo = acharParte(payload, 'text/html').replace(/<[^>]+>/g, ' ')
        corpo = limparCorpo(corpo)
        if (!corpo) continue

        const { error: eRpc } = await sb.rpc('fn_comentar_tarefa_sistema', {
          p_tarefa_id: tarefaId, p_autor_id: u.id, p_corpo: corpo, p_origem: 'email',
        })
        if (eRpc) { console.error('rpc comentar:', eRpc.message); continue }
        comentados++

        // anexos → bucket tarefas-anexos
        for (const a of coletarAnexos(payload)) {
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
            await sb.from('tarefa_anexos').insert({ tarefa_id: tarefaId, arquivo_url: publicUrl, arquivo_nome: a.nome, mime: a.mime || null, tamanho: bytes.length, enviado_por: u.id })
          } catch (e) { console.error('anexo:', (e as Error).message) }
        }

        // marca como lida
        await fetch(`${GMAIL}/messages/${id}/modify`, {
          method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
        })
      } catch (e) { console.error('msg', id, (e as Error).message) }
    }

    // avança a baseline para o historyId mais recente
    const novoHist = hj.historyId ? String(hj.historyId) : startHistoryId
    await sb.from('gmail_sync_state').update({ history_id: novoHist, atualizado_em: new Date().toISOString() }).eq('id', 'gmail')

    // sempre 200 para o Pub/Sub confirmar (evita reentrega em loop)
    return new Response(JSON.stringify({ ok: true, novos: ids.size, comentados }),
      { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('receber-email-tarefa:', (e as Error).message)
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }) // 200 p/ não reentregar em loop
  }
})
