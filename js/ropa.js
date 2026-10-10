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
    '<div class="fade-in" id="rp" style="max-width:1100px"><div class="ad-carrega" style="min-height:30vh" role="status"><span class="ad-spin"></span>Carregando…</div></div>' + '</div></div></div>'
  adSeletorTema()
  carregarLogosSidebar()

  const [trat, conf] = await Promise.all([
    db.from('lgpd_tratamentos').select('*').eq('ativo', true).order('codigo'),
    db.rpc('fn_lgpd_conferir_tabelas'),
  ])
  const el = document.getElementById('rp')
  if (trat.error) { el.innerHTML = '<div class="ad-aviso er">' + adIc('alerta', 'p') + '<span>Não foi possível ler o ROPA: ' + esc(trat.error.message) + '</span></div>'; return }
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
  const kpi = (ic, n, rot, alerta) => `<div class="ad-kpi${alerta && n ? ' al' : ''}"><span class="ad-kpi-l">${adIc(ic, 'p')}${rot}</span><span class="ad-kpi-v">${n}</span></div>`

  return `
    <div class="ad-topo">
      <div>
        <h2>ROPA — Registro das Operações de Tratamento</h2>
        <p>LGPD, art. 37. Controladora: SEMA/AC. Cada tratamento aponta as tabelas reais onde o dado está,
           conferidas no banco a cada abertura desta tela. Somente leitura.</p>
      </div>
      <button type="button" class="btn btn-secondary ad-nao-imprime" id="rp-imprimir">${adIc('imprimir', 'p')}Imprimir / PDF</button>
    </div>
    <div class="ad-kpis">
      ${kpi('escudo', lista.length, lista.length === 1 ? 'Tratamento ativo' : 'Tratamentos ativos')}
      ${kpi('alerta', lista.filter(t => t.base_legal === 'a_definir').length, 'Base legal a definir', true)}
      ${kpi('info', lista.filter(t => t.dado_sensivel).length, 'Com dado sensível')}
      ${kpi('users', lista.filter(t => t.dado_de_menor).length, 'Com dado de criança/adolescente')}
    </div>
    ${conferencia ? '' : `<div class="ad-pend"><b>${adIc('alerta', 'p')}Não foi possível conferir as tabelas no banco agora.</b> O registro abaixo é o que está gravado.</div>`}
    ${pend.length ? `<div class="ad-pend" id="rp-pendencias"><b>${adIc('alerta', 'p')}Pendências</b><ul>${pend.map(([c, x]) =>
      `<li><b>${esc(c)}</b> · ${esc(x)}</li>`).join('')}</ul></div>` : `<div class="ad-pend ok"><b>${adIc('check', 'p')}Sem pendências no registro.</b></div>`}
    ${lista.length ? lista.map(t => ropaCartao(t, conferencia ? porCod[t.codigo] || {} : null)).join('')
      : '<div class="ad-card ad-vazio">Nenhum tratamento ativo registrado.</div>'}`
}

function ropaCartao(t, conf) {
  const chips = (arr, cls) => '<div class="ad-chips">' + (arr || []).map(x =>
    `<span class="ad-chip${cls ? ' ' + cls(x) : ''}">${esc(x)}</span>`).join('') + '</div>'
  const linha = (rot, html) => html ? `<dt>${rot}</dt><dd>${html}</dd>` : ''
  const txt = s => s ? esc(s) : ''

  let onde = ''
  if ((t.tabelas || []).length) {
    const tabs = t.tabelas.map(tb => {
      const est = !conf ? '' : conf[tb] === false ? ' tb-falta' : conf[tb] === true ? ' tb-ok' : ''
      return `<span class="ad-chip${est}"${est === ' tb-falta' ? ' title="não existe no banco"' : ''}>${est === ' tb-falta' ? '<span class="sr-only">não existe: </span>' : ''}${esc(tb)}</span>`
    }).join('')
    const nOk = conf ? t.tabelas.filter(tb => conf[tb] === true).length : null
    onde = `<div class="ad-chips">${tabs}</div>` + (conf
      ? `<span class="ad-sub">${nOk} de ${t.tabelas.length} conferidas no banco agora.</span>` : '')
  }

  const atual = t.atualizado_em ? new Date(t.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
  return `
  <article class="ad-trat" data-codigo="${esc(t.codigo)}">
    <header>
      <span class="ad-cod">${esc(t.codigo)}</span>
      <h3>${esc(t.nome)}</h3>
      ${t.modulo ? `<span class="ad-pill ad-ok">${esc(ROPA_MODULO[t.modulo] || t.modulo)}</span>` : ''}
      ${t.dado_sensivel ? '<span class="ad-pill ad-er">Dado sensível</span>' : ''}
      ${t.dado_de_menor ? '<span class="ad-pill ad-in">Crianças e adolescentes</span>' : ''}
      ${t.base_legal === 'a_definir' ? '<span class="ad-pill ad-al">Base legal a definir</span>' : ''}
    </header>
    <dl>
      ${linha('Finalidade', txt(t.finalidade))}
      ${linha('Base legal', `<b>${esc(ROPA_BASE_LEGAL[t.base_legal] || t.base_legal)}</b>${t.base_legal_detalhe ? `<span class="ad-sub">${esc(t.base_legal_detalhe)}</span>` : ''}`)}
      ${linha('Titulares', (t.categorias_titulares || []).length ? chips(t.categorias_titulares) : '')}
      ${linha('Dados tratados', (t.categorias_dados || []).length ? chips(t.categorias_dados, x => /sens[ií]vel/i.test(x) ? 'sens' : '') : '')}
      ${linha('Onde está', onde)}
      ${linha('Retenção', `<b>${esc(ropaPrazo(t.retencao_prazo))}</b>${t.retencao_criterio || (t.modulo === 'diagnostico' && t.retencao_prazo) ? `<span class="ad-sub">${esc(t.retencao_criterio || '')}${
        t.modulo === 'diagnostico' && t.retencao_prazo ? (t.retencao_criterio ? '<br>' : '') + '<b>Este prazo é o que a rotina automática de apagamento usa.</b>' : ''}</span>` : ''}`)}
      ${linha('Compartilhamento', txt(t.compartilhamento))}
      ${linha('Operadores', txt(t.operadores))}
      ${linha('Transferência internacional', txt(t.transferencia_internacional))}
      ${linha('Medidas de segurança', txt(t.medidas_seguranca))}
      ${linha('RIPD', txt(t.ripd))}
    </dl>
    <footer>Controladora: ${esc(t.controlador || 'SEMA/AC')}${atual ? ' · Atualizado em ' + esc(atual) : ''}</footer>
  </article>`
}
