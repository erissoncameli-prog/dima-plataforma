-- ════════════════════════════════════════════════════════════════════════
-- Encerramento de contrato com saldo não executado — aprovação do responsável
--
-- Antes: super_admin/coordenação/financeiro encerravam direto (insert em
-- contrato_encerramentos pelo navegador). Agora:
--   1. quem encerra faz um PEDIDO (fn_encp_pedir): produtos a cancelar, valor que
--      volta, justificativa e termo opcional. Nada muda no contrato ainda;
--   2. o pedido exige responsável ATIVO na atividade (papel 'responsavel') — sem ele
--      o pedido não nasce; e alguém, além de quem pediu, que possa aprovar;
--   3. aprova o RESPONSÁVEL ou o SUBSTITUTO ativo da atividade, nunca quem pediu,
--      com a SENHA de login reconfirmada no servidor (Edge Function
--      assinar-remanejamento, acao 'decidir_encerramento' → fn_encp_decidir, que só
--      tem EXECUTE para service_role);
--   4. aprovar efetiva tudo numa transação: contrato 'encerrado', produtos
--      cancelados, liberação em contrato_encerramentos (US$ pela PTAX do dia) e,
--      se houver, o termo anexado; devolver exige parecer e volta a quem pediu;
--   5. o documento aprovado é o que a pessoa viu: fn_encp_hash (pedido + estado
--      ao vivo do contrato e dos produtos); mudou ⇒ DOCUMENTO_ALTERADO.
-- Travas no banco:
--   • contrato com produto pendente só vira 'encerrado' pela aprovação
--     (trg_contrato_guarda_encerramento, chave dima.encerramento = 'efetivar');
--   • contrato_encerramentos tipo encerramento_contrato só nasce pela aprovação
--     (trg_encerramento_so_aprovado) — economia de contratação segue igual.
-- Encerramento automático: contrato vigente com tudo pago (valor utilizado ≥ valor
-- total e nenhum produto em aberto) vira 'encerrado' sozinho (fn_contrato_auto_encerrar).
-- Pedido e decisão não se alteram depois (sem policy de escrita; trigger de guarda).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.contrato_encerramento_pedidos (
  id                  uuid primary key default gen_random_uuid(),
  contrato_id         uuid not null references public.contratos(id),
  atividade_id        uuid not null references public.atividades(id),
  status              text not null default 'aguardando'
                        check (status in ('aguardando','aprovado','devolvido','cancelado')),
  motivo              text not null check (length(btrim(motivo)) >= 20),
  produtos            jsonb not null default '[]'::jsonb,
  valor_liberado_brl  numeric not null default 0 check (valor_liberado_brl >= 0),
  termo_caminho       text,
  termo_nome          text,
  termo_sha256        text check (termo_sha256 is null or termo_sha256 ~ '^[0-9a-f]{64}$'),
  termo_tamanho       bigint,
  solicitado_por      uuid not null references public.usuarios(id),
  criado_em           timestamptz not null default now(),
  decidido_por        uuid references public.usuarios(id),
  decidido_em         timestamptz,
  parecer             text,
  hash_decisao        text,
  senha_verificada_em timestamptz,
  ip                  text,
  user_agent          text,
  cancelado_motivo    text,
  tarefa_id           uuid references public.tarefas(id),
  encerramento_id     uuid references public.contrato_encerramentos(id)
);
create index if not exists idx_encp_contrato on public.contrato_encerramento_pedidos(contrato_id);
create unique index if not exists uq_encp_aberto on public.contrato_encerramento_pedidos(contrato_id)
  where status = 'aguardando';

alter table public.contrato_encerramento_pedidos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='contrato_encerramento_pedidos' and policyname='encp_select') then
    create policy encp_select on public.contrato_encerramento_pedidos for select to authenticated
      using (exists (select 1 from public.contratos c where c.id = contrato_id));
  end if;
end $$;
revoke all on public.contrato_encerramento_pedidos from anon, public, authenticated;
grant select on public.contrato_encerramento_pedidos to authenticated;

-- pedido decidido não muda; aberto só muda pelas funções (que passam a chave)
create or replace function public.fn_trg_encp_guarda()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if coalesce(current_setting('dima.encerramento', true), '') not in ('efetivar','pedido') then
    raise exception 'ENCERRAMENTO_PEDIDO: o pedido de encerramento só muda pela aprovação, devolução ou cancelamento.';
  end if;
  if old.status <> 'aguardando' then
    raise exception 'ENCERRAMENTO_PEDIDO: pedido já decidido não se altera — faça um novo pedido.';
  end if;
  if new.contrato_id is distinct from old.contrato_id or new.motivo is distinct from old.motivo
     or new.produtos is distinct from old.produtos or new.valor_liberado_brl is distinct from old.valor_liberado_brl
     or new.solicitado_por is distinct from old.solicitado_por or new.termo_caminho is distinct from old.termo_caminho then
    raise exception 'ENCERRAMENTO_PEDIDO: o conteúdo do pedido não se altera — devolva e faça outro.';
  end if;
  return new;
end $$;
create or replace trigger trg_encp_guarda before update on public.contrato_encerramento_pedidos
  for each row execute function public.fn_trg_encp_guarda();

-- ── quem aprova ──────────────────────────────────────────────────────────
create or replace function public.fn_encp_aprovadores(p_atividade uuid, p_excluir uuid)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct ar.usuario_id
    from public.atividade_responsaveis ar
    join public.usuarios u on u.id = ar.usuario_id and u.ativo
   where ar.atividade_id = p_atividade and ar.ativo
     and ar.papel in ('responsavel','substituto')
     and ar.usuario_id is distinct from p_excluir
$$;

-- a tela pergunta se a pessoa logada pode decidir este pedido (só exibição; quem decide é fn_encp_decidir)
create or replace function public.fn_encp_pode_decidir(p_pedido uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select p.status = 'aguardando'
                      and exists (select 1 from public.fn_encp_aprovadores(p.atividade_id, p.solicitado_por) a
                                   where a = auth.uid())
                     from public.contrato_encerramento_pedidos p where p.id = p_pedido), false)
$$;

-- leitura do contrato pela regra de contratos_select (usada pelo hash, que é SECURITY DEFINER)
create or replace function public.fn_encp_ve_contrato(p_contrato uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.usuarios u where u.id = auth.uid() and u.ativo
                  and u.perfil in ('super_admin','coordenacao','financeiro'))
      or public.tem_permissao('contratos')
      or exists (select 1 from public.contratos c join public.atividade_responsaveis ar
                   on ar.atividade_id = c.atividade_id and ar.usuario_id = auth.uid() and ar.ativo
                  where c.id = p_contrato)
$$;

-- ── o documento que se aprova ────────────────────────────────────────────
create or replace function public.fn_encp_hash(p_pedido uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'pedido', p.id, 'motivo', p.motivo, 'valor', p.valor_liberado_brl, 'produtos', p.produtos,
    'termo', p.termo_sha256,
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

-- ── tarefa de aprovação: concluir/cancelar pelo sistema ──────────────────
create or replace function public.fn_encp_fechar_tarefa(p_pedido uuid, p_status text, p_autor uuid, p_texto text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_t tarefas%rowtype;
begin
  select t.* into v_t from tarefas t join contrato_encerramento_pedidos p on p.tarefa_id = t.id where p.id = p_pedido;
  if v_t.id is null or v_t.status in ('concluida','cancelada') then return; end if;
  perform set_config('dima.tarefa_status_rpc', '1', true);
  update tarefas set status = p_status::status_tarefa,
         dt_conclusao = case when p_status = 'concluida' then now() else dt_conclusao end
   where id = v_t.id;
  perform set_config('dima.tarefa_status_rpc', '', true);
  insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem) values (v_t.id, p_autor, p_texto, 'painel');
  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para, motivo)
    values (v_t.id, p_autor, case when p_status = 'concluida' then 'conclusao' else 'cancelamento' end,
            v_t.status::text, p_status, left(p_texto, 500));
end $$;

create or replace function public.fn_encp_avisar(p_usuarios uuid[], p_tipo text, p_titulo text, p_msg text, p_contrato uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare u uuid;
begin
  if p_usuarios is null then return; end if;
  foreach u in array p_usuarios loop
    if u is null then continue; end if;
    insert into notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
    values (u, p_tipo, p_titulo, p_msg, 'contratos.html?contrato=' || p_contrato::text, 'contrato', p_contrato);
  end loop;
end $$;

-- ── 1. pedir ─────────────────────────────────────────────────────────────
create or replace function public.fn_encp_pedir(p_contrato uuid, p_produtos uuid[], p_motivo text, p_termo jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid := auth.uid();
  c       contratos%rowtype;
  v_cod   text;
  v_forn  text;
  v_snap  jsonb;
  v_valor numeric;
  v_n     integer;
  v_aprov uuid[];
  v_id    uuid;
  v_tar   uuid;
  v_fmt   text;
begin
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

  -- termo opcional (mesmas regras de fn_encerramento_anexar_documento)
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

  insert into contrato_encerramento_pedidos (contrato_id, atividade_id, motivo, produtos, valor_liberado_brl,
         termo_caminho, termo_nome, termo_sha256, termo_tamanho, solicitado_por)
  values (c.id, c.atividade_id, btrim(p_motivo), v_snap, round(v_valor, 2),
          p_termo->>'caminho', left(p_termo->>'nome', 200), lower(p_termo->>'sha256'),
          nullif(p_termo->>'tamanho', '')::bigint, v_uid)
  returning id into v_id;

  -- tarefa para quem aprova (sai no painel de tarefas, no sino e por e-mail pela tela)
  select nome into v_forn from fornecedores where id = c.fornecedor_id;
  v_fmt := 'R$ ' || replace(replace(replace(to_char(round(v_valor, 2), 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');
  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo, entidade_tipo, entidade_id,
                       atividade_id, criado_por, tipo)
  values ('Aprovar encerramento do contrato ' || c.numero,
          'Pedido de encerramento do contrato ' || c.numero || coalesce(' (' || v_forn || ')', '')
            || ' com ' || jsonb_array_length(v_snap) || ' produto(s) cancelado(s) e ' || v_fmt
            || ' devolvido(s) à atividade ' || v_cod || '. Justificativa: ' || btrim(p_motivo)
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
    'Aprovar encerramento do contrato ' || c.numero, v_fmt || ' voltam à atividade ' || v_cod, v_tar, v_uid);

  return jsonb_build_object('id', v_id, 'tarefa_id', v_tar, 'valor_liberado_brl', round(v_valor, 2),
                            'aprovadores', jsonb_array_length(to_jsonb(v_aprov)));
end $$;

-- ── 2. cancelar o pedido (quem pediu, ou super_admin) ────────────────────
create or replace function public.fn_encp_cancelar(p_pedido uuid, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare p contrato_encerramento_pedidos%rowtype; v_uid uuid := auth.uid();
begin
  select * into p from contrato_encerramento_pedidos where id = p_pedido for update;
  if p.id is null then raise exception 'ENCERRAMENTO_PEDIDO: pedido não encontrado.'; end if;
  if p.status <> 'aguardando' then raise exception 'ENCERRAMENTO_PEDIDO: o pedido já foi decidido.'; end if;
  if v_uid is distinct from p.solicitado_por
     and not exists (select 1 from usuarios where id = v_uid and ativo and perfil = 'super_admin') then
    raise exception 'ENCERRAMENTO_PEDIDO: só quem pediu (ou super_admin) cancela o pedido.';
  end if;
  if coalesce(length(btrim(p_motivo)), 0) < 5 then raise exception 'ENCERRAMENTO_PEDIDO: informe o motivo.'; end if;
  perform set_config('dima.encerramento', 'pedido', true);
  update contrato_encerramento_pedidos set status = 'cancelado', cancelado_motivo = btrim(p_motivo),
         decidido_por = v_uid, decidido_em = now() where id = p.id;
  perform set_config('dima.encerramento', '', true);
  perform fn_encp_fechar_tarefa(p.id, 'cancelada', v_uid, 'Pedido de encerramento cancelado: ' || btrim(p_motivo));
end $$;

-- ── 3. decidir (só pela Edge Function, depois da senha) ──────────────────
create or replace function public.fn_encp_decidir(p_usuario_id uuid, p_pedido uuid, p_decisao text, p_parecer text,
                                                  p_hash text, p_ip text default null, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  p      contrato_encerramento_pedidos%rowtype;
  c      contratos%rowtype;
  v_ptax numeric;
  v_ptax_data date;
  v_usd  numeric := 0;
  v_enc  uuid;
  v_avis uuid[];
  v_fmt  text;
  v_resp_termo uuid;
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
  v_fmt := 'R$ ' || replace(replace(replace(to_char(p.valor_liberado_brl, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');

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
      'Encerramento do contrato ' || c.numero || ' devolvido', left(btrim(p_parecer), 200), c.id);
    return jsonb_build_object('status', 'devolvido');
  end if;

  -- aprovar: efetiva tudo aqui
  perform set_config('dima.encerramento', 'efetivar', true);
  update contratos set status = 'encerrado' where id = c.id;
  update contratos_produtos set situacao = 'cancelado', atualizado_em = now()
   where id in (select (x->>'id')::uuid from jsonb_array_elements(p.produtos) x
                 where coalesce((x->>'valor_aprovado')::numeric, 0) <= 0);

  -- US$ = R$ ÷ PTAX do dia (o trigger da PTAX só age com usuário logado; aqui é a Edge Function)
  if p.valor_liberado_brl > 0 then
    select f.ptax_venda, f.data_cotacao into v_ptax, v_ptax_data from fn_cotacao_usd(null) f;
    v_usd := round(p.valor_liberado_brl / v_ptax, 2);
  end if;
  -- termo: quem anexar depois precisa poder (super_admin/coordenação) — vai para quem pediu, se puder
  v_resp_termo := (select id from usuarios where id = p.solicitado_por and ativo and perfil in ('super_admin','coordenacao'));
  perform set_config('dima.encerramento_resp_termo', coalesce(v_resp_termo::text, ''), true);
  if p.termo_caminho is not null then
    perform set_config('dima.encerramento_sem_tarefa', '1', true);
  end if;
  insert into contrato_encerramentos (contrato_id, atividade_id, tipo, valor_liberado_brl, valor_liberado_usd,
         cotacao, cotacao_data, motivo, produtos_afetados, autorizado_por)
  values (c.id, p.atividade_id, 'encerramento_contrato', p.valor_liberado_brl, v_usd,
          v_ptax, v_ptax_data,
          p.motivo, p.produtos, p_usuario_id)
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
    'Encerramento aprovado com senha. ' || v_fmt || ' devolvido(s) à atividade.'
    || coalesce(' Parecer: ' || nullif(btrim(p_parecer), ''), ''));

  select array_agg(distinct u) into v_avis from (
    select p.solicitado_por as u
    union select a from fn_encp_aprovadores(p.atividade_id, p_usuario_id) a) x;
  perform fn_encp_avisar(v_avis, 'tarefa_concluida', 'Contrato ' || c.numero || ' encerrado',
    'Aprovado pelo responsável. ' || v_fmt || ' voltam à atividade.', c.id);
  return jsonb_build_object('status', 'aprovado', 'encerramento_id', v_enc, 'valor_liberado_usd', v_usd);
end $$;

-- ── travas ───────────────────────────────────────────────────────────────
-- contrato com produto em aberto só é encerrado pela aprovação do responsável
create or replace function public.fn_trg_contrato_guarda_encerramento()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status = 'encerrado' and old.status is distinct from 'encerrado'
     and coalesce(current_setting('dima.encerramento', true), '') <> 'efetivar'
     and exists (select 1 from public.contratos_produtos cp where cp.contrato_id = new.id
                  and cp.situacao in ('pendente','em_analise','entrega_parcial','devolvido')) then
    raise exception 'ENCERRAMENTO_PEDIDO: o contrato % tem produto em aberto — o encerramento precisa ser pedido e aprovado pelo responsável da atividade.', new.numero;
  end if;
  if old.status is distinct from new.status and new.status <> 'encerrado'
     and coalesce(current_setting('dima.encerramento', true), '') <> 'efetivar'
     and exists (select 1 from public.contrato_encerramento_pedidos p where p.contrato_id = new.id and p.status = 'aguardando')
     and new.status <> 'aguardando_cobertura' then
    raise exception 'ENCERRAMENTO_PEDIDO: o contrato % tem pedido de encerramento aguardando o responsável — cancele o pedido antes de mudar a situação.', new.numero;
  end if;
  return new;
end $$;
create or replace trigger trg_contrato_guarda_encerramento before update of status on public.contratos
  for each row execute function public.fn_trg_contrato_guarda_encerramento();

-- liberação por encerramento de contrato só nasce pela aprovação
create or replace function public.fn_trg_encerramento_so_aprovado()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.tipo = 'encerramento_contrato' and auth.uid() is not null
     and coalesce(current_setting('dima.encerramento', true), '') <> 'efetivar' then
    raise exception 'ENCERRAMENTO_PEDIDO: o encerramento com saldo não executado é pedido na tela de Contratos e aprovado pelo responsável da atividade.';
  end if;
  return new;
end $$;
create or replace trigger trg_encerramento_so_aprovado before insert on public.contrato_encerramentos
  for each row execute function public.fn_trg_encerramento_so_aprovado();

-- tarefa do termo: não cria quando o termo veio no pedido; responsável = quem pediu (se puder anexar)
create or replace function public.fn_trg_encerramento_tarefa()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.tipo = 'encerramento_contrato'
     and coalesce(current_setting('dima.encerramento_sem_tarefa', true), '') <> '1' then
    begin
      perform fn_encerramento_criar_tarefa(new.id);
    exception when others then
      raise warning 'tarefa do encerramento % não criada: %', new.id, sqlerrm;  -- o encerramento nunca falha por causa da tarefa
    end;
  end if;
  return new;
end $$;

create or replace function public.fn_encerramento_criar_tarefa(p_enc uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  e  contrato_encerramentos%rowtype;
  c  contratos%rowtype;
  v_resp uuid;
  v_id   uuid;
  v_forn text;
begin
  select * into e from contrato_encerramentos where id = p_enc;
  if e.id is null or e.tipo <> 'encerramento_contrato' then return null; end if;
  select id into v_id from tarefas
   where entidade_tipo = 'contrato_encerramento' and entidade_id = p_enc and ativo limit 1;
  if v_id is not null then return v_id; end if;
  if exists (select 1 from contrato_encerramento_documentos where encerramento_id = p_enc) then return null; end if;

  select * into c from contratos where id = e.contrato_id;
  select nome into v_forn from fornecedores where id = c.fornecedor_id;
  -- quem anexa o termo precisa ser super_admin/coordenação (fn_encerramento_anexar_documento)
  v_resp := coalesce(
    (select id from usuarios where id = nullif(current_setting('dima.encerramento_resp_termo', true), '')::uuid and ativo),
    (select id from usuarios where id = e.autorizado_por and ativo and perfil in ('super_admin','coordenacao')),
    (select x.usuario_id from rem_cargo_titulares x join usuarios u on u.id = x.usuario_id and u.ativo
      where x.cargo = 'coordenacao_solicitante' and x.vigencia_fim is null limit 1),
    (select id from usuarios where id = e.autorizado_por and ativo));
  if v_resp is null then return null; end if;

  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo, entidade_tipo, entidade_id,
                       atividade_id, criado_por, tipo)
  values ('Anexar termo de encerramento do contrato ' || c.numero,
          'O contrato ' || c.numero || coalesce(' (' || v_forn || ')', '') || ' foi encerrado em '
            || to_char(e.criado_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY')
            || ' com ' || 'R$ ' || replace(replace(replace(to_char(e.valor_liberado_brl, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.') || ' não executados devolvidos à atividade. '
            || 'Anexe o termo de encerramento (ou distrato) assinado em Contratos › contrato ' || c.numero
            || ' › Detalhes e documentos › Encerramento › "Anexar PDF". A tarefa é concluída sozinha quando o termo for anexado.',
          'alta', current_date, current_date + 15, 'contrato_encerramento', p_enc,
          e.atividade_id, v_resp, 'outras')
  returning id into v_id;

  insert into tarefa_participantes (tarefa_id, usuario_id, papel) values (v_id, v_resp, 'responsavel')
    on conflict (tarefa_id, usuario_id) do nothing;
  if c.tdr_id is not null and e.atividade_id is not null
     and exists (select 1 from tdrs where id = c.tdr_id and atividade_id = e.atividade_id) then
    insert into tarefa_tdrs (tarefa_id, tdr_id) values (v_id, c.tdr_id) on conflict do nothing;
  end if;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (v_id, v_resp, 'criacao', 'Criada pelo sistema no encerramento do contrato ' || c.numero);
  perform fn_tarefa_notificar(array[v_resp], 'tarefa_atribuida',
    'Nova tarefa: anexar termo de encerramento', 'Contrato ' || c.numero, v_id, null);
  return v_id;
end $$;

-- ── encerramento automático do contrato todo executado ───────────────────
create or replace function public.fn_contrato_auto_encerrar(p_contrato uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update contratos c set status = 'encerrado'
   where c.id = p_contrato and c.status = 'vigente'
     and coalesce(c.valor_total_brl, 0) > 0
     and coalesce(c.valor_utilizado_brl, 0) >= c.valor_total_brl - 0.005
     and not exists (select 1 from contratos_produtos cp where cp.contrato_id = c.id
                      and cp.situacao not in ('pago','cancelado'))
     and not exists (select 1 from execucao_financeira ef where ef.contrato_id = c.id and ef.situacao = 'a_pagar');
end $$;

-- (b, 20261013_encerramento_aprovacao_b_auto) IF em vez de CASE: o CASE lia new.contrato_id também na
-- tabela contratos e quebrava todo UPDATE de valor_utilizado_brl
create or replace function public.fn_trg_contrato_auto_encerrar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_table_name = 'contratos' then
    perform fn_contrato_auto_encerrar(new.id);
  else
    perform fn_contrato_auto_encerrar(new.contrato_id);
  end if;
  return null;
end $$;
create or replace trigger trg_contrato_auto_encerrar after update of valor_utilizado_brl on public.contratos
  for each row when (new.status = 'vigente' and new.valor_utilizado_brl is distinct from old.valor_utilizado_brl)
  execute function public.fn_trg_contrato_auto_encerrar();
create or replace trigger trg_produto_auto_encerrar after update of situacao on public.contratos_produtos
  for each row when (new.situacao = 'pago' and old.situacao is distinct from 'pago')
  execute function public.fn_trg_contrato_auto_encerrar();

-- ── permissões ───────────────────────────────────────────────────────────
revoke all on function public.fn_encp_pedir(uuid, uuid[], text, jsonb) from public, anon;
grant execute on function public.fn_encp_pedir(uuid, uuid[], text, jsonb) to authenticated;
revoke all on function public.fn_encp_cancelar(uuid, text) from public, anon;
grant execute on function public.fn_encp_cancelar(uuid, text) to authenticated;
revoke all on function public.fn_encp_hash(uuid) from public, anon;
grant execute on function public.fn_encp_hash(uuid) to authenticated, service_role;
revoke all on function public.fn_encp_pode_decidir(uuid) from public, anon;
grant execute on function public.fn_encp_pode_decidir(uuid) to authenticated;
revoke all on function public.fn_encp_decidir(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_encp_decidir(uuid, uuid, text, text, text, text, text) to service_role;
revoke all on function public.fn_encp_aprovadores(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_encp_ve_contrato(uuid) from public, anon, authenticated;
revoke all on function public.fn_encp_fechar_tarefa(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.fn_encp_avisar(uuid[], text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fn_contrato_auto_encerrar(uuid) from public, anon, authenticated;
revoke all on function public.fn_trg_contrato_auto_encerrar() from public, anon, authenticated;
revoke all on function public.fn_trg_encp_guarda() from public, anon, authenticated;
revoke all on function public.fn_trg_contrato_guarda_encerramento() from public, anon, authenticated;
revoke all on function public.fn_trg_encerramento_so_aprovado() from public, anon, authenticated;

notify pgrst, 'reload schema';
