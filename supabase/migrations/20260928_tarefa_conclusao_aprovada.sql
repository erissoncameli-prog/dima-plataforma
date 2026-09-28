-- ════════════════════════════════════════════════════════════════════════
-- Conclusão com checagem e aprovação do criador.
--
--  • Quem aprova, conclui e reabre é o CRIADOR da tarefa. Se o criador não
--    estiver mais ativo, o super_admin assume (evita tarefa presa).
--  • Responsável não conclui: "Enviar para revisão" (status em_revisao) com
--    nota de entrega obrigatória. O criador aprova (conclui) ou devolve (motivo
--    obrigatório). Tarefa pessoal (criador é o único responsável) conclui direto.
--  • Checagens para enviar e para concluir: todas as subtarefas concluídas e
--    nota de entrega/conclusão (vira comentário, e os anexos enviados junto
--    ficam ligados a ele por comentario_id). Aprovar uma entrega já enviada
--    não exige nota nova (a entrega já trouxe).
--  • Reabrir tarefa concluída: só o criador, com motivo.
--  • Regra no banco: o status só muda por fn_mudar_status_tarefa. UPDATE direto
--    de status por usuário logado é recusado (trigger trg_tarefa_guarda_status).
-- ════════════════════════════════════════════════════════════════════════

-- Sino: novos avisos
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo::text = any (array[
  'tdr_para_revisar','tdr_devolvido','tdr_aprovado','tdr_enviado_unesco',
  'produto_para_avaliar','produto_aprovado','produto_devolvido','produto_aguarda_pagamento',
  'atividade_sem_responsavel','substituto_designado','desempate_necessario',
  'viagem_solicitada','viagem_aprovada','viagem_rejeitada','viagem_prestacao',
  'reset_senha_solicitado','reset_senha_atendido',
  'tarefa_atribuida','tarefa_prazo','tarefa_concluida','tarefa_comentario','tarefa_observador','tarefa_subtarefa',
  'tarefa_revisao','tarefa_devolvida','tarefa_reaberta']::text[]));

-- Quem aprova/conclui/reabre: o criador; super_admin só se o criador saiu.
create or replace function fn_tarefa_aprovador(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tarefas t
    left join usuarios u on u.id = t.criado_por
    where t.id = p_id
      and ( t.criado_por = auth.uid()
         or (fn_perfil_atual() = 'super_admin' and (u.id is null or not coalesce(u.ativo, false))) )
  );
$$;
revoke execute on function fn_tarefa_aprovador(uuid) from public, anon;
grant  execute on function fn_tarefa_aprovador(uuid) to authenticated;

-- Tarefa pessoal: não há responsável além do criador.
create or replace function fn_tarefa_pessoal(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from tarefa_participantes tp join tarefas t on t.id = tp.tarefa_id
    where tp.tarefa_id = p_id and tp.papel = 'responsavel' and tp.usuario_id <> t.criado_por
  );
$$;
revoke execute on function fn_tarefa_pessoal(uuid) from public, anon;
grant  execute on function fn_tarefa_pessoal(uuid) to authenticated;

-- Status só muda pela RPC (que marca a transação). service_role/SQL passam.
create or replace function fn_tarefa_guarda_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status
     and auth.uid() is not null
     and coalesce(current_setting('dima.tarefa_status_rpc', true), '') <> '1' then
    raise exception 'O status da tarefa só muda pelo painel (fn_mudar_status_tarefa).';
  end if;
  return new;
end $$;
drop trigger if exists trg_tarefa_guarda_status on public.tarefas;
create trigger trg_tarefa_guarda_status before update of status on public.tarefas
  for each row execute function fn_tarefa_guarda_status();

-- Nova assinatura: nota/motivo e retorno do comentário criado (para anexos).
drop function if exists fn_mudar_status_tarefa(uuid, status_tarefa);
create or replace function fn_mudar_status_tarefa(p_tarefa_id uuid, p_status status_tarefa, p_nota text default null)
returns uuid language plpgsql security definer set search_path = public as $$
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

  -- nota/motivo vira comentário (os anexos da entrega se ligam a ele)
  if v_nota is not null and v_prefixo is not null then
    insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem)
    values (p_tarefa_id, v_caller, v_prefixo || ': ' || v_nota, 'painel')
    returning id into v_coment;
  end if;

  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para, motivo)
  values (p_tarefa_id, v_caller, v_tipo, v_de::text, p_status::text, v_nota);

  if p_status = 'concluida' then
    -- criador + observadores + responsáveis (menos quem concluiu)
    select array_agg(uid) into v_alvo from (
      select v_t.criado_por uid
      union select usuario_id from tarefa_participantes where tarefa_id = p_tarefa_id
    ) s;
    perform fn_tarefa_notificar(v_alvo, 'tarefa_concluida',
      'Tarefa concluída: ' || coalesce(v_t.codigo,''), coalesce(v_t.titulo,''), p_tarefa_id, v_caller);
  elsif v_tipo = 'envio_revisao' then
    perform fn_tarefa_notificar(array[v_t.criado_por], 'tarefa_revisao',
      'Aguardando sua aprovação: ' || coalesce(v_t.codigo,''), left(v_nota, 120), p_tarefa_id, v_caller);
  elsif v_tipo in ('devolucao', 'reabertura') then
    select array_agg(usuario_id) into v_alvo from tarefa_participantes
    where tarefa_id = p_tarefa_id and papel = 'responsavel';
    perform fn_tarefa_notificar(v_alvo,
      case when v_tipo = 'devolucao' then 'tarefa_devolvida' else 'tarefa_reaberta' end,
      (case when v_tipo = 'devolucao' then 'Entrega devolvida: ' else 'Tarefa reaberta: ' end) || coalesce(v_t.codigo,''),
      left(v_nota, 120), p_tarefa_id, v_caller);
  end if;

  return v_coment;
end $$;
revoke execute on function fn_mudar_status_tarefa(uuid, status_tarefa, text) from public, anon;
grant  execute on function fn_mudar_status_tarefa(uuid, status_tarefa, text) to authenticated;
