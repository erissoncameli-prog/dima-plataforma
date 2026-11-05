-- =====================================================================
-- DIMA · Plataforma de Gestão UNESCO — DUMP DE ESTRUTURA (schema public)
-- Projeto 218BRA2001 · SEMA/AC · Fundo Brasil-ONU
-- Supabase: Projeto-SEMA-UNESCO (wfymnmlinonvdqfucjya) · PostgreSQL 17
--
-- Gerado a partir dos catálogos do banco de produção.
-- Ordem: papéis → stubs auth/storage → extensões → enums → sequences →
--        tabelas → constraints → índices → funções → views → triggers →
--        rules → RLS/policies → grants → comentários → setval
--
-- Restaurar: ./restaurar.sh  (ver RESTAURAR.md)
-- =====================================================================

\set ON_ERROR_STOP on

-- Funções em linguagem SQL são validadas na criação; como as funções são
-- criadas em ordem alfabética, uma que chama outra ainda inexistente
-- falharia. Igual ao que o pg_dump faz.
SET check_function_bodies = off;

CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS extensions;

-- ---------------------------------------------------------------------
-- PAPÉIS DO SUPABASE (não existem num Postgres comum)
-- ---------------------------------------------------------------------
DO $dima$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'postgres';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT CREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin NOLOGIN NOINHERIT CREATEROLE;
  END IF;
  GRANT anon, authenticated, service_role TO authenticator;
END
$dima$;

-- ---------------------------------------------------------------------
-- STUB DO SCHEMA auth
-- No Supabase estas tabelas pertencem ao GoTrue e vêm no dump de `auth`.
-- Aqui existem só para que FKs, policies e funções possam ser criadas.
-- ⚠️ SEM HASH DE SENHA — login não funciona no banco local (ver RESTAURAR.md).
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  instance_id uuid,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  is_super_admin boolean DEFAULT false,
  role text DEFAULT 'authenticated',
  aud text DEFAULT 'authenticated',
  confirmation_token text DEFAULT '',
  recovery_token text DEFAULT '',
  email_change text DEFAULT '',
  email_change_token_new text DEFAULT '',
  email_change_token_current text DEFAULT '',
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id text,
  provider text,
  identity_data jsonb DEFAULT '{}'::jsonb,
  last_sign_in_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (provider, provider_id)
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
$$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.email', true), '')
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- ---------------------------------------------------------------------
-- STUB DO SCHEMA storage
-- Só os metadados que algumas funções consultam (get_monitoramento_banco,
-- conferência da nota técnica, policies de bucket). Os arquivos em si
-- ficam nos buckets do Supabase e NÃO vêm neste backup.
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  path_tokens text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;

GRANT USAGE ON SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;

SET search_path = public, extensions;
-- ===== EXTENSÕES =====
-- Em producao sao estas 6. pgcrypto e uuid-ossp sao obrigatorias (DEFAULT de
-- coluna usa gen_random_uuid()/uuid_generate_v4() e crypt()). As outras sao do
-- Supabase: pg_cron (crons), pg_net (HTTP do banco), supabase_vault (segredos)
-- e pg_stat_statements. Num Postgres comum elas nao existem, e nada do que a
-- plataforma consulta depende delas - por isso a falta so avisa.
CREATE SCHEMA IF NOT EXISTS vault;
DO $dima_ext$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('pgcrypto',           'extensions', true),
      ('uuid-ossp',          'extensions', true),
      ('pg_stat_statements', 'extensions', false),
      ('pg_cron',            'pg_catalog', false),
      ('pg_net',             'public',     false),
      ('supabase_vault',     'vault',      false)
    ) AS e(nome, esquema, obrigatoria)
  LOOP
    BEGIN
      EXECUTE format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I', r.nome, r.esquema);
    EXCEPTION WHEN OTHERS THEN
      IF r.obrigatoria THEN
        RAISE EXCEPTION 'Extensao obrigatoria % indisponivel: %. No Debian/Ubuntu instale postgresql-<versao>-contrib.', r.nome, SQLERRM;
      END IF;
      RAISE NOTICE 'extensao % indisponivel neste servidor (so o Supabase a tem) - seguindo sem ela', r.nome;
    END;
  END LOOP;
END
$dima_ext$;

-- ===== ENUMS =====
CREATE TYPE public.fase_atividade AS ENUM ('A_INICIAR', 'ELABORACAO', 'LICITACAO', 'ELABORADO', 'CONTRATADO', 'CONCLUIDO');
CREATE TYPE public.idioma AS ENUM ('pt', 'en', 'es');
CREATE TYPE public.nivel_risco AS ENUM ('muito_alto', 'alto', 'medio', 'baixo');
CREATE TYPE public.operacao_audit AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'LOGIN', 'EXPORT');
CREATE TYPE public.perfil_usuario AS ENUM ('super_admin', 'coordenacao', 'tecnico', 'financeiro', 'consultor_externo', 'visualizador');
CREATE TYPE public.prioridade_tarefa AS ENUM ('baixa', 'media', 'alta', 'urgente');
CREATE TYPE public.situacao_financeiro AS ENUM ('pago', 'a_pagar', 'cancelado');
CREATE TYPE public.status_contrato AS ENUM ('vigente', 'encerrado', 'suspenso', 'aguardando_cobertura', 'cancelado');
CREATE TYPE public.status_produto AS ENUM ('submetido', 'em_revisao', 'aprovado_tecnico', 'aprovado_coordenacao', 'aprovado_diretoria', 'recusado');
CREATE TYPE public.status_tarefa AS ENUM ('a_fazer', 'em_andamento', 'em_revisao', 'bloqueada', 'concluida', 'cancelada');
CREATE TYPE public.status_tdr AS ENUM ('rascunho', 'revisao_interna', 'ajustes', 'enviado_unesco', 'retorno_unesco', 'aprovado', 'cancelado', 'submetido', 'pendente_correcao', 'em_avaliacao', 'em_revisao_unesco', 'em_licitacao', 'contratado');
CREATE TYPE public.tipo_produto AS ENUM ('relatorio_tecnico', 'produto_fisico', 'evento_capacitacao', 'servico_executado');
CREATE TYPE public.tipo_risco AS ENUM ('contextual', 'programa', 'governanca', 'legal', 'fiduciario', 'reputacional');
CREATE TYPE public.tipo_tdr AS ENUM ('PF', 'PJ');

-- ===== SEQUENCES =====
CREATE SEQUENCE IF NOT EXISTS public.api_acessos_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1;
CREATE SEQUENCE IF NOT EXISTS public.audit_log_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1;
CREATE SEQUENCE IF NOT EXISTS public.auditoria_registros_numero_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1;
CREATE SEQUENCE IF NOT EXISTS public.contrato_coberturas_seq_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1;
CREATE SEQUENCE IF NOT EXISTS public.diag_exportacoes_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1;
CREATE SEQUENCE IF NOT EXISTS public.diag_expurgo_arquivos_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1;
CREATE SEQUENCE IF NOT EXISTS public.diag_fichas_historico_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1;
CREATE SEQUENCE IF NOT EXISTS public.fornecedores_codigo_interno_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1;
CREATE SEQUENCE IF NOT EXISTS public.rem_tentativas_senha_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_tarefa_codigo AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1;
CREATE SEQUENCE IF NOT EXISTS public.viagem_protocolo_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1;

-- ===== FUNÇÕES (1/2 — antes das tabelas) =====
-- check_function_bodies = off permite criá-las antes das tabelas que
-- consultam. Vêm primeiro porque duas tabelas (diag_questionarios,
-- pulso_ciclos) têm DEFAULT de coluna que chama função.
CREATE OR REPLACE FUNCTION public.apagar_tdr(p_tdr_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tem_contrato boolean;
  v_tem_financeiro boolean;
begin
  if not exists (select 1 from usuarios where id = auth.uid() and perfil = 'super_admin' and ativo) then
    raise exception 'Apenas super_admin pode apagar um TDR.' using errcode = '42501';
  end if;

  select exists(select 1 from contratos where tdr_id = p_tdr_id) into v_tem_contrato;
  select exists(select 1 from execucao_financeira where tdr_id = p_tdr_id) into v_tem_financeiro;

  if v_tem_contrato then
    raise exception 'TDR possui contrato vinculado — desvincule ou apague o contrato antes.';
  end if;
  if v_tem_financeiro then
    raise exception 'TDR possui execução financeira vinculada — não pode ser apagado.';
  end if;

  delete from tdr_versoes where tdr_id = p_tdr_id;
  delete from tdr_comentarios where tdr_id = p_tdr_id;
  delete from tdr_produtos_previstos where tdr_id = p_tdr_id;
  delete from tdr_responsaveis where tdr_id = p_tdr_id;
  delete from tdr_confirmacoes where tdr_id = p_tdr_id;
  delete from tdr_versoes_editor where tdr_id = p_tdr_id;
  delete from tdr_anexos where tdr_id = p_tdr_id;
  update produtos_entregues set tdr_id = null where tdr_id = p_tdr_id;

  alter table tdr_acoes disable rule tdr_acoes_no_delete;
  delete from tdr_acoes where tdr_id = p_tdr_id;
  alter table tdr_acoes enable rule tdr_acoes_no_delete;

  delete from tdrs where id = p_tdr_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.diag_apagar_treino()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer;
begin
  if not fn_diag_pode_gerir() then
    raise exception 'diag:nao_autorizado: só coordenação e super_admin apagam o treino';
  end if;
  perform set_config('diag.motivo', 'treino_apagado', true);
  delete from diag_fichas where treino;
  get diagnostics v_n = row_count;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.diag_enviar_ficha(p_ficha jsonb, p_moradores jsonb DEFAULT '[]'::jsonb, p_fotos jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.diag_exportar(p_identificada boolean DEFAULT false, p_status text[] DEFAULT ARRAY['validada'::text], p_municipio_ibge integer DEFAULT NULL::integer, p_comunidade_id uuid DEFAULT NULL::uuid, p_questionario_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_gerir  boolean := fn_diag_pode_gerir();
  v_cons   boolean := fn_diag_pode_consultar();
  v_ident  boolean := coalesce(p_identificada, false);
  v_status text[]  := coalesce(p_status, array['validada']);
  v_ids    uuid[];
  v_fichas jsonb;
  v_mor    jsonb;
  v_quest  jsonb;
  v_id     bigint;
  v_nmor   int;
begin
  if not (v_gerir or v_cons) then
    raise exception 'diag:nao_autorizado';
  end if;
  if v_ident and not v_gerir then
    raise exception 'diag:nao_autorizado: exportação identificada só para a coordenação';
  end if;
  if cardinality(v_status) = 0
     or not v_status <@ array['enviada','devolvida','validada','descartada'] then
    raise exception 'diag:parametro_invalido: status %', v_status;
  end if;

  select coalesce(array_agg(f.id order by f.codigo), '{}') into v_ids
  from diag_fichas f
  where not f.treino
    and f.status = any(v_status)
    and (p_municipio_ibge is null or f.municipio_ibge = p_municipio_ibge)
    and (p_comunidade_id is null or f.comunidade_id = p_comunidade_id)
    and (p_questionario_id is null or f.questionario_id = p_questionario_id);

  -- respostas: consultor sem texto aberto (texto/texto_longo e *_outro)
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'codigo', f.codigo,
           'questionario_id', f.questionario_id,
           'status', f.status,
           'municipio', m.nome,
           'comunidade', coalesce(c.nome, f.comunidade_nova),
           'comunidade_nova', f.comunidade_id is null,
           'localidade', coalesce(l.nome, f.localidade_nova),
           'dt_entrevista', f.dt_entrevista,
           'aceitou_participar', f.aceitou_participar,
           'fotos_autorizadas', f.fotos_autorizadas,
           'enviado_em', f.enviado_em,
           'validado_em', f.validado_em,
           'usou_carencia', f.usou_carencia,
           'identificacao_apagada', f.identificacao_apagada_em is not null,
           'alertas', f.alertas,
           'entrevistador', case when v_gerir then u.nome_completo end,
           'motivo_devolucao', case when v_gerir then f.motivo_devolucao end,
           'entrevistado_nome', case when v_ident then i.entrevistado_nome end,
           'lat', case when v_ident then i.lat end,
           'lon', case when v_ident then i.lon end,
           'gps_precisao_m', case when v_ident then i.gps_precisao_m end,
           'obs_localizacao', case when v_ident then i.obs_localizacao end,
           'respostas', case when v_gerir then f.respostas else (
              select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
              from jsonb_each(f.respostas) e
              where e.key not like '%\_outro'
                and e.key not in (select p.pergunta->>'chave' from fn_diag_perguntas(q.estrutura) p
                                  where p.pergunta->>'tipo' in ('texto','texto_longo'))) end
         )) order by f.codigo), '[]'::jsonb)
    into v_fichas
  from diag_fichas f
  join diag_questionarios q on q.id = f.questionario_id
  join diag_municipios m on m.ibge = f.municipio_ibge
  left join diag_comunidades c on c.id = f.comunidade_id
  left join diag_localidades l on l.id = f.localidade_id
  left join usuarios u on u.id = f.entrevistador_id
  left join diag_fichas_identificacao i on i.ficha_id = f.id
  where f.id = any(v_ids);

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'codigo', f.codigo,
           'ordem', mo.ordem,
           'e_entrevistado', mo.e_entrevistado,
           'idade', mo.idade,
           'sexo_genero', mo.sexo_genero,
           'sexo_genero_outro', case when v_gerir then mo.sexo_genero_outro end,
           'parentesco', mo.parentesco,
           'escolaridade', mo.escolaridade,
           'atividade_principal', mo.atividade_principal,
           'nome', case when v_ident then mi.nome end
         )) order by f.codigo, mo.ordem), '[]'::jsonb), count(*)
    into v_mor, v_nmor
  from diag_moradores mo
  join diag_fichas f on f.id = mo.ficha_id
  left join diag_moradores_identificacao mi on mi.morador_id = mo.id
  where mo.ficha_id = any(v_ids);

  -- estrutura das versões presentes: rótulos saem dela, nunca do código
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'codigo', q.codigo, 'versao', q.versao,
           'hash_sha256', q.hash_sha256, 'estrutura', q.estrutura) order by q.versao), '[]'::jsonb)
    into v_quest
  from diag_questionarios q
  where q.id in (select f.questionario_id from diag_fichas f where f.id = any(v_ids));

  insert into diag_exportacoes (usuario_id, perfil, identificada, com_texto, filtros, n_fichas, n_moradores)
  values (auth.uid(), fn_diag_perfil_ativo(), v_ident, v_gerir,
          jsonb_strip_nulls(jsonb_build_object('status', v_status, 'municipio_ibge', p_municipio_ibge,
            'comunidade_id', p_comunidade_id, 'questionario_id', p_questionario_id)),
          cardinality(v_ids), v_nmor)
  returning id into v_id;

  return jsonb_build_object(
    'exportacao_id', v_id,
    'gerado_em', now(),
    'identificada', v_ident,
    'com_texto', v_gerir,
    'questionarios', v_quest,
    'fichas', v_fichas,
    'moradores', v_mor);
end $function$
;

CREATE OR REPLACE FUNCTION public.diag_meu_painel()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.diag_transcrever_audio(p_audio_id uuid, p_texto text, p_origem text DEFAULT 'manual'::text, p_modelo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if coalesce(p_origem, 'manual') not in ('manual', 'ia_local') then
    raise exception 'diag:parametro_invalido: origem da transcrição %', p_origem;
  end if;
  if length(v_txt) > v_max then raise exception 'diag:parametro_invalido: transcrição acima de % caracteres', v_max; end if;

  update diag_fichas
     set respostas = jsonb_set(respostas, array[a.pergunta_chave], to_jsonb(v_txt), true)
   where id = f.id;
  update diag_fichas
     set alertas = fn_diag_alertas_audio(alertas, f.id, q.estrutura)
   where id = f.id;
  update diag_audios set transcrito_por = auth.uid(), transcrito_em = now(),
         transcricao_origem = coalesce(p_origem, 'manual'),
         transcricao_modelo = case when p_origem = 'ia_local' then left(nullif(btrim(p_modelo), ''), 120) end
   where id = a.id;
  return jsonb_build_object('chave', a.pergunta_chave, 'texto', v_txt,
                            'pendentes', to_jsonb(fn_diag_audios_pendentes(f.id)));
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_acervo_definir_publico(p_midia_id text, p_publico boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_m    record;
  v_ref  text;
  v_obra uuid;
begin
  if v_uid is null or not exists (
       select 1 from public.usuarios u
        where u.id = v_uid and u.ativo and u.perfil = 'super_admin') then
    raise exception 'acervo:sem_permissao' using
      detail = 'Só super_admin marca arquivos para o portal público.';
  end if;

  if p_midia_id is null or p_publico is null then
    raise exception 'acervo:parametro_invalido';
  end if;

  select vm.midia_id, vm.obra_id, vm.versao_status, vm.classe, vm.origem
    into v_m
    from public.vw_acervo_midias vm
   where vm.midia_id = p_midia_id;

  if p_publico then
    if v_m.midia_id is null then
      raise exception 'acervo:arquivo_inexistente';
    end if;
    if v_m.origem = 'nota_tecnica' or v_m.classe <> 'produto' then
      raise exception 'acervo:arquivo_administrativo' using
        detail = 'Nota Técnica, comprovante e contrato não vão ao portal público.';
    end if;
    if v_m.versao_status <> 'vigente' then
      raise exception 'acervo:arquivo_nao_vigente' using
        detail = 'Só a versão vigente do produto pode ser marcada.';
    end if;
    select ref.situacao into v_ref
      from public.vw_acervo_entrega_ref ref where ref.produto_id = v_m.obra_id;
    if v_ref is distinct from 'aprovada' then
      raise exception 'acervo:produto_nao_aprovado';
    end if;

    insert into public.acervo_publicacoes as p (midia_id, obra_id, publico, marcado_por, marcado_em)
    values (p_midia_id, v_m.obra_id, true, v_uid, now())
    on conflict (midia_id) do update
      set publico = true, marcado_por = v_uid, marcado_em = now(),
          desmarcado_por = null, desmarcado_em = null, atualizado_em = now()
      where p.publico is distinct from true;
  else
    update public.acervo_publicacoes
       set publico = false, desmarcado_por = v_uid, desmarcado_em = now(), atualizado_em = now()
     where midia_id = p_midia_id and publico;
  end if;

  select obra_id into v_obra from public.acervo_publicacoes where midia_id = p_midia_id;
  return jsonb_build_object('midia_id', p_midia_id, 'obra_id', v_obra, 'publico', p_publico);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_acervo_extensao(p_nome text, p_url text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select lower(
    coalesce(
      substring(coalesce(p_nome, '') from '\.([A-Za-z0-9]{1,5})\s*$'),
      substring(split_part(coalesce(p_url, ''), '?', 1) from '\.([A-Za-z0-9]{1,5})$'),
      ''
    )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.fn_acervo_tipo_midia(p_nome text, p_url text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select case public.fn_acervo_extensao(p_nome, p_url)
    when 'pdf'  then 'documento'
    when 'doc'  then 'documento'
    when 'docx' then 'documento'
    when 'odt'  then 'documento'
    when 'rtf'  then 'documento'
    when 'txt'  then 'documento'
    when 'xls'  then 'planilha'
    when 'xlsx' then 'planilha'
    when 'ods'  then 'planilha'
    when 'csv'  then 'planilha'
    when 'ppt'  then 'apresentacao'
    when 'pptx' then 'apresentacao'
    when 'odp'  then 'apresentacao'
    when 'jpg'  then 'imagem'
    when 'jpeg' then 'imagem'
    when 'png'  then 'imagem'
    when 'gif'  then 'imagem'
    when 'webp' then 'imagem'
    when 'heic' then 'imagem'
    when 'svg'  then 'imagem'
    when 'mp4'  then 'video'
    when 'mov'  then 'video'
    when 'avi'  then 'video'
    when 'mkv'  then 'video'
    when 'webm' then 'video'
    when 'm4v'  then 'video'
    when 'mp3'  then 'audio'
    when 'wav'  then 'audio'
    when 'ogg'  then 'audio'
    when 'm4a'  then 'audio'
    when 'zip'  then 'pacote'
    when 'rar'  then 'pacote'
    when '7z'   then 'pacote'
    else 'outro'
  end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_alertar_sem_responsavel()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ativ RECORD;
  v_admin RECORD;
BEGIN
  -- Para cada atividade sem responsável ativo
  FOR v_ativ IN
    SELECT a.id, a.codigo, a.nome_pt
    FROM public.atividades a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.atividade_responsaveis ar
      WHERE ar.atividade_id = a.id AND ar.ativo = true
    )
  LOOP
    -- Notificar super admins
    FOR v_admin IN
      SELECT id FROM public.usuarios
      WHERE perfil = 'super_admin' AND ativo = true
    LOOP
      -- Só criar se não existe notificação não lida para esta atividade
      INSERT INTO public.notificacoes (
        usuario_id, tipo, titulo, mensagem,
        link, entidade_tipo, entidade_id
      )
      SELECT
        v_admin.id,
        'atividade_sem_responsavel',
        'Atividade ' || v_ativ.codigo || ' sem responsável',
        'A atividade não possui responsável cadastrado.',
        '/pages/atividades.html',
        'atividade',
        v_ativ.id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notificacoes n
        WHERE n.usuario_id = v_admin.id
          AND n.entidade_id = v_ativ.id
          AND n.tipo = 'atividade_sem_responsavel'
          AND n.lida = false
      );
    END LOOP;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_api_acessos(p_limite integer DEFAULT 200)
 RETURNS TABLE(criado_em timestamp with time zone, cliente text, rota text, formato text, status integer, linhas integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not fn_api_pode_administrar() then raise exception 'API_SO_SUPER_ADMIN'; end if;
  return query
  select a.criado_em, c.nome, a.rota, a.formato, a.status, a.linhas
    from api_acessos a join api_clientes c on c.id = a.cliente_id
   order by a.criado_em desc limit least(greatest(coalesce(p_limite, 200), 1), 1000);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_api_atividades()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with hoje as (select (now() at time zone 'America/Rio_Branco')::date as d),
atv as (
  select a.id, a.codigo, a.nome_pt, a.fase::text as fase, a.orcamento_original_usd, r.codigo as resultado
    from atividades a left join resultados r on r.id = a.resultado_id
   where coalesce(a.ativo, true)
),
ctr_tdr as (   -- contratos não cancelados por TDR
  select tdr_id, count(*) n, sum(valor_total_brl) valor
    from contratos where tdr_id is not null and status::text <> 'cancelado' group by tdr_id
),
tdr as (
  select t.atividade_id,
         count(*) filter (where t.status::text <> 'cancelado')                         as total,
         count(*) filter (where t.status::text = 'cancelado')                          as cancelados,
         coalesce(sum(t.valor_brl) filter (where t.status::text <> 'cancelado'), 0)    as valor_brl,
         coalesce(sum(t.valor_usd) filter (where t.status::text <> 'cancelado'), 0)    as valor_usd,
         count(*) filter (where t.status::text in ('aprovado','em_licitacao')
                            and not coalesce(t.execucao_direta, false) and c.tdr_id is null) as aprovados_sem_contrato,
         count(*) filter (where c.n > 0 and c.valor > t.valor_brl + 0.005)             as contrato_acima_do_tdr,
         coalesce(sum(c.valor) filter (where t.status::text <> 'cancelado'), 0)       as contratado_brl
    from tdrs t left join ctr_tdr c on c.tdr_id = t.id
   group by t.atividade_id
),
tdr_st as (
  select atividade_id, jsonb_object_agg(status, n) por_status
    from (select atividade_id, status::text status, count(*) n from tdrs group by 1, 2) x group by atividade_id
),
ef as (        -- lançamentos por contrato (ou sem contrato = execução direta)
  select atividade_id, contrato_id is not null as com_contrato,
         coalesce(sum(valor_brl) filter (where situacao::text = 'pago'), 0)    pago_brl,
         coalesce(sum(valor_brl) filter (where situacao::text = 'a_pagar'), 0) a_pagar_brl
    from execucao_financeira group by 1, 2
),
ctr as (
  select atividade_id,
         count(*) filter (where status::text <> 'cancelado')                       as total,
         count(*) filter (where status::text = 'aguardando_cobertura')             as aguardando_cobertura,
         coalesce(sum(valor_total_brl) filter (where status::text <> 'cancelado'), 0) as valor_total_brl
    from contratos group by atividade_id
),
ctr_st as (
  select atividade_id, jsonb_object_agg(status, n) por_status
    from (select atividade_id, status::text status, count(*) n from contratos group by 1, 2) x group by atividade_id
),
prod as (
  select c.atividade_id,
         count(*) filter (where p.situacao <> 'cancelado') as total,
         count(*) filter (where p.situacao = 'pago') as pagos,
         count(*) filter (where p.situacao in ('aprovado','entrega_parcial')) as a_pagar,
         count(*) filter (where p.situacao not in ('pago','aprovado','entrega_parcial','cancelado')) as em_aberto,
         count(*) filter (where p.situacao = 'em_analise') as em_analise,
         count(*) filter (where p.situacao = 'devolvido') as devolvidos,
         coalesce(sum(case when coalesce(p.valor_aprovado, 0) > 0 then p.valor_aprovado else p.valor_brl end)
                    filter (where p.situacao = 'pago'), 0) as valor_pago_brl,
         coalesce(sum(case when coalesce(p.valor_aprovado, 0) > 0 then p.valor_aprovado else p.valor_brl end)
                    filter (where p.situacao in ('aprovado','entrega_parcial')), 0) as valor_a_pagar_brl,
         coalesce(sum(p.valor_brl) filter (where p.situacao <> 'cancelado'), 0) as valor_total_brl
    from contratos_produtos p join contratos c on c.id = p.contrato_id
   where c.status::text <> 'cancelado'
   group by c.atividade_id
),
mz as (
  select am.atividade_id,
         count(*) as indicadores,
         count(*) filter (where coalesce(v.meta_numerica, 0) = 0) as qualitativos,
         count(*) filter (where v.meta_numerica > 0 and v.realizado_confirmado >= v.meta_numerica) as atingidos,
         count(*) filter (where v.meta_numerica > 0 and v.realizado_confirmado < v.meta_numerica
                            and (v.realizado_confirmado > 0 or v.realizado_pendente > 0)) as em_andamento,
         count(*) filter (where v.meta_numerica > 0 and coalesce(v.realizado_confirmado, 0) = 0
                            and coalesce(v.realizado_pendente, 0) = 0) as sem_registro,
         round(avg(least(100, v.realizado_confirmado / v.meta_numerica * 100)) filter (where v.meta_numerica > 0), 1) as progresso_medio_pct
    from atividade_matriz am
    join matriz_itens i on i.id = am.matriz_item_id and i.ativo
    join vw_matriz_progresso v on v.id = i.id
   group by am.atividade_id
),
tk as (        -- tarefas: sem as restritas (nem a contagem delas sai)
  select t.atividade_id,
         count(*) filter (where t.status::text in ('a_fazer','em_andamento','em_revisao','bloqueada')) as abertas,
         count(*) filter (where t.status::text in ('a_fazer','em_andamento','em_revisao','bloqueada')
                            and t.dt_prazo < (select d from hoje)) as atrasadas,
         count(*) filter (where t.status::text = 'bloqueada') as bloqueadas,
         count(*) filter (where t.status::text = 'concluida') as concluidas
    from tarefas t
   where t.ativo and not coalesce(t.restrita, false) and t.atividade_id is not null
   group by t.atividade_id
),
resp as (
  select atividade_id,
         count(*) filter (where papel = 'responsavel') as responsaveis,
         count(*) filter (where papel <> 'responsavel') as substitutos
    from atividade_responsaveis where ativo group by atividade_id
)
select coalesce(jsonb_agg(jsonb_build_object(
  'id', a.id, 'codigo', a.codigo, 'nome', a.nome_pt, 'resultado', a.resultado, 'fase', a.fase,
  'tem_responsavel', coalesce(rp.responsaveis, 0) > 0,
  'orcamento', jsonb_build_object(
     'original_usd', a.orcamento_original_usd, 'vigente_usd', s.orcamento_usd,
     'comprometido_usd', s.comprometido_usd, 'excedente_contrato_usd', s.excedente_contrato_usd,
     'pago_usd', s.pago_usd, 'a_pagar_usd', s.a_pagar_usd, 'liberado_usd', s.liberado_usd,
     'saldo_livre_usd', s.saldo_livre_usd, 'pct_comprometido', s.pct_comprometido, 'pct_pago', s.pct_pago,
     'situacao_saldo', s.status_saldo),
  'tdrs', jsonb_build_object(
     'total', coalesce(t.total, 0), 'cancelados', coalesce(t.cancelados, 0),
     'valor_brl', coalesce(t.valor_brl, 0), 'valor_usd', coalesce(t.valor_usd, 0),
     'contratado_brl', coalesce(t.contratado_brl, 0),
     'aprovados_sem_contrato', coalesce(t.aprovados_sem_contrato, 0),
     'contrato_acima_do_tdr', coalesce(t.contrato_acima_do_tdr, 0),
     'por_status', coalesce(ts.por_status, '{}'::jsonb)),
  'contratos', jsonb_build_object(
     'total', coalesce(c.total, 0), 'valor_total_brl', coalesce(c.valor_total_brl, 0),
     'pago_brl', coalesce(ec.pago_brl, 0), 'a_pagar_brl', coalesce(ec.a_pagar_brl, 0),
     'saldo_brl', coalesce(c.valor_total_brl, 0) - coalesce(ec.pago_brl, 0),
     'aguardando_cobertura', coalesce(c.aguardando_cobertura, 0),
     'por_status', coalesce(cs.por_status, '{}'::jsonb)),
  'execucao_direta', jsonb_build_object(
     'pago_brl', coalesce(ed.pago_brl, 0), 'a_pagar_brl', coalesce(ed.a_pagar_brl, 0)),
  'produtos', jsonb_build_object(
     'total', coalesce(p.total, 0), 'pagos', coalesce(p.pagos, 0), 'a_pagar', coalesce(p.a_pagar, 0),
     'em_aberto', coalesce(p.em_aberto, 0), 'em_analise', coalesce(p.em_analise, 0),
     'devolvidos', coalesce(p.devolvidos, 0), 'valor_total_brl', coalesce(p.valor_total_brl, 0),
     'valor_pago_brl', coalesce(p.valor_pago_brl, 0), 'valor_a_pagar_brl', coalesce(p.valor_a_pagar_brl, 0)),
  'matriz', jsonb_build_object(
     'indicadores', coalesce(m.indicadores, 0), 'atingidos', coalesce(m.atingidos, 0),
     'em_andamento', coalesce(m.em_andamento, 0), 'sem_registro', coalesce(m.sem_registro, 0),
     'qualitativos', coalesce(m.qualitativos, 0), 'progresso_medio_pct', m.progresso_medio_pct),
  'tarefas', jsonb_build_object(
     'abertas', coalesce(k.abertas, 0), 'atrasadas', coalesce(k.atrasadas, 0),
     'bloqueadas', coalesce(k.bloqueadas, 0), 'concluidas', coalesce(k.concluidas, 0))
  ) order by a.codigo), '[]'::jsonb)
from atv a
left join vw_saldo_atividade s on s.id = a.id
left join tdr t   on t.atividade_id = a.id
left join tdr_st ts on ts.atividade_id = a.id
left join ctr c   on c.atividade_id = a.id
left join ctr_st cs on cs.atividade_id = a.id
left join ef ec   on ec.atividade_id = a.id and ec.com_contrato
left join ef ed   on ed.atividade_id = a.id and not ed.com_contrato
left join prod p  on p.atividade_id = a.id
left join mz m    on m.atividade_id = a.id
left join tk k    on k.atividade_id = a.id
left join resp rp on rp.atividade_id = a.id;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_api_cliente(p_chave text)
 RETURNS TABLE(id uuid, nome text, escopos text[], origens text[], limite_minuto integer, chamadas_minuto bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id, c.nome, c.escopos, c.origens, c.limite_minuto,
         (select count(*) from api_acessos a where a.cliente_id = c.id and a.criado_em > now() - interval '1 minute')
    from api_clientes c
   where c.chave_hash is not null
     and c.chave_hash = encode(sha256(convert_to(coalesce(p_chave, ''), 'UTF8')), 'hex')
     and c.ativo
     and (c.expira_em is null or c.expira_em > now());
$function$
;

CREATE OR REPLACE FUNCTION public.fn_api_clientes()
 RETURNS TABLE(id uuid, nome text, descricao text, chave_prefixo text, escopos text[], origens text[], limite_minuto integer, ativo boolean, expira_em timestamp with time zone, criado_em timestamp with time zone, revogado_em timestamp with time zone, ultimo_acesso timestamp with time zone, acessos_30d bigint, contato_email text, retirada_em timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not fn_api_pode_administrar() then
    raise exception 'API_SO_SUPER_ADMIN';
  end if;
  return query
  select c.id, c.nome, c.descricao, c.chave_prefixo, c.escopos, c.origens, c.limite_minuto, c.ativo,
         c.expira_em, c.criado_em, c.revogado_em,
         (select max(a.criado_em) from api_acessos a where a.cliente_id = c.id),
         (select count(*) from api_acessos a where a.cliente_id = c.id and a.criado_em > now() - interval '30 days'),
         c.contato_email, c.retirada_em
    from api_clientes c order by c.criado_em desc;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_api_criar_cliente(p_nome text, p_descricao text DEFAULT NULL::text, p_escopos text[] DEFAULT NULL::text[], p_origens text[] DEFAULT NULL::text[], p_expira_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_chave text; v_id uuid; v_ori text[]; o text; v_exp timestamptz := coalesce(p_expira_em, now() + interval '1 year');
begin
  if not fn_api_pode_administrar() then
    raise exception 'API_SO_SUPER_ADMIN';
  end if;
  if coalesce(length(trim(p_nome)), 0) < 3 then raise exception 'API_NOME_OBRIGATORIO'; end if;
  if p_escopos is not null and (cardinality(p_escopos) = 0 or not p_escopos <@ array['resumo','atividades','matriz']) then
    raise exception 'API_ESCOPO_INVALIDO';
  end if;
  v_ori := array(select rtrim(lower(trim(x)), '/') from unnest(coalesce(p_origens, '{}')) x where trim(x) <> '');
  foreach o in array v_ori loop
    if o !~ '^https?://[a-z0-9.-]+(:[0-9]{1,5})?$' then raise exception 'API_ORIGEM_INVALIDA: %', o; end if;
  end loop;
  if v_exp <= now() + interval '1 day' or v_exp > now() + interval '2 years' then raise exception 'API_VALIDADE_INVALIDA'; end if;
  v_chave := 'dima_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into api_clientes (nome, descricao, chave_prefixo, chave_hash, escopos, origens, expira_em, criado_por, retirada_em)
  values (trim(p_nome), p_descricao, left(v_chave, 12),
          encode(sha256(convert_to(v_chave, 'UTF8')), 'hex'),
          coalesce(p_escopos, array['resumo','atividades','matriz']),
          v_ori, v_exp, auth.uid(), now())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'chave', v_chave,
    'aviso', 'Guarde a chave agora: ela não será exibida de novo.');
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_api_emitir_retirada(p_pedido uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tok text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  update api_pedidos
     set retirada_hash = encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'),
         retirada_expira_em = now() + interval '72 hours', retirada_enviada_em = now()
   where id = p_pedido and status = 'aprovado'
     and exists (select 1 from api_clientes c where c.id = cliente_id and c.ativo and c.chave_hash is null);
  if not found then return null; end if;
  return v_tok;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_api_matriz()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with base as (
  select i.*, v.realizado_confirmado, v.realizado_pendente,
         row_number() over (partition by i.produto_codigo order by i.ordem, i.id) as pos
    from matriz_itens i join vw_matriz_progresso v on v.id = i.id
   where i.ativo
)
select coalesce(jsonb_agg(jsonb_build_object(
  'id', b.id, 'codigo', coalesce(b.produto_codigo, '?') || '·' || b.pos,
  'resultado', 'R' || b.resultado, 'produto', b.produto_titulo, 'indicador', b.indicador,
  'unidade', b.unidade, 'meta', b.meta_numerica,
  'confirmado', coalesce(b.realizado_confirmado, 0), 'pendente', coalesce(b.realizado_pendente, 0),
  'pct_confirmado', case when b.meta_numerica > 0 then round(b.realizado_confirmado / b.meta_numerica * 100, 1) end,
  'situacao', case when coalesce(b.meta_numerica, 0) = 0 then 'qualitativa'
                   when b.realizado_confirmado >= b.meta_numerica then 'atingida'
                   when b.realizado_confirmado > 0 or b.realizado_pendente > 0 then 'em_andamento'
                   else 'sem_registro' end,
  'ods', to_jsonb(coalesce(b.ods, '{}')), 'metas_km', to_jsonb(coalesce(b.metas_km, '{}')),
  'atividades', (select coalesce(jsonb_agg(a.codigo order by a.codigo), '[]'::jsonb)
                   from atividade_matriz am join atividades a on a.id = am.atividade_id
                  where am.matriz_item_id = b.id)
  ) order by b.resultado, b.produto_codigo, b.pos), '[]'::jsonb)
from base b;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_api_pedido_decidir(p_usuario_id uuid, p_pedido uuid, p_decisao text, p_parecer text, p_config jsonb, p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_p api_pedidos; v_cfg jsonb := coalesce(p_config, '{}'::jsonb);
  v_nome text; v_esc text[]; v_ori text[]; v_lim integer; v_exp timestamptz; v_cli uuid; o text;
begin
  if not exists (select 1 from usuarios where id = p_usuario_id and perfil = 'super_admin' and ativo) then
    raise exception 'API_SO_SUPER_ADMIN';
  end if;
  select * into v_p from api_pedidos where id = p_pedido for update;
  if not found then raise exception 'PEDIDO_NAO_ENCONTRADO'; end if;
  if fn_api_pedido_hash(p_pedido) is distinct from p_hash then raise exception 'DOCUMENTO_ALTERADO'; end if;

  if p_decisao = 'reenviar' then
    -- novo link de retirada (o anterior perde efeito quando o novo é emitido)
    if v_p.status not in ('aprovado','expirado') then raise exception 'PEDIDO_SEM_LINK'; end if;
    if not exists (select 1 from api_clientes where id = v_p.cliente_id and ativo and chave_hash is null) then
      raise exception 'ACESSO_REVOGADO';
    end if;
    update api_pedidos set status = 'aprovado', retirada_hash = null, retirada_expira_em = null where id = p_pedido;
    insert into api_pedido_notificacoes (pedido_id, cliente_id, evento, para_email)
    values (p_pedido, v_p.cliente_id, 'aprovado', v_p.remetente_email);
    return jsonb_build_object('status', 'aprovado', 'reenviado', true);
  end if;

  if v_p.status <> 'recebido' then raise exception 'PEDIDO_JA_DECIDIDO'; end if;

  if p_decisao = 'recusar' then
    if coalesce(length(trim(p_parecer)), 0) < 10 then raise exception 'PARECER_OBRIGATORIO'; end if;
    update api_pedidos set status = 'recusado', decidido_por = p_usuario_id, decidido_em = now(), parecer = trim(p_parecer)
     where id = p_pedido;
    insert into api_pedido_notificacoes (pedido_id, evento, para_email) values (p_pedido, 'recusado', v_p.remetente_email);
    return jsonb_build_object('status', 'recusado');
  end if;

  if p_decisao <> 'aprovar' then raise exception 'DECISAO_INVALIDA'; end if;

  v_nome := coalesce(nullif(trim(v_cfg->>'nome'), ''), nullif(v_p.campos->>'orgao', ''), v_p.remetente_email);
  v_esc  := case when jsonb_typeof(v_cfg->'escopos') = 'array' then array(select jsonb_array_elements_text(v_cfg->'escopos'))
                 else array['resumo','atividades','matriz'] end;
  v_ori  := case when jsonb_typeof(v_cfg->'origens') = 'array'
                 then array(select rtrim(lower(trim(x)), '/') from jsonb_array_elements_text(v_cfg->'origens') x where trim(x) <> '')
                 else '{}' end;
  v_lim  := coalesce((v_cfg->>'limite_minuto')::integer, 60);
  v_exp  := coalesce((v_cfg->>'expira_em')::timestamptz, now() + interval '1 year');

  if length(v_nome) < 3 then raise exception 'API_NOME_OBRIGATORIO'; end if;
  if cardinality(v_esc) = 0 or not v_esc <@ array['resumo','atividades','matriz'] then raise exception 'API_ESCOPO_INVALIDO'; end if;
  foreach o in array v_ori loop
    if o !~ '^https?://[a-z0-9.-]+(:[0-9]{1,5})?$' then raise exception 'API_ORIGEM_INVALIDA: %', o; end if;
  end loop;
  if v_lim not between 1 and 1000 then raise exception 'API_LIMITE_INVALIDO'; end if;
  if v_exp <= now() + interval '1 day' or v_exp > now() + interval '2 years' then raise exception 'API_VALIDADE_INVALIDA'; end if;

  insert into api_clientes (nome, descricao, escopos, origens, limite_minuto, expira_em, criado_por, contato_email, pedido_id)
  values (v_nome, 'Pedido ' || v_p.numero || ' por e-mail', v_esc, v_ori, v_lim, v_exp, p_usuario_id, v_p.remetente_email, p_pedido)
  returning id into v_cli;

  update api_pedidos set status = 'aprovado', decidido_por = p_usuario_id, decidido_em = now(),
         parecer = nullif(trim(coalesce(p_parecer, '')), ''), cliente_id = v_cli
   where id = p_pedido;
  insert into api_pedido_notificacoes (pedido_id, cliente_id, evento, para_email)
  values (p_pedido, v_cli, 'aprovado', v_p.remetente_email);
  return jsonb_build_object('status', 'aprovado', 'cliente_id', v_cli);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_api_pedido_hash(p_pedido uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select encode(sha256(convert_to(concat_ws('|', id, numero, remetente_email, coalesce(assunto, ''),
                coalesce(corpo, ''), campos::text, status), 'UTF8')), 'hex')
    from api_pedidos where id = p_pedido;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_api_pedido_registrar(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := lower(trim(p->>'remetente_email'));
  v_ex record; v_id uuid; v_num text; v_ano text := to_char(now() at time zone 'America/Rio_Branco', 'YYYY');
  v_aut boolean := coalesce((p->>'autenticado')::boolean, false);
  v_campos jsonb := '{}'::jsonb; k text;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ignorado', 'remetente_invalido'); end if;

  select id, numero into v_ex from api_pedidos where gmail_message_id = p->>'gmail_message_id';
  if found then return jsonb_build_object('id', v_ex.id, 'numero', v_ex.numero, 'novo', false, 'responder', false); end if;

  -- limites: 3 por remetente em 24 h; 20 no total por hora (evita virar canhão de e-mail)
  if (select count(*) from api_pedidos where remetente_email = v_email and criado_em > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ignorado', 'limite_remetente');
  end if;
  if (select count(*) from api_pedidos where criado_em > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ignorado', 'limite_global');
  end if;

  -- só os campos conhecidos do modelo, curtos
  foreach k in array array['orgao','responsavel','finalidade','site','rotas','prazo'] loop
    if coalesce(trim(p->'campos'->>k), '') <> '' then
      v_campos := v_campos || jsonb_build_object(k, left(trim(p->'campos'->>k), 300));
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtext('api_pedidos_numero'));
  select 'API-' || v_ano || '-' || lpad((count(*) + 1)::text, 3, '0') into v_num
    from api_pedidos where numero like 'API-' || v_ano || '-%';

  insert into api_pedidos (numero, gmail_message_id, email_message_id, remetente_email, remetente_nome, assunto, corpo,
                           campos, autenticado, autenticacao)
  values (v_num, p->>'gmail_message_id', left(p->>'email_message_id', 300), v_email, left(trim(p->>'remetente_nome'), 200),
          left(p->>'assunto', 300), left(p->>'corpo', 6000), v_campos, v_aut, left(p->>'autenticacao', 300))
  returning id into v_id;

  -- resposta "recebido" só para remetente autenticado (não responde a endereço forjado)
  if v_aut then
    insert into api_pedido_notificacoes (pedido_id, evento, para_email) values (v_id, 'recebido', v_email);
  end if;

  -- sino dos super_admin (o tipo depende do _sql_editor; sem ele, segue sem sino)
  begin
    insert into notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
    select u.id, 'api_pedido', 'Pedido de acesso à API ' || v_num,
           v_email || case when v_aut then '' else ' (remetente não confirmado)' end || ' pediu uma chave da API.',
           'integracoes.html?pedido=' || v_id, 'api_pedido', v_id
      from usuarios u where u.perfil = 'super_admin' and u.ativo;
  exception when check_violation then null;
  end;

  return jsonb_build_object('id', v_id, 'numero', v_num, 'novo', true, 'responder', v_aut);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_api_pedidos()
 RETURNS TABLE(id uuid, numero text, remetente_email text, remetente_nome text, assunto text, corpo text, campos jsonb, autenticado boolean, autenticacao text, status text, decidido_por_nome text, decidido_em timestamp with time zone, parecer text, cliente_id uuid, cliente_nome text, retirada_expira_em timestamp with time zone, retirada_enviada_em timestamp with time zone, retirado_em timestamp with time zone, criado_em timestamp with time zone, hash text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not fn_api_pode_administrar() then raise exception 'API_SO_SUPER_ADMIN'; end if;
  return query
  select p.id, p.numero, p.remetente_email, p.remetente_nome, p.assunto, p.corpo, p.campos, p.autenticado, p.autenticacao,
         p.status, u.nome_completo, p.decidido_em, p.parecer, p.cliente_id, c.nome, p.retirada_expira_em,
         p.retirada_enviada_em, p.retirado_em, p.criado_em, fn_api_pedido_hash(p.id)
    from api_pedidos p
    left join usuarios u on u.id = p.decidido_por
    left join api_clientes c on c.id = p.cliente_id
   order by (p.status = 'recebido') desc, p.criado_em desc;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_api_pode_administrar()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from usuarios where id = auth.uid() and perfil = 'super_admin' and ativo)
      or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'));
$function$
;

CREATE OR REPLACE FUNCTION public.fn_api_registrar(p_cliente uuid, p_rota text, p_formato text, p_status integer, p_linhas integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into api_acessos (cliente_id, rota, formato, status, linhas)
  values (p_cliente, left(p_rota, 120), left(p_formato, 10), p_status, p_linhas);
$function$
;

CREATE OR REPLACE FUNCTION public.fn_api_resumo()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_atv jsonb := fn_api_atividades(); v_mz jsonb := fn_api_matriz(); v_cot record;
begin
  begin select * into v_cot from fn_cotacao_usd(current_date); exception when others then v_cot := null; end;
  return jsonb_build_object(
    'gerado_em', now(),
    'ptax', case when v_cot is null then null else to_jsonb(v_cot) end,
    'projeto', (select jsonb_build_object(
        'atividades', count(*),
        'orcamento_usd',        round(sum((x->'orcamento'->>'vigente_usd')::numeric), 2),
        'comprometido_usd',     round(sum((x->'orcamento'->>'comprometido_usd')::numeric), 2),
        'pago_usd',             round(sum((x->'orcamento'->>'pago_usd')::numeric), 2),
        'a_pagar_usd',          round(sum((x->'orcamento'->>'a_pagar_usd')::numeric), 2),
        'liberado_usd',         round(sum((x->'orcamento'->>'liberado_usd')::numeric), 2),
        'saldo_livre_usd',      round(sum((x->'orcamento'->>'saldo_livre_usd')::numeric), 2),
        'tdrs',                 sum((x->'tdrs'->>'total')::int),
        'contratos',            sum((x->'contratos'->>'total')::int),
        'contratos_valor_brl',  round(sum((x->'contratos'->>'valor_total_brl')::numeric), 2),
        'contratos_pago_brl',   round(sum((x->'contratos'->>'pago_brl')::numeric), 2),
        'produtos',             sum((x->'produtos'->>'total')::int),
        'produtos_pagos',       sum((x->'produtos'->>'pagos')::int),
        'tarefas_abertas',      sum((x->'tarefas'->>'abertas')::int),
        'tarefas_atrasadas',    sum((x->'tarefas'->>'atrasadas')::int))
      from jsonb_array_elements(v_atv) x),
    'matriz', (select jsonb_build_object(
        'indicadores', count(*),
        'atingidos',    count(*) filter (where y->>'situacao' = 'atingida'),
        'em_andamento', count(*) filter (where y->>'situacao' = 'em_andamento'),
        'sem_registro', count(*) filter (where y->>'situacao' = 'sem_registro'),
        'qualitativos', count(*) filter (where y->>'situacao' = 'qualitativa'),
        'progresso_medio_pct', round(avg(least(100, (y->>'pct_confirmado')::numeric)), 1))
      from jsonb_array_elements(v_mz) y),
    'por_resultado', (select coalesce(jsonb_agg(r order by r->>'resultado'), '[]'::jsonb) from (
        select jsonb_build_object('resultado', coalesce(x->>'resultado', 'sem resultado'), 'atividades', count(*),
          'orcamento_usd',    round(sum((x->'orcamento'->>'vigente_usd')::numeric), 2),
          'comprometido_usd', round(sum((x->'orcamento'->>'comprometido_usd')::numeric), 2),
          'pago_usd',         round(sum((x->'orcamento'->>'pago_usd')::numeric), 2),
          'saldo_livre_usd',  round(sum((x->'orcamento'->>'saldo_livre_usd')::numeric), 2)) r
        from jsonb_array_elements(v_atv) x group by x->>'resultado') z)
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_api_revogar_cliente(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not fn_api_pode_administrar() then
    raise exception 'API_SO_SUPER_ADMIN';
  end if;
  update api_clientes set ativo = false, revogado_por = auth.uid(), revogado_em = now()
   where id = p_id and ativo;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_api_rotina()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_exp integer; v_av integer;
begin
  update api_pedidos set status = 'expirado', retirada_hash = null
   where status = 'aprovado' and retirada_expira_em < now();
  get diagnostics v_exp = row_count;

  with alvo as (
    update api_clientes set aviso_vencimento_em = now()
     where ativo and chave_hash is not null and contato_email is not null and aviso_vencimento_em is null
       and expira_em between now() and now() + interval '15 days'
    returning id, contato_email
  )
  insert into api_pedido_notificacoes (cliente_id, evento, para_email)
  select id, 'vencendo', contato_email from alvo;
  get diagnostics v_av = row_count;

  return jsonb_build_object('links_expirados', v_exp, 'avisos_vencimento', v_av);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_atribuir_participante(p_tarefa_id uuid, p_usuario_id uuid, p_papel text DEFAULT 'responsavel'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cod text; v_tit text; v_nome text;
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão para atribuir nesta tarefa';
  end if;
  if p_papel not in ('responsavel','observador') then p_papel := 'responsavel'; end if;

  insert into tarefa_participantes (tarefa_id, usuario_id, papel)
  values (p_tarefa_id, p_usuario_id, p_papel)
  on conflict (tarefa_id, usuario_id) do update set papel = excluded.papel;

  select codigo, titulo into v_cod, v_tit from tarefas where id = p_tarefa_id;
  select nome_completo into v_nome from usuarios where id = p_usuario_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (p_tarefa_id, auth.uid(), 'responsavel',
          coalesce(v_nome, p_papel) || case when p_papel = 'observador' then ' (observador)' else '' end);

  if p_papel = 'responsavel' then
    perform fn_tarefa_notificar(array[p_usuario_id], 'tarefa_atribuida',
      'Você foi atribuído: ' || coalesce(v_cod,''), coalesce(v_tit,''), p_tarefa_id, auth.uid());
  else
    perform fn_tarefa_notificar(array[p_usuario_id], 'tarefa_observador',
      'Você acompanha: ' || coalesce(v_cod,''), coalesce(v_tit,''), p_tarefa_id, auth.uid());
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_atualizar_email_usuario(p_usuario_id uuid, p_novo_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
BEGIN
  -- Apenas super_admin e coordenacao podem alterar e-mails
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid()
      AND perfil IN ('super_admin','coordenacao')
      AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem alterar e-mails';
  END IF;

  -- Verificar se e-mail já existe em outro usuário
  IF EXISTS (
    SELECT 1 FROM auth.users WHERE email = p_novo_email AND id != p_usuario_id
  ) THEN
    RAISE EXCEPTION 'E-mail já em uso por outro usuário';
  END IF;

  -- Atualizar auth.users
  UPDATE auth.users
    SET email = p_novo_email, updated_at = NOW()
    WHERE id = p_usuario_id;

  -- Atualizar auth.identities (provedor email)
  UPDATE auth.identities
    SET provider_id = p_novo_email,
        identity_data = jsonb_set(identity_data, '{email}', to_jsonb(p_novo_email)),
        updated_at = NOW()
    WHERE user_id = p_usuario_id AND provider = 'email';

  -- Atualizar tabela pública
  UPDATE public.usuarios
    SET email = p_novo_email, atualizado_em = NOW()
    WHERE id = p_usuario_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_atualizar_indicador(p_produto_entregue_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_rec record;
begin
  for v_rec in
    select pei.indicador_id, pei.quantidade_contribuida
    from public.produto_entregue_indicador pei
    where pei.produto_entregue_id = p_produto_entregue_id
  loop
    update public.indicadores
    set valor_atingido = valor_atingido + v_rec.quantidade_contribuida,
        atualizado_em = now()
    where id = v_rec.indicador_id;

    -- Snapshot no histórico
    insert into public.indicador_historico (indicador_id, valor_atingido, periodo_ref, origem)
    select id, valor_atingido, date_trunc('month', now())::date, 'automatico'
    from public.indicadores where id = v_rec.indicador_id
    on conflict do nothing;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_atualizar_situacao_produto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_produto_id   uuid;
  v_pct_aprovado numeric(14,4);
  v_valor_brl    numeric(14,2);
  v_valor_aprov  numeric(14,2);
  v_nova_sit     text;
  v_tem_analise  boolean;
BEGIN
  v_produto_id := COALESCE(NEW.produto_id, OLD.produto_id);

  SELECT COALESCE(SUM(pct_entregue), 0) INTO v_pct_aprovado
  FROM public.contratos_produtos_entregas
  WHERE produto_id = v_produto_id AND situacao = 'aprovada';

  SELECT EXISTS(
    SELECT 1 FROM public.contratos_produtos_entregas
    WHERE produto_id = v_produto_id AND situacao = 'em_analise'
  ) INTO v_tem_analise;

  SELECT COALESCE(valor_brl, 0) INTO v_valor_brl
  FROM public.contratos_produtos
  WHERE id = v_produto_id;

  v_valor_aprov := ROUND(v_valor_brl * v_pct_aprovado / 100, 2);

  IF v_pct_aprovado >= 100 THEN
    v_nova_sit := 'aprovado';
  ELSIF v_pct_aprovado > 0 AND v_tem_analise THEN
    v_nova_sit := 'em_analise';
  ELSIF v_pct_aprovado > 0 THEN
    v_nova_sit := 'entrega_parcial';
  ELSIF v_tem_analise THEN
    v_nova_sit := 'em_analise';
  ELSE
    v_nova_sit := 'pendente';
  END IF;

  UPDATE public.contratos_produtos
  SET situacao       = v_nova_sit,
      pct_aprovado   = v_pct_aprovado,
      valor_aprovado = v_valor_aprov,
      atualizado_em  = now()
  WHERE id = v_produto_id
    AND situacao != 'pago';

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_audit_log(p_operacao operacao_audit, p_tabela text, p_registro_id text, p_dados_antes jsonb DEFAULT NULL::jsonb, p_dados_depois jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.audit_log (usuario_id, operacao, tabela, registro_id, dados_antes, dados_depois)
  values (auth.uid(), p_operacao, p_tabela, p_registro_id, p_dados_antes, p_dados_depois);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_auditoria_orcamento()
 RETURNS TABLE(severidade text, titulo text, descricao text, recomendacao text, referencia_tabela text, referencia_id uuid, referencia_label text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ptax date;
begin
  return query
  select 'critico'::text,
         ('Orçamento: conferência do razão falhou (' || c.verificacao || ')')::text,
         ('Verificação "' || c.verificacao || '"' || coalesce(' na atividade ' || c.atividade_codigo, '')
           || ': esperado ' || coalesce(c.esperado::text, '—') || ', encontrado ' || coalesce(c.encontrado::text, '—')
           || coalesce(' (' || c.observacao || ')', '') || '.')::text,
         'Invariante do razão orçamentário violada: investigar antes de qualquer novo remanejamento. Ver fn_conferir_orcamento().'::text,
         'atividades'::text, a.id, ('Atividade ' || coalesce(c.atividade_codigo, 'global'))::text
    from public.fn_conferir_orcamento() c
    left join public.atividades a on a.codigo = c.atividade_codigo
   where not c.ok and c.verificacao not like 'info_%'
   limit 20;

  return query
  select 'critico'::text, ('Orçamento: remanejamento ' || v.numero || ' não fecha no razão')::text,
         ('Destinos US$ ' || v.destinos_usd || ', lançado a crédito US$ ' || v.recebido_usd
           || ', a débito US$ ' || v.cedido_usd || '.')::text,
         'Os três valores devem ser iguais. Conferir lançamentos do pedido em orcamento_fontes.'::text,
         'remanejamentos'::text, v.id, ('Remanejamento ' || v.numero)::text
    from public.vw_rem_conferencia v
   where v.destinos_usd <> v.recebido_usd or v.recebido_usd <> v.cedido_usd;

  return query
  select (case when now() - min(cc.criado_em) > interval '15 days' then 'alto' else 'medio' end)::text,
         ('Orçamento: contrato ' || c.numero || ' travado aguardando cobertura há '
           || extract(day from now() - min(cc.criado_em))::int || ' dia(s)')::text,
         ('O valor acima do TDR não coube no saldo livre da atividade ' || a.codigo || '. Falta cobrir US$ '
           || sum(cc.deficit_usd) || '. Sem produtos nem pagamentos até a cobertura.')::text,
         'Pedir cobertura em Remanejamento › Saldos (botão "Pedir cobertura"), reduzir o valor do contrato ou cancelá-lo.'::text,
         'contratos'::text, c.id, ('Contrato ' || c.numero)::text
    from public.contratos c
    join public.contrato_coberturas cc on cc.contrato_id = c.id and cc.situacao = 'aguardando'
    join public.atividades a on a.id = cc.atividade_id
   where c.status = 'aguardando_cobertura'
   group by c.id, c.numero, a.codigo;

  return query
  select (case when now() - h.ultimo > interval '20 days' then 'alto' else 'medio' end)::text,
         ('Orçamento: remanejamento ' || r.numero || ' parado na etapa ' || r.etapa_atual || ' há '
           || extract(day from now() - h.ultimo)::int || ' dia(s)')::text,
         ('O pedido está em aprovação e ninguém assinou, devolveu ou recusou desde '
           || to_char(h.ultimo at time zone 'America/Rio_Branco', 'DD/MM/YYYY') || '. Enquanto tramita, reserva o saldo das fontes de origem.')::text,
         'Cobrar o signatário da etapa atual (fila "Aguardando minha análise") ou cancelar o pedido se não for mais necessário.'::text,
         'remanejamentos'::text, r.id, ('Remanejamento ' || r.numero)::text
    from public.remanejamentos r
    cross join lateral (select max(x.criado_em) as ultimo from public.remanejamento_historico x
                         where x.remanejamento_id = r.id) h
   where r.status = 'em_aprovacao' and now() - h.ultimo > interval '7 days';

  return query
  select (case when exists (select 1 from public.remanejamentos where status in ('rascunho','em_aprovacao'))
               then 'alto' else 'medio' end)::text,
         ('Orçamento: cargo "' || g.nome || '" sem titular designado')::text,
         ('A cadeia de remanejamento é nominal e sem substituto: sem titular do cargo "' || g.nome
           || '", nenhum pedido passa dessa etapa.')::text,
         'Super admin designa o titular em Remanejamento › Signatários, com o ato de designação.'::text,
         'rem_cargos'::text, null::uuid, g.nome::text
    from public.rem_cargos g
   where fn_rem_titular(g.codigo) is null;

  select max(data) into v_ptax from public.cotacoes_ptax;
  if v_ptax is null or fn_hoje_acre() - v_ptax > 5 then
    return query select 'alto'::text,
      'Orçamento: cotação PTAX desatualizada'::text,
      ('Última PTAX gravada: ' || coalesce(to_char(v_ptax, 'DD/MM/YYYY'), 'nenhuma')
        || '. Com mais de 7 dias, cadastro de contrato acima do TDR passa a ser recusado (COTACAO_DESATUALIZADA).')::text,
      'Verificar o cron cotacao-ptax-diaria e a Edge Function cotacao-ptax (logs).'::text,
      'cotacoes_ptax'::text, null::uuid, 'PTAX'::text;
  end if;

  return query
  select 'medio'::text,
         ('Orçamento: ' || count(*) || ' e-mail(s) de remanejamento sem envio após 3 tentativas')::text,
         ('Último erro: ' || coalesce(max(n.ultimo_erro), '—'))::text,
         'Conferir as credenciais Gmail da Edge Function assinar-remanejamento; o sino segue avisando.'::text,
         'remanejamento_notificacoes'::text, null::uuid, 'Fila de e-mails'::text
    from public.remanejamento_notificacoes n
   where n.enviado_em is null and n.tentativas >= 3
  having count(*) > 0;

  return query
  select 'info'::text,
         ('Orçamento: atividade ' || o.codigo || ' com saldo livre negativo')::text,
         ('Débitos superam créditos em US$ ' || (o.reservado_usd - o.saldo_usd) || ' (inclui reservas de remanejamento). '
           || 'Novos TDRs são recusados e contratos acima do TDR ficam travados até cobertura.')::text,
         'Avaliar remanejamento de outra atividade ou redução de TDR.'::text,
         'atividades'::text, o.atividade_id, ('Atividade ' || o.codigo)::text
    from public.vw_orcamento_atividade o
   where o.saldo_usd - o.reservado_usd < 0;

  return query
  select 'baixo'::text, ('Orçamento: TDR ' || t.numero || ' sem valor em US$')::text,
         ('O TDR conta como zero no débito da atividade ' || a.codigo || ' e impede remanejar a partir dela.')::text,
         'Informar o valor em US$ do TDR.'::text,
         'tdrs'::text, t.id, ('TDR ' || t.numero)::text
    from public.tdrs t join public.atividades a on a.id = t.atividade_id
   where t.status <> 'cancelado' and t.valor_usd is null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_auditoria_viagens()
 RETURNS TABLE(severidade text, titulo text, descricao text, recomendacao text, referencia_tabela text, referencia_id uuid, referencia_label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select p.id, p.numero, p.destino_principal, p.situacao, p.aprovado_em,
           u.nome_completo as aprovador,
           fn_viagem_participa(p.id, p.aprovado_por) as papel,
           p.aprovado_em < timestamptz '2026-10-16 18:55:57+00' as antes_da_trava,  -- hora em que a trava entrou (schema_migrations)
           exists (select 1 from viagem_decisoes d
                    where d.protocolo_id = p.id and d.decisao = 'aprovar'
                      and d.usuario_id = p.aprovado_por) as com_senha
      from viagem_protocolos p
      left join usuarios u on u.id = p.aprovado_por
     where p.aprovado_por is not null
  )
  select 'info',
         'Viagem: aprovação pelo próprio ' || case when papel = 'viajante' then 'viajante' else 'solicitante' end
           || ' — protocolo ' || coalesce(numero, '—') || ' (antes da trava)',
         'O protocolo ' || coalesce(numero, '—') || ' (' || coalesce(destino_principal, '—') || ', situação "' || situacao
           || '") foi aprovado em ' || to_char(aprovado_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY')
           || ' por ' || coalesce(aprovador, 'usuário não identificado') || ', que '
           || case when papel = 'viajante' then 'viaja no protocolo' else 'pediu a viagem' end
           || '. Foi antes da regra de 16/10/2026 (15h55) que impede quem está no protocolo de aprovar; desde então isso é barrado no banco.',
         'Registro histórico de segregação de funções. Se necessário para a prestação de contas, anexar ao processo SEI a ratificação da aprovação por outro super_admin.',
         'viagem_protocolos', id, 'Viagem ' || coalesce(numero, '—')
    from base
   where antes_da_trava and papel is not null
  union all
  select 'critico',
         'Viagem: aprovação fora do fluxo com senha — protocolo ' || coalesce(numero, '—'),
         'O protocolo ' || coalesce(numero, '—') || ' foi aprovado em '
           || to_char(aprovado_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI') || ' por '
           || coalesce(aprovador, 'usuário não identificado')
           || case when papel is not null then ', que está no protocolo,' else '' end
           || case when not com_senha then ' sem registro da aprovação com senha (viagem_decisoes).' else '.' end
           || ' Desde 16/10/2026 (15h55) só a aprovação com senha, por quem não está no protocolo, pode aprovar.',
         'Verificar no audit_log como a aprovação foi gravada (trava contornada), devolver o protocolo para correção e aprovar de novo pelo fluxo com senha.',
         'viagem_protocolos', id, 'Viagem ' || coalesce(numero, '—')
    from base
   where not antes_da_trava and (papel is not null or not com_senha)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cob_cancelar_pedidos(p_contrato uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_avisar uuid[];
begin
  for r in
    select * from public.remanejamentos x
     where x.contrato_id = p_contrato and x.tipo = 'cobertura_contrato'
       and x.status in ('rascunho','em_aprovacao')
       and not exists (select 1 from public.orcamento_fontes f where f.remanejamento_id = x.id)
     for update
  loop
    select array_agg(distinct u) into v_avisar from (
      select r.criado_por as u
      union select s.usuario_id from public.remanejamento_assinaturas s
             where s.remanejamento_id = r.id and s.versao = r.versao and s.invalidada_em is null) z;
    update public.remanejamento_assinaturas set invalidada_em = now(), invalidada_motivo = 'pedido cancelado: ' || p_motivo
     where remanejamento_id = r.id and versao = r.versao and invalidada_em is null;
    update public.remanejamentos set status = 'cancelado', etapa_atual = null, encerrado_em = now(),
           motivo_encerramento = p_motivo where id = r.id;
    perform fn_rem_log(r.id, 'cancelado', r.status, 'cancelado', r.etapa_atual, null, p_motivo);
    perform fn_rem_notificar(r.id, v_avisar, 'cancelado', p_motivo);
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_cob_excedente_brl(p_grupo uuid, p_tdr uuid, p_contrato uuid, p_valor numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select greatest(0,
           coalesce((select sum(c.valor_total_brl) from public.contratos c
                      where coalesce(c.tdr_id, c.id) = p_grupo
                        and c.id is distinct from p_contrato
                        and c.status <> 'cancelado'), 0)
         + coalesce(p_valor, 0)
         - coalesce((select t.valor_brl from public.tdrs t
                      where t.id = p_tdr and t.status <> 'cancelado'), 0))::numeric(14,2)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cob_livre(p_atividade uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select o.saldo_usd - o.reservado_usd from public.vw_orcamento_atividade o
                    where o.atividade_id = p_atividade), 0)::numeric(14,2)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cob_notificar(p_contrato uuid, p_evento text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c record; v_ativ uuid; v_cod text; v_deficit numeric; u uuid; v_titulo text; v_msg text;
begin
  select * into c from public.contratos where id = p_contrato;
  v_ativ := coalesce((select atividade_id from public.tdrs where id = c.tdr_id), c.atividade_id);
  select codigo into v_cod from public.atividades where id = v_ativ;
  select sum(deficit_usd) into v_deficit from public.contrato_coberturas
   where contrato_id = p_contrato and situacao = 'aguardando';

  v_titulo := case p_evento
    when 'travado'  then 'Contrato ' || c.numero || ' travado: aguarda cobertura de orçamento'
    else                 'Contrato ' || c.numero || ' liberado: o saldo da atividade cobriu o valor' end;
  v_msg := case p_evento
    when 'travado'  then 'O valor acima do TDR não coube no saldo livre da atividade ' || coalesce(v_cod, '')
                          || '. Falta cobrir US$ ' || coalesce(to_char(v_deficit, 'FM999G999G990D00'), '0,00')
                          || '. Sem produtos nem pagamentos até a cobertura.'
    else                 'O contrato voltou ao status ' || c.status::text || ' e pode receber produtos e pagamentos.' end;

  for u in
    select distinct x.id from (
      select us.id from public.usuarios us where us.ativo and us.perfil = 'coordenacao'
      union
      select r.usuario_id from public.atividade_responsaveis r
        join public.usuarios us on us.id = r.usuario_id and us.ativo
       where r.atividade_id = v_ativ and r.ativo and r.papel = 'responsavel'
      union
      select us.id from public.usuarios us where us.id = c.criado_por and us.ativo
    ) x
  loop
    insert into public.cobertura_notificacoes (contrato_id, atividade_id, usuario_id, evento, deficit_usd)
    values (p_contrato, v_ativ, u, p_evento, v_deficit);
    begin
      insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
      values (u, 'contrato_' || p_evento, v_titulo, v_msg,
              case p_evento when 'travado' then 'remanejamentos.html?cobertura=' || p_contrato else 'contratos.html' end,
              'contrato', p_contrato);
    exception when others then null;
    end;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_cob_reavaliar(p_atividade uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_livre numeric; v_piso numeric; v_cauda numeric; v_n integer := 0;
  r record;
begin
  if p_atividade is null then return 0; end if;
  if not exists (select 1 from public.contrato_coberturas
                  where atividade_id = p_atividade and situacao = 'aguardando') then
    return 0;
  end if;
  v_livre := fn_cob_livre(p_atividade);
  for r in
    select * from public.contrato_coberturas
     where atividade_id = p_atividade and situacao = 'aguardando' order by seq
  loop
    continue when not exists (select 1 from public.contrato_coberturas
                               where id = r.id and situacao = 'aguardando');
    if v_piso is null then v_piso := r.piso_usd; end if;
    select coalesce(sum(delta_usd), 0) into v_cauda from public.contrato_coberturas
     where atividade_id = p_atividade and situacao = 'aguardando' and seq > r.seq;
    exit when v_livre + v_cauda < v_piso;

    update public.contrato_coberturas
       set situacao = 'coberto', resolvido_em = now(), resolucao = 'saldo da atividade cobre o excedente'
     where id = r.id;
    v_n := v_n + 1;

    if not exists (select 1 from public.contrato_coberturas
                    where contrato_id = r.contrato_id and situacao = 'aguardando') then
      perform set_config('dima.cobertura', 'liberar', true);
      update public.contratos
         set status = coalesce(status_antes_cobertura, 'vigente'), status_antes_cobertura = null
       where id = r.contrato_id and status = 'aguardando_cobertura';
      perform set_config('dima.cobertura', '', true);
      perform fn_cob_cancelar_pedidos(r.contrato_id, 'contrato coberto pelo saldo da atividade — pedido dispensado');
    end if;
  end loop;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_comentar_tarefa(p_tarefa_id uuid, p_corpo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_cod text; v_caller uuid := auth.uid(); v_alvo uuid[];
begin
  if not fn_pode_ver_tarefa(p_tarefa_id) then
    raise exception 'sem acesso a esta tarefa';
  end if;
  if coalesce(btrim(p_corpo),'') = '' then raise exception 'comentário vazio'; end if;

  insert into tarefa_comentarios (tarefa_id, autor_id, corpo)
  values (p_tarefa_id, v_caller, btrim(p_corpo)) returning id into v_id;

  select codigo into v_cod from tarefas where id = p_tarefa_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (p_tarefa_id, v_caller, 'comentario', left(btrim(p_corpo), 80));

  select array_agg(distinct uid) into v_alvo from (
    select criado_por uid from tarefas where id = p_tarefa_id
    union
    select usuario_id from tarefa_participantes where tarefa_id = p_tarefa_id
  ) s;
  perform fn_tarefa_notificar(v_alvo, 'tarefa_comentario',
    'Novo comentário: ' || coalesce(v_cod,''), left(btrim(p_corpo), 120), p_tarefa_id, v_caller);

  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_comentar_tarefa_fornecedor(p_tarefa_id uuid, p_fornecedor_id uuid, p_corpo text, p_checklist_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_cod text; v_nome text; v_alvo uuid[];
begin
  if coalesce(btrim(p_corpo),'') = '' then raise exception 'comentário vazio'; end if;
  if p_fornecedor_id is null then raise exception 'fornecedor obrigatório'; end if;

  insert into tarefa_comentarios (tarefa_id, autor_id, autor_fornecedor_id, corpo, origem, checklist_id)
  values (p_tarefa_id, null, p_fornecedor_id, btrim(p_corpo), 'email', p_checklist_id)
  returning id into v_id;

  select codigo into v_cod from tarefas where id = p_tarefa_id;
  select nome into v_nome from fornecedores where id = p_fornecedor_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (p_tarefa_id, null, 'comentario_fornecedor',
          coalesce(v_nome,'Fornecedor') || ': ' || left(btrim(p_corpo), 60));

  select array_agg(distinct uid) into v_alvo from (
    select criado_por uid from tarefas where id = p_tarefa_id
    union
    select usuario_id from tarefa_participantes where tarefa_id = p_tarefa_id
  ) s;
  perform fn_tarefa_notificar(v_alvo, 'tarefa_comentario',
    'Resposta do fornecedor: ' || coalesce(v_cod,''),
    coalesce(v_nome,'') || ' — ' || left(btrim(p_corpo), 100), p_tarefa_id, null);

  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_comentar_tarefa_sistema(p_tarefa_id uuid, p_autor_id uuid, p_corpo text, p_origem text DEFAULT 'email'::text, p_checklist_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_cod text; v_alvo uuid[];
begin
  if coalesce(btrim(p_corpo),'') = '' then raise exception 'comentário vazio'; end if;
  if p_autor_id is null then raise exception 'autor obrigatório'; end if;

  insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem, checklist_id)
  values (p_tarefa_id, p_autor_id, btrim(p_corpo), coalesce(p_origem,'email'), p_checklist_id)
  returning id into v_id;

  select codigo into v_cod from tarefas where id = p_tarefa_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (p_tarefa_id, p_autor_id, 'comentario', left(btrim(p_corpo), 80));

  select array_agg(distinct uid) into v_alvo from (
    select criado_por uid from tarefas where id = p_tarefa_id
    union
    select usuario_id from tarefa_participantes where tarefa_id = p_tarefa_id
  ) s;
  perform fn_tarefa_notificar(v_alvo, 'tarefa_comentario',
    'Novo comentário: ' || coalesce(v_cod,''), left(btrim(p_corpo), 120), p_tarefa_id, p_autor_id);

  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_conferir_orcamento()
 RETURNS TABLE(verificacao text, atividade_codigo text, esperado numeric, encontrado numeric, ok boolean, observacao text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and coalesce(fn_perfil_atual()::text, '')
       not in ('super_admin','coordenacao','financeiro') then
    raise exception 'Sem permissão para conferir o razão orçamentário.';
  end if;

  return query
  select 'orcamento_vigente_igual_razao'::text, a.codigo::text, x.razao, a.orcamento_usd,
         a.orcamento_usd = x.razao, null::text
    from public.atividades a
    cross join lateral (select coalesce(sum(f.valor_usd), 0)::numeric(14,2) as razao
                          from public.orcamento_fontes f where f.atividade_id = a.id and f.orcamentaria) x;

  return query
  select 'dotacao_original_igual_razao'::text, a.codigo::text, x.dot, a.orcamento_original_usd,
         a.orcamento_original_usd is not distinct from x.dot, null::text
    from public.atividades a
    cross join lateral (select sum(f.valor_usd)::numeric(14,2) as dot
                          from public.orcamento_fontes f where f.atividade_id = a.id and f.tipo = 'dotacao_original') x;

  return query
  select 'liberacoes_iguais_encerramentos'::text, a.codigo::text, e.enc, r.raz, e.enc = r.raz, null::text
    from public.atividades a
    cross join lateral (select coalesce(sum(round(ce.valor_liberado_usd, 2)), 0)::numeric(14,2) as enc
                          from public.contrato_encerramentos ce
                         where ce.atividade_id = a.id and ce.status = 'ativo') e
    cross join lateral (select coalesce(sum(f.valor_usd), 0)::numeric(14,2) as raz
                          from public.orcamento_fontes f
                         where f.atividade_id = a.id and f.tipo in ('economia_contratacao','encerramento_contrato')) r;

  return query
  select 'fontes_disponiveis_fecham'::text, o.codigo::text, greatest(0, o.saldo_usd), o.disponivel_fontes_usd,
         o.disponivel_fontes_usd = greatest(0, o.saldo_usd), null::text
    from public.vw_orcamento_atividade o;

  return query
  select 'fonte_sem_liquido_negativo'::text, fs.atividade_codigo::text, 0::numeric, fs.liquido_usd,
         false, 'fonte ' || fs.fonte_id::text
    from public.vw_orcamento_fontes_saldo fs where fs.liquido_usd < 0;

  return query
  select 'global_vigente_igual_original_mais_revisoes'::text, null::text,
         (select coalesce(sum(f.valor_usd), 0) from public.orcamento_fontes f
           where f.tipo in ('dotacao_original','revisao_orcamentaria'))::numeric(14,2),
         (select coalesce(sum(a.orcamento_usd), 0) from public.atividades a)::numeric(14,2),
         (select coalesce(sum(f.valor_usd), 0) from public.orcamento_fontes f
           where f.tipo in ('dotacao_original','revisao_orcamentaria'))
         = (select coalesce(sum(a.orcamento_usd), 0) from public.atividades a),
         null::text;

  return query
  select 'diferenca_painel_explicada'::text, o.codigo::text,
         (greatest(0, o.execucao_direta_realizada_usd - o.reserva_execucao_direta_usd)
          + o.pagamentos_contrato_sem_tdr_usd)::numeric(14,2),
         (o.saldo_livre_painel_usd - o.saldo_usd)::numeric(14,2),
         (o.saldo_livre_painel_usd - o.saldo_usd)
           = greatest(0, o.execucao_direta_realizada_usd - o.reserva_execucao_direta_usd)
             + o.pagamentos_contrato_sem_tdr_usd,
         null::text
    from public.vw_orcamento_atividade o;

  return query
  select 'cobertura_excedente_atual'::text, a.codigo::text, x.atual, x.gravado, x.atual = x.gravado,
         'grupo ' || x.grupo::text
    from (select g.grupo, g.atividade_id,
                 public.fn_cob_excedente_brl(g.grupo, g.tdr_id, null, 0) as atual,
                 coalesce((select cc.excedente_depois_brl from public.contrato_coberturas cc
                            where cc.grupo = g.grupo order by cc.seq desc limit 1), 0)::numeric(14,2) as gravado
            from (select distinct coalesce(c.tdr_id, c.id) as grupo, c.tdr_id,
                         coalesce(t.atividade_id, c.atividade_id) as atividade_id
                    from public.contratos c left join public.tdrs t on t.id = c.tdr_id) g) x
    left join public.atividades a on a.id = x.atividade_id
   where x.atual <> x.gravado;

  return query
  select 'contrato_travado_tem_pendencia'::text, c.numero::text, 1::numeric, 0::numeric, false,
         'status ' || c.status::text
    from public.contratos c
   where (c.status = 'aguardando_cobertura')
      <> exists (select 1 from public.contrato_coberturas cc
                  where cc.contrato_id = c.id and cc.situacao = 'aguardando');

  return query
  select 'info_resultado_igual_atividades'::text, r.codigo::text, r.orcamento_usd,
         coalesce(s.soma, 0)::numeric(14,2), r.orcamento_usd is not distinct from coalesce(s.soma, 0),
         'pré-existente; resultados.orcamento_usd não é derivado ainda'::text
    from public.resultados r
    left join (select resultado_id, sum(orcamento_usd) soma from public.atividades group by 1) s
      on s.resultado_id = r.id;

  return query
  select 'info_tdr_ativo_sem_valor_usd'::text, o.codigo::text, 0::numeric, o.tdrs_sem_valor_usd::numeric,
         o.tdrs_sem_valor_usd = 0, 'TDR conta como zero no débito'::text
    from public.vw_orcamento_atividade o where o.tdrs_sem_valor_usd > 0;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_consumir_token_senha(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.senha_tokens
  WHERE token = p_token
    AND usuario_id = auth.uid()
    AND usado = false
    AND expira_em > now();
  IF v_id IS NULL THEN RETURN false; END IF;
  UPDATE public.senha_tokens SET usado = true WHERE id = v_id;
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contrato_auto_encerrar(p_contrato uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update contratos c set status = 'encerrado'
   where c.id = p_contrato and c.status = 'vigente'
     and coalesce(c.valor_total_brl, 0) > 0
     and coalesce(c.valor_utilizado_brl, 0) >= c.valor_total_brl - 0.005
     and not exists (select 1 from contratos_produtos cp where cp.contrato_id = c.id
                      and cp.situacao not in ('pago','cancelado'))
     and not exists (select 1 from execucao_financeira ef where ef.contrato_id = c.id and ef.situacao = 'a_pagar');
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_contrato_da_entrega(p_produto_id uuid, p_contrato_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(p_contrato_id, (select cp.contrato_id from public.contratos_produtos cp where cp.id = p_produto_id));
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contrato_id_do_path(p_name text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when split_part(p_name, '/', 1) in ('contratos', 'encerramentos')
     and split_part(p_name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(p_name, '/', 2)::uuid
  end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cotacao_atual()
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  select cotacao from public.cotacoes_usd order by data_ref desc limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cotacao_usd(p_data date DEFAULT NULL::date)
 RETURNS TABLE(data_cotacao date, ptax_venda numeric, ptax_compra numeric, data_pedida date, defasagem_dias integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedida date := coalesce(p_data, fn_hoje_acre());
  v_row    public.cotacoes_ptax;
begin
  select * into v_row from public.cotacoes_ptax c
   where c.data <= v_pedida order by c.data desc limit 1;
  if not found then
    raise exception 'COTACAO_INDISPONIVEL: não há PTAX gravada até %.', v_pedida;
  end if;
  if v_pedida - v_row.data > 7 then
    raise exception 'COTACAO_DESATUALIZADA: última PTAX gravada é de % (pedida %). Verifique o cron cotacao-ptax.',
      v_row.data, v_pedida;
  end if;
  return query select v_row.data, v_row.ptax_venda, v_row.ptax_compra, v_pedida, (v_pedida - v_row.data)::integer;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_criar_tarefa(p_titulo text, p_descricao text DEFAULT NULL::text, p_prioridade prioridade_tarefa DEFAULT 'media'::prioridade_tarefa, p_dt_inicio date DEFAULT NULL::date, p_dt_prazo date DEFAULT NULL::date, p_entidade_tipo text DEFAULT NULL::text, p_entidade_id uuid DEFAULT NULL::uuid, p_atividade_id uuid DEFAULT NULL::uuid, p_fornecedor_id uuid DEFAULT NULL::uuid, p_notificar_fornecedor boolean DEFAULT false, p_responsaveis uuid[] DEFAULT '{}'::uuid[], p_observadores uuid[] DEFAULT '{}'::uuid[], p_restrita boolean DEFAULT false, p_tipo text DEFAULT 'outras'::text, p_dados_tipo jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_criar_usuario(p_email text, p_senha text, p_nome text, p_perfil text DEFAULT 'visualizador'::text, p_telefone text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_user_id  UUID;
  v_existing UUID;
BEGIN
  -- Apenas super_admin e coordenacao podem criar usuários
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid()
      AND perfil IN ('super_admin','coordenacao')
      AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem criar usuários';
  END IF;

  -- Verificar se e-mail já existe
  SELECT id INTO v_existing FROM auth.users WHERE email = p_email LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'E-mail já cadastrado';
  END IF;

  v_user_id := gen_random_uuid();

  -- Criar usuário no auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role,
    aud,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_senha, gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome_completo', p_nome),
    false,
    'authenticated',
    'authenticated',
    '',
    '',
    '',
    '',
    ''
  );

  -- Criar identidade de e-mail
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    p_email,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true, 'provider_id', p_email),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  -- Inserir/atualizar tabela pública de usuários
  INSERT INTO public.usuarios (
    id, nome_completo, email, perfil, telefone,
    ativo, deve_trocar_senha, senha_temporaria_usada,
    criado_em, atualizado_em
  ) VALUES (
    v_user_id, p_nome, p_email, p_perfil::perfil_usuario, p_telefone,
    true, true, false,
    NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    nome_completo = EXCLUDED.nome_completo,
    perfil        = EXCLUDED.perfil,
    telefone      = EXCLUDED.telefone,
    deve_trocar_senha = true;

  RETURN json_build_object('id', v_user_id, 'email', p_email);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_definir_restricao_tarefa(p_tarefa_id uuid, p_restrita boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not fn_pode_ver_tarefa(p_tarefa_id) then raise exception 'sem acesso a esta tarefa'; end if;
  update tarefas set restrita = coalesce(p_restrita, false) where id = p_tarefa_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_agregados(p_nivel text DEFAULT 'geral'::text, p_municipio_ibge integer DEFAULT NULL::integer, p_por_sexo boolean DEFAULT false, p_somente_validadas boolean DEFAULT true, p_suprimir boolean DEFAULT true, p_minimo integer DEFAULT 5)
 RETURNS TABLE(questionario_id uuid, chave text, n integer, tipo text, opcao text, recorte text, recorte_nome text, sexo_respondente text, n_validos bigint, n_nr bigint, n_opcao bigint, pct numeric, media numeric, suprimido boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_min int;
begin
  if not fn_diag_pode_ver_numeros() then
    raise exception 'diag:nao_autorizado';
  end if;
  if p_nivel not in ('geral','municipio','comunidade') then
    raise exception 'diag:parametro_invalido: nível %', p_nivel;
  end if;
  -- só quem já lê fichas pode desligar a supressão ou baixar o mínimo
  if (not p_suprimir or p_minimo < 5) and not (fn_diag_pode_gerir() or fn_diag_pode_consultar()) then
    p_suprimir := true; p_minimo := 5;
  end if;
  v_min := greatest(p_minimo, 1);

  return query
  with i as (
    select vi.*,
           case p_nivel when 'geral' then 'geral'
                        when 'municipio' then vi.municipio_ibge::text
                        else vi.comunidade_chave end as rec,
           case p_nivel when 'geral' then 'Todas as comunidades'
                        when 'municipio' then (select m.nome from diag_municipios m where m.ibge = vi.municipio_ibge)
                        else vi.comunidade_nome end as rec_nome,
           case when p_por_sexo then vi.sexo_respondente end as sx
    from vw_diag_indicadores vi
    where (not p_somente_validadas or vi.validada)
      and (p_municipio_ibge is null or vi.municipio_ibge = p_municipio_ibge)
  ),
  den as (
    select i.questionario_id, i.chave, i.n, i.tipo, i.rec, max(i.rec_nome) as rec_nome, i.sx,
           sum(i.n_fichas)::bigint as nv, sum(i.n_nr)::bigint as nnr, sum(i.soma) as soma
    from i where i.tipo_linha = 'base'
    group by i.questionario_id, i.chave, i.n, i.tipo, i.rec, i.sx
  ),
  num as (
    select i.questionario_id, i.chave, i.opcao, i.rec, i.sx, sum(i.n_fichas)::bigint as nop
    from i where i.tipo_linha = 'opcao'
    group by i.questionario_id, i.chave, i.opcao, i.rec, i.sx
  )
  select d.questionario_id, d.chave, d.n, d.tipo, u.opcao, d.rec, d.rec_nome, d.sx,
         d.nv, d.nnr,
         case when p_suprimir and d.nv < v_min then null else coalesce(u.nop, 0) end,
         case when p_suprimir and d.nv < v_min then null
              when u.opcao is null or d.nv = 0 then null
              else round(100.0 * coalesce(u.nop,0) / d.nv, 1) end,
         case when p_suprimir and d.nv < v_min then null
              when d.tipo in ('inteiro','decimal') and d.nv > 0 then round(d.soma / d.nv, 2) end,
         (p_suprimir and d.nv < v_min)
  from den d
  left join num u on u.questionario_id = d.questionario_id and u.chave = d.chave
                 and u.rec = d.rec and u.sx is not distinct from d.sx
  order by d.n, d.rec, d.sx, u.opcao;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_alertas_audio(p_alertas jsonb, p_ficha_id uuid, p_estrutura jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_aplicar_retencao()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prazo interval;
  v_ids   uuid[];
begin
  select retencao_prazo into v_prazo from lgpd_tratamentos
  where modulo = 'diagnostico' and ativo order by codigo limit 1;
  if v_prazo is null then
    raise exception 'diag:retencao_sem_prazo: TRAT-001 sem retencao_prazo em lgpd_tratamentos';
  end if;

  select array_agg(id) into v_ids from diag_fichas
  where identificacao_apagada_em is null
    and ( (status = 'validada'   and validado_em   < now() - v_prazo)
       or (status = 'descartada' and descartado_em < now() - v_prazo) );
  if v_ids is null then return 0; end if;

  perform set_config('diag.motivo', 'retencao_2_anos', true);
  delete from diag_fichas_identificacao where ficha_id = any(v_ids);
  delete from diag_moradores_identificacao mi using diag_moradores m
   where mi.morador_id = m.id and m.ficha_id = any(v_ids);
  delete from diag_fotos where ficha_id = any(v_ids);         -- arquivos → diag_expurgo_arquivos
  update diag_fichas set identificacao_apagada_em = now() where id = any(v_ids);
  return array_length(v_ids, 1);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_aplicaveis(p_estrutura jsonb, p_respostas jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  r      record;
  v_apl  text[] := '{}';
  v_ok   boolean;
begin
  for r in select pergunta from fn_diag_perguntas(p_estrutura) order by ordem loop
    if coalesce((r.pergunta->>'coluna_fixa')::boolean, false)
       or r.pergunta->>'tipo' = 'tabela'
       or r.pergunta->>'destino' = 'identificacao' then
      continue;
    end if;
    if r.pergunta ? 'mostrar_se' then
      v_ok := fn_diag_cond(r.pergunta->'mostrar_se', p_respostas, v_apl);
      if v_ok is null then
        raise exception 'diag:estrutura_invalida: operador de salto desconhecido em %', r.pergunta->>'chave';
      end if;
    else
      v_ok := true;
    end if;
    if v_ok then v_apl := v_apl || (r.pergunta->>'chave'); end if;
  end loop;
  return v_apl;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_audio_expurgo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into diag_expurgo_arquivos (bucket, caminho, motivo)
  values ('diagnostico-audios',
          regexp_replace(old.arquivo_url, '^.*/diagnostico-audios/', ''),
          coalesce(nullif(current_setting('diag.motivo', true), ''), 'áudio removido'));
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_audios_pendentes(p_ficha_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(a.pergunta_chave order by a.pergunta_chave), '{}')
  from diag_audios a join diag_fichas f on f.id = a.ficha_id
  where a.ficha_id = p_ficha_id
    and coalesce(btrim(f.respostas->>a.pergunta_chave), '') = ''
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_audios_retencao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from diag_audios where ficha_id = new.id;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_bloqueia_ident_apos_retencao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ficha uuid;
begin
  -- to_jsonb: as três tabelas têm colunas diferentes (morador_id × ficha_id)
  v_ficha := case tg_table_name
               when 'diag_moradores_identificacao'
                 then (select ficha_id from diag_moradores where id = (to_jsonb(new)->>'morador_id')::uuid)
               else (to_jsonb(new)->>'ficha_id')::uuid end;
  if exists (select 1 from diag_fichas where id = v_ficha and identificacao_apagada_em is not null) then
    raise exception 'diag:identificacao_expirada: prazo de retenção já aplicado a esta ficha';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_calcular_alertas(p_estrutura jsonb, p_respostas jsonb, p_moradores jsonb, p_usou_carencia boolean, p_comunidade_nova boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_al   jsonb := '[]'::jsonb;
  v_apl  text[] := fn_diag_aplicaveis(p_estrutura, p_respostas);
  v_der  jsonb := fn_diag_derivar(p_moradores);
  r      record;
  p      jsonb;
  v      jsonb;
  -- números vêm da estrutura (a tabela de moradores era a P9 até a v6; é a P7 na v7)
  v_ntab int := coalesce((select (pergunta->>'n')::int from fn_diag_perguntas(p_estrutura)
                          where pergunta->>'tipo' = 'tabela' order by ordem limit 1), 9);
  v_nqtd int := coalesce((select (pergunta->>'n')::int from fn_diag_perguntas(p_estrutura)
                          where pergunta->>'chave' = 'qtd_moradores' limit 1), 8);
  v_nmul int := coalesce((select (pergunta->>'n')::int from fn_diag_perguntas(p_estrutura)
                          where pergunta->>'chave' = 'atividades_mulheres' limit 1), 61);
  v_nhom int := coalesce((select (pergunta->>'n')::int from fn_diag_perguntas(p_estrutura)
                          where pergunta->>'chave' = 'atividades_homens' limit 1), 62);
begin
  if p_respostas = '{}'::jsonb then
    return v_al;   -- recusa: nada a cobrar
  end if;
  for r in select pergunta from fn_diag_perguntas(p_estrutura) order by ordem loop
    p := r.pergunta;
    continue when not ((p->>'chave') = any(v_apl));
    continue when coalesce((p->>'opcional')::boolean, false) or p ? 'derivada';
    v := p_respostas -> (p->>'chave');
    if v is null then
      v_al := v_al || jsonb_build_object('tipo','pendente','chave',p->>'chave','n',(p->>'n')::int);
      continue;
    end if;
    if (v = '"outro"' or (jsonb_typeof(v) = 'array' and v @> '["outro"]'))
       and not (p_respostas ? ((p->>'chave') || '_outro')) then
      v_al := v_al || jsonb_build_object('tipo','outro_sem_texto','chave',p->>'chave','n',(p->>'n')::int);
    end if;
    if jsonb_typeof(v) = 'number' then
      if p ? 'aviso_min' and (v #>> '{}')::numeric < (p->>'aviso_min')::numeric then
        v_al := v_al || jsonb_build_object('tipo','abaixo_do_esperado','chave',p->>'chave','n',(p->>'n')::int);
      end if;
      if p ? 'aviso_max' and (v #>> '{}')::numeric > (p->>'aviso_max')::numeric then
        v_al := v_al || jsonb_build_object('tipo','acima_do_esperado','chave',p->>'chave','n',(p->>'n')::int);
      end if;
    end if;
  end loop;

  -- P9 vazia
  if jsonb_array_length(coalesce(p_moradores,'[]')) = 0 then
    v_al := v_al || jsonb_build_object('tipo','pendente','chave','moradores','n',v_ntab);
  else
    -- entrevistado na 1ª linha (decisão de 26/09)
    if not exists (select 1 from jsonb_array_elements(p_moradores) m
                   where (m->>'ordem')::int = 1 and coalesce((m->>'e_entrevistado')::boolean,false)) then
      v_al := v_al || jsonb_build_object('tipo','entrevistado_fora_da_1a_linha','chave','moradores','n',v_ntab);
    end if;
  end if;
  -- V1: P8 × linhas da P9
  if jsonb_typeof(p_respostas->'qtd_moradores') = 'number'
     and (p_respostas->>'qtd_moradores')::int <> (v_der->>'total_moradores')::int then
    v_al := v_al || jsonb_build_object('tipo','qtd_moradores_diverge','n',v_nqtd,
                      'informado',(p_respostas->>'qtd_moradores')::int,'listados',(v_der->>'total_moradores')::int);
  end if;
  -- D2 incoerente: "não há mulheres/homens" com mulher/homem listado
  if (p_respostas->'atividades_mulheres') @> '["nao_ha_mulheres"]' and not (v_der->>'sem_mulheres')::boolean then
    v_al := v_al || jsonb_build_object('tipo','incoerente_com_moradores','chave','atividades_mulheres','n',v_nmul);
  end if;
  if (p_respostas->'atividades_homens') @> '["nao_ha_homens"]' and not (v_der->>'sem_homens')::boolean then
    v_al := v_al || jsonb_build_object('tipo','incoerente_com_moradores','chave','atividades_homens','n',v_nhom);
  end if;
  if p_usou_carencia then
    v_al := v_al || jsonb_build_object('tipo','enviada_na_carencia');
  end if;
  if p_comunidade_nova then
    v_al := v_al || jsonb_build_object('tipo','comunidade_nova');
  end if;
  return v_al;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_chaves_com_sugestao()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct p.pergunta->>'chave'
  from diag_questionarios q, fn_diag_perguntas(q.estrutura) p
  where q.status <> 'rascunho' and coalesce((p.pergunta->>'sugestoes')::boolean, false)
  union
  select distinct 'moradores.' || (c->>'chave')
  from diag_questionarios q, jsonb_array_elements(q.estrutura->'moradores'->'colunas') c
  where q.status <> 'rascunho' and coalesce((c->>'sugestoes')::boolean, false)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_cond(p_cond jsonb, p_respostas jsonb, p_aplicaveis text[])
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_ref  jsonb;
  v_op   text := p_cond->>'op';
  c      jsonb;
begin
  if p_cond ? 'todas' then
    for c in select * from jsonb_array_elements(p_cond->'todas') loop
      if not fn_diag_cond(c, p_respostas, p_aplicaveis) then return false; end if;
    end loop;
    return true;
  end if;
  -- pergunta de referência fora de aplicação → dependente também fica fora
  if not ((p_cond->>'se') = any(p_aplicaveis)) then return false; end if;
  v_ref := p_respostas -> (p_cond->>'se');
  return case v_op
    when '='  then coalesce(jsonb_typeof(v_ref) = 'string' and v_ref = p_cond->'valor', false)
    when '!=' then not coalesce(jsonb_typeof(v_ref) = 'string' and v_ref = p_cond->'valor', false)
    when 'in' then coalesce(jsonb_typeof(v_ref) = 'string' and (p_cond->'valor') @> jsonb_build_array(v_ref), false)
    when 'contem' then coalesce(jsonb_typeof(v_ref) = 'array' and v_ref @> jsonb_build_array(p_cond->'valor'), false)
    when 'nao_contem' then not coalesce(jsonb_typeof(v_ref) = 'array' and v_ref @> jsonb_build_array(p_cond->'valor'), false)
    else null
  end;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_derivar(p_moradores jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'tem_escolar', case when exists (
        select 1 from jsonb_array_elements(coalesce(p_moradores,'[]'::jsonb)) m
        where (m->>'idade') ~ '^\d+$' and (m->>'idade')::int between 4 and 17)
      then 'sim' else 'nao' end,
    'sem_mulheres', not exists (
        select 1 from jsonb_array_elements(coalesce(p_moradores,'[]'::jsonb)) m
        where m->>'sexo_genero' = 'mulher'),
    'sem_homens', not exists (
        select 1 from jsonb_array_elements(coalesce(p_moradores,'[]'::jsonb)) m
        where m->>'sexo_genero' = 'homem'),
    'total_moradores', jsonb_array_length(coalesce(p_moradores,'[]'::jsonb)))
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_ficha_historico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into diag_fichas_historico (ficha_id, status_de, status_para, por)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into diag_fichas_historico (ficha_id, status_de, status_para, motivo, por)
    values (new.id, old.status, new.status,
            case when new.status = 'devolvida' then new.motivo_devolucao
                 else current_setting('diag.motivo', true) end,
            auth.uid());
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_foto_expurgo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into diag_expurgo_arquivos (bucket, caminho, motivo)
  values ('diagnostico-fotos',
          regexp_replace(old.arquivo_url, '^.*/diagnostico-fotos/', ''),
          coalesce(nullif(current_setting('diag.motivo', true), ''), 'foto removida'));
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_foto_pode_enviar(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (fn_diag_pode_aplicar() or fn_diag_pode_treinar())
     and fn_diag_uuid_do_path(p_name) is not null
     and (
       not exists (select 1 from diag_fichas f where f.uuid_cliente = fn_diag_uuid_do_path(p_name))
       or exists (select 1 from diag_fichas f
                  where f.uuid_cliente = fn_diag_uuid_do_path(p_name)
                    and f.entrevistador_id = auth.uid() and f.status in ('enviada','devolvida')))
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_foto_pode_ler(p_name text, p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when fn_diag_pode_gerir() then true
    when exists (select 1 from diag_fichas f where f.uuid_cliente = fn_diag_uuid_do_path(p_name))
      then exists (select 1 from diag_fichas f
                   where f.uuid_cliente = fn_diag_uuid_do_path(p_name)
                     and f.entrevistador_id = auth.uid() and fn_diag_pode_aplicar())
    else p_owner = auth.uid() and fn_diag_pode_aplicar()
  end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_maior_nivel(p_estrutura jsonb, p_pergunta jsonb, p_moradores jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select (select to_jsonb(e.v)
            from jsonb_array_elements(coalesce(p_moradores,'[]'::jsonb)) m
            join jsonb_array_elements(coalesce(p_estrutura->'moradores'->'colunas','[]'::jsonb)) c
              on c->>'chave' = p_pergunta->>'coluna'
            join jsonb_array_elements(c->'opcoes') o on o->'v' = m->(p_pergunta->>'coluna') and o ? 'nivel'
            join jsonb_array_elements_text(coalesce((select jsonb_agg(x->'v' order by k) from jsonb_array_elements(p_pergunta->'opcoes') with ordinality as xx(x, k)),'[]'))
                 with ordinality as e(v, i) on e.v = o->>'nivel'
           order by e.i desc limit 1)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_normalizar_respostas(p_estrutura jsonb, p_respostas jsonb, p_moradores jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_der    jsonb := fn_diag_derivar(p_moradores);
  v_resp   jsonb := coalesce(p_respostas, '{}'::jsonb);
  v_apl    text[];
  v_out    jsonb := '{}'::jsonb;
  v_perg   jsonb := '{}'::jsonb;   -- chave → pergunta
  v_chave  text;
  v_val    jsonb;
  p        jsonb;
  v_opcoes jsonb;
  v_excl   jsonb;
  v_n      numeric;
  v_base   text;
  v_maxlen int := coalesce((p_estrutura->>'texto_max_len')::int, 2000);
  v_outlen int := coalesce((p_estrutura->>'outro_max_len')::int, 120);
begin
  if jsonb_typeof(v_resp) <> 'object' then
    raise exception 'diag:resposta_invalida: respostas deve ser um objeto';
  end if;

  select jsonb_object_agg(pergunta->>'chave', pergunta) into v_perg from fn_diag_perguntas(p_estrutura);

  -- derivadas: valor do banco prevalece sobre o do aparelho; sem valor → sai
  for p in select pergunta from fn_diag_perguntas(p_estrutura) where pergunta ? 'derivada' loop
    v_val := case when p->>'derivada' = 'maior_nivel' then fn_diag_maior_nivel(p_estrutura, p, p_moradores)
                  else v_der -> (p->>'derivada') end;
    if v_val is null or v_val = 'null'::jsonb then
      v_resp := v_resp - (p->>'chave');
    else
      v_resp := v_resp || jsonb_build_object(p->>'chave', v_val);
    end if;
  end loop;

  v_apl := fn_diag_aplicaveis(p_estrutura, v_resp);

  -- chave desconhecida é erro (app antigo ou bug) — nunca ignorar em silêncio
  for v_chave in select jsonb_object_keys(v_resp) loop
    v_base := regexp_replace(v_chave, '_outro$', '');
    if not (v_perg ? v_chave)
       and not (v_chave like '%\_outro' and v_perg ? v_base
                and exists (select 1 from jsonb_array_elements(coalesce(v_perg->v_base->'opcoes','[]')) o
                            where coalesce((o->>'especificar')::boolean, false))) then
      raise exception 'diag:resposta_invalida: chave desconhecida %', v_chave;
    end if;
    if v_perg ? v_chave and (coalesce((v_perg->v_chave->>'coluna_fixa')::boolean,false)
        or v_perg->v_chave->>'tipo' = 'tabela' or v_perg->v_chave->>'destino' = 'identificacao') then
      raise exception 'diag:resposta_invalida: % não pertence a respostas', v_chave;
    end if;
  end loop;

  foreach v_chave in array v_apl loop
    continue when not (v_resp ? v_chave);
    p := v_perg -> v_chave;
    v_val := v_resp -> v_chave;
    if v_val = '"_nr"'::jsonb then
      v_out := v_out || jsonb_build_object(v_chave, v_val);
      continue;
    end if;
    v_opcoes := coalesce((select jsonb_agg(o->'v') from jsonb_array_elements(p->'opcoes') o), '[]');
    case p->>'tipo'
      when 'unica' then
        if jsonb_typeof(v_val) <> 'string' or not (v_opcoes @> jsonb_build_array(v_val)) then
          raise exception 'diag:resposta_invalida: % fora das opções', v_chave;
        end if;
      when 'multipla' then
        if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) = 0
           or not (v_opcoes @> v_val)
           or (select count(*) <> count(distinct e) from jsonb_array_elements(v_val) e) then
          raise exception 'diag:resposta_invalida: % fora das opções', v_chave;
        end if;
        v_excl := coalesce((select jsonb_agg(o->'v') from jsonb_array_elements(p->'opcoes') o
                            where coalesce((o->>'exclusiva')::boolean,false)), '[]');
        if jsonb_array_length(v_val) > 1
           and exists (select 1 from jsonb_array_elements(v_val) e where v_excl @> jsonb_build_array(e)) then
          raise exception 'diag:resposta_invalida: % tem opção exclusiva junto com outras', v_chave;
        end if;
        if p ? 'max_marcar' and jsonb_array_length(v_val) > (p->>'max_marcar')::int then
          raise exception 'diag:resposta_invalida: % passa do limite de % opções', v_chave, p->>'max_marcar';
        end if;
      when 'inteiro', 'decimal' then
        if jsonb_typeof(v_val) <> 'number' then
          raise exception 'diag:resposta_invalida: % deve ser número', v_chave;
        end if;
        v_n := (v_val #>> '{}')::numeric;
        if (p->>'tipo' = 'inteiro' and v_n <> trunc(v_n))
           or (p ? 'min' and v_n < (p->>'min')::numeric)
           or (p ? 'max' and v_n > (p->>'max')::numeric) then
          raise exception 'diag:resposta_invalida: % fora do intervalo', v_chave;
        end if;
      when 'texto', 'texto_longo' then
        if jsonb_typeof(v_val) <> 'string'
           or length(v_val #>> '{}') > coalesce((p->>'max_len')::int, v_maxlen) then
          raise exception 'diag:resposta_invalida: % texto inválido', v_chave;
        end if;
        continue when btrim(v_val #>> '{}') = '';
      else
        raise exception 'diag:estrutura_invalida: tipo % em %', p->>'tipo', v_chave;
    end case;
    v_out := v_out || jsonb_build_object(v_chave, v_val);

    -- "especifique": só com a opção "outro" marcada
    if v_resp ? (v_chave || '_outro') then
      if jsonb_typeof(v_resp->(v_chave || '_outro')) <> 'string'
         or length(v_resp->>(v_chave || '_outro')) > v_outlen then
        raise exception 'diag:resposta_invalida: %_outro inválido', v_chave;
      end if;
      if not (v_val = '"outro"'::jsonb or (jsonb_typeof(v_val) = 'array' and v_val @> '["outro"]')) then
        raise exception 'diag:resposta_invalida: %_outro sem a opção Outro marcada', v_chave;
      end if;
      if btrim(v_resp->>(v_chave || '_outro')) <> '' then
        v_out := v_out || jsonb_build_object(v_chave || '_outro', v_resp->(v_chave || '_outro'));
      end if;
    end if;
  end loop;

  return v_out;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_normalizar_texto(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select btrim(regexp_replace(lower(translate(coalesce(p,''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuuccnn')), '\s+', ' ', 'g'))
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_perfil_ativo()
 RETURNS perfil_usuario
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select perfil from public.usuarios where id = auth.uid() and ativo
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_perguntas(p_estrutura jsonb)
 RETURNS TABLE(ordem integer, bloco text, pergunta jsonb)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select (bb.i * 1000 + pp.j)::int, b->>'id', p
  from jsonb_array_elements(p_estrutura->'blocos') with ordinality as bb(b, i),
       jsonb_array_elements(b->'perguntas') with ordinality as pp(p, j)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_pode_aplicar()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    fn_diag_perfil_ativo() = 'super_admin'
    or (fn_diag_perfil_ativo() = 'tecnico' and tem_permissao('diagnostico')),
  false)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_pode_consultar()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(fn_diag_perfil_ativo() = 'consultor_externo' and tem_permissao('diagnostico'), false)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_pode_gerir()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(fn_diag_perfil_ativo() in ('super_admin','coordenacao'), false)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_pode_treinar()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    fn_diag_perfil_ativo() = 'super_admin'
    or (fn_diag_perfil_ativo() = 'tecnico' and tem_permissao('diagnostico') and tem_permissao('diagnostico_treino'))
    or (fn_diag_perfil_ativo() = 'coordenacao' and tem_permissao('diagnostico_treino')),
  false)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_pode_ver_ficha(p_ficha_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.diag_fichas f
    where f.id = p_ficha_id
      and ( fn_diag_pode_gerir()
            or fn_diag_pode_consultar()
            or (f.entrevistador_id = auth.uid() and fn_diag_pode_aplicar()) ))
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_pode_ver_identificacao(p_ficha_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.diag_fichas f
    where f.id = p_ficha_id
      and ( fn_diag_pode_gerir()
            or (f.entrevistador_id = auth.uid() and fn_diag_pode_aplicar()) ))
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_pode_ver_numeros()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select fn_diag_pode_aplicar() or fn_diag_pode_gerir() or fn_diag_pode_consultar()
         or coalesce(fn_diag_perfil_ativo() = 'visualizador', false)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_questionario_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'diag:questionario_publicado: versão publicada não pode ser apagada; arquive-a';
    end if;
    return old;
  end if;
  if old.status <> 'rascunho' then
    if new.estrutura is distinct from old.estrutura
       or new.aviso_entrevistado is distinct from old.aviso_entrevistado
       or new.codigo <> old.codigo or new.versao <> old.versao then
      raise exception 'diag:questionario_publicado: versão publicada é imutável; crie uma nova versão';
    end if;
    if old.status = 'arquivado' and new.status <> 'arquivado' then
      raise exception 'diag:questionario_arquivado: versão arquivada não volta a ser usada';
    end if;
  end if;
  if new.status = 'publicado' and old.status = 'rascunho' then
    new.publicado_em := now();
    new.publicado_por := auth.uid();
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_sha256(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'public'
AS $function$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_sugestoes(p_chave text DEFAULT NULL::text)
 RETURNS TABLE(chave text, texto text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.atualizado_em := now(); return new; end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_uuid_do_path(p_name text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(p_name))[1])::uuid end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_valida_audios()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_diag_validar_moradores(p_estrutura jsonb, p_moradores jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_m      jsonb;
  v_col    jsonb;
  v_ords   int[] := '{}';
begin
  if jsonb_typeof(coalesce(p_moradores,'[]')) <> 'array' or jsonb_array_length(coalesce(p_moradores,'[]')) > 30 then
    raise exception 'diag:morador_invalido: lista de moradores inválida';
  end if;
  for v_m in select * from jsonb_array_elements(coalesce(p_moradores,'[]')) loop
    if not ((v_m->>'ordem') ~ '^\d+$') or (v_m->>'ordem')::int = any(v_ords) then
      raise exception 'diag:morador_invalido: ordem ausente ou repetida';
    end if;
    v_ords := v_ords || (v_m->>'ordem')::int;
    for v_col in select c from jsonb_array_elements(p_estrutura->'moradores'->'colunas') c
                 where c->>'tipo' = 'unica' loop
      if v_m ? (v_col->>'chave') and v_m->(v_col->>'chave') not in ('null'::jsonb, '""'::jsonb, '"_nr"'::jsonb)
         and not exists (select 1 from jsonb_array_elements(v_col->'opcoes') o
                         where o->'v' = v_m->(v_col->>'chave')) then
        raise exception 'diag:morador_invalido: % fora das opções', lower(v_col->>'rotulo');
      end if;
    end loop;
    if nullif(v_m->>'sexo_genero_outro','') is not null and coalesce(v_m->>'sexo_genero','') <> 'outro' then
      raise exception 'diag:morador_invalido: especifique sem a opção Outro';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(coalesce(p_moradores,'[]')) m
      where coalesce((m->>'e_entrevistado')::boolean, false)) > 1 then
    raise exception 'diag:morador_invalido: mais de um morador marcado como entrevistado';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_editar_tarefa(p_tarefa_id uuid, p_titulo text, p_descricao text, p_prioridade prioridade_tarefa, p_dt_inicio date, p_entidade_tipo text, p_entidade_id uuid, p_atividade_id uuid, p_fornecedor_id uuid, p_notificar_fornecedor boolean, p_tipo text DEFAULT NULL::text, p_dados_tipo jsonb DEFAULT NULL::jsonb, p_mudar_prazo boolean DEFAULT false, p_dt_prazo date DEFAULT NULL::date, p_motivo text DEFAULT NULL::text, p_versao timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_atual tarefas; v_nome text; v_prazo date; v_alvo uuid[];
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão para editar esta tarefa';
  end if;
  select * into v_atual from tarefas where id = p_tarefa_id for update;

  if p_versao is not null and v_atual.atualizado_em is distinct from p_versao then
    select u.nome_completo into v_nome from tarefa_historico h join usuarios u on u.id = h.autor_id
    where h.tarefa_id = p_tarefa_id order by h.criado_em desc limit 1;
    raise exception 'Esta tarefa foi alterada por % às % — feche e abra de novo antes de salvar.',
      coalesce(v_nome, 'outra pessoa'),
      to_char(v_atual.atualizado_em at time zone 'America/Rio_Branco', 'HH24:MI "de" DD/MM');
  end if;

  v_prazo := case when p_mudar_prazo then p_dt_prazo else v_atual.dt_prazo end;
  if v_prazo is distinct from v_atual.dt_prazo and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'informe o motivo da alteração: o prazo mudou';
  end if;

  perform set_config('dima.motivo_edicao', coalesce(btrim(p_motivo), ''), true);
  update tarefas set
    titulo = coalesce(btrim(p_titulo), titulo),
    descricao = p_descricao,
    prioridade = coalesce(p_prioridade, prioridade),
    dt_inicio = p_dt_inicio,
    dt_prazo = v_prazo,
    entidade_tipo = p_entidade_tipo, entidade_id = p_entidade_id,
    atividade_id = p_atividade_id,
    fornecedor_id = p_fornecedor_id,
    notificar_fornecedor = coalesce(p_notificar_fornecedor, notificar_fornecedor),
    tipo = coalesce(p_tipo, tipo),
    dados_tipo = coalesce(p_dados_tipo, dados_tipo)
  where id = p_tarefa_id;
  perform set_config('dima.motivo_edicao', '', true);

  if v_prazo is distinct from v_atual.dt_prazo then
    select array_agg(usuario_id) into v_alvo from tarefa_participantes where tarefa_id = p_tarefa_id;
    perform fn_tarefa_notificar(v_alvo, 'tarefa_prazo',
      'Prazo alterado: ' || coalesce(v_atual.codigo,''),
      'Novo prazo: ' || coalesce(to_char(v_prazo,'DD/MM/YYYY'),'sem prazo'),
      p_tarefa_id, auth.uid());
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_eh_fornecedor_do_contrato(p_contrato_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.contratos c
      join public.fornecedor_usuarios fu on fu.fornecedor_id = c.fornecedor_id and fu.ativo
     where c.id = p_contrato_id and fu.usuario_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.fn_eh_fornecedor_vinculado(p_fornecedor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_fornecedor_id is not null and exists (
    select 1 from public.fornecedor_usuarios fu
      join public.usuarios u on u.id = fu.usuario_id and u.ativo
     where fu.fornecedor_id = p_fornecedor_id and fu.usuario_id = auth.uid() and fu.ativo);
$function$
;

CREATE OR REPLACE FUNCTION public.fn_encerramento_anexar_documento(p_encerramento_id uuid, p_caminho text, p_nome text, p_sha256 text, p_tamanho bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e      contrato_encerramentos%rowtype;
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_tar  tarefas%rowtype;
begin
  if not exists (select 1 from usuarios where id = v_uid and ativo and perfil in ('super_admin','coordenacao')) then
    raise exception 'ENCERRAMENTO_DOC: só coordenação ou super_admin anexam o termo de encerramento.';
  end if;
  select * into e from contrato_encerramentos where id = p_encerramento_id;
  if e.id is null or e.tipo <> 'encerramento_contrato' then
    raise exception 'ENCERRAMENTO_DOC: encerramento não encontrado.';
  end if;
  if coalesce(p_caminho,'') not like 'encerramentos/' || e.contrato_id || '/%' or p_caminho like '%..%' then
    raise exception 'ENCERRAMENTO_DOC: caminho do arquivo fora da pasta do encerramento.';
  end if;
  if lower(coalesce(p_nome,'')) not like '%.pdf' then
    raise exception 'ENCERRAMENTO_DOC: o termo deve ser PDF.';
  end if;
  if coalesce(lower(p_sha256),'') !~ '^[0-9a-f]{64}$' then
    raise exception 'ENCERRAMENTO_DOC: impressão digital (SHA-256) inválida.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'contratos-docs' and name = p_caminho) then
    raise exception 'ENCERRAMENTO_DOC: arquivo não encontrado no armazenamento — envie de novo.';
  end if;

  insert into contrato_encerramento_documentos (encerramento_id, contrato_id, caminho, nome, sha256, tamanho, criado_por)
  values (e.id, e.contrato_id, p_caminho, left(p_nome, 200), lower(p_sha256), p_tamanho, v_uid)
  returning id into v_id;

  for v_tar in select * from tarefas
     where entidade_tipo = 'contrato_encerramento' and entidade_id = e.id and ativo
       and status not in ('concluida','cancelada') loop
    perform set_config('dima.tarefa_status_rpc', '1', true);
    update tarefas set status = 'concluida', dt_conclusao = now() where id = v_tar.id;
    perform set_config('dima.tarefa_status_rpc', '', true);
    insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem)
      values (v_tar.id, v_uid, 'Conclusão: termo de encerramento anexado (' || left(p_nome,120) || ', SHA-256 ' || left(lower(p_sha256),12) || '…).', 'painel');
    insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para, motivo)
      values (v_tar.id, v_uid, 'conclusao', v_tar.status::text, 'concluida', 'Termo de encerramento anexado no contrato.');
  end loop;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_encerramento_criar_tarefa(p_enc uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e  contrato_encerramentos%rowtype;
  c  contratos%rowtype;
  v_resp uuid;
  v_id   uuid;
  v_forn text;
begin
  select * into e from contrato_encerramentos where id = p_enc;
  if e.id is null or e.tipo <> 'encerramento_contrato' then return null; end if;
  select id into v_id from tarefas
   where entidade_tipo = 'contrato_encerramento' and entidade_id = p_enc and ativo limit 1;
  if v_id is not null then return v_id; end if;
  if exists (select 1 from contrato_encerramento_documentos where encerramento_id = p_enc) then return null; end if;

  select * into c from contratos where id = e.contrato_id;
  select nome into v_forn from fornecedores where id = c.fornecedor_id;
  v_resp := coalesce(
    (select id from usuarios where id = nullif(current_setting('dima.encerramento_resp_termo', true), '')::uuid and ativo),
    (select id from usuarios where id = e.autorizado_por and ativo and perfil in ('super_admin','coordenacao')),
    (select x.usuario_id from rem_cargo_titulares x join usuarios u on u.id = x.usuario_id and u.ativo
      where x.cargo = 'coordenacao_solicitante' and x.vigencia_fim is null limit 1),
    (select id from usuarios where id = e.autorizado_por and ativo));
  if v_resp is null then return null; end if;

  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo, entidade_tipo, entidade_id,
                       atividade_id, criado_por, tipo)
  values ('Anexar termo de encerramento do contrato ' || c.numero,
          'O contrato ' || c.numero || coalesce(' (' || v_forn || ')', '') || ' foi encerrado em '
            || to_char(e.criado_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY')
            || ' com ' || 'R$ ' || replace(replace(replace(to_char(e.valor_liberado_brl, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.') || ' não executados devolvidos à atividade. '
            || 'Anexe o termo de encerramento (ou distrato) assinado em Contratos › contrato ' || c.numero
            || ' › Detalhes e documentos › Encerramento › "Anexar PDF". A tarefa é concluída sozinha quando o termo for anexado.',
          'alta', current_date, current_date + 15, 'contrato_encerramento', p_enc,
          e.atividade_id, v_resp, 'outras')
  returning id into v_id;

  insert into tarefa_participantes (tarefa_id, usuario_id, papel) values (v_id, v_resp, 'responsavel')
    on conflict (tarefa_id, usuario_id) do nothing;
  if c.tdr_id is not null and e.atividade_id is not null
     and exists (select 1 from tdrs where id = c.tdr_id and atividade_id = e.atividade_id) then
    insert into tarefa_tdrs (tarefa_id, tdr_id) values (v_id, c.tdr_id) on conflict do nothing;
  end if;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (v_id, v_resp, 'criacao', 'Criada pelo sistema no encerramento do contrato ' || c.numero);
  perform fn_tarefa_notificar(array[v_resp], 'tarefa_atribuida',
    'Nova tarefa: anexar termo de encerramento', 'Contrato ' || c.numero, v_id, null);
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_encp_aprovadores(p_atividade uuid, p_excluir uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct ar.usuario_id
    from public.atividade_responsaveis ar
    join public.usuarios u on u.id = ar.usuario_id and u.ativo
   where ar.atividade_id = p_atividade and ar.ativo
     and ar.papel in ('responsavel','substituto')
     and ar.usuario_id is distinct from p_excluir
$function$
;

CREATE OR REPLACE FUNCTION public.fn_encp_avisar(p_usuarios uuid[], p_tipo text, p_titulo text, p_msg text, p_contrato uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare u uuid;
begin
  if p_usuarios is null then return; end if;
  foreach u in array p_usuarios loop
    if u is null then continue; end if;
    insert into notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
    values (u, p_tipo, p_titulo, p_msg, 'contratos.html?contrato=' || p_contrato::text, 'contrato', p_contrato);
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_encp_cancelar(p_pedido uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p contrato_encerramento_pedidos%rowtype; v_uid uuid := auth.uid();
begin
  select * into p from contrato_encerramento_pedidos where id = p_pedido for update;
  if p.id is null then raise exception 'ENCERRAMENTO_PEDIDO: pedido não encontrado.'; end if;
  if p.status <> 'aguardando' then raise exception 'ENCERRAMENTO_PEDIDO: o pedido já foi decidido.'; end if;
  if v_uid is distinct from p.solicitado_por
     and not exists (select 1 from usuarios where id = v_uid and ativo and perfil = 'super_admin') then
    raise exception 'ENCERRAMENTO_PEDIDO: só quem pediu (ou super_admin) cancela o pedido.';
  end if;
  if coalesce(length(btrim(p_motivo)), 0) < 5 then raise exception 'ENCERRAMENTO_PEDIDO: informe o motivo.'; end if;
  perform set_config('dima.encerramento', 'pedido', true);
  update contrato_encerramento_pedidos set status = 'cancelado', cancelado_motivo = btrim(p_motivo),
         decidido_por = v_uid, decidido_em = now() where id = p.id;
  perform set_config('dima.encerramento', '', true);
  perform fn_encp_fechar_tarefa(p.id, 'cancelada', v_uid, 'Pedido de encerramento cancelado: ' || btrim(p_motivo));
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_encp_decidir(p_usuario_id uuid, p_pedido uuid, p_decisao text, p_parecer text, p_hash text, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p      contrato_encerramento_pedidos%rowtype;
  c      contratos%rowtype;
  v_ptax numeric;
  v_ptax_data date;
  v_usd  numeric := 0;
  v_enc  uuid;
  v_avis uuid[];
  v_fmt  text;
  v_resp_termo uuid;
begin
  if p_decisao not in ('aprovar','devolver') then raise exception 'Decisão inválida: %', p_decisao; end if;
  if not exists (select 1 from usuarios where id = p_usuario_id and ativo) then
    raise exception 'Usuário inexistente ou inativo.';
  end if;
  select * into p from contrato_encerramento_pedidos where id = p_pedido for update;
  if p.id is null then raise exception 'ENCERRAMENTO_PEDIDO: pedido não encontrado.'; end if;
  if p.status <> 'aguardando' then raise exception 'ENCERRAMENTO_PEDIDO: o pedido já está %.', p.status; end if;
  if p_usuario_id = p.solicitado_por then
    raise exception 'SEGREGACAO: quem pediu o encerramento não aprova o próprio pedido.';
  end if;
  if not exists (select 1 from fn_encp_aprovadores(p.atividade_id, p.solicitado_por) a where a = p_usuario_id) then
    raise exception 'NAO_E_SUA_VEZ: só o responsável ou o substituto ativo da atividade decide este pedido.';
  end if;
  if p_hash is distinct from fn_encp_hash(p.id) then
    raise exception 'DOCUMENTO_ALTERADO: o pedido, o contrato ou os produtos mudaram depois que você abriu. Recarregue e confira; se mudou, devolva para um novo pedido.';
  end if;
  select * into c from contratos where id = p.contrato_id for update;
  v_fmt := 'R$ ' || replace(replace(replace(to_char(p.valor_liberado_brl, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');

  if p_decisao = 'devolver' then
    if coalesce(length(btrim(p_parecer)), 0) < 10 then
      raise exception 'ENCERRAMENTO_PEDIDO: escreva o parecer para devolver (mínimo 10 caracteres).';
    end if;
    perform set_config('dima.encerramento', 'pedido', true);
    update contrato_encerramento_pedidos set status = 'devolvido', decidido_por = p_usuario_id, decidido_em = now(),
           parecer = btrim(p_parecer), hash_decisao = p_hash, senha_verificada_em = now(),
           ip = p_ip, user_agent = left(p_user_agent, 300)
     where id = p.id;
    perform set_config('dima.encerramento', '', true);
    perform fn_encp_fechar_tarefa(p.id, 'concluida', p_usuario_id, 'Pedido devolvido ao solicitante: ' || btrim(p_parecer));
    perform fn_encp_avisar(array[p.solicitado_por], 'tarefa_devolvida',
      'Encerramento do contrato ' || c.numero || ' devolvido', left(btrim(p_parecer), 200), c.id);
    return jsonb_build_object('status', 'devolvido');
  end if;

  perform set_config('dima.encerramento', 'efetivar', true);
  update contratos set status = 'encerrado' where id = c.id;
  update contratos_produtos set situacao = 'cancelado', atualizado_em = now()
   where id in (select (x->>'id')::uuid from jsonb_array_elements(p.produtos) x
                 where coalesce((x->>'valor_aprovado')::numeric, 0) <= 0);

  if p.valor_liberado_brl > 0 then
    select f.ptax_venda, f.data_cotacao into v_ptax, v_ptax_data from fn_cotacao_usd(null) f;
    v_usd := round(p.valor_liberado_brl / v_ptax, 2);
  end if;
  v_resp_termo := (select id from usuarios where id = p.solicitado_por and ativo and perfil in ('super_admin','coordenacao'));
  perform set_config('dima.encerramento_resp_termo', coalesce(v_resp_termo::text, ''), true);
  if p.termo_caminho is not null then
    perform set_config('dima.encerramento_sem_tarefa', '1', true);
  end if;
  insert into contrato_encerramentos (contrato_id, atividade_id, tipo, valor_liberado_brl, valor_liberado_usd,
         cotacao, cotacao_data, motivo, produtos_afetados, autorizado_por)
  values (c.id, p.atividade_id, 'encerramento_contrato', p.valor_liberado_brl, v_usd,
          v_ptax, v_ptax_data,
          p.motivo, p.produtos, p_usuario_id)
  returning id into v_enc;
  perform set_config('dima.encerramento_sem_tarefa', '', true);
  perform set_config('dima.encerramento_resp_termo', '', true);
  if p.termo_caminho is not null then
    insert into contrato_encerramento_documentos (encerramento_id, contrato_id, caminho, nome, sha256, tamanho, criado_por)
    values (v_enc, c.id, p.termo_caminho, p.termo_nome, p.termo_sha256, p.termo_tamanho, p.solicitado_por);
  end if;

  update contrato_encerramento_pedidos set status = 'aprovado', decidido_por = p_usuario_id, decidido_em = now(),
         parecer = nullif(btrim(p_parecer), ''), hash_decisao = p_hash, senha_verificada_em = now(),
         ip = p_ip, user_agent = left(p_user_agent, 300), encerramento_id = v_enc
   where id = p.id;
  perform set_config('dima.encerramento', '', true);
  perform fn_encp_fechar_tarefa(p.id, 'concluida', p_usuario_id,
    'Encerramento aprovado com senha. ' || v_fmt || ' devolvido(s) à atividade.'
    || coalesce(' Parecer: ' || nullif(btrim(p_parecer), ''), ''));

  select array_agg(distinct u) into v_avis from (
    select p.solicitado_por as u
    union select a from fn_encp_aprovadores(p.atividade_id, p_usuario_id) a) x;
  perform fn_encp_avisar(v_avis, 'tarefa_concluida', 'Contrato ' || c.numero || ' encerrado',
    'Aprovado pelo responsável. ' || v_fmt || ' voltam à atividade.', c.id);
  return jsonb_build_object('status', 'aprovado', 'encerramento_id', v_enc, 'valor_liberado_usd', v_usd);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_encp_fechar_tarefa(p_pedido uuid, p_status text, p_autor uuid, p_texto text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t tarefas%rowtype;
begin
  select t.* into v_t from tarefas t join contrato_encerramento_pedidos p on p.tarefa_id = t.id where p.id = p_pedido;
  if v_t.id is null or v_t.status in ('concluida','cancelada') then return; end if;
  perform set_config('dima.tarefa_status_rpc', '1', true);
  update tarefas set status = p_status::status_tarefa,
         dt_conclusao = case when p_status = 'concluida' then now() else dt_conclusao end
   where id = v_t.id;
  perform set_config('dima.tarefa_status_rpc', '', true);
  insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem) values (v_t.id, p_autor, p_texto, 'painel');
  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para, motivo)
    values (v_t.id, p_autor, case when p_status = 'concluida' then 'conclusao' else 'cancelamento' end,
            v_t.status::text, p_status, left(p_texto, 500));
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_encp_hash(p_pedido uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'pedido', p.id, 'motivo', p.motivo, 'valor', p.valor_liberado_brl, 'produtos', p.produtos,
    'termo', p.termo_sha256,
    'contrato', jsonb_build_object('status', c.status, 'atividade_id', c.atividade_id, 'valor_total_brl', c.valor_total_brl),
    'vivos', coalesce((select jsonb_agg(jsonb_build_object('id', cp.id, 'situacao', cp.situacao,
                                        'valor_brl', cp.valor_brl, 'valor_aprovado', cp.valor_aprovado) order by cp.id)
                         from public.contratos_produtos cp
                        where cp.id in (select (x->>'id')::uuid from jsonb_array_elements(p.produtos) x)), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.contrato_encerramento_pedidos p join public.contratos c on c.id = p.contrato_id
  where p.id = p_pedido
    and (auth.uid() is null or public.fn_encp_ve_contrato(p.contrato_id))
$function$
;

CREATE OR REPLACE FUNCTION public.fn_encp_pedir(p_contrato uuid, p_produtos uuid[], p_motivo text, p_termo jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  c       contratos%rowtype;
  v_cod   text;
  v_forn  text;
  v_snap  jsonb;
  v_valor numeric;
  v_n     integer;
  v_aprov uuid[];
  v_id    uuid;
  v_tar   uuid;
  v_fmt   text;
begin
  if not exists (select 1 from usuarios where id = v_uid and ativo and perfil in ('super_admin','coordenacao','financeiro')) then
    raise exception 'ENCERRAMENTO_PEDIDO: só super_admin, coordenação ou financeiro pedem o encerramento do contrato.';
  end if;
  select * into c from contratos where id = p_contrato for update;
  if c.id is null then raise exception 'ENCERRAMENTO_PEDIDO: contrato não encontrado.'; end if;
  if c.status not in ('vigente','suspenso') then
    raise exception 'ENCERRAMENTO_PEDIDO: o contrato % está % — só se pede o encerramento de contrato vigente ou suspenso.', c.numero, c.status;
  end if;
  if c.atividade_id is null then
    raise exception 'ENCERRAMENTO_PEDIDO: o contrato % não tem atividade — vincule a atividade antes de pedir o encerramento.', c.numero;
  end if;
  select codigo into v_cod from atividades where id = c.atividade_id;
  if not exists (select 1 from atividade_responsaveis ar join usuarios u on u.id = ar.usuario_id and u.ativo
                  where ar.atividade_id = c.atividade_id and ar.ativo and ar.papel = 'responsavel') then
    raise exception 'SEM_RESPONSAVEL: a atividade % não tem responsável ativo. Designe o responsável em Atividades antes de pedir o encerramento.', v_cod;
  end if;
  select array_agg(a) into v_aprov from fn_encp_aprovadores(c.atividade_id, v_uid) a;
  if v_aprov is null then
    raise exception 'SEM_APROVADOR: você é o único responsável/substituto da atividade % e não pode aprovar o próprio pedido. Designe um substituto ou peça a outra pessoa da coordenação.', v_cod;
  end if;
  if exists (select 1 from contrato_encerramento_pedidos where contrato_id = c.id and status = 'aguardando') then
    raise exception 'ENCERRAMENTO_PEDIDO: já existe um pedido de encerramento aguardando o responsável para este contrato.';
  end if;
  if coalesce(length(btrim(p_motivo)), 0) < 20 then
    raise exception 'ENCERRAMENTO_PEDIDO: descreva a justificativa (mínimo 20 caracteres).';
  end if;

  p_produtos := coalesce(p_produtos, '{}');
  select count(*) into v_n from contratos_produtos
   where id = any(p_produtos) and contrato_id = c.id
     and situacao in ('pendente','em_analise','entrega_parcial','devolvido');
  if v_n <> coalesce(array_length(p_produtos, 1), 0) then
    raise exception 'ENCERRAMENTO_PEDIDO: há produto escolhido que não é deste contrato ou que não está em aberto. Recarregue a tela.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', cp.id, 'numero_produto', cp.numero_produto, 'descricao', cp.descricao,
           'valor_brl', coalesce(cp.valor_brl, 0), 'valor_aprovado', coalesce(cp.valor_aprovado, 0),
           'valor_nao_executado', greatest(0, coalesce(cp.valor_brl, 0) - coalesce(cp.valor_aprovado, 0)),
           'situacao_anterior', cp.situacao) order by cp.numero_produto), '[]'::jsonb),
         coalesce(sum(greatest(0, coalesce(cp.valor_brl, 0) - coalesce(cp.valor_aprovado, 0))), 0)
    into v_snap, v_valor
    from contratos_produtos cp where cp.id = any(p_produtos);

  if p_termo is not null and nullif(p_termo->>'caminho', '') is not null then
    if not exists (select 1 from usuarios where id = v_uid and ativo and perfil in ('super_admin','coordenacao')) then
      raise exception 'ENCERRAMENTO_PEDIDO: só coordenação ou super_admin anexam o termo de encerramento.';
    end if;
    if (p_termo->>'caminho') not like 'encerramentos/' || c.id || '/%' or (p_termo->>'caminho') like '%..%' then
      raise exception 'ENCERRAMENTO_PEDIDO: caminho do termo fora da pasta do contrato.';
    end if;
    if lower(coalesce(p_termo->>'nome', '')) not like '%.pdf' then
      raise exception 'ENCERRAMENTO_PEDIDO: o termo deve ser PDF.';
    end if;
    if lower(coalesce(p_termo->>'sha256', '')) !~ '^[0-9a-f]{64}$' then
      raise exception 'ENCERRAMENTO_PEDIDO: impressão digital (SHA-256) do termo inválida.';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'contratos-docs' and name = p_termo->>'caminho') then
      raise exception 'ENCERRAMENTO_PEDIDO: termo não encontrado no armazenamento — envie de novo.';
    end if;
  else
    p_termo := null;
  end if;

  insert into contrato_encerramento_pedidos (contrato_id, atividade_id, motivo, produtos, valor_liberado_brl,
         termo_caminho, termo_nome, termo_sha256, termo_tamanho, solicitado_por)
  values (c.id, c.atividade_id, btrim(p_motivo), v_snap, round(v_valor, 2),
          p_termo->>'caminho', left(p_termo->>'nome', 200), lower(p_termo->>'sha256'),
          nullif(p_termo->>'tamanho', '')::bigint, v_uid)
  returning id into v_id;

  select nome into v_forn from fornecedores where id = c.fornecedor_id;
  v_fmt := 'R$ ' || replace(replace(replace(to_char(round(v_valor, 2), 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');
  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo, entidade_tipo, entidade_id,
                       atividade_id, criado_por, tipo)
  values ('Aprovar encerramento do contrato ' || c.numero,
          'Pedido de encerramento do contrato ' || c.numero || coalesce(' (' || v_forn || ')', '')
            || ' com ' || jsonb_array_length(v_snap) || ' produto(s) cancelado(s) e ' || v_fmt
            || ' devolvido(s) à atividade ' || v_cod || '. Justificativa: ' || btrim(p_motivo)
            || E'\n\nAprove ou devolva em Contratos › contrato ' || c.numero
            || ' › Detalhes e documentos › Encerramento (pede a senha de login). Aprovam o responsável ou o substituto da atividade.',
          'alta', current_date, current_date + 5, 'contrato_encerramento_pedido', v_id,
          c.atividade_id, v_uid, 'outras')
  returning id into v_tar;
  insert into tarefa_participantes (tarefa_id, usuario_id, papel)
    select v_tar, a, 'responsavel' from unnest(v_aprov) a
    on conflict (tarefa_id, usuario_id) do nothing;
  if c.tdr_id is not null and exists (select 1 from tdrs where id = c.tdr_id and atividade_id = c.atividade_id) then
    insert into tarefa_tdrs (tarefa_id, tdr_id) values (v_tar, c.tdr_id) on conflict do nothing;
  end if;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (v_tar, v_uid, 'criacao', 'Criada pelo sistema no pedido de encerramento do contrato ' || c.numero);
  perform set_config('dima.encerramento', 'pedido', true);
  update contrato_encerramento_pedidos set tarefa_id = v_tar where id = v_id;
  perform set_config('dima.encerramento', '', true);
  perform fn_tarefa_notificar(v_aprov, 'tarefa_atribuida',
    'Aprovar encerramento do contrato ' || c.numero, v_fmt || ' voltam à atividade ' || v_cod, v_tar, v_uid);

  return jsonb_build_object('id', v_id, 'tarefa_id', v_tar, 'valor_liberado_brl', round(v_valor, 2),
                            'aprovadores', jsonb_array_length(to_jsonb(v_aprov)));
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_encp_pode_decidir(p_pedido uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select p.status = 'aguardando'
                      and exists (select 1 from public.fn_encp_aprovadores(p.atividade_id, p.solicitado_por) a
                                   where a = auth.uid())
                     from public.contrato_encerramento_pedidos p where p.id = p_pedido), false)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_encp_ve_contrato(p_contrato uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.usuarios u where u.id = auth.uid() and u.ativo
                  and u.perfil in ('super_admin','coordenacao','financeiro'))
      or public.tem_permissao('contratos')
      or exists (select 1 from public.contratos c join public.atividade_responsaveis ar
                   on ar.atividade_id = c.atividade_id and ar.usuario_id = auth.uid() and ar.ativo
                  where c.id = p_contrato)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_entrega_aprovada(p_entrega_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.contratos_produtos_entregas e
    where e.id = p_entrega_id and e.situacao = 'aprovada'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.fn_entregas_docs_pode_enviar(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.contratos_produtos cp
     where cp.id = public.fn_produto_id_do_path(p_name)
       and (public.fn_pode_registrar_entrega(cp.contrato_id)
            or (public.fn_perfil_atual() in ('super_admin','coordenacao','financeiro')
                and not public.fn_eh_fornecedor_do_contrato(cp.contrato_id))));
$function$
;

CREATE OR REPLACE FUNCTION public.fn_financeiro_viajante()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_total_pass  numeric(14,2);
  v_total_diar  numeric(14,2);
  v_total       numeric(14,2);
  v_cotacao     numeric(10,4);
  v_valor_usd   numeric(14,2);
  v_lanc_id     uuid;
  v_prot        record;
  v_descricao   text;
BEGIN
  -- Buscar dados do protocolo
  SELECT * INTO v_prot FROM public.viagem_protocolos WHERE id = NEW.protocolo_id;

  -- ── APROVAÇÃO: cria lançamento a_pagar ──────────────────────────
  IF (NEW.sit_passagem = 'aprovado' OR NEW.sit_diaria = 'aprovado') AND
     (OLD.sit_passagem IS DISTINCT FROM 'aprovado' OR OLD.sit_diaria IS DISTINCT FROM 'aprovado') AND
     NEW.lancamento_id IS NULL
  THEN
    SELECT COALESCE(SUM(valor),0) INTO v_total_pass
    FROM public.viagem_trechos WHERE viajante_id = NEW.id;

    SELECT COALESCE(SUM(quantidade * valor_unitario),0) INTO v_total_diar
    FROM public.viagem_diarias_v2 WHERE viajante_id = NEW.id;

    v_total := v_total_pass + v_total_diar;
    IF v_total <= 0 THEN RETURN NEW; END IF;

    SELECT cotacao INTO v_cotacao FROM public.cotacoes_usd
    ORDER BY data_ref DESC, criado_em DESC LIMIT 1;
    v_cotacao := COALESCE(v_cotacao, 5.87);
    v_valor_usd := ROUND(v_total / v_cotacao, 2);

    v_descricao := COALESCE(v_prot.numero,'') ||
      ' — ' || NEW.nome ||
      ' (' || COALESCE(v_prot.destino_principal,'') || ')';

    INSERT INTO public.execucao_financeira (
      atividade_id, descricao, valor_brl, valor_usd,
      cotacao_uso, cotacao_travada_em,
      dt_vencimento, situacao, elemento_despesa, criado_por
    ) VALUES (
      v_prot.atividade_id, v_descricao, v_total, v_valor_usd,
      v_cotacao, now(),
      COALESCE(v_prot.dt_retorno, CURRENT_DATE),
      'a_pagar', '33903', v_prot.criado_por
    ) RETURNING id INTO v_lanc_id;

    NEW.lancamento_id := v_lanc_id;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_vincular_usuario(p_fornecedor_id uuid, p_usuario_id uuid, p_ativo boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if not exists (select 1 from public.usuarios u where u.id = auth.uid() and u.ativo and u.perfil = 'super_admin') then
    raise exception 'FORNECEDOR_VINCULO_NEGADO: só o super_admin vincula usuário a fornecedor.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fornecedores f where f.id = p_fornecedor_id) then
    raise exception 'FORNECEDOR_INEXISTENTE';
  end if;
  if not exists (select 1 from public.usuarios u where u.id = p_usuario_id) then
    raise exception 'USUARIO_INEXISTENTE';
  end if;
  if coalesce(p_ativo, true) then
    insert into public.fornecedor_usuarios (fornecedor_id, usuario_id, ativo, vinculado_por, vinculado_em)
    values (p_fornecedor_id, p_usuario_id, true, auth.uid(), now())
    on conflict (fornecedor_id, usuario_id) do update
      set ativo = true, vinculado_por = auth.uid(), vinculado_em = now(),
          desvinculado_por = null, desvinculado_em = null, atualizado_em = now()
      where public.fornecedor_usuarios.ativo is distinct from true
    returning id into v_id;
  else
    update public.fornecedor_usuarios
       set ativo = false, desvinculado_por = auth.uid(), desvinculado_em = now(), atualizado_em = now()
     where fornecedor_id = p_fornecedor_id and usuario_id = p_usuario_id and ativo
    returning id into v_id;
  end if;
  return coalesce(v_id, (select id from public.fornecedor_usuarios
                          where fornecedor_id = p_fornecedor_id and usuario_id = p_usuario_id));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_fornecedores_diretorio()
 RETURNS TABLE(id uuid, nome text, tipo character varying, ativo boolean, tem_email boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select f.id, f.nome, f.tipo, f.ativo, nullif(trim(f.email), '') is not null
    from public.fornecedores f
   where public.fn_perfil_atual() is not null
   order by f.nome;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_gerar_lancamento_entrega()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cotacao      numeric(10,4);
  v_valor_usd    numeric(14,2);
  v_lanc_id      uuid;
  v_contrato     record;
  v_produto      record;
  v_desp_num     text;
BEGIN
  -- Só age quando situacao muda para 'aprovada' e ainda não tem lancamento_id
  IF NEW.situacao = 'aprovada'
     AND (OLD.situacao IS DISTINCT FROM 'aprovada')
     AND NEW.lancamento_id IS NULL
  THEN
    -- Buscar cotação atual
    SELECT cotacao INTO v_cotacao
    FROM public.cotacoes_usd
    ORDER BY data_ref DESC, criado_em DESC LIMIT 1;
    v_cotacao := COALESCE(v_cotacao, 5.87);

    v_valor_usd := ROUND(NEW.valor_entregue / v_cotacao, 2);

    -- Dados do produto e contrato
    SELECT * INTO v_produto  FROM public.contratos_produtos WHERE id = NEW.produto_id;
    SELECT * INTO v_contrato FROM public.contratos           WHERE id = NEW.contrato_id;

    -- Gerar descrição
    v_desp_num := COALESCE(NEW.despacho_numero, '');

    -- Inserir lançamento
    INSERT INTO public.execucao_financeira (
      contrato_id, fornecedor_id, atividade_id,
      descricao, numero_produto,
      valor_brl, valor_usd, cotacao_uso, cotacao_travada_em,
      dt_vencimento, situacao,
      elemento_despesa, observacoes,
      criado_por
    ) VALUES (
      NEW.contrato_id,
      v_contrato.fornecedor_id,
      v_contrato.atividade_id,
      v_produto.descricao ||
        CASE WHEN NEW.pct_entregue < 100
          THEN ' — Entrega ' || NEW.numero_entrega || ' (' || NEW.pct_entregue || '%)'
          ELSE ' — Entrega ' || NEW.numero_entrega
        END ||
        CASE WHEN v_desp_num <> '' THEN ' · ' || v_desp_num ELSE '' END,
      v_produto.numero_produto,
      NEW.valor_entregue,
      v_valor_usd,
      v_cotacao,
      now(),                    -- cotação já travada na criação
      v_produto.dt_vencimento,
      'a_pagar',                -- pronto para pagamento, mas ainda não pago
      v_contrato.elemento_despesa,
      NEW.despacho_texto,
      NEW.despachado_por
    ) RETURNING id INTO v_lanc_id;

    -- Vincular lancamento_id na entrega
    NEW.lancamento_id := v_lanc_id;

  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_gerar_numero_protocolo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ano  integer := EXTRACT(YEAR FROM now())::integer;
  v_seq  integer;
BEGIN
  INSERT INTO public.viagem_protocolo_seq_ano (ano, ultimo)
  VALUES (v_ano, 1)
  ON CONFLICT (ano) DO UPDATE
    SET ultimo = viagem_protocolo_seq_ano.ultimo + 1
  RETURNING ultimo INTO v_seq;

  NEW.numero := 'VGM-' || v_ano || '-' || LPAD(v_seq::text, 3, '0');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_hist_fmt(p_tipo text, p_valor text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_valor is null or p_valor = '' then '—'
    when p_tipo = 'date' and p_valor ~ '^\d{4}-\d{2}-\d{2}$'
      then to_char(p_valor::date, 'DD/MM/YYYY')
    when p_tipo = 'datetime' and p_valor ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
      then to_char(p_valor::date, 'DD/MM/YYYY') || ' ' || substr(p_valor, 12, 5)
    when p_tipo = 'boolean' then case when p_valor in ('true','t') then 'Sim' else 'Não' end
    when p_tipo = 'prioridade' then case p_valor
      when 'baixa' then 'Baixa' when 'media' then 'Média' when 'alta' then 'Alta' when 'urgente' then 'Urgente' else p_valor end
    else p_valor end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_hoje_acre()
 RETURNS date
 LANGUAGE sql
 STABLE
AS $function$
  select (now() at time zone 'America/Rio_Branco')::date
$function$
;

CREATE OR REPLACE FUNCTION public.fn_lancar_viagem_financeiro()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_total_pass   numeric(14,2);
  v_total_diar   numeric(14,2);
  v_total        numeric(14,2);
  v_cotacao      numeric(10,4);
  v_valor_usd    numeric(14,2);
  v_lanc_id      uuid;
  v_descricao    text;
BEGIN
  -- Lança quando situacao muda para 'concluido'
  IF NEW.situacao = 'concluido' AND OLD.situacao IS DISTINCT FROM 'concluido' THEN

    SELECT COALESCE(SUM(valor), 0) INTO v_total_pass
    FROM public.viagem_passagens WHERE viagem_id = NEW.id;

    SELECT COALESCE(SUM(quantidade * valor_unitario), 0) INTO v_total_diar
    FROM public.viagem_diarias WHERE viagem_id = NEW.id;

    v_total := v_total_pass + v_total_diar;
    IF v_total <= 0 THEN RETURN NEW; END IF;

    SELECT cotacao INTO v_cotacao FROM public.cotacoes_usd
    ORDER BY data_ref DESC, criado_em DESC LIMIT 1;
    v_cotacao   := COALESCE(v_cotacao, 5.87);
    v_valor_usd := ROUND(v_total / v_cotacao, 2);

    v_descricao := 'SPD ' ||
      COALESCE(NULLIF(NEW.spd_passagem,'') || '/' || NULLIF(NEW.spd_diaria,''), NEW.numero_spd, '') ||
      ' — ' || COALESCE(NEW.beneficiario_nome,'') ||
      ' (' || COALESCE(NEW.origem,'') || ' → ' || COALESCE(NEW.destino,'') || ')';

    IF NEW.lancamento_id IS NOT NULL THEN
      UPDATE public.execucao_financeira SET
        descricao    = v_descricao,
        valor_brl    = v_total,
        valor_usd    = v_valor_usd,
        situacao     = 'pago',
        dt_pagamento = COALESCE(NEW.dt_retorno, CURRENT_DATE),
        atualizado_em = now()
      WHERE id = NEW.lancamento_id;
    ELSE
      INSERT INTO public.execucao_financeira (
        atividade_id, descricao, valor_brl, valor_usd,
        cotacao_uso, cotacao_travada_em,
        dt_vencimento, situacao, elemento_despesa, criado_por
      ) VALUES (
        NEW.atividade_id, v_descricao, v_total, v_valor_usd,
        v_cotacao, now(),
        COALESCE(NEW.dt_retorno, CURRENT_DATE),
        'pago', '33903', NEW.criado_por
      ) RETURNING id INTO v_lanc_id;
      NEW.lancamento_id := v_lanc_id;
    END IF;

  ELSIF NEW.situacao = 'cancelado' AND NEW.lancamento_id IS NOT NULL THEN
    UPDATE public.execucao_financeira
    SET situacao = 'cancelado', atualizado_em = now()
    WHERE id = NEW.lancamento_id;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_lgpd_conferir_tabelas()
 RETURNS TABLE(codigo text, tabela text, ordem integer, existe boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.usuarios u
                 where u.id = auth.uid() and u.ativo
                   and u.perfil in ('super_admin','coordenacao')) then
    raise exception 'lgpd:sem_acesso' using errcode = '42501';
  end if;

  return query
  select t.codigo, x.tab, x.ord::integer,
         case
           when x.tab like 'storage:%' then
             exists (select 1 from storage.buckets b where b.id = substr(x.tab, 9))
           when position('.' in x.tab) > 0 then to_regclass(x.tab) is not null
           else to_regclass('public.' || x.tab) is not null
         end
  from public.lgpd_tratamentos t
  cross join lateral unnest(t.tabelas) with ordinality as x(tab, ord)
  where t.ativo
  order by t.codigo, x.ord;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_lgpd_trat_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.atualizado_em := now(); return new; end $function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_classe(p_modalidade text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_modalidade
    when 'Pregão Eletrônico'      then 'aberta'
    when 'Concorrência'           then 'aberta'
    when 'Carta-Convite'          then 'convite'
    when 'Cotação/Shopping (ONU)' then 'cotacao'
    when 'Dispensa de Licitação'  then 'dispensa'
    when 'Inexigibilidade'        then 'inexigibilidade'
    else 'outra' end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_criar_tarefa(p_rodada uuid, p_tipo text, p_prazo date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_editar(p_rodada uuid, p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_enviar(p_tdr uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if v_prazo is null then
    v_tar := fn_lic_criar_tarefa(v_id, 'resultado', current_date + 15);
  end if;
  return jsonb_build_object('rodada_id', v_id, 'rodada', v_rod, 'tarefa_id', v_tar);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_fechar_tarefa(p_tarefa uuid, p_status text, p_autor uuid, p_texto text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_gravar_empresas(p_rodada uuid, p_empresas jsonb, p_uid uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_pessoas(p_rodada uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(distinct x), '{}') from (
    select ar.usuario_id as x from tdr_licitacao_rodadas r join tdrs t on t.id = r.tdr_id
      join atividade_responsaveis ar on ar.atividade_id = t.atividade_id and ar.ativo and ar.papel in ('responsavel','substituto')
      join usuarios u on u.id = ar.usuario_id and u.ativo
     where r.id = p_rodada
    union
    select r.aberta_por from tdr_licitacao_rodadas r join usuarios u on u.id = r.aberta_por and u.ativo where r.id = p_rodada
  ) z where x is not null
$function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_pode(p_tdr uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from usuarios u where u.id = auth.uid() and u.ativo and u.perfil in ('super_admin','coordenacao'))
      or exists (select 1 from tdrs t join atividade_responsaveis ar on ar.atividade_id = t.atividade_id
                  join usuarios u on u.id = ar.usuario_id and u.ativo
                 where t.id = p_tdr and ar.usuario_id = auth.uid() and ar.ativo
                   and ar.papel in ('responsavel','substituto'))
$function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_prorrogar(p_rodada uuid, p_prazo timestamp with time zone, p_motivo text, p_aviso_url text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_relancar(p_rodada uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_resultado(p_rodada uuid, p_situacao text, p_n integer, p_empresas uuid[], p_novas jsonb, p_obs text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_rotina()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r tdr_licitacao_rodadas%rowtype; t tdrs%rowtype; u uuid; v_n integer := 0;
begin
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
  for r in select * from tdr_licitacao_rodadas where situacao = 'aberta' and prazo_em is not null
             and prazo_em <= now() and tarefa_resultado_id is null loop
    perform fn_lic_criar_tarefa(r.id, 'resultado', current_date + 5);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_lic_validar(p_modalidade text, p jsonb, p_n_empresas integer, p_exige_prazo boolean)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_mapa_pode_editar(p_entrega_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
           select 1 from public.usuarios u
            where u.id = auth.uid() and u.ativo and u.perfil in ('super_admin','coordenacao')
         )
      or (p_entrega_id is not null and exists (
           select 1 from public.contratos_produtos_entregas e
            where e.id = p_entrega_id
              and (public.fn_pode_avaliar_contrato(public.fn_contrato_da_entrega(e.produto_id, e.contrato_id))
                   or (e.criado_por = auth.uid() and e.situacao in ('pendente','em_analise')
                       and public.fn_pode_registrar_entrega(public.fn_contrato_da_entrega(e.produto_id, e.contrato_id))))
         ));
$function$
;

CREATE OR REPLACE FUNCTION public.fn_mascara_doc(p_doc text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_doc is null or btrim(p_doc) = '' then null
    else (
      select string_agg(
               case
                 when length(d) = 11 then '***.***.***-'      || right(d, 2)
                 when length(d) = 14 then '**.***.***/****-'  || right(d, 2)
                 when length(d) >= 3 then repeat('*', length(d) - 2) || right(d, 2)
                 else '***'
               end, ', ' order by ord)
      from (
        select regexp_replace(t, '\D', '', 'g') as d, ord
        from unnest(string_to_array(p_doc, ',')) with ordinality as u(t, ord)
      ) x
      where d <> ''
    )
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_mudar_status_tarefa(p_tarefa_id uuid, p_status status_tarefa, p_nota text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller  uuid := auth.uid();
  v_t       tarefas%rowtype;
  v_de      status_tarefa;
  v_nota    text := nullif(btrim(coalesce(p_nota, '')), '');
  v_aprov   boolean;
  v_pend    int;
  v_tipo    text;
  v_prefixo text;
  v_coment  uuid;
  v_alvo    uuid[];
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão para alterar esta tarefa';
  end if;
  select * into v_t from tarefas where id = p_tarefa_id;
  if v_t.id is null then raise exception 'tarefa não encontrada'; end if;
  v_de := v_t.status;
  if v_de = p_status then return null; end if;

  v_aprov := fn_tarefa_aprovador(p_tarefa_id);
  select count(*) into v_pend from tarefa_checklist where tarefa_id = p_tarefa_id and not concluida;

  if p_status = 'concluida' then
    if not v_aprov then
      raise exception 'Só quem criou a tarefa conclui. Use "Enviar para revisão".';
    end if;
    if v_pend > 0 then
      raise exception 'Há % subtarefa(s) pendente(s). Conclua-as antes de concluir a tarefa.', v_pend;
    end if;
    if v_de = 'em_revisao' then
      v_tipo := 'aprovacao'; v_prefixo := 'Entrega aprovada';
    else
      if v_nota is null then raise exception 'Descreva o que foi feito para concluir a tarefa.'; end if;
      v_tipo := 'conclusao'; v_prefixo := 'Conclusão';
    end if;

  elsif p_status = 'em_revisao' then
    if v_de = 'concluida' then raise exception 'Reabra a tarefa antes de enviá-la para revisão.'; end if;
    if v_pend > 0 then
      raise exception 'Há % subtarefa(s) pendente(s). Conclua-as antes de enviar para revisão.', v_pend;
    end if;
    if v_nota is null then raise exception 'Descreva a entrega: o que foi feito e onde está a evidência.'; end if;
    v_tipo := 'envio_revisao'; v_prefixo := 'Entrega para revisão';

  elsif v_de = 'concluida' then
    if not v_aprov then raise exception 'Só quem criou a tarefa pode reabri-la.'; end if;
    if v_nota is null then raise exception 'Informe o motivo da reabertura.'; end if;
    v_tipo := 'reabertura'; v_prefixo := 'Reaberta';

  elsif v_de = 'em_revisao' and p_status <> 'cancelada' and v_aprov then
    if v_nota is null then raise exception 'Informe o motivo da devolução.'; end if;
    v_tipo := 'devolucao'; v_prefixo := 'Devolvida';

  else
    v_tipo := 'status'; v_prefixo := null;
  end if;

  perform set_config('dima.tarefa_status_rpc', '1', true);
  update tarefas set status = p_status,
    dt_conclusao = case when p_status = 'concluida' then now() else null end
  where id = p_tarefa_id;
  perform set_config('dima.tarefa_status_rpc', '', true);

  if v_nota is not null and v_prefixo is not null then
    insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem)
    values (p_tarefa_id, v_caller, v_prefixo || ': ' || v_nota, 'painel')
    returning id into v_coment;
  end if;

  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para, motivo)
  values (p_tarefa_id, v_caller, v_tipo, v_de::text, p_status::text, v_nota);

  if p_status = 'concluida' then
    select array_agg(uid) into v_alvo from (
      select v_t.criado_por uid
      union select usuario_id from tarefa_participantes where tarefa_id = p_tarefa_id
    ) s;
    perform fn_tarefa_notificar(v_alvo, 'tarefa_concluida',
      'Tarefa concluída: ' || coalesce(v_t.codigo,''), coalesce(v_t.titulo,''), p_tarefa_id, v_caller);
  elsif v_tipo = 'envio_revisao' then
    perform fn_tarefa_notificar(array[v_t.criado_por], 'tarefa_revisao',
      'Aguardando sua aprovação: ' || coalesce(v_t.codigo,''), left(v_nota, 120), p_tarefa_id, v_caller);
  elsif v_tipo in ('devolucao', 'reabertura') then
    select array_agg(usuario_id) into v_alvo from tarefa_participantes
    where tarefa_id = p_tarefa_id and papel = 'responsavel';
    perform fn_tarefa_notificar(v_alvo,
      case when v_tipo = 'devolucao' then 'tarefa_devolvida' else 'tarefa_reaberta' end,
      (case when v_tipo = 'devolucao' then 'Entrega devolvida: ' else 'Tarefa reaberta: ' end) || coalesce(v_t.codigo,''),
      left(v_nota, 120), p_tarefa_id, v_caller);
  end if;

  return v_coment;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_notificar_avaliacao_produto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_atividade_id uuid;
  v_ativ_codigo  text;
  v_produto_desc text;
  v_produto_num  integer;
  v_cont_numero  text;
  v_forn_id      uuid;
  v_forn_nome    text;
  v_pelo_forn    boolean := false;
  v_titulo       text;
  v_mensagem     text;
  v_link         text;
  v_uid          record;
  v_notificados  uuid[] := '{}';
begin
  if not (
    (tg_op = 'INSERT' and new.situacao = 'em_analise')
    or (tg_op = 'UPDATE' and new.situacao = 'em_analise' and old.situacao is distinct from 'em_analise')
  ) then
    return new;
  end if;
  select cp.descricao, cp.numero_produto, c.numero, c.atividade_id, a.codigo, c.fornecedor_id, f.nome
  into v_produto_desc, v_produto_num, v_cont_numero, v_atividade_id, v_ativ_codigo, v_forn_id, v_forn_nome
  from public.contratos_produtos cp
  join public.contratos c on c.id = cp.contrato_id
  left join public.atividades a on a.id = c.atividade_id
  left join public.fornecedores f on f.id = c.fornecedor_id
  where cp.id = new.produto_id;
  if new.criado_por is not null then
    select exists (select 1 from public.fornecedor_usuarios fu
                    where fu.fornecedor_id = v_forn_id and fu.usuario_id = new.criado_por and fu.ativo)
      into v_pelo_forn;
    if v_pelo_forn then v_notificados := v_notificados || new.criado_por; end if;
  end if;
  v_titulo   := 'Produto aguardando avaliação — ' || coalesce(v_ativ_codigo,'');
  v_mensagem := 'Produto ' || coalesce(v_produto_num::text,'') ||
                ' — ' || coalesce(v_produto_desc,'') ||
                ' (Contrato ' || coalesce(v_cont_numero,'') || ') foi entregue' ||
                case when v_pelo_forn then ' pelo fornecedor ' || coalesce(v_forn_nome,'') else '' end ||
                ' e aguarda seu parecer.';
  v_link     := 'produtos.html?entrega=' || new.id;
  if v_atividade_id is not null then
    for v_uid in
      select ar.usuario_id
      from public.atividade_responsaveis ar
      join public.usuarios u on u.id = ar.usuario_id and u.ativo
      where ar.atividade_id = v_atividade_id
        and ar.ativo = true
        and ar.papel in ('responsavel','substituto')
        and ar.usuario_id <> all(v_notificados)
    loop
      insert into public.notificacoes
        (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      values
        (v_uid.usuario_id, 'produto_para_avaliar', v_titulo, v_mensagem, false,
         v_link, 'contratos_produtos_entregas', new.id);
      v_notificados := v_notificados || v_uid.usuario_id;
    end loop;
  end if;
  for v_uid in
    select u.id from public.usuarios u
    where u.perfil = 'super_admin' and u.ativo = true
      and u.id <> all(v_notificados)
  loop
    insert into public.notificacoes
      (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    values
      (v_uid.id, 'produto_para_avaliar', v_titulo, v_mensagem, false,
       v_link, 'contratos_produtos_entregas', new.id);
  end loop;
  if new.criado_por is not null then
    update public.notificacoes
    set lida = true, lida_em = now()
    where usuario_id = new.criado_por
      and tipo = 'produto_devolvido'
      and lida = false
      and entidade_id in (
        select e.id from public.contratos_produtos_entregas e
        where e.produto_id = new.produto_id
          and e.situacao = 'devolvida'
          and e.criado_por = new.criado_por
      );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_notificar_despacho_produto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_produto_desc text;
  v_produto_num  integer;
  v_cont_numero  text;
  v_ativ_codigo  text;
  v_titulo       text;
  v_mensagem     text;
  v_uid          record;
  v_notificados  uuid[] := '{}';
BEGIN
  IF NOT (OLD.situacao = 'em_analise' AND NEW.situacao IN ('aprovada','devolvida')) THEN
    RETURN NEW;
  END IF;

  SELECT cp.descricao, cp.numero_produto, c.numero, a.codigo
  INTO v_produto_desc, v_produto_num, v_cont_numero, v_ativ_codigo
  FROM contratos_produtos cp
  JOIN contratos c ON c.id = cp.contrato_id
  LEFT JOIN atividades a ON a.id = c.atividade_id
  WHERE cp.id = NEW.produto_id;

  -- Dismiss todas as notificações produto_para_avaliar desta entrega
  UPDATE notificacoes
  SET lida = true, lida_em = now()
  WHERE entidade_id = NEW.id
    AND tipo = 'produto_para_avaliar'
    AND lida = false;

  -- Notificar o consultor que entregou
  IF NEW.criado_por IS NOT NULL THEN
    IF NEW.situacao = 'aprovada' THEN
      INSERT INTO notificacoes
        (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      VALUES (
        NEW.criado_por,
        'produto_aprovado',
        'Produto aprovado — ' || COALESCE(v_ativ_codigo,''),
        'Produto ' || COALESCE(v_produto_num::text,'') ||
          ' — ' || COALESCE(SUBSTRING(v_produto_desc FOR 80),'') ||
          ' (Contrato ' || COALESCE(v_cont_numero,'') || ') foi aprovado.',
        false, 'produtos.html', 'contratos_produtos_entregas', NEW.id
      );
    ELSE
      INSERT INTO notificacoes
        (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      VALUES (
        NEW.criado_por,
        'produto_devolvido',
        'Produto devolvido — ' || COALESCE(v_ativ_codigo,''),
        'Produto ' || COALESCE(v_produto_num::text,'') ||
          ' — ' || COALESCE(SUBSTRING(v_produto_desc FOR 80),'') ||
          ' foi devolvido para correção' ||
          CASE WHEN NEW.despacho_texto IS NOT NULL
               THEN '. Motivo: ' || SUBSTRING(NEW.despacho_texto FOR 200)
               ELSE '.' END,
        false, 'produtos.html', 'contratos_produtos_entregas', NEW.id
      );
    END IF;
  END IF;

  -- Quando aprovado: notificar financeiro e super_admin sobre pagamento pendente
  IF NEW.situacao = 'aprovada' THEN
    FOR v_uid IN
      SELECT id FROM usuarios
      WHERE perfil IN ('financeiro','super_admin')
        AND ativo = true
    LOOP
      -- Evitar notificar o próprio consultor duas vezes se ele for financeiro/super_admin
      IF v_uid.id <> COALESCE(NEW.criado_por, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        INSERT INTO notificacoes
          (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
        VALUES (
          v_uid.id,
          'produto_aguarda_pagamento',
          'Produto aguarda pagamento — ' || COALESCE(v_ativ_codigo,''),
          'Produto ' || COALESCE(v_produto_num::text,'') ||
            ' — ' || COALESCE(SUBSTRING(v_produto_desc FOR 80),'') ||
            ' (Contrato ' || COALESCE(v_cont_numero,'') || ') foi aprovado e aguarda lançamento de pagamento.',
          false, 'financeiro.html', 'contratos_produtos_entregas', NEW.id
        );
        v_notificados := v_notificados || v_uid.id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_notificar_protocolo_criado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid record;
BEGIN
  FOR v_uid IN
    SELECT id FROM public.usuarios
     WHERE perfil = 'super_admin' AND ativo = true AND id IS DISTINCT FROM NEW.criado_por
  LOOP
    INSERT INTO public.notificacoes
      (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    VALUES (
      v_uid.id,
      'viagem_solicitada',
      'Nova solicitação — ' || COALESCE(NEW.numero,'') || ' — ' || COALESCE(NEW.destino_principal,''),
      'Protocolo ' || COALESCE(NEW.numero,'') || ' aguarda aprovação. Destino: ' ||
        COALESCE(NEW.destino_principal,'—') ||
        CASE WHEN NEW.dt_saida IS NOT NULL
          THEN ' · ' || to_char(NEW.dt_saida,'DD/MM/YYYY') ELSE '' END,
      false, 'viagens.html', 'viagem_protocolos', NEW.id
    );
  END LOOP;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_notificar_protocolo_situacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.situacao is not distinct from old.situacao then
    return new;
  end if;

  if new.situacao = 'em_prestacao' then
    insert into public.notificacoes
      (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    select u.id, 'viagem_prestacao',
           'Prestação de contas — ' || coalesce(new.numero,''),
           'Protocolo ' || coalesce(new.numero,'') || ' (' || coalesce(new.destino_principal,'—') ||
             ') aguarda confirmação.',
           false, 'viagens.html', 'viagem_protocolos', new.id
      from public.usuarios u
     where u.perfil = 'super_admin' and u.ativo;

  elsif new.situacao = 'realizado' and new.criado_por is not null then
    insert into public.notificacoes
      (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    values (new.criado_por, 'viagem_aprovada',
            'Protocolo ' || coalesce(new.numero,'') || ' realizado',
            'O protocolo ' || coalesce(new.numero,'') ||
              ' foi confirmado como realizado e os valores foram lançados no financeiro.',
            false, 'viagens.html', 'viagem_protocolos', new.id);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_notificar_solicitacao_senha()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nome text;
  v_uid  record;
BEGIN
  SELECT nome_completo INTO v_nome FROM public.usuarios WHERE id = NEW.usuario_id;
  FOR v_uid IN
    SELECT id FROM public.usuarios WHERE perfil = 'super_admin' AND ativo = true
  LOOP
    INSERT INTO public.notificacoes
      (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    VALUES (
      v_uid.id,
      'reset_senha_solicitado',
      'Solicitação de reset de senha',
      COALESCE(v_nome,'Usuário') || ' solicitou redefinição de senha.',
      false, 'usuarios.html', 'solicitacoes_senha', NEW.id
    );
  END LOOP;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_notificar_viagem_solicitada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid record;
  v_titulo  text;
  v_msg     text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_titulo := 'Nova solicitação de viagem — ' || COALESCE(NEW.numero_sei, 'sem SEI');
    v_msg    := COALESCE(NEW.beneficiario_nome,'—') ||
                ' → ' || COALESCE(NEW.destino,'—') ||
                CASE WHEN NEW.dt_saida IS NOT NULL
                  THEN ' · ' || to_char(NEW.dt_saida,'DD/MM/YYYY')
                  ELSE '' END ||
                CASE WHEN NEW.tem_passagem AND NEW.tem_diaria THEN ' (passagem + diária)'
                     WHEN NEW.tem_passagem THEN ' (passagem)'
                     WHEN NEW.tem_diaria   THEN ' (diária)'
                     ELSE '' END;

    FOR v_uid IN
      SELECT id FROM public.usuarios
      WHERE perfil = 'super_admin' AND ativo = true
    LOOP
      INSERT INTO public.notificacoes
        (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      VALUES
        (v_uid.id, 'viagem_solicitada', v_titulo, v_msg, false,
         'viagens.html', 'viagens_diarias', NEW.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_nt_caminho(p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(regexp_replace(coalesce(p_url, ''), '^.*/entregas-docs/', ''), coalesce(p_url, ''))
$function$
;

CREATE OR REPLACE FUNCTION public.fn_orcamento_extrato(p_atividade uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_res jsonb; v_cred jsonb; v_deb jsonb; v_fontes jsonb; v_ev jsonb; v_rem jsonb;
  v_tot_cred numeric; v_tot_deb numeric;
begin
  if auth.uid() is not null and fn_perfil_atual() is null then
    raise exception 'Sem permissão.';
  end if;
  select to_jsonb(o) into v_res from public.vw_orcamento_atividade o where o.atividade_id = p_atividade;
  if v_res is null then raise exception 'Atividade não encontrada.'; end if;

  select coalesce(jsonb_agg(x order by x.criado_em, x.id), '[]'), coalesce(sum(x.valor_usd), 0)
    into v_cred, v_tot_cred
    from (select f.id, f.criado_em, f.tipo, f.valor_usd, f.descricao, f.orcamentaria,
                 f.ajusta_fonte_id, f.estorno_de,
                 r.numero  as remanejamento,
                 ct.numero as contrato,
                 td.numero as tdr,
                 ao.codigo as atividade_procedencia,
                 u.nome_completo as lancado_por
            from public.orcamento_fontes f
            left join public.remanejamentos r          on r.id  = f.remanejamento_id
            left join public.contrato_encerramentos ce on ce.id = f.encerramento_id
            left join public.contratos ct              on ct.id = ce.contrato_id
            left join public.tdrs td                   on td.id = ce.tdr_id
            left join public.orcamento_fontes fo       on fo.id = f.fonte_origem_id
            left join public.atividades ao             on ao.id = fo.atividade_id
            left join public.usuarios u                on u.id  = f.criado_por
           where f.atividade_id = p_atividade) x;

  select coalesce(jsonb_agg(d order by d.ordem, d.referencia), '[]'), coalesce(sum(d.valor_usd) filter (where d.conta), 0)
    into v_deb, v_tot_deb
    from (
      select 1 as ordem, 'tdr' as tipo, t.numero::text as referencia, t.status::text as situacao,
             coalesce(t.valor_usd, 0)::numeric(14,2) as valor_usd, true as conta,
             t.criado_em, null::text as detalhe
        from public.tdrs t
       where t.atividade_id = p_atividade and t.status <> 'cancelado' and not t.execucao_direta
      union all
      select 2, 'execucao_direta', 'Execução direta UNESCO', null,
             d.reserva_execucao_direta_usd + greatest(0, d.execucao_direta_realizada_usd - d.reserva_execucao_direta_usd),
             true, null,
             'reserva US$ ' || d.reserva_execucao_direta_usd || ' · realizado US$ ' || d.execucao_direta_realizada_usd
        from public.vw_orcamento_debitos d
       where d.atividade_id = p_atividade
         and (d.reserva_execucao_direta_usd <> 0 or d.execucao_direta_realizada_usd <> 0)
      union all
      select 3, 'excedente_contrato',
             coalesce(td.numero, ct.numero)::text, null,
             sum(cc.delta_usd)::numeric(14,2), true, min(cc.criado_em),
             'contratos acima do TDR: excedente R$ ' ||
               (select c2.excedente_depois_brl from public.contrato_coberturas c2
                 where c2.grupo = cc.grupo order by c2.seq desc limit 1)
        from public.contrato_coberturas cc
        left join public.tdrs td      on td.id = cc.tdr_id
        left join public.contratos ct on ct.id = cc.grupo
       where cc.atividade_id = p_atividade
       group by cc.grupo, td.numero, ct.numero
      having sum(cc.delta_usd) <> 0
      union all
      select 4, 'pagamento_contrato_sem_tdr', 'Pagamentos de contrato sem TDR', null,
             d.pagamentos_contrato_sem_tdr_usd, true, null, null
        from public.vw_orcamento_debitos d
       where d.atividade_id = p_atividade and d.pagamentos_contrato_sem_tdr_usd <> 0
    ) d;

  select coalesce(jsonb_agg(to_jsonb(fs) order by fs.ordem_consumo), '[]') into v_fontes
    from public.vw_orcamento_fontes_saldo fs where fs.atividade_id = p_atividade;

  select coalesce(jsonb_agg(to_jsonb(e) - 'atividade_id' order by e.criado_em), '[]') into v_ev
    from public.orcamento_eventos e where e.atividade_id = p_atividade;

  select coalesce(jsonb_agg(jsonb_build_object('numero', r.numero, 'status', r.status, 'valor_usd', i.valor_usd,
                                               'efetivado_em', r.efetivado_em, 'estorno_de', o.numero)
                            order by r.criado_em), '[]') into v_rem
    from public.remanejamento_itens i
    join public.remanejamentos r on r.id = i.remanejamento_id
    left join public.remanejamentos o on o.id = r.estorno_de
   where i.atividade_id = p_atividade and i.ativo and r.status not in ('rascunho');

  return jsonb_build_object(
    'gerado_em', now(),
    'resumo', v_res,
    'creditos', v_cred, 'total_creditos_usd', v_tot_cred,
    'debitos', v_deb, 'total_debitos_usd', v_tot_deb,
    'saldo_calculado_usd', v_tot_cred - v_tot_deb,
    'fecha', (v_tot_cred - v_tot_deb) = (v_res->>'saldo_usd')::numeric,
    'fontes', v_fontes, 'eventos_tdr', v_ev, 'remanejamentos', v_rem);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_orcamento_recalcular_cache(p_atividade_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform set_config('dima.razao_orcamento', 'on', true);
  update public.atividades a
     set orcamento_usd = coalesce((select sum(f.valor_usd) from public.orcamento_fontes f
                                    where f.atividade_id = a.id and f.orcamentaria), 0),
         orcamento_original_usd = (select sum(f.valor_usd) from public.orcamento_fontes f
                                    where f.atividade_id = a.id and f.tipo = 'dotacao_original')
   where a.id = p_atividade_id;
  perform set_config('dima.razao_orcamento', 'off', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_perfil_atual()
 RETURNS perfil_usuario
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select perfil from public.usuarios where id = auth.uid() and ativo;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pode_avaliar_contrato(p_contrato_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (
           exists (
             select 1 from public.usuarios u
             where u.id = auth.uid() and u.ativo and u.perfil = 'super_admin'
           )
        or exists (
             select 1
             from public.contratos c
             join public.atividade_responsaveis ar on ar.atividade_id = c.atividade_id
             join public.usuarios u on u.id = ar.usuario_id and u.ativo
             where c.id = p_contrato_id
               and ar.usuario_id = auth.uid()
               and ar.ativo
               and ar.papel in ('responsavel','substituto')
           )
         )
     and not public.fn_eh_fornecedor_do_contrato(p_contrato_id);
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pode_registrar_entrega(p_contrato_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.fn_pode_avaliar_contrato(p_contrato_id)
      or (public.fn_eh_fornecedor_do_contrato(p_contrato_id)
          and exists (select 1 from public.usuarios u where u.id = auth.uid() and u.ativo));
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pode_ver_tarefa(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from tarefas t
    where t.id = p_id
      and (
        t.criado_por = auth.uid()
        or fn_perfil_atual() = 'super_admin'
        or exists (select 1 from tarefa_participantes tp
                   where tp.tarefa_id = t.id and tp.usuario_id = auth.uid())
        or (not t.restrita and (
              fn_perfil_atual() = 'coordenacao'
              or (t.atividade_id is not null and exists (
                    select 1 from atividade_responsaveis ar
                    where ar.atividade_id = t.atividade_id
                      and ar.usuario_id = auth.uid() and ar.ativo = true))))
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.fn_produto_id_do_path(p_name text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when split_part(p_name, '/', 1) = 'produtos'
     and split_part(p_name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(p_name, '/', 2)::uuid
  end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_produto_pago_ao_pagar_lancamento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_dt_pgto date;
BEGIN
  -- Só age quando situacao muda para 'pago'
  IF NEW.situacao = 'pago' AND OLD.situacao IS DISTINCT FROM 'pago' THEN
    v_dt_pgto := COALESCE(NEW.dt_pagamento, CURRENT_DATE);

    -- Via lancamento_id vinculado na entrega
    UPDATE public.contratos_produtos cp
    SET situacao      = 'pago',
        dt_entrega    = COALESCE(cp.dt_entrega, v_dt_pgto),
        atualizado_em = now()
    WHERE cp.id IN (
      SELECT cpe.produto_id
      FROM contratos_produtos_entregas cpe
      WHERE cpe.lancamento_id = NEW.id
    )
    AND cp.situacao = 'aprovado';  -- só transiciona de aprovado para pago

    -- Fallback: contrato + numero_produto
    IF NOT FOUND AND NEW.contrato_id IS NOT NULL AND NEW.numero_produto IS NOT NULL THEN
      UPDATE public.contratos_produtos cp
      SET situacao      = 'pago',
          dt_entrega    = COALESCE(cp.dt_entrega, v_dt_pgto),
          lancamento_id = NEW.id,
          atualizado_em = now()
      WHERE cp.contrato_id    = NEW.contrato_id
        AND cp.numero_produto = NEW.numero_produto
        AND cp.situacao = 'aprovado';
    END IF;
  END IF;

  -- Reversão: lançamento sai de 'pago' → produto volta para 'aprovado'
  IF OLD.situacao = 'pago' AND NEW.situacao != 'pago' THEN
    UPDATE public.contratos_produtos cp
    SET situacao      = 'aprovado',
        atualizado_em = now()
    WHERE cp.id IN (
      SELECT cpe.produto_id
      FROM contratos_produtos_entregas cpe
      WHERE cpe.lancamento_id = NEW.id
    )
    AND cp.situacao = 'pago';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_produto_permissoes(p_contrato_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'registrar',  public.fn_pode_registrar_entrega(p_contrato_id),
    'avaliar',    public.fn_pode_avaliar_contrato(p_contrato_id),
    'fornecedor', public.fn_eh_fornecedor_do_contrato(p_contrato_id));
$function$
;

CREATE OR REPLACE FUNCTION public.fn_protege_campos_usuario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_perfil perfil_usuario;
  v_hash text;
  v_snap text;
begin
  if new.deve_trocar_senha and (tg_op = 'INSERT' or auth.uid() is distinct from new.id) then
    select encrypted_password into v_hash from auth.users where id = new.id;
    if v_hash is not null then
      insert into public.usuario_senha_temporaria (usuario_id, hash, definido_em)
      values (new.id, v_hash, now())
      on conflict (usuario_id) do update set hash = excluded.hash, definido_em = excluded.definido_em;
    end if;
  end if;

  if tg_op = 'INSERT' or auth.uid() is null then
    return new;
  end if;

  select perfil into v_perfil from public.usuarios where id = auth.uid() and ativo;

  if new.perfil is distinct from old.perfil and v_perfil is distinct from 'super_admin' then
    raise exception 'Alteracao de perfil e restrita a super_admin' using errcode = '42501';
  end if;

  if new.ativo is distinct from old.ativo
     and (v_perfil is null or v_perfil not in ('super_admin','coordenacao')) then
    raise exception 'Alteracao de status de usuario e restrita a super_admin ou coordenacao' using errcode = '42501';
  end if;

  if new.email is distinct from old.email and v_perfil is distinct from 'super_admin' then
    raise exception 'Alteracao de e-mail e restrita a super_admin' using errcode = '42501';
  end if;

  if old.deve_trocar_senha and not new.deve_trocar_senha and auth.uid() = new.id then
    select hash into v_snap from public.usuario_senha_temporaria where usuario_id = new.id;
    select encrypted_password into v_hash from auth.users where id = new.id;
    if v_snap is not null and v_hash is not distinct from v_snap then
      raise exception 'SENHA_NAO_TROCADA: defina uma senha nova antes de continuar' using errcode = '42501';
    end if;
    update public.usuario_senha_temporaria set hash = null where usuario_id = new.id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_publico_api_retirar(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_p api_pedidos; v_c api_clientes; v_chave text;
begin
  if coalesce(length(p_token), 0) <> 64 then raise exception 'LINK_INVALIDO'; end if;
  select * into v_p from api_pedidos
   where retirada_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found then raise exception 'LINK_INVALIDO'; end if;
  if v_p.status <> 'aprovado' then raise exception 'LINK_INVALIDO'; end if;
  if v_p.retirada_expira_em < now() then raise exception 'LINK_EXPIRADO'; end if;
  select * into v_c from api_clientes where id = v_p.cliente_id for update;
  if not found or not v_c.ativo or v_c.chave_hash is not null then raise exception 'ACESSO_REVOGADO'; end if;

  v_chave := 'dima_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update api_clientes set chave_hash = encode(sha256(convert_to(v_chave, 'UTF8')), 'hex'),
         chave_prefixo = left(v_chave, 12), retirada_em = now()
   where id = v_c.id;
  update api_pedidos set status = 'retirado', retirado_em = now(), retirada_hash = null where id = v_p.id;

  return jsonb_build_object('chave', v_chave, 'nome', v_c.nome, 'escopos', to_jsonb(v_c.escopos),
    'origens', to_jsonb(v_c.origens), 'limite_minuto', v_c.limite_minuto, 'expira_em', v_c.expira_em,
    'pedido', v_p.numero);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_publico_camadas()
 RETURNS TABLE(id uuid, nome text, apa_key text, cor text, geojson jsonb, visivel boolean, feature_colors jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, nome, apa_key, cor, geojson, visivel, COALESCE(feature_colors, '{}'::jsonb)
  FROM apa_demarcacoes
  ORDER BY created_at;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_publico_mapa()
 RETURNS TABLE(id uuid, nome_local text, apa text, tipo_atividade text, data_implantacao date, lat double precision, lng double precision, foto_url text, status text, observacao text, geometry_type text, geometry_group text, geometry_order integer, ponto_especial text, video_url text, fotos jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.nome_local,
    p.apa,
    p.tipo_atividade,
    p.data_implantacao,
    p.lat,
    p.lng,
    p.foto_url,
    p.status,
    p.observacao,
    p.geometry_type,
    p.geometry_group,
    p.geometry_order,
    p.ponto_especial,
    p.video_url,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('foto_url', f.foto_url, 'ordem', f.ordem)
               ORDER BY f.ordem)
      FROM geometria_fotos f
      WHERE f.geometry_group = p.geometry_group
        AND f.geometry_type  = p.geometry_type
        AND p.geometry_group IS NOT NULL
    ), '[]'::jsonb)
  FROM produto_pontos_mapa p
  ORDER BY p.criado_em DESC
$function$
;

CREATE OR REPLACE FUNCTION public.fn_publico_operacional()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'atividades_total',
      (select count(*)::int from atividades),
    'atividades_ativas',
      (select count(*)::int from atividades where ativo),
    'atividades_por_fase',
      coalesce((
        select jsonb_object_agg(fase::text, cnt)
        from (select fase::text, count(*)::int as cnt from atividades group by fase) t
      ), '{}'::jsonb),
    'tdrs_total',
      (select count(*)::int from tdrs where status::text != 'cancelado'),
    'tdrs_aprovados',
      (select count(*)::int from tdrs
        where status::text in ('aprovado', 'em_licitacao', 'contratado')),
    'tdrs_por_status',
      coalesce((
        select jsonb_object_agg(status::text, cnt)
        from (
          select status::text, count(*)::int as cnt
          from tdrs where status::text != 'cancelado'
          group by status
        ) t
      ), '{}'::jsonb),
    'produtos_entregues',
      (select count(*)::int from vw_acervo_obras where situacao_acervo = 'aprovado'),
    'produtos_total',
      (select count(*)::int from produtos_entregues),
    'pontos_mapa',
      (select count(*)::int from fn_publico_mapa()),
    'indicadores_total',
      (select count(*)::int from indicadores where ativo = true),
    'indicadores_com_progresso',
      (select count(*)::int from indicadores
       where ativo = true and coalesce(valor_atingido, 0) > 0)
  )
$function$
;

CREATE OR REPLACE FUNCTION public.fn_publico_pedir_nova_senha(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_uid uuid;
begin
  if length(v_email) between 3 and 254 and v_email like '%_@_%' then
    if (select count(*) from solicitacoes_senha
         where motivo = 'Pedido na tela de entrada (sem login)' and criado_em > now() - interval '1 hour') < 30 then
      select u.id into v_uid from usuarios u where lower(u.email) = v_email and u.ativo limit 1;
      if v_uid is not null and not exists (
           select 1 from solicitacoes_senha s where s.usuario_id = v_uid and s.status = 'pendente') then
        insert into solicitacoes_senha (usuario_id, status, motivo)
        values (v_uid, 'pendente', 'Pedido na tela de entrada (sem login)');
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_publico_pulso_ciclo(p_token text, p_dispositivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_publico_pulso_responder(p_token text, p_respostas jsonb, p_dispositivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_publico_resultados()
 RETURNS TABLE(id uuid, resultado integer, produto_codigo text, produto_titulo text, indicador text, meta_numerica numeric, meta_descricao text, unidade text, ods text[], metas_km text[], realizado_confirmado numeric, realizado_pendente numeric, realizado_total numeric, pct_confirmado numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    mi.id,
    mi.resultado,
    mi.produto_codigo,
    mi.produto_titulo,
    mi.indicador,
    mi.meta_numerica,
    mi.meta_descricao,
    mi.unidade,
    mi.ods,
    mi.metas_km,
    COALESCE(SUM(CASE WHEN pmc.status = 'confirmado' THEN pmc.valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pmc.status = 'pendente'   THEN pmc.valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pmc.status IN ('confirmado','pendente') THEN pmc.valor ELSE 0 END), 0),
    CASE
      WHEN mi.meta_numerica > 0 THEN
        ROUND(
          COALESCE(SUM(CASE WHEN pmc.status = 'confirmado' THEN pmc.valor ELSE 0 END), 0)
          / mi.meta_numerica * 100, 1
        )
      ELSE NULL
    END
  FROM matriz_itens mi
  LEFT JOIN produto_matriz_contribuicao pmc
    ON pmc.matriz_item_id = mi.id
    AND pmc.status != 'cancelado'
    AND EXISTS (
      SELECT 1 FROM contratos_produtos_entregas cpe
      WHERE cpe.id = pmc.produto_id AND cpe.situacao = 'aprovada'
    )
  WHERE mi.ativo = true
  GROUP BY mi.id, mi.resultado, mi.produto_codigo, mi.produto_titulo,
           mi.indicador, mi.meta_numerica, mi.meta_descricao, mi.unidade,
           mi.ods, mi.metas_km, mi.ordem
  ORDER BY mi.resultado, mi.ordem
$function$
;

CREATE OR REPLACE FUNCTION public.fn_publico_tipos_mapa()
 RETURNS TABLE(produto_titulo text, cor text, emoji text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (produto_titulo)
    produto_titulo,
    cor,
    emoji
  FROM matriz_itens
  WHERE produto_titulo IS NOT NULL
    AND visivel_no_mapa = true
  ORDER BY produto_titulo;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_alterar(p_ciclo uuid, p_dados jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_ciclos()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'ultima_resposta', (select max(dia) from public.pulso_respostas_v2 where ciclo_id = c.id),
        'n_exportacoes', (select count(*) from public.pulso_exportacoes where ciclo_id = c.id),
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_contagem(p_ciclo uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.pulso_ciclos;
begin
  select * into c from public.pulso_ciclos where id = p_ciclo;
  if not found or not public.fn_pulso_pode_ver(c) then raise exception 'pulso:sem_permissao'; end if;
  return public.fn_pulso_n_respostas(p_ciclo);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_criar(p_titulo text, p_aceita_convidados boolean DEFAULT true, p_limite_convidados integer DEFAULT NULL::integer, p_fecha_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if not public.fn_pulso_gestor() then raise exception 'pulso:sem_permissao'; end if;
  insert into public.pulso_ciclos (titulo, aceita_convidados, limite_convidados, fecha_em, criado_por)
  values (btrim(p_titulo), coalesce(p_aceita_convidados, true), p_limite_convidados, p_fecha_em, auth.uid())
  returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_criar_ciclo(p_titulo text, p_aceita_convidados boolean DEFAULT true, p_limite_convidados integer DEFAULT NULL::integer, p_fecha_em timestamp with time zone DEFAULT NULL::timestamp with time zone, p_copiar_de uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_exportar(p_ciclo uuid, p_formato text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb; c public.pulso_ciclos;
begin
  if p_formato is null or p_formato not in ('xlsx','a4','pptx') then raise exception 'pulso:formato_invalido'; end if;
  select * into c from public.pulso_ciclos where id = p_ciclo;
  if not found then raise exception 'pulso:ciclo_inexistente'; end if;
  if not public.fn_pulso_pode_ver(c) then raise exception 'pulso:sem_permissao'; end if;
  r := public.fn_pulso_resultado(p_ciclo);
  if (r->>'suprimido')::boolean then raise exception 'pulso:exportacao_suprimida'; end if;
  insert into public.pulso_exportacoes (ciclo_id, usuario_id, formato) values (p_ciclo, auth.uid(), p_formato);
  return r || jsonb_build_object(
    'autor', (select u.nome_completo from public.usuarios u where u.id = c.criado_por),
    'exportado_por', (select u.nome_completo from public.usuarios u where u.id = auth.uid()),
    'exportado_em', now());
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_exportar_lista()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb;
begin
  r := public.fn_pulso_ciclos();
  insert into public.pulso_exportacoes (ciclo_id, usuario_id, formato) values (null, auth.uid(), 'lista_xlsx');
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_gestor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.usuarios u
                 where u.id = auth.uid() and u.ativo
                   and u.perfil in ('super_admin','coordenacao'))
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_grupo_atual()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select case when u.perfil in ('super_admin','coordenacao') then 'coordenacao'
                else u.perfil::text end
    from public.usuarios u where u.id = auth.uid() and u.ativo), 'convidado')
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_hash_disp(p_ciclo uuid, p_disp text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select encode(sha256(convert_to(p_ciclo::text || ':' || p_disp, 'UTF8')), 'hex')
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_metricas(p_ciclo uuid, p_grupos text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_n_respostas(p_ciclo uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int from public.pulso_participacoes where ciclo_id = p_ciclo
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_participacao(p_ciclo uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'cadastrados', (select count(*) from public.pulso_participacoes where ciclo_id = p_ciclo and usuario_id is not null),
    'convidados',  (select count(*) from public.pulso_participacoes where ciclo_id = p_ciclo and usuario_id is null),
    'usuarios_ativos', (select count(*) from public.usuarios where ativo))
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_perguntas_padrao()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select '[
    {"chave":"q1","tipo":"escala","tema":"Propósito","texto":"Tenho clareza de como o meu trabalho contribui para os resultados do projeto.","obrigatoria":true,"indice":true,"invertida":false},
    {"chave":"q2","tipo":"escala","tema":"Dedicação","texto":"Nas últimas semanas, me dediquei ao projeto além do mínimo necessário.","obrigatoria":true,"indice":true,"invertida":false},
    {"chave":"q3","tipo":"escala","tema":"Sintonia","texto":"Sinto que a equipe está remando na mesma direção, com as mesmas prioridades.","obrigatoria":true,"indice":true,"invertida":false},
    {"chave":"q4","tipo":"escala","tema":"Confiança","texto":"Posso discordar, errar ou pedir ajuda nesta equipe sem receio.","obrigatoria":true,"indice":true,"invertida":false},
    {"chave":"q5","tipo":"escala","tema":"Condições","texto":"Tenho o que preciso (informação, decisões, ferramentas) para fazer bem o meu trabalho.","obrigatoria":true,"indice":true,"invertida":false},
    {"chave":"q6","tipo":"nps","tema":"Recomendação","texto":"De 0 a 10, quanto você recomendaria trabalhar nesta equipe a um colega?","obrigatoria":true},
    {"chave":"texto","tipo":"texto","tema":"Uma mudança","texto":"Se você pudesse mudar UMA coisa na forma como a equipe trabalha no próximo mês, qual seria?","obrigatoria":false}
  ]'::jsonb
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_resultado(p_ciclo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  for q in select * from jsonb_array_elements(c.perguntas) where value->>'tipo' = 'texto' loop
    v_textos := v_textos || jsonb_build_object(q->>'chave', coalesce((
      select jsonb_agg(respostas->>(q->>'chave') order by random()) from public.pulso_respostas_v2
      where ciclo_id = p_ciclo and respostas ? (q->>'chave')), '[]'::jsonb));
  end loop;

  return v_base || jsonb_build_object('suprimido', false,
    'geral', public.fn_pulso_metricas(p_ciclo, null), 'grupos', v_grupos, 'textos', v_textos);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_salvar_espelho(p_ciclo uuid, p_q jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_salvar_perguntas(p_ciclo uuid, p_perguntas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.pulso_ciclos; v jsonb;
begin
  select * into c from public.pulso_ciclos where id = p_ciclo for update;
  if not found then raise exception 'pulso:ciclo_inexistente'; end if;
  if not public.fn_pulso_dono(c) then raise exception 'pulso:sem_permissao'; end if;
  if public.fn_pulso_n_respostas(c.id) > 0 then raise exception 'pulso:perguntas_travadas'; end if;
  v := public.fn_pulso_validar_perguntas(p_perguntas);
  update public.pulso_ciclos set perguntas = v where id = p_ciclo;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.atualizado_em := now(); return new; end $function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_usuario_ativo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.usuarios u where u.id = auth.uid() and u.ativo)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_validar_perguntas(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_rascunho_avisar_titular()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tit   uuid := public.fn_rem_titular('coordenacao_solicitante');
  v_tipo  text;
  v_tit_txt text;
  v_msg   text;
  v_link  text;
  v_ent   text;
  v_nome  text;
begin
  if new.status <> 'rascunho' or v_tit is null or v_tit = new.criado_por then return new; end if;
  if not exists (select 1 from public.usuarios where id = v_tit and ativo) then return new; end if;
  select nome_completo into v_nome from public.usuarios where id = new.criado_por;

  if tg_table_name = 'tdr_cancelamentos' then
    if new.nota_caminho is null or length(btrim(coalesce(new.justificativa, ''))) < 30 then return new; end if;
    v_tipo := 'tdr_cancelamento_analisar';
    v_ent  := 'tdr_cancelamento';
    v_link := 'remanejamentos.html?can=' || new.id;
    v_tit_txt := 'Cancelamento do TDR ' || coalesce(new.tdr_numero, '?') || ' (' || new.numero || ') aguarda seu envio para aprovação';
  else
    if coalesce(btrim(new.justificativa), '') in ('', '(rascunho)')
       or not exists (select 1 from public.remanejamento_itens i where i.remanejamento_id = new.id and i.ativo) then
      return new;
    end if;
    v_tipo := 'remanejamento_analisar';
    v_ent  := 'remanejamento';
    v_link := 'remanejamentos.html?id=' || new.id;
    v_tit_txt := 'Remanejamento ' || new.numero || ' aguarda seu envio para aprovação';
  end if;

  v_msg := 'Rascunho preparado por ' || coalesce(v_nome, 'outra pessoa') || ' (versão ' || new.versao
        || '). Só o titular da coordenação solicitante envia o pedido para a cadeia, com a senha.';

  if exists (select 1 from public.notificacoes n
              where n.usuario_id = v_tit and n.entidade_id = new.id and n.tipo = v_tipo and n.mensagem = v_msg) then
    return new;
  end if;

  begin
    insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
    values (v_tit, v_tipo, v_tit_txt, v_msg, v_link, v_ent, new.id);
  exception when others then null;
  end;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_razao_orcamento_ativo()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(current_setting('dima.razao_orcamento', true), '') = 'on'
$function$
;

CREATE OR REPLACE FUNCTION public.fn_reagendar_tarefa(p_tarefa_id uuid, p_dt_prazo date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller uuid := auth.uid();
  v_cod text; v_alvo uuid[];
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão para alterar esta tarefa';
  end if;
  select codigo into v_cod from tarefas where id = p_tarefa_id;
  update tarefas set dt_prazo = p_dt_prazo where id = p_tarefa_id;
  select array_agg(usuario_id) into v_alvo from tarefa_participantes where tarefa_id = p_tarefa_id;
  perform fn_tarefa_notificar(v_alvo, 'tarefa_prazo',
    'Prazo alterado: ' || coalesce(v_cod,''),
    'Novo prazo: ' || coalesce(to_char(p_dt_prazo,'DD/MM/YYYY'),'sem prazo'),
    p_tarefa_id, v_caller);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_realizar_protocolo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.situacao = 'realizado' AND OLD.situacao IS DISTINCT FROM 'realizado' THEN
    -- Atualizar todos os lançamentos dos viajantes para 'pago'
    UPDATE public.execucao_financeira ef
    SET situacao = 'pago',
        dt_pagamento = COALESCE(NEW.dt_retorno, CURRENT_DATE),
        atualizado_em = now()
    WHERE ef.id IN (
      SELECT lancamento_id FROM public.viagem_viajantes
      WHERE protocolo_id = NEW.id AND lancamento_id IS NOT NULL
    );

  ELSIF NEW.situacao = 'cancelado' AND OLD.situacao IS DISTINCT FROM 'cancelado' THEN
    UPDATE public.execucao_financeira ef
    SET situacao = 'cancelado', atualizado_em = now()
    WHERE ef.id IN (
      SELECT lancamento_id FROM public.viagem_viajantes
      WHERE protocolo_id = NEW.id AND lancamento_id IS NOT NULL
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_recalcular_utilizado_contrato()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_contrato_id     uuid;
  v_utilizado       numeric;
  v_comprometido    numeric;
BEGIN
  v_contrato_id := COALESCE(NEW.contrato_id, OLD.contrato_id);
  IF v_contrato_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Utilizado = somente PAGO
  SELECT COALESCE(SUM(valor_brl), 0) INTO v_utilizado
  FROM execucao_financeira
  WHERE contrato_id = v_contrato_id AND situacao = 'pago';

  -- Comprometido = pago + a_pagar (tudo exceto cancelado)
  SELECT COALESCE(SUM(valor_brl), 0) INTO v_comprometido
  FROM execucao_financeira
  WHERE contrato_id = v_contrato_id AND situacao != 'cancelado';

  UPDATE contratos
  SET valor_utilizado_brl    = v_utilizado,
      valor_comprometido_brl = v_comprometido,
      atualizado_em          = now()
  WHERE id = v_contrato_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_redigir_jsonb(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p is null then null
    else (
      select jsonb_object_agg(k, to_jsonb('[redigido]'::text))
      from jsonb_object_keys(p) as k
    )
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_registrar_acao_tdr(p_tdr_id uuid, p_usuario_id uuid, p_acao character varying, p_comentario text DEFAULT NULL::text, p_ip character varying DEFAULT NULL::character varying)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_perfil perfil_usuario := fn_perfil_atual();
  v_tdr record;
  v_acao_id uuid;
  v_status_ant varchar;
  v_status_novo varchar;
  v_titulo_notif text;
  v_tipo_notif varchar;
  v_link text := '/pages/tdrs.html';
  v_resp record;
begin
  if v_uid is null or v_perfil is null then
    raise exception 'Sem sessão válida.' using errcode = '42501';
  end if;

  select t.*, a.codigo as ativ_codigo, a.responsavel_id as ativ_resp, a.substituto_id as ativ_subst into v_tdr
  from public.tdrs t left join public.atividades a on a.id = t.atividade_id
  where t.id = p_tdr_id;
  if not found then raise exception 'TDR não encontrado.'; end if;

  if not coalesce(v_perfil in ('super_admin','coordenacao','financeiro','visualizador')
          or v_tdr.criado_por = v_uid or v_tdr.elaborador_id = v_uid or v_tdr.responsavel_id = v_uid
          or v_tdr.ativ_resp = v_uid or v_tdr.ativ_subst = v_uid, false) then
    raise exception 'Sem acesso a este TDR.' using errcode = '42501';
  end if;

  v_status_ant := v_tdr.status::varchar;
  v_status_novo := case p_acao
    when 'enviado_revisao'  then 'revisao_interna'
    when 'aprovado_revisao' then 'enviado_unesco'
    when 'devolvido_ajuste' then 'ajustes'
    when 'enviado_unesco'   then 'enviado_unesco'
    when 'retorno_unesco'   then 'retorno_unesco'
    when 'aprovado_final'   then 'aprovado'
    when 'cancelado'        then 'cancelado'
    else v_status_ant end;

  if v_status_novo <> v_status_ant then
    if coalesce(v_perfil in ('super_admin','coordenacao')
       or (v_perfil = 'tecnico' and v_tdr.criado_por = v_uid and v_tdr.status in ('rascunho','ajustes')), false) then
      update public.tdrs set status = v_status_novo::status_tdr, atualizado_em = now() where id = p_tdr_id;
    else
      v_status_novo := v_status_ant;
    end if;
  end if;

  insert into public.tdr_acoes (tdr_id, usuario_id, acao, status_anterior, status_novo, comentario, ip_address)
  values (p_tdr_id, v_uid, p_acao, v_status_ant, v_status_novo, p_comentario, p_ip)
  returning id into v_acao_id;

  v_tipo_notif := case p_acao
    when 'enviado_revisao'  then 'tdr_para_revisar'
    when 'devolvido_ajuste' then 'tdr_devolvido'
    when 'aprovado_final'   then 'tdr_aprovado'
    when 'enviado_unesco'   then 'tdr_enviado_unesco'
    else null end;
  v_titulo_notif := case p_acao
    when 'enviado_revisao'  then 'TDR ' || v_tdr.numero || ' aguarda sua revisão'
    when 'devolvido_ajuste' then 'TDR ' || v_tdr.numero || ' foi devolvido para ajustes'
    when 'aprovado_revisao' then 'TDR ' || v_tdr.numero || ' aprovado na revisão interna'
    when 'aprovado_final'   then 'TDR ' || v_tdr.numero || ' aprovado pela UNESCO'
    when 'cancelado'        then 'TDR ' || v_tdr.numero || ' foi cancelado'
    else 'TDR ' || v_tdr.numero || ' atualizado' end;

  if v_tipo_notif is not null then
    for v_resp in
      select distinct tr.usuario_id from public.tdr_responsaveis tr where tr.tdr_id = p_tdr_id and tr.ativo = true
      union
      select u.id from public.usuarios u where u.perfil = 'coordenacao' and u.ativo = true and p_acao = 'enviado_revisao'
    loop
      if v_resp.usuario_id <> v_uid then
        insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
        values (v_resp.usuario_id, v_tipo_notif, v_titulo_notif, coalesce(p_comentario, 'Atividade: ' || v_tdr.ativ_codigo),
                v_link, 'tdr', p_tdr_id);
      end if;
    end loop;
    if p_acao = 'devolvido_ajuste' then
      insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
      select tr.usuario_id, 'tdr_devolvido', v_titulo_notif, coalesce(p_comentario, 'TDR devolvido para ajustes'), v_link, 'tdr', p_tdr_id
      from public.tdr_responsaveis tr
      where tr.tdr_id = p_tdr_id and tr.papel = 'elaborador' and tr.ativo = true and tr.usuario_id <> v_uid;
    end if;
  end if;

  return v_acao_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_assinar(p_usuario_id uuid, p_remanejamento_id uuid, p_decisao text, p_motivo text, p_hash text, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rem    public.remanejamentos;
  v_etapa  public.remanejamento_etapas;
  v_ant    public.remanejamento_etapas;
  v_prox   public.remanejamento_etapas;
  v_total  integer;
  v_ass    uuid;
  v_titular uuid;
  v_ordem  integer := 0;
  o record;
  v_avisar uuid[];
begin
  if p_decisao not in ('aprovar','devolver','recusar','cancelar') then
    raise exception 'Decisão inválida: %', p_decisao;
  end if;
  if not exists (select 1 from public.usuarios where id = p_usuario_id and ativo) then
    raise exception 'Usuário inexistente ou inativo.';
  end if;

  select * into v_rem from public.remanejamentos where id = p_remanejamento_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if p_hash is distinct from fn_rem_hash(v_rem.id) then
    raise exception 'DOCUMENTO_ALTERADO: o pedido mudou depois que você o abriu. Recarregue e confira antes de assinar.';
  end if;

  if p_decisao = 'cancelar' then
    if not (v_rem.status = 'rascunho' or (v_rem.status = 'em_aprovacao' and v_rem.etapa_atual = 1)) then
      raise exception 'Só dá para cancelar em rascunho ou quando o pedido está devolvido ao solicitante.';
    end if;
    if p_usuario_id <> v_rem.criado_por and p_usuario_id is distinct from fn_rem_titular('coordenacao_solicitante') then
      raise exception 'Só o solicitante cancela o pedido.';
    end if;
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
    update public.remanejamento_assinaturas set invalidada_em = now(), invalidada_motivo = 'pedido cancelado'
     where remanejamento_id = v_rem.id and versao = v_rem.versao and invalidada_em is null;
    update public.remanejamentos set status = 'cancelado', etapa_atual = null, encerrado_em = now(),
           motivo_encerramento = btrim(p_motivo) where id = v_rem.id;
    perform fn_rem_log(v_rem.id, 'cancelado', v_rem.status, 'cancelado', v_rem.etapa_atual, p_usuario_id, p_motivo);
    return jsonb_build_object('status', 'cancelado');
  end if;

  if v_rem.status = 'rascunho' then
    if p_decisao <> 'aprovar' then raise exception 'Pedido em rascunho: só é possível enviar (aprovar) ou cancelar.'; end if;
    v_titular := fn_rem_titular('coordenacao_solicitante');
    if v_titular is null then raise exception 'SEM_SIGNATARIO: o cargo de coordenação solicitante está sem titular.'; end if;
    if p_usuario_id <> v_titular then
      raise exception 'Só o titular da coordenação solicitante envia o pedido.';
    end if;
    perform fn_rem_validar(v_rem.id);

    insert into public.remanejamento_etapas (remanejamento_id, versao, ordem, papel, cargo)
    values (v_rem.id, v_rem.versao, 1, 'solicitacao', 'coordenacao_solicitante');
    v_ordem := 1;
    for o in
      select i.atividade_id, a.codigo from public.remanejamento_itens i join public.atividades a on a.id = i.atividade_id
       where i.remanejamento_id = v_rem.id and i.valor_usd < 0 and i.ativo order by a.codigo
    loop
      v_ordem := v_ordem + 1;
      insert into public.remanejamento_etapas (remanejamento_id, versao, ordem, papel, atividade_id)
      values (v_rem.id, v_rem.versao, v_ordem, 'liberacao_origem', o.atividade_id);
    end loop;
    insert into public.remanejamento_etapas (remanejamento_id, versao, ordem, papel, cargo) values
      (v_rem.id, v_rem.versao, v_ordem + 1, 'unesco',    'unesco_financeiro'),
      (v_rem.id, v_rem.versao, v_ordem + 2, 'diretoria', 'diretor'),
      (v_rem.id, v_rem.versao, v_ordem + 3, 'secretaria','secretario');

    for v_etapa in select * from public.remanejamento_etapas
                    where remanejamento_id = v_rem.id and versao = v_rem.versao order by ordem loop
      if not exists (
        select 1 from fn_rem_signatarios_etapa(v_etapa.id) s(uid)
         where v_etapa.papel <> 'liberacao_origem'
            or not exists (select 1 from public.rem_cargo_titulares t
                            where t.usuario_id = s.uid and t.vigencia_fim is null)) then
        raise exception 'SEM_SIGNATARIO: a etapa % (%) não tem quem assine%.', v_etapa.ordem,
          coalesce((select codigo from public.atividades where id = v_etapa.atividade_id), v_etapa.cargo),
          case when v_etapa.papel = 'liberacao_origem'
               then ' — a atividade precisa de um responsável que não ocupe cargo da cadeia' else '' end;
      end if;
    end loop;

    select * into v_etapa from public.remanejamento_etapas
     where remanejamento_id = v_rem.id and versao = v_rem.versao and ordem = 1;
    update public.remanejamentos set status = 'em_aprovacao', submetido_em = now(), etapa_atual = 1
     where id = v_rem.id returning * into v_rem;
    perform fn_rem_log(v_rem.id, 'enviado', 'rascunho', 'em_aprovacao', 1, p_usuario_id, null);
  else
    if v_rem.status <> 'em_aprovacao' then
      raise exception 'Pedido % está % — nada a assinar.', v_rem.numero, v_rem.status;
    end if;
    select * into v_etapa from public.remanejamento_etapas
     where remanejamento_id = v_rem.id and versao = v_rem.versao and ordem = v_rem.etapa_atual;
    if not exists (select 1 from fn_rem_signatarios_etapa(v_etapa.id) s(uid) where s.uid = p_usuario_id) then
      raise exception 'NAO_E_SUA_VEZ: a etapa atual (%) não é sua.', v_etapa.ordem;
    end if;
  end if;

  if p_decisao = 'aprovar' and exists (
       select 1 from public.remanejamento_assinaturas a
         join public.remanejamento_etapas e2 on e2.id = a.etapa_id
        where a.remanejamento_id = v_rem.id and a.versao = v_rem.versao and a.usuario_id = p_usuario_id
          and a.decisao = 'aprovar' and a.invalidada_em is null and a.etapa_id <> v_etapa.id
          and not (e2.papel = 'liberacao_origem' and v_etapa.papel = 'liberacao_origem')) then
    raise exception 'SEGREGACAO: você já aprovou outra etapa deste pedido.';
  end if;
  if p_decisao in ('devolver','recusar') then
    if v_etapa.ordem = 1 then raise exception 'O solicitante não devolve nem recusa — edite ou cancele.'; end if;
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo (%).', p_decisao; end if;
  end if;
  if p_decisao = 'aprovar' and v_etapa.ordem = 1 and v_rem.submetido_em < now() then
    perform fn_rem_validar(v_rem.id);
  end if;

  insert into public.remanejamento_assinaturas
    (remanejamento_id, etapa_id, versao, usuario_id, cargo, titular_id, decisao, motivo,
     hash_documento, senha_verificada_em, ip, user_agent)
  values (v_rem.id, v_etapa.id, v_rem.versao, p_usuario_id, v_etapa.cargo,
          (select id from public.rem_cargo_titulares where cargo = v_etapa.cargo and usuario_id = p_usuario_id and vigencia_fim is null),
          p_decisao, nullif(btrim(p_motivo), ''), p_hash, now(), p_ip, left(p_user_agent, 300))
  returning id into v_ass;

  select count(*) into v_total from public.remanejamento_etapas where remanejamento_id = v_rem.id and versao = v_rem.versao;

  if p_decisao = 'aprovar' then
    update public.remanejamento_etapas set assinatura_id = v_ass where id = v_etapa.id;
    perform fn_rem_log(v_rem.id, 'aprovado_etapa', null, null, v_etapa.ordem, p_usuario_id, p_motivo);
    if v_etapa.ordem = v_total then
      perform fn_rem_efetivar(v_rem.id, p_usuario_id);
      select array_agg(distinct u) into v_avisar from (
        select v_rem.criado_por as u
        union select a.usuario_id from public.remanejamento_assinaturas a
               where a.remanejamento_id = v_rem.id and a.versao = v_rem.versao and a.decisao = 'aprovar' and a.invalidada_em is null) x;
      perform fn_rem_notificar(v_rem.id, v_avisar, 'efetivado', null);
      return jsonb_build_object('status', 'efetivado');
    end if;
    update public.remanejamentos set etapa_atual = v_etapa.ordem + 1 where id = v_rem.id;
    select * into v_prox from public.remanejamento_etapas
     where remanejamento_id = v_rem.id and versao = v_rem.versao and ordem = v_etapa.ordem + 1;
    select array_agg(s) into v_avisar from fn_rem_signatarios_etapa(v_prox.id) s;
    perform fn_rem_notificar(v_rem.id, v_avisar, 'analisar', null);
    return jsonb_build_object('status', 'em_aprovacao', 'etapa_atual', v_etapa.ordem + 1);
  end if;

  if p_decisao = 'devolver' then
    select * into v_ant from public.remanejamento_etapas
     where remanejamento_id = v_rem.id and versao = v_rem.versao and ordem = v_etapa.ordem - 1;
    update public.remanejamento_assinaturas
       set invalidada_em = now(), invalidada_motivo = 'devolvido pela etapa ' || v_etapa.ordem
     where id = v_ant.assinatura_id;
    update public.remanejamento_etapas set assinatura_id = null where id = v_ant.id;
    update public.remanejamentos set etapa_atual = v_ant.ordem where id = v_rem.id;
    perform fn_rem_log(v_rem.id, 'devolvido', null, null, v_etapa.ordem, p_usuario_id, p_motivo,
                       jsonb_build_object('para_etapa', v_ant.ordem));
    select array_agg(a.usuario_id) into v_avisar from public.remanejamento_assinaturas a
     where a.id = (select id from public.remanejamento_assinaturas
                    where etapa_id = v_ant.id and decisao = 'aprovar' order by criado_em desc limit 1);
    if v_avisar is null then select array_agg(s) into v_avisar from fn_rem_signatarios_etapa(v_ant.id) s; end if;
    perform fn_rem_notificar(v_rem.id, v_avisar, 'devolvido', p_motivo);
    return jsonb_build_object('status', 'em_aprovacao', 'etapa_atual', v_ant.ordem);
  end if;

  update public.remanejamentos set status = 'recusado', etapa_atual = null, encerrado_em = now(),
         motivo_encerramento = btrim(p_motivo) where id = v_rem.id;
  perform fn_rem_log(v_rem.id, 'recusado', 'em_aprovacao', 'recusado', v_etapa.ordem, p_usuario_id, p_motivo);
  select array_agg(distinct u) into v_avisar from (
    select v_rem.criado_por as u
    union select a.usuario_id from public.remanejamento_assinaturas a
           where a.remanejamento_id = v_rem.id and a.versao = v_rem.versao and a.decisao = 'aprovar' and a.invalidada_em is null) x;
  perform fn_rem_notificar(v_rem.id, v_avisar, 'recusado', p_motivo);
  return jsonb_build_object('status', 'recusado');
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_criar_estorno(p_rem uuid, p_justificativa text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_orig public.remanejamentos;
  v_novo uuid;
  v_ano  integer := extract(year from fn_hoje_acre())::integer;
  v_seq  integer;
begin
  if coalesce(fn_perfil_atual()::text, '') not in ('coordenacao','super_admin') then
    raise exception 'Sem permissão: só a coordenação pede estorno de remanejamento.';
  end if;
  select * into v_orig from public.remanejamentos where id = p_rem for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_orig.estorno_de is not null then
    raise exception 'REM: % já é um estorno — para desfazê-lo, faça um remanejamento novo.', v_orig.numero;
  end if;
  if v_orig.status <> 'efetivado' then
    raise exception 'REM: só se estorna remanejamento efetivado (% está %).', v_orig.numero, v_orig.status;
  end if;
  select id into v_novo from public.remanejamentos
   where estorno_de = p_rem and status in ('rascunho','em_aprovacao','efetivado') limit 1;
  if v_novo is not null then return v_novo; end if;

  insert into public.rem_numeracao (ano, ultimo) values (v_ano, 1)
    on conflict (ano) do update set ultimo = public.rem_numeracao.ultimo + 1
    returning ultimo into v_seq;
  insert into public.remanejamentos (numero, tipo, estorno_de, justificativa, criado_por)
  values ('REM-' || v_ano || '-' || lpad(v_seq::text, 3, '0'), 'livre', p_rem,
          coalesce(nullif(btrim(p_justificativa), ''), '(rascunho)'), v_uid)
  returning id into v_novo;

  insert into public.remanejamento_itens (remanejamento_id, atividade_id, valor_usd)
  select v_novo, i.atividade_id, -i.valor_usd
    from public.remanejamento_itens i where i.remanejamento_id = p_rem and i.ativo;

  insert into public.remanejamento_alocacoes (remanejamento_id, item_id, fonte_id, valor_usd)
  select v_novo, ni.id, f.id, f.valor_usd
    from public.orcamento_fontes f
    join public.remanejamento_itens ni on ni.remanejamento_id = v_novo and ni.atividade_id = f.atividade_id
   where f.remanejamento_id = p_rem and f.tipo = 'remanejamento_recebido' and f.estorno_de is null;

  update public.remanejamentos set hash_documento = fn_rem_hash(id) where id = v_novo;
  perform fn_rem_log(v_novo, 'criado', null, 'rascunho', null, v_uid, null,
                     jsonb_build_object('estorno_de', v_orig.numero));
  perform fn_rem_log(p_rem, 'estorno_solicitado', null, null, null, v_uid, p_justificativa,
                     jsonb_build_object('pedido_estorno', v_novo));
  return v_novo;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_efetivar(p_rem uuid, p_usuario uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rem public.remanejamentos;
  o record; d record;
  v_origens jsonb := '[]'; v_destinos jsonb := '[]';
  i integer := 0; j integer := 0;
  v_resto_o numeric; v_resto_d numeric; v_x numeric;
begin
  select * into v_rem from public.remanejamentos where id = p_rem;

  perform 1 from public.atividades
   where id in (select atividade_id from public.remanejamento_itens where remanejamento_id = p_rem and ativo)
   order by id for update;

  perform fn_rem_validar(p_rem);

  -- estorno: espelha os lançamentos do pedido original (ver fn_rem_efetivar_estorno)
  if v_rem.estorno_de is not null then
    perform fn_rem_efetivar_estorno(p_rem, p_usuario);
    return;
  end if;

  for o in
    select x.id, x.fonte_id, x.valor_usd, i.atividade_id, a.codigo
      from public.remanejamento_alocacoes x
      join public.remanejamento_itens i on i.id = x.item_id
      join public.atividades a on a.id = i.atividade_id
      join public.orcamento_fontes f on f.id = x.fonte_id
     where x.remanejamento_id = p_rem and x.ativo
     order by a.codigo, f.criado_em, f.id
  loop
    insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, ajusta_fonte_id, remanejamento_id, descricao, criado_por)
    values (o.atividade_id, 'remanejamento_cedido', -o.valor_usd, o.fonte_id, p_rem,
            'Cedido em ' || v_rem.numero, p_usuario);
    v_origens := v_origens || jsonb_build_object('fonte_id', o.fonte_id, 'codigo', o.codigo, 'valor', o.valor_usd);
  end loop;

  for d in
    select i.atividade_id, a.codigo, i.valor_usd
      from public.remanejamento_itens i join public.atividades a on a.id = i.atividade_id
     where i.remanejamento_id = p_rem and i.valor_usd > 0 and i.ativo
     order by a.codigo
  loop
    v_destinos := v_destinos || jsonb_build_object('atividade_id', d.atividade_id, 'codigo', d.codigo, 'valor', d.valor_usd);
  end loop;

  v_resto_o := (v_origens->0->>'valor')::numeric;
  v_resto_d := (v_destinos->0->>'valor')::numeric;
  while i < jsonb_array_length(v_origens) and j < jsonb_array_length(v_destinos) loop
    v_x := least(v_resto_o, v_resto_d);
    insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, fonte_origem_id, remanejamento_id, descricao, criado_por)
    values ((v_destinos->j->>'atividade_id')::uuid, 'remanejamento_recebido', v_x,
            (v_origens->i->>'fonte_id')::uuid, p_rem,
            'Recebido em ' || v_rem.numero || ' de ' || (v_origens->i->>'codigo'), p_usuario);
    v_resto_o := v_resto_o - v_x;
    v_resto_d := v_resto_d - v_x;
    if v_resto_o = 0 then
      i := i + 1;
      if i < jsonb_array_length(v_origens) then v_resto_o := (v_origens->i->>'valor')::numeric; end if;
    end if;
    if v_resto_d = 0 then
      j := j + 1;
      if j < jsonb_array_length(v_destinos) then v_resto_d := (v_destinos->j->>'valor')::numeric; end if;
    end if;
  end loop;
  if i < jsonb_array_length(v_origens) or j < jsonb_array_length(v_destinos) then
    raise exception 'REM: pareamento origem × destino não fechou (bug) — nada foi gravado.';
  end if;

  update public.remanejamentos
     set status = 'efetivado', efetivado_em = now(), etapa_atual = null
   where id = p_rem;
  perform fn_rem_log(p_rem, 'efetivado', 'em_aprovacao', 'efetivado', null, p_usuario, null,
                     jsonb_build_object('origens', v_origens, 'destinos', v_destinos));
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_efetivar_estorno(p_rem uuid, p_usuario uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rem  public.remanejamentos;
  v_orig public.remanejamentos;
  f record;
  v_n integer := 0;
begin
  select * into v_rem from public.remanejamentos where id = p_rem;
  select * into v_orig from public.remanejamentos where id = v_rem.estorno_de for update;

  for f in
    select * from public.orcamento_fontes
     where remanejamento_id = v_orig.id and estorno_de is null
     order by case tipo when 'remanejamento_recebido' then 0 else 1 end, criado_em, id
  loop
    insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, ajusta_fonte_id, estorno_de,
                                         fonte_origem_id, remanejamento_id, descricao, criado_por)
    values (f.atividade_id, f.tipo, -f.valor_usd, coalesce(f.ajusta_fonte_id, f.id), f.id,
            f.fonte_origem_id, p_rem, 'Estorno de ' || v_orig.numero || ' (' || v_rem.numero || ')', p_usuario);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'REM: % não tem lançamentos para estornar (bug).', v_orig.numero; end if;

  update public.remanejamentos set status = 'efetivado', efetivado_em = now(), etapa_atual = null where id = p_rem;
  update public.remanejamentos set status = 'estornado', encerrado_em = now(),
         motivo_encerramento = 'estornado por ' || v_rem.numero where id = v_orig.id;
  perform fn_rem_log(p_rem, 'efetivado', 'em_aprovacao', 'efetivado', null, p_usuario, null,
                     jsonb_build_object('estorno_de', v_orig.numero, 'lancamentos', v_n));
  perform fn_rem_log(v_orig.id, 'estornado', 'efetivado', 'estornado', null, p_usuario, null,
                     jsonb_build_object('pedido_estorno', v_rem.numero));
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_fonte_livre(p_fonte_id uuid, p_remanejamento_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (fs.disponivel_usd
          - coalesce((select sum(rr.reservado_usd) from public.vw_rem_reservas rr
                       where rr.fonte_id = fs.fonte_id and rr.remanejamento_id is distinct from p_remanejamento_id), 0)
         )::numeric(14,2)
    from public.vw_orcamento_fontes_saldo fs
   where fs.fonte_id = p_fonte_id
     and fs.atividade_id = (select atividade_id from public.orcamento_fontes where id = p_fonte_id)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_hash(p_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'numero', r.numero, 'tipo', r.tipo, 'contrato_id', r.contrato_id,
    'justificativa', r.justificativa, 'versao', r.versao,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('atividade_id', i.atividade_id, 'valor_usd', i.valor_usd)
                                        order by i.atividade_id), '[]'::jsonb)
                from public.remanejamento_itens i where i.remanejamento_id = r.id and i.ativo),
    'alocacoes', (select coalesce(jsonb_agg(jsonb_build_object('atividade_id', i.atividade_id, 'fonte_id', a.fonte_id,
                                                               'valor_usd', a.valor_usd)
                                            order by i.atividade_id, a.fonte_id), '[]'::jsonb)
                    from public.remanejamento_alocacoes a join public.remanejamento_itens i on i.id = a.item_id
                   where a.remanejamento_id = r.id and a.ativo)
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.remanejamentos r where r.id = p_id
$function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_log(p_rem uuid, p_evento text, p_de text, p_para text, p_etapa integer, p_usuario uuid, p_motivo text, p_detalhes jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.remanejamento_historico (remanejamento_id, evento, status_de, status_para, etapa_ordem, versao, usuario_id, motivo, detalhes)
  select p_rem, p_evento, p_de, p_para, p_etapa, r.versao, p_usuario, nullif(btrim(p_motivo), ''), p_detalhes
    from public.remanejamentos r where r.id = p_rem
$function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_notificar(p_rem uuid, p_usuarios uuid[], p_evento text, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_numero text;
  v_titulo text;
  u uuid;
begin
  select numero into v_numero from public.remanejamentos where id = p_rem;
  v_titulo := case p_evento
    when 'analisar'  then 'Remanejamento ' || v_numero || ' aguarda sua análise'
    when 'devolvido' then 'Remanejamento ' || v_numero || ' foi devolvido para você'
    when 'recusado'  then 'Remanejamento ' || v_numero || ' foi recusado'
    when 'efetivado' then 'Remanejamento ' || v_numero || ' foi efetivado'
    else 'Remanejamento ' || v_numero || ' foi cancelado' end;
  foreach u in array coalesce(p_usuarios, '{}') loop
    if u is null then continue; end if;
    insert into public.remanejamento_notificacoes (remanejamento_id, usuario_id, evento, motivo)
    values (p_rem, u, p_evento, nullif(btrim(p_motivo), ''));
    begin
      insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
      values (u, 'remanejamento_' || p_evento, v_titulo, nullif(btrim(p_motivo), ''),
              'remanejamentos.html?id=' || p_rem, 'remanejamento', p_rem);
    exception when others then null;
    end;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_registrar_tentativa(p_usuario_id uuid, p_sucesso boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.rem_tentativas_senha (usuario_id, sucesso) values (p_usuario_id, p_sucesso)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_salvar(p_id uuid, p_dados jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_rem  public.remanejamentos;
  v_ano  integer := extract(year from fn_hoje_acre())::integer;
  v_seq  integer;
  v_it   jsonb;
  v_item uuid;
  v_tipo text := 'livre';
  v_contrato uuid;
begin
  if coalesce(fn_perfil_atual()::text, '') not in ('coordenacao','super_admin') then
    raise exception 'Sem permissão: só a coordenação monta pedido de remanejamento.';
  end if;
  if p_id is null then
    v_tipo := coalesce(p_dados->>'tipo', 'livre');
    if v_tipo not in ('livre','cobertura_contrato') then
      raise exception 'REM: tipo de pedido inválido: %', v_tipo;
    end if;
    if v_tipo = 'cobertura_contrato' then
      v_contrato := nullif(p_dados->>'contrato_id', '')::uuid;
      if not exists (select 1 from public.contratos where id = v_contrato and status = 'aguardando_cobertura') then
        raise exception 'COBERTURA: o contrato informado não está aguardando cobertura.';
      end if;
    end if;
  end if;

  if p_id is null then
    if p_dados ? 'uuid_cliente' then
      select * into v_rem from public.remanejamentos where uuid_cliente = (p_dados->>'uuid_cliente')::uuid;
      if found then return v_rem.id; end if;
    end if;
    insert into public.rem_numeracao (ano, ultimo) values (v_ano, 1)
      on conflict (ano) do update set ultimo = public.rem_numeracao.ultimo + 1
      returning ultimo into v_seq;
    insert into public.remanejamentos (numero, tipo, contrato_id, justificativa, uuid_cliente, criado_por)
    values ('REM-' || v_ano || '-' || lpad(v_seq::text, 3, '0'), v_tipo, v_contrato,
            coalesce(nullif(btrim(p_dados->>'justificativa'), ''), '(rascunho)'),
            (p_dados->>'uuid_cliente')::uuid, v_uid)
    returning * into v_rem;
    perform fn_rem_log(v_rem.id, 'criado', null, 'rascunho', null, v_uid, null);
  else
    select * into v_rem from public.remanejamentos where id = p_id for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if v_rem.criado_por <> v_uid and coalesce(fn_perfil_atual()::text, '') <> 'super_admin' then
      raise exception 'Só quem criou o pedido o edita.';
    end if;
    if v_rem.status = 'em_aprovacao' and v_rem.etapa_atual = 1 then
      update public.remanejamento_assinaturas
         set invalidada_em = now(), invalidada_motivo = 'pedido editado pelo solicitante (nova versão)'
       where remanejamento_id = v_rem.id and versao = v_rem.versao and invalidada_em is null;
      update public.remanejamentos set status = 'rascunho', etapa_atual = null, versao = versao + 1
       where id = v_rem.id returning * into v_rem;
      perform fn_rem_log(v_rem.id, 'editado_apos_devolucao', 'em_aprovacao', 'rascunho', 1, v_uid, null);
    elsif v_rem.status <> 'rascunho' then
      raise exception 'Pedido % em % não pode ser editado.', v_rem.numero, v_rem.status;
    end if;
    if v_rem.estorno_de is not null and p_dados ? 'itens' then
      raise exception 'REM: pedido de estorno espelha o original — só a justificativa é editável.';
    end if;
    update public.remanejamentos
       set justificativa = coalesce(nullif(btrim(p_dados->>'justificativa'), ''), justificativa)
     where id = v_rem.id;
  end if;

  if p_dados ? 'itens' then
    update public.remanejamento_alocacoes set ativo = false where remanejamento_id = v_rem.id and ativo;
    update public.remanejamento_itens     set ativo = false where remanejamento_id = v_rem.id and ativo;
    for v_it in select * from jsonb_array_elements(p_dados->'itens') loop
      insert into public.remanejamento_itens (remanejamento_id, atividade_id, valor_usd)
      values (v_rem.id, (v_it->>'atividade_id')::uuid, round((v_it->>'valor_usd')::numeric, 2))
      on conflict (remanejamento_id, atividade_id)
        do update set valor_usd = excluded.valor_usd, ativo = true;
    end loop;
    for v_it in select * from jsonb_array_elements(coalesce(p_dados->'alocacoes', '[]'::jsonb)) loop
      select id into v_item from public.remanejamento_itens
       where remanejamento_id = v_rem.id and atividade_id = (v_it->>'atividade_id')::uuid and valor_usd < 0 and ativo;
      if v_item is null then
        raise exception 'Alocação para atividade que não é origem do pedido: %', v_it->>'atividade_id';
      end if;
      insert into public.remanejamento_alocacoes (remanejamento_id, item_id, fonte_id, valor_usd)
      values (v_rem.id, v_item, (v_it->>'fonte_id')::uuid, round((v_it->>'valor_usd')::numeric, 2))
      on conflict (item_id, fonte_id)
        do update set valor_usd = excluded.valor_usd, ativo = true;
    end loop;
  end if;

  update public.remanejamentos set hash_documento = fn_rem_hash(id) where id = v_rem.id;
  perform fn_rem_log(v_rem.id, 'rascunho_salvo', null, null, null, v_uid, null);
  return v_rem.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_senha_bloqueada_ate(p_usuario_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ult_ok as (
    select coalesce(max(criado_em), '-infinity'::timestamptz) as t
      from public.rem_tentativas_senha where usuario_id = p_usuario_id and sucesso
  ), falhas as (
    select criado_em from public.rem_tentativas_senha, ult_ok
     where usuario_id = p_usuario_id and not sucesso
       and criado_em > ult_ok.t and criado_em > now() - interval '30 minutes'
  )
  select case when (select count(*) from falhas) >= 5
              then (select max(criado_em) from falhas) + interval '30 minutes' end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_signatarios_etapa(p_etapa_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct u.id
    from public.remanejamento_etapas e
    join public.usuarios u on u.ativo
   where e.id = p_etapa_id
     and (
       (e.papel = 'liberacao_origem' and exists (
          select 1 from public.atividade_responsaveis r
           where r.atividade_id = e.atividade_id and r.usuario_id = u.id and r.ativo and r.papel = 'responsavel'))
       or (e.papel <> 'liberacao_origem' and u.id = public.fn_rem_titular(e.cargo))
     )
$function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_titular(p_cargo text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.usuario_id from public.rem_cargo_titulares t
    join public.usuarios u on u.id = t.usuario_id and u.ativo
   where t.cargo = p_cargo and t.vigencia_fim is null
$function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_validar(p_rem uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_soma numeric; v_n_or integer; v_n_de integer;
  r record;
begin
  if (select btrim(justificativa) in ('', '(rascunho)') or length(btrim(justificativa)) < 15
        from public.remanejamentos where id = p_rem) then
    raise exception 'REM_INVALIDO: escreva a justificativa do remanejamento (mínimo 15 caracteres).';
  end if;
  select coalesce(sum(valor_usd), 0), count(*) filter (where valor_usd < 0), count(*) filter (where valor_usd > 0)
    into v_soma, v_n_or, v_n_de
    from public.remanejamento_itens where remanejamento_id = p_rem and ativo;
  if v_n_or = 0 or v_n_de = 0 then
    raise exception 'REM_INVALIDO: o pedido precisa de ao menos uma origem (valor negativo) e um destino (positivo).';
  end if;
  if v_soma <> 0 then
    raise exception 'REM_INVALIDO: a soma dos itens precisa ser zero (está em US$ %).', v_soma;
  end if;

  for r in
    select i.id, i.atividade_id, a.codigo, a.ativo, i.valor_usd,
           coalesce((select sum(x.valor_usd) from public.remanejamento_alocacoes x where x.item_id = i.id and x.ativo), 0) as alocado
      from public.remanejamento_itens i join public.atividades a on a.id = i.atividade_id
     where i.remanejamento_id = p_rem and i.ativo
  loop
    if not r.ativo then raise exception 'REM_INVALIDO: atividade % inativa.', r.codigo; end if;
    if r.valor_usd > 0 and r.alocado <> 0 then
      raise exception 'REM_INVALIDO: destino % não leva alocação de fonte.', r.codigo;
    end if;
    if r.valor_usd < 0 and r.alocado <> -r.valor_usd then
      raise exception 'REM_INVALIDO: as fontes alocadas na origem % somam US$ %, mas a cessão é de US$ %.',
        r.codigo, r.alocado, -r.valor_usd;
    end if;
    if r.valor_usd < 0 and (select tdrs_sem_valor_usd from public.vw_orcamento_debitos where atividade_id = r.atividade_id) > 0 then
      raise exception 'REM_INVALIDO: a origem % tem TDR ativo sem valor em USD — o débito é desconhecido.', r.codigo;
    end if;
  end loop;

  for r in
    select x.fonte_id, x.valor_usd, i.atividade_id, a.codigo, f.atividade_id as fonte_atividade, f.ajusta_fonte_id
      from public.remanejamento_alocacoes x
      join public.remanejamento_itens i on i.id = x.item_id
      join public.atividades a on a.id = i.atividade_id
      join public.orcamento_fontes f on f.id = x.fonte_id
     where x.remanejamento_id = p_rem and x.ativo
  loop
    if r.fonte_atividade <> r.atividade_id or r.ajusta_fonte_id is not null then
      raise exception 'REM_INVALIDO: a fonte % não é um crédito da atividade %.', r.fonte_id, r.codigo;
    end if;
    if r.valor_usd > public.fn_rem_fonte_livre(r.fonte_id, p_rem) then
      raise exception 'SALDO_INSUFICIENTE: a fonte % da atividade % tem US$ % livre, e o pedido aloca US$ %.',
        r.fonte_id, r.codigo, public.fn_rem_fonte_livre(r.fonte_id, p_rem), r.valor_usd;
    end if;
  end loop;

  if (select tipo from public.remanejamentos where id = p_rem) = 'cobertura_contrato'
     and not exists (
       select 1 from public.remanejamento_itens i
         join public.remanejamentos rq on rq.id = i.remanejamento_id
         join public.contratos c on c.id = rq.contrato_id
         left join public.tdrs t on t.id = c.tdr_id
        where i.remanejamento_id = p_rem and i.ativo and i.valor_usd > 0
          and i.atividade_id = coalesce(t.atividade_id, c.atividade_id)) then
    raise exception 'REM_INVALIDO: pedido de cobertura precisa ter como destino a atividade do contrato.';
  end if;
  -- estorno: tem de ser o espelho exato do original, que segue efetivado e intacto
  perform fn_rem_validar_estorno(p_rem);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_validar_estorno(p_rem uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rem  public.remanejamentos;
  v_orig public.remanejamentos;
  r record;
begin
  select * into v_rem from public.remanejamentos where id = p_rem;
  if v_rem.estorno_de is null then return; end if;
  select * into v_orig from public.remanejamentos where id = v_rem.estorno_de;
  if v_orig.status <> 'efetivado' then
    raise exception 'REM_INVALIDO: só se estorna remanejamento efetivado (% está %).', v_orig.numero, v_orig.status;
  end if;
  if exists (select 1 from public.remanejamentos x
              where x.estorno_de = v_orig.id and x.id <> p_rem
                and x.status in ('rascunho','em_aprovacao','efetivado')) then
    raise exception 'REM_INVALIDO: já existe outro pedido de estorno de %.', v_orig.numero;
  end if;

  if exists (
       select atividade_id, -valor_usd from public.remanejamento_itens where remanejamento_id = v_orig.id and ativo
       except
       select atividade_id, valor_usd from public.remanejamento_itens where remanejamento_id = p_rem and ativo)
     or exists (
       select atividade_id, valor_usd from public.remanejamento_itens where remanejamento_id = p_rem and ativo
       except
       select atividade_id, -valor_usd from public.remanejamento_itens where remanejamento_id = v_orig.id and ativo) then
    raise exception 'REM_INVALIDO: o estorno precisa inverter exatamente os itens de %.', v_orig.numero;
  end if;

  for r in
    select f.id, f.valor_usd, a.codigo,
           (select coalesce(sum(j.valor_usd), 0) from public.orcamento_fontes j where j.ajusta_fonte_id = f.id) as ajustes,
           coalesce((select sum(x.valor_usd) from public.remanejamento_alocacoes x
                      where x.remanejamento_id = p_rem and x.fonte_id = f.id and x.ativo), 0) as alocado
      from public.orcamento_fontes f join public.atividades a on a.id = f.atividade_id
     where f.remanejamento_id = v_orig.id and f.tipo = 'remanejamento_recebido' and f.estorno_de is null
  loop
    if r.ajustes <> 0 then
      raise exception 'REM_INVALIDO: o valor recebido por % em % já foi repassado/ajustado — estorne antes o que veio depois.',
        r.codigo, v_orig.numero;
    end if;
    if r.alocado <> r.valor_usd then
      raise exception 'REM_INVALIDO: o estorno devolve o recebido por % inteiro (US$ %), não US$ %.', r.codigo, r.valor_usd, r.alocado;
    end if;
  end loop;
  if exists (select 1 from public.remanejamento_alocacoes x
              where x.remanejamento_id = p_rem and x.ativo
                and not exists (select 1 from public.orcamento_fontes f
                                 where f.id = x.fonte_id and f.remanejamento_id = v_orig.id
                                   and f.tipo = 'remanejamento_recebido')) then
    raise exception 'REM_INVALIDO: o estorno só devolve as fontes recebidas em %.', v_orig.numero;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_remover_participante(p_tarefa_id uuid, p_usuario_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_nome text; v_papel text;
begin
  if not fn_tarefa_pode_editar(p_tarefa_id) then
    raise exception 'sem permissão';
  end if;
  delete from tarefa_participantes where tarefa_id = p_tarefa_id and usuario_id = p_usuario_id
  returning papel into v_papel;
  if v_papel is not null then
    select nome_completo into v_nome from usuarios where id = p_usuario_id;
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (p_tarefa_id, auth.uid(), 'remocao',
            coalesce(v_nome,'—') || case when v_papel = 'observador' then ' (observador)' else '' end);
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_resetar_senha_usuario(p_usuario_id uuid, p_nova_senha text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
begin
  if not exists (
    select 1 from public.usuarios
     where id = auth.uid() and ativo and perfil = 'super_admin'
  ) then
    raise exception 'Apenas super_admin pode resetar senhas.';
  end if;

  if coalesce(length(p_nova_senha), 0) < 8 then
    raise exception 'A senha temporária precisa ter pelo menos 8 caracteres.';
  end if;

  update auth.users set
    encrypted_password = crypt(p_nova_senha, gen_salt('bf')),
    updated_at = now()
  where id = p_usuario_id;

  update public.usuarios set
    deve_trocar_senha      = true,
    senha_temporaria_usada = false,
    atualizado_em          = now()
  where id = p_usuario_id;

  update public.solicitacoes_senha set
    status       = 'atendido',
    atendido_por = auth.uid(),
    atendido_em  = now()
  where usuario_id = p_usuario_id and status = 'pendente';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_status_indicador(p_valor_atingido numeric, p_meta numeric, p_data_inicio date DEFAULT '2025-04-01'::date, p_data_fim date DEFAULT '2027-03-31'::date)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_duracao_total int;
  v_decorrido int;
  v_pct_tempo numeric;
  v_pct_atingido numeric;
begin
  if p_meta is null or p_meta = 0 then return 'nao_iniciado'; end if;
  v_duracao_total := p_data_fim - p_data_inicio;
  v_decorrido := least(current_date - p_data_inicio, v_duracao_total);
  v_pct_tempo := v_decorrido::numeric / v_duracao_total;
  v_pct_atingido := p_valor_atingido / p_meta;
  if v_pct_atingido >= 1 then return 'concluido';
  elsif v_pct_atingido >= (v_pct_tempo - 0.2) then return 'no_prazo';
  elsif v_pct_atingido > 0 then return 'em_risco';
  else return 'nao_iniciado';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_anexo_coerente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.comentario_id is not null and not exists (
       select 1 from tarefa_comentarios where id = new.comentario_id and tarefa_id = new.tarefa_id) then
    raise exception 'comentário não pertence a esta tarefa';
  end if;
  if new.checklist_id is not null and not exists (
       select 1 from tarefa_checklist where id = new.checklist_id and tarefa_id = new.tarefa_id) then
    raise exception 'subtarefa não pertence a esta tarefa';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_anexo_historico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.comentario_id is null then
      insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
      values (new.tarefa_id, auth.uid(), 'anexo', new.arquivo_nome);
    end if;
  elsif exists (select 1 from tarefas where id = old.tarefa_id) then
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (old.tarefa_id, auth.uid(), 'anexo_removido', old.arquivo_nome);
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_aprovador(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from tarefas t
    left join usuarios u on u.id = t.criado_por
    where t.id = p_id
      and ( t.criado_por = auth.uid()
         or (fn_perfil_atual() = 'super_admin' and (u.id is null or not coalesce(u.ativo, false))) )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_atividade_limpa_tdrs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.atividade_id is not distinct from old.atividade_id then return new; end if;
  delete from tarefa_tdrs tt using tdrs d
  where tt.tarefa_id = new.id and d.id = tt.tdr_id
    and d.atividade_id is distinct from new.atividade_id;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_checklist_historico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d jsonb := '[]'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (new.tarefa_id, auth.uid(), 'subtarefa_criada', left(new.descricao, 80));
    return null;
  end if;
  if tg_op = 'DELETE' then
    if not exists (select 1 from tarefas where id = old.tarefa_id) then return null; end if;
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (old.tarefa_id, auth.uid(), 'subtarefa_excluida', left(old.descricao, 80));
    return null;
  end if;
  if new.concluida is distinct from old.concluida then
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (new.tarefa_id, auth.uid(), case when new.concluida then 'subtarefa_concluida' else 'subtarefa_reaberta' end,
            left(new.descricao, 80));
  end if;
  if new.descricao is distinct from old.descricao then
    d := d || jsonb_build_object('campo','Descrição','de',old.descricao,'para',new.descricao);
  end if;
  if new.dt_prazo is distinct from old.dt_prazo then
    d := d || jsonb_build_object('campo','Prazo','de',fn_hist_fmt('date',old.dt_prazo::text),'para',fn_hist_fmt('date',new.dt_prazo::text));
  end if;
  if jsonb_array_length(d) > 0 then
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para, detalhes)
    values (new.tarefa_id, auth.uid(), 'subtarefa_editada', left(new.descricao, 80), d);
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_checklist_responsavel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cod text; v_tit text; v_nome text; v_novo_obs boolean := false;
begin
  if tg_op = 'UPDATE'
     and new.responsavel_usuario_id    is not distinct from old.responsavel_usuario_id
     and new.responsavel_fornecedor_id is not distinct from old.responsavel_fornecedor_id then
    return new;
  end if;
  if new.responsavel_usuario_id is null and new.responsavel_fornecedor_id is null then
    return new;
  end if;

  select codigo, titulo into v_cod, v_tit from tarefas where id = new.tarefa_id;

  if new.responsavel_usuario_id is not null then
    insert into tarefa_participantes (tarefa_id, usuario_id, papel)
    values (new.tarefa_id, new.responsavel_usuario_id, 'observador')
    on conflict (tarefa_id, usuario_id) do nothing;
    v_novo_obs := found;

    select nome_completo into v_nome from usuarios where id = new.responsavel_usuario_id;

    perform fn_tarefa_notificar(array[new.responsavel_usuario_id], 'tarefa_subtarefa',
      'Subtarefa atribuída: ' || coalesce(v_cod,''),
      left(new.descricao, 120) ||
        case when new.dt_prazo is not null then ' · prazo ' || to_char(new.dt_prazo,'DD/MM/YYYY') else '' end,
      new.tarefa_id, auth.uid());

    if v_novo_obs then
      insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
      values (new.tarefa_id, auth.uid(), 'responsavel', coalesce(v_nome,'—') || ' (observador)');
    end if;
  else
    select nome into v_nome from fornecedores where id = new.responsavel_fornecedor_id;
  end if;

  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para)
  values (new.tarefa_id, auth.uid(), 'subtarefa_resp', left(new.descricao, 60),
          case when new.responsavel_fornecedor_id is not null then '🏢 ' else '' end || coalesce(v_nome,'—'));
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_guarda_restrita()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.restrita is not distinct from old.restrita then return new; end if;
  if auth.uid() is not null and auth.uid() <> old.criado_por
     and fn_perfil_atual() is distinct from 'super_admin' then
    raise exception 'só quem criou a tarefa pode alterar a restrição';
  end if;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para)
  values (new.id, auth.uid(), 'restricao',
          case when old.restrita then 'restrita' else 'aberta' end,
          case when new.restrita then 'restrita' else 'aberta' end);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_guarda_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status
     and auth.uid() is not null
     and coalesce(current_setting('dima.tarefa_status_rpc', true), '') <> '1' then
    raise exception 'O status da tarefa só muda pelo painel (fn_mudar_status_tarefa).';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_id_do_path(p_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case when (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(p_name))[1])::uuid end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_notificar(p_usuarios uuid[], p_tipo text, p_titulo text, p_msg text, p_tarefa_id uuid, p_excluir uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare u uuid;
begin
  if p_usuarios is null then return; end if;
  foreach u in array p_usuarios loop
    if u is null or u = p_excluir then continue; end if;
    insert into notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
    values (u, p_tipo, p_titulo, p_msg,
            'tarefas.html?tarefa=' || p_tarefa_id::text, 'tarefa', p_tarefa_id);
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_pessoal(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not exists (
    select 1 from tarefa_participantes tp join tarefas t on t.id = tp.tarefa_id
    where tp.tarefa_id = p_id and tp.papel = 'responsavel' and tp.usuario_id <> t.criado_por
  );
$function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_pode_delegar(p_atividade_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    fn_perfil_atual() in ('super_admin','coordenacao')
    or (p_atividade_id is not null and exists (
          select 1 from atividade_responsaveis ar
          where ar.atividade_id = p_atividade_id
            and ar.usuario_id = auth.uid()
            and ar.ativo = true));
$function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_pode_editar(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from tarefas t
    where t.id = p_id
      and (
        t.criado_por = auth.uid()
        or fn_perfil_atual() = 'super_admin'
        or exists (select 1 from tarefa_participantes tp
                   where tp.tarefa_id = t.id and tp.usuario_id = auth.uid()
                     and tp.papel = 'responsavel')
        or (not t.restrita and (
              fn_perfil_atual() = 'coordenacao'
              or (t.atividade_id is not null and exists (
                    select 1 from atividade_responsaveis ar
                    where ar.atividade_id = t.atividade_id
                      and ar.usuario_id = auth.uid() and ar.ativo = true))))
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_registra_edicao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d jsonb := '[]'::jsonb;
  c jsonb;
  v_de text; v_para text;
  v_motivo text := nullif(btrim(current_setting('dima.motivo_edicao', true)), '');
begin
  if new.titulo is distinct from old.titulo then
    d := d || jsonb_build_object('campo','Título','de',old.titulo,'para',new.titulo);
  end if;
  if new.descricao is distinct from old.descricao then
    d := d || jsonb_build_object('campo','Descrição','de',coalesce(old.descricao,''),'para',coalesce(new.descricao,''),'longo',true);
  end if;
  if new.prioridade is distinct from old.prioridade then
    d := d || jsonb_build_object('campo','Prioridade','de',fn_hist_fmt('prioridade',old.prioridade::text),'para',fn_hist_fmt('prioridade',new.prioridade::text));
  end if;
  if new.dt_inicio is distinct from old.dt_inicio then
    d := d || jsonb_build_object('campo','Início','de',fn_hist_fmt('date',old.dt_inicio::text),'para',fn_hist_fmt('date',new.dt_inicio::text));
  end if;
  if new.dt_prazo is distinct from old.dt_prazo then
    d := d || jsonb_build_object('campo','Prazo','de',fn_hist_fmt('date',old.dt_prazo::text),'para',fn_hist_fmt('date',new.dt_prazo::text));
  end if;
  if new.atividade_id is distinct from old.atividade_id then
    select codigo into v_de   from atividades where id = old.atividade_id;
    select codigo into v_para from atividades where id = new.atividade_id;
    d := d || jsonb_build_object('campo','Atividade','de',coalesce(v_de,'—'),'para',coalesce(v_para,'—'));
  end if;
  if new.fornecedor_id is distinct from old.fornecedor_id then
    select nome into v_de   from fornecedores where id = old.fornecedor_id;
    select nome into v_para from fornecedores where id = new.fornecedor_id;
    d := d || jsonb_build_object('campo','Fornecedor','de',coalesce(v_de,'—'),'para',coalesce(v_para,'—'));
  end if;
  if new.notificar_fornecedor is distinct from old.notificar_fornecedor then
    d := d || jsonb_build_object('campo','E-mail ao fornecedor','de',fn_hist_fmt('boolean',old.notificar_fornecedor::text),'para',fn_hist_fmt('boolean',new.notificar_fornecedor::text));
  end if;
  if new.dados_tipo is distinct from old.dados_tipo then
    for c in select * from jsonb_array_elements(coalesce((select campos from tarefa_tipos where codigo = new.tipo), '[]')) loop
      v_de   := old.dados_tipo ->> (c->>'chave');
      v_para := new.dados_tipo ->> (c->>'chave');
      if v_de is distinct from v_para then
        d := d || jsonb_build_object('campo', c->>'rotulo',
               'de', fn_hist_fmt(c->>'tipo', v_de), 'para', fn_hist_fmt(c->>'tipo', v_para),
               'longo', (c->>'tipo') = 'textarea');
      end if;
    end loop;
  end if;

  if jsonb_array_length(d) = 0 then return null; end if;

  if jsonb_array_length(d) = 1 and d->0->>'campo' = 'Prazo' then
    insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para, motivo)
    values (new.id, auth.uid(), 'prazo', d->0->>'de', d->0->>'para', v_motivo);
  else
    insert into tarefa_historico (tarefa_id, autor_id, tipo, para, detalhes, motivo)
    values (new.id, auth.uid(), 'edicao',
            jsonb_array_length(d) || case when jsonb_array_length(d) = 1 then ' campo' else ' campos' end,
            d, v_motivo);
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_set_codigo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.codigo is null then
    new.codigo := 'TR-' || lpad(nextval('seq_tarefa_codigo')::text, 3, '0');
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_tdr_coerente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_atv_tarefa uuid; v_atv_tdr uuid;
begin
  select atividade_id into v_atv_tarefa from tarefas where id = new.tarefa_id;
  select atividade_id into v_atv_tdr from tdrs where id = new.tdr_id;
  if v_atv_tdr is null then raise exception 'TDR não encontrado'; end if;
  if v_atv_tarefa is null or v_atv_tarefa <> v_atv_tdr then
    raise exception 'o TDR precisa ser da atividade vinculada à tarefa';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_tdr_historico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_num text; v_tarefa uuid := coalesce(new.tarefa_id, old.tarefa_id);
begin
  select numero into v_num from tdrs where id = coalesce(new.tdr_id, old.tdr_id);
  if not exists (select 1 from tarefas where id = v_tarefa) then return null; end if;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (v_tarefa, auth.uid(), case when tg_op = 'INSERT' then 'tdr_vinculo' else 'tdr_desvinculo' end,
          coalesce(v_num, 'TDR'));
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_tipo_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.codigo <> old.codigo then raise exception 'o código do tipo não pode mudar'; end if;
  if old.codigo = 'outras' and not new.ativo then raise exception 'o tipo "Outras" é o padrão e não pode ser desativado'; end if;
  new.atualizado_em := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_tipo_historico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_de text; v_para text;
begin
  if new.tipo is not distinct from old.tipo then return null; end if;
  select nome into v_de from tarefa_tipos where codigo = old.tipo;
  select nome into v_para from tarefa_tipos where codigo = new.tipo;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para)
  values (new.id, auth.uid(), 'tipo', v_de, v_para);
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.atualizado_em := now(); return new; end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tarefa_valida_tipo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tipo tarefa_tipos; c jsonb;
begin
  if tg_op = 'UPDATE' and new.tipo is not distinct from old.tipo
     and new.dados_tipo is not distinct from old.dados_tipo then
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tcan_assinar(p_usuario_id uuid, p_cancelamento_id uuid, p_decisao text, p_motivo text, p_hash text, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.tdr_cancelamentos;
  v_etapa  public.tdr_cancelamento_etapas;
  v_ant    public.tdr_cancelamento_etapas;
  v_prox   public.tdr_cancelamento_etapas;
  v_total  integer;
  v_ass    uuid;
  v_titular uuid;
  v_avisar uuid[];
begin
  if p_decisao not in ('aprovar','devolver','recusar','cancelar') then
    raise exception 'Decisão inválida: %', p_decisao;
  end if;
  if not exists (select 1 from public.usuarios where id = p_usuario_id and ativo) then
    raise exception 'Usuário inexistente ou inativo.';
  end if;

  select * into c from public.tdr_cancelamentos where id = p_cancelamento_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if p_hash is distinct from fn_tcan_hash(c.id) then
    raise exception 'DOCUMENTO_ALTERADO: o pedido ou o TDR mudou depois que você o abriu. Recarregue e confira antes de assinar.';
  end if;

  if p_decisao = 'cancelar' then
    if not (c.status = 'rascunho' or (c.status = 'em_aprovacao' and c.etapa_atual = 1)) then
      raise exception 'Só dá para cancelar o pedido em rascunho ou quando ele está devolvido ao solicitante.';
    end if;
    if p_usuario_id is distinct from c.criado_por and p_usuario_id is distinct from fn_rem_titular('coordenacao_solicitante') then
      raise exception 'Só o solicitante cancela o pedido.';
    end if;
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;
    update public.tdr_cancelamento_assinaturas set invalidada_em = now(), invalidada_motivo = 'pedido cancelado'
     where cancelamento_id = c.id and versao = c.versao and invalidada_em is null;
    update public.tdr_cancelamentos set status = 'cancelado', etapa_atual = null, encerrado_em = now(),
           motivo_encerramento = btrim(p_motivo) where id = c.id;
    perform fn_tcan_log(c.id, 'cancelado', c.status, 'cancelado', c.etapa_atual, p_usuario_id, p_motivo);
    return jsonb_build_object('status', 'cancelado');
  end if;

  if c.status = 'rascunho' then
    if p_decisao <> 'aprovar' then raise exception 'Pedido em rascunho: só é possível enviar ou cancelar.'; end if;
    v_titular := fn_rem_titular('coordenacao_solicitante');
    if v_titular is null then raise exception 'SEM_SIGNATARIO: o cargo de coordenação solicitante está sem titular.'; end if;
    if p_usuario_id is distinct from v_titular then
      raise exception 'Só o titular da coordenação solicitante envia o pedido.';
    end if;
    perform fn_tcan_validar(c.id);
    perform fn_tcan_retrato(c.id);
    select * into c from public.tdr_cancelamentos where id = c.id;

    insert into public.tdr_cancelamento_etapas (cancelamento_id, versao, ordem, papel, cargo, atividade_id) values
      (c.id, c.versao, 1, 'solicitacao',           'coordenacao_solicitante', null),
      (c.id, c.versao, 2, 'responsavel_atividade', null,                      c.atividade_id),
      (c.id, c.versao, 3, 'unesco',                'unesco_financeiro',       null);

    for v_etapa in select * from public.tdr_cancelamento_etapas
                    where cancelamento_id = c.id and versao = c.versao order by ordem loop
      if not exists (select 1 from fn_tcan_signatarios_etapa(v_etapa.id)) then
        raise exception 'SEM_SIGNATARIO: a etapa % (%) não tem quem assine%.', v_etapa.ordem,
          coalesce((select codigo from public.atividades where id = v_etapa.atividade_id), v_etapa.cargo),
          case when v_etapa.papel = 'responsavel_atividade'
               then ' — a atividade precisa de um responsável que não seja titular da coordenação nem da UNESCO' else '' end;
      end if;
    end loop;

    select * into v_etapa from public.tdr_cancelamento_etapas
     where cancelamento_id = c.id and versao = c.versao and ordem = 1;
    update public.tdr_cancelamentos set status = 'em_aprovacao', submetido_em = now(), etapa_atual = 1
     where id = c.id returning * into c;
    perform fn_tcan_log(c.id, 'enviado', 'rascunho', 'em_aprovacao', 1, p_usuario_id, null);
  else
    if c.status <> 'em_aprovacao' then
      raise exception 'Pedido % está % — nada a assinar.', c.numero, c.status;
    end if;
    select * into v_etapa from public.tdr_cancelamento_etapas
     where cancelamento_id = c.id and versao = c.versao and ordem = c.etapa_atual;
    if not exists (select 1 from fn_tcan_signatarios_etapa(v_etapa.id) s(uid) where s.uid = p_usuario_id) then
      raise exception 'NAO_E_SUA_VEZ: a etapa atual (%) não é sua.', v_etapa.ordem;
    end if;
  end if;

  if p_decisao = 'aprovar' and exists (
       select 1 from public.tdr_cancelamento_assinaturas a
        where a.cancelamento_id = c.id and a.versao = c.versao and a.usuario_id = p_usuario_id
          and a.decisao = 'aprovar' and a.invalidada_em is null and a.etapa_id <> v_etapa.id) then
    raise exception 'SEGREGACAO: você já aprovou outra etapa deste pedido.';
  end if;
  if p_decisao in ('devolver','recusar') then
    if v_etapa.ordem = 1 then raise exception 'O solicitante não devolve nem recusa — edite ou cancele o pedido.'; end if;
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo (%).', p_decisao; end if;
  end if;
  if p_decisao = 'aprovar' and v_etapa.ordem = 1 and c.submetido_em < now() then
    perform fn_tcan_validar(c.id);
  end if;

  insert into public.tdr_cancelamento_assinaturas
    (cancelamento_id, etapa_id, versao, usuario_id, cargo, titular_id, decisao, motivo,
     hash_documento, senha_verificada_em, ip, user_agent)
  values (c.id, v_etapa.id, c.versao, p_usuario_id, v_etapa.cargo,
          (select id from public.rem_cargo_titulares where cargo = v_etapa.cargo and usuario_id = p_usuario_id and vigencia_fim is null),
          p_decisao, nullif(btrim(p_motivo), ''), p_hash, now(), p_ip, left(p_user_agent, 300))
  returning id into v_ass;

  select count(*) into v_total from public.tdr_cancelamento_etapas where cancelamento_id = c.id and versao = c.versao;

  if p_decisao = 'aprovar' then
    update public.tdr_cancelamento_etapas set assinatura_id = v_ass where id = v_etapa.id;
    perform fn_tcan_log(c.id, 'aprovado_etapa', null, null, v_etapa.ordem, p_usuario_id, p_motivo);
    if v_etapa.ordem = v_total then
      perform fn_tcan_efetivar(c.id, p_usuario_id);
      select array_agg(distinct u) into v_avisar from (
        select c.criado_por as u
        union select a.usuario_id from public.tdr_cancelamento_assinaturas a
               where a.cancelamento_id = c.id and a.versao = c.versao and a.decisao = 'aprovar' and a.invalidada_em is null
        union select r.usuario_id from public.atividade_responsaveis r
               where r.atividade_id = c.atividade_id and r.ativo) x;
      perform fn_tcan_notificar(c.id, v_avisar, 'efetivado', null);
      return jsonb_build_object('status', 'efetivado');
    end if;
    update public.tdr_cancelamentos set etapa_atual = v_etapa.ordem + 1 where id = c.id;
    select * into v_prox from public.tdr_cancelamento_etapas
     where cancelamento_id = c.id and versao = c.versao and ordem = v_etapa.ordem + 1;
    select array_agg(s) into v_avisar from fn_tcan_signatarios_etapa(v_prox.id) s;
    perform fn_tcan_notificar(c.id, v_avisar, 'analisar', null);
    return jsonb_build_object('status', 'em_aprovacao', 'etapa_atual', v_etapa.ordem + 1);
  end if;

  if p_decisao = 'devolver' then
    select * into v_ant from public.tdr_cancelamento_etapas
     where cancelamento_id = c.id and versao = c.versao and ordem = v_etapa.ordem - 1;
    update public.tdr_cancelamento_assinaturas
       set invalidada_em = now(), invalidada_motivo = 'devolvido pela etapa ' || v_etapa.ordem
     where id = v_ant.assinatura_id;
    update public.tdr_cancelamento_etapas set assinatura_id = null where id = v_ant.id;
    update public.tdr_cancelamentos set etapa_atual = v_ant.ordem where id = c.id;
    perform fn_tcan_log(c.id, 'devolvido', null, null, v_etapa.ordem, p_usuario_id, p_motivo,
                        jsonb_build_object('para_etapa', v_ant.ordem));
    select array_agg(a.usuario_id) into v_avisar from public.tdr_cancelamento_assinaturas a
     where a.id = (select id from public.tdr_cancelamento_assinaturas
                    where etapa_id = v_ant.id and decisao = 'aprovar' order by criado_em desc limit 1);
    if v_avisar is null then select array_agg(s) into v_avisar from fn_tcan_signatarios_etapa(v_ant.id) s; end if;
    perform fn_tcan_notificar(c.id, v_avisar, 'devolvido', p_motivo);
    return jsonb_build_object('status', 'em_aprovacao', 'etapa_atual', v_ant.ordem);
  end if;

  update public.tdr_cancelamentos set status = 'recusado', etapa_atual = null, encerrado_em = now(),
         motivo_encerramento = btrim(p_motivo) where id = c.id;
  perform fn_tcan_log(c.id, 'recusado', 'em_aprovacao', 'recusado', v_etapa.ordem, p_usuario_id, p_motivo);
  select array_agg(distinct u) into v_avisar from (
    select c.criado_por as u
    union select a.usuario_id from public.tdr_cancelamento_assinaturas a
           where a.cancelamento_id = c.id and a.versao = c.versao and a.decisao = 'aprovar' and a.invalidada_em is null) x;
  perform fn_tcan_notificar(c.id, v_avisar, 'recusado', p_motivo);
  return jsonb_build_object('status', 'recusado');
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tcan_efetivar(p_can uuid, p_usuario uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.tdr_cancelamentos;
  t public.tdrs;
  v_rodada integer;
begin
  select * into c from public.tdr_cancelamentos where id = p_can;
  perform 1 from public.atividades where id = (select atividade_id from public.tdrs where id = c.tdr_id) for update;
  select * into t from public.tdrs where id = c.tdr_id for update;
  perform fn_tcan_validar(p_can);

  if t.status = 'em_licitacao' then
    select coalesce(max(rodada), 0) + 1 into v_rodada from public.tdr_licitacoes where tdr_id = t.id;
    insert into public.tdr_licitacoes (tdr_id, rodada, modalidade, numero_processo, dt_abertura, resultado, motivo,
                                       desfecho, cancelamento_id, registrado_por)
    values (t.id, v_rodada, t.modalidade_licitacao, t.numero_processo, t.dt_licitacao,
            case c.motivo_tipo when 'licitacao_deserta' then 'deserta' when 'licitacao_fracassada' then 'fracassada' else 'outro' end,
            'Cancelamento ' || c.numero || ': ' || c.justificativa, 'cancelamento', c.id, p_usuario);
  end if;

  perform set_config('dima.tdr_cancelamento', 'efetivar', true);
  update public.tdrs set status = 'cancelado', atualizado_em = now() where id = t.id;
  perform set_config('dima.tdr_cancelamento', '', true);

  insert into public.tdr_acoes (tdr_id, usuario_id, acao, status_anterior, status_novo, comentario)
  values (t.id, p_usuario, 'cancelado', t.status::text, 'cancelado',
          'Pedido ' || c.numero || ' efetivado (nota técnica: ' || coalesce(c.nota_nome, '—') || '). '
          || c.justificativa);

  update public.tdr_cancelamentos
     set status = 'efetivado', efetivado_em = now(), etapa_atual = null
   where id = p_can;
  perform fn_tcan_log(p_can, 'efetivado', 'em_aprovacao', 'efetivado', null, p_usuario, null,
                      jsonb_build_object('tdr_status_anterior', t.status, 'valor_usd_liberado', t.valor_usd,
                                         'valor_brl_liberado', t.valor_brl, 'atividade_id', t.atividade_id));
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tcan_hash(p_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'numero', c.numero, 'versao', c.versao, 'tdr_id', c.tdr_id,
    'tdr', jsonb_build_object('numero', t.numero, 'status', t.status, 'atividade_id', t.atividade_id,
                              'valor_usd', t.valor_usd, 'valor_brl', t.valor_brl),
    'motivo_tipo', c.motivo_tipo, 'justificativa', c.justificativa, 'destino_valor', c.destino_valor,
    'nota', jsonb_build_object('caminho', c.nota_caminho, 'nome', c.nota_nome, 'sha256', c.nota_sha256)
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.tdr_cancelamentos c join public.tdrs t on t.id = c.tdr_id
  where c.id = p_id
$function$
;

CREATE OR REPLACE FUNCTION public.fn_tcan_log(p_can uuid, p_evento text, p_de text, p_para text, p_etapa integer, p_usuario uuid, p_motivo text, p_detalhes jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.tdr_cancelamento_historico (cancelamento_id, evento, status_de, status_para, etapa_ordem, versao, usuario_id, motivo, detalhes)
  select p_can, p_evento, p_de, p_para, p_etapa, c.versao, p_usuario, nullif(btrim(p_motivo), ''), p_detalhes
    from public.tdr_cancelamentos c where c.id = p_can
$function$
;

CREATE OR REPLACE FUNCTION public.fn_tcan_notificar(p_can uuid, p_usuarios uuid[], p_evento text, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_numero text; v_tdr text; v_titulo text; u uuid;
begin
  select numero, tdr_numero into v_numero, v_tdr from public.tdr_cancelamentos where id = p_can;
  v_titulo := case p_evento
    when 'analisar'  then 'Cancelamento do TDR ' || v_tdr || ' (' || v_numero || ') aguarda sua análise'
    when 'devolvido' then 'Cancelamento do TDR ' || v_tdr || ' (' || v_numero || ') foi devolvido para você'
    when 'recusado'  then 'Cancelamento do TDR ' || v_tdr || ' (' || v_numero || ') foi recusado'
    when 'efetivado' then 'TDR ' || v_tdr || ' cancelado (' || v_numero || '): valor liberado'
    else 'Pedido ' || v_numero || ' (cancelamento do TDR ' || v_tdr || ') foi cancelado' end;
  foreach u in array coalesce(p_usuarios, '{}') loop
    if u is null then continue; end if;
    insert into public.tdr_cancelamento_notificacoes (cancelamento_id, usuario_id, evento, motivo)
    values (p_can, u, p_evento, nullif(btrim(p_motivo), ''));
    begin
      insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
      values (u, 'tdr_cancelamento_' || p_evento, v_titulo, nullif(btrim(p_motivo), ''),
              'remanejamentos.html?can=' || p_can, 'tdr_cancelamento', p_can);
    exception when others then null;
    end;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tcan_retrato(p_can uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.tdr_cancelamentos c
     set atividade_id = t.atividade_id, tdr_numero = t.numero, tdr_objeto = left(t.objeto_pt, 600),
         tdr_status_origem = t.status::text, valor_usd = t.valor_usd, valor_brl = t.valor_brl
    from public.tdrs t
   where t.id = c.tdr_id and c.id = p_can
$function$
;

CREATE OR REPLACE FUNCTION public.fn_tcan_salvar(p_id uuid, p_dados jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_can  public.tdr_cancelamentos;
  v_ano  integer := extract(year from fn_hoje_acre())::integer;
  v_seq  integer;
  v_tdr  record;
  v_vivo text;
begin
  if coalesce(fn_perfil_atual()::text, '') not in ('coordenacao','super_admin') then
    raise exception 'Sem permissão: só a coordenação pede o cancelamento de TDR.';
  end if;

  if p_id is null then
    if p_dados ? 'uuid_cliente' then
      select * into v_can from public.tdr_cancelamentos where uuid_cliente = (p_dados->>'uuid_cliente')::uuid;
      if found then return v_can.id; end if;
    end if;
    select id, numero, status::text as status into v_tdr from public.tdrs where id = (p_dados->>'tdr_id')::uuid;
    if not found then raise exception 'TDR não encontrado.'; end if;
    if v_tdr.status = 'cancelado' then raise exception 'TDR_CANCELADO: o TDR % já está cancelado.', v_tdr.numero; end if;
    if v_tdr.status = 'contratado' or exists (
         select 1 from public.contratos k where k.tdr_id = v_tdr.id and k.status::text <> 'cancelado') then
      raise exception 'TDR_COM_CONTRATO: o TDR % tem contrato — cancele ou encerre o contrato antes.', v_tdr.numero;
    end if;
    select numero into v_vivo from public.tdr_cancelamentos where tdr_id = v_tdr.id and status in ('rascunho','em_aprovacao');
    if v_vivo is not null then
      raise exception 'CAN: o TDR % já tem o pedido de cancelamento % em andamento.', v_tdr.numero, v_vivo;
    end if;
    insert into public.tdr_canc_numeracao (ano, ultimo) values (v_ano, 1)
      on conflict (ano) do update set ultimo = public.tdr_canc_numeracao.ultimo + 1
      returning ultimo into v_seq;
    insert into public.tdr_cancelamentos (numero, tdr_id, motivo_tipo, justificativa, uuid_cliente, criado_por)
    values ('CAN-' || v_ano || '-' || lpad(v_seq::text, 3, '0'), v_tdr.id,
            coalesce(nullif(p_dados->>'motivo_tipo', ''), 'outro'),
            coalesce(nullif(btrim(p_dados->>'justificativa'), ''), '(rascunho)'),
            (p_dados->>'uuid_cliente')::uuid, v_uid)
    returning * into v_can;
    perform fn_tcan_log(v_can.id, 'criado', null, 'rascunho', null, v_uid, null);
  else
    select * into v_can from public.tdr_cancelamentos where id = p_id for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if v_can.criado_por is distinct from v_uid and coalesce(fn_perfil_atual()::text, '') <> 'super_admin' then
      raise exception 'Só quem criou o pedido o edita.';
    end if;
    if v_can.status = 'em_aprovacao' and v_can.etapa_atual = 1 then
      update public.tdr_cancelamento_assinaturas
         set invalidada_em = now(), invalidada_motivo = 'pedido editado pelo solicitante (nova versão)'
       where cancelamento_id = v_can.id and versao = v_can.versao and invalidada_em is null;
      update public.tdr_cancelamentos set status = 'rascunho', etapa_atual = null, versao = versao + 1
       where id = v_can.id returning * into v_can;
      perform fn_tcan_log(v_can.id, 'editado_apos_devolucao', 'em_aprovacao', 'rascunho', 1, v_uid, null);
    elsif v_can.status <> 'rascunho' then
      raise exception 'Pedido % em % não pode ser editado.', v_can.numero, v_can.status;
    end if;
  end if;

  update public.tdr_cancelamentos set
    motivo_tipo   = coalesce(nullif(p_dados->>'motivo_tipo', ''), motivo_tipo),
    justificativa = coalesce(nullif(btrim(p_dados->>'justificativa'), ''), justificativa),
    destino_valor = coalesce(nullif(p_dados->>'destino_valor', ''), destino_valor),
    nota_caminho  = case when p_dados ? 'nota_caminho' then nullif(p_dados->>'nota_caminho', '') else nota_caminho end,
    nota_nome     = case when p_dados ? 'nota_caminho' then nullif(p_dados->>'nota_nome', '') else nota_nome end,
    nota_sha256   = case when p_dados ? 'nota_caminho' then nullif(lower(p_dados->>'nota_sha256'), '') else nota_sha256 end,
    nota_tamanho  = case when p_dados ? 'nota_caminho' then nullif(p_dados->>'nota_tamanho', '')::bigint else nota_tamanho end
  where id = v_can.id;
  perform fn_tcan_retrato(v_can.id);
  update public.tdr_cancelamentos set hash_documento = fn_tcan_hash(id) where id = v_can.id;
  perform fn_tcan_log(v_can.id, 'rascunho_salvo', null, null, null, v_uid, null);
  return v_can.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tcan_signatarios_etapa(p_etapa_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct u.id
    from public.tdr_cancelamento_etapas e
    join public.usuarios u on u.ativo
   where e.id = p_etapa_id
     and (
       (e.papel = 'responsavel_atividade' and exists (
          select 1 from public.atividade_responsaveis r
           where r.atividade_id = e.atividade_id and r.usuario_id = u.id and r.ativo and r.papel = 'responsavel')
        and not exists (
          select 1 from public.rem_cargo_titulares x
           where x.usuario_id = u.id and x.vigencia_fim is null
             and x.cargo in ('coordenacao_solicitante','unesco_financeiro')))
       or (e.papel <> 'responsavel_atividade' and u.id = public.fn_rem_titular(e.cargo))
     )
$function$
;

CREATE OR REPLACE FUNCTION public.fn_tcan_validar(p_can uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.tdr_cancelamentos; t record;
begin
  select * into c from public.tdr_cancelamentos where id = p_can;
  if length(btrim(coalesce(c.justificativa, ''))) < 30 or c.justificativa = '(rascunho)' then
    raise exception 'CAN_INVALIDO: escreva a justificativa do cancelamento (mínimo 30 caracteres).';
  end if;
  if c.nota_caminho is null or c.nota_sha256 is null then
    raise exception 'CAN_INVALIDO: anexe a nota técnica que justifica o cancelamento.';
  end if;
  if c.nota_caminho not like 'cancelamentos/%' or not exists (
       select 1 from storage.objects o where o.bucket_id = 'tdrs-arquivos' and o.name = c.nota_caminho) then
    raise exception 'CAN_INVALIDO: a nota técnica não foi encontrada no armazenamento — anexe de novo.';
  end if;
  select numero, status::text as status into t from public.tdrs where id = c.tdr_id;
  if t.status = 'cancelado' then raise exception 'CAN_INVALIDO: o TDR % já está cancelado.', t.numero; end if;
  if t.status = 'contratado' or exists (
       select 1 from public.contratos k where k.tdr_id = c.tdr_id and k.status::text <> 'cancelado') then
    raise exception 'TDR_COM_CONTRATO: o TDR % tem contrato — cancele ou encerre o contrato antes '
                    '(o encerramento libera o não executado).', t.numero;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_tdr_direta_consumo_outros(p_tdr uuid, p_lanc uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(ef.valor_usd), 0)
    from public.execucao_financeira ef
   where ef.tdr_id = p_tdr and ef.contrato_id is null and ef.situacao <> 'cancelado'
     and ef.id is distinct from p_lanc
$function$
;

CREATE OR REPLACE FUNCTION public.fn_tdr_licitacao_sem_exito(p_tdr_id uuid, p_resultado text, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  t public.tdrs;
  v_rodada integer;
  v_id uuid;
begin
  if coalesce(fn_perfil_atual()::text, '') not in ('coordenacao','super_admin') then
    raise exception 'Sem permissão: só a coordenação registra o resultado da licitação.';
  end if;
  if p_resultado not in ('deserta','fracassada','outro') then
    raise exception 'Resultado inválido: %', p_resultado;
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Descreva o que aconteceu na licitação (mínimo 10 caracteres).';
  end if;
  select * into t from public.tdrs where id = p_tdr_id for update;
  if not found then raise exception 'TDR não encontrado.'; end if;
  if t.status <> 'em_licitacao' then
    raise exception 'O TDR % não está em licitação (fase %).', t.numero, t.status;
  end if;

  select coalesce(max(rodada), 0) + 1 into v_rodada from public.tdr_licitacoes where tdr_id = t.id;
  insert into public.tdr_licitacoes (tdr_id, rodada, modalidade, numero_processo, dt_abertura, resultado, motivo,
                                     desfecho, registrado_por)
  values (t.id, v_rodada, t.modalidade_licitacao, t.numero_processo, t.dt_licitacao, p_resultado, btrim(p_motivo),
          'relancada', v_uid)
  returning id into v_id;

  update public.tdrs set status = 'aprovado', modalidade_licitacao = null, numero_processo = null,
         dt_licitacao = null, atualizado_em = now()
   where id = t.id;
  insert into public.tdr_acoes (tdr_id, usuario_id, acao, status_anterior, status_novo, comentario)
  values (t.id, v_uid, 'licitacao_sem_exito', 'em_licitacao', 'aprovado',
          'Licitação ' || v_rodada || 'ª rodada ' || p_resultado
          || coalesce(' (processo ' || t.numero_processo || ')', '') || ': ' || btrim(p_motivo) || ' — será relançada.');
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_travar_produto_pago()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_perfil text;
BEGIN
  -- Se o produto estava 'pago' e alguém tenta mudar a situação
  IF OLD.situacao = 'pago' AND NEW.situacao != 'pago' THEN
    SELECT perfil::text INTO v_perfil
    FROM public.usuarios WHERE id = auth.uid();

    IF v_perfil != 'super_admin' THEN
      RAISE EXCEPTION 'Produto pago não pode ser revertido. Apenas super_admin pode desfazer este status.';
    END IF;
  END IF;

  -- Impedir edição de campos financeiros de produto pago (exceto super_admin)
  IF OLD.situacao = 'pago' THEN
    SELECT perfil::text INTO v_perfil
    FROM public.usuarios WHERE id = auth.uid();

    IF v_perfil != 'super_admin' THEN
      -- Reverter campos protegidos
      NEW.valor_brl      := OLD.valor_brl;
      NEW.situacao       := OLD.situacao;
      NEW.lancamento_id  := OLD.lancamento_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_atividade_dotacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.orcamento_usd, 0) > 0 then
    insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, descricao, criado_por)
    values (new.id, 'dotacao_original', new.orcamento_usd,
            'Dotação original da atividade ' || new.codigo, auth.uid());
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_atividade_guarda_orcamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Só o razão grava: chave de transação ligada E a escrita vem de dentro
  -- de uma trigger do razão (profundidade > 1). set_config sozinho, num
  -- UPDATE direto, não passa.
  if fn_razao_orcamento_ativo() and pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.orcamento_usd, 0) <> 0
       and coalesce(fn_perfil_atual()::text, '') <> 'super_admin' then
      raise exception 'ORCAMENTO_PROTEGIDO: só super_admin cria atividade com orçamento (vira dotação original no razão).'
        using errcode = 'P0001';
    end if;
    -- a dotação original é registrada pelo razão (trg_atividade_dotacao)
    new.orcamento_original_usd := null;
    return new;
  end if;

  if new.orcamento_usd is distinct from old.orcamento_usd
     or new.orcamento_original_usd is distinct from old.orcamento_original_usd then
    raise exception 'ORCAMENTO_PROTEGIDO: o orçamento da atividade % só muda por remanejamento ou revisão orçamentária registrados no razão.', old.codigo
      using errcode = 'P0001';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_antes   jsonb;
  v_depois  jsonb;
  v_campos  jsonb;
  v_redigir boolean := (tg_nargs > 0 and tg_argv[0] = 'redigir');
begin
  if tg_op = 'DELETE' then
    v_antes := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    v_depois := to_jsonb(new);
  else
    v_antes  := to_jsonb(old);
    v_depois := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, v_depois -> key)
      into v_campos
      from jsonb_object_keys(v_depois) as key
     where (v_depois -> key) is distinct from (v_antes -> key)
       and key not in ('atualizado_em');

    if v_campos is null or v_campos = '{}'::jsonb then
      return new;
    end if;
  end if;

  if v_redigir then
    v_antes  := fn_redigir_jsonb(v_antes);
    v_depois := fn_redigir_jsonb(v_depois);
    v_campos := fn_redigir_jsonb(v_campos);
  end if;

  insert into public.audit_log (
    usuario_id, operacao, tabela, registro_id,
    dados_antes, dados_depois, campos_alterados
  ) values (
    auth.uid(),
    tg_op::operacao_audit,
    tg_table_name,
    coalesce(
      to_jsonb(coalesce(new, old)) ->> 'id',
      to_jsonb(coalesce(new, old)) ->> 'beneficiario_id'
    ),
    v_antes, v_depois, v_campos
  );

  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_ced_imutavel()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  raise exception 'ENCERRAMENTO_DOC: documento do encerramento não se altera nem se apaga — anexe uma nova versão.';
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_cob_imutavel()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.situacao = 'aguardando' and new.situacao in ('coberto','cancelado')
     and (to_jsonb(new) - 'situacao' - 'resolvido_em' - 'resolucao')
       = (to_jsonb(old) - 'situacao' - 'resolvido_em' - 'resolucao') then
    return new;
  end if;
  raise exception 'COBERTURA: lançamento imutável (só pendência aguardando → coberto/cancelado).';
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_cob_trava_execucao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_status text; v_numero text;
begin
  if new.contrato_id is null then return new; end if;
  select status::text, numero into v_status, v_numero from public.contratos where id = new.contrato_id;
  if v_status = 'aguardando_cobertura' then
    if tg_table_name = 'execucao_financeira' and new.situacao = 'cancelado' then return new; end if;
    raise exception 'CONTRATO_AGUARDANDO_COBERTURA: o contrato % está travado até a cobertura do orçamento '
                    '(sem produtos nem pagamentos). Peça o remanejamento em Remanejamento › Pedidos.', v_numero;
  end if;
  if v_status = 'cancelado' and tg_op = 'INSERT' then
    raise exception 'CONTRATO_CANCELADO: o contrato % foi cancelado.', v_numero;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_contrato_auto_encerrar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_table_name = 'contratos' then
    perform fn_contrato_auto_encerrar(new.id);
  else
    perform fn_contrato_auto_encerrar(new.contrato_id);
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_contrato_aviso_cobertura()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'aguardando_cobertura'
     and (tg_op = 'INSERT' or old.status is distinct from 'aguardando_cobertura') then
    perform fn_cob_notificar(new.id, 'travado');
  elsif tg_op = 'UPDATE' and old.status = 'aguardando_cobertura'
        and new.status not in ('aguardando_cobertura', 'cancelado') then
    perform fn_cob_notificar(new.id, 'liberado');
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_contrato_cobertura()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_liberando boolean := coalesce(current_setting('dima.cobertura', true), '') = 'liberar';
  v_old_grupo uuid; v_new_grupo uuid;
  v_old_tdr uuid; v_old_ativ uuid; v_new_ativ uuid;
  v_valor_novo numeric;
  v_evento text;
  v_cob public.contrato_coberturas;
begin
  if v_liberando then return new; end if;

  if new.status = 'aguardando_cobertura'
     and (tg_op = 'INSERT' or old.status <> 'aguardando_cobertura') then
    raise exception 'CONTRATO_STATUS: "aguardando cobertura" é definido pelo sistema, não pelo formulário.';
  end if;
  if tg_op = 'UPDATE' then
    new.status_antes_cobertura := old.status_antes_cobertura;
    if old.status = 'cancelado' and new.status <> 'cancelado' then
      raise exception 'CONTRATO_CANCELADO: contrato % foi cancelado e não volta.', old.numero;
    end if;
    if old.status = 'aguardando_cobertura' then
      if new.status not in ('aguardando_cobertura','cancelado') then
        raise exception 'CONTRATO_AGUARDANDO_COBERTURA: o contrato % está travado até o saldo cobrir o excedente — '
                        'só é possível reduzir o valor ou cancelar.', old.numero;
      end if;
      if new.contrato_assinado_url is distinct from old.contrato_assinado_url and new.contrato_assinado_url is not null then
        raise exception 'CONTRATO_AGUARDANDO_COBERTURA: não anexe o contrato assinado antes da cobertura do contrato %.', old.numero;
      end if;
    end if;
    if new.status = 'cancelado' and old.status <> 'cancelado' and exists (
         select 1 from public.execucao_financeira ef
          where ef.contrato_id = new.id and ef.situacao <> 'cancelado') then
      raise exception 'CONTRATO_COM_PAGAMENTO: contrato % tem lançamento financeiro; encerre em vez de cancelar.', old.numero;
    end if;
  else
    new.status_antes_cobertura := null;
    if new.status = 'cancelado' then
      raise exception 'CONTRATO_STATUS: não se cadastra contrato já cancelado.';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and new.valor_total_brl is not distinct from old.valor_total_brl
     and new.tdr_id is not distinct from old.tdr_id
     and new.atividade_id is not distinct from old.atividade_id
     and (new.status = 'cancelado') = (old.status = 'cancelado') then
    return new;
  end if;

  if new.tdr_id is not null then
    select atividade_id into v_new_ativ from public.tdrs where id = new.tdr_id;
  else
    v_new_ativ := new.atividade_id;
  end if;
  v_new_grupo  := coalesce(new.tdr_id, new.id);
  v_valor_novo := case when new.status = 'cancelado' then 0 else coalesce(new.valor_total_brl, 0) end;

  if tg_op = 'UPDATE' then
    v_old_grupo := coalesce(old.tdr_id, old.id);
    v_old_tdr   := old.tdr_id;
    if old.tdr_id is not null then
      select atividade_id into v_old_ativ from public.tdrs where id = old.tdr_id;
    else
      v_old_ativ := old.atividade_id;
    end if;
    if v_old_grupo <> v_new_grupo or v_old_ativ is distinct from v_new_ativ then
      perform fn_cob_registrar(v_old_grupo, v_old_tdr, v_old_ativ, new.id, 'desvinculo',
                               old.valor_total_brl, 0,
                               case when v_old_grupo = new.id and v_old_ativ is distinct from v_new_ativ then 0
                                    else fn_cob_excedente_brl(v_old_grupo, v_old_tdr, new.id, 0) end,
                               false);
    end if;
  end if;

  v_evento := case
    when tg_op = 'INSERT' then 'cadastro'
    when new.status = 'cancelado' and old.status <> 'cancelado' then 'cancelamento'
    when v_old_grupo <> v_new_grupo or v_old_ativ is distinct from v_new_ativ then 'vinculo'
    when coalesce(new.valor_total_brl, 0) > coalesce(old.valor_total_brl, 0) then 'aditivo'
    else 'reducao' end;

  if new.status = 'cancelado' and tg_op = 'UPDATE' and old.status <> 'cancelado' then
    update public.contrato_coberturas set situacao = 'cancelado', resolvido_em = now(), resolucao = 'contrato cancelado'
     where contrato_id = new.id and situacao = 'aguardando';
  end if;

  v_cob := fn_cob_registrar(v_new_grupo, new.tdr_id, v_new_ativ, new.id, v_evento,
                            case when tg_op = 'UPDATE' then old.valor_total_brl end, new.valor_total_brl,
                            fn_cob_excedente_brl(v_new_grupo, new.tdr_id, new.id, v_valor_novo),
                            v_evento in ('cadastro','aditivo','vinculo'));

  if v_cob.situacao = 'aguardando' then
    new.status_antes_cobertura := case when tg_op = 'UPDATE' and old.status = 'aguardando_cobertura'
                                       then old.status_antes_cobertura else new.status end;
    new.status := 'aguardando_cobertura';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_contrato_cobertura_pos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('dima.cobertura', true), '') = 'liberar' then return null; end if;
  if new.status = 'cancelado' and old.status <> 'cancelado' then
    perform fn_cob_cancelar_pedidos(new.id, 'contrato cancelado');
  end if;
  perform fn_cob_reavaliar(coalesce((select atividade_id from public.tdrs where id = old.tdr_id), old.atividade_id));
  perform fn_cob_reavaliar(coalesce((select atividade_id from public.tdrs where id = new.tdr_id), new.atividade_id));
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_contrato_guarda_encerramento()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'encerrado' and old.status is distinct from 'encerrado'
     and coalesce(current_setting('dima.encerramento', true), '') <> 'efetivar'
     and exists (select 1 from public.contratos_produtos cp where cp.contrato_id = new.id
                  and cp.situacao in ('pendente','em_analise','entrega_parcial','devolvido')) then
    raise exception 'ENCERRAMENTO_PEDIDO: o contrato % tem produto em aberto — o encerramento precisa ser pedido e aprovado pelo responsável da atividade.', new.numero;
  end if;
  if old.status is distinct from new.status and new.status <> 'encerrado'
     and coalesce(current_setting('dima.encerramento', true), '') <> 'efetivar'
     and exists (select 1 from public.contrato_encerramento_pedidos p where p.contrato_id = new.id and p.status = 'aguardando')
     and new.status <> 'aguardando_cobertura' then
    raise exception 'ENCERRAMENTO_PEDIDO: o contrato % tem pedido de encerramento aguardando o responsável — cancele o pedido antes de mudar a situação.', new.numero;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_contrato_tdr_cancelamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tdr record; v_ped text;
begin
  if new.tdr_id is null or coalesce(new.status::text, '') = 'cancelado' then return new; end if;
  if tg_op = 'UPDATE' and new.tdr_id is not distinct from old.tdr_id then return new; end if;
  select numero, status into v_tdr from public.tdrs where id = new.tdr_id;
  if v_tdr.status = 'cancelado' then
    raise exception 'TDR_CANCELADO: o TDR % está cancelado e não recebe contrato.', v_tdr.numero;
  end if;
  select numero into v_ped from public.tdr_cancelamentos where tdr_id = new.tdr_id and status = 'em_aprovacao';
  if v_ped is not null then
    raise exception 'TDR_EM_CANCELAMENTO: o TDR % está no pedido de cancelamento % em aprovação e não recebe contrato.',
      v_tdr.numero, v_ped;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_cotacoes_imutavel()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'COTACAO: PTAX publicada não muda — cotacoes_ptax é imutável.';
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_cp_guarda_fornecedor()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then return new; end if;
  if not public.fn_eh_fornecedor_do_contrato(new.contrato_id)
     and (tg_op = 'INSERT' or not public.fn_eh_fornecedor_do_contrato(old.contrato_id)) then
    return new;
  end if;
  if tg_op = 'INSERT'
     or new.contrato_id     is distinct from old.contrato_id
     or new.numero_produto  is distinct from old.numero_produto
     or new.descricao       is distinct from old.descricao
     or new.valor_brl       is distinct from old.valor_brl
     or new.dt_vencimento   is distinct from old.dt_vencimento
     or new.pct_aprovado    is distinct from old.pct_aprovado
     or new.valor_aprovado  is distinct from old.valor_aprovado
     or (new.situacao is distinct from old.situacao and new.situacao <> 'em_analise') then
    raise exception 'PRODUTO_DO_PROPRIO_FORNECEDOR: o fornecedor do contrato só registra a entrega; produto, valor e situação ficam com a coordenação e o responsável da atividade.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_cp_guarda_situacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.situacao is distinct from coalesce(old.situacao, '')
     and pg_trigger_depth() = 1
     and auth.uid() is not null then
    if new.situacao = 'em_analise' and not public.fn_pode_registrar_entrega(new.contrato_id) then
      raise exception 'PRODUTO_SO_RESPONSAVEL: só o fornecedor do contrato, o responsável ou substituto da atividade (ou super_admin) registra entrega.'
        using errcode = '42501';
    end if;
    if new.situacao in ('aprovado','entrega_parcial','devolvido') and not public.fn_pode_avaliar_contrato(new.contrato_id) then
      raise exception 'PRODUTO_SO_RESPONSAVEL: só o responsável ou substituto da atividade (ou super_admin) avalia o produto — nunca o fornecedor do contrato.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_ef_aviso_tdr_direta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tdr record; v_antes numeric; v_depois numeric; v_faixa int; v_titulo text; v_msg text;
begin
  if new.tdr_id is null or new.contrato_id is not null then return null; end if;

  select t.id, t.numero, t.valor_usd, t.atividade_id into v_tdr
    from public.tdrs t
   where t.id = new.tdr_id and t.execucao_direta and t.status <> 'cancelado';
  if not found or coalesce(v_tdr.valor_usd, 0) <= 0 then return null; end if;

  v_depois := public.fn_tdr_direta_consumo_outros(v_tdr.id, null);
  v_antes  := public.fn_tdr_direta_consumo_outros(v_tdr.id, new.id);
  if tg_op = 'UPDATE' then
    if old.tdr_id is not distinct from new.tdr_id and old.situacao <> 'cancelado' then
      v_antes := v_antes + coalesce(old.valor_usd, 0);
    end if;
  end if;

  v_faixa := case when v_depois >= v_tdr.valor_usd * 0.95 and v_antes < v_tdr.valor_usd * 0.95 then 95
                  when v_depois >= v_tdr.valor_usd * 0.80 and v_antes < v_tdr.valor_usd * 0.80 then 80 end;
  if v_faixa is null then return null; end if;

  v_titulo := 'TDR ' || v_tdr.numero || ' chegou a ' || v_faixa || '% (US$ '
           || translate(to_char(v_tdr.valor_usd, 'FM999,999,990.00'), ',.', '.,') || ')';
  if exists (select 1 from public.notificacoes n
              where n.entidade_tipo = 'tdr' and n.entidade_id = v_tdr.id and n.titulo = v_titulo) then
    return null;
  end if;
  v_msg := 'Viagens (execução direta) já consomem US$ ' || translate(to_char(v_depois, 'FM999,999,990.00'), ',.', '.,')
        || ' do TDR. Restam US$ ' || translate(to_char(greatest(0, v_tdr.valor_usd - v_depois), 'FM999,999,990.00'), ',.', '.,')
        || '. Acima do valor do TDR, nova aprovação de viagem é recusada.';

  begin
    insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    select u.id, 'tdr_execucao_direta_alerta', v_titulo, v_msg, false, 'viagens.html', 'tdr', v_tdr.id
      from public.usuarios u
     where u.ativo
       and (u.perfil in ('super_admin', 'coordenacao', 'financeiro')
            or exists (select 1 from public.atividade_responsaveis r
                        where r.atividade_id = v_tdr.atividade_id and r.usuario_id = u.id and r.ativo));
  exception when check_violation then
    null;
  end;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_ef_limite_tdr_direta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tdr record; v_outros numeric; v_aumenta boolean;
begin
  -- só o que ainda vai ser pago: efetivar pagamento ou corrigir lançamento pago nunca é recusado
  if new.tdr_id is null or new.contrato_id is not null or new.situacao <> 'a_pagar' then return new; end if;

  if tg_op = 'INSERT' then
    v_aumenta := true;
  else
    v_aumenta := old.tdr_id is distinct from new.tdr_id
              or old.situacao = 'cancelado'
              or coalesce(new.valor_brl, 0) > coalesce(old.valor_brl, 0);
  end if;
  if not v_aumenta then return new; end if;

  select t.id, t.numero, t.valor_usd into v_tdr
    from public.tdrs t
   where t.id = new.tdr_id and t.execucao_direta and t.status <> 'cancelado'
     for update;
  if not found then return new; end if;

  v_outros := public.fn_tdr_direta_consumo_outros(v_tdr.id, new.id);
  if v_outros + coalesce(new.valor_usd, 0) > coalesce(v_tdr.valor_usd, 0) + 0.005 then
    raise exception 'TDR_EXECUCAO_DIRETA_ESGOTADO: o TDR % tem US$ % disponível e este lançamento precisa de US$ % (R$ %). '
                    'Peça o aumento do TDR (remanejamento) antes de aprovar.',
      v_tdr.numero,
      translate(to_char(greatest(0, coalesce(v_tdr.valor_usd, 0) - v_outros), 'FM999,999,990.00'), ',.', '.,'),
      translate(to_char(coalesce(new.valor_usd, 0), 'FM999,999,990.00'), ',.', '.,'),
      translate(to_char(coalesce(new.valor_brl, 0), 'FM999,999,990.00'), ',.', '.,');
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_encerramento_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'RAZAO: liberação de saldo não é apagada — estorne (status revertido).';
  end if;
  if new.valor_liberado_usd is distinct from old.valor_liberado_usd
     or new.valor_liberado_brl is distinct from old.valor_liberado_brl
     or new.atividade_id is distinct from old.atividade_id
     or new.tipo is distinct from old.tipo
     or new.contrato_id is distinct from old.contrato_id
     or new.cotacao is distinct from old.cotacao
     or new.cotacao_data is distinct from old.cotacao_data then
    raise exception 'RAZAO: valores de uma liberação de saldo são imutáveis — estorne e lance outra.';
  end if;
  if old.status = 'revertido' and new.status = 'ativo' then
    raise exception 'RAZAO: liberação estornada não volta a valer — lance uma nova.';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_encerramento_ptax()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cot record;
begin
  if auth.uid() is null then
    return new;
  end if;
  if coalesce(new.valor_liberado_brl, 0) <= 0 then
    -- encerramento sem nada a liberar (todos os produtos desmarcados) segue valendo, sem crédito
    if coalesce(new.valor_liberado_usd, 0) > 0 then
      raise exception 'LIBERACAO: informe o valor liberado em R$ — a conversão para US$ é feita pela PTAX do dia.';
    end if;
    new.valor_liberado_usd := 0;
    return new;
  end if;
  select * into v_cot from public.fn_cotacao_usd(null);
  new.cotacao            := v_cot.ptax_venda;
  new.cotacao_data       := v_cot.data_cotacao;
  new.valor_liberado_usd := round(new.valor_liberado_brl / v_cot.ptax_venda, 2);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_encerramento_razao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cred uuid;
begin
  if tg_op = 'INSERT' then
    if new.status = 'ativo' and coalesce(new.valor_liberado_usd, 0) > 0 and new.atividade_id is not null then
      insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, valor_brl_ref, encerramento_id, descricao, criado_por, criado_em)
      values (new.atividade_id, new.tipo, round(new.valor_liberado_usd, 2), new.valor_liberado_brl, new.id,
              new.motivo, new.autorizado_por, new.criado_em);
    end if;
    return null;
  end if;

  if old.status = 'ativo' and new.status = 'revertido' then
    select id into v_cred from public.orcamento_fontes
     where encerramento_id = new.id and ajusta_fonte_id is null;
    if v_cred is not null then
      insert into public.orcamento_fontes (atividade_id, tipo, valor_usd, ajusta_fonte_id, estorno_de, encerramento_id, descricao, criado_por, criado_em)
      select f.atividade_id, f.tipo, -f.valor_usd, f.id, f.id, f.encerramento_id,
             'Estorno: ' || coalesce(nullif(btrim(new.motivo_reversao), ''), 'liberação revertida'),
             new.revertido_por, coalesce(new.revertido_em, now())
        from public.orcamento_fontes f where f.id = v_cred;
    end if;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_encerramento_so_aprovado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.tipo = 'encerramento_contrato' and auth.uid() is not null
     and coalesce(current_setting('dima.encerramento', true), '') <> 'efetivar' then
    raise exception 'ENCERRAMENTO_PEDIDO: o encerramento com saldo não executado é pedido na tela de Contratos e aprovado pelo responsável da atividade.';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_encerramento_tarefa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.tipo = 'encerramento_contrato'
     and coalesce(current_setting('dima.encerramento_sem_tarefa', true), '') <> '1' then
    begin
      perform fn_encerramento_criar_tarefa(new.id);
    exception when others then
      raise warning 'tarefa do encerramento % não criada: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_encp_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('dima.encerramento', true), '') not in ('efetivar','pedido') then
    raise exception 'ENCERRAMENTO_PEDIDO: o pedido de encerramento só muda pela aprovação, devolução ou cancelamento.';
  end if;
  if old.status <> 'aguardando' then
    raise exception 'ENCERRAMENTO_PEDIDO: pedido já decidido não se altera — faça um novo pedido.';
  end if;
  if new.contrato_id is distinct from old.contrato_id or new.motivo is distinct from old.motivo
     or new.produtos is distinct from old.produtos or new.valor_liberado_brl is distinct from old.valor_liberado_brl
     or new.solicitado_por is distinct from old.solicitado_por or new.termo_caminho is distinct from old.termo_caminho then
    raise exception 'ENCERRAMENTO_PEDIDO: o conteúdo do pedido não se altera — devolva e faça outro.';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_entrega_exige_nota()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cam text; v_ult record; v_senha uuid;
begin
  if new.situacao is distinct from 'aprovada' then return new; end if;
  if tg_op = 'UPDATE' and old.situacao = 'aprovada'
     and new.nota_tecnica_url is not distinct from old.nota_tecnica_url then
    return new;
  end if;
  if current_setting('dima.nota_tecnica', true) = 'dispensar' then return new; end if;

  v_cam := public.fn_nt_caminho(new.nota_tecnica_url);
  if v_cam is null then
    raise exception 'NOTA_TECNICA_OBRIGATORIA: anexe a nota técnica (PDF do SEI) para aprovar o produto.';
  end if;
  select caminho, aprovada, conferido_em into v_ult
    from public.nota_tecnica_conferencias
   where entrega_id = new.id and origem = 'tela'
   order by conferido_em desc limit 1;
  if not found or not v_ult.aprovada or v_ult.caminho is distinct from v_cam
     or v_ult.conferido_em <= now() - interval '2 days' then
    raise exception 'NOTA_TECNICA_NAO_CONFERIDA: a nota técnica anexada não é a última conferida e aprovada desta entrega — anexe a nota corrigida.';
  end if;

  if tg_op = 'INSERT' or old.situacao is distinct from 'aprovada' then
    select id into v_senha from public.entrega_aprovacao_senhas
     where entrega_id = new.id and usuario_id = auth.uid() and usado_em is null
       and tipo_decisao = coalesce(new.tipo_decisao, 'aprovacao_total')
       and confirmado_em > now() - interval '10 minutes'
     order by confirmado_em desc limit 1;
    if v_senha is null then
      raise exception 'SENHA_NAO_CONFIRMADA: confirme a aprovação com a sua senha de login.';
    end if;
    update public.entrega_aprovacao_senhas set usado_em = now() where id = v_senha;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_entrega_guarda_avaliacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.situacao in ('aprovada','devolvida')
     and (tg_op = 'INSERT' or old.situacao is distinct from new.situacao)
     and pg_trigger_depth() = 1
     and auth.uid() is not null
     and not public.fn_pode_avaliar_contrato(public.fn_contrato_da_entrega(new.produto_id, new.contrato_id)) then
    if public.fn_eh_fornecedor_do_contrato(public.fn_contrato_da_entrega(new.produto_id, new.contrato_id)) then
      raise exception 'PRODUTO_FORNECEDOR_NAO_AVALIA: o fornecedor do contrato não aprova nem devolve o próprio produto.'
        using errcode = '42501';
    end if;
    raise exception 'PRODUTO_SO_RESPONSAVEL: só o responsável ou substituto da atividade (ou super_admin) avalia o produto.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_fdb_carimbo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_fonte_cobertura_pos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform fn_cob_reavaliar(new.atividade_id);
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_fornecedor_sem_banco()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(new.banco, new.agencia, new.conta, new.tipo_conta, new.pix) is not null then
    raise exception 'FORNECEDOR_BANCO_SEPARADO: dados bancarios vao em fornecedor_dados_bancarios' using errcode = '42501';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_numero_tdr()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.numero is null or new.numero = '' then
    new.numero := public.gerar_numero_tdr(new.atividade_id);
    new.sequencia := (select coalesce(max(sequencia), 0) from public.tdrs
                      where atividade_id = new.atividade_id) + 1;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_orcamento_fontes_cache()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.orcamentaria then
    perform fn_orcamento_recalcular_cache(new.atividade_id);
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_orcamento_fontes_imutavel()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'RAZAO: orcamento_fontes é imutável — corrija com estorno.';
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_orcamento_fontes_valida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cred    public.orcamento_fontes;
  v_est     public.orcamento_fontes;
  v_liquido numeric;
begin
  if new.ajusta_fonte_id is not null then
    select * into v_cred from public.orcamento_fontes where id = new.ajusta_fonte_id;
    if not found or v_cred.ajusta_fonte_id is not null then
      raise exception 'RAZAO: ajuste deve apontar para um crédito.';
    end if;
    if v_cred.atividade_id <> new.atividade_id then
      raise exception 'RAZAO: ajuste e crédito de atividades diferentes.';
    end if;
    select v_cred.valor_usd + coalesce(sum(valor_usd), 0) into v_liquido
      from public.orcamento_fontes where ajusta_fonte_id = v_cred.id;
    if v_liquido + new.valor_usd < 0 then
      raise exception 'RAZAO: o lançamento deixaria a fonte % negativa (líquido US$ %, lançamento US$ %).',
        v_cred.id, v_liquido, new.valor_usd;
    end if;
  end if;

  if new.estorno_de is not null then
    select * into v_est from public.orcamento_fontes where id = new.estorno_de;
    if not found or v_est.estorno_de is not null then
      raise exception 'RAZAO: estorno deve apontar para um lançamento original.';
    end if;
    if v_est.tipo <> new.tipo or v_est.atividade_id <> new.atividade_id
       or new.valor_usd <> -v_est.valor_usd
       or new.ajusta_fonte_id is distinct from coalesce(v_est.ajusta_fonte_id, v_est.id) then
      raise exception 'RAZAO: estorno precisa espelhar o lançamento original (mesmo tipo, atividade e valor com sinal trocado).';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_produto_aprovado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- Quando produto é aprovado pela diretoria (último nível)
  if new.status = 'aprovado_diretoria' and old.status != 'aprovado_diretoria' then
    -- Atualizar indicadores
    perform public.fn_atualizar_indicador(new.id);
    -- Verificar e registrar conformidade
    new.conforme_contrato := (public.fn_verificar_conformidade(new.id) is null);
    new.alerta_conformidade := public.fn_verificar_conformidade(new.id);
    -- Audit log
    perform public.fn_audit_log('APPROVE', 'produtos_entregues', new.id::text,
      to_jsonb(old), to_jsonb(new));
  end if;
  -- Quando produto é recusado
  if new.status = 'recusado' and old.status != 'recusado' then
    perform public.fn_audit_log('REJECT', 'produtos_entregues', new.id::text,
      to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_rem_assinaturas_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'REM: assinatura não é apagada.'; end if;
  if old.invalidada_em is not null or new.invalidada_em is null
     or (to_jsonb(new) - 'invalidada_em' - 'invalidada_motivo') <> (to_jsonb(old) - 'invalidada_em' - 'invalidada_motivo') then
    raise exception 'REM: assinatura é imutável (só pode ser invalidada, uma vez).';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_rem_cobertura_pos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  for r in select distinct atividade_id from public.remanejamento_itens
            where remanejamento_id = new.id and ativo and valor_usd < 0 loop
    perform fn_cob_reavaliar(r.atividade_id);
  end loop;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_rem_etapas_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'REM: etapa não é apagada.'; end if;
  if (to_jsonb(new) - 'assinatura_id') <> (to_jsonb(old) - 'assinatura_id') then
    raise exception 'REM: etapa só muda a assinatura vigente.';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_rem_filhos_rascunho()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare v_status text;
begin
  select status into v_status from public.remanejamentos
   where id = case when tg_op = 'DELETE' then old.remanejamento_id else new.remanejamento_id end;
  if v_status is distinct from 'rascunho' then
    raise exception 'REM: itens e alocações só mudam com o pedido em rascunho (status %).', v_status;
  end if;
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_rem_pedido_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'REM: pedido não é apagado — cancele.'; end if;
  if old.status in ('efetivado','recusado','cancelado','estornado')
     and (to_jsonb(new) - 'atualizado_em') <> (to_jsonb(old) - 'atualizado_em')
     and not (old.status = 'efetivado' and new.status = 'estornado') then
    raise exception 'REM: pedido % encerrado (%) não muda.', old.numero, old.status;
  end if;
  new.atualizado_em := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_rem_titulares_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'REM: titularidade não é apagada — encerre a vigência.'; end if;
  if old.vigencia_fim is not null
     or new.cargo is distinct from old.cargo or new.usuario_id is distinct from old.usuario_id
     or new.vigencia_inicio is distinct from old.vigencia_inicio or new.ato is distinct from old.ato
     or new.designado_por is distinct from old.designado_por or new.vigencia_fim is null then
    raise exception 'REM: titularidade só admite encerrar a vigência, uma vez.';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_tcan_assinaturas_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.invalidada_em is not null or new.invalidada_em is null
     or (to_jsonb(new) - 'invalidada_em' - 'invalidada_motivo') <> (to_jsonb(old) - 'invalidada_em' - 'invalidada_motivo') then
    raise exception 'CAN: assinatura é imutável (só pode ser invalidada, uma vez).';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_tcan_etapas_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if (to_jsonb(new) - 'assinatura_id') <> (to_jsonb(old) - 'assinatura_id') then
    raise exception 'CAN: etapa só muda a assinatura vigente.';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_tcan_imutavel()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  raise exception 'CAN: registro imutável (%).', tg_table_name;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_tcan_pedido_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.status in ('efetivado','recusado','cancelado')
     and (to_jsonb(new) - 'atualizado_em') <> (to_jsonb(old) - 'atualizado_em') then
    raise exception 'CAN: pedido % encerrado (%) não muda.', old.numero, old.status;
  end if;
  if new.tdr_id is distinct from old.tdr_id then
    raise exception 'CAN: o pedido não troca de TDR — cancele e abra outro.';
  end if;
  new.atualizado_em := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_tdr_cobertura_pos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.contratos c where c.tdr_id = new.id) then
    perform fn_cob_registrar(new.id, new.id, new.atividade_id, null, 'tdr_alterado',
                             null, null, fn_cob_excedente_brl(new.id, new.id, null, 0), false);
  end if;
  perform fn_cob_reavaliar(new.atividade_id);
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_tdr_evento_orcamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_antes  numeric := 0;
  v_depois numeric := 0;
  v_ev     text;
begin
  if tg_op in ('UPDATE','DELETE') and old.status <> 'cancelado' then v_antes := coalesce(old.valor_usd, 0); end if;
  if tg_op in ('INSERT','UPDATE') and new.status <> 'cancelado' then v_depois := coalesce(new.valor_usd, 0); end if;

  if tg_op = 'INSERT' then
    if v_depois = 0 then return null; end if;
    insert into public.orcamento_eventos (atividade_id, tdr_id, tdr_numero, evento, valor_depois_usd, efeito_usd, execucao_direta, criado_por)
    values (new.atividade_id, new.id, new.numero, 'tdr_criado', v_depois, v_depois, new.execucao_direta, auth.uid());
    return null;
  end if;

  if tg_op = 'DELETE' then
    if v_antes = 0 then return null; end if;
    insert into public.orcamento_eventos (atividade_id, tdr_id, tdr_numero, evento, valor_antes_usd, efeito_usd, execucao_direta, criado_por)
    values (old.atividade_id, old.id, old.numero, 'tdr_excluido', v_antes, -v_antes, old.execucao_direta, auth.uid());
    return null;
  end if;

  if new.atividade_id is distinct from old.atividade_id then
    if v_antes <> 0 then
      insert into public.orcamento_eventos (atividade_id, tdr_id, tdr_numero, evento, valor_antes_usd, efeito_usd, execucao_direta, criado_por)
      values (old.atividade_id, old.id, old.numero, 'tdr_saiu_da_atividade', v_antes, -v_antes, old.execucao_direta, auth.uid());
    end if;
    if v_depois <> 0 then
      insert into public.orcamento_eventos (atividade_id, tdr_id, tdr_numero, evento, valor_depois_usd, efeito_usd, execucao_direta, criado_por)
      values (new.atividade_id, new.id, new.numero, 'tdr_entrou_na_atividade', v_depois, v_depois, new.execucao_direta, auth.uid());
    end if;
    return null;
  end if;

  if new.execucao_direta is distinct from old.execucao_direta then
    insert into public.orcamento_eventos (atividade_id, tdr_id, tdr_numero, evento, valor_antes_usd, valor_depois_usd, efeito_usd, execucao_direta, criado_por)
    values (new.atividade_id, new.id, new.numero, 'tdr_execucao_direta_alterada', v_antes, v_depois, v_depois - v_antes, new.execucao_direta, auth.uid());
    return null;
  end if;

  if v_antes = v_depois then return null; end if;
  v_ev := case
    when old.status <> 'cancelado' and new.status = 'cancelado' then 'tdr_cancelado'
    when old.status = 'cancelado' and new.status <> 'cancelado' then 'tdr_reativado'
    else 'tdr_valor_alterado' end;
  insert into public.orcamento_eventos (atividade_id, tdr_id, tdr_numero, evento, valor_antes_usd, valor_depois_usd, efeito_usd, execucao_direta, criado_por)
  values (new.atividade_id, new.id, new.numero, v_ev, v_antes, v_depois, v_depois - v_antes, new.execucao_direta, auth.uid());
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_tdr_exige_valor()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(new.valor_brl, 0) <= 0 or coalesce(new.valor_usd, 0) <= 0 then
    if tg_op = 'INSERT'
       or (old.valor_brl is not null and new.valor_brl is distinct from old.valor_brl)
       or (new.status is distinct from old.status and new.status <> 'cancelado') then
      raise exception 'TDR_SEM_VALOR: informe o valor do TDR (R$ e US$) antes de salvar ou mudar de fase.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_tdr_guarda_cancelamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chave boolean := coalesce(current_setting('dima.tdr_cancelamento', true), '') = 'efetivar';
  v_ped   text;
begin
  if old.status = 'cancelado' and new.status is distinct from old.status then
    raise exception 'TDR_CANCELADO: o TDR % foi cancelado e não volta. Para retomar, crie um TDR novo.', old.numero;
  end if;
  if new.status = 'cancelado' and old.status <> 'cancelado' and not v_chave then
    raise exception 'TDR_CANCELAMENTO: o TDR % só é cancelado por pedido de cancelamento com nota técnica e '
                    'aprovação (botão "Pedir cancelamento" no TDR).', old.numero;
  end if;
  if not v_chave
     and (new.status is distinct from old.status or new.valor_usd is distinct from old.valor_usd
          or new.valor_brl is distinct from old.valor_brl or new.atividade_id is distinct from old.atividade_id) then
    select numero into v_ped from public.tdr_cancelamentos where tdr_id = old.id and status = 'em_aprovacao';
    if v_ped is not null then
      raise exception 'TDR_EM_CANCELAMENTO: o TDR % está no pedido de cancelamento % em aprovação — fase, valor e '
                      'atividade ficam congelados até a decisão.', old.numero, v_ped;
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_tdr_guarda_licitacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'em_licitacao' and old.status is distinct from 'em_licitacao'
     and coalesce(current_setting('dima.licitacao', true), '') <> 'rpc' then
    raise exception 'LICITACAO: use "Enviar para licitação" no TDR (registra edital, prazo e lista curta).';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_tdr_licitacao_fase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_usuario_ban()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if new.ativo is distinct from old.ativo then
    update auth.users
       set banned_until = case when new.ativo then null else '2999-12-31 00:00:00+00'::timestamptz end,
           updated_at = now()
     where id = new.id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_verificar_saldo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_antes numeric := 0; v_depois numeric := 0; v_livre numeric; v_codigo text;
  v_delta numeric; v_outros numeric; v_real numeric;
begin
  if tg_op = 'UPDATE' then
    if new.status = 'cancelado' and old.status <> 'cancelado'
       and exists (select 1 from public.contratos c where c.tdr_id = new.id and c.status <> 'cancelado') then
      raise exception 'TDR_COM_CONTRATO: o TDR % tem contrato ativo — cancele/encerre o contrato antes.', new.numero;
    end if;
    if new.atividade_id is distinct from old.atividade_id
       and exists (select 1 from public.contratos c where c.tdr_id = new.id and c.status <> 'cancelado') then
      raise exception 'TDR_COM_CONTRATO: o TDR % tem contrato — não muda de atividade.', new.numero;
    end if;
    if old.status <> 'cancelado' and old.atividade_id = new.atividade_id then
      v_antes := coalesce(old.valor_usd, 0);
    end if;
  end if;
  if new.status <> 'cancelado' then v_depois := coalesce(new.valor_usd, 0); end if;
  if v_depois <= v_antes then return new; end if;

  perform 1 from public.atividades where id = new.atividade_id for update;

  v_delta := v_depois - v_antes;
  -- execução direta: só conta o que aumenta o débito real (reserva × realizado, o maior)
  if coalesce(new.execucao_direta, false)
     and (v_antes = 0 or (tg_op = 'UPDATE' and coalesce(old.execucao_direta, false))) then
    select coalesce(sum(x.valor_usd), 0) into v_outros
      from public.tdrs x
     where x.atividade_id = new.atividade_id and x.execucao_direta
       and x.status <> 'cancelado' and x.id <> new.id;
    select coalesce(d.execucao_direta_realizada_usd, 0) into v_real
      from public.vw_orcamento_debitos d where d.atividade_id = new.atividade_id;
    v_real := coalesce(v_real, 0);
    v_delta := greatest(v_outros + v_depois, v_real) - greatest(v_outros + v_antes, v_real);
    if v_delta <= 0 then return new; end if;
  end if;

  v_livre := fn_cob_livre(new.atividade_id);
  if v_delta > greatest(0, v_livre) then
    select codigo into v_codigo from public.atividades where id = new.atividade_id;
    raise exception 'SALDO_INSUFICIENTE: o TDR compromete US$ % e a atividade % tem US$ % livre '
                    '(descontados TDRs, contratos acima do TDR, execução direta e reservas de remanejamento). '
                    'Solicite remanejamento.',
      round(v_delta, 2), v_codigo, round(greatest(0, v_livre), 2);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_versionar_tdr()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF tg_op = 'UPDATE' THEN
    IF new.objeto_pt IS DISTINCT FROM old.objeto_pt OR
       new.escopo_pt IS DISTINCT FROM old.escopo_pt OR
       new.valor_brl IS DISTINCT FROM old.valor_brl OR
       new.status IS DISTINCT FROM old.status OR
       new.formacao_minima_pt IS DISTINCT FROM old.formacao_minima_pt THEN
      new.versao_atual := COALESCE(old.versao_atual, 1) + 1;
    END IF;
  END IF;
  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_viagem_guarda_decisao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('dima.viagem', true), '') = 'decidir' then return new; end if;
  if tg_op = 'INSERT' then
    if new.situacao not in ('rascunho','solicitado') or new.aprovado_por is not null or new.aprovado_em is not null then
      raise exception 'VIAGEM_DECISAO: protocolo novo nasce como rascunho ou solicitado.';
    end if;
    return new;
  end if;
  if new.situacao is distinct from old.situacao and (
       (old.situacao = 'solicitado' and new.situacao in ('aprovado','rejeitado','rascunho'))
    or (new.situacao = 'aprovado' and old.situacao is distinct from 'em_prestacao')
    or new.situacao = 'rejeitado'
    or (old.situacao in ('aprovado','em_prestacao','realizado') and new.situacao in ('rascunho','solicitado'))
  ) then
    raise exception 'VIAGEM_DECISAO: aprovar, devolver ou rejeitar o protocolo só pela tela de Viagens, com a senha — e nunca por quem pediu ou viaja.';
  end if;
  if new.aprovado_por is distinct from old.aprovado_por or new.aprovado_em is distinct from old.aprovado_em then
    raise exception 'VIAGEM_DECISAO: quem aprovou e quando só são gravados pela aprovação.';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_viagem_lanc_tdr()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ativ uuid;
begin
  if new.lancamento_id is null then return null; end if;
  select p.atividade_id into v_ativ from public.viagem_protocolos p where p.id = new.protocolo_id;
  update public.execucao_financeira ef
     set tdr_id = public.fn_viagem_tdr(v_ativ)
   where ef.id = new.lancamento_id and ef.tdr_id is null and ef.contrato_id is null
     and public.fn_viagem_tdr(v_ativ) is not null;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_trg_viagem_viaj_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('dima.viagem', true), '') = 'decidir' then return new; end if;
  if tg_op = 'INSERT' then
    if new.sit_passagem = 'aprovado' or new.sit_diaria = 'aprovado'
       or new.aprovado_pass_por is not null or new.aprovado_diar_por is not null then
      raise exception 'VIAGEM_DECISAO: viajante novo entra como solicitado; a aprovação é do protocolo.';
    end if;
    return new;
  end if;
  if (new.sit_passagem = 'aprovado' and old.sit_passagem is distinct from 'aprovado')
     or (new.sit_diaria = 'aprovado' and old.sit_diaria is distinct from 'aprovado')
     or new.aprovado_pass_por is distinct from old.aprovado_pass_por
     or new.aprovado_diar_por is distinct from old.aprovado_diar_por
     or new.aprovado_pass_em is distinct from old.aprovado_pass_em
     or new.aprovado_diar_em is distinct from old.aprovado_diar_em then
    raise exception 'VIAGEM_DECISAO: passagem e diária só são aprovadas pela aprovação do protocolo, com a senha.';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.atualizado_em = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_validar_evidencia_entrega()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_tem_evidencia boolean;
begin
  select
    exists (select 1 from public.entrega_documentos d where d.entrega_id = NEW.id)
    or coalesce(NEW.fotos_total, 0) > 0
    or NEW.nota_tecnica_url is not null
    or exists (select 1 from public.produto_matriz_contribuicao m where m.produto_id = NEW.id)
  into v_tem_evidencia;

  if not v_tem_evidencia then
    raise exception 'Não é possível marcar a entrega como "%" sem nenhum documento, foto, nota técnica ou indicador anexado. Verifique se o envio dos arquivos foi concluído antes de reenviar.', NEW.situacao
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_validar_evidencia_produto()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_tem_evidencia boolean;
begin
  select exists (
    select 1
    from public.contratos_produtos_entregas e
    where e.produto_id = NEW.id
      and (
        exists (select 1 from public.entrega_documentos d where d.entrega_id = e.id)
        or coalesce(e.fotos_total, 0) > 0
        or e.nota_tecnica_url is not null
        or exists (select 1 from public.produto_matriz_contribuicao m where m.produto_id = e.id)
      )
  ) into v_tem_evidencia;

  if not v_tem_evidencia then
    raise exception 'Não é possível marcar o produto como "%" sem nenhuma entrega com documento, foto, nota técnica ou indicador vinculado.', NEW.situacao
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_verificar_conformidade(p_produto_entregue_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  v_pe record;
  v_pp record;
  v_alerta text := null;
begin
  select * into v_pe from public.produtos_entregues where id = p_produto_entregue_id;
  if not found then return null; end if;

  if v_pe.produto_previsto_id is not null then
    select * into v_pp from public.tdr_produtos_previstos where id = v_pe.produto_previsto_id;
    if found then
      if v_pp.tipo_produto is not null and v_pp.tipo_produto != v_pe.tipo_produto then
        v_alerta := 'Tipo de produto diverge do previsto no TDR (' ||
                    v_pp.tipo_produto::text || ' esperado, ' ||
                    v_pe.tipo_produto::text || ' entregue).';
      end if;
      if v_pp.prazo_dias is not null then
        declare
          v_contrato_inicio date;
          v_prazo_esperado date;
        begin
          select dt_inicio into v_contrato_inicio
          from public.contratos where id = v_pe.contrato_id;
          if v_contrato_inicio is not null then
            v_prazo_esperado := v_contrato_inicio + v_pp.prazo_dias;
            if v_pe.submetido_em::date > v_prazo_esperado then
              v_alerta := coalesce(v_alerta || ' ', '') ||
                          'Entrega fora do prazo previsto (prazo: ' ||
                          to_char(v_prazo_esperado, 'DD/MM/YYYY') || ').';
            end if;
          end if;
        end;
      end if;
    end if;
  end if;
  return v_alerta;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_verificar_senha(p_senha text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_hash text;
  v_hash_compat text;
BEGIN
  SELECT encrypted_password INTO v_hash
  FROM auth.users
  WHERE id = auth.uid();

  IF v_hash IS NULL THEN
    RETURN false;
  END IF;

  -- Supabase usa $2a$ mas pgcrypto.crypt() exige $2b$ para comparar corretamente
  -- Substituir prefixo para compatibilidade
  v_hash_compat := regexp_replace(v_hash, '^\$2a\$', '$2b$');

  RETURN (v_hash_compat = crypt(p_senha, v_hash_compat));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_viagem_avisar(p_protocolo_id uuid, p_evento text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p record;
  v_n integer := 0;
  v_dest uuid;
  v_tipo text; v_titulo text; v_msg text;
begin
  if not (coalesce(public.fn_perfil_atual() in ('super_admin','coordenacao','financeiro','tecnico'), false)
          or public.tem_permissao('viagens')) then
    raise exception 'VIAGEM_AVISO_NEGADO' using errcode = '42501';
  end if;
  select id, numero, destino_principal, situacao, criado_por, realizado_por
    into p from public.viagem_protocolos where id = p_protocolo_id;
  if not found then raise exception 'PROTOCOLO_INEXISTENTE'; end if;

  if p_evento = 'prestacao' then
    if p.situacao is distinct from 'em_prestacao' then raise exception 'VIAGEM_AVISO_FORA_DA_SITUACAO'; end if;
    v_tipo   := 'viagem_prestacao';
    v_titulo := 'Prestação de contas — ' || coalesce(p.numero,'');
    v_msg    := 'Protocolo ' || coalesce(p.numero,'') || ' (' || coalesce(p.destino_principal,'—') || ') aguarda confirmação.';
    for v_dest in select u.id from public.usuarios u where u.perfil = 'super_admin' and u.ativo loop
      if not exists (select 1 from public.notificacoes x
                      where x.usuario_id = v_dest and x.tipo = v_tipo and x.entidade_id = p.id
                        and not x.lida and x.criado_em > now() - interval '10 minutes') then
        insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
        values (v_dest, v_tipo, v_titulo, v_msg, false, 'viagens.html', 'viagem_protocolos', p.id);
        v_n := v_n + 1;
      end if;
    end loop;
  elsif p_evento = 'realizado' then
    if p.situacao is distinct from 'realizado' or p.realizado_por is distinct from auth.uid() then
      raise exception 'VIAGEM_AVISO_FORA_DA_SITUACAO';
    end if;
    if p.criado_por is not null and not exists (
         select 1 from public.notificacoes x
          where x.usuario_id = p.criado_por and x.tipo = 'viagem_aprovada' and x.entidade_id = p.id
            and not x.lida and x.criado_em > now() - interval '10 minutes') then
      insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      values (p.criado_por, 'viagem_aprovada', 'Protocolo ' || coalesce(p.numero,'') || ' realizado',
              'O protocolo ' || coalesce(p.numero,'') || ' foi confirmado como realizado e os valores foram lançados no financeiro.',
              false, 'viagens.html', 'viagem_protocolos', p.id);
      v_n := 1;
    end if;
  else
    raise exception 'VIAGEM_AVISO_EVENTO_INVALIDO';
  end if;
  return v_n;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_viagem_conclusao_liberar(p_protocolo_id uuid, p_segundos integer DEFAULT 0)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update viagem_protocolos
     set conclusao_envio_trava_ate = case when p_segundos > 0 then now() + make_interval(secs => p_segundos) else null end
   where id = p_protocolo_id;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_viagem_conclusao_reservar(p_protocolo_id uuid, p_segundos integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ok uuid;
  v_ate timestamptz;
begin
  update viagem_protocolos
     set conclusao_envio_trava_ate = now() + make_interval(secs => greatest(p_segundos, 30))
   where id = p_protocolo_id
     and (conclusao_envio_trava_ate is null or conclusao_envio_trava_ate <= now())
  returning id into v_ok;

  if v_ok is not null then
    return jsonb_build_object('ok', true);
  end if;

  select conclusao_envio_trava_ate into v_ate from viagem_protocolos where id = p_protocolo_id;
  return jsonb_build_object('ok', false, 'ate', v_ate,
    'existe', exists (select 1 from viagem_protocolos where id = p_protocolo_id));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_viagem_decidir(p_usuario_id uuid, p_protocolo uuid, p_decisao text, p_motivo text, p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p        viagem_protocolos%rowtype;
  r        jsonb;
  v_agora  timestamptz := now();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_para   text;
  v_canc   int := 0;
begin
  if p_decisao not in ('aprovar','devolver','rejeitar') then
    raise exception 'VIAGEM: decisão inválida (%).', p_decisao;
  end if;
  select * into p from viagem_protocolos where id = p_protocolo for update;
  if p.id is null then raise exception 'VIAGEM: protocolo não encontrado.'; end if;

  r := fn_viagem_regra(p.id, p_usuario_id);
  if r->>'bloqueio' = 'solicitante' then
    raise exception 'SEGREGACAO: quem pediu a viagem não decide o próprio protocolo.';
  elsif r->>'bloqueio' = 'viajante' then
    raise exception 'SEGREGACAO: quem viaja neste protocolo não pode decidir sobre ele.';
  end if;
  if not ((r->'decisoes') ? p_decisao) then
    raise exception 'SEM_PERMISSAO: com o protocolo %, esta decisão não cabe ao seu perfil (aprovar/rejeitar: super_admin; devolver depois de aprovado: super_admin ou financeiro).', p.situacao;
  end if;
  if p_hash is distinct from fn_viagem_hash(p.id) then
    raise exception 'DOCUMENTO_ALTERADO: o protocolo, os viajantes ou os valores mudaram depois que você abriu. Recarregue e confira.';
  end if;
  if p_decisao in ('devolver','rejeitar') and coalesce(length(v_motivo), 0) < 10 then
    raise exception 'VIAGEM: escreva o motivo (mínimo 10 caracteres).';
  end if;

  perform set_config('dima.viagem', 'decidir', true);

  if p_decisao = 'aprovar' then
    v_para := 'aprovado';
    update viagem_protocolos
       set situacao = 'aprovado', aprovado_por = p_usuario_id, aprovado_em = v_agora, atualizado_em = v_agora
     where id = p.id;
    update viagem_viajantes set
           sit_passagem      = case when tem_passagem then 'aprovado'   else sit_passagem end,
           aprovado_pass_por = case when tem_passagem then p_usuario_id else aprovado_pass_por end,
           aprovado_pass_em  = case when tem_passagem then v_agora      else aprovado_pass_em end,
           sit_diaria        = case when tem_diaria   then 'aprovado'   else sit_diaria end,
           aprovado_diar_por = case when tem_diaria   then p_usuario_id else aprovado_diar_por end,
           aprovado_diar_em  = case when tem_diaria   then v_agora      else aprovado_diar_em end,
           atualizado_em     = v_agora
     where protocolo_id = p.id and (tem_passagem or tem_diaria);
    if p.criado_por is not null then
      insert into notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      values (p.criado_por, 'viagem_aprovada', 'Protocolo ' || coalesce(p.numero, '') || ' aprovado',
              'Sua solicitação de viagem para ' || coalesce(p.destino_principal, '—') || ' (' || coalesce(p.numero, '') ||
              ') foi aprovada. Aguarde a emissão dos SPDs pela UNESCO.',
              false, 'viagens.html', 'viagem_protocolos', p.id);
    end if;

  elsif p_decisao = 'rejeitar' then
    v_para := 'rejeitado';
    update viagem_protocolos
       set situacao = 'rejeitado', rejeitado_por = p_usuario_id, rejeitado_em = v_agora,
           rejeitado_motivo = v_motivo, atualizado_em = v_agora
     where id = p.id;
    if p.criado_por is not null then
      insert into notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      values (p.criado_por, 'viagem_rejeitada', 'Protocolo ' || coalesce(p.numero, '') || ' rejeitado',
              'Motivo: ' || left(v_motivo, 300), false, 'viagens.html', 'viagem_protocolos', p.id);
    end if;

  else
    v_para := 'rascunho';
    if p.situacao = 'aprovado' then
      if exists (select 1 from execucao_financeira ef
                  where ef.id in (select lancamento_id from viagem_viajantes where protocolo_id = p.id)
                    and ef.situacao = 'pago') then
        raise exception 'VIAGEM: já há pagamento lançado para este protocolo; não dá para devolver.';
      end if;
      update execucao_financeira set situacao = 'cancelado', atualizado_em = v_agora
       where id in (select lancamento_id from viagem_viajantes where protocolo_id = p.id and lancamento_id is not null)
         and situacao <> 'cancelado';
      get diagnostics v_canc = row_count;
      update viagem_viajantes set
             sit_passagem      = case when tem_passagem then 'solicitado' else sit_passagem end,
             sit_diaria        = case when tem_diaria   then 'solicitado' else sit_diaria end,
             aprovado_pass_por = null, aprovado_pass_em = null,
             aprovado_diar_por = null, aprovado_diar_em = null,
             lancamento_id     = null,
             atualizado_em     = v_agora
       where protocolo_id = p.id;
    end if;
    update viagem_protocolos
       set situacao = 'rascunho', aprovado_por = null, aprovado_em = null,
           rejeitado_por = p_usuario_id, rejeitado_em = v_agora, rejeitado_motivo = v_motivo,
           atualizado_em = v_agora
     where id = p.id;
    if p.criado_por is not null then
      insert into notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      values (p.criado_por, 'viagem_rejeitada', 'Protocolo ' || coalesce(p.numero, '') || ' devolvido para correção',
              'Motivo: ' || left(v_motivo, 300), false, 'viagens.html', 'viagem_protocolos', p.id);
    end if;
  end if;

  perform set_config('dima.viagem', '', true);

  insert into viagem_decisoes (protocolo_id, protocolo_numero, usuario_id, decisao, situacao_de, situacao_para,
                               motivo, hash, lancamentos_cancelados, senha_verificada_em)
  values (p.id, p.numero, p_usuario_id, p_decisao, p.situacao, v_para, v_motivo, p_hash, v_canc, v_agora);

  return jsonb_build_object('situacao', v_para, 'de', p.situacao, 'lancamentos_cancelados', v_canc);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_viagem_hash(p_protocolo uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'id', p.id, 'numero', p.numero, 'situacao', p.situacao, 'objetivo', p.objetivo,
    'destino', p.destino_principal, 'saida', p.dt_saida, 'retorno', p.dt_retorno,
    'atividade', p.atividade_id, 'sei', p.numero_sei, 'solicitante', p.email_solicitante,
    'viajantes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'nome', v.nome, 'cpf', v.cpf, 'email', v.email,
        'passagem', v.tem_passagem, 'diaria', v.tem_diaria,
        'trechos', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'origem', t.origem, 'destino', t.destino,
                                               'saida', t.dt_saida, 'valor', t.valor) order by t.id)
                               from public.viagem_trechos t where t.viajante_id = v.id), '[]'::jsonb),
        'diarias', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo_diaria,
                                               'qtd', d.quantidade, 'valor', d.valor_unitario) order by d.id)
                               from public.viagem_diarias_v2 d where d.viajante_id = v.id), '[]'::jsonb)
      ) order by v.id) from public.viagem_viajantes v where v.protocolo_id = p.id), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.viagem_protocolos p
  where p.id = p_protocolo
    and (auth.uid() is null
         or coalesce(public.fn_perfil_atual()::text in ('super_admin','coordenacao','financeiro'), false)
         or p.criado_por = auth.uid()
         or public.tem_permissao('viagens'))
$function$
;

CREATE OR REPLACE FUNCTION public.fn_viagem_norm(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select nullif(btrim(regexp_replace(translate(lower(coalesce(t, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '\s+', ' ', 'g')), '')
$function$
;

CREATE OR REPLACE FUNCTION public.fn_viagem_participa(p_protocolo uuid, p_usuario uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p.criado_por = u.id then 'solicitante'
    when lower(btrim(p.email_solicitante)) = lower(btrim(u.email)) then 'solicitante'
    when exists (select 1 from public.viagem_viajantes v
                   left join public.beneficiarios b on b.id = v.beneficiario_id
                  where v.protocolo_id = p.id
                    and (   lower(btrim(v.email)) = lower(btrim(u.email))
                         or lower(btrim(b.email)) = lower(btrim(u.email))
                         or public.fn_viagem_norm(v.nome) = public.fn_viagem_norm(u.nome_completo)
                         or public.fn_viagem_norm(b.nome) = public.fn_viagem_norm(u.nome_completo)))
      then 'viajante'
  end
  from public.viagem_protocolos p, public.usuarios u
  where p.id = p_protocolo and u.id = p_usuario
$function$
;

CREATE OR REPLACE FUNCTION public.fn_viagem_pode_decidir(p_protocolo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('decisoes', '[]'::jsonb); end if;
  r := fn_viagem_regra(p_protocolo, auth.uid());
  if jsonb_array_length(r->'decisoes') > 0 then
    r := r || jsonb_build_object('hash', fn_viagem_hash(p_protocolo));
  end if;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_viagem_regra(p_protocolo uuid, p_usuario uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sit    text;
  v_perfil text;
  v_dec    text[] := '{}';
  v_part   text;
begin
  select situacao into v_sit from viagem_protocolos where id = p_protocolo;
  select perfil::text into v_perfil from usuarios where id = p_usuario and ativo;
  if v_sit is null or v_perfil is null then return jsonb_build_object('decisoes', '[]'::jsonb); end if;
  if v_sit = 'solicitado' and v_perfil = 'super_admin' then
    v_dec := array['aprovar','devolver','rejeitar'];
  elsif v_sit = 'aprovado' and v_perfil in ('super_admin','financeiro') then
    v_dec := array['devolver'];
  end if;
  if cardinality(v_dec) = 0 then return jsonb_build_object('decisoes', '[]'::jsonb); end if;
  v_part := fn_viagem_participa(p_protocolo, p_usuario);
  if v_part is not null then
    return jsonb_build_object('decisoes', '[]'::jsonb, 'bloqueio', v_part);
  end if;
  return jsonb_build_object('decisoes', to_jsonb(v_dec));
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_viagem_tdr(p_atividade uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case when count(*) = 1 then (array_agg(t.id))[1] end
    from public.tdrs t
   where t.atividade_id = p_atividade and t.execucao_direta and t.status <> 'cancelado'
$function$
;

CREATE OR REPLACE FUNCTION public.gerar_numero_despacho()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ano integer := EXTRACT(YEAR FROM now())::integer;
  v_seq integer;
BEGIN
  INSERT INTO public.despachos_seq(ano, seq) VALUES (v_ano, 1)
  ON CONFLICT (ano) DO UPDATE SET seq = despachos_seq.seq + 1
  RETURNING seq INTO v_seq;
  RETURN 'DESP-' || v_ano || '-' || LPAD(v_seq::text, 3, '0');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gerar_numero_tdr(p_atividade_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  v_codigo_atividade text;
  v_sequencia int;
  v_numero text;
begin
  select codigo into v_codigo_atividade
  from public.atividades where id = p_atividade_id;

  select coalesce(max(sequencia), 0) + 1 into v_sequencia
  from public.tdrs where atividade_id = p_atividade_id;

  v_numero := v_codigo_atividade || '-' || lpad(v_sequencia::text, 3, '0');
  return v_numero;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_minhas_atividades()
 RETURNS TABLE(id uuid, codigo character varying, nome_pt text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_perfil text;
  v_uid    uuid;
begin
  v_uid := auth.uid();
  select u.perfil::text into v_perfil
  from public.usuarios u
  where u.id = v_uid and u.ativo;
  if v_perfil in ('super_admin','coordenacao') then
    return query
    select a.id, a.codigo, a.nome_pt
    from public.atividades a
    where exists (select 1 from public.contratos c where c.atividade_id = a.id)
    group by a.id, a.codigo, a.nome_pt
    order by a.codigo;
  elsif v_perfil is not null then
    return query
    select a.id, a.codigo, a.nome_pt
    from public.atividades a
    where (
      exists (
        select 1 from public.atividade_responsaveis ar
        where ar.atividade_id = a.id
          and ar.usuario_id   = v_uid
          and ar.ativo        = true
          and ar.papel in ('responsavel','substituto')
      )
      and exists (select 1 from public.contratos c where c.atividade_id = a.id)
    )
    or exists (
      select 1 from public.contratos c
        join public.fornecedor_usuarios fu on fu.fornecedor_id = c.fornecedor_id and fu.ativo
      where c.atividade_id = a.id and fu.usuario_id = v_uid
    )
    group by a.id, a.codigo, a.nome_pt
    order by a.codigo;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_minhas_entregas_devolvidas()
 RETURNS TABLE(produto_id uuid, produto_desc text, produto_num integer, contrato_id uuid, contrato_numero text, atividade_id uuid, atividade_cod text, atividade_nome text, dt_vencimento date, despacho_texto text, despachado_em timestamp with time zone, entrega_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    cp.id,
    cp.descricao,
    cp.numero_produto,
    c.id,
    c.numero::text,
    a.id,
    a.codigo,
    a.nome_pt,
    cp.dt_vencimento,
    cpe.despacho_texto,
    cpe.despachado_em,
    cpe.id
  FROM contratos_produtos cp
  JOIN contratos c ON c.id = cp.contrato_id
  LEFT JOIN atividades a ON a.id = c.atividade_id
  JOIN LATERAL (
    SELECT id, despacho_texto, despachado_em
    FROM contratos_produtos_entregas
    WHERE produto_id = cp.id
      AND situacao = 'devolvida'
      AND criado_por = v_uid
    ORDER BY numero_entrega DESC
    LIMIT 1
  ) cpe ON true
  WHERE cp.situacao = 'devolvido'
  ORDER BY cpe.despachado_em DESC NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_minhas_tarefas()
 RETURNS TABLE(entrega_id uuid, produto_id uuid, produto_desc text, produto_num integer, contrato_id uuid, contrato_numero text, atividade_id uuid, atividade_cod text, atividade_nome text, fornecedor_nome text, dt_entrega date, arquivo_nome text, dias_aguardando integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_perfil text;
  v_uid    uuid := auth.uid();
BEGIN
  SELECT perfil::text INTO v_perfil FROM usuarios WHERE id = v_uid;

  RETURN QUERY
  SELECT
    cpe.id                                                         AS entrega_id,
    cp.id                                                          AS produto_id,
    cp.descricao                                                   AS produto_desc,
    cp.numero_produto                                              AS produto_num,
    c.id                                                           AS contrato_id,
    c.numero::text                                                 AS contrato_numero,
    a.id                                                           AS atividade_id,
    a.codigo                                                       AS atividade_cod,
    a.nome_pt                                                      AS atividade_nome,
    f.nome                                                         AS fornecedor_nome,
    COALESCE(cpe.dt_entrega, cp.dt_entrega)                        AS dt_entrega,
    cpe.arquivo_nome                                               AS arquivo_nome,
    EXTRACT(DAY FROM now() - COALESCE(cpe.criado_em, cp.atualizado_em))::integer AS dias_aguardando
  FROM contratos_produtos cp
  JOIN contratos c            ON c.id = cp.contrato_id
  LEFT JOIN contratos_produtos_entregas cpe
         ON cpe.produto_id = cp.id AND cpe.situacao = 'em_analise'
  LEFT JOIN atividades a      ON a.id = c.atividade_id
  LEFT JOIN fornecedores f    ON f.id = c.fornecedor_id
  WHERE cp.situacao = 'em_analise'
    AND (
      v_perfil = 'super_admin'
      OR v_perfil = 'coordenacao'
      OR EXISTS (
        SELECT 1 FROM public.atividade_responsaveis ar
        WHERE ar.atividade_id = a.id
          AND ar.usuario_id   = v_uid
          AND ar.ativo        = true
          AND ar.papel IN ('responsavel','substituto')
      )
    )
  ORDER BY COALESCE(cpe.criado_em, cp.atualizado_em) ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_monitoramento_banco()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_catalog'
AS $function$
declare
  v_tabelas jsonb;
  v_storage jsonb;
begin
  if not exists (select 1 from public.usuarios where id = auth.uid() and perfil = 'super_admin' and ativo) then
    raise exception 'Acesso negado: apenas super_admin pode consultar métricas do banco' using errcode = '42501';
  end if;

  select jsonb_agg(jsonb_build_object(
           'tabela', relname,
           'linhas', coalesce(n_live_tup, 0),
           'tamanho_bytes', pg_total_relation_size(relid)
         ) order by pg_total_relation_size(relid) desc)
    into v_tabelas
    from pg_stat_user_tables
   where schemaname = 'public';

  -- só agregados por pasta: nenhum caminho ou nome de arquivo sai daqui
  select jsonb_agg(jsonb_build_object(
           'bucket_id', b.id,
           'publico', b.public,
           'limite_arquivo_bytes', b.file_size_limit,
           'total_arquivos', coalesce(o.n, 0),
           'tamanho_bytes', coalesce(o.bytes, 0)
         ) order by coalesce(o.bytes, 0) desc, b.id)
    into v_storage
    from storage.buckets b
    left join (
      select bucket_id, count(*) as n, sum((metadata->>'size')::bigint) as bytes
        from storage.objects
       group by bucket_id
    ) o on o.bucket_id = b.id;

  return jsonb_build_object(
    'db_size_bytes',   pg_database_size(current_database()),
    'tabelas',         coalesce(v_tabelas, '[]'::jsonb),
    'storage_buckets', coalesce(v_storage, '[]'::jsonb),
    'consultado_em',   now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_produtos_vencendo(dias_limite integer DEFAULT 30)
 RETURNS TABLE(produto_id uuid, produto_desc text, produto_num integer, contrato_numero text, atividade_cod text, dt_vencimento date, dias_restantes integer, situacao text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_perfil text;
  v_uid    uuid := auth.uid();
BEGIN
  SELECT perfil::text INTO v_perfil FROM usuarios WHERE id = v_uid;

  RETURN QUERY
  SELECT
    cp.id,
    cp.descricao,
    cp.numero_produto,
    c.numero::text,
    a.codigo,
    cp.dt_vencimento,
    EXTRACT(DAY FROM cp.dt_vencimento - CURRENT_DATE)::integer,
    cp.situacao
  FROM contratos_produtos cp
  JOIN contratos c       ON c.id = cp.contrato_id
  LEFT JOIN atividades a ON a.id = c.atividade_id
  WHERE cp.dt_vencimento IS NOT NULL
    AND cp.dt_vencimento <= CURRENT_DATE + dias_limite
    AND cp.situacao NOT IN ('pago', 'cancelado', 'aprovado')
    AND (
      v_perfil = 'super_admin'
      OR v_perfil = 'coordenacao'
      OR a.responsavel_id = v_uid
    )
  ORDER BY cp.dt_vencimento ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_signed_url(p_path text, p_expires_in integer DEFAULT 3600)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Retorna o path para que o front-end possa chamar createSignedUrl
  -- (signed URLs são geradas pelo cliente Supabase JS, não pelo SQL)
  RETURN p_path;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.marcar_notificacoes_lidas(p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF p_ids IS NULL THEN
    -- Marcar todas as do usuário como lidas
    UPDATE notificacoes SET lida = true, lida_em = now()
    WHERE usuario_id = auth.uid() AND lida = false;
  ELSE
    UPDATE notificacoes SET lida = true, lida_em = now()
    WHERE id = ANY(p_ids) AND usuario_id = auth.uid();
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_em()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_em = now(); return new; end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_atividade_responsavel_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.papel = 'responsavel' AND NEW.ativo = true THEN
    UPDATE atividades SET responsavel_id = NEW.usuario_id WHERE id = NEW.atividade_id;
  END IF;
  IF NEW.papel = 'responsavel' AND NEW.ativo = false THEN
    UPDATE atividades SET responsavel_id = NULL WHERE id = NEW.atividade_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tem_permissao(p_modulo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.usuario_permissoes p
      join public.usuarios u on u.id = p.usuario_id and u.ativo
     where p.usuario_id = auth.uid()
       and p.modulo = p_modulo
       and p.ativo = true
       and p.valido_de <= now()
       and (p.valido_ate is null or p.valido_ate > now())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.trg_congelar_cotacao()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_cotacao numeric(10,4);
BEGIN
  -- Só age quando situacao muda PARA 'pago' e cotacao ainda não foi travada
  IF NEW.situacao = 'pago'
     AND (OLD.situacao IS DISTINCT FROM 'pago')
     AND NEW.cotacao_travada_em IS NULL
  THEN
    -- Busca cotação mais recente
    SELECT cotacao INTO v_cotacao
    FROM public.cotacoes_usd
    ORDER BY data_ref DESC, criado_em DESC
    LIMIT 1;

    IF v_cotacao IS NOT NULL AND v_cotacao > 0 THEN
      NEW.cotacao_uso        := v_cotacao;
      NEW.valor_usd          := ROUND(NEW.valor_brl / v_cotacao, 2);
      NEW.cotacao_travada_em := now();
    END IF;
  END IF;

  -- Se já foi pago antes (cotacao_travada_em preenchido), não altera mais valor_usd
  IF OLD.situacao = 'pago'
     AND NEW.situacao = 'pago'
     AND OLD.cotacao_travada_em IS NOT NULL
  THEN
    NEW.cotacao_uso        := OLD.cotacao_uso;
    NEW.valor_usd          := OLD.valor_usd;
    NEW.cotacao_travada_em := OLD.cotacao_travada_em;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_contratos_produtos_updated()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_sync_produto_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_dt_entrega date;
  v_situacao_antiga text;
BEGIN
  -- Em INSERT, OLD não existe — tratar como situação anterior nula
  v_situacao_antiga := CASE WHEN TG_OP = 'UPDATE' THEN OLD.situacao::text ELSE NULL END;

  -- ── CASO 1: lançamento criado ou atualizado como PAGO ──────────────────
  IF NEW.situacao::text = 'pago' AND v_situacao_antiga IS DISTINCT FROM 'pago' THEN

    v_dt_entrega := COALESCE(NEW.dt_pagamento, CURRENT_DATE);

    -- Tentativa 1: produto já vinculado via lancamento_id
    UPDATE public.contratos_produtos
    SET situacao      = 'pago',
        dt_entrega    = v_dt_entrega,
        atualizado_em = now()
    WHERE lancamento_id = NEW.id
      AND situacao <> 'pago';

    -- Tentativa 2 (fallback): contrato + numero_produto
    IF NOT FOUND AND NEW.contrato_id IS NOT NULL AND NEW.numero_produto IS NOT NULL THEN
      UPDATE public.contratos_produtos
      SET situacao      = 'pago',
          dt_entrega    = v_dt_entrega,
          lancamento_id = NEW.id,
          atualizado_em = now()
      WHERE contrato_id    = NEW.contrato_id
        AND numero_produto = NEW.numero_produto
        AND situacao <> 'pago';
    END IF;

  END IF;

  -- ── CASO 2: lançamento revertido de PAGO → outro status ────────────────
  IF TG_OP = 'UPDATE' AND OLD.situacao::text = 'pago' AND NEW.situacao::text <> 'pago' THEN

    UPDATE public.contratos_produtos
    SET situacao      = 'pendente',
        dt_entrega    = NULL,
        atualizado_em = now()
    WHERE lancamento_id = NEW.id;

    IF NOT FOUND AND NEW.contrato_id IS NOT NULL AND NEW.numero_produto IS NOT NULL THEN
      UPDATE public.contratos_produtos
      SET situacao      = 'pendente',
          dt_entrega    = NULL,
          atualizado_em = now()
      WHERE contrato_id    = NEW.contrato_id
        AND numero_produto = NEW.numero_produto
        AND situacao = 'pago';
    END IF;

  END IF;

  RETURN NEW;
END;
$function$
;

-- ===== TABELAS =====
CREATE TABLE IF NOT EXISTS public.acervo_capas (
  midia_id text NOT NULL,
  obra_id uuid NOT NULL,
  arquivo_url text,
  largura integer,
  altura integer,
  bytes integer,
  status text DEFAULT 'ok'::text NOT NULL,
  erro text,
  gerada_em timestamp with time zone DEFAULT now() NOT NULL,
  gerada_por uuid
);

CREATE TABLE IF NOT EXISTS public.acervo_publicacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  midia_id text NOT NULL,
  obra_id uuid NOT NULL,
  publico boolean DEFAULT true NOT NULL,
  marcado_por uuid,
  marcado_em timestamp with time zone,
  desmarcado_por uuid,
  desmarcado_em timestamp with time zone,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.agente_analises (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  checkpoint smallint NOT NULL,
  referencia_id uuid NOT NULL,
  referencia_tipo text NOT NULL,
  status text NOT NULL,
  resumo text,
  detalhes jsonb,
  modelo_ia text,
  tokens_usados integer,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.apa_demarcacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome text NOT NULL,
  apa_key text NOT NULL,
  cor text DEFAULT '#16a34a'::text NOT NULL,
  geojson jsonb NOT NULL,
  visivel boolean DEFAULT true,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  feature_colors jsonb DEFAULT '{}'::jsonb,
  style_config jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.api_acessos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  cliente_id uuid NOT NULL,
  rota text NOT NULL,
  formato text,
  status integer NOT NULL,
  linhas integer,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.api_clientes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome text NOT NULL,
  descricao text,
  chave_prefixo text,
  chave_hash text,
  contato_email text,
  escopos text[] DEFAULT ARRAY['resumo'::text, 'atividades'::text, 'matriz'::text] NOT NULL,
  origens text[] DEFAULT '{}'::text[] NOT NULL,
  limite_minuto integer DEFAULT 60 NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  expira_em timestamp with time zone,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  revogado_por uuid,
  revogado_em timestamp with time zone,
  retirada_em timestamp with time zone,
  aviso_vencimento_em timestamp with time zone,
  pedido_id uuid
);

CREATE TABLE IF NOT EXISTS public.api_pedido_notificacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  pedido_id uuid,
  cliente_id uuid,
  evento text NOT NULL,
  para_email text NOT NULL,
  tentativas integer DEFAULT 0 NOT NULL,
  ultimo_erro text,
  enviado_em timestamp with time zone,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.api_pedidos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  numero text NOT NULL,
  gmail_message_id text,
  email_message_id text,
  remetente_email text NOT NULL,
  remetente_nome text,
  assunto text,
  corpo text,
  campos jsonb DEFAULT '{}'::jsonb NOT NULL,
  autenticado boolean DEFAULT false NOT NULL,
  autenticacao text,
  status text DEFAULT 'recebido'::text NOT NULL,
  decidido_por uuid,
  decidido_em timestamp with time zone,
  parecer text,
  cliente_id uuid,
  retirada_hash text,
  retirada_expira_em timestamp with time zone,
  retirada_enviada_em timestamp with time zone,
  retirado_em timestamp with time zone,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.atividade_indicador (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  atividade_id uuid NOT NULL,
  indicador_id uuid NOT NULL,
  peso numeric(5,2) DEFAULT 1.0,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.atividade_matriz (
  atividade_id uuid NOT NULL,
  matriz_item_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.atividade_responsaveis (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  atividade_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  papel character varying(20) DEFAULT 'responsavel'::character varying NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  dt_inicio date DEFAULT CURRENT_DATE NOT NULL,
  dt_fim date,
  justificativa text,
  designado_por uuid,
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.atividades (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  resultado_id uuid NOT NULL,
  output_id uuid,
  codigo character varying(20) NOT NULL,
  wbs_unesco character varying(30),
  nome_pt text NOT NULL,
  nome_en text,
  nome_es text,
  descricao_pt text,
  descricao_en text,
  descricao_es text,
  fase fase_atividade DEFAULT 'A_INICIAR'::fase_atividade NOT NULL,
  orcamento_usd numeric(14,2) DEFAULT 0 NOT NULL,
  ano1_usd numeric(14,2) DEFAULT 0 NOT NULL,
  ano2_usd numeric(14,2) DEFAULT 0 NOT NULL,
  percentual numeric(6,4) DEFAULT 0 NOT NULL,
  responsavel_id uuid,
  eixo text,
  total_outcome character varying(5),
  prioridade integer DEFAULT 0,
  tdr_pronto boolean DEFAULT false NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  substituto_id uuid,
  ods text[] DEFAULT '{}'::text[] NOT NULL,
  metas_km text[] DEFAULT '{}'::text[] NOT NULL,
  orcamento_original_usd numeric(14,2)
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigint DEFAULT nextval('audit_log_id_seq'::regclass) NOT NULL,
  usuario_id uuid,
  operacao operacao_audit NOT NULL,
  tabela text NOT NULL,
  registro_id text,
  dados_antes jsonb,
  dados_depois jsonb,
  campos_alterados jsonb,
  ip_address inet,
  user_agent text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.auditoria_execucoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  iniciado_em timestamp with time zone DEFAULT now() NOT NULL,
  concluido_em timestamp with time zone,
  status text DEFAULT 'rodando'::text NOT NULL,
  disparado_por uuid,
  resumo_geral text,
  total_achados integer DEFAULT 0,
  achados_criticos integer DEFAULT 0,
  achados_altos integer DEFAULT 0,
  tokens_usados integer DEFAULT 0,
  erro_msg text
);

CREATE TABLE IF NOT EXISTS public.auditoria_registros (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  numero integer DEFAULT nextval('auditoria_registros_numero_seq'::regclass) NOT NULL,
  dominio text NOT NULL,
  severidade text NOT NULL,
  titulo text NOT NULL,
  descricao text NOT NULL,
  recomendacao text,
  referencia_tabela text,
  referencia_id uuid,
  referencia_label text,
  status text DEFAULT 'aberto'::text NOT NULL,
  resolvido_por uuid,
  resolvido_em timestamp with time zone,
  comentario_resolucao text,
  execucao_id uuid,
  modelo_ia text,
  tokens_usados integer,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  updated_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.beneficiario_dados_bancarios (
  beneficiario_id uuid NOT NULL,
  banco text,
  agencia text,
  conta text,
  tipo_conta text,
  pix text,
  iban text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.beneficiarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome text NOT NULL,
  cpf text,
  data_nascimento date,
  nacionalidade text DEFAULT 'Brasileira'::text,
  passaporte_numero text,
  passaporte_validade date,
  passaporte_pais_emissao text,
  email text,
  telefone text,
  cargo text,
  instituicao text,
  ativo boolean DEFAULT true,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.car_dados_locais (
  cod_imovel text NOT NULL,
  nom_imovel text,
  nome_compl text,
  num_area_i numeric,
  num_modulo numeric,
  nom_munici text,
  ind_status text,
  condicao_i text,
  nome_class text,
  tipo_docum text,
  nome_docum text,
  dat_criaca text,
  cpf_cnpj_mascara text
);

CREATE TABLE IF NOT EXISTS public.car_marcados (
  cod_imovel text NOT NULL,
  fill_color text,
  fill_opacity numeric,
  stroke_color text,
  stroke_width numeric,
  area numeric,
  municipio text,
  condicao text,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cobertura_notificacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contrato_id uuid NOT NULL,
  atividade_id uuid,
  usuario_id uuid NOT NULL,
  evento text NOT NULL,
  deficit_usd numeric(14,2),
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  enviado_em timestamp with time zone,
  tentativas integer DEFAULT 0 NOT NULL,
  ultimo_erro text
);

CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  projeto_id text DEFAULT 'default'::text NOT NULL,
  projeto_nome text DEFAULT ''::text NOT NULL,
  projeto_codigo text DEFAULT ''::text NOT NULL,
  projeto_localizacao text DEFAULT ''::text NOT NULL,
  cor_primaria text DEFAULT '#1F4E2C'::text NOT NULL,
  logos_topo jsonb DEFAULT '[]'::jsonb NOT NULL,
  logo_projeto jsonb DEFAULT '{}'::jsonb NOT NULL,
  logos_parceiros jsonb DEFAULT '[]'::jsonb NOT NULL,
  fotos jsonb DEFAULT '[]'::jsonb NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now(),
  atualizado_por uuid
);

CREATE TABLE IF NOT EXISTS public.contrato_coberturas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  seq bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  grupo uuid NOT NULL,
  contrato_id uuid,
  tdr_id uuid,
  atividade_id uuid NOT NULL,
  evento text NOT NULL,
  valor_anterior_brl numeric(14,2),
  valor_novo_brl numeric(14,2),
  excedente_antes_brl numeric(14,2) NOT NULL,
  excedente_depois_brl numeric(14,2) NOT NULL,
  cotacao numeric(12,4),
  cotacao_data date,
  delta_usd numeric(14,2) NOT NULL,
  livre_antes_usd numeric(14,2),
  deficit_usd numeric(14,2) DEFAULT 0 NOT NULL,
  piso_usd numeric(14,2),
  situacao text DEFAULT 'sem_deficit'::text NOT NULL,
  resolvido_em timestamp with time zone,
  resolucao text,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.contrato_encerramento_documentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  encerramento_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  caminho text NOT NULL,
  nome text NOT NULL,
  sha256 text NOT NULL,
  tamanho bigint,
  criado_por uuid NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.contrato_encerramento_pedidos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contrato_id uuid NOT NULL,
  atividade_id uuid NOT NULL,
  status text DEFAULT 'aguardando'::text NOT NULL,
  motivo text NOT NULL,
  produtos jsonb DEFAULT '[]'::jsonb NOT NULL,
  valor_liberado_brl numeric DEFAULT 0 NOT NULL,
  termo_caminho text,
  termo_nome text,
  termo_sha256 text,
  termo_tamanho bigint,
  solicitado_por uuid NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  decidido_por uuid,
  decidido_em timestamp with time zone,
  parecer text,
  hash_decisao text,
  senha_verificada_em timestamp with time zone,
  ip text,
  user_agent text,
  cancelado_motivo text,
  tarefa_id uuid,
  encerramento_id uuid
);

CREATE TABLE IF NOT EXISTS public.contrato_encerramentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contrato_id uuid NOT NULL,
  atividade_id uuid,
  valor_liberado_brl numeric DEFAULT 0 NOT NULL,
  valor_liberado_usd numeric,
  motivo text NOT NULL,
  produtos_afetados jsonb DEFAULT '[]'::jsonb NOT NULL,
  autorizado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  tipo text DEFAULT 'encerramento_contrato'::text NOT NULL,
  tdr_id uuid,
  status text DEFAULT 'ativo'::text NOT NULL,
  revertido_por uuid,
  revertido_em timestamp with time zone,
  motivo_reversao text,
  cotacao numeric(12,4),
  cotacao_data date
);

CREATE TABLE IF NOT EXISTS public.contratos (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  numero character varying(30) NOT NULL,
  tdr_id uuid,
  fornecedor_id uuid NOT NULL,
  atividade_id uuid,
  objeto_pt text,
  objeto_en text,
  tipo character varying(20),
  elemento_despesa character varying(50),
  valor_total_brl numeric(14,2) DEFAULT 0 NOT NULL,
  valor_utilizado_brl numeric(14,2) DEFAULT 0 NOT NULL,
  saldo_brl numeric(14,2) GENERATED ALWAYS AS ((valor_total_brl - valor_utilizado_brl)) STORED,
  dt_inicio date,
  dt_fim date,
  status status_contrato DEFAULT 'vigente'::status_contrato NOT NULL,
  notas_emitidas integer DEFAULT 0 NOT NULL,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  contrato_assinado_url text,
  contrato_assinado_nome text,
  contrato_assinado_data date,
  contrato_pt_url text,
  contrato_pt_nome text,
  contrato_pt_data timestamp with time zone,
  valor_comprometido_brl numeric(14,2) DEFAULT 0,
  numero_sei text,
  status_antes_cobertura status_contrato
);

CREATE TABLE IF NOT EXISTS public.contratos_produtos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contrato_id uuid NOT NULL,
  numero_produto integer NOT NULL,
  descricao text NOT NULL,
  valor_brl numeric(14,2) DEFAULT 0 NOT NULL,
  dt_vencimento date,
  dt_entrega date,
  situacao text DEFAULT 'pendente'::text NOT NULL,
  observacoes text,
  lancamento_id uuid,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  arquivo_entrega_url text,
  arquivo_entrega_nome text,
  arquivo_entrega_data timestamp with time zone,
  parecer_avaliador text,
  avaliado_por uuid,
  avaliado_em timestamp with time zone,
  historico jsonb DEFAULT '[]'::jsonb,
  pct_aprovado numeric(5,2) DEFAULT 0,
  valor_aprovado numeric(14,2) DEFAULT 0,
  total_entregas integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.contratos_produtos_entregas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  produto_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  numero_entrega integer DEFAULT 1 NOT NULL,
  pct_entregue numeric(5,2) DEFAULT 100 NOT NULL,
  valor_entregue numeric(14,2) DEFAULT 0 NOT NULL,
  arquivo_url text,
  arquivo_nome text,
  arquivo_data timestamp with time zone,
  dt_entrega date,
  dt_vencimento_orig date,
  situacao text DEFAULT 'em_analise'::text NOT NULL,
  tipo_decisao text,
  despacho_numero text,
  despacho_texto text,
  despacho_data date,
  despachado_por uuid,
  despachado_em timestamp with time zone,
  lancamento_id uuid,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  fotos_urls text[] DEFAULT '{}'::text[],
  fotos_nomes text[] DEFAULT '{}'::text[],
  fotos_total integer DEFAULT 0,
  nota_tecnica_url text,
  nota_tecnica_nome text,
  nota_tecnica_data timestamp with time zone,
  tipo_documento character varying(60) DEFAULT 'Relatório Técnico'::character varying,
  numero_sei_subprocesso text
);

CREATE TABLE IF NOT EXISTS public.cotacoes_ptax (
  data date NOT NULL,
  ptax_compra numeric(10,4) NOT NULL,
  ptax_venda numeric(10,4) NOT NULL,
  data_hora_cotacao timestamp with time zone,
  fonte text DEFAULT 'BCB PTAX fechamento (Olinda CotacaoDolarPeriodo)'::text NOT NULL,
  obtida_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cotacoes_usd (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  cotacao numeric(10,4) NOT NULL,
  fonte text DEFAULT 'AwesomeAPI'::text NOT NULL,
  data_ref date DEFAULT CURRENT_DATE NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  cotacao_anterior numeric(10,4),
  variacao_pct numeric(6,4)
);

CREATE TABLE IF NOT EXISTS public.despachos_seq (
  ano integer NOT NULL,
  seq integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.diag_audios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ficha_id uuid NOT NULL,
  uuid_cliente uuid NOT NULL,
  pergunta_chave text NOT NULL,
  arquivo_url text NOT NULL,
  mime text,
  duracao_s numeric(6,1),
  bytes integer,
  gravado_em timestamp with time zone,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  transcrito_por uuid,
  transcrito_em timestamp with time zone,
  transcricao_origem text,
  transcricao_modelo text
);

CREATE TABLE IF NOT EXISTS public.diag_comunidades (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  municipio_ibge integer NOT NULL,
  nome text NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_por uuid DEFAULT auth.uid(),
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.diag_exportacoes (
  id bigint DEFAULT nextval('diag_exportacoes_id_seq'::regclass) NOT NULL,
  usuario_id uuid NOT NULL,
  perfil text NOT NULL,
  identificada boolean NOT NULL,
  com_texto boolean NOT NULL,
  filtros jsonb DEFAULT '{}'::jsonb NOT NULL,
  n_fichas integer NOT NULL,
  n_moradores integer NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.diag_expurgo_arquivos (
  id bigint DEFAULT nextval('diag_expurgo_arquivos_id_seq'::regclass) NOT NULL,
  bucket text NOT NULL,
  caminho text NOT NULL,
  motivo text NOT NULL,
  agendado_em timestamp with time zone DEFAULT now() NOT NULL,
  removido_em timestamp with time zone,
  tentativas integer DEFAULT 0 NOT NULL,
  ultimo_erro text
);

CREATE TABLE IF NOT EXISTS public.diag_fichas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  uuid_cliente uuid NOT NULL,
  codigo text NOT NULL,
  questionario_id uuid NOT NULL,
  municipio_ibge integer NOT NULL,
  comunidade_id uuid,
  comunidade_nova text,
  dt_entrevista date NOT NULL,
  iniciada_em timestamp with time zone,
  finalizada_em timestamp with time zone NOT NULL,
  entrevistador_id uuid NOT NULL,
  aviso_lido boolean NOT NULL,
  aceitou_participar boolean NOT NULL,
  respostas jsonb DEFAULT '{}'::jsonb NOT NULL,
  alertas jsonb DEFAULT '[]'::jsonb NOT NULL,
  status text DEFAULT 'enviada'::text NOT NULL,
  motivo_devolucao text,
  validado_por uuid,
  validado_em timestamp with time zone,
  descartado_em timestamp with time zone,
  usou_carencia boolean DEFAULT false NOT NULL,
  identificacao_apagada_em timestamp with time zone,
  app_versao text,
  dispositivo_id text,
  enviado_em timestamp with time zone DEFAULT now() NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  treino boolean DEFAULT false NOT NULL,
  localidade_id uuid,
  localidade_nova text,
  fotos_registradas smallint,
  fotos_autorizadas boolean,
  audio_autorizado boolean
);

CREATE TABLE IF NOT EXISTS public.diag_fichas_historico (
  id bigint DEFAULT nextval('diag_fichas_historico_id_seq'::regclass) NOT NULL,
  ficha_id uuid NOT NULL,
  status_de text,
  status_para text NOT NULL,
  motivo text,
  por uuid,
  em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.diag_fichas_identificacao (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ficha_id uuid NOT NULL,
  entrevistado_nome text,
  lat numeric(9,6),
  lon numeric(9,6),
  gps_precisao_m numeric(8,1),
  gps_em timestamp with time zone,
  obs_localizacao text
);

CREATE TABLE IF NOT EXISTS public.diag_fotos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ficha_id uuid NOT NULL,
  uuid_cliente uuid NOT NULL,
  tema text NOT NULL,
  pergunta_chave text,
  legenda text,
  arquivo_url text NOT NULL,
  tirada_em timestamp with time zone,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  lat numeric(9,6),
  lon numeric(9,6),
  gps_precisao_m numeric(8,1),
  gps_origem text
);

CREATE TABLE IF NOT EXISTS public.diag_localidades (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  comunidade_id uuid NOT NULL,
  nome text NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_por uuid DEFAULT auth.uid(),
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.diag_moradores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ficha_id uuid NOT NULL,
  ordem smallint NOT NULL,
  idade smallint,
  sexo_genero text,
  sexo_genero_outro text,
  parentesco text,
  escolaridade text,
  atividade_principal text,
  e_entrevistado boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.diag_moradores_identificacao (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  morador_id uuid NOT NULL,
  nome text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.diag_municipios (
  ibge integer NOT NULL,
  nome text NOT NULL,
  sigla character(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.diag_questionarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  codigo text NOT NULL,
  versao integer NOT NULL,
  titulo text NOT NULL,
  estrutura jsonb NOT NULL,
  aviso_entrevistado text NOT NULL,
  hash_sha256 text GENERATED ALWAYS AS (fn_diag_sha256(((estrutura)::text || aviso_entrevistado))) STORED,
  status text DEFAULT 'rascunho'::text NOT NULL,
  publicado_em timestamp with time zone,
  publicado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.diag_sugestoes_ocultas (
  chave text NOT NULL,
  texto_normalizado text NOT NULL,
  ocultado_por uuid DEFAULT auth.uid(),
  ocultado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.entrega_aprovacao_senhas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entrega_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  tipo_decisao text NOT NULL,
  confirmado_em timestamp with time zone DEFAULT now() NOT NULL,
  usado_em timestamp with time zone,
  ip text,
  user_agent text
);

CREATE TABLE IF NOT EXISTS public.entrega_documentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entrega_id uuid NOT NULL,
  tipo_documento character varying(60) DEFAULT 'Relatório Técnico'::character varying NOT NULL,
  arquivo_url text NOT NULL,
  arquivo_nome text NOT NULL,
  arquivo_tamanho bigint,
  inserido_por uuid,
  inserido_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.execucao_financeira (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  atividade_id uuid NOT NULL,
  tdr_id uuid,
  contrato_id uuid,
  fornecedor_id uuid,
  resultado_id uuid,
  descricao text,
  numero_nf text,
  numero_produto integer,
  produto_validado boolean DEFAULT false,
  valor_brl numeric(14,2) NOT NULL,
  valor_usd numeric(14,2),
  cotacao_dia numeric(10,4),
  dt_vencimento date,
  dt_pagamento date,
  sei_numero text,
  situacao situacao_financeiro DEFAULT 'a_pagar'::situacao_financeiro NOT NULL,
  responsavel_id uuid,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  cotacao_uso numeric(10,4),
  elemento_despesa character varying(50),
  observacoes text,
  comprovante_url text,
  comprovante_nome text,
  cotacao_travada_em timestamp with time zone,
  cotacao_unesco numeric,
  valor_usd_unesco numeric,
  impacto_usd numeric,
  pago_por uuid
);

CREATE TABLE IF NOT EXISTS public.fornecedor_dados_bancarios (
  fornecedor_id uuid NOT NULL,
  banco text,
  agencia text,
  conta text,
  tipo_conta text,
  pix text,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_por uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.fornecedor_usuarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fornecedor_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  vinculado_por uuid,
  vinculado_em timestamp with time zone DEFAULT now() NOT NULL,
  desvinculado_por uuid,
  desvinculado_em timestamp with time zone,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.fornecedores (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  codigo_interno integer DEFAULT nextval('fornecedores_codigo_interno_seq'::regclass) NOT NULL,
  nome text NOT NULL,
  tipo character varying(10) NOT NULL,
  cpf_cnpj character varying(20),
  telefone character varying(20),
  email text,
  endereco text,
  cidade text,
  estado character varying(2),
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  nome_fantasia text,
  whatsapp character varying(20),
  cep character varying(10),
  logradouro text,
  numero_end character varying(20),
  complemento character varying(100),
  bairro character varying(100),
  municipio character varying(100),
  uf character varying(2),
  inscricao_estadual character varying(30),
  inscricao_municipal character varying(30),
  responsavel_nome text,
  responsavel_cargo character varying(100),
  banco character varying(100),
  agencia character varying(20),
  conta character varying(30),
  tipo_conta character varying(20),
  pix character varying(100),
  observacoes text,
  contrato_url text,
  contrato_nome text,
  criado_por uuid
);

CREATE TABLE IF NOT EXISTS public.geometria_fotos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  geometry_group text NOT NULL,
  geometry_type text NOT NULL,
  foto_url text NOT NULL,
  ordem integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gmail_sync_state (
  id text DEFAULT 'gmail'::text NOT NULL,
  history_id text,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.historico_indicadores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  indicador_id uuid NOT NULL,
  trimestre character varying(10) NOT NULL,
  valor numeric(15,4) DEFAULT 0 NOT NULL,
  observacao text,
  registrado_por uuid,
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.indicador_historico (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  indicador_id uuid NOT NULL,
  valor_atingido numeric(14,2) NOT NULL,
  periodo_ref date NOT NULL,
  origem character varying(20) DEFAULT 'automatico'::character varying,
  usuario_id uuid,
  justificativa text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.indicadores (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  resultado_id uuid NOT NULL,
  output_id uuid,
  codigo character varying(20),
  nome_pt text NOT NULL,
  nome_en text,
  nome_es text,
  linha_de_base text DEFAULT '0'::text NOT NULL,
  meta_2_anos text NOT NULL,
  unidade_pt text NOT NULL,
  unidade_en text,
  unidade_es text,
  meta_numerica numeric(14,2),
  meios_verificacao_pt text,
  meios_verificacao_en text,
  meios_verificacao_es text,
  ods_codigos text[],
  km_metas text[],
  hipoteses_pt text,
  hipoteses_en text,
  hipoteses_es text,
  valor_atingido numeric(14,2) DEFAULT 0 NOT NULL,
  status_execucao character varying(20) DEFAULT 'nao_iniciado'::character varying,
  ordem integer DEFAULT 0 NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  responsavel text,
  ultima_atualizacao date,
  atualizado_por uuid,
  observacoes text
);

CREATE TABLE IF NOT EXISTS public.lgpd_tratamentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  codigo text NOT NULL,
  nome text NOT NULL,
  modulo text,
  finalidade text NOT NULL,
  controlador text DEFAULT 'SEMA/AC'::text NOT NULL,
  operadores text,
  base_legal text NOT NULL,
  base_legal_detalhe text NOT NULL,
  categorias_titulares text[] DEFAULT '{}'::text[] NOT NULL,
  categorias_dados text[] DEFAULT '{}'::text[] NOT NULL,
  dado_sensivel boolean DEFAULT false NOT NULL,
  dado_de_menor boolean DEFAULT false NOT NULL,
  tabelas text[] DEFAULT '{}'::text[] NOT NULL,
  compartilhamento text NOT NULL,
  transferencia_internacional text,
  retencao_prazo interval,
  retencao_criterio text NOT NULL,
  medidas_seguranca text,
  ripd text,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.mapa_pontos_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  usuario_id uuid,
  usuario_nome text,
  usuario_email text,
  acao text NOT NULL,
  ponto_id uuid,
  ponto_nome text,
  geometry_type text,
  geometry_group text,
  apa text,
  tipo_atividade text,
  dados_antes jsonb,
  dados_depois jsonb
);

CREATE TABLE IF NOT EXISTS public.matriz_itens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  resultado integer NOT NULL,
  produto_codigo text NOT NULL,
  produto_titulo text NOT NULL,
  indicador text NOT NULL,
  situacao_ref text,
  meta_descricao text NOT NULL,
  meta_numerica numeric,
  unidade text,
  meios_verificacao text,
  hipoteses_riscos text,
  ods text[] DEFAULT '{}'::text[] NOT NULL,
  metas_km text[] DEFAULT '{}'::text[] NOT NULL,
  ordem integer DEFAULT 0 NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now(),
  visivel_no_mapa boolean DEFAULT false NOT NULL,
  cor text,
  emoji text
);

CREATE TABLE IF NOT EXISTS public.metas_km_refs (
  numero text NOT NULL,
  titulo text NOT NULL,
  resumo text,
  no_projeto boolean DEFAULT false NOT NULL,
  ordem integer
);

CREATE TABLE IF NOT EXISTS public.nota_tecnica_calibracao_chaves (
  chave text NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  usada_em timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.nota_tecnica_conferencias (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entrega_id uuid NOT NULL,
  caminho text NOT NULL,
  arquivo_nome text,
  sha256 text,
  tamanho bigint,
  paginas integer,
  origem text DEFAULT 'tela'::text NOT NULL,
  aprovada boolean NOT NULL,
  regras jsonb DEFAULT '[]'::jsonb NOT NULL,
  nt_numero text,
  sei_documento text,
  codigo_verificador text,
  codigo_crc text,
  signatarios jsonb DEFAULT '[]'::jsonb NOT NULL,
  data_assinatura date,
  conferido_por uuid,
  conferido_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  usuario_id uuid NOT NULL,
  tipo character varying(40) NOT NULL,
  titulo text NOT NULL,
  mensagem text,
  lida boolean DEFAULT false NOT NULL,
  lida_em timestamp with time zone,
  link text,
  entidade_tipo character varying(60),
  entidade_id uuid,
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ods_refs (
  numero text NOT NULL,
  titulo text NOT NULL,
  emoji text DEFAULT '🎯'::text NOT NULL,
  cor text DEFAULT '#6B7280'::text NOT NULL,
  no_projeto boolean DEFAULT false NOT NULL,
  ordem integer,
  titulo_en text,
  titulo_es text,
  descricao text,
  descricao_en text,
  descricao_es text
);

CREATE TABLE IF NOT EXISTS public.orcamento_eventos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  atividade_id uuid NOT NULL,
  tdr_id uuid,
  tdr_numero text,
  evento text NOT NULL,
  valor_antes_usd numeric(14,2),
  valor_depois_usd numeric(14,2),
  efeito_usd numeric(14,2) NOT NULL,
  execucao_direta boolean DEFAULT false NOT NULL,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.orcamento_fontes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  atividade_id uuid NOT NULL,
  tipo text NOT NULL,
  orcamentaria boolean GENERATED ALWAYS AS ((tipo = ANY (ARRAY['dotacao_original'::text, 'revisao_orcamentaria'::text, 'remanejamento_recebido'::text, 'remanejamento_cedido'::text]))) STORED,
  valor_usd numeric(14,2) NOT NULL,
  valor_brl_ref numeric(14,2),
  cotacao numeric,
  ajusta_fonte_id uuid,
  estorno_de uuid,
  fonte_origem_id uuid,
  encerramento_id uuid,
  remanejamento_id uuid,
  descricao text NOT NULL,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.outputs (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  resultado_id uuid NOT NULL,
  codigo character varying(10) NOT NULL,
  nome_pt text NOT NULL,
  nome_en text,
  nome_es text,
  ordem integer DEFAULT 0 NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.passagens_diarias (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  atividade_id uuid NOT NULL,
  numero_spd character varying(30),
  vendor character varying(20),
  wbs_unesco character varying(30),
  beneficiario text NOT NULL,
  tipo character varying(20),
  origem text,
  destino text,
  dt_ida date,
  dt_volta date,
  objetivo text,
  valor_brl numeric(14,2) NOT NULL,
  pc_missao character varying(30),
  processo_sei text,
  status_viagem text,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.prestacao_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token text DEFAULT (gen_random_uuid())::text NOT NULL,
  viajante_id uuid NOT NULL,
  protocolo_id uuid NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  usado_em timestamp with time zone,
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.produto_entregue_indicador (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  produto_entregue_id uuid NOT NULL,
  indicador_id uuid NOT NULL,
  quantidade_contribuida numeric(14,2) NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.produto_evidencias (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  produto_id uuid NOT NULL,
  arquivo_url text NOT NULL,
  arquivo_nome text NOT NULL,
  tipo character varying(20) DEFAULT 'foto'::character varying NOT NULL,
  descricao text,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.produto_indicador (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  produto_previsto_id uuid NOT NULL,
  indicador_id uuid NOT NULL,
  quantidade_prevista numeric(14,2),
  origem character varying(20) DEFAULT 'manual'::character varying,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.produto_matriz_contribuicao (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  produto_id uuid NOT NULL,
  matriz_item_id uuid NOT NULL,
  valor numeric NOT NULL,
  unidade text,
  observacao text,
  status text DEFAULT 'pendente'::text NOT NULL,
  confirmado_por uuid,
  confirmado_em timestamp with time zone,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.produto_notif_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  produto_id uuid NOT NULL,
  entrega_id uuid,
  evento text NOT NULL,
  total_enviados integer DEFAULT 0 NOT NULL,
  falhas integer DEFAULT 0 NOT NULL,
  enviado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  erro text
);

CREATE TABLE IF NOT EXISTS public.produto_pontos_mapa (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome_local text NOT NULL,
  apa text NOT NULL,
  tipo_atividade text,
  responsavel text,
  data_implantacao date,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  foto_url text,
  foto_nome text,
  status text DEFAULT 'ativo'::text,
  observacao text,
  produto_id uuid,
  criado_em timestamp with time zone DEFAULT now(),
  criado_por uuid,
  geometry_type text DEFAULT 'ponto'::text NOT NULL,
  geometry_group text,
  geometry_order integer,
  entrega_id uuid,
  ponto_especial text,
  video_url text
);

CREATE TABLE IF NOT EXISTS public.produtos_entregues (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tdr_id uuid NOT NULL,
  produto_previsto_id uuid,
  contrato_id uuid,
  fornecedor_id uuid,
  numero_produto integer NOT NULL,
  tipo_produto tipo_produto NOT NULL,
  descricao_pt text NOT NULL,
  descricao_en text,
  quantidade_entregue numeric(14,2),
  arquivo_url text,
  arquivo_nome text,
  status status_produto DEFAULT 'submetido'::status_produto NOT NULL,
  aprovado_tecnico_por uuid,
  aprovado_tecnico_em timestamp with time zone,
  aprovado_coord_por uuid,
  aprovado_coord_em timestamp with time zone,
  aprovado_dir_por uuid,
  aprovado_dir_em timestamp with time zone,
  motivo_recusa text,
  recusado_por uuid,
  recusado_em timestamp with time zone,
  conforme_contrato boolean,
  alerta_conformidade text,
  ef_id uuid,
  submetido_por uuid,
  submetido_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  dt_entrega date,
  observacoes text
);

CREATE TABLE IF NOT EXISTS public.pulso_ciclos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  titulo text NOT NULL,
  token text DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 12) NOT NULL,
  status text DEFAULT 'aberto'::text NOT NULL,
  aceita_convidados boolean DEFAULT true NOT NULL,
  limite_convidados integer,
  fecha_em timestamp with time zone,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  perguntas jsonb DEFAULT fn_pulso_perguntas_padrao() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pulso_espelho (
  ciclo_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  q1 numeric(3,1) NOT NULL,
  q2 numeric(3,1) NOT NULL,
  q3 numeric(3,1) NOT NULL,
  q4 numeric(3,1) NOT NULL,
  q5 numeric(3,1) NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pulso_espelho_v2 (
  ciclo_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  valores jsonb NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pulso_exportacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ciclo_id uuid,
  usuario_id uuid NOT NULL,
  formato text NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pulso_participacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ciclo_id uuid NOT NULL,
  usuario_id uuid,
  dispositivo_hash text,
  dia date DEFAULT CURRENT_DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pulso_respostas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ciclo_id uuid NOT NULL,
  perfil_grupo text NOT NULL,
  q1 smallint NOT NULL,
  q2 smallint NOT NULL,
  q3 smallint NOT NULL,
  q4 smallint NOT NULL,
  q5 smallint NOT NULL,
  q6 smallint NOT NULL,
  texto_livre text,
  dia date DEFAULT CURRENT_DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pulso_respostas_v2 (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ciclo_id uuid NOT NULL,
  perfil_grupo text NOT NULL,
  respostas jsonb DEFAULT '{}'::jsonb NOT NULL,
  dia date DEFAULT CURRENT_DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.rem_cargo_titulares (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cargo text NOT NULL,
  usuario_id uuid NOT NULL,
  vigencia_inicio timestamp with time zone DEFAULT now() NOT NULL,
  vigencia_fim timestamp with time zone,
  ato text NOT NULL,
  designado_por uuid,
  encerrado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.rem_cargos (
  codigo text NOT NULL,
  nome text NOT NULL,
  ordem integer NOT NULL,
  perfis_exigidos perfil_usuario[]
);

CREATE TABLE IF NOT EXISTS public.rem_numeracao (
  ano integer NOT NULL,
  ultimo integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.rem_tentativas_senha (
  id bigint DEFAULT nextval('rem_tentativas_senha_id_seq'::regclass) NOT NULL,
  usuario_id uuid NOT NULL,
  sucesso boolean NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.remanejamento_alocacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  remanejamento_id uuid NOT NULL,
  item_id uuid NOT NULL,
  fonte_id uuid NOT NULL,
  valor_usd numeric(14,2) NOT NULL,
  ativo boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS public.remanejamento_assinaturas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  remanejamento_id uuid NOT NULL,
  etapa_id uuid NOT NULL,
  versao integer NOT NULL,
  usuario_id uuid NOT NULL,
  cargo text,
  titular_id uuid,
  decisao text NOT NULL,
  motivo text,
  hash_documento text NOT NULL,
  senha_verificada_em timestamp with time zone NOT NULL,
  ip text,
  user_agent text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  invalidada_em timestamp with time zone,
  invalidada_motivo text
);

CREATE TABLE IF NOT EXISTS public.remanejamento_etapas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  remanejamento_id uuid NOT NULL,
  versao integer NOT NULL,
  ordem integer NOT NULL,
  papel text NOT NULL,
  cargo text,
  atividade_id uuid,
  assinatura_id uuid
);

CREATE TABLE IF NOT EXISTS public.remanejamento_historico (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  remanejamento_id uuid NOT NULL,
  evento text NOT NULL,
  status_de text,
  status_para text,
  etapa_ordem integer,
  versao integer,
  usuario_id uuid,
  motivo text,
  detalhes jsonb,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.remanejamento_itens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  remanejamento_id uuid NOT NULL,
  atividade_id uuid NOT NULL,
  valor_usd numeric(14,2) NOT NULL,
  ativo boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS public.remanejamento_notificacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  remanejamento_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  evento text NOT NULL,
  motivo text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  enviado_em timestamp with time zone,
  tentativas integer DEFAULT 0 NOT NULL,
  ultimo_erro text
);

CREATE TABLE IF NOT EXISTS public.remanejamentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  numero text NOT NULL,
  tipo text DEFAULT 'livre'::text NOT NULL,
  contrato_id uuid,
  justificativa text NOT NULL,
  status text DEFAULT 'rascunho'::text NOT NULL,
  etapa_atual integer,
  versao integer DEFAULT 1 NOT NULL,
  hash_documento text,
  uuid_cliente uuid,
  criado_por uuid NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  submetido_em timestamp with time zone,
  efetivado_em timestamp with time zone,
  encerrado_em timestamp with time zone,
  motivo_encerramento text,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  estorno_de uuid
);

CREATE TABLE IF NOT EXISTS public.repositorio_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  url text NOT NULL,
  titulo text,
  descricao text,
  fonte text,
  imagem_url text,
  idioma character varying(5) DEFAULT 'pt'::character varying,
  categoria text,
  tags text[],
  ativo boolean DEFAULT true NOT NULL,
  inserido_por uuid,
  inserido_em timestamp with time zone DEFAULT now() NOT NULL,
  desativado_por uuid,
  desativado_em timestamp with time zone,
  busca_tsv tsvector GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig, ((((((COALESCE(titulo, ''::text) || ' '::text) || COALESCE(descricao, ''::text)) || ' '::text) || COALESCE(fonte, ''::text)) || ' '::text) || COALESCE(categoria, ''::text)))) STORED
);

CREATE TABLE IF NOT EXISTS public.resultados (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  codigo character varying(5) NOT NULL,
  nome_pt text NOT NULL,
  nome_en text,
  nome_es text,
  descricao_pt text,
  descricao_en text,
  descricao_es text,
  orcamento_usd numeric(14,2) DEFAULT 0 NOT NULL,
  ano1_usd numeric(14,2) DEFAULT 0 NOT NULL,
  ano2_usd numeric(14,2) DEFAULT 0 NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.riscos (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tipo tipo_risco NOT NULL,
  nivel nivel_risco NOT NULL,
  probabilidade integer NOT NULL,
  impacto integer NOT NULL,
  pontuacao integer GENERATED ALWAYS AS ((probabilidade * impacto)) STORED,
  descricao_pt text NOT NULL,
  descricao_en text,
  descricao_es text,
  mitigacao_pt text,
  mitigacao_en text,
  mitigacao_es text,
  responsavel_pt text DEFAULT 'SEMA'::text,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.senha_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  usuario_id uuid NOT NULL,
  token text NOT NULL,
  usado boolean DEFAULT false,
  criado_em timestamp with time zone DEFAULT now(),
  expira_em timestamp with time zone DEFAULT (now() + '00:02:00'::interval)
);

CREATE TABLE IF NOT EXISTS public.solicitacoes_senha (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  usuario_id uuid NOT NULL,
  status character varying(20) DEFAULT 'pendente'::character varying NOT NULL,
  motivo text,
  atendido_por uuid,
  atendido_em timestamp with time zone,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tarefa_anexos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tarefa_id uuid NOT NULL,
  arquivo_url text NOT NULL,
  arquivo_nome text NOT NULL,
  mime text,
  tamanho bigint,
  enviado_por uuid,
  criado_em timestamp with time zone DEFAULT now(),
  comentario_id uuid,
  checklist_id uuid,
  enviado_por_fornecedor_id uuid
);

CREATE TABLE IF NOT EXISTS public.tarefa_checklist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tarefa_id uuid NOT NULL,
  descricao text NOT NULL,
  concluida boolean DEFAULT false NOT NULL,
  ordem numeric DEFAULT 0 NOT NULL,
  concluida_por uuid,
  concluida_em timestamp with time zone,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now(),
  responsavel_usuario_id uuid,
  responsavel_fornecedor_id uuid,
  dt_prazo date
);

CREATE TABLE IF NOT EXISTS public.tarefa_comentarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tarefa_id uuid NOT NULL,
  autor_id uuid,
  corpo text NOT NULL,
  criado_em timestamp with time zone DEFAULT now(),
  origem text DEFAULT 'painel'::text NOT NULL,
  autor_fornecedor_id uuid,
  checklist_id uuid
);

CREATE TABLE IF NOT EXISTS public.tarefa_historico (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tarefa_id uuid NOT NULL,
  autor_id uuid,
  tipo text NOT NULL,
  de text,
  para text,
  criado_em timestamp with time zone DEFAULT now(),
  detalhes jsonb,
  motivo text
);

CREATE TABLE IF NOT EXISTS public.tarefa_participantes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tarefa_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  papel text DEFAULT 'responsavel'::text NOT NULL,
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tarefa_tdrs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tarefa_id uuid NOT NULL,
  tdr_id uuid NOT NULL,
  criado_por uuid DEFAULT auth.uid(),
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tarefa_tipos (
  codigo text NOT NULL,
  nome text NOT NULL,
  icone text DEFAULT '📌'::text NOT NULL,
  cor text DEFAULT '#6B7280'::text NOT NULL,
  ordem integer DEFAULT 100 NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  campos jsonb DEFAULT '[]'::jsonb NOT NULL,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tarefas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  codigo text,
  titulo text NOT NULL,
  descricao text,
  status status_tarefa DEFAULT 'a_fazer'::status_tarefa NOT NULL,
  prioridade prioridade_tarefa DEFAULT 'media'::prioridade_tarefa NOT NULL,
  criado_por uuid NOT NULL,
  dt_inicio date,
  dt_prazo date,
  dt_conclusao timestamp with time zone,
  entidade_tipo character varying,
  entidade_id uuid,
  atividade_id uuid,
  fornecedor_id uuid,
  notificar_fornecedor boolean DEFAULT false NOT NULL,
  ordem numeric DEFAULT 0 NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now(),
  restrita boolean DEFAULT false NOT NULL,
  tipo text DEFAULT 'outras'::text NOT NULL,
  dados_tipo jsonb DEFAULT '{}'::jsonb NOT NULL,
  ics_sequencia integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tdr_acoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tdr_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  acao character varying(40) NOT NULL,
  status_anterior character varying(30),
  status_novo character varying(30),
  comentario text,
  ip_address character varying(45),
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tdr_anexos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tdr_id uuid NOT NULL,
  nome text NOT NULL,
  arquivo_url text NOT NULL,
  mime_type text,
  tamanho_bytes bigint,
  enviado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tdr_canc_numeracao (
  ano integer NOT NULL,
  ultimo integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tdr_cancelamento_assinaturas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cancelamento_id uuid NOT NULL,
  etapa_id uuid NOT NULL,
  versao integer NOT NULL,
  usuario_id uuid NOT NULL,
  cargo text,
  titular_id uuid,
  decisao text NOT NULL,
  motivo text,
  hash_documento text NOT NULL,
  senha_verificada_em timestamp with time zone NOT NULL,
  ip text,
  user_agent text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  invalidada_em timestamp with time zone,
  invalidada_motivo text
);

CREATE TABLE IF NOT EXISTS public.tdr_cancelamento_etapas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cancelamento_id uuid NOT NULL,
  versao integer NOT NULL,
  ordem integer NOT NULL,
  papel text NOT NULL,
  cargo text,
  atividade_id uuid,
  assinatura_id uuid
);

CREATE TABLE IF NOT EXISTS public.tdr_cancelamento_historico (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cancelamento_id uuid NOT NULL,
  evento text NOT NULL,
  status_de text,
  status_para text,
  etapa_ordem integer,
  versao integer,
  usuario_id uuid,
  motivo text,
  detalhes jsonb,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tdr_cancelamento_notificacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cancelamento_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  evento text NOT NULL,
  motivo text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  enviado_em timestamp with time zone,
  tentativas integer DEFAULT 0 NOT NULL,
  ultimo_erro text
);

CREATE TABLE IF NOT EXISTS public.tdr_cancelamentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  numero text NOT NULL,
  tdr_id uuid NOT NULL,
  atividade_id uuid,
  tdr_numero text,
  tdr_objeto text,
  tdr_status_origem text,
  valor_usd numeric,
  valor_brl numeric,
  motivo_tipo text NOT NULL,
  justificativa text NOT NULL,
  destino_valor text DEFAULT 'a_definir'::text NOT NULL,
  nota_caminho text,
  nota_nome text,
  nota_sha256 text,
  nota_tamanho bigint,
  status text DEFAULT 'rascunho'::text NOT NULL,
  etapa_atual integer,
  versao integer DEFAULT 1 NOT NULL,
  hash_documento text,
  uuid_cliente uuid,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  submetido_em timestamp with time zone,
  efetivado_em timestamp with time zone,
  encerrado_em timestamp with time zone,
  motivo_encerramento text,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tdr_comentarios (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tdr_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  campo text,
  comentario text NOT NULL,
  resolvido boolean DEFAULT false NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tdr_confirmacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tdr_id uuid NOT NULL,
  acao_id uuid,
  usuario_id uuid NOT NULL,
  confirmado boolean DEFAULT false NOT NULL,
  confirmado_em timestamp with time zone,
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tdr_licitacao_empresas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  rodada_id uuid NOT NULL,
  fornecedor_id uuid,
  empresa text NOT NULL,
  contato text,
  telefone text,
  email text,
  convidada boolean DEFAULT true NOT NULL,
  apresentou_proposta boolean DEFAULT false NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tdr_licitacao_prorrogacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  rodada_id uuid NOT NULL,
  prazo_anterior timestamp with time zone,
  prazo_novo timestamp with time zone NOT NULL,
  motivo text NOT NULL,
  aviso_url text,
  registrado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tdr_licitacao_rodadas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tdr_id uuid NOT NULL,
  rodada integer NOT NULL,
  modalidade text NOT NULL,
  fundamento_tipo text,
  fundamento text,
  justificativa text,
  numero_processo text,
  dt_abertura date,
  edital_url text,
  prazo_original timestamp with time zone,
  prazo_em timestamp with time zone,
  situacao text DEFAULT 'aberta'::text NOT NULL,
  n_propostas integer,
  resultado_obs text,
  resultado_em timestamp with time zone,
  resultado_por uuid,
  medida text,
  medida_motivo text,
  medida_em timestamp with time zone,
  medida_por uuid,
  aviso_2d_em timestamp with time zone,
  tarefa_resultado_id uuid,
  tarefa_medida_id uuid,
  aberta_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tdr_licitacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tdr_id uuid NOT NULL,
  rodada integer NOT NULL,
  modalidade text,
  numero_processo text,
  dt_abertura date,
  resultado text NOT NULL,
  motivo text NOT NULL,
  desfecho text NOT NULL,
  cancelamento_id uuid,
  registrado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tdr_produtos_previstos (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tdr_id uuid NOT NULL,
  numero_produto integer NOT NULL,
  descricao_pt text NOT NULL,
  descricao_en text,
  descricao_es text,
  prazo_dias integer,
  valor_brl numeric(14,2),
  tipo_produto tipo_produto,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tdr_responsaveis (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tdr_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  papel character varying(20) NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  dt_inicio date DEFAULT CURRENT_DATE NOT NULL,
  dt_fim date,
  justificativa text,
  designado_por uuid,
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tdr_versoes (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  tdr_id uuid NOT NULL,
  numero_versao integer NOT NULL,
  usuario_id uuid,
  fase status_tdr NOT NULL,
  snapshot_dados jsonb NOT NULL,
  campos_alterados jsonb,
  comentario text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  autor_nome text
);

CREATE TABLE IF NOT EXISTS public.tdr_versoes_editor (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tdr_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  versao integer DEFAULT 1 NOT NULL,
  conteudo_delta text NOT NULL,
  comentario_versao text,
  comentarios_abertos integer DEFAULT 0,
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tdrs (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  atividade_id uuid NOT NULL,
  numero character varying(30) NOT NULL,
  sequencia integer DEFAULT 1 NOT NULL,
  tipo tipo_tdr DEFAULT 'PF'::tipo_tdr NOT NULL,
  status status_tdr DEFAULT 'rascunho'::status_tdr NOT NULL,
  versao_atual integer DEFAULT 1 NOT NULL,
  objeto_pt text,
  objeto_en text,
  objeto_es text,
  escopo_pt text,
  escopo_en text,
  escopo_es text,
  formacao_minima_pt text,
  formacao_minima_en text,
  experiencia_requerida_pt text,
  experiencia_requerida_en text,
  area_atuacao_pt text,
  area_atuacao_en text,
  equipe_minima_pt text,
  equipe_minima_en text,
  atestados_pt text,
  atestados_en text,
  valor_brl numeric(14,2),
  valor_usd numeric(14,2),
  cotacao_registro numeric(10,4),
  cotacao_data date,
  fornecedor_id uuid,
  responsavel_id uuid,
  elaborador_id uuid,
  dt_entrega_responsavel date,
  dt_envio_unesco date,
  dt_retorno_unesco date,
  dt_contratacao date,
  prazo_limite date,
  arquivo_url text,
  arquivo_nome text,
  observacao text,
  motivo_recusa text,
  prioridade integer DEFAULT 0,
  tdr_pronto boolean DEFAULT false NOT NULL,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  modalidade_licitacao text,
  numero_processo text,
  dt_licitacao date,
  execucao_direta boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.trilha_metadata (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  geometry_group text NOT NULL,
  video_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usuario_permissoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  usuario_id uuid NOT NULL,
  modulo text NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  valido_de timestamp with time zone DEFAULT now() NOT NULL,
  valido_ate timestamp with time zone,
  concedido_por uuid NOT NULL,
  concedido_em timestamp with time zone DEFAULT now() NOT NULL,
  revogado_por uuid,
  revogado_em timestamp with time zone,
  motivo text
);

CREATE TABLE IF NOT EXISTS public.usuario_senha_temporaria (
  usuario_id uuid NOT NULL,
  hash text,
  definido_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid NOT NULL,
  nome_completo text NOT NULL,
  email text NOT NULL,
  perfil perfil_usuario DEFAULT 'tecnico'::perfil_usuario NOT NULL,
  idioma_pref idioma DEFAULT 'pt'::idioma NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  avatar_url text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  deve_trocar_senha boolean DEFAULT true NOT NULL,
  senha_temporaria_usada boolean DEFAULT false NOT NULL,
  primeiro_acesso_em timestamp with time zone,
  ultimo_acesso_em timestamp with time zone,
  telefone character varying(20),
  telefone_whatsapp boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.viagem_decisoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  protocolo_id uuid NOT NULL,
  protocolo_numero text,
  usuario_id uuid NOT NULL,
  decisao text NOT NULL,
  situacao_de text NOT NULL,
  situacao_para text NOT NULL,
  motivo text,
  hash text NOT NULL,
  lancamentos_cancelados integer DEFAULT 0 NOT NULL,
  senha_verificada_em timestamp with time zone DEFAULT now() NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.viagem_diarias (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  viagem_id uuid NOT NULL,
  tipo_diaria character varying(100) DEFAULT 'Diária padrão'::character varying,
  quantidade numeric(5,1) DEFAULT 1 NOT NULL,
  valor_unitario numeric(12,2) DEFAULT 0 NOT NULL,
  numero_sei character varying(50),
  email_solicitante character varying(200)
);

CREATE TABLE IF NOT EXISTS public.viagem_diarias_v2 (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  viajante_id uuid NOT NULL,
  protocolo_id uuid NOT NULL,
  tipo_diaria character varying(100) DEFAULT 'Diária padrão'::character varying,
  quantidade numeric(8,1) DEFAULT 1,
  valor_unitario numeric(14,2) DEFAULT 0,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.viagem_notif_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  protocolo_id uuid,
  evento text NOT NULL,
  total_enviados integer DEFAULT 0,
  enviado_por uuid,
  enviado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.viagem_passagens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  viagem_id uuid NOT NULL,
  origem character varying(100),
  destino character varying(100),
  tipo character varying(30),
  numero_bilhete character varying(50),
  dt_viagem date,
  valor numeric(12,2) DEFAULT 0 NOT NULL,
  dt_saida date,
  dt_retorno date
);

CREATE TABLE IF NOT EXISTS public.viagem_protocolo_seq_ano (
  ano integer NOT NULL,
  ultimo integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.viagem_protocolos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  numero character varying(20),
  objetivo text NOT NULL,
  destino_principal character varying(200),
  dt_saida date,
  dt_retorno date,
  numero_sei character varying(50),
  email_solicitante character varying(200),
  atividade_id uuid,
  situacao character varying(30) DEFAULT 'solicitado'::character varying NOT NULL,
  aprovado_por uuid,
  aprovado_em timestamp with time zone,
  rejeitado_por uuid,
  rejeitado_em timestamp with time zone,
  rejeitado_motivo text,
  realizado_por uuid,
  realizado_em timestamp with time zone,
  observacoes text,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  cancelado_motivo text,
  cancelado_por uuid,
  cancelado_em timestamp with time zone,
  notificado_unesco_conclusao_em timestamp with time zone,
  conclusao_envio_trava_ate timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.viagem_trechos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  viajante_id uuid NOT NULL,
  protocolo_id uuid NOT NULL,
  ordem integer DEFAULT 1 NOT NULL,
  origem character varying(200),
  destino character varying(200),
  tipo character varying(50) DEFAULT 'Aérea'::character varying,
  dt_saida date,
  numero_bilhete character varying(100),
  valor numeric(14,2) DEFAULT 0,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  hr_saida time without time zone,
  hr_retorno time without time zone,
  comprovante_url text,
  comprovante_nome text
);

CREATE TABLE IF NOT EXISTS public.viagem_viajantes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  protocolo_id uuid NOT NULL,
  nome text NOT NULL,
  funcao character varying(100),
  cpf character varying(20),
  email character varying(200),
  tem_passagem boolean DEFAULT false NOT NULL,
  sit_passagem character varying(30) DEFAULT 'solicitado'::character varying,
  spd_passagem character varying(50),
  aprovado_pass_por uuid,
  aprovado_pass_em timestamp with time zone,
  rejeitado_pass_motivo text,
  tem_diaria boolean DEFAULT false NOT NULL,
  sit_diaria character varying(30) DEFAULT 'solicitado'::character varying,
  spd_diaria character varying(50),
  aprovado_diar_por uuid,
  aprovado_diar_em timestamp with time zone,
  rejeitado_diar_motivo text,
  cartoes_embarque_urls text[] DEFAULT '{}'::text[],
  cartoes_embarque_nomes text[] DEFAULT '{}'::text[],
  relatorio_url text,
  relatorio_nome text,
  relatorio_data timestamp with time zone,
  lancamento_id uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  beneficiario_id uuid,
  alerta_prestacao_em timestamp with time zone,
  bloqueio_prestacao_em timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.viagens_diarias (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  numero_spd character varying(50),
  atividade_id uuid,
  objetivo text,
  origem character varying(100),
  destino character varying(100),
  dt_saida date,
  dt_retorno date,
  beneficiario_nome text NOT NULL,
  beneficiario_funcao character varying(100),
  beneficiario_cpf character varying(14),
  situacao character varying(20) DEFAULT 'solicitado'::character varying,
  comprovante_url text,
  comprovante_nome text,
  observacoes text,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now(),
  lancamento_id uuid,
  numero_sei character varying(50),
  email_solicitante character varying(200),
  tem_passagem boolean DEFAULT false NOT NULL,
  tem_diaria boolean DEFAULT false NOT NULL,
  spd_passagem character varying(50),
  spd_diaria character varying(50),
  sit_passagem character varying(30) DEFAULT 'solicitado'::character varying,
  aprovado_pass_por uuid,
  aprovado_pass_em timestamp with time zone,
  rejeitado_pass_motivo text,
  sit_diaria character varying(30) DEFAULT 'solicitado'::character varying,
  aprovado_diar_por uuid,
  aprovado_diar_em timestamp with time zone,
  rejeitado_diar_motivo text,
  cartoes_embarque_urls text[] DEFAULT '{}'::text[],
  cartoes_embarque_nomes text[] DEFAULT '{}'::text[],
  relatorio_url text,
  relatorio_nome text,
  relatorio_data timestamp with time zone
);

-- ===== SEQUENCES: posse =====
ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;
ALTER SEQUENCE public.auditoria_registros_numero_seq OWNED BY public.auditoria_registros.numero;
ALTER SEQUENCE public.diag_exportacoes_id_seq OWNED BY public.diag_exportacoes.id;
ALTER SEQUENCE public.diag_expurgo_arquivos_id_seq OWNED BY public.diag_expurgo_arquivos.id;
ALTER SEQUENCE public.diag_fichas_historico_id_seq OWNED BY public.diag_fichas_historico.id;
ALTER SEQUENCE public.fornecedores_codigo_interno_seq OWNED BY public.fornecedores.codigo_interno;
ALTER SEQUENCE public.rem_tentativas_senha_id_seq OWNED BY public.rem_tentativas_senha.id;
-- ===== CONSTRAINTS (PK, UNIQUE, CHECK, FK) =====
ALTER TABLE ONLY public.acervo_capas ADD CONSTRAINT acervo_capas_pkey PRIMARY KEY (midia_id);
ALTER TABLE ONLY public.acervo_publicacoes ADD CONSTRAINT acervo_publicacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.agente_analises ADD CONSTRAINT agente_analises_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.apa_demarcacoes ADD CONSTRAINT apa_demarcacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.api_acessos ADD CONSTRAINT api_acessos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.api_clientes ADD CONSTRAINT api_clientes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.api_pedido_notificacoes ADD CONSTRAINT api_pedido_notificacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.api_pedidos ADD CONSTRAINT api_pedidos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.atividade_indicador ADD CONSTRAINT atividade_indicador_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.atividade_matriz ADD CONSTRAINT atividade_matriz_pkey PRIMARY KEY (atividade_id, matriz_item_id);
ALTER TABLE ONLY public.atividade_responsaveis ADD CONSTRAINT atividade_responsaveis_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.atividades ADD CONSTRAINT atividades_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.auditoria_execucoes ADD CONSTRAINT auditoria_execucoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.auditoria_registros ADD CONSTRAINT auditoria_registros_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.beneficiario_dados_bancarios ADD CONSTRAINT beneficiario_dados_bancarios_pkey PRIMARY KEY (beneficiario_id);
ALTER TABLE ONLY public.beneficiarios ADD CONSTRAINT beneficiarios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.car_dados_locais ADD CONSTRAINT car_dados_locais_pkey PRIMARY KEY (cod_imovel);
ALTER TABLE ONLY public.car_marcados ADD CONSTRAINT car_marcados_pkey PRIMARY KEY (cod_imovel);
ALTER TABLE ONLY public.cobertura_notificacoes ADD CONSTRAINT cobertura_notificacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.configuracoes_sistema ADD CONSTRAINT configuracoes_sistema_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contrato_coberturas ADD CONSTRAINT contrato_coberturas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contrato_encerramento_documentos ADD CONSTRAINT contrato_encerramento_documentos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contrato_encerramento_pedidos ADD CONSTRAINT contrato_encerramento_pedidos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contrato_encerramentos ADD CONSTRAINT contrato_encerramentos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contratos ADD CONSTRAINT contratos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contratos_produtos ADD CONSTRAINT contratos_produtos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contratos_produtos_entregas ADD CONSTRAINT contratos_produtos_entregas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cotacoes_ptax ADD CONSTRAINT cotacoes_ptax_pkey PRIMARY KEY (data);
ALTER TABLE ONLY public.cotacoes_usd ADD CONSTRAINT cotacoes_usd_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.despachos_seq ADD CONSTRAINT despachos_seq_pkey PRIMARY KEY (ano);
ALTER TABLE ONLY public.diag_audios ADD CONSTRAINT diag_audios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diag_comunidades ADD CONSTRAINT diag_comunidades_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diag_exportacoes ADD CONSTRAINT diag_exportacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diag_expurgo_arquivos ADD CONSTRAINT diag_expurgo_arquivos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diag_fichas_historico ADD CONSTRAINT diag_fichas_historico_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diag_fichas_identificacao ADD CONSTRAINT diag_fichas_identificacao_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diag_fotos ADD CONSTRAINT diag_fotos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diag_localidades ADD CONSTRAINT diag_localidades_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diag_moradores ADD CONSTRAINT diag_moradores_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diag_moradores_identificacao ADD CONSTRAINT diag_moradores_identificacao_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diag_municipios ADD CONSTRAINT diag_municipios_pkey PRIMARY KEY (ibge);
ALTER TABLE ONLY public.diag_questionarios ADD CONSTRAINT diag_questionarios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.diag_sugestoes_ocultas ADD CONSTRAINT diag_sugestoes_ocultas_pkey PRIMARY KEY (chave, texto_normalizado);
ALTER TABLE ONLY public.entrega_aprovacao_senhas ADD CONSTRAINT entrega_aprovacao_senhas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.entrega_documentos ADD CONSTRAINT entrega_documentos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.execucao_financeira ADD CONSTRAINT execucao_financeira_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.fornecedor_dados_bancarios ADD CONSTRAINT fornecedor_dados_bancarios_pkey PRIMARY KEY (fornecedor_id);
ALTER TABLE ONLY public.fornecedor_usuarios ADD CONSTRAINT fornecedor_usuarios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.fornecedores ADD CONSTRAINT fornecedores_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.geometria_fotos ADD CONSTRAINT geometria_fotos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.gmail_sync_state ADD CONSTRAINT gmail_sync_state_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.historico_indicadores ADD CONSTRAINT historico_indicadores_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.indicador_historico ADD CONSTRAINT indicador_historico_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.indicadores ADD CONSTRAINT indicadores_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.lgpd_tratamentos ADD CONSTRAINT lgpd_tratamentos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.mapa_pontos_log ADD CONSTRAINT mapa_pontos_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.matriz_itens ADD CONSTRAINT matriz_itens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.metas_km_refs ADD CONSTRAINT metas_km_refs_pkey PRIMARY KEY (numero);
ALTER TABLE ONLY public.nota_tecnica_calibracao_chaves ADD CONSTRAINT nota_tecnica_calibracao_chaves_pkey PRIMARY KEY (chave);
ALTER TABLE ONLY public.nota_tecnica_conferencias ADD CONSTRAINT nota_tecnica_conferencias_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.notificacoes ADD CONSTRAINT notificacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ods_refs ADD CONSTRAINT ods_refs_pkey PRIMARY KEY (numero);
ALTER TABLE ONLY public.orcamento_eventos ADD CONSTRAINT orcamento_eventos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.outputs ADD CONSTRAINT outputs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.passagens_diarias ADD CONSTRAINT passagens_diarias_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.prestacao_tokens ADD CONSTRAINT prestacao_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.produto_entregue_indicador ADD CONSTRAINT produto_entregue_indicador_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.produto_evidencias ADD CONSTRAINT produto_evidencias_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.produto_indicador ADD CONSTRAINT produto_indicador_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.produto_matriz_contribuicao ADD CONSTRAINT produto_matriz_contribuicao_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.produto_notif_log ADD CONSTRAINT produto_notif_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.produto_pontos_mapa ADD CONSTRAINT produto_pontos_mapa_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.produtos_entregues ADD CONSTRAINT produtos_entregues_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pulso_ciclos ADD CONSTRAINT pulso_ciclos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pulso_espelho ADD CONSTRAINT pulso_espelho_pkey PRIMARY KEY (ciclo_id, usuario_id);
ALTER TABLE ONLY public.pulso_espelho_v2 ADD CONSTRAINT pulso_espelho_v2_pkey PRIMARY KEY (ciclo_id, usuario_id);
ALTER TABLE ONLY public.pulso_exportacoes ADD CONSTRAINT pulso_exportacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pulso_participacoes ADD CONSTRAINT pulso_participacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pulso_respostas ADD CONSTRAINT pulso_respostas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pulso_respostas_v2 ADD CONSTRAINT pulso_respostas_v2_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.rem_cargo_titulares ADD CONSTRAINT rem_cargo_titulares_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.rem_cargos ADD CONSTRAINT rem_cargos_pkey PRIMARY KEY (codigo);
ALTER TABLE ONLY public.rem_numeracao ADD CONSTRAINT rem_numeracao_pkey PRIMARY KEY (ano);
ALTER TABLE ONLY public.rem_tentativas_senha ADD CONSTRAINT rem_tentativas_senha_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.remanejamento_alocacoes ADD CONSTRAINT remanejamento_alocacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.remanejamento_assinaturas ADD CONSTRAINT remanejamento_assinaturas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.remanejamento_etapas ADD CONSTRAINT remanejamento_etapas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.remanejamento_historico ADD CONSTRAINT remanejamento_historico_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.remanejamento_itens ADD CONSTRAINT remanejamento_itens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.remanejamento_notificacoes ADD CONSTRAINT remanejamento_notificacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.remanejamentos ADD CONSTRAINT remanejamentos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.repositorio_links ADD CONSTRAINT repositorio_links_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.resultados ADD CONSTRAINT resultados_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.riscos ADD CONSTRAINT riscos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.senha_tokens ADD CONSTRAINT senha_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.solicitacoes_senha ADD CONSTRAINT solicitacoes_senha_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tarefa_anexos ADD CONSTRAINT tarefa_anexos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tarefa_checklist ADD CONSTRAINT tarefa_checklist_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tarefa_comentarios ADD CONSTRAINT tarefa_comentarios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tarefa_historico ADD CONSTRAINT tarefa_historico_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tarefa_participantes ADD CONSTRAINT tarefa_participantes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tarefa_tdrs ADD CONSTRAINT tarefa_tdrs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tarefa_tipos ADD CONSTRAINT tarefa_tipos_pkey PRIMARY KEY (codigo);
ALTER TABLE ONLY public.tarefas ADD CONSTRAINT tarefas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_acoes ADD CONSTRAINT tdr_acoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_anexos ADD CONSTRAINT tdr_anexos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_canc_numeracao ADD CONSTRAINT tdr_canc_numeracao_pkey PRIMARY KEY (ano);
ALTER TABLE ONLY public.tdr_cancelamento_assinaturas ADD CONSTRAINT tdr_cancelamento_assinaturas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_cancelamento_etapas ADD CONSTRAINT tdr_cancelamento_etapas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_cancelamento_historico ADD CONSTRAINT tdr_cancelamento_historico_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_cancelamento_notificacoes ADD CONSTRAINT tdr_cancelamento_notificacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_cancelamentos ADD CONSTRAINT tdr_cancelamentos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_comentarios ADD CONSTRAINT tdr_comentarios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_confirmacoes ADD CONSTRAINT tdr_confirmacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_licitacao_empresas ADD CONSTRAINT tdr_licitacao_empresas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_licitacao_prorrogacoes ADD CONSTRAINT tdr_licitacao_prorrogacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_licitacoes ADD CONSTRAINT tdr_licitacoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_produtos_previstos ADD CONSTRAINT tdr_produtos_previstos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_responsaveis ADD CONSTRAINT tdr_responsaveis_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_versoes ADD CONSTRAINT tdr_versoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdr_versoes_editor ADD CONSTRAINT tdr_versoes_editor_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tdrs ADD CONSTRAINT tdrs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.trilha_metadata ADD CONSTRAINT trilha_metadata_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.usuario_permissoes ADD CONSTRAINT usuario_permissoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.usuario_senha_temporaria ADD CONSTRAINT usuario_senha_temporaria_pkey PRIMARY KEY (usuario_id);
ALTER TABLE ONLY public.usuarios ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.viagem_decisoes ADD CONSTRAINT viagem_decisoes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.viagem_diarias ADD CONSTRAINT viagem_diarias_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.viagem_diarias_v2 ADD CONSTRAINT viagem_diarias_v2_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.viagem_notif_log ADD CONSTRAINT viagem_notif_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.viagem_passagens ADD CONSTRAINT viagem_passagens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.viagem_protocolo_seq_ano ADD CONSTRAINT viagem_protocolo_seq_ano_pkey PRIMARY KEY (ano);
ALTER TABLE ONLY public.viagem_protocolos ADD CONSTRAINT viagem_protocolos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.viagem_trechos ADD CONSTRAINT viagem_trechos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.viagem_viajantes ADD CONSTRAINT viagem_viajantes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.viagens_diarias ADD CONSTRAINT viagens_diarias_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.acervo_publicacoes ADD CONSTRAINT acervo_publicacoes_midia_id_key UNIQUE (midia_id);
ALTER TABLE ONLY public.api_clientes ADD CONSTRAINT api_clientes_chave_hash_key UNIQUE (chave_hash);
ALTER TABLE ONLY public.api_pedidos ADD CONSTRAINT api_pedidos_gmail_message_id_key UNIQUE (gmail_message_id);
ALTER TABLE ONLY public.api_pedidos ADD CONSTRAINT api_pedidos_numero_key UNIQUE (numero);
ALTER TABLE ONLY public.api_pedidos ADD CONSTRAINT api_pedidos_retirada_hash_key UNIQUE (retirada_hash);
ALTER TABLE ONLY public.atividade_indicador ADD CONSTRAINT atividade_indicador_atividade_id_indicador_id_key UNIQUE (atividade_id, indicador_id);
ALTER TABLE ONLY public.atividade_responsaveis ADD CONSTRAINT atividade_responsaveis_atividade_id_usuario_id_papel_key UNIQUE (atividade_id, usuario_id, papel);
ALTER TABLE ONLY public.atividades ADD CONSTRAINT atividades_codigo_key UNIQUE (codigo);
ALTER TABLE ONLY public.configuracoes_sistema ADD CONSTRAINT configuracoes_sistema_projeto_id_key UNIQUE (projeto_id);
ALTER TABLE ONLY public.contrato_coberturas ADD CONSTRAINT contrato_coberturas_seq_key UNIQUE (seq);
ALTER TABLE ONLY public.contratos ADD CONSTRAINT contratos_numero_key UNIQUE (numero);
ALTER TABLE ONLY public.contratos_produtos ADD CONSTRAINT contratos_produtos_contrato_id_numero_produto_key UNIQUE (contrato_id, numero_produto);
ALTER TABLE ONLY public.contratos_produtos_entregas ADD CONSTRAINT contratos_produtos_entregas_produto_id_numero_entrega_key UNIQUE (produto_id, numero_entrega);
ALTER TABLE ONLY public.diag_audios ADD CONSTRAINT uq_diag_audios_pergunta UNIQUE (ficha_id, pergunta_chave);
ALTER TABLE ONLY public.diag_audios ADD CONSTRAINT uq_diag_audios_uuid_cliente UNIQUE (uuid_cliente);
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT uq_diag_fichas_codigo UNIQUE (codigo);
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT uq_diag_fichas_uuid_cliente UNIQUE (uuid_cliente);
ALTER TABLE ONLY public.diag_fichas_identificacao ADD CONSTRAINT diag_fichas_identificacao_ficha_id_key UNIQUE (ficha_id);
ALTER TABLE ONLY public.diag_fotos ADD CONSTRAINT uq_diag_fotos_uuid_cliente UNIQUE (uuid_cliente);
ALTER TABLE ONLY public.diag_moradores ADD CONSTRAINT diag_moradores_ficha_id_ordem_key UNIQUE (ficha_id, ordem);
ALTER TABLE ONLY public.diag_moradores_identificacao ADD CONSTRAINT diag_moradores_identificacao_morador_id_key UNIQUE (morador_id);
ALTER TABLE ONLY public.diag_municipios ADD CONSTRAINT diag_municipios_nome_key UNIQUE (nome);
ALTER TABLE ONLY public.diag_municipios ADD CONSTRAINT diag_municipios_sigla_key UNIQUE (sigla);
ALTER TABLE ONLY public.diag_questionarios ADD CONSTRAINT diag_questionarios_codigo_versao_key UNIQUE (codigo, versao);
ALTER TABLE ONLY public.fornecedor_usuarios ADD CONSTRAINT fornecedor_usuarios_fornecedor_id_usuario_id_key UNIQUE (fornecedor_id, usuario_id);
ALTER TABLE ONLY public.fornecedores ADD CONSTRAINT fornecedores_codigo_interno_key UNIQUE (codigo_interno);
ALTER TABLE ONLY public.historico_indicadores ADD CONSTRAINT historico_indicadores_indicador_id_trimestre_key UNIQUE (indicador_id, trimestre);
ALTER TABLE ONLY public.lgpd_tratamentos ADD CONSTRAINT lgpd_tratamentos_codigo_key UNIQUE (codigo);
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_estorno_de_key UNIQUE (estorno_de);
ALTER TABLE ONLY public.outputs ADD CONSTRAINT outputs_codigo_key UNIQUE (codigo);
ALTER TABLE ONLY public.prestacao_tokens ADD CONSTRAINT prestacao_tokens_token_key UNIQUE (token);
ALTER TABLE ONLY public.produto_entregue_indicador ADD CONSTRAINT produto_entregue_indicador_produto_entregue_id_indicador_id_key UNIQUE (produto_entregue_id, indicador_id);
ALTER TABLE ONLY public.produto_indicador ADD CONSTRAINT produto_indicador_produto_previsto_id_indicador_id_key UNIQUE (produto_previsto_id, indicador_id);
ALTER TABLE ONLY public.pulso_ciclos ADD CONSTRAINT pulso_ciclos_token_key UNIQUE (token);
ALTER TABLE ONLY public.remanejamento_alocacoes ADD CONSTRAINT remanejamento_alocacoes_item_id_fonte_id_key UNIQUE (item_id, fonte_id);
ALTER TABLE ONLY public.remanejamento_etapas ADD CONSTRAINT remanejamento_etapas_remanejamento_id_versao_ordem_key UNIQUE (remanejamento_id, versao, ordem);
ALTER TABLE ONLY public.remanejamento_itens ADD CONSTRAINT remanejamento_itens_remanejamento_id_atividade_id_key UNIQUE (remanejamento_id, atividade_id);
ALTER TABLE ONLY public.remanejamentos ADD CONSTRAINT remanejamentos_numero_key UNIQUE (numero);
ALTER TABLE ONLY public.remanejamentos ADD CONSTRAINT remanejamentos_uuid_cliente_key UNIQUE (uuid_cliente);
ALTER TABLE ONLY public.resultados ADD CONSTRAINT resultados_codigo_key UNIQUE (codigo);
ALTER TABLE ONLY public.tarefa_participantes ADD CONSTRAINT tarefa_participantes_tarefa_id_usuario_id_key UNIQUE (tarefa_id, usuario_id);
ALTER TABLE ONLY public.tarefa_tdrs ADD CONSTRAINT tarefa_tdrs_tarefa_id_tdr_id_key UNIQUE (tarefa_id, tdr_id);
ALTER TABLE ONLY public.tarefas ADD CONSTRAINT tarefas_codigo_key UNIQUE (codigo);
ALTER TABLE ONLY public.tdr_cancelamento_etapas ADD CONSTRAINT tdr_cancelamento_etapas_cancelamento_id_versao_ordem_key UNIQUE (cancelamento_id, versao, ordem);
ALTER TABLE ONLY public.tdr_cancelamentos ADD CONSTRAINT tdr_cancelamentos_numero_key UNIQUE (numero);
ALTER TABLE ONLY public.tdr_cancelamentos ADD CONSTRAINT tdr_cancelamentos_uuid_cliente_key UNIQUE (uuid_cliente);
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_tdr_id_rodada_key UNIQUE (tdr_id, rodada);
ALTER TABLE ONLY public.tdr_licitacoes ADD CONSTRAINT tdr_licitacoes_tdr_id_rodada_key UNIQUE (tdr_id, rodada);
ALTER TABLE ONLY public.tdr_produtos_previstos ADD CONSTRAINT tdr_produtos_previstos_tdr_id_numero_produto_key UNIQUE (tdr_id, numero_produto);
ALTER TABLE ONLY public.tdr_responsaveis ADD CONSTRAINT tdr_responsaveis_tdr_id_usuario_id_papel_key UNIQUE (tdr_id, usuario_id, papel);
ALTER TABLE ONLY public.tdr_versoes_editor ADD CONSTRAINT tdr_versoes_editor_tdr_id_versao_key UNIQUE (tdr_id, versao);
ALTER TABLE ONLY public.tdrs ADD CONSTRAINT tdrs_numero_key UNIQUE (numero);
ALTER TABLE ONLY public.trilha_metadata ADD CONSTRAINT trilha_metadata_geometry_group_key UNIQUE (geometry_group);
ALTER TABLE ONLY public.usuario_permissoes ADD CONSTRAINT usuario_permissoes_usuario_id_modulo_key UNIQUE (usuario_id, modulo);
ALTER TABLE ONLY public.usuarios ADD CONSTRAINT usuarios_email_key UNIQUE (email);
ALTER TABLE ONLY public.viagem_protocolos ADD CONSTRAINT viagem_protocolos_numero_key UNIQUE (numero);
ALTER TABLE ONLY public.acervo_capas ADD CONSTRAINT acervo_capas_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'falha'::text])));
ALTER TABLE ONLY public.agente_analises ADD CONSTRAINT agente_analises_checkpoint_check CHECK ((checkpoint = ANY (ARRAY[1, 2, 3, 4])));
ALTER TABLE ONLY public.agente_analises ADD CONSTRAINT agente_analises_referencia_tipo_check CHECK ((referencia_tipo = ANY (ARRAY['tdr'::text, 'contrato'::text, 'contratos_produtos'::text, 'contratos_produtos_entregas'::text])));
ALTER TABLE ONLY public.agente_analises ADD CONSTRAINT agente_analises_status_check CHECK ((status = ANY (ARRAY['aprovado'::text, 'alerta'::text, 'reprovado'::text])));
ALTER TABLE ONLY public.api_clientes ADD CONSTRAINT api_clientes_escopos_ck CHECK ((escopos <@ ARRAY['resumo'::text, 'atividades'::text, 'matriz'::text]));
ALTER TABLE ONLY public.api_clientes ADD CONSTRAINT api_clientes_limite_minuto_check CHECK (((limite_minuto >= 1) AND (limite_minuto <= 1000)));
ALTER TABLE ONLY public.api_pedido_notificacoes ADD CONSTRAINT api_pedido_notificacoes_evento_check CHECK ((evento = ANY (ARRAY['recebido'::text, 'aprovado'::text, 'recusado'::text, 'vencendo'::text])));
ALTER TABLE ONLY public.api_pedidos ADD CONSTRAINT api_pedidos_status_check CHECK ((status = ANY (ARRAY['recebido'::text, 'aprovado'::text, 'recusado'::text, 'retirado'::text, 'expirado'::text])));
ALTER TABLE ONLY public.atividade_responsaveis ADD CONSTRAINT atividade_responsaveis_papel_check CHECK (((papel)::text = ANY ((ARRAY['responsavel'::character varying, 'substituto'::character varying])::text[])));
ALTER TABLE ONLY public.auditoria_execucoes ADD CONSTRAINT auditoria_execucoes_status_check CHECK ((status = ANY (ARRAY['rodando'::text, 'concluido'::text, 'erro'::text])));
ALTER TABLE ONLY public.auditoria_registros ADD CONSTRAINT auditoria_registros_dominio_check CHECK ((dominio = ANY (ARRAY['tdr_contrato'::text, 'financeiro'::text, 'produtos'::text, 'viagens'::text, 'matriz'::text, 'qualidade_dados'::text])));
ALTER TABLE ONLY public.auditoria_registros ADD CONSTRAINT auditoria_registros_severidade_check CHECK ((severidade = ANY (ARRAY['critico'::text, 'alto'::text, 'medio'::text, 'baixo'::text, 'info'::text])));
ALTER TABLE ONLY public.auditoria_registros ADD CONSTRAINT auditoria_registros_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'em_analise'::text, 'resolvido'::text, 'ignorado'::text])));
ALTER TABLE ONLY public.cobertura_notificacoes ADD CONSTRAINT cobertura_notificacoes_evento_check CHECK ((evento = ANY (ARRAY['travado'::text, 'liberado'::text])));
ALTER TABLE ONLY public.contrato_coberturas ADD CONSTRAINT contrato_coberturas_deficit_usd_check CHECK ((deficit_usd >= (0)::numeric));
ALTER TABLE ONLY public.contrato_coberturas ADD CONSTRAINT contrato_coberturas_evento_check CHECK ((evento = ANY (ARRAY['carga_inicial'::text, 'cadastro'::text, 'aditivo'::text, 'reducao'::text, 'cancelamento'::text, 'vinculo'::text, 'desvinculo'::text, 'tdr_alterado'::text])));
ALTER TABLE ONLY public.contrato_coberturas ADD CONSTRAINT contrato_coberturas_excedente_depois_brl_check CHECK ((excedente_depois_brl >= (0)::numeric));
ALTER TABLE ONLY public.contrato_coberturas ADD CONSTRAINT contrato_coberturas_situacao_check CHECK ((situacao = ANY (ARRAY['sem_deficit'::text, 'aguardando'::text, 'coberto'::text, 'cancelado'::text])));
ALTER TABLE ONLY public.contrato_encerramento_documentos ADD CONSTRAINT contrato_encerramento_documentos_sha256_check CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE ONLY public.contrato_encerramento_pedidos ADD CONSTRAINT contrato_encerramento_pedidos_motivo_check CHECK ((length(btrim(motivo)) >= 20));
ALTER TABLE ONLY public.contrato_encerramento_pedidos ADD CONSTRAINT contrato_encerramento_pedidos_status_check CHECK ((status = ANY (ARRAY['aguardando'::text, 'aprovado'::text, 'devolvido'::text, 'cancelado'::text])));
ALTER TABLE ONLY public.contrato_encerramento_pedidos ADD CONSTRAINT contrato_encerramento_pedidos_termo_sha256_check CHECK (((termo_sha256 IS NULL) OR (termo_sha256 ~ '^[0-9a-f]{64}$'::text)));
ALTER TABLE ONLY public.contrato_encerramento_pedidos ADD CONSTRAINT contrato_encerramento_pedidos_valor_liberado_brl_check CHECK ((valor_liberado_brl >= (0)::numeric));
ALTER TABLE ONLY public.contrato_encerramentos ADD CONSTRAINT contrato_encerramentos_status_chk CHECK ((status = ANY (ARRAY['ativo'::text, 'revertido'::text])));
ALTER TABLE ONLY public.contrato_encerramentos ADD CONSTRAINT contrato_encerramentos_tipo_chk CHECK ((tipo = ANY (ARRAY['encerramento_contrato'::text, 'economia_contratacao'::text])));
ALTER TABLE ONLY public.contratos_produtos ADD CONSTRAINT contratos_produtos_situacao_check CHECK ((situacao = ANY (ARRAY['pendente'::text, 'em_analise'::text, 'aprovado'::text, 'entrega_parcial'::text, 'pago'::text, 'cancelado'::text, 'devolvido'::text])));
ALTER TABLE ONLY public.contratos_produtos_entregas ADD CONSTRAINT contratos_produtos_entregas_pct_entregue_check CHECK (((pct_entregue > (0)::numeric) AND (pct_entregue <= (100)::numeric)));
ALTER TABLE ONLY public.contratos_produtos_entregas ADD CONSTRAINT contratos_produtos_entregas_situacao_check CHECK ((situacao = ANY (ARRAY['pendente'::text, 'em_analise'::text, 'aprovada'::text, 'devolvida'::text, 'rejeitada'::text, 'cancelada'::text])));
ALTER TABLE ONLY public.contratos_produtos_entregas ADD CONSTRAINT contratos_produtos_entregas_tipo_decisao_check CHECK ((tipo_decisao = ANY (ARRAY['aprovacao_total'::text, 'aprovacao_parcial'::text, 'devolucao'::text])));
ALTER TABLE ONLY public.cotacoes_ptax ADD CONSTRAINT cotacoes_ptax_ptax_compra_check CHECK ((ptax_compra > (0)::numeric));
ALTER TABLE ONLY public.cotacoes_ptax ADD CONSTRAINT cotacoes_ptax_ptax_venda_check CHECK ((ptax_venda > (0)::numeric));
ALTER TABLE ONLY public.diag_audios ADD CONSTRAINT diag_audios_bytes_check CHECK (((bytes IS NULL) OR ((bytes > 0) AND (bytes <= 4194304))));
ALTER TABLE ONLY public.diag_audios ADD CONSTRAINT diag_audios_duracao_s_check CHECK (((duracao_s IS NULL) OR ((duracao_s > (0)::numeric) AND (duracao_s <= (185)::numeric))));
ALTER TABLE ONLY public.diag_audios ADD CONSTRAINT diag_audios_transcricao_origem_check CHECK (((transcricao_origem IS NULL) OR (transcricao_origem = ANY (ARRAY['manual'::text, 'ia_local'::text]))));
ALTER TABLE ONLY public.diag_comunidades ADD CONSTRAINT diag_comunidades_nome_check CHECK (((length(btrim(nome)) >= 2) AND (length(btrim(nome)) <= 150)));
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT ck_diag_ficha_comunidade CHECK (((comunidade_id IS NOT NULL) OR (comunidade_nova IS NOT NULL)));
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT ck_diag_ficha_devolvida CHECK (((status <> 'devolvida'::text) OR (motivo_devolucao IS NOT NULL)));
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT ck_diag_ficha_localidade_nova CHECK (((localidade_nova IS NULL) OR ((localidade_id IS NULL) AND ((length(btrim(localidade_nova)) >= 2) AND (length(btrim(localidade_nova)) <= 150)))));
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT ck_diag_ficha_recusa CHECK ((aceitou_participar OR (respostas = '{}'::jsonb)));
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT ck_diag_ficha_treino_codigo CHECK ((treino = (codigo ~~ 'TRE-%'::text)));
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT ck_diag_ficha_validada CHECK (((status <> 'validada'::text) OR (validado_em IS NOT NULL)));
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_alertas_check CHECK ((jsonb_typeof(alertas) = 'array'::text));
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_codigo_check CHECK (((length(codigo) >= 5) AND (length(codigo) <= 40)));
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_comunidade_nova_check CHECK (((comunidade_nova IS NULL) OR ((length(btrim(comunidade_nova)) >= 2) AND (length(btrim(comunidade_nova)) <= 150))));
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_fotos_registradas_check CHECK (((fotos_registradas IS NULL) OR ((fotos_registradas >= 0) AND (fotos_registradas <= 8))));
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_respostas_check CHECK ((jsonb_typeof(respostas) = 'object'::text));
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_status_check CHECK ((status = ANY (ARRAY['enviada'::text, 'devolvida'::text, 'validada'::text, 'descartada'::text])));
ALTER TABLE ONLY public.diag_fichas_identificacao ADD CONSTRAINT ck_diag_ident_nao_vazia CHECK (((entrevistado_nome IS NOT NULL) OR (lat IS NOT NULL) OR (obs_localizacao IS NOT NULL)));
ALTER TABLE ONLY public.diag_fichas_identificacao ADD CONSTRAINT diag_fichas_identificacao_entrevistado_nome_check CHECK (((entrevistado_nome IS NULL) OR ((length(btrim(entrevistado_nome)) >= 1) AND (length(btrim(entrevistado_nome)) <= 150))));
ALTER TABLE ONLY public.diag_fichas_identificacao ADD CONSTRAINT diag_fichas_identificacao_lat_check CHECK (((lat >= ('-90'::integer)::numeric) AND (lat <= (90)::numeric)));
ALTER TABLE ONLY public.diag_fichas_identificacao ADD CONSTRAINT diag_fichas_identificacao_lon_check CHECK (((lon >= ('-180'::integer)::numeric) AND (lon <= (180)::numeric)));
ALTER TABLE ONLY public.diag_fichas_identificacao ADD CONSTRAINT diag_fichas_identificacao_obs_localizacao_check CHECK (((obs_localizacao IS NULL) OR (length(obs_localizacao) <= 300)));
ALTER TABLE ONLY public.diag_fotos ADD CONSTRAINT diag_fotos_gps_origem_check CHECK ((gps_origem = ANY (ARRAY['foto'::text, 'ficha'::text])));
ALTER TABLE ONLY public.diag_fotos ADD CONSTRAINT diag_fotos_lat_check CHECK (((lat >= ('-90'::integer)::numeric) AND (lat <= (90)::numeric)));
ALTER TABLE ONLY public.diag_fotos ADD CONSTRAINT diag_fotos_legenda_check CHECK (((legenda IS NULL) OR (length(legenda) <= 200)));
ALTER TABLE ONLY public.diag_fotos ADD CONSTRAINT diag_fotos_lon_check CHECK (((lon >= ('-180'::integer)::numeric) AND (lon <= (180)::numeric)));
ALTER TABLE ONLY public.diag_fotos ADD CONSTRAINT diag_fotos_tema_check CHECK ((tema = ANY (ARRAY['moradia'::text, 'agua'::text, 'esgoto'::text, 'lixo'::text, 'producao'::text, 'acesso'::text, 'ambiental'::text, 'outro'::text])));
ALTER TABLE ONLY public.diag_localidades ADD CONSTRAINT diag_localidades_nome_check CHECK (((length(btrim(nome)) >= 2) AND (length(btrim(nome)) <= 150)));
ALTER TABLE ONLY public.diag_moradores ADD CONSTRAINT diag_moradores_atividade_principal_check CHECK (((atividade_principal IS NULL) OR (length(atividade_principal) <= 80)));
ALTER TABLE ONLY public.diag_moradores ADD CONSTRAINT diag_moradores_escolaridade_check CHECK (((escolaridade IS NULL) OR (length(escolaridade) <= 80)));
ALTER TABLE ONLY public.diag_moradores ADD CONSTRAINT diag_moradores_idade_check CHECK (((idade >= 0) AND (idade <= 120)));
ALTER TABLE ONLY public.diag_moradores ADD CONSTRAINT diag_moradores_ordem_check CHECK (((ordem >= 1) AND (ordem <= 30)));
ALTER TABLE ONLY public.diag_moradores ADD CONSTRAINT diag_moradores_parentesco_check CHECK (((parentesco IS NULL) OR (length(parentesco) <= 80)));
ALTER TABLE ONLY public.diag_moradores ADD CONSTRAINT diag_moradores_sexo_genero_outro_check CHECK (((sexo_genero_outro IS NULL) OR (length(sexo_genero_outro) <= 120)));
ALTER TABLE ONLY public.diag_moradores_identificacao ADD CONSTRAINT diag_moradores_identificacao_nome_check CHECK (((length(btrim(nome)) >= 1) AND (length(btrim(nome)) <= 150)));
ALTER TABLE ONLY public.diag_questionarios ADD CONSTRAINT diag_questionarios_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'publicado'::text, 'arquivado'::text])));
ALTER TABLE ONLY public.diag_questionarios ADD CONSTRAINT diag_questionarios_versao_check CHECK ((versao >= 1));
ALTER TABLE ONLY public.entrega_aprovacao_senhas ADD CONSTRAINT entrega_aprovacao_senhas_tipo_decisao_check CHECK ((tipo_decisao = ANY (ARRAY['aprovacao_total'::text, 'aprovacao_parcial'::text])));
ALTER TABLE ONLY public.fornecedores ADD CONSTRAINT fornecedores_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['PF'::character varying, 'PJ'::character varying])::text[])));
ALTER TABLE ONLY public.indicador_historico ADD CONSTRAINT indicador_historico_origem_check CHECK (((origem)::text = ANY ((ARRAY['automatico'::character varying, 'manual'::character varying])::text[])));
ALTER TABLE ONLY public.indicadores ADD CONSTRAINT indicadores_status_execucao_check CHECK (((status_execucao)::text = ANY ((ARRAY['nao_iniciado'::character varying, 'em_risco'::character varying, 'no_prazo'::character varying, 'concluido'::character varying])::text[])));
ALTER TABLE ONLY public.lgpd_tratamentos ADD CONSTRAINT lgpd_tratamentos_base_legal_check CHECK ((base_legal = ANY (ARRAY['a_definir'::text, 'art7_ii_obrigacao_legal'::text, 'art7_iii_politica_publica'::text, 'art7_iv_estudo_pesquisa'::text, 'art7_v_contrato'::text, 'art11_ii_b_politica_publica'::text, 'art11_ii_c_estudo_pesquisa'::text])));
ALTER TABLE ONLY public.mapa_pontos_log ADD CONSTRAINT mapa_pontos_log_acao_check CHECK ((acao = ANY (ARRAY['criar'::text, 'editar'::text, 'excluir'::text])));
ALTER TABLE ONLY public.matriz_itens ADD CONSTRAINT matriz_itens_resultado_check CHECK ((resultado = ANY (ARRAY[1, 2, 3])));
ALTER TABLE ONLY public.nota_tecnica_conferencias ADD CONSTRAINT nota_tecnica_conferencias_origem_check CHECK ((origem = ANY (ARRAY['tela'::text, 'calibracao'::text])));
ALTER TABLE ONLY public.notificacoes ADD CONSTRAINT notificacoes_tipo_check CHECK (((tipo)::text = ANY (ARRAY['tdr_para_revisar'::text, 'tdr_devolvido'::text, 'tdr_aprovado'::text, 'tdr_enviado_unesco'::text, 'produto_para_avaliar'::text, 'produto_aprovado'::text, 'produto_devolvido'::text, 'produto_aguarda_pagamento'::text, 'atividade_sem_responsavel'::text, 'substituto_designado'::text, 'desempate_necessario'::text, 'viagem_solicitada'::text, 'viagem_aprovada'::text, 'viagem_rejeitada'::text, 'viagem_prestacao'::text, 'reset_senha_solicitado'::text, 'reset_senha_atendido'::text, 'tarefa_atribuida'::text, 'tarefa_prazo'::text, 'tarefa_concluida'::text, 'tarefa_comentario'::text, 'tarefa_observador'::text, 'tarefa_subtarefa'::text, 'tarefa_revisao'::text, 'tarefa_devolvida'::text, 'tarefa_reaberta'::text, 'remanejamento_analisar'::text, 'remanejamento_devolvido'::text, 'remanejamento_recusado'::text, 'remanejamento_efetivado'::text, 'remanejamento_cancelado'::text, 'contrato_travado'::text, 'contrato_liberado'::text, 'tdr_cancelamento_analisar'::text, 'tdr_cancelamento_devolvido'::text, 'tdr_cancelamento_recusado'::text, 'tdr_cancelamento_efetivado'::text, 'tdr_cancelamento_cancelado'::text, 'tdr_execucao_direta_alerta'::text, 'api_pedido'::text])));
ALTER TABLE ONLY public.orcamento_eventos ADD CONSTRAINT orcamento_eventos_evento_check CHECK ((evento = ANY (ARRAY['tdr_criado'::text, 'tdr_cancelado'::text, 'tdr_reativado'::text, 'tdr_valor_alterado'::text, 'tdr_excluido'::text, 'tdr_saiu_da_atividade'::text, 'tdr_entrou_na_atividade'::text, 'tdr_execucao_direta_alterada'::text])));
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_cessao_ck CHECK (((tipo <> 'remanejamento_cedido'::text) OR (ajusta_fonte_id IS NOT NULL)));
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_credito_ck CHECK (((ajusta_fonte_id IS NOT NULL) OR ((estorno_de IS NULL) AND (valor_usd > (0)::numeric) AND (tipo <> 'remanejamento_cedido'::text))));
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_descricao_check CHECK ((btrim(descricao) <> ''::text));
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_liberacao_ck CHECK (((tipo <> ALL (ARRAY['economia_contratacao'::text, 'encerramento_contrato'::text])) OR (encerramento_id IS NOT NULL)));
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_recebido_ck CHECK (((tipo <> 'remanejamento_recebido'::text) OR (ajusta_fonte_id IS NOT NULL) OR (fonte_origem_id IS NOT NULL)));
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_tipo_check CHECK ((tipo = ANY (ARRAY['dotacao_original'::text, 'revisao_orcamentaria'::text, 'economia_contratacao'::text, 'encerramento_contrato'::text, 'remanejamento_recebido'::text, 'remanejamento_cedido'::text])));
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_valor_usd_check CHECK ((valor_usd <> (0)::numeric));
ALTER TABLE ONLY public.passagens_diarias ADD CONSTRAINT passagens_diarias_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['Passagem'::character varying, 'Diária'::character varying])::text[])));
ALTER TABLE ONLY public.produto_evidencias ADD CONSTRAINT produto_evidencias_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['foto'::character varying, 'documento'::character varying, 'video'::character varying, 'outro'::character varying])::text[])));
ALTER TABLE ONLY public.produto_indicador ADD CONSTRAINT produto_indicador_origem_check CHECK (((origem)::text = ANY ((ARRAY['automatico'::character varying, 'manual'::character varying])::text[])));
ALTER TABLE ONLY public.produto_matriz_contribuicao ADD CONSTRAINT produto_matriz_contribuicao_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'confirmado'::text, 'rejeitado'::text, 'cancelado'::text])));
ALTER TABLE ONLY public.produto_pontos_mapa ADD CONSTRAINT produto_pontos_mapa_apa_check CHECK ((apa = ANY (ARRAY['Igarapé São Francisco'::text, 'Lago do Amapá'::text, 'Outra'::text])));
ALTER TABLE ONLY public.produto_pontos_mapa ADD CONSTRAINT produto_pontos_mapa_geometry_type_check CHECK ((geometry_type = ANY (ARRAY['ponto'::text, 'poligono'::text, 'trilha'::text])));
ALTER TABLE ONLY public.produto_pontos_mapa ADD CONSTRAINT produto_pontos_mapa_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'inativo'::text])));
ALTER TABLE ONLY public.pulso_ciclos ADD CONSTRAINT pulso_ciclos_limite_convidados_check CHECK (((limite_convidados IS NULL) OR (limite_convidados > 0)));
ALTER TABLE ONLY public.pulso_ciclos ADD CONSTRAINT pulso_ciclos_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'encerrado'::text])));
ALTER TABLE ONLY public.pulso_ciclos ADD CONSTRAINT pulso_ciclos_titulo_check CHECK (((length(btrim(titulo)) >= 3) AND (length(btrim(titulo)) <= 120)));
ALTER TABLE ONLY public.pulso_espelho ADD CONSTRAINT pulso_espelho_q1_check CHECK (((q1 >= (1)::numeric) AND (q1 <= (5)::numeric)));
ALTER TABLE ONLY public.pulso_espelho ADD CONSTRAINT pulso_espelho_q2_check CHECK (((q2 >= (1)::numeric) AND (q2 <= (5)::numeric)));
ALTER TABLE ONLY public.pulso_espelho ADD CONSTRAINT pulso_espelho_q3_check CHECK (((q3 >= (1)::numeric) AND (q3 <= (5)::numeric)));
ALTER TABLE ONLY public.pulso_espelho ADD CONSTRAINT pulso_espelho_q4_check CHECK (((q4 >= (1)::numeric) AND (q4 <= (5)::numeric)));
ALTER TABLE ONLY public.pulso_espelho ADD CONSTRAINT pulso_espelho_q5_check CHECK (((q5 >= (1)::numeric) AND (q5 <= (5)::numeric)));
ALTER TABLE ONLY public.pulso_exportacoes ADD CONSTRAINT pulso_exportacoes_formato_check CHECK ((formato = ANY (ARRAY['xlsx'::text, 'a4'::text, 'pptx'::text, 'lista_xlsx'::text])));
ALTER TABLE ONLY public.pulso_participacoes ADD CONSTRAINT pulso_participacoes_check CHECK (((usuario_id IS NOT NULL) OR (dispositivo_hash IS NOT NULL)));
ALTER TABLE ONLY public.pulso_respostas ADD CONSTRAINT pulso_respostas_perfil_grupo_check CHECK ((perfil_grupo = ANY (ARRAY['coordenacao'::text, 'tecnico'::text, 'financeiro'::text, 'consultor_externo'::text, 'visualizador'::text, 'convidado'::text])));
ALTER TABLE ONLY public.pulso_respostas ADD CONSTRAINT pulso_respostas_q1_check CHECK (((q1 >= 1) AND (q1 <= 5)));
ALTER TABLE ONLY public.pulso_respostas ADD CONSTRAINT pulso_respostas_q2_check CHECK (((q2 >= 1) AND (q2 <= 5)));
ALTER TABLE ONLY public.pulso_respostas ADD CONSTRAINT pulso_respostas_q3_check CHECK (((q3 >= 1) AND (q3 <= 5)));
ALTER TABLE ONLY public.pulso_respostas ADD CONSTRAINT pulso_respostas_q4_check CHECK (((q4 >= 1) AND (q4 <= 5)));
ALTER TABLE ONLY public.pulso_respostas ADD CONSTRAINT pulso_respostas_q5_check CHECK (((q5 >= 1) AND (q5 <= 5)));
ALTER TABLE ONLY public.pulso_respostas ADD CONSTRAINT pulso_respostas_q6_check CHECK (((q6 >= 0) AND (q6 <= 10)));
ALTER TABLE ONLY public.pulso_respostas ADD CONSTRAINT pulso_respostas_texto_livre_check CHECK (((texto_livre IS NULL) OR (length(texto_livre) <= 1000)));
ALTER TABLE ONLY public.pulso_respostas_v2 ADD CONSTRAINT pulso_respostas_v2_perfil_grupo_check CHECK ((perfil_grupo = ANY (ARRAY['coordenacao'::text, 'tecnico'::text, 'financeiro'::text, 'consultor_externo'::text, 'visualizador'::text, 'convidado'::text])));
ALTER TABLE ONLY public.rem_cargo_titulares ADD CONSTRAINT rem_cargo_titulares_ato_check CHECK ((btrim(ato) <> ''::text));
ALTER TABLE ONLY public.remanejamento_alocacoes ADD CONSTRAINT remanejamento_alocacoes_valor_usd_check CHECK ((valor_usd > (0)::numeric));
ALTER TABLE ONLY public.remanejamento_assinaturas ADD CONSTRAINT remanejamento_assinaturas_decisao_check CHECK ((decisao = ANY (ARRAY['aprovar'::text, 'devolver'::text, 'recusar'::text, 'cancelar'::text])));
ALTER TABLE ONLY public.remanejamento_etapas ADD CONSTRAINT remanejamento_etapas_check CHECK (((papel = 'liberacao_origem'::text) = ((atividade_id IS NOT NULL) AND (cargo IS NULL))));
ALTER TABLE ONLY public.remanejamento_etapas ADD CONSTRAINT remanejamento_etapas_papel_check CHECK ((papel = ANY (ARRAY['solicitacao'::text, 'liberacao_origem'::text, 'unesco'::text, 'diretoria'::text, 'secretaria'::text])));
ALTER TABLE ONLY public.remanejamento_itens ADD CONSTRAINT remanejamento_itens_valor_usd_check CHECK ((valor_usd <> (0)::numeric));
ALTER TABLE ONLY public.remanejamento_notificacoes ADD CONSTRAINT remanejamento_notificacoes_evento_check CHECK ((evento = ANY (ARRAY['analisar'::text, 'devolvido'::text, 'recusado'::text, 'efetivado'::text, 'cancelado'::text])));
ALTER TABLE ONLY public.remanejamentos ADD CONSTRAINT remanejamentos_justificativa_check CHECK ((btrim(justificativa) <> ''::text));
ALTER TABLE ONLY public.remanejamentos ADD CONSTRAINT remanejamentos_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'em_aprovacao'::text, 'efetivado'::text, 'recusado'::text, 'cancelado'::text, 'estornado'::text])));
ALTER TABLE ONLY public.remanejamentos ADD CONSTRAINT remanejamentos_tipo_check CHECK ((tipo = ANY (ARRAY['livre'::text, 'cobertura_contrato'::text])));
ALTER TABLE ONLY public.riscos ADD CONSTRAINT riscos_impacto_check CHECK (((impacto >= 1) AND (impacto <= 5)));
ALTER TABLE ONLY public.riscos ADD CONSTRAINT riscos_probabilidade_check CHECK (((probabilidade >= 1) AND (probabilidade <= 5)));
ALTER TABLE ONLY public.tarefa_checklist ADD CONSTRAINT tarefa_checklist_um_responsavel CHECK (((responsavel_usuario_id IS NULL) OR (responsavel_fornecedor_id IS NULL)));
ALTER TABLE ONLY public.tarefa_comentarios ADD CONSTRAINT tarefa_comentarios_tem_autor CHECK (((autor_id IS NOT NULL) OR (autor_fornecedor_id IS NOT NULL)));
ALTER TABLE ONLY public.tarefa_participantes ADD CONSTRAINT tarefa_participantes_papel_check CHECK ((papel = ANY (ARRAY['responsavel'::text, 'observador'::text])));
ALTER TABLE ONLY public.tarefa_tipos ADD CONSTRAINT tarefa_tipos_campos_check CHECK ((jsonb_typeof(campos) = 'array'::text));
ALTER TABLE ONLY public.tarefa_tipos ADD CONSTRAINT tarefa_tipos_codigo_check CHECK ((codigo ~ '^[a-z0-9_]{2,40}$'::text));
ALTER TABLE ONLY public.tarefa_tipos ADD CONSTRAINT tarefa_tipos_cor_check CHECK ((cor ~ '^#[0-9A-Fa-f]{6}$'::text));
ALTER TABLE ONLY public.tdr_acoes ADD CONSTRAINT tdr_acoes_acao_check CHECK (((acao)::text = ANY (ARRAY['cadastrado'::text, 'editado'::text, 'enviado_revisao'::text, 'aprovado_revisao'::text, 'devolvido_ajuste'::text, 'enviado_unesco'::text, 'retorno_unesco'::text, 'aprovado_final'::text, 'cancelado'::text, 'substituto_designado'::text, 'confirmacao_senha'::text, 'em_licitacao'::text, 'contratado'::text])));
ALTER TABLE ONLY public.tdr_cancelamento_assinaturas ADD CONSTRAINT tdr_cancelamento_assinaturas_decisao_check CHECK ((decisao = ANY (ARRAY['aprovar'::text, 'devolver'::text, 'recusar'::text, 'cancelar'::text])));
ALTER TABLE ONLY public.tdr_cancelamento_etapas ADD CONSTRAINT tdr_cancelamento_etapas_check CHECK (((papel = 'responsavel_atividade'::text) = ((atividade_id IS NOT NULL) AND (cargo IS NULL))));
ALTER TABLE ONLY public.tdr_cancelamento_etapas ADD CONSTRAINT tdr_cancelamento_etapas_papel_check CHECK ((papel = ANY (ARRAY['solicitacao'::text, 'responsavel_atividade'::text, 'unesco'::text])));
ALTER TABLE ONLY public.tdr_cancelamento_notificacoes ADD CONSTRAINT tdr_cancelamento_notificacoes_evento_check CHECK ((evento = ANY (ARRAY['analisar'::text, 'devolvido'::text, 'recusado'::text, 'efetivado'::text, 'cancelado'::text])));
ALTER TABLE ONLY public.tdr_cancelamentos ADD CONSTRAINT tdr_cancelamentos_destino_valor_check CHECK ((destino_valor = ANY (ARRAY['novo_tdr'::text, 'remanejamento'::text, 'a_definir'::text])));
ALTER TABLE ONLY public.tdr_cancelamentos ADD CONSTRAINT tdr_cancelamentos_motivo_tipo_check CHECK ((motivo_tipo = ANY (ARRAY['licitacao_deserta'::text, 'licitacao_fracassada'::text, 'sem_necessidade'::text, 'substituido'::text, 'outro'::text])));
ALTER TABLE ONLY public.tdr_cancelamentos ADD CONSTRAINT tdr_cancelamentos_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'em_aprovacao'::text, 'efetivado'::text, 'recusado'::text, 'cancelado'::text])));
ALTER TABLE ONLY public.tdr_licitacao_empresas ADD CONSTRAINT tdr_licitacao_empresas_empresa_check CHECK ((length(btrim(empresa)) >= 2));
ALTER TABLE ONLY public.tdr_licitacao_prorrogacoes ADD CONSTRAINT tdr_licitacao_prorrogacoes_aviso_url_check CHECK (((aviso_url IS NULL) OR (aviso_url ~* '^https?://'::text)));
ALTER TABLE ONLY public.tdr_licitacao_prorrogacoes ADD CONSTRAINT tdr_licitacao_prorrogacoes_motivo_check CHECK ((length(btrim(motivo)) >= 10));
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_edital_url_check CHECK (((edital_url IS NULL) OR (edital_url ~* '^https?://'::text)));
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_fundamento_tipo_check CHECK (((fundamento_tipo IS NULL) OR (fundamento_tipo = ANY (ARRAY['exclusivo'::text, 'notoria'::text, 'outro'::text]))));
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_medida_check CHECK (((medida IS NULL) OR (medida = ANY (ARRAY['relancada'::text, 'cancelamento'::text, 'contratado'::text]))));
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_n_propostas_check CHECK (((n_propostas IS NULL) OR (n_propostas >= 0)));
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_situacao_check CHECK ((situacao = ANY (ARRAY['aberta'::text, 'com_propostas'::text, 'deserta'::text, 'fracassada'::text, 'sem_proposta'::text, 'cancelada'::text])));
ALTER TABLE ONLY public.tdr_licitacoes ADD CONSTRAINT tdr_licitacoes_desfecho_check CHECK ((desfecho = ANY (ARRAY['relancada'::text, 'cancelamento'::text])));
ALTER TABLE ONLY public.tdr_licitacoes ADD CONSTRAINT tdr_licitacoes_motivo_check CHECK ((length(btrim(motivo)) >= 10));
ALTER TABLE ONLY public.tdr_licitacoes ADD CONSTRAINT tdr_licitacoes_resultado_check CHECK ((resultado = ANY (ARRAY['deserta'::text, 'fracassada'::text, 'outro'::text])));
ALTER TABLE ONLY public.tdr_responsaveis ADD CONSTRAINT tdr_responsaveis_papel_check CHECK (((papel)::text = ANY ((ARRAY['elaborador'::character varying, 'revisor'::character varying, 'aprovador'::character varying, 'substituto'::character varying])::text[])));
ALTER TABLE ONLY public.viagem_decisoes ADD CONSTRAINT viagem_decisoes_decisao_check CHECK ((decisao = ANY (ARRAY['aprovar'::text, 'devolver'::text, 'rejeitar'::text])));
ALTER TABLE ONLY public.viagens_diarias ADD CONSTRAINT viagens_diarias_situacao_check CHECK (((situacao)::text = ANY ((ARRAY['solicitado'::character varying, 'aprovado'::character varying, 'realizado'::character varying, 'cancelado'::character varying])::text[])));
ALTER TABLE ONLY public.acervo_capas ADD CONSTRAINT acervo_capas_gerada_por_fkey FOREIGN KEY (gerada_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.acervo_capas ADD CONSTRAINT acervo_capas_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES contratos_produtos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.acervo_publicacoes ADD CONSTRAINT acervo_publicacoes_desmarcado_por_fkey FOREIGN KEY (desmarcado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.acervo_publicacoes ADD CONSTRAINT acervo_publicacoes_marcado_por_fkey FOREIGN KEY (marcado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.acervo_publicacoes ADD CONSTRAINT acervo_publicacoes_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES contratos_produtos(id);
ALTER TABLE ONLY public.apa_demarcacoes ADD CONSTRAINT apa_demarcacoes_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.api_acessos ADD CONSTRAINT api_acessos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES api_clientes(id);
ALTER TABLE ONLY public.api_clientes ADD CONSTRAINT api_clientes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.api_clientes ADD CONSTRAINT api_clientes_revogado_por_fkey FOREIGN KEY (revogado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.api_pedido_notificacoes ADD CONSTRAINT api_pedido_notificacoes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES api_clientes(id);
ALTER TABLE ONLY public.api_pedido_notificacoes ADD CONSTRAINT api_pedido_notificacoes_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES api_pedidos(id);
ALTER TABLE ONLY public.api_pedidos ADD CONSTRAINT api_pedidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES api_clientes(id);
ALTER TABLE ONLY public.api_pedidos ADD CONSTRAINT api_pedidos_decidido_por_fkey FOREIGN KEY (decidido_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.atividade_indicador ADD CONSTRAINT atividade_indicador_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.atividade_indicador ADD CONSTRAINT atividade_indicador_indicador_id_fkey FOREIGN KEY (indicador_id) REFERENCES indicadores(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.atividade_matriz ADD CONSTRAINT atividade_matriz_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.atividade_matriz ADD CONSTRAINT atividade_matriz_matriz_item_id_fkey FOREIGN KEY (matriz_item_id) REFERENCES matriz_itens(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.atividade_responsaveis ADD CONSTRAINT atividade_responsaveis_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.atividade_responsaveis ADD CONSTRAINT atividade_responsaveis_designado_por_fkey FOREIGN KEY (designado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.atividade_responsaveis ADD CONSTRAINT atividade_responsaveis_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.atividades ADD CONSTRAINT atividades_output_id_fkey FOREIGN KEY (output_id) REFERENCES outputs(id);
ALTER TABLE ONLY public.atividades ADD CONSTRAINT atividades_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.atividades ADD CONSTRAINT atividades_resultado_id_fkey FOREIGN KEY (resultado_id) REFERENCES resultados(id);
ALTER TABLE ONLY public.atividades ADD CONSTRAINT atividades_substituto_id_fkey FOREIGN KEY (substituto_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.auditoria_execucoes ADD CONSTRAINT auditoria_execucoes_disparado_por_fkey FOREIGN KEY (disparado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.auditoria_registros ADD CONSTRAINT auditoria_registros_resolvido_por_fkey FOREIGN KEY (resolvido_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.beneficiario_dados_bancarios ADD CONSTRAINT beneficiario_dados_bancarios_beneficiario_id_fkey FOREIGN KEY (beneficiario_id) REFERENCES beneficiarios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.beneficiarios ADD CONSTRAINT beneficiarios_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE ONLY public.cobertura_notificacoes ADD CONSTRAINT cobertura_notificacoes_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.cobertura_notificacoes ADD CONSTRAINT cobertura_notificacoes_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES contratos(id);
ALTER TABLE ONLY public.cobertura_notificacoes ADD CONSTRAINT cobertura_notificacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.configuracoes_sistema ADD CONSTRAINT configuracoes_sistema_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contrato_coberturas ADD CONSTRAINT contrato_coberturas_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.contrato_coberturas ADD CONSTRAINT contrato_coberturas_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES contratos(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ONLY public.contrato_coberturas ADD CONSTRAINT contrato_coberturas_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id);
ALTER TABLE ONLY public.contrato_encerramento_documentos ADD CONSTRAINT contrato_encerramento_documentos_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES contratos(id);
ALTER TABLE ONLY public.contrato_encerramento_documentos ADD CONSTRAINT contrato_encerramento_documentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.contrato_encerramento_documentos ADD CONSTRAINT contrato_encerramento_documentos_encerramento_id_fkey FOREIGN KEY (encerramento_id) REFERENCES contrato_encerramentos(id);
ALTER TABLE ONLY public.contrato_encerramento_pedidos ADD CONSTRAINT contrato_encerramento_pedidos_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.contrato_encerramento_pedidos ADD CONSTRAINT contrato_encerramento_pedidos_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES contratos(id);
ALTER TABLE ONLY public.contrato_encerramento_pedidos ADD CONSTRAINT contrato_encerramento_pedidos_decidido_por_fkey FOREIGN KEY (decidido_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.contrato_encerramento_pedidos ADD CONSTRAINT contrato_encerramento_pedidos_encerramento_id_fkey FOREIGN KEY (encerramento_id) REFERENCES contrato_encerramentos(id);
ALTER TABLE ONLY public.contrato_encerramento_pedidos ADD CONSTRAINT contrato_encerramento_pedidos_solicitado_por_fkey FOREIGN KEY (solicitado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.contrato_encerramento_pedidos ADD CONSTRAINT contrato_encerramento_pedidos_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES tarefas(id);
ALTER TABLE ONLY public.contrato_encerramentos ADD CONSTRAINT contrato_encerramentos_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.contrato_encerramentos ADD CONSTRAINT contrato_encerramentos_autorizado_por_fkey FOREIGN KEY (autorizado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.contrato_encerramentos ADD CONSTRAINT contrato_encerramentos_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES contratos(id);
ALTER TABLE ONLY public.contrato_encerramentos ADD CONSTRAINT contrato_encerramentos_revertido_por_fkey FOREIGN KEY (revertido_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.contrato_encerramentos ADD CONSTRAINT contrato_encerramentos_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contratos ADD CONSTRAINT contratos_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.contratos ADD CONSTRAINT contratos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.contratos ADD CONSTRAINT contratos_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id);
ALTER TABLE ONLY public.contratos ADD CONSTRAINT contratos_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id);
ALTER TABLE ONLY public.contratos_produtos ADD CONSTRAINT contratos_produtos_avaliado_por_fkey FOREIGN KEY (avaliado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.contratos_produtos ADD CONSTRAINT contratos_produtos_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.contratos_produtos ADD CONSTRAINT contratos_produtos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.contratos_produtos ADD CONSTRAINT contratos_produtos_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES execucao_financeira(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contratos_produtos_entregas ADD CONSTRAINT contratos_produtos_entregas_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.contratos_produtos_entregas ADD CONSTRAINT contratos_produtos_entregas_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.contratos_produtos_entregas ADD CONSTRAINT contratos_produtos_entregas_despachado_por_fkey FOREIGN KEY (despachado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.contratos_produtos_entregas ADD CONSTRAINT contratos_produtos_entregas_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES execucao_financeira(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contratos_produtos_entregas ADD CONSTRAINT contratos_produtos_entregas_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES contratos_produtos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diag_audios ADD CONSTRAINT diag_audios_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.diag_audios ADD CONSTRAINT diag_audios_ficha_id_fkey FOREIGN KEY (ficha_id) REFERENCES diag_fichas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diag_audios ADD CONSTRAINT diag_audios_transcrito_por_fkey FOREIGN KEY (transcrito_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.diag_comunidades ADD CONSTRAINT diag_comunidades_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.diag_comunidades ADD CONSTRAINT diag_comunidades_municipio_ibge_fkey FOREIGN KEY (municipio_ibge) REFERENCES diag_municipios(ibge);
ALTER TABLE ONLY public.diag_exportacoes ADD CONSTRAINT diag_exportacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_comunidade_id_fkey FOREIGN KEY (comunidade_id) REFERENCES diag_comunidades(id);
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_entrevistador_id_fkey FOREIGN KEY (entrevistador_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_localidade_id_fkey FOREIGN KEY (localidade_id) REFERENCES diag_localidades(id);
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_municipio_ibge_fkey FOREIGN KEY (municipio_ibge) REFERENCES diag_municipios(ibge);
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_questionario_id_fkey FOREIGN KEY (questionario_id) REFERENCES diag_questionarios(id);
ALTER TABLE ONLY public.diag_fichas ADD CONSTRAINT diag_fichas_validado_por_fkey FOREIGN KEY (validado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.diag_fichas_historico ADD CONSTRAINT diag_fichas_historico_ficha_id_fkey FOREIGN KEY (ficha_id) REFERENCES diag_fichas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diag_fichas_historico ADD CONSTRAINT diag_fichas_historico_por_fkey FOREIGN KEY (por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.diag_fichas_identificacao ADD CONSTRAINT diag_fichas_identificacao_ficha_id_fkey FOREIGN KEY (ficha_id) REFERENCES diag_fichas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diag_fotos ADD CONSTRAINT diag_fotos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.diag_fotos ADD CONSTRAINT diag_fotos_ficha_id_fkey FOREIGN KEY (ficha_id) REFERENCES diag_fichas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diag_localidades ADD CONSTRAINT diag_localidades_comunidade_id_fkey FOREIGN KEY (comunidade_id) REFERENCES diag_comunidades(id);
ALTER TABLE ONLY public.diag_localidades ADD CONSTRAINT diag_localidades_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.diag_moradores ADD CONSTRAINT diag_moradores_ficha_id_fkey FOREIGN KEY (ficha_id) REFERENCES diag_fichas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diag_moradores_identificacao ADD CONSTRAINT diag_moradores_identificacao_morador_id_fkey FOREIGN KEY (morador_id) REFERENCES diag_moradores(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.diag_questionarios ADD CONSTRAINT diag_questionarios_publicado_por_fkey FOREIGN KEY (publicado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.diag_sugestoes_ocultas ADD CONSTRAINT diag_sugestoes_ocultas_ocultado_por_fkey FOREIGN KEY (ocultado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.entrega_aprovacao_senhas ADD CONSTRAINT entrega_aprovacao_senhas_entrega_id_fkey FOREIGN KEY (entrega_id) REFERENCES contratos_produtos_entregas(id);
ALTER TABLE ONLY public.entrega_aprovacao_senhas ADD CONSTRAINT entrega_aprovacao_senhas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.entrega_documentos ADD CONSTRAINT entrega_documentos_entrega_id_fkey FOREIGN KEY (entrega_id) REFERENCES contratos_produtos_entregas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.entrega_documentos ADD CONSTRAINT entrega_documentos_inserido_por_fkey FOREIGN KEY (inserido_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.execucao_financeira ADD CONSTRAINT execucao_financeira_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.execucao_financeira ADD CONSTRAINT execucao_financeira_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES contratos(id);
ALTER TABLE ONLY public.execucao_financeira ADD CONSTRAINT execucao_financeira_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.execucao_financeira ADD CONSTRAINT execucao_financeira_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id);
ALTER TABLE ONLY public.execucao_financeira ADD CONSTRAINT execucao_financeira_pago_por_fkey FOREIGN KEY (pago_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.execucao_financeira ADD CONSTRAINT execucao_financeira_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.execucao_financeira ADD CONSTRAINT execucao_financeira_resultado_id_fkey FOREIGN KEY (resultado_id) REFERENCES resultados(id);
ALTER TABLE ONLY public.execucao_financeira ADD CONSTRAINT execucao_financeira_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id);
ALTER TABLE ONLY public.fornecedor_dados_bancarios ADD CONSTRAINT fornecedor_dados_bancarios_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.fornecedor_dados_bancarios ADD CONSTRAINT fornecedor_dados_bancarios_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id);
ALTER TABLE ONLY public.fornecedor_usuarios ADD CONSTRAINT fornecedor_usuarios_desvinculado_por_fkey FOREIGN KEY (desvinculado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.fornecedor_usuarios ADD CONSTRAINT fornecedor_usuarios_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id);
ALTER TABLE ONLY public.fornecedor_usuarios ADD CONSTRAINT fornecedor_usuarios_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.fornecedor_usuarios ADD CONSTRAINT fornecedor_usuarios_vinculado_por_fkey FOREIGN KEY (vinculado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.fornecedores ADD CONSTRAINT fornecedores_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.historico_indicadores ADD CONSTRAINT historico_indicadores_indicador_id_fkey FOREIGN KEY (indicador_id) REFERENCES indicadores(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.historico_indicadores ADD CONSTRAINT historico_indicadores_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.indicador_historico ADD CONSTRAINT indicador_historico_indicador_id_fkey FOREIGN KEY (indicador_id) REFERENCES indicadores(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.indicador_historico ADD CONSTRAINT indicador_historico_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.indicadores ADD CONSTRAINT indicadores_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.indicadores ADD CONSTRAINT indicadores_output_id_fkey FOREIGN KEY (output_id) REFERENCES outputs(id);
ALTER TABLE ONLY public.indicadores ADD CONSTRAINT indicadores_resultado_id_fkey FOREIGN KEY (resultado_id) REFERENCES resultados(id);
ALTER TABLE ONLY public.nota_tecnica_conferencias ADD CONSTRAINT nota_tecnica_conferencias_conferido_por_fkey FOREIGN KEY (conferido_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.nota_tecnica_conferencias ADD CONSTRAINT nota_tecnica_conferencias_entrega_id_fkey FOREIGN KEY (entrega_id) REFERENCES contratos_produtos_entregas(id);
ALTER TABLE ONLY public.notificacoes ADD CONSTRAINT notificacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.orcamento_eventos ADD CONSTRAINT orcamento_eventos_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_ajusta_fonte_id_fkey FOREIGN KEY (ajusta_fonte_id) REFERENCES orcamento_fontes(id);
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_encerramento_id_fkey FOREIGN KEY (encerramento_id) REFERENCES contrato_encerramentos(id);
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_estorno_de_fkey FOREIGN KEY (estorno_de) REFERENCES orcamento_fontes(id);
ALTER TABLE ONLY public.orcamento_fontes ADD CONSTRAINT orcamento_fontes_fonte_origem_id_fkey FOREIGN KEY (fonte_origem_id) REFERENCES orcamento_fontes(id);
ALTER TABLE ONLY public.outputs ADD CONSTRAINT outputs_resultado_id_fkey FOREIGN KEY (resultado_id) REFERENCES resultados(id);
ALTER TABLE ONLY public.passagens_diarias ADD CONSTRAINT passagens_diarias_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.passagens_diarias ADD CONSTRAINT passagens_diarias_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.prestacao_tokens ADD CONSTRAINT prestacao_tokens_protocolo_id_fkey FOREIGN KEY (protocolo_id) REFERENCES viagem_protocolos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.prestacao_tokens ADD CONSTRAINT prestacao_tokens_viajante_id_fkey FOREIGN KEY (viajante_id) REFERENCES viagem_viajantes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.produto_entregue_indicador ADD CONSTRAINT produto_entregue_indicador_indicador_id_fkey FOREIGN KEY (indicador_id) REFERENCES indicadores(id);
ALTER TABLE ONLY public.produto_entregue_indicador ADD CONSTRAINT produto_entregue_indicador_produto_entregue_id_fkey FOREIGN KEY (produto_entregue_id) REFERENCES produtos_entregues(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.produto_evidencias ADD CONSTRAINT produto_evidencias_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.produto_evidencias ADD CONSTRAINT produto_evidencias_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos_entregues(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.produto_indicador ADD CONSTRAINT produto_indicador_indicador_id_fkey FOREIGN KEY (indicador_id) REFERENCES indicadores(id);
ALTER TABLE ONLY public.produto_indicador ADD CONSTRAINT produto_indicador_produto_previsto_id_fkey FOREIGN KEY (produto_previsto_id) REFERENCES tdr_produtos_previstos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.produto_matriz_contribuicao ADD CONSTRAINT produto_matriz_contribuicao_confirmado_por_fkey FOREIGN KEY (confirmado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.produto_matriz_contribuicao ADD CONSTRAINT produto_matriz_contribuicao_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.produto_matriz_contribuicao ADD CONSTRAINT produto_matriz_contribuicao_matriz_item_id_fkey FOREIGN KEY (matriz_item_id) REFERENCES matriz_itens(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.produto_matriz_contribuicao ADD CONSTRAINT produto_matriz_contribuicao_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES contratos_produtos_entregas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.produto_notif_log ADD CONSTRAINT produto_notif_log_entrega_id_fkey FOREIGN KEY (entrega_id) REFERENCES contratos_produtos_entregas(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.produto_notif_log ADD CONSTRAINT produto_notif_log_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.produto_notif_log ADD CONSTRAINT produto_notif_log_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES contratos_produtos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.produto_pontos_mapa ADD CONSTRAINT produto_pontos_mapa_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.produto_pontos_mapa ADD CONSTRAINT produto_pontos_mapa_entrega_id_fkey FOREIGN KEY (entrega_id) REFERENCES contratos_produtos_entregas(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.produto_pontos_mapa ADD CONSTRAINT produto_pontos_mapa_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES contratos_produtos_entregas(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.produtos_entregues ADD CONSTRAINT produtos_entregues_aprovado_coord_por_fkey FOREIGN KEY (aprovado_coord_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.produtos_entregues ADD CONSTRAINT produtos_entregues_aprovado_dir_por_fkey FOREIGN KEY (aprovado_dir_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.produtos_entregues ADD CONSTRAINT produtos_entregues_aprovado_tecnico_por_fkey FOREIGN KEY (aprovado_tecnico_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.produtos_entregues ADD CONSTRAINT produtos_entregues_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES contratos(id);
ALTER TABLE ONLY public.produtos_entregues ADD CONSTRAINT produtos_entregues_ef_id_fkey FOREIGN KEY (ef_id) REFERENCES execucao_financeira(id);
ALTER TABLE ONLY public.produtos_entregues ADD CONSTRAINT produtos_entregues_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id);
ALTER TABLE ONLY public.produtos_entregues ADD CONSTRAINT produtos_entregues_produto_previsto_id_fkey FOREIGN KEY (produto_previsto_id) REFERENCES tdr_produtos_previstos(id);
ALTER TABLE ONLY public.produtos_entregues ADD CONSTRAINT produtos_entregues_recusado_por_fkey FOREIGN KEY (recusado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.produtos_entregues ADD CONSTRAINT produtos_entregues_submetido_por_fkey FOREIGN KEY (submetido_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.produtos_entregues ADD CONSTRAINT produtos_entregues_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id);
ALTER TABLE ONLY public.pulso_ciclos ADD CONSTRAINT pulso_ciclos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.pulso_espelho ADD CONSTRAINT pulso_espelho_ciclo_id_fkey FOREIGN KEY (ciclo_id) REFERENCES pulso_ciclos(id);
ALTER TABLE ONLY public.pulso_espelho ADD CONSTRAINT pulso_espelho_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.pulso_espelho_v2 ADD CONSTRAINT pulso_espelho_v2_ciclo_id_fkey FOREIGN KEY (ciclo_id) REFERENCES pulso_ciclos(id);
ALTER TABLE ONLY public.pulso_espelho_v2 ADD CONSTRAINT pulso_espelho_v2_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.pulso_exportacoes ADD CONSTRAINT pulso_exportacoes_ciclo_id_fkey FOREIGN KEY (ciclo_id) REFERENCES pulso_ciclos(id);
ALTER TABLE ONLY public.pulso_exportacoes ADD CONSTRAINT pulso_exportacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.pulso_participacoes ADD CONSTRAINT pulso_participacoes_ciclo_id_fkey FOREIGN KEY (ciclo_id) REFERENCES pulso_ciclos(id);
ALTER TABLE ONLY public.pulso_participacoes ADD CONSTRAINT pulso_participacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.pulso_respostas ADD CONSTRAINT pulso_respostas_ciclo_id_fkey FOREIGN KEY (ciclo_id) REFERENCES pulso_ciclos(id);
ALTER TABLE ONLY public.pulso_respostas_v2 ADD CONSTRAINT pulso_respostas_v2_ciclo_id_fkey FOREIGN KEY (ciclo_id) REFERENCES pulso_ciclos(id);
ALTER TABLE ONLY public.rem_cargo_titulares ADD CONSTRAINT rem_cargo_titulares_cargo_fkey FOREIGN KEY (cargo) REFERENCES rem_cargos(codigo);
ALTER TABLE ONLY public.rem_cargo_titulares ADD CONSTRAINT rem_cargo_titulares_designado_por_fkey FOREIGN KEY (designado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.rem_cargo_titulares ADD CONSTRAINT rem_cargo_titulares_encerrado_por_fkey FOREIGN KEY (encerrado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.rem_cargo_titulares ADD CONSTRAINT rem_cargo_titulares_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.remanejamento_alocacoes ADD CONSTRAINT remanejamento_alocacoes_fonte_id_fkey FOREIGN KEY (fonte_id) REFERENCES orcamento_fontes(id);
ALTER TABLE ONLY public.remanejamento_alocacoes ADD CONSTRAINT remanejamento_alocacoes_item_id_fkey FOREIGN KEY (item_id) REFERENCES remanejamento_itens(id);
ALTER TABLE ONLY public.remanejamento_alocacoes ADD CONSTRAINT remanejamento_alocacoes_remanejamento_id_fkey FOREIGN KEY (remanejamento_id) REFERENCES remanejamentos(id);
ALTER TABLE ONLY public.remanejamento_assinaturas ADD CONSTRAINT remanejamento_assinaturas_etapa_id_fkey FOREIGN KEY (etapa_id) REFERENCES remanejamento_etapas(id);
ALTER TABLE ONLY public.remanejamento_assinaturas ADD CONSTRAINT remanejamento_assinaturas_remanejamento_id_fkey FOREIGN KEY (remanejamento_id) REFERENCES remanejamentos(id);
ALTER TABLE ONLY public.remanejamento_assinaturas ADD CONSTRAINT remanejamento_assinaturas_titular_id_fkey FOREIGN KEY (titular_id) REFERENCES rem_cargo_titulares(id);
ALTER TABLE ONLY public.remanejamento_assinaturas ADD CONSTRAINT remanejamento_assinaturas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.remanejamento_etapas ADD CONSTRAINT remanejamento_etapas_assinatura_fk FOREIGN KEY (assinatura_id) REFERENCES remanejamento_assinaturas(id);
ALTER TABLE ONLY public.remanejamento_etapas ADD CONSTRAINT remanejamento_etapas_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.remanejamento_etapas ADD CONSTRAINT remanejamento_etapas_cargo_fkey FOREIGN KEY (cargo) REFERENCES rem_cargos(codigo);
ALTER TABLE ONLY public.remanejamento_etapas ADD CONSTRAINT remanejamento_etapas_remanejamento_id_fkey FOREIGN KEY (remanejamento_id) REFERENCES remanejamentos(id);
ALTER TABLE ONLY public.remanejamento_historico ADD CONSTRAINT remanejamento_historico_remanejamento_id_fkey FOREIGN KEY (remanejamento_id) REFERENCES remanejamentos(id);
ALTER TABLE ONLY public.remanejamento_historico ADD CONSTRAINT remanejamento_historico_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.remanejamento_itens ADD CONSTRAINT remanejamento_itens_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.remanejamento_itens ADD CONSTRAINT remanejamento_itens_remanejamento_id_fkey FOREIGN KEY (remanejamento_id) REFERENCES remanejamentos(id);
ALTER TABLE ONLY public.remanejamento_notificacoes ADD CONSTRAINT remanejamento_notificacoes_remanejamento_id_fkey FOREIGN KEY (remanejamento_id) REFERENCES remanejamentos(id);
ALTER TABLE ONLY public.remanejamento_notificacoes ADD CONSTRAINT remanejamento_notificacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.remanejamentos ADD CONSTRAINT remanejamentos_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES contratos(id);
ALTER TABLE ONLY public.remanejamentos ADD CONSTRAINT remanejamentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.remanejamentos ADD CONSTRAINT remanejamentos_estorno_de_fkey FOREIGN KEY (estorno_de) REFERENCES remanejamentos(id);
ALTER TABLE ONLY public.repositorio_links ADD CONSTRAINT repositorio_links_desativado_por_fkey FOREIGN KEY (desativado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.repositorio_links ADD CONSTRAINT repositorio_links_inserido_por_fkey FOREIGN KEY (inserido_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.senha_tokens ADD CONSTRAINT senha_tokens_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.solicitacoes_senha ADD CONSTRAINT solicitacoes_senha_atendido_por_fkey FOREIGN KEY (atendido_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.solicitacoes_senha ADD CONSTRAINT solicitacoes_senha_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tarefa_anexos ADD CONSTRAINT tarefa_anexos_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES tarefa_checklist(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tarefa_anexos ADD CONSTRAINT tarefa_anexos_comentario_id_fkey FOREIGN KEY (comentario_id) REFERENCES tarefa_comentarios(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tarefa_anexos ADD CONSTRAINT tarefa_anexos_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tarefa_anexos ADD CONSTRAINT tarefa_anexos_enviado_por_fornecedor_id_fkey FOREIGN KEY (enviado_por_fornecedor_id) REFERENCES fornecedores(id);
ALTER TABLE ONLY public.tarefa_anexos ADD CONSTRAINT tarefa_anexos_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES tarefas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tarefa_checklist ADD CONSTRAINT tarefa_checklist_concluida_por_fkey FOREIGN KEY (concluida_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tarefa_checklist ADD CONSTRAINT tarefa_checklist_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tarefa_checklist ADD CONSTRAINT tarefa_checklist_responsavel_fornecedor_id_fkey FOREIGN KEY (responsavel_fornecedor_id) REFERENCES fornecedores(id);
ALTER TABLE ONLY public.tarefa_checklist ADD CONSTRAINT tarefa_checklist_responsavel_usuario_id_fkey FOREIGN KEY (responsavel_usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tarefa_checklist ADD CONSTRAINT tarefa_checklist_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES tarefas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tarefa_comentarios ADD CONSTRAINT tarefa_comentarios_autor_fornecedor_id_fkey FOREIGN KEY (autor_fornecedor_id) REFERENCES fornecedores(id);
ALTER TABLE ONLY public.tarefa_comentarios ADD CONSTRAINT tarefa_comentarios_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tarefa_comentarios ADD CONSTRAINT tarefa_comentarios_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES tarefa_checklist(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tarefa_comentarios ADD CONSTRAINT tarefa_comentarios_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES tarefas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tarefa_historico ADD CONSTRAINT tarefa_historico_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tarefa_historico ADD CONSTRAINT tarefa_historico_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES tarefas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tarefa_participantes ADD CONSTRAINT tarefa_participantes_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES tarefas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tarefa_participantes ADD CONSTRAINT tarefa_participantes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tarefa_tdrs ADD CONSTRAINT tarefa_tdrs_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tarefa_tdrs ADD CONSTRAINT tarefa_tdrs_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES tarefas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tarefa_tdrs ADD CONSTRAINT tarefa_tdrs_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tarefas ADD CONSTRAINT tarefas_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.tarefas ADD CONSTRAINT tarefas_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tarefas ADD CONSTRAINT tarefas_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id);
ALTER TABLE ONLY public.tarefas ADD CONSTRAINT tarefas_tipo_fkey FOREIGN KEY (tipo) REFERENCES tarefa_tipos(codigo);
ALTER TABLE ONLY public.tdr_acoes ADD CONSTRAINT tdr_acoes_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tdr_acoes ADD CONSTRAINT tdr_acoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_anexos ADD CONSTRAINT tdr_anexos_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_anexos ADD CONSTRAINT tdr_anexos_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tdr_cancelamento_assinaturas ADD CONSTRAINT tdr_cancelamento_assinaturas_cancelamento_id_fkey FOREIGN KEY (cancelamento_id) REFERENCES tdr_cancelamentos(id);
ALTER TABLE ONLY public.tdr_cancelamento_assinaturas ADD CONSTRAINT tdr_cancelamento_assinaturas_etapa_id_fkey FOREIGN KEY (etapa_id) REFERENCES tdr_cancelamento_etapas(id);
ALTER TABLE ONLY public.tdr_cancelamento_assinaturas ADD CONSTRAINT tdr_cancelamento_assinaturas_titular_id_fkey FOREIGN KEY (titular_id) REFERENCES rem_cargo_titulares(id);
ALTER TABLE ONLY public.tdr_cancelamento_assinaturas ADD CONSTRAINT tdr_cancelamento_assinaturas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_cancelamento_etapas ADD CONSTRAINT tdr_cancelamento_etapas_assinatura_fk FOREIGN KEY (assinatura_id) REFERENCES tdr_cancelamento_assinaturas(id);
ALTER TABLE ONLY public.tdr_cancelamento_etapas ADD CONSTRAINT tdr_cancelamento_etapas_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.tdr_cancelamento_etapas ADD CONSTRAINT tdr_cancelamento_etapas_cancelamento_id_fkey FOREIGN KEY (cancelamento_id) REFERENCES tdr_cancelamentos(id);
ALTER TABLE ONLY public.tdr_cancelamento_etapas ADD CONSTRAINT tdr_cancelamento_etapas_cargo_fkey FOREIGN KEY (cargo) REFERENCES rem_cargos(codigo);
ALTER TABLE ONLY public.tdr_cancelamento_historico ADD CONSTRAINT tdr_cancelamento_historico_cancelamento_id_fkey FOREIGN KEY (cancelamento_id) REFERENCES tdr_cancelamentos(id);
ALTER TABLE ONLY public.tdr_cancelamento_historico ADD CONSTRAINT tdr_cancelamento_historico_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_cancelamento_notificacoes ADD CONSTRAINT tdr_cancelamento_notificacoes_cancelamento_id_fkey FOREIGN KEY (cancelamento_id) REFERENCES tdr_cancelamentos(id);
ALTER TABLE ONLY public.tdr_cancelamento_notificacoes ADD CONSTRAINT tdr_cancelamento_notificacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_cancelamentos ADD CONSTRAINT tdr_cancelamentos_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.tdr_cancelamentos ADD CONSTRAINT tdr_cancelamentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_cancelamentos ADD CONSTRAINT tdr_cancelamentos_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id);
ALTER TABLE ONLY public.tdr_comentarios ADD CONSTRAINT tdr_comentarios_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tdr_comentarios ADD CONSTRAINT tdr_comentarios_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_confirmacoes ADD CONSTRAINT tdr_confirmacoes_acao_id_fkey FOREIGN KEY (acao_id) REFERENCES tdr_acoes(id);
ALTER TABLE ONLY public.tdr_confirmacoes ADD CONSTRAINT tdr_confirmacoes_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tdr_confirmacoes ADD CONSTRAINT tdr_confirmacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_licitacao_empresas ADD CONSTRAINT tdr_licitacao_empresas_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_licitacao_empresas ADD CONSTRAINT tdr_licitacao_empresas_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id);
ALTER TABLE ONLY public.tdr_licitacao_empresas ADD CONSTRAINT tdr_licitacao_empresas_rodada_id_fkey FOREIGN KEY (rodada_id) REFERENCES tdr_licitacao_rodadas(id);
ALTER TABLE ONLY public.tdr_licitacao_prorrogacoes ADD CONSTRAINT tdr_licitacao_prorrogacoes_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_licitacao_prorrogacoes ADD CONSTRAINT tdr_licitacao_prorrogacoes_rodada_id_fkey FOREIGN KEY (rodada_id) REFERENCES tdr_licitacao_rodadas(id);
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_aberta_por_fkey FOREIGN KEY (aberta_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_medida_por_fkey FOREIGN KEY (medida_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_resultado_por_fkey FOREIGN KEY (resultado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_tarefa_medida_id_fkey FOREIGN KEY (tarefa_medida_id) REFERENCES tarefas(id);
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_tarefa_resultado_id_fkey FOREIGN KEY (tarefa_resultado_id) REFERENCES tarefas(id);
ALTER TABLE ONLY public.tdr_licitacao_rodadas ADD CONSTRAINT tdr_licitacao_rodadas_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id);
ALTER TABLE ONLY public.tdr_licitacoes ADD CONSTRAINT tdr_licitacoes_cancelamento_fk FOREIGN KEY (cancelamento_id) REFERENCES tdr_cancelamentos(id);
ALTER TABLE ONLY public.tdr_licitacoes ADD CONSTRAINT tdr_licitacoes_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_licitacoes ADD CONSTRAINT tdr_licitacoes_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id);
ALTER TABLE ONLY public.tdr_produtos_previstos ADD CONSTRAINT tdr_produtos_previstos_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tdr_responsaveis ADD CONSTRAINT tdr_responsaveis_designado_por_fkey FOREIGN KEY (designado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_responsaveis ADD CONSTRAINT tdr_responsaveis_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tdr_responsaveis ADD CONSTRAINT tdr_responsaveis_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tdr_versoes ADD CONSTRAINT tdr_versoes_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tdr_versoes ADD CONSTRAINT tdr_versoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdr_versoes_editor ADD CONSTRAINT tdr_versoes_editor_tdr_id_fkey FOREIGN KEY (tdr_id) REFERENCES tdrs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tdr_versoes_editor ADD CONSTRAINT tdr_versoes_editor_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdrs ADD CONSTRAINT tdrs_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.tdrs ADD CONSTRAINT tdrs_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdrs ADD CONSTRAINT tdrs_elaborador_id_fkey FOREIGN KEY (elaborador_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.tdrs ADD CONSTRAINT tdrs_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id);
ALTER TABLE ONLY public.tdrs ADD CONSTRAINT tdrs_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.usuario_permissoes ADD CONSTRAINT usuario_permissoes_concedido_por_fkey FOREIGN KEY (concedido_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.usuario_permissoes ADD CONSTRAINT usuario_permissoes_revogado_por_fkey FOREIGN KEY (revogado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.usuario_permissoes ADD CONSTRAINT usuario_permissoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.usuario_senha_temporaria ADD CONSTRAINT usuario_senha_temporaria_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.usuarios ADD CONSTRAINT usuarios_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.viagem_decisoes ADD CONSTRAINT viagem_decisoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE ONLY public.viagem_diarias ADD CONSTRAINT viagem_diarias_viagem_id_fkey FOREIGN KEY (viagem_id) REFERENCES viagens_diarias(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.viagem_diarias_v2 ADD CONSTRAINT viagem_diarias_v2_protocolo_id_fkey FOREIGN KEY (protocolo_id) REFERENCES viagem_protocolos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.viagem_diarias_v2 ADD CONSTRAINT viagem_diarias_v2_viajante_id_fkey FOREIGN KEY (viajante_id) REFERENCES viagem_viajantes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.viagem_notif_log ADD CONSTRAINT viagem_notif_log_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES auth.users(id);
ALTER TABLE ONLY public.viagem_notif_log ADD CONSTRAINT viagem_notif_log_protocolo_id_fkey FOREIGN KEY (protocolo_id) REFERENCES viagem_protocolos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.viagem_passagens ADD CONSTRAINT viagem_passagens_viagem_id_fkey FOREIGN KEY (viagem_id) REFERENCES viagens_diarias(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.viagem_protocolos ADD CONSTRAINT viagem_protocolos_aprovado_por_fkey FOREIGN KEY (aprovado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.viagem_protocolos ADD CONSTRAINT viagem_protocolos_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.viagem_protocolos ADD CONSTRAINT viagem_protocolos_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES auth.users(id);
ALTER TABLE ONLY public.viagem_protocolos ADD CONSTRAINT viagem_protocolos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.viagem_protocolos ADD CONSTRAINT viagem_protocolos_realizado_por_fkey FOREIGN KEY (realizado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.viagem_protocolos ADD CONSTRAINT viagem_protocolos_rejeitado_por_fkey FOREIGN KEY (rejeitado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.viagem_trechos ADD CONSTRAINT viagem_trechos_protocolo_id_fkey FOREIGN KEY (protocolo_id) REFERENCES viagem_protocolos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.viagem_trechos ADD CONSTRAINT viagem_trechos_viajante_id_fkey FOREIGN KEY (viajante_id) REFERENCES viagem_viajantes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.viagem_viajantes ADD CONSTRAINT viagem_viajantes_aprovado_diar_por_fkey FOREIGN KEY (aprovado_diar_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.viagem_viajantes ADD CONSTRAINT viagem_viajantes_aprovado_pass_por_fkey FOREIGN KEY (aprovado_pass_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.viagem_viajantes ADD CONSTRAINT viagem_viajantes_beneficiario_id_fkey FOREIGN KEY (beneficiario_id) REFERENCES beneficiarios(id);
ALTER TABLE ONLY public.viagem_viajantes ADD CONSTRAINT viagem_viajantes_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES execucao_financeira(id);
ALTER TABLE ONLY public.viagem_viajantes ADD CONSTRAINT viagem_viajantes_protocolo_id_fkey FOREIGN KEY (protocolo_id) REFERENCES viagem_protocolos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.viagens_diarias ADD CONSTRAINT viagens_diarias_aprovado_diar_por_fkey FOREIGN KEY (aprovado_diar_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.viagens_diarias ADD CONSTRAINT viagens_diarias_aprovado_pass_por_fkey FOREIGN KEY (aprovado_pass_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.viagens_diarias ADD CONSTRAINT viagens_diarias_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades(id);
ALTER TABLE ONLY public.viagens_diarias ADD CONSTRAINT viagens_diarias_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuarios(id);
ALTER TABLE ONLY public.viagens_diarias ADD CONSTRAINT viagens_diarias_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES execucao_financeira(id);

-- ===== ÍNDICES =====
CREATE INDEX IF NOT EXISTS idx_acervo_capas_obra ON public.acervo_capas USING btree (obra_id);
CREATE INDEX IF NOT EXISTS idx_acervo_publicacoes_obra ON public.acervo_publicacoes USING btree (obra_id);
CREATE INDEX IF NOT EXISTS idx_agente_analises_checkpoint ON public.agente_analises USING btree (checkpoint, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_agente_analises_referencia ON public.agente_analises USING btree (referencia_tipo, referencia_id);
CREATE INDEX IF NOT EXISTS api_acessos_cliente_em ON public.api_acessos USING btree (cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS api_ped_notif_pend ON public.api_pedido_notificacoes USING btree (criado_em) WHERE (enviado_em IS NULL);
CREATE INDEX IF NOT EXISTS api_pedidos_remetente_em ON public.api_pedidos USING btree (remetente_email, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_atividade_resp_atividade ON public.atividade_responsaveis USING btree (atividade_id) WHERE (ativo = true);
CREATE INDEX IF NOT EXISTS idx_atividade_resp_usuario ON public.atividade_responsaveis USING btree (usuario_id) WHERE (ativo = true);
CREATE INDEX IF NOT EXISTS idx_audit_criado ON public.audit_log USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_tabela_registro ON public.audit_log USING btree (tabela, registro_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_usuario ON public.audit_log USING btree (usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tabela ON public.audit_log USING btree (tabela);
CREATE INDEX IF NOT EXISTS idx_audit_usuario ON public.audit_log USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS idx_aud_dominio ON public.auditoria_registros USING btree (dominio);
CREATE INDEX IF NOT EXISTS idx_aud_execucao ON public.auditoria_registros USING btree (execucao_id);
CREATE INDEX IF NOT EXISTS idx_aud_ref ON public.auditoria_registros USING btree (referencia_tabela, referencia_id);
CREATE INDEX IF NOT EXISTS idx_aud_severidade ON public.auditoria_registros USING btree (severidade);
CREATE INDEX IF NOT EXISTS idx_aud_status ON public.auditoria_registros USING btree (status);
CREATE INDEX IF NOT EXISTS idx_car_dados_class ON public.car_dados_locais USING btree (nome_class);
CREATE INDEX IF NOT EXISTS idx_car_dados_cod ON public.car_dados_locais USING btree (cod_imovel);
CREATE INDEX IF NOT EXISTS idx_car_dados_muni ON public.car_dados_locais USING btree (nom_munici);
CREATE INDEX IF NOT EXISTS idx_cob_notif_pendentes ON public.cobertura_notificacoes USING btree (criado_em) WHERE (enviado_em IS NULL);
CREATE INDEX IF NOT EXISTS idx_cob_atividade ON public.contrato_coberturas USING btree (atividade_id, seq);
CREATE INDEX IF NOT EXISTS idx_cob_grupo ON public.contrato_coberturas USING btree (grupo, seq);
CREATE INDEX IF NOT EXISTS idx_cob_pendentes ON public.contrato_coberturas USING btree (atividade_id, seq) WHERE (situacao = 'aguardando'::text);
CREATE INDEX IF NOT EXISTS idx_ced_contrato ON public.contrato_encerramento_documentos USING btree (contrato_id);
CREATE INDEX IF NOT EXISTS idx_ced_encerramento ON public.contrato_encerramento_documentos USING btree (encerramento_id);
CREATE INDEX IF NOT EXISTS idx_encp_contrato ON public.contrato_encerramento_pedidos USING btree (contrato_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_encp_aberto ON public.contrato_encerramento_pedidos USING btree (contrato_id) WHERE (status = 'aguardando'::text);
CREATE INDEX IF NOT EXISTS idx_ce_status ON public.contrato_encerramentos USING btree (status);
CREATE INDEX IF NOT EXISTS idx_ce_tdr ON public.contrato_encerramentos USING btree (tdr_id);
CREATE INDEX IF NOT EXISTS idx_contratos_atividade ON public.contratos USING btree (atividade_id);
CREATE INDEX IF NOT EXISTS idx_contratos_fornecedor ON public.contratos USING btree (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_contratos_produtos_contrato ON public.contratos_produtos USING btree (contrato_id);
CREATE INDEX IF NOT EXISTS idx_contratos_produtos_lancamento ON public.contratos_produtos USING btree (lancamento_id);
CREATE INDEX IF NOT EXISTS idx_contratos_produtos_situacao ON public.contratos_produtos USING btree (situacao);
CREATE INDEX IF NOT EXISTS idx_cp_contrato_numero ON public.contratos_produtos USING btree (contrato_id, numero_produto);
CREATE INDEX IF NOT EXISTS idx_cp_situacao ON public.contratos_produtos USING btree (situacao);
CREATE INDEX IF NOT EXISTS idx_cpe_contrato ON public.contratos_produtos_entregas USING btree (contrato_id);
CREATE INDEX IF NOT EXISTS idx_cpe_lancamento ON public.contratos_produtos_entregas USING btree (lancamento_id);
CREATE INDEX IF NOT EXISTS idx_cpe_produto ON public.contratos_produtos_entregas USING btree (produto_id);
CREATE INDEX IF NOT EXISTS idx_cpe_situacao ON public.contratos_produtos_entregas USING btree (situacao);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cotacoes_data ON public.cotacoes_usd USING btree (data_ref);
CREATE INDEX IF NOT EXISTS idx_diag_audios_ficha ON public.diag_audios USING btree (ficha_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_diag_comunidade_nome ON public.diag_comunidades USING btree (municipio_ibge, lower(btrim(nome)));
CREATE INDEX IF NOT EXISTS idx_diag_exportacoes_criado ON public.diag_exportacoes USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_diag_expurgo_pendente ON public.diag_expurgo_arquivos USING btree (id) WHERE (removido_em IS NULL);
CREATE INDEX IF NOT EXISTS idx_diag_fichas_comunidade ON public.diag_fichas USING btree (comunidade_id);
CREATE INDEX IF NOT EXISTS idx_diag_fichas_entrevistador ON public.diag_fichas USING btree (entrevistador_id);
CREATE INDEX IF NOT EXISTS idx_diag_fichas_localidade ON public.diag_fichas USING btree (localidade_id);
CREATE INDEX IF NOT EXISTS idx_diag_fichas_status ON public.diag_fichas USING btree (status);
CREATE INDEX IF NOT EXISTS idx_diag_fichas_treino ON public.diag_fichas USING btree (treino) WHERE treino;
CREATE INDEX IF NOT EXISTS idx_diag_hist_ficha ON public.diag_fichas_historico USING btree (ficha_id);
CREATE INDEX IF NOT EXISTS idx_diag_fotos_ficha ON public.diag_fotos USING btree (ficha_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_diag_localidade_nome ON public.diag_localidades USING btree (comunidade_id, lower(btrim(nome)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_diag_morador_entrevistado ON public.diag_moradores USING btree (ficha_id) WHERE e_entrevistado;
CREATE INDEX IF NOT EXISTS eas_entrega_idx ON public.entrega_aprovacao_senhas USING btree (entrega_id, usuario_id, confirmado_em DESC);
CREATE INDEX IF NOT EXISTS idx_ed_entrega ON public.entrega_documentos USING btree (entrega_id);
CREATE INDEX IF NOT EXISTS idx_ef_atividade ON public.execucao_financeira USING btree (atividade_id);
CREATE INDEX IF NOT EXISTS idx_ef_situacao ON public.execucao_financeira USING btree (situacao);
CREATE INDEX IF NOT EXISTS fornecedor_usuarios_usuario_idx ON public.fornecedor_usuarios USING btree (usuario_id) WHERE ativo;
CREATE UNIQUE INDEX IF NOT EXISTS fornecedores_doc_unico ON public.fornecedores USING btree (regexp_replace((cpf_cnpj)::text, '[^0-9]'::text, ''::text, 'g'::text)) WHERE ((cpf_cnpj IS NOT NULL) AND (TRIM(BOTH FROM cpf_cnpj) <> ''::text));
CREATE INDEX IF NOT EXISTS geometria_fotos_group_idx ON public.geometria_fotos USING btree (geometry_group, geometry_type);
CREATE INDEX IF NOT EXISTS idx_indicadores_resultado ON public.indicadores USING btree (resultado_id);
CREATE INDEX IF NOT EXISTS nt_conf_cv_idx ON public.nota_tecnica_conferencias USING btree (codigo_verificador);
CREATE INDEX IF NOT EXISTS nt_conf_entrega_idx ON public.nota_tecnica_conferencias USING btree (entrega_id, conferido_em DESC);
CREATE INDEX IF NOT EXISTS nt_conf_sha_idx ON public.nota_tecnica_conferencias USING btree (sha256);
CREATE INDEX IF NOT EXISTS idx_notif_usuario_lida ON public.notificacoes USING btree (usuario_id, lida);
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario ON public.notificacoes USING btree (usuario_id, lida, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_orcamento_eventos_atividade ON public.orcamento_eventos USING btree (atividade_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_orcamento_fontes_ajusta ON public.orcamento_fontes USING btree (ajusta_fonte_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_fontes_atividade ON public.orcamento_fontes USING btree (atividade_id, criado_em);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orcamento_fontes_dotacao ON public.orcamento_fontes USING btree (atividade_id) WHERE ((tipo = 'dotacao_original'::text) AND (ajusta_fonte_id IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS uq_orcamento_fontes_encerramento ON public.orcamento_fontes USING btree (encerramento_id) WHERE ((encerramento_id IS NOT NULL) AND (ajusta_fonte_id IS NULL));
CREATE INDEX IF NOT EXISTS prestacao_tokens_token_idx ON public.prestacao_tokens USING btree (token);
CREATE INDEX IF NOT EXISTS prestacao_tokens_viajante_idx ON public.prestacao_tokens USING btree (viajante_id);
CREATE INDEX IF NOT EXISTS produto_notif_log_criado_idx ON public.produto_notif_log USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS produto_notif_log_entrega_idx ON public.produto_notif_log USING btree (entrega_id);
CREATE INDEX IF NOT EXISTS produto_notif_log_produto_idx ON public.produto_notif_log USING btree (produto_id);
CREATE INDEX IF NOT EXISTS idx_pe_status ON public.produtos_entregues USING btree (status);
CREATE INDEX IF NOT EXISTS idx_pe_tdr ON public.produtos_entregues USING btree (tdr_id);
CREATE INDEX IF NOT EXISTS idx_pulso_exp_ciclo ON public.pulso_exportacoes USING btree (ciclo_id);
CREATE INDEX IF NOT EXISTS idx_pulso_part_disp ON public.pulso_participacoes USING btree (ciclo_id, dispositivo_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pulso_part_convidado ON public.pulso_participacoes USING btree (ciclo_id, dispositivo_hash) WHERE (usuario_id IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pulso_part_usuario ON public.pulso_participacoes USING btree (ciclo_id, usuario_id) WHERE (usuario_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pulso_respostas_ciclo ON public.pulso_respostas USING btree (ciclo_id);
CREATE INDEX IF NOT EXISTS idx_pulso_resp2_ciclo ON public.pulso_respostas_v2 USING btree (ciclo_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rem_titular_cargo ON public.rem_cargo_titulares USING btree (cargo) WHERE (vigencia_fim IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rem_titular_pessoa ON public.rem_cargo_titulares USING btree (usuario_id) WHERE (vigencia_fim IS NULL);
CREATE INDEX IF NOT EXISTS idx_rem_tentativas ON public.rem_tentativas_senha USING btree (usuario_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_rem_alocacoes_fonte ON public.remanejamento_alocacoes USING btree (fonte_id);
CREATE INDEX IF NOT EXISTS idx_rem_historico ON public.remanejamento_historico USING btree (remanejamento_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_rem_notif_pendentes ON public.remanejamento_notificacoes USING btree (criado_em) WHERE (enviado_em IS NULL);
CREATE INDEX IF NOT EXISTS idx_rem_estorno_de ON public.remanejamentos USING btree (estorno_de) WHERE (estorno_de IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_repo_ativo ON public.repositorio_links USING btree (ativo);
CREATE INDEX IF NOT EXISTS idx_repo_busca ON public.repositorio_links USING gin (busca_tsv);
CREATE INDEX IF NOT EXISTS idx_repo_categoria ON public.repositorio_links USING btree (categoria);
CREATE INDEX IF NOT EXISTS idx_repo_idioma ON public.repositorio_links USING btree (idioma);
CREATE INDEX IF NOT EXISTS idx_repo_inserido ON public.repositorio_links USING btree (inserido_em DESC);
CREATE INDEX IF NOT EXISTS idx_sol_senha_status ON public.solicitacoes_senha USING btree (status);
CREATE INDEX IF NOT EXISTS idx_sol_senha_usuario ON public.solicitacoes_senha USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS idx_anexo_checklist ON public.tarefa_anexos USING btree (checklist_id) WHERE (checklist_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_anexo_comentario ON public.tarefa_anexos USING btree (comentario_id) WHERE (comentario_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_anexo_tarefa ON public.tarefa_anexos USING btree (tarefa_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_checklist_prazo ON public.tarefa_checklist USING btree (dt_prazo) WHERE (NOT concluida);
CREATE INDEX IF NOT EXISTS idx_checklist_tarefa ON public.tarefa_checklist USING btree (tarefa_id, ordem);
CREATE INDEX IF NOT EXISTS idx_coment_tarefa ON public.tarefa_comentarios USING btree (tarefa_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_thist_tarefa ON public.tarefa_historico USING btree (tarefa_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_tpart_tarefa ON public.tarefa_participantes USING btree (tarefa_id);
CREATE INDEX IF NOT EXISTS idx_tpart_usuario ON public.tarefa_participantes USING btree (usuario_id) WHERE (papel = 'responsavel'::text);
CREATE INDEX IF NOT EXISTS idx_tarefa_tdrs_tdr ON public.tarefa_tdrs USING btree (tdr_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_atividade ON public.tarefas USING btree (atividade_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_entidade ON public.tarefas USING btree (entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_fornecedor ON public.tarefas USING btree (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_prazo ON public.tarefas USING btree (dt_prazo) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_tarefas_status ON public.tarefas USING btree (status) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_tarefas_tipo ON public.tarefas USING btree (tipo) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_tdr_acoes_tdr ON public.tdr_acoes USING btree (tdr_id);
CREATE INDEX IF NOT EXISTS idx_tdr_acoes_usuario ON public.tdr_acoes USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS idx_tdr_anexos_tdr_id ON public.tdr_anexos USING btree (tdr_id);
CREATE INDEX IF NOT EXISTS idx_tcan_historico ON public.tdr_cancelamento_historico USING btree (cancelamento_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_tcan_notif_pendentes ON public.tdr_cancelamento_notificacoes USING btree (criado_em) WHERE (enviado_em IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tdr_cancelamento_vivo ON public.tdr_cancelamentos USING btree (tdr_id) WHERE (status = ANY (ARRAY['rascunho'::text, 'em_aprovacao'::text]));
CREATE INDEX IF NOT EXISTS idx_lic_emp_rodada ON public.tdr_licitacao_empresas USING btree (rodada_id);
CREATE INDEX IF NOT EXISTS idx_lic_prorr_rodada ON public.tdr_licitacao_prorrogacoes USING btree (rodada_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lic_rodada_aberta ON public.tdr_licitacao_rodadas USING btree (tdr_id) WHERE (situacao = 'aberta'::text);
CREATE INDEX IF NOT EXISTS idx_tdr_resp_tdr ON public.tdr_responsaveis USING btree (tdr_id) WHERE (ativo = true);
CREATE INDEX IF NOT EXISTS idx_tdr_resp_usuario ON public.tdr_responsaveis USING btree (usuario_id) WHERE (ativo = true);
CREATE INDEX IF NOT EXISTS idx_tdr_versoes_tdr ON public.tdr_versoes USING btree (tdr_id);
CREATE INDEX IF NOT EXISTS idx_tdrs_atividade ON public.tdrs USING btree (atividade_id);
CREATE INDEX IF NOT EXISTS idx_tdrs_numero ON public.tdrs USING btree (numero);
CREATE INDEX IF NOT EXISTS idx_tdrs_status ON public.tdrs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_uperm_ativo ON public.usuario_permissoes USING btree (ativo, valido_ate);
CREATE INDEX IF NOT EXISTS idx_uperm_usuario ON public.usuario_permissoes USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS idx_viagem_decisoes_prot ON public.viagem_decisoes USING btree (protocolo_id);
CREATE INDEX IF NOT EXISTS idx_diariasv2_viaj ON public.viagem_diarias_v2 USING btree (viajante_id);
CREATE INDEX IF NOT EXISTS idx_prot_criado ON public.viagem_protocolos USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_prot_situacao ON public.viagem_protocolos USING btree (situacao);
CREATE INDEX IF NOT EXISTS idx_viagem_prot_criado_por ON public.viagem_protocolos USING btree (criado_por);
CREATE INDEX IF NOT EXISTS idx_trechos_viaj ON public.viagem_trechos USING btree (viajante_id);
CREATE INDEX IF NOT EXISTS idx_viaj_protocolo ON public.viagem_viajantes USING btree (protocolo_id);

-- ===== FUNÇÕES (2/2 — depois das tabelas) =====
-- A assinatura destas usa o tipo-linha de uma tabela/view, que precisa existir.
CREATE OR REPLACE FUNCTION public.diag_mudar_status(p_ficha_id uuid, p_status text, p_motivo text DEFAULT NULL::text)
 RETURNS diag_fichas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_f diag_fichas;
begin
  if not fn_diag_pode_gerir() then
    raise exception 'diag:nao_autorizado: só coordenação e super_admin mudam o status';
  end if;
  select * into v_f from diag_fichas where id = p_ficha_id for update;
  if v_f.id is null then raise exception 'diag:nao_encontrada'; end if;
  if p_status in ('devolvida','descartada') and nullif(btrim(p_motivo),'') is null then
    raise exception 'diag:motivo_obrigatorio: informe o motivo';
  end if;
  if not (
       (v_f.status = 'enviada'   and p_status in ('validada','devolvida','descartada'))
    or (v_f.status = 'devolvida' and p_status = 'descartada')
    or (v_f.status = 'validada'  and p_status = 'devolvida')     -- reabrir
  ) then
    raise exception 'diag:transicao_invalida: % → %', v_f.status, p_status;
  end if;
  perform set_config('diag.motivo', coalesce(p_motivo, ''), true);
  update diag_fichas set
    status = p_status,
    motivo_devolucao = case when p_status = 'devolvida' then p_motivo else motivo_devolucao end,
    validado_por  = case when p_status = 'validada' then auth.uid() when p_status = 'devolvida' then null else validado_por end,
    validado_em   = case when p_status = 'validada' then now() when p_status = 'devolvida' then null else validado_em end,
    descartado_em = case when p_status = 'descartada' then now() else descartado_em end
  where id = p_ficha_id
  returning * into v_f;
  return v_f;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_cob_registrar(p_grupo uuid, p_tdr uuid, p_atividade uuid, p_contrato uuid, p_evento text, p_valor_ant numeric, p_valor_novo numeric, p_depois_brl numeric, p_pode_travar boolean)
 RETURNS contrato_coberturas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_antes   numeric(14,2);
  v_delta   numeric(14,2);
  v_usd     numeric(14,2);
  v_cot     numeric(12,4);
  v_cot_dt  date;
  v_tot_usd numeric(14,2);
  v_livre   numeric(14,2);
  v_deficit numeric(14,2) := 0;
  v_piso    numeric(14,2);
  v_row     public.contrato_coberturas;
begin
  select cc.excedente_depois_brl into v_antes
    from public.contrato_coberturas cc where cc.grupo = p_grupo order by cc.seq desc limit 1;
  v_antes := coalesce(v_antes, 0);
  v_delta := round(p_depois_brl, 2) - v_antes;
  if v_delta = 0 then return null; end if;
  if p_atividade is null then
    raise exception 'CONTRATO_SEM_ATIVIDADE: informe a atividade do contrato — o valor acima do TDR precisa de orçamento.';
  end if;

  perform 1 from public.atividades where id = p_atividade for update;

  if v_delta > 0 then
    select q.ptax_venda, q.data_cotacao into v_cot, v_cot_dt from public.fn_cotacao_usd(null) q;
    v_usd := round(v_delta / v_cot, 2);
  else
    select coalesce(sum(cc.delta_usd), 0) into v_tot_usd from public.contrato_coberturas cc where cc.grupo = p_grupo;
    v_usd := case when round(p_depois_brl, 2) = 0 then -v_tot_usd
                  else round(v_delta * v_tot_usd / nullif(v_antes, 0), 2) end;
  end if;

  if p_pode_travar and v_usd > 0 then
    v_livre   := fn_cob_livre(p_atividade);
    v_deficit := greatest(0, v_usd - greatest(0, v_livre));
    if v_deficit > 0 then
      select cc.piso_usd into v_piso from public.contrato_coberturas cc
       where cc.atividade_id = p_atividade and cc.situacao = 'aguardando' order by cc.seq limit 1;
      v_piso := coalesce(v_piso, least(0, v_livre));
    end if;
  end if;

  insert into public.contrato_coberturas (grupo, contrato_id, tdr_id, atividade_id, evento,
         valor_anterior_brl, valor_novo_brl, excedente_antes_brl, excedente_depois_brl,
         cotacao, cotacao_data, delta_usd, livre_antes_usd, deficit_usd, piso_usd, situacao, criado_por)
  values (p_grupo, p_contrato, p_tdr, p_atividade, p_evento,
          p_valor_ant, p_valor_novo, v_antes, round(p_depois_brl, 2),
          v_cot, v_cot_dt, v_usd, v_livre, v_deficit, v_piso,
          case when v_deficit > 0 then 'aguardando' else 'sem_deficit' end, auth.uid())
  returning * into v_row;
  return v_row;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_estornar_economia_tdr(p_encerramento_id uuid, p_motivo text)
 RETURNS contrato_encerramentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_perfil perfil_usuario;
  v_uid    uuid := auth.uid();
  v_row    public.contrato_encerramentos;
begin
  v_perfil := fn_perfil_atual();
  if v_perfil is null or v_perfil <> all (array['super_admin'::perfil_usuario,'coordenacao'::perfil_usuario]) then
    raise exception 'Sem permissão: apenas coordenação e super admin podem estornar saldo.';
  end if;
  if coalesce(btrim(p_motivo),'') = '' then
    raise exception 'Motivo do estorno é obrigatório.';
  end if;

  select * into v_row from public.contrato_encerramentos where id = p_encerramento_id;
  if not found then raise exception 'Liberação não encontrada.'; end if;
  if v_row.tipo <> 'economia_contratacao' then
    raise exception 'Só liberações de economia de contratação podem ser estornadas por aqui.';
  end if;
  if v_row.status <> 'ativo' then
    raise exception 'Esta liberação já está estornada.';
  end if;

  update public.contrato_encerramentos
     set status = 'revertido', revertido_por = v_uid, revertido_em = now(), motivo_reversao = btrim(p_motivo)
   where id = p_encerramento_id
   returning * into v_row;

  begin
    perform fn_registrar_acao_tdr(v_row.tdr_id, v_uid, 'economia_estornada',
      'Liberação estornada: R$ ' || to_char(v_row.valor_liberado_brl,'FM999G999G990D00') || ' · ' || btrim(p_motivo), null);
  exception when others then null; end;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_liberar_economia_tdr(p_tdr_id uuid, p_justificativa text, p_taxa numeric DEFAULT NULL::numeric)
 RETURNS contrato_encerramentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_perfil   perfil_usuario;
  v_tdr      record;
  v_firmado  numeric;
  v_contrato uuid;
  v_economia numeric;
  v_uid      uuid := auth.uid();
  v_row      public.contrato_encerramentos;
begin
  v_perfil := fn_perfil_atual();
  if v_perfil is null or v_perfil <> all (array['super_admin'::perfil_usuario,'coordenacao'::perfil_usuario]) then
    raise exception 'Sem permissão: apenas coordenação e super admin podem liberar saldo.';
  end if;
  if coalesce(btrim(p_justificativa),'') = '' then
    raise exception 'Justificativa é obrigatória.';
  end if;

  select id, atividade_id, valor_brl, status into v_tdr from public.tdrs where id = p_tdr_id;
  if not found then raise exception 'TDR não encontrado.'; end if;
  if v_tdr.status <> 'contratado' then
    raise exception 'Só é possível liberar economia de TDR já contratado (status atual: %).', v_tdr.status;
  end if;

  select coalesce(sum(valor_total_brl),0) into v_firmado from public.contratos where tdr_id = p_tdr_id;
  select id into v_contrato from public.contratos where tdr_id = p_tdr_id order by criado_em nulls last, id limit 1;
  if v_contrato is null then
    raise exception 'Nenhum contrato vinculado a este TDR.';
  end if;

  v_economia := coalesce(v_tdr.valor_brl,0) - coalesce(v_firmado,0);
  if v_economia <= 0 then
    raise exception 'Não há economia a liberar (planejado R$ % ≤ firmado R$ %).', coalesce(v_tdr.valor_brl,0), coalesce(v_firmado,0);
  end if;

  if exists (select 1 from public.contrato_encerramentos
             where tdr_id = p_tdr_id and tipo = 'economia_contratacao' and status = 'ativo') then
    raise exception 'Este TDR já tem uma economia liberada ativa. Estorne-a antes de liberar novamente.';
  end if;

  insert into public.contrato_encerramentos (
    contrato_id, atividade_id, tdr_id, tipo,
    valor_liberado_brl, valor_liberado_usd, motivo, produtos_afetados, autorizado_por, status
  ) values (
    v_contrato, v_tdr.atividade_id, p_tdr_id, 'economia_contratacao',
    v_economia,
    case when coalesce(p_taxa,0) > 0 then round(v_economia / p_taxa, 2) else null end,
    btrim(p_justificativa), '[]'::jsonb, v_uid, 'ativo'
  ) returning * into v_row;

  begin
    perform fn_registrar_acao_tdr(p_tdr_id, v_uid, 'economia_liberada',
      'Economia liberada: R$ ' || to_char(v_economia,'FM999G999G990D00') || ' · ' || btrim(p_justificativa), null);
  exception when others then null; end;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_aberto(c pulso_ciclos)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select c.status = 'aberto' and (c.fecha_em is null or now() < c.fecha_em)
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_dono(c pulso_ciclos)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.fn_pulso_usuario_ativo() and c.criado_por = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.fn_pulso_pode_ver(c pulso_ciclos)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.fn_pulso_usuario_ativo() and (c.criado_por = auth.uid() or public.fn_pulso_gestor())
$function$
;

CREATE OR REPLACE FUNCTION public.fn_rem_designar_titular(p_cargo text, p_usuario_id uuid, p_ato text)
 RETURNS rem_cargo_titulares
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cargo public.rem_cargos;
  v_perfil public.perfil_usuario;
  v_row public.rem_cargo_titulares;
begin
  if coalesce(fn_perfil_atual()::text, '') <> 'super_admin' then
    raise exception 'Sem permissão: só super_admin designa titulares da cadeia de remanejamento.';
  end if;
  if coalesce(btrim(p_ato), '') = '' then raise exception 'Informe o ato da designação (portaria, SEI…).'; end if;
  select * into v_cargo from public.rem_cargos where codigo = p_cargo;
  if not found then raise exception 'Cargo inexistente: %', p_cargo; end if;

  if p_usuario_id is not null then
    select perfil into v_perfil from public.usuarios where id = p_usuario_id and ativo;
    if not found then raise exception 'Usuário inexistente ou inativo.'; end if;
    if v_cargo.perfis_exigidos is not null and not (v_perfil = any (v_cargo.perfis_exigidos)) then
      raise exception 'O cargo % exige perfil %, e o usuário tem %.', v_cargo.nome, v_cargo.perfis_exigidos, v_perfil;
    end if;
  end if;

  update public.rem_cargo_titulares
     set vigencia_fim = now(), encerrado_por = auth.uid()
   where cargo = p_cargo and vigencia_fim is null;

  if p_usuario_id is not null then
    insert into public.rem_cargo_titulares (cargo, usuario_id, ato, designado_por)
    values (p_cargo, p_usuario_id, btrim(p_ato), auth.uid())
    returning * into v_row;
  end if;
  return v_row;
end $function$
;

-- ===== VIEWS (em ordem de dependencia) =====
-- nivel 0
CREATE OR REPLACE VIEW public.vw_acervo_entrega_ref AS
 SELECT DISTINCT ON (produto_id) produto_id,
    id AS entrega_id,
    numero_entrega,
    situacao,
    tipo_decisao,
    pct_entregue,
    dt_entrega,
    despacho_numero,
    despacho_data
   FROM contratos_produtos_entregas e
  ORDER BY produto_id, (situacao = 'aprovada'::text) DESC, numero_entrega DESC NULLS LAST, criado_em DESC;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_dashboard_kpis AS
 SELECT ( SELECT sum(resultados.orcamento_usd) AS sum
           FROM resultados) AS orcamento_total_usd,
    ( SELECT count(*) AS count
           FROM contratos
          WHERE contratos.status = 'vigente'::status_contrato) AS contratos_ativos,
    ( SELECT sum(contratos.valor_total_brl) AS sum
           FROM contratos
          WHERE contratos.status = 'vigente'::status_contrato) AS total_contratado_brl,
    ( SELECT sum(execucao_financeira.valor_brl) AS sum
           FROM execucao_financeira
          WHERE execucao_financeira.situacao = 'pago'::situacao_financeiro) AS total_pago_brl,
    ( SELECT sum(execucao_financeira.valor_brl) AS sum
           FROM execucao_financeira
          WHERE execucao_financeira.situacao = 'a_pagar'::situacao_financeiro) AS total_a_pagar_brl,
    ( SELECT count(*) AS count
           FROM tdrs
          WHERE tdrs.status = 'rascunho'::status_tdr) AS tdrs_rascunho,
    ( SELECT count(*) AS count
           FROM tdrs
          WHERE tdrs.status <> ALL (ARRAY['aprovado'::status_tdr, 'cancelado'::status_tdr])) AS tdrs_em_andamento,
    ( SELECT count(*) AS count
           FROM tdrs
          WHERE tdrs.status = 'aprovado'::status_tdr) AS tdrs_aprovados,
    ( SELECT count(*) AS count
           FROM atividades) AS total_atividades,
    ( SELECT count(*) AS count
           FROM indicadores
          WHERE indicadores.status_execucao::text = 'em_risco'::text) AS indicadores_em_risco,
    ( SELECT cotacoes_usd.cotacao
           FROM cotacoes_usd
          ORDER BY cotacoes_usd.data_ref DESC
         LIMIT 1) AS cotacao_atual_usd,
    ( SELECT cotacoes_usd.data_ref
           FROM cotacoes_usd
          ORDER BY cotacoes_usd.data_ref DESC
         LIMIT 1) AS cotacao_data;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_diag_respostas AS
 WITH base AS (
         SELECT f.id AS ficha_id,
            f.questionario_id,
            f.status,
            f.status = 'validada'::text AS validada,
            f.municipio_ibge,
            COALESCE(f.comunidade_id::text, 'nova:'::text || lower(btrim(f.comunidade_nova))) AS comunidade_chave,
            COALESCE(c.nome, f.comunidade_nova) AS comunidade_nome,
                CASE
                    WHEN (f.respostas ->> 'sexo_genero'::text) = ANY (ARRAY['mulher'::text, 'homem'::text]) THEN f.respostas ->> 'sexo_genero'::text
                    ELSE 'outro_ou_nao_informado'::text
                END AS sexo_respondente,
            f.respostas,
            q.estrutura
           FROM diag_fichas f
             JOIN diag_questionarios q ON q.id = f.questionario_id
             LEFT JOIN diag_comunidades c ON c.id = f.comunidade_id
          WHERE (f.status = ANY (ARRAY['enviada'::text, 'validada'::text])) AND f.aceitou_participar AND NOT f.treino
        )
 SELECT b.ficha_id,
    b.questionario_id,
    b.status,
    b.validada,
    b.municipio_ibge,
    b.comunidade_chave,
    b.comunidade_nome,
    b.sexo_respondente,
    p.bloco,
    p.pergunta ->> 'chave'::text AS chave,
    (p.pergunta ->> 'n'::text)::integer AS n,
    p.pergunta ->> 'tipo'::text AS tipo,
    v.val = '"_nr"'::jsonb AS nr,
        CASE
            WHEN v.val = '"_nr"'::jsonb THEN NULL::text
            WHEN (p.pergunta ->> 'tipo'::text) = 'unica'::text THEN v.val #>> '{}'::text[]
            WHEN (p.pergunta ->> 'tipo'::text) = 'multipla'::text THEN mm.opcao
            ELSE NULL::text
        END AS opcao,
        CASE
            WHEN ((p.pergunta ->> 'tipo'::text) = ANY (ARRAY['inteiro'::text, 'decimal'::text])) AND jsonb_typeof(v.val) = 'number'::text THEN (v.val #>> '{}'::text[])::numeric
            ELSE NULL::numeric
        END AS valor_num
   FROM base b
     CROSS JOIN LATERAL fn_diag_perguntas(b.estrutura) p(ordem, bloco, pergunta)
     CROSS JOIN LATERAL ( SELECT b.respostas -> (p.pergunta ->> 'chave'::text) AS val) v
     LEFT JOIN LATERAL ( SELECT jsonb_array_elements_text(v.val) AS opcao
          WHERE jsonb_typeof(v.val) = 'array'::text) mm ON true
  WHERE v.val IS NOT NULL AND ((p.pergunta ->> 'tipo'::text) = ANY (ARRAY['unica'::text, 'multipla'::text, 'inteiro'::text, 'decimal'::text]))
UNION ALL
 SELECT b.ficha_id,
    b.questionario_id,
    b.status,
    b.validada,
    b.municipio_ibge,
    b.comunidade_chave,
    b.comunidade_nome,
    b.sexo_respondente,
    'identificacao'::text AS bloco,
    '_total_moradores'::text AS chave,
    9 AS n,
    'inteiro'::text AS tipo,
    false AS nr,
    NULL::text AS opcao,
    (( SELECT count(*) AS count
           FROM diag_moradores m
          WHERE m.ficha_id = b.ficha_id))::numeric AS valor_num
   FROM base b
  WHERE (EXISTS ( SELECT 1
           FROM diag_moradores m
          WHERE m.ficha_id = b.ficha_id));

-- nivel 0
CREATE OR REPLACE VIEW public.vw_fila_revisao AS
 SELECT t.id,
    t.numero,
    t.objeto_pt,
    t.status,
    t.valor_brl,
    t.valor_usd,
    a.codigo AS atividade_codigo,
    a.nome_pt AS atividade_nome,
    u.nome_completo AS elaborador_nome,
    ta.criado_em AS enviado_em,
    EXTRACT(day FROM now() - ta.criado_em) AS dias_aguardando
   FROM tdrs t
     LEFT JOIN atividades a ON a.id = t.atividade_id
     LEFT JOIN tdr_acoes ta ON ta.tdr_id = t.id AND ta.acao::text = 'enviado_revisao'::text AND ta.criado_em = (( SELECT max(ta2.criado_em) AS max
           FROM tdr_acoes ta2
          WHERE ta2.tdr_id = t.id AND ta2.acao::text = 'enviado_revisao'::text))
     LEFT JOIN usuarios u ON u.id = t.elaborador_id
  WHERE t.status = 'revisao_interna'::status_tdr;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_matriz_contribuicoes AS
 SELECT pmc.id,
    pmc.produto_id,
    pmc.matriz_item_id,
    pmc.valor,
    pmc.unidade,
    pmc.observacao,
    pmc.status,
    pmc.confirmado_por,
    pmc.confirmado_em,
    pmc.criado_por,
    pmc.criado_em,
    e.numero_entrega AS entrega_numero,
    e.dt_entrega AS entrega_dt,
    e.situacao AS entrega_situacao,
    e.tipo_documento AS entrega_tipo_documento
   FROM produto_matriz_contribuicao pmc
     LEFT JOIN contratos_produtos_entregas e ON e.id = pmc.produto_id;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_matriz_progresso AS
 SELECT mi.id,
    mi.resultado,
    mi.produto_codigo,
    mi.produto_titulo,
    mi.indicador,
    mi.meta_numerica,
    mi.meta_descricao,
    mi.unidade,
    mi.ods,
    mi.metas_km,
    COALESCE(sum(
        CASE
            WHEN pmc.status = 'confirmado'::text THEN pmc.valor
            ELSE 0::numeric
        END), 0::numeric) AS realizado_confirmado,
    COALESCE(sum(
        CASE
            WHEN pmc.status = 'pendente'::text THEN pmc.valor
            ELSE 0::numeric
        END), 0::numeric) AS realizado_pendente,
    COALESCE(sum(
        CASE
            WHEN pmc.status = ANY (ARRAY['confirmado'::text, 'pendente'::text]) THEN pmc.valor
            ELSE 0::numeric
        END), 0::numeric) AS realizado_total,
        CASE
            WHEN mi.meta_numerica > 0::numeric THEN round(COALESCE(sum(
            CASE
                WHEN pmc.status = 'confirmado'::text THEN pmc.valor
                ELSE 0::numeric
            END), 0::numeric) / mi.meta_numerica * 100::numeric, 1)
            ELSE NULL::numeric
        END AS pct_confirmado
   FROM matriz_itens mi
     LEFT JOIN produto_matriz_contribuicao pmc ON pmc.matriz_item_id = mi.id AND pmc.status <> 'cancelado'::text AND fn_entrega_aprovada(pmc.produto_id)
  WHERE mi.ativo = true
  GROUP BY mi.id;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_orcamento_debitos AS
 SELECT a.id AS atividade_id,
    COALESCE(t.planejado, 0::numeric)::numeric(14,2) AS tdr_planejado_usd,
    COALESCE(t.reserva_direta, 0::numeric)::numeric(14,2) AS reserva_execucao_direta_usd,
    COALESCE(d.direta, 0::numeric)::numeric(14,2) AS execucao_direta_realizada_usd,
    COALESCE(p.ct_sem_tdr, 0::numeric)::numeric(14,2) AS pagamentos_contrato_sem_tdr_usd,
    (COALESCE(t.planejado, 0::numeric) + GREATEST(COALESCE(t.reserva_direta, 0::numeric), COALESCE(d.direta, 0::numeric)) + COALESCE(p.ct_sem_tdr, 0::numeric) + COALESCE(e.excedente, 0::numeric))::numeric(14,2) AS debito_usd,
    COALESCE(t.sem_usd, 0::bigint) AS tdrs_sem_valor_usd,
    COALESCE(e.excedente, 0::numeric)::numeric(14,2) AS contratos_excedente_usd
   FROM atividades a
     LEFT JOIN LATERAL ( SELECT sum(x.valor_usd) FILTER (WHERE NOT x.execucao_direta) AS planejado,
            sum(x.valor_usd) FILTER (WHERE x.execucao_direta) AS reserva_direta,
            count(*) FILTER (WHERE x.valor_usd IS NULL) AS sem_usd
           FROM tdrs x
          WHERE x.atividade_id = a.id AND x.status <> 'cancelado'::status_tdr) t ON true
     LEFT JOIN LATERAL ( SELECT sum(ef.valor_usd) FILTER (WHERE ef.contrato_id IS NULL AND (ef.tdr_id IS NULL OR td.execucao_direta)) AS direta
           FROM execucao_financeira ef
             LEFT JOIN tdrs td ON td.id = ef.tdr_id
          WHERE ef.atividade_id = a.id AND ef.situacao <> 'cancelado'::situacao_financeiro) d ON true
     LEFT JOIN LATERAL ( SELECT sum(GREATEST(0::numeric, q.pago - COALESCE(q.exc, 0::numeric))) AS ct_sem_tdr
           FROM ( SELECT ef.contrato_id,
                    sum(ef.valor_usd) AS pago,
                    ( SELECT sum(cc.delta_usd) AS sum
                           FROM contrato_coberturas cc
                          WHERE cc.grupo = ef.contrato_id) AS exc
                   FROM execucao_financeira ef
                     JOIN contratos c ON c.id = ef.contrato_id
                  WHERE ef.atividade_id = a.id AND ef.situacao <> 'cancelado'::situacao_financeiro AND c.tdr_id IS NULL
                  GROUP BY ef.contrato_id) q) p ON true
     LEFT JOIN LATERAL ( SELECT sum(cc.delta_usd) AS excedente
           FROM contrato_coberturas cc
          WHERE cc.atividade_id = a.id) e ON true;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_pendencias_usuario AS
 SELECT usuario_id,
    tipo,
    count(*) AS total,
    max(criado_em) AS mais_recente
   FROM notificacoes n
  WHERE lida = false
  GROUP BY usuario_id, tipo;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_produtos_entregues AS
 SELECT pe.id,
    pe.tdr_id,
    pe.numero_produto,
    pe.tipo_produto,
    pe.descricao_pt,
    pe.quantidade_entregue,
    pe.arquivo_url,
    pe.arquivo_nome,
    pe.status,
    pe.dt_entrega,
    pe.observacoes,
    pe.aprovado_tecnico_por,
    pe.aprovado_tecnico_em,
    pe.aprovado_coord_por,
    pe.aprovado_coord_em,
    pe.aprovado_dir_por,
    pe.aprovado_dir_em,
    pe.motivo_recusa,
    pe.recusado_por,
    pe.recusado_em,
    pe.submetido_por,
    pe.submetido_em,
    t.numero AS tdr_numero,
    t.objeto_pt AS tdr_objeto,
    a.codigo AS atividade_codigo,
    a.nome_pt AS atividade_nome,
    f.nome AS fornecedor_nome,
    f.tipo AS fornecedor_tipo,
    pp.descricao_pt AS produto_previsto_desc,
    pp.prazo_dias,
    us.nome_completo AS submetido_nome,
    ut.nome_completo AS aprovado_tecnico_nome,
    uc.nome_completo AS aprovado_coord_nome,
    ( SELECT count(*) AS count
           FROM produto_evidencias ev
          WHERE ev.produto_id = pe.id) AS total_evidencias
   FROM produtos_entregues pe
     LEFT JOIN tdrs t ON t.id = pe.tdr_id
     LEFT JOIN atividades a ON a.id = t.atividade_id
     LEFT JOIN fornecedores f ON f.id = pe.fornecedor_id
     LEFT JOIN tdr_produtos_previstos pp ON pp.id = pe.produto_previsto_id
     LEFT JOIN usuarios us ON us.id = pe.submetido_por
     LEFT JOIN usuarios ut ON ut.id = pe.aprovado_tecnico_por
     LEFT JOIN usuarios uc ON uc.id = pe.aprovado_coord_por;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_rem_conferencia AS
 SELECT id,
    numero,
    COALESCE(( SELECT sum(i.valor_usd) AS sum
           FROM remanejamento_itens i
          WHERE i.remanejamento_id = r.id AND i.valor_usd > 0::numeric AND i.ativo), 0::numeric)::numeric(14,2) AS destinos_usd,
    COALESCE(( SELECT sum(f.valor_usd) AS sum
           FROM orcamento_fontes f
          WHERE f.remanejamento_id = r.id AND f.valor_usd > 0::numeric), 0::numeric)::numeric(14,2) AS recebido_usd,
    COALESCE(( SELECT - sum(f.valor_usd)
           FROM orcamento_fontes f
          WHERE f.remanejamento_id = r.id AND f.valor_usd < 0::numeric), 0::numeric)::numeric(14,2) AS cedido_usd
   FROM remanejamentos r
  WHERE status = ANY (ARRAY['efetivado'::text, 'estornado'::text]);

-- nivel 0
CREATE OR REPLACE VIEW public.vw_rem_reservas AS
 SELECT a.fonte_id,
    a.remanejamento_id,
    sum(a.valor_usd)::numeric(14,2) AS reservado_usd
   FROM remanejamento_alocacoes a
     JOIN remanejamentos r ON r.id = a.remanejamento_id AND r.status = 'em_aprovacao'::text
  WHERE a.ativo
  GROUP BY a.fonte_id, a.remanejamento_id;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_remanejamento_assinaturas AS
 SELECT a.id,
    a.remanejamento_id,
    a.etapa_id,
    e.ordem AS etapa_ordem,
    e.papel,
    a.versao,
    a.usuario_id,
    u.nome_completo,
    a.cargo,
    a.decisao,
    a.motivo,
    a.hash_documento,
    a.criado_em,
    a.invalidada_em,
    a.invalidada_motivo
   FROM remanejamento_assinaturas a
     JOIN remanejamento_etapas e ON e.id = a.etapa_id
     JOIN usuarios u ON u.id = a.usuario_id;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_saldo_atividade AS
 SELECT a.id,
    a.codigo,
    a.nome_pt,
    a.orcamento_usd,
    x.tdrs + x.exc AS comprometido_usd,
    x.pago AS pago_usd,
    x.apagar AS a_pagar_usd,
    x.n_tdrs AS tdrs_count,
    a.orcamento_usd - (x.tdrs + x.exc) + x.lib AS saldo_livre_usd,
    a.orcamento_usd - x.pago - x.apagar AS saldo_disponivel_usd,
        CASE
            WHEN a.orcamento_usd > 0::numeric THEN round((x.tdrs + x.exc - x.lib) / a.orcamento_usd * 100::numeric, 1)
            ELSE 0::numeric
        END AS pct_comprometido,
        CASE
            WHEN a.orcamento_usd > 0::numeric THEN round(x.pago / a.orcamento_usd * 100::numeric, 1)
            ELSE 0::numeric
        END AS pct_pago,
        CASE
            WHEN a.orcamento_usd > 0::numeric THEN round(x.apagar / a.orcamento_usd * 100::numeric, 1)
            ELSE 0::numeric
        END AS pct_a_pagar,
        CASE
            WHEN a.orcamento_usd = 0::numeric THEN 'sem_orcamento'::text
            WHEN (x.tdrs + x.exc - x.lib) > a.orcamento_usd THEN 'extrapolado'::text
            WHEN (x.tdrs + x.exc - x.lib) >= (a.orcamento_usd * 0.95) THEN 'critico'::text
            WHEN (x.tdrs + x.exc - x.lib) >= (a.orcamento_usd * 0.75) THEN 'atencao'::text
            ELSE 'ok'::text
        END AS status_saldo,
    x.lib AS liberado_usd,
    x.exc AS excedente_contrato_usd
   FROM atividades a
     CROSS JOIN LATERAL ( SELECT COALESCE(( SELECT sum(t.valor_usd) AS sum
                   FROM tdrs t
                  WHERE t.atividade_id = a.id AND t.status <> 'cancelado'::status_tdr), 0::numeric) AS tdrs,
            COALESCE(( SELECT count(*) AS count
                   FROM tdrs t
                  WHERE t.atividade_id = a.id AND t.status <> 'cancelado'::status_tdr), 0::bigint) AS n_tdrs,
            COALESCE(( SELECT sum(ef.valor_usd) AS sum
                   FROM execucao_financeira ef
                  WHERE ef.atividade_id = a.id AND ef.situacao = 'pago'::situacao_financeiro), 0::numeric) AS pago,
            COALESCE(( SELECT sum(ef.valor_usd) AS sum
                   FROM execucao_financeira ef
                  WHERE ef.atividade_id = a.id AND ef.situacao = 'a_pagar'::situacao_financeiro), 0::numeric) AS apagar,
            COALESCE(( SELECT sum(ce.valor_liberado_usd) AS sum
                   FROM contrato_encerramentos ce
                  WHERE ce.atividade_id = a.id AND ce.status = 'ativo'::text), 0::numeric) AS lib,
            COALESCE(( SELECT sum(cc.delta_usd) AS sum
                   FROM contrato_coberturas cc
                  WHERE cc.atividade_id = a.id), 0::numeric) AS exc) x;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_tarefa_progresso AS
 SELECT tarefa_id,
    count(*)::integer AS total,
    count(*) FILTER (WHERE concluida)::integer AS feitas,
    round(100.0 * count(*) FILTER (WHERE concluida)::numeric / NULLIF(count(*), 0)::numeric)::integer AS pct
   FROM tarefa_checklist
  GROUP BY tarefa_id;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_tdr_cancelamento_assinaturas AS
 SELECT a.id,
    a.cancelamento_id,
    a.etapa_id,
    e.ordem AS etapa_ordem,
    e.papel,
    a.versao,
    a.usuario_id,
    u.nome_completo,
    a.cargo,
    a.decisao,
    a.motivo,
    a.hash_documento,
    a.criado_em,
    a.invalidada_em,
    a.invalidada_motivo
   FROM tdr_cancelamento_assinaturas a
     JOIN tdr_cancelamento_etapas e ON e.id = a.etapa_id
     JOIN usuarios u ON u.id = a.usuario_id;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_tdr_execucao_direta AS
 SELECT t.id AS tdr_id,
    t.numero AS tdr_numero,
    t.objeto_pt,
    t.atividade_id,
    a.codigo AS atividade_codigo,
    COALESCE(t.valor_usd, 0::numeric)::numeric(14,2) AS planejado_usd,
    COALESCE(t.valor_brl, 0::numeric)::numeric(14,2) AS planejado_brl,
    COALESCE(c.consumido_usd, 0::numeric)::numeric(14,2) AS consumido_usd,
    COALESCE(c.pago_usd, 0::numeric)::numeric(14,2) AS pago_usd,
    COALESCE(c.a_pagar_usd, 0::numeric)::numeric(14,2) AS a_pagar_usd,
    COALESCE(c.consumido_brl, 0::numeric)::numeric(14,2) AS consumido_brl,
    (COALESCE(t.valor_usd, 0::numeric) - COALESCE(c.consumido_usd, 0::numeric))::numeric(14,2) AS resta_usd,
    round(COALESCE(c.consumido_usd, 0::numeric) / NULLIF(t.valor_usd, 0::numeric) * 100::numeric, 1) AS pct_consumido
   FROM tdrs t
     JOIN atividades a ON a.id = t.atividade_id
     LEFT JOIN LATERAL ( SELECT sum(ef.valor_usd) AS consumido_usd,
            sum(ef.valor_usd) FILTER (WHERE ef.situacao = 'pago'::situacao_financeiro) AS pago_usd,
            sum(ef.valor_usd) FILTER (WHERE ef.situacao = 'a_pagar'::situacao_financeiro) AS a_pagar_usd,
            sum(ef.valor_brl) AS consumido_brl
           FROM execucao_financeira ef
          WHERE ef.tdr_id = t.id AND ef.contrato_id IS NULL AND ef.situacao <> 'cancelado'::situacao_financeiro) c ON true
  WHERE t.execucao_direta AND t.status <> 'cancelado'::status_tdr;

-- nivel 0
CREATE OR REPLACE VIEW public.vw_viagens_execucao AS
 SELECT vv.id AS viajante_id,
    vv.nome AS viajante,
    vv.beneficiario_id,
    p.id AS protocolo_id,
    p.numero AS protocolo,
    p.situacao AS protocolo_situacao,
    p.dt_saida,
    p.dt_retorno,
    p.destino_principal,
    p.atividade_id,
    a.codigo AS atividade_codigo,
    COALESCE(ef.tdr_id, fn_viagem_tdr(p.atividade_id)) AS tdr_id,
    t.numero AS tdr_numero,
    pas.brl AS passagens_brl,
    dia.brl AS diarias_brl,
    pas.brl + dia.brl AS total_brl,
    ef.id AS lancamento_id,
    ef.situacao AS lancamento_situacao,
    ef.dt_vencimento,
    ef.dt_pagamento,
    ef.valor_brl AS lancamento_brl,
    ef.cotacao_unesco,
    COALESCE(ef.valor_usd_unesco, ef.valor_usd) AS usd,
    ef.id IS NOT NULL AND ef.valor_usd_unesco IS NULL AS usd_estimado,
    round(COALESCE(ef.valor_usd_unesco, ef.valor_usd) * pas.brl / NULLIF(pas.brl + dia.brl, 0::numeric), 2) AS passagens_usd,
    COALESCE(ef.valor_usd_unesco, ef.valor_usd) - round(COALESCE(ef.valor_usd_unesco, ef.valor_usd) * pas.brl / NULLIF(pas.brl + dia.brl, 0::numeric), 2) AS diarias_usd
   FROM viagem_viajantes vv
     JOIN viagem_protocolos p ON p.id = vv.protocolo_id
     LEFT JOIN atividades a ON a.id = p.atividade_id
     LEFT JOIN execucao_financeira ef ON ef.id = vv.lancamento_id
     LEFT JOIN tdrs t ON t.id = COALESCE(ef.tdr_id, fn_viagem_tdr(p.atividade_id))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(x.valor), 0::numeric)::numeric(14,2) AS brl
           FROM viagem_trechos x
          WHERE x.viajante_id = vv.id) pas ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(x.quantidade * x.valor_unitario), 0::numeric)::numeric(14,2) AS brl
           FROM viagem_diarias_v2 x
          WHERE x.viajante_id = vv.id) dia ON true;

-- nivel 1
CREATE OR REPLACE VIEW public.vw_acervo_midias AS
 WITH brutas AS (
         SELECT 'documento:'::text || ed.id::text AS midia_id,
            'entrega_documento'::text AS origem,
            e_1.produto_id AS obra_id,
            ed.entrega_id,
            ed.tipo_documento::text AS rotulo,
            ed.arquivo_url,
            ed.arquivo_nome,
            ed.arquivo_tamanho,
            COALESCE(ed.inserido_em, e_1.criado_em) AS adicionado_em,
            ed.inserido_por AS adicionado_por
           FROM entrega_documentos ed
             JOIN contratos_produtos_entregas e_1 ON e_1.id = ed.entrega_id
          WHERE ed.arquivo_url IS NOT NULL
        UNION ALL
         SELECT 'entrega:'::text || e_1.id::text,
            'entrega_arquivo'::text,
            e_1.produto_id,
            e_1.id,
            'Produto entregue'::text,
            e_1.arquivo_url,
            COALESCE(e_1.arquivo_nome, 'Produto entregue'::text) AS "coalesce",
            NULL::bigint AS int8,
            COALESCE(e_1.arquivo_data, e_1.criado_em) AS "coalesce",
            e_1.criado_por
           FROM contratos_produtos_entregas e_1
          WHERE e_1.arquivo_url IS NOT NULL
        UNION ALL
         SELECT 'nota:'::text || e_1.id::text,
            'nota_tecnica'::text,
            e_1.produto_id,
            e_1.id,
            'Nota Técnica'::text,
            e_1.nota_tecnica_url,
            COALESCE(e_1.nota_tecnica_nome, 'Nota Técnica'::text) AS "coalesce",
            NULL::bigint AS int8,
            COALESCE(e_1.nota_tecnica_data, e_1.criado_em) AS "coalesce",
            e_1.despachado_por
           FROM contratos_produtos_entregas e_1
          WHERE e_1.nota_tecnica_url IS NOT NULL
        UNION ALL
         SELECT (('foto:'::text || e_1.id::text) || ':'::text) || u.ord::text,
            'foto_evidencia'::text,
            e_1.produto_id,
            e_1.id,
            'Registro fotográfico'::text,
            u.url,
            COALESCE(e_1.fotos_nomes[u.ord], 'Foto '::text || u.ord::text) AS "coalesce",
            NULL::bigint AS int8,
            COALESCE(e_1.arquivo_data, e_1.criado_em) AS "coalesce",
            e_1.criado_por
           FROM contratos_produtos_entregas e_1
             CROSS JOIN LATERAL unnest(e_1.fotos_urls) WITH ORDINALITY u(url, ord)
          WHERE e_1.fotos_urls IS NOT NULL AND u.url IS NOT NULL
        UNION ALL
         SELECT 'produto:'::text || cp_1.id::text,
            'produto_arquivo'::text,
            cp_1.id,
            NULL::uuid AS uuid,
            'Produto entregue'::text,
            cp_1.arquivo_entrega_url,
            COALESCE(cp_1.arquivo_entrega_nome, 'Produto entregue'::text) AS "coalesce",
            NULL::bigint AS int8,
            COALESCE(cp_1.arquivo_entrega_data, cp_1.criado_em) AS "coalesce",
            cp_1.criado_por
           FROM contratos_produtos cp_1
          WHERE cp_1.arquivo_entrega_url IS NOT NULL
        ), classificadas AS (
         SELECT b.midia_id,
            b.origem,
            b.obra_id,
            b.entrega_id,
            b.rotulo,
            b.arquivo_url,
            b.arquivo_nome,
            b.arquivo_tamanho,
            b.adicionado_em,
            b.adicionado_por,
                CASE
                    WHEN b.origem = 'nota_tecnica'::text THEN 'instrucao'::text
                    WHEN b.rotulo = ANY (ARRAY['Comprovante de Pagamento'::text, 'Contrato / Aditivo'::text]) THEN 'instrucao'::text
                    ELSE 'produto'::text
                END AS classe
           FROM brutas b
        )
 SELECT c.midia_id,
    c.origem,
    c.obra_id,
    c.entrega_id,
    c.rotulo,
    c.arquivo_url,
    c.arquivo_nome,
    c.arquivo_tamanho,
    c.adicionado_em,
    c.adicionado_por,
    c.classe,
    fn_acervo_extensao(c.arquivo_nome, c.arquivo_url) AS extensao,
    fn_acervo_tipo_midia(c.arquivo_nome, c.arquivo_url) AS midia_tipo,
        CASE
            WHEN c.classe = 'instrucao'::text THEN 'instrucao'::text
            WHEN c.entrega_id IS NULL THEN 'vigente'::text
            WHEN c.entrega_id = ref.entrega_id THEN 'vigente'::text
            ELSE 'superada'::text
        END AS versao_status,
    e.numero_entrega,
    e.situacao AS entrega_situacao,
    e.tipo_decisao AS entrega_decisao,
    e.despacho_numero,
    e.dt_entrega AS entrega_data,
    cp.contrato_id,
    cont.atividade_id
   FROM classificadas c
     LEFT JOIN contratos_produtos_entregas e ON e.id = c.entrega_id
     JOIN contratos_produtos cp ON cp.id = c.obra_id
     JOIN contratos cont ON cont.id = cp.contrato_id
     LEFT JOIN vw_acervo_entrega_ref ref ON ref.produto_id = c.obra_id;

-- nivel 1
CREATE OR REPLACE VIEW public.vw_diag_indicadores AS
 WITH por_ficha AS (
         SELECT DISTINCT vw_diag_respostas.ficha_id,
            vw_diag_respostas.questionario_id,
            vw_diag_respostas.chave,
            vw_diag_respostas.n,
            vw_diag_respostas.tipo,
            vw_diag_respostas.validada,
            vw_diag_respostas.municipio_ibge,
            vw_diag_respostas.comunidade_chave,
            vw_diag_respostas.comunidade_nome,
            vw_diag_respostas.sexo_respondente,
            vw_diag_respostas.nr,
            vw_diag_respostas.valor_num
           FROM vw_diag_respostas
        )
 SELECT 'base'::text AS tipo_linha,
    por_ficha.questionario_id,
    por_ficha.chave,
    por_ficha.n,
    por_ficha.tipo,
    NULL::text AS opcao,
    por_ficha.validada,
    por_ficha.municipio_ibge,
    por_ficha.comunidade_chave,
    max(por_ficha.comunidade_nome) AS comunidade_nome,
    por_ficha.sexo_respondente,
    count(*) FILTER (WHERE NOT por_ficha.nr) AS n_fichas,
    count(*) FILTER (WHERE por_ficha.nr) AS n_nr,
    sum(por_ficha.valor_num) FILTER (WHERE NOT por_ficha.nr) AS soma
   FROM por_ficha
  GROUP BY por_ficha.questionario_id, por_ficha.chave, por_ficha.n, por_ficha.tipo, por_ficha.validada, por_ficha.municipio_ibge, por_ficha.comunidade_chave, por_ficha.sexo_respondente
UNION ALL
 SELECT 'opcao'::text AS tipo_linha,
    vw_diag_respostas.questionario_id,
    vw_diag_respostas.chave,
    vw_diag_respostas.n,
    vw_diag_respostas.tipo,
    vw_diag_respostas.opcao,
    vw_diag_respostas.validada,
    vw_diag_respostas.municipio_ibge,
    vw_diag_respostas.comunidade_chave,
    max(vw_diag_respostas.comunidade_nome) AS comunidade_nome,
    vw_diag_respostas.sexo_respondente,
    count(DISTINCT vw_diag_respostas.ficha_id) AS n_fichas,
    0 AS n_nr,
    NULL::numeric AS soma
   FROM vw_diag_respostas
  WHERE vw_diag_respostas.opcao IS NOT NULL
  GROUP BY vw_diag_respostas.questionario_id, vw_diag_respostas.chave, vw_diag_respostas.n, vw_diag_respostas.tipo, vw_diag_respostas.opcao, vw_diag_respostas.validada, vw_diag_respostas.municipio_ibge, vw_diag_respostas.comunidade_chave, vw_diag_respostas.sexo_respondente;

-- nivel 1
CREATE OR REPLACE VIEW public.vw_orcamento_fontes_saldo AS
 WITH cred AS (
         SELECT f.id,
            f.atividade_id,
            f.tipo,
            f.orcamentaria,
            f.valor_usd,
            f.valor_brl_ref,
            f.cotacao,
            f.ajusta_fonte_id,
            f.estorno_de,
            f.fonte_origem_id,
            f.encerramento_id,
            f.remanejamento_id,
            f.descricao,
            f.criado_por,
            f.criado_em,
            (f.valor_usd + COALESCE(( SELECT sum(j.valor_usd) AS sum
                   FROM orcamento_fontes j
                  WHERE j.ajusta_fonte_id = f.id), 0::numeric))::numeric(14,2) AS liquido_usd,
            f.tipo <> 'dotacao_original'::text AS ordem_tipo
           FROM orcamento_fontes f
          WHERE f.ajusta_fonte_id IS NULL
        ), ord AS (
         SELECT c.id,
            c.atividade_id,
            c.tipo,
            c.orcamentaria,
            c.valor_usd,
            c.valor_brl_ref,
            c.cotacao,
            c.ajusta_fonte_id,
            c.estorno_de,
            c.fonte_origem_id,
            c.encerramento_id,
            c.remanejamento_id,
            c.descricao,
            c.criado_por,
            c.criado_em,
            c.liquido_usd,
            c.ordem_tipo,
            d.debito_usd,
            COALESCE(sum(c.liquido_usd) OVER (PARTITION BY c.atividade_id ORDER BY c.ordem_tipo, c.criado_em, c.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0::numeric) AS acumulado_antes_usd,
            row_number() OVER (PARTITION BY c.atividade_id ORDER BY c.ordem_tipo, c.criado_em, c.id) AS ordem_consumo
           FROM cred c
             JOIN vw_orcamento_debitos d ON d.atividade_id = c.atividade_id
        ), calc AS (
         SELECT o_1.id,
            o_1.atividade_id,
            o_1.tipo,
            o_1.orcamentaria,
            o_1.valor_usd,
            o_1.valor_brl_ref,
            o_1.cotacao,
            o_1.ajusta_fonte_id,
            o_1.estorno_de,
            o_1.fonte_origem_id,
            o_1.encerramento_id,
            o_1.remanejamento_id,
            o_1.descricao,
            o_1.criado_por,
            o_1.criado_em,
            o_1.liquido_usd,
            o_1.ordem_tipo,
            o_1.debito_usd,
            o_1.acumulado_antes_usd,
            o_1.ordem_consumo,
            LEAST(o_1.liquido_usd, GREATEST(0::numeric, o_1.debito_usd - o_1.acumulado_antes_usd))::numeric(14,2) AS consumido_calc,
            COALESCE(( SELECT sum(rr.reservado_usd) AS sum
                   FROM vw_rem_reservas rr
                  WHERE rr.fonte_id = o_1.id), 0::numeric)::numeric(14,2) AS reservado_calc
           FROM ord o_1
        )
 SELECT o.id AS fonte_id,
    o.atividade_id,
    a.codigo AS atividade_codigo,
    a.resultado_id,
    o.tipo,
    o.descricao,
    o.criado_em,
    o.criado_por,
    o.ordem_consumo,
    o.valor_usd AS valor_original_usd,
    o.liquido_usd,
    o.consumido_calc AS consumido_usd,
    (o.liquido_usd - o.consumido_calc)::numeric(14,2) AS disponivel_usd,
    o.encerramento_id,
    ce.contrato_id,
    ct.numero AS contrato_numero,
    ce.tdr_id,
    td.numero AS tdr_numero,
    o.fonte_origem_id,
    o.remanejamento_id,
    o.reservado_calc AS reservado_usd,
    GREATEST(0::numeric, o.liquido_usd - o.consumido_calc - o.reservado_calc)::numeric(14,2) AS livre_usd
   FROM calc o
     JOIN atividades a ON a.id = o.atividade_id
     LEFT JOIN contrato_encerramentos ce ON ce.id = o.encerramento_id
     LEFT JOIN contratos ct ON ct.id = ce.contrato_id
     LEFT JOIN tdrs td ON td.id = ce.tdr_id;

-- nivel 2
CREATE OR REPLACE VIEW public.vw_acervo_obras AS
 SELECT cp.id AS obra_id,
    cp.numero_produto,
    cp.descricao AS titulo,
    cp.situacao AS situacao_produto,
    cp.observacoes,
    cp.valor_brl,
    cp.valor_aprovado,
    cp.pct_aprovado,
    cp.dt_vencimento,
    cp.dt_entrega,
    cp.parecer_avaliador,
    cp.total_entregas,
    cp.criado_em,
    cp.atualizado_em,
    c.id AS contrato_id,
    c.numero AS contrato_numero,
    c.objeto_pt AS contrato_objeto,
    c.status::text AS contrato_status,
    a.id AS atividade_id,
    a.codigo AS atividade_codigo,
    a.nome_pt AS atividade_nome,
    r.id AS resultado_id,
    r.codigo AS resultado_codigo,
    r.nome_pt AS resultado_nome,
    f.id AS fornecedor_id,
    f.nome AS fornecedor_nome,
    f.tipo AS fornecedor_tipo,
    ref.entrega_id AS entrega_ref_id,
    ref.numero_entrega AS entrega_ref_numero,
    ref.situacao AS entrega_ref_situacao,
    ref.tipo_decisao AS entrega_ref_decisao,
    ref.dt_entrega AS entrega_ref_data,
    ref.despacho_numero AS entrega_ref_despacho,
    COALESCE(ref.tipo_decisao = 'aprovacao_parcial'::text, false) AS aprovacao_parcial,
        CASE
            WHEN ref.entrega_id IS NULL THEN 'sem_entrega'::text
            WHEN ref.situacao = 'aprovada'::text THEN 'aprovado'::text
            WHEN ref.situacao = 'devolvida'::text THEN 'em_correcao'::text
            ELSE 'em_avaliacao'::text
        END AS situacao_acervo,
    COALESCE(m.total_midias, 0::bigint) AS total_midias,
    COALESCE(m.total_vigentes, 0::bigint) AS total_vigentes,
    COALESCE(m.total_superadas, 0::bigint) AS total_superadas,
    COALESCE(m.total_instrucao, 0::bigint) AS total_instrucao,
    COALESCE(m.tipos_midia, ARRAY[]::text[]) AS tipos_midia,
    COALESCE(m.rotulos_vigentes, ARRAY[]::text[]) AS rotulos_vigentes,
    COALESCE(m.rotulos_todos, ARRAY[]::text[]) AS rotulos_midia,
    m.publicado_em,
    COALESCE(m.publicado_em, cp.dt_entrega::timestamp with time zone, cp.criado_em) AS ordenacao_em,
    fonte.midia_id AS capa_midia_id,
    fonte.arquivo_url AS capa_fonte_url,
    cap.arquivo_url AS capa_url,
    cap.status AS capa_status
   FROM contratos_produtos cp
     JOIN contratos c ON c.id = cp.contrato_id
     LEFT JOIN atividades a ON a.id = c.atividade_id
     LEFT JOIN resultados r ON r.id = a.resultado_id
     LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
     LEFT JOIN vw_acervo_entrega_ref ref ON ref.produto_id = cp.id
     LEFT JOIN LATERAL ( SELECT count(*) AS total_midias,
            count(*) FILTER (WHERE vm.versao_status = 'vigente'::text) AS total_vigentes,
            count(*) FILTER (WHERE vm.versao_status = 'superada'::text) AS total_superadas,
            count(*) FILTER (WHERE vm.versao_status = 'instrucao'::text) AS total_instrucao,
            array_agg(DISTINCT vm.midia_tipo) FILTER (WHERE vm.versao_status = 'vigente'::text) AS tipos_midia,
            array_agg(DISTINCT vm.rotulo) FILTER (WHERE vm.versao_status = 'vigente'::text AND vm.rotulo IS NOT NULL) AS rotulos_vigentes,
            array_agg(DISTINCT vm.rotulo) FILTER (WHERE vm.rotulo IS NOT NULL) AS rotulos_todos,
            max(vm.adicionado_em) FILTER (WHERE vm.versao_status = 'vigente'::text) AS publicado_em
           FROM vw_acervo_midias vm
          WHERE vm.obra_id = cp.id) m ON true
     LEFT JOIN LATERAL ( SELECT vm.midia_id,
            vm.arquivo_url
           FROM vw_acervo_midias vm
          WHERE vm.obra_id = cp.id AND vm.versao_status = 'vigente'::text AND vm.extensao = 'pdf'::text
          ORDER BY vm.adicionado_em DESC
         LIMIT 1) fonte ON true
     LEFT JOIN acervo_capas cap ON cap.midia_id = fonte.midia_id;

-- nivel 2
CREATE OR REPLACE VIEW public.vw_acervo_publicacoes AS
 SELECT p.id,
    p.midia_id,
    p.obra_id,
    p.publico,
    p.marcado_por,
    p.marcado_em,
    p.desmarcado_por,
    p.desmarcado_em,
    m.versao_status,
    m.classe,
    m.origem,
    ref.situacao AS entrega_ref_situacao,
    COALESCE(p.publico AND m.versao_status = 'vigente'::text AND m.classe = 'produto'::text AND m.origem <> 'nota_tecnica'::text AND ref.situacao = 'aprovada'::text, false) AS valida
   FROM acervo_publicacoes p
     LEFT JOIN vw_acervo_midias m ON m.midia_id = p.midia_id
     LEFT JOIN vw_acervo_entrega_ref ref ON ref.produto_id = p.obra_id;

-- nivel 2
CREATE OR REPLACE VIEW public.vw_orcamento_atividade AS
 SELECT a.id AS atividade_id,
    a.codigo,
    a.nome_pt,
    a.resultado_id,
    a.orcamento_original_usd,
    a.orcamento_usd AS orcamento_vigente_usd,
    COALESCE(c.orcamentario, 0::numeric)::numeric(14,2) AS orcamento_razao_usd,
    COALESCE(c.liberado, 0::numeric)::numeric(14,2) AS liberado_usd,
    COALESCE(c.total, 0::numeric)::numeric(14,2) AS creditos_usd,
    d.tdr_planejado_usd,
    d.reserva_execucao_direta_usd,
    d.execucao_direta_realizada_usd,
    d.pagamentos_contrato_sem_tdr_usd,
    d.debito_usd,
    d.tdrs_sem_valor_usd,
    (COALESCE(c.total, 0::numeric) - d.debito_usd)::numeric(14,2) AS saldo_usd,
    COALESCE(s.disponivel, 0::numeric)::numeric(14,2) AS disponivel_fontes_usd,
    GREATEST(0::numeric, d.debito_usd - COALESCE(c.total, 0::numeric))::numeric(14,2) AS deficit_usd,
    round(v.saldo_livre_usd, 2) AS saldo_livre_painel_usd,
    COALESCE(s.reservado, 0::numeric)::numeric(14,2) AS reservado_usd,
    COALESCE(s.livre, 0::numeric)::numeric(14,2) AS remanejavel_usd,
    d.contratos_excedente_usd,
    COALESCE(k.n, 0::bigint)::integer AS contratos_aguardando,
    COALESCE(k.deficit, 0::numeric)::numeric(14,2) AS cobertura_pendente_usd
   FROM atividades a
     JOIN vw_orcamento_debitos d ON d.atividade_id = a.id
     LEFT JOIN vw_saldo_atividade v ON v.id = a.id
     LEFT JOIN LATERAL ( SELECT sum(f.valor_usd) FILTER (WHERE f.orcamentaria) AS orcamentario,
            sum(f.valor_usd) FILTER (WHERE NOT f.orcamentaria) AS liberado,
            sum(f.valor_usd) AS total
           FROM orcamento_fontes f
          WHERE f.atividade_id = a.id) c ON true
     LEFT JOIN LATERAL ( SELECT sum(fs.disponivel_usd) AS disponivel,
            sum(fs.reservado_usd) AS reservado,
            sum(fs.livre_usd) AS livre
           FROM vw_orcamento_fontes_saldo fs
          WHERE fs.atividade_id = a.id) s ON true
     LEFT JOIN LATERAL ( SELECT count(DISTINCT cc.contrato_id) AS n,
            sum(cc.deficit_usd) AS deficit
           FROM contrato_coberturas cc
          WHERE cc.atividade_id = a.id AND cc.situacao = 'aguardando'::text) k ON true;

-- ===== VIEWS: security_invoker =====
ALTER VIEW public.vw_acervo_entrega_ref SET (security_invoker = true);
ALTER VIEW public.vw_acervo_midias SET (security_invoker = true);
ALTER VIEW public.vw_acervo_obras SET (security_invoker = true);
ALTER VIEW public.vw_acervo_publicacoes SET (security_invoker = true);
ALTER VIEW public.vw_diag_indicadores SET (security_invoker = true);
ALTER VIEW public.vw_diag_respostas SET (security_invoker = true);
ALTER VIEW public.vw_matriz_progresso SET (security_invoker = true);
ALTER VIEW public.vw_pendencias_usuario SET (security_invoker = true);
ALTER VIEW public.vw_tarefa_progresso SET (security_invoker = true);
ALTER VIEW public.vw_viagens_execucao SET (security_invoker = true);

-- ===== TRIGGERS =====
CREATE TRIGGER trg_audit_acervo_publicacoes AFTER INSERT OR UPDATE ON public.acervo_publicacoes FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_sync_resp_id AFTER INSERT OR UPDATE ON public.atividade_responsaveis FOR EACH ROW EXECUTE FUNCTION sync_atividade_responsavel_id();
CREATE TRIGGER trg_atividade_dotacao AFTER INSERT ON public.atividades FOR EACH ROW EXECUTE FUNCTION fn_trg_atividade_dotacao();
CREATE TRIGGER trg_atividade_guarda_orcamento BEFORE INSERT OR UPDATE ON public.atividades FOR EACH ROW EXECUTE FUNCTION fn_trg_atividade_guarda_orcamento();
CREATE TRIGGER trg_atividades_updated_at BEFORE UPDATE ON public.atividades FOR EACH ROW EXECUTE FUNCTION fn_updated_at();
CREATE TRIGGER trg_audit_atividades AFTER INSERT OR DELETE OR UPDATE ON public.atividades FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_auditoria_updated BEFORE UPDATE ON public.auditoria_registros FOR EACH ROW EXECUTE FUNCTION set_updated_em();
CREATE TRIGGER trg_audit_dados_bancarios AFTER INSERT OR DELETE OR UPDATE ON public.beneficiario_dados_bancarios FOR EACH ROW EXECUTE FUNCTION fn_trg_audit('redigir');
CREATE TRIGGER trg_audit_beneficiarios AFTER INSERT OR DELETE OR UPDATE ON public.beneficiarios FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_cob_imutavel BEFORE UPDATE ON public.contrato_coberturas FOR EACH ROW EXECUTE FUNCTION fn_trg_cob_imutavel();
CREATE TRIGGER trg_ced_imutavel BEFORE UPDATE ON public.contrato_encerramento_documentos FOR EACH ROW EXECUTE FUNCTION fn_trg_ced_imutavel();
CREATE TRIGGER trg_encp_guarda BEFORE UPDATE ON public.contrato_encerramento_pedidos FOR EACH ROW EXECUTE FUNCTION fn_trg_encp_guarda();
CREATE TRIGGER trg_encerramento_guarda BEFORE DELETE OR UPDATE ON public.contrato_encerramentos FOR EACH ROW EXECUTE FUNCTION fn_trg_encerramento_guarda();
CREATE TRIGGER trg_encerramento_ptax BEFORE INSERT ON public.contrato_encerramentos FOR EACH ROW EXECUTE FUNCTION fn_trg_encerramento_ptax();
CREATE TRIGGER trg_encerramento_razao AFTER INSERT OR UPDATE OF status ON public.contrato_encerramentos FOR EACH ROW EXECUTE FUNCTION fn_trg_encerramento_razao();
CREATE TRIGGER trg_encerramento_so_aprovado BEFORE INSERT ON public.contrato_encerramentos FOR EACH ROW EXECUTE FUNCTION fn_trg_encerramento_so_aprovado();
CREATE TRIGGER trg_encerramento_tarefa AFTER INSERT ON public.contrato_encerramentos FOR EACH ROW EXECUTE FUNCTION fn_trg_encerramento_tarefa();
CREATE TRIGGER trg_audit_contratos AFTER INSERT OR DELETE OR UPDATE ON public.contratos FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_contrato_auto_encerrar AFTER UPDATE OF valor_utilizado_brl ON public.contratos FOR EACH ROW WHEN (((new.status = 'vigente'::status_contrato) AND (new.valor_utilizado_brl IS DISTINCT FROM old.valor_utilizado_brl))) EXECUTE FUNCTION fn_trg_contrato_auto_encerrar();
CREATE TRIGGER trg_contrato_aviso_cobertura AFTER INSERT OR UPDATE OF status ON public.contratos FOR EACH ROW EXECUTE FUNCTION fn_trg_contrato_aviso_cobertura();
CREATE TRIGGER trg_contrato_cobertura BEFORE INSERT OR UPDATE ON public.contratos FOR EACH ROW EXECUTE FUNCTION fn_trg_contrato_cobertura();
CREATE TRIGGER trg_contrato_cobertura_pos AFTER UPDATE ON public.contratos FOR EACH ROW WHEN (((old.valor_total_brl IS DISTINCT FROM new.valor_total_brl) OR (old.tdr_id IS DISTINCT FROM new.tdr_id) OR (old.atividade_id IS DISTINCT FROM new.atividade_id) OR (old.status IS DISTINCT FROM new.status))) EXECUTE FUNCTION fn_trg_contrato_cobertura_pos();
CREATE TRIGGER trg_contrato_guarda_encerramento BEFORE UPDATE OF status ON public.contratos FOR EACH ROW EXECUTE FUNCTION fn_trg_contrato_guarda_encerramento();
CREATE TRIGGER trg_contrato_tdr_cancelamento BEFORE INSERT OR UPDATE ON public.contratos FOR EACH ROW EXECUTE FUNCTION fn_trg_contrato_tdr_cancelamento();
CREATE TRIGGER trg_contratos_updated_at BEFORE UPDATE ON public.contratos FOR EACH ROW EXECUTE FUNCTION fn_updated_at();
CREATE TRIGGER trg_cob_trava_produto BEFORE INSERT OR UPDATE ON public.contratos_produtos FOR EACH ROW EXECUTE FUNCTION fn_trg_cob_trava_execucao();
CREATE TRIGGER trg_cp_guarda_fornecedor BEFORE INSERT OR UPDATE ON public.contratos_produtos FOR EACH ROW EXECUTE FUNCTION fn_trg_cp_guarda_fornecedor();
CREATE TRIGGER trg_cp_guarda_situacao BEFORE INSERT OR UPDATE OF situacao ON public.contratos_produtos FOR EACH ROW EXECUTE FUNCTION fn_trg_cp_guarda_situacao();
CREATE TRIGGER trg_cp_updated BEFORE UPDATE ON public.contratos_produtos FOR EACH ROW EXECUTE FUNCTION trg_contratos_produtos_updated();
CREATE TRIGGER trg_produto_auto_encerrar AFTER UPDATE OF situacao ON public.contratos_produtos FOR EACH ROW WHEN (((new.situacao = 'pago'::text) AND (old.situacao IS DISTINCT FROM 'pago'::text))) EXECUTE FUNCTION fn_trg_contrato_auto_encerrar();
CREATE TRIGGER trg_travar_produto_pago BEFORE UPDATE ON public.contratos_produtos FOR EACH ROW EXECUTE FUNCTION fn_travar_produto_pago();
CREATE TRIGGER trg_validar_evidencia_produto BEFORE UPDATE ON public.contratos_produtos FOR EACH ROW WHEN (((new.situacao = ANY (ARRAY['em_analise'::text, 'aprovado'::text, 'entrega_parcial'::text])) AND (old.situacao IS DISTINCT FROM new.situacao))) EXECUTE FUNCTION fn_validar_evidencia_produto();
CREATE TRIGGER trg_atualizar_sit_produto AFTER INSERT OR DELETE OR UPDATE ON public.contratos_produtos_entregas FOR EACH ROW EXECUTE FUNCTION fn_atualizar_situacao_produto();
CREATE TRIGGER trg_entrega_exige_nota BEFORE INSERT OR UPDATE ON public.contratos_produtos_entregas FOR EACH ROW EXECUTE FUNCTION fn_trg_entrega_exige_nota();
CREATE TRIGGER trg_entrega_guarda_avaliacao BEFORE INSERT OR UPDATE ON public.contratos_produtos_entregas FOR EACH ROW EXECUTE FUNCTION fn_trg_entrega_guarda_avaliacao();
CREATE TRIGGER trg_gerar_lancamento_entrega BEFORE UPDATE ON public.contratos_produtos_entregas FOR EACH ROW EXECUTE FUNCTION fn_gerar_lancamento_entrega();
CREATE TRIGGER trg_notificar_avaliacao AFTER INSERT OR UPDATE ON public.contratos_produtos_entregas FOR EACH ROW EXECUTE FUNCTION fn_notificar_avaliacao_produto();
CREATE TRIGGER trg_notificar_despacho_produto AFTER UPDATE ON public.contratos_produtos_entregas FOR EACH ROW EXECUTE FUNCTION fn_notificar_despacho_produto();
CREATE TRIGGER trg_validar_evidencia_entrega BEFORE INSERT OR UPDATE ON public.contratos_produtos_entregas FOR EACH ROW WHEN ((new.situacao = ANY (ARRAY['em_analise'::text, 'aprovada'::text]))) EXECUTE FUNCTION fn_validar_evidencia_entrega();
CREATE TRIGGER trg_cotacoes_ptax_imutavel BEFORE DELETE OR UPDATE ON public.cotacoes_ptax FOR EACH ROW EXECUTE FUNCTION fn_trg_cotacoes_imutavel();
CREATE TRIGGER trg_audit_diag_audios AFTER INSERT OR DELETE OR UPDATE ON public.diag_audios FOR EACH ROW EXECUTE FUNCTION fn_trg_audit('redigir');
CREATE TRIGGER trg_diag_audio_expurgo AFTER DELETE ON public.diag_audios FOR EACH ROW EXECUTE FUNCTION fn_diag_audio_expurgo();
CREATE TRIGGER trg_diag_audios_bloqueio BEFORE INSERT OR UPDATE ON public.diag_audios FOR EACH ROW EXECUTE FUNCTION fn_diag_bloqueia_ident_apos_retencao();
CREATE TRIGGER trg_audit_diag_fichas AFTER INSERT OR DELETE OR UPDATE ON public.diag_fichas FOR EACH ROW EXECUTE FUNCTION fn_trg_audit('redigir');
CREATE TRIGGER trg_diag_audios_retencao AFTER UPDATE OF identificacao_apagada_em ON public.diag_fichas FOR EACH ROW WHEN (((old.identificacao_apagada_em IS NULL) AND (new.identificacao_apagada_em IS NOT NULL))) EXECUTE FUNCTION fn_diag_audios_retencao();
CREATE TRIGGER trg_diag_ficha_historico AFTER INSERT OR UPDATE ON public.diag_fichas FOR EACH ROW EXECUTE FUNCTION fn_diag_ficha_historico();
CREATE TRIGGER trg_diag_fichas_touch BEFORE UPDATE ON public.diag_fichas FOR EACH ROW EXECUTE FUNCTION fn_diag_touch();
CREATE TRIGGER trg_diag_valida_audios BEFORE UPDATE OF status ON public.diag_fichas FOR EACH ROW WHEN (((new.status = 'validada'::text) AND (old.status IS DISTINCT FROM 'validada'::text))) EXECUTE FUNCTION fn_diag_valida_audios();
CREATE TRIGGER trg_audit_diag_ident AFTER INSERT OR DELETE OR UPDATE ON public.diag_fichas_identificacao FOR EACH ROW EXECUTE FUNCTION fn_trg_audit('redigir');
CREATE TRIGGER trg_diag_ident_bloqueio BEFORE INSERT OR UPDATE ON public.diag_fichas_identificacao FOR EACH ROW EXECUTE FUNCTION fn_diag_bloqueia_ident_apos_retencao();
CREATE TRIGGER trg_audit_diag_fotos AFTER INSERT OR DELETE OR UPDATE ON public.diag_fotos FOR EACH ROW EXECUTE FUNCTION fn_trg_audit('redigir');
CREATE TRIGGER trg_diag_foto_expurgo AFTER DELETE ON public.diag_fotos FOR EACH ROW EXECUTE FUNCTION fn_diag_foto_expurgo();
CREATE TRIGGER trg_diag_fotos_bloqueio BEFORE INSERT OR UPDATE ON public.diag_fotos FOR EACH ROW EXECUTE FUNCTION fn_diag_bloqueia_ident_apos_retencao();
CREATE TRIGGER trg_audit_diag_mor_ident AFTER INSERT OR DELETE OR UPDATE ON public.diag_moradores_identificacao FOR EACH ROW EXECUTE FUNCTION fn_trg_audit('redigir');
CREATE TRIGGER trg_diag_mor_ident_bloqueio BEFORE INSERT OR UPDATE ON public.diag_moradores_identificacao FOR EACH ROW EXECUTE FUNCTION fn_diag_bloqueia_ident_apos_retencao();
CREATE TRIGGER trg_audit_diag_questionarios AFTER INSERT OR DELETE OR UPDATE ON public.diag_questionarios FOR EACH ROW EXECUTE FUNCTION fn_trg_audit('redigir');
CREATE TRIGGER trg_diag_questionario_guarda BEFORE DELETE OR UPDATE ON public.diag_questionarios FOR EACH ROW EXECUTE FUNCTION fn_diag_questionario_guarda();
CREATE TRIGGER trg_cob_trava_financeiro BEFORE INSERT OR UPDATE ON public.execucao_financeira FOR EACH ROW EXECUTE FUNCTION fn_trg_cob_trava_execucao();
CREATE TRIGGER trg_congelar_cotacao BEFORE UPDATE ON public.execucao_financeira FOR EACH ROW EXECUTE FUNCTION trg_congelar_cotacao();
CREATE TRIGGER trg_ef_aviso_tdr_direta AFTER INSERT OR UPDATE ON public.execucao_financeira FOR EACH ROW EXECUTE FUNCTION fn_trg_ef_aviso_tdr_direta();
CREATE TRIGGER trg_ef_limite_tdr_direta BEFORE INSERT OR UPDATE ON public.execucao_financeira FOR EACH ROW EXECUTE FUNCTION fn_trg_ef_limite_tdr_direta();
CREATE TRIGGER trg_ef_updated_at BEFORE UPDATE ON public.execucao_financeira FOR EACH ROW EXECUTE FUNCTION fn_updated_at();
CREATE TRIGGER trg_produto_pago_lancamento AFTER UPDATE ON public.execucao_financeira FOR EACH ROW EXECUTE FUNCTION fn_produto_pago_ao_pagar_lancamento();
CREATE TRIGGER trg_utilizado_contrato AFTER INSERT OR DELETE OR UPDATE ON public.execucao_financeira FOR EACH ROW EXECUTE FUNCTION fn_recalcular_utilizado_contrato();
CREATE TRIGGER trg_audit_fornecedor_dados_bancarios AFTER INSERT OR DELETE OR UPDATE ON public.fornecedor_dados_bancarios FOR EACH ROW EXECUTE FUNCTION fn_trg_audit('redigir');
CREATE TRIGGER trg_fdb_carimbo BEFORE INSERT OR UPDATE ON public.fornecedor_dados_bancarios FOR EACH ROW EXECUTE FUNCTION fn_trg_fdb_carimbo();
CREATE TRIGGER trg_audit_fornecedor_usuarios AFTER INSERT OR UPDATE ON public.fornecedor_usuarios FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_audit_fornecedores AFTER INSERT OR DELETE OR UPDATE ON public.fornecedores FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_fornecedor_sem_banco BEFORE INSERT OR UPDATE ON public.fornecedores FOR EACH ROW EXECUTE FUNCTION fn_trg_fornecedor_sem_banco();
CREATE TRIGGER trg_indicadores_updated_at BEFORE UPDATE ON public.indicadores FOR EACH ROW EXECUTE FUNCTION fn_updated_at();
CREATE TRIGGER trg_audit_lgpd_tratamentos AFTER INSERT OR DELETE OR UPDATE ON public.lgpd_tratamentos FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_lgpd_trat_touch BEFORE UPDATE ON public.lgpd_tratamentos FOR EACH ROW EXECUTE FUNCTION fn_lgpd_trat_touch();
CREATE TRIGGER trg_orcamento_eventos_imutavel BEFORE DELETE OR UPDATE ON public.orcamento_eventos FOR EACH ROW EXECUTE FUNCTION fn_trg_orcamento_fontes_imutavel();
CREATE TRIGGER trg_fonte_cobertura_pos AFTER INSERT ON public.orcamento_fontes FOR EACH ROW EXECUTE FUNCTION fn_trg_fonte_cobertura_pos();
CREATE TRIGGER trg_orcamento_fontes_cache AFTER INSERT ON public.orcamento_fontes FOR EACH ROW EXECUTE FUNCTION fn_trg_orcamento_fontes_cache();
CREATE TRIGGER trg_orcamento_fontes_imutavel BEFORE DELETE OR UPDATE ON public.orcamento_fontes FOR EACH ROW EXECUTE FUNCTION fn_trg_orcamento_fontes_imutavel();
CREATE TRIGGER trg_orcamento_fontes_valida BEFORE INSERT ON public.orcamento_fontes FOR EACH ROW EXECUTE FUNCTION fn_trg_orcamento_fontes_valida();
CREATE TRIGGER trg_audit_produto_matriz_contribuicao AFTER INSERT OR DELETE OR UPDATE ON public.produto_matriz_contribuicao FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_produto_aprovado BEFORE UPDATE ON public.produtos_entregues FOR EACH ROW EXECUTE FUNCTION fn_trg_produto_aprovado();
CREATE TRIGGER trg_pulso_ciclos_touch BEFORE UPDATE ON public.pulso_ciclos FOR EACH ROW EXECUTE FUNCTION fn_pulso_touch();
CREATE TRIGGER trg_audit_rem_cargo_titulares AFTER INSERT OR DELETE OR UPDATE ON public.rem_cargo_titulares FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_rem_titulares_guarda BEFORE DELETE OR UPDATE ON public.rem_cargo_titulares FOR EACH ROW EXECUTE FUNCTION fn_trg_rem_titulares_guarda();
CREATE TRIGGER trg_rem_alocacoes_rascunho BEFORE INSERT OR DELETE OR UPDATE ON public.remanejamento_alocacoes FOR EACH ROW EXECUTE FUNCTION fn_trg_rem_filhos_rascunho();
CREATE TRIGGER trg_rem_assinaturas_guarda BEFORE DELETE OR UPDATE ON public.remanejamento_assinaturas FOR EACH ROW EXECUTE FUNCTION fn_trg_rem_assinaturas_guarda();
CREATE TRIGGER trg_rem_etapas_guarda BEFORE DELETE OR UPDATE ON public.remanejamento_etapas FOR EACH ROW EXECUTE FUNCTION fn_trg_rem_etapas_guarda();
CREATE TRIGGER trg_rem_historico_imutavel BEFORE DELETE OR UPDATE ON public.remanejamento_historico FOR EACH ROW EXECUTE FUNCTION fn_trg_orcamento_fontes_imutavel();
CREATE TRIGGER trg_rem_itens_rascunho BEFORE INSERT OR DELETE OR UPDATE ON public.remanejamento_itens FOR EACH ROW EXECUTE FUNCTION fn_trg_rem_filhos_rascunho();
CREATE TRIGGER trg_rem_cobertura_pos AFTER UPDATE ON public.remanejamentos FOR EACH ROW WHEN (((old.status = 'em_aprovacao'::text) AND (new.status = ANY (ARRAY['recusado'::text, 'cancelado'::text, 'rascunho'::text])))) EXECUTE FUNCTION fn_trg_rem_cobertura_pos();
CREATE TRIGGER trg_rem_pedido_guarda BEFORE DELETE OR UPDATE ON public.remanejamentos FOR EACH ROW EXECUTE FUNCTION fn_trg_rem_pedido_guarda();
CREATE TRIGGER trg_rem_rascunho_aviso AFTER INSERT OR UPDATE ON public.remanejamentos FOR EACH ROW EXECUTE FUNCTION fn_rascunho_avisar_titular();
CREATE TRIGGER trg_notif_sol_senha AFTER INSERT ON public.solicitacoes_senha FOR EACH ROW EXECUTE FUNCTION fn_notificar_solicitacao_senha();
CREATE TRIGGER trg_tarefa_anexo_coerente BEFORE INSERT OR UPDATE ON public.tarefa_anexos FOR EACH ROW EXECUTE FUNCTION fn_tarefa_anexo_coerente();
CREATE TRIGGER trg_tarefa_anexo_historico AFTER INSERT OR DELETE ON public.tarefa_anexos FOR EACH ROW EXECUTE FUNCTION fn_tarefa_anexo_historico();
CREATE TRIGGER trg_checklist_responsavel AFTER INSERT OR UPDATE OF responsavel_usuario_id, responsavel_fornecedor_id ON public.tarefa_checklist FOR EACH ROW EXECUTE FUNCTION fn_tarefa_checklist_responsavel();
CREATE TRIGGER trg_tarefa_checklist_historico AFTER INSERT OR DELETE OR UPDATE ON public.tarefa_checklist FOR EACH ROW EXECUTE FUNCTION fn_tarefa_checklist_historico();
CREATE TRIGGER trg_tarefa_tdr_coerente BEFORE INSERT OR UPDATE ON public.tarefa_tdrs FOR EACH ROW EXECUTE FUNCTION fn_tarefa_tdr_coerente();
CREATE TRIGGER trg_tarefa_tdr_historico AFTER INSERT OR DELETE ON public.tarefa_tdrs FOR EACH ROW EXECUTE FUNCTION fn_tarefa_tdr_historico();
CREATE TRIGGER trg_tarefa_tipo_guarda BEFORE UPDATE ON public.tarefa_tipos FOR EACH ROW EXECUTE FUNCTION fn_tarefa_tipo_guarda();
CREATE TRIGGER trg_tarefa_atividade_limpa_tdrs AFTER UPDATE OF atividade_id ON public.tarefas FOR EACH ROW EXECUTE FUNCTION fn_tarefa_atividade_limpa_tdrs();
CREATE TRIGGER trg_tarefa_codigo BEFORE INSERT ON public.tarefas FOR EACH ROW EXECUTE FUNCTION fn_tarefa_set_codigo();
CREATE TRIGGER trg_tarefa_guarda_restrita BEFORE UPDATE OF restrita ON public.tarefas FOR EACH ROW EXECUTE FUNCTION fn_tarefa_guarda_restrita();
CREATE TRIGGER trg_tarefa_guarda_status BEFORE UPDATE OF status ON public.tarefas FOR EACH ROW EXECUTE FUNCTION fn_tarefa_guarda_status();
CREATE TRIGGER trg_tarefa_registra_edicao AFTER UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION fn_tarefa_registra_edicao();
CREATE TRIGGER trg_tarefa_tipo_historico AFTER UPDATE OF tipo ON public.tarefas FOR EACH ROW EXECUTE FUNCTION fn_tarefa_tipo_historico();
CREATE TRIGGER trg_tarefa_touch BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION fn_tarefa_touch();
CREATE TRIGGER trg_tarefa_valida_tipo BEFORE INSERT OR UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION fn_tarefa_valida_tipo();
CREATE TRIGGER trg_tcan_assinaturas_guarda BEFORE UPDATE ON public.tdr_cancelamento_assinaturas FOR EACH ROW EXECUTE FUNCTION fn_trg_tcan_assinaturas_guarda();
CREATE TRIGGER trg_tcan_etapas_guarda BEFORE UPDATE ON public.tdr_cancelamento_etapas FOR EACH ROW EXECUTE FUNCTION fn_trg_tcan_etapas_guarda();
CREATE TRIGGER trg_tcan_historico_imutavel BEFORE UPDATE ON public.tdr_cancelamento_historico FOR EACH ROW EXECUTE FUNCTION fn_trg_tcan_imutavel();
CREATE TRIGGER trg_tcan_pedido_guarda BEFORE UPDATE ON public.tdr_cancelamentos FOR EACH ROW EXECUTE FUNCTION fn_trg_tcan_pedido_guarda();
CREATE TRIGGER trg_tcan_rascunho_aviso AFTER INSERT OR UPDATE ON public.tdr_cancelamentos FOR EACH ROW EXECUTE FUNCTION fn_rascunho_avisar_titular();
CREATE TRIGGER trg_audit_lic_empresas AFTER INSERT OR UPDATE ON public.tdr_licitacao_empresas FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_tdr_licitacoes_imutavel BEFORE UPDATE ON public.tdr_licitacoes FOR EACH ROW EXECUTE FUNCTION fn_trg_tcan_imutavel();
CREATE TRIGGER trg_tdr_cobertura_pos AFTER UPDATE ON public.tdrs FOR EACH ROW WHEN (((old.valor_brl IS DISTINCT FROM new.valor_brl) OR (old.valor_usd IS DISTINCT FROM new.valor_usd) OR (old.status IS DISTINCT FROM new.status))) EXECUTE FUNCTION fn_trg_tdr_cobertura_pos();
CREATE TRIGGER trg_tdr_evento_orcamento AFTER INSERT OR DELETE OR UPDATE ON public.tdrs FOR EACH ROW EXECUTE FUNCTION fn_trg_tdr_evento_orcamento();
CREATE TRIGGER trg_tdr_exige_valor BEFORE INSERT OR UPDATE OF valor_brl, valor_usd, status ON public.tdrs FOR EACH ROW EXECUTE FUNCTION fn_trg_tdr_exige_valor();
CREATE TRIGGER trg_tdr_guarda_cancelamento BEFORE UPDATE ON public.tdrs FOR EACH ROW EXECUTE FUNCTION fn_trg_tdr_guarda_cancelamento();
CREATE TRIGGER trg_tdr_guarda_licitacao BEFORE UPDATE OF status ON public.tdrs FOR EACH ROW EXECUTE FUNCTION fn_trg_tdr_guarda_licitacao();
CREATE TRIGGER trg_tdr_licitacao_fase AFTER UPDATE OF status ON public.tdrs FOR EACH ROW EXECUTE FUNCTION fn_trg_tdr_licitacao_fase();
CREATE TRIGGER trg_tdr_numero BEFORE INSERT ON public.tdrs FOR EACH ROW EXECUTE FUNCTION fn_trg_numero_tdr();
CREATE TRIGGER trg_tdr_saldo BEFORE INSERT OR UPDATE ON public.tdrs FOR EACH ROW EXECUTE FUNCTION fn_trg_verificar_saldo();
CREATE TRIGGER trg_tdr_versionar BEFORE UPDATE ON public.tdrs FOR EACH ROW EXECUTE FUNCTION fn_trg_versionar_tdr();
CREATE TRIGGER trg_tdrs_updated_at BEFORE UPDATE ON public.tdrs FOR EACH ROW EXECUTE FUNCTION fn_updated_at();
CREATE TRIGGER trg_audit_usuario_permissoes AFTER INSERT OR DELETE OR UPDATE ON public.usuario_permissoes FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_audit_usuarios AFTER INSERT OR DELETE OR UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_protege_campos_usuario BEFORE INSERT OR UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_protege_campos_usuario();
CREATE TRIGGER trg_usuario_ban AFTER UPDATE OF ativo ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_trg_usuario_ban();
CREATE TRIGGER trg_usuarios_updated_at BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_updated_at();
CREATE TRIGGER trg_audit_viagem_protocolos AFTER INSERT OR DELETE OR UPDATE ON public.viagem_protocolos FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_notif_protocolo AFTER INSERT ON public.viagem_protocolos FOR EACH ROW EXECUTE FUNCTION fn_notificar_protocolo_criado();
CREATE TRIGGER trg_notif_protocolo_situacao AFTER UPDATE OF situacao ON public.viagem_protocolos FOR EACH ROW EXECUTE FUNCTION fn_notificar_protocolo_situacao();
CREATE TRIGGER trg_numero_protocolo BEFORE INSERT ON public.viagem_protocolos FOR EACH ROW EXECUTE FUNCTION fn_gerar_numero_protocolo();
CREATE TRIGGER trg_realizar_protocolo AFTER UPDATE ON public.viagem_protocolos FOR EACH ROW EXECUTE FUNCTION fn_realizar_protocolo();
CREATE TRIGGER trg_viagem_guarda_decisao BEFORE INSERT OR UPDATE ON public.viagem_protocolos FOR EACH ROW EXECUTE FUNCTION fn_trg_viagem_guarda_decisao();
CREATE TRIGGER trg_audit_viagem_viajantes AFTER INSERT OR DELETE OR UPDATE ON public.viagem_viajantes FOR EACH ROW EXECUTE FUNCTION fn_trg_audit();
CREATE TRIGGER trg_financeiro_viajante BEFORE UPDATE ON public.viagem_viajantes FOR EACH ROW EXECUTE FUNCTION fn_financeiro_viajante();
CREATE TRIGGER trg_viagem_lanc_tdr_ins AFTER INSERT ON public.viagem_viajantes FOR EACH ROW WHEN ((new.lancamento_id IS NOT NULL)) EXECUTE FUNCTION fn_trg_viagem_lanc_tdr();
CREATE TRIGGER trg_viagem_lanc_tdr_upd AFTER UPDATE ON public.viagem_viajantes FOR EACH ROW WHEN ((new.lancamento_id IS DISTINCT FROM old.lancamento_id)) EXECUTE FUNCTION fn_trg_viagem_lanc_tdr();
CREATE TRIGGER trg_viagem_viaj_guarda BEFORE INSERT OR UPDATE ON public.viagem_viajantes FOR EACH ROW EXECUTE FUNCTION fn_trg_viagem_viaj_guarda();
CREATE TRIGGER trg_lancar_viagem BEFORE UPDATE ON public.viagens_diarias FOR EACH ROW EXECUTE FUNCTION fn_lancar_viagem_financeiro();
CREATE TRIGGER trg_notif_viagem AFTER INSERT ON public.viagens_diarias FOR EACH ROW EXECUTE FUNCTION fn_notificar_viagem_solicitada();

-- ===== RULES (logs imutaveis; por ultimo) =====
CREATE RULE tdr_acoes_no_delete AS
    ON DELETE TO public.tdr_acoes DO INSTEAD NOTHING;
CREATE RULE tdr_acoes_no_update AS
    ON UPDATE TO public.tdr_acoes DO INSTEAD NOTHING;
-- ===== ROW LEVEL SECURITY =====
-- Policies reproduzidas exatamente como estão em produção.
ALTER TABLE public.acervo_capas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acervo_publicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agente_analises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apa_demarcacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_acessos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_pedido_notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atividade_indicador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atividade_matriz ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atividade_responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficiario_dados_bancarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficiarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_dados_locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_marcados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobertura_notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_coberturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_encerramento_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_encerramento_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_encerramentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_produtos_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacoes_ptax ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacoes_usd ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despachos_seq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_audios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_comunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_exportacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_expurgo_arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_fichas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_fichas_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_fichas_identificacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_localidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_moradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_moradores_identificacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_municipios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_questionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_sugestoes_ocultas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrega_aprovacao_senhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrega_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execucao_financeira ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedor_dados_bancarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedor_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geometria_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_indicadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indicador_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indicadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_tratamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapa_pontos_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matriz_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas_km_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nota_tecnica_calibracao_chaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nota_tecnica_conferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ods_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_fontes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passagens_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prestacao_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_entregue_indicador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_evidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_indicador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_matriz_contribuicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_notif_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_pontos_mapa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_entregues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulso_ciclos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulso_espelho ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulso_espelho_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulso_exportacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulso_participacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulso_respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulso_respostas_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rem_cargo_titulares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rem_cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rem_numeracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rem_tentativas_senha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remanejamento_alocacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remanejamento_assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remanejamento_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remanejamento_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remanejamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remanejamento_notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remanejamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositorio_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resultados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riscos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.senha_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_senha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_tdrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_acoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_canc_numeracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_cancelamento_assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_cancelamento_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_cancelamento_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_cancelamento_notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_cancelamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_confirmacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_licitacao_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_licitacao_prorrogacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_licitacao_rodadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_licitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_produtos_previstos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdr_versoes_editor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tdrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trilha_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_senha_temporaria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagem_decisoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagem_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagem_diarias_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagem_notif_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagem_passagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagem_protocolo_seq_ano ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagem_protocolos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagem_trechos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagem_viajantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagens_diarias ENABLE ROW LEVEL SECURITY;

-- ===== POLICIES =====
CREATE POLICY acervo_capas_delete ON public.acervo_capas AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))))));
CREATE POLICY acervo_capas_insert ON public.acervo_capas AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY acervo_capas_select ON public.acervo_capas AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY acervo_capas_update ON public.acervo_capas AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY acervo_publicacoes_select ON public.acervo_publicacoes AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM contratos_produtos cp
  WHERE (cp.id = acervo_publicacoes.obra_id))));
CREATE POLICY leitura_autenticados ON public.agente_analises AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "escrita super_admin" ON public.apa_demarcacoes AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = 'super_admin'::perfil_usuario)))));
CREATE POLICY "leitura autenticados" ON public.apa_demarcacoes AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY ai_select_all ON public.atividade_indicador AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY ai_write ON public.atividade_indicador AS PERMISSIVE FOR ALL TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'tecnico'::perfil_usuario])));
CREATE POLICY atv_mat_admin ON public.atividade_matriz AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'tecnico'::perfil_usuario])) AND (usuarios.ativo = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'tecnico'::perfil_usuario])) AND (usuarios.ativo = true)))));
CREATE POLICY atv_mat_select ON public.atividade_matriz AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY ativ_resp_delete ON public.atividade_responsaveis AS PERMISSIVE FOR DELETE TO authenticated USING ((fn_perfil_atual() = 'super_admin'::perfil_usuario));
CREATE POLICY ativ_resp_escrita ON public.atividade_responsaveis AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY ativ_resp_leitura ON public.atividade_responsaveis AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY ativ_resp_update ON public.atividade_responsaveis AS PERMISSIVE FOR UPDATE TO authenticated USING ((fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))) WITH CHECK ((fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY atividades_select_all ON public.atividades AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY atividades_write ON public.atividades AS PERMISSIVE FOR ALL TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'tecnico'::perfil_usuario])));
CREATE POLICY audit_select_admin ON public.audit_log AS PERMISSIVE FOR SELECT TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY execucoes_select ON public.auditoria_execucoes AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))))));
CREATE POLICY auditoria_select ON public.auditoria_registros AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))))));
CREATE POLICY auditoria_update ON public.auditoria_registros AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))))));
CREATE POLICY benef_banc_delete ON public.beneficiario_dados_bancarios AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = 'super_admin'::perfil_usuario));
CREATE POLICY benef_banc_insert ON public.beneficiario_dados_bancarios AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY benef_banc_select ON public.beneficiario_dados_bancarios AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY benef_banc_update ON public.beneficiario_dados_bancarios AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))) WITH CHECK ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY beneficiarios_insert ON public.beneficiarios AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY beneficiarios_select ON public.beneficiarios AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario, 'tecnico'::perfil_usuario])));
CREATE POLICY beneficiarios_update ON public.beneficiarios AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))) WITH CHECK ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY car_dados_select ON public.car_dados_locais AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY car_marcados_delete ON public.car_marcados AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY car_marcados_insert ON public.car_marcados AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY car_marcados_select ON public.car_marcados AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY car_marcados_update ON public.car_marcados AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY config_escrita_super_admin ON public.configuracoes_sistema AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = 'super_admin'::perfil_usuario))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = 'super_admin'::perfil_usuario)))));
CREATE POLICY config_leitura_publica ON public.configuracoes_sistema AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY cob_select ON public.contrato_coberturas AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM contratos c
  WHERE (c.id = contrato_coberturas.contrato_id))) OR (EXISTS ( SELECT 1
   FROM tdrs t
  WHERE (t.id = contrato_coberturas.tdr_id)))));
CREATE POLICY ced_select ON public.contrato_encerramento_documentos AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM contratos c
  WHERE (c.id = contrato_encerramento_documentos.contrato_id))));
CREATE POLICY encp_select ON public.contrato_encerramento_pedidos AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM contratos c
  WHERE (c.id = contrato_encerramento_pedidos.contrato_id))));
CREATE POLICY ce_readonly ON public.contrato_encerramentos AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY ce_write ON public.contrato_encerramentos AS PERMISSIVE FOR INSERT TO public WITH CHECK ((fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])));
CREATE POLICY contratos_select ON public.contratos AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])) AND (usuarios.ativo = true)))) OR tem_permissao('contratos'::text) OR (EXISTS ( SELECT 1
   FROM atividade_responsaveis ar
  WHERE ((ar.atividade_id = contratos.atividade_id) AND (ar.usuario_id = auth.uid()) AND (ar.ativo = true)))) OR fn_eh_fornecedor_vinculado(fornecedor_id)));
CREATE POLICY contratos_write ON public.contratos AS PERMISSIVE FOR ALL TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])));
CREATE POLICY cp_financeiro ON public.contratos_produtos AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.perfil = ANY (ARRAY['financeiro'::perfil_usuario, 'coordenacao'::perfil_usuario]))))));
CREATE POLICY cp_readonly ON public.contratos_produtos AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM contratos c
  WHERE (c.id = contratos_produtos.contrato_id))));
CREATE POLICY cp_registrar_entrega ON public.contratos_produtos AS PERMISSIVE FOR UPDATE TO authenticated USING (((situacao = ANY (ARRAY['pendente'::text, 'devolvido'::text, 'entrega_parcial'::text, 'em_analise'::text])) AND fn_pode_registrar_entrega(contrato_id))) WITH CHECK (((situacao = 'em_analise'::text) AND fn_pode_registrar_entrega(contrato_id)));
CREATE POLICY cp_super_admin ON public.contratos_produtos AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.perfil = 'super_admin'::perfil_usuario)))));
CREATE POLICY cpe_all ON public.contratos_produtos_entregas AS PERMISSIVE FOR ALL TO authenticated USING (fn_pode_avaliar_contrato(fn_contrato_da_entrega(produto_id, contrato_id))) WITH CHECK (fn_pode_avaliar_contrato(fn_contrato_da_entrega(produto_id, contrato_id)));
CREATE POLICY cpe_fornecedor ON public.contratos_produtos_entregas AS PERMISSIVE FOR ALL TO authenticated USING (((criado_por = auth.uid()) AND (situacao = 'pendente'::text) AND fn_pode_registrar_entrega(fn_contrato_da_entrega(produto_id, contrato_id)))) WITH CHECK (((criado_por = auth.uid()) AND (situacao = ANY (ARRAY['pendente'::text, 'em_analise'::text])) AND fn_pode_registrar_entrega(fn_contrato_da_entrega(produto_id, contrato_id))));
CREATE POLICY cpe_select ON public.contratos_produtos_entregas AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM contratos_produtos cp
  WHERE (cp.id = contratos_produtos_entregas.produto_id))) OR (EXISTS ( SELECT 1
   FROM contratos c
  WHERE (c.id = contratos_produtos_entregas.contrato_id)))));
CREATE POLICY cotacoes_ptax_select ON public.cotacoes_ptax AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
CREATE POLICY cotacoes_insert_admin ON public.cotacoes_usd AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = 'super_admin'::perfil_usuario));
CREATE POLICY cotacoes_select_all ON public.cotacoes_usd AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY ds_all ON public.despachos_seq AS PERMISSIVE FOR ALL TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY diag_audios_select ON public.diag_audios AS PERMISSIVE FOR SELECT TO authenticated USING (fn_diag_pode_ver_identificacao(ficha_id));
CREATE POLICY diag_comunidades_insert ON public.diag_comunidades AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (fn_diag_pode_gerir());
CREATE POLICY diag_comunidades_select ON public.diag_comunidades AS PERMISSIVE FOR SELECT TO authenticated USING (fn_diag_pode_ver_numeros());
CREATE POLICY diag_comunidades_update ON public.diag_comunidades AS PERMISSIVE FOR UPDATE TO authenticated USING (fn_diag_pode_gerir()) WITH CHECK (fn_diag_pode_gerir());
CREATE POLICY diag_exportacoes_select ON public.diag_exportacoes AS PERMISSIVE FOR SELECT TO authenticated USING (fn_diag_pode_gerir());
CREATE POLICY diag_expurgo_select ON public.diag_expurgo_arquivos AS PERMISSIVE FOR SELECT TO authenticated USING (fn_diag_pode_gerir());
CREATE POLICY diag_fichas_select ON public.diag_fichas AS PERMISSIVE FOR SELECT TO authenticated USING ((fn_diag_pode_gerir() OR fn_diag_pode_consultar() OR ((entrevistador_id = auth.uid()) AND fn_diag_pode_aplicar())));
CREATE POLICY diag_hist_select ON public.diag_fichas_historico AS PERMISSIVE FOR SELECT TO authenticated USING (fn_diag_pode_ver_ficha(ficha_id));
CREATE POLICY diag_ident_select ON public.diag_fichas_identificacao AS PERMISSIVE FOR SELECT TO authenticated USING (fn_diag_pode_ver_identificacao(ficha_id));
CREATE POLICY diag_fotos_delete ON public.diag_fotos AS PERMISSIVE FOR DELETE TO authenticated USING (fn_diag_pode_gerir());
CREATE POLICY diag_fotos_select ON public.diag_fotos AS PERMISSIVE FOR SELECT TO authenticated USING (fn_diag_pode_ver_identificacao(ficha_id));
CREATE POLICY diag_localidades_insert ON public.diag_localidades AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (fn_diag_pode_gerir());
CREATE POLICY diag_localidades_select ON public.diag_localidades AS PERMISSIVE FOR SELECT TO authenticated USING (fn_diag_pode_ver_numeros());
CREATE POLICY diag_localidades_update ON public.diag_localidades AS PERMISSIVE FOR UPDATE TO authenticated USING (fn_diag_pode_gerir()) WITH CHECK (fn_diag_pode_gerir());
CREATE POLICY diag_moradores_select ON public.diag_moradores AS PERMISSIVE FOR SELECT TO authenticated USING (fn_diag_pode_ver_ficha(ficha_id));
CREATE POLICY diag_mor_ident_select ON public.diag_moradores_identificacao AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM diag_moradores m
  WHERE ((m.id = diag_moradores_identificacao.morador_id) AND fn_diag_pode_ver_identificacao(m.ficha_id)))));
CREATE POLICY diag_municipios_select ON public.diag_municipios AS PERMISSIVE FOR SELECT TO authenticated USING (fn_diag_pode_ver_numeros());
CREATE POLICY diag_quest_delete ON public.diag_questionarios AS PERMISSIVE FOR DELETE TO authenticated USING ((fn_diag_pode_gerir() AND (status = 'rascunho'::text)));
CREATE POLICY diag_quest_insert ON public.diag_questionarios AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((fn_diag_pode_gerir() AND (status = 'rascunho'::text)));
CREATE POLICY diag_quest_select ON public.diag_questionarios AS PERMISSIVE FOR SELECT TO authenticated USING (fn_diag_pode_ver_numeros());
CREATE POLICY diag_quest_update ON public.diag_questionarios AS PERMISSIVE FOR UPDATE TO authenticated USING (fn_diag_pode_gerir()) WITH CHECK (fn_diag_pode_gerir());
CREATE POLICY diag_sug_ocultas_delete ON public.diag_sugestoes_ocultas AS PERMISSIVE FOR DELETE TO authenticated USING (fn_diag_pode_gerir());
CREATE POLICY diag_sug_ocultas_insert ON public.diag_sugestoes_ocultas AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (fn_diag_pode_gerir());
CREATE POLICY diag_sug_ocultas_select ON public.diag_sugestoes_ocultas AS PERMISSIVE FOR SELECT TO authenticated USING (fn_diag_pode_gerir());
CREATE POLICY ed_del ON public.entrega_documentos AS PERMISSIVE FOR DELETE TO authenticated USING (((inserido_por = auth.uid()) OR (EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = 'super_admin'::perfil_usuario))))));
CREATE POLICY ed_ins ON public.entrega_documentos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM contratos_produtos_entregas e
  WHERE ((e.id = entrega_documentos.entrega_id) AND (fn_pode_avaliar_contrato(fn_contrato_da_entrega(e.produto_id, e.contrato_id)) OR ((e.criado_por = auth.uid()) AND (e.situacao = 'pendente'::text) AND fn_pode_registrar_entrega(fn_contrato_da_entrega(e.produto_id, e.contrato_id))))))));
CREATE POLICY ed_sel ON public.entrega_documentos AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM contratos_produtos_entregas e
  WHERE (e.id = entrega_documentos.entrega_id))));
CREATE POLICY ef_select ON public.execucao_financeira AS PERMISSIVE FOR SELECT TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario, 'visualizador'::perfil_usuario])));
CREATE POLICY ef_select_extra ON public.execucao_financeira AS PERMISSIVE FOR SELECT TO authenticated USING (tem_permissao('financeiro'::text));
CREATE POLICY ef_write ON public.execucao_financeira AS PERMISSIVE FOR ALL TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])));
CREATE POLICY fdb_insert ON public.fornecedor_dados_bancarios AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])));
CREATE POLICY fdb_select ON public.fornecedor_dados_bancarios AS PERMISSIVE FOR SELECT TO authenticated USING ((fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])));
CREATE POLICY fdb_update ON public.fornecedor_dados_bancarios AS PERMISSIVE FOR UPDATE TO authenticated USING ((fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario]))) WITH CHECK ((fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])));
CREATE POLICY forn_usu_select ON public.fornecedor_usuarios AS PERMISSIVE FOR SELECT TO authenticated USING (((usuario_id = auth.uid()) OR (fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])) OR tem_permissao('fornecedores'::text)));
CREATE POLICY forn_select_all ON public.fornecedores AS PERMISSIVE FOR SELECT TO authenticated USING (((fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])) OR tem_permissao('fornecedores'::text) OR tem_permissao('financeiro'::text) OR tem_permissao('contratos'::text) OR tem_permissao('relatorios_fornecedores'::text) OR (EXISTS ( SELECT 1
   FROM contratos c
  WHERE (c.fornecedor_id = fornecedores.id))) OR (EXISTS ( SELECT 1
   FROM tdrs t
  WHERE (t.fornecedor_id = fornecedores.id))) OR (EXISTS ( SELECT 1
   FROM execucao_financeira e
  WHERE (e.fornecedor_id = fornecedores.id))) OR (EXISTS ( SELECT 1
   FROM tarefas k
  WHERE (k.fornecedor_id = fornecedores.id))) OR (EXISTS ( SELECT 1
   FROM tarefa_checklist s
  WHERE (s.responsavel_fornecedor_id = fornecedores.id)))));
CREATE POLICY forn_write ON public.fornecedores AS PERMISSIVE FOR ALL TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])));
CREATE POLICY geometria_fotos_delete ON public.geometria_fotos AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY geometria_fotos_insert ON public.geometria_fotos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY geometria_fotos_select ON public.geometria_fotos AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "escrita autenticados hist" ON public.historico_indicadores AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "leitura autenticados hist" ON public.historico_indicadores AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "update autenticados hist" ON public.historico_indicadores AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY ind_hist_select ON public.indicador_historico AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY indicadores_select_all ON public.indicadores AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY indicadores_write ON public.indicadores AS PERMISSIVE FOR ALL TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY lgpd_trat_insert ON public.lgpd_tratamentos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND u.ativo AND (u.perfil = 'super_admin'::perfil_usuario)))));
CREATE POLICY lgpd_trat_select ON public.lgpd_tratamentos AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND u.ativo AND (u.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))))));
CREATE POLICY lgpd_trat_update ON public.lgpd_tratamentos AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND u.ativo AND (u.perfil = 'super_admin'::perfil_usuario))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND u.ativo AND (u.perfil = 'super_admin'::perfil_usuario)))));
CREATE POLICY auth_insert_mapa_log ON public.mapa_pontos_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY super_admin_select_mapa_log ON public.mapa_pontos_log AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = 'super_admin'::perfil_usuario)))));
CREATE POLICY matriz_itens_admin ON public.matriz_itens AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])) AND (usuarios.ativo = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])) AND (usuarios.ativo = true)))));
CREATE POLICY matriz_itens_select ON public.matriz_itens AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY km_select ON public.metas_km_refs AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY ntc_select ON public.nota_tecnica_conferencias AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM contratos_produtos_entregas e
  WHERE (e.id = nota_tecnica_conferencias.entrega_id))));
CREATE POLICY notif_escrita ON public.notificacoes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((usuario_id = auth.uid()));
CREATE POLICY notif_insert ON public.notificacoes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((usuario_id = auth.uid()));
CREATE POLICY notif_leitura ON public.notificacoes AS PERMISSIVE FOR SELECT TO authenticated USING ((usuario_id = auth.uid()));
CREATE POLICY notif_select ON public.notificacoes AS PERMISSIVE FOR SELECT TO authenticated USING ((usuario_id = auth.uid()));
CREATE POLICY notif_update ON public.notificacoes AS PERMISSIVE FOR UPDATE TO authenticated USING ((usuario_id = auth.uid())) WITH CHECK ((usuario_id = auth.uid()));
CREATE POLICY ods_select ON public.ods_refs AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY orcamento_eventos_select ON public.orcamento_eventos AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
CREATE POLICY orcamento_fontes_select ON public.orcamento_fontes AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
CREATE POLICY outputs_select_all ON public.outputs AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY outputs_write_admin ON public.outputs AS PERMISSIVE FOR ALL TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY pd_select ON public.passagens_diarias AS PERMISSIVE FOR SELECT TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario, 'visualizador'::perfil_usuario])));
CREATE POLICY pd_write ON public.passagens_diarias AS PERMISSIVE FOR ALL TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])));
CREATE POLICY pe_evid_delete ON public.produto_evidencias AS PERMISSIVE FOR DELETE TO authenticated USING (((criado_por = auth.uid()) OR (( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))));
CREATE POLICY pe_evid_insert ON public.produto_evidencias AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY pe_evid_select ON public.produto_evidencias AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY pi_delete ON public.produto_indicador AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])) AND (usuarios.ativo = true)))));
CREATE POLICY pi_insert ON public.produto_indicador AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.ativo = true)))));
CREATE POLICY pi_select ON public.produto_indicador AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY pi_update ON public.produto_indicador AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])) AND (usuarios.ativo = true)))));
CREATE POLICY pmc_confirm ON public.produto_matriz_contribuicao AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])) AND (usuarios.ativo = true)))));
CREATE POLICY pmc_insert ON public.produto_matriz_contribuicao AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.ativo = true)))));
CREATE POLICY pmc_select ON public.produto_matriz_contribuicao AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Inserção autenticada" ON public.produto_notif_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Leitura autenticada" ON public.produto_notif_log AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY pontos_mapa_delete ON public.produto_pontos_mapa AS PERMISSIVE FOR DELETE TO authenticated USING (fn_mapa_pode_editar(entrega_id));
CREATE POLICY pontos_mapa_insert ON public.produto_pontos_mapa AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (fn_mapa_pode_editar(entrega_id));
CREATE POLICY pontos_mapa_select ON public.produto_pontos_mapa AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY pontos_mapa_update ON public.produto_pontos_mapa AS PERMISSIVE FOR UPDATE TO authenticated USING (fn_mapa_pode_editar(entrega_id)) WITH CHECK (fn_mapa_pode_editar(entrega_id));
CREATE POLICY pe_insert ON public.produtos_entregues AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY pe_select ON public.produtos_entregues AS PERMISSIVE FOR SELECT TO public USING (((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario, 'visualizador'::perfil_usuario, 'tecnico'::perfil_usuario])) OR (submetido_por = auth.uid()) OR (aprovado_tecnico_por = auth.uid())));
CREATE POLICY pe_update ON public.produtos_entregues AS PERMISSIVE FOR UPDATE TO public USING (((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])) OR ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = 'tecnico'::perfil_usuario) AND (status = ANY (ARRAY['submetido'::status_produto, 'em_revisao'::status_produto]))) OR (submetido_por = auth.uid())));
CREATE POLICY rem_cargo_titulares_select ON public.rem_cargo_titulares AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
CREATE POLICY rem_cargos_select ON public.rem_cargos AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
CREATE POLICY remanejamento_alocacoes_select ON public.remanejamento_alocacoes AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
CREATE POLICY remanejamento_assinaturas_select ON public.remanejamento_assinaturas AS PERMISSIVE FOR SELECT TO authenticated USING (((usuario_id = auth.uid()) OR (( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))));
CREATE POLICY remanejamento_etapas_select ON public.remanejamento_etapas AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
CREATE POLICY remanejamento_historico_select ON public.remanejamento_historico AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
CREATE POLICY remanejamento_itens_select ON public.remanejamento_itens AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
CREATE POLICY remanejamentos_select ON public.remanejamentos AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));
CREATE POLICY repo_insert ON public.repositorio_links AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY repo_select ON public.repositorio_links AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY repo_update ON public.repositorio_links AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = 'super_admin'::perfil_usuario)))));
CREATE POLICY resultados_select_all ON public.resultados AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY resultados_write_admin ON public.resultados AS PERMISSIVE FOR ALL TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY riscos_select_all ON public.riscos AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY riscos_write ON public.riscos AS PERMISSIVE FOR ALL TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY senha_tokens_proprio ON public.senha_tokens AS PERMISSIVE FOR ALL TO public USING ((usuario_id = auth.uid()));
CREATE POLICY sol_ins ON public.solicitacoes_senha AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((usuario_id = auth.uid()));
CREATE POLICY sol_sel ON public.solicitacoes_senha AS PERMISSIVE FOR SELECT TO authenticated USING (((usuario_id = auth.uid()) OR (fn_perfil_atual() = 'super_admin'::perfil_usuario)));
CREATE POLICY sol_upd ON public.solicitacoes_senha AS PERMISSIVE FOR UPDATE TO authenticated USING ((fn_perfil_atual() = 'super_admin'::perfil_usuario));
CREATE POLICY anexo_delete ON public.tarefa_anexos AS PERMISSIVE FOR DELETE TO authenticated USING (fn_tarefa_pode_editar(tarefa_id));
CREATE POLICY anexo_insert ON public.tarefa_anexos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((enviado_por = auth.uid()) AND (fn_tarefa_pode_editar(tarefa_id) OR ((comentario_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM tarefa_comentarios c
  WHERE ((c.id = tarefa_anexos.comentario_id) AND (c.tarefa_id = tarefa_anexos.tarefa_id) AND (c.autor_id = auth.uid()))))))));
CREATE POLICY anexo_select ON public.tarefa_anexos AS PERMISSIVE FOR SELECT TO authenticated USING (fn_pode_ver_tarefa(tarefa_id));
CREATE POLICY chk_select ON public.tarefa_checklist AS PERMISSIVE FOR SELECT TO authenticated USING (fn_pode_ver_tarefa(tarefa_id));
CREATE POLICY chk_write ON public.tarefa_checklist AS PERMISSIVE FOR ALL TO authenticated USING (fn_tarefa_pode_editar(tarefa_id)) WITH CHECK (fn_tarefa_pode_editar(tarefa_id));
CREATE POLICY coment_select ON public.tarefa_comentarios AS PERMISSIVE FOR SELECT TO authenticated USING (fn_pode_ver_tarefa(tarefa_id));
CREATE POLICY thist_select ON public.tarefa_historico AS PERMISSIVE FOR SELECT TO authenticated USING (fn_pode_ver_tarefa(tarefa_id));
CREATE POLICY tpart_select ON public.tarefa_participantes AS PERMISSIVE FOR SELECT TO authenticated USING (fn_pode_ver_tarefa(tarefa_id));
CREATE POLICY ttdr_delete ON public.tarefa_tdrs AS PERMISSIVE FOR DELETE TO authenticated USING (fn_tarefa_pode_editar(tarefa_id));
CREATE POLICY ttdr_insert ON public.tarefa_tdrs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (fn_tarefa_pode_editar(tarefa_id));
CREATE POLICY ttdr_select ON public.tarefa_tdrs AS PERMISSIVE FOR SELECT TO authenticated USING (fn_pode_ver_tarefa(tarefa_id));
CREATE POLICY ttipo_insert ON public.tarefa_tipos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY ttipo_select ON public.tarefa_tipos AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY ttipo_update ON public.tarefa_tipos AS PERMISSIVE FOR UPDATE TO authenticated USING ((fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))) WITH CHECK ((fn_perfil_atual() = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY tarefas_select ON public.tarefas AS PERMISSIVE FOR SELECT TO authenticated USING (((criado_por = auth.uid()) OR (fn_perfil_atual() = 'super_admin'::perfil_usuario) OR (EXISTS ( SELECT 1
   FROM tarefa_participantes tp
  WHERE ((tp.tarefa_id = tarefas.id) AND (tp.usuario_id = auth.uid())))) OR ((NOT restrita) AND ((fn_perfil_atual() = 'coordenacao'::perfil_usuario) OR ((atividade_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM atividade_responsaveis ar
  WHERE ((ar.atividade_id = tarefas.atividade_id) AND (ar.usuario_id = auth.uid()) AND (ar.ativo = true)))))))));
CREATE POLICY tarefas_update ON public.tarefas AS PERMISSIVE FOR UPDATE TO authenticated USING (fn_tarefa_pode_editar(id)) WITH CHECK (fn_tarefa_pode_editar(id));
CREATE POLICY tdr_acoes_delete ON public.tdr_acoes AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM tdrs t
  WHERE ((t.id = tdr_acoes.tdr_id) AND ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = 'super_admin'::perfil_usuario) OR (t.criado_por = auth.uid()) OR (t.elaborador_id = auth.uid()))))));
CREATE POLICY tdr_acoes_escrita ON public.tdr_acoes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((usuario_id = auth.uid()));
CREATE POLICY tdr_acoes_leitura ON public.tdr_acoes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY tdr_anexos_delete ON public.tdr_anexos AS PERMISSIVE FOR DELETE TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])));
CREATE POLICY tdr_anexos_insert ON public.tdr_anexos AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'tecnico'::perfil_usuario])));
CREATE POLICY tdr_anexos_select ON public.tdr_anexos AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY tdr_cancelamento_assinaturas_select ON public.tdr_cancelamento_assinaturas AS PERMISSIVE FOR SELECT TO authenticated USING (((usuario_id = auth.uid()) OR (( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))));
CREATE POLICY tdr_cancelamento_etapas_select ON public.tdr_cancelamento_etapas AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) IS NOT NULL));
CREATE POLICY tdr_cancelamento_historico_select ON public.tdr_cancelamento_historico AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) IS NOT NULL));
CREATE POLICY tdr_cancelamentos_select ON public.tdr_cancelamentos AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) IS NOT NULL));
CREATE POLICY com_delete ON public.tdr_comentarios AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY com_escrita ON public.tdr_comentarios AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY com_leitura ON public.tdr_comentarios AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY com_update ON public.tdr_comentarios AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY tdr_comentarios_insert ON public.tdr_comentarios AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY tdr_comentarios_select ON public.tdr_comentarios AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY tdr_comentarios_update ON public.tdr_comentarios AS PERMISSIVE FOR UPDATE TO public USING (((usuario_id = auth.uid()) OR (( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))));
CREATE POLICY tdr_conf_escrita ON public.tdr_confirmacoes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY tdr_conf_leitura ON public.tdr_confirmacoes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY tdr_conf_update ON public.tdr_confirmacoes AS PERMISSIVE FOR UPDATE TO authenticated USING ((usuario_id = auth.uid()));
CREATE POLICY lic_emp_select ON public.tdr_licitacao_empresas AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (tdr_licitacao_rodadas r
     JOIN tdrs t ON ((t.id = r.tdr_id)))
  WHERE (r.id = tdr_licitacao_empresas.rodada_id))));
CREATE POLICY lic_prorr_select ON public.tdr_licitacao_prorrogacoes AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (tdr_licitacao_rodadas r
     JOIN tdrs t ON ((t.id = r.tdr_id)))
  WHERE (r.id = tdr_licitacao_prorrogacoes.rodada_id))));
CREATE POLICY lic_rod_select ON public.tdr_licitacao_rodadas AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM tdrs t
  WHERE (t.id = tdr_licitacao_rodadas.tdr_id))));
CREATE POLICY tdr_licitacoes_select ON public.tdr_licitacoes AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) IS NOT NULL));
CREATE POLICY tdr_resp_delete ON public.tdr_responsaveis AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY tdr_resp_escrita ON public.tdr_responsaveis AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY tdr_resp_leitura ON public.tdr_responsaveis AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY tdr_resp_update ON public.tdr_responsaveis AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY leitura_versoes ON public.tdr_versoes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY tdr_versoes_delete ON public.tdr_versoes AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM tdrs t
  WHERE ((t.id = tdr_versoes.tdr_id) AND ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = 'super_admin'::perfil_usuario) OR (t.criado_por = auth.uid()) OR (t.elaborador_id = auth.uid()))))));
CREATE POLICY tdr_versoes_insert ON public.tdr_versoes AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.role() = 'authenticated'::text) AND (( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'tecnico'::perfil_usuario]))));
CREATE POLICY tdr_versoes_select ON public.tdr_versoes AS PERMISSIVE FOR SELECT TO public USING (((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])) OR (EXISTS ( SELECT 1
   FROM tdrs t
  WHERE ((t.id = tdr_versoes.tdr_id) AND ((t.responsavel_id = auth.uid()) OR (t.elaborador_id = auth.uid())))))));
CREATE POLICY ver_escrita ON public.tdr_versoes_editor AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY ver_leitura ON public.tdr_versoes_editor AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY tdrs_delete ON public.tdrs AS PERMISSIVE FOR DELETE TO public USING ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = 'super_admin'::perfil_usuario));
CREATE POLICY tdrs_insert ON public.tdrs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'tecnico'::perfil_usuario])));
CREATE POLICY tdrs_select ON public.tdrs AS PERMISSIVE FOR SELECT TO public USING (((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario, 'visualizador'::perfil_usuario])) OR (criado_por = auth.uid()) OR (elaborador_id = auth.uid()) OR (responsavel_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM atividades a
  WHERE ((a.id = tdrs.atividade_id) AND ((a.responsavel_id = auth.uid()) OR (a.substituto_id = auth.uid())))))));
CREATE POLICY tdrs_update ON public.tdrs AS PERMISSIVE FOR UPDATE TO public USING (((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])) OR ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = 'tecnico'::perfil_usuario) AND (criado_por = auth.uid()) AND (status = ANY (ARRAY['rascunho'::status_tdr, 'ajustes'::status_tdr])))));
CREATE POLICY trilha_metadata_delete ON public.trilha_metadata AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY trilha_metadata_insert ON public.trilha_metadata AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY trilha_metadata_select ON public.trilha_metadata AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY trilha_metadata_update ON public.trilha_metadata AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY uperm_self_select ON public.usuario_permissoes AS PERMISSIVE FOR SELECT TO authenticated USING ((usuario_id = auth.uid()));
CREATE POLICY uperm_super_admin_all ON public.usuario_permissoes AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = 'super_admin'::perfil_usuario) AND (usuarios.ativo = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.perfil = 'super_admin'::perfil_usuario) AND (usuarios.ativo = true)))));
CREATE POLICY usuarios_insert_admin ON public.usuarios AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = 'super_admin'::perfil_usuario));
CREATE POLICY usuarios_select ON public.usuarios AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY usuarios_select_proprios ON public.usuarios AS PERMISSIVE FOR SELECT TO public USING (((id = auth.uid()) OR (( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario]))));
CREATE POLICY usuarios_update_admin_ou_proprio ON public.usuarios AS PERMISSIVE FOR UPDATE TO public USING (((id = auth.uid()) OR (( SELECT fn_perfil_atual() AS fn_perfil_atual) = 'super_admin'::perfil_usuario)));
CREATE POLICY viagem_decisoes_select ON public.viagem_decisoes AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM viagem_protocolos p
  WHERE (p.id = viagem_decisoes.protocolo_id))));
CREATE POLICY "diarias escrita" ON public.viagem_diarias AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "diarias leitura" ON public.viagem_diarias AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY diar2_del ON public.viagem_diarias_v2 AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY diar2_ins ON public.viagem_diarias_v2 AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY diar2_sel ON public.viagem_diarias_v2 AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY diar2_upd ON public.viagem_diarias_v2 AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY "autenticados podem inserir" ON public.viagem_notif_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "autenticados podem ler" ON public.viagem_notif_log AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "passagens escrita" ON public.viagem_passagens AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "passagens leitura" ON public.viagem_passagens AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY vps_insert ON public.viagem_protocolo_seq_ano AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY vps_select ON public.viagem_protocolo_seq_ano AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY vps_update ON public.viagem_protocolo_seq_ano AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY viagem_prot_insert ON public.viagem_protocolos AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY viagem_prot_select ON public.viagem_protocolos AS PERMISSIVE FOR SELECT TO public USING (((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])) OR (criado_por = auth.uid())));
CREATE POLICY viagem_prot_select_extra ON public.viagem_protocolos AS PERMISSIVE FOR SELECT TO authenticated USING (tem_permissao('viagens'::text));
CREATE POLICY viagem_prot_update ON public.viagem_protocolos AS PERMISSIVE FOR UPDATE TO public USING (((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])) OR ((criado_por = auth.uid()) AND ((situacao)::text = 'solicitado'::text))));
CREATE POLICY trech_del ON public.viagem_trechos AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY trech_ins ON public.viagem_trechos AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY trech_sel ON public.viagem_trechos AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY trech_upd ON public.viagem_trechos AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY viagem_viaj_delete ON public.viagem_viajantes AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM viagem_protocolos p
  WHERE ((p.id = viagem_viajantes.protocolo_id) AND ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])) OR (p.criado_por = auth.uid()))))));
CREATE POLICY viagem_viaj_insert ON public.viagem_viajantes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY viagem_viaj_select ON public.viagem_viajantes AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM viagem_protocolos p
  WHERE ((p.id = viagem_viajantes.protocolo_id) AND ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario, 'financeiro'::perfil_usuario])) OR (p.criado_por = auth.uid()))))));
CREATE POLICY viagem_viaj_update ON public.viagem_viajantes AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM viagem_protocolos p
  WHERE ((p.id = viagem_viajantes.protocolo_id) AND ((( SELECT fn_perfil_atual() AS fn_perfil_atual) = ANY (ARRAY['super_admin'::perfil_usuario, 'coordenacao'::perfil_usuario])) OR (p.criado_por = auth.uid()))))));
CREATE POLICY viaj_ins ON public.viagem_viajantes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY viaj_sel ON public.viagem_viajantes AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY viaj_upd ON public.viagem_viajantes AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM viagem_protocolos p
  WHERE ((p.id = viagem_viajantes.protocolo_id) AND (COALESCE(((( SELECT fn_perfil_atual() AS fn_perfil_atual))::text = ANY (ARRAY['super_admin'::text, 'coordenacao'::text, 'financeiro'::text])), false) OR (p.criado_por = auth.uid()))))));
CREATE POLICY "viagens escrita" ON public.viagens_diarias AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "viagens leitura" ON public.viagens_diarias AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "viagens update" ON public.viagens_diarias AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
-- ===== GRANTS (tabelas) =====
GRANT DELETE ON public.acervo_capas TO authenticated;
GRANT DELETE ON public.acervo_capas TO service_role;
GRANT DELETE ON public.acervo_publicacoes TO service_role;
GRANT DELETE ON public.agente_analises TO authenticated;
GRANT DELETE ON public.agente_analises TO service_role;
GRANT DELETE ON public.apa_demarcacoes TO authenticated;
GRANT DELETE ON public.apa_demarcacoes TO service_role;
GRANT DELETE ON public.api_acessos TO service_role;
GRANT DELETE ON public.api_clientes TO service_role;
GRANT DELETE ON public.api_pedido_notificacoes TO service_role;
GRANT DELETE ON public.api_pedidos TO service_role;
GRANT DELETE ON public.atividade_indicador TO authenticated;
GRANT DELETE ON public.atividade_indicador TO service_role;
GRANT DELETE ON public.atividade_matriz TO authenticated;
GRANT DELETE ON public.atividade_matriz TO service_role;
GRANT DELETE ON public.atividade_responsaveis TO authenticated;
GRANT DELETE ON public.atividade_responsaveis TO service_role;
GRANT DELETE ON public.atividades TO authenticated;
GRANT DELETE ON public.atividades TO service_role;
GRANT DELETE ON public.audit_log TO service_role;
GRANT DELETE ON public.auditoria_execucoes TO service_role;
GRANT DELETE ON public.auditoria_registros TO service_role;
GRANT DELETE ON public.beneficiario_dados_bancarios TO authenticated;
GRANT DELETE ON public.beneficiario_dados_bancarios TO service_role;
GRANT DELETE ON public.beneficiarios TO authenticated;
GRANT DELETE ON public.beneficiarios TO service_role;
GRANT DELETE ON public.car_dados_locais TO authenticated;
GRANT DELETE ON public.car_dados_locais TO service_role;
GRANT DELETE ON public.car_marcados TO authenticated;
GRANT DELETE ON public.car_marcados TO service_role;
GRANT DELETE ON public.cobertura_notificacoes TO service_role;
GRANT DELETE ON public.configuracoes_sistema TO authenticated;
GRANT DELETE ON public.configuracoes_sistema TO service_role;
GRANT DELETE ON public.contrato_coberturas TO service_role;
GRANT DELETE ON public.contrato_encerramento_documentos TO service_role;
GRANT DELETE ON public.contrato_encerramento_pedidos TO service_role;
GRANT DELETE ON public.contrato_encerramentos TO authenticated;
GRANT DELETE ON public.contrato_encerramentos TO service_role;
GRANT DELETE ON public.contratos TO authenticated;
GRANT DELETE ON public.contratos TO service_role;
GRANT DELETE ON public.contratos_produtos TO authenticated;
GRANT DELETE ON public.contratos_produtos TO service_role;
GRANT DELETE ON public.contratos_produtos_entregas TO authenticated;
GRANT DELETE ON public.contratos_produtos_entregas TO service_role;
GRANT DELETE ON public.cotacoes_ptax TO service_role;
GRANT DELETE ON public.cotacoes_usd TO authenticated;
GRANT DELETE ON public.cotacoes_usd TO service_role;
GRANT DELETE ON public.despachos_seq TO authenticated;
GRANT DELETE ON public.despachos_seq TO service_role;
GRANT DELETE ON public.diag_audios TO service_role;
GRANT DELETE ON public.diag_comunidades TO service_role;
GRANT DELETE ON public.diag_exportacoes TO service_role;
GRANT DELETE ON public.diag_expurgo_arquivos TO service_role;
GRANT DELETE ON public.diag_fichas TO service_role;
GRANT DELETE ON public.diag_fichas_historico TO service_role;
GRANT DELETE ON public.diag_fichas_identificacao TO service_role;
GRANT DELETE ON public.diag_fotos TO authenticated;
GRANT DELETE ON public.diag_fotos TO service_role;
GRANT DELETE ON public.diag_localidades TO service_role;
GRANT DELETE ON public.diag_moradores TO service_role;
GRANT DELETE ON public.diag_moradores_identificacao TO service_role;
GRANT DELETE ON public.diag_municipios TO service_role;
GRANT DELETE ON public.diag_questionarios TO authenticated;
GRANT DELETE ON public.diag_questionarios TO service_role;
GRANT DELETE ON public.diag_sugestoes_ocultas TO authenticated;
GRANT DELETE ON public.diag_sugestoes_ocultas TO service_role;
GRANT DELETE ON public.entrega_aprovacao_senhas TO service_role;
GRANT DELETE ON public.entrega_documentos TO authenticated;
GRANT DELETE ON public.entrega_documentos TO service_role;
GRANT DELETE ON public.execucao_financeira TO authenticated;
GRANT DELETE ON public.execucao_financeira TO service_role;
GRANT DELETE ON public.fornecedor_dados_bancarios TO authenticated;
GRANT DELETE ON public.fornecedor_dados_bancarios TO service_role;
GRANT DELETE ON public.fornecedor_usuarios TO service_role;
GRANT DELETE ON public.fornecedores TO authenticated;
GRANT DELETE ON public.fornecedores TO service_role;
GRANT DELETE ON public.geometria_fotos TO authenticated;
GRANT DELETE ON public.geometria_fotos TO service_role;
GRANT DELETE ON public.gmail_sync_state TO authenticated;
GRANT DELETE ON public.gmail_sync_state TO service_role;
GRANT DELETE ON public.historico_indicadores TO authenticated;
GRANT DELETE ON public.historico_indicadores TO service_role;
GRANT DELETE ON public.indicador_historico TO authenticated;
GRANT DELETE ON public.indicador_historico TO service_role;
GRANT DELETE ON public.indicadores TO authenticated;
GRANT DELETE ON public.indicadores TO service_role;
GRANT DELETE ON public.lgpd_tratamentos TO authenticated;
GRANT DELETE ON public.lgpd_tratamentos TO service_role;
GRANT DELETE ON public.mapa_pontos_log TO authenticated;
GRANT DELETE ON public.mapa_pontos_log TO service_role;
GRANT DELETE ON public.matriz_itens TO authenticated;
GRANT DELETE ON public.matriz_itens TO service_role;
GRANT DELETE ON public.metas_km_refs TO authenticated;
GRANT DELETE ON public.metas_km_refs TO service_role;
GRANT DELETE ON public.nota_tecnica_calibracao_chaves TO service_role;
GRANT DELETE ON public.nota_tecnica_conferencias TO service_role;
GRANT DELETE ON public.notificacoes TO authenticated;
GRANT DELETE ON public.notificacoes TO service_role;
GRANT DELETE ON public.ods_refs TO authenticated;
GRANT DELETE ON public.ods_refs TO service_role;
GRANT DELETE ON public.orcamento_eventos TO service_role;
GRANT DELETE ON public.orcamento_fontes TO service_role;
GRANT DELETE ON public.outputs TO authenticated;
GRANT DELETE ON public.outputs TO service_role;
GRANT DELETE ON public.passagens_diarias TO authenticated;
GRANT DELETE ON public.passagens_diarias TO service_role;
GRANT DELETE ON public.prestacao_tokens TO authenticated;
GRANT DELETE ON public.prestacao_tokens TO service_role;
GRANT DELETE ON public.produto_entregue_indicador TO authenticated;
GRANT DELETE ON public.produto_entregue_indicador TO service_role;
GRANT DELETE ON public.produto_evidencias TO authenticated;
GRANT DELETE ON public.produto_evidencias TO service_role;
GRANT DELETE ON public.produto_indicador TO authenticated;
GRANT DELETE ON public.produto_indicador TO service_role;
GRANT DELETE ON public.produto_matriz_contribuicao TO authenticated;
GRANT DELETE ON public.produto_matriz_contribuicao TO service_role;
GRANT DELETE ON public.produto_notif_log TO authenticated;
GRANT DELETE ON public.produto_notif_log TO service_role;
GRANT DELETE ON public.produto_pontos_mapa TO authenticated;
GRANT DELETE ON public.produto_pontos_mapa TO service_role;
GRANT DELETE ON public.produtos_entregues TO authenticated;
GRANT DELETE ON public.produtos_entregues TO service_role;
GRANT DELETE ON public.pulso_ciclos TO service_role;
GRANT DELETE ON public.pulso_espelho TO service_role;
GRANT DELETE ON public.pulso_espelho_v2 TO service_role;
GRANT DELETE ON public.pulso_exportacoes TO service_role;
GRANT DELETE ON public.pulso_participacoes TO service_role;
GRANT DELETE ON public.pulso_respostas TO service_role;
GRANT DELETE ON public.pulso_respostas_v2 TO service_role;
GRANT DELETE ON public.rem_cargo_titulares TO service_role;
GRANT DELETE ON public.rem_cargos TO service_role;
GRANT DELETE ON public.rem_numeracao TO service_role;
GRANT DELETE ON public.rem_tentativas_senha TO service_role;
GRANT DELETE ON public.remanejamento_alocacoes TO service_role;
GRANT DELETE ON public.remanejamento_assinaturas TO service_role;
GRANT DELETE ON public.remanejamento_etapas TO service_role;
GRANT DELETE ON public.remanejamento_historico TO service_role;
GRANT DELETE ON public.remanejamento_itens TO service_role;
GRANT DELETE ON public.remanejamento_notificacoes TO service_role;
GRANT DELETE ON public.remanejamentos TO service_role;
GRANT DELETE ON public.repositorio_links TO authenticated;
GRANT DELETE ON public.repositorio_links TO service_role;
GRANT DELETE ON public.resultados TO authenticated;
GRANT DELETE ON public.resultados TO service_role;
GRANT DELETE ON public.riscos TO authenticated;
GRANT DELETE ON public.riscos TO service_role;
GRANT DELETE ON public.senha_tokens TO authenticated;
GRANT DELETE ON public.senha_tokens TO service_role;
GRANT DELETE ON public.solicitacoes_senha TO authenticated;
GRANT DELETE ON public.solicitacoes_senha TO service_role;
GRANT DELETE ON public.tarefa_anexos TO authenticated;
GRANT DELETE ON public.tarefa_anexos TO service_role;
GRANT DELETE ON public.tarefa_checklist TO authenticated;
GRANT DELETE ON public.tarefa_checklist TO service_role;
GRANT DELETE ON public.tarefa_comentarios TO authenticated;
GRANT DELETE ON public.tarefa_comentarios TO service_role;
GRANT DELETE ON public.tarefa_historico TO authenticated;
GRANT DELETE ON public.tarefa_historico TO service_role;
GRANT DELETE ON public.tarefa_participantes TO authenticated;
GRANT DELETE ON public.tarefa_participantes TO service_role;
GRANT DELETE ON public.tarefa_tdrs TO authenticated;
GRANT DELETE ON public.tarefa_tdrs TO service_role;
GRANT DELETE ON public.tarefa_tipos TO authenticated;
GRANT DELETE ON public.tarefa_tipos TO service_role;
GRANT DELETE ON public.tarefas TO authenticated;
GRANT DELETE ON public.tarefas TO service_role;
GRANT DELETE ON public.tdr_acoes TO authenticated;
GRANT DELETE ON public.tdr_acoes TO service_role;
GRANT DELETE ON public.tdr_anexos TO authenticated;
GRANT DELETE ON public.tdr_anexos TO service_role;
GRANT DELETE ON public.tdr_canc_numeracao TO service_role;
GRANT DELETE ON public.tdr_cancelamento_assinaturas TO service_role;
GRANT DELETE ON public.tdr_cancelamento_etapas TO service_role;
GRANT DELETE ON public.tdr_cancelamento_historico TO service_role;
GRANT DELETE ON public.tdr_cancelamento_notificacoes TO service_role;
GRANT DELETE ON public.tdr_cancelamentos TO service_role;
GRANT DELETE ON public.tdr_comentarios TO authenticated;
GRANT DELETE ON public.tdr_comentarios TO service_role;
GRANT DELETE ON public.tdr_confirmacoes TO authenticated;
GRANT DELETE ON public.tdr_confirmacoes TO service_role;
GRANT DELETE ON public.tdr_licitacao_empresas TO service_role;
GRANT DELETE ON public.tdr_licitacao_prorrogacoes TO service_role;
GRANT DELETE ON public.tdr_licitacao_rodadas TO service_role;
GRANT DELETE ON public.tdr_licitacoes TO service_role;
GRANT DELETE ON public.tdr_produtos_previstos TO authenticated;
GRANT DELETE ON public.tdr_produtos_previstos TO service_role;
GRANT DELETE ON public.tdr_responsaveis TO authenticated;
GRANT DELETE ON public.tdr_responsaveis TO service_role;
GRANT DELETE ON public.tdr_versoes TO authenticated;
GRANT DELETE ON public.tdr_versoes TO service_role;
GRANT DELETE ON public.tdr_versoes_editor TO authenticated;
GRANT DELETE ON public.tdr_versoes_editor TO service_role;
GRANT DELETE ON public.tdrs TO authenticated;
GRANT DELETE ON public.tdrs TO service_role;
GRANT DELETE ON public.trilha_metadata TO authenticated;
GRANT DELETE ON public.trilha_metadata TO service_role;
GRANT DELETE ON public.usuario_permissoes TO authenticated;
GRANT DELETE ON public.usuario_permissoes TO service_role;
GRANT DELETE ON public.usuario_senha_temporaria TO service_role;
GRANT DELETE ON public.usuarios TO authenticated;
GRANT DELETE ON public.usuarios TO service_role;
GRANT DELETE ON public.viagem_decisoes TO authenticated;
GRANT DELETE ON public.viagem_decisoes TO service_role;
GRANT DELETE ON public.viagem_diarias TO authenticated;
GRANT DELETE ON public.viagem_diarias TO service_role;
GRANT DELETE ON public.viagem_diarias_v2 TO authenticated;
GRANT DELETE ON public.viagem_diarias_v2 TO service_role;
GRANT DELETE ON public.viagem_notif_log TO authenticated;
GRANT DELETE ON public.viagem_notif_log TO service_role;
GRANT DELETE ON public.viagem_passagens TO authenticated;
GRANT DELETE ON public.viagem_passagens TO service_role;
GRANT DELETE ON public.viagem_protocolo_seq_ano TO authenticated;
GRANT DELETE ON public.viagem_protocolo_seq_ano TO service_role;
GRANT DELETE ON public.viagem_protocolos TO authenticated;
GRANT DELETE ON public.viagem_protocolos TO service_role;
GRANT DELETE ON public.viagem_trechos TO authenticated;
GRANT DELETE ON public.viagem_trechos TO service_role;
GRANT DELETE ON public.viagem_viajantes TO authenticated;
GRANT DELETE ON public.viagem_viajantes TO service_role;
GRANT DELETE ON public.viagens_diarias TO authenticated;
GRANT DELETE ON public.viagens_diarias TO service_role;
GRANT DELETE ON public.vw_acervo_entrega_ref TO authenticated;
GRANT DELETE ON public.vw_acervo_entrega_ref TO service_role;
GRANT DELETE ON public.vw_acervo_midias TO authenticated;
GRANT DELETE ON public.vw_acervo_midias TO service_role;
GRANT DELETE ON public.vw_acervo_obras TO authenticated;
GRANT DELETE ON public.vw_acervo_obras TO service_role;
GRANT DELETE ON public.vw_acervo_publicacoes TO service_role;
GRANT DELETE ON public.vw_dashboard_kpis TO authenticated;
GRANT DELETE ON public.vw_dashboard_kpis TO service_role;
GRANT DELETE ON public.vw_diag_indicadores TO service_role;
GRANT DELETE ON public.vw_diag_respostas TO service_role;
GRANT DELETE ON public.vw_fila_revisao TO authenticated;
GRANT DELETE ON public.vw_fila_revisao TO service_role;
GRANT DELETE ON public.vw_matriz_contribuicoes TO service_role;
GRANT DELETE ON public.vw_matriz_progresso TO authenticated;
GRANT DELETE ON public.vw_matriz_progresso TO service_role;
GRANT DELETE ON public.vw_orcamento_atividade TO service_role;
GRANT DELETE ON public.vw_orcamento_debitos TO service_role;
GRANT DELETE ON public.vw_orcamento_fontes_saldo TO service_role;
GRANT DELETE ON public.vw_pendencias_usuario TO authenticated;
GRANT DELETE ON public.vw_pendencias_usuario TO service_role;
GRANT DELETE ON public.vw_produtos_entregues TO authenticated;
GRANT DELETE ON public.vw_produtos_entregues TO service_role;
GRANT DELETE ON public.vw_rem_conferencia TO service_role;
GRANT DELETE ON public.vw_rem_reservas TO service_role;
GRANT DELETE ON public.vw_remanejamento_assinaturas TO service_role;
GRANT DELETE ON public.vw_saldo_atividade TO service_role;
GRANT DELETE ON public.vw_tarefa_progresso TO authenticated;
GRANT DELETE ON public.vw_tarefa_progresso TO service_role;
GRANT DELETE ON public.vw_tdr_cancelamento_assinaturas TO service_role;
GRANT DELETE ON public.vw_tdr_execucao_direta TO service_role;
GRANT DELETE ON public.vw_viagens_execucao TO service_role;
GRANT INSERT ON public.acervo_capas TO authenticated;
GRANT INSERT ON public.acervo_capas TO service_role;
GRANT INSERT ON public.acervo_publicacoes TO service_role;
GRANT INSERT ON public.agente_analises TO authenticated;
GRANT INSERT ON public.agente_analises TO service_role;
GRANT INSERT ON public.apa_demarcacoes TO authenticated;
GRANT INSERT ON public.apa_demarcacoes TO service_role;
GRANT INSERT ON public.api_acessos TO service_role;
GRANT INSERT ON public.api_clientes TO service_role;
GRANT INSERT ON public.api_pedido_notificacoes TO service_role;
GRANT INSERT ON public.api_pedidos TO service_role;
GRANT INSERT ON public.atividade_indicador TO authenticated;
GRANT INSERT ON public.atividade_indicador TO service_role;
GRANT INSERT ON public.atividade_matriz TO authenticated;
GRANT INSERT ON public.atividade_matriz TO service_role;
GRANT INSERT ON public.atividade_responsaveis TO authenticated;
GRANT INSERT ON public.atividade_responsaveis TO service_role;
GRANT INSERT ON public.atividades TO authenticated;
GRANT INSERT ON public.atividades TO service_role;
GRANT INSERT ON public.audit_log TO service_role;
GRANT INSERT ON public.auditoria_execucoes TO authenticated;
GRANT INSERT ON public.auditoria_execucoes TO service_role;
GRANT INSERT ON public.auditoria_registros TO authenticated;
GRANT INSERT ON public.auditoria_registros TO service_role;
GRANT INSERT ON public.beneficiario_dados_bancarios TO authenticated;
GRANT INSERT ON public.beneficiario_dados_bancarios TO service_role;
GRANT INSERT ON public.beneficiarios TO authenticated;
GRANT INSERT ON public.beneficiarios TO service_role;
GRANT INSERT ON public.car_dados_locais TO authenticated;
GRANT INSERT ON public.car_dados_locais TO service_role;
GRANT INSERT ON public.car_marcados TO authenticated;
GRANT INSERT ON public.car_marcados TO service_role;
GRANT INSERT ON public.cobertura_notificacoes TO service_role;
GRANT INSERT ON public.configuracoes_sistema TO authenticated;
GRANT INSERT ON public.configuracoes_sistema TO service_role;
GRANT INSERT ON public.contrato_coberturas TO service_role;
GRANT INSERT ON public.contrato_encerramento_documentos TO service_role;
GRANT INSERT ON public.contrato_encerramento_pedidos TO service_role;
GRANT INSERT ON public.contrato_encerramentos TO authenticated;
GRANT INSERT ON public.contrato_encerramentos TO service_role;
GRANT INSERT ON public.contratos TO authenticated;
GRANT INSERT ON public.contratos TO service_role;
GRANT INSERT ON public.contratos_produtos TO authenticated;
GRANT INSERT ON public.contratos_produtos TO service_role;
GRANT INSERT ON public.contratos_produtos_entregas TO authenticated;
GRANT INSERT ON public.contratos_produtos_entregas TO service_role;
GRANT INSERT ON public.cotacoes_ptax TO service_role;
GRANT INSERT ON public.cotacoes_usd TO authenticated;
GRANT INSERT ON public.cotacoes_usd TO service_role;
GRANT INSERT ON public.despachos_seq TO authenticated;
GRANT INSERT ON public.despachos_seq TO service_role;
GRANT INSERT ON public.diag_audios TO service_role;
GRANT INSERT ON public.diag_comunidades TO authenticated;
GRANT INSERT ON public.diag_comunidades TO service_role;
GRANT INSERT ON public.diag_exportacoes TO service_role;
GRANT INSERT ON public.diag_expurgo_arquivos TO service_role;
GRANT INSERT ON public.diag_fichas TO service_role;
GRANT INSERT ON public.diag_fichas_historico TO service_role;
GRANT INSERT ON public.diag_fichas_identificacao TO service_role;
GRANT INSERT ON public.diag_fotos TO service_role;
GRANT INSERT ON public.diag_localidades TO authenticated;
GRANT INSERT ON public.diag_localidades TO service_role;
GRANT INSERT ON public.diag_moradores TO service_role;
GRANT INSERT ON public.diag_moradores_identificacao TO service_role;
GRANT INSERT ON public.diag_municipios TO service_role;
GRANT INSERT ON public.diag_questionarios TO authenticated;
GRANT INSERT ON public.diag_questionarios TO service_role;
GRANT INSERT ON public.diag_sugestoes_ocultas TO authenticated;
GRANT INSERT ON public.diag_sugestoes_ocultas TO service_role;
GRANT INSERT ON public.entrega_aprovacao_senhas TO service_role;
GRANT INSERT ON public.entrega_documentos TO authenticated;
GRANT INSERT ON public.entrega_documentos TO service_role;
GRANT INSERT ON public.execucao_financeira TO authenticated;
GRANT INSERT ON public.execucao_financeira TO service_role;
GRANT INSERT ON public.fornecedor_dados_bancarios TO authenticated;
GRANT INSERT ON public.fornecedor_dados_bancarios TO service_role;
GRANT INSERT ON public.fornecedor_usuarios TO service_role;
GRANT INSERT ON public.fornecedores TO authenticated;
GRANT INSERT ON public.fornecedores TO service_role;
GRANT INSERT ON public.geometria_fotos TO authenticated;
GRANT INSERT ON public.geometria_fotos TO service_role;
GRANT INSERT ON public.gmail_sync_state TO authenticated;
GRANT INSERT ON public.gmail_sync_state TO service_role;
GRANT INSERT ON public.historico_indicadores TO authenticated;
GRANT INSERT ON public.historico_indicadores TO service_role;
GRANT INSERT ON public.indicador_historico TO authenticated;
GRANT INSERT ON public.indicador_historico TO service_role;
GRANT INSERT ON public.indicadores TO authenticated;
GRANT INSERT ON public.indicadores TO service_role;
GRANT INSERT ON public.lgpd_tratamentos TO authenticated;
GRANT INSERT ON public.lgpd_tratamentos TO service_role;
GRANT INSERT ON public.mapa_pontos_log TO authenticated;
GRANT INSERT ON public.mapa_pontos_log TO service_role;
GRANT INSERT ON public.matriz_itens TO authenticated;
GRANT INSERT ON public.matriz_itens TO service_role;
GRANT INSERT ON public.metas_km_refs TO authenticated;
GRANT INSERT ON public.metas_km_refs TO service_role;
GRANT INSERT ON public.nota_tecnica_calibracao_chaves TO service_role;
GRANT INSERT ON public.nota_tecnica_conferencias TO service_role;
GRANT INSERT ON public.notificacoes TO authenticated;
GRANT INSERT ON public.notificacoes TO service_role;
GRANT INSERT ON public.ods_refs TO authenticated;
GRANT INSERT ON public.ods_refs TO service_role;
GRANT INSERT ON public.orcamento_eventos TO service_role;
GRANT INSERT ON public.orcamento_fontes TO service_role;
GRANT INSERT ON public.outputs TO authenticated;
GRANT INSERT ON public.outputs TO service_role;
GRANT INSERT ON public.passagens_diarias TO authenticated;
GRANT INSERT ON public.passagens_diarias TO service_role;
GRANT INSERT ON public.prestacao_tokens TO authenticated;
GRANT INSERT ON public.prestacao_tokens TO service_role;
GRANT INSERT ON public.produto_entregue_indicador TO authenticated;
GRANT INSERT ON public.produto_entregue_indicador TO service_role;
GRANT INSERT ON public.produto_evidencias TO authenticated;
GRANT INSERT ON public.produto_evidencias TO service_role;
GRANT INSERT ON public.produto_indicador TO authenticated;
GRANT INSERT ON public.produto_indicador TO service_role;
GRANT INSERT ON public.produto_matriz_contribuicao TO authenticated;
GRANT INSERT ON public.produto_matriz_contribuicao TO service_role;
GRANT INSERT ON public.produto_notif_log TO authenticated;
GRANT INSERT ON public.produto_notif_log TO service_role;
GRANT INSERT ON public.produto_pontos_mapa TO authenticated;
GRANT INSERT ON public.produto_pontos_mapa TO service_role;
GRANT INSERT ON public.produtos_entregues TO authenticated;
GRANT INSERT ON public.produtos_entregues TO service_role;
GRANT INSERT ON public.pulso_ciclos TO service_role;
GRANT INSERT ON public.pulso_espelho TO service_role;
GRANT INSERT ON public.pulso_espelho_v2 TO service_role;
GRANT INSERT ON public.pulso_exportacoes TO service_role;
GRANT INSERT ON public.pulso_participacoes TO service_role;
GRANT INSERT ON public.pulso_respostas TO service_role;
GRANT INSERT ON public.pulso_respostas_v2 TO service_role;
GRANT INSERT ON public.rem_cargo_titulares TO service_role;
GRANT INSERT ON public.rem_cargos TO service_role;
GRANT INSERT ON public.rem_numeracao TO service_role;
GRANT INSERT ON public.rem_tentativas_senha TO service_role;
GRANT INSERT ON public.remanejamento_alocacoes TO service_role;
GRANT INSERT ON public.remanejamento_assinaturas TO service_role;
GRANT INSERT ON public.remanejamento_etapas TO service_role;
GRANT INSERT ON public.remanejamento_historico TO service_role;
GRANT INSERT ON public.remanejamento_itens TO service_role;
GRANT INSERT ON public.remanejamento_notificacoes TO service_role;
GRANT INSERT ON public.remanejamentos TO service_role;
GRANT INSERT ON public.repositorio_links TO authenticated;
GRANT INSERT ON public.repositorio_links TO service_role;
GRANT INSERT ON public.resultados TO authenticated;
GRANT INSERT ON public.resultados TO service_role;
GRANT INSERT ON public.riscos TO authenticated;
GRANT INSERT ON public.riscos TO service_role;
GRANT INSERT ON public.senha_tokens TO authenticated;
GRANT INSERT ON public.senha_tokens TO service_role;
GRANT INSERT ON public.solicitacoes_senha TO authenticated;
GRANT INSERT ON public.solicitacoes_senha TO service_role;
GRANT INSERT ON public.tarefa_anexos TO authenticated;
GRANT INSERT ON public.tarefa_anexos TO service_role;
GRANT INSERT ON public.tarefa_checklist TO authenticated;
GRANT INSERT ON public.tarefa_checklist TO service_role;
GRANT INSERT ON public.tarefa_comentarios TO authenticated;
GRANT INSERT ON public.tarefa_comentarios TO service_role;
GRANT INSERT ON public.tarefa_historico TO authenticated;
GRANT INSERT ON public.tarefa_historico TO service_role;
GRANT INSERT ON public.tarefa_participantes TO authenticated;
GRANT INSERT ON public.tarefa_participantes TO service_role;
GRANT INSERT ON public.tarefa_tdrs TO authenticated;
GRANT INSERT ON public.tarefa_tdrs TO service_role;
GRANT INSERT ON public.tarefa_tipos TO authenticated;
GRANT INSERT ON public.tarefa_tipos TO service_role;
GRANT INSERT ON public.tarefas TO authenticated;
GRANT INSERT ON public.tarefas TO service_role;
GRANT INSERT ON public.tdr_acoes TO authenticated;
GRANT INSERT ON public.tdr_acoes TO service_role;
GRANT INSERT ON public.tdr_anexos TO authenticated;
GRANT INSERT ON public.tdr_anexos TO service_role;
GRANT INSERT ON public.tdr_canc_numeracao TO service_role;
GRANT INSERT ON public.tdr_cancelamento_assinaturas TO service_role;
GRANT INSERT ON public.tdr_cancelamento_etapas TO service_role;
GRANT INSERT ON public.tdr_cancelamento_historico TO service_role;
GRANT INSERT ON public.tdr_cancelamento_notificacoes TO service_role;
GRANT INSERT ON public.tdr_cancelamentos TO service_role;
GRANT INSERT ON public.tdr_comentarios TO authenticated;
GRANT INSERT ON public.tdr_comentarios TO service_role;
GRANT INSERT ON public.tdr_confirmacoes TO authenticated;
GRANT INSERT ON public.tdr_confirmacoes TO service_role;
GRANT INSERT ON public.tdr_licitacao_empresas TO service_role;
GRANT INSERT ON public.tdr_licitacao_prorrogacoes TO service_role;
GRANT INSERT ON public.tdr_licitacao_rodadas TO service_role;
GRANT INSERT ON public.tdr_licitacoes TO service_role;
GRANT INSERT ON public.tdr_produtos_previstos TO authenticated;
GRANT INSERT ON public.tdr_produtos_previstos TO service_role;
GRANT INSERT ON public.tdr_responsaveis TO authenticated;
GRANT INSERT ON public.tdr_responsaveis TO service_role;
GRANT INSERT ON public.tdr_versoes TO authenticated;
GRANT INSERT ON public.tdr_versoes TO service_role;
GRANT INSERT ON public.tdr_versoes_editor TO authenticated;
GRANT INSERT ON public.tdr_versoes_editor TO service_role;
GRANT INSERT ON public.tdrs TO authenticated;
GRANT INSERT ON public.tdrs TO service_role;
GRANT INSERT ON public.trilha_metadata TO authenticated;
GRANT INSERT ON public.trilha_metadata TO service_role;
GRANT INSERT ON public.usuario_permissoes TO authenticated;
GRANT INSERT ON public.usuario_permissoes TO service_role;
GRANT INSERT ON public.usuario_senha_temporaria TO service_role;
GRANT INSERT ON public.usuarios TO authenticated;
GRANT INSERT ON public.usuarios TO service_role;
GRANT INSERT ON public.viagem_decisoes TO authenticated;
GRANT INSERT ON public.viagem_decisoes TO service_role;
GRANT INSERT ON public.viagem_diarias TO authenticated;
GRANT INSERT ON public.viagem_diarias TO service_role;
GRANT INSERT ON public.viagem_diarias_v2 TO authenticated;
GRANT INSERT ON public.viagem_diarias_v2 TO service_role;
GRANT INSERT ON public.viagem_notif_log TO authenticated;
GRANT INSERT ON public.viagem_notif_log TO service_role;
GRANT INSERT ON public.viagem_passagens TO authenticated;
GRANT INSERT ON public.viagem_passagens TO service_role;
GRANT INSERT ON public.viagem_protocolo_seq_ano TO authenticated;
GRANT INSERT ON public.viagem_protocolo_seq_ano TO service_role;
GRANT INSERT ON public.viagem_protocolos TO authenticated;
GRANT INSERT ON public.viagem_protocolos TO service_role;
GRANT INSERT ON public.viagem_trechos TO authenticated;
GRANT INSERT ON public.viagem_trechos TO service_role;
GRANT INSERT ON public.viagem_viajantes TO authenticated;
GRANT INSERT ON public.viagem_viajantes TO service_role;
GRANT INSERT ON public.viagens_diarias TO authenticated;
GRANT INSERT ON public.viagens_diarias TO service_role;
GRANT INSERT ON public.vw_acervo_entrega_ref TO authenticated;
GRANT INSERT ON public.vw_acervo_entrega_ref TO service_role;
GRANT INSERT ON public.vw_acervo_midias TO authenticated;
GRANT INSERT ON public.vw_acervo_midias TO service_role;
GRANT INSERT ON public.vw_acervo_obras TO authenticated;
GRANT INSERT ON public.vw_acervo_obras TO service_role;
GRANT INSERT ON public.vw_acervo_publicacoes TO service_role;
GRANT INSERT ON public.vw_dashboard_kpis TO authenticated;
GRANT INSERT ON public.vw_dashboard_kpis TO service_role;
GRANT INSERT ON public.vw_diag_indicadores TO service_role;
GRANT INSERT ON public.vw_diag_respostas TO service_role;
GRANT INSERT ON public.vw_fila_revisao TO authenticated;
GRANT INSERT ON public.vw_fila_revisao TO service_role;
GRANT INSERT ON public.vw_matriz_contribuicoes TO service_role;
GRANT INSERT ON public.vw_matriz_progresso TO authenticated;
GRANT INSERT ON public.vw_matriz_progresso TO service_role;
GRANT INSERT ON public.vw_orcamento_atividade TO service_role;
GRANT INSERT ON public.vw_orcamento_debitos TO service_role;
GRANT INSERT ON public.vw_orcamento_fontes_saldo TO service_role;
GRANT INSERT ON public.vw_pendencias_usuario TO authenticated;
GRANT INSERT ON public.vw_pendencias_usuario TO service_role;
GRANT INSERT ON public.vw_produtos_entregues TO authenticated;
GRANT INSERT ON public.vw_produtos_entregues TO service_role;
GRANT INSERT ON public.vw_rem_conferencia TO service_role;
GRANT INSERT ON public.vw_rem_reservas TO service_role;
GRANT INSERT ON public.vw_remanejamento_assinaturas TO service_role;
GRANT INSERT ON public.vw_saldo_atividade TO service_role;
GRANT INSERT ON public.vw_tarefa_progresso TO authenticated;
GRANT INSERT ON public.vw_tarefa_progresso TO service_role;
GRANT INSERT ON public.vw_tdr_cancelamento_assinaturas TO service_role;
GRANT INSERT ON public.vw_tdr_execucao_direta TO service_role;
GRANT INSERT ON public.vw_viagens_execucao TO service_role;
GRANT REFERENCES ON public.acervo_capas TO authenticated;
GRANT REFERENCES ON public.acervo_capas TO service_role;
GRANT REFERENCES ON public.acervo_publicacoes TO service_role;
GRANT REFERENCES ON public.agente_analises TO authenticated;
GRANT REFERENCES ON public.agente_analises TO service_role;
GRANT REFERENCES ON public.apa_demarcacoes TO authenticated;
GRANT REFERENCES ON public.apa_demarcacoes TO service_role;
GRANT REFERENCES ON public.api_acessos TO service_role;
GRANT REFERENCES ON public.api_clientes TO service_role;
GRANT REFERENCES ON public.api_pedido_notificacoes TO service_role;
GRANT REFERENCES ON public.api_pedidos TO service_role;
GRANT REFERENCES ON public.atividade_indicador TO authenticated;
GRANT REFERENCES ON public.atividade_indicador TO service_role;
GRANT REFERENCES ON public.atividade_matriz TO authenticated;
GRANT REFERENCES ON public.atividade_matriz TO service_role;
GRANT REFERENCES ON public.atividade_responsaveis TO authenticated;
GRANT REFERENCES ON public.atividade_responsaveis TO service_role;
GRANT REFERENCES ON public.atividades TO authenticated;
GRANT REFERENCES ON public.atividades TO service_role;
GRANT REFERENCES ON public.audit_log TO authenticated;
GRANT REFERENCES ON public.audit_log TO service_role;
GRANT REFERENCES ON public.auditoria_execucoes TO authenticated;
GRANT REFERENCES ON public.auditoria_execucoes TO service_role;
GRANT REFERENCES ON public.auditoria_registros TO authenticated;
GRANT REFERENCES ON public.auditoria_registros TO service_role;
GRANT REFERENCES ON public.beneficiario_dados_bancarios TO authenticated;
GRANT REFERENCES ON public.beneficiario_dados_bancarios TO service_role;
GRANT REFERENCES ON public.beneficiarios TO authenticated;
GRANT REFERENCES ON public.beneficiarios TO service_role;
GRANT REFERENCES ON public.car_dados_locais TO authenticated;
GRANT REFERENCES ON public.car_dados_locais TO service_role;
GRANT REFERENCES ON public.car_marcados TO authenticated;
GRANT REFERENCES ON public.car_marcados TO service_role;
GRANT REFERENCES ON public.cobertura_notificacoes TO service_role;
GRANT REFERENCES ON public.configuracoes_sistema TO authenticated;
GRANT REFERENCES ON public.configuracoes_sistema TO service_role;
GRANT REFERENCES ON public.contrato_coberturas TO service_role;
GRANT REFERENCES ON public.contrato_encerramento_documentos TO service_role;
GRANT REFERENCES ON public.contrato_encerramento_pedidos TO service_role;
GRANT REFERENCES ON public.contrato_encerramentos TO authenticated;
GRANT REFERENCES ON public.contrato_encerramentos TO service_role;
GRANT REFERENCES ON public.contratos TO authenticated;
GRANT REFERENCES ON public.contratos TO service_role;
GRANT REFERENCES ON public.contratos_produtos TO authenticated;
GRANT REFERENCES ON public.contratos_produtos TO service_role;
GRANT REFERENCES ON public.contratos_produtos_entregas TO authenticated;
GRANT REFERENCES ON public.contratos_produtos_entregas TO service_role;
GRANT REFERENCES ON public.cotacoes_ptax TO service_role;
GRANT REFERENCES ON public.cotacoes_usd TO authenticated;
GRANT REFERENCES ON public.cotacoes_usd TO service_role;
GRANT REFERENCES ON public.despachos_seq TO authenticated;
GRANT REFERENCES ON public.despachos_seq TO service_role;
GRANT REFERENCES ON public.diag_audios TO service_role;
GRANT REFERENCES ON public.diag_comunidades TO service_role;
GRANT REFERENCES ON public.diag_exportacoes TO service_role;
GRANT REFERENCES ON public.diag_expurgo_arquivos TO service_role;
GRANT REFERENCES ON public.diag_fichas TO service_role;
GRANT REFERENCES ON public.diag_fichas_historico TO service_role;
GRANT REFERENCES ON public.diag_fichas_identificacao TO service_role;
GRANT REFERENCES ON public.diag_fotos TO service_role;
GRANT REFERENCES ON public.diag_localidades TO service_role;
GRANT REFERENCES ON public.diag_moradores TO service_role;
GRANT REFERENCES ON public.diag_moradores_identificacao TO service_role;
GRANT REFERENCES ON public.diag_municipios TO service_role;
GRANT REFERENCES ON public.diag_questionarios TO service_role;
GRANT REFERENCES ON public.diag_sugestoes_ocultas TO service_role;
GRANT REFERENCES ON public.entrega_aprovacao_senhas TO service_role;
GRANT REFERENCES ON public.entrega_documentos TO authenticated;
GRANT REFERENCES ON public.entrega_documentos TO service_role;
GRANT REFERENCES ON public.execucao_financeira TO authenticated;
GRANT REFERENCES ON public.execucao_financeira TO service_role;
GRANT REFERENCES ON public.fornecedor_dados_bancarios TO authenticated;
GRANT REFERENCES ON public.fornecedor_dados_bancarios TO service_role;
GRANT REFERENCES ON public.fornecedor_usuarios TO service_role;
GRANT REFERENCES ON public.fornecedores TO authenticated;
GRANT REFERENCES ON public.fornecedores TO service_role;
GRANT REFERENCES ON public.geometria_fotos TO authenticated;
GRANT REFERENCES ON public.geometria_fotos TO service_role;
GRANT REFERENCES ON public.gmail_sync_state TO authenticated;
GRANT REFERENCES ON public.gmail_sync_state TO service_role;
GRANT REFERENCES ON public.historico_indicadores TO authenticated;
GRANT REFERENCES ON public.historico_indicadores TO service_role;
GRANT REFERENCES ON public.indicador_historico TO authenticated;
GRANT REFERENCES ON public.indicador_historico TO service_role;
GRANT REFERENCES ON public.indicadores TO authenticated;
GRANT REFERENCES ON public.indicadores TO service_role;
GRANT REFERENCES ON public.lgpd_tratamentos TO authenticated;
GRANT REFERENCES ON public.lgpd_tratamentos TO service_role;
GRANT REFERENCES ON public.mapa_pontos_log TO authenticated;
GRANT REFERENCES ON public.mapa_pontos_log TO service_role;
GRANT REFERENCES ON public.matriz_itens TO authenticated;
GRANT REFERENCES ON public.matriz_itens TO service_role;
GRANT REFERENCES ON public.metas_km_refs TO authenticated;
GRANT REFERENCES ON public.metas_km_refs TO service_role;
GRANT REFERENCES ON public.nota_tecnica_calibracao_chaves TO service_role;
GRANT REFERENCES ON public.nota_tecnica_conferencias TO service_role;
GRANT REFERENCES ON public.notificacoes TO authenticated;
GRANT REFERENCES ON public.notificacoes TO service_role;
GRANT REFERENCES ON public.ods_refs TO authenticated;
GRANT REFERENCES ON public.ods_refs TO service_role;
GRANT REFERENCES ON public.orcamento_eventos TO service_role;
GRANT REFERENCES ON public.orcamento_fontes TO service_role;
GRANT REFERENCES ON public.outputs TO authenticated;
GRANT REFERENCES ON public.outputs TO service_role;
GRANT REFERENCES ON public.passagens_diarias TO authenticated;
GRANT REFERENCES ON public.passagens_diarias TO service_role;
GRANT REFERENCES ON public.prestacao_tokens TO authenticated;
GRANT REFERENCES ON public.prestacao_tokens TO service_role;
GRANT REFERENCES ON public.produto_entregue_indicador TO authenticated;
GRANT REFERENCES ON public.produto_entregue_indicador TO service_role;
GRANT REFERENCES ON public.produto_evidencias TO authenticated;
GRANT REFERENCES ON public.produto_evidencias TO service_role;
GRANT REFERENCES ON public.produto_indicador TO authenticated;
GRANT REFERENCES ON public.produto_indicador TO service_role;
GRANT REFERENCES ON public.produto_matriz_contribuicao TO authenticated;
GRANT REFERENCES ON public.produto_matriz_contribuicao TO service_role;
GRANT REFERENCES ON public.produto_notif_log TO authenticated;
GRANT REFERENCES ON public.produto_notif_log TO service_role;
GRANT REFERENCES ON public.produto_pontos_mapa TO authenticated;
GRANT REFERENCES ON public.produto_pontos_mapa TO service_role;
GRANT REFERENCES ON public.produtos_entregues TO authenticated;
GRANT REFERENCES ON public.produtos_entregues TO service_role;
GRANT REFERENCES ON public.pulso_ciclos TO service_role;
GRANT REFERENCES ON public.pulso_espelho TO service_role;
GRANT REFERENCES ON public.pulso_espelho_v2 TO service_role;
GRANT REFERENCES ON public.pulso_exportacoes TO service_role;
GRANT REFERENCES ON public.pulso_participacoes TO service_role;
GRANT REFERENCES ON public.pulso_respostas TO service_role;
GRANT REFERENCES ON public.pulso_respostas_v2 TO service_role;
GRANT REFERENCES ON public.rem_cargo_titulares TO service_role;
GRANT REFERENCES ON public.rem_cargos TO service_role;
GRANT REFERENCES ON public.rem_numeracao TO service_role;
GRANT REFERENCES ON public.rem_tentativas_senha TO service_role;
GRANT REFERENCES ON public.remanejamento_alocacoes TO service_role;
GRANT REFERENCES ON public.remanejamento_assinaturas TO service_role;
GRANT REFERENCES ON public.remanejamento_etapas TO service_role;
GRANT REFERENCES ON public.remanejamento_historico TO service_role;
GRANT REFERENCES ON public.remanejamento_itens TO service_role;
GRANT REFERENCES ON public.remanejamento_notificacoes TO service_role;
GRANT REFERENCES ON public.remanejamentos TO service_role;
GRANT REFERENCES ON public.repositorio_links TO authenticated;
GRANT REFERENCES ON public.repositorio_links TO service_role;
GRANT REFERENCES ON public.resultados TO authenticated;
GRANT REFERENCES ON public.resultados TO service_role;
GRANT REFERENCES ON public.riscos TO authenticated;
GRANT REFERENCES ON public.riscos TO service_role;
GRANT REFERENCES ON public.senha_tokens TO authenticated;
GRANT REFERENCES ON public.senha_tokens TO service_role;
GRANT REFERENCES ON public.solicitacoes_senha TO authenticated;
GRANT REFERENCES ON public.solicitacoes_senha TO service_role;
GRANT REFERENCES ON public.tarefa_anexos TO authenticated;
GRANT REFERENCES ON public.tarefa_anexos TO service_role;
GRANT REFERENCES ON public.tarefa_checklist TO authenticated;
GRANT REFERENCES ON public.tarefa_checklist TO service_role;
GRANT REFERENCES ON public.tarefa_comentarios TO authenticated;
GRANT REFERENCES ON public.tarefa_comentarios TO service_role;
GRANT REFERENCES ON public.tarefa_historico TO authenticated;
GRANT REFERENCES ON public.tarefa_historico TO service_role;
GRANT REFERENCES ON public.tarefa_participantes TO authenticated;
GRANT REFERENCES ON public.tarefa_participantes TO service_role;
GRANT REFERENCES ON public.tarefa_tdrs TO authenticated;
GRANT REFERENCES ON public.tarefa_tdrs TO service_role;
GRANT REFERENCES ON public.tarefa_tipos TO authenticated;
GRANT REFERENCES ON public.tarefa_tipos TO service_role;
GRANT REFERENCES ON public.tarefas TO authenticated;
GRANT REFERENCES ON public.tarefas TO service_role;
GRANT REFERENCES ON public.tdr_acoes TO authenticated;
GRANT REFERENCES ON public.tdr_acoes TO service_role;
GRANT REFERENCES ON public.tdr_anexos TO authenticated;
GRANT REFERENCES ON public.tdr_anexos TO service_role;
GRANT REFERENCES ON public.tdr_canc_numeracao TO service_role;
GRANT REFERENCES ON public.tdr_cancelamento_assinaturas TO service_role;
GRANT REFERENCES ON public.tdr_cancelamento_etapas TO service_role;
GRANT REFERENCES ON public.tdr_cancelamento_historico TO service_role;
GRANT REFERENCES ON public.tdr_cancelamento_notificacoes TO service_role;
GRANT REFERENCES ON public.tdr_cancelamentos TO service_role;
GRANT REFERENCES ON public.tdr_comentarios TO authenticated;
GRANT REFERENCES ON public.tdr_comentarios TO service_role;
GRANT REFERENCES ON public.tdr_confirmacoes TO authenticated;
GRANT REFERENCES ON public.tdr_confirmacoes TO service_role;
GRANT REFERENCES ON public.tdr_licitacao_empresas TO service_role;
GRANT REFERENCES ON public.tdr_licitacao_prorrogacoes TO service_role;
GRANT REFERENCES ON public.tdr_licitacao_rodadas TO service_role;
GRANT REFERENCES ON public.tdr_licitacoes TO service_role;
GRANT REFERENCES ON public.tdr_produtos_previstos TO authenticated;
GRANT REFERENCES ON public.tdr_produtos_previstos TO service_role;
GRANT REFERENCES ON public.tdr_responsaveis TO authenticated;
GRANT REFERENCES ON public.tdr_responsaveis TO service_role;
GRANT REFERENCES ON public.tdr_versoes TO authenticated;
GRANT REFERENCES ON public.tdr_versoes TO service_role;
GRANT REFERENCES ON public.tdr_versoes_editor TO authenticated;
GRANT REFERENCES ON public.tdr_versoes_editor TO service_role;
GRANT REFERENCES ON public.tdrs TO authenticated;
GRANT REFERENCES ON public.tdrs TO service_role;
GRANT REFERENCES ON public.trilha_metadata TO authenticated;
GRANT REFERENCES ON public.trilha_metadata TO service_role;
GRANT REFERENCES ON public.usuario_permissoes TO authenticated;
GRANT REFERENCES ON public.usuario_permissoes TO service_role;
GRANT REFERENCES ON public.usuario_senha_temporaria TO service_role;
GRANT REFERENCES ON public.usuarios TO authenticated;
GRANT REFERENCES ON public.usuarios TO service_role;
GRANT REFERENCES ON public.viagem_decisoes TO authenticated;
GRANT REFERENCES ON public.viagem_decisoes TO service_role;
GRANT REFERENCES ON public.viagem_diarias TO authenticated;
GRANT REFERENCES ON public.viagem_diarias TO service_role;
GRANT REFERENCES ON public.viagem_diarias_v2 TO authenticated;
GRANT REFERENCES ON public.viagem_diarias_v2 TO service_role;
GRANT REFERENCES ON public.viagem_notif_log TO authenticated;
GRANT REFERENCES ON public.viagem_notif_log TO service_role;
GRANT REFERENCES ON public.viagem_passagens TO authenticated;
GRANT REFERENCES ON public.viagem_passagens TO service_role;
GRANT REFERENCES ON public.viagem_protocolo_seq_ano TO authenticated;
GRANT REFERENCES ON public.viagem_protocolo_seq_ano TO service_role;
GRANT REFERENCES ON public.viagem_protocolos TO authenticated;
GRANT REFERENCES ON public.viagem_protocolos TO service_role;
GRANT REFERENCES ON public.viagem_trechos TO authenticated;
GRANT REFERENCES ON public.viagem_trechos TO service_role;
GRANT REFERENCES ON public.viagem_viajantes TO authenticated;
GRANT REFERENCES ON public.viagem_viajantes TO service_role;
GRANT REFERENCES ON public.viagens_diarias TO authenticated;
GRANT REFERENCES ON public.viagens_diarias TO service_role;
GRANT REFERENCES ON public.vw_acervo_entrega_ref TO authenticated;
GRANT REFERENCES ON public.vw_acervo_entrega_ref TO service_role;
GRANT REFERENCES ON public.vw_acervo_midias TO authenticated;
GRANT REFERENCES ON public.vw_acervo_midias TO service_role;
GRANT REFERENCES ON public.vw_acervo_obras TO authenticated;
GRANT REFERENCES ON public.vw_acervo_obras TO service_role;
GRANT REFERENCES ON public.vw_acervo_publicacoes TO service_role;
GRANT REFERENCES ON public.vw_dashboard_kpis TO authenticated;
GRANT REFERENCES ON public.vw_dashboard_kpis TO service_role;
GRANT REFERENCES ON public.vw_diag_indicadores TO service_role;
GRANT REFERENCES ON public.vw_diag_respostas TO service_role;
GRANT REFERENCES ON public.vw_fila_revisao TO authenticated;
GRANT REFERENCES ON public.vw_fila_revisao TO service_role;
GRANT REFERENCES ON public.vw_matriz_contribuicoes TO service_role;
GRANT REFERENCES ON public.vw_matriz_progresso TO authenticated;
GRANT REFERENCES ON public.vw_matriz_progresso TO service_role;
GRANT REFERENCES ON public.vw_orcamento_atividade TO service_role;
GRANT REFERENCES ON public.vw_orcamento_debitos TO service_role;
GRANT REFERENCES ON public.vw_orcamento_fontes_saldo TO service_role;
GRANT REFERENCES ON public.vw_pendencias_usuario TO authenticated;
GRANT REFERENCES ON public.vw_pendencias_usuario TO service_role;
GRANT REFERENCES ON public.vw_produtos_entregues TO authenticated;
GRANT REFERENCES ON public.vw_produtos_entregues TO service_role;
GRANT REFERENCES ON public.vw_rem_conferencia TO service_role;
GRANT REFERENCES ON public.vw_rem_reservas TO service_role;
GRANT REFERENCES ON public.vw_remanejamento_assinaturas TO service_role;
GRANT REFERENCES ON public.vw_saldo_atividade TO service_role;
GRANT REFERENCES ON public.vw_tarefa_progresso TO authenticated;
GRANT REFERENCES ON public.vw_tarefa_progresso TO service_role;
GRANT REFERENCES ON public.vw_tdr_cancelamento_assinaturas TO service_role;
GRANT REFERENCES ON public.vw_tdr_execucao_direta TO service_role;
GRANT REFERENCES ON public.vw_viagens_execucao TO service_role;
GRANT SELECT ON public.acervo_capas TO authenticated;
GRANT SELECT ON public.acervo_capas TO service_role;
GRANT SELECT ON public.acervo_publicacoes TO authenticated;
GRANT SELECT ON public.acervo_publicacoes TO service_role;
GRANT SELECT ON public.agente_analises TO authenticated;
GRANT SELECT ON public.agente_analises TO service_role;
GRANT SELECT ON public.apa_demarcacoes TO authenticated;
GRANT SELECT ON public.apa_demarcacoes TO service_role;
GRANT SELECT ON public.api_acessos TO service_role;
GRANT SELECT ON public.api_clientes TO service_role;
GRANT SELECT ON public.api_pedido_notificacoes TO service_role;
GRANT SELECT ON public.api_pedidos TO service_role;
GRANT SELECT ON public.atividade_indicador TO authenticated;
GRANT SELECT ON public.atividade_indicador TO service_role;
GRANT SELECT ON public.atividade_matriz TO authenticated;
GRANT SELECT ON public.atividade_matriz TO service_role;
GRANT SELECT ON public.atividade_responsaveis TO authenticated;
GRANT SELECT ON public.atividade_responsaveis TO service_role;
GRANT SELECT ON public.atividades TO authenticated;
GRANT SELECT ON public.atividades TO service_role;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT SELECT ON public.audit_log TO service_role;
GRANT SELECT ON public.auditoria_execucoes TO authenticated;
GRANT SELECT ON public.auditoria_execucoes TO service_role;
GRANT SELECT ON public.auditoria_registros TO authenticated;
GRANT SELECT ON public.auditoria_registros TO service_role;
GRANT SELECT ON public.beneficiario_dados_bancarios TO authenticated;
GRANT SELECT ON public.beneficiario_dados_bancarios TO service_role;
GRANT SELECT ON public.beneficiarios TO authenticated;
GRANT SELECT ON public.beneficiarios TO service_role;
GRANT SELECT ON public.car_dados_locais TO authenticated;
GRANT SELECT ON public.car_dados_locais TO service_role;
GRANT SELECT ON public.car_marcados TO authenticated;
GRANT SELECT ON public.car_marcados TO service_role;
GRANT SELECT ON public.cobertura_notificacoes TO service_role;
GRANT SELECT ON public.configuracoes_sistema TO anon;
GRANT SELECT ON public.configuracoes_sistema TO authenticated;
GRANT SELECT ON public.configuracoes_sistema TO service_role;
GRANT SELECT ON public.contrato_coberturas TO authenticated;
GRANT SELECT ON public.contrato_coberturas TO service_role;
GRANT SELECT ON public.contrato_encerramento_documentos TO authenticated;
GRANT SELECT ON public.contrato_encerramento_documentos TO service_role;
GRANT SELECT ON public.contrato_encerramento_pedidos TO authenticated;
GRANT SELECT ON public.contrato_encerramento_pedidos TO service_role;
GRANT SELECT ON public.contrato_encerramentos TO authenticated;
GRANT SELECT ON public.contrato_encerramentos TO service_role;
GRANT SELECT ON public.contratos TO authenticated;
GRANT SELECT ON public.contratos TO service_role;
GRANT SELECT ON public.contratos_produtos TO authenticated;
GRANT SELECT ON public.contratos_produtos TO service_role;
GRANT SELECT ON public.contratos_produtos_entregas TO authenticated;
GRANT SELECT ON public.contratos_produtos_entregas TO service_role;
GRANT SELECT ON public.cotacoes_ptax TO authenticated;
GRANT SELECT ON public.cotacoes_ptax TO service_role;
GRANT SELECT ON public.cotacoes_usd TO authenticated;
GRANT SELECT ON public.cotacoes_usd TO service_role;
GRANT SELECT ON public.despachos_seq TO authenticated;
GRANT SELECT ON public.despachos_seq TO service_role;
GRANT SELECT ON public.diag_audios TO authenticated;
GRANT SELECT ON public.diag_audios TO service_role;
GRANT SELECT ON public.diag_comunidades TO authenticated;
GRANT SELECT ON public.diag_comunidades TO service_role;
GRANT SELECT ON public.diag_exportacoes TO authenticated;
GRANT SELECT ON public.diag_exportacoes TO service_role;
GRANT SELECT ON public.diag_expurgo_arquivos TO authenticated;
GRANT SELECT ON public.diag_expurgo_arquivos TO service_role;
GRANT SELECT ON public.diag_fichas TO authenticated;
GRANT SELECT ON public.diag_fichas TO service_role;
GRANT SELECT ON public.diag_fichas_historico TO authenticated;
GRANT SELECT ON public.diag_fichas_historico TO service_role;
GRANT SELECT ON public.diag_fichas_identificacao TO authenticated;
GRANT SELECT ON public.diag_fichas_identificacao TO service_role;
GRANT SELECT ON public.diag_fotos TO authenticated;
GRANT SELECT ON public.diag_fotos TO service_role;
GRANT SELECT ON public.diag_localidades TO authenticated;
GRANT SELECT ON public.diag_localidades TO service_role;
GRANT SELECT ON public.diag_moradores TO authenticated;
GRANT SELECT ON public.diag_moradores TO service_role;
GRANT SELECT ON public.diag_moradores_identificacao TO authenticated;
GRANT SELECT ON public.diag_moradores_identificacao TO service_role;
GRANT SELECT ON public.diag_municipios TO authenticated;
GRANT SELECT ON public.diag_municipios TO service_role;
GRANT SELECT ON public.diag_questionarios TO authenticated;
GRANT SELECT ON public.diag_questionarios TO service_role;
GRANT SELECT ON public.diag_sugestoes_ocultas TO authenticated;
GRANT SELECT ON public.diag_sugestoes_ocultas TO service_role;
GRANT SELECT ON public.entrega_aprovacao_senhas TO service_role;
GRANT SELECT ON public.entrega_documentos TO authenticated;
GRANT SELECT ON public.entrega_documentos TO service_role;
GRANT SELECT ON public.execucao_financeira TO authenticated;
GRANT SELECT ON public.execucao_financeira TO service_role;
GRANT SELECT ON public.fornecedor_dados_bancarios TO authenticated;
GRANT SELECT ON public.fornecedor_dados_bancarios TO service_role;
GRANT SELECT ON public.fornecedor_usuarios TO authenticated;
GRANT SELECT ON public.fornecedor_usuarios TO service_role;
GRANT SELECT ON public.fornecedores TO authenticated;
GRANT SELECT ON public.fornecedores TO service_role;
GRANT SELECT ON public.geometria_fotos TO anon;
GRANT SELECT ON public.geometria_fotos TO authenticated;
GRANT SELECT ON public.geometria_fotos TO service_role;
GRANT SELECT ON public.gmail_sync_state TO authenticated;
GRANT SELECT ON public.gmail_sync_state TO service_role;
GRANT SELECT ON public.historico_indicadores TO authenticated;
GRANT SELECT ON public.historico_indicadores TO service_role;
GRANT SELECT ON public.indicador_historico TO authenticated;
GRANT SELECT ON public.indicador_historico TO service_role;
GRANT SELECT ON public.indicadores TO authenticated;
GRANT SELECT ON public.indicadores TO service_role;
GRANT SELECT ON public.lgpd_tratamentos TO authenticated;
GRANT SELECT ON public.lgpd_tratamentos TO service_role;
GRANT SELECT ON public.mapa_pontos_log TO authenticated;
GRANT SELECT ON public.mapa_pontos_log TO service_role;
GRANT SELECT ON public.matriz_itens TO authenticated;
GRANT SELECT ON public.matriz_itens TO service_role;
GRANT SELECT ON public.metas_km_refs TO authenticated;
GRANT SELECT ON public.metas_km_refs TO service_role;
GRANT SELECT ON public.nota_tecnica_calibracao_chaves TO service_role;
GRANT SELECT ON public.nota_tecnica_conferencias TO authenticated;
GRANT SELECT ON public.nota_tecnica_conferencias TO service_role;
GRANT SELECT ON public.notificacoes TO authenticated;
GRANT SELECT ON public.notificacoes TO service_role;
GRANT SELECT ON public.ods_refs TO authenticated;
GRANT SELECT ON public.ods_refs TO service_role;
GRANT SELECT ON public.orcamento_eventos TO authenticated;
GRANT SELECT ON public.orcamento_eventos TO service_role;
GRANT SELECT ON public.orcamento_fontes TO authenticated;
GRANT SELECT ON public.orcamento_fontes TO service_role;
GRANT SELECT ON public.outputs TO authenticated;
GRANT SELECT ON public.outputs TO service_role;
GRANT SELECT ON public.passagens_diarias TO authenticated;
GRANT SELECT ON public.passagens_diarias TO service_role;
GRANT SELECT ON public.prestacao_tokens TO authenticated;
GRANT SELECT ON public.prestacao_tokens TO service_role;
GRANT SELECT ON public.produto_entregue_indicador TO authenticated;
GRANT SELECT ON public.produto_entregue_indicador TO service_role;
GRANT SELECT ON public.produto_evidencias TO authenticated;
GRANT SELECT ON public.produto_evidencias TO service_role;
GRANT SELECT ON public.produto_indicador TO authenticated;
GRANT SELECT ON public.produto_indicador TO service_role;
GRANT SELECT ON public.produto_matriz_contribuicao TO authenticated;
GRANT SELECT ON public.produto_matriz_contribuicao TO service_role;
GRANT SELECT ON public.produto_notif_log TO authenticated;
GRANT SELECT ON public.produto_notif_log TO service_role;
GRANT SELECT ON public.produto_pontos_mapa TO authenticated;
GRANT SELECT ON public.produto_pontos_mapa TO service_role;
GRANT SELECT ON public.produtos_entregues TO authenticated;
GRANT SELECT ON public.produtos_entregues TO service_role;
GRANT SELECT ON public.pulso_ciclos TO service_role;
GRANT SELECT ON public.pulso_espelho TO service_role;
GRANT SELECT ON public.pulso_espelho_v2 TO service_role;
GRANT SELECT ON public.pulso_exportacoes TO service_role;
GRANT SELECT ON public.pulso_participacoes TO service_role;
GRANT SELECT ON public.pulso_respostas TO service_role;
GRANT SELECT ON public.pulso_respostas_v2 TO service_role;
GRANT SELECT ON public.rem_cargo_titulares TO authenticated;
GRANT SELECT ON public.rem_cargo_titulares TO service_role;
GRANT SELECT ON public.rem_cargos TO authenticated;
GRANT SELECT ON public.rem_cargos TO service_role;
GRANT SELECT ON public.rem_numeracao TO service_role;
GRANT SELECT ON public.rem_tentativas_senha TO service_role;
GRANT SELECT ON public.remanejamento_alocacoes TO authenticated;
GRANT SELECT ON public.remanejamento_alocacoes TO service_role;
GRANT SELECT ON public.remanejamento_assinaturas TO authenticated;
GRANT SELECT ON public.remanejamento_assinaturas TO service_role;
GRANT SELECT ON public.remanejamento_etapas TO authenticated;
GRANT SELECT ON public.remanejamento_etapas TO service_role;
GRANT SELECT ON public.remanejamento_historico TO authenticated;
GRANT SELECT ON public.remanejamento_historico TO service_role;
GRANT SELECT ON public.remanejamento_itens TO authenticated;
GRANT SELECT ON public.remanejamento_itens TO service_role;
GRANT SELECT ON public.remanejamento_notificacoes TO service_role;
GRANT SELECT ON public.remanejamentos TO authenticated;
GRANT SELECT ON public.remanejamentos TO service_role;
GRANT SELECT ON public.repositorio_links TO authenticated;
GRANT SELECT ON public.repositorio_links TO service_role;
GRANT SELECT ON public.resultados TO authenticated;
GRANT SELECT ON public.resultados TO service_role;
GRANT SELECT ON public.riscos TO authenticated;
GRANT SELECT ON public.riscos TO service_role;
GRANT SELECT ON public.senha_tokens TO authenticated;
GRANT SELECT ON public.senha_tokens TO service_role;
GRANT SELECT ON public.solicitacoes_senha TO authenticated;
GRANT SELECT ON public.solicitacoes_senha TO service_role;
GRANT SELECT ON public.tarefa_anexos TO authenticated;
GRANT SELECT ON public.tarefa_anexos TO service_role;
GRANT SELECT ON public.tarefa_checklist TO authenticated;
GRANT SELECT ON public.tarefa_checklist TO service_role;
GRANT SELECT ON public.tarefa_comentarios TO authenticated;
GRANT SELECT ON public.tarefa_comentarios TO service_role;
GRANT SELECT ON public.tarefa_historico TO authenticated;
GRANT SELECT ON public.tarefa_historico TO service_role;
GRANT SELECT ON public.tarefa_participantes TO authenticated;
GRANT SELECT ON public.tarefa_participantes TO service_role;
GRANT SELECT ON public.tarefa_tdrs TO authenticated;
GRANT SELECT ON public.tarefa_tdrs TO service_role;
GRANT SELECT ON public.tarefa_tipos TO authenticated;
GRANT SELECT ON public.tarefa_tipos TO service_role;
GRANT SELECT ON public.tarefas TO authenticated;
GRANT SELECT ON public.tarefas TO service_role;
GRANT SELECT ON public.tdr_acoes TO authenticated;
GRANT SELECT ON public.tdr_acoes TO service_role;
GRANT SELECT ON public.tdr_anexos TO authenticated;
GRANT SELECT ON public.tdr_anexos TO service_role;
GRANT SELECT ON public.tdr_canc_numeracao TO service_role;
GRANT SELECT ON public.tdr_cancelamento_assinaturas TO authenticated;
GRANT SELECT ON public.tdr_cancelamento_assinaturas TO service_role;
GRANT SELECT ON public.tdr_cancelamento_etapas TO authenticated;
GRANT SELECT ON public.tdr_cancelamento_etapas TO service_role;
GRANT SELECT ON public.tdr_cancelamento_historico TO authenticated;
GRANT SELECT ON public.tdr_cancelamento_historico TO service_role;
GRANT SELECT ON public.tdr_cancelamento_notificacoes TO service_role;
GRANT SELECT ON public.tdr_cancelamentos TO authenticated;
GRANT SELECT ON public.tdr_cancelamentos TO service_role;
GRANT SELECT ON public.tdr_comentarios TO authenticated;
GRANT SELECT ON public.tdr_comentarios TO service_role;
GRANT SELECT ON public.tdr_confirmacoes TO authenticated;
GRANT SELECT ON public.tdr_confirmacoes TO service_role;
GRANT SELECT ON public.tdr_licitacao_empresas TO authenticated;
GRANT SELECT ON public.tdr_licitacao_empresas TO service_role;
GRANT SELECT ON public.tdr_licitacao_prorrogacoes TO authenticated;
GRANT SELECT ON public.tdr_licitacao_prorrogacoes TO service_role;
GRANT SELECT ON public.tdr_licitacao_rodadas TO authenticated;
GRANT SELECT ON public.tdr_licitacao_rodadas TO service_role;
GRANT SELECT ON public.tdr_licitacoes TO authenticated;
GRANT SELECT ON public.tdr_licitacoes TO service_role;
GRANT SELECT ON public.tdr_produtos_previstos TO authenticated;
GRANT SELECT ON public.tdr_produtos_previstos TO service_role;
GRANT SELECT ON public.tdr_responsaveis TO authenticated;
GRANT SELECT ON public.tdr_responsaveis TO service_role;
GRANT SELECT ON public.tdr_versoes TO authenticated;
GRANT SELECT ON public.tdr_versoes TO service_role;
GRANT SELECT ON public.tdr_versoes_editor TO authenticated;
GRANT SELECT ON public.tdr_versoes_editor TO service_role;
GRANT SELECT ON public.tdrs TO authenticated;
GRANT SELECT ON public.tdrs TO service_role;
GRANT SELECT ON public.trilha_metadata TO anon;
GRANT SELECT ON public.trilha_metadata TO authenticated;
GRANT SELECT ON public.trilha_metadata TO service_role;
GRANT SELECT ON public.usuario_permissoes TO authenticated;
GRANT SELECT ON public.usuario_permissoes TO service_role;
GRANT SELECT ON public.usuario_senha_temporaria TO service_role;
GRANT SELECT ON public.usuarios TO authenticated;
GRANT SELECT ON public.usuarios TO service_role;
GRANT SELECT ON public.viagem_decisoes TO authenticated;
GRANT SELECT ON public.viagem_decisoes TO service_role;
GRANT SELECT ON public.viagem_diarias TO authenticated;
GRANT SELECT ON public.viagem_diarias TO service_role;
GRANT SELECT ON public.viagem_diarias_v2 TO authenticated;
GRANT SELECT ON public.viagem_diarias_v2 TO service_role;
GRANT SELECT ON public.viagem_notif_log TO authenticated;
GRANT SELECT ON public.viagem_notif_log TO service_role;
GRANT SELECT ON public.viagem_passagens TO authenticated;
GRANT SELECT ON public.viagem_passagens TO service_role;
GRANT SELECT ON public.viagem_protocolo_seq_ano TO authenticated;
GRANT SELECT ON public.viagem_protocolo_seq_ano TO service_role;
GRANT SELECT ON public.viagem_protocolos TO authenticated;
GRANT SELECT ON public.viagem_protocolos TO service_role;
GRANT SELECT ON public.viagem_trechos TO authenticated;
GRANT SELECT ON public.viagem_trechos TO service_role;
GRANT SELECT ON public.viagem_viajantes TO authenticated;
GRANT SELECT ON public.viagem_viajantes TO service_role;
GRANT SELECT ON public.viagens_diarias TO authenticated;
GRANT SELECT ON public.viagens_diarias TO service_role;
GRANT SELECT ON public.vw_acervo_entrega_ref TO authenticated;
GRANT SELECT ON public.vw_acervo_entrega_ref TO service_role;
GRANT SELECT ON public.vw_acervo_midias TO authenticated;
GRANT SELECT ON public.vw_acervo_midias TO service_role;
GRANT SELECT ON public.vw_acervo_obras TO authenticated;
GRANT SELECT ON public.vw_acervo_obras TO service_role;
GRANT SELECT ON public.vw_acervo_publicacoes TO authenticated;
GRANT SELECT ON public.vw_acervo_publicacoes TO service_role;
GRANT SELECT ON public.vw_dashboard_kpis TO authenticated;
GRANT SELECT ON public.vw_dashboard_kpis TO service_role;
GRANT SELECT ON public.vw_diag_indicadores TO authenticated;
GRANT SELECT ON public.vw_diag_indicadores TO service_role;
GRANT SELECT ON public.vw_diag_respostas TO authenticated;
GRANT SELECT ON public.vw_diag_respostas TO service_role;
GRANT SELECT ON public.vw_fila_revisao TO authenticated;
GRANT SELECT ON public.vw_fila_revisao TO service_role;
GRANT SELECT ON public.vw_matriz_contribuicoes TO authenticated;
GRANT SELECT ON public.vw_matriz_contribuicoes TO service_role;
GRANT SELECT ON public.vw_matriz_progresso TO authenticated;
GRANT SELECT ON public.vw_matriz_progresso TO service_role;
GRANT SELECT ON public.vw_orcamento_atividade TO authenticated;
GRANT SELECT ON public.vw_orcamento_atividade TO service_role;
GRANT SELECT ON public.vw_orcamento_debitos TO authenticated;
GRANT SELECT ON public.vw_orcamento_debitos TO service_role;
GRANT SELECT ON public.vw_orcamento_fontes_saldo TO authenticated;
GRANT SELECT ON public.vw_orcamento_fontes_saldo TO service_role;
GRANT SELECT ON public.vw_pendencias_usuario TO authenticated;
GRANT SELECT ON public.vw_pendencias_usuario TO service_role;
GRANT SELECT ON public.vw_produtos_entregues TO authenticated;
GRANT SELECT ON public.vw_produtos_entregues TO service_role;
GRANT SELECT ON public.vw_rem_conferencia TO authenticated;
GRANT SELECT ON public.vw_rem_conferencia TO service_role;
GRANT SELECT ON public.vw_rem_reservas TO authenticated;
GRANT SELECT ON public.vw_rem_reservas TO service_role;
GRANT SELECT ON public.vw_remanejamento_assinaturas TO authenticated;
GRANT SELECT ON public.vw_remanejamento_assinaturas TO service_role;
GRANT SELECT ON public.vw_saldo_atividade TO authenticated;
GRANT SELECT ON public.vw_saldo_atividade TO service_role;
GRANT SELECT ON public.vw_tarefa_progresso TO authenticated;
GRANT SELECT ON public.vw_tarefa_progresso TO service_role;
GRANT SELECT ON public.vw_tdr_cancelamento_assinaturas TO authenticated;
GRANT SELECT ON public.vw_tdr_cancelamento_assinaturas TO service_role;
GRANT SELECT ON public.vw_tdr_execucao_direta TO authenticated;
GRANT SELECT ON public.vw_tdr_execucao_direta TO service_role;
GRANT SELECT ON public.vw_viagens_execucao TO authenticated;
GRANT SELECT ON public.vw_viagens_execucao TO service_role;
GRANT TRIGGER ON public.acervo_capas TO authenticated;
GRANT TRIGGER ON public.acervo_capas TO service_role;
GRANT TRIGGER ON public.acervo_publicacoes TO service_role;
GRANT TRIGGER ON public.agente_analises TO authenticated;
GRANT TRIGGER ON public.agente_analises TO service_role;
GRANT TRIGGER ON public.apa_demarcacoes TO authenticated;
GRANT TRIGGER ON public.apa_demarcacoes TO service_role;
GRANT TRIGGER ON public.api_acessos TO service_role;
GRANT TRIGGER ON public.api_clientes TO service_role;
GRANT TRIGGER ON public.api_pedido_notificacoes TO service_role;
GRANT TRIGGER ON public.api_pedidos TO service_role;
GRANT TRIGGER ON public.atividade_indicador TO authenticated;
GRANT TRIGGER ON public.atividade_indicador TO service_role;
GRANT TRIGGER ON public.atividade_matriz TO authenticated;
GRANT TRIGGER ON public.atividade_matriz TO service_role;
GRANT TRIGGER ON public.atividade_responsaveis TO authenticated;
GRANT TRIGGER ON public.atividade_responsaveis TO service_role;
GRANT TRIGGER ON public.atividades TO authenticated;
GRANT TRIGGER ON public.atividades TO service_role;
GRANT TRIGGER ON public.audit_log TO authenticated;
GRANT TRIGGER ON public.audit_log TO service_role;
GRANT TRIGGER ON public.auditoria_execucoes TO authenticated;
GRANT TRIGGER ON public.auditoria_execucoes TO service_role;
GRANT TRIGGER ON public.auditoria_registros TO authenticated;
GRANT TRIGGER ON public.auditoria_registros TO service_role;
GRANT TRIGGER ON public.beneficiario_dados_bancarios TO authenticated;
GRANT TRIGGER ON public.beneficiario_dados_bancarios TO service_role;
GRANT TRIGGER ON public.beneficiarios TO authenticated;
GRANT TRIGGER ON public.beneficiarios TO service_role;
GRANT TRIGGER ON public.car_dados_locais TO authenticated;
GRANT TRIGGER ON public.car_dados_locais TO service_role;
GRANT TRIGGER ON public.car_marcados TO authenticated;
GRANT TRIGGER ON public.car_marcados TO service_role;
GRANT TRIGGER ON public.cobertura_notificacoes TO service_role;
GRANT TRIGGER ON public.configuracoes_sistema TO authenticated;
GRANT TRIGGER ON public.configuracoes_sistema TO service_role;
GRANT TRIGGER ON public.contrato_coberturas TO service_role;
GRANT TRIGGER ON public.contrato_encerramento_documentos TO service_role;
GRANT TRIGGER ON public.contrato_encerramento_pedidos TO service_role;
GRANT TRIGGER ON public.contrato_encerramentos TO authenticated;
GRANT TRIGGER ON public.contrato_encerramentos TO service_role;
GRANT TRIGGER ON public.contratos TO authenticated;
GRANT TRIGGER ON public.contratos TO service_role;
GRANT TRIGGER ON public.contratos_produtos TO authenticated;
GRANT TRIGGER ON public.contratos_produtos TO service_role;
GRANT TRIGGER ON public.contratos_produtos_entregas TO authenticated;
GRANT TRIGGER ON public.contratos_produtos_entregas TO service_role;
GRANT TRIGGER ON public.cotacoes_ptax TO service_role;
GRANT TRIGGER ON public.cotacoes_usd TO authenticated;
GRANT TRIGGER ON public.cotacoes_usd TO service_role;
GRANT TRIGGER ON public.despachos_seq TO authenticated;
GRANT TRIGGER ON public.despachos_seq TO service_role;
GRANT TRIGGER ON public.diag_audios TO service_role;
GRANT TRIGGER ON public.diag_comunidades TO service_role;
GRANT TRIGGER ON public.diag_exportacoes TO service_role;
GRANT TRIGGER ON public.diag_expurgo_arquivos TO service_role;
GRANT TRIGGER ON public.diag_fichas TO service_role;
GRANT TRIGGER ON public.diag_fichas_historico TO service_role;
GRANT TRIGGER ON public.diag_fichas_identificacao TO service_role;
GRANT TRIGGER ON public.diag_fotos TO service_role;
GRANT TRIGGER ON public.diag_localidades TO service_role;
GRANT TRIGGER ON public.diag_moradores TO service_role;
GRANT TRIGGER ON public.diag_moradores_identificacao TO service_role;
GRANT TRIGGER ON public.diag_municipios TO service_role;
GRANT TRIGGER ON public.diag_questionarios TO service_role;
GRANT TRIGGER ON public.diag_sugestoes_ocultas TO service_role;
GRANT TRIGGER ON public.entrega_aprovacao_senhas TO service_role;
GRANT TRIGGER ON public.entrega_documentos TO authenticated;
GRANT TRIGGER ON public.entrega_documentos TO service_role;
GRANT TRIGGER ON public.execucao_financeira TO authenticated;
GRANT TRIGGER ON public.execucao_financeira TO service_role;
GRANT TRIGGER ON public.fornecedor_dados_bancarios TO authenticated;
GRANT TRIGGER ON public.fornecedor_dados_bancarios TO service_role;
GRANT TRIGGER ON public.fornecedor_usuarios TO service_role;
GRANT TRIGGER ON public.fornecedores TO authenticated;
GRANT TRIGGER ON public.fornecedores TO service_role;
GRANT TRIGGER ON public.geometria_fotos TO authenticated;
GRANT TRIGGER ON public.geometria_fotos TO service_role;
GRANT TRIGGER ON public.gmail_sync_state TO authenticated;
GRANT TRIGGER ON public.gmail_sync_state TO service_role;
GRANT TRIGGER ON public.historico_indicadores TO authenticated;
GRANT TRIGGER ON public.historico_indicadores TO service_role;
GRANT TRIGGER ON public.indicador_historico TO authenticated;
GRANT TRIGGER ON public.indicador_historico TO service_role;
GRANT TRIGGER ON public.indicadores TO authenticated;
GRANT TRIGGER ON public.indicadores TO service_role;
GRANT TRIGGER ON public.lgpd_tratamentos TO authenticated;
GRANT TRIGGER ON public.lgpd_tratamentos TO service_role;
GRANT TRIGGER ON public.mapa_pontos_log TO authenticated;
GRANT TRIGGER ON public.mapa_pontos_log TO service_role;
GRANT TRIGGER ON public.matriz_itens TO authenticated;
GRANT TRIGGER ON public.matriz_itens TO service_role;
GRANT TRIGGER ON public.metas_km_refs TO authenticated;
GRANT TRIGGER ON public.metas_km_refs TO service_role;
GRANT TRIGGER ON public.nota_tecnica_calibracao_chaves TO service_role;
GRANT TRIGGER ON public.nota_tecnica_conferencias TO service_role;
GRANT TRIGGER ON public.notificacoes TO authenticated;
GRANT TRIGGER ON public.notificacoes TO service_role;
GRANT TRIGGER ON public.ods_refs TO authenticated;
GRANT TRIGGER ON public.ods_refs TO service_role;
GRANT TRIGGER ON public.orcamento_eventos TO service_role;
GRANT TRIGGER ON public.orcamento_fontes TO service_role;
GRANT TRIGGER ON public.outputs TO authenticated;
GRANT TRIGGER ON public.outputs TO service_role;
GRANT TRIGGER ON public.passagens_diarias TO authenticated;
GRANT TRIGGER ON public.passagens_diarias TO service_role;
GRANT TRIGGER ON public.prestacao_tokens TO authenticated;
GRANT TRIGGER ON public.prestacao_tokens TO service_role;
GRANT TRIGGER ON public.produto_entregue_indicador TO authenticated;
GRANT TRIGGER ON public.produto_entregue_indicador TO service_role;
GRANT TRIGGER ON public.produto_evidencias TO authenticated;
GRANT TRIGGER ON public.produto_evidencias TO service_role;
GRANT TRIGGER ON public.produto_indicador TO authenticated;
GRANT TRIGGER ON public.produto_indicador TO service_role;
GRANT TRIGGER ON public.produto_matriz_contribuicao TO authenticated;
GRANT TRIGGER ON public.produto_matriz_contribuicao TO service_role;
GRANT TRIGGER ON public.produto_notif_log TO authenticated;
GRANT TRIGGER ON public.produto_notif_log TO service_role;
GRANT TRIGGER ON public.produto_pontos_mapa TO authenticated;
GRANT TRIGGER ON public.produto_pontos_mapa TO service_role;
GRANT TRIGGER ON public.produtos_entregues TO authenticated;
GRANT TRIGGER ON public.produtos_entregues TO service_role;
GRANT TRIGGER ON public.pulso_ciclos TO service_role;
GRANT TRIGGER ON public.pulso_espelho TO service_role;
GRANT TRIGGER ON public.pulso_espelho_v2 TO service_role;
GRANT TRIGGER ON public.pulso_exportacoes TO service_role;
GRANT TRIGGER ON public.pulso_participacoes TO service_role;
GRANT TRIGGER ON public.pulso_respostas TO service_role;
GRANT TRIGGER ON public.pulso_respostas_v2 TO service_role;
GRANT TRIGGER ON public.rem_cargo_titulares TO service_role;
GRANT TRIGGER ON public.rem_cargos TO service_role;
GRANT TRIGGER ON public.rem_numeracao TO service_role;
GRANT TRIGGER ON public.rem_tentativas_senha TO service_role;
GRANT TRIGGER ON public.remanejamento_alocacoes TO service_role;
GRANT TRIGGER ON public.remanejamento_assinaturas TO service_role;
GRANT TRIGGER ON public.remanejamento_etapas TO service_role;
GRANT TRIGGER ON public.remanejamento_historico TO service_role;
GRANT TRIGGER ON public.remanejamento_itens TO service_role;
GRANT TRIGGER ON public.remanejamento_notificacoes TO service_role;
GRANT TRIGGER ON public.remanejamentos TO service_role;
GRANT TRIGGER ON public.repositorio_links TO authenticated;
GRANT TRIGGER ON public.repositorio_links TO service_role;
GRANT TRIGGER ON public.resultados TO authenticated;
GRANT TRIGGER ON public.resultados TO service_role;
GRANT TRIGGER ON public.riscos TO authenticated;
GRANT TRIGGER ON public.riscos TO service_role;
GRANT TRIGGER ON public.senha_tokens TO authenticated;
GRANT TRIGGER ON public.senha_tokens TO service_role;
GRANT TRIGGER ON public.solicitacoes_senha TO authenticated;
GRANT TRIGGER ON public.solicitacoes_senha TO service_role;
GRANT TRIGGER ON public.tarefa_anexos TO authenticated;
GRANT TRIGGER ON public.tarefa_anexos TO service_role;
GRANT TRIGGER ON public.tarefa_checklist TO authenticated;
GRANT TRIGGER ON public.tarefa_checklist TO service_role;
GRANT TRIGGER ON public.tarefa_comentarios TO authenticated;
GRANT TRIGGER ON public.tarefa_comentarios TO service_role;
GRANT TRIGGER ON public.tarefa_historico TO authenticated;
GRANT TRIGGER ON public.tarefa_historico TO service_role;
GRANT TRIGGER ON public.tarefa_participantes TO authenticated;
GRANT TRIGGER ON public.tarefa_participantes TO service_role;
GRANT TRIGGER ON public.tarefa_tdrs TO authenticated;
GRANT TRIGGER ON public.tarefa_tdrs TO service_role;
GRANT TRIGGER ON public.tarefa_tipos TO authenticated;
GRANT TRIGGER ON public.tarefa_tipos TO service_role;
GRANT TRIGGER ON public.tarefas TO authenticated;
GRANT TRIGGER ON public.tarefas TO service_role;
GRANT TRIGGER ON public.tdr_acoes TO authenticated;
GRANT TRIGGER ON public.tdr_acoes TO service_role;
GRANT TRIGGER ON public.tdr_anexos TO authenticated;
GRANT TRIGGER ON public.tdr_anexos TO service_role;
GRANT TRIGGER ON public.tdr_canc_numeracao TO service_role;
GRANT TRIGGER ON public.tdr_cancelamento_assinaturas TO service_role;
GRANT TRIGGER ON public.tdr_cancelamento_etapas TO service_role;
GRANT TRIGGER ON public.tdr_cancelamento_historico TO service_role;
GRANT TRIGGER ON public.tdr_cancelamento_notificacoes TO service_role;
GRANT TRIGGER ON public.tdr_cancelamentos TO service_role;
GRANT TRIGGER ON public.tdr_comentarios TO authenticated;
GRANT TRIGGER ON public.tdr_comentarios TO service_role;
GRANT TRIGGER ON public.tdr_confirmacoes TO authenticated;
GRANT TRIGGER ON public.tdr_confirmacoes TO service_role;
GRANT TRIGGER ON public.tdr_licitacao_empresas TO service_role;
GRANT TRIGGER ON public.tdr_licitacao_prorrogacoes TO service_role;
GRANT TRIGGER ON public.tdr_licitacao_rodadas TO service_role;
GRANT TRIGGER ON public.tdr_licitacoes TO service_role;
GRANT TRIGGER ON public.tdr_produtos_previstos TO authenticated;
GRANT TRIGGER ON public.tdr_produtos_previstos TO service_role;
GRANT TRIGGER ON public.tdr_responsaveis TO authenticated;
GRANT TRIGGER ON public.tdr_responsaveis TO service_role;
GRANT TRIGGER ON public.tdr_versoes TO authenticated;
GRANT TRIGGER ON public.tdr_versoes TO service_role;
GRANT TRIGGER ON public.tdr_versoes_editor TO authenticated;
GRANT TRIGGER ON public.tdr_versoes_editor TO service_role;
GRANT TRIGGER ON public.tdrs TO authenticated;
GRANT TRIGGER ON public.tdrs TO service_role;
GRANT TRIGGER ON public.trilha_metadata TO authenticated;
GRANT TRIGGER ON public.trilha_metadata TO service_role;
GRANT TRIGGER ON public.usuario_permissoes TO authenticated;
GRANT TRIGGER ON public.usuario_permissoes TO service_role;
GRANT TRIGGER ON public.usuario_senha_temporaria TO service_role;
GRANT TRIGGER ON public.usuarios TO authenticated;
GRANT TRIGGER ON public.usuarios TO service_role;
GRANT TRIGGER ON public.viagem_decisoes TO authenticated;
GRANT TRIGGER ON public.viagem_decisoes TO service_role;
GRANT TRIGGER ON public.viagem_diarias TO authenticated;
GRANT TRIGGER ON public.viagem_diarias TO service_role;
GRANT TRIGGER ON public.viagem_diarias_v2 TO authenticated;
GRANT TRIGGER ON public.viagem_diarias_v2 TO service_role;
GRANT TRIGGER ON public.viagem_notif_log TO authenticated;
GRANT TRIGGER ON public.viagem_notif_log TO service_role;
GRANT TRIGGER ON public.viagem_passagens TO authenticated;
GRANT TRIGGER ON public.viagem_passagens TO service_role;
GRANT TRIGGER ON public.viagem_protocolo_seq_ano TO authenticated;
GRANT TRIGGER ON public.viagem_protocolo_seq_ano TO service_role;
GRANT TRIGGER ON public.viagem_protocolos TO authenticated;
GRANT TRIGGER ON public.viagem_protocolos TO service_role;
GRANT TRIGGER ON public.viagem_trechos TO authenticated;
GRANT TRIGGER ON public.viagem_trechos TO service_role;
GRANT TRIGGER ON public.viagem_viajantes TO authenticated;
GRANT TRIGGER ON public.viagem_viajantes TO service_role;
GRANT TRIGGER ON public.viagens_diarias TO authenticated;
GRANT TRIGGER ON public.viagens_diarias TO service_role;
GRANT TRIGGER ON public.vw_acervo_entrega_ref TO authenticated;
GRANT TRIGGER ON public.vw_acervo_entrega_ref TO service_role;
GRANT TRIGGER ON public.vw_acervo_midias TO authenticated;
GRANT TRIGGER ON public.vw_acervo_midias TO service_role;
GRANT TRIGGER ON public.vw_acervo_obras TO authenticated;
GRANT TRIGGER ON public.vw_acervo_obras TO service_role;
GRANT TRIGGER ON public.vw_acervo_publicacoes TO service_role;
GRANT TRIGGER ON public.vw_dashboard_kpis TO authenticated;
GRANT TRIGGER ON public.vw_dashboard_kpis TO service_role;
GRANT TRIGGER ON public.vw_diag_indicadores TO service_role;
GRANT TRIGGER ON public.vw_diag_respostas TO service_role;
GRANT TRIGGER ON public.vw_fila_revisao TO authenticated;
GRANT TRIGGER ON public.vw_fila_revisao TO service_role;
GRANT TRIGGER ON public.vw_matriz_contribuicoes TO service_role;
GRANT TRIGGER ON public.vw_matriz_progresso TO authenticated;
GRANT TRIGGER ON public.vw_matriz_progresso TO service_role;
GRANT TRIGGER ON public.vw_orcamento_atividade TO service_role;
GRANT TRIGGER ON public.vw_orcamento_debitos TO service_role;
GRANT TRIGGER ON public.vw_orcamento_fontes_saldo TO service_role;
GRANT TRIGGER ON public.vw_pendencias_usuario TO authenticated;
GRANT TRIGGER ON public.vw_pendencias_usuario TO service_role;
GRANT TRIGGER ON public.vw_produtos_entregues TO authenticated;
GRANT TRIGGER ON public.vw_produtos_entregues TO service_role;
GRANT TRIGGER ON public.vw_rem_conferencia TO service_role;
GRANT TRIGGER ON public.vw_rem_reservas TO service_role;
GRANT TRIGGER ON public.vw_remanejamento_assinaturas TO service_role;
GRANT TRIGGER ON public.vw_saldo_atividade TO service_role;
GRANT TRIGGER ON public.vw_tarefa_progresso TO authenticated;
GRANT TRIGGER ON public.vw_tarefa_progresso TO service_role;
GRANT TRIGGER ON public.vw_tdr_cancelamento_assinaturas TO service_role;
GRANT TRIGGER ON public.vw_tdr_execucao_direta TO service_role;
GRANT TRIGGER ON public.vw_viagens_execucao TO service_role;
GRANT TRUNCATE ON public.acervo_capas TO authenticated;
GRANT TRUNCATE ON public.acervo_capas TO service_role;
GRANT TRUNCATE ON public.acervo_publicacoes TO service_role;
GRANT TRUNCATE ON public.agente_analises TO authenticated;
GRANT TRUNCATE ON public.agente_analises TO service_role;
GRANT TRUNCATE ON public.apa_demarcacoes TO authenticated;
GRANT TRUNCATE ON public.apa_demarcacoes TO service_role;
GRANT TRUNCATE ON public.api_acessos TO service_role;
GRANT TRUNCATE ON public.api_clientes TO service_role;
GRANT TRUNCATE ON public.api_pedido_notificacoes TO service_role;
GRANT TRUNCATE ON public.api_pedidos TO service_role;
GRANT TRUNCATE ON public.atividade_indicador TO authenticated;
GRANT TRUNCATE ON public.atividade_indicador TO service_role;
GRANT TRUNCATE ON public.atividade_matriz TO authenticated;
GRANT TRUNCATE ON public.atividade_matriz TO service_role;
GRANT TRUNCATE ON public.atividade_responsaveis TO authenticated;
GRANT TRUNCATE ON public.atividade_responsaveis TO service_role;
GRANT TRUNCATE ON public.atividades TO authenticated;
GRANT TRUNCATE ON public.atividades TO service_role;
GRANT TRUNCATE ON public.audit_log TO authenticated;
GRANT TRUNCATE ON public.audit_log TO service_role;
GRANT TRUNCATE ON public.auditoria_execucoes TO authenticated;
GRANT TRUNCATE ON public.auditoria_execucoes TO service_role;
GRANT TRUNCATE ON public.auditoria_registros TO authenticated;
GRANT TRUNCATE ON public.auditoria_registros TO service_role;
GRANT TRUNCATE ON public.beneficiario_dados_bancarios TO authenticated;
GRANT TRUNCATE ON public.beneficiario_dados_bancarios TO service_role;
GRANT TRUNCATE ON public.beneficiarios TO authenticated;
GRANT TRUNCATE ON public.beneficiarios TO service_role;
GRANT TRUNCATE ON public.car_dados_locais TO authenticated;
GRANT TRUNCATE ON public.car_dados_locais TO service_role;
GRANT TRUNCATE ON public.car_marcados TO authenticated;
GRANT TRUNCATE ON public.car_marcados TO service_role;
GRANT TRUNCATE ON public.cobertura_notificacoes TO service_role;
GRANT TRUNCATE ON public.configuracoes_sistema TO authenticated;
GRANT TRUNCATE ON public.configuracoes_sistema TO service_role;
GRANT TRUNCATE ON public.contrato_coberturas TO service_role;
GRANT TRUNCATE ON public.contrato_encerramento_documentos TO service_role;
GRANT TRUNCATE ON public.contrato_encerramento_pedidos TO service_role;
GRANT TRUNCATE ON public.contrato_encerramentos TO authenticated;
GRANT TRUNCATE ON public.contrato_encerramentos TO service_role;
GRANT TRUNCATE ON public.contratos TO authenticated;
GRANT TRUNCATE ON public.contratos TO service_role;
GRANT TRUNCATE ON public.contratos_produtos TO authenticated;
GRANT TRUNCATE ON public.contratos_produtos TO service_role;
GRANT TRUNCATE ON public.contratos_produtos_entregas TO authenticated;
GRANT TRUNCATE ON public.contratos_produtos_entregas TO service_role;
GRANT TRUNCATE ON public.cotacoes_ptax TO service_role;
GRANT TRUNCATE ON public.cotacoes_usd TO authenticated;
GRANT TRUNCATE ON public.cotacoes_usd TO service_role;
GRANT TRUNCATE ON public.despachos_seq TO authenticated;
GRANT TRUNCATE ON public.despachos_seq TO service_role;
GRANT TRUNCATE ON public.diag_audios TO service_role;
GRANT TRUNCATE ON public.diag_comunidades TO service_role;
GRANT TRUNCATE ON public.diag_exportacoes TO service_role;
GRANT TRUNCATE ON public.diag_expurgo_arquivos TO service_role;
GRANT TRUNCATE ON public.diag_fichas TO service_role;
GRANT TRUNCATE ON public.diag_fichas_historico TO service_role;
GRANT TRUNCATE ON public.diag_fichas_identificacao TO service_role;
GRANT TRUNCATE ON public.diag_fotos TO service_role;
GRANT TRUNCATE ON public.diag_localidades TO service_role;
GRANT TRUNCATE ON public.diag_moradores TO service_role;
GRANT TRUNCATE ON public.diag_moradores_identificacao TO service_role;
GRANT TRUNCATE ON public.diag_municipios TO service_role;
GRANT TRUNCATE ON public.diag_questionarios TO service_role;
GRANT TRUNCATE ON public.diag_sugestoes_ocultas TO service_role;
GRANT TRUNCATE ON public.entrega_aprovacao_senhas TO service_role;
GRANT TRUNCATE ON public.entrega_documentos TO authenticated;
GRANT TRUNCATE ON public.entrega_documentos TO service_role;
GRANT TRUNCATE ON public.execucao_financeira TO authenticated;
GRANT TRUNCATE ON public.execucao_financeira TO service_role;
GRANT TRUNCATE ON public.fornecedor_dados_bancarios TO authenticated;
GRANT TRUNCATE ON public.fornecedor_dados_bancarios TO service_role;
GRANT TRUNCATE ON public.fornecedor_usuarios TO service_role;
GRANT TRUNCATE ON public.fornecedores TO authenticated;
GRANT TRUNCATE ON public.fornecedores TO service_role;
GRANT TRUNCATE ON public.geometria_fotos TO authenticated;
GRANT TRUNCATE ON public.geometria_fotos TO service_role;
GRANT TRUNCATE ON public.gmail_sync_state TO authenticated;
GRANT TRUNCATE ON public.gmail_sync_state TO service_role;
GRANT TRUNCATE ON public.historico_indicadores TO authenticated;
GRANT TRUNCATE ON public.historico_indicadores TO service_role;
GRANT TRUNCATE ON public.indicador_historico TO authenticated;
GRANT TRUNCATE ON public.indicador_historico TO service_role;
GRANT TRUNCATE ON public.indicadores TO authenticated;
GRANT TRUNCATE ON public.indicadores TO service_role;
GRANT TRUNCATE ON public.lgpd_tratamentos TO authenticated;
GRANT TRUNCATE ON public.lgpd_tratamentos TO service_role;
GRANT TRUNCATE ON public.mapa_pontos_log TO authenticated;
GRANT TRUNCATE ON public.mapa_pontos_log TO service_role;
GRANT TRUNCATE ON public.matriz_itens TO authenticated;
GRANT TRUNCATE ON public.matriz_itens TO service_role;
GRANT TRUNCATE ON public.metas_km_refs TO authenticated;
GRANT TRUNCATE ON public.metas_km_refs TO service_role;
GRANT TRUNCATE ON public.nota_tecnica_calibracao_chaves TO service_role;
GRANT TRUNCATE ON public.nota_tecnica_conferencias TO service_role;
GRANT TRUNCATE ON public.notificacoes TO authenticated;
GRANT TRUNCATE ON public.notificacoes TO service_role;
GRANT TRUNCATE ON public.ods_refs TO authenticated;
GRANT TRUNCATE ON public.ods_refs TO service_role;
GRANT TRUNCATE ON public.orcamento_eventos TO service_role;
GRANT TRUNCATE ON public.orcamento_fontes TO service_role;
GRANT TRUNCATE ON public.outputs TO authenticated;
GRANT TRUNCATE ON public.outputs TO service_role;
GRANT TRUNCATE ON public.passagens_diarias TO authenticated;
GRANT TRUNCATE ON public.passagens_diarias TO service_role;
GRANT TRUNCATE ON public.prestacao_tokens TO authenticated;
GRANT TRUNCATE ON public.prestacao_tokens TO service_role;
GRANT TRUNCATE ON public.produto_entregue_indicador TO authenticated;
GRANT TRUNCATE ON public.produto_entregue_indicador TO service_role;
GRANT TRUNCATE ON public.produto_evidencias TO authenticated;
GRANT TRUNCATE ON public.produto_evidencias TO service_role;
GRANT TRUNCATE ON public.produto_indicador TO authenticated;
GRANT TRUNCATE ON public.produto_indicador TO service_role;
GRANT TRUNCATE ON public.produto_matriz_contribuicao TO authenticated;
GRANT TRUNCATE ON public.produto_matriz_contribuicao TO service_role;
GRANT TRUNCATE ON public.produto_notif_log TO authenticated;
GRANT TRUNCATE ON public.produto_notif_log TO service_role;
GRANT TRUNCATE ON public.produto_pontos_mapa TO authenticated;
GRANT TRUNCATE ON public.produto_pontos_mapa TO service_role;
GRANT TRUNCATE ON public.produtos_entregues TO authenticated;
GRANT TRUNCATE ON public.produtos_entregues TO service_role;
GRANT TRUNCATE ON public.pulso_ciclos TO service_role;
GRANT TRUNCATE ON public.pulso_espelho TO service_role;
GRANT TRUNCATE ON public.pulso_espelho_v2 TO service_role;
GRANT TRUNCATE ON public.pulso_exportacoes TO service_role;
GRANT TRUNCATE ON public.pulso_participacoes TO service_role;
GRANT TRUNCATE ON public.pulso_respostas TO service_role;
GRANT TRUNCATE ON public.pulso_respostas_v2 TO service_role;
GRANT TRUNCATE ON public.rem_cargo_titulares TO service_role;
GRANT TRUNCATE ON public.rem_cargos TO service_role;
GRANT TRUNCATE ON public.rem_numeracao TO service_role;
GRANT TRUNCATE ON public.rem_tentativas_senha TO service_role;
GRANT TRUNCATE ON public.remanejamento_alocacoes TO service_role;
GRANT TRUNCATE ON public.remanejamento_assinaturas TO service_role;
GRANT TRUNCATE ON public.remanejamento_etapas TO service_role;
GRANT TRUNCATE ON public.remanejamento_historico TO service_role;
GRANT TRUNCATE ON public.remanejamento_itens TO service_role;
GRANT TRUNCATE ON public.remanejamento_notificacoes TO service_role;
GRANT TRUNCATE ON public.remanejamentos TO service_role;
GRANT TRUNCATE ON public.repositorio_links TO authenticated;
GRANT TRUNCATE ON public.repositorio_links TO service_role;
GRANT TRUNCATE ON public.resultados TO authenticated;
GRANT TRUNCATE ON public.resultados TO service_role;
GRANT TRUNCATE ON public.riscos TO authenticated;
GRANT TRUNCATE ON public.riscos TO service_role;
GRANT TRUNCATE ON public.senha_tokens TO authenticated;
GRANT TRUNCATE ON public.senha_tokens TO service_role;
GRANT TRUNCATE ON public.solicitacoes_senha TO authenticated;
GRANT TRUNCATE ON public.solicitacoes_senha TO service_role;
GRANT TRUNCATE ON public.tarefa_anexos TO authenticated;
GRANT TRUNCATE ON public.tarefa_anexos TO service_role;
GRANT TRUNCATE ON public.tarefa_checklist TO authenticated;
GRANT TRUNCATE ON public.tarefa_checklist TO service_role;
GRANT TRUNCATE ON public.tarefa_comentarios TO authenticated;
GRANT TRUNCATE ON public.tarefa_comentarios TO service_role;
GRANT TRUNCATE ON public.tarefa_historico TO authenticated;
GRANT TRUNCATE ON public.tarefa_historico TO service_role;
GRANT TRUNCATE ON public.tarefa_participantes TO authenticated;
GRANT TRUNCATE ON public.tarefa_participantes TO service_role;
GRANT TRUNCATE ON public.tarefa_tdrs TO authenticated;
GRANT TRUNCATE ON public.tarefa_tdrs TO service_role;
GRANT TRUNCATE ON public.tarefa_tipos TO authenticated;
GRANT TRUNCATE ON public.tarefa_tipos TO service_role;
GRANT TRUNCATE ON public.tarefas TO authenticated;
GRANT TRUNCATE ON public.tarefas TO service_role;
GRANT TRUNCATE ON public.tdr_acoes TO authenticated;
GRANT TRUNCATE ON public.tdr_acoes TO service_role;
GRANT TRUNCATE ON public.tdr_anexos TO authenticated;
GRANT TRUNCATE ON public.tdr_anexos TO service_role;
GRANT TRUNCATE ON public.tdr_canc_numeracao TO service_role;
GRANT TRUNCATE ON public.tdr_cancelamento_assinaturas TO service_role;
GRANT TRUNCATE ON public.tdr_cancelamento_etapas TO service_role;
GRANT TRUNCATE ON public.tdr_cancelamento_historico TO service_role;
GRANT TRUNCATE ON public.tdr_cancelamento_notificacoes TO service_role;
GRANT TRUNCATE ON public.tdr_cancelamentos TO service_role;
GRANT TRUNCATE ON public.tdr_comentarios TO authenticated;
GRANT TRUNCATE ON public.tdr_comentarios TO service_role;
GRANT TRUNCATE ON public.tdr_confirmacoes TO authenticated;
GRANT TRUNCATE ON public.tdr_confirmacoes TO service_role;
GRANT TRUNCATE ON public.tdr_licitacao_empresas TO service_role;
GRANT TRUNCATE ON public.tdr_licitacao_prorrogacoes TO service_role;
GRANT TRUNCATE ON public.tdr_licitacao_rodadas TO service_role;
GRANT TRUNCATE ON public.tdr_licitacoes TO service_role;
GRANT TRUNCATE ON public.tdr_produtos_previstos TO authenticated;
GRANT TRUNCATE ON public.tdr_produtos_previstos TO service_role;
GRANT TRUNCATE ON public.tdr_responsaveis TO authenticated;
GRANT TRUNCATE ON public.tdr_responsaveis TO service_role;
GRANT TRUNCATE ON public.tdr_versoes TO authenticated;
GRANT TRUNCATE ON public.tdr_versoes TO service_role;
GRANT TRUNCATE ON public.tdr_versoes_editor TO authenticated;
GRANT TRUNCATE ON public.tdr_versoes_editor TO service_role;
GRANT TRUNCATE ON public.tdrs TO authenticated;
GRANT TRUNCATE ON public.tdrs TO service_role;
GRANT TRUNCATE ON public.trilha_metadata TO authenticated;
GRANT TRUNCATE ON public.trilha_metadata TO service_role;
GRANT TRUNCATE ON public.usuario_permissoes TO authenticated;
GRANT TRUNCATE ON public.usuario_permissoes TO service_role;
GRANT TRUNCATE ON public.usuario_senha_temporaria TO service_role;
GRANT TRUNCATE ON public.usuarios TO authenticated;
GRANT TRUNCATE ON public.usuarios TO service_role;
GRANT TRUNCATE ON public.viagem_decisoes TO authenticated;
GRANT TRUNCATE ON public.viagem_decisoes TO service_role;
GRANT TRUNCATE ON public.viagem_diarias TO authenticated;
GRANT TRUNCATE ON public.viagem_diarias TO service_role;
GRANT TRUNCATE ON public.viagem_diarias_v2 TO authenticated;
GRANT TRUNCATE ON public.viagem_diarias_v2 TO service_role;
GRANT TRUNCATE ON public.viagem_notif_log TO authenticated;
GRANT TRUNCATE ON public.viagem_notif_log TO service_role;
GRANT TRUNCATE ON public.viagem_passagens TO authenticated;
GRANT TRUNCATE ON public.viagem_passagens TO service_role;
GRANT TRUNCATE ON public.viagem_protocolo_seq_ano TO authenticated;
GRANT TRUNCATE ON public.viagem_protocolo_seq_ano TO service_role;
GRANT TRUNCATE ON public.viagem_protocolos TO authenticated;
GRANT TRUNCATE ON public.viagem_protocolos TO service_role;
GRANT TRUNCATE ON public.viagem_trechos TO authenticated;
GRANT TRUNCATE ON public.viagem_trechos TO service_role;
GRANT TRUNCATE ON public.viagem_viajantes TO authenticated;
GRANT TRUNCATE ON public.viagem_viajantes TO service_role;
GRANT TRUNCATE ON public.viagens_diarias TO authenticated;
GRANT TRUNCATE ON public.viagens_diarias TO service_role;
GRANT TRUNCATE ON public.vw_acervo_entrega_ref TO authenticated;
GRANT TRUNCATE ON public.vw_acervo_entrega_ref TO service_role;
GRANT TRUNCATE ON public.vw_acervo_midias TO authenticated;
GRANT TRUNCATE ON public.vw_acervo_midias TO service_role;
GRANT TRUNCATE ON public.vw_acervo_obras TO authenticated;
GRANT TRUNCATE ON public.vw_acervo_obras TO service_role;
GRANT TRUNCATE ON public.vw_acervo_publicacoes TO service_role;
GRANT TRUNCATE ON public.vw_dashboard_kpis TO authenticated;
GRANT TRUNCATE ON public.vw_dashboard_kpis TO service_role;
GRANT TRUNCATE ON public.vw_diag_indicadores TO service_role;
GRANT TRUNCATE ON public.vw_diag_respostas TO service_role;
GRANT TRUNCATE ON public.vw_fila_revisao TO authenticated;
GRANT TRUNCATE ON public.vw_fila_revisao TO service_role;
GRANT TRUNCATE ON public.vw_matriz_contribuicoes TO service_role;
GRANT TRUNCATE ON public.vw_matriz_progresso TO authenticated;
GRANT TRUNCATE ON public.vw_matriz_progresso TO service_role;
GRANT TRUNCATE ON public.vw_orcamento_atividade TO service_role;
GRANT TRUNCATE ON public.vw_orcamento_debitos TO service_role;
GRANT TRUNCATE ON public.vw_orcamento_fontes_saldo TO service_role;
GRANT TRUNCATE ON public.vw_pendencias_usuario TO authenticated;
GRANT TRUNCATE ON public.vw_pendencias_usuario TO service_role;
GRANT TRUNCATE ON public.vw_produtos_entregues TO authenticated;
GRANT TRUNCATE ON public.vw_produtos_entregues TO service_role;
GRANT TRUNCATE ON public.vw_rem_conferencia TO service_role;
GRANT TRUNCATE ON public.vw_rem_reservas TO service_role;
GRANT TRUNCATE ON public.vw_remanejamento_assinaturas TO service_role;
GRANT TRUNCATE ON public.vw_saldo_atividade TO service_role;
GRANT TRUNCATE ON public.vw_tarefa_progresso TO authenticated;
GRANT TRUNCATE ON public.vw_tarefa_progresso TO service_role;
GRANT TRUNCATE ON public.vw_tdr_cancelamento_assinaturas TO service_role;
GRANT TRUNCATE ON public.vw_tdr_execucao_direta TO service_role;
GRANT TRUNCATE ON public.vw_viagens_execucao TO service_role;
GRANT UPDATE ON public.acervo_capas TO authenticated;
GRANT UPDATE ON public.acervo_capas TO service_role;
GRANT UPDATE ON public.acervo_publicacoes TO service_role;
GRANT UPDATE ON public.agente_analises TO authenticated;
GRANT UPDATE ON public.agente_analises TO service_role;
GRANT UPDATE ON public.apa_demarcacoes TO authenticated;
GRANT UPDATE ON public.apa_demarcacoes TO service_role;
GRANT UPDATE ON public.api_acessos TO service_role;
GRANT UPDATE ON public.api_clientes TO service_role;
GRANT UPDATE ON public.api_pedido_notificacoes TO service_role;
GRANT UPDATE ON public.api_pedidos TO service_role;
GRANT UPDATE ON public.atividade_indicador TO authenticated;
GRANT UPDATE ON public.atividade_indicador TO service_role;
GRANT UPDATE ON public.atividade_matriz TO authenticated;
GRANT UPDATE ON public.atividade_matriz TO service_role;
GRANT UPDATE ON public.atividade_responsaveis TO authenticated;
GRANT UPDATE ON public.atividade_responsaveis TO service_role;
GRANT UPDATE ON public.atividades TO authenticated;
GRANT UPDATE ON public.atividades TO service_role;
GRANT UPDATE ON public.audit_log TO service_role;
GRANT UPDATE ON public.auditoria_execucoes TO authenticated;
GRANT UPDATE ON public.auditoria_execucoes TO service_role;
GRANT UPDATE ON public.auditoria_registros TO authenticated;
GRANT UPDATE ON public.auditoria_registros TO service_role;
GRANT UPDATE ON public.beneficiario_dados_bancarios TO authenticated;
GRANT UPDATE ON public.beneficiario_dados_bancarios TO service_role;
GRANT UPDATE ON public.beneficiarios TO authenticated;
GRANT UPDATE ON public.beneficiarios TO service_role;
GRANT UPDATE ON public.car_dados_locais TO authenticated;
GRANT UPDATE ON public.car_dados_locais TO service_role;
GRANT UPDATE ON public.car_marcados TO authenticated;
GRANT UPDATE ON public.car_marcados TO service_role;
GRANT UPDATE ON public.cobertura_notificacoes TO service_role;
GRANT UPDATE ON public.configuracoes_sistema TO authenticated;
GRANT UPDATE ON public.configuracoes_sistema TO service_role;
GRANT UPDATE ON public.contrato_coberturas TO service_role;
GRANT UPDATE ON public.contrato_encerramento_documentos TO service_role;
GRANT UPDATE ON public.contrato_encerramento_pedidos TO service_role;
GRANT UPDATE ON public.contrato_encerramentos TO authenticated;
GRANT UPDATE ON public.contrato_encerramentos TO service_role;
GRANT UPDATE ON public.contratos TO authenticated;
GRANT UPDATE ON public.contratos TO service_role;
GRANT UPDATE ON public.contratos_produtos TO authenticated;
GRANT UPDATE ON public.contratos_produtos TO service_role;
GRANT UPDATE ON public.contratos_produtos_entregas TO authenticated;
GRANT UPDATE ON public.contratos_produtos_entregas TO service_role;
GRANT UPDATE ON public.cotacoes_ptax TO service_role;
GRANT UPDATE ON public.cotacoes_usd TO authenticated;
GRANT UPDATE ON public.cotacoes_usd TO service_role;
GRANT UPDATE ON public.despachos_seq TO authenticated;
GRANT UPDATE ON public.despachos_seq TO service_role;
GRANT UPDATE ON public.diag_audios TO service_role;
GRANT UPDATE ON public.diag_comunidades TO authenticated;
GRANT UPDATE ON public.diag_comunidades TO service_role;
GRANT UPDATE ON public.diag_exportacoes TO service_role;
GRANT UPDATE ON public.diag_expurgo_arquivos TO service_role;
GRANT UPDATE ON public.diag_fichas TO service_role;
GRANT UPDATE ON public.diag_fichas_historico TO service_role;
GRANT UPDATE ON public.diag_fichas_identificacao TO service_role;
GRANT UPDATE ON public.diag_fotos TO service_role;
GRANT UPDATE ON public.diag_localidades TO authenticated;
GRANT UPDATE ON public.diag_localidades TO service_role;
GRANT UPDATE ON public.diag_moradores TO service_role;
GRANT UPDATE ON public.diag_moradores_identificacao TO service_role;
GRANT UPDATE ON public.diag_municipios TO service_role;
GRANT UPDATE ON public.diag_questionarios TO authenticated;
GRANT UPDATE ON public.diag_questionarios TO service_role;
GRANT UPDATE ON public.diag_sugestoes_ocultas TO service_role;
GRANT UPDATE ON public.entrega_aprovacao_senhas TO service_role;
GRANT UPDATE ON public.entrega_documentos TO authenticated;
GRANT UPDATE ON public.entrega_documentos TO service_role;
GRANT UPDATE ON public.execucao_financeira TO authenticated;
GRANT UPDATE ON public.execucao_financeira TO service_role;
GRANT UPDATE ON public.fornecedor_dados_bancarios TO authenticated;
GRANT UPDATE ON public.fornecedor_dados_bancarios TO service_role;
GRANT UPDATE ON public.fornecedor_usuarios TO service_role;
GRANT UPDATE ON public.fornecedores TO authenticated;
GRANT UPDATE ON public.fornecedores TO service_role;
GRANT UPDATE ON public.geometria_fotos TO authenticated;
GRANT UPDATE ON public.geometria_fotos TO service_role;
GRANT UPDATE ON public.gmail_sync_state TO authenticated;
GRANT UPDATE ON public.gmail_sync_state TO service_role;
GRANT UPDATE ON public.historico_indicadores TO authenticated;
GRANT UPDATE ON public.historico_indicadores TO service_role;
GRANT UPDATE ON public.indicador_historico TO authenticated;
GRANT UPDATE ON public.indicador_historico TO service_role;
GRANT UPDATE ON public.indicadores TO authenticated;
GRANT UPDATE ON public.indicadores TO service_role;
GRANT UPDATE ON public.lgpd_tratamentos TO authenticated;
GRANT UPDATE ON public.lgpd_tratamentos TO service_role;
GRANT UPDATE ON public.mapa_pontos_log TO authenticated;
GRANT UPDATE ON public.mapa_pontos_log TO service_role;
GRANT UPDATE ON public.matriz_itens TO authenticated;
GRANT UPDATE ON public.matriz_itens TO service_role;
GRANT UPDATE ON public.metas_km_refs TO authenticated;
GRANT UPDATE ON public.metas_km_refs TO service_role;
GRANT UPDATE ON public.nota_tecnica_calibracao_chaves TO service_role;
GRANT UPDATE ON public.nota_tecnica_conferencias TO service_role;
GRANT UPDATE ON public.notificacoes TO authenticated;
GRANT UPDATE ON public.notificacoes TO service_role;
GRANT UPDATE ON public.ods_refs TO authenticated;
GRANT UPDATE ON public.ods_refs TO service_role;
GRANT UPDATE ON public.orcamento_eventos TO service_role;
GRANT UPDATE ON public.orcamento_fontes TO service_role;
GRANT UPDATE ON public.outputs TO authenticated;
GRANT UPDATE ON public.outputs TO service_role;
GRANT UPDATE ON public.passagens_diarias TO authenticated;
GRANT UPDATE ON public.passagens_diarias TO service_role;
GRANT UPDATE ON public.prestacao_tokens TO authenticated;
GRANT UPDATE ON public.prestacao_tokens TO service_role;
GRANT UPDATE ON public.produto_entregue_indicador TO authenticated;
GRANT UPDATE ON public.produto_entregue_indicador TO service_role;
GRANT UPDATE ON public.produto_evidencias TO authenticated;
GRANT UPDATE ON public.produto_evidencias TO service_role;
GRANT UPDATE ON public.produto_indicador TO authenticated;
GRANT UPDATE ON public.produto_indicador TO service_role;
GRANT UPDATE ON public.produto_matriz_contribuicao TO authenticated;
GRANT UPDATE ON public.produto_matriz_contribuicao TO service_role;
GRANT UPDATE ON public.produto_notif_log TO authenticated;
GRANT UPDATE ON public.produto_notif_log TO service_role;
GRANT UPDATE ON public.produto_pontos_mapa TO authenticated;
GRANT UPDATE ON public.produto_pontos_mapa TO service_role;
GRANT UPDATE ON public.produtos_entregues TO authenticated;
GRANT UPDATE ON public.produtos_entregues TO service_role;
GRANT UPDATE ON public.pulso_ciclos TO service_role;
GRANT UPDATE ON public.pulso_espelho TO service_role;
GRANT UPDATE ON public.pulso_espelho_v2 TO service_role;
GRANT UPDATE ON public.pulso_exportacoes TO service_role;
GRANT UPDATE ON public.pulso_participacoes TO service_role;
GRANT UPDATE ON public.pulso_respostas TO service_role;
GRANT UPDATE ON public.pulso_respostas_v2 TO service_role;
GRANT UPDATE ON public.rem_cargo_titulares TO service_role;
GRANT UPDATE ON public.rem_cargos TO service_role;
GRANT UPDATE ON public.rem_numeracao TO service_role;
GRANT UPDATE ON public.rem_tentativas_senha TO service_role;
GRANT UPDATE ON public.remanejamento_alocacoes TO service_role;
GRANT UPDATE ON public.remanejamento_assinaturas TO service_role;
GRANT UPDATE ON public.remanejamento_etapas TO service_role;
GRANT UPDATE ON public.remanejamento_historico TO service_role;
GRANT UPDATE ON public.remanejamento_itens TO service_role;
GRANT UPDATE ON public.remanejamento_notificacoes TO service_role;
GRANT UPDATE ON public.remanejamentos TO service_role;
GRANT UPDATE ON public.repositorio_links TO authenticated;
GRANT UPDATE ON public.repositorio_links TO service_role;
GRANT UPDATE ON public.resultados TO authenticated;
GRANT UPDATE ON public.resultados TO service_role;
GRANT UPDATE ON public.riscos TO authenticated;
GRANT UPDATE ON public.riscos TO service_role;
GRANT UPDATE ON public.senha_tokens TO authenticated;
GRANT UPDATE ON public.senha_tokens TO service_role;
GRANT UPDATE ON public.solicitacoes_senha TO authenticated;
GRANT UPDATE ON public.solicitacoes_senha TO service_role;
GRANT UPDATE ON public.tarefa_anexos TO authenticated;
GRANT UPDATE ON public.tarefa_anexos TO service_role;
GRANT UPDATE ON public.tarefa_checklist TO authenticated;
GRANT UPDATE ON public.tarefa_checklist TO service_role;
GRANT UPDATE ON public.tarefa_comentarios TO authenticated;
GRANT UPDATE ON public.tarefa_comentarios TO service_role;
GRANT UPDATE ON public.tarefa_historico TO authenticated;
GRANT UPDATE ON public.tarefa_historico TO service_role;
GRANT UPDATE ON public.tarefa_participantes TO authenticated;
GRANT UPDATE ON public.tarefa_participantes TO service_role;
GRANT UPDATE ON public.tarefa_tdrs TO authenticated;
GRANT UPDATE ON public.tarefa_tdrs TO service_role;
GRANT UPDATE ON public.tarefa_tipos TO authenticated;
GRANT UPDATE ON public.tarefa_tipos TO service_role;
GRANT UPDATE ON public.tarefas TO authenticated;
GRANT UPDATE ON public.tarefas TO service_role;
GRANT UPDATE ON public.tdr_acoes TO authenticated;
GRANT UPDATE ON public.tdr_acoes TO service_role;
GRANT UPDATE ON public.tdr_anexos TO authenticated;
GRANT UPDATE ON public.tdr_anexos TO service_role;
GRANT UPDATE ON public.tdr_canc_numeracao TO service_role;
GRANT UPDATE ON public.tdr_cancelamento_assinaturas TO service_role;
GRANT UPDATE ON public.tdr_cancelamento_etapas TO service_role;
GRANT UPDATE ON public.tdr_cancelamento_historico TO service_role;
GRANT UPDATE ON public.tdr_cancelamento_notificacoes TO service_role;
GRANT UPDATE ON public.tdr_cancelamentos TO service_role;
GRANT UPDATE ON public.tdr_comentarios TO authenticated;
GRANT UPDATE ON public.tdr_comentarios TO service_role;
GRANT UPDATE ON public.tdr_confirmacoes TO authenticated;
GRANT UPDATE ON public.tdr_confirmacoes TO service_role;
GRANT UPDATE ON public.tdr_licitacao_empresas TO service_role;
GRANT UPDATE ON public.tdr_licitacao_prorrogacoes TO service_role;
GRANT UPDATE ON public.tdr_licitacao_rodadas TO service_role;
GRANT UPDATE ON public.tdr_licitacoes TO service_role;
GRANT UPDATE ON public.tdr_produtos_previstos TO authenticated;
GRANT UPDATE ON public.tdr_produtos_previstos TO service_role;
GRANT UPDATE ON public.tdr_responsaveis TO authenticated;
GRANT UPDATE ON public.tdr_responsaveis TO service_role;
GRANT UPDATE ON public.tdr_versoes TO authenticated;
GRANT UPDATE ON public.tdr_versoes TO service_role;
GRANT UPDATE ON public.tdr_versoes_editor TO authenticated;
GRANT UPDATE ON public.tdr_versoes_editor TO service_role;
GRANT UPDATE ON public.tdrs TO authenticated;
GRANT UPDATE ON public.tdrs TO service_role;
GRANT UPDATE ON public.trilha_metadata TO authenticated;
GRANT UPDATE ON public.trilha_metadata TO service_role;
GRANT UPDATE ON public.usuario_permissoes TO authenticated;
GRANT UPDATE ON public.usuario_permissoes TO service_role;
GRANT UPDATE ON public.usuario_senha_temporaria TO service_role;
GRANT UPDATE ON public.usuarios TO authenticated;
GRANT UPDATE ON public.usuarios TO service_role;
GRANT UPDATE ON public.viagem_decisoes TO authenticated;
GRANT UPDATE ON public.viagem_decisoes TO service_role;
GRANT UPDATE ON public.viagem_diarias TO authenticated;
GRANT UPDATE ON public.viagem_diarias TO service_role;
GRANT UPDATE ON public.viagem_diarias_v2 TO authenticated;
GRANT UPDATE ON public.viagem_diarias_v2 TO service_role;
GRANT UPDATE ON public.viagem_notif_log TO authenticated;
GRANT UPDATE ON public.viagem_notif_log TO service_role;
GRANT UPDATE ON public.viagem_passagens TO authenticated;
GRANT UPDATE ON public.viagem_passagens TO service_role;
GRANT UPDATE ON public.viagem_protocolo_seq_ano TO authenticated;
GRANT UPDATE ON public.viagem_protocolo_seq_ano TO service_role;
GRANT UPDATE ON public.viagem_protocolos TO authenticated;
GRANT UPDATE ON public.viagem_protocolos TO service_role;
GRANT UPDATE ON public.viagem_trechos TO authenticated;
GRANT UPDATE ON public.viagem_trechos TO service_role;
GRANT UPDATE ON public.viagem_viajantes TO authenticated;
GRANT UPDATE ON public.viagem_viajantes TO service_role;
GRANT UPDATE ON public.viagens_diarias TO authenticated;
GRANT UPDATE ON public.viagens_diarias TO service_role;
GRANT UPDATE ON public.vw_acervo_entrega_ref TO authenticated;
GRANT UPDATE ON public.vw_acervo_entrega_ref TO service_role;
GRANT UPDATE ON public.vw_acervo_midias TO authenticated;
GRANT UPDATE ON public.vw_acervo_midias TO service_role;
GRANT UPDATE ON public.vw_acervo_obras TO authenticated;
GRANT UPDATE ON public.vw_acervo_obras TO service_role;
GRANT UPDATE ON public.vw_acervo_publicacoes TO service_role;
GRANT UPDATE ON public.vw_dashboard_kpis TO authenticated;
GRANT UPDATE ON public.vw_dashboard_kpis TO service_role;
GRANT UPDATE ON public.vw_diag_indicadores TO service_role;
GRANT UPDATE ON public.vw_diag_respostas TO service_role;
GRANT UPDATE ON public.vw_fila_revisao TO authenticated;
GRANT UPDATE ON public.vw_fila_revisao TO service_role;
GRANT UPDATE ON public.vw_matriz_contribuicoes TO service_role;
GRANT UPDATE ON public.vw_matriz_progresso TO authenticated;
GRANT UPDATE ON public.vw_matriz_progresso TO service_role;
GRANT UPDATE ON public.vw_orcamento_atividade TO service_role;
GRANT UPDATE ON public.vw_orcamento_debitos TO service_role;
GRANT UPDATE ON public.vw_orcamento_fontes_saldo TO service_role;
GRANT UPDATE ON public.vw_pendencias_usuario TO authenticated;
GRANT UPDATE ON public.vw_pendencias_usuario TO service_role;
GRANT UPDATE ON public.vw_produtos_entregues TO authenticated;
GRANT UPDATE ON public.vw_produtos_entregues TO service_role;
GRANT UPDATE ON public.vw_rem_conferencia TO service_role;
GRANT UPDATE ON public.vw_rem_reservas TO service_role;
GRANT UPDATE ON public.vw_remanejamento_assinaturas TO service_role;
GRANT UPDATE ON public.vw_saldo_atividade TO service_role;
GRANT UPDATE ON public.vw_tarefa_progresso TO authenticated;
GRANT UPDATE ON public.vw_tarefa_progresso TO service_role;
GRANT UPDATE ON public.vw_tdr_cancelamento_assinaturas TO service_role;
GRANT UPDATE ON public.vw_tdr_execucao_direta TO service_role;
GRANT UPDATE ON public.vw_viagens_execucao TO service_role;

-- ===== GRANTS (funções) =====
GRANT EXECUTE ON FUNCTION public.apagar_tdr(p_tdr_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apagar_tdr(p_tdr_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.diag_apagar_treino() TO authenticated;
GRANT EXECUTE ON FUNCTION public.diag_apagar_treino() TO service_role;
GRANT EXECUTE ON FUNCTION public.diag_enviar_ficha(p_ficha jsonb, p_moradores jsonb, p_fotos jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.diag_enviar_ficha(p_ficha jsonb, p_moradores jsonb, p_fotos jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.diag_exportar(p_identificada boolean, p_status text[], p_municipio_ibge integer, p_comunidade_id uuid, p_questionario_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.diag_exportar(p_identificada boolean, p_status text[], p_municipio_ibge integer, p_comunidade_id uuid, p_questionario_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.diag_meu_painel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.diag_meu_painel() TO service_role;
GRANT EXECUTE ON FUNCTION public.diag_mudar_status(p_ficha_id uuid, p_status text, p_motivo text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.diag_mudar_status(p_ficha_id uuid, p_status text, p_motivo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.diag_transcrever_audio(p_audio_id uuid, p_texto text, p_origem text, p_modelo text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.diag_transcrever_audio(p_audio_id uuid, p_texto text, p_origem text, p_modelo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_acervo_definir_publico(p_midia_id text, p_publico boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_acervo_definir_publico(p_midia_id text, p_publico boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_acervo_extensao(p_nome text, p_url text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_acervo_extensao(p_nome text, p_url text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_acervo_extensao(p_nome text, p_url text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_acervo_tipo_midia(p_nome text, p_url text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_acervo_tipo_midia(p_nome text, p_url text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_acervo_tipo_midia(p_nome text, p_url text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_alertar_sem_responsavel() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_acessos(p_limite integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_api_acessos(p_limite integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_atividades() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_cliente(p_chave text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_clientes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_api_clientes() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_criar_cliente(p_nome text, p_descricao text, p_escopos text[], p_origens text[], p_expira_em timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_api_criar_cliente(p_nome text, p_descricao text, p_escopos text[], p_origens text[], p_expira_em timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_emitir_retirada(p_pedido uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_matriz() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_pedido_decidir(p_usuario_id uuid, p_pedido uuid, p_decisao text, p_parecer text, p_config jsonb, p_hash text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_pedido_hash(p_pedido uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_pedido_registrar(p jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_pedidos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_api_pedidos() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_pode_administrar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_api_pode_administrar() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_registrar(p_cliente uuid, p_rota text, p_formato text, p_status integer, p_linhas integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_resumo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_revogar_cliente(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_api_revogar_cliente(p_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_api_rotina() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_atribuir_participante(p_tarefa_id uuid, p_usuario_id uuid, p_papel text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_atribuir_participante(p_tarefa_id uuid, p_usuario_id uuid, p_papel text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_email_usuario(p_usuario_id uuid, p_novo_email text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_email_usuario(p_usuario_id uuid, p_novo_email text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_indicador(p_produto_entregue_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_indicador(p_produto_entregue_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_situacao_produto() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_situacao_produto() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_situacao_produto() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_audit_log(p_operacao operacao_audit, p_tabela text, p_registro_id text, p_dados_antes jsonb, p_dados_depois jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_auditoria_orcamento() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_auditoria_viagens() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cob_cancelar_pedidos(p_contrato uuid, p_motivo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cob_excedente_brl(p_grupo uuid, p_tdr uuid, p_contrato uuid, p_valor numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cob_livre(p_atividade uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cob_livre(p_atividade uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cob_notificar(p_contrato uuid, p_evento text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cob_reavaliar(p_atividade uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cob_registrar(p_grupo uuid, p_tdr uuid, p_atividade uuid, p_contrato uuid, p_evento text, p_valor_ant numeric, p_valor_novo numeric, p_depois_brl numeric, p_pode_travar boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_comentar_tarefa(p_tarefa_id uuid, p_corpo text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_comentar_tarefa(p_tarefa_id uuid, p_corpo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_comentar_tarefa_fornecedor(p_tarefa_id uuid, p_fornecedor_id uuid, p_corpo text, p_checklist_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_comentar_tarefa_sistema(p_tarefa_id uuid, p_autor_id uuid, p_corpo text, p_origem text, p_checklist_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_conferir_orcamento() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_conferir_orcamento() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_consumir_token_senha(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_consumir_token_senha(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_contrato_auto_encerrar(p_contrato uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_contrato_da_entrega(p_produto_id uuid, p_contrato_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_contrato_da_entrega(p_produto_id uuid, p_contrato_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_contrato_id_do_path(p_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_contrato_id_do_path(p_name text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cotacao_atual() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_cotacao_atual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cotacao_atual() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cotacao_usd(p_data date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cotacao_usd(p_data date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_criar_tarefa(p_titulo text, p_descricao text, p_prioridade prioridade_tarefa, p_dt_inicio date, p_dt_prazo date, p_entidade_tipo text, p_entidade_id uuid, p_atividade_id uuid, p_fornecedor_id uuid, p_notificar_fornecedor boolean, p_responsaveis uuid[], p_observadores uuid[], p_restrita boolean, p_tipo text, p_dados_tipo jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_criar_tarefa(p_titulo text, p_descricao text, p_prioridade prioridade_tarefa, p_dt_inicio date, p_dt_prazo date, p_entidade_tipo text, p_entidade_id uuid, p_atividade_id uuid, p_fornecedor_id uuid, p_notificar_fornecedor boolean, p_responsaveis uuid[], p_observadores uuid[], p_restrita boolean, p_tipo text, p_dados_tipo jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_criar_usuario(p_email text, p_senha text, p_nome text, p_perfil text, p_telefone text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_criar_usuario(p_email text, p_senha text, p_nome text, p_perfil text, p_telefone text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_definir_restricao_tarefa(p_tarefa_id uuid, p_restrita boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_definir_restricao_tarefa(p_tarefa_id uuid, p_restrita boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_agregados(p_nivel text, p_municipio_ibge integer, p_por_sexo boolean, p_somente_validadas boolean, p_suprimir boolean, p_minimo integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_agregados(p_nivel text, p_municipio_ibge integer, p_por_sexo boolean, p_somente_validadas boolean, p_suprimir boolean, p_minimo integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_alertas_audio(p_alertas jsonb, p_ficha_id uuid, p_estrutura jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_aplicar_retencao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_aplicaveis(p_estrutura jsonb, p_respostas jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_aplicaveis(p_estrutura jsonb, p_respostas jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_audio_expurgo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_audios_pendentes(p_ficha_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_audios_pendentes(p_ficha_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_audios_retencao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_bloqueia_ident_apos_retencao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_calcular_alertas(p_estrutura jsonb, p_respostas jsonb, p_moradores jsonb, p_usou_carencia boolean, p_comunidade_nova boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_calcular_alertas(p_estrutura jsonb, p_respostas jsonb, p_moradores jsonb, p_usou_carencia boolean, p_comunidade_nova boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_chaves_com_sugestao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_chaves_com_sugestao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_cond(p_cond jsonb, p_respostas jsonb, p_aplicaveis text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_cond(p_cond jsonb, p_respostas jsonb, p_aplicaveis text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_derivar(p_moradores jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_derivar(p_moradores jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_ficha_historico() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_foto_expurgo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_foto_pode_enviar(p_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_foto_pode_enviar(p_name text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_foto_pode_ler(p_name text, p_owner uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_foto_pode_ler(p_name text, p_owner uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_maior_nivel(p_estrutura jsonb, p_pergunta jsonb, p_moradores jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_maior_nivel(p_estrutura jsonb, p_pergunta jsonb, p_moradores jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_normalizar_respostas(p_estrutura jsonb, p_respostas jsonb, p_moradores jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_normalizar_respostas(p_estrutura jsonb, p_respostas jsonb, p_moradores jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_normalizar_texto(p text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_normalizar_texto(p text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_perfil_ativo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_perfil_ativo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_perguntas(p_estrutura jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_perguntas(p_estrutura jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_aplicar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_aplicar() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_consultar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_consultar() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_gerir() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_gerir() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_treinar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_treinar() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_ver_ficha(p_ficha_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_ver_ficha(p_ficha_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_ver_identificacao(p_ficha_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_ver_identificacao(p_ficha_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_ver_numeros() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_pode_ver_numeros() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_questionario_guarda() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_sha256(p text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_sha256(p text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_sugestoes(p_chave text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_sugestoes(p_chave text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_touch() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_uuid_do_path(p_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_uuid_do_path(p_name text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_valida_audios() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_diag_validar_moradores(p_estrutura jsonb, p_moradores jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diag_validar_moradores(p_estrutura jsonb, p_moradores jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_editar_tarefa(p_tarefa_id uuid, p_titulo text, p_descricao text, p_prioridade prioridade_tarefa, p_dt_inicio date, p_entidade_tipo text, p_entidade_id uuid, p_atividade_id uuid, p_fornecedor_id uuid, p_notificar_fornecedor boolean, p_tipo text, p_dados_tipo jsonb, p_mudar_prazo boolean, p_dt_prazo date, p_motivo text, p_versao timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_editar_tarefa(p_tarefa_id uuid, p_titulo text, p_descricao text, p_prioridade prioridade_tarefa, p_dt_inicio date, p_entidade_tipo text, p_entidade_id uuid, p_atividade_id uuid, p_fornecedor_id uuid, p_notificar_fornecedor boolean, p_tipo text, p_dados_tipo jsonb, p_mudar_prazo boolean, p_dt_prazo date, p_motivo text, p_versao timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_eh_fornecedor_do_contrato(p_contrato_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_eh_fornecedor_do_contrato(p_contrato_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_eh_fornecedor_vinculado(p_fornecedor_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_eh_fornecedor_vinculado(p_fornecedor_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_encerramento_anexar_documento(p_encerramento_id uuid, p_caminho text, p_nome text, p_sha256 text, p_tamanho bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_encerramento_anexar_documento(p_encerramento_id uuid, p_caminho text, p_nome text, p_sha256 text, p_tamanho bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_encerramento_criar_tarefa(p_enc uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_encp_aprovadores(p_atividade uuid, p_excluir uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_encp_avisar(p_usuarios uuid[], p_tipo text, p_titulo text, p_msg text, p_contrato uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_encp_cancelar(p_pedido uuid, p_motivo text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_encp_cancelar(p_pedido uuid, p_motivo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_encp_decidir(p_usuario_id uuid, p_pedido uuid, p_decisao text, p_parecer text, p_hash text, p_ip text, p_user_agent text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_encp_fechar_tarefa(p_pedido uuid, p_status text, p_autor uuid, p_texto text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_encp_hash(p_pedido uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_encp_hash(p_pedido uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_encp_pedir(p_contrato uuid, p_produtos uuid[], p_motivo text, p_termo jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_encp_pedir(p_contrato uuid, p_produtos uuid[], p_motivo text, p_termo jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_encp_pode_decidir(p_pedido uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_encp_pode_decidir(p_pedido uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_encp_ve_contrato(p_contrato uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_entrega_aprovada(p_entrega_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entrega_aprovada(p_entrega_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_entregas_docs_pode_enviar(p_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entregas_docs_pode_enviar(p_name text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_estornar_economia_tdr(p_encerramento_id uuid, p_motivo text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_estornar_economia_tdr(p_encerramento_id uuid, p_motivo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_viajante() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_viajante() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_viajante() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_vincular_usuario(p_fornecedor_id uuid, p_usuario_id uuid, p_ativo boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_vincular_usuario(p_fornecedor_id uuid, p_usuario_id uuid, p_ativo boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fornecedores_diretorio() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fornecedores_diretorio() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_gerar_lancamento_entrega() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_gerar_lancamento_entrega() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_gerar_lancamento_entrega() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_gerar_numero_protocolo() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_gerar_numero_protocolo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_gerar_numero_protocolo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_hist_fmt(p_tipo text, p_valor text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_hist_fmt(p_tipo text, p_valor text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hist_fmt(p_tipo text, p_valor text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_hoje_acre() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hoje_acre() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lancar_viagem_financeiro() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_lancar_viagem_financeiro() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lancar_viagem_financeiro() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lgpd_conferir_tabelas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lgpd_conferir_tabelas() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lgpd_trat_touch() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_liberar_economia_tdr(p_tdr_id uuid, p_justificativa text, p_taxa numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_liberar_economia_tdr(p_tdr_id uuid, p_justificativa text, p_taxa numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_classe(p_modalidade text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lic_classe(p_modalidade text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_criar_tarefa(p_rodada uuid, p_tipo text, p_prazo date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_editar(p_rodada uuid, p jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lic_editar(p_rodada uuid, p jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_enviar(p_tdr uuid, p jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lic_enviar(p_tdr uuid, p jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_fechar_tarefa(p_tarefa uuid, p_status text, p_autor uuid, p_texto text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_gravar_empresas(p_rodada uuid, p_empresas jsonb, p_uid uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_pessoas(p_rodada uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_pode(p_tdr uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lic_pode(p_tdr uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_prorrogar(p_rodada uuid, p_prazo timestamp with time zone, p_motivo text, p_aviso_url text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lic_prorrogar(p_rodada uuid, p_prazo timestamp with time zone, p_motivo text, p_aviso_url text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_relancar(p_rodada uuid, p_motivo text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lic_relancar(p_rodada uuid, p_motivo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_resultado(p_rodada uuid, p_situacao text, p_n integer, p_empresas uuid[], p_novas jsonb, p_obs text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lic_resultado(p_rodada uuid, p_situacao text, p_n integer, p_empresas uuid[], p_novas jsonb, p_obs text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_rotina() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lic_validar(p_modalidade text, p jsonb, p_n_empresas integer, p_exige_prazo boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lic_validar(p_modalidade text, p jsonb, p_n_empresas integer, p_exige_prazo boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_mapa_pode_editar(p_entrega_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mapa_pode_editar(p_entrega_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_mascara_doc(p_doc text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_mascara_doc(p_doc text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mascara_doc(p_doc text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_mudar_status_tarefa(p_tarefa_id uuid, p_status status_tarefa, p_nota text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mudar_status_tarefa(p_tarefa_id uuid, p_status status_tarefa, p_nota text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_notificar_avaliacao_produto() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_notificar_despacho_produto() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_notificar_despacho_produto() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_notificar_despacho_produto() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_notificar_protocolo_criado() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_notificar_protocolo_situacao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_notificar_protocolo_situacao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_notificar_solicitacao_senha() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_notificar_viagem_solicitada() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_nt_caminho(p_url text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nt_caminho(p_url text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_orcamento_extrato(p_atividade uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_orcamento_extrato(p_atividade uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_orcamento_recalcular_cache(p_atividade_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_perfil_atual() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_perfil_atual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_perfil_atual() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pode_avaliar_contrato(p_contrato_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pode_avaliar_contrato(p_contrato_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pode_registrar_entrega(p_contrato_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pode_registrar_entrega(p_contrato_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pode_ver_tarefa(p_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_pode_ver_tarefa(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pode_ver_tarefa(p_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_produto_id_do_path(p_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_produto_id_do_path(p_name text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_produto_pago_ao_pagar_lancamento() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_produto_pago_ao_pagar_lancamento() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_produto_pago_ao_pagar_lancamento() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_produto_permissoes(p_contrato_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_produto_permissoes(p_contrato_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_protege_campos_usuario() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_protege_campos_usuario() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_protege_campos_usuario() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_publico_api_retirar(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_publico_api_retirar(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_publico_api_retirar(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_publico_camadas() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_publico_camadas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_publico_camadas() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_publico_mapa() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_publico_mapa() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_publico_mapa() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_publico_operacional() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_publico_operacional() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_publico_operacional() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_publico_pedir_nova_senha(p_email text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_publico_pedir_nova_senha(p_email text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_publico_pedir_nova_senha(p_email text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_publico_pulso_ciclo(p_token text, p_dispositivo text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_publico_pulso_ciclo(p_token text, p_dispositivo text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_publico_pulso_ciclo(p_token text, p_dispositivo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_publico_pulso_responder(p_token text, p_respostas jsonb, p_dispositivo text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_publico_pulso_responder(p_token text, p_respostas jsonb, p_dispositivo text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_publico_pulso_responder(p_token text, p_respostas jsonb, p_dispositivo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_publico_resultados() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_publico_resultados() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_publico_resultados() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_publico_tipos_mapa() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_publico_tipos_mapa() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_publico_tipos_mapa() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_aberto(c pulso_ciclos) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_alterar(p_ciclo uuid, p_dados jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pulso_alterar(p_ciclo uuid, p_dados jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_ciclos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pulso_ciclos() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_contagem(p_ciclo uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pulso_contagem(p_ciclo uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_criar(p_titulo text, p_aceita_convidados boolean, p_limite_convidados integer, p_fecha_em timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_criar_ciclo(p_titulo text, p_aceita_convidados boolean, p_limite_convidados integer, p_fecha_em timestamp with time zone, p_copiar_de uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pulso_criar_ciclo(p_titulo text, p_aceita_convidados boolean, p_limite_convidados integer, p_fecha_em timestamp with time zone, p_copiar_de uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_dono(c pulso_ciclos) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_exportar(p_ciclo uuid, p_formato text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pulso_exportar(p_ciclo uuid, p_formato text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_exportar_lista() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pulso_exportar_lista() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_gestor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pulso_gestor() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_grupo_atual() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_hash_disp(p_ciclo uuid, p_disp text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_metricas(p_ciclo uuid, p_grupos text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_n_respostas(p_ciclo uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_participacao(p_ciclo uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_perguntas_padrao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pulso_perguntas_padrao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_pode_ver(c pulso_ciclos) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_resultado(p_ciclo uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pulso_resultado(p_ciclo uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_salvar_espelho(p_ciclo uuid, p_q jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pulso_salvar_espelho(p_ciclo uuid, p_q jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_salvar_perguntas(p_ciclo uuid, p_perguntas jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pulso_salvar_perguntas(p_ciclo uuid, p_perguntas jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_touch() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_usuario_ativo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pulso_validar_perguntas(p jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rascunho_avisar_titular() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_razao_orcamento_ativo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reagendar_tarefa(p_tarefa_id uuid, p_dt_prazo date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reagendar_tarefa(p_tarefa_id uuid, p_dt_prazo date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_realizar_protocolo() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_realizar_protocolo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_realizar_protocolo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_recalcular_utilizado_contrato() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_recalcular_utilizado_contrato() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recalcular_utilizado_contrato() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_redigir_jsonb(p jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_redigir_jsonb(p jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_redigir_jsonb(p jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_registrar_acao_tdr(p_tdr_id uuid, p_usuario_id uuid, p_acao character varying, p_comentario text, p_ip character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_registrar_acao_tdr(p_tdr_id uuid, p_usuario_id uuid, p_acao character varying, p_comentario text, p_ip character varying) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_assinar(p_usuario_id uuid, p_remanejamento_id uuid, p_decisao text, p_motivo text, p_hash text, p_ip text, p_user_agent text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_criar_estorno(p_rem uuid, p_justificativa text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rem_criar_estorno(p_rem uuid, p_justificativa text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_designar_titular(p_cargo text, p_usuario_id uuid, p_ato text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rem_designar_titular(p_cargo text, p_usuario_id uuid, p_ato text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_efetivar(p_rem uuid, p_usuario uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_efetivar_estorno(p_rem uuid, p_usuario uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_fonte_livre(p_fonte_id uuid, p_remanejamento_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rem_fonte_livre(p_fonte_id uuid, p_remanejamento_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_hash(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rem_hash(p_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_log(p_rem uuid, p_evento text, p_de text, p_para text, p_etapa integer, p_usuario uuid, p_motivo text, p_detalhes jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_notificar(p_rem uuid, p_usuarios uuid[], p_evento text, p_motivo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_registrar_tentativa(p_usuario_id uuid, p_sucesso boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_salvar(p_id uuid, p_dados jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rem_salvar(p_id uuid, p_dados jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_senha_bloqueada_ate(p_usuario_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_signatarios_etapa(p_etapa_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rem_signatarios_etapa(p_etapa_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_titular(p_cargo text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rem_titular(p_cargo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_validar(p_rem uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rem_validar(p_rem uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rem_validar_estorno(p_rem uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_remover_participante(p_tarefa_id uuid, p_usuario_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_remover_participante(p_tarefa_id uuid, p_usuario_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_resetar_senha_usuario(p_usuario_id uuid, p_nova_senha text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resetar_senha_usuario(p_usuario_id uuid, p_nova_senha text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_status_indicador(p_valor_atingido numeric, p_meta numeric, p_data_inicio date, p_data_fim date) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_status_indicador(p_valor_atingido numeric, p_meta numeric, p_data_inicio date, p_data_fim date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_status_indicador(p_valor_atingido numeric, p_meta numeric, p_data_inicio date, p_data_fim date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_anexo_coerente() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_anexo_coerente() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_anexo_coerente() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_anexo_historico() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_aprovador(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_aprovador(p_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_atividade_limpa_tdrs() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_checklist_historico() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_checklist_responsavel() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_guarda_restrita() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_guarda_status() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_guarda_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_guarda_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_id_do_path(p_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_id_do_path(p_name text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_notificar(p_usuarios uuid[], p_tipo text, p_titulo text, p_msg text, p_tarefa_id uuid, p_excluir uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_pessoal(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_pessoal(p_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_pode_delegar(p_atividade_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_pode_delegar(p_atividade_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_pode_delegar(p_atividade_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_pode_editar(p_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_pode_editar(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_pode_editar(p_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_registra_edicao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_set_codigo() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_set_codigo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_set_codigo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_tdr_coerente() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_tdr_coerente() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_tdr_coerente() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_tdr_historico() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_tipo_guarda() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_tipo_guarda() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_tipo_guarda() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_tipo_historico() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_touch() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_touch() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_touch() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_valida_tipo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tcan_assinar(p_usuario_id uuid, p_cancelamento_id uuid, p_decisao text, p_motivo text, p_hash text, p_ip text, p_user_agent text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tcan_efetivar(p_can uuid, p_usuario uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tcan_hash(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tcan_hash(p_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tcan_log(p_can uuid, p_evento text, p_de text, p_para text, p_etapa integer, p_usuario uuid, p_motivo text, p_detalhes jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tcan_notificar(p_can uuid, p_usuarios uuid[], p_evento text, p_motivo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tcan_retrato(p_can uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tcan_salvar(p_id uuid, p_dados jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tcan_salvar(p_id uuid, p_dados jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tcan_signatarios_etapa(p_etapa_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tcan_signatarios_etapa(p_etapa_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tcan_validar(p_can uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tcan_validar(p_can uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tdr_direta_consumo_outros(p_tdr uuid, p_lanc uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tdr_licitacao_sem_exito(p_tdr_id uuid, p_resultado text, p_motivo text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tdr_licitacao_sem_exito(p_tdr_id uuid, p_resultado text, p_motivo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_travar_produto_pago() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_travar_produto_pago() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_travar_produto_pago() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_atividade_dotacao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_atividade_guarda_orcamento() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_audit() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_trg_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_audit() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_ced_imutavel() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_cob_imutavel() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_cob_trava_execucao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_contrato_auto_encerrar() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_contrato_aviso_cobertura() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_contrato_cobertura() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_contrato_cobertura_pos() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_contrato_guarda_encerramento() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_contrato_tdr_cancelamento() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_cotacoes_imutavel() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_cp_guarda_fornecedor() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_trg_cp_guarda_fornecedor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_cp_guarda_fornecedor() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_cp_guarda_situacao() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_trg_cp_guarda_situacao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_cp_guarda_situacao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_ef_aviso_tdr_direta() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_ef_limite_tdr_direta() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_encerramento_guarda() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_encerramento_ptax() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_encerramento_razao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_encerramento_so_aprovado() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_encerramento_tarefa() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_encp_guarda() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_entrega_exige_nota() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_entrega_guarda_avaliacao() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_trg_entrega_guarda_avaliacao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_entrega_guarda_avaliacao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_fdb_carimbo() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_trg_fdb_carimbo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_fdb_carimbo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_fonte_cobertura_pos() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_fornecedor_sem_banco() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_trg_fornecedor_sem_banco() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_fornecedor_sem_banco() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_numero_tdr() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_trg_numero_tdr() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_numero_tdr() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_orcamento_fontes_cache() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_orcamento_fontes_imutavel() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_orcamento_fontes_valida() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_produto_aprovado() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_trg_produto_aprovado() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_produto_aprovado() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_rem_assinaturas_guarda() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_rem_cobertura_pos() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_rem_etapas_guarda() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_rem_filhos_rascunho() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_rem_pedido_guarda() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_rem_titulares_guarda() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_tcan_assinaturas_guarda() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_tcan_etapas_guarda() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_tcan_imutavel() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_tcan_pedido_guarda() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_tdr_cobertura_pos() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_tdr_evento_orcamento() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_tdr_exige_valor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_tdr_exige_valor() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_tdr_guarda_cancelamento() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_tdr_guarda_licitacao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_tdr_licitacao_fase() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_usuario_ban() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_trg_usuario_ban() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_usuario_ban() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_verificar_saldo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_versionar_tdr() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_trg_versionar_tdr() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_versionar_tdr() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_viagem_guarda_decisao() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_viagem_lanc_tdr() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trg_viagem_viaj_guarda() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_validar_evidencia_entrega() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_validar_evidencia_entrega() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validar_evidencia_entrega() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_validar_evidencia_produto() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_validar_evidencia_produto() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validar_evidencia_produto() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_verificar_conformidade(p_produto_entregue_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_verificar_conformidade(p_produto_entregue_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verificar_conformidade(p_produto_entregue_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_verificar_senha(p_senha text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_viagem_avisar(p_protocolo_id uuid, p_evento text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_viagem_avisar(p_protocolo_id uuid, p_evento text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_viagem_conclusao_liberar(p_protocolo_id uuid, p_segundos integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_viagem_conclusao_reservar(p_protocolo_id uuid, p_segundos integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_viagem_decidir(p_usuario_id uuid, p_protocolo uuid, p_decisao text, p_motivo text, p_hash text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_viagem_hash(p_protocolo uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_viagem_hash(p_protocolo uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_viagem_norm(t text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_viagem_norm(t text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_viagem_participa(p_protocolo uuid, p_usuario uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_viagem_pode_decidir(p_protocolo uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_viagem_pode_decidir(p_protocolo uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_viagem_regra(p_protocolo uuid, p_usuario uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_viagem_tdr(p_atividade uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_viagem_tdr(p_atividade uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_numero_despacho() TO anon;
GRANT EXECUTE ON FUNCTION public.gerar_numero_despacho() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_numero_despacho() TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_numero_tdr(p_atividade_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.gerar_numero_tdr(p_atividade_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_numero_tdr(p_atividade_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_minhas_atividades() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_minhas_atividades() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_minhas_entregas_devolvidas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_minhas_entregas_devolvidas() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_minhas_tarefas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_minhas_tarefas() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_monitoramento_banco() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monitoramento_banco() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_produtos_vencendo(dias_limite integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_produtos_vencendo(dias_limite integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_signed_url(p_path text, p_expires_in integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_signed_url(p_path text, p_expires_in integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.marcar_notificacoes_lidas(p_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_notificacoes_lidas(p_ids uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_em() TO anon;
GRANT EXECUTE ON FUNCTION public.set_updated_em() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_em() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_atividade_responsavel_id() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_atividade_responsavel_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_atividade_responsavel_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.tem_permissao(p_modulo text) TO anon;
GRANT EXECUTE ON FUNCTION public.tem_permissao(p_modulo text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tem_permissao(p_modulo text) TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_congelar_cotacao() TO anon;
GRANT EXECUTE ON FUNCTION public.trg_congelar_cotacao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_congelar_cotacao() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_contratos_produtos_updated() TO anon;
GRANT EXECUTE ON FUNCTION public.trg_contratos_produtos_updated() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_contratos_produtos_updated() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_sync_produto_status() TO anon;
GRANT EXECUTE ON FUNCTION public.trg_sync_produto_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_sync_produto_status() TO service_role;

-- ===== COMENTÁRIOS =====
COMMENT ON TABLE public.acervo_capas IS 'Miniatura da 1a pagina do PDF usada como capa no Acervo. Gerada no cliente uma unica vez e compartilhada. status=falha marca PDF que nao deve ser retentado.';
COMMENT ON TABLE public.acervo_publicacoes IS 'Arquivos do acervo marcados pelo super_admin para o portal público (1 linha por midia_id). Escrita só por fn_acervo_definir_publico.';
COMMENT ON COLUMN public.apa_demarcacoes.style_config IS 'Configuração visual da camada: fillOpacity, strokeColor, strokeWidth, hiddenFeatures[], featureStrokeColors{}';
COMMENT ON COLUMN public.atividades.orcamento_original_usd IS 'Dotação original aprovada (Σ fontes dotacao_original). Congelada; só o razão altera.';
COMMENT ON COLUMN public.atividades.orcamento_usd IS 'Orçamento VIGENTE = cache de Σ orcamento_fontes orçamentárias. Só o razão altera (trigger trg_atividade_guarda_orcamento). Ver docs/remanejamento/plano.md.';
COMMENT ON TABLE public.beneficiario_dados_bancarios IS 'Dados financeiros de beneficiarios, segregados de public.beneficiarios. Acesso restrito a super_admin e coordenacao (LGPD art. 6, III).';
COMMENT ON TABLE public.car_dados_locais IS 'Dados do CAR (SICAR). Contem dado pessoal - acesso restrito a autenticados. CPF/CNPJ mascarado de forma irreversivel (ver migracao 20260727_lgpd_c0_03).';
COMMENT ON COLUMN public.car_dados_locais.cpf_cnpj_mascara IS 'CPF/CNPJ mascarado de forma irreversivel (apenas 2 ultimos digitos). Destina-se a conferencia visual, nao a cruzamento de dados. LGPD art. 6, III.';
COMMENT ON TABLE public.cobertura_notificacoes IS 'Fila de e-mail do aviso de contrato travado/liberado (rem_11). Drenada pela Edge Function assinar-remanejamento.';
COMMENT ON TABLE public.contrato_coberturas IS 'Razão do excedente de contrato sobre o TDR (fase 5). Σ delta_usd por atividade entra no débito. Imutável: só situacao aguardando → coberto/cancelado muda. Escrita só pelos triggers.';
COMMENT ON TABLE public.contrato_encerramentos IS 'Registro auditável de encerramento de contrato com saldo não executado, liberando o valor de volta para o orçamento da atividade vinculada.';
COMMENT ON COLUMN public.contrato_encerramentos.cotacao IS 'PTAX venda usada para converter valor_liberado_brl em USD (rem_09). Nulo nas liberações anteriores.';
COMMENT ON COLUMN public.contratos.status_antes_cobertura IS 'Status a restaurar quando a cobertura for liberada. Só os triggers da fase 5 gravam.';
COMMENT ON TABLE public.cotacoes_ptax IS 'PTAX de fechamento USD/BRL do Banco Central, 1 linha por dia útil. Gravada só pela Edge Function cotacao-ptax (service_role). Imutável. Consultar via fn_cotacao_usd(data).';
COMMENT ON TABLE public.cotacoes_usd IS 'PTAX de fechamento USD/BRL do Banco Central, 1 linha por dia útil. Gravada só pela Edge Function cotacao-ptax (service_role). Imutável. Consultar via fn_cotacao_usd(data).';
COMMENT ON TABLE public.diag_audios IS 'Gravação de voz de resposta aberta do Diagnóstico. IDENTIFICAÇÃO (a voz identifica): consultor não lê; retenção 2 anos; arquivo em diagnostico-audios.';
COMMENT ON COLUMN public.diag_audios.transcricao_origem IS 'manual = digitada; ia_local = sugerida por IA no navegador da mesa e conferida por quem salvou (transcrito_por).';
COMMENT ON COLUMN public.diag_fichas.audio_autorizado IS 'Família autorizou gravar respostas em áudio (pergunta separada do aviso, v5). Só true aceita áudio.';
COMMENT ON COLUMN public.diag_fichas.fotos_autorizadas IS 'Família autorizou fotografar a casa e o entorno (pergunta separada do aviso, v4). NULL = anterior à pergunta ou recusa. false ⇒ nenhuma foto aceita.';
COMMENT ON COLUMN public.execucao_financeira.cotacao_unesco IS 'Taxa operacional UNESCO (UNORE) usada no pagamento';
COMMENT ON COLUMN public.execucao_financeira.impacto_usd IS 'Impacto financeiro: valor_usd_unesco - (valor_brl / cotacao_uso). Positivo = UNESCO valoriza mais.';
COMMENT ON COLUMN public.execucao_financeira.valor_usd_unesco IS 'Valor em USD calculado pela cotação UNESCO (valor oficial)';
COMMENT ON TABLE public.lgpd_tratamentos IS 'ROPA (LGPD art. 37). Uma linha por tratamento; `tabelas` aponta o schema real. Tabela nova com dado pessoal = linha nova aqui na mesma entrega.';
COMMENT ON TABLE public.orcamento_eventos IS 'Eventos de TDR que alteram o débito da atividade (criação, cancelamento, mudança de valor…). Alimenta o extrato; o saldo NÃO é calculado daqui (é da vw_orcamento_debitos).';
COMMENT ON TABLE public.orcamento_fontes IS 'Razão imutável da procedência do saldo de cada atividade (Opção B do remanejamento). Linha sem ajusta_fonte_id = crédito; com ajusta_fonte_id = ajuste daquele crédito. Escrita só por funções SECURITY DEFINER. Ver docs/remanejamento/plano.md.';
COMMENT ON TABLE public.produto_notif_log IS 'Histórico de e-mails enviados em eventos de produtos/entregas';
COMMENT ON COLUMN public.produto_notif_log.evento IS 'entregue | aprovado | aprovado_parcial | devolvido | pago';
COMMENT ON TABLE public.pulso_ciclos IS 'Pulso da Equipe: uma aplicação do questionário (ciclo). O token vai no QR Code.';
COMMENT ON TABLE public.pulso_espelho IS 'LEGADO do Pulso. Copiado para pulso_espelho_v2; não escrever aqui.';
COMMENT ON TABLE public.pulso_exportacoes IS 'Registro imutável de cada exportação do Pulso (só agregados saem). Escrita só por fn_pulso_exportar*.';
COMMENT ON TABLE public.pulso_participacoes IS 'Quem já respondeu cada ciclo (só para impedir duplicidade). Nunca juntar com pulso_respostas.';
COMMENT ON TABLE public.pulso_respostas IS 'LEGADO do Pulso (até 06/10/2026). Copiado para pulso_respostas_v2; não escrever aqui.';
COMMENT ON TABLE public.pulso_respostas_v2 IS 'Respostas ANÔNIMAS do Pulso ({chave: valor}; escolha = índice da opção). Sem usuario_id e sem hora, de propósito.';
COMMENT ON TABLE public.rem_cargo_titulares IS 'Titular nominal de cada cargo da cadeia de remanejamento, com vigência e ato (portaria/SEI). Um titular vigente por cargo e uma pessoa por cargo. Sem substituto. Escrita só por fn_rem_designar_titular.';
COMMENT ON COLUMN public.remanejamento_alocacoes.ativo IS 'false = retirada do rascunho (nada é apagado).';
COMMENT ON COLUMN public.remanejamento_itens.ativo IS 'false = retirado do rascunho (nada é apagado).';
COMMENT ON TABLE public.remanejamentos IS 'Pedido de remanejamento entre atividades. Escrita só por fn_rem_salvar (rascunho) e fn_rem_assinar (cadeia, via Edge Function assinar-remanejamento). Ver docs/remanejamento/plano.md.';
COMMENT ON COLUMN public.remanejamentos.estorno_de IS 'Pedido de estorno: aponta para o remanejamento efetivado que ele desfaz (§3.5).';
COMMENT ON TABLE public.tdr_cancelamentos IS 'Pedido de cancelamento de TDR (nota técnica + cadeia coordenação → responsável da atividade → UNESCO). Só a efetivação põe o TDR em cancelado e libera o valor no saldo da atividade.';
COMMENT ON TABLE public.tdr_licitacoes IS 'Tentativas de licitação sem êxito de cada TDR (deserta/fracassada/outro) e o desfecho: relançada ou cancelamento. Imutável.';
COMMENT ON COLUMN public.tdrs.execucao_direta IS 'TDR guarda-chuva de execução direta UNESCO (ex.: diárias, passagens). Funciona como reserva: despesas sem contrato da atividade a consomem. Ver docs/remanejamento/plano.md §2.2.';
COMMENT ON COLUMN public.usuario_permissoes.modulo IS 'ID do módulo: dashboard | atividades | tdrs | matriz | fornecedores | contratos | produtos | financeiro | viagens | repositorio | usuarios | relatorios_* | dashboard_cobertura | diagnostico';
COMMENT ON COLUMN public.viagem_protocolos.conclusao_envio_trava_ate IS 'Trava do e-mail de conclusão à UNESCO: até quando um novo envio é recusado (em andamento ou intervalo após envio). Gravada só por fn_viagem_conclusao_reservar/_liberar.';
COMMENT ON VIEW public.vw_acervo_entrega_ref IS 'Entrega que vale por produto: a aprovada de maior número; se nenhuma foi aprovada, a última submetida.';
COMMENT ON VIEW public.vw_acervo_midias IS 'Catálogo do acervo — uma linha por arquivo, classificada em vigente | superada | instrucao segundo a entrega de referência do produto.';
COMMENT ON VIEW public.vw_acervo_obras IS 'Obras do acervo — produto contratado por linha, com edicao de referencia, estado de acervo, contagens por camada de versao e capa (capa_midia_id = o que renderizar, capa_url = se ja foi feito).';
COMMENT ON VIEW public.vw_acervo_publicacoes IS 'Marcações do portal público com a situação efetiva: valida = marcado e ainda vigente/aprovado. O portal público só mostra valida.';
COMMENT ON VIEW public.vw_saldo_atividade IS 'Saldo do painel: comprometido = TDRs + contrato acima do TDR (contrato_coberturas); saldo_livre = orçamento − comprometido + liberado. Somente leitura (rem_00/rem_08).';

-- ===== SEQUENCES: valor atual =====
SELECT setval('public.api_acessos_id_seq', 2, true);
SELECT setval('public.audit_log_id_seq', 3429, true);
SELECT setval('public.auditoria_registros_numero_seq', 1234, true);
SELECT setval('public.contrato_coberturas_seq_seq', 8, true);
SELECT setval('public.diag_exportacoes_id_seq', 1, true);
SELECT setval('public.diag_expurgo_arquivos_id_seq', 17, true);
SELECT setval('public.diag_fichas_historico_id_seq', 71, true);
SELECT setval('public.fornecedores_codigo_interno_seq', 34, true);
SELECT setval('public.rem_tentativas_senha_id_seq', 34, true);
SELECT setval('public.seq_tarefa_codigo', 50, true);
SELECT setval('public.viagem_protocolo_seq', 1, true);

-- fim do dump de estrutura
