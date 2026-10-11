-- Segurança: funções SECURITY DEFINER que o papel anon (chave pública do site) conseguia executar.
-- Achado do painel de segurança do Supabase (anon_security_definer_function_executable), conferido função a função.
--
-- 1) apagar_tdr: testava `fn_perfil_atual() <> 'super_admin'`; sem login o perfil é NULL, o teste dá NULL e a função
--    seguia — qualquer pessoa com a chave pública apagava TDR sem contrato/lançamento. Aqui: sai o EXECUTE de
--    anon/public. O corpo corrigido (super_admin ATIVO por NOT EXISTS) está em
--    20261011_seg_apagar_tdr_sql_editor.sql (o apply_migration trava em texto com o comando de remoção).
-- 2) fn_registrar_acao_tdr: não conferia quem chama, aceitava o usuário por parâmetro e mudava a fase do TDR por cima
--    da RLS. Agora: só usuário logado e ativo, que enxerga o TDR (mesma regra de tdrs_select); o usuário do histórico é
--    sempre auth.uid() (p_usuario_id é ignorado); a fase só muda se a pessoa pudesse mudá-la pela tabela (mesma regra
--    de tdrs_update) — senão só registra a ação, com o status real. As telas já mudam a fase direto na tabela antes.
-- 3) fn_audit_log (gravava linhas falsas na trilha) e fn_verificar_senha (sem uso; testava a própria senha sem limite):
--    sem EXECUTE para anon, public e authenticated (fn_trg_produto_aprovado chama fn_audit_log como dono — segue).
-- 4) Demais funções de ação: sem EXECUTE para anon/public (authenticated mantém). Ficam abertas as fn_publico_* (portal)
--    e as funções-predicado (fn_perfil_atual, tem_permissao, fn_pode_ver_tarefa, fn_tarefa_pode_*), que só respondem
--    sobre quem chama e são usadas dentro de policies.

-- ── 1 ─────────────────────────────────────────────────────────────────────
revoke execute on function public.apagar_tdr(uuid) from public, anon;

-- ── 2 ─────────────────────────────────────────────────────────────────────
create or replace function public.fn_registrar_acao_tdr(p_tdr_id uuid, p_usuario_id uuid, p_acao character varying,
  p_comentario text default null, p_ip character varying default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_perfil perfil_usuario := fn_perfil_atual();   -- NULL sem login ou com a conta desativada
  v_tdr record;
  v_acao_id uuid;
  v_status_ant varchar;
  v_status_novo varchar;
  v_titulo_notif text;
  v_tipo_notif varchar;
  v_link text := '/pages/tdrs.html';
  v_resp record;
begin
  if v_uid is null or v_perfil is null then
    raise exception 'Sem sessão válida.' using errcode = '42501';
  end if;

  select t.*, a.codigo as ativ_codigo, a.responsavel_id as ativ_resp, a.substituto_id as ativ_subst into v_tdr
  from public.tdrs t left join public.atividades a on a.id = t.atividade_id
  where t.id = p_tdr_id;
  if not found then raise exception 'TDR não encontrado.'; end if;

  -- mesma regra de leitura da policy tdrs_select
  -- coalesce: campo vazio dá NULL e "not NULL" não barra (a mesma armadilha do apagar_tdr)
  if not coalesce(v_perfil in ('super_admin','coordenacao','financeiro','visualizador')
          or v_tdr.criado_por = v_uid or v_tdr.elaborador_id = v_uid or v_tdr.responsavel_id = v_uid
          or v_tdr.ativ_resp = v_uid or v_tdr.ativ_subst = v_uid, false) then
    raise exception 'Sem acesso a este TDR.' using errcode = '42501';
  end if;

  v_status_ant := v_tdr.status::varchar;
  v_status_novo := case p_acao
    when 'enviado_revisao'  then 'revisao_interna'
    when 'aprovado_revisao' then 'enviado_unesco'
    when 'devolvido_ajuste' then 'ajustes'
    when 'enviado_unesco'   then 'enviado_unesco'
    when 'retorno_unesco'   then 'retorno_unesco'
    when 'aprovado_final'   then 'aprovado'
    when 'cancelado'        then 'cancelado'
    else v_status_ant end;

  if v_status_novo <> v_status_ant then
    -- mesma regra de escrita da policy tdrs_update; sem ela, só registra a ação (status real, sem mudar a fase)
    if coalesce(v_perfil in ('super_admin','coordenacao')
       or (v_perfil = 'tecnico' and v_tdr.criado_por = v_uid and v_tdr.status in ('rascunho','ajustes')), false) then
      update public.tdrs set status = v_status_novo::status_tdr, atualizado_em = now() where id = p_tdr_id;
    else
      v_status_novo := v_status_ant;
    end if;
  end if;

  insert into public.tdr_acoes (tdr_id, usuario_id, acao, status_anterior, status_novo, comentario, ip_address)
  values (p_tdr_id, v_uid, p_acao, v_status_ant, v_status_novo, p_comentario, p_ip)
  returning id into v_acao_id;

  v_tipo_notif := case p_acao
    when 'enviado_revisao'  then 'tdr_para_revisar'
    when 'devolvido_ajuste' then 'tdr_devolvido'
    when 'aprovado_final'   then 'tdr_aprovado'
    when 'enviado_unesco'   then 'tdr_enviado_unesco'
    else null end;
  v_titulo_notif := case p_acao
    when 'enviado_revisao'  then 'TDR ' || v_tdr.numero || ' aguarda sua revisão'
    when 'devolvido_ajuste' then 'TDR ' || v_tdr.numero || ' foi devolvido para ajustes'
    when 'aprovado_revisao' then 'TDR ' || v_tdr.numero || ' aprovado na revisão interna'
    when 'aprovado_final'   then 'TDR ' || v_tdr.numero || ' aprovado pela UNESCO'
    when 'cancelado'        then 'TDR ' || v_tdr.numero || ' foi cancelado'
    else 'TDR ' || v_tdr.numero || ' atualizado' end;

  if v_tipo_notif is not null then
    for v_resp in
      select distinct tr.usuario_id from public.tdr_responsaveis tr where tr.tdr_id = p_tdr_id and tr.ativo = true
      union
      select u.id from public.usuarios u where u.perfil = 'coordenacao' and u.ativo = true and p_acao = 'enviado_revisao'
    loop
      if v_resp.usuario_id <> v_uid then
        insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
        values (v_resp.usuario_id, v_tipo_notif, v_titulo_notif, coalesce(p_comentario, 'Atividade: ' || v_tdr.ativ_codigo),
                v_link, 'tdr', p_tdr_id);
      end if;
    end loop;
    if p_acao = 'devolvido_ajuste' then
      insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
      select tr.usuario_id, 'tdr_devolvido', v_titulo_notif, coalesce(p_comentario, 'TDR devolvido para ajustes'), v_link, 'tdr', p_tdr_id
      from public.tdr_responsaveis tr
      where tr.tdr_id = p_tdr_id and tr.papel = 'elaborador' and tr.ativo = true and tr.usuario_id <> v_uid;
    end if;
  end if;

  return v_acao_id;
end;
$function$;
revoke execute on function public.fn_registrar_acao_tdr(uuid, uuid, character varying, text, character varying) from public, anon;
grant execute on function public.fn_registrar_acao_tdr(uuid, uuid, character varying, text, character varying) to authenticated;

-- O histórico do TDR aceitava, de qualquer logado, linha com qualquer usuário: agora só em nome de quem grava.
alter policy tdr_acoes_escrita on public.tdr_acoes to authenticated with check (usuario_id = auth.uid());

-- ── 3 ─────────────────────────────────────────────────────────────────────
revoke execute on function public.fn_audit_log(operacao_audit, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_verificar_senha(text) from public, anon, authenticated;

-- ── 4 ─────────────────────────────────────────────────────────────────────
revoke execute on function public.fn_alertar_sem_responsavel() from public, anon, authenticated;  -- sem uso na tela/cron
revoke execute on function public.fn_atribuir_participante(uuid, uuid, text) from public, anon;
revoke execute on function public.fn_atualizar_email_usuario(uuid, text) from public, anon;
revoke execute on function public.fn_comentar_tarefa(uuid, text) from public, anon;
revoke execute on function public.fn_consumir_token_senha(text) from public, anon;
revoke execute on function public.fn_estornar_economia_tdr(uuid, text) from public, anon;
revoke execute on function public.fn_liberar_economia_tdr(uuid, text, numeric) from public, anon;
revoke execute on function public.fn_reagendar_tarefa(uuid, date) from public, anon;
revoke execute on function public.fn_remover_participante(uuid, uuid) from public, anon;
revoke execute on function public.get_minhas_atividades() from public, anon;
revoke execute on function public.get_minhas_entregas_devolvidas() from public, anon;
revoke execute on function public.get_minhas_tarefas() from public, anon;
revoke execute on function public.get_produtos_vencendo(integer) from public, anon;
revoke execute on function public.get_signed_url(text, integer) from public, anon;
revoke execute on function public.marcar_notificacoes_lidas(uuid[]) from public, anon;
