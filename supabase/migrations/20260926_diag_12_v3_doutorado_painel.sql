-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 12 — questionário v3 (doutorado) e Meu painel
--
-- v3: pedido de 26/09/2026 — a escolaridade da P9 ganha "Doutorado
-- incompleto/completo". A v2 publicada é IMUTÁVEL → v3 é cópia fiel da v2
-- (mesmo aviso) com as duas opções a mais. Mesmo rito da v2: se a v2 está
-- publicada (produção), publica a v3 e arquiva a v2; ficha começada na v2
-- continua aceita e validada pela estrutura da v2.
--
-- diag_meu_painel(): números do app de campo, SÓ das fichas do próprio
-- entrevistador (entrevistador_id = auth.uid()), independentemente do perfil
-- — coordenação/super_admin enxergam todas as fichas pelo RLS, mas o painel
-- do app é pessoal. Treino é contado à parte, nunca somado.
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v2   diag_questionarios;
  est  jsonb;
  idx  int;
  ops  jsonb;
  pos  int;
begin
  if exists (select 1 from diag_questionarios where codigo = 'DSA' and estrutura->>'mudanca_v3' is not null) then
    return;
  end if;
  select * into v2 from diag_questionarios where codigo = 'DSA' and versao = 2;
  if v2.id is null then raise exception 'questionário DSA v2 não encontrado'; end if;

  select i - 1 into idx
    from jsonb_array_elements(v2.estrutura->'moradores'->'colunas') with ordinality as c(col, i)
   where col->>'chave' = 'escolaridade';
  ops := v2.estrutura->'moradores'->'colunas'->idx->'opcoes';
  -- doutorado entra logo depois de "Mestrado completo" (antes de "Não sabe informar")
  select i into pos from jsonb_array_elements(ops) with ordinality as o(op, i) where op->>'v' = 'mestrado_completo';
  if pos is null then raise exception 'v2 sem a opção mestrado_completo'; end if;
  ops := (select jsonb_agg(e order by ord) from (
            select op as e, i::numeric as ord from jsonb_array_elements(ops) with ordinality as o(op, i)
            union all select '{"v":"doutorado_incompleto","r":"Doutorado incompleto","g":"Ensino superior"}'::jsonb, pos + 0.1
            union all select '{"v":"doutorado_completo","r":"Doutorado completo","g":"Ensino superior"}'::jsonb, pos + 0.2) x);

  est := jsonb_set(v2.estrutura, array['moradores','colunas', idx::text, 'opcoes'], ops);
  est := est || jsonb_build_object('versao', 3,
           'mudanca_v3', 'P9: escolaridade com doutorado incompleto/completo (26/09/2026)');

  insert into diag_questionarios (codigo, versao, titulo, estrutura, aviso_entrevistado)
  values ('DSA', 3, v2.titulo, est, v2.aviso_entrevistado);
  if v2.status = 'publicado' then
    update diag_questionarios set status = 'publicado' where codigo = 'DSA' and versao = 3;
    update diag_questionarios set status = 'arquivado' where id = v2.id;
  end if;
end $$;

-- ── Meu painel (app de campo) ───────────────────────────────────────────
create or replace function public.diag_meu_painel()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v      jsonb;
begin
  if v_uid is null then raise exception 'diag:nao_autorizado'; end if;

  with minhas as (
    select f.* from diag_fichas f where f.entrevistador_id = v_uid and not f.treino
  ), validas as (
    select * from minhas where status <> 'descartada'
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'hoje', v_hoje,
    'total', (select count(*) from validas),
    'por_status', jsonb_build_object(
       'enviada',    (select count(*) from minhas where status = 'enviada'),
       'devolvida',  (select count(*) from minhas where status = 'devolvida'),
       'validada',   (select count(*) from minhas where status = 'validada'),
       'descartada', (select count(*) from minhas where status = 'descartada')),
    'aceitas',  (select count(*) from validas where aceitou_participar),
    'recusas',  (select count(*) from validas where not aceitou_participar),
    'pessoas',  (select count(*) from diag_moradores m join validas v on v.id = m.ficha_id),
    -- duração plausível (1 min a 5 h): fichas retomadas dias depois distorceriam a média
    'tempo_medio_min', (select round(avg(extract(epoch from (finalizada_em - iniciada_em)) / 60))
                        from validas where aceitou_participar and iniciada_em is not null
                          and finalizada_em - iniciada_em between interval '1 minute' and interval '5 hours'),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', d.dia, 'n', d.n) order by d.dia)
                         from (select dt_entrevista as dia, count(*) as n from validas
                               where dt_entrevista > v_hoje - 30 group by 1) d), '[]'::jsonb),
    'por_comunidade', coalesce((select jsonb_agg(jsonb_build_object('nome', c.nome, 'n', c.n) order by c.n desc, c.nome)
                         from (select coalesce(dc.nome, v.comunidade_nova) as nome, count(*) as n
                               from validas v left join diag_comunidades dc on dc.id = v.comunidade_id
                               group by 1) c), '[]'::jsonb),
    'treino', (select count(*) from diag_fichas where entrevistador_id = v_uid and treino)
  ) into v;
  return v;
end $$;

revoke execute on function public.diag_meu_painel() from public, anon;
grant execute on function public.diag_meu_painel() to authenticated;
