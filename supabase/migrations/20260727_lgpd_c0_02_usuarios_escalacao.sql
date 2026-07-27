-- ═══════════════════════════════════════════════════════════════════════════
-- LGPD · Camada 0 (Contenção) · 02 — Escalação de privilégio em `usuarios`
--
-- CONTEXTO
-- A tabela `usuarios` tinha duas policies permissivas sem predicado:
--
--   usuarios_update → TO authenticated, USING true, WITH CHECK true
--   usuarios_insert → TO authenticated, WITH CHECK true
--
-- Policies permissivas somam-se por OR, então as versões restritivas
-- (`usuarios_update_admin_ou_proprio`, `usuarios_insert_admin`) não protegiam
-- nada. Qualquer usuário autenticado — inclusive `visualizador` e
-- `consultor_externo` — podia executar:
--
--   update usuarios set perfil = 'super_admin' where id = auth.uid();
--
-- e assumir controle total da plataforma, incluindo os dados pessoais de
-- beneficiários (CPF, passaporte, dados bancários).
--
-- ESTRATÉGIA
-- 1. Remover as policies sem predicado.
-- 2. Defesa em profundidade: trigger que barra alteração de `perfil` e
--    `ativo` mesmo que uma policy volte a ser afrouxada no futuro.
--
-- NOTA: `usuarios_select` (USING true) é mantida deliberadamente — 6 pontos do
-- frontend fazem `select('*')` para montar listas de responsáveis. Substituí-la
-- por uma view de diretório (sem telefone/e-mail para perfis não-gestores)
-- está previsto na Camada 1.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Remove as policies sem predicado ───────────────────────────────────
drop policy if exists usuarios_update on public.usuarios;
drop policy if exists usuarios_insert on public.usuarios;

-- ── 2. Trigger de proteção de campos sensíveis ────────────────────────────
create or replace function public.fn_protege_campos_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfil_usuario;
begin
  -- Sem JWT (service_role / Edge Function / migração) não há restrição:
  -- é o caminho usado por fn_criar_usuario e pelos jobs administrativos.
  if auth.uid() is null then
    return new;
  end if;

  select perfil into v_perfil from public.usuarios where id = auth.uid();

  if new.perfil is distinct from old.perfil and v_perfil is distinct from 'super_admin' then
    raise exception 'Alteração de perfil é restrita a super_admin'
      using errcode = '42501';
  end if;

  if new.ativo is distinct from old.ativo
     and (v_perfil is null or v_perfil not in ('super_admin','coordenacao')) then
    raise exception 'Alteração de status de usuário é restrita a super_admin ou coordenação'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protege_campos_usuario on public.usuarios;
create trigger trg_protege_campos_usuario
  before update on public.usuarios
  for each row execute function public.fn_protege_campos_usuario();

comment on function public.fn_protege_campos_usuario() is
  'Impede auto-promoção de perfil e ativação/desativação indevida de usuários. '
  'Defesa em profundidade sobre as policies de RLS de public.usuarios.';
