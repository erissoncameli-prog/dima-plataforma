# DIMA · Plataforma de Gestão UNESCO
**Projeto 218BRA2001 · SEMA/AC · Fundo Brasil-ONU**

Este arquivo é lido automaticamente pelo Claude Code a cada sessão. Contém o schema real do banco, padrões de código e convenções do projeto — consulte antes de escrever qualquer SQL ou JS.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5 + CSS3 + JavaScript puro (sem frameworks) |
| Backend / Banco | Supabase (PostgreSQL + Auth + RLS + Edge Functions) |
| Edge Functions | Deno + TypeScript (`npm:@anthropic-ai/sdk`, `npm:@supabase/supabase-js`) |
| IA | Claude (`claude-sonnet-4-5` ou `claude-sonnet-4-6`) via Anthropic SDK |
| Hospedagem | GitHub Pages (branch `main`) |
| Project ID Supabase | `wfymnmlinonvdqfucjya` (Projeto-SEMA-UNESCO) |

---

## Fluxo de Deploy

- **Sempre** commitar e fazer `push` direto na `main` — sem branches, sem PRs
- Edge Functions: deploy via MCP `deploy_edge_function` com `project_id: wfymnmlinonvdqfucjya`
- Migrações SQL: aplicar via MCP `apply_migration`

---

## Padrões de Código Frontend

### Estrutura de página (OBRIGATÓRIO)
Todo HTML de página usa `<div id="app"></div>` e injeta conteúdo via JS:

```html
<!-- pages/exemplo.html -->
<div id="app"></div>
<script src="../js/config.js"></script>
<script src="../js/layout.js"></script>
<script src="../js/exemplo.js"></script>
```

```javascript
// js/exemplo.js — padrão IIFE
;(async function () {
  const usuario = await carregarUsuario()
  if (!usuario) { window.location.href = '../index.html'; return }

  const html = '<div class="fade-in">... conteúdo ...</div>'

  document.getElementById('app').innerHTML =
    gerarLayout('Título da Página', 'chave-nav') + html + '</div></div></div>'

  carregarLogosSidebar()
})()
```

### Helpers globais disponíveis (definidos em `config.js`)
- `db` — instância do Supabase client
- `appState` — `{ usuario, perfil, idioma }`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `toast(msg, tipo)` — tipos: `'success' | 'error' | 'warning' | 'info'`
- `esc(str)` — escapa HTML
- `formatBRL(valor)` — formata número em R$
- `carregarUsuario()` — carrega sessão e preenche `appState`

### Helpers de layout (definidos em `layout.js`)
- `gerarLayout(titulo, navId)` — retorna HTML da sidebar + topbar
- `carregarLogosSidebar()` — carrega logos/avatares após injeção no DOM
- **Sempre** fechar com `+ '</div></div></div>'` após o conteúdo

### Chamar Edge Function
```javascript
const { data: { session } } = await db.auth.getSession()
const res = await fetch(SUPABASE_URL + '/functions/v1/nome-da-funcao', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + (session?.access_token || ''),
    'apikey': SUPABASE_ANON_KEY,
  },
  body: JSON.stringify({ ... }),
})
```

### Navegação (`layout.js` — `navGroups`)
Grupos: `'Projeto'`, `'Execução'`, `'Apoio'`
Cada item: `{ id, icone, href, perfis: [...] }`
IDs usados: `dashboard`, `atividades`, `tdrs`, `contratos`, `fornecedores`, `financeiro`, `produtos`, `viagens`, `mapa`, `beneficiarios`, `auditoria`
Tradução do nav em `config.js` → objeto `nav` dentro de cada idioma.

---

## Schema do Banco de Dados

> **REGRA CRÍTICA**: Nunca assuma nomes de colunas. Use os nomes exatos abaixo.

### Enums (tipos PostgreSQL definidos no projeto)

| Enum | Valores |
|------|---------|
| `status_contrato` | `vigente`, `encerrado`, `suspenso` |
| `status_tdr` | `rascunho`, `revisao_interna`, `ajustes`, `enviado_unesco`, `retorno_unesco`, `aprovado`, `cancelado`, `submetido`, `pendente_correcao`, `em_avaliacao`, `em_revisao_unesco`, `em_licitacao`, `contratado` |
| `status_produto` | `submetido`, `em_revisao`, `aprovado_tecnico`, `aprovado_coordenacao`, `aprovado_diretoria`, `recusado` |
| `situacao_financeiro` | `pago`, `a_pagar`, `cancelado` |
| `fase_atividade` | `A_INICIAR`, `ELABORACAO`, `LICITACAO`, `ELABORADO`, `CONTRATADO`, `CONCLUIDO` |
| `perfil_usuario` | `super_admin`, `coordenacao`, `tecnico`, `financeiro`, `consultor_externo`, `visualizador` |
| `tipo_tdr` | `PF`, `PJ` |
| `tipo_produto` | `relatorio_tecnico`, `produto_fisico`, `evento_capacitacao`, `servico_executado` |
| `nivel_risco` | `muito_alto`, `alto`, `medio`, `baixo` |
| `idioma` | `pt`, `en`, `es` |

### Tabela: `contratos`
| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `numero` | varchar NOT NULL | número do contrato |
| `tdr_id` | uuid FK → `tdrs.id` | pode ser NULL |
| `fornecedor_id` | uuid FK → `fornecedores.id` | NOT NULL |
| `atividade_id` | uuid FK → `atividades.id` | pode ser NULL |
| `objeto_pt` / `objeto_en` | text | |
| `tipo` | varchar | |
| `valor_total_brl` | numeric | ⚠️ não é `valor_brl` |
| `valor_utilizado_brl` | numeric | |
| `valor_comprometido_brl` | numeric | |
| `saldo_brl` | numeric | |
| `dt_inicio` / `dt_fim` | date | |
| `status` | `status_contrato` | `vigente \| encerrado \| suspenso` |
| `criado_em` / `atualizado_em` | timestamptz | |

### Tabela: `tdrs`
| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `atividade_id` | uuid FK → `atividades.id` | NOT NULL |
| `numero` | varchar NOT NULL | |
| `tipo` | `tipo_tdr` | `PF \| PJ` |
| `status` | `status_tdr` | fluxo: …→`aprovado`→`em_licitacao`→`contratado` |
| `fornecedor_id` | uuid FK → `fornecedores.id` | |
| `valor_brl` / `valor_usd` | numeric | |
| `modalidade_licitacao` | text | preenchido na fase `em_licitacao` |
| `numero_processo` | text | nº processo licitatório (`em_licitacao`) |
| `dt_licitacao` | date | data de abertura da licitação |
| `dt_contratacao` | date | preenchido na fase `contratado` |
| `arquivo_url` / `arquivo_nome` | text | |
| `criado_em` / `atualizado_em` | timestamptz | |

**Relacionamento TDR ↔ Contrato**: `contratos.tdr_id → tdrs.id` (FK direta)
```sql
-- Contratos vigentes SEM TDR aprovado:
SELECT c.id, c.numero
FROM contratos c
LEFT JOIN tdrs t ON t.id = c.tdr_id
WHERE c.status = 'vigente'
  AND (c.tdr_id IS NULL OR t.status NOT IN ('aprovado','em_licitacao','contratado'))
```
> ⚠️ `aprovado`, `em_licitacao` e `contratado` são todas fases **pós-aprovação**. Ao filtrar "TDR aprovado", considere as três (ver `FASES_POS_APROVACAO` em `tdrs.html`).

### Tabela: `atividades`
| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `codigo` | varchar NOT NULL | ex: `AT-001` |
| `nome_pt` / `nome_en` / `nome_es` | text | |
| `fase` | `fase_atividade` | |
| `orcamento_usd` | numeric | |
| `resultado_id` | uuid FK → `resultados.id` | |
| `responsavel_id` | uuid FK → `usuarios.id` | |
| `ativo` | boolean | |
| `criado_em` / `atualizado_em` | timestamptz | |
> ⚠️ **NÃO existe** `contratos.atividades` (array). O vínculo é `contratos.atividade_id` (FK uuid).

### Tabela: `execucao_financeira`
| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `atividade_id` | uuid FK | NOT NULL |
| `contrato_id` | uuid FK → `contratos.id` | pode ser NULL |
| `fornecedor_id` | uuid FK | |
| `descricao` | text | |
| `numero_nf` | text | |
| `valor_brl` | numeric NOT NULL | |
| `valor_usd` | numeric | |
| `situacao` | `situacao_financeiro` | `pago \| a_pagar \| cancelado` |
| `comprovante_url` | text | |
| `dt_vencimento` / `dt_pagamento` | date | |
| `criado_em` / `atualizado_em` | timestamptz | |

### Tabela: `fornecedores`
| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `codigo_interno` | integer serial | ⚠️ não é `codigo` |
| `nome` | text NOT NULL | ⚠️ não é `nome_razao_social` |
| `tipo` | varchar | `PF` ou `PJ` |
| `cpf_cnpj` | varchar | |
| `ativo` | boolean | |
> ⚠️ **NÃO existe** `status_homologacao` nem `nome_razao_social` nesta tabela.

### Tabela: `contratos_produtos`
| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `contrato_id` | uuid FK → `contratos.id` | NOT NULL |
| `numero_produto` | integer | |
| `descricao` | text NOT NULL | |
| `valor_brl` | numeric | |
| `situacao` | text | `pendente \| ...` |
| `arquivo_entrega_url` | text | |
| `pct_aprovado` | numeric | |
| `valor_aprovado` | numeric | |
> ⚠️ Tabela de produtos de contrato é `contratos_produtos`, **não** `produtos_entregas`.
> Tabela separada `produtos_entregues` existe mas é diferente (produtos entregues finais).

### Tabela: `viagem_protocolos`
| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `numero` | varchar | |
| `objetivo` | text NOT NULL | ⚠️ não é `motivo` |
| `destino_principal` | varchar | ⚠️ não é `destino` |
| `dt_saida` / `dt_retorno` | date | ⚠️ não é `data_inicio/data_fim` |
| `situacao` | varchar | `solicitado \| aprovado \| rejeitado \| concluido \| cancelado` |
| `atividade_id` | uuid FK | |
| `criado_em` / `atualizado_em` | timestamptz | |

### Saldo por atividade e liberação de economia (⚠️ ler antes de mexer em saldo)

**`vw_saldo_atividade` é a fonte da verdade do saldo** (dashboard/Visão Geral). Fórmula:
```
saldo_livre_usd = orcamento_usd
                − Σ(tdrs.valor_usd de TDRs não-cancelados)      -- COMPROMETIDO = valor PLANEJADO do TDR
                + Σ(contrato_encerramentos.valor_liberado_usd)  -- só linhas com status='ativo'
```
> ⚠️ Comprometido usa o valor **planejado** do TDR, **não** o valor do contrato. A economia entre planejado e contratado fica **reservada por padrão** até ser liberada.

**`contrato_encerramentos`** — tabela-razão única de liberação de saldo (imutável; estorno = mudança de status, nunca DELETE):
| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `contrato_id` | uuid FK → `contratos.id` | NOT NULL |
| `tdr_id` | uuid FK → `tdrs.id` | preenchido só em `economia_contratacao` |
| `atividade_id` | uuid FK | |
| `tipo` | text | `encerramento_contrato \| economia_contratacao` |
| `valor_liberado_brl` / `valor_liberado_usd` | numeric | |
| `motivo` | text NOT NULL | |
| `produtos_afetados` | jsonb NOT NULL | `[]` quando não há produtos |
| `status` | text | `ativo \| revertido` (a view só soma `ativo`) |
| `autorizado_por` / `revertido_por` | uuid FK → `usuarios.id` | |
| `criado_em` / `revertido_em` | timestamptz | |

- **`encerramento_contrato`**: encerra contrato com produtos pendentes, cancela produtos, libera o não-executado. UI: `pages/contratos.html` → `confirmarEncerramento()` (insert direto via client).
- **`economia_contratacao`**: libera a economia planejado−firmado de um TDR contratado. UI: aba Financeiro do modal em `pages/tdrs.html` → `painelEconomiaTDR`. Usa RPCs (restritas a `super_admin`/`coordenacao`):
  - `fn_liberar_economia_tdr(p_tdr_id uuid, p_justificativa text, p_taxa numeric)` — calcula economia = `tdrs.valor_brl − Σ contratos.valor_total_brl`, grava a liberação e loga em `tdr_acoes`.
  - `fn_estornar_economia_tdr(p_encerramento_id uuid, p_motivo text)` — marca `status='revertido'` (só `tipo='economia_contratacao'`).
- O relatório A4 `js/relatorio-saldo-atividade.js` espelha a view; é alimentado por `pages/relatorios.html` e `pages/dashboard.html`, que embedam `encerramentos:contrato_encerramentos(...)` na atividade.

### Tabela: `produto_matriz_contribuicao`
| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `produto_id` | uuid FK | NOT NULL |
| `matriz_item_id` | uuid FK → `matriz_itens.id` | NOT NULL |
| `valor` | numeric NOT NULL | |
| `status` | text | `pendente \| confirmado \| ...` |
| `confirmado_por` | uuid FK | |

### Tabela: `matriz_itens`
| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `produto_codigo` | text | |
| `produto_titulo` | text | |
| `indicador` | text | |
| `meta_numerica` | numeric | |
| `ativo` | boolean | |

### Tabela: `usuarios`
| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK (= auth.uid()) | |
| `nome_completo` | text NOT NULL | |
| `email` | text NOT NULL | |
| `perfil` | `perfil_usuario` | |
| `ativo` | boolean | |

### Tabelas de Auditoria IA
```
auditoria_execucoes   — registro de cada rodada do auditor
auditoria_registros   — achados individuais (vinculados a execucao_id)
```
- `auditoria_registros.dominio`: `tdr_contrato | financeiro | produtos | viagens | matriz | qualidade_dados`
- `auditoria_registros.severidade`: `critico | alto | medio | baixo | info`
- `auditoria_registros.status`: `aberto | em_analise | resolvido | ignorado`

---

## Edge Functions Ativas

| Slug | Propósito | `verify_jwt` |
|------|-----------|-------------|
| `auditor-ia` | Auditoria automática em 6 domínios + supervisor Claude | ✅ |
| `chat-auditor` | Chat interativo sobre achados de auditoria (stateful) | ✅ |
| `analisar-tdr` | Análise IA de TDR submetido | ❌ |
| `corrigir-tdr` | Correção automática de TDR | ❌ |
| `sugerir-correcoes-tdr` | Sugestões de melhoria de TDR | ❌ |
| `traduzir-contrato` | Tradução de contrato PT→EN | ❌ |
| `enviar-email-viagem` | Notificação de viagem aprovada | ✅ |
| `enviar-email-produto` | Notificação de produto aprovado/recusado | ✅ |
| `notificar-unesco-conclusao` | Notificação UNESCO de conclusão | ✅ |
| `prestacao-publica` | Prestação de contas pública (sem auth) | ❌ |
| `dynamic-endpoint` | Endpoint genérico com roteamento | ✅ |
| `cron-prestacao` | Cron de prestação de contas | ✅ |
| `fetch-link-metadata` | Metadados de links externos | ✅ |

---

## RLS — Perfis e Permissões

| Módulo | Permissão mínima |
|--------|-----------------|
| Auditoria IA | `super_admin`, `coordenacao` |
| Contratos (editar) | `super_admin`, `coordenacao` |
| TDRs (aprovar) | `super_admin`, `coordenacao` |
| Financeiro (editar) | `super_admin`, `coordenacao`, `financeiro` |
| Visualização geral | todos os perfis ativos |

---

## Privacidade e LGPD (⚠️ ler antes de mexer em RLS, grants ou dado pessoal)

### Superfície anônima — allowlist fechada

O papel `anon` usa a chave embarcada em `js/config.js`, que é **pública**. Desde
`20260727_lgpd_c0_01`, o `anon` tem acesso a **exatamente 3 tabelas**, somente
leitura, nenhuma com dado pessoal:

| Tabela | Por quê |
|--------|---------|
| `configuracoes_sistema` | branding do projeto (`publico.html`, `index.html`) |
| `geometria_fotos` | fotos das geometrias do mapa público |
| `trilha_metadata` | vídeos de trilhas do mapa público |

**Regras invioláveis:**
- **Nunca** conceder `GRANT` ao `anon` para expor dado no portal público. Use uma
  função `SECURITY DEFINER` (padrão `fn_publico_*`) que devolve só o necessário.
- `ALTER DEFAULT PRIVILEGES` já revoga tudo do `anon` — tabelas novas nascem
  fechadas. Não desfazer.
- Policy `TO public` inclui o `anon`. Ao criar policy para usuário logado,
  escrever sempre `TO authenticated`.

### Policies permissivas somam-se por OR

Uma policy `USING (true)` **anula** todas as outras policies restritivas da mesma
tabela e comando. Foi assim que `usuarios_update` permitiu que qualquer
autenticado se promovesse a `super_admin`. Ao adicionar policy, verificar se já
não existe uma sem predicado:

```sql
select tablename, policyname, cmd, roles::text, qual
from pg_policies where schemaname='public' and qual = 'true';
```

`public.usuarios` ainda tem `usuarios_select USING (true)` — mantida
deliberadamente porque 6 pontos do frontend fazem `select('*')` para montar
listas de responsáveis. Substituir por view de diretório está previsto (Camada 1).

### Dado pessoal por tabela

| Tabela | Dado pessoal | Cuidado |
|--------|--------------|---------|
| `beneficiarios` | CPF, nascimento, passaporte, **dados bancários** (banco/agência/conta/PIX/IBAN) | policy atual é só `authenticated` — todo perfil lê. Segregar por perfil na Camada 1 |
| `fornecedores` | CPF/CNPJ, endereço, dados bancários | PF é dado pessoal |
| `viagem_viajantes` | CPF, e-mail, cartões de embarque | `viaj_sel` (`auth.uid() is not null`) anula a policy restritiva |
| `car_dados_locais` | nome de proprietário rural (53.594 linhas) | CPF **removido** — ver abaixo |
| `usuarios` | e-mail, telefone | `perfil`/`ativo` protegidos por trigger |
| `audit_log` | IP, user-agent, snapshots jsonb | tabela existe mas **não é populada** |

### `car_dados_locais.cpf_cnpj` foi removida

A coluna não existe mais. Use **`cpf_cnpj_mascara`** (text), que guarda só os 2
últimos dígitos (`***.***.***-89`) de forma irreversível. Copropriedades trazem
vários documentos separados por vírgula. Em qualquer reimportação do SICAR,
passar o valor por `fn_mascara_doc(text)` antes de gravar — **nunca** persistir
CPF do CAR em texto puro.

Não há mascaramento no cliente: `_mascaraCpfCnpj()` foi removida de `mapa.html`.
Exiba `cpf_cnpj_mascara` diretamente.

### Base legal do projeto

SEMA/AC é a **controladora**; a plataforma trata dado pessoal com fundamento no
art. 7º, III (execução de políticas públicas) e art. 7º, V (execução de contrato,
para fornecedores e consultores PF) — **não em consentimento**. Não construir
fluxo que dependa de consentimento revogável para dado necessário à prestação de
contas do projeto.

### Storage — buckets privados e URLs assinadas

| Bucket | Visibilidade | Conteúdo |
|--------|--------------|----------|
| `tdrs-arquivos` | 🔒 privado | TDRs (dados de consultores PF) |
| `contratos-docs` | 🔒 privado | contratos |
| `financeiro-docs` | 🔒 privado | NFs, comprovantes bancários |
| `entregas-docs` | 🔒 privado | documentos de entrega |
| `viagens-arquivos` | 🔒 privado | cartões de embarque (nome, CPF, itinerário) |
| `produtos-evidencias` | 🔒 privado | evidências de produtos |
| `plataforma-assets` | 🌐 público | logos institucionais (usados em e-mails) |
| `pontos-mapa` | 🌐 público | fotos exibidas em `publico.html` |
| `avatares` | 🌐 público | foto de perfil (caminho por uuid) |

**As tabelas continuam guardando a URL no formato `/object/public/<bucket>/<path>`.**
Isso é intencional: a string é apenas **portadora do caminho**, não um link
acessível. Não migrar esses valores. `getPublicUrl()` no upload segue correto.

**Toda leitura precisa ser assinada.** Helpers globais em `js/config.js`:

| Helper | Uso |
|--------|-----|
| `<a href="#" data-arquivo="${esc(url)}">` | link/botão — delegação global, funciona com HTML injetado |
| `<img data-arquivo-src="${esc(url)}">` | imagem — chamar `assinarImagens(container)` após injetar |
| `await abrirDoc(url)` | abrir em nova aba via JS |
| `await urlAssinada(url)` | obter a URL assinada (ex.: antes de `fetch`) |

- ⚠️ **Nunca** usar `href="${url}"` direto nem `window.open(url)` para bucket
  privado — retorna 400. Use os helpers.
- `abrirDoc()` abre a janela **antes** do `await` de propósito: abrir depois de
  um `await` é bloqueado como popup.
- Não criar novo signer ad-hoc: as 8 implementações duplicadas que existiam
  foram consolidadas nesses helpers.

**Nas Edge Functions**, baixar com `supabase.storage.from(b).download(p)` usando
o client **service_role** — `fetch()` na URL pública retorna 400. Já aplicado em
`analisar-tdr`, `sugerir-correcoes-tdr` e `enviar-email-produto`. O fluxo sem
login de `prestacao-publica` usa `createSignedUploadUrl` e não foi afetado.

### Pendências conhecidas (Camadas 2–4, ainda não implementadas)

`audit_log` inativo (não é populado), dados bancários de `beneficiarios` sem
criptografia e sem segregação por perfil, sem redação de CPF antes do envio de
TDR à Anthropic, e nenhum documento produzido — Política de Privacidade, Termos
de Uso, ROPA, RIPD e designação do Encarregado.

---

## Armadilhas Conhecidas (erros passados)

1. `contratos.atividades` **não existe** — use `contratos.atividade_id` (uuid FK)
2. `contratos.valor_brl` **não existe** — use `contratos.valor_total_brl`
3. `fornecedores.nome_razao_social` **não existe** — use `fornecedores.nome`
4. `fornecedores.codigo` **não existe** — use `fornecedores.codigo_interno`
5. `fornecedores.status_homologacao` **não existe**
6. `viagem_protocolos.destino` **não existe** — use `destino_principal`
7. `viagem_protocolos.data_fim` / `data_inicio` **não existem** — use `dt_retorno` / `dt_saida`
8. `viagem_protocolos.motivo` **não existe** — use `objetivo`
9. `produtos_entregas` **não existe** — use `contratos_produtos`
10. TDR único status aprovado = `'aprovado'` (não `'aprovado_coordenacao'` nem `'aprovado_diretoria'`)
11. Modal HTML deve ficar **fora do `#app`** para evitar z-index conflito com sidebar
12. Sempre fechar `gerarLayout()` com `+ '</div></div></div>'`
13. `tdr_acoes` tem RULE `tdr_acoes_no_delete` (log de auditoria imutável, `ON DELETE DO INSTEAD NOTHING`). Um `DELETE FROM tdrs` direto falha com "referential integrity query... gave unexpected result" por causa disso. Exclusão de TDR **deve** usar a função RPC `apagar_tdr(p_tdr_id uuid)` (restrita a `super_admin`), que desabilita a regra internamente, apaga registros filhos e reabilita a regra — nunca apagar `tdrs`/`tdr_acoes` manualmente via client.
14. **Liberação de saldo/economia**: NÃO criar tabela nova. `contrato_encerramentos` + `vw_saldo_atividade` já são o mecanismo único (ver seção "Saldo por atividade e liberação de economia"). Comprometido = valor **planejado** do TDR, não o do contrato; economia é liberada via `fn_liberar_economia_tdr` (tipo `economia_contratacao`). Qualquer novo cálculo de saldo deve espelhar `vw_saldo_atividade`, senão dashboard e relatório divergem.
15. `car_dados_locais.cpf_cnpj` **não existe mais** — use `cpf_cnpj_mascara` (ver seção "Privacidade e LGPD")
16. `_mascaraCpfCnpj()` **não existe mais** em `mapa.html` — o dado já vem mascarado do banco
17. **Nunca** conceder `GRANT` ao papel `anon`. Para expor dado no portal público, criar função `SECURITY DEFINER` no padrão `fn_publico_*`
18. Policy com `USING (true)` **anula** as policies restritivas da mesma tabela/comando (somam-se por OR). Ao criar policy para usuário logado, usar sempre `TO authenticated`, nunca `TO public` — `public` inclui o `anon`
19. Buckets de documentos são **privados** — `href="${url}"` e `window.open(url)` retornam 400. Use `data-arquivo` / `abrirDoc()` / `urlAssinada()` (ver seção "Storage")
20. Em Edge Function, ler arquivo com `storage.download()` via service_role — `fetch()` na URL pública falha

---

## Variáveis de Ambiente (Edge Functions)

```
SUPABASE_URL                — injetado automaticamente
SUPABASE_ANON_KEY           — injetado automaticamente
SUPABASE_SERVICE_ROLE_KEY   — injetado automaticamente
ANTHROPIC_API_KEY           — configurado nos secrets do projeto
```
