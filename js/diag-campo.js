// ── DIMA · Diagnóstico Socioambiental — área designada no app de campo ──
//
// Plano: docs/diagnostico/plano-regioes-campo.md. Regra da área em
// js/diag-area.js (igual ao banco); aqui só o que é do aparelho:
//   · GPS contínuo (watchPosition) enquanto o app está aberto e à vista — a
//     posição NÃO é enviada; ao servidor vão só o início e o fim da ficha;
//   · aviso fixo dentro da ficha quando a pessoa sai da área (vibra ao sair);
//   · antes de começar: designação certa pelo ponto, número da entrevista,
//     meta cumprida, quadrícula cheia (dispersão) e pedido de autorização;
//   · funciona sem internet: setores, designações e ocupação vêm do pacote
//     (diag_campo_pacote) guardado no aparelho na última sincronização;
//   · mapa da área (diag_26): casas já entrevistadas do setor — as próprias
//     com número, as dos colegas só ponto/data/recusa — mais as fichas deste
//     aparelho ainda não contadas; aviso de casa já visitada a < 30 m.
// Fora da área NÃO começa; sem GPS começa com justificativa (a ficha vai
// marcada para a mesa). O servidor reclassifica tudo no envio.
//
// Depende de: DiagArea, DiagMapa, dCacheGet/dConfigGet/dConfigSet, dFichasDoUsuario,
// esc (config.js), aviso/ic/uuid/App (diag-app.js).
;(function (raiz) {
  const PREC_RUIM = 150
  let watchId = null, pos = null, erroGps = null
  const ouvintes = new Set()

  function hojeIso() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }

  async function pacote() {
    return (await dCacheGet('campo_pacote')) || { setores: [], designacoes: [], pedidos: [], ocupacao: [], casas: [] }
  }

  // ── Casas já entrevistadas (mapa da área) ──────────────────────────────
  const PERTO_M = 30
  async function casas(uid) {
    const pk = await pacote()
    const lista = (pk.casas || []).filter(c => c.lat != null && c.lon != null).map(c => Object.assign({}, c))
    const doSrv = new Set(lista.filter(c => c.uuid_cliente).map(c => c.uuid_cliente))
    ;(await dFichasDoUsuario(uid)).forEach(f => {
      if (f.treino || !f.setor_id || f.gps_ini_lat == null || f.status_servidor === 'descartada') return
      if (doSrv.has(f.uuid_cliente)) {          // o aparelho sabe se ainda não foi enviada
        const c = lista.find(x => x.uuid_cliente === f.uuid_cliente); if (c) c.estado = f.estado
        return
      }
      lista.push({ setor_id: f.setor_id, lat: Number(f.gps_ini_lat), lon: Number(f.gps_ini_lon), data: f.dt_entrevista,
        recusa: f.aceitou_participar === false, propria: true, local: true, estado: f.estado, uuid_cliente: f.uuid_cliente,
        numero: f.aceitou_participar !== false ? f.numero_designado : null })
    })
    return lista
  }
  // casa já entrevistada mais perto (até 30 m) — só aviso, nunca trava
  async function perto(uid, p, ignorarUuid) {
    if (!p || p.precisao > PREC_RUIM) return null
    let melhor = null
    for (const c of await casas(uid)) {
      if (ignorarUuid && c.uuid_cliente === ignorarUuid) continue
      const d = DiagMapa.distancia(p.lat, p.lon, c.lat, c.lon)
      if (d <= PERTO_M && (!melhor || d < melhor.dist)) melhor = { dist: Math.round(d), casa: c }
    }
    return melhor
  }
  function txtCasa(c) {
    const dia = c.data ? new Date(c.data + 'T12:00').toLocaleDateString('pt-BR') : ''
    let t = c.propria ? (c.recusa ? 'Sua recusa' : 'Sua entrevista' + (c.numero ? ' nº ' + c.numero : ''))
                      : (c.recusa ? 'Recusa registrada por colega' : 'Casa já entrevistada por colega')
    if (dia) t += ' · ' + dia
    if (c.propria && c.estado && c.estado !== 'enviada') t += c.estado === 'rascunho' ? ' · em andamento' : ' · ainda não enviada'
    return t
  }

  // ── GPS contínuo (só no aparelho) ──────────────────────────────────────
  function ligar() {
    if (watchId != null || !navigator.geolocation || document.hidden) return
    watchId = navigator.geolocation.watchPosition(p => {
      pos = { lat: Math.round(p.coords.latitude * 1e6) / 1e6, lon: Math.round(p.coords.longitude * 1e6) / 1e6,
              precisao: Math.round(p.coords.accuracy * 10) / 10, em: new Date(p.timestamp || Date.now()).toISOString() }
      erroGps = null
      ouvintes.forEach(f => { try { f(pos) } catch (e) { console.warn('[diag-campo]', e) } })
    }, e => {
      erroGps = e && e.code === 1 ? 'negado' : 'sem_sinal'
      ouvintes.forEach(f => { try { f(null) } catch (x) { /* nada */ } })
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 })
  }
  function desligar() {
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  function posicao(maxIdadeMs) {
    if (!pos) return null
    return Date.now() - Date.parse(pos.em) <= (maxIdadeMs || 120000) ? pos : null
  }
  // leitura na hora (fim da ficha): nunca trava — sem resposta em N s, segue sem
  function lerAgora(ms) {
    const rec = posicao(60000)
    if (rec) return Promise.resolve(rec)
    if (!navigator.geolocation) return Promise.resolve(null)
    return new Promise(res => {
      const t = setTimeout(() => res(posicao(300000)), ms || 12000)
      navigator.geolocation.getCurrentPosition(p => {
        clearTimeout(t)
        pos = { lat: Math.round(p.coords.latitude * 1e6) / 1e6, lon: Math.round(p.coords.longitude * 1e6) / 1e6,
                precisao: Math.round(p.coords.accuracy * 10) / 10, em: new Date(p.timestamp || Date.now()).toISOString() }
        res(pos)
      }, () => { clearTimeout(t); res(posicao(300000)) }, { enableHighAccuracy: true, timeout: ms || 12000, maximumAge: 30000 })
    })
  }
  function aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn) }
  document.addEventListener('visibilitychange', () => { if (document.hidden) desligar(); else if (ouvintes.size) ligar() })

  // ── Designações e números ─────────────────────────────────────────────
  function vigente(d) {
    const h = hojeIso()
    return (!d.dt_inicio || d.dt_inicio <= h) && (!d.dt_fim || d.dt_fim >= h)
  }
  async function contexto(uid, comunidadeId) {
    const pk = await pacote()
    const setores = pk.setores.filter(s => s.comunidade_id === comunidadeId)
    const porId = {}; pk.setores.forEach(s => { porId[s.id] = s })
    const desigs = pk.designacoes.filter(d => porId[d.setor_id] && porId[d.setor_id].comunidade_id === comunidadeId)
    return { pk, setores, porId, desigs, vigentes: desigs.filter(vigente) }
  }
  // números já usados: os do servidor + os das fichas deste aparelho
  async function ocupados(uid, d) {
    const set = new Set((d.ocupados || []).map(Number))
    ;(await dFichasDoUsuario(uid)).forEach(f => {
      if (f.designacao_id === d.id && f.numero_designado && f.aceitou_participar !== false && f.status_servidor !== 'descartada') set.add(Number(f.numero_designado))
    })
    return set
  }
  function proximo(d, usados) {
    for (let n = 1; n <= d.meta; n++) if (!usados.has(n)) return n
    return null
  }
  // fichas na quadrícula: servidor + as deste aparelho que o pacote ainda não contou
  async function naCelula(uid, pk, setorId, cel) {
    const srv = (pk.ocupacao || []).find(o => o.setor_id === setorId && o.celula === cel)
    let n = srv ? srv.n : 0
    ;(await dFichasDoUsuario(uid)).forEach(f => {
      if (f.treino || f.aceitou_participar === false || f.setor_id !== setorId || f.campo_celula !== cel || f.status_servidor === 'descartada') return
      if (f.estado !== 'enviada' || !f.enviada_em || !pk.gerado_em || f.enviada_em > pk.gerado_em) n++
    })
    return n
  }

  // Avalia se a pessoa pode começar AQUI. Devolve:
  //   { aplica:false } — comunidade sem setores: regra de campo não vale
  //   { aplica:true, estado, desig, setor, numero, cls, celula, nCelula, pos, ... }
  //   estado: ok | sem_designacao | fora | meta_cumprida | sem_gps
  async function avaliar(uid, comunidadeId) {
    const c = await contexto(uid, comunidadeId)
    if (!c.setores.length) return { aplica: false }
    const p = posicao(120000)
    const r = { aplica: true, pos: p, erroGps, setores: c.setores, vigentes: c.vigentes, pk: c.pk }
    r.setorPonto = p ? DiagArea.setorDoPonto(c.setores, p.lat, p.lon) : null
    r.perto = await perto(uid, p)
    if (!c.vigentes.length) { r.estado = 'sem_designacao'; return r }
    // classifica o ponto frente a cada setor designado; prefere dentro > borda
    const aval = c.vigentes.map(d => {
      const s = c.porId[d.setor_id]
      return { d, s, cls: DiagArea.classificar(s.geojson, p && p.lat, p && p.lon, p && p.precisao, s.tolerancia_m) }
    })
    r.avaliacoes = aval
    const semSinal = !p || p.precisao > PREC_RUIM
    let alvo = aval.find(a => a.cls === 'dentro') || aval.find(a => a.cls === 'borda')
    if (!alvo && semSinal) {
      r.estado = 'sem_gps'
      alvo = aval.length === 1 ? aval[0] : null
    } else if (!alvo) {
      r.estado = 'fora'; return r
    }
    if (alvo) {
      r.desig = alvo.d; r.setor = alvo.s; r.cls = alvo.cls
      const usados = await ocupados(uid, alvo.d)
      r.feitas = usados.size
      r.numero = proximo(alvo.d, usados)
      if (!r.numero) { r.estado = 'meta_cumprida'; return r }
      if (p && p.precisao <= PREC_RUIM) {
        r.celula = DiagArea.celula(alvo.s.bbox, alvo.s.celula_m, p.lat, p.lon)
        r.nCelula = await naCelula(uid, c.pk, alvo.s.id, r.celula)
        r.cheia = r.nCelula >= alvo.s.limite_celula
      }
    }
    if (!r.estado) r.estado = 'ok'
    return r
  }

  function txtPos(p) {
    if (!p) return erroGps === 'negado' ? 'Localização bloqueada neste aparelho — libere nas configurações do celular.' : 'Procurando sinal de GPS…'
    return 'GPS: precisão de ' + Math.round(p.precisao) + ' m'
  }
  const BTN_MAPA = '<button type="button" class="btn btn-sec btn-bloco" data-area-mapa>Ver no mapa: você e as casas já entrevistadas</button>'
  function nomeSetor(s) { return s ? 'Setor ' + (s.numero || s.codigo) + ' · ' + s.nome : '' }

  // Caixa da tela "Nova entrevista". Desenha o estado e os campos que ele pede.
  function htmlNova(r) {
    if (!r || !r.aplica) return ''
    const caixa = (cls, titulo, corpo) => '<div class="area-caixa area-' + cls + '" role="status"><b>' + titulo + '</b>' + corpo + '</div>'
    const pedir = '<button type="button" class="btn btn-sec btn-bloco" data-area-pedir>Pedir autorização à coordenação</button>' + BTN_MAPA
    const gps = '<p class="dica" data-area-gps>' + esc(txtPos(r.pos)) + '</p>'
    if (r.estado === 'sem_designacao')
      return caixa('erro', 'Você não tem área designada nesta APA',
        '<p>A coordenação designa quem entrevista em cada setor. ' + (r.setorPonto ? 'Você está no <b>' + esc(nomeSetor(r.setorPonto)) + '</b>.' : '') + '</p>' + gps) + pedir
    if (r.estado === 'fora') {
      const minhas = r.avaliacoes.map(a => esc(nomeSetor(a.s))).join(', ')
      return caixa('erro', 'Você está fora da sua área',
        '<p>Sua área: <b>' + minhas + '</b>. ' + (r.setorPonto ? 'Você está no ' + esc(nomeSetor(r.setorPonto)) + '.' : 'Este ponto não está em nenhum setor da APA.') +
        ' Vá até a sua área ou peça autorização.</p>' + gps) + pedir
    }
    if (r.estado === 'meta_cumprida')
      return caixa('ok', 'Meta cumprida no ' + esc(nomeSetor(r.setor)),
        '<p>As ' + r.desig.meta + ' entrevistas deste setor já estão feitas. Para fazer mais, peça à coordenação.</p>') + pedir
    let h = ''
    if (r.estado === 'sem_gps') {
      h += caixa('aviso', 'Sem sinal de GPS confiável',
        '<p>Dá para começar, mas a ficha vai marcada para conferência. Se puder, espere o sinal melhorar ao ar livre.</p>' + gps) +
        (r.vigentes.length > 1 && !r.desig
          ? '<label class="rot" for="area-desig">Em qual das suas áreas você está?</label><select class="campo" id="area-desig"><option value="">Escolha…</option>' +
            r.avaliacoes.map(a => '<option value="' + esc(a.d.id) + '">' + esc(nomeSetor(a.s)) + '</option>').join('') + '</select>'
          : '') +
        '<label class="rot" for="area-just-gps">Por que está sem GPS? (obrigatório)</label>' +
        '<input class="campo" id="area-just-gps" maxlength="300" placeholder="Ex.: mata fechada, celular sem sinal">'
    } else {
      h += caixa(r.cls === 'borda' ? 'aviso' : 'ok', (r.cls === 'borda' ? 'Na divisa do ' : 'Dentro do ') + esc(nomeSetor(r.setor)),
        '<p>Entrevista <b>' + r.numero + ' de ' + r.desig.meta + '</b>' + (r.desig.tipo === 'autorizacao' ? ' · autorização até ' + esc(new Date(r.desig.dt_fim + 'T12:00').toLocaleDateString('pt-BR')) : '') + '.</p>' + gps)
    }
    if (r.perto) {
      h += caixa('aviso', 'Possível casa já visitada aqui',
        '<p>A ' + r.perto.dist + ' m de você: ' + esc(txtCasa(r.perto.casa)) + '. Confira com o morador se a casa já foi entrevistada antes de começar.</p>')
    }
    if (r.cheia) {
      h += caixa('aviso', 'Já há ' + r.nCelula + ' entrevista(s) neste trecho',
        '<p>Para a amostra valer, as entrevistas precisam ficar espalhadas pelo setor. Procure casas em outro trecho; se só há casas aqui, explique.</p>') +
        '<label class="rot" for="area-just-conc">Por que entrevistar neste mesmo trecho? (obrigatório)</label>' +
        '<input class="campo" id="area-just-conc" maxlength="300" placeholder="Ex.: as casas do setor ficam só na beira do ramal">'
    }
    return h + BTN_MAPA
  }

  // Confere a tela "Nova entrevista" e devolve os campos da ficha ou { erro }.
  function conferirNova(r, raizEl) {
    if (!r || !r.aplica) return { campos: {} }
    if (r.estado === 'sem_designacao' || r.estado === 'fora' || r.estado === 'meta_cumprida')
      return { erro: r.estado === 'meta_cumprida' ? 'Meta deste setor cumprida.' : r.estado === 'fora' ? 'Você está fora da sua área designada.' : 'Você não tem área designada nesta APA.' }
    const val = id => { const e = raizEl.querySelector('#' + id); return e ? e.value.trim() : '' }
    let desig = r.desig, setor = r.setor, numero = r.numero
    const campos = {}
    if (r.estado === 'sem_gps') {
      if (!desig) {
        const id = val('area-desig')
        const a = r.avaliacoes.find(x => x.d.id === id)
        if (!a) return { erro: 'Escolha em qual das suas áreas você está.' }
        desig = a.d; setor = a.s; numero = null      // número sai na hora (abaixo)
      }
      const j = val('area-just-gps')
      if (j.length < 10) return { erro: 'Explique por que está sem GPS (pelo menos 10 letras).' }
      campos.justificativa_campo = j
    }
    if (r.cheia) {
      const j = val('area-just-conc')
      if (j.length < 10) return { erro: 'Explique por que entrevistar no mesmo trecho (pelo menos 10 letras).' }
      campos.justificativa_concentracao = j
    }
    Object.assign(campos, { designacao_id: desig.id, setor_id: setor.id, numero_designado: numero, _meta: desig.meta,
      setor_rotulo: setor.codigo, campo_celula: r.celula || null })
    if (r.pos) Object.assign(campos, { gps_ini_lat: r.pos.lat, gps_ini_lon: r.pos.lon, gps_ini_precisao_m: r.pos.precisao, gps_ini_em: r.pos.em })
    return { campos, precisaNumero: numero == null }
  }

  // número para quem escolheu a área à mão (sem GPS)
  async function numeroPara(uid, desigId) {
    const pk = await pacote()
    const d = pk.designacoes.find(x => x.id === desigId)
    return d ? proximo(d, await ocupados(uid, d)) : null
  }

  // Situação da ficha aberta frente à área dela, para a faixa da ficha
  async function situacaoFicha(f) {
    if (!f || !f.setor_id) return null
    const pk = await pacote()
    const s = pk.setores.find(x => x.id === f.setor_id)
    if (!s) return null
    const p = posicao(120000)
    return { setor: s, cls: DiagArea.classificar(s.geojson, p && p.lat, p && p.lon, p && p.precisao, s.tolerancia_m), pos: p }
  }

  // Quadro "Minhas áreas" da tela inicial
  async function htmlInicio(uid) {
    const pk = await pacote()
    const porId = {}; pk.setores.forEach(s => { porId[s.id] = s })
    const ds = pk.designacoes.filter(d => porId[d.setor_id])
    const pendentes = ((await dConfigGet('pedidos_area_' + uid)) || []).filter(x => !x.enviado)
    if (!ds.length && !pk.pedidos.length && !pendentes.length) return ''
    const p = posicao(120000)
    let h = '<div class="cartao area-lista"><h3>Minhas áreas</h3>'
    for (const d of ds) {
      const s = porId[d.setor_id]
      const feitas = (await ocupados(uid, d)).size
      const cls = p ? DiagArea.classificar(s.geojson, p.lat, p.lon, p.precisao, s.tolerancia_m) : null
      const pct = Math.min(100, Math.round(100 * feitas / d.meta))
      h += '<div class="area-item"><div class="area-linha"><span><b>' + esc(nomeSetor(s)) + '</b>' +
        (d.tipo === 'autorizacao' ? ' <span class="selo selo-pronta">autorização</span>' : '') +
        (vigente(d) ? '' : ' <span class="selo selo-erro">fora do prazo</span>') + '</span>' +
        '<span class="area-n">' + feitas + ' de ' + d.meta + '</span></div>' +
        '<div class="progresso area-barra" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
        (cls ? '<span class="sub area-sit area-sit-' + cls + '">' + esc(DiagArea.ROTULO[cls]) + ' agora</span>' : '') + '</div>'
    }
    const ped = pk.pedidos.filter(x => x.status === 'pendente' || Date.now() - Date.parse(x.decidido_em || x.pedido_em) < 7 * 864e5)
    if (pendentes.length || ped.length) {
      h += '<p class="dica" style="margin-top:10px"><b>Pedidos de autorização:</b> ' +
        [pendentes.length ? pendentes.length + ' aguardando envio' : '',
         ...ped.map(x => (x.setor_id && porId[x.setor_id] ? porId[x.setor_id].codigo + ': ' : '') +
           ({ pendente: 'aguardando a coordenação', aprovado: 'aprovado', recusado: 'recusado' + (x.parecer ? ' (' + x.parecer + ')' : ''), cancelado: 'cancelado' }[x.status] || x.status))]
          .filter(Boolean).map(esc).join(' · ') + '</p>'
    }
    if (ds.length) h += BTN_MAPA
    h += '<p class="dica">' + esc(txtPos(p)) + '. A posição fica só neste celular; vai ao servidor apenas no início e no fim de cada entrevista.</p></div>'
    return h
  }

  // ── Pedido de autorização (offline: fila no aparelho) ──────────────────
  async function guardarPedido(uid, dados) {
    const lista = (await dConfigGet('pedidos_area_' + uid)) || []
    lista.push(Object.assign({ uuid_cliente: uuid(), pedido_em: new Date().toISOString(), enviado: false }, dados))
    await dConfigSet('pedidos_area_' + uid, lista)
  }
  async function enviarPedidos(uid, cliente) {
    const lista = (await dConfigGet('pedidos_area_' + uid)) || []
    let n = 0
    for (const x of lista) {
      if (x.enviado) continue
      const { error } = await cliente.rpc('diag_area_pedir', { p: {
        uuid_cliente: x.uuid_cliente, comunidade_id: x.comunidade_id || null, setor_id: x.setor_id || null,
        lat: x.lat ?? null, lon: x.lon ?? null, precisao_m: x.precisao_m ?? null,
        motivo: x.motivo, quantidade: x.quantidade || 1, pedido_em: x.pedido_em } })
      if (error) { if (!/^diag:/.test(String(error.message || ''))) break; x.erro = String(error.message).replace(/^diag:[a-z_]+:\s*/, ''); x.enviado = true }
      else { x.enviado = true; n++ }
    }
    await dConfigSet('pedidos_area_' + uid, lista.filter(x => !x.enviado || Date.now() - Date.parse(x.pedido_em) < 30 * 864e5))
    return n
  }

  // chave do que está na tela: só redesenha a caixa quando ela muda (não apaga o que a pessoa digita)
  function chaveNova(r) {
    if (!r || !r.aplica) return ''
    return [r.estado, r.desig && r.desig.id, r.cls, r.numero, r.cheia, r.setorPonto && r.setorPonto.id,
            r.perto && r.perto.casa.lat + ',' + r.perto.casa.lon].join('|')
  }

  const api = { ligar, desligar, posicao, lerAgora, aoMudar, pacote, avaliar, htmlNova, conferirNova, numeroPara,
                situacaoFicha, htmlInicio, guardarPedido, enviarPedidos, nomeSetor, txtPos, chaveNova,
                casas, perto, txtCasa, PERTO_M }
  raiz.DiagCampo = api
})(window)
