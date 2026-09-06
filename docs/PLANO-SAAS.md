# Plano de Transformação da DIMA em SaaS
### De plataforma single-tenant (Projeto 218BRA2001 · SEMA/AC) a SaaS vertical B2G para projetos com financiamento internacional

> Documento de planejamento estratégico e técnico. **Nenhuma linha de código de produto deve ser escrita antes das decisões da Seção 12 estarem fechadas.**
> Versão 1.0 · Setembro/2026

---

## 0. Sumário Executivo

A DIMA hoje é uma plataforma robusta e madura para gestão de **um** projeto de cooperação internacional (SEMA/AC · Fundo Brasil-ONU · UNESCO). Ela já resolve, num nível que a maioria das ferramentas genéricas de gestão de projetos não resolve, o problema mais doloroso desse mercado: **prestação de contas e conformidade de projetos com financiamento internacional** — TDRs com fluxo de aprovação UNESCO, contratos vinculados a atividades e orçamento, execução financeira em BRL/USD, acervo digital auditável, auditoria por IA em 6 domínios e LGPD levada a sério.

Essa especificidade é o ativo. Não é uma ferramenta de gestão de projetos com um módulo financeiro; é uma ferramenta de **compliance e prestação de contas** para quem executa dinheiro de agência da ONU, banco multilateral ou fundo climático — um nicho de alto valor, ciclo de venda consultivo e baixa concorrência qualificada.

**Recomendação:** transformar a DIMA em um **SaaS vertical B2G multi-tenant**, com isolamento por RLS (Postgres/Supabase) como padrão e opção de isolamento dedicado para clientes governamentais/enterprise. Posicionamento: **Brasil + América Latina**, trajetória de **captação (seed) e crescimento acelerado**.

**Números-âncora deste plano (detalhados na Seção 8):**

| Métrica | Meta |
|---|---|
| ARPA blended (ano 1) | ~R$ 3.800/mês (ACV ~R$ 46k) |
| Margem bruta | ~82% |
| CAC blended | ~R$ 22k/logo |
| Payback de CAC | ~6,4 meses |
| LTV/CAC | ~9x |
| ARR ano 3 (cenário base) | ~R$ 7,4M |
| Rodada seed sugerida | R$ 6–9M (≈ USD 1,2–1,7M) para 18–24 meses de pista |

**O maior risco e o maior trabalho são a mesma coisa:** hoje **não existe conceito de tenant** no banco. Toda a segurança é RLS por `perfil` com `auth.uid()`, há políticas `USING (true)` (branding, tabela `usuarios`) e as Edge Functions rodam com `service_role` (que **ignora RLS**). Multi-tenancy feita de forma ingênua nesse cenário **vaza dados entre clientes** — o pior incidente possível para um SaaS B2G. A Seção 5 trata isso como problema de engenharia de primeira classe.

---

## 1. Diagnóstico do Estado Atual

### 1.1 O que já existe (inventário técnico)

| Dimensão | Situação |
|---|---|
| Frontend | HTML/CSS/JS puro, 23 páginas, padrão IIFE + `gerarLayout()`. ~50k linhas no total do repo |
| Backend | Supabase (Postgres + Auth + RLS + Storage), projeto único `wfymnmlinonvdqfucjya` |
| Edge Functions | 14 funções Deno/TS (auditoria IA, análise de TDR, e-mails, prestação pública, etc.) |
| IA | Claude via Anthropic SDK (auditor, análise/correção de TDR, chat de auditoria) |
| Hospedagem | GitHub Pages, deploy direto na `main` |
| i18n | pt/en/es já presentes em `config.js` |
| Moeda | BRL + USD já modelados (`valor_brl`, `valor_usd`) |
| LGPD | Maduro: allowlist do `anon`, buckets privados + URLs assinadas, redação de CPF antes da Anthropic, trilha de auditoria imutável, dados bancários segregados |

### 1.2 Forças (o que sustenta o valor do SaaS)

1. **Domínio profundo e correto.** O fluxo TDR → aprovação → licitação → contrato → execução → produto → prestação de contas está modelado com fidelidade ao mundo real das agências da ONU. Isso leva anos para um concorrente replicar.
2. **IA como diferencial nativo, não enfeite.** Auditoria automática em 6 domínios + supervisor Claude, análise e correção de TDR. É exatamente o tipo de trabalho manual caro que justifica assinatura.
3. **Postura de privacidade acima da média.** A base LGPD já implementada (redação, segregação de dados bancários, buckets privados, trilha imutável) é um argumento de venda direto para o comprador B2G — e reduz drasticamente o custo de virar "enterprise-ready".
4. **Multi-idioma e multi-moeda já existem.** Expansão LATAM (PT/ES, USD) é evolução, não reconstrução.
5. **Stack barata e escalável.** Postgres + RLS é o substrato ideal para multi-tenancy pooled de alta margem.

### 1.3 Lacunas para virar SaaS (o trabalho)

| Lacuna | Gravidade | Onde |
|---|---|---|
| **Não há modelo de tenant/organização** | 🔴 Crítica | Nenhuma tabela tem `org_id` |
| Políticas `USING (true)` (`configuracoes_sistema`, `usuarios_select`) | 🔴 Crítica | Vazam entre tenants se não forem escopadas |
| Edge Functions usam `service_role` (ignora RLS) | 🔴 Crítica | Sem escopo de tenant explícito, vazam tudo |
| `anon` key pública lê 3 tabelas globais | 🟠 Alta | Portal público precisa ser resolvido por tenant |
| Storage sem prefixo de tenant | 🟠 Alta | Buckets compartilhados sem isolamento de path |
| Sem billing/assinatura | 🟠 Alta | Não existe cobrança, planos, limites |
| Sem onboarding/self-service | 🟠 Alta | Criação de usuário é manual (`fn_criar_usuario`) |
| Branding é global (1 linha em `configuracoes_sistema`) | 🟡 Média | Precisa ser por tenant (white-label) |
| Hospedagem em GitHub Pages, deploy na `main` | 🟡 Média | Sem staging, sem CI/CD, sem rollback |
| Sem observabilidade/SLA/DR formais | 🟡 Média | Exigência de contrato B2G/enterprise |
| Config hard-coded no `config.js` (URL/anon key) | 🟡 Média | OK para pooled; rever para multi-região |

---

## 2. Posicionamento e Mercado

### 2.1 Cliente Ideal (ICP)

**Comprador primário:** organização que **executa recursos de financiamento internacional** e precisa prestar contas ao financiador com rigor.

Perfis concretos:
- Secretarias estaduais/municipais executando projetos de cooperação técnica (UNESCO, PNUD, UNODC, FAO, UNICEF).
- Fundações de apoio e OSCIPs que operam projetos para órgãos públicos.
- ONGs e institutos que recebem de fundos climáticos e bancos multilaterais (Fundo Amazônia/BNDES, GEF, GCF, BID, Banco Mundial, KfW, GIZ).
- Escritórios-país de agências da ONU que precisam de visibilidade sobre parceiros implementadores (venda enterprise/portfólio).

**Job-to-be-done:** "Preciso comprovar, com trilha auditável e no formato que o financiador exige, que cada dólar do projeto foi planejado (TDR), contratado, executado e entregou produto — sem tomar glosa na auditoria e sem violar LGPD."

**Por que compram:** o custo de uma glosa, de um apontamento de auditoria do financiador ou de um vazamento de dado pessoal é ordens de grandeza maior que a assinatura. A DIMA é seguro, não conveniência.

### 2.2 Concorrência

| Categoria | Exemplos | Por que a DIMA ganha no nicho |
|---|---|---|
| Gestão de projetos genérica | Monday, Asana, ClickUp | Não conhecem TDR, prestação de contas UNESCO, glosa, BRL/USD, LGPD de beneficiário |
| ERP/gestão pública | TOTVS, sistemas de prefeitura | Pesados, caros, não focados em financiamento internacional nem em IA de auditoria |
| Planilhas + Drive (status quo real) | Excel, SharePoint | É o concorrente real. A DIMA vence por auditabilidade e redução de trabalho manual |
| Ferramentas de M&E / grants (global) | Ferramentas de doadores internacionais | Fracas em execução financeira/contratual e em português; pouca presença LATAM |

**Vantagem defensável:** profundidade de domínio + IA de auditoria + conformidade LGPD nativa, em PT/ES. O fosso não é a tecnologia; é o conhecimento do fluxo embutido no produto.

### 2.3 Dimensionamento de mercado (TAM/SAM/SOM)

> Estimativas top-down/bottom-up com fontes públicas aproximadas; **a validar** com pesquisa de campo na Fase 0. Tratadas como faixas, não como precisão falsa.

- **TAM (LATAM):** organizações executando projetos com financiamento internacional na América Latina. Ordem de grandeza: dezenas de milhares de unidades executoras ativas (agências ONU, bancos multilaterais, fundos climáticos, cooperação bilateral). A um ACV médio de ~R$ 46k, o TAM teórico está na casa de **R$ 1–3 bilhões/ano**.
- **SAM (Brasil + núcleos LATAM em PT/ES, ano 1–3):** subconjunto acessível por idioma, rede e fit de produto — ordem de **milhares** de organizações. A ~R$ 46k de ACV → **R$ 150–400M/ano**.
- **SOM (3 anos, realista):** 100–150 organizações pagantes → **R$ 5–9M de ARR**. É o alvo do plano financeiro (Seção 8).

O ponto não é o tamanho absoluto (nicho), é a **combinação de ticket alto, baixa concorrência e altíssima retenção** — o perfil de um SaaS vertical financiável.

---

## 3. Estratégia de Produto

### 3.1 Do "projeto" ao "produto"

Hoje o produto é **o** projeto da SEMA. No SaaS, o conceito central passa a ser:

```
Organização (tenant / cliente pagante)
  └── Projeto(s)  (218BRA2001, e outros)
        └── Atividades → TDRs → Contratos → Execução → Produtos → Prestação
```

Isso já quase existe: `configuracoes_sistema.projeto_id` e `atividades` sugerem a hierarquia. O que falta é a camada **Organização** acima de tudo e o `org_id` em cada linha.

### 3.2 Empacotamento por valor (feature tiers)

| Recurso | Starter | Growth | Enterprise |
|---|---|---|---|
| Projetos ativos | 1 | até 5 | ilimitado |
| Usuários | até 10 | até 30 | ilimitado |
| TDR/Contratos/Financeiro/Acervo | ✅ | ✅ | ✅ |
| IA — análise/correção de TDR | ✅ | ✅ | ✅ |
| **IA — Auditoria automática (6 domínios)** | — | ✅ | ✅ |
| Portal público de prestação de contas | ✅ | ✅ | ✅ + domínio próprio |
| White-label (logo/cor/subdomínio) | logo/cor | + subdomínio | + domínio próprio |
| SSO (SAML/OIDC) | — | — | ✅ |
| Isolamento dedicado (schema/projeto) | — | opcional | ✅ |
| SLA + suporte prioritário | — | e-mail | SLA contratual |
| Trilha de auditoria/DPA | ✅ | ✅ | ✅ + relatórios de conformidade |

A **IA de auditoria** é a alavanca de upsell do Starter→Growth: é o recurso que mais reduz trabalho e mais previne glosa.

### 3.3 "Templates de financiador" — o fosso de longo prazo

O ativo de conhecimento (fluxo UNESCO) vira **templates plugáveis** por financiador: UNESCO, PNUD, BID, Banco Mundial, Fundo Amazônia. Cada template pré-configura status de TDR, campos de prestação, regras de auditoria e formatos de relatório. Isso:
- reduz o tempo de onboarding de meses para dias;
- cria efeito de rede de conteúdo (cada novo template amplia o SAM);
- é a base de um futuro **marketplace** e de motor de product-led growth.

---

## 4. Estratégia de Multi-tenancy (a decisão arquitetural central)

### 4.1 As três opções clássicas

| Modelo | Isolamento | Custo/complexidade | Adequação à DIMA |
|---|---|---|---|
| **Pooled** — 1 banco, 1 schema, `org_id` + RLS | Lógico (RLS) | Baixo custo, alta densidade | ✅ Padrão recomendado |
| **Bridge** — 1 banco, 1 schema por tenant | Médio | Médio | Para clientes gov que exigem separação |
| **Siloed** — 1 banco/projeto por tenant | Físico | Alto custo/ops | Enterprise/residência de dados |

### 4.2 Recomendação: **Pooled por padrão, com ponte para Siloed sob demanda**

- **Padrão (Starter/Growth):** pooled com `org_id` + RLS. É o que a stack Supabase/Postgres faz melhor e o que sustenta a margem de ~82%.
- **Enterprise/Gov que exigem isolamento ou residência de dados:** provisionar **projeto Supabase dedicado** com o mesmo código (single-tenant deployado por cliente). Preço reflete o custo.

Esse padrão ("pooled com escada para siloed") é o consenso de SaaS vertical e evita over-engineering no início.

### 4.3 Por que **não** começar siloed (um Supabase por cliente)

Tentador porque o código já é single-tenant (custo de engenharia inicial menor). Mas:
- custo de infra e operação cresce linearmente com clientes (mata a margem e o pitch de VC);
- 50+ projetos Supabase para migrar, versionar migrações e monitorar é inviável operacionalmente;
- billing, métricas agregadas e admin cross-tenant ficam muito mais difíceis.

Siloed fica reservado como **opção premium**, não como base.

---

## 5. Plano Técnico de Multi-tenancy (Pooled + RLS)

> Esta é a parte de maior risco. A regra de ouro: **default-deny e nenhuma linha sem `org_id`.**

### 5.1 Modelo de dados

1. Criar tabela `organizacoes` (tenant): `id`, `nome`, `slug` (subdomínio), `plano`, `status`, `cor_primaria`, branding, `criado_em`.
2. Adicionar `org_id uuid NOT NULL REFERENCES organizacoes(id)` em **todas** as tabelas de domínio (contratos, tdrs, atividades, execucao_financeira, fornecedores, contratos_produtos, viagem_protocolos, beneficiarios, usuarios, auditoria_*, contrato_encerramentos, matriz_itens, etc.).
3. `usuarios` ganha `org_id` (um usuário pertence a uma organização; membros de múltiplas orgs, se necessário, viram tabela `usuario_organizacoes`).
4. `configuracoes_sistema` passa a ser **por org** (já tem `projeto_id`; adicionar `org_id` e remover o `UNIQUE(projeto_id)` global).

### 5.2 Contexto de tenant (como o RLS sabe quem é o tenant)

Duas abordagens combináveis:
- **Claim no JWT:** gravar `org_id` como custom claim no token de auth (via hook de auth do Supabase). RLS lê `auth.jwt() ->> 'org_id'`.
- **Função de resolução:** `fn_current_org()` que resolve `org_id` a partir de `usuarios WHERE id = auth.uid()`. Mais simples de implementar primeiro; o claim no JWT é otimização posterior (evita subquery em cada policy).

### 5.3 Refatoração das políticas RLS (o trabalho fino)

Toda policy atual do tipo:
```sql
USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN (...)))
```
passa a **também** exigir o tenant:
```sql
USING (
  org_id = fn_current_org()
  AND EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN (...))
)
```

**Eliminar todos os `USING (true)`** (já mapeados no CLAUDE.md como footgun):
- `configuracoes_sistema.config_leitura_publica USING (true)` → resolver branding por `slug`/subdomínio via função `fn_publico_branding(slug)` `SECURITY DEFINER`, devolvendo só o branding daquele tenant.
- `usuarios_select USING (true)` → escopar por `org_id = fn_current_org()`.
- `viagem_viajantes` / `viaj_sel (auth.uid() is not null)` → escopar por tenant.

> ⚠️ Lembrete do CLAUDE.md: policies permissivas somam-se por **OR** — uma única `USING (true)` esquecida **anula** o isolamento de tenant inteiro. Auditar `pg_policies WHERE qual = 'true'` deve ser um teste de CI que **quebra o build**.

### 5.4 Edge Functions (o buraco mais fácil de esquecer)

As 14 functions usam `service_role`, que **ignora RLS**. Cada uma precisa:
- receber/derivar o `org_id` do usuário autenticado (do JWT, nunca do corpo da requisição — corpo é forjável);
- filtrar **explicitamente** por `org_id` em toda query;
- na auditoria IA, restringir o escopo de dados enviados à Anthropic ao tenant (além da redação de CPF já existente).

Padrão a criar: um helper `resolverOrg(req)` que valida o JWT e devolve o `org_id`, obrigatório no topo de toda function. Sem ele, a function não deve nem abrir conexão.

### 5.5 Storage (isolamento de arquivos)

- Prefixar todo path por `org_id`: `contratos-docs/{org_id}/{...}`.
- Policies de Storage por tenant (o Supabase Storage suporta RLS via `storage.objects`).
- Geração de URL assinada (`urlAssinada`, `abrirDoc`) valida que o path pertence ao tenant do usuário.
- Buckets públicos (`plataforma-assets`, `avatares`, `pontos-mapa`) também prefixados por org para o white-label e o portal público não misturarem clientes.

### 5.6 Portal público multi-tenant

`prestacao-publica`, `publico.html`, `mapa.html` hoje leem 3 tabelas globais via `anon`. No SaaS:
- resolver o tenant pelo **subdomínio** (`cliente.dima.app`) ou path (`/o/{slug}`);
- funções `fn_publico_*` `SECURITY DEFINER` recebem o `slug` e devolvem **apenas** dados daquele tenant;
- **nunca** conceder novos `GRANT` ao `anon` (regra do CLAUDE.md mantida).

### 5.7 Backoffice / Admin cross-tenant

Novo painel interno (não exposto a clientes) para: criar/suspender organizações, ver métricas de uso, gerenciar planos e impersonar (com trilha) para suporte. Roda com role privilegiado e trilha de auditoria própria.

### 5.8 Garantia de isolamento (não-negociável)

- **Suite de testes de tenancy** que cria 2 orgs, popula dados e afirma que a org A **nunca** enxerga nada da org B — em cada tabela, cada Edge Function e cada bucket. Roda em CI e bloqueia deploy.
- **Lint de RLS:** falha se qualquer tabela de domínio não tiver RLS ativo, não tiver `org_id`, ou tiver policy `USING (true)`.
- Revisão de segurança externa antes do primeiro cliente pago multi-tenant.

---

## 6. Plataforma, DevOps e Escala

| Item | Hoje | Alvo SaaS |
|---|---|---|
| Hospedagem frontend | GitHub Pages | Vercel/Cloudflare com previews + rollback; subdomínios wildcard para white-label |
| Ambientes | só `main` | dev → staging → prod, com branch de Supabase por ambiente |
| CI/CD | deploy manual na `main` | pipeline: testes de tenancy + RLS lint + migrações versionadas + deploy |
| Migrações | mistas (arquivos soltos na raiz + `supabase/migrations`) | consolidar em `supabase/migrations` versionado; proibir SQL manual em prod |
| Observabilidade | mínima | request-id, logs estruturados, health checks, métricas por tenant (skill `devops-observability` do repo ajuda) |
| Backups/DR | padrão Supabase | PITR, RTO/RPO definidos, teste de restauração periódico |
| Segredos | anon key no `config.js` (OK p/ anon) | manter anon; `service_role` só em Edge Functions; rotação documentada |

---

## 7. Conformidade, Privacidade e Confiança (habilitador de receita B2G)

O rigor LGPD atual é vantagem competitiva — agora precisa escalar para **múltiplos controladores**.

1. **Modelo de controladoria:** cada organização-cliente é **controladora** dos seus dados; a DIMA (empresa) é **operadora**. Isso inverte a base atual (onde a SEMA é controladora). Requer:
   - **DPA (Data Processing Agreement)** padrão anexo ao contrato de assinatura;
   - **ROPA, RIPD** e designação de **Encarregado (DPO)** — hoje listados como pendências no CLAUDE.md;
   - Política de Privacidade e Termos de Uso do SaaS.
2. **Transferência internacional (art. 33):** formalizar com Supabase/Anthropic/Vercel (cláusulas-padrão), já apontado como pendência.
3. **Isolamento como garantia contratual:** o resultado da Seção 5.8 vira cláusula de SLA de segurança.
4. **Trilha de auditoria por tenant:** a `audit_log` imutável já existente passa a ser escopada e exportável por cliente (argumento de venda direto).
5. **Trilha de conformidade (Fase 3):** iniciar caminho SOC 2 Type II / ISO 27001. Não é bloqueador do primeiro cliente, mas é pré-requisito para clientes enterprise/ONU e para due diligence de Série A.
6. **Residência de dados:** para clientes que exigem, usar o modelo siloed (projeto Supabase em região específica).

---

## 8. Modelo Financeiro

> Todas as premissas são **explícitas e ajustáveis**. Câmbio de referência: USD 1 ≈ R$ 5,40. Números arredondados; a planilha detalhada deve ser construída na Fase 0 a partir destas premissas.

### 8.1 Premissas de preço (planos)

| Plano | Preço/mês | ACV (anual) |
|---|---|---|
| Starter | R$ 1.900 | R$ 22.800 |
| Growth | R$ 5.900 | R$ 70.800 |
| Enterprise | R$ 18.000 + setup | R$ 216.000+ |

**ARPA blended ano 1:** ~R$ 3.800/mês → **ACV ~R$ 45.600** (≈ USD 8,4k). Sobe para ~R$ 5.200/mês no ano 3 via upsell (Starter→Growth, add-ons de IA, projetos extras).

### 8.2 Estrutura de custo por tenant (COGS)

| Item | Custo/mês por tenant (estimado) |
|---|---|
| Supabase (compute/storage/banda, rateado) | R$ 90–200 |
| Anthropic API (auditoria IA + análise TDR) | R$ 80–250 (varia com uso) |
| Vercel/CDN/e-mail transacional | R$ 20–50 |
| Suporte/CS (rateado) | R$ 150–300 |
| **COGS total blended** | **~R$ 350–700/mês** |

Com ARPA de R$ 3.800 e COGS blended ~R$ 500 → **margem bruta ~82%**. (A IA é o item de COGS a monitorar; cabe cache de prompt e cotas por plano.)

### 8.3 Unit economics

| Métrica | Valor | Cálculo |
|---|---|---|
| ACV | R$ 45.600 | premissa |
| Margem bruta | 82% | (ARPA − COGS)/ARPA |
| Lucro bruto/cliente/ano | ~R$ 37.400 | 45.600 × 0,82 |
| CAC blended | R$ 22.000 | venda consultiva B2G (fundador + 1 vendedor no início) |
| **Payback de CAC** | **~7 meses** | 22.000 ÷ (37.400/12) |
| Churn lógico (anual) | 8% | B2G é pegajoso; alto custo de troca |
| NRR | 110–120% | upsell de IA/projetos compensa churn |
| Vida média | ~5 anos (conservador) | teto aplicado sobre 1/churn |
| **LTV** | **~R$ 187.000** | 37.400 × 5 |
| **LTV/CAC** | **~8,5x** | saudável para B2G (alvo ≥ 3x) |

### 8.4 Projeção de receita (cenário base, 3 anos)

| Ano | Clientes (fim do ano) | ARPA/mês | MRR saída | **ARR saída** |
|---|---|---|---|---|
| 1 | 12 | R$ 3.800 | R$ 46k | **~R$ 550k** |
| 2 | 45 | R$ 4.400 | R$ 198k | **~R$ 2,4M** |
| 3 | 120 | R$ 5.200 | R$ 624k | **~R$ 7,5M** |

Premissas: ciclo de venda B2G de 3–9 meses; ano 1 é caça a **pilotos e casos de referência** (a SEMA vira cliente-âncora/estudo de caso); aceleração real no ano 2 com playbook e templates de financiador.

**Cenários:**
- **Conservador:** ~60 clientes no ano 3 → ARR ~R$ 3,7M.
- **Base:** ~120 clientes → ARR ~R$ 7,5M.
- **Agressivo:** ~180 clientes + 3–4 contas enterprise → ARR ~R$ 13M+.

### 8.5 Custos operacionais e burn (cenário base)

| Rubrica | Ano 1 | Ano 2 |
|---|---|---|
| Engenharia (2–3 devs) | R$ 900k–1,3M | R$ 1,6M |
| Produto/Design (fracionado→pleno) | R$ 150k | R$ 300k |
| Vendas (1→2) | R$ 250k | R$ 600k |
| CS/Suporte (1) | R$ 150k | R$ 350k |
| Marketing/eventos B2G | R$ 150k | R$ 400k |
| Infra + ferramentas + jurídico/compliance | R$ 200k | R$ 350k |
| **Total (burn anual)** | **~R$ 1,8–2,4M** | **~R$ 3,6M** |

**Custo específico da transformação SaaS (Fases 0–2, engenharia):** estimado em **R$ 400k–700k** (4–6 meses, 2–3 engenheiros), já contido na rubrica de engenharia do ano 1.

### 8.6 Necessidade de capital e uso dos recursos

- **Rodada seed sugerida: R$ 6–9M (≈ USD 1,2–1,7M)** para **18–24 meses** de pista, mirando ~R$ 2,5–3M de ARR (prontidão para Série A).
- **Uso dos recursos:** ~45% engenharia (multi-tenancy + plataforma + templates), ~25% go-to-market (vendas + CS + marketing), ~15% compliance/SOC2/jurídico, ~15% G&A e contingência.
- **Marcos de captação:** seed agora (com a SEMA como âncora + 2–3 pilotos pagos assinados); Série A ao cruzar ~R$ 3M ARR com NRR > 110% e CAC payback < 12 meses.

---

## 9. Go-to-Market

1. **Land com âncora + pilotos.** SEMA/AC como cliente de referência e estudo de caso público. Buscar 2–3 pilotos pagos (uma fundação de apoio, uma ONG de fundo climático, um escritório de agência ONU).
2. **Venda consultiva (founder-led → time).** O comprador é institucional; a venda é por confiança, prova de conformidade e ROI de auditoria. Materiais: cálculo de "custo evitado de glosa" e demo com dados do próprio cliente.
3. **Canais:** parcerias com agências da ONU/bancos multilaterais (indicam a rede de implementadores), fundações de apoio universitárias, associações de OSCs, eventos de cooperação internacional.
4. **Conteúdo/autoridade:** guias de prestação de contas por financiador (UNESCO, PNUD, BID) — atrai o ICP e alimenta os templates.
5. **Expansão LATAM (ano 2):** replicar com localização ES, começando por países com forte presença de cooperação (Colômbia, Peru, México).
6. **Product-led no fim:** trials self-service do Starter para ONGs menores, alimentados pelos templates de financiador.

---

## 10. Roadmap por Fases

| Fase | Foco | Duração estimada | Entregável de saída |
|---|---|---|---|
| **0 — Fundação** | Decisões (Seção 12), contas/ambientes, mover hosting, CI/CD, observabilidade, planilha financeira detalhada, pesquisa de mercado | 2–4 semanas | Ambientes dev/staging/prod + decisões fechadas |
| **1 — Multi-tenancy core** | `organizacoes`, `org_id` em tudo, refatorar RLS, escopar Edge Functions, isolar Storage, suite de testes de tenancy | 8–12 semanas | Isolamento provado por testes + revisão de segurança |
| **2 — Comercialização** | Billing (Stripe), planos + feature flags, onboarding (assistido + self-serve), white-label por subdomínio, backoffice admin | 6–10 semanas | Um cliente novo entra e paga sem intervenção manual |
| **3 — Confiança & Escala** | DPA/ROPA/RIPD/DPO, trilha SOC2/ISO, SSO, SLA, DR, i18n ES completo | contínuo (início no fim da Fase 2) | Enterprise-ready |
| **4 — Fosso & PLG** | Templates de financiador, marketplace, trials self-service, motor de PLG | ano 2 | Expansão LATAM e redução de CAC |

**Caminho crítico:** Fase 1 é o gargalo e o maior risco. Nada de comercialização (Fase 2) antes de a suite de isolamento estar verde e revisada externamente.

---

## 11. Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| **Vazamento entre tenants** (RLS/service_role) | Média | Catastrófico | Default-deny, testes de isolamento em CI, RLS lint, revisão de segurança externa antes do 1º cliente pago |
| Ciclo de venda B2G longo demais p/ pista | Alta | Alto | Pilotos pagos cedo, âncora SEMA, foco em "custo evitado", pista de 18–24 meses |
| Custo de IA (Anthropic) corrói margem | Média | Médio | Cotas por plano, cache de prompt, IA de auditoria só do Growth pra cima |
| Dependência de fornecedor único (Supabase) | Baixa | Alto | Postgres é portável; abstrair acesso a dados; siloed já prevê projetos separados |
| Concorrente genérico (Monday) desce ao nicho | Baixa | Médio | Fosso é conhecimento de domínio + templates + LGPD; acelerar templates |
| Migração/qualidade de dados do tenant legado (SEMA) | Média | Médio | Migração scriptada da instância atual para `org_id` com validação |
| Complexidade regulatória multi-país (LATAM) | Média | Médio | Começar Brasil; siloed p/ residência; entrar LATAM com jurídico local |
| Sobrecarga do time enxuto na Fase 1 | Média | Alto | Escopo rígido, não iniciar Fase 2 antes da 1; contratar 1 eng sênior de plataforma |

---

## 12. Decisões em Aberto (fechar na Fase 0, antes de qualquer código)

1. **Entidade jurídica e cap table** para a rodada seed — quem são os sócios, como a IP atual (desenvolvida no contexto do projeto SEMA) é licenciada/transferida para a empresa SaaS. **(Bloqueador jurídico crítico — a titularidade do código feito para o projeto público precisa ser resolvida.)**
2. **Relação com a SEMA/AC:** cliente-âncora? sócia? licenciadora? Definir antes de captar.
3. **Modelo de tenancy confirmado:** pooled+RLS como padrão (recomendado) — validar apetite de risco.
4. **Faixas de preço reais:** validar disposição a pagar com 5–10 entrevistas do ICP.
5. **Marca/domínio do SaaS** (a "DIMA" continua? nome próprio?).
6. **Provedor de billing** (Stripe vs. gateway nacional para NF/boleto B2G).
7. **Escopo do MVP multi-tenant:** todos os módulos ou subconjunto no lançamento?
8. **Meta da rodada e investidores-alvo** (anjo/seed/venture LATAM/impacto).

---

## 13. Próximos Passos Imediatos (as próximas 2 semanas)

1. Resolver a **titularidade da IP** (item 12.1) — sem isso, nada avança.
2. Rodar **5–10 entrevistas de descoberta** com o ICP para validar preço e dor.
3. Construir a **planilha financeira detalhada** a partir das premissas da Seção 8 (cenários conservador/base/agressivo).
4. Fazer um **spike técnico** de multi-tenancy: adicionar `org_id` + RLS + testes de isolamento em **um** módulo (ex.: contratos) para calibrar o esforço real da Fase 1.
5. Fechar as **decisões da Seção 12** e só então iniciar a Fase 1.

---

> **Princípio-guia deste plano:** o ativo da DIMA é o conhecimento de domínio, não o código. A transformação em SaaS é, antes de tudo, um exercício de **isolamento de tenant sem vazamento** e de **empacotar conhecimento em templates**. Faça a Fase 1 com paranoia de segurança; faça o resto com foco em provar o modelo com poucos clientes de alto valor antes de escalar.
