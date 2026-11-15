# Patrimônio — gestão dos bens adquiridos pelo projeto · especificação

Status: **aprovado (15/11/2026), Fase 1 em produção** (migração `20261115_pat_01_cadastro`, tela `pages/patrimonio.html`).
Decisões D1–D7 tomadas pelas recomendações (§12). Este documento é o contrato das migrações `2026xxxx_pat_*`.

---

## 0. Diagnóstico de partida (banco em 15/11/2026)

| Achado | Consequência |
|---|---|
| Não existe nenhuma tabela de bem, patrimônio, inventário ou sinistro | módulo novo, sem migração de dado legado de tabela |
| Contrato **4500574049** (tipo `Equipamentos`, ativ. 2.1.4, TDR 2.1.4-006): sonorização — caixas amplificadas, mesa digital, microfones sem fio — R$ 20.714,50, **pago em 27/10/2026, encerrado** | já há bem comprado e pago **sem registro patrimonial**; é o primeiro caso de carga (§9) e o primeiro alerta do auditor |
| Um único produto de contrato ("entregar a totalidade dos equipamentos") cobre vários bens | 1 `contratos_produtos` → N bens; o valor de cada bem vem da nota fiscal, não do produto |
| Lançamento do contrato acima sem `numero_nf` | a incorporação precisa pedir a NF (número + PDF); sem NF o bem fica "incorporação provisória" |
| Atividades de aquisição a caminho: **1.1.3** (5 tendas 12×12 + 40 barracas, TDR em licitação, R$ 108 mil) e **1.6.1** (2 estações de trabalho, 2 TDRs aprovados, R$ 288 mil) | o módulo precisa estar pronto para receber lotes (40 barracas = 40 bens ou 1 lote — §3.2) |
| `contratos.tipo = 'Equipamentos'` e `execucao_financeira.elemento_despesa` são texto livre ("Equipamento", "33903", nulo) | a origem do bem é ligada pelo **contrato/produto/lançamento**, não pelo elemento de despesa |
| `qrcode-generator.js` (MIT) já está no repositório | etiqueta com QR sem biblioteca nova; **leitura** de QR pela câmera precisa de uma (§6) |

---

## 1. Princípios (os mesmos do razão orçamentário)

1. **O bem tem uma ficha e uma vida.** A ficha (o que é) muda pouco; a vida (onde está, com quem,
   em que estado, quanto vale) é um **razão de eventos imutável**. Situação, local, responsável e
   condição atuais são *cache* gravado só pelos eventos — UPDATE direto é recusado por trigger
   (como `atividades.orcamento_usd`).
2. **Nada se apaga.** Bem não sai da tabela: sai por **baixa** (evento). Evento errado = estorno.
3. **Tudo no banco.** Depreciação, valor contábil, validação e cadeia de aprovação vivem em
   função/view. A tela só desenha.
4. **Origem rastreável.** Todo bem comprado pelo projeto aponta para contrato, produto,
   lançamento (pagamento), NF, atividade e TDR. Bem sem origem no projeto (cessão, doação) declara
   a origem e o documento.
5. **Patrimônio não mexe no saldo.** Depreciação e baixa são controle físico-contábil: **não**
   entram em `vw_saldo_atividade` nem no razão `orcamento_fontes`. Custo de manutenção ou conserto
   pago pelo projeto continua sendo um lançamento normal do Financeiro, só ligado ao bem.
6. **Quem guarda assina.** Receber um bem sob guarda, devolver, dar baixa e transferir em definitivo
   pedem a senha de login reconfirmada no servidor (Edge Function `assinar-remanejamento`, ações novas).

---

## 2. Modelo de dados

### 2.1 Catálogos (editáveis por super_admin/coordenação, sem DELETE — desativar)

**`pat_categorias`** — vida útil e valor residual por classe de bem (base da depreciação).

| Coluna | Obs |
|---|---|
| `codigo` PK, `nome`, `icone` | ex.: `informatica`, "Equipamentos de processamento de dados" |
| `vida_util_meses` | ex.: 60 |
| `residual_pct` | ex.: 10 |
| `controle` | `individual` (cada unidade tem placa) \| `lote` (ex.: 40 barracas iguais) |
| `exige_serie` | boolean — informática, áudio: nº de série obrigatório |
| `ativo`, `ordem` | |

Carga inicial sugerida (referência: tabela de vida útil da STN, Macrofunção SIAFI 02.03.30 —
**a conferir com a contabilidade da SEMA/UNESCO antes da Fase 1**):

| Categoria | Vida útil | Residual |
|---|---|---|
| Equipamentos de processamento de dados (notebook, estação, servidor) | 5 anos | 10% |
| Aparelhos e equipamentos de comunicação (rádio, GPS) | 10 anos | 20% |
| Equipamentos de áudio, vídeo e foto (sonorização, projetor, câmera, drone) | 10 anos | 10% |
| Máquinas, utensílios e equipamentos diversos | 10 anos | 10% |
| Mobiliário em geral | 10 anos | 10% |
| Tendas, barracas e estruturas desmontáveis | 5 anos | 10% |
| Veículos e embarcações | 15 anos | 10% |

**`pat_locais`** — onde o bem pode estar: sede SEMA, unidade/escritório, APA, depósito, "em trânsito",
"em manutenção externa". Hierarquia simples (`local_pai_id`), `lat/lon` opcional (aparece no Mapa
Interativo numa fase posterior). Desativar, nunca apagar.

### 2.2 A ficha do bem — `pat_bens`

| Coluna | Obs |
|---|---|
| `id` uuid PK | |
| `numero` | nº de tombamento gerado pelo banco: **`PAT-000123`** (sequência própria; nunca reaproveitado) |
| `numero_unesco` / `numero_sema` | placas externas, opcionais (UNESCO costuma ter inventário próprio; SEMA tomba ao receber) |
| `categoria_codigo` FK | |
| `descricao`, `marca`, `modelo`, `numero_serie`, `especificacao` | `numero_serie` único quando preenchido |
| `quantidade` | 1 para `individual`; N para lote (§3.2) |
| `origem` | `compra_projeto` \| `cessao` \| `doacao_recebida` \| `outra` |
| `contrato_id`, `contrato_produto_id`, `lancamento_id`, `fornecedor_id`, `atividade_id`, `tdr_id` | ligação com a compra (preenchida pelo banco a partir do contrato/produto) |
| `nf_numero`, `nf_data`, `nf_url` | NF da compra (bucket privado `patrimonio-docs`) |
| `dt_aquisicao` | data da NF / recebimento |
| `dt_inicio_uso` | início da depreciação (mês seguinte ao início de uso) |
| `valor_aquisicao_brl` | valor do item na NF (o rateio de um produto em vários bens fecha com o valor pago — §3.1) |
| `valor_aquisicao_usd`, `cotacao`, `cotacao_origem` | US$ pelo **câmbio UNESCO do pagamento** (`valor_usd_unesco` do lançamento, rateado), igual ao razão; sem ele, PTAX do dia da NF (`fn_cotacao_usd`) |
| `garantia_ate`, `garantia_obs` | aviso no sino 30 dias antes |
| `titularidade` | `unesco_projeto` \| `sema` \| `terceiro` (§8) |
| **cache** (só eventos gravam): `situacao`, `condicao`, `local_id`, `responsavel_id`, `ultimo_inventario_em` | |
| `criado_por`, `criado_em`, `atualizado_em` | `fn_trg_audit` |

`situacao` ∈ `em_estoque` · `em_uso` · `emprestado` · `em_manutencao` · `extraviado` · `baixado` · `transferido`.
`condicao` ∈ `novo` · `bom` · `regular` · `ruim` · `inservivel`.

### 2.3 A vida do bem — `pat_eventos` (razão imutável)

Uma linha por fato; sem UPDATE/DELETE para ninguém; correção = evento `estorno` apontando para o errado.

| Tipo | O que muda no cache | Exige |
|---|---|---|
| `incorporacao` | nasce `em_estoque`, `condicao = novo` | NF (ou justificativa de provisória), local |
| `distribuicao` | `em_uso`, local, responsável | **termo de responsabilidade aceito com senha** pelo novo responsável |
| `transferencia_interna` | local e/ou responsável | aceite do novo responsável; o anterior é desonerado |
| `devolucao` | `em_estoque`, responsável = nenhum | conferência da condição por quem recebe |
| `emprestimo` (cautela) | `emprestado`, `devolver_ate` | termo; tarefa "Devolver bem" no prazo; atraso avisa no sino |
| `manutencao_saida` / `manutencao_retorno` | `em_manutencao` ↔ situação anterior | fornecedor/oficina, OS, laudo; custo → lançamento do Financeiro (opcional) |
| `condicao` | `condicao` | motivo + foto |
| `reavaliacao` / `reducao_recuperavel` | novo valor-base da depreciação | laudo; só coordenação |
| `ocorrencia` | conforme o tipo (extravio ⇒ `extraviado`) | ver §4 |
| `inventario` | `ultimo_inventario_em`, condição/local constatados | ver §5 |
| `baixa` | `baixado` (fim) | **pedido + aprovação com senha** por outra pessoa (§4.3) |
| `transferencia_definitiva` | `transferido`, `titularidade = sema` | termo de doação/transferência (§8) |
| `estorno` | desfaz o evento apontado | justificativa; só coordenação/super_admin |

Colunas: `bem_id`, `tipo`, `dt_evento`, `local_de/para`, `responsavel_de/para`, `condicao_de/para`,
`valor`, `documento_url`, `observacao`, `referencia` (ocorrência, inventário, pedido de baixa…),
`hash` (SHA-256 do que foi aceito), `registrado_por`, `registrado_em`, `estorno_de`.

**Termo de responsabilidade** (`pat_termos`): um documento por entrega a uma pessoa, com a lista
de bens, gerado em A4 (FolhaA4). A pessoa recebe tarefa "Aceitar termo de responsabilidade" e aceita
com a senha. Termo pendente há mais de 5 dias ⇒ aviso ao gestor.

### 2.4 Depreciação — calculada, não gravada

`fn_pat_valor(bem_id, data)` e `vw_pat_bens` (security_invoker) devolvem, para hoje ou qualquer data:
`depreciacao_acumulada`, `valor_contabil`, `meses_depreciados`, `vida_restante_meses`, `totalmente_depreciado`.

- Método **linear mensal**: (valor-base − residual) ÷ vida útil, a partir do mês seguinte a `dt_inicio_uso`;
  para no valor residual; bem baixado para de depreciar no mês da baixa.
- Reavaliação/redução ao recuperável mudam o valor-base dali em diante (evento, não UPDATE).
- `vw_pat_depreciacao_mensal` = mapa mês a mês por bem/categoria/atividade (relatório e exportação).
- Por que não gravar mensalmente: sem cron para falhar, sem divergência entre tela e relatório.
  Se a contabilidade exigir **fechamento mensal congelado**, acrescenta-se `pat_fechamentos`
  (snapshot imutável do mês) sem mudar o resto — decisão D4.

---

## 3. Entrada do bem (incorporação)

### 3.1 Pelo contrato (caminho normal)

1. Produto de contrato do tipo `Equipamentos` (ou marcado "gera patrimônio") é **aprovado** ⇒ trigger
   cria a tarefa **"Incorporar bens ao patrimônio"** para o gestor patrimonial, ligada ao contrato/atividade/TDR.
2. Na tela, "Incorporar do contrato" já traz contrato, fornecedor, atividade, TDR e o valor do produto;
   a pessoa lança os itens da NF (descrição, marca, modelo, série, quantidade, valor unitário) e as fotos.
3. O banco confere: Σ valor dos bens = valor do produto/NF (diferença ⇒ recusa ou justificativa); série única;
   categoria com série obrigatória.
4. Concluir a incorporação fecha a tarefa. Produto **pago** sem bem incorporado após 15 dias ⇒ achado do auditor.

### 3.2 Bem em lote

Categoria `lote` (ex.: 40 barracas): uma ficha com `quantidade = 40` e eventos com quantidade
(10 com a APA X, 30 no depósito). Alternativa: 40 fichas com etiqueta cada. **Decisão D3.**

### 3.3 Fora do contrato

Cessão de outro órgão, doação recebida, bem anterior ao sistema: origem declarada + documento +
valor de avaliação (laudo ou valor de mercado justificado). Só coordenação/super_admin.

### 3.4 Etiqueta

Folha de etiquetas com QR (`qrcode-generator.js`) + nº `PAT-…` + nome curto do projeto.
O QR leva só a URL `…/pages/patrimonio.html?bem=PAT-000123` — **nenhum dado pessoal nem valor**;
quem lê sem login cai na tela de entrada. A folha de etiquetas é a única impressão fora do molde
FolhaA4 (cabeçalho e rodapé desperdiçariam a folha adesiva) — exceção a registrar no CLAUDE.md.

---

## 4. Ocorrências e sinistros

### 4.1 Registro — `pat_ocorrencias`

Qualquer usuário ativo registra ocorrência de um bem que vê (o responsável pelo bem, principalmente).

| Tipo | Efeito no bem | Obrigatório |
|---|---|---|
| `avaria` / `defeito` | condição ↓; sugere manutenção | descrição, foto |
| `mau_uso` | condição ↓; abre apuração | descrição |
| `extravio` | `extraviado` | data/local da última vez visto |
| `furto` / `roubo` | `extraviado` | **nº do boletim de ocorrência + PDF** |
| `sinistro` (incêndio, alagamento, acidente, queda de árvore…) | condição/situação conforme laudo | descrição, fotos, laudo quando houver |
| `localizado` | encerra extravio; volta à situação anterior | onde/como foi achado |

### 4.2 Tratamento

`aberta → em_apuracao → concluida` com desfecho: `reparado` · `ressarcido` (por terceiro/responsável) ·
`indenizado` (seguro: apólice, nº do sinistro, valor) · `baixa` (vai para §4.3) · `arquivada` (sem dano).
Apuração de responsabilidade = parecer texto + documento (sindicância, se a SEMA abrir). Ocorrência aberta
gera tarefa para o gestor; parada há mais de 30 dias ⇒ auditor. Valor de reparo/ressarcimento ligado a
lançamento do Financeiro quando houver.

### 4.3 Baixa (fim da vida do bem)

Motivos: `inservivel` · `sinistro_perda_total` · `furto_roubo` · `extravio_nao_localizado` · `obsolescencia` ·
`doacao` · `alienacao`. Fluxo igual ao pedido de encerramento de contrato: **pedido** (gestor/coordenação,
justificativa ≥ 30, laudo/BO/termo) → **aprovação com senha** por coordenação/super_admin que **não** pediu
(Edge Function `assinar-remanejamento`, `acao:'decidir_baixa_patrimonio'`, hash do pedido + bem ao vivo).
Aprovado ⇒ evento `baixa`, depreciação para, bem some do inventário ativo (continua consultável).

### 4.4 Seguro (opcional — decisão D6)

`pat_apolices` (seguradora, nº, vigência, bens cobertos, valor segurado) e aviso de vencimento.
Só faz sentido se o projeto/SEMA contratar seguro dos bens.

---

## 5. Inventário

### 5.1 Campanha — `pat_inventarios`

Coordenação abre a campanha (ex.: "Inventário anual 2026", "Inventário de encerramento do projeto"),
escolhe locais (ou todos) e a **comissão** (2+ pessoas). O banco congela a lista de bens **esperados**
em `pat_inventario_itens` no momento da abertura.

### 5.2 Conferência no celular

A comissão abre a campanha no celular, escolhe o local e **lê o QR** de cada bem (câmera), confirma
condição, tira foto se mudou. Bem achado em outro local = registrado como "encontrado fora do lugar".
Bem sem etiqueta: busca por nº de série/descrição. Cada leitura grava quem, quando e onde.

### 5.3 Fechamento

Resultado por item: `conferido` · `local_divergente` · `condicao_divergente` · `nao_localizado` · `nao_esperado`.
Fechar a campanha (com senha de cada membro da comissão) gera:
- evento `inventario` em todo bem conferido (atualiza `ultimo_inventario_em`);
- **ocorrência de extravio** automática para cada `nao_localizado`;
- tarefa de regularização para local/condição divergentes;
- **Relatório de Inventário A4** (termo da comissão, totais, divergências, valor contábil na data).

Regra do auditor: bem sem inventário há mais de 12 meses.

---

## 6. Telas

`pages/patrimonio.html` + `js/patrimonio.js` + `css/patrimonio.css` (prefixo `pt-`), design system da mesa
(`body.dgm`, tema `diag_tema`, seletor Claro/Escuro), ícones SVG `ptIc()`, janelas `pt-ov` com pilha
abrir/fechar, nav `patrimonio` no grupo **Execução** (ao lado de Contratos e Produtos).

| Aba | Conteúdo |
|---|---|
| **Painel** | números do topo: bens ativos, valor de aquisição, valor contábil hoje, depreciação acumulada; avisos que filtram a lista: a incorporar (produto aprovado sem bem), termos pendentes, empréstimos vencidos, ocorrências abertas, garantia vencendo, sem inventário há 12 meses |
| **Bens** | lista filtrável (categoria, local, responsável, situação, condição, atividade, contrato) com busca sem acento; no celular vira cartões |
| **Ficha do bem** | dados, origem (links para contrato/TDR/lançamento), fotos e documentos, valor e curva de depreciação, linha do tempo dos eventos, ações conforme o perfil |
| **Meus bens** | o que está sob minha guarda; aceitar termo, pedir devolução, registrar ocorrência (todos os perfis) |
| **Ocorrências** | fila e tratamento |
| **Inventários** | campanhas, conferência pelo celular (leitor de QR), fechamento |
| **Cadastros** | categorias e locais |
| **Como funciona** | guia + perguntas frequentes (padrão do Remanejamento) |

Leitor de QR: `BarcodeDetector` quando o navegador tem (Chrome/Android); **jsQR** (Apache-2.0, vendorizado,
carregado só no clique) para iPhone/Safari — entra no `NOTICE` e em `TERCEIROS` do `js/autoria.js`.

Integrações nas telas que já existem:
- **Contratos/Produtos**: selo "N bens incorporados" / "a incorporar" no contrato de equipamentos.
- **Visão Geral**: cartão "Patrimônio" (valor contábil, pendências) — fase final.
- **Relatórios**: grupo novo **"Patrimônio"** (tema `patrimonio`, permissão `relatorios_patrimonio`).
- **Painel de Tarefas**: tarefas do sistema (`entidade_tipo = 'pat_*'`), concluídas pelo sistema.
- **Sino**: tipos `patrimonio_*` (exige troca do check de `notificacoes` → `_sql_editor.sql`).
- **Mapa Interativo**: camada "Patrimônio por local" (só se D7 = sim).
- **Aprender a usar**: guias "Incorporar bens de um contrato", "Aceitar termo", "Registrar ocorrência", "Fazer inventário".

---

## 7. Quem faz o quê (RLS e funções)

| Ação | Quem |
|---|---|
| Ver catálogo de bens (sem valores) | todos os perfis ativos, exceto `consultor_externo` |
| Ver valores e depreciação | super_admin, coordenação, financeiro, `tem_permissao('patrimonio')` |
| Incorporar, movimentar, abrir inventário | super_admin, coordenação, **gestor patrimonial** (`tem_permissao('patrimonio_gestor')`) |
| Aceitar termo / devolver / registrar ocorrência | o responsável pelo bem (qualquer perfil) |
| Pedir baixa | gestor patrimonial, coordenação |
| Aprovar baixa, estornar evento, reavaliar | super_admin/coordenação, nunca quem pediu |
| Editar categorias e locais | super_admin, coordenação |

Escrita **só por RPC SECURITY DEFINER** (`fn_pat_*`), tabelas sem policy de escrita para o cliente;
`revoke execute … from public, anon` em toda função; nada de `<>` sobre valor que pode ser NULL;
policies `TO authenticated`; `fn_trg_audit` em `pat_bens`, `pat_categorias`, `pat_locais`.
Fornecedor vinculado (`fornecedor_usuarios`) **não** incorpora bem do próprio contrato.

**LGPD**: o nome do responsável pela guarda é dado pessoal (servidor/colaborador, base art. 7º III).
Se houver empréstimo a pessoa de fora (comunidade, parceiro) com CPF, o CPF fica mascarado na lista e
completo só para gestor. Linha nova em `lgpd_tratamentos` (TRAT-00x) na mesma entrega; bucket
`patrimonio-docs` privado (NF, termo, BO, laudo, fotos), em `BUCKETS_PRIVADOS`.

---

## 8. Titularidade e encerramento do projeto

Bens comprados com recurso do Acordo (Fundo Brasil-ONU, execução UNESCO) costumam pertencer à
UNESCO durante o projeto e ser **transferidos/doados ao órgão executor (SEMA/AC)** ao final, por termo,
com o inventário de encerramento anexado. O módulo prevê:
- `titularidade` no bem (`unesco_projeto` por padrão na compra);
- campanha de inventário do tipo `encerramento`;
- evento `transferencia_definitiva` em lote com o **Termo de Transferência/Doação A4** (lista, nº, série,
  valor de aquisição e contábil) assinado com senha pelos titulares designados (reusa `rem_cargo_titulares`).

**Decisão D5**: confirmar a regra do PRODOC/UNESCO (quem é o dono durante o projeto e quando transfere).

---

## 9. Carga inicial

- Contrato **4500574049** (sonorização): incorporar os itens pela NF (falta o número/PDF da NF no
  lançamento) com `dt_inicio_uso` real; local e responsável atuais.
- Perguntar se há outros bens do projeto fora de contrato de equipamentos (comprados por execução direta
  UNESCO, cedidos pela SEMA) para cadastrar como `origem` declarada.

---

## 10. Relatórios (FolhaA4, grupo "Patrimônio")

| # | Relatório |
|---|---|
| Pt1 | Inventário geral de bens (situação, local, responsável, valor de aquisição e contábil) |
| Pt2 | Termo de responsabilidade por pessoa |
| Pt3 | Mapa de depreciação (mês a mês / ano, por categoria e atividade) |
| Pt4 | Movimentações no período |
| Pt5 | Ocorrências e sinistros (com desfecho, BO, indenização) |
| Pt6 | Relatório de inventário (comissão, divergências) |
| Pt7 | Ficha completa do bem (com linha do tempo e fotos) |
| Pt8 | Baixas no período |
| Pt9 | Termo de Transferência/Doação (encerramento) |

Planilha Excel (ExcelJS) para Pt1/Pt3. Auditor: `fn_auditoria_patrimonio()` (service_role) chamada pelo
`auditor-ia`, título "Patrimônio: …" (o check de `dominio` não tem `patrimonio`, como no Orçamento):
produto pago sem incorporação, termo não aceito, empréstimo vencido, ocorrência parada, furto sem BO,
sem inventário em 12 meses, Σ bens ≠ valor do produto, garantia vencendo (info).

---

## 11. Fases

| Fase | Entrega | Depende de |
|---|---|---|
| **0** | Decisões D1–D7; categorias e vida útil validadas com a contabilidade | dono do projeto |
| **1 — Cadastro e valor** | categorias, locais, `pat_bens`, `pat_eventos` (incorporação, condição, estorno), depreciação (`fn_pat_valor`, views), incorporação pelo contrato + tarefa automática, ficha com fotos/NF, etiquetas QR, aba Bens/Painel, ROPA, bucket, testes SQL, carga do 4500574049 | Fase 0 |
| **2 — Guarda e movimentação** | termos com aceite por senha, distribuição, transferência, devolução, empréstimo com prazo, manutenção, "Meus bens", sino | 1 |
| **3 — Ocorrências, sinistros e baixa** | ocorrências com fluxo, BO, seguro (se D6), pedido e aprovação de baixa com senha | 2 |
| **4 — Inventário** | campanhas, comissão, leitor de QR no celular, divergências → ocorrências, relatório da comissão | 1 (melhor depois de 3) |
| **5 — Relatórios e integração** | Pt1–Pt9, Excel, auditor, Visão Geral, selo em Contratos/Produtos, guias Aprender + Manual, CLAUDE.md | 1–4 |
| **6 — Encerramento do projeto** | inventário de encerramento + Termo de Transferência/Doação | 4, D5 |

Testes: `supabase/tests/patrimonio/rodar.sh` (depreciação em datas-limite, rateio, travas de cache,
segregação da baixa, inventário). Toda migração com DROP vai em `*_sql_editor.sql`.

---

## 12. Decisões (15/11/2026: aceitas as recomendações)

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Quem é o **gestor patrimonial**? (perfil existente + acesso extra `patrimonio_gestor`, ou só coordenação) | acesso extra, para poder designar alguém do apoio sem dar perfil de coordenação |
| D2 | Inventário **offline** (APAs sem sinal) já na Fase 4, ou só online no início? | começar online (sede); offline como Fase 4b reaproveitando o padrão do app de campo (IndexedDB + fila) |
| D3 | Bens iguais em quantidade (40 barracas): **lote** ou **uma ficha por unidade**? | lote para barracas/cadeiras; individual para tudo que tem nº de série |
| D4 | Depreciação: **calculada** (sempre ao vivo) ou com **fechamento mensal congelado** exigido pela contabilidade? | calculada; fechamento só se a contabilidade pedir |
| D5 | Titularidade: os bens são da UNESCO até o fim e depois doados à SEMA? | confirmar no PRODOC antes da Fase 6 (não bloqueia as fases 1–5) |
| D6 | Existe ou existirá **seguro** dos bens? | se não, a Fase 3 registra só indenização avulsa, sem cadastro de apólice |
| D7 | Mostrar bens por local no **Mapa Interativo**? | depois da Fase 5, se os locais tiverem coordenadas |

---

## 13. Fase 1 — o que foi entregue (15/11/2026)

- Banco: `pat_categorias`, `pat_locais`, `pat_incorporacoes`, `pat_bens`, `pat_eventos`, `pat_documentos`; views
  `vw_pat_bens` (valor contábil, depreciação e US$ calculados; valores e NF mascarados para quem não vê valor) e
  `vw_pat_eventos`; RPCs `fn_pat_incorporar`, `fn_pat_anexar_nf`, `fn_pat_editar_ficha`, `fn_pat_corrigir`,
  `fn_pat_registrar_condicao`, `fn_pat_estornar`, `fn_pat_anexar`, `fn_pat_remover_anexo`, `fn_pat_salvar_categoria`,
  `fn_pat_salvar_local`, `fn_pat_a_incorporar`; bucket privado `patrimonio-docs`; ROPA TRAT-006.
- Tarefa "Incorporar bens ao patrimônio" criada para o produto de equipamentos aprovado (já criada para o
  contrato 4500574049); concluída sozinha quando o valor do produto é todo incorporado (ou a diferença é justificada).
- Tela: Painel (números, "A incorporar", avisos, por categoria e local), Bens (filtros, busca sem acento, planilha
  CSV, seleção para etiquetas), ficha (Dados, Valor e depreciação com curva, Fotos e arquivos, Histórico com estorno),
  incorporação, Categorias e locais, Como funciona; etiquetas A4 3 × 7 com QR.
- Testes: `supabase/tests/patrimonio/rodar.sh` (depreciação, rateio, travas, perfis, estorno, lote, catálogos).
- Diferenças em relação ao texto acima: anular cadastro = estorno da incorporação (situação `anulado`, número não
  reaproveitado); a NF fica na incorporação (`pat_incorporacoes`), não em cada bem; vida útil e residual são copiados
  da categoria para o bem na entrada (mudar a categoria não altera bens já cadastrados).

### Carga do contrato 4500574049 (NF 23.126, L. A. Som, 21/10/2026, R$ 20.714,50)

Mapeamento sugerido dos 13 itens da NF (13 fichas; R$ 20.301,00 em bens + R$ 413,50 justificados como consumo):

| Item da NF | Qtd | Valor | Categoria |
|---|---|---|---|
| Caixa Staner Black Series ativa BK 715A | 2 | 9.560,00 | áudio/vídeo (série) |
| Caixa Staner monitor SR-65M compacto | 2 | 4.580,00 | áudio/vídeo (série) |
| Mic. Dylan s/fio UHF 2 bastões QS-5 | 1 | 2.150,00 | áudio/vídeo (série) |
| Mesa de som LL DMX6 MN | 1 | 1.580,00 | áudio/vídeo (série) |
| Mic. Dylan s/fio duplo portátil DC3000 | 1 | 980,00 | áudio/vídeo (série) |
| Filtro de linha LL 9T6K digital | 1 | 460,00 | máquinas e equipamentos diversos |
| Rack ASK médio M19L | 1 | 398,00 | máquinas e equipamentos diversos |
| Tripé Staner p/ caixa de som | 2 | 350,00 | máquinas e equipamentos diversos |
| Suporte musical ASK partitura | 1 | 128,00 | máquinas e equipamentos diversos |
| Bandeja ASK periférico U17 | 1 | 115,00 | máquinas e equipamentos diversos |
| Plugues XLR macho (2) e fêmea (2) + cabo SC30 35 m | — | 413,50 | consumo → justificar a diferença |

Falta, para lançar: os números de série dos equipamentos de áudio (lidos na etiqueta de cada aparelho), o local e a
data de início de uso. A NF traz "Projeto 218BRA2002": o projeto tem dois números (218BRA2001 e 218BRA2002), conforme a
linha de financiamento usada — não é erro. Por isso a etiqueta não leva número de projeto.

**Gestor patrimonial** (15/11/2026): Italo do O Ferreira (coordenação), com o acesso `patrimonio_gestor`; a tarefa do
contrato 4500574049 foi passada a ele (Elielton ficou como observador).

---

## 14. Fase 2 — o que foi entregue (16/11/2026)

- Migração `20261116_pat_02_guarda` (aplicada): `pat_termos` + `pat_termo_itens`, `fn_pat_termo_criar/_detalhe/_cancelar`,
  `fn_pat_termo_decidir` (só service_role), `fn_pat_devolver`, `fn_pat_mudar_local`, `fn_pat_manutencao_saida/_retorno`;
  `vw_pat_bens` ganhou `termo_pendente`, `devolver_ate` e `termo_vigente`; quem guarda vê o próprio bem.
- Edge Function nova `patrimonio-termo` (aceite/recusa com senha; não mexe na `assinar-remanejamento`).
- Tela: abas **Meus bens** (termos para aceitar + bens sob a guarda; único acesso de quem não vê o catálogo) e **Termos**
  (gestor); janela do termo (conferir, aceitar/recusar com senha, cancelar, imprimir A4); "Movimentar" na ficha; ações em lote na lista.
- Decisões de desenho: empréstimo só para quem tem acesso à plataforma (aceita com a própria senha); a devolução é registrada
  pelo gestor, que confere; movimentos não se estornam (corrige-se com outro movimento); avisos por tarefa (sem tipo novo no sino).
- Testes: `supabase/tests/patrimonio/30_guarda.sql` (aceite com hash, recusa, cancelamento, transferência, empréstimo e devolução,
  local, manutenção, leitura por perfil).
