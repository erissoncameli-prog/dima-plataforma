-- ============================================================
-- DIMA UNESCO — Configurações personalizáveis da plataforma
-- ============================================================
--
-- ANTES de executar este SQL:
--   1. Vá em Supabase → Storage → New bucket
--   2. Nome: plataforma-assets
--   3. Marque "Public bucket" (✓)
--   4. Clique em "Create bucket"
--
-- DEPOIS execute este SQL no SQL Editor do Supabase.
-- ============================================================

-- ── Tabela principal ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  projeto_id      text        NOT NULL DEFAULT 'default',
  projeto_nome    text        NOT NULL DEFAULT '',
  projeto_codigo  text        NOT NULL DEFAULT '',
  projeto_localizacao text    NOT NULL DEFAULT '',
  cor_primaria    text        NOT NULL DEFAULT '#1F4E2C',
  logos_topo      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  logo_projeto    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  logos_parceiros jsonb       NOT NULL DEFAULT '[]'::jsonb,
  fotos           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  atualizado_em   timestamptz DEFAULT now(),
  atualizado_por  uuid        REFERENCES public.usuarios(id) ON DELETE SET NULL,
  UNIQUE(projeto_id)
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;

-- Login page lê config sem autenticação (anon key)
CREATE POLICY "config_leitura_publica"
  ON public.configuracoes_sistema
  FOR SELECT USING (true);

-- Apenas super_admin pode escrever
CREATE POLICY "config_escrita_super_admin"
  ON public.configuracoes_sistema
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid() AND perfil = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid() AND perfil = 'super_admin'
    )
  );

-- ── Dados iniciais (projeto atual) ───────────────────────────
INSERT INTO public.configuracoes_sistema (
  projeto_id, projeto_nome, projeto_codigo, projeto_localizacao,
  cor_primaria, logos_topo, logo_projeto, logos_parceiros, fotos
) VALUES (
  'default',
  'Programa de Resiliência Socioambiental nas APAs Igarapé São Francisco e Lago do Amapá',
  '218BRA2001 · UNESCO/MPTF',
  'Rio Branco, Acre — Fundo Multipartes das Nações Unidas',
  '#1F4E2C',
  '[
    {"url":"assets/3-vertical-verde-conjunto-1024x805.png","alt":"Governo do Acre","ordem":0},
    {"url":"assets/1695134345-1-horizontal-verde-solo.png","alt":"SEMA","ordem":1}
  ]'::jsonb,
  '{"url":"assets/logo-resiliencia.png","alt":"Resiliência Socioambiental — APAs"}'::jsonb,
  '[
    {"url":"assets/1695134345-1-horizontal-verde-solo.png","alt":"SEMA/AC","tamanho":"medio","ordem":0},
    {"url":"assets/UNESCO_logo_hor_blue_transparent.png.png","alt":"UNESCO","tamanho":"medio","ordem":1},
    {"url":"assets/UNCT_Logo_RGB_Brazil_Portuguese_horiz_color.png","alt":"ONU Brasil","tamanho":"medio","ordem":2},
    {"url":"assets/logo-fundo-brasil-onu.png","alt":"Fundo Brasil-ONU","tamanho":"grande","ordem":3},
    {"url":"assets/logo-consorcio-amazonia.png","alt":"Consórcio Amazônia Legal","tamanho":"grande","ordem":4}
  ]'::jsonb,
  '[
    {"url":"assets/foto1.jpg","legenda":"APAs · Rio Branco, Acre","ordem":0},
    {"url":"assets/foto2.jpg","legenda":"APAs · Rio Branco, Acre","ordem":1},
    {"url":"assets/foto3.jpg","legenda":"APAs · Rio Branco, Acre","ordem":2},
    {"url":"assets/foto4.jpeg","legenda":"APAs · Rio Branco, Acre","ordem":3},
    {"url":"assets/foto5.jpeg","legenda":"APAs · Rio Branco, Acre","ordem":4},
    {"url":"assets/foto6.jpeg","legenda":"APAs · Rio Branco, Acre","ordem":5},
    {"url":"assets/foto7.jpeg","legenda":"APAs · Rio Branco, Acre","ordem":6},
    {"url":"assets/foto8.jpeg","legenda":"APAs · Rio Branco, Acre","ordem":7},
    {"url":"assets/foto9.jpeg","legenda":"APAs · Rio Branco, Acre","ordem":8},
    {"url":"assets/foto10.jpeg","legenda":"APAs · Rio Branco, Acre","ordem":9}
  ]'::jsonb
) ON CONFLICT (projeto_id) DO NOTHING;

-- ── Políticas de Storage (bucket: plataforma-assets) ─────────
-- Leitura pública
CREATE POLICY "storage_leitura_publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'plataforma-assets');

-- Upload apenas super_admin
CREATE POLICY "storage_upload_super_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'plataforma-assets' AND
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid() AND perfil = 'super_admin'
    )
  );

-- Delete apenas super_admin
CREATE POLICY "storage_delete_super_admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'plataforma-assets' AND
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid() AND perfil = 'super_admin'
    )
  );
