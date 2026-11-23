-- ════════════════════════════════════════════════════════════════════════
-- Editais publicados: painel para todos, aviso e tarefa de contato da lista curta
--
-- 1. fn_editais_licitacao(): rodadas de licitação para o painel "Editais publicados"
--    (Visão Geral › Minhas tarefas). Qualquer usuário ATIVO lê — inclusive quem não
--    enxerga o TDR — mas só dados do edital: nº do TDR, objeto, atividade, modalidade,
--    processo, datas, link e situação. Contato das empresas (TRAT-003) NÃO sai daqui;
--    só a quantidade.
-- 2. Aviso "edital publicado" no sino para responsável/substituto ativos da atividade,
--    coordenação e super_admin ativos (fn_lic_destinatarios), quando a rodada é aberta,
--    quando o link do edital é publicado/trocado e pelo botão "Notificar" do painel
--    (fn_lic_notificar_edital, só quem opera a licitação). O e-mail sai pela Edge Function
--    enviar-email-tarefa (evento 'edital'), chamada pela tela logo depois.
--    Tipo do sino 'licitacao_edital' depende do _sql_editor (troca o check de
--    notificacoes); sem ele, o aviso usa 'tarefa_prazo' (o mesmo do aviso de prazo).
-- 3. Tarefa "Contatar as empresas da lista curta — TDR X" (responsável/substituto da
--    atividade), nasce com a 1ª empresa da lista curta de uma rodada ABERTA, com uma
--    subtarefa por empresa ("Contatar <empresa> — contato · telefone · e-mail").
--    Empresa incluída depois vira subtarefa nova. Rodada que sai de 'aberta' encerra a
--    tarefa: concluída se todas as subtarefas foram feitas, senão cancelada.
--    Só daqui para frente: rodadas e empresas já gravadas não geram tarefa nem aviso.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tdr_licitacao_rodadas
  add column if not exists tarefa_contato_id uuid references public.tarefas(id),
  add column if not exists notificado_em     timestamptz,
  add column if not exists notificado_por    uuid references public.usuarios(id),
  add column if not exists email_edital_em   timestamptz,
  add column if not exists email_contato_em  timestamptz;

-- quem recebe o aviso do edital: responsável/substituto ativos da atividade + coordenação + super_admin ativos
create or replace function public.fn_lic_destinatarios(p_rodada uuid)
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select ar.usuario_id as x from tdr_licitacao_rodadas r join tdrs t on t.id = r.tdr_id
      join atividade_responsaveis ar on ar.atividade_id = t.atividade_id and ar.ativo and ar.papel in ('responsavel','substituto')
      join usuarios u on u.id = ar.usuario_id and u.ativo
     where r.id = p_rodada
    union
    select u.id from usuarios u where u.ativo and u.perfil in ('super_admin','coordenacao')
  ) z where x is not null
$$;

-- responsáveis da tarefa de contato: responsável/substituto ativos da atividade
create or replace function public.fn_lic_resp_atividade(p_rodada uuid)
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(distinct ar.usuario_id), '{}')
    from tdr_licitacao_rodadas r join tdrs t on t.id = r.tdr_id
    join atividade_responsaveis ar on ar.atividade_id = t.atividade_id and ar.ativo and ar.papel in ('responsavel','substituto')
    join usuarios u on u.id = ar.usuario_id and u.ativo
   where r.id = p_rodada
$$;

-- aviso no sino (motivo: 'aberta' | 'link' | 'lembrete'); quem fez a ação não recebe
create or replace function public.fn_lic_avisar_edital(p_rodada uuid, p_motivo text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  r tdr_licitacao_rodadas%rowtype; t tdrs%rowtype; u uuid; v_n integer := 0; v_tipo text; v_tit text; v_msg text;
begin
  select * into r from tdr_licitacao_rodadas where id = p_rodada;
  if r.id is null then return 0; end if;
  select * into t from tdrs where id = r.tdr_id;
  -- tipo próprio só depois do _sql_editor (check de notificacoes); antes, o mesmo do aviso de prazo
  v_tipo := case when exists (select 1 from pg_constraint where conname = 'notificacoes_tipo_check'
                               and pg_get_constraintdef(oid) like '%licitacao_edital%')
                 then 'licitacao_edital' else 'tarefa_prazo' end;
  v_tit := case p_motivo
             when 'link' then 'Link do edital publicado — TDR ' || t.numero
             when 'lembrete' then 'Edital em andamento — TDR ' || t.numero
             else case when r.edital_url is not null then 'Edital publicado — TDR ' || t.numero
                       else 'TDR ' || t.numero || ' enviado para licitação' end end;
  v_msg := left(coalesce(nullif(btrim(t.objeto_pt), ''), 'TDR ' || t.numero), 160)
        || ' · ' || r.modalidade
        || coalesce(' · propostas até ' || to_char(r.prazo_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI'), '');
  foreach u in array fn_lic_destinatarios(r.id) loop
    if u is not distinct from auth.uid() then continue; end if;
    insert into notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
    values (u, v_tipo, v_tit, v_msg, 'tdrs.html?tdr=' || t.id, 'tdr', t.id);
    v_n := v_n + 1;
  end loop;
  update tdr_licitacao_rodadas set notificado_em = now(), notificado_por = auth.uid() where id = r.id;
  return v_n;
end $$;

-- botão "Notificar" do painel: só quem opera a licitação (super_admin, coordenação, responsável/substituto)
create or replace function public.fn_lic_notificar_edital(p_rodada uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_tdr uuid;
begin
  select tdr_id into v_tdr from tdr_licitacao_rodadas where id = p_rodada;
  if v_tdr is null then raise exception 'LICITACAO: rodada não encontrada.'; end if;
  if not coalesce(fn_lic_pode(v_tdr), false) then
    raise exception 'LICITACAO: só coordenação, super_admin ou o responsável/substituto da atividade notificam o edital.';
  end if;
  return fn_lic_avisar_edital(p_rodada, 'lembrete');
end $$;

-- tarefa "Contatar as empresas da lista curta" (criada uma vez por rodada aberta)
create or replace function public.fn_lic_contato_tarefa(p_rodada uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  r tdr_licitacao_rodadas%rowtype; t tdrs%rowtype; v_pessoas uuid[]; v_criador uuid; v_id uuid; v_tit text; v_desc text; v_prazo date;
begin
  select * into r from tdr_licitacao_rodadas where id = p_rodada for update;
  if r.id is null or r.situacao <> 'aberta' then return null; end if;
  if r.tarefa_contato_id is not null then return r.tarefa_contato_id; end if;
  select * into t from tdrs where id = r.tdr_id;
  v_pessoas := fn_lic_resp_atividade(r.id);
  v_criador := coalesce(
    (select id from usuarios where id = auth.uid() and ativo),
    (select id from usuarios where id = r.aberta_por and ativo),
    (select x.usuario_id from rem_cargo_titulares x join usuarios u on u.id = x.usuario_id and u.ativo
      where x.cargo = 'coordenacao_solicitante' and x.vigencia_fim is null limit 1),
    v_pessoas[1]);
  if v_criador is null then return null; end if;
  if coalesce(array_length(v_pessoas, 1), 0) = 0 then
    v_pessoas := array[coalesce((select id from usuarios where id = r.aberta_por and ativo), v_criador)];
  end if;
  v_prazo := case when r.prazo_em is not null
                  then greatest(current_date, (r.prazo_em at time zone 'America/Rio_Branco')::date - 2)
                  else current_date + 5 end;
  v_tit := 'Contatar as empresas da lista curta — TDR ' || t.numero;
  v_desc := 'Objeto: ' || coalesce(nullif(btrim(t.objeto_pt), ''), '—')
    || E'\n' || r.rodada || 'ª rodada · ' || r.modalidade || coalesce(' · processo ' || nullif(btrim(r.numero_processo), ''), '')
    || E'\nEdital: ' || coalesce(r.edital_url, 'link não informado')
    || coalesce(E'\nPropostas até ' || to_char(r.prazo_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI'), '')
    || E'\n\nHá uma subtarefa por empresa da lista curta, com o contato informado no TDR. Ao falar com a empresa, '
    || 'marque a subtarefa e registre o contato como comentário (data, meio e retorno). '
    || 'A tarefa é encerrada sozinha quando o resultado da licitação for registrado.';
  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo, entidade_tipo, entidade_id, atividade_id, criado_por, tipo)
  values (v_tit, v_desc, 'alta', current_date, v_prazo, 'tdr_licitacao_rodada', r.id, t.atividade_id, v_criador, 'outras')
  returning id into v_id;
  insert into tarefa_participantes (tarefa_id, usuario_id, papel)
    select v_id, x, 'responsavel' from unnest(v_pessoas) x
    on conflict (tarefa_id, usuario_id) do nothing;
  insert into tarefa_tdrs (tarefa_id, tdr_id) values (v_id, t.id) on conflict do nothing;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (v_id, v_criador, 'criacao', 'Criada pelo sistema na licitação do TDR ' || t.numero);
  perform fn_tarefa_notificar(v_pessoas, 'tarefa_atribuida', v_tit, 'Lista curta da licitação', v_id, auth.uid());
  update tdr_licitacao_rodadas set tarefa_contato_id = v_id where id = r.id;
  return v_id;
end $$;

-- empresa nova na lista curta de rodada aberta: garante a tarefa e cria a subtarefa da empresa
create or replace function public.fn_trg_lic_empresa_contato()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r tdr_licitacao_rodadas%rowtype; v_tar uuid; v_st text; v_prazo date; v_criador uuid; v_ord numeric; v_cont text;
begin
  if not new.ativo or not new.convidada then return null; end if;
  select * into r from tdr_licitacao_rodadas where id = new.rodada_id;
  if r.id is null or r.situacao <> 'aberta' then return null; end if;
  v_tar := coalesce(r.tarefa_contato_id, fn_lic_contato_tarefa(r.id));
  if v_tar is null then return null; end if;
  select status::text, dt_prazo, criado_por into v_st, v_prazo, v_criador from tarefas where id = v_tar;
  if v_st in ('concluida','cancelada') then return null; end if;
  select coalesce(max(ordem), 0) + 1 into v_ord from tarefa_checklist where tarefa_id = v_tar;
  v_cont := nullif(concat_ws(' · ', nullif(btrim(new.contato), ''), nullif(btrim(new.telefone), ''), nullif(btrim(new.email), '')), '');
  insert into tarefa_checklist (tarefa_id, descricao, ordem, criado_por, dt_prazo)
  values (v_tar, 'Contatar ' || btrim(new.empresa) || coalesce(' — ' || v_cont, ''), v_ord,
          coalesce((select id from usuarios where id = auth.uid() and ativo), v_criador), v_prazo);
  return null;
end $$;

create or replace trigger trg_lic_empresa_contato after insert on public.tdr_licitacao_empresas
  for each row execute function public.fn_trg_lic_empresa_contato();

-- rodada nova / link publicado: aviso; rodada que sai de 'aberta': encerra a tarefa de contato
create or replace function public.fn_trg_lic_rodada_aviso()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_falta boolean;
begin
  if tg_op = 'INSERT' then
    perform fn_lic_avisar_edital(new.id, 'aberta');
    return null;
  end if;
  if new.edital_url is not null and new.edital_url is distinct from old.edital_url and new.situacao = 'aberta' then
    perform fn_lic_avisar_edital(new.id, 'link');
  end if;
  if old.situacao = 'aberta' and new.situacao <> 'aberta' and new.tarefa_contato_id is not null then
    select exists (select 1 from tarefa_checklist where tarefa_id = new.tarefa_contato_id and not concluida) into v_falta;
    perform fn_lic_fechar_tarefa(new.tarefa_contato_id, case when v_falta then 'cancelada' else 'concluida' end, auth.uid(),
      'Rodada encerrada (' || replace(new.situacao, '_', ' ') || '): tarefa de contato encerrada pelo sistema'
      || case when v_falta then ' — havia empresas sem contato registrado.' else '.' end);
  end if;
  return null;
end $$;

create or replace trigger trg_lic_rodada_aviso after insert or update of edital_url, situacao on public.tdr_licitacao_rodadas
  for each row execute function public.fn_trg_lic_rodada_aviso();

-- painel "Editais publicados": todo usuário ativo; sem contato das empresas
create or replace function public.fn_editais_licitacao()
returns table (rodada_id uuid, tdr_id uuid, tdr_numero text, objeto text, atividade_codigo text, rodada integer,
               modalidade text, numero_processo text, dt_abertura date, prazo_em timestamptz, prazo_original timestamptz,
               edital_url text, situacao text, resultado_em timestamptz, criado_em timestamptz, n_empresas integer,
               tarefa_contato_id uuid, tarefa_status text, subtarefas integer, subtarefas_feitas integer,
               notificado_em timestamptz, pode_operar boolean)
language sql stable security definer set search_path to 'public' as $$
  select r.id, r.tdr_id, t.numero::text, t.objeto_pt, a.codigo::text, r.rodada, r.modalidade, r.numero_processo, r.dt_abertura,
         r.prazo_em, r.prazo_original, r.edital_url, r.situacao, r.resultado_em, r.criado_em,
         (select count(*)::int from tdr_licitacao_empresas e where e.rodada_id = r.id and e.ativo and e.convidada),
         r.tarefa_contato_id, tk.status::text,
         (select count(*)::int from tarefa_checklist c where c.tarefa_id = r.tarefa_contato_id),
         (select count(*)::int from tarefa_checklist c where c.tarefa_id = r.tarefa_contato_id and c.concluida),
         r.notificado_em, coalesce(fn_lic_pode(r.tdr_id), false)
    from tdr_licitacao_rodadas r
    join tdrs t on t.id = r.tdr_id
    left join atividades a on a.id = t.atividade_id
    left join tarefas tk on tk.id = r.tarefa_contato_id
   where exists (select 1 from usuarios u where u.id = auth.uid() and u.ativo)
   order by (r.situacao = 'aberta') desc, r.prazo_em nulls last, r.criado_em desc
$$;

-- ── permissões ───────────────────────────────────────────────────────────
revoke all on function public.fn_editais_licitacao() from public, anon;
grant execute on function public.fn_editais_licitacao() to authenticated;
revoke all on function public.fn_lic_notificar_edital(uuid) from public, anon;
grant execute on function public.fn_lic_notificar_edital(uuid) to authenticated;
revoke all on function public.fn_lic_destinatarios(uuid) from public, anon, authenticated;
grant execute on function public.fn_lic_destinatarios(uuid) to service_role;
revoke all on function public.fn_lic_resp_atividade(uuid) from public, anon, authenticated;
revoke all on function public.fn_lic_avisar_edital(uuid, text) from public, anon, authenticated;
revoke all on function public.fn_lic_contato_tarefa(uuid) from public, anon, authenticated;
revoke all on function public.fn_trg_lic_empresa_contato() from public, anon, authenticated;
revoke all on function public.fn_trg_lic_rodada_aviso() from public, anon, authenticated;

notify pgrst, 'reload schema';
