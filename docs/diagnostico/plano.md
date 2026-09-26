# Diagnóstico Socioambiental em campo — Plano (Fase 0)

> **Status:** proposta para revisão. Nenhuma migration nem código foi criado.
> **Escopo desta fase:** instrumento, LGPD, modelo de banco e regras de acesso.
> **Inventário do questionário:** [`instrumento-v1.md`](instrumento-v1.md).
> **Referência de implementação:** apps de campo do SIGUC-AC (Água, Brigadas,
> Biomonitor, Frota) — lidos, não copiados.

---

## 0. Decisões já tomadas (registradas aqui para não reabrir)

| Tema | Decisão |
|------|---------|
| Plataforma | dima-plataforma, Supabase `wfymnmlinonvdqfucjya`, hospedagem Vercel |
| Conectividade | offline + online; ~200 questionários; poucos dias sem internet |
| Entrega | PWA primeiro, depois APK Capacitor com o **mesmo código web** |
| Quem aplica | técnicos que já são (ou serão) usuários do DIMA |
| Acesso | módulo novo `diagnostico` em `usuario_permissoes` / `tem_permissao()`, concedido com prazo pelo `super_admin` |
| Perfis | `tecnico`+permissão aplica e vê os próprios · `coordenacao` valida/exporta · `super_admin` tudo · `visualizador`/`consultor_externo` só agregados |
| Policies | sempre `TO authenticated`, nunca `USING (true)` |
| Dados | híbrido: colunas fixas + respostas `jsonb` validadas por questionário versionado no banco + tabela própria de moradores; indicadores calculados no banco |
| Código da ficha | gerado no aparelho (padrão `numero_ninho` do Biomonitor) |
| Envio | fila que não duplica ao reenviar (padrão `agua-sync.js`/`brigada-sync.js`); ficha + moradores numa transação só (padrão `frota_solicitar_viagem`) |
| Regras | nada bloqueia o trabalho de campo · cálculo num lugar só · toda coluna gravada pelo formulário está no `select` que o carrega |
| LGPD | entrada no ROPA, aviso ao entrevistado, base legal a definir com o jurídico |
| Nome | **Diagnóstico Socioambiental** (rótulo de tela, ROPA e relatórios); módulo `diagnostico` no código *(decidido em 26/09)* |
| P4 — nome do entrevistado | **opcional** *(decidido em 26/09)* — ver §2.2 e §3.3 |

---

## 1. Instrumento

### 1.1 O que o PDF traz

10 blocos, 81 perguntas: 35 de escolha única, 21 múltiplas, 17 abertas, 3
numéricas, 1 data, 3 de identificação e 1 tabela de moradores (6 colunas).
Detalhe pergunta a pergunta, com chave, tipo, nível de análise e marcação LGPD,
em [`instrumento-v1.md`](instrumento-v1.md).

### 1.2 Lacunas que precisam ser fechadas antes de congelar a v1

O PDF é um roteiro de entrevista, não um formulário. Para virar app faltam
decisões que **só a equipe do diagnóstico pode tomar** — o sistema não deve
inventar:

1. **Única ou múltipla** em 7 perguntas ambíguas — ✅ P16 única, P18 e P21
   múltipla *(26/09)*. Faltam P25, P50, P56 e as listas da P9.
2. ~~**Saltos**~~ — ✅ S1–S10 aceitos *(26/09)*, incluindo a opção nova
   "Nenhuma" (exclusiva) na P30. "Não se aplica" sai da P18 e da P68.
3. **Listas fechadas da P9** (parentesco, escolaridade, atividade principal).
4. **Unidade da P38** (área) — sem ela o número não serve para indicador.
5. **"Outro" sem especifique** em 30 perguntas.
6. **Código de não resposta** (hoje só a P5 tem).
7. **Assimetria P61 × P62** (listas diferentes para mulheres e homens).
8. **Domicílio sem mulher/sem homem** no bloco 9.
9. **P54/P55 (sindicato)** — trocar por lista fechada por tipo (ver §2.2).
10. ~~**Nome do instrumento**~~ — ✅ decidido: **Diagnóstico Socioambiental**.

**Proposta de rito:** esta lista vira uma reunião curta com quem elaborou o
questionário → v1 congelada → piloto com 5 questionários no papel ou no protótipo
→ ajustes → v1 publicada no banco. Mudança depois da publicação = **v2**, nunca
edição da v1 (ver §3.2).

### 1.3 Como o instrumento vive no sistema

O questionário vira **dado**, não código: um documento JSON versionado no banco
(`diag_questionarios.estrutura`), com blocos, perguntas, tipos, opções, opções
exclusivas, saltos e textos de ajuda. O app **renderiza** o formulário a partir
dele, e o banco **valida** as respostas contra ele. Consequências:

- corrigir um texto de ajuda ou lançar a v2 não exige deploy de app;
- fichas antigas continuam apontando para a versão com que foram aplicadas;
- chaves estáveis (`agua_fonte`, não `p16`) — numeração pode mudar entre versões.

Esboço do formato (ilustrativo, não definitivo):

```json
{
  "codigo": "DSA",
  "versao": 1,
  "blocos": [
    { "id": "agua", "titulo": "Água, saneamento e resíduos", "perguntas": [
      { "chave": "agua_tratada", "n": 17, "tipo": "unica",
        "texto": "A água utilizada para consumo recebe algum tratamento?",
        "opcoes": [{"v":"sim","r":"Sim"},{"v":"nao","r":"Não"}] },
      { "chave": "agua_tratamento", "n": 18, "tipo": "multipla",
        "texto": "Qual tratamento é realizado?",
        "opcoes": [{"v":"filtracao","r":"Filtração"},{"v":"cloracao","r":"Cloração"},
                   {"v":"fervura","r":"Fervura"},{"v":"outro","r":"Outro","especificar":true}],
        "mostrar_se": {"se":"agua_tratada","op":"=","valor":"sim"} }
    ]}
  ]
}
```

A linguagem de salto é **deliberadamente mínima** (`=`, `in`, `contem` sobre uma
única pergunta anterior). Ela precisa ser avaliada em dois lugares — no app (para
esconder a pergunta) e no banco (para validar) — e só se mantém "cálculo num
lugar só" se as duas implementações forem triviais e testadas contra o **mesmo
conjunto de casos** (fixture única usada pelo teste do JS e pelo teste SQL).

---

## 2. LGPD

### 2.1 Mapa de dados pessoais do instrumento

| Dado | Perguntas | Classe | Titular |
|------|-----------|--------|---------|
| Nome do entrevistado | P4 | pessoal | entrevistado |
| Sexo/gênero, idade, tempo na comunidade | P5–P7 | pessoal | entrevistado |
| Composição do domicílio (iniciais, idade, sexo, parentesco, escolaridade, ocupação) | P9 | pessoal, **inclui menores** | terceiros (moradores) |
| Localização do domicílio (GPS) | coluna fixa | pessoal (identifica a casa) | família |
| Fontes de renda, suficiência, benefícios sociais | P28, P29 | pessoal (vulnerabilidade) | família |
| Quem decide sobre dinheiro/produção | P63, P64 | pessoal (dinâmica doméstica) | família |
| **Filiação a sindicato** / organizações | P54, P55 | **sensível** (art. 5º, II) | entrevistado |
| Problemas de saúde | P25 | **sensível** se ligado a pessoa | terceiros |
| Caça, uso de madeira | P41 | pessoal; autodeclaração de conduta com implicação legal | família |
| 17 respostas abertas | ver inventário | podem conter nome de terceiros | terceiros |

**O que o instrumento não coleta — e deve continuar sem coletar:** CPF, telefone,
valor de renda, número de benefício (NIS), nome completo de moradores. O pedido
original citava renda e CPF; o PDF **não pede** nenhum dos dois em forma
identificável. Recomendação firme: **não acrescentar CPF**. Não há finalidade no
diagnóstico que o exija, e ele transformaria uma base de percepção em cadastro
nominal de famílias vulneráveis.

### 2.2 Minimização proposta (antes de publicar a v1)

1. **P9 só com iniciais** — nunca nome de morador. Idade em anos (não data de nascimento).
2. **P4 (nome do entrevistado) — ✅ decidido: opcional.** Consequências:
   - o campo fica em branco por padrão e o app **não cobra** preenchimento nem
     "Não respondeu" nele (é a única pergunta de identificação fora dessa regra);
   - o aviso ao entrevistado (§2.4) diz explicitamente que dar o nome é opcional
     e que ele não aparece em relatório;
   - quando informado, vai para **tabela separada** com leitura restrita (§3.3),
     no mesmo padrão de `beneficiario_dados_bancarios`; sem nome, a linha nem é criada;
   - a ficha é sempre identificada pelo `codigo`, nunca pelo nome — nada no
     fluxo (conferência, devolução, duplicidade) pode depender da P4;
   - exportação padrão sai sem nome; só a exportação identificada da
     coordenação o inclui.
3. **P55** — trocar texto livre por múltipla por **tipo** de organização, sem
   nome da entidade. Continua sendo dado sensível (a opção "sindicato rural"
   revela filiação), mas deixa de ser texto livre com nome de sindicato, igreja
   ou partido.
4. **P25** — lista fechada de problemas de saúde + orientação "sem citar nomes".
5. **GPS** — coordenada precisa só para quem aplica e para a coordenação;
   qualquer saída para fora (painel agregado, mapa, relatório, exportação para
   consultor) usa **nível de comunidade**, nunca o ponto da casa.
6. **Sem foto** na v1. Se a equipe quiser foto (moradia, infraestrutura), entra
   como decisão própria, com regra de "nunca rosto" e bucket privado desde o
   nascimento (padrão SIGUC `fotos-privadas.js`).

### 2.3 Base legal (a definir com o jurídico)

O DIMA já registra que a SEMA/AC é a controladora e que o tratamento se apoia no
art. 7º, III (execução de políticas públicas), **não em consentimento**. Para o
diagnóstico, as hipóteses candidatas são:

| Dado | Candidata | Observação |
|------|-----------|------------|
| Dados pessoais comuns | art. 7º, III (política pública) ou art. 7º, IV (estudo por órgão de pesquisa, com anonimização sempre que possível) | IV só se aplica se o executor for órgão de pesquisa — confirmar |
| Dado sensível (sindicato, saúde) | art. 11, II, "b" (política pública) ou art. 11, II, "c" (estudo por órgão de pesquisa) | se nenhuma couber, **retirar** o dado do instrumento em vez de pedir consentimento |
| Menores (P9) | art. 14 — melhor interesse; dado mínimo, sem nome | iniciais + idade atendem |

**Por que não consentimento:** consentimento dá direito de revogação a qualquer
tempo. Revogar depois da consolidação exigiria apagar a ficha e recalcular
indicadores já reportados à UNESCO. Além disso, "aceitar" é inevitável numa
relação entre Estado e comunidade que depende de programa público — o
consentimento dificilmente seria "livre". **Isso não elimina o aviso**: o
entrevistado precisa ser informado (art. 9º) e pode recusar a entrevista ou
qualquer pergunta.

### 2.4 Aviso ao entrevistado

- **Roteiro de leitura** no início da ficha, curto (≤ 1 minuto falado): quem
  coleta, para quê, que ninguém é obrigado a responder, que nomes não aparecem
  em relatório, que informar o próprio nome é opcional, a quem procurar
  (canal do Encarregado).
- Campo fixo `aviso_lido` (boolean) + `aceitou_participar` (boolean). Recusa
  encerra a ficha sem coletar nada além de comunidade, data e entrevistador — o
  que permite medir taxa de recusa sem dado pessoal.
- O texto do aviso é versionado junto com o questionário (mesma versão), para
  que se saiba **qual** aviso foi lido em cada ficha.
- Cópia do aviso em papel/cartão para deixar com a família (contato do Encarregado).
- **Aviso ao técnico** (distinto do aviso ao entrevistado): o app coleta GPS do
  técnico no instante da captura. Padrão SIGUC `lgpd-campo.js`: texto cacheado,
  ciência gravada local e sincronizada depois, **nunca bloqueia** o app.

### 2.5 ROPA

**Achado:** o DIMA **não tem ROPA** — nem documento, nem tabela. O CLAUDE.md lista
"Política de Privacidade, Termos de Uso, ROPA, RIPD e designação do Encarregado"
como pendentes, e a consulta ao banco confirmou que não existe `lgpd_tratamentos`
nem equivalente. O SIGUC tem ROPA vivo no banco (`lgpd_tratamentos`, migration 211).

Proposta em dois passos:

1. **Agora (Fase 0):** o rascunho abaixo, em Markdown, é suficiente para levar
   ao jurídico. Depois de revisado, vira `docs/diagnostico/ropa-diagnostico.md`.
2. **Decisão separada (fora deste módulo):** trazer o padrão `lgpd_tratamentos`
   do SIGUC para o DIMA, com a coluna `tabelas` apontando as tabelas reais. Se
   aprovado, o diagnóstico vira a primeira linha.

Rascunho da entrada:

| Campo | Valor proposto |
|-------|----------------|
| Tratamento | Diagnóstico socioambiental de comunidades (aplicação de questionário domiciliar) |
| Controlador | SEMA/AC |
| Operadores | Supabase (banco/hospedagem), Vercel (hospedagem do app), Google/Apple (loja/instalação do APK, se aplicável) |
| Finalidade | Subsidiar planejamento e prestação de contas do Projeto 218BRA2001 (Fundo Brasil-ONU/UNESCO) |
| Titulares | Entrevistados; moradores dos domicílios (inclui crianças e adolescentes); técnicos entrevistadores |
| Categorias | Identificação mínima, composição domiciliar, localização, condições socioeconômicas, percepções; **sensíveis**: filiação sindical, saúde |
| Base legal | a definir (§2.3) |
| Compartilhamento | UNESCO e financiador **somente agregado**, com supressão de célula pequena (§4.4) |
| Transferência internacional | Supabase/Vercel (art. 33) — pendência já conhecida do DIMA |
| Retenção | ficha identificada até validação + prazo X; nome e GPS preciso descartados/pseudonimizados depois; agregados pelo prazo de prestação de contas do projeto |
| Segurança | RLS por perfil + permissão com prazo, identidade em tabela separada, trilha em `audit_log` em modo redigido, aparelho com PIN |
| RIPD | **recomendado** — dado sensível + menores + população vulnerável |

### 2.6 Riscos específicos do trabalho de campo

| Risco | Mitigação proposta |
|-------|--------------------|
| Aparelho perdido/roubado com fichas pendentes | PIN local para abrir o app; confirmados apagados do aparelho 7 dias após envio (padrão SIGUC); ❓ cifrar a fila com chave derivada do PIN (ver §5.3) |
| Aparelho compartilhado entre técnicos | fila e cache escopados por usuário; troca de usuário com pendências avisa e **não apaga** |
| Resposta ouvida por outros moradores (bloco 9) | orientação no roteiro de aplicação |
| Exportação com nome/GPS circulando por e-mail | exportação identificada só para `coordenacao`/`super_admin`; exportação padrão sai pseudonimizada (sem nome, sem GPS preciso) |
| Texto livre com nome de terceiros | revisão na validação; exportação de texto aberto só para coordenação |

---

## 3. Banco (proposta — nenhuma migration criada)

### 3.1 Visão geral

```
diag_questionarios ─┐        (instrumento versionado)
                    │
diag_comunidades ───┼──< diag_fichas >── diag_fichas_identificacao (1:1, restrita)
                    │         │
usuarios ───────────┘         └──< diag_moradores
```

Prefixo `diag_` em tudo. Status e categorias como `text` + `CHECK` (não enum:
enum novo exige migration própria a cada valor acrescentado).

### 3.2 `diag_questionarios` — o instrumento

| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `codigo` | text NOT NULL | `DSA` |
| `versao` | int NOT NULL | `UNIQUE (codigo, versao)` |
| `titulo` | text NOT NULL | |
| `estrutura` | jsonb NOT NULL | blocos, perguntas, opções, saltos (§1.3) |
| `aviso_entrevistado` | text NOT NULL | texto lido no início (§2.4) |
| `hash_sha256` | text GENERATED | do `estrutura::text` — prova de qual versão foi aplicada |
| `status` | text | `rascunho \| publicado \| arquivado` |
| `publicado_em` / `publicado_por` | | |

- Trigger: versão `publicado` **não pode** ter `estrutura`/`aviso` alterados —
  só mudar para `arquivado`. Correção = nova versão.
- Leitura: qualquer autenticado com acesso ao módulo (o app precisa baixar para
  funcionar offline). Escrita: `super_admin`/`coordenacao`.

### 3.3 `diag_fichas` — uma entrevista

| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `uuid_cliente` | uuid NOT NULL | **UNIQUE CONSTRAINT** (não índice parcial) — chave de idempotência da fila |
| `codigo` | text NOT NULL UNIQUE | gerado no aparelho (§3.5) |
| `questionario_id` | uuid FK NOT NULL | versão aplicada |
| `comunidade_id` | uuid FK → `diag_comunidades` | NULL se comunidade nova |
| `comunidade_nova` | text | nome digitado quando não está no catálogo; coordenação consolida |
| `municipio_ibge` | int NOT NULL | 22 municípios do AC |
| `dt_entrevista` | date NOT NULL | |
| `iniciada_em` / `finalizada_em` | timestamptz | relógio do aparelho |
| `lat` / `lon` / `gps_precisao_m` / `gps_em` | numeric / timestamptz | leitura pontual (padrão Água: `bGpsUmaLeitura`), NULL se sem sinal — **nunca trava** |
| `entrevistador_id` | uuid FK → `usuarios` NOT NULL | `DEFAULT auth.uid()`; policy exige `= auth.uid()` no insert |
| `aviso_lido` / `aceitou_participar` | boolean NOT NULL | |
| `respostas` | jsonb NOT NULL DEFAULT '{}' | chave → valor, validado contra `estrutura` |
| `alertas` | jsonb | inconsistências calculadas **pelo banco** (V1, V2…), não bloqueiam |
| `status` | text | `enviada \| devolvida \| validada \| descartada` |
| `motivo_devolucao` | text | obrigatório quando `devolvida` |
| `validado_por` / `validado_em` | | |
| `app_versao` / `dispositivo_id` | text | diagnóstico de problema de campo |
| `criado_em` / `atualizado_em` | timestamptz | |

`rascunho` **não existe no servidor** — enquanto a ficha está sendo preenchida ela
vive só no aparelho. O servidor recebe fichas finalizadas.

**`diag_fichas_identificacao`** (1:1 com `diag_fichas.id`, **só existe quando a
P4 foi respondida**, pois o nome é opcional) — `entrevistado_nome` e, se decidido, observação de localização ("casa azul depois da ponte"). Tabela
separada porque RLS é por linha, não por coluna — mesma razão de
`beneficiario_dados_bancarios`. Leitura: o próprio entrevistador e
`coordenacao`/`super_admin`. Nunca entra em view de agregado.

### 3.4 `diag_moradores` — tabela da P9

| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `ficha_id` | uuid FK NOT NULL | `ON DELETE CASCADE` |
| `ordem` | smallint NOT NULL | `UNIQUE (ficha_id, ordem)` |
| `iniciais` | text | `CHECK (length ≤ 6)` — impede nome completo |
| `idade` | smallint | 0–120 |
| `sexo_genero` | text | mesmo vocabulário da P5 |
| `parentesco` / `escolaridade` / `atividade_principal` | text | valores validados contra as listas da versão do questionário |
| `e_entrevistado` | boolean | no máximo 1 por ficha |

### 3.5 Código da ficha gerado no aparelho

Padrão `numero_ninho` (Biomonitor): o código nasce no cliente, 100% offline, sem
reserva no servidor. Proposta de formato:

```
DSA-<MUN>-<AAMMDD>-<DISP>-<NN>
DSA-RBR-261003-K7Q2-04
```

- `MUN` — sigla de 3 letras do município (tabela fixa no app);
- `DISP` — 4 caracteres aleatórios gerados **uma vez** por instalação e gravados
  no IndexedDB (distingue dois técnicos no mesmo dia e município);
- `NN` — contador local do dia.

O `UNIQUE` em `codigo` é a rede de segurança. Colisão (reinstalação que gera o
mesmo `DISP` e contador — improvável) é tratada pelo envio como erro recuperável:
o app gera um sufixo novo e reenvia. **A identidade real da ficha é o
`uuid_cliente`**; o código é para humanos (conferência, papel, conversa com a coordenação).

### 3.6 Indicadores — calculados num lugar só

- **Uma view de base** `vw_diag_respostas` (security_invoker) que "desmonta" o
  jsonb em linhas `(ficha_id, comunidade, municipio, chave, valor)`, respeitando a
  versão. Todo indicador sai dela; ninguém lê `respostas` direto para calcular.
- **Uma view de indicadores** `vw_diag_indicadores` por comunidade/município,
  com numerador, denominador e percentual — o denominador é **fichas em que a
  pergunta se aplicava** (salto e "Não respondeu" fora), nunca o total de fichas.
- **Derivações** (tamanho do domicílio pela P9, presença de criança em idade
  escolar, área em hectares a partir da P38) são funções SQL chamadas pela view —
  inclusive as usadas pelo app para sugerir resposta (D1/D2 do inventário). O app
  **exibe**, não recalcula.
- Perguntas de nível `C` (fato da comunidade, respondido por cada domicílio)
  saem como "% dos entrevistados que relatam", nunca como "a comunidade tem".
- **Bloco 9 sempre desagregado** pelo sexo do respondente (P5).
- Só entram fichas `validada`; `enviada` aparece marcada ("em conferência"), nunca
  escondida — mesma cautela da quarentena do SIGUC Água.
- ❓ Se o diagnóstico alimenta indicadores da Matriz de Resultados
  (`matriz_itens`), o vínculo é feito **a partir desta view**, não de cálculo novo.

Lista inicial de indicadores sugerida (para validar com a equipe): acesso a
energia (P12), água tratada (P17), falta sazonal de água (P19), destino adequado
de esgoto (P20) e lixo (P21), acesso a comunicação (P14), renda suficiente (P29),
acesso a crédito (P35) e ATER (P36), uso de recursos florestais (P40), percepção
de redução de recursos (P44) e piora ambiental (P52), exposição a eventos
climáticos (P49), participação em organização (P54), divisão sexual do trabalho
(P61×P62), decisão financeira compartilhada (P63), independência financeira
percebida das mulheres (P71), tamanho médio do domicílio, % domicílios com
crianças/idosos.

### 3.7 Envio: uma transação, sem duplicar

RPC `diag_enviar_ficha(p_ficha jsonb, p_moradores jsonb)`, **SECURITY INVOKER**
(padrão `frota_solicitar_viagem`: o RLS do chamador continua autorizando; a RPC
não é uma porta privilegiada):

1. `INSERT … ON CONFLICT (uuid_cliente) DO UPDATE` na ficha — reenvio da mesma
   ficha atualiza, não duplica;
2. só atualiza se a ficha ainda é do chamador **e** está `enviada` ou `devolvida`;
   se já estiver `validada`, devolve código de erro específico (`ja_validada`) e
   o app marca como conflito para a coordenação, sem apagar a cópia local;
3. apaga e regrava `diag_moradores` da ficha;
4. valida `respostas` e moradores contra a `estrutura` da versão;
5. grava `alertas`;
6. retorna a linha com `id`, `codigo`, `status`.

Tudo ou nada: falha em qualquer passo desfaz a ficha e os moradores.

**Validação no servidor × "nada bloqueia o campo":** o app valida com a mesma
estrutura antes de marcar a ficha como pronta, então o servidor só deveria
rejeitar o que o app já teria barrado. Se rejeitar mesmo assim (app antigo em
cache, bug), a ficha fica **"com erro — precisa de atenção"** no aparelho, as
outras da fila seguem sendo enviadas, e nada é apagado. Inconsistência de
conteúdo (V1, V2) **nunca** é rejeição — vira `alertas`.

### 3.8 Auditoria

- `fn_trg_audit()` já existe e grava em `audit_log`. Ligar em
  `diag_fichas_identificacao` em modo **`'redigir'`** (padrão
  `beneficiario_dados_bancarios`).
- Em `diag_fichas`, o snapshot completo copiaria as respostas (inclusive
  sindicato) para o `audit_log`. ❓ Opções: modo `'redigir'` também (sabe-se quem
  mudou o quê, sem o valor), ou tabela própria de histórico de status
  (`enviada → devolvida → validada`) com motivo. Recomendação: histórico de status
  próprio + audit redigido.

### 3.9 Achados do SIGUC que valem para cá

1. `ON CONFLICT (x)` do supabase-js **não** usa índice UNIQUE parcial →
   `uuid_cliente` com UNIQUE CONSTRAINT normal.
2. `c.*` em view expande na criação → views com colunas explícitas;
   `CREATE OR REPLACE VIEW` só acrescenta coluna **no fim**.
3. Mudou a lista de parâmetros de RPC → `DROP FUNCTION` antes do `CREATE`.
4. Toda coluna gravada pelo formulário está no `select` que o carrega (regra
   já decidida) — vale também para o cache offline: o que o app grava no
   IndexedDB precisa ter as mesmas chaves que a RPC recebe.

---

## 4. Acesso

### 4.1 Matriz de perfis

| Perfil | Aplicar | Ver fichas | Identificação (nome) | Validar/devolver | Exportar identificado | Agregados |
|--------|---------|-----------|----------------------|------------------|----------------------|-----------|
| `super_admin` | ✅ | todas | ✅ | ✅ | ✅ | ✅ |
| `coordenacao` | ✅¹ | todas | ✅ | ✅ | ✅ | ✅ |
| `tecnico` + `tem_permissao('diagnostico')` | ✅ | **só as próprias** | só as próprias | — | — | ✅² |
| `tecnico` sem permissão | — | — | — | — | — | — |
| `financeiro` | — | — | — | — | — | ❓ |
| `consultor_externo` | — | — | — | — | — | ✅ (com supressão) |
| `visualizador` | — | — | — | — | — | ✅ (com supressão) |

¹ ❓ Coordenação aplica questionário? Se sim, entra no mesmo fluxo de ficha.
² ❓ Técnico vê o agregado geral ou só o das próprias fichas?

Estado atual do banco (consulta de 26/09): 8 `tecnico`, 5 `coordenacao`,
5 `super_admin`, 2 `consultor_externo`, 2 `financeiro`, 0 `visualizador` ativos.

### 4.2 Uma função de regra, não predicado repetido

`tem_permissao()` **não confere `usuarios.ativo`** — só a linha de
`usuario_permissoes`. Um técnico desativado com permissão ainda válida passaria.
Proposta: `fn_diag_pode_aplicar()` e `fn_diag_pode_gerir()` (SECURITY DEFINER,
`STABLE`, `search_path` fixo), usadas por **todas** as policies do módulo — o
mesmo padrão de `fn_pode_ver_tarefa` no Painel de Tarefas:

```
fn_diag_pode_aplicar() = usuário ativo
                         AND (perfil IN ('super_admin','coordenacao')
                              OR (perfil = 'tecnico' AND tem_permissao('diagnostico')))
fn_diag_pode_gerir()   = usuário ativo AND perfil IN ('super_admin','coordenacao')
```

Policies (todas `TO authenticated`, nenhuma `USING (true)`):

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| `diag_questionarios` | `fn_diag_pode_aplicar() OR fn_diag_pode_gerir()` | gerir | gerir (trigger protege publicada) | — |
| `diag_comunidades` | aplicar ou gerir | gerir | gerir | — (desativar) |
| `diag_fichas` | `entrevistador_id = auth.uid() AND fn_diag_pode_aplicar()` OR gerir | `entrevistador_id = auth.uid()` AND aplicar | próprio + status `enviada/devolvida`, OR gerir | — (`descartada`) |
| `diag_fichas_identificacao` | igual à ficha | igual | igual | — |
| `diag_moradores` | via ficha | via ficha | via ficha | via ficha (RPC regrava) |

### 4.3 Permissão que vence com fichas na fila

Cenário real: permissão concedida até dia 10, técnico aplica no dia 9 sem sinal,
volta à cidade no dia 12. Com a regra acima o envio é recusado e o trabalho de
campo fica preso no aparelho — viola "nada bloqueia o trabalho de campo".

Proposta: a RPC aceita o envio se a permissão estava válida em `finalizada_em`
**e** o envio ocorre até **N dias** (sugestão: 15) depois do `valido_ate`. A
data do aparelho não é confiável sozinha, por isso a tolerância é limitada e a
ficha que usar a carência ganha um `alerta` para a coordenação conferir. Fora da
carência: a ficha fica no aparelho como "aguardando renovação de acesso", nunca
é apagada, e o `super_admin` renova o prazo.

### 4.4 Agregados para `visualizador`/`consultor_externo`

Esses perfis **não leem linha nenhuma** das tabelas `diag_*` — então uma view
`security_invoker` devolveria vazio para eles. A saída é uma função
`fn_diag_agregados(p_municipio, p_comunidade, …)` SECURITY DEFINER que:

- confere o perfil do chamador;
- lê `vw_diag_indicadores` (a mesma fonte do painel da coordenação — nunca um
  segundo cálculo);
- **suprime células com menos de 5 fichas** (ou agrega para o município), porque
  numa comunidade de 3 famílias "33% relatam filiação a sindicato" identifica a família;
- nunca devolve texto aberto, nome, GPS nem moradores.

É a mesma lógica das funções `fn_publico_*` do DIMA, aplicada a perfis logados.
❓ Limite de supressão (5 é o usual) a confirmar.

### 4.5 Integração com o que já existe

- `pages/usuarios.html` → `MODULOS_LISTA`: incluir
  `{ id:'diagnostico', label:'Diagnóstico Socioambiental', perfis:['super_admin','coordenacao'] }`
  para o `super_admin` conceder com prazo pela tela que já existe.
- `js/layout.js` → `navGroups`: item `diagnostico` no grupo **Execução** (tela de
  mesa: validação, painel, exportação).
- `js/config.js` → tradução do item em `nav` (pt/en/es).
- **O app de campo não usa `carregarUsuario()`.** Ele desloga após 30 min de
  inatividade (`dima_ultima_atividade`), o que é certo para a mesa e fatal no
  campo. Mesmo motivo pelo qual os apps do SIGUC não o chamam. O app terá login
  próprio + PIN local (`pin-baralho.js`), carregando perfil e permissão uma vez
  quando há rede e guardando no IndexedDB.

---

## 5. Pontos de arquitetura que afetam a Fase 0

### 5.1 Hospedagem

O CLAUDE.md diz "GitHub Pages (branch `main`)"; a decisão é Vercel. O
repositório ainda não tem `vercel.json` nem `api/`. Para PWA isso importa já na
Fase 2: o service worker precisa do header `Service-Worker-Allowed` e o download
do APK depende de `api/apk-latest.js` (padrão SIGUC). ❓ Confirmar se a migração
de hospedagem do DIMA inteiro para a Vercel já aconteceu ou se é só para o app.
Atualizar o CLAUDE.md quando for o caso.

### 5.2 Offline

Volume é pequeno: 200 fichas × ~20 KB ≈ 4 MB — IndexedDB sobra. O que vai para o
aparelho: a versão publicada do questionário, o catálogo de comunidades e o
perfil/permissão do técnico. Molde: `agua-offline.js` (fila `pendente → enviando
→ confirmado`, confirmados retidos 7 dias, pendentes nunca apagados,
`navigator.storage.persist()`), `agua-sync.js` (teste real de conexão por HEAD,
renovação de sessão antes de enviar, backoff 2/4/8/16 s).

Diferença do SIGUC Água: aqui há **rascunho longo** (entrevista de 45–70 min que
pode ser interrompida). O rascunho precisa ser salvo a cada resposta, não só ao
final.

### 5.3 Decisões em aberto de segurança do aparelho

- ❓ **Cifrar a fila local** com chave derivada do PIN: protege aparelho
  perdido, mas PIN esquecido = fichas pendentes perdidas. Alternativa: sem
  cifra, com retenção curta e PIN obrigatório. Recomendação: sem cifra na v1,
  reavaliar com o RIPD.
- **Sessão expirada offline**: o app continua aplicando com o PIN; o envio
  espera um login com rede. Pendências nunca são apagadas por logout.

---

## 6. Fases seguintes (visão, para dimensionar)

| Fase | Entrega |
|------|---------|
| **0** | Este plano + instrumento v1 congelado + ROPA rascunho *(em andamento)* |
| 1 | Migrations: tabelas, funções de acesso, RPC de envio, views de indicador, questionário v1 carregado; testes SQL (inclusive a fixture de saltos) |
| 2 | App PWA offline: login + PIN, lista de fichas, formulário renderizado da estrutura, rascunho contínuo, GPS pontual, fila de envio |
| 3 | Mesa: validação/devolução, painel de indicadores, exportação `.xlsx` (ExcelJS, regra SIGUC), exportação pseudonimizada |
| 4 | APK Capacitor (`app-diagnostico/`), workflow de build com action pinada em SHA, `api/apk-latest.js`, `vercel.json` |
| 5 | Piloto (5 fichas), guia de treinamento no app (`guia-app.js`), aplicação |

---

## 7. Perguntas para fechar a Fase 0

**Instrumento (equipe do diagnóstico)**
1. As 10 lacunas da §1.2 — especialmente única × múltipla, saltos e unidade da P38.
2. ~~Nome oficial~~ — ✅ **Diagnóstico Socioambiental**.

**LGPD (jurídico)**
3. Base legal (§2.3) e se o executor se enquadra como órgão de pesquisa.
4. ~~Manter o nome do entrevistado (P4)?~~ — ✅ **opcional**. Resta ao jurídico: prazo de retenção do nome (entra na pergunta 6).
5. P54/P55 (sindicato) e P25 (saúde): manter como sensível, fechar em lista, ou retirar?
6. Prazo de retenção do nome (quando informado), da ficha identificada e do GPS preciso.
7. RIPD antes do campo?

**Acesso e produto (você)**
8. Coordenação aplica questionário? Técnico vê agregado geral ou só o seu?
9. `financeiro` tem algum acesso?
10. Limite de supressão para agregados (5 fichas?).
11. Carência de envio após vencimento da permissão (15 dias?).
12. Foto entra na v1?
13. O diagnóstico alimenta indicadores da Matriz de Resultados?
14. Hospedagem: DIMA inteiro já está na Vercel ou só o app vai estar?
15. Trazer o ROPA vivo no banco (`lgpd_tratamentos`) do SIGUC para o DIMA agora ou depois?
