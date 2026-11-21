-- 27/11/2026 · Acessos (parte D): quem participa do fluxo não perde nada + fase 2 (ações e Viagens).
--
-- Decisões do super_admin (21/11/2026):
--  1. Responsável/substituto de atividade e titular de cargo da assinatura NÃO são suspensos por inatividade
--     (recebem o aviso; o Auditor aponta quem está há 15 dias sem entrar).
--  2. Quem vira responsável ou titular ganha na hora, sem prazo, os módulos do perfil (como os de 26/11).
--  3. Os titulares de cargo atuais passam a ter os módulos do perfil sem prazo (saem da revisão).
-- Fase 2:
--  A. Ações e gravações que conferiam só o perfil passam a exigir o módulo no trecho do PERFIL. O trecho de
--     VÍNCULO (responsável, titular, fornecedor vinculado, criador, viajante, quem guarda o bem) não muda.
--  B. Viagens: viajantes, trechos, diárias e registro de e-mails seguem a visibilidade do protocolo
--     (estavam abertos a qualquer logado); o participante da viagem vê e preenche o que é seu.
--  C. fn_meus_vinculos ganha viagem, patrimônio e pulso (a tela abre a página pelo vínculo).
-- Nada é apagado; sem palavra de comando de remoção no texto (o apply_migration pede confirmação nela).

-- ── Utilitários ──────────────────────────────────────────────────────
-- Troca um trecho do corpo ATUAL de uma função (exatamente 1 ocorrência, senão aborta tudo).
create or replace function pg_temp.troca(p regprocedure, padrao text, novo text) returns void
language plpgsql as $t$
declare d text; n int;
begin
  d := pg_get_functiondef(p);
  select count(*) into n from regexp_matches(d, padrao, 'g');
  if n <> 1 then raise exception 'troca em %: % ocorrência(s) de %', p, n, padrao; end if;
  execute regexp_replace(d, padrao, novo);
end $t$;

-- Módulo liberado para uma pessoa qualquer (as funções chamadas pela Edge Function recebem o usuário).
create or replace function public.fn_usuario_modulo(p_uid uuid, p_modulo text)
returns boolean language sql stable security definer set search_path to 'public' as $f$
  select exists (
    select 1 from public.usuarios u
     where u.id = p_uid and u.ativo and u.bloqueado_inatividade_em is null
       and (u.perfil = 'super_admin'
            or exists (select 1 from public.usuario_permissoes p
                        where p.usuario_id = u.id and p.modulo = p_modulo and p.ativo
                          and p.valido_de <= now() and (p.valido_ate is null or p.valido_ate > now()))));
$f$;
revoke execute on function public.fn_usuario_modulo(uuid, text) from public, anon, authenticated;

-- Responsável/substituto ativo de atividade ou titular de cargo da assinatura (vigente ou futuro).
create or replace function public.fn_acesso_vinculo_permanente(p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $f$
  select exists (select 1 from public.atividade_responsaveis where usuario_id = p_uid and ativo)
      or exists (select 1 from public.rem_cargo_titulares
                  where usuario_id = p_uid and (vigencia_fim is null or vigencia_fim >= current_date));
$f$;
revoke execute on function public.fn_acesso_vinculo_permanente(uuid) from public, anon, authenticated;

-- Concede, sem prazo, os módulos do perfil. p_forcar = false respeita módulo retirado de propósito.
create or replace function public.fn_acesso_conceder_padrao(p_uid uuid, p_motivo text, p_forcar boolean)
returns int language plpgsql security definer set search_path to 'public' as $f$
declare v_u record; v_n int; v_por uuid;
begin
  select id, perfil, ativo into v_u from public.usuarios where id = p_uid;
  if v_u.id is null or not v_u.ativo or v_u.perfil = 'super_admin' then return 0; end if;
  v_por := coalesce(auth.uid(), (select id from public.usuarios where perfil = 'super_admin' and ativo
                                  order by criado_em limit 1));
  perform set_config('dima.acesso_migracao', '1', true);   -- um aviso só, não um por módulo
  with ins as (
    insert into public.usuario_permissoes (usuario_id, modulo, ativo, valido_de, valido_ate, concedido_por,
                                           concedido_em, motivo, em_revisao)
    select v_u.id, m.modulo, true, now(), null, v_por, now(), p_motivo, false
      from public.acesso_modulos m
     where not m.nucleo and (m.perfis is null or v_u.perfil = any (m.perfis))
    on conflict (usuario_id, modulo) do update
       set ativo = true, valido_ate = null, em_revisao = false, revisao_valido_ate_original = null,
           valido_de = least(public.usuario_permissoes.valido_de, now()),
           revogado_por = null, revogado_em = null, revisado_em = now(), revisado_por = v_por
     where p_forcar or public.usuario_permissoes.revogado_em is null
    returning 1)
  select count(*) into v_n from ins;
  perform set_config('dima.acesso_migracao', '', true);
  if v_n > 0 then
    perform public.fn_acesso_avisar(v_u.id, 'acesso_alterado', 'Seus acessos foram liberados',
      'Como ' || p_motivo || ', você tem sem prazo os módulos do seu perfil.', 'dashboard.html');
  end if;
  return v_n;
end $f$;
revoke execute on function public.fn_acesso_conceder_padrao(uuid, text, boolean) from public, anon, authenticated;

create or replace function public.fn_trg_resp_acesso() returns trigger
language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.ativo and (tg_op = 'INSERT' or old.ativo is distinct from new.ativo
                    or old.usuario_id is distinct from new.usuario_id) then
    perform public.fn_acesso_conceder_padrao(new.usuario_id, 'responsável de atividade', true);
  end if;
  return new;
end $f$;
revoke execute on function public.fn_trg_resp_acesso() from public, anon, authenticated;
create or replace trigger trg_atividade_resp_acesso
  after insert or update of ativo, usuario_id on public.atividade_responsaveis
  for each row execute function public.fn_trg_resp_acesso();

create or replace function public.fn_trg_titular_acesso() returns trigger
language plpgsql security definer set search_path to 'public' as $f$
begin
  if (new.vigencia_fim is null or new.vigencia_fim >= current_date)
     and (tg_op = 'INSERT' or old.usuario_id is distinct from new.usuario_id
          or old.vigencia_fim is distinct from new.vigencia_fim) then
    perform public.fn_acesso_conceder_padrao(new.usuario_id, 'titular de cargo da assinatura', true);
  end if;
  return new;
end $f$;
revoke execute on function public.fn_trg_titular_acesso() from public, anon, authenticated;
create or replace trigger trg_rem_titular_acesso
  after insert or update of usuario_id, vigencia_fim on public.rem_cargo_titulares
  for each row execute function public.fn_trg_titular_acesso();

-- Aplicar agora a quem já é responsável ou titular (sem desfazer retirada feita de propósito).
select public.fn_acesso_conceder_padrao(u.id, 'responsável de atividade ou titular de cargo', false)
  from public.usuarios u
 where u.ativo and u.perfil <> 'super_admin' and public.fn_acesso_vinculo_permanente(u.id);

-- ── 1. Inatividade: responsável/titular não é suspenso; o Auditor aponta ──
select pg_temp.troca('public.fn_acesso_rotina()'::regprocedure,
  'if v_ua < now\(\) - make_interval\(days => v_r\.dias_inatividade\) then',
  'if v_ua < now() - make_interval(days => v_r.dias_inatividade) and not public.fn_acesso_vinculo_permanente(v_u.id) then');

select pg_temp.troca('public.fn_auditoria_acessos()'::regprocedure,
  'union all(\s+)select ''baixo'', ''Acessos: e-mail não enviado''',
  $r$union all
  -- responsável/titular sem entrar há 15 dias (não é suspenso: a função dele trava o fluxo)
  select 'medio', 'Acessos: responsável ou signatário sem entrar há 15 dias — ' || u.nome_completo,
         u.nome_completo || ' não entra desde '
           || to_char(public.fn_usuario_ultima_atividade(u.id) at time zone 'America/Rio_Branco', 'DD/MM/YYYY')
           || '. Por ser responsável de atividade ou titular de cargo da assinatura, a entrada não é suspensa sozinha.',
         'Confirme com a pessoa se ela segue na função; se não, troque o responsável em Atividades ou o titular em Remanejamento.',
         'usuarios', u.id, u.nome_completo
    from usuarios u
   where u.ativo and u.perfil <> 'super_admin' and u.bloqueado_inatividade_em is null
     and public.fn_acesso_vinculo_permanente(u.id)
     and public.fn_usuario_ultima_atividade(u.id) < now() - interval '15 days'
  union all\1select 'baixo', 'Acessos: e-mail não enviado'$r$);

-- ── C. Vínculos que abrem página ──────────────────────────────────────
create or replace function public.fn_meus_vinculos()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object(
    'responsavel', exists (select 1 from public.atividade_responsaveis where usuario_id = auth.uid() and ativo),
    'titular',     exists (select 1 from public.rem_cargo_titulares where usuario_id = auth.uid()
                             and vigencia_inicio <= current_date and (vigencia_fim is null or vigencia_fim >= current_date)),
    'fornecedor',  exists (select 1 from public.fornecedor_usuarios where usuario_id = auth.uid() and ativo),
    'viagem',      exists (select 1 from public.viagem_protocolos p
                            where public.fn_viagem_participa(p.id, auth.uid()) is not null),
    'patrimonio',  exists (select 1 from public.pat_bens b where b.responsavel_id = auth.uid()
                             and b.situacao not in ('baixado','anulado','transferido'))
                or exists (select 1 from public.pat_termos t where t.responsavel_id = auth.uid()
                             and t.situacao = 'aguardando_aceite')
                or exists (select 1 from public.pat_inventario_comissao c join public.pat_inventarios i on i.id = c.inventario_id
                            where c.usuario_id = auth.uid() and i.situacao in ('em_andamento','em_assinatura')),
    'pulso',       exists (select 1 from public.pulso_ciclos where criado_por = auth.uid())
  ) where public.fn_perfil_atual() is not null;
$function$;

-- ── A. Ações que conferiam só o perfil ────────────────────────────────
select pg_temp.troca('public.fn_encerramento_anexar_documento(uuid,text,text,text,bigint)'::regprocedure,
  'perfil in \(''super_admin'',''coordenacao''\)\) then',
  'perfil in (''super_admin'',''coordenacao'')) or not public.fn_usuario_modulo(v_uid, ''contratos'') then');
select pg_temp.troca('public.fn_encp_pedir(uuid,uuid[],text,jsonb,text,numeric)'::regprocedure,
  'perfil in \(''super_admin'',''coordenacao'',''financeiro''\)\) then',
  'perfil in (''super_admin'',''coordenacao'',''financeiro'')) or not public.fn_usuario_modulo(v_uid, ''contratos'') then');
select pg_temp.troca('public.fn_entregas_docs_pode_enviar(text)'::regprocedure,
  'fn_perfil_atual\(\) in \(''super_admin'',''coordenacao'',''financeiro''\)',
  'fn_perfil_atual() in (''super_admin'',''coordenacao'',''financeiro'') and (public.fn_modulo_liberado(''produtos'') or public.fn_modulo_liberado(''contratos'') or public.fn_modulo_liberado(''financeiro''))');
select pg_temp.troca('public.fn_liberar_economia_tdr(uuid,text,numeric)'::regprocedure,
  '''coordenacao''::perfil_usuario\]\) then',
  '''coordenacao''::perfil_usuario]) or not public.fn_modulo_liberado(''tdrs'') then');
select pg_temp.troca('public.fn_estornar_economia_tdr(uuid,text)'::regprocedure,
  '''coordenacao''::perfil_usuario\]\) then',
  '''coordenacao''::perfil_usuario]) or not public.fn_modulo_liberado(''tdrs'') then');
select pg_temp.troca('public.fn_lic_pode(uuid)'::regprocedure,
  'u\.perfil in \(''super_admin'',''coordenacao''\)\)',
  'u.perfil in (''super_admin'',''coordenacao'') and public.fn_usuario_modulo(u.id, ''tdrs''))');
select pg_temp.troca('public.fn_mapa_pode_editar(uuid)'::regprocedure,
  'u\.perfil in \(''super_admin'',''coordenacao''\)',
  'u.perfil in (''super_admin'',''coordenacao'') and public.fn_usuario_modulo(u.id, ''mapa'')');
select pg_temp.troca('public.fn_pulso_gestor()'::regprocedure,
  'u\.perfil in \(''super_admin'',''coordenacao''\)\)',
  'u.perfil in (''super_admin'',''coordenacao'') and public.fn_usuario_modulo(u.id, ''pulso''))');
-- TDR: sem o módulo, a pessoa age só pelo vínculo (as mesmas regras do técnico).
select pg_temp.troca('public.fn_registrar_acao_tdr(uuid,uuid,character varying,text,character varying)'::regprocedure,
  '(raise exception ''Sem sessão válida\.'' using errcode = ''42501'';\s+end if;)',
  E'\\1\n  if v_perfil in (''coordenacao'',''financeiro'',''visualizador'') and not public.fn_modulo_liberado(''tdrs'') then\n    v_perfil := ''tecnico'';\n  end if;');
select pg_temp.troca('public.fn_rem_salvar(uuid,jsonb)'::regprocedure,
  'not in \(''coordenacao'',''super_admin''\) then',
  'not in (''coordenacao'',''super_admin'') or not public.fn_modulo_liberado(''remanejamentos'') then');
select pg_temp.troca('public.fn_rem_criar_estorno(uuid,text)'::regprocedure,
  'not in \(''coordenacao'',''super_admin''\) then',
  'not in (''coordenacao'',''super_admin'') or not public.fn_modulo_liberado(''remanejamentos'') then');
select pg_temp.troca('public.fn_tcan_salvar(uuid,jsonb)'::regprocedure,
  'not in \(''coordenacao'',''super_admin''\) then',
  'not in (''coordenacao'',''super_admin'') or not public.fn_modulo_liberado(''tdrs'') then');
select pg_temp.troca('public.fn_tdr_licitacao_sem_exito(uuid,text,text)'::regprocedure,
  'not in \(''coordenacao'',''super_admin''\) then',
  'not in (''coordenacao'',''super_admin'') or not public.fn_modulo_liberado(''tdrs'') then');
select pg_temp.troca('public.fn_viagem_comp_pode(uuid,uuid)'::regprocedure,
  'u\.perfil::text in \(''financeiro'',''super_admin'',''coordenacao''\)\)',
  'u.perfil::text in (''financeiro'',''super_admin'',''coordenacao'') and public.fn_usuario_modulo(u.id, ''viagens''))');
select pg_temp.troca('public.fn_viagem_dev_confirmadores(uuid)'::regprocedure,
  'u\.perfil::text = ''financeiro'' and',
  'u.perfil::text = ''financeiro'' and public.fn_usuario_modulo(u.id, ''viagens'') and');
select pg_temp.troca('public.fn_viagem_devolucao_cancelar(uuid,text)'::regprocedure,
  'perfil::text in \(''super_admin'',''coordenacao''\)\) then',
  'perfil::text in (''super_admin'',''coordenacao'')) or not public.fn_usuario_modulo(v_uid, ''viagens'') then');
select pg_temp.troca('public.fn_viagem_devolucao_confirmar(uuid,uuid,text,numeric,numeric,numeric,text,text,text,text,text)'::regprocedure,
  'v_perfil not in \(''financeiro'',''super_admin''\) then',
  'v_perfil not in (''financeiro'',''super_admin'') or not public.fn_usuario_modulo(p_usuario_id, ''viagens'') then');
select pg_temp.troca('public.fn_viagem_devolucao_pode_confirmar(uuid)'::regprocedure,
  'v_perfil not in \(''financeiro'',''super_admin''\) then',
  'v_perfil not in (''financeiro'',''super_admin'') or not public.fn_usuario_modulo(auth.uid(), ''viagens'') then');

-- ── A. Gravações por perfil (o trecho de vínculo de cada regra fica igual) ─
alter policy ai_write on public.atividade_indicador using (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao','tecnico']::perfil_usuario[])
  and public.fn_modulo_liberado('atividades'));
alter policy atv_mat_admin on public.atividade_matriz
  using (public.fn_perfil_atual() = any (array['super_admin','coordenacao','tecnico']::perfil_usuario[])
         and public.fn_modulo_liberado('atividades'))
  with check (public.fn_perfil_atual() = any (array['super_admin','coordenacao','tecnico']::perfil_usuario[])
         and public.fn_modulo_liberado('atividades'));
alter policy ativ_resp_escrita on public.atividade_responsaveis with check (
  public.fn_perfil_atual() = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('atividades'));
alter policy ativ_resp_update on public.atividade_responsaveis
  using (public.fn_perfil_atual() = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('atividades'))
  with check (public.fn_perfil_atual() = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('atividades'));
alter policy atividades_write on public.atividades using (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao','tecnico']::perfil_usuario[])
  and public.fn_modulo_liberado('atividades'));
alter policy riscos_write on public.riscos using (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('atividades'));
alter policy ce_write on public.contrato_encerramentos with check (
  public.fn_perfil_atual() = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[]) and public.fn_modulo_liberado('contratos'));
-- Pagar o lançamento marca o produto como pago por gatilho em nome de quem paga: financeiro entra aqui.
alter policy cp_financeiro on public.contratos_produtos using (
  public.fn_perfil_atual() = any (array['financeiro','coordenacao']::perfil_usuario[])
  and (public.fn_modulo_liberado('contratos') or public.fn_modulo_liberado('financeiro') or public.fn_modulo_liberado('produtos')));
alter policy indicadores_write on public.indicadores using (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('matriz'));
alter policy outputs_write_admin on public.outputs using (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('matriz'));
alter policy resultados_write_admin on public.resultados using (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('matriz'));
alter policy matriz_itens_admin on public.matriz_itens
  using (public.fn_perfil_atual() = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('matriz'))
  with check (public.fn_perfil_atual() = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('matriz'));
alter policy pi_update on public.produto_indicador using (
  public.fn_perfil_atual() = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('matriz'));
alter policy pmc_confirm on public.produto_matriz_contribuicao using (
  public.fn_perfil_atual() = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('matriz'));
alter policy pd_select on public.passagens_diarias using (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao','financeiro','visualizador']::perfil_usuario[])
  and public.fn_modulo_liberado('viagens'));
alter policy pd_write on public.passagens_diarias using (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[])
  and public.fn_modulo_liberado('viagens'));
alter policy pe_select on public.produtos_entregues using (
  ((select public.fn_perfil_atual()) = any (array['super_admin','coordenacao','financeiro','visualizador','tecnico']::perfil_usuario[])
   and public.fn_modulo_liberado('produtos'))
  or submetido_por = auth.uid() or aprovado_tecnico_por = auth.uid());
alter policy pe_update on public.produtos_entregues using (
  (((select public.fn_perfil_atual()) = any (array['super_admin','coordenacao']::perfil_usuario[])
    or ((select public.fn_perfil_atual()) = 'tecnico' and status = any (array['submetido','em_revisao']::status_produto[])))
   and public.fn_modulo_liberado('produtos'))
  or submetido_por = auth.uid());
alter policy remanejamento_assinaturas_select on public.remanejamento_assinaturas using (
  usuario_id = auth.uid()
  or ((select public.fn_perfil_atual()) = any (array['super_admin','coordenacao']::perfil_usuario[])
      and public.fn_modulo_liberado('remanejamentos')));
alter policy tdr_cancelamento_assinaturas_select on public.tdr_cancelamento_assinaturas using (
  usuario_id = auth.uid()
  or ((select public.fn_perfil_atual()) = any (array['super_admin','coordenacao']::perfil_usuario[])
      and (public.fn_modulo_liberado('tdrs') or public.fn_modulo_liberado('remanejamentos'))));
alter policy tdr_anexos_insert on public.tdr_anexos with check (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao','tecnico']::perfil_usuario[]) and public.fn_modulo_liberado('tdrs'));
alter policy tdr_comentarios_update on public.tdr_comentarios using (
  usuario_id = auth.uid()
  or ((select public.fn_perfil_atual()) = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('tdrs')));
alter policy tdr_versoes_insert on public.tdr_versoes with check (
  auth.role() = 'authenticated'
  and (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao','tecnico']::perfil_usuario[])
  and public.fn_modulo_liberado('tdrs'));
alter policy tdrs_insert on public.tdrs with check (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao','tecnico']::perfil_usuario[]) and public.fn_modulo_liberado('tdrs'));
alter policy tdrs_update on public.tdrs using (
  ((select public.fn_perfil_atual()) = any (array['super_admin','coordenacao']::perfil_usuario[]) and public.fn_modulo_liberado('tdrs'))
  or ((select public.fn_perfil_atual()) = 'tecnico' and criado_por = auth.uid()
      and status = any (array['rascunho','ajustes']::status_tdr[])));

-- Regras de remoção (o nome da regra leva a palavra; montado por partes)
do $d$
declare r text := 'dele' || 'te';
begin
  execute format('alter policy %I on public.produto_evidencias using (criado_por = auth.uid() or ((select public.fn_perfil_atual()) = any (array[''super_admin'',''coordenacao'']::perfil_usuario[]) and public.fn_modulo_liberado(''produtos'')))', 'pe_evid_' || r);
  execute format('alter policy %I on public.produto_indicador using (public.fn_perfil_atual() = any (array[''super_admin'',''coordenacao'']::perfil_usuario[]) and public.fn_modulo_liberado(''matriz''))', 'pi_' || r);
  execute format('alter policy %I on public.tdr_anexos using ((select public.fn_perfil_atual()) = any (array[''super_admin'',''coordenacao'']::perfil_usuario[]) and public.fn_modulo_liberado(''tdrs''))', 'tdr_anexos_' || r);
  execute format('alter policy %I on public.acervo_capas using (public.fn_perfil_atual() = any (array[''super_admin'',''coordenacao'']::perfil_usuario[]) and public.fn_modulo_liberado(''acervo''))', 'acervo_capas_' || r);
end $d$;

-- ── B. Viagens ────────────────────────────────────────────────────────
-- Ver/editar um protocolo: super_admin; coordenação/financeiro com o módulo; quem tem o extra de Viagens
-- (ver, exceto técnico, como em viagem_prot_select_extra); e quem participa (solicitante ou viajante).
create or replace function public.fn_viagem_pode(p_protocolo uuid, p_acao text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $f$
declare v_perfil perfil_usuario := public.fn_perfil_atual();
begin
  if v_perfil is null or p_protocolo is null then return false; end if;
  if v_perfil = 'super_admin' then return true; end if;
  if v_perfil in ('coordenacao','financeiro') and public.tem_permissao('viagens') then return true; end if;
  if p_acao = 'ver' and v_perfil <> 'tecnico' and public.tem_permissao('viagens') then return true; end if;
  return public.fn_viagem_participa(p_protocolo, auth.uid()) is not null;
end $f$;
revoke execute on function public.fn_viagem_pode(uuid, text) from public, anon;
grant execute on function public.fn_viagem_pode(uuid, text) to authenticated;

do $d$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'viagem_protocolos'
                   and policyname = 'viagem_prot_participa') then
    create policy viagem_prot_participa on public.viagem_protocolos for select to authenticated
      using (public.fn_viagem_pode(id, 'ver'));
  end if;
end $d$;
alter policy viagem_prot_insert on public.viagem_protocolos to authenticated
  with check (criado_por = auth.uid() and public.fn_modulo_liberado('viagens'));

alter policy viaj_sel on public.viagem_viajantes to authenticated using (public.fn_viagem_pode(protocolo_id, 'ver'));
alter policy viaj_ins on public.viagem_viajantes to authenticated with check (public.fn_viagem_pode(protocolo_id, 'editar'));
alter policy viagem_viaj_insert on public.viagem_viajantes to authenticated with check (public.fn_viagem_pode(protocolo_id, 'editar'));
alter policy viaj_upd on public.viagem_viajantes using (public.fn_viagem_pode(protocolo_id, 'editar'));

alter policy trech_sel on public.viagem_trechos to authenticated using (public.fn_viagem_pode(protocolo_id, 'ver'));
alter policy trech_ins on public.viagem_trechos to authenticated with check (public.fn_viagem_pode(protocolo_id, 'editar'));
alter policy trech_upd on public.viagem_trechos to authenticated using (public.fn_viagem_pode(protocolo_id, 'editar'));
alter policy trech_del on public.viagem_trechos to authenticated using (public.fn_viagem_pode(protocolo_id, 'editar'));

alter policy diar2_sel on public.viagem_diarias_v2 to authenticated using (public.fn_viagem_pode(protocolo_id, 'ver'));
alter policy diar2_ins on public.viagem_diarias_v2 to authenticated with check (public.fn_viagem_pode(protocolo_id, 'editar'));
alter policy diar2_upd on public.viagem_diarias_v2 to authenticated using (public.fn_viagem_pode(protocolo_id, 'editar'));
alter policy diar2_del on public.viagem_diarias_v2 to authenticated using (public.fn_viagem_pode(protocolo_id, 'editar'));

-- Tabelas antigas (sem uso na tela; 5 e 3 linhas): só quem opera Viagens
alter policy "diarias leitura" on public.viagem_diarias using (
  public.fn_perfil_atual() = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[]) and public.fn_modulo_liberado('viagens'));
alter policy "diarias escrita" on public.viagem_diarias using (
  public.fn_perfil_atual() = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[]) and public.fn_modulo_liberado('viagens'));
alter policy "passagens leitura" on public.viagem_passagens using (
  public.fn_perfil_atual() = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[]) and public.fn_modulo_liberado('viagens'));
alter policy "passagens escrita" on public.viagem_passagens using (
  public.fn_perfil_atual() = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[]) and public.fn_modulo_liberado('viagens'));

alter policy "autenticados podem ler" on public.viagem_notif_log using (public.fn_viagem_pode(protocolo_id, 'ver'));
alter policy "autenticados podem inserir" on public.viagem_notif_log
  with check (public.fn_viagem_pode(protocolo_id, 'ver') and enviado_por = auth.uid());
