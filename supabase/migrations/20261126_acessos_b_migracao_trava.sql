-- 26/11/2026 · Acessos (parte B): revisão inicial dos acessos + trava no banco, numa transação só.
--
-- 1. Quem já está cadastrado ganha, como LIBERAÇÃO, tudo o que o perfil dava (nada muda hoje):
--    - responsável ou substituto ativo de alguma atividade: liberação permanente (sem revisão);
--    - os demais: liberação "em revisão" que cai em 15 dias se o super_admin não confirmar.
--      Os acessos extras que já existiam também entram em revisão (o prazo antigo fica guardado).
-- 2. As policies e funções de Contratos, Financeiro, Fornecedores, Viagens/Beneficiários,
--    Patrimônio e Diagnóstico passam a exigir o módulo liberado no trecho do PERFIL. Os trechos de
--    VÍNCULO (responsável da atividade, fornecedor vinculado, quem criou a viagem, quem guarda o
--    bem) não mudam.
--    Regra: dentro do teto do perfil, a liberação dá o que o perfil já dava; fora dele, o "extra"
--    continua como era. Por isso o extra de Viagens (ver todos os protocolos) não vale para técnico.
-- Sem palavra de comando de apagar no texto (o apply_migration espera confirmação nela).

select set_config('dima.acesso_migracao', '1', true);
update public.acesso_regras set inatividade_desde = now(), revisao_ate = now() + interval '15 days', atualizado_em = now();

-- ── 1a. O que o perfil dava vira liberação ────────────────────────────
with resp as (
  select distinct usuario_id from public.atividade_responsaveis where ativo
), quem as (
  select id from public.usuarios where perfil = 'super_admin' and ativo order by criado_em limit 1
)
insert into public.usuario_permissoes (usuario_id, modulo, ativo, valido_de, valido_ate, concedido_por, concedido_em,
                                       motivo, em_revisao)
select u.id, m.modulo, true, now(),
       case when r.usuario_id is null then now() + interval '15 days' end,
       (select id from quem), now(),
       'Migração 26/11/2026: acesso que o perfil já dava'
         || case when r.usuario_id is null then ' (em revisão)' else ' (responsável de atividade)' end,
       r.usuario_id is null
  from public.usuarios u
  join public.acesso_modulos m on not m.nucleo and (m.perfis is null or u.perfil = any (m.perfis))
  left join resp r on r.usuario_id = u.id
 where u.ativo and u.perfil <> 'super_admin'
on conflict (usuario_id, modulo) do update
  set ativo = true,
      valido_de = least(public.usuario_permissoes.valido_de, now()),
      valido_ate = excluded.valido_ate,
      em_revisao = excluded.em_revisao,
      revisao_valido_ate_original = null,
      revogado_por = null, revogado_em = null;

-- ── 1b. Extras que já existiam, de quem não é responsável: em revisão ──
update public.usuario_permissoes p
   set em_revisao = true,
       revisao_valido_ate_original = p.valido_ate,
       valido_ate = least(coalesce(p.valido_ate, 'infinity'::timestamptz), now() + interval '15 days')
  from public.usuarios u
 where u.id = p.usuario_id and u.ativo and u.perfil <> 'super_admin'
   and p.ativo and not p.em_revisao
   and (p.valido_ate is null or p.valido_ate > now())
   and p.motivo is distinct from 'Migração 26/11/2026: acesso que o perfil já dava (responsável de atividade)'
   and p.motivo is distinct from 'Migração 26/11/2026: acesso que o perfil já dava (em revisão)'
   and not exists (select 1 from public.atividade_responsaveis ar where ar.usuario_id = u.id and ar.ativo);

-- ── 1c. Entrevistadores do Diagnóstico (consultores externos): confirmados por decisão do super_admin ──
-- Os acessos do Diagnóstico deles saem da revisão e voltam ao prazo que já tinham; o resto segue em revisão.
update public.usuario_permissoes p
   set em_revisao = false,
       valido_ate = p.revisao_valido_ate_original,
       revisao_valido_ate_original = null,
       revisado_em = now(),
       motivo = coalesce(p.motivo, '') || ' · confirmado na migração (entrevistador do Diagnóstico)'
  from public.usuarios u
 where u.id = p.usuario_id and u.ativo and u.perfil = 'consultor_externo'
   and p.em_revisao and p.modulo in ('diagnostico_entrevistador', 'diagnostico', 'diagnostico_treino')
   and exists (select 1 from public.usuario_permissoes e
                where e.usuario_id = u.id and e.modulo = 'diagnostico_entrevistador' and e.ativo);

-- ── 2. Trava no banco ─────────────────────────────────────────────────
-- Contratos
alter policy contratos_select on public.contratos using (
  coalesce(public.fn_perfil_atual() = 'super_admin', false)
  or public.tem_permissao('contratos')
  or exists (select 1 from public.atividade_responsaveis ar
              where ar.atividade_id = contratos.atividade_id and ar.usuario_id = auth.uid() and ar.ativo = true)
  or public.fn_eh_fornecedor_vinculado(fornecedor_id));
alter policy contratos_write on public.contratos using (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[])
  and public.fn_modulo_liberado('contratos'));

-- Financeiro (visualizador segue lendo pelo perfil: a Visão Geral, aberta a todos, usa os lançamentos)
alter policy ef_select on public.execucao_financeira using (
  coalesce((select public.fn_perfil_atual()) = any (array['super_admin','visualizador']::perfil_usuario[]), false)
  or (coalesce((select public.fn_perfil_atual()) = any (array['coordenacao','financeiro']::perfil_usuario[]), false)
      and public.tem_permissao('financeiro')));
alter policy ef_write on public.execucao_financeira using (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[])
  and public.fn_modulo_liberado('financeiro'));

-- Fornecedores
alter policy forn_select_all on public.fornecedores using (
  coalesce(public.fn_perfil_atual() = 'super_admin', false)
  or public.tem_permissao('fornecedores') or public.tem_permissao('financeiro')
  or public.tem_permissao('contratos') or public.tem_permissao('relatorios_fornecedores')
  or exists (select 1 from public.contratos c where c.fornecedor_id = fornecedores.id)
  or exists (select 1 from public.tdrs t where t.fornecedor_id = fornecedores.id)
  or exists (select 1 from public.execucao_financeira e where e.fornecedor_id = fornecedores.id)
  or exists (select 1 from public.tarefas k where k.fornecedor_id = fornecedores.id)
  or exists (select 1 from public.tarefa_checklist s where s.responsavel_fornecedor_id = fornecedores.id));
alter policy forn_write on public.fornecedores using (
  (select public.fn_perfil_atual()) = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[])
  and (public.fn_modulo_liberado('fornecedores') or public.fn_modulo_liberado('contratos')));
alter policy fdb_select on public.fornecedor_dados_bancarios using (
  public.fn_perfil_atual() = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[])
  and (public.fn_modulo_liberado('fornecedores') or public.fn_modulo_liberado('financeiro')));
alter policy fdb_insert on public.fornecedor_dados_bancarios with check (
  public.fn_perfil_atual() = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[])
  and (public.fn_modulo_liberado('fornecedores') or public.fn_modulo_liberado('financeiro')));
alter policy fdb_update on public.fornecedor_dados_bancarios
  using (public.fn_perfil_atual() = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[])
         and (public.fn_modulo_liberado('fornecedores') or public.fn_modulo_liberado('financeiro')))
  with check (public.fn_perfil_atual() = any (array['super_admin','coordenacao','financeiro']::perfil_usuario[])
         and (public.fn_modulo_liberado('fornecedores') or public.fn_modulo_liberado('financeiro')));

-- Viagens: o técnico com o módulo continua vendo só os próprios protocolos (como o perfil dava)
alter policy viagem_prot_select on public.viagem_protocolos using (
  coalesce((select public.fn_perfil_atual()) = 'super_admin', false) or criado_por = auth.uid());
alter policy viagem_prot_select_extra on public.viagem_protocolos using (
  public.tem_permissao('viagens') and public.fn_perfil_atual() is distinct from 'tecnico');
alter policy viagem_prot_update on public.viagem_protocolos using (
  coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
  or ((select public.fn_perfil_atual()) = 'coordenacao' and public.tem_permissao('viagens'))
  or (criado_por = auth.uid() and (situacao)::text = 'solicitado'));
alter policy viagem_viaj_select on public.viagem_viajantes using (
  exists (select 1 from public.viagem_protocolos p where p.id = viagem_viajantes.protocolo_id
           and (coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
                or (coalesce((select public.fn_perfil_atual()) = any (array['coordenacao','financeiro']::perfil_usuario[]), false)
                    and public.tem_permissao('viagens'))
                or p.criado_por = auth.uid())));
alter policy viagem_viaj_update on public.viagem_viajantes using (
  exists (select 1 from public.viagem_protocolos p where p.id = viagem_viajantes.protocolo_id
           and (coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
                or ((select public.fn_perfil_atual()) = 'coordenacao' and public.tem_permissao('viagens'))
                or p.criado_por = auth.uid())));
alter policy viagem_viaj_delete on public.viagem_viajantes using (
  exists (select 1 from public.viagem_protocolos p where p.id = viagem_viajantes.protocolo_id
           and (coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
                or ((select public.fn_perfil_atual()) = 'coordenacao' and public.tem_permissao('viagens'))
                or p.criado_por = auth.uid())));
alter policy viaj_upd on public.viagem_viajantes using (
  exists (select 1 from public.viagem_protocolos p where p.id = viagem_viajantes.protocolo_id
           and (coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
                or (coalesce((select public.fn_perfil_atual()) = any (array['coordenacao','financeiro']::perfil_usuario[]), false)
                    and public.tem_permissao('viagens'))
                or p.criado_por = auth.uid())));

-- Beneficiários (identidade: quem opera Viagens; dados bancários: só com o módulo Beneficiários)
alter policy beneficiarios_select on public.beneficiarios using (
  coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
  or (coalesce((select public.fn_perfil_atual()) = any (array['coordenacao','financeiro','tecnico']::perfil_usuario[]), false)
      and (public.tem_permissao('viagens') or public.tem_permissao('beneficiarios'))));
alter policy beneficiarios_insert on public.beneficiarios with check (
  coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
  or ((select public.fn_perfil_atual()) = 'coordenacao' and (public.tem_permissao('beneficiarios') or public.tem_permissao('viagens'))));
alter policy beneficiarios_update on public.beneficiarios
  using (coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
         or ((select public.fn_perfil_atual()) = 'coordenacao' and (public.tem_permissao('beneficiarios') or public.tem_permissao('viagens'))))
  with check (coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
         or ((select public.fn_perfil_atual()) = 'coordenacao' and (public.tem_permissao('beneficiarios') or public.tem_permissao('viagens'))));
alter policy benef_banc_select on public.beneficiario_dados_bancarios using (
  coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
  or ((select public.fn_perfil_atual()) = 'coordenacao' and public.tem_permissao('beneficiarios')));
alter policy benef_banc_insert on public.beneficiario_dados_bancarios with check (
  coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
  or ((select public.fn_perfil_atual()) = 'coordenacao' and public.tem_permissao('beneficiarios')));
alter policy benef_banc_update on public.beneficiario_dados_bancarios
  using (coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
         or ((select public.fn_perfil_atual()) = 'coordenacao' and public.tem_permissao('beneficiarios')))
  with check (coalesce((select public.fn_perfil_atual()) = 'super_admin', false)
         or ((select public.fn_perfil_atual()) = 'coordenacao' and public.tem_permissao('beneficiarios')));

-- Patrimônio (quem guarda o bem segue vendo o próprio bem pela policy pat_bens_responsavel)
create or replace function public.fn_pat_pode_gerir()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce(public.fn_perfil_atual() = 'super_admin', false)
      or (coalesce(public.fn_perfil_atual() = 'coordenacao', false) and public.tem_permissao('patrimonio_catalogo'))
      or (public.fn_perfil_atual() is not null and public.tem_permissao('patrimonio_gestor'))
$function$;
create or replace function public.fn_pat_pode_coordenar()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce(public.fn_perfil_atual() = 'super_admin', false)
      or (coalesce(public.fn_perfil_atual() = 'coordenacao', false) and public.tem_permissao('patrimonio_catalogo'))
$function$;
create or replace function public.fn_pat_pode_ver()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce(public.fn_perfil_atual() = 'super_admin', false)
      or public.fn_pat_pode_gerir()
      or public.tem_permissao('patrimonio_catalogo')
      or public.tem_permissao('patrimonio')
$function$;
create or replace function public.fn_pat_pode_ver_valor()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.fn_pat_pode_gerir() or public.tem_permissao('patrimonio')
$function$;

-- Diagnóstico (gerir = super_admin ou coordenação com o módulo)
create or replace function public.fn_diag_pode_gerir()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce(fn_diag_perfil_ativo() = 'super_admin'
                  or (fn_diag_perfil_ativo() = 'coordenacao' and tem_permissao('diagnostico')), false)
$function$;
