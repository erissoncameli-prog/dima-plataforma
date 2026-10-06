-- ════════════════════════════════════════════════════════════════════════
-- Pulso da Equipe — questionário curto de comprometimento e sintonia
--
-- 6 perguntas objetivas + 1 livre, aberto por QR Code. Responde quem tem o
-- QR: logado ⇒ entra com o perfil do cadastro; sem login ⇒ "convidado".
--
-- ANONIMATO (regra do módulo):
--   · pulso_respostas NÃO tem usuario_id nem hora — só o grupo de perfil e o dia.
--   · Quem respondeu fica em pulso_participacoes, tabela separada, só para
--     impedir resposta dupla. Nenhum perfil lê essas tabelas direto: não há
--     policy de leitura nem de escrita para o cliente.
--   · Resultado só por fn_pulso_resultado, que suprime recorte com < 5 respostas.
--   · Perfil vem do banco (auth.uid()), nunca do navegador.
--
-- Acesso anônimo SEM grant de tabela ao anon: só as RPCs fn_publico_pulso_*
-- (SECURITY DEFINER), no padrão do portal público.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.pulso_ciclos (
  id                 uuid primary key default gen_random_uuid(),
  titulo             text not null check (length(btrim(titulo)) between 3 and 120),
  token              text not null unique
                     default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  status             text not null default 'aberto' check (status in ('aberto','encerrado')),
  aceita_convidados  boolean not null default true,
  limite_convidados  integer check (limite_convidados is null or limite_convidados > 0),
  fecha_em           timestamptz,
  criado_por         uuid references public.usuarios(id),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
comment on table public.pulso_ciclos is
  'Pulso da Equipe: uma aplicação do questionário (ciclo). O token vai no QR Code.';

create table if not exists public.pulso_respostas (
  id            uuid primary key default gen_random_uuid(),
  ciclo_id      uuid not null references public.pulso_ciclos(id),
  perfil_grupo  text not null check (perfil_grupo in
                  ('coordenacao','tecnico','financeiro','consultor_externo','visualizador','convidado')),
  q1 smallint not null check (q1 between 1 and 5),
  q2 smallint not null check (q2 between 1 and 5),
  q3 smallint not null check (q3 between 1 and 5),
  q4 smallint not null check (q4 between 1 and 5),
  q5 smallint not null check (q5 between 1 and 5),
  q6 smallint not null check (q6 between 0 and 10),
  texto_livre   text check (texto_livre is null or length(texto_livre) <= 1000),
  dia           date not null default current_date
);
comment on table public.pulso_respostas is
  'Respostas ANÔNIMAS do Pulso. Sem usuario_id e sem hora, de propósito: não acrescentar colunas que identifiquem quem respondeu.';
create index if not exists idx_pulso_respostas_ciclo on public.pulso_respostas (ciclo_id);

create table if not exists public.pulso_participacoes (
  id                uuid primary key default gen_random_uuid(),
  ciclo_id          uuid not null references public.pulso_ciclos(id),
  usuario_id        uuid references public.usuarios(id),
  -- convidado: sha256(ciclo || id aleatório do aparelho). Barreira contra
  -- resposta repetida no mesmo aparelho, não prova de identidade.
  dispositivo_hash  text,
  dia               date not null default current_date,
  check (usuario_id is not null or dispositivo_hash is not null)
);
comment on table public.pulso_participacoes is
  'Quem já respondeu cada ciclo (só para impedir duplicidade). Nunca juntar com pulso_respostas.';
create unique index if not exists uq_pulso_part_usuario
  on public.pulso_participacoes (ciclo_id, usuario_id) where usuario_id is not null;
create unique index if not exists uq_pulso_part_convidado
  on public.pulso_participacoes (ciclo_id, dispositivo_hash) where usuario_id is null;
create index if not exists idx_pulso_part_disp on public.pulso_participacoes (ciclo_id, dispositivo_hash);

-- Pergunta-espelho: a coordenação diz que média ESPERA da equipe antes de ver.
create table if not exists public.pulso_espelho (
  ciclo_id    uuid not null references public.pulso_ciclos(id),
  usuario_id  uuid not null references public.usuarios(id),
  q1 numeric(3,1) not null check (q1 between 1 and 5),
  q2 numeric(3,1) not null check (q2 between 1 and 5),
  q3 numeric(3,1) not null check (q3 between 1 and 5),
  q4 numeric(3,1) not null check (q4 between 1 and 5),
  q5 numeric(3,1) not null check (q5 between 1 and 5),
  criado_em   timestamptz not null default now(),
  primary key (ciclo_id, usuario_id)
);

alter table public.pulso_ciclos        enable row level security;
alter table public.pulso_respostas     enable row level security;
alter table public.pulso_participacoes enable row level security;
alter table public.pulso_espelho       enable row level security;
revoke all on public.pulso_ciclos, public.pulso_respostas,
              public.pulso_participacoes, public.pulso_espelho from anon, authenticated, public;
-- Tudo passa pelas funções abaixo. Não criar policy nem grant nessas tabelas.

create or replace function public.fn_pulso_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.atualizado_em := now(); return new; end $$;
revoke execute on function public.fn_pulso_touch() from public, anon, authenticated;
create or replace trigger trg_pulso_ciclos_touch before update on public.pulso_ciclos
  for each row execute function public.fn_pulso_touch();

-- ── Regras ───────────────────────────────────────────────────────────────
create or replace function public.fn_pulso_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u
                 where u.id = auth.uid() and u.ativo
                   and u.perfil in ('super_admin','coordenacao'))
$$;
revoke execute on function public.fn_pulso_gestor() from public, anon;
grant execute on function public.fn_pulso_gestor() to authenticated;

-- Grupo de perfil de quem está chamando. super_admin conta como coordenação
-- (grupo de 1 pessoa não teria recorte). Sem login ou inativo ⇒ convidado.
create or replace function public.fn_pulso_grupo_atual() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when u.perfil in ('super_admin','coordenacao') then 'coordenacao'
                else u.perfil::text end
    from public.usuarios u where u.id = auth.uid() and u.ativo), 'convidado')
$$;
revoke execute on function public.fn_pulso_grupo_atual() from public, anon, authenticated;

create or replace function public.fn_pulso_aberto(c public.pulso_ciclos) returns boolean
language sql stable as $$
  select c.status = 'aberto' and (c.fecha_em is null or now() < c.fecha_em)
$$;
revoke execute on function public.fn_pulso_aberto(public.pulso_ciclos) from public, anon, authenticated;

create or replace function public.fn_pulso_hash_disp(p_ciclo uuid, p_disp text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(p_ciclo::text || ':' || p_disp, 'UTF8')), 'hex')
$$;
revoke execute on function public.fn_pulso_hash_disp(uuid, text) from public, anon, authenticated;

-- ── Público (QR Code) ────────────────────────────────────────────────────
-- Diz à página de resposta o que mostrar. Não devolve nada do usuário além
-- do grupo de perfil em que a resposta será contada.
create or replace function public.fn_publico_pulso_ciclo(p_token text, p_dispositivo text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c        public.pulso_ciclos;
  v_grupo  text := public.fn_pulso_grupo_atual();
  v_ja     boolean := false;
  v_lotado boolean := false;
begin
  select * into c from public.pulso_ciclos where token = p_token;
  if not found then return jsonb_build_object('encontrado', false); end if;

  if v_grupo <> 'convidado' then
    v_ja := exists (select 1 from public.pulso_participacoes
                    where ciclo_id = c.id and usuario_id = auth.uid());
  elsif p_dispositivo is not null then
    v_ja := exists (select 1 from public.pulso_participacoes
                    where ciclo_id = c.id
                      and dispositivo_hash = public.fn_pulso_hash_disp(c.id, p_dispositivo));
  end if;
  if c.limite_convidados is not null then
    v_lotado := (select count(*) from public.pulso_participacoes
                 where ciclo_id = c.id and usuario_id is null) >= c.limite_convidados;
  end if;

  return jsonb_build_object(
    'encontrado', true,
    'titulo', c.titulo,
    'aberto', public.fn_pulso_aberto(c),
    'aceita_convidados', c.aceita_convidados and not v_lotado,
    'cadastrado', v_grupo <> 'convidado',
    'perfil_grupo', v_grupo,
    'ja_respondeu', v_ja);
end $$;
revoke execute on function public.fn_publico_pulso_ciclo(text, text) from public;
grant execute on function public.fn_publico_pulso_ciclo(text, text) to anon, authenticated;

-- Grava a resposta e a participação na MESMA transação, em tabelas separadas.
-- p_respostas = {"q1":1..5, …, "q5":1..5, "q6":0..10, "texto":"…"}
create or replace function public.fn_publico_pulso_responder(
  p_token text, p_respostas jsonb, p_dispositivo text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c        public.pulso_ciclos;
  v_grupo  text := public.fn_pulso_grupo_atual();
  v_hash   text;
  v_texto  text := nullif(btrim(coalesce(p_respostas->>'texto', '')), '');
  q        smallint[];
  k        int;
begin
  select * into c from public.pulso_ciclos where token = p_token for update;
  if not found then raise exception 'pulso:ciclo_inexistente'; end if;
  if not public.fn_pulso_aberto(c) then raise exception 'pulso:ciclo_encerrado'; end if;

  -- respostas objetivas: todas obrigatórias, inteiras e na faixa
  begin
    q := array[(p_respostas->>'q1')::smallint, (p_respostas->>'q2')::smallint,
               (p_respostas->>'q3')::smallint, (p_respostas->>'q4')::smallint,
               (p_respostas->>'q5')::smallint, (p_respostas->>'q6')::smallint];
  exception when others then raise exception 'pulso:resposta_invalida';
  end;
  for k in 1..5 loop
    if q[k] is null or q[k] not between 1 and 5 then raise exception 'pulso:resposta_invalida'; end if;
  end loop;
  if q[6] is null or q[6] not between 0 and 10 then raise exception 'pulso:resposta_invalida'; end if;
  if v_texto is not null and length(v_texto) > 1000 then raise exception 'pulso:texto_longo'; end if;

  if v_grupo <> 'convidado' then
    if exists (select 1 from public.pulso_participacoes
               where ciclo_id = c.id and usuario_id = auth.uid()) then
      raise exception 'pulso:ja_respondeu';
    end if;
    insert into public.pulso_participacoes (ciclo_id, usuario_id) values (c.id, auth.uid());
  else
    if not c.aceita_convidados then raise exception 'pulso:convidado_nao_aceito'; end if;
    if p_dispositivo is null or length(p_dispositivo) not between 16 and 100 then
      raise exception 'pulso:dispositivo_invalido';
    end if;
    v_hash := public.fn_pulso_hash_disp(c.id, p_dispositivo);
    if exists (select 1 from public.pulso_participacoes
               where ciclo_id = c.id and dispositivo_hash = v_hash) then
      raise exception 'pulso:ja_respondeu';
    end if;
    if c.limite_convidados is not null
       and (select count(*) from public.pulso_participacoes
            where ciclo_id = c.id and usuario_id is null) >= c.limite_convidados then
      raise exception 'pulso:limite_convidados';
    end if;
    insert into public.pulso_participacoes (ciclo_id, dispositivo_hash) values (c.id, v_hash);
  end if;

  insert into public.pulso_respostas (ciclo_id, perfil_grupo, q1, q2, q3, q4, q5, q6, texto_livre)
  values (c.id, v_grupo, q[1], q[2], q[3], q[4], q[5], q[6], v_texto);

  return jsonb_build_object('ok', true, 'perfil_grupo', v_grupo);
end $$;
revoke execute on function public.fn_publico_pulso_responder(text, jsonb, text) from public;
grant execute on function public.fn_publico_pulso_responder(text, jsonb, text) to anon, authenticated;

-- ── Gestão (super_admin / coordenação) ───────────────────────────────────
create or replace function public.fn_pulso_criar(
  p_titulo text, p_aceita_convidados boolean default true,
  p_limite_convidados integer default null, p_fecha_em timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.fn_pulso_gestor() then raise exception 'pulso:sem_permissao'; end if;
  insert into public.pulso_ciclos (titulo, aceita_convidados, limite_convidados, fecha_em, criado_por)
  values (btrim(p_titulo), coalesce(p_aceita_convidados, true), p_limite_convidados, p_fecha_em, auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.fn_pulso_criar(text, boolean, integer, timestamptz) from public, anon;
grant execute on function public.fn_pulso_criar(text, boolean, integer, timestamptz) to authenticated;

-- Altera só as chaves presentes em p_dados: status, aceita_convidados,
-- limite_convidados (null = sem limite), fecha_em (null = sem prazo), titulo.
create or replace function public.fn_pulso_alterar(p_ciclo uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.fn_pulso_gestor() then raise exception 'pulso:sem_permissao'; end if;
  update public.pulso_ciclos set
    titulo            = case when p_dados ? 'titulo' then btrim(p_dados->>'titulo') else titulo end,
    status            = case when p_dados ? 'status' then p_dados->>'status' else status end,
    aceita_convidados = case when p_dados ? 'aceita_convidados' then (p_dados->>'aceita_convidados')::boolean else aceita_convidados end,
    limite_convidados = case when p_dados ? 'limite_convidados' then (p_dados->>'limite_convidados')::integer else limite_convidados end,
    fecha_em          = case when p_dados ? 'fecha_em' then (p_dados->>'fecha_em')::timestamptz else fecha_em end
  where id = p_ciclo;
  if not found then raise exception 'pulso:ciclo_inexistente'; end if;
end $$;
revoke execute on function public.fn_pulso_alterar(uuid, jsonb) from public, anon;
grant execute on function public.fn_pulso_alterar(uuid, jsonb) to authenticated;

create or replace function public.fn_pulso_salvar_espelho(p_ciclo uuid, p_q jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.fn_pulso_gestor() then raise exception 'pulso:sem_permissao'; end if;
  insert into public.pulso_espelho (ciclo_id, usuario_id, q1, q2, q3, q4, q5)
  values (p_ciclo, auth.uid(), (p_q->>'q1')::numeric, (p_q->>'q2')::numeric,
          (p_q->>'q3')::numeric, (p_q->>'q4')::numeric, (p_q->>'q5')::numeric)
  on conflict (ciclo_id, usuario_id) do update set
    q1 = excluded.q1, q2 = excluded.q2, q3 = excluded.q3, q4 = excluded.q4, q5 = excluded.q5,
    criado_em = now();
end $$;
revoke execute on function public.fn_pulso_salvar_espelho(uuid, jsonb) from public, anon;
grant execute on function public.fn_pulso_salvar_espelho(uuid, jsonb) to authenticated;

-- Métricas de um conjunto de respostas (interna; quem chama aplica a supressão).
--   comprometimento = média de Q1..Q5 levada a 0–100
--   sintonia        = 100 − desvio-padrão médio de Q1..Q5 ÷ 2 (máximo teórico) × 100
--   eNPS            = % notas 9–10 − % notas 0–6 (Q6)
create or replace function public.fn_pulso_metricas(p_ciclo uuid, p_grupos text[])
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (
    select * from public.pulso_respostas
    where ciclo_id = p_ciclo and (p_grupos is null or perfil_grupo = any (p_grupos))
  ), m as (
    select count(*) n,
      avg(q1) m1, avg(q2) m2, avg(q3) m3, avg(q4) m4, avg(q5) m5, avg(q6) m6,
      stddev_pop(q1) d1, stddev_pop(q2) d2, stddev_pop(q3) d3, stddev_pop(q4) d4, stddev_pop(q5) d5,
      count(*) filter (where q6 >= 9) prom, count(*) filter (where q6 <= 6) detr
    from r
  )
  select jsonb_build_object(
    'n', n,
    'medias', jsonb_build_array(round(m1,2), round(m2,2), round(m3,2), round(m4,2), round(m5,2), round(m6,2)),
    'desvios', jsonb_build_array(round(d1,2), round(d2,2), round(d3,2), round(d4,2), round(d5,2)),
    'comprometimento', round(((m1+m2+m3+m4+m5)/5 - 1) / 4 * 100),
    'sintonia', greatest(0, round(100 - (d1+d2+d3+d4+d5)/5 / 2 * 100)),
    'enps', round((prom - detr) * 100.0 / nullif(n, 0)),
    'distribuicao', (select jsonb_build_array(
        (select jsonb_agg((select count(*) from r where q1 = v)) from generate_series(1,5) v),
        (select jsonb_agg((select count(*) from r where q2 = v)) from generate_series(1,5) v),
        (select jsonb_agg((select count(*) from r where q3 = v)) from generate_series(1,5) v),
        (select jsonb_agg((select count(*) from r where q4 = v)) from generate_series(1,5) v),
        (select jsonb_agg((select count(*) from r where q5 = v)) from generate_series(1,5) v),
        (select jsonb_agg((select count(*) from r where q6 = v)) from generate_series(0,10) v)))
  ) from m
$$;
revoke execute on function public.fn_pulso_metricas(uuid, text[]) from public, anon, authenticated;

-- Lista de ciclos com contagens e índices (índices só com ≥ 5 respostas).
create or replace function public.fn_pulso_ciclos()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.fn_pulso_gestor() then raise exception 'pulso:sem_permissao'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'criado_em' desc) from (
      select jsonb_build_object(
        'id', c.id, 'titulo', c.titulo, 'token', c.token, 'status', c.status,
        'aberto', public.fn_pulso_aberto(c),
        'aceita_convidados', c.aceita_convidados, 'limite_convidados', c.limite_convidados,
        'fecha_em', c.fecha_em, 'criado_em', c.criado_em,
        'n_respostas', p.n, 'n_cadastrados', p.cad, 'n_convidados', p.conv,
        'indices', case when p.n >= 5 then (
            select jsonb_build_object('comprometimento', mt->'comprometimento',
                                      'sintonia', mt->'sintonia', 'enps', mt->'enps')
            from public.fn_pulso_metricas(c.id, null) mt) end
      ) x
      from public.pulso_ciclos c
      cross join lateral (
        select count(*) n, count(usuario_id) cad, count(*) - count(usuario_id) conv
        from public.pulso_participacoes where ciclo_id = c.id) p
    ) s), '[]'::jsonb);
end $$;
revoke execute on function public.fn_pulso_ciclos() from public, anon;
grant execute on function public.fn_pulso_ciclos() to authenticated;

-- Resultado de um ciclo, com supressão: nada com menos de 5 respostas.
-- Grupo de perfil com < 5 entra em "demais perfis" (se a soma der ≥ 5).
-- Texto livre sai embaralhado e sem perfil.
create or replace function public.fn_pulso_resultado(p_ciclo uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c          public.pulso_ciclos;
  v_min      constant int := 5;
  v_n        int;
  v_grupos   jsonb := '[]'::jsonb;
  v_peq      text[] := '{}';
  v_n_peq    int := 0;
  g          record;
  v_esp      jsonb;
begin
  if not public.fn_pulso_gestor() then raise exception 'pulso:sem_permissao'; end if;
  select * into c from public.pulso_ciclos where id = p_ciclo;
  if not found then raise exception 'pulso:ciclo_inexistente'; end if;

  select count(*) into v_n from public.pulso_respostas where ciclo_id = p_ciclo;

  select jsonb_build_object(
      'n_gestores', count(*),
      'medias', jsonb_build_array(round(avg(q1),2), round(avg(q2),2), round(avg(q3),2), round(avg(q4),2), round(avg(q5),2)),
      'meu', (select jsonb_build_array(e.q1, e.q2, e.q3, e.q4, e.q5) from public.pulso_espelho e
              where e.ciclo_id = p_ciclo and e.usuario_id = auth.uid()))
    into v_esp
  from public.pulso_espelho where ciclo_id = p_ciclo;

  if v_n < v_min then
    return jsonb_build_object('ciclo', to_jsonb(c) - 'criado_por', 'n', v_n, 'minimo', v_min,
                              'suprimido', true, 'espelho', v_esp,
                              'participacao', public.fn_pulso_participacao(p_ciclo));
  end if;

  for g in select perfil_grupo, count(*) n from public.pulso_respostas
           where ciclo_id = p_ciclo group by perfil_grupo order by perfil_grupo loop
    if g.n >= v_min then
      v_grupos := v_grupos || jsonb_build_array(jsonb_build_object('grupo', g.perfil_grupo)
                             || public.fn_pulso_metricas(p_ciclo, array[g.perfil_grupo]));
    else
      v_peq := v_peq || g.perfil_grupo::text; v_n_peq := v_n_peq + g.n;
    end if;
  end loop;
  -- só faz sentido separar "demais" se houver ao menos um grupo próprio
  if v_n_peq >= v_min and jsonb_array_length(v_grupos) > 0 then
    v_grupos := v_grupos || jsonb_build_array(jsonb_build_object('grupo', 'demais')
                           || public.fn_pulso_metricas(p_ciclo, v_peq));
  end if;

  return jsonb_build_object(
    'ciclo', to_jsonb(c) - 'criado_por', 'n', v_n, 'minimo', v_min, 'suprimido', false,
    'geral', public.fn_pulso_metricas(p_ciclo, null),
    'grupos', v_grupos,
    'textos', coalesce((select jsonb_agg(texto_livre order by random()) from public.pulso_respostas
                        where ciclo_id = p_ciclo and texto_livre is not null), '[]'::jsonb),
    'espelho', v_esp,
    'participacao', public.fn_pulso_participacao(p_ciclo));
end $$;

-- Participação: contagens apenas (quem respondeu nunca sai daqui).
create or replace function public.fn_pulso_participacao(p_ciclo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cadastrados', (select count(*) from public.pulso_participacoes where ciclo_id = p_ciclo and usuario_id is not null),
    'convidados',  (select count(*) from public.pulso_participacoes where ciclo_id = p_ciclo and usuario_id is null),
    'usuarios_ativos', (select count(*) from public.usuarios where ativo))
$$;
revoke execute on function public.fn_pulso_participacao(uuid) from public, anon, authenticated;
revoke execute on function public.fn_pulso_resultado(uuid) from public, anon;
grant execute on function public.fn_pulso_resultado(uuid) to authenticated;

-- Contador ao vivo da tela do QR (só o número).
create or replace function public.fn_pulso_contagem(p_ciclo uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  if not public.fn_pulso_gestor() then raise exception 'pulso:sem_permissao'; end if;
  return (select count(*) from public.pulso_participacoes where ciclo_id = p_ciclo);
end $$;
revoke execute on function public.fn_pulso_contagem(uuid) from public, anon;
grant execute on function public.fn_pulso_contagem(uuid) to authenticated;

-- ── ROPA (tabela nova com dado pessoal = linha nova na mesma entrega) ────
insert into public.lgpd_tratamentos (
  codigo, nome, modulo, finalidade, operadores,
  base_legal, base_legal_detalhe,
  categorias_titulares, categorias_dados, dado_sensivel, dado_de_menor,
  tabelas, compartilhamento, transferencia_internacional,
  retencao_prazo, retencao_criterio, medidas_seguranca, ripd
) values (
  'TRAT-002',
  'Pulso da Equipe (questionário de comprometimento e sintonia)',
  'pulso',
  'Medir comprometimento, sintonia e clima da equipe do Projeto 218BRA2001 para orientar ações de gestão. Resultado só em agregado.',
  'Supabase (banco); Vercel (hospedagem)',
  'a_definir',
  'A definir com o jurídico. Candidata: art. 7º, III (gestão da execução da política pública). Participação voluntária; não usar consentimento como base.',
  array['membros da equipe com cadastro na plataforma','convidados que acessam pelo QR Code'],
  array['registro de que o usuário respondeu o ciclo (participação)','grupo de perfil',
        'percepções sobre o trabalho em escala (anônimas)','comentário livre (anônimo, pode identificar pelo conteúdo)',
        'identificador aleatório do aparelho do convidado (hash)'],
  false, false,
  array['pulso_participacoes','pulso_respostas','pulso_espelho'],
  'Nenhum. Uso interno da coordenação; devolutiva à equipe só em agregado.',
  'Supabase/Vercel (art. 33) — pendência geral do DIMA',
  null,
  'Respostas sem identificação permanecem para série histórica. Participação (quem respondeu) guardada até o encerramento do projeto; revisar prazo com o Encarregado.',
  'Resposta e participação em tabelas separadas, resposta sem usuário e sem hora; sem leitura direta das tabelas (só RPC); supressão de recorte com menos de 5 respostas; texto livre embaralhado e sem perfil; perfil determinado pelo servidor.',
  null
) on conflict (codigo) do nothing;
