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
  }
  const NOME_TELA = {
    tarefas: 'Tarefas', tdrs: 'TDRs', produtos: 'Produtos Entregues', financeiro: 'Financeiro', relatorios: 'Relatórios',
    dashboard: 'Visão Geral', atividades: 'Atividades', contratos: 'Contratos', remanejamentos: 'Remanejamento', viagens: 'Viagens',
  }

  // ── CONTEÚDO ─────────────────────────────────────────────────────────────────────────
  // Linguagem simples: frases curtas, um passo por vez, sem sigla sem explicação.
  const GUIAS = [
    {
      slug: 'passeio', pagina: '*', versao: 1, icone: 'mapa',
      titulo: 'Passeio pelo sistema', resumo: 'Menu, avisos, seu perfil e onde pedir ajuda (2 minutos)',
      passos: [
        { titulo: 'Bem-vindo!', icone: 'help',
          texto: 'Este passeio mostra **onde fica cada coisa**. Ele não muda nada no sistema: você só lê e avança.',
          nota: 'Pode sair quando quiser, pelo **X** ou pela tecla **Esc**. O passeio fica disponível no botão **Aprender**.' },
        { titulo: 'O menu', icone: 'menu', alvo: '#sidebar .sidebar-nav', tela: 'menu:abrir',
          texto: 'O menu da esquerda leva a todas as telas: Visão Geral, Tarefas, TDRs, Contratos, Financeiro e outras.',
          lista: ['Os grupos (Planejamento, Execução…) abrem e fecham com um toque no título.',
            'No celular, o menu abre pelo botão de **três tracinhos**, no canto de cima.'] },
        { titulo: 'Avisos', icone: 'sino', alvo: '#sino-btn', tela: 'menu:fechar',
          texto: 'O **sino** mostra os avisos: tarefa nova para você, entrega para avaliar, pedido para assinar.',
          nota: 'O número vermelho é quantos avisos você ainda não leu. Tocar no aviso leva direto ao assunto.' },
        { titulo: 'Seu perfil', icone: 'usuario', alvo: '#user-avatar-btn',
          texto: 'Na sua foto (ou iniciais) ficam **Meu perfil**, a troca de senha e o botão **Sair**.' },
        { titulo: 'Tela clara ou escura', icone: 'tema', alvo: '.dgm-tema, .tk-tema', soTour: true,
          texto: 'Escolha **Claro** ou **Escuro**, o que for mais confortável para a sua vista. Vale para todas as telas.' },
        { titulo: 'Aprender a usar', icone: 'aprender', alvo: '#topbar-aprender',
          texto: 'O botão **Aprender** abre os **guias passo a passo**: como cadastrar um TDR, avaliar uma entrega, gerar um relatório e outros.',
          lista: ['No celular, ele fica no menu: **Aprender a usar**.', 'Também está no menu da sua foto e no Manual.'],
          nota: 'Cada tela tem os seus guias. Os desta tela aparecem primeiro.' },
        { titulo: 'Dúvida rápida', icone: 'help', alvo: '#ajuda-btn',
          texto: 'O botão **?** abre a ajuda da tela em que você está. Lá também há o **Manual completo**, com busca.' },
        { titulo: 'Pronto!', icone: 'check',
          texto: 'Agora escolha o que você quer aprender. Toque em **Aprender**, na barra de cima, a qualquer momento.' },
      ],
    },
    {
      slug: 'tarefas', pagina: 'tarefas', versao: 1, icone: 'tarefa',
      titulo: 'Minhas tarefas', resumo: 'Ver o que é seu, abrir, comentar e entregar uma tarefa',
      passos: [
        { titulo: 'O painel de Tarefas', icone: 'tarefa',
          texto: 'Aqui ficam as tarefas da equipe: quem faz, até quando e em que pé está.' },
        { titulo: 'O resumo do topo', alvo: '#tk-sub', icone: 'olho',
          texto: 'Em uma linha: quantas tarefas estão **abertas**, quantas estão **atrasadas** e quantas **vencem esta semana**.' },
        { titulo: 'Formas de ver', alvo: '.tk .toolbar .seg', icone: 'filtro',
          texto: 'Escolha como ver as tarefas:',
          lista: ['**Quadro**: colunas por etapa.', '**Lista**: uma tarefa por linha.',
            '**Calendário**: pelo prazo.', '**Minhas**: só as que são suas. Comece por aqui.'] },
        { titulo: 'Procurar', alvo: '#tk-busca', icone: 'busca',
          texto: 'Digite o número ou uma palavra do título. Ao lado há filtros por responsável, tipo e prioridade, e o botão **Atrasadas**.' },
        { titulo: 'O quadro', alvo: '.tk .board .col', icone: 'tarefa',
          texto: 'Cada coluna é uma etapa: **A fazer**, **Em andamento**, **Em revisão**, **Bloqueada** e **Concluída**.',
          nota: 'Para mudar a etapa, arraste o cartão para outra coluna.' },
        { titulo: 'Abrir uma tarefa', icone: 'olho',
          texto: '**Clique no cartão** para abrir. Dentro dela você comenta, anexa arquivos e marca as subtarefas feitas.' },
        { titulo: 'Terminei. E agora?', icone: 'check',
          texto: 'Use **Enviar para revisão** e escreva o que foi feito. Quem criou a tarefa confere e conclui.',
          nota: 'Se a tarefa voltar para você, o motivo aparece no histórico dela.' },
        { titulo: 'Criar uma tarefa', alvo: '.tk .tk-head .btn-pri', icone: 'mais',
          texto: 'Para pedir algo a alguém (ou lembrar a si mesmo), use **Nova tarefa**: título, responsável e prazo.' },
      ],
    },
    {
      slug: 'avaliar-entrega', pagina: 'produtos', versao: 1, icone: 'entrega',
      perfis: ['super_admin', 'coordenacao', 'tecnico'],
      titulo: 'Avaliar uma entrega', resumo: 'Conferir o produto, decidir e assinar com a senha',
      passos: [
        { titulo: 'Quem avalia', icone: 'entrega',
          texto: 'Quando o fornecedor entrega um produto do contrato, o **responsável pela atividade** (ou o substituto) confere e decide.',
          nota: 'Se você não for responsável pela atividade, a entrega abre só para leitura.' },
        { titulo: 'O que espera por você', alvo: '#stats', icone: 'filtro',
          texto: 'Os números do topo também são **filtros**. Toque em **Em avaliação** para ver só o que aguarda a sua decisão.' },
        { titulo: 'Encontrar o produto', alvo: '.pr-filtros', icone: 'busca',
          texto: 'Se a lista for grande, filtre por **atividade**, **fornecedor** ou **contrato**.' },
        { titulo: 'Abrir a avaliação', alvo: '#conteudo', icone: 'olho',
          texto: 'Cada linha é um produto. No fim da linha, o botão **Avaliar** abre a janela de avaliação.' },
        { titulo: '1. Confira o que chegou', icone: 'doc',
          texto: 'Na janela, veja as abas **Documentos**, **Fotos**, **Mapa** e **Indicadores**. Abra os arquivos antes de decidir.' },
        { titulo: '2. Confirme', icone: 'check',
          texto: 'Marque a caixa amarela: "o produto corresponde ao contratado". Sem ela, a decisão não libera.' },
        { titulo: '3. Decida', icone: 'entrega', texto: 'Escolha uma das três opções:',
          lista: ['**Aprovar**: o produto está completo.', '**Parcial**: aprova uma parte (você informa a porcentagem).',
            '**Devolução**: volta ao fornecedor para corrigir. Explique o que falta.'] },
        { titulo: '4. Nota Técnica (para aprovar)', icone: 'doc',
          texto: 'Para aprovar, anexe a **Nota Técnica em PDF do SEI**. O sistema confere sozinho: assinatura, número do contrato, produto e fornecedor.',
          nota: 'Se faltar algo, ele diz exatamente o quê. Há um **modelo pronto** para baixar na própria janela.' },
        { titulo: '5. Despacho e senha', icone: 'cadeado',
          texto: 'Escreva o despacho (o texto da sua decisão) e confirme com a **sua senha de login**. A senha vale como a sua assinatura.' },
        { titulo: 'Depois de aprovar', icone: 'pagar',
          texto: 'O produto aprovado segue para o **Financeiro** pagar. Você acompanha a situação na mesma lista.' },
      ],
    },
    {
      slug: 'novo-tdr', pagina: 'tdrs', versao: 1, icone: 'doc',
      perfis: ['super_admin', 'coordenacao', 'tecnico'],
      titulo: 'Cadastrar um TDR', resumo: 'Do formulário até o TDR aparecer como Rascunho',
      passos: [
        { titulo: 'O que é um TDR', icone: 'doc',
          texto: '**TDR** (Termo de Referência) descreve **o que** será contratado e **quanto** vai custar. Ao nascer, ele reserva esse valor no orçamento da atividade.' },
        { titulo: 'Situação dos TDRs', alvo: '#stats', icone: 'filtro', tela: 'fechar:modal-novo',
          texto: 'Os números do topo mostram quantos TDRs há em cada fase. Toque num deles para filtrar a lista.' },
        { titulo: 'Procurar', alvo: '.td-filtros', icone: 'busca',
          texto: 'Busque pelo número ou pelo objeto, e filtre por fase, tipo (PF ou PJ) e responsável.' },
        { titulo: 'Novo TDR', alvo: '.td-filtros .btn-primary', icone: 'mais',
          texto: 'O botão **Novo TDR** abre o formulário. No próximo passo o guia abre o formulário para você ver, **sem salvar nada**.' },
        { titulo: 'Atividade', alvo: '#n-ativ', icone: 'doc', tela: 'abrir:abrirNovo',
          texto: 'Escolha a **atividade** do projeto que vai pagar este TDR, e o **tipo**: PF (pessoa física) ou PJ (empresa).' },
        { titulo: 'Objeto', alvo: '#n-objeto', icone: 'doc',
          texto: 'Descreva em poucas linhas **o que será contratado**. Na qualificação, diga a formação e a experiência exigidas.' },
        { titulo: 'Valor', alvo: '#n-brl', icone: 'pagar',
          texto: 'Informe o **valor em reais**. É obrigatório.',
          nota: 'O sistema só aceita se o valor **couber no saldo livre** da atividade. Se não couber, ele avisa; aí é preciso pedir remanejamento.' },
        { titulo: 'Arquivo', alvo: '#n-arquivo', icone: 'doc',
          texto: 'Se já tiver o documento do TDR (.docx ou .pdf), anexe aqui. Pode anexar depois também.' },
        { titulo: 'Criar', alvo: '#btn-criar', icone: 'check',
          texto: 'Revise e clique em **Criar TDR**. Ele aparece na lista como **Rascunho**.',
          nota: 'Neste guia nada foi salvo: o formulário fecha ao terminar.' },
        { titulo: 'Depois de criado', alvo: '#lista', icone: 'olho', tela: 'fechar:modal-novo',
          texto: 'Clique no cartão do TDR para acompanhar as fases: revisão, envio à UNESCO, aprovação, licitação e contratação.' },
      ],
    },
    {
      slug: 'efetivar-pagamento', pagina: 'financeiro', versao: 1, icone: 'pagar',
      perfis: ['super_admin', 'financeiro'],
      titulo: 'Efetivar um pagamento', resumo: 'Do lançamento "A pagar" ao pagamento confirmado com senha',
      passos: [
        { titulo: 'Como o pagamento funciona', icone: 'pagar',
          texto: 'Todo lançamento nasce **A pagar**. Quando o dinheiro sai de fato, alguém do Financeiro **efetiva o pagamento** e confirma com a senha.' },
        { titulo: 'Os totais', alvo: '#stats', icone: 'olho',
          texto: 'O topo mostra quanto já foi **pago**, quanto está **a pagar** e os valores em dólar.' },
        { titulo: 'Formas de ver', alvo: '.fi-tabs', icone: 'filtro',
          texto: '**Lançamentos** mostra um por linha. **Por atividade** e **Por resultado** somam os valores.' },
        { titulo: 'Só o que falta pagar', alvo: '#fil-sit', icone: 'filtro',
          texto: 'Em **Situação**, escolha **A pagar**. A lista mostra só o que está pendente.' },
        { titulo: 'Pagar', alvo: '.fi-btn.pagar', icone: 'pagar', soTour: true,
          texto: 'Na linha do lançamento, clique em **Pagar**. Abre a janela de pagamento.' },
        { titulo: 'Na janela de pagamento', icone: 'doc', texto: 'Preencha:',
          lista: ['A **data** em que o pagamento foi feito.', 'O valor em dólar pago pela **UNESCO** (câmbio do dia).',
            'O **comprovante** em PDF.'] },
        { titulo: 'Confirmar com a senha', icone: 'cadeado',
          texto: 'Clique em confirmar e digite a **sua senha de login**. Só depois disso o pagamento vale.',
          nota: 'Pagamento efetivado fica travado. Se houver erro, fale com o Financeiro.' },
        { titulo: 'Despesa nova', alvo: '.fi-barra .fi-btn.pri', icone: 'mais',
          texto: 'Para registrar uma despesa que ainda não está na lista, use **Novo lançamento**. Ele sempre começa como A pagar.' },
      ],
    },
    {
      slug: 'relatorio-pdf', pagina: 'relatorios', versao: 1, icone: 'relatorio',
      perfis: ['super_admin', 'coordenacao', 'financeiro'],
      titulo: 'Gerar um relatório em PDF', resumo: 'Escolher, filtrar, gerar e salvar em PDF',
      passos: [
        { titulo: 'Relatórios prontos', icone: 'relatorio',
          texto: 'O sistema tem dezenas de relatórios prontos, em folha A4, com logos e numeração de páginas.' },
        { titulo: 'Procurar pelo nome', alvo: '#re-q', icone: 'busca',
          texto: 'Digite uma palavra: "saldo", "contrato", "viagem"…' },
        { titulo: 'Ou pelo tema', alvo: '#temas-grid', icone: 'filtro',
          texto: 'Os botões de tema (TDRs, Contratos, Financeiro…) mostram só os relatórios daquele assunto.' },
        { titulo: 'Escolher', alvo: '#rel-lista', icone: 'doc',
          texto: 'Clique no relatório desejado. No próximo passo o guia escolhe o primeiro da lista, só para mostrar.' },
        { titulo: 'Filtros', alvo: '#filtros-form', icone: 'filtro', tela: 'clique:#rel-lista .re-it',
          texto: 'Cada relatório tem os seus filtros: período, atividade, fornecedor… Deixe em branco para ver tudo.' },
        { titulo: 'Gerar', alvo: '#filtros-form .re-ac .btn-primary', icone: 'relatorio',
          texto: 'Clique em **Gerar relatório**. A folha aparece logo abaixo, para você conferir.' },
        { titulo: 'Salvar em PDF ou Excel', alvo: '#re-btn-exp', icone: 'doc',
          texto: 'Depois de gerar, **Exportar** libera o PDF e a planilha.',
          nota: 'O PDF sai pela janela de impressão do navegador: em "Destino", escolha **Salvar como PDF**. Tabelas largas ficam melhores em **Paisagem**.' },
      ],
    },
    {
      slug: 'visao-geral', pagina: 'dashboard', versao: 1, icone: 'relatorio',
      titulo: 'Ler a Visão Geral', resumo: 'As guias do painel, os gráficos e como exportar',
      passos: [
        { titulo: 'O painel do projeto', icone: 'relatorio',
          texto: 'A Visão Geral junta os principais números do projeto numa tela só. Os dados se atualizam sozinhos com o que é registrado nas outras telas.' },
        { titulo: 'As guias', alvo: '.vg-tabs', icone: 'filtro',
          texto: 'Cada guia mostra um assunto. Toque no nome para trocar. O guia vai mostrar algumas delas para você.' },
        { titulo: 'Financiadores', alvo: '#pane-financiadores .vg-kpis', icone: 'pagar', tela: 'clique:.vg-tab[data-aba="financiadores"]',
          texto: 'Os números gerais: quanto foi **comprometido** em TDRs, quanto já foi **pago** e o que ainda está **livre**.' },
        { titulo: 'Os gráficos', alvo: '#pane-financiadores .vg-card', icone: 'olho',
          texto: 'Toque numa barra ou num trecho colorido para ver o detalhe. O botão **Ver como tabela** mostra os mesmos números em lista.' },
        { titulo: 'Alertas', alvo: '#pane-alertas', icone: 'sino', tela: 'clique:.vg-tab[data-aba="alertas"]',
          texto: 'Aqui aparece o que pede atenção, como prazos e pendências. O número ao lado do nome da guia diz quantos alertas há.' },
        { titulo: 'Minhas tarefas', alvo: '#pane-tarefas', icone: 'tarefa', tela: 'clique:.vg-tab[data-aba="tarefas"]',
          texto: 'As suas tarefas abertas, sem precisar ir ao painel de Tarefas.' },
        { titulo: 'Saldo de orçamento', alvo: '.vg-tab[data-aba="saldo"]', icone: 'pagar', soTour: true,
          texto: 'Mostra, atividade por atividade, quanto do orçamento ainda está livre. Dali sai também o relatório A4 de saldo.' },
        { titulo: 'Exportar', alvo: '.vg-exp-btn', icone: 'doc', tela: 'clique:.vg-tab[data-aba="financiadores"]',
          texto: 'Leva as guias para **PDF**, **Excel**, **PowerPoint** ou um arquivo HTML. Você escolhe quais guias entram.' },
      ],
    },
    {
      slug: 'atividades', pagina: 'atividades', versao: 1, icone: 'tarefa',
      titulo: 'Acompanhar as atividades', resumo: 'Orçamento, execução, responsáveis e TDRs de cada atividade',
      passos: [
        { titulo: 'O que é uma atividade', icone: 'tarefa',
          texto: 'O plano do projeto é dividido em **atividades** (2.1.1, 2.1.2…). Cada uma tem orçamento em dólar, responsáveis e os TDRs que a executam.' },
        { titulo: 'Os números do topo', alvo: '#stats-row', icone: 'olho',
          texto: 'O resumo de todas as atividades: orçamento, quanto foi pago e quanto está comprometido.' },
        { titulo: 'Por resultado', alvo: '#fil-resultado', icone: 'filtro',
          texto: 'O projeto tem quatro resultados (R1 a R4). Toque em um para ver só as atividades dele.' },
        { titulo: 'Mais filtros', alvo: '.at-filtros', icone: 'busca',
          texto: 'Busque pelo código ou nome e filtre por fase, por TDR (ex.: **Sem responsável**), por ODS ou meta Kunming-Montreal.' },
        { titulo: 'A lista', alvo: '#tbody-atividades', icone: 'olho',
          texto: 'Uma atividade por linha. Na coluna **Execução**, a barra mostra o que foi **pago** e o que está **comprometido**; o que sobra está livre.',
          nota: 'Barra vermelha: o comprometido passou do orçamento da atividade.' },
        { titulo: 'Tarefas da atividade', alvo: '.at-tbl .tv-btn', icone: 'tarefa', soTour: true,
          texto: 'O botão de tarefas mostra quantas ainda faltam fazer nessa atividade. Toque para ver e criar uma nova já ligada a ela.' },
        { titulo: 'Abrir uma atividade', icone: 'doc',
          texto: 'Clique na linha para abrir: detalhes, fase, responsáveis, ODS e metas.',
          nota: 'O orçamento tem **cadeado**: só muda por **remanejamento**, nunca digitando.' },
      ],
    },
    {
      slug: 'contratos', pagina: 'contratos', versao: 1, icone: 'doc',
      perfis: ['super_admin', 'coordenacao', 'financeiro'],
      titulo: 'Cadastrar e acompanhar contratos', resumo: 'Contrato ligado ao TDR, valor, execução e encerramento',
      passos: [
        { titulo: 'Contrato nasce do TDR', icone: 'doc',
          texto: 'Depois da licitação, o contrato é cadastrado **ligado ao TDR**. O valor que ele usa é o que já estava reservado no TDR.' },
        { titulo: 'Os números do topo', alvo: '#stats', icone: 'filtro', tela: 'fechar:modal-contrato',
          texto: 'Contratado, pago e contratos **sem PDF assinado**. Toque num número para filtrar a lista.' },
        { titulo: 'Contrato travado', alvo: '#ct-travados .ct-travado', icone: 'cadeado', soTour: true,
          texto: 'Esta faixa aparece quando um contrato passou do valor do TDR e a atividade não tem saldo. Ele fica **travado** até alguém **pedir cobertura** em Remanejamento.' },
        { titulo: 'Procurar', alvo: '.ct-filtros', icone: 'busca',
          texto: 'Busque pelo número, objeto ou fornecedor e filtre a lista.' },
        { titulo: 'A lista', alvo: '#tbody', icone: 'olho',
          texto: 'Na coluna de valor, a barra mostra o que foi **pago** (verde) e o que está **a pagar**. Clique numa linha para abrir o contrato.' },
        { titulo: 'Novo contrato', alvo: '.ct-filtros .ct-btn.pri', icone: 'mais',
          texto: 'O botão **Novo contrato** abre o formulário. No próximo passo o guia abre para você ver, **sem salvar nada**.' },
        { titulo: 'TDR e atividade', alvo: '#f-tdr', icone: 'doc', tela: 'abrir:abrirNovo',
          texto: 'Escolha o **TDR** do contrato. A **atividade** é preenchida sozinha a partir dele.' },
        { titulo: 'Fornecedor', alvo: '#f-forn', icone: 'usuario',
          texto: 'Escolha a empresa ou pessoa contratada. Se ela não estiver na lista, cadastre antes em **Fornecedores**.' },
        { titulo: 'Valor total', alvo: '#f-total', icone: 'pagar',
          texto: 'Informe o valor total do contrato em reais.',
          nota: 'Se passar do valor do TDR e a atividade não tiver saldo, o contrato fica **travado aguardando cobertura**.' },
        { titulo: 'Valor utilizado', alvo: '#f-usado', icone: 'cadeado',
          texto: 'Este campo **não se digita**: ele soma os pagamentos lançados no Financeiro.' },
        { titulo: 'Encerrar um contrato', icone: 'check', tela: 'fechar:modal-contrato',
          texto: 'Contrato todo pago encerra sozinho. Se sobrou produto que não vai ser entregue, abra o contrato e use **Pedir encerramento**: o responsável pela atividade aprova com a senha e o saldo volta para a atividade.' },
      ],
    },
    {
      slug: 'remanejamento', pagina: 'remanejamentos', versao: 1, icone: 'pagar',
      titulo: 'Remanejamento: analisar e assinar', resumo: 'Como um pedido anda e como você assina a sua etapa',
      passos: [
        { titulo: 'O que é remanejamento', icone: 'pagar',
          texto: '**Remanejar** é tirar saldo livre de uma atividade e levar para outra. O pedido passa por **cinco assinaturas** e só muda o orçamento depois da última.' },
        { titulo: 'Os números do topo', alvo: '#rm-kpis', icone: 'olho',
          texto: 'Quanto pode ser remanejado, quanto está **reservado** em pedidos andando e se há atividade com **déficit**.' },
        { titulo: 'As abas', alvo: '#rm-abas', icone: 'filtro',
          texto: '**Saldos por resultado** mostra de onde vem cada dólar. **Pedidos** é a fila. **Como funciona** explica tudo com calma.' },
        { titulo: 'O que espera por você', alvo: '.rm-chips', icone: 'sino', tela: 'clique:#rm-abas .rm-aba[onclick*="pedidos"]',
          texto: 'Em **Aguardando minha análise** ficam só os pedidos que estão na **sua** etapa. Você também recebe aviso no sino e por e-mail.' },
        { titulo: 'A ordem das assinaturas', icone: 'check', texto: 'Cada etapa é de uma pessoa, nesta ordem:',
          lista: ['1. Coordenação (quem pede)', '2. Responsável por cada atividade que cede o saldo', '3. Financeiro da UNESCO',
            '4. Diretor', '5. Secretário — aí o orçamento muda.'] },
        { titulo: 'Assinar a sua etapa', icone: 'cadeado',
          texto: 'Abra o pedido, confira as atividades e os valores e clique em **Assinar**. Digite a **sua senha de login**: ela vale como assinatura.',
          nota: 'Se algo estiver errado, use **Devolver** e escreva o motivo. O pedido volta uma etapa.' },
        { titulo: 'Fazer um pedido', alvo: '#rm-abas .rm-aba[onclick*="novo"]', icone: 'mais', soTour: true,
          texto: 'A coordenação monta o pedido em **Novo pedido**: escolhe de onde sai o saldo, para onde vai e escreve a justificativa.' },
        { titulo: 'Dúvidas', alvo: '#rm-corpo', icone: 'help', tela: 'clique:#rm-abas .rm-aba[onclick*="guia"]',
          texto: 'A aba **Como funciona** tem o passo a passo completo e as perguntas mais comuns. Os botões **?** ao lado dos títulos explicam cada termo.' },
      ],
    },
    {
      slug: 'viagens', pagina: 'viagens', versao: 1, icone: 'mapa',
      perfis: ['super_admin', 'coordenacao', 'financeiro', 'tecnico'],
      titulo: 'Pedir uma viagem', resumo: 'Protocolo de passagens e diárias, do rascunho à prestação de contas',
      passos: [
        { titulo: 'O protocolo de viagem', icone: 'mapa',
          texto: 'Para viajar pelo projeto, faça um **protocolo**: quem vai, para onde, quando e por quê. Passagens e diárias são pagas pela **UNESCO**.' },
        { titulo: 'Quanto resta', alvo: '#tdr-direta', icone: 'pagar', soTour: true, tela: 'fechar:modal-prot',
          texto: 'Este quadro mostra quanto ainda há no TDR de **passagens e diárias**. Quando ele acaba, novas viagens não são aprovadas.' },
        { titulo: 'Os números do topo', alvo: '#stats', icone: 'filtro',
          texto: 'Quantos protocolos há em cada situação. Toque num número para filtrar. A lista abre em **Em andamento**.' },
        { titulo: 'Procurar', alvo: '.vi-filtros', icone: 'busca',
          texto: 'Busque por protocolo, viajante, destino ou número do SEI.' },
        { titulo: 'Novo protocolo', alvo: '.vi-acoes .btn-primary', icone: 'mais',
          texto: 'O botão **Novo protocolo** abre o formulário. No próximo passo o guia abre para você ver, **sem salvar nada**.' },
        { titulo: 'Objetivo', alvo: '#f-objetivo', icone: 'doc', tela: 'abrir:abrirFormNovo',
          texto: 'Escreva o motivo da viagem ou o nome do evento.' },
        { titulo: 'Destino e datas', alvo: '#f-destino', icone: 'mapa',
          texto: 'Informe o **destino** e as datas de **ida** e **volta**. Elas passam sozinhas para os viajantes.' },
        { titulo: 'Viajantes', alvo: '#viajantes-container', icone: 'usuario',
          texto: 'Para cada pessoa: escolha o **beneficiário**, os **trechos** de passagem e as **diárias**. O total aparece no fim.' },
        { titulo: 'Salvar e enviar', alvo: '#btn-salvar-rasc', icone: 'check',
          texto: 'Primeiro **Salvar rascunho**. Depois **Enviar para aprovação**.',
          nota: 'Neste guia nada foi salvo: o formulário fecha ao terminar.' },
        { titulo: 'Depois de enviar', icone: 'cadeado', tela: 'fechar:modal-prot',
          texto: 'O administrador aprova com a senha. Quem está no protocolo não pode aprovar o próprio pedido.',
          nota: 'Depois da viagem, faça a **prestação de contas em até 5 dias** (cartões de embarque e relatório).' },
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
          if (alvoVisivel(arg)) document.querySelector(arg).click()
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
          titulo: 'Primeira vez por aqui?', texto: 'Um passeio de 2 minutos mostra onde fica cada coisa. Toque em Ver guia.' })
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
