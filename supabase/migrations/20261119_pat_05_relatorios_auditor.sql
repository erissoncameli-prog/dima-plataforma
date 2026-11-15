-- ════════════════════════════════════════════════════════════════════════════
-- PATRIMÔNIO · Fase 5 — relatórios e auditor (docs/patrimonio/plano.md §10)
-- ════════════════════════════════════════════════════════════════════════════
-- fn_pat_posicao(data): posição de cada bem numa data de referência (mapa de
--   depreciação Pt3 e inventário geral Pt1 com data passada). Mesma conta de
--   fn_pat_depreciacao (nunca recalcular no JS). Valores só para quem vê valor
--   (fn_pat_pode_ver_valor); bens só para quem vê o catálogo.
-- fn_auditoria_patrimonio(): regras do agente de patrimônio do auditor-ia
--   (só service_role). Título "Patrimônio: …"; domínio gravado = qualidade_dados
--   (o check de auditoria_registros.dominio não tem 'patrimonio').
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_pat_posicao(p_data date default current_date)
returns table (bem_id uuid, numero text, descricao text, numero_serie text, categoria_codigo text, categoria_nome text,
               atividade_codigo text, local_nome text, responsavel_nome text, situacao_hoje text,
               dt_aquisicao date, dt_inicio_uso date, dt_baixa date, vida_util_meses integer,
               valor_aquisicao_brl numeric, cota_mensal_brl numeric, meses integer,
               depreciacao_acumulada_brl numeric, depreciacao_no_ano_brl numeric, valor_contabil_brl numeric)
language sql stable security definer set search_path = public as $$
  select b.id, b.numero, b.descricao, b.numero_serie, b.categoria_codigo, c.nome, a.codigo::text, l.nome, r.nome_completo, b.situacao,
         b.dt_aquisicao, b.dt_inicio_uso, b.dt_baixa, b.vida_util_meses,
         case when v.ok then b.valor_aquisicao_brl end,
         case when v.ok then d.cota_mensal end,
         d.meses,
         case when v.ok then d.depreciacao_acumulada end,
         case when v.ok then d.depreciacao_acumulada - coalesce(d0.depreciacao_acumulada, 0) end,
         case when v.ok then d.valor_contabil end
    from pat_bens b
    join pat_categorias c on c.codigo = b.categoria_codigo
    left join atividades a on a.id = b.atividade_id
    left join pat_locais l on l.id = b.local_id
    left join usuarios r on r.id = b.responsavel_id
    cross join lateral (select public.fn_pat_pode_ver_valor() as ok) v
    cross join lateral public.fn_pat_depreciacao(b.valor_aquisicao_brl, b.residual_pct, b.vida_util_meses,
                                                 b.dt_inicio_uso, p_data, b.dt_baixa) d
    left join lateral public.fn_pat_depreciacao(b.valor_aquisicao_brl, b.residual_pct, b.vida_util_meses,
                                                b.dt_inicio_uso, (date_trunc('year', p_data) - interval '1 day')::date, b.dt_baixa) d0 on true
   where auth.uid() is not null and public.fn_pat_pode_ver()
     and b.situacao <> 'anulado'
     and b.dt_aquisicao <= p_data
     and (b.dt_baixa is null or b.dt_baixa >= date_trunc('year', p_data)::date)
   order by b.numero
$$;

-- ── Regras do auditor ───────────────────────────────────────────────────────
create or replace function public.fn_auditoria_patrimonio()
returns table (severidade text, titulo text, descricao text, recomendacao text,
               referencia_tabela text, referencia_id uuid, referencia_label text)
language sql stable security definer set search_path = public as $$
  -- 1. produto de equipamento aprovado/pago sem bens incorporados (ou incorporado a menos)
  select case when p.situacao = 'pago' then 'alto' else 'medio' end,
         'Patrimônio: produto de equipamento ' || case when s.incorporado = 0 then 'sem bens incorporados' else 'incorporado em parte' end,
         'O produto ' || coalesce(p.numero_produto::text, '?') || ' do contrato ' || c.numero || ' (' || coalesce(f.nome, 'fornecedor') || ') está '
           || p.situacao || ' e tem R$ ' || to_char(s.restante, 'FM999G999G990D00') || ' ainda sem bem no patrimônio.',
         'O gestor patrimonial incorpora os bens em Patrimônio › Painel (tarefa "Incorporar bens ao patrimônio").',
         'contratos_produtos', p.id, 'Contrato ' || c.numero || ' · produto ' || coalesce(p.numero_produto::text, '?')
    from contratos_produtos p
    join contratos c on c.id = p.contrato_id
    left join fornecedores f on f.id = c.fornecedor_id
    cross join lateral public.fn_pat_produto_saldo(p.id) s
   where c.tipo = 'Equipamentos' and c.status <> 'cancelado'
     and p.situacao in ('aprovado','entrega_parcial','pago') and not s.concluida
     and coalesce(p.atualizado_em, p.criado_em) < now() - interval '15 days'
  union all
  -- 2. termo aguardando aceite há mais de 7 dias
  select 'medio', 'Patrimônio: termo aguardando aceite há ' || (current_date - t.criado_em::date) || ' dias',
         'O termo ' || t.numero || ' para ' || u.nome_completo || ' ainda não foi aceito; os bens continuam com quem estavam.',
         'Lembre a pessoa de aceitar com a senha (Patrimônio › Meus bens) ou cancele o termo.',
         'pat_termos', t.id, t.numero
    from pat_termos t join usuarios u on u.id = t.responsavel_id
   where t.situacao = 'aguardando_aceite' and t.criado_em < now() - interval '7 days'
  union all
  -- 3. empréstimo vencido
  select 'alto', 'Patrimônio: empréstimo vencido',
         'O termo ' || t.numero || ' (empréstimo a ' || u.nome_completo || ') venceu em ' || to_char(t.devolver_ate, 'DD/MM/YYYY') || ' sem devolução registrada.',
         'Cobre a devolução e registre-a em Patrimônio (Devolver), conferindo condição e local.',
         'pat_termos', t.id, t.numero
    from pat_termos t join usuarios u on u.id = t.responsavel_id
   where t.tipo = 'emprestimo' and t.situacao = 'aceito' and t.devolvido_em is null and t.devolver_ate < current_date
  union all
  -- 4. ocorrência parada há mais de 30 dias
  select case when o.tipo in ('furto','roubo','extravio','sinistro') then 'alto' else 'medio' end,
         'Patrimônio: ocorrência sem desfecho há ' || (current_date - o.registrado_em::date) || ' dias',
         'A ocorrência ' || o.numero || ' (' || replace(o.tipo, '_', ' ') || ') do bem ' || b.numero || ' — ' || b.descricao || ' segue ' || replace(o.situacao, '_', ' ') || '.',
         'Apure e registre o desfecho (localizado, reparado, ressarcido…) ou peça a baixa.',
         'pat_ocorrencias', o.id, o.numero
    from pat_ocorrencias o join pat_bens b on b.id = o.bem_id
   where o.situacao <> 'concluida' and o.registrado_em < now() - interval '30 days'
  union all
  -- 5. pedido de baixa parado
  select 'medio', 'Patrimônio: pedido de baixa aguardando há ' || (current_date - x.pedido_em::date) || ' dias',
         'O pedido ' || x.numero || ' do bem ' || b.numero || ' aguarda a decisão da coordenação.',
         'Quem aprova é a coordenação ou o super_admin que não pediu, com a senha (Patrimônio › Ocorrências e baixas).',
         'pat_baixas', x.id, x.numero
    from pat_baixas x join pat_bens b on b.id = x.bem_id
   where x.situacao = 'aguardando' and x.pedido_em < now() - interval '10 days'
  union all
  -- 6. bem ativo sem inventário há mais de 12 meses
  select 'medio', 'Patrimônio: bem sem inventário há mais de 12 meses',
         'O bem ' || b.numero || ' — ' || b.descricao || ' não é conferido em inventário desde '
           || coalesce(to_char(b.ultimo_inventario_em, 'DD/MM/YYYY'), 'a entrada (' || to_char(b.dt_aquisicao, 'DD/MM/YYYY') || ')') || '.',
         'Abra um inventário que cubra o local do bem (Patrimônio › Inventários).',
         'pat_bens', b.id, b.numero
    from pat_bens b
   where b.situacao not in ('anulado','baixado','transferido')
     and coalesce(b.ultimo_inventario_em, b.dt_aquisicao) < current_date - interval '12 months'
     and not exists (select 1 from pat_inventario_itens i join pat_inventarios v on v.id = i.inventario_id
                      where i.bem_id = b.id and v.situacao in ('em_andamento','em_assinatura'))
  union all
  -- 7. inventário aberto há mais de 30 dias
  select 'medio', 'Patrimônio: inventário aberto há ' || (current_date - v.aberto_em::date) || ' dias',
         'O inventário ' || v.numero || ' (' || v.titulo || ') está ' || replace(v.situacao, '_', ' ') || '.',
         'Conclua a conferência e colha as assinaturas da comissão, ou cancele o inventário.',
         'pat_inventarios', v.id, v.numero
    from pat_inventarios v
   where v.situacao in ('em_andamento','em_assinatura') and v.aberto_em < now() - interval '30 days'
  union all
  -- 8. bem de compra sem nota fiscal anexada
  select 'baixo', 'Patrimônio: bem de compra sem nota fiscal anexada',
         'O bem ' || b.numero || ' — ' || b.descricao || ' entrou como compra do projeto sem o PDF da nota fiscal.',
         'Anexe a NF na ficha do bem (aba Dados).',
         'pat_bens', b.id, b.numero
    from pat_bens b join pat_incorporacoes i on i.id = b.incorporacao_id
   where b.origem = 'compra_projeto' and i.nf_url is null and b.situacao not in ('anulado','baixado','transferido')
     and b.criado_em < now() - interval '7 days'
  union all
  -- 9. em estoque há mais de 90 dias sem início de uso (não deprecia)
  select 'baixo', 'Patrimônio: bem sem início de uso há mais de 90 dias',
         'O bem ' || b.numero || ' — ' || b.descricao || ' foi adquirido em ' || to_char(b.dt_aquisicao, 'DD/MM/YYYY') || ' e ainda não tem início de uso (não deprecia).',
         'Entregue com termo ou informe o início de uso na ficha.',
         'pat_bens', b.id, b.numero
    from pat_bens b
   where b.situacao = 'em_estoque' and b.dt_inicio_uso is null and b.dt_aquisicao < current_date - 90
  union all
  -- 10. garantia vencendo em 30 dias (informativo)
  select 'info', 'Patrimônio: garantia vencendo',
         'A garantia do bem ' || b.numero || ' — ' || b.descricao || ' vence em ' || to_char(b.garantia_ate, 'DD/MM/YYYY') || '.',
         'Se houver defeito, acione a garantia antes do vencimento.',
         'pat_bens', b.id, b.numero
    from pat_bens b
   where b.garantia_ate between current_date and current_date + 30 and b.situacao not in ('anulado','baixado','transferido')
$$;

revoke execute on function public.fn_pat_posicao(date), public.fn_auditoria_patrimonio() from public, anon;
grant execute on function public.fn_pat_posicao(date) to authenticated;
revoke execute on function public.fn_auditoria_patrimonio() from authenticated;
grant execute on function public.fn_auditoria_patrimonio() to service_role;
