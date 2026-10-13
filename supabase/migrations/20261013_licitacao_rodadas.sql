-- ════════════════════════════════════════════════════════════════════════
-- Licitação do TDR em rodadas: edital, prazo com prorrogação, lista curta e resultado
--
-- Cada envio para licitação (ou contratação direta) é uma RODADA:
--   tdr_licitacao_rodadas      modalidade, processo, abertura, link do edital, fundamento
--                              (dispensa/inexigibilidade), prazo atual, situação e resultado
--   tdr_licitacao_prorrogacoes prazo anterior → novo, motivo, aviso (só inclusão)
--   tdr_licitacao_empresas     lista curta (empresa, contato, telefone, e-mail) e quem
--                              apresentou proposta — SEM valores. Dado pessoal: TRAT-003.
-- Situação: aberta → com_propostas | deserta | fracassada | sem_proposta (inexigibilidade)
--           | cancelada (TDR cancelado). Deserta/fracassada/sem proposta ⇒ tarefa
--           "definir medida": relançar (fn_lic_relancar, nova rodada) ou pedir cancelamento.
-- Regras por modalidade (fn_lic_classe): edital obrigatório em pregão/concorrência;
-- prazo obrigatório salvo dispensa (opcional) e inexigibilidade (não tem); dispensa exige
-- fundamento; inexigibilidade exige fundamento + justificativa e exatamente uma empresa.
-- Quem opera: super_admin/coordenação ativos ou responsável/substituto ativo da atividade
-- (fn_lic_pode). Escrita só pelas funções (sem policy/grant de escrita).
-- Prazos: rotina horária (cron 'licitacao-prazos') avisa 2 dias antes e cria a tarefa
-- "registrar resultado" no vencimento; sem prazo, a tarefa nasce no envio (15 dias).
-- Os campos do TDR (modalidade_licitacao, numero_processo, dt_licitacao) espelham a rodada
-- vigente; tdr_licitacoes segue como histórico das rodadas sem êxito (cadeia de cancelamento).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.tdr_licitacao_rodadas (
  id                  uuid primary key default gen_random_uuid(),
  tdr_id              uuid not null references public.tdrs(id),
  rodada              integer not null,
  modalidade          text not null,
  fundamento_tipo     text check (fundamento_tipo is null or fundamento_tipo in ('exclusivo','notoria','outro')),
  fundamento          text,
  justificativa       text,
  numero_processo     text,
  dt_abertura         date,
  edital_url          text check (edital_url is null or edital_url ~* '^https?://'),
  prazo_original      timestamptz,
  prazo_em            timestamptz,
  situacao            text not null default 'aberta'
                        check (situacao in ('aberta','com_propostas','deserta','fracassada','sem_proposta','cancelada')),
  n_propostas         integer check (n_propostas is null or n_propostas >= 0),
  resultado_obs       text,
  resultado_em        timestamptz,
  resultado_por       uuid references public.usuarios(id),
  medida              text check (medida is null or medida in ('relancada','cancelamento','contratado')),
  medida_motivo       text,
  medida_em           timestamptz,
  medida_por          uuid references public.usuarios(id),
  aviso_2d_em         timestamptz,
  tarefa_resultado_id uuid references public.tarefas(id),
  tarefa_medida_id    uuid references public.tarefas(id),
  aberta_por          uuid references public.usuarios(id),
  criado_em           timestamptz not null default now(),
  unique (tdr_id, rodada)
);
create unique index if not exists uq_lic_rodada_aberta on public.tdr_licitacao_rodadas(tdr_id) where situacao = 'aberta';

create table if not exists public.tdr_licitacao_prorrogacoes (
  id             uuid primary key default gen_random_uuid(),
  rodada_id      uuid not null references public.tdr_licitacao_rodadas(id),
  prazo_anterior timestamptz,
  prazo_novo     timestamptz not null,
  motivo         text not null check (length(btrim(motivo)) >= 10),
  aviso_url      text check (aviso_url is null or aviso_url ~* '^https?://'),
  registrado_por uuid references public.usuarios(id),
  criado_em      timestamptz not null default now()
);
create index if not exists idx_lic_prorr_rodada on public.tdr_licitacao_prorrogacoes(rodada_id);

create table if not exists public.tdr_licitacao_empresas (
  id                  uuid primary key default gen_random_uuid(),
  rodada_id           uuid not null references public.tdr_licitacao_rodadas(id),
  fornecedor_id       uuid references public.fornecedores(id),
  empresa             text not null check (length(btrim(empresa)) >= 2),
  contato             text,
  telefone            text,
  email               text,
  convidada           boolean not null default true,
  apresentou_proposta boolean not null default false,
  ativo               boolean not null default true,
  criado_por          uuid references public.usuarios(id),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index if not exists idx_lic_emp_rodada on public.tdr_licitacao_empresas(rodada_id);

alter table public.tdr_licitacao_rodadas      enable row level security;
alter table public.tdr_licitacao_prorrogacoes enable row level security;
alter table public.tdr_licitacao_empresas     enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tdr_licitacao_rodadas' and policyname='lic_rod_select') then
    create policy lic_rod_select on public.tdr_licitacao_rodadas for select to authenticated
      using (exists (select 1 from public.tdrs t where t.id = tdr_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tdr_licitacao_prorrogacoes' and policyname='lic_prorr_select') then
    create policy lic_prorr_select on public.tdr_licitacao_prorrogacoes for select to authenticated
      using (exists (select 1 from public.tdr_licitacao_rodadas r join public.tdrs t on t.id = r.tdr_id where r.id = rodada_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tdr_licitacao_empresas' and policyname='lic_emp_select') then
    create policy lic_emp_select on public.tdr_licitacao_empresas for select to authenticated
      using (exists (select 1 from public.tdr_licitacao_rodadas r join public.tdrs t on t.id = r.tdr_id where r.id = rodada_id));
  end if;
end $$;
revoke all on public.tdr_licitacao_rodadas, public.tdr_licitacao_prorrogacoes, public.tdr_licitacao_empresas from anon, public, authenticated;
grant select on public.tdr_licitacao_rodadas, public.tdr_licitacao_prorrogacoes, public.tdr_licitacao_empresas to authenticated;

-- contatos são dado pessoal: trilha no audit_log
create or replace trigger trg_audit_lic_empresas after insert or update on public.tdr_licitacao_empresas
  for each row execute function public.fn_trg_audit();

-- ── regras ───────────────────────────────────────────────────────────────
create or replace function public.fn_lic_classe(p_modalidade text)
returns text language sql immutable set search_path to 'public' as $$
  select case p_modalidade
    when 'Pregão Eletrônico'      then 'aberta'
    when 'Concorrência'           then 'aberta'
    when 'Carta-Convite'          then 'convite'
    when 'Cotação/Shopping (ONU)' then 'cotacao'
    when 'Dispensa de Licitação'  then 'dispensa'
    when 'Inexigibilidade'        then 'inexigibilidade'
    else 'outra' end
$$;

-- quem opera a licitação de um TDR (usuário logado)
create or replace function public.fn_lic_pode(p_tdr uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from usuarios u where u.id = auth.uid() and u.ativo and u.perfil in ('super_admin','coordenacao'))
      or exists (select 1 from tdrs t join atividade_responsaveis ar on ar.atividade_id = t.atividade_id
                  join usuarios u on u.id = ar.usuario_id and u.ativo
                 where t.id = p_tdr and ar.usuario_id = auth.uid() and ar.ativo
                   and ar.papel in ('responsavel','substituto'))
$$;

-- pessoas avisadas e responsáveis pelas tarefas: responsável/substituto da atividade + quem abriu a rodada
create or replace function public.fn_lic_pessoas(p_rodada uuid)
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select ar.usuario_id as x from tdr_licitacao_rodadas r join tdrs t on t.id = r.tdr_id
      join atividade_responsaveis ar on ar.atividade_id = t.atividade_id and ar.ativo and ar.papel in ('responsavel','substituto')
      join usuarios u on u.id = ar.usuario_id and u.ativo
     where r.id = p_rodada
    union
    select r.aberta_por from tdr_licitacao_rodadas r join usuarios u on u.id = r.aberta_por and u.ativo where r.id = p_rodada
  ) z where x is not null
$$;

-- grava a lista curta (substitui: quem sai fica ativo=false, nunca some)
create or replace function public.fn_lic_gravar_empresas(p_rodada uuid, p_empresas jsonb, p_uid uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  e jsonb; v_ids uuid[] := '{}'; v_id uuid; v_n integer := 0;
begin
  for e in select * from jsonb_array_elements(coalesce(p_empresas, '[]'::jsonb)) loop
    if length(btrim(coalesce(e->>'empresa', ''))) < 2 then
      raise exception 'LICITACAO: informe o nome de cada empresa da lista.';
    end if;
    if nullif(btrim(coalesce(e->>'email', '')), '') is not null and (e->>'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'LICITACAO: e-mail inválido na lista (%).', e->>'email';
    end if;
    v_id := nullif(e->>'id', '')::uuid;
    if v_id is not null and exists (select 1 from tdr_licitacao_empresas where id = v_id and rodada_id = p_rodada) then
      update tdr_licitacao_empresas set empresa = btrim(e->>'empresa'), contato = nullif(btrim(e->>'contato'), ''),
             telefone = nullif(btrim(e->>'telefone'), ''), email = nullif(lower(btrim(e->>'email')), ''),
             fornecedor_id = nullif(e->>'fornecedor_id', '')::uuid, ativo = true, atualizado_em = now()
       where id = v_id;
    else
      insert into tdr_licitacao_empresas (rodada_id, fornecedor_id, empresa, contato, telefone, email, criado_por)
      values (p_rodada, nullif(e->>'fornecedor_id', '')::uuid, btrim(e->>'empresa'), nullif(btrim(e->>'contato'), ''),
              nullif(btrim(e->>'telefone'), ''), nullif(lower(btrim(e->>'email')), ''), p_uid)
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id; v_n := v_n + 1;
  end loop;
  update tdr_licitacao_empresas set ativo = false, atualizado_em = now()
   where rodada_id = p_rodada and convidada and ativo and not (id = any(v_ids));
  return v_n;
end $$;

-- valida os dados da rodada pela modalidade
create or replace function public.fn_lic_validar(p_modalidade text, p jsonb, p_n_empresas integer, p_exige_prazo boolean)
returns void language plpgsql immutable set search_path to 'public' as $$
declare v_cl text := fn_lic_classe(p_modalidade);
begin
  if coalesce(btrim(p_modalidade), '') = '' then raise exception 'LICITACAO: escolha a modalidade.'; end if;
  if nullif(p->>'edital_url', '') is not null and (p->>'edital_url') !~* '^https?://' then
    raise exception 'LICITACAO: o link do edital deve começar com http:// ou https://.';
  end if;
  if v_cl = 'aberta' and nullif(p->>'edital_url', '') is null then
    raise exception 'LICITACAO: informe o link da publicação do edital.';
  end if;
  if p_exige_prazo and v_cl in ('aberta','convite','cotacao','outra') and nullif(p->>'prazo_em', '') is null then
    raise exception 'LICITACAO: informe até quando as propostas são recebidas.';
  end if;
  if v_cl in ('convite','cotacao','dispensa') and p_n_empresas < 1 then
    raise exception 'LICITACAO: informe ao menos uma empresa consultada.';
  end if;
  if v_cl = 'dispensa' and length(btrim(coalesce(p->>'fundamento', ''))) < 5 then
    raise exception 'LICITACAO: informe o fundamento legal da dispensa.';
  end if;
  if v_cl = 'inexigibilidade' then
    if coalesce(p->>'fundamento_tipo', '') not in ('exclusivo','notoria','outro') then
      raise exception 'LICITACAO: escolha o fundamento da inexigibilidade.';
    end if;
    if p->>'fundamento_tipo' = 'outro' and length(btrim(coalesce(p->>'fundamento', ''))) < 5 then
      raise exception 'LICITACAO: descreva o fundamento da inexigibilidade.';
    end if;
    if length(btrim(coalesce(p->>'justificativa', ''))) < 30 then
      raise exception 'LICITACAO: escreva a justificativa da inexigibilidade (mínimo 30 caracteres).';
    end if;
    if p_n_empresas <> 1 then
      raise exception 'LICITACAO: na inexigibilidade informe exatamente uma empresa.';
    end if;
  end if;
end $$;

-- ── tarefas da rodada ────────────────────────────────────────────────────
create or replace function public.fn_lic_criar_tarefa(p_rodada uuid, p_tipo text, p_prazo date)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  r tdr_licitacao_rodadas%rowtype; t tdrs%rowtype;
  v_cl text; v_criador uuid; v_pessoas uuid[]; v_id uuid; v_tit text; v_desc text; v_res text;
begin
  select * into r from tdr_licitacao_rodadas where id = p_rodada;
  select * into t from tdrs where id = r.tdr_id;
  v_cl := fn_lic_classe(r.modalidade);
  v_pessoas := fn_lic_pessoas(r.id);
  v_criador := coalesce(
    (select id from usuarios where id = auth.uid() and ativo),
    (select id from usuarios where id = r.aberta_por and ativo),
    (select x.usuario_id from rem_cargo_titulares x join usuarios u on u.id = x.usuario_id and u.ativo
      where x.cargo = 'coordenacao_solicitante' and x.vigencia_fim is null limit 1),
    v_pessoas[1]);
  if v_criador is null then return null; end if;
  if coalesce(array_length(v_pessoas, 1), 0) = 0 then v_pessoas := array[v_criador]; end if;

  if p_tipo = 'resultado' then
    v_tit := case when v_cl in ('dispensa','inexigibilidade')
                  then 'Registrar resultado da contratação direta do TDR ' || t.numero
                  else 'Registrar resultado da licitação do TDR ' || t.numero end;
    v_desc := r.rodada || 'ª rodada · ' || r.modalidade || coalesce(' · processo ' || r.numero_processo, '')
      || case when r.prazo_em is not null
              then '. O prazo para propostas encerrou em ' || to_char(r.prazo_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI') || '.'
              else '.' end
      || E'\n\nAbra o TDR ' || t.numero || ' e use "Registrar resultado": informe se houve propostas, quantas e de quais empresas (sem valores). '
      || 'A tarefa é concluída sozinha quando o resultado for registrado.';
  else
    v_res := case r.situacao when 'deserta' then case when v_cl in ('dispensa','cotacao') then 'sem cotações' else 'deserta' end
                             when 'fracassada' then 'fracassada' else 'sem proposta' end;
    v_tit := 'Licitação ' || v_res || ': definir medida para o TDR ' || t.numero;
    v_desc := r.rodada || 'ª rodada · ' || r.modalidade || ' terminou ' || v_res || '.'
      || coalesce(' ' || r.resultado_obs, '')
      || E'\n\nNo TDR ' || t.numero || ', escolha a medida: "Relançar" (abre a próxima rodada; dá para trocar a modalidade e ampliar a lista curta) '
      || 'ou "Pedir cancelamento" (nota técnica e assinaturas). A tarefa é concluída sozinha quando a medida for registrada.';
  end if;

  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo, entidade_tipo, entidade_id, atividade_id, criado_por, tipo)
  values (v_tit, v_desc, 'alta', current_date, p_prazo, 'tdr_licitacao_rodada', r.id, t.atividade_id, v_criador, 'outras')
  returning id into v_id;
  insert into tarefa_participantes (tarefa_id, usuario_id, papel)
    select v_id, x, 'responsavel' from unnest(v_pessoas) x
    on conflict (tarefa_id, usuario_id) do nothing;
  insert into tarefa_tdrs (tarefa_id, tdr_id) values (v_id, t.id) on conflict do nothing;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (v_id, v_criador, 'criacao', 'Criada pelo sistema na licitação do TDR ' || t.numero);
  perform fn_tarefa_notificar(v_pessoas, 'tarefa_atribuida', v_tit, r.modalidade, v_id, auth.uid());
  if p_tipo = 'resultado' then
    update tdr_licitacao_rodadas set tarefa_resultado_id = v_id where id = r.id;
  else
    update tdr_licitacao_rodadas set tarefa_medida_id = v_id where id = r.id;
  end if;
  return v_id;
end $$;

create or replace function public.fn_lic_fechar_tarefa(p_tarefa uuid, p_status text, p_autor uuid, p_texto text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_t tarefas%rowtype; v_autor uuid;
begin
  if p_tarefa is null then return; end if;
  select * into v_t from tarefas where id = p_tarefa;
  if v_t.id is null or v_t.status in ('concluida','cancelada') then return; end if;
  v_autor := coalesce((select id from usuarios where id = p_autor and ativo), v_t.criado_por);
  perform set_config('dima.tarefa_status_rpc', '1', true);
  update tarefas set status = p_status::status_tarefa,
         dt_conclusao = case when p_status = 'concluida' then now() else dt_conclusao end
   where id = v_t.id;
  perform set_config('dima.tarefa_status_rpc', '', true);
  insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem) values (v_t.id, v_autor, p_texto, 'painel');
  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para, motivo)
    values (v_t.id, v_autor, case when p_status = 'concluida' then 'conclusao' else 'cancelamento' end,
            v_t.status::text, p_status, left(p_texto, 500));
end $$;

-- ── 1. enviar para licitação (aprovado → em_licitacao) ───────────────────
create or replace function public.fn_lic_enviar(p_tdr uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); t tdrs%rowtype; v_mod text := btrim(coalesce(p->>'modalidade', ''));
  v_cl text; v_prazo timestamptz; v_rod integer; v_id uuid; v_n integer; v_tar uuid;
begin
  if not fn_lic_pode(p_tdr) then
    raise exception 'LICITACAO: só coordenação, super_admin ou o responsável/substituto da atividade operam a licitação.';
  end if;
  select * into t from tdrs where id = p_tdr for update;
  if t.id is null then raise exception 'LICITACAO: TDR não encontrado.'; end if;
  if t.status <> 'aprovado' then
    raise exception 'LICITACAO: só TDR aprovado vai para licitação (o TDR % está %).', t.numero, t.status;
  end if;
  if exists (select 1 from tdr_cancelamentos where tdr_id = t.id and status in ('rascunho','em_aprovacao')) then
    raise exception 'LICITACAO: o TDR % tem pedido de cancelamento em andamento.', t.numero;
  end if;
  v_cl := fn_lic_classe(v_mod);
  v_n := jsonb_array_length(coalesce(p->'empresas', '[]'::jsonb));
  perform fn_lic_validar(v_mod, p, v_n, true);
  v_prazo := case when v_cl = 'inexigibilidade' then null else nullif(p->>'prazo_em', '')::timestamptz end;
  if v_prazo is not null and v_prazo <= now() then
    raise exception 'LICITACAO: o prazo para propostas precisa ser uma data futura.';
  end if;

  select coalesce(max(rodada), 0) + 1 into v_rod from tdr_licitacao_rodadas where tdr_id = t.id;
  v_rod := greatest(v_rod, coalesce((select max(rodada) + 1 from tdr_licitacoes where tdr_id = t.id), 1));
  insert into tdr_licitacao_rodadas (tdr_id, rodada, modalidade, fundamento_tipo, fundamento, justificativa, numero_processo,
         dt_abertura, edital_url, prazo_original, prazo_em, aberta_por)
  values (t.id, v_rod, v_mod,
          case when v_cl = 'inexigibilidade' then p->>'fundamento_tipo' end,
          case when v_cl in ('dispensa','inexigibilidade') then nullif(btrim(p->>'fundamento'), '') end,
          case when v_cl = 'inexigibilidade' then nullif(btrim(p->>'justificativa'), '') end,
          nullif(btrim(p->>'numero_processo'), ''), nullif(p->>'dt_abertura', '')::date,
          case when v_cl = 'inexigibilidade' then null else nullif(btrim(p->>'edital_url'), '') end,
          v_prazo, v_prazo, v_uid)
  returning id into v_id;
  perform fn_lic_gravar_empresas(v_id, p->'empresas', v_uid);

  perform set_config('dima.licitacao', 'rpc', true);
  update tdrs set status = 'em_licitacao', modalidade_licitacao = v_mod,
         numero_processo = nullif(btrim(p->>'numero_processo'), ''), dt_licitacao = nullif(p->>'dt_abertura', '')::date,
         atualizado_em = now()
   where id = t.id;
  perform set_config('dima.licitacao', '', true);
  insert into tdr_acoes (tdr_id, usuario_id, acao, status_anterior, status_novo, comentario)
  values (t.id, v_uid, 'em_licitacao', 'aprovado', 'em_licitacao',
          v_rod || 'ª rodada · ' || v_mod || coalesce(' · processo ' || nullif(btrim(p->>'numero_processo'), ''), '')
          || coalesce(' · propostas até ' || to_char(v_prazo at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI'), '')
          || ' · ' || v_n || ' empresa(s) na lista curta');

  -- sem prazo (inexigibilidade, dispensa sem prazo): a tarefa do resultado nasce agora
  if v_prazo is null then
    v_tar := fn_lic_criar_tarefa(v_id, 'resultado', current_date + 15);
  end if;
  return jsonb_build_object('rodada_id', v_id, 'rodada', v_rod, 'tarefa_id', v_tar);
end $$;

-- ── 2. editar dados da rodada aberta (processo, edital, fundamento, lista curta; prazo só se ainda não tem) ──
create or replace function public.fn_lic_editar(p_rodada uuid, p jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r tdr_licitacao_rodadas%rowtype; v_cl text; v_uid uuid := auth.uid(); v_n integer; v_prazo timestamptz;
begin
  select * into r from tdr_licitacao_rodadas where id = p_rodada for update;
  if r.id is null then raise exception 'LICITACAO: rodada não encontrada.'; end if;
  if not fn_lic_pode(r.tdr_id) then raise exception 'LICITACAO: sem permissão para esta licitação.'; end if;
  if r.situacao <> 'aberta' then raise exception 'LICITACAO: a rodada já tem resultado — não se altera.'; end if;
  v_cl := fn_lic_classe(r.modalidade);
  v_n := case when p ? 'empresas' then jsonb_array_length(coalesce(p->'empresas', '[]'::jsonb))
              else (select count(*) from tdr_licitacao_empresas where rodada_id = r.id and convidada and ativo) end;
  perform fn_lic_validar(r.modalidade, p || jsonb_build_object(
      'edital_url', coalesce(nullif(p->>'edital_url', ''), r.edital_url),
      'fundamento', coalesce(p->>'fundamento', r.fundamento),
      'fundamento_tipo', coalesce(p->>'fundamento_tipo', r.fundamento_tipo),
      'justificativa', coalesce(p->>'justificativa', r.justificativa)), v_n, false);
  v_prazo := nullif(p->>'prazo_em', '')::timestamptz;
  if v_prazo is not null and r.prazo_em is not null and v_prazo is distinct from r.prazo_em then
    raise exception 'LICITACAO: para mudar o prazo use "Prorrogar prazo" (fica no histórico).';
  end if;
  if v_prazo is not null and r.prazo_em is null and v_prazo <= now() then
    raise exception 'LICITACAO: o prazo para propostas precisa ser uma data futura.';
  end if;
  update tdr_licitacao_rodadas set
    numero_processo = case when p ? 'numero_processo' then nullif(btrim(p->>'numero_processo'), '') else numero_processo end,
    dt_abertura     = case when p ? 'dt_abertura' then nullif(p->>'dt_abertura', '')::date else dt_abertura end,
    edital_url      = case when v_cl = 'inexigibilidade' then null when p ? 'edital_url' then nullif(btrim(p->>'edital_url'), '') else edital_url end,
    fundamento      = case when p ? 'fundamento' and v_cl in ('dispensa','inexigibilidade') then nullif(btrim(p->>'fundamento'), '') else fundamento end,
    fundamento_tipo = case when p ? 'fundamento_tipo' and v_cl = 'inexigibilidade' then p->>'fundamento_tipo' else fundamento_tipo end,
    justificativa   = case when p ? 'justificativa' and v_cl = 'inexigibilidade' then nullif(btrim(p->>'justificativa'), '') else justificativa end,
    prazo_em        = case when r.prazo_em is null and v_cl <> 'inexigibilidade' then coalesce(v_prazo, prazo_em) else prazo_em end,
    prazo_original  = case when r.prazo_em is null and v_cl <> 'inexigibilidade' then coalesce(v_prazo, prazo_original) else prazo_original end
  where id = r.id;
  if p ? 'empresas' then perform fn_lic_gravar_empresas(r.id, p->'empresas', v_uid); end if;
  perform set_config('dima.licitacao', 'rpc', true);
  update tdrs set numero_processo = (select numero_processo from tdr_licitacao_rodadas where id = r.id),
         dt_licitacao = (select dt_abertura from tdr_licitacao_rodadas where id = r.id), atualizado_em = now()
   where id = r.tdr_id;
  perform set_config('dima.licitacao', '', true);
end $$;

-- ── 3. prorrogar o prazo ─────────────────────────────────────────────────
create or replace function public.fn_lic_prorrogar(p_rodada uuid, p_prazo timestamptz, p_motivo text, p_aviso_url text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r tdr_licitacao_rodadas%rowtype; v_uid uuid := auth.uid(); t tdrs%rowtype;
begin
  select * into r from tdr_licitacao_rodadas where id = p_rodada for update;
  if r.id is null then raise exception 'LICITACAO: rodada não encontrada.'; end if;
  if not fn_lic_pode(r.tdr_id) then raise exception 'LICITACAO: sem permissão para esta licitação.'; end if;
  if r.situacao <> 'aberta' then raise exception 'LICITACAO: a rodada já tem resultado — não se prorroga.'; end if;
  if fn_lic_classe(r.modalidade) = 'inexigibilidade' then raise exception 'LICITACAO: inexigibilidade não tem prazo de propostas.'; end if;
  if p_prazo is null or p_prazo <= now() then raise exception 'LICITACAO: o novo prazo precisa ser uma data futura.'; end if;
  if r.prazo_em is not null and p_prazo <= r.prazo_em then
    raise exception 'LICITACAO: o novo prazo precisa ser depois do prazo atual.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'LICITACAO: informe o motivo da prorrogação (mínimo 10 caracteres).'; end if;
  if nullif(btrim(p_aviso_url), '') is not null and p_aviso_url !~* '^https?://' then
    raise exception 'LICITACAO: o link do aviso deve começar com http:// ou https://.';
  end if;
  insert into tdr_licitacao_prorrogacoes (rodada_id, prazo_anterior, prazo_novo, motivo, aviso_url, registrado_por)
  values (r.id, r.prazo_em, p_prazo, btrim(p_motivo), nullif(btrim(p_aviso_url), ''), v_uid);
  -- prazo vencido já tinha gerado a tarefa do resultado: sai de cena até o novo vencimento
  if r.tarefa_resultado_id is not null and r.prazo_em is not null then
    perform fn_lic_fechar_tarefa(r.tarefa_resultado_id, 'cancelada', v_uid,
      'Prazo prorrogado para ' || to_char(p_prazo at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI') || ': ' || btrim(p_motivo));
  end if;
  update tdr_licitacao_rodadas set prazo_em = p_prazo, prazo_original = coalesce(prazo_original, p_prazo), aviso_2d_em = null,
         tarefa_resultado_id = case when r.prazo_em is not null then null else tarefa_resultado_id end
   where id = r.id;
  select * into t from tdrs where id = r.tdr_id;
  insert into tdr_acoes (tdr_id, usuario_id, acao, status_anterior, status_novo, comentario)
  values (r.tdr_id, v_uid, 'em_licitacao', t.status::text, t.status::text,
          'Prazo da ' || r.rodada || 'ª rodada ' || coalesce('de ' || to_char(r.prazo_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI') || ' ', '')
          || 'para ' || to_char(p_prazo at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI') || ': ' || btrim(p_motivo));
end $$;

-- ── 4. registrar o resultado (sem valores) ───────────────────────────────
create or replace function public.fn_lic_resultado(p_rodada uuid, p_situacao text, p_n integer,
                                                   p_empresas uuid[], p_novas jsonb, p_obs text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r tdr_licitacao_rodadas%rowtype; v_uid uuid := auth.uid(); v_cl text; v_qtd integer; e jsonb; v_tar uuid; t tdrs%rowtype;
  v_rot text;
begin
  select * into r from tdr_licitacao_rodadas where id = p_rodada for update;
  if r.id is null then raise exception 'LICITACAO: rodada não encontrada.'; end if;
  if not fn_lic_pode(r.tdr_id) then raise exception 'LICITACAO: sem permissão para esta licitação.'; end if;
  if r.situacao <> 'aberta' then raise exception 'LICITACAO: o resultado desta rodada já foi registrado.'; end if;
  v_cl := fn_lic_classe(r.modalidade);
  if r.prazo_em is not null and r.prazo_em > now() then
    raise exception 'LICITACAO: o prazo para propostas vai até % — registre o resultado depois do encerramento (ou prorrogue).',
      to_char(r.prazo_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI');
  end if;
  if v_cl = 'inexigibilidade' and p_situacao not in ('com_propostas','sem_proposta') then
    raise exception 'LICITACAO: na inexigibilidade o resultado é "proposta recebida" ou "sem proposta".';
  end if;
  if v_cl <> 'inexigibilidade' and p_situacao not in ('com_propostas','deserta','fracassada') then
    raise exception 'LICITACAO: resultado inválido.';
  end if;
  p_empresas := coalesce(p_empresas, '{}'); p_novas := coalesce(p_novas, '[]'::jsonb);
  v_qtd := coalesce(array_length(p_empresas, 1), 0) + jsonb_array_length(p_novas);
  if p_situacao in ('deserta','sem_proposta') then
    if v_qtd > 0 then raise exception 'LICITACAO: sem propostas não há empresas a marcar.'; end if;
    p_n := 0;
  else
    if v_cl = 'inexigibilidade' then p_n := 1; end if;
    if coalesce(p_n, 0) < 1 then raise exception 'LICITACAO: informe quantas propostas foram recebidas.'; end if;
    if v_qtd > p_n then raise exception 'LICITACAO: há mais empresas marcadas (%) do que propostas (%).', v_qtd, p_n; end if;
    if v_qtd = 0 then raise exception 'LICITACAO: marque ao menos uma empresa que apresentou proposta.'; end if;
  end if;
  if exists (select 1 from unnest(p_empresas) x where not exists
              (select 1 from tdr_licitacao_empresas m where m.id = x and m.rodada_id = r.id and m.ativo)) then
    raise exception 'LICITACAO: empresa marcada que não é desta rodada. Recarregue a tela.';
  end if;
  if p_situacao in ('deserta','fracassada','sem_proposta') and length(btrim(coalesce(p_obs, ''))) < 10 then
    raise exception 'LICITACAO: descreva o que aconteceu (mínimo 10 caracteres) — ajuda a decidir a medida.';
  end if;

  update tdr_licitacao_empresas set apresentou_proposta = (id = any(p_empresas)), atualizado_em = now()
   where rodada_id = r.id and ativo;
  for e in select * from jsonb_array_elements(p_novas) loop
    if length(btrim(coalesce(e->>'empresa', ''))) < 2 then raise exception 'LICITACAO: informe o nome da empresa.'; end if;
    insert into tdr_licitacao_empresas (rodada_id, fornecedor_id, empresa, contato, telefone, email, convidada, apresentou_proposta, criado_por)
    values (r.id, nullif(e->>'fornecedor_id', '')::uuid, btrim(e->>'empresa'), nullif(btrim(e->>'contato'), ''),
            nullif(btrim(e->>'telefone'), ''), nullif(lower(btrim(e->>'email')), ''), false, true, v_uid);
  end loop;

  update tdr_licitacao_rodadas set situacao = p_situacao, n_propostas = p_n, resultado_obs = nullif(btrim(p_obs), ''),
         resultado_em = now(), resultado_por = v_uid
   where id = r.id;
  perform fn_lic_fechar_tarefa(r.tarefa_resultado_id, 'concluida', v_uid, 'Resultado registrado no TDR.');
  select * into r from tdr_licitacao_rodadas where id = r.id;
  if p_situacao <> 'com_propostas' then
    v_tar := fn_lic_criar_tarefa(r.id, 'medida', current_date + 10);
  end if;
  select * into t from tdrs where id = r.tdr_id;
  v_rot := case p_situacao when 'com_propostas' then p_n || ' proposta(s)'
                           when 'deserta' then case when v_cl in ('dispensa','cotacao') then 'sem cotações' else 'deserta' end
                           when 'fracassada' then 'fracassada (' || p_n || ' proposta(s) desclassificada(s))'
                           else 'sem proposta' end;
  insert into tdr_acoes (tdr_id, usuario_id, acao, status_anterior, status_novo, comentario)
  values (r.tdr_id, v_uid, 'em_licitacao', t.status::text, t.status::text,
          'Resultado da ' || r.rodada || 'ª rodada: ' || v_rot || coalesce(' — ' || nullif(btrim(p_obs), ''), ''));
  return jsonb_build_object('situacao', p_situacao, 'tarefa_medida_id', v_tar);
end $$;

-- ── 5. relançar (nova rodada) ────────────────────────────────────────────
create or replace function public.fn_lic_relancar(p_rodada uuid, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r tdr_licitacao_rodadas%rowtype; t tdrs%rowtype; v_uid uuid := auth.uid();
begin
  select * into r from tdr_licitacao_rodadas where id = p_rodada for update;
  if r.id is null then raise exception 'LICITACAO: rodada não encontrada.'; end if;
  if not fn_lic_pode(r.tdr_id) then raise exception 'LICITACAO: sem permissão para esta licitação.'; end if;
  if r.situacao not in ('deserta','fracassada','sem_proposta') or r.medida is not null then
    raise exception 'LICITACAO: só se relança rodada sem êxito e ainda sem medida.';
  end if;
  select * into t from tdrs where id = r.tdr_id for update;
  if t.status <> 'em_licitacao' then raise exception 'LICITACAO: o TDR % não está em licitação.', t.numero; end if;
  if exists (select 1 from tdr_cancelamentos where tdr_id = t.id and status in ('rascunho','em_aprovacao')) then
    raise exception 'LICITACAO: o TDR % tem pedido de cancelamento em andamento — cancele o pedido antes de relançar.', t.numero;
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'LICITACAO: explique o que muda na nova rodada (mínimo 10 caracteres).'; end if;

  -- histórico das rodadas sem êxito (mesma tabela usada pela cadeia de cancelamento)
  insert into tdr_licitacoes (tdr_id, rodada, modalidade, numero_processo, dt_abertura, resultado, motivo, desfecho, registrado_por)
  values (t.id, r.rodada, r.modalidade, r.numero_processo, r.dt_abertura,
          case r.situacao when 'deserta' then 'deserta' when 'fracassada' then 'fracassada' else 'outro' end,
          coalesce(r.resultado_obs, 'Rodada sem êxito') || ' — relançada: ' || btrim(p_motivo), 'relancada', v_uid)
  on conflict (tdr_id, rodada) do nothing;
  update tdr_licitacao_rodadas set medida = 'relancada', medida_motivo = btrim(p_motivo), medida_em = now(), medida_por = v_uid
   where id = r.id;
  update tdrs set status = 'aprovado', modalidade_licitacao = null, numero_processo = null, dt_licitacao = null, atualizado_em = now()
   where id = t.id;
  insert into tdr_acoes (tdr_id, usuario_id, acao, status_anterior, status_novo, comentario)
  values (t.id, v_uid, 'em_licitacao', 'em_licitacao', 'aprovado',
          r.rodada || 'ª rodada (' || r.modalidade || ') sem êxito — relançada: ' || btrim(p_motivo));
  perform fn_lic_fechar_tarefa(r.tarefa_medida_id, 'concluida', v_uid, 'Medida: relançar. ' || btrim(p_motivo));
end $$;

-- ── travas e sincronia com a fase do TDR ─────────────────────────────────
-- em_licitacao só pela abertura da rodada (fn_lic_enviar)
create or replace function public.fn_trg_tdr_guarda_licitacao()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status = 'em_licitacao' and old.status is distinct from 'em_licitacao'
     and coalesce(current_setting('dima.licitacao', true), '') <> 'rpc' then
    raise exception 'LICITACAO: use "Enviar para licitação" no TDR (registra edital, prazo e lista curta).';
  end if;
  return new;
end $$;
create or replace trigger trg_tdr_guarda_licitacao before update of status on public.tdrs
  for each row execute function public.fn_trg_tdr_guarda_licitacao();

-- contrato registrado ou TDR cancelado fecham a rodada e as tarefas dela
create or replace function public.fn_trg_tdr_licitacao_fase()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r tdr_licitacao_rodadas%rowtype;
begin
  if new.status is not distinct from old.status or new.status not in ('contratado','cancelado') then return null; end if;
  for r in select * from tdr_licitacao_rodadas where tdr_id = new.id and (situacao = 'aberta' or medida is null) loop
    if r.situacao = 'aberta' then
      update tdr_licitacao_rodadas set
        situacao = case when new.status = 'contratado' then 'com_propostas' else 'cancelada' end,
        resultado_obs = case when new.status = 'contratado' then 'Contrato registrado sem o resultado da rodada.' else 'TDR cancelado.' end,
        resultado_em = now()
       where id = r.id;
      perform fn_lic_fechar_tarefa(r.tarefa_resultado_id, case when new.status = 'contratado' then 'concluida' else 'cancelada' end,
        auth.uid(), case when new.status = 'contratado' then 'Contrato registrado para o TDR.' else 'TDR cancelado.' end);
    elsif r.situacao in ('deserta','fracassada','sem_proposta') and r.medida is null then
      update tdr_licitacao_rodadas set medida = case when new.status = 'contratado' then 'contratado' else 'cancelamento' end,
             medida_em = now(), medida_por = auth.uid()
       where id = r.id;
      perform fn_lic_fechar_tarefa(r.tarefa_medida_id, 'concluida', auth.uid(),
        case when new.status = 'contratado' then 'Medida: contrato registrado.' else 'Medida: TDR cancelado (pedido de cancelamento efetivado).' end);
    end if;
  end loop;
  return null;
end $$;
create or replace trigger trg_tdr_licitacao_fase after update of status on public.tdrs
  for each row execute function public.fn_trg_tdr_licitacao_fase();

-- ── rotina de prazos (cron horário) ──────────────────────────────────────
create or replace function public.fn_lic_rotina()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare r tdr_licitacao_rodadas%rowtype; t tdrs%rowtype; u uuid; v_n integer := 0;
begin
  -- aviso 2 dias antes
  for r in select * from tdr_licitacao_rodadas where situacao = 'aberta' and prazo_em is not null and aviso_2d_em is null
             and prazo_em > now() and prazo_em <= now() + interval '2 days' loop
    select * into t from tdrs where id = r.tdr_id;
    foreach u in array fn_lic_pessoas(r.id) loop
      insert into notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
      values (u, 'tarefa_prazo', 'Licitação do TDR ' || t.numero || ' encerra em breve',
              'Propostas até ' || to_char(r.prazo_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI') || ' · ' || r.modalidade,
              'tdrs.html?tdr=' || t.id, 'tdr', t.id);
    end loop;
    update tdr_licitacao_rodadas set aviso_2d_em = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  -- prazo vencido: tarefa para registrar o resultado
  for r in select * from tdr_licitacao_rodadas where situacao = 'aberta' and prazo_em is not null
             and prazo_em <= now() and tarefa_resultado_id is null loop
    perform fn_lic_criar_tarefa(r.id, 'resultado', current_date + 5);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ── TDRs que já estavam em licitação: rodada aberta com os dados que existem ──
insert into public.tdr_licitacao_rodadas (tdr_id, rodada, modalidade, numero_processo, dt_abertura, criado_em)
select t.id, coalesce((select max(rodada) from public.tdr_licitacoes l where l.tdr_id = t.id), 0) + 1,
       coalesce(nullif(btrim(t.modalidade_licitacao), ''), 'Não informada'), t.numero_processo, t.dt_licitacao,
       coalesce(t.atualizado_em, now())
  from public.tdrs t
 where t.status = 'em_licitacao'
   and not exists (select 1 from public.tdr_licitacao_rodadas r where r.tdr_id = t.id);

-- ── ROPA: contatos da lista curta ────────────────────────────────────────
insert into public.lgpd_tratamentos (codigo, nome, modulo, finalidade, controlador, operadores, base_legal, base_legal_detalhe,
       categorias_titulares, categorias_dados, dado_sensivel, dado_de_menor, tabelas, compartilhamento, transferencia_internacional,
       retencao_prazo, retencao_criterio, medidas_seguranca, ativo)
select 'TRAT-003', 'Lista curta de fornecedores das licitações de TDR', 'tdrs',
       'Registrar as empresas consultadas ou convidadas em cada licitação/contratação direta de TDR, o contato de referência e quais apresentaram proposta, para acompanhar a competitividade e decidir a medida quando a licitação fica deserta.',
       'SEMA/AC', 'Supabase (banco); Vercel (hospedagem)', 'art7_iii_politica_publica',
       'Art. 7º, III (execução de políticas públicas — gestão das contratações do Projeto 218BRA2001). Não usa consentimento.',
       array['representantes de empresas consultadas ou convidadas'],
       array['nome do contato de referência','telefone profissional','e-mail profissional','empresa e se apresentou proposta (sem valores)'],
       false, false, array['tdr_licitacao_empresas'],
       'Nenhum. Uso interno da coordenação e dos responsáveis das atividades.',
       'Supabase/Vercel (art. 33) — pendência geral do DIMA', null,
       'Guardado com o processo de contratação até o encerramento do projeto e a prestação de contas; revisar prazo com o Encarregado.',
       'Leitura só por quem vê o TDR (RLS herdada de tdrs); escrita só por funções do banco (coordenação, super_admin, responsável/substituto da atividade); empresa retirada da lista fica inativa (não some); trilha em audit_log; sem valores de proposta.',
       true
 where not exists (select 1 from public.lgpd_tratamentos where codigo = 'TRAT-003');

-- ── permissões ───────────────────────────────────────────────────────────
revoke all on function public.fn_lic_pode(uuid) from public, anon;
grant execute on function public.fn_lic_pode(uuid) to authenticated;
revoke all on function public.fn_lic_enviar(uuid, jsonb) from public, anon;
grant execute on function public.fn_lic_enviar(uuid, jsonb) to authenticated;
revoke all on function public.fn_lic_editar(uuid, jsonb) from public, anon;
grant execute on function public.fn_lic_editar(uuid, jsonb) to authenticated;
revoke all on function public.fn_lic_prorrogar(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.fn_lic_prorrogar(uuid, timestamptz, text, text) to authenticated;
revoke all on function public.fn_lic_resultado(uuid, text, integer, uuid[], jsonb, text) from public, anon;
grant execute on function public.fn_lic_resultado(uuid, text, integer, uuid[], jsonb, text) to authenticated;
revoke all on function public.fn_lic_relancar(uuid, text) from public, anon;
grant execute on function public.fn_lic_relancar(uuid, text) to authenticated;
revoke all on function public.fn_lic_pessoas(uuid) from public, anon, authenticated;
revoke all on function public.fn_lic_gravar_empresas(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.fn_lic_criar_tarefa(uuid, text, date) from public, anon, authenticated;
revoke all on function public.fn_lic_fechar_tarefa(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.fn_lic_rotina() from public, anon, authenticated;
revoke all on function public.fn_trg_tdr_guarda_licitacao() from public, anon, authenticated;
revoke all on function public.fn_trg_tdr_licitacao_fase() from public, anon, authenticated;
revoke all on function public.fn_lic_validar(text, jsonb, integer, boolean) from public, anon;
revoke all on function public.fn_lic_classe(text) from public, anon;

select cron.schedule('licitacao-prazos', '7 * * * *', 'select public.fn_lic_rotina()');

notify pgrst, 'reload schema';

-- (b, 20261013_licitacao_rodadas_b_acoes) tdr_acoes.acao tem check fechado: prorrogação, resultado e relançamento
-- gravam acao 'em_licitacao' com o comentário (os textos acima já estão na forma final).
