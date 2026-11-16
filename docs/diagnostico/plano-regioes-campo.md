# Diagnóstico Socioambiental — setores de campo, designação e dispersão da amostra

Entregue em 15/11/2026 (migrações `20261122_diag_21_setores_campo`, `_22_setores_sao_francisco`,
`_23_campo_recusa` e o `20261122_diag_sino_area_sql_editor.sql` (sino)); meta no painel e Lago do
Amapá (`_24`, `_25`) em 16/11; mapa das casas (`20261123_diag_26_mapa_casas`) em 16/11.

## O pedido

A equipe de campo trabalha com **número de entrevistas designado** e **região definida por GPS**:
o entrevistador A tem 20 entrevistas no setor 1 e não entrevista em outro setor sem autorização do
painel de gestão; o app avisa quando ele sai da área. As entrevistas precisam ficar **espalhadas**
pelo setor — cadastro concentrado num ponto deixa a amostra falha.

## Decisões (15/11/2026)

| Pergunta | Decisão |
|---|---|
| Numeração | Número por designação: 1 … meta. O app propõe o próximo livre; o servidor tem a última palavra (dois aparelhos) |
| Ponto que vale | Início **e** fim da entrevista — vale a pior das duas leituras |
| Fora da área | O app **não deixa começar**; oferece "Pedir autorização" (vai à coordenação, funciona sem internet) |
| Trajeto | **Não sai do aparelho**. O servidor recebe só a posição de início e fim de cada ficha e a do pedido |
| Divisa | Tolerância de 50 m + a precisão do GPS (até 100 m): "na divisa" não é penalizado |
| Sem GPS | Começa com justificativa; a ficha vai marcada para a mesa |
| Dispersão | Setor dividido em quadrículas de √(área ÷ meta); acima de 2 entrevistas por quadrícula o app pede justificativa |
| Recusa | Registrada, mas não gasta número nem conta na quadrícula |

## Modelo

- `diag_setores` — polígono do shapefile (GeoJSON, SIRGAS 2000) de cada setor de uma APA
  (`diag_comunidades`), meta sugerida, quadrícula (`celula_m`), limite por quadrícula, tolerância.
  Carga **só** por `scripts/diag_setores.py` → `fn_diag_setor_carregar` (sem EXECUTE para cliente).
  Recarregar troca o desenho e mantém os parâmetros ajustados na mesa.
- `diag_designacoes` — entrevistador × setor × meta × período. `tipo = 'autorizacao'` é a exceção
  fora da área (prazo e justificativa obrigatórios), nascida do pedido aprovado.
- `diag_area_pedidos` — pedido do entrevistador (idempotente por `uuid_cliente`; posição com 4 casas).
- `diag_fichas_campo` — o que o servidor apurou de cada ficha: setor, número, situação
  (`dentro | borda | impreciso | sem_gps | fora | sem_designacao`), quadrícula, concentração,
  justificativas. **À parte de `diag_fichas`**, porque o consultor externo lê `diag_fichas` e a
  quadrícula estreita o local da casa.
- `diag_fichas_campo_gps` — posição de início e fim: identificação (mesma leitura de
  `diag_fichas_identificacao`), zerada pela retenção de 2 anos.

Escrita só por RPC: `diag_designar`, `diag_designacao_alterar`, `diag_designacao_encerrar`,
`diag_setor_ajustar`, `diag_area_pedir`, `diag_area_decidir`; apuração por
`fn_diag_campo_registrar`, chamada dentro de `diag_enviar_ficha`. Leitura: `diag_campo_pacote`
(app, offline), `diag_campo_painel` e `diag_ficha_campo` (mesa).

**O servidor classifica, não recusa**: a ficha pode ter sido feita sem internet dias antes. A trava
fica no app (não começa fora) e na validação (`diag_mudar_status` exige justificativa para fora,
sem GPS, sem designação, acima da meta ou concentração — `diag:justificar_campo`).

## Regra geométrica em dois lugares

Sem PostGIS no projeto: `fn_diag_geo_dentro`, `fn_diag_geo_dist_borda`, `fn_diag_area_classificar`,
`fn_diag_area_pior`, `fn_diag_area_celula` (SQL) e `js/diag-area.js` (app e mesa) fazem a mesma
conta. Teste cruzado com os 5 setores reais: `supabase/tests/diagnostico/area_cruzada.js`.

## Telas

- **App de campo** (`js/diag-campo.js`): quadro "Minhas áreas" no início (andamento e dentro/fora
  agora), caixa da área na "Nova entrevista" (setor, número, fora, sem GPS, trecho cheio, pedido),
  faixa na ficha (vira alerta e vibra ao sair). GPS contínuo só com o app aberto e à vista.
- **Mesa**, aba **Equipe de campo** (`js/diagnostico-campo.js`, coordenação/super_admin): números,
  pedidos, mapa dos setores (modo **Casas** ou **Quadrículas**, ver abaixo), setores,
  designações e fichas com problema de campo. Validação: quadro "Área de campo" na ficha.

## Mapa das casas (diag_26, 16/11/2026)

Muda a decisão de 15/11 de que a mesa só via quadrículas. Pedido do coordenador: o entrevistador
precisa ver onde já houve entrevista (para não bater duas vezes na mesma porta) e onde ele está; a
mesa precisa ver onde cada entrevista foi feita.

- **O ponto** é a posição do INÍCIO da entrevista (na falta, a do fim), que já era gravada em
  `diag_fichas_campo_gps`. Nada novo é coletado; o trajeto continua no aparelho.
- **App** — tela "Mapa da minha área" (`js/diag-mapa.js`, aberta por "Ver no mapa" em Minhas áreas e na
  Nova entrevista): setores da APA (os da pessoa em destaque), "você aqui" com o círculo da precisão,
  as casas do setor (`fn_diag_campo_casas` no pacote) e as fichas deste aparelho ainda não enviadas.
  Das casas dos **colegas** só vêm ponto, data e se foi recusa — sem número, código, nome nem resposta.
  Recusa = ponto vazado. A menos de 30 m de uma casa já entrevistada aparece "Possível casa já visitada
  aqui" (no mapa e na Nova entrevista) — só aviso, não trava.
- **Mapa leve próprio** (`js/diag-mapa.js`, sem biblioteca): desenho em SVG que funciona sem internet;
  com sinal, o satélite Esri por baixo (não é guardado — levar o satélite para usar sem sinal é a
  próxima etapa).
- **Mesa** — modo **Casas** (padrão): um ponto por entrevista, cor por entrevistador, recusa vazada,
  filtro por entrevistador, clique mostra número, data, setor, situação e precisão e abre a ficha
  (`fn_diag_campo_casas_mesa`, dentro de `diag_campo_painel`, só gerir). O enquadramento inclui os
  pontos fora dos setores. Modo **Quadrículas**: o de antes.
- Consultor externo continua sem ponto nenhum; treino fica fora; depois da retenção o ponto some.
  ROPA TRAT-001 atualizado.

## APA São Francisco — setores carregados

| Setor | Tipo | Meta | Área | Quadrícula |
|---|---|---|---|---|
| SF1 · Oeste | rural | 20 | 5.248,6 ha | 1.620 m |
| SF2 · Sul (AC-090) | rural | 20 | 4.784,2 ha | 1.550 m |
| SF3 · Centro | rural | 20 | 16.087,6 ha | 2.840 m |
| SF4 · Leste | urbano | 20 | 3.706,2 ha | 1.360 m |
| SF5 · Corredor urbano | urbano | 20 | 378,7 ha | 440 m |

Shapefile conferido: SIRGAS 2000, 5 polígonos válidos, sem sobreposição, área calculada × `AREA_HA`
do arquivo com diferença < 0,1%. APOIO, ACESSO e REFERENC do arquivo aparecem na mesa.

## APA Lago do Amapá — setores carregados (diag_25)

| Setor | Tipo | Meta | Área | Quadrícula |
|---|---|---|---|---|
| LA1 · Oeste | rural | 20 | 1.376,4 ha | 830 m |
| LA2 · Norte (BR-364) | rural | 40 | 1.813,3 ha | 670 m |
| LA3 · Lago e Centro-Sul | rural | 25 | 1.191,6 ha | 690 m |
| LA4 · Sul | rural | 15 | 789,8 ha | 730 m |

Os vizinhos se tocam em sobras de digitalização de 119 a 570 m² (listadas na migração). O conversor
tolera sobra abaixo de 0,5 ha e de 0,1% do menor setor, e recusa o que passar disso.

## Meta e designação no painel (diag_24, 16/11/2026)

- A META do shapefile é só o ponto de partida. A coordenação muda a meta do setor em **Equipe de campo → Ajustar**
  (`diag_setor_meta`, motivo obrigatório, quem/quando/por quê gravados e no `audit_log`). Recarregar o shape não
  desfaz a meta ajustada.
- Uma pessoa pode ter **vários setores**, inclusive de APAs diferentes: a janela "Designar entrevistador" marca um
  ou mais setores com o nº de entrevistas de cada um. A regra é uma designação ativa por setor × pessoa; setor que
  a pessoa já tem fica travado (muda-se a meta em "Alterar"). No app, cada entrevista vai para o setor onde a
  pessoa está, com numeração separada por setor.

## Quem é entrevistador (diag_27, 16/11/2026)

A caixa "Diagnóstico Socioambiental" em Usuários misturava ver os dados com entrevistar. Agora:

| Acesso (Usuários → Acessos) | Para quê | Quem concede |
|---|---|---|
| **Diagnóstico Socioambiental** | ver os dados (coordenação já tem pelo perfil; técnico vê números; consultor lê fichas sem identificação) | super_admin |
| **Diagnóstico — entrevistador (app de campo)** | entrevistar no app, contar na meta e aparecer em "Designar entrevistador"; não dá a mesa | **só o super_admin** (trava no banco) |
| **Diagnóstico — modo treino** | fichas TRE- de treino | super_admin |

Qualquer perfil pode ser entrevistador, inclusive coordenação; quem fez a entrevista não valida, devolve
nem descarta a própria ficha.

## Outra APA

```bash
python3 -I scripts/diag_setores.py <arquivo.shp> --sigla LA --comunidade "APA Lago do Amapá" --ibge 1200401 > supabase/migrations/AAAAMMDD_diag_NN_setores_lago_amapa.sql
```

O shapefile precisa de `.shp/.shx/.dbf/.prj` (geográfico SIRGAS/WGS 84) e das colunas `SETOR`
("1 · Nome") e `META`; `AREA_HA`, `TIPO`, `APOIO`, `ACESSO`, `REFERENC` são opcionais.
A comunidade precisa estar cadastrada antes (aba Admin).

## Pendente

- Colar `supabase/migrations/20261122_diag_sino_area_sql_editor.sql` no SQL Editor para o aviso no sino.
- Guia de treinamento do app ("Aprender") e Manual: ainda sem passo da área designada nem do mapa.
- Satélite sem internet: baixar as imagens da área antes de sair a campo.
- Exportação (`diag_exportar`) ainda não traz setor/número/situação de campo.
