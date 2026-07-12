# Plano de Execução — Site Público de Divulgação do Projeto 218BRA2001

**Projeto:** 218BRA2001 · Programa de Resiliência Socioambiental nas APAs Lago do Amapá e Igarapé São Francisco — SEMA/AC · Fundo Brasil-ONU / UNESCO
**Referência contratual:** TDR — Consultor Individual (PF) · R$ 99.000,00 · 4 meses / 120 dias (`docs/tdrs/TDR_Consultor_Individual_Site_Publico_DIMA.docx`)
**Data:** julho/2026

---

## 1. Diagnóstico do estado atual

### 1.1 O que já existe

A página pública atual é **um único arquivo** (`pages/publico.html`, ~1.470 linhas com CSS, HTML e JS embutidos) com 3 abas:

| Aba | Conteúdo | Fonte de dados |
|-----|----------|----------------|
| **Mapa de Entregas** | Leaflet + clusters, filtros por APA/tipo, camadas geográficas, fotos/vídeos por geometria, mini-mapa | `fn_publico_mapa`, `fn_publico_camadas`, `fn_publico_tipos_mapa`, `trilha_metadata`, `geometria_fotos` |
| **Painel Geral** | 4 KPIs (atividades, TDRs aprovados, produtos, indicadores) + 2 gráficos Chart.js (pipeline de fases, TDRs por status) | `fn_publico_operacional` (RPC) |
| **Matriz de Resultados** | Indicadores agrupados por resultado/produto, barras de progresso, chips ODS/KM | `fn_publico_resultados` (RPC) |

O acesso é feito com a **chave anon do Supabase** diretamente do navegador, via funções RPC `SECURITY DEFINER` que expõem apenas agregados — o modelo de segurança está correto e será mantido.

### 1.2 Lacunas identificadas

1. **Zero dados financeiros públicos** — a plataforma tem execução financeira completa (`execucao_financeira`, `contratos`) mas nada é publicizado (orçamento total, % executado, execução por resultado/atividade).
2. **Sem linha do tempo** — não há narrativa temporal do projeto (marcos, entregas por trimestre).
3. **Sem página institucional** — quem financia, quem executa, objetivos, ODS, documentos públicos.
4. **Sem galeria de produtos entregues** — produtos aprovados (`produtos_entregues` / `contratos_produtos`) não aparecem.
5. **Arquitetura monolítica** — um arquivo único de 1.470 linhas dificulta manutenção e evolução.
6. **Sem SEO/compartilhamento** — conteúdo 100% injetado via JS, sem metadados Open Graph, título genérico; invisível para buscadores e feio ao compartilhar link.
7. **Sem identidade própria** — a página é uma extensão visual do sistema interno, não um site de comunicação pública.
8. **Acessibilidade não auditada** — sem verificação WCAG, contraste, navegação por teclado ou leitores de tela.
9. **Monoidioma** — apenas PT, embora o público inclua UNESCO/doadores internacionais (a plataforma interna já suporta pt/en/es).

---

## 2. Visão da solução

Um **site público independente da plataforma interna**, com identidade visual própria alinhada às diretrizes UNESCO/SEMA, organizado como narrativa para 4 públicos: doadores (UNESCO/MPTF), gestão pública, sociedade civil e imprensa.

### 2.1 Mapa do site

```
/                       Home — hero com números-chave, destaque do mapa, últimos marcos
/mapa                   Mapa interativo de entregas (evolução do atual, tela cheia)
/resultados             Matriz de resultados + indicadores + ODS
/transparencia          Execução financeira agregada (orçamento, % executado,
                        execução por resultado, contratações por modalidade)
/linha-do-tempo         Marcos e entregas do projeto em ordem cronológica
/produtos               Galeria de produtos técnicos aprovados (com arquivos públicos)
/sobre                  O projeto, parceiros, governança, documentos, contato
```

### 2.2 Princípios de design

- **Mobile-first** — grande parte do público acessa por celular.
- **Dados como narrativa** — cada número acompanhado de contexto ("R$ X de R$ Y executados = Z% do orçamento"), não tabelas cruas.
- **Identidade visual própria** — paleta derivada do verde institucional (`#1F4E2C`) + azul UNESCO, tipografia moderna (manter DM Sans), componentes consistentes.
- **Acessibilidade WCAG 2.1 AA** — contraste mínimo 4.5:1, navegação por teclado, `aria-labels`, textos alternativos.
- **Performance** — meta Lighthouse ≥ 90 (Performance, A11y, SEO); lazy-loading do mapa e imagens.

---

## 3. Arquitetura técnica

### 3.1 Stack (mantém o padrão do projeto)

| Camada | Decisão | Justificativa |
|--------|---------|---------------|
| Frontend | HTML5 + CSS3 + JS puro, multi-página | Padrão já adotado no repositório (CLAUDE.md); zero build step; equipe consegue manter |
| Dados | Supabase anon key + RPCs `fn_publico_*` | Modelo de segurança já validado; expõe só agregados |
| Mapa | Leaflet 1.9 + markercluster + Turf | Já em uso, sem custo de licença |
| Gráficos | Chart.js 4 | Já em uso |
| Hospedagem | GitHub Pages (mesmo repositório, diretório `/site/`) ou Vercel | Ambos já usados pelo projeto; decisão no Produto 1 |
| SEO | Conteúdo estático pré-renderizado no HTML + dados dinâmicos por cima | Resolve indexação sem introduzir framework |

### 3.2 Estrutura de diretórios proposta

```
site/
├── index.html              # Home
├── mapa.html
├── resultados.html
├── transparencia.html
├── linha-do-tempo.html
├── produtos.html
├── sobre.html
├── css/
│   ├── tokens.css          # variáveis: cores, tipografia, espaçamento
│   ├── base.css            # reset + elementos
│   └── componentes.css     # cards, KPIs, badges, nav, footer
├── js/
│   ├── api.js              # cliente Supabase + wrappers das RPCs públicas
│   ├── componentes.js      # header/footer compartilhados, i18n
│   ├── home.js / mapa.js / resultados.js / ...
└── assets/                 # reaproveita ../assets/ (logos institucionais)
```

### 3.3 Novas funções RPC necessárias (migrações SQL)

Todas `SECURITY DEFINER`, `GRANT EXECUTE TO anon`, retornando **somente agregados** — nunca dados nominais de fornecedores, valores de contratos individuais ou dados pessoais:

| RPC nova | Retorna | Alimenta |
|----------|---------|----------|
| `fn_publico_financeiro` | orçamento total USD/BRL, executado (situacao='pago'), comprometido, % por resultado e por fase | `/transparencia` |
| `fn_publico_timeline` | eventos públicos: atividades concluídas (dt), produtos aprovados (dt), marcos manuais | `/linha-do-tempo` |
| `fn_publico_produtos` | produtos com status aprovado final + arquivo marcado como público | `/produtos` |
| `fn_publico_home` | resumo consolidado (1 chamada para a home: KPIs + últimos 5 eventos) | `/` |

> Regra de privacidade: valores financeiros só aparecem **agregados por resultado/atividade**, nunca por contrato ou fornecedor. Produtos só aparecem se houver flag explícita de publicação (nova coluna `publico boolean default false` em `produtos_entregues`), decidida pela coordenação.

---

## 4. Fases de execução (alinhadas aos 4 produtos do TDR)

### Fase 1 — Diagnóstico e Arquitetura de Informação (dias 1–30 · Produto 1 · R$ 20.000)

| Semana | Entregas |
|--------|----------|
| 1 | Inventário completo dos dados publicáveis (tabelas, RPCs existentes, o que falta); reunião de kick-off com coordenação para validar públicos-alvo e definir o que é publicável (especialmente financeiro) |
| 2 | Mapa do site + jornadas por público; definição da regra de privacidade de dados; especificação das 4 novas RPCs |
| 3 | Wireframes de baixa fidelidade das 7 páginas; decisão de hospedagem (GitHub Pages × Vercel) |
| 4 | Documento consolidado de diagnóstico + arquitetura de informação; aprovação formal da coordenação |

**Critério de aceite:** documento aprovado pela coordenação, com lista fechada de dados publicáveis assinada.

### Fase 2 — Design UI/UX e Protótipo (dias 31–60 · Produto 2 · R$ 22.000)

| Semana | Entregas |
|--------|----------|
| 5 | Identidade visual: paleta, tipografia, grid, biblioteca de componentes (design tokens) |
| 6 | Protótipo alta fidelidade: Home, Transparência, Resultados (as 3 páginas mais críticas) |
| 7 | Protótipo alta fidelidade: Mapa, Linha do tempo, Produtos, Sobre; versões mobile |
| 8 | Rodada de validação com coordenação; ajustes; protótipo navegável final aprovado |

**Critério de aceite:** protótipo navegável aprovado formalmente, com registro de ajustes; contraste validado (WCAG AA) já no design.

### Fase 3 — Desenvolvimento e Integração (dias 61–100 · Produto 3 · R$ 35.000)

| Semana | Entregas |
|--------|----------|
| 9 | Fundação: `tokens.css`, `base.css`, `componentes.js` (header/footer/nav), `api.js`; migrações SQL das novas RPCs aplicadas em homologação |
| 10 | Home + Sobre (conteúdo estático pré-renderizado + KPIs dinâmicos) |
| 11 | Transparência (financeiro agregado) + Resultados (evolução da matriz atual) |
| 12 | Mapa (porte do atual para a nova base, com melhorias de UX mobile) |
| 13 | Linha do tempo + Galeria de produtos; i18n PT/EN das páginas-chave (Home, Sobre, Transparência) |
| 14 | Integração completa, revisão de código, redirect da página antiga (`publico.html` → novo site) |

**Critério de aceite:** todas as páginas funcionais em ambiente de homologação, consumindo dados reais; nenhum dado sensível exposto (auditoria das respostas das RPCs).

### Fase 4 — Testes, Publicação e Capacitação (dias 101–120 · Produto 4 · R$ 22.000)

| Semana | Entregas |
|--------|----------|
| 15 | Testes funcionais e de responsividade (Chrome/Firefox/Safari, Android/iOS); auditoria WCAG 2.1 AA; correções |
| 16 | SEO técnico: metadados, Open Graph, sitemap.xml, robots.txt; Lighthouse ≥ 90; testes de carga das RPCs |
| 17 | Publicação em produção com domínio definido; monitoramento pós-lançamento |
| 17–18 | Documentação técnica (arquitetura, RPCs, como atualizar conteúdo) + sessão de capacitação da equipe SEMA/UNESCO; relatório final |

**Critério de aceite:** site publicado no domínio oficial; Lighthouse ≥ 90 nas 4 categorias; equipe capacitada; documentação entregue.

---

## 5. Riscos e mitigações

| Risco | Prob. | Impacto | Mitigação |
|-------|-------|---------|-----------|
| Coordenação demorar a definir o que é publicável (financeiro) | Alta | Atrasa Fases 1 e 3 | Levar proposta pronta de regra de privacidade na semana 1; decisão como critério de aceite do Produto 1 |
| Dados incompletos/inconsistentes no banco (ex.: produtos sem data, atividades sem geometria) | Média | Painéis com buracos | Diagnóstico da Fase 1 inclui auditoria de qualidade; RPCs com fallbacks; usar o módulo de Auditoria IA existente |
| Chave anon exposta permitir consultas indevidas | Baixa | Vazamento de dados | Manter RLS restritivo + RPCs como única superfície pública; revisar `get_advisors` do Supabase antes do go-live |
| Página antiga (`publico.html`) tem links já divulgados | Média | Links quebrados | Redirect permanente da URL antiga para o novo site |
| Dependência de CDNs externos (Leaflet, Chart.js) | Baixa | Site fora do ar se CDN cair | Vendorizar bibliotecas no repositório na Fase 3 |

---

## 6. Governança da execução

- **Reuniões quinzenais** de acompanhamento com a coordenação (30 min, remotas).
- **Aprovação formal por produto** — pagamento condicionado ao aceite (conforme TDR).
- **Repositório** — desenvolvimento no próprio repositório da plataforma, diretório `site/`, com commits incrementais; migrações SQL versionadas em `supabase/migrations/`.
- **Homologação antes de produção** — cada fase validada em URL de homologação antes do deploy final.

---

## 7. Resumo executivo

| | |
|---|---|
| **Prazo total** | 120 dias (4 meses) |
| **Valor** | R$ 99.000,00 em 4 parcelas (20k / 22k / 35k / 22k) |
| **Entregas** | 7 páginas públicas, 4 novas RPCs, identidade visual, i18n PT/EN parcial, documentação e capacitação |
| **Principal ganho** | Transparência financeira pública (inexistente hoje) + narrativa de resultados acessível a não especialistas |
| **Reuso** | Mapa, matriz e KPIs atuais são portados, não reescritos do zero; backend inalterado |
