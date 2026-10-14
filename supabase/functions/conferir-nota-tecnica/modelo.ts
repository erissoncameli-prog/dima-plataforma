// Modelo da nota técnica de aprovação de produto — mesmo padrão das notas já aprovadas no SEI
// (levantado das 54 notas existentes: 50 usam estas 8 seções; interessado = Diretoria de Meio Ambiente).
// Uma fonte só: a janela da tela desenha os blocos e o .docx sai daqui.
//   o = obrigatório (o sistema confere) → destacado em amarelo
//   c = completar (dado que a pessoa preenche) → [entre colchetes], em cinza
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType, TextRun,
} from 'npm:docx@8.5.0'

export type Parte = { t: string; o?: boolean; c?: boolean }
export type Bloco = { k: 'aviso' | 'titulo' | 'linha' | 'secao' | 'par' | 'assin'; p: Parte[] }
export type CtxModelo = {
  contratoNumero: string; contratoObjeto: string; produtoNumero: number | null; produtoDescricao: string
  produtoValor: number | null; fornecedor: string; dtEntrega: string | null; responsavel: string
  atividadeCodigo: string; ano: number
}

const brl = (v: number | null) => v == null ? null
  : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brData = (d: string | null) => { if (!d) return null; const [a, m, dd] = d.slice(0, 10).split('-'); return `${dd}/${m}/${a}` }
const T = (t: string): Parte => ({ t })
const O = (t: string): Parte => ({ t, o: true })
const C = (t: string): Parte => ({ t, c: true })

export function montarBlocos(x: CtxModelo): Bloco[] {
  const prod = `Produto ${x.produtoNumero != null ? String(x.produtoNumero).padStart(2, '0') : 'N'}`
  const desc = x.produtoDescricao && !/^produto\s*\d+\s*$/i.test(x.produtoDescricao.trim()) ? ` – ${x.produtoDescricao.trim()}` : ''
  return [
    { k: 'aviso', p: [T('ITENS OBRIGATÓRIOS (destacados em amarelo): o sistema confere título "Nota Técnica nº", número do contrato, '
      + 'produto, nome do consultor/fornecedor e a assinatura eletrônica no SEI do responsável ou substituto da atividade, '
      + 'com no máximo 60 dias até a aprovação. Apague este quadro antes de assinar.')] },
    { k: 'titulo', p: [O('NOTA TÉCNICA Nº '), C('__'), T(`/${x.ano}/SEMA - `), C('[UNIDADE]')] },
    { k: 'linha', p: [T('PROCESSO Nº '), C('[número do processo no SEI]')] },
    { k: 'linha', p: [T('INTERESSADO: DIRETORIA DE MEIO AMBIENTE')] },
    { k: 'secao', p: [T('1. ASSUNTO')] },
    { k: 'par', p: [T('Avaliação e aprovação do '), O(prod), T(desc + ', referente ao '), O(`Contrato nº ${x.contratoNumero}`),
      T(', apresentado por '), O(x.fornecedor || '[consultor/fornecedor]'), T('.')] },
    { k: 'secao', p: [T('2. NOME DO OBJETO GERAL DO CONTRATO')] },
    { k: 'par', p: [x.contratoObjeto ? T(x.contratoObjeto) : C('[objeto do contrato]')] },
    { k: 'secao', p: [T('3. NOME DO PRODUTO/SERVIÇO')] },
    { k: 'par', p: [O(prod), T(desc + '.')] },
    { k: 'secao', p: [T('4. NOME DO CONSULTOR')] },
    { k: 'par', p: [O(x.fornecedor || '[consultor/fornecedor]')] },
    { k: 'secao', p: [T('5. VALOR DO PAGAMENTO DO PRODUTO/SERVIÇO PREVISTO NO CONTRATO')] },
    { k: 'par', p: [brl(x.produtoValor) ? T(brl(x.produtoValor)!) : C('[valor previsto]'), T(', conforme o '), O(`Contrato nº ${x.contratoNumero}`), T('.')] },
    { k: 'secao', p: [T('6. DATA DE ENTREGA DO PRODUTO PELA CONSULTORIA/EMPRESA')] },
    { k: 'par', p: [brData(x.dtEntrega) ? T(brData(x.dtEntrega)! + '.') : C('[data da entrega]')] },
    { k: 'secao', p: [T('7. AVALIAÇÃO DO PRODUTO/SERVIÇO')] },
    { k: 'par', p: [C('[Descreva o que foi verificado: aderência ao Termo de Referência, conteúdo, qualidade, ajustes atendidos.]')] },
    { k: 'secao', p: [T('8. CONCLUSÃO E SOLICITAÇÃO DE PAGAMENTO DO PRODUTO/SERVIÇO')] },
    { k: 'par', p: [T('Diante do exposto, manifesto-me pela APROVAÇÃO do '), O(prod), T(' do '), O(`Contrato nº ${x.contratoNumero}`),
      T(', apresentado por '), O(x.fornecedor || '[consultor/fornecedor]'), T(', e solicito o pagamento correspondente'),
      brl(x.produtoValor) ? T(`, no valor de ${brl(x.produtoValor)}`) : T(''), T('.')] },
    { k: 'linha', p: [T('Rio Branco, '), C('[data]'), T('.')] },
    { k: 'assin', p: [O(`Assinatura eletrônica no SEI: ${x.responsavel || 'responsável ou substituto da atividade'}`),
      T(` — responsável pela atividade ${x.atividadeCodigo || ''} (ou substituto).`)] },
  ]
}

export function textoPlano(bs: Bloco[]) {
  return bs.filter(b => b.k !== 'aviso').map(b => b.p.map(p => p.t).join('')).join('\n\n')
}

export async function gerarDocx(bs: Bloco[]) {
  const run = (p: Parte, extra: Record<string, unknown> = {}) => new TextRun({
    text: p.t, font: 'Calibri', size: 22, ...extra,
    ...(p.o ? { bold: true, highlight: 'yellow' } : {}),
    ...(p.c ? { italics: true, color: '6B7280' } : {}),
  })
  const filhos = bs.map(b => {
    if (b.k === 'aviso') return new Paragraph({
      children: b.p.map(p => run(p, { size: 18, color: '7A5B00' })),
      shading: { type: ShadingType.CLEAR, fill: 'FFF4CC', color: 'auto' },
      border: ['top', 'bottom', 'left', 'right'].reduce((o, l) => ({ ...o, [l]: { style: BorderStyle.SINGLE, size: 6, color: 'C9A227', space: 4 } }), {}),
      spacing: { after: 240 },
    })
    if (b.k === 'titulo') return new Paragraph({ children: b.p.map(p => run(p, { bold: true, size: 24 })), spacing: { after: 120 } })
    if (b.k === 'secao') return new Paragraph({ children: b.p.map(p => run(p, { bold: true })), spacing: { before: 240, after: 80 } })
    if (b.k === 'assin') return new Paragraph({ children: b.p.map(p => run(p)), spacing: { before: 360 }, alignment: AlignmentType.CENTER })
    return new Paragraph({ children: b.p.map(p => run(p)), spacing: { after: 80 }, alignment: b.k === 'par' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT })
  })
  const doc = new Document({
    creator: 'Plataforma DIMA', title: 'Modelo de nota técnica',
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1418, right: 1134 } } }, children: filhos }],
  })
  return await Packer.toBase64String(doc)
}
