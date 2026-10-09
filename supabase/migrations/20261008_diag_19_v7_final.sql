-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 19 — v7: questionário FINAL da equipe técnica
--
-- Documento "Diagnóstico socioambiental FINAL" (versão revisada para o
-- piloto, 08/10/2026). Reescreve o questionário inteiro: seção 0 (controle
-- da entrevista) + 91 perguntas em 13 blocos, com segurança alimentar (EBIA,
-- 8 itens), juventude e os saltos do papel. Decisões de 08/10:
--   • lista de moradores MANTIDA (P7), sem a coluna de nome: o app soma a
--     grade idade × sexo do papel; a P8 (maior escolaridade) é CALCULADA
--     da lista (derivada nova "maior_nivel": cada opção de escolaridade da
--     lista diz o seu `nivel` na escala da P8);
--   • "(até 3)" é regra: `max_marcar` nas múltiplas, conferido no app e aqui;
--   • botão "O que é uma APA?" mantido (P51, P53, P55) — o texto continua
--     o rascunho da v6 e precisa da aprovação da coordenação antes de
--     publicar (versão publicada é imutável);
--   • nome do entrevistado fora do formulário ("fica só no Termo"); o GPS
--     (0.7) segue na identificação separada;
--   • número exibido pode ser texto (`rotulo`: "0.6", "32.1", "42 (a)"),
--     `n` continua inteiro (alertas e indicadores).
-- Interpretador (mesma regra em js/diag-regras.js, teste cruzado):
--   • max_marcar; derivada maior_nivel; derivada sem valor sai das respostas;
--   • alertas da lista de moradores usam o n da estrutura (antes P9 fixo).
-- A v7 nasce em RASCUNHO (testar no modo treino). A v6 (rascunho) fica
-- superada: não será publicada.
-- ════════════════════════════════════════════════════════════════════════

-- maior nível entre os moradores, na escala das opções da pergunta (v7: P8)
create or replace function public.fn_diag_maior_nivel(p_estrutura jsonb, p_pergunta jsonb, p_moradores jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select (select to_jsonb(e.v)
            from jsonb_array_elements(coalesce(p_moradores,'[]'::jsonb)) m
            join jsonb_array_elements(coalesce(p_estrutura->'moradores'->'colunas','[]'::jsonb)) c
              on c->>'chave' = p_pergunta->>'coluna'
            join jsonb_array_elements(c->'opcoes') o on o->'v' = m->(p_pergunta->>'coluna') and o ? 'nivel'
            join jsonb_array_elements_text(coalesce((select jsonb_agg(x->'v' order by k) from jsonb_array_elements(p_pergunta->'opcoes') with ordinality as xx(x, k)),'[]'))
                 with ordinality as e(v, i) on e.v = o->>'nivel'
           order by e.i desc limit 1)
$$;

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
end $$;

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
end $$;

revoke execute on function public.fn_diag_maior_nivel(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.fn_diag_maior_nivel(jsonb, jsonb, jsonb) to authenticated;

-- ── v7 (rascunho) ────────────────────────────────────────────────────────
do $$
declare
  v6     diag_questionarios;
  est    jsonb;
  cols   jsonb;
  nivel  jsonb := $n${"nao_alfabetizado": "sem_escolaridade", "alfabetizado_sem_escola": "sem_escolaridade", "educacao_infantil": "sem_escolaridade", "fundamental_incompleto": "fundamental_incompleto", "fundamental_completo": "fundamental_completo", "medio_incompleto": "medio_incompleto", "medio_completo": "medio_completo", "superior_incompleto": "superior_incompleto", "superior_completo": "superior_completo", "especializacao_incompleta": "pos_incompleta", "mestrado_incompleto": "pos_incompleta", "doutorado_incompleto": "pos_incompleta", "especializacao_completa": "pos_completa", "mestrado_completo": "pos_completa", "doutorado_completo": "pos_completa"}$n$::jsonb;
  blocos jsonb := $estrutura$[
 {"id": "controle", "titulo": "Controle da entrevista", "perguntas": [
  {"n": 0, "rotulo": "0.2", "chave": "dt_entrevista", "tipo": "data", "texto": "Data e hora de início", "coluna_fixa": true}, 
  {"n": 0, "rotulo": "0.3", "chave": "comunidade", "tipo": "catalogo", "texto": "APA", "coluna_fixa": true, "catalogo": "comunidades"}, 
  {"n": 0, "rotulo": "0.4", "chave": "municipio_ibge", "tipo": "catalogo", "texto": "Município", "coluna_fixa": true, "catalogo": "municipios"}, 
  {"n": 0, "chave": "entrevistado_papel", "tipo": "unica", "texto": "O(a) entrevistado(a) é:", "opcoes": [{"v": "responsavel", "r": "Responsável pelo domicílio"}, {"v": "conjuge", "r": "Cônjuge"}, {"v": "outro_morador_adulto", "r": "Outro morador adulto"}], "rotulo": "0.6"}, 
  {"n": 0, "rotulo": "0.7", "chave": "localizacao", "tipo": "texto", "texto": "Coordenadas GPS da residência (se houver aparelho)", "destino": "identificacao", "opcional": true}]}, 
 {"id": "identificacao", "titulo": "Identificação e perfil da família", "perguntas": [
  {"n": 1, "chave": "localidade", "tipo": "catalogo", "texto": "Comunidade/localidade (ramal, bairro ou referência)", "coluna_fixa": true, "catalogo": "localidades"}, 
  {"n": 2, "chave": "sexo_genero", "tipo": "unica", "texto": "Sexo/gênero do(a) entrevistado(a)", "opcoes": [{"v": "mulher", "r": "Mulher"}, {"v": "homem", "r": "Homem"}, {"v": "outro", "r": "Outro", "especificar": true}, {"v": "prefere_nao_responder", "r": "Prefere não responder"}]}, 
  {"n": 3, "chave": "idade", "tipo": "inteiro", "texto": "Idade do(a) entrevistado(a)", "min": 0, "max": 120, "aviso_min": 18}, 
  {"n": 4, "chave": "cor_raca", "tipo": "unica", "texto": "Cor ou raça (autodeclarada)", "opcoes": [{"v": "branca", "r": "Branca"}, {"v": "preta", "r": "Preta"}, {"v": "parda", "r": "Parda"}, {"v": "amarela", "r": "Amarela"}, {"v": "indigena", "r": "Indígena"}, {"v": "prefere_nao_responder", "r": "Prefere não responder"}], "sensivel": true, "ajuda": "A pessoa declara; não classifique por observação."}, 
  {"n": 5, "chave": "povo_tradicional", "tipo": "unica", "texto": "A família se identifica como parte de algum povo ou comunidade tradicional?", "opcoes": [{"v": "nao", "r": "Não"}, {"v": "indigena", "r": "Indígena"}, {"v": "seringueira_extrativista", "r": "Seringueira/extrativista"}, {"v": "ribeirinha", "r": "Ribeirinha"}, {"v": "outro", "r": "Outro", "especificar": true}], "sensivel": true}, 
  {"n": 6, "chave": "tempo_comunidade", "tipo": "unica", "texto": "Há quanto tempo mora na comunidade?", "opcoes": [{"v": "menos_de_1_ano", "r": "Menos de 1 ano"}, {"v": "1_a_5_anos", "r": "1 a 5 anos"}, {"v": "6_a_10_anos", "r": "6 a 10 anos"}, {"v": "11_a_20_anos", "r": "11 a 20 anos"}, {"v": "mais_de_20_anos", "r": "Mais de 20 anos"}, {"v": "nasceu_na_comunidade", "r": "Nasceu na comunidade"}]}, 
  {"n": 7, "chave": "moradores", "tipo": "tabela", "texto": "Composição da família (quem mora no domicílio)", "destino": "moradores", "ajuda": "Uma linha por pessoa, sem nome. O app soma a grade por idade e sexo."}, 
  {"n": 8, "chave": "maior_escolaridade", "tipo": "unica", "texto": "Maior escolaridade entre os moradores", "opcoes": [{"v": "sem_escolaridade", "r": "Sem escolaridade"}, {"v": "fundamental_incompleto", "r": "Fundamental incompleto"}, {"v": "fundamental_completo", "r": "Fundamental completo"}, {"v": "medio_incompleto", "r": "Médio incompleto"}, {"v": "medio_completo", "r": "Médio completo"}, {"v": "superior_incompleto", "r": "Superior incompleto"}, {"v": "superior_completo", "r": "Superior completo"}, {"v": "pos_incompleta", "r": "Pós-graduação incompleta"}, {"v": "pos_completa", "r": "Pós-graduação completa"}], "derivada": "maior_nivel", "coluna": "escolaridade"}, 
  {"n": 9, "chave": "pcd_cuidados", "tipo": "unica", "texto": "Há no domicílio pessoa com deficiência ou doença crônica que precise de cuidados constantes?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}], "sensivel": true}]}, 
 {"id": "moradia", "titulo": "Moradia e infraestrutura", "perguntas": [
  {"n": 10, "chave": "moradia_situacao", "tipo": "unica", "texto": "Situação da moradia", "opcoes": [{"v": "propria", "r": "Própria"}, {"v": "cedida", "r": "Cedida"}, {"v": "alugada", "r": "Alugada"}, {"v": "outro", "r": "Outra", "especificar": true}]}, 
  {"n": 11, "chave": "moradia_parede", "tipo": "unica", "texto": "Material predominante das paredes", "opcoes": [{"v": "madeira", "r": "Madeira"}, {"v": "alvenaria", "r": "Alvenaria"}, {"v": "mista", "r": "Mista"}, {"v": "outro", "r": "Outro", "especificar": true}], "ajuda": "Observado pelo entrevistador, sem perguntar."}, 
  {"n": 12, "chave": "moradia_piso", "tipo": "unica", "texto": "Material predominante do piso", "opcoes": [{"v": "terra_batida", "r": "Terra batida"}, {"v": "madeira", "r": "Madeira (assoalho)"}, {"v": "cimento", "r": "Cimento"}, {"v": "ceramica", "r": "Cerâmica/lajota"}, {"v": "outro", "r": "Outro", "especificar": true}], "ajuda": "Observado pelo entrevistador, sem perguntar."}, 
  {"n": 13, "chave": "energia_fonte", "tipo": "unica", "texto": "Principal fonte de energia elétrica", "opcoes": [{"v": "rede_publica", "r": "Rede pública"}, {"v": "energia_solar", "r": "Solar"}, {"v": "gerador", "r": "Gerador"}, {"v": "outro", "r": "Outra", "especificar": true}, {"v": "nao_possui", "r": "Não possui"}]}, 
  {"n": 14, "chave": "comunicacao_meios", "tipo": "multipla", "texto": "Meios de comunicação no domicílio", "opcoes": [{"v": "celular", "r": "Celular"}, {"v": "internet", "r": "Internet"}, {"v": "televisao", "r": "TV"}, {"v": "radio", "r": "Rádio"}, {"v": "nenhum", "r": "Nenhum", "exclusiva": true}]}, 
  {"n": 15, "chave": "acesso_chuvoso", "tipo": "unica", "texto": "Como é o acesso à comunidade no período de chuvas?", "opcoes": [{"v": "bom", "r": "Bom"}, {"v": "regular", "r": "Regular"}, {"v": "ruim", "r": "Ruim"}, {"v": "muito_ruim", "r": "Muito ruim"}, {"v": "a_comunidade_fica_isolada", "r": "A comunidade fica isolada"}]}, 
  {"n": 16, "chave": "infra_dificuldades", "tipo": "multipla", "texto": "Principais problemas de infraestrutura da comunidade", "opcoes": [{"v": "estradas", "r": "Estradas/ramais"}, {"v": "transporte", "r": "Transporte"}, {"v": "energia", "r": "Energia"}, {"v": "internet_telefonia", "r": "Internet/telefonia"}, {"v": "habitacao", "r": "Habitação"}, {"v": "iluminacao_publica", "r": "Iluminação pública"}, {"v": "outro", "r": "Outro", "especificar": true}], "max_marcar": 3}]}, 
 {"id": "agua", "titulo": "Água, saneamento e segurança hídrica", "perguntas": [
  {"n": 17, "chave": "agua_fonte", "tipo": "unica", "texto": "Principal fonte de água para consumo", "opcoes": [{"v": "poco", "r": "Poço"}, {"v": "rio_igarape", "r": "Rio/igarapé"}, {"v": "nascente", "r": "Nascente"}, {"v": "acude", "r": "Açude"}, {"v": "chuva", "r": "Chuva"}, {"v": "rede_publica", "r": "Rede pública"}, {"v": "outro", "r": "Outra", "especificar": true}]}, 
  {"n": 18, "chave": "agua_tratamento", "tipo": "multipla", "texto": "Tratamento da água para beber", "opcoes": [{"v": "nenhum", "r": "Nenhum", "exclusiva": true}, {"v": "filtracao", "r": "Filtração"}, {"v": "cloracao", "r": "Cloração"}, {"v": "fervura", "r": "Fervura"}, {"v": "outro", "r": "Outro", "especificar": true}]}, 
  {"n": 19, "chave": "agua_falta_meses", "tipo": "multipla", "texto": "Em quais meses do ano falta água?", "opcoes": [{"v": "nao_falta", "r": "Não falta água", "exclusiva": true}, {"v": "jan", "r": "Jan"}, {"v": "fev", "r": "Fev"}, {"v": "mar", "r": "Mar"}, {"v": "abr", "r": "Abr"}, {"v": "mai", "r": "Mai"}, {"v": "jun", "r": "Jun"}, {"v": "jul", "r": "Jul"}, {"v": "ago", "r": "Ago"}, {"v": "set", "r": "Set"}, {"v": "out", "r": "Out"}, {"v": "nov", "r": "Nov"}, {"v": "dez", "r": "Dez"}], "ajuda": "Marque todos os meses que se aplicam."}, 
  {"n": 20, "chave": "agua_qualidade", "tipo": "unica", "texto": "Como avalia a qualidade da água que a família usa?", "opcoes": [{"v": "muito_boa", "r": "Muito boa"}, {"v": "boa", "r": "Boa"}, {"v": "regular", "r": "Regular"}, {"v": "ruim", "r": "Ruim"}, {"v": "muito_ruim", "r": "Muito ruim"}]}, 
  {"n": 21, "chave": "agua_problemas", "tipo": "multipla", "texto": "Quais problemas a água apresenta?", "opcoes": [{"v": "cor_barro", "r": "Cor/barro"}, {"v": "cheiro_gosto", "r": "Cheiro ou gosto"}, {"v": "lixo_esgoto", "r": "Lixo/esgoto"}, {"v": "agrotoxico", "r": "Agrotóxico"}, {"v": "causa_doencas", "r": "Causa doenças"}, {"v": "poco_fonte_seca", "r": "Poço ou fonte seca"}, {"v": "outro", "r": "Outro", "especificar": true}], "mostrar_se": {"todas": [{"op": "!=", "se": "agua_qualidade", "valor": "muito_boa"}, {"op": "!=", "se": "agua_qualidade", "valor": "boa"}]}}, 
  {"n": 22, "chave": "esgoto_destino", "tipo": "unica", "texto": "Destino do esgoto", "opcoes": [{"v": "fossa", "r": "Fossa"}, {"v": "ceu_aberto", "r": "Céu aberto"}, {"v": "rio_igarape", "r": "Rio/igarapé"}, {"v": "sistema_coletivo", "r": "Sistema coletivo"}, {"v": "outro", "r": "Outro", "especificar": true}]}, 
  {"n": 23, "chave": "lixo_destino", "tipo": "multipla", "texto": "Destino do lixo", "opcoes": [{"v": "coleta_publica", "r": "Coleta pública"}, {"v": "queimado", "r": "Queima"}, {"v": "enterrado", "r": "Enterra"}, {"v": "descartado_a_ceu_aberto", "r": "Céu aberto"}, {"v": "reciclado_reaproveitado", "r": "Recicla/reaproveita"}, {"v": "outro", "r": "Outro", "especificar": true}]}, 
  {"n": 24, "chave": "alagacao_5anos", "tipo": "unica", "texto": "Nos últimos 5 anos, a casa ou a produção da família foi atingida por alagação ou enchente?", "opcoes": [{"v": "nao", "r": "Não"}, {"v": "sim_casa", "r": "Sim, a casa"}, {"v": "sim_producao", "r": "Sim, a produção"}, {"v": "sim_casa_producao", "r": "Sim, a casa e a produção"}]}, 
  {"n": 25, "chave": "nascente_area", "tipo": "unica", "texto": "Na área da família há nascente ou olho d'água?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "nao_sabe", "r": "Não sabe"}]}]}, 
 {"id": "saude_educacao", "titulo": "Saúde e educação", "perguntas": [
  {"n": 26, "chave": "saude_onde", "tipo": "unica", "texto": "Onde a família busca atendimento de saúde principalmente?", "opcoes": [{"v": "unidade_de_saude", "r": "Unidade de saúde"}, {"v": "hospital", "r": "Hospital"}, {"v": "farmacia", "r": "Farmácia"}, {"v": "atendimento_particular", "r": "Particular"}, {"v": "medicina_tradicional_caseira", "r": "Medicina tradicional/caseira"}, {"v": "outro", "r": "Outro", "especificar": true}]}, 
  {"n": 27, "chave": "saude_dificuldade", "tipo": "unica", "texto": "Principal dificuldade para acessar saúde", "opcoes": [{"v": "distancia", "r": "Distância"}, {"v": "transporte", "r": "Transporte"}, {"v": "falta_de_atendimento", "r": "Falta de atendimento"}, {"v": "custo", "r": "Custo"}, {"v": "tempo_de_espera", "r": "Tempo de espera"}, {"v": "nao_ha_dificuldade", "r": "Nenhuma"}, {"v": "outro", "r": "Outra", "especificar": true}]}, 
  {"n": 28, "chave": "saude_problemas_familia", "tipo": "multipla", "texto": "Problemas de saúde mais frequentes na família", "opcoes": [{"v": "diarreia_verminose", "r": "Diarreia/verminose"}, {"v": "dengue_malaria_febres", "r": "Dengue, malária ou febres"}, {"v": "respiratorios", "r": "Problemas respiratórios"}, {"v": "pressao_diabetes", "r": "Pressão alta/diabetes"}, {"v": "pele", "r": "Problemas de pele"}, {"v": "nenhum", "r": "Nenhum", "exclusiva": true}, {"v": "outro", "r": "Outro", "especificar": true}], "max_marcar": 3, "sensivel": true, "ajuda": "Da família como um todo. Não pergunte quem tem."}, 
  {"n": 29, "chave": "educacao_dificuldades", "tipo": "multipla", "texto": "Principais dificuldades na educação das crianças e jovens da família", "opcoes": [{"v": "nao_ha_estudantes", "r": "Não há estudantes na família", "exclusiva": true}, {"v": "distancia", "r": "Distância"}, {"v": "transporte", "r": "Transporte escolar"}, {"v": "falta_de_escola", "r": "Falta de escola"}, {"v": "falta_de_professores", "r": "Falta de professores"}, {"v": "falta_de_internet_material", "r": "Falta de internet/material"}, {"v": "nenhuma", "r": "Nenhuma", "exclusiva": true}, {"v": "outro", "r": "Outra", "especificar": true}], "max_marcar": 3}, 
  {"n": 30, "chave": "adulto_quer_estudar", "tipo": "unica", "texto": "Algum adulto da família gostaria de estudar ou voltar a estudar? (alfabetização, EJA, curso técnico ou profissionalizante)", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "ja_estuda", "r": "Já estuda"}]}]}, 
 {"id": "alimentacao", "titulo": "Segurança alimentar", "perguntas": [
  {"n": 31, "chave": "alimentacao_fonte", "tipo": "unica", "texto": "A alimentação da família depende mais de:", "opcoes": [{"v": "producao_propria", "r": "Produção própria"}, {"v": "compra", "r": "Compra"}, {"v": "doacao_auxilio", "r": "Doação/auxílio"}, {"v": "combinacao", "r": "Combinação dessas fontes"}]}, 
  {"n": 32, "chave": "ebia_1", "tipo": "unica", "texto": "Nos últimos 3 meses, os moradores tiveram a preocupação de que os alimentos acabassem antes de poderem comprar ou receber mais comida?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "nao_sabe", "r": "Não sabe"}], "rotulo": "32.1", "ajuda": "EBIA (8 itens). Leia o período \"nos últimos 3 meses\" em voz alta em cada item, com a redação oficial."}, 
  {"n": 32, "chave": "ebia_2", "tipo": "unica", "texto": "Nos últimos 3 meses, os alimentos acabaram antes que os moradores tivessem dinheiro para comprar mais comida?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "nao_sabe", "r": "Não sabe"}], "rotulo": "32.2"}, 
  {"n": 32, "chave": "ebia_3", "tipo": "unica", "texto": "Nos últimos 3 meses, os moradores ficaram sem dinheiro para ter uma alimentação saudável e variada?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "nao_sabe", "r": "Não sabe"}], "rotulo": "32.3"}, 
  {"n": 32, "chave": "ebia_4", "tipo": "unica", "texto": "Nos últimos 3 meses, os moradores comeram apenas alguns alimentos que ainda tinham porque o dinheiro acabou?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "nao_sabe", "r": "Não sabe"}], "rotulo": "32.4"}, 
  {"n": 32, "chave": "ebia_5", "tipo": "unica", "texto": "Nos últimos 3 meses, algum adulto deixou de fazer alguma refeição porque não havia dinheiro para comprar comida?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "nao_sabe", "r": "Não sabe"}], "rotulo": "32.5"}, 
  {"n": 32, "chave": "ebia_6", "tipo": "unica", "texto": "Nos últimos 3 meses, algum adulto comeu menos do que achou que devia porque não havia dinheiro?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "nao_sabe", "r": "Não sabe"}], "rotulo": "32.6"}, 
  {"n": 32, "chave": "ebia_7", "tipo": "unica", "texto": "Nos últimos 3 meses, algum adulto sentiu fome, mas não comeu, porque não havia dinheiro para comprar comida?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "nao_sabe", "r": "Não sabe"}], "rotulo": "32.7"}, 
  {"n": 32, "chave": "ebia_8", "tipo": "unica", "texto": "Nos últimos 3 meses, algum adulto fez apenas uma refeição ao dia ou ficou um dia inteiro sem comer porque não havia dinheiro?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "nao_sabe", "r": "Não sabe"}], "rotulo": "32.8"}]}, 
 {"id": "renda", "titulo": "Renda e produção", "perguntas": [
  {"n": 33, "chave": "renda_faixa", "tipo": "unica", "texto": "Renda mensal aproximada de toda a família (somando trabalho, benefícios e vendas)", "opcoes": [{"v": "ate_meio_sm", "r": "Até ½ salário mínimo"}, {"v": "meio_a_1_sm", "r": "Mais de ½ a 1 SM"}, {"v": "1_a_2_sm", "r": "Mais de 1 a 2 SM"}, {"v": "2_a_3_sm", "r": "Mais de 2 a 3 SM"}, {"v": "mais_de_3_sm", "r": "Mais de 3 SM"}, {"v": "nao_sabe_nao_quer", "r": "Não sabe/não quer informar"}]}, 
  {"n": 34, "chave": "cadunico", "tipo": "unica", "texto": "A família está no Cadastro Único ou recebe Bolsa Família?", "opcoes": [{"v": "recebe_bolsa_familia", "r": "Recebe Bolsa Família"}, {"v": "cadunico_sem_beneficio", "r": "Está no CadÚnico, sem benefício"}, {"v": "nao", "r": "Não"}, {"v": "nao_sabe", "r": "Não sabe"}]}, 
  {"n": 35, "chave": "renda_fontes", "tipo": "multipla", "texto": "Principais fontes de renda", "opcoes": [{"v": "agricultura", "r": "Agricultura"}, {"v": "pecuaria", "r": "Pecuária"}, {"v": "extrativismo", "r": "Extrativismo"}, {"v": "pesca", "r": "Pesca"}, {"v": "comercio", "r": "Comércio"}, {"v": "emprego_diaria", "r": "Emprego/diária"}, {"v": "prestacao_de_servicos", "r": "Prestação de serviços"}, {"v": "beneficios_sociais", "r": "Benefícios sociais"}, {"v": "aposentadoria_pensao", "r": "Aposentadoria/pensão"}, {"v": "outro", "r": "Outra", "especificar": true}], "max_marcar": 3}, 
  {"n": 36, "chave": "renda_suficiente", "tipo": "unica", "texto": "A renda é suficiente para as necessidades básicas?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "parcialmente", "r": "Parcialmente"}, {"v": "nao", "r": "Não"}]}, 
  {"n": 37, "chave": "producao_atividades", "tipo": "multipla", "texto": "Atividades produtivas realizadas pela família", "opcoes": [{"v": "agricultura", "r": "Agricultura"}, {"v": "criacao_de_animais", "r": "Criação de animais"}, {"v": "pesca", "r": "Pesca"}, {"v": "extrativismo", "r": "Extrativismo"}, {"v": "artesanato", "r": "Artesanato"}, {"v": "agroindustria", "r": "Agroindústria (farinha, polpa etc.)"}, {"v": "comercio", "r": "Comércio"}, {"v": "prestacao_de_servicos", "r": "Prestação de serviços"}, {"v": "outro", "r": "Outra", "especificar": true}, {"v": "nenhuma", "r": "Nenhuma", "exclusiva": true}]}, 
  {"n": 38, "chave": "producao_principais", "tipo": "multipla", "texto": "Principais produtos", "opcoes": [{"v": "mandioca_farinha", "r": "Mandioca/farinha"}, {"v": "banana", "r": "Banana"}, {"v": "milho", "r": "Milho"}, {"v": "feijao", "r": "Feijão"}, {"v": "hortalicas", "r": "Hortaliças"}, {"v": "frutas_acai", "r": "Frutas/açaí"}, {"v": "gado_corte", "r": "Gado de corte"}, {"v": "gado_leite", "r": "Gado de leite"}, {"v": "galinha_porco", "r": "Galinha/porco"}, {"v": "peixe", "r": "Peixe"}, {"v": "outro", "r": "Outro", "especificar": true}], "max_marcar": 3, "mostrar_se": {"op": "nao_contem", "se": "producao_atividades", "valor": "nenhuma"}}, 
  {"n": 39, "chave": "producao_destino", "tipo": "unica", "texto": "Destino da produção", "opcoes": [{"v": "consumo_proprio", "r": "Consumo"}, {"v": "venda", "r": "Venda"}, {"v": "ambos", "r": "Ambos"}], "mostrar_se": {"op": "nao_contem", "se": "producao_atividades", "valor": "nenhuma"}}, 
  {"n": 40, "chave": "comercializa_para", "tipo": "multipla", "texto": "Para quem vende", "opcoes": [{"v": "na_propria_comunidade", "r": "Na própria comunidade"}, {"v": "consumidor_final", "r": "Consumidor final"}, {"v": "feira", "r": "Feira"}, {"v": "mercado_comercio", "r": "Mercado/comércio"}, {"v": "cooperativa_associacao", "r": "Cooperativa/associação"}, {"v": "intermediario", "r": "Intermediário"}, {"v": "governo_paa_pnae", "r": "Governo (PAA/PNAE)"}, {"v": "outro", "r": "Outro", "especificar": true}], "mostrar_se": {"todas": [{"op": "nao_contem", "se": "producao_atividades", "valor": "nenhuma"}, {"op": "!=", "se": "producao_destino", "valor": "consumo_proprio"}]}}, 
  {"n": 41, "chave": "beneficiamento", "tipo": "unica", "texto": "Os produtos passam por algum beneficiamento antes da venda (farinha, polpa, queijo, doces etc.)?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}], "mostrar_se": {"todas": [{"op": "nao_contem", "se": "producao_atividades", "valor": "nenhuma"}, {"op": "!=", "se": "producao_destino", "valor": "consumo_proprio"}]}}, 
  {"n": 42, "chave": "acesso_credito", "tipo": "unica", "texto": "A família tem acesso a crédito/financiamento?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}], "rotulo": "42 (a)", "mostrar_se": {"op": "nao_contem", "se": "producao_atividades", "valor": "nenhuma"}}, 
  {"n": 42, "chave": "recebe_ater", "tipo": "unica", "texto": "A família tem acesso a assistência técnica?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}], "rotulo": "42 (b)", "mostrar_se": {"op": "nao_contem", "se": "producao_atividades", "valor": "nenhuma"}}, 
  {"n": 43, "chave": "producao_dificuldades", "tipo": "multipla", "texto": "Principais dificuldades para produzir", "opcoes": [{"v": "falta_de_recursos_financeiros", "r": "Recursos financeiros"}, {"v": "falta_de_assistencia_tecnica", "r": "Assistência técnica"}, {"v": "transporte", "r": "Transporte/escoamento"}, {"v": "mercado_comercializacao", "r": "Mercado/preço"}, {"v": "armazenamento", "r": "Armazenamento"}, {"v": "beneficiamento", "r": "Beneficiamento"}, {"v": "mao_de_obra", "r": "Mão de obra"}, {"v": "insumos", "r": "Insumos"}, {"v": "clima", "r": "Clima"}, {"v": "acesso_a_terra", "r": "Acesso à terra"}, {"v": "regras_ambientais", "r": "Regras ambientais"}, {"v": "outro", "r": "Outro", "especificar": true}], "max_marcar": 3, "mostrar_se": {"op": "nao_contem", "se": "producao_atividades", "valor": "nenhuma"}}, 
  {"n": 44, "chave": "producao_desejo_tipos", "tipo": "multipla", "texto": "Que atividade a família gostaria de iniciar ou ampliar?", "opcoes": [{"v": "agricultura", "r": "Agricultura"}, {"v": "sistema_agroflorestal", "r": "Sistema agroflorestal"}, {"v": "criacao_de_animais", "r": "Criação de animais"}, {"v": "piscicultura", "r": "Piscicultura"}, {"v": "extrativismo", "r": "Extrativismo"}, {"v": "agroindustria", "r": "Agroindústria"}, {"v": "turismo", "r": "Turismo"}, {"v": "artesanato", "r": "Artesanato"}, {"v": "comercio_servicos", "r": "Comércio/serviços"}, {"v": "nenhuma", "r": "Nenhuma", "exclusiva": true}], "max_marcar": 3}]}, 
 {"id": "terra", "titulo": "Uso da terra e recursos naturais", "perguntas": [
  {"n": 45, "chave": "area_unidade", "tipo": "unica", "texto": "Tamanho aproximado da área — unidade", "opcoes": [{"v": "hectare", "r": "Hectare"}, {"v": "tarefa", "r": "Tarefa"}, {"v": "colonia", "r": "Colônia"}, {"v": "m2", "r": "m²"}, {"v": "lote", "r": "Lote"}, {"v": "nao_sabe", "r": "Não sabe"}], "rotulo": "45 (unidade)", "ajuda": "Escolha a unidade em que a pessoa responde; o tamanho vem em seguida."}, 
  {"n": 45, "rotulo": "45 (tamanho)", "chave": "area_tamanho", "tipo": "decimal", "texto": "Tamanho aproximado da área (na unidade escolhida)", "min": 0, "max": 1000000, "mostrar_se": {"op": "!=", "se": "area_unidade", "valor": "nao_sabe"}}, 
  {"n": 46, "chave": "area_uso", "tipo": "multipla", "texto": "Uso predominante da área", "opcoes": [{"v": "floresta", "r": "Floresta"}, {"v": "area_em_regeneracao_capoeira", "r": "Capoeira"}, {"v": "agricultura", "r": "Agricultura"}, {"v": "pastagem", "r": "Pastagem"}, {"v": "sistema_agroflorestal", "r": "SAF"}, {"v": "infraestrutura_moradia", "r": "Moradia/quintal"}, {"v": "outro", "r": "Outros", "especificar": true}]}, 
  {"n": 47, "chave": "usa_recursos_naturais", "tipo": "unica", "texto": "A família utiliza recursos da floresta ou dos rios?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}]}, 
  {"n": 48, "chave": "recursos_coletados", "tipo": "multipla", "texto": "Quais recursos", "opcoes": [{"v": "frutos", "r": "Frutos/açaí"}, {"v": "castanhas", "r": "Castanha"}, {"v": "madeira", "r": "Madeira/lenha"}, {"v": "plantas_medicinais", "r": "Plantas medicinais"}, {"v": "oleos_sementes", "r": "Óleos/sementes"}, {"v": "cipos_fibras", "r": "Cipós/fibras"}, {"v": "pesca", "r": "Pesca"}, {"v": "caca", "r": "Caça"}, {"v": "outro", "r": "Outros", "especificar": true}], "mostrar_se": {"op": "!=", "se": "usa_recursos_naturais", "valor": "nao"}}, 
  {"n": 49, "chave": "recursos_disponibilidade", "tipo": "unica", "texto": "Nos últimos anos, a disponibilidade dos recursos naturais:", "opcoes": [{"v": "melhorou", "r": "Melhorou"}, {"v": "piorou", "r": "Piorou"}, {"v": "nao_mudou", "r": "Não mudou"}, {"v": "nao_sabe", "r": "Não sabe"}]}, 
  {"n": 50, "chave": "recursos_causas", "tipo": "multipla", "texto": "Principais causas da mudança", "opcoes": [{"v": "desmatamento", "r": "Desmatamento"}, {"v": "queimadas", "r": "Queimadas"}, {"v": "mudancas_climaticas", "r": "Mudanças no clima"}, {"v": "exploracao_excessiva", "r": "Exploração excessiva"}, {"v": "poluicao", "r": "Poluição"}, {"v": "avanco_pastagem", "r": "Avanço da pastagem"}, {"v": "avanco_urbano", "r": "Avanço urbano"}, {"v": "recuperacao_regeneracao", "r": "Recuperação/regeneração"}, {"v": "outro", "r": "Outra", "especificar": true}], "max_marcar": 3, "mostrar_se": {"todas": [{"op": "!=", "se": "recursos_disponibilidade", "valor": "nao_mudou"}, {"op": "!=", "se": "recursos_disponibilidade", "valor": "nao_sabe"}]}}]}, 
 {"id": "apa", "titulo": "A APA e a situação da terra", "perguntas": [
  {"n": 51, "chave": "apa_sabe", "tipo": "unica", "texto": "Você sabe que esta área faz parte de uma Área de Proteção Ambiental (APA)?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "ouviu_falar", "r": "Já ouviu falar, mas não sabe o que é"}], "leitura": "apa"}, 
  {"n": 52, "chave": "apa_regras", "tipo": "unica", "texto": "Você conhece as regras ou restrições de uso da terra e dos recursos naturais dentro da APA?", "opcoes": [{"v": "conhece_bem", "r": "Conhece bem"}, {"v": "conhece_pouco", "r": "Conhece um pouco"}, {"v": "nao_conhece", "r": "Não conhece"}], "mostrar_se": {"op": "!=", "se": "apa_sabe", "valor": "nao"}}, 
  {"n": 53, "chave": "apa_percepcao", "tipo": "unica", "texto": "Na sua opinião, estar dentro da APA traz mais benefícios ou mais dificuldades para a família?", "opcoes": [{"v": "mais_beneficios", "r": "Mais benefícios"}, {"v": "mais_dificuldades", "r": "Mais dificuldades"}, {"v": "nem_um_nem_outro", "r": "Nem um nem outro"}, {"v": "nao_sabe", "r": "Não sabe"}], "leitura": "apa", "ajuda": "Se a pessoa não sabia da APA, leia antes o que é uma APA."}, 
  {"n": 54, "chave": "apa_porque", "tipo": "texto_longo", "texto": "Por quê?", "ajuda": "Anote a fala da pessoa."}, 
  {"n": 55, "chave": "apa_conselho", "tipo": "unica", "texto": "Você conhece ou já participou do conselho gestor da APA?", "opcoes": [{"v": "participa", "r": "Participa ou já participou"}, {"v": "conhece_nao_participou", "r": "Conhece, mas nunca participou"}, {"v": "nao_conhece", "r": "Não conhece"}], "leitura": "apa"}, 
  {"n": 56, "chave": "terra_situacao", "tipo": "unica", "texto": "Qual é a situação da terra onde a família mora ou produz?", "opcoes": [{"v": "titulo_definitivo", "r": "Título definitivo"}, {"v": "posse_sem_documento", "r": "Posse sem documento"}, {"v": "contrato_compra", "r": "Contrato ou documento de compra"}, {"v": "assentamento", "r": "Assentamento"}, {"v": "cedida", "r": "Terra cedida"}, {"v": "arrendada", "r": "Arrendada"}, {"v": "nao_sabe", "r": "Não sabe"}, {"v": "outro", "r": "Outra", "especificar": true}]}, 
  {"n": 57, "chave": "terra_car", "tipo": "unica", "texto": "A propriedade tem Cadastro Ambiental Rural (CAR)?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "em_andamento", "r": "Está em andamento"}, {"v": "nao_sabe", "r": "Não sabe"}, {"v": "nao_se_aplica", "r": "Não se aplica (área urbana)"}]}, 
  {"n": 58, "chave": "terra_conflitos", "tipo": "unica", "texto": "Existem conflitos pelo uso da terra ou dos recursos naturais na comunidade?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "nao_sabe", "r": "Não sabe"}]}, 
  {"n": 59, "chave": "terra_conflitos_tipos", "tipo": "multipla", "texto": "Quais conflitos?", "opcoes": [{"v": "limites_terra", "r": "Limites de terra"}, {"v": "desmatamento_queimada_vizinhos", "r": "Desmatamento ou queimada de vizinhos"}, {"v": "uso_agua", "r": "Uso da água"}, {"v": "invasao_grilagem", "r": "Invasão ou grilagem"}, {"v": "caca_pesca", "r": "Caça ou pesca"}, {"v": "pressao_urbana_loteamentos", "r": "Pressão urbana ou loteamentos"}, {"v": "outro", "r": "Outro", "especificar": true}], "max_marcar": 3, "ajuda": "Conflitos da comunidade. Não cite nomes.", "mostrar_se": {"todas": [{"op": "!=", "se": "terra_conflitos", "valor": "nao"}, {"op": "!=", "se": "terra_conflitos", "valor": "nao_sabe"}]}}, 
  {"n": 60, "chave": "fiscalizacao_freq", "tipo": "unica", "texto": "Com que frequência há fiscalização ambiental na comunidade?", "opcoes": [{"v": "frequentemente", "r": "Frequentemente"}, {"v": "as_vezes", "r": "Às vezes"}, {"v": "raramente", "r": "Raramente"}, {"v": "nunca", "r": "Nunca"}, {"v": "nao_sabe", "r": "Não sabe"}]}]}, 
 {"id": "ambiental", "titulo": "Meio ambiente e mudanças climáticas", "perguntas": [
  {"n": 61, "chave": "amb_problemas", "tipo": "multipla", "texto": "Principais problemas ambientais da comunidade", "opcoes": [{"v": "desmatamento", "r": "Desmatamento"}, {"v": "queimadas", "r": "Queimadas/fumaça"}, {"v": "poluicao_da_agua", "r": "Poluição da água"}, {"v": "falta_de_agua", "r": "Falta de água"}, {"v": "erosao", "r": "Erosão"}, {"v": "assoreamento", "r": "Assoreamento"}, {"v": "perda_de_biodiversidade", "r": "Perda de fauna/flora"}, {"v": "residuos_lixo", "r": "Lixo"}, {"v": "uso_de_agrotoxicos", "r": "Agrotóxicos"}, {"v": "pesca_predatoria", "r": "Pesca predatória"}, {"v": "caca_predatoria", "r": "Caça predatória"}, {"v": "outro", "r": "Outro", "especificar": true}], "max_marcar": 3}, 
  {"n": 62, "chave": "clima_mudancas", "tipo": "multipla", "texto": "Nos últimos anos, percebe mudanças no clima?", "opcoes": [{"v": "chuvas_irregulares", "r": "Chuvas mais irregulares"}, {"v": "mais_calor", "r": "Mais calor"}, {"v": "secas_mais_fortes", "r": "Secas mais fortes"}, {"v": "enchentes_mais_fortes", "r": "Enchentes mais fortes"}, {"v": "mais_fumaca", "r": "Mais fumaça"}, {"v": "nao_percebe", "r": "Não percebe mudanças", "exclusiva": true}]}, 
  {"n": 63, "chave": "clima_eventos_5anos", "tipo": "multipla", "texto": "Nos últimos 5 anos, quais eventos afetaram a família?", "opcoes": [{"v": "seca", "r": "Seca/estiagem"}, {"v": "enchente", "r": "Enchente/alagação"}, {"v": "chuvas_intensas", "r": "Chuvas intensas"}, {"v": "calor_excessivo", "r": "Calor excessivo"}, {"v": "ventos_tempestades", "r": "Tempestades/ventos"}, {"v": "queimadas_fumaca", "r": "Queimadas/fumaça"}, {"v": "nenhum", "r": "Nenhum", "exclusiva": true}]}, 
  {"n": 64, "chave": "clima_afetado", "tipo": "multipla", "texto": "O que foi afetado", "opcoes": [{"v": "producao", "r": "Produção"}, {"v": "criacao_de_animais", "r": "Criação de animais"}, {"v": "transporte", "r": "Transporte/acesso"}, {"v": "saude", "r": "Saúde"}, {"v": "agua", "r": "Água"}, {"v": "renda", "r": "Renda"}, {"v": "moradia", "r": "Moradia"}, {"v": "outro", "r": "Outro", "especificar": true}], "mostrar_se": {"op": "nao_contem", "se": "clima_eventos_5anos", "valor": "nenhum"}}, 
  {"n": 65, "chave": "clima_reacao", "tipo": "multipla", "texto": "O que a família fez para enfrentar esses eventos?", "opcoes": [{"v": "mudou_plantio", "r": "Mudou a época ou o tipo de plantio"}, {"v": "diversificou", "r": "Diversificou a produção"}, {"v": "armazenou_agua", "r": "Armazenou água/fez poço"}, {"v": "outra_renda", "r": "Buscou outra fonte de renda"}, {"v": "saiu_de_casa", "r": "Saiu de casa temporariamente"}, {"v": "apoio_governo", "r": "Recebeu apoio do governo"}, {"v": "nada", "r": "Nada", "exclusiva": true}, {"v": "outro", "r": "Outro", "especificar": true}], "mostrar_se": {"op": "nao_contem", "se": "clima_eventos_5anos", "valor": "nenhum"}}, 
  {"n": 66, "chave": "amb_o_que_fazer", "tipo": "texto_longo", "texto": "Na sua opinião, o que deveria ser feito para melhorar as condições ambientais da comunidade?"}, 
  {"n": 67, "chave": "clima_ajuda", "tipo": "multipla", "texto": "O que mais ajudaria a comunidade a enfrentar secas, enchentes e outros eventos climáticos?", "opcoes": [{"v": "assistencia_tecnica", "r": "Assistência técnica"}, {"v": "poco_cisterna_agua", "r": "Poço/cisterna/água tratada"}, {"v": "recuperacao_nascentes", "r": "Recuperação de nascentes e matas ciliares"}, {"v": "estradas_ramais", "r": "Estradas/ramais"}, {"v": "credito", "r": "Crédito"}, {"v": "brigada_incendio", "r": "Brigada contra incêndio"}, {"v": "educacao_ambiental", "r": "Educação ambiental"}, {"v": "fiscalizacao", "r": "Fiscalização"}, {"v": "outro", "r": "Outro", "especificar": true}], "max_marcar": 3}]}, 
 {"id": "organizacao", "titulo": "Participação social", "perguntas": [
  {"n": 68, "chave": "participacao_org", "tipo": "multipla", "texto": "Participa de alguma organização?", "opcoes": [{"v": "associacao_produtores", "r": "Associação de produtores"}, {"v": "associacao_moradores", "r": "Associação de moradores"}, {"v": "cooperativa", "r": "Cooperativa"}, {"v": "sindicato", "r": "Sindicato"}, {"v": "grupo_de_mulheres", "r": "Grupo de mulheres"}, {"v": "grupo_religioso", "r": "Grupo religioso"}, {"v": "conselho", "r": "Conselho"}, {"v": "outro", "r": "Outra", "especificar": true}, {"v": "nao_participa", "r": "Não participa", "exclusiva": true}], "sensivel": true}, 
  {"n": 69, "chave": "moradores_participam", "tipo": "unica", "texto": "Os moradores participam das decisões que afetam a comunidade?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "parcialmente", "r": "Parcialmente"}, {"v": "nao", "r": "Não"}]}, 
  {"n": 70, "chave": "grupos_participam_menos", "tipo": "multipla", "texto": "Quais grupos participam menos das decisões?", "opcoes": [{"v": "mulheres", "r": "Mulheres"}, {"v": "jovens", "r": "Jovens"}, {"v": "idosos", "r": "Idosos"}, {"v": "pessoas_com_deficiencia", "r": "Pessoas com deficiência"}, {"v": "comunidades_tradicionais", "r": "Comunidades tradicionais"}, {"v": "outro", "r": "Outros", "especificar": true}, {"v": "nao_percebe_diferenca", "r": "Não percebe diferença", "exclusiva": true}]}]}, 
 {"id": "genero", "titulo": "Gênero e participação das mulheres", "lembrete": "Se possível, aplique este bloco em privado, sem outros moradores por perto.", "perguntas": [
  {"n": 71, "chave": "genero_oportunidades_iguais", "tipo": "unica", "texto": "Na sua percepção, homens e mulheres possuem as mesmas oportunidades na comunidade?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "parcialmente", "r": "Parcialmente"}, {"v": "nao", "r": "Não"}]}, 
  {"n": 72, "chave": "atividades_mulheres", "tipo": "multipla", "texto": "Quais atividades são geralmente realizadas pelas mulheres da família?", "opcoes": [{"v": "trabalho_domestico", "r": "Trabalho doméstico"}, {"v": "cuidado_com_criancas", "r": "Cuidado com crianças"}, {"v": "agricultura", "r": "Agricultura"}, {"v": "criacao_de_animais", "r": "Criação de animais"}, {"v": "extrativismo", "r": "Extrativismo"}, {"v": "pesca", "r": "Pesca"}, {"v": "comercio", "r": "Comércio"}, {"v": "artesanato", "r": "Artesanato"}, {"v": "trabalho_assalariado", "r": "Trabalho assalariado"}, {"v": "gestao_da_propriedade", "r": "Gestão da propriedade"}, {"v": "outro", "r": "Outras", "especificar": true}]}, 
  {"n": 73, "chave": "atividades_homens", "tipo": "multipla", "texto": "Quais atividades são geralmente realizadas pelos homens?", "opcoes": [{"v": "agricultura", "r": "Agricultura"}, {"v": "criacao_de_animais", "r": "Criação de animais"}, {"v": "extrativismo", "r": "Extrativismo"}, {"v": "pesca", "r": "Pesca"}, {"v": "comercio", "r": "Comércio"}, {"v": "trabalho_assalariado", "r": "Trabalho assalariado"}, {"v": "gestao_da_propriedade", "r": "Gestão da propriedade"}, {"v": "trabalho_domestico", "r": "Trabalho doméstico"}, {"v": "outro", "r": "Outras", "especificar": true}]}, 
  {"n": 74, "chave": "decisao_dinheiro", "tipo": "unica", "texto": "Quem normalmente toma as decisões sobre o uso do dinheiro da família?", "opcoes": [{"v": "principalmente_mulheres", "r": "Principalmente mulheres"}, {"v": "principalmente_homens", "r": "Principalmente homens"}, {"v": "ambos", "r": "Ambos"}, {"v": "depende_da_decisao", "r": "Depende da decisão"}]}, 
  {"n": 75, "chave": "decisao_producao", "tipo": "unica", "texto": "Quem normalmente decide sobre a produção e comercialização?", "opcoes": [{"v": "principalmente_mulheres", "r": "Principalmente mulheres"}, {"v": "principalmente_homens", "r": "Principalmente homens"}, {"v": "ambos", "r": "Ambos"}, {"v": "depende_da_atividade", "r": "Depende da atividade"}, {"v": "nao_se_aplica", "r": "Não se aplica (a família não produz)"}]}, 
  {"n": 76, "chave": "mulheres_renda_propria", "tipo": "unica", "texto": "As mulheres da comunidade possuem acesso a renda própria?", "opcoes": [{"v": "sim_a_maioria", "r": "Sim, a maioria"}, {"v": "algumas", "r": "Algumas"}, {"v": "poucas", "r": "Poucas"}, {"v": "nao", "r": "Não"}]}, 
  {"n": 77, "chave": "mulheres_participam", "tipo": "unica", "texto": "As mulheres participam das organizações e decisões comunitárias?", "opcoes": [{"v": "frequentemente", "r": "Frequentemente"}, {"v": "as_vezes", "r": "Às vezes"}, {"v": "raramente", "r": "Raramente"}, {"v": "nao_participam", "r": "Não participam"}]}, 
  {"n": 78, "chave": "grupo_mulheres_existe", "tipo": "unica", "texto": "Existem grupos ou organizações de mulheres na comunidade?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}]}, 
  {"n": 79, "chave": "grupo_mulheres_atividades", "tipo": "multipla", "texto": "Quais atividades esses grupos realizam?", "opcoes": [{"v": "producao", "r": "Produção"}, {"v": "artesanato", "r": "Artesanato"}, {"v": "comercializacao", "r": "Comercialização"}, {"v": "capacitacao", "r": "Capacitação"}, {"v": "organizacao_comunitaria", "r": "Organização comunitária"}, {"v": "apoio_social", "r": "Apoio social"}, {"v": "outro", "r": "Outras", "especificar": true}], "mostrar_se": {"op": "!=", "se": "grupo_mulheres_existe", "valor": "nao"}}, 
  {"n": 80, "chave": "mulheres_dificuldades", "tipo": "multipla", "texto": "O que dificulta a participação das mulheres na comunidade?", "opcoes": [{"v": "falta_de_tempo", "r": "Falta de tempo"}, {"v": "trabalho_domestico_cuidado", "r": "Trabalho doméstico/cuidado"}, {"v": "falta_de_recursos", "r": "Falta de recursos"}, {"v": "falta_de_transporte", "r": "Falta de transporte"}, {"v": "falta_de_oportunidades", "r": "Falta de oportunidades"}, {"v": "preconceito_discriminacao", "r": "Preconceito/discriminação"}, {"v": "falta_de_interesse", "r": "Falta de interesse"}, {"v": "nao_existem_dificuldades", "r": "Não existem dificuldades", "exclusiva": true}, {"v": "outro", "r": "Outro", "especificar": true}]}, 
  {"n": 81, "chave": "mulheres_acesso_oportunidades", "tipo": "unica", "texto": "As mulheres têm acesso a capacitação, assistência técnica, crédito e outras oportunidades produtivas?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "parcialmente", "r": "Parcialmente"}, {"v": "nao", "r": "Não"}]}, 
  {"n": 82, "chave": "mulheres_independencia", "tipo": "unica", "texto": "As mulheres se sentem financeiramente independentes?", "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "parcialmente", "r": "Parcialmente"}, {"v": "nao", "r": "Não"}]}, 
  {"n": 83, "chave": "mulheres_fortalecer", "tipo": "texto_longo", "texto": "O que poderia fortalecer a autonomia e a participação das mulheres na comunidade?"}, 
  {"n": 84, "chave": "grupos_mulheres_falta", "tipo": "texto_longo", "texto": "O que falta para os grupos de mulheres ficarem mais fortes?"}, 
  {"n": 85, "chave": "mulheres_necessidades", "tipo": "texto_longo", "texto": "Quais são as principais necessidades das mulheres da comunidade atualmente?"}]}, 
 {"id": "juventude", "titulo": "Juventude e sucessão rural", "perguntas": [
  {"n": 86, "chave": "jovens_permanecer", "tipo": "unica", "texto": "Os jovens (15 a 29 anos) da família pretendem continuar morando na comunidade?", "opcoes": [{"v": "sim_maioria", "r": "Sim, a maioria"}, {"v": "alguns", "r": "Alguns"}, {"v": "nao_maioria_sai", "r": "Não, a maioria pretende sair"}, {"v": "nao_sabe", "r": "Não sabe"}, {"v": "nao_ha_jovens", "r": "Não há jovens na família"}]}, 
  {"n": 87, "chave": "jovens_motivos_saida", "tipo": "multipla", "texto": "Principais motivos que levam os jovens a deixar a comunidade", "opcoes": [{"v": "trabalho", "r": "Trabalho"}, {"v": "estudo", "r": "Estudo"}, {"v": "falta_oportunidades", "r": "Falta de oportunidades"}, {"v": "acesso_servicos", "r": "Acesso a serviços"}, {"v": "casamento_familia", "r": "Casamento/família"}, {"v": "nao_saem", "r": "Os jovens não saem", "exclusiva": true}, {"v": "outro", "r": "Outros", "especificar": true}], "max_marcar": 3}, 
  {"n": 88, "chave": "jovens_oportunidades", "tipo": "multipla", "texto": "Que oportunidades seriam mais importantes para os jovens da comunidade?", "opcoes": [{"v": "capacitacao_profissional", "r": "Capacitação profissional"}, {"v": "educacao", "r": "Educação"}, {"v": "trabalho_renda", "r": "Trabalho e renda"}, {"v": "apoio_empreendimentos", "r": "Apoio a empreendimentos"}, {"v": "credito_terra", "r": "Crédito/terra"}, {"v": "internet", "r": "Internet"}, {"v": "esporte_cultura_lazer", "r": "Esporte, cultura e lazer"}, {"v": "outro", "r": "Outra", "especificar": true}], "max_marcar": 3}]}, 
 {"id": "futuro", "titulo": "Problemas, potencialidades e futuro", "perguntas": [
  {"n": 89, "chave": "comunidade_potenciais", "tipo": "multipla", "texto": "Maiores potenciais da comunidade", "opcoes": [{"v": "agricultura", "r": "Agricultura"}, {"v": "pecuaria", "r": "Pecuária"}, {"v": "extrativismo", "r": "Extrativismo"}, {"v": "produtos_da_sociobiodiversidade", "r": "Produtos da sociobiodiversidade"}, {"v": "turismo", "r": "Turismo"}, {"v": "organizacao_comunitaria", "r": "Organização comunitária"}, {"v": "recursos_naturais", "r": "Recursos naturais/água"}, {"v": "cultura_conhecimentos_tradicionais", "r": "Cultura e saberes tradicionais"}, {"v": "proximidade_cidade", "r": "Proximidade com a cidade"}, {"v": "outro", "r": "Outro", "especificar": true}], "max_marcar": 3}, 
  {"n": 90, "rotulo": "90.1", "chave": "prioridade_1", "tipo": "texto", "max_len": 200, "texto": "Quais devem ser as três prioridades de investimento na comunidade? — 1ª prioridade"}, 
  {"n": 90, "rotulo": "90.2", "chave": "prioridade_2", "tipo": "texto", "max_len": 200, "texto": "2ª prioridade", "opcional": true}, 
  {"n": 90, "rotulo": "90.3", "chave": "prioridade_3", "tipo": "texto", "max_len": 200, "texto": "3ª prioridade", "opcional": true}, 
  {"n": 91, "chave": "info_adicional", "tipo": "texto_longo", "texto": "Há alguma informação importante que não foi perguntada?"}]}, 
 {"id": "encerramento", "titulo": "Encerramento", "lembrete": "Agradeça e explique como será a devolutiva dos resultados. A hora de término é registrada pelo app ao concluir a ficha.", "perguntas": [
  {"n": 92, "chave": "obs_entrevistador", "tipo": "texto_longo", "texto": "Observações do entrevistador", "rotulo": "Obs.", "opcional": true, "ajuda": "Só do entrevistador; não é pergunta à família. Não escreva nomes."}]}
]$estrutura$::jsonb;
begin
  if exists (select 1 from diag_questionarios where codigo = 'DSA' and versao = 7) then
    return;
  end if;
  select * into v6 from diag_questionarios where codigo = 'DSA' and versao = 6;
  if v6.id is null then raise exception 'questionário DSA v6 não encontrado'; end if;

  -- lista de moradores da v6 sem o nome; escolaridade ganha o nível da P8
  select jsonb_agg(case when c->>'chave' = 'escolaridade'
                        then jsonb_set(c, '{opcoes}', (select jsonb_agg(case when nivel ? (o->>'v')
                                                                            then o || jsonb_build_object('nivel', nivel->>(o->>'v')) else o end
                                                                          order by i)
                                                        from jsonb_array_elements(c->'opcoes') with ordinality as oo(o, i)))
                        else c end order by j)
    into cols
    from jsonb_array_elements(v6.estrutura->'moradores'->'colunas') with ordinality as cc(c, j)
   where c->>'chave' <> 'nome';

  est := (v6.estrutura - array['mudanca_v2','mudanca_v3','mudanca_v4','mudanca_v5','mudanca_v6'])
         || jsonb_build_object('versao', 7, 'blocos', blocos,
              'moradores', (v6.estrutura->'moradores') || jsonb_build_object('colunas', cols),
              'mudanca_v7', 'Questionário FINAL da equipe técnica (08/10/2026): seção 0 + 91 perguntas, EBIA, juventude, "até 3" obrigatório, P8 calculada da lista de moradores (sem nomes)');

  insert into diag_questionarios (codigo, versao, titulo, estrutura, aviso_entrevistado)
  values ('DSA', 7, v6.titulo, est, v6.aviso_entrevistado);
end $$;

-- ROPA: a v7 traz dado sensível (cor/raça, povo tradicional, saúde da família,
-- deficiência, filiação) e renda/benefício social
update public.lgpd_tratamentos
   set categorias_dados = categorias_dados || array['cor ou raça e povo ou comunidade tradicional (autodeclarados)',
         'saúde da família (problemas frequentes, deficiência ou doença crônica), segurança alimentar (EBIA)',
         'faixa de renda, CadÚnico/Bolsa Família'],
       dado_sensivel = true,
       atualizado_em = now()
 where codigo = 'TRAT-001'
   and not (categorias_dados @> array['cor ou raça e povo ou comunidade tradicional (autodeclarados)']);
