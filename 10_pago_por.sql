-- Migration 10: registrar quem efetuou o pagamento em execucao_financeira
-- Executar no Supabase SQL Editor

ALTER TABLE public.execucao_financeira
  ADD COLUMN IF NOT EXISTS pago_por uuid REFERENCES public.usuarios(id);

COMMENT ON COLUMN public.execucao_financeira.pago_por IS 'Usuário que registrou o pagamento no sistema';
