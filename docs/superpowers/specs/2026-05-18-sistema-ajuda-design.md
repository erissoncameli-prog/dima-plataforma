# Sistema de Ajuda Multilíngue — DIMA Plataforma
**Data:** 2026-05-18  
**Status:** Aprovado para implementação

---

## 1. Contexto

A plataforma DIMA (Projeto 218BRA2001 · SEMA/AC · Fundo Brasil-ONU) possui 9 módulos principais acessíveis por diferentes perfis de usuário. Não existe hoje nenhum recurso de ajuda in-app. O objetivo é criar um sistema de documentação acessível diretamente na interface, sem dependência de sistemas externos.

---

## 2. Requisitos

- **Idiomas:** PT (padrão), EN, ES — mesmos suportados pelo `appState.idioma`
- **Nível de conteúdo:** Misto — introdução ao módulo + referência rápida por seção (sem tutoriais passo a passo extensos)
- **Armazenamento:** Hardcoded em `js/ajuda.js`; arquitetura preparada para migração futura para banco de dados (conteúdo isolado em objeto `AJUDA`, sem lógica misturada)
- **Idioma no painel:** Segue `appState.idioma` por padrão, permite troca temporária dentro do painel (persiste em `localStorage` como `ajuda_idioma`); não afeta o idioma global da interface
- **Busca:** Campo de busca no painel flutuante filtra conteúdo da página atual em tempo real; campo de busca na página completa busca em todos os módulos

---

## 3. Arquitetura

### Arquivos novos

```
js/ajuda.js          — objeto AJUDA + renderPainel() + renderPaginaCompleta()
pages/ajuda.html     — página completa de referência
```

### Estrutura do objeto `AJUDA`

```javascript
const AJUDA = {
  dashboard: {
    pt: {
      titulo: 'Dashboard',
      intro: 'Texto de introdução...',
      secoes: [
        {
          titulo: 'Indicadores Financeiros',
          itens: [
            'Orçamento total aprovado pela UNESCO para o projeto.',
            'Valor já executado (pagamentos confirmados).',
          ]
        },
        // ...
      ]
    },
    en: { ... },
    es: { ... }
  },
  atividades: { ... },
  tdrs: { ... },
  contratos: { ... },
  fornecedores: { ... },
  financeiro: { ... },
  produtos: { ... },
  viagens: { ... },
  auditoria: { ... },
  glossario: {
    pt: {
      titulo: 'Glossário',
      intro: 'Termos utilizados na plataforma.',
      secoes: [
        {
          titulo: 'Termos Gerais',
          itens: [
            'TDR — Termo de Referência: documento que define o escopo e as condições de contratação.',
            // ...
          ]
        }
      ]
    },
    en: { ... },
    es: { ... }
  }
}
```

### Integração com layout existente

- `js/ajuda.js` incluído em **todas as páginas** via `<script>` adicionado ao template `gerarLayout()` em `js/layout.js`
- O script detecta o `navId` ativo pelo atributo `data-nav` já presente nos links do sidebar
- Adiciona o botão `?` flutuante via `DOMContentLoaded` — sem modificar nenhuma página individualmente
- Usa `appState.idioma` já disponível via `config.js`

### Item de menu

`ajuda` adicionado ao grupo `'Apoio'` no array `navItems` de `layout.js`:
```javascript
{ id: 'ajuda', icone: 'ajuda', href: 'ajuda.html', perfis: null }
```
Visível para todos os perfis (`perfis: null`).

---

## 4. UI — Painel Flutuante

### Botão de ativação
- Círculo fixo `bottom: 24px; right: 24px; z-index: 1100`
- Cor: `#009edb` (azul UNESCO, consistente com o tema)
- Ícone: `?` em branco
- Fecha se clicar fora do painel

### Painel lateral
- Desliza da direita (`transform: translateX(100%)` → `translateX(0)`)
- Largura: `360px` em desktop, `100vw` em mobile
- Estrutura:

```
┌─────────────────────────────┐
│ [?] Ajuda  [PT][EN][ES]  [✕]│  ← header fixo
├─────────────────────────────┤
│ 🔍 Buscar nesta página...   │  ← input com debounce 200ms
├─────────────────────────────┤
│ Introdução ao módulo        │  ← parágrafo intro
│ ─────────────────────────── │
│ ▾ Seção 1    (expandida)    │  ← acordeão (1ª aberta por padrão)
│   • Item A                  │
│   • Item B                  │
│ ▸ Seção 2                   │
│ ▸ Seção 3                   │
├─────────────────────────────┤
│ 📖 Ver manual completo →    │  ← link para pages/ajuda.html
└─────────────────────────────┘
```

### Busca no painel
- Filtra `itens` de todas as seções da página atual (case-insensitive, normaliza acentos)
- Exibe só itens que contenham o termo; oculta seções vazias
- Mensagem "Nenhum resultado para X" se vazio
- Limpar campo restaura estado original do acordeão

---

## 5. UI — Página Completa `pages/ajuda.html`

### Layout
- Usa `gerarLayout('Ajuda', 'ajuda')` — sidebar e topbar normais
- Tabs horizontais no topo: `Dashboard · Atividades · TDRs · Contratos · Fornecedores · Financeiro · Produtos · Viagens · Auditoria · Glossário`
- Tab ativo persiste em `localStorage` como `ajuda_tab_ativo`

### Busca global
- Campo no topo da página
- Busca em todos os módulos simultaneamente
- Resultados agrupados por módulo com destaque do termo (highlight com `<mark>`)
- Click em resultado: ativa o tab correto e faz scroll suave até o item

### Conteúdo por tab
- Intro do módulo em destaque visual (card cinza-claro)
- Seções em acordeão (todas fechadas por padrão; exceção: primeira seção aberta)
- Rodapé de cada tab: link "Ir para o módulo →"

### Glossário
- Tab dedicado com termos agrupados por categoria
- Termos: TDR, Matriz de Resultados, Fase da Atividade, Status TDR, Perfis de Usuário, SEI, UNESCO, SEMA, Situação Financeira

---

## 6. Conteúdo por módulo (estrutura, não texto final)

| Módulo | Seções |
|--------|--------|
| Dashboard | Indicadores Financeiros, Indicadores de Risco, Alertas Automáticos, Cotação USD |
| Atividades | O que é uma Atividade, Fases, Orçamento, Responsável |
| TDRs | O que é um TDR, Fluxo de Status, PF vs PJ, Arquivo e Submissão |
| Contratos | Criação, Vínculo com TDR, Produtos do Contrato, Saldo e Execução |
| Fornecedores | Cadastro PF/PJ, Campos Obrigatórios, Ativação/Desativação |
| Financeiro | Lançamentos, Situação (pago/a pagar/cancelado), Comprovantes |
| Produtos | Entregas por Contrato, Fluxo de Aprovação, Upload de Arquivos |
| Viagens | Protocolo de Viagem, Situações, Diárias, Aprovação |
| Auditoria | Domínios Auditados, Severidades, Achados e Ações |
| Glossário | Termos Gerais, Status e Fases, Perfis de Usuário |

---

## 7. Decisões de Implementação

| Decisão | Escolha | Razão |
|---------|---------|-------|
| Conteúdo em banco? | Não (hardcoded) | Sem dependência de DB, deploy simples via GitHub Pages |
| Migração futura? | Arquitetura preparada | Objeto `AJUDA` isolado — fácil extrair para tabela Supabase |
| Idioma do painel | Segue `appState.idioma`, troca local | Coerência com interface + flexibilidade |
| Busca | Client-side, sem index | Volume pequeno, sem necessidade de full-text search |
| Modais | Painel usa `position: fixed`, fora do `#app` | Evita conflito de z-index com sidebar (armadilha conhecida #11) |

---

## 8. Fora de Escopo

- Editor de conteúdo in-app (fase futura)
- Vídeos ou screenshots embutidos
- Sistema de feedback ("essa ajuda foi útil?")
- Integração com chat-auditor IA
