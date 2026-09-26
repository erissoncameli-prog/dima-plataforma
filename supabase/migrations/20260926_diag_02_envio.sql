-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 02 — interpretação da estrutura, envio e status
--
-- A estrutura do questionário (diag_questionarios.estrutura) é DADO. Este
-- arquivo tem o único interpretador do lado do banco:
--   fn_diag_derivar      moradores → valores derivados (D1/D2)
--   fn_diag_aplicaveis   quais perguntas se aplicam, dados os saltos
--   fn_diag_normalizar_respostas  valida e descarta o que não se aplica
--   fn_diag_calcular_alertas      pendências e avisos (nunca bloqueiam)
-- O app de campo interpreta a MESMA estrutura com a MESMA linguagem mínima
-- de salto: '=', '!=', 'in', 'contem', 'nao_contem' e {"todas": [...]}.
-- Qualquer operador novo entra nos dois lugares e na fixture de testes.
--
-- Valores especiais em respostas:
--   "_nr"            → "Não respondeu" (botão do app); sai do denominador
--   ausente          → não se aplica (salto) ou em branco (vira alerta)
--   "<chave>_outro"  → texto do "especifique"
--
-- diag_enviar_ficha é SECURITY DEFINER (diferente do padrão
-- frota_solicitar_viagem, que é INVOKER) de propósito: as tabelas não têm
-- policy de escrita para o cliente, então validação e campos derivados não
-- podem ser contornados por INSERT direto; e a carência de 15 dias exige ler
-- a permissão já vencida, o que tem_permissao() não faz. A função confere
-- tudo explicitamente (usuário ativo, perfil, permissão, dono da ficha).
-- ════════════════════════════════════════════════════════════════════════

-- ── Derivações a partir dos moradores (D1, D2) ──────────────────────────
create or replace function public.fn_diag_derivar(p_moradores jsonb)
returns jsonb language sql immutable set search_path = public as $$
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
$$;

-- lista plana das perguntas, na ordem
create or replace function public.fn_diag_perguntas(p_estrutura jsonb)
returns table (ordem int, bloco text, pergunta jsonb)
language sql immutable set search_path = public as $$
  select (bb.i * 1000 + pp.j)::int, b->>'id', p
  from jsonb_array_elements(p_estrutura->'blocos') with ordinality as bb(b, i),
       jsonb_array_elements(b->'perguntas') with ordinality as pp(p, j)
$$;

-- avalia UMA condição de salto (valor de referência já resolvido)
create or replace function public.fn_diag_cond(p_cond jsonb, p_respostas jsonb, p_aplicaveis text[])
returns boolean language plpgsql immutable set search_path = public as $$
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
end $$;

-- chaves de resposta aplicáveis (exclui colunas fixas, P4 e a tabela P9,
-- que não moram em `respostas`)
create or replace function public.fn_diag_aplicaveis(p_estrutura jsonb, p_respostas jsonb)
returns text[] language plpgsql immutable set search_path = public as $$
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
end $$;

-- valida as respostas contra a estrutura e devolve a versão normalizada:
--   · descarta respostas (e "_outro") de pergunta que não se aplica
--   · sobrescreve as derivadas (P26) com o cálculo do banco
--   · recusa (exceção 'diag:resposta_invalida') o que é estruturalmente errado
create or replace function public.fn_diag_normalizar_respostas(
  p_estrutura jsonb, p_respostas jsonb, p_moradores jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
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

  -- derivadas: valor do banco prevalece sobre o do aparelho
  for p in select pergunta from fn_diag_perguntas(p_estrutura) where pergunta ? 'derivada' loop
    v_resp := v_resp || jsonb_build_object(p->>'chave', v_der -> (p->>'derivada'));
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
end $$;

-- valida moradores (P9) contra a estrutura; nome vai para tabela separada
create or replace function public.fn_diag_validar_moradores(p_estrutura jsonb, p_moradores jsonb)
returns void language plpgsql immutable set search_path = public as $$
declare
  v_m      jsonb;
  v_sexo   jsonb := coalesce((
             select jsonb_agg(o->'v') from jsonb_array_elements(p_estrutura->'moradores'->'colunas') c,
                    jsonb_array_elements(c->'opcoes') o where c->>'chave' = 'sexo_genero'), '[]');
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
    if v_m ? 'sexo_genero' and v_m->'sexo_genero' <> 'null'::jsonb
       and not (v_sexo @> jsonb_build_array(v_m->'sexo_genero') or v_m->'sexo_genero' = '"_nr"') then
      raise exception 'diag:morador_invalido: sexo/gênero fora das opções';
    end if;
    if nullif(v_m->>'sexo_genero_outro','') is not null and coalesce(v_m->>'sexo_genero','') <> 'outro' then
      raise exception 'diag:morador_invalido: especifique sem a opção Outro';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(coalesce(p_moradores,'[]')) m
      where coalesce((m->>'e_entrevistado')::boolean, false)) > 1 then
    raise exception 'diag:morador_invalido: mais de um morador marcado como entrevistado';
  end if;
end $$;

-- alertas: pendências e avisos. NUNCA bloqueiam; a coordenação vê na validação.
create or replace function public.fn_diag_calcular_alertas(
  p_estrutura jsonb, p_respostas jsonb, p_moradores jsonb,
  p_usou_carencia boolean, p_comunidade_nova boolean)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  v_al   jsonb := '[]'::jsonb;
  v_apl  text[] := fn_diag_aplicaveis(p_estrutura, p_respostas);
  v_der  jsonb := fn_diag_derivar(p_moradores);
  r      record;
  p      jsonb;
  v      jsonb;
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
    v_al := v_al || jsonb_build_object('tipo','pendente','chave','moradores','n',9);
  else
    -- entrevistado na 1ª linha (decisão de 26/09)
    if not exists (select 1 from jsonb_array_elements(p_moradores) m
                   where (m->>'ordem')::int = 1 and coalesce((m->>'e_entrevistado')::boolean,false)) then
      v_al := v_al || jsonb_build_object('tipo','entrevistado_fora_da_1a_linha','n',9);
    end if;
  end if;
  -- V1: P8 × linhas da P9
  if jsonb_typeof(p_respostas->'qtd_moradores') = 'number'
     and (p_respostas->>'qtd_moradores')::int <> (v_der->>'total_moradores')::int then
    v_al := v_al || jsonb_build_object('tipo','qtd_moradores_diverge','n',8,
                      'informado',(p_respostas->>'qtd_moradores')::int,'listados',(v_der->>'total_moradores')::int);
  end if;
  -- D2 incoerente: "não há mulheres/homens" com mulher/homem listado
  if (p_respostas->'atividades_mulheres') @> '["nao_ha_mulheres"]' and not (v_der->>'sem_mulheres')::boolean then
    v_al := v_al || jsonb_build_object('tipo','incoerente_com_moradores','chave','atividades_mulheres','n',61);
  end if;
  if (p_respostas->'atividades_homens') @> '["nao_ha_homens"]' and not (v_der->>'sem_homens')::boolean then
    v_al := v_al || jsonb_build_object('tipo','incoerente_com_moradores','chave','atividades_homens','n',62);
  end if;
  if p_usou_carencia then
    v_al := v_al || jsonb_build_object('tipo','enviada_na_carencia');
  end if;
  if p_comunidade_nova then
    v_al := v_al || jsonb_build_object('tipo','comunidade_nova');
  end if;
  return v_al;
end $$;

-- ── Envio (fila do app): ficha + moradores + identificação + fotos ───────
-- Idempotente por uuid_cliente: reenviar a mesma ficha atualiza, não duplica.
-- Tudo numa transação só (a função inteira é atômica).
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

  -- permissão: vigente agora, ou vigente quando a ficha foi concluída e
  -- vencida há no máximo 15 dias (carência decidida em 26/09)
  if v_perfil = 'tecnico' and not tem_permissao('diagnostico') then
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
  if v_q.id is null or v_q.status = 'rascunho' then
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
  if exists (select 1 from diag_fichas where codigo = v_codigo and uuid_cliente <> v_uuid_cli) then
    raise exception 'diag:codigo_duplicado: gere um novo código e reenvie';
  end if;

  v_status_ant := v_exist.status;
  insert into diag_fichas as d (
    uuid_cliente, codigo, questionario_id, municipio_ibge, comunidade_id, comunidade_nova,
    dt_entrevista, iniciada_em, finalizada_em, entrevistador_id, aviso_lido, aceitou_participar,
    respostas, alertas, status, usou_carencia, app_versao, dispositivo_id)
  values (
    v_uuid_cli, v_codigo, v_q.id, (p_ficha->>'municipio_ibge')::int,
    (p_ficha->>'comunidade_id')::uuid, nullif(btrim(p_ficha->>'comunidade_nova'), ''),
    (p_ficha->>'dt_entrevista')::date, (p_ficha->>'iniciada_em')::timestamptz, v_final, v_uid,
    coalesce((p_ficha->>'aviso_lido')::boolean, false), coalesce((p_ficha->>'aceitou_participar')::boolean, false),
    v_resp, v_alertas, 'enviada', v_carencia, p_ficha->>'app_versao', p_ficha->>'dispositivo_id')
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
                            'status_anterior', v_status_ant);
end $$;

-- ── Status: validar, devolver, descartar, reabrir (coordenação) ─────────
create or replace function public.diag_mudar_status(p_ficha_id uuid, p_status text, p_motivo text default null)
returns public.diag_fichas language plpgsql security definer set search_path = public as $$
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
end $$;

revoke execute on function public.fn_diag_derivar(jsonb), public.fn_diag_perguntas(jsonb),
  public.fn_diag_cond(jsonb, jsonb, text[]), public.fn_diag_aplicaveis(jsonb, jsonb),
  public.fn_diag_normalizar_respostas(jsonb, jsonb, jsonb), public.fn_diag_validar_moradores(jsonb, jsonb),
  public.fn_diag_calcular_alertas(jsonb, jsonb, jsonb, boolean, boolean),
  public.diag_enviar_ficha(jsonb, jsonb, jsonb), public.diag_mudar_status(uuid, text, text)
  from public, anon;
grant execute on function public.fn_diag_derivar(jsonb), public.fn_diag_perguntas(jsonb),
  public.fn_diag_cond(jsonb, jsonb, text[]), public.fn_diag_aplicaveis(jsonb, jsonb),
  public.fn_diag_normalizar_respostas(jsonb, jsonb, jsonb), public.fn_diag_validar_moradores(jsonb, jsonb),
  public.fn_diag_calcular_alertas(jsonb, jsonb, jsonb, boolean, boolean),
  public.diag_enviar_ficha(jsonb, jsonb, jsonb), public.diag_mudar_status(uuid, text, text)
  to authenticated;
