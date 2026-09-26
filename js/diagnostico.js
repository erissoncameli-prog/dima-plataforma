// ═══════════════════════════════════════════════════════════════════════
// diagnostico.js — mesa do Diagnóstico Socioambiental (mínima)
// ═══════════════════════════════════════════════════════════════════════
// Aba "Visão geral": atalho para o app de campo, contagem de fichas e a
// limpeza do MODO TREINO. Aba "Admin" (coordenação/super_admin): catálogo
// de comunidades/UCs e suas SUBLOCALIDADES, que o app baixa para uso
// offline. Validação, exportação e indicadores são da Fase 3
// (docs/diagnostico/plano.md).
//
// Tudo passa pelo RLS: cada perfil vê aqui só o que já pode ver no banco
// (técnico, as próprias fichas; visualizador, nenhuma ficha). Catálogo:
// insert/update só para gerir (sem DELETE — desativar, porque fichas
// antigas apontam para ele). Treino: RPC diag_apagar_treino, nunca DELETE.
// ═══════════════════════════════════════════════════════════════════════

const DG_STATUS = [
  ['enviada', 'Aguardando validação'], ['devolvida', 'Devolvidas'],
  ['validada', 'Validadas'], ['descartada', 'Descartadas'],
]
let dgPodeGerir = false
let dgAba = 'geral'
const dgAdm = { municipios: [], comunidades: [], localidades: [], nomesCampo: [], ibge: null }

;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { window.location.href = '../index.html'; return }
  dgPodeGerir = ['super_admin', 'coordenacao'].includes(appState.perfil)

  const html = `<div class="fade-in">
    ${dgPodeGerir ? `<div class="dg-abas">
      <button type="button" class="dg-aba ativa" data-aba="geral" onclick="dgTrocarAba('geral')">Visão geral</button>
      <button type="button" class="dg-aba" data-aba="admin" onclick="dgTrocarAba('admin')">Admin · comunidades e sublocalidades</button>
    </div>` : ''}
    <div id="dg-geral">
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <h3 style="margin:0 0 4px">App de campo</h3>
          <p style="margin:0;font-size:13px;color:var(--cinza-500)">Funciona sem internet. No celular, abra o link e use “Adicionar à tela inicial”.</p>
        </div>
        <a class="btn btn-primary" href="diagnostico-app.html" target="_blank" rel="noopener">Abrir o app ↗</a>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <h3 style="margin:0">Fichas recebidas</h3>
      <div id="dg-reais"><p style="font-size:13px;color:var(--cinza-500)">Carregando…</p></div>
    </div>
    <div class="card dg-treino" style="margin-bottom:16px">
      <h3 style="margin:0">Modo treino</h3>
      <p style="font-size:13px;margin:6px 0 0">Fichas <b>TRE-…</b> servem para testar o app e treinar a equipe em produção.
        Não entram em indicadores nem em sugestões. Aceitam o questionário em rascunho.
        Liberação por técnico: Usuários → permissão <b>Diagnóstico — modo treino</b> (com prazo).</p>
      <div id="dg-treino"></div>
    </div>
    ${dgPodeGerir ? `<div class="card"><h3 style="margin:0 0 8px">Versões do questionário</h3><div id="dg-versoes"></div></div>` : ''}
    </div>
    ${dgPodeGerir ? `<div id="dg-admin" hidden></div>` : ''}
  </div>`

  document.getElementById('app').innerHTML =
    gerarLayout('Diagnóstico Socioambiental', 'diagnostico') + html + '</div></div></div>'
  carregarLogosSidebar()
  await dgCarregar()
})()

async function dgCarregar() {
  const [fichas, versoes] = await Promise.all([
    db.from('diag_fichas').select('status,treino'),
    dgPodeGerir
      ? db.from('diag_questionarios').select('codigo,versao,status,publicado_em,hash_sha256').order('versao', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])
  if (fichas.error) {
    document.getElementById('dg-reais').innerHTML = '<p style="color:var(--erro)">' + esc(fichas.error.message) + '</p>'
    return
  }
  const lista = fichas.data || []
  const conta = (treino) => {
    const c = {}; lista.filter(f => !!f.treino === treino).forEach(f => { c[f.status] = (c[f.status] || 0) + 1 }); return c
  }
  const grade = (c) => '<div class="dg-grade">' + DG_STATUS.map(([k, r]) =>
    `<div class="dg-num"><b>${c[k] || 0}</b><span>${esc(r)}</span></div>`).join('') + '</div>'

  document.getElementById('dg-reais').innerHTML = grade(conta(false)) +
    (lista.length ? '' : '<p style="font-size:13px;color:var(--cinza-500)">Nenhuma ficha visível para o seu perfil.</p>')

  const nTreino = lista.filter(f => f.treino).length
  document.getElementById('dg-treino').innerHTML = grade(conta(true)) + (dgPodeGerir
    ? `<button class="btn btn-danger" ${nTreino ? '' : 'disabled'} onclick="dgApagarTreino(${nTreino})">Apagar fichas de treino (${nTreino})</button>
       <p style="font-size:12px;color:var(--cinza-500);margin:8px 0 0">Apaga todas as fichas TRE-, com moradores, identificação e registro das fotos.
       Os arquivos de foto entram na fila de expurgo. A exclusão fica na trilha de auditoria.
       Fichas nos celulares não somem sozinhas: o técnico desliga o modo treino e elas saem após 7 dias.</p>`
    : '')

  if (dgPodeGerir) {
    document.getElementById('dg-versoes').innerHTML = '<table class="dg-tab"><thead><tr><th>Versão</th><th>Situação</th><th>Publicado em</th><th>Hash</th></tr></thead><tbody>' +
      (versoes.data || []).map(v => `<tr><td>${esc(v.codigo)} v${v.versao}</td><td>${esc(v.status)}</td>
        <td>${v.publicado_em ? new Date(v.publicado_em).toLocaleDateString('pt-BR') : '—'}</td>
        <td class="mono">${esc((v.hash_sha256 || '').slice(0, 12))}…</td></tr>`).join('') + '</tbody></table>'
  }
}

async function dgApagarTreino(n) {
  if (!confirm('Apagar ' + n + ' ficha(s) de TREINO?\n\nFichas reais (DSA-) não são tocadas. Não dá para desfazer.')) return
  const { data, error } = await db.rpc('diag_apagar_treino')
  if (error) { toast('Não foi possível apagar: ' + error.message.replace(/^diag:[a-z_]+:\s*/, ''), 'error'); return }
  toast(data + ' ficha(s) de treino apagada(s).', 'success')
  dgCarregar()
}

// ── Abas ───────────────────────────────────────────────────────────────
function dgTrocarAba(aba) {
  dgAba = aba
  document.querySelectorAll('.dg-aba').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba))
  document.getElementById('dg-geral').hidden = aba !== 'geral'
  document.getElementById('dg-admin').hidden = aba !== 'admin'
  if (aba === 'admin') dgAdminCarregar()
}

// ── Admin: comunidades/UCs e sublocalidades ────────────────────────────
// O app baixa só as ATIVAS na sincronização; mudança aqui chega ao técnico
// na próxima vez que ele sincronizar com internet.
async function dgAdminCarregar() {
  const el = document.getElementById('dg-admin')
  el.innerHTML = '<div class="card"><p style="font-size:13px;color:var(--cinza-500)">Carregando…</p></div>'
  const [mun, com, loc, fic] = await Promise.all([
    db.from('diag_municipios').select('ibge,nome').order('nome'),
    db.from('diag_comunidades').select('id,municipio_ibge,nome,ativo').order('nome'),
    db.from('diag_localidades').select('id,comunidade_id,nome,ativo').order('nome'),
    db.from('diag_fichas').select('municipio_ibge,comunidade_id,comunidade_nova,localidade_nova')
      .or('comunidade_nova.not.is.null,localidade_nova.not.is.null'),
  ])
  const erro = [mun, com, loc, fic].find(r => r.error)
  if (erro) { el.innerHTML = '<div class="card"><p style="color:var(--erro)">' + esc(erro.error.message) + '</p></div>'; return }
  dgAdm.municipios = mun.data || []
  dgAdm.comunidades = com.data || []
  dgAdm.localidades = loc.data || []
  dgAdm.nomesCampo = fic.data || []
  if (!dgAdm.ibge) {
    const comCom = dgAdm.municipios.find(m => dgAdm.comunidades.some(c => c.municipio_ibge === m.ibge))
    dgAdm.ibge = (comCom || dgAdm.municipios.find(m => m.ibge === 1200401) || dgAdm.municipios[0] || {}).ibge
  }
  dgAdminDesenhar()
}

function dgAdminDesenhar() {
  const coms = dgAdm.comunidades.filter(c => c.municipio_ibge === dgAdm.ibge)
  const locsDe = id => dgAdm.localidades.filter(l => l.comunidade_id === id)
  const selo = ativo => ativo ? '' : ' <span class="dg-inativo">inativa</span>'

  // nomes digitados em campo ("Outra") ainda sem cadastro
  const norm = t => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  const pend = {}
  dgAdm.nomesCampo.filter(f => f.municipio_ibge === dgAdm.ibge).forEach(f => {
    if (f.comunidade_nova && !coms.some(c => norm(c.nome) === norm(f.comunidade_nova))) {
      const k = 'c|' + norm(f.comunidade_nova); pend[k] = pend[k] || { tipo: 'comunidade', nome: f.comunidade_nova.trim(), n: 0 }; pend[k].n++
    }
    if (f.localidade_nova && f.comunidade_id && !locsDe(f.comunidade_id).some(l => norm(l.nome) === norm(f.localidade_nova))) {
      const k = 'l|' + f.comunidade_id + '|' + norm(f.localidade_nova)
      pend[k] = pend[k] || { tipo: 'localidade', comunidade_id: f.comunidade_id, nome: f.localidade_nova.trim(), n: 0 }; pend[k].n++
    }
  })
  const pendentes = dgAdm.pendentes = Object.values(pend)

  document.getElementById('dg-admin').innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
        <label style="font-size:12px;flex:1;min-width:200px">Município<br>
          <select id="dg-adm-mun" class="form-control" onchange="dgAdm.ibge=+this.value;dgAdminDesenhar()">
            ${dgAdm.municipios.map(m => `<option value="${m.ibge}" ${m.ibge === dgAdm.ibge ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}
          </select></label>
        <label style="font-size:12px;flex:2;min-width:220px">Nova comunidade / UC<br>
          <input id="dg-adm-nova-com" class="form-control" maxlength="150" placeholder="ex.: APA Lago do Amapá"></label>
        <button class="btn btn-primary" onclick="dgNovaComunidade()">+ Cadastrar</button>
      </div>
      <p style="font-size:12px;color:var(--cinza-500);margin:8px 0 0">O app baixa só o que está ativo, na próxima sincronização do técnico.
        Não há exclusão: desative (fichas antigas continuam apontando para o cadastro).</p>
    </div>
    ${pendentes.length ? `<div class="card" style="margin-bottom:16px;border-left:4px solid #B45309">
      <h3 style="margin:0 0 6px">Escritos em campo, sem cadastro</h3>
      ${pendentes.map((p, i) => `<div class="dg-linha">
        <span style="flex:1">${p.tipo === 'comunidade' ? 'Comunidade' : 'Sublocalidade de ' + esc((dgAdm.comunidades.find(c => c.id === p.comunidade_id) || {}).nome || '?')}:
          <b>${esc(p.nome)}</b> <span style="color:var(--cinza-500)">(${p.n} ficha${p.n > 1 ? 's' : ''})</span></span>
        <button class="btn btn-sm btn-secondary" onclick="dgCadastrarPendente(${i})">Cadastrar</button>
      </div>`).join('')}
      <p style="font-size:12px;color:var(--cinza-500);margin:6px 0 0">Cadastrar não altera as fichas já enviadas; vale para as próximas.</p>
    </div>` : ''}
    ${coms.length ? coms.map(c => `<div class="card" style="margin-bottom:12px">
      <div class="dg-linha" style="border:0">
        <h3 style="margin:0;flex:1">${esc(c.nome)}${selo(c.ativo)}</h3>
        <button class="btn btn-sm btn-secondary" onclick="dgRenomear('diag_comunidades','${c.id}')">Renomear</button>
        <button class="btn btn-sm ${c.ativo ? 'btn-danger' : 'btn-secondary'}" onclick="dgAtivar('diag_comunidades','${c.id}',${!c.ativo})">${c.ativo ? 'Desativar' : 'Reativar'}</button>
      </div>
      <div style="margin:6px 0 0 12px">
        <div style="font-size:12px;font-weight:600;color:var(--cinza-700);margin-bottom:4px">Sublocalidades (${locsDe(c.id).length})</div>
        ${locsDe(c.id).map(l => `<div class="dg-linha">
          <span style="flex:1">└ ${esc(l.nome)}${selo(l.ativo)}</span>
          <button class="btn btn-sm btn-secondary" onclick="dgRenomear('diag_localidades','${l.id}')">Renomear</button>
          <button class="btn btn-sm ${l.ativo ? 'btn-danger' : 'btn-secondary'}" onclick="dgAtivar('diag_localidades','${l.id}',${!l.ativo})">${l.ativo ? 'Desativar' : 'Reativar'}</button>
        </div>`).join('') || '<p style="font-size:12px;color:var(--cinza-500);margin:0">Nenhuma. Sem sublocalidade cadastrada, o app não mostra o campo.</p>'}
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="dg-loc-${c.id}" class="form-control" maxlength="150" placeholder="Nova sublocalidade (bairro, ramal, colocação…)" style="flex:1">
          <button class="btn btn-sm btn-primary" onclick="dgNovaLocalidade('${c.id}')">+ Adicionar</button>
        </div>
      </div>
    </div>`).join('') : '<div class="card"><p style="font-size:13px;color:var(--cinza-500);margin:0">Nenhuma comunidade cadastrada neste município.</p></div>'}`
}

function dgMsgErro(error) {
  return /duplicate|uq_diag/.test(error.message) ? 'Já existe um cadastro com esse nome.' : error.message
}
async function dgNovaComunidade() {
  const nome = document.getElementById('dg-adm-nova-com').value.trim()
  if (nome.length < 2) { toast('Informe o nome da comunidade.', 'warning'); return }
  const { error } = await db.from('diag_comunidades').insert({ municipio_ibge: dgAdm.ibge, nome })
  if (error) { toast(dgMsgErro(error), 'error'); return }
  toast('Comunidade cadastrada.', 'success'); dgAdminCarregar()
}
async function dgNovaLocalidade(comunidadeId) {
  const nome = document.getElementById('dg-loc-' + comunidadeId).value.trim()
  if (nome.length < 2) { toast('Informe o nome da sublocalidade.', 'warning'); return }
  const { error } = await db.from('diag_localidades').insert({ comunidade_id: comunidadeId, nome })
  if (error) { toast(dgMsgErro(error), 'error'); return }
  toast('Sublocalidade cadastrada.', 'success'); dgAdminCarregar()
}
async function dgCadastrarPendente(i) {
  const p = dgAdm.pendentes[i]
  const { error } = p.tipo === 'comunidade'
    ? await db.from('diag_comunidades').insert({ municipio_ibge: dgAdm.ibge, nome: p.nome })
    : await db.from('diag_localidades').insert({ comunidade_id: p.comunidade_id, nome: p.nome })
  if (error) { toast(dgMsgErro(error), 'error'); return }
  toast('Cadastrado.', 'success'); dgAdminCarregar()
}
async function dgRenomear(tabela, id) {
  const atual = (tabela === 'diag_comunidades' ? dgAdm.comunidades : dgAdm.localidades).find(x => x.id === id)
  const nome = (prompt('Novo nome (vale também para as fichas já enviadas, que apontam para este cadastro):', atual ? atual.nome : '') || '').trim()
  if (!nome || (atual && nome === atual.nome)) return
  if (nome.length < 2) { toast('Nome muito curto.', 'warning'); return }
  const { error } = await db.from(tabela).update({ nome }).eq('id', id)
  if (error) { toast(dgMsgErro(error), 'error'); return }
  toast('Renomeado.', 'success'); dgAdminCarregar()
}
async function dgAtivar(tabela, id, ativo) {
  if (!ativo && !confirm('Desativar? Some da lista do app na próxima sincronização; fichas já feitas não mudam.')) return
  const { error } = await db.from(tabela).update({ ativo }).eq('id', id)
  if (error) { toast(error.message, 'error'); return }
  dgAdminCarregar()
}
