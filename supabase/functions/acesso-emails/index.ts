// acesso-emails — envia a fila acesso_notificacoes (controle de acesso, migração 20261126_acessos_a_estrutura):
// aviso de inatividade (12 dias), entrada suspensa (15 dias), entrada liberada e o resumo dos suspensos
// para os super_admins. Chamada pelo cron 'acesso-emails' (15 min). Só envia o que já está na fila: quem
// enche a fila é o banco (fn_acesso_rotina, fn_acesso_liberar_inatividade). Sem dado de entrada.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { drenarAcessos } from '../_shared/acesso-email.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const r = await drenarAcessos(admin)
    return new Response(JSON.stringify({ ok: true, ...r }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('acesso-emails:', (e as Error).message)
    return new Response(JSON.stringify({ ok: false, erro: (e as Error).message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
