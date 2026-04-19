-- ═══════════════════════════════════════════════════════════════════
-- DIMA · Fix 06 — Contribuições e pontos de mapa só após aprovação
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════

-- 1. Adicionar entrega_id em produto_pontos_mapa
--    Permite identificar quais pontos pertencem a qual entrega
ALTER TABLE public.produto_pontos_mapa
  ADD COLUMN IF NOT EXISTS entrega_id UUID
  REFERENCES public.contratos_produtos_entregas(id) ON DELETE SET NULL;

-- 2. Permitir status 'cancelado' em produto_matriz_contribuicao
--    Necessário para invalidar contribuições de entregas devolvidas
ALTER TABLE public.produto_matriz_contribuicao
  DROP CONSTRAINT IF EXISTS produto_matriz_contribuicao_status_check;

ALTER TABLE public.produto_matriz_contribuicao
  ADD CONSTRAINT produto_matriz_contribuicao_status_check
  CHECK (status IN ('pendente','confirmado','rejeitado','cancelado'));

-- 3. Recriar vw_matriz_progresso filtrando apenas entregas aprovadas
--    Contribuições 'cancelado' e de entregas não aprovadas são excluídas
CREATE OR REPLACE VIEW public.vw_matriz_progresso AS
SELECT
  mi.id,
  mi.resultado,
  mi.produto_codigo,
  mi.produto_titulo,
  mi.indicador,
  mi.meta_numerica,
  mi.meta_descricao,
  mi.unidade,
  mi.ods,
  mi.metas_km,
  COALESCE(SUM(CASE WHEN pmc.status = 'confirmado' THEN pmc.valor ELSE 0 END), 0) AS realizado_confirmado,
  COALESCE(SUM(CASE WHEN pmc.status = 'pendente'   THEN pmc.valor ELSE 0 END), 0) AS realizado_pendente,
  COALESCE(SUM(CASE WHEN pmc.status IN ('confirmado','pendente') THEN pmc.valor ELSE 0 END), 0) AS realizado_total,
  CASE WHEN mi.meta_numerica > 0
    THEN ROUND(
      COALESCE(SUM(CASE WHEN pmc.status = 'confirmado' THEN pmc.valor ELSE 0 END), 0)
      / mi.meta_numerica * 100, 1)
    ELSE NULL
  END AS pct_confirmado
FROM public.matriz_itens mi
LEFT JOIN public.produto_matriz_contribuicao pmc
  ON  pmc.matriz_item_id = mi.id
  AND pmc.status != 'cancelado'
  AND EXISTS (
    SELECT 1 FROM public.contratos_produtos_entregas cpe
    WHERE cpe.id = pmc.produto_id
      AND cpe.situacao = 'aprovada'
  )
WHERE mi.ativo = true
GROUP BY mi.id;
