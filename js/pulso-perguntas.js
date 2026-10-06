// ═══════════════════════════════════════════════════════════════════════
// pulso-perguntas.js — texto do questionário do Pulso da Equipe
// ═══════════════════════════════════════════════════════════════════════
// Usado pela página de resposta (QR) e pelo painel da coordenação.
// Mudar o SENTIDO de uma pergunta quebra a comparação entre ciclos: se
// precisar, abra ciclo novo e registre a mudança no título.
// Validação e cálculo ficam no banco (fn_publico_pulso_responder,
// fn_pulso_metricas) — aqui é só texto.
// ═══════════════════════════════════════════════════════════════════════

const PULSO_PERGUNTAS = [
  { chave: 'q1', tema: 'Propósito',      texto: 'Tenho clareza de como o meu trabalho contribui para os resultados do projeto.' },
  { chave: 'q2', tema: 'Dedicação',      texto: 'Nas últimas semanas, me dediquei ao projeto além do mínimo necessário.' },
  { chave: 'q3', tema: 'Sintonia',       texto: 'Sinto que a equipe está remando na mesma direção, com as mesmas prioridades.' },
  { chave: 'q4', tema: 'Confiança',      texto: 'Posso discordar, errar ou pedir ajuda nesta equipe sem receio.' },
  { chave: 'q5', tema: 'Condições',      texto: 'Tenho o que preciso (informação, decisões, ferramentas) para fazer bem o meu trabalho.' },
  { chave: 'q6', tema: 'Recomendação',   texto: 'De 0 a 10, quanto você recomendaria trabalhar nesta equipe a um colega?', escala: 'nps' },
  { chave: 'texto', tema: 'Uma mudança', texto: 'Se você pudesse mudar UMA coisa na forma como a equipe trabalha no próximo mês, qual seria?', escala: 'livre' },
]

const PULSO_LIKERT = ['Discordo totalmente', 'Discordo', 'Neutro', 'Concordo', 'Concordo totalmente']

const PULSO_GRUPOS = {
  coordenacao: 'Coordenação', tecnico: 'Técnico/Focal', financeiro: 'Financeiro',
  consultor_externo: 'Consultor externo', visualizador: 'Visualizador',
  convidado: 'Convidado', demais: 'Demais perfis',
}

const PULSO_ERROS = {
  'pulso:ciclo_inexistente': 'Este QR Code não corresponde a nenhum questionário.',
  'pulso:ciclo_encerrado': 'Este questionário já foi encerrado.',
  'pulso:ja_respondeu': 'Você já respondeu este questionário. Obrigado!',
  'pulso:convidado_nao_aceito': 'Este questionário é só para quem tem cadastro. Entre com seu login.',
  'pulso:limite_convidados': 'O limite de respostas de convidados foi atingido.',
  'pulso:dispositivo_invalido': 'Não foi possível identificar este aparelho. Recarregue a página.',
  'pulso:resposta_invalida': 'Responda todas as perguntas objetivas.',
  'pulso:texto_longo': 'O comentário passou de 1000 caracteres.',
  'pulso:sem_permissao': 'Apenas coordenação e super admin gerenciam o Pulso.',
}

function pulsoErro(e) {
  const m = String(e?.message || e || '')
  const k = Object.keys(PULSO_ERROS).find(c => m.includes(c))
  return k ? PULSO_ERROS[k] : 'Não foi possível concluir. Tente novamente.'
}
