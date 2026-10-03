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
\ir ../../migrations/20261003_rem_04_rascunho_sem_delete.sql

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

\echo '· T12k rascunho editado não apaga nada (ativo = false)'
do $$ declare v uuid; h1 text; begin
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  v := fn_rem_salvar(null, jsonb_build_object('justificativa','Rascunho para testar edição sem DELETE',
     'itens', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'valor_usd', -5),
                                jsonb_build_object('atividade_id', t_id('a217'), 'valor_usd', 5)),
     'alocacoes', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'fonte_id', t_id('f311'), 'valor_usd', 5))));
  h1 := fn_rem_hash(v);
  -- troca o destino 2.1.7 → 1.1.1
  perform fn_rem_salvar(v, jsonb_build_object('justificativa','Rascunho para testar edição sem DELETE',
     'itens', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'valor_usd', -5),
                                jsonb_build_object('atividade_id', t_id('a111'), 'valor_usd', 5)),
     'alocacoes', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'fonte_id', t_id('f311'), 'valor_usd', 5))));
  perform t_igual('itens guardados (nenhum apagado)', (select count(*) from remanejamento_itens where remanejamento_id = v), 3);
  perform t_igual('2.1.7 inativo', (select count(*) from remanejamento_itens where remanejamento_id = v and atividade_id = t_id('a217') and not ativo), 1);
  perform t_igual('ativos', (select count(*) from remanejamento_itens where remanejamento_id = v and ativo), 2);
  if fn_rem_hash(v) = h1 then raise exception 'FALHOU: hash deve mudar com o destino'; end if;
  -- volta ao destino original: reativa a mesma linha
  perform fn_rem_salvar(v, jsonb_build_object('justificativa','Rascunho para testar edição sem DELETE',
     'itens', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'valor_usd', -5),
                                jsonb_build_object('atividade_id', t_id('a217'), 'valor_usd', 5)),
     'alocacoes', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'fonte_id', t_id('f311'), 'valor_usd', 5))));
  perform t_igual('reativou sem duplicar', (select count(*) from remanejamento_itens where remanejamento_id = v), 3);
  if fn_rem_hash(v) <> h1 then raise exception 'FALHOU: hash ignora o que está inativo'; end if;
  perform fn_rem_validar(v);   -- inativos não entram na validação (soma fecha)
end $$;

do $$ begin
  if not exists (select 1 from notificacoes where tipo = 'remanejamento_efetivado') then
    raise exception 'FALHOU: sino não recebeu o aviso (rem_03g)';
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════════
-- Fase 5 — cobertura obrigatória do contrato
-- ════════════════════════════════════════════════════════════════════════
\echo '· aplicando rem_05 (duas vezes: idempotência)'
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.tdrs set valor_brl = 3000 where numero = '1.1.1-001';   -- CT-1 (2.500) cabe no TDR
\ir ../../migrations/20261003_rem_05a_status_contrato.sql
\ir ../../migrations/20261003_rem_05_cobertura_contrato.sql
\ir ../../migrations/20261003_rem_05b_cobertura_pedido.sql
\ir ../../migrations/20261003_rem_05a_status_contrato.sql
\ir ../../migrations/20261003_rem_05_cobertura_contrato.sql
\ir ../../migrations/20261003_rem_05b_cobertura_pedido.sql

create function public.t_ptax() returns numeric language sql as $$ select ptax_venda from fn_cotacao_usd(null) $$;
create function public.t_livre(c text) returns numeric language sql as
  $$ select fn_cob_livre((select id from atividades where codigo = c)) $$;
create function public.t_status(n text) returns text language sql as
  $$ select status::text from contratos where numero = n $$;
create function public.t_ativ(c text, v numeric) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000005a', true);
  insert into atividades (resultado_id, codigo, orcamento_usd)
  values ('10000000-0000-0000-0000-000000000001', c, v) returning id into v_id;
  return v_id;
end $$;
create function public.t_credito(c text, v numeric) returns void language plpgsql as $$
begin
  insert into contrato_encerramentos (contrato_id, atividade_id, tipo, valor_liberado_usd, motivo)
  values ((select id from contratos where numero = 'CT-1'), (select id from atividades where codigo = c),
          'encerramento_contrato', v, 'crédito de teste');
end $$;

\echo '· T13a carga inicial: nada travado, conferência fecha'
do $$ begin
  perform t_igual('sem excedente na carga', (select count(*) from contrato_coberturas), 0);
  perform t_igual('nenhum contrato travado', (select count(*) from contratos where status = 'aguardando_cobertura'), 0);
  perform t_conferencia_ok('após rem_05');
end $$;

\echo '· T13b TDR compromete: só nasce se couber no saldo livre'
do $$ declare a uuid; begin
  a := t_ativ('9.9.1', 1000);
  insert into tdrs (id, atividade_id, numero, status, valor_brl, valor_usd)
  values ('d0000000-0000-0000-0000-000000000991', a, '9.9.1-001', 'aprovado', 500 * t_ptax(), 500);
  perform t_igual('livre após TDR', t_livre('9.9.1'), 500);
  perform t_erro(format($q$insert into tdrs (atividade_id, numero, status, valor_usd) values (%L, '9.9.1-002', 'rascunho', 600)$q$, a),
                 'SALDO_INSUFICIENTE');
  perform t_erro($q$update tdrs set valor_usd = 1001 where numero = '9.9.1-001'$q$, 'SALDO_INSUFICIENTE');
  update tdrs set valor_usd = 1000, valor_brl = 1000 * t_ptax() where numero = '9.9.1-001';   -- cabe exatamente
  update tdrs set valor_usd = 500, valor_brl = 500 * t_ptax() where numero = '9.9.1-001';     -- reduzir sempre pode
end $$;

\echo '· T13c contrato dentro do TDR não pede nada; aditivo que cabe no saldo também não'
do $$ declare a uuid := (select id from atividades where codigo = '9.9.1'); begin
  insert into contratos (numero, tdr_id, atividade_id, valor_total_brl)
  values ('CT-991', 'd0000000-0000-0000-0000-000000000991', a, 500 * t_ptax());
  perform t_igual('sem lançamento', (select count(*) from contrato_coberturas), 0);
  perform t_igual('livre igual', t_livre('9.9.1'), 500);
  update contratos set valor_total_brl = 600 * t_ptax() where numero = 'CT-991';   -- aditivo de US$ 100
  perform t_igual('excedente congelado', (select delta_usd from contrato_coberturas where evento = 'aditivo'), 100);
  perform t_igual('livre após aditivo', t_livre('9.9.1'), 400);
  if t_status('CT-991') <> 'vigente' then raise exception 'FALHOU: aditivo que cabe não trava'; end if;
end $$;

\echo '· T13d contrato acima do saldo fica aguardando cobertura e totalmente travado'
do $$ declare a uuid := (select id from atividades where codigo = '9.9.1'); begin
  insert into contratos (numero, tdr_id, atividade_id, valor_total_brl)
  values ('CT-992', 'd0000000-0000-0000-0000-000000000991', a, 450 * t_ptax());
  if t_status('CT-992') <> 'aguardando_cobertura' then raise exception 'FALHOU: deveria travar (%)', t_status('CT-992'); end if;
  perform t_igual('déficit = só o que falta', (select deficit_usd from contrato_coberturas where evento = 'cadastro'), 50);
  perform t_igual('piso 0 (atividade não era negativa)', (select piso_usd from contrato_coberturas where evento = 'cadastro'), 0);
  perform t_igual('livre negativo', t_livre('9.9.1'), -50);
  perform t_igual('view: aguardando', (select contratos_aguardando from vw_orcamento_atividade where codigo = '9.9.1'), 1);
  perform t_erro($q$insert into contratos_produtos (contrato_id, descricao) values ((select id from contratos where numero='CT-992'), 'P1')$q$,
                 'CONTRATO_AGUARDANDO_COBERTURA');
  perform t_erro($q$insert into execucao_financeira (atividade_id, contrato_id, valor_brl, valor_usd)
                    values ((select id from atividades where codigo='9.9.1'), (select id from contratos where numero='CT-992'), 10, 2)$q$,
                 'CONTRATO_AGUARDANDO_COBERTURA');
  perform t_erro($q$update contratos set status = 'vigente' where numero = 'CT-992'$q$, 'CONTRATO_AGUARDANDO_COBERTURA');
  perform t_erro($q$update contratos set contrato_assinado_url = 'x' where numero = 'CT-992'$q$, 'CONTRATO_AGUARDANDO_COBERTURA');
  perform t_erro($q$update contratos set status = 'aguardando_cobertura' where numero = 'CT-991'$q$, 'definido pelo sistema');
  perform t_erro($q$update contrato_coberturas set deficit_usd = 0$q$, 'imutável');
  perform t_conferencia_ok('com contrato travado');
end $$;

\echo '· T13e reduzir não basta; crédito de US$ 50 libera'
do $$ begin
  update contratos set valor_total_brl = 420 * t_ptax() where numero = 'CT-992';   -- −30
  if t_status('CT-992') <> 'aguardando_cobertura' then raise exception 'FALHOU: ainda falta US$ 20'; end if;
  perform t_igual('redução proporcional', (select delta_usd from contrato_coberturas where evento = 'reducao'), -30);
  perform t_credito('9.9.1', 19.99);
  if t_status('CT-992') <> 'aguardando_cobertura' then raise exception 'FALHOU: faltava 1 centavo'; end if;
  perform t_credito('9.9.1', 0.01);
  if t_status('CT-992') <> 'vigente' then raise exception 'FALHOU: crédito deveria liberar (%)', t_status('CT-992'); end if;
  perform t_igual('pendência resolvida', (select count(*) from contrato_coberturas where situacao = 'aguardando'), 0);
  insert into contratos_produtos (contrato_id, descricao) values ((select id from contratos where numero='CT-992'), 'P1');
  perform t_conferencia_ok('após liberação');
end $$;

\echo '· T13f negativo antigo não é regularizado: contrato espera só o que acrescentou'
do $$ declare a uuid; begin
  a := t_ativ('9.9.2', 100);
  alter table tdrs disable trigger trg_tdr_saldo;
  insert into tdrs (id, atividade_id, numero, status, valor_brl, valor_usd)
  values ('d0000000-0000-0000-0000-000000000992', a, '9.9.2-001', 'aprovado', 300 * t_ptax(), 300);
  alter table tdrs enable trigger trg_tdr_saldo;
  perform t_igual('já negativo', t_livre('9.9.2'), -200);
  insert into contratos (numero, tdr_id, atividade_id, valor_total_brl)
  values ('CT-993', 'd0000000-0000-0000-0000-000000000992', a, 350 * t_ptax());
  perform t_igual('déficit do contrato', (select deficit_usd from contrato_coberturas c join contratos k on k.id = c.contrato_id where k.numero = 'CT-993'), 50);
  perform t_igual('piso = negativo antigo', (select piso_usd from contrato_coberturas c join contratos k on k.id = c.contrato_id where k.numero = 'CT-993'), -200);
  perform t_credito('9.9.2', 50);
  if t_status('CT-993') <> 'vigente' then raise exception 'FALHOU: cobriu o que acrescentou'; end if;
  perform t_igual('negativo antigo continua', t_livre('9.9.2'), -200);
end $$;

\echo '· T13g fila: dois contratos, liberação em ordem de chegada'
do $$ declare a uuid; begin
  a := t_ativ('9.9.3', 100);
  insert into tdrs (id, atividade_id, numero, status, valor_brl, valor_usd)
  values ('d0000000-0000-0000-0000-000000000993', a, '9.9.3-001', 'aprovado', 100 * t_ptax(), 100);
  insert into contratos (numero, tdr_id, atividade_id, valor_total_brl)
  values ('CT-994', 'd0000000-0000-0000-0000-000000000993', a, 130 * t_ptax());
  insert into contratos (numero, tdr_id, atividade_id, valor_total_brl)
  values ('CT-995', 'd0000000-0000-0000-0000-000000000993', a, 20 * t_ptax());
  if t_status('CT-994') <> 'aguardando_cobertura' or t_status('CT-995') <> 'aguardando_cobertura' then
    raise exception 'FALHOU: os dois deveriam travar';
  end if;
  perform t_igual('piso herdado', (select piso_usd from contrato_coberturas c join contratos k on k.id = c.contrato_id where k.numero = 'CT-995'), 0);
  perform t_credito('9.9.3', 20);   -- cobre o tamanho do 2º, mas a fila é do 1º
  if t_status('CT-994') <> 'aguardando_cobertura' or t_status('CT-995') <> 'aguardando_cobertura' then
    raise exception 'FALHOU: ordem de chegada';
  end if;
  perform t_credito('9.9.3', 10);
  if t_status('CT-994') <> 'vigente' or t_status('CT-995') <> 'aguardando_cobertura' then
    raise exception 'FALHOU: 1º liberado, 2º espera (% / %)', t_status('CT-994'), t_status('CT-995');
  end if;
  perform t_credito('9.9.3', 20);
  if t_status('CT-995') <> 'vigente' then raise exception 'FALHOU: 2º liberado'; end if;
  perform t_erro($q$update tdrs set status = 'cancelado' where numero = '9.9.3-001'$q$, 'TDR_COM_CONTRATO');
end $$;

\echo '· T13h pedido de cobertura: só para contrato travado; cancelar o contrato cancela o pedido'
do $$ declare a uuid; v uuid; begin
  a := t_ativ('9.9.4', 100);
  insert into tdrs (id, atividade_id, numero, status, valor_brl, valor_usd)
  values ('d0000000-0000-0000-0000-000000000994', a, '9.9.4-001', 'aprovado', 100 * t_ptax(), 100);
  insert into contratos (id, numero, tdr_id, atividade_id, valor_total_brl)
  values ('c0000000-0000-0000-0000-000000000996', 'CT-996', 'd0000000-0000-0000-0000-000000000994', a, 140 * t_ptax());
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  perform t_erro(format($q$select fn_rem_salvar(null, '{"tipo":"cobertura_contrato","contrato_id":"%s","justificativa":"x"}'::jsonb)$q$,
                        (select id from contratos where numero = 'CT-991')), 'não está aguardando cobertura');
  v := fn_rem_salvar(null, jsonb_build_object('tipo','cobertura_contrato','contrato_id','c0000000-0000-0000-0000-000000000996',
       'justificativa','Cobertura do contrato CT-996 acima do TDR',
       'itens', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'valor_usd', -40),
                                  jsonb_build_object('atividade_id', t_id('a111'), 'valor_usd', 40)),
       'alocacoes', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'fonte_id', t_id('f311'), 'valor_usd', 40))));
  perform t_erro(format('select fn_rem_validar(%L)', v), 'destino a atividade do contrato');
  perform fn_rem_salvar(v, jsonb_build_object('justificativa','Cobertura do contrato CT-996 acima do TDR',
       'itens', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'valor_usd', -40),
                                  jsonb_build_object('atividade_id', a, 'valor_usd', 40)),
       'alocacoes', jsonb_build_array(jsonb_build_object('atividade_id', t_id('a311'), 'fonte_id', t_id('f311'), 'valor_usd', 40))));
  perform fn_rem_validar(v);
  update contratos set status = 'cancelado' where numero = 'CT-996';
  if (select status from remanejamentos where id = v) <> 'cancelado' then
    raise exception 'FALHOU: pedido de cobertura deveria ser cancelado junto';
  end if;
  perform t_igual('excedente saiu do débito', (select contratos_excedente_usd from vw_orcamento_atividade where codigo = '9.9.4'), 0);
  perform t_igual('pendência cancelada', (select count(*) from contrato_coberturas c join contratos k on k.id = c.contrato_id
                                           where k.numero = 'CT-996' and situacao = 'cancelado'), 1);
  perform t_erro($q$update contratos set status = 'vigente' where numero = 'CT-996'$q$, 'CONTRATO_CANCELADO');
  perform t_conferencia_ok('após cancelamento');
end $$;

\echo '· T13i contrato sem TDR: o valor inteiro é excedente'
do $$ declare a uuid; begin
  a := t_ativ('9.9.5', 100);
  insert into contratos (numero, atividade_id, valor_total_brl) values ('CT-997', a, 80 * t_ptax());
  perform t_igual('livre', t_livre('9.9.5'), 20);
  insert into execucao_financeira (atividade_id, contrato_id, valor_brl, valor_usd, situacao)
  values (a, (select id from contratos where numero = 'CT-997'), 50 * t_ptax(), 50, 'pago');
  perform t_igual('pagamento não conta duas vezes', t_livre('9.9.5'), 20);
  perform t_erro($q$insert into contratos (numero, valor_total_brl) values ('CT-998', 10)$q$, 'CONTRATO_SEM_ATIVIDADE');
  perform t_conferencia_ok('final da fase 5');
end $$;


-- ════════════════════════════════════════════════════════════════════════
-- Fase 4b — estorno de remanejamento
-- ════════════════════════════════════════════════════════════════════════
\echo '· aplicando rem_06 (duas vezes)'
reset role;
\ir ../../migrations/20261003_rem_06_estorno.sql
\ir ../../migrations/20261003_rem_06_estorno.sql
insert into public.usuarios (id, nome_completo, email, perfil) values
 ('00000000-0000-0000-0000-0000000000e7','Resp 2.1.7','e7@x','tecnico');
insert into public.atividade_responsaveis (atividade_id, usuario_id, papel)
select id, '00000000-0000-0000-0000-0000000000e7'::uuid, 'responsavel' from atividades where codigo = '2.1.7';

\echo '· T14a estorno nasce como espelho do original'
do $$ declare v uuid; v2 uuid; begin
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  perform t_erro(format('select fn_rem_criar_estorno(%L, %L)', (select id from remanejamentos where status = 'recusado' limit 1), 'x'),
                 'só se estorna remanejamento efetivado');
  v := fn_rem_criar_estorno(t_id('rem1'), 'Estorno do REM: destino desistiu da ação, recurso volta às origens');
  insert into t_ids values ('est1', v);
  v2 := fn_rem_criar_estorno(t_id('rem1'), 'de novo');
  if v2 <> v then raise exception 'FALHOU: estorno deve ser idempotente'; end if;
  perform t_igual('itens invertidos', (select count(*) from remanejamento_itens i where i.remanejamento_id = v and i.ativo
     and exists (select 1 from remanejamento_itens o where o.remanejamento_id = t_id('rem1') and o.ativo
                  and o.atividade_id = i.atividade_id and o.valor_usd = -i.valor_usd)), 3);
  perform t_igual('aloca os 2 recebidos inteiros', (select sum(valor_usd) from remanejamento_alocacoes where remanejamento_id = v and ativo), 150);
  perform fn_rem_validar(v);
  perform t_erro(format($q$select fn_rem_salvar(%L, '{"itens":[]}'::jsonb)$q$, v), 'só a justificativa');
  perform t_erro(format('select fn_rem_criar_estorno(%L, %L)', v, 'x'), 'já é um estorno');
end $$;

\echo '· T14b destino comprometido não estorna; liberado, estorna'
do $$ declare v uuid := t_id('est1'); v_tdr uuid; begin
  reset role;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c0', false);
  insert into tdrs (atividade_id, numero, status, valor_usd)
  values (t_id('a217'), '2.1.7-099', 'aprovado', fn_cob_livre(t_id('a217'))) returning id into v_tdr;
  perform t_erro(format('select t_ass(%L, %L, %L)', '00000000-0000-0000-0000-0000000000c0', v, 'aprovar'), 'SALDO_INSUFICIENTE');
  update tdrs set status = 'cancelado' where id = v_tdr;
  perform t_ass('00000000-0000-0000-0000-0000000000c0', v, 'aprovar');
  perform t_igual('reserva no recebido do destino',
    (select sum(reservado_usd) from vw_orcamento_fontes_saldo where tipo = 'remanejamento_recebido' and remanejamento_id = t_id('rem1')), 150);
  perform t_igual('liberação é do responsável de quem devolve',
    (select count(*) from remanejamento_etapas where remanejamento_id = v and papel = 'liberacao_origem' and atividade_id = t_id('a217')), 1);
  -- com o estorno tramitando, o destino não usa o dinheiro reservado
  perform t_erro(format($q$insert into tdrs (atividade_id, numero, status, valor_usd) values (%L, '2.1.7-098', 'aprovado', %s)$q$,
                        t_id('a217'), fn_cob_livre(t_id('a217')) + 1), 'SALDO_INSUFICIENTE');
end $$;

\echo '· T14c cadeia completa: lançamentos espelhados, original estornado'
do $$ declare v uuid := t_id('est1'); o111 numeric; o311 numeric; o217 numeric; begin
  o111 := (select orcamento_usd from atividades where id = t_id('a111'));
  o311 := (select orcamento_usd from atividades where id = t_id('a311'));
  o217 := (select orcamento_usd from atividades where id = t_id('a217'));
  perform t_ass('00000000-0000-0000-0000-0000000000e7', v, 'aprovar');
  perform t_ass('00000000-0000-0000-0000-0000000000f1', v, 'aprovar');
  perform t_ass('00000000-0000-0000-0000-0000000000d1', v, 'aprovar');
  perform t_ass('00000000-0000-0000-0000-0000000000a1', v, 'aprovar');
  if (select status from remanejamentos where id = v) <> 'efetivado' then raise exception 'FALHOU: estorno efetivado'; end if;
  if (select status from remanejamentos where id = t_id('rem1')) <> 'estornado' then raise exception 'FALHOU: original estornado'; end if;
  perform t_igual('1.1.1 recebe de volta', (select orcamento_usd from atividades where id = t_id('a111')), o111 + 100);
  perform t_igual('3.1.1 recebe de volta', (select orcamento_usd from atividades where id = t_id('a311')), o311 + 50);
  perform t_igual('2.1.7 devolve', (select orcamento_usd from atividades where id = t_id('a217')), o217 - 150);
  perform t_igual('volta à MESMA fonte (dotação da 1.1.1)',
    (select liquido_usd from vw_orcamento_fontes_saldo where fonte_id = t_id('f111')),
    (select valor_usd from orcamento_fontes where id = t_id('f111'))
      + coalesce((select sum(valor_usd) from orcamento_fontes where ajusta_fonte_id = t_id('f111')
                   and remanejamento_id is distinct from t_id('rem1') and remanejamento_id is distinct from v), 0));
  perform t_igual('4 lançamentos espelhados', (select count(*) from orcamento_fontes where remanejamento_id = v and estorno_de is not null), 4);
  perform t_igual('recebidos zerados', (select sum(liquido_usd) from vw_orcamento_fontes_saldo
                                         where tipo = 'remanejamento_recebido' and remanejamento_id = t_id('rem1')), 0);
  perform t_igual('conferência do estorno', (select count(*) from vw_rem_conferencia
                                              where id = v and destinos_usd = 150 and recebido_usd = 150 and cedido_usd = 150), 1);
  perform t_igual('original segue na conferência', (select count(*) from vw_rem_conferencia where id = t_id('rem1')), 1);
  perform t_conferencia_ok('após estorno');
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  perform t_erro(format('select fn_rem_criar_estorno(%L, %L)', t_id('rem1'), 'x'), 'está estornado');
  perform t_erro(format($q$insert into orcamento_fontes (atividade_id, tipo, valor_usd, ajusta_fonte_id, estorno_de, descricao)
                         select atividade_id, tipo, -valor_usd, coalesce(ajusta_fonte_id, id), id, 'x'
                           from orcamento_fontes where remanejamento_id = %L limit 1$q$, t_id('rem1')), 'duplicate key');
end $$;


-- ════════════════════════════════════════════════════════════════════════
-- Fase 7 — extrato e auditoria
-- ════════════════════════════════════════════════════════════════════════
\echo '· aplicando rem_07'
reset role;
\ir ../../migrations/20261003_rem_07_extrato_auditoria.sql

\echo '· T15a extrato fecha com o saldo em todas as atividades'
do $$ declare r record; e jsonb; begin
  perform t_login('00000000-0000-0000-0000-0000000000b1');   -- visualizador também lê
  for r in select atividade_id, codigo from vw_orcamento_atividade loop
    e := fn_orcamento_extrato(r.atividade_id);
    if not (e->>'fecha')::boolean then
      raise exception 'FALHOU: extrato de % não fecha (créditos % − débitos % ≠ saldo %)', r.codigo,
        e->>'total_creditos_usd', e->>'total_debitos_usd', e->'resumo'->>'saldo_usd';
    end if;
  end loop;
  e := fn_orcamento_extrato(t_id('a111'));
  if jsonb_array_length(e->'remanejamentos') < 2 then raise exception 'FALHOU: extrato lista o remanejamento e o estorno'; end if;
  if not exists (select 1 from jsonb_array_elements(e->'creditos') c where c->>'remanejamento' is not null and c->>'estorno_de' is not null) then
    raise exception 'FALHOU: extrato mostra o lançamento de estorno';
  end if;
  if (select count(*) from jsonb_array_elements(fn_orcamento_extrato(t_id('a217'))->'debitos') d where d->>'tipo' = 'execucao_direta') <> 1 then
    raise exception 'FALHOU: execução direta da 2.1.7 no extrato';
  end if;
end $$;

\echo '· T15b auditoria do orçamento'
do $$ declare n int; begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  select count(*) into n from fn_auditoria_orcamento() where severidade = 'critico';
  perform t_igual('sem achado crítico com razão íntegro', n, 0);
  if not exists (select 1 from fn_auditoria_orcamento() where titulo like '%saldo livre negativo%') then
    raise exception 'FALHOU: déficit (9.9.2) deveria aparecer como info';
  end if;
  set local role authenticated;
  perform t_erro('select * from fn_auditoria_orcamento()', 'permission denied');
end $$;

\echo '✔ todos os testes do remanejamento (fases 0–7) passaram'
