-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 07 — modo treino
--
-- Testar o app em PRODUÇÃO, de ponta a ponta, sem sujar os dados reais e
-- sem precisar publicar a v1 antes do piloto (decisão de 26/09/2026).
--   · diag_fichas.treino marca a ficha; código começa com TRE- (e só ela);
--   · ficha de treino aceita questionário em RASCUNHO (ficha real, não);
--   · treino nunca vira real, nem o contrário;
--   · fica FORA de vw_diag_respostas (logo de indicadores e agregados) e
--     das sugestões;
--   · permissão própria: módulo 'diagnostico_treino' em usuario_permissoes
--     (concedido com prazo pelo super_admin, tela de Usuários), além do
--     'diagnostico'; super_admin pode sempre;
--   · diag_apagar_treino() (coordenação/super_admin) apaga TODAS as fichas
--     de treino com moradores, identificação e fotos (arquivos → fila de
--     expurgo). A auditoria redigida registra as exclusões.
-- ════════════════════════════════════════════════════════════════════════

alter table public.diag_fichas add column if not exists treino boolean not null default false;
create index if not exists idx_diag_fichas_treino on public.diag_fichas (treino) where treino;
alter table public.diag_fichas drop constraint if exists ck_diag_ficha_treino_codigo;
alter table public.diag_fichas add constraint ck_diag_ficha_treino_codigo
  check (treino = (codigo like 'TRE-%'));

create or replace function public.fn_diag_pode_treinar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    fn_diag_perfil_ativo() = 'super_admin'
    or (fn_diag_perfil_ativo() = 'tecnico' and tem_permissao('diagnostico') and tem_permissao('diagnostico_treino')),
  false)
$$;

create or replace function public.diag_enviar_ficha(
  p_ficha jsonb, p_moradores jsonb default '[]'::jsonb, p_fotos jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid        uuid := auth.uid();
  v_perfil     perfil_usuario;
  v_carencia   boolean := false;
  v_final      timestamptz;
  v_q          diag_questionarios;
  v_exist      diag_fichas;
  v_ficha_id   uuid;
  v_uuid_cli   uuid;
  v_resp       jsonb;
  v_alertas    jsonb;
  v_status_ant text;
  m            jsonb;
  f            jsonb;
  v_mor_id     uuid;
  v_nome       text;
  v_codigo     text;
  v_treino     boolean := coalesce((p_ficha->>'treino')::boolean, false);
begin
  if v_uid is null then
    raise exception 'diag:sem_sessao: faça login novamente';
  end if;
  select perfil into v_perfil from usuarios where id = v_uid and ativo;
  if v_perfil is null or v_perfil not in ('tecnico','super_admin') then
    raise exception 'diag:nao_autorizado: perfil sem acesso para aplicar questionário';
  end if;

  v_final := (p_ficha->>'finalizada_em')::timestamptz;
  if v_final is null or v_final > now() + interval '1 day' then
    raise exception 'diag:ficha_invalida: finalizada_em ausente ou no futuro';
  end if;

  -- treino: exige a permissão própria; sem carência
  if v_treino and not fn_diag_pode_treinar() then
    raise exception 'diag:sem_permissao_treino: modo treino não liberado para este usuário';
  end if;

  -- permissão: vigente agora, ou vigente quando a ficha foi concluída e
  -- vencida há no máximo 15 dias (carência decidida em 26/09)
  if not v_treino and v_perfil = 'tecnico' and not tem_permissao('diagnostico') then
    if exists (select 1 from usuario_permissoes up
               where up.usuario_id = v_uid and up.modulo = 'diagnostico' and up.ativo
                 and up.valido_de <= v_final
                 and up.valido_ate is not null and up.valido_ate >= v_final
                 and now() <= up.valido_ate + interval '15 days') then
      v_carencia := true;
    else
      raise exception 'diag:sem_permissao: acesso ao Diagnóstico vencido; peça renovação ao super_admin';
    end if;
  end if;

  select * into v_q from diag_questionarios where id = (p_ficha->>'questionario_id')::uuid;
  -- ficha real só em versão publicada; treino também aceita rascunho
  -- (é para isso que o modo existe: testar antes de publicar)
  if v_q.id is null or (v_q.status = 'rascunho' and not v_treino) then
    raise exception 'diag:questionario_invalido: versão do questionário não publicada';
  end if;

  v_uuid_cli := (p_ficha->>'uuid_cliente')::uuid;
  if v_uuid_cli is null then
    raise exception 'diag:ficha_invalida: uuid_cliente ausente';
  end if;

  select * into v_exist from diag_fichas where uuid_cliente = v_uuid_cli for update;
  if v_exist.id is not null then
    if v_exist.entrevistador_id <> v_uid then
      raise exception 'diag:nao_autorizado: ficha de outro entrevistador';
    end if;
    if v_exist.status not in ('enviada','devolvida') then
      raise exception 'diag:ja_%: a ficha já foi % pela coordenação', v_exist.status, v_exist.status;
    end if;
    if v_exist.treino <> v_treino then
      raise exception 'diag:ficha_invalida: ficha de treino não vira real (nem o contrário)';
    end if;
    if v_exist.questionario_id <> v_q.id then
      raise exception 'diag:ficha_invalida: versão do questionário não pode mudar';
    end if;
  end if;

  if not coalesce((p_ficha->>'aceitou_participar')::boolean, false) then
    v_resp := '{}'::jsonb;
    p_moradores := '[]'::jsonb;
    p_fotos := '[]'::jsonb;
  else
    perform fn_diag_validar_moradores(v_q.estrutura, p_moradores);
    v_resp := fn_diag_normalizar_respostas(v_q.estrutura, p_ficha->'respostas', p_moradores);
  end if;

  v_alertas := fn_diag_calcular_alertas(v_q.estrutura, v_resp, p_moradores, v_carencia,
                                         (p_ficha->>'comunidade_id') is null);
  v_codigo := p_ficha->>'codigo';
  if v_treino <> coalesce(v_codigo like 'TRE-%', false) then
    raise exception 'diag:ficha_invalida: código de treino começa com TRE- (e só ele)';
  end if;
  if exists (select 1 from diag_fichas where codigo = v_codigo and uuid_cliente <> v_uuid_cli) then
    raise exception 'diag:codigo_duplicado: gere um novo código e reenvie';
  end if;

  v_status_ant := v_exist.status;
  insert into diag_fichas as d (
    uuid_cliente, codigo, questionario_id, municipio_ibge, comunidade_id, comunidade_nova,
    dt_entrevista, iniciada_em, finalizada_em, entrevistador_id, aviso_lido, aceitou_participar,
    respostas, alertas, status, usou_carencia, app_versao, dispositivo_id, treino)
  values (
    v_uuid_cli, v_codigo, v_q.id, (p_ficha->>'municipio_ibge')::int,
    (p_ficha->>'comunidade_id')::uuid, nullif(btrim(p_ficha->>'comunidade_nova'), ''),
    (p_ficha->>'dt_entrevista')::date, (p_ficha->>'iniciada_em')::timestamptz, v_final, v_uid,
    coalesce((p_ficha->>'aviso_lido')::boolean, false), coalesce((p_ficha->>'aceitou_participar')::boolean, false),
    v_resp, v_alertas, 'enviada', v_carencia, p_ficha->>'app_versao', p_ficha->>'dispositivo_id', v_treino)
  on conflict on constraint uq_diag_fichas_uuid_cliente do update set
    codigo = excluded.codigo, municipio_ibge = excluded.municipio_ibge,
    comunidade_id = excluded.comunidade_id, comunidade_nova = excluded.comunidade_nova,
    dt_entrevista = excluded.dt_entrevista, iniciada_em = excluded.iniciada_em,
    finalizada_em = excluded.finalizada_em, aviso_lido = excluded.aviso_lido,
    aceitou_participar = excluded.aceitou_participar, respostas = excluded.respostas,
    alertas = excluded.alertas, status = 'enviada', motivo_devolucao = null,
    usou_carencia = d.usou_carencia or excluded.usou_carencia,
    app_versao = excluded.app_versao, dispositivo_id = excluded.dispositivo_id,
    enviado_em = now()
  returning id into v_ficha_id;

  -- identificação da ficha (nome opcional, GPS, observação)
  if nullif(btrim(p_ficha->>'entrevistado_nome'), '') is not null
     or (p_ficha->>'lat') is not null or nullif(btrim(p_ficha->>'obs_localizacao'), '') is not null then
    insert into diag_fichas_identificacao as i (ficha_id, entrevistado_nome, lat, lon, gps_precisao_m, gps_em, obs_localizacao)
    values (v_ficha_id, nullif(btrim(p_ficha->>'entrevistado_nome'), ''),
            (p_ficha->>'lat')::numeric, (p_ficha->>'lon')::numeric,
            (p_ficha->>'gps_precisao_m')::numeric, (p_ficha->>'gps_em')::timestamptz,
            nullif(btrim(p_ficha->>'obs_localizacao'), ''))
    on conflict (ficha_id) do update set
      entrevistado_nome = excluded.entrevistado_nome, lat = excluded.lat, lon = excluded.lon,
      gps_precisao_m = excluded.gps_precisao_m, gps_em = excluded.gps_em,
      obs_localizacao = excluded.obs_localizacao;
  else
    delete from diag_fichas_identificacao where ficha_id = v_ficha_id;
  end if;

  -- moradores: regravados por inteiro (a lista do aparelho é a verdade)
  delete from diag_moradores where ficha_id = v_ficha_id;
  for m in select * from jsonb_array_elements(coalesce(p_moradores,'[]')) loop
    insert into diag_moradores (ficha_id, ordem, idade, sexo_genero, sexo_genero_outro,
                                parentesco, escolaridade, atividade_principal, e_entrevistado)
    values (v_ficha_id, (m->>'ordem')::smallint, (m->>'idade')::smallint,
            nullif(m->>'sexo_genero',''), nullif(btrim(m->>'sexo_genero_outro'),''),
            nullif(btrim(m->>'parentesco'),''), nullif(btrim(m->>'escolaridade'),''),
            nullif(btrim(m->>'atividade_principal'),''), coalesce((m->>'e_entrevistado')::boolean,false))
    returning id into v_mor_id;
    v_nome := nullif(btrim(m->>'nome'), '');
    if v_nome is not null then
      insert into diag_moradores_identificacao (morador_id, nome) values (v_mor_id, v_nome);
    end if;
  end loop;

  -- fotos: o arquivo já subiu para <uuid_cliente da ficha>/...; aqui só o registro.
  -- Foto que o aparelho não reenvia NÃO é apagada (pode ter subido antes).
  for f in select * from jsonb_array_elements(coalesce(p_fotos,'[]')) loop
    if (f->>'arquivo_url') !~ ('/diagnostico-fotos/' || v_uuid_cli::text || '/[^/]+$') then
      raise exception 'diag:foto_invalida: caminho da foto não pertence a esta ficha';
    end if;
    insert into diag_fotos (ficha_id, uuid_cliente, tema, pergunta_chave, legenda, arquivo_url, tirada_em, criado_por)
    values (v_ficha_id, (f->>'uuid_cliente')::uuid, f->>'tema', nullif(f->>'pergunta_chave',''),
            nullif(btrim(f->>'legenda'),''), f->>'arquivo_url', (f->>'tirada_em')::timestamptz, v_uid)
    on conflict on constraint uq_diag_fotos_uuid_cliente do update set
      tema = excluded.tema, pergunta_chave = excluded.pergunta_chave, legenda = excluded.legenda
    where diag_fotos.ficha_id = v_ficha_id;
  end loop;
  if (select count(*) from diag_fotos where ficha_id = v_ficha_id) > 8 then
    raise exception 'diag:foto_invalida: máximo de 8 fotos por ficha';
  end if;

  return jsonb_build_object('id', v_ficha_id, 'codigo', v_codigo, 'status', 'enviada',
                            'alertas', v_alertas, 'usou_carencia', v_carencia,
                            'status_anterior', v_status_ant, 'treino', v_treino);
end $$;

create or replace view public.vw_diag_respostas
with (security_invoker = true) as
with base as (
  select f.id as ficha_id, f.questionario_id, f.status, (f.status = 'validada') as validada,
         f.municipio_ibge,
         coalesce(f.comunidade_id::text, 'nova:' || lower(btrim(f.comunidade_nova))) as comunidade_chave,
         coalesce(c.nome, f.comunidade_nova) as comunidade_nome,
         case when f.respostas->>'sexo_genero' in ('mulher','homem') then f.respostas->>'sexo_genero'
              else 'outro_ou_nao_informado' end as sexo_respondente,
         f.respostas, q.estrutura
  from public.diag_fichas f
  join public.diag_questionarios q on q.id = f.questionario_id
  left join public.diag_comunidades c on c.id = f.comunidade_id
  where f.status in ('enviada','validada') and f.aceitou_participar
    and not f.treino                       -- treino nunca entra em número
)
select b.ficha_id, b.questionario_id, b.status, b.validada, b.municipio_ibge,
       b.comunidade_chave, b.comunidade_nome, b.sexo_respondente,
       p.bloco, p.pergunta->>'chave' as chave, (p.pergunta->>'n')::int as n, p.pergunta->>'tipo' as tipo,
       (v.val = '"_nr"'::jsonb) as nr,
       case when v.val = '"_nr"'::jsonb then null
            when p.pergunta->>'tipo' = 'unica' then v.val #>> '{}'
            when p.pergunta->>'tipo' = 'multipla' then mm.opcao end as opcao,
       case when p.pergunta->>'tipo' in ('inteiro','decimal') and jsonb_typeof(v.val) = 'number'
            then (v.val #>> '{}')::numeric end as valor_num
from base b
cross join lateral public.fn_diag_perguntas(b.estrutura) p
cross join lateral (select b.respostas -> (p.pergunta->>'chave') as val) v
left join lateral (select jsonb_array_elements_text(v.val) as opcao
                   where jsonb_typeof(v.val) = 'array') mm on true
where v.val is not null
  and p.pergunta->>'tipo' in ('unica','multipla','inteiro','decimal')
union all
-- tamanho do domicílio (linhas da P9) como pergunta numérica derivada
select b.ficha_id, b.questionario_id, b.status, b.validada, b.municipio_ibge,
       b.comunidade_chave, b.comunidade_nome, b.sexo_respondente,
       'identificacao', '_total_moradores', 9, 'inteiro', false, null,
       (select count(*) from public.diag_moradores m where m.ficha_id = b.ficha_id)::numeric
from base b
where exists (select 1 from public.diag_moradores m where m.ficha_id = b.ficha_id);

create or replace function public.fn_diag_sugestoes(p_chave text default null)
returns table (chave text, texto text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (fn_diag_pode_aplicar() or fn_diag_pode_gerir()) then
    raise exception 'diag:nao_autorizado';
  end if;
  if p_chave is not null and p_chave not in (select * from fn_diag_chaves_com_sugestao()) then
    raise exception 'diag:parametro_invalido: sugestões não habilitadas para %', p_chave;
  end if;
  return query
  with chaves as (
    select k from fn_diag_chaves_com_sugestao() k where p_chave is null or k = p_chave
  ),
  brutos as (
    select k.k as chave, f.id as ficha_id, btrim(f.respostas->>k.k) as t
    from chaves k join diag_fichas f on f.status in ('enviada','validada') and not f.treino
    where k.k not like 'moradores.%' and jsonb_typeof(f.respostas->k.k) = 'string'
      and f.respostas->>k.k <> '_nr'
    union all
    select k.k, m.ficha_id, btrim(to_jsonb(m) ->> substr(k.k, 11))
    from chaves k join diag_moradores m on true
    join diag_fichas f on f.id = m.ficha_id and f.status in ('enviada','validada') and not f.treino
    where k.k like 'moradores.%'
  ),
  grupos as (
    select b.chave, fn_diag_normalizar_texto(b.t) as norm,
           mode() within group (order by b.t) as grafia,
           count(distinct b.ficha_id) as nfichas
    from brutos b
    where b.t is not null and length(b.t) between 2 and 120
    group by b.chave, fn_diag_normalizar_texto(b.t)
    having count(distinct b.ficha_id) >= 2
  )
  select g.chave, g.grafia
  from grupos g
  where not exists (select 1 from diag_sugestoes_ocultas o
                    where o.chave = g.chave and o.texto_normalizado = g.norm)
  order by g.chave, g.nfichas desc, g.grafia;
end $$;

create or replace function public.diag_apagar_treino()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not fn_diag_pode_gerir() then
    raise exception 'diag:nao_autorizado: só coordenação e super_admin apagam o treino';
  end if;
  perform set_config('diag.motivo', 'treino_apagado', true);
  delete from diag_fichas where treino;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.fn_diag_pode_treinar(), public.diag_apagar_treino(),
  public.diag_enviar_ficha(jsonb, jsonb, jsonb), public.fn_diag_sugestoes(text) from public, anon;
grant execute on function public.fn_diag_pode_treinar(), public.diag_apagar_treino(),
  public.diag_enviar_ficha(jsonb, jsonb, jsonb), public.fn_diag_sugestoes(text) to authenticated;
revoke all on public.vw_diag_respostas from anon;
