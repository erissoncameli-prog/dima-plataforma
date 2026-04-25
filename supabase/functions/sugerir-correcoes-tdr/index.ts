import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CAMPOS_CORRIGIVEIS = [
  { campo: 'objeto_pt', label: 'Objeto do TDR' },
  { campo: 'escopo_pt', label: 'Escopo do trabalho' },
  { campo: 'formacao_minima_pt', label: 'Formação mínima' },
  { campo: 'experiencia_requerida_pt', label: 'Experiência requerida' },
  { campo: 'area_atuacao_pt', label: 'Área de atuação' },
  { campo: 'equipe_minima_pt', label: 'Equipe mínima' },
]

const SYSTEM_PROMPT = `Você é um especialista em redação de Termos de Referência (TDRs) de projetos de cooperação internacional com financiamento UNESCO.

Analise o TDR e gere sugestões de correção campo a campo, baseando-se nos critérios que falharam.

Para cada campo que precisa de correção, retorne um objeto com:
- "campo": nome do campo (exatamente como fornecido)
- "label": nome legível do campo
- "antes": texto atual do campo (ou "(campo vazio)" se ausente)
- "depois": texto sugerido corrigido
- "motivo": explicação curta (1 frase) do por que essa correção é necessária

Retorne APENAS um JSON válido no formato:
{
  "sugestoes": [
    { "campo": "string", "label": "string", "antes": "string", "depois": "string", "motivo": "string" }
  ]
}

Regras:
- Inclua APENAS os campos que precisam de correção
- Não invente dados — use apenas informações dos indicadores e campos existentes
- Mantenha o estilo do texto original quando possível
- Seja técnico e objetivo`

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

    // 3. Montar prompt
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

    const prompt = `Gere sugestões de correção para o TDR abaixo.

── DADOS ATUAIS ──
Número: ${tdr.numero}
Atividade: ${tdr.atividades?.codigo} — ${tdr.atividades?.nome_pt}

${camposAtuais}

── INDICADORES DA MATRIZ ──
${listaIndicadores}

── CRITÉRIOS REPROVADOS ──
${criteriosReprovados || '(todos aprovados — sugira melhorias gerais)'}

── RESUMO DA ANÁLISE ──
${analise.resumo}

Gere o JSON com as sugestões campo a campo.`

    // 4. Chamar Claude
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
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
          atividade_codigo: tdr.atividades?.codigo,
          atividade_nome: tdr.atividades?.nome_pt,
          arquivo_url: tdr.arquivo_url,
          arquivo_nome: tdr.arquivo_nome,
          // campos atuais para exibição no revisor
          objeto_pt: tdr.objeto_pt,
          escopo_pt: tdr.escopo_pt,
          formacao_minima_pt: tdr.formacao_minima_pt,
          experiencia_requerida_pt: tdr.experiencia_requerida_pt,
          area_atuacao_pt: tdr.area_atuacao_pt,
          equipe_minima_pt: tdr.equipe_minima_pt,
        },
        analise: {
          status: analise.status,
          resumo: analise.resumo,
          criterios: analise.detalhes?.criterios || [],
        },
        tokens_usados: response.usage.input_tokens + response.usage.output_tokens,
      },
      { headers: CORS }
    )
  } catch (e) {
    console.error('[sugerir-correcoes-tdr] Erro:', e)
    return Response.json({ error: (e as Error).message }, { status: 500, headers: CORS })
  }
})
