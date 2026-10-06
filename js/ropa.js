// ═══════════════════════════════════════════════════════════════════════
// ropa.js — Privacidade: Registro das Operações de Tratamento (LGPD art. 37)
// ═══════════════════════════════════════════════════════════════════════
// SOMENTE LEITURA, para todos. `lgpd_tratamentos.retencao_prazo` é lido pela
// rotina de apagamento do Diagnóstico (fn_diag_aplicar_retencao): editar
// pela tela mudaria o expurgo sem rastro. Correção = migration.
//
// Leitura: super_admin/coordenação (policy lgpd_trat_select). A coluna
// `tabelas` é conferida contra o schema por fn_lgpd_conferir_tabelas() a
// cada abertura — tabela renomeada/apagada vira pendência na tela.
// Pendências são derivadas do registro, nunca digitadas aqui.
// ═══════════════════════════════════════════════════════════════════════

const ROPA_BASE_LEGAL = {
  a_definir: 'A definir',
  art7_ii_obrigacao_legal: 'Art. 7º, II — cumprimento de obrigação legal',
  art7_iii_politica_publica: 'Art. 7º, III — execução de políticas públicas',
  art7_iv_estudo_pesquisa: 'Art. 7º, IV — estudo por órgão de pesquisa',
  art7_v_contrato: 'Art. 7º, V — execução de contrato',
  art11_ii_b_politica_publica: 'Art. 11, II, "b" — políticas públicas (dado sensível)',
  art11_ii_c_estudo_pesquisa: 'Art. 11, II, "c" — estudo por órgão de pesquisa (dado sensível)',
}
const ROPA_MODULO = { diagnostico: 'Diagnóstico', viagens: 'Viagens', fornecedores: 'Fornecedores', pulso: 'Pulso da Equipe' }

;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { window.location.href = '../index.html'; return }
  if (!['super_admin', 'coordenacao'].includes(appState.perfil)) { window.location.href = 'dashboard.html'; return }

  document.getElementById('app').innerHTML =
    gerarLayout('Privacidade · ROPA', 'ropa') +
    '<div class="fade-in rp" id="rp"><p class="rp-vazio">Carregando…</p></div>' + '</div></div></div>'
  carregarLogosSidebar()

  const [trat, conf] = await Promise.all([
    db.from('lgpd_tratamentos').select('*').eq('ativo', true).order('codigo'),
    db.rpc('fn_lgpd_conferir_tabelas'),
  ])
  const el = document.getElementById('rp')
  if (trat.error) { el.innerHTML = '<p class="rp-vazio">Não foi possível ler o ROPA: ' + esc(trat.error.message) + '</p>'; return }
  // Conferência é complementar: se falhar, a tela mostra o registro e avisa.
  const conferencia = conf.error ? null : (conf.data || [])
  el.innerHTML = ropaHTML(trat.data || [], conferencia)
  el.querySelector('#rp-imprimir')?.addEventListener('click', () => window.print())
})()

function ropaPrazo(iv) {
  if (!iv) return 'Guarda permanente'
  const m = String(iv).match(/^(\d+) (year|mon|day)s?$/)
  if (!m) return String(iv)
  const n = +m[1]
  const nome = { year: ['ano', 'anos'], mon: ['mês', 'meses'], day: ['dia', 'dias'] }[m[2]]
  return n + ' ' + nome[n === 1 ? 0 : 1]
}

// O que falta resolver, lido do próprio registro.
function ropaPendencias(t, faltando) {
  const p = []
  if (t.base_legal === 'a_definir') p.push('base legal a definir com o jurídico')
  if (t.transferencia_internacional && /pend/i.test(t.transferencia_internacional)) p.push('transferência internacional (art. 33) sem tratamento formal')
  if (!t.ripd) { if (t.dado_sensivel || t.dado_de_menor) p.push('sem RIPD (há dado sensível ou de criança/adolescente)') }
  else if (/rascunho/i.test(t.ripd)) p.push('RIPD ainda em rascunho')
  faltando.forEach(tb => p.push('tabela declarada não existe no banco: ' + tb))
  return p
}

function ropaHTML(lista, conferencia) {
  const porCod = {}
  ;(conferencia || []).forEach(c => { (porCod[c.codigo] = porCod[c.codigo] || {})[c.tabela] = c.existe })
  const faltandoDe = t => conferencia ? (t.tabelas || []).filter(tb => porCod[t.codigo]?.[tb] === false) : []

  const pend = []
  lista.forEach(t => ropaPendencias(t, faltandoDe(t)).forEach(x => pend.push([t.codigo, x])))
  const kpi = (n, rot, alerta) => `<div class="rp-kpi${alerta && n ? ' al' : ''}"><b>${n}</b><span>${rot}</span></div>`

  return `
    <div class="rp-cab">
      <div>
        <h2>ROPA — Registro das Operações de Tratamento</h2>
        <p>LGPD, art. 37. Controladora: SEMA/AC. Cada tratamento aponta as tabelas reais onde o dado está,
           conferidas no banco a cada abertura desta tela. Somente leitura.</p>
      </div>
      <button type="button" class="rp-btn" id="rp-imprimir">Imprimir / PDF</button>
    </div>
    <div class="rp-kpis">
      ${kpi(lista.length, lista.length === 1 ? 'tratamento ativo' : 'tratamentos ativos')}
      ${kpi(lista.filter(t => t.base_legal === 'a_definir').length, 'com base legal a definir', true)}
      ${kpi(lista.filter(t => t.dado_sensivel).length, 'com dado sensível')}
      ${kpi(lista.filter(t => t.dado_de_menor).length, 'com dado de criança/adolescente')}
    </div>
    ${conferencia ? '' : '<div class="rp-pend"><b>Não foi possível conferir as tabelas no banco agora.</b> O registro abaixo é o que está gravado.</div>'}
    ${pend.length ? `<div class="rp-pend" id="rp-pendencias"><h3>Pendências</h3><ul>${pend.map(([c, x]) =>
      `<li><b>${esc(c)}</b> · ${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${lista.length ? lista.map(t => ropaCartao(t, conferencia ? porCod[t.codigo] || {} : null)).join('')
      : '<p class="rp-vazio">Nenhum tratamento ativo registrado.</p>'}`
}

function ropaCartao(t, conf) {
  const chips = (arr, cls) => '<div class="rp-chips">' + (arr || []).map(x =>
    `<span class="rp-chip${cls ? ' ' + cls(x) : ''}">${esc(x)}</span>`).join('') + '</div>'
  const linha = (rot, html) => html ? `<dt>${rot}</dt><dd>${html}</dd>` : ''
  const txt = s => s ? esc(s) : ''

  let onde = ''
  if ((t.tabelas || []).length) {
    const tabs = t.tabelas.map(tb => {
      const est = !conf ? '' : conf[tb] === false ? ' falta' : conf[tb] === true ? ' ok' : ''
      return `<span class="rp-chip rp-tb${est}" title="${est === ' falta' ? 'não existe no banco' : ''}">${esc(tb)}</span>`
    }).join('')
    const nOk = conf ? t.tabelas.filter(tb => conf[tb] === true).length : null
    onde = `<div class="rp-chips">${tabs}</div>` + (conf
      ? `<span class="rp-nota">${nOk} de ${t.tabelas.length} conferidas no banco agora.</span>` : '')
  }

  const atual = t.atualizado_em ? new Date(t.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
  return `
  <article class="rp-card" data-codigo="${esc(t.codigo)}">
    <header class="rp-card-h">
      <span class="rp-cod">${esc(t.codigo)}</span>
      <span class="rp-nome">${esc(t.nome)}</span>
      ${t.modulo ? `<span class="rp-bdg b-mod">${esc(ROPA_MODULO[t.modulo] || t.modulo)}</span>` : ''}
      ${t.dado_sensivel ? '<span class="rp-bdg b-sens">Dado sensível</span>' : ''}
      ${t.dado_de_menor ? '<span class="rp-bdg b-men">Crianças e adolescentes</span>' : ''}
      ${t.base_legal === 'a_definir' ? '<span class="rp-bdg b-pend">Base legal a definir</span>' : ''}
    </header>
    <dl class="rp-grid">
      ${linha('Finalidade', txt(t.finalidade))}
      ${linha('Base legal', `<b>${esc(ROPA_BASE_LEGAL[t.base_legal] || t.base_legal)}</b>${t.base_legal_detalhe ? `<span class="rp-nota">${esc(t.base_legal_detalhe)}</span>` : ''}`)}
      ${linha('Titulares', (t.categorias_titulares || []).length ? chips(t.categorias_titulares) : '')}
      ${linha('Dados tratados', (t.categorias_dados || []).length ? chips(t.categorias_dados, x => /sens[ií]vel/i.test(x) ? 'sens' : '') : '')}
      ${linha('Onde está', onde)}
      ${linha('Retenção', `<b>${esc(ropaPrazo(t.retencao_prazo))}</b><span class="rp-nota">${esc(t.retencao_criterio)}${
        t.modulo === 'diagnostico' && t.retencao_prazo ? '<br><b>Este prazo é o que a rotina automática de apagamento usa.</b>' : ''}</span>`)}
      ${linha('Compartilhamento', txt(t.compartilhamento))}
      ${linha('Operadores', txt(t.operadores))}
      ${linha('Transferência internacional', txt(t.transferencia_internacional))}
      ${linha('Medidas de segurança', txt(t.medidas_seguranca))}
      ${linha('RIPD', txt(t.ripd))}
    </dl>
    <footer class="rp-rod"><span>Controladora: ${esc(t.controlador || 'SEMA/AC')}</span><span>${atual ? 'Atualizado em ' + esc(atual) : ''}</span></footer>
  </article>`
}
