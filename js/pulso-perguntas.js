// ═══════════════════════════════════════════════════════════════════════
// pulso-perguntas.js — textos comuns do Pulso da Equipe (painel e QR)
// ═══════════════════════════════════════════════════════════════════════
// As PERGUNTAS moram no banco, em cada ciclo (pulso_ciclos.perguntas); o
// padrão é fn_pulso_perguntas_padrao(). Validação e cálculo também ficam no
// banco (fn_pulso_validar_perguntas, fn_publico_pulso_responder,
// fn_pulso_metricas) — aqui só rótulos, mensagens e o alerta do editor.
// ═══════════════════════════════════════════════════════════════════════

const PULSO_LIKERT = ['Discordo totalmente', 'Discordo', 'Neutro', 'Concordo', 'Concordo totalmente']

const PULSO_TIPOS = {
  escala: { nome: 'Escala de concordância (1–5)', curto: 'Escala 1–5' },
  nps: { nome: 'Nota de 0 a 10 (recomendação)', curto: 'Nota 0–10' },
  escolha: { nome: 'Escolha única', curto: 'Escolha única' },
  texto: { nome: 'Resposta livre (texto)', curto: 'Texto livre' },
}

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
  'pulso:resposta_invalida': 'Responda todas as perguntas obrigatórias.',
  'pulso:texto_longo': 'O comentário passou de 1000 caracteres.',
  'pulso:sem_permissao': 'Você não tem permissão para esta ação neste ciclo.',
  'pulso:perguntas_travadas': 'As perguntas não podem mais ser editadas: o ciclo já recebeu respostas. Crie um novo ciclo com estas perguntas.',
}

function pulsoErro(e) {
  const m = String(e?.message || e || '')
  const inval = m.match(/pulso:perguntas_invalidas: (.+)/)
  if (inval) return 'Perguntas: ' + inval[1]
  const k = Object.keys(PULSO_ERROS).find(c => m.includes(c))
  return k ? PULSO_ERROS[k] : 'Não foi possível concluir. Tente novamente.'
}

// Pergunta de escolha que pede dado de perfil pode identificar quem respondeu
// numa equipe pequena. O editor avisa (não bloqueia).
const PULSO_RISCO = /\b(idade|anos|tempo de casa|tempo no projeto|h[aá] quanto tempo|cargo|fun[cç][aã]o|g[eê]nero|sexo|ra[cç]a|cor da pele|etnia|religi[aã]o|escolaridade|forma[cç][aã]o|setor|lota[cç][aã]o|munic[ií]pio|cidade|v[ií]nculo|contrato|sal[aá]rio|defici[eê]ncia|orienta[cç][aã]o)\b/i
function pulsoRisco(texto, opcoes) { return PULSO_RISCO.test(String(texto || '') + ' ' + (opcoes || []).join(' ')) }

// Leitura do resultado (quadrante + destaques), igual na tela e nas exportações.
// Recebe o que o banco devolve (geral.por_pergunta) — não recalcula índice.
function pulsoLeitura(g, perguntas) {
  if (!g || g.comprometimento == null) return null
  const c = g.comprometimento >= 70, s = g.sintonia >= 60
  const q = c && s ? ['Equipe de alta performance', 'Comprometida e na mesma frequência. Proteja o que funciona e reconheça publicamente.']
    : c ? ['Esforço disperso', 'As pessoas estão dedicadas, mas enxergam o trabalho de formas diferentes. Realinhe prioridades e o “porquê” de cada entrega.']
    : s ? ['Apatia coletiva', 'A equipe concorda — num patamar baixo. Revise propósito, condições de trabalho e reconhecimento.']
    : ['Fragmentação', 'Baixo comprometimento e visões divergentes. Converse com franqueza, em grupos pequenos, antes de cobrar resultado.']
  const pp = g.por_pergunta || {}
  const esc_ = (perguntas || []).filter(x => x.tipo === 'escala' && pp[x.chave] && pp[x.chave].n > 0)
  const pior = esc_.reduce((a, x) => !a || pp[x.chave].media_ajustada < pp[a.chave].media_ajustada ? x : a, null)
  const div = esc_.length > 1 ? esc_.reduce((a, x) => !a || pp[x.chave].dp > pp[a.chave].dp ? x : a, null) : null
  return { titulo: q[0], texto: q[1], alto_comp: c, alta_sint: s,
    pior: pior ? { tema: pior.tema, valor: pp[pior.chave].media_ajustada } : null,
    dividida: div ? { tema: div.tema, valor: pp[div.chave].dp } : null }
}

// dispersão (desvio-padrão na escala 1–5)
function pulsoDispersao(d) { return d == null ? '' : d < 0.8 ? 'Alinhada' : d <= 1.2 ? 'Moderada' : 'Dividida' }
