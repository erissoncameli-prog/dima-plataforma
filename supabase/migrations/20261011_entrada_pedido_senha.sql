-- Tela de entrada: "Esqueceu a senha?" sem estar logado.
-- A pessoa informa o e-mail; se for de uma conta ATIVA e sem pedido pendente, nasce um pedido em
-- solicitacoes_senha (o trigger trg_notif_sol_senha avisa os super_admin no sino) e o administrador
-- define uma senha temporária pela tela de Usuários. Nada é trocado nem enviado automaticamente.
-- Resposta é SEMPRE a mesma (não revela se o e-mail existe, se a conta está ativa ou se já havia pedido).
-- Limites: um pedido pendente por conta; no máximo 30 pedidos sem login por hora (acima disso, ignora calado).
create or replace function public.fn_publico_pedir_nova_senha(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_uid uuid;
begin
  if length(v_email) between 3 and 254 and v_email like '%_@_%' then
    if (select count(*) from solicitacoes_senha
         where motivo = 'Pedido na tela de entrada (sem login)' and criado_em > now() - interval '1 hour') < 30 then
      select u.id into v_uid from usuarios u where lower(u.email) = v_email and u.ativo limit 1;
      if v_uid is not null and not exists (
           select 1 from solicitacoes_senha s where s.usuario_id = v_uid and s.status = 'pendente') then
        insert into solicitacoes_senha (usuario_id, status, motivo)
        values (v_uid, 'pendente', 'Pedido na tela de entrada (sem login)');
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_publico_pedir_nova_senha(text) from public;
grant execute on function public.fn_publico_pedir_nova_senha(text) to anon, authenticated;

-- As policies da tabela eram TO public e checavam super_admin sem olhar se a conta está ativa.
alter policy sol_ins on public.solicitacoes_senha to authenticated with check (usuario_id = auth.uid());
alter policy sol_sel on public.solicitacoes_senha to authenticated
  using (usuario_id = auth.uid() or fn_perfil_atual() = 'super_admin');
alter policy sol_upd on public.solicitacoes_senha to authenticated
  using (fn_perfil_atual() = 'super_admin');
