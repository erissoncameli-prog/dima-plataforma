/*!
 * Plataforma Inteligente de Gestão de Projetos
 * © 2025–2026 Erisson Cameli Santiago. Todos os direitos reservados.
 */
// ── Aprender a usar — guias passo a passo das telas da plataforma ────────────────────────
// Só CONTEÚDO e ligação. O motor (painel, passos, destaque do elemento real, "já visto", convite)
// é o do SIGUC em js/guia-app.js + css/guia-app.css — NÃO editar lá (copiar de novo do SIGUC).
// Ajustes visuais da plataforma (tema escuro, z-index acima das janelas) em css/guias-plataforma.css.
//
// Como funciona
//   • Cada guia é uma TAREFA ("Avaliar uma entrega"), ligada a uma tela (`pagina` = id do nav) ou a
//     todas ('*', o passeio geral), com `perfis` opcionais (quem vê o guia na central).
//   • Botão "Aprender" na barra superior (#topbar-aprender, js/layout.js) e "Aprender a usar" no menu do
//     usuário e no Manual abrem a CENTRAL (DimaGuias.abrirCentral): guias desta tela primeiro; guia de outra
//     tela abre lá com ?guia=<slug>.
//   • Passo com `alvo` destaca o elemento real; se ele não estiver na tela, o passo vira cartão de texto
//     (regra do motor). `soTour: true` = passo que só aponta e é pulado sem o alvo.
//   • Passo com `tela` executa ANTES de mostrar: 'abrir:<função global>' abre uma janela (ex.: o formulário
//     de Novo TDR), 'fechar:<id da janela>' fecha, 'clique:<seletor>' clica (só para trocar de aba ou
//     escolher item — NUNCA salvar); 'menu:abrir'/'menu:fechar' abre/fecha o menu lateral só no celular. O guia nunca grava nada: ao fechar, as janelas que ele abriu fecham.
//   • Progresso só no aparelho (localStorage do motor, escopo 'plataforma'). Sem registro no banco:
//     a RPC que o motor procura não existe aqui e o cliente abaixo responde "ok" sem ir à rede.
//   • Convite de primeiro acesso = guiaConvite do motor (some ao concluir um guia ou ao dispensar).
//
// Manutenção: tela mudou ⇒ conferir os `alvo` do guia dela com `node tests/guias/conferir-alvos.js` (procura cada
// id/classe no código das telas). Texto mudou ⇒ incrementar `versao` (volta a aparecer como novidade).
;(function () {
  if (window.DimaGuias) return

  // O motor tenta registrar a conclusão por RPC (capacitacao_registrar_conclusao, do SIGUC). Aqui não há
  // registro no banco: este cliente, que o motor procura antes do `db`, responde sem ir à rede.
  window._bioDB_client = window._bioDB_client || { rpc: async () => ({ data: null, error: null }) }

  // ── Estilos (motor + ajustes da plataforma), resolvidos a partir deste script ───────────
  const BASE = (() => {
    const s = document.currentScript && document.currentScript.src
    return s ? s.replace(/js\/guias-plataforma\.js(\?.*)?$/, '') : '../'
  })()
  ;['css/guia-app.css', 'css/guias-plataforma.css'].forEach(h => {
    if (document.querySelector(`link[href*="${h}"]`)) return
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = BASE + h
    document.head.appendChild(l)
  })

  // ── Ícones (o motor pede bico(nome)) ─────────────────────────────────────────────────
  const IC = {
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    aprender: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/><path d="M22 9v6"/>',
    mapa: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sino: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    tema: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"/>',
    tarefa: '<rect x="3" y="3" width="8" height="18" rx="1.5"/><rect x="13" y="3" width="8" height="11" rx="1.5"/>',
    entrega: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    doc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5M8 13h8M8 17h6"/>',
    pagar: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    relatorio: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    filtro: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    olho: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  }
  if (typeof window.bico !== 'function') {
    window.bico = function (nome) {
      const p = IC[nome]; if (!p) return ''
      return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'
    }
  }

  const PAGINAS = {
    dashboard: 'dashboard.html', tarefas: 'tarefas.html', tdrs: 'tdrs.html', produtos: 'produtos.html',
    financeiro: 'financeiro.html', relatorios: 'relatorios.html', atividades: 'atividades.html',
    contratos: 'contratos.html', remanejamentos: 'remanejamentos.html', viagens: 'viagens.html',
    fornecedores: 'fornecedores.html', matriz: 'matriz.html', acervo: 'acervo.html', mapa: 'mapa.html',
    diagnostico: 'diagnostico.html', pulso: 'pulso.html', usuarios: 'usuarios.html',
  }
  const NOME_TELA = {
    tarefas: 'Tarefas', tdrs: 'TDRs', produtos: 'Produtos Entregues', financeiro: 'Financeiro', relatorios: 'Relatórios',
    dashboard: 'Visão Geral', atividades: 'Atividades', contratos: 'Contratos', remanejamentos: 'Remanejamento', viagens: 'Viagens',
    fornecedores: 'Fornecedores', matriz: 'Matriz de Resultados', acervo: 'Acervo Digital', mapa: 'Mapa Interativo',
    diagnostico: 'Diagnóstico', pulso: 'Pulso da Equipe', usuarios: 'Usuários',
  }

  // ── CONTEÚDO ─────────────────────────────────────────────────────────────────────────
  // Linguagem simples: frases curtas, um passo por vez, sem sigla sem explicação.
  const GUIAS = [
    {
      slug: 'passeio', pagina: '*', versao: 2, icone: 'mapa',
      titulo: 'Conhecer o sistema', resumo: 'Onde fica cada coisa. Leva 2 minutos.',
      passos: [
        { titulo: 'Olá! Vamos conhecer o sistema', icone: 'help',
          texto: 'Vou mostrar **onde fica cada coisa**. Você só lê e clica em **Próximo**.',
          nota: 'Fique tranquilo: aqui **nada é apagado nem salvo**. Para sair, clique no **X**.' },
        { titulo: 'Este é o menu', icone: 'menu', alvo: '#sidebar .sidebar-nav', tela: 'menu:abrir',
          texto: 'Do lado esquerdo fica o **menu**. Clique num nome para ir a outra tela.',
          lista: ['No celular, o menu abre no botão de **três risquinhos**, lá em cima.'] },
        { titulo: 'Seus avisos', icone: 'sino', alvo: '#sino-btn', tela: 'menu:fechar',
          texto: 'O **sino** avisa quando alguém precisa de você.',
          nota: 'Número vermelho no sino = avisos novos. Clique no aviso para ir direto ao assunto.' },
        { titulo: 'Sua conta', icone: 'usuario', alvo: '#user-avatar-btn',
          texto: 'Clique na sua **foto** (ou nas suas letras) para trocar a senha ou **Sair**.' },
        { titulo: 'Tela clara ou escura', icone: 'tema', alvo: '.dgm-tema, .tk-tema', soTour: true,
          texto: 'Escolha **Claro** ou **Escuro**. Use o que for melhor para os seus olhos.' },
        { titulo: 'Aprender a usar', icone: 'aprender', alvo: '#topbar-aprender',
          texto: 'Sempre que tiver dúvida, clique em **Aprender**. Ele ensina passo a passo.',
          lista: ['No celular: abra o menu e clique em **Aprender a usar**.'] },
        { titulo: 'Ajuda rápida', icone: 'help', alvo: '#ajuda-btn',
          texto: 'O botão **?** explica a tela em que você está.' },
        { titulo: 'Pronto!', icone: 'check',
          texto: 'Agora escolha o que quer aprender. Comece por **Minhas tarefas**.' },
      ],
    },
    {
      slug: 'tarefas', pagina: 'tarefas', versao: 2, icone: 'tarefa',
      titulo: 'Minhas tarefas', resumo: 'Ver o que você precisa fazer e avisar quando terminar',
      passos: [
        { titulo: 'O que é esta tela', icone: 'tarefa',
          texto: 'Aqui ficam as **tarefas**: o que cada pessoa precisa fazer e até quando.' },
        { titulo: 'Resumo', alvo: '#tk-sub', icone: 'olho',
          texto: 'Esta linha diz quantas tarefas estão **abertas** e quantas estão **atrasadas**.' },
        { titulo: 'Veja só as suas', alvo: '.tk .toolbar .seg', icone: 'filtro',
          texto: 'Clique em **Minhas**. Assim aparecem só as tarefas que são suas.' },
        { titulo: 'Procurar uma tarefa', alvo: '#tk-busca', icone: 'busca',
          texto: 'Escreva uma palavra do título. A lista mostra só as que combinam.' },
        { titulo: 'As colunas', alvo: '.tk .board .col', icone: 'tarefa',
          texto: 'Cada coluna é uma etapa: **A fazer**, **Em andamento**, **Em revisão**, **Bloqueada** e **Concluída**.',
          nota: 'Começou a fazer? Arraste o cartão para **Em andamento**.' },
        { titulo: 'Abrir a tarefa', icone: 'olho',
          texto: 'Clique no cartão para abrir. Lá você pode **Comentar** e **Anexar** arquivos.' },
        { titulo: 'Terminei. E agora?', icone: 'check',
          texto: 'Dentro da tarefa, clique em **Enviar para revisão** e escreva o que fez.',
          lista: ['Quem pediu a tarefa confere e conclui.', 'Se faltar algo, ela volta para você com o motivo.'] },
        { titulo: 'Pedir algo a alguém', alvo: '.tk .tk-head .btn-pri', icone: 'mais',
          texto: 'Clique em **Nova tarefa**. Escreva o título, escolha quem faz e o prazo.' },
      ],
    },
    {
      slug: 'avaliar-entrega', pagina: 'produtos', versao: 2, icone: 'entrega',
      perfis: ['super_admin', 'coordenacao', 'tecnico'],
      titulo: 'Avaliar uma entrega', resumo: 'Conferir o que o fornecedor entregou e dizer se está bom',
      passos: [
        { titulo: 'O que é avaliar', icone: 'entrega',
          texto: 'O fornecedor entrega um trabalho (relatório, fotos, evento). Você **confere** e diz se está bom.',
          nota: 'Só avalia quem é **responsável pela atividade**. Os outros só olham.' },
        { titulo: 'O que espera por você', alvo: '#stats', icone: 'filtro',
          texto: 'Clique em **Em avaliação**. Aparecem as entregas esperando a sua resposta.' },
        { titulo: 'Achar a entrega', alvo: '.pr-filtros', icone: 'busca',
          texto: 'Se a lista for grande, escolha a **atividade** ou o **fornecedor**.' },
        { titulo: 'Abrir', alvo: '#conteudo', icone: 'olho',
          texto: 'No fim da linha, clique em **Avaliar**. Abre uma janela.' },
        { titulo: 'Passo 1: olhe o trabalho', icone: 'doc',
          texto: 'Abra os **Documentos** e as **Fotos**. Leia antes de decidir.' },
        { titulo: 'Passo 2: marque a caixa', icone: 'check',
          texto: 'Marque a caixa amarela que diz que o produto é o que foi contratado.' },
        { titulo: 'Passo 3: escolha', icone: 'entrega', texto: 'Escolha uma opção:',
          lista: ['**Aprovar**: está tudo certo.', '**Parcial**: só uma parte está certa.', '**Devolução**: precisa corrigir. Explique o que falta.'] },
        { titulo: 'Passo 4: a Nota Técnica', icone: 'doc',
          texto: 'Para aprovar, anexe a **Nota Técnica** do SEI em PDF. O sistema confere sozinho.',
          nota: 'Não sabe fazer a nota? Clique em **Ver o modelo da nota** e baixe o modelo pronto.' },
        { titulo: 'Passo 5: confirme com a senha', icone: 'cadeado',
          texto: 'Escreva o despacho (o texto da sua decisão). Depois clique em **Aprovar e liberar pagamento** e digite **a sua senha** do sistema.' },
        { titulo: 'Pronto!', icone: 'pagar',
          texto: 'Aprovou? O pagamento vai para o **Financeiro**. Você não precisa fazer mais nada.' },
      ],
    },
    {
      slug: 'novo-tdr', pagina: 'tdrs', versao: 2, icone: 'doc',
      perfis: ['super_admin', 'coordenacao', 'tecnico'],
      titulo: 'Cadastrar um TDR', resumo: 'Pedir uma contratação: o que, para qual atividade e quanto custa',
      passos: [
        { titulo: 'O que é um TDR', icone: 'doc',
          texto: '**TDR** é o pedido de uma contratação. Ele diz **o que** vai ser contratado e **quanto custa**.',
          nota: 'Quando você cria o TDR, esse dinheiro fica **separado** no orçamento da atividade.' },
        { titulo: 'Os TDRs por etapa', alvo: '#stats', icone: 'filtro', tela: 'fechar:modal-novo',
          texto: 'Estes números mostram quantos TDRs há em cada etapa. Clique num número para ver só aqueles.' },
        { titulo: 'Procurar', alvo: '.td-filtros', icone: 'busca',
          texto: 'Escreva o número ou uma palavra do objeto para achar um TDR.' },
        { titulo: 'Novo TDR', alvo: '.td-filtros .btn-primary', icone: 'mais',
          texto: 'Para começar, clique em **Novo TDR**. No próximo passo eu abro o formulário para você ver.',
          nota: 'Fique tranquilo: aqui **nada é salvo**.' },
        { titulo: 'Atividade e tipo', alvo: '#n-ativ', icone: 'doc', tela: 'abrir:abrirNovo',
          texto: 'Escolha a **atividade** que vai pagar. Depois escolha **PF** (uma pessoa) ou **PJ** (uma empresa).' },
        { titulo: 'O que vai ser contratado', alvo: '#n-objeto', icone: 'doc',
          texto: 'Escreva em poucas linhas o que vai ser feito.' },
        { titulo: 'Quanto custa', alvo: '#n-brl', icone: 'pagar',
          texto: 'Escreva o **valor em reais**. Ele é obrigatório.',
          nota: 'Se não houver dinheiro livre na atividade, o sistema avisa. Aí é preciso um **remanejamento**.' },
        { titulo: 'Arquivo (se tiver)', alvo: '#n-arquivo', icone: 'doc',
          texto: 'Tem o documento do TDR pronto? Anexe aqui. Se não tiver, pode anexar depois.' },
        { titulo: 'Criar', alvo: '#btn-criar', icone: 'check',
          texto: 'Confira tudo e clique em **Criar TDR**. Ele aparece na lista como **Rascunho**.' },
        { titulo: 'E depois?', alvo: '#lista', icone: 'olho', tela: 'fechar:modal-novo',
          texto: 'Clique no cartão do TDR para acompanhar cada etapa até a contratação.' },
      ],
    },
    {
      slug: 'efetivar-pagamento', pagina: 'financeiro', versao: 2, icone: 'pagar',
      perfis: ['super_admin', 'financeiro'],
      titulo: 'Registrar um pagamento', resumo: 'Marcar como pago o que já saiu do banco',
      passos: [
        { titulo: 'Como funciona', icone: 'pagar',
          texto: 'Toda despesa começa **A pagar**. Quando o dinheiro sai, você marca como **pago**.' },
        { titulo: 'Os totais', alvo: '#stats', icone: 'olho',
          texto: 'Aqui você vê quanto já foi **pago** e quanto ainda está **a pagar**.' },
        { titulo: 'Jeitos de ver', alvo: '.fi-tabs', icone: 'filtro',
          texto: 'Use **Lançamentos** para ver um por um.' },
        { titulo: 'Só o que falta pagar', alvo: '#fil-sit', icone: 'filtro',
          texto: 'Em **Situação**, escolha **A pagar**.' },
        { titulo: 'Pagar', alvo: '.fi-btn.pagar', icone: 'pagar', soTour: true,
          texto: 'Na linha da despesa, clique em **Pagar**.' },
        { titulo: 'Preencha', icone: 'doc', texto: 'Na janela que abre, preencha:',
          lista: ['O **dia** em que pagou.', 'O valor em dólar que a **UNESCO** informou.', 'O **comprovante** em PDF.'] },
        { titulo: 'Confirme com a senha', icone: 'cadeado',
          texto: 'Clique em **Confirmar pagamento** e digite **a sua senha** do sistema.',
          nota: 'Depois de confirmado, o pagamento não muda mais. Errou? Fale com o Financeiro.' },
        { titulo: 'Despesa nova', alvo: '.fi-barra .fi-btn.pri', icone: 'mais',
          texto: 'Para lançar uma despesa que não está na lista, clique em **Novo lançamento**.' },
      ],
    },
    {
      slug: 'relatorio-pdf', pagina: 'relatorios', versao: 2, icone: 'relatorio',
      perfis: ['super_admin', 'coordenacao', 'financeiro'],
      titulo: 'Tirar um relatório em PDF', resumo: 'Escolher, gerar e salvar em PDF',
      passos: [
        { titulo: 'Relatórios prontos', icone: 'relatorio',
          texto: 'O sistema já tem os relatórios prontos. Você só escolhe e gera.' },
        { titulo: 'Procurar pelo nome', alvo: '#re-q', icone: 'busca',
          texto: 'Escreva uma palavra, como **saldo**, **contrato** ou **viagem**.' },
        { titulo: 'Ou pelo assunto', alvo: '#temas-grid', icone: 'filtro',
          texto: 'Ou clique num assunto para ver só os relatórios dele.' },
        { titulo: 'Escolher', alvo: '#rel-lista', icone: 'doc',
          texto: 'Clique no relatório que você quer. No próximo passo eu escolho o primeiro, só para mostrar.' },
        { titulo: 'Filtros', alvo: '#filtros-form', icone: 'filtro', tela: 'clique:#rel-lista .re-it',
          texto: 'Aqui você escolhe o período ou a atividade. **Deixe em branco para ver tudo.**' },
        { titulo: 'Gerar', alvo: '#filtros-form .re-ac .btn-primary', icone: 'relatorio',
          texto: 'Clique em **Gerar relatório**. Ele aparece embaixo para você conferir.' },
        { titulo: 'Salvar em PDF', alvo: '#re-btn-exp', icone: 'doc',
          texto: 'Clique em **Exportar** e escolha **PDF**.',
          nota: 'Vai abrir a janela de impressão. Em **Destino**, escolha **Salvar como PDF**.' },
      ],
    },
    {
      slug: 'visao-geral', pagina: 'dashboard', versao: 2, icone: 'relatorio',
      titulo: 'Ler a Visão Geral', resumo: 'Os números do projeto numa tela só',
      passos: [
        { titulo: 'O que é esta tela', icone: 'relatorio',
          texto: 'A **Visão Geral** mostra os principais números do projeto. Eles se atualizam sozinhos.' },
        { titulo: 'As guias', alvo: '.vg-tabs', icone: 'filtro',
          texto: 'Cada guia mostra um assunto. Clique no nome para trocar. Vou mostrar algumas.' },
        { titulo: 'O dinheiro do projeto', alvo: '#pane-financiadores .vg-kpis', icone: 'pagar', tela: 'clique:.vg-tab[data-aba="financiadores"]',
          texto: 'Aqui você vê quanto dinheiro já foi **pago**, quanto está **separado** para contratos e quanto ainda está **livre**.' },
        { titulo: 'Os gráficos', alvo: '#pane-financiadores .vg-card', icone: 'olho',
          texto: 'Clique numa barra para ver o detalhe. Prefere números? Clique em **Ver como tabela**.' },
        { titulo: 'Alertas', alvo: '#pane-alertas', icone: 'sino', tela: 'clique:.vg-tab[data-aba="alertas"]',
          texto: 'Aqui aparece o que precisa de atenção, como prazos vencendo.' },
        { titulo: 'Minhas tarefas', alvo: '#pane-tarefas', icone: 'tarefa', tela: 'clique:.vg-tab[data-aba="tarefas"]',
          texto: 'As tarefas que são suas, sem precisar ir a outra tela.' },
        { titulo: 'Dinheiro de cada atividade', alvo: '.vg-tab[data-aba="saldo"]', icone: 'pagar', soTour: true,
          texto: 'Mostra quanto dinheiro ainda está livre em cada atividade.' },
        { titulo: 'Levar para fora', alvo: '.vg-exp-btn', icone: 'doc', tela: 'clique:.vg-tab[data-aba="financiadores"]',
          texto: 'Clique em **Exportar** para salvar em PDF, Excel ou PowerPoint.' },
      ],
    },
    {
      slug: 'atividades', pagina: 'atividades', versao: 2, icone: 'tarefa',
      titulo: 'Acompanhar as atividades', resumo: 'Quanto cada atividade tem, quanto já gastou e quem cuida dela',
      passos: [
        { titulo: 'O que é uma atividade', icone: 'tarefa',
          texto: 'O projeto é dividido em **atividades** (2.1.1, 2.1.2…). Cada uma tem dinheiro próprio e pessoas responsáveis.' },
        { titulo: 'O resumo', alvo: '#stats-row', icone: 'olho',
          texto: 'Estes números mostram o total de todas as atividades: o dinheiro, o que foi pago e o que está separado.' },
        { titulo: 'Escolher um resultado', alvo: '#fil-resultado', icone: 'filtro',
          texto: 'O projeto tem 4 resultados (R1 a R4). Clique em um para ver só as atividades dele.' },
        { titulo: 'Procurar', alvo: '.at-filtros', icone: 'busca',
          texto: 'Escreva o código ou o nome da atividade. Os outros filtros são opcionais.' },
        { titulo: 'A lista', alvo: '#tbody-atividades', icone: 'olho',
          texto: 'Uma atividade por linha. A barra colorida mostra quanto do dinheiro já foi usado.',
          nota: 'Barra **vermelha** = passou do dinheiro da atividade.' },
        { titulo: 'Tarefas da atividade', alvo: '.at-tbl .tv-btn', icone: 'tarefa', soTour: true,
          texto: 'Este botão diz quantas tarefas faltam nessa atividade. Clique para ver.' },
        { titulo: 'Ver os detalhes', icone: 'doc',
          texto: 'Clique na linha para abrir a atividade.',
          nota: 'O dinheiro da atividade tem um **cadeado**: ele só muda por **remanejamento**.' },
      ],
    },
    {
      slug: 'contratos', pagina: 'contratos', versao: 2, icone: 'doc',
      perfis: ['super_admin', 'coordenacao', 'financeiro'],
      titulo: 'Cadastrar e acompanhar contratos', resumo: 'Registrar o contrato assinado e acompanhar os pagamentos',
      passos: [
        { titulo: 'De onde vem o contrato', icone: 'doc',
          texto: 'Primeiro existe o **TDR** (o pedido de contratação). Depois de escolher quem vai fazer, você cadastra o **contrato** ligado a ele.' },
        { titulo: 'O resumo', alvo: '#stats', icone: 'filtro', tela: 'fechar:modal-contrato',
          texto: 'Quanto foi contratado, quanto foi pago e quais contratos estão **sem o PDF assinado**. Clique num número para filtrar.' },
        { titulo: 'Contrato travado', alvo: '#ct-travados .ct-travado', icone: 'cadeado', soTour: true,
          texto: 'Este aviso aparece quando o contrato ficou **mais caro que o TDR** e falta dinheiro. Clique em **Pedir cobertura** para resolver.' },
        { titulo: 'Procurar', alvo: '.ct-filtros', icone: 'busca',
          texto: 'Escreva o número do contrato, uma palavra do objeto ou o nome do fornecedor.' },
        { titulo: 'A lista', alvo: '#tbody', icone: 'olho',
          texto: 'A barra verde mostra o que já foi **pago**. Clique na linha para abrir o contrato.' },
        { titulo: 'Novo contrato', alvo: '.ct-filtros .ct-btn.pri', icone: 'mais',
          texto: 'Clique em **Novo contrato**. No próximo passo eu abro o formulário para você ver.',
          nota: 'Fique tranquilo: aqui **nada é salvo**.' },
        { titulo: 'Escolha o TDR', alvo: '#f-tdr', icone: 'doc', tela: 'abrir:abrirNovo',
          texto: 'Escolha o **TDR**. A atividade é preenchida sozinha.' },
        { titulo: 'Quem foi contratado', alvo: '#f-forn', icone: 'usuario',
          texto: 'Escolha o **fornecedor**. Não está na lista? Cadastre antes em **Fornecedores**.' },
        { titulo: 'Valor', alvo: '#f-total', icone: 'pagar',
          texto: 'Escreva o valor total do contrato em reais.' },
        { titulo: 'Valor pago', alvo: '#f-usado', icone: 'cadeado',
          texto: 'Este campo **não se preenche**. Ele soma sozinho os pagamentos.' },
        { titulo: 'Encerrar', icone: 'check', tela: 'fechar:modal-contrato',
          texto: 'Contrato todo pago fecha sozinho. Sobrou algo que não vai ser entregue? Abra o contrato e clique em **Pedir encerramento**.' },
      ],
    },
    {
      slug: 'remanejamento', pagina: 'remanejamentos', versao: 2, icone: 'pagar',
      titulo: 'Assinar um remanejamento', resumo: 'Conferir o pedido e assinar a sua parte',
      passos: [
        { titulo: 'O que é remanejamento', icone: 'pagar',
          texto: '**Remanejar** é passar dinheiro que sobrou de uma atividade para outra que precisa.',
          nota: 'Cinco pessoas precisam assinar. O dinheiro só muda de lugar depois da última assinatura.' },
        { titulo: 'Os números', alvo: '#rm-kpis', icone: 'olho',
          texto: 'Mostram quanto dinheiro está livre e quanto está esperando assinaturas.' },
        { titulo: 'As abas', alvo: '#rm-abas', icone: 'filtro',
          texto: 'A aba **Pedidos** é onde ficam os pedidos para assinar.' },
        { titulo: 'O que espera por você', alvo: '.rm-chips', icone: 'sino', tela: 'clique:#rm-abas .rm-aba[onclick*="pedidos"]',
          texto: 'Clique em **Aguardando minha análise**. Aparecem só os pedidos que precisam da **sua** assinatura.',
          nota: 'O sino também avisa quando chega a sua vez.' },
        { titulo: 'Quem assina', icone: 'check', texto: 'Cada pessoa assina na sua vez:',
          lista: ['1. Coordenação', '2. Responsável pela atividade que cede o dinheiro', '3. Financeiro da UNESCO', '4. Diretor', '5. Secretário'] },
        { titulo: 'Assinar', icone: 'cadeado',
          texto: 'Abra o pedido. Confira as atividades e os valores. Clique em **Aprovar e assinar** e digite **a sua senha**.',
          nota: 'Achou algo errado? Clique em **Devolver** e escreva o motivo.' },
        { titulo: 'Fazer um pedido', alvo: '#rm-abas .rm-aba[onclick*="novo"]', icone: 'mais', soTour: true,
          texto: 'A coordenação monta o pedido em **Novo pedido**.' },
        { titulo: 'Ficou com dúvida?', alvo: '#rm-corpo', icone: 'help', tela: 'clique:#rm-abas .rm-aba[onclick*="guia"]',
          texto: 'A aba **Como funciona** explica tudo com calma. Os botões **?** explicam cada palavra.' },
      ],
    },
    {
      slug: 'viagens', pagina: 'viagens', versao: 2, icone: 'mapa',
      perfis: ['super_admin', 'coordenacao', 'financeiro', 'tecnico'],
      titulo: 'Pedir uma viagem', resumo: 'Pedir passagem e diárias, do começo até a prestação de contas',
      passos: [
        { titulo: 'Como pedir uma viagem', icone: 'mapa',
          texto: 'Para viajar pelo projeto, você faz um **pedido de viagem** (protocolo). Quem paga passagem e diárias é a **UNESCO**.' },
        { titulo: 'Quanto ainda tem', alvo: '#tdr-direta', icone: 'pagar', soTour: true, tela: 'fechar:modal-prot',
          texto: 'Este quadro mostra quanto dinheiro ainda há para passagens e diárias.' },
        { titulo: 'Seus pedidos', alvo: '#stats', icone: 'filtro',
          texto: 'Estes números mostram os pedidos em cada situação. Clique num número para ver só aqueles.' },
        { titulo: 'Procurar', alvo: '.vi-filtros', icone: 'busca',
          texto: 'Escreva o nome de quem viaja ou o destino.' },
        { titulo: 'Novo pedido', alvo: '.vi-acoes .btn-primary', icone: 'mais',
          texto: 'Clique em **Novo protocolo**. No próximo passo eu abro o formulário para você ver.',
          nota: 'Fique tranquilo: aqui **nada é salvo**.' },
        { titulo: 'Para que é a viagem', alvo: '#f-objetivo', icone: 'doc', tela: 'abrir:abrirFormNovo',
          texto: 'Escreva o motivo da viagem ou o nome do evento.' },
        { titulo: 'Para onde e quando', alvo: '#f-destino', icone: 'mapa',
          texto: 'Escreva a **cidade** e escolha o dia de **ida** e de **volta**.' },
        { titulo: 'Quem vai', alvo: '#viajantes-container', icone: 'usuario',
          texto: 'Escolha a pessoa que vai viajar. Depois informe as passagens e as diárias. O total aparece no fim.' },
        { titulo: 'Salvar e enviar', alvo: '#btn-salvar-rasc', icone: 'check',
          texto: 'Primeiro clique em **Salvar rascunho**. Depois clique em **Enviar para aprovação**.' },
        { titulo: 'E depois?', icone: 'cadeado', tela: 'fechar:modal-prot',
          texto: 'O administrador aprova. Você recebe o aviso no sino.',
          nota: 'Voltou da viagem? Em até **5 dias**, envie os cartões de embarque e o relatório.' },
      ],
    },
    {
      slug: 'fornecedores', pagina: 'fornecedores', versao: 2, icone: 'usuario',
      perfis: ['super_admin', 'coordenacao', 'financeiro'],
      titulo: 'Cadastrar um fornecedor', resumo: 'Registrar a empresa ou a pessoa contratada',
      passos: [
        { titulo: 'Quem é fornecedor', icone: 'usuario',
          texto: 'É a empresa ou a pessoa contratada pelo projeto. Ela precisa estar cadastrada **antes** do contrato.' },
        { titulo: 'O resumo', alvo: '#stats', icone: 'olho', tela: 'fechar:modal-forn',
          texto: 'Quantos fornecedores existem e quanto já foi pago a eles.' },
        { titulo: 'Procurar', alvo: '.fo-filtros', icone: 'busca',
          texto: 'Escreva o nome, o CPF ou o CNPJ.' },
        { titulo: 'A lista', alvo: '#lista', icone: 'olho',
          texto: 'Clique na linha para ver os dados, os contratos e os pagamentos.' },
        { titulo: 'Novo fornecedor', alvo: '.fo-filtros .fo-btn.pri', icone: 'mais', soTour: true,
          texto: 'Clique em **Novo fornecedor**. No próximo passo eu abro o cadastro para você ver.',
          nota: 'Fique tranquilo: aqui **nada é salvo**.' },
        { titulo: 'As partes do cadastro', alvo: '#m-body .fo-tabs', icone: 'doc', tela: 'abrir:abrirNovo',
          texto: 'O cadastro tem partes. Clique em cada uma para preencher.' },
        { titulo: 'CPF ou CNPJ', alvo: '#tab-identificacao', icone: 'usuario',
          texto: 'Escolha **PF** (pessoa) ou **PJ** (empresa). Depois escreva o CPF ou o CNPJ e o nome.' },
        { titulo: 'Dados do banco', icone: 'cadeado',
          texto: 'Banco, conta e PIX ficam protegidos. Só a coordenação e o financeiro conseguem ver.' },
        { titulo: 'Salvar', alvo: '#btn-salvar-forn', icone: 'check',
          texto: 'Confira tudo e clique em **Criar fornecedor**.' },
        { titulo: 'Bom saber', icone: 'entrega', tela: 'fechar:modal-forn',
          texto: 'O fornecedor pode ganhar acesso ao sistema para **enviar** as próprias entregas. Ele **nunca aprova** o próprio trabalho.' },
      ],
    },
    {
      slug: 'matriz', pagina: 'matriz', versao: 2, icone: 'relatorio',
      titulo: 'Ler a Matriz de Resultados', resumo: 'As metas do projeto e quanto já foi alcançado',
      passos: [
        { titulo: 'O que é a Matriz', icone: 'relatorio',
          texto: 'A Matriz mostra as **metas** que o projeto prometeu. Cada entrega aprovada ajuda a chegar nelas.' },
        { titulo: 'O resumo', alvo: '#stats-row', icone: 'olho', tela: 'clique:.mz-tab[data-aba="matriz"]',
          texto: 'Quantas metas existem e quantas já foram alcançadas.' },
        { titulo: 'Filtrar', alvo: '#tc-matriz .mz-filtros', icone: 'filtro', texto: 'Escolha a situação:',
          lista: ['**Atingida**: a meta foi alcançada.', '**Em andamento**: já começou.', '**Sem registro**: ainda não começou.'] },
        { titulo: 'As metas', alvo: '#conteudo-matriz', icone: 'relatorio',
          texto: 'A barra mostra quanto da meta já foi alcançado. Clique numa meta para ver os detalhes.' },
        { titulo: 'ODS', alvo: '#tc-ods', icone: 'mapa', tela: 'clique:.mz-tab[data-aba="ods"]',
          texto: 'Os objetivos da ONU que o projeto ajuda. Clique num ícone para ver as metas dele.' },
        { titulo: 'Kunming-Montreal', alvo: '#tc-km', icone: 'mapa', tela: 'clique:.mz-tab[data-aba="km"]',
          texto: 'As metas mundiais de proteção da natureza que o projeto ajuda.' },
        { titulo: 'De onde vêm os números', icone: 'check', tela: 'clique:.mz-tab[data-aba="matriz"]',
          texto: 'Quando uma entrega é aprovada, o número entra aqui **sozinho**. Você não precisa digitar.' },
      ],
    },
    {
      slug: 'acervo', pagina: 'acervo', versao: 2, icone: 'doc',
      perfis: ['super_admin', 'coordenacao', 'financeiro', 'tecnico'],
      titulo: 'Consultar o Acervo Digital', resumo: 'A biblioteca com tudo o que foi entregue',
      passos: [
        { titulo: 'A biblioteca do projeto', icone: 'doc',
          texto: 'Aqui ficam **todos os trabalhos entregues**: relatórios, fotos, vídeos. Você só olha: nada muda.' },
        { titulo: 'O resumo', alvo: '.acv-kpis', icone: 'olho',
          texto: 'Quantos trabalhos e quantos arquivos existem na biblioteca.' },
        { titulo: 'Falta arquivo', alvo: '#acv-lacuna', icone: 'sino', soTour: true,
          texto: 'Trabalhos aprovados **sem arquivo**. Clique para ver quais.' },
        { titulo: 'Procurar', alvo: '#acv-q', icone: 'busca',
          texto: 'Escreva um título, um nome ou uma atividade. Não precisa de acento.' },
        { titulo: 'Filtrar', alvo: '.acv-cmd', icone: 'filtro',
          texto: 'Se quiser, escolha a atividade, o fornecedor ou o ano.' },
        { titulo: 'Abrir', alvo: '#acervo-corpo', icone: 'olho',
          texto: 'Clique na **capa** para abrir. Depois clique no arquivo para ver, sem baixar.' },
      ],
    },
    {
      slug: 'mapa', pagina: 'mapa', versao: 2, icone: 'mapa',
      titulo: 'Usar o Mapa Interativo', resumo: 'Ver no mapa onde o projeto trabalha',
      passos: [
        { titulo: 'O mapa', icone: 'mapa',
          texto: 'O mapa mostra **onde** o projeto trabalha e o que foi entregue em cada lugar.' },
        { titulo: 'Mexer no mapa', alvo: '#mapa', icone: 'mapa',
          texto: 'Arraste para mover. Use a rodinha do mouse para aproximar. Clique num ponto para ver o que tem ali.',
          lista: ['No celular: use **dois dedos** para aproximar.'] },
        { titulo: 'Camadas', alvo: '#mapa-layerbar', icone: 'filtro',
          texto: 'Clique para ligar ou desligar o que aparece: áreas protegidas, terras indígenas, propriedades rurais e floresta.' },
        { titulo: 'Filtros no celular', alvo: '#btn-filtros-mobile', icone: 'filtro', soTour: true,
          texto: 'No celular, os filtros abrem neste botão.' },
        { titulo: 'Relatório', alvo: '.mapa-topbar .btn-outline[onclick*="abrirRelatorioAmbiental"]', icone: 'relatorio', soTour: true,
          texto: 'Clique em **Relatório** para gerar um resumo da área que está na tela.' },
        { titulo: 'Tela cheia', alvo: '#btn-tela-cheia', icone: 'olho',
          texto: 'Deixa o mapa maior. Para voltar, aperte **Esc** ou clique de novo.' },
        { titulo: 'Colocar pontos', alvo: '.mapa-topbar .btn-primary[onclick*="abrirModalNovo"]', icone: 'mais', soTour: true,
          texto: 'A coordenação usa **Adicionar ponto** ou **Importar .xlsx** para colocar pontos no mapa.' },
      ],
    },
    {
      slug: 'diagnostico', pagina: 'diagnostico', versao: 2, icone: 'doc',
      perfis: ['super_admin', 'coordenacao'],
      titulo: 'Conferir as fichas do Diagnóstico', resumo: 'Conferir as entrevistas feitas no campo',
      passos: [
        { titulo: 'Como funciona', icone: 'doc',
          texto: 'Os técnicos fazem as entrevistas no **celular**, até sem internet. As fichas chegam aqui para você **conferir**.' },
        { titulo: 'As abas', alvo: '.dg-abas', icone: 'filtro', tela: 'clique:.dg-aba[data-aba="geral"]',
          texto: 'Use **Validação** para conferir as fichas e **Indicadores** para ver os números.' },
        { titulo: 'O aplicativo', alvo: '#dg-geral .btn-primary', icone: 'mapa',
          texto: 'Clique em **Abrir o app** para usar o aplicativo de entrevista.' },
        { titulo: 'Fichas para conferir', alvo: '.dgv-chips', icone: 'sino', tela: 'clique:.dg-aba[data-aba="validacao"]',
          texto: 'Clique em **Aguardando**. São as fichas que esperam por você.' },
        { titulo: 'Conferir uma ficha', icone: 'check',
          texto: 'Abra a ficha e leia as respostas.',
          lista: ['Está certa? Clique em **Validar**.', 'Tem erro? Clique em **Devolver ao técnico** e explique.'],
          nota: 'Resposta gravada em áudio precisa ser **escrita** antes de validar.' },
        { titulo: 'Planilha', alvo: '#dgv-btn-exportar', icone: 'doc',
          texto: 'Clique em **Exportar planilha**. Ela sai **sem nome nem endereço** das famílias.' },
        { titulo: 'Os números', alvo: '#dg-indicadores', icone: 'relatorio', tela: 'clique:.dg-aba[data-aba="indicadores"]',
          texto: 'Os resultados das entrevistas já conferidas.' },
      ],
    },
    {
      slug: 'pulso', pagina: 'pulso', versao: 2, icone: 'usuario',
      titulo: 'Fazer um Pulso da Equipe', resumo: 'Perguntar à equipe como ela está, sem identificar ninguém',
      passos: [
        { titulo: 'O que é o Pulso', icone: 'usuario',
          texto: 'São perguntas rápidas para saber **como a equipe está**. Ninguém é identificado.' },
        { titulo: 'Começar', alvo: '.btn-primary[onclick="PU.novo()"]', icone: 'mais',
          texto: 'Clique em **Novo ciclo**. Você pode usar as perguntas prontas.' },
        { titulo: 'Painel e Ciclo', alvo: '.pu-abas', icone: 'filtro', tela: 'clique:#pu-tab-painel',
          texto: '**Painel** mostra todos os seus ciclos. **Ciclo** mostra um deles em detalhe.' },
        { titulo: 'Avisos', alvo: '.pu-avisos', icone: 'sino', soTour: true,
          texto: 'Aqui aparece o que precisa de atenção, como ciclo sem respostas.' },
        { titulo: 'Seus ciclos', alvo: '.pu-filtros', icone: 'busca',
          texto: 'Na linha do ciclo, clique no ícone do **QR Code**. Ele aparece grande na tela. As pessoas apontam o celular e respondem.' },
        { titulo: 'Ninguém é identificado', icone: 'cadeado',
          texto: 'As respostas são guardadas **sem nome**. O resultado só aparece depois de **5 respostas**.',
          nota: 'Dá para mudar as perguntas só antes da primeira resposta.' },
      ],
    },
    {
      slug: 'usuarios', pagina: 'usuarios', versao: 2, icone: 'usuario',
      perfis: ['super_admin'],
      titulo: 'Cuidar dos usuários', resumo: 'Criar contas e ajudar quem esqueceu a senha',
      passos: [
        { titulo: 'O que é esta tela', icone: 'usuario',
          texto: 'Aqui você cria as contas das pessoas e escolhe o que cada uma pode ver.' },
        { titulo: 'Nova conta', alvo: '.ad-topo .btn-primary', icone: 'mais', tela: 'fechar:modal-usr',
          texto: 'Clique em **Novo usuário**. No próximo passo eu abro o cadastro para você ver.',
          nota: 'Fique tranquilo: aqui **nada é salvo**.' },
        { titulo: 'Nome e e-mail', alvo: '#nu-nome', icone: 'usuario', tela: 'abrir:abrirFormNovo',
          texto: 'Escreva o nome completo e o **e-mail** que a pessoa vai usar para entrar.' },
        { titulo: 'Perfil', alvo: '#nu-perfil', icone: 'cadeado', texto: 'O perfil decide o que a pessoa vê:',
          lista: ['**Coordenação**: cuida do projeto.', '**Técnico**: atividades e campo.', '**Financeiro**: pagamentos.', '**Visualizador**: só olha.'] },
        { titulo: 'Criar', alvo: '#nu-criar', icone: 'check',
          texto: 'Crie uma **senha temporária** e clique em **Criar usuário**. No primeiro acesso a pessoa troca a senha.',
          nota: 'Passe a senha só para a pessoa, nunca em grupo.' },
        { titulo: 'Quem precisa de você', alvo: '#stats', icone: 'sino', tela: 'fechar:modal-usr',
          texto: 'Clique em **Pedidos de nova senha** para ver quem esqueceu a senha.' },
        { titulo: 'Mudar uma conta', alvo: '#tbody-usuarios', icone: 'olho',
          texto: 'Clique na pessoa para mudar dados, acessos ou senha.',
          nota: '**Desativar** não apaga: a pessoa só deixa de entrar. Dá para reativar depois.' },
      ],
    },
  ]

  // ── Utilidades ───────────────────────────────────────────────────────────────────────
  const ESCOPO = 'plataforma'
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const perfil = () => { try { return (typeof appState !== 'undefined' && appState && appState.perfil) || null } catch (e) { return null } }
  const navAtual = () => window.AJUDA_NAV_ID || ''
  const visivel = g => !g.perfis || g.perfis.includes(perfil()) || g.pagina === navAtual()
  const daTela = g => g.pagina === '*' || g.pagina === navAtual()
  function concluido(g) {
    try {
      const p = (JSON.parse(localStorage.getItem('siguc_guia_' + ESCOPO) || '{}') || {})[g.slug]
      return !!p && p.versao === (g.versao || 1)
    } catch (e) { return false }
  }
  const alvoVisivel = sel => {
    const el = sel && document.querySelector(sel); if (!el) return false
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0
  }

  // ── Ações de tela (abrir/fechar janela, trocar de aba) — nunca salvam nada ─────────────
  const abertasPeloGuia = new Set()
  let menuPeloGuia = false
  function fecharJanela(id) {
    const el = document.getElementById(id); if (!el) return
    if (typeof window.fecharModal === 'function') { try { window.fecharModal(id); return } catch (e) {} }
    el.classList.remove('aberto')
  }
  function acao(tela) {
    String(tela || '').split(';').forEach(a => {
      const i = a.indexOf(':'); if (i < 0) return
      const tipo = a.slice(0, i).trim(), arg = a.slice(i + 1).trim()
      try {
        if (tipo === 'abrir' && typeof window[arg] === 'function') {
          const antes = new Set([...document.querySelectorAll('.modal-overlay.aberto')].map(e => e.id))
          // Registra a janela que ABRIU (para fechar no fim) e pede ao motor que recalcule o destaque
          // (evento resize): há telas que abrem o formulário de forma assíncrona (ex.: Novo protocolo).
          const registrar = () => {
            document.querySelectorAll('.modal-overlay.aberto').forEach(e => { if (!antes.has(e.id)) abertasPeloGuia.add(e.id) })
            window.dispatchEvent(new Event('resize'))
          }
          const r = window[arg]()
          registrar()
          if (r && typeof r.then === 'function') r.then(registrar, () => {})
          setTimeout(registrar, 400)
        } else if (tipo === 'fechar') {
          if (abertasPeloGuia.has(arg)) { fecharJanela(arg); abertasPeloGuia.delete(arg) }
        } else if (tipo === 'menu') {
          // Celular: o menu lateral fica fora da tela; o guia abre para mostrar e fecha depois.
          const celular = alvoVisivel('#mobile-menu-btn')
          if (arg === 'abrir' && celular && typeof window.abrirSidebarMobile === 'function') {
            window.abrirSidebarMobile(); menuPeloGuia = true
            // O menu entra deslizando: o motor recalcula o destaque no evento resize.
            setTimeout(() => window.dispatchEvent(new Event('resize')), 380)
          }
          if (arg === 'fechar' && menuPeloGuia && typeof window.fecharSidebarMobile === 'function') { window.fecharSidebarMobile(); menuPeloGuia = false }
        } else if (tipo === 'clique') {
          if (alvoVisivel(arg)) {
            document.querySelector(arg).click()
            // a aba pode desenhar o conteúdo depois (dados carregados): o motor recalcula no resize
            setTimeout(() => window.dispatchEvent(new Event('resize')), 450)
          }
        }
      } catch (e) { console.warn('[guias] ação', a, e) }
    })
  }
  // Guia fechado (concluído, pulado, Esc): fecha o que ele abriu.
  function vigiarFechamento() {
    if (typeof _guiaRaiz !== 'function') return
    const raiz = _guiaRaiz()
    if (raiz.dataset.vigiado) return
    raiz.dataset.vigiado = '1'
    new MutationObserver(() => {
      if (!raiz.hidden) return
      abertasPeloGuia.forEach(fecharJanela); abertasPeloGuia.clear()
      if (menuPeloGuia && typeof window.fecharSidebarMobile === 'function') { window.fecharSidebarMobile(); menuPeloGuia = false }
    }).observe(raiz, { attributes: true, attributeFilter: ['hidden'] })
  }

  // ── Central "Aprender a usar" ────────────────────────────────────────────────────────
  function abrirCentral() {
    if (typeof guiaAbrir !== 'function') return
    vigiarFechamento()
    const todos = GUIAS.filter(visivel)
    const aqui = todos.filter(daTela), fora = todos.filter(g => !daTela(g))
    const feitos = todos.filter(concluido).length
    const item = g => `
      <button class="guia-item" type="button" data-dg="${esc(g.slug)}">
        <span class="guia-item-ic">${bico(g.icone || 'help')}</span>
        <span class="guia-item-txt"><strong>${esc(g.titulo)}</strong>
          <span>${esc(g.resumo || '')}${daTela(g) ? '' : ` · tela ${esc(NOME_TELA[g.pagina] || g.pagina)}`}</span></span>
        <span class="guia-item-estado">${concluido(g)
          ? `<span class="guia-chip-ok">${bico('check')}Concluído</span>`
          : `<span class="guia-chip-n">${g.passos.length} passos</span>`}</span>
      </button>`
    const html = `
      <div class="guia-cab">
        <h2 class="guia-titulo">Aprender a usar</h2>
        <button class="guia-fechar" type="button" data-guia-fechar aria-label="Fechar">${bico('x')}</button>
      </div>
      <p class="guia-progresso">${feitos} de ${todos.length} guias concluídos. Escolha um e siga os passos.</p>
      ${aqui.length ? `<p class="dg-sec">Nesta tela</p><div class="guia-lista">${aqui.map(item).join('')}</div>` : ''}
      ${fora.length ? `<p class="dg-sec">Em outras telas <span>(o guia abre lá)</span></p><div class="guia-lista">${fora.map(item).join('')}</div>` : ''}
      <p class="guia-rodape">O guia só mostra e explica: nada é salvo. Saia quando quiser com o X ou a tecla Esc.
        Mais detalhes no <a href="ajuda.html">Manual completo</a>.</p>`
    if (typeof _guiaAbrirPainel === 'function') _guiaAbrirPainel(html, { modo: 'central' })
    else { guiaAbrirCentral(); return }
    document.querySelectorAll('#guia-raiz [data-dg]').forEach(b => b.addEventListener('click', () => abrir(b.dataset.dg)))
  }

  function abrir(slug) {
    const g = GUIAS.find(x => x.slug === slug); if (!g) return
    if (daTela(g)) { vigiarFechamento(); guiaAbrir(slug, { voltarCentral: false }); return }
    const pg = PAGINAS[g.pagina]; if (!pg) return
    location.href = pg + '?guia=' + encodeURIComponent(slug)
  }

  // ── Ligação com a tela ───────────────────────────────────────────────────────────────
  let definido = '', pendente = new URLSearchParams(location.search).get('guia'), convidou = false
  function ligar() {
    const btn = document.getElementById('topbar-aprender')
    if (!btn || typeof guiaDefinir !== 'function' || !perfil()) return
    const nav = navAtual()
    if (definido !== nav) {
      definido = nav
      guiaDefinir({ escopo: ESCOPO, titulo: 'Aprender a usar esta tela', guias: GUIAS.filter(g => daTela(g) && visivel(g)), aoTrocarTela: acao })
    }
    if (!btn.dataset.ligado) {
      btn.dataset.ligado = '1'; btn.hidden = false
      btn.addEventListener('click', abrirCentral)
    }
    if (pendente) {
      const slug = pendente; pendente = null
      try { const u = new URL(location.href); u.searchParams.delete('guia'); history.replaceState(null, '', u) } catch (e) {}
      abrirQuandoPronto(slug)
    } else if (!convidou) {
      convidou = true
      setTimeout(() => {
        if (document.getElementById('guia-raiz')?.hidden === false) return
        guiaConvite({ container: '.page-body', guia: 'passeio',
          titulo: 'Primeira vez por aqui?', texto: 'Em 2 minutos eu mostro onde fica cada coisa. Clique em Ver guia.' })
        // O botão do convite abre pelo motor; garantir que o fechamento limpe as janelas também.
        vigiarFechamento()
      }, 900)
    }
  }
  // Espera a tela desenhar o 1º alvo do guia (dados chegam depois do layout) — no máximo 8 s.
  function abrirQuandoPronto(slug) {
    const g = GUIAS.find(x => x.slug === slug)
    if (!g) return
    const alvo = (g.passos.find(p => p.alvo && !p.tela) || {}).alvo
    const t0 = Date.now()
    ;(function tentar() {
      if (!alvo || alvoVisivel(alvo) || Date.now() - t0 > 8000) { vigiarFechamento(); guiaAbrir(slug, { voltarCentral: false }); return }
      setTimeout(tentar, 250)
    })()
  }
  // As telas redesenham a barra de cima (ex.: Tarefas a cada filtro): religar sempre que o botão renascer.
  const obs = new MutationObserver(() => { const b = document.getElementById('topbar-aprender'); if (b && !b.dataset.ligado) ligar() })
  const iniciar = () => { obs.observe(document.body, { childList: true, subtree: true }); ligar() }
  if (document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar, { once: true })

  window.DimaGuias = Object.freeze({ abrirCentral, abrir, guias: () => GUIAS.slice() })
})()
