-- ════════════════════════════════════════════════════════════════════════
-- Edição auditada de tarefas
--  • Todo UPDATE em tarefas (RPC ou direto) gera histórico campo a campo, com
--    antes/depois em tarefa_historico.detalhes — nada muda sem registro.
--  • Motivo da alteração (opcional; obrigatório quando o prazo muda) vai em
--    tarefa_historico.motivo, via fn_editar_tarefa(p_motivo).
--  • Trava otimista: fn_editar_tarefa(p_versao = atualizado_em lido) recusa
--    salvar por cima de uma alteração feita por outra pessoa no meio tempo.
--  • Passam a ser registrados: remoção de participante, subtarefas
--    (criar/editar/concluir/reabrir/excluir) e anexos avulsos/remoção.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tarefa_historico
  add column if not exists detalhes jsonb,
  add column if not exists motivo   text;

-- ── Formatação legível de valores ───────────────────────────────────────
create or replace function fn_hist_fmt(p_tipo text, p_valor text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_valor is null or p_valor = '' then '—'
    when p_tipo = 'date' and p_valor ~ '^\d{4}-\d{2}-\d{2}$'
      then to_char(p_valor::date, 'DD/MM/YYYY')
    when p_tipo = 'datetime' and p_valor ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
      then to_char(p_valor::date, 'DD/MM/YYYY') || ' ' || substr(p_valor, 12, 5)
    when p_tipo = 'boolean' then case when p_valor in ('true','t') then 'Sim' else 'Não' end
    when p_tipo = 'prioridade' then case p_valor
      when 'baixa' then 'Baixa' when 'media' then 'Média' when 'alta' then 'Alta' when 'urgente' then 'Urgente' else p_valor end
    else p_valor end;
$$;

-- ── Registro campo a campo de toda alteração da tarefa ──────────────────
create or replace function fn_tarefa_registra_edicao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := '[]'::jsonb;
  c jsonb;
  v_de text; v_para text;
  v_motivo text := nullif(btrim(current_setting('dima.motivo_edicao', true)), '');
begin
  -- status, tipo e restrição têm registro próprio (fn_mudar_status_tarefa,
  -- trg_tarefa_tipo_historico, trg_tarefa_guarda_restrita)
  if new.titulo is distinct from old.titulo then
    d := d || jsonb_build_object('campo','Título','de',old.titulo,'para',new.titulo);
  end if;
  if new.descricao is distinct from old.descricao then
    d := d || jsonb_build_object('campo','Descrição','de',coalesce(old.descricao,''),'para',coalesce(new.descricao,''),'longo',true);
  end if;
  if new.prioridade is distinct from old.prioridade then
    d := d || jsonb_build_object('campo','Prioridade','de',fn_hist_fmt('prioridade',old.prioridade::text),'para',fn_hist_fmt('prioridade',new.prioridade::text));
  end if;
  if new.dt_inicio is distinct from old.dt_inicio then
    d := d || jsonb_build_object('campo','Início','de',fn_hist_fmt('date',old.dt_inicio::text),'para',fn_hist_fmt('date',new.dt_inicio::text));
  end if;
  if new.dt_prazo is distinct from old.dt_prazo then
    d := d || jsonb_build_object('campo','Prazo','de',fn_hist_fmt('date',old.dt_prazo::text),'para',fn_hist_fmt('date',new.dt_prazo::text));
  end if;
  if new.atividade_id is distinct from old.atividade_id then
    select codigo into v_de   from atividades where id = old.atividade_id;
    select codigo into v_para from atividades where id = new.atividade_id;
    d := d || jsonb_build_object('campo','Atividade','de',coalesce(v_de,'—'),'para',coalesce(v_para,'—'));
  end if;
  if new.fornecedor_id is distinct from old.fornecedor_id then
    select nome into v_de   from fornecedores where id = old.fornecedor_id;
    select nome into v_para from fornecedores where id = new.fornecedor_id;
    d := d || jsonb_build_object('campo','Fornecedor','de',coalesce(v_de,'—'),'para',coalesce(v_para,'—'));
  end if;
  if new.notificar_fornecedor is distinct from old.notificar_fornecedor then
    d := d || jsonb_build_object('campo','E-mail ao fornecedor','de',fn_hist_fmt('boolean',old.notificar_fornecedor::text),'para',fn_hist_fmt('boolean',new.notificar_fornecedor::text));
  end if;
  if new.dados_tipo is distinct from old.dados_tipo then
    for c in select * from jsonb_array_elements(coalesce((select campos from tarefa_tipos where codigo = new.tipo), '[]')) loop
      v_de   := old.dados_tipo ->> (c->>'chave');
      v_para := new.dados_tipo ->> (c->>'chave');
      if v_de is distinct from v_para then
        d := d || jsonb_build_object('campo', c->>'rotulo',
               'de', fn_hist_fmt(c->>'tipo', v_de), 'para', fn_hist_fmt(c->>'tipo', v_para),
               'longo', (c->>'tipo') = 'textarea');
      end if;
    end loop;
  end if;

  if jsonb_array_length(d) = 0 then return null; end if;

  if jsonb_array_length(d) = 1 and d->0->>'campo' = 'Prazo' then
    insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para, motivo)
    values (new.id, auth.uid(), 'prazo', d->0->>'de', d->0->>'para', v_motivo);
  else
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para, detalhes, motivo)
    values (new.id, auth.uid(), 'edicao',
            jsonb_array_length(d) || case when jsonb_array_length(d) = 1 then ' campo' else ' campos' end,
            d, v_motivo);
  end if;
  return null;
end $$;
revoke execute on function fn_tarefa_registra_edicao() from public, authenticated, anon;
drop trigger if exists trg_tarefa_registra_edicao on public.tarefas;
create trigger trg_tarefa_registra_edicao after update on public.tarefas
  for each row execute function fn_tarefa_registra_edicao();

-- ── fn_editar_tarefa: prazo, motivo e trava otimista ────────────────────
drop function if exists fn_editar_tarefa(uuid,text,text,prioridade_tarefa,date,text,uuid,uuid,uuid,boolean,text,jsonb);

create or replace function fn_editar_tarefa(
  p_tarefa_id uuid, p_titulo text, p_descricao text, p_prioridade prioridade_tarefa,
  p_dt_inicio date, p_entidade_tipo text, p_entidade_id uuid, p_atividade_id uuid,
  p_fornecedor_id uuid, p_notificar_fornecedor boolean,
  p_tipo text default null, p_dados_tipo jsonb default null,
  p_mudar_prazo boolean default false, p_dt_prazo date default null,
  p_motivo text default null, p_versao timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_atual tarefas; v_nome text; v_prazo date; v_alvo uuid[];
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão para editar esta tarefa';
  end if;
  select * into v_atual from tarefas where id = p_tarefa_id for update;

  if p_versao is not null and v_atual.atualizado_em is distinct from p_versao then
    select u.nome_completo into v_nome from tarefa_historico h join usuarios u on u.id = h.autor_id
    where h.tarefa_id = p_tarefa_id order by h.criado_em desc limit 1;
    raise exception 'Esta tarefa foi alterada por % às % — feche e abra de novo antes de salvar.',
      coalesce(v_nome, 'outra pessoa'),
      to_char(v_atual.atualizado_em at time zone 'America/Rio_Branco', 'HH24:MI "de" DD/MM');
  end if;

  v_prazo := case when p_mudar_prazo then p_dt_prazo else v_atual.dt_prazo end;
  if v_prazo is distinct from v_atual.dt_prazo and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'informe o motivo da alteração: o prazo mudou';
  end if;

  perform set_config('dima.motivo_edicao', coalesce(btrim(p_motivo), ''), true);
  update tarefas set
    titulo = coalesce(btrim(p_titulo), titulo),
    descricao = p_descricao,
    prioridade = coalesce(p_prioridade, prioridade),
    dt_inicio = p_dt_inicio,
    dt_prazo = v_prazo,
    entidade_tipo = p_entidade_tipo, entidade_id = p_entidade_id,
    atividade_id = p_atividade_id,
    fornecedor_id = p_fornecedor_id,
    notificar_fornecedor = coalesce(p_notificar_fornecedor, notificar_fornecedor),
    tipo = coalesce(p_tipo, tipo),
    dados_tipo = coalesce(p_dados_tipo, dados_tipo)
  where id = p_tarefa_id;
  perform set_config('dima.motivo_edicao', '', true);

  -- prazo mudou: sino para todos os participantes (antes feito por fn_reagendar_tarefa)
  if v_prazo is distinct from v_atual.dt_prazo then
    select array_agg(usuario_id) into v_alvo from tarefa_participantes where tarefa_id = p_tarefa_id;
    perform fn_tarefa_notificar(v_alvo, 'tarefa_prazo',
      'Prazo alterado: ' || coalesce(v_atual.codigo,''),
      'Novo prazo: ' || coalesce(to_char(v_prazo,'DD/MM/YYYY'),'sem prazo'),
      p_tarefa_id, auth.uid());
  end if;
end $$;

revoke execute on function fn_editar_tarefa(uuid,text,text,prioridade_tarefa,date,text,uuid,uuid,uuid,boolean,text,jsonb,boolean,date,text,timestamptz) from public, anon;
grant  execute on function fn_editar_tarefa(uuid,text,text,prioridade_tarefa,date,text,uuid,uuid,uuid,boolean,text,jsonb,boolean,date,text,timestamptz) to authenticated;

-- fn_reagendar_tarefa: o histórico agora vem do trigger (evita registro duplo)
create or replace function fn_reagendar_tarefa(p_tarefa_id uuid, p_dt_prazo date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_cod text; v_alvo uuid[];
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão para alterar esta tarefa';
  end if;
  select codigo into v_cod from tarefas where id = p_tarefa_id;
  update tarefas set dt_prazo = p_dt_prazo where id = p_tarefa_id;
  select array_agg(usuario_id) into v_alvo from tarefa_participantes where tarefa_id = p_tarefa_id;
  perform fn_tarefa_notificar(v_alvo, 'tarefa_prazo',
    'Prazo alterado: ' || coalesce(v_cod,''),
    'Novo prazo: ' || coalesce(to_char(p_dt_prazo,'DD/MM/YYYY'),'sem prazo'),
    p_tarefa_id, v_caller);
end $$;

-- ── Remoção de participante passa a ser registrada ──────────────────────
create or replace function fn_remover_participante(p_tarefa_id uuid, p_usuario_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text; v_papel text;
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão';
  end if;
  delete from tarefa_participantes where tarefa_id = p_tarefa_id and usuario_id = p_usuario_id
  returning papel into v_papel;
  if v_papel is not null then
    select nome_completo into v_nome from usuarios where id = p_usuario_id;
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (p_tarefa_id, auth.uid(), 'remocao',
            coalesce(v_nome,'—') || case when v_papel = 'observador' then ' (observador)' else '' end);
  end if;
end $$;

-- ── Subtarefas: criar / editar / concluir / reabrir / excluir ───────────
create or replace function fn_tarefa_checklist_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare d jsonb := '[]'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (new.tarefa_id, auth.uid(), 'subtarefa_criada', left(new.descricao, 80));
    return null;
  end if;
  if tg_op = 'DELETE' then
    if not exists (select 1 from tarefas where id = old.tarefa_id) then return null; end if;
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (old.tarefa_id, auth.uid(), 'subtarefa_excluida', left(old.descricao, 80));
    return null;
  end if;
  if new.concluida is distinct from old.concluida then
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (new.tarefa_id, auth.uid(), case when new.concluida then 'subtarefa_concluida' else 'subtarefa_reaberta' end,
            left(new.descricao, 80));
  end if;
  -- responsável tem registro próprio (trg_checklist_responsavel)
  if new.descricao is distinct from old.descricao then
    d := d || jsonb_build_object('campo','Descrição','de',old.descricao,'para',new.descricao);
  end if;
  if new.dt_prazo is distinct from old.dt_prazo then
    d := d || jsonb_build_object('campo','Prazo','de',fn_hist_fmt('date',old.dt_prazo::text),'para',fn_hist_fmt('date',new.dt_prazo::text));
  end if;
  if jsonb_array_length(d) > 0 then
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para, detalhes)
    values (new.tarefa_id, auth.uid(), 'subtarefa_editada', left(new.descricao, 80), d);
  end if;
  return null;
end $$;
revoke execute on function fn_tarefa_checklist_historico() from public, authenticated, anon;
drop trigger if exists trg_tarefa_checklist_historico on public.tarefa_checklist;
create trigger trg_tarefa_checklist_historico after insert or update or delete on public.tarefa_checklist
  for each row execute function fn_tarefa_checklist_historico();

-- ── Anexos: inclusão avulsa (fora de comentário) e remoção ──────────────
create or replace function fn_tarefa_anexo_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.comentario_id is null then
      insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
      values (new.tarefa_id, auth.uid(), 'anexo', new.arquivo_nome);
    end if;
  elsif exists (select 1 from tarefas where id = old.tarefa_id) then
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (old.tarefa_id, auth.uid(), 'anexo_removido', old.arquivo_nome);
  end if;
  return null;
end $$;
revoke execute on function fn_tarefa_anexo_historico() from public, authenticated, anon;
drop trigger if exists trg_tarefa_anexo_historico on public.tarefa_anexos;
create trigger trg_tarefa_anexo_historico after insert or delete on public.tarefa_anexos
  for each row execute function fn_tarefa_anexo_historico();
