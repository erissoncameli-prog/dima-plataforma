-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 21 — COLAR NO SQL EDITOR (não vai por
-- apply_migration: trocar o check de notificacoes exige DROP CONSTRAINT).
--
-- Acrescenta o tipo 'diag_area_pedido' ao sino: aviso à coordenação quando
-- um entrevistador pede autorização para entrevistar fora da área designada
-- (diag_area_pedir). Sem este arquivo o pedido funciona igual — só o sino
-- fica mudo; a fila aparece na aba "Equipe de campo" da mesa.
-- Lista conferida contra produção em 15/11/2026 (+ o tipo novo no fim).
-- ════════════════════════════════════════════════════════════════════════
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo::text = any (array[
  'tdr_para_revisar','tdr_devolvido','tdr_aprovado','tdr_enviado_unesco','produto_para_avaliar','produto_aprovado',
  'produto_devolvido','produto_aguarda_pagamento','atividade_sem_responsavel','substituto_designado','desempate_necessario',
  'viagem_solicitada','viagem_aprovada','viagem_rejeitada','viagem_prestacao','reset_senha_solicitado','reset_senha_atendido',
  'tarefa_atribuida','tarefa_prazo','tarefa_concluida','tarefa_comentario','tarefa_observador','tarefa_subtarefa',
  'tarefa_revisao','tarefa_devolvida','tarefa_reaberta','remanejamento_analisar','remanejamento_devolvido',
  'remanejamento_recusado','remanejamento_efetivado','remanejamento_cancelado','contrato_travado','contrato_liberado',
  'tdr_cancelamento_analisar','tdr_cancelamento_devolvido','tdr_cancelamento_recusado','tdr_cancelamento_efetivado',
  'tdr_cancelamento_cancelado','tdr_execucao_direta_alerta','api_pedido',
  'diag_area_pedido']::text[]));
