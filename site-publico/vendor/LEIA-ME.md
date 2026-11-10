# Bibliotecas de terceiros do site público

Cópias locais das bibliotecas de mapa, gráfico, animação e acesso a dados que o site carregava
de CDN (jsdelivr/unpkg). Atende o item 3.4 do Termo de Referência do Produto 3 (contrato UNESCO
4500573698): o site não depende de CDN de terceiros. Baixadas em 06/11/2026, sem alteração.

| Biblioteca | Versão | Licença | Origem | Usada em |
|---|---|---|---|---|
| supabase-js (UMD) | 2.119.0 | MIT (`supabase-js-2.119.0/LICENSE`) | npm `@supabase/supabase-js`, `dist/umd/supabase.js` | todas as páginas com dado do banco |
| GSAP + ScrollTrigger | 3.15.0 | GreenSock Standard "No Charge" License — https://gsap.com/standard-license | npm `gsap`, `dist/` | sobre.html |
| Leaflet | 1.9.4 | BSD-2-Clause (`leaflet-1.9.4/LICENSE`) | npm `leaflet`, `dist/` (com `images/`) | mapa.html |
| Leaflet.markercluster | 1.5.3 | MIT (`leaflet.markercluster-1.5.3/LICENSE`) | npm `leaflet.markercluster`, `dist/` | mapa.html |
| Leaflet-MiniMap | 3.6.1 | BSD-2-Clause (`leaflet-minimap-3.6.1/LICENSE`) | npm `leaflet-minimap`, `dist/` (com `images/`) | mapa.html |
| Turf | 6.5.0 | MIT (`turf-6.5.0/LICENSE`) | npm `@turf/turf`, `turf.min.js` | mapa.html |
| pdf.js (pdfjs-dist) | 4.7.76 | Apache-2.0 (`pdfjs-dist-4.7.76/LICENSE`) | npm `pdfjs-dist`, `build/pdf.min.mjs` e `build/pdf.worker.min.mjs` (baixada em 09/11/2026; integridade sha512 conferida com o registro npm; salvos como `.js`, conteúdo igual, porque nem todo servidor entrega `.mjs` como JavaScript) | produtos.html (visualizar o produto) |
| Montserrat (fonte) | v31 (Google Fonts, variável 400–700) | SIL Open Font License 1.1 (`montserrat-v31/OFL.txt`) | fonts.gstatic.com, faixas latin e latin-ext (baixada em 10/11/2026) | todas as páginas, por `css/tokens.css` |

Antes, `supabase-js@2` e `turf@6` eram versões flutuantes (mudavam sozinhas a cada versão nova);
agora estão fixas. Para atualizar: baixar a versão nova numa pasta `<biblioteca>-<versão>/`, trocar
o caminho nas páginas e testar mapa, Sobre e as páginas com dado; depois apagar a pasta antiga.

Fora daqui, de propósito: as camadas de mapa base (servidores de mosaico), que são conteúdo
carregado pelo mapa, não biblioteca. A fonte Montserrat passou a ser servida daqui em 10/11/2026
(Produto 4): o CSS do Google Fonts bloqueava a primeira pintura das páginas.

## Conferência dos arquivos (SHA-256, primeiros 16 caracteres)

| Arquivo | SHA-256 |
|---|---|
| `gsap-3.15.0/ScrollTrigger.min.js` | `b0b14d67b55b0c43…` |
| `gsap-3.15.0/gsap.min.js` | `92bb9a96476f983d…` |
| `leaflet-1.9.4/LICENSE` | `53e8dc25862014e4…` |
| `leaflet-1.9.4/leaflet.css` | `a783710282418482…` |
| `leaflet-1.9.4/leaflet.js` | `db49d009c841f5ca…` |
| `leaflet-1.9.4/images/layers-2x.png` | `066daca850d8ffbe…` |
| `leaflet-1.9.4/images/layers.png` | `1dbbe9d028e292f3…` |
| `leaflet-1.9.4/images/marker-icon-2x.png` | `00179c4c1ee830d3…` |
| `leaflet-1.9.4/images/marker-icon.png` | `574c3a5cca85f411…` |
| `leaflet-1.9.4/images/marker-shadow.png` | `264f5c640339f042…` |
| `leaflet-minimap-3.6.1/Control.MiniMap.min.css` | `a7469be69d05ac5b…` |
| `leaflet-minimap-3.6.1/Control.MiniMap.min.js` | `1dbfdfd4531a2d5f…` |
| `leaflet-minimap-3.6.1/LICENSE` | `198e131ff1ddff5f…` |
| `leaflet-minimap-3.6.1/images/toggle.png` | `7528e6cda9672a19…` |
| `leaflet-minimap-3.6.1/images/toggle.svg` | `a98885c370d6b4d8…` |
| `leaflet.markercluster-1.5.3/LICENSE` | `3133dacd38250bd1…` |
| `leaflet.markercluster-1.5.3/MarkerCluster.Default.css` | `61258232d98d64dc…` |
| `leaflet.markercluster-1.5.3/MarkerCluster.css` | `614dea0a98ff3f4e…` |
| `leaflet.markercluster-1.5.3/leaflet.markercluster.js` | `1e4e1d22972a3926…` |
| `supabase-js-2.119.0/LICENSE` | `334dd6820e2eaeab…` |
| `supabase-js-2.119.0/supabase.js` | `a867edbcfb029370…` |
| `turf-6.5.0/LICENSE` | `f9b32b82fd5a1d3a…` |
| `montserrat-v31/OFL.txt` | `8b7141c03fa4f8d4…` |
| `montserrat-v31/montserrat-latin-ext.woff2` | `54d9a78b7ff60b68…` |
| `montserrat-v31/montserrat-latin.woff2` | `06b16db7a969135d…` |
| `pdfjs-dist-4.7.76/LICENSE` | `0d542e0c8804e39a…` |
| `pdfjs-dist-4.7.76/pdf.min.js` | `49e26487d87a86cb…` |
| `pdfjs-dist-4.7.76/pdf.worker.min.js` | `d2e6ef4cbc6f0e2c…` |
| `turf-6.5.0/turf.min.js` | `d00f3e8ff8a8f9c1…` |
