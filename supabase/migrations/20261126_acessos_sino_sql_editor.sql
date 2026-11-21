-- 26/11/2026 · Acessos — tipos novos do sino. COLAR NO SQL EDITOR DO SUPABASE (exige DROP CONSTRAINT,
-- que trava o apply_migration). Sem isto os avisos acesso_* são descartados em silêncio (fn_acesso_avisar)
-- e só os e-mails saem.
-- Tipos novos: acesso_pedido (super_admin: alguém pediu módulo/liberação), acesso_decidido (pedido recusado),
-- acesso_alterado (módulo liberado/retirado/prazo mudou), acesso_vencendo (vence em 7 dias),
-- acesso_bloqueio (super_admin: pessoas suspensas por inatividade), acesso_revisao (super_admin: revisão pendente).
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo::text = any (array[
  'tdr_para_revisar','tdr_devolvido','tdr_aprovado','tdr_enviado_unesco','produto_para_avaliar','produto_aprovado',
  'produto_devolvido','produto_aguarda_pagamento','atividade_sem_responsavel','substituto_designado','desempate_necessario',
  'viagem_solicitada','viagem_aprovada','viagem_rejeitada','viagem_prestacao','reset_senha_solicitado','reset_senha_atendido',
  'tarefa_atribuida','tarefa_prazo','tarefa_concluida','tarefa_comentario','tarefa_observador','tarefa_subtarefa',
  'tarefa_revisao','tarefa_devolvida','tarefa_reaberta','remanejamento_analisar','remanejamento_devolvido',
  'remanejamento_recusado','remanejamento_efetivado','remanejamento_cancelado','contrato_travado','contrato_liberado',
  'tdr_cancelamento_analisar','tdr_cancelamento_devolvido','tdr_cancelamento_recusado','tdr_cancelamento_efetivado',
  'tdr_cancelamento_cancelado','tdr_execucao_direta_alerta','api_pedido','diag_area_pedido',
  'acesso_pedido','acesso_decidido','acesso_alterado','acesso_vencendo','acesso_bloqueio','acesso_revisao'
]::text[]));
