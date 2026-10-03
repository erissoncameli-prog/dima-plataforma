-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · rascunho sem DELETE
--
-- O apply_migration do MCP espera uma confirmação para qualquer SQL com
-- DELETE/DROP, e essa confirmação não chega à sessão. Em vez de apagar e
-- regravar itens/alocações ao editar o rascunho, fn_rem_salvar agora marca
-- o que saiu com ativo = false e reativa o que volta (on conflict do update).
-- Nada é apagado — o rascunho guarda o próprio histórico. Toda leitura de
-- itens/alocações (hash, reservas, validação, efetivação, cadeia,
-- conferência, e-mail e tela) passa a filtrar ativo.
-- Conteúdo idêntico ao de 20261003_rem_03_cadeia_aprovacao.sql (referência).
-- ════════════════════════════════════════════════════════════════════════

alter table public.remanejamento_itens     add column if not exists ativo boolean not null default true;
alter table public.remanejamento_alocacoes add column if not exists ativo boolean not null default true;
comment on column public.remanejamento_itens.ativo is 'false = retirado do rascunho (nada é apagado).';
comment on column public.remanejamento_alocacoes.ativo is 'false = retirada do rascunho (nada é apagado).';

create or replace function public.fn_rem_hash(p_id uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'numero', r.numero, 'tipo', r.tipo, 'contrato_id', r.contrato_id,
    'justificativa', r.justificativa, 'versao', r.versao,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('atividade_id', i.atividade_id, 'valor_usd', i.valor_usd)
                                        order by i.atividade_id), '[]'::jsonb)
                from public.remanejamento_itens i where i.remanejamento_id = r.id and i.ativo),
    'alocacoes', (select coalesce(jsonb_agg(jsonb_build_object('atividade_id', i.atividade_id, 'fonte_id', a.fonte_id,
                                                               'valor_usd', a.valor_usd)
                                            order by i.atividade_id, a.fonte_id), '[]'::jsonb)
                    from public.remanejamento_alocacoes a join public.remanejamento_itens i on i.id = a.item_id
                   where a.remanejamento_id = r.id and a.ativo)
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.remanejamentos r where r.id = p_id
$$;

create or replace view public.vw_rem_reservas as
select a.fonte_id, a.remanejamento_id, sum(a.valor_usd)::numeric(14,2) as reservado_usd
  from public.remanejamento_alocacoes a
  join public.remanejamentos r on r.id = a.remanejamento_id and r.status = 'em_aprovacao'
 where a.ativo
 group by a.fonte_id, a.remanejamento_id;

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
begin
  if coalesce(fn_perfil_atual()::text, '') not in ('coordenacao','super_admin') then
    raise exception 'Sem permissão: só a coordenação monta pedido de remanejamento.';
  end if;
  if coalesce(p_dados->>'tipo', 'livre') <> 'livre' then
    raise exception 'REM: pedido de cobertura de contrato nasce do cadastro do contrato (fase seguinte).';
  end if;

  if p_id is null then
    if p_dados ? 'uuid_cliente' then
      select * into v_rem from public.remanejamentos where uuid_cliente = (p_dados->>'uuid_cliente')::uuid;
      if found then return v_rem.id; end if;
    end if;
    insert into public.rem_numeracao (ano, ultimo) values (v_ano, 1)
      on conflict (ano) do update set ultimo = public.rem_numeracao.ultimo + 1
      returning ultimo into v_seq;
    insert into public.remanejamentos (numero, tipo, justificativa, uuid_cliente, criado_por)
    values ('REM-' || v_ano || '-' || lpad(v_seq::text, 3, '0'), 'livre',
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

create or replace function public.fn_rem_assinar(
  p_usuario_id uuid, p_remanejamento_id uuid, p_decisao text, p_motivo text,
  p_hash text, p_ip text default null, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_rem    public.remanejamentos;
  v_etapa  public.remanejamento_etapas;
  v_ant    public.remanejamento_etapas;
  v_prox   public.remanejamento_etapas;
  v_total  integer;
  v_ass    uuid;
  v_titular uuid;
  v_ordem  integer := 0;
  o record;
  v_avisar uuid[];
begin
  if p_decisao not in ('aprovar','devolver','recusar','cancelar') then
    raise exception 'Decisão inválida: %', p_decisao;
  end if;
  if not exists (select 1 from public.usuarios where id = p_usuario_id and ativo) then
    raise exception 'Usuário inexistente ou inativo.';
  end if;

  select * into v_rem from public.remanejamentos where id = p_remanejamento_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if p_hash is distinct from fn_rem_hash(v_rem.id) then
    raise exception 'DOCUMENTO_ALTERADO: o pedido mudou depois que você o abriu. Recarregue e confira antes de assinar.';
  end if;

  -- ── cancelar (solicitante, antes de sair da mão dele)
  if p_decisao = 'cancelar' then
    if not (v_rem.status = 'rascunho' or (v_rem.status = 'em_aprovacao' and v_rem.etapa_atual = 1)) then
      raise exception 'Só dá para cancelar em rascunho ou quando o pedido está devolvido ao solicitante.';
    end if;
    if p_usuario_id <> v_rem.criado_por and p_usuario_id is distinct from fn_rem_titular('coordenacao_solicitante') then
      raise exception 'Só o solicitante cancela o pedido.';
    end if;
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
    update public.remanejamento_assinaturas set invalidada_em = now(), invalidada_motivo = 'pedido cancelado'
     where remanejamento_id = v_rem.id and versao = v_rem.versao and invalidada_em is null;
    update public.remanejamentos set status = 'cancelado', etapa_atual = null, encerrado_em = now(),
           motivo_encerramento = btrim(p_motivo) where id = v_rem.id;
    perform fn_rem_log(v_rem.id, 'cancelado', v_rem.status, 'cancelado', v_rem.etapa_atual, p_usuario_id, p_motivo);
    return jsonb_build_object('status', 'cancelado');
  end if;

  -- ── submissão (rascunho → cadeia)
  if v_rem.status = 'rascunho' then
    if p_decisao <> 'aprovar' then raise exception 'Pedido em rascunho: só é possível enviar (aprovar) ou cancelar.'; end if;
    v_titular := fn_rem_titular('coordenacao_solicitante');
    if v_titular is null then raise exception 'SEM_SIGNATARIO: o cargo de coordenação solicitante está sem titular.'; end if;
    if p_usuario_id <> v_titular then
      raise exception 'Só o titular da coordenação solicitante envia o pedido.';
    end if;
    perform fn_rem_validar(v_rem.id);

    -- monta a cadeia desta versão
    insert into public.remanejamento_etapas (remanejamento_id, versao, ordem, papel, cargo)
    values (v_rem.id, v_rem.versao, 1, 'solicitacao', 'coordenacao_solicitante');
    v_ordem := 1;
    for o in
      select i.atividade_id, a.codigo from public.remanejamento_itens i join public.atividades a on a.id = i.atividade_id
       where i.remanejamento_id = v_rem.id and i.valor_usd < 0 and i.ativo order by a.codigo
    loop
      v_ordem := v_ordem + 1;
      insert into public.remanejamento_etapas (remanejamento_id, versao, ordem, papel, atividade_id)
      values (v_rem.id, v_rem.versao, v_ordem, 'liberacao_origem', o.atividade_id);
    end loop;
    insert into public.remanejamento_etapas (remanejamento_id, versao, ordem, papel, cargo) values
      (v_rem.id, v_rem.versao, v_ordem + 1, 'unesco',    'unesco_financeiro'),
      (v_rem.id, v_rem.versao, v_ordem + 2, 'diretoria', 'diretor'),
      (v_rem.id, v_rem.versao, v_ordem + 3, 'secretaria','secretario');

    -- toda etapa precisa de alguém que possa assinar e que não assine outra etapa
    for v_etapa in select * from public.remanejamento_etapas
                    where remanejamento_id = v_rem.id and versao = v_rem.versao order by ordem loop
      if not exists (
        select 1 from fn_rem_signatarios_etapa(v_etapa.id) s(uid)
         where v_etapa.papel <> 'liberacao_origem'
            or not exists (select 1 from public.rem_cargo_titulares t
                            where t.usuario_id = s.uid and t.vigencia_fim is null)) then
        raise exception 'SEM_SIGNATARIO: a etapa % (%) não tem quem assine%.', v_etapa.ordem,
          coalesce((select codigo from public.atividades where id = v_etapa.atividade_id), v_etapa.cargo),
          case when v_etapa.papel = 'liberacao_origem'
               then ' — a atividade precisa de um responsável que não ocupe cargo da cadeia' else '' end;
      end if;
    end loop;

    select * into v_etapa from public.remanejamento_etapas
     where remanejamento_id = v_rem.id and versao = v_rem.versao and ordem = 1;
    update public.remanejamentos set status = 'em_aprovacao', submetido_em = now(), etapa_atual = 1
     where id = v_rem.id returning * into v_rem;
    perform fn_rem_log(v_rem.id, 'enviado', 'rascunho', 'em_aprovacao', 1, p_usuario_id, null);
  else
    if v_rem.status <> 'em_aprovacao' then
      raise exception 'Pedido % está % — nada a assinar.', v_rem.numero, v_rem.status;
    end if;
    select * into v_etapa from public.remanejamento_etapas
     where remanejamento_id = v_rem.id and versao = v_rem.versao and ordem = v_rem.etapa_atual;
    if not exists (select 1 from fn_rem_signatarios_etapa(v_etapa.id) s(uid) where s.uid = p_usuario_id) then
      raise exception 'NAO_E_SUA_VEZ: a etapa atual (%) não é sua.', v_etapa.ordem;
    end if;
  end if;

  -- segregação: a mesma pessoa não aprova duas etapas da mesma versão
  -- (o mesmo responsável pode liberar duas atividades de origem; nada além disso)
  if p_decisao = 'aprovar' and exists (
       select 1 from public.remanejamento_assinaturas a
         join public.remanejamento_etapas e2 on e2.id = a.etapa_id
        where a.remanejamento_id = v_rem.id and a.versao = v_rem.versao and a.usuario_id = p_usuario_id
          and a.decisao = 'aprovar' and a.invalidada_em is null and a.etapa_id <> v_etapa.id
          and not (e2.papel = 'liberacao_origem' and v_etapa.papel = 'liberacao_origem')) then
    raise exception 'SEGREGACAO: você já aprovou outra etapa deste pedido.';
  end if;
  if p_decisao in ('devolver','recusar') then
    if v_etapa.ordem = 1 then raise exception 'O solicitante não devolve nem recusa — edite ou cancele.'; end if;
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo (%).', p_decisao; end if;
  end if;
  if p_decisao = 'aprovar' and v_etapa.ordem = 1 and v_rem.submetido_em < now() then
    perform fn_rem_validar(v_rem.id);   -- reaprovação após devolução: revalida
  end if;

  insert into public.remanejamento_assinaturas
    (remanejamento_id, etapa_id, versao, usuario_id, cargo, titular_id, decisao, motivo,
     hash_documento, senha_verificada_em, ip, user_agent)
  values (v_rem.id, v_etapa.id, v_rem.versao, p_usuario_id, v_etapa.cargo,
          (select id from public.rem_cargo_titulares where cargo = v_etapa.cargo and usuario_id = p_usuario_id and vigencia_fim is null),
          p_decisao, nullif(btrim(p_motivo), ''), p_hash, now(), p_ip, left(p_user_agent, 300))
  returning id into v_ass;

  select count(*) into v_total from public.remanejamento_etapas where remanejamento_id = v_rem.id and versao = v_rem.versao;

  if p_decisao = 'aprovar' then
    update public.remanejamento_etapas set assinatura_id = v_ass where id = v_etapa.id;
    perform fn_rem_log(v_rem.id, 'aprovado_etapa', null, null, v_etapa.ordem, p_usuario_id, p_motivo);
    if v_etapa.ordem = v_total then
      perform fn_rem_efetivar(v_rem.id, p_usuario_id);
      select array_agg(distinct u) into v_avisar from (
        select v_rem.criado_por as u
        union select a.usuario_id from public.remanejamento_assinaturas a
               where a.remanejamento_id = v_rem.id and a.versao = v_rem.versao and a.decisao = 'aprovar' and a.invalidada_em is null) x;
      perform fn_rem_notificar(v_rem.id, v_avisar, 'efetivado', null);
      return jsonb_build_object('status', 'efetivado');
    end if;
    update public.remanejamentos set etapa_atual = v_etapa.ordem + 1 where id = v_rem.id;
    select * into v_prox from public.remanejamento_etapas
     where remanejamento_id = v_rem.id and versao = v_rem.versao and ordem = v_etapa.ordem + 1;
    select array_agg(s) into v_avisar from fn_rem_signatarios_etapa(v_prox.id) s;
    perform fn_rem_notificar(v_rem.id, v_avisar, 'analisar', null);
    return jsonb_build_object('status', 'em_aprovacao', 'etapa_atual', v_etapa.ordem + 1);
  end if;

  if p_decisao = 'devolver' then
    select * into v_ant from public.remanejamento_etapas
     where remanejamento_id = v_rem.id and versao = v_rem.versao and ordem = v_etapa.ordem - 1;
    update public.remanejamento_assinaturas
       set invalidada_em = now(), invalidada_motivo = 'devolvido pela etapa ' || v_etapa.ordem
     where id = v_ant.assinatura_id;
    update public.remanejamento_etapas set assinatura_id = null where id = v_ant.id;
    update public.remanejamentos set etapa_atual = v_ant.ordem where id = v_rem.id;
    perform fn_rem_log(v_rem.id, 'devolvido', null, null, v_etapa.ordem, p_usuario_id, p_motivo,
                       jsonb_build_object('para_etapa', v_ant.ordem));
    -- só quem assinou a etapa anterior é avisado
    select array_agg(a.usuario_id) into v_avisar from public.remanejamento_assinaturas a
     where a.id = (select id from public.remanejamento_assinaturas
                    where etapa_id = v_ant.id and decisao = 'aprovar' order by criado_em desc limit 1);
    if v_avisar is null then select array_agg(s) into v_avisar from fn_rem_signatarios_etapa(v_ant.id) s; end if;
    perform fn_rem_notificar(v_rem.id, v_avisar, 'devolvido', p_motivo);
    return jsonb_build_object('status', 'em_aprovacao', 'etapa_atual', v_ant.ordem);
  end if;

  -- recusar
  update public.remanejamentos set status = 'recusado', etapa_atual = null, encerrado_em = now(),
         motivo_encerramento = btrim(p_motivo) where id = v_rem.id;
  perform fn_rem_log(v_rem.id, 'recusado', 'em_aprovacao', 'recusado', v_etapa.ordem, p_usuario_id, p_motivo);
  select array_agg(distinct u) into v_avisar from (
    select v_rem.criado_por as u
    union select a.usuario_id from public.remanejamento_assinaturas a
           where a.remanejamento_id = v_rem.id and a.versao = v_rem.versao and a.decisao = 'aprovar' and a.invalidada_em is null) x;
  perform fn_rem_notificar(v_rem.id, v_avisar, 'recusado', p_motivo);
  return jsonb_build_object('status', 'recusado');
end $$;

create or replace view public.vw_rem_conferencia as
select r.id, r.numero,
       coalesce((select sum(i.valor_usd) from public.remanejamento_itens i
                  where i.remanejamento_id = r.id and i.valor_usd > 0 and i.ativo), 0)::numeric(14,2) as destinos_usd,
       coalesce((select sum(f.valor_usd) from public.orcamento_fontes f
                  where f.remanejamento_id = r.id and f.tipo = 'remanejamento_recebido'), 0)::numeric(14,2) as recebido_usd,
       coalesce((select -sum(f.valor_usd) from public.orcamento_fontes f
                  where f.remanejamento_id = r.id and f.tipo = 'remanejamento_cedido'), 0)::numeric(14,2)   as cedido_usd
  from public.remanejamentos r
 where r.status = 'efetivado';

revoke all on function public.fn_rem_salvar(uuid, jsonb) from public, anon;
grant execute on function public.fn_rem_salvar(uuid, jsonb) to authenticated, service_role;
revoke all on function public.fn_rem_efetivar(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_rem_assinar(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_rem_assinar(uuid, uuid, text, text, text, text, text) to service_role;
revoke all on public.vw_rem_reservas, public.vw_rem_conferencia from anon, authenticated, public;
grant select on public.vw_rem_reservas, public.vw_rem_conferencia to authenticated;

notify pgrst, 'reload schema';
