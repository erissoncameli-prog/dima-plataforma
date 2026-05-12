// ── DIMA UNESCO · Chat Auditor Edge Function ──────────────────────
// Stateful conversational assistant that answers questions about
// audit findings using Claude + full conversation history.

import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''

    // Admin client for data queries
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Verify the user JWT
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check profile — only super_admin and coordenacao
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('perfil, nome')
      .eq('id', user.id)
      .single()

    if (!usuario || !['super_admin', 'coordenacao'].includes(usuario.perfil)) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = body.messages || []
    const execucaoId: string | null = body.execucao_id || null

    if (!messages.length) {
      return new Response(JSON.stringify({ error: 'messages é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Build audit context ────────────────────────────────────────
    let contexto = ''
    let execucaoRef: string | null = execucaoId

    // If no execucao_id supplied, use the most recent completed one
    if (!execucaoRef) {
      const { data: ultima } = await supabase
        .from('auditoria_execucoes')
        .select('id')
        .eq('status', 'concluido')
        .order('concluido_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      execucaoRef = ultima?.id ?? null
    }

    if (execucaoRef) {
      // Execution summary
      const { data: execucao } = await supabase
        .from('auditoria_execucoes')
        .select('*')
        .eq('id', execucaoRef)
        .single()

      if (execucao) {
        const dt = execucao.concluido_em
          ? new Date(execucao.concluido_em).toLocaleString('pt-BR')
          : 'N/D'
        contexto += `## Execução de Auditoria\n`
        contexto += `- Data: ${dt}\n`
        contexto += `- Total de achados: ${execucao.total_achados ?? 0}\n`
        contexto += `- Achados críticos: ${execucao.achados_criticos ?? 0}\n`
        contexto += `- Achados altos: ${execucao.achados_altos ?? 0}\n`
        contexto += `- Tokens usados: ${execucao.tokens_usados ?? 0}\n`
        if (execucao.resumo_geral) {
          contexto += `- Resumo executivo: ${execucao.resumo_geral}\n`
        }
      }

      // All findings for this execution
      const { data: achados } = await supabase
        .from('auditoria_registros')
        .select('dominio,severidade,titulo,descricao,recomendacao,status,referencia_label,comentario_resolucao')
        .eq('execucao_id', execucaoRef)
        .order('severidade')
        .limit(60)

      const LABEL_DOM: Record<string, string> = {
        tdr_contrato:    'TDR/Contrato',
        financeiro:      'Financeiro',
        produtos:        'Produtos',
        viagens:         'Viagens',
        matriz:          'Matriz',
        qualidade_dados: 'Qualidade de Dados',
      }

      if (achados && achados.length > 0) {
        contexto += `\n## Achados Detalhados (${achados.length} registros)\n`
        for (const a of achados) {
          const dom = LABEL_DOM[a.dominio] ?? a.dominio
          contexto += `\n### [${(a.severidade ?? '').toUpperCase()}] ${a.titulo}\n`
          contexto += `- Domínio: ${dom}\n`
          contexto += `- Status: ${a.status}\n`
          if (a.referencia_label) contexto += `- Referência: ${a.referencia_label}\n`
          contexto += `- Descrição: ${a.descricao}\n`
          if (a.recomendacao) contexto += `- Recomendação: ${a.recomendacao}\n`
          if (a.comentario_resolucao) contexto += `- Resolução registrada: ${a.comentario_resolucao}\n`
        }
      }
    } else {
      contexto = 'Nenhuma auditoria foi executada ainda na plataforma.'
    }

    // ── System prompt ─────────────────────────────────────────────
    const systemPrompt = `Você é o Assistente de Auditoria do projeto DIMA UNESCO — uma plataforma de gestão de contratos, produtos, viagens e execução financeira do Fundo Brasil-ONU, gerenciada pela SEMA/AC.

Seu papel é ajudar a equipe de coordenação a entender, analisar e resolver os achados de auditoria identificados pelo sistema automatizado. Você tem acesso completo aos dados da auditoria mais recente.

**O que você pode fazer:**
- Explicar os achados de forma clara e acessível
- Priorizar o que deve ser resolvido primeiro com base em risco
- Sugerir ações concretas e prazos para corrigir cada inconsistência
- Responder perguntas sobre padrões e tendências encontrados
- Ajudar a redigir comentários de resolução para registrar no sistema
- Identificar riscos ocultos ou conexões entre achados
- Traduzir linguagem técnica para linguagem de gestão

**Instruções de formato:**
- Seja objetivo e profissional mas acessível
- Use listas e marcadores quando listar achados
- Cite os títulos exatos dos achados ao mencioná-los
- Para recomendações de prioridade, use: 🚨 Crítico, ⚠️ Alto, 📋 Médio, 🔵 Baixo
- Responda em português do Brasil

**Dados da auditoria disponíveis:**
${contexto}`

    // ── Call Claude ───────────────────────────────────────────────
    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
    })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      messages: messages,
    })

    const resposta = response.content[0].type === 'text'
      ? response.content[0].text
      : '(sem resposta)'

    return new Response(
      JSON.stringify({
        resposta,
        tokens: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    console.error('[chat-auditor]', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
