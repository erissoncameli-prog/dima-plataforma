// conferir-nota-tecnica — lê a nota técnica (PDF do SEI) de uma entrega de produto e diz se ela
// vale para aprovar. Sem IA e sem serviço pago: o texto sai do próprio PDF (unpdf/pdf.js).
//
// { acao: 'conferir', entrega_id, caminho, arquivo_nome, sha256 }   (JWT do usuário)
//   · só quem pode avaliar o contrato (fn_pode_avaliar_contrato) — mesmo critério de aprovar;
//   · `caminho` = arquivo já enviado ao bucket privado entregas-docs, em produtos/<produto_id>/…;
//   · grava o resultado em nota_tecnica_conferencias (service_role) e devolve as regras,
//     cada uma com o que corrigir. A aprovação no banco (trg_entrega_exige_nota) só passa
//     com a conferência aprovada do mesmo arquivo.
//
// { acao: 'calibrar', chave, limite?, gravar? }   (chamada pelo banco com chave de uso único)
//   · confere as notas das entregas já aprovadas, sem mudar nada nelas (origem 'calibracao');
//     serve para ajustar as regras e para a regra de nota repetida enxergar o passado.
//
// { acao: 'modelo', entrega_id }   (JWT) — modelo da nota no padrão das notas aprovadas, já preenchido
//   com contrato/produto/fornecedor: { blocos, texto, docx_base64, nome_arquivo } (modelo.ts).
//
// { acao: 'confirmar_aprovacao', entrega_id, tipo_decisao, senha }   (JWT)
//   reconfirma a SENHA DE LOGIN no servidor (mesmo bloqueio do remanejamento: 5 erros em 30 min)
//   e grava em entrega_aprovacao_senhas a confirmação de uso único (10 min) que a trava de aprovação
//   (trg_entrega_exige_nota) consome. A senha nunca é gravada nem logada.
//
// O conteúdo da nota nunca sai daqui: só o resultado das regras e os dados de identificação
// (nº da nota, nº SEI, códigos, signatários, data) são gravados.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import { gerarDocx, montarBlocos, textoPlano } from './modelo.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'entregas-docs'
const MAX_BYTES = 15 * 1024 * 1024
const MAX_PAGINAS = 60
const DIAS_MAX = 60

const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── texto ───────────────────────────────────────────────────────────────
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s: string) => semAcento(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const soDigitos = (s: string) => String(s || '').replace(/\D/g, '')
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'mei'])
const brData = (d: string) => { const [a, m, dd] = d.split('-'); return `${dd}/${m}/${a}` }

async function sha256Hex(buf: Uint8Array) {
  const h = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}

type Regra = { id: string; ok: boolean; titulo: string; detalhe?: string; corrigir?: string }
type Contexto = {
  entregaId: string; contratoNumero: string; produtoNumero: number | null; produtoDescricao: string
  fornecedor: string; pessoasAceitas: { id: string; nome: string }[]; dataRef: string // yyyy-mm-dd
}

// Extrai e confere. `bytes` = arquivo inteiro.
async function conferir(admin: any, bytes: Uint8Array, ctx: Contexto, sha: string) {
  const regras: Regra[] = []
  const add = (r: Regra) => { regras.push(r); return r.ok }
  const info: Record<string, unknown> = {}

  const ehPdf = bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
  if (!add({ id: 'pdf', ok: ehPdf, titulo: 'Arquivo em PDF',
    corrigir: 'O arquivo não é um PDF. No SEI, abra a nota técnica e use "Gerar arquivo PDF do documento".' })) {
    return { regras, info, texto: '' }
  }

  let texto = '', paginas = 0
  try {
    const pdf = await getDocumentProxy(bytes.slice())
    paginas = pdf.numPages
    const r = await extractText(pdf, { mergePages: true })
    texto = String(r.text || '')
  } catch (e) {
    add({ id: 'texto', ok: false, titulo: 'Texto legível', detalhe: 'O PDF não abriu: ' + (e as Error).message,
      corrigir: 'O PDF está danificado ou protegido por senha. Gere de novo o PDF da nota no SEI.' })
    return { regras, info, texto: '' }
  }
  info.paginas = paginas
  const plano = texto.replace(/\s+/g, ' ')
  const n = norm(plano)
  if (!add({ id: 'texto', ok: n.length >= 300 && paginas <= MAX_PAGINAS, titulo: 'Texto legível',
    detalhe: paginas > MAX_PAGINAS ? `${paginas} páginas` : `${n.length} caracteres de texto`,
    corrigir: paginas > MAX_PAGINAS
      ? 'O arquivo tem páginas demais para ser só a nota técnica. Anexe apenas a nota.'
      : 'O PDF não tem texto (parece digitalizado ou é imagem). Gere o PDF direto do SEI, sem imprimir e escanear.' })) {
    return { regras, info, texto: plano }
  }

  // título e número da nota
  // o parecer técnico do SEI cumpre o mesmo papel da nota técnica e é aceito
  const mNt = plano.match(/(nota\s+t[ée]cnica|parecer(?:\s+t[ée]cnico)?)\s*(?:n[º°o.]*|n[úu]mero)?\s*:?\s*(\d{1,5}(?:\s*[\/.-]\s*\d{2,4})?)/i)
  const tipoDoc = mNt ? (/^nota/i.test(mNt[1]) ? 'Nota Técnica' : 'Parecer') : null
  info.nt_numero = mNt ? `${tipoDoc} ${mNt[2].replace(/\s+/g, '')}` : null
  add({ id: 'titulo', ok: /\b(nota tecnica|parecer)\b/.test(n.slice(0, 900)), titulo: 'É uma nota técnica (ou parecer técnico)',
    detalhe: mNt ? `${tipoDoc} nº ${mNt[2].replace(/\s+/g, '')}` : undefined,
    corrigir: 'Não encontrei o título "Nota Técnica" (ou "Parecer") no início do documento. Confira se anexou a nota técnica e não outro documento (despacho, ofício, relatório do consultor).' })

  // assinaturas eletrônicas do SEI
  const sigs: { nome: string; cargo: string; data: string }[] = []
  const reSig = /documento assinado eletronicamente por\s+(.+?),\s*(.+?),\s*em\s+(\d{2})\/(\d{2})\/(\d{4})/gi
  for (const m of plano.matchAll(reSig)) {
    sigs.push({ nome: m[1].trim(), cargo: m[2].trim().slice(0, 160), data: `${m[5]}-${m[4]}-${m[3]}` })
  }
  info.signatarios = sigs
  add({ id: 'assinatura', ok: sigs.length > 0, titulo: 'Assinatura eletrônica do SEI',
    detalhe: sigs.length ? sigs.map(s => `${s.nome} em ${brData(s.data)}`).join('; ') : undefined,
    corrigir: 'A nota não tem o bloco "Documento assinado eletronicamente por …". Assine a nota no SEI e só depois gere o PDF.' })

  // códigos de autenticidade
  const mCv = plano.match(/c[óo]digo\s+verificador\s*:?\s*(\d{5,12})/i)
  const mCrc = plano.match(/c[óo]digo\s+CRC\s*:?\s*([0-9A-F]{8})/i)
  const mSei = plano.match(/SEI\s*n[º°o.]*\s*:?\s*(\d{7,12})/i)
  info.codigo_verificador = mCv?.[1] || null
  info.codigo_crc = mCrc?.[1]?.toUpperCase() || null
  info.sei_documento = mSei?.[1] || info.codigo_verificador || null
  add({ id: 'codigos', ok: !!(mCv && mCrc), titulo: 'Código verificador e CRC do SEI',
    detalhe: mCv && mCrc ? `verificador ${mCv[1]} · CRC ${mCrc[1].toUpperCase()}` : undefined,
    corrigir: 'Não encontrei o "código verificador" e o "código CRC" que o SEI coloca no rodapé. Gere o PDF da nota pelo SEI depois de assinada.' })

  // contrato
  const dig = plano.replace(/(\d)[\s.\/-]+(?=\d)/g, '$1')
  const numC = soDigitos(ctx.contratoNumero)
  add({ id: 'contrato', ok: numC.length >= 3 && dig.includes(numC), titulo: 'Cita o contrato',
    detalhe: `Contrato ${ctx.contratoNumero}`,
    corrigir: `A nota não cita o contrato nº ${ctx.contratoNumero}. Inclua o número do contrato no texto da nota.` })

  // nota já usada em outro produto
  const chaves = [sha, info.codigo_verificador].filter(Boolean)
  let dup: any = null
  if (chaves.length) {
    const { data } = await admin.from('nota_tecnica_conferencias')
      .select('entrega_id, origem, aprovada, sha256, codigo_verificador')
      .neq('entrega_id', ctx.entregaId)
      .or(`sha256.eq.${sha}` + (info.codigo_verificador ? `,codigo_verificador.eq.${info.codigo_verificador}` : ''))
      .limit(20)
    dup = (data || []).find((c: any) => c.aprovada || c.origem === 'calibracao') || null
  }
  let dupTxt = ''
  if (dup) {
    const { data: e } = await admin.from('contratos_produtos_entregas')
      .select('numero_entrega, produto:contratos_produtos(numero_produto, descricao), contrato:contratos(numero)')
      .eq('id', dup.entrega_id).maybeSingle()
    dupTxt = e ? `produto ${e.produto?.numero_produto ?? '?'} do contrato ${e.contrato?.numero ?? '?'}` : 'outro produto'
  }
  add({ id: 'repetida', ok: !dup, titulo: 'Nota exclusiva deste produto',
    detalhe: dup ? `Já usada no ${dupTxt}` : undefined,
    corrigir: dup ? `Esta nota (mesmo arquivo ou mesmo documento SEI) já foi usada para aprovar o ${dupTxt}. Cada produto precisa da sua própria nota técnica.` : undefined })

  // produto
  let okProd = false
  if (ctx.produtoNumero != null) {
    const re = new RegExp(`produto\\s*(?:n\\s*[o.]?\\s*)?0*${ctx.produtoNumero}\\b`)
    okProd = re.test(n)
  }
  const descN = norm(ctx.produtoDescricao).replace(/^produto\s*\d+\s*/, '').trim()
  if (!okProd && descN.length >= 15) okProd = n.includes(descN.slice(0, 40))
  add({ id: 'produto', ok: okProd, titulo: 'Identifica o produto',
    detalhe: ctx.produtoNumero != null ? `Produto ${ctx.produtoNumero}` : undefined,
    corrigir: `A nota não identifica o produto${ctx.produtoNumero != null ? ` ${ctx.produtoNumero}` : ''} ("${ctx.produtoDescricao.slice(0, 80)}"). Escreva "Produto ${ctx.produtoNumero ?? 'N'}" no texto da nota.` })

  // fornecedor
  const toks = norm(ctx.fornecedor).split(' ').filter(t => t.length >= 2 && !PARTICULAS.has(t))
  let okForn = false
  if (toks.length) {
    const prim = toks[0], ult = toks[toks.length - 1]
    const temTok = (t: string) => new RegExp(`\\b${t}\\b`).test(n)
    okForn = toks.length === 1 ? temTok(prim) : (temTok(prim) && temTok(ult))
  }
  add({ id: 'fornecedor', ok: okForn, titulo: 'Cita o fornecedor',
    detalhe: ctx.fornecedor,
    corrigir: `A nota não cita o fornecedor/consultor "${ctx.fornecedor}". Inclua o nome completo no texto da nota.` })

  // data
  const datas = sigs.map(s => s.data).sort()
  const ultima = datas[datas.length - 1] || null
  info.data_assinatura = ultima
  let okData = false, detData = ''
  if (ultima) {
    const dias = Math.round((Date.parse(ctx.dataRef) - Date.parse(ultima)) / 864e5)
    okData = dias >= -1 && dias <= DIAS_MAX
    detData = `assinada em ${brData(ultima)} (${dias < 0 ? 'depois da data da aprovação' : dias + ' dias antes da aprovação'})`
  }
  add({ id: 'data', ok: okData, titulo: `Assinada há no máximo ${DIAS_MAX} dias`,
    detalhe: detData || undefined,
    corrigir: ultima
      ? `A nota foi assinada em ${brData(ultima)}; para aprovar agora ela precisa ter sido assinada nos últimos ${DIAS_MAX} dias. Emita uma nota atualizada no SEI.`
      : 'Não encontrei a data da assinatura eletrônica da nota.' })

  // quem assinou
  const nomesAceitos = ctx.pessoasAceitas.map(p => ({ ...p, n: norm(p.nome) }))
  const casa = (nomeSig: string) => {
    const s = norm(nomeSig)
    return nomesAceitos.find(p => {
      if (p.n === s) return true
      const a = p.n.split(' '), b = s.split(' ')
      return a[0] === b[0] && a[a.length - 1] === b[b.length - 1]
    })
  }
  const quem = sigs.map(s => casa(s.nome)).find(Boolean)
  add({ id: 'signatario', ok: !!quem, titulo: 'Assinada pelo responsável da atividade',
    detalhe: quem ? quem.nome : (sigs.length ? `assinada por ${sigs.map(s => s.nome).join(', ')}` : undefined),
    corrigir: `A nota precisa da assinatura do responsável ou substituto da atividade, ou de quem está aprovando (${ctx.pessoasAceitas.map(p => p.nome).join(', ') || 'ninguém cadastrado'}). Peça a assinatura no SEI e gere o PDF de novo.` })

  return { regras, info, texto: plano }
}

// ── contexto da entrega ─────────────────────────────────────────────────
async function contexto(admin: any, entregaId: string, aprovadorId: string | null, dataRef: string): Promise<Contexto | null> {
  const { data: e } = await admin.from('contratos_produtos_entregas')
    .select('id, produto_id, despachado_por, produto:contratos_produtos(id, numero_produto, descricao), contrato:contratos(id, numero, atividade_id, fornecedor:fornecedores(nome))')
    .eq('id', entregaId).maybeSingle()
  if (!e || !e.contrato) return null
  const ids = new Set<string>()
  if (aprovadorId) ids.add(aprovadorId)
  if (e.contrato.atividade_id) {
    const { data: rs } = await admin.from('atividade_responsaveis')
      .select('usuario_id').eq('atividade_id', e.contrato.atividade_id).eq('ativo', true)
    for (const r of rs || []) ids.add(r.usuario_id)
  }
  const { data: us } = ids.size
    ? await admin.from('usuarios').select('id, nome_completo').in('id', [...ids])
    : { data: [] }
  return {
    entregaId,
    contratoNumero: e.contrato.numero || '',
    produtoNumero: e.produto?.numero_produto ?? null,
    produtoDescricao: e.produto?.descricao || '',
    fornecedor: e.contrato.fornecedor?.nome || '',
    pessoasAceitas: (us || []).map((u: any) => ({ id: u.id, nome: u.nome_completo })),
    dataRef,
  }
}

async function gravar(admin: any, ctx: Contexto, caminho: string, nome: string | null, sha: string, tam: number,
                      r: Awaited<ReturnType<typeof conferir>>, origem: string, usuario: string | null) {
  const aprovada = r.regras.every(x => x.ok)
  const linha = {
    entrega_id: ctx.entregaId, caminho, arquivo_nome: nome, sha256: sha, tamanho: tam,
    paginas: (r.info.paginas as number) ?? null, origem, aprovada, regras: r.regras,
    nt_numero: r.info.nt_numero ?? null, sei_documento: r.info.sei_documento ?? null,
    codigo_verificador: r.info.codigo_verificador ?? null, codigo_crc: r.info.codigo_crc ?? null,
    signatarios: r.info.signatarios ?? [], data_assinatura: r.info.data_assinatura ?? null,
    conferido_por: usuario,
  }
  const { data, error } = await admin.from('nota_tecnica_conferencias').insert(linha).select('id').single()
  if (error) throw new Error(error.message)
  return { id: data.id, aprovada }
}

const hojeAcre = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  let corpo: any = {}
  try { corpo = await req.json() } catch { /* vazio */ }

  // ── calibração em lote (banco, chave de uso único) ──
  if (corpo.acao === 'calibrar') {
    const { data: k } = await admin.from('nota_tecnica_calibracao_chaves')
      .select('chave, usada_em').eq('chave', String(corpo.chave || '')).maybeSingle()
    if (!k || k.usada_em) return resp({ ok: false, erro: 'chave inválida' }, 403)
    await admin.from('nota_tecnica_calibracao_chaves').update({ usada_em: new Date().toISOString() }).eq('chave', k.chave)

    const { data: ents } = await admin.from('contratos_produtos_entregas')
      .select('id, nota_tecnica_url, nota_tecnica_nome, despacho_data, despachado_por')
      .eq('situacao', 'aprovada').not('nota_tecnica_url', 'is', null)
      .order('despachado_em', { ascending: true }).limit(Number(corpo.limite) || 200)
    const saida: any[] = []
    for (const e of ents || []) {
      // notas antigas ficaram em tdrs-arquivos; a calibração lê as duas pastas
      const mB = String(e.nota_tecnica_url).match(/\/object\/(?:public|sign)\/(entregas-docs|tdrs-arquivos)\/(.+)$/)
      if (!mB) { saida.push({ entrega: e.id, erro: 'endereço fora dos buckets de nota' }); continue }
      const bucketNota = mB[1], caminho = decodeURIComponent(mB[2].split('?')[0])
      try {
        const ctx = await contexto(admin, e.id, e.despachado_por, e.despacho_data || hojeAcre())
        if (!ctx) { saida.push({ entrega: e.id, erro: 'sem contexto' }); continue }
        const { data: blob, error } = await admin.storage.from(bucketNota).download(caminho)
        if (error || !blob) { saida.push({ entrega: e.id, erro: 'arquivo não encontrado' }); continue }
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const sha = await sha256Hex(bytes)
        const r = await conferir(admin, bytes, ctx, sha)
        const g = corpo.gravar === false ? { aprovada: r.regras.every(x => x.ok) }
          : await gravar(admin, ctx, caminho, e.nota_tecnica_nome, sha, bytes.length, r, 'calibracao', null)
        saida.push({ entrega: e.id, aprovada: g.aprovada, falhas: r.regras.filter(x => !x.ok).map(x => x.id) })
      } catch (err) { saida.push({ entrega: e.id, erro: (err as Error).message }) }
    }
    return resp({ ok: true, total: saida.length, saida })
  }

  if (!['conferir', 'modelo', 'confirmar_aprovacao'].includes(corpo.acao)) return resp({ ok: false, erro: 'ação inválida' }, 400)

  // 1. quem é e se pode avaliar
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: u, error: eU } = await admin.auth.getUser(token)
  if (eU || !u?.user) return resp({ ok: false, erro: 'Sessão inválida. Entre de novo.' }, 401)
  const usuarioId = u.user.id
  const { entrega_id, caminho, arquivo_nome, sha256 } = corpo
  if (!entrega_id) return resp({ ok: false, erro: 'Dados incompletos (entrega).' }, 400)

  const { data: ent } = await admin.from('contratos_produtos_entregas')
    .select('id, produto_id, contrato_id, situacao').eq('id', entrega_id).maybeSingle()
  if (!ent) return resp({ ok: false, erro: 'Entrega não encontrada.' }, 404)
  const doUsuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } })
  const { data: pode } = await doUsuario.rpc('fn_pode_avaliar_contrato', { p_contrato_id: ent.contrato_id })
  if (pode !== true) return resp({ ok: false, erro: 'Só o responsável/substituto da atividade (ou super_admin) confere e aprova este produto.' }, 403)

  if (corpo.acao === 'modelo') {
    const { data: e } = await admin.from('contratos_produtos_entregas')
      .select('dt_entrega, produto:contratos_produtos(numero_produto, descricao, valor_brl), contrato:contratos(numero, objeto_pt, atividade_id, fornecedor:fornecedores(nome), atividade:atividades(codigo))')
      .eq('id', entrega_id).maybeSingle()
    let responsavel = ''
    if (e?.contrato?.atividade_id) {
      const { data: rs } = await admin.from('atividade_responsaveis')
        .select('papel, usuario:usuarios(nome_completo, ativo)').eq('atividade_id', e.contrato.atividade_id).eq('ativo', true)
      const r = (rs || []).find((x: any) => x.papel === 'responsavel' && x.usuario?.ativo) || (rs || []).find((x: any) => x.usuario?.ativo)
      responsavel = r?.usuario?.nome_completo || ''
    }
    const blocos = montarBlocos({
      contratoNumero: e?.contrato?.numero || '', contratoObjeto: e?.contrato?.objeto_pt || '',
      produtoNumero: e?.produto?.numero_produto ?? null, produtoDescricao: e?.produto?.descricao || '',
      produtoValor: e?.produto?.valor_brl ?? null, fornecedor: e?.contrato?.fornecedor?.nome || '',
      dtEntrega: e?.dt_entrega || null, responsavel, atividadeCodigo: e?.contrato?.atividade?.codigo || '',
      ano: Number(hojeAcre().slice(0, 4)),
    })
    const nome = `Modelo_Nota_Tecnica_Contrato_${String(e?.contrato?.numero || '').replace(/\W+/g, '')}_Produto_${e?.produto?.numero_produto ?? ''}.docx`
    return resp({ ok: true, blocos, texto: textoPlano(blocos), docx_base64: await gerarDocx(blocos), nome_arquivo: nome })
  }

  if (corpo.acao === 'confirmar_aprovacao') {
    const tipo = String(corpo.tipo_decisao || '')
    if (!['aprovacao_total', 'aprovacao_parcial'].includes(tipo)) return resp({ ok: false, erro: 'Decisão inválida.' }, 400)
    if (ent.situacao !== 'em_analise') return resp({ ok: false, erro: 'Esta entrega não está em avaliação.' }, 409)
    if (typeof corpo.senha !== 'string' || !corpo.senha) return resp({ ok: false, erro: 'Digite sua senha.' }, 400)
    const { data: bloqueadoAte } = await admin.rpc('fn_rem_senha_bloqueada_ate', { p_usuario_id: usuarioId })
    if (bloqueadoAte) return resp({ ok: false, erro: 'SENHA_BLOQUEADA', bloqueado_ate: bloqueadoAte }, 429)
    const ok = await conferirSenha(u.user.email || '', corpo.senha)
    await admin.rpc('fn_rem_registrar_tentativa', { p_usuario_id: usuarioId, p_sucesso: ok })
    if (!ok) return resp({ ok: false, erro: 'SENHA_INVALIDA' }, 401)
    const { error: eS } = await admin.from('entrega_aprovacao_senhas').insert({
      entrega_id, usuario_id: usuarioId, tipo_decisao: tipo,
      ip: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null, user_agent: req.headers.get('user-agent'),
    })
    if (eS) return resp({ ok: false, erro: eS.message }, 500)
    return resp({ ok: true })
  }

  if (!caminho) return resp({ ok: false, erro: 'Dados incompletos (arquivo).' }, 400)
  const cam = String(caminho)
  if (!cam.startsWith(`produtos/${ent.produto_id}/`) || cam.includes('..')) {
    return resp({ ok: false, erro: 'Arquivo fora da pasta deste produto.' }, 400)
  }

  // nota já conferida e aprovada para esta entrega (ainda válida): não aceita outra.
  // Só super_admin troca (nota aprovada mas errada); a troca fica no histórico de conferências.
  const { data: ultConf } = await admin.from('nota_tecnica_conferencias')
    .select('caminho, arquivo_nome, nt_numero, aprovada, conferido_em')
    .eq('entrega_id', entrega_id).eq('origem', 'tela')
    .order('conferido_em', { ascending: false }).limit(1).maybeSingle()
  const vigente = ultConf && ultConf.aprovada && ent.situacao === 'em_analise'
    && Date.now() - Date.parse(ultConf.conferido_em) < 2 * 864e5
  if (vigente && ultConf.caminho !== cam) {
    const { data: perfil } = await doUsuario.rpc('fn_perfil_atual')
    if (perfil !== 'super_admin') {
      return resp({ ok: false, bloqueada: true,
        erro: `Esta entrega já tem nota técnica conferida (${ultConf.nt_numero || ultConf.arquivo_nome || 'nota aprovada'}). ` +
              'Depois de aprovada na conferência, a nota não pode ser trocada. Se ela estiver errada, peça a um super_admin.' }, 409)
    }
  }

  // 2. baixa e confere
  const { data: blob, error: eB } = await admin.storage.from(BUCKET).download(cam)
  if (eB || !blob) return resp({ ok: false, erro: 'O arquivo da nota não foi encontrado no armazenamento. Anexe de novo.' }, 404)
  if (blob.size > MAX_BYTES) return resp({ ok: false, erro: 'Arquivo grande demais para uma nota técnica (máx. 15 MB).' }, 400)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const sha = await sha256Hex(bytes)
  if (sha256 && String(sha256).toLowerCase() !== sha) {
    return resp({ ok: false, erro: 'O arquivo mudou durante o envio. Anexe de novo.' }, 409)
  }
  const ctx = await contexto(admin, entrega_id, usuarioId, hojeAcre())
  if (!ctx) return resp({ ok: false, erro: 'Contrato da entrega não encontrado.' }, 404)
  try {
    const r = await conferir(admin, bytes, ctx, sha)
    const g = await gravar(admin, ctx, cam, arquivo_nome || null, sha, bytes.length, r, 'tela', usuarioId)
    return resp({ ok: true, conferencia_id: g.id, aprovada: g.aprovada, regras: r.regras,
      nota: { numero: r.info.nt_numero ?? null, sei: r.info.sei_documento ?? null,
              signatarios: r.info.signatarios ?? [], data: r.info.data_assinatura ?? null } })
  } catch (err) {
    return resp({ ok: false, erro: 'Falha ao conferir: ' + (err as Error).message }, 500)
  }
})

async function conferirSenha(email: string, senha: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  })
  if (!r.ok) return false
  const j = await r.json().catch(() => null)
  // encerra a sessão criada só para conferir a senha
  if (j?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${j.access_token}` },
    }).catch(() => {})
  }
  return !!j?.access_token
}
