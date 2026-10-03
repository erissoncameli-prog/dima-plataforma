// cotacao-ptax — grava a PTAX de fechamento USD/BRL do Banco Central em cotacoes_ptax.
// (cotacoes_usd é outra tabela: cotação AwesomeAPI de referência do financeiro.)
//
// Fonte: API Olinda do BCB, serviço PTAX, CotacaoDolarPeriodo (1 registro por
// dia útil = boletim de fechamento). É a cotação oficial usada para converter
// contratos e aditivos em USD (docs/remanejamento/plano.md §6) — nunca a do
// navegador.
//
// Agendada pelo pg_cron 'cotacao-ptax-diaria' (migração
// 20261003_rem_02_cotacao_ptax.sql). Corpo opcional:
//   { "inicio": "YYYY-MM-DD", "fim": "YYYY-MM-DD" }   (carga do histórico)
// Sem corpo: últimos 10 dias. Janela máxima de 800 dias por chamada.
//
// Idempotente: só INSERE datas que ainda não existem (a tabela é imutável —
// PTAX publicada não muda). Chamada a mais não altera nada.
import { createClient } from 'npm:@supabase/supabase-js@2'

const OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)'
const JANELA_PADRAO_DIAS = 10
const JANELA_MAX_DIAS = 800
const DATA_OK = /^\d{4}-\d{2}-\d{2}$/

type Ptax = { cotacaoCompra: number; cotacaoVenda: number; dataHoraCotacao: string }

Deno.serve(async (req) => {
  let corpo: { inicio?: string; fim?: string } = {}
  try { corpo = await req.json() } catch { /* sem corpo: padrão */ }

  const hoje = hojeAcre()
  const fim = corpo.fim ?? hoje
  const inicio = corpo.inicio ?? somarDias(hoje, -JANELA_PADRAO_DIAS)
  if (!DATA_OK.test(inicio) || !DATA_OK.test(fim) || inicio > fim) {
    return json({ ok: false, erro: 'inicio/fim inválidos (YYYY-MM-DD, inicio ≤ fim)' }, 400)
  }
  if (diasEntre(inicio, fim) > JANELA_MAX_DIAS) {
    return json({ ok: false, erro: `janela maior que ${JANELA_MAX_DIAS} dias` }, 400)
  }

  let lista: Ptax[]
  try {
    lista = await buscarPtax(inicio, fim)
  } catch (e) {
    return json({ ok: false, erro: 'BCB: ' + (e as Error).message }, 502)
  }

  const linhas = lista
    .filter(p => p.cotacaoVenda > 0 && p.cotacaoCompra > 0 && p.dataHoraCotacao)
    .map(p => ({
      data: p.dataHoraCotacao.slice(0, 10),
      ptax_compra: p.cotacaoCompra,
      ptax_venda: p.cotacaoVenda,
      // dataHoraCotacao vem em hora de Brasília (UTC-3), sem fuso
      data_hora_cotacao: p.dataHoraCotacao.replace(' ', 'T').slice(0, 19) + '-03:00',
    }))

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let gravadas = 0
  if (linhas.length) {
    const { data, error } = await supabase
      .from('cotacoes_ptax')
      .upsert(linhas, { onConflict: 'data', ignoreDuplicates: true })
      .select('data')
    if (error) return json({ ok: false, erro: error.message }, 500)
    gravadas = data?.length ?? 0
  }

  const { data: ultima } = await supabase
    .from('cotacoes_ptax').select('data, ptax_venda').order('data', { ascending: false }).limit(1).maybeSingle()

  return json({ ok: true, inicio, fim, recebidas: linhas.length, gravadas, ultima })
})

async function buscarPtax(inicio: string, fim: string): Promise<Ptax[]> {
  const url = `${OLINDA}?@dataInicial='${mdy(inicio)}'&@dataFinalCotacao='${mdy(fim)}'` +
    `&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao`
  let ultimoErro = ''
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (!Array.isArray(j?.value)) throw new Error('resposta sem "value"')
      return j.value as Ptax[]
    } catch (e) {
      ultimoErro = (e as Error).message
      await new Promise(res => setTimeout(res, 1500 * tentativa))
    }
  }
  throw new Error(ultimoErro)
}

// "Hoje" do projeto = Acre (UTC-5 fixo, sem horário de verão)
function hojeAcre(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)
}
function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
}
function mdy(iso: string): string {
  const [y, m, d] = iso.split('-'); return `${m}-${d}-${y}`
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
