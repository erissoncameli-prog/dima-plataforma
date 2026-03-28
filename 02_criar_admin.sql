-- ============================================================
-- DIMA UNESCO — Criar usuário administrador inicial
-- Execute APÓS criar o usuário no Supabase Auth
-- ============================================================
--
-- PASSO 1: Vá em Supabase → Authentication → Users → Add user
--   Email: seu_email@gmail.com
--   Password: sua_senha_forte
--   Clique em "Create user"
--
-- PASSO 2: Copie o UUID do usuário criado (aparece na lista)
--
-- PASSO 3: Substitua 'COLE-O-UUID-AQUI' pelo UUID copiado
--   e execute este SQL no SQL Editor
--
-- ============================================================

INSERT INTO public.usuarios (id, nome_completo, email, perfil, idioma_pref, ativo)
VALUES (
  'COLE-O-UUID-AQUI',           -- UUID do auth.users
  'Administrador DIMA',          -- Troque pelo nome real
  'seu_email@gmail.com',         -- Mesmo e-mail usado no Auth
  'super_admin',
  'pt',
  true
)
ON CONFLICT (id) DO UPDATE SET
  perfil = 'super_admin',
  ativo = true;

-- Verificar se foi criado:
SELECT id, nome_completo, email, perfil FROM public.usuarios;
