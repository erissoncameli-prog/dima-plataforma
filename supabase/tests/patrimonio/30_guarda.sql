-- Testes do Patrimônio · Fase 2 (termo com aceite, empréstimo, devolução, local, manutenção)
-- Continua do estado deixado por 10_testes.sql.
\set ON_ERROR_STOP 1

create or replace function pg_temp.como(p_uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', case when p_uid = '' then '' else '00000000-0000-0000-0000-0000000000' || p_uid end, false); end $$;
create or replace function pg_temp.deve_falhar(p_sql text, p_trecho text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(p_trecho in sqlerrm) = 0 then raise exception 'esperava erro com "%", veio: %', p_trecho, sqlerrm; end if;
    return;
  end;
  raise exception 'esperava erro com "%", mas passou: %', p_trecho, p_sql;
end $$;
create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin if p_cond is distinct from true then raise exception 'FALHOU: %', p_msg; end if; end $$;
create or replace function pg_temp.bem(p_serie text) returns uuid language sql as $$ select id from pat_bens where numero_serie = p_serie $$;
create or replace function pg_temp.sede() returns uuid language sql as $$ select id from pat_locais where nome = 'Sede da SEMA/AC' $$;
create or replace function pg_temp.dep() returns uuid language sql as $$ select id from pat_locais where nome = 'Depósito do projeto' $$;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- ── 1. Criar termo ──────────────────────────────────────────────────────────
select pg_temp.como('b1');
select pg_temp.deve_falhar(format($q$ select fn_pat_termo_criar(jsonb_build_object('responsavel_id','00000000-0000-0000-0000-0000000000b1',
  'local_id',%L,'bens',jsonb_build_array(%L))) $q$, pg_temp.sede(), pg_temp.bem('CX-2')), 'PAT_SEM_PERMISSAO');

select pg_temp.como('d1');
do $$
declare r jsonb;
begin
  r := fn_pat_termo_criar(jsonb_build_object('tipo','responsabilidade','responsavel_id','00000000-0000-0000-0000-0000000000b1',
       'local_id', pg_temp.sede(), 'finalidade', 'Uso nos eventos da APA', 'bens', jsonb_build_array(pg_temp.bem('CX-2'), pg_temp.bem('MS-1'))));
  insert into ctx values ('t1', (r->>'termo_id')::uuid);
  perform pg_temp.ok((r->>'bens')::int = 2 and r->>'numero' like 'TR-%-0001', 'termo criado: ' || r::text);
  perform pg_temp.ok((select hash <> '-' and situacao = 'aguardando_aceite' from pat_termos where id = (r->>'termo_id')::uuid), 'hash gravado');
  perform pg_temp.ok((select count(*) from tarefas t join tarefa_participantes p on p.tarefa_id = t.id
                       where t.entidade_tipo = 'pat_termo' and t.entidade_id = (r->>'termo_id')::uuid
                         and p.usuario_id = '00000000-0000-0000-0000-0000000000b1' and t.status = 'a_fazer') = 1, 'tarefa de aceite');
  -- bem em termo pendente não se movimenta
  perform pg_temp.deve_falhar(format($q$ select fn_pat_termo_criar(jsonb_build_object('responsavel_id','00000000-0000-0000-0000-0000000000f1',
    'local_id',%L,'bens',jsonb_build_array(%L))) $q$, pg_temp.sede(), pg_temp.bem('CX-2')), 'PAT_TERMO_PENDENTE');
  perform pg_temp.deve_falhar(format('select fn_pat_mudar_local(array[%L]::uuid[], %L, %L)', pg_temp.bem('CX-2'), pg_temp.dep(), 'Guardar no depósito'), 'PAT_TERMO_PENDENTE');
  perform pg_temp.deve_falhar(format('select fn_pat_manutencao_saida(%L, %L, %L, null)', pg_temp.bem('CX-2'), 'Assistência X', 'Chiado no alto-falante'), 'PAT_TERMO_PENDENTE');
  -- empréstimo sem prazo válido
  perform pg_temp.deve_falhar(format($q$ select fn_pat_termo_criar(jsonb_build_object('tipo','emprestimo','responsavel_id','00000000-0000-0000-0000-0000000000f1',
    'local_id',%L,'devolver_ate',current_date - 1,'bens',jsonb_build_array(%L))) $q$, pg_temp.sede(), pg_temp.bem('MIC-1')), 'data de devolução');
  -- responsável inativo / inexistente
  perform pg_temp.deve_falhar(format($q$ select fn_pat_termo_criar(jsonb_build_object('responsavel_id','00000000-0000-0000-0000-000000000099',
    'local_id',%L,'bens',jsonb_build_array(%L))) $q$, pg_temp.sede(), pg_temp.bem('MIC-1')), 'acesso ativo');
end $$;

-- ── 2. Leitura do termo ─────────────────────────────────────────────────────
set role authenticated;
select pg_temp.como('b1');
select pg_temp.ok((select count(*) from pat_termos) = 1, 'indicado vê o termo');
select pg_temp.ok(jsonb_array_length(fn_pat_termo_detalhe((select v from ctx where k = 't1'))->'bens') = 2, 'detalhe para o indicado');
select pg_temp.como('e1');
select pg_temp.ok(fn_pat_termo_detalhe((select v from ctx where k = 't1')) is null, 'consultor alheio sem detalhe');
select pg_temp.ok((select count(*) from pat_termos) = 0, 'consultor alheio sem termo');
select pg_temp.deve_falhar($q$ select fn_pat_termo_decidir('00000000-0000-0000-0000-0000000000b1', (select v from ctx where k = 't1'), 'aceitar', null, 'x') $q$, 'permission denied');
select pg_temp.deve_falhar($q$ update pat_termos set situacao = 'aceito' $q$, 'permission denied');
reset role;

-- ── 3. Aceite com hash ──────────────────────────────────────────────────────
reset request.jwt.claim.sub;
do $$
declare v_t uuid := (select v from ctx where k = 't1'); v_h text := fn_pat_termo_hash((select v from ctx where k = 't1')); r jsonb;
begin
  perform pg_temp.deve_falhar(format('select fn_pat_termo_decidir(%L, %L, %L, null, %L)', '00000000-0000-0000-0000-0000000000f1', v_t, 'aceitar', v_h), 'só a pessoa indicada');
  perform pg_temp.deve_falhar(format('select fn_pat_termo_decidir(%L, %L, %L, null, %L)', '00000000-0000-0000-0000-0000000000b1', v_t, 'aceitar', 'outro'), 'DOCUMENTO_ALTERADO');
  -- a condição de um bem muda depois do termo: o hash antigo não vale mais
  perform pg_temp.como('d1');
  perform fn_pat_registrar_condicao(pg_temp.bem('CX-2'), 'bom', 'Arranhão na lateral da caixa');
  reset request.jwt.claim.sub;
  perform pg_temp.deve_falhar(format('select fn_pat_termo_decidir(%L, %L, %L, null, %L)', '00000000-0000-0000-0000-0000000000b1', v_t, 'aceitar', v_h), 'DOCUMENTO_ALTERADO');
  perform pg_temp.deve_falhar($q$ update pat_termos set finalidade = 'x' $q$, 'PAT_TERMO_PROTEGIDO');
  r := fn_pat_termo_decidir('00000000-0000-0000-0000-0000000000b1', v_t, 'aceitar', null, fn_pat_termo_hash(v_t), '10.0.0.1', 'teste');
  perform pg_temp.ok(r->>'situacao' = 'aceito' and (r->>'bens')::int = 2, 'aceito ' || r::text);
  perform pg_temp.ok((select count(*) from pat_bens where responsavel_id = '00000000-0000-0000-0000-0000000000b1' and situacao = 'em_uso') = 2, 'bens com o responsável');
  perform pg_temp.ok((select count(*) from pat_eventos where tipo = 'distribuicao') = 2, 'eventos de entrega');
  perform pg_temp.ok((select hash_aceito is not null and decisao_ip = '10.0.0.1' from pat_termos where id = v_t), 'aceite registrado');
  perform pg_temp.ok((select t.status from pat_termos x join tarefas t on t.id = x.tarefa_aceite_id where x.id = v_t) = 'concluida', 'tarefa de aceite concluída');
  perform pg_temp.deve_falhar(format('select fn_pat_termo_decidir(%L, %L, %L, null, %L)', '00000000-0000-0000-0000-0000000000b1', v_t, 'aceitar', 'x'), 'PAT_TERMO_ENCERRADO');
end $$;

-- ── 4. Transferência entre responsáveis e "Meus bens" do consultor ──────────
select pg_temp.como('d1');
do $$
declare r jsonb; v_t uuid;
begin
  r := fn_pat_termo_criar(jsonb_build_object('tipo','emprestimo','responsavel_id','00000000-0000-0000-0000-0000000000e1',
       'local_id', pg_temp.dep(), 'devolver_ate', current_date + 10, 'finalidade', 'Oficina na comunidade',
       'bens', jsonb_build_array((select id from pat_bens where descricao = 'Barraca 2x2'))));
  v_t := (r->>'termo_id')::uuid; insert into ctx values ('t2', v_t);
  perform set_config('request.jwt.claim.sub', '', false);
  r := fn_pat_termo_decidir('00000000-0000-0000-0000-0000000000e1', v_t, 'aceitar', null, fn_pat_termo_hash(v_t));
  perform pg_temp.ok((select situacao = 'emprestado' and dt_inicio_uso = current_date from pat_bens where descricao = 'Barraca 2x2'), 'emprestado e começou a depreciar');
  perform pg_temp.ok((select t.dt_prazo = current_date + 10 and t.status = 'a_fazer' from pat_termos x join tarefas t on t.id = x.tarefa_devolucao_id where x.id = v_t), 'tarefa de devolução com o prazo');
  -- transferência: CX-2 passa do técnico ao financeiro
  perform pg_temp.como('d1');
  r := fn_pat_termo_criar(jsonb_build_object('responsavel_id','00000000-0000-0000-0000-0000000000f1', 'local_id', pg_temp.sede(),
       'bens', jsonb_build_array(pg_temp.bem('CX-2'))));
  perform set_config('request.jwt.claim.sub', '', false);
  perform fn_pat_termo_decidir('00000000-0000-0000-0000-0000000000f1', (r->>'termo_id')::uuid, 'aceitar', null, fn_pat_termo_hash((r->>'termo_id')::uuid));
  perform pg_temp.ok((select tipo from pat_eventos where bem_id = pg_temp.bem('CX-2') order by registrado_em desc limit 1) = 'transferencia_interna', 'transferência');
  perform pg_temp.ok((select responsavel_id from pat_bens where id = pg_temp.bem('CX-2')) = '00000000-0000-0000-0000-0000000000f1', 'novo responsável');
end $$;
set role authenticated;
select pg_temp.como('e1');
select pg_temp.ok((select count(*) from vw_pat_bens) = 1, 'consultor vê só o bem que guarda');
select pg_temp.ok((select devolver_ate from vw_pat_bens) = current_date + 10 and (select valor_aquisicao_brl from vw_pat_bens) is null, 'prazo sim, valor não');
select pg_temp.como('d1');
select pg_temp.ok((select termo_vigente from vw_pat_bens where numero_serie = 'MS-1') like 'TR-%', 'termo vigente na view');
reset role;

-- ── 5. Recusa e cancelamento ────────────────────────────────────────────────
select pg_temp.como('d1');
do $$
declare r jsonb; v_t uuid;
begin
  r := fn_pat_termo_criar(jsonb_build_object('responsavel_id','00000000-0000-0000-0000-0000000000b1', 'local_id', pg_temp.sede(),
       'bens', jsonb_build_array(pg_temp.bem('MIC-1'))));
  v_t := (r->>'termo_id')::uuid;
  perform set_config('request.jwt.claim.sub', '', false);
  perform pg_temp.deve_falhar(format('select fn_pat_termo_decidir(%L, %L, %L, %L, %L)', '00000000-0000-0000-0000-0000000000b1', v_t, 'recusar', 'curto', fn_pat_termo_hash(v_t)), '10 caracteres');
  r := fn_pat_termo_decidir('00000000-0000-0000-0000-0000000000b1', v_t, 'recusar', 'Não recebi este microfone', fn_pat_termo_hash(v_t));
  perform pg_temp.ok(r->>'situacao' = 'recusado', 'recusado');
  perform pg_temp.ok((select responsavel_id is null from pat_bens where id = pg_temp.bem('MIC-1')), 'bem não mudou');
  perform pg_temp.ok((select count(*) from tarefas t join tarefa_participantes p on p.tarefa_id = t.id
                       where t.titulo like '%recusado%' and p.usuario_id = '00000000-0000-0000-0000-0000000000d1') = 1, 'gestor avisado por tarefa');
  -- cancelamento
  perform pg_temp.como('d1');
  r := fn_pat_termo_criar(jsonb_build_object('responsavel_id','00000000-0000-0000-0000-0000000000b1', 'local_id', pg_temp.sede(),
       'bens', jsonb_build_array(pg_temp.bem('MIC-1'))));
  perform fn_pat_termo_cancelar((r->>'termo_id')::uuid, 'Pessoa errada no termo');
  perform pg_temp.ok((select situacao from pat_termos where id = (r->>'termo_id')::uuid) = 'cancelado', 'cancelado');
  perform pg_temp.ok((select t.status from pat_termos x join tarefas t on t.id = x.tarefa_aceite_id where x.id = (r->>'termo_id')::uuid) = 'cancelada', 'tarefa cancelada');
  perform pg_temp.deve_falhar(format('select fn_pat_termo_cancelar(%L, %L)', r->>'termo_id', 'De novo o cancelamento'), 'PAT_TERMO_ENCERRADO');
end $$;

-- ── 6. Devolução ────────────────────────────────────────────────────────────
do $$
declare r jsonb; v_t uuid := (select v from ctx where k = 't2');
begin
  perform pg_temp.deve_falhar(format($q$ select fn_pat_devolver(jsonb_build_object('local_id',%L,'itens',jsonb_build_array(jsonb_build_object('bem_id',%L)))) $q$,
    pg_temp.dep(), pg_temp.bem('MIC-1')), 'não está com ninguém');
  r := fn_pat_devolver(jsonb_build_object('local_id', pg_temp.dep(), 'observacao', 'Voltou da oficina com uma estaca a menos',
       'itens', jsonb_build_array(jsonb_build_object('bem_id', (select id from pat_bens where descricao = 'Barraca 2x2'), 'condicao', 'regular'))));
  perform pg_temp.ok((r->>'devolvidos')::int = 1, 'devolvido');
  perform pg_temp.ok((select situacao = 'em_estoque' and responsavel_id is null and condicao = 'regular' from pat_bens where descricao = 'Barraca 2x2'), 'em estoque');
  perform pg_temp.ok((select devolvido_em is not null from pat_termos where id = v_t), 'empréstimo encerrado');
  perform pg_temp.ok((select t.status from pat_termos x join tarefas t on t.id = x.tarefa_devolucao_id where x.id = v_t) = 'concluida', 'tarefa de devolução concluída');
end $$;

-- ── 7. Local e manutenção ───────────────────────────────────────────────────
do $$
declare v_ms uuid := pg_temp.bem('MS-1');
begin
  perform pg_temp.ok(fn_pat_mudar_local(array[v_ms], pg_temp.dep(), 'Guardado entre eventos') = 1, 'mudou de local');
  perform pg_temp.ok((select local_id = pg_temp.dep() and responsavel_id = '00000000-0000-0000-0000-0000000000b1' from pat_bens where id = v_ms), 'responsável mantido');
  perform fn_pat_manutencao_saida(v_ms, 'Assistência Som Norte', 'Canal 3 sem sinal na mesa', current_date + 7);
  perform pg_temp.ok((select situacao from pat_bens where id = v_ms) = 'em_manutencao', 'em manutenção');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_termo_criar(jsonb_build_object('responsavel_id','00000000-0000-0000-0000-0000000000f1',
    'local_id',%L,'bens',jsonb_build_array(%L))) $q$, pg_temp.sede(), v_ms), 'PAT_SITUACAO');
  perform pg_temp.deve_falhar(format('select fn_pat_manutencao_retorno(%L, %L, %L)', v_ms, 'bom', 'curto'), '10 caracteres');
  perform fn_pat_manutencao_retorno(v_ms, 'bom', 'Troca do potenciômetro do canal 3', 150);
  perform pg_temp.ok((select situacao = 'em_uso' and condicao = 'bom' from pat_bens where id = v_ms), 'voltou em uso');
  perform pg_temp.ok((select detalhes->>'custo_brl' from pat_eventos where bem_id = v_ms and tipo = 'manutencao_retorno') = '150', 'custo registrado');
end $$;

-- ── 8. Estorno não passa por cima de movimento ──────────────────────────────
select pg_temp.como('c1');
select pg_temp.deve_falhar(format('select fn_pat_estornar(%L, %L)',
  (select id from pat_eventos where bem_id = pg_temp.bem('CX-2') and tipo = 'incorporacao'), 'Cadastro feito em dobro'), 'só o último');
select pg_temp.deve_falhar(format('select fn_pat_estornar(%L, %L)',
  (select id from pat_eventos where bem_id = pg_temp.bem('CX-2') order by registrado_em desc limit 1), 'Movimento por engano'), 'não se estorna aqui');

select pg_temp.ok(not has_function_privilege('authenticated', 'public.fn_pat_termo_decidir(uuid,uuid,text,text,text,text,text)', 'execute'), 'decidir só service_role');
select pg_temp.ok(not has_function_privilege('anon', 'public.fn_pat_termo_criar(jsonb)', 'execute'), 'anon não cria termo');

\echo 'Patrimônio (fase 2): todos os testes passaram.'
