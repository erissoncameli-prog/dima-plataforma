// ── DIMA · Diagnóstico Socioambiental — armazenamento offline (IndexedDB) ──
//
// Molde: SIGUC js/agua-offline.js / brigada-offline.js. O aparelho é a fonte
// de verdade enquanto a ficha não chega ao servidor. Regras:
//   · rascunho é gravado a CADA resposta (entrevista de 45–70 min, pode ser
//     interrompida: bateria, chuva, a família precisa sair);
//   · nada pendente é apagado — nem por logout, nem por erro de envio;
//   · fichas confirmadas pelo servidor ficam 7 dias como cópia de segurança
//     e depois saem do aparelho (menos dado pessoal em celular que pode ser
//     perdido — ver RIPD, risco R1);
//   · cada ficha guarda o usuario_id de quem a criou: num aparelho usado por
//     mais de um técnico, cada um só vê e envia as próprias.
//
// Estados locais da ficha:
//   rascunho → pronta (concluída, na fila) → enviando → enviada
//   erro                  servidor recusou a estrutura (fica no aparelho)
//   aguardando_permissao  acesso vencido fora da carência de 15 dias
//   conflito              servidor já validou/descartou (não reenviar)

const DIAG_DB_NOME = 'dima_diag_v1'
const DIAG_DB_VERSAO = 1
const DIAG_RETENCAO_CONFIRMADAS_MS = 7 * 24 * 3600 * 1000
let _diagDb = null

function dOfflineInit() {
  return new Promise((resolve, reject) => {
    if (_diagDb) return resolve(_diagDb)
    const req = indexedDB.open(DIAG_DB_NOME, DIAG_DB_VERSAO)
    req.onupgradeneeded = ev => {
      const db = ev.target.result
      if (!db.objectStoreNames.contains('fichas')) {
        const s = db.createObjectStore('fichas', { keyPath: 'uuid_cliente' })
        s.createIndex('usuario_id', 'usuario_id')
        s.createIndex('estado', 'estado')
      }
      if (!db.objectStoreNames.contains('fotos')) {
        const s = db.createObjectStore('fotos', { keyPath: 'uuid_cliente' })
        s.createIndex('ficha_uuid', 'ficha_uuid')
      }
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'chave' })
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'chave' })
    }
    req.onsuccess = ev => { _diagDb = ev.target.result; resolve(_diagDb) }
    req.onerror = ev => reject(ev.target.error)
  })
}

function _dTx(store, modo, fn) {
  return dOfflineInit().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo)
    const s = tx.objectStore(store)
    let resultado
    const r = fn(s)
    if (r && 'onsuccess' in r) r.onsuccess = () => { resultado = r.result }
    tx.oncomplete = () => resolve(resultado)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

// ── Fichas ──────────────────────────────────────────────────────────────
function dFichaSalvar(f) {
  f.atualizado_em = new Date().toISOString()
  return _dTx('fichas', 'readwrite', s => s.put(f)).then(() => f)
}
function dFichaObter(uuid) { return _dTx('fichas', 'readonly', s => s.get(uuid)) }

function dFichasDoUsuario(usuarioId) {
  return _dTx('fichas', 'readonly', s => s.index('usuario_id').getAll(usuarioId))
    .then(l => (l || []).sort((a, b) => (b.atualizado_em || '').localeCompare(a.atualizado_em || '')))
}

// pendentes de envio. 'enviando' preso (app fechado no meio) volta para a fila.
function dFichasPendentes(usuarioId) {
  return dFichasDoUsuario(usuarioId).then(l => l.filter(f => f.estado === 'pronta' || f.estado === 'enviando'))
}

function dFichasNaoEnviadas(usuarioId) {
  return dFichasDoUsuario(usuarioId).then(l => l.filter(f => f.estado !== 'enviada'))
}

// só rascunho pode ser descartado no aparelho (ficha na fila vai para o servidor)
async function dFichaDescartarRascunho(uuid) {
  const f = await dFichaObter(uuid)
  if (!f || f.estado !== 'rascunho') throw new Error('Só é possível descartar rascunho.')
  const fotos = await dFotosDaFicha(uuid)
  await Promise.all(fotos.map(ft => _dTx('fotos', 'readwrite', s => s.delete(ft.uuid_cliente))))
  await _dTx('fichas', 'readwrite', s => s.delete(uuid))
}

// ── Fotos (blob comprimido no aparelho) ─────────────────────────────────
function dFotoSalvar(ft) { return _dTx('fotos', 'readwrite', s => s.put(ft)).then(() => ft) }
function dFotoApagar(uuid) { return _dTx('fotos', 'readwrite', s => s.delete(uuid)) }
function dFotosDaFicha(fichaUuid) {
  return _dTx('fotos', 'readonly', s => s.index('ficha_uuid').getAll(fichaUuid)).then(l => l || [])
}

// ── Cache de referência (questionário, municípios, comunidades, sugestões) ─
function dCacheSet(chave, valor) { return _dTx('cache', 'readwrite', s => s.put({ chave, valor, em: new Date().toISOString() })) }
function dCacheGet(chave) { return _dTx('cache', 'readonly', s => s.get(chave)).then(r => r ? r.valor : null) }
function dCacheQuando(chave) { return _dTx('cache', 'readonly', s => s.get(chave)).then(r => r ? r.em : null) }

// ── Configuração do aparelho (PIN, identificador, contador de códigos) ───
function dConfigSet(chave, valor) { return _dTx('config', 'readwrite', s => s.put({ chave, valor })) }
function dConfigGet(chave) { return _dTx('config', 'readonly', s => s.get(chave)).then(r => r ? r.valor : null) }

// 4 caracteres sem ambiguidade (sem 0/O, 1/I/L) — gerado UMA vez por instalação
async function dDispositivoId() {
  let id = await dConfigGet('dispositivo_id')
  if (!id) {
    const alfa = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    const r = new Uint8Array(4); crypto.getRandomValues(r)
    id = Array.from(r, b => alfa[b % alfa.length]).join('')
    await dConfigSet('dispositivo_id', id)
  }
  return id
}

// contador local do dia para o código DSA-<MUN>-<AAMMDD>-<DISP>-<NN>
async function dProximoSeq(dataIso) {
  const chave = 'seq_' + dataIso
  const n = (await dConfigGet(chave) || 0) + 1
  await dConfigSet(chave, n)
  return n
}

// ── Limpeza: confirmadas saem depois de 7 dias; pendentes NUNCA ─────────
async function dLimparConfirmadas() {
  const todas = await _dTx('fichas', 'readonly', s => s.getAll())
  const limite = Date.now() - DIAG_RETENCAO_CONFIRMADAS_MS
  let n = 0
  for (const f of todas || []) {
    if (f.estado === 'enviada' && f.enviada_em && Date.parse(f.enviada_em) < limite) {
      const fotos = await dFotosDaFicha(f.uuid_cliente)
      for (const ft of fotos) await dFotoApagar(ft.uuid_cliente)
      await _dTx('fichas', 'readwrite', s => s.delete(f.uuid_cliente))
      n++
    }
  }
  return n
}

async function dPersistir() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false }
  catch (e) { return false }
}
