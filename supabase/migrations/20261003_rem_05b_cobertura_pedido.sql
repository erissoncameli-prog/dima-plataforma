-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · Fase 5b — pedido de cobertura e conferência
-- Depois da rem_05. Pedido tipo 'cobertura_contrato' (destino = atividade do
-- contrato travado); a efetivação credita a fonte e o trigger da rem_05 libera
-- o contrato. A conferência passa a explicar o excedente e a checar a trava.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.fn_rem_validar(p_rem uuid)
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_soma numeric; v_n_or integer; v_n_de integer;
  r record;
begin
  if (select btrim(justificativa) in ('', '(rascunho)') or length(btrim(justificativa)) < 15
        from public.remanejamentos where id = p_rem) then
    raise exception 'REM_INVALIDO: escreva a justificativa do remanejamento (mínimo 15 caracteres).';
  end if;
  select coalesce(sum(valor_usd), 0), count(*) filter (where valor_usd < 0), count(*) filter (where valor_usd > 0)
    into v_soma, v_n_or, v_n_de
    from public.remanejamento_itens where remanejamento_id = p_rem and ativo;
  if v_n_or = 0 or v_n_de = 0 then
    raise exception 'REM_INVALIDO: o pedido precisa de ao menos uma origem (valor negativo) e um destino (positivo).';
  end if;
  if v_soma <> 0 then
    raise exception 'REM_INVALIDO: a soma dos itens precisa ser zero (está em US$ %).', v_soma;
  end if;

  for r in
    select i.id, i.atividade_id, a.codigo, a.ativo, i.valor_usd,
           coalesce((select sum(x.valor_usd) from public.remanejamento_alocacoes x where x.item_id = i.id and x.ativo), 0) as alocado
      from public.remanejamento_itens i join public.atividades a on a.id = i.atividade_id
     where i.remanejamento_id = p_rem and i.ativo
  loop
    if not r.ativo then raise exception 'REM_INVALIDO: atividade % inativa.', r.codigo; end if;
    if r.valor_usd > 0 and r.alocado <> 0 then
      raise exception 'REM_INVALIDO: destino % não leva alocação de fonte.', r.codigo;
    end if;
    if r.valor_usd < 0 and r.alocado <> -r.valor_usd then
      raise exception 'REM_INVALIDO: as fontes alocadas na origem % somam US$ %, mas a cessão é de US$ %.',
        r.codigo, r.alocado, -r.valor_usd;
    end if;
    if r.valor_usd < 0 and (select tdrs_sem_valor_usd from public.vw_orcamento_debitos where atividade_id = r.atividade_id) > 0 then
      raise exception 'REM_INVALIDO: a origem % tem TDR ativo sem valor em USD — o débito é desconhecido.', r.codigo;
    end if;
  end loop;

  for r in
    select x.fonte_id, x.valor_usd, i.atividade_id, a.codigo, f.atividade_id as fonte_atividade, f.ajusta_fonte_id
      from public.remanejamento_alocacoes x
      join public.remanejamento_itens i on i.id = x.item_id
      join public.atividades a on a.id = i.atividade_id
      join public.orcamento_fontes f on f.id = x.fonte_id
     where x.remanejamento_id = p_rem and x.ativo
  loop
    if r.fonte_atividade <> r.atividade_id or r.ajusta_fonte_id is not null then
      raise exception 'REM_INVALIDO: a fonte % não é um crédito da atividade %.', r.fonte_id, r.codigo;
    end if;
    if r.valor_usd > public.fn_rem_fonte_livre(r.fonte_id, p_rem) then
      raise exception 'SALDO_INSUFICIENTE: a fonte % da atividade % tem US$ % livre, e o pedido aloca US$ %.',
        r.fonte_id, r.codigo, public.fn_rem_fonte_livre(r.fonte_id, p_rem), r.valor_usd;
    end if;
  end loop;

  -- cobertura: o destino tem de ser a atividade do contrato travado
  if (select tipo from public.remanejamentos where id = p_rem) = 'cobertura_contrato'
     and not exists (
       select 1 from public.remanejamento_itens i
         join public.remanejamentos rq on rq.id = i.remanejamento_id
         join public.contratos c on c.id = rq.contrato_id
         left join public.tdrs t on t.id = c.tdr_id
        where i.remanejamento_id = p_rem and i.ativo and i.valor_usd > 0
          and i.atividade_id = coalesce(t.atividade_id, c.atividade_id)) then
    raise exception 'REM_INVALIDO: pedido de cobertura precisa ter como destino a atividade do contrato.';
  end if;
end $$;

create or replace function public.fn_rem_salvar(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid  uuid := auth.uid();
  v_rem  public.remanejamentos;
  v_ano  integer := extract(year from fn_hoje_acre())::integer;
  v_seq  integer;
  v_it   jsonb;
  v_item uuid;
  v_tipo text := 'livre';
  v_contrato uuid;
begin
  if coalesce(fn_perfil_atual()::text, '') not in ('coordenacao','super_admin') then
    raise exception 'Sem permissão: só a coordenação monta pedido de remanejamento.';
  end if;
  if p_id is null then
    v_tipo := coalesce(p_dados->>'tipo', 'livre');
    if v_tipo not in ('livre','cobertura_contrato') then
      raise exception 'REM: tipo de pedido inválido: %', v_tipo;
    end if;
    if v_tipo = 'cobertura_contrato' then
      v_contrato := nullif(p_dados->>'contrato_id', '')::uuid;
      if not exists (select 1 from public.contratos where id = v_contrato and status = 'aguardando_cobertura') then
        raise exception 'COBERTURA: o contrato informado não está aguardando cobertura.';
      end if;
    end if;
  end if;

  if p_id is null then
    if p_dados ? 'uuid_cliente' then
      select * into v_rem from public.remanejamentos where uuid_cliente = (p_dados->>'uuid_cliente')::uuid;
      if found then return v_rem.id; end if;
    end if;
    insert into public.rem_numeracao (ano, ultimo) values (v_ano, 1)
      on conflict (ano) do update set ultimo = public.rem_numeracao.ultimo + 1
      returning ultimo into v_seq;
    insert into public.remanejamentos (numero, tipo, contrato_id, justificativa, uuid_cliente, criado_por)
    values ('REM-' || v_ano || '-' || lpad(v_seq::text, 3, '0'), v_tipo, v_contrato,
            coalesce(nullif(btrim(p_dados->>'justificativa'), ''), '(rascunho)'),
            (p_dados->>'uuid_cliente')::uuid, v_uid)
    returning * into v_rem;
    perform fn_rem_log(v_rem.id, 'criado', null, 'rascunho', null, v_uid, null);
  else
    select * into v_rem from public.remanejamentos where id = p_id for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if v_rem.criado_por <> v_uid and coalesce(fn_perfil_atual()::text, '') <> 'super_admin' then
      raise exception 'Só quem criou o pedido o edita.';
    end if;
    if v_rem.status = 'em_aprovacao' and v_rem.etapa_atual = 1 then
      -- devolvido ao solicitante: editar abre nova versão; a cadeia recomeça
      update public.remanejamento_assinaturas
         set invalidada_em = now(), invalidada_motivo = 'pedido editado pelo solicitante (nova versão)'
       where remanejamento_id = v_rem.id and versao = v_rem.versao and invalidada_em is null;
      update public.remanejamentos set status = 'rascunho', etapa_atual = null, versao = versao + 1
       where id = v_rem.id returning * into v_rem;
      perform fn_rem_log(v_rem.id, 'editado_apos_devolucao', 'em_aprovacao', 'rascunho', 1, v_uid, null);
    elsif v_rem.status <> 'rascunho' then
      raise exception 'Pedido % em % não pode ser editado.', v_rem.numero, v_rem.status;
    end if;
    update public.remanejamentos
       set justificativa = coalesce(nullif(btrim(p_dados->>'justificativa'), ''), justificativa)
     where id = v_rem.id;
  end if;

  -- Nada é apagado: o que sai do rascunho fica com ativo = false (histórico do rascunho);
  -- o que volta é reativado com o valor novo.
  if p_dados ? 'itens' then
    update public.remanejamento_alocacoes set ativo = false where remanejamento_id = v_rem.id and ativo;
    update public.remanejamento_itens     set ativo = false where remanejamento_id = v_rem.id and ativo;
    for v_it in select * from jsonb_array_elements(p_dados->'itens') loop
      insert into public.remanejamento_itens (remanejamento_id, atividade_id, valor_usd)
      values (v_rem.id, (v_it->>'atividade_id')::uuid, round((v_it->>'valor_usd')::numeric, 2))
      on conflict (remanejamento_id, atividade_id)
        do update set valor_usd = excluded.valor_usd, ativo = true;
    end loop;
    for v_it in select * from jsonb_array_elements(coalesce(p_dados->'alocacoes', '[]'::jsonb)) loop
      select id into v_item from public.remanejamento_itens
       where remanejamento_id = v_rem.id and atividade_id = (v_it->>'atividade_id')::uuid and valor_usd < 0 and ativo;
      if v_item is null then
        raise exception 'Alocação para atividade que não é origem do pedido: %', v_it->>'atividade_id';
      end if;
      insert into public.remanejamento_alocacoes (remanejamento_id, item_id, fonte_id, valor_usd)
      values (v_rem.id, v_item, (v_it->>'fonte_id')::uuid, round((v_it->>'valor_usd')::numeric, 2))
      on conflict (item_id, fonte_id)
        do update set valor_usd = excluded.valor_usd, ativo = true;
    end loop;
  end if;

  update public.remanejamentos set hash_documento = fn_rem_hash(id) where id = v_rem.id;
  perform fn_rem_log(v_rem.id, 'rascunho_salvo', null, null, null, v_uid, null);
  return v_rem.id;
end $$;

create or replace function public.fn_conferir_orcamento()
returns table (verificacao text, atividade_codigo text, esperado numeric, encontrado numeric, ok boolean, observacao text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null and coalesce(fn_perfil_atual()::text, '')
       not in ('super_admin','coordenacao','financeiro') then
    raise exception 'Sem permissão para conferir o razão orçamentário.';
  end if;

  -- 1. cache do orçamento vigente = Σ lançamentos orçamentários
  return query
  select 'orcamento_vigente_igual_razao'::text, a.codigo::text, x.razao, a.orcamento_usd,
         a.orcamento_usd = x.razao, null::text
    from public.atividades a
    cross join lateral (select coalesce(sum(f.valor_usd), 0)::numeric(14,2) as razao
                          from public.orcamento_fontes f where f.atividade_id = a.id and f.orcamentaria) x;

  -- 2. dotação original congelada = Σ dotacao_original
  return query
  select 'dotacao_original_igual_razao'::text, a.codigo::text, x.dot, a.orcamento_original_usd,
         a.orcamento_original_usd is not distinct from x.dot, null::text
    from public.atividades a
    cross join lateral (select sum(f.valor_usd)::numeric(14,2) as dot
                          from public.orcamento_fontes f where f.atividade_id = a.id and f.tipo = 'dotacao_original') x;

  -- 3. liberações no razão = liberações ativas que a vw_saldo_atividade soma
  return query
  select 'liberacoes_iguais_encerramentos'::text, a.codigo::text, e.enc, r.raz, e.enc = r.raz, null::text
    from public.atividades a
    cross join lateral (select coalesce(sum(round(ce.valor_liberado_usd, 2)), 0)::numeric(14,2) as enc
                          from public.contrato_encerramentos ce
                         where ce.atividade_id = a.id and ce.status = 'ativo') e
    cross join lateral (select coalesce(sum(f.valor_usd), 0)::numeric(14,2) as raz
                          from public.orcamento_fontes f
                         where f.atividade_id = a.id and f.tipo in ('economia_contratacao','encerramento_contrato')) r;

  -- 4. PEPS fecha: Σ disponível das fontes = max(0, créditos − débitos)
  return query
  select 'fontes_disponiveis_fecham'::text, o.codigo::text, greatest(0, o.saldo_usd), o.disponivel_fontes_usd,
         o.disponivel_fontes_usd = greatest(0, o.saldo_usd), null::text
    from public.vw_orcamento_atividade o;

  -- 5. nenhuma fonte com líquido negativo
  return query
  select 'fonte_sem_liquido_negativo'::text, fs.atividade_codigo::text, 0::numeric, fs.liquido_usd,
         false, 'fonte ' || fs.fonte_id::text
    from public.vw_orcamento_fontes_saldo fs where fs.liquido_usd < 0;

  -- 6. global: remanejamento não cria dinheiro
  return query
  select 'global_vigente_igual_original_mais_revisoes'::text, null::text,
         (select coalesce(sum(f.valor_usd), 0) from public.orcamento_fontes f
           where f.tipo in ('dotacao_original','revisao_orcamentaria'))::numeric(14,2),
         (select coalesce(sum(a.orcamento_usd), 0) from public.atividades a)::numeric(14,2),
         (select coalesce(sum(f.valor_usd), 0) from public.orcamento_fontes f
           where f.tipo in ('dotacao_original','revisao_orcamentaria'))
         = (select coalesce(sum(a.orcamento_usd), 0) from public.atividades a),
         null::text;

  -- 7. diferença entre o saldo do razão e o saldo livre do painel só pode
  --    vir de execução direta acima da reserva, de pagamento de contrato sem TDR
  --    ou de excedente de contrato sobre o TDR (fase 5)
  return query
  select 'diferenca_painel_explicada'::text, o.codigo::text,
         (greatest(0, o.execucao_direta_realizada_usd - o.reserva_execucao_direta_usd)
          + o.pagamentos_contrato_sem_tdr_usd + o.contratos_excedente_usd)::numeric(14,2),
         (o.saldo_livre_painel_usd - o.saldo_usd)::numeric(14,2),
         (o.saldo_livre_painel_usd - o.saldo_usd)
           = greatest(0, o.execucao_direta_realizada_usd - o.reserva_execucao_direta_usd)
             + o.pagamentos_contrato_sem_tdr_usd + o.contratos_excedente_usd,
         null::text
    from public.vw_orcamento_atividade o;

  -- 7b. excedente gravado de cada grupo (TDR ou contrato sem TDR) = excedente atual
  return query
  select 'cobertura_excedente_atual'::text, a.codigo::text, x.atual, x.gravado, x.atual = x.gravado,
         'grupo ' || x.grupo::text
    from (select g.grupo, g.atividade_id,
                 public.fn_cob_excedente_brl(g.grupo, g.tdr_id, null, 0) as atual,
                 coalesce((select cc.excedente_depois_brl from public.contrato_coberturas cc
                            where cc.grupo = g.grupo order by cc.seq desc limit 1), 0)::numeric(14,2) as gravado
            from (select distinct coalesce(c.tdr_id, c.id) as grupo, c.tdr_id,
                         coalesce(t.atividade_id, c.atividade_id) as atividade_id
                    from public.contratos c left join public.tdrs t on t.id = c.tdr_id) g) x
    left join public.atividades a on a.id = x.atividade_id
   where x.atual <> x.gravado;

  -- 7c. contrato travado ⇔ tem pendência de cobertura
  return query
  select 'contrato_travado_tem_pendencia'::text, c.numero::text, 1::numeric, 0::numeric, false,
         'status ' || c.status::text
    from public.contratos c
   where (c.status = 'aguardando_cobertura')
      <> exists (select 1 from public.contrato_coberturas cc
                  where cc.contrato_id = c.id and cc.situacao = 'aguardando');

  -- 8. informativo (não bloqueia): resultado × Σ atividades e TDR sem USD
  return query
  select 'info_resultado_igual_atividades'::text, r.codigo::text, r.orcamento_usd,
         coalesce(s.soma, 0)::numeric(14,2), r.orcamento_usd is not distinct from coalesce(s.soma, 0),
         'pré-existente; resultados.orcamento_usd não é derivado ainda'::text
    from public.resultados r
    left join (select resultado_id, sum(orcamento_usd) soma from public.atividades group by 1) s
      on s.resultado_id = r.id;

  return query
  select 'info_tdr_ativo_sem_valor_usd'::text, o.codigo::text, 0::numeric, o.tdrs_sem_valor_usd::numeric,
         o.tdrs_sem_valor_usd = 0, 'TDR conta como zero no débito'::text
    from public.vw_orcamento_atividade o where o.tdrs_sem_valor_usd > 0;
end $$;

notify pgrst, 'reload schema';
