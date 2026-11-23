-- ════════════════════════════════════════════════════════════════════════
-- COLAR NO SQL EDITOR (o apply_migration expira com DROP no texto).
-- Acrescenta o tipo 'licitacao_edital' ao sino (notificacoes_tipo_check).
-- Antes disto, fn_lic_avisar_edital usa 'tarefa_prazo'; depois, passa sozinha a usar o tipo novo.
-- A lista abaixo é a atual (23/11/2026) + 'licitacao_edital'.
-- ════════════════════════════════════════════════════════════════════════
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check ((tipo)::text = any (array[
  'tdr_para_revisar','tdr_devolvido','tdr_aprovado','tdr_enviado_unesco','produto_para_avaliar','produto_aprovado',
  'produto_devolvido','produto_aguarda_pagamento','atividade_sem_responsavel','substituto_designado','desempate_necessario',
  'viagem_solicitada','viagem_aprovada','viagem_rejeitada','viagem_prestacao','reset_senha_solicitado','reset_senha_atendido',
  'tarefa_atribuida','tarefa_prazo','tarefa_concluida','tarefa_comentario','tarefa_observador','tarefa_subtarefa',
  'tarefa_revisao','tarefa_devolvida','tarefa_reaberta','remanejamento_analisar','remanejamento_devolvido',
  'remanejamento_recusado','remanejamento_efetivado','remanejamento_cancelado','contrato_travado','contrato_liberado',
  'tdr_cancelamento_analisar','tdr_cancelamento_devolvido','tdr_cancelamento_recusado','tdr_cancelamento_efetivado',
  'tdr_cancelamento_cancelado','tdr_execucao_direta_alerta','api_pedido','diag_area_pedido','acesso_pedido',
  'acesso_decidido','acesso_alterado','acesso_vencendo','acesso_bloqueio','acesso_revisao',
  'licitacao_edital'
]::text[]));
