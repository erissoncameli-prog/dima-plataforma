-- ════════════════════════════════════════════════════════════════════════
-- Testes do remanejamento — Fases 0 e 1 (rodar com rodar.sh, banco LOCAL).
-- Cada bloco falha com RAISE EXCEPTION 'FALHOU: ...' — o psql para no 1º erro.
-- "Logar" = set role authenticated + request.jwt.claim.sub.
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1

-- Espera que o comando falhe com uma mensagem contendo `trecho`.
create function public.t_erro(p_sql text, p_trecho text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALHOU: deveria ter dado erro (%): %', p_trecho, p_sql;
exception when others then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  if position(p_trecho in sqlerrm) = 0 then
    raise exception 'FALHOU: erro inesperado em "%": % (esperado: %)', p_sql, sqlerrm, p_trecho;
  end if;
end $$;
create function public.t_igual(p_rotulo text, p_obtido numeric, p_esperado numeric) returns void language plpgsql as $$
begin
  if p_obtido is distinct from p_esperado then
    raise exception 'FALHOU: % — obtido %, esperado %', p_rotulo, p_obtido, p_esperado;
  end if;
end $$;
grant execute on function public.t_erro(text, text), public.t_igual(text, numeric, numeric) to authenticated;

-- Conferência sem nenhuma inconsistência (ignora linhas info_*)
create function public.t_conferencia_ok(p_rotulo text) returns void language plpgsql as $$
declare r record;
begin
  for r in select * from public.fn_conferir_orcamento() where not ok and verificacao not like 'info_%' loop
    raise exception 'FALHOU: % — conferência % (%): esperado %, encontrado %',
      p_rotulo, r.verificacao, r.atividade_codigo, r.esperado, r.encontrado;
  end loop;
end $$;

-- Cenário EXISTENTE antes da carga (como em produção)
insert into public.usuarios (id, nome_completo, email, perfil) values
 ('00000000-0000-0000-0000-00000000005a','Super','sa@x','super_admin'),
 ('00000000-0000-0000-0000-0000000000c0','Coord','co@x','coordenacao'),
 ('00000000-0000-0000-0000-0000000000e1','Tec','t1@x','tecnico'),
 ('00000000-0000-0000-0000-0000000000b1','Visual','vi@x','visualizador'),
 ('00000000-0000-0000-0000-0000000000f1','Financeiro','fi@x','financeiro');
insert into public.resultados (id, codigo, orcamento_usd) values
 ('10000000-0000-0000-0000-000000000001','R1', 2000);
insert into public.atividades (id, resultado_id, codigo, orcamento_usd) values
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','1.1.1', 1000),
 ('a0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','2.1.7', 1000);
insert into public.tdrs (id, atividade_id, numero, status, valor_usd) values
 ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','1.1.1-001','contratado', 600),
 ('d0000000-0000-0000-0000-000000000071','a0000000-0000-0000-0000-000000000002','2.1.7-001','aprovado', 300),
 ('d0000000-0000-0000-0000-000000000072','a0000000-0000-0000-0000-000000000002','2.1.7-002','aprovado', 300);
insert into public.contratos (id, numero, tdr_id, atividade_id, valor_total_brl) values
 ('c0000000-0000-0000-0000-000000000001','CT-1','d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001', 2500);
-- economia ativa (US$ 100) e uma revertida (US$ 40); valor com 3 casas, como há em produção
insert into public.contrato_encerramentos (id, contrato_id, atividade_id, tipo, tdr_id, valor_liberado_usd, motivo, status, revertido_em, motivo_reversao) values
 ('e0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','economia_contratacao','d0000000-0000-0000-0000-000000000001', 100.004,'economia', 'ativo', null, null),
 ('e0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','encerramento_contrato',null, 40,'encerramento antigo', 'revertido', now(), 'erro');
-- viagens (execução direta) pagas sem contrato na 2.1.7
insert into public.execucao_financeira (atividade_id, descricao, valor_brl, valor_usd, situacao) values
 ('a0000000-0000-0000-0000-000000000002','VGM-1', 1000, 200, 'pago'),
 ('a0000000-0000-0000-0000-000000000002','VGM-2', 500, 100, 'a_pagar'),
 ('a0000000-0000-0000-0000-000000000002','VGM-cancelada', 500, 999, 'cancelado');

\echo '· aplicando migrations'
\ir ../../migrations/20261003_rem_00_contencao.sql
\ir ../../migrations/20261003_rem_01_razao_fontes.sql
\ir ../../migrations/20261003_rem_02_cotacao_ptax.sql
\ir ../../migrations/20261003_rem_03_cadeia_aprovacao.sql
\echo '· reaplicando (idempotência; rem_01 não, porque a rem_03 estende as views dela)'
\ir ../../migrations/20261003_rem_00_contencao.sql
\ir ../../migrations/20261003_rem_02_cotacao_ptax.sql
\ir ../../migrations/20261003_rem_03_cadeia_aprovacao.sql
\ir ../../migrations/20261003_rem_03g_sql_editor.sql

\echo '· T1 carga inicial'
do $$ begin
  perform t_igual('dotações', (select count(*) from orcamento_fontes where tipo='dotacao_original'), 2);
  perform t_igual('crédito economia arredondado', (select valor_usd from orcamento_fontes where encerramento_id='e0000000-0000-0000-0000-000000000001'), 100.00);
  perform t_igual('encerramento revertido: crédito + estorno = 0',
    (select sum(valor_usd) from orcamento_fontes where encerramento_id='e0000000-0000-0000-0000-000000000002'), 0);
  perform t_igual('orçamento inalterado 1.1.1', (select orcamento_usd from atividades where codigo='1.1.1'), 1000);
  perform t_igual('original congelado', (select orcamento_original_usd from atividades where codigo='2.1.7'), 1000);
  perform t_igual('TDRs guarda-chuva marcados', (select count(*) from tdrs where execucao_direta), 2);
  perform t_conferencia_ok('após carga');
end $$;

\echo '· T2 PEPS e procedência'
do $$ begin
  -- 1.1.1: créditos 1000 + 100; débito 600 → dotação 400 disponível, economia 100
  perform t_igual('dotação disponível', (select disponivel_usd from vw_orcamento_fontes_saldo
    where atividade_codigo='1.1.1' and tipo='dotacao_original'), 400);
  perform t_igual('economia disponível', (select disponivel_usd from vw_orcamento_fontes_saldo
    where atividade_codigo='1.1.1' and tipo='economia_contratacao'), 100);
  perform t_igual('saldo 1.1.1', (select saldo_usd from vw_orcamento_atividade where codigo='1.1.1'), 500);
  -- TDR novo de 400 esgota a dotação; a economia segue intacta
  insert into tdrs (atividade_id, numero, status, valor_usd) values ('a0000000-0000-0000-0000-000000000001','1.1.1-002','aprovado', 400);
  perform t_igual('dotação esgotada', (select disponivel_usd from vw_orcamento_fontes_saldo
    where atividade_codigo='1.1.1' and tipo='dotacao_original'), 0);
  perform t_igual('economia intacta', (select disponivel_usd from vw_orcamento_fontes_saldo
    where atividade_codigo='1.1.1' and tipo='economia_contratacao'), 100);
  -- despesa direta de 30 (sem reserva) passa a consumir a economia
  insert into execucao_financeira (atividade_id, descricao, valor_brl, valor_usd, situacao)
  values ('a0000000-0000-0000-0000-000000000001','despesa avulsa', 150, 30, 'pago');
  perform t_igual('economia parcial', (select disponivel_usd from vw_orcamento_fontes_saldo
    where atividade_codigo='1.1.1' and tipo='economia_contratacao'), 70);
  update execucao_financeira set situacao = 'cancelado' where descricao = 'despesa avulsa';
  -- cancelar devolve à dotação
  update tdrs set status='cancelado' where numero='1.1.1-002';
  perform t_igual('dotação devolvida', (select disponivel_usd from vw_orcamento_fontes_saldo
    where atividade_codigo='1.1.1' and tipo='dotacao_original'), 400);
  perform t_conferencia_ok('após TDR cancelado');
end $$;

\echo '· T3 eventos de TDR'
do $$ begin
  perform t_igual('criado+cancelado', (select count(*) from orcamento_eventos where tdr_numero='1.1.1-002'), 2);
  perform t_igual('efeito líquido zero', (select sum(efeito_usd) from orcamento_eventos where tdr_numero='1.1.1-002'), 0);
  update tdrs set valor_usd = 550 where numero='1.1.1-001';
  perform t_igual('valor alterado', (select efeito_usd from orcamento_eventos
    where tdr_numero='1.1.1-001' and evento='tdr_valor_alterado'), -50);
end $$;
do $$ begin
  update tdrs set status='em_licitacao' where numero='1.1.1-001';   -- status sem efeito no débito
  perform t_igual('mudança de status sem efeito não gera evento',
    (select count(*) from orcamento_eventos where tdr_numero='1.1.1-001'), 1);
end $$;

\echo '· T4 execução direta (viagens)'
do $$ begin
  -- 2.1.7: reserva 600, despesas 300 (cancelada não conta) → débito 600, saldo 400
  perform t_igual('débito = reserva', (select debito_usd from vw_orcamento_debitos
    where atividade_id='a0000000-0000-0000-0000-000000000002'), 600);
  perform t_igual('realizado', (select execucao_direta_realizada_usd from vw_orcamento_debitos
    where atividade_id='a0000000-0000-0000-0000-000000000002'), 300);
  -- viagens passam da reserva: excedente vira débito extra
  insert into execucao_financeira (atividade_id, descricao, valor_brl, valor_usd, situacao)
  values ('a0000000-0000-0000-0000-000000000002','VGM-3', 2000, 450, 'pago');
  perform t_igual('débito = realizado', (select debito_usd from vw_orcamento_debitos
    where atividade_id='a0000000-0000-0000-0000-000000000002'), 750);
  perform t_igual('saldo 2.1.7', (select saldo_usd from vw_orcamento_atividade where codigo='2.1.7'), 250);
  perform t_igual('painel não vê o excedente', (select saldo_livre_painel_usd from vw_orcamento_atividade where codigo='2.1.7'), 400);
  perform t_conferencia_ok('excedente de viagem explicado');
end $$;

\echo '· T5 estorno de economia entra no razão'
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c0', true);
  perform fn_estornar_economia_tdr('e0000000-0000-0000-0000-000000000001', 'teste');
  reset role;
  perform t_igual('economia zerada', (select liquido_usd from vw_orcamento_fontes_saldo
    where atividade_codigo='1.1.1' and tipo='economia_contratacao'), 0);
  perform t_conferencia_ok('após estorno');
end $$;

\echo '· T6 guarda do orçamento e da view'
do $$ begin
  perform t_erro($q$update atividades set orcamento_usd = 5 where codigo='1.1.1'$q$, 'ORCAMENTO_PROTEGIDO');
  perform t_erro($q$update atividades set orcamento_original_usd = 5 where codigo='1.1.1'$q$, 'ORCAMENTO_PROTEGIDO');
  update atividades set nome_pt = 'Nome novo' where codigo = '1.1.1';   -- demais campos seguem livres
end $$;
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1', true);
  perform t_erro($q$update vw_saldo_atividade set orcamento_usd = 1 where codigo='1.1.1'$q$, 'permission denied');
  perform t_erro($q$update vw_saldo_atividade set nome_pt = 'x' where codigo='1.1.1'$q$, 'permission denied');
  perform t_erro($q$delete from vw_saldo_atividade$q$, 'permission denied');
  perform t_erro($q$update vw_orcamento_atividade set codigo = 'x'$q$, 'cannot update view');
  if has_table_privilege('authenticated', 'public.vw_orcamento_atividade', 'UPDATE')
     or has_table_privilege('authenticated', 'public.vw_orcamento_fontes_saldo', 'INSERT')
     or has_table_privilege('authenticated', 'public.vw_orcamento_debitos', 'DELETE')
     or has_table_privilege('authenticated', 'public.vw_saldo_atividade', 'UPDATE') then
    raise exception 'FALHOU: view de saldo com privilégio de escrita';
  end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c0', true);
  perform t_erro($q$update atividades set orcamento_usd = 5 where codigo='1.1.1'$q$, 'ORCAMENTO_PROTEGIDO');
  perform t_erro($q$insert into atividades (resultado_id, codigo, orcamento_usd) values ('10000000-0000-0000-0000-000000000001','9.9.9', 10)$q$, 'ORCAMENTO_PROTEGIDO');
  perform t_erro($q$select set_config('dima.razao_orcamento','on',false); update atividades set orcamento_usd = 5 where codigo='1.1.1'$q$, 'ORCAMENTO_PROTEGIDO');
end $$;

\echo '· T7 razão imutável e fechado para o cliente'
do $$ begin
  perform t_erro($q$update orcamento_fontes set valor_usd = 1$q$, 'imutável');
  perform t_erro($q$delete from orcamento_fontes$q$, 'imutável');
  perform t_erro($q$delete from orcamento_eventos$q$, 'imutável');
  perform t_erro($q$update contrato_encerramentos set valor_liberado_usd = 1$q$, 'imutáveis');
  perform t_erro($q$update contrato_encerramentos set status='ativo' where id='e0000000-0000-0000-0000-000000000002'$q$, 'não volta');
  perform t_erro($q$delete from contrato_encerramentos$q$, 'não é apagada');
  -- ajuste que deixaria fonte negativa
  perform t_erro($q$insert into orcamento_fontes (atividade_id, tipo, valor_usd, ajusta_fonte_id, descricao)
    select atividade_id, 'revisao_orcamentaria', -2000, id, 'x' from orcamento_fontes where tipo='dotacao_original' limit 1$q$, 'negativa');
end $$;
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000005a', true);
  perform t_erro($q$insert into orcamento_fontes (atividade_id, tipo, valor_usd, descricao)
    values ('a0000000-0000-0000-0000-000000000001','revisao_orcamentaria', 10, 'x')$q$, 'permission denied');
  perform t_erro($q$select fn_orcamento_recalcular_cache('a0000000-0000-0000-0000-000000000001')$q$, 'permission denied');
  if (select count(*) from orcamento_fontes) = 0 then raise exception 'FALHOU: leitura do razão'; end if;
end $$;

\echo '· T8 nova liberação e atividade nova'
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c0', true);
  insert into contrato_encerramentos (contrato_id, atividade_id, tipo, valor_liberado_usd, motivo, autorizado_por)
  values ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','encerramento_contrato', 75,'rescisão', auth.uid());
  -- sem USD não gera crédito (a view também soma zero)
  insert into contrato_encerramentos (contrato_id, atividade_id, tipo, valor_liberado_usd, motivo)
  values ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','encerramento_contrato', null,'sem taxa');
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000005a', true);
  insert into atividades (resultado_id, codigo, orcamento_usd) values ('10000000-0000-0000-0000-000000000001','3.1.1', 250);
  reset role;
  perform t_igual('rescisão creditada', (select disponivel_usd from vw_orcamento_fontes_saldo
    where atividade_codigo='1.1.1' and tipo='encerramento_contrato' and liquido_usd > 0), 75);
  perform t_igual('dotação da atividade nova', (select orcamento_original_usd from atividades where codigo='3.1.1'), 250);
  perform t_igual('vigente da atividade nova', (select orcamento_usd from atividades where codigo='3.1.1'), 250);
  perform t_conferencia_ok('após liberação e atividade nova');
end $$;

\echo '· T9 auditoria e permissão da conferência'
do $$ begin
  if not exists (select 1 from audit_log where tabela='atividades' and campos_alterados ? 'nome_pt') then
    raise exception 'FALHOU: audit_log de atividades';
  end if;
  if not exists (select 1 from audit_log where tabela='atividades' and campos_alterados ? 'orcamento_original_usd') then
    raise exception 'FALHOU: mudança de orçamento pelo razão também deve ficar no audit_log';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1', true);
  perform t_erro($q$select * from fn_conferir_orcamento()$q$, 'Sem permissão');
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1', true);
  perform count(*) from fn_conferir_orcamento();
end $$;

\echo '· T10 anon sem acesso'
do $$ begin
  set local role anon;
  perform t_erro($q$select * from orcamento_fontes$q$, 'permission denied');
  perform t_erro($q$select * from vw_orcamento_atividade$q$, 'permission denied');
  perform t_erro($q$select * from fn_conferir_orcamento()$q$, 'permission denied');
end $$;

\echo '· T11 cotação PTAX'
do $$ begin
  -- só service_role grava; quinta e sexta, sem fim de semana
  set local role service_role;
  insert into cotacoes_ptax (data, ptax_compra, ptax_venda) values
    ('2026-10-01', 5.3001, 5.3007), ('2026-10-02', 5.3101, 5.3107);
  insert into cotacoes_ptax (data, ptax_compra, ptax_venda) values ('2026-10-02', 9, 9)
    on conflict (data) do nothing;                         -- o que a Edge Function faz
  reset role;
  perform t_igual('PTAX do dia', (select ptax_venda from fn_cotacao_usd('2026-10-02')), 5.3107);
  perform t_igual('sábado usa sexta', (select ptax_venda from fn_cotacao_usd('2026-10-03')), 5.3107);
  perform t_igual('defasagem informada', (select defasagem_dias from fn_cotacao_usd('2026-10-04')), 2);
  if (select data_cotacao from fn_cotacao_usd('2026-10-04')) <> '2026-10-02' then
    raise exception 'FALHOU: data usada';
  end if;
  perform t_erro($q$select * from fn_cotacao_usd('2026-10-20')$q$, 'COTACAO_DESATUALIZADA');
  perform t_erro($q$select * from fn_cotacao_usd('2026-09-01')$q$, 'COTACAO_INDISPONIVEL');
  perform t_erro($q$update cotacoes_ptax set ptax_venda = 1$q$, 'imutável');
  perform t_erro($q$delete from cotacoes_ptax$q$, 'imutável');
  if not exists (select 1 from cron.job where jobname = 'cotacao-ptax-diaria' and schedule = '20 17,22 * * 1-5') then
    raise exception 'FALHOU: cron';
  end if;
end $$;
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000005a', true);
  perform t_erro($q$insert into cotacoes_ptax (data, ptax_compra, ptax_venda) values ('2026-10-05', 1, 1)$q$, 'permission denied');
  perform t_igual('logado lê', (select count(*) from cotacoes_ptax), 2);
  perform t_igual('logado consulta', (select ptax_venda from fn_cotacao_usd('2026-10-01')), 5.3007);
  reset role;
  set local role anon;
  perform t_erro($q$select * from cotacoes_ptax$q$, 'permission denied');
  perform t_erro($q$select * from fn_cotacao_usd('2026-10-01')$q$, 'permission denied');
end $$;

do $$ begin
  -- a PTAX não pode tocar a tabela antiga da AwesomeAPI
  if not has_table_privilege('authenticated', 'public.cotacoes_usd', 'INSERT')
     or exists (select 1 from pg_trigger where tgrelid = 'public.cotacoes_usd'::regclass and not tgisinternal) then
    raise exception 'FALHOU: rem_02 alterou cotacoes_usd (AwesomeAPI)';
  end if;
  update cotacoes_usd set cotacao = cotacao where false;
end $$;

\echo '· T12 cadeia de aprovação — cenário'
insert into public.usuarios (id, nome_completo, email, perfil) values
 ('00000000-0000-0000-0000-0000000000c1','Coord 2','c1@x','coordenacao'),
 ('00000000-0000-0000-0000-0000000000d1','Diretor','d1@x','visualizador'),
 ('00000000-0000-0000-0000-0000000000a1','Secretário','s1@x','visualizador'),
 ('00000000-0000-0000-0000-0000000000e3','Resp 3.1.1','e3@x','tecnico'),
 ('00000000-0000-0000-0000-0000000000f2','Financeiro 2','f2@x','financeiro');
insert into public.atividade_responsaveis (atividade_id, usuario_id, papel)
select id, '00000000-0000-0000-0000-0000000000e1'::uuid, 'responsavel' from atividades where codigo = '1.1.1'
union all select id, '00000000-0000-0000-0000-0000000000e3', 'responsavel' from atividades where codigo = '3.1.1'
union all select id, '00000000-0000-0000-0000-0000000000b1', 'substituto'  from atividades where codigo = '1.1.1';

create function public.t_login(p uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', p::text, false) $$;
create function public.t_ass(u uuid, r uuid, d text, m text default null) returns jsonb language sql as
  $$ select fn_rem_assinar(u, r, d, m, fn_rem_hash(r), '127.0.0.1', 'teste') $$;
create table public.t_ids (k text primary key, v uuid);
insert into public.t_ids
select 'a111', id from atividades where codigo='1.1.1' union all
select 'a217', id from atividades where codigo='2.1.7' union all
select 'a311', id from atividades where codigo='3.1.1' union all
select 'f111', id from orcamento_fontes where tipo='dotacao_original' and atividade_id=(select id from atividades where codigo='1.1.1') union all
select 'f311', id from orcamento_fontes where tipo='dotacao_original' and atividade_id=(select id from atividades where codigo='3.1.1');
create function public.t_id(k text) returns uuid language sql as $$ select v from t_ids where t_ids.k = $1 $$;
create function public.t_dados(j text, o111 numeric, o311 numeric, d217 numeric, a111 numeric, a311 numeric) returns jsonb language sql as $$
  select jsonb_build_object('justificativa', j,
    'itens', jsonb_build_array(
       jsonb_build_object('atividade_id', t_id('a111'), 'valor_usd', -o111),
       jsonb_build_object('atividade_id', t_id('a311'), 'valor_usd', -o311),
       jsonb_build_object('atividade_id', t_id('a217'), 'valor_usd', d217)),
    'alocacoes', jsonb_build_array(
       jsonb_build_object('atividade_id', t_id('a111'), 'fonte_id', t_id('f111'), 'valor_usd', a111),
       jsonb_build_object('atividade_id', t_id('a311'), 'fonte_id', t_id('f311'), 'valor_usd', a311)))
$$;

\echo '· T12a titulares'
do $$ begin
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  perform t_erro($q$select fn_rem_designar_titular('diretor','00000000-0000-0000-0000-0000000000d1','x')$q$, 'só super_admin');
  perform t_login('00000000-0000-0000-0000-00000000005a');
  perform t_erro($q$select fn_rem_designar_titular('unesco_financeiro','00000000-0000-0000-0000-0000000000d1','Portaria 1')$q$, 'exige perfil');
  perform fn_rem_designar_titular('coordenacao_solicitante','00000000-0000-0000-0000-0000000000c0','Portaria 1/2026');
  perform fn_rem_designar_titular('unesco_financeiro','00000000-0000-0000-0000-0000000000f1','Ofício UNESCO 10');
  perform fn_rem_designar_titular('diretor','00000000-0000-0000-0000-0000000000d1','Portaria 2/2026');
  perform t_erro($q$select fn_rem_designar_titular('secretario','00000000-0000-0000-0000-0000000000d1','x')$q$, 'uq_rem_titular_pessoa');
  perform fn_rem_designar_titular('secretario','00000000-0000-0000-0000-0000000000a1','Decreto 3/2026');
  -- troca de titular encerra a vigência anterior (histórico preservado)
  perform fn_rem_designar_titular('unesco_financeiro','00000000-0000-0000-0000-0000000000f2','Ofício UNESCO 11');
  perform fn_rem_designar_titular('unesco_financeiro','00000000-0000-0000-0000-0000000000f1','Ofício UNESCO 12');
  perform t_igual('histórico de titulares UNESCO', (select count(*) from rem_cargo_titulares where cargo='unesco_financeiro'), 3);
  perform t_erro($q$update rem_cargo_titulares set ato='x'$q$, 'só admite encerrar');
  perform t_erro($q$delete from rem_cargo_titulares$q$, 'não é apagada');
end $$;

\echo '· T12b rascunho e validação'
do $$ declare v_rem uuid; begin
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  perform t_erro($q$select fn_rem_salvar(null, '{}'::jsonb)$q$, 'só a coordenação');
  perform t_login('00000000-0000-0000-0000-0000000000c1');           -- coordenação, mas não titular
  v_rem := fn_rem_salvar(null, t_dados('Recompor a 2.1.7 com saldo livre das outras atividades', 100, 50, 150, 100, 50)
                                || '{"uuid_cliente":"99999999-0000-0000-0000-000000000001"}');
  insert into t_ids values ('rem1', v_rem);
  perform t_igual('idempotente por uuid_cliente',
    (select count(*) from remanejamentos where uuid_cliente='99999999-0000-0000-0000-000000000001'), 1);
  if fn_rem_salvar(null, '{"uuid_cliente":"99999999-0000-0000-0000-000000000001"}') <> v_rem then
    raise exception 'FALHOU: idempotência devolve o mesmo pedido';
  end if;
  if (select numero from remanejamentos where id=v_rem) !~ '^REM-\d{4}-001$' then raise exception 'FALHOU: numeração'; end if;
  -- não titular não envia
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000c1', v_rem, 'aprovar'), 'Só o titular');
  -- soma ≠ 0
  perform fn_rem_salvar(v_rem, t_dados('Recompor a 2.1.7 com saldo livre das outras atividades', 100, 50, 140, 100, 50));
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000c0', v_rem, 'aprovar'), 'soma dos itens');
  -- alocação diferente da cessão
  perform fn_rem_salvar(v_rem, t_dados('Recompor a 2.1.7 com saldo livre das outras atividades', 100, 50, 150, 90, 50));
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000c0', v_rem, 'aprovar'), 'somam US$');
  -- mais do que o disponível da fonte (1.1.1 tem US$ 450 de dotação livre)
  perform fn_rem_salvar(v_rem, t_dados('Recompor a 2.1.7 com saldo livre das outras atividades', 500, 50, 550, 500, 50));
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000c0', v_rem, 'aprovar'), 'SALDO_INSUFICIENTE');
  -- justificativa vazia
  perform fn_rem_salvar(v_rem, t_dados('curta', 100, 50, 150, 100, 50));
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000c0', v_rem, 'aprovar'), 'justificativa');
  perform fn_rem_salvar(v_rem, t_dados('Recompor a 2.1.7 com saldo livre das outras atividades', 100, 50, 150, 100, 50));
  -- hash diferente do que a pessoa viu
  perform t_erro(format('select fn_rem_assinar(%L, %L, %L, null, %L)', '00000000-0000-0000-0000-0000000000c0', v_rem, 'aprovar', 'abc'), 'DOCUMENTO_ALTERADO');
end $$;

\echo '· T12c envio, reserva e só o próximo é avisado'
do $$ declare v_rem uuid := t_id('rem1'); begin
  perform t_ass('00000000-0000-0000-0000-0000000000c0', v_rem, 'aprovar');
  perform t_igual('etapa 2', (select etapa_atual from remanejamentos where id=v_rem), 2);
  perform t_igual('6 etapas (1 solic + 2 liberações + 3 cargos)', (select count(*) from remanejamento_etapas where remanejamento_id=v_rem), 6);
  perform t_igual('reserva na fonte', (select reservado_usd from vw_orcamento_fontes_saldo where fonte_id=t_id('f111')), 100);
  perform t_igual('livre desconta a reserva', (select livre_usd from vw_orcamento_fontes_saldo where fonte_id=t_id('f111')), 350);
  perform t_igual('avisado só o responsável da 1.1.1 (não o substituto)',
    (select count(*) from remanejamento_notificacoes where remanejamento_id=v_rem), 1);
  if (select usuario_id from remanejamento_notificacoes where remanejamento_id=v_rem) <> '00000000-0000-0000-0000-0000000000e1' then
    raise exception 'FALHOU: destinatário do aviso';
  end if;
  -- itens congelados fora do rascunho
  perform t_erro(format('update remanejamento_itens set valor_usd = -1 where remanejamento_id = %L', v_rem), 'só mudam com o pedido em rascunho');
  -- fora da vez / substituto não assina
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000f1', v_rem, 'aprovar'), 'NAO_E_SUA_VEZ');
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000b1', v_rem, 'aprovar'), 'NAO_E_SUA_VEZ');
end $$;

\echo '· T12d outro pedido não usa o dinheiro reservado'
do $$ declare v2 uuid; begin
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  v2 := fn_rem_salvar(null, jsonb_build_object('justificativa','Segundo pedido disputando a mesma fonte',
     'itens', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a111'), 'valor_usd', -400),
                                jsonb_build_object('atividade_id', t_id('a217'), 'valor_usd', 400)),
     'alocacoes', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a111'), 'fonte_id', t_id('f111'), 'valor_usd', 400))));
  insert into t_ids values ('rem2', v2);
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000c0', v2, 'aprovar'), 'SALDO_INSUFICIENTE');
end $$;

\echo '· T12e devolução volta UMA etapa e avisa só o anterior'
do $$ declare v_rem uuid := t_id('rem1'); begin
  perform t_ass('00000000-0000-0000-0000-0000000000e1', v_rem, 'aprovar');            -- libera 1.1.1
  perform t_igual('etapa 3', (select etapa_atual from remanejamentos where id=v_rem), 3);
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000e3', v_rem, 'devolver'), 'motivo');
  delete from remanejamento_notificacoes;
  perform t_ass('00000000-0000-0000-0000-0000000000e3', v_rem, 'devolver', 'Confirmar o valor da 1.1.1');
  perform t_igual('voltou à etapa 2', (select etapa_atual from remanejamentos where id=v_rem), 2);
  perform t_igual('só o anterior avisado', (select count(*) from remanejamento_notificacoes where evento='devolvido'), 1);
  if (select usuario_id from remanejamento_notificacoes where evento='devolvido') <> '00000000-0000-0000-0000-0000000000e1' then
    raise exception 'FALHOU: devolução deve avisar quem assinou a etapa anterior';
  end if;
  perform t_igual('próximo NÃO avisado', (select count(*) from remanejamento_notificacoes where evento='analisar'), 0);
  perform t_igual('assinatura anterior reaberta',
    (select count(*) from remanejamento_assinaturas where remanejamento_id=v_rem and decisao='aprovar' and invalidada_em is not null), 1);
  -- reaprova e segue
  perform t_ass('00000000-0000-0000-0000-0000000000e1', v_rem, 'aprovar');
  perform t_ass('00000000-0000-0000-0000-0000000000e3', v_rem, 'aprovar');
  perform t_igual('etapa UNESCO', (select etapa_atual from remanejamentos where id=v_rem), 4);
  if not exists (select 1 from remanejamento_notificacoes where evento='analisar' and usuario_id='00000000-0000-0000-0000-0000000000f1') then
    raise exception 'FALHOU: UNESCO deve ser avisada'; end if;
  perform t_igual('diretor ainda não avisado',
    (select count(*) from remanejamento_notificacoes where usuario_id='00000000-0000-0000-0000-0000000000d1'), 0);
end $$;

\echo '· T12f efetivação no razão com linhagem'
do $$ declare v_rem uuid := t_id('rem1'); v_orc217 numeric; begin
  v_orc217 := (select orcamento_usd from atividades where id=t_id('a217'));
  perform t_ass('00000000-0000-0000-0000-0000000000f1', v_rem, 'aprovar');
  perform t_ass('00000000-0000-0000-0000-0000000000d1', v_rem, 'aprovar');
  perform t_igual('ainda não efetivado', (select count(*) from orcamento_fontes where remanejamento_id=v_rem), 0);
  perform t_ass('00000000-0000-0000-0000-0000000000a1', v_rem, 'aprovar');
  if (select status from remanejamentos where id=v_rem) <> 'efetivado' then raise exception 'FALHOU: efetivação'; end if;
  perform t_igual('origem 1.1.1 −100', (select orcamento_usd from atividades where id=t_id('a111')), 900);
  perform t_igual('origem 3.1.1 −50',  (select orcamento_usd from atividades where id=t_id('a311')), 200);
  perform t_igual('destino 2.1.7 +150', (select orcamento_usd from atividades where id=t_id('a217')), v_orc217 + 150);
  perform t_igual('2 recebimentos', (select count(*) from orcamento_fontes where remanejamento_id=v_rem and tipo='remanejamento_recebido'), 2);
  perform t_igual('linhagem: recebido aponta a fonte da 1.1.1',
    (select valor_usd from orcamento_fontes where remanejamento_id=v_rem and tipo='remanejamento_recebido' and fonte_origem_id=t_id('f111')), 100);
  perform t_igual('reserva liberada', (select reservado_usd from vw_orcamento_fontes_saldo where fonte_id=t_id('f111')), 0);
  perform t_igual('conferência do pedido', (select count(*) from vw_rem_conferencia where id=v_rem and destinos_usd=150 and recebido_usd=150 and cedido_usd=150), 1);
  perform t_igual('avisados: quem montou + 6 signatários', (select count(distinct usuario_id) from remanejamento_notificacoes where evento='efetivado'), 7);
  perform t_conferencia_ok('após remanejamento efetivado');
  -- encerrado não muda; assinatura imutável; pedido não se apaga
  perform t_erro(format('update remanejamentos set justificativa = %L where id = %L', 'x', v_rem), 'não muda');
  perform t_erro($q$update remanejamento_assinaturas set motivo = 'x'$q$, 'imutável');
  perform t_erro(format('delete from remanejamentos where id = %L', v_rem), 'não é apagado');
end $$;

\echo '· T12g devolvido ao solicitante, edição abre nova versão; recusa libera reserva'
do $$ declare v uuid; begin
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  v := fn_rem_salvar(null, jsonb_build_object('justificativa','Terceiro pedido, para devolver e recusar',
     'itens', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'valor_usd', -20),
                                jsonb_build_object('atividade_id', t_id('a217'), 'valor_usd', 20)),
     'alocacoes', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'fonte_id', t_id('f311'), 'valor_usd', 20))));
  perform t_ass('00000000-0000-0000-0000-0000000000c0', v, 'aprovar');
  perform t_ass('00000000-0000-0000-0000-0000000000e3', v, 'devolver', 'Rever o valor');
  perform t_igual('com o solicitante', (select etapa_atual from remanejamentos where id=v), 1);
  perform t_erro(format('select t_ass(%L, %L, %L, %L)', '00000000-0000-0000-0000-0000000000c0', v, 'devolver', 'x'), 'não devolve');
  perform fn_rem_salvar(v, jsonb_build_object('justificativa','Terceiro pedido, valor revisto para 25',
     'itens', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'valor_usd', -25),
                                jsonb_build_object('atividade_id', t_id('a217'), 'valor_usd', 25)),
     'alocacoes', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'fonte_id', t_id('f311'), 'valor_usd', 25))));
  perform t_igual('versão 2', (select versao from remanejamentos where id=v), 2);
  perform t_igual('assinaturas da v1 invalidadas',
    (select count(*) from remanejamento_assinaturas where remanejamento_id=v and versao=1 and decisao='aprovar' and invalidada_em is null), 0);
  perform t_ass('00000000-0000-0000-0000-0000000000c0', v, 'aprovar');
  perform t_igual('reservado', (select reservado_usd from vw_orcamento_fontes_saldo where fonte_id=t_id('f311')), 25);
  perform t_ass('00000000-0000-0000-0000-0000000000e3', v, 'aprovar');
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000f1', v, 'recusar'), 'motivo');
  perform t_ass('00000000-0000-0000-0000-0000000000f1', v, 'recusar', 'Sem respaldo da UNESCO');
  perform t_igual('recusa libera a reserva', (select reservado_usd from vw_orcamento_fontes_saldo where fonte_id=t_id('f311')), 0);
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000d1', v, 'aprovar'), 'nada a assinar');
end $$;

\echo '· T12h segregação: sem responsável independente, não envia'
do $$ declare v uuid; begin
  -- a única responsável da 3.1.1 passa a ser a UNESCO (que já ocupa cargo da cadeia)
  update atividade_responsaveis set ativo = false where usuario_id = '00000000-0000-0000-0000-0000000000e3';
  insert into atividade_responsaveis (atividade_id, usuario_id, papel) values (t_id('a311'), '00000000-0000-0000-0000-0000000000f1', 'responsavel');
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  v := fn_rem_salvar(null, jsonb_build_object('justificativa','Pedido sem liberação independente',
     'itens', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'valor_usd', -10),
                                jsonb_build_object('atividade_id', t_id('a217'), 'valor_usd', 10)),
     'alocacoes', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'fonte_id', t_id('f311'), 'valor_usd', 10))));
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000c0', v, 'aprovar'), 'SEM_SIGNATARIO');
  perform t_igual('continua rascunho', (select count(*) from remanejamentos where id=v and status='rascunho'), 1);
  perform t_ass('00000000-0000-0000-0000-0000000000c0', v, 'cancelar', 'Sem liberação independente');
  perform t_igual('cancelado', (select count(*) from remanejamentos where id=v and status='cancelado'), 1);
end $$;

\echo '· T12i senha: bloqueio após 5 erros'
do $$ begin
  perform fn_rem_registrar_tentativa('00000000-0000-0000-0000-0000000000d1', false) from generate_series(1,4);
  if fn_rem_senha_bloqueada_ate('00000000-0000-0000-0000-0000000000d1') is not null then raise exception 'FALHOU: 4 erros não bloqueiam'; end if;
  perform fn_rem_registrar_tentativa('00000000-0000-0000-0000-0000000000d1', false);
  if fn_rem_senha_bloqueada_ate('00000000-0000-0000-0000-0000000000d1') is null then raise exception 'FALHOU: 5 erros bloqueiam'; end if;
end $$;

\echo '· T12j acesso'
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000005a', true);
  perform t_erro(format('select fn_rem_assinar(%L, %L, %L, null, %L)', '00000000-0000-0000-0000-0000000000c0', t_id('rem2'), 'aprovar', 'x'), 'permission denied');
  perform t_erro($q$select fn_rem_registrar_tentativa('00000000-0000-0000-0000-0000000000d1', true)$q$, 'permission denied');
  perform t_erro($q$select * from remanejamento_notificacoes$q$, 'permission denied');
  perform t_erro($q$select * from rem_tentativas_senha$q$, 'permission denied');
  perform t_erro($q$insert into remanejamentos (numero, justificativa, criado_por) values ('X','x','00000000-0000-0000-0000-00000000005a')$q$, 'permission denied');
  if (select count(*) from vw_remanejamento_assinaturas) = 0 then raise exception 'FALHOU: leitura das assinaturas'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1', true);
  perform t_igual('visualizador não vê IP das assinaturas de outros', (select count(*) from remanejamento_assinaturas), 0);
  reset role;
  set local role anon;
  perform t_erro($q$select * from remanejamentos$q$, 'permission denied');
  perform t_erro($q$select fn_rem_hash(null)$q$, 'permission denied');
end $$;

do $$ begin
  if not exists (select 1 from notificacoes where tipo = 'remanejamento_efetivado') then
    raise exception 'FALHOU: sino não recebeu o aviso (rem_03g)';
  end if;
end $$;

\echo '✔ todos os testes do remanejamento (fases 0–3) passaram'
