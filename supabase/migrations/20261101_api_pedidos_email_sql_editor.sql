-- Colar no SQL Editor do Supabase (o apply_migration expira com DROP no texto).
-- Acrescenta o tipo 'api_pedido' ao check de notificacoes: sino dos super_admin quando
-- chega um pedido de acesso à API por e-mail (20261101_api_pedidos_email).
-- Sem este arquivo o pedido é registrado normalmente; só o sino fica mudo.
alter table public.notificacoes
  drop constraint notificacoes_tipo_check,
  add constraint notificacoes_tipo_check check (tipo::text = any (array[
    'tdr_para_revisar','tdr_devolvido','tdr_aprovado','tdr_enviado_unesco',
    'produto_para_avaliar','produto_aprovado','produto_devolvido','produto_aguarda_pagamento',
    'atividade_sem_responsavel','substituto_designado','desempate_necessario',
    'viagem_solicitada','viagem_aprovada','viagem_rejeitada','viagem_prestacao',
    'reset_senha_solicitado','reset_senha_atendido',
    'tarefa_atribuida','tarefa_prazo','tarefa_concluida','tarefa_comentario','tarefa_observador',
    'tarefa_subtarefa','tarefa_revisao','tarefa_devolvida','tarefa_reaberta',
    'remanejamento_analisar','remanejamento_devolvido','remanejamento_recusado','remanejamento_efetivado','remanejamento_cancelado',
    'contrato_travado','contrato_liberado',
    'tdr_cancelamento_analisar','tdr_cancelamento_devolvido','tdr_cancelamento_recusado','tdr_cancelamento_efetivado','tdr_cancelamento_cancelado',
    'tdr_execucao_direta_alerta',
    'api_pedido'
  ]::text[]));
