-- ════════════════════════════════════════════════════════════════════════
-- Cancelamento de TDR com nota técnica e cadeia de assinaturas
-- + registro das tentativas de licitação sem êxito (relançar sem cancelar)
--
-- Por quê: cancelar o TDR já devolvia o valor ao saldo livre da atividade
-- (trg_tdr_evento_orcamento grava 'tdr_cancelado'; o débito some; fn_cob_reavaliar
-- roda), mas qualquer coordenação mudava o status direto, sem motivo, sem
-- documento e sem aprovação — e podia desfazer. Agora:
--
--   · TDR só vira 'cancelado' pela efetivação de um PEDIDO DE CANCELAMENTO
--     (chave dima.tdr_cancelamento = 'efetivar'); vale para todas as fases.
--   · TDR cancelado não volta (para retomar, cria-se um TDR novo).
--   · Pedido = motivo + justificativa + NOTA TÉCNICA (PDF no bucket privado
--     tdrs-arquivos, caminho cancelamentos/…, com SHA-256 do arquivo).
--   · Cadeia SEQUENCIAL, por pessoa, sem substituto (mais curta que a do
--     remanejamento):
--       1 solicitação ..... titular coordenacao_solicitante
--       2 responsável ..... responsável (papel 'responsavel') da atividade do TDR
--       3 UNESCO .......... titular unesco_financeiro → efetivação
--     Mesmas regras do remanejamento: aprovar avisa só o próximo; devolver volta
--     UMA etapa; recusar encerra; só o solicitante edita (nova versão invalida as
--     assinaturas); a mesma pessoa não aprova duas etapas; assinatura = senha
--     reconfirmada no servidor (Edge Function assinar-remanejamento, ação
--     'assinar_cancelamento'), e fn_tcan_assinar só tem EXECUTE para service_role.
--   · Enquanto o pedido está em aprovação o TDR fica congelado (status, valor e
--     atividade) e não recebe contrato. O valor continua comprometido até a
--     última assinatura — não pode ser usado duas vezes.
--   · Licitação sem êxito que vai ser RELANÇADA não precisa de cadeia:
--     fn_tdr_licitacao_sem_exito grava a tentativa em tdr_licitacoes e devolve o
--     TDR a 'aprovado'. A tentativa que termina em cancelamento entra na
--     efetivação do pedido.
--
-- Sem remoção de linha em lugar nenhum: pedido encerra por status; tentativas,
-- assinaturas e histórico são imutáveis (sem policy nem grant de escrita).
-- O sino (tipos tdr_cancelamento_*) depende de 20261012_tdr_cancelamento_sql_editor.sql;
-- sem ele só o sino fica mudo, o e-mail sai.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Tentativas de licitação ─────────────────────────────────────────
create table if not exists public.tdr_licitacoes (
  id              uuid primary key default gen_random_uuid(),
  tdr_id          uuid not null references public.tdrs(id),
  rodada          integer not null,
  modalidade      text,
  numero_processo text,
  dt_abertura     date,
  resultado       text not null check (resultado in ('deserta','fracassada','outro')),
  motivo          text not null check (length(btrim(motivo)) >= 10),
  desfecho        text not null check (desfecho in ('relancada','cancelamento')),
  cancelamento_id uuid,
  registrado_por  uuid references public.usuarios(id),
  criado_em       timestamptz not null default now(),
  unique (tdr_id, rodada)
);
comment on table public.tdr_licitacoes is
  'Tentativas de licitação sem êxito de cada TDR (deserta/fracassada/outro) e o desfecho: relançada ou cancelamento. Imutável.';

-- ── 2. Pedido, etapas, assinaturas, histórico, fila de e-mail ──────────
create table if not exists public.tdr_canc_numeracao (ano integer primary key, ultimo integer not null);

create table if not exists public.tdr_cancelamentos (
  id                  uuid primary key default gen_random_uuid(),
  numero              text not null unique,
  tdr_id              uuid not null references public.tdrs(id),
  -- retrato do TDR (atualizado ao salvar e ao enviar; o hash confere o TDR ao vivo)
  atividade_id        uuid references public.atividades(id),
  tdr_numero          text,
  tdr_objeto          text,
  tdr_status_origem   text,
  valor_usd           numeric,
  valor_brl           numeric,
  motivo_tipo         text not null check (motivo_tipo in
                        ('licitacao_deserta','licitacao_fracassada','sem_necessidade','substituido','outro')),
  justificativa       text not null,
  destino_valor       text not null default 'a_definir' check (destino_valor in ('novo_tdr','remanejamento','a_definir')),
  nota_caminho        text,
  nota_nome           text,
  nota_sha256         text,
  nota_tamanho        bigint,
  status              text not null default 'rascunho'
                        check (status in ('rascunho','em_aprovacao','efetivado','recusado','cancelado')),
  etapa_atual         integer,
  versao              integer not null default 1,
  hash_documento      text,
  uuid_cliente        uuid unique,
  criado_por          uuid references public.usuarios(id),
  criado_em           timestamptz not null default now(),
  submetido_em        timestamptz,
  efetivado_em        timestamptz,
  encerrado_em        timestamptz,
  motivo_encerramento text,
  atualizado_em       timestamptz not null default now()
);
comment on table public.tdr_cancelamentos is
  'Pedido de cancelamento de TDR (nota técnica + cadeia coordenação → responsável da atividade → UNESCO). '
  'Só a efetivação põe o TDR em cancelado e libera o valor no saldo da atividade.';
-- um pedido vivo por TDR
create unique index if not exists uq_tdr_cancelamento_vivo on public.tdr_cancelamentos (tdr_id)
  where status in ('rascunho','em_aprovacao');

do $fk$ begin
  if not exists (select 1 from pg_constraint where conname = 'tdr_licitacoes_cancelamento_fk') then
    alter table public.tdr_licitacoes add constraint tdr_licitacoes_cancelamento_fk
      foreign key (cancelamento_id) references public.tdr_cancelamentos(id);
  end if;
end $fk$;

create table if not exists public.tdr_cancelamento_etapas (
  id              uuid primary key default gen_random_uuid(),
  cancelamento_id uuid not null references public.tdr_cancelamentos(id),
  versao          integer not null,
  ordem           integer not null,
  papel           text not null check (papel in ('solicitacao','responsavel_atividade','unesco')),
  cargo           text references public.rem_cargos(codigo),
  atividade_id    uuid references public.atividades(id),
  assinatura_id   uuid,
  unique (cancelamento_id, versao, ordem),
  check ((papel = 'responsavel_atividade') = (atividade_id is not null and cargo is null))
);

create table if not exists public.tdr_cancelamento_assinaturas (
  id                  uuid primary key default gen_random_uuid(),
  cancelamento_id     uuid not null references public.tdr_cancelamentos(id),
  etapa_id            uuid not null references public.tdr_cancelamento_etapas(id),
  versao              integer not null,
  usuario_id          uuid not null references public.usuarios(id),
  cargo               text,
  titular_id          uuid references public.rem_cargo_titulares(id),
  decisao             text not null check (decisao in ('aprovar','devolver','recusar','cancelar')),
  motivo              text,
  hash_documento      text not null,
  senha_verificada_em timestamptz not null,
  ip                  text,
  user_agent          text,
  criado_em           timestamptz not null default now(),
  invalidada_em       timestamptz,
  invalidada_motivo   text
);
do $fk$ begin
  if not exists (select 1 from pg_constraint where conname = 'tdr_cancelamento_etapas_assinatura_fk') then
    alter table public.tdr_cancelamento_etapas add constraint tdr_cancelamento_etapas_assinatura_fk
      foreign key (assinatura_id) references public.tdr_cancelamento_assinaturas(id);
  end if;
end $fk$;

create table if not exists public.tdr_cancelamento_historico (
  id              uuid primary key default gen_random_uuid(),
  cancelamento_id uuid not null references public.tdr_cancelamentos(id),
  evento          text not null,
  status_de       text,
  status_para     text,
  etapa_ordem     integer,
  versao          integer,
  usuario_id      uuid references public.usuarios(id),
  motivo          text,
  detalhes        jsonb,
  criado_em       timestamptz not null default now()
);
create index if not exists idx_tcan_historico on public.tdr_cancelamento_historico (cancelamento_id, criado_em);

create table if not exists public.tdr_cancelamento_notificacoes (
  id              uuid primary key default gen_random_uuid(),
  cancelamento_id uuid not null references public.tdr_cancelamentos(id),
  usuario_id      uuid not null references public.usuarios(id),
  evento          text not null check (evento in ('analisar','devolvido','recusado','efetivado','cancelado')),
  motivo          text,
  criado_em       timestamptz not null default now(),
  enviado_em      timestamptz,
  tentativas      integer not null default 0,
  ultimo_erro     text
);
create index if not exists idx_tcan_notif_pendentes on public.tdr_cancelamento_notificacoes (criado_em) where enviado_em is null;

-- ── 3. Guardas (imutabilidade; pedido encerrado não muda) ──────────────
create or replace function public.fn_trg_tcan_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'CAN: registro imutável (%).', tg_table_name;
end $$;
create or replace trigger trg_tdr_licitacoes_imutavel before update on public.tdr_licitacoes
  for each row execute function public.fn_trg_tcan_imutavel();
create or replace trigger trg_tcan_historico_imutavel before update on public.tdr_cancelamento_historico
  for each row execute function public.fn_trg_tcan_imutavel();

create or replace function public.fn_trg_tcan_assinaturas_guarda()
returns trigger language plpgsql as $$
begin
  if old.invalidada_em is not null or new.invalidada_em is null
     or (to_jsonb(new) - 'invalidada_em' - 'invalidada_motivo') <> (to_jsonb(old) - 'invalidada_em' - 'invalidada_motivo') then
    raise exception 'CAN: assinatura é imutável (só pode ser invalidada, uma vez).';
  end if;
  return new;
end $$;
create or replace trigger trg_tcan_assinaturas_guarda before update on public.tdr_cancelamento_assinaturas
  for each row execute function public.fn_trg_tcan_assinaturas_guarda();

create or replace function public.fn_trg_tcan_etapas_guarda()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - 'assinatura_id') <> (to_jsonb(old) - 'assinatura_id') then
    raise exception 'CAN: etapa só muda a assinatura vigente.';
  end if;
  return new;
end $$;
create or replace trigger trg_tcan_etapas_guarda before update on public.tdr_cancelamento_etapas
  for each row execute function public.fn_trg_tcan_etapas_guarda();

create or replace function public.fn_trg_tcan_pedido_guarda()
returns trigger language plpgsql as $$
begin
  if old.status in ('efetivado','recusado','cancelado')
     and (to_jsonb(new) - 'atualizado_em') <> (to_jsonb(old) - 'atualizado_em') then
    raise exception 'CAN: pedido % encerrado (%) não muda.', old.numero, old.status;
  end if;
  if new.tdr_id is distinct from old.tdr_id then
    raise exception 'CAN: o pedido não troca de TDR — cancele e abra outro.';
  end if;
  new.atualizado_em := now();
  return new;
end $$;
create or replace trigger trg_tcan_pedido_guarda before update on public.tdr_cancelamentos
  for each row execute function public.fn_trg_tcan_pedido_guarda();

-- ── 4. Travas no TDR e no contrato ─────────────────────────────────────
-- TDR só é cancelado pela efetivação do pedido; cancelado não volta; em
-- aprovação o TDR não muda de fase, valor nem atividade.
create or replace function public.fn_trg_tdr_guarda_cancelamento()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_chave boolean := coalesce(current_setting('dima.tdr_cancelamento', true), '') = 'efetivar';
  v_ped   text;
begin
  if old.status = 'cancelado' and new.status is distinct from old.status then
    raise exception 'TDR_CANCELADO: o TDR % foi cancelado e não volta. Para retomar, crie um TDR novo.', old.numero;
  end if;
  if new.status = 'cancelado' and old.status <> 'cancelado' and not v_chave then
    raise exception 'TDR_CANCELAMENTO: o TDR % só é cancelado por pedido de cancelamento com nota técnica e '
                    'aprovação (botão "Pedir cancelamento" no TDR).', old.numero;
  end if;
  if not v_chave
     and (new.status is distinct from old.status or new.valor_usd is distinct from old.valor_usd
          or new.valor_brl is distinct from old.valor_brl or new.atividade_id is distinct from old.atividade_id) then
    select numero into v_ped from public.tdr_cancelamentos where tdr_id = old.id and status = 'em_aprovacao';
    if v_ped is not null then
      raise exception 'TDR_EM_CANCELAMENTO: o TDR % está no pedido de cancelamento % em aprovação — fase, valor e '
                      'atividade ficam congelados até a decisão.', old.numero, v_ped;
    end if;
  end if;
  return new;
end $$;
create or replace trigger trg_tdr_guarda_cancelamento before update on public.tdrs
  for each row execute function public.fn_trg_tdr_guarda_cancelamento();

create or replace function public.fn_trg_contrato_tdr_cancelamento()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_tdr record; v_ped text;
begin
  if new.tdr_id is null or coalesce(new.status::text, '') = 'cancelado' then return new; end if;
  if tg_op = 'UPDATE' and new.tdr_id is not distinct from old.tdr_id then return new; end if;
  select numero, status into v_tdr from public.tdrs where id = new.tdr_id;
  if v_tdr.status = 'cancelado' then
    raise exception 'TDR_CANCELADO: o TDR % está cancelado e não recebe contrato.', v_tdr.numero;
  end if;
  select numero into v_ped from public.tdr_cancelamentos where tdr_id = new.tdr_id and status = 'em_aprovacao';
  if v_ped is not null then
    raise exception 'TDR_EM_CANCELAMENTO: o TDR % está no pedido de cancelamento % em aprovação e não recebe contrato.',
      v_tdr.numero, v_ped;
  end if;
  return new;
end $$;
create or replace trigger trg_contrato_tdr_cancelamento before insert or update on public.contratos
  for each row execute function public.fn_trg_contrato_tdr_cancelamento();

-- ── 5. Hash, utilitários ───────────────────────────────────────────────
-- Conteúdo assinado: o pedido + o TDR AO VIVO (se o TDR mudar, o hash muda).
create or replace function public.fn_tcan_hash(p_id uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'numero', c.numero, 'versao', c.versao, 'tdr_id', c.tdr_id,
    'tdr', jsonb_build_object('numero', t.numero, 'status', t.status, 'atividade_id', t.atividade_id,
                              'valor_usd', t.valor_usd, 'valor_brl', t.valor_brl),
    'motivo_tipo', c.motivo_tipo, 'justificativa', c.justificativa, 'destino_valor', c.destino_valor,
    'nota', jsonb_build_object('caminho', c.nota_caminho, 'nome', c.nota_nome, 'sha256', c.nota_sha256)
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.tdr_cancelamentos c join public.tdrs t on t.id = c.tdr_id
  where c.id = p_id
$$;

create or replace function public.fn_tcan_log(p_can uuid, p_evento text, p_de text, p_para text,
                                              p_etapa integer, p_usuario uuid, p_motivo text, p_detalhes jsonb default null)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.tdr_cancelamento_historico (cancelamento_id, evento, status_de, status_para, etapa_ordem, versao, usuario_id, motivo, detalhes)
  select p_can, p_evento, p_de, p_para, p_etapa, c.versao, p_usuario, nullif(btrim(p_motivo), ''), p_detalhes
    from public.tdr_cancelamentos c where c.id = p_can
$$;

-- Quem pode assinar uma etapa (pessoas, sem substituto). Na etapa do responsável não entra quem é
-- titular da coordenação solicitante ou da UNESCO: assinaria duas etapas, e a segregação travaria a
-- cadeia na etapa seguinte sem ninguém mais para assinar.
create or replace function public.fn_tcan_signatarios_etapa(p_etapa_id uuid)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct u.id
    from public.tdr_cancelamento_etapas e
    join public.usuarios u on u.ativo
   where e.id = p_etapa_id
     and (
       (e.papel = 'responsavel_atividade' and exists (
          select 1 from public.atividade_responsaveis r
           where r.atividade_id = e.atividade_id and r.usuario_id = u.id and r.ativo and r.papel = 'responsavel')
        and not exists (
          select 1 from public.rem_cargo_titulares x
           where x.usuario_id = u.id and x.vigencia_fim is null
             and x.cargo in ('coordenacao_solicitante','unesco_financeiro')))
       or (e.papel <> 'responsavel_atividade' and u.id = public.fn_rem_titular(e.cargo))
     )
$$;

create or replace function public.fn_tcan_notificar(p_can uuid, p_usuarios uuid[], p_evento text, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_numero text; v_tdr text; v_titulo text; u uuid;
begin
  select numero, tdr_numero into v_numero, v_tdr from public.tdr_cancelamentos where id = p_can;
  v_titulo := case p_evento
    when 'analisar'  then 'Cancelamento do TDR ' || v_tdr || ' (' || v_numero || ') aguarda sua análise'
    when 'devolvido' then 'Cancelamento do TDR ' || v_tdr || ' (' || v_numero || ') foi devolvido para você'
    when 'recusado'  then 'Cancelamento do TDR ' || v_tdr || ' (' || v_numero || ') foi recusado'
    when 'efetivado' then 'TDR ' || v_tdr || ' cancelado (' || v_numero || '): valor liberado'
    else 'Pedido ' || v_numero || ' (cancelamento do TDR ' || v_tdr || ') foi cancelado' end;
  foreach u in array coalesce(p_usuarios, '{}') loop
    if u is null then continue; end if;
    insert into public.tdr_cancelamento_notificacoes (cancelamento_id, usuario_id, evento, motivo)
    values (p_can, u, p_evento, nullif(btrim(p_motivo), ''));
    -- sino: sem o tipo liberado no check de notificacoes, segue só o e-mail
    begin
      insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
      values (u, 'tdr_cancelamento_' || p_evento, v_titulo, nullif(btrim(p_motivo), ''),
              'remanejamentos.html?can=' || p_can, 'tdr_cancelamento', p_can);
    exception when others then null;
    end;
  end loop;
end $$;

-- Retrato do TDR no pedido (o que a fila e o e-mail mostram, mesmo a quem não vê o TDR)
create or replace function public.fn_tcan_retrato(p_can uuid)
returns void language sql security definer set search_path to 'public' as $$
  update public.tdr_cancelamentos c
     set atividade_id = t.atividade_id, tdr_numero = t.numero, tdr_objeto = left(t.objeto_pt, 600),
         tdr_status_origem = t.status::text, valor_usd = t.valor_usd, valor_brl = t.valor_brl
    from public.tdrs t
   where t.id = c.tdr_id and c.id = p_can
$$;

-- Validação completa (enviar, reaprovar após devolução e efetivar)
create or replace function public.fn_tcan_validar(p_can uuid)
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare c public.tdr_cancelamentos; t record;
begin
  select * into c from public.tdr_cancelamentos where id = p_can;
  if length(btrim(coalesce(c.justificativa, ''))) < 30 or c.justificativa = '(rascunho)' then
    raise exception 'CAN_INVALIDO: escreva a justificativa do cancelamento (mínimo 30 caracteres).';
  end if;
  if c.nota_caminho is null or c.nota_sha256 is null then
    raise exception 'CAN_INVALIDO: anexe a nota técnica que justifica o cancelamento.';
  end if;
  if c.nota_caminho not like 'cancelamentos/%' or not exists (
       select 1 from storage.objects o where o.bucket_id = 'tdrs-arquivos' and o.name = c.nota_caminho) then
    raise exception 'CAN_INVALIDO: a nota técnica não foi encontrada no armazenamento — anexe de novo.';
  end if;
  select numero, status::text as status into t from public.tdrs where id = c.tdr_id;
  if t.status = 'cancelado' then raise exception 'CAN_INVALIDO: o TDR % já está cancelado.', t.numero; end if;
  if t.status = 'contratado' or exists (
       select 1 from public.contratos k where k.tdr_id = c.tdr_id and k.status::text <> 'cancelado') then
    raise exception 'TDR_COM_CONTRATO: o TDR % tem contrato — cancele ou encerre o contrato antes '
                    '(o encerramento libera o não executado).', t.numero;
  end if;
end $$;

-- ── 6. Rascunho (sem senha) ────────────────────────────────────────────
-- p_dados: { tdr_id (só ao criar), uuid_cliente, motivo_tipo, justificativa, destino_valor,
--            nota_caminho, nota_nome, nota_sha256, nota_tamanho }
create or replace function public.fn_tcan_salvar(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid  uuid := auth.uid();
  v_can  public.tdr_cancelamentos;
  v_ano  integer := extract(year from fn_hoje_acre())::integer;
  v_seq  integer;
  v_tdr  record;
  v_vivo text;
begin
  if coalesce(fn_perfil_atual()::text, '') not in ('coordenacao','super_admin') then
    raise exception 'Sem permissão: só a coordenação pede o cancelamento de TDR.';
  end if;

  if p_id is null then
    if p_dados ? 'uuid_cliente' then
      select * into v_can from public.tdr_cancelamentos where uuid_cliente = (p_dados->>'uuid_cliente')::uuid;
      if found then return v_can.id; end if;
    end if;
    select id, numero, status::text as status into v_tdr from public.tdrs where id = (p_dados->>'tdr_id')::uuid;
    if not found then raise exception 'TDR não encontrado.'; end if;
    if v_tdr.status = 'cancelado' then raise exception 'TDR_CANCELADO: o TDR % já está cancelado.', v_tdr.numero; end if;
    if v_tdr.status = 'contratado' or exists (
         select 1 from public.contratos k where k.tdr_id = v_tdr.id and k.status::text <> 'cancelado') then
      raise exception 'TDR_COM_CONTRATO: o TDR % tem contrato — cancele ou encerre o contrato antes.', v_tdr.numero;
    end if;
    select numero into v_vivo from public.tdr_cancelamentos where tdr_id = v_tdr.id and status in ('rascunho','em_aprovacao');
    if v_vivo is not null then
      raise exception 'CAN: o TDR % já tem o pedido de cancelamento % em andamento.', v_tdr.numero, v_vivo;
    end if;
    insert into public.tdr_canc_numeracao (ano, ultimo) values (v_ano, 1)
      on conflict (ano) do update set ultimo = public.tdr_canc_numeracao.ultimo + 1
      returning ultimo into v_seq;
    insert into public.tdr_cancelamentos (numero, tdr_id, motivo_tipo, justificativa, uuid_cliente, criado_por)
    values ('CAN-' || v_ano || '-' || lpad(v_seq::text, 3, '0'), v_tdr.id,
            coalesce(nullif(p_dados->>'motivo_tipo', ''), 'outro'),
            coalesce(nullif(btrim(p_dados->>'justificativa'), ''), '(rascunho)'),
            (p_dados->>'uuid_cliente')::uuid, v_uid)
    returning * into v_can;
    perform fn_tcan_log(v_can.id, 'criado', null, 'rascunho', null, v_uid, null);
  else
    select * into v_can from public.tdr_cancelamentos where id = p_id for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if v_can.criado_por is distinct from v_uid and coalesce(fn_perfil_atual()::text, '') <> 'super_admin' then
      raise exception 'Só quem criou o pedido o edita.';
    end if;
    if v_can.status = 'em_aprovacao' and v_can.etapa_atual = 1 then
      -- devolvido ao solicitante: editar abre nova versão; a cadeia recomeça
      update public.tdr_cancelamento_assinaturas
         set invalidada_em = now(), invalidada_motivo = 'pedido editado pelo solicitante (nova versão)'
       where cancelamento_id = v_can.id and versao = v_can.versao and invalidada_em is null;
      update public.tdr_cancelamentos set status = 'rascunho', etapa_atual = null, versao = versao + 1
       where id = v_can.id returning * into v_can;
      perform fn_tcan_log(v_can.id, 'editado_apos_devolucao', 'em_aprovacao', 'rascunho', 1, v_uid, null);
    elsif v_can.status <> 'rascunho' then
      raise exception 'Pedido % em % não pode ser editado.', v_can.numero, v_can.status;
    end if;
  end if;

  update public.tdr_cancelamentos set
    motivo_tipo   = coalesce(nullif(p_dados->>'motivo_tipo', ''), motivo_tipo),
    justificativa = coalesce(nullif(btrim(p_dados->>'justificativa'), ''), justificativa),
    destino_valor = coalesce(nullif(p_dados->>'destino_valor', ''), destino_valor),
    nota_caminho  = case when p_dados ? 'nota_caminho' then nullif(p_dados->>'nota_caminho', '') else nota_caminho end,
    nota_nome     = case when p_dados ? 'nota_caminho' then nullif(p_dados->>'nota_nome', '') else nota_nome end,
    nota_sha256   = case when p_dados ? 'nota_caminho' then nullif(lower(p_dados->>'nota_sha256'), '') else nota_sha256 end,
    nota_tamanho  = case when p_dados ? 'nota_caminho' then nullif(p_dados->>'nota_tamanho', '')::bigint else nota_tamanho end
  where id = v_can.id;
  perform fn_tcan_retrato(v_can.id);
  update public.tdr_cancelamentos set hash_documento = fn_tcan_hash(id) where id = v_can.id;
  perform fn_tcan_log(v_can.id, 'rascunho_salvo', null, null, null, v_uid, null);
  return v_can.id;
end $$;

-- ── 7. Efetivação (interna): TDR → cancelado, valor livre ──────────────
create or replace function public.fn_tcan_efetivar(p_can uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  c public.tdr_cancelamentos;
  t public.tdrs;
  v_rodada integer;
begin
  select * into c from public.tdr_cancelamentos where id = p_can;
  perform 1 from public.atividades where id = (select atividade_id from public.tdrs where id = c.tdr_id) for update;
  select * into t from public.tdrs where id = c.tdr_id for update;
  perform fn_tcan_validar(p_can);   -- revalida sob a trava (contrato, nota, fase)

  -- a tentativa de licitação que acabou em cancelamento entra no histórico do TDR
  if t.status = 'em_licitacao' then
    select coalesce(max(rodada), 0) + 1 into v_rodada from public.tdr_licitacoes where tdr_id = t.id;
    insert into public.tdr_licitacoes (tdr_id, rodada, modalidade, numero_processo, dt_abertura, resultado, motivo,
                                       desfecho, cancelamento_id, registrado_por)
    values (t.id, v_rodada, t.modalidade_licitacao, t.numero_processo, t.dt_licitacao,
            case c.motivo_tipo when 'licitacao_deserta' then 'deserta' when 'licitacao_fracassada' then 'fracassada' else 'outro' end,
            'Cancelamento ' || c.numero || ': ' || c.justificativa, 'cancelamento', c.id, p_usuario);
  end if;

  perform set_config('dima.tdr_cancelamento', 'efetivar', true);
  update public.tdrs set status = 'cancelado', atualizado_em = now() where id = t.id;
  perform set_config('dima.tdr_cancelamento', '', true);

  insert into public.tdr_acoes (tdr_id, usuario_id, acao, status_anterior, status_novo, comentario)
  values (t.id, p_usuario, 'cancelado', t.status::text, 'cancelado',
          'Pedido ' || c.numero || ' efetivado (nota técnica: ' || coalesce(c.nota_nome, '—') || '). '
          || c.justificativa);

  update public.tdr_cancelamentos
     set status = 'efetivado', efetivado_em = now(), etapa_atual = null
   where id = p_can;
  perform fn_tcan_log(p_can, 'efetivado', 'em_aprovacao', 'efetivado', null, p_usuario, null,
                      jsonb_build_object('tdr_status_anterior', t.status, 'valor_usd_liberado', t.valor_usd,
                                         'valor_brl_liberado', t.valor_brl, 'atividade_id', t.atividade_id));
end $$;

-- ── 8. Assinatura (SÓ service_role, via Edge Function com senha) ───────
create or replace function public.fn_tcan_assinar(
  p_usuario_id uuid, p_cancelamento_id uuid, p_decisao text, p_motivo text,
  p_hash text, p_ip text default null, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c        public.tdr_cancelamentos;
  v_etapa  public.tdr_cancelamento_etapas;
  v_ant    public.tdr_cancelamento_etapas;
  v_prox   public.tdr_cancelamento_etapas;
  v_total  integer;
  v_ass    uuid;
  v_titular uuid;
  v_avisar uuid[];
begin
  if p_decisao not in ('aprovar','devolver','recusar','cancelar') then
    raise exception 'Decisão inválida: %', p_decisao;
  end if;
  if not exists (select 1 from public.usuarios where id = p_usuario_id and ativo) then
    raise exception 'Usuário inexistente ou inativo.';
  end if;

  select * into c from public.tdr_cancelamentos where id = p_cancelamento_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if p_hash is distinct from fn_tcan_hash(c.id) then
    raise exception 'DOCUMENTO_ALTERADO: o pedido ou o TDR mudou depois que você o abriu. Recarregue e confira antes de assinar.';
  end if;

  -- ── cancelar o pedido (solicitante, antes de sair da mão dele)
  if p_decisao = 'cancelar' then
    if not (c.status = 'rascunho' or (c.status = 'em_aprovacao' and c.etapa_atual = 1)) then
      raise exception 'Só dá para cancelar o pedido em rascunho ou quando ele está devolvido ao solicitante.';
    end if;
    if p_usuario_id is distinct from c.criado_por and p_usuario_id is distinct from fn_rem_titular('coordenacao_solicitante') then
      raise exception 'Só o solicitante cancela o pedido.';
    end if;
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;
    update public.tdr_cancelamento_assinaturas set invalidada_em = now(), invalidada_motivo = 'pedido cancelado'
     where cancelamento_id = c.id and versao = c.versao and invalidada_em is null;
    update public.tdr_cancelamentos set status = 'cancelado', etapa_atual = null, encerrado_em = now(),
           motivo_encerramento = btrim(p_motivo) where id = c.id;
    perform fn_tcan_log(c.id, 'cancelado', c.status, 'cancelado', c.etapa_atual, p_usuario_id, p_motivo);
    return jsonb_build_object('status', 'cancelado');
  end if;

  -- ── envio (rascunho → cadeia)
  if c.status = 'rascunho' then
    if p_decisao <> 'aprovar' then raise exception 'Pedido em rascunho: só é possível enviar ou cancelar.'; end if;
    v_titular := fn_rem_titular('coordenacao_solicitante');
    if v_titular is null then raise exception 'SEM_SIGNATARIO: o cargo de coordenação solicitante está sem titular.'; end if;
    if p_usuario_id is distinct from v_titular then
      raise exception 'Só o titular da coordenação solicitante envia o pedido.';
    end if;
    perform fn_tcan_validar(c.id);
    perform fn_tcan_retrato(c.id);
    select * into c from public.tdr_cancelamentos where id = c.id;

    insert into public.tdr_cancelamento_etapas (cancelamento_id, versao, ordem, papel, cargo, atividade_id) values
      (c.id, c.versao, 1, 'solicitacao',           'coordenacao_solicitante', null),
      (c.id, c.versao, 2, 'responsavel_atividade', null,                      c.atividade_id),
      (c.id, c.versao, 3, 'unesco',                'unesco_financeiro',       null);

    -- toda etapa precisa de alguém que possa assinar (a do responsável já exclui titulares da cadeia)
    for v_etapa in select * from public.tdr_cancelamento_etapas
                    where cancelamento_id = c.id and versao = c.versao order by ordem loop
      if not exists (select 1 from fn_tcan_signatarios_etapa(v_etapa.id)) then
        raise exception 'SEM_SIGNATARIO: a etapa % (%) não tem quem assine%.', v_etapa.ordem,
          coalesce((select codigo from public.atividades where id = v_etapa.atividade_id), v_etapa.cargo),
          case when v_etapa.papel = 'responsavel_atividade'
               then ' — a atividade precisa de um responsável que não seja titular da coordenação nem da UNESCO' else '' end;
      end if;
    end loop;

    select * into v_etapa from public.tdr_cancelamento_etapas
     where cancelamento_id = c.id and versao = c.versao and ordem = 1;
    update public.tdr_cancelamentos set status = 'em_aprovacao', submetido_em = now(), etapa_atual = 1
     where id = c.id returning * into c;
    perform fn_tcan_log(c.id, 'enviado', 'rascunho', 'em_aprovacao', 1, p_usuario_id, null);
  else
    if c.status <> 'em_aprovacao' then
      raise exception 'Pedido % está % — nada a assinar.', c.numero, c.status;
    end if;
    select * into v_etapa from public.tdr_cancelamento_etapas
     where cancelamento_id = c.id and versao = c.versao and ordem = c.etapa_atual;
    if not exists (select 1 from fn_tcan_signatarios_etapa(v_etapa.id) s(uid) where s.uid = p_usuario_id) then
      raise exception 'NAO_E_SUA_VEZ: a etapa atual (%) não é sua.', v_etapa.ordem;
    end if;
  end if;

  -- segregação: a mesma pessoa não aprova duas etapas da mesma versão
  if p_decisao = 'aprovar' and exists (
       select 1 from public.tdr_cancelamento_assinaturas a
        where a.cancelamento_id = c.id and a.versao = c.versao and a.usuario_id = p_usuario_id
          and a.decisao = 'aprovar' and a.invalidada_em is null and a.etapa_id <> v_etapa.id) then
    raise exception 'SEGREGACAO: você já aprovou outra etapa deste pedido.';
  end if;
  if p_decisao in ('devolver','recusar') then
    if v_etapa.ordem = 1 then raise exception 'O solicitante não devolve nem recusa — edite ou cancele o pedido.'; end if;
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo (%).', p_decisao; end if;
  end if;
  if p_decisao = 'aprovar' and v_etapa.ordem = 1 and c.submetido_em < now() then
    perform fn_tcan_validar(c.id);   -- reaprovação após devolução: revalida
  end if;

  insert into public.tdr_cancelamento_assinaturas
    (cancelamento_id, etapa_id, versao, usuario_id, cargo, titular_id, decisao, motivo,
     hash_documento, senha_verificada_em, ip, user_agent)
  values (c.id, v_etapa.id, c.versao, p_usuario_id, v_etapa.cargo,
          (select id from public.rem_cargo_titulares where cargo = v_etapa.cargo and usuario_id = p_usuario_id and vigencia_fim is null),
          p_decisao, nullif(btrim(p_motivo), ''), p_hash, now(), p_ip, left(p_user_agent, 300))
  returning id into v_ass;

  select count(*) into v_total from public.tdr_cancelamento_etapas where cancelamento_id = c.id and versao = c.versao;

  if p_decisao = 'aprovar' then
    update public.tdr_cancelamento_etapas set assinatura_id = v_ass where id = v_etapa.id;
    perform fn_tcan_log(c.id, 'aprovado_etapa', null, null, v_etapa.ordem, p_usuario_id, p_motivo);
    if v_etapa.ordem = v_total then
      perform fn_tcan_efetivar(c.id, p_usuario_id);
      select array_agg(distinct u) into v_avisar from (
        select c.criado_por as u
        union select a.usuario_id from public.tdr_cancelamento_assinaturas a
               where a.cancelamento_id = c.id and a.versao = c.versao and a.decisao = 'aprovar' and a.invalidada_em is null
        union select r.usuario_id from public.atividade_responsaveis r
               where r.atividade_id = c.atividade_id and r.ativo) x;
      perform fn_tcan_notificar(c.id, v_avisar, 'efetivado', null);
      return jsonb_build_object('status', 'efetivado');
    end if;
    update public.tdr_cancelamentos set etapa_atual = v_etapa.ordem + 1 where id = c.id;
    select * into v_prox from public.tdr_cancelamento_etapas
     where cancelamento_id = c.id and versao = c.versao and ordem = v_etapa.ordem + 1;
    select array_agg(s) into v_avisar from fn_tcan_signatarios_etapa(v_prox.id) s;
    perform fn_tcan_notificar(c.id, v_avisar, 'analisar', null);
    return jsonb_build_object('status', 'em_aprovacao', 'etapa_atual', v_etapa.ordem + 1);
  end if;

  if p_decisao = 'devolver' then
    select * into v_ant from public.tdr_cancelamento_etapas
     where cancelamento_id = c.id and versao = c.versao and ordem = v_etapa.ordem - 1;
    update public.tdr_cancelamento_assinaturas
       set invalidada_em = now(), invalidada_motivo = 'devolvido pela etapa ' || v_etapa.ordem
     where id = v_ant.assinatura_id;
    update public.tdr_cancelamento_etapas set assinatura_id = null where id = v_ant.id;
    update public.tdr_cancelamentos set etapa_atual = v_ant.ordem where id = c.id;
    perform fn_tcan_log(c.id, 'devolvido', null, null, v_etapa.ordem, p_usuario_id, p_motivo,
                        jsonb_build_object('para_etapa', v_ant.ordem));
    select array_agg(a.usuario_id) into v_avisar from public.tdr_cancelamento_assinaturas a
     where a.id = (select id from public.tdr_cancelamento_assinaturas
                    where etapa_id = v_ant.id and decisao = 'aprovar' order by criado_em desc limit 1);
    if v_avisar is null then select array_agg(s) into v_avisar from fn_tcan_signatarios_etapa(v_ant.id) s; end if;
    perform fn_tcan_notificar(c.id, v_avisar, 'devolvido', p_motivo);
    return jsonb_build_object('status', 'em_aprovacao', 'etapa_atual', v_ant.ordem);
  end if;

  -- recusar: o TDR segue como estava
  update public.tdr_cancelamentos set status = 'recusado', etapa_atual = null, encerrado_em = now(),
         motivo_encerramento = btrim(p_motivo) where id = c.id;
  perform fn_tcan_log(c.id, 'recusado', 'em_aprovacao', 'recusado', v_etapa.ordem, p_usuario_id, p_motivo);
  select array_agg(distinct u) into v_avisar from (
    select c.criado_por as u
    union select a.usuario_id from public.tdr_cancelamento_assinaturas a
           where a.cancelamento_id = c.id and a.versao = c.versao and a.decisao = 'aprovar' and a.invalidada_em is null) x;
  perform fn_tcan_notificar(c.id, v_avisar, 'recusado', p_motivo);
  return jsonb_build_object('status', 'recusado');
end $$;

-- ── 9. Licitação sem êxito que será relançada (sem cadeia) ─────────────
create or replace function public.fn_tdr_licitacao_sem_exito(p_tdr_id uuid, p_resultado text, p_motivo text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  t public.tdrs;
  v_rodada integer;
  v_id uuid;
begin
  if coalesce(fn_perfil_atual()::text, '') not in ('coordenacao','super_admin') then
    raise exception 'Sem permissão: só a coordenação registra o resultado da licitação.';
  end if;
  if p_resultado not in ('deserta','fracassada','outro') then
    raise exception 'Resultado inválido: %', p_resultado;
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Descreva o que aconteceu na licitação (mínimo 10 caracteres).';
  end if;
  select * into t from public.tdrs where id = p_tdr_id for update;
  if not found then raise exception 'TDR não encontrado.'; end if;
  if t.status <> 'em_licitacao' then
    raise exception 'O TDR % não está em licitação (fase %).', t.numero, t.status;
  end if;

  select coalesce(max(rodada), 0) + 1 into v_rodada from public.tdr_licitacoes where tdr_id = t.id;
  insert into public.tdr_licitacoes (tdr_id, rodada, modalidade, numero_processo, dt_abertura, resultado, motivo,
                                     desfecho, registrado_por)
  values (t.id, v_rodada, t.modalidade_licitacao, t.numero_processo, t.dt_licitacao, p_resultado, btrim(p_motivo),
          'relancada', v_uid)
  returning id into v_id;

  -- volta a 'aprovado' para abrir nova licitação (os dados da rodada ficam em tdr_licitacoes)
  update public.tdrs set status = 'aprovado', modalidade_licitacao = null, numero_processo = null,
         dt_licitacao = null, atualizado_em = now()
   where id = t.id;
  insert into public.tdr_acoes (tdr_id, usuario_id, acao, status_anterior, status_novo, comentario)
  values (t.id, v_uid, 'licitacao_sem_exito', 'em_licitacao', 'aprovado',
          'Licitação ' || v_rodada || 'ª rodada ' || p_resultado
          || coalesce(' (processo ' || t.numero_processo || ')', '') || ': ' || btrim(p_motivo) || ' — será relançada.');
  return v_id;
end $$;

-- ── 10. Acesso ─────────────────────────────────────────────────────────
alter table public.tdr_licitacoes                enable row level security;
alter table public.tdr_canc_numeracao            enable row level security;
alter table public.tdr_cancelamentos             enable row level security;
alter table public.tdr_cancelamento_etapas       enable row level security;
alter table public.tdr_cancelamento_assinaturas  enable row level security;
alter table public.tdr_cancelamento_historico    enable row level security;
alter table public.tdr_cancelamento_notificacoes enable row level security;

do $pol$
declare t text;
begin
  -- leitura para todo usuário ATIVO (a fila única de Remanejamentos é aberta a todos os perfis;
  -- o pedido traz só o retrato do TDR: número, objeto, valor, atividade)
  foreach t in array array['tdr_licitacoes','tdr_cancelamentos','tdr_cancelamento_etapas','tdr_cancelamento_historico'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_select') then
      execute format('create policy %I on public.%I for select to authenticated using ((select fn_perfil_atual()) is not null)', t || '_select', t);
    end if;
  end loop;
  -- assinatura guarda IP e navegador: só coordenação/super_admin e o próprio signatário
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tdr_cancelamento_assinaturas'
                  and policyname = 'tdr_cancelamento_assinaturas_select') then
    create policy tdr_cancelamento_assinaturas_select on public.tdr_cancelamento_assinaturas for select to authenticated
      using (usuario_id = auth.uid()
             or (select fn_perfil_atual()) = any (array['super_admin','coordenacao']::public.perfil_usuario[]));
  end if;
end $pol$;

-- assinaturas sem IP/navegador, para a tela e o relatório
create or replace view public.vw_tdr_cancelamento_assinaturas as
select a.id, a.cancelamento_id, a.etapa_id, e.ordem as etapa_ordem, e.papel, a.versao,
       a.usuario_id, u.nome_completo, a.cargo, a.decisao, a.motivo, a.hash_documento,
       a.criado_em, a.invalidada_em, a.invalidada_motivo
  from public.tdr_cancelamento_assinaturas a
  join public.tdr_cancelamento_etapas e on e.id = a.etapa_id
  join public.usuarios u on u.id = a.usuario_id;

revoke all on public.tdr_licitacoes, public.tdr_canc_numeracao, public.tdr_cancelamentos,
              public.tdr_cancelamento_etapas, public.tdr_cancelamento_assinaturas,
              public.tdr_cancelamento_historico, public.tdr_cancelamento_notificacoes,
              public.vw_tdr_cancelamento_assinaturas
  from anon, authenticated, public;
grant select on public.tdr_licitacoes, public.tdr_cancelamentos, public.tdr_cancelamento_etapas,
                public.tdr_cancelamento_assinaturas, public.tdr_cancelamento_historico,
                public.vw_tdr_cancelamento_assinaturas
  to authenticated;
grant select, update on public.tdr_cancelamento_notificacoes to service_role;
grant select on public.tdr_cancelamentos, public.tdr_cancelamento_etapas to service_role;

revoke all on function public.fn_trg_tcan_imutavel()              from public, anon, authenticated;
revoke all on function public.fn_trg_tcan_assinaturas_guarda()    from public, anon, authenticated;
revoke all on function public.fn_trg_tcan_etapas_guarda()         from public, anon, authenticated;
revoke all on function public.fn_trg_tcan_pedido_guarda()         from public, anon, authenticated;
revoke all on function public.fn_trg_tdr_guarda_cancelamento()    from public, anon, authenticated;
revoke all on function public.fn_trg_contrato_tdr_cancelamento()  from public, anon, authenticated;
revoke all on function public.fn_tcan_log(uuid, text, text, text, integer, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fn_tcan_notificar(uuid, uuid[], text, text)                    from public, anon, authenticated;
revoke all on function public.fn_tcan_retrato(uuid)                                          from public, anon, authenticated;
revoke all on function public.fn_tcan_efetivar(uuid, uuid)                                   from public, anon, authenticated;
revoke all on function public.fn_tcan_assinar(uuid, uuid, text, text, text, text, text)      from public, anon, authenticated;
grant execute on function public.fn_tcan_assinar(uuid, uuid, text, text, text, text, text)   to service_role;

revoke all on function public.fn_tcan_hash(uuid)                          from public, anon;
revoke all on function public.fn_tcan_signatarios_etapa(uuid)             from public, anon;
revoke all on function public.fn_tcan_validar(uuid)                       from public, anon;
revoke all on function public.fn_tcan_salvar(uuid, jsonb)                 from public, anon;
revoke all on function public.fn_tdr_licitacao_sem_exito(uuid, text, text) from public, anon;
grant execute on function public.fn_tcan_hash(uuid), public.fn_tcan_signatarios_etapa(uuid),
                          public.fn_tcan_validar(uuid), public.fn_tcan_salvar(uuid, jsonb),
                          public.fn_tdr_licitacao_sem_exito(uuid, text, text)
  to authenticated, service_role;

-- ── 11. A policy que impede remover a nota técnica do armazenamento está em
--        20261012_tdr_cancelamento_sql_editor.sql (o texto dela trava o apply_migration).
