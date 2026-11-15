-- ════════════════════════════════════════════════════════════════════════════
-- PATRIMÔNIO · Fase 4 — inventário por campanha (docs/patrimonio/plano.md §5)
-- ════════════════════════════════════════════════════════════════════════════
-- Campanha (INV-AAAA-NNNN) aberta pelo gestor, com os locais (ou todos) e a
-- COMISSÃO (2+ pessoas ativas; a 1ª é a presidente). Na abertura o banco congela
-- a lista de bens ESPERADOS (local, responsável, situação e condição de cada um).
-- Só a comissão confere (leitura do QR, busca ou escolha na lista); bem achado
-- fora da lista entra como "não esperado". A presidente (ou o gestor) envia para
-- assinatura: o hash (campanha + comissão + resultado de cada item) é gravado e
-- cada membro assina COM SENHA pela Edge Function `patrimonio-termo`
-- (acao 'assinar_inventario') → fn_pat_inv_assinar (só service_role; insere em
-- pat_inventario_assinaturas, só inclusão). Reabrir muda o hash e invalida as
-- assinaturas anteriores (ficam no histórico). Última assinatura válida efetiva:
--   • evento 'inventario' em todo bem conferido (local e condição achados,
--     ultimo_inventario_em = hoje);
--   • ocorrência de EXTRAVIO automática para bem esperado e não localizado
--     (emprestado, em manutenção ou já extraviado = "ausente por registro", sem
--     ocorrência nova);
--   • uma tarefa de regularização para o gestor quando houver divergência.
-- Sem a palavra que remove linhas no texto (o apply_migration ficaria esperando).
-- ════════════════════════════════════════════════════════════════════════════

create sequence if not exists public.pat_inventarios_numero_seq;

create table if not exists public.pat_inventarios (
  id              uuid primary key default gen_random_uuid(),
  numero          text not null unique,
  titulo          text not null check (length(btrim(titulo)) >= 5),
  tipo            text not null default 'anual' check (tipo in ('anual','parcial','extraordinario','encerramento')),
  locais          uuid[] not null default '{}',           -- vazio = todos os locais
  situacao        text not null default 'em_andamento'
                  check (situacao in ('em_andamento','em_assinatura','concluido','cancelado')),
  observacao      text,
  hash            text,                                   -- gravado no envio para assinatura
  aberto_por      uuid not null references public.usuarios(id),
  aberto_em       timestamptz not null default now(),
  enviado_por     uuid references public.usuarios(id),
  enviado_em      timestamptz,
  concluido_em    timestamptz,
  cancelado_por   uuid references public.usuarios(id),
  cancelado_em    timestamptz,
  motivo_cancelamento text,
  tarefa_regularizacao_id uuid references public.tarefas(id)
);

create table if not exists public.pat_inventario_comissao (
  inventario_id uuid not null references public.pat_inventarios(id),
  usuario_id    uuid not null references public.usuarios(id),
  papel         text not null check (papel in ('presidente','membro')),
  ordem         integer not null,
  tarefa_id     uuid references public.tarefas(id),
  primary key (inventario_id, usuario_id)
);
create unique index if not exists pat_inv_presidente_uk on public.pat_inventario_comissao (inventario_id) where papel = 'presidente';

create table if not exists public.pat_inventario_itens (
  id                   uuid primary key default gen_random_uuid(),
  inventario_id        uuid not null references public.pat_inventarios(id),
  bem_id               uuid not null references public.pat_bens(id),
  esperado             boolean not null,
  local_esperado       uuid references public.pat_locais(id),
  responsavel_esperado uuid references public.usuarios(id),
  situacao_esperada    text not null,
  condicao_esperada    text not null,
  resultado            text not null default 'pendente'
                       check (resultado in ('pendente','conferido','local_divergente','condicao_divergente','nao_esperado')),
  local_encontrado     uuid references public.pat_locais(id),
  condicao_encontrada  text check (condicao_encontrada in ('novo','bom','regular','ruim','inservivel')),
  metodo               text check (metodo in ('qr','busca','lista')),
  observacao           text,
  conferido_por        uuid references public.usuarios(id),
  conferido_em         timestamptz,
  unique (inventario_id, bem_id)
);
create index if not exists pat_inv_itens_bem_ix on public.pat_inventario_itens (bem_id);

create table if not exists public.pat_inventario_assinaturas (
  id            uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references public.pat_inventarios(id),
  usuario_id    uuid not null references public.usuarios(id),
  hash          text not null,
  assinado_em   timestamptz not null default now(),
  ip            text,
  user_agent    text,
  unique (inventario_id, usuario_id, hash)
);

-- ── Travas: só as funções gravam; assinaturas e comissão só inclusão ────────
create or replace function public.fn_pat_trg_inv_guarda()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('dima.pat_evento', true), '') <> '1' then
    raise exception 'PAT_PROTEGIDO: o inventário muda só pelas funções do patrimônio';
  end if;
  if tg_table_name = 'pat_inventarios' then
    if new.numero is distinct from old.numero or new.aberto_por is distinct from old.aberto_por
       or new.locais is distinct from old.locais then
      raise exception 'PAT_CAMPO_FIXO: número, locais e autoria do inventário não mudam';
    end if;
  elsif tg_table_name = 'pat_inventario_itens' then
    if new.inventario_id is distinct from old.inventario_id or new.bem_id is distinct from old.bem_id
       or new.esperado is distinct from old.esperado or new.local_esperado is distinct from old.local_esperado
       or new.situacao_esperada is distinct from old.situacao_esperada or new.condicao_esperada is distinct from old.condicao_esperada then
      raise exception 'PAT_CAMPO_FIXO: a lista esperada do inventário é congelada na abertura';
    end if;
  elsif tg_table_name = 'pat_inventario_comissao' then
    if new.inventario_id is distinct from old.inventario_id or new.usuario_id is distinct from old.usuario_id
       or new.papel is distinct from old.papel then
      raise exception 'PAT_CAMPO_FIXO: a comissão não muda (cancele e abra outro inventário)';
    end if;
  end if;
  return new;
end $$;
create or replace trigger trg_pat_inv_guarda before update on public.pat_inventarios
  for each row execute function public.fn_pat_trg_inv_guarda();
create or replace trigger trg_pat_inv_itens_guarda before update on public.pat_inventario_itens
  for each row execute function public.fn_pat_trg_inv_guarda();
create or replace trigger trg_pat_inv_comissao_guarda before update on public.pat_inventario_comissao
  for each row execute function public.fn_pat_trg_inv_guarda();

create or replace function public.fn_pat_trg_inv_assinatura_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'PAT_IMUTAVEL: assinatura de inventário não se altera';
end $$;
create or replace trigger trg_pat_inv_assinatura_imutavel before update on public.pat_inventario_assinaturas
  for each row execute function public.fn_pat_trg_inv_assinatura_imutavel();
create or replace trigger trg_audit_pat_inventarios after insert or update on public.pat_inventarios
  for each row execute function public.fn_trg_audit();

-- ── Leitura ─────────────────────────────────────────────────────────────────
create or replace function public.fn_pat_inv_membro(p_inv uuid, p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from pat_inventario_comissao c join usuarios u on u.id = c.usuario_id and u.ativo
                  where c.inventario_id = p_inv and c.usuario_id = p_uid)
$$;

create or replace function public.fn_pat_inv_pode_ver(p_inv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.fn_pat_pode_ver() or public.fn_pat_inv_membro(p_inv)
$$;

alter table public.pat_inventarios            enable row level security;
alter table public.pat_inventario_comissao    enable row level security;
alter table public.pat_inventario_itens       enable row level security;
alter table public.pat_inventario_assinaturas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pat_inventarios' and policyname = 'pat_inventarios_select') then
    create policy pat_inventarios_select on public.pat_inventarios for select to authenticated
      using (public.fn_pat_inv_pode_ver(id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pat_inventario_comissao' and policyname = 'pat_inv_comissao_select') then
    create policy pat_inv_comissao_select on public.pat_inventario_comissao for select to authenticated
      using (public.fn_pat_inv_pode_ver(inventario_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pat_inventario_itens' and policyname = 'pat_inv_itens_select') then
    create policy pat_inv_itens_select on public.pat_inventario_itens for select to authenticated
      using (public.fn_pat_inv_pode_ver(inventario_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pat_inventario_assinaturas' and policyname = 'pat_inv_assin_select') then
    create policy pat_inv_assin_select on public.pat_inventario_assinaturas for select to authenticated
      using (public.fn_pat_inv_pode_ver(inventario_id));
  end if;
end $$;
revoke all on public.pat_inventarios, public.pat_inventario_comissao, public.pat_inventario_itens,
  public.pat_inventario_assinaturas from anon, authenticated;
grant select on public.pat_inventarios, public.pat_inventario_comissao, public.pat_inventario_itens,
  public.pat_inventario_assinaturas to authenticated;
revoke all on sequence public.pat_inventarios_numero_seq from anon, authenticated;

-- ── Hash: campanha + comissão + resultado de cada item ──────────────────────
create or replace function public.fn_pat_inv_hash(p_inv uuid)
returns text language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'numero', v.numero, 'titulo', v.titulo, 'tipo', v.tipo, 'locais', v.locais,
    'comissao', (select jsonb_agg(jsonb_build_object('usuario', c.usuario_id, 'papel', c.papel) order by c.ordem)
                   from pat_inventario_comissao c where c.inventario_id = v.id),
    'itens', (select jsonb_agg(jsonb_build_object('bem', i.bem_id, 'esperado', i.esperado, 'resultado', i.resultado,
                                                  'local', i.local_encontrado, 'condicao', i.condicao_encontrada,
                                                  'obs', i.observacao, 'em', i.conferido_em) order by i.bem_id)
                from pat_inventario_itens i where i.inventario_id = v.id and (i.esperado or i.resultado <> 'pendente'))
  )::text, 'UTF8')), 'hex')
  from pat_inventarios v where v.id = p_inv
$$;

-- ── Abrir campanha ──────────────────────────────────────────────────────────
-- p = { titulo, tipo, locais: [uuid] (vazio = todos), comissao: [uuid] (1ª = presidente), observacao? }
create or replace function public.fn_pat_inv_abrir(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_id uuid; v_num text; v_tipo text := coalesce(nullif(p->>'tipo', ''), 'anual');
  v_locais uuid[]; v_comissao uuid[]; v_m uuid; v_ord int := 0; v_n int; v_conflito text; v_tar uuid;
begin
  if v_uid is null or not public.fn_pat_pode_gerir() then
    raise exception 'PAT_SEM_PERMISSAO: inventário é aberto pelo gestor patrimonial ou pela coordenação';
  end if;
  if length(coalesce(btrim(p->>'titulo'), '')) < 5 then raise exception 'PAT_DADOS: dê um título ao inventário (5+ caracteres)'; end if;
  if v_tipo not in ('anual','parcial','extraordinario','encerramento') then raise exception 'PAT_DADOS: tipo de inventário inválido'; end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into v_locais from jsonb_array_elements_text(coalesce(p->'locais', '[]'::jsonb)) x;
  if exists (select 1 from unnest(v_locais) l where not exists (select 1 from pat_locais pl where pl.id = l)) then
    raise exception 'PAT_DADOS: local não encontrado';
  end if;
  select array_agg(x::uuid order by o) into v_comissao
    from jsonb_array_elements_text(coalesce(p->'comissao', '[]'::jsonb)) with ordinality as t(x, o);
  if coalesce(array_length(v_comissao, 1), 0) < 2 then raise exception 'PAT_COMISSAO: a comissão precisa de ao menos 2 pessoas'; end if;
  if (select count(distinct c) from unnest(v_comissao) c) <> array_length(v_comissao, 1) then
    raise exception 'PAT_COMISSAO: a mesma pessoa aparece duas vezes na comissão';
  end if;
  if exists (select 1 from unnest(v_comissao) c where not exists (select 1 from usuarios u where u.id = c and u.ativo)) then
    raise exception 'PAT_COMISSAO: membro da comissão não encontrado ou inativo';
  end if;
  -- um bem não fica em duas campanhas abertas
  select b.numero || ' (' || v.numero || ')' into v_conflito
    from pat_bens b join pat_inventario_itens i on i.bem_id = b.id
    join pat_inventarios v on v.id = i.inventario_id and v.situacao in ('em_andamento','em_assinatura')
   where b.situacao not in ('anulado','baixado','transferido') and i.esperado
     and (cardinality(v_locais) = 0 or b.local_id = any (v_locais))
   limit 1;
  if v_conflito is not null then raise exception 'PAT_INV_SOBREPOSTO: % já está em outro inventário aberto', v_conflito; end if;

  v_num := 'INV-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.pat_inventarios_numero_seq')::text, 4, '0');
  perform set_config('dima.pat_evento', '1', true);
  insert into pat_inventarios (numero, titulo, tipo, locais, observacao, aberto_por)
  values (v_num, btrim(p->>'titulo'), v_tipo, v_locais, nullif(btrim(p->>'observacao'), ''), v_uid)
  returning id into v_id;
  insert into pat_inventario_itens (inventario_id, bem_id, esperado, local_esperado, responsavel_esperado, situacao_esperada, condicao_esperada)
  select v_id, b.id, true, b.local_id, b.responsavel_id, b.situacao, b.condicao
    from pat_bens b
   where b.situacao not in ('anulado','baixado','transferido')
     and (cardinality(v_locais) = 0 or b.local_id = any (v_locais));
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'PAT_DADOS: nenhum bem ativo nos locais escolhidos'; end if;
  foreach v_m in array v_comissao loop
    v_ord := v_ord + 1;
    v_tar := public.fn_pat_criar_tarefa('Inventário ' || v_num || ' — conferir e assinar',
      'Você faz parte da comissão do inventário "' || btrim(p->>'titulo') || '" (' || v_n || ' bens esperados). '
        || 'Em Patrimônio › Inventários, leia o QR de cada bem (ou procure pelo nº de série) e confirme a condição. '
        || 'Ao final, assine o resultado com a sua senha. A tarefa é concluída na sua assinatura.',
      v_m, v_uid, current_date + 30, 'pat_inventario', v_id, 'media');
    insert into pat_inventario_comissao (inventario_id, usuario_id, papel, ordem, tarefa_id)
    values (v_id, v_m, case when v_ord = 1 then 'presidente' else 'membro' end, v_ord, v_tar);
  end loop;
  perform set_config('dima.pat_evento', '', true);
  return jsonb_build_object('inventario_id', v_id, 'numero', v_num, 'bens', v_n);
end $$;

-- ── Conferir um bem (QR, busca ou lista) ───────────────────────────────────
-- p = { inventario_id, bem_id? | numero?, local_id, condicao, metodo, observacao? }
create or replace function public.fn_pat_inv_conferir(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v pat_inventarios%rowtype; b pat_bens%rowtype; it pat_inventario_itens%rowtype;
  v_local uuid := nullif(p->>'local_id', '')::uuid; v_cond text := nullif(p->>'condicao', '');
  v_met text := coalesce(nullif(p->>'metodo', ''), 'lista'); v_res text; v_num text := upper(btrim(coalesce(p->>'numero', '')));
begin
  select * into v from pat_inventarios where id = nullif(p->>'inventario_id', '')::uuid for update;
  if v.id is null then raise exception 'PAT_DADOS: inventário não encontrado'; end if;
  if v_uid is null or not public.fn_pat_inv_membro(v.id, v_uid) then
    raise exception 'PAT_SEM_PERMISSAO: só a comissão do inventário confere os bens';
  end if;
  if v.situacao <> 'em_andamento' then raise exception 'PAT_INV_FECHADO: o inventário está %', replace(v.situacao, '_', ' '); end if;
  if nullif(p->>'bem_id', '') is not null then
    select * into b from pat_bens where id = (p->>'bem_id')::uuid;
  elsif v_num <> '' then
    -- aceita o número puro ou o endereço do QR (…patrimonio.html?bem=PAT-000123)
    v_num := coalesce(substring(v_num from '(PAT-[0-9]+)'), v_num);
    select * into b from pat_bens where numero = v_num;
  end if;
  if b.id is null then raise exception 'PAT_NAO_ACHADO: nenhum bem com esse número'; end if;
  if b.situacao in ('anulado','baixado','transferido') then
    raise exception 'PAT_ENCERRADO: % está fora do patrimônio ativo (%)', b.numero, b.situacao;
  end if;
  if v_local is null or not exists (select 1 from pat_locais where id = v_local) then raise exception 'PAT_DADOS: diga em que local o bem foi achado'; end if;
  if v_cond is null or v_cond not in ('novo','bom','regular','ruim','inservivel') then raise exception 'PAT_DADOS: condição inválida'; end if;
  if v_met not in ('qr','busca','lista') then raise exception 'PAT_DADOS: forma de conferência inválida'; end if;

  perform set_config('dima.pat_evento', '1', true);
  select * into it from pat_inventario_itens where inventario_id = v.id and bem_id = b.id for update;
  if it.id is null then
    -- achado fora da lista esperada (outro local ou bem que não estava no escopo)
    if exists (select 1 from pat_inventario_itens i join pat_inventarios o on o.id = i.inventario_id
                where i.bem_id = b.id and i.esperado and o.id <> v.id and o.situacao in ('em_andamento','em_assinatura')) then
      perform set_config('dima.pat_evento', '', true);
      raise exception 'PAT_INV_SOBREPOSTO: % está na lista de outro inventário aberto', b.numero;
    end if;
    insert into pat_inventario_itens (inventario_id, bem_id, esperado, local_esperado, responsavel_esperado, situacao_esperada, condicao_esperada)
    values (v.id, b.id, false, b.local_id, b.responsavel_id, b.situacao, b.condicao)
    returning * into it;
  end if;
  v_res := case when not it.esperado then 'nao_esperado'
                when v_local is distinct from it.local_esperado then 'local_divergente'
                when v_cond is distinct from it.condicao_esperada then 'condicao_divergente'
                else 'conferido' end;
  update pat_inventario_itens set resultado = v_res, local_encontrado = v_local, condicao_encontrada = v_cond, metodo = v_met,
         observacao = nullif(btrim(p->>'observacao'), ''), conferido_por = v_uid, conferido_em = now()
   where id = it.id;
  perform set_config('dima.pat_evento', '', true);
  return jsonb_build_object('bem_id', b.id, 'numero', b.numero, 'descricao', b.descricao, 'resultado', v_res,
                            'ja_conferido', it.conferido_em is not null);
end $$;

-- desfazer uma conferência (volta a pendente; o "não esperado" sai da contagem)
create or replace function public.fn_pat_inv_desfazer(p_inv uuid, p_bem uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v pat_inventarios%rowtype;
begin
  select * into v from pat_inventarios where id = p_inv for update;
  if v.id is null then raise exception 'PAT_DADOS: inventário não encontrado'; end if;
  if auth.uid() is null or not public.fn_pat_inv_membro(v.id) then raise exception 'PAT_SEM_PERMISSAO: só a comissão do inventário'; end if;
  if v.situacao <> 'em_andamento' then raise exception 'PAT_INV_FECHADO: o inventário está %', replace(v.situacao, '_', ' '); end if;
  perform set_config('dima.pat_evento', '1', true);
  update pat_inventario_itens set resultado = 'pendente', local_encontrado = null, condicao_encontrada = null, metodo = null,
         observacao = null, conferido_por = null, conferido_em = null
   where inventario_id = v.id and bem_id = p_bem;
  perform set_config('dima.pat_evento', '', true);
end $$;

-- ── Enviar para assinatura / reabrir ────────────────────────────────────────
create or replace function public.fn_pat_inv_pode_conduzir(p_inv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.fn_pat_pode_gerir()
      or exists (select 1 from pat_inventario_comissao c join usuarios u on u.id = c.usuario_id and u.ativo
                  where c.inventario_id = p_inv and c.usuario_id = auth.uid() and c.papel = 'presidente')
$$;

create or replace function public.fn_pat_inv_enviar(p_inv uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v pat_inventarios%rowtype; v_hash text; v_conf int;
begin
  select * into v from pat_inventarios where id = p_inv for update;
  if v.id is null then raise exception 'PAT_DADOS: inventário não encontrado'; end if;
  if auth.uid() is null or not public.fn_pat_inv_pode_conduzir(v.id) then
    raise exception 'PAT_SEM_PERMISSAO: quem envia para assinatura é a presidente da comissão ou o gestor';
  end if;
  if v.situacao <> 'em_andamento' then raise exception 'PAT_INV_FECHADO: o inventário está %', replace(v.situacao, '_', ' '); end if;
  select count(*) into v_conf from pat_inventario_itens where inventario_id = v.id and conferido_em is not null;
  if v_conf = 0 then raise exception 'PAT_DADOS: nenhum bem foi conferido ainda'; end if;
  perform set_config('dima.pat_evento', '1', true);
  v_hash := public.fn_pat_inv_hash(v.id);
  update pat_inventarios set situacao = 'em_assinatura', hash = v_hash, enviado_por = auth.uid(), enviado_em = now() where id = v.id;
  perform set_config('dima.pat_evento', '', true);
  return jsonb_build_object('numero', v.numero, 'hash', v_hash);
end $$;

create or replace function public.fn_pat_inv_reabrir(p_inv uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v pat_inventarios%rowtype;
begin
  select * into v from pat_inventarios where id = p_inv for update;
  if v.id is null then raise exception 'PAT_DADOS: inventário não encontrado'; end if;
  if auth.uid() is null or not (public.fn_pat_inv_pode_conduzir(v.id) or public.fn_pat_inv_membro(v.id)) then
    raise exception 'PAT_SEM_PERMISSAO: só a comissão ou o gestor reabre a conferência';
  end if;
  if v.situacao <> 'em_assinatura' then raise exception 'PAT_DADOS: só se reabre um inventário em assinatura'; end if;
  if length(coalesce(btrim(p_motivo), '')) < 10 then raise exception 'PAT_DADOS: explique por que reabrir (10+ caracteres)'; end if;
  perform set_config('dima.pat_evento', '1', true);
  update pat_inventarios set situacao = 'em_andamento', hash = null, enviado_por = null, enviado_em = null,
         observacao = concat_ws(E'\n', observacao, to_char(now() at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI')
                                || ' — reaberto: ' || btrim(p_motivo))
   where id = v.id;
  perform set_config('dima.pat_evento', '', true);
end $$;

-- ── Cancelar campanha ───────────────────────────────────────────────────────
create or replace function public.fn_pat_inv_cancelar(p_inv uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v pat_inventarios%rowtype; c record;
begin
  select * into v from pat_inventarios where id = p_inv for update;
  if v.id is null then raise exception 'PAT_DADOS: inventário não encontrado'; end if;
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO: só o gestor cancela o inventário'; end if;
  if v.situacao not in ('em_andamento','em_assinatura') then raise exception 'PAT_DADOS: o inventário já está %', v.situacao; end if;
  if length(coalesce(btrim(p_motivo), '')) < 10 then raise exception 'PAT_DADOS: explique o cancelamento (10+ caracteres)'; end if;
  perform set_config('dima.pat_evento', '1', true);
  update pat_inventarios set situacao = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(),
         motivo_cancelamento = btrim(p_motivo) where id = v.id;
  for c in select tarefa_id from pat_inventario_comissao where inventario_id = v.id and tarefa_id is not null loop
    perform fn_lic_fechar_tarefa(c.tarefa_id, 'cancelada', auth.uid(), 'Inventário ' || v.numero || ' cancelado: ' || btrim(p_motivo));
  end loop;
  perform set_config('dima.pat_evento', '', true);
end $$;

-- ── Assinar (só service_role, pela Edge Function com a senha) ───────────────
create or replace function public.fn_pat_inv_assinar(p_usuario_id uuid, p_inv uuid, p_hash text,
  p_ip text default null, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v pat_inventarios%rowtype; v_hash text; v_faltam int; i record; b pat_bens%rowtype; v_pres uuid;
  v_oc uuid; v_ocnum text; v_tar uuid; v_div text := ''; v_ndiv int := 0; v_nconf int := 0; v_next int := 0; v_naus int := 0;
  v_cond_ev text;
begin
  select * into v from pat_inventarios where id = p_inv for update;
  if v.id is null then raise exception 'PAT_DADOS: inventário não encontrado'; end if;
  if v.situacao <> 'em_assinatura' then raise exception 'PAT_INV_FECHADO: o inventário não está em assinatura (%)', v.situacao; end if;
  if not public.fn_pat_inv_membro(v.id, p_usuario_id) then raise exception 'PAT_SEM_PERMISSAO: só a comissão assina o inventário'; end if;
  v_hash := public.fn_pat_inv_hash(v.id);
  if p_hash is distinct from v_hash or v_hash is distinct from v.hash then
    raise exception 'DOCUMENTO_ALTERADO: o resultado do inventário mudou desde que você abriu. Abra de novo.';
  end if;
  if exists (select 1 from pat_inventario_assinaturas where inventario_id = v.id and usuario_id = p_usuario_id and hash = v_hash) then
    raise exception 'PAT_DADOS: você já assinou este resultado';
  end if;

  perform set_config('dima.pat_evento', '1', true);
  insert into pat_inventario_assinaturas (inventario_id, usuario_id, hash, ip, user_agent)
  values (v.id, p_usuario_id, v_hash, p_ip, p_user_agent);
  select tarefa_id into v_tar from pat_inventario_comissao where inventario_id = v.id and usuario_id = p_usuario_id;
  perform fn_lic_fechar_tarefa(v_tar, 'concluida', p_usuario_id, 'Inventário ' || v.numero || ' assinado com senha.');

  select count(*) into v_faltam from pat_inventario_comissao m
   where m.inventario_id = v.id
     and not exists (select 1 from pat_inventario_assinaturas a where a.inventario_id = v.id and a.usuario_id = m.usuario_id and a.hash = v_hash);
  if v_faltam > 0 then
    perform set_config('dima.pat_evento', '', true);
    return jsonb_build_object('numero', v.numero, 'situacao', 'em_assinatura', 'faltam', v_faltam);
  end if;

  -- ── última assinatura: efetiva ──
  select usuario_id into v_pres from pat_inventario_comissao where inventario_id = v.id and papel = 'presidente';
  for i in select it.*, le.nome as local_esp_nome, lf.nome as local_enc_nome
             from pat_inventario_itens it
             left join pat_locais le on le.id = it.local_esperado
             left join pat_locais lf on lf.id = it.local_encontrado
            where it.inventario_id = v.id and (it.esperado or it.resultado <> 'pendente') loop
    select * into b from pat_bens where id = i.bem_id for update;
    if b.situacao in ('anulado','baixado','transferido') then continue; end if;   -- saiu do patrimônio no meio tempo
    if i.conferido_em is not null then
      v_cond_ev := i.condicao_encontrada;
      update pat_bens set ultimo_inventario_em = current_date, local_id = i.local_encontrado, condicao = v_cond_ev where id = b.id;
      insert into pat_eventos (bem_id, tipo, local_de, local_para, condicao_de, condicao_para, detalhes, observacao, registrado_por)
      values (b.id, 'inventario', b.local_id, i.local_encontrado, b.condicao, v_cond_ev,
              jsonb_build_object('inventario_id', v.id, 'inventario', v.numero, 'resultado', i.resultado, 'metodo', i.metodo,
                                 'conferido_por', i.conferido_por, 'conferido_em', i.conferido_em),
              'Inventário ' || v.numero || coalesce(' · ' || i.observacao, ''), coalesce(i.conferido_por, v_pres));
      v_nconf := v_nconf + 1;
      if i.resultado <> 'conferido' or b.situacao = 'extraviado' then
        v_ndiv := v_ndiv + 1;
        v_div := v_div || E'\n• ' || b.numero || ' (' || b.descricao || '): '
          || case when b.situacao = 'extraviado' then 'estava extraviado e foi achado em ' || coalesce(i.local_enc_nome, '?')
                    || ' — conclua a ocorrência como "localizado"'
                  when i.resultado = 'nao_esperado' then 'achado em ' || coalesce(i.local_enc_nome, '?') || ', fora da lista do inventário'
                  when i.resultado = 'local_divergente' then 'esperado em ' || coalesce(i.local_esp_nome, 'local não informado')
                    || ', achado em ' || coalesce(i.local_enc_nome, '?')
                  else 'condição ' || i.condicao_esperada || ' → ' || i.condicao_encontrada end;
      end if;
    elsif i.situacao_esperada in ('emprestado','em_manutencao','extraviado') or b.situacao in ('emprestado','em_manutencao','extraviado') then
      v_naus := v_naus + 1;   -- ausente por registro: nada a fazer
    else
      -- esperado e não localizado ⇒ ocorrência de extravio
      v_ocnum := 'OC-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.pat_ocorrencias_numero_seq')::text, 4, '0');
      insert into pat_ocorrencias (numero, bem_id, tipo, dt_ocorrencia, onde, descricao, situacao_bem_antes, condicao_antes, registrado_por)
      values (v_ocnum, b.id, 'extravio', current_date, i.local_esp_nome,
              'Bem não localizado no inventário ' || v.numero || ' (' || v.titulo || '), assinado pela comissão em '
                || to_char(now() at time zone 'America/Rio_Branco', 'DD/MM/YYYY') || '.', b.situacao, b.condicao, v_pres)
      returning id into v_oc;
      update pat_bens set situacao = 'extraviado' where id = b.id;
      insert into pat_eventos (bem_id, tipo, dt_evento, condicao_de, condicao_para, detalhes, observacao, registrado_por)
      values (b.id, 'ocorrencia', current_date, b.condicao, b.condicao,
              jsonb_build_object('ocorrencia_id', v_oc, 'ocorrencia', v_ocnum, 'tipo', 'extravio', 'situacao_antes', b.situacao,
                                 'situacao_depois', 'extraviado', 'inventario', v.numero),
              'Não localizado no inventário ' || v.numero, v_pres);
      v_tar := public.fn_pat_criar_tarefa('Tratar ocorrência ' || v_ocnum || ' — ' || b.numero,
        'O bem ' || b.numero || ' (' || b.descricao || ') não foi localizado no inventário ' || v.numero || '. Procure o bem, '
          || 'ouça quem o guardava e registre o desfecho em Patrimônio › Ocorrências (localizado ou pedido de baixa).',
        public.fn_pat_gestor_padrao(), v_pres, current_date + 30, 'pat_ocorrencia', v_oc, 'alta');
      update pat_ocorrencias set tarefa_id = v_tar where id = v_oc;
      v_next := v_next + 1;
    end if;
  end loop;
  if v_ndiv > 0 then
    v_tar := public.fn_pat_criar_tarefa('Regularizar divergências do inventário ' || v.numero,
      v_ndiv || ' bem(ns) com divergência. O local e a condição já foram atualizados para o que a comissão encontrou; '
        || 'confira com quem guarda cada bem e faça o termo ou a transferência, se for o caso:' || v_div,
      public.fn_pat_gestor_padrao(), v_pres, current_date + 30, 'pat_inventario', v.id, 'media');
  end if;
  update pat_inventarios set situacao = 'concluido', concluido_em = now(), tarefa_regularizacao_id = v_tar where id = v.id;
  perform set_config('dima.pat_evento', '', true);
  return jsonb_build_object('numero', v.numero, 'situacao', 'concluido', 'conferidos', v_nconf, 'divergencias', v_ndiv,
                            'extravios', v_next, 'ausentes_por_registro', v_naus);
end $$;

-- ── Detalhe (tela, celular e relatório) ─────────────────────────────────────
create or replace function public.fn_pat_inv_detalhe(p_inv uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v pat_inventarios%rowtype; v_val boolean := public.fn_pat_pode_ver_valor(); v_atual text;
begin
  select * into v from pat_inventarios where id = p_inv;
  if v.id is null or auth.uid() is null or not public.fn_pat_inv_pode_ver(v.id) then
    raise exception 'PAT_SEM_PERMISSAO: inventário não encontrado ou sem acesso';
  end if;
  v_atual := coalesce(v.hash, public.fn_pat_inv_hash(v.id));
  return jsonb_build_object(
    'inventario', to_jsonb(v) || jsonb_build_object(
        'aberto_por_nome', (select nome_completo from usuarios where id = v.aberto_por),
        'locais_nomes', (select coalesce(jsonb_agg(l.nome order by l.nome), '[]'::jsonb) from pat_locais l where l.id = any (v.locais))),
    'hash_atual', v_atual,
    'eu_membro', public.fn_pat_inv_membro(v.id),
    'eu_conduzo', public.fn_pat_inv_pode_conduzir(v.id),
    'eu_assinei', exists (select 1 from pat_inventario_assinaturas a where a.inventario_id = v.id and a.usuario_id = auth.uid()
                           and a.hash = v.hash),
    'comissao', (select coalesce(jsonb_agg(jsonb_build_object(
        'usuario_id', c.usuario_id, 'nome', u.nome_completo, 'papel', c.papel, 'ordem', c.ordem,
        'assinado_em', (select max(a.assinado_em) from pat_inventario_assinaturas a
                         where a.inventario_id = v.id and a.usuario_id = c.usuario_id and a.hash = v.hash)) order by c.ordem), '[]'::jsonb)
      from pat_inventario_comissao c join usuarios u on u.id = c.usuario_id where c.inventario_id = v.id),
    'assinaturas_anteriores', (select count(*) from pat_inventario_assinaturas a where a.inventario_id = v.id
                                and a.hash is distinct from v.hash),
    'itens', (select coalesce(jsonb_agg(jsonb_build_object(
        'bem_id', b.id, 'numero', b.numero, 'descricao', b.descricao, 'marca', b.marca, 'modelo', b.modelo,
        'numero_serie', b.numero_serie, 'categoria', b.categoria_codigo, 'situacao_atual', b.situacao,
        'esperado', i.esperado, 'resultado', i.resultado,
        'local_esperado', i.local_esperado, 'local_esperado_nome', le.nome,
        'responsavel_esperado_nome', r.nome_completo, 'situacao_esperada', i.situacao_esperada,
        'condicao_esperada', i.condicao_esperada, 'local_encontrado', i.local_encontrado, 'local_encontrado_nome', lf.nome,
        'condicao_encontrada', i.condicao_encontrada, 'metodo', i.metodo, 'observacao', i.observacao,
        'conferido_por_nome', cp.nome_completo, 'conferido_em', i.conferido_em,
        'valor_contabil_brl', case when v_val then d.valor_contabil end) order by b.numero), '[]'::jsonb)
      from pat_inventario_itens i join pat_bens b on b.id = i.bem_id
      left join pat_locais le on le.id = i.local_esperado
      left join pat_locais lf on lf.id = i.local_encontrado
      left join usuarios r on r.id = i.responsavel_esperado
      left join usuarios cp on cp.id = i.conferido_por
      cross join lateral public.fn_pat_depreciacao(b.valor_aquisicao_brl, b.residual_pct, b.vida_util_meses,
                                                   b.dt_inicio_uso, coalesce((v.concluido_em at time zone 'America/Rio_Branco')::date, current_date),
                                                   b.dt_baixa) d
      where i.inventario_id = v.id and (i.esperado or i.resultado <> 'pendente')));
end $$;

-- lista para a tela (com contagens)
create or replace function public.fn_pat_inv_lista()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'numero', v.numero, 'titulo', v.titulo, 'tipo', v.tipo, 'situacao', v.situacao,
    'aberto_em', v.aberto_em, 'enviado_em', v.enviado_em, 'concluido_em', v.concluido_em, 'cancelado_em', v.cancelado_em,
    'locais_nomes', (select coalesce(jsonb_agg(l.nome order by l.nome), '[]'::jsonb) from pat_locais l where l.id = any (v.locais)),
    'esperados', (select count(*) from pat_inventario_itens i where i.inventario_id = v.id and i.esperado),
    'conferidos', (select count(*) from pat_inventario_itens i where i.inventario_id = v.id and i.conferido_em is not null),
    'divergentes', (select count(*) from pat_inventario_itens i where i.inventario_id = v.id
                     and i.resultado in ('local_divergente','condicao_divergente','nao_esperado')),
    'eu_membro', public.fn_pat_inv_membro(v.id),
    'falta_minha_assinatura', v.situacao = 'em_assinatura' and public.fn_pat_inv_membro(v.id)
       and not exists (select 1 from pat_inventario_assinaturas a where a.inventario_id = v.id and a.usuario_id = auth.uid() and a.hash = v.hash),
    'assinaturas', (select count(*) from pat_inventario_assinaturas a where a.inventario_id = v.id and a.hash = v.hash),
    'membros', (select count(*) from pat_inventario_comissao c where c.inventario_id = v.id)
  ) order by v.aberto_em desc), '[]'::jsonb)
  from pat_inventarios v
  where auth.uid() is not null and public.fn_pat_inv_pode_ver(v.id)
$$;

-- ── Permissões ──────────────────────────────────────────────────────────────
revoke execute on function public.fn_pat_inv_membro(uuid, uuid), public.fn_pat_inv_pode_ver(uuid), public.fn_pat_inv_hash(uuid),
  public.fn_pat_inv_abrir(jsonb), public.fn_pat_inv_conferir(jsonb), public.fn_pat_inv_desfazer(uuid, uuid),
  public.fn_pat_inv_pode_conduzir(uuid), public.fn_pat_inv_enviar(uuid), public.fn_pat_inv_reabrir(uuid, text),
  public.fn_pat_inv_cancelar(uuid, text), public.fn_pat_inv_assinar(uuid, uuid, text, text, text),
  public.fn_pat_inv_detalhe(uuid), public.fn_pat_inv_lista()
  from public, anon;
grant execute on function public.fn_pat_inv_membro(uuid, uuid), public.fn_pat_inv_pode_ver(uuid),
  public.fn_pat_inv_abrir(jsonb), public.fn_pat_inv_conferir(jsonb), public.fn_pat_inv_desfazer(uuid, uuid),
  public.fn_pat_inv_pode_conduzir(uuid), public.fn_pat_inv_enviar(uuid), public.fn_pat_inv_reabrir(uuid, text),
  public.fn_pat_inv_cancelar(uuid, text), public.fn_pat_inv_detalhe(uuid), public.fn_pat_inv_lista()
  to authenticated;
revoke execute on function public.fn_pat_inv_hash(uuid), public.fn_pat_inv_assinar(uuid, uuid, text, text, text) from authenticated;
grant execute on function public.fn_pat_inv_assinar(uuid, uuid, text, text, text) to service_role;
revoke execute on function public.fn_pat_trg_inv_guarda(), public.fn_pat_trg_inv_assinatura_imutavel() from public, anon, authenticated;
