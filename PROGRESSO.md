# Progresso — DIMA (Plataforma de Gestão de Projetos)

> Diário de passagem de bastão entre contas do Claude e dispositivos. **Leia ao começar, atualize ao parar.**
> Curto: o mais recente em cima. Regras permanentes ficam no `CLAUDE.md`.

## Estado atual — 28/11/2026

- **Mini gráficos nos números do topo — piloto (28/11, noite):** TDRs, Contratos e Financeiro ganharam um gráfico pequeno e uma
  frase de leitura em cada quadro (`js/kpi-graficos.js` + `css/kpi-graficos.css`; regras no CLAUDE.md). Conferido com banco falso
  (`tests/kpi-graficos/conferir.js`, Edge): 3 telas × 3 larguras × 2 temas, nada fora do quadro, sem erro. **Falta:** o usuário
  olhar com dados reais e aprovar; depois Produtos, Viagens, Atividades, Fornecedores e Matriz (fase 2) e as demais (fase 3).
  Mudança de contagem: TDR em licitação saiu de "Em andamento" (já contava em Aprovados); "Atrasados" não conta mais cancelado.

- **Lista de presença — relatório (28/11, fim da tarde), no ar:** PDF A4 **sempre em paisagem**, uma página por reunião, todos os
  campos (sexo, raça e idade para coordenação/super_admin) e **resumo por sexo e faixa de idade** de cada reunião (+ resumo geral
  quando exporta várias). Rótulo **"Convidado externo"** no lugar de "Não convidado(a)"; quem não tem conta = **"Sem cadastro"**.
  Migração `_e_relatorio` (`fn_presenca_exportar` devolve `resumos`). Conferido no navegador com dados simulados.
- **Lista de presença — ajustes de 28/11 (tarde), no ar:** marca **"Não convidado(a)"** (gravada na assinatura, `convidado_inicial`)
  e **faixa de idade** obrigatória (até 17 · 18–24 · 25–29 · 30–39 · 40–49 · 50–59 · 60+ · prefere não responder). Migrações
  `_c_convite_idade` e `_d_marcar_convidados` (as 3 assinaturas reais da TR-090: 2 convidadas, 1 não). Testado no banco
  (transação desfeita) e no navegador com dados simulados (página, gerenciador, CSV/Excel). As 3 assinaturas da TR-090
  ficam "Sem registro" na faixa de idade (foram feitas antes do campo).
- **Lista de presença das reuniões: NO AR (28/11/2026).** Migrações `20261128_presenca_reunioes` + `_b_validacao` aplicadas,
  Edge Function `presenca-emails` v1 publicada, cron `presenca-emails` ativo (a cada minuto, só chama a função com pendência).
  Testado no banco em transação desfeita: lista nasce com a reunião, rotina dos 10 min, QR, link pessoal, e-mail repetido
  barrado, campos vazios barrados, gestão, painel, exportação (PDF sem raça), retirada de imagem, encerrar/reabrir, técnico
  sem permissão, reunião desativada fecha a lista. Painel de segurança: `anon` só executa as 2 funções públicas (esperado).
- **Falta:**
  1. Teste real com o usuário: reunião começando em ~5 min com 2 convidados → quadro na ficha, QR no celular (convidado sem
     conta), e-mail dos 10 min chega (conferir `presenca_notificacoes.enviado_em/erro`), assinar pelo link, exportar.
  2. Revisar com a coordenação o texto do termo de uso de imagem (versão 1). Texto novo = nova versão por
     `fn_presenca_termo_publicar` (super_admin). Ainda não há tela para editar o termo.
- **Conector do Supabase**: `.mcp.json` do projeto + conector oficial aprovado pela organização no Claude (28/11/2026).
- **Relatórios A4 (aba Relatórios) — concluído e na `main`.** Conferência dos 55 relatórios + visual novo (opção A) +
  correções de largura, orientação e dado. Falta só conferir em produção, com dados reais: P4 e L4 (antes sempre vazios),
  L1 (comentário de cada ação) e a taxa de aprovação do P3 (agora só produtos avaliados). Nada no banco foi alterado.
- **Pendências conhecidas**: plano do Remanejamento em `docs/remanejamento/pendencias.md` (Blocos A em diante).

## Histórico

### 28/11/2026
- Relatórios A4: equipamento de conferência `tests/relatorios/` (banco falso + `rodar.js`, sementes por grupo; mede largura,
  letra reduzida, páginas, PDF e orientação — ver CLAUDE.md, "Relatórios A4 — PADRÃO ÚNICO"). 5 agentes auditaram os 55 e 4
  corrigiram. Mudanças: `css/folha-a4.css` opção A (números sem cartão verde-menta, cabeçalho sem caixa alta, zebrado cinza) e
  fim do `overflow-wrap:anywhere`; `FolhaA4.ajustar` reduz por zoom a tabela que não cabe; rótulos `seloCont`/`seloProd`/
  `tipoCont`; `fmtPct1` com vírgula (diagnostico-sw VERSAO 36); orientação padrão F5/F6/C4 paisagem, T2/Vi4 retrato; dados
  corrigidos em P3, P4, L4, L1, V1, V2, U4, A1, A3, Vi1–Vi3, M2, L5; A4 (também na Visão Geral) cabe na folha. Rodada final:
  0 erro, 0 conteúdo fora da folha, 0 página com problema, PDF sempre na orientação certa. Resumo publicado (artifact
  "Conferência dos Relatórios A4"). O banco falso ignora `.or/.not`: filtros não foram conferidos por ele.
- Lista de presença das reuniões: migração `20261128_presenca_reunioes` (listas, assinaturas, termo de imagem versionado,
  convites pessoais, fila de e-mail, painel, exportação, ROPA TRAT-008), Edge Function `presenca-emails`, página pública
  `pages/presenca.html`, quadro na ficha + QR em tela cheia + aba Presenças (`js/presenca.js`). Testado no navegador com dados
  simulados (página pública em todos os estados, gerenciador, janela da lista, QR, CSV/Excel, celular). SQL testado e aplicado no mesmo dia (ver Estado atual).
- Atenção: há um gancho global do Claude (`~/.claude/settings.json`, PostToolUse) que faz commit + push na `main` a cada
  arquivo salvo — tudo que é editado vai para a produção na hora.

### 27/11/2026
- Criado este arquivo e a seção "Continuidade entre contas e dispositivos" no `CLAUDE.md`.
