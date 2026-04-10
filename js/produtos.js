// produtos.js — Avaliação de Produtos DIMA
// Sem template literals — concatenação pura para evitar corte pelo parser HTML

let atividades=[],contratos=[],todosProdutos=[];
let produtoAtual=null,entregaAtual=null,entregaArquivo=null;
let filtAtiv='',filtCont='',decisaoSel='';
let fotosNovas=[];
let docsEntrega=[];
let notaTecnicaFile=null;
let notifPendenteId=null;

function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmtDT(d){return d?new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';}

const TIPOS_DOC=['Relatório Técnico','Nota Fiscal','Comprovante de Pagamento','Contrato / Aditivo','Declaração / Atestado','Relatório Parcial','Outro'];

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
    +'<select class="form-control" id="sel-cont" style="max-width:300px" onchange="selecionarCont(this.value)" disabled>'
    +'<option value="">Selecione o contrato...</option>'
    +'</select>'
    +'</div>'
    +'<div id="conteudo"></div>'
    +'</div>'
    +'</div></div></div>'
    +'<div class="modal-overlay" id="modal-prod">'
    +'<div class="modal" style="max-width:680px">'
    +'<div class="modal-header"><div class="modal-title" id="mp-titulo">Produto</div>'
    +'<button class="modal-close" onclick="fecharModal()">&#x2715;</button></div>'
    +'<div class="modal-body" id="mp-body" style="max-height:72vh;overflow-y:auto"></div>'
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
  var pend=t.filter(function(p){return p.situacao==='pendente';}).length;
  var anal=t.filter(function(p){return p.situacao==='em_analise';}).length;
  var aprov=t.filter(function(p){return p.situacao==='aprovado';}).length;
  var pago=t.filter(function(p){return p.situacao==='pago';}).length;
  document.getElementById('stats').innerHTML=
    '<div class="stat-card sc-b"><div class="stat-lbl">Total</div><div class="stat-val">'+t.length+'</div><div class="stat-sub">todos os contratos</div></div>'
    +'<div class="stat-card sc-a"><div class="stat-lbl">Pendentes</div><div class="stat-val" style="color:var(--aviso)">'+pend+'</div><div class="stat-sub">aguardando entrega</div></div>'
    +'<div class="stat-card" style="border-color:#BFDBFE"><div style="position:absolute;top:0;left:0;right:0;height:3px;background:#2563EB"></div><div class="stat-lbl" style="color:#1E40AF">Em avaliação</div><div class="stat-val" style="color:#1E40AF">'+anal+'</div><div class="stat-sub">aguardando parecer</div></div>'
    +'<div class="stat-card" style="border-color:#86EFAC"><div style="position:absolute;top:0;left:0;right:0;height:3px;background:#059669"></div><div class="stat-lbl" style="color:#166534">Aprovados</div><div class="stat-val" style="color:#166534">'+aprov+'</div><div class="stat-sub">aguardando pagamento</div></div>'
    +'<div class="stat-card sc-g"><div class="stat-lbl">Pagos</div><div class="stat-val" style="color:var(--sucesso)">'+pago+'</div><div class="stat-sub">100% concluídos</div></div>';
}

function selecionarAtiv(id){
  filtAtiv=id;filtCont='';todosProdutos=[];
  var sel=document.getElementById('sel-cont');
  sel.innerHTML='<option value="">Selecione o contrato...</option>';
  if(!id){sel.disabled=true;renderVazio('Selecione uma atividade para começar.');return;}
  var lista=contratos.filter(function(c){return c.atividade_id===id;});
  lista.forEach(function(c){
    var o=document.createElement('option');
    o.value=c.id;
    o.textContent=c.numero+(c.fornecedores&&c.fornecedores.nome?' · '+c.fornecedores.nome:'');
    sel.appendChild(o);
  });
  sel.disabled=lista.length===0;
  if(lista.length===0)renderVazio('Nenhum contrato nesta atividade.');
  else renderVazio('Selecione um contrato para ver os produtos.');
}

async function selecionarCont(id){
  filtCont=id;todosProdutos=[];
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

function sitLbl(s){return{pendente:'Pendente',em_analise:'Em avaliação',entrega_parcial:'Parcial',aprovado:'Aprovado',pago:'Pago',cancelado:'Cancelado'}[s]||s;}

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
  var acaoTxt={pendente:'&#x1F4E5; Registrar entrega &#x2192;',em_analise:'&#x1F50D; Avaliar &#x2192;',entrega_parcial:'&#x1F4E5; Nova entrega &#x2192;',aprovado:'&#x1F4B3; Aguardando pagamento'}[p.situacao]||'&#x2192;';
  var topBg=p.situacao==='em_analise'?'background:#EFF6FF;border-bottom-color:#BFDBFE':p.situacao==='entrega_parcial'?'background:#F5F3FF;border-bottom-color:#DDD6FE':p.situacao==='aprovado'?'background:#F0FDF4;border-bottom-color:#86EFAC':'';
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
  var pendentes=todosProdutos.filter(function(p){return p.situacao==='pendente';});
  var emAnalise=todosProdutos.filter(function(p){return p.situacao==='em_analise';});
  var parcial=todosProdutos.filter(function(p){return p.situacao==='entrega_parcial';});
  var aprovados=todosProdutos.filter(function(p){return p.situacao==='aprovado';});
  if(!todosProdutos.length){renderVazio('Nenhum produto encontrado para este contrato.');return;}
  var html='';
  if(emAnalise.length)html+='<div class="sec-lbl" style="color:#1E40AF">🔍 Em avaliação ('+emAnalise.length+')</div><div class="produtos-grid">'+emAnalise.map(renderCard).join('')+'</div>';
  if(parcial.length)html+='<div class="sec-lbl" style="color:#6D28D9">⚡ Entrega parcial ('+parcial.length+')</div><div class="produtos-grid">'+parcial.map(renderCard).join('')+'</div>';
  if(pendentes.length)html+='<div class="sec-lbl">📋 Pendentes ('+pendentes.length+')</div><div class="produtos-grid">'+pendentes.map(renderCard).join('')+'</div>';
  if(aprovados.length)html+='<div class="sec-lbl" style="color:#166534">✓ Aprovados / A pagar ('+aprovados.length+')</div><div class="produtos-grid">'+aprovados.map(renderCard).join('')+'</div>';
  document.getElementById('conteudo').innerHTML=html;
}

async function abrirModal(prodId){
  var r=await db.from('contratos_produtos')
    .select('*,contratos(id,numero,objeto_pt,atividade_id,fornecedores(id,nome),atividades(id,codigo,nome_pt)),contratos_produtos_entregas(*)')
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

  var isPend=p.situacao==='pendente'||p.situacao==='entrega_parcial';
  var isAnalise=p.situacao==='em_analise';

  var titulo=isPend?('Registrar Entrega — Produto '+p.numero_produto):('Avaliar Entrega — Produto '+p.numero_produto);
  document.getElementById('mp-titulo').textContent=titulo;

  var html='';

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
    html+='<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;color:var(--cinza-500);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Histórico de entregas</div>';
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
        +(e.despacho_numero?'<div style="font-size:10px;color:var(--cinza-500);margin-bottom:3px">&#x1F4CB; '+esc(e.despacho_numero)+(e.despacho_data?' · '+fmtData(e.despacho_data):'')+'</div>':'')
        +(e.despacho_texto?'<div style="font-size:11px;color:var(--cinza-700);line-height:1.5;background:var(--cinza-50);border-radius:4px;padding:6px 8px;margin-top:4px;border-left:3px solid '+(cSit[e.situacao]||'var(--borda)')+'">'+esc(e.despacho_texto.substring(0,200))+(e.despacho_texto.length>200?'…':'')+'</div>':'')
        +(e.arquivo_nome?'<div style="font-size:11px;color:var(--azul-medio);margin-top:5px;display:flex;align-items:center;gap:6px">&#x1F4CE; '+esc(e.arquivo_nome)
          +(e.arquivo_url?'<button class="btn-xs" onclick="event.stopPropagation();abrirArquivo(\''+e.arquivo_url+'\')" style="height:20px;padding:0 6px;font-size:10px">Abrir</button>':'')+'</div>':'')
        +((e.fotos_total||0)>0?'<div style="font-size:11px;color:var(--cinza-500);margin-top:4px">&#x1F4F7; '+e.fotos_total+' foto(s) de evidência</div>':'')
        +'</div></div>';
    });
    html+='</div>';
  }

  // FORMULÁRIO DE ENTREGA
  if(isPend){
    var complemento=p.situacao==='entrega_parcial'?'<span style="font-size:10px;font-weight:400;color:var(--cinza-500)">&nbsp;— complemento (restam '+pctRest.toFixed(0)+'% · '+fmtBRL(valorRest)+')</span>':'';
    html+='<div style="border-top:1px solid var(--borda);padding-top:14px">'
      +'<div style="font-size:11px;font-weight:700;color:var(--cinza-700);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">Registrar Entrega '+numProxEntrega+' '+complemento+'</div>'
      +'<div class="grid-2" style="margin-bottom:12px">'
      +'<div class="form-group"><label class="form-label">Data de entrega <span class="obrig">*</span></label>'
      +'<input class="form-control" type="date" id="f-dt-ent" value="'+new Date().toISOString().split('T')[0]+'"></div>'
      +'<div class="form-group"><label class="form-label">Observação</label>'
      +'<input class="form-control" type="text" id="f-obs-ent" placeholder="Ex: Entregue conforme cronograma"></div>'
      +'</div>'
      +'<div class="form-group">'
      +'<label class="form-label">Documentos entregues <span class="obrig">*</span></label>'
      +'<div style="display:flex;gap:8px;margin-bottom:8px">'
      +'<select class="form-control" id="sel-tipo-doc" style="flex:1;height:34px;font-size:12px">'
      +TIPOS_DOC.map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('')
      +'</select>'
      +'<button class="btn btn-secondary btn-sm" style="white-space:nowrap;height:34px" onclick="document.getElementById(\'inp-arq\').click()">+ Adicionar</button>'
      +'<input type="file" id="inp-arq" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.jpg,.png" onchange="adicionarDoc(this.files[0]);this.value=\'\'">'
      +'</div>'
      +'<div id="lista-docs"><div style="font-size:11px;color:var(--cinza-400);padding:6px 0">Nenhum documento adicionado ainda.</div></div>'
      +'<div style="font-size:10px;color:var(--cinza-400);margin-top:4px">PDF, Word, Excel, ZIP, Imagem · até 20MB por arquivo</div>'
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
      +'</div></div>';
    document.getElementById('mp-footer').innerHTML=
      '<button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>'
      +'<button class="btn-registrar" onclick="registrarEntrega('+numProxEntrega+','+pctRest.toFixed(2)+','+valorRest.toFixed(2)+')">&#x1F4E5; Registrar e enviar para avaliação</button>';

  } else if(isAnalise&&entregaAtual){
    // Buscar documentos da entrega
    var docsR=await db.from('entrega_documentos').select('*').eq('entrega_id',entregaAtual.id).order('inserido_em');
    var docs=docsR.data||[];

    // Documentos entregues
    if(docs.length||entregaAtual.arquivo_url){
      html+='<div style="background:var(--azul-bg);border:1px solid #BFDBFE;border-radius:var(--raio);padding:12px 14px;margin-bottom:10px">'
        +'<div style="font-size:11px;font-weight:700;color:var(--azul-medio);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">&#x1F4CE; Documentos entregues (Entrega '+entregaAtual.numero_entrega+(entregaAtual.dt_entrega?' · '+fmtData(entregaAtual.dt_entrega):'')+')</div>';
      docs.forEach(function(d){
        html+='<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #BFDBFE">'
          +'<span>&#x1F4C4;</span>'
          +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(d.arquivo_nome)+'</div>'
          +'<div style="font-size:10px;color:var(--cinza-500)">'+esc(d.tipo_documento)+'</div></div>'
          +'<button class="btn btn-sm btn-secondary" style="font-size:11px" onclick="abrirArquivo(\''+esc(d.arquivo_url)+'\')">&#x1F441; Abrir</button>'
          +'</div>';
      });
      if(entregaAtual.arquivo_url&&!docs.length){
        html+='<div style="display:flex;align-items:center;gap:8px;padding:5px 0">'
          +'<span>&#x1F4C4;</span>'
          +'<div style="flex:1;font-size:12px;font-weight:600">'+esc(entregaAtual.arquivo_nome||'Documento')+'</div>'
          +'<button class="btn btn-sm btn-secondary" style="font-size:11px" onclick="abrirArquivo(\''+esc(entregaAtual.arquivo_url)+'\')">&#x1F441; Abrir</button>'
          +'</div>';
      }
      html+='</div>';
    }

    // Fotos
    if(entregaAtual.fotos_urls&&entregaAtual.fotos_urls.length){
      html+='<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:var(--cinza-600);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">&#x1F4F7; Fotos ('+entregaAtual.fotos_urls.length+')</div><div class="fotos-existentes">';
      entregaAtual.fotos_urls.forEach(function(url,i){
        var nome=(entregaAtual.fotos_nomes||[])[i]||('Foto '+(i+1));
        html+='<div class="foto-exist" onclick="abrirLightbox(\''+url.replace(/'/g,"\\'")+'\',\''+nome.replace(/'/g,"\\'")+'\')"><img src="'+url+'" alt="'+esc(nome)+'" loading="lazy"></div>';
      });
      html+='</div></div>';
    }

    // Decisão de avaliação
    var pctRestF=pctRest.toFixed(0);
    var valorRestF=fmtBRL(valorRest);
    html+='<div style="border-top:1px solid var(--borda);padding-top:14px">'
      +'<div style="font-size:11px;font-weight:700;color:var(--cinza-700);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Decisão de avaliação</div>'
      +'<div class="decisao-opts">'
      +'<label class="decisao-opt" id="opt-total" onclick="selecionarDecisao(\'aprovacao_total\')">'
      +'<input type="radio" name="decisao" value="aprovacao_total">'
      +'<div><div class="decisao-tit" style="color:#059669">&#x2714; Aprovação total</div>'
      +'<div class="decisao-sub">Atende integralmente — pagamento integral liberado ('+pctRestF+'% · '+valorRestF+')</div></div></label>'
      +'<label class="decisao-opt" id="opt-parcial" onclick="selecionarDecisao(\'aprovacao_parcial\')">'
      +'<input type="radio" name="decisao" value="aprovacao_parcial">'
      +'<div><div class="decisao-tit" style="color:#7C3AED">&#x25D1; Aprovação parcial</div>'
      +'<div class="decisao-sub">Atende parcialmente — pagamento proporcional</div></div></label>'
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
      +'</div>'
      +'<div class="despacho-box">'
      +'<div style="font-size:10px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">&#x1F4CB; Despacho — número gerado automaticamente ao salvar</div>'
      +'<div class="form-group" style="margin-bottom:10px"><label class="form-label">Texto do despacho <span class="obrig">*</span></label>'
      +'<textarea class="form-control" id="f-despacho" rows="4" placeholder="Descreva formalmente sua decisão..." style="font-size:12px;line-height:1.6"></textarea></div>'
      +'<div class="grid-2">'
      +'<div class="form-group" style="margin-bottom:0"><label class="form-label">Data do despacho</label>'
      +'<input class="form-control" type="date" id="f-dt-desp" value="'+new Date().toISOString().split('T')[0]+'"></div>'
      +'<div class="form-group" style="margin-bottom:0"><label class="form-label">Avaliador</label>'
      +'<input class="form-control" value="'+(appState.usuario&&appState.usuario.nome_completo||'')+'" readonly style="background:var(--cinza-50)"></div>'
      +'</div></div>'
      +'<div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:var(--raio);padding:12px 14px;margin-top:12px">'
      +'<div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">&#x1F4C4; Nota Técnica (PDF)</div>'
      +(entregaAtual.nota_tecnica_url?'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 8px;background:#fff;border:1px solid #86EFAC;border-radius:var(--raio)"><span>&#x1F4C4;</span><div style="flex:1;font-size:12px;font-weight:600">'+esc(entregaAtual.nota_tecnica_nome||'Nota Técnica')+'</div><button class="btn btn-sm btn-secondary" style="font-size:11px" onclick="abrirArquivo(\''+esc(entregaAtual.nota_tecnica_url)+'\')">&#x1F441; Abrir</button></div>':'')
      +'<div class="upload-zona" id="zona-nt" style="padding:10px" onclick="document.getElementById(\'inp-nt\').click()" ondragover="event.preventDefault();this.classList.add(\'drag\')" ondragleave="this.classList.remove(\'drag\')" ondrop="event.preventDefault();this.classList.remove(\'drag\');selNotaTecnica(event.dataTransfer.files[0])">'
      +'<input type="file" id="inp-nt" style="display:none" accept=".pdf" onchange="selNotaTecnica(this.files[0])">'
      +'<div style="font-size:12px;font-weight:500;color:var(--cinza-600)">'+(entregaAtual.nota_tecnica_url?'&#x1F4CE; Substituir nota técnica':'&#x1F4CE; Anexar nota técnica (PDF)')+'</div>'
      +'</div><div id="nt-nome" style="font-size:11px;margin-top:4px;color:var(--cinza-500)"></div>'
      +'<div style="font-size:10px;color:var(--cinza-400);margin-top:4px">Visível para todas as partes ao clicar em Abrir</div>'
      +'</div></div>';

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
  if(!docsEntrega.length){el.innerHTML='<div style="font-size:11px;color:var(--cinza-400);padding:6px 0">Nenhum documento adicionado ainda.</div>';return;}
  el.innerHTML=docsEntrega.map(function(d,i){
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--cinza-50);border:1px solid var(--borda);border-radius:var(--raio);margin-bottom:4px">'
      +'<span>&#x1F4CE;</span>'
      +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(d.nome)+'</div>'
      +'<div style="font-size:10px;color:var(--cinza-500)">'+esc(d.tipo)+' · '+Math.round(d.size/1024)+'KB</div></div>'
      +'<button onclick="removerDoc('+i+')" style="width:22px;height:22px;border:1px solid #FCA5A5;border-radius:50%;background:#FEF2F2;color:var(--erro);cursor:pointer;font-size:11px">&#x2715;</button>'
      +'</div>';
  }).join('');
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

async function registrarEntrega(numEntrega,pctRest,valorRest){
  var dtEnt=document.getElementById('f-dt-ent')&&document.getElementById('f-dt-ent').value;
  var obs=document.getElementById('f-obs-ent')&&document.getElementById('f-obs-ent').value&&document.getElementById('f-obs-ent').value.trim()||'';
  if(!dtEnt){toast('Informe a data de entrega.','error');return;}
  if(!docsEntrega.length){toast('Adicione pelo menos um documento.','error');return;}

  var fotosUrls=[],fotosNomes=[];
  if(fotosNovas.length){
    toast('Enviando fotos...','info');
    for(var i=0;i<fotosNovas.length;i++){
      var foto=fotosNovas[i];var ext=foto.name.split('.').pop().toLowerCase();
      var path='produtos/'+produtoAtual.id+'/fotos/entrega-'+numEntrega+'-foto-'+(i+1)+'-'+Date.now()+'.'+ext;
      var fUp=await db.storage.from('tdrs-arquivos').upload(path,foto,{upsert:true});
      if(!fUp.error){var fUrl=db.storage.from('tdrs-arquivos').getPublicUrl(path);fotosUrls.push(fUrl.data.publicUrl);fotosNomes.push(foto.name);}
    }
  }

  var insR=await db.from('contratos_produtos_entregas').insert({
    produto_id:produtoAtual.id,contrato_id:produtoAtual.contrato_id,
    numero_entrega:numEntrega,pct_entregue:pctRest,valor_entregue:valorRest,
    dt_entrega:dtEnt,dt_vencimento_orig:produtoAtual.dt_vencimento,
    situacao:'em_analise',tipo_documento:docsEntrega[0]&&docsEntrega[0].tipo||'Relatório Técnico',
    fotos_urls:fotosUrls,fotos_nomes:fotosNomes,fotos_total:fotosUrls.length,
    criado_por:appState.usuario.id
  }).select().single();
  if(insR.error){toast('Erro: '+insR.error.message,'error');return;}
  var entrega=insR.data;

  toast('Enviando '+docsEntrega.length+' documento(s)...','info');
  for(var j=0;j<docsEntrega.length;j++){
    var doc=docsEntrega[j];
    var dpath='produtos/'+produtoAtual.id+'/entrega-'+numEntrega+'-'+Date.now()+'_'+doc.file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    var dUp=await db.storage.from('tdrs-arquivos').upload(dpath,doc.file,{upsert:true});
    if(!dUp.error){
      var dUrl=db.storage.from('tdrs-arquivos').getPublicUrl(dpath);
      await db.from('entrega_documentos').insert({entrega_id:entrega.id,tipo_documento:doc.tipo,arquivo_url:dUrl.data.publicUrl,arquivo_nome:doc.nome,arquivo_tamanho:doc.size,inserido_por:appState.usuario.id});
    }
  }

  await db.from('contratos_produtos').update({dt_entrega:dtEnt,situacao:'em_analise',observacoes:obs||produtoAtual.observacoes,atualizado_em:new Date().toISOString()}).eq('id',produtoAtual.id);
  var qtd=docsEntrega.length;docsEntrega=[];
  toast('Entrega com '+qtd+' documento(s) registrada e enviada para avaliação!','success');
  fecharModal();await selecionarCont(filtCont);await renderStats();
}

async function emitirDespacho(tipoBtn){
  if(tipoBtn)selecionarDecisao(tipoBtn);
  var tipo=tipoBtn||decisaoSel;
  if(!tipo){toast('Selecione uma decisão.','error');return;}
  var despacho=document.getElementById('f-despacho')&&document.getElementById('f-despacho').value&&document.getElementById('f-despacho').value.trim()||'';
  var dtDesp=document.getElementById('f-dt-desp')&&document.getElementById('f-dt-desp').value||'';
  if(!despacho||despacho.length<20){toast('O texto do despacho deve ter pelo menos 20 caracteres.','error');return;}

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
  if(dSeqR.data){dSeq=dSeqR.data.ultimo+1;await db.from('despachos_seq').update({ultimo:dSeq}).eq('ano',anoAtual);}
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
    pct_entregue:tipo!=='devolucao'?pctAprov:0,valor_entregue:tipo!=='devolucao'?valorAprov:0,
    nota_tecnica_url:ntUrl,nota_tecnica_nome:ntNome,nota_tecnica_data:ntUrl?new Date().toISOString():null,
    atualizado_em:new Date().toISOString()
  }).eq('id',entregaAtual.id);
  if(updR.error){toast('Erro: '+updR.error.message,'error');return;}
  notaTecnicaFile=null;

  if(tipo!=='devolucao'){
    var novoPct=Math.min(100,parseFloat(produtoAtual.pct_aprovado||0)+pctAprov);
    var novoVal=parseFloat(produtoAtual.valor_brl||0)*novoPct/100;
    var novaSitProd=novoPct>=100?'pago':'entrega_parcial';
    await db.from('contratos_produtos').update({pct_aprovado:novoPct,valor_aprovado:novoVal,situacao:novaSitProd,atualizado_em:new Date().toISOString()}).eq('id',produtoAtual.id);
  } else {
    await db.from('contratos_produtos').update({situacao:'pendente',atualizado_em:new Date().toISOString()}).eq('id',produtoAtual.id);
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

function fecharModal(){
  document.getElementById('modal-prod').classList.remove('aberto');
  produtoAtual=null;entregaAtual=null;entregaArquivo=null;decisaoSel='';
  docsEntrega=[];notaTecnicaFile=null;fotosNovas=[];
}
document.addEventListener('keydown',function(e){if(e.key==='Escape')fecharModal();});
