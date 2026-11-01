// ═══════════════════════════════════════════════════════════════════════
// api-retirar.js — página pública do link de retirada da chave da API
// ═══════════════════════════════════════════════════════════════════════
// O link (?t=<token>) chega por e-mail depois que o super_admin aprova o pedido
// (20261101_api_pedidos_email). Abrir a página NÃO consome o link: a chave só é
// gerada no clique (fn_publico_api_retirar), aparece uma vez e não é guardada no
// aparelho. O token sai da barra de endereço logo ao abrir (histórico, prints).
// ═══════════════════════════════════════════════════════════════════════
;(function () {
  const API_BASE = SUPABASE_URL + '/functions/v1/api-dados/v1'
  const ROTAS = { resumo: 'Resumo do projeto', atividades: 'Atividades (ficha numérica)', matriz: 'Matriz de Resultados' }
  const ERROS = {
    LINK_INVALIDO: 'Este link não vale mais: ele já foi usado ou foi substituído por um mais novo. Se você não chegou a ver a chave, responda ao e-mail de aprovação pedindo um novo link.',
    LINK_EXPIRADO: 'Este link venceu (vale 72 horas). Responda ao e-mail de aprovação pedindo um novo link.',
    ACESSO_REVOGADO: 'Este acesso foi revogado pela administração do DIMA e a chave não pode mais ser retirada.',
  }
  const $ = id => document.getElementById(id)
  const pinta = L => DimaLogos.pintar(L)
  pinta(DimaLogos.agora()); DimaLogos.carregar(db).then(pinta)

  const token = new URLSearchParams(location.search).get('t') || ''
  try { history.replaceState(null, '', location.pathname) } catch (e) {}

  const erro = msg => { const e = $('ar-erro'); e.textContent = msg; e.hidden = false }
  if (!/^[0-9a-f]{64}$/.test(token)) {
    $('ar-mostrar').disabled = true
    erro('O link está incompleto. Abra de novo pelo botão do e-mail ou copie o endereço inteiro que aparece nele.')
    return
  }

  let copiou = false
  $('ar-mostrar').addEventListener('click', async () => {
    const b = $('ar-mostrar')
    b.disabled = true; b.lastChild.textContent = 'Gerando…'
    const { data, error } = await db.rpc('fn_publico_api_retirar', { p_token: token })
    if (error) {
      const cod = Object.keys(ERROS).find(k => (error.message || '').includes(k))
      erro(cod ? ERROS[cod] : 'Não foi possível gerar a chave agora. Tente de novo em alguns minutos.')
      if (!cod) { b.disabled = false; b.lastChild.textContent = 'Mostrar minha chave' }
      else b.hidden = true
      return
    }
    mostrar(data)
  })

  function mostrar (d) {
    $('ar-inicio').hidden = true
    $('ar-pronto').hidden = false
    $('ar-chave').textContent = d.chave
    const dt = d.expira_em ? new Date(d.expira_em).toLocaleDateString('pt-BR', { timeZone: 'America/Rio_Branco' }) : '—'
    const item = (rot, val) => '<dt>' + esc(rot) + '</dt><dd>' + val + '</dd>'
    $('ar-detalhes').innerHTML =
      item('Acesso', esc(d.nome)) +
      item('Pedido', esc(d.pedido)) +
      item('Rotas liberadas', (d.escopos || []).map(r => esc(ROTAS[r] || r)).join('<br>')) +
      item('Sites do painel', (d.origens || []).length ? d.origens.map(esc).join('<br>') : 'Nenhum (só servidor ou BI)') +
      item('Limite', esc(d.limite_minuto) + ' chamadas por minuto') +
      item('Válida até', esc(dt))
    const rota = (d.escopos || [])[0] || 'resumo'
    $('ar-ex-base').textContent = API_BASE + '/{' + (d.escopos || []).join('|') + '}'
    $('ar-ex-curl').textContent = 'curl -H "Authorization: Bearer ' + d.chave + '" \\\n  ' + API_BASE + '/' + rota
    $('ar-ex-js').textContent = "const r = await fetch('" + API_BASE + "/" + rota + "', {\n  headers: { Authorization: 'Bearer ' + CHAVE }\n})\nconst dados = await r.json()"
    $('ar-ex-pbi').textContent = 'let\n  Fonte = Csv.Document(Web.Contents("' + API_BASE + '/' + rota + '",\n    [Query=[formato="csv"], Headers=[Authorization="Bearer ' + d.chave + '"]]),\n    [Delimiter=",", Encoding=65001]),\n  Tabela = Table.PromoteHeaders(Fonte)\nin Tabela'
    $('ar-copiar').focus()
    // sair sem copiar perde a chave para sempre
    window.addEventListener('beforeunload', e => { if (!copiou) { e.preventDefault(); e.returnValue = '' } })
  }

  $('ar-copiar').addEventListener('click', async () => {
    const txt = $('ar-chave').textContent
    try { await navigator.clipboard.writeText(txt) } catch (e) {
      const r = document.createRange(); r.selectNodeContents($('ar-chave'))
      const s = getSelection(); s.removeAllRanges(); s.addRange(r)
      try { document.execCommand('copy') } catch (e2) {}
    }
    copiou = true
    const b = $('ar-copiar'); b.classList.add('ok'); b.querySelector('span').textContent = 'Copiada'
    b.querySelector('use').setAttribute('href', '#ari-check')
  })
})()
