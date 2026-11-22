// Logos dos e-mails — mesma fonte da plataforma: configuracoes_sistema (Dados do sistema › Logos).
// Cabeçalho (fundo verde #1B4332) = logo do PROJETO na versão para fundo escuro; sem ela, sobre placa branca.
// Faixa (fundo branco) = PARCEIROS na versão para fundo claro; sem ela, sobre placa verde.
// Mesma regra de js/logos.js — mudou lá, muda aqui.

type Logo = { url?: string; url_escuro?: string; alt?: string; tamanho?: string; ordem?: number }

const SITE_URL = 'https://fundobrasilonu-plataforma.vercel.app'
const ALTURA: Record<string, number> = { pequeno: 0.75, medio: 1, grande: 1.35 }

const RESERVA = {
  topo: [
    { url: '/assets/governo-acre-hd.png', alt: 'Governo do Acre' },
    { url: '/assets/logo-sema-hd.png', alt: 'SEMA/AC' },
  ] as Logo[],
  projeto: { url_escuro: '/assets/logo-resiliencia.png', alt: 'Projeto DIMA' } as Logo,
  parceiros: [
    { url: '/assets/UNESCO_logo_hor_blue_transparent.png.png', alt: 'UNESCO' },
    { url: '/assets/UNCT_Logo_RGB_Brazil_Portuguese_horiz_color.png', alt: 'ONU Brasil' },
    { url: '/assets/logo-fundo-brasil-onu.png', alt: 'Fundo Brasil-ONU' },
    { url: '/assets/logo-consorcio-amazonia.png', alt: 'Consórcio Amazônia Legal', tamanho: 'grande' },
  ] as Logo[],
}

const escH = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const abs = (u?: string) => !u ? '' : /^https?:/i.test(u) ? u : `${SITE_URL}/${u.replace(/^(\.\.\/)+/, '').replace(/^\.?\/+/, '')}`

function img(l: Logo, fundo: 'claro' | 'escuro', altura: number): string {
  const src = fundo === 'escuro' ? (l.url_escuro || l.url) : (l.url || l.url_escuro)
  if (!src) return ''
  const falta = fundo === 'escuro' ? !l.url_escuro : !l.url
  const h = Math.round(altura * (ALTURA[l.tamanho || 'medio'] ?? 1))
  const tag = `<img src="${escH(abs(src))}" alt="${escH(l.alt)}" height="${h}" style="display:block;border:0;height:${h}px;width:auto">`
  if (!falta) return tag
  const cor = fundo === 'escuro' ? '#FFFFFF' : '#1F4E2C'
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr><td bgcolor="${cor}" style="background:${cor};border-radius:6px;padding:5px 9px">${tag}</td></tr></table>`
}

// topo/projeto/parceiros = molde novo (email-modelo.ts), tudo sobre fundo branco.
export type LogosEmail = { cabecalho: string; faixa: string; topo: string; projeto: string; parceiros: string }
let cache: { em: number; v: LogosEmail } | null = null

const sep = '<span style="display:inline-block;width:1px;height:20px;background:#D2D2D7;margin:0 10px;vertical-align:middle"></span>'
const inline = (h: string) => h.replace('display:block;', 'display:inline-block;vertical-align:middle;')

// deno-lint-ignore no-explicit-any
export async function logosEmail(admin: any): Promise<LogosEmail> {
  if (cache && Date.now() - cache.em < 5 * 60_000) return cache.v
  let projeto: Logo | null = RESERVA.projeto
  let parceiros: Logo[] = RESERVA.parceiros
  let topo: Logo[] = RESERVA.topo
  try {
    const { data } = await admin.from('configuracoes_sistema')
      .select('logos_topo,logo_projeto,logos_parceiros').eq('projeto_id', 'default').maybeSingle()
    if (data) {
      topo = ((data.logos_topo || []) as Logo[]).filter((l) => l && (l.url || l.url_escuro))
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      const p = data.logo_projeto as Logo | null
      projeto = p && (p.url || p.url_escuro) ? p : null
      parceiros = ((data.logos_parceiros || []) as Logo[]).filter((l) => l && (l.url || l.url_escuro))
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    }
  } catch (_) { /* fica a reserva */ }
  const v = {
    // conteúdo da célula esquerda do cabeçalho verde
    cabecalho: projeto ? img(projeto, 'escuro', 52) : '',
    // linha de <td> da faixa branca de parceiros
    faixa: parceiros.map((l) => `<td align="center" style="padding:0 6px">${img(l, 'claro', 28)}</td>`).join(''),
    // molde novo: no e-mail vale o tamanho de Dados do sistema (as versões claras têm recortes diferentes)
    topo: topo.map((l) => inline(img(l, 'claro', 26))).filter(Boolean).join(sep),
    projeto: projeto ? inline(img({ ...projeto, tamanho: 'medio' }, 'claro', 32)) : '',
    parceiros: parceiros.map((l) => `<span style="display:inline-block;margin:6px 9px;vertical-align:middle">${inline(img(l, 'claro', 22))}</span>`).join(''),
  }
  cache = { em: Date.now(), v }
  return v
}
