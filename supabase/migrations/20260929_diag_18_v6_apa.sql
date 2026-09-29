-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 18 — v6: bloco "A APA e a situação da terra"
--
-- Pedido de 29/09/2026:
--   • bloco novo (7º), logo depois de "Uso da terra e recursos naturais",
--     com P46–P53; as perguntas seguintes andam +8 (P46→P54 … P82→P90);
--   • P47 (regras da APA) só se a P46 for "Sim" ou "Já ouviu falar";
--     P48 e P49 valem para todos — o entrevistador explica o que é a APA;
--   • P53 (quais conflitos) é múltipla e só aparece se a P52 for "Sim";
--   • texto "O que é uma APA?" guardado no próprio questionário
--     (estrutura.leituras.apa) e aberto por um botão nas P46, P48 e P49 —
--     para o entrevistador LER em voz alta. Só exibição: não é resposta,
--     não entra no interpretador (SQL nem JS).
--
-- A v6 nasce em RASCUNHO: pode ser testada no modo treino (TRE-) e só é
-- publicada depois que a coordenação aprovar o texto da APA — versão
-- publicada é imutável. Publicar = migração própria (v5 → arquivada).
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v5     diag_questionarios;
  b      jsonb;
  p      jsonb;
  ps     jsonb;
  blocos jsonb := '[]'::jsonb;
  est    jsonb;
  achou  boolean := false;
  novo   jsonb := $j${
    "id": "apa",
    "titulo": "A APA e a situação da terra",
    "perguntas": [
      {"n": 46, "tipo": "unica", "chave": "apa_sabe", "leitura": "apa",
       "texto": "Você sabe que esta área faz parte de uma Área de Proteção Ambiental (APA)?",
       "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"},
                  {"v": "ouviu_falar", "r": "Já ouviu falar, mas não sabe o que é"}]},
      {"n": 47, "tipo": "unica", "chave": "apa_regras",
       "texto": "Você conhece as regras ou restrições de uso da terra e dos recursos naturais dentro da APA?",
       "mostrar_se": {"op": "in", "se": "apa_sabe", "valor": ["sim", "ouviu_falar"]},
       "opcoes": [{"v": "conhece_bem", "r": "Conhece bem"}, {"v": "conhece_pouco", "r": "Conhece um pouco"},
                  {"v": "nao_conhece", "r": "Não conhece"}]},
      {"n": 48, "tipo": "unica", "chave": "apa_percepcao", "leitura": "apa",
       "texto": "Na sua opinião, estar dentro da APA traz mais benefícios ou mais dificuldades para a família?",
       "ajuda": "Se a pessoa não sabia da APA, leia antes o que é uma APA.",
       "opcoes": [{"v": "mais_beneficios", "r": "Mais benefícios"}, {"v": "mais_dificuldades", "r": "Mais dificuldades"},
                  {"v": "nem_um_nem_outro", "r": "Nem um nem outro"}, {"v": "nao_sabe", "r": "Não sabe"}]},
      {"n": 49, "tipo": "unica", "chave": "apa_conselho", "leitura": "apa",
       "texto": "Você conhece ou já participou do conselho gestor da APA?",
       "opcoes": [{"v": "participa", "r": "Participa ou já participou"},
                  {"v": "conhece_nao_participou", "r": "Conhece, mas nunca participou"},
                  {"v": "nao_conhece", "r": "Não conhece"}]},
      {"n": 50, "tipo": "unica", "chave": "terra_situacao",
       "texto": "Qual é a situação da terra onde a família mora ou produz?",
       "opcoes": [{"v": "titulo_definitivo", "r": "Título definitivo"}, {"v": "posse_sem_documento", "r": "Posse sem documento"},
                  {"v": "contrato_compra", "r": "Contrato ou documento de compra"}, {"v": "assentamento", "r": "Assentamento"},
                  {"v": "cedida", "r": "Terra cedida"}, {"v": "arrendada", "r": "Arrendada"},
                  {"v": "nao_sabe", "r": "Não sabe"}, {"v": "outro", "r": "Outra", "especificar": true}]},
      {"n": 51, "tipo": "unica", "chave": "terra_car",
       "texto": "A propriedade tem Cadastro Ambiental Rural (CAR)?",
       "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "em_andamento", "r": "Está em andamento"},
                  {"v": "nao_sabe", "r": "Não sabe"}, {"v": "nao_se_aplica", "r": "Não se aplica (área urbana)"}]},
      {"n": 52, "tipo": "unica", "chave": "terra_conflitos",
       "texto": "Existem conflitos pelo uso da terra ou dos recursos naturais na comunidade?",
       "opcoes": [{"v": "sim", "r": "Sim"}, {"v": "nao", "r": "Não"}, {"v": "nao_sabe", "r": "Não sabe"}]},
      {"n": 53, "tipo": "multipla", "chave": "terra_conflitos_tipos",
       "texto": "Quais são esses conflitos?",
       "ajuda": "Conflitos da comunidade. Não cite nomes.",
       "mostrar_se": {"op": "=", "se": "terra_conflitos", "valor": "sim"},
       "opcoes": [{"v": "divisa_vizinhos", "r": "Divisa entre vizinhos"}, {"v": "invasao", "r": "Invasão de terras"},
                  {"v": "desmatamento_queimadas", "r": "Desmatamento ou queimadas"}, {"v": "pesca_caca", "r": "Pesca ou caça"},
                  {"v": "fazendeiros", "r": "Conflito com fazendeiros"},
                  {"v": "orgaos_ambientais", "r": "Conflito com órgãos ambientais ou fiscalização"},
                  {"v": "outro", "r": "Outro", "especificar": true}]}
    ]}$j$::jsonb;
  -- RASCUNHO do texto: a coordenação aprova antes de publicar a v6
  apa    jsonb := jsonb_build_object(
    'titulo', 'O que é uma APA?',
    'texto', $t$Uma Área de Proteção Ambiental, a APA, é um tipo de unidade de conservação criada pelo poder público para proteger a natureza — as matas, os rios, os igarapés, os lagos e os animais — e, ao mesmo tempo, permitir que as pessoas continuem morando, trabalhando e produzindo no lugar.

Dentro de uma APA podem existir terras particulares e comunidades. A ideia não é tirar as famílias da área, e sim combinar o uso da terra e dos recursos naturais com o cuidado com o meio ambiente. Por isso, algumas atividades seguem regras próprias, por exemplo sobre desmatamento, queimadas e o cuidado com as margens dos rios e igarapés.

A APA tem um conselho gestor, com representantes do governo, de organizações e dos moradores, que discute as regras e as decisões sobre a área. Os moradores podem participar.

Esta comunidade fica dentro de uma APA.$t$);
begin
  if exists (select 1 from diag_questionarios where codigo = 'DSA' and versao = 6) then
    return;
  end if;
  select * into v5 from diag_questionarios where codigo = 'DSA' and versao = 5;
  if v5.id is null then raise exception 'questionário DSA v5 não encontrado'; end if;

  for b in select * from jsonb_array_elements(v5.estrutura->'blocos') loop
    ps := '[]'::jsonb;
    for p in select * from jsonb_array_elements(b->'perguntas') loop
      if (p->>'n')::int >= 46 then
        p := jsonb_set(p, '{n}', to_jsonb((p->>'n')::int + 8));
      end if;
      ps := ps || p;
    end loop;
    blocos := blocos || jsonb_build_array(jsonb_set(b, '{perguntas}', ps));
    if b->>'id' = 'terra' then          -- o bloco novo entra logo depois de "Uso da terra"
      blocos := blocos || jsonb_build_array(novo);
      achou := true;
    end if;
  end loop;
  if not achou then raise exception 'v5 sem o bloco terra'; end if;

  est := jsonb_set(v5.estrutura, '{blocos}', blocos);
  est := est || jsonb_build_object('versao', 6,
           'leituras', jsonb_build_object('apa', apa),
           'mudanca_v6', 'Bloco 7 "A APA e a situação da terra" (P46–P53, novo); texto "O que é uma APA?" para ler ao entrevistado; demais +8 (29/09/2026)');

  -- nasce em rascunho (default da tabela): testar no modo treino, aprovar o texto, publicar
  insert into diag_questionarios (codigo, versao, titulo, estrutura, aviso_entrevistado)
  values ('DSA', 6, v5.titulo, est, v5.aviso_entrevistado);
end $$;

-- ROPA: situação fundiária, CAR e conflitos (sem dado sensível; conflitos sem nomes)
update public.lgpd_tratamentos
   set categorias_dados = categorias_dados || array['conhecimento sobre a APA, situação da terra, CAR e conflitos pelo uso da terra (sem nomes)'],
       atualizado_em = now()
 where codigo = 'TRAT-001'
   and not (categorias_dados @> array['conhecimento sobre a APA, situação da terra, CAR e conflitos pelo uso da terra (sem nomes)']);
