// Semente de estresse: Orçamento (Or1–Or4) e Patrimônio (Pt1–Pt8).
'use strict'
const SA = '00000000-0000-0000-0000-0000000000a1'
const uid = (p, i) => `${p}-0000-4000-8000-${String(i).padStart(12, '0')}`
const LONGO = 'Remanejamento necessário para recompor a dotação da atividade em razão da revisão do plano de trabalho aprovada pela UNESCO, considerando a reprogramação das oficinas comunitárias nas Áreas de Proteção Ambiental, o aumento dos custos logísticos de deslocamento fluvial no período de cheia e a necessidade de contratar consultoria especializada adicional para a sistematização dos resultados do diagnóstico socioambiental junto às comunidades tradicionais.'
const pick = (a, i) => a[i % a.length]
const dia = (i, base = '2026-') => `${base}${String(1 + (i % 11)).padStart(2, '0')}-${String(1 + (i * 7) % 27).padStart(2, '0')}`

const NOMES = ['Maria Auxiliadora do Socorro Nascimento Albuquerque', 'José Raimundo Bezerra de Oliveira Filho', 'Francisca Antônia Cavalcante da Silva Monteiro',
  'Italo do O Ferreira', 'Raimunda Nonata Pereira de Souza Castelo Branco', 'Antônio Carlos Magalhães Rodrigues Neto']
const usuarios = NOMES.map((n, i) => ({ id: uid('aaaaaaaa', i + 1), nome_completo: n, email: `u${i}@x.br`, perfil: pick(['coordenacao', 'tecnico', 'financeiro'], i), ativo: true }))
const atividades = Array.from({ length: 12 }, (_, i) => ({ id: uid('bbbbbbbb', i + 1), codigo: `${1 + (i % 4)}.${1 + (i % 3)}.${i + 1}`,
  nome_pt: `Atividade de fortalecimento da gestão territorial e ambiental número ${i + 1} nas APAs do Acre`, orcamento_usd: 150000 + i * 98765.43 }))
const AT = i => ({ codigo: atividades[i % 12].codigo })

const SIT = ['rascunho', 'em_aprovacao', 'efetivado', 'recusado', 'cancelado', 'estornado']
const remanejamentos = Array.from({ length: 24 }, (_, i) => {
  const n = 2 + (i % 4)
  const itens = []
  let tot = 0
  for (let k = 0; k < n - 1; k++) { const v = 12345.67 * (k + 1) * (i + 1); tot += v; itens.push({ atividade_id: atividades[(i + k) % 12].id, valor_usd: -v, ativo: true, atividade: AT(i + k) }) }
  itens.push({ atividade_id: atividades[(i + 7) % 12].id, valor_usd: tot, ativo: true, atividade: AT(i + 7) })
  if (i % 5 === 0) itens.push({ atividade_id: atividades[3].id, valor_usd: 999, ativo: false, atividade: AT(3) })
  return { id: uid('cccccccc', i + 1), numero: `REM-2026-${String(i + 1).padStart(4, '0')}`, tipo: i % 6 === 0 ? 'cobertura_contrato' : 'livre', status: pick(SIT, i),
    justificativa: i % 7 === 3 ? null : LONGO + (i % 2 ? ' ' + LONGO : ''), criado_em: dia(i) + 'T12:00:00Z', submetido_em: dia(i) + 'T13:00:00Z',
    efetivado_em: pick(SIT, i) === 'efetivado' ? dia(i + 1) + 'T15:00:00Z' : null, estorno_de: i % 9 === 8 ? uid('cccccccc', i) : null,
    contrato: i % 6 === 0 ? { numero: `45005631${10 + i}`, fornecedores: { nome: 'Consórcio Amazônia Viva de Consultoria Socioambiental e Engenharia Florestal Ltda' } } : null,
    solicitante: { nome_completo: pick(NOMES, i) }, itens }
})

const MOT = ['licitacao_deserta', 'licitacao_fracassada', 'sem_necessidade', 'substituido', 'outro']
const tdr_cancelamentos = Array.from({ length: 18 }, (_, i) => ({ id: uid('dddddddd', i + 1), numero: `TCAN-2026-${String(i + 1).padStart(4, '0')}`,
  tdr_numero: `${1 + (i % 4)}.${1 + i % 3}.${i + 1}-00${1 + (i % 3)}`, tdr_objeto: 'Objeto longo do TDR', valor_usd: i % 4 === 0 ? null : 76190.48 * (i + 1), valor_brl: 400000.12 * (i + 1),
  motivo_tipo: pick(MOT, i), justificativa: LONGO, status: pick(SIT.filter(s => s !== 'estornado'), i), criado_em: dia(i) + 'T10:00:00Z',
  efetivado_em: i % 3 === 0 ? dia(i + 2) + 'T10:00:00Z' : null, nota_nome: `Nota_Tecnica_SEI_${i}_cancelamento_TDR_licitacao_deserta_versao_final_assinada.pdf`,
  atividade_id: atividades[i % 12].id, atividade: AT(i) }))

const contrato_encerramentos = Array.from({ length: 22 }, (_, i) => ({ id: uid('eeeeeeee', i + 1), tipo: i % 2 ? 'economia_contratacao' : 'encerramento_contrato',
  status: i % 5 === 4 ? 'revertido' : 'ativo', valor_liberado_brl: 1234567.89 * (i + 1), valor_liberado_usd: 234567.12 * (i + 1), motivo: LONGO,
  criado_em: dia(i) + 'T09:00:00Z', revertido_em: i % 5 === 4 ? dia(i + 3) + 'T09:00:00Z' : null, forma: i % 7 === 2 ? 'distrato' : 'concluido',
  indenizacao_brl: i % 7 === 2 ? 2956.43 : null, atividade_id: atividades[i % 12].id, atividade: AT(i),
  contrato: { numero: `450057${1600 + i}`, fornecedores: { nome: 'Instituto de Pesquisa Ambiental da Amazônia e Desenvolvimento Sustentável do Acre — IPAAC' } },
  tdr: i % 2 ? { numero: `2.1.${i}-001` } : null, autorizou: { nome_completo: pick(NOMES, i + 2) } }))
const contrato_encerramento_documentos = contrato_encerramentos.filter((_, i) => i % 3 === 0).map(e => ({ encerramento_id: e.id }))
const contrato_encerramento_pedidos = contrato_encerramentos.filter((_, i) => i % 4 === 0).map(e => ({ encerramento_id: e.id, status: 'aprovado', solicitante: { nome_completo: NOMES[0] } }))

// Or4
const FT = ['dotacao_original', 'revisao_orcamentaria', 'economia_contratacao', 'encerramento_contrato', 'remanejamento_recebido', 'remanejamento_cedido']
const extrato = {
  resumo: { codigo: atividades[0].codigo, nome_pt: atividades[0].nome_pt, orcamento_original_usd: 1500000, orcamento_vigente_usd: 1876543.21, saldo_usd: -12345.67, remanejavel_usd: 0 },
  fecha: true, total_creditos_usd: 1876543.21, total_debitos_usd: 1888888.88, saldo_calculado_usd: -12345.67,
  creditos: Array.from({ length: 40 }, (_, i) => ({ criado_em: dia(i) + 'T10:00:00Z', tipo: pick(FT, i), orcamentaria: i % 3 !== 0, remanejamento: i % 4 === 0 ? `REM-2026-00${i}` : null,
    atividade_procedencia: i % 4 === 0 ? '3.2.11' : null, contrato: i % 5 === 1 ? '4500563116' : null, tdr: i % 3 === 2 ? '1.1.1-001' : null, estorno_de: i % 9 === 0 ? 'x' : null,
    lancado_por: pick(NOMES, i), valor_usd: (i % 6 === 5 ? -1 : 1) * 45678.9 * (i + 1), descricao: i % 2 ? LONGO : null })),
  debitos: Array.from({ length: 30 }, (_, i) => ({ tipo: pick(['tdr', 'execucao_direta', 'excedente_contrato', 'pagamento_contrato_sem_tdr'], i), referencia: `1.1.1-0${String(i).padStart(2, '0')}`,
    situacao: pick(['contratado', 'aprovado', 'em_licitacao', 'rascunho'], i), valor_usd: 54321.09 * (i + 1) })),
  fontes: FT.slice(0, 5).map((t, i) => ({ ordem_consumo: i + 1, tipo: t, liquido_usd: 400000 * (i + 1), consumido_usd: 300000, reservado_usd: 12345, livre_usd: 87655.43 })),
  remanejamentos: Array.from({ length: 10 }, (_, i) => ({ numero: `REM-2026-00${i}`, status: pick(SIT, i), efetivado_em: dia(i), valor_usd: (i % 2 ? -1 : 1) * 98765.43 })),
  eventos_tdr: Array.from({ length: 35 }, (_, i) => ({ criado_em: dia(i) + 'T10:00:00Z', tdr_numero: `1.1.1-0${String(i).padStart(2, '0')}`, evento: pick(['tdr_criado', 'tdr_valor_alterado', 'tdr_contratado', 'tdr_cancelado'], i), efeito_usd: 23456.78 * (i + 1) })),
}
const contratos = Array.from({ length: 10 }, (_, i) => ({ numero: `450056${3100 + i}`, status: 'vigente', atividade_id: atividades[0].id,
  tdrs: { numero: `1.1.1-0${String(i * 2 + 2).padStart(2, '0')}` }, fornecedores: { nome: 'Fundação de Apoio à Pesquisa e Extensão Universitária da Amazônia Ocidental' } }))

// ── Patrimônio ──
const LOC = ['Sede da SEMA — Sala da Diretoria de Mudanças Climáticas e Serviços Ambientais (2º andar)', 'Base de campo da APA Lago do Amapá — galpão de equipamentos',
  'Almoxarifado central', 'Núcleo do ZEE — Laboratório de Geoprocessamento e Sensoriamento Remoto', 'Escritório regional de Cruzeiro do Sul']
const pat_locais = LOC.map((n, i) => ({ id: uid('11111111', i + 1), nome: n }))
const CAT = [['informatica', 'Equipamentos de processamento de dados'], ['mobiliario', 'Mobiliário em geral'], ['veiculo', 'Veículos de tração mecânica e embarcações'],
  ['campo', 'Aparelhos e equipamentos para uso em campo e medição'], ['audio', 'Aparelhos de comunicação, áudio e vídeo']]
const pat_categorias = CAT.map(([c, n]) => ({ codigo: c, nome: n }))
const SITB = ['em_uso', 'em_uso', 'em_estoque', 'emprestado', 'em_manutencao', 'extraviado', 'baixado', 'anulado']
const CONDS = ['novo', 'bom', 'regular', 'ruim', 'inservivel']
const DESC = ['Notebook Dell Latitude 5440 Intel Core i7 13ª geração 32 GB RAM SSD 1 TB tela 14" com estação de acoplamento e mochila',
  'Cadeira giratória ergonômica com apoio lombar regulável, braços 4D e encosto em tela', 'Receptor GNSS RTK de dupla frequência com coletora e bastão',
  'Barco de alumínio 6 m com motor de popa 40 HP', 'Drone multirrotor com câmera multiespectral e 3 baterias', 'Projetor multimídia 4000 lumens']
const resp = [null, ...usuarios.map(u => u.id)]
const vw_pat_bens = Array.from({ length: 130 }, (_, i) => {
  const r = pick(resp, i), va = i % 17 === 0 ? null : 1234.56 * (1 + (i % 40)) * (i % 10 === 0 ? 100 : 1)
  return { id: uid('22222222', i + 1), numero: `PAT-${String(123 + i).padStart(6, '0')}`, descricao: pick(DESC, i), marca: pick(['Dell', 'Flexform', 'Trimble', 'Levefort', 'DJI'], i),
    modelo: `Modelo X-${i}`, numero_serie: i % 3 ? `SN${1000000000 + i * 7919}ABCDE` : null, numero_unesco: i % 4 ? `UNESCO-218BRA2001-${i}` : null, numero_sema: null,
    especificacao: i % 5 === 0 ? 'Especificação técnica conforme termo de referência, item 3.2.' : null,
    categoria_codigo: CAT[i % 5][0], categoria_nome: CAT[i % 5][1], local_id: pat_locais[i % 5].id, local_nome: LOC[i % 5],
    responsavel_id: r, responsavel_nome: r ? usuarios.find(u => u.id === r).nome_completo : null, situacao: pick(SITB, i), condicao: pick(CONDS, i),
    dt_aquisicao: dia(i, '2025-'), dt_inicio_uso: i % 9 ? dia(i, '2025-') : null, garantia_ate: dia(i, '2028-'), ultimo_inventario_em: i % 4 ? dia(i, '2026-') : null,
    dt_baixa: pick(SITB, i) === 'baixado' ? dia(i, '2026-') : null, valor_aquisicao_brl: va, valor_contabil_brl: va == null ? null : va * 0.83,
    depreciacao_acumulada_brl: va == null ? null : va * 0.17, cota_mensal_brl: va == null ? null : va / 60, meses_depreciados: 10, vida_util_meses: 60,
    termo_vigente: r && i % 3 ? `TR-2026-${String(i).padStart(4, '0')}` : null, devolver_ate: pick(SITB, i) === 'emprestado' ? (i % 2 ? '2026-01-15' : '2027-03-01') : null,
    contrato_numero: i % 2 ? '4500571659' : null, fornecedor_nome: i % 2 ? 'Comércio de Equipamentos de Informática e Tecnologia da Amazônia Ltda' : null,
    atividade_codigo: atividades[i % 12].codigo, origem: 'compra_projeto', nf_numero: `00012${i}`, nf_data: dia(i, '2025-'), foto_url: null }
})
const fn_pat_posicao = vw_pat_bens.filter(b => b.situacao !== 'anulado').map(b => ({ bem_id: b.id, numero: b.numero, descricao: b.descricao, categoria_nome: b.categoria_nome,
  atividade_codigo: b.atividade_codigo, dt_inicio_uso: b.dt_inicio_uso, dt_baixa: b.dt_baixa, valor_aquisicao_brl: b.valor_aquisicao_brl ?? 0, cota_mensal_brl: b.cota_mensal_brl,
  meses: 10, vida_util_meses: 60, depreciacao_no_ano_brl: (b.cota_mensal_brl || 0) * 10, depreciacao_acumulada_brl: b.depreciacao_acumulada_brl, valor_contabil_brl: b.valor_contabil_brl }))
const ET = ['incorporacao', 'distribuicao', 'transferencia_interna', 'emprestimo', 'devolucao', 'manutencao_saida', 'manutencao_retorno', 'ocorrencia', 'inventario', 'baixa', 'correcao', 'estorno']
const vw_pat_eventos = Array.from({ length: 160 }, (_, i) => ({ id: uid('33333333', i + 1), bem_id: vw_pat_bens[i % 130].id, tipo: pick(ET, i), dt_evento: dia(i), registrado_em: dia(i) + 'T11:00:00Z',
  local_de_nome: i % 3 ? LOC[i % 5] : null, local_para_nome: LOC[(i + 1) % 5], responsavel_de_nome: i % 2 ? pick(NOMES, i) : null, responsavel_para_nome: pick(NOMES, i + 1),
  condicao_de: i % 4 === 0 ? 'bom' : null, condicao_para: i % 4 === 0 ? 'regular' : null, estornado: i % 23 === 0, registrado_por_nome: pick(NOMES, i + 3),
  observacao: i % 3 === 0 ? LONGO : null }))
const OCT = ['avaria', 'defeito', 'mau_uso', 'extravio', 'furto', 'roubo', 'sinistro']
const pat_ocorrencias = Array.from({ length: 30 }, (_, i) => ({ id: uid('44444444', i + 1), numero: `OC-2026-${String(i + 1).padStart(4, '0')}`, dt_ocorrencia: dia(i), tipo: pick(OCT, i),
  bo_numero: ['furto', 'roubo'].includes(pick(OCT, i)) ? `BO-2026/0012345${i}-DEPOL-RB` : null, sinistro_numero: i % 7 === 6 ? `SIN-998877-${i}` : null,
  situacao: pick(['aberta', 'em_apuracao', 'concluida'], i), desfecho: pick([null, 'localizado', 'reparado', 'ressarcido', 'indenizado', 'arquivada'], i),
  seguradora: i % 7 === 6 ? 'Companhia de Seguros Aliança do Brasil' : null, valor_brl: i % 3 ? 12345.67 * i : null, descricao: LONGO, parecer: i % 2 ? LONGO : null,
  bem: { numero: vw_pat_bens[i].numero, descricao: vw_pat_bens[i].descricao }, registrador: { nome_completo: pick(NOMES, i) } }))
const BXM = ['inservivel', 'sinistro_perda_total', 'furto_roubo', 'extravio_nao_localizado', 'obsolescencia', 'doacao', 'alienacao']
const pat_baixas = Array.from({ length: 25 }, (_, i) => ({ id: uid('55555555', i + 1), numero: `BX-2026-${String(i + 1).padStart(4, '0')}`, bem_id: vw_pat_bens[i * 3].id, motivo: pick(BXM, i),
  destino: ['doacao', 'alienacao'].includes(pick(BXM, i)) ? 'Associação dos Moradores e Produtores Rurais da Reserva Extrativista Chico Mendes' : null,
  pedido_em: dia(i) + 'T10:00:00Z', decidido_em: i % 4 ? dia(i + 1) + 'T10:00:00Z' : null, situacao: pick(['aguardando', 'aprovada', 'devolvida', 'cancelada'], i),
  justificativa: LONGO, parecer: i % 3 ? 'Parecer favorável após vistoria técnica.' : null,
  bem: { numero: vw_pat_bens[i * 3].numero, descricao: vw_pat_bens[i * 3].descricao, valor_aquisicao_brl: vw_pat_bens[i * 3].valor_aquisicao_brl },
  pedidor: { nome_completo: pick(NOMES, i) }, decisor: { nome_completo: pick(NOMES, i + 1) } }))
const INV = uid('66666666', 1)
const RES = ['conferido', 'local_divergente', 'condicao_divergente', 'nao_esperado', 'pendente', 'conferido']
const invDet = {
  inventario: { id: INV, numero: 'INV-2026-0001', titulo: 'Inventário anual de bens móveis do projeto em todos os locais de guarda da SEMA e bases de campo', tipo: 'anual',
    locais_nomes: LOC, aberto_por_nome: NOMES[3], aberto_em: '2026-10-01T10:00:00Z', situacao: 'concluido', concluido_em: '2026-11-10T10:00:00Z',
    hash: 'a3f5c9e1b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6' },
  comissao: [0, 1, 2, 4].map((k, j) => ({ nome: NOMES[k], papel: j === 0 ? 'presidente' : 'membro', assinado_em: j < 3 ? '2026-11-09T10:00:00Z' : null })),
  itens: vw_pat_bens.slice(0, 110).map((b, i) => ({ numero: b.numero, descricao: b.descricao, numero_serie: b.numero_serie, esperado: RES[i % 6] !== 'nao_esperado',
    local_esperado_nome: b.local_nome, responsavel_esperado_nome: b.responsavel_nome, local_encontrado_nome: LOC[(i + 1) % 5], conferido_por_nome: NOMES[1],
    conferido_em: RES[i % 6] === 'pendente' ? null : '2026-10-20T10:00:00Z', condicao_esperada: b.condicao, condicao_encontrada: i % 6 === 2 ? 'ruim' : b.condicao,
    resultado: RES[i % 6], situacao_esperada: pick(['em_uso', 'emprestado'], i), observacao: i % 8 === 0 ? 'Etiqueta danificada, placa refeita no local.' : null,
    valor_contabil_brl: b.valor_contabil_brl })),
}
const BEM = vw_pat_bens[10].id
const pat_documentos = [1, 2, 3, 4, 5, 6].map(k => ({ id: uid('77777777', k), bem_id: BEM, tipo: k < 4 ? 'foto' : 'laudo', nome: `arquivo_${k}_laudo_tecnico_de_vistoria_do_bem_patrimonial.pdf`,
  url: '/storage/v1/object/public/patrimonio-docs/x.jpg', enviado_em: '2026-05-01T10:00:00Z', ativo: true }))

module.exports = {
  banco: {
    usuarios, atividades, remanejamentos, tdr_cancelamentos, contrato_encerramentos, contrato_encerramento_documentos, contrato_encerramento_pedidos, contratos,
    pat_locais, pat_categorias, vw_pat_bens, vw_pat_eventos, pat_ocorrencias, pat_baixas, pat_documentos,
    __rpc: { fn_orcamento_extrato: extrato, fn_pat_posicao, fn_pat_inv_lista: [{ id: INV, numero: 'INV-2026-0001', titulo: invDet.inventario.titulo }], fn_pat_inv_detalhe: invDet },
  },
  filtros: {
    Or4: { 'fil-atividade': atividades[0].id },
    Pt2: { 'fil-pat-pessoa': usuarios[0].id },
    Pt6: { 'fil-pat-inv': INV },
    Pt7: { 'fil-pat-bem': BEM },
  },
}
