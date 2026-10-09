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
| Hospedagem | Vercel (deploy a partir da branch `main`) |
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
IDs usados: `dashboard`, `atividades`, `tdrs`, `remanejamentos`, `contratos`, `fornecedores`, `financeiro`, `produtos`, `acervo`, `diagnostico`, `viagens`, `mapa`, `beneficiarios`, `auditoria`, `pulso`
Tradução do nav em `config.js` → objeto `nav` dentro de cada idioma.

---

## Schema do Banco de Dados

> **REGRA CRÍTICA**: Nunca assuma nomes de colunas. Use os nomes exatos abaixo.

### Enums (tipos PostgreSQL definidos no projeto)

| Enum | Valores |
|------|---------|
| `status_contrato` | `vigente`, `encerrado`, `suspenso`, `aguardando_cobertura` (só o sistema põe/tira), `cancelado` (terminal) |
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
                − Σ(contrato_coberturas.delta_usd)              -- + contrato ACIMA do TDR (rem_08, coluna excedente_contrato_usd)
                + Σ(contrato_encerramentos.valor_liberado_usd)  -- só linhas com status='ativo'
```
> ⚠️ Comprometido usa o valor **planejado** do TDR, **não** o valor do contrato — salvo o que o contrato passar do
> TDR, que entra como excedente (`comprometido_usd` = TDRs + excedente). A economia entre planejado e contratado
> fica **reservada por padrão** até ser liberada. Painel e razão (`vw_orcamento_atividade.saldo_usd`) dão o mesmo
> saldo; só divergem por execução direta acima da reserva ou pagamento de contrato sem TDR (conferido em
> `fn_conferir_orcamento`). A view não é auto-atualizável (join lateral) e só tem SELECT.

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

### Razão orçamentário e remanejamento (⚠️ ler antes de mexer em orçamento)

Especificação completa: `docs/remanejamento/plano.md`. Fases 0–7 em produção (03/10/2026: razão, PTAX, cadeia, cobertura, estorno, relatórios e auditor);
tela em `pages/remanejamentos.html` + `js/remanejamentos.js` (nav `remanejamentos`, grupo Planejamento, todos os
perfis — signatários podem ter qualquer perfil). Plano completo implementado.
- **Tela**: abas Saldos por resultado (procedência por fonte), Pedidos (fila "aguardando minha análise"),
  Novo pedido (coordenação/super_admin; escolhe as fontes que cedem) e Signatários (super_admin designa).
  A tela não decide nada: assinar = `fetch` à Edge Function com a senha; a fila "minha vez" é só exibição.
  Aba **Como funciona** + botões **"?"** (`js/remanejamentos-ajuda.js`: `REM_AJUDA` verbetes, `remQ('chave')` botão,
  `remGuiaHTML()` guia + perguntas frequentes). Regra mudou no banco ⇒ atualizar o texto do guia junto.

- **`atividades.orcamento_usd` é cache** de Σ `orcamento_fontes` orçamentárias. UPDATE direto é
  recusado para todos, inclusive super_admin (`trg_atividade_guarda_orcamento`, `ORCAMENTO_PROTEGIDO`).
  Só o razão grava (chave `dima.razao_orcamento` + `pg_trigger_depth() > 1`). `orcamento_original_usd`
  = dotação congelada. Nunca reabrir o campo no modal de `atividades.html`.
- **`orcamento_fontes`** (imutável): crédito = linha sem `ajusta_fonte_id` (dotacao_original,
  revisao_orcamentaria, economia_contratacao, encerramento_contrato, remanejamento_recebido);
  ajuste/estorno/cessão aponta para o crédito. Correção = estorno, nunca UPDATE/DELETE. Escrita só por
  função SECURITY DEFINER (sem policy de escrita para o cliente — não criar).
- `contrato_encerramentos` entra no razão por trigger; valores imutáveis, sem DELETE, `revertido` não volta.
  **US$ da liberação = R$ ÷ PTAX do dia**, calculado no banco (`trg_encerramento_ptax`, rem_09) para economia e
  encerramento feitos por usuário; o USD enviado pela tela é ignorado; `cotacao`/`cotacao_data` gravadas.
  `p_taxa` de `fn_liberar_economia_tdr` ficou sem efeito (a tela manda `null`).
- **Débito** (`vw_orcamento_debitos`) = TDRs não cancelados + max(reserva de TDRs `execucao_direta`,
  despesas sem contrato) + pagamentos de contrato sem TDR. Viagens (diárias/passagens) são execução
  direta UNESCO: consomem o TDR guarda-chuva (2.1.7-001/002), não são débito extra.
- **Procedência**: `vw_orcamento_fontes_saldo` aplica PEPS (dotação primeiro, depois por `criado_em`) e
  dá o disponível de cada fonte. Resumo em `vw_orcamento_atividade`. `orcamento_eventos` = extrato de TDR.
- `fn_conferir_orcamento()` (super_admin/coordenação/financeiro): toda linha não `info_*` deve ter `ok`.
- Views de saldo são **somente leitura**: `vw_saldo_atividade` tinha GRANT de escrita e, por ser
  auto-atualizável com dono postgres, deixava qualquer logado alterar atividade ignorando RLS.
- **Cotação oficial = PTAX** em `cotacoes_ptax` (imutável, 1 linha por dia útil desde 02/01/2025),
  gravada só pela Edge Function `cotacao-ptax` (cron `cotacao-ptax-diaria`, dias úteis 17:20/22:20 UTC).
  Consultar com `fn_cotacao_usd(data)`: devolve a PTAX da data ou do último dia útil e a data usada;
  erro `COTACAO_DESATUALIZADA` se a última tiver mais de 7 dias (cron parado).
  ⚠️ **`cotacoes_usd` é outra tabela** (AwesomeAPI, cotação de referência gravada pelo financeiro e lida
  por viagens/dashboard/relatórios) — não serve para converter contrato e não deve ser alterada pelo razão.
- **Pedido de remanejamento** (`remanejamentos` → `remanejamento_itens` (− origem/+ destino, Σ = 0) →
  `remanejamento_alocacoes` (de QUAL fonte sai cada centavo)). Rascunho só por `fn_rem_salvar` (coordenação);
  tudo o mais por `fn_rem_assinar`, que **só tem EXECUTE para service_role** e é chamada pela Edge Function
  `assinar-remanejamento` depois de **reconfirmar a senha de login no servidor** (5 erros/30 min ⇒ bloqueio).
  Nunca dar EXECUTE de `fn_rem_assinar` a `authenticated` nem verificar senha no navegador.
- **Cadeia sequencial por pessoa, sem substituto**: 1 titular `coordenacao_solicitante` → 2 responsável
  (`atividade_responsaveis.papel='responsavel'`, não substituto) de cada origem → 3 `unesco_financeiro` →
  4 `diretor` → 5 `secretario` ⇒ efetiva. Titulares em `rem_cargo_titulares` (vigência + ato; um por cargo,
  uma pessoa por cargo), designados só por `fn_rem_designar_titular` (super_admin). Aprovar avisa SÓ o próximo;
  devolver volta UMA etapa, reabre a assinatura dela e avisa SÓ o anterior; só o solicitante edita (nova
  versão invalida todas as assinaturas). Mesma pessoa não aprova duas etapas (exceto liberar 2 origens).
- Assinatura grava o `fn_rem_hash` (SHA-256 do pedido) que a pessoa viu; documento mudou ⇒ `DOCUMENTO_ALTERADO`.
  Pedido em aprovação **reserva** as fontes (`vw_orcamento_fontes_saldo.reservado_usd/livre_usd`); efetivação
  revalida sob `FOR UPDATE` e lança `remanejamento_cedido` (−) e `remanejamento_recebido` (+, `fonte_origem_id`).
  Assinaturas/etapas/histórico imutáveis; pedido não se apaga (cancelar). `vw_remanejamento_assinaturas` = sem IP.
- **Rascunho nunca apaga**: `fn_rem_salvar` marca o que sai com `remanejamento_itens/alocacoes.ativo = false`
  e reativa o que volta (`on conflict do update`). **Toda leitura de itens/alocações filtra `ativo`** (hash,
  reservas, validação, efetivação, cadeia, conferência, e-mail, tela) — consulta nova sem o filtro soma lixo.
- E-mails: fila `remanejamento_notificacoes`, enviada pela Edge Function (Gmail SMTP) e reenviada pelo cron
  `remanejamento-emails` (15 min). Sino com tipos `remanejamento_*` depende da `rem_03g` (troca o check de
  `notificacoes`, exige DROP CONSTRAINT → SQL Editor); sem ela só o sino fica mudo, o e-mail sai.
- **TDR compromete, contrato deriva do TDR** (fase 5, `rem_05*`): `trg_tdr_saldo` (`fn_trg_verificar_saldo`)
  só deixa TDR nascer/aumentar até o **saldo livre com sinal** `fn_cob_livre()` = créditos − débitos − reservas
  (inclui rascunho, excedente de contrato, execução direta). TDR com contrato ativo não cancela nem muda de atividade.
- **Excedente de contrato** = Σ contratos do TDR (R$, não cancelados) − `tdrs.valor_brl`; sem TDR, o contrato inteiro.
  Vira USD pela PTAX do dia (`fn_cotacao_usd`), congelado em `contrato_coberturas` (razão imutável; Σ `delta_usd`
  entra em `vw_orcamento_debitos.contratos_excedente_usd`). Escrita só pelos triggers de `contratos`/`tdrs`.
- **Trava**: excedente que não cabe no livre ⇒ `contratos.status = 'aguardando_cobertura'` (guarda o anterior em
  `status_antes_cobertura`). Travado recusa produto (`contratos_produtos`), lançamento (`execucao_financeira`),
  PDF assinado e qualquer status além de cancelar; reduzir valor pode. Libera sozinho (`fn_cob_reavaliar`, em ordem
  de chegada) a cada crédito no razão, redução/cancelamento de contrato, TDR reduzido ou reserva liberada. Negativo
  antigo não é regularizado: `piso_usd` = livre antes do 1º contrato da fila. Liberado ⇒ pedido de cobertura aberto
  é cancelado sozinho. Pedido `tipo='cobertura_contrato'` (`fn_rem_salvar` com `contrato_id`) tem destino = atividade
  do contrato. Nunca mudar `status` para/de `aguardando_cobertura` por fora (só com `dima.cobertura='liberar'`).
  **Aviso** (rem_11): travar/liberar avisa coordenação + responsáveis da atividade + quem cadastrou, por sino
  (`contrato_travado`/`contrato_liberado`, check trocado na rem_11b) e e-mail (fila `cobertura_notificacoes`,
  drenada pela `assinar-remanejamento` v3 no `drenar`, no fim de cada assinatura e pela tela de Contratos ao travar).
- **Estorno de remanejamento** (`rem_06`): pedido novo com `remanejamentos.estorno_de` → original (o `tipo` segue
  `livre`; mudar o check exigiria DROP). Nasce só por `fn_rem_criar_estorno(p_rem, p_justificativa)` (coordenação,
  idempotente) como espelho: itens invertidos, alocações = as fontes `remanejamento_recebido` do original, inteiras.
  Itens não se editam (só justificativa). Mesma cadeia (`fn_rem_assinar` sem mudança; liberação = responsáveis de
  quem devolve). `fn_rem_validar_estorno` exige original `efetivado`, recebidos sem ajuste posterior e livres
  (destino que gastou/repassou não estorna). Efetivar (`fn_rem_efetivar_estorno`) espelha cada lançamento com
  `orcamento_fontes.estorno_de` (cedido volta à MESMA fonte de origem) e marca o original `estornado`. Estorno de
  estorno não existe: desfazer = remanejamento novo.
- **Relatórios (fase 7, `rem_07`)**: `js/relatorio-remanejamento.js` — `relAbrirPedidoA4` (itens, procedência,
  cadeia com nome/cargo/data/SHA-256, histórico) pelo botão "Relatório A4" do pedido; `relAbrirExtratoA4(atividade)`
  ("Extrato (A4)" nas fontes da atividade) desenha `fn_orcamento_extrato(uuid)` (jsonb: créditos com procedência,
  débitos de hoje, fontes PEPS, remanejamentos, eventos de TDR; campo `fecha` = Σ créditos − Σ débitos = saldo do
  razão). O relatório A4 de saldo mostra "original · ±remanejado" quando `orcamento_original_usd` ≠ vigente.
- **Auditor** (`auditor-ia` v19): agente de orçamento lê `fn_auditoria_orcamento()` (service_role) — falha de
  `fn_conferir_orcamento`/`vw_rem_conferencia` (crítico, a IA não rebaixa), contrato travado, pedido parado,
  cargo sem titular, PTAX parada, e-mail sem envio, déficit (info), TDR sem USD. Grava como domínio `financeiro`
  com título "Orçamento: …" (o check de `auditoria_registros.dominio` não tem `orcamento`). Regra nova de
  auditoria do orçamento entra na função SQL, não no TypeScript.
- **Painel × razão** (`rem_08`): `vw_saldo_atividade` desconta o excedente de contrato como o razão. O painel da
  Visão Geral conta o excedente como **firmado**; `js/relatorio-saldo-atividade.js` recebe `excedente_contrato_usd`
  por atividade (dashboard e `relatorios.html` leem da view) e mostra a linha "Contrato acima do valor do TDR".
- `apply_migration` com `DELETE`/`DROP`/`TRUNCATE` no texto (até dentro de corpo de função) fica esperando uma
  confirmação que não chega à sessão e expira. Preferir desenho sem apagar (flag `ativo`, `create or replace`,
  policy condicional); o que exigir DROP vai num `*_sql_editor.sql` para colar no SQL Editor.
- Testes locais: `supabase/tests/remanejamento/rodar.sh`.
- Migração com `DROP` trava o `apply_migration` (pede confirmação). Use `create or replace trigger`
  e policy condicional (`if not exists … pg_policies`).

### Acervo Digital — biblioteca virtual (⚠️ ler antes de mexer em produtos/arquivos)

`pages/acervo.html` + `js/acervo.js` são a **guia de consulta** do acervo: catálogo
visual (estante/grade), busca sem acento, filtros facetados e visualizador embutido.
É camada **somente leitura** — toda escrita continua em `pages/produtos.html`.

Fonte de dados: duas views com `security_invoker = true`
(migração `20260816_acervo_biblioteca.sql`). **Não criar tabela de acervo** — o
catálogo é derivado, nunca copiado.

| View | Grão | Observação |
|------|------|-----------|
| `vw_acervo_entrega_ref` | 1 linha por produto | a entrega que **vale** hoje |
| `vw_acervo_obras` | 1 linha por `contratos_produtos` | inclui produtos sem arquivo (`total_midias = 0`) |
| `vw_acervo_midias` | 1 linha por **arquivo** | UNION de 5 origens (ver abaixo) |

#### Edição de referência (⚠️ nunca reimplementar no frontend)

Produto devolvido e reentregue tem **duas versões do mesmo arquivo**. A regra de
qual vale mora na view, para que biblioteca, relatórios e auditoria não divirjam:

- **Entrega de referência** (`vw_acervo_entrega_ref`) = a entrega `aprovada` de
  maior `numero_entrega`; se nenhuma foi aprovada, a última submetida.
- `vw_acervo_midias.versao_status` ∈ `vigente | superada | instrucao`
  - `vigente` — arquivos da entrega de referência; é "o produto"
  - `superada` — versões anteriores; só no histórico recolhido da ficha
  - `instrucao` — Nota Técnica, Comprovante de Pagamento, Contrato/Aditivo:
    artefato administrativo, nunca o entregável
- `vw_acervo_obras.situacao_acervo` ∈ `aprovado | em_correcao | em_avaliacao | sem_entrega`

> ⚠️ **Nota Fiscal e Declaração/Atestado são `produto`, não `instrucao`** — em
> contrato de fornecimento (coffee-break, bens) não existe relatório técnico e a
> NF é a própria evidência da entrega. Mudar isso zera o acervo desses contratos.

> ⚠️ Prateleiras e ícone da capa usam `rotulos_vigentes`/`tipos_midia` (só a
> edição vigente). O filtro por categoria usa `rotulos_midia` (todos os rótulos,
> menos "Nota Técnica"). Contagem do card = `total_vigentes`.

**Fora da tela do acervo** (09/10/2026): a **Nota Técnica** (`origem = 'nota_tecnica'`) não é
carregada (`.neq('origem','nota_tecnica')`, rótulo tirado de `_rotulos`) — consulta só em Produtos;
e o **valor do produto** não é exibido. As views seguem com esses dados (outros usos).

#### Portal público — marcação por arquivo (migração `20261009_acervo_publicacao.sql`)

O portal público do acervo **ainda não existe**; quando existir, mostra **só** os
arquivos marcados. A marcação já está na ficha da obra.
- **Só super_admin ativo** marca/desmarca, arquivo a arquivo, pela RPC
  `fn_acervo_definir_publico(p_midia_id text, p_publico boolean)` (SECURITY DEFINER).
  Tabela `acervo_publicacoes` (1 linha por `midia_id`, `publico`, quem/quando marcou e
  desmarcou; `fn_trg_audit`) **sem policy nem grant de escrita** — não criar.
  Desmarcar = `publico = false`, a linha fica.
- Só entra arquivo **vigente** de classe `produto` de produto **aprovado** — Nota Técnica,
  comprovante, contrato e versão devolvida são recusados no banco.
- `vw_acervo_publicacoes.valida` = marcado **e** ainda vigente/aprovado. Produto reentregue ⇒
  a marcação antiga perde efeito sozinha (a ficha mostra "Público (sem efeito)"). **A futura
  página pública lê só `where valida`**, por `fn_publico_*` ou Edge Function (nunca GRANT ao
  `anon`; arquivos em bucket privado ⇒ URL assinada curta, sem copiar para bucket público).
- Autoria (nome do consultor/fornecedor) **será exibida** no portal; valor e Nota Técnica não.
  Ao criar o portal, registrar o tratamento em `lgpd_tratamentos` (ROPA).

Existe caso real de produto **aprovado com `total_vigentes = 0`** (a entrega
aprovada não teve arquivo anexado). A ficha sinaliza a lacuna em vez de escondê-la
— não "consertar" promovendo a versão devolvida a vigente.

#### Capa a partir da 1ª página do PDF

`js/acervo-capas.js` renderiza a página 1 com **pdf.js** e guarda a miniatura
(~400px, JPEG, ~8 KB) para todos. Geração híbrida: o primeiro usuário que rolar
o pôster até a tela gera; os demais só baixam. Não há renderização no servidor
(Deno não tem canvas) nem job de backfill — o acervo se completa navegando.

- Bucket **`acervo-capas` é privado**. A página 1 de produto de consultor PF
  traz nome e às vezes CPF; miniatura em bucket aberto desfaria a migração
  `20260727_lgpd_c1_01`. Exibição sempre via `urlAssinada()`.
- Tabela `acervo_capas` (PK `midia_id`): `status='falha'` marca PDF ilegível
  para **não** ser retentado a cada visita.
- A view entrega `capa_midia_id` (o que renderizar, só PDF **vigente**) e
  `capa_url` (se já foi feito) — o frontend não precisa de consulta extra.
- Fallback é o pôster degradê determinístico; nada quebra se o pdf.js ou o CDN
  não carregarem.
- Com capa, título/número/ícone sobrepostos são ocultados (`.com-capa`) — a
  página já traz o título; o do card fica no rodapé.

As 5 origens de arquivo unificadas por `vw_acervo_midias`:
`entrega_documentos` · `contratos_produtos_entregas.arquivo_url` ·
`.nota_tecnica_url` · `unnest(.fotos_urls)` · `contratos_produtos.arquivo_entrega_url` (legado).
Ao criar nova origem de arquivo de produto, **acrescentar um `UNION ALL` na view**,
senão o arquivo não entra no acervo.

- Visibilidade **não** tem policy própria: a view faz `join contratos`, então
  `contratos_select` decide quem vê o quê (perfis + responsável pela atividade).
  Nunca trocar por `security_definer` — vazaria contrato de outra atividade.
- Classificação de mídia vem de `fn_acervo_tipo_midia(nome, url)` →
  `documento | planilha | apresentacao | imagem | video | audio | pacote | outro`.
  Novas extensões entram nessa função, não no JS.
- Busca/filtro/ordenação são **em memória** (o acervo cabe em 2 consultas). Acima de
  ~5k obras, mover para o servidor.
- Buckets privados: o visualizador assina com `urlAssinada()` antes de popular
  `iframe`/`video`/`img`. Nunca atribuir `arquivo_url` direto.

### Diagnóstico Socioambiental — app de campo (⚠️ ler antes de mexer em `diag_*`)

Plano completo em `docs/diagnostico/plano.md`; inventário do questionário em
`docs/diagnostico/instrumento-v1.md`; RIPD (rascunho) em `docs/diagnostico/ripd-rascunho.md`.

- **O questionário é dado**, não código: `diag_questionarios.estrutura` (jsonb
  versionado). Versão `publicado` é **imutável** (trigger); correção = nova versão.
  Hash SHA-256 gerado prova qual versão foi aplicada.
- **Interpretador em dois lugares, idênticos**: SQL (`fn_diag_aplicaveis`,
  `fn_diag_normalizar_respostas`, `fn_diag_calcular_alertas`, `fn_diag_derivar`)
  e JS (`js/diag-regras.js`). Operador de salto novo ou regra nova entra nos
  DOIS e passa em `supabase/tests/diagnostico/rodar.sh` (teste cruzado).
- Valores especiais em `respostas`: `"_nr"` = Não respondeu; chave ausente = não
  se aplica ou em branco; `<chave>_outro` = especifique.
- **Escrita só pela RPC** `diag_enviar_ficha` (SECURITY DEFINER, idempotente por
  `uuid_cliente`, ficha+moradores+identificação+fotos numa transação) e
  `diag_mudar_status` (coordenação). As tabelas `diag_*` não têm policy de
  escrita para o cliente — não criar.
- **Identificação separada**: nome do entrevistado, GPS e nomes dos moradores
  ficam em `diag_fichas_identificacao` / `diag_moradores_identificacao`, que o
  consultor externo NÃO lê. Fotos (`diag_fotos`, bucket privado
  `diagnostico-fotos`, caminho `<uuid_cliente da ficha>/<uuid_foto>.jpg`) seguem
  a mesma regra. Nunca mover esses campos para `diag_fichas`.
- **Foto de campo** (`js/diag-foto.js`): carimbo visível + EXIF (GPS, data/hora
  -05:00, Artist), 1280 px, JPEG ≤ 350 KB, bucket ≤ 1 MB. **Guardar como bytes
  (ArrayBuffer), nunca Blob** — Blob no IndexedDB volta vazio no iPhone (fotos
  chegaram com 0 byte). `diag_fotos.lat/lon/gps_precisao_m/gps_origem` e
  `diag_fichas.fotos_registradas` (mesa: "registrou N; chegaram X").
- **Acesso** (regra única em `fn_diag_pode_aplicar/gerir/consultar/ver_numeros`):
  técnico + `tem_permissao('diagnostico')` aplica e vê só as próprias;
  coordenação/super_admin gerem (coordenação NÃO aplica); consultor externo +
  permissão lê fichas sem identificação; visualizador e técnico veem números via
  `fn_diag_agregados` (supressão abaixo de 5 fichas); financeiro sem acesso.
- **Indicadores** saem de `vw_diag_indicadores` (contagens aditivas) → nunca
  recalcular no cliente. Denominador exclui `_nr` e perguntas puladas.
- **Retenção**: identificação e fotos apagadas 2 anos após a validação por
  `fn_diag_aplicar_retencao` (cron `diag-retencao-diaria`), prazo lido de
  `lgpd_tratamentos` (TRAT-001). Arquivo de foto removido entra em
  `diag_expurgo_arquivos`, drenada pela Edge Function `diag-expurgo` (cron diário).
- **ROPA vivo** em `lgpd_tratamentos`: tabela nova com dado pessoal = linha nova
  lá na mesma entrega. Tela só leitura em `pages/ropa.html` (Configurações ›
  Privacidade; super_admin/coordenação) — `tabelas` é conferida contra o schema
  por `fn_lgpd_conferir_tabelas()`; nome errado vira pendência na tela.
  Correção do registro é por migration, nunca pela tela (retenção lê dali).
- **Modo treino** (`diag_fichas.treino`, código `TRE-`): aceita questionário
  em rascunho, fica fora de `vw_diag_respostas`/sugestões, apagado por
  `diag_apagar_treino()` (gerir). Permissão `fn_diag_pode_treinar()` =
  super_admin, técnico com `diagnostico` + `diagnostico_treino`, ou **coordenação
  com `diagnostico_treino` (só treino — coordenação nunca aplica ficha real)**. Nova view ou
  agregado sobre `diag_fichas` **deve** filtrar `not treino`.
- **Sublocalidades** (`diag_localidades`, filha de `diag_comunidades`; sem
  DELETE, desativar): `diag_fichas.localidade_id`/`localidade_nova` opcionais,
  validados em `diag_enviar_ficha`. Fora de indicadores (risco de
  reidentificação) até existir recorte com supressão.
- **Questionário vigente = v7 = FINAL da equipe técnica** (migração `20261008_diag_19_v7_final`; **publicada em
  09/10/2026** pela `20261009_diag_20_publica_v7`, que arquivou a v5 e a v6 — v7 agora é imutável): seção 0 + P1–P91 em 13 blocos (EBIA 8 itens, juventude), observação final.
  Número exibido pode ser texto: `rotulo` ("0.6", "32.1", "42 (a)"); `n` segue inteiro — exibir com
  `DiagRegras.numero(p)` / `p.rotulo || p.n`. `max_marcar` (múltipla "até 3") é regra do interpretador (SQL + JS).
  Lista de moradores (P7) **sem nome**; o app desenha a grade idade × sexo; P8 = derivada `maior_nivel`
  (`coluna: escolaridade`; cada opção da coluna tem `nivel` = opção da P8; derivada sem valor sai das respostas;
  SQL em `fn_diag_maior_nivel`). Alertas da lista usam o `n` da tabela na estrutura (não mais P9 fixo).
  Nome do entrevistado fora do formulário (0.7 = só GPS). Botão "O que é uma APA?" nas P51/53/55
  (`estrutura.leituras.apa`, publicado junto — mudar o texto = nova versão).
- **Histórico até a v6**: v5 (escolaridade da P9 em lista fechada desde a
  v2, com doutorado na v3; na v4 aviso novo em parágrafos, P55 `participa_org_tipos`
  (múltipla, **sensível**) e P56 = `participa_org_quais` (mesma chave, pede o nome);
  demais +1; na v5 o aviso ganha a gravação de áudio e `estrutura.audio_max_s = 180`;
  v1–v6 arquivadas). v6 (migração `20260929_diag_18_v6_apa`, nunca publicada): bloco 7
  "A APA e a situação da terra" (P46–P53, demais +8, 90 perguntas). Textos para
  **ler ao entrevistado** ficam em `estrutura.leituras` (ex.: `apa`) e aparecem como
  botão na pergunta com `"leitura": "<id>"` (`js/diag-form.js`, `#ov-leitura`); são
  só exibição, fora do interpretador. Coluna `unica` da P9 é
  validada por `fn_diag_validar_moradores` contra as opções da versão da ficha.
- **Autorização das fotos** é separada da participação: `diag_fichas.fotos_autorizadas`
  (pergunta na tela do aviso, app 1.9.0; NULL = ficha anterior ou recusa).
  `false` ⇒ app sem câmera e `diag_enviar_ficha` recusa qualquer foto
  (`diag:fotos_nao_autorizadas`). Sai na exportação e na ficha da mesa.
- **Áudio das respostas abertas** (`js/diag-audio.js`, app 2.0.0): só `texto_longo`, só com
  `diag_fichas.audio_autorizado = true` (pergunta separada no aviso), 1 gravação por
  pergunta, ≤ 3 min, guardado como **bytes**. Tabela `diag_audios` + bucket privado
  `diagnostico-audios` = **identificação** (consultor não ouve, nunca sai na exportação,
  apagado com a retenção pelo trigger `trg_diag_audios_retencao`, arquivo via
  `diag_expurgo_arquivos`). A **transcrição é a resposta de texto**: pergunta com áudio e
  sem texto vira alerta `audio_sem_transcricao` (não `pendente`), e `validada` é
  recusada pelo trigger `trg_diag_valida_audios`. Mesa transcreve por
  `diag_transcrever_audio()` (gerir; registra quem/quando). Escrita de áudio só por
  `diag_enviar_ficha` (`p_ficha.audios`). **Transcrição assistida por IA LOCAL**
  (`js/diagnostico-transcricao-ia.js`): Whisper via transformers.js num Web Worker, no
  navegador da mesa — a voz **nunca** vai para serviço de nuvem (frase do aviso). A IA só
  preenche rascunho; `diag_transcrever_audio(p_origem='ia_local', p_modelo)` registra
  `diag_audios.transcricao_origem/_modelo`. Desligar: `ATIVA = false` no módulo.
- **Exportação** só por `diag_exportar()` (registra em `diag_exportacoes` na
  mesma transação). Padrão sem nome/GPS/nomes; identificada só gerir;
  consultor sem texto aberto nem `_outro`. Planilha com ExcelJS
  (`js/vendor/`), nunca SheetJS. Nova coluna com dado pessoal/sensível em
  `diag_fichas` ⇒ decidir em `diag_exportar` se sai e para quem.
- **Indicadores na mesa** (`js/diagnostico-indicadores.js`) e **Meu painel**
  do app (`diag_meu_painel()`, só `auth.uid()`) só desenham o que o banco
  devolve. O painel do app nunca conta ficha de outro entrevistador.
- **Expurgo**: Edge Function `diag-expurgo` + cron `diag-expurgo-diario`
  drenam `diag_expurgo_arquivos` (buckets `diagnostico-fotos` e `diagnostico-audios`).
- **Guia de treinamento** do app: motor do SIGUC (`js/guia-app.js`/`css/guia-app.css`,
  cópia sem alteração) + conteúdo em `js/diag-guia.js`. Progresso só no aparelho,
  sem registro no banco. Texto mudou ⇒ incrementar `versao` do guia.
- PIN do app = **baralho do SIGUC** (`js/pin-baralho.js`/`css/pin-baralho.css`,
  cópia sem alteração — não editar aqui, copiar de novo do SIGUC). Logos do
  app em `pwa/logos/` (no `SHELL` do service worker).
- Configurações do app no padrão SIGUC (atualização via service worker,
  instalar aqui/QR para `pages/instalar-diagnostico.html`, privacidade).
  QR com `js/qrcode-generator.js` (MIT, cópia do SIGUC), gerado offline.
- Mesa: `pages/diagnostico.html` + `js/diagnostico.js` (nav `diagnostico`): Indicadores (todos),
  exportação na aba Validação, Visão geral
  (contagens, apagar treino), aba **Validação** (`js/diagnostico-validacao.js`: lista,
  ficha aberta, validar/devolver/descartar/reabrir **só pela RPC `diag_mudar_status`**,
  apagar foto; consultor externo vê a aba "Fichas" só leitura, sem identificação) e
  aba Admin (comunidades e sublocalidades).
- **Visual do app de campo** (2.1.0): design system em tokens no topo de
  `css/diagnostico-app.css` (cores, escala 4/8, raios, tipografia, movimento) —
  valor novo entra como token, nunca solto. Tema **claro/escuro** escolhido pela
  pessoa na 1ª abertura (`#ov-tema`) e em Configurações, guardado só no aparelho
  (`localStorage diag_tema`, `js/diag-tema.js`) e aplicado no `<head>` antes de
  pintar. Ícones: sprite SVG no HTML via `ic(nome)` — sem emoji. Login e PIN ficam
  no verde da marca nos dois temas. O motor do guia (SIGUC) não é editado: o escuro
  dele é sobrescrito em `diagnostico-app.css`.
- **Visual da mesa** (29/09): mesmo design system em `css/diagnostico-mesa.css`,
  escopado em `body.dgm` (só `pages/diagnostico.html`; menu lateral e demais páginas
  não mudam). Redefine no escopo os nomes do `global.css` (`--branco`, `--cinza-*`,
  `--borda`…), então `.card/.btn`/inputs seguem o tema. Tema = mesmo `diag_tema` do
  app (seletor no topo + pergunta no 1º acesso, `dgmTema()` em `js/diagnostico.js`).
  Janela nova da mesa fora do `.main-content` (anexada ao `body`) precisa entrar no
  seletor de escopo dos tokens, senão fica sem cor.
- App de campo: `pages/diagnostico-app.html` (exceção ao padrão `#app` +
  `gerarLayout`; não chama `carregarUsuario()`), service worker na raiz
  `diagnostico-sw.js` — **incrementar `VERSAO`** ao mudar qualquer arquivo do shell.

### Pulso da Equipe — questionário de engajamento por QR (⚠️ ler antes de mexer em `pulso_*`)

Migrações `20261006_pulso_equipe*.sql` (a `_c_perguntas` torna as perguntas personalizáveis); testes locais
`supabase/tests/pulso/rodar.sh` (v1 → migração c → testes das perguntas, inclusive a cópia do legado).
- **Quem faz o quê**: qualquer usuário ativo cria ciclo (`fn_pulso_criar_ciclo`, nav `pulso` para todos os perfis).
  Vê o resultado o **criador**; super_admin/coordenação veem todos (só leitura). **Perguntas: só o criador edita**
  (`fn_pulso_salvar_perguntas`) e só **até a 1ª resposta** (`pulso:perguntas_travadas`). Encerrar/reabrir: criador
  ou super_admin (só status). Regras em `fn_pulso_pode_ver` / `fn_pulso_dono`.
- **Perguntas são dado do ciclo**: `pulso_ciclos.perguntas` (jsonb), padrão = `fn_pulso_perguntas_padrao()` (as 7
  originais, chaves q1…q6 + `texto`). Novo ciclo pode copiar as perguntas de outro que a pessoa enxerga
  (`p_copiar_de`) — mesma `chave` = mesma pergunta (série). Tipos: `escala` (1–5; `indice`, `invertida`), `nps` (0–10),
  `escolha` (única, 2–10 opções; grava o **índice** da opção) e `texto`; `obrigatoria`. Número livre (teto 40).
  Validação só no banco (`fn_pulso_validar_perguntas`). `js/pulso-perguntas.js` tem só rótulos e o alerta do editor.
- **Escolha única** que pede dado de perfil (idade, cargo, tempo, gênero…) pode reidentificar: o editor alerta
  (`pulsoRisco`), não bloqueia. Escolha e texto não são recortados por perfil.
- **Gestão**: `pages/pulso.html` + `js/pulso.js`: ciclos "Meus" e "Outros (acompanhamento)", editor de perguntas
  (tipo, tema, texto, opções, ordem, obrigatória/índice/invertida, restaurar padrão), QR em tela cheia com contador,
  resultado por tipo, expectativa (`pulso_espelho_v2`, só escalas), comentário → "Criar tarefa"
  (`tarefas.html?nova=1&titulo=&desc=`).
- **Resposta**: `pages/pulso-responder.html?c=<token>` — **pública** (exceção ao padrão `#app`, sem `carregarUsuario()`),
  desenha as perguntas que `fn_publico_pulso_ciclo` devolve. Com sessão ⇒ perfil do cadastro; sem ⇒ entra (login na
  página, sai sozinho ao enviar) ou **convidado**. Grupo de perfil decidido no banco (`fn_pulso_grupo_atual`).
- **Anonimato**: respostas em `pulso_respostas_v2` (`respostas` jsonb `{chave: valor}`) **sem usuário nem hora** — não
  acrescentar coluna identificadora. Quem respondeu fica em `pulso_participacoes`, só para barrar duplicidade.
  `pulso_respostas`/`pulso_espelho` (colunas fixas) são **legado**: copiadas para as v2 com o mesmo id, não escrever.
  **Nenhuma tabela `pulso_*` tem policy nem grant** — tudo por RPC SECURITY DEFINER; anon só executa
  `fn_publico_pulso_ciclo`/`fn_publico_pulso_responder`.
- **Supressão**: `fn_pulso_resultado` não devolve nada com < 5 respostas; grupo < 5 vai para "demais" (se somar 5);
  textos por pergunta, embaralhados e sem perfil. `fn_pulso_metricas`: comprometimento = média ajustada (invertida =
  6 − média) das escalas com `indice` em 0–100; sintonia = 100 − dp médio ÷ 2 × 100; eNPS = 1ª pergunta `nps`
  (índice ausente ⇒ `null`, a tela esconde o cartão). Nunca recalcular no cliente.
- **Painel** (aba inicial de `pages/pulso.html`): indicadores, avisos (aberto sem resposta, faltam N para o resultado,
  fecha em < 24h, aberto há > 15 dias), tabela filtrável/ordenável (situação, meus/todos, busca) com ações por linha
  (QR, exportar, encerrar/reabrir, abrir) e evolução Comprometimento × Sintonia (SVG). Dados de `fn_pulso_ciclos`
  (inclui `ultima_resposta` = só o dia, e `n_exportacoes`). Aba **Ciclo** = detalhe.
- **Exportação** (`js/pulso-exportar.js`, migração `_d_exportacao`): **só agregados** via `fn_pulso_exportar(ciclo, formato)`
  (`xlsx` | `a4` | `pptx`; recusa com < 5 respostas, `pulso:exportacao_suprimida`) e `fn_pulso_exportar_lista()`
  (planilha dos ciclos visíveis). Cada chamada grava em `pulso_exportacoes` (quem, ciclo, formato, quando) na mesma
  transação. **Nunca exportar resposta individual.** Planilha = ExcelJS; A4 = janela + imprimir; PowerPoint =
  PptxGenJS 3.12.0 vendorizado (`js/vendor/pptxgenjs-3.12.0.bundle.js`, MIT), gráficos nativos editáveis. Bibliotecas
  carregadas só no clique (`puxLib`). Leitura/quadrante compartilhados em `pulsoLeitura()` (`js/pulso-perguntas.js`).
- ROPA: `TRAT-002`. ⚠️ O UPDATE do TRAT-002 da migração c está em `20261006_pulso_equipe_c_ropa_sql_editor.sql`
  (o `apply_migration` expira nele) — colar no SQL Editor; idem `20261006_pulso_equipe_d_ropa_sql_editor.sql` (inclui `pulso_exportacoes`).
- **Visual**: o painel usa o design system da mesa do Diagnóstico (`body.dgm` + `css/diagnostico-mesa.css`, tema
  `diag_tema` com seletor Claro/Escuro no topo) e componentes em `css/pulso.css` (cor nova = token no topo do arquivo;
  escala divergente `--pu-d1..5` validada para daltonismo nos dois temas). Ícones SVG por `pIc()`/`prIc()`, sem emoji.
  A página do QR segue `prefers-color-scheme`. ⚠️ Em comentário CSS não escrever `--x-*/` — o `*/` fecha o comentário
  e engole a regra seguinte (os tokens do tema claro sumiram por isso).

### Painel de Tarefas — subtarefas, comentários e anexos
- `tarefa_checklist` (subtarefa): `responsavel_usuario_id` **ou** `responsavel_fornecedor_id` (check impede os dois), `dt_prazo`.
  Trigger `trg_checklist_responsavel` inclui o usuário responsável como **observador** da tarefa + sino (`tarefa_subtarefa`). Ao atribuir pelo painel, chamar `enviar-email-tarefa` com `evento:'subtarefa'` e `checklist_id`.
- Fornecedor responsável recebe e-mail com os anexos da subtarefa e `Reply-To: fundobrasilonuacre+<checklist_id>@gmail.com`; `receber-email-tarefa` aceita o token de tarefa **ou** de subtarefa e grava a resposta via `fn_comentar_tarefa_fornecedor` (service_role).
- `tarefa_comentarios.autor_id` pode ser NULL quando `autor_fornecedor_id` está preenchido; `checklist_id` indica a subtarefa de origem.
- `tarefa_anexos.comentario_id` / `checklist_id` ligam o arquivo ao comentário (e-mail ou painel) e/ou à subtarefa — **sempre** preencher ao gravar anexo que chega junto com um comentário.
- Observador é avisado no sino (`tarefa_observador`) e por e-mail ao ser incluído; `enviar-email-tarefa` aceita `destinatarios` (uuid[]) para avisar só os novos.
- **Tarefa restrita** (`tarefas.restrita`): visível só para criador, participantes e `super_admin` — coordenação e responsáveis da atividade **não** veem. Regra única em `fn_pode_ver_tarefa`/`fn_tarefa_pode_editar` + policy `tarefas_select`; qualquer novo acesso a tarefa deve passar por elas. Só o criador (ou super_admin) muda a marcação (trigger `trg_tarefa_guarda_restrita`, registra `restricao` no histórico); usar `fn_definir_restricao_tarefa`.
- **TDRs da tarefa** (N:N): tabela `tarefa_tdrs(tarefa_id, tdr_id)`. O TDR precisa ser da atividade da tarefa (trigger `trg_tarefa_tdr_coerente`, SECURITY INVOKER — só vincula TDR que o usuário enxerga); trocar a atividade remove os vínculos de outra atividade. Quem vê a tarefa mas não o TDR recebe `tdr: null` no embed → exibir "TDR vinculado (acesso restrito)". `tarefas.entidade_tipo/entidade_id` segue livre para outro uso.
- **Tipos de tarefa**: catálogo `tarefa_tipos(codigo PK, nome, icone, cor, ordem, ativo, campos jsonb)`, editável por `super_admin`/`coordenacao` (sem DELETE — desativar). `tarefas.tipo` (obrigatório, padrão `outras`) + `tarefas.dados_tipo` (jsonb com os campos próprios). `campos` descreve o formulário (`chave, rotulo, tipo: text|textarea|url|date|datetime|select|boolean, obrigatorio, define_prazo, opcoes, dica`); o trigger `trg_tarefa_valida_tipo` recusa campo obrigatório vazio. Datas/horas de reunião são hora local do Acre (`YYYY-MM-DDTHH:mm`, UTC-5 fixo).
- **Convite de agenda** (tipo `reuniao`): `enviar-email-tarefa` anexa `.ics` com `UID=<tarefa_id>@dima-plataforma` e `SEQUENCE=tarefas.ics_sequencia` (incrementada pelo trigger quando dados/título mudam ou a reunião é cancelada). Eventos: `atribuicao` (convite), `reuniao_atualizada`, `cancelada` (METHOD:CANCEL).
- **Edição auditada**: o modal abre em modo leitura; campos e subtarefas só liberam com "Editar tarefa". O registro é do **banco**, não da tela: trigger `trg_tarefa_registra_edicao` grava em `tarefa_historico` (tipo `edicao`, ou `prazo` se só o prazo mudou) cada campo alterado com antes/depois em `detalhes` (jsonb) — vale até para UPDATE direto. `fn_editar_tarefa` recebe `p_motivo` (vai para `tarefa_historico.motivo`; **obrigatório se o prazo mudar**), `p_mudar_prazo/p_dt_prazo` e `p_versao` (= `atualizado_em` lido; recusa salvar se alguém alterou no meio tempo). Subtarefas (`trg_tarefa_checklist_historico`), remoção de participante e anexos avulsos também são registrados. Mover status no quadro segue livre (já registrado), exceto as transições de conclusão (ver abaixo).
- **Conclusão com aprovação** (migração `20260928_tarefa_conclusao_aprovada`): quem conclui, aprova e reabre é o **criador** (`fn_tarefa_aprovador`; super_admin só se o criador estiver inativo). Responsável usa "Enviar para revisão" (`em_revisao`); o criador aprova (→ `concluida`) ou devolve (motivo obrigatório). Tarefa pessoal (criador é o único responsável) conclui direto. Enviar e concluir exigem **todas as subtarefas concluídas** e nota (entrega/conclusão); reabrir e devolver exigem motivo. Tudo por `fn_mudar_status_tarefa(p_tarefa_id, p_status, p_nota)`, que grava a nota como comentário e **devolve o `comentario_id`** para ligar os anexos da entrega. **UPDATE direto de `tarefas.status` é recusado** (trigger `trg_tarefa_guarda_status`); nunca mudar status por outro caminho. Histórico: `envio_revisao`, `aprovacao`, `conclusao`, `devolucao`, `reabertura`. Sino: `tarefa_revisao`, `tarefa_devolvida`, `tarefa_reaberta`; e-mail com os eventos `revisao`, `devolvida`, `reaberta`, `concluida`. No quadro, arrastar para Em revisão/Concluída ou tirar de Concluída abre a mesma conferência (`abrirConferencia`).
- **Visual do painel**: estilos em `css/tarefas.css` (tokens e componentes no escopo `:is(.tk,.tk-overlay)` — não vazam para o resto do app). Ícones são SVG do sprite em `pages/tarefas.html` via `ic(nome)` em `js/tarefas.js`; **não usar emoji** na tela. O ícone do tipo vem de `TIPO_IC[codigo]` (fallback `tag`); `tarefa_tipos.icone` (emoji) continua só nos e-mails.
- Bucket `tarefas-anexos`: caminho **sempre** `<tarefa_id>/<arquivo>` — as policies de storage leem a 1ª pasta (`fn_tarefa_id_do_path`) e aplicam o acesso da tarefa (ver/anexar: `fn_pode_ver_tarefa`; apagar: `fn_tarefa_pode_editar`). Arquivo fora desse padrão fica inacessível ao cliente.

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
| `auditor-ia` | Auditoria automática em 6 domínios + agente de orçamento (`fn_auditoria_orcamento`) + supervisor Claude | ✅ |
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
| `diag-expurgo` | Diagnóstico: remove do Storage as fotos e áudios da fila `diag_expurgo_arquivos` (cron diário) | ✅ |
| `cotacao-ptax` | Grava a PTAX de fechamento do BCB em `cotacoes_ptax` (cron em dias úteis; corpo `{inicio,fim}` para histórico) | ✅ |
| `assinar-remanejamento` | Reconfirma a senha e assina a cadeia de remanejamento (`fn_rem_assinar`); envia/reenvia os e-mails da cadeia e os avisos de contrato travado/liberado (`{acao:'drenar'}` pelo cron) | ✅ |

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
| `beneficiarios` | nome, CPF, nascimento, passaporte | identidade lê quem opera Viagens (`super_admin/coordenacao/financeiro/tecnico`); escrita só `super_admin/coordenacao` |
| `beneficiario_dados_bancarios` | **dados bancários** (banco/agência/conta/PIX/IBAN) | tabela separada 1:1 com `beneficiarios.id`. Leitura e escrita só `super_admin/coordenacao` — ver abaixo |
| `fornecedores` | CPF/CNPJ, endereço, dados bancários | PF é dado pessoal |
| `viagem_viajantes` | CPF, e-mail, cartões de embarque | `viaj_sel` (`auth.uid() is not null`) anula a policy restritiva |
| `car_dados_locais` | nome de proprietário rural (53.594 linhas) | CPF **removido** — ver abaixo |
| `usuarios` | e-mail, telefone | `perfil`/`ativo` protegidos por trigger |
| `audit_log` | IP, user-agent, snapshots jsonb | **ativo** desde `20260727_lgpd_c2_02` — ver "Trilha de auditoria" |

### `car_dados_locais.cpf_cnpj` foi removida

A coluna não existe mais. Use **`cpf_cnpj_mascara`** (text), que guarda só os 2
últimos dígitos (`***.***.***-89`) de forma irreversível. Copropriedades trazem
vários documentos separados por vírgula. Em qualquer reimportação do SICAR,
passar o valor por `fn_mascara_doc(text)` antes de gravar — **nunca** persistir
CPF do CAR em texto puro.

Não há mascaramento no cliente: `_mascaraCpfCnpj()` foi removida de `mapa.html`.
Exiba `cpf_cnpj_mascara` diretamente.

### Dados bancários de beneficiários — tabela separada

`beneficiario_dados_bancarios` guarda banco/agência/conta/tipo_conta/PIX/IBAN,
1:1 com `beneficiarios.id`. RLS é *row-level*, não *column-level* — por isso o
dado financeiro saiu de `beneficiarios` para uma tabela própria, restrita a
`super_admin`/`coordenacao`. **Nunca** devolver esses campos numa consulta que
misture perfis (ex.: `select('*')` em `beneficiarios` sem o join condicional).
Em `pages/viagens.html`, `carregarBenef()` faz o join manualmente e mescla —
os campos só populam se a policy permitir a leitura. `salvarBenef()` grava com
`upsert(..., {onConflict:'beneficiario_id'})`.

### Trilha de auditoria (`audit_log`)

Ativa desde `20260727_lgpd_c2_02` via trigger genérica `fn_trg_audit()`, ligada
em `usuarios`, `beneficiarios`, `fornecedores`, `viagem_viajantes` e
`beneficiario_dados_bancarios` — e, pelo razão orçamentário, em `atividades` (rem_00),
`contratos` e `rem_cargo_titulares` (rem_10). Só grava o que mudou (ignora `UPDATE` sem
alteração real), e ignora `atualizado_em` como campo de diferença. Leitura
restrita a `super_admin`/`coordenacao` (policy `audit_select_admin`); não há
`UPDATE`/`DELETE` — a trilha é imutável por ausência de policy, não por RULE.

`beneficiario_dados_bancarios` audita em modo **redigido** — a trigger recebe o
argumento `'redigir'` e grava `[redigido]` no lugar de cada valor (via
`fn_redigir_jsonb`). Sabe-se *que* o PIX mudou e *quem* mudou, nunca o valor
antigo nem o novo. Ao adicionar auditoria em nova tabela com dado financeiro,
usar o mesmo padrão — nunca logar valor bancário em claro.

### Redação de CPF antes do envio à Anthropic

`analisar-tdr` e `sugerir-correcoes-tdr` leem o `.docx` do TDR e mandam o texto
extraído para o Claude. TDRs de PF costumam trazer o CPF do consultor no corpo
do arquivo. Ambas as functions passam `conteudoDoc` por `redigirDadosPessoais()`
(regex de CPF/CNPJ, formatado e não formatado) antes de montar o prompt — o
dado nunca chega à Anthropic. `corrigir-tdr` não lê o documento, não precisa do
filtro. Ao criar uma nova function que leia `arquivo_url` de TDR, replicar o
mesmo helper antes de montar qualquer prompt.

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
| `diagnostico-fotos` | 🔒 privado | fotos de moradia/entorno do Diagnóstico (identificação — consultor não vê) |
| `diagnostico-audios` | 🔒 privado | gravações de voz das respostas abertas do Diagnóstico (identificação — consultor não ouve) |
| `tarefas-anexos` | 🔒 privado | anexos do Painel de Tarefas (caminho `<tarefa_id>/<arquivo>`) |

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
- Bucket privado novo **entra em `BUCKETS_PRIVADOS`** (`js/config.js`), senão o link abre sem assinatura e o Supabase responde "Bucket not found".
- Não criar novo signer ad-hoc: as 8 implementações duplicadas que existiam
  foram consolidadas nesses helpers.

**Nas Edge Functions**, baixar com `supabase.storage.from(b).download(p)` usando
o client **service_role** — `fetch()` na URL pública retorna 400. Já aplicado em
`analisar-tdr`, `sugerir-correcoes-tdr` e `enviar-email-produto`. O fluxo sem
login de `prestacao-publica` usa `createSignedUploadUrl` e não foi afetado.

### Pendências conhecidas (Camadas 3–4, ainda não implementadas)

Dados bancários de `beneficiarios` sem criptografia em repouso (estão
segregados e com RLS restrita, mas em texto puro). Sem redação de CPF nos
demais campos de texto livre do TDR (`objeto_pt`, `escopo_pt` etc. — hoje só o
conteúdo extraído do `.docx` é redigido). Nenhum documento produzido — Política
de Privacidade, Termos de Uso, ROPA, RIPD e designação do Encarregado. Sem
tratamento formal de transferência internacional (art. 33) para os operadores
Supabase/Anthropic/Vercel/Google.

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
14. **Liberação de saldo/economia**: NÃO criar tabela nova. `contrato_encerramentos` + `vw_saldo_atividade` já são o mecanismo único (ver seção "Saldo por atividade e liberação de economia"). Comprometido = valor **planejado** do TDR (+ excedente de contrato acima do TDR), não o do contrato; economia é liberada via `fn_liberar_economia_tdr` (tipo `economia_contratacao`). Qualquer novo cálculo de saldo deve espelhar `vw_saldo_atividade`, senão dashboard e relatório divergem.
15. `car_dados_locais.cpf_cnpj` **não existe mais** — use `cpf_cnpj_mascara` (ver seção "Privacidade e LGPD")
16. `_mascaraCpfCnpj()` **não existe mais** em `mapa.html` — o dado já vem mascarado do banco
17. **Nunca** conceder `GRANT` ao papel `anon`. Para expor dado no portal público, criar função `SECURITY DEFINER` no padrão `fn_publico_*`
18. Policy com `USING (true)` **anula** as policies restritivas da mesma tabela/comando (somam-se por OR). Ao criar policy para usuário logado, usar sempre `TO authenticated`, nunca `TO public` — `public` inclui o `anon`
19. Buckets de documentos são **privados** — `href="${url}"` e `window.open(url)` retornam 400. Use `data-arquivo` / `abrirDoc()` / `urlAssinada()` (ver seção "Storage")
20. Em Edge Function, ler arquivo com `storage.download()` via service_role — `fetch()` na URL pública falha
21. `beneficiarios.banco/agencia/conta/tipo_conta/pix/iban` **não existem mais** — use `beneficiario_dados_bancarios` (FK `beneficiario_id`), acesso restrito a `super_admin`/`coordenacao`
22. Ao ler `beneficiarios` para exibir em tela, lembrar que a policy de SELECT mudou de "qualquer autenticado" para `super_admin/coordenacao/financeiro/tecnico` — perfis fora dessa lista recebem lista vazia, não erro
23. `atividades.orcamento_usd` **não se altera direto** (nem por super_admin) — é cache do razão `orcamento_fontes`. Ver "Razão orçamentário e remanejamento"
24. Nenhuma view de saldo pode ter GRANT de escrita: view simples com dono postgres é auto-atualizável e ignora RLS
25. `cotacoes_usd` (AwesomeAPI, colunas `cotacao`/`data_ref`) **≠** `cotacoes_ptax` (PTAX oficial, `ptax_venda`/`data`). Antes de criar tabela, conferir se o nome já existe — `create table if not exists` pula em silêncio e os GRANT/trigger seguintes caem na tabela antiga
26. Assinatura de remanejamento **só** pela Edge Function `assinar-remanejamento` (senha reconfirmada no servidor). `fn_rem_assinar` é service_role-only — não expor a `authenticated`
27. Saldo livre de atividade para decidir trava = `fn_cob_livre()` (com sinal). `vw_orcamento_atividade.remanejavel_usd` é Σ de fontes livres e **nunca fica negativo** — não serve para comparar déficit

---

## Variáveis de Ambiente (Edge Functions)

```
SUPABASE_URL                — injetado automaticamente
SUPABASE_ANON_KEY           — injetado automaticamente
SUPABASE_SERVICE_ROLE_KEY   — injetado automaticamente
ANTHROPIC_API_KEY           — configurado nos secrets do projeto
```
