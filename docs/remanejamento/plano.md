# Remanejamento de recursos entre atividades — especificação

Status: **aprovada para implementação** (03/10/2026). Opção B — rastreio da
origem de cada valor. Nada implementado ainda; este documento é o contrato das
migrações `2026xxxx_rem_*`.

---

## 0. Diagnóstico de partida (banco em 03/10/2026)

| Achado | Consequência |
|---|---|
| `atividades.orcamento_usd` editável pelo modal de `pages/atividades.html`; policy `atividades_write` inclui `tecnico`; sem `audit_log` | hoje qualquer técnico "remaneja" trocando um número, sem rastro |
| 30 despesas sem TDR/contrato (US$ 55.598,26) — **todas viagens** (VGM, diárias e passagens) da 2.1.7, execução direta UNESCO | já estão cobertas pelos TDRs "guarda-chuva" 2.1.7-001 (passagens) e 2.1.7-002 (diárias), US$ 38.095,24 cada; **não** são débito extra (seria contagem dupla). Lançamentos têm `tdr_id` nulo — §2.2 |
| `contratos` só tem `valor_total_brl` | não há como comparar contrato com orçamento (USD) |
| Aditivo = `update` de `valor_total_brl` (`pages/contratos.html`) | aumento de contrato passa sem nenhuma checagem |
| Cotação vem do navegador (`awesomeapi`, `pages/financeiro.html`) | taxa não é confiável nem registrada |
| "Senha de confirmação" de viagens/financeiro é `signInWithPassword` no cliente | não prova nada no banco |
| 4 atividades com saldo livre negativo (1.5.6, 1.6.3, 2.1.6, 1.5.3) | **não regularizar agora** — ver §5 |

---

## 1. Princípios

1. **O TDR compromete, o contrato deriva do TDR** (revisto em 03/10/2026).
   TDR só nasce/aumenta se couber no saldo livre. Contrato até o valor do TDR
   já está comprometido; o que exceder (ou o contrato inteiro, sem TDR) acima
   do saldo livre exige cobertura.
2. **Todo dólar tem procedência.** O saldo de uma atividade é a soma de
   *fontes* identificadas; remanejar é transferir de fontes específicas.
3. **Remanejamento não cria dinheiro.** Σ orçamento vigente de todas as
   atividades = Σ dotação original + Σ revisões UNESCO. Conferido sempre.
4. **Tudo no banco.** Validação, saldo, cadeia de aprovação e liberação de
   contrato vivem em RPC/trigger. A tela só exibe.
5. **Imutável.** Nada é apagado nem editado depois de efetivado; correção =
   estorno (lançamento inverso).

---

## 2. Razão de fontes (o coração da Opção B)

### 2.1 Tabela `orcamento_fontes` — créditos com procedência

| tipo | nasce em | referência |
|---|---|---|
| `dotacao_original` | carga inicial, 1 por atividade (= `orcamento_usd` de hoje) | atividade |
| `revisao_orcamentaria` | revisão formal UNESCO (RPC própria, mesma cadeia de assinaturas) | ato/anexo |
| `economia_contratacao` | `fn_liberar_economia_tdr` (existente) | `contrato_encerramentos.id` |
| `encerramento_contrato` | encerramento/rescisão (existente) | `contrato_encerramentos.id` |
| `remanejamento_recebido` | efetivação de remanejamento (destino) | alocação → **fonte de origem** (linhagem) |
| `remanejamento_cedido` | efetivação (origem), valor negativo | alocação → fonte debitada |

- `valor_usd numeric(14,2)` com sinal; `cotacao`/`valor_brl_ref` informativos.
- Estorno de liberação (`fn_estornar_economia_tdr`) e de remanejamento gera
  lançamento negativo com `estorno_de`, nunca UPDATE/DELETE.
- Triggers em `contrato_encerramentos` criam/estornam a fonte — nenhuma
  liberação escapa do razão, por qualquer caminho.
- `atividades.orcamento_usd` passa a ser **cache** = Σ(`dotacao_original`,
  `revisao_orcamentaria`, `remanejamento_*`) mantido só por trigger. Com isso
  `vw_saldo_atividade`, dashboard e relatório A4 seguem corretos sem reescrita.
  Nova coluna `orcamento_original_usd` congela a dotação UNESCO.

### 2.2 Débitos

```
débito_atividade = Σ tdrs.valor_usd (não cancelados, exceto execução direta)
                 + max( Σ tdrs de execução direta (não cancelados),
                        Σ despesas diretas (execucao_financeira ≠ cancelado, sem contrato)
                        + viagens aprovadas ainda não lançadas )
```

**Execução direta UNESCO** (viagens: diárias e passagens) não tem contrato nem
TDR por despesa. O TDR "guarda-chuva" da atividade (`tdrs.execucao_direta =
true`, novo; marcados 2.1.7-001 e 2.1.7-002) é a **reserva**; as viagens
consomem essa reserva. Só o que passar da reserva vira débito adicional
(e alerta). Na 2.1.7 hoje: reserva US$ 76.190,48 − executado US$ 55.598,26 =
**US$ 20.592,22 ainda reservados para viagens** (não remanejáveis enquanto o
TDR guarda-chuva não for reduzido — redução vira saldo livre pelo §2.3).

TDR cancelado ou reduzido **diminui o débito** — o dinheiro volta
automaticamente à fonte que ele consumia (§2.3). Cada mudança de valor/status
de TDR é registrada em `orcamento_eventos` para o extrato.

### 2.3 Regra de consumo (determinística, documentada)

Os débitos consomem as fontes **em ordem**: `dotacao_original` primeiro,
depois as demais por `criado_em` (PEPS). A view `vw_orcamento_fontes_saldo`
recalcula isso a cada consulta e devolve, por fonte: valor, consumido,
reservado, **disponível**.

Consequência: liberação de qualquer natureza (TDR cancelado, economia,
encerramento, remanejamento recebido) aparece como saldo disponível na fonte
correspondente, com a procedência original preservada — inclusive em cadeia
(recebido de X que veio da economia do TDR Y).

### 2.4 Saldos derivados

```
saldo_livre_usd        (vw_saldo_atividade, inalterado na fórmula, + coluna nova)
despesas_sem_tdr_usd   (nova coluna)
reservado_usd          (Σ alocações de pedidos em andamento — §3.3)
saldo_remanejavel_usd  = Σ disponível das fontes − reservado
```

**Invariantes** (`fn_conferir_orcamento()`, também no `auditor-ia`, domínio
`financeiro`, severidade `critico`):
1. `atividades.orcamento_usd = Σ fontes orçamentárias` por atividade
2. Σ disponível das fontes = `max(0, créditos − débitos)` por atividade
3. Σ orçamento vigente global = Σ original + Σ revisões
4. `resultados.orcamento_usd = Σ atividades` do resultado
5. todo remanejamento efetivado tem Σ itens = 0 e Σ alocações = Σ itens de origem

---

## 3. Remanejamento

### 3.1 Tabelas

```
remanejamentos           numero REM-AAAA-NNN, tipo (livre | cobertura_contrato),
                         contrato_id, justificativa, status, etapa_atual,
                         hash_documento, uuid_cliente, criado_por/em, efetivado_em
remanejamento_itens      atividade_id, valor_usd (− origem / + destino) — Σ = 0
remanejamento_alocacoes  item de origem × fonte × valor_usd  (linhagem)
remanejamento_etapas     a cadeia materializada (§4), 1 linha por assinatura exigida
remanejamento_historico  toda transição: quem, quando, de→para, motivo, hash
```

### 3.2 Status

`rascunho → em_aprovacao → efetivado`, com `recusado`, `cancelado` e,
depois de efetivado, `estornado`. Transição **só por RPC**; UPDATE direto de
`status` recusado por trigger (padrão de `trg_tarefa_guarda_status`).

### 3.3 Reserva

Ao entrar em `em_aprovacao`, as alocações **reservam** o valor nas fontes de
origem — nenhum outro pedido usa o mesmo dinheiro. Recusa/cancelamento
liberam a reserva. A efetivação **revalida** tudo sob `FOR UPDATE`
(atividades e fontes travadas em ordem de `id`): se a fonte deixou de ter
saldo (ex.: TDR novo na origem), a efetivação é recusada e o pedido volta
ao solicitante.

### 3.4 Validações

- Σ itens = 0 exato (numeric, constraint trigger deferrable)
- alocação ≤ disponível da fonte − reservas de outros pedidos
- origem ≠ destino; atividade de origem sem TDR ativo com `valor_usd` nulo
- edição só em `rascunho` ou quando devolvido ao solicitante; editar muda o
  `hash_documento` e **invalida todas as assinaturas** (cadeia recomeça)

### 3.5 Estorno

Só se as fontes `remanejamento_recebido` do destino ainda estiverem
disponíveis no valor integral; gera lançamentos inversos. Exige a mesma
cadeia de assinaturas.

✅ **Implementado em 03/10/2026** (`rem_06_estorno`): pedido com
`remanejamentos.estorno_de`, criado por `fn_rem_criar_estorno` como espelho
exato (itens invertidos; alocações = recebidos inteiros, que ficam reservados
enquanto tramita). Recebido já repassado/ajustado ou consumido pelo destino ⇒
recusa. Efetivação espelha cada lançamento (`orcamento_fontes.estorno_de`):
o cedido volta à mesma fonte de origem, preservando a procedência; o original
fica `estornado`. Estorno de estorno não existe (desfazer = novo remanejamento).

---

## 4. Cadeia de aprovação — nominal, sequencial, com senha

### 4.1 Signatários (por pessoa, sem substituição)

```
cargos_aprovacao   codigo PK: coordenacao_solicitante | unesco_financeiro | diretor | secretario
cargo_titulares    cargo, usuario_id, vigencia_inicio/fim, ato (portaria/SEI), designado_por
```

- **Um titular vigente por cargo. Não há substituto**: ausente o titular, o
  pedido aguarda. Troca de titular é ato registrado (encerra vigência anterior);
  assinaturas já dadas permanecem válidas e mostram quem era o titular na data.
- `unesco_financeiro` exige perfil `financeiro`.
- **Responsável pela atividade**: `atividades.responsavel_id` de cada atividade
  de **origem** (duas origens = duas etapas, em ordem de código).
- Designação de titulares: só `super_admin`, auditada.

### 4.2 Ordem (estritamente sequencial)

| # | Etapa | Quem | Ação |
|---|---|---|---|
| 1 | Solicitação | titular `coordenacao_solicitante` | assina e envia |
| 2 | Liberação | responsável de cada atividade de origem | libera |
| 3 | UNESCO | titular `unesco_financeiro` | aprova |
| 4 | Diretoria | titular `diretor` | aprova |
| 5 | Secretaria | titular `secretario` | aprova → **efetivação automática** |

Só o signatário da **etapa atual** pode agir; RPC recusa qualquer outro.

### 4.3 Aprovar, devolver, recusar — e quem recebe e-mail

- **Aprovar** → etapa avança; **só o próximo** recebe e-mail ("pedido
  aguardando sua análise"). Nunca se avisa etapa futura antes da anterior aprovar.
- **Devolver** (motivo obrigatório) → volta **uma etapa**; **só o anterior**
  recebe e-mail com o que foi pedido. A assinatura dele é reaberta. Ele pode:
  - reaprovar (pedido segue de novo ao que devolveu), ou
  - devolver mais um passo atrás, até chegar ao solicitante, único que edita.
- **Recusar** (motivo obrigatório) → encerra o pedido, libera reserva; e-mail
  ao solicitante e a quem já assinou.
- Sino (`notificacoes`) espelha os e-mails. Falha de e-mail fica em
  `remanejamento_notificacoes` e é reenviada por cron — a aprovação nunca
  depende do e-mail ter saído.

### 4.4 Senha reconfirmada (verificada no servidor)

Nada de verificação no navegador. Toda ação da cadeia passa pela Edge
Function **`assinar-remanejamento`** (`verify_jwt`):

1. identifica o usuário pelo JWT;
2. revalida a **senha de login** contra o Auth (`grant_type=password`) com o
   e-mail do próprio JWT; a sessão gerada é descartada; a senha nunca é
   gravada nem logada;
3. limite: 5 erros em 15 min bloqueiam por 30 min (`assinatura_tentativas`);
4. só então chama `fn_assinar_remanejamento(...)` com `service_role` — RPC
   **sem** grant para `authenticated`, ou seja, impossível assinar sem passar
   pela senha;
5. a assinatura grava: usuário, cargo, titularidade vigente, etapa, decisão,
   motivo, data/hora, IP/user-agent e **SHA-256 do documento** (itens,
   alocações, justificativa) no instante da assinatura.

---

## 5. Cobertura obrigatória do contrato

> ✅ **Implementado em 03/10/2026 com a regra revista** (`rem_05a`, `rem_05`, `rem_05b`) —
> esta seção prevalece sobre o texto original abaixo, mantido como histórico:
> - TDR compromete o planejado e é travado no saldo livre (`fn_trg_verificar_saldo` sobre `fn_cob_livre`).
> - Comparação TDR × contrato em **R$**; só o **excedente** (Σ contratos do TDR − TDR) é convertido pela PTAX
>   do dia e congelado em `contrato_coberturas`; entra no débito. Contrato sem TDR: excedente = valor inteiro.
> - Excedente acima do livre ⇒ `aguardando_cobertura`, travado (produto, pagamento, PDF assinado, status).
>   Déficit = excedente − max(0, livre). Fila por atividade em ordem de chegada; `piso` = livre antes do 1º
>   contrato da fila (negativo antigo não é regularizado).
> - Liberação automática por `fn_cob_reavaliar` após crédito no razão, redução/cancelamento de contrato,
>   alteração de TDR ou reserva liberada. Pedido de cobertura nasce pelo botão "Pedir cobertura" (não
>   automático) e é cancelado sozinho se o contrato for liberado por outro caminho ou cancelado.
> - Novo status `cancelado` (terminal; recusado se houver lançamento financeiro).
> - Carga: o único excedente existente (contrato do TDR 1.1.1-001, R$ 1.000 → US$ 190,93 pela PTAX de
>   27/03/2026) entrou sem travar. Pendente: e-mail à coordenação na trava/liberação (hoje só tela).

### 5.1 Quando dispara

Trigger em `contratos` no INSERT e em todo UPDATE que **aumente**
`valor_total_brl` (aditivo):

```
necessidade_usd  = valor do contrato (ou do acréscimo) em USD, cotação do dia
disponível_usd   = orçamento vigente
                   − Σ contratos já firmados da atividade (USD congelado no cadastro)
                     líquidos do que foi liberado por encerramento
                   − execução direta realizada (despesas diretas + viagens aprovadas)
déficit          = necessidade − disponível
```

**Quem contrata primeiro não pede cobertura**, desde que caiba no disponível.
TDR ainda não contratado é expectativa e **não** conta contra o contrato
(nem o TDR guarda-chuva — conta só o que já foi executado com ele).

Contratos já existentes recebem `valor_total_usd` por backfill com a PTAX da
data do cadastro (`criado_em`), registrada em `cotacao_data`.

Note a diferença deliberada: **remanejar** só usa saldo livre (planejado dos
TDRs conta — não se tira dinheiro de quem ainda vai contratar); **contratar**
só olha o que está formalizado.

Déficit > 0 ⇒ contrato fica `aguardando_cobertura` (valor novo do enum
`status_contrato`) e nasce automaticamente um remanejamento
`tipo=cobertura_contrato`, destino = atividade, valor = déficit, em
`rascunho` para a coordenação escolher as fontes.

### 5.2 Totalmente travado

Enquanto `aguardando_cobertura`, triggers recusam: virar `vigente` por fora,
anexar contrato assinado, cadastrar/alterar `contratos_produtos`, lançar
`execucao_financeira`, vincular a tarefas de execução. Permitido só:
**cancelar** ou **reduzir o valor**.

### 5.3 Liberação automática

`fn_reavaliar_cobertura(atividade_id)` roda após qualquer evento que aumente
saldo (remanejamento efetivado, economia/encerramento, TDR cancelado ou
reduzido, contrato reduzido). Déficit ≤ 0 ⇒ contrato vira `vigente`, registro
no histórico, e-mail à coordenação; o pedido de cobertura ainda aberto é
cancelado automaticamente ("saldo coberto por <evento>") e libera a reserva.

### 5.4 Os 4 negativos atuais

Não são tocados. Entram na regra quando o contrato (ou aditivo) de cada um for
cadastrado.

---

## 6. Cotação do dia

- Tabela `cotacoes_ptax(data PK, ptax_compra, ptax_venda, data_hora_cotacao, fonte, obtida_em)` — **não** `cotacoes_usd`, que é a cotação AwesomeAPI de referência já existente. Consulta: `fn_cotacao_usd(data)`. ✅ em produção (03/10/2026).
- Edge Function `cotacao-ptax` + cron diário (dias úteis, após o fechamento da
  PTAX): busca no Banco Central (API Olinda) e grava. Backfill na implantação.
- Contrato e aditivo gravam `cotacao_usd`, `cotacao_data` e `valor_total_usd`
  **no cadastro** (congelados): PTAX venda da data; sem PTAX na data (fim de
  semana/feriado/antes do fechamento) usa o último dia útil publicado — a data
  efetivamente usada fica gravada.
- Cotação nunca vem do navegador.

---

## 7. Análise por resultado

`vw_saldo_resultado` — 1 linha por resultado: original, vigente, débitos,
liberado, reservado, **remanejável**, atividades com saldo, contratos em
`aguardando_cobertura`, TDRs acima do saldo (alerta).

Tela `pages/remanejamentos.html` (nav `remanejamentos`, grupo Execução):
1. **Quadro por resultado** — onde sobra, onde falta;
2. resultado → **atividades × fontes disponíveis** (tipo, procedência, data, valor);
3. montagem do pedido escolhendo fontes, prévia antes/depois;
4. **"Aguardando minha análise"** — fila do signatário da etapa atual;
5. extrato da atividade (fontes, eventos de TDR, remanejamentos, coberturas).

Relatório A4 do remanejamento: itens, linhagem, cadeia com nome/cargo/data/hash.

---

## 8. Proteções

- Guarda em `atividades.orcamento_usd` (só o razão altera); campo somente
  leitura em `atividades.html`; `tecnico` fora da escrita do orçamento.
- `audit_log` em `atividades`, `contratos`, `cargo_titulares`.
- Idempotência por `uuid_cliente`.
- Testes SQL (`supabase/tests/remanejamento/`): Σ≠0; dois pedidos na mesma
  fonte; assinatura fora de ordem / por não titular / sem senha; edição após
  assinatura invalida cadeia; devolução volta só um passo; contrato e aditivo
  acima do saldo; contrato travado recusa produto e pagamento; liberação
  automática; estorno com destino comprometido; todas as invariantes do §2.4.

---

## 9. Fases

| Fase | Entrega |
|---|---|
| 0 | Contenção: guarda do orçamento + `audit_log` em atividades |
| 1 | Razão: `orcamento_fontes`, carga, débitos (inclui despesas sem TDR), PEPS, eventos de TDR, conferência |
| 2 | Cotação PTAX: tabela, Edge Function, cron, backfill |
| 3 | Cargos/titulares, Edge Function `assinar-remanejamento`, cadeia sequencial, e-mails — ✅ 03/10/2026 (com reserva e efetivação da fase 4; `fn_rem_salvar` via `rem_03g` no SQL Editor) |
| 4 | Remanejamento livre: reserva, alocações e efetivação ✅ (na fase 3); estorno ✅ 03/10/2026 (`rem_06`) |
| 5 | Cobertura de contrato: enum, excedente em USD, travas, liberação automática — ✅ 03/10/2026 (`rem_05*`) |
| 6 | Telas: quadro por resultado, montagem, fila, extrato — ✅ 03/10/2026 (`pages/remanejamentos.html`) |
| 7 | Relatório A4, extrato no relatório de saldo, domínio no `auditor-ia`, CLAUDE.md — ✅ 03/10/2026 (`rem_07`, `js/relatorio-remanejamento.js`, `auditor-ia` v19) |
