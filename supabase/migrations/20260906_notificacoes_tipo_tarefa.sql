-- Estende o CHECK de notificacoes.tipo para os tipos do módulo Tarefas.
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo::text = any (array[
    'tdr_para_revisar','tdr_devolvido','tdr_aprovado','tdr_enviado_unesco',
    'produto_para_avaliar','produto_aprovado','produto_devolvido','produto_aguarda_pagamento',
    'atividade_sem_responsavel','substituto_designado','desempate_necessario',
    'viagem_solicitada','viagem_aprovada','viagem_rejeitada','viagem_prestacao',
    'reset_senha_solicitado','reset_senha_atendido',
    -- módulo Tarefas
    'tarefa_atribuida','tarefa_prazo','tarefa_concluida'
  ]::text[]));
