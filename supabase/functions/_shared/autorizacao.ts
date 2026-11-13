// Quem está chamando a Edge Function (Produto 4, auditoria de segurança — 10/11/2026).
//
// O verify_jwt do gateway só exige UM JWT válido — e a chave pública do site
// (anon) é um JWT válido. Função que usa service_role e não confere o usuário
// por dentro fica, na prática, aberta a qualquer pessoa. Estes auxiliares
// identificam a pessoa pelo token da sessão e, para TDR, perguntam ao banco com
// o cliente DO USUÁRIO (RLS de tdrs_select) se ela enxerga o registro.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type Usuario = { id: string; perfil: string; ativo: boolean }

export class SemAcesso extends Error {
  status: number
  constructor(msg: string, status = 403) { super(msg); this.status = status }
}

function token(req: Request): string {
  return (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
}

// Usuário logado e ativo; a chave anon (sem "sub") e token inválido são recusados (401)
export async function usuarioLogado(req: Request, admin: SupabaseClient): Promise<Usuario> {
  const t = token(req)
  if (!t) throw new SemAcesso('Sessão não informada.', 401)
  const { data, error } = await admin.auth.getUser(t)
  if (error || !data?.user?.id) throw new SemAcesso('Sessão inválida ou expirada.', 401)
  const { data: u } = await admin.from('usuarios').select('id, perfil, ativo').eq('id', data.user.id).maybeSingle()
  if (!u || u.ativo !== true) throw new SemAcesso('Usuário sem acesso.', 403)
  return u as Usuario
}

// Cliente com as permissões da própria pessoa (RLS)
export function clienteDoUsuario(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: 'Bearer ' + token(req) } },
    auth: { persistSession: false },
  })
}

// A pessoa logada enxerga o TDR (mesma regra das telas: policy tdrs_select)
export async function exigirAcessoTdr(req: Request, admin: SupabaseClient, tdrId: string): Promise<Usuario> {
  const u = await usuarioLogado(req, admin)
  const { data } = await clienteDoUsuario(req).from('tdrs').select('id').eq('id', tdrId).maybeSingle()
  if (!data) throw new SemAcesso('Sem acesso a este TDR.', 403)
  return u
}

export async function exigirSuperAdmin(req: Request, admin: SupabaseClient): Promise<Usuario> {
  const u = await usuarioLogado(req, admin)
  if (u.perfil !== 'super_admin') throw new SemAcesso('Somente o administrador do sistema.', 403)
  return u
}

// Perfil dentro da lista (ex.: Auditoria = super_admin e coordenação) — 13/11/2026
export async function exigirPerfil(req: Request, admin: SupabaseClient, perfis: string[]): Promise<Usuario> {
  const u = await usuarioLogado(req, admin)
  if (!perfis.includes(u.perfil)) throw new SemAcesso('Seu perfil não tem acesso a esta função.', 403)
  return u
}

// Chamada interna com a chave service_role (cron, outra Edge Function). Confere a
// chave exata, não só o "role" do JWT: a chave nunca sai do servidor.
export function ehServiceRole(req: Request): boolean {
  const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  return !!chave && token(req) === chave
}

// Resposta de erro com o status certo (401/403 para SemAcesso)
export function statusDoErro(e: unknown, padrao = 400): number {
  return e instanceof SemAcesso ? e.status : padrao
}
