-- ═══════════════════════════════════════════════════════════════════
-- DIMA · Fix 05 — Corrigir FK de produto_matriz_contribuicao
-- Problema: produto_id referenciava produtos_entregas (inexistente)
--           em vez de contratos_produtos_entregas
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════

-- 1. Remover constraint incorreta
ALTER TABLE public.produto_matriz_contribuicao
  DROP CONSTRAINT IF EXISTS produto_matriz_contribuicao_produto_id_fkey;

-- 2. Criar constraint correta
ALTER TABLE public.produto_matriz_contribuicao
  ADD CONSTRAINT produto_matriz_contribuicao_produto_id_fkey
  FOREIGN KEY (produto_id)
  REFERENCES public.contratos_produtos_entregas(id)
  ON DELETE CASCADE;
