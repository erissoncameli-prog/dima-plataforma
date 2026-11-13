// traduzir-contrato — traduz o PDF do contrato assinado (EN → PT) com o Claude.
//
// Auditoria de segurança 13/11/2026: a versão anterior (só no painel, fora do
// repositório) tinha verify_jwt desligado e baixava QUALQUER URL recebida no corpo
// (SSRF) e gastava a chave da Anthropic para quem chamasse, sem login.
// Agora: usuário logado e ativo, perfil que edita contrato (super_admin,
// coordenação, financeiro — a tela grava a tradução em contratos), que enxerga o
// contrato (RLS de contratos_select pelo cliente dele). O PDF sai do próprio
// contrato (contrato_assinado_url), só do bucket privado contratos-docs, baixado
// com service_role — nunca de URL vinda do navegador.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { exigirPerfil, clienteDoUsuario, SemAcesso, statusDoErro } from '../_shared/autorizacao.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const BUCKET = 'contratos-docs'
const LIMITE = 10 * 1024 * 1024

/** Converte ArrayBuffer para base64 em blocos (evita estouro de pilha em PDF grande) */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const CHUNK = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)))
  }
  return btoa(binary)
}

// Caminho dentro de contratos-docs a partir da URL guardada (formato /object/public/<bucket>/<path>)
function caminhoNoBucket(url: string): string | null {
  const m = String(url || '').match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/)
  if (!m || m[1] !== BUCKET) return null
  const p = decodeURIComponent(m[2])
  if (p.includes('..')) return null
  return p
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, erro: 'Método não permitido.' }, 405)

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await exigirPerfil(req, admin, ['super_admin', 'coordenacao', 'financeiro'])

    const { contrato_id } = await req.json().catch(() => ({}))
    if (!contrato_id || typeof contrato_id !== 'string') {
      throw new Error('contrato_id é obrigatório (atualize a página e tente de novo).')
    }

    const { data: c } = await clienteDoUsuario(req)
      .from('contratos').select('id, contrato_assinado_url').eq('id', contrato_id).maybeSingle()
    if (!c) throw new SemAcesso('Sem acesso a este contrato.', 403)
    const caminho = caminhoNoBucket(c.contrato_assinado_url)
    if (!caminho) throw new Error('PDF original do contrato não encontrado.')

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada.')

    const { data: arq, error: eArq } = await admin.storage.from(BUCKET).download(caminho)
    if (eArq || !arq) throw new Error('Não foi possível ler o PDF do contrato.')
    const pdfBytes = await arq.arrayBuffer()
    if (pdfBytes.byteLength === 0) throw new Error('O PDF do contrato está vazio.')
    if (pdfBytes.byteLength > LIMITE) throw new Error('PDF excede 10MB. Reduza o tamanho do arquivo.')
    const cab = new Uint8Array(pdfBytes.slice(0, 5))
    if (String.fromCharCode(...cab) !== '%PDF-') throw new Error('O arquivo do contrato não é um PDF.')

    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arrayBufferToBase64(pdfBytes) } },
            { type: 'text', text: 'Você é um tradutor jurídico especializado em contratos UNESCO/PNUD. Traduza o contrato acima do inglês para o português brasileiro de forma fiel e completa. Mantenha a numeração de cláusulas, títulos das seções e estrutura original. Retorne APENAS o texto traduzido, sem comentários, cabeçalhos ou explicações adicionais.' },
          ],
        }],
      }),
    })

    if (!aiResp.ok) {
      console.error('[traduzir-contrato] Anthropic HTTP', aiResp.status)
      throw new Error('O serviço de tradução não respondeu. Tente de novo em alguns minutos.')
    }
    // deno-lint-ignore no-explicit-any
    const aiData = await aiResp.json() as any
    const traducao = aiData.content?.[0]?.text || ''
    if (!traducao || traducao.trim().length < 50) {
      throw new Error('Tradução retornada vazia ou muito curta. O PDF pode estar escaneado (sem texto selecionável) ou protegido.')
    }
    return json({ ok: true, traducao })
  } catch (e) {
    console.error('[traduzir-contrato]', (e as Error).message)
    return json({ ok: false, erro: (e as Error).message }, statusDoErro(e))
  }
})
