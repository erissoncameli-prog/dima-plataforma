// enviar-email-tarefa — notifica responsáveis/observadores/criador internos e,
// opcionalmente, o fornecedor vinculado (parte externa). Reaproveita o wrapper
// visual de enviar-email-viagem. verify_jwt = true (chamada pelo frontend após a RPC).
// Eventos: atribuicao | prazo_alterado | concluida | comentario | subtarefa |
//          reuniao_atualizada | cancelada | revisao | devolvida | reaberta.
// Fluxo de conclusão: "revisao" pede aprovação ao criador; "devolvida" e
// "reaberta" avisam os responsáveis; "concluida" vai a todos os envolvidos.
// Nesses eventos, comentario_id aponta a nota/motivo (e os anexos ligados a ela).
// Tarefa do tipo "reuniao" leva convite de agenda (.ics, METHOD REQUEST/CANCEL)
// com UID fixo por tarefa e SEQUENCE = tarefas.ics_sequencia.
// "subtarefa" avisa o responsável da subtarefa; se for fornecedor, envia os
// anexos da subtarefa e Reply-To com o token da subtarefa (resposta → comentário).
// "edital" (com rodada_id, sem tarefa_id): aviso do edital publicado de uma rodada de licitação a
// responsável/substituto da atividade, coordenação e super_admin (fn_lic_destinatarios) e, a quem é
// responsável, a tarefa "Contatar as empresas da lista curta" com as subtarefas. Só envia o que o banco
// acabou de registrar (notificado_em < 15 min, ainda sem e-mail; tarefa de contato ainda sem e-mail).
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'
import { logosEmail } from '../_shared/logos-email.ts'
import { emailDeTexto } from '../_shared/email-modelo.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const REMETENTE = '"Projeto DIMA – UNESCO/SEMA-AC" <fundobrasilonuacre@gmail.com>'
const SITE_URL  = 'https://fundobrasilonu-plataforma.vercel.app'

const PRIORIDADE_LABEL: Record<string, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
}
const fmtData = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function wrapHtml(corpo: string, linkBtn: { url: string; label: string } | undefined, logos: any, assunto = '', extra: any = {}): string {
  return emailDeTexto(corpo, { logos, assunto, botao: linkBtn, sobre: 'Painel de Tarefas', motivo: 'Você recebe este e-mail porque participa de uma tarefa no Painel do Projeto DIMA.', ...extra })
}

// caminho no bucket a partir da URL "portadora" (/object/public/tarefas-anexos/<path>)
const pathAnexo = (url: string) => {
  const rel = (url || '').split('/tarefas-anexos/')[1]
  return rel ? decodeURIComponent(rel.split('?')[0]) : null
}
const LIMITE_ANEXOS = 15 * 1024 * 1024 // Gmail aceita 25 MB; margem p/ base64

// ── Campos do tipo e convite de agenda ─────────────────────────────────
// Datas/horas de reunião são gravadas em hora local do Acre ('YYYY-MM-DDTHH:mm'),
// que é UTC-5 fixo (sem horário de verão).
const ACRE_UTC_OFFSET_H = 5
const fmtDataHora = (v: string) => {
  const [d, h] = String(v).split('T'); const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}${h ? ' ' + h.slice(0, 5) : ''}`
}
function valorCampo (c: any, v: any): string {
  if (v === undefined || v === null || v === '') return ''
  if (c.tipo === 'datetime') return fmtDataHora(v)
  if (c.tipo === 'date') return fmtData(v)
  if (c.tipo === 'boolean') return v === true || v === 'true' ? 'Sim' : 'Não'
  if (c.tipo === 'url') return `<a href="${esc(v)}" style="color:#059669">${esc(v)}</a>`
  return esc(v)
}
function linhasTipo (tipo: any, dados: any): string {
  const campos: any[] = tipo?.campos || []
  return campos.map(c => {
    const v = valorCampo(c, dados?.[c.chave]); if (!v) return ''
    const rot = String(c.rotulo || c.chave).toUpperCase().replace(/[^A-ZÇÁÉÍÓÚÃÕÂÊÔÀ\s]/g, '').slice(0, 22)
    return `${rot}: ${c.tipo === 'textarea' ? v.replace(/\n/g, '<br>') : v}\n`
  }).join('')
}
function localParaUtc (local: string, somaMin = 0): Date {
  const [d, h] = local.split('T'); const [Y, M, D] = d.split('-').map(Number)
  const [hh, mm] = (h || '00:00').split(':').map(Number)
  return new Date(Date.UTC(Y, M - 1, D, hh + ACRE_UTC_OFFSET_H, mm + somaMin))
}
const icsData = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsTxt = (s: unknown) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
// RFC 5545: linhas com mais de 75 octetos são dobradas (CRLF + espaço)
function dobrar (linha: string): string {
  const enc = new TextEncoder()
  if (enc.encode(linha).length <= 75) return linha
  const partes: string[] = []; let cur = '', n = 0
  for (const ch of linha) {
    const b = enc.encode(ch).length
    if (n + b > (partes.length ? 74 : 75)) { partes.push(cur); cur = ''; n = 0 }
    cur += ch; n += b
  }
  partes.push(cur)
  return partes.join('\r\n ')
}
function montarIcs (metodo: 'REQUEST' | 'CANCEL', t: any, participantes: { email: string; nome: string }[]): string {
  const d = t.dados_tipo || {}
  const ini = localParaUtc(d.inicio)
  const fim = d.fim && d.fim > d.inicio ? localParaUtc(d.fim) : localParaUtc(d.inicio, 60)
  const link = d.link || ''
  const desc = [d.pauta ? 'Pauta:\n' + d.pauta : '', link ? 'Link: ' + link : '',
    `Painel: ${SITE_URL}/pages/tarefas.html?tarefa=${t.id}`].filter(Boolean).join('\n\n')
  const linhas = [
    'BEGIN:VCALENDAR', 'PRODID:-//Projeto DIMA//Painel de Tarefas//PT', 'VERSION:2.0', 'CALSCALE:GREGORIAN',
    `METHOD:${metodo}`, 'BEGIN:VEVENT',
    `UID:${t.id}@dima-plataforma`, `SEQUENCE:${t.ics_sequencia || 0}`,
    `DTSTAMP:${icsData(new Date())}`, `DTSTART:${icsData(ini)}`, `DTEND:${icsData(fim)}`,
    `SUMMARY:${icsTxt(t.titulo)}`,
    (d.local || link) ? `LOCATION:${icsTxt(d.local || link)}` : '',
    `DESCRIPTION:${icsTxt(desc)}`,
    link ? `URL:${icsTxt(link)}` : '',
    'ORGANIZER;CN="Projeto DIMA":mailto:fundobrasilonuacre@gmail.com',
    ...participantes.map(p => `ATTENDEE;CN="${String(p.nome || p.email).replace(/"/g, '')}";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${p.email}`),
    `STATUS:${metodo === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean)
  return linhas.map(dobrar).join('\r\n') + '\r\n'
}

// ── evento 'edital': aviso do edital publicado + tarefa de contato da lista curta ──────────
const fmtDataHoraTz = (v: string | null) => v
  ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : ''
// deno-lint-ignore no-explicit-any
async function enviarEdital (req: Request, rodadaId: string): Promise<any> {
  if (!rodadaId) throw new Error('rodada_id obrigatório')
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  })
  const { data: r } = await supabase.from('tdr_licitacao_rodadas')
    .select('id,tdr_id,rodada,modalidade,numero_processo,dt_abertura,prazo_em,prazo_original,edital_url,situacao,' +
            'notificado_em,email_edital_em,tarefa_contato_id,email_contato_em')
    .eq('id', rodadaId).maybeSingle()
  if (!r) throw new Error('rodada não encontrada')
  // só quem opera a licitação dispara o e-mail
  const { data: pode } = await userClient.rpc('fn_lic_pode', { p_tdr: r.tdr_id })
  if (pode !== true) throw new Error('sem acesso a esta licitação')
  const { data: { user } } = await userClient.auth.getUser()
  const autor = user?.id || null

  const recente = !!r.notificado_em && Date.now() - new Date(r.notificado_em).getTime() < 15 * 60_000
  const mandaEdital = recente && (!r.email_edital_em || new Date(r.email_edital_em) < new Date(r.notificado_em))
  const mandaTarefa = !!r.tarefa_contato_id && !r.email_contato_em
  if (!mandaEdital && !mandaTarefa) return { ok: true, enviados: 0, aviso: 'nada novo para enviar' }

  const { data: t } = await supabase.from('tdrs')
    .select('id,numero,objeto_pt,atividade:atividades(codigo,nome_pt)').eq('id', r.tdr_id).single()
  // destinatários: e-mail → { nome, edital, tarefa }
  const rec = new Map<string, { nome: string; edital: boolean; tarefa: boolean }>()
  const add = (u: any, campo: 'edital' | 'tarefa') => {
    if (!u?.email || u.id === autor) return
    const x = rec.get(u.email) || { nome: u.nome_completo || '', edital: false, tarefa: false }
    x[campo] = true; rec.set(u.email, x)
  }
  if (mandaEdital) {
    const { data: ids } = await supabase.rpc('fn_lic_destinatarios', { p_rodada: r.id })
    if (Array.isArray(ids) && ids.length) {
      const { data: us } = await supabase.from('usuarios').select('id,nome_completo,email').in('id', ids).eq('ativo', true)
      ;(us || []).forEach((u: any) => add(u, 'edital'))
    }
  }
  let tar: any = null, subs: any[] = []
  if (mandaTarefa) {
    const { data } = await supabase.from('tarefas').select('id,codigo,titulo,dt_prazo').eq('id', r.tarefa_contato_id).maybeSingle()
    tar = data
    const { data: sb } = await supabase.from('tarefa_checklist').select('descricao').eq('tarefa_id', r.tarefa_contato_id).order('ordem')
    subs = sb || []
    const { data: parts } = await supabase.from('tarefa_participantes')
      .select('papel, usuario:usuarios(id,nome_completo,email)').eq('tarefa_id', r.tarefa_contato_id).eq('papel', 'responsavel')
    ;(parts || []).forEach((p: any) => add(p.usuario, 'tarefa'))
  }

  const prorrogado = r.prazo_original && r.prazo_em && r.prazo_original !== r.prazo_em
  const fichaEdital =
    `TDR: ${esc(t?.numero)}\n` +
    `OBJETO: ${esc(t?.objeto_pt || '—')}\n` +
    (t?.atividade ? `ATIVIDADE: ${esc(t.atividade.codigo)} — ${esc(t.atividade.nome_pt || '')}\n` : '') +
    `MODALIDADE: ${esc(r.modalidade)}${r.numero_processo ? ' · processo ' + esc(r.numero_processo) : ''} · ${r.rodada}ª rodada\n` +
    `ABERTURA: ${r.dt_abertura ? fmtData(r.dt_abertura) : 'não informada'}\n` +
    `ENCERRAMENTO: ${r.prazo_em ? fmtDataHoraTz(r.prazo_em) + (prorrogado ? ' (prorrogado; era ' + fmtDataHoraTz(r.prazo_original) + ')' : '') : 'não informado'}\n` +
    `EDITAL: ${r.edital_url && /^https?:\/\//i.test(r.edital_url) ? `<a href="${esc(r.edital_url)}" style="color:#1F6F45">${esc(r.edital_url)}</a>` : 'link não informado'}\n`
  const blocoTarefa = tar
    ? `\nFoi criada para você a tarefa <b>${esc(tar.codigo)} — ${esc(tar.titulo)}</b>, com prazo em ${fmtData(tar.dt_prazo)}. ` +
      `Há uma subtarefa por empresa da lista curta; ao falar com cada uma, marque a subtarefa e registre o contato como comentário.\n` +
      subs.map((x: any) => `• ${esc(x.descricao)}`).join('\n') + '\n'
    : ''
  const logos = await logosEmail(supabase)
  const linkTdr = `${SITE_URL}/pages/tdrs.html?tdr=${r.tdr_id}`
  const envios: any[] = []
  for (const [email, x] of rec) {
    const comTarefa = x.tarefa && !!tar
    const assunto = x.edital ? `Edital publicado — TDR ${t?.numero}` : `Nova tarefa ${tar?.codigo}: ${tar?.titulo}`
    const abertura = x.edital
      ? 'Uma licitação do Projeto DIMA está com o edital em andamento. Acompanhe os dados abaixo.'
      : 'Uma tarefa de licitação foi atribuída a você no painel do Projeto DIMA.'
    const corpo = `Olá, ${esc((x.nome || '').split(' ')[0])}.\n\n${abertura}\n\n${fichaEdital}${comTarefa ? blocoTarefa : ''}`
    envios.push({
      to: email, assunto,
      html: emailDeTexto(corpo, {
        logos, assunto, sobre: `Licitação · TDR ${t?.numero || ''}`,
        botao: comTarefa ? { url: `${SITE_URL}/pages/tarefas.html?tarefa=${tar.id}`, label: 'Abrir a tarefa' } : { url: linkTdr, label: 'Abrir o TDR' },
        destaques: [
          { rotulo: 'Encerramento', valor: r.prazo_em ? fmtDataHoraTz(r.prazo_em) : 'não informado' },
          { rotulo: 'Modalidade', valor: r.modalidade },
        ],
        motivo: x.edital
          ? 'Você recebe este e-mail por ser responsável/substituto da atividade, da coordenação ou super_admin.'
          : 'Você recebe este e-mail porque é responsável por uma tarefa no Painel do Projeto DIMA.',
      }),
      replyTo: comTarefa ? `fundobrasilonuacre+${tar.id}@gmail.com` : undefined,
    })
  }
  // marca o que já saiu (mesmo sem destinatário com e-mail, para não repetir)
  const marca: Record<string, string> = {}
  if (mandaEdital) marca.email_edital_em = new Date().toISOString()
  if (mandaTarefa) marca.email_contato_em = new Date().toISOString()
  await supabase.from('tdr_licitacao_rodadas').update(marca).eq('id', r.id)
  if (!envios.length) return { ok: true, enviados: 0, aviso: 'nenhum destinatário com e-mail' }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: 'fundobrasilonuacre@gmail.com', pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
  })
  const results = await Promise.allSettled(envios.map(e => transporter.sendMail({
    from: REMETENTE, to: e.to, subject: e.assunto, html: e.html, replyTo: e.replyTo,
  })))
  const enviados = results.filter(x => x.status === 'fulfilled').length
  results.forEach(x => { if (x.status === 'rejected') console.error('sendMail edital:', (x.reason as Error)?.message) })
  return { ok: enviados > 0, enviados, falhas: results.length - enviados }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const {
      tarefa_id, evento = 'atribuicao', autor_id = null,
      destinatarios = null,   // uuid[] opcional: restringe os destinatários internos
      checklist_id = null,    // evento 'subtarefa'
      comentario_id = null,   // evento 'comentario'
      rodada_id = null,       // evento 'edital'
    } = await req.json()
    if (evento === 'edital') {
      return new Response(JSON.stringify(await enviarEdital(req, rodada_id)), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    if (!tarefa_id) throw new Error('tarefa_id obrigatório')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // O chamador precisa enxergar a tarefa (e editá-la, para disparar e-mail de
    // subtarefa — que pode levar anexos a um fornecedor externo).
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    })
    const { data: pode } = await userClient.rpc(
      evento === 'subtarefa' ? 'fn_tarefa_pode_editar' : 'fn_pode_ver_tarefa', { p_id: tarefa_id })
    if (pode !== true) throw new Error('sem acesso a esta tarefa')

    const { data: t, error: eT } = await supabase
      .from('tarefas')
      .select('id,codigo,titulo,descricao,status,prioridade,dt_prazo,criado_por,fornecedor_id,notificar_fornecedor,' +
              'tipo,dados_tipo,ics_sequencia,tipo_info:tarefa_tipos(nome,icone,campos),' +
              'fornecedor:fornecedores(nome,email,responsavel_nome),' +
              'criador:usuarios(nome_completo,email)')
      .eq('id', tarefa_id).single()
    if (eT || !t) throw new Error('tarefa não encontrada')

    const { data: parts } = await supabase
      .from('tarefa_participantes')
      .select('papel, usuario_id, usuario:usuarios(nome_completo,email)')
      .eq('tarefa_id', tarefa_id)
    const responsaveis = (parts || []).filter((p: any) => p.papel === 'responsavel')
    const observadores = (parts || []).filter((p: any) => p.papel === 'observador')

    // Reunião com data: leva convite de agenda. Nesse caso quem originou a ação
    // também recebe (precisa do evento na própria agenda).
    const reuniao = t.tipo === 'reuniao' && !!t.dados_tipo?.inicio
    if ((evento === 'reuniao_atualizada' || evento === 'cancelada') && !reuniao) {
      return new Response(JSON.stringify({ ok: true, enviados: 0, aviso: 'não é reunião' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // destinatários internos (dedup por e-mail, excluindo quem originou a ação)
    const filtro: string[] | null = Array.isArray(destinatarios) ? destinatarios : null
    const rec = new Map<string, { nome: string; papel: string }>()
    const add = (id: string | null, email?: string, nome?: string, papel = '') => {
      if (!email || (id === autor_id && !reuniao)) return
      if (filtro && (!id || !filtro.includes(id))) return
      if (!rec.has(email)) rec.set(email, { nome: nome || '', papel })
    }
    const addP = (p: any) => add(p.usuario_id, p.usuario?.email, p.usuario?.nome_completo, p.papel)

    // subtarefa (evento 'subtarefa')
    let sub: any = null
    if (evento === 'subtarefa') {
      if (!checklist_id) throw new Error('checklist_id obrigatório')
      const { data } = await supabase.from('tarefa_checklist')
        .select('id,tarefa_id,descricao,dt_prazo,concluida,responsavel_usuario_id,responsavel_fornecedor_id,' +
                'usuario:usuarios!tarefa_checklist_responsavel_usuario_id_fkey(nome_completo,email),' +
                'fornecedor:fornecedores!tarefa_checklist_responsavel_fornecedor_id_fkey(nome,email,responsavel_nome)')
        .eq('id', checklist_id).maybeSingle()
      if (!data || data.tarefa_id !== tarefa_id) throw new Error('subtarefa não encontrada')
      sub = data
    }

    if (evento === 'concluida') {
      add(t.criado_por, t.criador?.email, t.criador?.nome_completo)
      responsaveis.forEach(addP)
      observadores.forEach(addP)
    } else if (evento === 'revisao') {
      // criador aprova; observadores só acompanham (avisados do envio para revisão)
      add(t.criado_por, t.criador?.email, t.criador?.nome_completo)
      observadores.forEach(addP)
    } else if (evento === 'devolvida' || evento === 'reaberta') {
      responsaveis.forEach(addP)
    } else if (evento === 'comentario') {
      // mesma regra do sino (fn_tarefa_alvo_comentario): criador + responsáveis com a tarefa
      // nas mãos + responsável de subtarefa pendente. Observador não recebe comentário.
      const { data: alvo } = await supabase.rpc('fn_tarefa_alvo_comentario', { p_tarefa_id: tarefa_id, p_checklist_id: null })
      const ids = new Set<string>(alvo || [])
      if (ids.has(t.criado_por)) add(t.criado_por, t.criador?.email, t.criador?.nome_completo)
      for (const p of (parts || []) as any[]) {
        if (!ids.has(p.usuario_id)) continue
        add(p.usuario_id, p.usuario?.email, p.usuario?.nome_completo, p.papel === 'responsavel' ? 'responsavel' : 'subtarefa')
      }
    } else if (evento === 'prazo_alterado') {
      responsaveis.forEach(addP)  // observador só é avisado do início, da revisão e da conclusão
    } else if (evento === 'reuniao_atualizada' || evento === 'cancelada') {
      add(t.criado_por, t.criador?.email, t.criador?.nome_completo)
      responsaveis.forEach(addP)
      observadores.forEach(addP)
    } else if (evento === 'subtarefa') {
      if (sub.responsavel_usuario_id) {
        const p = (parts || []).find((x: any) => x.usuario_id === sub.responsavel_usuario_id)
        add(sub.responsavel_usuario_id, sub.usuario?.email, sub.usuario?.nome_completo, p?.papel === 'responsavel' ? 'responsavel' : 'subtarefa')
      }
    } else {
      // atribuicao: responsáveis e observadores (texto próprio para cada papel)
      responsaveis.forEach(addP)
      observadores.forEach(addP)
    }

    const prazoTxt = fmtData(t.dt_prazo)
    const prioTxt  = PRIORIDADE_LABEL[t.prioridade] || t.prioridade
    const linkApp  = { url: `${SITE_URL}/pages/tarefas.html?tarefa=${t.id}`, label: 'Abrir no painel' }

    // comentário (o indicado, ou o último) + nomes dos anexos ligados a ele
    let comentTxt = '', comentAnexos: string[] = []
    if (evento === 'comentario' || (comentario_id && ['revisao', 'devolvida', 'reaberta', 'concluida'].includes(evento))) {
      let q = supabase.from('tarefa_comentarios').select('id,corpo').eq('tarefa_id', tarefa_id)
      q = comentario_id ? q.eq('id', comentario_id) : q.order('criado_em', { ascending: false }).limit(1)
      const { data: c } = await q.maybeSingle()
      comentTxt = c?.corpo || ''
      if (c?.id) {
        const { data: ax } = await supabase.from('tarefa_anexos').select('arquivo_nome').eq('comentario_id', c.id)
        comentAnexos = (ax || []).map((a: any) => a.arquivo_nome)
      }
    }

    const assunto: Record<string, string> = {
      atribuicao:     `Nova tarefa ${t.codigo}: ${t.titulo}`,
      prazo_alterado: `Prazo alterado — ${t.codigo}: ${t.titulo}`,
      concluida:      `Tarefa concluída — ${t.codigo}: ${t.titulo}`,
      comentario:     `Novo comentário — ${t.codigo}: ${t.titulo}`,
      subtarefa:      `Subtarefa atribuída — ${t.codigo}: ${t.titulo}`,
      revisao:        `Aguardando sua aprovação — ${t.codigo}: ${t.titulo}`,
      devolvida:      `Entrega devolvida — ${t.codigo}: ${t.titulo}`,
      reaberta:       `Tarefa reaberta — ${t.codigo}: ${t.titulo}`,
    }
    if (reuniao) {
      const quando = fmtDataHora(t.dados_tipo.inicio)
      assunto.atribuicao = `📅 Convite: ${t.titulo} — ${quando}`
      assunto.reuniao_atualizada = `📅 Reunião atualizada: ${t.titulo} — ${quando}`
      assunto.cancelada = `❌ Reunião cancelada: ${t.titulo} — ${quando}`
    } else if (t.tipo_info && t.tipo !== 'outras') {
      assunto.atribuicao = `${t.tipo_info.icone} ${t.tipo_info.nome} — ${t.codigo}: ${t.titulo}`
    }
    const abertura = (papel: string): string => {
      if (reuniao && evento === 'atribuicao')
        return 'Você foi convidado(a) para uma reunião registrada no painel do Projeto DIMA. ' +
               'O convite de agenda segue anexo — use <b>Sim / Não / Talvez</b> no seu e-mail ou agenda para responder.'
      if (evento === 'reuniao_atualizada')
        return 'Os dados de uma reunião da qual você participa foram alterados. O convite na sua agenda será atualizado.'
      if (evento === 'cancelada')
        return 'A reunião abaixo foi <b>cancelada</b>. O evento será removido da sua agenda.'
      if (evento === 'atribuicao' && papel === 'observador')
        return 'Você foi incluído(a) como <b>observador(a)</b> de uma tarefa no painel do Projeto DIMA. ' +
               'Você será avisado(a) só quando a tarefa for enviada para revisão e quando for concluída.'
      if (evento === 'revisao' && papel === 'observador')
        return 'Uma tarefa que você acompanha foi <b>entregue para revisão</b> e aguarda a aprovação de quem a criou.'
      if (evento === 'subtarefa')
        return 'Uma subtarefa foi atribuída a você no painel do Projeto DIMA. ' +
               '<b>Para responder, basta responder a este e-mail</b> (com anexos, se quiser) — a resposta fica registrada na subtarefa. ' +
               'No painel, você também pode concluir a subtarefa e anexar arquivos.'
      if (evento === 'comentario' && papel === 'subtarefa')
        return 'Há um novo comentário na tarefa em que você tem uma subtarefa pendente.'
      return ({
        atribuicao:     'Uma tarefa foi atribuída a você no painel do Projeto DIMA.',
        prazo_alterado: 'O prazo de uma tarefa que você acompanha mudou.',
        concluida:      'Uma tarefa que você acompanha foi concluída.',
        revisao:        'Uma tarefa que você criou foi <b>entregue para revisão</b>. Confira a entrega, os comentários e os anexos no painel e <b>aprove</b> ou <b>devolva</b>.',
        devolvida:      'A entrega de uma tarefa sob sua responsabilidade foi <b>devolvida</b> por quem a criou. Veja o motivo abaixo.',
        reaberta:       'Uma tarefa sob sua responsabilidade foi <b>reaberta</b> por quem a criou. Veja o motivo abaixo.',
        comentario:     'Há um novo comentário em uma tarefa que você acompanha.',
      } as Record<string, string>)[evento] || 'Atualização em uma tarefa do painel do Projeto DIMA.'
    }

    const AVISO_OBS = '<b>Você é observador(a): só acompanha. Não precisa fazer nada nem responder a este e-mail.</b>'
    const PAPEL_TXT: Record<string, string> = { observador: 'Observador(a) — nada a fazer', responsavel: 'Responsável', subtarefa: 'Responsável pela subtarefa' }
    const corpoInterno = (papel: string) =>
      (papel === 'observador' ? `${AVISO_OBS}\n\n` : '') +
      `${abertura(papel)}\n\n` +
      `TAREFA: ${esc(t.codigo)} — ${esc(t.titulo)}\n` +
      (t.tipo_info && t.tipo !== 'outras' ? `TIPO: ${esc(t.tipo_info.icone)} ${esc(t.tipo_info.nome)}\n` : '') +
      linhasTipo(t.tipo_info, t.dados_tipo) +
      (sub ? `SUBTAREFA: ${esc(sub.descricao)}\n` : '') +
      (sub ? `PRAZO: ${fmtData(sub.dt_prazo)}\n` : '') +
      (!sub && t.descricao ? `DESCRIÇÃO: ${esc(t.descricao)}\n` : '') +
      `PRIORIDADE: ${esc(prioTxt)}\n` +
      (t.criador?.nome_completo ? `CRIADA POR: ${esc(t.criador.nome_completo)}\n` : '') +
      (sub ? `PRAZO DA TAREFA: ${prazoTxt}\n` : reuniao ? '' : `PRAZO: ${prazoTxt}\n`) +
      (papel ? `SEU PAPEL: ${PAPEL_TXT[papel] || 'Responsável'}\n` : '') +
      (comentTxt ? `${evento === 'comentario' ? 'COMENTÁRIO' : evento === 'revisao' ? 'ENTREGA' : evento === 'concluida' ? 'NOTA' : 'MOTIVO'}: ${esc(comentTxt.replace(/^(Entrega para revisão|Entrega aprovada|Conclusão|Devolvida|Reaberta):\s*/, ''))}\n` : '') +
      (comentAnexos.length ? `ANEXOS: ${comentAnexos.map(esc).join(', ')}\n` : '') +
      (t.fornecedor ? `FORNECEDOR: ${esc(t.fornecedor.nome)}\n` : '')

    const logos = await logosEmail(supabase)
    // linha de destaque do e-mail: código, prazo, quem criou (prioridade alta/urgente em laranja)
    const destaquesTarefa = {
      sobre: `Painel de Tarefas${t.codigo ? ' · ' + t.codigo : ''}`,
      destaques: [
        { rotulo: 'Prazo', valor: sub ? fmtData(sub.dt_prazo) : reuniao ? '' : prazoTxt },
        { rotulo: 'Criada por', valor: (t.criador?.nome_completo || '').split(' ').slice(0, 2).join(' ') },
        { rotulo: 'Prioridade', valor: prioTxt, cor: ['alta', 'urgente'].includes(t.prioridade) ? '#C25E00' : undefined },
      ],
    }
    const envios: any[] = []
    // Reply-To com token da tarefa: a resposta do e-mail vira comentário
    // (recebido por receber-email-tarefa).
    const replyTo = `fundobrasilonuacre+${t.id}@gmail.com`
    // convite: todos os envolvidos como convidados, mesmo quem não recebe este e-mail
    let ics: any = null
    if (reuniao && ['atribuicao', 'reuniao_atualizada', 'cancelada'].includes(evento)) {
      const conv = new Map<string, string>()
      if (t.criador?.email) conv.set(t.criador.email, t.criador.nome_completo || '')
      for (const p of (parts || []) as any[]) if (p.usuario?.email) conv.set(p.usuario.email, p.usuario.nome_completo || '')
      const metodo = evento === 'cancelada' ? 'CANCEL' : 'REQUEST'
      ics = { method: metodo, filename: metodo === 'CANCEL' ? 'cancelamento.ics' : 'convite.ics',
              content: montarIcs(metodo, t, [...conv].map(([email, nome]) => ({ email, nome }))) }
    }
    for (const [email, r] of rec) {
      envios.push({
        to: email,
        assunto: assunto[evento] || assunto.atribuicao,
        html: wrapHtml(`Olá, ${esc((r.nome || '').split(' ')[0])}.\n\n${corpoInterno(r.papel)}`, linkApp, logos, assunto[evento] || assunto.atribuicao, destaquesTarefa),
        // resposta de quem tem a subtarefa fica ligada à subtarefa (com os anexos)
        replyTo: evento === 'subtarefa' && sub ? `fundobrasilonuacre+${sub.id}@gmail.com` : replyTo,
        icalEvent: ics || undefined,
      })
    }

    // fornecedor da tarefa (parte externa) — só em atribuição / prazo, sem link de login
    if ((evento === 'atribuicao' || evento === 'prazo_alterado') && !filtro &&
        t.notificar_fornecedor && t.fornecedor?.email) {
      const saud = t.fornecedor.responsavel_nome
        ? `Prezado(a) ${esc(t.fornecedor.responsavel_nome)}`
        : `Prezados(as), ${esc(t.fornecedor.nome)}`
      const corpoExt =
        `${saud},\n\n` +
        `Registramos no Projeto DIMA uma pendência sob sua responsabilidade:\n\n` +
        `ITEM: ${esc(t.titulo)}\n` +
        (t.descricao ? `DETALHE: ${esc(t.descricao)}\n` : '') +
        `PRAZO: ${prazoTxt}\n\n` +
        `<b>Para responder, basta responder a este e-mail.</b> Sua mensagem e os arquivos que anexar ` +
        `serão registrados automaticamente junto a esta pendência.`
      envios.push({
        to: t.fornecedor.email,
        assunto: `Projeto DIMA — pendência: ${t.titulo}`,
        html: wrapHtml(corpoExt, undefined, logos, `Pendência: ${t.titulo}`, { sobre: 'Projeto DIMA', motivo: 'Para responder, basta responder a este e-mail.' }),
        replyTo,  // token da tarefa: a resposta do fornecedor vira comentário (receber-email-tarefa)
      })
    }

    // fornecedor responsável pela subtarefa — recebe a subtarefa com os anexos
    // e responde por e-mail (Reply-To com o token da subtarefa → comentário).
    if (evento === 'subtarefa' && sub.responsavel_fornecedor_id && sub.fornecedor?.email) {
      const f = sub.fornecedor
      const { data: axs } = await supabase.from('tarefa_anexos')
        .select('arquivo_url,arquivo_nome,mime,tamanho').eq('checklist_id', sub.id).order('criado_em')
      const attachments: any[] = [], soNome: string[] = []
      let total = 0
      for (const a of axs || []) {
        const p = pathAnexo(a.arquivo_url)
        if (!p || total + (a.tamanho || 0) > LIMITE_ANEXOS) { soNome.push(a.arquivo_nome); continue }
        const dl = await supabase.storage.from('tarefas-anexos').download(p)
        if (dl.error || !dl.data) { soNome.push(a.arquivo_nome); continue }
        const bytes = new Uint8Array(await dl.data.arrayBuffer())
        if (total + bytes.length > LIMITE_ANEXOS) { soNome.push(a.arquivo_nome); continue }
        total += bytes.length
        attachments.push({ filename: a.arquivo_nome, content: bytes, contentType: a.mime || undefined })
      }
      const saud = f.responsavel_nome ? `Prezado(a) ${esc(f.responsavel_nome)}` : `Prezados(as), ${esc(f.nome)}`
      const corpoExt =
        `${saud},\n\n` +
        `A equipe do Projeto DIMA registrou uma atividade sob sua responsabilidade:\n\n` +
        `ATIVIDADE: ${esc(sub.descricao)}\n` +
        `REFERENTE A: ${esc(t.titulo)}\n` +
        `PRAZO: ${fmtData(sub.dt_prazo)}\n` +
        (attachments.length ? `ANEXOS: ${attachments.map(a => esc(a.filename)).join(', ')}\n` : '') +
        (soNome.length ? `NÃO ANEXADOS: ${soNome.map(esc).join(', ')} (grandes demais; solicite à equipe)\n` : '') +
        `\n<b>Para responder, basta responder a este e-mail.</b> Sua mensagem e os arquivos que anexar ` +
        `serão registrados automaticamente junto a esta atividade.`
      envios.push({
        to: f.email,
        assunto: `Projeto DIMA — ${sub.descricao.slice(0, 80)}`,
        html: wrapHtml(corpoExt, undefined, logos, sub.descricao.slice(0, 80), { sobre: 'Projeto DIMA', motivo: 'Para responder, basta responder a este e-mail.' }),
        replyTo: `fundobrasilonuacre+${sub.id}@gmail.com`,
        attachments,
      })
    }

    if (!envios.length) {
      return new Response(JSON.stringify({ ok: true, enviados: 0, falhas: 0, aviso: 'nenhum destinatário com e-mail' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: 'fundobrasilonuacre@gmail.com', pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
    })

    const results = await Promise.allSettled(
      envios.map(e => transporter.sendMail({
        from: REMETENTE, to: e.to, subject: e.assunto, html: e.html, replyTo: e.replyTo,
        attachments: e.attachments, icalEvent: e.icalEvent,
      })),
    )
    const enviados = results.filter(r => r.status === 'fulfilled').length
    const falhas   = results.length - enviados
    results.forEach(r => { if (r.status === 'rejected') console.error('sendMail:', (r.reason as Error)?.message) })

    return new Response(JSON.stringify({ ok: enviados > 0, enviados, falhas }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
