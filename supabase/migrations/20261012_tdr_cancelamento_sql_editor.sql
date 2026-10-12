-- ════════════════════════════════════════════════════════════════════════
-- Cancelamento de TDR — parte para o SQL EDITOR do Supabase
-- (o texto tem remoção de restrição/policy, e o apply_migration fica esperando
--  uma confirmação que não chega à sessão). Colar inteiro e executar. Idempotente.
--
-- 1. Sino: libera os tipos tdr_cancelamento_* em notificacoes (sem isso só o
--    e-mail sai; fn_tcan_notificar já trata a ausência).
--    Lista = a de produção em 12/10/2026 + os 5 tipos novos.
-- 2. Nota técnica permanente: policy RESTRITIVA que impede qualquer cliente de
--    remover arquivos sob tdrs-arquivos/cancelamentos/ (o SHA-256 da nota está
--    no documento assinado; o bucket deixa a coordenação remover o resto).
-- ════════════════════════════════════════════════════════════════════════
begin;

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
  'contrato_travado','contrato_liberado',
  'tdr_cancelamento_analisar','tdr_cancelamento_devolvido','tdr_cancelamento_recusado',
  'tdr_cancelamento_efetivado','tdr_cancelamento_cancelado'
]::text[]));

drop policy if exists tdr_cancelamento_nota_permanente on storage.objects;
create policy tdr_cancelamento_nota_permanente on storage.objects as restrictive
  for delete to authenticated
  using (not (bucket_id = 'tdrs-arquivos' and name like 'cancelamentos/%'));

notify pgrst, 'reload schema';
commit;
