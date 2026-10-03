-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · Fase 3 (parte g) — APLICAR PELO SQL EDITOR DO SUPABASE
--
-- Estas instruções contêm DELETE/DROP e o apply_migration do MCP fica
-- esperando uma confirmação que não chega à sessão. Colar este arquivo
-- inteiro no SQL Editor e executar (transação única). Idempotente.
--
-- (fn_rem_salvar saiu daqui: foi reescrita sem DELETE e aplicada pela
--  20261003_rem_04_rascunho_sem_delete, via MCP.)
-- 2. Sino: libera os tipos remanejamento_* em notificacoes (sem isso só o
--    e-mail sai; fn_rem_notificar já trata a ausência).
-- 3. Limpeza das sobras inertes que a 1ª versão da rem_02 deixou na tabela
--    antiga cotacoes_usd (AwesomeAPI).
-- ════════════════════════════════════════════════════════════════════════
begin;

-- ── Sino
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo::text = any (array[
  'tdr_para_revisar',
  'tdr_devolvido',
  'tdr_aprovado',
  'tdr_enviado_unesco',
  'produto_para_avaliar',
  'produto_aprovado',
  'produto_devolvido',
  'produto_aguarda_pagamento',
  'atividade_sem_responsavel',
  'substituto_designado',
  'desempate_necessario',
  'viagem_solicitada',
  'viagem_aprovada',
  'viagem_rejeitada',
  'viagem_prestacao',
  'reset_senha_solicitado',
  'reset_senha_atendido',
  'tarefa_atribuida',
  'tarefa_prazo',
  'tarefa_concluida',
  'tarefa_comentario',
  'tarefa_observador',
  'tarefa_subtarefa',
  'tarefa_revisao',
  'tarefa_devolvida',
  'tarefa_reaberta',
  'remanejamento_analisar',
  'remanejamento_devolvido',
  'remanejamento_recusado',
  'remanejamento_efetivado',
  'remanejamento_cancelado'
]::text[]));

-- ── Sobras na cotacoes_usd (AwesomeAPI)
drop trigger if exists trg_cotacoes_imutavel on public.cotacoes_usd;
drop policy if exists cotacoes_usd_select on public.cotacoes_usd;

notify pgrst, 'reload schema';
commit;
