-- Contrato rescindido (distrato) com indenização — 2/3
--
-- Problema: o encerramento com saldo não executado devolvia à atividade TODO o não executado. No distrato
-- da UNESCO (ex.: contrato 4500563116, Termo de Distrato e Quitação Final) a UNESCO paga ao contratado uma
-- indenização calculada sobre os dias restantes (5% da diária implícita × dias, teto 30% do contrato). Esse
-- valor sai do projeto e não podia voltar ao saldo.
--
-- Fluxo novo (mesmo pedido/aprovação de 20261013_encerramento_aprovacao):
--   * o pedido ganha a FORMA: concluido | distrato | distrato_sem_indenizacao. Distrato exige o termo de
--     distrato em PDF (só super_admin/coordenação anexam) e, com indenização, o valor (0 < ind ≤ não executado);
--   * liberado à atividade = não executado − indenização (o líquido é o que vai ao razão, R$ ÷ PTAX do dia);
--   * aprovar distrato põe o contrato em `rescindido` (terminal, como encerrado) e cria em execucao_financeira o
--     lançamento A PAGAR da indenização, ligado ao contrato. O US$ dela é o câmbio da UNESCO gravado pelo
--     financeiro no pagamento (fluxo de sempre); o financeiro é avisado no sino;
--   * conferência: vw_contrato_rescisoes (valor = pago + indenização + liberado) e item no auditor.
--
-- Compatibilidade: fn_encp_pedir antiga (4 parâmetros) continua e vira atalho para forma 'concluido'.

-- ── Colunas ───────────────────────────────────────────────────────────────────────────────────────────
alter table public.contrato_encerramento_pedidos
  add column if not exists forma text not null default 'concluido',
  add column if not exists indenizacao_brl numeric(14,2) not null default 0,
  add column if not exists valor_nao_executado_brl numeric(14,2);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contrato_encerramento_pedidos_forma_chk') then
    alter table public.contrato_encerramento_pedidos add constraint contrato_encerramento_pedidos_forma_chk
      check (forma in ('concluido','distrato','distrato_sem_indenizacao'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contrato_encerramento_pedidos_indenizacao_chk') then
    alter table public.contrato_encerramento_pedidos add constraint contrato_encerramento_pedidos_indenizacao_chk
      check (indenizacao_brl >= 0 and (forma = 'distrato' or indenizacao_brl = 0));
  end if;
end $$;

comment on column public.contrato_encerramento_pedidos.forma is
  'concluido = encerramento comum (contrato vira encerrado); distrato / distrato_sem_indenizacao = rescisão com termo de distrato (contrato vira rescindido).';
comment on column public.contrato_encerramento_pedidos.indenizacao_brl is
  'Indenização paga pela UNESCO ao contratado no distrato (Termination Indemnity). Sai do não executado: valor_liberado_brl = valor_nao_executado_brl − indenizacao_brl.';

alter table public.contrato_encerramentos
  add column if not exists forma text not null default 'concluido',
  add column if not exists indenizacao_brl numeric(14,2) not null default 0,
  add column if not exists indenizacao_lancamento_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contrato_encerramentos_forma_chk') then
    alter table public.contrato_encerramentos add constraint contrato_encerramentos_forma_chk
      check (forma in ('concluido','distrato','distrato_sem_indenizacao'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contrato_encerramentos_indenizacao_lancamento_fkey') then
    alter table public.contrato_encerramentos add constraint contrato_encerramentos_indenizacao_lancamento_fkey
      foreign key (indenizacao_lancamento_id) references public.execucao_financeira(id);
  end if;
end $$;

comment on column public.contrato_encerramentos.indenizacao_brl is
  'Indenização do distrato descontada do não executado (não volta à atividade). Paga pelo lançamento indenizacao_lancamento_id.';

-- ── Liberação de saldo: forma e indenização também são imutáveis ──────────────────────────────────────
create or replace function public.fn_trg_encerramento_guarda()
returns trigger language plpgsql as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'RAZAO: liberação de saldo não é apagada — estorne (status revertido).';
  end if;
  if new.valor_liberado_usd is distinct from old.valor_liberado_usd
     or new.valor_liberado_brl is distinct from old.valor_liberado_brl
     or new.atividade_id is distinct from old.atividade_id
     or new.tipo is distinct from old.tipo
     or new.contrato_id is distinct from old.contrato_id
     or new.cotacao is distinct from old.cotacao
     or new.cotacao_data is distinct from old.cotacao_data
     or new.forma is distinct from old.forma
     or new.indenizacao_brl is distinct from old.indenizacao_brl
     or new.indenizacao_lancamento_id is distinct from old.indenizacao_lancamento_id then
    raise exception 'RAZAO: valores de uma liberação de saldo são imutáveis — estorne e lance outra.';
  end if;
  if old.status = 'revertido' and new.status = 'ativo' then
    raise exception 'RAZAO: liberação estornada não volta a valer — lance uma nova.';
  end if;
  return new;
end $$;

-- ── Situação do contrato: encerrado/rescindido só pela aprovação; rescindido é terminal ─────────────────
create or replace function public.fn_trg_contrato_guarda_encerramento()
returns trigger language plpgsql set search_path = public as $$
declare v_efetivar boolean := coalesce(current_setting('dima.encerramento', true), '') = 'efetivar';
begin
  if new.status in ('encerrado','rescindido') and old.status is distinct from new.status
     and not v_efetivar
     and exists (select 1 from public.contratos_produtos cp where cp.contrato_id = new.id
                  and cp.situacao in ('pendente','em_analise','entrega_parcial','devolvido')) then
    raise exception 'ENCERRAMENTO_PEDIDO: o contrato % tem produto em aberto — o encerramento precisa ser pedido e aprovado pelo responsável da atividade.', new.numero;
  end if;
  if new.status = 'rescindido' and old.status is distinct from 'rescindido' and not v_efetivar then
    raise exception 'RESCISAO: o contrato % só fica rescindido pela aprovação do pedido de encerramento com termo de distrato.', new.numero;
  end if;
  if old.status = 'rescindido' and new.status is distinct from 'rescindido' and not v_efetivar then
    raise exception 'RESCISAO: o contrato % foi rescindido (distrato) e não muda mais de situação.', new.numero;
  end if;
  if old.status is distinct from new.status and new.status not in ('encerrado','rescindido')
     and not v_efetivar
     and exists (select 1 from public.contrato_encerramento_pedidos p where p.contrato_id = new.id and p.status = 'aguardando')
     and new.status <> 'aguardando_cobertura' then
    raise exception 'ENCERRAMENTO_PEDIDO: o contrato % tem pedido de encerramento aguardando o responsável — cancele o pedido antes de mudar a situação.', new.numero;
  end if;
  return new;
end $$;

-- ── Pedido: conteúdo imutável inclui forma e indenização ─────────────────────────────────────────────
create or replace function public.fn_trg_encp_guarda()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('dima.encerramento', true), '') not in ('efetivar','pedido') then
    raise exception 'ENCERRAMENTO_PEDIDO: o pedido de encerramento só muda pela aprovação, devolução ou cancelamento.';
  end if;
  if old.status <> 'aguardando' then
    raise exception 'ENCERRAMENTO_PEDIDO: pedido já decidido não se altera — faça um novo pedido.';
  end if;
  if new.contrato_id is distinct from old.contrato_id or new.motivo is distinct from old.motivo
     or new.produtos is distinct from old.produtos or new.valor_liberado_brl is distinct from old.valor_liberado_brl
     or new.solicitado_por is distinct from old.solicitado_por or new.termo_caminho is distinct from old.termo_caminho
     or new.forma is distinct from old.forma or new.indenizacao_brl is distinct from old.indenizacao_brl
     or new.valor_nao_executado_brl is distinct from old.valor_nao_executado_brl then
    raise exception 'ENCERRAMENTO_PEDIDO: o conteúdo do pedido não se altera — devolva e faça outro.';
  end if;
  return new;
end $$;

-- ── Hash do que o responsável aprova: forma e indenização entram ─────────────────────────────────────
create or replace function public.fn_encp_hash(p_pedido uuid)
returns text language sql stable security definer set search_path = public as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'pedido', p.id, 'motivo', p.motivo, 'valor', p.valor_liberado_brl, 'produtos', p.produtos,
    'termo', p.termo_sha256, 'forma', p.forma, 'indenizacao', p.indenizacao_brl,
    'contrato', jsonb_build_object('status', c.status, 'atividade_id', c.atividade_id, 'valor_total_brl', c.valor_total_brl),
    'vivos', coalesce((select jsonb_agg(jsonb_build_object('id', cp.id, 'situacao', cp.situacao,
                                        'valor_brl', cp.valor_brl, 'valor_aprovado', cp.valor_aprovado) order by cp.id)
                         from public.contratos_produtos cp
                        where cp.id in (select (x->>'id')::uuid from jsonb_array_elements(p.produtos) x)), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.contrato_encerramento_pedidos p join public.contratos c on c.id = p.contrato_id
  where p.id = p_pedido
    and (auth.uid() is null or public.fn_encp_ve_contrato(p.contrato_id))
$$;

-- ── Pedido com forma e indenização (assinatura nova, sem valores padrão) ─────────────────────────────
create or replace function public.fn_encp_pedir(p_contrato uuid, p_produtos uuid[], p_motivo text, p_termo jsonb,
                                               p_forma text, p_indenizacao numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  c       contratos%rowtype;
  v_cod   text;
  v_forn  text;
  v_snap  jsonb;
  v_valor numeric;
  v_ind   numeric := round(coalesce(p_indenizacao, 0), 2);
  v_lib   numeric;
  v_n     integer;
  v_aprov uuid[];
  v_id    uuid;
  v_tar   uuid;
  v_fmt   text;
  v_fmti  text;
  v_dist  boolean;
begin
  p_forma := coalesce(nullif(btrim(p_forma), ''), 'concluido');
  if p_forma not in ('concluido','distrato','distrato_sem_indenizacao') then
    raise exception 'ENCERRAMENTO_PEDIDO: forma de encerramento inválida (%).', p_forma;
  end if;
  v_dist := p_forma <> 'concluido';
  if not exists (select 1 from usuarios where id = v_uid and ativo and perfil in ('super_admin','coordenacao','financeiro')) then
    raise exception 'ENCERRAMENTO_PEDIDO: só super_admin, coordenação ou financeiro pedem o encerramento do contrato.';
  end if;
  select * into c from contratos where id = p_contrato for update;
  if c.id is null then raise exception 'ENCERRAMENTO_PEDIDO: contrato não encontrado.'; end if;
  if c.status not in ('vigente','suspenso') then
    raise exception 'ENCERRAMENTO_PEDIDO: o contrato % está % — só se pede o encerramento de contrato vigente ou suspenso.', c.numero, c.status;
  end if;
  if c.atividade_id is null then
    raise exception 'ENCERRAMENTO_PEDIDO: o contrato % não tem atividade — vincule a atividade antes de pedir o encerramento.', c.numero;
  end if;
  select codigo into v_cod from atividades where id = c.atividade_id;
  if not exists (select 1 from atividade_responsaveis ar join usuarios u on u.id = ar.usuario_id and u.ativo
                  where ar.atividade_id = c.atividade_id and ar.ativo and ar.papel = 'responsavel') then
    raise exception 'SEM_RESPONSAVEL: a atividade % não tem responsável ativo. Designe o responsável em Atividades antes de pedir o encerramento.', v_cod;
  end if;
  select array_agg(a) into v_aprov from fn_encp_aprovadores(c.atividade_id, v_uid) a;
  if v_aprov is null then
    raise exception 'SEM_APROVADOR: você é o único responsável/substituto da atividade % e não pode aprovar o próprio pedido. Designe um substituto ou peça a outra pessoa da coordenação.', v_cod;
  end if;
  if exists (select 1 from contrato_encerramento_pedidos where contrato_id = c.id and status = 'aguardando') then
    raise exception 'ENCERRAMENTO_PEDIDO: já existe um pedido de encerramento aguardando o responsável para este contrato.';
  end if;
  if coalesce(length(btrim(p_motivo)), 0) < 20 then
    raise exception 'ENCERRAMENTO_PEDIDO: descreva a justificativa (mínimo 20 caracteres).';
  end if;

  p_produtos := coalesce(p_produtos, '{}');
  select count(*) into v_n from contratos_produtos
   where id = any(p_produtos) and contrato_id = c.id
     and situacao in ('pendente','em_analise','entrega_parcial','devolvido');
  if v_n <> coalesce(array_length(p_produtos, 1), 0) then
    raise exception 'ENCERRAMENTO_PEDIDO: há produto escolhido que não é deste contrato ou que não está em aberto. Recarregue a tela.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', cp.id, 'numero_produto', cp.numero_produto, 'descricao', cp.descricao,
           'valor_brl', coalesce(cp.valor_brl, 0), 'valor_aprovado', coalesce(cp.valor_aprovado, 0),
           'valor_nao_executado', greatest(0, coalesce(cp.valor_brl, 0) - coalesce(cp.valor_aprovado, 0)),
           'situacao_anterior', cp.situacao) order by cp.numero_produto), '[]'::jsonb),
         coalesce(sum(greatest(0, coalesce(cp.valor_brl, 0) - coalesce(cp.valor_aprovado, 0))), 0)
    into v_snap, v_valor
    from contratos_produtos cp where cp.id = any(p_produtos);
  v_valor := round(v_valor, 2);

  -- forma e indenização
  if p_forma = 'distrato' then
    if v_ind <= 0 then
      raise exception 'RESCISAO: informe o valor da indenização do distrato (Total Termination Indemnity Payable). Sem indenização, escolha "Distrato sem indenização".';
    end if;
    if v_ind > v_valor then
      raise exception 'RESCISAO: a indenização (R$ %) é maior que o valor não executado dos produtos marcados (R$ %). Confira o termo e os produtos.', v_ind, v_valor;
    end if;
  elsif v_ind <> 0 then
    raise exception 'RESCISAO: indenização só existe no encerramento por distrato.';
  end if;
  v_lib := v_valor - v_ind;

  if p_termo is not null and nullif(p_termo->>'caminho', '') is not null then
    if not exists (select 1 from usuarios where id = v_uid and ativo and perfil in ('super_admin','coordenacao')) then
      raise exception 'ENCERRAMENTO_PEDIDO: só coordenação ou super_admin anexam o termo de encerramento.';
    end if;
    if (p_termo->>'caminho') not like 'encerramentos/' || c.id || '/%' or (p_termo->>'caminho') like '%..%' then
      raise exception 'ENCERRAMENTO_PEDIDO: caminho do termo fora da pasta do contrato.';
    end if;
    if lower(coalesce(p_termo->>'nome', '')) not like '%.pdf' then
      raise exception 'ENCERRAMENTO_PEDIDO: o termo deve ser PDF.';
    end if;
    if lower(coalesce(p_termo->>'sha256', '')) !~ '^[0-9a-f]{64}$' then
      raise exception 'ENCERRAMENTO_PEDIDO: impressão digital (SHA-256) do termo inválida.';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'contratos-docs' and name = p_termo->>'caminho') then
      raise exception 'ENCERRAMENTO_PEDIDO: termo não encontrado no armazenamento — envie de novo.';
    end if;
  else
    p_termo := null;
  end if;
  if v_dist and p_termo is null then
    raise exception 'RESCISAO: o distrato exige o Termo de Distrato assinado em PDF (só coordenação ou super_admin anexam).';
  end if;

  insert into contrato_encerramento_pedidos (contrato_id, atividade_id, motivo, produtos, valor_liberado_brl,
         termo_caminho, termo_nome, termo_sha256, termo_tamanho, solicitado_por,
         forma, indenizacao_brl, valor_nao_executado_brl)
  values (c.id, c.atividade_id, btrim(p_motivo), v_snap, v_lib,
          p_termo->>'caminho', left(p_termo->>'nome', 200), lower(p_termo->>'sha256'),
          nullif(p_termo->>'tamanho', '')::bigint, v_uid,
          p_forma, v_ind, v_valor)
  returning id into v_id;

  select nome into v_forn from fornecedores where id = c.fornecedor_id;
  v_fmt  := 'R$ ' || replace(replace(replace(to_char(v_lib, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');
  v_fmti := 'R$ ' || replace(replace(replace(to_char(v_ind, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');
  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo, entidade_tipo, entidade_id,
                       atividade_id, criado_por, tipo)
  values ((case when v_dist then 'Aprovar rescisão (distrato) do contrato ' else 'Aprovar encerramento do contrato ' end) || c.numero,
          (case when v_dist then 'Pedido de rescisão por distrato do contrato ' else 'Pedido de encerramento do contrato ' end)
            || c.numero || coalesce(' (' || v_forn || ')', '')
            || ' com ' || jsonb_array_length(v_snap) || ' produto(s) cancelado(s)'
            || case when v_ind > 0 then ', indenização de ' || v_fmti || ' paga ao contratado pela UNESCO' else '' end
            || ' e ' || v_fmt || ' devolvido(s) à atividade ' || v_cod || '. Justificativa: ' || btrim(p_motivo)
            || E'\n\nAprove ou devolva em Contratos › contrato ' || c.numero
            || ' › Detalhes e documentos › Encerramento (pede a senha de login). Aprovam o responsável ou o substituto da atividade.',
          'alta', current_date, current_date + 5, 'contrato_encerramento_pedido', v_id,
          c.atividade_id, v_uid, 'outras')
  returning id into v_tar;
  insert into tarefa_participantes (tarefa_id, usuario_id, papel)
    select v_tar, a, 'responsavel' from unnest(v_aprov) a
    on conflict (tarefa_id, usuario_id) do nothing;
  if c.tdr_id is not null and exists (select 1 from tdrs where id = c.tdr_id and atividade_id = c.atividade_id) then
    insert into tarefa_tdrs (tarefa_id, tdr_id) values (v_tar, c.tdr_id) on conflict do nothing;
  end if;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (v_tar, v_uid, 'criacao', 'Criada pelo sistema no pedido de encerramento do contrato ' || c.numero);
  perform set_config('dima.encerramento', 'pedido', true);
  update contrato_encerramento_pedidos set tarefa_id = v_tar where id = v_id;
  perform set_config('dima.encerramento', '', true);
  perform fn_tarefa_notificar(v_aprov, 'tarefa_atribuida',
    (case when v_dist then 'Aprovar rescisão do contrato ' else 'Aprovar encerramento do contrato ' end) || c.numero,
    v_fmt || ' voltam à atividade ' || v_cod, v_tar, v_uid);

  return jsonb_build_object('id', v_id, 'tarefa_id', v_tar, 'valor_liberado_brl', v_lib,
                            'valor_nao_executado_brl', v_valor, 'indenizacao_brl', v_ind, 'forma', p_forma,
                            'aprovadores', jsonb_array_length(to_jsonb(v_aprov)));
end $$;

-- assinatura antiga (4 parâmetros): atalho para o encerramento comum
create or replace function public.fn_encp_pedir(p_contrato uuid, p_produtos uuid[], p_motivo text, p_termo jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.fn_encp_pedir(p_contrato, p_produtos, p_motivo, p_termo, 'concluido'::text, 0::numeric);
end $$;

revoke execute on function public.fn_encp_pedir(uuid, uuid[], text, jsonb, text, numeric) from public, anon;
revoke execute on function public.fn_encp_pedir(uuid, uuid[], text, jsonb) from public, anon;
grant execute on function public.fn_encp_pedir(uuid, uuid[], text, jsonb, text, numeric) to authenticated;
grant execute on function public.fn_encp_pedir(uuid, uuid[], text, jsonb) to authenticated;

-- ── Lançamento da indenização (usado pela aprovação e pela regularização) ────────────────────────────
-- Lançamento A PAGAR ligado ao contrato; o financeiro efetiva com senha e grava o câmbio da UNESCO.
create or replace function public.fn_rescisao_lancar_indenizacao(p_contrato uuid, p_valor numeric, p_autor uuid, p_obs text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c contratos%rowtype;
  v_id uuid;
  v_fmt text;
  v_fin uuid[];
begin
  select * into c from contratos where id = p_contrato;
  if c.id is null then raise exception 'RESCISAO: contrato não encontrado.'; end if;
  if coalesce(p_valor, 0) <= 0 then return null; end if;
  insert into execucao_financeira (atividade_id, contrato_id, fornecedor_id, descricao, valor_brl, situacao,
                                   elemento_despesa, observacoes, criado_por)
  values (c.atividade_id, c.id, c.fornecedor_id,
          'Indenização por rescisão contratual (Termo de Distrato) · Contrato ' || c.numero,
          round(p_valor, 2), 'a_pagar', c.elemento_despesa, p_obs, p_autor)
  returning id into v_id;

  v_fmt := 'R$ ' || replace(replace(replace(to_char(round(p_valor, 2), 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');
  select array_agg(id) into v_fin from usuarios where ativo and perfil = 'financeiro';
  if v_fin is not null then
    insert into notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
    select u, 'produto_aguarda_pagamento', 'Indenização de distrato a pagar · contrato ' || c.numero,
           v_fmt || ' de indenização ao contratado. Efetive o pagamento no Financeiro com o câmbio da UNESCO.',
           'financeiro.html', 'contrato', c.id
      from unnest(v_fin) u;
  end if;
  return v_id;
end $$;
revoke execute on function public.fn_rescisao_lancar_indenizacao(uuid, numeric, uuid, text) from public, anon, authenticated;

-- ── Decisão: aprovar distrato rescinde, lança a indenização e libera só o líquido ────────────────────
create or replace function public.fn_encp_decidir(p_usuario_id uuid, p_pedido uuid, p_decisao text, p_parecer text,
                                                 p_hash text, p_ip text default null, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p      contrato_encerramento_pedidos%rowtype;
  c      contratos%rowtype;
  v_ptax numeric;
  v_ptax_data date;
  v_usd  numeric := 0;
  v_enc  uuid;
  v_lanc uuid;
  v_avis uuid[];
  v_fmt  text;
  v_fmti text;
  v_resp_termo uuid;
  v_dist boolean;
begin
  if p_decisao not in ('aprovar','devolver') then raise exception 'Decisão inválida: %', p_decisao; end if;
  if not exists (select 1 from usuarios where id = p_usuario_id and ativo) then
    raise exception 'Usuário inexistente ou inativo.';
  end if;
  select * into p from contrato_encerramento_pedidos where id = p_pedido for update;
  if p.id is null then raise exception 'ENCERRAMENTO_PEDIDO: pedido não encontrado.'; end if;
  if p.status <> 'aguardando' then raise exception 'ENCERRAMENTO_PEDIDO: o pedido já está %.', p.status; end if;
  if p_usuario_id = p.solicitado_por then
    raise exception 'SEGREGACAO: quem pediu o encerramento não aprova o próprio pedido.';
  end if;
  if not exists (select 1 from fn_encp_aprovadores(p.atividade_id, p.solicitado_por) a where a = p_usuario_id) then
    raise exception 'NAO_E_SUA_VEZ: só o responsável ou o substituto ativo da atividade decide este pedido.';
  end if;
  if p_hash is distinct from fn_encp_hash(p.id) then
    raise exception 'DOCUMENTO_ALTERADO: o pedido, o contrato ou os produtos mudaram depois que você abriu. Recarregue e confira; se mudou, devolva para um novo pedido.';
  end if;
  select * into c from contratos where id = p.contrato_id for update;
  v_dist := p.forma <> 'concluido';
  v_fmt  := 'R$ ' || replace(replace(replace(to_char(p.valor_liberado_brl, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');
  v_fmti := 'R$ ' || replace(replace(replace(to_char(p.indenizacao_brl, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');

  if p_decisao = 'devolver' then
    if coalesce(length(btrim(p_parecer)), 0) < 10 then
      raise exception 'ENCERRAMENTO_PEDIDO: escreva o parecer para devolver (mínimo 10 caracteres).';
    end if;
    perform set_config('dima.encerramento', 'pedido', true);
    update contrato_encerramento_pedidos set status = 'devolvido', decidido_por = p_usuario_id, decidido_em = now(),
           parecer = btrim(p_parecer), hash_decisao = p_hash, senha_verificada_em = now(),
           ip = p_ip, user_agent = left(p_user_agent, 300)
     where id = p.id;
    perform set_config('dima.encerramento', '', true);
    perform fn_encp_fechar_tarefa(p.id, 'concluida', p_usuario_id, 'Pedido devolvido ao solicitante: ' || btrim(p_parecer));
    perform fn_encp_avisar(array[p.solicitado_por], 'tarefa_devolvida',
      (case when v_dist then 'Rescisão do contrato ' else 'Encerramento do contrato ' end) || c.numero || ' devolvido',
      left(btrim(p_parecer), 200), c.id);
    return jsonb_build_object('status', 'devolvido');
  end if;

  perform set_config('dima.encerramento', 'efetivar', true);
  update contratos set status = (case when v_dist then 'rescindido' else 'encerrado' end)::status_contrato where id = c.id;
  update contratos_produtos set situacao = 'cancelado', atualizado_em = now()
   where id in (select (x->>'id')::uuid from jsonb_array_elements(p.produtos) x
                 where coalesce((x->>'valor_aprovado')::numeric, 0) <= 0);

  if p.indenizacao_brl > 0 then
    v_lanc := fn_rescisao_lancar_indenizacao(c.id, p.indenizacao_brl, p.solicitado_por,
      'Termo de distrato aprovado em ' || to_char(now() at time zone 'America/Rio_Branco', 'DD/MM/YYYY')
      || '. Justificativa do pedido: ' || p.motivo);
  end if;

  if p.valor_liberado_brl > 0 then
    select f.ptax_venda, f.data_cotacao into v_ptax, v_ptax_data from fn_cotacao_usd(null) f;
    v_usd := round(p.valor_liberado_brl / v_ptax, 2);
  end if;
  v_resp_termo := (select id from usuarios where id = p.solicitado_por and ativo and perfil in ('super_admin','coordenacao'));
  perform set_config('dima.encerramento_resp_termo', coalesce(v_resp_termo::text, ''), true);
  if p.termo_caminho is not null then
    perform set_config('dima.encerramento_sem_tarefa', '1', true);
  end if;
  insert into contrato_encerramentos (contrato_id, atividade_id, tipo, valor_liberado_brl, valor_liberado_usd,
         cotacao, cotacao_data, motivo, produtos_afetados, autorizado_por,
         forma, indenizacao_brl, indenizacao_lancamento_id)
  values (c.id, p.atividade_id, 'encerramento_contrato', p.valor_liberado_brl, v_usd,
          v_ptax, v_ptax_data,
          p.motivo, p.produtos, p_usuario_id,
          p.forma, p.indenizacao_brl, v_lanc)
  returning id into v_enc;
  perform set_config('dima.encerramento_sem_tarefa', '', true);
  perform set_config('dima.encerramento_resp_termo', '', true);
  if p.termo_caminho is not null then
    insert into contrato_encerramento_documentos (encerramento_id, contrato_id, caminho, nome, sha256, tamanho, criado_por)
    values (v_enc, c.id, p.termo_caminho, p.termo_nome, p.termo_sha256, p.termo_tamanho, p.solicitado_por);
  end if;

  update contrato_encerramento_pedidos set status = 'aprovado', decidido_por = p_usuario_id, decidido_em = now(),
         parecer = nullif(btrim(p_parecer), ''), hash_decisao = p_hash, senha_verificada_em = now(),
         ip = p_ip, user_agent = left(p_user_agent, 300), encerramento_id = v_enc
   where id = p.id;
  perform set_config('dima.encerramento', '', true);
  perform fn_encp_fechar_tarefa(p.id, 'concluida', p_usuario_id,
    (case when v_dist then 'Rescisão (distrato) aprovada com senha. ' else 'Encerramento aprovado com senha. ' end)
    || case when p.indenizacao_brl > 0 then 'Indenização de ' || v_fmti || ' lançada a pagar no Financeiro. ' else '' end
    || v_fmt || ' devolvido(s) à atividade.'
    || coalesce(' Parecer: ' || nullif(btrim(p_parecer), ''), ''));

  select array_agg(distinct u) into v_avis from (
    select p.solicitado_por as u
    union select a from fn_encp_aprovadores(p.atividade_id, p_usuario_id) a) x;
  perform fn_encp_avisar(v_avis, 'tarefa_concluida',
    'Contrato ' || c.numero || case when v_dist then ' rescindido' else ' encerrado' end,
    'Aprovado pelo responsável. ' || v_fmt || ' voltam à atividade.'
    || case when p.indenizacao_brl > 0 then ' Indenização de ' || v_fmti || ' a pagar.' else '' end, c.id);
  return jsonb_build_object('status', 'aprovado', 'encerramento_id', v_enc, 'valor_liberado_usd', v_usd,
                            'indenizacao_lancamento_id', v_lanc, 'situacao_contrato', case when v_dist then 'rescindido' else 'encerrado' end);
end $$;
revoke execute on function public.fn_encp_decidir(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_encp_decidir(uuid, uuid, text, text, text, text, text) to service_role;

-- ── Conferência: valor do contrato = pago + indenização + liberado ───────────────────────────────────
create or replace view public.vw_contrato_rescisoes with (security_invoker = true) as
select c.id as contrato_id, c.numero, c.atividade_id, a.codigo as atividade_codigo, c.valor_total_brl,
       e.id as encerramento_id, e.forma, e.criado_em as rescindido_em,
       e.indenizacao_brl, e.indenizacao_lancamento_id,
       l.situacao::text as indenizacao_situacao, l.dt_pagamento as indenizacao_dt_pagamento,
       l.valor_usd_unesco as indenizacao_usd_unesco,
       coalesce((select sum(x.valor_brl) from execucao_financeira x
                  where x.contrato_id = c.id and x.situacao = 'pago'
                    and x.id is distinct from e.indenizacao_lancamento_id), 0) as pago_brl,
       coalesce((select sum(x.valor_liberado_brl) from contrato_encerramentos x
                  where x.contrato_id = c.id and x.tipo = 'encerramento_contrato' and x.status = 'ativo'), 0) as liberado_brl,
       round(coalesce(c.valor_total_brl, 0)
         - coalesce((select sum(x.valor_brl) from execucao_financeira x
                      where x.contrato_id = c.id and x.situacao = 'pago'
                        and x.id is distinct from e.indenizacao_lancamento_id), 0)
         - case when l.situacao is distinct from 'cancelado' then coalesce(e.indenizacao_brl, 0) else 0 end
         - coalesce((select sum(x.valor_liberado_brl) from contrato_encerramentos x
                      where x.contrato_id = c.id and x.tipo = 'encerramento_contrato' and x.status = 'ativo'), 0), 2) as diferenca_brl
  from contratos c
  left join atividades a on a.id = c.atividade_id
  left join lateral (select * from contrato_encerramentos e
                      where e.contrato_id = c.id and e.tipo = 'encerramento_contrato' and e.status = 'ativo'
                      order by e.criado_em desc limit 1) e on true
  left join execucao_financeira l on l.id = e.indenizacao_lancamento_id
 where c.status = 'rescindido';

revoke all on public.vw_contrato_rescisoes from public, anon;
grant select on public.vw_contrato_rescisoes to authenticated;
comment on view public.vw_contrato_rescisoes is
  'Contratos rescindidos (distrato): valor do contrato = pago (produtos) + indenização + liberado à atividade. diferenca_brl ≠ 0 = conferir.';

-- ── Auditor: distrato sem lançamento de indenização e conta que não fecha ────────────────────────────
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.fn_auditoria_orcamento'::regproc);
  if position('Orçamento: rescisão do contrato' in d) = 0 then
    d := regexp_replace(d, 'end \$function\$\s*$', $blk$
  return query
  select 'alto'::text,
         ('Orçamento: rescisão do contrato ' || r.numero || ' sem lançamento da indenização')::text,
         ('O distrato prevê indenização de R$ ' || r.indenizacao_brl || ' ao contratado, mas o lançamento no Financeiro '
           || case when r.indenizacao_lancamento_id is null then 'não existe' else 'foi cancelado' end || '.')::text,
         'Lançar (ou reativar) a indenização a pagar ligada ao contrato no Financeiro.'::text,
         'contratos'::text, r.contrato_id, ('Contrato ' || r.numero)::text
    from public.vw_contrato_rescisoes r
   where r.forma = 'distrato' and r.indenizacao_brl > 0
     and (r.indenizacao_lancamento_id is null or r.indenizacao_situacao = 'cancelado');

  return query
  select 'medio'::text,
         ('Orçamento: rescisão do contrato ' || r.numero || ' não fecha')::text,
         ('Valor do contrato R$ ' || r.valor_total_brl || ' ≠ pago R$ ' || r.pago_brl || ' + indenização R$ '
           || r.indenizacao_brl || ' + liberado à atividade R$ ' || r.liberado_brl || ' (diferença R$ ' || r.diferenca_brl || ').')::text,
         'Conferir produtos pagos, o lançamento da indenização e a liberação de saldo do contrato (vw_contrato_rescisoes).'::text,
         'contratos'::text, r.contrato_id, ('Contrato ' || r.numero)::text
    from public.vw_contrato_rescisoes r
   where abs(r.diferenca_brl) > 0.01;
end $function$
$blk$);
    execute d;
  end if;
end $mig$;
