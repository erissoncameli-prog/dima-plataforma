-- ════════════════════════════════════════════════════════════════════════
-- Pulso da Equipe · perguntas personalizáveis por ciclo
-- (em produção foi aplicada em partes: 20261006_pulso_c1 … c7, mesmo conteúdo;
--  o UPDATE do ROPA ficou em 20261006_pulso_equipe_c_ropa_sql_editor.sql)
--
-- · Qualquer usuário ativo cria ciclo. As perguntas moram no PRÓPRIO ciclo
--   (pulso_ciclos.perguntas, jsonb) e só o criador as edita — e só enquanto
--   o ciclo não tem nenhuma resposta (depois da 1ª, travam: o resultado tem
--   de corresponder ao texto que as pessoas leram).
-- · Ciclo nasce do padrão (fn_pulso_perguntas_padrao) ou como cópia das
--   perguntas de outro ciclo que a pessoa enxerga — a mesma chave em ciclos
--   diferentes = a mesma pergunta (série histórica).
-- · Tipos: escala (1–5), nps (0–10), escolha (única; guarda o ÍNDICE da
--   opção) e texto. Número de perguntas livre (teto técnico 40).
-- · Respostas em jsonb numa tabela nova (pulso_respostas_v2, mesma regra de
--   anonimato: sem usuário e sem hora). As linhas antigas são copiadas com o
--   mesmo id; pulso_respostas / pulso_espelho viram legado (não se escreve
--   mais nelas, nada é apagado).
-- · Visibilidade: o criador vê o próprio ciclo; super_admin/coordenação veem
--   todos (só leitura). Editar perguntas: só o criador. Encerrar/reabrir:
--   criador ou super_admin.
-- ════════════════════════════════════════════════════════════════════════

-- ── Perguntas padrão (as 7 do Pulso original) ───────────────────────────
create or replace function public.fn_pulso_perguntas_padrao() returns jsonb
language sql immutable as $$
  select '[
    {"chave":"q1","tipo":"escala","tema":"Propósito","texto":"Tenho clareza de como o meu trabalho contribui para os resultados do projeto.","obrigatoria":true,"indice":true,"invertida":false},
    {"chave":"q2","tipo":"escala","tema":"Dedicação","texto":"Nas últimas semanas, me dediquei ao projeto além do mínimo necessário.","obrigatoria":true,"indice":true,"invertida":false},
    {"chave":"q3","tipo":"escala","tema":"Sintonia","texto":"Sinto que a equipe está remando na mesma direção, com as mesmas prioridades.","obrigatoria":true,"indice":true,"invertida":false},
    {"chave":"q4","tipo":"escala","tema":"Confiança","texto":"Posso discordar, errar ou pedir ajuda nesta equipe sem receio.","obrigatoria":true,"indice":true,"invertida":false},
    {"chave":"q5","tipo":"escala","tema":"Condições","texto":"Tenho o que preciso (informação, decisões, ferramentas) para fazer bem o meu trabalho.","obrigatoria":true,"indice":true,"invertida":false},
    {"chave":"q6","tipo":"nps","tema":"Recomendação","texto":"De 0 a 10, quanto você recomendaria trabalhar nesta equipe a um colega?","obrigatoria":true},
    {"chave":"texto","tipo":"texto","tema":"Uma mudança","texto":"Se você pudesse mudar UMA coisa na forma como a equipe trabalha no próximo mês, qual seria?","obrigatoria":false}
  ]'::jsonb
$$;
revoke execute on function public.fn_pulso_perguntas_padrao() from public, anon;
grant execute on function public.fn_pulso_perguntas_padrao() to authenticated;

-- Valida e normaliza a lista de perguntas. Erro: 'pulso:perguntas_invalidas: <motivo>'.
create or replace function public.fn_pulso_validar_perguntas(p jsonb) returns jsonb
language plpgsql immutable as $$
declare
  v_saida  jsonb := '[]'::jsonb;
  v_chaves text[] := '{}';
  q        jsonb;
  v_tipo   text; v_chave text; v_texto text; v_tema text;
  v_ops    jsonb; v_op text; v_vistas text[];
  i        int := 0;
  o        jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then raise exception 'pulso:perguntas_invalidas: lista ausente'; end if;
  if jsonb_array_length(p) = 0 then raise exception 'pulso:perguntas_invalidas: inclua ao menos uma pergunta'; end if;
  if jsonb_array_length(p) > 40 then raise exception 'pulso:perguntas_invalidas: no máximo 40 perguntas'; end if;
  for q in select * from jsonb_array_elements(p) loop
    i := i + 1;
    if jsonb_typeof(q) <> 'object' then raise exception 'pulso:perguntas_invalidas: pergunta % mal formada', i; end if;
    v_tipo  := q->>'tipo';
    v_chave := q->>'chave';
    v_texto := btrim(coalesce(q->>'texto', ''));
    v_tema  := btrim(coalesce(q->>'tema', ''));
    if v_tipo is null or v_tipo not in ('escala','nps','escolha','texto') then
      raise exception 'pulso:perguntas_invalidas: tipo da pergunta % inválido', i; end if;
    if v_chave is null or v_chave !~ '^[a-z][a-z0-9_]{0,30}$' then
      raise exception 'pulso:perguntas_invalidas: chave da pergunta % inválida', i; end if;
    if v_chave = any (v_chaves) then raise exception 'pulso:perguntas_invalidas: chave % repetida', v_chave; end if;
    v_chaves := v_chaves || v_chave;
    if length(v_texto) < 3 or length(v_texto) > 300 then
      raise exception 'pulso:perguntas_invalidas: o texto da pergunta % deve ter de 3 a 300 caracteres', i; end if;
    if length(v_tema) > 40 then raise exception 'pulso:perguntas_invalidas: tema da pergunta % passa de 40 caracteres', i; end if;
    if v_tema = '' then v_tema := 'Pergunta ' || i; end if;

    o := jsonb_build_object('chave', v_chave, 'tipo', v_tipo, 'tema', v_tema, 'texto', v_texto,
           'obrigatoria', coalesce((q->>'obrigatoria')::boolean, v_tipo <> 'texto'));
    if v_tipo = 'escala' then
      o := o || jsonb_build_object('indice', coalesce((q->>'indice')::boolean, true),
                                   'invertida', coalesce((q->>'invertida')::boolean, false));
    elsif v_tipo = 'escolha' then
      v_ops := q->'opcoes';
      if v_ops is null or jsonb_typeof(v_ops) <> 'array' or jsonb_array_length(v_ops) < 2 or jsonb_array_length(v_ops) > 10 then
        raise exception 'pulso:perguntas_invalidas: a pergunta % precisa de 2 a 10 opções', i; end if;
      v_vistas := '{}';
      for v_op in select btrim(x) from jsonb_array_elements_text(v_ops) x loop
        if v_op = '' or length(v_op) > 80 then raise exception 'pulso:perguntas_invalidas: opção vazia ou longa na pergunta %', i; end if;
        if lower(v_op) = any (v_vistas) then raise exception 'pulso:perguntas_invalidas: opção repetida na pergunta %', i; end if;
        v_vistas := v_vistas || lower(v_op);
      end loop;
      o := o || jsonb_build_object('opcoes', (select jsonb_agg(btrim(x)) from jsonb_array_elements_text(v_ops) x));
    end if;
    v_saida := v_saida || jsonb_build_array(o);
  end loop;
  return v_saida;
end $$;
revoke execute on function public.fn_pulso_validar_perguntas(jsonb) from public, anon, authenticated;

-- ── Colunas e tabelas novas ─────────────────────────────────────────────
alter table public.pulso_ciclos add column if not exists perguntas jsonb;
update public.pulso_ciclos set perguntas = public.fn_pulso_perguntas_padrao() where perguntas is null;
alter table public.pulso_ciclos alter column perguntas set default public.fn_pulso_perguntas_padrao();
alter table public.pulso_ciclos alter column perguntas set not null;

create table if not exists public.pulso_respostas_v2 (
  id            uuid primary key default gen_random_uuid(),
  ciclo_id      uuid not null references public.pulso_ciclos(id),
  perfil_grupo  text not null check (perfil_grupo in
                  ('coordenacao','tecnico','financeiro','consultor_externo','visualizador','convidado')),
  respostas     jsonb not null default '{}'::jsonb,
  dia           date not null default current_date
);
comment on table public.pulso_respostas_v2 is
  'Respostas ANÔNIMAS do Pulso ({chave: valor}; escolha = índice da opção). Sem usuario_id e sem hora, de propósito.';
create index if not exists idx_pulso_resp2_ciclo on public.pulso_respostas_v2 (ciclo_id);

-- cópia das respostas antigas (mesmo id ⇒ idempotente)
insert into public.pulso_respostas_v2 (id, ciclo_id, perfil_grupo, respostas, dia)
select r.id, r.ciclo_id, r.perfil_grupo,
       jsonb_strip_nulls(jsonb_build_object('q1', r.q1, 'q2', r.q2, 'q3', r.q3, 'q4', r.q4, 'q5', r.q5, 'q6', r.q6, 'texto', r.texto_livre)),
       r.dia
from public.pulso_respostas r
on conflict (id) do nothing;
comment on table public.pulso_respostas is 'LEGADO do Pulso (até 06/10/2026). Copiado para pulso_respostas_v2; não escrever aqui.';

create table if not exists public.pulso_espelho_v2 (
  ciclo_id    uuid not null references public.pulso_ciclos(id),
  usuario_id  uuid not null references public.usuarios(id),
  valores     jsonb not null,
  criado_em   timestamptz not null default now(),
  primary key (ciclo_id, usuario_id)
);
insert into public.pulso_espelho_v2 (ciclo_id, usuario_id, valores, criado_em)
select ciclo_id, usuario_id, jsonb_build_object('q1', q1, 'q2', q2, 'q3', q3, 'q4', q4, 'q5', q5), criado_em
from public.pulso_espelho
on conflict (ciclo_id, usuario_id) do nothing;
comment on table public.pulso_espelho is 'LEGADO do Pulso. Copiado para pulso_espelho_v2; não escrever aqui.';

alter table public.pulso_respostas_v2 enable row level security;
alter table public.pulso_espelho_v2   enable row level security;
revoke all on public.pulso_respostas_v2, public.pulso_espelho_v2 from anon, authenticated, public;
-- Sem policy e sem grant: tudo pelas funções abaixo.

-- ── Regras de acesso ────────────────────────────────────────────────────
create or replace function public.fn_pulso_usuario_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u where u.id = auth.uid() and u.ativo)
$$;
revoke execute on function public.fn_pulso_usuario_ativo() from public, anon, authenticated;

-- ver resultado / contador: criador ou super_admin/coordenação
create or replace function public.fn_pulso_pode_ver(c public.pulso_ciclos) returns boolean
language sql stable security definer set search_path = public as $$
  select public.fn_pulso_usuario_ativo() and (c.criado_por = auth.uid() or public.fn_pulso_gestor())
$$;
revoke execute on function public.fn_pulso_pode_ver(public.pulso_ciclos) from public, anon, authenticated;

create or replace function public.fn_pulso_dono(c public.pulso_ciclos) returns boolean
language sql stable security definer set search_path = public as $$
  select public.fn_pulso_usuario_ativo() and c.criado_por = auth.uid()
$$;
revoke execute on function public.fn_pulso_dono(public.pulso_ciclos) from public, anon, authenticated;

create or replace function public.fn_pulso_n_respostas(p_ciclo uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.pulso_participacoes where ciclo_id = p_ciclo
$$;
revoke execute on function public.fn_pulso_n_respostas(uuid) from public, anon, authenticated;

-- ── Público (QR Code) ───────────────────────────────────────────────────
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
    v_ja := exists (select 1 from public.pulso_participacoes where ciclo_id = c.id and usuario_id = auth.uid());
  elsif p_dispositivo is not null then
    v_ja := exists (select 1 from public.pulso_participacoes
                    where ciclo_id = c.id and dispositivo_hash = public.fn_pulso_hash_disp(c.id, p_dispositivo));
  end if;
  if c.limite_convidados is not null then
    v_lotado := (select count(*) from public.pulso_participacoes where ciclo_id = c.id and usuario_id is null) >= c.limite_convidados;
  end if;

  return jsonb_build_object(
    'encontrado', true, 'titulo', c.titulo, 'aberto', public.fn_pulso_aberto(c),
    'aceita_convidados', c.aceita_convidados and not v_lotado,
    'cadastrado', v_grupo <> 'convidado', 'perfil_grupo', v_grupo,
    'ja_respondeu', v_ja, 'perguntas', c.perguntas);
end $$;
revoke execute on function public.fn_publico_pulso_ciclo(text, text) from public;
grant execute on function public.fn_publico_pulso_ciclo(text, text) to anon, authenticated;

-- Grava resposta (v2) e participação na MESMA transação, em tabelas separadas.
-- p_respostas = {chave: valor}; chaves desconhecidas são ignoradas.
create or replace function public.fn_publico_pulso_responder(
  p_token text, p_respostas jsonb, p_dispositivo text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c        public.pulso_ciclos;
  v_grupo  text := public.fn_pulso_grupo_atual();
  v_hash   text;
  v_resp   jsonb := '{}'::jsonb;
  q        jsonb;
  v_bruto  jsonb;
  v_num    int;
  v_txt    text;
begin
  select * into c from public.pulso_ciclos where token = p_token for update;
  if not found then raise exception 'pulso:ciclo_inexistente'; end if;
  if not public.fn_pulso_aberto(c) then raise exception 'pulso:ciclo_encerrado'; end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then raise exception 'pulso:resposta_invalida'; end if;

  for q in select * from jsonb_array_elements(c.perguntas) loop
    v_bruto := p_respostas -> (q->>'chave');
    if v_bruto is null or v_bruto = 'null'::jsonb or (jsonb_typeof(v_bruto) = 'string' and btrim(v_bruto #>> '{}') = '') then
      if (q->>'obrigatoria')::boolean then raise exception 'pulso:resposta_invalida'; end if;
      continue;
    end if;
    if q->>'tipo' = 'texto' then
      v_txt := btrim(v_bruto #>> '{}');
      if length(v_txt) > 1000 then raise exception 'pulso:texto_longo'; end if;
      v_resp := v_resp || jsonb_build_object(q->>'chave', v_txt);
    else
      begin v_num := (v_bruto #>> '{}')::int;
      exception when others then raise exception 'pulso:resposta_invalida'; end;
      if (v_bruto #>> '{}') ~ '\.' then raise exception 'pulso:resposta_invalida'; end if;
      if (q->>'tipo' = 'escala' and v_num not between 1 and 5)
         or (q->>'tipo' = 'nps' and v_num not between 0 and 10)
         or (q->>'tipo' = 'escolha' and (v_num < 0 or v_num >= jsonb_array_length(q->'opcoes'))) then
        raise exception 'pulso:resposta_invalida';
      end if;
      v_resp := v_resp || jsonb_build_object(q->>'chave', v_num);
    end if;
  end loop;

  if p_dispositivo is not null and length(p_dispositivo) between 16 and 100 then
    v_hash := public.fn_pulso_hash_disp(c.id, p_dispositivo);
  end if;

  if v_grupo <> 'convidado' then
    if exists (select 1 from public.pulso_participacoes where ciclo_id = c.id and usuario_id = auth.uid()) then
      raise exception 'pulso:ja_respondeu';
    end if;
    insert into public.pulso_participacoes (ciclo_id, usuario_id, dispositivo_hash) values (c.id, auth.uid(), v_hash);
  else
    if not c.aceita_convidados then raise exception 'pulso:convidado_nao_aceito'; end if;
    if v_hash is null then raise exception 'pulso:dispositivo_invalido'; end if;
    if exists (select 1 from public.pulso_participacoes where ciclo_id = c.id and dispositivo_hash = v_hash) then
      raise exception 'pulso:ja_respondeu';
    end if;
    if c.limite_convidados is not null
       and (select count(*) from public.pulso_participacoes where ciclo_id = c.id and usuario_id is null) >= c.limite_convidados then
      raise exception 'pulso:limite_convidados';
    end if;
    insert into public.pulso_participacoes (ciclo_id, dispositivo_hash) values (c.id, v_hash);
  end if;

  insert into public.pulso_respostas_v2 (ciclo_id, perfil_grupo, respostas) values (c.id, v_grupo, v_resp);
  return jsonb_build_object('ok', true, 'perfil_grupo', v_grupo);
end $$;
revoke execute on function public.fn_publico_pulso_responder(text, jsonb, text) from public;
grant execute on function public.fn_publico_pulso_responder(text, jsonb, text) to anon, authenticated;

-- ── Ciclos: criar, alterar, perguntas ───────────────────────────────────
-- Qualquer usuário ativo. p_copiar_de: ciclo (que a pessoa enxerga) cujas perguntas servem de base.
create or replace function public.fn_pulso_criar_ciclo(
  p_titulo text, p_aceita_convidados boolean default true, p_limite_convidados integer default null,
  p_fecha_em timestamptz default null, p_copiar_de uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_perg jsonb := public.fn_pulso_perguntas_padrao(); o public.pulso_ciclos;
begin
  if not public.fn_pulso_usuario_ativo() then raise exception 'pulso:sem_permissao'; end if;
  if p_copiar_de is not null then
    select * into o from public.pulso_ciclos where id = p_copiar_de;
    if not found or not public.fn_pulso_pode_ver(o) then raise exception 'pulso:sem_permissao'; end if;
    v_perg := o.perguntas;
  end if;
  insert into public.pulso_ciclos (titulo, aceita_convidados, limite_convidados, fecha_em, criado_por, perguntas)
  values (btrim(p_titulo), coalesce(p_aceita_convidados, true), p_limite_convidados, p_fecha_em, auth.uid(), v_perg)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.fn_pulso_criar_ciclo(text, boolean, integer, timestamptz, uuid) from public, anon;
grant execute on function public.fn_pulso_criar_ciclo(text, boolean, integer, timestamptz, uuid) to authenticated;
-- a versão antiga (só coordenação) sai de uso
revoke execute on function public.fn_pulso_criar(text, boolean, integer, timestamptz) from authenticated;

-- Criador altera tudo; super_admin só encerra/reabre (moderação).
create or replace function public.fn_pulso_alterar(p_ciclo uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c public.pulso_ciclos; v_admin boolean;
begin
  select * into c from public.pulso_ciclos where id = p_ciclo for update;
  if not found then raise exception 'pulso:ciclo_inexistente'; end if;
  v_admin := exists (select 1 from public.usuarios u where u.id = auth.uid() and u.ativo and u.perfil = 'super_admin');
  if not public.fn_pulso_dono(c) then
    if not v_admin or exists (select 1 from jsonb_object_keys(p_dados) k where k <> 'status') then
      raise exception 'pulso:sem_permissao';
    end if;
  end if;
  update public.pulso_ciclos set
    titulo            = case when p_dados ? 'titulo' then btrim(p_dados->>'titulo') else titulo end,
    status            = case when p_dados ? 'status' then p_dados->>'status' else status end,
    aceita_convidados = case when p_dados ? 'aceita_convidados' then (p_dados->>'aceita_convidados')::boolean else aceita_convidados end,
    limite_convidados = case when p_dados ? 'limite_convidados' then (p_dados->>'limite_convidados')::integer else limite_convidados end,
    fecha_em          = case when p_dados ? 'fecha_em' then (p_dados->>'fecha_em')::timestamptz else fecha_em end
  where id = p_ciclo;
end $$;
revoke execute on function public.fn_pulso_alterar(uuid, jsonb) from public, anon;
grant execute on function public.fn_pulso_alterar(uuid, jsonb) to authenticated;

-- Só o criador, e só sem nenhuma resposta.
create or replace function public.fn_pulso_salvar_perguntas(p_ciclo uuid, p_perguntas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.pulso_ciclos; v jsonb;
begin
  select * into c from public.pulso_ciclos where id = p_ciclo for update;
  if not found then raise exception 'pulso:ciclo_inexistente'; end if;
  if not public.fn_pulso_dono(c) then raise exception 'pulso:sem_permissao'; end if;
  if public.fn_pulso_n_respostas(c.id) > 0 then raise exception 'pulso:perguntas_travadas'; end if;
  v := public.fn_pulso_validar_perguntas(p_perguntas);
  update public.pulso_ciclos set perguntas = v where id = p_ciclo;
  return v;
end $$;
revoke execute on function public.fn_pulso_salvar_perguntas(uuid, jsonb) from public, anon;
grant execute on function public.fn_pulso_salvar_perguntas(uuid, jsonb) to authenticated;

-- Expectativa (pergunta-espelho) de quem acompanha o ciclo: {chave: 1..5} só p/ escala.
create or replace function public.fn_pulso_salvar_espelho(p_ciclo uuid, p_q jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c public.pulso_ciclos; v jsonb := '{}'::jsonb; q jsonb; n numeric;
begin
  select * into c from public.pulso_ciclos where id = p_ciclo;
  if not found then raise exception 'pulso:ciclo_inexistente'; end if;
  if not public.fn_pulso_pode_ver(c) then raise exception 'pulso:sem_permissao'; end if;
  for q in select * from jsonb_array_elements(c.perguntas) where value->>'tipo' = 'escala' loop
    if p_q ? (q->>'chave') then
      n := (p_q->>(q->>'chave'))::numeric;
      if n is null or n < 1 or n > 5 then raise exception 'pulso:resposta_invalida'; end if;
      v := v || jsonb_build_object(q->>'chave', round(n, 1));
    end if;
  end loop;
  insert into public.pulso_espelho_v2 (ciclo_id, usuario_id, valores) values (p_ciclo, auth.uid(), v)
  on conflict (ciclo_id, usuario_id) do update set valores = excluded.valores, criado_em = now();
end $$;
revoke execute on function public.fn_pulso_salvar_espelho(uuid, jsonb) from public, anon;
grant execute on function public.fn_pulso_salvar_espelho(uuid, jsonb) to authenticated;

-- ── Métricas (interna; quem chama aplica a supressão) ───────────────────
-- Por pergunta: escala (n, média, média ajustada p/ invertida, dp, distribuição 1–5),
-- nps (n, média, distribuição 0–10, eNPS), escolha (n, contagem por opção), texto (n).
-- Índices sobre as escalas com indice=true: comprometimento = média ajustada em 0–100;
-- sintonia = 100 − dp médio ÷ 2 × 100. eNPS = 1ª pergunta nps.
create or replace function public.fn_pulso_metricas(p_ciclo uuid, p_grupos text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_perg  jsonb := (select perguntas from public.pulso_ciclos where id = p_ciclo);
  q       jsonb; k text;
  v_por   jsonb := '{}'::jsonb;
  v_n     int;
  m       record;
  v_soma_m numeric := 0; v_soma_d numeric := 0; v_qtd int := 0;
  v_enps  numeric; v_comp numeric; v_sint numeric;
begin
  select count(*) into v_n from public.pulso_respostas_v2
   where ciclo_id = p_ciclo and (p_grupos is null or perfil_grupo = any (p_grupos));
  for q in select * from jsonb_array_elements(coalesce(v_perg, '[]'::jsonb)) loop
    k := q->>'chave';
    if q->>'tipo' in ('escala', 'nps') then
      select count(*) n, avg(x) med, stddev_pop(x) dp,
             count(*) filter (where x >= 9) prom, count(*) filter (where x <= 6) detr
        into m
        from (select (respostas->>k)::int x from public.pulso_respostas_v2
              where ciclo_id = p_ciclo and (p_grupos is null or perfil_grupo = any (p_grupos)) and respostas ? k) s;
      if q->>'tipo' = 'escala' then
        v_por := v_por || jsonb_build_object(k, jsonb_build_object(
          'n', m.n, 'media', round(m.med, 2), 'dp', round(m.dp, 2),
          'media_ajustada', round(case when (q->>'invertida')::boolean then 6 - m.med else m.med end, 2),
          'distribuicao', (select jsonb_agg((select count(*) from public.pulso_respostas_v2
                              where ciclo_id = p_ciclo and (p_grupos is null or perfil_grupo = any (p_grupos))
                                and (respostas->>k)::int = v) order by v) from generate_series(1, 5) v)));
        if coalesce((q->>'indice')::boolean, true) and m.n > 0 then
          v_soma_m := v_soma_m + case when (q->>'invertida')::boolean then 6 - m.med else m.med end;
          v_soma_d := v_soma_d + m.dp; v_qtd := v_qtd + 1;
        end if;
      else
        v_por := v_por || jsonb_build_object(k, jsonb_build_object(
          'n', m.n, 'media', round(m.med, 2),
          'enps', round((m.prom - m.detr) * 100.0 / nullif(m.n, 0)),
          'distribuicao', (select jsonb_agg((select count(*) from public.pulso_respostas_v2
                              where ciclo_id = p_ciclo and (p_grupos is null or perfil_grupo = any (p_grupos))
                                and (respostas->>k)::int = v) order by v) from generate_series(0, 10) v)));
        if v_enps is null and m.n > 0 then v_enps := round((m.prom - m.detr) * 100.0 / m.n); end if;
      end if;
    elsif q->>'tipo' = 'escolha' then
      v_por := v_por || jsonb_build_object(k, jsonb_build_object(
        'n', (select count(*) from public.pulso_respostas_v2
              where ciclo_id = p_ciclo and (p_grupos is null or perfil_grupo = any (p_grupos)) and respostas ? k),
        'contagem', (select jsonb_agg((select count(*) from public.pulso_respostas_v2
                       where ciclo_id = p_ciclo and (p_grupos is null or perfil_grupo = any (p_grupos))
                         and (respostas->>k)::int = v) order by v)
                     from generate_series(0, jsonb_array_length(q->'opcoes') - 1) v)));
    else
      v_por := v_por || jsonb_build_object(k, jsonb_build_object('n',
        (select count(*) from public.pulso_respostas_v2
         where ciclo_id = p_ciclo and (p_grupos is null or perfil_grupo = any (p_grupos)) and respostas ? k)));
    end if;
  end loop;
  if v_qtd > 0 then
    v_comp := round((v_soma_m / v_qtd - 1) / 4 * 100);
    v_sint := greatest(0, round(100 - (v_soma_d / v_qtd) / 2 * 100));
  end if;
  return jsonb_build_object('n', v_n, 'comprometimento', v_comp, 'sintonia', v_sint, 'enps', v_enps, 'por_pergunta', v_por);
end $$;
revoke execute on function public.fn_pulso_metricas(uuid, text[]) from public, anon, authenticated;

-- ── Listas e resultado ──────────────────────────────────────────────────
create or replace function public.fn_pulso_ciclos()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.fn_pulso_usuario_ativo() then raise exception 'pulso:sem_permissao'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'criado_em' desc) from (
      select jsonb_build_object(
        'id', c.id, 'titulo', c.titulo, 'token', c.token, 'status', c.status,
        'aberto', public.fn_pulso_aberto(c),
        'aceita_convidados', c.aceita_convidados, 'limite_convidados', c.limite_convidados,
        'fecha_em', c.fecha_em, 'criado_em', c.criado_em,
        'meu', c.criado_por = auth.uid(),
        'autor', (select u.nome_completo from public.usuarios u where u.id = c.criado_por),
        'n_perguntas', jsonb_array_length(c.perguntas),
        'n_respostas', p.n, 'n_cadastrados', p.cad, 'n_convidados', p.conv,
        'indices', case when p.n >= 5 then (
            select jsonb_build_object('comprometimento', mt->'comprometimento', 'sintonia', mt->'sintonia', 'enps', mt->'enps')
            from public.fn_pulso_metricas(c.id, null) mt) end
      ) x
      from public.pulso_ciclos c
      cross join lateral (
        select count(*) n, count(usuario_id) cad, count(*) - count(usuario_id) conv
        from public.pulso_participacoes where ciclo_id = c.id) p
      where public.fn_pulso_pode_ver(c)
    ) s), '[]'::jsonb);
end $$;
revoke execute on function public.fn_pulso_ciclos() from public, anon;
grant execute on function public.fn_pulso_ciclos() to authenticated;

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
  v_textos   jsonb := '{}'::jsonb;
  q          jsonb;
  v_base     jsonb;
begin
  select * into c from public.pulso_ciclos where id = p_ciclo;
  if not found then raise exception 'pulso:ciclo_inexistente'; end if;
  if not public.fn_pulso_pode_ver(c) then raise exception 'pulso:sem_permissao'; end if;

  select count(*) into v_n from public.pulso_respostas_v2 where ciclo_id = p_ciclo;

  -- expectativas: média por chave + a minha
  select jsonb_build_object(
      'n', (select count(*) from public.pulso_espelho_v2 where ciclo_id = p_ciclo),
      'medias', coalesce((select jsonb_object_agg(k, round(avg_v, 2)) from (
                  select e.key k, avg((e.value #>> '{}')::numeric) avg_v
                  from public.pulso_espelho_v2 ev, jsonb_each(ev.valores) e
                  where ev.ciclo_id = p_ciclo group by e.key) a), '{}'::jsonb),
      'meu', (select valores from public.pulso_espelho_v2 where ciclo_id = p_ciclo and usuario_id = auth.uid()))
    into v_esp;

  v_base := jsonb_build_object(
    'ciclo', to_jsonb(c) - 'criado_por' - 'perguntas',
    'meu', c.criado_por = auth.uid(),
    'pode_editar_perguntas', public.fn_pulso_dono(c) and public.fn_pulso_n_respostas(c.id) = 0,
    'perguntas', c.perguntas,
    'n', v_n, 'minimo', v_min, 'espelho', v_esp,
    'participacao', public.fn_pulso_participacao(p_ciclo));

  if v_n < v_min then return v_base || jsonb_build_object('suprimido', true); end if;

  for g in select perfil_grupo, count(*) n from public.pulso_respostas_v2
           where ciclo_id = p_ciclo group by perfil_grupo order by perfil_grupo loop
    if g.n >= v_min then
      v_grupos := v_grupos || jsonb_build_array(jsonb_build_object('grupo', g.perfil_grupo)
                             || public.fn_pulso_metricas(p_ciclo, array[g.perfil_grupo]));
    else
      v_peq := v_peq || g.perfil_grupo::text; v_n_peq := v_n_peq + g.n;
    end if;
  end loop;
  if v_n_peq >= v_min and jsonb_array_length(v_grupos) > 0 then
    v_grupos := v_grupos || jsonb_build_array(jsonb_build_object('grupo', 'demais')
                           || public.fn_pulso_metricas(p_ciclo, v_peq));
  end if;

  -- textos livres: por pergunta, embaralhados e sem perfil
  for q in select * from jsonb_array_elements(c.perguntas) where value->>'tipo' = 'texto' loop
    v_textos := v_textos || jsonb_build_object(q->>'chave', coalesce((
      select jsonb_agg(respostas->>(q->>'chave') order by random()) from public.pulso_respostas_v2
      where ciclo_id = p_ciclo and respostas ? (q->>'chave')), '[]'::jsonb));
  end loop;

  return v_base || jsonb_build_object('suprimido', false,
    'geral', public.fn_pulso_metricas(p_ciclo, null), 'grupos', v_grupos, 'textos', v_textos);
end $$;
revoke execute on function public.fn_pulso_resultado(uuid) from public, anon;
grant execute on function public.fn_pulso_resultado(uuid) to authenticated;

create or replace function public.fn_pulso_contagem(p_ciclo uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare c public.pulso_ciclos;
begin
  select * into c from public.pulso_ciclos where id = p_ciclo;
  if not found or not public.fn_pulso_pode_ver(c) then raise exception 'pulso:sem_permissao'; end if;
  return public.fn_pulso_n_respostas(p_ciclo);
end $$;
revoke execute on function public.fn_pulso_contagem(uuid) from public, anon;
grant execute on function public.fn_pulso_contagem(uuid) to authenticated;

-- ── ROPA ────────────────────────────────────────────────────────────────
-- A atualização do TRAT-002 está em 20261006_pulso_equipe_c_ropa_sql_editor.sql:
-- o apply_migration do MCP fica esperando confirmação nesse UPDATE e expira.
