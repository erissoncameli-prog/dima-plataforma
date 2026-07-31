# Arquitetura — Repositório de Referências e Acervo

**Status:** proposta (nenhum código implementado)
**Módulo:** `pages/repositorio.html` · tabela `repositorio_links`
**Autor:** arquitetura DIMA · Projeto 218BRA2001 SEMA/AC

---

## 1. Situação atual

### 1.1 O que existe

| Item | Estado |
|------|--------|
| Tabela | `repositorio_links` (15 ativos / 18 totais) |
| Página | `pages/repositorio.html` — 512 linhas, monolítica, tudo inline |
| Metadados | Edge Function `fetch-link-metadata` (Open Graph) |
| Filtros | 100% client-side (`todosLinks.filter`) |
| RLS | `repo_select` / `repo_insert` (qualquer autenticado) · `repo_update` (só `super_admin`) · sem DELETE |
| Busca | coluna `busca_tsv` (tsvector) **existe e nunca é usada** |

### 1.2 Diagnóstico — por que "não está organizado"

**A taxonomia colapsou.** Das 18 linhas, 16 estão em `Comunicação` e 2 em `Outro`. Uma
classificação em que 89% dos registros caem no mesmo rótulo não classifica nada. A causa
é estrutural: o campo `categoria` mistura três eixos ortogonais no mesmo enum de texto:

| Valor | Na verdade é… |
|-------|---------------|
| Biodiversidade, Governança, Gênero, Restauração | **tema** |
| Legislação, Relatório UNESCO | **tipo de documento** |
| Comunicação | **canal / natureza do item** |

Como toda matéria de imprensa é "Comunicação", o usuário sempre escolhe esse valor e o
tema se perde. Separar os eixos é o que resolve a organização — não adicionar mais valores
à mesma lista.

**Faltam três dimensões que o domínio exige:**

1. **`dt_publicacao`** — hoje só existe `inserido_em`. Um clipping ordenado por data de
   cadastro, e não por data de veiculação, não é um clipping. É um log.
2. **Vínculo com o projeto** — não há como responder "quais matérias saíram sobre a
   AT-012?". Esse vínculo é o que transforma o repositório de mural em **evidência de
   execução** reaproveitável em relatórios e prestação de contas.
3. **Fonte normalizada** — `fonte` é texto livre. "G1", "g1", "Portal G1" viram três
   veículos distintos e o filtro por veículo é impossível.

**Dois defeitos técnicos menores:**

- Deduplicação client-side (`todosLinks.some(l => l.url === url)`) falha com
  `?utm_source=` — o mesmo link entra várias vezes.
- Filtro client-side carrega a tabela inteira. Funciona com 18 linhas, não com 800.

**Duas correções de RLS (regra 18 do CLAUDE.md):**

- `repo_select` e `repo_insert` estão com `roles = {public}`. O predicado
  `auth.uid() IS NOT NULL` hoje protege na prática, mas a convenção do projeto é
  `TO authenticated` — `public` inclui o `anon`.
- `repo_update` tem `USING` para `super_admin` e **`WITH CHECK` nulo**. Falta o
  `WITH CHECK` correspondente.

---

## 2. O novo tipo de dado: links de pasta

O pedido é armazenar links de pastas (Google Drive e similares) com arquivos, fotos e
vídeos. Antes de modelar, é preciso enunciar a diferença que governa todo o resto:

> **Um link de matéria já é público. Um link de pasta é uma credencial.**

Uma URL do G1 não dá acesso a nada que o mundo já não tenha. Uma pasta do Drive
compartilhada como "qualquer pessoa com o link" transforma a própria URL na chave de
acesso. Guardar essa URL numa tabela legível por *qualquer usuário autenticado* concede,
na prática, acesso ao conteúdo a todos os perfis — inclusive `visualizador` e
`consultor_externo` — contornando toda a RLS construída nas camadas LGPD C0–C2.

E o conteúdo dessas pastas, num projeto socioambiental, é justamente o material mais
sensível que o projeto produz: fotos de oficinas com beneficiários identificáveis, vídeos
em comunidades tradicionais e indígenas, listas de presença. Imagem de pessoa
identificável é dado pessoal (art. 5º, I). Imagem que revela origem racial ou étnica, ou
filiação a comunidade tradicional, é **dado sensível** (art. 5º, II).

Conclusão de arquitetura: pasta não é "mais um link". É um item com **controle de acesso
próprio, classificação de dados obrigatória e trilha de acesso**.

---

## 3. Decisão estrutural: tabela única com discriminador

### 3.1 Opções avaliadas

| | A · Tabela separada `repositorio_pastas` | B · Tabela única + `tipo` | C · Base + tabelas de detalhe |
|---|---|---|---|
| Busca unificada | ✗ dois `select`, merge no cliente | ✓ um `select` | ~ view |
| Superfície de RLS | 2 conjuntos de policies | 1 | 3+ |
| Código de frontend | duplicado | compartilhado | médio |
| Colunas nulas | nenhuma | ~8 nulas por linha | nenhuma |
| Custo de um 3º tipo | +1 tabela, +1 tela | +1 valor no enum | +1 tabela |

### 3.2 Escolha: **B**

Os comportamentos compartilhados dominam — curadoria, busca, tags, eixo temático, vínculo
com atividade, soft delete, auditoria, desativação. As diferenças são ~8 colunas. Com 18
linhas hoje e centenas no horizonte, colunas nulas não custam nada; duplicar página e RLS
custa caro e é onde bugs de privacidade nascem.

Mantém-se o nome `repositorio_links` (referenciado só em `pages/repositorio.html`, sem
outras dependências) para evitar migração desnecessária.

**Novo enum `tipo_item_repo`:**

| Valor | Significado | Fase |
|-------|-------------|------|
| `materia` | matéria de imprensa, post, notícia | 1 (padrão para as 18 linhas atuais) |
| `pasta` | pasta/coleção externa (Drive, OneDrive, Dropbox, SharePoint) | 1 |
| `documento` | arquivo avulso — relatório, publicação, legislação | 2 |
| `video` | vídeo avulso — YouTube, Vimeo | 2 |

A UI expõe **Matérias** e **Acervo** na fase 1; `documento` e `video` entram sem migração.

---

## 4. Modelo de dados

### 4.1 `repositorio_links` — colunas novas

**Eixo comum**

| Coluna | Tipo | Obs |
|--------|------|-----|
| `tipo` | `tipo_item_repo` NOT NULL default `'materia'` | discriminador |
| `eixo_tematico` | text | substitui semanticamente `categoria` (tema puro) |
| `dt_publicacao` | date | data de veiculação — **eixo de ordenação do clipping** |
| `atividade_id` | uuid FK → `atividades.id` | vínculo com execução |
| `produto_entregue_id` | uuid FK | evidência de produto |
| `veiculo_id` | uuid FK → `repositorio_veiculos.id` | fonte normalizada |
| `url_normalizada` | text GENERATED | dedup — ver 4.4 |
| `atualizado_em` | timestamptz | trigger `fn_updated_at` |

`categoria` é **mantida** na fase 1 (backfill para `eixo_tematico`, leitura dupla) e só
removida na fase 5, depois que nenhum código a lê. Nada de `DROP COLUMN` no mesmo deploy
que muda o frontend.

**Eixo pasta/mídia**

| Coluna | Tipo | Obs |
|--------|------|-----|
| `provedor` | `provedor_externo` | `google_drive · onedrive · dropbox · sharepoint · youtube · vimeo · outro` — derivado do host |
| `conteudo` | text[] | `fotos · videos · documentos · planilhas · audio` |
| `qtd_itens_aprox` | integer | declarado pelo curador |
| `responsavel_id` | uuid FK → `usuarios.id` | quem controla a pasta na origem — **essencial**: só essa pessoa pode revogar |
| `credito_autoria` | text | fotógrafo/cinegrafista |
| `licenca_uso` | text | `interno · cc_by · dominio_publico · restrito` |
| `dt_validade` | date | revisão/retenção |

**Eixo LGPD** — todos NOT NULL para `tipo = 'pasta'` (ver 5.1)

| Coluna | Tipo | Obs |
|--------|------|-----|
| `categoria_dado` | `categoria_dado_repo` | `nenhum · pessoal · sensivel` |
| `visibilidade` | `visibilidade_repo` | `publico · interno · restrito` |
| `base_legal` | text | `art7_III · art7_V · art7_VI · nao_aplicavel` |
| `finalidade` | text | descrição da finalidade do tratamento |
| `autorizacao_uso_imagem` | `autorizacao_img` | `sim · nao · nao_aplicavel` |
| `termo_autorizacao_url` | text | bucket privado `repositorio-termos` |

### 4.2 `repositorio_veiculos` — nova

Normaliza a fonte. Resolve "G1" ≠ "g1" ≠ "Portal G1" e habilita o filtro por veículo.

| Coluna | Tipo |
|--------|------|
| `id` | uuid PK |
| `nome` | text NOT NULL UNIQUE |
| `dominio` | text UNIQUE — chave de auto-match no insert |
| `tipo_veiculo` | text — `portal · jornal · tv · radio · institucional · rede_social` |
| `alcance` | text — `local · estadual · nacional · internacional` |
| `ativo` | boolean |

Seed a partir dos domínios distintos já presentes nas 18 linhas.

### 4.3 `repositorio_item_url` — nova, **o cofre**

Espelha o padrão já consagrado no projeto em `beneficiario_dados_bancarios`: RLS é
*row-level*, não *column-level*, então o dado que precisa de proteção mais forte sai para
uma tabela própria, 1:1.

| Coluna | Tipo |
|--------|------|
| `item_id` | uuid PK FK → `repositorio_links.id` ON DELETE CASCADE |
| `url` | text NOT NULL |

Para `visibilidade = 'restrito'`, a URL vive **só aqui** — `repositorio_links.url` fica
NULL. Consequência funcional, e é a parte elegante:

> Todo mundo vê que o acervo *existe* — título, quantidade de fotos, atividade
> vinculada, responsável. Só quem tem permissão vê o link. Quem não tem, vê o botão
> **"Solicitar acesso"**.

Isso é melhor UX *e* melhor privacidade ao mesmo tempo: o usuário descobre o material e
sabe a quem pedir, em vez de não saber que existe. Custo: um `join` a mais nas leituras
de detalhe (`select('*, repositorio_item_url(url)')`, que retorna vazio quando a policy
nega — sem erro, exatamente como `carregarBenef()` já faz em `pages/viagens.html`).

**Alternativa mais simples, se o custo do join incomodar:** RLS de linha inteira na
`repositorio_links` — itens restritos somem da lista para quem não pode ver. Fica
registrada, mas **não é a recomendação**: perde-se a descoberta e o fluxo de solicitação,
e a experiência vira "o material não existe" em vez de "o material é restrito".

### 4.4 Deduplicação por URL normalizada

Coluna gerada + índice único parcial:

```sql
url_normalizada text GENERATED ALWAYS AS (
  regexp_replace(
    lower(regexp_replace(coalesce(url,''), '[?&](utm_[^&]*|fbclid|gclid|usp|authuser)=[^&]*', '', 'g')),
    '/+$', ''
  )
) STORED;

CREATE UNIQUE INDEX repo_url_uniq ON repositorio_links (url_normalizada) WHERE ativo;
```

O banco passa a ser a autoridade sobre duplicidade — a checagem no cliente vira apenas
aviso antecipado, não a garantia.

### 4.5 Busca full-text (ativar o que já existe)

`busca_tsv` existe e está morta. Passa a ser alimentada por trigger sobre
`titulo · descricao · fonte · eixo_tematico · tags · veículo`, com índice GIN, e o
frontend consulta com `websearch_to_tsquery('portuguese', ...)` em vez de filtrar array
no cliente.

---

## 5. Camada LGPD

> Esta seção estende a política vigente do CLAUDE.md (seção "Privacidade e LGPD"). Nada
> aqui contradiz as camadas C0–C2; o módulo herda o modelo e o aplica ao seu domínio.

### 5.1 Classificação obrigatória na entrada — o registro é o ROPA

Nenhuma pasta é salva sem `categoria_dado`, `base_legal`, `finalidade` e
`autorizacao_uso_imagem`. Não como "boa prática", mas por **constraint no banco**:

```sql
ALTER TABLE repositorio_links ADD CONSTRAINT repo_lgpd_pasta CHECK (
  tipo <> 'pasta' OR (
    categoria_dado IS NOT NULL AND visibilidade IS NOT NULL AND
    base_legal IS NOT NULL AND finalidade IS NOT NULL AND
    autorizacao_uso_imagem IS NOT NULL AND responsavel_id IS NOT NULL
  )
);
```

Efeito colateral valioso: a tabela vira o **ROPA em nível de registro** para este módulo —
finalidade, base legal, categoria de dado, responsável e operador (provedor). Um dos
pendentes da Camada 4 ("ROPA não produzido") passa a estar coberto para o repositório, com
dado vivo em vez de planilha que envelhece.

### 5.2 Defaults que falham para o lado seguro

| Condição | Default |
|----------|---------|
| `tipo = 'pasta'` | `categoria_dado = 'pessoal'`, `visibilidade = 'restrito'` |
| `conteudo` contém `fotos` ou `videos` | `autorizacao_uso_imagem` obrigatório ≠ `nao_aplicavel` |
| `categoria_dado = 'sensivel'` | `visibilidade` travado em `restrito` (CHECK) |
| `visibilidade = 'publico'` | exige `categoria_dado = 'nenhum'` **e** `autorizacao_uso_imagem <> 'nao'` (CHECK) |

Desclassificar é ato consciente do curador; classificar como sensível nunca depende de
alguém lembrar.

### 5.3 RLS

```
repositorio_links
  SELECT  TO authenticated  — itens com categoria_dado='nenhum': todos os autenticados
                            — 'pessoal' / 'sensivel': super_admin, coordenacao, tecnico
                              (espelha a policy de `beneficiarios`, C2)
  INSERT  TO authenticated  — WITH CHECK (inserido_por = auth.uid())
  UPDATE  TO authenticated  — super_admin/coordenacao, com USING **e** WITH CHECK
  DELETE  — nenhuma policy. Curadoria é imutável; baixa é `ativo = false`.

repositorio_item_url
  SELECT  TO authenticated  — só super_admin/coordenacao/tecnico, e só quando o item
                              tem visibilidade <> 'restrito' OU o usuário é
                              responsavel_id OU tem acesso concedido (5.5)
  INSERT/UPDATE  — super_admin/coordenacao

repositorio_veiculos
  SELECT  TO authenticated · INSERT/UPDATE  super_admin/coordenacao
```

Sem policy `TO public`, sem `USING (true)`, **nenhum `GRANT` ao `anon`** (regras 17 e 18).

### 5.4 Portal público via `SECURITY DEFINER`

Consumo público segue o padrão `fn_publico_*` já usado em `fn_publico_mapa`,
`fn_publico_resultados` etc.:

```sql
CREATE FUNCTION fn_publico_repositorio() RETURNS TABLE (...) SECURITY DEFINER AS $$
  SELECT id, titulo, descricao, url, imagem_url, dt_publicacao, eixo_tematico, veiculo
  FROM repositorio_links
  WHERE ativo
    AND visibilidade = 'publico'
    AND categoria_dado = 'nenhum'
    AND autorizacao_uso_imagem <> 'nao'
    AND tipo IN ('materia','documento');
$$;
```

Pasta **nunca** é exposta no portal público, mesmo classificada como `nenhum` — link de
coleção externa não tem controle de acesso auditável do lado de cá.

### 5.5 Trilha de acesso — art. 37

Duas trilhas, complementares:

1. **Mudanças no registro** → trigger genérica `fn_trg_audit()` (já existe, C2) ligada em
   `repositorio_links` e `repositorio_item_url`. Em `repositorio_item_url` a trigger é
   chamada em modo **`'redigir'`** — igual a `beneficiario_dados_bancarios`. Sabe-se *que*
   a URL mudou e *quem* mudou; o valor nunca vai para o log.
2. **Revelação de URL restrita** → tabela `repositorio_acessos`
   (`item_id, usuario_id, acessado_em, motivo`). Toda vez que a URL de um item restrito é
   revelada na tela, grava-se a linha. Imutável, leitura para
   `super_admin`/`coordenacao`. É isso que permite responder "quem teve acesso às fotos da
   oficina de Xapuri" — pergunta que hoje não tem resposta.

`repositorio_solicitacoes` (`item_id, solicitante_id, justificativa, status, decidido_por`)
sustenta o botão "Solicitar acesso" e produz o mesmo registro por outro caminho.

### 5.6 Sanitização da URL na entrada

Links de Drive frequentemente carregam rastro pessoal: `authuser=fulano@sema.ac.gov.br`,
`usp=sharing`, `resourcekey`, além de `utm_*` e `fbclid`. Função
`fn_sanitizar_url_externa(text)` aplicada em trigger `BEFORE INSERT/UPDATE` preserva
apenas os parâmetros funcionais (id do recurso) e descarta o resto. O e-mail de quem
compartilhou não é dado do projeto e não deve ser persistido.

### 5.7 Não replicar conteúdo

Existe `importar-arquivo-drive`, que baixa do Drive e grava no Storage — legítimo para o
`.docx` de um TDR individual. **Não deve ser estendido a pastas.** Espelhar uma pasta de
fotos de beneficiários:

- duplica a superfície de dado pessoal (dois lugares para vazar, dois para apagar num
  pedido de eliminação — art. 18, VI);
- consome cota de Storage monitorada em `pages/banco-dados.html`;
- cria cópia que sobrevive à revogação do acesso na origem, quebrando a expectativa de
  quem compartilhou.

Guarda-se a **referência**, não a cópia. Única exceção: uma imagem de capa, e apenas se
não houver pessoa identificável — sujeita à mesma checagem de `autorizacao_uso_imagem`.

### 5.8 Metadados e IA

- `fetch-link-metadata` **não é chamada** para `tipo = 'pasta'`. Buscar OG de pasta
  restrita não retorna nada útil e, se retornar, é preview de conteúdo privado gravado em
  coluna de leitura mais ampla. A detecção de provedor é feita por regex de host no
  cliente, sem requisição.
- Nenhum conteúdo de pasta — nome de arquivo, descrição, listagem — é enviado à Anthropic.
  Se o auditor IA passar a analisar o repositório, ele lê apenas metadados de
  classificação (`tipo`, `categoria_dado`, `base_legal`, datas), nunca `url`,
  `descricao` de item restrito ou nome de responsável.

### 5.9 Transferência internacional — art. 33

Google (Drive), Microsoft (OneDrive/SharePoint) e Dropbox são operadores fora do país. O
CLAUDE.md registra como pendente o tratamento formal do art. 33. A coluna `provedor` gera
automaticamente a lista de operadores em uso, com finalidade e categoria de dado ao lado —
insumo direto para o documento. Complemento na UI: ao classificar uma pasta como
`sensivel` em provedor estrangeiro, exibir aviso de que o caso exige avaliação do
Encarregado antes do compartilhamento.

### 5.10 Retenção

`dt_validade` + view `vw_repositorio_vencidos` alimentando o painel de curadoria e o
auditor IA. Limite honesto, que deve constar da documentação: **a plataforma não apaga
conteúdo de terceiros.** O que ela entrega é o registro de que o item venceu, quem é o
responsável por revogar na origem e o marco temporal da decisão. Prometer mais seria
falso.

### 5.11 Bucket novo

| Bucket | Visibilidade | Conteúdo |
|--------|--------------|----------|
| `repositorio-termos` | 🔒 privado | termos de autorização de uso de imagem |

Leitura só por URL assinada, pelos helpers `data-arquivo` / `abrirDoc()` / `urlAssinada()`
(regra 19). Nada de `href` direto.

---

## 6. Fluxo de inserção

Modal único, com bifurcação automática — o usuário não escolhe o tipo, o sistema deduz e
ele confirma.

```
┌─ Passo 1 · Cole o link ─────────────────────────────────────┐
│ https://…                                          [Analisar] │
└──────────────────────────────────────────────────────────────┘
        │
        ├─ host = drive.google.com/drive/folders, 1drv.ms,
        │         dropbox.com/scl/fo, sharepoint.com  →  PASTA
        ├─ host = youtube.com, vimeo.com               →  VÍDEO
        └─ demais                                      →  MATÉRIA
```

**Ramo MATÉRIA** — `fetch-link-metadata` preenche título, descrição, imagem, idioma
(fluxo atual, preservado). Usuário completa:

- veículo (auto-match por domínio em `repositorio_veiculos`; se novo, cadastro inline)
- **data de publicação** (pré-preenchida do `article:published_time` do OG quando houver)
- eixo temático · tags
- atividade / produto vinculado (`select` buscável)

**Ramo PASTA** — sem fetch. Formulário manual em duas seções visualmente distintas:

*Identificação:* título · descrição · provedor (detectado, travado) · tipos de conteúdo
(chips múltiplos) · quantidade aproximada · responsável pela pasta · atividade vinculada ·
crédito de autoria.

*Conformidade (bloco destacado, obrigatório):* contém dado pessoal? → categoria do dado →
base legal → finalidade → autorização de uso de imagem (+ upload do termo) → visibilidade
→ data de validade.

Antes de salvar, **resumo de conformidade** — três linhas em texto claro, sem jargão:

> 🔒 Este acervo contém **dado pessoal sensível** (fotos de comunidade tradicional).
> Ficará **restrito** a Coordenação, Super Admin e Técnicos. O link não aparecerá para
> os demais perfis, que verão apenas o título e poderão solicitar acesso.
> Responsável pela pasta na origem: **Maria Silva**. Revisão prevista: **12/2026**.

Sem esse resumo, o usuário clica em selects sem entender a consequência e a classificação
vira ruído. Com ele, a decisão é informada — e é a decisão informada que a LGPD exige.

**Fase 3 — colagem em lote:** clipping chega em blocos. Textarea com N URLs → uma linha
por link com classificação em massa (mesmo eixo, mesma atividade) e revisão individual.

---

## 7. Fluxo de consumo

### 7.1 Página `repositorio.html` reestruturada

Três abas sobre a mesma tabela:

**Tudo** — busca full-text global, ordenada por relevância.

**Matérias** — timeline agrupada por mês de `dt_publicacao`, não por data de cadastro.
Filtros: período · veículo · alcance · eixo · atividade · idioma. Cabeçalho com métricas
que interessam a um projeto UNESCO: matérias no mês, veículos distintos, alcance
(local/estadual/nacional/internacional), atividades com cobertura.

**Acervo** — grid de cards. Cada card: ícone do provedor · título · chips de conteúdo
(📷 fotos · 🎬 vídeos · 📄 docs) · quantidade · atividade vinculada · **badge de acesso**
(🔓 interno · 🔒 restrito · 🌐 público) · responsável. Clique abre o detalhe com "Abrir
pasta ↗" ou "Solicitar acesso", conforme a permissão.

Refatoração de código: a página monolítica de 512 linhas passa a `pages/repositorio.html`
(casca + modais fora do `#app`, regra 11) + `js/repositorio.js` no padrão IIFE do projeto,
alinhando com `js/produtos.js` e `js/auditoria.js`.

### 7.2 Consumo fora da página — onde está o valor real

| Onde | O quê |
|------|-------|
| `pages/atividades.html` | aba **"Mídia & Acervo"** por atividade — repercussão e material de campo vinculados à AT |
| `pages/produtos.html` | acervo vinculado como evidência complementar de entrega |
| `pages/relatorios.html` | seção **"Repercussão na mídia"** — matérias por período, veículo e alcance, exportável (a Edge Function `gerar-pdf-relatorio` já existe) |
| `pages/publico.html` | só o que passa por `fn_publico_repositorio()` (5.4) |
| `auditor-ia` | novo domínio `qualidade_dados`: matéria sem atividade vinculada · pasta sem base legal · item vencido · pasta com foto sem termo de autorização · classificado `publico` com dado pessoal |
| `pages/dashboard.html` | card "Repercussão do mês" |

O auditor fechando o ciclo é o que impede a taxonomia de colapsar de novo: registro mal
classificado vira achado, não fica invisível.

---

## 8. Migração dos 18 registros

Sem perda, sem intervenção manual:

1. `tipo = 'materia'` para todos.
2. `eixo_tematico ← categoria`, exceto `Comunicação` → `NULL` (não é tema; a natureza já
   está em `tipo`). Os 16 registros entram na fila de recuradoria do painel.
3. `categoria_dado = 'nenhum'`, `visibilidade = 'publico'` — são matérias de imprensa,
   já públicas por definição.
4. `dt_publicacao ← NULL`; backfill via `fetch-link-metadata` (`article:published_time`)
   num passe único; o que não resolver fica para o curador.
5. `veiculo_id` por match de domínio contra o seed de `repositorio_veiculos`.
6. Os 3 inativos permanecem inativos.
7. `categoria` mantida até a fase 5.

---

## 9. Fases

| Fase | Entrega | Depende de |
|------|---------|-----------|
| **1 · Fundação** | migration: enums, colunas, `repositorio_veiculos`, `repositorio_item_url`, `repositorio_acessos`, `repositorio_solicitacoes`, CHECKs LGPD, RLS `TO authenticated`, `fn_publico_repositorio`, `fn_sanitizar_url_externa`, trigger de `busca_tsv`, `fn_trg_audit` (modo redigir na URL), bucket `repositorio-termos`, backfill | — |
| **2 · Inserção** | modal bifurcado, detecção de provedor, bloco de conformidade, resumo pré-save, dedup por índice, cadastro inline de veículo | 1 |
| **3 · Consumo** | 3 abas, timeline por publicação, busca server-side, grid de acervo, solicitar acesso, extração para `js/repositorio.js` | 1, 2 |
| **4 · Integração** | atividades · produtos · relatórios · portal público · auditor IA · dashboard | 3 |
| **5 · Encerramento** | `DROP COLUMN categoria`, ROPA do módulo gerado do banco, aviso de privacidade do repositório, rotina de retenção | 4 |

Fases 1 e 2 já entregam valor sozinhas: o cadastro de pastas passa a existir, classificado
e protegido, mesmo antes da nova tela de consumo.

---

## 10. Riscos e limites — o que esta arquitetura **não** resolve

**O controle real da pasta está no Drive, não aqui.** Se a pasta está como "qualquer
pessoa com o link", quem obteve a URL antes continua com acesso, independentemente da RLS
desta plataforma. O que a arquitetura garante é que a plataforma **não amplifica** o
vazamento e **registra** quem obteve o link por meio dela. A recomendação operacional que
acompanha a entrega — e que precisa estar na documentação, não só no código — é manter
pastas com dado pessoal restritas por conta no Drive, com o link servindo de atalho, não
de credencial.

**Custo cognitivo do formulário de pasta.** São ~7 campos de conformidade. Curador
apressado escolhe o default e segue. Por isso os defaults falham para o lado seguro (5.2)
e o resumo pré-save existe (§6): o caminho de menor esforço é também o mais protegido.

**O `join` de `repositorio_item_url`.** Toda leitura de detalhe ganha um embed. É o preço
do modelo "vê que existe, não vê o link". A alternativa sem join está registrada em 4.3.

**Recuradoria dos 16 registros existentes.** A migração automática leva até onde dá;
eixo temático e data de publicação de parte deles vão exigir alguém revisando. É trabalho
humano, uma vez, e o painel de pendências torna ele visível em vez de opcional.
