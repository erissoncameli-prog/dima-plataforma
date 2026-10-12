// Tarefas vinculadas — mostra, no cartão do TDR e na linha da atividade, as tarefas
// do Painel de Tarefas que ainda falta fazer (a fazer, em andamento, em revisão, bloqueada).
// Só leitura: quem vê cada tarefa é decidido pelo banco (tarefas_select / fn_pode_ver_tarefa),
// então tarefa restrita de outra pessoa nem entra na contagem.
// Vínculos: TDR = tarefa_tdrs (N:N); atividade = tarefas.atividade_id.
// Estilo em css/tarefas-vinculadas.css (prefixo tv-), nos dois temas da mesa.
const TarefasVinc = (() => {
  const ABERTAS = ['a_fazer', 'em_andamento', 'em_revisao', 'bloqueada']
  const ST = {
    a_fazer: ['A fazer', 'todo'], em_andamento: ['Em andamento', 'doing'],
    em_revisao: ['Em revisão', 'review'], bloqueada: ['Bloqueada', 'block'],
  }
  const IC = {
    tarefa: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    pessoa: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5"/>',
    cadeado: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  }
  const ic = (n, cl = '') => `<svg class="tv-ic ${cl}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) }
  const fmtData = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : ''

  let todas = []
  const porTdr = new Map(), porAtv = new Map()

  async function carregar (db) {
    const { data, error } = await db.from('tarefas')
      .select('id,codigo,titulo,status,dt_prazo,atividade_id,restrita,' +
        'participantes:tarefa_participantes(papel,usuario:usuarios(nome_completo)),' +
        'vinc:tarefa_tdrs(tdr_id,tdr:tdrs(numero))')
      .eq('ativo', true).in('status', ABERTAS)
      .order('dt_prazo', { ascending: true, nullsFirst: false })
    if (error) console.error('tarefas vinculadas:', error.message)
    todas = data || []
    porTdr.clear(); porAtv.clear()
    const hoje = hojeISO()
    for (const t of todas) {
      t.atrasada = !!t.dt_prazo && String(t.dt_prazo).slice(0, 10) < hoje
      if (t.atividade_id) (porAtv.get(t.atividade_id) || porAtv.set(t.atividade_id, []).get(t.atividade_id)).push(t)
      for (const v of t.vinc || []) (porTdr.get(v.tdr_id) || porTdr.set(v.tdr_id, []).get(v.tdr_id)).push(t)
    }
  }

  const doTdr = id => porTdr.get(id) || []
  const daAtividade = id => porAtv.get(id) || []
  const novaUrl = (atividadeId, tdrId) =>
    'tarefas.html?nova=1' + (atividadeId ? '&atividade=' + atividadeId : '') + (tdrId ? '&tdr=' + tdrId : '')

  // Botão "N tarefas" (0 também aparece). onclick = JS que abre a lista.
  function botao (lista, onclick, extra = '') {
    const n = lista.length, atr = lista.filter(t => t.atrasada).length
    const txt = `${n} tarefa${n === 1 ? '' : 's'}`
    const tit = n ? `${txt} a fazer${atr ? ` · ${atr} atrasada${atr === 1 ? '' : 's'}` : ''}` : 'Nenhuma tarefa a fazer — clique para criar'
    return `<button type="button" class="tv-btn${n ? '' : ' zero'}${atr ? ' atr' : ''}" title="${e(tit)}" ${extra}
      onclick="event.stopPropagation();${onclick}">${ic('tarefa')}${txt}${atr ? '<span class="tv-ponto" aria-label="com atraso"></span>' : ''}</button>`
  }

  // Lista das tarefas + atalho "Nova tarefa" (já vinculada).
  // opts: { atividadeId, tdrId, mostrarTdr: bool }
  function lista (tarefas, opts = {}) {
    const nova = `<a class="tv-nova" href="${e(novaUrl(opts.atividadeId, opts.tdrId))}">${ic('mais')}Nova tarefa${opts.tdrId ? ' para este TDR' : ' nesta atividade'}</a>`
    if (!tarefas.length) {
      return `<div class="tv-lista"><div class="tv-vazio">Nenhuma tarefa a fazer${opts.tdrId ? ' vinculada a este TDR' : ' nesta atividade'}.</div>
        <div class="tv-rod">${nova}</div></div>`
    }
    const linhas = tarefas.map(t => {
      const [nm, cl] = ST[t.status] || [t.status, 'todo']
      const resp = (t.participantes || []).filter(p => p.papel === 'responsavel').map(p => p.usuario?.nome_completo).filter(Boolean)
      const tdrs = opts.mostrarTdr ? (t.vinc || []).map(v => v.tdr?.numero).filter(Boolean) : []
      return `<a class="tv-it" href="tarefas.html?tarefa=${e(t.id)}" title="Abrir no Painel de Tarefas">
        <div class="tv-l1">
          <span class="tv-st tv-${cl}">${e(nm)}</span>
          ${t.codigo ? `<span class="tv-cod">${e(t.codigo)}</span>` : ''}
          <span class="tv-tit">${e(t.titulo)}</span>
          ${t.restrita ? `<span class="tv-mudo" title="Tarefa restrita">${ic('cadeado')}</span>` : ''}
        </div>
        <div class="tv-l2">
          ${t.dt_prazo ? `<span class="${t.atrasada ? 'tv-atr' : ''}">${ic('cal')}${t.atrasada ? 'Atrasada · ' : 'Prazo '}${fmtData(t.dt_prazo)}</span>` : '<span>Sem prazo</span>'}
          ${resp.length ? `<span>${ic('pessoa')}${e(resp.join(', '))}</span>` : ''}
          ${tdrs.map(n => `<span class="tv-tdr">TDR ${e(n)}</span>`).join('')}
        </div>
      </a>`
    }).join('')
    return `<div class="tv-lista">${linhas}
      <div class="tv-rod">${nova}<a class="tv-link" href="tarefas.html">Abrir o Painel de Tarefas${ic('seta')}</a></div></div>`
  }

  return { carregar, doTdr, daAtividade, botao, lista, novaUrl }
})()
