-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 15 — questionário v4: aviso novo, autorização
-- separada das fotos e P55/P56 de organizações
--
-- Pedido de 28/09/2026. A v3 publicada é IMUTÁVEL → v4 é cópia da v3 com:
--   • aviso ao entrevistado reescrito (parágrafos; pede SEPARADAMENTE a
--     autorização para fotografar a casa e o entorno);
--   • P55 nova `participa_org_tipos` (múltipla: tipos de organização) —
--     SENSÍVEL: sindicato, grupo religioso e organização indígena/tradicional
--     (art. 5º, II: filiação sindical/religiosa e origem étnica);
--   • P56 = a antiga P55 `participa_org_quais` (MESMA chave: respostas e
--     sugestões das fichas antigas continuam valendo), agora pedindo o nome;
--   • perguntas a partir da antiga P56 sobem um número (P56 → P57 … P81 → P82).
-- "Não sabe / Não respondeu" é o botão "Não respondeu" (_nr) de toda
-- pergunta — não vira opção, para ficar fora do denominador como as demais.
-- Mesmo rito da v3: se a v3 está publicada (produção), publica a v4 e
-- arquiva a v3; ficha começada na v3 continua aceita pela estrutura da v3.
--
-- diag_fichas.fotos_autorizadas: resposta da família à pergunta separada
-- das fotos (app 1.9.0). NULL = ficha anterior à pergunta (ou recusa).
-- false ⇒ diag_enviar_ficha recusa qualquer foto da ficha, inclusive de
-- aparelho com app antigo. Não é dado pessoal. Sai na exportação.
-- ════════════════════════════════════════════════════════════════════════

alter table public.diag_fichas add column if not exists fotos_autorizadas boolean;
comment on column public.diag_fichas.fotos_autorizadas is
  'Família autorizou fotografar a casa e o entorno (pergunta separada do aviso, v4). NULL = anterior à pergunta ou recusa. false ⇒ nenhuma foto aceita.';

do $$
declare
  v3      diag_questionarios;
  est     jsonb;
  blocos  jsonb := '[]'::jsonb;
  b       jsonb;
  p       jsonb;
  ps      jsonb;
  achou   boolean := false;
  nova    jsonb := $j${"n":55,"chave":"participa_org_tipos","tipo":"multipla","sensivel":true,
    "texto":"Qual(is) associação(ões), cooperativa(s), sindicato(s), grupo(s) comunitário(s) ou outra(s) organização(ões) você participa?",
    "mostrar_se":{"se":"participa_org","op":"=","valor":"sim"},
    "opcoes":[{"v":"associacao_comunitaria","r":"Associação comunitária"},
              {"v":"cooperativa","r":"Cooperativa"},
              {"v":"sindicato","r":"Sindicato"},
              {"v":"grupo_de_mulheres","r":"Grupo de mulheres"},
              {"v":"grupo_de_jovens","r":"Grupo de jovens"},
              {"v":"grupo_de_produtores_rurais","r":"Grupo de produtores rurais"},
              {"v":"organizacao_indigena_ou_tradicional","r":"Organização indígena ou tradicional"},
              {"v":"grupo_religioso","r":"Grupo religioso"},
              {"v":"outro","r":"Outro","especificar":true}]}$j$::jsonb;
  aviso   text := $a$Bom dia/boa tarde! Sou técnico(a) da Secretaria de Estado do Meio Ambiente do Acre (SEMA/AC) e estou realizando um diagnóstico socioambiental nesta comunidade, como parte de um projeto desenvolvido em parceria com o Fundo Brasil-ONU e a UNESCO.

O objetivo da entrevista é conhecer melhor as condições de vida, as atividades produtivas e as questões socioambientais da comunidade, contribuindo para o planejamento de ações do projeto.

Sua participação é voluntária. Você pode escolher não participar, deixar qualquer pergunta sem resposta ou interromper a entrevista a qualquer momento, sem qualquer prejuízo.

Seu nome é opcional. As informações serão utilizadas pela equipe responsável pelo diagnóstico, e os resultados apresentados serão organizados de forma geral, sem identificação das famílias.

Os dados que permitem identificar você ou sua família serão protegidos e armazenados conforme as regras de proteção de dados aplicáveis (LGPD). Após a conferência das informações, esses dados identificáveis serão eliminados em até dois anos, conforme os procedimentos do projeto.

Também gostaríamos de solicitar, separadamente, sua autorização para fotografar a casa e o entorno, sem incluir pessoas nas imagens. Você pode aceitar ou recusar as fotografias sem que isso interfira na sua participação na entrevista.

Se tiver dúvidas ou quiser obter informações sobre o tratamento dos seus dados, você pode entrar em contato com Luciana Rôla, Encarregada de Dados da SEMA/AC, pelo e-mail divbioac@gmail.com.

Você gostaria de participar da entrevista?

Podemos começar?$a$;
begin
  if exists (select 1 from diag_questionarios where codigo = 'DSA' and estrutura->>'mudanca_v4' is not null) then
    return;
  end if;
  select * into v3 from diag_questionarios where codigo = 'DSA' and versao = 3;
  if v3.id is null then raise exception 'questionário DSA v3 não encontrado'; end if;

  for b in select * from jsonb_array_elements(v3.estrutura->'blocos') loop
    ps := '[]'::jsonb;
    for p in select * from jsonb_array_elements(b->'perguntas') loop
      if (p->>'n')::int >= 55 then
        p := jsonb_set(p, '{n}', to_jsonb((p->>'n')::int + 1));
      end if;
      if p->>'chave' = 'participa_org_quais' then
        p := p || jsonb_build_object(
          'texto', 'Qual é o nome da associação, cooperativa, sindicato, grupo comunitário ou outra organização da qual você participa?',
          'ajuda', 'Se participar de mais de uma, informe todas, separadas por vírgula.');
        ps := ps || nova;          -- a P55 nova entra logo antes do nome
        achou := true;
      end if;
      ps := ps || p;
    end loop;
    blocos := blocos || jsonb_set(b, '{perguntas}', ps);
  end loop;
  if not achou then raise exception 'v3 sem a pergunta participa_org_quais'; end if;

  est := jsonb_set(v3.estrutura, '{blocos}', blocos);
  est := est || jsonb_build_object('versao', 4,
           'mudanca_v4', 'Aviso reescrito com autorização separada das fotos; P55 tipos de organização (nova); P56 nome da organização; demais +1 (28/09/2026)');

  insert into diag_questionarios (codigo, versao, titulo, estrutura, aviso_entrevistado)
  values ('DSA', 4, v3.titulo, est, aviso);
  if v3.status = 'publicado' then
    update diag_questionarios set status = 'publicado' where codigo = 'DSA' and versao = 4;
    update diag_questionarios set status = 'arquivado' where id = v3.id;
  end if;
end $$;

-- ROPA: a P55 nova traz tipo de organização (sensível)
update public.lgpd_tratamentos
   set categorias_dados = array_replace(categorias_dados,
         'filiação a organizações e sindicato (sensível)',
         'filiação a organizações: tipo (sindicato, grupo religioso, organização indígena/tradicional) e nome (sensível)'),
       atualizado_em = now()
 where codigo = 'TRAT-001'
   and 'filiação a organizações e sindicato (sensível)' = any(categorias_dados);

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
    localidade_id, localidade_nova, fotos_registradas, fotos_autorizadas)
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
         then (p_ficha->>'fotos_autorizadas')::boolean end)
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

  return jsonb_build_object('id', v_ficha_id, 'codigo', v_codigo, 'status', 'enviada',
                            'alertas', v_alertas, 'usou_carencia', v_carencia,
                            'status_anterior', v_status_ant, 'treino', v_treino);
end $$;

revoke execute on function public.diag_enviar_ficha(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.diag_enviar_ficha(jsonb, jsonb, jsonb) to authenticated;

create or replace function public.diag_exportar(
  p_identificada   boolean default false,
  p_status         text[]  default array['validada'],
  p_municipio_ibge integer default null,
  p_comunidade_id  uuid    default null,
  p_questionario_id uuid   default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
end $$;

revoke execute on function public.diag_exportar(boolean, text[], integer, uuid, uuid) from public, anon;
grant execute on function public.diag_exportar(boolean, text[], integer, uuid, uuid) to authenticated;
