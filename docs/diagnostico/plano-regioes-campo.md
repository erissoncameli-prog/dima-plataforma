# Diagnóstico Socioambiental — setores de campo, designação e dispersão da amostra

Entregue em 15/11/2026 (migrações `20261122_diag_21_setores_campo`, `_22_setores_sao_francisco`,
`_23_campo_recusa` e o `20261122_diag_sino_area_sql_editor.sql` (sino)).

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
  pedidos, mapa SVG dos setores com as quadrículas ocupadas (nunca o ponto da casa), setores,
  designações e fichas com problema de campo. Validação: quadro "Área de campo" na ficha.

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

## Outra APA

```bash
python3 -I scripts/diag_setores.py <arquivo.shp> --sigla LA --comunidade "APA Lago do Amapá" --ibge 1200401 > supabase/migrations/AAAAMMDD_diag_NN_setores_lago_amapa.sql
```

O shapefile precisa de `.shp/.shx/.dbf/.prj` (geográfico SIRGAS/WGS 84) e das colunas `SETOR`
("1 · Nome") e `META`; `AREA_HA`, `TIPO`, `APOIO`, `ACESSO`, `REFERENC` são opcionais.
A comunidade precisa estar cadastrada antes (aba Admin).

## Pendente

- Colar `supabase/migrations/20261122_diag_sino_area_sql_editor.sql` no SQL Editor para o aviso no sino.
- Guia de treinamento do app ("Aprender") e Manual: ainda sem passo da área designada.
- Exportação (`diag_exportar`) ainda não traz setor/número/situação de campo.
