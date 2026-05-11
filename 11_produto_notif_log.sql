-- Migration 11: log de e-mails enviados para produtos/entregas
-- Executar no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.produto_notif_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id     uuid        NOT NULL REFERENCES public.contratos_produtos(id) ON DELETE CASCADE,
  entrega_id     uuid        REFERENCES public.contratos_produtos_entregas(id) ON DELETE SET NULL,
  evento         text        NOT NULL,
  total_enviados int         NOT NULL DEFAULT 0,
  falhas         int         NOT NULL DEFAULT 0,
  enviado_por    uuid        REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS produto_notif_log_produto_idx  ON public.produto_notif_log(produto_id);
CREATE INDEX IF NOT EXISTS produto_notif_log_entrega_idx  ON public.produto_notif_log(entrega_id);
CREATE INDEX IF NOT EXISTS produto_notif_log_criado_idx   ON public.produto_notif_log(criado_em DESC);

ALTER TABLE public.produto_notif_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura autenticada" ON public.produto_notif_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Inserção autenticada" ON public.produto_notif_log
  FOR INSERT TO authenticated WITH CHECK (true);

COMMENT ON TABLE  public.produto_notif_log IS 'Histórico de e-mails enviados em eventos de produtos/entregas';
COMMENT ON COLUMN public.produto_notif_log.evento IS 'entregue | aprovado | aprovado_parcial | devolvido | pago';
