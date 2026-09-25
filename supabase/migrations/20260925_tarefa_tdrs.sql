-- ════════════════════════════════════════════════════════════════════════
-- Tarefa ↔ TDR (N:N). Uma tarefa pode ter vários TDRs vinculados, todos da
-- atividade da tarefa. Opcional.
--  • leitura: quem vê a tarefa (o conteúdo do TDR continua sob o RLS de tdrs —
--    quem não vê o TDR enxerga só "TDR vinculado (acesso restrito)")
--  • escrita: quem edita a tarefa, e só com TDR que o próprio usuário enxerga
--  • trocar a atividade da tarefa desfaz os vínculos de TDRs de outra atividade
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.tarefa_tdrs (
  id         uuid primary key default gen_random_uuid(),
  tarefa_id  uuid not null references public.tarefas(id) on delete cascade,
  tdr_id     uuid not null references public.tdrs(id) on delete cascade,
  criado_por uuid references public.usuarios(id) default auth.uid(),
  criado_em  timestamptz default now(),
  unique (tarefa_id, tdr_id)
);
create index if not exists idx_tarefa_tdrs_tdr on public.tarefa_tdrs(tdr_id);

-- Coerência: TDR precisa ser da atividade da tarefa e visível para quem vincula.
-- SECURITY INVOKER de propósito: o select em tdrs passa pelo RLS do usuário.
create or replace function fn_tarefa_tdr_coerente() returns trigger
language plpgsql set search_path = public as $$
declare v_atv_tarefa uuid; v_atv_tdr uuid;
begin
  select atividade_id into v_atv_tarefa from tarefas where id = new.tarefa_id;
  select atividade_id into v_atv_tdr from tdrs where id = new.tdr_id;
  if v_atv_tdr is null then raise exception 'TDR não encontrado'; end if;
  if v_atv_tarefa is null or v_atv_tarefa <> v_atv_tdr then
    raise exception 'o TDR precisa ser da atividade vinculada à tarefa';
  end if;
  return new;
end $$;
drop trigger if exists trg_tarefa_tdr_coerente on public.tarefa_tdrs;
create trigger trg_tarefa_tdr_coerente before insert or update on public.tarefa_tdrs
  for each row execute function fn_tarefa_tdr_coerente();

-- Trocar/remover a atividade da tarefa → remove vínculos de TDRs que não são dela
create or replace function fn_tarefa_atividade_limpa_tdrs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.atividade_id is not distinct from old.atividade_id then return new; end if;
  delete from tarefa_tdrs tt using tdrs d
  where tt.tarefa_id = new.id and d.id = tt.tdr_id
    and d.atividade_id is distinct from new.atividade_id;
  return new;
end $$;
revoke execute on function fn_tarefa_atividade_limpa_tdrs() from public, authenticated, anon;
drop trigger if exists trg_tarefa_atividade_limpa_tdrs on public.tarefas;
create trigger trg_tarefa_atividade_limpa_tdrs after update of atividade_id on public.tarefas
  for each row execute function fn_tarefa_atividade_limpa_tdrs();

-- Histórico
create or replace function fn_tarefa_tdr_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_num text; v_tarefa uuid := coalesce(new.tarefa_id, old.tarefa_id);
begin
  select numero into v_num from tdrs where id = coalesce(new.tdr_id, old.tdr_id);
  -- tarefa apagada em cascata: não registra
  if not exists (select 1 from tarefas where id = v_tarefa) then return null; end if;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (v_tarefa, auth.uid(), case when tg_op = 'INSERT' then 'tdr_vinculo' else 'tdr_desvinculo' end,
          coalesce(v_num, 'TDR'));
  return null;
end $$;
revoke execute on function fn_tarefa_tdr_historico() from public, authenticated, anon;
drop trigger if exists trg_tarefa_tdr_historico on public.tarefa_tdrs;
create trigger trg_tarefa_tdr_historico after insert or delete on public.tarefa_tdrs
  for each row execute function fn_tarefa_tdr_historico();

-- RLS
alter table public.tarefa_tdrs enable row level security;
drop policy if exists ttdr_select on public.tarefa_tdrs;
create policy ttdr_select on public.tarefa_tdrs for select to authenticated
  using (fn_pode_ver_tarefa(tarefa_id));
drop policy if exists ttdr_insert on public.tarefa_tdrs;
create policy ttdr_insert on public.tarefa_tdrs for insert to authenticated
  with check (fn_tarefa_pode_editar(tarefa_id));
drop policy if exists ttdr_delete on public.tarefa_tdrs;
create policy ttdr_delete on public.tarefa_tdrs for delete to authenticated
  using (fn_tarefa_pode_editar(tarefa_id));

grant select, insert, delete on public.tarefa_tdrs to authenticated;
