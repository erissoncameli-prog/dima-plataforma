// produtos.js — Avaliação de Produtos DIMA
// Sem template literals — concatenação pura para evitar corte pelo parser HTML

async function enviarEmailProduto(produto_id,entrega_id,evento){
  var enviados=0,falhas=0,erro=null;
  try{
    var sess=await db.auth.getSession();
    var token=sess.data&&sess.data.session&&sess.data.session.access_token;
    var resp=await fetch(SUPABASE_URL+'/functions/v1/enviar-email-produto',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({produto_id:produto_id,entrega_id:entrega_id||null,evento:evento})
    });
    var result=await resp.json();
    enviados=result.enviados||0;
    falhas=result.falhas||0;
    if(!result.ok||enviados===0){erro=result.error||('Falha no envio ('+falhas+' erro(s)).');}
  }catch(e){
    erro=(e&&e.message)||'Erro de rede ao enviar e-mail.';
    console.error('Erro ao enviar e-mail de produto:',e);
  }
  // Sempre registra o resultado (sucesso ou falha) para permitir auditoria e reenvio manual
  try{
    await db.from('produto_notif_log').insert({produto_id:produto_id,entrega_id:entrega_id||null,evento:evento,total_enviados:enviados,falhas:falhas,erro:erro,enviado_por:appState.usuario.id});
  }catch(e2){console.error('Erro ao gravar log de notificação:',e2);}
  if(erro&&typeof toast==='function'){
    toast('Falha ao enviar e-mail de notificação ('+evento+'): '+erro,'error',9000);
  }
}

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

// ── Ícones (SVG, sem emoji) ───────────────────────────────────
var PR_IC={
  check:'<path d="M20 6 9 17l-5-5"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  alerta:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  clipe:'<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
  volta:'<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  olho:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  seta:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  voltar:'<path d="M19 12H5M11 18l-6-6 6-6"/>',
  entrada:'<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  despacho:'<path d="M9 4h6v3H9z"/><path d="M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 12h6M9 16h4"/>',
  doc:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  parcial:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  alvo:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  camera:'<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
  pin:'<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  cartao:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  busca:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  moeda:'<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
  email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  caixa:'<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  relogio:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mais:'<path d="M12 5v14M5 12h14"/>',
  pasta:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  predio:'<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20"/>',
  upload:'<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  sol:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'
};
function prIc(n,cls){return '<svg class="pr-ic'+(cls?' '+cls:'')+'" viewBox="0 0 24 24" aria-hidden="true">'+(PR_IC[n]||'')+'</svg>';}
// situação do produto: rótulo, classe do selo, cor do cartão (token) e ícone
var PR_SIT={pendente:['Pendente','pr-p-al','--alerta','relogio'],em_analise:['Em avaliação','pr-p-in','--info','busca'],
  entrega_parcial:['Parcial','pr-p-ia','--ia','parcial'],aprovado:['Aprovado','pr-p-ok','--ok','check'],pago:['Pago','pr-p-ok','--ok','moeda'],
  cancelado:['Cancelado','pr-p-ne','--txt-3','x'],devolvido:['Devolvido','pr-p-er','--erro','volta']};
function pillSit(s){var p=PR_SIT[s]||[s||'—','pr-p-ne','--txt-3','info'];return '<span class="pr-pill '+p[1]+'">'+prIc(p[3],'p')+esc(p[0])+'</span>';}
function prSpin(){return '<div class="pr-vazio" role="status"><div class="pr-spin"></div>Carregando…</div>';}

// Só contratos das atividades que a pessoa pode ver (get_minhas_atividades: super_admin/coordenação = todas;
// demais = atividades em que é responsável ou substituto). Toda consulta de produto passa por esta lista.
function idsVisiveis(){return contratos.map(function(c){return c.id;});}
function contratoVisivel(id){return contratos.some(function(c){return c.id===id;});}
var SEL_PROD='*,contratos(id,numero,objeto_pt,atividade_id,fornecedores(id,nome),atividades(id,codigo,nome_pt)),contratos_produtos_entregas(nota_tecnica_url,nota_tecnica_nome,documentos:entrega_documentos(arquivo_url,arquivo_nome,tipo_documento))';

(async function(){
  var u=await carregarUsuario();
  if(!u){localStorage.setItem('dima_redirect',window.location.href);window.location.href='../index.html';return;}

  // Ler parâmetros da URL
  var params=new URLSearchParams(window.location.search);
  var entregaParam=params.get('entrega');
  var notifId=params.get('notif');
  if(notifId) notifPendenteId=notifId;

  document.getElementById('app').innerHTML=gerarLayout('Produtos Entregues','produtos')
    +'<div class="fade-in pr-pagina">'
    +'<div class="pr-kpis" id="stats"></div>'
    +'<div class="pr-filtros" role="group" aria-label="Filtros">'
    +'<select id="sel-ativ" onchange="selecionarAtiv(this.value)" aria-label="Atividade">'
    +'<option value="">Todas as atividades</option>'
    +'</select>'
    +'<div class="pr-forn">'
    +'<label class="pr-busca">'+prIc('busca','p')+'<input id="inp-forn" placeholder="Fornecedor" autocomplete="off" aria-label="Fornecedor"'
    +' oninput="filtrarForn(this.value)"'
    +' onfocus="mostrarSugestoesForn(this.value)"'
    +' onblur="setTimeout(function(){ocultarSugestoesForn()},200)"></label>'
    +'<div id="forn-sugestoes" class="pr-sugestoes" role="listbox" hidden></div>'
    +'</div>'
    +'<select id="sel-cont" onchange="selecionarCont(this.value)" disabled aria-label="Contrato">'
    +'<option value="">Todos os contratos</option>'
    +'</select>'
    +'<span id="pr-cont" class="pr-cont" aria-live="polite"></span>'
    +'</div>'
    +'<div id="conteudo"></div>'
    +'</div>'
    +'</div></div></div>';

  carregarLogosSidebar();
  seletorTema();
  await carregar();
  if(entregaParam) await abrirModalPorEntrega(entregaParam);
})();

// Tema claro/escuro: mesmo 'diag_tema' da mesa do Diagnóstico e das demais guias (componente .dgm-tema)
function seletorTema(){
  var tb=document.querySelector('.topbar'); if(!tb||tb.querySelector('.dgm-tema')||typeof DiagTema==='undefined')return;
  var d=document.createElement('div');
  d.className='dgm-tema'; d.setAttribute('role','group'); d.setAttribute('aria-label','Tema');
  d.innerHTML=[['claro','sol','Claro'],['escuro','lua','Escuro']].map(function(x){
    return '<button type="button" data-tema="'+x[0]+'" aria-pressed="'+(DiagTema.atual()===x[0])+'">'+prIc(x[1])+x[2]+'</button>';}).join('');
  var bc=tb.querySelector('.topbar-breadcrumb');
  if(bc)bc.parentNode.insertBefore(d,bc); else tb.appendChild(d);
  d.addEventListener('click',function(ev){
    var b=ev.target.closest('[data-tema]'); if(!b)return;
    DiagTema.definir(b.dataset.tema);
    d.querySelectorAll('[data-tema]').forEach(function(x){x.setAttribute('aria-pressed',String(x===b));});
  });
}

async function carregar(){
  var rA=await db.rpc('get_minhas_atividades');
  atividades=rA.data||[];
  var ativIds=atividades.map(function(a){return a.id;});
  var rC=ativIds.length
    ?await db.from('contratos').select('id,numero,objeto_pt,atividade_id,fornecedor_id,elemento_despesa,fornecedores(id,nome)').in('atividade_id',ativIds).order('numero')
    :{data:[]};
  contratos=rC.data||[];
  var sel=document.getElementById('sel-ativ');
  atividades.forEach(function(a){
    var o=document.createElement('option');
    o.value=a.id;
    o.textContent=a.codigo+' — '+(a.nome_pt||'').substring(0,55);
    sel.appendChild(o);
  });
  document.getElementById('sel-cont').disabled=!contratos.length;
  atualizarDropdownContrato(true);
  await renderStats();
  await carregarFila();
}

// Fila inicial: o que precisa de ação (em avaliação e devolvidos), só dos contratos visíveis
async function carregarFila(){
  var ids=idsVisiveis();
  var cont=document.getElementById('conteudo');
  if(!ids.length){renderVazio('Nenhum contrato das suas atividades. Os produtos aparecem para quem é responsável ou substituto da atividade.');return;}
  cont.innerHTML=prSpin();
  var r=await db.from('contratos_produtos').select(SEL_PROD)
    .in('contrato_id',ids).in('situacao',['em_analise','devolvido'])
    .order('numero_produto',{ascending:true});
  // filtros mudaram enquanto carregava
  if(filtAtiv||filtForn||filtCont||filtroStatus)return;
  todosProdutos=r.data||[];
  if(!todosProdutos.length){
    contarLista('Nada aguardando ação');
    renderVazio('Nenhum produto em avaliação ou devolvido. Use os números do topo ou os filtros para ver os demais.','check');
    return;
  }
  renderLista(true);
}

async function abrirModalPorEntrega(entregaId){
  var r=await db.from('contratos_produtos_entregas').select('*,contratos_produtos(id,contrato_id)').eq('id',entregaId).single();
  var e=r.data;
  if(!e)return;
  var produtoId=e.produto_id||e.contratos_produtos&&e.contratos_produtos.id;
  var contratoId=e.contrato_id||e.contratos_produtos&&e.contratos_produtos.contrato_id;
  if(!produtoId||!contratoId)return;
  if(!contratoVisivel(contratoId)){toast('Este produto é de uma atividade em que você não é responsável.','warning');return;}
  var cont=contratos.find(function(c){return c.id===contratoId;});
  if(cont&&cont.atividade_id){
    var selAtiv=document.getElementById('sel-ativ');
    if(selAtiv)selAtiv.value=cont.atividade_id;
    selecionarAtiv(cont.atividade_id);
    var selCont=document.getElementById('sel-cont');
    if(selCont)selCont.value=contratoId;
    await selecionarCont(contratoId);
  }
  await abrirModal(produtoId);
}

async function renderStats(){
  var contIds=idsVisiveis();
  var r=contIds.length?await db.from('contratos_produtos').select('situacao').in('contrato_id',contIds):{data:[]};
  var t=r.data||[];
  function n(s){return t.filter(function(p){return p.situacao===s;}).length;}
  statsCounts={total:t.length,pend:n('pendente')+n('entrega_parcial'),anal:n('em_analise'),aprov:n('aprovado'),pago:n('pago'),dev:n('devolvido')};
  renderStatsHTML();
}

function renderStatsHTML(){
  if(!statsCounts)return;
  var c=statsCounts;
  function card(status,lbl,val,ic,cls,sub,alerta){
    return '<button type="button" class="pr-kpi'+(alerta&&val?' alerta':'')+'" aria-pressed="'+(filtroStatus===status)+'" onclick="setFiltroStatus(\''+status+'\')">'
      +'<span class="pr-kpi-l">'+prIc(ic,'p')+lbl+'</span>'
      +'<span class="pr-kpi-v'+(cls&&val?' '+cls:'')+'">'+val+'</span>'
      +'<span class="pr-kpi-s">'+sub+'</span></button>';
  }
  document.getElementById('stats').innerHTML=
     card('pendente','Pendentes',c.pend,'relogio','','aguardando entrega')
    +card('em_analise','Em avaliação',c.anal,'busca','in','aguardando parecer')
    +card('devolvido','Devolvidos',c.dev,'volta','er','para correção',true)
    +card('aprovado','Aprovados',c.aprov,'check','','aguardando pagamento')
    +card('pago','Pagos',c.pago,'moeda','ok','de '+c.total+' produto'+(c.total!==1?'s':''));
}

async function setFiltroStatus(s){
  filtroStatus=(filtroStatus===s)?null:s;
  renderStatsHTML();
  if(filtroStatus===null){
    if(filtCont)await selecionarCont(filtCont);
    else if(!filtAtiv&&!filtForn)await carregarFila();
    else atualizarDropdownContrato();
    return;
  }
  // "Pendentes" inclui os parciais (falta entregar o restante)
  var sits=filtroStatus==='pendente'?['pendente','entrega_parcial']:[filtroStatus];
  var ids=filtCont?[filtCont]:idsVisiveis().filter(function(id){
    var c=contratos.find(function(x){return x.id===id;});
    if(filtAtiv&&c.atividade_id!==filtAtiv)return false;
    if(filtForn&&!((c.fornecedores&&c.fornecedores.nome||'').toLowerCase().includes(filtForn.toLowerCase())))return false;
    return true;
  });
  if(!ids.length){todosProdutos=[];renderLista();return;}
  document.getElementById('conteudo').innerHTML=prSpin();
  var alvo=filtroStatus;
  var r=await db.from('contratos_produtos').select(SEL_PROD)
    .in('contrato_id',ids).in('situacao',sits)
    .order('numero_produto',{ascending:true});
  if(filtroStatus!==alvo)return;
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
    if(filtAtiv&&c.atividade_id!==filtAtiv)return;
    var n=c.fornecedores&&c.fornecedores.nome;
    if(n&&!vistos[n]){vistos[n]=true;nomes.push(n);}
  });
  nomes.sort();
  var filtrados=q?nomes.filter(function(n){return n.toLowerCase().includes(q);}):nomes;
  if(!filtrados.length){el.hidden=true;return;}
  el.innerHTML=filtrados.map(function(n,i){
    return '<div class="pr-sug" role="option" data-i="'+i+'" onmousedown="selecionarFornAuto(this.textContent)">'+esc(n)+'</div>';
  }).join('');
  el.hidden=false;
}

function ocultarSugestoesForn(){
  var el=document.getElementById('forn-sugestoes');
  if(el)el.hidden=true;
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

function atualizarDropdownContrato(semConteudo){
  filtCont='';todosProdutos=[];
  if(filtroStatus){filtroStatus=null;renderStatsHTML();}
  var sel=document.getElementById('sel-cont');
  sel.innerHTML='<option value="">Todos os contratos</option>';

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
  if(semConteudo)return;

  if(!filtAtiv&&!filtForn)carregarFila();
  else if(lista.length===0){contarLista('');renderVazio('Nenhum contrato encontrado com esses filtros.','busca');}
  else{contarLista(lista.length+' contrato'+(lista.length!==1?'s':''));renderVazio('Escolha um contrato ou clique num número do topo para ver os produtos.','doc');}
}

async function selecionarCont(id){
  filtCont=id;todosProdutos=[];filtroStatus=null;renderStatsHTML();
  if(!id){atualizarDropdownContrato();return;}
  if(!contratoVisivel(id)){renderVazio('Contrato fora das suas atividades.','alerta');return;}
  document.getElementById('conteudo').innerHTML=prSpin();
  var r=await db.from('contratos_produtos').select(SEL_PROD)
    .eq('contrato_id',id)
    .not('situacao','in','("pago","cancelado")')
    .order('numero_produto',{ascending:true});
  if(filtCont!==id)return;
  todosProdutos=r.data||[];
  renderLista();
}

function sitLbl(s){return{pendente:'Pendente',em_analise:'Em avaliação',entrega_parcial:'Parcial',aprovado:'Aprovado',pago:'Pago',cancelado:'Cancelado',devolvido:'Devolvido p/ correção'}[s]||s;}

function contarLista(txt){var el=document.getElementById('pr-cont');if(el)el.textContent=txt||'';}

function renderVazio(msg,ic){
  document.getElementById('conteudo').innerHTML='<div class="pr-card-vazio"><div class="pr-vazio" role="status">'+prIc(ic||'caixa')+'<span>'+esc(msg)+'</span></div></div>';
}

function renderCard(p){
  var hoje=new Date();
  var venc=p.dt_vencimento?new Date(p.dt_vencimento+'T12:00:00'):null;
  var dias=venc?Math.ceil((venc-hoje)/86400000):null;
  var sitAberta=p.situacao==='pendente'||p.situacao==='em_analise'||p.situacao==='entrega_parcial'||p.situacao==='devolvido';
  var selo='';
  if(venc&&sitAberta){
    if(dias<0)selo='<span class="pr-pill pr-p-er pr-venc">'+prIc('relogio','p')+'vencido há '+Math.abs(dias)+' dia'+(Math.abs(dias)!==1?'s':'')+'</span>';
    else if(dias<=7)selo='<span class="pr-pill pr-p-al pr-venc">'+prIc('relogio','p')+(dias===0?'vence hoje':'vence em '+dias+' dia'+(dias!==1?'s':''))+'</span>';
  }
  var pct=parseFloat(p.pct_aprovado||0);
  var sit=PR_SIT[p.situacao]||PR_SIT.pendente;
  var ACAO={pendente:['entrada','Registrar entrega'],em_analise:['busca','Avaliar'],entrega_parcial:['entrada','Nova entrega'],
    aprovado:['olho','Ver histórico'],pago:['olho','Ver histórico'],devolvido:['volta','Reenviar entrega'],cancelado:['olho','Ver histórico']}[p.situacao]||['olho','Abrir'];
  var links=[];
  if((p.situacao==='aprovado'||p.situacao==='pago')&&p.contratos_produtos_entregas&&p.contratos_produtos_entregas.length){
    p.contratos_produtos_entregas.forEach(function(e){
      if(e.nota_tecnica_url)links.push('<a href="#" class="pr-link ok" data-arquivo="'+esc(e.nota_tecnica_url)+'" onclick="event.stopPropagation()">'+prIc('doc','p')+esc(e.nota_tecnica_nome||'Nota Técnica')+'</a>');
      (e.documentos||[]).forEach(function(d){
        if(d.arquivo_url)links.push('<a href="#" class="pr-link" data-arquivo="'+esc(d.arquivo_url)+'" onclick="event.stopPropagation()">'+prIc('clipe','p')+esc(d.tipo_documento||d.arquivo_nome||'Documento')+'</a>');
      });
    });
  }
  var admin=(appState.perfil==='super_admin'&&(p.situacao==='aprovado'||p.situacao==='pago'))
    ?'<div class="pr-admin"><button type="button" class="pr-btn peq" onclick="event.stopPropagation();abrirModalMatrizEdit(\''+p.id+'\')" title="Editar vínculo com a Matriz de Resultados">'+prIc('alvo','p')+'Matriz</button>'
     +'<button type="button" class="pr-btn peq" onclick="event.stopPropagation();abrirModalAnexoEdit(\''+p.id+'\')" title="Anexar documento à entrega">'+prIc('clipe','p')+'Documento</button></div>'
    :'';
  var ctx=[];
  if(p.contratos&&p.contratos.atividades&&p.contratos.atividades.codigo)ctx.push('<span class="pr-cod">'+esc(p.contratos.atividades.codigo)+'</span>');
  if(p.contratos&&p.contratos.numero)ctx.push('Contrato '+esc(p.contratos.numero));
  if(p.contratos&&p.contratos.fornecedores&&p.contratos.fornecedores.nome)ctx.push(esc(p.contratos.fornecedores.nome));
  var rotulo='Produto '+p.numero_produto+': '+(p.descricao||'')+' — '+sit[0]+'. '+ACAO[1];
  return '<article class="pr-pc" style="--c:var('+sit[2]+')">'
    +'<button type="button" class="pr-pc-abrir" onclick="abrirModal(\''+p.id+'\')" aria-label="'+esc(rotulo)+'"></button>'
    +'<div class="hd"><span class="pr-num">Produto '+esc(p.numero_produto)+'</span>'+pillSit(p.situacao)+selo+'</div>'
    +'<div class="bd"><div class="t">'+esc(p.descricao)+'</div>'
    +'<div class="v">'+fmtBRL(parseFloat(p.valor_brl||0))+'</div>'
    +(pct>0&&pct<100?'<div class="pr-prog"><div class="pr-meter"><i style="width:'+pct+'%"></i></div><span>'+pct+'% aprovado</span></div>':'')
    +(ctx.length?'<div class="ctx">'+ctx.join(' · ')+'</div>':'')
    +(links.length?'<div class="pr-links">'+links.join('')+'</div>':'')
    +'</div>'
    +'<div class="ft"><span>'+(p.dt_entrega?'Entregue '+fmtData(p.dt_entrega):'Sem entrega')+'</span>'
    +'<span class="ac">'+prIc(ACAO[0],'p')+ACAO[1]+'</span></div>'
    +admin
    +'</article>';
}

function secao(lista,ic,cor,titulo){
  if(!lista.length)return '';
  return '<section class="pr-sec"><h2 class="pr-sec-t" style="--c:var('+cor+')">'+prIc(ic,'p')+titulo+' <span class="n">'+lista.length+'</span></h2>'
    +'<div class="pr-grid">'+lista.map(renderCard).join('')+'</div></section>';
}

function renderLista(fila){
  if(!todosProdutos.length){contarLista('');renderVazio(filtroStatus?'Nenhum produto com esta situação.':'Nenhum produto encontrado para este contrato.','caixa');return;}
  function de(s){return todosProdutos.filter(function(p){return p.situacao===s;});}
  var html='';
  if(filtroStatus){
    contarLista(todosProdutos.length+' produto'+(todosProdutos.length!==1?'s':''));
    html='<div class="pr-grid">'+todosProdutos.map(renderCard).join('')+'</div>';
  } else {
    var n=todosProdutos.filter(function(p){return p.situacao!=='cancelado';}).length;
    contarLista(fila?(n+' produto'+(n!==1?'s':'')+' precisa'+(n!==1?'m':'')+' de ação'):(n+' produto'+(n!==1?'s':'')));
    html+=secao(de('em_analise'),'busca','--info','Em avaliação')
      +secao(de('devolvido'),'volta','--erro','Devolvidos para correção')
      +secao(de('entrega_parcial'),'parcial','--ia','Entrega parcial')
      +secao(de('pendente'),'relogio','--alerta','Pendentes')
      +secao(de('aprovado'),'check','--ok','Aprovados · aguardando pagamento');
    var canc=de('cancelado');
    if(canc.length)html+='<details class="pr-sec"><summary class="pr-sec-t" style="--c:var(--txt-3)">'+prIc('x','p')+'Cancelados no encerramento do contrato <span class="n">'+canc.length+'</span></summary>'
      +'<div class="pr-grid">'+canc.map(renderCard).join('')+'</div></details>';
  }
  document.getElementById('conteudo').innerHTML=html;
}

function renderPainelContrato(forn,contratoNum,totais,seiContrato){
  var saldo=totais.total-totais.pago;
  return '<div class="pr-ctx">'
    +'<div class="pr-quem"><span class="ico">'+prIc('predio')+'</span><div style="min-width:0">'
    +'<b>'+esc(forn.nome||'—')+'</b>'
    +'<small>'+(forn.cpf_cnpj?'<span class="mono">'+esc(forn.cpf_cnpj)+'</span> · ':'')+'Contrato <span class="mono">'+esc(contratoNum||'—')+'</span>'
    +(seiContrato?' · SEI '+linkSEI(seiContrato):'')+'</small></div></div>'
    +'<div class="pr-totais">'
    +'<div><span>Total</span><b>'+fmtBRL(totais.total)+'</b></div>'
    +'<div><span>Aprovado</span><b>'+fmtBRL(totais.aprovado)+'</b></div>'
    +'<div><span>Pago</span><b class="ok">'+fmtBRL(totais.pago)+'</b></div>'
    +'<div><span>Saldo</span><b class="'+(saldo<0?'er':'')+'">'+fmtBRL(saldo)+'</b></div>'
    +'</div></div>';
}
async function abrirModal(prodId){
  var r=await db.from('contratos_produtos')
    .select('*,criado_por_u:usuarios!contratos_produtos_criado_por_fkey(nome_completo),contratos(id,numero,objeto_pt,atividade_id,numero_sei,fornecedores(id,nome,cpf_cnpj,email),atividades(id,codigo,nome_pt)),contratos_produtos_entregas(*)')
    .eq('id',prodId).single();
  var p=r.data;
  if(!p)return;
  // mesma restrição da lista: só contrato de atividade em que a pessoa é responsável/substituta (ou super_admin/coordenação)
  if(!contratoVisivel(p.contrato_id)){toast('Este produto é de uma atividade em que você não é responsável.','warning');return;}
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

  var titulo=isDevolvido?('Reenviar entrega — Produto '+p.numero_produto):isPend?('Registrar entrega — Produto '+p.numero_produto):isAnalise?('Avaliar entrega — Produto '+p.numero_produto):('Produto '+p.numero_produto+' — histórico');
  var subt=document.getElementById('mp-sub');if(subt)subt.textContent=(p.descricao||'')+(p.contratos&&p.contratos.numero?' · Contrato '+p.contratos.numero:'');
  document.getElementById('mp-titulo').textContent=titulo;

  var html='';

  // Painel de contrato (topo — visível em todas as fases)
  html+=renderPainelContrato(fornContrato,numContrato,ctTotais,seiContrato);

  // Cabeçalho do produto
  html+='<div style="background:var(--cinza-50);border:1px solid var(--borda);border-radius:var(--raio);padding:8px 12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
    +'<div style="font-size:13px;font-weight:700;color:var(--cinza-900);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.descricao)+'</div>'
    +'<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;flex-wrap:wrap">'
    +pillSit(p.situacao)
    +'<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--verde-medio)">'+fmtBRL(parseFloat(p.valor_brl||0))+'</span>'
    +(pctAprov>0?'<span style="font-size:11px;color:var(--ia);font-weight:600">'+pctAprov+'% aprovado</span>':'')
    +(p.dt_vencimento?'<span style="font-size:11px;color:var(--cinza-500)">Venc. '+fmtData(p.dt_vencimento)+'</span>':'')
    +'</div>'
    +(pctAprov>0?'</div><div style="width:100%;padding:0 0 2px"><div class="prog-produto" style="height:4px"><div class="prog-fill" style="width:'+pctAprov+'%;background:var(--ia)"></div></div>':'')
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
      var cSit={aprovada:'var(--ok)',em_analise:'var(--info)',devolvida:'var(--erro)'};
      var nSit={aprovada:'Aprovada',em_analise:'Em avaliação',devolvida:'Devolvida'};
      var bgSit=e.situacao==='aprovada'?'var(--ok-bg)':e.situacao==='devolvida'?'var(--erro-bg)':'var(--info-bg)';
      // linha compacta: tudo em uma linha + despacho texto em sub-linha se houver
      html+='<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid var(--cinza-100)">'
        +'<div class="edot '+e.situacao+'" style="margin-top:4px;flex-shrink:0"></div>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
        +'<span style="font-size:12px;font-weight:600;color:var(--cinza-900)">Entrega '+e.numero_entrega+'</span>'
        +'<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;background:'+bgSit+';color:'+(cSit[e.situacao]||'var(--txt-3)')+'">'+(nSit[e.situacao]||e.situacao)+'</span>'
        +'<span style="font-size:11px;font-family:var(--font-mono);color:var(--verde-medio);font-weight:700;margin-left:auto">'+e.pct_entregue+'% · '+fmtBRL(parseFloat(e.valor_entregue||0))+'</span>'
        +(e.numero_sei_subprocesso?'<span style="font-size:10px;color:var(--cinza-500)">· SEI: '+linkSEI(e.numero_sei_subprocesso)+'</span>':'')
        +(e.despacho_numero?'<span style="font-size:10px;color:var(--cinza-500)">· '+prIc('despacho','p')+' '+esc(e.despacho_numero)+(e.despacho_data?' '+fmtData(e.despacho_data):'')+'</span>':'')
        +(e.arquivo_nome?'<span style="font-size:10px;color:var(--azul-medio);display:inline-flex;align-items:center;gap:4px">· '+prIc('clipe','p')+' '+esc(e.arquivo_nome.length>28?e.arquivo_nome.substring(0,26)+'…':e.arquivo_nome)+(e.arquivo_url?'<button class="btn-xs" onclick="event.stopPropagation();abrirArquivo(\''+e.arquivo_url+'\')" style="height:18px;padding:0 5px;font-size:9px">Abrir</button>':'')+'</span>':'')
        +((e.fotos_total||0)>0?'<span style="font-size:10px;color:var(--cinza-400)">· '+prIc('camera','p')+' '+e.fotos_total+'</span>':'')
        +'</div>'
        +(e.despacho_texto?'<div style="font-size:11px;color:var(--cinza-600);line-height:1.45;margin-top:3px;padding:4px 8px;background:var(--cinza-50);border-left:2px solid '+(cSit[e.situacao]||'var(--borda)')+';border-radius:2px">'+esc(e.despacho_texto.substring(0,160))+(e.despacho_texto.length>160?'…':'')+'</div>':'')
        +'</div></div>';
    });
    html+='</div></details>';
  }

  // FORMULÁRIO DE ENTREGA
  if(isPend){

    // Painel de contexto para produtos devolvidos
    if(isDevolvido&&entregaDevolvida){
      html+='<div style="background:var(--erro-bg);border:1px solid var(--pr-erro-borda);border-radius:var(--raio);padding:14px 16px;margin-bottom:14px">'
        +'<div style="font-size:12px;font-weight:700;color:var(--erro-txt);margin-bottom:10px;display:flex;align-items:center;gap:6px">'+prIc('volta','p')+' Este produto foi devolvido para correção</div>'
        // Motivo da devolução
        +(entregaDevolvida.despacho_texto?'<div style="font-size:12px;color:var(--erro-txt);background:var(--sup);border:1px solid var(--pr-erro-borda);border-radius:var(--raio);padding:8px 10px;margin-bottom:10px;line-height:1.55">'
          +'<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--erro)">Motivo ('+(entregaDevolvida.despacho_numero||'Despacho')+'): </span>'
          +esc(entregaDevolvida.despacho_texto)
          +'</div>':'')
        // Documentos enviados anteriormente
        +(docsDevolvida.length?'<div style="font-size:11px;font-weight:700;color:var(--erro-txt);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">'+prIc('clipe','p')+' Documentos enviados anteriormente</div>'
          +'<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:'+(entregaDevolvida.fotos_total>0?'10':'0')+'px">'
          +docsDevolvida.map(function(d){
            return '<div style="display:flex;align-items:center;gap:8px;background:var(--sup);border:1px solid var(--pr-erro-borda);border-radius:var(--raio);padding:6px 10px;font-size:11px">'
              +'<span style="font-size:13px">'+prIc('doc','p')+'</span>'
              +'<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--cinza-800);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(d.arquivo_nome||'Documento')+'</div>'
              +'<div style="color:var(--cinza-500);font-size:10px">'+esc(d.tipo_documento||'')+'</div></div>'
              +(d.arquivo_url?'<button class="btn btn-sm btn-secondary" style="flex-shrink:0;height:24px;padding:0 8px;font-size:10px" onclick="event.stopPropagation();abrirArquivo(\''+esc(d.arquivo_url)+'\')">Abrir</button>':'')
              +'</div>';
          }).join('')
          +'</div>':'')
        // Fotos enviadas anteriormente
        +((entregaDevolvida.fotos_total>0&&(entregaDevolvida.fotos_urls||[]).length)?'<div style="font-size:11px;font-weight:700;color:var(--erro-txt);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">'+prIc('camera','p')+' Fotos enviadas anteriormente ('+entregaDevolvida.fotos_total+')</div>'
          +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px">'
          +(entregaDevolvida.fotos_urls||[]).map(function(url,i){
            var nome=(entregaDevolvida.fotos_nomes||[])[i]||('Foto '+(i+1));
            return '<div class="album-foto" style="border-radius:6px;overflow:hidden;aspect-ratio:1;cursor:zoom-in;background:var(--cinza-100);position:relative;border:1px solid var(--pr-erro-borda)" onclick="abrirLightbox(\''+url.replace(/'/g,"\\'")+'\',\''+nome.replace(/'/g,"\\'")+'\')"><img data-arquivo-src="'+esc(url)+'" alt="'+esc(nome)+'" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"></div>';
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
      +'<input class="form-control" id="f-sei-sub" type="text" placeholder="'+(seiContrato||'0000.000000.00000/0000-00')+'" value="'+(seiContrato||'')+'" maxlength="25" style="font-family:var(--font-mono);max-width:310px" oninput="this.value=maskSEI(this.value)">'
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
      +'<div style="font-size:13px;font-weight:500;color:var(--cinza-600)">'+prIc('camera','p')+' Clique ou arraste as fotos aqui</div>'
      +'<div style="font-size:11px;color:var(--cinza-400);margin-top:4px">JPEG, PNG · Máximo 10 fotos</div>'
      +'</div>'
      +'<div id="fotos-grid" class="fotos-grid"></div>'
      +'<div id="fotos-count" style="font-size:11px;color:var(--cinza-500);margin-top:6px"></div>'
      +'</div>'
      // Aviso contribuição obrigatória quando há geo
      +'<div id="aviso-geo" style="display:none;align-items:flex-start;gap:10px;background:var(--alerta-bg);border:1px solid var(--alerta-borda);border-radius:var(--raio);padding:10px 12px;margin-bottom:10px">'
      +'<span style="font-size:16px;flex-shrink:0">'+prIc('alerta','p')+'</span>'
      +'<div style="font-size:12px;color:var(--alerta-txt)"><strong>Contribuição obrigatória.</strong> Esta entrega contém uma planilha de geolocalização — vincule-a a pelo menos um indicador da Matriz de Resultados abaixo antes de enviar.</div>'
      +'</div>'
      // Contribuição à Matriz de Resultados
      +'<div style="border-top:1px solid var(--borda);padding-top:14px;margin-top:4px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
      +'<div style="font-size:11px;font-weight:700;color:var(--cinza-700);text-transform:uppercase;letter-spacing:.05em">'+prIc('alvo','p')+' Contribuição à Matriz de Resultados</div>'
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
      +'<button class="btn-registrar" onclick="registrarEntrega('+numProxEntrega+','+pctRest.toFixed(2)+','+valorRest.toFixed(2)+')">'+prIc('entrada','p')+' Registrar e enviar para avaliação</button>';

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

    // Injetar arquivo direto da entrega (arquivo_url/arquivo_nome) como doc sintético
    entregas.forEach(function(e){
      if(e.arquivo_url&&e.arquivo_nome){
        allDocs.push({
          id:'__arq__'+e.id,
          entrega_id:e.id,
          arquivo_nome:e.arquivo_nome,
          arquivo_url:e.arquivo_url,
          tipo_documento:'Arquivo da Entrega',
          inserido_em:e.dt_entrega||e.criado_em||null,
          _sintetico:true
        });
      }
    });

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
      +'<button class="eval-tab-btn ativo" id="eval-btn-docs" onclick="switchEvalTab(\'docs\')">'+prIc('clipe','p')+' Documentos'+(nDocs?' ('+nDocs+')':'')+'</button>'
      +(nFotos?'<button class="eval-tab-btn" id="eval-btn-fotos" onclick="switchEvalTab(\'fotos\')">'+prIc('camera','p')+' Fotos ('+nFotos+')</button>':'')
      +(nGeo?'<button class="eval-tab-btn" id="eval-btn-geo" onclick="switchEvalTab(\'geo\')">'+prIc('pin','p')+' Geo ('+nGeo+' pts)</button>':'')
      +(contribs.length?'<button class="eval-tab-btn" id="eval-btn-ind" onclick="switchEvalTab(\'ind\')">'+prIc('alvo','p')+' Indicadores ('+contribs.length+')</button>':'')
      +'</div>';

    // Tab Documentos (versionado)
    html+='<div class="eval-tab-content ativo" id="eval-tab-docs">';
    if(nDocs){
      tiposOrdem.forEach(function(tipo){
        var items=docsByTipo[tipo];
        var isGeo=tipo===TIPO_GEO;
        html+='<div style="border:1px solid var(--borda);border-radius:var(--raio);overflow:hidden;margin-bottom:10px">'
          +'<div style="padding:7px 12px;background:var(--cinza-50);border-bottom:1px solid var(--borda);font-size:11px;font-weight:700;color:var(--cinza-700);display:flex;align-items:center;gap:6px">'
          +(isGeo?''+prIc('pin','p')+'':''+prIc('doc','p')+'')+' '+esc(tipo)
          +(items.length>1?'<span style="font-size:10px;color:var(--cinza-400);font-weight:400;margin-left:4px">('+items.length+' versões)</span>':'')
          +'</div>';
        items.forEach(function(d,idx){
          var ent=entregaById[d.entrega_id]||{};
          var isAtual=d.entrega_id===entregaAtual.id;
          var rowBg=idx===0?'background:var(--sup)':'background:var(--cinza-50)';
          html+='<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--borda);'+rowBg+'">'
            +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(d.arquivo_nome||'Documento')+'</div>'
            +'<div style="font-size:10px;color:var(--cinza-500);margin-top:2px">Entrega '+esc(String(ent.numero_entrega||'?'))+(ent.dt_entrega?' · '+fmtData(ent.dt_entrega):'')+'</div>'
            +'</div>'
            +(isAtual
              ?'<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:var(--ok-bg);color:var(--ok-txt);flex-shrink:0;white-space:nowrap">'+prIc('check','p')+' Atual</span>'
              :'<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:var(--cinza-100);color:var(--cinza-500);flex-shrink:0;white-space:nowrap">Anterior</span>'
            )
            +(isGeo
              ?'<button class="btn btn-sm btn-secondary" style="font-size:11px;white-space:nowrap;flex-shrink:0" onclick="switchEvalTab(\'geo\')">'+prIc('pin','p')+' Ver pontos</button>'
              :(d.arquivo_url?'<button class="btn btn-sm btn-secondary" style="font-size:11px;flex-shrink:0" onclick="abrirArquivo(\''+esc(d.arquivo_url)+'\')">'+prIc('olho','p')+' Abrir</button>':'')
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
          +(isAtu?' <span style="font-size:9px;padding:2px 7px;background:var(--ok-bg);color:var(--ok-txt);border-radius:99px;font-weight:700">Atual</span>':'')
          +'</div>'
          +'<div class="album-grid">';
        fotos.forEach(function(f){
          html+='<div class="album-foto" onclick="abrirLightbox(\''+f.url.replace(/'/g,"\\'")+'\',\''+f.nome.replace(/'/g,"\\'")+'\')"><img data-arquivo-src="'+esc(f.url)+'" alt="'+esc(f.nome)+'" loading="lazy"><div class="album-foto-nome">'+esc(f.nome)+'</div></div>';
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
      var stCor={'pendente':'var(--alerta-txt)','confirmado':'var(--ok-txt)','rejeitado':'var(--erro-txt)'};
      var stBg={'pendente':'var(--alerta-bg)','confirmado':'var(--ok-bg)','rejeitado':'var(--erro-bg)'};
      var stLbl={'pendente':'Pendente','confirmado':'Confirmado','rejeitado':'Rejeitado'};
      html+='<div class="eval-tab-content" id="eval-tab-ind">'
        +'<div style="background:var(--ia-bg);border:1px solid var(--ia-borda);border-radius:var(--raio);padding:12px 14px">'
        +'<div style="font-size:11px;font-weight:700;color:var(--ia);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">'+prIc('alvo','p')+' Contribuição à Matriz de Resultados</div>';
      contribs.forEach(function(c){
        var mi=c.matriz_itens||{};var st=c.status||'pendente';
        html+='<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;background:var(--sup);border:1px solid var(--ia-borda);border-radius:var(--raio);margin-bottom:6px">'
          +'<div style="flex:1;min-width:0">'
          +'<div style="font-size:10px;font-family:var(--font-mono);font-weight:700;color:var(--ia);margin-bottom:2px">R'+mi.resultado+' · '+esc(mi.produto_codigo||'')+'</div>'
          +'<div style="font-size:12px;font-weight:600;color:var(--cinza-900);line-height:1.3;margin-bottom:4px">'+esc(mi.indicador||'')+'</div>'
          +'<div style="font-size:11px;color:var(--cinza-600)">Valor declarado: <strong style="font-family:var(--font-mono)">'+parseFloat(c.valor||0).toLocaleString('pt-BR')+'</strong>'+(c.unidade?' '+esc(c.unidade):'')+'</div>'
          +(c.observacao?'<div style="font-size:10px;color:var(--cinza-500);margin-top:3px;font-style:italic">'+esc(c.observacao)+'</div>':'')
          +'</div>'
          +'<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:99px;white-space:nowrap;background:'+(stBg[st]||'var(--sup-2)')+';color:'+(stCor[st]||'var(--txt-2)')+'">'+(stLbl[st]||st)+'</span>'
          +'</div>';
      });
      html+='</div></div>';
    }
    html+='</div>'; // fim coluna esquerda

    // ── COLUNA DIREITA: decisão ───────────────────────────────────
    html+='<div class="aval-col-direita">';

    // O que foi contratado
    html+='<div style="background:var(--info-bg);border:1px solid var(--info-borda);border-radius:var(--raio);padding:12px 14px;margin-bottom:12px">'
      +'<div style="font-size:11px;font-weight:700;color:var(--info-txt);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">'+prIc('despacho','p')+' O que foi contratado</div>'
      +'<div style="font-size:13px;font-weight:600;color:var(--cinza-900);line-height:1.4;margin-bottom:'+(p.observacoes?'8':'0')+'px">'+esc(p.descricao||'')+'</div>'
      +(p.observacoes?'<div style="font-size:11px;color:var(--cinza-600);line-height:1.55;border-top:1px solid var(--info-borda);padding-top:8px"><strong style="font-size:10px;color:var(--info-txt);text-transform:uppercase;letter-spacing:.04em">Observações: </strong>'+esc(p.observacoes)+'</div>':'')
      +'</div>';

    // Confirmação
    html+='<div style="background:var(--alerta-bg);border:1px solid var(--alerta-borda);border-radius:var(--raio);padding:10px 14px;margin-bottom:12px">'
      +'<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">'
      +'<input type="checkbox" id="chk-confirmacao" onchange="toggleAvalCheckbox()" style="margin-top:2px;width:16px;height:16px;accent-color:var(--ok);flex-shrink:0">'
      +'<span style="font-size:12px;font-weight:600;color:var(--alerta-txt);line-height:1.45">Confirmo que o produto corresponde ao contratado. Conteúdo e qualidade estão em conformidade.</span>'
      +'</label></div>';

    // Decisão
    var pctRestF=pctRest.toFixed(0);
    var valorRestF=fmtBRL(valorRest);
    html+='<div style="margin-bottom:10px">'
      +'<div style="font-size:10px;font-weight:700;color:var(--cinza-500);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Decisão de avaliação</div>'
      +'<div class="decisao-opts">'
      +'<label class="decisao-opt" id="opt-total" onclick="selecionarDecisao(\'aprovacao_total\')" title="'+pctRestF+'% aprovado · '+valorRestF+'">'
      +'<input type="radio" name="decisao" value="aprovacao_total">'
      +'<div class="decisao-tit" style="color:var(--ok)">'+prIc('check','p')+' Aprovar</div></label>'
      +'<label class="decisao-opt" id="opt-parcial" onclick="selecionarDecisao(\'aprovacao_parcial\')" title="Pagamento proporcional">'
      +'<input type="radio" name="decisao" value="aprovacao_parcial">'
      +'<div class="decisao-tit" style="color:var(--ia)">'+prIc('parcial','p')+' Parcial</div></label>'
      +'<label class="decisao-opt" id="opt-devol" onclick="selecionarDecisao(\'devolucao\')" title="Não atende — devolvido para correção">'
      +'<input type="radio" name="decisao" value="devolucao">'
      +'<div class="decisao-tit" style="color:var(--erro)">'+prIc('volta','p')+' Devolução</div></label>'
      +'</div>'
      +'<div id="wrap-parcial" style="display:none;margin-top:6px">'
      +'<div class="grid-2"><div class="form-group" style="margin-bottom:0">'
      +'<label class="form-label">% aprovado <span class="obrig">*</span></label>'
      +'<input class="form-control" type="number" id="f-pct" min="1" max="'+pctRestF+'" placeholder="Ex: 70" oninput="calcValorParcial(this.value,'+parseFloat(p.valor_brl||0)+')">'
      +'<div class="form-hint">Máximo: '+pctRestF+'%</div>'
      +'</div><div class="form-group" style="margin-bottom:0">'
      +'<label class="form-label">Valor a pagar (R$)</label>'
      +'<input class="form-control" type="number" id="f-val-parcial" readonly style="background:var(--cinza-50);font-family:var(--font-mono);font-weight:600" placeholder="Calculado">'
      +'</div></div></div>'
      +'<div class="form-hint" id="hint-decisao" style="margin-top:6px">Selecione uma decisão acima para habilitar o botão de confirmação correspondente.</div>'
      +'</div>';

    // Despacho + Nota Técnica integrada
    html+='<div class="despacho-box">'
      +'<div style="font-size:10px;font-weight:700;color:var(--alerta-txt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">'+prIc('despacho','p')+' Despacho — número gerado automaticamente</div>'
      +'<div class="form-group" style="margin-bottom:8px"><label class="form-label">Texto do despacho <span class="obrig">*</span></label>'
      +'<textarea class="form-control" id="f-despacho" rows="3" placeholder="Descreva formalmente sua decisão..." style="font-size:12px;line-height:1.6"></textarea></div>'
      +'<div class="grid-2" style="margin-bottom:10px">'
      +'<div class="form-group" style="margin-bottom:0"><label class="form-label">Data do despacho</label>'
      +'<input class="form-control" type="date" id="f-dt-desp" value="'+new Date().toISOString().split('T')[0]+'"></div>'
      +'<div class="form-group" style="margin-bottom:0"><label class="form-label">Avaliador</label>'
      +'<input class="form-control" value="'+(appState.usuario&&appState.usuario.nome_completo||'')+'" readonly style="background:var(--cinza-50)"></div>'
      +'</div>'
      // Nota Técnica como linha compacta dentro do despacho
      +'<div style="border-top:1px solid var(--alerta-borda);padding-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      +'<span style="font-size:10px;font-weight:700;color:var(--alerta-txt);text-transform:uppercase;letter-spacing:.04em">'+prIc('doc','p')+' Nota Técnica</span>'
      +(entregaAtual.nota_tecnica_url
        ?'<span style="font-size:11px;color:var(--alerta-txt);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(entregaAtual.nota_tecnica_nome||'Nota Técnica')+'</span>'
         +'<button class="btn btn-sm btn-secondary" style="font-size:10px;height:24px;padding:0 8px;flex-shrink:0" onclick="abrirArquivo(\''+esc(entregaAtual.nota_tecnica_url)+'\')">'+prIc('olho','p')+' Abrir</button>'
        :'<span id="nt-nome" style="font-size:11px;color:var(--alerta-txt);flex:1;font-style:italic">nenhuma anexada</span>')
      +'<input type="file" id="inp-nt" style="display:none" accept=".pdf" onchange="selNotaTecnica(this.files[0])">'
      +'<button class="btn btn-sm btn-secondary" style="font-size:10px;height:24px;padding:0 8px;flex-shrink:0" onclick="document.getElementById(\'inp-nt\').click()">'
      +(entregaAtual.nota_tecnica_url?''+prIc('clipe','p')+' Substituir':''+prIc('clipe','p')+' Anexar PDF')
      +'</button>'
      +(entregaAtual.nota_tecnica_url?'':'<div id="nt-nome" style="font-size:10px;color:var(--ok);width:100%;margin-top:2px"></div>')
      +'</div>'
      +'</div>';

    html+='</div>'; // fim coluna direita
    html+='</div>'; // fim aval-2col

    document.getElementById('mp-footer').innerHTML=
      '<button class="btn btn-secondary" onclick="fecharModal()">Fechar</button>'
      +'<button id="btn-devolver" class="btn-devolver" style="display:none" onclick="emitirDespacho(\'devolucao\')">'+prIc('volta','p')+' Devolver</button>'
      +'<button id="btn-parcial" class="btn-parcial" style="display:none" onclick="emitirDespacho(\'aprovacao_parcial\')">'+prIc('parcial','p')+' Aprovar parcialmente</button>'
      +'<button id="btn-aprovar" class="btn-aprovar" style="display:none" onclick="emitirDespacho(\'aprovacao_total\')">'+prIc('check','p')+' Aprovar e liberar pagamento</button>';

  } else if(!isPend&&!isAnalise){
    html+=await renderLinhaTempo(p);
    document.getElementById('mp-footer').innerHTML='<button class="btn btn-secondary" onclick="fecharModal()">Fechar</button>';
  } else {
    document.getElementById('mp-footer').innerHTML='<button class="btn btn-secondary" onclick="fecharModal()">Fechar</button>';
  }

  html+=await renderHistoricoEmails(prodId);
  document.getElementById('mp-body').innerHTML=html;
  assinarImagens(document.getElementById('mp-body'));
  prAbrir('modal-prod');
}

async function renderLinhaTempo(p){
  var r=await db.from('contratos_produtos_entregas')
    .select('*,criado_por_u:usuarios!contratos_produtos_entregas_criado_por_fkey(nome_completo),despachado_por_u:usuarios!contratos_produtos_entregas_despachado_por_fkey(nome_completo),lancamento:execucao_financeira!contratos_produtos_entregas_lancamento_id_fkey(id,situacao,valor_brl,dt_pagamento,pago_por_u:usuarios!execucao_financeira_pago_por_fkey(nome_completo)),documentos:entrega_documentos(*)')
    .eq('produto_id',p.id).order('numero_entrega');
  var entregas=r.data||[];

  var SIT_COR={pendente:'var(--txt-3)',em_analise:'var(--info)',aprovada:'var(--ok)',devolvida:'var(--erro)',pago:'var(--ok-txt)'};
  var SIT_ICON={pendente:''+prIc('relogio','p')+'',em_analise:''+prIc('busca','p')+'',aprovada:''+prIc('check','p')+'',devolvida:''+prIc('volta','p')+'',pago:''+prIc('moeda','p')+''};
  var DEC_LABEL={aprovacao_total:'Aprovação total',aprovacao_parcial:'Aprovação parcial',devolucao:'Devolução para ajustes'};

  function tlItem(icon,bg,content,line){
    return '<div style="display:flex;gap:12px;margin-bottom:4px">'
      +'<div style="display:flex;flex-direction:column;align-items:center">'
      +'<div style="width:32px;height:32px;border-radius:50%;background:'+bg+';display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">'+icon+'</div>'
      +(line?'<div style="width:2px;background:var(--borda);flex:1;margin-top:4px"></div>':'')
      +'</div><div style="padding-top:4px;padding-bottom:10px;flex:1">'+content+'</div></div>';
  }

  var html='<div style="border-top:1px solid var(--borda);padding-top:14px">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--cinza-500);margin-bottom:14px">'+prIc('despacho','p')+' Histórico do produto</div>';

  var cadC='<div style="font-size:12px;font-weight:700;color:var(--cinza-900)">Produto cadastrado</div>'
    +'<div style="font-size:11px;color:var(--cinza-500);margin-top:2px">'+fmtDT(p.criado_em)+(p.criado_por_u&&p.criado_por_u.nome_completo?' · '+esc(p.criado_por_u.nome_completo):'')+'</div>'
    +'<div style="font-size:11px;color:var(--cinza-600);margin-top:4px">Valor: <strong>'+fmtBRL(p.valor_brl)+'</strong>'+(p.dt_vencimento?' · Vence: '+fmtData(p.dt_vencimento):'')+'</div>';
  html+=tlItem(''+prIc('mais','p')+'','var(--ok-bg)',cadC,entregas.length>0);

  entregas.forEach(function(e,ei){
    var docs=e.documentos||[];
    var lanc=Array.isArray(e.lancamento)?e.lancamento[0]:e.lancamento;
    var isUltima=ei===entregas.length-1;
    var corSit=SIT_COR[e.situacao]||'var(--txt-3)';
    var iconSit=SIT_ICON[e.situacao]||''+prIc('caixa','p')+'';

    // Documentos
    var docsHtml='';
    if(docs.length){
      docsHtml='<div style="margin-top:6px">';
      docs.forEach(function(d){
        docsHtml+='<div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:3px 0">'
          +'<span>'+prIc('clipe','p')+'</span><span style="color:var(--cinza-700);flex:1">'+esc(d.arquivo_nome)+'</span>'
          +'<span style="color:var(--cinza-400)">'+esc(d.tipo_documento)+'</span>'
          +'<button onclick="abrirArquivo(\''+d.arquivo_url.replace(/'/g,"\\'")+'\');" style="font-size:10px;padding:1px 6px;border:1px solid var(--borda);border-radius:3px;background:var(--branco);cursor:pointer;color:var(--azul-medio)">'+prIc('olho','p')+'</button>'
          +'</div>';
      });
      docsHtml+='</div>';
    } else if(e.arquivo_url){
      docsHtml='<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-top:6px">'
        +'<span>'+prIc('clipe','p')+'</span><span style="color:var(--cinza-700)">'+esc(e.arquivo_nome||'Documento')+'</span>'
        +'<button onclick="abrirArquivo(\''+e.arquivo_url.replace(/'/g,"\\'")+'\');" style="font-size:10px;padding:1px 6px;border:1px solid var(--borda);border-radius:3px;background:var(--branco);cursor:pointer;color:var(--azul-medio)">'+prIc('olho','p')+'</button>'
        +'</div>';
    }

    var entC='<div style="font-size:12px;font-weight:700;color:var(--cinza-900)">Entrega '+e.numero_entrega+' registrada</div>'
      +'<div style="font-size:11px;color:var(--cinza-500);margin-top:2px">'+(e.dt_entrega?fmtData(e.dt_entrega):'—')+(e.criado_por_u&&e.criado_por_u.nome_completo?' · '+esc(e.criado_por_u.nome_completo):'')+'</div>'
      +docsHtml;
    html+=tlItem(''+prIc('entrada','p')+'','var(--info-bg)',entC,true);

    // Avaliação
    if(e.despacho_numero||e.situacao!=='em_analise'){
      var bgAvl=e.situacao==='devolvida'?'var(--erro-bg)':e.situacao==='aprovada'?'var(--ok-bg)':'var(--sup-2)';
      var avlC='<div style="font-size:12px;font-weight:700;color:'+corSit+'">'+(DEC_LABEL[e.tipo_decisao]||sitLbl(e.situacao))+'</div>'
        +'<div style="font-size:11px;color:var(--cinza-500);margin-top:2px">'+(e.despacho_data?fmtData(e.despacho_data):fmtDT(e.despachado_em||''))+(e.despachado_por_u&&e.despachado_por_u.nome_completo?' · '+esc(e.despachado_por_u.nome_completo):'')+(e.despacho_numero?' · '+esc(e.despacho_numero):'')+'</div>'
        +(e.despacho_texto?'<div style="font-size:11px;color:var(--cinza-700);margin-top:6px;padding:6px 8px;background:var(--cinza-50);border-left:3px solid '+corSit+';border-radius:0 4px 4px 0;line-height:1.5;max-height:80px;overflow-y:auto">'+esc(e.despacho_texto.substring(0,300))+(e.despacho_texto.length>300?'…':'')+'</div>':'')
        +(e.nota_tecnica_url?'<div style="margin-top:6px;display:flex;align-items:center;gap:6px"><span style="font-size:11px">'+prIc('doc','p')+'</span><span style="font-size:11px;color:var(--cinza-700)">'+esc(e.nota_tecnica_nome||'Nota Técnica')+'</span><button onclick="abrirArquivo(\''+e.nota_tecnica_url.replace(/'/g,"\\'")+'\');" style="font-size:10px;padding:1px 6px;border:1px solid var(--pr-ok-borda);border-radius:3px;background:var(--ok-bg);cursor:pointer;color:var(--ok-txt)">'+prIc('olho','p')+' Abrir NT</button></div>':'');
      html+=tlItem(iconSit,bgAvl,avlC,!isUltima||!!lanc);
    }

    // Lançamento
    if(lanc){
      var bgL=lanc.situacao==='pago'?'var(--ok-bg)':'var(--alerta-bg)';
      var corL=lanc.situacao==='pago'?'var(--ok-txt)':'var(--alerta-txt)';
      var lancC='<div style="font-size:12px;font-weight:700;color:'+corL+'">'+(lanc.situacao==='pago'?'Pago':'A pagar')+'</div>'
        +'<div style="font-size:11px;color:var(--cinza-500);margin-top:2px">'+fmtBRL(lanc.valor_brl)+(lanc.dt_pagamento?' · Pago em '+fmtData(lanc.dt_pagamento):'')+(lanc.pago_por_u&&lanc.pago_por_u.nome_completo?' · '+esc(lanc.pago_por_u.nome_completo):'')+'</div>';
      html+=tlItem(lanc.situacao==='pago'?''+prIc('moeda','p')+'':''+prIc('cartao','p')+'',bgL,lancC,false);
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

  // Mostra apenas o botão de confirmação correspondente à decisão selecionada,
  // evitando que uma aprovação parcial preenchida seja submetida como total (ou vice-versa)
  var btnTotal=document.getElementById('btn-aprovar');
  var btnParcial=document.getElementById('btn-parcial');
  var btnDevolver=document.getElementById('btn-devolver');
  var hint=document.getElementById('hint-decisao');
  if(btnTotal)btnTotal.style.display=tipo==='aprovacao_total'?'':'none';
  if(btnParcial)btnParcial.style.display=tipo==='aprovacao_parcial'?'':'none';
  if(btnDevolver)btnDevolver.style.display=tipo==='devolucao'?'':'none';
  if(hint)hint.style.display='none';
}

function calcValorParcial(pct,totalProduto){
  var campo=document.getElementById('f-val-parcial');
  if(campo)campo.value=((parseFloat(pct)||0)*totalProduto/100).toFixed(2);
}

async function abrirArquivo(url){
  await abrirDoc(url);
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
      return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--ok-bg);border:1px solid var(--pr-ok-borda);border-radius:var(--raio);margin-bottom:4px">'
        +'<span style="font-size:16px">'+prIc('pin','p')+'</span>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:12px;font-weight:600;color:var(--ok-txt)">'+esc(d.nome)+'</div>'
        +'<div style="font-size:10px;color:var(--ok-txt)">'+d.pontos.length+' pontos · Planilha de Geolocalização</div>'
        +'</div>'
        +'<button onclick="removerDoc('+i+')" style="width:22px;height:22px;border:1px solid var(--pr-ok-borda);border-radius:50%;background:var(--ok-bg);color:var(--ok-txt);cursor:pointer;font-size:11px">'+prIc('x','p')+'</button>'
        +'</div>';
    }
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--cinza-50);border:1px solid var(--borda);border-radius:var(--raio);margin-bottom:4px">'
      +'<span>'+prIc('clipe','p')+'</span>'
      +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(d.nome)+'</div>'
      +'<div style="font-size:10px;color:var(--cinza-500)">'+esc(d.tipo)+' · '+Math.round(d.size/1024)+'KB</div></div>'
      +'<button onclick="removerDoc('+i+')" style="width:22px;height:22px;border:1px solid var(--pr-erro-borda);border-radius:50%;background:var(--erro-bg);color:var(--erro);cursor:pointer;font-size:11px">'+prIc('x','p')+'</button>'
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
  if(el){el.textContent=file.name+' ('+Math.round(file.size/1024)+'KB)';el.style.color='var(--verde-medio)';}
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
      +'<button class="foto-thumb-del" onclick="removerFoto('+i+')" title="Remover">'+prIc('x','p')+'</button>'
      +'</div>';
  }).join('');
  if(count)count.textContent=fotosNovas.length?fotosNovas.length+'/10 foto(s) selecionada(s)':'';
}

function removerFoto(idx){fotosNovas.splice(idx,1);renderFotosGrid();}
// Fotos ficam em bucket privado (entregas-docs): ampliar sempre pelo link assinado
async function abrirLightbox(url,nome){
  var img=document.getElementById('lb-img');var leg=document.getElementById('lightbox-nome');
  if(img){img.removeAttribute('src');img.alt=nome||'';}
  if(leg)leg.textContent=nome||'';
  prAbrir('lightbox');
  var u=await urlAssinada(url);
  if(img&&document.getElementById('lightbox').classList.contains('aberto'))img.src=u;
}
function fecharLightbox(){
  prFechar('lightbox');
  var img=document.getElementById('lb-img');if(img)img.removeAttribute('src');
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
      var fUp=await db.storage.from('entregas-docs').upload(path,foto,{upsert:true,contentType:foto.type});
      if(fUp.error){
        console.error('Erro upload foto '+(i+1)+':',fUp.error);
        fotosErros++;
      } else {
        var fUrl=db.storage.from('entregas-docs').getPublicUrl(path);
        fotosUrls.push(fUrl.data.publicUrl);
        fotosNomes.push(foto.name);
      }
    }
    if(fotosErros>0) toast(fotosErros+' foto(s) não puderam ser enviadas. Verifique as permissões do storage.','error');
  }

  // Upload dos documentos ANTES de criar qualquer registro no banco — se algum
  // arquivo falhar, a entrega inteira é abortada (nada fica salvo pela metade).
  var docsReais=docsEntrega.filter(function(d){return !d.isGeo&&d.file;});
  var docsUpload=[];
  if(docsReais.length){
    toast('Enviando '+docsReais.length+' documento(s)...','info');
    for(var j=0;j<docsReais.length;j++){
      var doc=docsReais[j];
      var dpath='produtos/'+produtoAtual.id+'/entrega-'+numEntrega+'-'+Date.now()+'_'+doc.file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      var dUp=await db.storage.from('entregas-docs').upload(dpath,doc.file,{upsert:true});
      if(dUp.error){
        toast('Falha ao enviar o documento "'+doc.nome+'": '+dUp.error.message+'. Nenhuma entrega foi registrada — tente novamente.','error',9000);
        return;
      }
      var dUrl=db.storage.from('entregas-docs').getPublicUrl(dpath);
      docsUpload.push({tipo_documento:doc.tipo,arquivo_url:dUrl.data.publicUrl,arquivo_nome:doc.nome,arquivo_tamanho:doc.size});
    }
  }

  var seiSub=(document.getElementById('f-sei-sub')&&document.getElementById('f-sei-sub').value.trim())||null;
  // Insere como 'pendente' — só vira 'em_analise' depois que os documentos/
  // contribuições estiverem confirmados no banco (ver trigger trg_validar_evidencia_entrega).
  var insR=await db.from('contratos_produtos_entregas').insert({
    produto_id:produtoAtual.id,contrato_id:produtoAtual.contrato_id,
    numero_entrega:numEntrega,pct_entregue:pctRest,valor_entregue:valorRest,
    dt_entrega:dtEnt,dt_vencimento_orig:produtoAtual.dt_vencimento,
    situacao:'pendente',tipo_documento:docsEntrega[0]&&docsEntrega[0].tipo||'Relatório Técnico',
    fotos_urls:fotosUrls,fotos_nomes:fotosNomes,fotos_total:fotosUrls.length,
    numero_sei_subprocesso:seiSub,
    criado_por:appState.usuario.id
  }).select().single();
  if(insR.error){toast('Erro: '+insR.error.message,'error');return;}
  var entrega=insR.data;

  if(docsUpload.length){
    var docRows=docsUpload.map(function(d){return Object.assign({entrega_id:entrega.id,inserido_por:appState.usuario.id},d);});
    var docsIns=await db.from('entrega_documentos').insert(docRows);
    if(docsIns.error){
      await db.from('contratos_produtos_entregas').delete().eq('id',entrega.id);
      toast('Erro ao registrar os documentos enviados: '+docsIns.error.message+'. Nenhuma entrega foi registrada — tente novamente.','error',9000);
      return;
    }
  }

  // Salvar contribuições à Matriz de Resultados (status pendente = aguarda confirmação técnica)
  // — precisa acontecer ANTES de marcar a entrega como em_analise, pois entregas
  // só-geolocalização usam a contribuição como evidência de que algo foi de fato entregue.
  var contribs=coletarContribsMatriz();
  if(contribs.length){
    var contribRows=contribs.map(function(c){
      return {produto_id:entrega.id,matriz_item_id:c.matriz_item_id,valor:c.valor,unidade:c.unidade,observacao:c.observacao,status:'pendente',criado_por:appState.usuario.id};
    });
    var cR=await db.from('produto_matriz_contribuicao').insert(contribRows);
    if(cR.error){
      await db.from('contratos_produtos_entregas').delete().eq('id',entrega.id);
      toast('Erro ao registrar contribuições da Matriz de Resultados: '+cR.error.message+'. Nenhuma entrega foi registrada — tente novamente.','error',9000);
      return;
    }
    toast(contribs.length+' contribuição(ões) à Matriz de Resultados registrada(s) — aguarda confirmação técnica.','info');
  }

  // Só agora, com os documentos/contribuições já confirmados no banco, a entrega
  // é enviada para avaliação. O banco recusa essa transição se não houver evidência.
  var updSit=await db.from('contratos_produtos_entregas').update({situacao:'em_analise'}).eq('id',entrega.id);
  if(updSit.error){
    await db.from('contratos_produtos_entregas').delete().eq('id',entrega.id);
    toast('Não foi possível concluir o registro da entrega: '+updSit.error.message,'error',9000);
    return;
  }

  var cpUpd=await db.from('contratos_produtos').update({dt_entrega:dtEnt,situacao:'em_analise',observacoes:obs||produtoAtual.observacoes,atualizado_em:new Date().toISOString()}).eq('id',produtoAtual.id);
  if(cpUpd.error){toast('Aviso: entrega registrada mas não foi possível atualizar o status do produto. Contate o administrador.','error');}

  // Salvar pontos de geolocalização
  var geoDocs=docsEntrega.filter(function(d){return d.isGeo&&d.pontos&&d.pontos.length;});
  if(geoDocs.length){
    // Determinar tipo_atividade a partir do indicador selecionado em "Vincular indicador"
    // Prioridade: 1º indicador vinculado → produto_titulo do item da matriz
    // Fallback: produto_titulo do produto atual
    var tipoAtividade=null;
    if(contribs.length&&matrizItensCache){
      var itemSel=matrizItensCache.find(function(x){return x.id===contribs[0].matriz_item_id;});
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
  enviarEmailProduto(produtoAtual.id,entrega.id,'entregue');
  fecharModal();await selecionarCont(filtCont);await renderStats();
}

var _emitindoDespacho=false;
async function emitirDespacho(tipoBtn){
  if(_emitindoDespacho)return;
  _emitindoDespacho=true;
  try{
  if(tipoBtn)selecionarDecisao(tipoBtn);
  var tipo=tipoBtn||decisaoSel;
  if(!tipo){_emitindoDespacho=false;toast('Selecione uma decisão.','error');return;}
  var despacho=document.getElementById('f-despacho')&&document.getElementById('f-despacho').value&&document.getElementById('f-despacho').value.trim()||'';
  var dtDesp=document.getElementById('f-dt-desp')&&document.getElementById('f-dt-desp').value||'';
  if(!despacho||despacho.length<20){
    var td=document.getElementById('f-despacho');
    if(td){td.style.borderColor='var(--erro)';td.focus();setTimeout(function(){if(td)td.style.borderColor='';},2500);}
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
    var ntUp=await db.storage.from('entregas-docs').upload(ntpath,notaTecnicaFile,{upsert:true});
    if(!ntUp.error){var ntD=db.storage.from('entregas-docs').getPublicUrl(ntpath);ntUrl=ntD.data.publicUrl;ntNome=notaTecnicaFile.name;}
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
    var novaSitProd=novoPct>=100?'aprovado':'entrega_parcial';
    await db.from('contratos_produtos').update({pct_aprovado:novoPct,valor_aprovado:novoVal,situacao:novaSitProd,atualizado_em:new Date().toISOString()}).eq('id',produtoAtual.id);
  } else {
    await db.from('contratos_produtos').update({situacao:'devolvido',atualizado_em:new Date().toISOString()}).eq('id',produtoAtual.id);
  }

  var msgs={aprovacao_total:'Despacho '+numDesp+' emitido. Lançamento gerado no Financeiro.',aprovacao_parcial:'Despacho '+numDesp+' emitido. Lançamento parcial gerado.',devolucao:'Despacho '+numDesp+' emitido. Produto devolvido para correção.'};
  toast(msgs[tipo]||'Despacho emitido.','success',7000);
  var emailEvt=tipo==='devolucao'?'devolvido':tipo==='aprovacao_parcial'?'aprovado_parcial':'aprovado';
  enviarEmailProduto(produtoAtual.id,entregaAtual.id,emailEvt);

  if(notifPendenteId){
    await db.from('notificacoes').update({lida:true,lida_em:new Date().toISOString()}).eq('id',notifPendenteId);
    notifPendenteId=null;
    if(typeof carregarNotificacoes==='function')await carregarNotificacoes();
  }
  if(entregaAtual&&entregaAtual.id){
    // Marcar para TODOS os usuários — evita notificações obsoletas após avaliação
    await db.from('notificacoes').update({lida:true,lida_em:new Date().toISOString()}).eq('entidade_id',entregaAtual.id).eq('lida',false);
    if(typeof carregarNotificacoes==='function')await carregarNotificacoes();
  }
  window.history.replaceState({},'',window.location.pathname);
  fecharModal();await selecionarCont(filtCont);await renderStats();
  }finally{_emitindoDespacho=false;}
}

async function renderHistoricoEmails(prodId){
  var r=await db.from('produto_notif_log')
    .select('*,enviado_por_u:usuarios!produto_notif_log_enviado_por_fkey(nome_completo)')
    .eq('produto_id',prodId)
    .order('criado_em',{ascending:false});
  var logs=r.data||[];
  if(!logs.length)return '';

  var EVT={entregue:''+prIc('entrada','p')+' Entregue',aprovado:''+prIc('check','p')+' Aprovado',aprovado_parcial:''+prIc('parcial','p')+' Aprox. parcial',devolvido:''+prIc('volta','p')+' Devolvido',pago:''+prIc('cartao','p')+' Pago'};

  var rows=logs.map(function(l){
    var lbl=EVT[l.evento]||l.evento;
    var dt=fmtDT(l.criado_em);
    var por=esc((l.enviado_por_u&&l.enviado_por_u.nome_completo)||'—');
    var okTxt=l.total_enviados+' enviado'+(l.total_enviados!==1?'s':'');
    var falhaTxt=l.falhas>0?' <span style="color:var(--erro)">· '+l.falhas+' falha(s)</span>':'';
    return '<tr style="border-bottom:1px solid var(--borda)">'
      +'<td style="padding:5px 8px;font-size:11px;font-weight:600;white-space:nowrap">'+lbl+'</td>'
      +'<td style="padding:5px 8px;font-size:11px;color:var(--cinza-500);white-space:nowrap">'+dt+'</td>'
      +'<td style="padding:5px 8px;font-size:11px;color:var(--ok)">'+okTxt+falhaTxt+'</td>'
      +'<td style="padding:5px 8px;font-size:11px;color:var(--cinza-600)">'+por+'</td>'
      +'</tr>';
  }).join('');

  return '<div style="border-top:1px solid var(--borda);padding-top:14px;margin-top:14px">'
    +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--cinza-500);margin-bottom:10px">'+prIc('email','p')+' Hist&#xF3;rico de notifica&#xE7;&#xF5;es por e-mail</div>'
    +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
    +'<thead><tr style="background:var(--cinza-50);border-bottom:2px solid var(--borda)">'
    +'<th style="padding:5px 8px;font-size:10px;font-weight:700;color:var(--cinza-600);text-align:left;text-transform:uppercase;letter-spacing:.04em">Evento</th>'
    +'<th style="padding:5px 8px;font-size:10px;font-weight:700;color:var(--cinza-600);text-align:left;text-transform:uppercase;letter-spacing:.04em">Data</th>'
    +'<th style="padding:5px 8px;font-size:10px;font-weight:700;color:var(--cinza-600);text-align:left;text-transform:uppercase;letter-spacing:.04em">Enviados</th>'
    +'<th style="padding:5px 8px;font-size:10px;font-weight:700;color:var(--cinza-600);text-align:left;text-transform:uppercase;letter-spacing:.04em">Por</th>'
    +'</tr></thead>'
    +'<tbody>'+rows+'</tbody>'
    +'</table></div></div>';
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
  prFechar('modal-prod');
  produtoAtual=null;entregaAtual=null;entregaArquivo=null;decisaoSel='';
  docsEntrega=[];notaTecnicaFile=null;fotosNovas=[];geoCSVPontos=[];
}
// ── Janelas: foco no primeiro campo, Esc fecha só a de cima, Tab preso, foco volta ao sair ──
var PR_FOCAVEIS='a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]):not([type=file]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
var prPilha=[];
function prAbrir(id){
  var el=document.getElementById(id); if(!el)return;
  el.classList.add('aberto');
  if(!prPilha.some(function(x){return x.el===el;}))prPilha.push({el:el,volta:document.activeElement});
  requestAnimationFrame(function(){
    var alvo=el.querySelector('.modal-body :is(input:not([readonly]):not([type=checkbox]):not([type=radio]):not([type=file]),select,textarea)')||el.querySelector('.modal-close,#lightbox-close')||el.querySelector(PR_FOCAVEIS);
    if(alvo)alvo.focus({preventScroll:true});
  });
}
function prFechar(id){
  var el=document.getElementById(id); if(!el)return;
  el.classList.remove('aberto');
  var i=prPilha.findIndex(function(x){return x.el===el;}); if(i<0)return;
  var volta=prPilha.splice(i,1)[0].volta;
  if(volta&&document.contains(volta))volta.focus({preventScroll:true});
}
var PR_FECHAR={'lightbox':function(){fecharLightbox();},'modal-geo-csv':function(){fecharModalGeoCsv();},'modal-matriz-edit':function(){fecharModalMatrizEdit();},
  'modal-anexo-edit':function(){fecharModalAnexoEdit();},'modal-prod':function(){fecharModal();}};
document.addEventListener('keydown',function(e){
  var topo=prPilha.length?prPilha[prPilha.length-1].el:null; if(!topo)return;
  if(e.key==='Escape'){e.preventDefault();(PR_FECHAR[topo.id]||function(){prFechar(topo.id);})();}
  else if(e.key==='Tab'){
    var f=[].slice.call(topo.querySelectorAll(PR_FOCAVEIS)).filter(function(x){return x.offsetParent!==null;});
    if(!f.length)return;
    var pri=f[0],ult=f[f.length-1];
    if(!topo.contains(document.activeElement)){e.preventDefault();pri.focus();}
    else if(e.shiftKey&&document.activeElement===pri){e.preventDefault();ult.focus();}
    else if(!e.shiftKey&&document.activeElement===ult){e.preventDefault();pri.focus();}
  }
});

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
  prAbrir('modal-geo-csv');
}

function fecharModalGeoCsv(){
  prFechar('modal-geo-csv');
  _geoCsvLinhas=[];
}

function renderModalGeoCsvEtapa1(){
  var body=document.getElementById('geo-csv-body');
  var footer=document.getElementById('geo-csv-footer');
  if(!body||!footer)return;

  body.innerHTML=''
    +'<div style="background:var(--info-bg);border:1px solid var(--info-borda);border-radius:var(--raio);padding:12px 14px;margin-bottom:14px">'
    +'<div style="font-size:12px;font-weight:600;color:var(--info-txt);margin-bottom:4px">'+prIc('despacho','p')+' Como usar</div>'
    +'<ol style="margin:0;padding-left:18px;font-size:12px;color:var(--info-txt);line-height:1.7">'
    +'<li>Baixe o template e preencha <strong>apenas as abas que se aplicam</strong> ao produto (<strong>Pontos</strong>, <strong>Polígono</strong> ou <strong>Trilha</strong>).</li>'
    +'<li><strong>Apague as linhas de exemplo</strong> das abas que não for usar — caso contrário elas serão importadas como dados reais.</li>'
    +'<li>As colunas <strong>lat</strong> e <strong>lng</strong> aceitam vírgula ou ponto decimal (<code>-9,972</code> ou <code>-9.972</code>). Também é possível <strong>colar a coordenada completa do Google Maps</strong> (<code>-10.042, -67.852</code>) direto na coluna <strong>lat</strong>, deixando <strong>lng</strong> vazia.</li>'
    +'<li><strong>Importe o próprio arquivo .xlsx</strong> — não é necessário converter para CSV.</li>'
    +'</ol>'
    +'</div>'
    +'<div style="display:flex;align-items:flex-start;gap:8px;background:var(--alerta-bg);border:1px solid var(--alerta-borda);border-radius:var(--raio);padding:10px 12px;margin-bottom:10px">'
    +'<span style="font-size:15px;flex-shrink:0">'+prIc('alerta','p')+'</span>'
    +'<span style="font-size:11px;color:var(--alerta-txt);line-height:1.5">Cada produto deve ter sua própria planilha. Se o produto entregue for apenas pontos, use só a aba <strong>Pontos</strong> e apague os exemplos das demais. O sistema ignora automaticamente linhas cujo nome começa com <strong>"Ex:"</strong>.</span>'
    +'</div>'
    +'<button class="btn btn-secondary btn-sm" style="margin-bottom:14px" onclick="baixarTemplateGeoExcel()">'+prIc('entrada','p')+' Baixar template Excel (.xlsx)</button>'
    +'<div id="geo-drop-area" style="border:2px dashed var(--borda-forte);border-radius:var(--raio);padding:32px;text-align:center;cursor:pointer;transition:all .15s;background:var(--cinza-50)"'
    +' onclick="document.getElementById(\'geo-xlsx-input\').click()"'
    +' ondragover="event.preventDefault();this.style.borderColor=\'var(--verde-medio)\';this.style.background=\'var(--verde-bg)\'"'
    +' ondragleave="this.style.borderColor=\'\';this.style.background=\'var(--cinza-50)\'"'
    +' ondrop="event.preventDefault();this.style.borderColor=\'\';this.style.background=\'var(--cinza-50)\';onGeoDropXlsx(event.dataTransfer.files[0])">'
    +'<div style="font-size:32px;margin-bottom:8px">'+prIc('pasta','p')+'</div>'
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
    +'<div style="flex:1;background:var(--ok-bg);border:1px solid var(--pr-ok-borda);border-radius:var(--raio);padding:10px 12px;text-align:center">'
    +'<div style="font-size:20px;font-weight:700;color:var(--ok-txt)">'+nPontos+'</div>'
    +'<div style="font-size:11px;color:var(--ok-txt)">pontos</div></div>'
    +'<div style="flex:1;background:var(--info-bg);border:1px solid var(--info-borda);border-radius:var(--raio);padding:10px 12px;text-align:center">'
    +'<div style="font-size:20px;font-weight:700;color:var(--info)">'+gruposPol+'</div>'
    +'<div style="font-size:11px;color:var(--info-txt)">polígonos</div></div>'
    +'<div style="flex:1;background:var(--alerta-bg);border:1px solid var(--alerta-borda);border-radius:var(--raio);padding:10px 12px;text-align:center">'
    +'<div style="font-size:20px;font-weight:700;color:var(--alerta-txt)">'+gruposTrilha+'</div>'
    +'<div style="font-size:11px;color:var(--alerta-txt)">trilhas</div></div>'
    +(invalidas.length?'<div style="flex:1;background:var(--erro-bg);border:1px solid var(--pr-erro-borda);border-radius:var(--raio);padding:10px 12px;text-align:center">'
    +'<div style="font-size:20px;font-weight:700;color:var(--erro)">'+invalidas.length+'</div>'
    +'<div style="font-size:11px;color:var(--erro)">erros</div></div>':'')
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
      var bg=gt==='poligono'?'background:var(--info-bg);color:var(--info-txt)':gt==='trilha'?'background:var(--alerta-bg);color:var(--alerta-txt)':'background:var(--ok-bg);color:var(--ok-txt)';
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
    +(invalidas.length?'<div style="font-size:11px;color:var(--erro);background:var(--erro-bg);border:1px solid var(--pr-erro-borda);border-radius:var(--raio);padding:8px 10px;margin-bottom:12px">'+prIc('alerta','p')+' Linhas ignoradas: '+invalidas.map(function(x){return (x.sheet?x.sheet+' l.':'l.')+x.linha;}).join(', ')+'</div>':'')
    +tabelaHtml
    +'<p style="font-size:11px;color:var(--cinza-500);margin:8px 0 0">As geometrias serão salvas no mapa após o envio da entrega. Você poderá visualizá-las em <strong>Mapa de Entregas</strong>.</p>';

  var partes=[nPontos?nPontos+' ponto(s)':'',gruposPol?gruposPol+' polígono(s)':'',gruposTrilha?gruposTrilha+' trilha(s)':''].filter(Boolean).join(' + ');
  footer.innerHTML=''
    +'<button class="btn btn-secondary" onclick="renderModalGeoCsvEtapa1()">'+prIc('voltar','p')+' Voltar</button>'
    +(validas.length
      ? '<button class="btn btn-primary" onclick="confirmarGeoCsv()">'+prIc('check','p')+' Confirmar '+partes+'</button>'
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

// ── Editar Contribuição à Matriz (super_admin — produtos já aprovados/pagos) ──

var _meProdutoId=null;
var _meEntregaId=null;

async function abrirModalMatrizEdit(prodId){
  if(appState.perfil!=='super_admin'){toast('Apenas super_admin pode editar a matriz de um produto já avaliado.','error');return;}
  _meProdutoId=prodId;
  _meEntregaId=null;
  await carregarMatrizItens();
  document.getElementById('me-body').innerHTML='<div style="text-align:center;padding:24px"><div style="animation:spin .7s linear infinite;width:22px;height:22px;border:3px solid var(--lin-forte);border-top-color:var(--pri-600);border-radius:50%;margin:0 auto 8px"></div>Carregando...</div>';
  prAbrir('modal-matriz-edit');

  // produto_matriz_contribuicao.produto_id referencia contratos_produtos_entregas.id
  // (não contratos_produtos.id) — usa a última entrega do produto, mesmo critério
  // usado pelo painel de detalhe em financeiro.html (listaEntregas.slice(-1)[0]).
  var entR=await db.from('contratos_produtos_entregas').select('id,numero_entrega,situacao').eq('produto_id',prodId).order('numero_entrega',{ascending:false});
  var entregas=entR.data||[];
  var entregaAlvo=entregas[0]||null;
  if(!entregaAlvo){
    document.getElementById('me-body').innerHTML='<div style="font-size:12px;color:var(--cinza-500);padding:12px 0">Este produto não possui nenhuma entrega registrada.</div>';
    return;
  }
  _meEntregaId=entregaAlvo.id;
  await renderModalMatrizEdit();
}

function fecharModalMatrizEdit(){
  prFechar('modal-matriz-edit');
  _meProdutoId=null;_meEntregaId=null;
}

async function renderModalMatrizEdit(){
  if(!_meProdutoId||!_meEntregaId)return;
  var [prodR,contribsR]=await Promise.all([
    db.from('contratos_produtos').select('numero_produto,descricao,situacao').eq('id',_meProdutoId).single(),
    db.from('produto_matriz_contribuicao').select('*,matriz_itens(resultado,produto_codigo,produto_titulo,indicador,unidade)').eq('produto_id',_meEntregaId).neq('status','cancelado').order('criado_em')
  ]);
  var p=prodR.data||{};
  var contribs=contribsR.data||[];
  document.getElementById('me-sub').textContent='Produto '+(p.numero_produto||'')+' — '+(sitLbl(p.situacao)||'');

  var html='<div style="background:var(--alerta-bg);border:1px solid var(--alerta-borda);border-radius:var(--raio);padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--alerta-txt);line-height:1.5">'
    +''+prIc('alerta','p')+' Este produto já foi avaliado/pago. Alterações aqui corrigem vínculos com a Matriz de Resultados esquecidos na entrega original — não afetam o valor pago nem a situação do produto.'
    +'</div>';

  html+='<div id="me-lista" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">';
  if(!contribs.length){
    html+='<div style="font-size:12px;color:var(--cinza-400);padding:6px 0">Nenhum indicador vinculado ainda.</div>';
  } else {
    contribs.forEach(function(c){
      var mi=c.matriz_itens||{};
      html+='<div style="display:flex;align-items:center;gap:8px;background:var(--cinza-50);border:1px solid var(--borda);border-radius:var(--raio);padding:8px 10px" data-contrib-id="'+c.id+'">'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:10px;font-family:var(--font-mono);font-weight:700;color:var(--ia)">R'+mi.resultado+' · '+esc(mi.produto_codigo||'')+'</div>'
        +'<div style="font-size:12px;font-weight:600;color:var(--cinza-900);line-height:1.3">'+esc(mi.indicador||'')+'</div>'
        +'</div>'
        +'<input class="form-control" type="number" step="0.01" min="0" value="'+parseFloat(c.valor||0)+'" style="width:100px;height:30px;font-size:12px" id="me-val-'+c.id+'">'
        +'<button class="btn btn-sm btn-secondary" style="height:30px" onclick="salvarValorContribMatriz(\''+c.id+'\')">Salvar</button>'
        +'<button style="border:none;background:none;cursor:pointer;color:var(--cinza-400);font-size:16px;padding:0 4px" onclick="removerContribMatriz(\''+c.id+'\')" title="Remover vínculo">'+prIc('x','p')+'</button>'
        +'</div>';
    });
  }
  html+='</div>';

  html+='<div style="border-top:1px solid var(--borda);padding-top:12px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--cinza-700);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">+ Vincular novo indicador</div>'
    +'<div style="display:flex;gap:6px;align-items:center">'
    +'<select class="form-control" id="me-novo-ind" style="flex:2;height:32px;font-size:11px">'
    +'<option value="">Selecione o indicador...</option>'
    +(matrizItensCache||[]).map(function(i){
      return '<option value="'+i.id+'">[R'+i.resultado+'/'+i.produto_codigo+'] '+esc((i.indicador||'').substring(0,60))+(i.indicador&&i.indicador.length>60?'…':'')+(i.unidade?' ('+i.unidade+')':'')+'</option>';
    }).join('')
    +'</select>'
    +'<input class="form-control" type="number" step="0.01" min="0" id="me-novo-val" placeholder="Valor" style="width:100px;height:32px;font-size:12px">'
    +'<button class="btn btn-sm btn-primary" style="height:32px" onclick="adicionarContribMatrizExistente()">Adicionar</button>'
    +'</div></div>';

  document.getElementById('me-body').innerHTML=html;
}

async function salvarValorContribMatriz(contribId){
  var el=document.getElementById('me-val-'+contribId);
  if(!el)return;
  var valor=parseFloat(el.value);
  if(isNaN(valor)||valor<0){toast('Informe um valor válido.','error');return;}
  var r=await db.from('produto_matriz_contribuicao').update({valor:valor}).eq('id',contribId);
  if(r.error){toast('Erro ao salvar: '+r.error.message,'error');return;}
  toast('Valor atualizado.','success');
  await renderModalMatrizEdit();
}

async function removerContribMatriz(contribId){
  if(!confirm('Remover este vínculo com a Matriz de Resultados?'))return;
  var r=await db.from('produto_matriz_contribuicao').update({status:'cancelado'}).eq('id',contribId);
  if(r.error){toast('Erro ao remover: '+r.error.message,'error');return;}
  toast('Vínculo removido.','success');
  await renderModalMatrizEdit();
}

async function adicionarContribMatrizExistente(){
  var sel=document.getElementById('me-novo-ind');
  var valEl=document.getElementById('me-novo-val');
  if(!sel||!sel.value){toast('Selecione um indicador.','error');return;}
  var valor=parseFloat(valEl&&valEl.value);
  if(isNaN(valor)||valor<=0){toast('Informe um valor válido.','error');return;}
  var ind=(matrizItensCache||[]).find(function(x){return x.id===sel.value;});
  var r=await db.from('produto_matriz_contribuicao').insert({
    produto_id:_meEntregaId,
    matriz_item_id:sel.value,
    valor:valor,
    unidade:ind&&ind.unidade||null,
    status:'confirmado',
    confirmado_por:appState.usuario.id,
    confirmado_em:new Date().toISOString(),
    criado_por:appState.usuario.id,
    observacao:'Vínculo adicionado retroativamente por '+(appState.usuario&&appState.usuario.nome_completo||'super_admin')
  });
  if(r.error){toast('Erro ao adicionar: '+r.error.message,'error');return;}
  toast('Indicador vinculado.','success');
  await renderModalMatrizEdit();
}

// ── Anexar Documento (super_admin — produtos já aprovados/pagos) ──

var _aeProdutoId=null;
var _aeEntregaId=null;
var _aeNumeroEntrega=null;
var _aeArquivo=null;

async function abrirModalAnexoEdit(prodId){
  if(appState.perfil!=='super_admin'){toast('Apenas super_admin pode anexar documento a um produto já avaliado.','error');return;}
  _aeProdutoId=prodId;_aeEntregaId=null;_aeArquivo=null;
  document.getElementById('ae-body').innerHTML='<div style="text-align:center;padding:24px"><div style="animation:spin .7s linear infinite;width:22px;height:22px;border:3px solid var(--lin-forte);border-top-color:var(--pri-600);border-radius:50%;margin:0 auto 8px"></div>Carregando...</div>';
  prAbrir('modal-anexo-edit');

  var [prodR,entR]=await Promise.all([
    db.from('contratos_produtos').select('numero_produto,descricao,situacao').eq('id',prodId).single(),
    db.from('contratos_produtos_entregas').select('id,numero_entrega,situacao').eq('produto_id',prodId).order('numero_entrega',{ascending:false})
  ]);
  var p=prodR.data||{};
  var entregas=entR.data||[];
  var entregaAlvo=entregas[0]||null;
  if(!entregaAlvo){
    document.getElementById('ae-body').innerHTML='<div style="font-size:12px;color:var(--cinza-500);padding:12px 0">Este produto não possui nenhuma entrega registrada.</div>';
    return;
  }
  _aeEntregaId=entregaAlvo.id;
  _aeNumeroEntrega=entregaAlvo.numero_entrega;
  document.getElementById('ae-sub').textContent='Produto '+(p.numero_produto||'')+' — '+(sitLbl(p.situacao)||'')+' · Entrega '+entregaAlvo.numero_entrega;
  await renderModalAnexoEdit();
}

function fecharModalAnexoEdit(){
  prFechar('modal-anexo-edit');
  _aeProdutoId=null;_aeEntregaId=null;_aeArquivo=null;
}

async function renderModalAnexoEdit(){
  if(!_aeEntregaId)return;
  var docsR=await db.from('entrega_documentos').select('*').eq('entrega_id',_aeEntregaId).order('inserido_em');
  var docs=docsR.data||[];

  var html='<div style="background:var(--alerta-bg);border:1px solid var(--alerta-borda);border-radius:var(--raio);padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--alerta-txt);line-height:1.5">'
    +''+prIc('alerta','p')+' Este produto já foi avaliado/pago. O documento é anexado à entrega '+_aeNumeroEntrega+' (a mesma exibida no painel do Financeiro) — não altera o valor pago nem a situação do produto.'
    +'</div>';

  html+='<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">';
  if(!docs.length){
    html+='<div style="font-size:12px;color:var(--cinza-400);padding:6px 0">Nenhum documento anexado a esta entrega ainda.</div>';
  } else {
    docs.forEach(function(d){
      html+='<div style="display:flex;align-items:center;gap:8px;background:var(--cinza-50);border:1px solid var(--borda);border-radius:var(--raio);padding:8px 10px">'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:12px;font-weight:600;color:var(--cinza-900);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(d.arquivo_nome||'Documento')+'</div>'
        +'<div style="font-size:10px;color:var(--cinza-500)">'+esc(d.tipo_documento||'')+'</div>'
        +'</div>'
        +(d.arquivo_url?'<button class="btn btn-sm btn-secondary" style="flex-shrink:0" onclick="abrirArquivo(\''+esc(d.arquivo_url)+'\')">'+prIc('olho','p')+' Abrir</button>':'')
        +'</div>';
    });
  }
  html+='</div>';

  html+='<div style="border-top:1px solid var(--borda);padding-top:12px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--cinza-700);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">+ Anexar novo documento</div>'
    +'<div class="form-group" style="margin-bottom:8px">'
    +'<select class="form-control" id="ae-tipo-doc" style="height:32px;font-size:12px">'
    +TIPOS_DOC.filter(function(t){return t!==TIPO_GEO;}).map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('')
    +'</select>'
    +'</div>'
    +'<div style="display:flex;gap:8px;align-items:center">'
    +'<input type="file" id="ae-inp-arq" style="flex:1;font-size:12px" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.jpg,.png">'
    +'<button class="btn btn-sm btn-primary" id="ae-btn-enviar" onclick="enviarAnexoAdmin()">Enviar</button>'
    +'</div>'
    +'<div style="font-size:10px;color:var(--cinza-400);margin-top:4px">PDF, Word, Excel, ZIP, Imagem · até 20MB</div>'
    +'</div>';

  document.getElementById('ae-body').innerHTML=html;
}

async function enviarAnexoAdmin(){
  var tipo=document.getElementById('ae-tipo-doc')&&document.getElementById('ae-tipo-doc').value;
  var inp=document.getElementById('ae-inp-arq');
  var file=inp&&inp.files&&inp.files[0];
  if(!file){toast('Selecione um arquivo.','error');return;}
  if(file.size>20*1024*1024){toast('Arquivo maior que 20MB.','error');return;}

  var btn=document.getElementById('ae-btn-enviar');
  if(btn){btn.disabled=true;btn.textContent='Enviando...';}

  var path='produtos/'+_aeProdutoId+'/entrega-'+_aeNumeroEntrega+'-'+Date.now()+'_'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  var up=await db.storage.from('entregas-docs').upload(path,file,{upsert:true});
  if(up.error){
    toast('Erro ao enviar arquivo: '+up.error.message,'error');
    if(btn){btn.disabled=false;btn.textContent='Enviar';}
    return;
  }
  var urlR=db.storage.from('entregas-docs').getPublicUrl(path);
  var ins=await db.from('entrega_documentos').insert({
    entrega_id:_aeEntregaId,
    tipo_documento:tipo,
    arquivo_url:urlR.data.publicUrl,
    arquivo_nome:file.name,
    arquivo_tamanho:file.size,
    inserido_por:appState.usuario.id
  });
  if(ins.error){
    toast('Arquivo enviado, mas houve erro ao registrar: '+ins.error.message,'error');
    if(btn){btn.disabled=false;btn.textContent='Enviar';}
    return;
  }
  toast('Documento anexado.','success');
  await renderModalAnexoEdit();
}
