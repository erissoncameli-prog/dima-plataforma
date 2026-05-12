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
| `status_tdr` | `rascunho`, `revisao_interna`, `ajustes`, `enviado_unesco`, `retorno_unesco`, `aprovado`, `cancelado`, `submetido`, `pendente_correcao`, `em_avaliacao`, `em_revisao_unesco` |
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
| `status` | `status_tdr` | único aprovado = `aprovado` |
| `fornecedor_id` | uuid FK → `fornecedores.id` | |
| `valor_brl` / `valor_usd` | numeric | |
| `arquivo_url` / `arquivo_nome` | text | |
| `criado_em` / `atualizado_em` | timestamptz | |

**Relacionamento TDR ↔ Contrato**: `contratos.tdr_id → tdrs.id` (FK direta)
```sql
-- Contratos vigentes SEM TDR aprovado:
SELECT c.id, c.numero
FROM contratos c
LEFT JOIN tdrs t ON t.id = c.tdr_id
WHERE c.status = 'vigente'
  AND (c.tdr_id IS NULL OR t.status != 'aprovado')
```

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

---

## Variáveis de Ambiente (Edge Functions)

```
SUPABASE_URL                — injetado automaticamente
SUPABASE_ANON_KEY           — injetado automaticamente
SUPABASE_SERVICE_ROLE_KEY   — injetado automaticamente
ANTHROPIC_API_KEY           — configurado nos secrets do projeto
```
