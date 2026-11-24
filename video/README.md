# Vídeo publicitário — Plataforma Inteligente de Gestão de Projetos

Vídeo de ~1:41 em dois formatos — **horizontal** 1920×1080 (YouTube, site, apresentações) e **vertical** 1080×1920
(Reels, TikTok, Shorts, Status), 30 fps, áudio −14 LUFS — com as principais funções da plataforma: telas **reais** do sistema
(com **dados fictícios** de demonstração), locução neural em pt-BR, legenda sincronizada palavra a palavra, trilha e
efeitos originais e motion design em 3D. Tudo é gerado por código, sem material de terceiros com direitos.

Concepção e Desenvolvimento da plataforma: Erisson Cameli Santiago · © 2025–2026.

## Roteiro (15 cenas)

Gancho → marca → Visão Geral → Minhas tarefas → TDRs e licitação → Contratos e Financeiro → Remanejamento (cadeia de
assinaturas) → Matriz de Resultados (ODS) → Mapa Interativo → app do Diagnóstico Socioambiental → Patrimônio (placa com
QR) → Auditoria IA → Relatórios A4 → Segurança e LGPD → fecho com logos e crédito. Texto da locução em `roteiro.json`.

## Como regenerar

```bash
cd video
python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile numpy scipy faster-whisper pillow
npm install                              # chart.js, leaflet, turf, gsap (versões fixas em package.json)
./baixar_modelos.sh /caminho/modelos     # Kokoro-82M (ONNX) + vozes pf_dora/pm_alex (Hugging Face)

node captura/capturar.js                  # 1. telas reais com o banco em memória → build/telas/*.png
HF_HUB_DISABLE_XET=1 .venv/bin/python audio/locucao.py /caminho/modelos   # 2. locução + tempo de cada palavra (Whisper)
.venv/bin/python audio/trilha.py          # 3. linha do tempo, trilha, efeitos e mixagem → build/mix.wav
node render.js previa 14 40 99            # (opcional) quadros soltos para conferir
node render.js video                      # 4. quadros + MP4 → saida/plataforma-gestao-projetos.mp4
node render.js video vertical             #    versão 1080×1920 → saida/plataforma-gestao-projetos-vertical.mp4
.venv/bin/python audio/legendas.py        # 5. saida/legendas.srt
```

### Corte de 30 segundos (Status do WhatsApp e anúncios)

Narração própria, mais curta (`roteiro-30s.json`): gancho → Visão Geral → Remanejamento → Mapa → Auditoria IA → fecho com a
frase e as logos juntos. Usa as mesmas telas e o mesmo código das cenas; só a montagem muda.

```bash
HF_HUB_DISABLE_XET=1 .venv/bin/python audio/locucao.py /caminho/modelos roteiro-30s.json build/corte30
.venv/bin/python audio/trilha.py build/corte30 2.3 compacto     # 2,3 s de fecho após a voz; abertura e pausas menores
node render.js video vertical corte30                         # → saida/plataforma-gestao-projetos-30s-vertical.mp4
.venv/bin/python audio/legendas.py build/corte30 -30s          # → saida/legendas-30s.srt
```

Uma cena só aparece se estiver no roteiro; a numeração dos módulos (01, 02…) segue a ordem da montagem. Para outro corte,
crie outro `roteiro-*.json` com ids de cenas existentes e mantenha no texto as palavras que a animação usa para sincronizar
(ex.: "pago", "comprometido", "livre" na Visão Geral; "cadeia", "senha", "impressão" no Remanejamento).

Mudou o texto? Edite `roteiro.json` e rode do passo 2 em diante: a animação, a legenda e os efeitos seguem os tempos da
nova locução (`build/linha.json`). Cada cena começa num tempo do compasso (120 BPM), então os cortes caem na batida.

## Peças

| Arquivo | O que faz |
|---|---|
| `captura/stub.js` | Substitui o supabase-js por um banco em memória (filtros, embeds `tabela(colunas)`, RPCs). Nada toca o Supabase real. |
| `captura/dados.js`, `captura/extras.js` | Dados **fictícios** (pessoas, fornecedores, contratos, valores). Nenhum dado real do projeto. |
| `captura/capturar.js`, `captura/telas.js` | Abre cada página no Chromium (Playwright), serve as bibliotecas dos CDNs a partir do npm, fixa o relógio e captura em 2x. |
| `audio/locucao.py` | Kokoro-82M (voz Dora e Alex) + Whisper para conferir a pronúncia e medir cada palavra. |
| `audio/trilha.py` | Linha do tempo, trilha (vi–IV–I–V, 120 BPM) e efeitos sintetizados em NumPy; voz tratada no ffmpeg; ducking; loudnorm −14 LUFS. |
| `cenas/` | Página com a linha do tempo GSAP pausada; `window.__render(t)` desenha qualquer instante. `?formato=vertical` troca o palco para 1080×1920 (mesma linha do tempo, mesmo áudio; posições em `G(horizontal, vertical)` e estilos em `html.v` no fim de `cenas.css`). |
| `render.js` | Renderiza quadro a quadro em 4 processos e codifica H.264/AAC. |

## Ferramentas (código aberto) e licenças

Playwright (Apache-2.0) · GSAP 3.12.5 (licença "Standard No Charge" da GreenSock/Webflow) · Kokoro-82M (Apache-2.0) e
kokoro-onnx (MIT) · faster-whisper (MIT) e modelo Whisper small (MIT) · FFmpeg (LGPL/GPL) · NumPy/SciPy (BSD) ·
Chart.js e Leaflet (MIT, já usados pela plataforma). Essas ferramentas são só de produção do vídeo; **não** entram na
plataforma (por isso não estão no `NOTICE`).

## Formato vertical

Mesma locução, legenda, trilha e as 15 cenas; muda só a composição: título e itens no alto, a tela da plataforma no meio
(janela 960×740, a captura cobre a janela e a câmera aproxima o trecho citado) e a legenda abaixo. Tudo o que importa
fica na área segura dos aplicativos (y 230–1600, x 60–960): o topo e o rodapé são cobertos pelos botões e pelo texto do post.

## Cuidados

- As logos dos parceiros (UNESCO, ONU Brasil, Fundo Brasil-ONU, Consórcio) aparecem no fecho como na própria plataforma;
  antes de veicular fora do projeto, confirmar com as assessorias de comunicação o uso das marcas.
- As telas trazem o aviso "Telas reais da plataforma com dados fictícios de demonstração".
- `build/` e `saida/` ficam fora do git (arquivos grandes e regeneráveis).
