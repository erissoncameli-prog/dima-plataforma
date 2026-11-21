-- Reserva de passagens e diárias (TDR execucao_direta): só super_admin cria e ela já nasce aprovada,
-- sem o fluxo de revisão/UNESCO. A trava de saldo livre (trg_tdr_saldo) continua valendo.
create or replace function public.fn_trg_tdr_guarda_direta()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.execucao_direta, false) then
      if auth.uid() is not null and not exists (select 1 from public.usuarios where id = auth.uid() and ativo and perfil = 'super_admin') then
        raise exception 'TDR_DIRETA_SO_SUPER_ADMIN: só super_admin cria reserva para passagens e diárias';
      end if;
      new.status := 'aprovado';
    end if;
  elsif coalesce(new.execucao_direta, false) is distinct from coalesce(old.execucao_direta, false)
        and auth.uid() is not null
        and not exists (select 1 from public.usuarios where id = auth.uid() and ativo and perfil = 'super_admin') then
    raise exception 'TDR_DIRETA_SO_SUPER_ADMIN: só super_admin marca ou desmarca a reserva para passagens e diárias';
  end if;
  return new;
end $$;
revoke execute on function public.fn_trg_tdr_guarda_direta() from public, anon, authenticated;

create or replace function public.fn_trg_tdr_direta_registro()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(new.execucao_direta, false) and auth.uid() is not null then
    insert into public.tdr_acoes(tdr_id, usuario_id, acao, comentario)
      values (new.id, auth.uid(), 'aprovado_final', 'Reserva para passagens e diárias criada pelo super_admin: aprovada na criação, sem o fluxo de revisão.');
  end if;
  return new;
end $$;
revoke execute on function public.fn_trg_tdr_direta_registro() from public, anon, authenticated;
create or replace trigger trg_tdr_direta_registro after insert on public.tdrs
  for each row execute function public.fn_trg_tdr_direta_registro();
