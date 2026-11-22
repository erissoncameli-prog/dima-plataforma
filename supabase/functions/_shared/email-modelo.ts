// Molde único dos e-mails do sistema (modelo "Anúncio", 22/11/2026).
// Faixa verde fina no alto · Acre | SEMA à esquerda e Resiliência à direita (versões de fundo claro)
// · linha "sobre" · título grande · texto · dados · link "Abrir ›" · parceiros no rodapé
// · motivo do envio · autoria (sem contato — regra do CLAUDE.md, igual a DimaAutoria.linha()).
// As funções seguem montando o corpo em texto ("CHAVE: valor"); textoParaHtml desenha no padrão.

import type { LogosEmail } from './logos-email.ts'

// Mesmo texto de js/autoria.js (DimaAutoria.dados) — mudou lá, muda aqui.
export const AUTORIA = {
  sistema: 'Plataforma Inteligente de Gestão de Projetos',
  papel: 'Concepção e Desenvolvimento',
  autor: 'Erisson Cameli Santiago',
  anos: '2025–2026',
}

const FF = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
const VERDE = '#1F4E2C'

// tira o prefixo "[DIMA | …]"/"Projeto DIMA —" e emojis do assunto para virar título
export function tituloDoAssunto(assunto: string): string {
  return String(assunto || '')
    .replace(/^\s*\[[^\]]*\]\s*/, '')
    .replace(/^Projeto DIMA\s*[—–-]\s*/i, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}✓]/gu, '')
    .replace(/\s{2,}/g, ' ').trim()
}

const limparRotulo = (s: string) => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim()
const SIGLAS = /\b(cpf|cnpj|sei|spd|spds|tdr|nf|pix|usd|brl|ptax|unesco|sema|api|ods)\b/gi
const capitalizar = (s: string) => { const t = s.toLowerCase(); return (t.charAt(0).toUpperCase() + t.slice(1)).replace(SIGLAS, (x) => x.toUpperCase()) }

const secao = (t: string) =>
  `<p style="margin:24px 0 4px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#86868B">${t}</p>`

// Corpo em texto → HTML no padrão. Linhas "CHAVE: valor" viram ficha; "TÍTULO:" sozinho vira seção;
// linhas de traço (─ ═ = -) somem; o resto vira parágrafo. Valores já vêm escapados por quem monta.
export function textoParaHtml(corpo: string): string {
  let html = '', ficha = false
  const fecha = () => { if (ficha) { html += '</table>'; ficha = false } }
  for (const bruta of String(corpo || '').split('\n')) {
    const linha = bruta.replace(/\s+$/, '')
    const t = linha.trim()
    if (/^[─═=\-_]{4,}$/.test(t)) { fecha(); continue }
    const item = t.match(/^([A-ZÇÁÉÍÓÚÃÕÂÊÔÀ][A-ZÇÁÉÍÓÚÃÕÂÊÔÀ0-9 .º/()]{1,30}?)\s*:\s*(.+)$/)
    if (item) {
      if (!ficha) { html += '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0;font-size:15px">'; ficha = true }
      html += `<tr><td style="padding:9px 14px 9px 0;color:#86868B;font-size:13px;white-space:nowrap;vertical-align:top;border-top:1px solid #F0F0F3">${capitalizar(item[1].trim())}</td>` +
        `<td style="padding:9px 0;color:#1D1D1F;vertical-align:top;border-top:1px solid #F0F0F3;line-height:1.45">${item[2].trim() || '—'}</td></tr>`
      continue
    }
    fecha()
    if (!t) continue
    // "VIAJANTE 1 — Nome" (bloco entre traços): vira o nome em destaque
    const pessoa = t.match(/^(VIAJANTE|ITEM|PRODUTO)\s+(\d+)\s*[—–-]\s*(.+)$/)
    if (pessoa) {
      html += `<p style="margin:22px 0 2px;font-size:12px;color:#86868B">${capitalizar(pessoa[1])} ${pessoa[2]}</p>` +
        `<p style="margin:0 0 4px;font-size:17px;font-weight:600;color:#1D1D1F">${pessoa[3]}</p>`
      continue
    }
    const cab = t.match(/^([A-ZÇÁÉÍÓÚÃÕÂÊÔÀ✈ ][A-ZÇÁÉÍÓÚÃÕÂÊÔÀ0-9 .,—–\-/()✈]{2,60}):?$/)
    if (cab && t === t.toUpperCase()) { html += secao(limparRotulo(cab[1])); continue }
    html += `<p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#424245">${t}</p>`
  }
  fecha()
  return html
}

export type Destaque = { rotulo: string; valor: string; cor?: string }

export type Molde = {
  logos: LogosEmail
  titulo: string               // frase grande (texto puro; é escapado aqui)
  sobre?: string               // linha pequena acima do título (módulo · número)
  html: string                 // corpo já em HTML (use textoParaHtml)
  destaques?: Destaque[]       // linha de 2–3 números/nomes entre traços
  botao?: { url: string; label: string }
  motivo?: string              // "Você recebe este e-mail porque…"
}

const escH = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function moldeEmail(m: Molde): string {
  const L = m.logos
  const dest = (m.destaques || []).filter((d) => d && d.valor)
  const destHtml = dest.length
    ? `<div style="margin-top:22px;border-top:1px solid #E8E8ED;border-bottom:1px solid #E8E8ED;padding:14px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${
      dest.map((d) => `<td style="vertical-align:top;padding-right:10px"><div style="font-size:12px;color:#86868B">${escH(d.rotulo)}</div><div style="font-size:16px;font-weight:600;color:${d.cor || '#1D1D1F'}">${escH(d.valor)}</div></td>`).join('')
    }</tr></table></div>` : ''
  const botao = m.botao?.url
    ? `<p style="margin:26px 0 0"><a href="${escH(m.botao.url)}" style="color:#1F6F45;font-size:17px;font-weight:600;text-decoration:none">${escH(limparRotulo(m.botao.label).replace(/[›>]\s*$/, ''))} ›</a></p>`
    : ''
  const label = (L.topo || L.projeto) ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td style="padding:20px 0 20px 24px;vertical-align:middle;white-space:nowrap">${L.topo}</td>
      <td align="right" style="padding:20px 24px 20px 12px;vertical-align:middle;white-space:nowrap">${L.projeto}</td></tr></table>` : ''
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:${FF};-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFFFFF"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#FFFFFF;border-top:4px solid ${VERDE}">
<tr><td>${label}</td></tr>
<tr><td style="padding:24px 24px 0">
  ${m.sobre ? `<p style="margin:0;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#86868B">${escH(m.sobre)}</p>` : ''}
  <h1 style="margin:8px 0 0;font-size:28px;line-height:1.15;letter-spacing:-.02em;color:#1D1D1F;font-weight:700">${escH(m.titulo)}</h1>
  ${destHtml}
  <div style="margin-top:8px">${m.html}</div>
  ${botao}
</td></tr>
<tr><td style="padding:40px 0 0"><div style="border-top:1px solid #E8E8ED;padding:22px 16px 30px;text-align:center">
  ${L.parceiros ? `<div style="line-height:0">${L.parceiros}</div>` : ''}
  <p style="margin:14px 0 0;font-size:11px;color:#86868B;line-height:1.6">Equipe de Gestão — Projeto DIMA · UNESCO / SEMA-AC · Fundo Brasil-ONU<br>
    <a href="mailto:fundobrasilonuacre@gmail.com" style="color:#1F6F45;text-decoration:none">fundobrasilonuacre@gmail.com</a>${m.motivo ? `<br>${escH(m.motivo)}` : ''}</p>
  <p style="margin:14px 0 0;padding-top:12px;border-top:1px solid #E8E8ED;font-size:11px;line-height:1.5;color:#86868B"><b style="color:#6E6E73">${AUTORIA.sistema}</b><br>${AUTORIA.papel}: ${AUTORIA.autor}<br>© ${AUTORIA.anos} · Todos os direitos reservados.</p>
</div></td></tr>
</table></td></tr></table></body></html>`
}

// Atalho para quem tem corpo em texto + assunto (a maioria das funções).
export function emailDeTexto(corpo: string, o: Omit<Molde, 'html' | 'titulo'> & { assunto?: string; titulo?: string }): string {
  return moldeEmail({ ...o, titulo: o.titulo || tituloDoAssunto(o.assunto || '') || 'Projeto DIMA', html: textoParaHtml(corpo) })
}
