/**
 * auditor-ia — Agente auditor multi-domínio do projeto DIMA UNESCO
 *
 * Arquitetura: 7 "agentes especialistas" (cada um responsável por um domínio)
 * executam queries SQL para detectar anomalias. O "supervisor" (Claude) recebe
 * todos os achados brutos, interpreta, prioriza e escreve o resumo executivo.
 *
 * Domínios: tdr_contrato | financeiro | produtos | viagens | matriz | qualidade_dados
 * O agente de orçamento (razão, cobertura de contrato, cadeia de remanejamento,
 * PTAX) grava como 'financeiro' — o check de auditoria_registros.dominio não
 * tem 'orcamento' (mudar exige DROP no SQL Editor). Regras em fn_auditoria_orcamento().
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

const SUPERVISOR_SYSTEM = `Você é um auditor especializado em projetos de cooperação internacional da UNESCO, com foco em conformidade, gestão financeira e governança de projetos ambientais.

Sua tarefa é analisar os achados brutos de auditoria do sistema DIMA (projeto 218BRA2001) e:
1. Identificar os riscos mais críticos e suas causas-raiz
2. Detectar padrões entre os achados (ex: vários produtos sem mapeamento na matriz pode indicar processo quebrado)
3. Priorizar ações corretivas
4. Redigir um resumo executivo claro e objetivo

Achados com título iniciado por "Orçamento:" vêm do razão orçamentário (remanejamento entre atividades, cobertura de contrato acima do TDR, cotação PTAX). Falha de conferência do razão é sempre crítica: indica que o orçamento registrado não bate com seus lançamentos.

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

async function auditarTDRContratos(db: any): Promise<Achado[]> {
  const achados: Achado[] = []

  // 1a. Atividades em fase CONTRATADO sem TDR em fase pós-aprovação.
  // Vínculo é tdrs.atividade_id (não existe tdrs.atividades). "Aprovado" inclui as
  // fases seguintes: aprovado → em_licitacao → contratado (FASES_POS_APROVACAO em tdrs.html).
  const POS_APROVACAO = ['aprovado', 'em_licitacao', 'contratado']
  const { data: atividadesContratadas } = await db
    .from('atividades')
    .select('id, codigo, nome_pt, fase, tdrs(id, numero, status)')
    .eq('fase', 'CONTRATADO')
    .limit(50)

  for (const atv of atividadesContratadas || []) {
    const tdrs = (atv.tdrs || []).filter((t: any) => t.status !== 'cancelado')
    const temAprovado = tdrs.some((t: any) => POS_APROVACAO.includes(t.status))

    if (tdrs.length === 0) {
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
      const tdrEmAberto = tdrs[0]
      achados.push({
        dominio: 'tdr_contrato',
        severidade: 'critico',
        titulo: `Contrato firmado com TDR não aprovado (${tdrEmAberto?.status})`,
        descricao: `A atividade ${atv.codigo} — "${atv.nome_pt}" está em fase CONTRATADO mas nenhum TDR vinculado passou da aprovação (o TDR ${tdrEmAberto?.numero} está "${tdrEmAberto?.status}"). O fluxo correto exige TDR aprovado antes da contratação.`,
        recomendacao: 'Concluir o processo de aprovação do TDR imediatamente para regularizar o fluxo. Se o contrato já está em execução, registrar justificativa formal.',
        referencia_tabela: 'tdrs',
        referencia_id: tdrEmAberto?.id,
        referencia_label: `TDR ${tdrEmAberto?.numero} / Atividade ${atv.codigo}`,
      })
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

async function auditarFinanceiro(db: any): Promise<Achado[]> {
  const achados: Achado[] = []

  // 2a. Pagamentos sem comprovante — desativado temporariamente (digitalização em andamento)

  // 2b. Contratos com execução acima do valor contratado.
  // valor_utilizado_brl (soma paga) e valor_comprometido_brl (soma paga + a_pagar)
  // são recalculados por trigger (fn_recalcular_utilizado_contrato) toda vez que
  // execucao_financeira muda — não precisa somar de novo aqui.
  const { data: contratos } = await db
    .from('contratos')
    .select('id, numero, objeto_pt, valor_total_brl, valor_utilizado_brl, valor_comprometido_brl, status')
    .eq('status', 'vigente')
    .gt('valor_total_brl', 0)
    .limit(50)

  for (const contrato of contratos || []) {
    const pctPago = (contrato.valor_utilizado_brl / contrato.valor_total_brl) * 100
    const pctComprometido = (contrato.valor_comprometido_brl / contrato.valor_total_brl) * 100

    if (pctPago > 100) {
      achados.push({
        dominio: 'financeiro',
        severidade: 'critico',
        titulo: `Contrato ${contrato.numero} com valor pago acima do contratado (${Math.round(pctPago)}%)`,
        descricao: `O contrato "${(contrato.objeto_pt || '').slice(0, 60)}..." tem valor de R$ ${contrato.valor_total_brl} mas já foram pagos R$ ${contrato.valor_utilizado_brl} (${Math.round(pctPago)}% do contrato). Execução acima de 100% pode indicar erro nos lançamentos ou necessidade de aditivo.`,
        recomendacao: 'Verificar se todos os lançamentos de execução financeira estão associados ao contrato correto. Se necessário, formalizar aditivo contratual.',
        referencia_tabela: 'contratos',
        referencia_id: contrato.id,
        referencia_label: `Contrato ${contrato.numero}`,
      })
    } else if (pctComprometido > 100) {
      achados.push({
        dominio: 'financeiro',
        severidade: 'alto',
        titulo: `Contrato ${contrato.numero} com valor comprometido acima do contratado (${Math.round(pctComprometido)}%)`,
        descricao: `O contrato "${(contrato.objeto_pt || '').slice(0, 60)}..." tem valor de R$ ${contrato.valor_total_brl} mas soma pago + a pagar já chega a R$ ${contrato.valor_comprometido_brl} (${Math.round(pctComprometido)}% do contrato).`,
        recomendacao: 'Revisar os lançamentos pendentes de pagamento (situação "a_pagar") antes que o contrato estoure o valor total.',
        referencia_tabela: 'contratos',
        referencia_id: contrato.id,
        referencia_label: `Contrato ${contrato.numero}`,
      })
    } else if (pctPago > 90) {
      achados.push({
        dominio: 'financeiro',
        severidade: 'medio',
        titulo: `Contrato ${contrato.numero} próximo do limite orçamentário (${Math.round(pctPago)}%)`,
        descricao: `O contrato "${(contrato.objeto_pt || '').slice(0, 60)}..." já executou ${Math.round(pctPago)}% do valor contratado.`,
        recomendacao: 'Monitorar lançamentos restantes para não ultrapassar o limite. Avaliar se aditivo será necessário.',
        referencia_tabela: 'contratos',
        referencia_id: contrato.id,
        referencia_label: `Contrato ${contrato.numero}`,
      })
    }
  }

  // 2c. Execução financeira "a_pagar" vencida há muito tempo
  const hojeISO = new Date().toISOString().split('T')[0]
  const { data: vencidos } = await db
    .from('execucao_financeira')
    .select('id, descricao, valor_brl, dt_vencimento, contrato_id, contratos(numero)')
    .eq('situacao', 'a_pagar')
    .not('dt_vencimento', 'is', null)
    .lt('dt_vencimento', hojeISO)
    .limit(30)

  for (const ef of vencidos || []) {
    const diasAtraso = Math.floor((Date.now() - new Date(ef.dt_vencimento).getTime()) / 86400000)
    achados.push({
      dominio: 'financeiro',
      severidade: diasAtraso > 15 ? 'alto' : 'medio',
      titulo: `Lançamento financeiro vencido há ${diasAtraso} dias (R$ ${ef.valor_brl})`,
      descricao: `"${(ef.descricao || '').slice(0, 80)}" está com situação "a_pagar" e vencimento em ${new Date(ef.dt_vencimento).toLocaleDateString('pt-BR')}, ${diasAtraso} dias atrás.${ef.contratos?.numero ? ` Contrato ${ef.contratos.numero}.` : ''}`,
      recomendacao: 'Verificar o motivo do atraso e regularizar o pagamento ou atualizar a situação do lançamento.',
      referencia_tabela: 'execucao_financeira',
      referencia_id: ef.id,
      referencia_label: ef.contratos?.numero ? `Contrato ${ef.contratos.numero}` : 'Execução financeira',
    })
  }

  return achados
}

async function auditarProdutos(db: any): Promise<Achado[]> {
  const achados: Achado[] = []

  // 3a. Entregas aprovadas sem contribuição na matriz.
  // produto_matriz_contribuicao.produto_id referencia contratos_produtos_entregas(id)
  // — não existe tabela "produtos_entregas".
  const { data: entregasAprovadas } = await db
    .from('contratos_produtos_entregas')
    .select(`
      id, numero_entrega, valor_entregue,
      contratos_produtos (numero_produto, descricao, contrato_id),
      produto_matriz_contribuicao (id)
    `)
    .eq('situacao', 'aprovada')
    .limit(50)

  for (const entrega of entregasAprovadas || []) {
    const cp = entrega.contratos_produtos
    const temContribuicao = entrega.produto_matriz_contribuicao?.length > 0
    if (!temContribuicao) {
      achados.push({
        dominio: 'produtos',
        severidade: 'alto',
        titulo: `Produto ${cp?.numero_produto ?? '?'} (entrega ${entrega.numero_entrega}) aprovado sem mapeamento na Matriz de Resultados`,
        descricao: `A entrega "${(cp?.descricao || '').slice(0, 80)}..." foi aprovada mas não possui nenhuma contribuição registrada nos indicadores da Matriz de Resultados. Isso compromete a rastreabilidade dos avanços do projeto.`,
        recomendacao: 'Registrar a contribuição deste produto aos indicadores da matriz correspondentes antes de autorizar o pagamento.',
        referencia_tabela: 'contratos_produtos_entregas',
        referencia_id: entrega.id,
        referencia_label: `Produto ${cp?.numero_produto ?? '?'} / Entrega ${entrega.numero_entrega}`,
      })
    }
  }

  // 3b. Produtos em análise há muito tempo (contratos_produtos.situacao)
  const dataLimite21 = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
  const { data: produtosParados } = await db
    .from('contratos_produtos')
    .select('id, numero_produto, descricao, situacao, atualizado_em, contrato_id')
    .eq('situacao', 'em_analise')
    .lt('atualizado_em', dataLimite21)
    .limit(20)

  for (const prod of produtosParados || []) {
    const diasParado = Math.floor((Date.now() - new Date(prod.atualizado_em).getTime()) / 86400000)
    achados.push({
      dominio: 'produtos',
      severidade: 'medio',
      titulo: `Produto ${prod.numero_produto} em análise há ${diasParado} dias`,
      descricao: `O produto "${(prod.descricao || '').slice(0, 80)}..." está em análise há ${diasParado} dias sem decisão (aprovação ou devolução).`,
      recomendacao: 'Concluir a avaliação do produto. Prazo recomendado: até 15 dias úteis após a submissão.',
      referencia_tabela: 'contratos_produtos',
      referencia_id: prod.id,
      referencia_label: `Produto ${prod.numero_produto}`,
    })
  }

  // 3c. Produtos pagos sem nenhum lançamento financeiro "pago" no contrato
  const { data: produtosPagos } = await db
    .from('contratos_produtos')
    .select('id, numero_produto, descricao, contrato_id')
    .eq('situacao', 'pago')
    .limit(30)

  for (const prod of produtosPagos || []) {
    if (!prod.contrato_id) continue

    const { count } = await db
      .from('execucao_financeira')
      .select('id', { count: 'exact', head: true })
      .eq('contrato_id', prod.contrato_id)
      .eq('situacao', 'pago')

    if ((count || 0) === 0) {
      achados.push({
        dominio: 'produtos',
        severidade: 'critico',
        titulo: `Produto ${prod.numero_produto} marcado como PAGO sem execução financeira paga no contrato`,
        descricao: `O produto "${(prod.descricao || '').slice(0, 80)}..." está com situação PAGO mas o contrato associado não possui nenhum lançamento de execução financeira com situação "pago".`,
        recomendacao: 'Registrar o lançamento de execução financeira correspondente ao pagamento deste produto com o respectivo comprovante.',
        referencia_tabela: 'contratos_produtos',
        referencia_id: prod.id,
        referencia_label: `Produto ${prod.numero_produto}`,
      })
    }
  }

  return achados
}

async function auditarViagens(db: any): Promise<Achado[]> {
  const achados: Achado[] = []

  // 4a. Viagens realizadas com algum viajante sem relatório de missão.
  // relatorio_url mora em viagem_viajantes (um por viajante), não em
  // viagem_protocolos. situacao real usada nos dados é 'realizado', não
  // 'concluido'.
  const { data: viagensRealizadas } = await db
    .from('viagem_protocolos')
    .select('id, numero, destino_principal, objetivo, dt_retorno, situacao, viagem_viajantes(id, nome, relatorio_url)')
    .eq('situacao', 'realizado')
    .limit(20)

  for (const viagem of viagensRealizadas || []) {
    const viajantes: any[] = viagem.viagem_viajantes || []
    const semRelatorio = viajantes.filter((v) => !v.relatorio_url)
    if (semRelatorio.length > 0) {
      achados.push({
        dominio: 'viagens',
        severidade: 'medio',
        titulo: `Viagem ${viagem.numero} realizada com ${semRelatorio.length} viajante(s) sem relatório de missão`,
        descricao: `A viagem a ${viagem.destino_principal} (objetivo: "${(viagem.objetivo || '').slice(0, 60)}...") foi realizada${viagem.dt_retorno ? ' com retorno em ' + new Date(viagem.dt_retorno).toLocaleDateString('pt-BR') : ''}, mas ${semRelatorio.map((v) => v.nome).join(', ')} ainda não anexou(aram) relatório de missão.`,
        recomendacao: 'Solicitar ao(s) viajante(s) o preenchimento e envio do relatório de missão no prazo máximo de 5 dias úteis após o retorno.',
        referencia_tabela: 'viagem_protocolos',
        referencia_id: viagem.id,
        referencia_label: `Viagem ${viagem.numero} → ${viagem.destino_principal}`,
      })
    }
  }

  // 4b. Viagens aprovadas com data de retorno vencida e não realizadas
  const hoje = new Date().toISOString().split('T')[0]
  const { data: vencidas } = await db
    .from('viagem_protocolos')
    .select('id, numero, destino_principal, dt_retorno, situacao')
    .in('situacao', ['aprovado', 'em_execucao'])
    .lt('dt_retorno', hoje)
    .limit(20)

  for (const viagem of vencidas || []) {
    const diasAtraso = Math.floor((Date.now() - new Date(viagem.dt_retorno).getTime()) / 86400000)
    achados.push({
      dominio: 'viagens',
      severidade: diasAtraso > 7 ? 'alto' : 'medio',
      titulo: `Viagem ${viagem.numero} com data encerrada há ${diasAtraso} dias e status "${viagem.situacao}"`,
      descricao: `A viagem a ${viagem.destino_principal} tinha data de retorno ${new Date(viagem.dt_retorno).toLocaleDateString('pt-BR')} mas ainda está com status "${viagem.situacao}".`,
      recomendacao: 'Atualizar o status da viagem para "realizado" e solicitar o relatório de missão se ainda não foi enviado.',
      referencia_tabela: 'viagem_protocolos',
      referencia_id: viagem.id,
      referencia_label: `Viagem ${viagem.numero}`,
    })
  }

  const { data: semAtividade } = await db
    .from('viagem_protocolos')
    .select('id, numero, destino_principal, situacao')
    .is('atividade_id', null)
    .neq('situacao', 'cancelado')
    .limit(15)

  for (const viagem of semAtividade || []) {
    achados.push({
      dominio: 'viagens',
      severidade: 'baixo',
      titulo: `Viagem ${viagem.numero} sem vínculo com atividade do projeto`,
      descricao: `A viagem a ${viagem.destino_principal} não está associada a nenhuma atividade do projeto.`,
      recomendacao: 'Vincular a viagem à atividade correspondente ou justificar como despesa administrativa geral.',
      referencia_tabela: 'viagem_protocolos',
      referencia_id: viagem.id,
      referencia_label: `Viagem ${viagem.numero}`,
    })
  }

  return achados
}

async function auditarMatriz(db: any): Promise<Achado[]> {
  const achados: Achado[] = []

  const dataLimite14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: pendentes } = await db
    .from('produto_matriz_contribuicao')
    .select(`
      id, valor, status, criado_em,
      matriz_itens (id, indicador, produto_codigo)
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
      descricao: `Uma contribuição ao indicador "${indicador.slice(0, 60)}..." está pendente de confirmação há ${diasPendente} dias.`,
      recomendacao: 'O responsável financeiro ou coordenação deve confirmar ou rejeitar esta contribuição.',
      referencia_tabela: 'produto_matriz_contribuicao',
      referencia_id: contrib.id,
      referencia_label: `Indicador: ${indicador.slice(0, 40)}...`,
    })
  }

  const { data: indicadores } = await db
    .from('matriz_itens')
    .select(`id, produto_codigo, indicador, meta_numerica, produto_matriz_contribuicao (id, status)`)
    .limit(50)

  for (const ind of indicadores || []) {
    const temContrib = ind.produto_matriz_contribuicao?.length > 0
    if (!temContrib && ind.meta_numerica) {
      achados.push({
        dominio: 'matriz',
        severidade: 'info',
        titulo: `Indicador ${ind.produto_codigo} sem nenhuma contribuição registrada`,
        descricao: `O indicador "${(ind.indicador || '').slice(0, 80)}..." não possui nenhuma contribuição de produto registrada.`,
        recomendacao: 'Verificar se há produtos entregues que contribuem para este indicador.',
        referencia_tabela: 'matriz_itens',
        referencia_id: ind.id,
        referencia_label: `Indicador ${ind.produto_codigo}`,
      })
    }
  }

  return achados
}

async function auditarQualidadeDados(db: any): Promise<Achado[]> {
  const achados: Achado[] = []

  // 6b. Contratos sem fornecedor vinculado
  const { data: contratosSemForn } = await db
    .from('contratos')
    .select('id, numero, objeto_pt, status')
    .is('fornecedor_id', null)
    .eq('status', 'vigente')
    .limit(15)

  for (const contrato of contratosSemForn || []) {
    achados.push({
      dominio: 'qualidade_dados',
      severidade: 'medio',
      titulo: `Contrato ${contrato.numero} sem fornecedor cadastrado`,
      descricao: `O contrato "${(contrato.objeto_pt || '').slice(0, 60)}..." está vigente mas não possui fornecedor vinculado no sistema.`,
      recomendacao: 'Cadastrar o fornecedor na plataforma e vinculá-lo ao contrato.',
      referencia_tabela: 'contratos',
      referencia_id: contrato.id,
      referencia_label: `Contrato ${contrato.numero}`,
    })
  }

  // 6c. Atividades com fase CONTRATADO mas sem nenhum contrato (usando atividade_id FK correta)
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
        descricao: `A atividade "${atv.nome_pt}" está marcada como CONTRATADA mas não há contratos cadastrados vinculados a ela.`,
        recomendacao: 'Cadastrar o contrato correspondente ou revisar a fase da atividade.',
        referencia_tabela: 'atividades',
        referencia_id: atv.id,
        referencia_label: `Atividade ${atv.codigo}`,
      })
    }
  }

  return achados
}

// ── AGENTE 7: Orçamento (razão, cobertura de contrato, cadeia de remanejamento, PTAX) ──
// As regras moram no banco (fn_auditoria_orcamento, só service_role) para que o
// auditor e a conferência do razão nunca divirjam. Aqui só se converte o formato.
async function auditarOrcamento(db: any): Promise<Achado[]> {
  const { data, error } = await db.rpc('fn_auditoria_orcamento')
  if (error) throw error
  return (data || []).map((r: any) => ({
    dominio: 'financeiro' as Dominio,
    severidade: r.severidade as Severidade,
    titulo: r.titulo,
    descricao: r.descricao,
    recomendacao: r.recomendacao || undefined,
    referencia_tabela: r.referencia_tabela || undefined,
    referencia_id: r.referencia_id || undefined,
    referencia_label: r.referencia_label || undefined,
  }))
}

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

    const achadosEnriquecidos = achados.map((a, i) => {
      const enriquecido = analise.achados_enriquecidos?.find((e: any) => e.indice === i)
      // falha de conferência do razão não é rebaixada pela IA
      const fixo = a.severidade === 'critico' && a.titulo.startsWith('Orçamento:')
      return {
        ...a,
        recomendacao: enriquecido?.recomendacao_refinada || a.recomendacao,
        severidade: fixo ? a.severidade : ((enriquecido?.severidade_ajustada as Severidade) || a.severidade),
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

    const { data: execucao } = await supabase
      .from('auditoria_execucoes')
      .insert({ disparado_por: usuario_id || null, status: 'rodando' })
      .select()
      .single()

    const execucaoId = execucao?.id
    console.log(`[auditor-ia] Execução iniciada: ${execucaoId}`)

    const [
      achadosTDR,
      achadosFinanceiro,
      achadosProdutos,
      achadosViagens,
      achadosMatriz,
      achadosQualidade,
      achadosOrcamento,
    ] = await Promise.all([
      auditarTDRContratos(supabase).catch(e => { console.error('Agente TDR falhou:', e); return [] as Achado[] }),
      auditarFinanceiro(supabase).catch(e => { console.error('Agente Financeiro falhou:', e); return [] as Achado[] }),
      auditarProdutos(supabase).catch(e => { console.error('Agente Produtos falhou:', e); return [] as Achado[] }),
      auditarViagens(supabase).catch(e => { console.error('Agente Viagens falhou:', e); return [] as Achado[] }),
      auditarMatriz(supabase).catch(e => { console.error('Agente Matriz falhou:', e); return [] as Achado[] }),
      auditarQualidadeDados(supabase).catch(e => { console.error('Agente Qualidade falhou:', e); return [] as Achado[] }),
      auditarOrcamento(supabase).catch(e => { console.error('Agente Orçamento falhou:', e); return [] as Achado[] }),
    ])

    // Orçamento primeiro: o supervisor só recebe os 40 primeiros achados
    const todosAchados = [
      ...achadosOrcamento.filter(a => a.severidade === 'critico'),
      ...achadosTDR,
      ...achadosFinanceiro,
      ...achadosOrcamento.filter(a => a.severidade !== 'critico'),
      ...achadosProdutos,
      ...achadosViagens,
      ...achadosMatriz,
      ...achadosQualidade,
    ]

    console.log(`[auditor-ia] ${todosAchados.length} achados brutos coletados`)

    const { resumo, tokens, achadosEnriquecidos } = await executarSupervisor(
      anthropic, todosAchados, execucaoId
    )

    if (achadosEnriquecidos.length > 0) {
      const registros = achadosEnriquecidos.map(a => ({
        ...a,
        execucao_id: execucaoId,
        status: 'aberto',
        modelo_ia: 'claude-sonnet-4-6',
      }))
      await supabase.from('auditoria_registros').insert(registros)
    }

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
        orcamento: achadosOrcamento.length,
      },
    }, { headers: CORS })

  } catch (e) {
    console.error('[auditor-ia] Erro fatal:', e)
    return Response.json({ error: (e as Error).message }, { status: 500, headers: CORS })
  }
})
