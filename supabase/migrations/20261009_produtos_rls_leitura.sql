-- Produtos de contrato: leitura restrita a quem vê o contrato
-- ----------------------------------------------------------------------------
-- Antes: contratos_produtos (cp_readonly), contratos_produtos_entregas (cpe_all)
-- e entrega_documentos (ed_sel) eram legíveis por qualquer usuário logado
-- (auth.uid() IS NOT NULL) — a restrição por responsável da atividade existia só
-- na tela de Produtos.
--
-- Agora a leitura segue a visibilidade do contrato: a policy usa
-- EXISTS (select … from contratos …), que roda sob a RLS de contratos
-- (contratos_select / contratos_write): super_admin, coordenação, financeiro,
-- tem_permissao('contratos') ou responsável ativo da atividade do contrato.
-- Mesma regra que o Acervo já herda pelas views security_invoker.
--
-- Sem apagar nada: as policies existentes são ajustadas com ALTER POLICY (o comando
-- de cada uma não muda). Policies passam a ser TO authenticated.
--
-- A Matriz de Resultados é aberta a todos os perfis e dependia de ler
-- contratos_produtos_entregas:
--   • vw_matriz_progresso (security_invoker) só conta contribuição de entrega
--     aprovada → o teste passa por fn_entrega_aprovada (SECURITY DEFINER, só
--     devolve true/false), senão o progresso encolheria para quem não vê o contrato.
--   • dashboard/matriz embutiam a entrega na contribuição (dt_entrega, nº,
--     situação, tipo) → view vw_matriz_contribuicoes expõe só esses campos das
--     entregas que têm contribuição (nada de arquivo, despacho, valor ou fotos).
-- ----------------------------------------------------------------------------

-- 1) contratos_produtos ---------------------------------------------------------
alter policy cp_readonly on public.contratos_produtos
  to authenticated
  using (exists (select 1 from public.contratos c where c.id = contratos_produtos.contrato_id));

alter policy cp_registrar_entrega on public.contratos_produtos
  to authenticated
  using (
    situacao = any (array['pendente','devolvido','entrega_parcial'])
    and exists (select 1 from public.contratos c where c.id = contratos_produtos.contrato_id)
  )
  with check (situacao = 'em_analise');

alter policy cp_financeiro on public.contratos_produtos to authenticated;
alter policy cp_super_admin on public.contratos_produtos to authenticated;

-- 2) contratos_produtos_entregas (policy única ALL) -----------------------------
-- vale para ler, gravar e alterar: só entrega de produto/contrato que a pessoa vê
alter policy cpe_all on public.contratos_produtos_entregas
  to authenticated
  using (
    exists (select 1 from public.contratos_produtos cp where cp.id = contratos_produtos_entregas.produto_id)
    or exists (select 1 from public.contratos c where c.id = contratos_produtos_entregas.contrato_id)
  )
  with check (
    exists (select 1 from public.contratos_produtos cp where cp.id = contratos_produtos_entregas.produto_id)
    or exists (select 1 from public.contratos c where c.id = contratos_produtos_entregas.contrato_id)
  );

-- 3) entrega_documentos ---------------------------------------------------------
alter policy ed_sel on public.entrega_documentos
  to authenticated
  using (exists (select 1 from public.contratos_produtos_entregas e where e.id = entrega_documentos.entrega_id));

alter policy ed_ins on public.entrega_documentos
  to authenticated
  with check (exists (select 1 from public.contratos_produtos_entregas e where e.id = entrega_documentos.entrega_id));

alter policy ed_del on public.entrega_documentos to authenticated;

-- 4) Matriz: progresso não depende de ver a entrega -----------------------------
create or replace function public.fn_entrega_aprovada(p_entrega_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.contratos_produtos_entregas e
    where e.id = p_entrega_id and e.situacao = 'aprovada'
  );
$$;
revoke all on function public.fn_entrega_aprovada(uuid) from public, anon;
grant execute on function public.fn_entrega_aprovada(uuid) to authenticated;

create or replace view public.vw_matriz_progresso
with (security_invoker = true) as
 select mi.id,
    mi.resultado,
    mi.produto_codigo,
    mi.produto_titulo,
    mi.indicador,
    mi.meta_numerica,
    mi.meta_descricao,
    mi.unidade,
    mi.ods,
    mi.metas_km,
    coalesce(sum(case when pmc.status = 'confirmado' then pmc.valor else 0::numeric end), 0::numeric) as realizado_confirmado,
    coalesce(sum(case when pmc.status = 'pendente' then pmc.valor else 0::numeric end), 0::numeric) as realizado_pendente,
    coalesce(sum(case when pmc.status = any (array['confirmado','pendente']) then pmc.valor else 0::numeric end), 0::numeric) as realizado_total,
    case
      when mi.meta_numerica > 0::numeric then round(coalesce(sum(case when pmc.status = 'confirmado' then pmc.valor else 0::numeric end), 0::numeric) / mi.meta_numerica * 100::numeric, 1)
      else null::numeric
    end as pct_confirmado
   from public.matriz_itens mi
     left join public.produto_matriz_contribuicao pmc
       on pmc.matriz_item_id = mi.id
      and pmc.status <> 'cancelado'
      and public.fn_entrega_aprovada(pmc.produto_id)
  where mi.ativo = true
  group by mi.id;

-- 5) Matriz: contribuição + só os campos da entrega que a Matriz mostra ---------
-- View com dono postgres (ignora a RLS das entregas de propósito) e só SELECT:
-- nunca dar escrita (view simples é auto-atualizável e ignoraria a RLS).
create or replace view public.vw_matriz_contribuicoes as
select pmc.id, pmc.produto_id, pmc.matriz_item_id, pmc.valor, pmc.unidade, pmc.observacao, pmc.status,
       pmc.confirmado_por, pmc.confirmado_em, pmc.criado_por, pmc.criado_em,
       e.numero_entrega as entrega_numero,
       e.dt_entrega     as entrega_dt,
       e.situacao       as entrega_situacao,
       e.tipo_documento as entrega_tipo_documento
  from public.produto_matriz_contribuicao pmc
  left join public.contratos_produtos_entregas e on e.id = pmc.produto_id;
revoke all on public.vw_matriz_contribuicoes from public, anon, authenticated;
grant select on public.vw_matriz_contribuicoes to authenticated;
