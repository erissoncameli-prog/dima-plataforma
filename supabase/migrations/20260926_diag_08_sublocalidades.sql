-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 08 — sublocalidades
--
-- Uma comunidade/UC (ex.: APA São Francisco) pode ter sublocalidades
-- (bairros, ramais, colocações). Catálogo configurável pela coordenação na
-- aba Admin da mesa (decisão de 26/09/2026). Na ficha é OPCIONAL: escolher
-- da lista, escrever outra ("localidade_nova", a coordenação cadastra
-- depois) ou deixar em branco.
--   · não entra em vw_diag_respostas/agregados nesta versão: célula menor
--     que a comunidade aumenta o risco de reidentificação (RIPD R3). Recorte
--     por sublocalidade, se vier, entra com a supressão de 5 fichas.
--   · sem DELETE: desativar (fichas antigas continuam apontando para ela).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.diag_localidades (
  id             uuid primary key default gen_random_uuid(),
  comunidade_id  uuid not null references public.diag_comunidades(id),
  nome           text not null check (length(btrim(nome)) between 2 and 150),
  ativo          boolean not null default true,
  criado_por     uuid references public.usuarios(id) default auth.uid(),
  criado_em      timestamptz not null default now()
);
create unique index if not exists uq_diag_localidade_nome
  on public.diag_localidades (comunidade_id, lower(btrim(nome)));

alter table public.diag_localidades enable row level security;
revoke all on public.diag_localidades from anon, authenticated;
grant select, insert, update on public.diag_localidades to authenticated;
drop policy if exists diag_localidades_select on public.diag_localidades;
drop policy if exists diag_localidades_insert on public.diag_localidades;
drop policy if exists diag_localidades_update on public.diag_localidades;
create policy diag_localidades_select on public.diag_localidades for select to authenticated
  using (fn_diag_pode_ver_numeros());
create policy diag_localidades_insert on public.diag_localidades for insert to authenticated
  with check (fn_diag_pode_gerir());
create policy diag_localidades_update on public.diag_localidades for update to authenticated
  using (fn_diag_pode_gerir()) with check (fn_diag_pode_gerir());

alter table public.diag_fichas add column if not exists localidade_id uuid references public.diag_localidades(id);
alter table public.diag_fichas add column if not exists localidade_nova text;
alter table public.diag_fichas drop constraint if exists ck_diag_ficha_localidade_nova;
alter table public.diag_fichas add constraint ck_diag_ficha_localidade_nova
  check (localidade_nova is null or (localidade_id is null and length(btrim(localidade_nova)) between 2 and 150));
create index if not exists idx_diag_fichas_localidade on public.diag_fichas (localidade_id);

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
  v_loc        uuid := nullif(p_ficha->>'localidade_id', '')::uuid;
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

  -- sublocalidade (opcional): tem de ser da comunidade escolhida. Pode estar
  -- inativa: a ficha pode ter sido começada antes da desativação.
  if v_loc is not null and not exists (
       select 1 from diag_localidades l
       where l.id = v_loc and l.comunidade_id = (p_ficha->>'comunidade_id')::uuid) then
    raise exception 'diag:ficha_invalida: sublocalidade não pertence à comunidade';
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
    respostas, alertas, status, usou_carencia, app_versao, dispositivo_id, treino,
    localidade_id, localidade_nova)
  values (
    v_uuid_cli, v_codigo, v_q.id, (p_ficha->>'municipio_ibge')::int,
    (p_ficha->>'comunidade_id')::uuid, nullif(btrim(p_ficha->>'comunidade_nova'), ''),
    (p_ficha->>'dt_entrevista')::date, (p_ficha->>'iniciada_em')::timestamptz, v_final, v_uid,
    coalesce((p_ficha->>'aviso_lido')::boolean, false), coalesce((p_ficha->>'aceitou_participar')::boolean, false),
    v_resp, v_alertas, 'enviada', v_carencia, p_ficha->>'app_versao', p_ficha->>'dispositivo_id', v_treino,
    v_loc, case when v_loc is null then nullif(btrim(p_ficha->>'localidade_nova'), '') end)
  on conflict on constraint uq_diag_fichas_uuid_cliente do update set
    codigo = excluded.codigo, municipio_ibge = excluded.municipio_ibge,
    comunidade_id = excluded.comunidade_id, comunidade_nova = excluded.comunidade_nova,
    localidade_id = excluded.localidade_id, localidade_nova = excluded.localidade_nova,
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

revoke execute on function public.diag_enviar_ficha(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.diag_enviar_ficha(jsonb, jsonb, jsonb) to authenticated;
