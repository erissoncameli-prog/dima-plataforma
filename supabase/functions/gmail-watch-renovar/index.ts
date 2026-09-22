// gmail-watch-renovar — chama users.watch no Gmail para (re)ativar o push ao
// Pub/Sub. O watch expira em ~7 dias, então isto roda no pg_cron diariamente.
// Também SEMEIA a baseline de historyId na primeira execução (o receptor
// precisa dela para saber a partir de onde ler). verify_jwt = true (cron manda
// a anon key no Authorization, mesmo padrão do cron-tarefas).
import { createClient } from 'npm:@supabase/supabase-js@2'

const TOPICO = Deno.env.get('GMAIL_PUBSUB_TOPIC') || 'projects/dima-tarefas-email/topics/gmail-tarefas'

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

Deno.serve(async () => {
  try {
    const token = await accessToken()
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicName: TOPICO, labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' }),
    })
    const j = await r.json()
    if (!j.historyId) throw new Error('watch falhou: ' + JSON.stringify(j))

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: estado } = await sb.from('gmail_sync_state').select('history_id').eq('id', 'gmail').maybeSingle()
    if (!estado) {
      // primeira vez: semeia a baseline
      await sb.from('gmail_sync_state').insert({ id: 'gmail', history_id: String(j.historyId) })
    } else {
      // renovação: mantém a baseline; só marca o horário
      await sb.from('gmail_sync_state').update({ atualizado_em: new Date().toISOString() }).eq('id', 'gmail')
    }

    return new Response(JSON.stringify({ ok: true, historyId: j.historyId, expiration: j.expiration, semeado: !estado }),
      { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
})
