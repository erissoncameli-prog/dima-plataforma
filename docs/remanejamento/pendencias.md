# Remanejamento — plano do que falta (após as fases 0–8)

Situação em 03/10/2026: razão, PTAX, cadeia de 5 assinaturas, cobertura de contrato,
estorno, relatórios, auditor e guia em produção. **Nenhum pedido real ainda** (0 pedidos,
0 e-mails enviados). Este plano separa o que a equipe técnica (Claude) executa do que
depende da coordenação.

Cada etapa técnica segue o mesmo rito: migração testada no Postgres local
(`supabase/tests/remanejamento/rodar.sh`), aplicada via MCP, conferência do razão em
produção (`fn_conferir_orcamento` sem falhas), teste em transação desfeita, CLAUDE.md e
guia "Como funciona" atualizados, push na `main`.

---

## Bloco A — corrigir o que contraria regra já aprovada (sem decisão nova)

### A1. Economia de TDR com a PTAX oficial
**Problema**: `fn_liberar_economia_tdr(p_tdr_id, p_justificativa, p_taxa)` recebe a cotação do
navegador (`pages/tdrs.html`, AwesomeAPI). Regra aprovada: cotação nunca vem do navegador.
**Faz**: a função passa a converter pela PTAX do dia (`fn_cotacao_usd`) e grava a data usada;
`p_taxa` fica aceito mas ignorado (a tela antiga não quebra); a tela mostra "PTAX de dd/mm".
Estornos antigos e liberações já feitas não mudam.
**Teste**: liberação com PTAX conhecida; recusa com `COTACAO_DESATUALIZADA`; conferência.
**Esforço**: pequeno.

### A2. Trilha de auditoria (`audit_log`) em contratos e titulares
**Faz**: liga a trigger genérica `fn_trg_audit()` (já usada em `usuarios`, `fornecedores`…) em
`contratos` (valor, status, TDR, atividade — base dos aditivos) e `rem_cargo_titulares`.
Só leitura para super_admin/coordenação (policy já existe).
**Esforço**: pequeno.

### A3. Auditor IA — verificações antigas quebradas
**Problema**: agente de TDR consulta `tdrs.atividades` (coluna inexistente) e chama
`exec_sql_audit` (função que pode não existir); falha calado e não gera achado.
**Faz**: reescreve 1a com `tdrs.atividade_id` e as fases pós-aprovação
(`aprovado`, `em_licitacao`, `contratado`), remove a chamada morta. Publica `auditor-ia` v20.
**Esforço**: pequeno.

## Bloco B — completar o plano original

### B1. Revisão orçamentária formal da UNESCO
**Problema**: o razão tem o tipo `revisao_orcamentaria`, mas não há caminho para lançar.
Hoje uma revisão da UNESCO não tem como entrar sem violar a guarda do orçamento.
**Faz**: pedido do tipo `revisao` (coluna nova, sem mexer no check de `tipo`): itens por
atividade com valor + ou −, **sem** fontes de origem (o dinheiro vem/volta da UNESCO), ato/anexo
obrigatório (nº do documento da UNESCO). Mesma cadeia de assinaturas, sem a etapa 2 (não há
atividade cedendo) — **a confirmar**. Efetivação grava `revisao_orcamentaria` (+) ou ajuste (−,
só sobre saldo livre). Conferência global já trata revisões.
**Decisão necessária**: quem assina a revisão (a cadeia inteira ou só UNESCO + diretor + secretário)
e se redução pode deixar a atividade negativa (sugestão: não).
**Esforço**: médio.

### B2. Aviso de contrato travado e liberado (sino + e-mail)
**Faz**: fila nova `cobertura_notificacoes` (contrato, evento `travado|liberado`, destinatários =
coordenação + responsáveis da atividade), enviada pela mesma Edge Function de e-mail
(`assinar-remanejamento`, `acao:'drenar'`) e pelo cron de 15 min. Sino com tipos
`contrato_travado`/`contrato_liberado`.
**Atenção**: o sino exige trocar o check de `notificacoes` (DROP CONSTRAINT) → arquivo
`*_sql_editor.sql` para colar no SQL Editor (como a `rem_03g`). Sem ele, só o e-mail sai.
**Esforço**: médio.

## Bloco C — depende de decisão da coordenação

### C1. Orçamento do resultado derivado das atividades
**Problema**: R1 cadastrado com US$ 20.452,55 a mais e R2 com o mesmo valor a menos do que a soma
das atividades (pré-existente).
**Opção sugerida**: `resultados.orcamento_usd` vira cache = Σ atividades (como
`atividades.orcamento_usd` é do razão), com guarda contra edição manual. Antes, alguém confirma
**qual número está certo** — se for o do resultado, a diferença precisa de um remanejamento entre
atividades de R1 e R2.

### C2. Os 4 déficits antigos (1.5.6, 1.6.3, 2.1.6, 1.5.3)
Não se regulariza automaticamente (decisão de 03/10). Posso preparar, para cada um, um rascunho de
remanejamento de cobertura com fontes sugeridas (o maior saldo livre do mesmo resultado), para a
coordenação revisar e enviar. 2.1.6 (US$ 54,93) e 1.5.3 (US$ 0,01) são resolvíveis de imediato.

## Bloco D — com a coordenação (não é código)

- **D1. Responsáveis** em 1.1.4, 1.3.1, 2.1.1, 2.1.6, 2.1.7, 2.1.8 (Atividades › Responsáveis):
  sem eles a etapa 2 não tem quem assine e essas atividades não cedem nem estornam.
- **D2. Valor em US$** dos TDRs 1.1.2-002 e 1.5.2-002 (bloqueiam ceder da 1.1.2 e da 1.5.2).
- **D3. Teste real ponta a ponta**: pedido de US$ 10 entre duas atividades com as 5 assinaturas e
  os e-mails; depois o estorno dele. Eu acompanho pelos logs da Edge Function e pela fila de e-mails
  e corrijo o que aparecer.

---

## Ordem proposta

| # | Item | Depende de decisão? | Esforço |
|---|------|---------------------|---------|
| 1 | A1 economia pela PTAX — ✅ 03/10 (`rem_09`; vale também para encerramento de contrato) | não | pequeno |
| 2 | A3 auditor (verificações quebradas) — ✅ 03/10 (`auditor-ia` v20) | não | pequeno |
| 3 | A2 audit_log em contratos/titulares — ✅ 03/10 (`rem_10`) | não | pequeno |
| 4 | D3 teste real (com D1 feito) | — | acompanhamento |
| 5 | B2 aviso de contrato travado/liberado | não (SQL Editor p/ o sino) | médio |
| 6 | B1 revisão orçamentária UNESCO | **sim** (quem assina) | médio |
| 7 | C2 rascunhos de cobertura dos déficits | **sim** (aprovar fontes) | pequeno |
| 8 | C1 orçamento do resultado derivado | **sim** (qual número vale) | pequeno |
