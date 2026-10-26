-- ════════════════════════════════════════════════════════════════════════
-- Produtos: o fornecedor com acesso à plataforma registra a entrega do
-- próprio produto, mas nunca avalia (aprova, aprova em parte ou devolve).
--
-- 1) Vínculo usuário ↔ fornecedor (fornecedor_usuarios), PF e PJ (uma empresa
--    pode ter mais de um representante). Só super_admin grava, pela RPC
--    fn_fornecedor_vincular_usuario. Desvincular = ativo false (a linha fica).
--    Pré-preenchido com os usuários ativos de e-mail igual ao do fornecedor.
-- 2) fn_eh_fornecedor_do_contrato(contrato): quem chama é o fornecedor dele.
--    fn_pode_registrar_entrega(contrato) = quem avalia OU o fornecedor.
--    fn_pode_avaliar_contrato(contrato) = super_admin ou responsável/substituto,
--    e NUNCA o fornecedor do contrato (vale até para super_admin).
-- 3) Policies/triggers: o fornecedor abre a própria entrega (pendente → em
--    avaliação), anexa documentos enquanto ela está pendente e não mexe em
--    valor, descrição, vencimento nem situação do produto do próprio contrato.
-- 4) O fornecedor enxerga os próprios contratos (contratos_select) e as
--    atividades deles na tela de Produtos (get_minhas_atividades).
-- 5) Aviso no sino para responsável/substituto quando a entrega chega para
--    avaliação, dizendo quando foi o fornecedor que registrou.
-- Policies do bucket entregas-docs: 20261026_produto_entrega_fornecedor_sql_editor.sql
-- ════════════════════════════════════════════════════════════════════════

-- 1) Vínculo ────────────────────────────────────────────────────────────
create table if not exists public.fornecedor_usuarios (
  id               uuid primary key default gen_random_uuid(),
  fornecedor_id    uuid not null references public.fornecedores(id),
  usuario_id       uuid not null references public.usuarios(id),
  ativo            boolean not null default true,
  vinculado_por    uuid references public.usuarios(id),
  vinculado_em     timestamptz not null default now(),
  desvinculado_por uuid references public.usuarios(id),
  desvinculado_em  timestamptz,
  atualizado_em    timestamptz not null default now(),
  unique (fornecedor_id, usuario_id)
);
create index if not exists fornecedor_usuarios_usuario_idx on public.fornecedor_usuarios(usuario_id) where ativo;

alter table public.fornecedor_usuarios enable row level security;
revoke all on public.fornecedor_usuarios from public, anon, authenticated;
grant select on public.fornecedor_usuarios to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fornecedor_usuarios' and policyname='forn_usu_select') then
    create policy forn_usu_select on public.fornecedor_usuarios
      for select to authenticated
      using (usuario_id = auth.uid()
             or public.fn_perfil_atual() in ('super_admin','coordenacao','financeiro')
             or public.tem_permissao('fornecedores'));
  end if;
end $$;

create or replace trigger trg_audit_fornecedor_usuarios
  after insert or update on public.fornecedor_usuarios
  for each row execute function public.fn_trg_audit();

-- vincular / desvincular (só super_admin ativo)
create or replace function public.fn_fornecedor_vincular_usuario(p_fornecedor_id uuid, p_usuario_id uuid, p_ativo boolean default true)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.usuarios u where u.id = auth.uid() and u.ativo and u.perfil = 'super_admin') then
    raise exception 'FORNECEDOR_VINCULO_NEGADO: só o super_admin vincula usuário a fornecedor.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fornecedores f where f.id = p_fornecedor_id) then
    raise exception 'FORNECEDOR_INEXISTENTE';
  end if;
  if not exists (select 1 from public.usuarios u where u.id = p_usuario_id) then
    raise exception 'USUARIO_INEXISTENTE';
  end if;

  if coalesce(p_ativo, true) then
    insert into public.fornecedor_usuarios (fornecedor_id, usuario_id, ativo, vinculado_por, vinculado_em)
    values (p_fornecedor_id, p_usuario_id, true, auth.uid(), now())
    on conflict (fornecedor_id, usuario_id) do update
      set ativo = true, vinculado_por = auth.uid(), vinculado_em = now(),
          desvinculado_por = null, desvinculado_em = null, atualizado_em = now()
      where public.fornecedor_usuarios.ativo is distinct from true
    returning id into v_id;
  else
    update public.fornecedor_usuarios
       set ativo = false, desvinculado_por = auth.uid(), desvinculado_em = now(), atualizado_em = now()
     where fornecedor_id = p_fornecedor_id and usuario_id = p_usuario_id and ativo
    returning id into v_id;
  end if;
  return coalesce(v_id, (select id from public.fornecedor_usuarios
                          where fornecedor_id = p_fornecedor_id and usuario_id = p_usuario_id));
end;
$$;
revoke all on function public.fn_fornecedor_vincular_usuario(uuid, uuid, boolean) from public, anon;
grant execute on function public.fn_fornecedor_vincular_usuario(uuid, uuid, boolean) to authenticated;

-- pré-preenchimento: usuários ativos com o mesmo e-mail do fornecedor
insert into public.fornecedor_usuarios (fornecedor_id, usuario_id, ativo, vinculado_por, vinculado_em)
select f.id, u.id, true, null, now()
  from public.fornecedores f
  join public.usuarios u on lower(trim(u.email)) = lower(trim(f.email)) and u.ativo
 where coalesce(trim(f.email), '') <> ''
on conflict (fornecedor_id, usuario_id) do nothing;

-- 2) Funções de decisão ───────────────────────────────────────────────────
-- quem chama está vinculado (ativo) ao fornecedor informado
create or replace function public.fn_eh_fornecedor_vinculado(p_fornecedor_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_fornecedor_id is not null and exists (
    select 1 from public.fornecedor_usuarios fu
      join public.usuarios u on u.id = fu.usuario_id and u.ativo
     where fu.fornecedor_id = p_fornecedor_id and fu.usuario_id = auth.uid() and fu.ativo);
$$;
revoke all on function public.fn_eh_fornecedor_vinculado(uuid) from public, anon;
grant execute on function public.fn_eh_fornecedor_vinculado(uuid) to authenticated;

-- quem chama é o fornecedor do contrato
create or replace function public.fn_eh_fornecedor_do_contrato(p_contrato_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.contratos c
      join public.fornecedor_usuarios fu on fu.fornecedor_id = c.fornecedor_id and fu.ativo
     where c.id = p_contrato_id and fu.usuario_id = auth.uid());
$$;
revoke all on function public.fn_eh_fornecedor_do_contrato(uuid) from public, anon;
grant execute on function public.fn_eh_fornecedor_do_contrato(uuid) to authenticated;

-- avaliar: super_admin ou responsável/substituto ativo — nunca o fornecedor do contrato
create or replace function public.fn_pode_avaliar_contrato(p_contrato_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select (
           exists (
             select 1 from public.usuarios u
             where u.id = auth.uid() and u.ativo and u.perfil = 'super_admin'
           )
        or exists (
             select 1
             from public.contratos c
             join public.atividade_responsaveis ar on ar.atividade_id = c.atividade_id
             join public.usuarios u on u.id = ar.usuario_id and u.ativo
             where c.id = p_contrato_id
               and ar.usuario_id = auth.uid()
               and ar.ativo
               and ar.papel in ('responsavel','substituto')
           )
         )
     and not public.fn_eh_fornecedor_do_contrato(p_contrato_id);
$$;
revoke all on function public.fn_pode_avaliar_contrato(uuid) from public, anon;
grant execute on function public.fn_pode_avaliar_contrato(uuid) to authenticated;

-- registrar entrega: quem avalia ou o fornecedor (usuário ativo) do contrato
create or replace function public.fn_pode_registrar_entrega(p_contrato_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.fn_pode_avaliar_contrato(p_contrato_id)
      or (public.fn_eh_fornecedor_do_contrato(p_contrato_id)
          and exists (select 1 from public.usuarios u where u.id = auth.uid() and u.ativo));
$$;
revoke all on function public.fn_pode_registrar_entrega(uuid) from public, anon;
grant execute on function public.fn_pode_registrar_entrega(uuid) to authenticated;

-- o que a tela mostra (a decisão continua no banco)
create or replace function public.fn_produto_permissoes(p_contrato_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'registrar',  public.fn_pode_registrar_entrega(p_contrato_id),
    'avaliar',    public.fn_pode_avaliar_contrato(p_contrato_id),
    'fornecedor', public.fn_eh_fornecedor_do_contrato(p_contrato_id));
$$;
revoke all on function public.fn_produto_permissoes(uuid) from public, anon;
grant execute on function public.fn_produto_permissoes(uuid) to authenticated;

-- 3) Entregas ─────────────────────────────────────────────────────────────
-- quem avalia: tudo (cpe_all, inalterada — a função agora exclui o fornecedor).
-- fornecedor: só a entrega que ele abriu, enquanto pendente; pode levá-la a em_analise.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='contratos_produtos_entregas' and policyname='cpe_fornecedor') then
    create policy cpe_fornecedor on public.contratos_produtos_entregas
      for all to authenticated
      using (
        criado_por = auth.uid() and situacao = 'pendente'
        and public.fn_pode_registrar_entrega(public.fn_contrato_da_entrega(produto_id, contrato_id))
      )
      with check (
        criado_por = auth.uid() and situacao in ('pendente','em_analise')
        and public.fn_pode_registrar_entrega(public.fn_contrato_da_entrega(produto_id, contrato_id))
      );
  end if;
end $$;

-- decisão (aprovada/devolvida) só por quem avalia — trava também fora das policies
create or replace function public.fn_trg_entrega_guarda_avaliacao()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.situacao in ('aprovada','devolvida')
     and (tg_op = 'INSERT' or old.situacao is distinct from new.situacao)
     and pg_trigger_depth() = 1
     and auth.uid() is not null
     and not public.fn_pode_avaliar_contrato(public.fn_contrato_da_entrega(new.produto_id, new.contrato_id)) then
    if public.fn_eh_fornecedor_do_contrato(public.fn_contrato_da_entrega(new.produto_id, new.contrato_id)) then
      raise exception 'PRODUTO_FORNECEDOR_NAO_AVALIA: o fornecedor do contrato não aprova nem devolve o próprio produto.'
        using errcode = '42501';
    end if;
    raise exception 'PRODUTO_SO_RESPONSAVEL: só o responsável ou substituto da atividade (ou super_admin) avalia o produto.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger trg_entrega_guarda_avaliacao
  before insert or update on public.contratos_produtos_entregas
  for each row execute function public.fn_trg_entrega_guarda_avaliacao();

-- documentos: quem avalia, ou o fornecedor na própria entrega ainda pendente
alter policy ed_ins on public.entrega_documentos
  to authenticated
  with check (exists (
    select 1 from public.contratos_produtos_entregas e
    where e.id = entrega_documentos.entrega_id
      and (public.fn_pode_avaliar_contrato(public.fn_contrato_da_entrega(e.produto_id, e.contrato_id))
           or (e.criado_por = auth.uid() and e.situacao = 'pendente'
               and public.fn_pode_registrar_entrega(public.fn_contrato_da_entrega(e.produto_id, e.contrato_id))))
  ));

-- produto: registrar leva a em_analise. A tela atualiza dt_entrega/observações
-- depois que o trigger da entrega já pôs o produto em em_analise — por isso
-- em_analise entra no USING (antes a atualização não pegava linha nenhuma).
alter policy cp_registrar_entrega on public.contratos_produtos
  to authenticated
  using (
    situacao = any (array['pendente','devolvido','entrega_parcial','em_analise'])
    and public.fn_pode_registrar_entrega(contrato_id)
  )
  with check (situacao = 'em_analise' and public.fn_pode_registrar_entrega(contrato_id));

-- situação de avaliação: em_analise por quem registra; aprovado/parcial/devolvido por quem avalia
create or replace function public.fn_trg_cp_guarda_situacao()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.situacao is distinct from coalesce(old.situacao, '')
     and pg_trigger_depth() = 1
     and auth.uid() is not null then
    if new.situacao = 'em_analise' and not public.fn_pode_registrar_entrega(new.contrato_id) then
      raise exception 'PRODUTO_SO_RESPONSAVEL: só o fornecedor do contrato, o responsável ou substituto da atividade (ou super_admin) registra entrega.'
        using errcode = '42501';
    end if;
    if new.situacao in ('aprovado','entrega_parcial','devolvido') and not public.fn_pode_avaliar_contrato(new.contrato_id) then
      raise exception 'PRODUTO_SO_RESPONSAVEL: só o responsável ou substituto da atividade (ou super_admin) avalia o produto — nunca o fornecedor do contrato.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- o fornecedor não cria nem altera produto do próprio contrato (valor, descrição,
-- vencimento, situação além de em_analise), mesmo tendo perfil que edita contratos
create or replace function public.fn_trg_cp_guarda_fornecedor()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then return new; end if;
  if not public.fn_eh_fornecedor_do_contrato(new.contrato_id)
     and (tg_op = 'INSERT' or not public.fn_eh_fornecedor_do_contrato(old.contrato_id)) then
    return new;
  end if;
  if tg_op = 'INSERT'
     or new.contrato_id     is distinct from old.contrato_id
     or new.numero_produto  is distinct from old.numero_produto
     or new.descricao       is distinct from old.descricao
     or new.valor_brl       is distinct from old.valor_brl
     or new.dt_vencimento   is distinct from old.dt_vencimento
     or new.pct_aprovado    is distinct from old.pct_aprovado
     or new.valor_aprovado  is distinct from old.valor_aprovado
     or (new.situacao is distinct from old.situacao and new.situacao <> 'em_analise') then
    raise exception 'PRODUTO_DO_PROPRIO_FORNECEDOR: o fornecedor do contrato só registra a entrega; produto, valor e situação ficam com a coordenação e o responsável da atividade.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger trg_cp_guarda_fornecedor
  before insert or update on public.contratos_produtos
  for each row execute function public.fn_trg_cp_guarda_fornecedor();

-- pontos do mapa da entrega: o fornecedor grava os da própria entrega em registro
create or replace function public.fn_mapa_pode_editar(p_entrega_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
           select 1 from public.usuarios u
            where u.id = auth.uid() and u.ativo and u.perfil in ('super_admin','coordenacao')
         )
      or (p_entrega_id is not null and exists (
           select 1 from public.contratos_produtos_entregas e
            where e.id = p_entrega_id
              and (public.fn_pode_avaliar_contrato(public.fn_contrato_da_entrega(e.produto_id, e.contrato_id))
                   or (e.criado_por = auth.uid() and e.situacao in ('pendente','em_analise')
                       and public.fn_pode_registrar_entrega(public.fn_contrato_da_entrega(e.produto_id, e.contrato_id))))
         ));
$$;

-- 4) Leitura ──────────────────────────────────────────────────────────────
alter policy contratos_select on public.contratos
  to authenticated
  using (
    (exists (select 1 from public.usuarios
              where usuarios.id = auth.uid()
                and usuarios.perfil = any (array['super_admin'::perfil_usuario,'coordenacao'::perfil_usuario,'financeiro'::perfil_usuario])
                and usuarios.ativo = true))
    or public.tem_permissao('contratos')
    or (exists (select 1 from public.atividade_responsaveis ar
                 where ar.atividade_id = contratos.atividade_id and ar.usuario_id = auth.uid() and ar.ativo = true))
    or public.fn_eh_fornecedor_vinculado(contratos.fornecedor_id)
  );

create or replace function public.get_minhas_atividades()
returns table(id uuid, codigo character varying, nome_pt text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_perfil text;
  v_uid    uuid;
begin
  -- alias de tabela em todos os lugares (evita ambiguidade com RETURNS TABLE)
  v_uid := auth.uid();
  select u.perfil::text into v_perfil
  from public.usuarios u
  where u.id = v_uid and u.ativo;

  if v_perfil in ('super_admin','coordenacao') then
    return query
    select a.id, a.codigo, a.nome_pt
    from public.atividades a
    where exists (select 1 from public.contratos c where c.atividade_id = a.id)
    group by a.id, a.codigo, a.nome_pt
    order by a.codigo;
  elsif v_perfil is not null then
    return query
    select a.id, a.codigo, a.nome_pt
    from public.atividades a
    where (
      exists (
        select 1 from public.atividade_responsaveis ar
        where ar.atividade_id = a.id
          and ar.usuario_id   = v_uid
          and ar.ativo        = true
          and ar.papel in ('responsavel','substituto')
      )
      and exists (select 1 from public.contratos c where c.atividade_id = a.id)
    )
    or exists (
      select 1 from public.contratos c
        join public.fornecedor_usuarios fu on fu.fornecedor_id = c.fornecedor_id and fu.ativo
      where c.atividade_id = a.id and fu.usuario_id = v_uid
    )
    group by a.id, a.codigo, a.nome_pt
    order by a.codigo;
  end if;
end;
$$;
revoke execute on function public.get_minhas_atividades() from public, anon;
grant execute on function public.get_minhas_atividades() to authenticated;

-- 5) Aviso de entrega para avaliar ─────────────────────────────────────────
-- SECURITY DEFINER: quem registra pode ser consultor externo (sem leitura de usuários
-- e responsáveis). Diz quando foi o fornecedor e não avisa o próprio fornecedor.
create or replace function public.fn_notificar_avaliacao_produto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_atividade_id uuid;
  v_ativ_codigo  text;
  v_produto_desc text;
  v_produto_num  integer;
  v_cont_numero  text;
  v_forn_id      uuid;
  v_forn_nome    text;
  v_pelo_forn    boolean := false;
  v_titulo       text;
  v_mensagem     text;
  v_link         text;
  v_uid          record;
  v_notificados  uuid[] := '{}';
begin
  if not (
    (tg_op = 'INSERT' and new.situacao = 'em_analise')
    or (tg_op = 'UPDATE' and new.situacao = 'em_analise' and old.situacao is distinct from 'em_analise')
  ) then
    return new;
  end if;

  select cp.descricao, cp.numero_produto, c.numero, c.atividade_id, a.codigo, c.fornecedor_id, f.nome
  into v_produto_desc, v_produto_num, v_cont_numero, v_atividade_id, v_ativ_codigo, v_forn_id, v_forn_nome
  from public.contratos_produtos cp
  join public.contratos c on c.id = cp.contrato_id
  left join public.atividades a on a.id = c.atividade_id
  left join public.fornecedores f on f.id = c.fornecedor_id
  where cp.id = new.produto_id;

  if new.criado_por is not null then
    select exists (select 1 from public.fornecedor_usuarios fu
                    where fu.fornecedor_id = v_forn_id and fu.usuario_id = new.criado_por and fu.ativo)
      into v_pelo_forn;
    -- o fornecedor nunca avalia: não recebe o "aguarda seu parecer"
    if v_pelo_forn then v_notificados := v_notificados || new.criado_por; end if;
  end if;

  v_titulo   := 'Produto aguardando avaliação — ' || coalesce(v_ativ_codigo,'');
  v_mensagem := 'Produto ' || coalesce(v_produto_num::text,'') ||
                ' — ' || coalesce(v_produto_desc,'') ||
                ' (Contrato ' || coalesce(v_cont_numero,'') || ') foi entregue' ||
                case when v_pelo_forn then ' pelo fornecedor ' || coalesce(v_forn_nome,'') else '' end ||
                ' e aguarda seu parecer.';
  v_link     := 'produtos.html?entrega=' || new.id;

  -- responsável e substituto ativos da atividade
  if v_atividade_id is not null then
    for v_uid in
      select ar.usuario_id
      from public.atividade_responsaveis ar
      join public.usuarios u on u.id = ar.usuario_id and u.ativo
      where ar.atividade_id = v_atividade_id
        and ar.ativo = true
        and ar.papel in ('responsavel','substituto')
        and ar.usuario_id <> all(v_notificados)
    loop
      insert into public.notificacoes
        (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      values
        (v_uid.usuario_id, 'produto_para_avaliar', v_titulo, v_mensagem, false,
         v_link, 'contratos_produtos_entregas', new.id);
      v_notificados := v_notificados || v_uid.usuario_id;
    end loop;
  end if;

  -- super_admins ainda não avisados
  for v_uid in
    select u.id from public.usuarios u
    where u.perfil = 'super_admin' and u.ativo = true
      and u.id <> all(v_notificados)
  loop
    insert into public.notificacoes
      (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    values
      (v_uid.id, 'produto_para_avaliar', v_titulo, v_mensagem, false,
       v_link, 'contratos_produtos_entregas', new.id);
  end loop;

  -- ao reenviar: marca como lidas as notificações produto_devolvido de quem reenviou
  if new.criado_por is not null then
    update public.notificacoes
    set lida = true, lida_em = now()
    where usuario_id = new.criado_por
      and tipo = 'produto_devolvido'
      and lida = false
      and entidade_id in (
        select e.id from public.contratos_produtos_entregas e
        where e.produto_id = new.produto_id
          and e.situacao = 'devolvida'
          and e.criado_por = new.criado_por
      );
  end if;

  return new;
end;
$$;
-- função de trigger: nenhum cliente executa direto
revoke execute on function public.fn_notificar_avaliacao_produto() from public, anon, authenticated;

-- 6) Bucket entregas-docs: função auxiliar das policies (sql_editor) ─────────
-- produto a partir do caminho produtos/<produto_id>/… (NULL se fora do padrão)
create or replace function public.fn_produto_id_do_path(p_name text)
returns uuid language sql immutable set search_path to 'public' as $$
  select case
    when split_part(p_name, '/', 1) = 'produtos'
     and split_part(p_name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(p_name, '/', 2)::uuid
  end
$$;
revoke all on function public.fn_produto_id_do_path(text) from public, anon;
grant execute on function public.fn_produto_id_do_path(text) to authenticated;

-- envia arquivo de entrega: quem registra entrega do produto (fornecedor, responsável,
-- substituto, super_admin) ou coordenação/financeiro (anexos administrativos)
create or replace function public.fn_entregas_docs_pode_enviar(p_name text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.contratos_produtos cp
     where cp.id = public.fn_produto_id_do_path(p_name)
       and (public.fn_pode_registrar_entrega(cp.contrato_id)
            or (public.fn_perfil_atual() in ('super_admin','coordenacao','financeiro')
                and not public.fn_eh_fornecedor_do_contrato(cp.contrato_id))));
$$;
revoke all on function public.fn_entregas_docs_pode_enviar(text) from public, anon;
grant execute on function public.fn_entregas_docs_pode_enviar(text) to authenticated;
