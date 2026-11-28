-- 28/11/2026 · Lista de presença (parte C): "não convidado(a)" e faixa etária.
-- 1) convidado_inicial: gravado NA ASSINATURA — a pessoa estava entre os convidados da reunião naquela hora
--    (fn_presenca_convidados = criador + participantes)? Quem não estava assina normalmente e aparece como
--    "Não convidado(a)". Gravar na hora (e não recalcular) guarda o fato mesmo que o convite mude depois.
-- 2) faixa_etaria (autodeclarada, por faixa): ate_17 · 18_24 · 25_29 (juventude até 29 — Estatuto da Juventude) ·
--    30_39 · 40_49 · 50_59 · 60_mais (Estatuto da Pessoa Idosa) · prefere_nao_responder. Mesma regra de sexo/raça:
--    obrigatório responder (com "prefere não responder"), por pessoa só coordenação/super_admin, fora do PDF A4.
-- Sem palavra de comando de apagar no texto (o apply_migration espera confirmação nela).

alter table public.presenca_assinaturas
  add column if not exists faixa_etaria text
    check (faixa_etaria in ('ate_17','18_24','25_29','30_39','40_49','50_59','60_mais','prefere_nao_responder')),
  add column if not exists convidado_inicial boolean not null default false;

-- ── página pública: pré-preenche a faixa da última assinatura ─────────────
create or replace function public.fn_publico_presenca_lista(p_lista_token text default null, p_convite text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  l public.presenca_listas; t public.tarefas; c public.presenca_convites; tm public.presenca_termos_imagem;
  u public.usuarios; v_uid uuid; v_ja boolean := false; v_ant public.presenca_assinaturas;
begin
  if nullif(p_convite, '') is not null then
    select * into c from public.presenca_convites where token_hash = public.fn_presenca_hash(p_convite);
    if not found then return jsonb_build_object('encontrado', false); end if;
    select * into l from public.presenca_listas where id = c.lista_id;
    v_uid := c.usuario_id;
  elsif nullif(p_lista_token, '') is not null then
    select * into l from public.presenca_listas where token = p_lista_token;
    if not found then return jsonb_build_object('encontrado', false); end if;
    if auth.uid() is not null and public.fn_perfil_atual() is not null then v_uid := auth.uid(); end if;
  else
    return jsonb_build_object('encontrado', false);
  end if;

  select * into t from public.tarefas where id = l.tarefa_id;
  select * into tm from public.presenca_termos_imagem where vigente;
  if v_uid is not null then
    select * into u from public.usuarios where id = v_uid;
    v_ja := exists (select 1 from public.presenca_assinaturas where lista_id = l.id and usuario_id = v_uid);
    select * into v_ant from public.presenca_assinaturas where usuario_id = v_uid order by assinado_em desc limit 1;
  end if;

  return jsonb_build_object(
    'encontrado', true, 'titulo', t.titulo, 'codigo', t.codigo,
    'inicio', t.dados_tipo->>'inicio', 'fim', t.dados_tipo->>'fim', 'formato', t.dados_tipo->>'formato', 'local', t.dados_tipo->>'local',
    'aberta', public.fn_presenca_aberta(l), 'abre_em', l.abre_em,
    'fecha_em', case when coalesce(l.reaberta_ate > l.fecha_em, false) then l.reaberta_ate else l.fecha_em end,
    'encerrada', l.encerrada_em is not null, 'pessoal', v_uid is not null, 'ja_assinou', v_ja,
    'pre', case when v_uid is null then null else jsonb_build_object(
      'nome', u.nome_completo, 'email', u.email, 'telefone', coalesce(v_ant.telefone, u.telefone),
      'sexo_genero', v_ant.sexo_genero, 'sexo_genero_outro', v_ant.sexo_genero_outro, 'cor_raca', v_ant.cor_raca,
      'faixa_etaria', v_ant.faixa_etaria) end,
    'termo', jsonb_build_object('id', tm.id, 'versao', tm.versao, 'texto', tm.texto, 'sha256', tm.sha256));
end $$;
revoke execute on function public.fn_publico_presenca_lista(text, text) from public;
grant execute on function public.fn_publico_presenca_lista(text, text) to anon, authenticated;

-- ── assinatura: faixa etária obrigatória + convidado_inicial ─────────────
create or replace function public.fn_publico_presenca_assinar(p_lista_token text, p_convite text, p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  l public.presenca_listas; c public.presenca_convites; tm public.presenca_termos_imagem; u public.usuarios;
  v_uid uuid; v_origem text; v_email text; v_nome text; v_tel text; v_img boolean; v_n int; v_conv boolean;
begin
  if nullif(p_convite, '') is not null then
    select * into c from public.presenca_convites where token_hash = public.fn_presenca_hash(p_convite) for update;
    if not found then raise exception 'presenca:link_invalido'; end if;
    select * into l from public.presenca_listas where id = c.lista_id for update;
    v_uid := c.usuario_id; v_origem := 'convite';
  else
    select * into l from public.presenca_listas where token = coalesce(p_lista_token, '') for update;
    if not found then raise exception 'presenca:lista_inexistente'; end if;
    v_origem := 'qr';
    if auth.uid() is not null and public.fn_perfil_atual() is not null then v_uid := auth.uid(); end if;
  end if;
  if not public.fn_presenca_aberta(l) then raise exception 'presenca:lista_fechada'; end if;

  select * into tm from public.presenca_termos_imagem where vigente;
  if tm.id is null or (p_dados->>'termo_id') is distinct from tm.id::text then raise exception 'presenca:termo_mudou'; end if;
  if coalesce(p_dados->>'imagem_autoriza', '') not in ('true', 'false') then raise exception 'presenca:imagem_obrigatoria'; end if;
  v_img := (p_dados->>'imagem_autoriza')::boolean;

  v_nome := btrim(regexp_replace(coalesce(p_dados->>'nome', ''), '\s+', ' ', 'g'));
  v_email := lower(btrim(coalesce(p_dados->>'email', '')));
  v_tel := nullif(regexp_replace(coalesce(p_dados->>'telefone', ''), '\D', '', 'g'), '');
  if length(v_nome) < 3 then raise exception 'presenca:nome_invalido'; end if;
  if v_tel is not null and length(v_tel) not between 10 and 13 then raise exception 'presenca:telefone_invalido'; end if;

  if v_uid is not null then
    select * into u from public.usuarios where id = v_uid;
    v_email := lower(u.email);
  else
    if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'presenca:email_invalido'; end if;
    select id into v_uid from public.usuarios where lower(email) = v_email and ativo limit 1;
  end if;

  if coalesce(p_dados->>'sexo_genero', '') not in ('mulher','homem','outro','prefere_nao_responder') then raise exception 'presenca:sexo_obrigatorio'; end if;
  if coalesce(p_dados->>'cor_raca', '') not in ('branca','preta','parda','amarela','indigena','prefere_nao_responder') then raise exception 'presenca:raca_obrigatoria'; end if;
  if coalesce(p_dados->>'faixa_etaria', '') not in ('ate_17','18_24','25_29','30_39','40_49','50_59','60_mais','prefere_nao_responder') then
    raise exception 'presenca:idade_obrigatoria';
  end if;

  -- estava entre os convidados da reunião agora? (só usuário pode ser convidado; convidado externo nunca é)
  v_conv := v_uid is not null and exists (select 1 from public.fn_presenca_convidados(l.tarefa_id) x where x.uid = v_uid);

  select count(*) into v_n from public.presenca_assinaturas where lista_id = l.id;
  if v_n >= 1000 then raise exception 'presenca:lista_cheia'; end if;

  begin
    insert into public.presenca_assinaturas (lista_id, usuario_id, nome, email, telefone, sexo_genero, sexo_genero_outro,
      cor_raca, faixa_etaria, convidado_inicial, origem, imagem_autoriza, termo_id, termo_sha256)
    values (l.id, v_uid, v_nome, v_email, v_tel, p_dados->>'sexo_genero',
      case when p_dados->>'sexo_genero' = 'outro' then left(nullif(btrim(p_dados->>'sexo_genero_outro'), ''), 60) end,
      p_dados->>'cor_raca', p_dados->>'faixa_etaria', v_conv, v_origem, v_img, tm.id, tm.sha256);
  exception when unique_violation then
    raise exception 'presenca:ja_assinou';
  end;
  if c.id is not null then update public.presenca_convites set usado_em = now() where id = c.id; end if;
  return jsonb_build_object('ok', true, 'nome', v_nome, 'convidado', v_conv);
end $$;
revoke execute on function public.fn_publico_presenca_assinar(text, text, jsonb) from public;
grant execute on function public.fn_publico_presenca_assinar(text, text, jsonb) to anon, authenticated;

-- ── detalhe da lista: convidado / faixa etária ───────────────────────────
create or replace function public.fn_presenca_detalhe(p_lista uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l public.presenca_listas; t public.tarefas; v_gerir boolean; v_sens boolean;
begin
  select * into l from public.presenca_listas where id = p_lista;
  if not found or not public.fn_pode_ver_tarefa(l.tarefa_id) then raise exception 'presenca:sem_acesso'; end if;
  select * into t from public.tarefas where id = l.tarefa_id;
  v_gerir := public.fn_presenca_pode_gerir(p_lista); v_sens := public.fn_presenca_ve_sensivel();
  return jsonb_build_object(
    'lista', jsonb_build_object('id', l.id, 'aberta', public.fn_presenca_aberta(l), 'abre_em', l.abre_em,
      'fecha_em', greatest(l.fecha_em, coalesce(l.reaberta_ate, l.fecha_em)), 'encerrada_em', l.encerrada_em,
      'email_enviado_em', l.email_enfileirado_em, 'token', case when v_gerir then l.token end),
    'tarefa', jsonb_build_object('id', t.id, 'codigo', t.codigo, 'titulo', t.titulo, 'dados', t.dados_tipo,
      'atividade', (select jsonb_build_object('codigo', a.codigo, 'nome', a.nome_pt) from public.atividades a where a.id = t.atividade_id),
      'organizador', (select nome_completo from public.usuarios where id = t.criado_por)),
    'pode_gerir', v_gerir, 've_sensivel', v_sens,
    'assinaturas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'nome', a.nome, 'email', a.email, 'interno', a.usuario_id is not null, 'origem', a.origem,
        'convidado', a.convidado_inicial, 'assinado_em', a.assinado_em,
        'telefone', case when v_gerir then a.telefone end,
        'sexo_genero', case when v_sens then a.sexo_genero end,
        'sexo_genero_outro', case when v_sens then a.sexo_genero_outro end,
        'cor_raca', case when v_sens then a.cor_raca end,
        'faixa_etaria', case when v_sens then a.faixa_etaria end,
        'imagem', case when not a.imagem_autoriza then 'nao' when a.imagem_revogada_em is not null then 'retirada' else 'sim' end,
        'imagem_revogada_em', a.imagem_revogada_em, 'termo_versao', tm.versao) order by a.assinado_em)
      from public.presenca_assinaturas a join public.presenca_termos_imagem tm on tm.id = a.termo_id
      where a.lista_id = l.id), '[]'::jsonb),
    'convidados', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome,
        'assinou', exists (select 1 from public.presenca_assinaturas a where a.lista_id = l.id and a.usuario_id = x.uid)) order by x.nome)
      from public.fn_presenca_convidados(t.id) x), '[]'::jsonb),
    'totais', (select jsonb_build_object(
        'sexo', coalesce((select jsonb_object_agg(k, n) from (select sexo_genero k, count(*) n from public.presenca_assinaturas where lista_id = l.id group by 1) s), '{}'::jsonb),
        'raca', coalesce((select jsonb_object_agg(k, n) from (select cor_raca k, count(*) n from public.presenca_assinaturas where lista_id = l.id group by 1) s), '{}'::jsonb),
        'faixa', coalesce((select jsonb_object_agg(k, n) from (select coalesce(faixa_etaria, 'sem_registro') k, count(*) n from public.presenca_assinaturas where lista_id = l.id group by 1) s), '{}'::jsonb))));
end $$;

-- ── gerenciador: sem convite por reunião + faixa etária nos indicadores ───
create or replace function public.fn_presenca_painel(p_inicio date default null, p_fim date default null,
  p_atividade uuid default null, p_formato text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if public.fn_perfil_atual() is null then raise exception 'presenca:sem_acesso'; end if;
  with ls as (
    select l.*, t.codigo, t.titulo, t.status as t_status, t.dados_tipo, t.atividade_id,
           (select count(*) from public.fn_presenca_convidados(t.id)) as n_conv
    from public.presenca_listas l join public.tarefas t on t.id = l.tarefa_id
    where t.ativo and public.fn_pode_ver_tarefa(t.id)
      and (p_inicio is null or l.inicio_reuniao >= (p_inicio::text || ' 00:00-05')::timestamptz)
      and (p_fim is null or l.inicio_reuniao < ((p_fim + 1)::text || ' 00:00-05')::timestamptz)
      and (p_atividade is null or t.atividade_id = p_atividade)
      and (p_formato is null or t.dados_tipo->>'formato' = p_formato)
  ), ass as (
    select a.*, ls.n_conv from public.presenca_assinaturas a join ls on ls.id = a.lista_id
  )
  select jsonb_build_object(
    'reunioes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', ls.id, 'tarefa_id', ls.tarefa_id, 'codigo', ls.codigo, 'titulo', ls.titulo, 'inicio', ls.inicio_reuniao,
        'formato', ls.dados_tipo->>'formato', 'cancelada', ls.t_status = 'cancelada',
        'atividade', (select codigo from public.atividades where id = ls.atividade_id),
        'aberta', public.fn_presenca_aberta((select pl from public.presenca_listas pl where pl.id = ls.id)), 'convidados', ls.n_conv,
        'assinaturas', (select count(*) from ass where ass.lista_id = ls.id),
        'convidados_assinaram', (select count(*) from ass where ass.lista_id = ls.id and ass.usuario_id in (select uid from public.fn_presenca_convidados(ls.tarefa_id))),
        'sem_convite', (select count(*) from ass where ass.lista_id = ls.id and not ass.convidado_inicial),
        'sem_imagem', (select count(*) from ass where ass.lista_id = ls.id and (not ass.imagem_autoriza or ass.imagem_revogada_em is not null)),
        'pode_gerir', public.fn_presenca_pode_gerir(ls.id)
      ) order by ls.inicio_reuniao desc) from ls), '[]'::jsonb),
    'indicadores', jsonb_build_object(
      'reunioes_realizadas', (select count(*) from ls where ls.t_status <> 'cancelada' and ls.inicio_reuniao <= now()),
      'presencas', (select count(*) from ass),
      'pessoas', (select count(distinct coalesce(usuario_id::text, email)) from ass),
      'internos', (select count(*) from ass where usuario_id is not null),
      'externos', (select count(*) from ass where usuario_id is null),
      'sem_convite', (select count(*) from ass where not convidado_inicial),
      'convidados', (select coalesce(sum(n_conv), 0) from ls where ls.t_status <> 'cancelada' and ls.inicio_reuniao <= now()),
      'convidados_assinaram', (select count(*) from ass a join ls on ls.id = a.lista_id
                               where a.usuario_id in (select uid from public.fn_presenca_convidados(ls.tarefa_id))),
      'sem_imagem', (select count(*) from ass where not imagem_autoriza or imagem_revogada_em is not null),
      'sexo', coalesce((select jsonb_object_agg(k, n) from (select sexo_genero k, count(*) n from ass group by 1) s), '{}'::jsonb),
      'raca', coalesce((select jsonb_object_agg(k, n) from (select cor_raca k, count(*) n from ass group by 1) s), '{}'::jsonb),
      'faixa', coalesce((select jsonb_object_agg(k, n) from (select coalesce(faixa_etaria, 'sem_registro') k, count(*) n from ass group by 1) s), '{}'::jsonb),
      'formato', coalesce((select jsonb_object_agg(k, n) from (select coalesce(dados_tipo->>'formato', '—') k, count(*) n from ls group by 1) s), '{}'::jsonb)))
  into v;
  return v;
end $$;

-- ── exportação: convidado / faixa etária (faixa só onde sexo/raça também saem) ──
create or replace function public.fn_presenca_exportar(p_listas uuid[], p_formato text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_sens boolean := public.fn_presenca_ve_sensivel(); v_rows jsonb; v_n int; x uuid;
begin
  if p_formato not in ('a4', 'xlsx', 'csv') or coalesce(array_length(p_listas, 1), 0) = 0 then raise exception 'presenca:pedido_invalido'; end if;
  foreach x in array p_listas loop
    if not public.fn_presenca_pode_gerir(x) then raise exception 'presenca:sem_permissao'; end if;
  end loop;
  -- o PDF A4 é o documento que circula: nunca leva sexo, raça nem faixa etária
  if p_formato = 'a4' then v_sens := false; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'reuniao', t.codigo || ' — ' || t.titulo, 'data', l.inicio_reuniao, 'formato', t.dados_tipo->>'formato',
      'nome', a.nome, 'email', a.email, 'telefone', a.telefone, 'interno', a.usuario_id is not null, 'origem', a.origem,
      'convidado', a.convidado_inicial,
      'sexo_genero', case when v_sens then a.sexo_genero end, 'sexo_genero_outro', case when v_sens then a.sexo_genero_outro end,
      'cor_raca', case when v_sens then a.cor_raca end, 'faixa_etaria', case when v_sens then a.faixa_etaria end,
      'imagem', case when not a.imagem_autoriza then 'nao' when a.imagem_revogada_em is not null then 'retirada' else 'sim' end,
      'termo_versao', tm.versao, 'assinado_em', a.assinado_em) order by l.inicio_reuniao, a.assinado_em), '[]'::jsonb), count(*)
    into v_rows, v_n
  from public.presenca_assinaturas a join public.presenca_listas l on l.id = a.lista_id
  join public.tarefas t on t.id = l.tarefa_id join public.presenca_termos_imagem tm on tm.id = a.termo_id
  where a.lista_id = any(p_listas);
  insert into public.presenca_exportacoes (usuario_id, formato, listas, n_linhas, com_sensiveis)
  values (auth.uid(), p_formato, p_listas, v_n, v_sens);
  return jsonb_build_object('com_sensiveis', v_sens, 'linhas', v_rows,
    'exportado_por', (select nome_completo from public.usuarios where id = auth.uid()), 'exportado_em', now());
end $$;

-- grants das funções recriadas (create or replace mantém os existentes; reforço explícito)
revoke execute on function public.fn_presenca_detalhe(uuid), public.fn_presenca_painel(date, date, uuid, text),
  public.fn_presenca_exportar(uuid[], text) from public, anon;
grant execute on function public.fn_presenca_detalhe(uuid), public.fn_presenca_painel(date, date, uuid, text),
  public.fn_presenca_exportar(uuid[], text) to authenticated;

-- ROPA: a faixa etária entra nas categorias de dados
update public.lgpd_tratamentos
   set categorias_dados = array['nome, e-mail e telefone', 'sexo/gênero, cor ou raça (sensível) e faixa etária, autodeclarados',
         'presença em reunião (data e hora) e se a pessoa estava entre os convidados', 'autorização de uso de imagem e versão do termo lido']
 where codigo = 'TRAT-008';
