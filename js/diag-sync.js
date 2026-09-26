// ── DIMA · Diagnóstico Socioambiental — fila de envio e sincronização ────
//
// Molde: SIGUC js/agua-sync.js / brigada-sync.js.
//   · teste REAL de conexão (navigator.onLine mente na WebView do APK);
//   · renova a sessão antes de enviar;
//   · envio idempotente: diag_enviar_ficha usa uuid_cliente — reenviar a
//     mesma ficha (app fechou no meio, rede caiu depois do servidor gravar)
//     atualiza, nunca duplica;
//   · ficha + moradores + identificação + fotos numa transação só no banco;
//   · fotos sobem ANTES da ficha para <uuid_cliente da ficha>/<uuid_foto>.jpg.
//     Foto que falhar NÃO segura a ficha: a ficha vai, a foto fica pendente
//     e a ficha é reenviada (com a foto) na próxima sincronização;
//   · erro de estrutura/permissão fica marcado NA FICHA e as outras seguem.
//
// Depende de: diagDb (cliente Supabase isolado do app), SUPABASE_URL,
// SUPABASE_ANON_KEY (js/config.js), js/diag-offline.js, js/diag-regras.js.

const DIAG_BUCKET = 'diagnostico-fotos'
let _dSyncRodando = false

async function dSyncTemConexao() {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    const r = await fetch(SUPABASE_URL + '/rest/v1/', {
      method: 'HEAD', headers: { apikey: SUPABASE_ANON_KEY }, cache: 'no-store', signal: ctrl.signal,
    })
    clearTimeout(t)
    return r.status < 500
  } catch (e) { return false }
}

async function dSyncGarantirSessao() {
  try {
    const { data } = await diagDb.auth.getSession()
    const sessao = data && data.session
    if (!sessao) return 'sem_sessao'
    if (Date.now() > (sessao.expires_at || 0) * 1000 - 5 * 60 * 1000) {
      const { error } = await diagDb.auth.refreshSession()
      if (error) return 'sem_sessao'
    }
    return 'ok'
  } catch (e) { return 'sem_sessao' }
}

function _dCodigoErro(err) {
  const m = String((err && (err.message || err)) || '')
  const x = /^diag:([a-z_]+)/.exec(m)
  return x ? x[1] : null
}

function dUrlFoto(caminho) {
  // formato /object/public/<bucket>/<path>: só portador do caminho (regra de Storage do DIMA)
  return SUPABASE_URL + '/storage/v1/object/public/' + DIAG_BUCKET + '/' + caminho
}

async function _dSubirFotos(f) {
  const fotos = await dFotosDaFicha(f.uuid_cliente)
  let falhas = 0
  for (const ft of fotos) {
    if (ft.enviada || !ft.blob) continue
    const caminho = f.uuid_cliente + '/' + ft.uuid_cliente + '.jpg'
    const { error } = await diagDb.storage.from(DIAG_BUCKET)
      .upload(caminho, ft.blob, { contentType: 'image/jpeg', upsert: false })
    // reenvio de foto que já subiu: o servidor responde "já existe" — é sucesso
    if (!error || /exist|duplicate|409/i.test(String(error.message || error.statusCode || ''))) {
      ft.enviada = true
      ft.arquivo_url = dUrlFoto(caminho)
      await dFotoSalvar(ft)
    } else {
      falhas++
      console.warn('[diag-sync] foto não subiu (fica pendente):', error.message || error)
    }
  }
  const enviadas = (await dFotosDaFicha(f.uuid_cliente)).filter(ft => ft.enviada)
  return { falhas, payload: enviadas.map(ft => ({
    uuid_cliente: ft.uuid_cliente, tema: ft.tema, pergunta_chave: ft.pergunta_chave || null,
    legenda: ft.legenda || null, arquivo_url: ft.arquivo_url, tirada_em: ft.tirada_em,
  })) }
}

function _dPayloadFicha(f) {
  return {
    uuid_cliente: f.uuid_cliente, codigo: f.codigo, questionario_id: f.questionario_id,
    municipio_ibge: f.municipio_ibge, comunidade_id: f.comunidade_id || null,
    comunidade_nova: f.comunidade_nova || null, dt_entrevista: f.dt_entrevista,
    iniciada_em: f.iniciada_em, finalizada_em: f.finalizada_em,
    aviso_lido: !!f.aviso_lido, aceitou_participar: !!f.aceitou_participar,
    respostas: f.aceitou_participar ? (f.respostas || {}) : {},
    entrevistado_nome: f.entrevistado_nome || null, obs_localizacao: f.obs_localizacao || null,
    lat: f.lat ?? null, lon: f.lon ?? null, gps_precisao_m: f.gps_precisao_m ?? null, gps_em: f.gps_em || null,
    app_versao: DIAG_APP_VERSAO, dispositivo_id: f.dispositivo_id || null, treino: !!f.treino,
  }
}

// Envia UMA ficha. Devolve 'ok' | 'rede' (parar a fila) | 'recusada' (seguir a fila)
async function dSyncEnviarFicha(f) {
  f.estado = 'enviando'
  await dFichaSalvar(f)
  let fotos
  try {
    fotos = await _dSubirFotos(f)
  } catch (e) {
    f.estado = 'pronta'; await dFichaSalvar(f)
    return 'rede'
  }
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let resp
    try {
      resp = await diagDb.rpc('diag_enviar_ficha', {
        p_ficha: _dPayloadFicha(f), p_moradores: f.aceitou_participar ? (f.moradores || []) : [], p_fotos: fotos.payload,
      })
    } catch (e) {
      resp = { error: e }
    }
    if (!resp.error) {
      f.estado = 'enviada'
      f.status_servidor = 'enviada'
      f.servidor_id = resp.data && resp.data.id
      f.alertas = (resp.data && resp.data.alertas) || []
      f.enviada_em = new Date().toISOString()
      f.fotos_pendentes = fotos.falhas > 0
      f.erro_msg = null
      f.motivo_devolucao = null
      await dFichaSalvar(f)
      return 'ok'
    }
    const cod = _dCodigoErro(resp.error)
    if (cod === 'codigo_duplicado' && tentativa === 0) {
      // colisão do código legível (reinstalação etc.): gera outro e reenvia
      const mun = ((await dCacheGet('municipios')) || []).find(m => m.ibge === f.municipio_ibge)
      f.codigo = DiagRegras.gerarCodigo(mun ? mun.sigla : 'XXX', f.dt_entrevista, await dDispositivoId(),
                                         await dProximoSeq(f.dt_entrevista), f.treino ? 'TRE' : 'DSA')
      continue
    }
    if (!cod) {                        // rede, 503 do SW, timeout: tenta de novo depois
      f.estado = 'pronta'; await dFichaSalvar(f)
      return 'rede'
    }
    if (cod === 'sem_sessao') { f.estado = 'pronta'; await dFichaSalvar(f); return 'sessao' }
    f.estado = cod === 'sem_permissao' || cod === 'sem_permissao_treino' ? 'aguardando_permissao'
             : /^ja_/.test(cod) ? 'conflito' : 'erro'
    f.erro_msg = String(resp.error.message || resp.error).replace(/^diag:[a-z_]+:\s*/, '')
    await dFichaSalvar(f)
    return 'recusada'
  }
  return 'recusada'
}

// ── Referências para trabalhar offline ─────────────────────────────────
async function dSyncBaixarReferencias(usuarioId) {
  const r = {}
  const COLS_Q = 'id,codigo,versao,titulo,estrutura,aviso_entrevistado,status,hash_sha256'
  const [q, mun, com, sug, treina] = await Promise.all([
    diagDb.from('diag_questionarios').select(COLS_Q)
      .eq('codigo', 'DSA').eq('status', 'publicado').order('versao', { ascending: false }).limit(1),
    diagDb.from('diag_municipios').select('ibge,nome,sigla').order('nome'),
    diagDb.from('diag_comunidades').select('id,municipio_ibge,nome').eq('ativo', true).order('nome'),
    diagDb.rpc('fn_diag_sugestoes'),
    diagDb.rpc('fn_diag_pode_treinar'),
  ])
  if (q.data && q.data[0]) {
    await dCacheSet('questionario', q.data[0])
    // versões antigas continuam no aparelho: rascunho começado na v1 termina na v1
    const todas = (await dCacheGet('questionarios')) || {}
    todas[q.data[0].id] = q.data[0]
    await dCacheSet('questionarios', todas)
    r.questionario = q.data[0].versao
  }
  // modo treino: usa a versão mais nova, mesmo em rascunho (testar antes de publicar)
  if (!treina.error) {
    await dConfigSet('pode_treinar_' + usuarioId, !!treina.data)
    if (treina.data) {
      const qt = await diagDb.from('diag_questionarios').select(COLS_Q).eq('codigo', 'DSA')
        .in('status', ['rascunho', 'publicado']).order('versao', { ascending: false }).limit(1)
      if (qt.data && qt.data[0]) {
        await dCacheSet('questionario_treino', qt.data[0])
        const todas = (await dCacheGet('questionarios')) || {}
        todas[qt.data[0].id] = qt.data[0]
        await dCacheSet('questionarios', todas)
      }
    }
  }
  if (mun.data) await dCacheSet('municipios', mun.data)
  if (com.data) await dCacheSet('comunidades', com.data)
  if (sug.data) {
    const porChave = {}
    sug.data.forEach(s => { (porChave[s.chave] = porChave[s.chave] || []).push(s.texto) })
    await dCacheSet('sugestoes', porChave)
  }
  await _dSyncStatusDoServidor(usuarioId)
  return r
}

// Traz de volta as fichas DEVOLVIDAS pela coordenação (para corrigir) e
// atualiza o status das já enviadas (validada/descartada).
async function _dSyncStatusDoServidor(usuarioId) {
  const { data: minhas, error } = await diagDb.from('diag_fichas')
    .select('id,uuid_cliente,codigo,questionario_id,municipio_ibge,comunidade_id,comunidade_nova,dt_entrevista,iniciada_em,finalizada_em,aviso_lido,aceitou_participar,respostas,status,motivo_devolucao,dispositivo_id,treino')
    .eq('entrevistador_id', usuarioId)
  if (error || !minhas) return
  for (const s of minhas) {
    let f = await dFichaObter(s.uuid_cliente)
    if (f && f.usuario_id !== usuarioId) continue
    if (s.status === 'devolvida') {
      if (f && (f.estado === 'rascunho' || f.estado === 'pronta') && f.status_servidor === 'devolvida') continue  // já está sendo corrigida
      if (!f) f = await _dSyncReconstruir(s, usuarioId)
      f.estado = 'rascunho'
      f.status_servidor = 'devolvida'
      f.motivo_devolucao = s.motivo_devolucao
      await dFichaSalvar(f)
    } else if (f && f.estado === 'enviada') {
      if (f.status_servidor !== s.status) { f.status_servidor = s.status; await dFichaSalvar(f) }
    }
  }
}

// ficha devolvida que não está mais no aparelho (limpeza de 7 dias, outro celular)
async function _dSyncReconstruir(s, usuarioId) {
  const [mor, ident, fotos] = await Promise.all([
    diagDb.from('diag_moradores').select('id,ordem,idade,sexo_genero,sexo_genero_outro,parentesco,escolaridade,atividade_principal,e_entrevistado').eq('ficha_id', s.id).order('ordem'),
    diagDb.from('diag_fichas_identificacao').select('entrevistado_nome,lat,lon,gps_precisao_m,gps_em,obs_localizacao').eq('ficha_id', s.id).maybeSingle(),
    diagDb.from('diag_fotos').select('uuid_cliente,tema,pergunta_chave,legenda,arquivo_url,tirada_em').eq('ficha_id', s.id),
  ])
  const ids = (mor.data || []).map(m => m.id)
  const nomes = ids.length
    ? ((await diagDb.from('diag_moradores_identificacao').select('morador_id,nome').in('morador_id', ids)).data || [])
    : []
  const nomePor = {}; nomes.forEach(n => { nomePor[n.morador_id] = n.nome })
  const id = ident.data || {}
  for (const ft of fotos.data || []) {
    await dFotoSalvar(Object.assign({}, ft, { ficha_uuid: s.uuid_cliente, enviada: true, blob: null }))
  }
  return {
    uuid_cliente: s.uuid_cliente, usuario_id: usuarioId, codigo: s.codigo, questionario_id: s.questionario_id,
    municipio_ibge: s.municipio_ibge, comunidade_id: s.comunidade_id, comunidade_nova: s.comunidade_nova,
    dt_entrevista: s.dt_entrevista, iniciada_em: s.iniciada_em, finalizada_em: s.finalizada_em,
    aviso_lido: s.aviso_lido, aceitou_participar: s.aceitou_participar, respostas: s.respostas || {},
    moradores: (mor.data || []).map(m => { const o = Object.assign({}, m, { nome: nomePor[m.id] || '' }); delete o.id; return o }),
    entrevistado_nome: id.entrevistado_nome || '', obs_localizacao: id.obs_localizacao || '',
    lat: id.lat ?? null, lon: id.lon ?? null, gps_precisao_m: id.gps_precisao_m ?? null, gps_em: id.gps_em || null,
    dispositivo_id: s.dispositivo_id, servidor_id: s.id, treino: !!s.treino,
  }
}

// ── Ponto de entrada ────────────────────────────────────────────────────
// Devolve { situacao: 'ok'|'sem_conexao'|'sem_sessao'|'ocupado', enviadas, recusadas, restantes }
async function dSyncRodar(usuarioId, aoProgredir) {
  if (_dSyncRodando) return { situacao: 'ocupado' }
  _dSyncRodando = true
  const res = { situacao: 'ok', enviadas: 0, recusadas: 0, restantes: 0 }
  try {
    if (!diagDb || !(await dSyncTemConexao())) { res.situacao = 'sem_conexao'; return res }
    if ((await dSyncGarantirSessao()) !== 'ok') { res.situacao = 'sem_sessao'; return res }

    const fila = (await dFichasDoUsuario(usuarioId)).filter(f =>
      f.estado === 'pronta' || f.estado === 'enviando' || f.estado === 'aguardando_permissao' ||
      (f.estado === 'enviada' && f.fotos_pendentes && f.status_servidor !== 'validada' && f.status_servidor !== 'descartada'))
    for (let i = 0; i < fila.length; i++) {
      if (aoProgredir) aoProgredir({ atual: i + 1, total: fila.length, codigo: fila[i].codigo })
      const r = await dSyncEnviarFicha(fila[i])
      if (r === 'ok') res.enviadas++
      else if (r === 'recusada') res.recusadas++
      else { res.situacao = r === 'sessao' ? 'sem_sessao' : 'sem_conexao'; break }
    }
    if (res.situacao === 'ok') {
      await dSyncBaixarReferencias(usuarioId)
      await dConfigSet('ultima_sync_' + usuarioId, new Date().toISOString())
      await dLimparConfirmadas()
    }
    res.restantes = (await dFichasPendentes(usuarioId)).length
    return res
  } finally {
    _dSyncRodando = false
  }
}
