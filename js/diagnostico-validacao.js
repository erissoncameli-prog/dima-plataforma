// ═══════════════════════════════════════════════════════════════════════
// diagnostico-validacao.js — aba "Validação" da mesa do Diagnóstico
// ═══════════════════════════════════════════════════════════════════════
// Coordenação/super_admin: lista de fichas, ficha aberta (respostas,
// moradores, identificação, fotos, histórico) e as ações validar /
// devolver / descartar / reabrir — TODAS pela RPC diag_mudar_status, que é
// quem decide as transições e grava o histórico (nunca UPDATE direto).
// Consultor externo (com permissão): mesma leitura, SEM identificação, fotos
// e botões — quem esconde é o RLS (diag_fichas_identificacao, diag_fotos e
// diag_moradores_identificacao não devolvem linhas para ele); a tela só
// deixa de desenhar o que não veio.
//
// Respostas são mostradas a partir de diag_questionarios.estrutura da
// versão da ficha (o questionário é dado, não código). Avisos vêm prontos
// em diag_fichas.alertas (calculados pelo banco no envio) e são descritos
// por DiagRegras.descreverAlerta — a mesma frase que o técnico viu no app.
// ═══════════════════════════════════════════════════════════════════════

const dgVal = {
  carregado: false, fichas: [], usuarios: {}, municipios: {}, comunidades: {}, localidades: {},
  questionarios: {}, filtro: { status: 'enviada', com: '', tec: '', de: '', ate: '', busca: '', treino: false },
  aberta: null,
}
const DGV_ROTULO = { enviada: 'Aguardando validação', devolvida: 'Devolvida', validada: 'Validada', descartada: 'Descartada' }
const DGV_CURTO = { enviada: 'Aguardando', devolvida: 'Devolvida', validada: 'Validada', descartada: 'Descartada' }

async function dgValCarregar(forcar) {
  const el = document.getElementById('dg-validacao')
  if (!el) return
  if (dgVal.carregado && !forcar) { dgValDesenhar(); return }
  el.innerHTML = '<div class="card"><p style="font-size:13px;color:var(--cinza-500)">Carregando fichas…</p></div>'
  const [fic, mun, com, loc] = await Promise.all([
    db.from('diag_fichas').select('id,codigo,status,treino,municipio_ibge,comunidade_id,comunidade_nova,localidade_id,localidade_nova,dt_entrevista,entrevistador_id,alertas,aceitou_participar,enviado_em,questionario_id,motivo_devolucao,validado_em,fotos_registradas,fotos_autorizadas')
      .order('enviado_em', { ascending: false }),
    db.from('diag_municipios').select('ibge,nome'),
    db.from('diag_comunidades').select('id,nome'),
    db.from('diag_localidades').select('id,nome'),
  ])
  const erro = [fic, mun, com, loc].find(r => r.error)
  if (erro) { el.innerHTML = '<div class="card"><p style="color:var(--erro)">' + esc(erro.error.message) + '</p></div>'; return }
  dgVal.fichas = fic.data || []
  ;(mun.data || []).forEach(m => { dgVal.municipios[m.ibge] = m.nome })
  ;(com.data || []).forEach(c => { dgVal.comunidades[c.id] = c.nome })
  ;(loc.data || []).forEach(l => { dgVal.localidades[l.id] = l.nome })
  const ids = [...new Set(dgVal.fichas.map(f => f.entrevistador_id))]
  if (ids.length) {
    const { data } = await db.from('usuarios').select('id,nome_completo').in('id', ids)
    ;(data || []).forEach(u => { dgVal.usuarios[u.id] = u.nome_completo })
  }
  dgVal.carregado = true
  dgValDesenhar()
  dgExpHistorico()
}

function dgValComunidade(f) {
  const com = f.comunidade_nova ? f.comunidade_nova + ' (nova)' : (dgVal.comunidades[f.comunidade_id] || '—')
  const loc = f.localidade_nova || dgVal.localidades[f.localidade_id] || ''
  return { com, loc }
}
function dgValData(d) { return d ? new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—' }
function dgValDataHora(d) { return d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—' }

function dgValFiltradas() {
  const fl = dgVal.filtro
  const b = fl.busca.trim().toUpperCase()
  return dgVal.fichas.filter(f =>
    (fl.treino || !f.treino) &&
    (!fl.status || f.status === fl.status) &&
    (!fl.com || (f.comunidade_id || 'nova:' + f.comunidade_nova) === fl.com) &&
    (!fl.tec || f.entrevistador_id === fl.tec) &&
    (!fl.de || f.dt_entrevista >= fl.de) && (!fl.ate || f.dt_entrevista <= fl.ate) &&
    (!b || f.codigo.toUpperCase().includes(b)))
}

function dgValDesenhar() {
  const fl = dgVal.filtro
  const base = dgVal.fichas.filter(f => fl.treino || !f.treino)
  const conta = s => base.filter(f => !s || f.status === s).length
  const chips = [['enviada', 'Aguardando'], ['devolvida', 'Devolvidas'], ['validada', 'Validadas'], ['descartada', 'Descartadas'], ['', 'Todas']]
  const coms = {}
  dgVal.fichas.forEach(f => { const k = f.comunidade_id || 'nova:' + f.comunidade_nova; coms[k] = dgValComunidade(f).com })
  const tecs = {}
  dgVal.fichas.forEach(f => { tecs[f.entrevistador_id] = dgVal.usuarios[f.entrevistador_id] || '—' })
  const opts = (obj, sel) => Object.entries(obj).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('')
  const lista = dgValFiltradas()

  document.getElementById('dg-validacao').innerHTML = `<div class="card">
    <div class="dgv-chips">${chips.map(([s, r]) => `<button type="button" class="dgv-chip ${fl.status === s ? 'on' : ''}" onclick="dgValFiltro('status','${s}')">${r}<b>${conta(s)}</b></button>`).join('')}</div>
    <div class="dgv-filtros">
      <label>Comunidade<select onchange="dgValFiltro('com',this.value)"><option value="">Todas</option>${opts(coms, fl.com)}</select></label>
      <label>Técnico(a)<select onchange="dgValFiltro('tec',this.value)"><option value="">Todos</option>${opts(tecs, fl.tec)}</select></label>
      <label>Entrevista de<input type="date" value="${esc(fl.de)}" onchange="dgValFiltro('de',this.value)"></label>
      <label>até<input type="date" value="${esc(fl.ate)}" onchange="dgValFiltro('ate',this.value)"></label>
      <label>Código<input id="dgv-busca" placeholder="DSA-…" value="${esc(fl.busca)}" oninput="dgValFiltro('busca',this.value,true)"></label>
      <label class="dgv-check"><input type="checkbox" ${fl.treino ? 'checked' : ''} onchange="dgValFiltro('treino',this.checked)"> mostrar treino</label>
      <button type="button" class="btn btn-secondary btn-sm" onclick="dgValCarregar(true)">↻ Atualizar</button>
      <button type="button" class="btn btn-primary btn-sm" id="dgv-btn-exportar" onclick="dgExpAbrir()">⤓ Exportar planilha</button>
    </div>
    ${lista.length ? `<div style="overflow-x:auto"><table class="dgv-tab"><thead><tr><th>Código</th><th>Comunidade</th><th>Técnico(a)</th><th>Entrevista</th><th>Avisos</th><th>Situação</th></tr></thead><tbody>
      ${lista.map(f => {
        const { com, loc } = dgValComunidade(f)
        const n = (f.alertas || []).length
        return `<tr onclick="dgValAbrir('${f.id}')" tabindex="0" onkeydown="if(event.key==='Enter')dgValAbrir('${f.id}')">
          <td class="dgv-cod">${esc(f.codigo)}${f.treino ? '<span class="dgv-treino">treino</span>' : ''}</td>
          <td>${esc(com)}${f.aceitou_participar ? '' : ' · <i>recusa</i>'}${loc ? '<br><small>' + esc(loc) + '</small>' : ''}</td>
          <td>${esc(dgVal.usuarios[f.entrevistador_id] || '—')}</td>
          <td>${dgValData(f.dt_entrevista)}</td>
          <td><span class="dgv-al ${n ? '' : 'ok'}">${n ? '⚠ ' + n + ' aviso(s)' : '✓ sem avisos'}</span></td>
          <td><span class="dgv-st dgv-st-${f.status}">${DGV_CURTO[f.status]}</span></td></tr>`
      }).join('')}</tbody></table></div>`
      : '<p style="font-size:13px;color:var(--cinza-500);margin:12px 0 0">Nenhuma ficha com esses filtros.</p>'}
  </div><div id="dgv-exportacoes">${dgExp.histHtml || ''}</div>`
  if (fl._foco) { const i = document.getElementById('dgv-busca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length) }
}
function dgValFiltro(k, v, foco) { dgVal.filtro[k] = v; dgVal.filtro._foco = !!foco; dgValDesenhar() }

// ── Ficha aberta (painel lateral) ─────────────────────────────────────
async function dgValQuestionario(id) {
  if (!dgVal.questionarios[id]) {
    const { data } = await db.from('diag_questionarios').select('id,codigo,versao,estrutura').eq('id', id).single()
    dgVal.questionarios[id] = data
  }
  return dgVal.questionarios[id]
}

async function dgValAbrir(id) {
  const f = dgVal.fichas.find(x => x.id === id)
  if (!f) return
  dgVal.aberta = f
  let ov = document.getElementById('dgv-ov')
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'dgv-ov'; ov.className = 'dgv-ov'
    ov.addEventListener('click', ev => { if (ev.target === ov) dgValFechar() })
    document.body.appendChild(ov)   // fora do #app (z-index da sidebar)
  }
  ov.hidden = false
  ov.innerHTML = '<div class="dgv-gaveta"><div class="dgv-g-corpo"><p style="color:var(--cinza-500)">Abrindo ficha…</p></div></div>'
  const [q, fic, mor, ident, fotos, hist, auds] = await Promise.all([
    dgValQuestionario(f.questionario_id),
    db.from('diag_fichas').select('respostas').eq('id', id).single(),
    db.from('diag_moradores').select('id,ordem,idade,sexo_genero,sexo_genero_outro,parentesco,escolaridade,atividade_principal,e_entrevistado').eq('ficha_id', id).order('ordem'),
    db.from('diag_fichas_identificacao').select('entrevistado_nome,lat,lon,gps_precisao_m,obs_localizacao').eq('ficha_id', id).maybeSingle(),
    db.from('diag_fotos').select('id,tema,legenda,arquivo_url,lat,lon,gps_precisao_m,gps_origem').eq('ficha_id', id),
    db.from('diag_fichas_historico').select('status_de,status_para,motivo,por,em').eq('ficha_id', id).order('em'),
    // áudio = identificação: o RLS já esconde do consultor; a mesa só desenha para quem gere
    dgPodeGerir ? db.from('diag_audios').select('id,pergunta_chave,arquivo_url,mime,duracao_s,transcrito_por,transcrito_em,transcricao_origem').eq('ficha_id', id)
                : Promise.resolve({ data: [] }),
  ])
  if (dgVal.aberta !== f) return
  const moradores = mor.data || []
  let nomes = {}
  if (dgPodeGerir && moradores.length) {
    const { data } = await db.from('diag_moradores_identificacao').select('morador_id,nome').in('morador_id', moradores.map(m => m.id))
    ;(data || []).forEach(n => { nomes[n.morador_id] = n.nome })
  }
  const porIds = [...new Set((hist.data || []).map(h => h.por).concat((auds.data || []).map(a => a.transcrito_por))
    .filter(p => p && !dgVal.usuarios[p]))]
  if (porIds.length) {
    const { data } = await db.from('usuarios').select('id,nome_completo').in('id', porIds)
    ;(data || []).forEach(u => { dgVal.usuarios[u.id] = u.nome_completo })
  }
  dgValDesenharFicha(f, q, (fic.data || {}).respostas || {}, moradores, nomes, ident.data, fotos.data || [], hist.data || [], auds.data || [])
}

function dgValFechar() {
  dgVal.aberta = null
  const ov = document.getElementById('dgv-ov'); if (ov) { ov.hidden = true; ov.innerHTML = '' }
}

function dgValValor(p, resp) {
  const v = resp[p.chave]
  const outro = resp[p.chave + '_outro']
  const rot = x => { const o = (p.opcoes || []).find(o => o.v === x); return o ? o.r : x }
  if (v === '_nr') return { txt: 'Não respondeu', nr: true }
  if (p.tipo === 'unica') return { txt: rot(v) + (v === 'outro' && outro ? ': ' + outro : '') }
  if (p.tipo === 'multipla') return { txt: (v || []).map(x => rot(x) + (x === 'outro' && outro ? ': ' + outro : '')).join(' · ') }
  if (p.tipo === 'data') return { txt: dgValData(v) }
  if (p.tipo === 'decimal' || p.tipo === 'inteiro') return { txt: String(v).replace('.', ',') + (p.unidade ? ' ' + p.unidade : '') }
  return { txt: String(v) }
}

function dgValDesenharFicha(f, q, resp, moradores, nomes, ident, fotos, hist, audios) {
  const est = q ? q.estrutura : { blocos: [] }
  const alertas = f.alertas || []
  const chavesAlerta = new Set(alertas.map(a => a.chave).filter(Boolean))
  const { com, loc } = dgValComunidade(f)
  const tec = dgVal.usuarios[f.entrevistador_id] || '—'
  // áudios: quais perguntas têm gravação e quais ainda estão sem texto
  const textoDe = k => { const v = resp[k]; return typeof v === 'string' && v !== '_nr' ? v.trim() : '' }
  const chavesAudio = new Set((audios || []).map(a => a.pergunta_chave))
  const porChaveEst = typeof DiagRegras !== 'undefined' ? DiagRegras.porChave(est) : {}
  const audiosPend = (audios || []).filter(a => !textoDe(a.pergunta_chave))
  const rotPend = audiosPend.map(a => { const p = porChaveEst[a.pergunta_chave] || {}; return 'P' + (p.rotulo || p.n || '?') }).join(', ')

  // respostas por bloco: só o que foi respondido; em branco aparece se gerou aviso
  const blocos = (est.blocos || []).map((b, i) => {
    const linhas = (b.perguntas || []).map(p => {
      if (p.tipo === 'tabela') return dgValMoradores(est, moradores, nomes, p)
      if (typeof DiagRegras !== 'undefined' && DiagRegras.foraDeRespostas(p)) return ''
      const tem = Object.prototype.hasOwnProperty.call(resp, p.chave)
      if (chavesAudio.has(p.chave)) {
        const t = textoDe(p.chave)
        return `<div class="dgv-resp ${t ? '' : 'aviso'}"><span class="n">P${esc(String(p.rotulo || p.n))}</span><span><span class="q">${esc(p.texto)}</span><br>` +
          (t ? `<span class="v">${esc(t)}</span> <a href="#" class="dgv-gravada" onclick="dgValIrAudio('${esc(p.chave)}');return false">gravada · ouvir</a>`
             : `<a href="#" class="dgv-gravada pend" onclick="dgValIrAudio('${esc(p.chave)}');return false">Gravada em áudio — transcrever</a>`) +
          `</span></div>`
      }
      if (!tem && !chavesAlerta.has(p.chave)) return ''
      const val = tem ? dgValValor(p, resp) : { txt: 'Em branco', nr: true }
      const destaque = val.nr || chavesAlerta.has(p.chave)
      return `<div class="dgv-resp ${destaque ? 'aviso' : ''}"><span class="n">P${esc(String(p.rotulo || p.n))}</span><span><span class="q">${esc(p.texto)}</span><br><span class="v">${esc(val.txt)}</span></span></div>`
    }).join('')
    return linhas ? `<div class="dgv-bloco"><h3>${i + 1} · ${esc(b.titulo)}</h3>${linhas}</div>` : ''
  }).join('')

  const acoes = !dgPodeGerir ? '' : {
    enviada: `${audiosPend.length ? `<p class="dgv-info dgv-val-bloq">Transcreva ${esc(rotPend)} antes de validar.</p>` : ''}
              <button type="button" class="btn btn-primary" id="dgv-btn-validar" onclick="dgValAcao('validada')"${audiosPend.length ? ' disabled title="Transcreva as respostas gravadas antes de validar"' : ''}>✓ Validar</button>
              <button type="button" class="btn btn-secondary dgv-dev" onclick="dgValMotivo('devolvida')">↩ Devolver ao técnico</button>
              <button type="button" class="btn btn-secondary dgv-desc" onclick="dgValMotivo('descartada')">Descartar</button>`,
    devolvida: `<p class="dgv-info">Com o técnico para correção${f.motivo_devolucao ? ': “' + esc(f.motivo_devolucao) + '”' : ''}.</p>
              <button type="button" class="btn btn-secondary dgv-desc" onclick="dgValMotivo('descartada')">Descartar</button>`,
    validada: `<p class="dgv-info">Validada em ${dgValDataHora(f.validado_em)}.</p>
              <button type="button" class="btn btn-secondary dgv-dev" onclick="dgValMotivo('devolvida', true)">Reabrir (devolver ao técnico)</button>`,
    descartada: '<p class="dgv-info">Ficha descartada — não entra em indicadores.</p>',
  }[f.status]

  document.getElementById('dgv-ov').innerHTML = `<div class="dgv-gaveta" role="dialog" aria-modal="true" aria-label="Ficha ${esc(f.codigo)}">
    <div class="dgv-g-topo"><div style="flex:1;min-width:0">
      <h2><span class="dgv-cod">${esc(f.codigo)}</span> <span class="dgv-st dgv-st-${f.status}">${DGV_ROTULO[f.status]}</span>${f.treino ? '<span class="dgv-treino">treino</span>' : ''}</h2>
      <p>${esc(com)}${loc ? ' · ' + esc(loc) : ''} · ${esc(dgVal.municipios[f.municipio_ibge] || '')} · entrevista ${dgValData(f.dt_entrevista)} · ${esc(tec)} · ${q ? esc(q.codigo + ' v' + q.versao) : ''}</p></div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="dgValFechar()" aria-label="Fechar">✕</button></div>
    <div class="dgv-g-corpo">
      ${!f.aceitou_participar ? '<div class="dgv-avisos"><b>Recusa</b> — a família não aceitou participar. Só comunidade, data e entrevistador foram registrados.</div>' : ''}
      ${dgPodeGerir && audiosPend.length ? `<div class="dgv-audio-barra">${audiosPend.length} resposta(s) gravada(s) para transcrever (${esc(rotPend)})
        <button type="button" class="btn btn-secondary btn-sm" onclick="dgValIrAudio()">Ir para os áudios</button></div>` : ''}
      ${dgValAvisos(alertas, est)}
      ${dgPodeGerir ? `<div class="dgv-ident"><small>IDENTIFICAÇÃO · só coordenação e super_admin</small><br>${ident
        ? 'Entrevistado(a): <b>' + esc(ident.entrevistado_nome || 'não informado') + '</b>' +
          (ident.lat != null ? ' · GPS ' + String(ident.lat).replace('.', ',') + ', ' + String(ident.lon).replace('.', ',') + (ident.gps_precisao_m ? ' (± ' + Math.round(ident.gps_precisao_m) + ' m)' : '') : ' · sem GPS') +
          (ident.obs_localizacao ? '<br>' + esc(ident.obs_localizacao) : '')
        : 'Sem nome e sem GPS registrados.'}</div>` : ''}
      ${blocos || '<p style="color:var(--cinza-500);font-size:13px">Sem respostas.</p>'}
      ${dgValAudios(f, est, resp, audios || [])}
      ${dgPodeGerir ? `<div class="dgv-bloco"><h3>Fotos (${fotos.length}${f.fotos_registradas != null ? ' de ' + f.fotos_registradas + ' registrada' + (f.fotos_registradas === 1 ? '' : 's') : ''})</h3>
        ${f.fotos_autorizadas === false ? '<p class="dgv-nota dgv-fotos-nao">A família <b>não autorizou</b> fotos.</p>' : f.fotos_autorizadas === true ? '<p class="dgv-nota">Fotos autorizadas pela família.</p>' : ''}
        ${f.fotos_registradas != null && fotos.length < f.fotos_registradas ? `<div class="dgv-avisos dgv-fotos-faltam">⚠ O técnico registrou <b>${f.fotos_registradas}</b> foto${f.fotos_registradas === 1 ? '' : 's'}; chegaram <b>${fotos.length}</b>.
          As demais ainda estão no celular (sobem na próxima sincronização) ou se perderam no aparelho.</div>` : ''}
        ${fotos.length ? `<div class="dgv-fotos">${fotos.map(ft =>
          `<figure class="dgv-foto"><img data-arquivo-src="${esc(ft.arquivo_url)}" alt="Foto: ${esc(ft.tema)}"><figcaption>${esc(ft.tema)}${ft.legenda ? ' · ' + esc(ft.legenda) : ''}${ft.lat != null ? ' · GPS ' + (ft.gps_origem === 'ficha' ? 'da ficha' : '±' + Math.round(ft.gps_precisao_m || 0) + ' m') : ' · sem GPS'}</figcaption>
           <button type="button" onclick="dgValApagarFoto('${ft.id}')">Apagar</button></figure>`).join('')}</div>
         <p class="dgv-nota">Foto com pessoa: apague antes de validar (RIPD). A exclusão fica registrada.</p>` : '<p class="dgv-nota">Nenhuma foto.</p>'}</div>` : ''}
      <div class="dgv-bloco"><h3>Histórico</h3><ul class="dgv-hist">${hist.map(h =>
        `<li>${dgValDataHora(h.em)} — ${esc(h.status_de ? DGV_CURTO[h.status_de] + ' → ' + DGV_CURTO[h.status_para] : 'enviada')}${h.por ? ' por ' + esc(dgVal.usuarios[h.por] || '—') : ''}${h.motivo ? ': “' + esc(h.motivo) + '”' : ''}</li>`).join('') || '<li>—</li>'}</ul></div>
    </div>
    ${acoes ? `<div class="dgv-g-acoes" id="dgv-acoes">${acoes}</div>` : ''}
  </div>`
  if (typeof assinarImagens === 'function') assinarImagens(document.getElementById('dgv-ov'))
  // áudio de bucket privado: só com URL assinada (nunca a URL gravada direto)
  document.querySelectorAll('#dgv-ov audio[data-arquivo-audio]').forEach(async el => {
    try { const u = await urlAssinada(el.dataset.arquivoAudio); if (u) el.src = u } catch (e) { /* segue sem tocar */ }
  })
}

// ── Áudios (v5): ouvir e transcrever. A transcrição É a resposta de texto;
// validar só com tudo transcrito (o banco confere — trigger trg_diag_valida_audios).
function dgValAudios(f, est, resp, audios) {
  if (!dgPodeGerir || !audios.length) return ''
  const porChave = typeof DiagRegras !== 'undefined' ? DiagRegras.porChave(est) : {}
  const texto = k => { const v = resp[k]; return typeof v === 'string' && v !== '_nr' ? v : '' }
  const pend = audios.filter(a => !texto(a.pergunta_chave).trim()).length
  const editavel = f.status === 'enviada' || f.status === 'devolvida'
  const max = est.texto_max_len || 2000
  const dur = s => s ? Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0') : ''
  const ia = editavel && typeof DiagTranscricaoIA !== 'undefined' && DiagTranscricaoIA.ativa()
  return `<div class="dgv-bloco" id="dgv-audios"><h3>Áudios (${audios.length})</h3>
    ${ia && pend ? `<div class="dgv-ia-barra"><span>Rascunho automático com IA que roda <b>neste computador</b> (a voz não sai daqui). Confira ouvindo antes de salvar.</span>
      ${pend > 1 ? `<button type="button" class="btn btn-secondary btn-sm" id="dgv-ia-todas" onclick="dgValSugerirTodas()">Sugerir todas (${pend})</button>` : ''}</div>` : ''}
    ${pend ? `<div class="dgv-avisos dgv-audio-pend">⚠ ${pend} resposta(s) gravada(s) sem transcrição. A validação pede a transcrição antes (os números só leem texto).</div>` : ''}
    ${audios.sort((a, b) => ((porChave[a.pergunta_chave] || {}).n || 0) - ((porChave[b.pergunta_chave] || {}).n || 0)).map(a => {
      const p = porChave[a.pergunta_chave] || { texto: a.pergunta_chave }
      const t = texto(a.pergunta_chave)
      return `<div class="dgv-audio" data-chave="${esc(a.pergunta_chave)}">
        <div class="dgv-audio-q">${p.n || p.rotulo ? 'P' + esc(String(p.rotulo || p.n)) + ' · ' : ''}${esc(p.texto)}</div>
        <div class="dgv-audio-player"><audio controls preload="none" id="dgv-au-${a.id}" data-arquivo-audio="${esc(a.arquivo_url)}"></audio><small>${dur(a.duracao_s)}</small></div>
        <div class="dgv-audio-ctl" role="group" aria-label="Controles de transcrição">
          <button type="button" class="dgv-ctl" onclick="dgValAudioVoltar('${a.id}')" title="Voltar 5 segundos">↺ 5 s</button>
          <span class="dgv-vel">${[0.75, 1, 1.25].map(v => `<button type="button" class="dgv-ctl${v === 1 ? ' on' : ''}" data-vel="${v}" onclick="dgValAudioVel('${a.id}', ${v}, this)">${String(v).replace('.', ',')}×</button>`).join('')}</span>
          <span class="dgv-nota">Ctrl+Espaço no texto: tocar/pausar</span>
        </div>
        <textarea id="dgv-tr-${a.id}" data-audio="${a.id}" rows="3" maxlength="${max}" placeholder="Escreva o que a pessoa disse"${editavel ? '' : ' disabled'}>${esc(t)}</textarea>
        ${editavel ? `<div class="dgv-audio-acoes">
          ${ia ? `<button type="button" class="btn btn-secondary btn-sm dgv-ia-btn" data-audio="${a.id}" onclick="dgValSugerir('${a.id}')">Sugerir transcrição (IA local)</button>
                  <span class="dgv-ia-status" id="dgv-ia-${a.id}" role="status"></span>` : ''}
          <button type="button" class="btn btn-primary btn-sm" onclick="dgValTranscrever('${a.id}')">Salvar transcrição</button></div>` : ''}
        ${a.transcrito_em ? `<p class="dgv-nota">✓ Transcrito por ${esc(dgVal.usuarios[a.transcrito_por] || '—')} · ${dgValDataHora(a.transcrito_em)}${a.transcricao_origem === 'ia_local' ? ' · sugestão da IA local, conferida' : ''}</p>`
          : t.trim() ? '<p class="dgv-nota">Transcrito pelo técnico no app.</p>' : ''}
      </div>`
    }).join('')}
    <p class="dgv-nota">Consultor externo não ouve os áudios. Áudio nunca sai na exportação.</p></div>`
}

// ── Controles de transcrição ──
function dgValIrAudio(chave) {
  const alvo = chave ? document.querySelector('#dgv-audios .dgv-audio[data-chave="' + CSS.escape(chave) + '"]') : document.getElementById('dgv-audios')
  if (!alvo) return
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const card = chave ? alvo : alvo.querySelector('.dgv-audio')
  const ta = card && card.querySelector('textarea:not([disabled])')
  if (ta) setTimeout(() => ta.focus({ preventScroll: true }), 350)
}
function dgValAudioVoltar(id) {
  const au = document.getElementById('dgv-au-' + id); if (!au) return
  au.currentTime = Math.max(0, (au.currentTime || 0) - 5)
}
function dgValAudioVel(id, v, btn) {
  const au = document.getElementById('dgv-au-' + id); if (!au) return
  au.playbackRate = v
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn))
}
// Ctrl+Espaço no campo de transcrição toca/pausa o áudio da mesma pergunta, sem tirar o cursor
document.addEventListener('keydown', ev => {
  const ta = ev.target
  if (!(ev.ctrlKey && (ev.code === 'Space' || ev.key === ' ')) || !ta || !ta.dataset || !ta.dataset.audio) return
  const au = document.getElementById('dgv-au-' + ta.dataset.audio); if (!au) return
  ev.preventDefault()
  if (au.paused) au.play().catch(() => {}); else au.pause()
})

// ── Sugestão por IA local (js/diagnostico-transcricao-ia.js) ──
// Preenche o campo como RASCUNHO; nada é salvo sem o clique da pessoa.
let dgValIaOcupada = false
async function dgValSugerir(audioId) {
  const el = document.getElementById('dgv-tr-' + audioId)
  const st = document.getElementById('dgv-ia-' + audioId)
  const au = document.getElementById('dgv-au-' + audioId)
  if (!el || !au || dgValIaOcupada) return false
  if (el.value.trim() && !confirm('O campo já tem texto. Substituir pela sugestão da IA?')) return false
  dgValIaOcupada = true
  document.querySelectorAll('.dgv-ia-btn, #dgv-ia-todas').forEach(b => { b.disabled = true })
  const fases = { decodificando: 'Preparando o áudio…', transcrevendo: 'Transcrevendo neste computador…' }
  try {
    const r = await DiagTranscricaoIA.transcrever(au.dataset.arquivoAudio, ev => {
      if (!st) return
      if (ev.fase === 'baixando') {
        const p = ev.p || {}
        if (p.status === 'progress' && p.total) st.textContent = 'Baixando o modelo (só na 1ª vez): ' + Math.round((p.loaded / p.total) * 100) + '% de ' + String(p.file || '').split('/').pop()
        else if (p.status === 'ready') st.textContent = 'Modelo pronto.'
      } else st.textContent = fases[ev.fase] || ''
    })
    if (!r.texto) { if (st) st.textContent = 'A IA não reconheceu fala neste áudio. Transcreva à mão.'; return false }
    el.value = r.texto
    el.dataset.ia = '1'; el.dataset.modelo = r.modelo || ''
    el.classList.add('dgv-ia')
    if (st) st.textContent = 'Rascunho da IA — ouça e corrija antes de salvar.'
    return true
  } catch (e) {
    console.warn('[transcrição IA]', e)
    if (st) st.textContent = 'Não foi possível sugerir (' + String(e.message || e).slice(0, 120) + '). Transcreva à mão.'
    return false
  } finally {
    dgValIaOcupada = false
    document.querySelectorAll('.dgv-ia-btn, #dgv-ia-todas').forEach(b => { b.disabled = false })
  }
}
async function dgValSugerirTodas() {
  const ids = [...document.querySelectorAll('#dgv-audios textarea[data-audio]')].filter(t => !t.value.trim()).map(t => t.dataset.audio)
  for (const id of ids) await dgValSugerir(id)
}

async function dgValTranscrever(audioId) {
  const f = dgVal.aberta
  const el = document.getElementById('dgv-tr-' + audioId)
  const txt = (el && el.value || '').trim()
  if (!txt) { toast('Escreva a transcrição.', 'warning'); return }
  const deIA = el.dataset.ia === '1'
  const { error } = await db.rpc('diag_transcrever_audio', { p_audio_id: audioId, p_texto: txt,
    p_origem: deIA ? 'ia_local' : 'manual', p_modelo: deIA ? (el.dataset.modelo || null) : null })
  if (error) { toast(error.message.replace(/^diag:[a-z_]+:\s*/, ''), 'error'); return }
  const { data } = await db.from('diag_fichas').select('alertas').eq('id', f.id).single()
  if (data) f.alertas = data.alertas
  toast('Transcrição salva.', 'success')
  dgValAbrir(f.id)
}

// "Em branco" vira UMA linha recolhível (numa ficha incompleta seriam dezenas);
// os demais avisos (valor fora do esperado, divergência, especifique…) ficam à vista.
function dgValAvisos(alertas, est) {
  if (!alertas.length) return ''
  const desc = a => typeof DiagRegras !== 'undefined' ? DiagRegras.descreverAlerta(a, est) : a.tipo
  const brancos = alertas.filter(a => a.tipo === 'pendente')
  const outros = alertas.filter(a => a.tipo !== 'pendente')
  return `<div class="dgv-avisos"><b>⚠ ${alertas.length} aviso(s) da revisão</b><ul>
    ${outros.map(a => '<li>' + esc(desc(a)) + '</li>').join('')}
    ${brancos.length ? `<li><details><summary>${brancos.length} pergunta(s) em branco: ${esc(brancos.map(a => { const p = a.chave && typeof DiagRegras !== 'undefined' && DiagRegras.porChave(est)[a.chave]; return 'P' + (p && p.rotulo ? p.rotulo : a.n != null ? a.n : '?') }).join(', '))}</summary>
      <ul>${brancos.map(a => '<li>' + esc(desc(a)) + '</li>').join('')}</ul></details></li>` : ''}</ul></div>`
}

function dgValMoradores(est, moradores, nomes, p) {
  const cols = (est.moradores && est.moradores.colunas) || []
  const rot = (chave, v) => { const c = cols.find(x => x.chave === chave); const o = c && (c.opcoes || []).find(o => o.v === v); return o ? o.r : (v || '') }
  const mostrarNome = dgPodeGerir && cols.some(c => c.chave === 'nome')   // v7: lista sem nome
  return `<div class="dgv-resp"><span class="n">P${esc(String(p.rotulo || p.n))}</span><span><span class="q">${esc(p.texto)} (${moradores.length})</span>
    ${moradores.length ? `<table class="dgv-mor"><tr><th>#</th>${mostrarNome ? '<th>Nome</th>' : ''}<th>Idade</th><th>Sexo/gênero</th><th>Parentesco</th><th>Escolaridade</th><th>Atividade</th></tr>
    ${moradores.map(m => `<tr><td>${m.ordem}${m.e_entrevistado ? '*' : ''}</td>${mostrarNome ? '<td>' + esc(nomes[m.id] || '') + '</td>' : ''}
      <td>${m.idade ?? ''}</td><td>${esc(rot('sexo_genero', m.sexo_genero) + (m.sexo_genero_outro ? ': ' + m.sexo_genero_outro : ''))}</td>
      <td>${esc(m.parentesco || '')}</td><td>${esc(rot('escolaridade', m.escolaridade))}</td><td>${esc(m.atividade_principal || '')}</td></tr>`).join('')}</table>
      <small class="dgv-nota">* entrevistado(a)</small>` : '<br><span class="v">Ninguém listado</span>'}</span></div>`
}

// ── Ações (sempre pela RPC diag_mudar_status) ─────────────────────────
function dgValMotivo(status, reabrir) {
  const titulo = reabrir ? 'Reabrir e devolver ao técnico' : status === 'devolvida' ? 'Devolver ao técnico' : 'Descartar a ficha'
  const dica = status === 'devolvida' ? 'O técnico vê este motivo no app ao sincronizar. Diga o que corrigir.' : 'A ficha sai dos indicadores. Diga o porquê (fica no histórico).'
  document.getElementById('dgv-acoes').innerHTML = `<div class="dgv-motivo">
    <label><b>${titulo}</b><br><span class="dgv-nota">${dica}</span>
    <textarea id="dgv-motivo" rows="3" maxlength="1000" placeholder="Motivo (obrigatório)"></textarea></label>
    <div style="display:flex;gap:8px"><button type="button" class="btn btn-secondary" onclick="dgValAbrir('${dgVal.aberta.id}')">Cancelar</button>
    <button type="button" class="btn ${status === 'descartada' ? 'btn-danger' : 'btn-primary'}" onclick="dgValAcao('${status}')">Confirmar</button></div></div>`
  document.getElementById('dgv-motivo').focus()
}

async function dgValAcao(status) {
  const f = dgVal.aberta
  if (!f) return
  let motivo = null
  if (status !== 'validada') {
    motivo = (document.getElementById('dgv-motivo') || {}).value || ''
    if (motivo.trim().length < 3) { toast('Informe o motivo.', 'warning'); return }
  } else if ((f.alertas || []).length && !confirm('Esta ficha tem ' + f.alertas.length + ' aviso(s). Validar assim mesmo?')) return
  const { data, error } = await db.rpc('diag_mudar_status', { p_ficha_id: f.id, p_status: status, p_motivo: motivo })
  if (error) { toast(error.message.replace(/^diag:[a-z_]+:\s*/, ''), 'error'); return }
  Object.assign(f, { status: data.status, motivo_devolucao: data.motivo_devolucao, validado_em: data.validado_em })
  toast({ validada: 'Ficha validada.', devolvida: 'Ficha devolvida ao técnico.', descartada: 'Ficha descartada.' }[status], 'success')
  dgValAbrir(f.id)
  dgValDesenhar()
}

async function dgValApagarFoto(id) {
  if (!confirm('Apagar esta foto? Use para foto que mostre pessoa. A exclusão fica registrada e não dá para desfazer.')) return
  const { error } = await db.from('diag_fotos').delete().eq('id', id)
  if (error) { toast(error.message, 'error'); return }
  toast('Foto apagada.', 'success')
  dgValAbrir(dgVal.aberta.id)
}

document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && dgVal.aberta) dgValFechar() })
