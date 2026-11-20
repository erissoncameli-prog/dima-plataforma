-- ════════════════════════════════════════════════════════════════════════
-- Viagens: comprovantes da emissão — bilhetes e pagamento das diárias (20/11/2026)
--   1. protocolo APROVADO (a aprovação já manda à UNESCO o e-mail "Providenciar passagens e diárias") ⇒ tarefas para TODOS os
--      usuários financeiro ativos fora do protocolo (sem nenhum, super_admin fora do protocolo):
--      "Anexar bilhetes" (prazo 5 dias) e "Anexar comprovante de pagamento das diárias" (até a saída).
--   2. viagem_comprovantes (só inclusão; trocar = nova linha e a anterior fica ativo=false):
--      tipo 'bilhete' (agência, O.S., localizador, nº, emissão, tarifa, taxas, total) ou 'diaria'
--      (data e valor pago). Arquivo em viagens-arquivos/comprovantes/<protocolo>/… com SHA-256.
--      Grava só fn_viagem_comprovante_salvar: financeiro, super_admin ou coordenação FORA do protocolo.
--   3. bilhete ⇒ Σ dos bilhetes ativos vira o valor real das passagens do viajante (trechos, na
--      proporção do valor de cada um) e o lançamento A PAGAR é atualizado. Pago não muda.
--      O comprovante de diárias só registra: o pagamento segue em Financeiro › Efetivar pagamento.
--   4. a tarefa fecha sozinha quando todos os viajantes com aquele item têm o comprovante; o
--      viajante é avisado no sino.
-- ════════════════════════════════════════════════════════════════════════

-- a tela já gravava notificado_unesco_em ("UNESCO avisada"), mas a coluna nunca existiu e o update falhava calado
alter table public.viagem_protocolos add column if not exists notificado_unesco_em timestamptz;
alter table public.viagem_protocolos add column if not exists tarefa_bilhetes_id uuid;
alter table public.viagem_protocolos add column if not exists tarefa_diarias_id uuid;

create table if not exists public.viagem_comprovantes (
  id              uuid primary key default gen_random_uuid(),
  protocolo_id    uuid not null references public.viagem_protocolos(id),
  viajante_id     uuid not null references public.viagem_viajantes(id),
  tipo            text not null check (tipo in ('bilhete','diaria')),
  arquivo_url     text not null,
  arquivo_nome    text,
  arquivo_sha256  text not null,
  agencia         text,
  ordem_servico   text,
  localizador     text,
  bilhete         text,
  dt_emissao      date,
  tarifa_brl      numeric(14,2),
  taxas_brl       numeric(14,2),
  valor_brl       numeric(14,2) not null check (valor_brl >= 0),
  dt_pagamento    date,
  observacao      text,
  lido_do_pdf     boolean not null default false,
  ativo           boolean not null default true,
  substituido_por uuid references public.viagem_comprovantes(id),
  criado_por      uuid not null references public.usuarios(id),
  criado_em       timestamptz not null default now()
);
create index if not exists idx_viagem_comp_prot on public.viagem_comprovantes(protocolo_id);
create index if not exists idx_viagem_comp_viaj on public.viagem_comprovantes(viajante_id) where ativo;

alter table public.viagem_comprovantes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'viagem_comprovantes'
                  and policyname = 'viagem_comprovantes_select') then
    create policy viagem_comprovantes_select on public.viagem_comprovantes for select to authenticated
      using (exists (select 1 from public.viagem_protocolos p where p.id = viagem_comprovantes.protocolo_id));
  end if;
end $$;
revoke all on public.viagem_comprovantes from anon, authenticated;
grant select on public.viagem_comprovantes to authenticated;

create or replace trigger trg_audit_viagem_comprovantes
  after insert or update on public.viagem_comprovantes
  for each row execute function public.fn_trg_audit();

-- quem anexa: financeiro, super_admin ou coordenação ativo, fora do protocolo
create or replace function public.fn_viagem_comp_pode(p_protocolo uuid, p_usuario uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(exists (select 1 from public.usuarios u where u.id = p_usuario and u.ativo
                            and u.perfil::text in ('financeiro','super_admin','coordenacao'))
                  and public.fn_viagem_participa(p_protocolo, p_usuario) is null, false)
$$;

-- tarefa do protocolo (entidade_tipo 'viagem_comprovante')
create or replace function public.fn_viagem_comp_criar_tarefa(p_titulo text, p_desc text, p_prazo date,
                                                               p_protocolo uuid, p_atividade uuid, p_autor uuid, p_resp uuid[])
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; u uuid;
begin
  if p_resp is null or cardinality(p_resp) = 0 or p_autor is null then return null; end if;
  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo, entidade_tipo, entidade_id,
                       atividade_id, criado_por, tipo)
  values (p_titulo, p_desc, 'alta', (now() at time zone 'America/Rio_Branco')::date, p_prazo,
          'viagem_comprovante', p_protocolo, p_atividade, p_autor, 'outras')
  returning id into v_id;
  foreach u in array p_resp loop
    insert into tarefa_participantes (tarefa_id, usuario_id, papel) values (v_id, u, 'responsavel') on conflict do nothing;
    insert into notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    values (u, 'tarefa_atribuida', p_titulo, left(p_desc, 300), false, 'tarefas.html?tarefa=' || v_id, 'tarefas', v_id);
  end loop;
  return v_id;
end $$;

-- cria as tarefas quando o protocolo é enviado à UNESCO (idempotente: só se ainda não houver)
create or replace function public.fn_viagem_comp_abrir_tarefas(p_protocolo uuid, p_autor uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  p viagem_protocolos%rowtype;
  v_resp uuid[];
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_tar uuid;
  v_aut uuid;
begin
  select * into p from viagem_protocolos where id = p_protocolo for update;
  if p.id is null or p.situacao not in ('aprovado','em_prestacao') then return; end if;
  v_resp := fn_viagem_dev_confirmadores(p.id);
  v_aut := coalesce(p_autor, p.aprovado_por, p.criado_por);
  if p.tarefa_bilhetes_id is null and exists (select 1 from viagem_viajantes v where v.protocolo_id = p.id and v.tem_passagem) then
    v_tar := fn_viagem_comp_criar_tarefa(
      'Anexar bilhetes — ' || p.numero || ' (' || coalesce(p.destino_principal, '—') || ')',
      'O protocolo ' || p.numero || ' foi enviado à UNESCO para emissão. Quando a agência emitir, anexe o bilhete (roteiro/e-ticket) '
        || 'de cada viajante em Viagens › protocolo ' || p.numero || ' › "Anexar bilhete". O valor do bilhete passa a ser o valor real '
        || 'das passagens. A tarefa fecha sozinha quando todos os viajantes tiverem o bilhete.',
      v_hoje + 5, p.id, p.atividade_id, v_aut, v_resp);
    update viagem_protocolos set tarefa_bilhetes_id = v_tar where id = p.id;
  end if;
  if p.tarefa_diarias_id is null and exists (select 1 from viagem_viajantes v where v.protocolo_id = p.id and v.tem_diaria) then
    v_tar := fn_viagem_comp_criar_tarefa(
      'Anexar comprovante de pagamento das diárias — ' || p.numero || ' (' || coalesce(p.destino_principal, '—') || ')',
      'Quando a UNESCO pagar as diárias do protocolo ' || p.numero || ', anexe o comprovante de cada viajante em Viagens › protocolo '
        || p.numero || ' › "Anexar comprovante de diárias". Isso só registra: o pagamento do lançamento continua em Financeiro › '
        || 'Efetivar pagamento. A tarefa fecha sozinha quando todos os viajantes tiverem o comprovante.',
      greatest(coalesce(p.dt_saida, v_hoje + 5), v_hoje), p.id, p.atividade_id, v_aut, v_resp);
    update viagem_protocolos set tarefa_diarias_id = v_tar where id = p.id;
  end if;
end $$;

create or replace function public.fn_trg_viagem_comp_unesco()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.situacao = 'aprovado' and old.situacao is distinct from 'aprovado' then
    perform public.fn_viagem_comp_abrir_tarefas(new.id, coalesce(new.aprovado_por, auth.uid()));
  end if;
  return null;
end $$;
create or replace trigger trg_viagem_comp_unesco
  after update of situacao on public.viagem_protocolos
  for each row execute function public.fn_trg_viagem_comp_unesco();

-- fecha a tarefa quando todos os viajantes com o item têm comprovante ativo
create or replace function public.fn_viagem_comp_conferir_tarefas(p_protocolo uuid, p_autor uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare p viagem_protocolos%rowtype;
begin
  select * into p from viagem_protocolos where id = p_protocolo;
  if p.tarefa_bilhetes_id is not null and not exists (
       select 1 from viagem_viajantes v where v.protocolo_id = p.id and v.tem_passagem
          and coalesce(v.desfecho, '') <> 'nao_realizada'
          and not exists (select 1 from viagem_comprovantes c where c.viajante_id = v.id and c.tipo = 'bilhete' and c.ativo)) then
    perform fn_viagem_dev_fechar_tarefa(p.tarefa_bilhetes_id, 'concluida', p_autor, 'Todos os bilhetes foram anexados.');
  end if;
  if p.tarefa_diarias_id is not null and not exists (
       select 1 from viagem_viajantes v where v.protocolo_id = p.id and v.tem_diaria
          and coalesce(v.desfecho, '') <> 'nao_realizada'
          and not exists (select 1 from viagem_comprovantes c where c.viajante_id = v.id and c.tipo = 'diaria' and c.ativo)) then
    perform fn_viagem_dev_fechar_tarefa(p.tarefa_diarias_id, 'concluida', p_autor, 'Todos os comprovantes de diárias foram anexados.');
  end if;
end $$;

-- ── anexar (bilhete ou diária) ──────────────────────────────────────────
create or replace function public.fn_viagem_comprovante_salvar(p_viajante uuid, p_tipo text, p_dados jsonb,
                                                              p_url text, p_nome text, p_sha256 text, p_substitui uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid  uuid := auth.uid();
  v      viagem_viajantes%rowtype;
  p      viagem_protocolos%rowtype;
  ef     execucao_financeira%rowtype;
  v_path text;
  v_id   uuid;
  v_val  numeric;
  v_pass numeric; v_atual numeric; v_diar numeric; v_n int; v_i int := 0; v_acum numeric := 0;
  v_cot  numeric; v_parte numeric;
  v_resp uuid;
  v_lanc text := 'sem_lancamento';
  t record;
begin
  if p_tipo not in ('bilhete','diaria') then raise exception 'COMPROVANTE: tipo inválido.'; end if;
  select * into v from viagem_viajantes where id = p_viajante for update;
  if v.id is null then raise exception 'COMPROVANTE: viajante não encontrado.'; end if;
  select * into p from viagem_protocolos where id = v.protocolo_id;
  if v_uid is null or not fn_viagem_comp_pode(p.id, v_uid) then
    raise exception 'SEM_PERMISSAO: anexa comprovante o financeiro, a coordenação ou o super_admin que não esteja no protocolo.';
  end if;
  if p.situacao not in ('aprovado','em_prestacao','realizado') then
    raise exception 'COMPROVANTE: o protocolo % está "%"; comprovante só depois de aprovado.', p.numero, p.situacao;
  end if;
  if p_tipo = 'bilhete' and not v.tem_passagem then raise exception 'COMPROVANTE: este viajante não tem passagem no protocolo.'; end if;
  if p_tipo = 'diaria' and not v.tem_diaria then raise exception 'COMPROVANTE: este viajante não tem diária no protocolo.'; end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then raise exception 'COMPROVANTE: arquivo sem SHA-256.'; end if;
  v_path := substring(coalesce(p_url, '') from '/viagens-arquivos/(.+)$');
  if v_path is null or v_path not like 'comprovantes/' || p.id || '/%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'viagens-arquivos' and o.name = v_path) then
    raise exception 'COMPROVANTE: o arquivo não foi encontrado no armazenamento. Envie de novo.';
  end if;
  v_val := round(nullif(p_dados->>'valor_brl', '')::numeric, 2);
  if v_val is null or v_val < 0 then raise exception 'COMPROVANTE: informe o valor.'; end if;
  if p_tipo = 'diaria' and nullif(p_dados->>'dt_pagamento', '') is null then
    raise exception 'COMPROVANTE: informe a data do pagamento das diárias.';
  end if;
  if p_substitui is not null and not exists (select 1 from viagem_comprovantes c where c.id = p_substitui
       and c.viajante_id = v.id and c.tipo = p_tipo and c.ativo) then
    raise exception 'COMPROVANTE: o comprovante a substituir não está ativo.';
  end if;

  insert into viagem_comprovantes (protocolo_id, viajante_id, tipo, arquivo_url, arquivo_nome, arquivo_sha256,
      agencia, ordem_servico, localizador, bilhete, dt_emissao, tarifa_brl, taxas_brl, valor_brl, dt_pagamento,
      observacao, lido_do_pdf, criado_por)
  values (p.id, v.id, p_tipo, p_url, p_nome, p_sha256,
      nullif(btrim(p_dados->>'agencia'), ''), nullif(btrim(p_dados->>'ordem_servico'), ''),
      nullif(upper(btrim(p_dados->>'localizador')), ''), nullif(btrim(p_dados->>'bilhete'), ''),
      nullif(p_dados->>'dt_emissao', '')::date, nullif(p_dados->>'tarifa_brl', '')::numeric,
      nullif(p_dados->>'taxas_brl', '')::numeric, v_val, nullif(p_dados->>'dt_pagamento', '')::date,
      nullif(btrim(p_dados->>'observacao'), ''), coalesce((p_dados->>'lido_do_pdf')::boolean, false), v_uid)
  returning id into v_id;
  if p_substitui is not null then
    update viagem_comprovantes set ativo = false, substituido_por = v_id where id = p_substitui;
  end if;

  -- bilhete: Σ dos bilhetes ativos = valor real das passagens; lançamento a pagar acompanha
  if p_tipo = 'bilhete' then
    select coalesce(sum(valor_brl), 0) into v_pass from viagem_comprovantes where viajante_id = v.id and tipo = 'bilhete' and ativo;
    select coalesce(sum(valor), 0), count(*) into v_atual, v_n from viagem_trechos where viajante_id = v.id;
    if v_n > 0 then
      for t in select id, valor from viagem_trechos where viajante_id = v.id order by ordem, id loop
        v_i := v_i + 1;
        if v_i = v_n then
          update viagem_trechos set valor = v_pass - v_acum where id = t.id;
        else
          v_parte := round(case when v_atual > 0 then v_pass * coalesce(t.valor, 0) / v_atual else v_pass / v_n end, 2);
          update viagem_trechos set valor = v_parte where id = t.id;
          v_acum := v_acum + v_parte;
        end if;
      end loop;
    end if;
    select * into ef from execucao_financeira where id = v.lancamento_id;
    if ef.id is not null and ef.situacao = 'a_pagar' then
      select coalesce(sum(quantidade * valor_unitario), 0) into v_diar from viagem_diarias_v2 where viajante_id = v.id;
      select cotacao into v_cot from cotacoes_usd order by data_ref desc, criado_em desc limit 1;
      v_cot := coalesce(nullif(v_cot, 0), ef.cotacao_uso, 5.87);
      update execucao_financeira set valor_brl = v_pass + v_diar, valor_usd = round((v_pass + v_diar) / v_cot, 2),
             atualizado_em = now()
       where id = ef.id;
      v_lanc := 'atualizado';
    elsif ef.id is not null then
      v_lanc := 'ja_pago';
    end if;
  end if;

  perform fn_viagem_comp_conferir_tarefas(p.id, v_uid);

  v_resp := fn_viagem_dev_usuario_viajante(v.id);
  if v_resp is not null then
    insert into notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    values (v_resp, 'viagem_aprovada',
            case p_tipo when 'bilhete' then 'Seu bilhete está disponível — ' else 'Diárias pagas — ' end || p.numero,
            case p_tipo when 'bilhete'
              then 'O bilhete da viagem ' || p.numero || ' (' || coalesce(p.destino_principal, '—') || ') foi anexado'
                   || coalesce(' — localizador ' || nullif(upper(btrim(p_dados->>'localizador')), ''), '') || '. Abra o protocolo em Viagens para ver.'
              else 'O comprovante de pagamento das suas diárias da viagem ' || p.numero || ' foi anexado.' end,
            false, 'viagens.html', 'viagem_protocolos', p.id);
  end if;

  return jsonb_build_object('id', v_id, 'lancamento', v_lanc, 'passagens_brl', v_pass);
end $$;

revoke all on function public.fn_viagem_comp_pode(uuid, uuid) from public, anon;
grant execute on function public.fn_viagem_comp_pode(uuid, uuid) to authenticated;
revoke all on function public.fn_viagem_comp_criar_tarefa(text, text, date, uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.fn_viagem_comp_abrir_tarefas(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_trg_viagem_comp_unesco() from public, anon, authenticated;
revoke all on function public.fn_viagem_comp_conferir_tarefas(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_viagem_comprovante_salvar(uuid, text, jsonb, text, text, text, uuid) from public, anon;
grant execute on function public.fn_viagem_comprovante_salvar(uuid, text, jsonb, text, text, text, uuid) to authenticated;

-- protocolos já aprovados recebem as tarefas agora
do $$ declare r record; begin
  for r in select id, aprovado_por from public.viagem_protocolos where situacao = 'aprovado' loop
    perform public.fn_viagem_comp_abrir_tarefas(r.id, r.aprovado_por);
  end loop;
end $$;

notify pgrst, 'reload schema';
