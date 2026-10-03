-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · Fase 7 — extrato da atividade e domínio de orçamento no auditor
-- Especificação: docs/remanejamento/plano.md §7 e §9.
--
-- fn_orcamento_extrato(atividade): POSIÇÃO auditável da atividade, num jsonb só:
--   resumo   = linha de vw_orcamento_atividade (mesmos números da tela)
--   creditos = todo lançamento de orcamento_fontes (dotação, revisão, liberações,
--              remanejamentos cedidos/recebidos, estornos) com a procedência
--   debitos  = o que compõe vw_orcamento_debitos HOJE (TDRs, execução direta,
--              excedente de contrato, pagamento de contrato sem TDR)
--   fontes   = disponível/reservado/livre de cada fonte (PEPS)
--   eventos  = histórico de TDR (orcamento_eventos) — informativo
--   Σ créditos − Σ débitos = resumo.saldo_usd (conferido no próprio jsonb).
-- Leitura para qualquer logado (orçamento é visualização geral); só lê.
--
-- fn_auditoria_orcamento(): achados do domínio orçamento para o auditor-ia
-- (service_role). Gravados como dominio 'financeiro' (o check de
-- auditoria_registros.dominio só muda pelo SQL Editor).
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.fn_orcamento_extrato(p_atividade uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_res jsonb; v_cred jsonb; v_deb jsonb; v_fontes jsonb; v_ev jsonb; v_rem jsonb;
  v_tot_cred numeric; v_tot_deb numeric;
begin
  if auth.uid() is not null and fn_perfil_atual() is null then
    raise exception 'Sem permissão.';
  end if;
  select to_jsonb(o) into v_res from public.vw_orcamento_atividade o where o.atividade_id = p_atividade;
  if v_res is null then raise exception 'Atividade não encontrada.'; end if;

  -- créditos e ajustes do razão, com a procedência legível
  select coalesce(jsonb_agg(x order by x.criado_em, x.id), '[]'), coalesce(sum(x.valor_usd), 0)
    into v_cred, v_tot_cred
    from (select f.id, f.criado_em, f.tipo, f.valor_usd, f.descricao, f.orcamentaria,
                 f.ajusta_fonte_id, f.estorno_de,
                 r.numero  as remanejamento,
                 ct.numero as contrato,
                 td.numero as tdr,
                 ao.codigo as atividade_procedencia,
                 u.nome_completo as lancado_por
            from public.orcamento_fontes f
            left join public.remanejamentos r          on r.id  = f.remanejamento_id
            left join public.contrato_encerramentos ce on ce.id = f.encerramento_id
            left join public.contratos ct              on ct.id = ce.contrato_id
            left join public.tdrs td                   on td.id = ce.tdr_id
            left join public.orcamento_fontes fo       on fo.id = f.fonte_origem_id
            left join public.atividades ao             on ao.id = fo.atividade_id
            left join public.usuarios u                on u.id  = f.criado_por
           where f.atividade_id = p_atividade) x;

  -- débitos de hoje, no mesmo desenho de vw_orcamento_debitos
  select coalesce(jsonb_agg(d order by d.ordem, d.referencia), '[]'), coalesce(sum(d.valor_usd) filter (where d.conta), 0)
    into v_deb, v_tot_deb
    from (
      -- TDR comum: valor planejado
      select 1 as ordem, 'tdr' as tipo, t.numero::text as referencia, t.status::text as situacao,
             coalesce(t.valor_usd, 0)::numeric(14,2) as valor_usd, true as conta,
             t.criado_em, null::text as detalhe
        from public.tdrs t
       where t.atividade_id = p_atividade and t.status <> 'cancelado' and not t.execucao_direta
      union all
      -- execução direta: conta o maior entre a reserva (TDRs guarda-chuva) e o realizado
      select 2, 'execucao_direta', 'Execução direta UNESCO', null,
             d.reserva_execucao_direta_usd + greatest(0, d.execucao_direta_realizada_usd - d.reserva_execucao_direta_usd),
             true, null,
             'reserva US$ ' || d.reserva_execucao_direta_usd || ' · realizado US$ ' || d.execucao_direta_realizada_usd
        from public.vw_orcamento_debitos d
       where d.atividade_id = p_atividade
         and (d.reserva_execucao_direta_usd <> 0 or d.execucao_direta_realizada_usd <> 0)
      union all
      -- excedente de contrato sobre o TDR (fase 5), por grupo
      select 3, 'excedente_contrato',
             coalesce(td.numero, ct.numero)::text, null,
             sum(cc.delta_usd)::numeric(14,2), true, min(cc.criado_em),
             'contratos acima do TDR: excedente R$ ' ||
               (select c2.excedente_depois_brl from public.contrato_coberturas c2
                 where c2.grupo = cc.grupo order by c2.seq desc limit 1)
        from public.contrato_coberturas cc
        left join public.tdrs td      on td.id = cc.tdr_id
        left join public.contratos ct on ct.id = cc.grupo
       where cc.atividade_id = p_atividade
       group by cc.grupo, td.numero, ct.numero
      having sum(cc.delta_usd) <> 0
      union all
      select 4, 'pagamento_contrato_sem_tdr', 'Pagamentos de contrato sem TDR', null,
             d.pagamentos_contrato_sem_tdr_usd, true, null, null
        from public.vw_orcamento_debitos d
       where d.atividade_id = p_atividade and d.pagamentos_contrato_sem_tdr_usd <> 0
    ) d;

  select coalesce(jsonb_agg(to_jsonb(fs) order by fs.ordem_consumo), '[]') into v_fontes
    from public.vw_orcamento_fontes_saldo fs where fs.atividade_id = p_atividade;

  select coalesce(jsonb_agg(to_jsonb(e) - 'atividade_id' order by e.criado_em), '[]') into v_ev
    from public.orcamento_eventos e where e.atividade_id = p_atividade;

  select coalesce(jsonb_agg(jsonb_build_object('numero', r.numero, 'status', r.status, 'valor_usd', i.valor_usd,
                                               'efetivado_em', r.efetivado_em, 'estorno_de', o.numero)
                            order by r.criado_em), '[]') into v_rem
    from public.remanejamento_itens i
    join public.remanejamentos r on r.id = i.remanejamento_id
    left join public.remanejamentos o on o.id = r.estorno_de
   where i.atividade_id = p_atividade and i.ativo and r.status not in ('rascunho');

  return jsonb_build_object(
    'gerado_em', now(),
    'resumo', v_res,
    'creditos', v_cred, 'total_creditos_usd', v_tot_cred,
    'debitos', v_deb, 'total_debitos_usd', v_tot_deb,
    'saldo_calculado_usd', v_tot_cred - v_tot_deb,
    'fecha', (v_tot_cred - v_tot_deb) = (v_res->>'saldo_usd')::numeric,
    'fontes', v_fontes, 'eventos_tdr', v_ev, 'remanejamentos', v_rem);
end $$;
comment on function public.fn_orcamento_extrato(uuid) is
  'Extrato/posição orçamentária da atividade (créditos com procedência, débitos de hoje, fontes, eventos). '
  'Σ créditos − Σ débitos = vw_orcamento_atividade.saldo_usd (campo "fecha").';

-- ── Auditor: domínio orçamento ─────────────────────────────────────────
create or replace function public.fn_auditoria_orcamento()
returns table (severidade text, titulo text, descricao text, recomendacao text,
               referencia_tabela text, referencia_id uuid, referencia_label text)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_ptax date;
begin
  -- 1. invariantes do razão (qualquer falha é crítica)
  return query
  select 'critico'::text,
         ('Orçamento: conferência do razão falhou (' || c.verificacao || ')')::text,
         ('Verificação "' || c.verificacao || '"' || coalesce(' na atividade ' || c.atividade_codigo, '')
           || ': esperado ' || coalesce(c.esperado::text, '—') || ', encontrado ' || coalesce(c.encontrado::text, '—')
           || coalesce(' (' || c.observacao || ')', '') || '.')::text,
         'Invariante do razão orçamentário violada: investigar antes de qualquer novo remanejamento. Ver fn_conferir_orcamento().'::text,
         'atividades'::text, a.id, ('Atividade ' || coalesce(c.atividade_codigo, 'global'))::text
    from public.fn_conferir_orcamento() c
    left join public.atividades a on a.codigo = c.atividade_codigo
   where not c.ok and c.verificacao not like 'info_%'
   limit 20;

  -- 2. pedido efetivado cujo razão não fecha
  return query
  select 'critico'::text, ('Orçamento: remanejamento ' || v.numero || ' não fecha no razão')::text,
         ('Destinos US$ ' || v.destinos_usd || ', lançado a crédito US$ ' || v.recebido_usd
           || ', a débito US$ ' || v.cedido_usd || '.')::text,
         'Os três valores devem ser iguais. Conferir lançamentos do pedido em orcamento_fontes.'::text,
         'remanejamentos'::text, v.id, ('Remanejamento ' || v.numero)::text
    from public.vw_rem_conferencia v
   where v.destinos_usd <> v.recebido_usd or v.recebido_usd <> v.cedido_usd;

  -- 3. contratos travados aguardando cobertura
  return query
  select (case when now() - min(cc.criado_em) > interval '15 days' then 'alto' else 'medio' end)::text,
         ('Orçamento: contrato ' || c.numero || ' travado aguardando cobertura há '
           || extract(day from now() - min(cc.criado_em))::int || ' dia(s)')::text,
         ('O valor acima do TDR não coube no saldo livre da atividade ' || a.codigo || '. Falta cobrir US$ '
           || sum(cc.deficit_usd) || '. Sem produtos nem pagamentos até a cobertura.')::text,
         'Pedir cobertura em Remanejamento › Saldos (botão "Pedir cobertura"), reduzir o valor do contrato ou cancelá-lo.'::text,
         'contratos'::text, c.id, ('Contrato ' || c.numero)::text
    from public.contratos c
    join public.contrato_coberturas cc on cc.contrato_id = c.id and cc.situacao = 'aguardando'
    join public.atividades a on a.id = cc.atividade_id
   where c.status = 'aguardando_cobertura'
   group by c.id, c.numero, a.codigo;

  -- 4. pedidos parados na mesma etapa
  return query
  select (case when now() - h.ultimo > interval '20 days' then 'alto' else 'medio' end)::text,
         ('Orçamento: remanejamento ' || r.numero || ' parado na etapa ' || r.etapa_atual || ' há '
           || extract(day from now() - h.ultimo)::int || ' dia(s)')::text,
         ('O pedido está em aprovação e ninguém assinou, devolveu ou recusou desde '
           || to_char(h.ultimo at time zone 'America/Rio_Branco', 'DD/MM/YYYY') || '. Enquanto tramita, reserva o saldo das fontes de origem.')::text,
         'Cobrar o signatário da etapa atual (fila "Aguardando minha análise") ou cancelar o pedido se não for mais necessário.'::text,
         'remanejamentos'::text, r.id, ('Remanejamento ' || r.numero)::text
    from public.remanejamentos r
    cross join lateral (select max(x.criado_em) as ultimo from public.remanejamento_historico x
                         where x.remanejamento_id = r.id) h
   where r.status = 'em_aprovacao' and now() - h.ultimo > interval '7 days';

  -- 5. cargo da cadeia sem titular
  return query
  select (case when exists (select 1 from public.remanejamentos where status in ('rascunho','em_aprovacao'))
               then 'alto' else 'medio' end)::text,
         ('Orçamento: cargo "' || g.nome || '" sem titular designado')::text,
         ('A cadeia de remanejamento é nominal e sem substituto: sem titular do cargo "' || g.nome
           || '", nenhum pedido passa dessa etapa.')::text,
         'Super admin designa o titular em Remanejamento › Signatários, com o ato de designação.'::text,
         'rem_cargos'::text, null::uuid, g.nome::text
    from public.rem_cargos g
   where fn_rem_titular(g.codigo) is null;

  -- 6. cotação PTAX parada
  select max(data) into v_ptax from public.cotacoes_ptax;
  if v_ptax is null or fn_hoje_acre() - v_ptax > 5 then
    return query select 'alto'::text,
      'Orçamento: cotação PTAX desatualizada'::text,
      ('Última PTAX gravada: ' || coalesce(to_char(v_ptax, 'DD/MM/YYYY'), 'nenhuma')
        || '. Com mais de 7 dias, cadastro de contrato acima do TDR passa a ser recusado (COTACAO_DESATUALIZADA).')::text,
      'Verificar o cron cotacao-ptax-diaria e a Edge Function cotacao-ptax (logs).'::text,
      'cotacoes_ptax'::text, null::uuid, 'PTAX'::text;
  end if;

  -- 7. e-mails da cadeia que não saem
  return query
  select 'medio'::text,
         ('Orçamento: ' || count(*) || ' e-mail(s) de remanejamento sem envio após 3 tentativas')::text,
         ('Último erro: ' || coalesce(max(n.ultimo_erro), '—'))::text,
         'Conferir as credenciais Gmail da Edge Function assinar-remanejamento; o sino segue avisando.'::text,
         'remanejamento_notificacoes'::text, null::uuid, 'Fila de e-mails'::text
    from public.remanejamento_notificacoes n
   where n.enviado_em is null and n.tentativas >= 3
  having count(*) > 0;

  -- 8. déficit existente (informativo: não se regulariza o passado, só se acompanha)
  return query
  select 'info'::text,
         ('Orçamento: atividade ' || o.codigo || ' com saldo livre negativo')::text,
         ('Débitos superam créditos em US$ ' || (o.reservado_usd - o.saldo_usd) || ' (inclui reservas de remanejamento). '
           || 'Novos TDRs são recusados e contratos acima do TDR ficam travados até cobertura.')::text,
         'Avaliar remanejamento de outra atividade ou redução de TDR.'::text,
         'atividades'::text, o.atividade_id, ('Atividade ' || o.codigo)::text
    from public.vw_orcamento_atividade o
   where o.saldo_usd - o.reservado_usd < 0;

  -- 9. TDR ativo sem valor em USD (débito desconhecido)
  return query
  select 'baixo'::text, ('Orçamento: TDR ' || t.numero || ' sem valor em US$')::text,
         ('O TDR conta como zero no débito da atividade ' || a.codigo || ' e impede remanejar a partir dela.')::text,
         'Informar o valor em US$ do TDR.'::text,
         'tdrs'::text, t.id, ('TDR ' || t.numero)::text
    from public.tdrs t join public.atividades a on a.id = t.atividade_id
   where t.status <> 'cancelado' and t.valor_usd is null;
end $$;
comment on function public.fn_auditoria_orcamento() is
  'Achados do domínio orçamento (razão, cobertura, cadeia, PTAX, e-mails) para o auditor-ia. service_role.';

revoke all on function public.fn_orcamento_extrato(uuid) from public, anon;
grant execute on function public.fn_orcamento_extrato(uuid) to authenticated, service_role;
revoke all on function public.fn_auditoria_orcamento() from public, anon, authenticated;
grant execute on function public.fn_auditoria_orcamento() to service_role;

notify pgrst, 'reload schema';
