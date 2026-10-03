-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · Fase 5a — novos status de contrato
-- Separada da 05: valor novo de enum só pode ser usado depois do COMMIT.
--   aguardando_cobertura — contrato/aditivo acima do saldo; travado até cobrir
--   cancelado            — contrato que não vai acontecer (sai do débito)
-- ════════════════════════════════════════════════════════════════════════
alter type public.status_contrato add value if not exists 'aguardando_cobertura';
alter type public.status_contrato add value if not exists 'cancelado';
