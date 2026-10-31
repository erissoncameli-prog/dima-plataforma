// api-dados — API somente leitura, só números agregados, para painel HTML e BI.
//
// Plataforma Inteligente de Gestão de Projetos · Concepção e Desenvolvimento: Erisson Cameli Santiago
// © 2025–2026, todos os direitos reservados.
//
// Rotas (GET):
//   /functions/v1/api-dados/v1/resumo       totais do projeto, da Matriz e por resultado
//   /functions/v1/api-dados/v1/atividades   uma linha por atividade (conteúdo numérico da ficha A5)
//   /functions/v1/api-dados/v1/matriz       indicadores da Matriz de Resultados
//   ?formato=json (padrão) | csv           ?sep=; (CSV com ponto e vírgula)
//
// Autenticação: cabeçalho  Authorization: Bearer dima_…   (ou  X-API-Key: dima_…)
// A chave é criada por super_admin (fn_api_criar_cliente) e fica no banco só como SHA-256.
// Tudo sai das funções fn_api_* (migração 20261031_api_dados) — esta função não calcula nada.
// verify_jwt = false: quem chama é outra plataforma, não um usuário logado.
import { createClient } from 'npm:@supabase/supabase-js@2'

const VERSAO = 'v1'
const ROTAS: Record<string, string> = {
  resumo: 'fn_api_resumo',
  atividades: 'fn_api_atividades',
  matriz: 'fn_api_matriz',
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

function cors(origem: string | null): Record<string, string> {
  return origem
    ? {
        'Access-Control-Allow-Origin': origem,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin',
      }
    : {}
}

function erro(status: number, codigo: string, mensagem: string, h: Record<string, string> = {}) {
  return new Response(JSON.stringify({ erro: { codigo, mensagem } }), {
    status,
    headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

// ── CSV (para BI): objetos aninhados viram colunas "bloco_campo"; listas viram "a; b; c"
function achatar(o: unknown, pref = '', out: Record<string, unknown> = {}) {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) achatar(v, pref ? `${pref}_${k}` : k, out)
  } else if (Array.isArray(o)) {
    out[pref] = o.every((x) => x === null || typeof x !== 'object') ? o.join('; ') : JSON.stringify(o)
  } else out[pref] = o
  return out
}
function csv(linhas: Record<string, unknown>[], sep: string) {
  const cols: string[] = []
  for (const l of linhas) for (const k of Object.keys(l)) if (!cols.includes(k)) cols.push(k)
  const cel = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cols.join(sep), ...linhas.map((l) => cols.map((c) => cel(l[c])).join(sep))].join('\r\n') + '\r\n'
}

Deno.serve(async (req) => {
  const origem = req.headers.get('origin')

  // Pré-voo do navegador (sem chave): responde; a origem é conferida na chamada de verdade.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origem) })
  if (req.method !== 'GET') return erro(405, 'METODO', 'Só GET.', cors(origem))

  const url = new URL(req.url)
  const partes = url.pathname.split('/').filter(Boolean)
  const i = partes.indexOf('api-dados')
  const [versao, recurso] = i >= 0 ? partes.slice(i + 1) : partes.slice(-2)

  if (!versao) {
    return new Response(JSON.stringify({ api: 'DIMA', versoes: [VERSAO], rotas: Object.keys(ROTAS).map((r) => `/${VERSAO}/${r}`) }),
      { headers: { ...cors(origem), 'Content-Type': 'application/json; charset=utf-8' } })
  }
  if (versao !== VERSAO) return erro(404, 'VERSAO', `Versão desconhecida. Use /${VERSAO}.`, cors(origem))
  const fn = ROTAS[recurso || '']
  if (!fn) return erro(404, 'ROTA', `Rotas: ${Object.keys(ROTAS).map((r) => `/${VERSAO}/${r}`).join(', ')}`, cors(origem))

  // ── Chave
  const auth = req.headers.get('authorization') || ''
  const chave = (auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : req.headers.get('x-api-key') || '').trim()
  if (!chave.startsWith('dima_')) return erro(401, 'SEM_CHAVE', 'Envie a chave em Authorization: Bearer dima_…', cors(origem))

  const { data: cli, error: eCli } = await admin.rpc('fn_api_cliente', { p_chave: chave })
  if (eCli) return erro(500, 'INTERNO', 'Falha ao conferir a chave.', cors(origem))
  const c = Array.isArray(cli) ? cli[0] : cli
  if (!c) return erro(401, 'CHAVE_INVALIDA', 'Chave inválida, revogada ou vencida.', cors(origem))

  // Painel no navegador: só das origens cadastradas para a chave. Sem Origin (servidor/BI) passa.
  if (origem && !(c.origens || []).includes(origem)) {
    return erro(403, 'ORIGEM', 'Esta origem não está liberada para a chave.')
  }
  const h = cors(origem)
  const formato = (url.searchParams.get('formato') || 'json').toLowerCase()
  const rota = `/${VERSAO}/${recurso}`
  const registrar = (status: number, linhas: number | null) =>
    admin.rpc('fn_api_registrar', { p_cliente: c.id, p_rota: rota, p_formato: formato, p_status: status, p_linhas: linhas })

  if (!(c.escopos || []).includes(recurso)) {
    await registrar(403, null)
    return erro(403, 'ESCOPO', `A chave não dá acesso a ${rota}.`, h)
  }
  if (Number(c.chamadas_minuto) >= Number(c.limite_minuto)) {
    await registrar(429, null)
    return erro(429, 'LIMITE', `Limite de ${c.limite_minuto} chamadas por minuto.`, { ...h, 'Retry-After': '60' })
  }
  if (!['json', 'csv'].includes(formato)) return erro(400, 'FORMATO', 'formato = json ou csv.', h)

  // ── Dados
  const { data, error } = await admin.rpc(fn)
  if (error) {
    await registrar(500, null)
    console.error(fn, error.message)
    return erro(500, 'INTERNO', 'Falha ao montar os dados.', h)
  }
  const lista = Array.isArray(data) ? data : null
  await registrar(200, lista ? lista.length : 1)

  const cab = { ...h, 'Cache-Control': 'private, max-age=60' }
  if (formato === 'csv') {
    const sep = url.searchParams.get('sep') === ';' ? ';' : ','
    const linhas = lista
      ? lista.map((x) => achatar(x))
      : recurso === 'resumo'
        ? [achatar({ gerado_em: data.gerado_em, projeto: data.projeto, matriz: data.matriz })]
        : [achatar(data)]
    return new Response(csv(linhas, sep), {
      headers: { ...cab, 'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `inline; filename="dima-${recurso}.csv"` },
    })
  }
  const corpo = lista
    ? { versao: VERSAO, gerado_em: new Date().toISOString(), total: lista.length, dados: lista }
    : { versao: VERSAO, ...data }
  return new Response(JSON.stringify(corpo), { headers: { ...cab, 'Content-Type': 'application/json; charset=utf-8' } })
})
