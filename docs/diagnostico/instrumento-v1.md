# Diagnóstico Socioambiental — levantamento do instrumento (v1)

> Fonte: `Diagnóstico socioambiental ONU.pdf` (12 páginas), recebido em 26/09/2026.
> Este arquivo é o **inventário** do questionário tal como está no PDF, com a
> tipagem proposta para o app e os pontos que precisam de decisão. Nada aqui é
> código nem migration. O plano da Fase 0 está em [`plano.md`](plano.md).

## Resumo

| Item | Quantidade |
|------|-----------|
| Blocos | 10 |
| Perguntas numeradas | 81 |
| Escolha única (inferida) | 35 |
| Escolha múltipla (inferida) | 21 |
| Texto aberto longo | 17 |
| Número (inteiro/decimal) | 3 (P6, P8, P38) |
| Data | 1 (P1) |
| Texto curto de identificação | 3 (P2, P3, P4) |
| Tabela repetível (moradores) | 1 (P9, 6 colunas) |
| Saltos implícitos identificados | 10 regras |
| Perguntas com "Outro/Outra/Outros" | 30 |

> ⚠️ O PDF **não marca** se a escolha é única ou múltipla, **não tem saltos
> explícitos** e **não tem campo "especifique"** após "Outro". A tipagem abaixo é
> inferida da redação ("principal" → única; "quais são as principais" → múltipla).
> Itens marcados com **❓** precisam ser confirmados pela equipe que elaborou o
> questionário antes de congelar a versão 1.

### Convenções da tabela

- **Chave** — identificador estável proposto para o jsonb de respostas. Nunca usar o
  número da pergunta como chave: numeração muda entre versões, a chave não.
- **Tipo** — `data` · `texto` · `texto_longo` · `inteiro` · `decimal_unid` ·
  `unica` · `multipla` · `tabela` · `catalogo` (lista vinda do banco).
- **Excl.** — opção exclusiva numa múltipla (marcá-la desmarca as outras).
- **Nível** — `D` domicílio/família · `R` percepção do respondente · `C` fato da
  comunidade. Importa para os indicadores (ver plano, §3.6).
- **LGPD** — `P` dado pessoal · `S` dado pessoal **sensível** (art. 5º, II) ·
  `M` pode envolver menor · `L` texto livre que pode citar terceiros.

---

## Bloco 1 — Identificação e perfil (P1–P9)

| Nº | Chave | Pergunta (resumida) | Tipo | Opções / observação | Nível | LGPD |
|----|-------|--------------------|------|---------------------|-------|------|
| 1 | `data_entrevista` | Data da entrevista | data | vira **coluna fixa** `dt_entrevista`; padrão = hoje | — | — |
| 2 | `municipio` | Município | catalogo | vira coluna fixa; 22 municípios do AC | C | — |
| 3 | `comunidade` | Comunidade/localidade | catalogo | vira coluna fixa; catálogo + "nova comunidade" | C | P¹ |
| 4 | `entrevistado_nome` | Nome do entrevistado | texto | **opcional** ✅; se informado, vai para tabela separada restrita (plano §3.3) | — | **P** |
| 5 | `sexo_genero` | Sexo/gênero | unica | Mulher · Homem · Outro · Prefere não responder | R | P |
| 6 | `idade` | Idade | inteiro | 0–120; aviso se < 18 (respondente menor) | R | P, M |
| 7 | `tempo_comunidade` | Há quanto tempo mora na comunidade | unica | <1 · 1–5 · 6–10 · 11–20 · >20 anos · Nasceu na comunidade | R | P |
| 8 | `qtd_moradores` | Quantas pessoas vivem no domicílio | inteiro | 1–30; deve bater com nº de linhas da P9 (aviso, não trava) | D | — |
| 9 | *(tabela `diag_moradores`)* | Quem mora no domicílio | tabela | Nome/iniciais · Idade · Sexo/gênero · Parentesco · Escolaridade · Atividade principal | D | **P, M** |

¹ Comunidade + GPS do domicílio identificam a família em localidade pequena.

**P9 — decisões pendentes**
- Coletar **só iniciais** (o PDF permite "Nome/iniciais"). Recomendado: iniciais, nunca nome.
- **❓ Listas fechadas** para Parentesco, Escolaridade e Atividade principal não
  existem no PDF. Proposta: parentesco (responsável, cônjuge, filho(a), enteado(a),
  neto(a), pai/mãe, sogro(a), irmão(ã), outro parente, não parente);
  escolaridade no padrão IBGE (sem instrução, fundamental incompleto/completo,
  médio incompleto/completo, superior incompleto/completo, não sabe; "não se aplica"
  para < 4 anos); atividade principal alinhada às opções da P28 + estudante,
  do lar, aposentado(a), desempregado(a), criança fora da escola.
- **❓ O entrevistado entra na P9?** Proposta: sim, na 1ª linha, marcado como
  `e_entrevistado` — evita dupla contagem e permite recortar por posição no domicílio.
- **❓ Sexo/gênero na P9** usa as mesmas 4 opções da P5.

## Bloco 2 — Moradia e infraestrutura (P10–P15)

| Nº | Chave | Pergunta | Tipo | Opções | Nível | LGPD |
|----|-------|----------|------|--------|-------|------|
| 10 | `moradia_situacao` | Situação da moradia | unica | Própria · Cedida · Alugada · Outra | D | — |
| 11 | `moradia_parede` | Material principal das paredes | unica | Madeira · Alvenaria · Mista · Outro | D | — |
| 12 | `energia_fonte` | Fonte principal de energia | unica | Rede pública · Gerador · Solar · Outra · Não possui | D | — |
| 13 | `acesso_chuvoso` | Acesso à comunidade no período chuvoso | unica | Bom · Regular · Ruim · Muito ruim · Fica isolada | C | — |
| 14 | `comunicacao_meios` | Meios de comunicação no domicílio | multipla | Celular · Internet · TV · Rádio · Outro · **Nenhum (excl.)** | D | — |
| 15 | `infra_dificuldades` | Dificuldades de infraestrutura da comunidade | multipla | Estradas · Transporte · Energia · Internet/telefonia · Habitação · Iluminação pública · Outro | C | — |

## Bloco 3 — Água, saneamento e resíduos (P16–P21)

| Nº | Chave | Pergunta | Tipo | Opções | Nível | LGPD |
|----|-------|----------|------|--------|-------|------|
| 16 | `agua_fonte` | Fonte principal de água | unica ❓ | Poço · Rio/igarapé · Açude · Nascente · Chuva · Rede pública · Outra | D | — |
| 17 | `agua_tratada` | Água de consumo recebe tratamento? | unica | Sim · Não | D | — |
| 18 | `agua_tratamento` | Qual tratamento | multipla ❓ | Filtração · Cloração · Fervura · Outro · ~~Não se aplica~~ | D | — |
| 19 | `agua_falta` | Há períodos em que falta água? | unica | Sim · Não | D | — |
| 20 | `esgoto_destino` | Destino principal do esgoto | unica | Fossa · Céu aberto · Rio/igarapé · Sistema coletivo · Outro | D | — |
| 21 | `lixo_destino` | Destino do lixo | multipla ❓ | Coleta pública · Queimado · Enterrado · Céu aberto · Reciclado/reaproveitado · Outro | D | — |

- **Salto:** P17 = Não → pula P18. Com o salto, a opção "Não se aplica" da P18 fica
  redundante; proposta: removê-la (o salto registra a não aplicação).
- **❓ P16** — muita família usa mais de uma fonte (poço no verão, chuva no inverno).
  Manter "principal" (única) é mais simples para indicador; confirmar.
- **❓ P21** — queimar e enterrar costumam coexistir; proposta: múltipla.
- **❓ Sugestão de melhoria** — P19 poderia ter "em quais meses" (ligação com P49/P50).

## Bloco 4 — Saúde e educação (P22–P27)

| Nº | Chave | Pergunta | Tipo | Opções | Nível | LGPD |
|----|-------|----------|------|--------|-------|------|
| 22 | `saude_onde` | Onde procura atendimento de saúde, principalmente | unica | Unidade de saúde · Hospital · Particular · Farmácia · Medicina tradicional/caseira · Outro | D | — |
| 23 | `saude_dificuldade` | Principal dificuldade de acesso à saúde | unica | Distância · Transporte · Custo · Falta de atendimento · Tempo de espera · Não há dificuldade · Outro | D | — |
| 24 | `saude_problemas_freq` | Problemas de saúde frequentes na comunidade? | unica | Sim · Não | C | — |
| 25 | `saude_problemas_quais` | Quais são esses problemas | texto_longo | — | C | **S?, L** |
| 26 | `tem_escolar` | Há crianças/jovens em idade escolar no domicílio? | unica | Sim · Não | D | M |
| 27 | `educacao_dificuldades` | Dificuldades de educação na comunidade | multipla | Distância · Transporte · Falta de escola · Falta de professores · Falta de internet/material · Outra · **Nenhuma (excl.)** | C | — |

- **Salto:** P24 = Não → pula P25.
- **P25 é o ponto mais delicado do bloco:** a pergunta é sobre a comunidade, mas
  resposta aberta tende a virar "o filho do vizinho tem…". Dado de saúde ligado a
  pessoa identificável é **sensível**. Proposta: orientação no próprio campo
  ("descreva problemas da comunidade, sem citar nomes") + lista de sugestões
  (diarreia, malária, dengue, doenças respiratórias, verminose…) em vez de texto
  puro. ❓ Transformar P25 em múltipla com "Outro" resolve a maior parte.
- **❓ P26 não controla P27** (P27 é da comunidade). P26 pode ser **derivada** da
  P9 (morador de 4–17 anos) em vez de perguntada — evita contradição.

## Bloco 5 — Trabalho, renda e produção (P28–P37)

| Nº | Chave | Pergunta | Tipo | Opções | Nível | LGPD |
|----|-------|----------|------|--------|-------|------|
| 28 | `renda_fontes` | Fontes de renda da família | multipla | Agricultura · Pecuária · Extrativismo · Pesca · Assalariado · Comércio · Benefícios sociais · Aposentadoria/pensão · Prestação de serviços · Outra | D | P² |
| 29 | `renda_suficiente` | Renda suficiente para necessidades básicas? | unica | Sim · Parcialmente · Não | D | P² |
| 30 | `producao_atividades` | Atividades produtivas da família | multipla | Agricultura · Criação de animais · Pesca · Extrativismo · Artesanato · Comércio · Prestação de serviços · Outra | D | — |
| 31 | `producao_produtos` | Principais produtos produzidos | texto_longo | ❓ lista de sugestões (mandioca/farinha, banana, açaí, castanha…) | D | — |
| 32 | `producao_destino` | Produção destinada a | unica | Consumo próprio · Venda · Ambos | D | — |
| 33 | `comercializa_onde` | Onde comercializa | multipla | Na comunidade · Feira · Mercado local · Intermediário · Cooperativa/associação · Outro · **Não comercializa (excl.)** | D | — |
| 34 | `producao_dificuldades` | Dificuldades para produzir | multipla | Recursos financeiros · ATER · Transporte · Mercado · Mão de obra · Insumos · Clima · Acesso à terra · Outra | D | — |
| 35 | `acesso_credito` | Acesso a crédito/financiamento? | unica | Sim · Não | D | — |
| 36 | `recebe_ater` | Recebe/recebeu assistência técnica? | unica | Sim · Não | D | — |
| 37 | `producao_desejo` | Atividades que gostaria de desenvolver/ampliar | texto_longo | — | R | — |

² O instrumento **não pergunta valor de renda nem CPF** — só fonte e percepção de
suficiência. Isso é bom para minimização; ver plano §2.1.

- **Salto:** P32 = Consumo próprio → pula P33.
- **❓ P30 não tem "Nenhuma".** Família que vive só de benefício/aposentadoria não
  tem como responder P30–P34. Proposta: incluir "Nenhuma (excl.)" na P30 e saltar
  P31–P34 quando marcada.

## Bloco 6 — Uso da terra e recursos naturais (P38–P45)

| Nº | Chave | Pergunta | Tipo | Opções | Nível | LGPD |
|----|-------|----------|------|--------|-------|------|
| 38 | `area_tamanho` | Tamanho aproximado da área usada | decimal_unid ❓ | valor + unidade (ha · tarefa · colônia · m² · não sabe) | D | — |
| 39 | `area_uso` | Como a área é usada | multipla | Floresta · Capoeira · Agricultura · Pastagem · SAF · Infraestrutura/moradia · Outros | D | — |
| 40 | `usa_recursos_naturais` | Usa produtos da floresta/recursos naturais? | unica | Sim · Não | D | — |
| 41 | `recursos_coletados` | Quais produtos usa/coleta | multipla | Frutos · Castanhas · Óleos/sementes · Madeira · Plantas medicinais · Cipós/fibras · Caça · Pesca · Outros | D | — |
| 42 | `recursos_destino` | Destinados a | unica | Consumo · Venda · Ambos | D | — |
| 43 | `recursos_importantes` | Recursos naturais mais importantes para a comunidade | texto_longo | — | C | — |
| 44 | `recursos_mudanca` | Disponibilidade mudou nos últimos anos? | unica | Aumentou · Diminuiu · Não mudou · Não sabe | R | — |
| 45 | `recursos_mudanca_causas` | Causas dessas mudanças | multipla | Desmatamento · Mudanças climáticas · Queimadas · Exploração excessiva · Poluição · Mudança no uso da terra · Outra · **Não sabe (excl.)** | R | — |

- **Saltos:** P40 = Não → pula P41 e P42. P44 ∈ {Não mudou, Não sabe} → pula P45.
- **❓ P38 não tem unidade** no PDF. Sem unidade o número é inutilizável para
  indicador. Proposta: valor + unidade, com conversão para hectare **no banco**
  (uma função, um lugar). Confirmar quais unidades locais usar e o fator de
  conversão de "tarefa"/"colônia" na região.
- **❓ P41 "Caça"** — atividade com implicação legal; a resposta é autodeclaração
  de conduta potencialmente ilícita. Não é "sensível" pela LGPD, mas é dado que
  **não deve sair identificado** da plataforma. Tratado no plano §2.3.

## Bloco 7 — Diagnóstico ambiental (P46–P53)

| Nº | Chave | Pergunta | Tipo | Opções | Nível | LGPD |
|----|-------|----------|------|--------|-------|------|
| 46 | `amb_problemas` | Principais problemas ambientais da comunidade | multipla | Desmatamento · Queimadas · Poluição da água · Falta de água · Erosão · Assoreamento · Perda de biodiversidade · Resíduos/lixo · Agrotóxicos · Pesca predatória · Caça predatória · Outro | C | — |
| 47 | `agua_qualidade_problema` | Problemas de qualidade da água? | unica | Sim · Não | C | — |
| 48 | `agua_qualidade_quais` | Quais problemas | texto_longo | — | C | L |
| 49 | `clima_eventos_afeta` | Problemas com seca, enchente, eventos climáticos? | unica | Sim · Não | C | — |
| 50 | `clima_eventos_quais` | Eventos de maior impacto | multipla ❓ | Seca · Enchente · Chuvas intensas · Calor excessivo · Ventos/tempestades · Outro | C | — |
| 51 | `clima_atividades_afetadas` | Atividades afetadas | multipla | Agricultura · Criação · Pesca · Extrativismo · Transporte · Saúde · Abastecimento de água · Outra | C | — |
| 52 | `amb_percepcao_mudanca` | O ambiente mudou nos últimos anos? | unica | Melhorou · Piorou · Não mudou · Não sabe | R | — |
| 53 | `amb_o_que_fazer` | O que fazer para melhorar as condições ambientais | texto_longo | — | R | L |

- **Saltos:** P47 = Não → pula P48. P49 = Não → pula P50 e P51.
- **❓ P50** "quais eventos causam **mais** impacto" pode ser única ou múltipla
  (ou múltipla limitada a 2). Proposta: múltipla.

## Bloco 8 — Organização social e participação (P54–P59)

| Nº | Chave | Pergunta | Tipo | Opções | Nível | LGPD |
|----|-------|----------|------|--------|-------|------|
| 54 | `participa_org` | Participa de associação, cooperativa, **sindicato**, grupo…? | unica | Sim · Não | R | **S** |
| 55 | `participa_org_quais` | De quais organizações participa | texto_longo | — | R | **S, L** |
| 56 | `decisoes_como` | Como são tomadas as decisões da comunidade | unica ❓ | Reuniões comunitárias · Associação/liderança · Famílias individualmente · Lideranças formais · Outro | C | — |
| 57 | `moradores_participam` | Moradores participam das decisões? | unica | Sim · Parcialmente · Não | R | — |
| 58 | `grupos_participam_menos` | Grupos que participam menos | multipla | Mulheres · Jovens · Idosos · PcD · Comunidades tradicionais · Outros · **Não percebe diferença (excl.)** | R | — |
| 59 | `instituicoes_contribuem` | Organizações/instituições que mais contribuem | texto_longo | — | C | L |

- **Salto:** P54 = Não → pula P55.
- **⚠️ P54/P55 coletam filiação a sindicato** — dado **sensível** pelo art. 5º, II
  ("filiação a sindicato ou a organização de caráter religioso, filosófico ou
  político"). Texto aberto na P55 pode também revelar filiação religiosa ou
  partidária. Proposta de desenho no plano §2.2: trocar a P55 por **múltipla
  fechada por tipo** (associação de moradores/produtores · cooperativa · sindicato
  rural · grupo de mulheres · grupo de jovens · igreja/grupo religioso · conselho
  gestor/comitê · outra), sem nome da entidade — preserva o indicador
  (participação por tipo) e reduz o risco.

## Bloco 9 — Gênero e participação das mulheres (P60–P74)

| Nº | Chave | Pergunta | Tipo | Opções | Nível | LGPD |
|----|-------|----------|------|--------|-------|------|
| 60 | `genero_oportunidades_iguais` | Homens e mulheres têm as mesmas oportunidades? | unica | Sim · Parcialmente · Não | R | — |
| 61 | `atividades_mulheres` | Atividades realizadas pelas mulheres **da família** | multipla | Doméstico · Cuidado com crianças · Agricultura · Criação · Extrativismo · Pesca · Comércio · Artesanato · Assalariado · Gestão da propriedade · Outras | D | — |
| 62 | `atividades_homens` | Atividades realizadas pelos homens | multipla | Agricultura · Criação · Extrativismo · Pesca · Comércio · Assalariado · Gestão da propriedade · Doméstico · Outras | D | — |
| 63 | `decisao_dinheiro` | Quem decide sobre o uso do dinheiro | unica | Principalmente mulheres · Principalmente homens · Ambos · Depende da decisão | D | P |
| 64 | `decisao_producao` | Quem decide produção/comercialização | unica | Principalmente mulheres · Principalmente homens · Ambos · Depende da atividade | D | P |
| 65 | `mulheres_renda_propria` | Mulheres da comunidade têm renda própria? | unica | Sim, a maioria · Algumas · Poucas · Não | C | — |
| 66 | `mulheres_participam` | Mulheres participam das organizações/decisões? | unica | Frequentemente · Às vezes · Raramente · Não participam | C | — |
| 67 | `grupo_mulheres_existe` | Existem grupos de mulheres na comunidade? | unica | Sim · Não | C | — |
| 68 | `grupo_mulheres_atividades` | Atividades desses grupos | multipla | Produção · Artesanato · Comercialização · Capacitação · Organização comunitária · Apoio social · Outras · ~~Não se aplica~~ | C | — |
| 69 | `mulheres_dificuldades` | O que dificulta a participação das mulheres | multipla | Falta de tempo · Doméstico/cuidado · Recursos · Transporte · Oportunidades · Preconceito/discriminação · Falta de interesse · Outro · **Não existem dificuldades (excl.)** | R | — |
| 70 | `mulheres_acesso_oportunidades` | Acesso a capacitação, ATER, crédito | unica | Sim · Parcialmente · Não | C | — |
| 71 | `mulheres_independencia` | Mulheres se sentem financeiramente independentes? | unica | Sim · Parcialmente · Não | R | — |
| 72 | `mulheres_fortalecer` | O que fortaleceria a autonomia das mulheres | texto_longo | — | R | L |
| 73 | `grupos_mulheres_falta` | O que falta para os grupos de mulheres | texto_longo | — | R | L |
| 74 | `mulheres_necessidades` | Principais necessidades das mulheres | texto_longo | — | R | L |

- **Salto:** P67 = Não → pula P68 ("Não se aplica" vira redundante — remover).
- **❓ Assimetria P61 × P62:** P61 fala "da família" e tem "Cuidado com crianças";
  P62 não diz "da família" e **não tem** "Cuidado com crianças". Para um
  indicador de divisão sexual do trabalho as duas listas precisam ser
  **idênticas**. Proposta: mesma lista e mesmo recorte ("da família") nas duas.
- **❓ Domicílio sem mulher / sem homem:** P61–P64 não têm saída. Proposta: o app
  deriva da P9 e oferece "Não há mulheres/homens no domicílio".
- **❓ Quem responde o bloco 9:** percepção muda muito conforme o respondente.
  Recomendação metodológica: registrar o sexo do respondente (já está na P5) e
  **sempre desagregar** os indicadores do bloco por ele. Opcional: o bloco ser
  respondido preferencialmente por uma mulher do domicílio — decisão da equipe.
- **Privacidade da entrevista:** P63/P64/P69 podem expor conflito doméstico se
  respondidas na frente de outros moradores. Incluir no roteiro do entrevistador
  a orientação de aplicar o bloco 9 em privado, quando possível.

## Bloco 10 — Problemas, potencialidades e futuro (P75–P81)

| Nº | Chave | Pergunta | Tipo | Opções | Nível | LGPD |
|----|-------|----------|------|--------|-------|------|
| 75 | `comunidade_melhor` | O que é melhor na comunidade | texto_longo | — | R | L |
| 76 | `comunidade_problemas` | Principais problemas da comunidade | texto_longo | — | R | L |
| 77 | `comunidade_potenciais` | Principais potenciais | multipla | Agricultura · Pecuária · Extrativismo · Turismo · Sociobiodiversidade · Organização comunitária · Recursos naturais · Cultura/conhecimentos tradicionais · Outro | R | — |
| 78 | `prioridades` | Prioridades para a qualidade de vida | texto_longo | — | R | L |
| 79 | `apoio_projeto` | Apoio/projeto mais importante | texto_longo | — | R | L |
| 80 | `futuro_10_anos` | Como imagina a comunidade em 10 anos | texto_longo | — | R | L |
| 81 | `info_adicional` | Informação importante não contemplada | texto_longo | — | R | L |

---

## Pontos transversais do instrumento

1. **"Outro" sem especificação (30 perguntas).** Sem o texto, "Outro" não é
   analisável. Proposta: toda opção "Outro/Outra/Outros" abre campo curto
   `<chave>_outro` (até 120 caracteres), gravado no mesmo jsonb.
2. **Não resposta.** O PDF só tem "Prefere não responder" na P5. Sem um código
   de não resposta, pergunta em branco fica ambígua (pulou por salto? esqueceu?
   recusou?). Proposta: toda pergunta aceita "Não respondeu" (botão discreto,
   não é uma opção da lista), gravado como valor especial. **Exceção: P4**
   (nome), que é opcional — em branco é resposta válida. Assim o app pode
   exigir que toda pergunta **aplicável** tenha resposta ou "Não respondeu" —
   controle de qualidade sem obrigar o entrevistado a responder.
3. **Três níveis de análise misturados** (domicílio, percepção individual e fato
   da comunidade). Perguntas de nível `C` são respondidas por cada domicílio,
   então haverá N respostas por comunidade — o indicador delas é "% dos
   entrevistados que relatam X", não "a comunidade tem X". Ver plano §3.6.
4. **17 perguntas abertas.** Encarecem a análise (precisam de codificação
   posterior) e são onde dado de terceiros vaza. Considerar fechar P25, P31, P55
   com listas + "Outro"; manter abertas as do bloco 10 (são o valor qualitativo
   do diagnóstico).
5. **Duração estimada.** 81 perguntas + tabela de moradores ≈ 45–70 min por
   domicílio. Recomenda-se piloto com 5 questionários antes de congelar a v1.
6. **Título — ✅ decidido:** **Diagnóstico Socioambiental** (o mesmo do PDF) em
   tela, ROPA e relatórios; `diagnostico` como id do módulo no código.

## Saltos (regras de exibição) — consolidado

| # | Condição | Efeito |
|---|----------|--------|
| S1 | P17 = Não | oculta P18 |
| S2 | P24 = Não | oculta P25 |
| S3 | P32 = Consumo próprio | oculta P33 |
| S4 | P40 = Não | oculta P41, P42 |
| S5 | P44 ∈ {Não mudou, Não sabe} | oculta P45 |
| S6 | P47 = Não | oculta P48 |
| S7 | P49 = Não | oculta P50, P51 |
| S8 | P54 = Não | oculta P55 |
| S9 | P67 = Não | oculta P68 |
| S10 ❓ | P30 = Nenhuma (opção a criar) | oculta P31–P34 |
| D1 ❓ | P9 sem morador de 4–17 anos | P26 = Não (derivada) |
| D2 ❓ | P9 sem mulher / sem homem | P61/P62 oferecem "não há" |
| V1 | P8 ≠ nº de linhas da P9 | aviso na revisão (não trava) |
| V2 | P6 < 18 | aviso: respondente menor de idade |

Todas as regras cabem numa linguagem mínima: `{"se": "<chave>", "op": "=" | "in" | "contem", "valor": …}`.
Regras que dependem da tabela de moradores (D1, D2) são **derivações**, não saltos, e
devem ser calculadas pela mesma função que produz o indicador (plano §3.6).
