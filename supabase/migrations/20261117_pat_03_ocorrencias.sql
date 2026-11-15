-- ════════════════════════════════════════════════════════════════════════════
-- PATRIMÔNIO · Fase 3 — ocorrências, sinistros e baixa (docs/patrimonio/plano.md §4)
-- ════════════════════════════════════════════════════════════════════════════
-- Ocorrência (OC-AAAA-NNNN): registrada pelo gestor ou por quem guarda o bem.
-- Extravio/furto/roubo ⇒ bem "extraviado"; furto/roubo exige nº do boletim de
-- ocorrência. Tarefa "Tratar ocorrência" para o gestor. Apuração e desfecho
-- (localizado, reparado, ressarcido, indenizado, arquivada) pelo gestor; o desfecho
-- "baixa" só vem da baixa aprovada.
-- Baixa (BX-AAAA-NNNN): pedido do gestor (justificativa ≥ 30), aprovado ou devolvido
-- COM SENHA por super_admin/coordenação que não pediu, pela Edge Function
-- `patrimonio-termo` (acao 'decidir_baixa') → fn_pat_baixa_decidir (só service_role;
-- hash do pedido + bem ao vivo). Aprovada ⇒ bem "baixado", dt_baixa = hoje (a
-- depreciação para), ocorrência ligada concluída.
-- Sem a palavra que remove linhas no texto (o apply_migration ficaria esperando).
-- ════════════════════════════════════════════════════════════════════════════

create sequence if not exists public.pat_ocorrencias_numero_seq;
create sequence if not exists public.pat_baixas_numero_seq;

create table if not exists public.pat_ocorrencias (
  id                 uuid primary key default gen_random_uuid(),
  numero             text not null unique,
  bem_id             uuid not null references public.pat_bens(id),
  tipo               text not null check (tipo in ('avaria','defeito','mau_uso','extravio','furto','roubo','sinistro')),
  dt_ocorrencia      date not null,
  onde               text,
  descricao          text not null,
  bo_numero          text,
  situacao           text not null default 'aberta' check (situacao in ('aberta','em_apuracao','concluida')),
  desfecho           text check (desfecho in ('localizado','reparado','ressarcido','indenizado','baixa','arquivada')),
  parecer            text,
  valor_brl          numeric(14,2) check (valor_brl is null or valor_brl >= 0),
  seguradora         text,
  sinistro_numero    text,
  situacao_bem_antes text not null,
  condicao_antes     text not null,
  registrado_por     uuid not null references public.usuarios(id),
  registrado_em      timestamptz not null default now(),
  apurado_por        uuid references public.usuarios(id),
  apurado_em         timestamptz,
  concluido_por      uuid references public.usuarios(id),
  concluido_em       timestamptz,
  tarefa_id          uuid references public.tarefas(id),
  check (tipo not in ('furto','roubo') or coalesce(btrim(bo_numero), '') <> '')
);
create index if not exists pat_ocorrencias_bem_ix on public.pat_ocorrencias (bem_id, situacao);

create table if not exists public.pat_baixas (
  id             uuid primary key default gen_random_uuid(),
  numero         text not null unique,
  bem_id         uuid not null references public.pat_bens(id),
  ocorrencia_id  uuid references public.pat_ocorrencias(id),
  motivo         text not null check (motivo in ('inservivel','sinistro_perda_total','furto_roubo','extravio_nao_localizado',
                                                 'obsolescencia','doacao','alienacao')),
  justificativa  text not null check (length(btrim(justificativa)) >= 30),
  destino        text,
  situacao       text not null default 'aguardando' check (situacao in ('aguardando','aprovada','devolvida','cancelada')),
  hash           text not null,
  pedido_por     uuid not null references public.usuarios(id),
  pedido_em      timestamptz not null default now(),
  decidido_por   uuid references public.usuarios(id),
  decidido_em    timestamptz,
  parecer        text,
  hash_decidido  text,
  decisao_ip     text,
  decisao_user_agent text,
  cancelado_em   timestamptz,
  tarefa_id      uuid references public.tarefas(id),
  check (motivo not in ('doacao','alienacao') or length(coalesce(btrim(destino), '')) >= 3)
);
create unique index if not exists pat_baixas_viva_uk on public.pat_baixas (bem_id) where situacao = 'aguardando';

alter table public.pat_documentos add column if not exists ocorrencia_id uuid references public.pat_ocorrencias(id);
alter table public.pat_documentos add column if not exists baixa_id uuid references public.pat_baixas(id);

-- só as funções alteram; números e autoria fixos
create or replace function public.fn_pat_trg_oc_guarda()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('dima.pat_evento', true), '') <> '1' then
    raise exception 'PAT_PROTEGIDO: ocorrência e baixa mudam só pelas funções do patrimônio';
  end if;
  if new.numero is distinct from old.numero or new.bem_id is distinct from old.bem_id then
    raise exception 'PAT_CAMPO_FIXO: número e bem não mudam';
  end if;
  return new;
end $$;
create or replace trigger trg_pat_oc_guarda before update on public.pat_ocorrencias
  for each row execute function public.fn_pat_trg_oc_guarda();
create or replace trigger trg_pat_bx_guarda before update on public.pat_baixas
  for each row execute function public.fn_pat_trg_oc_guarda();
create or replace trigger trg_audit_pat_ocorrencias after insert or update on public.pat_ocorrencias
  for each row execute function public.fn_trg_audit();
create or replace trigger trg_audit_pat_baixas after insert or update on public.pat_baixas
  for each row execute function public.fn_trg_audit();

-- ── Leitura ─────────────────────────────────────────────────────────────────
alter table public.pat_ocorrencias enable row level security;
alter table public.pat_baixas      enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pat_ocorrencias' and policyname = 'pat_ocorrencias_select') then
    create policy pat_ocorrencias_select on public.pat_ocorrencias for select to authenticated
      using (public.fn_pat_pode_ver() or registrado_por = auth.uid()
             or exists (select 1 from public.pat_bens b where b.id = bem_id and b.responsavel_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pat_baixas' and policyname = 'pat_baixas_select') then
    create policy pat_baixas_select on public.pat_baixas for select to authenticated using (public.fn_pat_pode_ver());
  end if;
end $$;
revoke all on public.pat_ocorrencias, public.pat_baixas from anon, authenticated;
grant select on public.pat_ocorrencias, public.pat_baixas to authenticated;
revoke all on sequence public.pat_ocorrencias_numero_seq, public.pat_baixas_numero_seq from anon, authenticated;

-- quem pode registrar ocorrência de um bem: gestor ou quem guarda
create or replace function public.fn_pat_pode_registrar_ocorrencia(p_bem uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.fn_pat_pode_gerir()
      or exists (select 1 from pat_bens b join usuarios u on u.id = b.responsavel_id and u.ativo
                  where b.id = p_bem and b.responsavel_id = auth.uid())
$$;

-- ── Registrar ocorrência ────────────────────────────────────────────────────
-- p = { bem_id, tipo, dt_ocorrencia, onde?, descricao, bo_numero?, condicao? }
create or replace function public.fn_pat_ocorrencia_registrar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); b pat_bens%rowtype; v_id uuid; v_num text; v_tipo text := p->>'tipo';
  v_dt date := nullif(p->>'dt_ocorrencia', '')::date; v_cond text := nullif(p->>'condicao', ''); v_sit text; v_tar uuid;
  v_gestor uuid;
begin
  select * into b from pat_bens where id = nullif(p->>'bem_id', '')::uuid for update;
  if b.id is null then raise exception 'PAT_DADOS: bem não encontrado'; end if;
  if v_uid is null or not public.fn_pat_pode_registrar_ocorrencia(b.id) then
    raise exception 'PAT_SEM_PERMISSAO: ocorrência é registrada pelo gestor patrimonial ou por quem guarda o bem';
  end if;
  if b.situacao in ('anulado','baixado','transferido') then raise exception 'PAT_ENCERRADO: bem fora do patrimônio ativo'; end if;
  if v_tipo not in ('avaria','defeito','mau_uso','extravio','furto','roubo','sinistro') then raise exception 'PAT_DADOS: tipo de ocorrência inválido'; end if;
  if v_dt is null or v_dt > current_date or v_dt < b.dt_aquisicao then raise exception 'PAT_DADOS: data da ocorrência inválida'; end if;
  if length(coalesce(btrim(p->>'descricao'), '')) < 20 then raise exception 'PAT_DADOS: descreva o que aconteceu com ao menos 20 caracteres'; end if;
  if v_tipo in ('furto','roubo') and coalesce(btrim(p->>'bo_numero'), '') = '' then
    raise exception 'PAT_BO: furto ou roubo exige o número do boletim de ocorrência';
  end if;
  if v_tipo in ('extravio','furto','roubo') and b.situacao = 'extraviado' then raise exception 'PAT_SITUACAO: o bem já está extraviado'; end if;
  if exists (select 1 from pat_ocorrencias where bem_id = b.id and situacao <> 'concluida' and tipo = v_tipo) then
    raise exception 'PAT_DADOS: já há ocorrência deste tipo aberta para o bem';
  end if;
  if v_cond is not null then
    if v_cond not in ('bom','regular','ruim','inservivel') then raise exception 'PAT_DADOS: condição inválida'; end if;
  end if;
  if public.fn_pat_bem_em_termo(b.id) is not null and v_tipo in ('extravio','furto','roubo') then
    raise exception 'PAT_TERMO_PENDENTE: cancele o termo pendente do bem antes';
  end if;

  v_num := 'OC-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.pat_ocorrencias_numero_seq')::text, 4, '0');
  v_sit := case when v_tipo in ('extravio','furto','roubo') then 'extraviado' else b.situacao end;
  perform set_config('dima.pat_evento', '1', true);
  insert into pat_ocorrencias (numero, bem_id, tipo, dt_ocorrencia, onde, descricao, bo_numero, situacao_bem_antes, condicao_antes, registrado_por)
  values (v_num, b.id, v_tipo, v_dt, nullif(btrim(p->>'onde'), ''), btrim(p->>'descricao'), nullif(btrim(p->>'bo_numero'), ''),
          b.situacao, b.condicao, v_uid)
  returning id into v_id;
  update pat_bens set situacao = v_sit, condicao = coalesce(v_cond, condicao) where id = b.id;
  insert into pat_eventos (bem_id, tipo, dt_evento, condicao_de, condicao_para, detalhes, observacao, registrado_por)
  values (b.id, 'ocorrencia', v_dt, b.condicao, coalesce(v_cond, b.condicao),
          jsonb_build_object('ocorrencia_id', v_id, 'ocorrencia', v_num, 'tipo', v_tipo, 'situacao_antes', b.situacao,
                             'situacao_depois', v_sit, 'bo', nullif(btrim(p->>'bo_numero'), '')),
          btrim(p->>'descricao'), v_uid);
  v_gestor := public.fn_pat_gestor_padrao();
  v_tar := public.fn_pat_criar_tarefa('Tratar ocorrência ' || v_num || ' — ' || b.numero,
    'Ocorrência de ' || replace(v_tipo, '_', ' ') || ' registrada para ' || b.numero || ' (' || b.descricao || '). Apure, anexe os documentos '
      || '(boletim, laudo, fotos) e registre o desfecho em Patrimônio › Ocorrências. A tarefa é concluída quando a ocorrência for concluída.',
    v_gestor, v_uid, current_date + 30, 'pat_ocorrencia', v_id, case when v_tipo in ('furto','roubo','sinistro','extravio') then 'alta' else 'media' end);
  update pat_ocorrencias set tarefa_id = v_tar where id = v_id;
  perform set_config('dima.pat_evento', '', true);
  return jsonb_build_object('ocorrencia_id', v_id, 'numero', v_num);
end $$;

-- ── Apuração e desfecho ─────────────────────────────────────────────────────
create or replace function public.fn_pat_ocorrencia_apurar(p_oc uuid, p_parecer text)
returns void language plpgsql security definer set search_path = public as $$
declare o pat_ocorrencias%rowtype;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  select * into o from pat_ocorrencias where id = p_oc for update;
  if o.id is null then raise exception 'PAT_DADOS: ocorrência não encontrada'; end if;
  if o.situacao <> 'aberta' then raise exception 'PAT_DADOS: a ocorrência não está aberta'; end if;
  perform set_config('dima.pat_evento', '1', true);
  update pat_ocorrencias set situacao = 'em_apuracao', apurado_por = auth.uid(), apurado_em = now(),
         parecer = coalesce(nullif(btrim(p_parecer), ''), parecer) where id = o.id;
  perform set_config('dima.pat_evento', '', true);
end $$;

-- p = { desfecho, parecer, condicao?, valor_brl?, seguradora?, sinistro_numero? }
create or replace function public.fn_pat_ocorrencia_concluir(p_oc uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare o pat_ocorrencias%rowtype; b pat_bens%rowtype; v_d text := p->>'desfecho'; v_cond text := nullif(p->>'condicao', '');
        v_volta text; v_val numeric := nullif(p->>'valor_brl', '')::numeric; v_perda boolean;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  select * into o from pat_ocorrencias where id = p_oc for update;
  if o.id is null then raise exception 'PAT_DADOS: ocorrência não encontrada'; end if;
  if o.situacao = 'concluida' then raise exception 'PAT_DADOS: ocorrência já concluída'; end if;
  select * into b from pat_bens where id = o.bem_id for update;
  v_perda := o.tipo in ('extravio','furto','roubo');
  if v_d = 'baixa' then raise exception 'PAT_DADOS: o desfecho "baixa" vem da aprovação do pedido de baixa'; end if;
  if v_d not in ('localizado','reparado','ressarcido','indenizado','arquivada') then raise exception 'PAT_DADOS: desfecho inválido'; end if;
  if v_d = 'localizado' and not v_perda then raise exception 'PAT_DADOS: "localizado" é só para extravio, furto ou roubo'; end if;
  if v_d = 'reparado' and v_perda then raise exception 'PAT_DADOS: bem extraviado não se repara — registre "localizado" ou peça a baixa'; end if;
  if v_perda and v_d <> 'localizado' and b.situacao = 'extraviado' then
    raise exception 'PAT_DADOS: o bem segue extraviado: registre "localizado" ou peça a baixa (o ressarcimento entra no pedido de baixa)';
  end if;
  if length(coalesce(btrim(p->>'parecer'), '')) < 20 then raise exception 'PAT_DADOS: escreva o parecer da apuração (ao menos 20 caracteres)'; end if;
  if v_d in ('ressarcido','indenizado') and (v_val is null or v_val <= 0) then raise exception 'PAT_DADOS: informe o valor recebido'; end if;
  if v_d = 'indenizado' and length(coalesce(btrim(p->>'seguradora'), '')) < 3 then raise exception 'PAT_DADOS: informe a seguradora'; end if;
  if v_cond is not null and v_cond not in ('bom','regular','ruim','inservivel') then raise exception 'PAT_DADOS: condição inválida'; end if;

  perform set_config('dima.pat_evento', '1', true);
  if v_d = 'localizado' then
    v_volta := case when o.situacao_bem_antes in ('em_estoque','em_uso','emprestado','em_manutencao') then o.situacao_bem_antes else 'em_estoque' end;
    if v_volta in ('em_uso','emprestado') and b.responsavel_id is null then v_volta := 'em_estoque'; end if;
    update pat_bens set situacao = v_volta, condicao = coalesce(v_cond, condicao) where id = b.id;
  elsif v_cond is not null then
    update pat_bens set condicao = v_cond where id = b.id;
  end if;
  update pat_ocorrencias set situacao = 'concluida', desfecho = v_d, parecer = btrim(p->>'parecer'), valor_brl = v_val,
         seguradora = nullif(btrim(p->>'seguradora'), ''), sinistro_numero = nullif(btrim(p->>'sinistro_numero'), ''),
         concluido_por = auth.uid(), concluido_em = now() where id = o.id;
  insert into pat_eventos (bem_id, tipo, condicao_de, condicao_para, detalhes, observacao, registrado_por)
  values (b.id, 'ocorrencia', b.condicao, coalesce(v_cond, b.condicao),
          jsonb_build_object('ocorrencia_id', o.id, 'ocorrencia', o.numero, 'tipo', o.tipo, 'desfecho', v_d, 'valor_brl', v_val,
                             'situacao_antes', b.situacao, 'situacao_depois', coalesce(v_volta, b.situacao)),
          btrim(p->>'parecer'), auth.uid());
  perform fn_lic_fechar_tarefa(o.tarefa_id, 'concluida', auth.uid(), 'Ocorrência ' || o.numero || ' concluída: ' || v_d || '.');
  perform set_config('dima.pat_evento', '', true);
end $$;

-- ── Baixa ───────────────────────────────────────────────────────────────────
create or replace function public.fn_pat_baixa_hash(p_baixa uuid)
returns text language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'numero', x.numero, 'motivo', x.motivo, 'justificativa', x.justificativa, 'destino', x.destino, 'ocorrencia', x.ocorrencia_id,
    'bem', b.id, 'bem_numero', b.numero, 'descricao', b.descricao, 'serie', b.numero_serie, 'situacao', b.situacao,
    'condicao', b.condicao, 'valor', b.valor_aquisicao_brl,
    'docs', (select jsonb_agg(d.url order by d.enviado_em) from pat_documentos d where d.baixa_id = x.id and d.ativo)
  )::text, 'UTF8')), 'hex')
  from pat_baixas x join pat_bens b on b.id = x.bem_id where x.id = p_baixa
$$;

-- quem aprova: titular da coordenação, senão outro super_admin/coordenação ativo (nunca quem pediu)
create or replace function public.fn_pat_baixa_aprovador(p_pedido_por uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select x.usuario_id from rem_cargo_titulares x join usuarios u on u.id = x.usuario_id and u.ativo
      where x.cargo = 'coordenacao_solicitante' and x.vigencia_fim is null and x.usuario_id <> p_pedido_por limit 1),
    (select id from usuarios where ativo and perfil = 'super_admin' and id <> p_pedido_por order by criado_em limit 1),
    (select id from usuarios where ativo and perfil = 'coordenacao' and id <> p_pedido_por order by criado_em limit 1))
$$;

-- p = { bem_id, motivo, justificativa, destino?, ocorrencia_id? }
create or replace function public.fn_pat_baixa_pedir(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); b pat_bens%rowtype; o pat_ocorrencias%rowtype; v_m text := p->>'motivo'; v_id uuid; v_num text;
        v_aprov uuid; v_tar uuid;
begin
  if v_uid is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO: baixa é pedida pelo gestor patrimonial ou pela coordenação'; end if;
  select * into b from pat_bens where id = nullif(p->>'bem_id', '')::uuid for update;
  if b.id is null then raise exception 'PAT_DADOS: bem não encontrado'; end if;
  if b.situacao not in ('em_estoque','extraviado') then
    raise exception 'PAT_SITUACAO: só bem em estoque (devolvido) ou extraviado vai para baixa — % está "%"', b.numero, b.situacao;
  end if;
  if exists (select 1 from pat_baixas where bem_id = b.id and situacao = 'aguardando') then raise exception 'PAT_DADOS: já há pedido de baixa aguardando para este bem'; end if;
  if v_m not in ('inservivel','sinistro_perda_total','furto_roubo','extravio_nao_localizado','obsolescencia','doacao','alienacao') then raise exception 'PAT_DADOS: motivo inválido'; end if;
  if nullif(p->>'ocorrencia_id', '') is not null then
    select * into o from pat_ocorrencias where id = (p->>'ocorrencia_id')::uuid;
    if o.id is null or o.bem_id <> b.id then raise exception 'PAT_DADOS: a ocorrência não é deste bem'; end if;
    if o.situacao = 'concluida' then raise exception 'PAT_DADOS: a ocorrência já foi concluída'; end if;
  end if;
  if v_m in ('furto_roubo','extravio_nao_localizado') then
    if b.situacao <> 'extraviado' or o.id is null or o.tipo not in ('extravio','furto','roubo') then
      raise exception 'PAT_DADOS: baixa por extravio, furto ou roubo exige o bem extraviado e a ocorrência ligada';
    end if;
  elsif b.situacao = 'extraviado' then
    raise exception 'PAT_DADOS: bem extraviado só vai para baixa por extravio, furto ou roubo';
  end if;
  if v_m = 'sinistro_perda_total' and (o.id is null or o.tipo <> 'sinistro') then raise exception 'PAT_DADOS: perda total por sinistro exige a ocorrência de sinistro'; end if;
  if length(coalesce(btrim(p->>'justificativa'), '')) < 30 then raise exception 'PAT_DADOS: justifique a baixa com ao menos 30 caracteres'; end if;
  if v_m in ('doacao','alienacao') and length(coalesce(btrim(p->>'destino'), '')) < 3 then raise exception 'PAT_DADOS: diga para quem o bem vai'; end if;
  v_aprov := public.fn_pat_baixa_aprovador(v_uid);
  if v_aprov is null then raise exception 'PAT_SEM_APROVADOR: não há outra pessoa da coordenação ou super_admin ativa para aprovar'; end if;

  v_num := 'BX-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.pat_baixas_numero_seq')::text, 4, '0');
  perform set_config('dima.pat_evento', '1', true);
  insert into pat_baixas (numero, bem_id, ocorrencia_id, motivo, justificativa, destino, hash, pedido_por)
  values (v_num, b.id, o.id, v_m, btrim(p->>'justificativa'), nullif(btrim(p->>'destino'), ''), '-', v_uid) returning id into v_id;
  update pat_baixas set hash = public.fn_pat_baixa_hash(v_id) where id = v_id;
  v_tar := public.fn_pat_criar_tarefa('Aprovar baixa ' || v_num || ' — ' || b.numero,
    'Pedido de baixa de ' || b.numero || ' (' || b.descricao || '). Leia a justificativa e os documentos em Patrimônio › Ocorrências e baixas '
      || 'e aprove ou devolva com a sua senha. Quem pediu não aprova.',
    v_aprov, v_uid, current_date + 10, 'pat_baixa', v_id);
  update pat_baixas set tarefa_id = v_tar where id = v_id;
  perform set_config('dima.pat_evento', '', true);
  return jsonb_build_object('baixa_id', v_id, 'numero', v_num);
end $$;

create or replace function public.fn_pat_baixa_cancelar(p_baixa uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare x pat_baixas%rowtype;
begin
  select * into x from pat_baixas where id = p_baixa for update;
  if x.id is null then raise exception 'PAT_DADOS: pedido não encontrado'; end if;
  if auth.uid() is null or not (auth.uid() = x.pedido_por or public.fn_pat_pode_coordenar()) then raise exception 'PAT_SEM_PERMISSAO'; end if;
  if x.situacao <> 'aguardando' then raise exception 'PAT_DADOS: só pedido aguardando se cancela'; end if;
  if length(coalesce(btrim(p_motivo), '')) < 10 then raise exception 'PAT_DADOS: explique o cancelamento com ao menos 10 caracteres'; end if;
  perform set_config('dima.pat_evento', '1', true);
  update pat_baixas set situacao = 'cancelada', cancelado_em = now(), parecer = btrim(p_motivo) where id = x.id;
  perform fn_lic_fechar_tarefa(x.tarefa_id, 'cancelada', auth.uid(), 'Pedido de baixa ' || x.numero || ' cancelado: ' || btrim(p_motivo));
  perform set_config('dima.pat_evento', '', true);
end $$;

-- só service_role (Edge Function patrimonio-termo, acao 'decidir_baixa', depois da senha)
create or replace function public.fn_pat_baixa_decidir(p_usuario_id uuid, p_baixa uuid, p_decisao text, p_parecer text,
  p_hash text, p_ip text default null, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x pat_baixas%rowtype; b pat_bens%rowtype; v_hash text; o pat_ocorrencias%rowtype;
begin
  select * into x from pat_baixas where id = p_baixa for update;
  if x.id is null then raise exception 'PAT_DADOS: pedido não encontrado'; end if;
  if x.situacao <> 'aguardando' then raise exception 'PAT_DADOS: o pedido já foi %', x.situacao; end if;
  if not exists (select 1 from usuarios where id = p_usuario_id and ativo and perfil in ('super_admin','coordenacao')) then
    raise exception 'PAT_SEM_PERMISSAO: baixa é aprovada pela coordenação ou pelo super_admin';
  end if;
  if p_usuario_id = x.pedido_por then raise exception 'PAT_SEGREGACAO: quem pediu a baixa não aprova'; end if;
  if p_decisao not in ('aprovar','devolver') then raise exception 'PAT_DADOS: decisão inválida'; end if;
  v_hash := public.fn_pat_baixa_hash(x.id);
  if p_hash is distinct from v_hash then raise exception 'DOCUMENTO_ALTERADO: o pedido ou o bem mudaram desde que você abriu. Abra de novo.'; end if;

  perform set_config('dima.pat_evento', '1', true);
  if p_decisao = 'devolver' then
    if length(coalesce(btrim(p_parecer), '')) < 10 then raise exception 'PAT_DADOS: diga por que devolve (ao menos 10 caracteres)'; end if;
    update pat_baixas set situacao = 'devolvida', decidido_por = p_usuario_id, decidido_em = now(), parecer = btrim(p_parecer),
           hash_decidido = v_hash, decisao_ip = p_ip, decisao_user_agent = p_user_agent where id = x.id;
    perform fn_lic_fechar_tarefa(x.tarefa_id, 'concluida', p_usuario_id, 'Baixa ' || x.numero || ' devolvida: ' || btrim(p_parecer));
    perform public.fn_pat_criar_tarefa('Baixa ' || x.numero || ' devolvida — rever o pedido',
      'O pedido de baixa foi devolvido. Parecer: ' || btrim(p_parecer) || '. O bem segue no patrimônio; ajuste e faça um pedido novo, se for o caso.',
      x.pedido_por, p_usuario_id, current_date + 10, 'pat_baixa', x.id, 'media');
    perform set_config('dima.pat_evento', '', true);
    return jsonb_build_object('baixa', x.numero, 'situacao', 'devolvida');
  end if;

  select * into b from pat_bens where id = x.bem_id for update;
  update pat_bens set situacao = 'baixado', dt_baixa = current_date, responsavel_id = null where id = b.id;
  insert into pat_eventos (bem_id, tipo, responsavel_de, detalhes, observacao, registrado_por)
  values (b.id, 'baixa', b.responsavel_id, jsonb_build_object('baixa_id', x.id, 'baixa', x.numero, 'motivo', x.motivo, 'destino', x.destino,
          'situacao_antes', b.situacao, 'pedido_por', x.pedido_por), x.justificativa, p_usuario_id);
  update pat_baixas set situacao = 'aprovada', decidido_por = p_usuario_id, decidido_em = now(), parecer = nullif(btrim(p_parecer), ''),
         hash_decidido = v_hash, decisao_ip = p_ip, decisao_user_agent = p_user_agent where id = x.id;
  if x.ocorrencia_id is not null then
    select * into o from pat_ocorrencias where id = x.ocorrencia_id for update;
    if o.situacao <> 'concluida' then
      update pat_ocorrencias set situacao = 'concluida', desfecho = 'baixa', concluido_por = p_usuario_id, concluido_em = now(),
             parecer = coalesce(parecer, 'Baixa ' || x.numero || ' aprovada.') where id = o.id;
      perform fn_lic_fechar_tarefa(o.tarefa_id, 'concluida', p_usuario_id, 'Ocorrência concluída pela baixa ' || x.numero || '.');
    end if;
  end if;
  perform fn_lic_fechar_tarefa(x.tarefa_id, 'concluida', p_usuario_id, 'Baixa ' || x.numero || ' aprovada com senha.');
  perform set_config('dima.pat_evento', '', true);
  return jsonb_build_object('baixa', x.numero, 'situacao', 'aprovada');
end $$;

create or replace function public.fn_pat_baixa_detalhe(p_baixa uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', x.id, 'numero', x.numero, 'motivo', x.motivo, 'justificativa', x.justificativa, 'destino', x.destino,
    'situacao', x.situacao, 'pedido_por', x.pedido_por, 'pedido_por_nome', up.nome_completo, 'pedido_em', x.pedido_em,
    'decidido_por_nome', ud.nome_completo, 'decidido_em', x.decidido_em, 'parecer', x.parecer, 'hash_decidido', x.hash_decidido,
    'ocorrencia', o.numero, 'ocorrencia_id', o.id,
    'hash', case when x.situacao = 'aguardando' then public.fn_pat_baixa_hash(x.id) else x.hash_decidido end,
    'pode_decidir', x.situacao = 'aguardando' and x.pedido_por <> auth.uid() and public.fn_pat_pode_coordenar(),
    'bem', jsonb_build_object('id', b.id, 'numero', b.numero, 'descricao', b.descricao, 'serie', b.numero_serie, 'situacao', b.situacao,
           'condicao', b.condicao, 'local', l.nome),
    'docs', (select jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo, 'url', d.url, 'nome', d.nome) order by d.enviado_em)
               from pat_documentos d where d.baixa_id = x.id and d.ativo))
  from pat_baixas x join pat_bens b on b.id = x.bem_id join usuarios up on up.id = x.pedido_por
  left join usuarios ud on ud.id = x.decidido_por left join pat_ocorrencias o on o.id = x.ocorrencia_id
  left join pat_locais l on l.id = b.local_id
  where x.id = p_baixa and auth.uid() is not null and public.fn_pat_pode_ver()
$$;

-- ── Documentos de ocorrência e de baixa (bens/<bem_id>/…) ───────────────────
create or replace function public.fn_pat_anexar_vinculo(p_tipo text, p_url text, p_nome text, p_tamanho bigint,
  p_ocorrencia uuid, p_baixa uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_bem uuid; v_id uuid; v_ok boolean := false;
begin
  if auth.uid() is null then raise exception 'PAT_SEM_PERMISSAO'; end if;
  if (p_ocorrencia is null) = (p_baixa is null) then raise exception 'PAT_DADOS: ligue o arquivo a uma ocorrência ou a uma baixa'; end if;
  if p_ocorrencia is not null then
    select bem_id, (public.fn_pat_pode_gerir() or registrado_por = auth.uid() or public.fn_pat_pode_registrar_ocorrencia(bem_id)) and situacao <> 'concluida'
      into v_bem, v_ok from pat_ocorrencias where id = p_ocorrencia;
  else
    select bem_id, public.fn_pat_pode_gerir() and situacao = 'aguardando' into v_bem, v_ok from pat_baixas where id = p_baixa;
  end if;
  if v_bem is null then raise exception 'PAT_DADOS: registro não encontrado'; end if;
  if not coalesce(v_ok, false) then raise exception 'PAT_SEM_PERMISSAO: arquivo só enquanto a ocorrência está aberta (ou o pedido de baixa aguarda)'; end if;
  if p_tipo not in ('foto','laudo','bo','termo','outro') then raise exception 'PAT_DADOS: tipo de documento inválido'; end if;
  if not public.fn_pat_arquivo_existe(p_url, 'bens/' || v_bem || '/') then raise exception 'PAT_ARQUIVO: arquivo não encontrado no armazenamento'; end if;
  insert into pat_documentos (bem_id, tipo, url, nome, tamanho, enviado_por, ocorrencia_id, baixa_id)
  values (v_bem, p_tipo, p_url, left(coalesce(nullif(btrim(p_nome), ''), 'arquivo'), 200), p_tamanho, auth.uid(), p_ocorrencia, p_baixa)
  returning id into v_id;
  return v_id;
end $$;

-- quem guarda o bem também envia arquivo da pasta do próprio bem (foto/BO da ocorrência)
create or replace function public.fn_pat_doc_pode_enviar(p_nome text)
returns boolean language sql stable security definer set search_path = public as $$
  select split_part(p_nome, '/', 1) in ('bens','incorporacoes')
     and (public.fn_pat_pode_gerir()
          or (split_part(p_nome, '/', 1) = 'bens'
              and exists (select 1 from pat_bens b where b.id::text = split_part(p_nome, '/', 2) and b.responsavel_id = auth.uid())))
$$;
alter policy patrimonio_docs_enviar on storage.objects to authenticated
  with check (bucket_id = 'patrimonio-docs' and public.fn_pat_doc_pode_enviar(name));

-- ── View: ocorrência aberta e baixa pendente (colunas no fim) ───────────────
create or replace view public.vw_pat_bens with (security_invoker = true) as
select b.id, b.numero, b.numero_unesco, b.numero_sema, b.categoria_codigo, c.nome as categoria_nome,
       c.controle, c.icone as categoria_icone, b.descricao, b.marca, b.modelo, b.numero_serie, b.especificacao,
       b.quantidade, b.unidade, b.incorporacao_id, b.origem, b.contrato_produto_id, b.contrato_id,
       ct.numero as contrato_numero, b.fornecedor_id, f.nome as fornecedor_nome,
       b.atividade_id, a.codigo as atividade_codigo, b.tdr_id, t.numero as tdr_numero,
       b.dt_aquisicao, b.dt_inicio_uso, b.garantia_ate, b.garantia_obs, b.titularidade,
       b.situacao, b.condicao, b.local_id, l.nome as local_nome, b.responsavel_id,
       r.nome_completo as responsavel_nome, b.ultimo_inventario_em, b.dt_baixa, b.observacoes,
       b.criado_por, b.criado_em, b.atualizado_em,
       case when v.ok then (i.nf_url is null and b.origem = 'compra_projeto') end as nf_pendente,
       case when v.ok then i.nf_numero end as nf_numero,
       case when v.ok then i.nf_data end as nf_data,
       case when v.ok then i.nf_url end as nf_url,
       case when v.ok then i.nf_nome end as nf_nome,
       case when v.ok then b.valor_aquisicao_brl end as valor_aquisicao_brl,
       case when v.ok then b.vida_util_meses end as vida_util_meses,
       case when v.ok then b.residual_pct end as residual_pct,
       case when v.ok then d.meses end as meses_depreciados,
       case when v.ok then d.cota_mensal end as cota_mensal_brl,
       case when v.ok then d.depreciacao_acumulada end as depreciacao_acumulada_brl,
       case when v.ok then d.valor_contabil end as valor_contabil_brl,
       case when v.ok then d.valor_residual end as valor_residual_brl,
       case when v.ok then (d.meses >= b.vida_util_meses) end as totalmente_depreciado,
       case when v.ok then x.cotacao end as cotacao,
       case when v.ok then x.origem end as cotacao_origem,
       case when v.ok and x.cotacao > 0 then round(b.valor_aquisicao_brl / x.cotacao, 2) end as valor_aquisicao_usd,
       case when v.ok and x.cotacao > 0 then round(d.valor_contabil / x.cotacao, 2) end as valor_contabil_usd,
       (select count(*) from pat_documentos dc where dc.bem_id = b.id and dc.ativo and dc.tipo = 'foto')::int as n_fotos,
       (select dc.url from pat_documentos dc where dc.bem_id = b.id and dc.ativo and dc.tipo = 'foto'
         order by dc.enviado_em limit 1) as foto_url,
       public.fn_pat_bem_em_termo(b.id) as termo_pendente,
       (select tt.devolver_ate from pat_termo_itens ti join pat_termos tt on tt.id = ti.termo_id
         where ti.bem_id = b.id and tt.tipo = 'emprestimo' and tt.situacao = 'aceito' and tt.devolvido_em is null
           and b.situacao = 'emprestado' order by tt.decidido_em desc limit 1) as devolver_ate,
       (select tt.numero from pat_termo_itens ti join pat_termos tt on tt.id = ti.termo_id
         where ti.bem_id = b.id and tt.situacao = 'aceito' and b.responsavel_id = tt.responsavel_id
         order by tt.decidido_em desc limit 1) as termo_vigente,
       (select oc.numero from pat_ocorrencias oc where oc.bem_id = b.id and oc.situacao <> 'concluida'
         order by oc.registrado_em desc limit 1) as ocorrencia_aberta,
       (select bx.numero from pat_baixas bx where bx.bem_id = b.id and bx.situacao = 'aguardando' limit 1) as baixa_pendente
  from pat_bens b
  join pat_categorias c on c.codigo = b.categoria_codigo
  left join pat_incorporacoes i on i.id = b.incorporacao_id
  left join pat_locais l on l.id = b.local_id
  left join usuarios r on r.id = b.responsavel_id
  left join contratos ct on ct.id = b.contrato_id
  left join fornecedores f on f.id = b.fornecedor_id
  left join atividades a on a.id = b.atividade_id
  left join tdrs t on t.id = b.tdr_id
  cross join lateral (select public.fn_pat_pode_ver_valor() as ok) v
  cross join lateral public.fn_pat_depreciacao(b.valor_aquisicao_brl, b.residual_pct, b.vida_util_meses,
                                               b.dt_inicio_uso, current_date, b.dt_baixa) d
  cross join lateral public.fn_pat_cotacao_bem(b.id) x;
revoke all on public.vw_pat_bens from anon, authenticated;
grant select on public.vw_pat_bens to authenticated;

-- ── Permissões ──────────────────────────────────────────────────────────────
revoke execute on function public.fn_pat_pode_registrar_ocorrencia(uuid), public.fn_pat_ocorrencia_registrar(jsonb),
  public.fn_pat_ocorrencia_apurar(uuid, text), public.fn_pat_ocorrencia_concluir(uuid, jsonb), public.fn_pat_baixa_hash(uuid),
  public.fn_pat_baixa_aprovador(uuid), public.fn_pat_baixa_pedir(jsonb), public.fn_pat_baixa_cancelar(uuid, text),
  public.fn_pat_baixa_decidir(uuid, uuid, text, text, text, text, text), public.fn_pat_baixa_detalhe(uuid),
  public.fn_pat_anexar_vinculo(text, text, text, bigint, uuid, uuid), public.fn_pat_doc_pode_enviar(text)
  from public, anon;
grant execute on function public.fn_pat_pode_registrar_ocorrencia(uuid), public.fn_pat_ocorrencia_registrar(jsonb),
  public.fn_pat_ocorrencia_apurar(uuid, text), public.fn_pat_ocorrencia_concluir(uuid, jsonb), public.fn_pat_baixa_pedir(jsonb),
  public.fn_pat_baixa_cancelar(uuid, text), public.fn_pat_baixa_detalhe(uuid), public.fn_pat_anexar_vinculo(text, text, text, bigint, uuid, uuid),
  public.fn_pat_doc_pode_enviar(text)
  to authenticated;
revoke execute on function public.fn_pat_baixa_hash(uuid), public.fn_pat_baixa_aprovador(uuid),
  public.fn_pat_baixa_decidir(uuid, uuid, text, text, text, text, text) from authenticated;
grant execute on function public.fn_pat_baixa_decidir(uuid, uuid, text, text, text, text, text) to service_role;
revoke execute on function public.fn_pat_trg_oc_guarda() from public, anon, authenticated;
