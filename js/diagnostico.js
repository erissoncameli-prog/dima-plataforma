// ═══════════════════════════════════════════════════════════════════════
// diagnostico.js — mesa do Diagnóstico Socioambiental (mínima)
// ═══════════════════════════════════════════════════════════════════════
// Por ora: atalho para o app de campo, contagem de fichas e a limpeza do
// MODO TREINO. Validação, exportação, indicadores e cadastro de
// comunidades são da Fase 3 (docs/diagnostico/plano.md).
//
// Tudo passa pelo RLS: cada perfil vê aqui só o que já pode ver no banco
// (técnico, as próprias fichas; visualizador, nenhuma ficha). A exclusão
// do treino é a RPC diag_apagar_treino (coordenação/super_admin) — nunca
// DELETE direto (as tabelas diag_* não têm policy de escrita).
// ═══════════════════════════════════════════════════════════════════════

const DG_STATUS = [
  ['enviada', 'Aguardando validação'], ['devolvida', 'Devolvidas'],
  ['validada', 'Validadas'], ['descartada', 'Descartadas'],
]
let dgPodeGerir = false

;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { window.location.href = '../index.html'; return }
  dgPodeGerir = ['super_admin', 'coordenacao'].includes(appState.perfil)

  const html = `<div class="fade-in">
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
