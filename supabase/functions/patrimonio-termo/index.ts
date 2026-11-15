// patrimonio-termo — aceite ou recusa do termo de responsabilidade/empréstimo do Patrimônio
// (docs/patrimonio/plano.md, Fase 2; migração 20261116_pat_02_guarda).
//
// { termo_id, decisao: 'aceitar'|'recusar', motivo?, hash, senha }   (JWT do usuário)
//   1. quem chama = o JWT (nunca um id vindo do corpo);
//   2. bloqueio por tentativas: o mesmo da assinatura de remanejamento
//      (fn_rem_senha_bloqueada_ate / fn_rem_registrar_tentativa: 5 erros em 30 min ⇒ 30 min sem assinar);
//   3. a senha de login é reconfirmada no servidor; a sessão criada para conferir é encerrada
//      na hora e a senha nunca é gravada;
//   4. fn_pat_termo_decidir (só service_role) confere que a pessoa é a indicada no termo e que
//      o hash que ela viu é o do termo + bens ao vivo (mudou ⇒ DOCUMENTO_ALTERADO).
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resp({ ok: false, erro: 'Use POST.' }, 405)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* vazio */ }

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: u, error: eU } = await admin.auth.getUser(token)
  if (eU || !u?.user?.email) return resp({ ok: false, erro: 'Sessão inválida. Entre de novo.' }, 401)
  const usuarioId = u.user.id

  const { termo_id, decisao, motivo, hash, senha } = corpo as Record<string, string>
  if (!termo_id || !['aceitar', 'recusar'].includes(decisao) || !hash || typeof senha !== 'string' || !senha) {
    return resp({ ok: false, erro: 'Dados incompletos (termo, decisão, hash e senha).' }, 400)
  }

  const { data: bloqueadoAte } = await admin.rpc('fn_rem_senha_bloqueada_ate', { p_usuario_id: usuarioId })
  if (bloqueadoAte) return resp({ ok: false, erro: 'SENHA_BLOQUEADA', bloqueado_ate: bloqueadoAte }, 429)

  const ok = await conferirSenha(u.user.email, senha)
  await admin.rpc('fn_rem_registrar_tentativa', { p_usuario_id: usuarioId, p_sucesso: ok })
  if (!ok) return resp({ ok: false, erro: 'SENHA_INVALIDA' }, 401)

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
  const { data, error } = await admin.rpc('fn_pat_termo_decidir', {
    p_usuario_id: usuarioId, p_termo: termo_id, p_decisao: decisao, p_motivo: motivo ?? null,
    p_hash: hash, p_ip: ip, p_user_agent: req.headers.get('user-agent'),
  })
  if (error) return resp({ ok: false, erro: error.message }, 409)
  return resp({ ok: true, resultado: data })
})

async function conferirSenha(email: string, senha: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  })
  if (!r.ok) return false
  const j = await r.json().catch(() => null)
  if (j?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${j.access_token}` },
    }).catch(() => {})
  }
  return !!j?.access_token
}
