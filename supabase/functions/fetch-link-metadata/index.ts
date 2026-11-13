// fetch-link-metadata — lê título, descrição, site e imagem (og:*) de uma página
// para o Repositório de Referências.
//
// Auditoria de segurança 13/11/2026 (a versão anterior estava só no painel):
// - exige usuário logado e ativo (antes a chave pública bastava);
// - só http/https em porta padrão, nome de domínio público (nada de IP literal,
//   localhost, .local/.internal) — evita usar a função para sondar a rede interna (SSRF);
// - redirecionamento seguido à mão, até 3, com a mesma checagem a cada salto;
// - lê no máximo 512 KB da resposta e só HTML.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { usuarioLogado, statusDoErro } from '../_shared/autorizacao.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const MAX_BYTES = 512 * 1024
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

class UrlRecusada extends Error {}

function conferirUrl(bruta: string): URL {
  let u: URL
  try { u = new URL(bruta) } catch { throw new UrlRecusada('URL inválida') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UrlRecusada('Só endereços http ou https')
  if (u.username || u.password) throw new UrlRecusada('URL com usuário/senha não é aceita')
  if (u.port && u.port !== '80' && u.port !== '443') throw new UrlRecusada('Porta não permitida')
  const h = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!h.includes('.') || h === 'localhost' || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(h)) {
    throw new UrlRecusada('Endereço interno não é aceito')
  }
  // IP literal (v4 ou v6) — páginas de notícia sempre têm nome de domínio
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith('[') || /^[0-9a-f:]+$/.test(h) || /^0x/i.test(h)) {
    throw new UrlRecusada('Use o endereço com nome do site, não o IP')
  }
  return u
}

async function lerLimitado(resp: Response): Promise<string> {
  const leitor = resp.body?.getReader()
  if (!leitor) return ''
  const partes: Uint8Array[] = []
  let total = 0
  while (total < MAX_BYTES) {
    const { done, value } = await leitor.read()
    if (done || !value) break
    partes.push(value); total += value.length
  }
  try { await leitor.cancel() } catch { /* ok */ }
  const tudo = new Uint8Array(Math.min(total, MAX_BYTES))
  let pos = 0
  for (const p of partes) { const n = Math.min(p.length, tudo.length - pos); tudo.set(p.subarray(0, n), pos); pos += n; if (pos >= tudo.length) break }
  return new TextDecoder('utf-8', { fatal: false }).decode(tudo)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await usuarioLogado(req, admin)

    const { url } = await req.json().catch(() => ({}))
    if (!url || typeof url !== 'string' || url.length > 2048) return json({ erro: 'URL obrigatória' }, 400)

    let urlObj = conferirUrl(url.trim())
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    let resp: Response | null = null
    try {
      for (let salto = 0; salto <= 3; salto++) {
        resp = await fetch(urlObj.toString(), {
          signal: ctrl.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; DIMA-Bot/1.0)',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          },
        })
        if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
          if (salto === 3) throw new UrlRecusada('Redirecionamentos demais')
          urlObj = conferirUrl(new URL(resp.headers.get('location')!, urlObj).toString())
          try { await resp.body?.cancel() } catch { /* ok */ }
          continue
        }
        break
      }
    } finally { clearTimeout(timer) }
    if (!resp) return json({ ok: false, erro: 'Página não respondeu' }, 502)
    const tipo = resp.headers.get('content-type') || ''
    if (tipo && !/text\/html|application\/xhtml/i.test(tipo)) return json({ ok: false, erro: 'O endereço não é uma página' }, 422)

    const html = await lerLimitado(resp)

    // Metatags por regex (sem DOM no edge)
    const meta = (property: string): string => {
      const patterns = [
        new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
        new RegExp(`<meta[^>]+name=["']${property.replace('og:', '')}["'][^>]+content=["']([^"']+)["']`, 'i'),
      ]
      for (const p of patterns) {
        const m = html.match(p)
        if (m?.[1]) return m[1].trim().replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').slice(0, 1000)
      }
      return ''
    }

    let titulo = meta('og:title') || meta('twitter:title')
    if (!titulo) {
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      titulo = t?.[1]?.trim().slice(0, 500) || ''
    }
    const descricao = meta('og:description') || meta('twitter:description') || meta('description')
    const fonte = meta('og:site_name') || urlObj.hostname.replace(/^www\./, '')
    const img = meta('og:image') || meta('twitter:image')
    const imagem_url = /^https?:\/\//i.test(img) ? img : ''
    let idioma = ''
    const locale = meta('og:locale')
    if (locale) idioma = locale.substring(0, 2).toLowerCase()
    else idioma = html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1]?.substring(0, 2).toLowerCase() || ''

    // favicon do Google não é mais usado pela tela (revelaria os sites ao Google): campo vazio
    return json({ ok: true, titulo, descricao, fonte, imagem_url, idioma, favicon: '', dominio: urlObj.hostname.replace(/^www\./, '') })
  } catch (e) {
    if (e instanceof UrlRecusada) return json({ ok: false, erro: e.message }, 400)
    const msg = e instanceof Error && e.name === 'AbortError' ? 'A página demorou demais para responder' : (e instanceof Error ? e.message : 'Erro desconhecido')
    return json({ ok: false, erro: msg }, statusDoErro(e, 500))
  }
})
