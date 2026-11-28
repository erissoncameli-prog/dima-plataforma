# Progresso — DIMA (Plataforma de Gestão de Projetos)

> Diário de passagem de bastão entre contas do Claude e dispositivos. **Leia ao começar, atualize ao parar.**
> Curto: o mais recente em cima. Regras permanentes ficam no `CLAUDE.md`.

## Estado atual — 28/11/2026

- **Em andamento: Lista de presença das reuniões** (Painel de Tarefas). Código **pronto e já na `main`** (publicado na Vercel),
  mas **o banco ainda não foi atualizado**: até lá a tela mostra "Lista de presença em instalação" e o quadro some da ficha.
- **Falta (precisa do conector do Supabase — computador da SEMA ou conectar aqui):**
  1. Testar a migração sem gravar: `execute_sql` com `begin; <conteúdo de supabase/migrations/20261128_presenca_reunioes.sql>; rollback;`
     no projeto `wfymnmlinonvdqfucjya`. Corrigir o que falhar (o arquivo nunca rodou em Postgres).
  2. Aplicar: `apply_migration` (nome `20261128_presenca_reunioes`). Não tem palavra de apagar no texto.
  3. Publicar a Edge Function `presenca-emails` (`deploy_edge_function`, verify_jwt = true).
  4. Conferir o cron: `select jobname, schedule, command from cron.job where jobname like 'presenca%'` (deve existir
     `presenca-emails`, a cada minuto, terminando em `where public.fn_presenca_rotina() > 0`).
  5. Conferir o painel de segurança (`anon_security_definer_function_executable`): o `anon` só deve executar
     `fn_publico_presenca_lista` e `fn_publico_presenca_assinar`.
  6. Teste real: criar uma reunião começando em ~5 min com 2 convidados → ver o quadro na ficha, projetar o QR, assinar pelo
     celular (convidado sem conta), esperar o e-mail dos 10 min, assinar pelo link, exportar PDF/Excel/CSV na aba Presenças.
  7. Revisar com a coordenação o texto do termo de uso de imagem (versão 1, semeada na migração). Texto novo = nova versão
     por `fn_presenca_termo_publicar` (super_admin). Ainda não há tela para editar o termo (fica para depois).
- **Pendências conhecidas**: plano do Remanejamento em `docs/remanejamento/pendencias.md` (Blocos A em diante).

## Histórico

### 28/11/2026
- Lista de presença das reuniões: migração `20261128_presenca_reunioes` (listas, assinaturas, termo de imagem versionado,
  convites pessoais, fila de e-mail, painel, exportação, ROPA TRAT-008), Edge Function `presenca-emails`, página pública
  `pages/presenca.html`, quadro na ficha + QR em tela cheia + aba Presenças (`js/presenca.js`). Testado no navegador com dados
  simulados (página pública em todos os estados, gerenciador, janela da lista, QR, CSV/Excel, celular). SQL ainda não testado.
- Atenção: há um gancho global do Claude (`~/.claude/settings.json`, PostToolUse) que faz commit + push na `main` a cada
  arquivo salvo — tudo que é editado vai para a produção na hora.

### 27/11/2026
- Criado este arquivo e a seção "Continuidade entre contas e dispositivos" no `CLAUDE.md`.
