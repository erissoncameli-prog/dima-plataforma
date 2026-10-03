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
\echo '· reaplicando (idempotência)'
\ir ../../migrations/20261003_rem_00_contencao.sql
\ir ../../migrations/20261003_rem_01_razao_fontes.sql

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

\echo '✔ todos os testes do remanejamento (fases 0–1) passaram'
