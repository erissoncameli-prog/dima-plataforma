-- ════════════════════════════════════════════════════════════════════════
-- Viagens: viagem não realizada, retorno antecipado e devoluções (20/11/2026)
-- Caso que originou: VGM-2026-021 — passagens emitidas e diárias pagas, viagem não aconteceu
-- por força maior; diárias voltam à conta da UNESCO e a passagem é pedida de volta à agência.
--
-- Regras:
--   1. desfecho por VIAJANTE, na prestação de contas: realizada (padrão, NULL) | nao_realizada |
--      parcial (voltou antes / dias a menos: devolve só diárias). Registra o próprio viajante, quem
--      pediu o protocolo ou super_admin/coordenação, com justificativa (≥ 20).
--   2. só para item já PAGO (o lançamento existe e está pago). Antes do pagamento o caminho é
--      devolver/cancelar o protocolo, como já existia.
--   3. cada componente vira uma linha em viagem_devolucoes (nada se apaga; erro = cancelar a linha):
--        diária   : aguardando_devolucao → devolvido (viajante anexa o comprovante, prazo 5 dias)
--                   → confirmado (financeiro);
--        passagem : aguardando_unesco → confirmado (financeiro registra o que a UNESCO/agência
--                   informou: reembolso em dinheiro, crédito com a companhia ou sem reembolso).
--                   custo de cancelamento = bilhete − reembolso (ou − crédito), sempre registrado.
--   4. confirmar = financeiro ou super_admin ativo, COM SENHA (Edge Function assinar-remanejamento,
--      acao 'confirmar_devolucao_viagem' → fn_viagem_devolucao_confirmar, só service_role); quem está
--      no protocolo (pediu ou viaja) nunca confirma (SEGREGACAO). Hash fn_viagem_devolucao_hash.
--   5. o que volta em dinheiro vira LANÇAMENTO DE DEVOLUÇÃO em execucao_financeira: valor negativo,
--      pago, mesmo TDR e atividade, estorno_de = lançamento original. Assim o TDR de execução direta,
--      o razão, a Visão Geral e os relatórios devolvem o valor sem conta nova. US$ = câmbio informado
--      pela UNESCO; sem ele, o do pagamento original. Crédito com a companhia NÃO volta (fica registrado).
--   6. protocolo com todos os viajantes "não realizada" e nada pendente ⇒ situação 'nao_realizado'
--      (terminal). Misto termina em 'realizado' como sempre, mas só sem devolução pendente.
--   7. tarefas: "Devolver diárias" (viajante; sem usuário, quem pediu o protocolo), prazo 5 dias;
--      "Confirmar devolução de diárias" e "Confirmar reembolso da passagem" para o financeiro.
--      Fechadas pelo sistema.
-- ════════════════════════════════════════════════════════════════════════

-- ── colunas novas ───────────────────────────────────────────────────────
alter table public.execucao_financeira add column if not exists estorno_de uuid references public.execucao_financeira(id);
create index if not exists idx_ef_estorno_de on public.execucao_financeira(estorno_de) where estorno_de is not null;
comment on column public.execucao_financeira.estorno_de is
  'Lançamento de devolução (valor negativo) ligado ao lançamento original. Só nasce por fn_viagem_devolucao_confirmar.';

alter table public.viagem_viajantes add column if not exists desfecho text
  check (desfecho is null or desfecho in ('nao_realizada','parcial'));
alter table public.viagem_viajantes add column if not exists desfecho_motivo text;
alter table public.viagem_viajantes add column if not exists desfecho_justificativa text;
alter table public.viagem_viajantes add column if not exists desfecho_por uuid references public.usuarios(id);
alter table public.viagem_viajantes add column if not exists desfecho_em timestamptz;
comment on column public.viagem_viajantes.desfecho is
  'NULL = viagem realizada (padrão). nao_realizada | parcial — só por fn_viagem_registrar_desfecho.';

-- ── tabela de devoluções ────────────────────────────────────────────────
create sequence if not exists public.viagem_devolucoes_seq;

create table if not exists public.viagem_devolucoes (
  id                      uuid primary key default gen_random_uuid(),
  numero                  text unique,
  protocolo_id            uuid not null references public.viagem_protocolos(id),
  viajante_id             uuid not null references public.viagem_viajantes(id),
  lancamento_id           uuid references public.execucao_financeira(id),
  componente              text not null check (componente in ('diaria','passagem')),
  motivo                  text not null check (motivo in ('viagem_nao_realizada','retorno_antecipado','outro')),
  justificativa           text not null,
  valor_pago_brl          numeric(14,2) not null,
  valor_previsto_brl      numeric(14,2) not null check (valor_previsto_brl > 0),
  status                  text not null check (status in ('aguardando_devolucao','devolvido','aguardando_unesco','confirmado','cancelado')),
  prazo                   date,
  -- diária: o viajante informa a devolução
  valor_informado_brl     numeric(14,2),
  dt_devolucao            date,
  comprovante_url         text,
  comprovante_nome        text,
  comprovante_sha256      text,
  informado_por           uuid references public.usuarios(id),
  informado_em            timestamptz,
  -- confirmação (financeiro)
  forma                   text check (forma is null or forma in ('deposito','reembolso_dinheiro','credito_companhia','sem_reembolso')),
  valor_creditado_brl     numeric(14,2),
  custo_cancelamento_brl  numeric(14,2),
  credito_companhia_brl   numeric(14,2),
  cotacao_usd             numeric(10,4),
  cotacao_origem          text check (cotacao_origem is null or cotacao_origem in ('unesco_informada','pagamento_original')),
  valor_creditado_usd     numeric(14,2),
  documento_url           text,
  documento_nome          text,
  documento_sha256        text,
  observacao              text,
  estorno_lancamento_id   uuid references public.execucao_financeira(id),
  hash                    text,
  confirmado_por          uuid references public.usuarios(id),
  confirmado_em           timestamptz,
  cancelado_por           uuid references public.usuarios(id),
  cancelado_em            timestamptz,
  cancelado_motivo        text,
  tarefa_viajante_id      uuid,
  tarefa_financeiro_id    uuid,
  criado_por              uuid not null references public.usuarios(id),
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now()
);
create index if not exists idx_viagem_dev_prot on public.viagem_devolucoes(protocolo_id);
create unique index if not exists uk_viagem_dev_viva on public.viagem_devolucoes(viajante_id, componente)
  where status <> 'cancelado';

alter table public.viagem_devolucoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'viagem_devolucoes'
                  and policyname = 'viagem_devolucoes_select') then
    create policy viagem_devolucoes_select on public.viagem_devolucoes for select to authenticated
      using (exists (select 1 from public.viagem_protocolos p where p.id = viagem_devolucoes.protocolo_id));
  end if;
end $$;
revoke all on public.viagem_devolucoes from anon, authenticated;
grant select on public.viagem_devolucoes to authenticated;
revoke all on sequence public.viagem_devolucoes_seq from public, anon, authenticated;

create or replace trigger trg_audit_viagem_devolucoes
  after insert or update on public.viagem_devolucoes
  for each row execute function public.fn_trg_audit();

-- ── lançamento de devolução: nasce e fica só pela função ────────────────
create or replace function public.fn_trg_ef_guarda_estorno()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if coalesce(current_setting('dima.viagem_devolucao', true), '') = 'confirmar' then return new; end if;
  if tg_op = 'INSERT' then
    if new.estorno_de is not null then
      raise exception 'DEVOLUCAO: lançamento de devolução só nasce pela confirmação da devolução em Viagens.';
    end if;
    return new;
  end if;
  if old.estorno_de is not null or new.estorno_de is distinct from old.estorno_de then
    raise exception 'DEVOLUCAO: lançamento de devolução não se altera. Para corrigir, cancele a devolução em Viagens.';
  end if;
  return new;
end $$;
create or replace trigger trg_ef_guarda_estorno
  before insert or update on public.execucao_financeira
  for each row execute function public.fn_trg_ef_guarda_estorno();

-- ── quem pode registrar desfecho/informar devolução ─────────────────────
create or replace function public.fn_viagem_dev_pode_operar(p_protocolo uuid, p_usuario uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(
       exists (select 1 from public.usuarios u where u.id = p_usuario and u.ativo
                  and u.perfil::text in ('super_admin','coordenacao'))
    or (exists (select 1 from public.usuarios u where u.id = p_usuario and u.ativo)
        and public.fn_viagem_participa(p_protocolo, p_usuario) is not null), false)
$$;

-- usuário ativo que é este viajante (e-mail do viajante/beneficiário ou nome completo)
create or replace function public.fn_viagem_dev_usuario_viajante(p_viajante uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select u.id
    from public.viagem_viajantes v
    left join public.beneficiarios b on b.id = v.beneficiario_id
    join public.usuarios u on u.ativo and (
          lower(btrim(u.email)) = lower(btrim(v.email))
       or lower(btrim(u.email)) = lower(btrim(b.email))
       or public.fn_viagem_norm(u.nome_completo) = public.fn_viagem_norm(v.nome)
       or public.fn_viagem_norm(u.nome_completo) = public.fn_viagem_norm(b.nome))
   where v.id = p_viajante
   order by (lower(btrim(u.email)) = lower(btrim(coalesce(v.email, b.email)))) desc nulls last
   limit 1
$$;

-- ── tarefas do fluxo ────────────────────────────────────────────────────
create or replace function public.fn_viagem_dev_criar_tarefa(p_titulo text, p_desc text, p_prazo date,
                                                              p_dev uuid, p_atividade uuid, p_autor uuid,
                                                              p_resp uuid[])
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; u uuid;
begin
  if p_resp is null or cardinality(p_resp) = 0 then return null; end if;
  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo, entidade_tipo, entidade_id,
                       atividade_id, criado_por, tipo)
  values (p_titulo, p_desc, 'alta', (now() at time zone 'America/Rio_Branco')::date, p_prazo,
          'viagem_devolucao', p_dev, p_atividade, p_autor, 'outras')
  returning id into v_id;
  foreach u in array p_resp loop
    insert into tarefa_participantes (tarefa_id, usuario_id, papel) values (v_id, u, 'responsavel')
      on conflict do nothing;
    insert into notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    values (u, 'tarefa_atribuida', p_titulo, left(p_desc, 300), false, 'tarefas.html?tarefa=' || v_id, 'tarefas', v_id);
  end loop;
  return v_id;
end $$;

create or replace function public.fn_viagem_dev_fechar_tarefa(p_tarefa uuid, p_status text, p_autor uuid, p_texto text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_t tarefas%rowtype;
begin
  if p_tarefa is null then return; end if;
  select * into v_t from tarefas where id = p_tarefa;
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

-- confirmadores: financeiro ativo fora do protocolo; sem nenhum, super_admin fora do protocolo
create or replace function public.fn_viagem_dev_confirmadores(p_protocolo uuid)
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select array_agg(u.id) from public.usuarios u
      where u.ativo and u.perfil::text = 'financeiro' and public.fn_viagem_participa(p_protocolo, u.id) is null),
    (select array_agg(u.id) from public.usuarios u
      where u.ativo and u.perfil::text = 'super_admin' and public.fn_viagem_participa(p_protocolo, u.id) is null))
$$;

create or replace function public.fn_viagem_dev_brl(v numeric)
returns text language sql immutable set search_path to 'public' as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999G999G990D00'), ',.', '.,')
$$;

-- ── 1. registrar o desfecho do viajante ─────────────────────────────────
create or replace function public.fn_viagem_registrar_desfecho(p_viajante uuid, p_desfecho text, p_motivo text,
                                                              p_justificativa text, p_diaria_devolver_brl numeric default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid := auth.uid();
  v       viagem_viajantes%rowtype;
  p       viagem_protocolos%rowtype;
  ef      execucao_financeira%rowtype;
  v_pass  numeric; v_diar numeric; v_dev_diar numeric;
  v_just  text := nullif(btrim(coalesce(p_justificativa, '')), '');
  v_hoje  date := (now() at time zone 'America/Rio_Branco')::date;
  v_id    uuid; v_tar uuid; v_resp uuid; v_conf uuid[];
  v_criadas jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'DEVOLUCAO: entre de novo.'; end if;
  if p_desfecho not in ('nao_realizada','parcial') then raise exception 'DEVOLUCAO: desfecho inválido.'; end if;
  if p_motivo not in ('viagem_nao_realizada','retorno_antecipado','outro') then raise exception 'DEVOLUCAO: motivo inválido.'; end if;
  if coalesce(length(v_just), 0) < 20 then raise exception 'DEVOLUCAO: escreva a justificativa (mínimo 20 caracteres).'; end if;

  select * into v from viagem_viajantes where id = p_viajante for update;
  if v.id is null then raise exception 'DEVOLUCAO: viajante não encontrado.'; end if;
  select * into p from viagem_protocolos where id = v.protocolo_id;
  if not fn_viagem_dev_pode_operar(p.id, v_uid) then
    raise exception 'SEM_PERMISSAO: registra o desfecho o próprio viajante, quem pediu o protocolo ou a coordenação.';
  end if;
  if p.situacao not in ('aprovado','em_prestacao') then
    raise exception 'DEVOLUCAO: o protocolo % está "%"; o desfecho é registrado em aprovado ou em prestação.', p.numero, p.situacao;
  end if;
  if v.desfecho is not null then
    raise exception 'DEVOLUCAO: o desfecho deste viajante já foi registrado. Para mudar, cancele as devoluções dele antes.';
  end if;
  select * into ef from execucao_financeira where id = v.lancamento_id;
  if ef.id is null or ef.situacao <> 'pago' then
    raise exception 'DEVOLUCAO: o lançamento deste viajante ainda não foi pago. Antes do pagamento, ajuste ou cancele o protocolo (não há o que devolver).';
  end if;

  select coalesce(sum(valor), 0) into v_pass from viagem_trechos where viajante_id = v.id;
  select coalesce(sum(quantidade * valor_unitario), 0) into v_diar from viagem_diarias_v2 where viajante_id = v.id;

  if p_desfecho = 'nao_realizada' then
    v_dev_diar := coalesce(p_diaria_devolver_brl, v_diar);
  else
    v_dev_diar := p_diaria_devolver_brl;
    if coalesce(v_dev_diar, 0) <= 0 then raise exception 'DEVOLUCAO: informe o valor das diárias não usadas.'; end if;
  end if;
  if v_dev_diar is not null and v_dev_diar > v_diar + 0.005 then
    raise exception 'DEVOLUCAO: o valor a devolver (%) passa das diárias pagas (%).', fn_viagem_dev_brl(v_dev_diar), fn_viagem_dev_brl(v_diar);
  end if;

  update viagem_viajantes set desfecho = p_desfecho, desfecho_motivo = p_motivo, desfecho_justificativa = v_just,
         desfecho_por = v_uid, desfecho_em = now(), atualizado_em = now()
   where id = v.id;

  v_conf := fn_viagem_dev_confirmadores(p.id);

  -- diárias
  if v.tem_diaria and coalesce(v_dev_diar, 0) > 0 then
    v_id := gen_random_uuid();
    insert into viagem_devolucoes (id, numero, protocolo_id, viajante_id, lancamento_id, componente, motivo, justificativa,
                                   valor_pago_brl, valor_previsto_brl, status, prazo, criado_por)
    values (v_id, 'DEV-' || to_char(v_hoje, 'YYYY') || '-' || lpad(nextval('viagem_devolucoes_seq')::text, 4, '0'),
            p.id, v.id, ef.id, 'diaria', p_motivo, v_just, v_diar, round(v_dev_diar, 2), 'aguardando_devolucao',
            v_hoje + 5, v_uid);
    v_resp := coalesce(fn_viagem_dev_usuario_viajante(v.id), p.criado_por, v_uid);
    v_tar := fn_viagem_dev_criar_tarefa(
      'Devolver diárias — ' || p.numero || ' (' || v.nome || ')',
      'A viagem ' || p.numero || ' (' || coalesce(p.destino_principal, '—') || ') foi registrada como '
        || case p_desfecho when 'nao_realizada' then 'não realizada' else 'realizada em parte' end
        || ' para ' || v.nome || '. Devolva ' || fn_viagem_dev_brl(v_dev_diar)
        || ' de diárias para a conta da UNESCO e anexe o comprovante em Viagens › protocolo ' || p.numero
        || ' › "Informar devolução". Prazo: 5 dias. Justificativa: ' || v_just,
      v_hoje + 5, v_id, p.atividade_id, v_uid, array[v_resp]);
    update viagem_devolucoes set tarefa_viajante_id = v_tar where id = v_id;
    v_criadas := v_criadas || jsonb_build_object('id', v_id, 'componente', 'diaria', 'valor', round(v_dev_diar, 2));
  end if;

  -- passagem (só quando a viagem não aconteceu)
  if p_desfecho = 'nao_realizada' and v.tem_passagem and v_pass > 0 then
    v_id := gen_random_uuid();
    insert into viagem_devolucoes (id, numero, protocolo_id, viajante_id, lancamento_id, componente, motivo, justificativa,
                                   valor_pago_brl, valor_previsto_brl, status, criado_por)
    values (v_id, 'DEV-' || to_char(v_hoje, 'YYYY') || '-' || lpad(nextval('viagem_devolucoes_seq')::text, 4, '0'),
            p.id, v.id, ef.id, 'passagem', p_motivo, v_just, v_pass, v_pass, 'aguardando_unesco', v_uid);
    v_tar := fn_viagem_dev_criar_tarefa(
      'Confirmar reembolso da passagem — ' || p.numero || ' (' || v.nome || ')',
      'A passagem de ' || v.nome || ' (' || p.numero || ', bilhete ' || fn_viagem_dev_brl(v_pass)
        || ') não foi usada. Quando a UNESCO/agência informar o resultado, registre em Viagens › protocolo ' || p.numero
        || ' › "Confirmar": reembolso em dinheiro, crédito com a companhia ou sem reembolso, e o custo de cancelamento. '
        || 'Pede a senha. Justificativa: ' || v_just,
      v_hoje + 30, v_id, p.atividade_id, v_uid, v_conf);
    update viagem_devolucoes set tarefa_financeiro_id = v_tar where id = v_id;
    v_criadas := v_criadas || jsonb_build_object('id', v_id, 'componente', 'passagem', 'valor', v_pass);
  end if;

  if jsonb_array_length(v_criadas) = 0 then
    raise exception 'DEVOLUCAO: não há diária nem passagem com valor para devolver neste viajante.';
  end if;
  return jsonb_build_object('devolucoes', v_criadas);
end $$;

-- ── 2. viajante informa a devolução da diária (comprovante) ─────────────
create or replace function public.fn_viagem_devolucao_informar(p_devolucao uuid, p_valor_brl numeric, p_dt date,
                                                              p_url text, p_nome text, p_sha256 text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  d     viagem_devolucoes%rowtype;
  p     viagem_protocolos%rowtype;
  v_nome text;
  v_path text;
  v_tar  uuid;
begin
  select * into d from viagem_devolucoes where id = p_devolucao for update;
  if d.id is null then raise exception 'DEVOLUCAO: devolução não encontrada.'; end if;
  select * into p from viagem_protocolos where id = d.protocolo_id;
  if v_uid is null or not fn_viagem_dev_pode_operar(p.id, v_uid) then
    raise exception 'SEM_PERMISSAO: informa a devolução o próprio viajante, quem pediu o protocolo ou a coordenação.';
  end if;
  if d.componente <> 'diaria' or d.status not in ('aguardando_devolucao','devolvido') then
    raise exception 'DEVOLUCAO: esta devolução não aceita comprovante agora (situação %).', d.status;
  end if;
  if coalesce(p_valor_brl, 0) <= 0 or p_valor_brl > d.valor_pago_brl + 0.005 then
    raise exception 'DEVOLUCAO: valor devolvido inválido (entre R$ 0,01 e %).', fn_viagem_dev_brl(d.valor_pago_brl);
  end if;
  if p_dt is null or p_dt > (now() at time zone 'America/Rio_Branco')::date then
    raise exception 'DEVOLUCAO: informe a data da devolução (não pode ser futura).';
  end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then raise exception 'DEVOLUCAO: comprovante sem SHA-256.'; end if;
  v_path := substring(coalesce(p_url, '') from '/viagens-arquivos/(.+)$');
  if v_path is null or v_path not like 'devolucoes/' || d.protocolo_id || '/%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'viagens-arquivos' and o.name = v_path) then
    raise exception 'DEVOLUCAO: o comprovante não foi encontrado no armazenamento. Envie o arquivo de novo.';
  end if;

  update viagem_devolucoes set status = 'devolvido', valor_informado_brl = round(p_valor_brl, 2), dt_devolucao = p_dt,
         comprovante_url = p_url, comprovante_nome = p_nome, comprovante_sha256 = p_sha256,
         informado_por = v_uid, informado_em = now(), atualizado_em = now()
   where id = d.id;

  perform fn_viagem_dev_fechar_tarefa(d.tarefa_viajante_id, 'concluida', v_uid,
    'Devolução informada: ' || fn_viagem_dev_brl(p_valor_brl) || ' em ' || to_char(p_dt, 'DD/MM/YYYY') || ' (comprovante anexado).');

  if d.tarefa_financeiro_id is null then
    select nome into v_nome from viagem_viajantes where id = d.viajante_id;
    v_tar := fn_viagem_dev_criar_tarefa(
      'Confirmar devolução de diárias — ' || p.numero || ' (' || v_nome || ')',
      v_nome || ' informou a devolução de ' || fn_viagem_dev_brl(p_valor_brl) || ' em ' || to_char(p_dt, 'DD/MM/YYYY')
        || ' para a conta da UNESCO (' || p.numero || '). Confira o comprovante e o crédito com a UNESCO e confirme em Viagens › protocolo '
        || p.numero || ' › "Confirmar" (pede a senha). O valor volta ao TDR da atividade.',
      (now() at time zone 'America/Rio_Branco')::date + 10, d.id, p.atividade_id, v_uid, fn_viagem_dev_confirmadores(p.id));
    update viagem_devolucoes set tarefa_financeiro_id = v_tar where id = d.id;
  end if;
  return jsonb_build_object('status', 'devolvido');
end $$;

-- ── 3. o documento que se confirma ──────────────────────────────────────
create or replace function public.fn_viagem_devolucao_hash(p_devolucao uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'id', d.id, 'numero', d.numero, 'status', d.status, 'componente', d.componente,
    'viajante', d.viajante_id, 'lancamento', d.lancamento_id,
    'pago', d.valor_pago_brl, 'previsto', d.valor_previsto_brl,
    'informado', d.valor_informado_brl, 'dt', d.dt_devolucao, 'comprovante', d.comprovante_sha256,
    'lanc_situacao', ef.situacao, 'lanc_brl', ef.valor_brl
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.viagem_devolucoes d
  left join public.execucao_financeira ef on ef.id = d.lancamento_id
  where d.id = p_devolucao
    and (auth.uid() is null or exists (select 1 from public.viagem_protocolos p where p.id = d.protocolo_id))
$$;

-- a tela pergunta se a pessoa logada pode confirmar (só exibição)
create or replace function public.fn_viagem_devolucao_pode_confirmar(p_devolucao uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare d viagem_devolucoes%rowtype; v_perfil text; v_part text;
begin
  if auth.uid() is null then return jsonb_build_object('pode', false); end if;
  select * into d from viagem_devolucoes where id = p_devolucao;
  if d.id is null or d.status not in ('devolvido','aguardando_unesco') then return jsonb_build_object('pode', false); end if;
  select perfil::text into v_perfil from usuarios where id = auth.uid() and ativo;
  if v_perfil is null or v_perfil not in ('financeiro','super_admin') then return jsonb_build_object('pode', false); end if;
  v_part := fn_viagem_participa(d.protocolo_id, auth.uid());
  if v_part is not null then return jsonb_build_object('pode', false, 'bloqueio', v_part); end if;
  return jsonb_build_object('pode', true, 'hash', fn_viagem_devolucao_hash(d.id));
end $$;

-- ── 4. confirmar (só service_role, depois da senha na Edge Function) ────
create or replace function public.fn_viagem_devolucao_confirmar(p_usuario_id uuid, p_devolucao uuid, p_forma text,
    p_valor_creditado_brl numeric, p_credito_companhia_brl numeric, p_cotacao numeric,
    p_documento_url text, p_documento_nome text, p_documento_sha256 text, p_observacao text, p_hash text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  d       viagem_devolucoes%rowtype;
  p       viagem_protocolos%rowtype;
  ef      execucao_financeira%rowtype;
  v_nome  text;
  v_perfil text;
  v_part  text;
  v_obs   text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_cred  numeric := 0;      -- volta em dinheiro (R$)
  v_custo numeric := 0;
  v_ccia  numeric := null;
  v_cot   numeric; v_orig text; v_usd numeric;
  v_est   uuid;
  v_hoje  date := (now() at time zone 'America/Rio_Branco')::date;
  v_path  text;
  v_fim   boolean := false;
begin
  select * into d from viagem_devolucoes where id = p_devolucao for update;
  if d.id is null then raise exception 'DEVOLUCAO: devolução não encontrada.'; end if;
  select * into p from viagem_protocolos where id = d.protocolo_id for update;
  select perfil::text into v_perfil from usuarios where id = p_usuario_id and ativo;
  if v_perfil is null or v_perfil not in ('financeiro','super_admin') then
    raise exception 'SEM_PERMISSAO: confirma a devolução o financeiro (ou super_admin).';
  end if;
  v_part := fn_viagem_participa(p.id, p_usuario_id);
  if v_part = 'solicitante' then
    raise exception 'SEGREGACAO: quem pediu a viagem não confirma a devolução dela.';
  elsif v_part = 'viajante' then
    raise exception 'SEGREGACAO: quem viaja neste protocolo não confirma a própria devolução.';
  end if;
  if p_hash is distinct from fn_viagem_devolucao_hash(d.id) then
    raise exception 'DOCUMENTO_ALTERADO: a devolução mudou depois que você abriu. Recarregue e confira.';
  end if;
  select * into ef from execucao_financeira where id = d.lancamento_id;
  if ef.id is null or ef.situacao <> 'pago' then
    raise exception 'DEVOLUCAO: o lançamento original não está pago.';
  end if;

  if d.componente = 'diaria' then
    if d.status <> 'devolvido' then raise exception 'DEVOLUCAO: aguardando o comprovante do viajante.'; end if;
    if coalesce(p_forma, 'deposito') <> 'deposito' then raise exception 'DEVOLUCAO: diária volta por depósito.'; end if;
    v_cred := round(coalesce(p_valor_creditado_brl, d.valor_informado_brl), 2);
    if v_cred <= 0 or v_cred > d.valor_pago_brl + 0.005 then
      raise exception 'DEVOLUCAO: valor creditado inválido (entre R$ 0,01 e %).', fn_viagem_dev_brl(d.valor_pago_brl);
    end if;
    if abs(v_cred - d.valor_informado_brl) > 0.005 and coalesce(length(v_obs), 0) < 10 then
      raise exception 'DEVOLUCAO: o valor confirmado difere do informado pelo viajante — explique na observação.';
    end if;
  else
    if d.status <> 'aguardando_unesco' then raise exception 'DEVOLUCAO: esta passagem já foi tratada.'; end if;
    if p_forma = 'reembolso_dinheiro' then
      v_cred := round(coalesce(p_valor_creditado_brl, 0), 2);
      if v_cred <= 0 or v_cred > d.valor_previsto_brl + 0.005 then
        raise exception 'DEVOLUCAO: reembolso inválido (entre R$ 0,01 e o valor do bilhete, %).', fn_viagem_dev_brl(d.valor_previsto_brl);
      end if;
      v_custo := d.valor_previsto_brl - v_cred;
    elsif p_forma = 'credito_companhia' then
      v_ccia := round(coalesce(p_credito_companhia_brl, 0), 2);
      if v_ccia <= 0 or v_ccia > d.valor_previsto_brl + 0.005 then
        raise exception 'DEVOLUCAO: crédito inválido (entre R$ 0,01 e o valor do bilhete, %).', fn_viagem_dev_brl(d.valor_previsto_brl);
      end if;
      v_custo := d.valor_previsto_brl - v_ccia;
    elsif p_forma = 'sem_reembolso' then
      v_custo := d.valor_previsto_brl;
      if coalesce(length(v_obs), 0) < 10 then raise exception 'DEVOLUCAO: sem reembolso — explique na observação.'; end if;
    else
      raise exception 'DEVOLUCAO: escolha reembolso em dinheiro, crédito com a companhia ou sem reembolso.';
    end if;
    if p_documento_url is null then
      raise exception 'DEVOLUCAO: anexe o documento da UNESCO/agência com o resultado (reembolso, crédito ou custo).';
    end if;
  end if;

  if p_documento_url is not null then
    if coalesce(p_documento_sha256, '') !~ '^[0-9a-f]{64}$' then raise exception 'DEVOLUCAO: documento sem SHA-256.'; end if;
    v_path := substring(p_documento_url from '/viagens-arquivos/(.+)$');
    if v_path is null or v_path not like 'devolucoes/' || d.protocolo_id || '/%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'viagens-arquivos' and o.name = v_path) then
      raise exception 'DEVOLUCAO: o documento não foi encontrado no armazenamento. Envie o arquivo de novo.';
    end if;
  end if;

  -- câmbio: o informado pela UNESCO; sem ele, o do pagamento original
  if coalesce(p_cotacao, 0) > 0 then
    v_cot := round(p_cotacao, 4); v_orig := 'unesco_informada';
  else
    v_cot := round(ef.valor_brl / nullif(coalesce(ef.valor_usd_unesco, ef.valor_usd), 0), 4); v_orig := 'pagamento_original';
  end if;
  if coalesce(v_cot, 0) <= 0 then raise exception 'DEVOLUCAO: informe o câmbio da UNESCO (o pagamento original não tem US$).'; end if;
  v_usd := round(v_cred / v_cot, 2);

  if v_cred > 0 then
    select nome into v_nome from viagem_viajantes where id = d.viajante_id;
    perform set_config('dima.viagem_devolucao', 'confirmar', true);
    insert into execucao_financeira (atividade_id, tdr_id, descricao, valor_brl, valor_usd, valor_usd_unesco,
                                     cotacao_uso, cotacao_unesco, cotacao_travada_em, dt_vencimento, dt_pagamento,
                                     situacao, elemento_despesa, criado_por, pago_por, observacoes, estorno_de)
    values (ef.atividade_id, ef.tdr_id,
            'Devolução ' || d.numero || ' — ' || p.numero || ' — '
              || case d.componente when 'diaria' then 'diárias' else 'passagem' end || ' — ' || coalesce(v_nome, ''),
            -v_cred, -v_usd, case when v_orig = 'unesco_informada' or ef.valor_usd_unesco is not null then -v_usd end,
            v_cot, case when v_orig = 'unesco_informada' then v_cot end, now(),
            coalesce(d.dt_devolucao, v_hoje), coalesce(d.dt_devolucao, v_hoje),
            'pago', ef.elemento_despesa, p_usuario_id, p_usuario_id,
            'Devolução de ' || case d.componente when 'diaria' then 'diárias' else 'passagem' end
              || ' do lançamento original. ' || coalesce(v_obs, ''),
            ef.id)
    returning id into v_est;
    perform set_config('dima.viagem_devolucao', '', true);
  end if;

  update viagem_devolucoes set status = 'confirmado',
         forma = coalesce(p_forma, case when d.componente = 'diaria' then 'deposito' end),
         valor_creditado_brl = v_cred, custo_cancelamento_brl = case when d.componente = 'passagem' then round(v_custo, 2) end,
         credito_companhia_brl = v_ccia, cotacao_usd = v_cot, cotacao_origem = v_orig, valor_creditado_usd = v_usd,
         documento_url = p_documento_url, documento_nome = p_documento_nome, documento_sha256 = p_documento_sha256,
         observacao = v_obs, estorno_lancamento_id = v_est, hash = p_hash,
         confirmado_por = p_usuario_id, confirmado_em = now(), atualizado_em = now()
   where id = d.id;

  perform fn_viagem_dev_fechar_tarefa(d.tarefa_financeiro_id, 'concluida', p_usuario_id,
    'Confirmado: ' || fn_viagem_dev_brl(v_cred) || ' de volta ao TDR'
    || case when d.componente = 'passagem' then ' · custo de cancelamento ' || fn_viagem_dev_brl(v_custo) else '' end || '.');
  perform fn_viagem_dev_fechar_tarefa(d.tarefa_viajante_id, 'concluida', p_usuario_id, 'Devolução confirmada pelo financeiro.');

  -- todos os viajantes não realizaram e nada pendente ⇒ protocolo 'nao_realizado'
  if p.situacao in ('aprovado','em_prestacao')
     and not exists (select 1 from viagem_viajantes x where x.protocolo_id = p.id
                      and coalesce(x.desfecho, '') <> 'nao_realizada' and (x.tem_passagem or x.tem_diaria))
     and not exists (select 1 from viagem_devolucoes y where y.protocolo_id = p.id
                      and y.status in ('aguardando_devolucao','devolvido','aguardando_unesco')) then
    perform set_config('dima.viagem', 'devolucao', true);
    update viagem_protocolos set situacao = 'nao_realizado', realizado_por = p_usuario_id, realizado_em = now(),
           atualizado_em = now()
     where id = p.id;
    perform set_config('dima.viagem', '', true);
    v_fim := true;
  end if;

  if p.criado_por is not null then
    insert into notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    values (p.criado_por, 'viagem_prestacao', 'Devolução confirmada — ' || p.numero,
            d.numero || ': ' || fn_viagem_dev_brl(v_cred) || ' de volta ao TDR'
              || case when v_fim then '. Protocolo encerrado como não realizado.' else '.' end,
            false, 'viagens.html', 'viagem_protocolos', p.id);
  end if;

  return jsonb_build_object('status', 'confirmado', 'creditado_brl', v_cred, 'creditado_usd', v_usd,
                            'custo_cancelamento_brl', case when d.componente = 'passagem' then round(v_custo, 2) end,
                            'lancamento_devolucao', v_est, 'protocolo_encerrado', v_fim);
end $$;

-- ── 5. cancelar uma devolução registrada por engano (antes de confirmar) ─
create or replace function public.fn_viagem_devolucao_cancelar(p_devolucao uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  d viagem_devolucoes%rowtype;
  v_mot text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not exists (select 1 from usuarios where id = v_uid and ativo and perfil::text in ('super_admin','coordenacao')) then
    raise exception 'SEM_PERMISSAO: cancela devolução a coordenação ou o super_admin.';
  end if;
  if coalesce(length(v_mot), 0) < 10 then raise exception 'DEVOLUCAO: escreva o motivo (mínimo 10 caracteres).'; end if;
  select * into d from viagem_devolucoes where id = p_devolucao for update;
  if d.id is null then raise exception 'DEVOLUCAO: devolução não encontrada.'; end if;
  if d.status in ('confirmado','cancelado') then
    raise exception 'DEVOLUCAO: devolução % já está "%" e não se cancela.', d.numero, d.status;
  end if;
  update viagem_devolucoes set status = 'cancelado', cancelado_por = v_uid, cancelado_em = now(),
         cancelado_motivo = v_mot, atualizado_em = now()
   where id = d.id;
  perform fn_viagem_dev_fechar_tarefa(d.tarefa_viajante_id, 'cancelada', v_uid, 'Devolução cancelada: ' || v_mot);
  perform fn_viagem_dev_fechar_tarefa(d.tarefa_financeiro_id, 'cancelada', v_uid, 'Devolução cancelada: ' || v_mot);
  -- viajante sem devolução viva volta a "realizada" (o desfecho pode ser registrado de novo)
  if not exists (select 1 from viagem_devolucoes x where x.viajante_id = d.viajante_id and x.status <> 'cancelado') then
    update viagem_viajantes set desfecho = null, desfecho_motivo = null, desfecho_justificativa = null,
           desfecho_por = null, desfecho_em = null, atualizado_em = now()
     where id = d.viajante_id;
  end if;
  return jsonb_build_object('status', 'cancelado');
end $$;

-- ── trava do protocolo: 'nao_realizado' só pelo fluxo; 'realizado' sem devolução pendente ─
create or replace function public.fn_trg_viagem_guarda_decisao()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if coalesce(current_setting('dima.viagem', true), '') in ('decidir','devolucao') then return new; end if;
  if tg_op = 'INSERT' then
    if new.situacao not in ('rascunho','solicitado') or new.aprovado_por is not null or new.aprovado_em is not null then
      raise exception 'VIAGEM_DECISAO: protocolo novo nasce como rascunho ou solicitado.';
    end if;
    return new;
  end if;
  if new.situacao is distinct from old.situacao and (
       (old.situacao = 'solicitado' and new.situacao in ('aprovado','rejeitado','rascunho'))
    or (new.situacao = 'aprovado' and old.situacao is distinct from 'em_prestacao')
    or new.situacao = 'rejeitado'
    or (old.situacao in ('aprovado','em_prestacao','realizado') and new.situacao in ('rascunho','solicitado'))
  ) then
    raise exception 'VIAGEM_DECISAO: aprovar, devolver ou rejeitar o protocolo só pela tela de Viagens, com a senha — e nunca por quem pediu ou viaja.';
  end if;
  if new.situacao is distinct from old.situacao and (new.situacao = 'nao_realizado' or old.situacao = 'nao_realizado') then
    raise exception 'VIAGEM_DEVOLUCAO: "não realizado" só é definido pela confirmação das devoluções e não volta.';
  end if;
  if new.situacao = 'realizado' and old.situacao is distinct from 'realizado' then
    if exists (select 1 from public.viagem_devolucoes y where y.protocolo_id = new.id
                and y.status in ('aguardando_devolucao','devolvido','aguardando_unesco')) then
      raise exception 'VIAGEM_DEVOLUCAO: há devolução pendente neste protocolo. Confirme as devoluções antes de concluir.';
    end if;
    if not exists (select 1 from public.viagem_viajantes x where x.protocolo_id = new.id
                    and coalesce(x.desfecho, '') <> 'nao_realizada' and (x.tem_passagem or x.tem_diaria))
       and exists (select 1 from public.viagem_viajantes x where x.protocolo_id = new.id and x.desfecho = 'nao_realizada') then
      raise exception 'VIAGEM_DEVOLUCAO: nenhum viajante realizou a viagem — o protocolo termina como "não realizado".';
    end if;
  end if;
  if new.aprovado_por is distinct from old.aprovado_por or new.aprovado_em is distinct from old.aprovado_em then
    raise exception 'VIAGEM_DECISAO: quem aprovou e quando só são gravados pela aprovação.';
  end if;
  return new;
end $$;

-- desfecho do viajante só pela função (trava junto da que já existe para aprovação)
create or replace function public.fn_trg_viagem_viaj_desfecho()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.desfecho is distinct from old.desfecho or new.desfecho_motivo is distinct from old.desfecho_motivo
     or new.desfecho_justificativa is distinct from old.desfecho_justificativa
     or new.desfecho_por is distinct from old.desfecho_por or new.desfecho_em is distinct from old.desfecho_em then
    if pg_trigger_depth() > 1 or current_user in ('postgres','service_role') then return new; end if;
    raise exception 'VIAGEM_DEVOLUCAO: o desfecho do viajante só é registrado pela prestação de contas em Viagens.';
  end if;
  return new;
end $$;
create or replace trigger trg_viagem_viaj_desfecho
  before update on public.viagem_viajantes
  for each row execute function public.fn_trg_viagem_viaj_desfecho();

-- ── permissões ───────────────────────────────────────────────────────────
revoke all on function public.fn_trg_ef_guarda_estorno() from public, anon, authenticated;
revoke all on function public.fn_trg_viagem_viaj_desfecho() from public, anon, authenticated;
revoke all on function public.fn_viagem_dev_pode_operar(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_viagem_dev_usuario_viajante(uuid) from public, anon, authenticated;
revoke all on function public.fn_viagem_dev_criar_tarefa(text, text, date, uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.fn_viagem_dev_fechar_tarefa(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.fn_viagem_dev_confirmadores(uuid) from public, anon, authenticated;
revoke all on function public.fn_viagem_dev_brl(numeric) from public, anon;
grant execute on function public.fn_viagem_dev_brl(numeric) to authenticated, service_role;
revoke all on function public.fn_viagem_registrar_desfecho(uuid, text, text, text, numeric) from public, anon;
grant execute on function public.fn_viagem_registrar_desfecho(uuid, text, text, text, numeric) to authenticated;
revoke all on function public.fn_viagem_devolucao_informar(uuid, numeric, date, text, text, text) from public, anon;
grant execute on function public.fn_viagem_devolucao_informar(uuid, numeric, date, text, text, text) to authenticated;
revoke all on function public.fn_viagem_devolucao_hash(uuid) from public, anon;
grant execute on function public.fn_viagem_devolucao_hash(uuid) to authenticated, service_role;
revoke all on function public.fn_viagem_devolucao_pode_confirmar(uuid) from public, anon;
grant execute on function public.fn_viagem_devolucao_pode_confirmar(uuid) to authenticated;
revoke all on function public.fn_viagem_devolucao_confirmar(uuid, uuid, text, numeric, numeric, numeric, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_viagem_devolucao_confirmar(uuid, uuid, text, numeric, numeric, numeric, text, text, text, text, text) to service_role;
revoke all on function public.fn_viagem_devolucao_cancelar(uuid, text) from public, anon;
grant execute on function public.fn_viagem_devolucao_cancelar(uuid, text) to authenticated;

notify pgrst, 'reload schema';
