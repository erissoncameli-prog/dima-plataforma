-- Fonte da viagem por protocolo: cada atividade pode reservar um valor para passagens e diárias
-- num TDR de execução direta (criado e aprovado pelo fluxo normal do TDR, que já recusa linha sem
-- saldo livre — fn_cob_livre). O protocolo escolhe a reserva; o lançamento do viajante usa ela.
alter table public.viagem_protocolos add column if not exists tdr_id uuid references public.tdrs(id);
update public.viagem_protocolos p set tdr_id = public.fn_viagem_tdr(p.atividade_id) where p.tdr_id is null;

create or replace function public.fn_trg_viagem_fonte()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare t record;
begin
  if new.tdr_id is null then
    new.tdr_id := public.fn_viagem_tdr(coalesce(new.atividade_id, '44b7a6fc-dab6-49ba-bc1f-9764a99bb9d0'));
  end if;
  if new.tdr_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.tdr_id is not distinct from old.tdr_id then return new; end if;
  select id, atividade_id, execucao_direta, status into t from public.tdrs where id = new.tdr_id;
  if not found or not t.execucao_direta then
    raise exception 'VIAGEM_FONTE_INVALIDA: a fonte precisa ser um TDR de reserva para passagens e diárias';
  end if;
  if t.status not in ('aprovado','em_licitacao','contratado') then
    raise exception 'VIAGEM_FONTE_NAO_APROVADA: a reserva escolhida ainda não foi aprovada';
  end if;
  if tg_op = 'UPDATE' and old.situacao not in ('rascunho','solicitado')
     and coalesce(current_setting('dima.viagem', true), '') <> 'fonte' then
    raise exception 'VIAGEM_FONTE_TRAVADA: a fonte só muda enquanto o protocolo está em rascunho ou aguardando aprovação';
  end if;
  new.atividade_id := t.atividade_id;
  return new;
end $$;
revoke execute on function public.fn_trg_viagem_fonte() from public, anon, authenticated;
create or replace trigger trg_viagem_fonte before insert or update of tdr_id, atividade_id on public.viagem_protocolos
  for each row execute function public.fn_trg_viagem_fonte();

-- lançamento do viajante: TDR do protocolo
create or replace function public.fn_trg_viagem_lanc_tdr()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_tdr uuid; v_ativ uuid;
begin
  if new.lancamento_id is null or new.lancamento_id is not distinct from old.lancamento_id then return new; end if;
  select coalesce(p.tdr_id, public.fn_viagem_tdr(p.atividade_id)), p.atividade_id into v_tdr, v_ativ
    from public.viagem_protocolos p where p.id = new.protocolo_id;
  if v_tdr is not null then
    update public.execucao_financeira set tdr_id = v_tdr, atividade_id = coalesce(v_ativ, atividade_id)
     where id = new.lancamento_id and tdr_id is null;
  end if;
  return new;
end $$;
revoke execute on function public.fn_trg_viagem_lanc_tdr() from public, anon, authenticated;

-- só super_admin/coordenação marcam um TDR como reserva de viagens
create or replace function public.fn_trg_tdr_guarda_direta()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(new.execucao_direta, false) is distinct from (case when tg_op='UPDATE' then coalesce(old.execucao_direta,false) else false end)
     and auth.uid() is not null and coalesce(public.fn_perfil_atual()::text, '') not in ('super_admin','coordenacao') then
    raise exception 'TDR_DIRETA_SO_COORDENACAO: só super_admin ou coordenação criam reserva para passagens e diárias';
  end if;
  return new;
end $$;
revoke execute on function public.fn_trg_tdr_guarda_direta() from public, anon, authenticated;
create or replace trigger trg_tdr_guarda_direta before insert or update of execucao_direta on public.tdrs
  for each row execute function public.fn_trg_tdr_guarda_direta();

-- trocar a fonte de protocolo aprovado (ex.: UNESCO emitiu por outra linha), sem nada pago
create or replace function public.fn_viagem_trocar_fonte(p_protocolo uuid, p_tdr uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_ativ uuid; n int;
begin
  if not exists (select 1 from public.usuarios where id = auth.uid() and ativo and perfil = 'super_admin') then
    raise exception 'Só super_admin troca a fonte de um protocolo já decidido';
  end if;
  if length(btrim(coalesce(p_motivo,''))) < 20 then raise exception 'Informe o motivo (mínimo 20 caracteres)'; end if;
  if exists (select 1 from public.viagem_viajantes v join public.execucao_financeira e on e.id = v.lancamento_id
              where v.protocolo_id = p_protocolo and e.situacao = 'pago') then
    raise exception 'VIAGEM_FONTE_PAGO: já há pagamento; a troca de fonte exige estorno no Financeiro';
  end if;
  perform set_config('dima.viagem', 'fonte', true);
  update public.viagem_protocolos set tdr_id = p_tdr where id = p_protocolo returning atividade_id into v_ativ;
  update public.execucao_financeira e set tdr_id = p_tdr, atividade_id = v_ativ
    from public.viagem_viajantes v where v.protocolo_id = p_protocolo and e.id = v.lancamento_id and e.situacao = 'a_pagar';
  get diagnostics n = row_count;
  insert into public.tdr_acoes(tdr_id, usuario_id, acao, comentario)
    values (p_tdr, auth.uid(), 'editado', 'Fonte de viagem trocada para este TDR: ' || btrim(p_motivo));
  return jsonb_build_object('lancamentos', n);
end $$;
revoke execute on function public.fn_viagem_trocar_fonte(uuid, uuid, text) from public, anon;
grant execute on function public.fn_viagem_trocar_fonte(uuid, uuid, text) to authenticated;

-- a fonte entra no que a pessoa assina ao aprovar
do $$ declare d text; begin
  d := pg_get_functiondef('public.fn_viagem_hash(uuid)'::regprocedure);
  if position('''tdr'', p.tdr_id' in d) = 0 then
    d := replace(d, '''atividade'', p.atividade_id,', '''atividade'', p.atividade_id, ''tdr'', p.tdr_id,');
    execute d;
  end if;
end $$;
