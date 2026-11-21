-- Tarefas: e-mail sem duplicação, responsável de subtarefa sem bloqueio e menos avisos.
--
-- 1) tarefa_email_recebidos — trava por mensagem do Gmail. Na reunião da TR-051 (10/11/2026)
--    o Pub/Sub mandou vários avisos ao mesmo tempo e a receber-email-tarefa rodou 6 vezes em
--    paralelo a partir da mesma baseline: cada "Ciente" virou 2 a 4 comentários (142 sinos).
--    A Edge Function "reserva" a mensagem aqui antes de comentar; quem perde a corrida pula.
-- 2) fn_tarefa_alvo_comentario — quem é avisado de comentário (fonte única, usada também pela
--    enviar-email-tarefa): criador + responsáveis enquanto a tarefa está com eles (não em
--    revisão/concluída/cancelada) + responsável de subtarefa ainda pendente (ou da subtarefa
--    comentada). Observador NÃO recebe comentário — só início, envio para revisão e conclusão.
-- 3) Envio para revisão avisa também os observadores (sino).
-- 4) Responsável de subtarefa (usuário) entra como observador e por isso não editava nada:
--    fn_subtarefa_concluir / fn_comentar_subtarefa + policy de anexo da própria subtarefa.

-- ── 1) trava por mensagem ───────────────────────────────────────────────
create table if not exists public.tarefa_email_recebidos (
  gmail_message_id text primary key,
  tarefa_id        uuid references public.tarefas(id),
  checklist_id     uuid,
  comentario_id    uuid,
  criado_em        timestamptz not null default now()
);
alter table public.tarefa_email_recebidos enable row level security;
revoke all on public.tarefa_email_recebidos from public, anon, authenticated;
comment on table public.tarefa_email_recebidos is
  'Mensagens do Gmail já transformadas em comentário de tarefa (idempotência da receber-email-tarefa). Só service_role.';

-- ── 2) quem recebe aviso de comentário ──────────────────────────────────
create or replace function public.fn_tarefa_alvo_comentario(p_tarefa_id uuid, p_checklist_id uuid default null)
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(distinct uid) filter (where uid is not null), '{}'::uuid[]) from (
    select t.criado_por uid from tarefas t where t.id = p_tarefa_id
    union
    select tp.usuario_id from tarefa_participantes tp join tarefas t on t.id = tp.tarefa_id
     where tp.tarefa_id = p_tarefa_id and tp.papel = 'responsavel'
       and t.status in ('a_fazer', 'em_andamento', 'bloqueada')
    union
    select k.responsavel_usuario_id from tarefa_checklist k
     where k.tarefa_id = p_tarefa_id and (not k.concluida or k.id = p_checklist_id)
  ) s;
$$;
revoke execute on function public.fn_tarefa_alvo_comentario(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_tarefa_alvo_comentario(uuid, uuid) to service_role;

create or replace function public.fn_comentar_tarefa(p_tarefa_id uuid, p_corpo text)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid; v_cod text; v_caller uuid := auth.uid();
begin
  if not fn_pode_ver_tarefa(p_tarefa_id) then
    raise exception 'sem acesso a esta tarefa';
  end if;
  if coalesce(btrim(p_corpo),'') = '' then raise exception 'comentário vazio'; end if;

  insert into tarefa_comentarios (tarefa_id, autor_id, corpo)
  values (p_tarefa_id, v_caller, btrim(p_corpo)) returning id into v_id;

  select codigo into v_cod from tarefas where id = p_tarefa_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (p_tarefa_id, v_caller, 'comentario', left(btrim(p_corpo), 80));

  perform fn_tarefa_notificar(fn_tarefa_alvo_comentario(p_tarefa_id, null), 'tarefa_comentario',
    'Novo comentário: ' || coalesce(v_cod,''), left(btrim(p_corpo), 120), p_tarefa_id, v_caller);

  return v_id;
end $function$;

create or replace function public.fn_comentar_tarefa_sistema(p_tarefa_id uuid, p_autor_id uuid, p_corpo text, p_origem text default 'email'::text, p_checklist_id uuid default null::uuid)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid; v_cod text;
begin
  if coalesce(btrim(p_corpo),'') = '' then raise exception 'comentário vazio'; end if;
  if p_autor_id is null then raise exception 'autor obrigatório'; end if;

  insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem, checklist_id)
  values (p_tarefa_id, p_autor_id, btrim(p_corpo), coalesce(p_origem,'email'), p_checklist_id)
  returning id into v_id;

  select codigo into v_cod from tarefas where id = p_tarefa_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (p_tarefa_id, p_autor_id, 'comentario', left(btrim(p_corpo), 80));

  perform fn_tarefa_notificar(fn_tarefa_alvo_comentario(p_tarefa_id, p_checklist_id), 'tarefa_comentario',
    'Novo comentário: ' || coalesce(v_cod,''), left(btrim(p_corpo), 120), p_tarefa_id, p_autor_id);

  return v_id;
end $function$;

create or replace function public.fn_comentar_tarefa_fornecedor(p_tarefa_id uuid, p_fornecedor_id uuid, p_corpo text, p_checklist_id uuid default null::uuid)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid; v_cod text; v_nome text;
begin
  if coalesce(btrim(p_corpo),'') = '' then raise exception 'comentário vazio'; end if;
  if p_fornecedor_id is null then raise exception 'fornecedor obrigatório'; end if;

  insert into tarefa_comentarios (tarefa_id, autor_id, autor_fornecedor_id, corpo, origem, checklist_id)
  values (p_tarefa_id, null, p_fornecedor_id, btrim(p_corpo), 'email', p_checklist_id)
  returning id into v_id;

  select codigo into v_cod from tarefas where id = p_tarefa_id;
  select nome into v_nome from fornecedores where id = p_fornecedor_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (p_tarefa_id, null, 'comentario_fornecedor',
          coalesce(v_nome,'Fornecedor') || ': ' || left(btrim(p_corpo), 60));

  perform fn_tarefa_notificar(fn_tarefa_alvo_comentario(p_tarefa_id, p_checklist_id), 'tarefa_comentario',
    'Resposta do fornecedor: ' || coalesce(v_cod,''),
    coalesce(v_nome,'') || ' — ' || left(btrim(p_corpo), 100), p_tarefa_id, null);

  return v_id;
end $function$;

-- ── 3) envio para revisão avisa os observadores ─────────────────────────
create or replace function public.fn_mudar_status_tarefa(p_tarefa_id uuid, p_status status_tarefa, p_nota text default null::text)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_caller  uuid := auth.uid();
  v_t       tarefas%rowtype;
  v_de      status_tarefa;
  v_nota    text := nullif(btrim(coalesce(p_nota, '')), '');
  v_aprov   boolean;
  v_pend    int;
  v_tipo    text;
  v_prefixo text;
  v_coment  uuid;
  v_alvo    uuid[];
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão para alterar esta tarefa';
  end if;
  select * into v_t from tarefas where id = p_tarefa_id;
  if v_t.id is null then raise exception 'tarefa não encontrada'; end if;
  v_de := v_t.status;
  if v_de = p_status then return null; end if;

  v_aprov := fn_tarefa_aprovador(p_tarefa_id);
  select count(*) into v_pend from tarefa_checklist where tarefa_id = p_tarefa_id and not concluida;

  if p_status = 'concluida' then
    if not v_aprov then
      raise exception 'Só quem criou a tarefa conclui. Use "Enviar para revisão".';
    end if;
    if v_pend > 0 then
      raise exception 'Há % subtarefa(s) pendente(s). Conclua-as antes de concluir a tarefa.', v_pend;
    end if;
    if v_de = 'em_revisao' then
      v_tipo := 'aprovacao'; v_prefixo := 'Entrega aprovada';
    else
      if v_nota is null then raise exception 'Descreva o que foi feito para concluir a tarefa.'; end if;
      v_tipo := 'conclusao'; v_prefixo := 'Conclusão';
    end if;

  elsif p_status = 'em_revisao' then
    if v_de = 'concluida' then raise exception 'Reabra a tarefa antes de enviá-la para revisão.'; end if;
    if v_pend > 0 then
      raise exception 'Há % subtarefa(s) pendente(s). Conclua-as antes de enviar para revisão.', v_pend;
    end if;
    if v_nota is null then raise exception 'Descreva a entrega: o que foi feito e onde está a evidência.'; end if;
    v_tipo := 'envio_revisao'; v_prefixo := 'Entrega para revisão';

  elsif v_de = 'concluida' then
    if not v_aprov then raise exception 'Só quem criou a tarefa pode reabri-la.'; end if;
    if v_nota is null then raise exception 'Informe o motivo da reabertura.'; end if;
    v_tipo := 'reabertura'; v_prefixo := 'Reaberta';

  elsif v_de = 'em_revisao' and p_status <> 'cancelada' and v_aprov then
    if v_nota is null then raise exception 'Informe o motivo da devolução.'; end if;
    v_tipo := 'devolucao'; v_prefixo := 'Devolvida';

  else
    v_tipo := 'status'; v_prefixo := null;
  end if;

  perform set_config('dima.tarefa_status_rpc', '1', true);
  update tarefas set status = p_status,
    dt_conclusao = case when p_status = 'concluida' then now() else null end
  where id = p_tarefa_id;
  perform set_config('dima.tarefa_status_rpc', '', true);

  if v_nota is not null and v_prefixo is not null then
    insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem)
    values (p_tarefa_id, v_caller, v_prefixo || ': ' || v_nota, 'painel')
    returning id into v_coment;
  end if;

  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para, motivo)
  values (p_tarefa_id, v_caller, v_tipo, v_de::text, p_status::text, v_nota);

  if p_status = 'concluida' then
    select array_agg(uid) into v_alvo from (
      select v_t.criado_por uid
      union select usuario_id from tarefa_participantes where tarefa_id = p_tarefa_id
    ) s;
    perform fn_tarefa_notificar(v_alvo, 'tarefa_concluida',
      'Tarefa concluída: ' || coalesce(v_t.codigo,''), coalesce(v_t.titulo,''), p_tarefa_id, v_caller);
  elsif v_tipo = 'envio_revisao' then
    perform fn_tarefa_notificar(array[v_t.criado_por], 'tarefa_revisao',
      'Aguardando sua aprovação: ' || coalesce(v_t.codigo,''), left(v_nota, 120), p_tarefa_id, v_caller);
    -- observadores acompanham: avisados do envio para revisão (sem nada a fazer)
    select array_agg(usuario_id) into v_alvo from tarefa_participantes
     where tarefa_id = p_tarefa_id and papel = 'observador' and usuario_id is distinct from v_t.criado_por;
    perform fn_tarefa_notificar(v_alvo, 'tarefa_revisao',
      'Enviada para revisão: ' || coalesce(v_t.codigo,''),
      'Você é observador(a): só acompanha, não precisa fazer nada. ' || coalesce(v_t.titulo,''), p_tarefa_id, v_caller);
  elsif v_tipo in ('devolucao', 'reabertura') then
    select array_agg(usuario_id) into v_alvo from tarefa_participantes
    where tarefa_id = p_tarefa_id and papel = 'responsavel';
    perform fn_tarefa_notificar(v_alvo,
      case when v_tipo = 'devolucao' then 'tarefa_devolvida' else 'tarefa_reaberta' end,
      (case when v_tipo = 'devolucao' then 'Entrega devolvida: ' else 'Tarefa reaberta: ' end) || coalesce(v_t.codigo,''),
      left(v_nota, 120), p_tarefa_id, v_caller);
  end if;

  return v_coment;
end $function$;

-- ── 4) responsável de subtarefa ─────────────────────────────────────────
create or replace function public.fn_subtarefa_concluir(p_checklist_id uuid, p_concluida boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare v_k tarefa_checklist%rowtype; v_t tarefas%rowtype; v_caller uuid := auth.uid(); v_alvo uuid[];
begin
  select * into v_k from tarefa_checklist where id = p_checklist_id;
  if v_k.id is null then raise exception 'subtarefa não encontrada'; end if;
  if not (coalesce(v_k.responsavel_usuario_id = v_caller, false) or fn_tarefa_pode_editar(v_k.tarefa_id)) then
    raise exception 'Só o responsável pela subtarefa (ou quem edita a tarefa) pode concluí-la.';
  end if;
  select * into v_t from tarefas where id = v_k.tarefa_id;
  if v_t.status in ('concluida', 'cancelada') then
    raise exception 'A tarefa já está encerrada.';
  end if;
  if v_k.concluida = coalesce(p_concluida, false) then return; end if;

  update tarefa_checklist set concluida = p_concluida,
    concluida_por = case when p_concluida then v_caller end,
    concluida_em  = case when p_concluida then now() end
  where id = p_checklist_id;

  select array_agg(distinct uid) into v_alvo from (
    select v_t.criado_por uid
    union select usuario_id from tarefa_participantes where tarefa_id = v_t.id and papel = 'responsavel'
  ) s;
  perform fn_tarefa_notificar(v_alvo, 'tarefa_subtarefa',
    (case when p_concluida then 'Subtarefa concluída: ' else 'Subtarefa reaberta: ' end) || coalesce(v_t.codigo,''),
    left(v_k.descricao, 120), v_t.id, v_caller);
end $$;
revoke execute on function public.fn_subtarefa_concluir(uuid, boolean) from public, anon;
grant execute on function public.fn_subtarefa_concluir(uuid, boolean) to authenticated;

create or replace function public.fn_comentar_subtarefa(p_checklist_id uuid, p_corpo text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_k tarefa_checklist%rowtype; v_caller uuid := auth.uid();
begin
  select * into v_k from tarefa_checklist where id = p_checklist_id;
  if v_k.id is null then raise exception 'subtarefa não encontrada'; end if;
  if not (coalesce(v_k.responsavel_usuario_id = v_caller, false) or fn_pode_ver_tarefa(v_k.tarefa_id)) then
    raise exception 'sem acesso a esta tarefa';
  end if;
  return fn_comentar_tarefa_sistema(v_k.tarefa_id, v_caller, p_corpo, 'painel', p_checklist_id);
end $$;
revoke execute on function public.fn_comentar_subtarefa(uuid, text) from public, anon;
grant execute on function public.fn_comentar_subtarefa(uuid, text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tarefa_anexos'
                 and policyname = 'anexo_insert_subtarefa') then
    create policy anexo_insert_subtarefa on public.tarefa_anexos for insert to authenticated
      with check (enviado_por = auth.uid() and checklist_id is not null and exists (
        select 1 from public.tarefa_checklist k
         where k.id = tarefa_anexos.checklist_id and k.tarefa_id = tarefa_anexos.tarefa_id
           and k.responsavel_usuario_id = auth.uid()));
  end if;
end $$;
