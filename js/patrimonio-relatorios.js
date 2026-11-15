// ── Patrimônio · relatórios A4 (docs/patrimonio/plano.md §10, Fase 5) ──────
// Monta o CORPO dos relatórios do grupo "Patrimônio" para a FolhaA4 (cabeçalho,
// rodapé e paginação são do molde). Usado pela aba Relatórios (pages/relatorios.html,
// Pt1–Pt8) e pela tela do Patrimônio (relatório do inventário, ficha do bem).
// Nada é calculado aqui: valor contábil e depreciação vêm de vw_pat_bens / fn_pat_posicao;
// o resultado do inventário, de fn_pat_inv_detalhe. Texto do banco sempre escapado.
// Valores só aparecem para quem pode vê-los (o banco devolve NULL para os demais).
;(function () {
  'use strict'
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const brl = v => v == null || v === '' ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const dt = d => { if (!d) return '—'; const [a, m, x] = String(d).slice(0, 10).split('-'); return x + '/' + m + '/' + a }
  const dtH = t => t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }
  const soma = (l, k) => l.reduce((s, x) => s + Number(x[k] || 0), 0)
  const temValor = l => l.some(x => x.valor_aquisicao_brl != null)
  const vazio = t => '<p style="color:#666;padding:12px 0">' + E(t) + '</p>'

  const SIT = { em_estoque: 'Em estoque', em_uso: 'Em uso', emprestado: 'Emprestado', em_manutencao: 'Em manutenção',
    extraviado: 'Extraviado', baixado: 'Baixado', transferido: 'Transferido', anulado: 'Anulado' }
  const SIT_B = { em_estoque: 'rb-cinza', em_uso: 'rb-verde', emprestado: 'rb-azul', em_manutencao: 'rb-ouro', extraviado: 'rb-vermelho', baixado: 'rb-cinza', transferido: 'rb-cinza', anulado: 'rb-cinza' }
  const COND = { novo: 'Novo', bom: 'Bom', regular: 'Regular', ruim: 'Ruim', inservivel: 'Inservível' }
  const EVT = { incorporacao: 'Entrada no patrimônio', condicao: 'Condição registrada', correcao: 'Correção da ficha', estorno: 'Estorno',
    distribuicao: 'Entrega ao responsável', transferencia_interna: 'Transferência', devolucao: 'Devolução', emprestimo: 'Empréstimo',
    manutencao_saida: 'Saída para manutenção', manutencao_retorno: 'Volta da manutenção', reavaliacao: 'Reavaliação',
    ocorrencia: 'Ocorrência', inventario: 'Inventário', baixa: 'Baixa', transferencia_definitiva: 'Transferência definitiva' }
  const OC_TIPO = { avaria: 'Avaria', defeito: 'Defeito', mau_uso: 'Mau uso', extravio: 'Extravio', furto: 'Furto', roubo: 'Roubo', sinistro: 'Sinistro' }
  const OC_SIT = { aberta: 'Aberta', em_apuracao: 'Em apuração', concluida: 'Concluída' }
  const OC_DESF = { localizado: 'Localizado', reparado: 'Reparado', ressarcido: 'Ressarcido', indenizado: 'Indenizado pelo seguro', baixa: 'Baixa', arquivada: 'Arquivada' }
  const BX_MOT = { inservivel: 'Inservível', sinistro_perda_total: 'Perda total por sinistro', furto_roubo: 'Furto ou roubo', extravio_nao_localizado: 'Extravio não localizado',
    obsolescencia: 'Obsolescência', doacao: 'Doação', alienacao: 'Alienação (venda)' }
  const BX_SIT = { aguardando: 'Aguardando aprovação', aprovada: 'Aprovada', devolvida: 'Devolvida', cancelada: 'Cancelada' }
  const INV_TIPO = { anual: 'Anual', parcial: 'Parcial', extraordinario: 'Extraordinário', encerramento: 'Encerramento do projeto' }
  const INV_SIT = { em_andamento: 'Em conferência', em_assinatura: 'Em assinatura', concluido: 'Concluído', cancelado: 'Cancelado' }
  const INV_RES = { pendente: 'Pendente', conferido: 'Conferido', local_divergente: 'Outro local', condicao_divergente: 'Condição mudou',
    nao_esperado: 'Fora da lista', nao_localizado: 'Não localizado', ausente: 'Ausente por registro' }
  const INV_B = { conferido: 'rb-verde', local_divergente: 'rb-ouro', condicao_divergente: 'rb-ouro', nao_esperado: 'rb-ouro', nao_localizado: 'rb-vermelho', ausente: 'rb-cinza', pendente: 'rb-cinza' }
  const badge = (cls, t) => '<span class="rep-badge ' + cls + '">' + E(t) + '</span>'
  const stat = (lbl, val, sub) => '<div class="rep-stat"><div class="rep-stat-lbl">' + E(lbl) + '</div><div class="rep-stat-val">' + val + '</div>' + (sub ? '<div class="rep-stat-sub">' + sub + '</div>' : '') + '</div>'
  const secao = (tit, corpo) => '<div class="rep-secao"><div class="rep-secao-titulo">' + E(tit) + '</div>' + corpo + '</div>'
  const nota = t => '<p style="font-size:9pt;color:#555">' + E(t) + '</p>'
  const ATIVO = b => !['anulado', 'baixado', 'transferido'].includes(b.situacao || b.situacao_hoje)

  async function q(p) { const { data, error } = await p; if (error) throw error; return data || [] }

  // ── Pt1 · Inventário geral de bens ──
  async function pt1(f = {}) {
    let l = await q(db.from('vw_pat_bens').select('*').order('numero'))
    l = l.filter(b => b.situacao !== 'anulado')
    if (f.situacao === 'ativos' || !f.situacao) l = l.filter(ATIVO)
    else if (f.situacao) l = l.filter(b => b.situacao === f.situacao)
    if (f.local) l = l.filter(b => b.local_id === f.local)
    if (f.categoria) l = l.filter(b => b.categoria_codigo === f.categoria)
    const val = temValor(l)
    const grupos = {}
    l.forEach(b => { const k = b.local_nome || 'Sem local'; (grupos[k] = grupos[k] || []).push(b) })
    const cab = '<thead><tr><th>Nº</th><th>Bem</th><th>Categoria</th><th>Responsável</th><th>Situação</th><th>Condição</th><th>Aquisição</th>' +
      (val ? '<th style="text-align:right">Valor de aquisição</th><th style="text-align:right">Valor contábil hoje</th>' : '') + '<th>Últ. inventário</th></tr></thead>'
    const linha = b => '<tr><td class="mono">' + E(b.numero) + '</td><td>' + E(b.descricao) +
      (b.marca || b.modelo || b.numero_serie ? '<br><small>' + E([b.marca, b.modelo, b.numero_serie && 'S/N ' + b.numero_serie].filter(Boolean).join(' · ')) + '</small>' : '') + '</td>' +
      '<td>' + E(b.categoria_nome) + '</td><td>' + E(b.responsavel_nome || '—') + '</td><td>' + badge(SIT_B[b.situacao] || 'rb-cinza', SIT[b.situacao] || b.situacao) + '</td>' +
      '<td>' + E(COND[b.condicao] || b.condicao) + '</td><td class="mono">' + dt(b.dt_aquisicao) + '</td>' +
      (val ? '<td class="mono" style="text-align:right">' + brl(b.valor_aquisicao_brl) + '</td><td class="mono" style="text-align:right">' + brl(b.valor_contabil_brl) + '</td>' : '') +
      '<td class="mono">' + dt(b.ultimo_inventario_em) + '</td></tr>'
    return '<div class="rep-stats rep-stats-4">' + stat('Bens', l.length, Object.keys(grupos).length + ' local(is)') +
        stat('Em uso', l.filter(b => b.situacao === 'em_uso').length, l.filter(b => b.situacao === 'em_estoque').length + ' em estoque') +
        (val ? stat('Valor de aquisição', brl(soma(l, 'valor_aquisicao_brl'))) + stat('Valor contábil hoje', brl(soma(l, 'valor_contabil_brl')), 'depreciação acumulada ' + brl(soma(l, 'depreciacao_acumulada_brl')))
          : stat('Extraviados', l.filter(b => b.situacao === 'extraviado').length) + stat('Sem inventário em 12 meses', l.filter(semInv).length)) + '</div>' +
      (l.length ? Object.keys(grupos).sort().map(k => secao(k + ' (' + grupos[k].length + ')', '<table class="rep-tbl">' + cab + '<tbody>' + grupos[k].map(linha).join('') + '</tbody>' +
          (val ? '<tfoot><tr><td colspan="7"><strong>Total do local</strong></td><td class="mono" style="text-align:right">' + brl(soma(grupos[k], 'valor_aquisicao_brl')) +
            '</td><td class="mono" style="text-align:right">' + brl(soma(grupos[k], 'valor_contabil_brl')) + '</td><td></td></tr></tfoot>' : '') + '</table>')).join('')
        : vazio('Nenhum bem com esses filtros.')) +
      nota('Valor contábil = valor de aquisição menos a depreciação linear mensal acumulada até hoje (calculada pelo sistema, a partir do mês seguinte ao início de uso).')
  }
  const semInv = b => { const d = b.ultimo_inventario_em || b.dt_aquisicao; const lim = new Date(); lim.setFullYear(lim.getFullYear() - 1); return d && d < lim.toISOString().slice(0, 10) }

  // ── Pt2 · Bens sob responsabilidade (por pessoa) ──
  async function pt2(f = {}) {
    let l = (await q(db.from('vw_pat_bens').select('*').order('numero'))).filter(b => ATIVO(b) && b.responsavel_id)
    if (f.pessoa) l = l.filter(b => b.responsavel_id === f.pessoa)
    const g = {}
    l.forEach(b => { (g[b.responsavel_id] = g[b.responsavel_id] || { nome: b.responsavel_nome, bens: [] }).bens.push(b) })
    const val = temValor(l), h = hoje()
    const pessoas = Object.values(g).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    return '<div class="rep-stats rep-stats-3">' + stat('Pessoas com bens', pessoas.length) + stat('Bens sob guarda', l.length) +
        stat('Empréstimos vencidos', l.filter(b => b.devolver_ate && b.devolver_ate < h).length) + '</div>' +
      (pessoas.length ? pessoas.map(p => secao(p.nome + ' — ' + p.bens.length + ' bem(ns)',
        '<table class="rep-tbl"><thead><tr><th>Nº</th><th>Bem</th><th>Série</th><th>Local</th><th>Condição</th><th>Termo</th><th>Devolver até</th>' + (val ? '<th style="text-align:right">Valor contábil</th>' : '') + '</tr></thead><tbody>' +
        p.bens.map(b => '<tr><td class="mono">' + E(b.numero) + '</td><td>' + E(b.descricao) + '</td><td class="mono">' + E(b.numero_serie || '—') + '</td><td>' + E(b.local_nome || '—') + '</td>' +
          '<td>' + E(COND[b.condicao] || b.condicao) + '</td><td class="mono">' + E(b.termo_vigente || 'sem termo') + '</td>' +
          '<td class="mono">' + (b.devolver_ate ? (b.devolver_ate < h ? badge('rb-vermelho', dt(b.devolver_ate)) : dt(b.devolver_ate)) : '—') + '</td>' +
          (val ? '<td class="mono" style="text-align:right">' + brl(b.valor_contabil_brl) + '</td>' : '') + '</tr>').join('') + '</tbody></table>' +
        '<table class="rep-tbl" style="margin-top:6mm"><tbody><tr><td style="height:18mm;vertical-align:bottom;text-align:center">______________________________<br>' + E(p.nome) + '<br><small>declara estar com os bens acima</small></td></tr></tbody></table>')).join('')
        : vazio('Nenhum bem sob a guarda de alguém com esses filtros.')) +
      nota('"Sem termo" = bem entregue antes do termo eletrônico ou sem aceite registrado; regularize em Patrimônio › Termos.')
  }

  // ── Pt3 · Mapa de depreciação numa data ──
  async function pt3(f = {}) {
    const data = f.data || hoje()
    const l = await q(db.rpc('fn_pat_posicao', { p_data: data }))
    if (!temValor(l) && l.length) return vazio('Seu acesso não inclui os valores do patrimônio (gestor, financeiro ou acesso "Patrimônio").')
    const porCat = {}
    l.forEach(b => { const k = b.categoria_nome; (porCat[k] = porCat[k] || []).push(b) })
    const ano = data.slice(0, 4)
    const cols = '<thead><tr><th>Nº</th><th>Bem</th><th>Atividade</th><th>Início de uso</th><th style="text-align:right">Aquisição</th><th style="text-align:right">Cota mensal</th>' +
      '<th style="text-align:right">Meses</th><th style="text-align:right">Depreciação em ' + ano + '</th><th style="text-align:right">Acumulada</th><th style="text-align:right">Valor contábil</th></tr></thead>'
    const lin = b => '<tr><td class="mono">' + E(b.numero) + '</td><td>' + E(b.descricao) + (b.dt_baixa && b.dt_baixa <= data ? '<br><small>baixado em ' + dt(b.dt_baixa) + '</small>' : '') + '</td>' +
      '<td class="mono">' + E(b.atividade_codigo || '—') + '</td><td class="mono">' + dt(b.dt_inicio_uso) + '</td>' +
      '<td class="mono" style="text-align:right">' + brl(b.valor_aquisicao_brl) + '</td><td class="mono" style="text-align:right">' + brl(b.cota_mensal_brl) + '</td>' +
      '<td class="mono" style="text-align:right">' + (b.meses ?? 0) + '/' + b.vida_util_meses + '</td><td class="mono" style="text-align:right">' + brl(b.depreciacao_no_ano_brl) + '</td>' +
      '<td class="mono" style="text-align:right">' + brl(b.depreciacao_acumulada_brl) + '</td><td class="mono" style="text-align:right">' + brl(b.valor_contabil_brl) + '</td></tr>'
    const tot = (lst, rot) => '<tr><td colspan="4"><strong>' + E(rot) + '</strong></td><td class="mono" style="text-align:right">' + brl(soma(lst, 'valor_aquisicao_brl')) + '</td>' +
      '<td class="mono" style="text-align:right">' + brl(soma(lst, 'cota_mensal_brl')) + '</td><td></td><td class="mono" style="text-align:right">' + brl(soma(lst, 'depreciacao_no_ano_brl')) + '</td>' +
      '<td class="mono" style="text-align:right">' + brl(soma(lst, 'depreciacao_acumulada_brl')) + '</td><td class="mono" style="text-align:right">' + brl(soma(lst, 'valor_contabil_brl')) + '</td></tr>'
    const porAtv = {}
    l.forEach(b => { const k = b.atividade_codigo || 'Sem atividade'; (porAtv[k] = porAtv[k] || []).push(b) })
    return '<p><b>Posição em ' + dt(data) + '</b></p>' +
      '<div class="rep-stats rep-stats-4">' + stat('Valor de aquisição', brl(soma(l, 'valor_aquisicao_brl')), l.length + ' bem(ns)') +
        stat('Depreciação em ' + ano, brl(soma(l, 'depreciacao_no_ano_brl'))) + stat('Depreciação acumulada', brl(soma(l, 'depreciacao_acumulada_brl'))) +
        stat('Valor contábil', brl(soma(l, 'valor_contabil_brl'))) + '</div>' +
      (l.length ? Object.keys(porCat).sort().map(k => secao(k, '<table class="rep-tbl">' + cols + '<tbody>' + porCat[k].map(lin).join('') + '</tbody><tfoot>' + tot(porCat[k], 'Total da categoria') + '</tfoot></table>')).join('') +
        secao('Resumo por atividade', '<table class="rep-tbl"><thead><tr><th>Atividade</th><th style="text-align:right">Bens</th><th style="text-align:right">Aquisição</th><th style="text-align:right">Depreciação em ' + ano + '</th><th style="text-align:right">Acumulada</th><th style="text-align:right">Valor contábil</th></tr></thead><tbody>' +
          Object.keys(porAtv).sort().map(k => '<tr><td class="mono">' + E(k) + '</td><td class="mono" style="text-align:right">' + porAtv[k].length + '</td><td class="mono" style="text-align:right">' + brl(soma(porAtv[k], 'valor_aquisicao_brl')) +
            '</td><td class="mono" style="text-align:right">' + brl(soma(porAtv[k], 'depreciacao_no_ano_brl')) + '</td><td class="mono" style="text-align:right">' + brl(soma(porAtv[k], 'depreciacao_acumulada_brl')) +
            '</td><td class="mono" style="text-align:right">' + brl(soma(porAtv[k], 'valor_contabil_brl')) + '</td></tr>').join('') + '</tbody></table>')
        : vazio('Nenhum bem adquirido até essa data.')) +
      nota('Depreciação linear mensal: começa no mês seguinte ao início de uso, conta só mês completo, para no valor residual e no mês da baixa. Vida útil e residual por categoria (referência STN, a conferir com a contabilidade). Bem sem início de uso não deprecia.')
  }

  // ── Pt4 · Movimentações no período ──
  async function pt4(f = {}) {
    let p = db.from('vw_pat_eventos').select('*').order('registrado_em', { ascending: true })
    if (f.ini) p = p.gte('dt_evento', f.ini)
    if (f.fim) p = p.lte('dt_evento', f.fim)
    const [ev, bens] = await Promise.all([q(p), q(db.from('vw_pat_bens').select('id,numero,descricao'))])
    const B = Object.fromEntries(bens.map(b => [b.id, b]))
    let l = ev.filter(e => !f.tipo || e.tipo === f.tipo)
    const cont = {}
    l.forEach(e => { cont[e.tipo] = (cont[e.tipo] || 0) + 1 })
    return '<div class="rep-stats rep-stats-4">' + stat('Movimentos', l.length) + stat('Entradas', cont.incorporacao || 0) +
        stat('Entregas e transferências', (cont.distribuicao || 0) + (cont.transferencia_interna || 0) + (cont.emprestimo || 0) + (cont.devolucao || 0)) + stat('Baixas', cont.baixa || 0) + '</div>' +
      secao('Movimentos', l.length ? '<table class="rep-tbl"><thead><tr><th>Data</th><th>Bem</th><th>Movimento</th><th>De</th><th>Para</th><th>Registrado por</th></tr></thead>' +
        l.map(e => { const b = B[e.bem_id] || {}
          const de = [e.local_de_nome, e.responsavel_de_nome, e.condicao_de && COND[e.condicao_de]].filter(Boolean).join(' · ')
          const pa = [e.local_para_nome, e.responsavel_para_nome, e.condicao_para && COND[e.condicao_para]].filter(Boolean).join(' · ')
          return '<tbody class="rep-grupo"><tr class="rep-mae"><td class="mono">' + dt(e.dt_evento) + '</td><td><span class="mono">' + E(b.numero || '') + '</span> ' + E(b.descricao || '') + '</td>' +
            '<td>' + E(EVT[e.tipo] || e.tipo) + (e.estornado ? ' ' + badge('rb-cinza', 'estornado') : '') + '</td><td>' + E(de || '—') + '</td><td>' + E(pa || '—') + '</td>' +
            '<td>' + E(e.registrado_por_nome || '—') + '<br><small>' + dtH(e.registrado_em) + '</small></td></tr>' +
            (e.observacao ? '<tr class="rep-det"><td colspan="6"><span class="rep-det-lbl">Observação</span>' + E(e.observacao) + '</td></tr>' : '') + '</tbody>' }).join('') + '</table>'
        : vazio('Nenhum movimento no período.'))
  }

  // ── Pt5 · Ocorrências e sinistros ──
  async function pt5(f = {}) {
    let p = db.from('pat_ocorrencias').select('*,bem:pat_bens!pat_ocorrencias_bem_id_fkey(numero,descricao),registrador:usuarios!pat_ocorrencias_registrado_por_fkey(nome_completo)').order('dt_ocorrencia')
    if (f.ini) p = p.gte('dt_ocorrencia', f.ini)
    if (f.fim) p = p.lte('dt_ocorrencia', f.fim)
    let l = await q(p)
    if (f.situacao_oc) l = l.filter(o => f.situacao_oc === 'abertas' ? o.situacao !== 'concluida' : o.situacao === 'concluida')
    const val = l.some(o => o.valor_brl != null)
    return '<div class="rep-stats rep-stats-4">' + stat('Ocorrências', l.length) + stat('Em aberto', l.filter(o => o.situacao !== 'concluida').length) +
        stat('Furto, roubo ou extravio', l.filter(o => ['furto', 'roubo', 'extravio'].includes(o.tipo)).length) +
        stat('Valor ressarcido/indenizado', val ? brl(soma(l.filter(o => ['ressarcido', 'indenizado'].includes(o.desfecho)), 'valor_brl')) : '—') + '</div>' +
      secao('Ocorrências', l.length ? '<table class="rep-tbl"><thead><tr><th>Nº</th><th>Data</th><th>Bem</th><th>Tipo</th><th>BO / sinistro</th><th>Situação</th><th>Desfecho</th><th style="text-align:right">Valor</th></tr></thead>' +
        l.map(o => '<tbody class="rep-grupo"><tr class="rep-mae"><td class="mono">' + E(o.numero) + '</td><td class="mono">' + dt(o.dt_ocorrencia) + '</td>' +
          '<td><span class="mono">' + E(o.bem?.numero || '') + '</span> ' + E(o.bem?.descricao || '') + '</td><td>' + E(OC_TIPO[o.tipo] || o.tipo) + '</td>' +
          '<td class="mono">' + E([o.bo_numero && 'BO ' + o.bo_numero, o.sinistro_numero && 'Sin. ' + o.sinistro_numero].filter(Boolean).join(' · ') || '—') + '</td>' +
          '<td>' + badge(o.situacao === 'concluida' ? 'rb-verde' : 'rb-ouro', OC_SIT[o.situacao]) + '</td><td>' + E(OC_DESF[o.desfecho] || '—') + (o.seguradora ? '<br><small>' + E(o.seguradora) + '</small>' : '') + '</td>' +
          '<td class="mono" style="text-align:right">' + brl(o.valor_brl) + '</td></tr>' +
          '<tr class="rep-det"><td colspan="8"><span class="rep-det-lbl">O que aconteceu</span>' + E(o.descricao) + (o.parecer ? ' — <b>Parecer:</b> ' + E(o.parecer) : '') + '</td></tr></tbody>').join('') + '</table>'
        : vazio('Nenhuma ocorrência com esses filtros.'))
  }

  // ── Pt6 · Relatório de inventário (também chamado pela tela do Patrimônio) ──
  function invRes(i, v) {
    if (i.resultado !== 'pendente' || v.situacao === 'em_andamento') return i.resultado
    return ['emprestado', 'em_manutencao', 'extraviado'].includes(i.situacao_esperada) ? 'ausente' : 'nao_localizado'
  }
  function inventario(I) {
    const v = I.inventario, it = I.itens || [], val = it.some(i => i.valor_contabil_brl != null)
    const r = i => invRes(i, v)
    const conf = it.filter(i => i.conferido_em), naoLoc = it.filter(i => r(i) === 'nao_localizado'), div = it.filter(i => ['local_divergente', 'condicao_divergente', 'nao_esperado'].includes(r(i)))
    const tabela = lst => '<table class="rep-tbl"><thead><tr><th>Nº</th><th>Bem</th><th>Esperado em</th><th>Achado em</th><th>Condição</th><th>Resultado</th>' + (val ? '<th style="text-align:right">Valor contábil</th>' : '') + '</tr></thead><tbody>' +
      lst.map(i => '<tr><td class="mono">' + E(i.numero) + '</td><td>' + E(i.descricao) + (i.numero_serie ? '<br><small>S/N ' + E(i.numero_serie) + '</small>' : '') + '</td>' +
        '<td>' + (i.esperado ? E(i.local_esperado_nome || '—') + (i.responsavel_esperado_nome ? '<br><small>' + E(i.responsavel_esperado_nome) + '</small>' : '') : '<small>fora da lista</small>') + '</td>' +
        '<td>' + (i.conferido_em ? E(i.local_encontrado_nome || '—') + '<br><small>' + E(i.conferido_por_nome || '') + ' · ' + dtH(i.conferido_em) + '</small>' : '—') + '</td>' +
        '<td>' + E(COND[i.condicao_esperada] || i.condicao_esperada) + (i.condicao_encontrada && i.condicao_encontrada !== i.condicao_esperada ? ' → ' + E(COND[i.condicao_encontrada]) : '') + '</td>' +
        '<td>' + badge(INV_B[r(i)] || 'rb-cinza', INV_RES[r(i)] || r(i)) + (i.observacao ? '<br><small>' + E(i.observacao) + '</small>' : '') + '</td>' +
        (val ? '<td class="mono" style="text-align:right">' + brl(i.valor_contabil_brl) + '</td>' : '') + '</tr>').join('') + '</tbody></table>'
    return '<div class="rep-secao"><table class="rep-tbl"><tbody>' +
        '<tr><td class="c-min"><b>Inventário</b></td><td class="mono">' + E(v.numero) + ' — ' + E(v.titulo) + '</td></tr>' +
        '<tr><td class="c-min"><b>Tipo</b></td><td>' + E(INV_TIPO[v.tipo] || v.tipo) + '</td></tr>' +
        '<tr><td class="c-min"><b>Locais</b></td><td>' + E((v.locais_nomes || []).join(', ') || 'Todos os locais') + '</td></tr>' +
        '<tr><td class="c-min"><b>Aberto</b></td><td>' + E(v.aberto_por_nome || '—') + ' em ' + dtH(v.aberto_em) + '</td></tr>' +
        '<tr><td class="c-min"><b>Situação</b></td><td>' + E(INV_SIT[v.situacao]) + (v.concluido_em ? ' em ' + dtH(v.concluido_em) : '') + '</td></tr>' +
        '<tr><td class="c-min"><b>Comissão</b></td><td>' + (I.comissao || []).map(m => E(m.nome) + (m.papel === 'presidente' ? ' (presidente)' : '') +
          (m.assinado_em ? ' — assinou com senha em ' + dtH(m.assinado_em) : ' — não assinou')).join('<br>') + '</td></tr></tbody></table></div>' +
      '<div class="rep-stats rep-stats-4">' + stat('Esperados', it.filter(i => i.esperado).length) + stat('Conferidos', conf.length) +
        stat('Não localizados', naoLoc.length, v.situacao === 'concluido' ? 'viraram ocorrência de extravio' : 'se fechar assim') + stat('Divergências', div.length, val ? 'contábil conferido ' + brl(soma(conf, 'valor_contabil_brl')) : '') + '</div>' +
      (naoLoc.length ? secao('Não localizados', tabela(naoLoc)) : '') +
      (div.length ? secao('Divergências (local, condição ou fora da lista)', tabela(div)) : '') +
      secao('Todos os bens', it.length ? tabela(it) : vazio('Sem bens.')) +
      secao('Termo da comissão', '<p>A comissão abaixo declara que conferiu os bens deste inventário nos locais indicados e que o resultado acima reflete o que foi encontrado. ' +
        'Os bens não localizados são tratados como ocorrência de extravio e as divergências são regularizadas pelo gestor patrimonial.</p>' +
        (v.hash ? '<p class="mono" style="font-size:8pt">SHA-256 do resultado: ' + E(v.hash) + '</p>' : '<p><b>Conferência em andamento — este documento ainda não foi assinado.</b></p>') +
        '<table class="rep-tbl"><tbody><tr>' + (I.comissao || []).map(m => '<td style="height:20mm;vertical-align:bottom;text-align:center">______________________<br>' + E(m.nome) +
          '<br><small>' + (m.assinado_em ? 'assinado eletronicamente ' + dtH(m.assinado_em) : (m.papel === 'presidente' ? 'presidente' : 'membro')) + '</small></td>').join('') + '</tr></tbody></table>')
  }
  async function pt6(f = {}) {
    if (!f.inventario) return vazio('Escolha o inventário.')
    const { data, error } = await db.rpc('fn_pat_inv_detalhe', { p_inv: f.inventario })
    if (error) throw error
    return inventario(data)
  }

  // ── Pt7 · Ficha completa do bem (linha do tempo e fotos) ──
  async function pt7(f = {}) {
    if (!f.bem) return vazio('Escolha o bem.')
    const [bs, ev, docs] = await Promise.all([q(db.from('vw_pat_bens').select('*').eq('id', f.bem)),
      q(db.from('vw_pat_eventos').select('*').eq('bem_id', f.bem).order('registrado_em')),
      q(db.from('pat_documentos').select('id,tipo,nome,url,enviado_em').eq('bem_id', f.bem).eq('ativo', true).order('enviado_em'))])
    const b = bs[0]; if (!b) return vazio('Bem não encontrado ou sem acesso.')
    const lin = (r, v) => '<tr><td class="c-min"><b>' + E(r) + '</b></td><td>' + v + '</td></tr>'
    const fotos = docs.filter(d => d.tipo === 'foto').slice(0, 4)
    return '<div class="rep-secao"><table class="rep-tbl"><tbody>' +
        lin('Número', '<span class="mono">' + E(b.numero) + '</span>' + (b.numero_unesco ? ' · UNESCO ' + E(b.numero_unesco) : '') + (b.numero_sema ? ' · SEMA ' + E(b.numero_sema) : '')) +
        lin('Bem', E(b.descricao) + (b.especificacao ? '<br><small>' + E(b.especificacao) + '</small>' : '')) +
        lin('Marca / modelo / série', E([b.marca, b.modelo].filter(Boolean).join(' ') || '—') + (b.numero_serie ? ' · S/N <span class="mono">' + E(b.numero_serie) + '</span>' : '')) +
        lin('Categoria', E(b.categoria_nome)) + lin('Situação e condição', E(SIT[b.situacao] || b.situacao) + ' · ' + E(COND[b.condicao] || b.condicao)) +
        lin('Local e responsável', E(b.local_nome || '—') + ' · ' + E(b.responsavel_nome || 'em estoque') + (b.termo_vigente ? ' (termo ' + E(b.termo_vigente) + ')' : '')) +
        lin('Origem', E(b.contrato_numero ? 'Contrato ' + b.contrato_numero + (b.fornecedor_nome ? ' · ' + b.fornecedor_nome : '') : (b.origem || '—')) +
          (b.atividade_codigo ? ' · atividade ' + E(b.atividade_codigo) : '') + (b.nf_numero ? ' · NF ' + E(b.nf_numero) + ' de ' + dt(b.nf_data) : '')) +
        lin('Datas', 'aquisição ' + dt(b.dt_aquisicao) + ' · início de uso ' + dt(b.dt_inicio_uso) + ' · garantia até ' + dt(b.garantia_ate) + ' · último inventário ' + dt(b.ultimo_inventario_em) + (b.dt_baixa ? ' · baixa ' + dt(b.dt_baixa) : '')) +
        (b.valor_aquisicao_brl != null ? lin('Valor', 'aquisição ' + brl(b.valor_aquisicao_brl) + ' · cota mensal ' + brl(b.cota_mensal_brl) + ' · ' + (b.meses_depreciados || 0) + ' de ' + b.vida_util_meses +
          ' meses · depreciação acumulada ' + brl(b.depreciacao_acumulada_brl) + ' · <b>contábil hoje ' + brl(b.valor_contabil_brl) + '</b>') : '') +
        '</tbody></table></div>' +
      (fotos.length ? secao('Fotos', '<div style="display:flex;gap:4mm;flex-wrap:wrap">' + fotos.map(d => '<img data-arquivo-src="' + E(d.url) + '" alt="' + E(d.nome) + '" style="width:40mm;height:30mm;object-fit:cover;border:1px solid #ccc;border-radius:2mm">').join('') + '</div>') : '') +
      secao('Linha do tempo', ev.length ? '<table class="rep-tbl"><thead><tr><th>Data</th><th>Movimento</th><th>De → para</th><th>Registrado por</th></tr></thead>' + ev.map(e =>
        '<tbody class="rep-grupo"><tr class="rep-mae"><td class="mono">' + dt(e.dt_evento) + '</td><td>' + E(EVT[e.tipo] || e.tipo) + (e.estornado ? ' ' + badge('rb-cinza', 'estornado') : '') + '</td>' +
        '<td>' + E([e.local_de_nome, e.responsavel_de_nome].filter(Boolean).join(' · ') || '—') + ' → ' + E([e.local_para_nome, e.responsavel_para_nome].filter(Boolean).join(' · ') || '—') + '</td>' +
        '<td>' + E(e.registrado_por_nome || '—') + '<br><small>' + dtH(e.registrado_em) + '</small></td></tr>' +
        (e.observacao ? '<tr class="rep-det"><td colspan="4"><span class="rep-det-lbl">Observação</span>' + E(e.observacao) + '</td></tr>' : '') + '</tbody>').join('') + '</table>' : vazio('Sem movimentos.')) +
      (docs.length ? secao('Arquivos', '<table class="rep-tbl"><tbody>' + docs.map(d => '<tr><td>' + E(d.tipo) + '</td><td>' + E(d.nome) + '</td><td class="mono">' + dtH(d.enviado_em) + '</td></tr>').join('') + '</tbody></table>') : '')
  }

  // ── Pt8 · Baixas no período ──
  async function pt8(f = {}) {
    let p = db.from('pat_baixas').select('*,bem:pat_bens!pat_baixas_bem_id_fkey(numero,descricao,valor_aquisicao_brl),pedidor:usuarios!pat_baixas_pedido_por_fkey(nome_completo),decisor:usuarios!pat_baixas_decidido_por_fkey(nome_completo)').order('pedido_em')
    if (f.ini) p = p.gte('pedido_em', f.ini)
    if (f.fim) p = p.lte('pedido_em', f.fim + 'T23:59:59')
    let l = await q(p)
    if (f.situacao_bx) l = l.filter(x => x.situacao === f.situacao_bx)
    const pos = await q(db.rpc('fn_pat_posicao', { p_data: hoje() }))
    const P = Object.fromEntries(pos.map(x => [x.bem_id, x]))
    const val = pos.some(x => x.valor_aquisicao_brl != null)
    const ap = l.filter(x => x.situacao === 'aprovada')
    return '<div class="rep-stats rep-stats-4">' + stat('Pedidos', l.length) + stat('Aprovados', ap.length) + stat('Aguardando', l.filter(x => x.situacao === 'aguardando').length) +
        stat('Valor contábil baixado', val ? brl(ap.reduce((s, x) => s + Number(P[x.bem_id]?.valor_contabil_brl || 0), 0)) : '—') + '</div>' +
      secao('Pedidos de baixa', l.length ? '<table class="rep-tbl"><thead><tr><th>Nº</th><th>Bem</th><th>Motivo</th><th>Pedido</th><th>Decisão</th><th>Situação</th>' + (val ? '<th style="text-align:right">Aquisição</th><th style="text-align:right">Contábil na baixa</th>' : '') + '</tr></thead>' +
        l.map(x => '<tbody class="rep-grupo"><tr class="rep-mae"><td class="mono">' + E(x.numero) + '</td><td><span class="mono">' + E(x.bem?.numero || '') + '</span> ' + E(x.bem?.descricao || '') + '</td>' +
          '<td>' + E(BX_MOT[x.motivo] || x.motivo) + (x.destino ? '<br><small>destino: ' + E(x.destino) + '</small>' : '') + '</td>' +
          '<td>' + E(x.pedidor?.nome_completo || '—') + '<br><small>' + dtH(x.pedido_em) + '</small></td>' +
          '<td>' + (x.decidido_em ? E(x.decisor?.nome_completo || '—') + '<br><small>com senha · ' + dtH(x.decidido_em) + '</small>' : '—') + '</td>' +
          '<td>' + badge(x.situacao === 'aprovada' ? 'rb-verde' : x.situacao === 'aguardando' ? 'rb-ouro' : 'rb-cinza', BX_SIT[x.situacao]) + '</td>' +
          (val ? '<td class="mono" style="text-align:right">' + brl(P[x.bem_id]?.valor_aquisicao_brl) + '</td><td class="mono" style="text-align:right">' + brl(P[x.bem_id]?.valor_contabil_brl) + '</td>' : '') + '</tr>' +
          '<tr class="rep-det"><td colspan="' + (val ? 8 : 6) + '"><span class="rep-det-lbl">Justificativa</span>' + E(x.justificativa) + (x.parecer ? ' — <b>Parecer:</b> ' + E(x.parecer) : '') + '</td></tr></tbody>').join('') + '</table>'
        : vazio('Nenhum pedido de baixa com esses filtros.')) +
      nota('A baixa só vale depois de aprovada com senha pela coordenação ou super_admin que não fez o pedido; a partir dela o bem para de depreciar.')
  }

  window.PatRel = { pt1, pt2, pt3, pt4, pt5, pt6, pt7, pt8, inventario }
})()
