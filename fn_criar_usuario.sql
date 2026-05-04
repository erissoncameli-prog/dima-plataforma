-- Função para criar usuário no Supabase Auth diretamente do frontend
-- Execute este SQL no painel do Supabase > SQL Editor

CREATE OR REPLACE FUNCTION public.fn_criar_usuario(
  p_email    TEXT,
  p_senha    TEXT,
  p_nome     TEXT,
  p_perfil   TEXT DEFAULT 'visualizador',
  p_telefone TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id  UUID;
  v_existing UUID;
BEGIN
  -- Apenas super_admin e admin_sema podem criar usuários
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid()
      AND perfil IN ('super_admin','admin_sema')
      AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem criar usuários';
  END IF;

  -- Verificar se e-mail já existe
  SELECT id INTO v_existing FROM auth.users WHERE email = p_email LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'E-mail já cadastrado';
  END IF;

  v_user_id := gen_random_uuid();

  -- Criar usuário no auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role,
    aud
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_senha, gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome_completo', p_nome),
    false,
    'authenticated',
    'authenticated'
  );

  -- Criar identidade de e-mail
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    p_email,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true, 'provider_id', p_email),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  -- Inserir/atualizar tabela pública de usuários
  INSERT INTO public.usuarios (
    id, nome_completo, email, perfil, telefone,
    ativo, deve_trocar_senha, senha_temporaria_usada,
    criado_em, atualizado_em
  ) VALUES (
    v_user_id, p_nome, p_email, p_perfil, p_telefone,
    true, true, false,
    NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    nome_completo = EXCLUDED.nome_completo,
    perfil        = EXCLUDED.perfil,
    telefone      = EXCLUDED.telefone,
    deve_trocar_senha = true;

  RETURN json_build_object('id', v_user_id, 'email', p_email);
END;
$$;

-- Garantir que apenas usuários autenticados podem chamar a função
REVOKE ALL ON FUNCTION public.fn_criar_usuario FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_criar_usuario TO authenticated;
