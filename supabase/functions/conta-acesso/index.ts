// conta-acesso — voltar a entrar e nova senha por link (migração 20261127_acessos_e_retorno_senha).
//
// Ações (corpo JSON, campo "acao"):
//   pedir_senha      {email}                — "Esqueceu a senha?" da tela de entrada (sem login)
//   pedir_retorno    {email, justificativa} — "Pedir para voltar a entrar" (conta suspensa ou desativada; sem login)
//   info             {token}                — o que o link é (a página nova-senha.html pergunta antes de mostrar o formulário)
//   confirmar_retorno{token}                — a pessoa confirma o pedido de voltar; só então ele chega ao super_admin
//   definir_senha    {token, senha}         — cria a senha nova pelo link (uso único, 24 h, sem repetir senha usada)
//   trocar_senha     {senha_atual, nova}    — pessoa logada troca a própria senha (Meu perfil e 1º acesso), mesmas regras
//
// Os pedidos sem login respondem SEMPRE igual e na mesma hora (o e-mail sai em segundo plano): a resposta não revela
// se o e-mail existe nem em que situação está a conta. O link só existe no e-mail; no banco fica o SHA-256.
// A senha nunca é conferida no navegador nem gravada por ele.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { enviarAcessoAgora, novoToken, sha256, linkSenha } from '../_shared/acesso-email.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SITE_URL = 'https://fundobrasilonu-plataforma.vercel.app'

const resp = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// As mesmas 4 regras da tela (trocar-senha.html, nova-senha.html, Meu perfil)
function regraSenha (s: unknown): string | null {
  if (typeof s !== 'string' || s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.'
  if (s.length > 72) return 'A senha pode ter no máximo 72 caracteres.'
  if (!/[0-9]/.test(s)) return 'A senha precisa ter pelo menos um número.'
  if (!/[A-Z]/.test(s)) return 'A senha precisa ter pelo menos uma letra maiúscula.'
  if (!/[a-z]/.test(s)) return 'A senha precisa ter pelo menos uma letra minúscula.'
  return null
}
const msgErro = (m: string) => String(m || '').replace(/^[A-Z_]+:\s*/, '')
const codErro = (m: string) => (String(m || '').match(/^([A-Z_]+):/) || [])[1] || 'ERRO'
const agoraBR = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco', dateStyle: 'short', timeStyle: 'short' })

// Segundo plano: o e-mail não atrasa a resposta (mesma resposta para quem existe e para quem não existe)
function emSegundoPlano (p: Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime
  if (er?.waitUntil) er.waitUntil(p.catch(e => console.error('conta-acesso (fundo):', (e as Error).message)))
  else p.catch(e => console.error('conta-acesso (fundo):', (e as Error).message))
}

async function conferirSenha (email: string, senha: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  })
  if (!r.ok) return false
  const j = await r.json().catch(() => null)
  if (j?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${j.access_token}` },
    }).catch(() => {})
  }
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resp({ ok: false, erro: 'Use POST.' }, 405)
  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let corpo: any = {}
  try { corpo = await req.json() } catch (_) { return resp({ ok: false, erro: 'Corpo inválido.' }, 400) }
  const acao = String(corpo.acao || '')

  try {
    // ── pedidos sem login: resposta sempre igual ──────────────────────
    if (acao === 'pedir_senha' || acao === 'pedir_retorno') {
      const email = String(corpo.email || '').trim().slice(0, 254)
      const token = novoToken()
      const hash = await sha256(token)
      const { data, error } = acao === 'pedir_senha'
        ? await admin.rpc('fn_senha_pedir', { p_email: email, p_token_hash: hash })
        : await admin.rpc('fn_retorno_pedir', { p_email: email, p_justificativa: String(corpo.justificativa || '').slice(0, 1000), p_token_hash: hash })
      if (error) console.error(acao + ':', error.message)
      const d: any = data || {}
      if (d.enviar === 'senha') {
        emSegundoPlano(enviarAcessoAgora(admin, d.email, 'senha_link', { nome: d.nome, link: linkSenha(token) }))
      } else if (d.enviar === 'retorno') {
        emSegundoPlano(enviarAcessoAgora(admin, d.email, 'retorno_confirmar', { nome: d.nome, situacao: d.situacao, link: linkSenha(token) }))
      }
      return resp({ ok: true })
    }

    // ── o link ────────────────────────────────────────────────────────
    if (acao === 'info' || acao === 'confirmar_retorno' || acao === 'definir_senha') {
      const token = String(corpo.token || '')
      if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return resp({ ok: true, estado: 'invalido' })
      const hash = await sha256(token)

      if (acao === 'info') {
        const { data, error } = await admin.rpc('fn_link_info', { p_token_hash: hash })
        if (error) throw error
        return resp({ ok: true, ...(data || { estado: 'invalido' }) })
      }
      if (acao === 'confirmar_retorno') {
        const { data, error } = await admin.rpc('fn_retorno_confirmar', { p_token_hash: hash })
        if (error) return resp({ ok: false, codigo: codErro(error.message), erro: msgErro(error.message) }, 409)
        return resp({ ok: true, ...(data || {}) })
      }
      // definir_senha
      const senha = corpo.senha
      const r = regraSenha(senha)
      if (r) return resp({ ok: false, codigo: 'SENHA_FRACA', erro: r }, 400)
      const { data: uid, error: eV } = await admin.rpc('fn_senha_validar', { p_token_hash: hash, p_senha: senha })
      if (eV || !uid) return resp({ ok: false, codigo: codErro(eV?.message || ''), erro: msgErro(eV?.message || 'Link inválido.') }, 409)
      const { error: eU } = await admin.auth.admin.updateUserById(uid as string, { password: senha })
      if (eU) return resp({ ok: false, codigo: 'AUTH', erro: 'Não foi possível gravar a senha: ' + eU.message }, 500)
      const { data: c, error: eC } = await admin.rpc('fn_senha_concluir', { p_uid: uid, p_token_hash: hash })
      if (eC) console.error('fn_senha_concluir:', eC.message)
      if (c?.email) emSegundoPlano(enviarAcessoAgora(admin, c.email, 'senha_alterada', { nome: c.nome, quando: agoraBR() }))
      return resp({ ok: true, entrar: SITE_URL })
    }

    // ── troca da própria senha (logado) ───────────────────────────────
    if (acao === 'trocar_senha') {
      const tk = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
      const { data: u, error: eA } = await admin.auth.getUser(tk)
      if (eA || !u?.user?.email) return resp({ ok: false, codigo: 'SESSAO', erro: 'Sessão inválida. Entre de novo.' }, 401)
      const uid = u.user.id
      const { data: perfil } = await admin.from('usuarios').select('ativo, bloqueado_inatividade_em, deve_trocar_senha').eq('id', uid).maybeSingle()
      if (!perfil?.ativo || perfil.bloqueado_inatividade_em) return resp({ ok: false, codigo: 'CONTA', erro: 'Conta sem acesso.' }, 403)

      // 1º acesso com senha temporária (trocar-senha.html): a sessão acabou de ser aberta com ela; não pede de novo
      if (!perfil.deve_trocar_senha) {
        const { data: bloq } = await admin.rpc('fn_rem_senha_bloqueada_ate', { p_usuario_id: uid })
        if (bloq) return resp({ ok: false, codigo: 'SENHA_BLOQUEADA', erro: 'Muitas tentativas com a senha errada. Tente de novo mais tarde.', bloqueado_ate: bloq }, 429)
        const ok = await conferirSenha(u.user.email, String(corpo.senha_atual || ''))
        await admin.rpc('fn_rem_registrar_tentativa', { p_usuario_id: uid, p_sucesso: ok })
        if (!ok) return resp({ ok: false, codigo: 'SENHA_ATUAL', erro: 'A senha atual está incorreta.' }, 401)
      }

      const nova = corpo.nova
      const r = regraSenha(nova)
      if (r) return resp({ ok: false, codigo: 'SENHA_FRACA', erro: r }, 400)
      const { data: usada } = await admin.rpc('fn_senha_ja_usada', { p_uid: uid, p_senha: nova })
      if (usada) return resp({ ok: false, codigo: 'SENHA_REPETIDA', erro: 'Você já usou esta senha. Escolha uma senha que nunca usou.' }, 409)
      const { error: eU } = await admin.auth.admin.updateUserById(uid, { password: nova })
      if (eU) return resp({ ok: false, codigo: 'AUTH', erro: 'Não foi possível gravar a senha: ' + eU.message }, 500)
      const { data: c } = await admin.rpc('fn_senha_concluir', { p_uid: uid, p_token_hash: null })
      if (c?.email) emSegundoPlano(enviarAcessoAgora(admin, c.email, 'senha_alterada', { nome: c.nome, quando: agoraBR() }))
      return resp({ ok: true })
    }

    return resp({ ok: false, erro: 'Ação desconhecida.' }, 400)
  } catch (e) {
    console.error('conta-acesso:', (e as Error).message)
    return resp({ ok: false, erro: 'Falha no servidor. Tente de novo.' }, 500)
  }
})
