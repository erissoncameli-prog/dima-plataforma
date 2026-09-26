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
| Perfis | `tecnico`+permissão aplica e vê os próprios · `coordenacao` valida/exporta · `super_admin` tudo · `consultor_externo`+permissão **vê fichas individuais, sem identificação** *(26/09)* · `visualizador` só agregados |
| Policies | sempre `TO authenticated`, nunca `USING (true)` |
| Dados | híbrido: colunas fixas + respostas `jsonb` validadas por questionário versionado no banco + tabela própria de moradores; indicadores calculados no banco |
| Código da ficha | gerado no aparelho (padrão `numero_ninho` do Biomonitor) |
| Envio | fila que não duplica ao reenviar (padrão `agua-sync.js`/`brigada-sync.js`); ficha + moradores numa transação só (padrão `frota_solicitar_viagem`) |
| Regras | nada bloqueia o trabalho de campo · cálculo num lugar só · toda coluna gravada pelo formulário está no `select` que o carrega |
| LGPD | entrada no ROPA, aviso ao entrevistado, base legal a definir com o jurídico |
| Nome | **Diagnóstico Socioambiental** (rótulo de tela, ROPA e relatórios); módulo `diagnostico` no código *(decidido em 26/09)* |
| P4 — nome do entrevistado | **opcional** *(decidido em 26/09)* — ver §2.2 e §3.3 |
| Uso do dado | **apenas uso interno da SEMA** *(26/09)*. Ficha, moradores e textos não saem da SEMA; para fora vão só os valores de indicador da Matriz (§3.11). Consultor externo com acesso ao módulo atua para a SEMA (§4.1) |
| Retenção | **2 anos a partir da validação da ficha** para os dados identificados *(26/09)* — ver §2.5 |
| `financeiro` | **sem acesso** ao módulo *(26/09)* |
| Matriz de Resultados | o diagnóstico **alimenta a Matriz**; **quais itens fica para depois** *(26/09)* — ver §3.11 |
| Hospedagem | **o DIMA inteiro está na Vercel** *(26/09)* |
| ROPA | **passa a viver no banco agora** (`lgpd_tratamentos`), **só com a entrada do diagnóstico** *(26/09)* — ver §2.5 |

---

## 1. Instrumento

### 1.1 O que o PDF traz

10 blocos, 81 perguntas: 34 de escolha única, 23 múltiplas, 16 abertas, 3
numéricas, 1 data, 3 de identificação e 1 tabela de moradores (6 colunas).
Detalhe pergunta a pergunta, com chave, tipo, nível de análise e marcação LGPD,
em [`instrumento-v1.md`](instrumento-v1.md).

### 1.2 Lacunas que precisam ser fechadas antes de congelar a v1

O PDF é um roteiro de entrevista, não um formulário. Para virar app faltam
decisões que **só a equipe do diagnóstico pode tomar** — o sistema não deve
inventar:

1. **Única ou múltipla** em 7 perguntas ambíguas — ✅ P16 única; P18, P21, P50
   e P56 múltipla; P25 vira lista fechada múltipla, só quando P24 = Sim; P61 e
   P62 múltiplas; itens da lista da P25 confirmados *(26/09)*.
2. ~~**Saltos**~~ — ✅ S1–S10 aceitos *(26/09)*, incluindo a opção nova
   "Nenhuma" (exclusiva) na P30. "Não se aplica" sai da P18 e da P68.
3. ~~**Listas fechadas da P9**~~: ✅ ficam as colunas do questionário, em texto livre
   com sugestões; o nome do morador é aceito (não só iniciais) *(26/09)*.
4. ~~**Unidade da P38**~~: ✅ hectares *(26/09)*.
5. ~~**"Outro" sem especifique**~~: ✅ campo "especifique" incluído em todas *(26/09)*.
6. ~~**Código de não resposta**~~: ✅ botão "Não respondeu" em toda pergunta +
   tela de revisão antes de salvar a ficha *(26/09)*.
7. ~~**Assimetria P61 × P62**~~: ✅ mantidas as listas diferentes, ambas múltiplas
   *(26/09)*. O comparativo usa só as opções comuns.
8. ~~**Domicílio sem mulher/sem homem**~~ — ✅ resolvido pela derivação D2 *(26/09)*.
   Derivações e avisos D1, D2, V1 e V2 também aceitos.
9. ~~**P54/P55 (sindicato)**~~: ✅ mantidas; P55 em texto livre com sugestões das
   respostas repetidas *(26/09)*. Ver §3.10.
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

A linguagem de salto é **deliberadamente mínima** (`=`, `!=`, `in`, `contem`,
`nao_contem` sobre uma única pergunta anterior, e `{"todas": [...]}` para
combinar; implementada em `fn_diag_cond`). Ela precisa ser avaliada em dois lugares — no app (para
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
| Composição do domicílio (**nome**, idade, sexo, parentesco, escolaridade, ocupação) | P9 | pessoal, **inclui nome de menores** | terceiros (moradores) |
| Localização do domicílio (GPS) | coluna fixa | pessoal (identifica a casa) | família |
| Fontes de renda, suficiência, benefícios sociais | P28, P29 | pessoal (vulnerabilidade) | família |
| Quem decide sobre dinheiro/produção | P63, P64 | pessoal (dinâmica doméstica) | família |
| **Filiação a sindicato** / organizações | P54, P55 | **sensível** (art. 5º, II) | entrevistado |
| Problemas de saúde | P25 | lista fechada ✅; **sensível** só se o "Outro" citar pessoa | terceiros |
| Caça, uso de madeira | P41 | pessoal; autodeclaração de conduta com implicação legal | família |
| 17 respostas abertas | ver inventário | podem conter nome de terceiros | terceiros |

**O que o instrumento não coleta — e deve continuar sem coletar:** CPF, telefone,
valor de renda, número de benefício (NIS), nome completo de moradores. O pedido
original citava renda e CPF; o PDF **não pede** nenhum dos dois em forma
identificável. Recomendação firme: **não acrescentar CPF**. Não há finalidade no
diagnóstico que o exija, e ele transformaria uma base de percepção em cadastro
nominal de famílias vulneráveis.

### 2.2 Minimização proposta (antes de publicar a v1)

1. **P9 — ✅ decidido: aceita o nome do morador** (a recomendação era só
   iniciais). Idade continua em anos, nunca data de nascimento. Como agora há
   **nome de crianças** na base, o nome do morador:
   - não é obrigatório: o técnico pode registrar só as iniciais;
   - fica fora de `vw_diag_respostas`/`vw_diag_indicadores`, de `fn_diag_agregados`
     e das sugestões; fica em `diag_moradores_identificacao` (§3.3), lida só pelo
     entrevistador e pela coordenação, **nunca pelo consultor externo**;
   - sai só na exportação identificada da coordenação, nunca na padrão;
   - entra na regra de retenção junto com a P4 e é apagado **2 anos após a
     validação** da ficha (§2.5).
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
3. **P55 — ✅ decidido: texto livre com sugestões** (§3.10). O dado continua
   **sensível** (filiação sindical e, eventualmente, religiosa ou política). Por
   isso: a P55 nunca sai em exportação para consultor nem em agregado com
   célula pequena (§4.4); a sugestão mostra só o nome da organização, nunca
   quem respondeu; e o texto é revisado na validação.
4. **P25 — ✅ decidido:** lista fechada de problemas de saúde; orientação "sem
   citar nomes" mantida no "Outro".
5. **GPS** — coordenada precisa só para quem aplica e para a coordenação;
   qualquer saída para fora (painel agregado, mapa, relatório, exportação para
   consultor) usa **nível de comunidade**, nunca o ponto da casa.
6. **Foto ✅ entra na v1** *(decidido em 26/09)*. Desenho e cuidados em §3.12.
   Em resumo: foto de moradia, infraestrutura e ambiente, **nunca de pessoas**;
   opcional; bucket privado; tratada como dado de identificação, porque a foto
   da casa localiza a família.

### 2.3 Base legal (a definir com o jurídico)

O DIMA já registra que a SEMA/AC é a controladora e que o tratamento se apoia no
art. 7º, III (execução de políticas públicas), **não em consentimento**. Para o
diagnóstico, as hipóteses candidatas são:

| Dado | Candidata | Observação |
|------|-----------|------------|
| Dados pessoais comuns | art. 7º, III (política pública) ou art. 7º, IV (estudo por órgão de pesquisa, com anonimização sempre que possível) | IV só se aplica se o executor for órgão de pesquisa — confirmar |
| Dado sensível (sindicato, saúde) | art. 11, II, "b" (política pública) ou art. 11, II, "c" (estudo por órgão de pesquisa) | se nenhuma couber, **retirar** o dado do instrumento em vez de pedir consentimento |
| Menores (P9) | art. 14 — melhor interesse | o nome é coletado (decisão de 26/09); precisa de justificativa no RIPD; apagado 2 anos após a validação |

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
  em relatório, que informar o próprio nome é opcional, que o técnico pode
  pedir para fotografar a casa e o entorno (sem pessoas) e a família pode
  recusar, a quem procurar (canal do Encarregado).
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

**✅ Decidido (26/09): o ROPA passa a viver no banco.** Molde: `lgpd_tratamentos`
do SIGUC (migration 211). Entra como a **primeira migration da Fase 1**, antes
das tabelas `diag_*`, porque a regra do SIGUC vale aqui: tabela nova com dado
pessoal ganha entrada no ROPA na mesma entrega. Desenho proposto:

| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `codigo` | text UNIQUE | `TRAT-001`… |
| `nome` / `finalidade` | text NOT NULL | |
| `modulo` | text | `diagnostico`, `viagens`… |
| `base_legal` / `base_legal_detalhe` | text NOT NULL | `text` + `CHECK`, não enum. `a_definir` é permitido e fica visível como pendência |
| `categorias_titulares` / `categorias_dados` | text[] | |
| `dado_sensivel` / `dado_de_menor` | boolean | |
| `tabelas` | text[] | tabelas reais que materializam o tratamento. É o que permite auditar o ROPA contra o schema |
| `compartilhamento` | text | |
| `retencao_criterio` | text NOT NULL | texto obrigatório; `NULL` em prazo ≠ "sem política" |
| `retencao_prazo` | interval | |
| `ativo`, `criado_em`, `atualizado_em` | | |

- Leitura: `super_admin`/`coordenacao` (`TO authenticated`). Escrita: `super_admin`.
- Tela: aba em Configurações, só leitura para a coordenação. Pode ficar para a Fase 3.
- ✅ A Fase 1 carrega **só a linha do diagnóstico** *(26/09)*. Os demais
  tratamentos do DIMA (viagens, beneficiários, fornecedores, CAR) ficam fora do
  escopo deste módulo e entram quando cada um for revisado.

Entrada do diagnóstico (primeira linha da tabela):

Rascunho da entrada:

| Campo | Valor proposto |
|-------|----------------|
| Tratamento | Diagnóstico socioambiental de comunidades (aplicação de questionário domiciliar) |
| Controlador | SEMA/AC |
| Operadores | Supabase (banco/hospedagem), Vercel (hospedagem do app), Google/Apple (loja/instalação do APK, se aplicável) |
| Finalidade | Subsidiar planejamento e prestação de contas do Projeto 218BRA2001 (Fundo Brasil-ONU/UNESCO) |
| Titulares | Entrevistados; moradores dos domicílios (inclui crianças e adolescentes); técnicos entrevistadores |
| Quem acessa | equipe da SEMA (técnicos, coordenação, super_admin) e **consultores externos a serviço da SEMA**, estes sem acesso aos dados de identificação nem às fotos (§4.1). ✅ Contrato do consultor terá **termo de confidencialidade e de proteção de dados (LGPD)** *(26/09)*: consultor como operador |
| Categorias | Identificação mínima, composição domiciliar, localização, **fotos da moradia e do entorno**, condições socioeconômicas, percepções; **sensíveis**: filiação sindical, saúde |
| Base legal | a definir (§2.3) |
| Compartilhamento | **nenhum** — uso interno da SEMA *(26/09)*. Para UNESCO/financiador vão só os valores de indicador lançados na Matriz de Resultados (§3.11), agregados e sem dado individual |
| Transferência internacional | Supabase/Vercel (art. 33) — pendência já conhecida do DIMA |
| Retenção | **2 anos** *(26/09)* para os dados identificados: nome do entrevistado (P4), nomes dos moradores (P9), GPS preciso, **fotos**, `diag_fichas_identificacao`, contados da **data de validação da ficha** *(26/09)*. Ficha descartada conta da data do descarte. Ficha nunca validada nem descartada não expira; ela aparece para a coordenação como pendência. Depois do prazo, apagados por rotina agendada (pseudonimização); ficha, respostas e indicadores permanecem |
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

**Identificação separada da ficha.** Com a decisão de 26/09, o consultor externo lê
a ficha individual, mas não os dados de identificação. RLS é por **linha**, não
por coluna, então tudo o que identifica a família sai de `diag_fichas`/
`diag_moradores` e vai para tabelas próprias, que o consultor não lê. É a mesma
razão de `beneficiario_dados_bancarios`.

`diag_fichas_identificacao` (1:1 com `diag_fichas.id`; só existe quando há nome
**ou** GPS):

| Coluna | Tipo | Obs |
|--------|------|-----|
| `ficha_id` | uuid PK/FK | `ON DELETE CASCADE` |
| `entrevistado_nome` | text | P4, opcional |
| `lat` / `lon` / `gps_precisao_m` / `gps_em` | numeric / timestamptz | leitura pontual (padrão Água: `bGpsUmaLeitura`), NULL se sem sinal — **nunca trava** |
| `obs_localizacao` | text | ex.: "casa azul depois da ponte", opcional |

`diag_moradores_identificacao` (1:1 com `diag_moradores.id`): `morador_id`
PK/FK, `nome`.

- Leitura: o próprio entrevistador e `coordenacao`/`super_admin`. **Nunca**
  `consultor_externo` nem `visualizador`, e nunca entram em view de indicador.
- A RPC de envio (§3.7) grava ficha, moradores e as duas identificações na
  **mesma transação**.
- **Retenção vira `DELETE`** nessas duas tabelas, por rotina agendada, 2 anos
  após a validação (§2.5). A ficha e os moradores ficam, já sem identificação.
  A trilha de auditoria registra a exclusão em modo redigido.

### 3.4 `diag_moradores` — tabela da P9

| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `ficha_id` | uuid FK NOT NULL | `ON DELETE CASCADE` |
| `ordem` | smallint NOT NULL | `UNIQUE (ficha_id, ordem)` |
| `idade` | smallint | 0–120 |
| `sexo_genero` | text | mesmo vocabulário da P5 |
| `parentesco` / `escolaridade` / `atividade_principal` | text | texto livre (colunas do questionário); limite de tamanho, sem lista fechada |
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
  escolar) são funções SQL chamadas pela view —
  inclusive as usadas pelo app para sugerir resposta (D1/D2 do inventário). O app
  **exibe**, não recalcula.
- Perguntas de nível `C` (fato da comunidade, respondido por cada domicílio)
  saem como "% dos entrevistados que relatam", nunca como "a comunidade tem".
- **Bloco 9 sempre desagregado** pelo sexo do respondente (P5).
- Só entram fichas `validada`; `enviada` aparece marcada ("em conferência"), nunca
  escondida — mesma cautela da quarentena do SIGUC Água.
- ✅ O diagnóstico alimenta a Matriz de Resultados *(26/09)*, sempre **a partir
  desta view**, nunca de cálculo novo. Ver §3.11.

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

RPC `diag_enviar_ficha(p_ficha jsonb, p_moradores jsonb, p_fotos jsonb)`.
**Mudança na Fase 1:** a RPC é **SECURITY DEFINER**, e não INVOKER como o padrão
`frota_solicitar_viagem`. As tabelas `diag_*` ficaram **sem policy de escrita**
para o cliente, então a validação e as derivadas não podem ser contornadas por
INSERT direto. A carência de 15 dias também exige ler a permissão já vencida, o
que `tem_permissao()` não faz. A função confere tudo explicitamente: usuário
ativo, perfil, permissão, dono da ficha e status. Passos:

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

### 3.10 Sugestões a partir de respostas repetidas (P55)

Decisão (26/09): a P55 continua em texto livre, e o que se repete vira sugestão.

**Como funciona**
- O banco normaliza cada resposta: sem acento, minúsculas, espaços colapsados.
  É a mesma normalização da busca do Acervo.
- Uma resposta vira sugestão quando aparece em **pelo menos 2 fichas
  diferentes**. Isso é o "se repetem"; uma resposta única nunca é sugerida.
- A sugestão exibida é a grafia **mais frequente** do grupo normalizado.
- O técnico digita e vê as sugestões que casam com o que está escrevendo. Pode
  escolher uma ou seguir com o próprio texto. **Nada é obrigatório nem trava.**

**Onde mora (um lugar só)**
- Função `fn_diag_sugestoes(p_chave text)` SECURITY DEFINER, restrita a quem
  pode aplicar. Ela é necessária porque o técnico só lê as próprias fichas pelo
  RLS, e as repetições estão nas fichas dos outros. A função devolve **só o
  texto da sugestão**, sem ficha, sem entrevistador, sem comunidade e sem
  contagem.
- Recebe a chave da pergunta porque o mesmo mecanismo serve a várias perguntas.
  **Ligado (26/09):** P55, P31 e as colunas Parentesco, Escolaridade e Atividade
  principal da P9. **Nunca ligado:** nome do morador, P4 e "especifique" de
  Sexo/gênero. **Desligado por padrão:** os demais campos "especifique". Só
  entram as chaves marcadas na estrutura do questionário (`"sugestoes": true`),
  para que a função não sirva para ler texto livre qualquer.

**Offline**
- A lista vem junto com o questionário e o catálogo de comunidades a cada
  sincronização e fica no IndexedDB. Em campo, o app sugere a partir desse cache
  e das fichas do próprio aparelho. Sem rede, as sugestões ficam só um pouco
  desatualizadas; nada deixa de funcionar.

**Cuidados (dado sensível)**
- A sugestão revela que *alguém* citou aquela organização, nunca *quem*.
- A coordenação pode **ocultar** uma sugestão (erro de digitação, nome de
  pessoa digitado por engano). Fica numa tabela pequena
  `diag_sugestoes_ocultas(chave, texto_normalizado, ocultado_por, ocultado_em)`,
  sem apagar a resposta original.
- **✅ Fichas `enviada` e `validada` entram na base de sugestões** *(26/09,
  conforme a recomendação)*. Na fase de campo quase nada estará validado ainda,
  e a ocultação cobre os erros. Fichas `devolvida` e `descartada` ficam de fora.


### 3.11 Alimentar a Matriz de Resultados

Decisão (26/09): o diagnóstico alimenta a Matriz. Achado no banco que define o
desenho: `produto_matriz_contribuicao.produto_id` é FK para
**`contratos_produtos_entregas`**, e o dashboard soma só essa tabela
(`pages/dashboard.html`, `status = 'confirmado'`). Uma ficha de diagnóstico não é
entrega de produto, então **não cabe** nessa tabela sem inventar uma entrega falsa.

Proposta:
1. **`diag_matriz_vinculo`**: qual indicador do diagnóstico alimenta qual
   `matriz_itens.id`, com qual recorte (projeto todo, município, comunidade) e
   qual medida (contagem de fichas/pessoas ou percentual). É dado, editado pela
   coordenação, e não exige deploy.
2. **`diag_matriz_contribuicao`**: fotografia do valor, com o mesmo ciclo da
   contribuição de produto (`pendente → confirmado | rejeitado | cancelado`,
   `confirmado_por/em`). O valor sai de `vw_diag_indicadores` no momento da
   fotografia, junto com o nº de fichas e a data de corte. A coordenação
   confirma; nada entra na Matriz sozinho. A fotografia é necessária porque o
   indicador ao vivo muda a cada ficha, e a Matriz reportada à UNESCO não pode
   mudar depois de confirmada.
3. **Uma soma só:** a view `vw_matriz_contribuicoes` (`UNION ALL` de produto +
   diagnóstico) passa a ser a fonte do dashboard. Assim a Matriz não tem duas
   contas paralelas que possam divergir, a mesma lição do `vw_saldo_atividade`.
   Mexer no dashboard é pequeno, mas toca uma tela em produção: entra na Fase 3,
   com teste comparando o total antes e depois.

**❓ Quais itens da Matriz?** Nenhum item ativo cita diagnóstico. Os mais próximos
falam de pessoas capacitadas e de mulheres (1.1, 1.3, 3.1, 3.3, 3.x), mas não são
medidos por um questionário domiciliar. Duas saídas:
- o diagnóstico serve de **linha de base** (situação de referência) para itens
  existentes. Exemplo: "% de mulheres com renda própria" (P65/P71) como
  referência do item 3.x;
- ou a coordenação **cria itens novos** na Matriz, por exemplo "Nº de famílias
  diagnosticadas" (meta 200) ou "Comunidades com diagnóstico concluído".

✅ **Decidido (26/09): a escolha dos itens fica para depois.** Por isso a
integração com a Matriz (os passos 1–3 acima) **sai da Fase 1** e vira uma etapa
própria, feita quando os itens forem definidos. Nada no modelo de fichas depende
dela: `vw_diag_indicadores` já produz os números, e o vínculo só passa a
lê-los.


### 3.12 Fotos (v1)

Decisão (26/09): a foto entra na v1. Molde: SIGUC (`brigada-captura.js`,
`foto-otimizar.js`, `fotos-privadas.js`, bucket privado desde o nascimento).

**O que fotografar:** moradia, fonte de água, destino do esgoto e do lixo,
área produtiva, acesso à comunidade, problema ambiental citado. **Nunca
pessoas.** O app não consegue impedir um rosto na imagem, por isso a regra vai
no treinamento e numa frase fixa na tela da câmera. A coordenação apaga, na
validação, a foto que tiver pessoa.

**Opcional e sem travar:** nenhuma pergunta exige foto. A família pode recusar
(§2.4). Limite sugerido: até 8 fotos por ficha.

**Tabela `diag_fotos`:**

| Coluna | Tipo | Obs |
|--------|------|-----|
| `id` | uuid PK | |
| `ficha_id` | uuid FK NOT NULL | `ON DELETE CASCADE` |
| `uuid_cliente` | uuid UNIQUE | idempotência da fila, mesmo padrão da ficha |
| `tema` | text | `moradia \| agua \| esgoto \| lixo \| producao \| acesso \| ambiental \| outro` (CHECK) |
| `pergunta_chave` | text | opcional: a pergunta a que a foto se refere (ex.: `agua_fonte`) |
| `legenda` | text | curta, opcional |
| `arquivo_url` | text | formato `/object/public/<bucket>/<path>`, só como portador do caminho (regra do DIMA) |
| `tirada_em` | timestamptz | |

**Storage:**
- Bucket **`diagnostico-fotos`, privado**. Leitura sempre por `urlAssinada()` e
  `data-arquivo-src`. Nunca `href` direto (regra de Storage do CLAUDE.md).
- Caminho `<uuid_cliente da ficha>/<uuid_cliente da foto>.jpg`. Usa o
  `uuid_cliente` porque a ficha ainda não tem `id` do servidor quando a foto é
  tirada offline. A policy do bucket lê a 1ª pasta e aplica o acesso da ficha,
  mesmo padrão de `tarefas-anexos`.
- Compressão no aparelho antes de entrar na fila (`foto-otimizar.js`, ~1600 px,
  JPEG). Reencodar pelo canvas **remove o EXIF**, inclusive o GPS embutido na
  foto. Isso é desejado: a localização oficial é a da ficha.

**Envio:** a fila sobe as fotos primeiro e depois chama a RPC da ficha (ordem do
`agua-sync.js`). Foto que falhar não segura a ficha: a ficha vai, e a foto fica
pendente na fila e é reenviada depois.

**Acesso e retenção:** a foto da casa localiza a família, então segue a regra da
**identificação**:
- vê: o entrevistador (só as próprias), a coordenação e o super_admin;
- **não vê:** consultor externo nem visualizador;
- nunca entra em exportação padrão;
- é **apagada 2 anos após a validação**, junto com nome e GPS (arquivo e linha).

Volume: 200 fichas × 8 fotos × ~300 KB ≈ 480 MB no bucket e, no aparelho, só as
pendentes. Isso muda a conta de armazenamento offline da §5.2: foto confirmada
sai do aparelho junto com a ficha (7 dias).

---

## 4. Acesso

### 4.1 Matriz de perfis

| Perfil | Aplicar | Ver fichas | Identificação (nome) | Validar/devolver | Exportar identificado | Agregados |
|--------|---------|-----------|----------------------|------------------|----------------------|-----------|
| `super_admin` | ✅ | todas | ✅ | ✅ | ✅ | ✅ |
| `coordenacao` | — *(26/09)* | todas | ✅ | ✅ | ✅ | ✅ |
| `tecnico` + `tem_permissao('diagnostico')` | ✅ | **só as próprias** | só as próprias | — | — | ✅ gerais, com supressão *(26/09)* |
| `tecnico` sem permissão | — | — | — | — | — | — |
| `financeiro` | — | — | — | — | — | — *(26/09)* |
| `consultor_externo` + `tem_permissao('diagnostico')` | — | **todas, só leitura** *(26/09)* | **não** | — | — (só exportação padrão, sem identificação) | ✅ |
| `visualizador` | — | — | — | — | — | ✅ (com supressão) |

- **Coordenação não aplica questionário** *(26/09)*: valida, devolve e exporta.
  Quem aplica é o técnico com permissão. O `super_admin` mantém o "tudo".
- **Técnico vê os números gerais** *(26/09)*: indicadores de todo o diagnóstico,
  pela mesma função de agregados com supressão do `visualizador` (§4.4). Fichas
  individuais continua vendo só as próprias.

**Consultor externo (26/09, confirmado):** vê a ficha individual (respostas, moradores sem
nome, comunidade, alertas), mas **não** os dados de identificação (nome do
entrevistado, nomes dos moradores, GPS preciso). O acesso depende da
mesma concessão com prazo (`tem_permissao('diagnostico')`) dada pelo
`super_admin`, porque nem todo consultor externo trabalha no diagnóstico. A P55
(sindicato) e os textos abertos ficam visíveis na ficha, por isso o acesso é
nominal, com prazo, e registrado.

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
                         AND (perfil = 'super_admin'
                              OR (perfil = 'tecnico' AND tem_permissao('diagnostico')))
fn_diag_pode_gerir()   = usuário ativo AND perfil IN ('super_admin','coordenacao')
fn_diag_pode_consultar() = usuário ativo AND perfil = 'consultor_externo'
                           AND tem_permissao('diagnostico')
```

Policies (todas `TO authenticated`, nenhuma `USING (true)`):

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| `diag_questionarios` | `fn_diag_pode_aplicar() OR fn_diag_pode_gerir()` | gerir | gerir (trigger protege publicada) | — |
| `diag_comunidades` | aplicar ou gerir | gerir | gerir | — (desativar) |
| `diag_fichas` | `entrevistador_id = auth.uid() AND fn_diag_pode_aplicar()` OR gerir OR `fn_diag_pode_consultar()` | `entrevistador_id = auth.uid()` AND aplicar | próprio + status `enviada/devolvida`, OR gerir | — (`descartada`) |
| `diag_fichas_identificacao` / `diag_moradores_identificacao` | próprio entrevistador OR gerir (**sem** consultar) | igual à ficha | igual à ficha | só a rotina de retenção |
| `diag_moradores` | via ficha (inclui consultar) | via ficha | via ficha | via ficha (RPC regrava) |
| `diag_fotos` (+ bucket `diagnostico-fotos`) | igual à identificação (**sem** consultar) | entrevistador da ficha | — | gerir (foto com pessoa) e rotina de retenção |

### 4.3 Permissão que vence com fichas na fila

Cenário real: permissão concedida até dia 10, técnico aplica no dia 9 sem sinal,
volta à cidade no dia 12. Com a regra acima o envio é recusado e o trabalho de
campo fica preso no aparelho — viola "nada bloqueia o trabalho de campo".

Proposta: a RPC aceita o envio se a permissão estava válida em `finalizada_em`
**e** o envio ocorre até **15 dias** *(decidido em 26/09)* depois do `valido_ate`. A
data do aparelho não é confiável sozinha, por isso a tolerância é limitada e a
ficha que usar a carência ganha um `alerta` para a coordenação conferir. Fora da
carência: a ficha fica no aparelho como "aguardando renovação de acesso", nunca
é apagada, e o `super_admin` renova o prazo.

### 4.4 Agregados para `visualizador` e `tecnico`

(O `consultor_externo` com permissão lê as fichas e usa as views diretamente.)
O `visualizador` **não lê linha nenhuma** das tabelas `diag_*`, e o `tecnico` só
lê as próprias fichas. Uma view `security_invoker` devolveria vazio ou só a
parte dele. A saída é uma função
`fn_diag_agregados(p_municipio, p_comunidade, …)` SECURITY DEFINER que:

- confere o perfil do chamador;
- lê `vw_diag_indicadores` (a mesma fonte do painel da coordenação — nunca um
  segundo cálculo);
- **suprime células com menos de 5 fichas** *(limite decidido em 26/09)* (ou agrega para o município), porque
  numa comunidade de 3 famílias "33% relatam filiação a sindicato" identifica a família;
- nunca devolve texto aberto, nome, GPS nem moradores.

É a mesma lógica das funções `fn_publico_*` do DIMA, aplicada a perfis logados.

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

✅ **O DIMA inteiro está na Vercel** *(26/09)*; o CLAUDE.md foi corrigido nesta
entrega (dizia "GitHub Pages"). O repositório ainda não tem `vercel.json` nem
`api/`. Para PWA isso importa já na Fase 2: o service worker precisa do header
`Service-Worker-Allowed` e o download do APK depende de `api/apk-latest.js`
(padrão SIGUC). O `vercel.json` novo vale para o site todo, por isso entra
testado contra as páginas atuais, sem mudar cabeçalhos de segurança de nenhuma
delas às cegas.

### 5.2 Offline

Volume é pequeno: 200 fichas × ~20 KB ≈ 4 MB — IndexedDB sobra. Com fotos, o
que pesa são as pendentes (~300 KB cada, §3.12); confirmadas saem em 7 dias. O que vai para o
aparelho: a versão publicada do questionário, o catálogo de comunidades e o
perfil/permissão do técnico. Molde: `agua-offline.js` (fila `pendente → enviando
→ confirmado`, confirmados retidos 7 dias, pendentes nunca apagados,
`navigator.storage.persist()`), `agua-sync.js` (teste real de conexão por HEAD,
renovação de sessão antes de enviar, backoff 2/4/8/16 s).

Diferença do SIGUC Água: aqui há **rascunho longo** (entrevista de 45–70 min que
pode ser interrompida). O rascunho precisa ser salvo a cada resposta, não só ao
final.

Dois "salvar" diferentes, para não confundir:
- **Rascunho automático** — cada resposta é gravada no aparelho na hora, sem
  botão. Se o app fechar, a bateria acabar ou o técnico interromper a
  entrevista, nada se perde.
- **Salvar a ficha (concluir)** — passa pela **tela de revisão** (decidido em
  26/09; ver inventário, "Pontos transversais" item 2). Só depois dela a ficha
  entra na fila de envio. A revisão avisa e não trava: a ficha pode ser
  concluída com pendências, que seguem em `alertas`.

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
| **0** | Este plano + instrumento v1 + entrada de ROPA + rascunho do RIPD ✅ |
| **1** | Migrations: **ROPA no banco (`lgpd_tratamentos`) primeiro**; depois tabelas, funções de acesso, RPC de envio, views de indicador, rotina de retenção de 2 anos, questionário v1 carregado; testes SQL ✅ **aplicada em produção em 26/09 (hash do questionário conferido) — ver §6.1** |
| **2** | App PWA offline: login + PIN, lista de fichas, formulário renderizado da estrutura, rascunho contínuo, GPS pontual, fotos, fila de envio ✅ **ver §6.2** |
| 3 | Mesa: validação/devolução, painel de indicadores, exportação `.xlsx` (ExcelJS, regra SIGUC), exportação pseudonimizada |
| 4 | APK Capacitor (`app-diagnostico/`), workflow de build com action pinada em SHA, `api/apk-latest.js`, `vercel.json` |
| 5 | Piloto (5 fichas), guia de treinamento no app (`guia-app.js`), aplicação |

### 6.1 Fase 1 — o que foi entregue

Migrations (ordem de aplicação):

| Arquivo | Conteúdo |
|---------|----------|
| `20260926_lgpd_tratamentos.sql` | ROPA no banco + entrada `TRAT-001` (diagnóstico). `retencao_prazo` é lido pela rotina de retenção |
| `20260926_diag_01_estrutura.sql` | catálogos (22 municípios com código IBGE e sigla; comunidades), questionário versionado (publicado = imutável, hash SHA-256 gerado), fichas, identificação separada, moradores, fotos, histórico de status, sugestões ocultas, fila de expurgo; funções de acesso; RLS; auditoria redigida |
| `20260926_diag_02_envio.sql` | interpretador da estrutura (saltos, derivadas, validação, alertas); `diag_enviar_ficha` (idempotente, uma transação); `diag_mudar_status` (validar, devolver, descartar, reabrir) |
| `20260926_diag_03_indicadores.sql` | `vw_diag_respostas`, `vw_diag_indicadores` (contagens aditivas), `fn_diag_agregados` (supressão abaixo de 5), `fn_diag_sugestoes` |
| `20260926_diag_04_fotos_retencao.sql` | bucket privado `diagnostico-fotos` + policies por caminho; `fn_diag_aplicar_retencao` + cron diário 06:17 UTC |
| `20260926_diag_05_questionario_v1.sql` | questionário v1 (81 perguntas) como **rascunho** |

Testes: `supabase/tests/diagnostico/rodar.sh` sobe um Postgres 16 descartável,
aplica um stub do Supabase + as migrations e roda `10_testes.sql`: 28 blocos
cobrindo anon, cada perfil (técnico, técnico sem permissão, inativo, carência
de 5 e de 20 dias, coordenação, consultor com e sem permissão, visualizador,
financeiro), idempotência do reenvio, saltos S1/S10, derivada P26, validação,
"especifique", "Não respondeu", alertas V1/V2/D2, recusa, fotos e Storage,
agregados e supressão (inclusive por sexo), sugestões, versão imutável,
retenção de 2 anos, auditoria sem nome em claro e ausência de `USING (true)` e de
grant ao anon. **Todos passam.**

Decisões de implementação que o plano não tinha:
- **Escrita só pela RPC** (DEFINER, §3.7). Leitura continua por RLS.
- **Recusa** (`aceitou_participar = false`) grava só comunidade, data e
  entrevistador: respostas, moradores, nome, GPS e fotos são descartados.
- **Questionário em rascunho não recebe fichas.** Para o piloto, a coordenação
  publica a v1. Se o piloto pedir mudança, a correção vira v2.
- **Reabrir** ficha validada é permitido (volta a `devolvida`, com motivo).
- **Arquivo de foto não é apagado pelo banco:** a remoção (pela coordenação ou
  pela retenção) põe o caminho em `diag_expurgo_arquivos`. Falta a Edge
  Function que drena a fila pela API do Storage (Fase 3).
- ✅ Aviso da v1 com a Encarregada de Dados (Luciana Rôla) e contato **só por e-mail**, divbioac@gmail.com (migration `20260926_diag_06_aviso_encarregado.sql`, aplicada em produção em 26/09).

Ainda **não** feito na Fase 1: o item `diagnostico` em `MODULOS_LISTA`
(`pages/usuarios.html`) para conceder a permissão pela tela. Até lá, a concessão
é por SQL. Entra com a Fase 2/3.


### 6.2 Fase 2 — o que foi entregue

App de campo em `pages/diagnostico-app.html`, instalável como PWA. Não usa
`gerarLayout` nem `carregarUsuario()`: é um app de uma coluna para celular, e
`carregarUsuario()` desloga após 30 minutos sem uso.

| Arquivo | Papel |
|---------|-------|
| `js/diag-regras.js` | Espelho em JS do interpretador do banco: saltos, derivadas, normalização, alertas, código da ficha. Funções puras, que rodam no navegador e no Node |
| `js/diag-offline.js` | IndexedDB `dima_diag_v1`: fichas, fotos (blob), cache de referência, configuração. Pendente nunca é apagada; enviada sai do aparelho em 7 dias |
| `js/diag-sync.js` | Fila de envio: teste real de conexão, renovação de sessão, fotos antes da ficha, `diag_enviar_ficha` idempotente, tratamento por código de erro `diag:*`, retorno das devolvidas e do status do servidor |
| `js/diag-form.js` | Formulário montado a partir de `diag_questionarios.estrutura`: única, múltipla (com exclusiva), número, texto, "especifique", "Não respondeu", P26 calculada, tabela de moradores com a 1ª linha ligada à P5/P6, sugestões, fotos |
| `js/diag-app.js` | Telas e fluxo: login, PIN, início, nova entrevista, aviso ao entrevistado, ficha, revisão, configurações |
| `css/diagnostico-app.css` | Visual para celular, com alvos de toque de 48 px e contraste alto |
| `diagnostico-sw.js` (raiz) + `pwa/diagnostico.webmanifest` + ícone | Service worker com escopo restrito à página do app: guarda o shell para abrir sem internet e nunca guarda chamadas ao Supabase |

**Fluxo em campo:**
1. **Primeiro acesso, com internet:** e-mail e senha, depois cria um PIN de 4
   dígitos. O app baixa o questionário publicado, os municípios, as comunidades
   e as sugestões.
2. **Aberturas seguintes, mesmo sem sinal:** entra com o PIN. Depois de 5 erros,
   pede e-mail e senha de novo, sem apagar nada.
3. **Nova entrevista:** data, município, comunidade (ou "Outra"), aviso lido em
   voz alta e a decisão de participar. A recusa vai direto para a fila, só com
   comunidade, data e entrevistador.
4. **Ficha:** um bloco por tela, gravado no aparelho a cada toque. GPS opcional
   numa leitura só. Até 8 fotos, comprimidas e sem os metadados (EXIF).
5. **Revisão:** lista as perguntas em branco e os avisos; tocar leva à pergunta.
   A revisão só avisa: sempre dá para salvar.
6. **Fila:** envia quando há sinal (ao abrir o app, pelo botão ou quando a rede
   volta). Ficha devolvida pela coordenação volta ao aparelho com o motivo.

**Testes:**
- `supabase/tests/diagnostico/rodar.sh` passou a incluir o **teste cruzado**:
  1.000 casos com semente fixa, com resultado idêntico entre JS e SQL. Uma
  mutação introduzida de propósito foi detectada.
- `tests/diagnostico/rodar_app.sh`: Chromium abre o app de verdade; as chamadas
  ao Supabase vão para o Postgres local, com RLS e as funções reais, como o
  usuário logado. O teste cobre:
  - login e PIN;
  - ficha completa com saltos, "especifique", opção exclusiva e "Não respondeu";
  - P26 calculada;
  - foto;
  - revisão;
  - salvar sem sinal e enviar quando o sinal volta;
  - conferência no banco (respostas normalizadas, moradores, identificação
    separada, foto no bucket, alertas iguais aos do app);
  - reenvio sem duplicar;
  - recusa;
  - devolução voltando ao aparelho;
  - reabrir com PIN.

  Precisa do pacote `playwright` (via `NODE_PATH`) e do Chromium em
  `/opt/pw-browsers`. O service worker fica bloqueado no teste; o cache offline
  do shell não é exercitado aqui.

**Mesa:** `diagnostico` entrou em `MODULOS_LISTA` (`pages/usuarios.html`). O
super_admin já concede o acesso com prazo pela tela de Usuários.

**Para usar em campo:**
1. **Publicar a v1:** a coordenação publica a v1 (`status = 'publicado'`).
   Enquanto ela for rascunho, o app mostra "Nenhum questionário publicado".
2. ~~**Cadastrar comunidades**~~ — ✅ *(26/09)* piloto nas duas APAs de Rio Branco,
   cadastradas em `diag_comunidades`: **APA São Francisco** e **APA Lago do Amapá**.
   Outras UCs entram depois pelo mesmo cadastro.
3. **Liberar o acesso:** conceder o módulo `diagnostico` aos técnicos do piloto.
4. **Publicar o app:** a branch precisa entrar na `main`, que é o que a Vercel
   publica.
5. ~~**Canal do Encarregado**~~ — ✅ definido (e-mail). Ele estava
   marcado A DEFINIR, e o aviso publicado fica imutável.

---

## 7. Perguntas para fechar a Fase 0

**Instrumento (equipe do diagnóstico)**
1. ✅ Todas as lacunas da §1.2 fechadas *(26/09)*. Próximo passo: piloto com 5
   questionários antes de publicar a v1.
2. ~~Nome oficial~~ — ✅ **Diagnóstico Socioambiental**.

**LGPD (jurídico)**
3. Base legal (§2.3) e se o executor se enquadra como órgão de pesquisa.
4. ~~Manter o nome do entrevistado (P4)?~~ — ✅ **opcional**. Resta ao jurídico: prazo de retenção do nome (entra na pergunta 6).
5. P54/P55 (sindicato): ✅ mantidas, P55 com sugestões. Resta ao jurídico
   confirmar a base legal para esse dado sensível (art. 11).
6. ~~Prazo de retenção~~ — ✅ **2 anos** para nome, nomes de moradores e GPS preciso *(26/09)*.
7. RIPD (Relatório de Impacto à Proteção de Dados, art. 38) antes do campo? Recomendado:
   dado sensível (P55), nomes de crianças (P9) e população vulnerável.

**Acesso e produto (você)**
8. ~~Coordenação aplica? Agregado do técnico?~~ — ✅ coordenação não aplica; técnico vê os números gerais.
9. ~~`financeiro`~~ — ✅ sem acesso.
10. ~~Supressão~~ — ✅ mínimo de 5 fichas.
11. ~~Carência~~ — ✅ 15 dias.
12. ~~Foto~~ — ✅ entra na v1 (§3.12).
18. ~~Bloco 9~~ — ✅ aplicado em privado.
19. ~~Contrato do consultor~~ — ✅ termo de confidencialidade e LGPD.
13. ~~Matriz~~ — ✅ alimenta; itens definidos depois, em etapa própria (§3.11).
14. ~~Hospedagem~~ — ✅ DIMA inteiro na Vercel.
15. ~~ROPA no banco~~ — ✅ agora (1ª migration da Fase 1).
16. ~~Consultor externo~~ — ✅ vê fichas individuais, sem identificação (§4.1).
17. Retenção — ✅ 2 anos contados da validação; ROPA só com o diagnóstico.
