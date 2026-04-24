-- ═══════════════════════════════════════════════════════════════════
-- DIMA · Migration 07 — Agente IA: fluxo TDR, entregas e log de análises
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. Atualizar constraint de status dos TDRs
--    Novo fluxo: rascunho → submetido → pendente_correcao →
--                em_avaliacao → em_revisao_unesco → aprovado → cancelado
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.tdrs
  DROP CONSTRAINT IF EXISTS tdrs_status_check;

ALTER TABLE public.tdrs
  ADD CONSTRAINT tdrs_status_check
  CHECK (status IN (
    'rascunho',
    'submetido',
    'pendente_correcao',
    'em_avaliacao',
    'em_revisao_unesco',
    'aprovado',
    'cancelado'
  ));

-- Migrar dados existentes para os novos status
UPDATE public.tdrs SET status = 'em_avaliacao'      WHERE status = 'revisao_interna';
UPDATE public.tdrs SET status = 'pendente_correcao' WHERE status = 'ajustes';
UPDATE public.tdrs SET status = 'em_revisao_unesco' WHERE status = 'enviado_unesco';
UPDATE public.tdrs SET status = 'pendente_correcao' WHERE status = 'retorno_unesco';

-- ──────────────────────────────────────────────────────────────────
-- 2. Adicionar status 'devolvido' em contratos_produtos_entregas
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.contratos_produtos_entregas
  DROP CONSTRAINT IF EXISTS contratos_produtos_entregas_situacao_check;

ALTER TABLE public.contratos_produtos_entregas
  ADD CONSTRAINT contratos_produtos_entregas_situacao_check
  CHECK (situacao IN (
    'pendente',
    'em_analise',
    'aprovada',
    'devolvida',
    'rejeitada',
    'cancelada'
  ));

-- ──────────────────────────────────────────────────────────────────
-- 3. Criar tabela de log de análises do agente IA
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agente_analises (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint        SMALLINT    NOT NULL CHECK (checkpoint IN (1, 2, 3, 4)),
  -- 1 = TDR submetido
  -- 2 = Contrato em análise
  -- 3 = Pré-cadastro de entrega
  -- 4 = Entrega em validação

  referencia_id     UUID        NOT NULL,
  referencia_tipo   TEXT        NOT NULL CHECK (referencia_tipo IN (
                                  'tdr',
                                  'contrato',
                                  'contratos_produtos',
                                  'contratos_produtos_entregas'
                                )),

  status            TEXT        NOT NULL CHECK (status IN ('aprovado', 'alerta', 'reprovado')),
  resumo            TEXT,
  detalhes          JSONB,
  -- estrutura sugerida de detalhes:
  -- {
  --   "criterios": [
  --     { "nome": "menciona_indicador", "ok": true,  "observacao": "..." },
  --     { "nome": "tem_metodologia",    "ok": false, "observacao": "..." },
  --     { "nome": "tem_prazo_produto",  "ok": true,  "observacao": "..." }
  --   ],
  --   "indicadores_vinculados": ["uuid1", "uuid2"],
  --   "sugestoes": ["texto da sugestão 1", "texto da sugestão 2"]
  -- }

  modelo_ia         TEXT,        -- ex: 'claude-sonnet-4-6'
  tokens_usados     INTEGER,

  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_agente_analises_referencia
  ON public.agente_analises (referencia_tipo, referencia_id);

CREATE INDEX IF NOT EXISTS idx_agente_analises_checkpoint
  ON public.agente_analises (checkpoint, criado_em DESC);

-- ──────────────────────────────────────────────────────────────────
-- 4. Garantir que atividade_matriz existe (já deve existir)
--    Apenas documenta a estrutura esperada
-- ──────────────────────────────────────────────────────────────────
-- A tabela atividade_matriz (atividade_id, matriz_item_id) já existe
-- e é o vínculo principal que o agente usa para saber quais
-- indicadores validar ao analisar um TDR.
-- Nenhuma alteração necessária nessa tabela.
