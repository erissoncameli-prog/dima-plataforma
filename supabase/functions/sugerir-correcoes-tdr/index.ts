import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import JSZip from 'npm:jszip'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CAMPOS_CORRIGIVEIS = [
  { campo: 'objeto_pt', label: 'Objeto do TDR' },
  { campo: 'escopo_pt', label: 'Escopo do trabalho / Metodologia' },
  { campo: 'formacao_minima_pt', label: 'Formação mínima exigida' },
  { campo: 'experiencia_requerida_pt', label: 'Experiência requerida' },
  { campo: 'area_atuacao_pt', label: 'Área de atuação' },
  { campo: 'equipe_minima_pt', label: 'Equipe mínima' },
  { campo: 'atestados_pt', label: 'Atestados requeridos' },
]

const SYSTEM_PROMPT = `Você é um especialista em redação de Termos de Referência (TDRs) de projetos de cooperação internacional com financiamento UNESCO.

Analise o TDR e gere sugestões de correção e preenchimento campo a campo.

Regras obrigatórias:
1. Se um campo estiver vazio no banco mas o CONTEÚDO DO DOCUMENTO contiver a informação, extraia o trecho relevante e use como "depois"
2. Se um campo tiver conteúdo no banco mas puder ser melhorado com base nos indicadores ou no documento, sugira a versão corrigida
3. Se um campo estiver correto e completo, NÃO o inclua na lista de sugestões
4. Não invente dados — use apenas informações dos campos existentes, do documento e dos indicadores
5. Mantenha o estilo técnico do texto original quando possível
6. Seja técnico e objetivo

Para cada campo que precisa de correção ou preenchimento, retorne:
- "campo": nome exato do campo
- "label": nome legível
- "antes": texto atual (ou "(campo vazio)" se ausente)
- "depois": texto sugerido ou extraído do documento
- "motivo": explicação curta (1 frase) do porquê

Retorne APENAS um JSON válido:
{
  "sugestoes": [
    { "campo": "string", "label": "string", "antes": "string", "depois": "string", "motivo": "string" }
  ]
}`

// ── HELPERS: LER DOCUMENTO ───────────────────────────────────────────
async function lerDocumento(url: string): Promise<string> {
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

// ── MAIN ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { tdr_id } = await req.json()
    if (!tdr_id) {
      return Response.json({ error: 'tdr_id obrigatório' }, { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Buscar TDR com atividade e indicadores
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

    // 2. Buscar última análise
    const { data: analise } = await supabase
      .from('agente_analises')
      .select('*')
      .eq('referencia_id', tdr_id)
      .eq('checkpoint', 1)
      .order('criado_em', { ascending: false })
      .limit(1)
      .single()

    if (!analise) {
      return Response.json(
        { error: 'Nenhuma análise encontrada. Submeta o TDR primeiro.' },
        { status: 422, headers: CORS }
      )
    }

    // 3. Tentar ler documento (Drive ou Storage)
    let conteudoDoc = ''
    if (tdr.arquivo_url) {
      try {
        conteudoDoc = await lerDocumento(tdr.arquivo_url)
      } catch (e) {
        console.warn('[sugerir-correcoes-tdr] Não foi possível ler documento:', (e as Error).message)
      }
    }

    // 4. Montar prompt
    const indicadores = (tdr.atividades?.atividade_matriz || [])
      .map((am: any) => am.matriz_itens)
      .filter(Boolean)

    const camposAtuais = CAMPOS_CORRIGIVEIS
      .map(({ campo, label }) => `${label} (${campo}): ${(tdr as any)[campo] || '(campo vazio)'}`)
      .join('\n')

    const listaIndicadores = indicadores.length > 0
      ? indicadores.map((ind: any, i: number) =>
          `  ${i + 1}. ${ind.indicador} — Produto: ${ind.produto_titulo} — Meta: ${ind.meta_numerica ? `${ind.meta_numerica} ${ind.unidade}` : ind.meta_descricao || 'qualitativa'}`
        ).join('\n')
      : '  Nenhum indicador vinculado'

    const criterios: any[] = analise.detalhes?.criterios || []
    const criteriosReprovados = criterios.filter((c: any) => !c.ok)
      .map((c: any) => `  - ${c.nome.replace(/_/g, ' ')}: ${c.observacao}`)
      .join('\n')

    const secaoDocumento = conteudoDoc
      ? `\n── CONTEÚDO COMPLETO DO DOCUMENTO TDR ──\n${conteudoDoc.slice(0, 15000)}${conteudoDoc.length > 15000 ? '\n[... documento truncado ...]' : ''}`
      : '\n── DOCUMENTO NÃO DISPONÍVEL — baseie-se apenas nos campos cadastrados ──'

    const prompt = `Gere sugestões de correção e preenchimento para o TDR abaixo.

── DADOS CADASTRADOS NO SISTEMA ──
Número: ${tdr.numero}
Atividade: ${tdr.atividades?.codigo} — ${tdr.atividades?.nome_pt}

${camposAtuais}

── INDICADORES DA MATRIZ ──
${listaIndicadores}

── CRITÉRIOS REPROVADOS ──
${criteriosReprovados || '(todos aprovados — sugira melhorias gerais de alinhamento com os indicadores)'}

── RESUMO DA ANÁLISE ──
${analise.resumo}
${secaoDocumento}

IMPORTANTE: Para campos vazios no sistema, extraia o conteúdo correspondente do documento se disponível.
Gere o JSON com as sugestões campo a campo.`

    // 5. Chamar Claude
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    })

    const texto = response.content[0].type === 'text' ? response.content[0].text : ''
    const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    const resultado = JSON.parse(limpo)

    return Response.json(
      {
        sugestoes: resultado.sugestoes || [],
        tdr: {
          id: tdr.id,
          numero: tdr.numero,
          status: tdr.status,
          tipo: tdr.tipo,
          atividade_codigo: tdr.atividades?.codigo,
          atividade_nome: tdr.atividades?.nome_pt,
          arquivo_url: tdr.arquivo_url,
          arquivo_nome: tdr.arquivo_nome,
          objeto_pt: tdr.objeto_pt,
          escopo_pt: tdr.escopo_pt,
          formacao_minima_pt: tdr.formacao_minima_pt,
          experiencia_requerida_pt: tdr.experiencia_requerida_pt,
          area_atuacao_pt: tdr.area_atuacao_pt,
          equipe_minima_pt: tdr.equipe_minima_pt,
          atestados_pt: tdr.atestados_pt,
          prazo_limite: tdr.prazo_limite,
          dt_contratacao: tdr.dt_contratacao,
          valor_brl: tdr.valor_brl,
          valor_usd: tdr.valor_usd,
          observacao: tdr.observacao,
        },
        analise: {
          status: analise.status,
          resumo: analise.resumo,
          criterios: analise.detalhes?.criterios || [],
        },
        conteudo_documento: conteudoDoc ? conteudoDoc.slice(0, 20000) : null,
        tokens_usados: response.usage.input_tokens + response.usage.output_tokens,
      },
      { headers: CORS }
    )
  } catch (e) {
    console.error('[sugerir-correcoes-tdr] Erro:', e)
    return Response.json({ error: (e as Error).message }, { status: 500, headers: CORS })
  }
})
