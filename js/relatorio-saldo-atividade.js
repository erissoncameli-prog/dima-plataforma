// Gera o corpo HTML do relatório "Saldo de Orçamento por Atividade (TDRs)" — usado tanto pelo
// relatório A4 da Central de Relatórios quanto pelo botão "Relatório A4" do painel Saldo de
// Orçamento na Visão Geral. Mantendo a lógica aqui (em vez de duplicada nas duas páginas),
// os dois lugares mostram sempre exatamente o mesmo relatório.
//
// rows: array de atividades no formato
//   { codigo, nome_pt, orcamento_usd, resultado:{codigo}, tdrs:[{id,numero,valor_brl,valor_usd,status,
//     contratos:[{id,numero,valor_total_brl,status}]}] }
// taxa: cotação USD→BRL atual (0 se indisponível)
function gerarRelatorioSaldoAtividadeHTML(rows, taxa) {
  const toUSD = brl => taxa > 0 ? brl / taxa : 0;
  const toBRL = usd => usd * taxa;

  // Rótulos de status de TDR + classe de badge (verde = pós-aprovação/firmado)
  const TDR_LBL = {rascunho:'Rascunho',revisao_interna:'Revisão Interna',ajustes:'Ajustes',enviado_unesco:'Enviado UNESCO',retorno_unesco:'Retorno UNESCO',aprovado:'Aprovado',cancelado:'Cancelado',submetido:'Submetido',pendente_correcao:'Pendente Correção',em_avaliacao:'Em Avaliação',em_revisao_unesco:'Em Revisão UNESCO',em_licitacao:'Em Licitação',contratado:'Contratado'};
  const tdrBadge = st => {
    const cls = st==='cancelado'?'rb-cinza'
      : ['aprovado','em_licitacao','contratado'].includes(st)?'rb-verde'
      : st==='rascunho'?'rb-cinza':'rb-azul';
    return `<span class="rep-badge ${cls}">${TDR_LBL[st]||st}</span>`;
  };

  // Processa cada atividade — espelha vw_saldo_atividade:
  // comprometido = valor PLANEJADO do TDR (reservado); economia só sai do comprometido
  // quando é LIBERADA (contrato_encerramentos, status ativo). Saldo = orçamento − comprometido + liberado.
  const dados = rows.map(a=>{
    const seen=new Set();
    const tdrs=(a.tdrs||[])
      .filter(t=>{ if(seen.has(t.id))return false; seen.add(t.id); return true; })
      .filter(t=>t.status!=='cancelado');
    const orcUSD = parseFloat(a.orcamento_usd||0);

    // Liberações ativas (encerramentos) da atividade — total e por TDR (via tdr_id)
    const encsAtivos = (a.encerramentos||[]).filter(e=>e && (e.status==='ativo' || e.status==null));
    const libByTdr = {};
    let libUSD=0, libBRL=0;
    encsAtivos.forEach(e=>{
      const uUSD = parseFloat(e.valor_liberado_usd||0) || toUSD(parseFloat(e.valor_liberado_brl||0));
      const uBRL = parseFloat(e.valor_liberado_brl||0) || toBRL(parseFloat(e.valor_liberado_usd||0));
      libUSD+=uUSD; libBRL+=uBRL;
      if(e.tdr_id){ libByTdr[e.tdr_id]=(libByTdr[e.tdr_id]||0)+uBRL; }
    });

    let compUSD=0, compBRL=0, firmUSD=0, firmBRL=0;
    const linhas = tdrs.map(t=>{
      const conts=(t.contratos||[]);
      const firmado = conts.length>0;
      const firmBRL_ = conts.reduce((s,c)=>s+parseFloat(c.valor_total_brl||0),0);
      const planBRL_ = parseFloat(t.valor_brl||0) || toBRL(parseFloat(t.valor_usd||0));
      // Comprometido = valor planejado do TDR (independe do contrato)
      const cUSD = parseFloat(t.valor_usd||0) || toUSD(planBRL_);
      const cBRL = planBRL_;
      if(firmado){ firmBRL+=firmBRL_; firmUSD+=toUSD(firmBRL_); }
      compUSD+=cUSD; compBRL+=cBRL;
      const ecoBRL = firmado ? Math.max(0, planBRL_ - firmBRL_) : 0; // economia potencial
      const libTdrBRL = Math.min(ecoBRL, libByTdr[t.id]||0);          // já liberada deste TDR
      const reservadaBRL = Math.max(0, ecoBRL - libTdrBRL);          // ainda reservada
      return { t, firmado, conts, cUSD, cBRL, ecoBRL, libTdrBRL, reservadaBRL };
    }).sort((x,y)=>(x.t.numero||'').localeCompare(y.t.numero||'',undefined,{numeric:true}));

    const saldoUSD = orcUSD - compUSD + libUSD;
    const saldoBRL = toBRL(orcUSD) - compBRL + libBRL;
    return { a, orcUSD, compUSD, compBRL, firmUSD, firmBRL, libUSD, libBRL, saldoUSD, saldoBRL, linhas };
  }).sort((x,y)=>(x.a.codigo||'').localeCompare(y.a.codigo||'',undefined,{numeric:true}));

  if(!dados.length) return `<div style="padding:32px;text-align:center;color:var(--cinza-400)">Nenhuma atividade encontrada para os filtros selecionados.</div>`;

  // Totais gerais
  const tOrcUSD   = dados.reduce((s,d)=>s+d.orcUSD,0);
  const tCompUSD  = dados.reduce((s,d)=>s+d.compUSD,0);
  const tCompBRL  = dados.reduce((s,d)=>s+d.compBRL,0);
  const tFirmUSD  = dados.reduce((s,d)=>s+d.firmUSD,0);
  const tSaldoUSD = dados.reduce((s,d)=>s+d.saldoUSD,0);
  const tSaldoBRL = dados.reduce((s,d)=>s+d.saldoBRL,0);
  const totalTDRs = dados.reduce((s,d)=>s+d.linhas.length,0);
  const firmados  = dados.reduce((s,d)=>s+d.linhas.filter(l=>l.firmado).length,0);
  const estouros  = dados.filter(d=>d.saldoUSD<0).length;

  // Célula de valor: USD principal + BRL de referência (BRL à cotação atual)
  const val = (usd,brl,destaque) => `<span class="mono"${destaque&&usd<0?' style="color:var(--erro);font-weight:700"':''}>${fmtUSD(usd)}</span><div class="mono-sm" style="color:var(--cinza-400)">${fmtBRL(brl)}</div>`;
  const pctOrc = tOrcUSD>0 ? (tSaldoUSD/tOrcUSD*100) : 0;

  const corpo = dados.map(d=>{
    const estourou = d.saldoUSD < 0;
    const pctComp = d.orcUSD>0 ? Math.min(100, d.compUSD/d.orcUSD*100) : (d.compUSD>0?100:0);
    const barCls = estourou?'crit':pctComp>90?'warn':'';
    // Cabeçalho da atividade
    let bloco = `<tr style="background:#eef5f0">
      <td colspan="3" style="border-top:2px solid #c8e6d0">
        <strong style="color:#1F4E2C">${esc(d.a.codigo||'')}</strong> · ${esc(d.a.nome_pt||'')}
        ${d.a.resultado?.codigo?`<span class="rep-badge rb-verde" style="margin-left:6px">R${d.a.resultado.codigo}</span>`:''}
        <span style="font-size:10px;color:var(--cinza-500)"> · ${d.linhas.length} TDR${d.linhas.length!==1?'s':''}</span>
      </td>
      <td style="text-align:right;border-top:2px solid #c8e6d0">${val(d.orcUSD, toBRL(d.orcUSD))}</td>
      <td style="text-align:right;border-top:2px solid #c8e6d0">${val(d.compUSD, d.compBRL)}</td>
      <td style="text-align:right;border-top:2px solid #c8e6d0"><div class="rep-barra" style="margin-bottom:3px"><div class="rep-barra-fill ${barCls}" style="width:${pctComp.toFixed(0)}%"></div></div></td>
    </tr>`;
    // Linhas de TDR
    if(d.linhas.length){
      bloco += d.linhas.map(l=>{
        const numsContrato = l.conts.map(c=>esc(c.numero||'—')).join(', ');
        return `<tr>
          <td style="padding-left:22px;color:var(--cinza-600)">↳ <span class="mono">${esc(l.t.numero||'—')}</span></td>
          <td>${tdrBadge(l.t.status)}</td>
          <td>${l.firmado
            ? `<span class="rep-badge rb-teal">🔒 ${numsContrato}</span>${
                l.libTdrBRL>0 ? `<span class="rep-badge rb-verde" style="margin-left:4px" title="Economia liberada ao saldo da atividade">↩ ${fmtBRL(l.libTdrBRL)} liberado</span>` : ''
              }${
                l.reservadaBRL>0 ? `<span class="rep-badge rb-azul" style="margin-left:4px" title="Economia entre planejado e firmado, ainda reservada a este TDR">⏸ ${fmtBRL(l.reservadaBRL)} reservado</span>` : ''
              }`
            : `<span style="font-size:10px;color:var(--cinza-400)">— sem contrato —</span>`}</td>
          <td></td>
          <td style="text-align:right">${val(l.cUSD, l.cBRL)}</td>
          <td></td>
        </tr>`;
      }).join('');
    } else {
      bloco += `<tr><td style="padding-left:22px;color:var(--cinza-400)" colspan="4">Nenhum TDR — orçamento totalmente livre</td><td></td><td></td></tr>`;
    }
    // Saldo individual da atividade
    bloco += `<tr style="background:${estourou?'#FEF2F2':'#f8faf8'}">
      <td colspan="4" style="text-align:right;font-weight:600;color:${estourou?'#991B1B':'#1F4E2C'}">
        ${estourou?'⚠ Orçamento estourado · ':''}Saldo livre da atividade (orçamento − comprometido)
      </td>
      <td></td>
      <td style="text-align:right">${val(d.saldoUSD, d.saldoBRL, true)}</td>
    </tr>`;
    return bloco;
  }).join('');

  return `
  <div class="rep-stats rep-stats-4">
    <div class="rep-stat"><div class="rep-stat-lbl">Orçamento Total (USD)</div><div class="rep-stat-val">${fmtUSD(tOrcUSD)}</div><div class="rep-stat-sub">${dados.length} atividade${dados.length!==1?'s':''}</div></div>
    <div class="rep-stat"><div class="rep-stat-lbl">Comprometido (USD)</div><div class="rep-stat-val">${fmtUSD(tCompUSD)}</div><div class="rep-stat-sub">${totalTDRs} TDR${totalTDRs!==1?'s':''} · ${fmtBRL(tCompBRL)}</div></div>
    <div class="rep-stat"><div class="rep-stat-lbl">Firmado em Contrato (USD)</div><div class="rep-stat-val">${fmtUSD(tFirmUSD)}</div><div class="rep-stat-sub">${firmados} TDR${firmados!==1?'s':''} com contrato</div></div>
    <div class="rep-stat"><div class="rep-stat-lbl">Saldo Livre (USD)</div><div class="rep-stat-val"${tSaldoUSD<0?' style="color:var(--erro)"':''}>${fmtUSD(tSaldoUSD)}</div><div class="rep-stat-sub">${fmtPct1(pctOrc)} do orçamento${estouros?` · ${estouros} estourada${estouros!==1?'s':''}`:''}</div></div>
  </div>
  <div class="rep-secao">
    <div class="rep-secao-titulo">⚖️ Saldo de Orçamento por Atividade · TDRs comprometidos e firmados</div>
    <table class="rep-tbl">
      <thead><tr>
        <th>Atividade / TDR</th>
        <th>Status TDR</th>
        <th>Contrato firmado</th>
        <th style="text-align:right">Orçamento</th>
        <th style="text-align:right">Comprometido</th>
        <th style="text-align:right;min-width:110px">Saldo livre</th>
      </tr></thead>
      <tbody>
        ${corpo}
      </tbody>
      <tfoot><tr>
        <td colspan="3"><strong>TOTAL GERAL</strong></td>
        <td style="text-align:right">${val(tOrcUSD, toBRL(tOrcUSD))}</td>
        <td style="text-align:right">${val(tCompUSD, tCompBRL)}</td>
        <td style="text-align:right">${val(tSaldoUSD, tSaldoBRL, true)}</td>
      </tr></tfoot>
    </table>
    <div style="font-size:10px;color:var(--cinza-500);margin-top:8px;line-height:1.6">
      Valores em <strong>USD</strong> (moeda do orçamento); linha menor em <strong>BRL</strong> é referência à cotação atual${taxa>0?` de R$ ${taxa.toFixed(4)}`:''}.
      Comprometido = valor <strong>planejado</strong> de cada TDR (reservado assim que o TDR existe). Quando o contrato fecha abaixo do planejado, a diferença fica <strong>reservada</strong> (⏸) ao TDR até coordenação/super admin <strong>liberá-la</strong> (↩) para a atividade. TDRs cancelados não entram no cálculo.
      Saldo livre = Orçamento − Comprometido + Liberado (espelha a Visão Geral).
    </div>
  </div>`;
}
