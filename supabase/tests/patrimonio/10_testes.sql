-- Testes do Patrimônio · Fase 1 (cadastro, valor, depreciação, incorporação)
-- Usuários do stub: a1 admin · c1 coordenação · d1 gestor (técnico + patrimonio_gestor) · b1 técnico
--                   f1 financeiro · a2 visualizador · e1 consultor externo
\set ON_ERROR_STOP 1

create or replace function pg_temp.como(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', case when p_uid = '' then '' else '00000000-0000-0000-0000-0000000000' || p_uid end, false);
end $$;

create or replace function pg_temp.deve_falhar(p_sql text, p_trecho text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_trecho in sqlerrm) = 0 then
      raise exception 'esperava erro com "%", veio: %', p_trecho, sqlerrm;
    end if;
    return;
  end;
  raise exception 'esperava erro com "%", mas passou: %', p_trecho, p_sql;
end $$;

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FALHOU: %', p_msg; end if;
end $$;

-- ── 1. Depreciação ──────────────────────────────────────────────────────────
do $$
declare r record;
begin
  -- início de uso 27/10/2026 ⇒ deprecia a partir de nov/2026; cota só com o mês completo
  select * into r from fn_pat_depreciacao(1000, 10, 60, '2026-10-27', '2026-11-29');
  perform pg_temp.ok(r.meses = 0 and r.depreciacao_acumulada = 0 and r.valor_contabil = 1000, 'mês incompleto não deprecia');
  select * into r from fn_pat_depreciacao(1000, 10, 60, '2026-10-27', '2026-11-30');
  perform pg_temp.ok(r.meses = 1 and r.cota_mensal = 15 and r.depreciacao_acumulada = 15 and r.valor_contabil = 985, '1º mês: ' || r::text);
  select * into r from fn_pat_depreciacao(1000, 10, 60, '2026-10-27', '2040-01-01');
  perform pg_temp.ok(r.meses = 60 and r.depreciacao_acumulada = 900 and r.valor_contabil = 100 and r.valor_residual = 100, 'para no residual');
  select * into r from fn_pat_depreciacao(1000, 10, 60, '2026-10-27', '2030-01-01', '2027-03-15');
  perform pg_temp.ok(r.meses = 4, 'para no mês da baixa: ' || r.meses);
  select * into r from fn_pat_depreciacao(1000, 10, 60, null, '2030-01-01');
  perform pg_temp.ok(r.meses = 0 and r.valor_contabil = 1000, 'sem início de uso não deprecia');
  select * into r from fn_pat_depreciacao(1000, 0, 7, '2026-01-10', '2026-04-30');
  perform pg_temp.ok(r.meses = 3 and r.depreciacao_acumulada = 428.57, 'proporção sem acumular arredondamento: ' || r::text);
  select * into r from fn_pat_depreciacao(1000, 0, 7, '2026-01-10', '2026-08-31');
  perform pg_temp.ok(r.meses = 7 and r.depreciacao_acumulada = 1000 and r.valor_contabil = 0, 'última cota fecha o centavo');
end $$;

-- ── 2. Carga: tarefa do produto de equipamentos já pago; nada para consumo ──
do $$
begin
  perform pg_temp.ok((select count(*) from tarefas where entidade_tipo = 'pat_incorporacao'
                        and entidade_id = '00000000-0000-0000-0000-0000000b0001' and status = 'a_fazer') = 1, 'tarefa do som criada');
  perform pg_temp.ok((select count(*) from tarefas where entidade_id = '00000000-0000-0000-0000-0000000b0002') = 0, 'coffee break sem tarefa');
  perform pg_temp.ok((select usuario_id from tarefa_participantes tp join tarefas t on t.id = tp.tarefa_id
                        where t.entidade_id = '00000000-0000-0000-0000-0000000b0001') = '00000000-0000-0000-0000-0000000000d1',
                     'tarefa vai para o gestor patrimonial');
  perform pg_temp.ok((select count(*) from notificacoes where tipo = 'tarefa_atribuida') = 1, 'sino do gestor');
  perform pg_temp.ok(exists (select 1 from tarefa_tdrs), 'tarefa ligada ao TDR');
  perform pg_temp.ok(exists (select 1 from lgpd_tratamentos where codigo = 'TRAT-006'), 'ROPA');
  perform pg_temp.ok(exists (select 1 from storage.buckets where id = 'patrimonio-docs' and not public), 'bucket privado');
end $$;

-- ── 3. Permissões de execução ───────────────────────────────────────────────
do $$
begin
  perform pg_temp.ok(not has_function_privilege('anon', 'public.fn_pat_incorporar(jsonb)', 'execute'), 'anon não incorpora');
  perform pg_temp.ok(not has_function_privilege('anon', 'public.fn_pat_pode_ver()', 'execute'), 'anon sem predicado');
  perform pg_temp.ok(has_function_privilege('authenticated', 'public.fn_pat_incorporar(jsonb)', 'execute'), 'logado chama a RPC');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'public.fn_pat_tarefa_incorporar(uuid)', 'execute'), 'interna fechada');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'public.fn_pat_arquivo_existe(text,text)', 'execute'), 'interna fechada 2');
  perform pg_temp.ok(not has_table_privilege('authenticated', 'public.pat_bens', 'insert'), 'sem insert direto');
  perform pg_temp.ok(not has_table_privilege('authenticated', 'public.pat_eventos', 'update'), 'sem update direto');
  perform pg_temp.ok(not has_table_privilege('anon', 'public.vw_pat_bens', 'select'), 'anon sem view');
end $$;

-- ── 4. Incorporação pelo contrato ───────────────────────────────────────────
select pg_temp.como('b1');
select pg_temp.deve_falhar($q$ select fn_pat_incorporar('{"id":"00000000-0000-0000-0000-00000000aa01","origem":"compra_projeto",
  "contrato_produto_id":"00000000-0000-0000-0000-0000000b0001","dt_aquisicao":"2026-10-20","local_id":"00000000-0000-0000-0000-000000000000","itens":[]}'::jsonb) $q$,
  'PAT_SEM_PERMISSAO');
select pg_temp.ok((select count(*) from fn_pat_a_incorporar()) = 0, 'técnico não vê a fila');

select pg_temp.como('d1');
select pg_temp.ok((select count(*) from fn_pat_a_incorporar()) = 1, 'gestor vê o som na fila');
select pg_temp.ok((select restante from fn_pat_a_incorporar()) = 20714.50, 'restante = produto inteiro');

-- série obrigatória (áudio e vídeo)
select pg_temp.deve_falhar(format($q$ select fn_pat_incorporar(jsonb_build_object('id','00000000-0000-0000-0000-00000000aa01',
  'origem','compra_projeto','contrato_produto_id','00000000-0000-0000-0000-0000000b0001','dt_aquisicao','2026-10-20',
  'local_id',%L,'itens',jsonb_build_array(jsonb_build_object('categoria','audio_video','descricao','Caixa amplificada',
  'quantidade',2,'valor_total',10000.01,'numeros_serie',jsonb_build_array('CX-1'))))) $q$,
  (select id from pat_locais where nome = 'Sede da SEMA/AC')), 'PAT_SERIE');

-- NF inexistente no armazenamento
select pg_temp.deve_falhar(format($q$ select fn_pat_incorporar(jsonb_build_object('id','00000000-0000-0000-0000-00000000aa01',
  'origem','compra_projeto','contrato_produto_id','00000000-0000-0000-0000-0000000b0001','dt_aquisicao','2026-10-20',
  'nf_url','https://x.supabase.co/storage/v1/object/public/patrimonio-docs/incorporacoes/00000000-0000-0000-0000-00000000aa01/nf.pdf',
  'local_id',%L,'itens',jsonb_build_array(jsonb_build_object('categoria','maquinas','descricao','Cabo','quantidade',1,'valor_total',1)))) $q$,
  (select id from pat_locais where nome = 'Sede da SEMA/AC')), 'PAT_ARQUIVO');

-- fornecedor do contrato não incorpora
set teste.fornecedor = 'sim';
select pg_temp.deve_falhar(format($q$ select fn_pat_incorporar(jsonb_build_object('id','00000000-0000-0000-0000-00000000aa01',
  'origem','compra_projeto','contrato_produto_id','00000000-0000-0000-0000-0000000b0001','dt_aquisicao','2026-10-20',
  'local_id',%L,'itens',jsonb_build_array(jsonb_build_object('categoria','maquinas','descricao','Cabo','quantidade',1,'valor_total',1)))) $q$,
  (select id from pat_locais where nome = 'Sede da SEMA/AC')), 'PAT_FORNECEDOR');
set teste.fornecedor = '';

-- com NF no armazenamento: 2 caixas (centavo na última) + 1 mesa
insert into storage.objects (bucket_id, name) values ('patrimonio-docs', 'incorporacoes/00000000-0000-0000-0000-00000000aa01/nf.pdf');
do $$
declare r jsonb;
begin
  r := fn_pat_incorporar(jsonb_build_object('id','00000000-0000-0000-0000-00000000aa01','origem','compra_projeto',
    'contrato_produto_id','00000000-0000-0000-0000-0000000b0001','dt_aquisicao','2026-10-20','dt_inicio_uso','2026-10-27',
    'nf_numero','655','nf_data','2026-10-20',
    'nf_url','https://x.supabase.co/storage/v1/object/public/patrimonio-docs/incorporacoes/00000000-0000-0000-0000-00000000aa01/nf.pdf',
    'local_id',(select id from pat_locais where nome = 'Sede da SEMA/AC'),
    'itens',jsonb_build_array(
      jsonb_build_object('categoria','audio_video','descricao','Caixa amplificada','marca','X','quantidade',2,'valor_total',10000.01,
                         'numeros_serie',jsonb_build_array('CX-1','CX-2')),
      jsonb_build_object('categoria','audio_video','descricao','Mesa de som digital','quantidade',1,'valor_total',5000,
                         'numeros_serie',jsonb_build_array('MS-1')))));
  perform pg_temp.ok(jsonb_array_length(r->'bens') = 3, '3 fichas: ' || r::text);
  perform pg_temp.ok((r->>'restante')::numeric = 5714.49 and not (r->>'concluida')::boolean, 'restante ' || r::text);
  perform pg_temp.ok((select string_agg(numero, ',' order by numero) from pat_bens) = 'PAT-000001,PAT-000002,PAT-000003', 'numeração');
  perform pg_temp.ok((select string_agg(valor_aquisicao_brl::text, ',' order by numero) from pat_bens) = '5000.00,5000.01,5000.00', 'rateio');
  perform pg_temp.ok((select count(*) from pat_bens where situacao = 'em_uso' and vida_util_meses = 120 and titularidade = 'unesco_projeto') = 3, 'em uso, vida da categoria');
  perform pg_temp.ok((select count(*) from pat_eventos where tipo = 'incorporacao') = 3, 'eventos de incorporação');
  perform pg_temp.ok((select status from tarefas where entidade_id = '00000000-0000-0000-0000-0000000b0001') = 'a_fazer', 'tarefa segue aberta');
  -- repetir o mesmo id não duplica
  r := fn_pat_incorporar(jsonb_build_object('id','00000000-0000-0000-0000-00000000aa01','origem','compra_projeto','itens','[]'::jsonb));
  perform pg_temp.ok((r->>'repetida')::boolean and (select count(*) from pat_bens) = 3, 'idempotente');
end $$;

-- série repetida
select pg_temp.deve_falhar(format($q$ select fn_pat_incorporar(jsonb_build_object('id','00000000-0000-0000-0000-00000000aa02',
  'origem','compra_projeto','contrato_produto_id','00000000-0000-0000-0000-0000000b0001','dt_aquisicao','2026-10-20',
  'local_id',%L,'itens',jsonb_build_array(jsonb_build_object('categoria','audio_video','descricao','Microfone','quantidade',1,
  'valor_total',100,'numeros_serie',jsonb_build_array('cx-1'))))) $q$,
  (select id from pat_locais where nome = 'Sede da SEMA/AC')), 'pat_bens_serie_uk');

-- passar do valor do produto: recusa e não deixa nada
select pg_temp.deve_falhar(format($q$ select fn_pat_incorporar(jsonb_build_object('id','00000000-0000-0000-0000-00000000aa02',
  'origem','compra_projeto','contrato_produto_id','00000000-0000-0000-0000-0000000b0001','dt_aquisicao','2026-10-20',
  'local_id',%L,'itens',jsonb_build_array(jsonb_build_object('categoria','audio_video','descricao','Microfone duplo','quantidade',1,
  'valor_total',6000,'numeros_serie',jsonb_build_array('MIC-1'))))) $q$,
  (select id from pat_locais where nome = 'Sede da SEMA/AC')), 'PAT_VALOR_EXCEDE');
select pg_temp.ok((select count(*) from pat_bens) = 3 and not exists (select 1 from pat_incorporacoes
  where id = '00000000-0000-0000-0000-00000000aa02'), 'recusa desfaz tudo');

-- completa o valor ⇒ tarefa concluída sozinha
do $$
declare r jsonb;
begin
  r := fn_pat_incorporar(jsonb_build_object('id','00000000-0000-0000-0000-00000000aa03','origem','compra_projeto',
    'contrato_produto_id','00000000-0000-0000-0000-0000000b0001','dt_aquisicao','2026-10-20',
    'local_id',(select id from pat_locais where nome = 'Sede da SEMA/AC'),
    'itens',jsonb_build_array(jsonb_build_object('categoria','audio_video','descricao','Microfone sem fio duplo','quantidade',1,
      'valor_total',5714.49,'numeros_serie',jsonb_build_array('MIC-1')))));
  perform pg_temp.ok((r->>'concluida')::boolean and (r->>'restante')::numeric = 0, 'concluída ' || r::text);
  perform pg_temp.ok((select status from tarefas where entidade_id = '00000000-0000-0000-0000-0000000b0001') = 'concluida', 'tarefa concluída');
  perform pg_temp.ok((select count(*) from fn_pat_a_incorporar()) = 0, 'fila vazia');
  perform pg_temp.ok((select situacao from pat_bens where numero_serie = 'MIC-1') = 'em_estoque', 'sem início de uso = estoque');
end $$;

-- ── 5. Travas do cache e do razão ───────────────────────────────────────────
reset request.jwt.claim.sub;
select pg_temp.deve_falhar($q$ update pat_bens set situacao = 'baixado' where numero = 'PAT-000001' $q$, 'PAT_CACHE_PROTEGIDO');
select pg_temp.deve_falhar($q$ update pat_bens set valor_aquisicao_brl = 1 where numero = 'PAT-000001' $q$, 'PAT_CACHE_PROTEGIDO');
select pg_temp.deve_falhar($q$ update pat_bens set numero = 'PAT-999' where numero = 'PAT-000001' $q$, 'PAT_CAMPO_FIXO');
select pg_temp.deve_falhar($q$ update pat_eventos set observacao = 'x' $q$, 'PAT_EVENTO_IMUTAVEL');
select pg_temp.deve_falhar($q$ insert into pat_bens (numero, categoria_codigo, descricao, incorporacao_id, origem, dt_aquisicao,
  valor_aquisicao_brl, vida_util_meses, residual_pct, criado_por) select '', 'maquinas', 'Furadeira', id, origem, current_date, 1, 1, 0,
  registrado_por from pat_incorporacoes limit 1 $q$, 'PAT_SO_PELA_INCORPORACAO');

-- cliente direto: sem privilégio
select pg_temp.como('c1');
set role authenticated;
select pg_temp.deve_falhar($q$ update pat_bens set descricao = 'x' $q$, 'permission denied');
reset role;

-- ── 6. Leitura por perfil ───────────────────────────────────────────────────
set role authenticated;
select pg_temp.como('b1');
select pg_temp.ok((select count(*) from vw_pat_bens) = 4, 'técnico vê o catálogo');
select pg_temp.ok((select count(*) from vw_pat_bens where valor_aquisicao_brl is not null or nf_numero is not null) = 0, 'técnico sem valores');
select pg_temp.ok((select count(*) from pat_incorporacoes) = 0, 'técnico sem NF');
select pg_temp.como('a2');
select pg_temp.ok((select count(*) from vw_pat_bens where valor_contabil_brl is null) = 4, 'visualizador sem valores');
select pg_temp.como('e1');
select pg_temp.ok((select count(*) from vw_pat_bens) = 0, 'consultor externo não vê');
select pg_temp.ok((select count(*) from pat_eventos) = 0, 'consultor externo sem eventos');
select pg_temp.como('f1');
select pg_temp.ok((select sum(valor_aquisicao_brl) from vw_pat_bens) = 20714.50, 'financeiro vê valores');
select pg_temp.ok((select cotacao_origem from vw_pat_bens where numero = 'PAT-000001') = 'unesco_pagamento', 'câmbio UNESCO');
select pg_temp.ok((select valor_aquisicao_usd from vw_pat_bens where numero = 'PAT-000001') = round(5000 / round(20714.50 / 4122.29, 6), 2), 'US$ pela UNESCO');
select pg_temp.como('');
select pg_temp.ok((select count(*) from vw_pat_bens) = 0, 'sem login não vê');
reset role;

-- ── 7. Condição, correção e estorno ─────────────────────────────────────────
select pg_temp.como('d1');
do $$
declare v_b uuid := (select id from pat_bens where numero = 'PAT-000001');
begin
  perform fn_pat_registrar_condicao(v_b, 'bom', 'Uso normal em evento');
  perform pg_temp.ok((select condicao from pat_bens where id = v_b) = 'bom', 'condição gravada');
  perform pg_temp.deve_falhar(format('select fn_pat_registrar_condicao(%L, %L, %L)', v_b, 'novo', 'voltou a ser novo'), 'não volta');
  perform pg_temp.deve_falhar(format('select fn_pat_registrar_condicao(%L, %L, %L)', v_b, 'ruim', 'curto'), 'PAT_DADOS');
  -- gestor não corrige valor
  perform pg_temp.deve_falhar(format($q$ select fn_pat_corrigir(%L, '{"valor_aquisicao_brl": 4000}', 'Valor da NF corrigido') $q$, v_b), 'PAT_SEM_PERMISSAO');
  -- mas informa o início de uso de bem em estoque
  perform fn_pat_corrigir((select id from pat_bens where numero_serie = 'MIC-1'), '{"dt_inicio_uso": "2026-11-03"}', null);
  perform pg_temp.ok((select situacao from pat_bens where numero_serie = 'MIC-1') = 'em_uso', 'início de uso ⇒ em uso');
  perform fn_pat_editar_ficha(v_b, '{"modelo": "PRO 15", "garantia_ate": "2027-10-20"}');
  perform pg_temp.ok((select modelo from pat_bens where id = v_b) = 'PRO 15', 'ficha editada');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_editar_ficha(%L, '{"numero_serie": ""}') $q$, v_b), 'PAT_SERIE');
  perform pg_temp.deve_falhar(format('select fn_pat_estornar(%L, %L)',
    (select id from pat_eventos where bem_id = v_b and tipo = 'condicao'), 'Registrado por engano'), 'PAT_SEM_PERMISSAO');
end $$;

select pg_temp.como('c1');
do $$
declare v_b uuid := (select id from pat_bens where numero = 'PAT-000001'); v_inc uuid; v_cor uuid;
begin
  -- correção que passa o produto é recusada
  perform pg_temp.deve_falhar(format($q$ select fn_pat_corrigir(%L, '{"valor_aquisicao_brl": 5000.50}', 'Valor da NF corrigido') $q$, v_b), 'PAT_VALOR_EXCEDE');
  v_cor := fn_pat_corrigir(v_b, '{"valor_aquisicao_brl": 4000, "vida_util_meses": 96}', 'Valor da NF corrigido pelo item');
  perform pg_temp.ok((select valor_aquisicao_brl from pat_bens where id = v_b) = 4000, 'correção');
  perform pg_temp.ok((select detalhes->'antes'->>'valor_aquisicao_brl' from pat_eventos where id = v_cor) = '5000.00', 'antes guardado');
  -- estorno só do último: incorporação com eventos depois não estorna
  v_inc := (select id from pat_eventos where bem_id = v_b and tipo = 'incorporacao');
  perform pg_temp.deve_falhar(format('select fn_pat_estornar(%L, %L)', v_inc, 'Cadastro feito em dobro'), 'só o último');
  perform fn_pat_estornar(v_cor, 'Correção lançada no bem errado');
  perform pg_temp.ok((select valor_aquisicao_brl = 5000 and vida_util_meses = 120 from pat_bens where id = v_b), 'estorno volta a correção');
  perform pg_temp.deve_falhar(format('select fn_pat_estornar(%L, %L)', v_cor, 'De novo o mesmo estorno'), 'só o último');
  perform fn_pat_estornar((select id from pat_eventos where bem_id = v_b and tipo = 'condicao'), 'Condição registrada por engano');
  perform pg_temp.ok((select condicao from pat_bens where id = v_b) = 'novo', 'estorno volta a condição');
  perform fn_pat_estornar(v_inc, 'Cadastro feito em dobro, anular');
  perform pg_temp.ok((select situacao from pat_bens where id = v_b) = 'anulado', 'anulado');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_editar_ficha(%L, '{"modelo": "Y"}') $q$, v_b), 'PAT_ENCERRADO');
  -- anular reabre a pendência do produto (nova tarefa)
  perform pg_temp.ok((select count(*) from tarefas where entidade_id = '00000000-0000-0000-0000-0000000b0001' and status = 'a_fazer') = 1, 'tarefa reaberta');
  perform pg_temp.ok((select restante from fn_pat_a_incorporar()) = 5000, 'restante volta');
end $$;

-- ── 8. Lote e origem declarada ──────────────────────────────────────────────
select pg_temp.como('d1');
select pg_temp.deve_falhar(format($q$ select fn_pat_incorporar(jsonb_build_object('id','00000000-0000-0000-0000-00000000aa04',
  'origem','cessao','origem_detalhe','Cedido pela SEMA, termo 12/2026','dt_aquisicao','2026-09-01',
  'local_id',%L,'itens',jsonb_build_array(jsonb_build_object('categoria','estruturas','descricao','Barraca 2x2','quantidade',40,'valor_total',4000)))) $q$,
  (select id from pat_locais where nome = 'Depósito do projeto')), 'PAT_SEM_PERMISSAO');
select pg_temp.como('c1');
select pg_temp.deve_falhar(format($q$ select fn_pat_incorporar(jsonb_build_object('id','00000000-0000-0000-0000-00000000aa04',
  'origem','cessao','origem_detalhe','SEMA','dt_aquisicao','2026-09-01',
  'local_id',%L,'itens',jsonb_build_array(jsonb_build_object('categoria','estruturas','descricao','Barraca 2x2','quantidade',40,'valor_total',4000)))) $q$,
  (select id from pat_locais where nome = 'Depósito do projeto')), 'origem');
do $$
declare r jsonb;
begin
  r := fn_pat_incorporar(jsonb_build_object('id','00000000-0000-0000-0000-00000000aa04','origem','cessao',
    'origem_detalhe','Cedido pela SEMA, termo 12/2026','dt_aquisicao','2026-09-01',
    'local_id',(select id from pat_locais where nome = 'Depósito do projeto'),
    'itens',jsonb_build_array(jsonb_build_object('categoria','estruturas','descricao','Barraca 2x2','quantidade',40,'valor_total',4000))));
  perform pg_temp.ok(jsonb_array_length(r->'bens') = 1 and r->>'restante' is null, 'lote = 1 ficha');
  perform pg_temp.ok((select quantidade = 40 and titularidade = 'sema' and contrato_id is null from pat_bens where descricao = 'Barraca 2x2'), 'lote com quantidade');
  perform fn_pat_corrigir((select id from pat_bens where descricao = 'Barraca 2x2'), '{"quantidade": 38}', 'Duas barracas contadas a mais');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_corrigir(%L, '{"quantidade": 2}', 'Quantidade em bem individual') $q$,
    (select id from pat_bens where numero_serie = 'CX-2')), 'só bem em lote');
end $$;

-- ── 9. Produto aprovado depois cria a tarefa pelo gatilho ───────────────────
reset request.jwt.claim.sub;
insert into contratos_produtos (id, contrato_id, numero_produto, descricao, valor_brl, situacao)
values ('00000000-0000-0000-0000-0000000b0003', '00000000-0000-0000-0000-0000000c0001', 2, 'Segunda entrega', 1000, 'pendente');
select pg_temp.ok((select count(*) from tarefas where entidade_id = '00000000-0000-0000-0000-0000000b0003') = 0, 'pendente sem tarefa');
update contratos_produtos set situacao = 'aprovado' where id = '00000000-0000-0000-0000-0000000b0003';
select pg_temp.ok((select count(*) from tarefas where entidade_id = '00000000-0000-0000-0000-0000000b0003') = 1, 'aprovado ⇒ tarefa');
update contratos_produtos set situacao = 'pago' where id = '00000000-0000-0000-0000-0000000b0003';
select pg_temp.ok((select count(*) from tarefas where entidade_id = '00000000-0000-0000-0000-0000000b0003') = 1, 'sem tarefa repetida');

-- justificativa da diferença conclui
select pg_temp.como('d1');
do $$
declare r jsonb;
begin
  r := fn_pat_incorporar(jsonb_build_object('id','00000000-0000-0000-0000-00000000aa05','origem','compra_projeto',
    'contrato_produto_id','00000000-0000-0000-0000-0000000b0003','dt_aquisicao','2026-11-10',
    'justificativa_diferenca','R$ 200 foram de instalação, não é bem',
    'local_id',(select id from pat_locais where nome = 'Sede da SEMA/AC'),
    'itens',jsonb_build_array(jsonb_build_object('categoria','maquinas','descricao','Suporte de caixa','quantidade',1,'valor_total',800))));
  perform pg_temp.ok((r->>'concluida')::boolean and (r->>'restante')::numeric = 200, 'diferença justificada conclui');
  perform pg_temp.ok((select status from tarefas where entidade_id = '00000000-0000-0000-0000-0000000b0003') = 'concluida', 'tarefa concluída 2');
  perform pg_temp.ok((select cotacao_ptax from pat_bens where descricao = 'Suporte de caixa') = 5.0, 'PTAX de reserva');
end $$;

-- ── 10. Documentos ──────────────────────────────────────────────────────────
do $$
declare v_b uuid := (select id from pat_bens where numero_serie = 'CX-2'); v_d uuid;
begin
  perform pg_temp.deve_falhar(format($q$ select fn_pat_anexar(%L, 'foto', 'https://x/storage/v1/object/public/patrimonio-docs/bens/%s/f.jpg', 'f.jpg') $q$, v_b, v_b), 'PAT_ARQUIVO');
  insert into storage.objects (bucket_id, name) values ('patrimonio-docs', 'bens/' || v_b || '/f.jpg');
  v_d := fn_pat_anexar(v_b, 'foto', 'https://x/storage/v1/object/public/patrimonio-docs/bens/' || v_b || '/f.jpg', 'f.jpg');
  perform pg_temp.ok((select n_fotos from vw_pat_bens where id = v_b) = 1, 'foto na view');
  -- arquivo de outro bem não serve
  perform pg_temp.deve_falhar(format($q$ select fn_pat_anexar(%L, 'foto', 'https://x/storage/v1/object/public/patrimonio-docs/bens/%s/f.jpg', 'f.jpg') $q$,
    (select id from pat_bens where numero_serie = 'MS-1'), v_b), 'PAT_ARQUIVO');
  perform fn_pat_remover_anexo(v_d, 'Foto desfocada');
  perform pg_temp.ok((select n_fotos from vw_pat_bens where id = v_b) = 0, 'foto saiu (ativo=false)');
  perform pg_temp.ok((select count(*) from pat_documentos) = 1, 'registro fica');
end $$;

-- ── 11. Catálogos ───────────────────────────────────────────────────────────
select pg_temp.deve_falhar($q$ select fn_pat_salvar_categoria('{"codigo":"drones","nome":"Drones","vida_util_meses":60}') $q$, 'PAT_SEM_PERMISSAO');
select pg_temp.como('c1');
select fn_pat_salvar_categoria('{"codigo":"estruturas","nome":"Tendas e barracas","vida_util_meses":48,"controle":"individual"}');
select pg_temp.ok((select controle = 'lote' and vida_util_meses = 48 from pat_categorias where codigo = 'estruturas'), 'controle fixo com bens');
select pg_temp.ok((select vida_util_meses from pat_bens where descricao = 'Barraca 2x2') = 60, 'bem guarda a vida útil da entrada');
select pg_temp.como('d1');
select pg_temp.deve_falhar(format($q$ select fn_pat_salvar_local(jsonb_build_object('id',%L,'nome','Sede da SEMA/AC','ativo',false)) $q$,
  (select id from pat_locais where nome = 'Sede da SEMA/AC')), 'há bens');
select pg_temp.ok(fn_pat_salvar_local('{"nome":"APA Igarapé São Francisco","tipo":"unidade_conservacao"}') is not null, 'local novo');

\echo 'Patrimônio: todos os testes passaram.'
