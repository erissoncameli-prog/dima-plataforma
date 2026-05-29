import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CAMPOS_CORRIGIVEIS = [
  'objeto_pt',
  'escopo_pt',
  'formacao_minima_pt',
  'experiencia_requerida_pt',
  'area_atuacao_pt',
  'equipe_minima_pt',
]

const SYSTEM_PROMPT = `Você é um especialista em redação de Termos de Referência (TDRs) de projetos de cooperação internacional com financiamento UNESCO.

Sua função é CORRIGIR campos específicos de um TDR com base nos critérios que falharam em uma análise anterior do agente.

Regras obrigatórias:
- Corrija APENAS os campos necessários para satisfazer os critérios reprovados
- Mantenha o estilo, tom e contexto do texto original — não reescreva do zero
- Seja técnico, objetivo e alinhado ao vocabulário de projetos de conservação ambiental
- Não invente dados — use apenas as informações dos indicadores e campos existentes
- Se um campo não precisa de correção, retorne null

Responda APENAS com JSON válido, sem texto adicional:
{
  "objeto_pt": "texto corrigido" | null,
  "escopo_pt": "texto corrigido" | null,
  "formacao_minima_pt": "texto corrigido" | null,
  "experiencia_requerida_pt": "texto corrigido" | null,
  "area_atuacao_pt": "texto corrigido" | null,
  "equipe_minima_pt": "texto corrigido" | null,
  "justificativa": "resumo do que foi corrigido e por quê"
}`

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

    // 2. Buscar última análise do agente para este TDR
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
        { error: 'Nenhuma análise encontrada para este TDR. Submeta o TDR primeiro.' },
        { status: 422, headers: CORS }
      )
    }

    const criterios: Array<{ nome: string; ok: boolean; observacao: string }> =
      analise.detalhes?.criterios || []
    const criteriosReprovados = criterios.filter((c) => !c.ok)

    if (criteriosReprovados.length === 0) {
      return Response.json(
        { error: 'Todos os critérios foram aprovados. Correção não necessária.' },
        { status: 422, headers: CORS }
      )
    }

    // 3. Montar prompt de correção
    const indicadores = (tdr.atividades?.atividade_matriz || [])
      .map((am: any) => am.matriz_itens)
      .filter(Boolean)

    const camposAtuais = CAMPOS_CORRIGIVEIS.map((c) => `${c}: ${(tdr as any)[c] || 'não informado'}`).join('\n')

    const listaIndicadores = indicadores.length > 0
      ? indicadores.map((ind: any, i: number) =>
          `  ${i + 1}. ${ind.indicador} — Produto: ${ind.produto_titulo} — Meta: ${ind.meta_numerica ? `${ind.meta_numerica} ${ind.unidade}` : ind.meta_descricao || 'qualitativa'}`
        ).join('\n')
      : '  Nenhum indicador vinculado'

    const listaCriteriosReprovados = criteriosReprovados
      .map((c) => `  - ${c.nome.replace(/_/g, ' ')}: ${c.observacao}`)
      .join('\n')

    const prompt = `Corrija o TDR abaixo com base nos critérios reprovados.

── DADOS ATUAIS DO TDR ──
Número: ${tdr.numero}
Atividade: ${tdr.atividades?.codigo} — ${tdr.atividades?.nome_pt}
${camposAtuais}

── INDICADORES DA MATRIZ QUE ESTE TDR DEVE CONTRIBUIR ──
${listaIndicadores}

── CRITÉRIOS REPROVADOS (corrija para satisfazer estes) ──
${listaCriteriosReprovados}

── RESUMO DA ANÁLISE ──
${analise.resumo}

Gere o JSON com os campos corrigidos.`

    // 4. Chamar Claude
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    })

    const textoResposta = response.content[0].type === 'text' ? response.content[0].text : ''
    const limpo = textoResposta.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    const correcao = JSON.parse(limpo)

    // 5. Montar apenas campos que foram corrigidos (não null)
    const camposCorrigidos: Record<string, string> = {}
    const camposAlterados: string[] = []
    for (const campo of CAMPOS_CORRIGIVEIS) {
      if (correcao[campo] && correcao[campo] !== (tdr as any)[campo]) {
        camposCorrigidos[campo] = correcao[campo]
        camposAlterados.push(campo)
      }
    }

    if (camposAlterados.length === 0) {
      return Response.json(
        { error: 'O agente não identificou campos para corrigir automaticamente.' },
        { status: 422, headers: CORS }
      )
    }

    // 6. Buscar próximo número de versão
    const { data: ultimaVersao } = await supabase
      .from('tdr_versoes')
      .select('numero_versao')
      .eq('tdr_id', tdr_id)
      .order('numero_versao', { ascending: false })
      .limit(1)
      .single()

    const proximaVersao = ((ultimaVersao?.numero_versao || 0) as number) + 1

    // 7. Salvar snapshot e versão
    const snapshotAntes: Record<string, string> = {}
    for (const campo of camposAlterados) {
      snapshotAntes[campo] = (tdr as any)[campo] || ''
    }

    await supabase.from('tdr_versoes').insert({
      tdr_id,
      numero_versao: proximaVersao,
      usuario_id: null,
      fase: tdr.status,
      snapshot_dados: { ...snapshotAntes, ...camposCorrigidos },
      campos_alterados: camposAlterados,
      comentario: `Correção automática por Agente IA — ${correcao.justificativa || analise.resumo}`,
      autor_nome: 'Agente IA',
    })

    // 8. Atualizar TDR com os campos corrigidos
    await supabase.from('tdrs').update(camposCorrigidos).eq('id', tdr_id)

    return Response.json(
      {
        campos_corrigidos: camposAlterados,
        numero_versao: proximaVersao,
        justificativa: correcao.justificativa,
        tokens_usados: response.usage.input_tokens + response.usage.output_tokens,
      },
      { headers: CORS }
    )
  } catch (e) {
    console.error('[corrigir-tdr] Erro:', e)
    return Response.json({ error: (e as Error).message }, { status: 500, headers: CORS })
  }
})
