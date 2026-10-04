-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · rem_11b — libera no sino os tipos contrato_travado / contrato_liberado
-- Troca o check de notificacoes (exige remover a restrição antiga). Se o
-- apply_migration não conseguir a confirmação, colar este arquivo no SQL Editor.
-- Lista = a de produção em 03/10/2026 + os 2 tipos novos.
-- ════════════════════════════════════════════════════════════════════════
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check ((tipo)::text = any (array[
  'tdr_para_revisar','tdr_devolvido','tdr_aprovado','tdr_enviado_unesco',
  'produto_para_avaliar','produto_aprovado','produto_devolvido','produto_aguarda_pagamento',
  'atividade_sem_responsavel','substituto_designado','desempate_necessario',
  'viagem_solicitada','viagem_aprovada','viagem_rejeitada','viagem_prestacao',
  'reset_senha_solicitado','reset_senha_atendido',
  'tarefa_atribuida','tarefa_prazo','tarefa_concluida','tarefa_comentario','tarefa_observador',
  'tarefa_subtarefa','tarefa_revisao','tarefa_devolvida','tarefa_reaberta',
  'remanejamento_analisar','remanejamento_devolvido','remanejamento_recusado',
  'remanejamento_efetivado','remanejamento_cancelado',
  'contrato_travado','contrato_liberado'
]::text[]));
