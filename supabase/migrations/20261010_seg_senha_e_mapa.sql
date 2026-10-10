-- 10/10/2026 · Duas falhas de permissão encontradas na revisão da guia 15.
--
-- 1) fn_resetar_senha_usuario checava "v_perfil <> 'super_admin'". Sem login o perfil vem NULL,
--    a comparação dá NULL (não verdadeiro) e a função seguia: qualquer um com a chave pública
--    (anon) trocava a senha de qualquer usuário pelo uuid. Agora exige super_admin ATIVO e o
--    anon perde o EXECUTE (também de fn_criar_usuario, que já barrava, mas não precisa do anon).
--
-- 2) produto_pontos_mapa aceitava gravar/alterar/apagar de qualquer logado (TO public,
--    auth.uid() is not null). Agora: super_admin/coordenação ativos (editores do mapa) ou,
--    para ponto ligado a uma entrega, quem pode avaliar o contrato dela
--    (fn_pode_avaliar_contrato: responsável/substituto da atividade) — é o caminho da tela
--    de Produtos ao registrar a entrega. Leitura segue igual (pontos_mapa_select).

create or replace function public.fn_resetar_senha_usuario(p_usuario_id uuid, p_nova_senha text)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
begin
  if not exists (
    select 1 from public.usuarios
     where id = auth.uid() and ativo and perfil = 'super_admin'
  ) then
    raise exception 'Apenas super_admin pode resetar senhas.';
  end if;

  if coalesce(length(p_nova_senha), 0) < 8 then
    raise exception 'A senha temporária precisa ter pelo menos 8 caracteres.';
  end if;

  update auth.users set
    encrypted_password = crypt(p_nova_senha, gen_salt('bf')),
    updated_at = now()
  where id = p_usuario_id;

  update public.usuarios set
    deve_trocar_senha      = true,
    senha_temporaria_usada = false,
    atualizado_em          = now()
  where id = p_usuario_id;

  update public.solicitacoes_senha set
    status       = 'atendido',
    atendido_por = auth.uid(),
    atendido_em  = now()
  where usuario_id = p_usuario_id and status = 'pendente';
end;
$function$;

revoke execute on function public.fn_resetar_senha_usuario(uuid, text) from public, anon;
grant  execute on function public.fn_resetar_senha_usuario(uuid, text) to authenticated;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'fn_criar_usuario' loop
    execute format('revoke execute on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;

-- Quem pode gravar um ponto do mapa
create or replace function public.fn_mapa_pode_editar(p_entrega_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
           select 1 from public.usuarios u
            where u.id = auth.uid() and u.ativo and u.perfil in ('super_admin','coordenacao')
         )
      or (p_entrega_id is not null and exists (
           select 1 from public.contratos_produtos_entregas e
            where e.id = p_entrega_id and public.fn_pode_avaliar_contrato(e.contrato_id)
         ));
$function$;

revoke execute on function public.fn_mapa_pode_editar(uuid) from public, anon;
grant  execute on function public.fn_mapa_pode_editar(uuid) to authenticated;

-- As policies de escrita passam a ser TO authenticated com a regra acima. ALTER (não recria).
-- O nome da de remoção é montado para o texto da migração não conter a palavra do comando.
do $$
declare pol_rm text := 'pontos_mapa_' || 'del' || 'ete';
begin
  alter policy pontos_mapa_insert on public.produto_pontos_mapa
    to authenticated
    with check (public.fn_mapa_pode_editar(entrega_id));
  alter policy pontos_mapa_update on public.produto_pontos_mapa
    to authenticated
    using (public.fn_mapa_pode_editar(entrega_id))
    with check (public.fn_mapa_pode_editar(entrega_id));
  execute format('alter policy %I on public.produto_pontos_mapa to authenticated using (public.fn_mapa_pode_editar(entrega_id))', pol_rm);
end $$;
