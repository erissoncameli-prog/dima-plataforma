# Auditoria de segurança — 13/11/2026

Escopo: site na Vercel (`fundobrasilonu-plataforma.vercel.app`), Edge Functions e banco Supabase
(`wfymnmlinonvdqfucjya`), histórico do Git, dependências de front-end. Complementa a rodada de 10/11/2026
(commit `3c1355a`: analisar/corrigir/sugerir TDR, importar do Drive, reset de entregas, funções `public`).

Gravidade: **Crítica** (dado pessoal ou dinheiro exposto a qualquer pessoa) · **Alta** · **Média** · **Baixa**.

## 1. Falhas encontradas e corrigidas

| # | Gravidade | Onde | Risco | Correção | Situação |
|---|-----------|------|-------|----------|----------|
| 1 | Crítica | Edge Function `chat-auditor` | Com a chave pública do site (que está no `js/config.js`), qualquer pessoa conversava com o assistente, que lia com service_role achados de auditoria, contratos, **CPF/CNPJ de fornecedor**, pagamentos e produtos | Só super_admin/coordenação logados e ativos; histórico limitado (30 mensagens, 8 mil caracteres) | Publicada (v15) e testada: chave pública → 401 |
| 2 | Crítica | Edge Function `enviar-email-viagem` | Qualquer pessoa disparava o e-mail à UNESCO com **CPF e passaporte** dos viajantes, gerava links de prestação de contas e mandava e-mails em nome do projeto | Usuário logado que enxerga o protocolo (RLS) | Publicada (v20) e testada: 401 |
| 3 | Crítica | Edge Function `traduzir-contrato` (só existia no painel) | Sem login nenhum (`verify_jwt` desligado): baixava **qualquer URL** (SSRF) e gastava a chave da Anthropic | Recriada no repositório: login + perfil que edita contrato + acesso ao contrato; PDF lido do bucket privado no servidor; `verify_jwt` ligado. `contratos.html` manda o token da sessão e `contrato_id` | Publicada (v18) e testada: 401. **A tradução estava quebrada antes** (o bucket ficou privado) e volta a funcionar com o novo front |
| 4 | Alta | Vercel — arquivos do repositório publicados | Qualquer um baixava os `.sql` de instalação, as migrações, as Edge Functions, `CLAUDE.md` (schema e regras) e `.claude/settings.local.json` (caminhos do computador, nomes de pessoas). Conferido em produção: HTTP 200 | `.vercelignore` tira tudo isso do deploy | Vale no próximo deploy da `main` |
| 5 | Alta | Edge Function `prestacao-publica` (link do e-mail do viajante) | `finalizar` gravava **qualquer texto** como URL do relatório/cartão; a tela de Viagens da equipe usa esse valor em `onclick` → XSS na sessão da coordenação. Extensão do arquivo ia crua para o caminho. `expirar` invalidava links de qualquer viajante sem login | Só URL da pasta do próprio viajante gerada pelo fluxo; extensão em lista; nome do arquivo saneado; `expirar` exige login (tela de Viagens manda o token). Banco conferido: nenhuma URL suspeita gravada | Publicada (v14) e testada |
| 6 | Alta | Edge Function `auditor-ia` | Qualquer pessoa rodava a auditoria (custo de IA a cada chamada) e criava execuções; `usuario_id` vinha do corpo | Só super_admin/coordenação (ou service_role); quem disparou vem do token | Publicada (v22) e testada: 401 |
| 7 | Média | Edge Function `fetch-link-metadata` (só no painel) | Qualquer pessoa fazia o servidor buscar qualquer endereço (SSRF, sondagem de rede) | Login; só http/https com nome de domínio público (sem IP, localhost, `.local`/`.internal`), portas 80/443, redirecionamentos conferidos, 512 KB | Publicada (v15) e testada |
| 8 | Média | Edge Function `prodes-proxy` | Sem login; `bbox` ia cru para a URL do WFS do INPE (injeção de parâmetros, repasse aberto) | Login + 4 números dentro do Brasil, até 4°×4° | Publicada (v12) e testada |
| 9 | Média | `dynamic-endpoint`, `gerar-pdf-relatorio` | Cópia antiga do e-mail de viagem aberta à chave pública; envio de relatório (com CPF) a serviço externo de PDF, proibido pela regra do projeto | Desativadas (respondem 410). Nenhuma tela as usava | Publicadas e testadas |
| 10 | Média | Cabeçalhos HTTP | Sem CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy (só HSTS, que a Vercel já põe) | `vercel.json`: CSP (scripts só do próprio site e de jsdelivr/cdnjs/unpkg; `object-src 'none'`, `base-uri`, `form-action`), anti-clickjacking fora do site público, `no-referrer` + `no-store` nas páginas com token na URL | Testado em servidor local com Chromium: 42 páginas sem nenhum bloqueio da CSP. Vale no próximo deploy |
| 11 | Média | Front — `esc()` | Não escapava `'`; em ~22 `onclick="f('${esc(x)}')"` uma aspa fecha a string | `esc()` escapa `'`; novo `escJs()` para string JS em atributo, aplicado onde o valor pode vir de fora (anexos de tarefa, relatório e cartões de viagem) | Vale no próximo deploy |
| 12 | Baixa | Banco — 9 views | Ainda tinham INSERT/UPDATE/DELETE/TRUNCATE para `authenticated`. Hoje não são auto-atualizáveis, mas o padrão já abriu `vw_saldo_atividade` no passado | Migração `20261113_seg_views_e_triggers` (aplicada) | Conferido: 0 views com escrita |
| 13 | Baixa | Banco — 7 funções de gatilho | Executáveis pela chave pública via `/rest/v1/rpc` (aviso do painel) | Mesma migração revoga EXECUTE (gatilho não depende disso) | Conferido: `anon` só executa `fn_publico_*` e os 5 predicados previstos |

## 2. Itens verificados sem falha

- **Segredos no Git**: histórico completo (55 commits) varrido. Só aparece a chave **anon**, que é pública por natureza
  (decodificada: `role: anon`). Nenhuma service_role, chave Anthropic, senha do Gmail, token OAuth ou chave privada.
  Não há `.env` no repositório; os segredos ficam nos secrets das Edge Functions. Nada a revogar.
- **Senhas**: guardadas pelo Supabase Auth com bcrypt; o sistema nunca vê nem grava a senha (reconfirmação de senha só no
  servidor, com bloqueio após 5 erros). Não há link de redefinição por e-mail: o pedido vira tarefa do super_admin, que
  define senha temporária com troca obrigatória — não existe link para expirar.
- **Sessão/cookies/CSRF**: a sessão é um token Bearer (JWT de curta duração + refresh) guardado pelo supabase-js no
  navegador, não um cookie. Como nenhum pedido depende de cookie, CSRF não se aplica; a proteção contra roubo do token é
  justamente a CSP + escape (itens 10 e 11).
- **Rotas de administrador**: decididas no banco (RLS, `fn_perfil_atual()`, SECURITY DEFINER com checagem) e agora também
  em todas as Edge Functions com service_role. A tela só esconde botões.
- **SQL**: não há SQL montado por concatenação no front nem nas Edge Functions (tudo por PostgREST/RPC parametrizado).
- **Valores e pagamentos**: calculados e travados no banco (razão orçamentário, PTAX, senha para efetivar pagamento,
  `trg_*`); o valor vindo da tela é conferido ou ignorado.
- **Uploads**: buckets com limite de tamanho e tipos (exceto `acervo-capas`, `pontos-mapa`, `tarefas-anexos` — ver §3).
- **Site público**: todos os dados do banco passam por `esc()`; o site lê só `fn_publico_*`.
- **HTTPS**: a Vercel redireciona HTTP→HTTPS e já envia HSTS com preload.
- **Logs de acesso**: últimas 24 h do Auth com 9 logins recusados e 6 negados — volume normal, sem força bruta.

## 3. O que depende de ação sua (painel dos provedores)

1. **Supabase › Authentication › Policies**: ligar **"Leaked password protection"** (bloqueia senhas vazadas — aviso do
   painel de segurança) e subir o mínimo de senha para 10+ caracteres.
2. **Supabase › Authentication › Rate limits**: conferir o limite de login por IP (padrão do Supabase) e, se quiser,
   **ativar MFA (TOTP)** para super_admin e coordenação (hoje 0 contas com MFA).
3. **Supabase › Auth › Sessions**: avaliar "Time-box user sessions" (ex.: 12 h) e "Inactivity timeout" — a sessão hoje
   dura até o usuário sair.
4. **Fazer o deploy da `main`** com este pacote (headers, `.vercelignore`, `escJs`, `contratos.html`, `viagens.html`).
   As Edge Functions e a migração **já estão em produção**.
5. **Monitoramento**: no Supabase, criar alerta (Logs › Alerts / Log Drain) para picos de `auth_logs` com status 400 e de
   `function_edge_logs` com 401/403 — sinais de força bruta ou sondagem. Os logs já não guardam senha nem corpo das
   requisições.
6. Opcional: **Vercel Firewall** com regra de limite de requisições para `/` (proteção extra contra robôs).

## 4. Riscos que ficaram (recomendações para próxima rodada)

- **Crons chamam as funções com a chave pública** (`cron-prestacao`, `cron-tarefas`, `diag-expurgo`, `cotacao-ptax`,
  `gmail-watch-renovar`, `assinar-remanejamento {acao:'drenar'}`). Qualquer pessoa pode dispará-las fora de hora. São
  idempotentes (só reprocessam filas e lembretes), mas o ideal é um segredo de cron guardado no Vault e conferido na
  função. Exige mexer nos jobs do pg_cron e nos secrets juntos — fazer com janela de teste.
- **CORS `*`** nas Edge Functions: com token Bearer não é vetor de ataque (não há cookie), mas pode ser restringido a
  `https://fundobrasilonu-plataforma.vercel.app` quando não houver mais origem de teste.
- **CSP com `'unsafe-inline'`**: necessário hoje (o código usa `onclick` e `<script>` inline em todas as páginas). Tirar
  exigiria migrar para `addEventListener` — trabalho grande.
- **Bibliotecas por CDN sem versão fixa/SRI**: `@supabase/supabase-js@2` (32 páginas), `@turf/turf@6`, `chart.js@4`.
  Vendorizar (como já foi feito com ExcelJS/pdf.js) e fixar versão.
- **Bibliotecas com vulnerabilidade conhecida**: SheetJS `xlsx@0.18.5` (poluição de protótipo ao **ler** planilha — usada na
  importação do Mapa, só por editores) e `jspdf@2.5.1` (DoS). Trocar a leitura por ExcelJS e subir jsPDF para 3.x.
- **Rate limit nas funções com IA** (chat/auditor/tradução): hoje limitadas a perfis da equipe; um limite por usuário
  (tabela de contagem) evitaria uso excessivo por conta comprometida.
- **13 views SECURITY DEFINER** (aviso do painel): várias são intencionais (CLAUDE.md), mas `vw_fila_revisao` e
  `vw_produtos_entregues` expõem dados a qualquer logado sem RLS — revisar se ainda são usadas.
- **Buckets sem limite**: `acervo-capas`, `pontos-mapa` (público) e `tarefas-anexos` — definir tamanho/tipos depois de
  conferir o que já existe neles.
- Pendências LGPD já listadas no CLAUDE.md (criptografia em repouso dos dados bancários etc.).

## 5. Como foi testado

- Cada Edge Function publicada foi chamada com a chave pública (o que um invasor tem) e com dados maliciosos: todas
  recusam (401/400/410). O fluxo normal da prestação pública foi conferido (gera endereço no formato aceito).
- CSP/cabeçalhos: servidor local que aplica o `vercel.json` + Chromium abrindo as 42 páginas, registrando qualquer
  violação de CSP — nenhuma. Os erros de JS que aparecem no teste (`db` antes da inicialização) já aconteciam antes das
  mudanças: o ambiente de teste não alcança o CDN.
- `escJs` testado com ida e volta (aspas, barra, quebra de linha, `<`).
- Não foi possível testar logado (sem credencial de usuário). As funções usam o mesmo auxiliar de autorização que já
  roda em produção desde 10/11 (análise de TDR).
