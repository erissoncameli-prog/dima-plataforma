// ── DIMA · Diagnóstico Socioambiental — regras do questionário ─────────
//
// Espelho, no aparelho, do interpretador do banco (migration
// 20260926_diag_02_envio.sql). A estrutura do questionário é DADO
// (diag_questionarios.estrutura); aqui e lá ela é lida com a MESMA
// linguagem mínima de salto:  '=', '!=', 'in', 'contem', 'nao_contem'
// e {"todas": [...]}.
//
// Por que duas implementações: o app precisa esconder perguntas e cobrar
// pendências SEM rede; o banco precisa validar o que chega. Para não
// divergirem, supabase/tests/diagnostico/regras_cruzadas.js roda os
// mesmos casos nas duas e compara resultado a resultado. Operador ou
// regra nova entra nos DOIS arquivos e no teste.
//
// Valores especiais em respostas:
//   "_nr"            → botão "Não respondeu"
//   ausente          → não se aplica (salto) ou em branco (vira pendência)
//   "<chave>_outro"  → texto do "especifique"
//
// Funções puras: sem DOM, sem rede. Rodam no navegador (window.DiagRegras)
// e no Node (module.exports), para o teste cruzado.

;(function (raiz) {
  'use strict'

  const NR = '_nr'

  function perguntas(estrutura) {
    const lista = []
    ;(estrutura.blocos || []).forEach(b => (b.perguntas || []).forEach(p => lista.push({ bloco: b.id, p })))
    return lista
  }

  function porChave(estrutura) {
    const m = {}
    perguntas(estrutura).forEach(({ p }) => { m[p.chave] = p })
    return m
  }

  // pergunta que NÃO mora em `respostas` (colunas fixas, P4, tabela P9)
  function foraDeRespostas(p) {
    return !!p.coluna_fixa || p.tipo === 'tabela' || p.destino === 'identificacao'
  }

  function igualJson(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

  function cond(c, resp, aplicaveis) {
    if (c && Array.isArray(c.todas)) return c.todas.every(x => cond(x, resp, aplicaveis))
    if (!aplicaveis.has(c.se)) return false   // referência fora de aplicação → dependente também
    const v = resp[c.se]
    switch (c.op) {
      case '=':          return typeof v === 'string' && v === c.valor
      case '!=':         return !(typeof v === 'string' && v === c.valor)
      case 'in':         return typeof v === 'string' && Array.isArray(c.valor) && c.valor.includes(v)
      case 'contem':     return Array.isArray(v) && v.includes(c.valor)
      case 'nao_contem': return !(Array.isArray(v) && v.includes(c.valor))
      default: throw new Error('diag:estrutura_invalida: operador de salto desconhecido')
    }
  }

  // chaves de resposta que se aplicam, na ordem do questionário
  function aplicaveis(estrutura, resp) {
    const apl = new Set()
    const ordem = []
    perguntas(estrutura).forEach(({ p }) => {
      if (foraDeRespostas(p)) return
      if (!p.mostrar_se || cond(p.mostrar_se, resp, apl)) { apl.add(p.chave); ordem.push(p.chave) }
    })
    return ordem
  }

  // D1/D2: valores que vêm da tabela de moradores
  function derivar(moradores) {
    const ms = moradores || []
    const idadeOk = m => m.idade !== null && m.idade !== undefined && /^\d+$/.test(String(m.idade))
    return {
      tem_escolar: ms.some(m => idadeOk(m) && +m.idade >= 4 && +m.idade <= 17) ? 'sim' : 'nao',
      sem_mulheres: !ms.some(m => m.sexo_genero === 'mulher'),
      sem_homens: !ms.some(m => m.sexo_genero === 'homem'),
      total_moradores: ms.length,
    }
  }

  // aplica as derivadas sobre as respostas (o valor do banco/cálculo prevalece)
  function comDerivadas(estrutura, resp, moradores) {
    const der = derivar(moradores)
    const out = Object.assign({}, resp)
    perguntas(estrutura).forEach(({ p }) => { if (p.derivada) out[p.chave] = der[p.derivada] })
    return out
  }

  // opções que aparecem na tela (D2: "não há mulheres/homens" só quando a P9 confirma)
  function opcoesVisiveis(p, derivados) {
    return (p.opcoes || []).filter(o => !o.so_se_derivada || (derivados && derivados[o.so_se_derivada]))
  }

  // btrim() do Postgres tira só espaços (não \n nem \t) — a comparação tem de ser igual
  function btrim(s) { return s.replace(/^ +| +$/g, '') }

  function temOutro(v) { return v === 'outro' || (Array.isArray(v) && v.includes('outro')) }

  function erro(msg) { const e = new Error(msg); e.diag = true; return e }

  // Mesma semântica de fn_diag_normalizar_respostas:
  //  · derivadas sobrescritas; · não aplicáveis descartadas (com o _outro);
  //  · estrutura errada → exceção 'diag:resposta_invalida: ...'
  function normalizar(estrutura, respostas, moradores) {
    const perg = porChave(estrutura)
    const maxLen = estrutura.texto_max_len || 2000
    const outLen = estrutura.outro_max_len || 120
    const resp = comDerivadas(estrutura, respostas || {}, moradores)
    const apl = aplicaveis(estrutura, resp)

    Object.keys(resp).forEach(k => {
      const base = k.replace(/_outro$/, '')
      const conhecida = perg[k] || (k.endsWith('_outro') && perg[base] &&
        (perg[base].opcoes || []).some(o => o.especificar))
      if (!conhecida) throw erro('diag:resposta_invalida: chave desconhecida ' + k)
      if (perg[k] && foraDeRespostas(perg[k])) throw erro('diag:resposta_invalida: ' + k + ' não pertence a respostas')
    })

    const out = {}
    apl.forEach(k => {
      if (!(k in resp)) return
      const p = perg[k]
      const v = resp[k]
      if (v === NR) { out[k] = v; return }
      const opcoes = (p.opcoes || []).map(o => o.v)
      switch (p.tipo) {
        case 'unica':
          if (typeof v !== 'string' || !opcoes.includes(v)) throw erro('diag:resposta_invalida: ' + k + ' fora das opções')
          break
        case 'multipla': {
          if (!Array.isArray(v) || !v.length || !v.every(x => typeof x === 'string' && opcoes.includes(x)) ||
              new Set(v).size !== v.length) throw erro('diag:resposta_invalida: ' + k + ' fora das opções')
          const excl = (p.opcoes || []).filter(o => o.exclusiva).map(o => o.v)
          if (v.length > 1 && v.some(x => excl.includes(x))) throw erro('diag:resposta_invalida: ' + k + ' tem opção exclusiva junto com outras')
          break
        }
        case 'inteiro': case 'decimal':
          if (typeof v !== 'number' || !isFinite(v)) throw erro('diag:resposta_invalida: ' + k + ' deve ser número')
          if ((p.tipo === 'inteiro' && !Number.isInteger(v)) ||
              (p.min !== undefined && v < p.min) || (p.max !== undefined && v > p.max))
            throw erro('diag:resposta_invalida: ' + k + ' fora do intervalo')
          break
        case 'texto': case 'texto_longo':
          if (typeof v !== 'string' || v.length > (p.max_len || maxLen)) throw erro('diag:resposta_invalida: ' + k + ' texto inválido')
          if (btrim(v) === '') return
          break
        default:
          throw erro('diag:estrutura_invalida: tipo ' + p.tipo + ' em ' + k)
      }
      out[k] = v
      const ko = k + '_outro'
      if (ko in resp) {
        if (typeof resp[ko] !== 'string' || resp[ko].length > outLen) throw erro('diag:resposta_invalida: ' + ko + ' inválido')
        if (!temOutro(v)) throw erro('diag:resposta_invalida: ' + ko + ' sem a opção Outro marcada')
        if (btrim(resp[ko]) !== '') out[ko] = resp[ko]
      }
    })
    return out
  }

  // Mesma saída de fn_diag_calcular_alertas (a lista que a revisão mostra).
  // `respostas` deve já estar normalizada (como o banco faz).
  function alertas(estrutura, respostas, moradores, opts) {
    opts = opts || {}
    const al = []
    if (!respostas || Object.keys(respostas).length === 0) return al   // recusa
    const apl = new Set(aplicaveis(estrutura, respostas))
    const der = derivar(moradores)
    perguntas(estrutura).forEach(({ p }) => {
      if (!apl.has(p.chave) || p.opcional || p.derivada) return
      const v = respostas[p.chave]
      if (v === undefined) { al.push({ tipo: 'pendente', chave: p.chave, n: p.n }); return }
      if (temOutro(v) && !((p.chave + '_outro') in respostas)) al.push({ tipo: 'outro_sem_texto', chave: p.chave, n: p.n })
      if (typeof v === 'number') {
        if (p.aviso_min !== undefined && v < p.aviso_min) al.push({ tipo: 'abaixo_do_esperado', chave: p.chave, n: p.n })
        if (p.aviso_max !== undefined && v > p.aviso_max) al.push({ tipo: 'acima_do_esperado', chave: p.chave, n: p.n })
      }
    })
    const ms = moradores || []
    if (ms.length === 0) al.push({ tipo: 'pendente', chave: 'moradores', n: 9 })
    else if (!ms.some(m => +m.ordem === 1 && m.e_entrevistado)) al.push({ tipo: 'entrevistado_fora_da_1a_linha', n: 9 })
    if (typeof respostas.qtd_moradores === 'number' && respostas.qtd_moradores !== der.total_moradores)
      al.push({ tipo: 'qtd_moradores_diverge', n: 8, informado: respostas.qtd_moradores, listados: der.total_moradores })
    if (Array.isArray(respostas.atividades_mulheres) && respostas.atividades_mulheres.includes('nao_ha_mulheres') && !der.sem_mulheres)
      al.push({ tipo: 'incoerente_com_moradores', chave: 'atividades_mulheres', n: 61 })
    if (Array.isArray(respostas.atividades_homens) && respostas.atividades_homens.includes('nao_ha_homens') && !der.sem_homens)
      al.push({ tipo: 'incoerente_com_moradores', chave: 'atividades_homens', n: 62 })
    if (opts.usou_carencia) al.push({ tipo: 'enviada_na_carencia' })
    if (opts.comunidade_nova) al.push({ tipo: 'comunidade_nova' })
    return al
  }

  // Texto curto para a tela de revisão (o técnico lê isto em campo)
  function descreverAlerta(a, estrutura) {
    const p = a.chave && porChave(estrutura)[a.chave]
    const q = a.n ? 'P' + a.n : ''
    switch (a.tipo) {
      case 'pendente': return q + ' em branco' + (p ? ' — ' + p.texto : a.chave === 'moradores' ? ' — ninguém listado em "Quem mora no domicílio"' : '')
      case 'outro_sem_texto': return q + ': marcou "Outro" sem especificar'
      case 'abaixo_do_esperado': return q + ': entrevistado(a) menor de 18 anos'
      case 'acima_do_esperado': return q + ': valor muito alto — confira'
      case 'entrevistado_fora_da_1a_linha': return 'P9: o entrevistado deve ser a 1ª linha'
      case 'qtd_moradores_diverge': return 'P8 diz ' + a.informado + ' pessoas, mas a P9 lista ' + a.listados
      case 'incoerente_com_moradores': return q + ': "não há" marcado, mas a P9 lista essa pessoa'
      case 'enviada_na_carencia': return 'Enviada após o vencimento do acesso (carência)'
      case 'comunidade_nova': return 'Comunidade nova — a coordenação vai cadastrar'
      default: return a.tipo
    }
  }

  // Código legível gerado no aparelho (padrão numero_ninho do Biomonitor):
  //   DSA-<MUN>-<AAMMDD>-<DISP>-<NN>
  // prefixo 'TRE' = ficha do modo treino (o banco exige TRE- ⇔ treino)
  function gerarCodigo(sigla, data, dispositivo, seq, prefixo) {
    const d = data instanceof Date ? data : new Date(data + 'T12:00:00')
    const aa = String(d.getFullYear()).slice(2)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return [prefixo || 'DSA', sigla, aa + mm + dd, dispositivo, String(seq).padStart(2, '0')].join('-')
  }

  const api = { NR, perguntas, porChave, foraDeRespostas, cond, aplicaveis, derivar, comDerivadas,
                opcoesVisiveis, normalizar, alertas, descreverAlerta, gerarCodigo, igualJson }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else raiz.DiagRegras = api
})(typeof window !== 'undefined' ? window : globalThis)
