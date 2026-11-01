# API de dados do DIMA — v1

API **somente leitura**, com **números agregados** (o conteúdo numérico da ficha A5 —
"Ficha completa da atividade"), para painéis HTML e ferramentas de BI (Power BI, Excel,
Looker Studio, Metabase…). Não traz nome de pessoa, fornecedor, CPF/CNPJ, dado bancário
nem texto livre.

**Endereço base**

```
https://wfymnmlinonvdqfucjya.supabase.co/functions/v1/api-dados/v1
```

## Como pedir acesso

Escreva para **fundobrasilonuacre+api@gmail.com** com este modelo:

```
Assunto: Pedido de acesso à API do DIMA

Órgão: (nome da instituição)
Responsável técnico: (nome e cargo)
Finalidade: (para que os dados serão usados)
Site do painel: (ex.: https://painel.instituicao.gov.br — em branco se for só BI)
Rotas: resumo, atividades, matriz
Prazo: (até quando precisa do acesso; o padrão é 1 ano)
```

1. Se o seu domínio for confirmado pelo Gmail (DMARC/DKIM), você recebe na hora a resposta
   "recebido" com o número do pedido (`API-2026-001`).
2. A administração do DIMA analisa. Se aprovar, você recebe um **link de retirada** que vale
   **72 horas** e funciona **uma vez**.
3. Abra o link e clique em **Mostrar minha chave**. A chave é gerada nesse momento e aparece
   **uma única vez**: copie e guarde. Ela nunca vai no corpo de um e-mail.
4. Link vencido? Responda ao e-mail de aprovação pedindo um novo. Quinze dias antes de a chave
   vencer você recebe um lembrete; para renovar, mande um novo pedido.

## Autenticação

Toda chamada leva a chave no cabeçalho:

```
Authorization: Bearer dima_xxxxxxxx…
```

(ou `X-API-Key: dima_…`). A chave é exibida **uma vez** (na retirada ou na criação pela tela).
Chave errada, revogada ou vencida ⇒ `401`.

## Rotas

| Rota | Conteúdo |
|------|----------|
| `GET /v1/resumo` | Totais do projeto (orçamento, comprometido, pago, saldo em US$; TDRs, contratos, produtos, tarefas), da Matriz e por resultado (R1–R4), PTAX do dia |
| `GET /v1/atividades` | Uma linha por atividade: `orcamento` (US$, da `vw_saldo_atividade`, mesmo saldo da Visão Geral), `tdrs`, `contratos`, `execucao_direta`, `produtos` (R$), `matriz`, `tarefas` (contagens) |
| `GET /v1/matriz` | Indicadores da Matriz: meta, confirmado, pendente, % e situação (`atingida`, `em_andamento`, `sem_registro`, `qualitativa`), ODS, metas KM e atividades ligadas |

Parâmetros: `?formato=json` (padrão) ou `?formato=csv`; no CSV, `&sep=;` usa ponto e vírgula
(Excel em português). No CSV os blocos viram colunas (`orcamento_saldo_livre_usd`,
`tdrs_por_status_aprovado`, …). Números sempre com ponto decimal; datas ISO 8601.

Valores: campos `_usd` em dólar, `_brl` em real, `pct_` em 0–100. Tarefas restritas não
entram nas contagens.

## Erros

```json
{ "erro": { "codigo": "CHAVE_INVALIDA", "mensagem": "…" } }
```

| HTTP | Código | Quando |
|------|--------|--------|
| 401 | `SEM_CHAVE` / `CHAVE_INVALIDA` | sem chave, chave revogada ou vencida |
| 403 | `ESCOPO` / `ORIGEM` | rota fora da chave / navegador de domínio não liberado |
| 404 | `ROTA` / `VERSAO` | endereço errado |
| 429 | `LIMITE` | passou do limite por minuto (padrão 60); ver `Retry-After` |

Os dados mudam ao longo do dia; uma atualização a cada 15–60 minutos basta.

## Exemplos

```bash
curl -H "Authorization: Bearer $DIMA_CHAVE" \
  https://wfymnmlinonvdqfucjya.supabase.co/functions/v1/api-dados/v1/resumo
```

**Painel HTML** (o domínio do painel precisa estar em `origens` da chave):

```js
const r = await fetch('https://wfymnmlinonvdqfucjya.supabase.co/functions/v1/api-dados/v1/atividades',
  { headers: { Authorization: 'Bearer ' + CHAVE } })
const { dados } = await r.json()
```

> No navegador a chave fica visível para quem abrir o painel. Ela só lê números agregados,
> mas o ideal é o painel buscar por um servidor próprio. Se a chave vazar, revogue e crie outra.

**Power BI** — Obter dados › Web › Avançado: URL `…/v1/atividades?formato=csv`, cabeçalho
`Authorization` = `Bearer dima_…`. Ou em Power Query:

```
let
  Fonte = Csv.Document(Web.Contents("https://wfymnmlinonvdqfucjya.supabase.co/functions/v1/api-dados/v1/atividades",
            [Query=[formato="csv"], Headers=[Authorization="Bearer dima_…"]]), [Delimiter=",", Encoding=65001]),
  Tabela = Table.PromoteHeaders(Fonte)
in Tabela
```

## Versões

Mudar ou remover campo existente = nova versão (`/v2`); campo novo pode entrar na `v1`.

## Administração (super_admin)

Tela: **Configurações › Integrações (API)** (`pages/integracoes.html`) — pedidos, chaves, chamadas.
Pelo SQL Editor:

```sql
-- criar (a chave aparece só nesta resposta)
select fn_api_criar_cliente('Painel BI SEMA', 'Power BI da coordenação',
       array['resumo','atividades','matriz'],          -- escopos
       array['https://painel.exemplo.gov.br'],         -- origens do navegador (vazio = só servidor/BI)
       null);                                          -- expira em (null = 1 ano)
select * from fn_api_clientes();                       -- lista, último acesso, chamadas em 30 dias
select fn_api_revogar_cliente('<id>');                 -- revoga (não apaga)
```

Essas funções aceitam super_admin ativo logado ou o SQL Editor do Supabase (sessão do dono do
banco); pela chave pública ninguém as executa.
Cada chamada da API fica em `api_acessos` (cliente, rota, formato, status, linhas, quando).
