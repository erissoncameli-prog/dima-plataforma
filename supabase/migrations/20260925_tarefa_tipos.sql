-- ════════════════════════════════════════════════════════════════════════
-- Tipos de tarefa (reunião, diligência, ação administrativa, análise, outras)
--  • tarefa_tipos: catálogo editável por super_admin/coordenação (sem DELETE —
--    desativar esconde o tipo na criação e preserva as tarefas antigas)
--  • tarefa_tipos.campos: lista dos campos próprios do tipo, ex.
--      [{"chave":"inicio","rotulo":"Início","tipo":"datetime","obrigatorio":true,"define_prazo":true}]
--    tipos de campo: text | textarea | url | date | datetime | select | boolean
--  • tarefas.tipo (obrigatório, padrão 'outras') + tarefas.dados_tipo (jsonb)
--  • tarefas.ics_sequencia: versão do convite de agenda (SEQUENCE do .ics),
--    incrementada quando data/local/link da reunião mudam ou ela é cancelada
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.tarefa_tipos (
  codigo     text primary key check (codigo ~ '^[a-z0-9_]{2,40}$'),
  nome       text not null,
  icone      text not null default '📌',
  cor        text not null default '#6B7280' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  ordem      int  not null default 100,
  ativo      boolean not null default true,
  campos     jsonb not null default '[]'::jsonb check (jsonb_typeof(campos) = 'array'),
  criado_em  timestamptz default now(),
  atualizado_em timestamptz default now()
);

insert into public.tarefa_tipos (codigo, nome, icone, cor, ordem, campos) values
('reuniao', 'Reunião / convite', '📅', '#2563EB', 10, '[
  {"chave":"inicio","rotulo":"Início","tipo":"datetime","obrigatorio":true,"define_prazo":true},
  {"chave":"fim","rotulo":"Término","tipo":"datetime"},
  {"chave":"formato","rotulo":"Formato","tipo":"select","opcoes":["Presencial","Online","Híbrida"],"obrigatorio":true},
  {"chave":"local","rotulo":"Local","tipo":"text","dica":"Endereço ou sala (presencial/híbrida)"},
  {"chave":"link","rotulo":"Link","tipo":"url","dica":"Meet, Zoom, Teams… (online/híbrida)"},
  {"chave":"pauta","rotulo":"Pauta","tipo":"textarea"}
]'::jsonb),
('diligencia', 'Solicitação de diligência', '📨', '#B45309', 20, '[
  {"chave":"destinatario","rotulo":"Destinatário","tipo":"text","obrigatorio":true,"dica":"Órgão, instituição ou pessoa"},
  {"chave":"documento","rotulo":"Documento","tipo":"text","dica":"Nº do ofício, processo ou protocolo"},
  {"chave":"prazo_resposta","rotulo":"Prazo de resposta","tipo":"date","define_prazo":true},
  {"chave":"respondida","rotulo":"Respondida","tipo":"boolean"},
  {"chave":"dt_resposta","rotulo":"Data da resposta","tipo":"date"}
]'::jsonb),
('acao_administrativa', 'Ação administrativa', '🗂', '#7C3AED', 30, '[]'::jsonb),
('analise', 'Análise / revisão', '🔍', '#0D9488', 40, '[]'::jsonb),
('outras', 'Outras', '📌', '#6B7280', 90, '[]'::jsonb)
on conflict (codigo) do nothing;

alter table public.tarefas
  add column if not exists tipo text not null default 'outras' references public.tarefa_tipos(codigo),
  add column if not exists dados_tipo jsonb not null default '{}'::jsonb,
  add column if not exists ics_sequencia int not null default 0;
create index if not exists idx_tarefas_tipo on public.tarefas(tipo) where ativo;

-- ── RLS do catálogo ─────────────────────────────────────────────────────
alter table public.tarefa_tipos enable row level security;
drop policy if exists ttipo_select on public.tarefa_tipos;
create policy ttipo_select on public.tarefa_tipos for select to authenticated using (true);
drop policy if exists ttipo_insert on public.tarefa_tipos;
create policy ttipo_insert on public.tarefa_tipos for insert to authenticated
  with check (fn_perfil_atual() in ('super_admin','coordenacao'));
drop policy if exists ttipo_update on public.tarefa_tipos;
create policy ttipo_update on public.tarefa_tipos for update to authenticated
  using (fn_perfil_atual() in ('super_admin','coordenacao'))
  with check (fn_perfil_atual() in ('super_admin','coordenacao'));
grant select, insert, update on public.tarefa_tipos to authenticated;

-- 'outras' é o padrão: não pode ser desativado; código é imutável
create or replace function fn_tarefa_tipo_guarda() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.codigo <> old.codigo then raise exception 'o código do tipo não pode mudar'; end if;
  if old.codigo = 'outras' and not new.ativo then raise exception 'o tipo "Outras" é o padrão e não pode ser desativado'; end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists trg_tarefa_tipo_guarda on public.tarefa_tipos;
create trigger trg_tarefa_tipo_guarda before update on public.tarefa_tipos
  for each row execute function fn_tarefa_tipo_guarda();

-- ── Validação do tipo + versão do convite ───────────────────────────────
create or replace function fn_tarefa_valida_tipo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tipo tarefa_tipos; c jsonb;
begin
  if tg_op = 'UPDATE' and new.tipo is not distinct from old.tipo
     and new.dados_tipo is not distinct from old.dados_tipo then
    -- só a versão do convite pode precisar mudar (cancelamento / título)
    if new.tipo = 'reuniao' and (new.status is distinct from old.status and new.status = 'cancelada'
        or new.titulo is distinct from old.titulo) then
      new.ics_sequencia := old.ics_sequencia + 1;
    end if;
    return new;
  end if;

  new.dados_tipo := coalesce(new.dados_tipo, '{}'::jsonb);
  select * into v_tipo from tarefa_tipos where codigo = new.tipo;
  if not found then raise exception 'tipo de tarefa inválido: %', new.tipo; end if;
  if not v_tipo.ativo and (tg_op = 'INSERT' or new.tipo is distinct from old.tipo) then
    raise exception 'o tipo "%" está desativado', v_tipo.nome;
  end if;
  for c in select * from jsonb_array_elements(v_tipo.campos) loop
    if coalesce((c->>'obrigatorio')::boolean, false)
       and coalesce(btrim(new.dados_tipo->>(c->>'chave')), '') = '' then
      raise exception 'campo obrigatório do tipo "%": %', v_tipo.nome, c->>'rotulo';
    end if;
  end loop;

  if tg_op = 'UPDATE' and new.tipo = 'reuniao' and (
       new.tipo is distinct from old.tipo
       or new.titulo is distinct from old.titulo
       or new.dados_tipo is distinct from old.dados_tipo
       or (new.status is distinct from old.status and new.status = 'cancelada')) then
    new.ics_sequencia := old.ics_sequencia + 1;
  end if;
  return new;
end $$;
revoke execute on function fn_tarefa_valida_tipo() from public, authenticated, anon;
drop trigger if exists trg_tarefa_valida_tipo on public.tarefas;
create trigger trg_tarefa_valida_tipo before insert or update on public.tarefas
  for each row execute function fn_tarefa_valida_tipo();

-- histórico da troca de tipo
create or replace function fn_tarefa_tipo_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_de text; v_para text;
begin
  if new.tipo is not distinct from old.tipo then return null; end if;
  select nome into v_de from tarefa_tipos where codigo = old.tipo;
  select nome into v_para from tarefa_tipos where codigo = new.tipo;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para)
  values (new.id, auth.uid(), 'tipo', v_de, v_para);
  return null;
end $$;
revoke execute on function fn_tarefa_tipo_historico() from public, authenticated, anon;
drop trigger if exists trg_tarefa_tipo_historico on public.tarefas;
create trigger trg_tarefa_tipo_historico after update of tipo on public.tarefas
  for each row execute function fn_tarefa_tipo_historico();

-- ── fn_criar_tarefa: + p_tipo, p_dados_tipo ─────────────────────────────
drop function if exists fn_criar_tarefa(text,text,prioridade_tarefa,date,date,text,uuid,uuid,uuid,boolean,uuid[],uuid[],boolean);

create or replace function fn_criar_tarefa(
  p_titulo               text,
  p_descricao            text            default null,
  p_prioridade           prioridade_tarefa default 'media',
  p_dt_inicio            date            default null,
  p_dt_prazo             date            default null,
  p_entidade_tipo        text            default null,
  p_entidade_id          uuid            default null,
  p_atividade_id         uuid            default null,
  p_fornecedor_id        uuid            default null,
  p_notificar_fornecedor boolean         default false,
  p_responsaveis         uuid[]          default '{}',
  p_observadores         uuid[]          default '{}',
  p_restrita             boolean         default false,
  p_tipo                 text            default 'outras',
  p_dados_tipo           jsonb           default '{}'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid;
  v_caller  uuid := auth.uid();
  v_delega  boolean;
  u         uuid;
  v_titulo  text;
  v_obs     uuid[];
begin
  if v_caller is null then raise exception 'não autenticado'; end if;
  if coalesce(btrim(p_titulo),'') = '' then raise exception 'título obrigatório'; end if;

  v_delega := exists (
      select 1 from unnest(coalesce(p_responsaveis,'{}')) x where x <> v_caller
    ) or coalesce(array_length(p_observadores,1),0) > 0
      or p_fornecedor_id is not null
      or p_atividade_id is not null;

  if v_delega and not fn_tarefa_pode_delegar(p_atividade_id) then
    raise exception 'sem permissão para delegar tarefas a terceiros';
  end if;

  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo,
                       entidade_tipo, entidade_id, atividade_id,
                       fornecedor_id, notificar_fornecedor, criado_por, restrita,
                       tipo, dados_tipo)
  values (btrim(p_titulo), p_descricao, coalesce(p_prioridade,'media'),
          p_dt_inicio, p_dt_prazo, p_entidade_tipo, p_entidade_id, p_atividade_id,
          p_fornecedor_id, coalesce(p_notificar_fornecedor,false), v_caller,
          coalesce(p_restrita,false), coalesce(p_tipo,'outras'), coalesce(p_dados_tipo,'{}'))
  returning id into v_id;

  if coalesce(array_length(p_responsaveis,1),0) = 0 then
    p_responsaveis := array[v_caller];
  end if;

  foreach u in array coalesce(p_responsaveis,'{}') loop
    if u is not null then
      insert into tarefa_participantes (tarefa_id, usuario_id, papel)
      values (v_id, u, 'responsavel') on conflict (tarefa_id, usuario_id) do nothing;
    end if;
  end loop;

  foreach u in array coalesce(p_observadores,'{}') loop
    if u is not null then
      insert into tarefa_participantes (tarefa_id, usuario_id, papel)
      values (v_id, u, 'observador')
      on conflict (tarefa_id, usuario_id) do update set papel = excluded.papel;
    end if;
  end loop;

  select codigo into v_titulo from tarefas where id = v_id;

  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (v_id, v_caller, 'criacao', btrim(p_titulo));

  perform fn_tarefa_notificar(
    p_responsaveis, 'tarefa_atribuida',
    'Nova tarefa: ' || coalesce(v_titulo,''),
    btrim(p_titulo), v_id, v_caller);

  select array_agg(usuario_id) into v_obs from tarefa_participantes
  where tarefa_id = v_id and papel = 'observador';
  perform fn_tarefa_notificar(
    v_obs, 'tarefa_observador',
    'Você acompanha: ' || coalesce(v_titulo,''),
    btrim(p_titulo), v_id, v_caller);

  return v_id;
end $$;

revoke execute on function fn_criar_tarefa(text,text,prioridade_tarefa,date,date,text,uuid,uuid,uuid,boolean,uuid[],uuid[],boolean,text,jsonb) from public, anon;
grant  execute on function fn_criar_tarefa(text,text,prioridade_tarefa,date,date,text,uuid,uuid,uuid,boolean,uuid[],uuid[],boolean,text,jsonb) to authenticated;

-- ── fn_editar_tarefa: + p_tipo, p_dados_tipo (NULL = mantém) ────────────
drop function if exists fn_editar_tarefa(uuid,text,text,prioridade_tarefa,date,text,uuid,uuid,uuid,boolean);

create or replace function fn_editar_tarefa(
  p_tarefa_id uuid, p_titulo text, p_descricao text, p_prioridade prioridade_tarefa,
  p_dt_inicio date, p_entidade_tipo text, p_entidade_id uuid, p_atividade_id uuid,
  p_fornecedor_id uuid, p_notificar_fornecedor boolean,
  p_tipo text default null, p_dados_tipo jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão para editar esta tarefa';
  end if;
  update tarefas set
    titulo = coalesce(btrim(p_titulo), titulo),
    descricao = p_descricao,
    prioridade = coalesce(p_prioridade, prioridade),
    dt_inicio = p_dt_inicio,
    entidade_tipo = p_entidade_tipo, entidade_id = p_entidade_id,
    atividade_id = p_atividade_id,
    fornecedor_id = p_fornecedor_id,
    notificar_fornecedor = coalesce(p_notificar_fornecedor, notificar_fornecedor),
    tipo = coalesce(p_tipo, tipo),
    dados_tipo = coalesce(p_dados_tipo, dados_tipo)
  where id = p_tarefa_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo) values (p_tarefa_id, auth.uid(), 'edicao');
end $$;

revoke execute on function fn_editar_tarefa(uuid,text,text,prioridade_tarefa,date,text,uuid,uuid,uuid,boolean,text,jsonb) from public, anon;
grant  execute on function fn_editar_tarefa(uuid,text,text,prioridade_tarefa,date,text,uuid,uuid,uuid,boolean,text,jsonb) to authenticated;
