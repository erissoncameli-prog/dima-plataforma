// ═══════════════════════════════════════════════════════════════════════
// diagnostico-campo.js — aba "Equipe de campo" da mesa do Diagnóstico
// ═══════════════════════════════════════════════════════════════════════
// Plano: docs/diagnostico/plano-regioes-campo.md. Só coordenação/super_admin
// (o banco confere em cada RPC). Tudo vem de diag_campo_painel (uma chamada)
// e toda escrita passa por RPC: diag_designar, diag_designacao_alterar,
// diag_designacao_encerrar, diag_area_decidir, diag_setor_ajustar.
//   · setores da APA com meta sugerida, quanto já foi designado e feito;
//   · mapa do setor com as QUADRÍCULAS de dispersão (nunca o ponto da casa);
//   · designação por entrevistador (meta, prazo), pedidos de autorização e
//     fichas com problema de campo (abrem na Validação).
// Regra de área (dentro/fora, quadrícula) em js/diag-area.js — igual ao banco.
// ═══════════════════════════════════════════════════════════════════════

const dgc = { dados: null, com: '', entrevistadores: null, setorSel: '' }

function dgcErro(e) { return String((e && (e.message || e)) || 'erro').replace(/^diag:[a-z_]+:\s*/, '') }
function dgcData(d) { return d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '—' }
function dgcHoje(mais) { const d = new Date(); d.setDate(d.getDate() + (mais || 0)); return d.toISOString().slice(0, 10) }

async function dgcCarregar() {
  const el = document.getElementById('dg-campo')
  if (!el) return
  if (!dgc.dados) el.innerHTML = '<div class="card"><p class="dgc-vazio">Carregando a equipe de campo…</p></div>'
  const { data, error } = await db.rpc('diag_campo_painel', { p_comunidade_id: null })
  if (error) { el.innerHTML = '<div class="card"><p style="color:var(--erro)">' + esc(dgcErro(error)) + '</p></div>'; return }
  dgc.dados = data
  const coms = [...new Set(data.setores.map(s => s.comunidade_id))]
  if (!dgc.com || !coms.includes(dgc.com)) dgc.com = coms[0] || ''
  dgcDesenhar()
}

function dgcSetores() { return (dgc.dados.setores || []).filter(s => s.comunidade_id === dgc.com) }

function dgcDesenhar() {
  const el = document.getElementById('dg-campo')
  const d = dgc.dados
  const coms = []; d.setores.forEach(s => { if (!coms.some(c => c.id === s.comunidade_id)) coms.push({ id: s.comunidade_id, nome: s.comunidade }) })
  if (!coms.length) {
    el.innerHTML = '<div class="card"><h3 style="margin:0 0 6px">Equipe de campo</h3><p class="dgc-vazio">Nenhuma APA tem setores de campo cadastrados. ' +
      'Os setores vêm do shapefile de cada APA, convertido por <code>scripts/diag_setores.py</code>.</p></div>'
    return
  }
  const setores = dgcSetores()
  const ids = new Set(setores.map(s => s.id))
  const desig = d.designacoes.filter(x => ids.has(x.setor_id))
  const ativas = desig.filter(x => x.ativo)
  const pedidos = d.pedidos.filter(p => !p.setor_id || ids.has(p.setor_id))
  const pend = pedidos.filter(p => p.status === 'pendente')
  const atencao = d.atencao.filter(a => setores.some(s => s.codigo === a.setor_codigo) || !a.setor_codigo)
  const metaApa = setores.reduce((t, s) => t + (s.meta_sugerida || 0), 0)
  const feitas = ativas.reduce((t, x) => t + x.feitas, 0)
  const designadas = ativas.filter(x => x.tipo === 'designacao').reduce((t, x) => t + x.meta, 0)

  el.innerHTML = `
    <div class="dgc-topo">
      <label class="dgc-apa">APA <select id="dgc-com" onchange="dgc.com=this.value;dgc.setorSel='';dgcDesenhar()">
        ${coms.map(c => `<option value="${esc(c.id)}"${c.id === dgc.com ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <button type="button" class="btn btn-primary" onclick="dgcDesignarAbrir()">Designar entrevistador</button>
      <button type="button" class="btn btn-secondary" onclick="dgcCarregar()">Atualizar</button>
    </div>
    <div class="dg-grade">
      <div class="dg-num"><b>${feitas} <small>de ${metaApa}</small></b><span>entrevistas feitas × meta da APA</span></div>
      <div class="dg-num"><b>${designadas}</b><span>entrevistas designadas</span></div>
      <div class="dg-num${pend.length ? ' dgc-alerta' : ''}"><b>${pend.length}</b><span>pedidos de autorização</span></div>
      <div class="dg-num${atencao.length ? ' dgc-alerta' : ''}"><b>${atencao.length}</b><span>fichas com problema de campo</span></div>
    </div>
    ${pend.length ? `<div class="card dgc-card"><h3>Pedidos de autorização</h3>${dgcPedidos(pend)}</div>` : ''}
    <div class="dgc-duas">
      <div class="card dgc-card"><h3>Mapa dos setores <small>quadrículas de dispersão — sem o ponto das casas</small></h3>${dgcMapa(setores)}</div>
      <div class="card dgc-card"><h3>Setores</h3>${dgcTabelaSetores(setores, ativas)}</div>
    </div>
    <div class="card dgc-card"><h3>Designações</h3>${dgcTabelaDesig(desig, setores)}</div>
    <div class="card dgc-card"><h3>Fichas com problema de campo <small>fora da área, sem GPS, sem designação, acima da meta ou trecho cheio</small></h3>${dgcAtencao(atencao)}</div>
    ${pedidos.length > pend.length ? `<div class="card dgc-card"><h3>Pedidos decididos (30 dias)</h3>${dgcPedidos(pedidos.filter(p => p.status !== 'pendente'))}</div>` : ''}`
}

// ── Mapa em SVG (sem biblioteca: abre igual em qualquer rede) ──────────
function dgcMapa(setores) {
  if (!setores.length) return '<p class="dgc-vazio">Sem setores.</p>'
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  setores.forEach(s => { x0 = Math.min(x0, +s.bbox[0]); y0 = Math.min(y0, +s.bbox[1]); x1 = Math.max(x1, +s.bbox[2]); y1 = Math.max(y1, +s.bbox[3]) })
  const k = Math.cos((y0 + y1) / 2 * Math.PI / 180)
  const W = 640, H = Math.max(220, Math.round(W * (y1 - y0) / ((x1 - x0) * k)))
  const esc_ = Math.min((W - 20) / ((x1 - x0) * k), (H - 20) / (y1 - y0))
  const pt = (lon, lat) => (10 + (lon - x0) * k * esc_).toFixed(1) + ',' + (10 + (y1 - lat) * esc_).toFixed(1)
  const anel = r => 'M' + r.map(c => pt(c[0], c[1])).join('L') + 'Z'
  const caminho = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => p.map(anel).join('')).join('')
  const cels = (dgc.dados.celulas || [])
  let svg = `<svg class="dgc-mapa" viewBox="0 0 ${W} ${H}" role="img" aria-label="Setores da APA e quadrículas com entrevistas">`
  setores.forEach((s, i) => {
    const sel = dgc.setorSel === s.id
    svg += `<path class="dgc-setor dgc-s${i % 6}${sel ? ' sel' : ''}" d="${caminho(s.geojson)}" onclick="dgc.setorSel='${s.id}';dgcDesenhar()"><title>${esc('Setor ' + (s.numero || s.codigo) + ' · ' + s.nome)}</title></path>`
  })
  cels.filter(c => setores.some(s => s.id === c.setor_id)).forEach(c => {
    const s = setores.find(x => x.id === c.setor_id)
    const r = DiagArea.celulaAnel(s.bbox, s.celula_m, c.celula)
    const cls = c.n > s.limite_celula ? 'cheia' : c.n === s.limite_celula ? 'limite' : 'ok'
    svg += `<path class="dgc-cel dgc-cel-${cls}" d="${anel(r)}"><title>${c.n} entrevista(s) neste trecho (limite ${s.limite_celula})</title></path>`
  })
  setores.forEach(s => {
    const [a, b] = pt((+s.bbox[0] + +s.bbox[2]) / 2, (+s.bbox[1] + +s.bbox[3]) / 2).split(',')
    svg += `<text class="dgc-rot" x="${a}" y="${b}">${esc(String(s.numero || s.codigo))}</text>`
  })
  svg += '</svg>'
  return svg + `<p class="dgc-leg"><span class="dgc-q ok"></span>abaixo do limite <span class="dgc-q limite"></span>no limite <span class="dgc-q cheia"></span>acima (concentração)</p>`
}

function dgcTabelaSetores(setores, ativas) {
  return `<table class="dg-tab"><thead><tr><th>Setor</th><th>Meta</th><th>Designado</th><th>Feitas</th><th>Trechos</th><th></th></tr></thead><tbody>` +
    setores.map(s => {
      const ds = ativas.filter(x => x.setor_id === s.id)
      const desig = ds.filter(x => x.tipo === 'designacao').reduce((t, x) => t + x.meta, 0)
      const feitas = ds.reduce((t, x) => t + x.feitas, 0)
      const ncel = (dgc.dados.celulas || []).filter(c => c.setor_id === s.id).length
      const at = s.atributos || {}
      return `<tr class="${dgc.setorSel === s.id ? 'dgc-linha-sel' : ''}">
        <td><b>${esc(String(s.numero || s.codigo))} · ${esc(s.nome)}</b><br><small>${esc([s.tipo, s.area_ha ? Number(s.area_ha).toLocaleString('pt-BR') + ' ha' : '', at.apoio ? 'apoio: ' + at.apoio : '', at.acesso].filter(Boolean).join(' · '))}</small></td>
        <td${s.meta_ajustada_em ? ' title="' + esc('Ajustada no painel' + (s.meta_motivo ? ': ' + s.meta_motivo : '')) + '"' : ''}>${s.meta_sugerida || '—'}${s.meta_ajustada_em ? ' <small>(ajustada)</small>' : ''}</td>
        <td class="${s.meta_sugerida && desig < s.meta_sugerida ? 'dgc-falta' : ''}">${desig}</td>
        <td>${feitas}</td>
        <td title="quadrículas de ${s.celula_m} m com entrevista · limite ${s.limite_celula} por trecho · tolerância ${s.tolerancia_m} m">${ncel}<br><small>${s.celula_m} m · até ${s.limite_celula}</small></td>
        <td><button type="button" class="btn btn-sm btn-secondary" onclick="dgcAjustarAbrir('${s.id}')">Ajustar</button></td></tr>`
    }).join('') + '</tbody></table>'
}

function dgcTabelaDesig(desig, setores) {
  if (!desig.length) return '<p class="dgc-vazio">Ninguém designado ainda nesta APA. Use “Designar entrevistador”.</p>'
  const cod = id => { const s = setores.find(x => x.id === id); return s ? (s.numero || s.codigo) + ' · ' + s.nome : '' }
  return `<table class="dg-tab"><thead><tr><th>Entrevistador(a)</th><th>Setor</th><th>Andamento</th><th>Atenção</th><th>Prazo</th><th></th></tr></thead><tbody>` +
    desig.map(x => {
      const pct = Math.min(100, Math.round(100 * x.feitas / x.meta))
      const at = [x.fora ? x.fora + ' fora' : '', x.sem_gps ? x.sem_gps + ' sem GPS' : '', x.concentracao ? x.concentracao + ' trecho cheio' : ''].filter(Boolean).join(' · ')
      return `<tr${x.ativo ? '' : ' class="dgc-encerrada"'}><td><b>${esc(x.entrevistador)}</b>${x.tipo === 'autorizacao' ? ' <span class="dgc-tag">autorização</span>' : ''}
          ${x.ativo ? '' : '<br><small>encerrada' + (x.motivo_encerramento ? ': ' + esc(x.motivo_encerramento) : '') + '</small>'}</td>
        <td>${esc(cod(x.setor_id))}</td>
        <td><div class="dgc-barra" aria-hidden="true"><i style="width:${pct}%"></i></div><small>${x.feitas} de ${x.meta} · ${x.validadas} validada(s)${x.recusas ? ' · ' + x.recusas + ' recusa(s)' : ''}${x.ultima ? ' · última ' + dgcData(x.ultima) : ''}</small></td>
        <td class="${at ? 'dgc-falta' : ''}">${esc(at || '—')}</td>
        <td>${x.dt_fim ? dgcData(x.dt_fim) : 'sem prazo'}</td>
        <td>${x.ativo ? `<button type="button" class="btn btn-sm btn-secondary" onclick="dgcAlterarAbrir('${x.id}')">Alterar</button>` : ''}</td></tr>`
    }).join('') + '</tbody></table>'
}

function dgcPedidos(lista) {
  return `<table class="dg-tab"><thead><tr><th>Quem</th><th>Onde</th><th>Motivo</th><th>Quando</th><th></th></tr></thead><tbody>` +
    lista.map(p => `<tr><td><b>${esc(p.entrevistador)}</b><br><small>${p.quantidade} entrevista(s)</small></td>
      <td>${p.setor_codigo ? esc(p.setor_codigo + ' · ' + p.setor_nome) : '<span class="dgc-falta">fora dos setores</span>'}
        ${p.lat != null ? '<br><small>' + String(p.lat).replace('.', ',') + ', ' + String(p.lon).replace('.', ',') + (p.precisao_m ? ' (± ' + Math.round(p.precisao_m) + ' m)' : '') + '</small>' : ''}</td>
      <td>${esc(p.motivo)}${p.parecer ? '<br><small>Parecer: ' + esc(p.parecer) + '</small>' : ''}</td>
      <td>${dgcData(p.pedido_em)}${p.status !== 'pendente' ? '<br><small>' + esc(p.status) + '</small>' : ''}</td>
      <td>${p.status === 'pendente' ? `<button type="button" class="btn btn-sm btn-primary" onclick="dgcDecidirAbrir('${p.id}')">Decidir</button>` : ''}</td></tr>`).join('') + '</tbody></table>'
}

function dgcAtencao(lista) {
  if (!lista.length) return '<p class="dgc-vazio">Nenhuma ficha aguardando com problema de campo.</p>'
  const rot = { fora: 'fora da área', sem_gps: 'sem GPS', impreciso: 'GPS fraco', sem_designacao: 'sem designação' }
  return `<table class="dg-tab"><thead><tr><th>Ficha</th><th>Quem</th><th>Problema</th><th>Explicação do campo</th><th></th></tr></thead><tbody>` +
    lista.map(a => `<tr><td class="mono">${esc(a.codigo)}<br><small>${dgcData(a.finalizada_em)}</small></td>
      <td>${esc(a.entrevistador)}${a.setor_codigo ? '<br><small>' + esc(a.setor_codigo) + (a.numero ? ' · nº ' + a.numero : '') + '</small>' : ''}</td>
      <td>${esc([rot[a.situacao], a.concentracao ? 'trecho com ' + a.n_celula : '', a.setor_codigo && !a.numero && a.situacao !== 'sem_designacao' ? 'acima da meta' : ''].filter(Boolean).join(' · '))}</td>
      <td>${esc([a.justificativa_campo, a.justificativa_concentracao].filter(Boolean).join(' / ') || '—')}</td>
      <td><button type="button" class="btn btn-sm btn-secondary" onclick="dgcAbrirFicha('${a.ficha_id}')">Abrir</button></td></tr>`).join('') + '</tbody></table>'
}

async function dgcAbrirFicha(id) {
  dgTrocarAba('validacao')
  await dgValCarregar()
  dgValAbrir(id)
}

// ── Janelas ────────────────────────────────────────────────────────────
function dgcJanela(titulo, corpo, botao, acao) {
  let ov = document.getElementById('dgc-ov')
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'dgc-ov'; ov.className = 'dgv-ov dgc-ov'
    ov.addEventListener('click', ev => { if (ev.target === ov) dgcFechar() })
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !ov.hidden) dgcFechar() })
    document.body.appendChild(ov)
  }
  ov.innerHTML = `<div class="dgc-modal" role="dialog" aria-modal="true" aria-labelledby="dgc-tit">
    <header><h2 id="dgc-tit">${esc(titulo)}</h2></header><div class="dgc-corpo">${corpo}<p class="dgc-erro" id="dgc-erro" role="alert" hidden></p></div>
    <footer><button type="button" class="btn btn-secondary" onclick="dgcFechar()">Cancelar</button>${botao}</footer></div>`
  ov.hidden = false
  dgc.acao = acao
  const p = ov.querySelector('input, select, textarea'); if (p) p.focus()
}
function dgcFechar() { const ov = document.getElementById('dgc-ov'); if (ov) { ov.hidden = true; ov.innerHTML = '' } }
function dgcMostrarErro(m) { const e = document.getElementById('dgc-erro'); e.textContent = m; e.hidden = false }
const dgcV = id => (document.getElementById(id) || {}).value || ''

async function dgcDesignarAbrir() {
  if (!dgc.entrevistadores) {
    const { data, error } = await db.rpc('diag_campo_entrevistadores')
    if (error) { toast(dgcErro(error), 'error'); return }
    dgc.entrevistadores = data || []
  }
  const setores = dgcSetores()
  const marcado = dgc.setorSel || (setores[0] && setores[0].id)
  dgcJanela('Designar entrevistador', `
    <label class="dgc-l">Entrevistador(a)<select id="dgc-pessoa" onchange="dgcDesignarPessoa()"><option value="">Escolha…</option>${dgc.entrevistadores.map(u =>
      `<option value="${esc(u.id)}">${esc(u.nome_completo)}${u.acesso_ate ? ' — acesso até ' + dgcData(u.acesso_ate) : ''}</option>`).join('')}</select></label>
    ${dgc.entrevistadores.length ? '' : '<p class="dgc-falta">Nenhum técnico com acesso ao Diagnóstico. Dê o acesso em Usuários.</p>'}
    <p class="dgc-l" style="margin-bottom:4px">Setores e nº de entrevistas <span class="dgc-nota">(marque um ou mais)</span></p>
    <table class="dg-tab dgc-multi"><tbody>${setores.map(s => {
      const ja = dgc.dados.designacoes.filter(x => x.ativo && x.tipo === 'designacao' && x.setor_id === s.id).reduce((t, x) => t + x.meta, 0)
      const resta = Math.max(0, (s.meta_sugerida || 0) - ja)
      return `<tr data-setor="${esc(s.id)}"><td><label class="dgc-check"><input type="checkbox" class="dgc-sel"${s.id === marcado ? ' checked' : ''}>
          <span><b>${esc(String(s.numero || s.codigo))} · ${esc(s.nome)}</b><br><small>meta ${s.meta_sugerida || '—'} · já designadas ${ja} · faltam ${resta}</small>
          <small class="dgc-ja" hidden><br>esta pessoa já tem designação aqui — use “Alterar”</small></span></label></td>
        <td style="width:110px"><input type="number" class="dgc-qtd" min="1" max="500" value="${resta || ''}" aria-label="Entrevistas no setor ${esc(s.codigo)}"></td></tr>`
    }).join('')}</tbody></table>
    <div class="dgc-linha2"><label class="dgc-l">Início<input id="dgc-ini" type="date" value="${dgcHoje()}"></label>
      <label class="dgc-l">Fim (opcional)<input id="dgc-fim" type="date"></label></div>
    <p class="dgc-nota">Uma pessoa pode ter vários setores (e setores de outras APAs — troque a APA no topo). No app, cada entrevista
      vai para o setor onde ela está; a numeração (1, 2, 3…) é separada por setor. Recebe as áreas na próxima sincronização.</p>`,
    '<button type="button" class="btn btn-primary" onclick="dgc.acao()">Designar</button>', dgcDesignar)
}
// marca os setores em que a pessoa já está (a regra é uma designação ativa por setor)
function dgcDesignarPessoa() {
  const uid = dgcV('dgc-pessoa')
  document.querySelectorAll('.dgc-multi tr').forEach(tr => {
    const tem = !!uid && dgc.dados.designacoes.some(x => x.ativo && x.tipo === 'designacao' && x.setor_id === tr.dataset.setor && x.entrevistador_id === uid)
    tr.querySelector('.dgc-ja').hidden = !tem
    const cb = tr.querySelector('.dgc-sel'); cb.disabled = tem; if (tem) cb.checked = false
  })
}
async function dgcDesignar() {
  const pessoa = dgcV('dgc-pessoa')
  if (!pessoa) return dgcMostrarErro('Escolha o entrevistador.')
  const linhas = [...document.querySelectorAll('.dgc-multi tr')].filter(tr => tr.querySelector('.dgc-sel').checked)
  if (!linhas.length) return dgcMostrarErro('Marque pelo menos um setor.')
  if (linhas.some(tr => !(+tr.querySelector('.dgc-qtd').value >= 1))) return dgcMostrarErro('Informe o nº de entrevistas de cada setor marcado.')
  let feitas = 0
  for (const tr of linhas) {
    const { error } = await db.rpc('diag_designar', { p_setor_id: tr.dataset.setor, p_entrevistador_id: pessoa, p_meta: +tr.querySelector('.dgc-qtd').value,
      p_dt_inicio: dgcV('dgc-ini') || null, p_dt_fim: dgcV('dgc-fim') || null, p_tipo: 'designacao', p_justificativa: null })
    if (error) { dgcMostrarErro((feitas ? feitas + ' setor(es) designado(s); ' : '') + dgcErro(error)); dgcCarregar(); return }
    feitas++
  }
  dgcFechar(); toast(feitas > 1 ? feitas + ' setores designados.' : 'Designação feita.', 'success'); dgcCarregar()
}

function dgcAlterarAbrir(id) {
  const x = dgc.dados.designacoes.find(d => d.id === id)
  dgcJanela('Alterar designação', `<p><b>${esc(x.entrevistador)}</b> · setor ${esc(x.setor_codigo)} · ${x.feitas} de ${x.meta} feitas</p>
    <div class="dgc-linha2"><label class="dgc-l">Nº de entrevistas<input id="dgc-meta" type="number" min="1" max="500" value="${x.meta}"></label>
      <label class="dgc-l">Fim (opcional)<input id="dgc-fim" type="date" value="${esc(x.dt_fim || '')}"></label></div>
    <label class="dgc-l">Motivo (obrigatório)<textarea id="dgc-mot" rows="2" maxlength="300"></textarea></label>
    <label class="dgc-check"><input type="checkbox" id="dgc-encerrar"> Encerrar esta designação (o entrevistador perde a área)</label>`,
    '<button type="button" class="btn btn-primary" onclick="dgc.acao()">Salvar</button>', async () => {
      const mot = dgcV('dgc-mot').trim()
      if (mot.length < 5) return dgcMostrarErro('Escreva o motivo.')
      const r = document.getElementById('dgc-encerrar').checked
        ? await db.rpc('diag_designacao_encerrar', { p_id: id, p_motivo: mot })
        : await db.rpc('diag_designacao_alterar', { p_id: id, p_meta: +dgcV('dgc-meta'), p_dt_fim: dgcV('dgc-fim') || null, p_motivo: mot })
      if (r.error) return dgcMostrarErro(dgcErro(r.error))
      dgcFechar(); toast('Designação atualizada.', 'success'); dgcCarregar()
    })
}

function dgcDecidirAbrir(id) {
  const p = dgc.dados.pedidos.find(x => x.id === id)
  dgcJanela('Pedido de autorização', `<p><b>${esc(p.entrevistador)}</b> pede ${p.quantidade} entrevista(s) em
    ${p.setor_codigo ? '<b>' + esc(p.setor_codigo + ' · ' + p.setor_nome) + '</b>' : '<b>um ponto fora dos setores</b>'}.</p>
    <p class="dgc-nota">“${esc(p.motivo)}”</p>
    <div class="dgc-linha2"><label class="dgc-l">Nº de entrevistas<input id="dgc-meta" type="number" min="1" max="50" value="${p.quantidade}"></label>
      <label class="dgc-l">Válida até<input id="dgc-fim" type="date" value="${dgcHoje(7)}"></label></div>
    <label class="dgc-l">Parecer (obrigatório para recusar)<textarea id="dgc-mot" rows="2" maxlength="300"></textarea></label>
    ${p.setor_codigo ? '' : '<p class="dgc-falta">O ponto não cai em nenhum setor: só dá para recusar (ou designar à mão).</p>'}`,
    `<button type="button" class="btn btn-danger" onclick="dgcDecidir('${id}', false)">Recusar</button>` +
    (p.setor_codigo ? `<button type="button" class="btn btn-primary" onclick="dgcDecidir('${id}', true)">Aprovar</button>` : ''), null)
}
async function dgcDecidir(id, aprovar) {
  const { error } = await db.rpc('diag_area_decidir', { p_pedido_id: id, p_aprovar: aprovar, p_meta: +dgcV('dgc-meta') || null,
    p_dt_fim: dgcV('dgc-fim') || null, p_parecer: dgcV('dgc-mot').trim() || null })
  if (error) return dgcMostrarErro(dgcErro(error))
  dgcFechar(); toast(aprovar ? 'Autorização aprovada.' : 'Pedido recusado.', 'success'); dgcCarregar()
}

function dgcAjustarAbrir(id) {
  const s = dgcSetores().find(x => x.id === id)
  dgcJanela('Ajustar setor ' + (s.numero || s.codigo) + ' · ' + s.nome, `
    <div class="dgc-linha2"><label class="dgc-l">Meta do setor (entrevistas)<input id="dgc-msetor" type="number" min="1" max="1000" value="${s.meta_sugerida || ''}"></label>
      <label class="dgc-l" style="flex:2">Motivo da mudança da meta<input id="dgc-mmot" maxlength="300" placeholder="Obrigatório se mudar a meta"></label></div>
    ${s.meta_ajustada_em ? '<p class="dgc-nota">Meta ajustada em ' + dgcData(s.meta_ajustada_em) + (s.meta_motivo ? ': “' + esc(s.meta_motivo) + '”' : '') + '.</p>' : '<p class="dgc-nota">Meta vinda do shapefile.</p>'}
    <div class="dgc-linha2"><label class="dgc-l">Quadrícula (m)<input id="dgc-cel" type="number" min="50" max="20000" step="10" value="${s.celula_m}"></label>
      <label class="dgc-l">Máximo por quadrícula<input id="dgc-lim" type="number" min="1" max="50" value="${s.limite_celula}"></label>
      <label class="dgc-l">Tolerância na divisa (m)<input id="dgc-tol" type="number" min="0" max="500" step="10" value="${s.tolerancia_m}"></label></div>
    <p class="dgc-nota">A quadrícula divide o setor em quadrados; acima do máximo, o app pede justificativa para entrevistar no mesmo trecho.
      O padrão é √(área ÷ meta). A tolerância evita marcar como “fora” quem está na divisa (o GPS erra alguns metros).
      Mudança vale para as próximas fichas, na próxima sincronização dos aparelhos.</p>`,
    '<button type="button" class="btn btn-primary" onclick="dgc.acao()">Salvar</button>', async () => {
      const meta = +dgcV('dgc-msetor')
      if (meta !== (s.meta_sugerida || 0)) {
        if (!(meta >= 1)) return dgcMostrarErro('Informe a meta do setor.')
        if (dgcV('dgc-mmot').trim().length < 5) return dgcMostrarErro('Diga por que a meta do setor mudou.')
        const m = await db.rpc('diag_setor_meta', { p_setor_id: id, p_meta: meta, p_motivo: dgcV('dgc-mmot').trim() })
        if (m.error) return dgcMostrarErro(dgcErro(m.error))
      }
      const { error } = await db.rpc('diag_setor_ajustar', { p_setor_id: id, p_celula_m: +dgcV('dgc-cel'), p_limite_celula: +dgcV('dgc-lim'),
        p_tolerancia_m: +dgcV('dgc-tol'), p_ativo: null })
      if (error) return dgcMostrarErro(dgcErro(error))
      dgcFechar(); toast('Setor ajustado.', 'success'); dgcCarregar()
    })
}
