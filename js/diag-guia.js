// ── Diagnóstico · guia de treinamento do app de campo ─────────────────
// Só CONTEÚDO. O motor (overlay, passos, destaque, "já visto") é o do SIGUC,
// copiado sem alteração em js/guia-app.js + css/guia-app.css — não editar lá,
// copiar de novo do SIGUC (mesma regra do baralho do PIN).
//
// Progresso fica só no aparelho (localStorage do motor). Não há registro no
// banco de quem concluiu (decisão de 26/09: sem tabela nova com dado pessoal).
// O motor tenta chamar a RPC capacitacao_registrar_conclusao, que não existe
// no DIMA; o cliente abaixo, que ele procura antes do `db`, responde "ok"
// sem ir à rede — assim não há chamada falhando a cada abertura do app.
// Passo com `alvo` destaca o elemento real quando ele está na tela; fora dela
// vira cartão de texto (regra do motor).

window._bioDB_client = { rpc: async () => ({ data: null, error: null }) }

// Ícones do guia (o motor pede bico(nome); o app não tem outro conjunto).
const _DIAG_GUIA_IC = {
  help:   '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>',
  x:      '<path d="M6 6l12 12M18 6L6 18"/>',
  check:  '<path d="M5 12l5 5 9-10"/>',
  chave:  '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
  ficha:  '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM8 11h8M8 15h6"/>',
  casa:   '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  enviar: '<path d="M4 12l16-8-6 16-3-7z"/>',
  voltar: '<path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  treino: '<path d="M3 20h18M6 16v-5M11 16V7M16 16v-8"/>',
  sinal:  '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/>',
  gps:    '<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
}
function bico(nome) {
  const p = _DIAG_GUIA_IC[nome]; if (!p) return ''
  return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'
}

const DIAG_GUIA = {
  escopo: 'diagnostico',
  titulo: 'Ajuda e treinamento',
  guias: [
    { slug: 'primeiros-passos', titulo: 'Primeiros passos', icone: 'chave', versao: 1,
      resumo: 'PIN, sinal de internet e sincronizar antes de sair',
      passos: [
        { titulo: 'Bem-vindo ao Diagnóstico', icone: 'help',
          texto: 'O app funciona **sem internet**. Tudo o que você registra fica guardado no celular e é enviado quando houver sinal.' },
        { titulo: 'Seu PIN de campo', icone: 'chave',
          texto: 'O PIN de 4 dígitos abre o app no dia a dia. E-mail e senha só são pedidos na primeira vez ou se você esquecer o PIN.',
          nota: 'Fichas que ainda não foram enviadas ficam só neste celular. **Sincronize sempre que tiver sinal.**' },
        { titulo: 'Antes de ir a campo: sincronize', icone: 'enviar', alvo: '#btn-sync',
          texto: 'Com internet, toque em **Sincronizar**. O app baixa o questionário e as comunidades e envia o que estiver na fila.' },
        { titulo: 'Online ou offline', icone: 'sinal', alvo: '#ini-rede',
          texto: 'Este selo mostra se há sinal agora. **Offline não é problema**: continue trabalhando normalmente.' },
      ] },
    { slug: 'entrevista', titulo: 'Fazer uma entrevista', icone: 'ficha', versao: 3,
      resumo: 'Do aviso ao entrevistado até o último bloco',
      passos: [
        { titulo: 'Nova entrevista', icone: 'ficha', alvo: '#btn-nova',
          texto: 'Escolha data, município, comunidade e, se houver, a sublocalidade.' },
        { titulo: 'Leia o aviso', icone: 'help',
          texto: 'Leia o aviso em voz alta antes de começar e marque se a família **autoriza as fotos** e **a gravação de áudio** (duas perguntas separadas). Se a pessoa **recusar** a entrevista, registre a recusa: ela também conta.' },
        { titulo: 'Blocos e "Não respondeu"', icone: 'ficha',
          texto: 'Use **Não respondeu** quando a pessoa não quiser ou não souber responder. Pergunta deixada em branco vira pendência na revisão.' },
        { titulo: 'Gravar a resposta', icone: 'ficha',
          texto: 'Nas perguntas de texto aberto, com a autorização da família, toque em **Gravar resposta** (até 3 minutos) e em **Parar**. Dá para ouvir e gravar de novo. Escreva a resposta no campo quando puder: sem texto, a coordenação transcreve na mesa antes de validar.' },
        { titulo: 'Localização da casa', icone: 'gps',
          texto: 'Toque em **Registrar localização agora** em frente à casa. O app mostra a precisão (±m). Não é obrigatório.' },
      ] },
    { slug: 'moradores', titulo: 'Moradores', icone: 'casa', versao: 1,
      resumo: 'Quem mora na casa, idade e escolaridade',
      passos: [
        { titulo: 'Um por um', icone: 'casa',
          texto: 'Inclua cada morador da casa. O nome fica protegido e não aparece para consultores.' },
        { titulo: 'Escolaridade', icone: 'casa',
          texto: 'Escolha a etapa **mais alta que a pessoa frequentou**, completa ou incompleta.' },
      ] },
    { slug: 'fotos', titulo: 'Fotos', icone: 'camera', versao: 2,
      resumo: 'Autorização, o que fotografar e o carimbo',
      passos: [
        { titulo: 'Primeiro, a autorização', icone: 'camera',
          texto: 'Depois do aviso, pergunte **separadamente** se a família autoriza fotografar a casa e o entorno. Se a resposta for **Não**, a câmera fica desligada naquela ficha e a entrevista segue normalmente.' },
        { titulo: 'O que fotografar', icone: 'camera',
          texto: 'Até **8 fotos** por ficha, escolhendo o tema antes de cada uma.',
          lista: ['Casa, fonte de água, esgoto, lixo, produção, acesso ou problema ambiental',
                  '**Nunca fotografe pessoas**, nem de costas',
                  'Só com a autorização da família'] },
        { titulo: 'O carimbo', icone: 'camera',
          texto: 'Cada foto recebe código da ficha, data, hora, GPS e seu nome. Não precisa anotar nada à parte.' },
      ] },
    { slug: 'revisar', titulo: 'Revisar e enviar', icone: 'enviar', versao: 1,
      resumo: 'Pendências agrupadas e fila de envio',
      passos: [
        { titulo: 'Revisão', icone: 'ficha',
          texto: 'Ao terminar, o app lista o que ficou em branco. Toque em **Resolver pendências** e vá de uma em uma com **Próxima →**.' },
        { titulo: 'Fila de envio', icone: 'enviar',
          texto: 'A ficha salva entra na **fila** e sobe sozinha quando houver sinal. Nunca desinstale o app com fichas na fila.' },
      ] },
    { slug: 'devolvida', titulo: 'Ficha devolvida', icone: 'voltar', versao: 1,
      resumo: 'Quando a coordenação pede correção',
      passos: [
        { titulo: 'Aviso na tela inicial', icone: 'voltar',
          texto: 'A ficha devolvida aparece em destaque. Ao abrir, você vê o **motivo** da coordenação e as pendências.' },
        { titulo: 'Corrigir e reenviar', icone: 'enviar',
          texto: 'Ajuste o que foi pedido e salve de novo. Ela volta para a fila.' },
      ] },
    { slug: 'treino-painel', titulo: 'Modo treino e Meu painel', icone: 'treino', versao: 1,
      resumo: 'Praticar sem misturar com os dados reais; seus números',
      passos: [
        { titulo: 'Modo treino', icone: 'treino',
          texto: 'Com o modo treino ligado (em Configurações), as fichas saem com código **TRE-**, não entram nos números e podem ser apagadas. **Nunca use com família de verdade.**' },
        { titulo: 'Meu painel', icone: 'treino', alvo: '#aba-painel',
          texto: 'Mostra só as **suas** entrevistas: total, por dia, por comunidade e tempo médio.' },
      ] },
  ],
  verbetes: {},
}

// Chamado ao entrar na tela inicial. Idempotente.
function diagGuiaIniciar() {
  if (typeof guiaDefinir !== 'function') return
  if (!guiaCatalogo()) guiaDefinir(DIAG_GUIA)
  if (guiaAlgumConcluido()) document.getElementById('guia-convite')?.remove()
  guiaConvite({ container: '#ini-guia', guia: 'primeiros-passos',
    titulo: 'Primeira vez por aqui?', texto: 'Um guia de 3 minutos mostra como usar o app.' })
  guiaBotaoFlutuante({ dica: 'Dúvida em campo? Toque aqui.' })
  guiaBotaoFlutuanteVisivel(true)
}
