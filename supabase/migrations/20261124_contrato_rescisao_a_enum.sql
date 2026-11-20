-- Contrato rescindido (distrato) — 1/3: valor novo do enum.
-- Separado da migração seguinte porque valor novo de enum só pode ser usado depois de commitado.
alter type public.status_contrato add value if not exists 'rescindido';
