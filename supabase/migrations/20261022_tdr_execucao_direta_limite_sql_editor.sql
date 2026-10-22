-- Parte da migração 20261022_tdr_execucao_direta_limite que exige DROP (colar no SQL Editor se o apply_migration travar).
-- Acrescenta o tipo 'tdr_execucao_direta_alerta' ao check de notificacoes (aviso de 80% e 95% do TDR de execução direta).
alter table public.notificacoes
  drop constraint notificacoes_tipo_check,
  add constraint notificacoes_tipo_check check (tipo::text = any (array[
    'tdr_para_revisar','tdr_devolvido','tdr_aprovado','tdr_enviado_unesco','produto_para_avaliar','produto_aprovado',
    'produto_devolvido','produto_aguarda_pagamento','atividade_sem_responsavel','substituto_designado','desempate_necessario',
    'viagem_solicitada','viagem_aprovada','viagem_rejeitada','viagem_prestacao','reset_senha_solicitado','reset_senha_atendido',
    'tarefa_atribuida','tarefa_prazo','tarefa_concluida','tarefa_comentario','tarefa_observador','tarefa_subtarefa',
    'tarefa_revisao','tarefa_devolvida','tarefa_reaberta','remanejamento_analisar','remanejamento_devolvido',
    'remanejamento_recusado','remanejamento_efetivado','remanejamento_cancelado','contrato_travado','contrato_liberado',
    'tdr_cancelamento_analisar','tdr_cancelamento_devolvido','tdr_cancelamento_recusado','tdr_cancelamento_efetivado',
    'tdr_cancelamento_cancelado','tdr_execucao_direta_alerta']::text[]));
