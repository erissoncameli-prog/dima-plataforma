/* ── Mini gráficos dos números do topo (KpiG) ────────────────────────────
   Plataforma Inteligente de Gestão de Projetos · © Erisson Cameli Santiago
   Um gráfico pequeno ao lado do número de cada quadro, com uma frase de
   leitura embaixo. SVG próprio (sem biblioteca), cor só por token CSS
   (var(--…)), então segue o tema claro/escuro sozinho.

   Uso no quadro (botão ou div):
     <button class="td-kpi kg-tem">
       <span class="kg-in">
         <span class="kg-esq">…rótulo, número, valor…</span>
         ${KpiG.bloco(KpiG.barras([...]), 'leitura com <b>destaque</b>')}
       </span>
     </button>
   O SVG é aria-hidden; quem não vê o gráfico lê a frase (texto do botão).
   A frase recebe HTML: escapar com esc() todo texto vindo do banco.
   Estilo em css/kpi-graficos.css (prefixo kg-). */
;(function () {
  const W = 120;                      // largura do desenho (viewBox)
  const n = v => { v = parseFloat(v); return isFinite(v) ? v : 0; };
  const r1 = v => Math.round(v * 10) / 10;
  const escT = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dica = t => t ? `<title>${escT(t)}</title>` : '';
  const svg = (h, corpo) => `<svg class="kg-svg" viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMid meet" focusable="false">${corpo}</svg>`;

  const KpiG = {};

  /* R$ curto: 950 · 14 mil · 2,3 mi */
  KpiG.brl = function (v) {
    v = n(v); const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e6) return s + 'R$ ' + (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    if (a >= 1e3) return s + 'R$ ' + Math.round(a / 1e3).toLocaleString('pt-BR') + ' mil';
    return s + 'R$ ' + Math.round(a).toLocaleString('pt-BR');
  };
  KpiG.usd = function (v) { return KpiG.brl(v).replace('R$', 'US$'); };
  KpiG.pct = function (parte, total) { return total > 0 ? Math.round(parte / total * 100) : 0; };

  /* Dias desde a data (positivo = passou). Aceita 'AAAA-MM-DD' ou timestamp. */
  KpiG.diasDesde = function (d) {
    if (!d) return null;
    const s = String(d); const dt = s.length <= 10 ? new Date(s + 'T00:00:00') : new Date(s);
    if (isNaN(dt)) return null;
    const h = new Date(); h.setHours(0, 0, 0, 0); dt.setHours(0, 0, 0, 0);
    return Math.round((h - dt) / 864e5);
  };

  /* Colunas com rótulo embaixo e valor em cima.
     itens: [{r:'<30d', v:4, cor:'var(--x)', dica:'…', fraco:true}] */
  KpiG.barras = function (itens) {
    const H = 46, base = 34, topo = 9, k = itens.length || 1;
    const max = Math.max(1, ...itens.map(i => n(i.v)));
    const passo = W / k, larg = Math.min(22, passo - 6);
    return svg(H, `<line class="kg-base" x1="0" x2="${W}" y1="${base + .5}" y2="${base + .5}"/>` + itens.map((it, i) => {
      const v = n(it.v), h = v > 0 ? Math.max(2, (base - topo) * v / max) : 0;
      const x = r1(i * passo + (passo - larg) / 2), cx = r1(i * passo + passo / 2);
      return `<g>${dica(it.dica || (it.r + ': ' + v))}`
        + (h ? `<rect x="${x}" y="${r1(base - h)}" width="${r1(larg)}" height="${r1(h)}" rx="2" style="fill:${it.cor || 'var(--txt-3)'}"${it.fraco ? ' fill-opacity=".45"' : ''}/>` : '')
        + `<text class="kg-val" x="${cx}" y="${r1(base - h - 2)}" text-anchor="middle">${v ? escT(it.vTxt || v) : ''}</text>`
        + `<text class="kg-rot" x="${cx}" y="${H - 2}" text-anchor="middle">${escT(it.r)}</text>`
        + `<rect x="${r1(i * passo)}" y="0" width="${r1(passo)}" height="${H}" fill="transparent"/></g>`;
    }).join(''));
  };

  /* Série no tempo em colunas finas (ex.: 12 meses). Rótulo só no 1º e no último.
     valores: [{r:'jan', v:123, dica:'…'}], o último em destaque. */
  KpiG.colunas = function (valores, cor) {
    const H = 46, base = 34, k = valores.length || 1;
    const max = Math.max(1, ...valores.map(i => Math.max(0, n(i.v))));
    const passo = W / k, larg = Math.max(2, passo - 3);
    return svg(H, `<line class="kg-base" x1="0" x2="${W}" y1="${base + .5}" y2="${base + .5}"/>` + valores.map((it, i) => {
      const v = Math.max(0, n(it.v)), h = v > 0 ? Math.max(1.5, (base - 4) * v / max) : 0;
      const ult = i === k - 1;
      return `<g>${dica(it.dica)}`
        + (h ? `<rect x="${r1(i * passo + 1.5)}" y="${r1(base - h)}" width="${r1(larg)}" height="${r1(h)}" rx="1.5" style="fill:${cor}"${ult ? '' : ' fill-opacity=".5"'}/>` : '')
        + `<rect x="${r1(i * passo)}" y="0" width="${r1(passo)}" height="${base}" fill="transparent"/></g>`;
    }).join('')
      + (k > 1 ? `<text class="kg-rot" x="0" y="${H - 2}">${escT(valores[0].r)}</text><text class="kg-rot" x="${W}" y="${H - 2}" text-anchor="end">${escT(valores[k - 1].r)}</text>` : ''));
  };

  /* Faixa empilhada (parte do todo). itens: [{v, cor, dica}] */
  KpiG.faixa = function (itens, legenda) {
    const H = legenda ? 30 : 16, tot = itens.reduce((s, i) => s + Math.max(0, n(i.v)), 0);
    let x = 0, corpo = `<rect class="kg-trilho" x="0" y="3" width="${W}" height="10" rx="3"/>`;
    if (tot > 0) itens.forEach(it => {
      const v = Math.max(0, n(it.v)); if (!v) return;
      const w = W * v / tot;
      corpo += `<g>${dica(it.dica)}<rect x="${r1(x)}" y="3" width="${r1(Math.max(1, w - 1.5))}" height="10" rx="2" style="fill:${it.cor}"/></g>`;
      x += w;
    });
    if (legenda) corpo += `<text class="kg-rot" x="0" y="${H - 2}">${escT(legenda[0] || '')}</text><text class="kg-rot" x="${W}" y="${H - 2}" text-anchor="end">${escT(legenda[1] || '')}</text>`;
    return svg(H, corpo);
  };

  /* Anel parte/total com o % no meio. */
  KpiG.anel = function (parte, total, cor, txtDica) {
    const R = 15, C = 2 * Math.PI * R, p = total > 0 ? Math.min(1, Math.max(0, parte / total)) : 0;
    return `<svg class="kg-svg kg-anel" viewBox="0 0 40 40" focusable="false">${dica(txtDica)}`
      + `<circle class="kg-trilho-anel" cx="20" cy="20" r="${R}"/>`
      + (p ? `<circle cx="20" cy="20" r="${R}" fill="none" stroke-width="6" style="stroke:${cor}" stroke-dasharray="${r1(C * p)} ${r1(C)}" transform="rotate(-90 20 20)"/>` : '')
      + `<text class="kg-anel-txt" x="20" y="23.5" text-anchor="middle">${Math.round(p * 100)}%</text></svg>`;
  };

  /* Real × referência (bala): trilho = referência, barra = real, traço na referência.
     Real acima da referência pinta o excesso com corExc. */
  KpiG.bala = function (real, ref, o) {
    o = o || {}; real = Math.max(0, n(real)); ref = Math.max(0, n(ref));
    const H = 30, esc = Math.max(real, ref, 1), xr = W * ref / esc, xv = W * real / esc;
    let corpo = `${dica(o.dica)}<rect class="kg-trilho" x="0" y="4" width="${r1(Math.max(1, xr))}" height="12" rx="3"/>`;
    corpo += `<rect x="0" y="7.5" width="${r1(Math.max(real ? 1 : 0, Math.min(xv, xr)))}" height="5" rx="1.5" style="fill:${o.cor || 'var(--ok)'}"/>`;
    if (xv > xr) corpo += `<rect x="${r1(xr)}" y="7.5" width="${r1(xv - xr)}" height="5" rx="1.5" style="fill:${o.corExc || 'var(--erro)'}"/>`;
    corpo += `<line class="kg-meta" x1="${r1(Math.min(W - 1, xr))}" x2="${r1(Math.min(W - 1, xr))}" y1="1" y2="19"/>`;
    if (o.legenda) corpo += `<text class="kg-rot" x="0" y="${H - 2}">${escT(o.legenda[0] || '')}</text><text class="kg-rot" x="${W}" y="${H - 2}" text-anchor="end">${escT(o.legenda[1] || '')}</text>`;
    return svg(H, corpo);
  };

  /* Dispersão 0–100 × 0–100 com a diagonal (ex.: % do prazo × % pago).
     pontos: [{x, y, dica, alerta}] */
  KpiG.dispersao = function (pontos, o) {
    o = o || {};
    const H = 50, L = 4, R = W - 4, T = 3, B = 40, cl = v => Math.max(0, Math.min(100, n(v)));
    const px = v => r1(L + (R - L) * cl(v) / 100), py = v => r1(B - (B - T) * cl(v) / 100);
    let corpo = `<rect class="kg-trilho" x="${L}" y="${T}" width="${R - L}" height="${B - T}" rx="2" fill-opacity=".5"/>`
      + `<line class="kg-diag" x1="${L}" y1="${B}" x2="${R}" y2="${T}"/>`;
    pontos.forEach(p => {
      corpo += `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="2.6" style="fill:${p.alerta ? (o.corAlerta || 'var(--alerta)') : (o.cor || 'var(--ok)')}"${p.alerta ? '' : ' fill-opacity=".75"'}>${dica(p.dica)}</circle>`;
    });
    corpo += `<text class="kg-rot" x="${L}" y="${H - 1}">${escT((o.eixo || [])[0] || '')}</text><text class="kg-rot" x="${R}" y="${H - 1}" text-anchor="end">${escT((o.eixo || [])[1] || '')}</text>`;
    return svg(H, corpo);
  };

  /* Coluna direita do quadro: gráfico + frase. tom: '' | 'erro' | 'alerta' | 'ok' */
  KpiG.bloco = function (grafico, leitura, tom) {
    return `<span class="kg-dir"><span class="kg-graf" aria-hidden="true">${grafico}</span>`
      + (leitura ? `<span class="kg-ler${tom ? ' kg-' + tom : ''}">${leitura}</span>` : '') + '</span>';
  };

  window.KpiG = KpiG;
})();
