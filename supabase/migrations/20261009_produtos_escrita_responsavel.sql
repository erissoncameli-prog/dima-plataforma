-- Produtos de contrato: registrar entrega, anexar documento e aprovar/devolver
-- só pelo responsável/substituto da atividade ou super_admin
-- ----------------------------------------------------------------------------
-- Leitura não muda (20261009_produtos_rls_leitura: quem vê o contrato lê).
-- Escrita de entrega (contratos_produtos_entregas) e de documento de entrega
-- (entrega_documentos) passa a exigir fn_pode_avaliar_contrato(). A decisão do
-- avaliador é gravada na entrega (despacho) e o produto muda de situação pelos
-- triggers SECURITY DEFINER — então travar a entrega trava a aprovação.
--
-- Produto (contratos_produtos): coordenação/financeiro seguem cadastrando e
-- editando produtos em Contratos (cp_financeiro), mas a SITUAÇÃO só entra em
-- em_analise / aprovado / entrega_parcial / devolvido por quem pode avaliar
-- (trigger trg_cp_guarda_situacao). Mudanças feitas por outros triggers
-- (pg_trigger_depth() > 1: pagamento, avaliação da entrega) e por service_role
-- (auth.uid() nulo: Edge Functions) passam.
-- ----------------------------------------------------------------------------

create or replace function public.fn_pode_avaliar_contrato(p_contrato_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
           select 1 from public.usuarios u
           where u.id = auth.uid() and u.ativo and u.perfil = 'super_admin'
         )
      or exists (
           select 1
           from public.contratos c
           join public.atividade_responsaveis ar on ar.atividade_id = c.atividade_id
           where c.id = p_contrato_id
             and ar.usuario_id = auth.uid()
             and ar.ativo
             and ar.papel in ('responsavel','substituto')
         );
$$;
revoke all on function public.fn_pode_avaliar_contrato(uuid) from public, anon;
grant execute on function public.fn_pode_avaliar_contrato(uuid) to authenticated;

-- contrato de uma entrega (pela própria linha ou pelo produto)
create or replace function public.fn_contrato_da_entrega(p_produto_id uuid, p_contrato_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(p_contrato_id, (select cp.contrato_id from public.contratos_produtos cp where cp.id = p_produto_id));
$$;
revoke all on function public.fn_contrato_da_entrega(uuid, uuid) from public, anon;
grant execute on function public.fn_contrato_da_entrega(uuid, uuid) to authenticated;

-- 1) Entregas: leitura em policy própria; a policy ALL fica só para quem avalia
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='contratos_produtos_entregas' and policyname='cpe_select') then
    create policy cpe_select on public.contratos_produtos_entregas
      for select to authenticated
      using (
        exists (select 1 from public.contratos_produtos cp where cp.id = contratos_produtos_entregas.produto_id)
        or exists (select 1 from public.contratos c where c.id = contratos_produtos_entregas.contrato_id)
      );
  end if;
end $$;

alter policy cpe_all on public.contratos_produtos_entregas
  to authenticated
  using (public.fn_pode_avaliar_contrato(public.fn_contrato_da_entrega(produto_id, contrato_id)))
  with check (public.fn_pode_avaliar_contrato(public.fn_contrato_da_entrega(produto_id, contrato_id)));

-- 2) Documentos de entrega: anexa só quem avalia o contrato da entrega
alter policy ed_ins on public.entrega_documentos
  to authenticated
  with check (exists (
    select 1 from public.contratos_produtos_entregas e
    where e.id = entrega_documentos.entrega_id
      and public.fn_pode_avaliar_contrato(public.fn_contrato_da_entrega(e.produto_id, e.contrato_id))
  ));

-- 3) Produto: registrar entrega (pendente/devolvido/parcial → em_analise) só quem avalia
alter policy cp_registrar_entrega on public.contratos_produtos
  to authenticated
  using (
    situacao = any (array['pendente','devolvido','entrega_parcial'])
    and public.fn_pode_avaliar_contrato(contrato_id)
  )
  with check (situacao = 'em_analise');

-- 4) Situação de avaliação só por quem avalia (vale também para coordenação/financeiro em Contratos)
create or replace function public.fn_trg_cp_guarda_situacao()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.situacao is distinct from coalesce(old.situacao, '')
     and new.situacao in ('em_analise','aprovado','entrega_parcial','devolvido')
     and pg_trigger_depth() = 1
     and auth.uid() is not null
     and not public.fn_pode_avaliar_contrato(new.contrato_id) then
    raise exception 'PRODUTO_SO_RESPONSAVEL: só o responsável ou substituto da atividade (ou super_admin) registra entrega ou avalia o produto.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger trg_cp_guarda_situacao
  before insert or update of situacao on public.contratos_produtos
  for each row execute function public.fn_trg_cp_guarda_situacao();
