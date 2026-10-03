-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · Fase 4b — estorno de remanejamento efetivado
-- Especificação: docs/remanejamento/plano.md §3.5.
--
-- Estorno = pedido novo (remanejamentos.estorno_de → original) que inverte o
-- original: quem recebeu cede de volta (− no destino), quem cedeu recebe (+).
-- Passa pela MESMA cadeia de 5 assinaturas (fn_rem_assinar, sem mudança):
-- a liberação (etapa 2) é dos responsáveis das atividades que devolvem.
-- Reserva as fontes recebidas (vw_rem_reservas, pelas alocações) enquanto tramita.
-- Só cabe se cada fonte recebida estiver ÍNTEGRA e LIVRE no valor total (o
-- destino não gastou nem repassou o dinheiro). Efetivar espelha cada lançamento
-- do original com orcamento_fontes.estorno_de (o razão já confere o espelho):
--   recebido +y no destino  → recebido −y (ajusta o próprio crédito)
--   cedido   −x na origem   → cedido   +x (devolve à MESMA fonte de onde saiu)
-- e marca o original 'estornado'. Procedência preservada; nada é apagado.
-- Sem mexer no check de remanejamentos.tipo (só no SQL Editor): o estorno é
-- reconhecido pela coluna estorno_de (tipo continua 'livre').
-- ════════════════════════════════════════════════════════════════════════

alter table public.remanejamentos
  add column if not exists estorno_de uuid references public.remanejamentos(id);
create index if not exists idx_rem_estorno_de on public.remanejamentos (estorno_de) where estorno_de is not null;
comment on column public.remanejamentos.estorno_de is
  'Pedido de estorno: aponta para o remanejamento efetivado que ele desfaz (§3.5).';

-- Validação específica do estorno (chamada por fn_rem_validar)
create or replace function public.fn_rem_validar_estorno(p_rem uuid)
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_rem  public.remanejamentos;
  v_orig public.remanejamentos;
  r record;
begin
  select * into v_rem from public.remanejamentos where id = p_rem;
  if v_rem.estorno_de is null then return; end if;
  select * into v_orig from public.remanejamentos where id = v_rem.estorno_de;
  if v_orig.status <> 'efetivado' then
    raise exception 'REM_INVALIDO: só se estorna remanejamento efetivado (% está %).', v_orig.numero, v_orig.status;
  end if;
  if exists (select 1 from public.remanejamentos x
              where x.estorno_de = v_orig.id and x.id <> p_rem
                and x.status in ('rascunho','em_aprovacao','efetivado')) then
    raise exception 'REM_INVALIDO: já existe outro pedido de estorno de %.', v_orig.numero;
  end if;

  -- itens = exatamente o inverso dos itens do original
  if exists (
       select atividade_id, -valor_usd from public.remanejamento_itens where remanejamento_id = v_orig.id and ativo
       except
       select atividade_id, valor_usd from public.remanejamento_itens where remanejamento_id = p_rem and ativo)
     or exists (
       select atividade_id, valor_usd from public.remanejamento_itens where remanejamento_id = p_rem and ativo
       except
       select atividade_id, -valor_usd from public.remanejamento_itens where remanejamento_id = v_orig.id and ativo) then
    raise exception 'REM_INVALIDO: o estorno precisa inverter exatamente os itens de %.', v_orig.numero;
  end if;

  -- cada fonte recebida no original: alocada inteira, sem ajuste posterior
  for r in
    select f.id, f.valor_usd, a.codigo,
           (select coalesce(sum(j.valor_usd), 0) from public.orcamento_fontes j where j.ajusta_fonte_id = f.id) as ajustes,
           coalesce((select sum(x.valor_usd) from public.remanejamento_alocacoes x
                      where x.remanejamento_id = p_rem and x.fonte_id = f.id and x.ativo), 0) as alocado
      from public.orcamento_fontes f join public.atividades a on a.id = f.atividade_id
     where f.remanejamento_id = v_orig.id and f.tipo = 'remanejamento_recebido' and f.estorno_de is null
  loop
    if r.ajustes <> 0 then
      raise exception 'REM_INVALIDO: o valor recebido por % em % já foi repassado/ajustado — estorne antes o que veio depois.',
        r.codigo, v_orig.numero;
    end if;
    if r.alocado <> r.valor_usd then
      raise exception 'REM_INVALIDO: o estorno devolve o recebido por % inteiro (US$ %), não US$ %.', r.codigo, r.valor_usd, r.alocado;
    end if;
  end loop;
  if exists (select 1 from public.remanejamento_alocacoes x
              where x.remanejamento_id = p_rem and x.ativo
                and not exists (select 1 from public.orcamento_fontes f
                                 where f.id = x.fonte_id and f.remanejamento_id = v_orig.id
                                   and f.tipo = 'remanejamento_recebido')) then
    raise exception 'REM_INVALIDO: o estorno só devolve as fontes recebidas em %.', v_orig.numero;
  end if;
  -- "livre no valor total" é conferido por fn_rem_validar (fn_rem_fonte_livre ≥ alocado)
end $$;

-- Cria o rascunho do estorno a partir do original (coordenação)
create or replace function public.fn_rem_criar_estorno(p_rem uuid, p_justificativa text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid  uuid := auth.uid();
  v_orig public.remanejamentos;
  v_novo uuid;
  v_ano  integer := extract(year from fn_hoje_acre())::integer;
  v_seq  integer;
begin
  if coalesce(fn_perfil_atual()::text, '') not in ('coordenacao','super_admin') then
    raise exception 'Sem permissão: só a coordenação pede estorno de remanejamento.';
  end if;
  select * into v_orig from public.remanejamentos where id = p_rem for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_orig.estorno_de is not null then
    raise exception 'REM: % já é um estorno — para desfazê-lo, faça um remanejamento novo.', v_orig.numero;
  end if;
  if v_orig.status <> 'efetivado' then
    raise exception 'REM: só se estorna remanejamento efetivado (% está %).', v_orig.numero, v_orig.status;
  end if;
  select id into v_novo from public.remanejamentos
   where estorno_de = p_rem and status in ('rascunho','em_aprovacao','efetivado') limit 1;
  if v_novo is not null then return v_novo; end if;   -- idempotente: devolve o que já existe

  insert into public.rem_numeracao (ano, ultimo) values (v_ano, 1)
    on conflict (ano) do update set ultimo = public.rem_numeracao.ultimo + 1
    returning ultimo into v_seq;
  insert into public.remanejamentos (numero, tipo, estorno_de, justificativa, criado_por)
  values ('REM-' || v_ano || '-' || lpad(v_seq::text, 3, '0'), 'livre', p_rem,
          coalesce(nullif(btrim(p_justificativa), ''), '(rascunho)'), v_uid)
  returning id into v_novo;

  insert into public.remanejamento_itens (remanejamento_id, atividade_id, valor_usd)
  select v_novo, i.atividade_id, -i.valor_usd
    from public.remanejamento_itens i where i.remanejamento_id = p_rem and i.ativo;

  insert into public.remanejamento_alocacoes (remanejamento_id, item_id, fonte_id, valor_usd)
  select v_novo, ni.id, f.id, f.valor_usd
    from public.orcamento_fontes f
    join public.remanejamento_itens ni on ni.remanejamento_id = v_novo and ni.atividade_id = f.atividade_id
   where f.remanejamento_id = p_rem and f.tipo = 'remanejamento_recebido' and f.estorno_de is null;

  update public.remanejamentos set hash_documento = fn_rem_hash(id) where id = v_novo;
  perform fn_rem_log(v_novo, 'criado', null, 'rascunho', null, v_uid, null,
                     jsonb_build_object('estorno_de', v_orig.numero));
  perform fn_rem_log(p_rem, 'estorno_solicitado', null, null, null, v_uid, p_justificativa,
                     jsonb_build_object('pedido_estorno', v_novo));
  return v_novo;
end $$;

-- Efetivação do estorno: espelha cada lançamento do original
create or replace function public.fn_rem_efetivar_estorno(p_rem uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_rem  public.remanejamentos;
  v_orig public.remanejamentos;
  f record;
  v_n integer := 0;
begin
  select * into v_rem from public.remanejamentos where id = p_rem;
  select * into v_orig from public.remanejamentos where id = v_rem.estorno_de for update;

  -- 1º os recebidos (tira do destino), depois as cessões (devolve à fonte de origem)
  for f in
    select * from public.orcamento_fontes
     where remanejamento_id = v_orig.id and estorno_de is null
     order by case tipo when 'remanejamento_recebido' then 0 else 1 end, criado_em, id
  loop
    insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, ajusta_fonte_id, estorno_de,
                                         fonte_origem_id, remanejamento_id, descricao, criado_por)
    values (f.atividade_id, f.tipo, -f.valor_usd, coalesce(f.ajusta_fonte_id, f.id), f.id,
            f.fonte_origem_id, p_rem, 'Estorno de ' || v_orig.numero || ' (' || v_rem.numero || ')', p_usuario);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'REM: % não tem lançamentos para estornar (bug).', v_orig.numero; end if;

  update public.remanejamentos set status = 'efetivado', efetivado_em = now(), etapa_atual = null where id = p_rem;
  update public.remanejamentos set status = 'estornado', encerrado_em = now(),
         motivo_encerramento = 'estornado por ' || v_rem.numero where id = v_orig.id;
  perform fn_rem_log(p_rem, 'efetivado', 'em_aprovacao', 'efetivado', null, p_usuario, null,
                     jsonb_build_object('estorno_de', v_orig.numero, 'lancamentos', v_n));
  perform fn_rem_log(v_orig.id, 'estornado', 'efetivado', 'estornado', null, p_usuario, null,
                     jsonb_build_object('pedido_estorno', v_rem.numero));
end $$;

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

  -- estorno: tem de ser o espelho exato do original, que segue efetivado e intacto
  perform fn_rem_validar_estorno(p_rem);
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
    if v_rem.estorno_de is not null and p_dados ? 'itens' then
      raise exception 'REM: pedido de estorno espelha o original — só a justificativa é editável.';
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

create or replace function public.fn_rem_efetivar(p_rem uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_rem public.remanejamentos;
  o record; d record;
  v_origens jsonb := '[]'; v_destinos jsonb := '[]';
  i integer := 0; j integer := 0;
  v_resto_o numeric; v_resto_d numeric; v_x numeric;
begin
  select * into v_rem from public.remanejamentos where id = p_rem;

  -- trava as atividades envolvidas em ordem fixa (evita corrida e deadlock)
  perform 1 from public.atividades
   where id in (select atividade_id from public.remanejamento_itens where remanejamento_id = p_rem and ativo)
   order by id for update;

  perform fn_rem_validar(p_rem);   -- revalida saldo/reservas sob a trava

  -- estorno: espelha os lançamentos do pedido original (ver fn_rem_efetivar_estorno)
  if v_rem.estorno_de is not null then
    perform fn_rem_efetivar_estorno(p_rem, p_usuario);
    return;
  end if;

  -- cessões: cada alocação vira lançamento negativo na fonte de origem
  for o in
    select x.id, x.fonte_id, x.valor_usd, i.atividade_id, a.codigo
      from public.remanejamento_alocacoes x
      join public.remanejamento_itens i on i.id = x.item_id
      join public.atividades a on a.id = i.atividade_id
      join public.orcamento_fontes f on f.id = x.fonte_id
     where x.remanejamento_id = p_rem and x.ativo
     order by a.codigo, f.criado_em, f.id
  loop
    insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, ajusta_fonte_id, remanejamento_id, descricao, criado_por)
    values (o.atividade_id, 'remanejamento_cedido', -o.valor_usd, o.fonte_id, p_rem,
            'Cedido em ' || v_rem.numero, p_usuario);
    v_origens := v_origens || jsonb_build_object('fonte_id', o.fonte_id, 'codigo', o.codigo, 'valor', o.valor_usd);
  end loop;

  for d in
    select i.atividade_id, a.codigo, i.valor_usd
      from public.remanejamento_itens i join public.atividades a on a.id = i.atividade_id
     where i.remanejamento_id = p_rem and i.valor_usd > 0 and i.ativo
     order by a.codigo
  loop
    v_destinos := v_destinos || jsonb_build_object('atividade_id', d.atividade_id, 'codigo', d.codigo, 'valor', d.valor_usd);
  end loop;

  -- recebimentos: pareia origens × destinos na ordem (centavo exato, sem rateio)
  v_resto_o := (v_origens->0->>'valor')::numeric;
  v_resto_d := (v_destinos->0->>'valor')::numeric;
  while i < jsonb_array_length(v_origens) and j < jsonb_array_length(v_destinos) loop
    v_x := least(v_resto_o, v_resto_d);
    insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, fonte_origem_id, remanejamento_id, descricao, criado_por)
    values ((v_destinos->j->>'atividade_id')::uuid, 'remanejamento_recebido', v_x,
            (v_origens->i->>'fonte_id')::uuid, p_rem,
            'Recebido em ' || v_rem.numero || ' de ' || (v_origens->i->>'codigo'), p_usuario);
    v_resto_o := v_resto_o - v_x;
    v_resto_d := v_resto_d - v_x;
    if v_resto_o = 0 then
      i := i + 1;
      if i < jsonb_array_length(v_origens) then v_resto_o := (v_origens->i->>'valor')::numeric; end if;
    end if;
    if v_resto_d = 0 then
      j := j + 1;
      if j < jsonb_array_length(v_destinos) then v_resto_d := (v_destinos->j->>'valor')::numeric; end if;
    end if;
  end loop;
  if i < jsonb_array_length(v_origens) or j < jsonb_array_length(v_destinos) then
    raise exception 'REM: pareamento origem × destino não fechou (bug) — nada foi gravado.';
  end if;

  update public.remanejamentos
     set status = 'efetivado', efetivado_em = now(), etapa_atual = null
   where id = p_rem;
  perform fn_rem_log(p_rem, 'efetivado', 'em_aprovacao', 'efetivado', null, p_usuario, null,
                     jsonb_build_object('origens', v_origens, 'destinos', v_destinos));
end $$;

-- Conferência por pedido: Σ positivos = Σ destinos = −Σ negativos (vale para estorno)
create or replace view public.vw_rem_conferencia as
select r.id, r.numero,
       coalesce((select sum(i.valor_usd) from public.remanejamento_itens i
                  where i.remanejamento_id = r.id and i.valor_usd > 0 and i.ativo), 0)::numeric(14,2) as destinos_usd,
       coalesce((select sum(f.valor_usd) from public.orcamento_fontes f
                  where f.remanejamento_id = r.id and f.valor_usd > 0), 0)::numeric(14,2) as recebido_usd,
       coalesce((select -sum(f.valor_usd) from public.orcamento_fontes f
                  where f.remanejamento_id = r.id and f.valor_usd < 0), 0)::numeric(14,2) as cedido_usd
  from public.remanejamentos r
 where r.status in ('efetivado','estornado');

revoke all on function public.fn_rem_validar_estorno(uuid)       from public, anon, authenticated;
revoke all on function public.fn_rem_efetivar_estorno(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_rem_efetivar(uuid, uuid)         from public, anon, authenticated;
revoke all on function public.fn_rem_criar_estorno(uuid, text)    from public, anon;
grant execute on function public.fn_rem_criar_estorno(uuid, text) to authenticated, service_role;
revoke all on public.vw_rem_conferencia from anon, authenticated, public;
grant select on public.vw_rem_conferencia to authenticated;

notify pgrst, 'reload schema';
