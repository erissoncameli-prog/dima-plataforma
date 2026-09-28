-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 16 — gravação de áudio nas respostas abertas
--
-- Pedido de 28/09/2026 (etapa 1): o técnico pode GRAVAR a resposta das
-- perguntas de texto aberto (texto_longo), no máximo 3 minutos, uma gravação
-- por pergunta. A transcrição é DIGITADA (pelo técnico no app ou pela
-- coordenação na mesa); IA local fica para depois do piloto.
--
--   • v5 do questionário: aviso ganha o parágrafo da gravação (autorização
--     separada) e a estrutura ganha audio_max_s = 180. v4 arquivada.
--   • diag_fichas.audio_autorizado: resposta à pergunta separada do aviso.
--     Áudio SÓ com true (sem legado: nenhuma ficha antiga tem áudio).
--   • diag_audios + bucket privado diagnostico-audios: a voz identifica a
--     pessoa → mesma regra das fotos (IDENTIFICAÇÃO): consultor externo não
--     ouve, nunca sai na exportação, apagado 2 anos após a validação,
--     arquivo removido pela fila diag_expurgo_arquivos (Edge diag-expurgo).
--   • A transcrição É a resposta de texto (respostas[chave]); o áudio é o
--     apoio. Pergunta com áudio e sem texto não é "pendente": vira alerta
--     audio_sem_transcricao, e a ficha NÃO pode ser validada assim.
--   • diag_transcrever_audio(): coordenação grava a transcrição na mesa
--     (fica registrado quem e quando).
-- ════════════════════════════════════════════════════════════════════════

-- ── v5: aviso com a gravação ────────────────────────────────────────────
do $$
declare
  v4   diag_questionarios;
  par  text := 'Com a sua autorização, algumas respostas poderão ser gravadas em áudio, apenas para registrar com fidelidade o que você disser. As gravações serão ouvidas somente pela equipe do diagnóstico e eliminadas no mesmo prazo dos demais dados que identificam você. Você pode recusar a gravação sem que isso interfira na entrevista.';
  ancora text := 'sem que isso interfira na sua participação na entrevista.';
begin
  if exists (select 1 from diag_questionarios where codigo = 'DSA' and estrutura->>'mudanca_v5' is not null) then
    return;
  end if;
  select * into v4 from diag_questionarios where codigo = 'DSA' and versao = 4;
  if v4.id is null then raise exception 'questionário DSA v4 não encontrado'; end if;
  if position(ancora in v4.aviso_entrevistado) = 0 then raise exception 'aviso da v4 sem o parágrafo das fotos'; end if;

  insert into diag_questionarios (codigo, versao, titulo, estrutura, aviso_entrevistado)
  values ('DSA', 5, v4.titulo,
          v4.estrutura || jsonb_build_object('versao', 5, 'audio_max_s', 180,
            'mudanca_v5', 'Aviso com a gravação de áudio (autorização separada); áudio de até 3 min nas perguntas de texto aberto (28/09/2026)'),
          replace(v4.aviso_entrevistado, ancora, ancora || E'\n\n' || par));
  if v4.status = 'publicado' then
    update diag_questionarios set status = 'publicado' where codigo = 'DSA' and versao = 5;
    update diag_questionarios set status = 'arquivado' where id = v4.id;
  end if;
end $$;

-- ── Autorização e tabela ────────────────────────────────────────────────
alter table public.diag_fichas add column if not exists audio_autorizado boolean;
comment on column public.diag_fichas.audio_autorizado is
  'Família autorizou gravar respostas em áudio (pergunta separada do aviso, v5). Só true aceita áudio.';

create table if not exists public.diag_audios (
  id              uuid primary key default gen_random_uuid(),
  ficha_id        uuid not null references public.diag_fichas(id) on delete cascade,
  uuid_cliente    uuid not null constraint uq_diag_audios_uuid_cliente unique,
  pergunta_chave  text not null,
  -- formato /object/public/<bucket>/<path> — só portador do caminho (regra de Storage do DIMA)
  arquivo_url     text not null,
  mime            text,
  duracao_s       numeric(6,1) check (duracao_s is null or (duracao_s > 0 and duracao_s <= 185)),
  bytes           integer check (bytes is null or (bytes > 0 and bytes <= 4194304)),
  gravado_em      timestamptz,
  criado_por      uuid references public.usuarios(id),
  criado_em       timestamptz not null default now(),
  transcrito_por  uuid references public.usuarios(id),
  transcrito_em   timestamptz,
  constraint uq_diag_audios_pergunta unique (ficha_id, pergunta_chave)
);
create index if not exists idx_diag_audios_ficha on public.diag_audios (ficha_id);
comment on table public.diag_audios is
  'Gravação de voz de resposta aberta do Diagnóstico. IDENTIFICAÇÃO (a voz identifica): consultor não lê; retenção 2 anos; arquivo em diagnostico-audios.';

alter table public.diag_audios enable row level security;
revoke all on public.diag_audios from anon, authenticated;
grant select on public.diag_audios to authenticated;
drop policy if exists diag_audios_select on public.diag_audios;
create policy diag_audios_select on public.diag_audios for select to authenticated
  using (fn_diag_pode_ver_identificacao(ficha_id));
-- sem insert/update/delete para o cliente: só diag_enviar_ficha / diag_transcrever_audio

-- áudio removido (regravado, retenção, treino apagado) → arquivo entra na fila
create or replace function public.fn_diag_audio_expurgo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into diag_expurgo_arquivos (bucket, caminho, motivo)
  values ('diagnostico-audios',
          regexp_replace(old.arquivo_url, '^.*/diagnostico-audios/', ''),
          coalesce(nullif(current_setting('diag.motivo', true), ''), 'áudio removido'));
  return old;
end $$;
drop trigger if exists trg_diag_audio_expurgo on public.diag_audios;
create trigger trg_diag_audio_expurgo after delete on public.diag_audios
  for each row execute function public.fn_diag_audio_expurgo();

-- ficha com identificação já apagada não recebe áudio
drop trigger if exists trg_diag_audios_bloqueio on public.diag_audios;
create trigger trg_diag_audios_bloqueio before insert or update on public.diag_audios
  for each row execute function public.fn_diag_bloqueia_ident_apos_retencao();

drop trigger if exists trg_audit_diag_audios on public.diag_audios;
create trigger trg_audit_diag_audios after insert or update or delete on public.diag_audios
  for each row execute function public.fn_trg_audit('redigir');

-- retenção: quando a identificação da ficha é apagada (fn_diag_aplicar_retencao
-- marca identificacao_apagada_em), os áudios vão junto — sem mexer na rotina.
create or replace function public.fn_diag_audios_retencao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from diag_audios where ficha_id = new.id;
  return new;
end $$;
drop trigger if exists trg_diag_audios_retencao on public.diag_fichas;
create trigger trg_diag_audios_retencao after update of identificacao_apagada_em on public.diag_fichas
  for each row when (old.identificacao_apagada_em is null and new.identificacao_apagada_em is not null)
  execute function public.fn_diag_audios_retencao();

-- validar exige todas as gravações transcritas (os números só leem texto)
create or replace function public.fn_diag_audios_pendentes(p_ficha_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(a.pergunta_chave order by a.pergunta_chave), '{}')
  from diag_audios a join diag_fichas f on f.id = a.ficha_id
  where a.ficha_id = p_ficha_id
    and coalesce(btrim(f.respostas->>a.pergunta_chave), '') = ''
$$;

create or replace function public.fn_diag_valida_audios() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pend text[] := fn_diag_audios_pendentes(new.id);
        v_rot  text;
begin
  if cardinality(v_pend) > 0 then
    select string_agg('P' || (p.pergunta->>'n'), ', ' order by (p.pergunta->>'n')::int) into v_rot
      from diag_questionarios q, fn_diag_perguntas(q.estrutura) p
     where q.id = new.questionario_id and p.pergunta->>'chave' = any(v_pend);
    raise exception 'diag:audio_sem_transcricao: transcreva as respostas gravadas antes de validar (%) — seção Áudios da ficha',
      coalesce(v_rot, array_to_string(v_pend, ', '));
  end if;
  return new;
end $$;
drop trigger if exists trg_diag_valida_audios on public.diag_fichas;
create trigger trg_diag_valida_audios before update of status on public.diag_fichas
  for each row when (new.status = 'validada' and old.status is distinct from 'validada')
  execute function public.fn_diag_valida_audios();

-- alertas: pergunta com áudio não é "em branco"; sem texto vira audio_sem_transcricao
create or replace function public.fn_diag_alertas_audio(p_alertas jsonb, p_ficha_id uuid, p_estrutura jsonb)
returns jsonb language sql stable security definer set search_path = public as $$
  with aud as (
    select a.pergunta_chave as chave,
           coalesce(btrim(f.respostas->>a.pergunta_chave), '') = '' as sem_texto
    from diag_audios a join diag_fichas f on f.id = a.ficha_id
    where a.ficha_id = p_ficha_id
  )
  select coalesce((select jsonb_agg(al) from jsonb_array_elements(coalesce(p_alertas, '[]')) al
                   where not (al->>'tipo' in ('pendente', 'audio_sem_transcricao')
                              and al->>'chave' in (select chave from aud))), '[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object('tipo', 'audio_sem_transcricao', 'chave', aud.chave,
                                                       'n', (p.pergunta->>'n')::int) order by (p.pergunta->>'n')::int)
                   from aud join fn_diag_perguntas(p_estrutura) p on p.pergunta->>'chave' = aud.chave
                   where aud.sem_texto), '[]'::jsonb)
$$;

-- ── Bucket (privado) ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diagnostico-audios', 'diagnostico-audios', false, 4194304,
        array['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/aac','audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- mesmas regras de caminho/acesso das fotos: <uuid_cliente da ficha>/<uuid do áudio>.<ext>
drop policy if exists "diag_audios_obj_select" on storage.objects;
drop policy if exists "diag_audios_obj_insert" on storage.objects;
drop policy if exists "diag_audios_obj_delete" on storage.objects;
create policy "diag_audios_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'diagnostico-audios' and public.fn_diag_foto_pode_ler(name, owner));
create policy "diag_audios_obj_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'diagnostico-audios' and public.fn_diag_foto_pode_enviar(name));
create policy "diag_audios_obj_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'diagnostico-audios' and public.fn_diag_pode_gerir());

-- ── Transcrição pela coordenação (mesa) ─────────────────────────────────
create or replace function public.diag_transcrever_audio(p_audio_id uuid, p_texto text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a      diag_audios;
  f      diag_fichas;
  q      diag_questionarios;
  v_txt  text := btrim(coalesce(p_texto, ''));
  v_max  int;
begin
  if not fn_diag_pode_gerir() then
    raise exception 'diag:nao_autorizado: só coordenação e super_admin transcrevem na mesa';
  end if;
  select * into a from diag_audios where id = p_audio_id;
  if a.id is null then raise exception 'diag:nao_encontrada'; end if;
  select * into f from diag_fichas where id = a.ficha_id for update;
  if f.status not in ('enviada', 'devolvida') then
    raise exception 'diag:transicao_invalida: ficha % não aceita transcrição', f.status;
  end if;
  select * into q from diag_questionarios where id = f.questionario_id;
  v_max := coalesce((q.estrutura->>'texto_max_len')::int, 2000);
  if v_txt = '' then raise exception 'diag:parametro_invalido: transcrição vazia'; end if;
  if length(v_txt) > v_max then raise exception 'diag:parametro_invalido: transcrição acima de % caracteres', v_max; end if;

  update diag_fichas
     set respostas = jsonb_set(respostas, array[a.pergunta_chave], to_jsonb(v_txt), true)
   where id = f.id;
  update diag_fichas
     set alertas = fn_diag_alertas_audio(alertas, f.id, q.estrutura)
   where id = f.id;
  update diag_audios set transcrito_por = auth.uid(), transcrito_em = now() where id = a.id;
  return jsonb_build_object('chave', a.pergunta_chave, 'texto', v_txt,
                            'pendentes', to_jsonb(fn_diag_audios_pendentes(f.id)));
end $$;

-- ── ROPA ────────────────────────────────────────────────────────────────
update public.lgpd_tratamentos
   set categorias_dados = categorias_dados || array['gravação de voz das respostas abertas (opcional, com autorização separada)'],
       tabelas = tabelas || array['diag_audios', 'storage:diagnostico-audios'],
       atualizado_em = now()
 where codigo = 'TRAT-001'
   and not ('diag_audios' = any(tabelas));

-- ── diag_enviar_ficha: áudios + audio_autorizado (redefinida a partir da 15) ──
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
  v_audios     jsonb;
  au           jsonb;
begin
  if v_uid is null then
    raise exception 'diag:sem_sessao: faça login novamente';
  end if;
  select perfil into v_perfil from usuarios where id = v_uid and ativo;
  -- coordenação NÃO aplica ficha real; só treina (decisão de 26/09)
  if v_perfil is null or not (v_perfil in ('tecnico','super_admin') or (v_perfil = 'coordenacao' and v_treino)) then
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
    localidade_id, localidade_nova, fotos_registradas, fotos_autorizadas, audio_autorizado)
  values (
    v_uuid_cli, v_codigo, v_q.id, (p_ficha->>'municipio_ibge')::int,
    (p_ficha->>'comunidade_id')::uuid, nullif(btrim(p_ficha->>'comunidade_nova'), ''),
    (p_ficha->>'dt_entrevista')::date, (p_ficha->>'iniciada_em')::timestamptz, v_final, v_uid,
    coalesce((p_ficha->>'aviso_lido')::boolean, false), coalesce((p_ficha->>'aceitou_participar')::boolean, false),
    v_resp, v_alertas, 'enviada', v_carencia, p_ficha->>'app_versao', p_ficha->>'dispositivo_id', v_treino,
    v_loc, case when v_loc is null then nullif(btrim(p_ficha->>'localidade_nova'), '') end,
    case when coalesce((p_ficha->>'aceitou_participar')::boolean, false)
         then least(greatest((p_ficha->>'fotos_registradas')::int, 0), 8) end,
    case when coalesce((p_ficha->>'aceitou_participar')::boolean, false)
         then (p_ficha->>'fotos_autorizadas')::boolean end,
    case when coalesce((p_ficha->>'aceitou_participar')::boolean, false)
         then (p_ficha->>'audio_autorizado')::boolean end)
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
    fotos_registradas = excluded.fotos_registradas,
    fotos_autorizadas = excluded.fotos_autorizadas,
    audio_autorizado = excluded.audio_autorizado,
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

  -- família não autorizou fotos (pergunta separada, desde a v4 do aviso):
  -- nenhuma foto é aceita — nem de aparelho com app antigo.
  if (p_ficha->>'fotos_autorizadas')::boolean is false
     and (jsonb_array_length(coalesce(p_fotos, '[]')) > 0
          or exists (select 1 from diag_fotos where ficha_id = v_ficha_id)) then
    raise exception 'diag:fotos_nao_autorizadas: a família não autorizou fotos nesta ficha';
  end if;

  -- fotos: o arquivo já subiu para <uuid_cliente da ficha>/...; aqui só o registro.
  -- Foto que o aparelho não reenvia NÃO é apagada (pode ter subido antes).
  for f in select * from jsonb_array_elements(coalesce(p_fotos,'[]')) loop
    if (f->>'arquivo_url') !~ ('/diagnostico-fotos/' || v_uuid_cli::text || '/[^/]+$') then
      raise exception 'diag:foto_invalida: caminho da foto não pertence a esta ficha';
    end if;
    insert into diag_fotos (ficha_id, uuid_cliente, tema, pergunta_chave, legenda, arquivo_url, tirada_em, criado_por,
                            lat, lon, gps_precisao_m, gps_origem)
    values (v_ficha_id, (f->>'uuid_cliente')::uuid, f->>'tema', nullif(f->>'pergunta_chave',''),
            nullif(btrim(f->>'legenda'),''), f->>'arquivo_url', (f->>'tirada_em')::timestamptz, v_uid,
            (f->>'lat')::numeric, (f->>'lon')::numeric, (f->>'gps_precisao_m')::numeric,
            case when (f->>'lat') is not null then nullif(f->>'gps_origem','') end)
    on conflict on constraint uq_diag_fotos_uuid_cliente do update set
      tema = excluded.tema, pergunta_chave = excluded.pergunta_chave, legenda = excluded.legenda,
      lat = excluded.lat, lon = excluded.lon, gps_precisao_m = excluded.gps_precisao_m,
      gps_origem = excluded.gps_origem
    where diag_fotos.ficha_id = v_ficha_id;
  end loop;
  if (select count(*) from diag_fotos where ficha_id = v_ficha_id) > 8 then
    raise exception 'diag:foto_invalida: máximo de 8 fotos por ficha';
  end if;

  -- áudios (v5): só com autorização da família, só em pergunta de texto aberto,
  -- até audio_max_s (+5 s de folga), uma gravação por pergunta. Mesmo
  -- transporte das fotos: o arquivo já subiu para <uuid_cliente da ficha>/...
  v_audios := case when coalesce((p_ficha->>'aceitou_participar')::boolean, false)
                   then coalesce(p_ficha->'audios', '[]'::jsonb) else '[]'::jsonb end;
  if jsonb_typeof(v_audios) <> 'array' then
    raise exception 'diag:audio_invalido: lista de áudios mal formada';
  end if;
  if (p_ficha->>'audio_autorizado')::boolean is not true
     and (jsonb_array_length(v_audios) > 0 or exists (select 1 from diag_audios where ficha_id = v_ficha_id)) then
    raise exception 'diag:audio_nao_autorizado: a família não autorizou gravar nesta ficha';
  end if;
  for au in select * from jsonb_array_elements(v_audios) loop
    if (au->>'arquivo_url') !~ ('/diagnostico-audios/' || v_uuid_cli::text || '/[^/]+$') then
      raise exception 'diag:audio_invalido: caminho do áudio não pertence a esta ficha';
    end if;
    if not exists (select 1 from fn_diag_perguntas(v_q.estrutura) p
                   where p.pergunta->>'chave' = au->>'pergunta_chave' and p.pergunta->>'tipo' = 'texto_longo') then
      raise exception 'diag:audio_invalido: gravação só em pergunta de texto aberto (%)', au->>'pergunta_chave';
    end if;
    if coalesce((au->>'duracao_s')::numeric, 0) > coalesce((v_q.estrutura->>'audio_max_s')::numeric, 180) + 5 then
      raise exception 'diag:audio_invalido: gravação acima do limite de % s', coalesce(v_q.estrutura->>'audio_max_s', '180');
    end if;
    -- regravação: a gravação anterior da mesma pergunta sai (arquivo → fila de expurgo)
    perform set_config('diag.motivo', 'audio_regravado', true);
    delete from diag_audios
     where ficha_id = v_ficha_id and pergunta_chave = au->>'pergunta_chave'
       and uuid_cliente <> (au->>'uuid_cliente')::uuid;
    perform set_config('diag.motivo', '', true);
    insert into diag_audios (ficha_id, uuid_cliente, pergunta_chave, arquivo_url, mime, duracao_s, bytes, gravado_em, criado_por)
    values (v_ficha_id, (au->>'uuid_cliente')::uuid, au->>'pergunta_chave', au->>'arquivo_url',
            nullif(au->>'mime', ''), (au->>'duracao_s')::numeric, (au->>'bytes')::int,
            (au->>'gravado_em')::timestamptz, v_uid)
    on conflict on constraint uq_diag_audios_uuid_cliente do update set
      duracao_s = excluded.duracao_s, bytes = excluded.bytes, mime = excluded.mime
    where diag_audios.ficha_id = v_ficha_id;
  end loop;
  if exists (select 1 from diag_audios where ficha_id = v_ficha_id) then
    update diag_fichas set alertas = fn_diag_alertas_audio(v_alertas, v_ficha_id, v_q.estrutura)
     where id = v_ficha_id
    returning alertas into v_alertas;
  end if;

  return jsonb_build_object('id', v_ficha_id, 'codigo', v_codigo, 'status', 'enviada',
                            'alertas', v_alertas, 'usou_carencia', v_carencia,
                            'status_anterior', v_status_ant, 'treino', v_treino);
end $$;

revoke execute on function public.diag_enviar_ficha(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.diag_enviar_ficha(jsonb, jsonb, jsonb) to authenticated;

revoke execute on function public.diag_transcrever_audio(uuid, text), public.fn_diag_audios_pendentes(uuid),
  public.fn_diag_alertas_audio(jsonb, uuid, jsonb) from public, anon;
grant execute on function public.diag_transcrever_audio(uuid, text), public.fn_diag_audios_pendentes(uuid)
  to authenticated;
revoke execute on function public.fn_diag_alertas_audio(jsonb, uuid, jsonb) from authenticated;
revoke execute on function public.fn_diag_audio_expurgo(), public.fn_diag_audios_retencao(),
  public.fn_diag_valida_audios() from public, anon, authenticated;
