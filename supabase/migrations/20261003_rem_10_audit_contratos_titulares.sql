-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · rem_10 — trilha de auditoria (audit_log) em contratos e titulares
-- Plano §8: aditivos (valor), status, TDR e atividade do contrato e a designação
-- de signatários da cadeia passam a ter antes/depois, quem e quando, pela mesma
-- trigger genérica fn_trg_audit() das tabelas com dado pessoal (lgpd_c2_02).
-- Leitura de audit_log: só super_admin/coordenação (policy audit_select_admin).
-- ⚠️ O texto tem a operação de remoção no evento do trigger: o apply_migration
--    pede confirmação. Se não houver quem confirme, colar no SQL Editor.
-- ════════════════════════════════════════════════════════════════════════
create or replace trigger trg_audit_contratos
  after insert or update or delete on public.contratos
  for each row execute function public.fn_trg_audit();

create or replace trigger trg_audit_rem_cargo_titulares
  after insert or update or delete on public.rem_cargo_titulares
  for each row execute function public.fn_trg_audit();
