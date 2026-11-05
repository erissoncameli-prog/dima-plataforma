# Backup do banco DIMA — como subir na sua máquina

Backup do projeto Supabase **Projeto-SEMA-UNESCO** (`wfymnmlinonvdqfucjya`),
PostgreSQL 17, região `sa-east-1`. Gerado em **05/11/2026**.

> **Nome do banco**: o database chama-se `postgres` (padrão do Supabase — o que
> identifica o projeto é o host, não o nome do banco). No restore local ele é
> criado como `dima_local`.

## Arquivos

| Arquivo | Conteúdo | Tamanho | No Git? |
|---|---|---|---|
| `01_schema.sql` | Estrutura completa: 14 enums, 140 tabelas, 299 FKs, 71 UNIQUE, 151 CHECK, 338 índices, 325 funções, 23 views, 141 triggers, 2 rules, 254 policies de RLS, grants, 48 comentários | 940 KB | ✅ sim |
| `02_dados.sql` | Dados — 9.578 linhas em 110 tabelas (TDRs, contratos, produtos, financeiro, razão orçamentário, viagens, tarefas, diagnóstico, pulso, API, auditoria) | 11 MB | ❌ **não** |
| `03_geodados.sql` | `apa_demarcacoes` (11 camadas GeoJSON) + `car_dados_locais` (53.594 imóveis) | 37 MB | ❌ **não** |
| `restaurar.sh` | Restaura em 3 passos e confere o resultado | — | ✅ |
| `docker-compose.yml` | Postgres 17 local na porta 5433 | — | ✅ |
| `dump_completo.sh` | Backup oficial com `pg_dump` (para a rotina) | — | ✅ |

**Total: 63.183 linhas, 140 tabelas.**

> ⚠️ **Os dois arquivos de dados não vão para o repositório, de propósito.**
> Contêm CPF, passaporte, dados bancários, e-mails e hash de senha temporária
> (`beneficiarios`, `beneficiario_dados_bancarios`, `fornecedor_dados_bancarios`,
> `fornecedores`, `viagem_viajantes`, `diag_fichas_identificacao`, `usuarios`,
> `usuario_senha_temporaria`, `audit_log`). Commitar isso deixaria dado pessoal
> no histórico do Git de forma praticamente irreversível, num repositório que
> publica na Vercel — ver CLAUDE.md, seção *Privacidade e LGPD*. Guarde-os em
> disco seu; o `.gitignore` deste diretório já os bloqueia.

---

## Passo a passo

### 1. Coloque os arquivos na pasta

Baixe os arquivos, ponha todos em uma pasta `backup/` e descompacte os dados:

```bash
cd backup
gunzip 02_dados.sql.gz 03_geodados.sql.gz
```

O `restaurar.sh` também aceita os arquivos ainda compactados — se preferir,
pule o `gunzip`.

### 2. Suba um Postgres local

**Opção A — Docker (recomendado: é a mesma versão da produção):**

```bash
docker compose up -d
docker compose ps        # espere ficar "healthy" (~10 s)
```

**Opção B — Postgres já instalado:** não precisa do Docker; só ajuste as
variáveis no passo 3. Precisa ser **PostgreSQL 13 ou superior** (as colunas
`GENERATED ALWAYS AS ... STORED` exigem 12+, e `pg_sequences`, 10+) e ter o
pacote **contrib** (traz `pgcrypto` e `uuid-ossp`, obrigatórias).

### 3. Restaure

```bash
chmod +x restaurar.sh
./restaurar.sh
```

Com um Postgres próprio, na porta padrão:

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=suasenha ./restaurar.sh
```

O script recria o banco `dima_local`, roda os três arquivos na ordem certa e
imprime a conferência. Leva menos de um minuto. No fim deve aparecer:

```
tabelas:  140
views:    23
funcoes:  325
policies: 254
triggers: 141
linhas:   63183
```

Se algum número divergir, algo falhou — rode de novo sem `-q` para ver o erro.

### 4. Conecte

```bash
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d dima_local
```

Teste rápido — tem de bater com a Visão Geral da plataforma:

```sql
SELECT codigo, orcamento_usd, comprometido_usd, saldo_livre_usd, status_saldo
FROM vw_saldo_atividade ORDER BY codigo;

SELECT * FROM vw_dashboard_kpis;
SELECT atividade_id, debito_usd, saldo_usd, remanejavel_usd FROM vw_orcamento_atividade;
```

### 5. (Opcional) Apontar o frontend para o banco local

O frontend fala com a API REST do Supabase, não direto com o Postgres. Para
usá-lo contra este banco é preciso uma stack Supabase local:

```bash
npm install -g supabase
supabase init && supabase start      # sobe Postgres + PostgREST + GoTrue
psql -h localhost -p 54322 -U postgres -d postgres -f 01_schema.sql
psql -h localhost -p 54322 -U postgres -d postgres -f 02_dados.sql
```

Depois troque `SUPABASE_URL` e `SUPABASE_ANON_KEY` em `js/config.js` pelos
valores que o `supabase start` imprime. **Não commite essa alteração.**

---

## Como este backup foi conferido

O restore foi executado num PostgreSQL limpo antes da entrega:

- **0 erros** nos três arquivos.
- Objetos idênticos à produção: 140 tabelas, 23 views, 325 funções, 254
  policies, 141 triggers, 338 índices, 14 enums, 299 FKs.
- Assinatura de colunas (MD5 de tabela + colunas em ordem) idêntica:
  `32852e538bef2e90511ff72ece611892`.
- Views de negócio com **o mesmo resultado** da produção:
  `vw_saldo_atividade` (MD5 `0248bb10aa5aa770494275a44a309df8`),
  `vw_dashboard_kpis` (`28/1735992.00/1344715.53/7`),
  `vw_acervo_obras` (`182/90/80`),
  `vw_orcamento_atividade` (MD5 `1427a46caac522a53f52bc34c2629719`).

Uma ressalva honesta: é um backup **a quente**. Entre o dump e a conferência,
duas linhas novas entraram em `audit_log` na produção (3.378 no arquivo, 3.380
agora). Nenhum dado operacional mudou.

---

## O que este backup NÃO tem

Itens inacessíveis pela API, que só vêm num `pg_dump` de verdade
(use o `dump_completo.sh`):

- **`auth.users` real** — senhas, sessões e identidades do GoTrue. O
  `01_schema.sql` cria um *stub* de `auth.users`/`auth.identities` e o
  `02_dados.sql` o popula com id e e-mail a partir de `public.usuarios`, só
  para as FKs fecharem. **Login não funciona neste banco local** — é um banco
  para consultar dados e testar SQL, não para autenticar.
- **`storage.objects` e `storage.buckets`** — há um stub vazio. As URLs seguem
  gravadas nas tabelas, mas os PDFs, fotos e áudios estão nos buckets do
  Supabase, não aqui.
- **Edge Functions, crons e secrets** — vivem em `supabase/functions/` e nas
  configurações do projeto, não no banco.
- **Extensões `pg_cron`, `pg_net`, `supabase_vault`, `pg_stat_statements`** —
  só existem no Supabase. O schema tenta criar e segue adiante com um aviso;
  nada do que a plataforma consulta depende delas.

## Decisões do restore (de propósito)

- **`SET session_replication_role = replica`** durante a carga: desliga
  triggers e checagem de FK. Sem isso, as triggers de negócio (razão
  orçamentário, lançamento financeiro, notificações, numeração, auditoria)
  reescreveriam os dados durante o restore e o banco local sairia diferente da
  produção. O arquivo volta o modo para `origin` no fim.
- **`SET check_function_bodies = off`** e ordem em duas etapas: 317 funções
  antes das tabelas (duas tabelas têm DEFAULT de coluna que chama função) e 8
  depois (a assinatura delas usa o tipo-linha de uma tabela).
- **Views em ordem topológica** — 23 views em 3 níveis de dependência.
- **Colunas `GENERATED`** (`contratos.saldo_brl`, `riscos.pontuacao`,
  `repositorio_links.busca_tsv`, `diag_questionarios.hash_sha256`,
  `pulso_ciclos.perguntas` quando derivada) não aparecem nos `INSERT` — o
  Postgres as recalcula, como na produção.
- **`GENERATED ALWAYS AS IDENTITY`** (`api_acessos.id`,
  `contrato_coberturas.seq`): os `INSERT` usam `OVERRIDING SYSTEM VALUE` para
  preservar os valores originais.
- **Papéis `anon`, `authenticated`, `service_role`, `authenticator`** são
  criados sem login, só para policies e grants poderem ser aplicados.
- **Rules de log imutável** (`tdr_acoes`) ficam por último, para não bloquear a
  carga.

## Backup de rotina

```bash
./dump_completo.sh
```

Precisa de `pg_dump` 17+ e da senha do banco (painel do Supabase → Project
Settings → Database). Leva também os schemas `auth` e `storage`.

O Supabase mantém backups automáticos diários no painel (Database → Backups),
mas com retenção limitada e restauráveis só para dentro do próprio Supabase.
