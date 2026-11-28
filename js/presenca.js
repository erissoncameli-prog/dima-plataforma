// presenca.js — Lista de presença das reuniões no Painel de Tarefas (migração 20261128_presenca_reunioes).
//   · quadro "Lista de presença" na ficha de toda tarefa do tipo Reunião ([data-pp-tarefa], preenchido aqui);
//   · QR em tela cheia com contador ao vivo (para projetar na reunião) → pages/presenca.html?l=<chave>;
//   · aba "Presenças" (gerenciador): filtros, indicadores, reuniões, detalhe de cada lista;
//   · exportação: PDF A4 (FolhaA4, sem sexo/raça), Excel (ExcelJS) e CSV. Quem vê o quê decide o banco
//     (fn_presenca_* — telefone só para quem administra; sexo/raça por pessoa só coordenação/super_admin).
// Estilo em css/presenca.css (prefixo pp-). Ícones do sprite de pages/tarefas.html.
;(function (g) {
  const ic = (n, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`
  const SEXO = { mulher: 'Mulher', homem: 'Homem', outro: 'Outro', prefere_nao_responder: 'Prefere não responder' }
  const RACA = { branca: 'Branca', preta: 'Preta', parda: 'Parda', amarela: 'Amarela', indigena: 'Indígena', prefere_nao_responder: 'Prefere não responder' }
  const IDADE = { ate_17: 'Até 17 anos', '18_24': '18 a 24', '25_29': '25 a 29', '30_39': '30 a 39', '40_49': '40 a 49', '50_59': '50 a 59',
    '60_mais': '60 ou mais', prefere_nao_responder: 'Prefere não responder', sem_registro: 'Sem registro (antes do campo)' }
  const CONVITE = c => c ? 'Convidado(a)' : 'Não convidado(a)'
  const IMG = { sim: 'Autorizou', nao: 'Não autorizou', retirada: 'Retirou a autorização' }
  const ORIGEM = { convite: 'Link do e-mail', qr: 'QR Code' }
  const TZ = { timeZone: 'America/Rio_Branco' }
  const dataHora = ts => ts ? new Date(ts).toLocaleString('pt-BR', { ...TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const hora = ts => ts ? new Date(ts).toLocaleTimeString('pt-BR', { ...TZ, hour: '2-digit', minute: '2-digit' }) : ''
  const diaHora = ts => ts ? new Date(ts).toLocaleString('pt-BR', { ...TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
  const raiz = () => { const p = location.pathname, i = p.indexOf('/pages/'); return location.origin + (i >= 0 ? p.slice(0, i + 1) : '/') }
  const urlLista = token => raiz() + 'pages/presenca.html?l=' + encodeURIComponent(token)
  const ERROS = {
    sem_permissao: 'Só quem administra a reunião pode fazer isso.', sem_acesso: 'Você não tem acesso a esta reunião.',
    reuniao_cancelada: 'A reunião está cancelada: a lista não reabre.', motivo_curto: 'Explique o motivo (pelo menos 10 caracteres).',
    nada_a_retirar: 'Esta pessoa não tinha autorização de imagem ativa.', pedido_invalido: 'Nada para exportar.',
  }
  const msgErro = e => { const m = String(e && e.message || e).match(/presenca:([a-z_]+)/); return (m && ERROS[m[1]]) || 'Não foi possível concluir. Tente de novo.' }
  // banco ainda sem a migração 20261128_presenca_reunioes (função inexistente): a tela se esconde em vez de mostrar erro
  const semBanco = e => !!e && (e.code === 'PGRST202' || e.code === '42883' || /Could not find the function|does not exist/i.test(e.message || ''))
  const pct = (a, b) => b ? Math.round(a * 100 / b) : 0
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  // situação de uma reunião na tabela do gerenciador
  const sitLinha = r => r.cancelada ? { cls: 'canc', txt: 'Cancelada' } : r.aberta ? { cls: 'aberta', txt: 'Aberta' }
    : new Date(r.inicio) - 9e5 > Date.now() ? { cls: 'agendada', txt: 'Agendada' } : { cls: 'fechada', txt: 'Encerrada' }

  // situação da lista em palavras
  function situacao (l, cancelada) {
    if (cancelada) return { cls: 'canc', txt: 'Reunião cancelada' }
    if (l.aberta) return { cls: 'aberta', txt: 'Aberta até ' + hora(l.fecha_em) }
    if (l.encerrada_em) return { cls: 'fechada', txt: 'Encerrada' }
    if (new Date(l.abre_em) > new Date()) return { cls: 'agendada', txt: 'Abre ' + diaHora(l.abre_em) }
    return { cls: 'fechada', txt: 'Encerrada' }
  }

  // ══ 1. Quadro na ficha da reunião ═════════════════════════════════════
  async function preencherBloco (el) {
    el.dataset.ppFeito = '1'
    const tid = el.dataset.ppTarefa
    el.innerHTML = `<h4>Lista de presença</h4><div class="lista"><div class="pp-bloco pp-carregando">Carregando…</div></div>`
    const { data: p, error } = await db.rpc('fn_presenca_da_tarefa', { p_tarefa: tid })
    const caixa = el.querySelector('.pp-bloco')
    if (semBanco(error)) { el.remove(); return }
    if (error) { caixa.textContent = msgErro(error); return }
    if (!p) { caixa.innerHTML = `<span class="pp-suave">A lista nasce quando a reunião tiver data e hora de início.</span>`; return }
    const s = situacao(p)
    const email = p.email_enviado_em ? `E-mail com o link enviado em ${diaHora(p.email_enviado_em)}` : 'O e-mail com o link sai 10 minutos depois do início'
    caixa.classList.remove('pp-carregando')
    caixa.innerHTML = `
      <div class="pp-linha"><span class="pp-sit pp-sit-${s.cls}">${esc(s.txt)}</span>
        <span class="pp-num"><b>${p.assinaturas}</b> ${p.assinaturas === 1 ? 'assinatura' : 'assinaturas'} · ${p.convidados_assinaram} de ${p.convidados} convidados</span></div>
      <div class="pp-suave">${ic('mail', 's')}${esc(email)}</div>
      <div class="pp-acoes">
        ${p.pode_gerir && p.token ? `<button type="button" class="btn btn-pri btn-sm" data-pp-qr="${p.id}">${ic('qr', 's')}Projetar QR da presença</button>
          <button type="button" class="btn btn-sec btn-sm" data-pp-copiar="${esc(p.token)}">${ic('ext', 's')}Copiar link</button>` : ''}
        <button type="button" class="btn btn-sec btn-sm" data-pp-ver="${p.id}">${ic('list', 's')}Ver lista</button>
      </div>`
  }

  // a ficha é redesenhada várias vezes: qualquer [data-pp-tarefa] novo é preenchido
  const obs = new MutationObserver(() => {
    document.querySelectorAll('[data-pp-tarefa]:not([data-pp-feito])').forEach(preencherBloco)
  })
  document.addEventListener('DOMContentLoaded', () => obs.observe(document.body, { childList: true, subtree: true }))
  if (document.body) obs.observe(document.body, { childList: true, subtree: true })

  document.addEventListener('click', async ev => {
    const q = ev.target.closest('[data-pp-qr]'); if (q) { ev.stopPropagation(); return projetar(q.dataset.ppQr) }
    const c = ev.target.closest('[data-pp-copiar]'); if (c) { ev.stopPropagation(); return copiar(c.dataset.ppCopiar) }
    const v = ev.target.closest('[data-pp-ver]'); if (v) { ev.stopPropagation(); return abrirDetalhe(v.dataset.ppVer) }
  })

  async function copiar (token) {
    const url = urlLista(token)
    try { await navigator.clipboard.writeText(url); toast('Link da lista copiado. Cole no chat da reunião online.', 'success') }
    catch (e) { prompt('Copie o link da lista de presença:', url) }
  }

  // ══ 2. QR em tela cheia ═══════════════════════════════════════════════
  const Q = { timer: null, n: null, lista: null, origem: null }
  function garantirQR () {
    let el = document.getElementById('pp-qr'); if (el) return el
    el = document.createElement('div'); el.id = 'pp-qr'; el.className = 'pp-qr'
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'pp-qr-tit')
    el.innerHTML = `<button type="button" class="pp-qr-x" id="pp-qr-x" aria-label="Fechar">${ic('x')}</button>
      <span class="pp-qr-sobre">Lista de presença</span><h2 id="pp-qr-tit"></h2>
      <p>Aponte a câmera do celular para o QR Code e assine a lista</p>
      <div class="pp-qr-cartao"><img id="pp-qr-img" alt="QR Code da lista de presença"></div>
      <div class="pp-qr-cont"><b id="pp-qr-n">0</b><span>presenças registradas</span></div>
      <div class="pp-qr-url" id="pp-qr-url"></div>`
    document.body.appendChild(el)
    el.querySelector('#pp-qr-x').addEventListener('click', fecharQR)
    return el
  }
  async function projetar (listaId) {
    const { data, error } = await db.rpc('fn_presenca_detalhe', { p_lista: listaId })
    if (error || !data.lista.token) { toast(error ? msgErro(error) : ERROS.sem_permissao, 'error'); return }
    if (typeof qrcode === 'undefined') { toast('Gerador de QR Code não carregou. Recarregue a página.', 'error'); return }
    const url = urlLista(data.lista.token)
    const q = qrcode(0, 'M'); q.addData(url); q.make()
    const el = garantirQR()
    Q.origem = document.activeElement; Q.lista = listaId; Q.n = data.assinaturas.length
    el.querySelector('#pp-qr-img').src = q.createDataURL(10, 2)
    el.querySelector('#pp-qr-tit').textContent = data.tarefa.titulo
    el.querySelector('#pp-qr-url').textContent = url
    el.querySelector('#pp-qr-n').textContent = Q.n
    el.classList.add('aberto')
    el.querySelector('#pp-qr-x').focus()
    if (!data.lista.aberta) toast('Atenção: a lista não está aberta agora. Reabra pela lista para aceitar assinaturas.', 'warning')
    try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen() } catch (e) {}
    clearInterval(Q.timer)
    Q.timer = setInterval(async () => {
      const { data: n } = await db.rpc('fn_presenca_contagem', { p_lista: listaId })
      if (n == null || n === Q.n) return
      Q.n = n
      const b = document.getElementById('pp-qr-n'); b.textContent = n; b.classList.remove('pulo'); void b.offsetWidth; b.classList.add('pulo')
    }, 4000)
  }
  async function fecharQR () {
    clearInterval(Q.timer); Q.timer = null
    const el = document.getElementById('pp-qr'); if (el) el.classList.remove('aberto')
    try { if (document.fullscreenElement) await document.exitFullscreen() } catch (e) {}
    if (Q.origem && Q.origem.focus) Q.origem.focus()
    // atualiza o que estiver na tela
    document.querySelectorAll('[data-pp-tarefa][data-pp-feito]').forEach(preencherBloco)
    if (D.lista && D.lista.lista.id === Q.lista) abrirDetalhe(Q.lista, true)
  }

  // ══ 3. Detalhe da lista (janela) ══════════════════════════════════════
  const D = { lista: null, origem: null }
  function garantirOv () {
    let ov = document.getElementById('pp-ov'); if (ov) return ov
    ov = document.createElement('div'); ov.id = 'pp-ov'; ov.className = 'tk-overlay pp-ov'
    ov.innerHTML = `<div class="tk-modal pp-modal" role="dialog" aria-modal="true" aria-labelledby="pp-ov-tit"></div>`
    ov.addEventListener('click', ev => { if (ev.target === ov) fecharDetalhe() })
    document.body.appendChild(ov)
    return ov
  }
  async function abrirDetalhe (listaId, manter) {
    const ov = garantirOv()
    if (!manter) D.origem = document.activeElement
    const { data, error } = await db.rpc('fn_presenca_detalhe', { p_lista: listaId })
    if (error) { toast(msgErro(error), 'error'); return }
    D.lista = data
    ov.querySelector('.pp-modal').innerHTML = htmlDetalhe(data)
    ov.classList.add('on')
    if (!manter) { const f = ov.querySelector('.pp-fechar'); if (f) f.focus() }
  }
  function fecharDetalhe () {
    const ov = document.getElementById('pp-ov'); if (!ov) return
    ov.classList.remove('on'); D.lista = null
    if (D.origem && D.origem.focus) D.origem.focus()
  }

  function htmlDetalhe (d) {
    const l = d.lista, t = d.tarefa, td = t.dados || {}, s = situacao(l)
    const assin = d.assinaturas, conv = d.convidados
    const semImg = assin.filter(a => a.imagem !== 'sim').length
    const colTel = d.pode_gerir, colSens = d.ve_sensivel
    const linhas = assin.map((a, i) => `<tr>
      <td class="pp-n">${i + 1}</td>
      <td><b>${esc(a.nome)}</b>${a.convidado ? '' : ' <span class="pp-tag pp-tag-sem" title="Participou sem ter recebido o convite da reunião">Não convidado(a)</span>'}${
        a.interno ? '' : ' <span class="pp-tag" title="Não tem conta na plataforma">Externo</span>'}<div class="pp-suave">${esc(a.email)}</div></td>
      ${colTel ? `<td class="pp-mono">${esc(a.telefone || '—')}</td>` : ''}
      ${colSens ? `<td>${esc(SEXO[a.sexo_genero] || '—')}${a.sexo_genero_outro ? ' (' + esc(a.sexo_genero_outro) + ')' : ''}</td><td>${esc(RACA[a.cor_raca] || '—')}</td><td>${esc(IDADE[a.faixa_etaria] || '—')}</td>` : ''}
      <td><span class="pp-img pp-img-${a.imagem}">${esc(IMG[a.imagem])}</span>${d.pode_gerir && a.imagem === 'sim'
        ? `<button type="button" class="pp-lnk" data-pp-retirar="${a.id}" data-pp-nome="${esc(a.nome)}">Retirar</button>` : ''}</td>
      <td class="pp-suave">${esc(ORIGEM[a.origem])}<br>${esc(diaHora(a.assinado_em))}</td></tr>`).join('')
    return `<div class="pp-cab">
        <div><span class="pp-sobre">${esc(t.codigo || '')} · Lista de presença</span><h2 id="pp-ov-tit">${esc(t.titulo)}</h2>
          <div class="pp-suave">${esc(td.inicio ? dataHora(td.inicio.slice(0, 16) + ':00-05:00') : '')}${td.formato ? ' · ' + esc(td.formato) : ''}${td.local ? ' · ' + esc(td.local) : ''}</div></div>
        <button type="button" class="btn btn-ghost btn-icon pp-fechar" onclick="Presenca.fechar()" aria-label="Fechar">${ic('x')}</button>
      </div>
      <div class="pp-barra">
        <span class="pp-sit pp-sit-${s.cls}">${esc(s.txt)}</span>
        <span class="sp"></span>
        ${d.pode_gerir ? `${l.token ? `<button type="button" class="btn btn-pri btn-sm" data-pp-qr="${l.id}">${ic('qr', 's')}Projetar QR</button>
          <button type="button" class="btn btn-sec btn-sm" data-pp-copiar="${esc(l.token)}">${ic('ext', 's')}Copiar link</button>` : ''}
          ${l.aberta ? `<button type="button" class="btn btn-sec btn-sm" onclick="Presenca.encerrar('${l.id}')">${ic('lock', 's')}Encerrar</button>`
            : `<button type="button" class="btn btn-sec btn-sm" onclick="Presenca.reabrir('${l.id}')">${ic('clock', 's')}Reabrir por 2 h</button>`}` : ''}
      </div>
      <div class="pp-kpis">
        <div><b>${assin.length}</b><span>presenças</span></div>
        <div><b>${conv.filter(c => c.assinou).length}<small> de ${conv.length}</small></b><span>convidados assinaram</span></div>
        <div><b>${assin.filter(a => !a.convidado).length}</b><span>participaram sem convite</span></div>
        <div><b>${assin.filter(a => !a.interno).length}</b><span>externos (sem conta)</span></div>
        <div class="${semImg ? 'pp-kpi-alerta' : ''}"><b>${semImg}</b><span>sem autorização de imagem</span></div>
      </div>
      ${conv.length ? `<details class="pp-conv"><summary>Convidados da reunião (${conv.length})</summary>
        <ul>${conv.map(c => `<li class="${c.assinou ? 'ok' : ''}">${ic(c.assinou ? 'check' : 'clock', 's')}${esc(c.nome)}<span>${c.assinou ? 'assinou' : 'não assinou'}</span></li>`).join('')}</ul></details>` : ''}
      ${assin.length ? `<div class="pp-tabela"><table>
        <thead><tr><th>#</th><th>Nome e e-mail</th>${colTel ? '<th>Telefone</th>' : ''}${colSens ? '<th>Sexo/gênero</th><th>Cor ou raça</th><th>Idade</th>' : ''}<th>Uso de imagem</th><th>Assinou por</th></tr></thead>
        <tbody>${linhas}</tbody></table></div>`
        : `<div class="pp-vazio">${ic('checks')}<b>Ninguém assinou ainda</b>A lista abre 15 minutos antes do início. Projete o QR na reunião ou copie o link para o chat.</div>`}
      ${!colSens && assin.length ? `<p class="pp-nota">${ic('lock', 's')}Sexo/gênero, cor ou raça e idade por pessoa só aparecem para a coordenação do projeto. Os totais estão no gerenciador (aba Presenças).</p>` : ''}
      ${d.pode_gerir && assin.length ? `<div class="pp-rodape"><span class="pp-suave">Exportar esta lista</span>
        <button type="button" class="btn btn-sec btn-sm" onclick="Presenca.exportar(['${l.id}'],'a4')">${ic('doc', 's')}PDF (A4)</button>
        <button type="button" class="btn btn-sec btn-sm" onclick="Presenca.exportar(['${l.id}'],'xlsx')">${ic('board', 's')}Excel</button>
        <button type="button" class="btn btn-sec btn-sm" onclick="Presenca.exportar(['${l.id}'],'csv')">${ic('list', 's')}CSV</button></div>` : ''}`
  }

  async function reabrir (id) {
    const { error } = await db.rpc('fn_presenca_reabrir', { p_lista: id })
    if (error) return toast(msgErro(error), 'error')
    toast('Lista reaberta por 2 horas', 'success'); abrirDetalhe(id, true); atualizarPainel()
  }
  async function encerrar (id) {
    if (!confirm('Encerrar a lista agora? Ninguém mais consegue assinar (dá para reabrir depois).')) return
    const { error } = await db.rpc('fn_presenca_encerrar', { p_lista: id })
    if (error) return toast(msgErro(error), 'error')
    toast('Lista encerrada', 'success'); abrirDetalhe(id, true); atualizarPainel()
  }

  // retirar a autorização de imagem (pedido da pessoa)
  document.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-pp-retirar]'); if (!b) return
    const motivo = prompt(`Retirar a autorização de uso de imagem de ${b.dataset.ppNome}?\n\nEscreva o motivo (ex.: "pediu por e-mail em 28/11"):`)
    if (motivo === null) return
    const { error } = await db.rpc('fn_presenca_revogar_imagem', { p_assinatura: b.dataset.ppRetirar, p_motivo: motivo })
    if (error) return toast(msgErro(error), 'error')
    toast('Autorização de imagem retirada. A escolha anterior fica no histórico.', 'success')
    if (D.lista) abrirDetalhe(D.lista.lista.id, true)
  })

  // Esc/Tab das janelas desta tela vêm antes do painel de tarefas (que fecharia a tarefa)
  document.addEventListener('keydown', ev => {
    const qr = document.getElementById('pp-qr'), ov = document.getElementById('pp-ov')
    const cima = qr && qr.classList.contains('aberto') ? qr : ov && ov.classList.contains('on') ? ov : null
    if (!cima) return
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cima === qr ? fecharQR() : fecharDetalhe() }
    else if (ev.key === 'Tab') {
      ev.stopPropagation()
      const fs = [...cima.querySelectorAll('button,a[href],input,select,summary,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null)
      if (!fs.length) return
      const i = fs.indexOf(document.activeElement)
      if (i === -1) { ev.preventDefault(); fs[0].focus() }
      else if (ev.shiftKey && i === 0) { ev.preventDefault(); fs[fs.length - 1].focus() }
      else if (!ev.shiftKey && i === fs.length - 1) { ev.preventDefault(); fs[0].focus() }
    }
  }, true)

  // ══ 4. Aba "Presenças" (gerenciador) ══════════════════════════════════
  const P = { el: null, ini: '', fim: '', formato: '', atividade: '', busca: '', dados: null, atividades: null }
  async function painel (el) {
    P.el = el
    if (!P.atividades) {
      const { data } = await db.from('atividades').select('id,codigo,nome_pt').eq('ativo', true).order('codigo')
      P.atividades = data || []
    }
    el.innerHTML = `<div class="pp-painel">
      <div class="pp-filtros">
        <label>De <input type="date" class="inp" id="pp-f-ini" value="${P.ini}"></label>
        <label>Até <input type="date" class="inp" id="pp-f-fim" value="${P.fim}"></label>
        <select class="filtro" id="pp-f-formato" aria-label="Formato"><option value="">Formato</option>${['Presencial', 'Online', 'Híbrida'].map(f => `<option ${P.formato === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
        <select class="filtro" id="pp-f-atv" aria-label="Atividade"><option value="">Atividade</option>${P.atividades.map(a => `<option value="${a.id}" ${P.atividade === a.id ? 'selected' : ''}>${esc(a.codigo)} — ${esc((a.nome_pt || '').slice(0, 50))}</option>`).join('')}</select>
        <label class="search">${ic('search', 's')}<input id="pp-f-busca" placeholder="Buscar reunião" value="${esc(P.busca)}"></label>
        <span class="sp"></span>
        <button type="button" class="btn btn-sec btn-sm" id="pp-exp-xlsx">${ic('board', 's')}Exportar período (Excel)</button>
        <button type="button" class="btn btn-sec btn-sm" id="pp-exp-csv">${ic('list', 's')}CSV</button>
      </div>
      <div id="pp-corpo"><div class="pp-carregando">Carregando…</div></div>
    </div>`
    const ligar = (id, k, ev = 'change') => el.querySelector('#' + id).addEventListener(ev, e => { P[k] = e.target.value; ev === 'input' ? desenhar() : carregarPainel() })
    ligar('pp-f-ini', 'ini'); ligar('pp-f-fim', 'fim'); ligar('pp-f-formato', 'formato'); ligar('pp-f-atv', 'atividade'); ligar('pp-f-busca', 'busca', 'input')
    el.querySelector('#pp-exp-xlsx').addEventListener('click', () => exportarPeriodo('xlsx'))
    el.querySelector('#pp-exp-csv').addEventListener('click', () => exportarPeriodo('csv'))
    carregarPainel()
  }
  async function carregarPainel () {
    const { data, error } = await db.rpc('fn_presenca_painel', { p_inicio: P.ini || null, p_fim: P.fim || null, p_atividade: P.atividade || null, p_formato: P.formato || null })
    if (semBanco(error)) { document.getElementById('pp-corpo').innerHTML = `<div class="pp-vazio">${ic('clock')}<b>Lista de presença em instalação</b>Esta função fica disponível assim que a atualização do banco de dados for aplicada.</div>`; return }
    if (error) { document.getElementById('pp-corpo').innerHTML = `<div class="pp-vazio">${esc(msgErro(error))}</div>`; return }
    P.dados = data; desenhar()
  }
  function atualizarPainel () { if (P.el && document.body.contains(P.el)) carregarPainel() }
  const visiveis = () => {
    const q = semAcento(P.busca || '').trim()
    return (P.dados.reunioes || []).filter(r => !q || semAcento((r.codigo || '') + ' ' + r.titulo).includes(q))
  }

  function barras (obj, rotulos) {
    const tot = Object.values(obj || {}).reduce((a, b) => a + b, 0)
    if (!tot) return '<div class="pp-suave">Sem assinaturas no período.</div>'
    return Object.keys(rotulos).filter(k => obj[k]).map(k => `<div class="pp-barra-l"><span>${esc(rotulos[k])}</span>
      <i><em style="width:${pct(obj[k], tot)}%"></em></i><b>${obj[k]}</b><small>${pct(obj[k], tot)}%</small></div>`).join('')
  }

  function desenhar () {
    const c = document.getElementById('pp-corpo'); if (!c || !P.dados) return
    const k = P.dados.indicadores, rs = visiveis()
    const taxa = pct(k.convidados_assinaram, k.convidados)
    c.innerHTML = `<div class="pp-kpis pp-kpis-grandes">
        <div><b>${k.reunioes_realizadas}</b><span>reuniões realizadas</span></div>
        <div><b>${k.presencas}</b><span>presenças</span></div>
        <div><b>${k.pessoas}</b><span>pessoas diferentes</span></div>
        <div><b>${k.reunioes_realizadas ? (k.presencas / k.reunioes_realizadas).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0'}</b><span>média por reunião</span></div>
        <div><b>${taxa}%</b><span>dos convidados compareceram</span></div>
        <div><b>${k.internos}<small> / ${k.externos}</small></b><span>da equipe / externos (sem conta)</span></div>
        <div><b>${k.sem_convite || 0}</b><span>participaram sem convite</span></div>
        <div class="${k.sem_imagem ? 'pp-kpi-alerta' : ''}"><b>${k.sem_imagem}</b><span>não autorizaram o uso de imagem</span></div>
      </div>
      <div class="pp-dist">
        <section><h4>Sexo/gênero</h4>${barras(k.sexo, SEXO)}</section>
        <section><h4>Cor ou raça</h4>${barras(k.raca, RACA)}</section>
        <section><h4>Faixa de idade</h4>${barras(k.faixa, IDADE)}</section>
      </div>
      ${rs.length ? `<div class="pp-tabela"><table>
        <thead><tr><th>Data</th><th>Reunião</th><th>Formato</th><th class="r">Presenças</th><th class="r">Convidados</th><th class="r">Sem convite</th><th class="r">Sem imagem</th><th>Situação</th></tr></thead>
        <tbody>${rs.map(r => { const s = sitLinha(r)
          return `<tr class="pp-clic" data-pp-ver="${r.id}" tabindex="0">
            <td class="pp-mono">${esc(diaHora(r.inicio))}</td>
            <td><b>${esc(r.titulo)}</b><div class="pp-suave">${esc(r.codigo || '')}${r.atividade ? ' · ' + esc(r.atividade) : ''}</div></td>
            <td>${esc(r.formato || '—')}</td><td class="r"><b>${r.assinaturas}</b></td>
            <td class="r">${r.convidados_assinaram}/${r.convidados}</td><td class="r">${r.sem_convite || ''}</td><td class="r">${r.sem_imagem || ''}</td>
            <td><span class="pp-sit pp-sit-${s.cls}">${esc(s.txt)}</span></td></tr>` }).join('')}</tbody></table></div>`
        : `<div class="pp-vazio">${ic('cal')}<b>Nenhuma reunião no filtro</b>Toda tarefa do tipo Reunião ganha uma lista de presença automaticamente.</div>`}`
  }
  document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('tr[data-pp-ver]')) abrirDetalhe(ev.target.dataset.ppVer) })

  async function exportarPeriodo (formato) {
    if (!P.dados) return
    const ids = visiveis().filter(r => r.pode_gerir && r.assinaturas > 0).map(r => r.id)
    if (!ids.length) return toast('Nenhuma lista com assinaturas que você administre neste filtro.', 'warning')
    const fora = visiveis().filter(r => !r.pode_gerir && r.assinaturas > 0).length
    if (fora) toast(`${fora} lista(s) de reuniões que você não administra ficaram de fora.`, 'info')
    exportar(ids, formato)
  }

  // ══ 5. Exportação ═════════════════════════════════════════════════════
  const LIB = {}
  function puxLib (src, global) {
    if (g[global]) return Promise.resolve()
    if (!LIB[src]) LIB[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete LIB[src]; rej(new Error('Não foi possível carregar a biblioteca de exportação.')) }; document.head.appendChild(s) })
    return LIB[src]
  }
  function baixar (blob, nome) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000) }
  const nomeArq = (ext, d) => 'lista-presenca-' + (d && d.tarefa ? (d.tarefa.codigo || 'reuniao') : 'periodo') + '-' + new Date().toISOString().slice(0, 10) + '.' + ext

  async function exportar (ids, formato) {
    const w = formato === 'a4' ? FolhaA4.janela() : null // antes de qualquer await (pop-up)
    const { data, error } = await db.rpc('fn_presenca_exportar', { p_listas: ids, p_formato: formato })
    if (error) { if (w) w.close(); return toast(msgErro(error), 'error') }
    const um = ids.length === 1 && D.lista && D.lista.lista.id === ids[0] ? D.lista : null
    try {
      if (formato === 'a4') await pdfA4(w, data, um)
      else if (formato === 'xlsx') await excel(data, um)
      else csv(data, um)
    } catch (e) { if (w) w.close(); toast(e.message || 'Falha ao exportar', 'error') }
  }

  function linhasPlanas (data) {
    return data.linhas.map((r, i) => ({
      n: i + 1, reuniao: r.reuniao, data: dataHora(r.data), formato: r.formato || '', nome: r.nome, email: r.email, telefone: r.telefone || '',
      vinculo: r.interno ? 'Equipe (usuário)' : 'Externo (sem conta)', convite: CONVITE(r.convidado), origem: ORIGEM[r.origem] || r.origem,
      sexo: data.com_sensiveis ? (SEXO[r.sexo_genero] || '') + (r.sexo_genero_outro ? ' (' + r.sexo_genero_outro + ')' : '') : undefined,
      raca: data.com_sensiveis ? RACA[r.cor_raca] || '' : undefined,
      idade: data.com_sensiveis ? IDADE[r.faixa_etaria || 'sem_registro'] : undefined,
      imagem: IMG[r.imagem], termo: 'v' + r.termo_versao, assinado: dataHora(r.assinado_em),
    }))
  }

  async function pdfA4 (w, data, um) {
    await FolhaA4.pronto
    const t = um && um.tarefa, td = (t && t.dados) || {}
    const rows = data.linhas
    const reunioes = [...new Set(rows.map(r => r.reuniao))]
    const ident = t ? `<table class="rep-tbl"><tbody>
        <tr><th style="width:28%">Reunião</th><td>${esc(t.titulo)} <span class="mono">${esc(t.codigo || '')}</span></td></tr>
        <tr><th>Data e hora</th><td class="mono">${esc(td.inicio ? dataHora(td.inicio.slice(0, 16) + ':00-05:00') : '—')}${td.fim ? ' – ' + esc(td.fim.slice(11, 16)) : ''}</td></tr>
        <tr><th>Formato e local</th><td>${esc(td.formato || '—')}${td.local ? ' · ' + esc(td.local) : ''}</td></tr>
        <tr><th>Organizador</th><td>${esc(t.organizador || '—')}</td></tr>
        ${t.atividade ? `<tr><th>Atividade</th><td><span class="mono">${esc(t.atividade.codigo)}</span> ${esc(t.atividade.nome || '')}</td></tr>` : ''}
      </tbody></table>` : `<p>${reunioes.length} reunião(ões) no período exportado.</p>`
    const semImg = rows.filter(r => r.imagem !== 'sim').length
    const corpo = `<div class="rep-secao"><div class="rep-secao-titulo">Identificação</div>${ident}</div>
      <div class="rep-stats">
        <div class="rep-stat"><div class="rep-stat-v">${rows.length}</div><div class="rep-stat-l">presenças</div></div>
        <div class="rep-stat"><div class="rep-stat-v">${rows.filter(r => !r.interno).length}</div><div class="rep-stat-l">convidados externos</div></div>
        <div class="rep-stat"><div class="rep-stat-v">${semImg}</div><div class="rep-stat-l">sem autorização de imagem</div></div>
      </div>
      <div class="rep-secao"><div class="rep-secao-titulo">Participantes</div>
      <table class="rep-tbl"><thead><tr><th class="c-min">#</th>${t ? '' : '<th>Reunião</th>'}<th>Nome</th><th>E-mail</th><th>Telefone</th><th>Uso de imagem</th><th>Assinou em</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td class="mono">${i + 1}</td>${t ? '' : `<td>${esc(r.reuniao)}</td>`}<td>${esc(r.nome)}${r.interno ? '' : ' <span class="rep-badge rb-cinza">convidado</span>'}</td>
        <td>${esc(r.email)}</td><td class="mono">${esc(r.telefone || '—')}</td><td>${esc(IMG[r.imagem])}</td><td class="mono">${esc(dataHora(r.assinado_em))} · ${esc(ORIGEM[r.origem])}</td></tr>`).join('')}</tbody></table></div>
      <p class="pp-a4-nota">Assinatura eletrônica registrada pela plataforma (data, hora e meio: link pessoal enviado por e-mail ou QR Code da reunião).
        A autorização de uso de imagem guarda a versão do termo lido por cada pessoa. Exportado por ${esc(data.exportado_por || '')} em ${esc(dataHora(data.exportado_em))}.</p>`
    FolhaA4.escrever(w, { titulo: 'Lista de presença', selo: 'Reunião', tema: 'tarefas',
      periodo: t ? t.titulo : 'Período exportado', corpo, paisagem: !t,
      css: '.pp-a4-nota{margin-top:10px;font-size:9pt;color:#555}',
      nomeArquivo: nomeArq('pdf', um).replace(/\.pdf$/, '') })
  }

  async function excel (data, um) {
    await puxLib('../js/vendor/exceljs-4.4.0.bare.min.js', 'ExcelJS')
    const wb = new ExcelJS.Workbook(); wb.creator = 'DIMA · Lista de presença'; wb.created = new Date()
    const cab = ws => { const r = ws.getRow(1); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E2C' } }; ws.views = [{ state: 'frozen', ySplit: 1 }] }
    const L = linhasPlanas(data)
    const ws = wb.addWorksheet('Presenças')
    const cols = [['#', 'n', 6], ['Reunião', 'reuniao', 40], ['Data', 'data', 18], ['Formato', 'formato', 12], ['Nome', 'nome', 32], ['E-mail', 'email', 32],
      ['Telefone', 'telefone', 16], ['Vínculo', 'vinculo', 18], ['Convite', 'convite', 18], ['Assinou por', 'origem', 16]]
    if (data.com_sensiveis) cols.push(['Sexo/gênero', 'sexo', 22], ['Cor ou raça', 'raca', 18], ['Faixa de idade', 'idade', 18])
    cols.push(['Uso de imagem', 'imagem', 22], ['Termo', 'termo', 8], ['Assinado em', 'assinado', 18])
    ws.columns = cols.map(([h, k, w]) => ({ header: h, key: k, width: w }))
    L.forEach(r => ws.addRow(r)); cab(ws); ws.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } }
    const res = wb.addWorksheet('Resumo')
    res.columns = [{ header: 'Item', key: 'k', width: 40 }, { header: 'Valor', key: 'v', width: 50 }]
    const conta = (f) => L.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m }, {})
    const reunioes = new Set(L.map(r => r.reuniao + r.data))
    const linhas = [['Reuniões', reunioes.size], ['Presenças', L.length],
      ['Pessoas diferentes', new Set(data.linhas.map(r => r.email)).size],
      ['Externos (sem conta)', L.filter(r => r.vinculo.startsWith('Externo')).length],
      ['Participaram sem convite', L.filter(r => r.convite === CONVITE(false)).length],
      ['Não autorizaram / retiraram o uso de imagem', L.filter(r => r.imagem !== IMG.sim).length]]
    if (data.com_sensiveis) {
      Object.entries(conta(r => r.sexo.split(' (')[0] || '—')).forEach(([k, v]) => linhas.push(['Sexo/gênero: ' + k, v]))
      Object.entries(conta(r => r.raca || '—')).forEach(([k, v]) => linhas.push(['Cor ou raça: ' + k, v]))
      Object.entries(conta(r => r.idade || '—')).forEach(([k, v]) => linhas.push(['Faixa de idade: ' + k, v]))
    }
    linhas.push(['Exportado por', (data.exportado_por || '') + ' em ' + dataHora(data.exportado_em)])
    linhas.forEach(([k, v]) => res.addRow({ k, v })); cab(res)
    const buf = await wb.xlsx.writeBuffer()
    baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nomeArq('xlsx', um))
    if (!data.com_sensiveis) toast('Planilha sem sexo e raça por pessoa (só a coordenação exporta esses campos).', 'info')
  }

  function csv (data, um) {
    const L = linhasPlanas(data)
    if (!L.length) return toast(ERROS.pedido_invalido, 'warning')
    const cols = Object.keys(L[0]).filter(k => L[0][k] !== undefined)
    const nomes = { n: '#', reuniao: 'Reunião', data: 'Data', formato: 'Formato', nome: 'Nome', email: 'E-mail', telefone: 'Telefone', vinculo: 'Vínculo',
      origem: 'Assinou por', sexo: 'Sexo/gênero', raca: 'Cor ou raça', imagem: 'Uso de imagem', termo: 'Termo', assinado: 'Assinado em' }
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
    const txt = [cols.map(c => q(nomes[c])).join(';')].concat(L.map(r => cols.map(c => q(r[c])).join(';'))).join('\r\n')
    baixar(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }), nomeArq('csv', um))
  }

  g.Presenca = { painel, abrirDetalhe, fechar: fecharDetalhe, projetar, fecharQR, reabrir, encerrar, exportar }
})(window)
