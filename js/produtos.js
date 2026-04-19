// produtos.js — Avaliação de Produtos DIMA
// Sem template literals — concatenação pura para evitar corte pelo parser HTML

let atividades=[],contratos=[],todosProdutos=[];
let produtoAtual=null,entregaAtual=null,entregaArquivo=null;
let filtAtiv='',filtCont='',filtForn='',decisaoSel='';
let filtroStatus=null,statsCounts=null;
let fotosNovas=[];
let geoPontosCache=[];
let docsEntrega=[];
let notaTecnicaFile=null;
let notifPendenteId=null;
let matrizItensCache=null; // cache de indicadores da matriz
let geoCSVPontos=[]; // pontos do CSV de geolocalização pendentes para salvar


function fmtDT(d){return d?new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';}

const TIPOS_DOC=['Relatório Técnico','Nota Fiscal','Comprovante de Pagamento','Contrato / Aditivo','Declaração / Atestado','Relatório Parcial','Planilha de Geolocalização','Outro'];
const TIPO_GEO='Planilha de Geolocalização';

(async function(){
  var u=await carregarUsuario();
  if(!u){window.location.href='../index.html';return;}

  // Ler parâmetros da URL
  var params=new URLSearchParams(window.location.search);
  var entregaParam=params.get('entrega');
  var notifId=params.get('notif');
  if(notifId) notifPendenteId=notifId;

  document.getElementById('app').innerHTML=gerarLayout('Avaliação de Produtos','produtos')
    +'<div class="fade-in">'
    +'<div class="stat-row" id="stats"></div>'
    +'<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">'
    +'<select class="form-control" id="sel-ativ" style="max-width:340px" onchange="selecionarAtiv(this.value)">'
    +'<option value="">Selecione a atividade...</option>'
    +'</select>'
    +'<div style="position:relative;max-width:240px;flex:0 0 auto">'
    +'<input class="form-control" id="inp-forn" placeholder="🔍 Fornecedor..." autocomplete="off"'
    +' oninput="filtrarForn(this.value)"'
    +' onfocus="mostrarSugestoesForn(this.value)"'
    +' onblur="setTimeout(function(){ocultarSugestoesForn()},200)">'
    +'<div id="forn-sugestoes" style="display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;background:#fff;border:1px solid var(--borda);border-radius:var(--raio);box-shadow:0 4px 16px rgba(0,0,0,.1);max-height:220px;overflow-y:auto;z-index:200"></div>'
    +'</div>'
    +'<select class="form-control" id="sel-cont" style="max-width:300px" onchange="selecionarCont(this.value)" disabled>'
    +'<option value="">Selecione o contrato...</option>'
    +'</select>'
    +'</div>'
    +'<div id="conteudo"></div>'
    +'</div>'
    +'</div></div></div>'
    +'<div class="modal-overlay" id="modal-prod">'
    +'<div class="modal" style="max-width:min(92vw,1000px)">'
    +'<div class="modal-header"><div class="modal-title" id="mp-titulo">Produto</div>'
    +'<button class="modal-close" onclick="fecharModal()">&#x2715;</button></div>'
    +'<div class="modal-body" id="mp-body" style="max-height:82vh;overflow-y:auto"></div>'
    +'<div class="modal-footer" id="mp-footer"></div>'
    +'</div></div>'
    +'<div id="lightbox" onclick="fecharLightbox()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out">'
    +'<img id="lb-img" src="" alt="" style="max-width:90vw;max-height:85vh;object-fit:contain;border-radius:8px">'
    +'</div>';

  await carregar();
  if(entregaParam) await abrirModalPorEntrega(entregaParam);
})();

async function carregar(){
  var rA=await db.rpc('get_minhas_atividades');
  var rC=await db.from('contratos').select('id,numero,objeto_pt,atividade_id,fornecedor_id,elemento_despesa,fornecedores(id,nome)').order('numero');
  atividades=rA.data||[];
  contratos=rC.data||[];
  var sel=document.getElementById('sel-ativ');
  atividades.forEach(function(a){
    var o=document.createElement('option');
    o.value=a.id;
    o.textContent=a.codigo+' — '+(a.nome_pt||'').substring(0,55);
    sel.appendChild(o);
  });
  await renderStats();
}

async function abrirModalPorEntrega(entregaId){
  var r=await db.from('contratos_produtos_entregas').select('*,contratos_produtos(id,contrato_id)').eq('id',entregaId).single();
  var e=r.data;
  if(!e)return;
  var produtoId=e.produto_id||e.contratos_produtos&&e.contratos_produtos.id;
  var contratoId=e.contrato_id||e.contratos_produtos&&e.contratos_produtos.contrato_id;
  if(!produtoId||!contratoId)return;
  var cont=contratos.find(function(c){return c.id===contratoId;});
  if(cont&&cont.atividade_id){
    var selAtiv=document.getElementById('sel-ativ');
    if(selAtiv)selAtiv.value=cont.atividade_id;
    selecionarAtiv(cont.atividade_id);
    var selCont=document.getElementById('sel-cont');
    if(selCont)selCont.value=contratoId;
    filtCont=contratoId;
    var r2=await db.from('contratos_produtos').select('*,contratos(id,numero,objeto_pt,atividade_id,fornecedores(id,nome),atividades(id,codigo,nome_pt))').eq('contrato_id',contratoId).not('situacao','in','("pago","cancelado")').order('numero_produto',{ascending:true});
    todosProdutos=r2.data||[];
    renderLista();
  }
  await abrirModal(produtoId);
}

async function renderStats(){
  var r=await db.from('contratos_produtos').select('situacao');
  var t=r.data||[];
  statsCounts={
    total:t.length,
    pend:t.filter(function(p){return p.situacao==='pendente';}).length,
    anal:t.filter(function(p){return p.situacao==='em_analise';}).length,
    aprov:t.filter(function(p){return p.situacao==='aprovado';}).length,
    pago:t.filter(function(p){return p.situacao==='pago';}).length,
    dev:t.filter(function(p){return p.situacao==='devolvido';}).length,
  };
  renderStatsHTML();
}

function renderStatsHTML(){
  if(!statsCounts)return;
  var c=statsCounts;
  function card(status,lbl,val,valColor,borderCol,barCol,sub){
    var ativo=filtroStatus===status;
    var ring=ativo?'box-shadow:0 0 0 2px '+barCol+';border-color:'+borderCol+';':'';
    return '<div class="stat-card" style="cursor:pointer;'+ring+(barCol?'':'')+(borderCol&&!ativo?'border-color:'+borderCol+';':'')+'" onclick="setFiltroStatus('+"'"+status+"'"+')"><div style="position:absolute;top:0;left:0;right:0;height:3px;background:'+barCol+'"></div>'
      +'<div class="stat-lbl" style="color:'+(ativo?barCol:'')+'">'+lbl+(ativo?' ✕':' ▾')+'</div>'
      +'<div class="stat-val" style="color:'+valColor+'">'+val+'</div>'
      +'<div class="stat-sub">'+sub+'</div></div>';
  }
  var ativoTodo=filtroStatus===null;
  document.getElementById('stats').innerHTML=
    '<div class="stat-card sc-b" style="cursor:pointer;'+(ativoTodo?'box-shadow:0 0 0 2px var(--verde-medio);':'')+'" onclick="setFiltroStatus(null)">'
    +'<div class="stat-lbl">Total'+(ativoTodo?' (todos)':'')+'</div>'
    +'<div class="stat-val">'+c.total+'</div>'
    +'<div class="stat-sub">todos os contratos</div></div>'
    +card('pendente','Pendentes',c.pend,'var(--aviso)','#FDE68A','#D97706','aguardando entrega')
    +card('em_analise','Em avaliação',c.anal,'#1E40AF','#BFDBFE','#2563EB','aguardando parecer')
    +card('aprovado','Aprovados',c.aprov,'#166534','#86EFAC','#059669','aguardando pagamento')
    +card('pago','Pagos',c.pago,'var(--sucesso)','#6EE7B7','#10B981','100% concluídos')
    +card('devolvido','Devolvidos',c.dev,'#991B1B','#FCA5A5','#EF4444','retornados p/ correção');
}

async function setFiltroStatus(s){
  filtroStatus=(filtroStatus===s&&s!==null)?null:s;
  renderStatsHTML();
  if(filtroStatus===null){
    // limpar filtro — se contrato selecionado re-renderiza, senão volta ao estado vazio
    if(filtCont){renderLista();}
    else{renderVazio('Selecione uma atividade ou busque pelo fornecedor para começar.');}
    return;
  }
  if(filtCont){
    // contrato já selecionado — filtrar localmente
    renderLista();
    return;
  }
  // sem contrato — buscar globalmente no banco
  renderVazio('<div style="text-align:center;padding:40px"><div style="animation:spin .7s linear infinite;width:24px;height:24px;border:3px solid #E5E7EB;border-top-color:#2D6A4F;border-radius:50%;margin:0 auto 8px"></div>Carregando...</div>');
  var r=await db.from('contratos_produtos')
    .select('*,contratos(id,numero,objeto_pt,atividade_id,fornecedores(id,nome),atividades(id,codigo,nome_pt))')
    .eq('situacao',filtroStatus)
    .order('numero_produto',{ascending:true});
  todosProdutos=r.data||[];
  renderLista();
}

function selecionarAtiv(id){
  filtAtiv=id;
  atualizarDropdownContrato();
}

function filtrarForn(val){
  filtForn=val.trim();
  atualizarDropdownContrato();
  mostrarSugestoesForn(val);
}

function mostrarSugestoesForn(val){
  var el=document.getElementById('forn-sugestoes');
  if(!el)return;
  var q=(val||'').trim().toLowerCase();
  var nomes=[];
  var vistos={};
  contratos.forEach(function(c){
    var n=c.fornecedores&&c.fornecedores.nome;
    if(n&&!vistos[n]){vistos[n]=true;nomes.push(n);}
  });
  nomes.sort();
  var filtrados=q?nomes.filter(function(n){return n.toLowerCase().includes(q);}):nomes;
  if(!filtrados.length){el.style.display='none';return;}
  el.innerHTML=filtrados.map(function(n){
    var bold=q?n.replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'),'<strong>$1</strong>'):n;
    return '<div style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--cinza-100)"'
      +' onmousedown="selecionarFornAuto(\''+n.replace(/\\/g,'\\\\').replace(/'/g,'\\\'')+'\')"'
      +' onmouseover="this.style.background=\'var(--cinza-50)\'"'
      +' onmouseout="this.style.background=\'\'">'+bold+'</div>';
  }).join('');
  el.style.display='block';
}

function ocultarSugestoesForn(){
  var el=document.getElementById('forn-sugestoes');
  if(el)el.style.display='none';
}

function selecionarFornAuto(nome){
  filtForn=nome;
  var inp=document.getElementById('inp-forn');
  if(inp)inp.value=nome;
  ocultarSugestoesForn();
  atualizarDropdownContrato();
  // Se só restar 1 contrato, seleciona automaticamente
  var lista=contratos.filter(function(c){
    if(filtAtiv&&c.atividade_id!==filtAtiv)return false;
    return (c.fornecedores&&c.fornecedores.nome||'').toLowerCase().includes(nome.toLowerCase());
  });
  if(lista.length===1){
    var sel=document.getElementById('sel-cont');
    if(sel){sel.value=lista[0].id;}
    selecionarCont(lista[0].id);
  }
}

function atualizarDropdownContrato(){
  filtCont='';todosProdutos=[];
  var sel=document.getElementById('sel-cont');
  sel.innerHTML='<option value="">Selecione o contrato...</option>';

  var lista=contratos.filter(function(c){
    if(filtAtiv&&c.atividade_id!==filtAtiv)return false;
    if(filtForn){
      var nome=(c.fornecedores&&c.fornecedores.nome||'').toLowerCase();
      if(!nome.includes(filtForn.toLowerCase()))return false;
    }
    return true;
  });

  lista.forEach(function(c){
    var o=document.createElement('option');
    o.value=c.id;
    o.textContent=c.numero+(c.fornecedores&&c.fornecedores.nome?' · '+c.fornecedores.nome:'');
    sel.appendChild(o);
  });
  sel.disabled=lista.length===0;

  if(!filtAtiv&&!filtForn)renderVazio('Selecione uma atividade ou busque pelo fornecedor para começar.');
  else if(lista.length===0)renderVazio('Nenhum contrato encontrado com esses filtros.');
  else renderVazio('Selecione um contrato para ver os produtos.');
}

async function selecionarCont(id){
  filtCont=id;todosProdutos=[];filtroStatus=null;renderStatsHTML();
  if(!id){renderVazio('Selecione um contrato para ver os produtos.');return;}
  renderVazio('<div style="text-align:center;padding:40px"><div style="animation:spin .7s linear infinite;width:24px;height:24px;border:3px solid #E5E7EB;border-top-color:#2D6A4F;border-radius:50%;margin:0 auto 8px"></div>Carregando...</div>');
  var r=await db.from('contratos_produtos')
    .select('*,contratos(id,numero,objeto_pt,atividade_id,fornecedores(id,nome),atividades(id,codigo,nome_pt))')
    .eq('contrato_id',id)
    .not('situacao','in','("pago","cancelado")')
    .order('numero_produto',{ascending:true});
  todosProdutos=r.data||[];
  renderLista();
}

function sitLbl(s){return{pendente:'Pendente',em_analise:'Em avaliação',entrega_parcial:'Parcial',aprovado:'Aprovado',pago:'Pago',cancelado:'Cancelado',devolvido:'Devolvido p/ correção'}[s]||s;}

function renderVazio(msg){
  document.getElementById('conteudo').innerHTML='<div class="empty-state"><div class="empty-state-icon">&#x25A3;</div><div class="empty-state-msg">'+msg+'</div></div>';
}

function renderCard(p){
  var hoje=new Date();
  var venc=p.dt_vencimento?new Date(p.dt_vencimento+'T12:00:00'):null;
  var dias=venc?Math.ceil((venc-hoje)/86400000):null;
  var vClass='',vTxt='';
  if(venc){
    if(dias<0){vClass='color:#991B1B;background:#FEF2F2';vTxt='Vencido '+Math.abs(dias)+'d';}
    else if(dias<=7){vClass='color:#92400E;background:#FFFBEB';vTxt='Vence '+dias+'d';}
    else{vClass='color:var(--cinza-600);background:var(--cinza-100)';vTxt='Vence '+fmtData(p.dt_vencimento);}
  }
  var pct=parseFloat(p.pct_aprovado||0);
  var corProg=p.situacao==='entrega_parcial'?'#7C3AED':p.situacao==='em_analise'?'#2563EB':'var(--verde-claro)';
  var acaoTxt={pendente:'&#x1F4E5; Registrar entrega &#x2192;',em_analise:'&#x1F50D; Avaliar &#x2192;',entrega_parcial:'&#x1F4E5; Nova entrega &#x2192;',aprovado:'&#x1F4B3; Aguardando pagamento',devolvido:'&#x21A9; Reenviar entrega &#x2192;'}[p.situacao]||'&#x2192;';
  var topBg=p.situacao==='em_analise'?'background:#EFF6FF;border-bottom-color:#BFDBFE':p.situacao==='entrega_parcial'?'background:#F5F3FF;border-bottom-color:#DDD6FE':p.situacao==='aprovado'?'background:#F0FDF4;border-bottom-color:#86EFAC':p.situacao==='devolvido'?'background:#FEF2F2;border-bottom-color:#FCA5A5':'';
  var clicavel=p.situacao!=='aprovado';
  var acaoCor=p.situacao==='aprovado'?'color:#166534;font-style:italic':'color:var(--cinza-400)';
  var onclk=clicavel?' onclick="abrirModal(\''+p.id+'\')"':'';
  var html='<div class="prod-card"'+onclk+' style="'+(clicavel?'':'cursor:default')+'">'
    +'<div class="prod-card-top" style="'+topBg+'">'
    +'<span class="num-prod">Produto '+p.numero_produto+'</span>'
    +'<span class="sit sit-'+p.situacao+'">'+sitLbl(p.situacao)+'</span>'
    +(vTxt?'<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;'+vClass+';margin-left:auto">'+vTxt+'</span>':'')
    +'</div>'
    +'<div class="prod-card-body">'
    +'<div style="font-size:13px;font-weight:600;color:var(--cinza-900);margin-bottom:6px;line-height:1.3">'+esc(p.descricao)+'</div>'
    +'<div style="font-family:var(--font-mono);font-size:15px;font-weight:700;color:var(--verde-medio)">'+fmtBRL(parseFloat(p.valor_brl||0))+'</div>'
    +(pct>0?'<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:10px;color:var(--cinza-500);margin-bottom:3px"><span>Aprovado</span><span>'+pct+'%</span></div><div class="prog-produto"><div class="prog-fill" style="width:'+pct+'%;background:'+corProg+'"></div></div></div>':'')
    +'</div>'
    +'<div class="prod-card-foot">'
    +'<span style="font-size:11px;color:var(--cinza-500)">'+(p.dt_entrega?'Entregue: '+fmtData(p.dt_entrega):'Sem entrega')+'</span>'
    +'<span style="font-size:11px;font-weight:600;'+acaoCor+'">'+acaoTxt+'</span>'
    +'</div>'
    +'<div style="padding:8px 14px;background:var(--cinza-50);border-top:1px solid var(--borda);display:flex;flex-wrap:wrap;gap:6px;align-items:center">'
    +(p.contratos&&p.contratos.atividades&&p.contratos.atividades.codigo?'<span style="font-family:var(--font-mono);font-size:10px;font-weight:600;background:var(--verde-bg);color:var(--verde-medio);padding:2px 6px;border-radius:3px">'+esc(p.contratos.atividades.codigo)+'</span>':'')
    +(p.contratos&&p.contratos.numero?'<span style="font-size:10px;color:var(--cinza-500)">Contrato '+esc(p.contratos.numero)+'</span>':'')
    +(p.contratos&&p.contratos.fornecedores&&p.contratos.fornecedores.nome?'<span style="font-size:10px;color:var(--cinza-600);font-weight:500">· '+esc(p.contratos.fornecedores.nome)+'</span>':'')
    +'</div></div>';
  return html;
}

function renderLista(){
  if(!todosProdutos.length){renderVazio('Nenhum produto encontrado para este contrato.');return;}
  var html='';
  if(filtroStatus){
    var filtrados=todosProdutos.filter(function(p){return p.situacao===filtroStatus;});
    if(!filtrados.length){renderVazio('Nenhum produto com este status neste contrato.');return;}
    html='<div class="produtos-grid">'+filtrados.map(renderCard).join('')+'</div>';
    document.getElementById('conteudo').innerHTML=html;
    return;
  }
  var pendentes=todosProdutos.filter(function(p){return p.situacao==='pendente';});
  var emAnalise=todosProdutos.filter(function(p){return p.situacao==='em_analise';});
  var parcial=todosProdutos.filter(function(p){return p.situacao==='entrega_parcial';});
  var devolvidos=todosProdutos.filter(function(p){return p.situacao==='devolvido';});
  var aprovados=todosProdutos.filter(function(p){return p.situacao==='aprovado';});
  if(emAnalise.length)html+='<div class="sec-lbl" style="color:#1E40AF">🔍 Em avaliação ('+emAnalise.length+')</div><div class="produtos-grid">'+emAnalise.map(renderCard).join('')+'</div>';
  if(parcial.length)html+='<div class="sec-lbl" style="color:#6D28D9">⚡ Entrega parcial ('+parcial.length+')</div><div class="produtos-grid">'+parcial.map(renderCard).join('')+'</div>';
  if(devolvidos.length)html+='<div class="sec-lbl" style="color:#991B1B">↩ Devolvidos p/ correção ('+devolvidos.length+')</div><div class="produtos-grid">'+devolvidos.map(renderCard).join('')+'</div>';
  if(pendentes.length)html+='<div class="sec-lbl">📋 Pendentes ('+pendentes.length+')</div><div class="produtos-grid">'+pendentes.map(renderCard).join('')+'</div>';
  if(aprovados.length)html+='<div class="sec-lbl" style="color:#166534">✓ Aprovados / A pagar ('+aprovados.length+')</div><div class="produtos-grid">'+aprovados.map(renderCard).join('')+'</div>';
  document.getElementById('conteudo').innerHTML=html;
}

function renderPainelContrato(forn,contratoNum,totais,seiContrato){
  var saldo=totais.total-totais.pago;
  return '<div style="background:#F8FAFC;border:1px solid var(--borda);border-radius:var(--raio-lg);padding:10px 14px;margin-bottom:12px">'
    +'<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
    +'<div style="width:30px;height:30px;border-radius:50%;background:var(--verde-bg);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">&#x1F3E2;</div>'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:13px;font-weight:700;color:var(--cinza-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(forn.nome||'—')+'</div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-top:1px;flex-wrap:wrap">'
    +(forn.cpf_cnpj?'<span style="font-size:10px;color:var(--cinza-500);font-family:var(--font-mono)">'+esc(forn.cpf_cnpj)+'</span>':'')
    +'<span style="font-size:10px;color:var(--cinza-400)">·</span>'
    +'<span style="font-size:10px;font-weight:600;color:var(--cinza-700);font-family:var(--font-mono)">Contrato '+esc(contratoNum||'—')+'</span>'
    +(seiContrato?'<span style="font-size:10px;color:var(--cinza-400)">·</span><span style="font-size:10px">SEI: '+linkSEI(seiContrato)+'</span>':'')
    +'</div></div>'
    +'<div style="display:flex;gap:16px;align-items:center;flex-shrink:0">'
    +'<div style="text-align:right"><div style="font-size:9px;color:var(--cinza-400);text-transform:uppercase;letter-spacing:.04em">Total</div><div style="font-size:11px;font-weight:700;color:var(--cinza-800);font-family:var(--font-mono)">'+fmtBRL(totais.total)+'</div></div>'
    +'<div style="text-align:right"><div style="font-size:9px;color:var(--cinza-400);text-transform:uppercase;letter-spacing:.04em">Aprovado</div><div style="font-size:11px;font-weight:700;color:#7C3AED;font-family:var(--font-mono)">'+fmtBRL(totais.aprovado)+'</div></div>'
    +'<div style="text-align:right"><div style="font-size:9px;color:var(--cinza-400);text-transform:uppercase;letter-spacing:.04em">Pago</div><div style="font-size:11px;font-weight:700;color:#059669;font-family:var(--font-mono)">'+fmtBRL(totais.pago)+'</div></div>'
    +'<div style="text-align:right"><div style="font-size:9px;color:var(--cinza-400);text-transform:uppercase;letter-spacing:.04em">Saldo</div><div style="font-size:11px;font-weight:700;color:'+(saldo>=0?'#1D4ED8':'#DC2626')+';font-family:var(--font-mono)">'+fmtBRL(saldo)+'</div></div>'
    +'</div></div></div>';
}

async function abrirModal(prodId){
  var r=await db.from('contratos_produtos')
    .select('*,contratos(id,numero,objeto_pt,atividade_id,numero_sei,fornecedores(id,nome,cpf_cnpj,email),atividades(id,codigo,nome_pt)),contratos_produtos_entregas(*)')
    .eq('id',prodId).single();
  var p=r.data;
  if(!p)return;
  produtoAtual=p;
  docsEntrega=[];notaTecnicaFile=null;fotosNovas=[];

  var entregas=p.contratos_produtos_entregas||[];
  entregas.sort(function(a,b){return a.numero_entrega-b.numero_entrega;});
  var entregaAtualObj=entregas.find(function(e){return e.situacao==='em_analise';});
  entregaAtual=entregaAtualObj||null;

  var pctAprov=parseFloat(p.pct_aprovado||0);
  var pctRest=100-pctAprov;
  var valorRest=parseFloat(p.valor_brl||0)*pctRest/100;
  var numProxEntrega=(entregas.length+1);

  var isPend=p.situacao==='pendente'||p.situacao==='entrega_parcial'||p.situacao==='devolvido';
  var isAnalise=p.situacao==='em_analise';
  var isDevolvido=p.situacao==='devolvido';

  // Totais financeiros do contrato + docs devolvida em paralelo quando possível
  var totaisR=await db.from('contratos_produtos').select('valor_brl,valor_aprovado,situacao').eq('contrato_id',p.contrato_id);
  var todosCont=totaisR.data||[];
  var ctTotal=todosCont.reduce(function(s,x){return s+parseFloat(x.valor_brl||0);},0);
  var ctAprovado=todosCont.reduce(function(s,x){return s+parseFloat(x.valor_aprovado||0);},0);
  var ctPago=todosCont.filter(function(x){return x.situacao==='pago';}).reduce(function(s,x){return s+parseFloat(x.valor_aprovado||0);},0);
  var ctTotais={total:ctTotal,aprovado:ctAprovado,pago:ctPago};
  var fornContrato=p.contratos&&p.contratos.fornecedores||{};
  var numContrato=p.contratos&&p.contratos.numero||'';
  var seiContrato=p.contratos&&p.contratos.numero_sei||'';

  // Para devolvido: buscar entrega devolvida e seus documentos anteriores
  var entregaDevolvida=null,docsDevolvida=[];
  if(isDevolvido){
    entregaDevolvida=entregas.filter(function(e){return e.situacao==='devolvida';}).sort(function(a,b){return b.numero_entrega-a.numero_entrega;})[0]||null;
    if(entregaDevolvida){
      var ddR=await db.from('entrega_documentos').select('*').eq('entrega_id',entregaDevolvida.id);
      docsDevolvida=ddR.data||[];
    }
  }

  var titulo=isDevolvido?('Reenviar Entrega — Produto '+p.numero_produto):isPend?('Registrar Entrega — Produto '+p.numero_produto):('Avaliar Entrega — Produto '+p.numero_produto);
  document.getElementById('mp-titulo').textContent=titulo;

  var html='';

  // Painel de contrato (topo — visível em todas as fases)
  html+=renderPainelContrato(fornContrato,numContrato,ctTotais,seiContrato);

  // Cabeçalho do produto
  html+='<div style="background:var(--cinza-50);border:1px solid var(--borda);border-radius:var(--raio);padding:12px;margin-bottom:14px">'
    +'<div style="font-size:13px;font-weight:700;color:var(--cinza-900);margin-bottom:8px">'+esc(p.descricao)+'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px">'
    +'<div><div class="info-lbl">Valor total</div><div class="info-val" style="font-family:var(--font-mono);font-weight:700;color:var(--verde-medio)">'+fmtBRL(parseFloat(p.valor_brl||0))+'</div></div>'
    +'<div><div class="info-lbl">Situação</div><div class="info-val"><span class="sit sit-'+p.situacao+'">'+sitLbl(p.situacao)+'</span></div></div>'
    +(pctAprov>0?'<div><div class="info-lbl">Aprovado</div><div class="info-val" style="color:#7C3AED;font-weight:600">'+pctAprov+'% · '+fmtBRL(parseFloat(p.valor_aprovado||0))+'</div></div>':'')
    +(p.dt_vencimento?'<div><div class="info-lbl">Vencimento</div><div class="info-val">'+fmtData(p.dt_vencimento)+'</div></div>':'')
    +'</div>'
    +(pctAprov>0?'<div style="margin-top:10px"><div style="font-size:10px;color:var(--cinza-500);margin-bottom:3px">Progresso</div><div class="prog-produto" style="height:8px"><div class="prog-fill" style="width:'+pctAprov+'%;background:#7C3AED"></div></div></div>':'')
    +'</div>';

  // Histórico de entregas anteriores
  if(entregas.length){
    var histAberto=entregas.length<=2?' open':'';
    html+='<details'+histAberto+' style="margin-bottom:14px;border:1px solid var(--borda);border-radius:var(--raio);overflow:hidden">'
      +'<summary style="padding:10px 14px;font-size:11px;font-weight:700;color:var(--cinza-600);text-transform:uppercase;letter-spacing:.06em;cursor:pointer;background:var(--cinza-50);list-style:none;display:flex;align-items:center;justify-content:space-between">'
      +'<span>Histórico de entregas <span style="font-size:10px;background:var(--cinza-200);color:var(--cinza-600);border-radius:99px;padding:1px 7px;font-weight:600;margin-left:6px">'+entregas.length+'</span></span>'
      +'<span style="font-size:10px;color:var(--cinza-400);font-weight:400">clique para '+(histAberto?' ocultar':'expandir')+'</span></summary>'
      +'<div style="padding:12px 14px">';
    entregas.forEach(function(e){
      var cSit={aprovada:'#059669',em_analise:'#2563EB',devolvida:'#DC2626'};
      var nSit={aprovada:'Aprovada',em_analise:'Em avaliação',devolvida:'Devolvida'};
      var bgSit=e.situacao==='aprovada'?'#ECFDF5':e.situacao==='devolvida'?'#FEF2F2':'#EFF6FF';
      html+='<div class="entrega-item"><div class="edot '+e.situacao+'"></div><div style="flex:1">'
        +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">'
        +'<span style="font-size:12px;font-weight:600;color:var(--cinza-900)">Entrega '+e.numero_entrega+'</span>'
        +'<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:'+bgSit+';color:'+(cSit[e.situacao]||'#6B7280')+'">'+(nSit[e.situacao]||e.situacao)+'</span>'
        +'<span style="font-size:11px;font-family:var(--font-mono);color:var(--verde-medio);font-weight:700;margin-left:auto">'+e.pct_entregue+'% · '+fmtBRL(parseFloat(e.valor_entregue||0))+'</span>'
        +'</div>'
        +(e.numero_sei_subprocesso?'<div style="font-size:10px;color:var(--cinza-600);margin-bottom:3px">SEI: '+linkSEI(e.numero_sei_subprocesso)+'</div>':'')
        +(e.despacho_numero?'<div style="font-size:10px;color:var(--cinza-500);margin-bottom:3px">&#x1F4CB; '+esc(e.despacho_numero)+(e.despacho_data?' · '+fmtData(e.despacho_data):'')+'</div>':'')
        +(e.despacho_texto?'<div style="font-size:11px;color:var(--cinza-700);line-height:1.5;background:var(--cinza-50);border-radius:4px;padding:6px 8px;margin-top:4px;border-left:3px solid '+(cSit[e.situacao]||'var(--borda)')+'">'+esc(e.despacho_texto.substring(0,200))+(e.despacho_texto.length>200?'…':'')+'</div>':'')
        +(e.arquivo_nome?'<div style="font-size:11px;color:var(--azul-medio);margin-top:5px;display:flex;align-items:center;gap:6px">&#x1F4CE; '+esc(e.arquivo_nome)
          +(e.arquivo_url?'<button class="btn-xs" onclick="event.stopPropagation();abrirArquivo(\''+e.arquivo_url+'\')" style="height:20px;padding:0 6px;font-size:10px">Abrir</button>':'')+'</div>':'')
        +((e.fotos_total||0)>0?'<div style="font-size:11px;color:var(--cinza-500);margin-top:4px">&#x1F4F7; '+e.fotos_total+' foto(s) de evidência</div>':'')
        +'</div></div>';
    });
    html+='</div></details>';
  }

  // FORMULÁRIO DE ENTREGA
  if(isPend){

    // Painel de contexto para produtos devolvidos
    if(isDevolvido&&entregaDevolvida){
      html+='<div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:var(--raio);padding:14px 16px;margin-bottom:14px">'
        +'<div style="font-size:12px;font-weight:700;color:#991B1B;margin-bottom:10px;display:flex;align-items:center;gap:6px">&#x21A9; Este produto foi devolvido para correção</div>'
        // Motivo da devolução
        +(entregaDevolvida.despacho_texto?'<div style="font-size:12px;color:#7F1D1D;background:#fff;border:1px solid #FCA5A5;border-radius:var(--raio);padding:8px 10px;margin-bottom:10px;line-height:1.55">'
          +'<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#DC2626">Motivo ('+(entregaDevolvida.despacho_numero||'Despacho')+'): </span>'
          +esc(entregaDevolvida.despacho_texto)
          +'</div>':'')
        // Documentos enviados anteriormente
        +(docsDevolvida.length?'<div style="font-size:11px;font-weight:700;color:#991B1B;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">&#x1F4CE; Documentos enviados anteriormente</div>'
          +'<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:'+(entregaDevolvida.fotos_total>0?'10':'0')+'px">'
          +docsDevolvida.map(function(d){
            return '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #FCA5A5;border-radius:var(--raio);padding:6px 10px;font-size:11px">'
              +'<span style="font-size:13px">&#x1F4C4;</span>'
              +'<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--cinza-800);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(d.arquivo_nome||'Documento')+'</div>'
              +'<div style="color:var(--cinza-500);font-size:10px">'+esc(d.tipo_documento||'')+'</div></div>'
              +(d.arquivo_url?'<button class="btn btn-sm btn-secondary" style="flex-shrink:0;height:24px;padding:0 8px;font-size:10px" onclick="event.stopPropagation();abrirArquivo(\''+esc(d.arquivo_url)+'\')">Abrir</button>':'')
              +'</div>';
          }).join('')
          +'</div>':'')
        // Fotos enviadas anteriormente
        +((entregaDevolvida.fotos_total>0&&(entregaDevolvida.fotos_urls||[]).length)?'<div style="font-size:11px;font-weight:700;color:#991B1B;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">&#x1F4F7; Fotos enviadas anteriormente ('+entregaDevolvida.fotos_total+')</div>'
          +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px">'
          +(entregaDevolvida.fotos_urls||[]).map(function(url,i){
            var nome=(entregaDevolvida.fotos_nomes||[])[i]||('Foto '+(i+1));
            return '<div class="album-foto" style="border-radius:6px;overflow:hidden;aspect-ratio:1;cursor:zoom-in;background:var(--cinza-100);position:relative;border:1px solid #FCA5A5" onclick="abrirLightbox(\''+url.replace(/'/g,"\\'")+'\',\''+nome.replace(/'/g,"\\'")+'\')"><img src="'+url+'" alt="'+esc(nome)+'" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"></div>';
          }).join('')
          +'</div>':'')
        +'</div>';
    }

    var complemento=p.situacao==='entrega_parcial'?'<span style="font-size:10px;font-weight:400;color:var(--cinza-500)">&nbsp;— complemento (restam '+pctRest.toFixed(0)+'% · '+fmtBRL(valorRest)+')</span>':'';
    html+='<div style="border-top:1px solid var(--borda);padding-top:14px">'
      +'<div style="font-size:11px;font-weight:700;color:var(--cinza-700);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">Registrar Entrega '+numProxEntrega+' '+complemento+'</div>'
      +'<div class="grid-2" style="margin-bottom:12px">'
      +'<div class="form-group"><label class="form-label">Data de entrega <span class="obrig">*</span></label>'
      +'<input class="form-control" type="date" id="f-dt-ent" value="'+new Date().toISOString().split('T')[0]+'"></div>'
      +'<div class="form-group"><label class="form-label">Observação</label>'
      +'<input class="form-control" type="text" id="f-obs-ent" placeholder="Ex: Entregue conforme cronograma"></div>'
      +'</div>'
      +'<div class="form-group" style="margin-bottom:12px">'
      +'<label class="form-label">SEI — sub-processo desta entrega'
      +'<span style="font-size:10px;font-weight:400;color:var(--cinza-400);margin-left:6px">opcional · preenche automaticamente com o SEI do contrato se deixado em branco</span></label>'
      +'<div style="display:flex;align-items:center;gap:8px">'
      +'<input class="form-control" id="f-sei-sub" type="text" placeholder="'+(seiContrato||'0000000.000000/0000-00')+'" value="'+(seiContrato||'')+'" maxlength="22" style="font-family:var(--font-mono);max-width:280px" oninput="this.value=maskSEI(this.value)">'
      +(seiContrato?'<span style="font-size:11px;color:var(--cinza-400)">← do contrato</span>':'')
      +'</div></div>'
      +'<div class="form-group">'
      +'<label class="form-label">Documentos entregues <span class="obrig">*</span></label>'
      +'<div style="display:flex;gap:8px;margin-bottom:8px">'
      +'<select class="form-control" id="sel-tipo-doc" style="flex:1;height:34px;font-size:12px">'
      +TIPOS_DOC.map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('')
      +'</select>'
      +'<button class="btn btn-secondary btn-sm" style="white-space:nowrap;height:34px" onclick="onBtnAdicionarDoc()">+ Adicionar</button>'
      +'<input type="file" id="inp-arq" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.jpg,.png" onchange="adicionarDoc(this.files[0]);this.value=\'\'">'
      +'</div>'
      +'<div id="lista-docs"><div style="font-size:11px;color:var(--cinza-400);padding:6px 0">Nenhum documento adicionado ainda.</div></div>'
      +'<div style="font-size:10px;color:var(--cinza-400);margin-top:4px">PDF, Word, Excel, ZIP, Imagem · até 20MB por arquivo · ou selecione <b>Planilha de Geolocalização</b> para importar CSV com coordenadas</div>'
      +'</div>'
      +'<div class="form-group">'
      +'<label class="form-label">Fotos de evidência <span style="font-size:10px;color:var(--cinza-400);font-weight:400">(JPEG/PNG · até 10)</span></label>'
      +'<div class="fotos-drop" id="fotos-drop" onclick="document.getElementById(\'inp-fotos\').click()" ondragover="event.preventDefault();this.classList.add(\'drag\')" ondragleave="this.classList.remove(\'drag\')" ondrop="event.preventDefault();this.classList.remove(\'drag\');adicionarFotos(event.dataTransfer.files)">'
      +'<input type="file" id="inp-fotos" style="display:none" accept=".jpg,.jpeg,.png" multiple onchange="adicionarFotos(this.files)">'
      +'<div style="font-size:13px;font-weight:500;color:var(--cinza-600)">&#x1F4F7; Clique ou arraste as fotos aqui</div>'
      +'<div style="font-size:11px;color:var(--cinza-400);margin-top:4px">JPEG, PNG · Máximo 10 fotos</div>'
      +'</div>'
      +'<div id="fotos-grid" class="fotos-grid"></div>'
      +'<div id="fotos-count" style="font-size:11px;color:var(--cinza-500);margin-top:6px"></div>'
      +'</div>'
      // Aviso contribuição obrigatória quando há geo
      +'<div id="aviso-geo" style="display:none;align-items:flex-start;gap:10px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:var(--raio);padding:10px 12px;margin-bottom:10px">'
      +'<span style="font-size:16px;flex-shrink:0">&#x26A0;&#xFE0F;</span>'
      +'<div style="font-size:12px;color:#92400E"><strong>Contribuição obrigatória.</strong> Esta entrega contém uma planilha de geolocalização — vincule-a a pelo menos um indicador da Matriz de Resultados abaixo antes de enviar.</div>'
      +'</div>'
      // Contribuição à Matriz de Resultados
      +'<div style="border-top:1px solid var(--borda);padding-top:14px;margin-top:4px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
      +'<div style="font-size:11px;font-weight:700;color:var(--cinza-700);text-transform:uppercase;letter-spacing:.05em">&#x25CE; Contribuição à Matriz de Resultados</div>'
      +'<span style="font-size:10px;color:var(--cinza-400);font-style:italic">opcional — sujeito a confirmação técnica</span>'
      +'</div>'
      +'<div id="matriz-contribs-lista" style="margin-bottom:8px"></div>'
      +'<button class="btn btn-sm btn-secondary" onclick="adicionarLinhaMatriz()">+ Vincular indicador</button>'
      +'</div>'
      +'</div>';

    // Carregar opções de matriz em background
    carregarMatrizItens();

    document.getElementById('mp-footer').innerHTML=
      '<button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>'
      +'<button class="btn-registrar" onclick="registrarEntrega('+numProxEntrega+','+pctRest.toFixed(2)+','+valorRest.toFixed(2)+')">&#x1F4E5; Registrar e enviar para avaliação</button>';

  } else if(isAnalise&&entregaAtual){
    // Buscar: todos os docs de todas as entregas + pontos geo da entrega atual + contribuições
    var entregaIds=entregas.map(function(e){return e.id;});
    var [allDocsR,geoR,contribsR]=await Promise.all([
      db.from('entrega_documentos').select('*').in('entrega_id',entregaIds).order('inserido_em'),
      db.from('produto_pontos_mapa').select('id,nome,latitude,longitude,tipo_geometria').eq('entrega_id',entregaAtual.id),
      db.from('produto_matriz_contribuicao').select('*,matriz_itens(resultado,produto_codigo,produto_titulo,indicador,unidade)').eq('produto_id',entregaAtual.id)
    ]);
    var allDocs=allDocsR.data||[];
    geoPontosCache=geoR.data||[];
    var contribs=contribsR.data||[];

    // Lookup de entregas por id
    var entregaById={};
    entregas.forEach(function(e){entregaById[e.id]=e;});

    // Agrupar docs por tipo_documento; dentro de cada grupo: mais recente primeiro
    var docsByTipo={};
    var tiposOrdem=[];
    allDocs.forEach(function(d){
      var t=d.tipo_documento||'Outros';
      if(!docsByTipo[t]){docsByTipo[t]=[];tiposOrdem.push(t);}
      docsByTipo[t].push(d);
    });
    tiposOrdem.forEach(function(t){
      docsByTipo[t].sort(function(a,b){
        var na=(entregaById[a.entrega_id]||{}).numero_entrega||0;
        var nb=(entregaById[b.entrega_id]||{}).numero_entrega||0;
        return nb-na;
      });
    });

    // Coletar fotos de TODAS as entregas (mais recente primeiro)
    var todasFotos=[];
    entregas.slice().sort(function(a,b){return b.numero_entrega-a.numero_entrega;}).forEach(function(e){
      (e.fotos_urls||[]).forEach(function(url,i){
        todasFotos.push({url:url,nome:(e.fotos_nomes||[])[i]||('Foto '+(i+1)),entregaNum:e.numero_entrega,isAtual:e.id===entregaAtual.id});
      });
    });

    var nDocs=allDocs.length;
    var nFotos=todasFotos.length;
    var nGeo=geoPontosCache.length;

    // ── Layout 2 colunas ─────────────────────────────────────────
    html+='<div class="aval-2col">';

    // ── COLUNA ESQUERDA: evidências ───────────────────────────────
    html+='<div>';
    html+='<div class="eval-tabs">'
      +'<button class="eval-tab-btn ativo" id="eval-btn-docs" onclick="switchEvalTab(\'docs\')">&#x1F4CE; Documentos'+(nDocs?' ('+nDocs+')':'')+'</button>'
      +(nFotos?'<button class="eval-tab-btn" id="eval-btn-fotos" onclick="switchEvalTab(\'fotos\')">&#x1F4F7; Fotos ('+nFotos+')</button>':'')
      +(nGeo?'<button class="eval-tab-btn" id="eval-btn-geo" onclick="switchEvalTab(\'geo\')">&#x1F4CD; Geo ('+nGeo+' pts)</button>':'')
      +(contribs.length?'<button class="eval-tab-btn" id="eval-btn-ind" onclick="switchEvalTab(\'ind\')">&#x25CE; Indicadores ('+contribs.length+')</button>':'')
      +'</div>';

    // Tab Documentos (versionado)
    html+='<div class="eval-tab-content ativo" id="eval-tab-docs">';
    if(nDocs){
      tiposOrdem.forEach(function(tipo){
        var items=docsByTipo[tipo];
        var isGeo=tipo===TIPO_GEO;
        html+='<div style="border:1px solid var(--borda);border-radius:var(--raio);overflow:hidden;margin-bottom:10px">'
          +'<div style="padding:7px 12px;background:var(--cinza-50);border-bottom:1px solid var(--borda);font-size:11px;font-weight:700;color:var(--cinza-700);display:flex;align-items:center;gap:6px">'
          +(isGeo?'&#x1F4CD;':'&#x1F4C4;')+' '+esc(tipo)
          +(items.length>1?'<span style="font-size:10px;color:var(--cinza-400);font-weight:400;margin-left:4px">('+items.length+' versões)</span>':'')
          +'</div>';
        items.forEach(function(d,idx){
          var ent=entregaById[d.entrega_id]||{};
          var isAtual=d.entrega_id===entregaAtual.id;
          var rowBg=idx===0?'background:#fff':'background:var(--cinza-50)';
          html+='<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--borda);'+rowBg+'">'
            +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(d.arquivo_nome||'Documento')+'</div>'
            +'<div style="font-size:10px;color:var(--cinza-500);margin-top:2px">Entrega '+esc(String(ent.numero_entrega||'?'))+(ent.dt_entrega?' · '+fmtData(ent.dt_entrega):'')+'</div>'
            +'</div>'
            +(isAtual
              ?'<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:#DCFCE7;color:#166534;flex-shrink:0;white-space:nowrap">&#x2714; Atual</span>'
              :'<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:var(--cinza-100);color:var(--cinza-500);flex-shrink:0;white-space:nowrap">Anterior</span>'
            )
            +(isGeo
              ?'<button class="btn btn-sm btn-secondary" style="font-size:11px;white-space:nowrap;flex-shrink:0" onclick="switchEvalTab(\'geo\')">&#x1F4CD; Ver pontos</button>'
              :(d.arquivo_url?'<button class="btn btn-sm btn-secondary" style="font-size:11px;flex-shrink:0" onclick="abrirArquivo(\''+esc(d.arquivo_url)+'\')">&#x1F441; Abrir</button>':'')
            )
            +'</div>';
        });
        html+='</div>';
      });
    }else{
      html+='<div style="font-size:12px;color:var(--cinza-400);padding:12px 0">Nenhum documento encontrado.</div>';
    }
    html+='</div>';

    // Tab Fotos — todas as entregas agrupadas
    if(nFotos){
      html+='<div class="eval-tab-content" id="eval-tab-fotos">';
      var fotosPorEnt={};var ordemEnts=[];
      todasFotos.forEach(function(f){
        var k=f.entregaNum;
        if(!fotosPorEnt[k]){fotosPorEnt[k]=[];ordemEnts.push(k);}
        fotosPorEnt[k].push(f);
      });
      ordemEnts.forEach(function(en){
        var fotos=fotosPorEnt[en];
        var isAtu=fotos[0]&&fotos[0].isAtual;
        html+='<div style="margin-bottom:14px">'
          +'<div style="font-size:11px;font-weight:700;color:var(--cinza-600);margin-bottom:8px;display:flex;align-items:center;gap:6px">Entrega '+en
          +(isAtu?' <span style="font-size:9px;padding:2px 7px;background:#DCFCE7;color:#166534;border-radius:99px;font-weight:700">Atual</span>':'')
          +'</div>'
          +'<div class="album-grid">';
        fotos.forEach(function(f){
          html+='<div class="album-foto" onclick="abrirLightbox(\''+f.url.replace(/'/g,"\\'")+'\',\''+f.nome.replace(/'/g,"\\'")+'\')"><img src="'+f.url+'" alt="'+esc(f.nome)+'" loading="lazy"><div class="album-foto-nome">'+esc(f.nome)+'</div></div>';
        });
        html+='</div></div>';
      });
      html+='</div>';
    }

    // Tab Geo — tabela de pontos
    if(nGeo){
      html+='<div class="eval-tab-content" id="eval-tab-geo">'
        +'<div style="font-size:11px;color:var(--cinza-500);margin-bottom:8px">'+nGeo+' ponto(s) carregados na Entrega '+entregaAtual.numero_entrega+'</div>'
        +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'
        +'<thead><tr style="background:var(--cinza-50);border-bottom:2px solid var(--borda)">'
        +'<th style="text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--cinza-500)">#</th>'
        +'<th style="text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--cinza-500)">Nome</th>'
        +'<th style="text-align:right;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--cinza-500)">Latitude</th>'
        +'<th style="text-align:right;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--cinza-500)">Longitude</th>'
        +'<th style="text-align:center;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--cinza-500)">Tipo</th>'
        +'</tr></thead><tbody>';
      geoPontosCache.forEach(function(pt,i){
        html+='<tr style="border-bottom:1px solid var(--borda);'+(i%2===0?'':'background:var(--cinza-50)')+'">'
          +'<td style="padding:7px 10px;color:var(--cinza-400);font-size:11px">'+(i+1)+'</td>'
          +'<td style="padding:7px 10px;font-weight:500">'+esc(pt.nome||'—')+'</td>'
          +'<td style="padding:7px 10px;text-align:right;font-family:var(--font-mono);font-size:11px">'+parseFloat(pt.latitude||0).toFixed(6)+'</td>'
          +'<td style="padding:7px 10px;text-align:right;font-family:var(--font-mono);font-size:11px">'+parseFloat(pt.longitude||0).toFixed(6)+'</td>'
          +'<td style="padding:7px 10px;text-align:center"><span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:var(--cinza-100);color:var(--cinza-600)">'+esc(pt.tipo_geometria||'ponto')+'</span></td>'
          +'</tr>';
      });
      html+='</tbody></table></div></div>';
    }

    // Tab Indicadores
    if(contribs.length){
      var stCor={'pendente':'#92400E','confirmado':'#065F46','rejeitado':'#991B1B'};
      var stBg={'pendente':'#FEF3C7','confirmado':'#D1FAE5','rejeitado':'#FEE2E2'};
      var stLbl={'pendente':'Pendente','confirmado':'Confirmado','rejeitado':'Rejeitado'};
      html+='<div class="eval-tab-content" id="eval-tab-ind">'
        +'<div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:var(--raio);padding:12px 14px">'
        +'<div style="font-size:11px;font-weight:700;color:#4C1D95;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">&#x25CE; Contribuição à Matriz de Resultados</div>';
      contribs.forEach(function(c){
        var mi=c.matriz_itens||{};var st=c.status||'pendente';
        html+='<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;background:#fff;border:1px solid #DDD6FE;border-radius:var(--raio);margin-bottom:6px">'
          +'<div style="flex:1;min-width:0">'
          +'<div style="font-size:10px;font-family:var(--font-mono);font-weight:700;color:#5B21B6;margin-bottom:2px">R'+mi.resultado+' · '+esc(mi.produto_codigo||'')+'</div>'
          +'<div style="font-size:12px;font-weight:600;color:var(--cinza-900);line-height:1.3;margin-bottom:4px">'+esc(mi.indicador||'')+'</div>'
          +'<div style="font-size:11px;color:var(--cinza-600)">Valor declarado: <strong style="font-family:var(--font-mono)">'+parseFloat(c.valor||0).toLocaleString('pt-BR')+'</strong>'+(c.unidade?' '+esc(c.unidade):'')+'</div>'
          +(c.observacao?'<div style="font-size:10px;color:var(--cinza-500);margin-top:3px;font-style:italic">'+esc(c.observacao)+'</div>':'')
          +'</div>'
          +'<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:99px;white-space:nowrap;background:'+(stBg[st]||'#F3F4F6')+';color:'+(stCor[st]||'#374151')+'">'+(stLbl[st]||st)+'</span>'
          +'</div>';
      });
      html+='</div></div>';
    }
    html+='</div>'; // fim coluna esquerda

    // ── COLUNA DIREITA: decisão ───────────────────────────────────
    html+='<div class="aval-col-direita">';

    // O que foi contratado
    html+='<div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:var(--raio);padding:12px 14px;margin-bottom:12px">'
      +'<div style="font-size:11px;font-weight:700;color:#0369A1;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">&#x1F4CB; O que foi contratado</div>'
      +'<div style="font-size:13px;font-weight:600;color:var(--cinza-900);line-height:1.4;margin-bottom:'+(p.observacoes?'8':'0')+'px">'+esc(p.descricao||'')+'</div>'
      +(p.observacoes?'<div style="font-size:11px;color:var(--cinza-600);line-height:1.55;border-top:1px solid #BAE6FD;padding-top:8px"><strong style="font-size:10px;color:#0369A1;text-transform:uppercase;letter-spacing:.04em">Observações: </strong>'+esc(p.observacoes)+'</div>':'')
      +'</div>';

    // Confirmação
    html+='<div style="background:#FEF9C3;border:1px solid #FDE047;border-radius:var(--raio);padding:10px 14px;margin-bottom:12px">'
      +'<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">'
      +'<input type="checkbox" id="chk-confirmacao" onchange="toggleAvalCheckbox()" style="margin-top:2px;width:16px;height:16px;accent-color:#059669;flex-shrink:0">'
      +'<span style="font-size:12px;font-weight:600;color:#713F12;line-height:1.45">Confirmo que o produto corresponde ao contratado. Conteúdo e qualidade estão em conformidade.</span>'
      +'</label></div>';

    // Decisão
    var pctRestF=pctRest.toFixed(0);
    var valorRestF=fmtBRL(valorRest);
    html+='<div style="margin-bottom:12px">'
      +'<div style="font-size:11px;font-weight:700;color:var(--cinza-700);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Decisão de avaliação</div>'
      +'<div class="decisao-opts">'
      +'<label class="decisao-opt" id="opt-total" onclick="selecionarDecisao(\'aprovacao_total\')">'
      +'<input type="radio" name="decisao" value="aprovacao_total">'
      +'<div><div class="decisao-tit" style="color:#059669">&#x2714; Aprovação total</div>'
      +'<div class="decisao-sub">'+pctRestF+'% aprovado · '+valorRestF+'</div></div></label>'
      +'<label class="decisao-opt" id="opt-parcial" onclick="selecionarDecisao(\'aprovacao_parcial\')">'
      +'<input type="radio" name="decisao" value="aprovacao_parcial">'
      +'<div><div class="decisao-tit" style="color:#7C3AED">&#x25D1; Aprovação parcial</div>'
      +'<div class="decisao-sub">Pagamento proporcional</div></div></label>'
      +'<div id="wrap-parcial" style="display:none">'
      +'<div class="grid-2"><div class="form-group" style="margin-bottom:0">'
      +'<label class="form-label">% aprovado <span class="obrig">*</span></label>'
      +'<input class="form-control" type="number" id="f-pct" min="1" max="'+pctRestF+'" placeholder="Ex: 70" oninput="calcValorParcial(this.value,'+parseFloat(p.valor_brl||0)+')">'
      +'<div class="form-hint">Máximo: '+pctRestF+'%</div>'
      +'</div><div class="form-group" style="margin-bottom:0">'
      +'<label class="form-label">Valor a pagar (R$)</label>'
      +'<input class="form-control" type="number" id="f-val-parcial" readonly style="background:var(--cinza-50);font-family:var(--font-mono);font-weight:600" placeholder="Calculado">'
      +'</div></div></div>'
      +'<label class="decisao-opt" id="opt-devol" onclick="selecionarDecisao(\'devolucao\')">'
      +'<input type="radio" name="decisao" value="devolucao">'
      +'<div><div class="decisao-tit" style="color:#DC2626">&#x21A9; Devolução</div>'
      +'<div class="decisao-sub">Não atende — devolvido para correção</div></div></label>'
      +'</div></div>';

    // Despacho
    html+='<div class="despacho-box">'
      +'<div style="font-size:10px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">&#x1F4CB; Despacho — número gerado automaticamente</div>'
      +'<div class="form-group" style="margin-bottom:10px"><label class="form-label">Texto do despacho <span class="obrig">*</span></label>'
      +'<textarea class="form-control" id="f-despacho" rows="4" placeholder="Descreva formalmente sua decisão..." style="font-size:12px;line-height:1.6"></textarea></div>'
      +'<div class="grid-2">'
      +'<div class="form-group" style="margin-bottom:0"><label class="form-label">Data do despacho</label>'
      +'<input class="form-control" type="date" id="f-dt-desp" value="'+new Date().toISOString().split('T')[0]+'"></div>'
      +'<div class="form-group" style="margin-bottom:0"><label class="form-label">Avaliador</label>'
      +'<input class="form-control" value="'+(appState.usuario&&appState.usuario.nome_completo||'')+'" readonly style="background:var(--cinza-50)"></div>'
      +'</div></div>';

    // Nota Técnica
    html+='<div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:var(--raio);padding:12px 14px;margin-top:12px">'
      +'<div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">&#x1F4C4; Nota Técnica (PDF)</div>'
      +(entregaAtual.nota_tecnica_url?'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 8px;background:#fff;border:1px solid #86EFAC;border-radius:var(--raio)"><span>&#x1F4C4;</span><div style="flex:1;font-size:12px;font-weight:600">'+esc(entregaAtual.nota_tecnica_nome||'Nota Técnica')+'</div><button class="btn btn-sm btn-secondary" style="font-size:11px" onclick="abrirArquivo(\''+esc(entregaAtual.nota_tecnica_url)+'\')">&#x1F441; Abrir</button></div>':'')
      +'<div class="upload-zona" id="zona-nt" style="padding:10px" onclick="document.getElementById(\'inp-nt\').click()" ondragover="event.preventDefault();this.classList.add(\'drag\')" ondragleave="this.classList.remove(\'drag\')" ondrop="event.preventDefault();this.classList.remove(\'drag\');selNotaTecnica(event.dataTransfer.files[0])">'
      +'<input type="file" id="inp-nt" style="display:none" accept=".pdf" onchange="selNotaTecnica(this.files[0])">'
      +'<div style="font-size:12px;font-weight:500;color:var(--cinza-600)">'+(entregaAtual.nota_tecnica_url?'&#x1F4CE; Substituir nota técnica':'&#x1F4CE; Anexar nota técnica (PDF)')+'</div>'
      +'</div><div id="nt-nome" style="font-size:11px;margin-top:4px;color:var(--cinza-500)"></div>'
      +'</div>';

    html+='</div>'; // fim coluna direita
    html+='</div>'; // fim aval-2col

    document.getElementById('mp-footer').innerHTML=
      '<button class="btn btn-secondary" onclick="fecharModal()">Fechar</button>'
      +'<button class="btn-devolver" onclick="emitirDespacho(\'devolucao\')">&#x21A9; Devolver</button>'
      +'<button class="btn-parcial" onclick="emitirDespacho(\'aprovacao_parcial\')">&#x25D1; Aprovar parcialmente</button>'
      +'<button class="btn-aprovar" onclick="emitirDespacho(\'aprovacao_total\')">&#x2714; Aprovar e liberar pagamento</button>';

  } else if(!isPend&&!isAnalise){
    html+=await renderLinhaTempo(p);
    document.getElementById('mp-footer').innerHTML='<button class="btn btn-secondary" onclick="fecharModal()">Fechar</button>';
  } else {
    document.getElementById('mp-footer').innerHTML='<button class="btn btn-secondary" onclick="fecharModal()">Fechar</button>';
  }

  document.getElementById('mp-body').innerHTML=html;
  document.getElementById('modal-prod').classList.add('aberto');
}

async function renderLinhaTempo(p){
  var r=await db.from('contratos_produtos_entregas')
    .select('*,criado_por_u:usuarios!contratos_produtos_entregas_criado_por_fkey(nome_completo),despachado_por_u:usuarios!contratos_produtos_entregas_despachado_por_fkey(nome_completo),lancamento:execucao_financeira!contratos_produtos_entregas_lancamento_id_fkey(id,situacao,valor_brl,dt_pagamento),documentos:entrega_documentos(*)')
    .eq('produto_id',p.id).order('numero_entrega');
  var entregas=r.data||[];

  var SIT_COR={pendente:'#9CA3AF',em_analise:'#2563EB',aprovada:'#059669',devolvida:'#DC2626',pago:'#065F46'};
  var SIT_ICON={pendente:'&#x23F3;',em_analise:'&#x1F50D;',aprovada:'&#x2705;',devolvida:'&#x21A9;',pago:'&#x1F4B0;'};
  var DEC_LABEL={aprovacao_total:'Aprovação total',aprovacao_parcial:'Aprovação parcial',devolucao:'Devolução para ajustes'};

  function tlItem(icon,bg,content,line){
    return '<div style="display:flex;gap:12px;margin-bottom:4px">'
      +'<div style="display:flex;flex-direction:column;align-items:center">'
      +'<div style="width:32px;height:32px;border-radius:50%;background:'+bg+';display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">'+icon+'</div>'
      +(line?'<div style="width:2px;background:var(--borda);flex:1;margin-top:4px"></div>':'')
      +'</div><div style="padding-top:4px;padding-bottom:10px;flex:1">'+content+'</div></div>';
  }

  var html='<div style="border-top:1px solid var(--borda);padding-top:14px">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--cinza-500);margin-bottom:14px">&#x1F4CB; Histórico do produto</div>';

  var cadC='<div style="font-size:12px;font-weight:700;color:var(--cinza-900)">Produto cadastrado</div>'
    +'<div style="font-size:11px;color:var(--cinza-500);margin-top:2px">'+fmtDT(p.criado_em)+'</div>'
    +'<div style="font-size:11px;color:var(--cinza-600);margin-top:4px">Valor: <strong>'+fmtBRL(p.valor_brl)+'</strong>'+(p.dt_vencimento?' · Vence: '+fmtData(p.dt_vencimento):'')+'</div>';
  html+=tlItem('&#x1F7E2;','#D1FAE5',cadC,entregas.length>0);

  entregas.forEach(function(e,ei){
    var docs=e.documentos||[];
    var lanc=Array.isArray(e.lancamento)?e.lancamento[0]:e.lancamento;
    var isUltima=ei===entregas.length-1;
    var corSit=SIT_COR[e.situacao]||'#9CA3AF';
    var iconSit=SIT_ICON[e.situacao]||'&#x1F4E6;';

    // Documentos
    var docsHtml='';
    if(docs.length){
      docsHtml='<div style="margin-top:6px">';
      docs.forEach(function(d){
        docsHtml+='<div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:3px 0">'
          +'<span>&#x1F4CE;</span><span style="color:var(--cinza-700);flex:1">'+esc(d.arquivo_nome)+'</span>'
          +'<span style="color:var(--cinza-400)">'+esc(d.tipo_documento)+'</span>'
          +'<button onclick="abrirArquivo(\''+d.arquivo_url.replace(/'/g,"\\'")+'\');" style="font-size:10px;padding:1px 6px;border:1px solid var(--borda);border-radius:3px;background:var(--branco);cursor:pointer;color:var(--azul-medio)">&#x1F441;</button>'
          +'</div>';
      });
      docsHtml+='</div>';
    } else if(e.arquivo_url){
      docsHtml='<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-top:6px">'
        +'<span>&#x1F4CE;</span><span style="color:var(--cinza-700)">'+esc(e.arquivo_nome||'Documento')+'</span>'
        +'<button onclick="abrirArquivo(\''+e.arquivo_url.replace(/'/g,"\\'")+'\');" style="font-size:10px;padding:1px 6px;border:1px solid var(--borda);border-radius:3px;background:var(--branco);cursor:pointer;color:var(--azul-medio)">&#x1F441;</button>'
        +'</div>';
    }

    var entC='<div style="font-size:12px;font-weight:700;color:var(--cinza-900)">Entrega '+e.numero_entrega+' registrada</div>'
      +'<div style="font-size:11px;color:var(--cinza-500);margin-top:2px">'+(e.dt_entrega?fmtData(e.dt_entrega):'—')+(e.criado_por_u&&e.criado_por_u.nome_completo?' · '+esc(e.criado_por_u.nome_completo):'')+'</div>'
      +docsHtml;
    html+=tlItem('&#x1F4E5;','#EFF6FF',entC,true);

    // Avaliação
    if(e.despacho_numero||e.situacao!=='em_analise'){
      var bgAvl=e.situacao==='devolvida'?'#FEE2E2':e.situacao==='aprovada'?'#D1FAE5':'#F3F4F6';
      var avlC='<div style="font-size:12px;font-weight:700;color:'+corSit+'">'+(DEC_LABEL[e.tipo_decisao]||sitLbl(e.situacao))+'</div>'
        +'<div style="font-size:11px;color:var(--cinza-500);margin-top:2px">'+(e.despacho_data?fmtData(e.despacho_data):fmtDT(e.despachado_em||''))+(e.despachado_por_u&&e.despachado_por_u.nome_completo?' · '+esc(e.despachado_por_u.nome_completo):'')+(e.despacho_numero?' · '+esc(e.despacho_numero):'')+'</div>'
        +(e.despacho_texto?'<div style="font-size:11px;color:var(--cinza-700);margin-top:6px;padding:6px 8px;background:var(--cinza-50);border-left:3px solid '+corSit+';border-radius:0 4px 4px 0;line-height:1.5;max-height:80px;overflow-y:auto">'+esc(e.despacho_texto.substring(0,300))+(e.despacho_texto.length>300?'…':'')+'</div>':'')
        +(e.nota_tecnica_url?'<div style="margin-top:6px;display:flex;align-items:center;gap:6px"><span style="font-size:11px">&#x1F4C4;</span><span style="font-size:11px;color:var(--cinza-700)">'+esc(e.nota_tecnica_nome||'Nota Técnica')+'</span><button onclick="abrirArquivo(\''+e.nota_tecnica_url.replace(/'/g,"\\'")+'\');" style="font-size:10px;padding:1px 6px;border:1px solid #86EFAC;border-radius:3px;background:#F0FDF4;cursor:pointer;color:#166534">&#x1F441; Abrir NT</button></div>':'');
      html+=tlItem(iconSit,bgAvl,avlC,!isUltima||!!lanc);
    }

    // Lançamento
    if(lanc){
      var bgL=lanc.situacao==='pago'?'#D1FAE5':'#FEF3C7';
      var corL=lanc.situacao==='pago'?'#065F46':'#92400E';
      var lancC='<div style="font-size:12px;font-weight:700;color:'+corL+'">'+(lanc.situacao==='pago'?'Pago':'A pagar')+'</div>'
        +'<div style="font-size:11px;color:var(--cinza-500);margin-top:2px">'+fmtBRL(lanc.valor_brl)+(lanc.dt_pagamento?' · Pago em '+fmtData(lanc.dt_pagamento):'')+'</div>';
      html+=tlItem(lanc.situacao==='pago'?'&#x1F4B0;':'&#x1F4B3;',bgL,lancC,false);
    }
  });

  html+='</div>';
  return html;
}

function selecionarDecisao(tipo){
  decisaoSel=tipo;
  document.querySelectorAll('.decisao-opt').forEach(function(el){el.className='decisao-opt';});
  var mapa={aprovacao_total:'opt-total',aprovacao_parcial:'opt-parcial',devolucao:'opt-devol'};
  var cls={aprovacao_total:'sel-total',aprovacao_parcial:'sel-parcial',devolucao:'sel-devol'};
  var el=document.getElementById(mapa[tipo]);
  if(el)el.className='decisao-opt '+cls[tipo];
  var radio=document.querySelector('input[name="decisao"][value="'+tipo+'"]');
  if(radio)radio.checked=true;
  var wp=document.getElementById('wrap-parcial');
  if(wp)wp.style.display=tipo==='aprovacao_parcial'?'block':'none';
}

function calcValorParcial(pct,totalProduto){
  var campo=document.getElementById('f-val-parcial');
  if(campo)campo.value=((parseFloat(pct)||0)*totalProduto/100).toFixed(2);
}

async function abrirArquivo(url){
  if(!url){toast('URL não disponível.','error');return;}
  var match=url.match(/\/object\/(?:public|sign)\/tdrs-arquivos\/(.+?)(\?.*)?$/);
  if(!match){window.open(url,'_blank');return;}
  var path=decodeURIComponent(match[1]);
  var r=await db.storage.from('tdrs-arquivos').createSignedUrl(path,3600);
  if(r.error||!r.data||!r.data.signedUrl){toast('Erro ao gerar link.','error');return;}
  window.open(r.data.signedUrl,'_blank');
}

function adicionarDoc(file){
  if(!file)return;
  if(docsEntrega.length>=10){toast('Máximo 10 documentos.','error');return;}
  var tipo=document.getElementById('sel-tipo-doc')&&document.getElementById('sel-tipo-doc').value||'Relatório Técnico';
  docsEntrega.push({file:file,tipo:tipo,nome:file.name,size:file.size});
  renderListaDocs();
}

function renderListaDocs(){
  var el=document.getElementById('lista-docs');
  if(!el)return;
  if(!docsEntrega.length){el.innerHTML='<div style="font-size:11px;color:var(--cinza-400);padding:6px 0">Nenhum documento adicionado ainda.</div>';renderAvisoGeo();return;}
  el.innerHTML=docsEntrega.map(function(d,i){
    if(d.isGeo){
      return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#F0FDF4;border:1px solid #86EFAC;border-radius:var(--raio);margin-bottom:4px">'
        +'<span style="font-size:16px">&#x1F4CD;</span>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:12px;font-weight:600;color:#166534">'+esc(d.nome)+'</div>'
        +'<div style="font-size:10px;color:#15803D">'+d.pontos.length+' pontos · Planilha de Geolocalização</div>'
        +'</div>'
        +'<button onclick="removerDoc('+i+')" style="width:22px;height:22px;border:1px solid #86EFAC;border-radius:50%;background:#DCFCE7;color:#166534;cursor:pointer;font-size:11px">&#x2715;</button>'
        +'</div>';
    }
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--cinza-50);border:1px solid var(--borda);border-radius:var(--raio);margin-bottom:4px">'
      +'<span>&#x1F4CE;</span>'
      +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(d.nome)+'</div>'
      +'<div style="font-size:10px;color:var(--cinza-500)">'+esc(d.tipo)+' · '+Math.round(d.size/1024)+'KB</div></div>'
      +'<button onclick="removerDoc('+i+')" style="width:22px;height:22px;border:1px solid #FCA5A5;border-radius:50%;background:#FEF2F2;color:var(--erro);cursor:pointer;font-size:11px">&#x2715;</button>'
      +'</div>';
  }).join('');
  renderAvisoGeo();
}

function renderAvisoGeo(){
  var aviso=document.getElementById('aviso-geo');
  if(!aviso)return;
  var temGeo=docsEntrega.some(function(d){return d.isGeo;});
  if(temGeo){
    aviso.style.display='flex';
  } else {
    aviso.style.display='none';
  }
}

function removerDoc(i){docsEntrega.splice(i,1);renderListaDocs();}

function selNotaTecnica(file){
  if(!file)return;
  notaTecnicaFile=file;
  var el=document.getElementById('nt-nome');
  if(el){el.textContent='&#x1F4CE; '+file.name+' ('+Math.round(file.size/1024)+'KB)';el.style.color='var(--verde-medio)';}
  var zona=document.getElementById('zona-nt');
  if(zona)zona.classList.add('tem');
}

function adicionarFotos(files){
  var MAX=10;
  Array.from(files).forEach(function(f){
    if(!['image/jpeg','image/jpg','image/png'].includes(f.type)){toast(f.name+': apenas JPEG/PNG.','error');return;}
    if(fotosNovas.length>=MAX){toast('Máximo '+MAX+' fotos.','error');return;}
    fotosNovas.push(f);
  });
  renderFotosGrid();
}

function renderFotosGrid(){
  var grid=document.getElementById('fotos-grid');
  var count=document.getElementById('fotos-count');
  if(!grid)return;
  grid.innerHTML=fotosNovas.map(function(f,i){
    var url=URL.createObjectURL(f);
    return '<div class="foto-thumb"><img src="'+url+'" alt="Foto '+(i+1)+'">'
      +'<button class="foto-thumb-del" onclick="removerFoto('+i+')" title="Remover">&#x2715;</button>'
      +'</div>';
  }).join('');
  if(count)count.textContent=fotosNovas.length?fotosNovas.length+'/10 foto(s) selecionada(s)':'';
}

function removerFoto(idx){fotosNovas.splice(idx,1);renderFotosGrid();}
function abrirLightbox(url,nome){
  var lb=document.getElementById('lightbox');var img=document.getElementById('lb-img');
  if(lb){lb.style.display='flex';}if(img)img.src=url;
}
function fecharLightbox(){
  var lb=document.getElementById('lightbox');if(lb)lb.style.display='none';
  var img=document.getElementById('lb-img');if(img)img.src='';
}

// ── Matriz de Resultados — carregar indicadores ───────────────
async function carregarMatrizItens(){
  if(matrizItensCache)return;
  var r=await db.from('matriz_itens').select('id,resultado,produto_codigo,produto_titulo,indicador,unidade,meta_numerica').eq('ativo',true).order('ordem');
  matrizItensCache=r.data||[];
}

function adicionarLinhaMatriz(){
  if(!matrizItensCache||!matrizItensCache.length){
    toast('Indicadores da matriz ainda carregando, aguarde...','info');
    carregarMatrizItens();return;
  }
  var lista=document.getElementById('matriz-contribs-lista');
  if(!lista)return;
  var idx=lista.children.length;
  var opcoesInd=matrizItensCache.map(function(i){
    return '<option value="'+i.id+'">[R'+i.resultado+'/'+i.produto_codigo+'] '+(i.indicador||'').substring(0,60)+(i.indicador&&i.indicador.length>60?'…':'')+(i.unidade?' ('+i.unidade+')':'')+'</option>';
  }).join('');

  var div=document.createElement('div');
  div.className='mc-row-'+idx;
  div.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:6px;background:var(--cinza-50);border:1px solid var(--borda);border-radius:var(--raio);padding:6px 8px;';
  div.innerHTML='<select class="form-control" id="mc-ind-'+idx+'" style="flex:2;height:30px;font-size:11px">'
    +'<option value="">Selecione o indicador...</option>'
    +opcoesInd
    +'</select>'
    +'<input class="form-control" type="number" id="mc-val-'+idx+'" step="0.01" placeholder="Valor" style="width:90px;height:30px;font-size:12px" min="0">'
    +'<input class="form-control" type="text" id="mc-obs-'+idx+'" placeholder="Observação (opcional)" style="flex:1;height:30px;font-size:11px">'
    +'<button style="border:none;background:none;cursor:pointer;color:var(--cinza-400);font-size:16px;padding:0 4px;flex-shrink:0" onclick="this.parentElement.remove()" title="Remover">✕</button>';
  lista.appendChild(div);
}

function coletarContribsMatriz(){
  var lista=document.getElementById('matriz-contribs-lista');
  if(!lista)return[];
  var contribs=[];
  var rows=lista.children;
  for(var i=0;i<rows.length;i++){
    var sel=rows[i].querySelector('select');
    var valEl=rows[i].querySelector('input[type="number"]');
    var obsEl=rows[i].querySelector('input[type="text"]');
    if(!sel||!sel.value||!valEl||!valEl.value)continue;
    var ind=matrizItensCache&&matrizItensCache.find(function(x){return x.id===sel.value;});
    contribs.push({
      matriz_item_id:sel.value,
      valor:parseFloat(valEl.value)||0,
      unidade:ind&&ind.unidade||'',
      observacao:obsEl&&obsEl.value&&obsEl.value.trim()||null
    });
  }
  return contribs;
}

async function registrarEntrega(numEntrega,pctRest,valorRest){
  var dtEnt=document.getElementById('f-dt-ent')&&document.getElementById('f-dt-ent').value;
  var obs=document.getElementById('f-obs-ent')&&document.getElementById('f-obs-ent').value&&document.getElementById('f-obs-ent').value.trim()||'';
  if(!dtEnt){toast('Informe a data de entrega.','error');return;}
  if(!docsEntrega.length){toast('Adicione pelo menos um documento.','error');return;}
  // Contribuição obrigatória quando há planilha de geolocalização
  var temGeo=docsEntrega.some(function(d){return d.isGeo;});
  if(temGeo&&!coletarContribsMatriz().length){
    toast('Esta entrega contém geolocalização — vincule ao menos um indicador da Matriz de Resultados.','error');
    var aviso=document.getElementById('aviso-geo');
    if(aviso){aviso.style.animation='none';aviso.offsetHeight;aviso.style.animation='pulse-warn .4s 2';}
    document.getElementById('matriz-contribs-lista').scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }

  var fotosUrls=[],fotosNomes=[];
  if(fotosNovas.length){
    toast('Enviando '+fotosNovas.length+' foto(s)...','info');
    var fotosErros=0;
    for(var i=0;i<fotosNovas.length;i++){
      var foto=fotosNovas[i];var ext=foto.name.split('.').pop().toLowerCase();
      var path='produtos/'+produtoAtual.id+'/foto-ent'+numEntrega+'-'+(i+1)+'-'+Date.now()+'.'+ext;
      var fUp=await db.storage.from('tdrs-arquivos').upload(path,foto,{upsert:true,contentType:foto.type});
      if(fUp.error){
        console.error('Erro upload foto '+(i+1)+':',fUp.error);
        fotosErros++;
      } else {
        var fUrl=db.storage.from('tdrs-arquivos').getPublicUrl(path);
        fotosUrls.push(fUrl.data.publicUrl);
        fotosNomes.push(foto.name);
      }
    }
    if(fotosErros>0) toast(fotosErros+' foto(s) não puderam ser enviadas. Verifique as permissões do storage.','error');
  }

  var seiSub=(document.getElementById('f-sei-sub')&&document.getElementById('f-sei-sub').value.trim())||null;
  var insR=await db.from('contratos_produtos_entregas').insert({
    produto_id:produtoAtual.id,contrato_id:produtoAtual.contrato_id,
    numero_entrega:numEntrega,pct_entregue:pctRest,valor_entregue:valorRest,
    dt_entrega:dtEnt,dt_vencimento_orig:produtoAtual.dt_vencimento,
    situacao:'em_analise',tipo_documento:docsEntrega[0]&&docsEntrega[0].tipo||'Relatório Técnico',
    fotos_urls:fotosUrls,fotos_nomes:fotosNomes,fotos_total:fotosUrls.length,
    numero_sei_subprocesso:seiSub,
    criado_por:appState.usuario.id
  }).select().single();
  if(insR.error){toast('Erro: '+insR.error.message,'error');return;}
  var entrega=insR.data;

  toast('Enviando '+docsEntrega.length+' documento(s)...','info');
  for(var j=0;j<docsEntrega.length;j++){
    var doc=docsEntrega[j];
    if(doc.isGeo||!doc.file)continue; // geo docs não têm arquivo para upload
    var dpath='produtos/'+produtoAtual.id+'/entrega-'+numEntrega+'-'+Date.now()+'_'+doc.file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    var dUp=await db.storage.from('tdrs-arquivos').upload(dpath,doc.file,{upsert:true});
    if(!dUp.error){
      var dUrl=db.storage.from('tdrs-arquivos').getPublicUrl(dpath);
      await db.from('entrega_documentos').insert({entrega_id:entrega.id,tipo_documento:doc.tipo,arquivo_url:dUrl.data.publicUrl,arquivo_nome:doc.nome,arquivo_tamanho:doc.size,inserido_por:appState.usuario.id});
    }
  }

  await db.from('contratos_produtos').update({dt_entrega:dtEnt,situacao:'em_analise',observacoes:obs||produtoAtual.observacoes,atualizado_em:new Date().toISOString()}).eq('id',produtoAtual.id);

  // Salvar contribuições à Matriz de Resultados (status pendente = aguarda confirmação técnica)
  var contribs=coletarContribsMatriz();
  if(contribs.length){
    var contribRows=contribs.map(function(c){
      return {produto_id:entrega.id,matriz_item_id:c.matriz_item_id,valor:c.valor,unidade:c.unidade,observacao:c.observacao,status:'pendente',criado_por:appState.usuario.id};
    });
    var cR=await db.from('produto_matriz_contribuicao').insert(contribRows);
    if(!cR.error){toast(contribs.length+' contribuição(ões) à Matriz de Resultados registrada(s) — aguarda confirmação técnica.','info');}
  }

  // Salvar pontos de geolocalização
  var geoDocs=docsEntrega.filter(function(d){return d.isGeo&&d.pontos&&d.pontos.length;});
  if(geoDocs.length){
    // Determinar tipo_atividade a partir do indicador selecionado em "Vincular indicador"
    // Prioridade: 1º indicador vinculado → produto_titulo do item da matriz
    // Fallback: produto_titulo do produto atual
    var tipoAtividade=null;
    var contribsSel=coletarContribsMatriz();
    if(contribsSel.length&&matrizItensCache){
      var itemSel=matrizItensCache.find(function(x){return x.id===contribsSel[0].matriz_item_id;});
      if(itemSel) tipoAtividade=itemSel.produto_titulo||null;
    }
    if(!tipoAtividade) tipoAtividade=produtoAtual.produto_titulo||null;

    var todospontos=[];
    geoDocs.forEach(function(d){
      d.pontos.forEach(function(p){
        todospontos.push({
          nome_local:p.nome_local||'Ponto sem nome',
          apa:['Igarapé São Francisco','Lago do Amapá','Outra'].includes(p.apa)?p.apa:'Outra',
          tipo_atividade:tipoAtividade,
          responsavel:p.responsavel||null,
          data_implantacao:p.data_implantacao||null,
          lat:parseFloat(p.lat),lng:parseFloat(p.lng),
          observacao:p.observacao||null,
          status:'ativo',
          produto_id:entrega.id,
          criado_por:appState.usuario.id,
          geometry_type:p.geometry_type||'ponto',
          geometry_group:p.geometry_group||null,
          geometry_order:p.geometry_order||0
        });
      });
    });
    var validos=todospontos.filter(function(p){return !isNaN(p.lat)&&!isNaN(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;})
      .map(function(p){return Object.assign({},p,{entrega_id:entrega.id});});
    if(validos.length){
      var gR=await db.from('produto_pontos_mapa').insert(validos);
      if(!gR.error){toast(validos.length+' ponto(s) de geolocalização salvos no mapa.','info');}
      else{toast('Erro ao salvar geolocalização: '+gR.error.message,'error');}
    }
  }

  var qtd=docsEntrega.length;docsEntrega=[];geoCSVPontos=[];
  toast('Entrega com '+qtd+' documento(s) registrada e enviada para avaliação!','success');
  fecharModal();await selecionarCont(filtCont);await renderStats();
}

async function emitirDespacho(tipoBtn){
  if(tipoBtn)selecionarDecisao(tipoBtn);
  var tipo=tipoBtn||decisaoSel;
  if(!tipo){toast('Selecione uma decisão.','error');return;}
  var despacho=document.getElementById('f-despacho')&&document.getElementById('f-despacho').value&&document.getElementById('f-despacho').value.trim()||'';
  var dtDesp=document.getElementById('f-dt-desp')&&document.getElementById('f-dt-desp').value||'';
  if(!despacho||despacho.length<20){
    var td=document.getElementById('f-despacho');
    if(td){td.style.borderColor='#DC2626';td.focus();setTimeout(function(){if(td)td.style.borderColor='';},2500);}
    toast('O texto do despacho deve ter pelo menos 20 caracteres.','error');return;
  }

  var pctAprov=100,valorAprov=parseFloat(produtoAtual.valor_brl||0)*(100-parseFloat(produtoAtual.pct_aprovado||0))/100;
  if(tipo==='aprovacao_parcial'){
    pctAprov=parseFloat(document.getElementById('f-pct')&&document.getElementById('f-pct').value||0);
    valorAprov=parseFloat(produtoAtual.valor_brl||0)*pctAprov/100;
    if(!pctAprov||pctAprov<=0){toast('Informe o percentual aprovado.','error');return;}
  }

  // Gerar número de despacho
  var anoAtual=new Date().getFullYear();
  var dSeqR=await db.from('despachos_seq').select('*').eq('ano',anoAtual).single();
  var dSeq=1;
  if(dSeqR.data){dSeq=parseInt(dSeqR.data.ultimo||0)+1;await db.from('despachos_seq').update({ultimo:dSeq}).eq('ano',anoAtual);}
  else{await db.from('despachos_seq').insert({ano:anoAtual,ultimo:1});}
  var numDesp='DESP-'+anoAtual+'-'+String(dSeq).padStart(3,'0');
  var novaSit=tipo==='devolucao'?'devolvida':tipo==='aprovacao_parcial'?'aprovada':'aprovada';

  // Upload nota técnica
  var ntUrl=entregaAtual.nota_tecnica_url||null,ntNome=entregaAtual.nota_tecnica_nome||null;
  if(notaTecnicaFile){
    toast('Enviando nota técnica...','info');
    var ntpath='produtos/'+produtoAtual.id+'/nota-tecnica-'+Date.now()+'_'+notaTecnicaFile.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    var ntUp=await db.storage.from('tdrs-arquivos').upload(ntpath,notaTecnicaFile,{upsert:true});
    if(!ntUp.error){var ntD=db.storage.from('tdrs-arquivos').getPublicUrl(ntpath);ntUrl=ntD.data.publicUrl;ntNome=notaTecnicaFile.name;}
  }

  var updR=await db.from('contratos_produtos_entregas').update({
    situacao:novaSit,tipo_decisao:tipo,despacho_numero:numDesp,despacho_texto:despacho,
    despacho_data:dtDesp||new Date().toISOString().split('T')[0],
    despachado_por:appState.usuario.id,despachado_em:new Date().toISOString(),
    ...(tipo!=='devolucao'?{pct_entregue:pctAprov,valor_entregue:valorAprov}:{}),
    nota_tecnica_url:ntUrl,nota_tecnica_nome:ntNome,
    atualizado_em:new Date().toISOString()
  }).eq('id',entregaAtual.id);
  if(updR.error){toast('Erro: '+updR.error.message,'error');return;}
  notaTecnicaFile=null;

  if(tipo==='devolucao'){
    // Cancelar contribuições à matriz e remover pontos do mapa desta entrega
    await Promise.all([
      db.from('produto_matriz_contribuicao').update({status:'cancelado'}).eq('produto_id',entregaAtual.id),
      db.from('produto_pontos_mapa').delete().eq('entrega_id',entregaAtual.id)
    ]);
  }

  if(tipo!=='devolucao'){
    var novoPct=Math.min(100,parseFloat(produtoAtual.pct_aprovado||0)+pctAprov);
    var novoVal=parseFloat(produtoAtual.valor_brl||0)*novoPct/100;
    var novaSitProd=novoPct>=100?'pago':'entrega_parcial';
    await db.from('contratos_produtos').update({pct_aprovado:novoPct,valor_aprovado:novoVal,situacao:novaSitProd,atualizado_em:new Date().toISOString()}).eq('id',produtoAtual.id);
  } else {
    await db.from('contratos_produtos').update({situacao:'devolvido',atualizado_em:new Date().toISOString()}).eq('id',produtoAtual.id);
  }

  var msgs={aprovacao_total:'&#x2714; Despacho '+numDesp+' emitido. Lançamento gerado no Financeiro.',aprovacao_parcial:'&#x25D1; Despacho '+numDesp+' emitido. Lançamento parcial gerado.',devolucao:'&#x21A9; Despacho '+numDesp+' emitido. Produto devolvido para correção.'};
  toast(msgs[tipo]||'Despacho emitido.','success',7000);

  if(notifPendenteId){
    await db.from('notificacoes').update({lida:true,lida_em:new Date().toISOString()}).eq('id',notifPendenteId);
    notifPendenteId=null;
    if(typeof carregarNotificacoes==='function')await carregarNotificacoes();
  }
  if(entregaAtual&&entregaAtual.id){
    await db.from('notificacoes').update({lida:true,lida_em:new Date().toISOString()}).eq('entidade_id',entregaAtual.id).eq('usuario_id',appState.usuario.id).eq('lida',false);
    if(typeof carregarNotificacoes==='function')await carregarNotificacoes();
  }
  window.history.replaceState({},'',window.location.pathname);
  fecharModal();await selecionarCont(filtCont);await renderStats();
}

function switchEvalTab(name){
  document.querySelectorAll('.eval-tab-btn').forEach(function(b){b.classList.remove('ativo');});
  document.querySelectorAll('.eval-tab-content').forEach(function(c){c.classList.remove('ativo');});
  var btn=document.getElementById('eval-btn-'+name);
  var cont=document.getElementById('eval-tab-'+name);
  if(btn)btn.classList.add('ativo');
  if(cont)cont.classList.add('ativo');
}

function toggleAvalCheckbox(){
  var checked=document.getElementById('chk-confirmacao')?.checked;
  document.querySelectorAll('.btn-aprovar,.btn-parcial').forEach(function(btn){
    btn.disabled=!checked;
    btn.style.opacity=checked?'':'0.4';
    btn.style.cursor=checked?'':'not-allowed';
  });
}

function fecharModal(){
  document.getElementById('modal-prod').classList.remove('aberto');
  produtoAtual=null;entregaAtual=null;entregaArquivo=null;decisaoSel='';
  docsEntrega=[];notaTecnicaFile=null;fotosNovas=[];geoCSVPontos=[];
}
document.addEventListener('keydown',function(e){if(e.key==='Escape'){fecharModal();fecharModalGeoCsv();}});

// ── Planilha de Geolocalização ─────────────────────────────────────────────

function onBtnAdicionarDoc(){
  var tipo=document.getElementById('sel-tipo-doc')&&document.getElementById('sel-tipo-doc').value||'';
  if(tipo===TIPO_GEO){
    abrirModalGeoCsv();
  } else {
    document.getElementById('inp-arq').click();
  }
}

var _geoCsvLinhas=[];

function abrirModalGeoCsv(){
  _geoCsvLinhas=[];
  renderModalGeoCsvEtapa1();
  document.getElementById('modal-geo-csv').style.display='flex';
}

function fecharModalGeoCsv(){
  var m=document.getElementById('modal-geo-csv');
  if(m)m.style.display='none';
  _geoCsvLinhas=[];
}

function renderModalGeoCsvEtapa1(){
  var body=document.getElementById('geo-csv-body');
  var footer=document.getElementById('geo-csv-footer');
  if(!body||!footer)return;

  body.innerHTML=''
    +'<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:var(--raio);padding:12px 14px;margin-bottom:14px">'
    +'<div style="font-size:12px;font-weight:600;color:#1E40AF;margin-bottom:4px">&#x1F4CB; Como usar</div>'
    +'<ol style="margin:0;padding-left:18px;font-size:12px;color:#1E40AF;line-height:1.7">'
    +'<li>Baixe o template e preencha <strong>apenas as abas que se aplicam</strong> ao produto (<strong>Pontos</strong>, <strong>Polígono</strong> ou <strong>Trilha</strong>).</li>'
    +'<li><strong>Apague as linhas de exemplo</strong> das abas que não for usar — caso contrário elas serão importadas como dados reais.</li>'
    +'<li>As colunas <strong>lat</strong> e <strong>lng</strong> aceitam vírgula ou ponto decimal (<code>-9,972</code> ou <code>-9.972</code>). Também é possível <strong>colar a coordenada completa do Google Maps</strong> (<code>-10.042, -67.852</code>) direto na coluna <strong>lat</strong>, deixando <strong>lng</strong> vazia.</li>'
    +'<li><strong>Importe o próprio arquivo .xlsx</strong> — não é necessário converter para CSV.</li>'
    +'</ol>'
    +'</div>'
    +'<div style="display:flex;align-items:flex-start;gap:8px;background:#FFFBEB;border:1px solid #FCD34D;border-radius:var(--raio);padding:10px 12px;margin-bottom:10px">'
    +'<span style="font-size:15px;flex-shrink:0">&#x26A0;&#xFE0F;</span>'
    +'<span style="font-size:11px;color:#92400E;line-height:1.5">Cada produto deve ter sua própria planilha. Se o produto entregue for apenas pontos, use só a aba <strong>Pontos</strong> e apague os exemplos das demais. O sistema ignora automaticamente linhas cujo nome começa com <strong>"Ex:"</strong>.</span>'
    +'</div>'
    +'<button class="btn btn-secondary btn-sm" style="margin-bottom:14px" onclick="baixarTemplateGeoExcel()">&#x1F4E5; Baixar template Excel (.xlsx)</button>'
    +'<div id="geo-drop-area" style="border:2px dashed var(--borda-forte);border-radius:var(--raio);padding:32px;text-align:center;cursor:pointer;transition:all .15s;background:var(--cinza-50)"'
    +' onclick="document.getElementById(\'geo-xlsx-input\').click()"'
    +' ondragover="event.preventDefault();this.style.borderColor=\'var(--verde-medio)\';this.style.background=\'var(--verde-bg)\'"'
    +' ondragleave="this.style.borderColor=\'\';this.style.background=\'var(--cinza-50)\'"'
    +' ondrop="event.preventDefault();this.style.borderColor=\'\';this.style.background=\'var(--cinza-50)\';onGeoDropXlsx(event.dataTransfer.files[0])">'
    +'<div style="font-size:32px;margin-bottom:8px">&#x1F4C2;</div>'
    +'<div style="font-size:13px;font-weight:500;color:var(--cinza-700)">Arraste o arquivo .xlsx ou clique para selecionar</div>'
    +'<div style="font-size:11px;color:var(--cinza-400);margin-top:4px">Apenas .xlsx (Excel)</div>'
    +'</div>'
    +'<input type="file" id="geo-xlsx-input" accept=".xlsx" style="display:none" onchange="onGeoDropXlsx(this.files[0]);this.value=\'\'">';

  footer.innerHTML=''
    +'<button class="btn btn-secondary" onclick="fecharModalGeoCsv()">Cancelar</button>';
}

function onGeoDropXlsx(file){
  if(!file)return;
  if(!file.name.toLowerCase().endsWith('.xlsx')){alert('Por favor selecione um arquivo .xlsx (Excel).');return;}
  if(typeof XLSX==='undefined'){alert('Biblioteca Excel ainda carregando, tente em instantes.');return;}
  var reader=new FileReader();
  reader.onload=function(e){
    var wb=XLSX.read(e.target.result,{type:'binary'});
    var validas=[],invalidas=[];
    var coordOk=function(lat,lng){return !isNaN(lat)&&!isNaN(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;};
    // Extrai lat e lng suportando 3 formatos:
    //   1) colunas separadas com ponto:   lat=-10.042  lng=-67.852
    //   2) colunas separadas com vírgula BR: lat=-10,042  lng=-67,852
    //   3) par colado do Google Maps na célula lat: "-10.042663, -67.852065" (lng vazia)
    var extrairCoords=function(latRaw,lngRaw){
      var latStr=String(latRaw||'').trim();
      var lngStr=String(lngRaw||'').trim();
      // Detectar par "lat, lng" na célula lat (Google Maps / cópia direta)
      if(latStr.indexOf(',')!==-1&&lngStr===''){
        var partes=latStr.split(',');
        if(partes.length>=2){
          var a=parseFloat(partes[0].trim());
          var b=parseFloat(partes[1].trim());
          if(!isNaN(a)&&!isNaN(b)&&Math.abs(a)<=90&&Math.abs(b)<=180)return{lat:a,lng:b};
        }
      }
      // Formato normal (vírgula como decimal BR ou ponto)
      return{lat:parseFloat(latStr.replace(',','.')),lng:parseFloat(lngStr.replace(',','.'))};
    };
    if(!wb.SheetNames.length){alert('Arquivo vazio ou inválido.');return;}
    wb.SheetNames.forEach(function(sheetNome){
      var ws=wb.Sheets[sheetNome];
      var rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
      var nl=sheetNome.toLowerCase();
      rows.forEach(function(r,idx){
        var obj={};
        Object.keys(r).forEach(function(k){obj[k.trim().toLowerCase()]=String(r[k]||'').trim();});
        var coords=extrairCoords(obj.lat,obj.lng);
        var lat=coords.lat,lng=coords.lng;
        // Ignorar linhas de exemplo do template (nome começa com "Ex:")
        var nomeChave=nl.includes('pol')?obj.nome_area:nl.includes('trilh')?obj.nome_trilha:obj.nome_local;
        if(nomeChave&&/^ex:/i.test(nomeChave.trim()))return;
        if(nl.includes('pol')){
          // Aba Polígono — coluna chave: nome_area
          if(!obj.nome_area||!coordOk(lat,lng)){invalidas.push({linha:idx+2,sheet:sheetNome,dado:obj});return;}
          validas.push({nome_local:obj.nome_area,apa:obj.apa||'Outra',responsavel:obj.responsavel||null,
            data_implantacao:obj.data_implantacao||null,lat:lat,lng:lng,observacao:obj.observacao||null,
            geometry_type:'poligono',geometry_group:obj.nome_area,geometry_order:parseInt(obj.ordem||'0')||0});
        } else if(nl.includes('trilh')){
          // Aba Trilha — coluna chave: nome_trilha
          if(!obj.nome_trilha||!coordOk(lat,lng)){invalidas.push({linha:idx+2,sheet:sheetNome,dado:obj});return;}
          validas.push({nome_local:obj.nome_trilha,apa:obj.apa||'Outra',responsavel:obj.responsavel||null,
            data_implantacao:obj.data_implantacao||null,lat:lat,lng:lng,observacao:obj.observacao||null,
            geometry_type:'trilha',geometry_group:obj.nome_trilha,geometry_order:parseInt(obj.ordem||'0')||0});
        } else {
          // Aba Pontos (default) — coluna chave: nome_local
          if(!obj.nome_local||!coordOk(lat,lng)){invalidas.push({linha:idx+2,sheet:sheetNome,dado:obj});return;}
          validas.push({nome_local:obj.nome_local,apa:obj.apa||'Outra',responsavel:obj.responsavel||null,
            data_implantacao:obj.data_implantacao||null,lat:lat,lng:lng,observacao:obj.observacao||null,
            geometry_type:'ponto'});
        }
      });
    });
    _geoCsvLinhas=validas;
    renderModalGeoCsvEtapa2(validas,invalidas);
  };
  reader.readAsBinaryString(file);
}

function renderModalGeoCsvEtapa2(validas,invalidas){
  var body=document.getElementById('geo-csv-body');
  var footer=document.getElementById('geo-csv-footer');
  if(!body)return;

  var nPontos=validas.filter(function(r){return (r.geometry_type||'ponto')==='ponto';}).length;
  var gruposPol=[...new Set(validas.filter(function(r){return r.geometry_type==='poligono';}).map(function(r){return r.geometry_group;}))].length;
  var gruposTrilha=[...new Set(validas.filter(function(r){return r.geometry_type==='trilha';}).map(function(r){return r.geometry_group;}))].length;

  var statsHtml='<div style="display:flex;gap:10px;margin-bottom:12px">'
    +'<div style="flex:1;background:#F0FDF4;border:1px solid #86EFAC;border-radius:var(--raio);padding:10px 12px;text-align:center">'
    +'<div style="font-size:20px;font-weight:700;color:#166534">'+nPontos+'</div>'
    +'<div style="font-size:11px;color:#15803D">pontos</div></div>'
    +'<div style="flex:1;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:var(--raio);padding:10px 12px;text-align:center">'
    +'<div style="font-size:20px;font-weight:700;color:#1D4ED8">'+gruposPol+'</div>'
    +'<div style="font-size:11px;color:#1E40AF">polígonos</div></div>'
    +'<div style="flex:1;background:#FFF7ED;border:1px solid #FED7AA;border-radius:var(--raio);padding:10px 12px;text-align:center">'
    +'<div style="font-size:20px;font-weight:700;color:#C2410C">'+gruposTrilha+'</div>'
    +'<div style="font-size:11px;color:#EA580C">trilhas</div></div>'
    +(invalidas.length?'<div style="flex:1;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:var(--raio);padding:10px 12px;text-align:center">'
    +'<div style="font-size:20px;font-weight:700;color:#DC2626">'+invalidas.length+'</div>'
    +'<div style="font-size:11px;color:#B91C1C">erros</div></div>':'')
    +'</div>';

  var tabelaHtml='<div style="overflow-x:auto;max-height:280px;overflow-y:auto;border:1px solid var(--borda);border-radius:var(--raio)">'
    +'<table style="border-collapse:collapse;width:100%;font-size:11px">'
    +'<thead><tr style="background:var(--cinza-100);position:sticky;top:0">'
    +'<th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--borda)">Tipo</th>'
    +'<th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--borda)">Nome</th>'
    +'<th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--borda)">APA</th>'
    +'<th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--borda)">Lat</th>'
    +'<th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--borda)">Lng</th>'
    +'</tr></thead><tbody>'
    +validas.slice(0,100).map(function(r,i){
      var gt=r.geometry_type||'ponto';
      var tipoLabel=gt==='poligono'?'Polígono':gt==='trilha'?'Trilha':'Ponto';
      var bg=gt==='poligono'?'background:#EFF6FF;color:#1E40AF':gt==='trilha'?'background:#FFF7ED;color:#92400E':'background:#F0FDF4;color:#166534';
      return '<tr style="border-bottom:1px solid var(--cinza-100)'+(i%2?';background:var(--cinza-50)':'')+'\">'
        +'<td style="padding:4px 8px"><span style="font-size:10px;padding:1px 6px;border-radius:99px;'+bg+'">'+tipoLabel+'</span></td>'
        +'<td style="padding:4px 8px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.nome_local||'')+'</td>'
        +'<td style="padding:4px 8px;white-space:nowrap">'+esc(r.apa||'')+'</td>'
        +'<td style="padding:4px 8px;font-family:monospace;white-space:nowrap">'+r.lat+'</td>'
        +'<td style="padding:4px 8px;font-family:monospace;white-space:nowrap">'+r.lng+'</td>'
        +'</tr>';
    }).join('')
    +(validas.length>100?'<tr><td colspan="5" style="padding:6px 8px;text-align:center;color:var(--cinza-400);font-style:italic">…e mais '+(validas.length-100)+' linhas</td></tr>':'')
    +'</tbody></table></div>';

  body.innerHTML=statsHtml
    +(invalidas.length?'<div style="font-size:11px;color:#B91C1C;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:var(--raio);padding:8px 10px;margin-bottom:12px">&#x26A0; Linhas ignoradas: '+invalidas.map(function(x){return (x.sheet?x.sheet+' l.':'l.')+x.linha;}).join(', ')+'</div>':'')
    +tabelaHtml
    +'<p style="font-size:11px;color:var(--cinza-500);margin:8px 0 0">As geometrias serão salvas no mapa após o envio da entrega. Você poderá visualizá-las em <strong>Mapa de Entregas</strong>.</p>';

  var partes=[nPontos?nPontos+' ponto(s)':'',gruposPol?gruposPol+' polígono(s)':'',gruposTrilha?gruposTrilha+' trilha(s)':''].filter(Boolean).join(' + ');
  footer.innerHTML=''
    +'<button class="btn btn-secondary" onclick="renderModalGeoCsvEtapa1()">&#x2190; Voltar</button>'
    +(validas.length
      ? '<button class="btn btn-primary" onclick="confirmarGeoCsv()">&#x2714; Confirmar '+partes+'</button>'
      : '<span style="font-size:12px;color:var(--cinza-500)">Nenhum dado válido para importar.</span>'
    );
}

function confirmarGeoCsv(){
  if(!_geoCsvLinhas.length)return;
  var nPontos=_geoCsvLinhas.filter(function(r){return (r.geometry_type||'ponto')==='ponto';}).length;
  var nPol=[...new Set(_geoCsvLinhas.filter(function(r){return r.geometry_type==='poligono';}).map(function(r){return r.geometry_group;}))].length;
  var nTrilha=[...new Set(_geoCsvLinhas.filter(function(r){return r.geometry_type==='trilha';}).map(function(r){return r.geometry_group;}))].length;
  var partes=[nPontos?nPontos+' ponto(s)':'',nPol?nPol+' polígono(s)':'',nTrilha?nTrilha+' trilha(s)':''].filter(Boolean).join(' + ');
  docsEntrega.push({
    isGeo:true,
    tipo:TIPO_GEO,
    nome:'Geolocalização: '+partes,
    size:0,
    file:null,
    pontos:_geoCsvLinhas.slice()
  });
  renderListaDocs();
  fecharModalGeoCsv();
  toast(partes+' de geolocalização adicionados à entrega.','success');
}

function baixarTemplateGeoExcel(){
  if(typeof XLSX==='undefined'){alert('Biblioteca Excel ainda carregando, tente novamente em instantes.');return;}

  // Formata colunas lat/lng como Texto (@) para evitar que o Excel brasileiro
  // interprete o ponto decimal como separador de milhar (ex: -67.83 → -6783)
  function fmtLatLng(ws,colLat,colLng,maxRow){
    for(var r=1;r<=maxRow;r++){
      [colLat,colLng].forEach(function(c){
        var ref=XLSX.utils.encode_cell({r:r,c:c});
        if(!ws[ref]){ws[ref]={t:'s',v:'',z:'@'};}
        else{ws[ref].z='@';if(ws[ref].t!=='s'){ws[ref].t='s';ws[ref].v=String(ws[ref].v||'');delete ws[ref].w;}}
      });
    }
    var range=XLSX.utils.decode_range(ws['!ref']);
    range.e.r=Math.max(range.e.r,maxRow);
    ws['!ref']=XLSX.utils.encode_range(range);
  }

  var wb=XLSX.utils.book_new();

  // Aba 1 — Pontos (lat=col5, lng=col6)
  var wsPontos=XLSX.utils.aoa_to_sheet([
    ['nome_local','apa','tipo_atividade','responsavel','data_implantacao','lat','lng','observacao'],
    ['Ex: Unidade Produtiva 01','Igarapé São Francisco','Desenvolvimento de Produtos Sustentáveis','João Silva','2025-04-10','-9.972000','-67.805000','Próximo ao igarapé']
  ]);
  wsPontos['!cols']=[{wch:35},{wch:28},{wch:38},{wch:18},{wch:20},{wch:14},{wch:14},{wch:30}];
  fmtLatLng(wsPontos,5,6,100);
  XLSX.utils.book_append_sheet(wb,wsPontos,'Pontos');

  // Aba 2 — Polígono (lat=col6, lng=col7)
  var wsPolig=XLSX.utils.aoa_to_sheet([
    ['nome_area','apa','tipo_atividade','responsavel','data_implantacao','ordem','lat','lng','observacao'],
    ['Ex: Área de Reflorestamento A','Lago do Amapá','Mitigação da Vulnerabilidade das APAs','Maria Silva','2025-04-10','1','-9.950000','-67.820000','Vértice 1'],
    ['Ex: Área de Reflorestamento A','Lago do Amapá','Mitigação da Vulnerabilidade das APAs','Maria Silva','2025-04-10','2','-9.952000','-67.818000','Vértice 2'],
    ['Ex: Área de Reflorestamento A','Lago do Amapá','Mitigação da Vulnerabilidade das APAs','Maria Silva','2025-04-10','3','-9.951000','-67.815000','Vértice 3']
  ]);
  wsPolig['!cols']=[{wch:35},{wch:28},{wch:38},{wch:18},{wch:20},{wch:8},{wch:14},{wch:14},{wch:30}];
  fmtLatLng(wsPolig,6,7,100);
  XLSX.utils.book_append_sheet(wb,wsPolig,'Polígono');

  // Aba 3 — Trilha (lat=col6, lng=col7)
  var wsTrilha=XLSX.utils.aoa_to_sheet([
    ['nome_trilha','apa','tipo_atividade','responsavel','data_implantacao','ordem','lat','lng','observacao'],
    ['Ex: Trilha Ecológica Norte','Igarapé São Francisco','Monitoramento e Adaptação','Carlos Souza','2025-04-10','1','-9.960000','-67.810000','Início da trilha'],
    ['Ex: Trilha Ecológica Norte','Igarapé São Francisco','Monitoramento e Adaptação','Carlos Souza','2025-04-10','2','-9.962000','-67.812000','Ponto intermediário'],
    ['Ex: Trilha Ecológica Norte','Igarapé São Francisco','Monitoramento e Adaptação','Carlos Souza','2025-04-10','3','-9.965000','-67.814000','Final da trilha']
  ]);
  wsTrilha['!cols']=[{wch:35},{wch:28},{wch:38},{wch:18},{wch:20},{wch:8},{wch:14},{wch:14},{wch:30}];
  fmtLatLng(wsTrilha,6,7,100);
  XLSX.utils.book_append_sheet(wb,wsTrilha,'Trilha');

  XLSX.writeFile(wb,'template_geo_mapa.xlsx');
  toast('Template baixado! Preencha as abas desejadas e importe o .xlsx.','info');
}
