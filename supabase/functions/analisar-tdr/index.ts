import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import JSZip from 'npm:jszip'

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowed = [
    'https://erissoncameli-prog.github.io',
    'https://fundobrasilonu-plataforma.vercel.app',
  ]
  const allowedOrigin = allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}
const CORS = getCorsHeaders

// ── SYSTEM PROMPT ────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é um agente especializado em analisar Termos de Referência (TDRs) de projetos de cooperação internacional, especificamente projetos de conservação ambiental com financiamento UNESCO.

Sua função é avaliar se um TDR possui contexto suficiente para contribuir com os indicadores da Matriz de Resultados do projeto.

Sempre responda APENAS com um JSON válido, sem texto adicional, no seguinte formato:
{
  "status": "aprovado" | "alerta" | "reprovado",
  "resumo": "string — máximo 3 frases resumindo o resultado",
  "criterios": [
    { "nome": "string", "ok": true | false, "observacao": "string" }
  ],
  "sugestoes": ["string"]
}

Regras para status:
- "aprovado": todos os critérios obrigatórios atendidos
- "alerta": critérios obrigatórios atendidos mas com ressalvas importantes — TDR pode avançar
- "reprovado": um ou mais critérios obrigatórios ausentes — TDR deve ser corrigido antes de avançar`

// ── HELPER: LER DOCUMENTO ────────────────────────────────────────
async function lerDocumento(url: string): Promise<string> {
  // Google Drive: converter para exportação de texto
  if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
    const fileId = extrairGoogleDriveId(url)
    if (fileId) {
      const exportUrl = `https://drive.google.com/uc?export=download&id=${fileId}`
      const res = await fetch(exportUrl)
      if (!res.ok) throw new Error(`Google Drive retornou ${res.status}`)
      const buffer = await res.arrayBuffer()
      return await extrairTextoDocx(buffer)
    }
  }

  // Supabase Storage ou URL direta
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Falha ao baixar documento: ${res.status}`)
  const buffer = await res.arrayBuffer()

  const contentType = res.headers.get('content-type') || ''
  if (
    url.endsWith('.docx') ||
    contentType.includes('wordprocessingml') ||
    contentType.includes('openxmlformats')
  ) {
    return await extrairTextoDocx(buffer)
  }

  // Fallback: tentar como texto puro
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
}

function extrairGoogleDriveId(url: string): string | null {
  const match =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/id=([a-zA-Z0-9_-]+)/) ||
    url.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

async function extrairTextoDocx(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const xmlFile = zip.file('word/document.xml')
  if (!xmlFile) throw new Error('Arquivo word/document.xml não encontrado no .docx')
  const xml = await xmlFile.async('text')
  // Extrair texto removendo tags XML e normalizando espaços
  return xml
    .replace(/<w:p[ >]/g, '\n<w:p ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── HELPER: MONTAR PROMPT ────────────────────────────────────────
function montarPrompt(tdr: any, indicadores: any[], conteudoDoc: string): string {
  const campos = [
    `Número: ${tdr.numero || 'não informado'}`,
    `Tipo: ${tdr.tipo || 'não informado'}`,
    `Atividade vinculada: ${tdr.atividades?.codigo || ''} — ${tdr.atividades?.nome_pt || ''}`,
    `Objeto: ${tdr.objeto_pt || 'não informado'}`,
    `Escopo: ${tdr.escopo_pt || 'não informado'}`,
    `Formação mínima: ${tdr.formacao_minima_pt || 'não informado'}`,
    `Experiência requerida: ${tdr.experiencia_requerida_pt || 'não informado'}`,
    `Prazo limite: ${tdr.prazo_limite || 'não informado'}`,
    `Data de contratação prevista: ${tdr.dt_contratacao || 'não informado'}`,
    `Valor BRL: ${tdr.valor_brl ? `R$ ${tdr.valor_brl}` : 'não informado'}`,
  ].join('\n')

  let secaoIndicadores = ''
  if (indicadores.length > 0) {
    const listaIndicadores = indicadores.map((ind: any, i: number) =>
      `  ${i + 1}. Indicador: "${ind.indicador}"
     Produto: "${ind.produto_titulo}"
     Meta: ${ind.meta_numerica ? `${ind.meta_numerica} ${ind.unidade}` : ind.meta_descricao || 'qualitativa'}`
    ).join('\n')

    secaoIndicadores = `
── INDICADORES DA MATRIZ DE RESULTADOS QUE ESTE TDR DEVE CONTRIBUIR ──
${listaIndicadores}

CRITÉRIOS OBRIGATÓRIOS para TDR com indicadores vinculados:
1. O TDR menciona explicitamente o(s) indicador(es) ou seus produtos esperados
2. Existe metodologia de trabalho descrita (como será feito)
3. Existe prazo ou cronograma definido para entrega do produto
4. O produto esperado está descrito de forma clara
5. Se o indicador é quantitativo: o TDR menciona a quantidade ou meta a ser atingida`
  } else {
    secaoIndicadores = `
── TDR SEM VÍNCULO COM INDICADORES DA MATRIZ ──
Este TDR não está associado a indicadores da Matriz de Resultados.

CRITÉRIOS OBRIGATÓRIOS para TDR sem indicadores:
1. O escopo e objetivo estão claramente definidos
2. Existe metodologia ou forma de execução descrita
3. Existe prazo ou cronograma definido
4. O produto ou entrega esperada está descrito`
  }

  const secaoDocumento = conteudoDoc
    ? `\n── CONTEÚDO DO DOCUMENTO TDR ──\n${conteudoDoc.slice(0, 8000)}${conteudoDoc.length > 8000 ? '\n[... documento truncado ...]' : ''}`
    : '\n── DOCUMENTO NÃO DISPONÍVEL — análise baseada apenas nos campos cadastrados ──'

  return `Analise o seguinte TDR e retorne o JSON de avaliação.

── DADOS CADASTRADOS NO SISTEMA ──
${campos}
${secaoIndicadores}
${secaoDocumento}

Avalie com base em TODOS os dados disponíveis (campos cadastrados + conteúdo do documento quando disponível).`
}

// ── HELPER: PARSEAR RESPOSTA ──────────────────────────────────────
function parsearResposta(texto: string): {
  status: 'aprovado' | 'alerta' | 'reprovado'
  resumo: string
  criterios: Array<{ nome: string; ok: boolean; observacao: string }>
  sugestoes: string[]
} {
  try {
    // Remove markdown code blocks if Claude wrapped the JSON
    const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    const json = JSON.parse(limpo)
    if (!['aprovado', 'alerta', 'reprovado'].includes(json.status)) {
      json.status = 'reprovado'
    }
    return json
  } catch {
    return {
      status: 'alerta',
      resumo: 'Não foi possível processar a resposta do agente. Análise manual recomendada.',
      criterios: [{ nome: 'parse_resposta', ok: false, observacao: texto.slice(0, 500) }],
      sugestoes: ['Verificar manualmente o TDR'],
    }
  }
}

// ── MAIN ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cors = CORS(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { tdr_id } = await req.json()
    if (!tdr_id) {
      return Response.json({ error: 'tdr_id obrigatório' }, { status: 400, headers: cors })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Buscar TDR com atividade e indicadores vinculados
    const { data: tdr, error: tdrErr } = await supabase
      .from('tdrs')
      .select(`
        *,
        atividades (
          id, codigo, nome_pt,
          atividade_matriz (
            matriz_itens (
              id, indicador, meta_descricao, meta_numerica, unidade, produto_titulo
            )
          )
        )
      `)
      .eq('id', tdr_id)
      .single()

    if (tdrErr || !tdr) {
      throw new Error('TDR não encontrado: ' + (tdrErr?.message || 'id inválido'))
    }

    if (tdr.status !== 'submetido') {
      return Response.json(
        { error: `TDR não está no status submetido (atual: ${tdr.status})` },
        { status: 422, headers: cors }
      )
    }

    // 2. Extrair indicadores da matriz vinculados à atividade
    const indicadores = (tdr.atividades?.atividade_matriz || [])
      .map((am: any) => am.matriz_itens)
      .filter(Boolean)

    // 3. Tentar ler o documento
    let conteudoDoc = ''
    if (tdr.arquivo_url) {
      try {
        conteudoDoc = await lerDocumento(tdr.arquivo_url)
      } catch (e) {
        console.warn('[analisar-tdr] Erro ao ler documento:', (e as Error).message)
      }
    }

    // 4. Chamar Claude
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: montarPrompt(tdr, indicadores, conteudoDoc) }],
    })

    const textoResposta =
      response.content[0].type === 'text' ? response.content[0].text : ''
    const analise = parsearResposta(textoResposta)

    // 5. Salvar análise
    await supabase.from('agente_analises').insert({
      checkpoint: 1,
      referencia_id: tdr_id,
      referencia_tipo: 'tdr',
      status: analise.status,
      resumo: analise.resumo,
      detalhes: {
        criterios: analise.criterios,
        indicadores_vinculados: indicadores.map((i: any) => i.id),
        sugestoes: analise.sugestoes,
      },
      modelo_ia: 'claude-sonnet-4-6',
      tokens_usados: response.usage.input_tokens + response.usage.output_tokens,
    })

    // 6. Atualizar status do TDR
    // reprovado → pendente_correcao | aprovado/alerta → em_avaliacao
    const novoStatus = analise.status === 'reprovado' ? 'pendente_correcao' : 'em_avaliacao'

    await supabase.from('tdrs').update({ status: novoStatus }).eq('id', tdr_id)

    // 7. Registrar na timeline do TDR
    try {
      await supabase
        .from('tdr_acoes')
        .insert({
          tdr_id,
          usuario_id: null,
          acao: 'analise_agente',
          status_anterior: 'submetido',
          status_novo: novoStatus,
          comentario: analise.resumo,
        })
    } catch (e) {
      console.warn('[analisar-tdr] tdr_acoes falhou (não crítico):', (e as Error).message)
    }

    return Response.json(
      {
        status: analise.status,
        novo_status_tdr: novoStatus,
        resumo: analise.resumo,
        criterios: analise.criterios,
        sugestoes: analise.sugestoes,
      },
      { headers: CORS }
    )
  } catch (e) {
    console.error('[analisar-tdr] Erro:', e)
    return Response.json({ error: (e as Error).message }, { status: 500, headers: CORS })
  }
})
