# Estratégia de Cópia e Bootstrap do SaaS
### Como derivar um produto SaaS a partir da DIMA sem tocar na instância da SEMA/AC

> Documento complementar ao `PLANO-SAAS.md`. Enquanto aquele descreve **o que** o SaaS é e **quanto** custa/rende, este descreve **como criar a cópia** e **tudo o que ela precisa para rodar sem problemas**.
> **Ainda em fase de planejamento — nenhuma ação de criação (repo, Supabase, domínio) deve ser executada antes do aval da Seção 9.**
> Versão 1.0 · Setembro/2026

---

## 1. A decisão: "cópia primeiro", não "transformação in-place"

**Não** transformamos o repositório atual (`dima-plataforma`) em SaaS. Em vez disso:

- A **DIMA da SEMA/AC continua rodando intacta** — mesmo repo, mesmo Supabase (`wfymnmlinonvdqfucjya`), mesmos dados, sem risco.
- Criamos uma **cópia limpa** que se torna o **produto SaaS** — repositório novo, Supabase novo, sem dados nem marca da SEMA.
- Todo o trabalho de multi-tenancy (Seção 5 do `PLANO-SAAS.md`) acontece **na cópia**.

**Por que é a decisão certa:**

| Vantagem | Efeito |
|---|---|
| Zero risco para produção | A operação real da SEMA não é cobaia da refatoração de multi-tenancy |
| Separação de IP | A cópia limpa é o veículo da empresa; o código do projeto público não se mistura com o produto comercial (ver Seção 8) |
| Liberdade de arquitetura | Podemos consolidar migrações, mudar hosting e reescrever RLS sem medo de quebrar a SEMA |
| Estado inicial limpo | O SaaS nasce sem marca/dados de um cliente específico embutidos |

---

## 2. Relação entre o original e a cópia (modelos e recomendação)

| Modelo | Descrição | Veredito |
|---|---|---|
| **Fork-and-diverge** | Copia uma vez; SaaS evolui sozinho; SEMA fica no código antigo para sempre | Ponto de partida |
| **Copiar e convergir** (recomendado) | Copia agora; mais tarde a **SEMA vira o tenant #1 do SaaS** e o repo antigo é congelado | ✅ Estado-alvo |
| Core compartilhado (monorepo/pacote) | Extrair código comum que os dois consomem | ❌ Over-engineering agora |

**Recomendação:** copiar-e-divergir **agora**, com o objetivo declarado de **convergir depois** — quando o SaaS estiver maduro e o isolamento de tenant provado, a SEMA migra para dentro dele como cliente-âncora (alinhado ao GTM do `PLANO-SAAS.md`) e o `dima-plataforma` original é **congelado** (arquivado, somente leitura). Assim não se mantém dois códigos vivos para sempre.

**Governança da divergência (janela intermediária):** enquanto os dois coexistem, correções críticas de segurança/LGPD feitas no original são levadas à cópia por **cherry-pick manual documentado** (e vice-versa). Manter um `DIVERGENCIA.md` na cópia listando o que já foi/não foi portado. Essa janela deve ser curta — quanto antes a SEMA migrar, melhor.

---

## 3. Estratégia de Repositório

**Ações:**

1. **Criar repositório novo** (nome do produto a definir — decisão 12.5 do plano; placeholder: `dima-saas`). **Não** é fork do GitHub (fork carrega vínculo e ruído); é uma **cópia com história preservada**:
   - `git clone` do original → novo remote → push. Preserva a história (útil para cherry-picks), mas o repo é independente.
   - Alternativa "limpar história": começar do zero (`git init`) se houver preocupação de que a história carregue segredos/dados sensíveis. **Verificar antes** se há segredos commitados na história (`git log -p` / secret scanning) — a anon key está no `config.js` (é pública, ok), mas confirmar que nenhum `service_role` ou `ANTHROPIC_API_KEY` foi commitado alguma vez.
2. **Estrutura-alvo do monorepo do SaaS** (evolui a partir da atual):
   ```
   /apps
     /web            → frontend do cliente (o que hoje é pages/ + js/)
     /admin          → backoffice cross-tenant (novo — Seção 5.7 do plano)
     /public-portal  → prestação de contas pública multi-tenant
   /supabase
     /migrations     → TODAS as migrações consolidadas e versionadas
     /functions      → as 14 Edge Functions (com escopo de org)
   /packages
     /shared         → helpers comuns (config, layout, signer, i18n)
   /docs             → estes planos
   ```
   > A migração para essa estrutura pode ser **incremental**; não é pré-requisito do dia 1. O dia 1 é "a cópia sobe e roda".
3. **Branch protection + CI** no repo novo desde o início (o original faz deploy direto na `main`; o SaaS **não pode**). PRs obrigatórios, checks de RLS-lint e testes de isolamento bloqueiam merge (Seção 5.8 do plano).

---

## 4. Estratégia de Supabase (banco/auth/storage novos)

O maior risco operacional: **não usar o projeto Supabase da SEMA** (`wfymnmlinonvdqfucjya`) para nada do SaaS.

**Ações:**

1. **Criar organização + projetos Supabase novos** para o SaaS: `dima-saas-dev`, `dima-saas-staging`, `dima-saas-prod`. Região: Brasil/São Paulo (latência + argumento de residência de dados).
2. **Consolidar as migrações** (hoje espalhadas — este é um passo crítico de higiene):
   - Raiz: `02_criar_admin.sql` … `11_produto_notif_log.sql` + `fn_criar_usuario.sql` (11 arquivos soltos).
   - `supabase/migrations/`: 13 migrações datadas (prestação, auditoria, LGPD c0–c2, acervo).
   - **Reconstruir o schema completo** numa sequência única e versionada em `/supabase/migrations`, aplicável do zero num projeto limpo. Validar que `supabase db reset` sobe tudo sem erro.
3. **Recriar Storage buckets** no projeto novo com as mesmas configurações de visibilidade (privados: `tdrs-arquivos`, `contratos-docs`, `financeiro-docs`, `entregas-docs`, `viagens-arquivos`, `produtos-evidencias`, `acervo-capas`; públicos: `plataforma-assets`, `pontos-mapa`, `avatares`). No SaaS, todos passam a ter **prefixo por `org_id`** (Seção 5.5 do plano).
4. **Reconfigurar secrets**: `ANTHROPIC_API_KEY` novo (chave própria da empresa, **não** a do projeto SEMA), variáveis das Edge Functions.
5. **Dados: começar VAZIO.** O SaaS não importa dados da SEMA. A SEMA só entra depois, como tenant, via script de migração próprio (Seção 7).
6. **Redeploy das 14 Edge Functions** no projeto novo (elas serão modificadas para escopo de org na Fase 1 do plano; no bootstrap, sobem como estão só para o ambiente existir).

---

## 5. Desacoplar o que é específico da SEMA (limpeza da cópia)

A cópia carrega marca e configuração de um cliente. Precisa nascer **neutra**.

**Ações:**

1. **`js/config.js`** — hoje tem `SUPABASE_URL` e anon key da SEMA hard-coded. Apontar para o projeto SaaS. A médio prazo, resolver por ambiente (dev/staging/prod) e por subdomínio de tenant.
2. **`configuracoes_sistema`** — o seed atual grava nome/código/cor/logos da SEMA. Na cópia, **não** semear branding de cliente; o branding passa a ser **por tenant**, criado no onboarding.
3. **`assets/`** — contém material do cliente que **não** deve vir na cópia: `brasao-acre.png`, `logo-sema-hd.png`, `sema-branco.png`, `logo-fundo-brasil-onu.png`, `logo-resiliencia.png`, `logo-consorcio-amazonia.png`, `governo-acre-hd.png`, `UNCT_Logo…Brazil`, `UNESCO_logo…`, e as fotos `foto1..10`. **Remover** e substituir por placeholders neutros/marca do SaaS. Manter genéricos reutilizáveis (ex.: ícones `sdg/`, `template-relatorio-missao.docx`).
4. **`data/`** — auditar e remover qualquer dado real da SEMA (ex.: dados do CAR, geometrias) que esteja versionado.
5. **Textos/labels** — remover menções fixas a "UNESCO/SEMA/218BRA2001" do `index.html`, `publico.html` e afins; virar conteúdo por tenant.
6. **`CLAUDE.md`** — na cópia, evoluir para refletir o schema multi-tenant (com `org_id`), sem perder as armadilhas conhecidas.

> Checklist de saída desta seção: um `grep` por `sema|acre|unesco|218BRA|wfymnmlinonvdqfucjya` na cópia não retorna nada hard-coded de produção.

---

## 6. O que a cópia precisa GANHAR para ser SaaS

Isto **não** se repete aqui — é exatamente o `PLANO-SAAS.md`, agora aplicado à cópia:

- **Seção 5** (Multi-tenancy técnica): `organizacoes`, `org_id` em tudo, refatorar RLS, escopar Edge Functions, isolar Storage, portal público por tenant, backoffice admin, suite de testes de isolamento.
- **Seção 6** (Plataforma/DevOps): hosting (Vercel/Cloudflare + wildcard subdomínio), CI/CD, observabilidade, backups/DR.
- **Seção 7** (Conformidade): DPA/ROPA/RIPD/DPO, modelo controlador↔operador, trilha SOC2/ISO.
- **Seção 3.2/3.3** (Produto): planos, feature flags, templates de financiador.
- **Seção 2 (Comercialização)** do roadmap: billing (Stripe), onboarding self-serve.

A ordem é a do roadmap por fases (Seção 10 do plano), com uma **Fase 0.5 nova** inserida antes da Fase 1: **"Bootstrap da cópia"** (Seção 7 abaixo).

---

## 7. Checklist Mestre — Fase 0.5: Bootstrap da Cópia

> Sequência para "a cópia sobe e roda idêntica ao original, mas limpa e num ambiente próprio". É o pré-requisito da Fase 1 (multi-tenancy).

**A. Fundações (antes de tocar em qualquer coisa)**
- [ ] Definir nome do produto e domínio (decisão 12.5 do plano).
- [ ] Resolver titularidade de IP (decisão 12.1 — **bloqueador jurídico**, ver Seção 8).
- [ ] Verificar história do repo em busca de segredos commitados; decidir clone-com-história vs. história limpa.

**B. Repositório**
- [ ] Criar repo novo (privado) + branch protection + CI vazio.
- [ ] Copiar código do original para o repo novo.
- [ ] Remover assets/dados/labels específicos da SEMA (Seção 5).
- [ ] `DIVERGENCIA.md` para rastrear cherry-picks entre original e cópia.

**C. Supabase**
- [ ] Criar org + projetos `dev`/`staging`/`prod` (região BR).
- [ ] Consolidar as 24 migrações numa sequência única versionada.
- [ ] `supabase db reset` sobe o schema do zero sem erro (validação).
- [ ] Recriar buckets de Storage (visibilidades corretas).
- [ ] Configurar secrets (Anthropic próprio, vars das functions).
- [ ] Deploy das 14 Edge Functions no projeto novo.

**D. Frontend/Hosting**
- [ ] `config.js` aponta para o Supabase do SaaS (por ambiente).
- [ ] Publicar em Vercel/Cloudflare (staging), não GitHub Pages.
- [ ] Fumaça: login, dashboard, criar TDR/contrato, upload/visualização de arquivo, auditoria IA — tudo funciona com banco vazio + 1 usuário admin de teste.

**E. Portão de saída da Fase 0.5**
- [ ] A cópia roda, limpa, em ambiente próprio, sem nenhuma dependência do projeto SEMA.
- [ ] Nenhum dado/segredo/marca de produção presente.
- [ ] CI verde. Só então inicia a **Fase 1 (multi-tenancy)**.

---

## 8. Implicação Legal / IP (reforço)

A abordagem cópia **melhora** a posição de IP, mas não a resolve sozinha:

- O código foi desenvolvido no contexto de um projeto público (SEMA / Fundo Brasil-ONU). **Antes** de a cópia virar produto comercial, é preciso estabelecer, por instrumento jurídico, que a empresa SaaS detém/licencia legitimamente essa base. Copiar o código para um repo privado **não** cria esse direito por si só.
- Recomendação: contrato/licença que trate (a) titularidade do código-base, (b) relação com a SEMA (cliente-âncora/licenciadora/sócia — decisão 12.2 do plano), (c) uso de material de marca de terceiros (UNESCO/ONU/Acre) — que **não** pode ser redistribuído no produto (por isso a limpeza da Seção 5).
- **Este é o bloqueador nº 1.** Nenhuma captação ou go-to-market avança sem ele.

---

## 9. O que eu executo quando você autorizar (e em que ordem)

Nada disto foi feito — é o que proponho executar **mediante seu ok**, em ordem, ainda sem escrever código de produto:

1. **(Reversível, seguro)** Consolidar/organizar as migrações num rascunho dentro deste repo, para revisão — sem aplicar em banco nenhum.
2. **(Requer seu ok — cria recursos externos)** Criar o repositório novo e copiar o código limpo.
3. **(Requer seu ok — cria recursos externos)** Criar os projetos Supabase do SaaS e subir o schema consolidado.
4. **(Requer seu ok)** Publicar o staging e rodar o teste de fumaça.
5. Só então, com a Fase 0.5 fechada, começar a **Fase 1 (multi-tenancy)** — aí sim, código.

> Itens 2–4 criam contas/recursos externos e são difíceis de reverter; por isso confirmo com você antes de cada um, e um de cada vez.

---

## 10. Riscos específicos da abordagem "cópia"

| Risco | Mitigação |
|---|---|
| Segredo/dado de produção vazar na história do repo copiado | Secret scanning antes de copiar; se houver, começar com história limpa |
| Marca de terceiros (UNESCO/ONU/Acre) redistribuída no produto | Limpeza da Seção 5 é obrigatória antes de qualquer publicação |
| Dois códigos divergirem e correção de segurança ficar só num | `DIVERGENCIA.md` + janela de convergência curta (SEMA migra para o SaaS) |
| Migrações consolidadas não reproduzirem o schema real | Validar `db reset` contra um dump de schema (não de dados) do projeto atual |
| Esforço de manter SEMA + SaaS sobrecarregar o time | Congelar o original assim que a SEMA migrar; não adicionar features ao original |

---

> **Princípio-guia:** a cópia nasce **idêntica em função, limpa em conteúdo e isolada em infraestrutura**. Primeiro fazê-la rodar sozinha (Fase 0.5); só depois dar-lhe multi-tenancy (Fase 1). A SEMA nunca é cobaia — ela é, no fim, o primeiro cliente.
