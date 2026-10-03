// ═══════════════════════════════════════════════════════════════════════
// relatorio-remanejamento.js — relatórios A4 do razão orçamentário (Fase 7)
// ═══════════════════════════════════════════════════════════════════════
// Só monta HTML com o que o banco devolveu; nenhum número é recalculado aqui.
//   · relAbrirPedidoA4(D, ctx)   pedido de remanejamento: itens, procedência de
//                                cada centavo, cadeia de assinaturas (nome,
//                                cargo, data, decisão, SHA-256) e histórico
//   · relAbrirExtratoA4(id)      extrato da atividade = fn_orcamento_extrato:
//                                créditos com procedência − débitos de hoje = saldo
// Janela aberta ANTES de qualquer await (senão o navegador bloqueia o pop-up).

const REL_CSS = `
*{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;margin:24px;font-size:11px}
h1{font-size:17px;color:#1F4E2C;margin:0 0 2px}.sub{color:#6B7280;font-size:10px;margin-bottom:14px}
h2{font-size:12px;color:#1F4E2C;border-bottom:2px solid #1F4E2C;padding-bottom:3px;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.04em}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280;text-align:left;background:#f0f7f2;border-bottom:2px solid #1F4E2C;padding:5px 7px}
td{padding:5px 7px;border-bottom:1px solid #E5E7EB;vertical-align:top}
.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.neg{color:#991B1B}.pos{color:#065F46}
.mono{font-family:Consolas,monospace;font-size:9px;word-break:break-all}.mut{color:#6B7280}
tfoot td{font-weight:700;border-top:2px solid #1F4E2C;background:#f0f7f2}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:6px}
.kpi{border:1px solid #E5E7EB;border-radius:6px;padding:7px 9px}.kpi b{display:block;font-size:13px}.kpi span{color:#6B7280;font-size:9px}
.aviso{background:#FFF7ED;border:1px solid #FED7AA;color:#9A3412;border-radius:6px;padding:7px 9px;margin:6px 0}
.ok{background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;border-radius:6px;padding:7px 9px;margin:6px 0}
.assin{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.assin>div{border:1px solid #E5E7EB;border-radius:6px;padding:7px 9px;break-inside:avoid}
@media print{@page{size:A4;margin:12mm}body{margin:0}thead{display:table-header-group}tr{break-inside:avoid}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`

const relUSD = v => 'US$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const relData = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const relE = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function relJanela() {
  const w = window.open('', '_blank')
  if (!w) { toast('Permita pop-ups neste site para gerar o relatório.', 'warning'); return null }
  w.document.write('<!doctype html><meta charset="utf-8"><title>Gerando…</title><body style="font-family:sans-serif;color:#6B7280;padding:40px;text-align:center">Gerando relatório A4…</body>')
  return w
}
function relEscrever(w, titulo, corpo) {
  const dt = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  w.document.open()
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${relE(titulo)}</title><style>${REL_CSS}</style></head><body>
    <h1>${relE(titulo)}</h1><div class="sub">Projeto 218BRA2001 · SEMA/AC · UNESCO — gerado em ${dt} por ${relE(appState?.usuario?.nome_completo || '')}</div>
    ${corpo}</body></html>`)
  w.document.close(); w.focus()
  setTimeout(() => { try { w.print() } catch (e) {} }, 400)
}

const REL_STATUS = { rascunho: 'Rascunho', em_aprovacao: 'Em aprovação', efetivado: 'Efetivado', recusado: 'Recusado', cancelado: 'Cancelado', estornado: 'Estornado' }
const REL_PAPEL = { solicitacao: 'Solicitação (coordenação)', liberacao_origem: 'Liberação da atividade de origem', unesco: 'UNESCO', diretoria: 'Diretoria', secretaria: 'Secretaria' }
const REL_CARGO = { coordenacao_solicitante: 'Coordenação solicitante', unesco_financeiro: 'UNESCO — financeiro', diretor: 'Diretor', secretario: 'Secretário' }
const REL_DECISAO = { aprovar: 'Aprovou', devolver: 'Devolveu', recusar: 'Recusou', cancelar: 'Cancelou' }
const REL_FONTE = {
  dotacao_original: 'Dotação original', revisao_orcamentaria: 'Revisão orçamentária',
  economia_contratacao: 'Economia de contratação', encerramento_contrato: 'Encerramento de contrato',
  remanejamento_recebido: 'Remanejamento recebido', remanejamento_cedido: 'Remanejamento cedido',
}

// ── Pedido de remanejamento ────────────────────────────────────────────
// D = REM.detalhe { P, itens, alocs, etapas, assin, hist, hash }
// ctx = { atv(id) → {codigo,nome_pt}, fonte(id) → linha de vw_orcamento_fontes_saldo,
//         procedencia(fonte) → texto, nome(uid) → nome, evento(cod) → rótulo, pedido(id) → {numero} }
function relAbrirPedidoA4(D, ctx) {
  const w = relJanela(); if (!w) return
  const P = D.P
  const itens = D.itens.slice().sort((a, b) => a.valor_usd - b.valor_usd)
  const linhas = itens.map(i => {
    const a = ctx.atv(i.atividade_id)
    const fontes = D.alocs.filter(x => x.item_id === i.id).map(x => {
      const f = ctx.fonte(x.fonte_id)
      return `<div class="mut">${relUSD(x.valor_usd)} de ${relE(REL_FONTE[f?.tipo] || 'fonte')}${f ? ' — ' + relE(ctx.procedencia(f)) : ''}</div>`
    }).join('')
    return `<tr><td><b>${relE(a?.codigo || '?')}</b> ${relE(a?.nome_pt || '')}${fontes}</td>
      <td>${i.valor_usd < 0 ? 'cede' : 'recebe'}</td><td class="n ${i.valor_usd < 0 ? 'neg' : 'pos'}">${relUSD(i.valor_usd)}</td></tr>`
  }).join('')
  const total = itens.filter(i => i.valor_usd > 0).reduce((s, i) => s + Number(i.valor_usd), 0)

  // assinaturas válidas da versão atual, na ordem das etapas
  const validas = D.assin.filter(a => a.versao === P.versao && !a.invalidada_em)
  const cadeia = D.etapas.map(e => {
    const a = validas.find(x => x.etapa_id === e.id && x.decisao === 'aprovar') || validas.find(x => x.etapa_id === e.id)
    const nomeEt = REL_PAPEL[e.papel] + (e.atividade_id ? ' — ' + (ctx.atv(e.atividade_id)?.codigo || '') : '')
    return `<div><b>${e.ordem}. ${relE(nomeEt)}</b><br>${a
      ? `${relE(REL_DECISAO[a.decisao] || a.decisao)}: <b>${relE(a.nome_completo)}</b>${a.cargo ? ' (' + relE(REL_CARGO[a.cargo] || a.cargo) + ')' : ''}<br>
         <span class="mut">${relData(a.criado_em)}</span>${a.motivo ? '<br>Motivo: ' + relE(a.motivo) : ''}
         <div class="mono mut">SHA-256 assinado: ${relE(a.hash_documento || '')}</div>`
      : '<span class="mut">pendente</span>'}</div>`
  }).join('')
  const invalidas = D.assin.filter(a => a.invalidada_em)
  const hist = D.hist.map(h => `<tr><td>${relData(h.criado_em)}</td><td>${relE(ctx.nome(h.usuario_id))}</td>
    <td>${relE(ctx.evento(h.evento))}${h.etapa_ordem ? ' (etapa ' + h.etapa_ordem + ')' : ''}</td><td>${relE(h.motivo || '')}</td></tr>`).join('')
  const orig = P.estorno_de ? ctx.pedido(P.estorno_de) : null

  relEscrever(w, `Remanejamento ${P.numero}`, `
    <div class="kpis">
      <div class="kpi"><b>${relE(REL_STATUS[P.status] || P.status)}</b><span>situação</span></div>
      <div class="kpi"><b>${relUSD(total)}</b><span>valor remanejado</span></div>
      <div class="kpi"><b>v${P.versao}</b><span>versão do documento</span></div>
      <div class="kpi"><b>${relData(P.efetivado_em || P.criado_em)}</b><span>${P.efetivado_em ? 'efetivado em' : 'criado em'}</span></div>
    </div>
    ${orig ? `<div class="aviso">Estorno do remanejamento <b>${relE(orig.numero)}</b>: devolve às mesmas fontes de onde o valor saiu.</div>` : ''}
    ${P.tipo === 'cobertura_contrato' ? '<div class="aviso">Pedido de <b>cobertura de contrato</b> (valor acima do TDR sem saldo na atividade).</div>' : ''}
    ${P.motivo_encerramento ? `<div class="aviso"><b>Encerramento:</b> ${relE(P.motivo_encerramento)}</div>` : ''}
    <h2>Justificativa</h2><p style="line-height:1.5">${relE(P.justificativa)}</p>
    <p class="mut">Solicitado por ${relE(ctx.nome(P.criado_por))} em ${relData(P.criado_em)}.</p>
    <h2>Movimentação e procedência</h2>
    <table><thead><tr><th>Atividade · fontes</th><th>Movimento</th><th class="n">Valor</th></tr></thead>
      <tbody>${linhas}</tbody><tfoot><tr><td colspan="2">Soma dos itens (deve ser zero)</td>
      <td class="n">${relUSD(itens.reduce((s, i) => s + Number(i.valor_usd), 0))}</td></tr></tfoot></table>
    <h2>Cadeia de aprovação</h2><div class="assin">${cadeia || '<div class="mut">A cadeia é montada quando o pedido é enviado.</div>'}</div>
    ${invalidas.length ? `<p class="mut" style="margin-top:6px">${invalidas.length} assinatura(s) de versões anteriores ou devolvidas foram invalidadas e constam no histórico.</p>` : ''}
    <h2>Histórico</h2>
    <table><thead><tr><th>Data</th><th>Quem</th><th>Evento</th><th>Motivo</th></tr></thead><tbody>${hist}</tbody></table>
    <h2>Integridade</h2>
    <p class="mono">Impressão digital do documento (SHA-256): ${relE(D.hash || '')}</p>
    <p class="mut">Cada assinatura grava o SHA-256 do pedido que a pessoa viu, depois de reconfirmar a senha no servidor.
    Se o pedido mudar, o hash muda e as assinaturas anteriores deixam de valer.</p>`)
}

// ── Extrato da atividade (fn_orcamento_extrato) ────────────────────────
async function relAbrirExtratoA4(atividadeId) {
  const w = relJanela(); if (!w) return
  const { data: e, error } = await db.rpc('fn_orcamento_extrato', { p_atividade: atividadeId })
  if (error) {
    w.document.open(); w.document.write('<body style="font-family:sans-serif;color:#991B1B;padding:40px">Erro: ' + relE(error.message) + '</body>'); w.document.close()
    return
  }
  const r = e.resumo
  const DEB = { tdr: 'TDR', execucao_direta: 'Execução direta', excedente_contrato: 'Contrato acima do TDR', pagamento_contrato_sem_tdr: 'Contrato sem TDR' }
  const cred = e.creditos.map(c => {
    const proc = [c.remanejamento && 'pedido ' + c.remanejamento, c.atividade_procedencia && 'de ' + c.atividade_procedencia,
                  c.contrato && 'contrato ' + c.contrato, c.tdr && 'TDR ' + c.tdr, c.estorno_de && 'estorno'].filter(Boolean).join(' · ')
    return `<tr><td>${relData(c.criado_em)}</td><td>${relE(REL_FONTE[c.tipo] || c.tipo)}${c.orcamentaria ? '' : ' <span class="mut">(liberação)</span>'}</td>
      <td>${relE(c.descricao)}${proc ? '<div class="mut">' + relE(proc) + '</div>' : ''}</td>
      <td class="mut">${relE(c.lancado_por || '')}</td><td class="n ${c.valor_usd < 0 ? 'neg' : ''}">${relUSD(c.valor_usd)}</td></tr>`
  }).join('')
  const deb = e.debitos.map(d => `<tr><td>${relE(DEB[d.tipo] || d.tipo)}</td><td>${relE(d.referencia || '')}${d.situacao ? ' <span class="mut">(' + relE(d.situacao) + ')</span>' : ''}</td>
    <td class="mut">${relE((d.detalhe || '').replace(/R\$ ([\d.]+)/, (m, v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })))}</td><td class="n">${relUSD(d.valor_usd)}</td></tr>`).join('')
  const fontes = e.fontes.map(f => `<tr><td>${f.ordem_consumo}</td><td>${relE(REL_FONTE[f.tipo] || f.tipo)}</td><td>${relE(f.descricao || '')}</td>
    <td class="n">${relUSD(f.liquido_usd)}</td><td class="n">${relUSD(f.consumido_usd)}</td><td class="n">${relUSD(f.reservado_usd)}</td><td class="n"><b>${relUSD(f.livre_usd)}</b></td></tr>`).join('')
  const rems = e.remanejamentos.map(x => `<tr><td>${relE(x.numero)}${x.estorno_de ? ' <span class="mut">(estorno de ' + relE(x.estorno_de) + ')</span>' : ''}</td>
    <td>${relE(REL_STATUS[x.status] || x.status)}</td><td>${relData(x.efetivado_em)}</td><td class="n ${x.valor_usd < 0 ? 'neg' : 'pos'}">${relUSD(x.valor_usd)}</td></tr>`).join('')
  const ev = e.eventos_tdr.map(x => `<tr><td>${relData(x.criado_em)}</td><td>${relE(x.tdr_numero || '')}</td><td>${relE((x.evento || '').replace(/_/g, ' '))}</td>
    <td class="n">${relUSD(x.efeito_usd)}</td></tr>`).join('')

  relEscrever(w, `Extrato orçamentário · ${r.codigo}`, `
    <p style="margin:-6px 0 10px"><b>${relE(r.codigo)}</b> — ${relE(r.nome_pt || '')}</p>
    <div class="kpis">
      <div class="kpi"><b>${relUSD(r.orcamento_original_usd)}</b><span>dotação original</span></div>
      <div class="kpi"><b>${relUSD(r.orcamento_vigente_usd)}</b><span>orçamento vigente</span></div>
      <div class="kpi"><b class="${r.saldo_usd < 0 ? 'neg' : ''}">${relUSD(r.saldo_usd)}</b><span>saldo (créditos − débitos)</span></div>
      <div class="kpi"><b>${relUSD(r.remanejavel_usd)}</b><span>remanejável (descontadas reservas ${relUSD(r.reservado_usd)})</span></div>
    </div>
    ${e.fecha ? '<div class="ok">Conferido: Σ créditos − Σ débitos = saldo do razão.</div>'
              : '<div class="aviso"><b>Atenção:</b> o extrato não fecha com o saldo do razão — rode a conferência do orçamento.</div>'}
    ${Number(r.contratos_aguardando) ? `<div class="aviso">${r.contratos_aguardando} contrato(s) aguardando cobertura: faltam ${relUSD(r.cobertura_pendente_usd)}.</div>` : ''}
    <h2>Créditos e ajustes do razão</h2>
    <table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição · procedência</th><th>Lançado por</th><th class="n">Valor</th></tr></thead>
      <tbody>${cred}</tbody><tfoot><tr><td colspan="4">Total de créditos</td><td class="n">${relUSD(e.total_creditos_usd)}</td></tr></tfoot></table>
    <h2>Débitos (compromissos de hoje)</h2>
    <table><thead><tr><th>Natureza</th><th>Referência</th><th>Detalhe</th><th class="n">Valor</th></tr></thead>
      <tbody>${deb || '<tr><td colspan="4" class="mut">Sem débitos.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="3">Total de débitos</td><td class="n">${relUSD(e.total_debitos_usd)}</td></tr>
      <tr><td colspan="3">Saldo = créditos − débitos</td><td class="n ${e.saldo_calculado_usd < 0 ? 'neg' : ''}">${relUSD(e.saldo_calculado_usd)}</td></tr></tfoot></table>
    <h2>Procedência do saldo (fontes, ordem de consumo)</h2>
    <table><thead><tr><th>#</th><th>Fonte</th><th>Descrição</th><th class="n">Líquido</th><th class="n">Consumido</th><th class="n">Reservado</th><th class="n">Livre</th></tr></thead>
      <tbody>${fontes}</tbody></table>
    <p class="mut">Os compromissos consomem primeiro a dotação original e depois as demais fontes na ordem em que entraram.</p>
    ${rems ? `<h2>Remanejamentos</h2><table><thead><tr><th>Pedido</th><th>Situação</th><th>Efetivado</th><th class="n">Nesta atividade</th></tr></thead><tbody>${rems}</tbody></table>` : ''}
    ${ev ? `<h2>Histórico de TDRs</h2><table><thead><tr><th>Data</th><th>TDR</th><th>Evento</th><th class="n">Efeito no débito</th></tr></thead><tbody>${ev}</tbody></table>
      <p class="mut">Histórico registrado desde a implantação do razão (03/10/2026); os débitos acima são a posição atual.</p>` : ''}`)
}
