// ═══════════════════════════════════════════════════════════════════════
// integracoes.js — Configurações › Integrações (API) · só super_admin
// ═══════════════════════════════════════════════════════════════════════
// Pedidos de acesso que chegam por e-mail (fundobrasilonuacre+api@gmail.com),
// chaves da API de dados (api_clientes) e a trilha de chamadas (api_acessos).
// Migrações 20261031_api_dados e 20261101_api_pedidos_email.
//
// A tela NÃO decide nada: aprovar/recusar/reenviar = fetch à Edge Function
// assinar-remanejamento (acao 'decidir_api'), que reconfirma a senha NO SERVIDOR
// e chama fn_api_pedido_decidir (service_role). Nunca conferir senha aqui.
// A chave nunca passa por esta tela no fluxo do e-mail: quem pediu a retira pelo link.
// Texto vindo do e-mail (assunto, corpo, campos) é de fora: sempre por esc().
// ═══════════════════════════════════════════════════════════════════════

const IN_ENDERECO = 'fundobrasilonuacre+api@gmail.com'
const IN_ROTAS = { resumo: 'Resumo do projeto', atividades: 'Atividades (ficha numérica)', matriz: 'Matriz de Resultados' }
const IN_ST = {
  recebido: ['Aguardando decisão', 'ad-al'], aprovado: ['Aguardando retirada', 'ad-in'], retirado: ['Chave retirada', 'ad-ok'],
  recusado: ['Recusado', 'ad-ne'], expirado: ['Link vencido', 'ad-er'],
}
const IN_ERROS = {
  SENHA_INVALIDA: 'Senha incorreta.',
  SENHA_BLOQUEADA: 'Bloqueado por excesso de tentativas de senha. Tente de novo mais tarde.',
  DOCUMENTO_ALTERADO: 'O pedido mudou desde que você abriu. Feche e abra de novo.',
  PEDIDO_JA_DECIDIDO: 'Este pedido já foi decidido.',
  PARECER_OBRIGATORIO: 'Para recusar, escreva o motivo (pelo menos 10 caracteres). Ele vai no e-mail.',
  API_ORIGEM_INVALIDA: 'Site do painel inválido. Use só o endereço do site, como https://painel.ac.gov.br (sem caminho).',
  API_VALIDADE_INVALIDA: 'A validade precisa ficar entre amanhã e 2 anos a partir de hoje.',
  API_ESCOPO_INVALIDO: 'Marque pelo menos uma rota.',
  API_NOME_OBRIGATORIO: 'Dê um nome ao acesso (pelo menos 3 letras).',
  API_LIMITE_INVALIDO: 'O limite precisa ficar entre 1 e 1000 chamadas por minuto.',
  ACESSO_REVOGADO: 'Este acesso foi revogado; não há link a reenviar.',
  PEDIDO_SEM_LINK: 'Este pedido não está aguardando retirada.',
  API_SO_SUPER_ADMIN: 'Só o super_admin pode fazer isso.',
}
const inErro = m => { const k = Object.keys(IN_ERROS).find(c => String(m || '').includes(c)); return k ? IN_ERROS[k] : (m || 'Erro inesperado.') }
const inData = d => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Rio_Branco' }) : '—'
const inHora = d => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco', dateStyle: 'short', timeStyle: 'short' }) : '—'
const inPill = (txt, cls, ic) => `<span class="ad-pill ${cls}">${ic ? adIc(ic) : ''}${esc(txt)}</span>`
const inHoje = (dias = 0) => { const d = new Date(Date.now() + dias * 864e5); return d.toLocaleDateString('sv-SE', { timeZone: 'America/Rio_Branco' }) }

const IN = { P: [], C: [], A: [], aba: 'pedidos', erroCarga: null }

;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { window.location.href = '../index.html'; return }
  if (appState.perfil !== 'super_admin') { window.location.href = 'dashboard.html'; return }

  document.getElementById('app').innerHTML =
    gerarLayout('Integrações (API)', 'integracoes') +
    '<div class="fade-in" id="in" style="max-width:1150px"><div class="ad-carrega" style="min-height:30vh" role="status"><span class="ad-spin"></span>Carregando…</div></div>' + '</div></div></div>'
  adSeletorTema()
  carregarLogosSidebar()
  adTrocarIcones()

  await inCarregar()
  const abrir = new URLSearchParams(location.search).get('pedido')
  if (abrir && IN.P.some(p => p.id === abrir)) { IN.aba = 'pedidos'; inRender(); inAbrirPedido(abrir) }
})()

async function inCarregar () {
  const [p, c, a] = await Promise.all([db.rpc('fn_api_pedidos'), db.rpc('fn_api_clientes'), db.rpc('fn_api_acessos', { p_limite: 200 })])
  IN.erroCarga = (p.error || c.error || a.error)?.message || null
  IN.P = p.data || []; IN.C = c.data || []; IN.A = a.data || []
  inRender()
}

function inSituacaoChave (c) {
  if (!c.ativo) return ['Revogada', 'ad-ne']
  if (c.expira_em && new Date(c.expira_em) < new Date()) return ['Vencida', 'ad-er']
  if (!c.chave_prefixo) return ['Aguardando retirada', 'ad-in']
  const dias = c.expira_em ? Math.ceil((new Date(c.expira_em) - Date.now()) / 864e5) : null
  if (dias != null && dias <= 30) return [`Vence em ${dias} dia${dias === 1 ? '' : 's'}`, 'ad-al']
  return ['Ativa', 'ad-ok']
}

function inRender () {
  const el = document.getElementById('in'); if (!el) return
  if (IN.erroCarga) {
    el.innerHTML = `<div class="ad-aviso er">${adIc('alerta', 'p')}<span>Não foi possível carregar: ${esc(IN.erroCarga)}.
      Confira se as migrações 20261031_api_dados e 20261101_api_pedidos_email foram aplicadas.</span></div>`
    return
  }
  const aguardando = IN.P.filter(p => p.status === 'recebido').length
  const ativas = IN.C.filter(c => inSituacaoChave(c)[0] === 'Ativa' || inSituacaoChave(c)[0].startsWith('Vence')).length
  const retirada = IN.C.filter(c => c.ativo && !c.chave_prefixo && !(c.expira_em && new Date(c.expira_em) < new Date())).length
  const chamadas = IN.C.reduce((s, c) => s + Number(c.acessos_30d || 0), 0)
  const kpi = (ic, rot, v, sub, cls = '') => `<div class="ad-kpi ${cls}"><span class="ad-kpi-l">${adIc(ic, 'p')}${esc(rot)}</span>
    <span class="ad-kpi-v">${v}</span><span class="ad-kpi-s">${esc(sub)}</span></div>`
  const abas = [['pedidos', 'Pedidos', 'enviar', aguardando], ['chaves', 'Chaves', 'chave', 0], ['acessos', 'Chamadas', 'lista', 0], ['como', 'Como pedir', 'info', 0]]

  el.innerHTML = `
    <div class="ad-topo"><div><h2>Integrações (API)</h2>
      <p>Pedidos de acesso que chegam por e-mail em <b>${IN_ENDERECO}</b>, as chaves da API de dados e as chamadas feitas com elas.
      A API entrega só números agregados (ficha da atividade, resumo e Matriz), sem dados pessoais.</p></div>
      <button type="button" class="btn btn-secondary" onclick="inNovaChave()">${adIc('mais', 'p')}Nova chave sem e-mail</button></div>
    <div class="ad-kpis">
      ${kpi('enviar', 'Pedidos aguardando', aguardando, 'decisão do super_admin', aguardando ? 'al' : '')}
      ${kpi('chave', 'Chaves ativas', ativas, 'em uso pelas plataformas')}
      ${kpi('relogio', 'Aguardando retirada', retirada, 'aprovadas, link enviado')}
      ${kpi('graf', 'Chamadas em 30 dias', chamadas.toLocaleString('pt-BR'), 'todas as chaves')}
    </div>
    <div class="ad-card">
      <div class="ad-abas" role="tablist">${abas.map(([k, r, ic, n]) =>
        `<button type="button" role="tab" aria-selected="${IN.aba === k}" onclick="IN.aba='${k}';inRender()">${adIc(ic, 'p')}${r}${n ? `<span class="ad-n">${n}</span>` : ''}</button>`).join('')}</div>
      <div id="in-painel">${({ pedidos: inPainelPedidos, chaves: inPainelChaves, acessos: inPainelAcessos, como: inPainelComo })[IN.aba]()}</div>
    </div>`
}

function inPainelPedidos () {
  if (!IN.P.length) return `<div class="ad-vazio">Nenhum pedido ainda. Eles chegam quando alguém escreve para ${IN_ENDERECO} (veja "Como pedir").</div>`
  return `<div class="ad-tab-wrap"><table class="ad-tab"><thead><tr><th>Pedido</th><th>Quem pediu</th><th>Órgão</th><th>Recebido</th><th>Situação</th></tr></thead><tbody>
    ${IN.P.map(p => { const st = IN_ST[p.status] || [p.status, 'ad-ne']; return `<tr tabindex="0" onclick="inAbrirPedido('${p.id}')" onkeydown="if(event.key==='Enter')inAbrirPedido('${p.id}')">
      <td class="ad-mono">${esc(p.numero)}</td>
      <td><div class="ad-pess"><div><b>${esc(p.remetente_nome || p.remetente_email)}</b><small>${esc(p.remetente_email)}</small></div></div>
        ${p.autenticado ? '' : inPill('Remetente não confirmado', 'ad-al', 'alerta')}</td>
      <td>${esc(p.campos?.orgao || '—')}</td>
      <td class="ad-mono">${inHora(p.criado_em)}</td>
      <td>${inPill(st[0], st[1])}</td></tr>` }).join('')}
  </tbody></table></div>`
}

function inPainelChaves () {
  if (!IN.C.length) return '<div class="ad-vazio">Nenhuma chave criada.</div>'
  return `<div class="ad-tab-wrap"><table class="ad-tab"><thead><tr><th style="min-width:190px">Acesso</th><th>Chave</th><th>Rotas</th><th>Válida até</th><th>Último uso</th><th>30 dias</th><th>Situação</th><th></th></tr></thead><tbody>
    ${IN.C.map(c => { const st = inSituacaoChave(c); return `<tr class="${c.ativo ? '' : 'off'}" style="cursor:default">
      <td><div class="ad-pess"><div><b>${esc(c.nome)}</b><small>${esc(c.contato_email || c.descricao || '')}</small></div></div></td>
      <td class="ad-mono">${c.chave_prefixo ? esc(c.chave_prefixo) + '…' : '—'}</td>
      <td style="font-size:12px">${(c.escopos || []).map(r => esc(IN_ROTAS[r] || r)).join('<br>')}
        ${(c.origens || []).length ? `<div class="ad-sub">${(c.origens || []).map(esc).join(', ')}</div>` : ''}</td>
      <td class="ad-mono">${inData(c.expira_em)}</td>
      <td class="ad-mono">${inHora(c.ultimo_acesso)}</td>
      <td class="ad-mono">${Number(c.acessos_30d || 0).toLocaleString('pt-BR')}</td>
      <td>${inPill(st[0], st[1])}</td>
      <td>${c.ativo ? `<button type="button" class="btn btn-sm ad-btn-perigo" onclick="inRevogar('${c.id}')">Revogar</button>` : ''}</td></tr>` }).join('')}
  </tbody></table></div>`
}

function inPainelAcessos () {
  if (!IN.A.length) return '<div class="ad-vazio">Nenhuma chamada registrada.</div>'
  const cls = s => s === 200 ? 'ad-ok' : s === 429 ? 'ad-al' : 'ad-er'
  return `<p class="ad-dica" style="padding:12px 16px 0">As 200 chamadas mais recentes. Chave errada ou vencida não aparece aqui (a API não sabe de quem é).</p>
    <div class="ad-tab-wrap"><table class="ad-tab ad-tab-num"><thead><tr><th>Quando</th><th>Acesso</th><th>Rota</th><th>Formato</th><th>Resposta</th><th>Linhas</th></tr></thead><tbody>
    ${IN.A.map(a => `<tr><td class="ad-mono" style="text-align:left">${inHora(a.criado_em)}</td><td style="text-align:left">${esc(a.cliente)}</td>
      <td class="ad-mono">${esc(a.rota)}</td><td class="ad-mono">${esc(a.formato || '')}</td>
      <td>${inPill(String(a.status), cls(a.status))}</td><td class="ad-mono">${a.linhas ?? '—'}</td></tr>`).join('')}
  </tbody></table></div>`
}

const IN_MODELO = `Assunto: Pedido de acesso à API do DIMA

Órgão: (nome da instituição)
Responsável técnico: (nome e cargo)
Finalidade: (para que os dados serão usados)
Site do painel: (ex.: https://painel.instituicao.gov.br — deixe em branco se for só BI)
Rotas: resumo, atividades, matriz
Prazo: (até quando precisa do acesso; o padrão é 1 ano)`

function inPainelComo () {
  return `<div style="padding:16px 18px">
    <p class="ad-dica">Quem quer uma chave escreve para <b>${IN_ENDERECO}</b>, de preferência com o modelo abaixo. O pedido aparece na aba
      <b>Pedidos</b> e os super_admin são avisados no sino. Se o domínio do remetente for confirmado pelo Gmail, a pessoa recebe na hora
      a resposta "recebido"; se não for, o pedido fica marcado como <b>remetente não confirmado</b> e não há resposta automática.</p>
    <p class="ad-dica">Ao aprovar (com a sua senha), o acesso é criado sem chave e o solicitante recebe um <b>link de retirada</b>, que vale
      72 horas e funciona uma vez. A chave é gerada só quando ele abre o link e aparece uma única vez; ela nunca vai no e-mail. Link vencido:
      use <b>Reenviar link</b> no pedido. Validade padrão da chave: 1 ano (máximo 2). Quinze dias antes de vencer, o contato recebe um lembrete.</p>
    <div class="form-group"><label class="form-label">Modelo do e-mail</label>
      <textarea class="form-control" id="in-modelo" rows="9" readonly style="font-family:var(--font-mono);font-size:12.5px">${esc(IN_MODELO)}</textarea></div>
    <button type="button" class="btn btn-secondary" onclick="inCopiar(document.getElementById('in-modelo').value, this)">${adIc('copiar', 'p')}Copiar modelo</button>
  </div>`
}

async function inCopiar (txt, b) {
  try { await navigator.clipboard.writeText(txt); toast('Copiado.', 'success') } catch (e) { toast('Não foi possível copiar; selecione e copie.', 'warning') }
  if (b) b.blur()
}

// ── Pedido ────────────────────────────────────────────────────────────────
function inOrigemDe (txt) {
  try { const u = new URL(String(txt || '').trim()); return /^https?:$/.test(u.protocol) ? u.origin : '' } catch (e) { return '' }
}

function inAbrirPedido (id) {
  const p = IN.P.find(x => x.id === id); if (!p) return
  const st = IN_ST[p.status] || [p.status, 'ad-ne']
  document.getElementById('in-ped-tit').textContent = 'Pedido ' + p.numero
  document.getElementById('in-ped-sub').innerHTML = `Recebido em ${inHora(p.criado_em)} · ${inPill(st[0], st[1])}`
  const campos = p.campos || {}
  const rotCampo = { orgao: 'Órgão', responsavel: 'Responsável técnico', finalidade: 'Finalidade', site: 'Site do painel', rotas: 'Rotas pedidas', prazo: 'Prazo' }
  const dl = [['De', `${esc(p.remetente_nome ? p.remetente_nome + ' · ' : '')}${esc(p.remetente_email)}`],
    ['Remetente', p.autenticado ? inPill('Confirmado pelo Gmail', 'ad-ok', 'check') + ` <span class="ad-sub">${esc(p.autenticacao || '')}</span>`
      : inPill('Não confirmado', 'ad-al', 'alerta') + ` <span class="ad-sub">${esc(p.autenticacao || '')}</span>`],
    ['Assunto', esc(p.assunto || '—')],
    ...Object.keys(rotCampo).filter(k => campos[k]).map(k => [rotCampo[k], esc(campos[k])])]
  let html = `${p.autenticado ? '' : `<div class="ad-aviso">${adIc('alerta', 'p')}<span>O Gmail não confirmou que este e-mail veio mesmo de
      ${esc(p.remetente_email)}. Se aprovar, o link vai para esse endereço (quem é dono dele é que recebe); na dúvida, confirme por outro canal antes.</span></div>`}
    <dl class="ad-dl">${dl.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${b}</dd>`).join('')}</dl>
    <div class="form-group" style="margin-top:12px"><label class="form-label">Texto do e-mail</label>
      <pre style="white-space:pre-wrap;font:12.5px/1.5 var(--font-mono);background:var(--sup-2);border:1px solid var(--lin);border-radius:var(--r-ctl);padding:10px 12px;max-height:220px;overflow:auto;margin:0">${esc(p.corpo || '(vazio)')}</pre></div>`
  let pe = '<span class="ad-sp"></span><button type="button" class="btn btn-secondary" onclick="adFechar(\'in-modal-ped\')">Fechar</button>'

  if (p.status === 'recebido') {
    const site = inOrigemDe(campos.site)
    html += `<div class="ad-div" style="border-top:1px solid var(--lin);margin:16px 0 12px"></div>
      <p class="ad-dica"><b>O que liberar</b> (vale para a chave; dá para revogar quando quiser).</p>
      <div class="form-group"><label class="form-label" for="in-cfg-nome">Nome do acesso</label>
        <input class="form-control" id="in-cfg-nome" maxlength="120" value="${esc(campos.orgao || p.remetente_email)}"></div>
      <div class="form-group"><span class="form-label">Rotas</span>
        ${Object.entries(IN_ROTAS).map(([k, r]) => `<label class="ad-chk"><input type="checkbox" class="in-cfg-rota" value="${k}" checked>${esc(r)}</label>`).join('')}</div>
      <div class="form-group"><label class="form-label" for="in-cfg-origens">Sites do painel no navegador (um por linha)</label>
        <textarea class="form-control" id="in-cfg-origens" rows="2" placeholder="https://painel.instituicao.gov.br">${esc(site)}</textarea>
        <div class="form-hint">Só o endereço do site, sem caminho. Em branco = só servidor ou BI (Power BI, Excel).</div></div>
      <div class="ad-g2">
        <div class="form-group"><label class="form-label" for="in-cfg-validade">Válida até</label>
          <input type="date" class="form-control" id="in-cfg-validade" value="${inHoje(365)}" min="${inHoje(2)}" max="${inHoje(730)}"></div>
        <div class="form-group"><label class="form-label" for="in-cfg-limite">Limite por minuto</label>
          <input type="number" class="form-control" id="in-cfg-limite" value="60" min="1" max="1000"></div>
      </div>
      <div class="form-group"><label class="form-label" for="in-cfg-parecer">Mensagem ao solicitante</label>
        <textarea class="form-control" id="in-cfg-parecer" rows="2" maxlength="1000" placeholder="Obrigatória para recusar; opcional ao aprovar"></textarea>
        <div class="form-hint">Vai no e-mail de resposta.</div></div>`
    pe = `<button type="button" class="btn ad-btn-perigo" onclick="inDecidir('${p.id}','recusar')">${adIc('x', 'p')}Recusar</button>
      <span class="ad-sp"></span><button type="button" class="btn btn-secondary" onclick="adFechar('in-modal-ped')">Fechar</button>
      <button type="button" class="btn btn-primary" onclick="inDecidir('${p.id}','aprovar')">${adIc('check', 'p')}Aprovar e enviar link</button>`
  } else {
    const info = [['Decidido por', esc(p.decidido_por_nome || '—') + (p.decidido_em ? ' em ' + inHora(p.decidido_em) : '')]]
    if (p.parecer) info.push(['Mensagem', esc(p.parecer)])
    if (p.cliente_nome) info.push(['Acesso criado', esc(p.cliente_nome)])
    if (p.retirada_enviada_em) info.push(['Link enviado', inHora(p.retirada_enviada_em) + (p.retirada_expira_em ? ' · vale até ' + inHora(p.retirada_expira_em) : '')])
    if (p.retirado_em) info.push(['Chave retirada', inHora(p.retirado_em)])
    html += `<dl class="ad-dl" style="margin-top:14px">${info.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${b}</dd>`).join('')}</dl>`
    if (['aprovado', 'expirado'].includes(p.status)) {
      pe = `<span class="ad-sp"></span><button type="button" class="btn btn-secondary" onclick="adFechar('in-modal-ped')">Fechar</button>
        <button type="button" class="btn btn-primary" onclick="inDecidir('${p.id}','reenviar')">${adIc('enviar', 'p')}Reenviar link</button>`
    }
  }
  document.getElementById('in-ped-body').innerHTML = html
  document.getElementById('in-ped-pe').innerHTML = pe
  adAbrir('in-modal-ped')
}

function inDecidir (id, decisao) {
  const p = IN.P.find(x => x.id === id); if (!p) return
  let config = null, motivo = null
  if (decisao !== 'reenviar') {
    motivo = (document.getElementById('in-cfg-parecer')?.value || '').trim() || null
    if (decisao === 'recusar' && (!motivo || motivo.length < 10)) { toast(IN_ERROS.PARECER_OBRIGATORIO, 'warning'); document.getElementById('in-cfg-parecer').focus(); return }
  }
  if (decisao === 'aprovar') {
    const origens = (document.getElementById('in-cfg-origens').value || '').split(/[\s,;]+/).filter(Boolean)
    const ruins = origens.filter(o => inOrigemDe(o) !== o.replace(/\/+$/, '').toLowerCase())
    if (ruins.length) { toast(IN_ERROS.API_ORIGEM_INVALIDA + ' (' + ruins.join(', ') + ')', 'warning'); return }
    const escopos = [...document.querySelectorAll('.in-cfg-rota:checked')].map(i => i.value)
    if (!escopos.length) { toast(IN_ERROS.API_ESCOPO_INVALIDO, 'warning'); return }
    const val = document.getElementById('in-cfg-validade').value
    if (!val) { toast(IN_ERROS.API_VALIDADE_INVALIDA, 'warning'); return }
    config = { nome: document.getElementById('in-cfg-nome').value.trim(), escopos, origens,
      limite_minuto: Number(document.getElementById('in-cfg-limite').value) || 60, expira_em: val + 'T23:59:59-05:00' }
  }
  const textos = {
    aprovar: ['Aprovar o pedido ' + p.numero, `O acesso "${config?.nome}" será criado e ${p.remetente_email} receberá o link de retirada da chave (72 horas, uso único).`],
    recusar: ['Recusar o pedido ' + p.numero, `${p.remetente_email} receberá a mensagem escrita como motivo.`],
    reenviar: ['Novo link para ' + p.numero, `Um novo link de retirada será enviado a ${p.remetente_email}; o anterior deixa de valer.`],
  }[decisao]
  inPedirSenha(textos[0], textos[1], senha => fetchDecidir({ acao: 'decidir_api', pedido_id: id, decisao, motivo, config, hash: p.hash, senha }))
}

let _inSenhaAcao = null
function inPedirSenha (titulo, texto, acao) {
  document.getElementById('in-senha-tit').textContent = titulo
  document.getElementById('in-senha-txt').textContent = texto
  document.getElementById('in-senha').value = ''
  document.getElementById('in-senha-erro').hidden = true
  _inSenhaAcao = acao
  adAbrir('in-modal-senha', 'in-senha')
}
document.addEventListener('click', async e => {
  if (!e.target.closest('#in-senha-ok')) return
  await inConfirmarSenha()
})
document.addEventListener('keydown', async e => { if (e.key === 'Enter' && e.target.id === 'in-senha') { e.preventDefault(); await inConfirmarSenha() } })
async function inConfirmarSenha () {
  const senha = document.getElementById('in-senha').value
  const er = document.getElementById('in-senha-erro')
  if (!senha) { er.textContent = 'Digite sua senha.'; er.hidden = false; return }
  const b = document.getElementById('in-senha-ok'); b.disabled = true
  try {
    const r = await _inSenhaAcao(senha)
    if (!r.ok) { er.textContent = inErro(r.erro); er.hidden = false; return }
    document.getElementById('in-senha').value = ''
    adFechar('in-modal-senha'); adFechar('in-modal-ped')
    const em = r.emails || {}
    toast(em.falhas ? 'Decisão registrada. O e-mail não saiu agora; o sistema tenta de novo em até 15 minutos.' : 'Decisão registrada e e-mail enviado.', em.falhas ? 'warning' : 'success')
    await inCarregar()
  } finally { b.disabled = false }
}
async function fetchDecidir (corpo) {
  const { data: { session } } = await db.auth.getSession()
  const res = await fetch(SUPABASE_URL + '/functions/v1/assinar-remanejamento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || ''), 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify(corpo),
  })
  try { return await res.json() } catch (e) { return { ok: false, erro: 'Resposta inválida do servidor (' + res.status + ').' } }
}

// ── Chaves ────────────────────────────────────────────────────────────────
async function inRevogar (id) {
  const c = IN.C.find(x => x.id === id); if (!c) return
  const ok = await adConfirmar({ titulo: 'Revogar "' + c.nome + '"', perigo: true, ok: 'Revogar',
    texto: 'A plataforma que usa esta chave para de receber dados na hora. Não dá para desfazer: para voltar, é preciso criar outra chave.' })
  if (!ok) return
  const { error } = await db.rpc('fn_api_revogar_cliente', { p_id: id })
  if (error) { toast(inErro(error.message), 'error'); return }
  toast('Chave revogada.', 'success')
  await inCarregar()
}

function inNovaChave () {
  document.getElementById('in-nova-body').innerHTML = `
    <div class="form-group"><label class="form-label" for="in-n-nome">Nome do acesso</label>
      <input class="form-control" id="in-n-nome" maxlength="120" placeholder="Ex.: Painel BI da SEPLAN"></div>
    <div class="form-group"><label class="form-label" for="in-n-desc">Observação</label>
      <input class="form-control" id="in-n-desc" maxlength="300" placeholder="Quem usa e para quê"></div>
    <div class="form-group"><span class="form-label">Rotas</span>
      ${Object.entries(IN_ROTAS).map(([k, r]) => `<label class="ad-chk"><input type="checkbox" class="in-n-rota" value="${k}" checked>${esc(r)}</label>`).join('')}</div>
    <div class="form-group"><label class="form-label" for="in-n-origens">Sites do painel no navegador (um por linha)</label>
      <textarea class="form-control" id="in-n-origens" rows="2" placeholder="https://painel.instituicao.gov.br"></textarea>
      <div class="form-hint">Em branco = só servidor ou BI.</div></div>
    <div class="form-group"><label class="form-label" for="in-n-validade">Válida até</label>
      <input type="date" class="form-control" id="in-n-validade" value="${inHoje(365)}" min="${inHoje(2)}" max="${inHoje(730)}"></div>`
  document.getElementById('in-nova-pe').innerHTML = `<span class="ad-sp"></span>
    <button type="button" class="btn btn-secondary" onclick="adFechar('in-modal-nova')">Cancelar</button>
    <button type="button" class="btn btn-primary" onclick="inCriarChave()">${adIc('chave', 'p')}Criar chave</button>`
  adAbrir('in-modal-nova', 'in-n-nome')
}

async function inCriarChave () {
  const nome = document.getElementById('in-n-nome').value.trim()
  if (nome.length < 3) { toast(IN_ERROS.API_NOME_OBRIGATORIO, 'warning'); return }
  const escopos = [...document.querySelectorAll('.in-n-rota:checked')].map(i => i.value)
  if (!escopos.length) { toast(IN_ERROS.API_ESCOPO_INVALIDO, 'warning'); return }
  const origens = (document.getElementById('in-n-origens').value || '').split(/[\s,;]+/).filter(Boolean)
  const ruins = origens.filter(o => inOrigemDe(o) !== o.replace(/\/+$/, '').toLowerCase())
  if (ruins.length) { toast(IN_ERROS.API_ORIGEM_INVALIDA + ' (' + ruins.join(', ') + ')', 'warning'); return }
  const val = document.getElementById('in-n-validade').value
  const { data, error } = await db.rpc('fn_api_criar_cliente', { p_nome: nome, p_descricao: document.getElementById('in-n-desc').value.trim() || null,
    p_escopos: escopos, p_origens: origens.map(inOrigemDe), p_expira_em: val ? val + 'T23:59:59-05:00' : null })
  if (error) { toast(inErro(error.message), 'error'); return }
  document.getElementById('in-nova-body').innerHTML = `
    <div class="ad-aviso">${adIc('alerta', 'p')}<span>Copie a chave agora: ela <b>não aparece de novo</b> e o sistema guarda só uma impressão dela.
      Entregue por um canal seguro (nunca no corpo de um e-mail).</span></div>
    <div class="form-group"><label class="form-label" for="in-n-chave">Chave de "${esc(nome)}"</label>
      <input class="form-control" id="in-n-chave" readonly value="${esc(data.chave)}" style="font-family:var(--font-mono)" onfocus="this.select()"></div>`
  document.getElementById('in-nova-pe').innerHTML = `<button type="button" class="btn btn-secondary" onclick="inCopiar(document.getElementById('in-n-chave').value, this)">${adIc('copiar', 'p')}Copiar</button>
    <span class="ad-sp"></span><button type="button" class="btn btn-primary" onclick="adFechar('in-modal-nova');inCarregar()">Já copiei, fechar</button>`
  AD_FECHAR['in-modal-nova'] = async () => {
    if (document.getElementById('in-n-chave') && !(await adConfirmar({ titulo: 'Fechar sem copiar?', texto: 'A chave não poderá ser vista de novo.', ok: 'Fechar' }))) return
    delete AD_FECHAR['in-modal-nova']; adFechar('in-modal-nova'); inCarregar()
  }
  document.getElementById('in-n-chave').focus()
}
