-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 05 — questionário v1 (status RASCUNHO)
--
-- Estrutura gerada a partir do PDF "Diagnóstico socioambiental ONU" + decisões
-- de 26/09/2026 registradas em docs/diagnostico/instrumento-v1.md:
-- 81 perguntas em 10 blocos, saltos S1–S10, derivações D1/D2, "especifique"
-- em toda opção Outro, sugestões em P31/P55 e nas colunas de texto da P9.
--
-- Nasce como 'rascunho' (editável). A coordenação publica depois do piloto;
-- publicada, fica imutável (correção = versão 2). O texto do aviso ainda
-- depende do canal do Encarregado (marcado A DEFINIR).
-- ════════════════════════════════════════════════════════════════════════

insert into public.diag_questionarios (codigo, versao, titulo, estrutura, aviso_entrevistado, status)
values (
  'DSA', 1, 'Diagnóstico Socioambiental',
  $estrutura${
 "codigo": "DSA",
 "versao": 1,
 "titulo": "Diagnóstico Socioambiental",
 "texto_max_len": 2000,
 "outro_max_len": 120,
 "blocos": [
  {
   "id": "identificacao",
   "titulo": "Identificação e perfil",
   "perguntas": [
    {
     "n": 1,
     "chave": "dt_entrevista",
     "tipo": "data",
     "texto": "Data da entrevista",
     "coluna_fixa": true
    },
    {
     "n": 2,
     "chave": "municipio_ibge",
     "tipo": "catalogo",
     "texto": "Município",
     "coluna_fixa": true,
     "catalogo": "municipios"
    },
    {
     "n": 3,
     "chave": "comunidade",
     "tipo": "catalogo",
     "texto": "Comunidade/localidade",
     "coluna_fixa": true,
     "catalogo": "comunidades"
    },
    {
     "n": 4,
     "chave": "entrevistado_nome",
     "tipo": "texto",
     "texto": "Nome do entrevistado",
     "destino": "identificacao",
     "opcional": true,
     "max_len": 150,
     "ajuda": "Opcional. O nome não aparece em relatório."
    },
    {
     "n": 5,
     "chave": "sexo_genero",
     "tipo": "unica",
     "texto": "Sexo/gênero",
     "opcoes": [
      {
       "v": "mulher",
       "r": "Mulher"
      },
      {
       "v": "homem",
       "r": "Homem"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      },
      {
       "v": "prefere_nao_responder",
       "r": "Prefere não responder"
      }
     ]
    },
    {
     "n": 6,
     "chave": "idade",
     "tipo": "inteiro",
     "texto": "Idade",
     "min": 0,
     "max": 120,
     "aviso_min": 18
    },
    {
     "n": 7,
     "chave": "tempo_comunidade",
     "tipo": "unica",
     "texto": "Há quanto tempo mora na comunidade?",
     "opcoes": [
      {
       "v": "menos_de_1_ano",
       "r": "Menos de 1 ano"
      },
      {
       "v": "1_a_5_anos",
       "r": "1 a 5 anos"
      },
      {
       "v": "6_a_10_anos",
       "r": "6 a 10 anos"
      },
      {
       "v": "11_a_20_anos",
       "r": "11 a 20 anos"
      },
      {
       "v": "mais_de_20_anos",
       "r": "Mais de 20 anos"
      },
      {
       "v": "nasceu_na_comunidade",
       "r": "Nasceu na comunidade"
      }
     ]
    },
    {
     "n": 8,
     "chave": "qtd_moradores",
     "tipo": "inteiro",
     "texto": "Quantas pessoas vivem no domicílio?",
     "min": 1,
     "max": 30
    },
    {
     "n": 9,
     "chave": "moradores",
     "tipo": "tabela",
     "texto": "Quem mora atualmente no domicílio?",
     "destino": "moradores"
    }
   ]
  },
  {
   "id": "moradia",
   "titulo": "Moradia e infraestrutura",
   "perguntas": [
    {
     "n": 10,
     "chave": "moradia_situacao",
     "tipo": "unica",
     "texto": "Qual é a situação da moradia?",
     "opcoes": [
      {
       "v": "propria",
       "r": "Própria"
      },
      {
       "v": "cedida",
       "r": "Cedida"
      },
      {
       "v": "alugada",
       "r": "Alugada"
      },
      {
       "v": "outro",
       "r": "Outra",
       "especificar": true
      }
     ]
    },
    {
     "n": 11,
     "chave": "moradia_parede",
     "tipo": "unica",
     "texto": "Qual é o principal material das paredes da casa?",
     "opcoes": [
      {
       "v": "madeira",
       "r": "Madeira"
      },
      {
       "v": "alvenaria",
       "r": "Alvenaria"
      },
      {
       "v": "mista",
       "r": "Mista"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ]
    },
    {
     "n": 12,
     "chave": "energia_fonte",
     "tipo": "unica",
     "texto": "Qual é a principal fonte de energia elétrica?",
     "opcoes": [
      {
       "v": "rede_publica",
       "r": "Rede pública"
      },
      {
       "v": "gerador",
       "r": "Gerador"
      },
      {
       "v": "energia_solar",
       "r": "Energia solar"
      },
      {
       "v": "outro",
       "r": "Outra",
       "especificar": true
      },
      {
       "v": "nao_possui",
       "r": "Não possui"
      }
     ]
    },
    {
     "n": 13,
     "chave": "acesso_chuvoso",
     "tipo": "unica",
     "texto": "Como é o acesso à comunidade durante o período chuvoso?",
     "opcoes": [
      {
       "v": "bom",
       "r": "Bom"
      },
      {
       "v": "regular",
       "r": "Regular"
      },
      {
       "v": "ruim",
       "r": "Ruim"
      },
      {
       "v": "muito_ruim",
       "r": "Muito ruim"
      },
      {
       "v": "a_comunidade_fica_isolada",
       "r": "A comunidade fica isolada"
      }
     ]
    },
    {
     "n": 14,
     "chave": "comunicacao_meios",
     "tipo": "multipla",
     "texto": "Quais meios de comunicação estão disponíveis no domicílio?",
     "opcoes": [
      {
       "v": "celular",
       "r": "Celular"
      },
      {
       "v": "internet",
       "r": "Internet"
      },
      {
       "v": "televisao",
       "r": "Televisão"
      },
      {
       "v": "radio",
       "r": "Rádio"
      },
      {
       "v": "nenhum",
       "r": "Nenhum",
       "exclusiva": true
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ]
    },
    {
     "n": 15,
     "chave": "infra_dificuldades",
     "tipo": "multipla",
     "texto": "Quais são as principais dificuldades de infraestrutura da comunidade?",
     "opcoes": [
      {
       "v": "estradas",
       "r": "Estradas"
      },
      {
       "v": "transporte",
       "r": "Transporte"
      },
      {
       "v": "energia",
       "r": "Energia"
      },
      {
       "v": "internet_telefonia",
       "r": "Internet/telefonia"
      },
      {
       "v": "habitacao",
       "r": "Habitação"
      },
      {
       "v": "iluminacao_publica",
       "r": "Iluminação pública"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ]
    }
   ]
  },
  {
   "id": "agua",
   "titulo": "Água, saneamento e resíduos",
   "perguntas": [
    {
     "n": 16,
     "chave": "agua_fonte",
     "tipo": "unica",
     "texto": "Qual é a principal fonte de água utilizada pela família?",
     "opcoes": [
      {
       "v": "poco",
       "r": "Poço"
      },
      {
       "v": "rio_igarape",
       "r": "Rio/igarapé"
      },
      {
       "v": "acude",
       "r": "Açude"
      },
      {
       "v": "nascente",
       "r": "Nascente"
      },
      {
       "v": "chuva",
       "r": "Chuva"
      },
      {
       "v": "rede_publica",
       "r": "Rede pública"
      },
      {
       "v": "outro",
       "r": "Outra",
       "especificar": true
      }
     ]
    },
    {
     "n": 17,
     "chave": "agua_tratada",
     "tipo": "unica",
     "texto": "A água utilizada para consumo recebe algum tratamento?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 18,
     "chave": "agua_tratamento",
     "tipo": "multipla",
     "texto": "Qual tratamento é realizado?",
     "opcoes": [
      {
       "v": "filtracao",
       "r": "Filtração"
      },
      {
       "v": "cloracao",
       "r": "Cloração"
      },
      {
       "v": "fervura",
       "r": "Fervura"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ],
     "mostrar_se": {
      "se": "agua_tratada",
      "op": "=",
      "valor": "sim"
     }
    },
    {
     "n": 19,
     "chave": "agua_falta",
     "tipo": "unica",
     "texto": "Há períodos do ano em que falta água?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 20,
     "chave": "esgoto_destino",
     "tipo": "unica",
     "texto": "Qual é o destino principal dos esgotos/águas residuais da residência?",
     "opcoes": [
      {
       "v": "fossa",
       "r": "Fossa"
      },
      {
       "v": "ceu_aberto",
       "r": "Céu aberto"
      },
      {
       "v": "rio_igarape",
       "r": "Rio/igarapé"
      },
      {
       "v": "sistema_coletivo",
       "r": "Sistema coletivo"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ]
    },
    {
     "n": 21,
     "chave": "lixo_destino",
     "tipo": "multipla",
     "texto": "Como é destinado o lixo produzido na residência?",
     "opcoes": [
      {
       "v": "coleta_publica",
       "r": "Coleta pública"
      },
      {
       "v": "queimado",
       "r": "Queimado"
      },
      {
       "v": "enterrado",
       "r": "Enterrado"
      },
      {
       "v": "descartado_a_ceu_aberto",
       "r": "Descartado a céu aberto"
      },
      {
       "v": "reciclado_reaproveitado",
       "r": "Reciclado/reaproveitado"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ]
    }
   ]
  },
  {
   "id": "saude_educacao",
   "titulo": "Saúde e educação",
   "perguntas": [
    {
     "n": 22,
     "chave": "saude_onde",
     "tipo": "unica",
     "texto": "Quando alguém da família precisa de atendimento de saúde, onde procura atendimento principalmente?",
     "opcoes": [
      {
       "v": "unidade_de_saude",
       "r": "Unidade de saúde"
      },
      {
       "v": "hospital",
       "r": "Hospital"
      },
      {
       "v": "atendimento_particular",
       "r": "Atendimento particular"
      },
      {
       "v": "farmacia",
       "r": "Farmácia"
      },
      {
       "v": "medicina_tradicional_caseira",
       "r": "Medicina tradicional/caseira"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ]
    },
    {
     "n": 23,
     "chave": "saude_dificuldade",
     "tipo": "unica",
     "texto": "Qual é a principal dificuldade para acessar serviços de saúde?",
     "opcoes": [
      {
       "v": "distancia",
       "r": "Distância"
      },
      {
       "v": "transporte",
       "r": "Transporte"
      },
      {
       "v": "custo",
       "r": "Custo"
      },
      {
       "v": "falta_de_atendimento",
       "r": "Falta de atendimento"
      },
      {
       "v": "tempo_de_espera",
       "r": "Tempo de espera"
      },
      {
       "v": "nao_ha_dificuldade",
       "r": "Não há dificuldade"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ]
    },
    {
     "n": 24,
     "chave": "saude_problemas_freq",
     "tipo": "unica",
     "texto": "Existem problemas de saúde frequentes na comunidade?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 25,
     "chave": "saude_problemas_quais",
     "tipo": "multipla",
     "texto": "Quais são esses problemas?",
     "mostrar_se": {
      "se": "saude_problemas_freq",
      "op": "=",
      "valor": "sim"
     },
     "ajuda": "Problemas da comunidade. Não cite nomes.",
     "opcoes": [
      {
       "v": "diarreia_verminoses",
       "r": "Diarreia/verminoses"
      },
      {
       "v": "malaria",
       "r": "Malária"
      },
      {
       "v": "dengue_chikungunya_zika",
       "r": "Dengue/chikungunya/zika"
      },
      {
       "v": "doencas_respiratorias",
       "r": "Doenças respiratórias"
      },
      {
       "v": "doencas_de_pele",
       "r": "Doenças de pele"
      },
      {
       "v": "hipertensao_diabetes",
       "r": "Hipertensão/diabetes"
      },
      {
       "v": "desnutricao",
       "r": "Desnutrição"
      },
      {
       "v": "acidentes_com_animais_peconhentos",
       "r": "Acidentes com animais peçonhentos"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ]
    },
    {
     "n": 26,
     "chave": "tem_escolar",
     "tipo": "unica",
     "texto": "Há crianças ou jovens em idade escolar no domicílio?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ],
     "derivada": "tem_escolar",
     "ajuda": "Calculada a partir dos moradores (4 a 17 anos)."
    },
    {
     "n": 27,
     "chave": "educacao_dificuldades",
     "tipo": "multipla",
     "texto": "Quais são as principais dificuldades relacionadas à educação na comunidade?",
     "opcoes": [
      {
       "v": "distancia",
       "r": "Distância"
      },
      {
       "v": "transporte",
       "r": "Transporte"
      },
      {
       "v": "falta_de_escola",
       "r": "Falta de escola"
      },
      {
       "v": "falta_de_professores",
       "r": "Falta de professores"
      },
      {
       "v": "falta_de_internet_material",
       "r": "Falta de internet/material"
      },
      {
       "v": "nenhuma",
       "r": "Nenhuma",
       "exclusiva": true
      },
      {
       "v": "outro",
       "r": "Outra",
       "especificar": true
      }
     ]
    }
   ]
  },
  {
   "id": "renda",
   "titulo": "Trabalho, renda e produção",
   "perguntas": [
    {
     "n": 28,
     "chave": "renda_fontes",
     "tipo": "multipla",
     "texto": "Quais são as principais fontes de renda da família?",
     "opcoes": [
      {
       "v": "agricultura",
       "r": "Agricultura"
      },
      {
       "v": "pecuaria",
       "r": "Pecuária"
      },
      {
       "v": "extrativismo",
       "r": "Extrativismo"
      },
      {
       "v": "pesca",
       "r": "Pesca"
      },
      {
       "v": "trabalho_assalariado",
       "r": "Trabalho assalariado"
      },
      {
       "v": "comercio",
       "r": "Comércio"
      },
      {
       "v": "beneficios_sociais",
       "r": "Benefícios sociais"
      },
      {
       "v": "aposentadoria_pensao",
       "r": "Aposentadoria/pensão"
      },
      {
       "v": "prestacao_de_servicos",
       "r": "Prestação de serviços"
      },
      {
       "v": "outro",
       "r": "Outra",
       "especificar": true
      }
     ]
    },
    {
     "n": 29,
     "chave": "renda_suficiente",
     "tipo": "unica",
     "texto": "A renda familiar é suficiente para atender às necessidades básicas?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "parcialmente",
       "r": "Parcialmente"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 30,
     "chave": "producao_atividades",
     "tipo": "multipla",
     "texto": "Quais atividades produtivas são realizadas pela família?",
     "opcoes": [
      {
       "v": "agricultura",
       "r": "Agricultura"
      },
      {
       "v": "criacao_de_animais",
       "r": "Criação de animais"
      },
      {
       "v": "pesca",
       "r": "Pesca"
      },
      {
       "v": "extrativismo",
       "r": "Extrativismo"
      },
      {
       "v": "artesanato",
       "r": "Artesanato"
      },
      {
       "v": "comercio",
       "r": "Comércio"
      },
      {
       "v": "prestacao_de_servicos",
       "r": "Prestação de serviços"
      },
      {
       "v": "nenhuma",
       "r": "Nenhuma",
       "exclusiva": true
      },
      {
       "v": "outro",
       "r": "Outra",
       "especificar": true
      }
     ]
    },
    {
     "n": 31,
     "chave": "producao_produtos",
     "tipo": "texto_longo",
     "texto": "Quais são os principais produtos produzidos pela família?",
     "sugestoes": true,
     "mostrar_se": {
      "se": "producao_atividades",
      "op": "nao_contem",
      "valor": "nenhuma"
     }
    },
    {
     "n": 32,
     "chave": "producao_destino",
     "tipo": "unica",
     "texto": "A produção é destinada principalmente a:",
     "opcoes": [
      {
       "v": "consumo_proprio",
       "r": "Consumo próprio"
      },
      {
       "v": "venda",
       "r": "Venda"
      },
      {
       "v": "ambos",
       "r": "Ambos"
      }
     ],
     "mostrar_se": {
      "se": "producao_atividades",
      "op": "nao_contem",
      "valor": "nenhuma"
     }
    },
    {
     "n": 33,
     "chave": "comercializa_onde",
     "tipo": "multipla",
     "texto": "Onde os produtos são comercializados?",
     "opcoes": [
      {
       "v": "na_propria_comunidade",
       "r": "Na própria comunidade"
      },
      {
       "v": "feira",
       "r": "Feira"
      },
      {
       "v": "mercado_local",
       "r": "Mercado local"
      },
      {
       "v": "intermediario",
       "r": "Intermediário"
      },
      {
       "v": "cooperativa_associacao",
       "r": "Cooperativa/associação"
      },
      {
       "v": "nao_comercializa",
       "r": "Não comercializa",
       "exclusiva": true
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ],
     "mostrar_se": {
      "todas": [
       {
        "se": "producao_atividades",
        "op": "nao_contem",
        "valor": "nenhuma"
       },
       {
        "se": "producao_destino",
        "op": "!=",
        "valor": "consumo_proprio"
       }
      ]
     }
    },
    {
     "n": 34,
     "chave": "producao_dificuldades",
     "tipo": "multipla",
     "texto": "Quais são as principais dificuldades para produzir?",
     "opcoes": [
      {
       "v": "falta_de_recursos_financeiros",
       "r": "Falta de recursos financeiros"
      },
      {
       "v": "falta_de_assistencia_tecnica",
       "r": "Falta de assistência técnica"
      },
      {
       "v": "transporte",
       "r": "Transporte"
      },
      {
       "v": "mercado_comercializacao",
       "r": "Mercado/comercialização"
      },
      {
       "v": "mao_de_obra",
       "r": "Mão de obra"
      },
      {
       "v": "insumos",
       "r": "Insumos"
      },
      {
       "v": "clima",
       "r": "Clima"
      },
      {
       "v": "acesso_a_terra",
       "r": "Acesso à terra"
      },
      {
       "v": "outro",
       "r": "Outra",
       "especificar": true
      }
     ],
     "mostrar_se": {
      "se": "producao_atividades",
      "op": "nao_contem",
      "valor": "nenhuma"
     }
    },
    {
     "n": 35,
     "chave": "acesso_credito",
     "tipo": "unica",
     "texto": "A família possui acesso a crédito ou financiamento para produção?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 36,
     "chave": "recebe_ater",
     "tipo": "unica",
     "texto": "A família recebe ou já recebeu assistência técnica?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 37,
     "chave": "producao_desejo",
     "tipo": "texto_longo",
     "texto": "Quais atividades produtivas você gostaria de desenvolver ou ampliar?"
    }
   ]
  },
  {
   "id": "terra",
   "titulo": "Uso da terra e recursos naturais",
   "perguntas": [
    {
     "n": 38,
     "chave": "area_tamanho_ha",
     "tipo": "decimal",
     "texto": "Qual é aproximadamente o tamanho da área utilizada pela família? (em hectares)",
     "unidade": "ha",
     "min": 0,
     "max": 100000,
     "aviso_max": 1000
    },
    {
     "n": 39,
     "chave": "area_uso",
     "tipo": "multipla",
     "texto": "Como a área é utilizada atualmente?",
     "opcoes": [
      {
       "v": "floresta",
       "r": "Floresta"
      },
      {
       "v": "area_em_regeneracao_capoeira",
       "r": "Área em regeneração/capoeira"
      },
      {
       "v": "agricultura",
       "r": "Agricultura"
      },
      {
       "v": "pastagem",
       "r": "Pastagem"
      },
      {
       "v": "sistema_agroflorestal",
       "r": "Sistema agroflorestal"
      },
      {
       "v": "infraestrutura_moradia",
       "r": "Infraestrutura/moradia"
      },
      {
       "v": "outro",
       "r": "Outros",
       "especificar": true
      }
     ]
    },
    {
     "n": 40,
     "chave": "usa_recursos_naturais",
     "tipo": "unica",
     "texto": "A família utiliza produtos da floresta ou outros recursos naturais?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 41,
     "chave": "recursos_coletados",
     "tipo": "multipla",
     "texto": "Quais produtos são utilizados ou coletados?",
     "opcoes": [
      {
       "v": "frutos",
       "r": "Frutos"
      },
      {
       "v": "castanhas",
       "r": "Castanhas"
      },
      {
       "v": "oleos_sementes",
       "r": "Óleos/sementes"
      },
      {
       "v": "madeira",
       "r": "Madeira"
      },
      {
       "v": "plantas_medicinais",
       "r": "Plantas medicinais"
      },
      {
       "v": "cipos_fibras",
       "r": "Cipós/fibras"
      },
      {
       "v": "caca",
       "r": "Caça"
      },
      {
       "v": "pesca",
       "r": "Pesca"
      },
      {
       "v": "outro",
       "r": "Outros",
       "especificar": true
      }
     ],
     "mostrar_se": {
      "se": "usa_recursos_naturais",
      "op": "=",
      "valor": "sim"
     }
    },
    {
     "n": 42,
     "chave": "recursos_destino",
     "tipo": "unica",
     "texto": "Esses produtos são destinados principalmente a:",
     "opcoes": [
      {
       "v": "consumo",
       "r": "Consumo"
      },
      {
       "v": "venda",
       "r": "Venda"
      },
      {
       "v": "ambos",
       "r": "Ambos"
      }
     ],
     "mostrar_se": {
      "se": "usa_recursos_naturais",
      "op": "=",
      "valor": "sim"
     }
    },
    {
     "n": 43,
     "chave": "recursos_importantes",
     "tipo": "texto_longo",
     "texto": "Quais recursos naturais são considerados mais importantes para a comunidade?"
    },
    {
     "n": 44,
     "chave": "recursos_mudanca",
     "tipo": "unica",
     "texto": "Houve mudanças na disponibilidade desses recursos nos últimos anos?",
     "opcoes": [
      {
       "v": "aumentou",
       "r": "Aumentou"
      },
      {
       "v": "diminuiu",
       "r": "Diminuiu"
      },
      {
       "v": "nao_mudou",
       "r": "Não mudou"
      },
      {
       "v": "nao_sabe",
       "r": "Não sabe"
      }
     ]
    },
    {
     "n": 45,
     "chave": "recursos_mudanca_causas",
     "tipo": "multipla",
     "texto": "Quais são as principais causas dessas mudanças?",
     "opcoes": [
      {
       "v": "desmatamento",
       "r": "Desmatamento"
      },
      {
       "v": "mudancas_climaticas",
       "r": "Mudanças climáticas"
      },
      {
       "v": "queimadas",
       "r": "Queimadas"
      },
      {
       "v": "exploracao_excessiva",
       "r": "Exploração excessiva"
      },
      {
       "v": "poluicao",
       "r": "Poluição"
      },
      {
       "v": "mudanca_no_uso_da_terra",
       "r": "Mudança no uso da terra"
      },
      {
       "v": "nao_sabe",
       "r": "Não sabe",
       "exclusiva": true
      },
      {
       "v": "outro",
       "r": "Outra",
       "especificar": true
      }
     ],
     "mostrar_se": {
      "se": "recursos_mudanca",
      "op": "in",
      "valor": [
       "aumentou",
       "diminuiu"
      ]
     }
    }
   ]
  },
  {
   "id": "ambiental",
   "titulo": "Diagnóstico ambiental",
   "perguntas": [
    {
     "n": 46,
     "chave": "amb_problemas",
     "tipo": "multipla",
     "texto": "Quais são os principais problemas ambientais da comunidade?",
     "opcoes": [
      {
       "v": "desmatamento",
       "r": "Desmatamento"
      },
      {
       "v": "queimadas",
       "r": "Queimadas"
      },
      {
       "v": "poluicao_da_agua",
       "r": "Poluição da água"
      },
      {
       "v": "falta_de_agua",
       "r": "Falta de água"
      },
      {
       "v": "erosao",
       "r": "Erosão"
      },
      {
       "v": "assoreamento",
       "r": "Assoreamento"
      },
      {
       "v": "perda_de_biodiversidade",
       "r": "Perda de biodiversidade"
      },
      {
       "v": "residuos_lixo",
       "r": "Resíduos/lixo"
      },
      {
       "v": "uso_de_agrotoxicos",
       "r": "Uso de agrotóxicos"
      },
      {
       "v": "pesca_predatoria",
       "r": "Pesca predatória"
      },
      {
       "v": "caca_predatoria",
       "r": "Caça predatória"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ]
    },
    {
     "n": 47,
     "chave": "agua_qualidade_problema",
     "tipo": "unica",
     "texto": "Existem problemas relacionados à qualidade da água?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 48,
     "chave": "agua_qualidade_quais",
     "tipo": "texto_longo",
     "texto": "Quais são esses problemas?",
     "mostrar_se": {
      "se": "agua_qualidade_problema",
      "op": "=",
      "valor": "sim"
     }
    },
    {
     "n": 49,
     "chave": "clima_eventos_afeta",
     "tipo": "unica",
     "texto": "A comunidade enfrenta problemas relacionados a secas, enchentes ou outros eventos climáticos?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 50,
     "chave": "clima_eventos_quais",
     "tipo": "multipla",
     "texto": "Quais eventos causam mais impacto?",
     "opcoes": [
      {
       "v": "seca",
       "r": "Seca"
      },
      {
       "v": "enchente",
       "r": "Enchente"
      },
      {
       "v": "chuvas_intensas",
       "r": "Chuvas intensas"
      },
      {
       "v": "calor_excessivo",
       "r": "Calor excessivo"
      },
      {
       "v": "ventos_tempestades",
       "r": "Ventos/tempestades"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ],
     "mostrar_se": {
      "se": "clima_eventos_afeta",
      "op": "=",
      "valor": "sim"
     }
    },
    {
     "n": 51,
     "chave": "clima_atividades_afetadas",
     "tipo": "multipla",
     "texto": "Esses eventos afetam quais atividades?",
     "opcoes": [
      {
       "v": "agricultura",
       "r": "Agricultura"
      },
      {
       "v": "criacao_de_animais",
       "r": "Criação de animais"
      },
      {
       "v": "pesca",
       "r": "Pesca"
      },
      {
       "v": "extrativismo",
       "r": "Extrativismo"
      },
      {
       "v": "transporte",
       "r": "Transporte"
      },
      {
       "v": "saude",
       "r": "Saúde"
      },
      {
       "v": "abastecimento_de_agua",
       "r": "Abastecimento de água"
      },
      {
       "v": "outro",
       "r": "Outra",
       "especificar": true
      }
     ],
     "mostrar_se": {
      "se": "clima_eventos_afeta",
      "op": "=",
      "valor": "sim"
     }
    },
    {
     "n": 52,
     "chave": "amb_percepcao_mudanca",
     "tipo": "unica",
     "texto": "Na sua percepção, o ambiente da comunidade mudou nos últimos anos?",
     "opcoes": [
      {
       "v": "melhorou",
       "r": "Melhorou"
      },
      {
       "v": "piorou",
       "r": "Piorou"
      },
      {
       "v": "nao_mudou",
       "r": "Não mudou"
      },
      {
       "v": "nao_sabe",
       "r": "Não sabe"
      }
     ]
    },
    {
     "n": 53,
     "chave": "amb_o_que_fazer",
     "tipo": "texto_longo",
     "texto": "O que deveria ser feito para melhorar as condições ambientais da comunidade?"
    }
   ]
  },
  {
   "id": "organizacao",
   "titulo": "Organização social e participação",
   "perguntas": [
    {
     "n": 54,
     "chave": "participa_org",
     "tipo": "unica",
     "texto": "Você participa de alguma associação, cooperativa, sindicato, grupo comunitário ou outra organização?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ],
     "sensivel": true
    },
    {
     "n": 55,
     "chave": "participa_org_quais",
     "tipo": "texto_longo",
     "texto": "De quais organizações participa?",
     "sugestoes": true,
     "sensivel": true,
     "mostrar_se": {
      "se": "participa_org",
      "op": "=",
      "valor": "sim"
     }
    },
    {
     "n": 56,
     "chave": "decisoes_como",
     "tipo": "multipla",
     "texto": "Como são tomadas as principais decisões da comunidade?",
     "opcoes": [
      {
       "v": "reunioes_comunitarias",
       "r": "Reuniões comunitárias"
      },
      {
       "v": "associacao_lideranca",
       "r": "Associação/liderança"
      },
      {
       "v": "familias_individualmente",
       "r": "Famílias individualmente"
      },
      {
       "v": "liderancas_formais",
       "r": "Lideranças formais"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ]
    },
    {
     "n": 57,
     "chave": "moradores_participam",
     "tipo": "unica",
     "texto": "Você considera que os moradores participam das decisões que afetam a comunidade?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "parcialmente",
       "r": "Parcialmente"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 58,
     "chave": "grupos_participam_menos",
     "tipo": "multipla",
     "texto": "Quais grupos participam menos das decisões?",
     "opcoes": [
      {
       "v": "mulheres",
       "r": "Mulheres"
      },
      {
       "v": "jovens",
       "r": "Jovens"
      },
      {
       "v": "idosos",
       "r": "Idosos"
      },
      {
       "v": "pessoas_com_deficiencia",
       "r": "Pessoas com deficiência"
      },
      {
       "v": "comunidades_tradicionais",
       "r": "Comunidades tradicionais"
      },
      {
       "v": "nao_percebe_diferenca",
       "r": "Não percebe diferença",
       "exclusiva": true
      },
      {
       "v": "outro",
       "r": "Outros",
       "especificar": true
      }
     ]
    },
    {
     "n": 59,
     "chave": "instituicoes_contribuem",
     "tipo": "texto_longo",
     "texto": "Quais organizações ou instituições mais contribuem para a comunidade?"
    }
   ]
  },
  {
   "id": "genero",
   "titulo": "Gênero e participação das mulheres",
   "lembrete": "Se possível, aplique este bloco em privado, sem outros moradores por perto.",
   "perguntas": [
    {
     "n": 60,
     "chave": "genero_oportunidades_iguais",
     "tipo": "unica",
     "texto": "Na sua percepção, homens e mulheres possuem as mesmas oportunidades na comunidade?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "parcialmente",
       "r": "Parcialmente"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 61,
     "chave": "atividades_mulheres",
     "tipo": "multipla",
     "texto": "Quais atividades são geralmente realizadas pelas mulheres da família?",
     "opcoes": [
      {
       "v": "trabalho_domestico",
       "r": "Trabalho doméstico"
      },
      {
       "v": "cuidado_com_criancas",
       "r": "Cuidado com crianças"
      },
      {
       "v": "agricultura",
       "r": "Agricultura"
      },
      {
       "v": "criacao_de_animais",
       "r": "Criação de animais"
      },
      {
       "v": "extrativismo",
       "r": "Extrativismo"
      },
      {
       "v": "pesca",
       "r": "Pesca"
      },
      {
       "v": "comercio",
       "r": "Comércio"
      },
      {
       "v": "artesanato",
       "r": "Artesanato"
      },
      {
       "v": "trabalho_assalariado",
       "r": "Trabalho assalariado"
      },
      {
       "v": "gestao_da_propriedade",
       "r": "Gestão da propriedade"
      },
      {
       "v": "outro",
       "r": "Outras",
       "especificar": true
      },
      {
       "v": "nao_ha_mulheres",
       "r": "Não há mulheres no domicílio",
       "exclusiva": true,
       "so_se_derivada": "sem_mulheres"
      }
     ]
    },
    {
     "n": 62,
     "chave": "atividades_homens",
     "tipo": "multipla",
     "texto": "Quais atividades são geralmente realizadas pelos homens?",
     "opcoes": [
      {
       "v": "agricultura",
       "r": "Agricultura"
      },
      {
       "v": "criacao_de_animais",
       "r": "Criação de animais"
      },
      {
       "v": "extrativismo",
       "r": "Extrativismo"
      },
      {
       "v": "pesca",
       "r": "Pesca"
      },
      {
       "v": "comercio",
       "r": "Comércio"
      },
      {
       "v": "trabalho_assalariado",
       "r": "Trabalho assalariado"
      },
      {
       "v": "gestao_da_propriedade",
       "r": "Gestão da propriedade"
      },
      {
       "v": "trabalho_domestico",
       "r": "Trabalho doméstico"
      },
      {
       "v": "outro",
       "r": "Outras",
       "especificar": true
      },
      {
       "v": "nao_ha_homens",
       "r": "Não há homens no domicílio",
       "exclusiva": true,
       "so_se_derivada": "sem_homens"
      }
     ]
    },
    {
     "n": 63,
     "chave": "decisao_dinheiro",
     "tipo": "unica",
     "texto": "Quem normalmente toma as decisões sobre o uso do dinheiro da família?",
     "opcoes": [
      {
       "v": "principalmente_mulheres",
       "r": "Principalmente mulheres"
      },
      {
       "v": "principalmente_homens",
       "r": "Principalmente homens"
      },
      {
       "v": "ambos",
       "r": "Ambos"
      },
      {
       "v": "depende_da_decisao",
       "r": "Depende da decisão"
      }
     ]
    },
    {
     "n": 64,
     "chave": "decisao_producao",
     "tipo": "unica",
     "texto": "Quem normalmente decide sobre a produção e comercialização?",
     "opcoes": [
      {
       "v": "principalmente_mulheres",
       "r": "Principalmente mulheres"
      },
      {
       "v": "principalmente_homens",
       "r": "Principalmente homens"
      },
      {
       "v": "ambos",
       "r": "Ambos"
      },
      {
       "v": "depende_da_atividade",
       "r": "Depende da atividade"
      }
     ]
    },
    {
     "n": 65,
     "chave": "mulheres_renda_propria",
     "tipo": "unica",
     "texto": "As mulheres da comunidade possuem acesso a renda própria?",
     "opcoes": [
      {
       "v": "sim_a_maioria",
       "r": "Sim, a maioria"
      },
      {
       "v": "algumas",
       "r": "Algumas"
      },
      {
       "v": "poucas",
       "r": "Poucas"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 66,
     "chave": "mulheres_participam",
     "tipo": "unica",
     "texto": "As mulheres participam das organizações e decisões comunitárias?",
     "opcoes": [
      {
       "v": "frequentemente",
       "r": "Frequentemente"
      },
      {
       "v": "as_vezes",
       "r": "Às vezes"
      },
      {
       "v": "raramente",
       "r": "Raramente"
      },
      {
       "v": "nao_participam",
       "r": "Não participam"
      }
     ]
    },
    {
     "n": 67,
     "chave": "grupo_mulheres_existe",
     "tipo": "unica",
     "texto": "Existem grupos ou organizações de mulheres na comunidade?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 68,
     "chave": "grupo_mulheres_atividades",
     "tipo": "multipla",
     "texto": "Quais atividades esses grupos realizam?",
     "opcoes": [
      {
       "v": "producao",
       "r": "Produção"
      },
      {
       "v": "artesanato",
       "r": "Artesanato"
      },
      {
       "v": "comercializacao",
       "r": "Comercialização"
      },
      {
       "v": "capacitacao",
       "r": "Capacitação"
      },
      {
       "v": "organizacao_comunitaria",
       "r": "Organização comunitária"
      },
      {
       "v": "apoio_social",
       "r": "Apoio social"
      },
      {
       "v": "outro",
       "r": "Outras",
       "especificar": true
      }
     ],
     "mostrar_se": {
      "se": "grupo_mulheres_existe",
      "op": "=",
      "valor": "sim"
     }
    },
    {
     "n": 69,
     "chave": "mulheres_dificuldades",
     "tipo": "multipla",
     "texto": "O que dificulta a participação das mulheres na comunidade?",
     "opcoes": [
      {
       "v": "falta_de_tempo",
       "r": "Falta de tempo"
      },
      {
       "v": "trabalho_domestico_cuidado",
       "r": "Trabalho doméstico/cuidado"
      },
      {
       "v": "falta_de_recursos",
       "r": "Falta de recursos"
      },
      {
       "v": "falta_de_transporte",
       "r": "Falta de transporte"
      },
      {
       "v": "falta_de_oportunidades",
       "r": "Falta de oportunidades"
      },
      {
       "v": "preconceito_discriminacao",
       "r": "Preconceito/discriminação"
      },
      {
       "v": "falta_de_interesse",
       "r": "Falta de interesse"
      },
      {
       "v": "nao_existem_dificuldades",
       "r": "Não existem dificuldades",
       "exclusiva": true
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ]
    },
    {
     "n": 70,
     "chave": "mulheres_acesso_oportunidades",
     "tipo": "unica",
     "texto": "As mulheres têm acesso a capacitação, assistência técnica, crédito e outras oportunidades produtivas?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "parcialmente",
       "r": "Parcialmente"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 71,
     "chave": "mulheres_independencia",
     "tipo": "unica",
     "texto": "As mulheres se sentem financeiramente independentes?",
     "opcoes": [
      {
       "v": "sim",
       "r": "Sim"
      },
      {
       "v": "parcialmente",
       "r": "Parcialmente"
      },
      {
       "v": "nao",
       "r": "Não"
      }
     ]
    },
    {
     "n": 72,
     "chave": "mulheres_fortalecer",
     "tipo": "texto_longo",
     "texto": "O que poderia fortalecer a autonomia e a participação das mulheres na comunidade?"
    },
    {
     "n": 73,
     "chave": "grupos_mulheres_falta",
     "tipo": "texto_longo",
     "texto": "O que falta para os grupos de mulheres ficarem mais fortes?"
    },
    {
     "n": 74,
     "chave": "mulheres_necessidades",
     "tipo": "texto_longo",
     "texto": "Quais são as principais necessidades das mulheres da comunidade atualmente?"
    }
   ]
  },
  {
   "id": "futuro",
   "titulo": "Problemas, potencialidades e futuro",
   "perguntas": [
    {
     "n": 75,
     "chave": "comunidade_melhor",
     "tipo": "texto_longo",
     "texto": "O que você considera melhor na comunidade atualmente?"
    },
    {
     "n": 76,
     "chave": "comunidade_problemas",
     "tipo": "texto_longo",
     "texto": "Quais são os principais problemas da comunidade atualmente?"
    },
    {
     "n": 77,
     "chave": "comunidade_potenciais",
     "tipo": "multipla",
     "texto": "Quais são os principais potenciais da comunidade?",
     "opcoes": [
      {
       "v": "agricultura",
       "r": "Agricultura"
      },
      {
       "v": "pecuaria",
       "r": "Pecuária"
      },
      {
       "v": "extrativismo",
       "r": "Extrativismo"
      },
      {
       "v": "turismo",
       "r": "Turismo"
      },
      {
       "v": "produtos_da_sociobiodiversidade",
       "r": "Produtos da sociobiodiversidade"
      },
      {
       "v": "organizacao_comunitaria",
       "r": "Organização comunitária"
      },
      {
       "v": "recursos_naturais",
       "r": "Recursos naturais"
      },
      {
       "v": "cultura_conhecimentos_tradicionais",
       "r": "Cultura/conhecimentos tradicionais"
      },
      {
       "v": "outro",
       "r": "Outro",
       "especificar": true
      }
     ]
    },
    {
     "n": 78,
     "chave": "prioridades",
     "tipo": "texto_longo",
     "texto": "Quais são as principais prioridades para melhorar a qualidade de vida da comunidade?"
    },
    {
     "n": 79,
     "chave": "apoio_projeto",
     "tipo": "texto_longo",
     "texto": "Que tipo de apoio ou projeto seria mais importante para a comunidade atualmente?"
    },
    {
     "n": 80,
     "chave": "futuro_10_anos",
     "tipo": "texto_longo",
     "texto": "Como você imagina a comunidade daqui a 10 anos? O que gostaria que tivesse mudado ou melhorado?"
    },
    {
     "n": 81,
     "chave": "info_adicional",
     "tipo": "texto_longo",
     "texto": "Há alguma informação importante sobre a comunidade que não foi contemplada neste questionário?"
    }
   ]
  }
 ],
 "moradores": {
  "colunas": [
   {
    "chave": "nome",
    "rotulo": "Nome/iniciais",
    "tipo": "texto",
    "destino": "identificacao",
    "opcional": true,
    "max_len": 150
   },
   {
    "chave": "idade",
    "rotulo": "Idade",
    "tipo": "inteiro",
    "min": 0,
    "max": 120
   },
   {
    "chave": "sexo_genero",
    "rotulo": "Sexo/gênero",
    "tipo": "unica",
    "opcoes": [
     {
      "v": "mulher",
      "r": "Mulher"
     },
     {
      "v": "homem",
      "r": "Homem"
     },
     {
      "v": "outro",
      "r": "Outro",
      "especificar": true
     },
     {
      "v": "prefere_nao_responder",
      "r": "Prefere não responder"
     }
    ]
   },
   {
    "chave": "parentesco",
    "rotulo": "Parentesco",
    "tipo": "texto",
    "sugestoes": true,
    "max_len": 80
   },
   {
    "chave": "escolaridade",
    "rotulo": "Escolaridade",
    "tipo": "texto",
    "sugestoes": true,
    "max_len": 80
   },
   {
    "chave": "atividade_principal",
    "rotulo": "Atividade principal",
    "tipo": "texto",
    "sugestoes": true,
    "max_len": 80
   }
  ],
  "primeira_linha": "entrevistado"
 }
}$estrutura$::jsonb,
  $aviso$Bom dia/boa tarde. Sou técnico(a) da SEMA/AC e estou fazendo um diagnóstico socioambiental desta comunidade, dentro de um projeto com o Fundo Brasil-ONU e a UNESCO. As respostas servem para planejar ações do projeto e aparecem apenas em números gerais, sem nomes. Ninguém é obrigado a participar nem a responder todas as perguntas: você pode pular qualquer pergunta ou parar quando quiser. Informar o seu nome é opcional. Posso pedir para fotografar a casa e o entorno, sem pessoas, e a família pode recusar. Os dados ficam com a SEMA e os dados que identificam a família são apagados em até 2 anos após a conferência. Dúvidas ou pedidos sobre seus dados: [canal do Encarregado de Dados da SEMA — A DEFINIR]. Podemos começar?$aviso$,
  'rascunho'
) on conflict (codigo, versao) do nothing;
