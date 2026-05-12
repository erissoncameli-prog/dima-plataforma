// ── DIMA UNESCO · Chat Auditor Edge Function ──────────────────────
// Stateful conversational assistant that answers questions about
// audit findings using Claude + full conversation history.
// v4: enriched context — detects contract numbers and fetches live data.

import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Extract all contract numbers mentioned anywhere in the conversation
function extrairNumerosContrato(messages: Array<{ role: string; content: string }>): string[] {
  const texto = messages.map(m => m.content).join(' ')
  // Match 6+ digit sequences (contract numbers like 1225855, 4500550430)
  const matches = texto.match(/\b\d{6,}\b/g) || []
  return [...new Set(matches)]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

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

    // ── Enrich with live contract data when contract numbers are mentioned ──
    const numerosContrato = extrairNumerosContrato(messages)
    if (numerosContrato.length > 0) {
      const { data: contratos } = await supabase
        .from('contratos')
        .select(`
          id, numero, objeto_pt, tipo, status,
          valor_total_brl, valor_utilizado_brl, valor_comprometido_brl, saldo_brl,
          dt_inicio, dt_fim,
          fornecedores(nome, cpf_cnpj, tipo),
          tdrs(numero, status),
          atividades(codigo, nome_pt)
        `)
        .in('numero', numerosContrato)
        .limit(5)

      if (contratos && contratos.length > 0) {
        contexto += `\n\n## Dados Contratuais (consulta ao vivo)\n`
        for (const c of contratos) {
          contexto += `\n### Contrato ${c.numero}\n`
          contexto += `- Objeto: ${c.objeto_pt ?? 'N/D'}\n`
          contexto += `- Tipo: ${c.tipo ?? 'N/D'}\n`
          contexto += `- Status: ${c.status}\n`
          contexto += `- Fornecedor: ${(c.fornecedores as any)?.nome ?? 'N/D'} (CPF/CNPJ: ${(c.fornecedores as any)?.cpf_cnpj ?? 'N/D'} · ${(c.fornecedores as any)?.tipo ?? ''})\n`
          contexto += `- Atividade: ${(c.atividades as any)?.codigo ?? 'N/D'} — ${(c.atividades as any)?.nome_pt ?? ''}\n`
          contexto += `- TDR vinculado: ${(c.tdrs as any)?.numero ?? 'nenhum'} (status: ${(c.tdrs as any)?.status ?? 'N/D'})\n`
          contexto += `- Valor total contratado: R$ ${Number(c.valor_total_brl ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`
          contexto += `- Valor utilizado: R$ ${Number(c.valor_utilizado_brl ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`
          contexto += `- Valor comprometido: R$ ${Number(c.valor_comprometido_brl ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`
          contexto += `- Saldo disponível: R$ ${Number(c.saldo_brl ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`
          if (c.dt_inicio) contexto += `- Vigência: ${c.dt_inicio} a ${c.dt_fim ?? 'N/D'}\n`

          // Financial summary
          const { data: lancamentos } = await supabase
            .from('execucao_financeira')
            .select('situacao, valor_brl, numero_nf, dt_pagamento, descricao')
            .eq('contrato_id', c.id)
            .order('dt_pagamento', { ascending: false })
            .limit(20)

          if (lancamentos && lancamentos.length > 0) {
            const pagos  = lancamentos.filter(l => l.situacao === 'pago')
            const aPagar = lancamentos.filter(l => l.situacao === 'a_pagar')
            const totalPago   = pagos.reduce((s, l) => s + Number(l.valor_brl ?? 0), 0)
            const totalAPagar = aPagar.reduce((s, l) => s + Number(l.valor_brl ?? 0), 0)
            contexto += `- Pagamentos realizados: ${pagos.length} lançamento(s) · R$ ${totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`
            contexto += `- A pagar: ${aPagar.length} lançamento(s) · R$ ${totalAPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`
            contexto += `- Últimos lançamentos:\n`
            for (const l of lancamentos.slice(0, 5)) {
              contexto += `  · [${l.situacao}] ${l.descricao ?? ''} | NF: ${l.numero_nf ?? 'N/D'} | R$ ${Number(l.valor_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | ${l.dt_pagamento ?? 'sem data'}\n`
            }
          }

          // Products summary
          const { data: produtos } = await supabase
            .from('contratos_produtos')
            .select('numero_produto, descricao, situacao, valor_brl, dt_vencimento, dt_entrega')
            .eq('contrato_id', c.id)
            .order('numero_produto')

          if (produtos && produtos.length > 0) {
            contexto += `- Produtos/Entregas (${produtos.length}):\n`
            for (const p of produtos) {
              contexto += `  · Produto ${p.numero_produto}: ${p.descricao} | R$ ${Number(p.valor_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Status: ${p.situacao} | Venc: ${p.dt_vencimento ?? 'N/D'} | Entregue: ${p.dt_entrega ?? 'não'}\n`
            }
          }
        }
      }
    }

    // ── System prompt ─────────────────────────────────────────────
    const systemPrompt = `Você é o Assistente de Auditoria do projeto DIMA UNESCO — uma plataforma de gestão de contratos, produtos, viagens e execução financeira do Fundo Brasil-ONU, gerenciada pela SEMA/AC.

Seu papel é ajudar a equipe de coordenação a entender, analisar e resolver os achados de auditoria identificados pelo sistema automatizado. Você tem acesso completo aos dados da auditoria mais recente E aos dados contratuais ao vivo quando um número de contrato é mencionado.

**O que você pode fazer:**
- Explicar os achados de forma clara e acessível
- Priorizar o que deve ser resolvido primeiro com base em risco
- Sugerir ações concretas e prazos para corrigir cada inconsistência
- Responder perguntas sobre padrões e tendências encontrados
- Informar valores, datas, fornecedores e status de contratos específicos
- Listar pagamentos realizados e pendentes de um contrato
- Descrever produtos/entregas contratados e seus status
- Ajudar a redigir comentários de resolução para registrar no sistema
- Identificar riscos ocultos ou conexões entre achados
- Traduzir linguagem técnica para linguagem de gestão

**Instruções de formato:**
- Seja objetivo e profissional mas acessível
- Use listas e marcadores quando listar achados ou dados
- Cite os títulos exatos dos achados ao mencioná-los
- Para recomendações de prioridade, use: 🚨 Crítico, ⚠️ Alto, 📋 Médio, 🔵 Baixo
- Responda em português do Brasil
- Quando apresentar valores monetários, use o formato R$ X.XXX,XX

**Dados disponíveis:**
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
