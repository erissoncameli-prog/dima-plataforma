-- ═══════════════════════════════════════════════════════════════════
-- DIMA · Migração 03 — Sistema de permissões dinâmicas por módulo
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Tabela principal ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usuario_permissoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id     UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  modulo         TEXT NOT NULL,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  valido_de      TIMESTAMPTZ NOT NULL DEFAULT now(),
  valido_ate     TIMESTAMPTZ NULL,            -- NULL = sem expiração
  concedido_por  UUID NOT NULL REFERENCES public.usuarios(id),
  concedido_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revogado_por   UUID NULL REFERENCES public.usuarios(id),
  revogado_em    TIMESTAMPTZ NULL,
  motivo         TEXT NULL,
  UNIQUE (usuario_id, modulo)
);

COMMENT ON TABLE  public.usuario_permissoes IS 'Permissões extras de acesso a módulos, concedidas pelo super_admin. Adicionais ao controle por perfil.';
COMMENT ON COLUMN public.usuario_permissoes.modulo    IS 'ID do módulo: dashboard | atividades | tdrs | matriz | fornecedores | contratos | produtos | financeiro | viagens | repositorio | usuarios';
COMMENT ON COLUMN public.usuario_permissoes.valido_ate IS 'NULL = acesso permanente enquanto ativo=true';

-- Índices
CREATE INDEX IF NOT EXISTS idx_uperm_usuario ON public.usuario_permissoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_uperm_ativo   ON public.usuario_permissoes(ativo, valido_ate);

-- ── 2. RLS ───────────────────────────────────────────────────────
ALTER TABLE public.usuario_permissoes ENABLE ROW LEVEL SECURITY;

-- super_admin: gerencia tudo
CREATE POLICY "uperm_super_admin_all"
  ON public.usuario_permissoes FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND perfil = 'super_admin' AND ativo = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios WHERE id = auth.uid() AND perfil = 'super_admin' AND ativo = true));

-- Qualquer usuário autenticado: lê apenas as próprias
CREATE POLICY "uperm_self_select"
  ON public.usuario_permissoes FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

-- ── 3. Função auxiliar (usada nas políticas RLS das outras tabelas)
CREATE OR REPLACE FUNCTION public.tem_permissao(p_modulo TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_permissoes
    WHERE usuario_id = auth.uid()
      AND modulo     = p_modulo
      AND ativo      = true
      AND valido_de <= now()
      AND (valido_ate IS NULL OR valido_ate > now())
  );
$$;

-- ── 4. Atualizar RLS das tabelas protegidas ──────────────────────
-- Padrão: adiciona OR tem_permissao('<modulo>') nas políticas de SELECT

-- contratos
DROP POLICY IF EXISTS "contratos_select" ON public.contratos;
CREATE POLICY "contratos_select" ON public.contratos FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND perfil IN ('super_admin','coordenacao','financeiro')
        AND ativo = true)
    OR tem_permissao('contratos')
  );

-- financeiro (lancamentos_financeiros)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lancamentos_financeiros' AND policyname='fin_select') THEN
    DROP POLICY "fin_select" ON public.lancamentos_financeiros;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='lancamentos_financeiros') THEN
    EXECUTE $q$
      CREATE POLICY "fin_select" ON public.lancamentos_financeiros FOR SELECT TO authenticated
        USING (
          EXISTS (SELECT 1 FROM public.usuarios
            WHERE id = auth.uid()
              AND perfil IN ('super_admin','coordenacao','financeiro')
              AND ativo = true)
          OR public.tem_permissao('financeiro')
        )
    $q$;
  END IF;
END $$;

-- viagem_protocolos (já tinha política própria, adiciona fallback)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='viagem_protocolos' AND policyname='viagem_prot_select_extra') THEN
    DROP POLICY "viagem_prot_select_extra" ON public.viagem_protocolos;
  END IF;
END $$;
CREATE POLICY "viagem_prot_select_extra" ON public.viagem_protocolos FOR SELECT TO authenticated
  USING (public.tem_permissao('viagens'));
