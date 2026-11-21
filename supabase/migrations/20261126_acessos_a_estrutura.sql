-- 26/11/2026 · Acessos por módulo liberado + bloqueio por inatividade (parte A: estrutura).
--
-- Modelo novo (plano em docs/usuarios/plano-acessos.md):
--   * O PERFIL é o teto do que a pessoa faz num módulo; a LIBERAÇÃO (linha ativa em
--     usuario_permissoes) é a chave. Usuário novo nasce sem nada liberado.
--   * Núcleo sempre aberto: Visão Geral, Minhas tarefas, Ajuda e Meu perfil.
--   * Acesso por VÍNCULO (responsável da atividade, titular de cargo, fornecedor vinculado,
--     quem criou a viagem, quem guarda o bem) não depende de módulo.
--   * super_admin nunca é bloqueado (nem por módulo, nem por inatividade) e o banco exige
--     pelo menos 2 super_admins ativos.
--   * 15 dias sem atividade (mesa OU app de campo OU login) ⇒ entrada suspensa até um
--     super_admin liberar; liberado, a pessoa tem 3 dias para entrar.
--
-- Sem palavra de comando de apagar no texto (o apply_migration espera confirmação nela).

-- ── 1. Catálogo dos módulos liberáveis ────────────────────────────────
-- Espelha MODULOS_LISTA de js/usuarios.js (rótulo, teto por perfil, núcleo). Mudou num ⇒ muda no outro.
-- perfis NULL = todos os perfis; '{}' = nenhum perfil tem por padrão (só por concessão).
create table if not exists public.acesso_modulos (
  modulo   text primary key check (modulo ~ '^[a-z_]{2,40}$'),
  rotulo   text not null,
  perfis   perfil_usuario[],
  nucleo   boolean not null default false,
  ordem    int not null default 100
);
alter table public.acesso_modulos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'acesso_modulos' and policyname = 'acesso_modulos_ler') then
    create policy acesso_modulos_ler on public.acesso_modulos for select to authenticated using (true);
  end if;
end $$;
grant select on public.acesso_modulos to authenticated;

insert into public.acesso_modulos (modulo, rotulo, perfis, nucleo, ordem) values
  ('dashboard',      'Visão Geral', null, true, 1),
  ('tarefas',        'Minhas tarefas', null, true, 2),
  ('ajuda',          'Manual do sistema', null, true, 3),
  ('atividades',     'Atividades', null, false, 10),
  ('tdrs',           'TDRs', null, false, 11),
  ('matriz',         'Matriz de Resultados', null, false, 12),
  ('remanejamentos', 'Remanejamento', null, false, 13),
  ('fornecedores',   'Fornecedores', '{super_admin,coordenacao,financeiro}', false, 20),
  ('contratos',      'Contratos', '{super_admin,coordenacao,financeiro}', false, 21),
  ('produtos',       'Produtos Entregues', '{super_admin,coordenacao,tecnico}', false, 22),
  ('acervo',         'Acervo Digital', '{super_admin,coordenacao,financeiro,tecnico}', false, 23),
  ('financeiro',     'Financeiro', '{super_admin,coordenacao,financeiro}', false, 24),
  ('patrimonio_catalogo', 'Patrimônio — catálogo', '{super_admin,coordenacao,financeiro,tecnico,visualizador}', false, 25),
  ('patrimonio',     'Patrimônio — ver valores', '{super_admin,coordenacao,financeiro}', false, 26),
  ('patrimonio_gestor', 'Patrimônio — gestor patrimonial', '{super_admin}', false, 27),
  ('diagnostico',    'Diagnóstico Socioambiental', '{super_admin,coordenacao}', false, 28),
  ('diagnostico_entrevistador', 'Diagnóstico — entrevistador (app de campo)', '{}', false, 29),
  ('diagnostico_treino', 'Diagnóstico — modo treino', '{super_admin}', false, 30),
  ('viagens',        'Viagens', '{super_admin,coordenacao,financeiro,tecnico}', false, 40),
  ('beneficiarios',  'Beneficiários', '{super_admin,coordenacao}', false, 41),
  ('mapa',           'Mapa Interativo', null, false, 42),
  ('repositorio',    'Repositório', null, false, 43),
  ('formularios',    'Guia Formulários', null, false, 44),
  ('pulso',          'Pulso da Equipe', null, false, 45),
  ('auditoria',      'Auditoria IA', '{super_admin,coordenacao}', false, 46),
  ('ropa',           'Privacidade (ROPA)', '{super_admin,coordenacao}', false, 47),
  ('usuarios',       'Usuários', '{super_admin}', false, 48),
  ('relatorios_financeiro',   'Relatório Financeiro', '{super_admin,coordenacao}', false, 60),
  ('relatorios_contratos',    'Relatório Contratos', '{super_admin,coordenacao}', false, 61),
  ('relatorios_fornecedores', 'Relatório Fornecedores', '{super_admin,coordenacao}', false, 62),
  ('relatorios_produtos',     'Relatório Produtos/Entregas', '{super_admin,coordenacao}', false, 63),
  ('relatorios_tdrs',         'Relatório TDRs', '{super_admin,coordenacao}', false, 64),
  ('relatorios_atividades',   'Relatório Atividades', '{super_admin,coordenacao,financeiro}', false, 65),
  ('relatorios_orcamento',    'Relatório Orçamento e remanejamento', '{super_admin,coordenacao,financeiro}', false, 66),
  ('relatorios_matriz',       'Relatório Matriz', '{super_admin,coordenacao}', false, 67),
  ('relatorios_viagens',      'Relatório Viagens', '{super_admin,coordenacao}', false, 68),
  ('relatorios_patrimonio',   'Relatório Patrimônio', '{super_admin,coordenacao,financeiro}', false, 69),
  ('dashboard_cobertura',     'Cobertura de Indicadores (Visão Geral)', '{super_admin,coordenacao}', false, 70)
on conflict (modulo) do update set rotulo = excluded.rotulo, perfis = excluded.perfis,
  nucleo = excluded.nucleo, ordem = excluded.ordem;

-- ── 2. Regras (uma linha só) ──────────────────────────────────────────
create table if not exists public.acesso_regras (
  id                 boolean primary key default true check (id),
  dias_inatividade   int not null default 15 check (dias_inatividade between 5 and 365),
  dias_aviso         int not null default 12,
  dias_carencia      int not null default 3,
  dias_revisao       int not null default 15,
  dias_aviso_prazo   int not null default 7,
  inatividade_desde  timestamptz not null default now(),   -- a contagem só começa aqui (implantação)
  revisao_ate        timestamptz,                          -- prazo da revisão da migração
  atualizado_em      timestamptz not null default now()
);
alter table public.acesso_regras enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'acesso_regras' and policyname = 'acesso_regras_ler') then
    create policy acesso_regras_ler on public.acesso_regras for select to authenticated using (true);
  end if;
end $$;
grant select on public.acesso_regras to authenticated;
insert into public.acesso_regras (id) values (true) on conflict (id) do nothing;

-- ── 3. Colunas novas ──────────────────────────────────────────────────
alter table public.usuarios
  add column if not exists ultimo_acesso_app_em      timestamptz,
  add column if not exists bloqueado_inatividade_em  timestamptz,
  add column if not exists liberado_inatividade_em   timestamptz,
  add column if not exists liberado_inatividade_por  uuid references public.usuarios(id),
  add column if not exists aviso_inatividade_em      timestamptz;

alter table public.usuario_permissoes
  add column if not exists em_revisao                 boolean not null default false,
  add column if not exists revisao_valido_ate_original timestamptz,  -- prazo que valia antes da revisão
  add column if not exists revisado_por               uuid references public.usuarios(id),
  add column if not exists revisado_em                timestamptz,
  add column if not exists aviso_vencimento_em        timestamptz;

-- ── 4. Pedidos (de módulo, pela própria pessoa; de liberação, na tela de entrada) ──
create table if not exists public.usuario_pedidos_acesso (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('modulo','liberacao')),
  usuario_id    uuid not null references public.usuarios(id),
  modulo        text references public.acesso_modulos(modulo),
  justificativa text check (justificativa is null or length(justificativa) <= 1000),
  origem        text not null default 'plataforma' check (origem in ('plataforma','entrada')),
  status        text not null default 'pendente' check (status in ('pendente','aprovado','recusado','cancelado')),
  valido_ate    timestamptz,
  parecer       text check (parecer is null or length(parecer) <= 1000),
  decidido_por  uuid references public.usuarios(id),
  decidido_em   timestamptz,
  criado_em     timestamptz not null default now(),
  check (tipo = 'liberacao' or modulo is not null)
);
create index if not exists usuario_pedidos_acesso_pend on public.usuario_pedidos_acesso (status, criado_em);
create unique index if not exists usuario_pedidos_acesso_um_vivo
  on public.usuario_pedidos_acesso (usuario_id, tipo, coalesce(modulo, '')) where status = 'pendente';
alter table public.usuario_pedidos_acesso enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'usuario_pedidos_acesso' and policyname = 'upa_ler') then
    create policy upa_ler on public.usuario_pedidos_acesso for select to authenticated
      using (usuario_id = auth.uid() or coalesce(public.fn_perfil_atual() = 'super_admin', false));
  end if;
end $$;
grant select on public.usuario_pedidos_acesso to authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_usuario_pedidos_acesso') then
    execute 'create trigger trg_audit_usuario_pedidos_acesso after insert or update on public.usuario_pedidos_acesso '
         || 'for each row execute function public.fn_trg_audit()';
  end if;
end $$;

-- ── 5. Fila de e-mail (drenada por assinar-remanejamento → _shared/acesso-email.ts) ──
create table if not exists public.acesso_notificacoes (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid references public.usuarios(id),
  evento      text not null check (evento in ('aviso_inatividade','bloqueado','liberado','resumo_bloqueios','pedido_decidido')),
  para_email  text not null,
  dados       jsonb not null default '{}'::jsonb,
  tentativas  int not null default 0,
  enviado_em  timestamptz,
  erro        text,
  criado_em   timestamptz not null default now()
);
create index if not exists acesso_notificacoes_fila on public.acesso_notificacoes (criado_em) where enviado_em is null;
alter table public.acesso_notificacoes enable row level security;   -- sem policy nem grant: só service_role
revoke all on public.acesso_notificacoes from public, anon, authenticated;

-- ── 6. Quem está ativo agora: conta ativa E não suspensa por inatividade ──
create or replace function public.fn_perfil_atual()
returns perfil_usuario language sql stable security definer set search_path to 'public' as $function$
  select perfil from public.usuarios where id = auth.uid() and ativo and bloqueado_inatividade_em is null;
$function$;

create or replace function public.tem_permissao(p_modulo text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.usuario_permissoes p
      join public.usuarios u on u.id = p.usuario_id and u.ativo and u.bloqueado_inatividade_em is null
     where p.usuario_id = auth.uid()
       and p.modulo = p_modulo
       and p.ativo = true
       and p.valido_de <= now()
       and (p.valido_ate is null or p.valido_ate > now())
  );
$function$;

-- O Diagnóstico tem o próprio "perfil ativo" (app de campo): mesma regra.
create or replace function public.fn_diag_perfil_ativo()
returns perfil_usuario language sql stable security definer set search_path to 'public' as $function$
  select perfil from public.usuarios where id = auth.uid() and ativo and bloqueado_inatividade_em is null
$function$;

-- Módulo liberado para quem chama: super_admin sempre; os demais, com liberação ativa e no prazo.
create or replace function public.fn_modulo_liberado(p_modulo text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce(public.fn_perfil_atual() = 'super_admin', false) or public.tem_permissao(p_modulo);
$function$;
revoke execute on function public.fn_modulo_liberado(text) from public;
grant execute on function public.fn_modulo_liberado(text) to anon, authenticated;

-- Última atividade (mesa, app de campo, login) — base do bloqueio por inatividade.
-- A liberação conta como atividade de (dias_inatividade − dias_carencia) dias atrás: sem entrar,
-- a pessoa volta a ser bloqueada no fim da carência.
create or replace function public.fn_usuario_ultima_atividade(p_usuario uuid)
returns timestamptz language sql stable security definer set search_path to 'public', 'auth' as $function$
  select greatest(u.ultimo_acesso_em, u.ultimo_acesso_app_em, a.last_sign_in_at, u.criado_em, r.inatividade_desde,
                  u.liberado_inatividade_em - make_interval(days => r.dias_inatividade - r.dias_carencia))
    from public.usuarios u
    left join auth.users a on a.id = u.id
    cross join public.acesso_regras r
   where u.id = p_usuario;
$function$;
revoke execute on function public.fn_usuario_ultima_atividade(uuid) from public, anon, authenticated;

-- ── 7. Banimento no Auth: desativado OU suspenso por inatividade ──────
create or replace function public.fn_trg_usuario_ban()
returns trigger language plpgsql security definer set search_path to 'public', 'auth' as $function$
declare
  v_antes boolean := (not old.ativo) or old.bloqueado_inatividade_em is not null;
  v_agora boolean := (not new.ativo) or new.bloqueado_inatividade_em is not null;
begin
  if v_antes is distinct from v_agora then
    update auth.users
       set banned_until = case when v_agora then '2999-12-31 00:00:00+00'::timestamptz else null end,
           updated_at = now()
     where id = new.id;
  end if;
  return new;
end;
$function$;
create or replace trigger trg_usuario_ban after update of ativo, bloqueado_inatividade_em on public.usuarios
  for each row execute function public.fn_trg_usuario_ban();

-- ── 8. Travas em usuarios: campos de inatividade só pelo sistema; mínimo de 2 super_admins ──
create or replace function public.fn_trg_usuario_guarda_acesso()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_outros int;
begin
  if (new.ultimo_acesso_app_em     is distinct from old.ultimo_acesso_app_em
   or new.bloqueado_inatividade_em is distinct from old.bloqueado_inatividade_em
   or new.liberado_inatividade_em  is distinct from old.liberado_inatividade_em
   or new.liberado_inatividade_por is distinct from old.liberado_inatividade_por
   or new.aviso_inatividade_em     is distinct from old.aviso_inatividade_em)
     and auth.uid() is not null
     and current_setting('dima.acesso', true) is distinct from 'rpc' then
    raise exception 'ACESSO_PROTEGIDO: a situação de inatividade só muda pelas funções do sistema' using errcode = '42501';
  end if;

  if new.perfil = 'super_admin' and new.bloqueado_inatividade_em is not null then
    raise exception 'ACESSO_PROTEGIDO: super_admin nunca é bloqueado por inatividade' using errcode = '42501';
  end if;

  if old.perfil = 'super_admin' and old.ativo
     and (new.perfil is distinct from 'super_admin' or not new.ativo) then
    select count(*) into v_outros from public.usuarios
     where perfil = 'super_admin' and ativo and id <> old.id;
    if v_outros < 2 then
      raise exception 'MINIMO_SUPER_ADMIN: a plataforma precisa de pelo menos 2 super_admins ativos' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;
revoke execute on function public.fn_trg_usuario_guarda_acesso() from public, anon, authenticated;
create or replace trigger trg_usuario_guarda_acesso before update on public.usuarios
  for each row execute function public.fn_trg_usuario_guarda_acesso();

-- ── 9. Aviso no sino que não derruba a operação ───────────────────────
-- Os tipos acesso_* entram no check de notificacoes pelo _sql_editor.sql (exige trocar o check).
-- Até lá o aviso é descartado em silêncio e o e-mail continua saindo.
create or replace function public.fn_acesso_avisar(p_usuario uuid, p_tipo text, p_titulo text, p_msg text, p_link text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  begin
    insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, lida, criado_em)
    values (p_usuario, p_tipo, p_titulo, p_msg, p_link, false, now());
  exception when check_violation then null;
  end;
end;
$function$;
revoke execute on function public.fn_acesso_avisar(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.fn_acesso_avisar_admins(p_tipo text, p_titulo text, p_msg text, p_link text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r record;
begin
  for r in select id from public.usuarios where perfil = 'super_admin' and ativo loop
    perform public.fn_acesso_avisar(r.id, p_tipo, p_titulo, p_msg, p_link);
  end loop;
end;
$function$;
revoke execute on function public.fn_acesso_avisar_admins(text, text, text, text) from public, anon, authenticated;

-- ── 10. A pessoa é avisada quando a liberação muda ────────────────────
create or replace function public.fn_trg_uperm_aviso()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_rot text;
  v_ate text;
begin
  if current_setting('dima.acesso_migracao', true) = '1' then return new; end if;
  select rotulo into v_rot from public.acesso_modulos where modulo = new.modulo;
  v_rot := coalesce(v_rot, new.modulo);
  v_ate := case when new.valido_ate is null then 'sem data de fim'
                else 'até ' || to_char(new.valido_ate at time zone 'America/Rio_Branco', 'DD/MM/YYYY') end;
  if tg_op = 'INSERT' and new.ativo then
    perform public.fn_acesso_avisar(new.usuario_id, 'acesso_alterado', 'Acesso liberado: ' || v_rot,
      'O administrador liberou o módulo ' || v_rot || ' (' || v_ate || ').', null);
  elsif tg_op = 'UPDATE' then
    if new.ativo and not old.ativo then
      perform public.fn_acesso_avisar(new.usuario_id, 'acesso_alterado', 'Acesso liberado: ' || v_rot,
        'O administrador liberou o módulo ' || v_rot || ' (' || v_ate || ').', null);
    elsif old.ativo and not new.ativo then
      perform public.fn_acesso_avisar(new.usuario_id, 'acesso_alterado', 'Acesso retirado: ' || v_rot,
        'O módulo ' || v_rot || ' não está mais liberado para você. Se precisar, peça o acesso de novo.', 'sem-acesso.html');
    elsif new.ativo and new.valido_ate is distinct from old.valido_ate and not (old.em_revisao and not new.em_revisao) then
      perform public.fn_acesso_avisar(new.usuario_id, 'acesso_alterado', 'Prazo do acesso mudou: ' || v_rot,
        'O módulo ' || v_rot || ' agora vale ' || v_ate || '.', null);
    end if;
  end if;
  return new;
end;
$function$;
revoke execute on function public.fn_trg_uperm_aviso() from public, anon, authenticated;
create or replace trigger trg_uperm_aviso after insert or update on public.usuario_permissoes
  for each row execute function public.fn_trg_uperm_aviso();

-- ── 11. App de campo registra o acesso (a mesa grava ultimo_acesso_em em carregarUsuario) ──
create or replace function public.fn_registrar_acesso(p_origem text default 'app')
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or p_origem is distinct from 'app' then return; end if;
  perform set_config('dima.acesso', 'rpc', true);
  update public.usuarios set ultimo_acesso_app_em = now()
   where id = auth.uid() and ativo and bloqueado_inatividade_em is null;
end;
$function$;
revoke execute on function public.fn_registrar_acesso(text) from public, anon;
grant execute on function public.fn_registrar_acesso(text) to authenticated;

-- ── 12. Vínculos de quem chama (abrem páginas sem módulo liberado) ─────
create or replace function public.fn_meus_vinculos()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object(
    'responsavel', exists (select 1 from public.atividade_responsaveis where usuario_id = auth.uid() and ativo),
    'titular',     exists (select 1 from public.rem_cargo_titulares where usuario_id = auth.uid()
                             and vigencia_inicio <= current_date and (vigencia_fim is null or vigencia_fim >= current_date)),
    'fornecedor',  exists (select 1 from public.fornecedor_usuarios where usuario_id = auth.uid() and ativo)
  ) where public.fn_perfil_atual() is not null;
$function$;
revoke execute on function public.fn_meus_vinculos() from public, anon;
grant execute on function public.fn_meus_vinculos() to authenticated;

-- ── 13. Pedido de acesso a um módulo (a própria pessoa) ───────────────
create or replace function public.fn_acesso_pedir(p_modulo text, p_justificativa text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_rot text;
  v_id uuid;
begin
  if v_uid is null or public.fn_perfil_atual() is null then
    raise exception 'ACESSO_NEGADO: entre na plataforma para pedir acesso' using errcode = '42501';
  end if;
  select rotulo into v_rot from public.acesso_modulos where modulo = p_modulo and not nucleo;
  if v_rot is null then raise exception 'MODULO_INVALIDO: módulo não encontrado'; end if;
  if public.fn_modulo_liberado(p_modulo) then raise exception 'ACESSO_JA_LIBERADO: você já tem este módulo'; end if;
  select id into v_id from public.usuario_pedidos_acesso
   where usuario_id = v_uid and tipo = 'modulo' and modulo = p_modulo and status = 'pendente';
  if v_id is not null then return v_id; end if;
  insert into public.usuario_pedidos_acesso (tipo, usuario_id, modulo, justificativa, origem)
  values ('modulo', v_uid, p_modulo, nullif(trim(coalesce(p_justificativa, '')), ''), 'plataforma')
  returning id into v_id;
  select nome_completo into v_nome from public.usuarios where id = v_uid;
  perform public.fn_acesso_avisar_admins('acesso_pedido', 'Pedido de acesso: ' || v_rot,
    coalesce(v_nome, 'Um usuário') || ' pediu o módulo ' || v_rot || '.', 'usuarios.html?pedidos=1');
  return v_id;
end;
$function$;
revoke execute on function public.fn_acesso_pedir(text, text) from public, anon;
grant execute on function public.fn_acesso_pedir(text, text) to authenticated;

create or replace function public.fn_acesso_cancelar_pedido(p_pedido uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  update public.usuario_pedidos_acesso set status = 'cancelado', decidido_em = now()
   where id = p_pedido and usuario_id = auth.uid() and status = 'pendente';
  if not found then raise exception 'PEDIDO_INVALIDO: pedido não encontrado ou já decidido'; end if;
end;
$function$;
revoke execute on function public.fn_acesso_cancelar_pedido(uuid) from public, anon;
grant execute on function public.fn_acesso_cancelar_pedido(uuid) to authenticated;

-- ── 14. Liberar a entrada de quem foi suspenso por inatividade (super_admin) ──
create or replace function public.fn_acesso_liberar_inatividade(p_usuario uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_u record;
  v_r record;
begin
  if not exists (select 1 from public.usuarios where id = auth.uid() and perfil = 'super_admin' and ativo
                   and bloqueado_inatividade_em is null) then
    raise exception 'ACESSO_NEGADO: só o super_admin libera a entrada' using errcode = '42501';
  end if;
  select * into v_u from public.usuarios where id = p_usuario for update;
  if v_u.id is null or v_u.bloqueado_inatividade_em is null then
    raise exception 'NAO_BLOQUEADO: esta pessoa não está suspensa por inatividade';
  end if;
  select * into v_r from public.acesso_regras;
  perform set_config('dima.acesso', 'rpc', true);
  update public.usuarios set bloqueado_inatividade_em = null, liberado_inatividade_em = now(),
         liberado_inatividade_por = auth.uid(), aviso_inatividade_em = now()
   where id = p_usuario;
  update public.usuario_pedidos_acesso set status = 'aprovado', decidido_por = auth.uid(), decidido_em = now()
   where usuario_id = p_usuario and tipo = 'liberacao' and status = 'pendente';
  if v_u.email is not null then
    insert into public.acesso_notificacoes (usuario_id, evento, para_email, dados)
    values (p_usuario, 'liberado', v_u.email,
            jsonb_build_object('nome', v_u.nome_completo, 'dias', v_r.dias_carencia,
                               'ate', now() + make_interval(days => v_r.dias_carencia)));
  end if;
end;
$function$;
revoke execute on function public.fn_acesso_liberar_inatividade(uuid) from public, anon;
grant execute on function public.fn_acesso_liberar_inatividade(uuid) to authenticated;

-- ── 15. Decidir um pedido (super_admin) ───────────────────────────────
create or replace function public.fn_acesso_decidir(p_pedido uuid, p_aprovar boolean,
                                                    p_valido_ate timestamptz default null, p_parecer text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_p record;
  v_u record;
  v_rot text;
begin
  if not exists (select 1 from public.usuarios where id = auth.uid() and perfil = 'super_admin' and ativo
                   and bloqueado_inatividade_em is null) then
    raise exception 'ACESSO_NEGADO: só o super_admin decide pedidos de acesso' using errcode = '42501';
  end if;
  select * into v_p from public.usuario_pedidos_acesso where id = p_pedido for update;
  if v_p.id is null or v_p.status <> 'pendente' then
    raise exception 'PEDIDO_INVALIDO: pedido não encontrado ou já decidido';
  end if;
  if p_valido_ate is not null and p_valido_ate <= now() then
    raise exception 'PRAZO_INVALIDO: a data de fim precisa ser futura';
  end if;
  select * into v_u from public.usuarios where id = v_p.usuario_id;

  if p_aprovar and v_p.tipo = 'liberacao' then
    if v_u.bloqueado_inatividade_em is not null then
      perform public.fn_acesso_liberar_inatividade(v_p.usuario_id);   -- também fecha o pedido
    end if;
    update public.usuario_pedidos_acesso set status = 'aprovado', decidido_por = auth.uid(), decidido_em = now(),
           parecer = nullif(trim(coalesce(p_parecer, '')), '')
     where id = p_pedido;
    return;
  end if;

  if p_aprovar then
    insert into public.usuario_permissoes (usuario_id, modulo, ativo, valido_de, valido_ate, concedido_por,
                                           concedido_em, revogado_por, revogado_em, motivo, em_revisao)
    values (v_p.usuario_id, v_p.modulo, true, now(), p_valido_ate, auth.uid(), now(), null, null,
            'Pedido de acesso aprovado', false)
    on conflict (usuario_id, modulo) do update
      set ativo = true, valido_de = now(), valido_ate = excluded.valido_ate, concedido_por = excluded.concedido_por,
          concedido_em = now(), revogado_por = null, revogado_em = null, motivo = excluded.motivo,
          em_revisao = false, revisao_valido_ate_original = null, aviso_vencimento_em = null;
  end if;

  update public.usuario_pedidos_acesso
     set status = case when p_aprovar then 'aprovado' else 'recusado' end,
         valido_ate = case when p_aprovar then p_valido_ate end,
         parecer = nullif(trim(coalesce(p_parecer, '')), ''), decidido_por = auth.uid(), decidido_em = now()
   where id = p_pedido;

  if not p_aprovar then
    select rotulo into v_rot from public.acesso_modulos where modulo = v_p.modulo;
    perform public.fn_acesso_avisar(v_p.usuario_id, 'acesso_decidido', 'Pedido de acesso recusado: ' || coalesce(v_rot, v_p.modulo),
      coalesce('Parecer: ' || nullif(trim(coalesce(p_parecer, '')), ''), 'O administrador recusou o pedido.'), 'sem-acesso.html');
  end if;
end;
$function$;
revoke execute on function public.fn_acesso_decidir(uuid, boolean, timestamptz, text) from public, anon;
grant execute on function public.fn_acesso_decidir(uuid, boolean, timestamptz, text) to authenticated;

-- ── 16. Pedir a liberação na tela de entrada (sem login) ──────────────
-- Resposta sempre igual (não revela se o e-mail existe nem se está bloqueado); no máximo 30 por hora.
create or replace function public.fn_publico_pedir_liberacao(p_email text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_u record;
begin
  if length(v_email) between 3 and 254 and v_email like '%_@_%' then
    if (select count(*) from public.usuario_pedidos_acesso
         where origem = 'entrada' and criado_em > now() - interval '1 hour') < 30 then
      select id, nome_completo into v_u from public.usuarios
       where lower(email) = v_email and ativo and bloqueado_inatividade_em is not null limit 1;
      if v_u.id is not null and not exists (
           select 1 from public.usuario_pedidos_acesso
            where usuario_id = v_u.id and tipo = 'liberacao' and status = 'pendente') then
        insert into public.usuario_pedidos_acesso (tipo, usuario_id, origem)
        values ('liberacao', v_u.id, 'entrada');
        perform public.fn_acesso_avisar_admins('acesso_pedido', 'Pedido de liberação da entrada',
          coalesce(v_u.nome_completo, 'Um usuário') || ' está suspenso por inatividade e pediu para voltar a entrar.',
          'usuarios.html?pedidos=1');
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;
revoke execute on function public.fn_publico_pedir_liberacao(text) from public;
grant execute on function public.fn_publico_pedir_liberacao(text) to anon, authenticated;

-- ── 17. Rotina diária: inatividade, prazos e revisão ──────────────────
create or replace function public.fn_acesso_rotina()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_r record;
  v_u record;
  v_p record;
  v_ua timestamptz;
  v_bloq int := 0;
  v_avis int := 0;
  v_prazo int := 0;
  v_lista jsonb := '[]'::jsonb;
  v_rev int;
  v_rev_ate timestamptz;
begin
  select * into v_r from public.acesso_regras;
  perform set_config('dima.acesso', 'rpc', true);

  -- inatividade (super_admin e conta desativada ficam de fora)
  for v_u in select id, nome_completo, email, perfil, aviso_inatividade_em from public.usuarios
              where ativo and bloqueado_inatividade_em is null and perfil <> 'super_admin' loop
    v_ua := public.fn_usuario_ultima_atividade(v_u.id);
    if v_ua < now() - make_interval(days => v_r.dias_inatividade) then
      update public.usuarios set bloqueado_inatividade_em = now() where id = v_u.id;
      v_bloq := v_bloq + 1;
      v_lista := v_lista || jsonb_build_object('nome', v_u.nome_completo, 'email', v_u.email,
                                               'perfil', v_u.perfil, 'ultima', v_ua);
      if v_u.email is not null then
        insert into public.acesso_notificacoes (usuario_id, evento, para_email, dados)
        values (v_u.id, 'bloqueado', v_u.email, jsonb_build_object('nome', v_u.nome_completo, 'ultima', v_ua,
                                                                  'dias', v_r.dias_inatividade));
      end if;
    elsif v_ua < now() - make_interval(days => v_r.dias_aviso)
          and (v_u.aviso_inatividade_em is null or v_u.aviso_inatividade_em < v_ua) then
      update public.usuarios set aviso_inatividade_em = now() where id = v_u.id;
      v_avis := v_avis + 1;
      if v_u.email is not null then
        insert into public.acesso_notificacoes (usuario_id, evento, para_email, dados)
        values (v_u.id, 'aviso_inatividade', v_u.email,
                jsonb_build_object('nome', v_u.nome_completo, 'ultima', v_ua,
                                   'bloqueio_em', v_ua + make_interval(days => v_r.dias_inatividade)));
      end if;
    end if;
  end loop;

  if v_bloq > 0 then
    perform public.fn_acesso_avisar_admins('acesso_bloqueio',
      v_bloq || case when v_bloq = 1 then ' pessoa suspensa' else ' pessoas suspensas' end || ' por inatividade',
      'Ficaram ' || v_r.dias_inatividade || ' dias sem entrar. Veja em Usuários e libere quem ainda precisa do acesso.',
      'usuarios.html?filtro=bloqueado');
    insert into public.acesso_notificacoes (usuario_id, evento, para_email, dados)
    select id, 'resumo_bloqueios', email, jsonb_build_object('lista', v_lista, 'dias', v_r.dias_inatividade)
      from public.usuarios where perfil = 'super_admin' and ativo and email is not null;
  end if;

  -- prazo de liberação acabando (avisa a pessoa uma vez; revisão é com o administrador)
  for v_p in select p.id, p.usuario_id, p.valido_ate, coalesce(m.rotulo, p.modulo) rotulo
               from public.usuario_permissoes p
               left join public.acesso_modulos m on m.modulo = p.modulo
               join public.usuarios u on u.id = p.usuario_id and u.ativo
              where p.ativo and not p.em_revisao and p.aviso_vencimento_em is null and p.valido_ate is not null
                and p.valido_ate > now() and p.valido_ate <= now() + make_interval(days => v_r.dias_aviso_prazo) loop
    update public.usuario_permissoes set aviso_vencimento_em = now() where id = v_p.id;
    perform public.fn_acesso_avisar(v_p.usuario_id, 'acesso_vencendo', 'Seu acesso vai vencer: ' || v_p.rotulo,
      'O módulo ' || v_p.rotulo || ' vale até ' || to_char(v_p.valido_ate at time zone 'America/Rio_Branco', 'DD/MM/YYYY')
      || '. Se ainda precisar, peça para renovar.', 'sem-acesso.html');
    v_prazo := v_prazo + 1;
  end loop;

  -- revisão da migração: lembra o super_admin enquanto houver acesso aguardando (a cada 3 dias)
  select count(*), min(p.valido_ate) into v_rev, v_rev_ate
    from public.usuario_permissoes p join public.usuarios u on u.id = p.usuario_id and u.ativo
   where p.ativo and p.em_revisao and p.valido_ate > now();
  if v_rev > 0 and not exists (select 1 from public.notificacoes n
                                where n.tipo = 'acesso_revisao' and n.criado_em > now() - interval '3 days') then
    perform public.fn_acesso_avisar_admins('acesso_revisao', 'Revisão de acessos pendente',
      v_rev || ' acessos aguardam a sua revisão. Os que não forem confirmados saem em '
      || to_char(v_rev_ate at time zone 'America/Rio_Branco', 'DD/MM/YYYY') || '.', 'usuarios.html?filtro=revisao');
  end if;

  return jsonb_build_object('bloqueados', v_bloq, 'avisados', v_avis, 'prazos', v_prazo, 'em_revisao', v_rev);
end;
$function$;
revoke execute on function public.fn_acesso_rotina() from public, anon, authenticated;

-- ── 18. ROPA ──────────────────────────────────────────────────────────
insert into public.lgpd_tratamentos (codigo, nome, modulo, finalidade, operadores, base_legal, base_legal_detalhe,
  categorias_titulares, categorias_dados, tabelas, compartilhamento, transferencia_internacional, retencao_criterio,
  medidas_seguranca)
values ('TRAT-007', 'Contas de usuário, acessos por módulo e controle de inatividade', 'usuarios',
  'Dar e controlar o acesso de cada pessoa à plataforma: perfil, módulos liberados e prazos, pedidos de acesso, '
  || 'registro do último acesso (mesa e app de campo) e suspensão da entrada após 15 dias sem uso.',
  'Supabase (banco, autenticação e funções); Google (Gmail: envio dos avisos); Vercel (hospedagem)',
  'art7_iii_politica_publica',
  'Art. 7º, III (execução de políticas públicas — gestão e segurança do Projeto 218BRA2001) e art. 46 (medidas de '
  || 'segurança). Não usa consentimento.',
  array['servidores, técnicos, consultores e fornecedores com conta na plataforma'],
  array['nome, e-mail e telefone', 'perfil e módulos liberados', 'data e hora do último acesso (mesa, app de campo, login)',
        'pedidos de acesso e justificativas'],
  array['usuarios', 'usuario_permissoes', 'usuario_pedidos_acesso', 'acesso_notificacoes', 'solicitacoes_senha'],
  'Nenhum. Os dados só aparecem para o super_admin (e o próprio usuário vê os seus).',
  'Supabase/Vercel/Google (art. 33) — pendência geral do DIMA',
  'Enquanto a conta existir e até a prestação de contas do projeto; revisar prazo com o Encarregado.',
  'Escrita das liberações só pelo super_admin; situação de inatividade só pelas funções do banco; fila de e-mail '
  || 'sem policy nem grant; trilha no audit_log.')
on conflict do nothing;

-- ── 19. Rotina agendada (05:43 no Acre) ───────────────────────────────
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'acesso-rotina') then
    perform cron.schedule('acesso-rotina', '43 10 * * *', 'select public.fn_acesso_rotina()');
  end if;
end $$;
