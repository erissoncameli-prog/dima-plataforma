/**
 * auditor-ia — Agente auditor multi-domínio do projeto DIMA UNESCO
 *
 * Arquitetura: 6 "agentes especialistas" (cada um responsável por um domínio)
 * executam queries SQL para detectar anomalias. O "supervisor" (Claude) recebe
 * todos os achados brutos, interpreta, prioriza e escreve o resumo executivo.
 *
 * Domínios: tdr_contrato | financeiro | produtos | viagens | matriz | qualidade_dados
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Tipos ─────────────────────────────────────────────────────────
type Severidade = 'critico' | 'alto' | 'medio' | 'baixo' | 'info'
type Dominio = 'tdr_contrato' | 'financeiro' | 'produtos' | 'viagens' | 'matriz' | 'qualidade_dados'

interface Achado {
  dominio: Dominio
  severidade: Severidade
  titulo: string
  descricao: string
  recomendacao?: string
  referencia_tabela?: string
  referencia_id?: string
  referencia_label?: string
}

// ── SISTEMA DE PROMPT DO SUPERVISOR ──────────────────────────────
const SUPERVISOR_SYSTEM = `Você é um auditor especializado em projetos de cooperação internacional da UNESCO, com foco em conformidade, gestão financeira e governança de projetos ambientais.

Sua tarefa é analisar os achados brutos de auditoria do sistema DIMA (projeto 218BRA2001) e:
1. Identificar os riscos mais críticos e suas causas-raiz
2. Detectar padrões entre os achados (ex: vários produtos sem mapeamento na matriz pode indicar processo quebrado)
3. Priorizar ações corretivas
4. Redigir um resumo executivo claro e objetivo

Responda APENAS com JSON válido neste formato:
{
  "resumo_executivo": "string — 3 a 5 frases descrevendo a situação geral do projeto e os principais riscos identificados",
  "achados_enriquecidos": [
    {
      "indice": 0,
      "recomendacao_refinada": "string — recomendação específica e acionável para este achado",
      "severidade_ajustada": "critico|alto|medio|baixo|info",
      "urgencia": "imediata|esta_semana|este_mes|monitorar"
    }
  ],
  "padroes_detectados": ["string"],
  "acoes_prioritarias": ["string — lista das 3 a 5 ações mais urgentes"]
}`

// ── AGENTE 1: TDR × Contratos ────────────────────────────────────
async function auditarTDRContratos(db: any): Promise<Achado[]> {
  const achados: Achado[] = []

  // 1a. Atividades em fase CONTRATADO mas sem TDR aprovado
  const { data: semTDRAprovado } = await db.rpc('exec_sql_audit', {
    query: `
      SELECT a.id, a.codigo, a.nome_pt,
             COUNT(t.id) FILTER (WHERE t.status = 'aprovado') as tdrs_aprovados,
             COUNT(t.id) as total_tdrs
      FROM atividades a
      LEFT JOIN tdrs t ON t.atividades->>'id' = a.id::text
        OR (t.atividades IS NOT NULL AND t.atividades::jsonb ? 'id' AND (t.atividades->>'id')::uuid = a.id)
      WHERE a.fase = 'CONTRATADO'
      GROUP BY a.id, a.codigo, a.nome_pt
      HAVING COUNT(t.id) FILTER (WHERE t.status = 'aprovado') = 0
      LIMIT 20
    `
  }).catch(() => ({ data: null }))

  // Fallback: query direta sem RPC
  const { data: atividadesContratadas } = await db
    .from('atividades')
    .select('id, codigo, nome_pt, fase')
    .eq('fase', 'CONTRATADO')
    .limit(50)

  if (atividadesContratadas?.length) {
    for (const atv of atividadesContratadas) {
      // Verificar se tem TDR aprovado vinculado
      const { data: tdrs } = await db
        .from('tdrs')
        .select('id, status, numero')
        .or(`atividade_id.eq.${atv.id}`)
        .in('status', ['aprovado', 'em_avaliacao', 'submetido', 'rascunho', 'pendente_correcao'])

      const temAprovado = tdrs?.some((t: any) => t.status === 'aprovado')
      const temAlgum = tdrs && tdrs.length > 0

      if (!temAlgum) {
        achados.push({
          dominio: 'tdr_contrato',
          severidade: 'alto',
          titulo: `Atividade contratada sem nenhum TDR vinculado`,
          descricao: `A atividade ${atv.codigo} — "${atv.nome_pt}" está em fase CONTRATADO mas não possui nenhum TDR associado no sistema. Isso indica que o contrato pode ter sido feito sem o processo formal de elaboração do Termo de Referência.`,
          recomendacao: 'Verificar se o TDR existe físicamente e cadastrá-lo no sistema com o status correto.',
          referencia_tabela: 'atividades',
          referencia_id: atv.id,
          referencia_label: `Atividade ${atv.codigo}`,
        })
      } else if (!temAprovado) {
        const tdrEmAberto = tdrs!.find((t: any) => t.status !== 'aprovado')
        achados.push({
          dominio: 'tdr_contrato',
          severidade: 'critico',
          titulo: `Contrato firmado com TDR não aprovado (${tdrEmAberto?.status})`,
          descricao: `A atividade ${atv.codigo} — "${atv.nome_pt}" está em fase CONTRATADO mas o TDR vinculado está com status "${tdrEmAberto?.status}". O fluxo correto exige TDR aprovado antes da contratação.`,
          recomendacao: 'Concluir o processo de aprovação do TDR imediatamente para regularizar o fluxo. Se o contrato já está em execução, registrar justificativa formal.',
          referencia_tabela: 'tdrs',
          referencia_id: tdrEmAberto?.id,
          referencia_label: `TDR ${tdrEmAberto?.numero} / Atividade ${atv.codigo}`,
        })
      }
    }
  }

  // 1b. TDRs parados em avaliação há muito tempo
  const diasLimite = 14
  const dataLimite = new Date(Date.now() - diasLimite * 24 * 60 * 60 * 1000).toISOString()

  const { data: tdrsParados } = await db
    .from('tdrs')
    .select('id, numero, status, criado_em, objeto_pt')
    .in('status', ['em_avaliacao', 'pendente_correcao', 'submetido'])
    .lt('criado_em', dataLimite)
    .limit(20)

  for (const tdr of tdrsParados || []) {
    const diasParado = Math.floor((Date.now() - new Date(tdr.criado_em).getTime()) / 86400000)
    achados.push({
      dominio: 'tdr_contrato',
      severidade: diasParado > 30 ? 'alto' : 'medio',
      titulo: `TDR ${tdr.numero} parado há ${diasParado} dias (${tdr.status})`,
      descricao: `O TDR ${tdr.numero} sobre "${(tdr.objeto_pt || '').slice(0, 80)}..." está no status "${tdr.status}" há ${diasParado} dias sem movimentação.`,
      recomendacao: 'Verificar com o responsável técnico se há pendências de revisão ou se o TDR pode avançar para aprovação.',
      referencia_tabela: 'tdrs',
      referencia_id: tdr.id,
      referencia_label: `TDR ${tdr.numero}`,
    })
  }

  return achados
}

// ── AGENTE 2: Financeiro ─────────────────────────────────────────
async function auditarFinanceiro(db: any): Promise<Achado[]> {
  const achados: Achado[] = []

  // 2a. Pagamentos sem comprovante — desativado temporariamente (digitalização em andamento)

  // 2b. Contratos com execução acima do valor contratado
  const { data: contratos } = await db
    .from('contratos')
    .select('id, numero, objeto, valor_brl, status')
    .in('status', ['Contratado', 'Em execução', 'contratado', 'em_execucao'])
    .not('valor_brl', 'is', null)
    .limit(50)

  for (const contrato of contratos || []) {
    const { data: lancamentos } = await db
      .from('lancamentos_financeiros')
      .select('valor_brl, execucao_financeira(situacao)')
      .eq('contrato_id', contrato.id)
      .eq('tipo', 'despesa')

    if (!lancamentos?.length) continue

    const totalPago = lancamentos
      .filter((l: any) => l.execucao_financeira?.situacao === 'pago')
      .reduce((sum: number, l: any) => sum + (l.valor_brl || 0), 0)

    const pct = contrato.valor_brl > 0 ? (totalPago / contrato.valor_brl) * 100 : 0

    if (pct > 100) {
      achados.push({
        dominio: 'financeiro',
        severidade: 'critico',
        titulo: `Contrato ${contrato.numero} com execução acima do valor (${Math.round(pct)}%)`,
        descricao: `O contrato "${(contrato.objeto || '').slice(0, 60)}..." tem valor de R$ ${contrato.valor_brl} mas já foram pagos R$ ${totalPago.toFixed(2)} (${Math.round(pct)}% do contrato). Execução acima de 100% pode indicar erro nos lançamentos ou necessidade de aditivo.`,
        recomendacao: 'Verificar se todos os lançamentos estão associados ao contrato correto. Se necessário, formalizar aditivo contratual.',
        referencia_tabela: 'contratos',
        referencia_id: contrato.id,
        referencia_label: `Contrato ${contrato.numero}`,
      })
    } else if (pct > 90) {
      achados.push({
        dominio: 'financeiro',
        severidade: 'medio',
        titulo: `Contrato ${contrato.numero} próximo do limite orçamentário (${Math.round(pct)}%)`,
        descricao: `O contrato "${(contrato.objeto || '').slice(0, 60)}..." já executou ${Math.round(pct)}% do valor contratado.`,
        recomendacao: 'Monitorar lançamentos restantes para não ultrapassar o limite. Avaliar se aditivo será necessário.',
        referencia_tabela: 'contratos',
        referencia_id: contrato.id,
        referencia_label: `Contrato ${contrato.numero}`,
      })
    }
  }

  // 2c. Lançamentos sem contrato vinculado — desativado (diárias e passagens são emitidas diretamente pela UNESCO)

  return achados
}

// ── AGENTE 3: Produtos e Entregas ────────────────────────────────
async function auditarProdutos(db: any): Promise<Achado[]> {
  const achados: Achado[] = []

  // 3a. Produtos aprovados sem contribuição na matriz
  const { data: produtosAprovados } = await db
    .from('produtos_entregas')
    .select(`
      id, numero, descricao, status, data_entrega,
      contratos_produtos_entregas (
        id, produto_codigo, descricao_pt, contrato_id,
        produto_matriz_contribuicao (id)
      )
    `)
    .eq('status', 'aprovado')
    .limit(50)

  for (const prod of produtosAprovados || []) {
    const cpe = prod.contratos_produtos_entregas
    const temContribuicao = cpe?.produto_matriz_contribuicao?.length > 0
    if (!temContribuicao) {
      achados.push({
        dominio: 'produtos',
        severidade: 'alto',
        titulo: `Produto ${prod.numero} aprovado sem mapeamento na Matriz de Resultados`,
        descricao: `O produto "${(prod.descricao || cpe?.descricao_pt || '').slice(0, 80)}..." foi aprovado mas não possui nenhuma contribuição registrada nos indicadores da Matriz de Resultados. Isso compromete a rastreabilidade dos avanços do projeto.`,
        recomendacao: 'Registrar a contribuição deste produto aos indicadores da matriz correspondentes antes de autorizar o pagamento.',
        referencia_tabela: 'produtos_entregas',
        referencia_id: prod.id,
        referencia_label: `Produto ${prod.numero}`,
      })
    }
  }

  // 3b. Produtos em análise há muito tempo
  const dataLimite21 = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
  const { data: produtosParados } = await db
    .from('produtos_entregas')
    .select('id, numero, descricao, status, data_entrega, criado_em')
    .eq('status', 'em_analise')
    .lt('criado_em', dataLimite21)
    .limit(20)

  for (const prod of produtosParados || []) {
    const diasParado = Math.floor((Date.now() - new Date(prod.criado_em).getTime()) / 86400000)
    achados.push({
      dominio: 'produtos',
      severidade: 'medio',
      titulo: `Produto ${prod.numero} em análise há ${diasParado} dias`,
      descricao: `O produto "${(prod.descricao || '').slice(0, 80)}..." está em análise há ${diasParado} dias sem decisão (aprovação ou devolução).`,
      recomendacao: 'Concluir a avaliação do produto. Prazo recomendado: até 15 dias úteis após a submissão.',
      referencia_tabela: 'produtos_entregas',
      referencia_id: prod.id,
      referencia_label: `Produto ${prod.numero}`,
    })
  }

  // 3c. Produtos pagos sem lançamento financeiro correspondente
  const { data: produtosPagos } = await db
    .from('produtos_entregas')
    .select('id, numero, descricao, contratos_produtos_entregas(contrato_id)')
    .eq('status', 'pago')
    .limit(30)

  for (const prod of produtosPagos || []) {
    const contratoId = prod.contratos_produtos_entregas?.contrato_id
    if (!contratoId) continue

    const { data: execucoes } = await db
      .from('execucao_financeira')
      .select('id, situacao')
      .eq('situacao', 'pago')
      .limit(1)

    // Verificação simplificada: se o contrato não tem nenhum pagamento
    const { count } = await db
      .from('lancamentos_financeiros')
      .select('id', { count: 'exact', head: true })
      .eq('contrato_id', contratoId)

    if ((count || 0) === 0) {
      achados.push({
        dominio: 'produtos',
        severidade: 'critico',
        titulo: `Produto ${prod.numero} marcado como PAGO sem lançamento financeiro no contrato`,
        descricao: `O produto "${(prod.descricao || '').slice(0, 80)}..." está com status PAGO mas o contrato associado não possui nenhum lançamento financeiro registrado.`,
        recomendacao: 'Registrar o lançamento financeiro correspondente ao pagamento deste produto com o respectivo comprovante.',
        referencia_tabela: 'produtos_entregas',
        referencia_id: prod.id,
        referencia_label: `Produto ${prod.numero}`,
      })
    }
  }

  // 3d. Entregas marcadas como em avaliação/aprovadas sem nenhum documento comprobatório
  // Rede de segurança para dados anteriores à trigger trg_validar_evidencia_entrega
  // (que bloqueia esse cenário para novos registros) e para eventuais bypass via SQL direto.
  const { data: entregasSemEvidencia } = await db
    .from('contratos_produtos_entregas')
    .select(`
      id, numero_entrega, situacao, dt_entrega, fotos_total, nota_tecnica_url,
      entrega_documentos (id),
      produto_matriz_contribuicao (id),
      contratos_produtos!contratos_produtos_entregas_produto_id_fkey (numero_produto, descricao)
    `)
    .in('situacao', ['em_analise', 'aprovada'])
    .limit(50)

  for (const e of entregasSemEvidencia || []) {
    const temDoc = (e.entrega_documentos || []).length > 0
    const temFoto = (e.fotos_total || 0) > 0
    const temNota = !!e.nota_tecnica_url
    const temIndicador = (e.produto_matriz_contribuicao || []).length > 0
    if (temDoc || temFoto || temNota || temIndicador) continue

    const prod = e.contratos_produtos as any
    achados.push({
      dominio: 'produtos',
      severidade: 'critico',
      titulo: `Produto ${prod?.numero_produto ?? '?'} marcado como "${e.situacao}" sem nenhum documento anexado`,
      descricao: `A entrega nº ${e.numero_entrega} do produto "${(prod?.descricao || '').slice(0, 80)}" está com situação "${e.situacao}" (entregue em ${e.dt_entrega || '?'}) mas não possui documento, foto, nota técnica ou indicador vinculado — provável falha no upload no momento do envio.`,
      recomendacao: 'Confirmar com o consultor se os arquivos foram de fato enviados. Se não houver evidência, devolver o produto para reenvio com os documentos corretos.',
      referencia_tabela: 'contratos_produtos_entregas',
      referencia_id: e.id,
      referencia_label: `Produto ${prod?.numero_produto ?? '?'} — Entrega ${e.numero_entrega}`,
    })
  }

  return achados
}

// ── AGENTE 4: Viagens ────────────────────────────────────────────
async function auditarViagens(db: any): Promise<Achado[]> {
  const achados: Achado[] = []

  // 4a. Viagens concluídas sem relatório
  const { data: semRelatorio } = await db
    .from('viagem_protocolos')
    .select('id, numero, destino, motivo, data_fim, situacao')
    .eq('situacao', 'concluido')
    .is('relatorio_url', null)
    .limit(20)

  for (const viagem of semRelatorio || []) {
    achados.push({
      dominio: 'viagens',
      severidade: 'medio',
      titulo: `Viagem ${viagem.numero} concluída sem relatório de missão`,
      descricao: `A viagem a ${viagem.destino} (motivo: "${(viagem.motivo || '').slice(0, 60)}...") foi concluída em ${viagem.data_fim ? new Date(viagem.data_fim).toLocaleDateString('pt-BR') : '?'} mas não possui relatório de missão anexado.`,
      recomendacao: 'Solicitar ao viajante o preenchimento e envio do relatório de missão no prazo máximo de 5 dias úteis após o retorno.',
      referencia_tabela: 'viagem_protocolos',
      referencia_id: viagem.id,
      referencia_label: `Viagem ${viagem.numero} → ${viagem.destino}`,
    })
  }

  // 4b. Viagens aprovadas com data fim vencida e não concluídas
  const hoje = new Date().toISOString().split('T')[0]
  const { data: vencidas } = await db
    .from('viagem_protocolos')
    .select('id, numero, destino, data_fim, situacao')
    .in('situacao', ['aprovado', 'em_execucao'])
    .lt('data_fim', hoje)
    .limit(20)

  for (const viagem of vencidas || []) {
    const diasAtraso = Math.floor((Date.now() - new Date(viagem.data_fim).getTime()) / 86400000)
    achados.push({
      dominio: 'viagens',
      severidade: diasAtraso > 7 ? 'alto' : 'medio',
      titulo: `Viagem ${viagem.numero} com data encerrada há ${diasAtraso} dias e status "${viagem.situacao}"`,
      descricao: `A viagem a ${viagem.destino} tinha data de retorno ${new Date(viagem.data_fim).toLocaleDateString('pt-BR')} mas ainda está com status "${viagem.situacao}".`,
      recomendacao: 'Atualizar o status da viagem para "concluído" e solicitar o relatório de missão se ainda não foi enviado.',
      referencia_tabela: 'viagem_protocolos',
      referencia_id: viagem.id,
      referencia_label: `Viagem ${viagem.numero}`,
    })
  }

  // 4c. Viagens sem vínculo com atividade
  const { data: semAtividade } = await db
    .from('viagem_protocolos')
    .select('id, numero, destino, situacao')
    .is('atividade_id', null)
    .neq('situacao', 'cancelado')
    .limit(15)

  for (const viagem of semAtividade || []) {
    achados.push({
      dominio: 'viagens',
      severidade: 'baixo',
      titulo: `Viagem ${viagem.numero} sem vínculo com atividade do projeto`,
      descricao: `A viagem a ${viagem.destino} não está associada a nenhuma atividade do projeto, dificultando a rastreabilidade dos custos.`,
      recomendacao: 'Vincular a viagem à atividade correspondente do projeto ou justificar como despesa administrativa geral.',
      referencia_tabela: 'viagem_protocolos',
      referencia_id: viagem.id,
      referencia_label: `Viagem ${viagem.numero}`,
    })
  }

  return achados
}

// ── AGENTE 5: Matriz de Resultados ───────────────────────────────
async function auditarMatriz(db: any): Promise<Achado[]> {
  const achados: Achado[] = []

  // 5a. Contribuições pendentes há muito tempo
  const dataLimite14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: pendentes } = await db
    .from('produto_matriz_contribuicao')
    .select(`
      id, valor, unidade, status, criado_em,
      matriz_itens (id, indicador, produto_codigo),
      contratos_produtos_entregas (id, produto_codigo, descricao_pt)
    `)
    .eq('status', 'pendente')
    .lt('criado_em', dataLimite14)
    .limit(20)

  for (const contrib of pendentes || []) {
    const diasPendente = Math.floor((Date.now() - new Date(contrib.criado_em).getTime()) / 86400000)
    const indicador = contrib.matriz_itens?.indicador || 'indicador não identificado'
    achados.push({
      dominio: 'matriz',
      severidade: diasPendente > 30 ? 'alto' : 'medio',
      titulo: `Contribuição na Matriz pendente de confirmação há ${diasPendente} dias`,
      descricao: `Uma contribuição de ${contrib.valor} ${contrib.unidade || ''} ao indicador "${indicador.slice(0, 60)}..." está pendente de confirmação há ${diasPendente} dias.`,
      recomendacao: 'O responsável financeiro ou coordenação deve confirmar ou rejeitar esta contribuição para manter o progresso atualizado.',
      referencia_tabela: 'produto_matriz_contribuicao',
      referencia_id: contrib.id,
      referencia_label: `Indicador: ${(indicador).slice(0, 40)}...`,
    })
  }

  // 5b. Indicadores sem nenhuma contribuição (mas com atividades ativas)
  const { data: indicadores } = await db
    .from('matriz_itens')
    .select(`
      id, produto_codigo, indicador, meta_numerica, unidade,
      produto_matriz_contribuicao (id, status)
    `)
    .limit(50)

  for (const ind of indicadores || []) {
    const temContrib = ind.produto_matriz_contribuicao?.length > 0
    if (!temContrib && ind.meta_numerica) {
      achados.push({
        dominio: 'matriz',
        severidade: 'info',
        titulo: `Indicador ${ind.produto_codigo} sem nenhuma contribuição registrada`,
        descricao: `O indicador "${(ind.indicador || '').slice(0, 80)}..." (meta: ${ind.meta_numerica} ${ind.unidade || ''}) não possui nenhuma contribuição de produto registrada.`,
        recomendacao: 'Verificar se há produtos entregues que contribuem para este indicador e registrar as contribuições correspondentes.',
        referencia_tabela: 'matriz_itens',
        referencia_id: ind.id,
        referencia_label: `Indicador ${ind.produto_codigo}`,
      })
    }
  }

  return achados
}

// ── AGENTE 6: Qualidade de Dados ─────────────────────────────────
async function auditarQualidadeDados(db: any): Promise<Achado[]> {
  const achados: Achado[] = []

  // 6a. Fornecedores não homologados com contratos ativos
  const { data: fornSemHomolog } = await db
    .from('fornecedores')
    .select(`
      id, codigo, nome_razao_social, status_homologacao,
      contratos (id, numero, status)
    `)
    .neq('status_homologacao', 'aprovado')
    .not('contratos', 'is', null)
    .limit(20)

  for (const forn of fornSemHomolog || []) {
    const contratosAtivos = forn.contratos?.filter((c: any) =>
      ['Contratado', 'Em execução', 'contratado', 'em_execucao'].includes(c.status)
    ) || []

    if (contratosAtivos.length > 0) {
      achados.push({
        dominio: 'qualidade_dados',
        severidade: 'alto',
        titulo: `Fornecedor "${forn.nome_razao_social}" não homologado com ${contratosAtivos.length} contrato(s) ativo(s)`,
        descricao: `O fornecedor ${forn.codigo} — "${forn.nome_razao_social}" possui status de homologação "${forn.status_homologacao}" mas tem ${contratosAtivos.length} contrato(s) ativo(s).`,
        recomendacao: 'Concluir o processo de homologação do fornecedor ou suspender os contratos até regularização.',
        referencia_tabela: 'fornecedores',
        referencia_id: forn.id,
        referencia_label: `Fornecedor ${forn.codigo}`,
      })
    }
  }

  // 6b. Contratos sem fornecedor vinculado
  const { data: contratosSemForn } = await db
    .from('contratos')
    .select('id, numero, objeto, status')
    .is('fornecedor_id', null)
    .in('status', ['Contratado', 'Em execução', 'contratado', 'em_execucao'])
    .limit(15)

  for (const contrato of contratosSemForn || []) {
    achados.push({
      dominio: 'qualidade_dados',
      severidade: 'medio',
      titulo: `Contrato ${contrato.numero} sem fornecedor cadastrado`,
      descricao: `O contrato "${(contrato.objeto || '').slice(0, 60)}..." está ativo mas não possui fornecedor vinculado no sistema.`,
      recomendacao: 'Cadastrar o fornecedor na plataforma e vinculá-lo ao contrato.',
      referencia_tabela: 'contratos',
      referencia_id: contrato.id,
      referencia_label: `Contrato ${contrato.numero}`,
    })
  }

  // 6c. Atividades com fase CONTRATADO mas sem nenhum contrato
  const { data: atividadesContratadas } = await db
    .from('atividades')
    .select('id, codigo, nome_pt, fase')
    .eq('fase', 'CONTRATADO')
    .limit(30)

  for (const atv of atividadesContratadas || []) {
    const { count } = await db
      .from('contratos')
      .select('id', { count: 'exact', head: true })
      .eq('atividade_id', atv.id)

    if ((count || 0) === 0) {
      achados.push({
        dominio: 'qualidade_dados',
        severidade: 'medio',
        titulo: `Atividade ${atv.codigo} em fase "Contratado" sem contratos no sistema`,
        descricao: `A atividade "${atv.nome_pt}" está marcada como CONTRATADA mas não há contratos cadastrados no sistema para ela.`,
        recomendacao: 'Cadastrar o contrato correspondente ou revisar a fase da atividade.',
        referencia_tabela: 'atividades',
        referencia_id: atv.id,
        referencia_label: `Atividade ${atv.codigo}`,
      })
    }
  }

  return achados
}

// ── SUPERVISOR: Claude analisa todos os achados ──────────────────
async function executarSupervisor(
  anthropic: Anthropic,
  achados: Achado[],
  execucaoId: string
): Promise<{ resumo: string; tokens: number; achadosEnriquecidos: Achado[] }> {
  if (achados.length === 0) {
    return {
      resumo: 'A auditoria não identificou inconsistências ou violações de conformidade no sistema. Todos os fluxos verificados estão dentro dos parâmetros esperados.',
      tokens: 0,
      achadosEnriquecidos: [],
    }
  }

  const achadosParaIA = achados.slice(0, 40).map((a, i) => ({
    indice: i,
    dominio: a.dominio,
    severidade: a.severidade,
    titulo: a.titulo,
    descricao: a.descricao,
  }))

  const prompt = `Você recebeu ${achados.length} achados de auditoria do sistema DIMA (projeto UNESCO 218BRA2001 — Resiliência Socioambiental no Acre).

ACHADOS:
${JSON.stringify(achadosParaIA, null, 2)}

Analise os achados e retorne o JSON de avaliação conforme o formato especificado.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: SUPERVISOR_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    const texto = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

    let analise: any = {}
    try { analise = JSON.parse(limpo) } catch { /* usa defaults */ }

    // Enriquecer achados com recomendações da IA
    const achadosEnriquecidos = achados.map((a, i) => {
      const enriquecido = analise.achados_enriquecidos?.find((e: any) => e.indice === i)
      return {
        ...a,
        recomendacao: enriquecido?.recomendacao_refinada || a.recomendacao,
        severidade: (enriquecido?.severidade_ajustada as Severidade) || a.severidade,
      }
    })

    const resumo = [
      analise.resumo_executivo || '',
      analise.acoes_prioritarias?.length
        ? '\n\nAções prioritárias:\n' + analise.acoes_prioritarias.map((a: string) => `• ${a}`).join('\n')
        : '',
      analise.padroes_detectados?.length
        ? '\n\nPadrões detectados:\n' + analise.padroes_detectados.map((p: string) => `• ${p}`).join('\n')
        : '',
    ].join('')

    return {
      resumo,
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      achadosEnriquecidos,
    }
  } catch (e) {
    console.error('[auditor-ia] Supervisor falhou:', e)
    return {
      resumo: `Auditoria concluída com ${achados.length} achados. Análise de IA indisponível — revisar manualmente.`,
      tokens: 0,
      achadosEnriquecidos: achados,
    }
  }
}

// ── MAIN ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json().catch(() => ({}))
    const { usuario_id } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    // Criar registro de execução
    const { data: execucao } = await supabase
      .from('auditoria_execucoes')
      .insert({
        disparado_por: usuario_id || null,
        status: 'rodando',
      })
      .select()
      .single()

    const execucaoId = execucao?.id

    console.log(`[auditor-ia] Execução iniciada: ${execucaoId}`)

    // Executar todos os agentes em paralelo
    const [
      achadosTDR,
      achadosFinanceiro,
      achadosProdutos,
      achadosViagens,
      achadosMatriz,
      achadosQualidade,
    ] = await Promise.all([
      auditarTDRContratos(supabase).catch(e => { console.error('Agente TDR falhou:', e); return [] as Achado[] }),
      auditarFinanceiro(supabase).catch(e => { console.error('Agente Financeiro falhou:', e); return [] as Achado[] }),
      auditarProdutos(supabase).catch(e => { console.error('Agente Produtos falhou:', e); return [] as Achado[] }),
      auditarViagens(supabase).catch(e => { console.error('Agente Viagens falhou:', e); return [] as Achado[] }),
      auditarMatriz(supabase).catch(e => { console.error('Agente Matriz falhou:', e); return [] as Achado[] }),
      auditarQualidadeDados(supabase).catch(e => { console.error('Agente Qualidade falhou:', e); return [] as Achado[] }),
    ])

    const todosAchados = [
      ...achadosTDR,
      ...achadosFinanceiro,
      ...achadosProdutos,
      ...achadosViagens,
      ...achadosMatriz,
      ...achadosQualidade,
    ]

    console.log(`[auditor-ia] ${todosAchados.length} achados brutos coletados`)

    // Supervisor Claude enriquece e prioriza
    const { resumo, tokens, achadosEnriquecidos } = await executarSupervisor(
      anthropic, todosAchados, execucaoId
    )

    // Salvar achados na tabela
    if (achadosEnriquecidos.length > 0) {
      const registros = achadosEnriquecidos.map(a => ({
        ...a,
        execucao_id: execucaoId,
        status: 'aberto',
        modelo_ia: 'claude-sonnet-4-6',
      }))

      await supabase.from('auditoria_registros').insert(registros)
    }

    // Atualizar execução como concluída
    const criticos = achadosEnriquecidos.filter(a => a.severidade === 'critico').length
    const altos    = achadosEnriquecidos.filter(a => a.severidade === 'alto').length

    await supabase
      .from('auditoria_execucoes')
      .update({
        status: 'concluido',
        concluido_em: new Date().toISOString(),
        resumo_geral: resumo,
        total_achados: achadosEnriquecidos.length,
        achados_criticos: criticos,
        achados_altos: altos,
        tokens_usados: tokens,
      })
      .eq('id', execucaoId)

    return Response.json({
      execucao_id: execucaoId,
      total_achados: achadosEnriquecidos.length,
      achados_criticos: criticos,
      achados_altos: altos,
      resumo,
      por_dominio: {
        tdr_contrato: achadosTDR.length,
        financeiro: achadosFinanceiro.length,
        produtos: achadosProdutos.length,
        viagens: achadosViagens.length,
        matriz: achadosMatriz.length,
        qualidade_dados: achadosQualidade.length,
      },
    }, { headers: CORS })

  } catch (e) {
    console.error('[auditor-ia] Erro fatal:', e)
    return Response.json({ error: (e as Error).message }, { status: 500, headers: CORS })
  }
})
