// ═══════════════════════════════════════════════════════════════════════
// remanejamentos-ajuda.js — guia "Como funciona" e botões "?" do Remanejamento
// ═══════════════════════════════════════════════════════════════════════
// Só texto. A regra de verdade mora no banco (docs/remanejamento/plano.md);
// se uma regra mudar lá, este texto muda junto.
//   · remQ('chave')      → botão "?" ao lado de um campo/coluna
//   · remAjuda('chave')  → abre a explicação curta (com atalho para o guia)
//   · remGuiaHTML()      → aba "Como funciona" (guia completo + perguntas)
// Cada verbete aponta para uma seção do guia (campo `secao`).

const REM_AJUDA = {
  // ── Saldos ───────────────────────────────────────────────────────────
  remanejavel: { t: 'Remanejável', secao: 'saldos', h: `
    Quanto a atividade pode <b>ceder hoje</b> a outra atividade. É o saldo das fontes depois de descontar
    tudo o que já está comprometido (TDRs, viagens, contrato acima do TDR) e o que está <b>reservado</b> por
    pedidos de remanejamento ainda em aprovação. Nunca fica negativo: atividade com déficit simplesmente não tem o que ceder.` },
  reservado: { t: 'Reservado', secao: 'saldos', h: `
    Valor de uma fonte que está preso a um pedido de remanejamento <b>em aprovação</b>. Enquanto a cadeia de
    assinaturas não termina, ninguém mais usa esse dinheiro (nem outro pedido, nem um TDR novo). Se o pedido for
    recusado ou cancelado, a reserva volta a ser saldo livre na hora.` },
  deficit: { t: 'Déficit', secao: 'saldos', h: `
    A atividade tem mais compromissos do que orçamento. Os déficits que já existiam antes do razão
    <b>não são regularizados automaticamente</b>: são acompanhados. Enquanto houver déficit, a atividade não cede
    recurso, não aceita TDR novo e contrato acima do TDR fica travado até a cobertura.` },
  orcamento_vigente: { t: 'Orçamento vigente', secao: 'saldos', h: `
    Dotação original da atividade <b>mais</b> o que ela recebeu e <b>menos</b> o que cedeu em remanejamentos
    efetivados (e revisões formais da UNESCO). Ninguém edita este número à mão — nem o super admin: ele é a soma
    dos lançamentos do razão. A dotação original aparece embaixo quando é diferente.` },
  comprometido: { t: 'Comprometido', secao: 'saldos', h: `
    Tudo o que já tem destino na atividade: o <b>valor planejado</b> de cada TDR não cancelado, as viagens
    (execução direta UNESCO, que consomem o TDR guarda-chuva) e o valor que um contrato <b>passou do TDR</b>.
    É o mesmo número da Visão Geral.` },
  saldo: { t: 'Saldo', secao: 'saldos', h: `
    Orçamento vigente − comprometido + liberações (economia de contratação e encerramento de contrato).
    Negativo = déficit. Para saber quanto dá para remanejar, olhe a coluna <b>Remanejável</b>, que ainda desconta as reservas.` },
  fontes: { t: 'Fontes do saldo (procedência)', secao: 'saldos', h: `
    Cada dólar da atividade tem uma origem: <b>dotação original</b>, <b>economia de contratação</b>,
    <b>encerramento de contrato</b> ou <b>remanejamento recebido</b> (de qual atividade e de qual fonte dela).
    Os compromissos consomem primeiro a dotação original e depois as demais fontes, na ordem em que entraram.
    Assim dá para dizer exatamente de onde saiu cada centavo remanejado.` },
  consumido: { t: 'Consumido / Disponível / Livre', secao: 'saldos', h: `
    <b>Consumido</b>: parte da fonte já usada pelos compromissos. <b>Disponível</b>: o que sobra dela.
    <b>Livre</b>: disponível menos o que está reservado por pedido em aprovação — é o máximo que essa fonte pode ceder.` },
  extrato: { t: 'Extrato (A4)', secao: 'relatorios', h: `
    Documento da atividade para prestação de contas: todos os créditos com a procedência, os compromissos de
    hoje e os remanejamentos. Ele confere sozinho que <b>créditos − débitos = saldo</b> e avisa se não fechar.` },

  // ── Contrato e cobertura ─────────────────────────────────────────────
  cobertura: { t: 'Contrato aguardando cobertura', secao: 'cobertura', h: `
    O TDR já reservou o valor planejado. Se o contrato (ou um aditivo) passar do valor do TDR e essa
    diferença não couber no saldo livre da atividade, o contrato fica <b>travado</b>: sem produtos, sem
    pagamentos e sem PDF assinado. A coordenação, os responsáveis da atividade e quem cadastrou o contrato
    recebem aviso no sino e por e-mail quando ele trava e quando libera. Ele <b>libera sozinho</b> quando o saldo cobrir — por um remanejamento de
    cobertura, uma economia, um encerramento ou a redução do próprio contrato. Enquanto isso, só dá para reduzir o valor ou cancelar.` },
  falta_cobrir: { t: 'Falta cobrir', secao: 'cobertura', h: `
    Quanto falta de saldo livre para liberar o contrato. É o valor que o botão "Pedir cobertura" já preenche como destino do pedido.` },
  tdr_compromete: { t: 'O TDR compromete o orçamento', secao: 'cobertura', h: `
    Um TDR só é cadastrado (ou aumentado) se o valor couber no saldo livre da atividade. O contrato que
    nasce dele não pede nada enquanto ficar dentro do valor do TDR.` },

  // ── Novo pedido ──────────────────────────────────────────────────────
  pedido_origem: { t: '1. De onde sai o recurso', secao: 'pedido', h: `
    Escolha <b>quais fontes</b> cedem e quanto. Só aparecem fontes com saldo realmente livre. Uma atividade pode ceder de
    mais de uma fonte; várias atividades podem ceder no mesmo pedido (cada uma terá a sua etapa de liberação).` },
  pedido_ceder: { t: 'Ceder (US$)', secao: 'pedido', h: `
    Quanto desta fonte vai para o pedido. Não pode passar do valor <b>Livre</b> da fonte. Ao enviar o pedido, esse valor fica reservado.` },
  pedido_destino: { t: '2. Para onde vai', secao: 'pedido', h: `
    As atividades que recebem. A soma dos destinos tem de ser igual ao total cedido (a diferença precisa ficar
    em zero). A mesma atividade não pode ceder e receber no mesmo pedido.` },
  pedido_justificativa: { t: '3. Justificativa', secao: 'pedido', h: `
    Obrigatória (mínimo 15 caracteres). Explique por que remanejar, o que deixa de ser feito na origem e o que o
    recurso viabiliza no destino. Ela entra no documento assinado e no relatório A4.` },
  rascunho: { t: 'Rascunho', secao: 'pedido', h: `
    Salvar o rascunho <b>não</b> reserva saldo e não avisa ninguém. Pode ser editado à vontade. O pedido só entra
    na cadeia quando o titular da coordenação o <b>envia com a senha</b>.` },

  // ── Cadeia ───────────────────────────────────────────────────────────
  cadeia: { t: 'Cadeia de aprovação', secao: 'cadeia', h: `
    Cinco etapas, <b>nessa ordem</b>, cada uma assinada por uma pessoa com a própria senha:
    1 coordenação solicitante → 2 responsável de cada atividade que cede → 3 UNESCO (financeiro) → 4 diretor →
    5 secretário. Só depois da última assinatura o valor muda no orçamento. Não há substituto: se o titular estiver ausente, o pedido espera.` },
  minha_vez: { t: 'Aguardando minha análise', secao: 'cadeia', h: `
    Pedidos em que a etapa atual é sua. Você só recebe e-mail quando a etapa anterior aprova (ou quando a seguinte devolve para você).` },
  hash: { t: 'Impressão digital (SHA-256)', secao: 'cadeia', h: `
    Código calculado a partir do conteúdo do pedido (itens, fontes, justificativa, versão). Cada assinatura grava
    o código que a pessoa viu. Se o pedido mudar, o código muda e as assinaturas anteriores deixam de valer —
    assim ninguém assina uma coisa e efetiva outra.` },
  senha: { t: 'Por que pedir a senha?', secao: 'cadeia', h: `
    A senha de acesso é reconferida <b>no servidor</b> a cada assinatura e não é guardada. Ela prova que foi
    você quem assinou. Cinco erros seguidos bloqueiam a assinatura por 30 minutos.` },
  decisoes: { t: 'Aprovar, devolver, recusar, cancelar', secao: 'cadeia', h: `
    <b>Aprovar</b>: passa para a próxima etapa (e só ela é avisada). <b>Devolver</b> (com motivo): volta UMA etapa,
    só a anterior é avisada. <b>Recusar</b> (com motivo): encerra o pedido e libera a reserva.
    <b>Cancelar</b>: só o solicitante, no rascunho ou quando o pedido voltou para ele.` },
  signatarios: { t: 'Signatários', secao: 'cadeia', h: `
    Cada cargo tem um titular nominal, designado pelo super admin com o ato (portaria/SEI). A etapa 2 é do
    <b>responsável</b> cadastrado na atividade que cede (não do substituto). A mesma pessoa não assina duas etapas do mesmo pedido
    (a única exceção é o mesmo responsável liberar duas atividades de origem).` },

  // ── Estorno ──────────────────────────────────────────────────────────
  estorno: { t: 'Estorno de remanejamento', secao: 'estorno', h: `
    Desfaz um remanejamento efetivado devolvendo <b>exatamente</b> o que foi recebido, para as <b>mesmas fontes</b>
    de onde saiu. É um pedido novo que passa pela <b>mesma cadeia</b>, mas a etapa 2 é assinada pelos responsáveis
    das atividades que <b>devolvem</b> (as que receberam). Só é possível se o destino ainda não usou nem repassou o valor.` },
}

const REM_FAQ = [
  ['Todos os que assinaram o remanejamento também assinam o estorno?',
   `Não exatamente. O estorno passa pela <b>mesma cadeia de cargos</b> (coordenação solicitante, UNESCO, diretor e
    secretário — os titulares <b>vigentes</b> no dia do estorno, que podem ser outras pessoas se houve troca). O que
    muda é a etapa 2: no remanejamento ela é dos responsáveis das atividades que <b>cederam</b>; no estorno é dos
    responsáveis das atividades que <b>devolvem</b> (as que receberam). Quem cedeu originalmente não assina o estorno,
    porque recebe o dinheiro de volta.`],
  ['Posso estornar só uma parte?',
   `Não. O estorno devolve o remanejamento inteiro. Para devolver parte, faça um remanejamento novo no sentido contrário.`],
  ['O destino já usou parte do dinheiro. Ainda dá para estornar?',
   `Não. O sistema só aceita o estorno se o valor recebido estiver inteiro e livre. Libere o compromisso no destino
    (reduzir ou cancelar o TDR, por exemplo) ou faça um remanejamento novo com o que sobrou.`],
  ['Dá para estornar um estorno?', `Não. Para desfazer um estorno, faça um remanejamento novo.`],
  ['Por que não consigo ceder de uma atividade que tem saldo na Visão Geral?',
   `Porque parte do saldo pode estar reservada por um pedido em aprovação, ou a atividade tem um TDR sem valor em
    US$ (o débito fica desconhecido e o sistema bloqueia a cessão). Veja a coluna Reservado e as fontes da atividade.`],
  ['O titular está de férias. Alguém assina por ele?',
   `Não. A cadeia é nominal e sem substituto: o pedido espera. Se a ausência for longa, o super admin pode designar
    outro titular (com o ato), e as assinaturas já dadas continuam válidas.`],
  ['Editei o pedido depois de devolvido. O que acontece com as assinaturas?',
   `Editar abre uma nova versão: o documento muda, a impressão digital muda e todas as assinaturas anteriores deixam
    de valer. A cadeia recomeça do início.`],
  ['Recusei por engano. Dá para voltar?', `Não. Recusa encerra o pedido. A coordenação monta um pedido novo.`],
  ['Não recebi o e-mail. Perdi a vez?',
   `Não. A fila "Aguardando minha análise" e o sino mostram o pedido de qualquer forma. E-mails que falham são reenviados a cada 15 minutos.`],
  ['O contrato ficou travado. Preciso pedir remanejamento?',
   `Não necessariamente. Ele libera sozinho quando o saldo da atividade cobrir a diferença — por economia,
    encerramento de contrato, redução do próprio contrato ou de um TDR. Se não houver saída na atividade, use
    "Pedir cobertura" em Saldos por resultado.`],
  ['Quem pode montar um pedido?', `Coordenação e super admin montam e editam o rascunho. Quem <b>envia</b> para a cadeia é o titular da coordenação solicitante.`],
  ['Quem pode ver os pedidos?', `Todos os usuários com acesso à plataforma veem saldos, pedidos, cadeia e histórico. Assinar, só quem está na etapa.`],
]

// ── Botão "?" e janela curta ───────────────────────────────────────────
function remQ(k) {
  const a = REM_AJUDA[k]
  if (!a) return ''
  return `<button type="button" class="rm-q" title="O que é: ${esc(a.t)}" aria-label="Ajuda: ${esc(a.t)}"
    onclick="event.stopPropagation();event.preventDefault();remAjuda('${k}')">?</button>`
}
function remAjuda(k) {
  const a = REM_AJUDA[k]
  if (!a) return
  let el = document.getElementById('rm-ajuda-pop')
  if (!el) {
    el = document.createElement('div')
    el.id = 'rm-ajuda-pop'
    el.className = 'modal-overlay'
    el.onclick = e => { if (e.target === el) remAjudaFechar() }
    document.body.appendChild(el)
  }
  el.innerHTML = `<div class="modal" style="max-width:480px;width:100%" role="dialog" aria-modal="true" aria-labelledby="rm-ajuda-t">
    <div class="modal-header"><div class="modal-title" id="rm-ajuda-t">${a.t}</div>
      <button class="modal-close" onclick="remAjudaFechar()" aria-label="Fechar">&#x2715;</button></div>
    <div class="modal-body" style="font-size:13.5px;line-height:1.6;color:var(--cinza-700)">${a.h}</div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="remAjudaFechar()">Entendi</button>
      <button class="btn btn-secondary" onclick="remAjudaFechar();remIrGuia('${a.secao}')">Ver no guia completo</button></div></div>`
  el.classList.add('aberto')
}
function remAjudaFechar() {
  document.getElementById('rm-ajuda-pop')?.classList.remove('aberto')
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') remAjudaFechar() })

function remIrGuia(secao) {
  // fecha o pedido aberto, se houver, e vai à seção do guia
  if (document.getElementById('rm-modal-pedido')?.classList.contains('aberto')) remFecharPedido()
  if (document.getElementById('rm-modal-assinar')?.classList.contains('aberto')) remFecharAssinar()
  REM.aba = 'guia'
  remRender()
  setTimeout(() => document.getElementById('rg-' + secao)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
}

// ── Guia completo ──────────────────────────────────────────────────────
function remGuiaHTML() {
  const sec = (id, titulo, corpo) => `<section class="rg-sec" id="rg-${id}"><h3>${titulo}</h3>${corpo}</section>`
  const passo = (n, t, d) => `<li><span class="rg-n">${n}</span><div><b>${t}</b><div class="rm-sub" style="font-size:13px;margin-top:2px">${d}</div></div></li>`
  return `<div class="rg">
  <nav class="rg-indice" aria-label="Índice do guia">
    <b>Neste guia</b>
    <a href="#" onclick="event.preventDefault();remIrGuia('visao')">1. Em uma frase</a>
    <a href="#" onclick="event.preventDefault();remIrGuia('saldos')">2. Lendo os saldos</a>
    <a href="#" onclick="event.preventDefault();remIrGuia('pedido')">3. Montando um pedido</a>
    <a href="#" onclick="event.preventDefault();remIrGuia('cadeia')">4. A cadeia de assinaturas</a>
    <a href="#" onclick="event.preventDefault();remIrGuia('efetivacao')">5. Efetivação</a>
    <a href="#" onclick="event.preventDefault();remIrGuia('cobertura')">6. TDR, contrato e cobertura</a>
    <a href="#" onclick="event.preventDefault();remIrGuia('estorno')">7. Estorno</a>
    <a href="#" onclick="event.preventDefault();remIrGuia('relatorios')">8. Relatórios e auditoria</a>
    <a href="#" onclick="event.preventDefault();remIrGuia('papeis')">9. Quem faz o quê</a>
    <a href="#" onclick="event.preventDefault();remIrGuia('faq')">10. Perguntas frequentes</a>
  </nav>
  <div class="rg-corpo">
  ${sec('visao', '1. Em uma frase', `
    <p>Remanejar é <b>tirar saldo livre</b> de uma atividade e <b>passar para outra</b>, com a origem de cada centavo
    registrada e a autorização de cinco pessoas, cada uma com a própria senha. Nada é apagado: tudo vira lançamento
    no <b>razão orçamentário</b>, que pode ser conferido a qualquer momento.</p>
    <div class="rg-regras">
      <div><b>Só saldo livre</b><span>Não se mexe em dinheiro comprometido por TDR, contrato ou viagem.</span></div>
      <div><b>Origem rastreada</b><span>Escolhe-se de qual fonte sai (dotação, economia, encerramento…).</span></div>
      <div><b>Remanejar não cria dinheiro</b><span>O total do projeto é sempre a dotação original mais as revisões da UNESCO.</span></div>
      <div><b>Tudo no banco</b><span>A tela só mostra e pede; quem decide e confere é o servidor.</span></div>
    </div>`)}

  ${sec('saldos', '2. Lendo os saldos (aba "Saldos por resultado")', `
    <p>A tabela agrupa as atividades por resultado. Clique numa atividade para ver as <b>fontes</b> do saldo dela.</p>
    <table class="rm-tab rg-tab"><tbody>
      <tr><td><b>Orçamento vigente</b> ${remQ('orcamento_vigente')}</td><td>Dotação original ± remanejamentos efetivados. Ninguém edita à mão.</td></tr>
      <tr><td><b>Comprometido</b> ${remQ('comprometido')}</td><td>TDRs (valor planejado) + viagens + contrato acima do TDR.</td></tr>
      <tr><td><b>Saldo</b> ${remQ('saldo')}</td><td>Orçamento − comprometido + liberações. Negativo = déficit.</td></tr>
      <tr><td><b>Reservado</b> ${remQ('reservado')}</td><td>Preso a pedido de remanejamento em aprovação.</td></tr>
      <tr><td><b>Remanejável</b> ${remQ('remanejavel')}</td><td>O que dá para ceder hoje.</td></tr>
    </tbody></table>
    <p><b>Ordem de consumo das fontes</b> ${remQ('fontes')}: os compromissos gastam primeiro a dotação original e
    depois as outras fontes na ordem em que entraram. Por isso o dinheiro que chega por economia ou por remanejamento
    é, normalmente, o primeiro a ficar livre.</p>`)}

  ${sec('pedido', '3. Montando um pedido (aba "Novo pedido")', `
    <p>Só <b>coordenação</b> e <b>super admin</b> montam pedidos.</p>
    <ol class="rg-passos">
      ${passo(1, 'Escolha as fontes que cedem', 'Informe quanto sai de cada fonte. Só aparecem fontes com saldo livre. ' + remQ('pedido_origem'))}
      ${passo(2, 'Escolha os destinos', 'A soma dos destinos tem de ser igual ao total cedido. ' + remQ('pedido_destino'))}
      ${passo(3, 'Escreva a justificativa', 'O que deixa de ser feito na origem e o que o recurso viabiliza no destino. ' + remQ('pedido_justificativa'))}
      ${passo(4, 'Salve o rascunho', 'Ainda não reserva nada nem avisa ninguém; pode editar à vontade. ' + remQ('rascunho'))}
      ${passo(5, 'Envie para aprovação', 'Na aba Pedidos, o titular da coordenação solicitante abre o pedido e clica em "Enviar para aprovação" com a senha. A partir daqui o valor fica reservado.')}
    </ol>`)}

  ${sec('cadeia', '4. A cadeia de assinaturas', `
    <ol class="rg-cadeia">
      <li><span class="rg-n">1</span><div><b>Coordenação solicitante</b><span>titular do cargo — assina e envia</span></div></li>
      <li><span class="rg-n">2</span><div><b>Responsável de cada atividade que cede</b><span>uma etapa por atividade de origem — libera o recurso</span></div></li>
      <li><span class="rg-n">3</span><div><b>UNESCO (financeiro)</b><span>titular do cargo, perfil financeiro — aprova</span></div></li>
      <li><span class="rg-n">4</span><div><b>Diretor</b><span>titular do cargo — aprova</span></div></li>
      <li><span class="rg-n">5</span><div><b>Secretário</b><span>titular do cargo — aprova e o remanejamento é efetivado</span></div></li>
    </ol>
    <ul class="rg-lista">
      <li><b>Sequencial e nominal</b> ${remQ('cadeia')}: só a pessoa da etapa atual pode agir. Não há substituto.</li>
      <li><b>E-mail só para quem tem de agir</b> ${remQ('minha_vez')}: ao aprovar, avisa só a próxima etapa; ao devolver, só a anterior.</li>
      <li><b>Decisões</b> ${remQ('decisoes')}: aprovar, devolver (volta uma etapa), recusar (encerra), cancelar (só o solicitante).</li>
      <li><b>Senha</b> ${remQ('senha')}: reconferida no servidor a cada assinatura.</li>
      <li><b>Documento lacrado</b> ${remQ('hash')}: cada assinatura grava a impressão digital do pedido; se ele mudar, as assinaturas caem.</li>
      <li><b>Segregação</b> ${remQ('signatarios')}: a mesma pessoa não assina duas etapas do mesmo pedido.</li>
    </ul>`)}

  ${sec('efetivacao', '5. Efetivação', `
    <p>Com a assinatura do secretário, o servidor <b>confere tudo de novo</b> (o saldo pode ter mudado durante a
    tramitação) e grava os lançamentos: <b>cedido</b> (−) em cada fonte de origem e <b>recebido</b> (+) no destino,
    apontando de qual fonte veio. O orçamento vigente das atividades muda nesse instante. Se a fonte não tiver mais saldo,
    a efetivação é recusada e nada muda.</p>
    <p>Quem montou o pedido e todos os que assinaram recebem o aviso de efetivado.</p>`)}

  ${sec('cobertura', '6. TDR, contrato e cobertura', `
    <ul class="rg-lista">
      <li><b>O TDR compromete o orçamento</b> ${remQ('tdr_compromete')}: só é cadastrado ou aumentado se couber no saldo livre.</li>
      <li><b>O contrato deriva do TDR</b>: até o valor do TDR, não pede nada.</li>
      <li><b>Contrato acima do TDR</b>: a diferença é convertida em dólar pela PTAX do dia e entra no comprometido.
        Se não couber no saldo livre, o contrato fica <b>aguardando cobertura</b> ${remQ('cobertura')}.</li>
      <li><b>Liberação automática</b>: quando o saldo da atividade cobrir a diferença, o contrato volta sozinho ao status
        anterior, na ordem de chegada. Se havia pedido de cobertura em andamento, ele é cancelado automaticamente.</li>
      <li><b>Pedir cobertura</b> ${remQ('falta_cobrir')}: em "Saldos por resultado", o botão já monta o pedido com a
        atividade do contrato como destino e o valor que falta.</li>
    </ul>`)}

  ${sec('estorno', '7. Estorno', `
    <p>${REM_AJUDA.estorno.h}</p>
    <ol class="rg-passos">
      ${passo(1, 'Abra o remanejamento efetivado e clique em "Pedir estorno"', 'Coordenação ou super admin. Escreva a justificativa. O sistema monta o espelho do pedido: não se escolhem fontes nem valores.')}
      ${passo(2, 'Confira o rascunho e envie', 'O titular da coordenação solicitante envia com a senha. O valor recebido fica reservado no destino.')}
      ${passo(3, 'A cadeia assina', 'Coordenação solicitante → responsáveis das atividades que DEVOLVEM → UNESCO → diretor → secretário.')}
      ${passo(4, 'Efetivação', 'Cada lançamento do original ganha o lançamento inverso, apontando para ele. O dinheiro volta à mesma fonte de onde saiu e o original passa a "Estornado".')}
    </ol>
    <table class="rm-tab rg-tab"><thead><tr><th>Etapa</th><th>No remanejamento</th><th>No estorno</th></tr></thead><tbody>
      <tr><td>1 Solicitação</td><td>Titular da coordenação solicitante</td><td>O titular <b>vigente</b> no dia</td></tr>
      <tr><td>2 Liberação</td><td>Responsáveis das atividades que <b>cederam</b></td><td>Responsáveis das atividades que <b>receberam</b> (e agora devolvem)</td></tr>
      <tr><td>3–5</td><td>UNESCO, diretor, secretário</td><td>Os titulares <b>vigentes</b> no dia</td></tr>
    </tbody></table>
    <p class="rm-sub" style="font-size:13px">Não se estorna parte, não se estorna estorno e não se estorna se o destino já
    usou ou repassou o valor. Nesses casos, faça um remanejamento novo.</p>`)}

  ${sec('relatorios', '8. Relatórios e auditoria', `
    <ul class="rg-lista">
      <li><b>Relatório A4 do pedido</b>: botão no pedido. Movimentação, procedência, cadeia com nome, cargo, data e impressão digital de cada assinatura, e histórico.</li>
      <li><b>Extrato da atividade</b> ${remQ('extrato')}: ao abrir as fontes de uma atividade, botão "Extrato (A4)".</li>
      <li><b>Relatório de saldo</b> (Visão Geral e Central de Relatórios): mostra a dotação original e o remanejado de cada atividade.</li>
      <li><b>Auditor IA</b>: confere o razão a cada rodada e aponta contrato travado, pedido parado, cargo sem titular, cotação desatualizada.</li>
    </ul>`)}

  ${sec('papeis', '9. Quem faz o quê', `
    <table class="rm-tab rg-tab"><thead><tr><th>Quem</th><th>Pode</th></tr></thead><tbody>
      <tr><td>Todos os usuários</td><td>Ver saldos, fontes, pedidos, cadeia, histórico, relatórios e este guia.</td></tr>
      <tr><td>Coordenação / super admin</td><td>Montar e editar rascunhos, pedir cobertura de contrato, pedir estorno.</td></tr>
      <tr><td>Titular da coordenação solicitante</td><td>Enviar o pedido para a cadeia (etapa 1) e cancelar.</td></tr>
      <tr><td>Responsável da atividade</td><td>Liberar (etapa 2) quando a atividade dele cede — ou devolve, no estorno.</td></tr>
      <tr><td>Titulares UNESCO, diretor, secretário</td><td>Aprovar, devolver ou recusar na sua etapa.</td></tr>
      <tr><td>Super admin</td><td>Designar os titulares (aba Signatários), com o ato.</td></tr>
    </tbody></table>`)}

  ${sec('faq', '10. Perguntas frequentes', REM_FAQ.map(([p, r]) =>
    `<details class="rg-faq"><summary>${p}</summary><div>${r}</div></details>`).join(''))}
  </div></div>`
}
