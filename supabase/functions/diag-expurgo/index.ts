// diag-expurgo — drena a fila diag_expurgo_arquivos (Diagnóstico Socioambiental).
//
// Foto apagada pela coordenação, pela retenção de 2 anos ou pela limpeza do
// modo treino some da tabela diag_fotos na hora; o ARQUIVO vai para a fila,
// porque SQL não apaga objeto do Storage. Esta função remove os arquivos pela
// API do Storage (service_role) e marca removido_em.
//
// Agendada via pg_cron 'diag-expurgo-diario' (migração
// 20260926_diag_11_exportacao_expurgo.sql), depois da rotina de retenção.
// Idempotente: só age sobre o que já está na fila, então uma chamada a mais
// não apaga nada que não devesse.
//
// Travas:
//   · só o bucket 'diagnostico-fotos';
//   · só caminho no formato <uuid da ficha>/<uuid da foto>.<ext>;
//   · caminho ainda referenciado por uma linha de diag_fotos NÃO é apagado
//     (fica na fila com o erro registrado para a coordenação conferir).
import { createClient } from 'npm:@supabase/supabase-js@2'

const BUCKET = 'diagnostico-fotos'
const LOTE = 50        // o filtro .or() de "ainda em uso" vai na URL: lote pequeno
const MAX_LOTES = 40
const CAMINHO_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i

type Item = { id: number; bucket: string; caminho: string; tentativas: number }

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const agora = () => new Date().toISOString()
  const res = { removidos: 0, recusados: 0, erros: 0 }
  let ultimoId = 0

  for (let lote = 0; lote < MAX_LOTES; lote++) {
    const { data: fila, error } = await supabase
      .from('diag_expurgo_arquivos')
      .select('id, bucket, caminho, tentativas')
      .is('removido_em', null)
      .gt('id', ultimoId)
      .order('id')
      .limit(LOTE)
    if (error) return json({ ok: false, erro: error.message, ...res }, 500)
    if (!fila?.length) break
    ultimoId = fila[fila.length - 1].id

    const recusar = async (it: Item, motivo: string) => {
      res.recusados++
      await supabase.from('diag_expurgo_arquivos')
        .update({ tentativas: it.tentativas + 1, ultimo_erro: motivo }).eq('id', it.id)
    }

    const validos: Item[] = []
    for (const it of fila as Item[]) {
      if (it.bucket !== BUCKET) { await recusar(it, 'bucket fora do Diagnóstico'); continue }
      if (!CAMINHO_OK.test(it.caminho)) { await recusar(it, 'caminho fora do padrão <ficha>/<foto>'); continue }
      validos.push(it)
    }
    if (!validos.length) continue

    // arquivo ainda apontado por uma foto viva não sai
    const { data: vivas, error: eViva } = await supabase
      .from('diag_fotos').select('arquivo_url')
      .or(validos.map(it => `arquivo_url.like.*/${BUCKET}/${it.caminho}`).join(','))
    if (eViva) return json({ ok: false, erro: eViva.message, ...res }, 500)
    const emUso = new Set((vivas || []).map(v => String(v.arquivo_url).replace(/^.*\/diagnostico-fotos\//, '')))

    const apagar: Item[] = []
    for (const it of validos) {
      if (emUso.has(it.caminho)) await recusar(it, 'arquivo ainda referenciado em diag_fotos')
      else apagar.push(it)
    }
    if (!apagar.length) continue

    // remove() não falha para arquivo que já não existe (ex.: foto que nunca
    // subiu): o objetivo — o arquivo não estar no bucket — está cumprido.
    const { error: eRem } = await supabase.storage.from(BUCKET).remove(apagar.map(it => it.caminho))
    if (eRem) {
      res.erros += apagar.length
      for (const it of apagar) {
        await supabase.from('diag_expurgo_arquivos')
          .update({ tentativas: it.tentativas + 1, ultimo_erro: eRem.message }).eq('id', it.id)
      }
      continue
    }
    const { error: eUpd } = await supabase.from('diag_expurgo_arquivos')
      .update({ removido_em: agora(), ultimo_erro: null })
      .in('id', apagar.map(it => it.id))
    if (eUpd) return json({ ok: false, erro: eUpd.message, ...res }, 500)
    res.removidos += apagar.length
  }

  return json({ ok: true, ...res })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
