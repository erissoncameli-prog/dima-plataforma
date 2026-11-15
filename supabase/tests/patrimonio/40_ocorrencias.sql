-- Testes do Patrimônio · Fase 3 (ocorrências, sinistros e baixa com aprovação)
-- Continua do estado deixado por 30_guarda.sql: CX-2 com f1 (financeiro), MS-1 com b1 (técnico),
-- MIC-1 e a barraca em estoque, sem responsável.
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
create or replace function pg_temp.barraca() returns uuid language sql as $$ select id from pat_bens where descricao = 'Barraca 2x2' $$;
create or replace function pg_temp.suporte() returns uuid language sql as $$ select id from pat_bens where descricao = 'Suporte de caixa' $$;
create or replace function pg_temp.sede() returns uuid language sql as $$ select id from pat_locais where nome = 'Sede da SEMA/AC' $$;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- ── 1. Quem registra ────────────────────────────────────────────────────────
select pg_temp.como('f1');   -- financeiro, guarda a CX-2
select pg_temp.deve_falhar(format($q$ select fn_pat_ocorrencia_registrar(jsonb_build_object('bem_id',%L,'tipo','avaria',
  'dt_ocorrencia',current_date,'descricao','Caiu da mesa durante a montagem do palco')) $q$, pg_temp.bem('MIC-1')), 'PAT_SEM_PERMISSAO');
select pg_temp.deve_falhar(format($q$ select fn_pat_ocorrencia_registrar(jsonb_build_object('bem_id',%L,'tipo','avaria',
  'dt_ocorrencia',current_date,'descricao','curto')) $q$, pg_temp.bem('CX-2')), '20 caracteres');
do $$
declare r jsonb;
begin
  r := fn_pat_ocorrencia_registrar(jsonb_build_object('bem_id', pg_temp.bem('CX-2'), 'tipo', 'avaria', 'dt_ocorrencia', current_date,
       'onde', 'Evento na APA', 'descricao', 'A caixa caiu do tripé e o alto-falante passou a chiar', 'condicao', 'ruim'));
  insert into ctx values ('oc_cx2', (r->>'ocorrencia_id')::uuid);
  perform pg_temp.ok(r->>'numero' like 'OC-%-0001', 'número');
  perform pg_temp.ok((select condicao = 'ruim' and situacao = 'em_uso' from pat_bens where id = pg_temp.bem('CX-2')), 'condição baixou, segue em uso');
  perform pg_temp.ok((select count(*) from tarefas t join tarefa_participantes p on p.tarefa_id = t.id
                       where t.entidade_tipo = 'pat_ocorrencia' and p.usuario_id = '00000000-0000-0000-0000-0000000000d1') = 1, 'tarefa para o gestor');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_ocorrencia_registrar(jsonb_build_object('bem_id',%L,'tipo','avaria',
    'dt_ocorrencia',current_date,'descricao','Outra avaria registrada no mesmo bem')) $q$, pg_temp.bem('CX-2')), 'já há ocorrência');
end $$;

-- leitura: quem registrou vê; consultor alheio não
set role authenticated;
select pg_temp.como('f1');
select pg_temp.ok((select count(*) from pat_ocorrencias) = 1, 'financeiro vê a ocorrência');
select pg_temp.como('e1');
select pg_temp.ok((select count(*) from pat_ocorrencias) = 0 and (select count(*) from pat_baixas) = 0, 'consultor alheio não vê');
select pg_temp.como('b1');
select pg_temp.ok(fn_pat_doc_pode_enviar('bens/' || pg_temp.bem('MS-1') || '/bo.pdf'), 'quem guarda envia foto do próprio bem');
select pg_temp.ok(not fn_pat_doc_pode_enviar('bens/' || pg_temp.bem('CX-2') || '/x.jpg'), 'mas não de bem alheio');
reset role;

-- ── 2. Furto exige BO; extravio tira o bem de circulação ────────────────────
select pg_temp.como('d1');
select pg_temp.deve_falhar(format($q$ select fn_pat_ocorrencia_registrar(jsonb_build_object('bem_id',%L,'tipo','furto',
  'dt_ocorrencia',current_date,'descricao','Levado do carro estacionado no centro')) $q$, pg_temp.bem('MIC-1')), 'PAT_BO');
do $$
declare r jsonb;
begin
  r := fn_pat_ocorrencia_registrar(jsonb_build_object('bem_id', pg_temp.bem('MIC-1'), 'tipo', 'extravio', 'dt_ocorrencia', current_date,
       'descricao', 'Não voltou na caixa depois do evento de sábado'));
  insert into ctx values ('oc_mic', (r->>'ocorrencia_id')::uuid);
  perform pg_temp.ok((select situacao from pat_bens where id = pg_temp.bem('MIC-1')) = 'extraviado', 'extraviado');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_termo_criar(jsonb_build_object('responsavel_id','00000000-0000-0000-0000-0000000000b1',
    'local_id',%L,'bens',jsonb_build_array(%L))) $q$, pg_temp.sede(), pg_temp.bem('MIC-1')), 'PAT_SITUACAO');
  -- desfechos que não cabem em extravio
  perform pg_temp.deve_falhar(format($q$ select fn_pat_ocorrencia_concluir(%L, '{"desfecho":"reparado","parecer":"Consertado pela assistência técnica"}') $q$, r->>'ocorrencia_id'), 'não se repara');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_ocorrencia_concluir(%L, '{"desfecho":"arquivada","parecer":"Sem dano constatado ao fim da apuração"}') $q$, r->>'ocorrencia_id'), 'segue extraviado');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_ocorrencia_concluir(%L, '{"desfecho":"baixa","parecer":"Sem dano constatado ao fim da apuração"}') $q$, r->>'ocorrencia_id'), 'pedido de baixa');
  -- achado
  perform fn_pat_ocorrencia_apurar((r->>'ocorrencia_id')::uuid, 'Procurando com a equipe do evento');
  perform fn_pat_ocorrencia_concluir((r->>'ocorrencia_id')::uuid, '{"desfecho":"localizado","parecer":"Estava na caixa de cabos do depósito"}');
  perform pg_temp.ok((select situacao from pat_bens where id = pg_temp.bem('MIC-1')) = 'em_estoque', 'voltou ao estoque');
  perform pg_temp.ok((select situacao = 'concluida' and desfecho = 'localizado' and apurado_em is not null from pat_ocorrencias where id = (r->>'ocorrencia_id')::uuid), 'concluída');
  perform pg_temp.ok((select t.status from pat_ocorrencias o join tarefas t on t.id = o.tarefa_id where o.id = (r->>'ocorrencia_id')::uuid) = 'concluida', 'tarefa concluída');
end $$;

-- ── 3. Avaria reparada ──────────────────────────────────────────────────────
do $$
declare v_oc uuid := (select v from ctx where k = 'oc_cx2');
begin
  perform pg_temp.deve_falhar(format($q$ select fn_pat_ocorrencia_concluir(%L, '{"desfecho":"localizado","parecer":"Estava na caixa de cabos do depósito"}') $q$, v_oc), 'só para extravio');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_ocorrencia_concluir(%L, '{"desfecho":"ressarcido","parecer":"Quem derrubou pagou o conserto inteiro"}') $q$, v_oc), 'valor recebido');
  perform fn_pat_ocorrencia_concluir(v_oc, '{"desfecho":"reparado","parecer":"Alto-falante trocado na assistência técnica","condicao":"bom"}');
  perform pg_temp.ok((select condicao from pat_bens where id = pg_temp.bem('CX-2')) = 'bom', 'condição recuperada');
  perform pg_temp.deve_falhar(format($q$ update pat_ocorrencias set parecer = 'x' where id = %L $q$, v_oc), 'PAT_PROTEGIDO');
end $$;

-- ── 4. Baixa: pedido, segregação, hash, aprovação ───────────────────────────
do $$
declare r jsonb; v_bx uuid; v_h text;
begin
  perform pg_temp.deve_falhar(format($q$ select fn_pat_baixa_pedir(jsonb_build_object('bem_id',%L,'motivo','inservivel',
    'justificativa','Mesa sem conserto segundo a assistência técnica')) $q$, pg_temp.bem('MS-1')), 'PAT_SITUACAO');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_baixa_pedir(jsonb_build_object('bem_id',%L,'motivo','inservivel','justificativa','curta')) $q$, pg_temp.barraca()), '30 caracteres');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_baixa_pedir(jsonb_build_object('bem_id',%L,'motivo','furto_roubo',
    'justificativa','Barraca levada do acampamento durante a noite de chuva')) $q$, pg_temp.barraca()), 'extraviado e a ocorrência');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_baixa_pedir(jsonb_build_object('bem_id',%L,'motivo','doacao',
    'justificativa','Barraca doada à associação de moradores da comunidade')) $q$, pg_temp.barraca()), 'para quem');
  r := fn_pat_baixa_pedir(jsonb_build_object('bem_id', pg_temp.barraca(), 'motivo', 'inservivel',
       'justificativa', 'Lona rasgada e estrutura empenada depois de dois anos de uso em campo'));
  v_bx := (r->>'baixa_id')::uuid; insert into ctx values ('bx1', v_bx);
  perform pg_temp.ok((select hash <> '-' from pat_baixas where id = v_bx), 'hash de registro');
  perform pg_temp.ok((select count(*) from tarefas t join tarefa_participantes p on p.tarefa_id = t.id
                       where t.entidade_tipo = 'pat_baixa' and t.entidade_id = v_bx and p.usuario_id = '00000000-0000-0000-0000-0000000000a1') = 1, 'tarefa para o aprovador');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_baixa_pedir(jsonb_build_object('bem_id',%L,'motivo','obsolescencia',
    'justificativa','Outro pedido para o mesmo bem que já tem um aguardando')) $q$, pg_temp.barraca()), 'já há pedido');
  -- laudo anexado depois muda o documento
  v_h := fn_pat_baixa_hash(v_bx);
  insert into storage.objects (bucket_id, name) values ('patrimonio-docs', 'bens/' || pg_temp.barraca() || '/laudo.pdf');
  perform fn_pat_anexar_vinculo('laudo', 'https://x/storage/v1/object/public/patrimonio-docs/bens/' || pg_temp.barraca() || '/laudo.pdf', 'laudo.pdf', 100, null, v_bx);
  perform set_config('request.jwt.claim.sub', '', false);
  perform pg_temp.deve_falhar(format('select fn_pat_baixa_decidir(%L, %L, %L, null, %L)', '00000000-0000-0000-0000-0000000000a1', v_bx, 'aprovar', v_h), 'DOCUMENTO_ALTERADO');
  perform pg_temp.deve_falhar(format('select fn_pat_baixa_decidir(%L, %L, %L, null, %L)', '00000000-0000-0000-0000-0000000000d1', v_bx, 'aprovar', fn_pat_baixa_hash(v_bx)), 'PAT_SEM_PERMISSAO');
  r := fn_pat_baixa_decidir('00000000-0000-0000-0000-0000000000a1', v_bx, 'aprovar', 'De acordo', fn_pat_baixa_hash(v_bx), '10.0.0.2', 'teste');
  perform pg_temp.ok(r->>'situacao' = 'aprovada', 'aprovada');
  perform pg_temp.ok((select situacao = 'baixado' and dt_baixa = current_date from pat_bens where id = pg_temp.barraca()), 'bem baixado');
  perform pg_temp.ok((select count(*) from pat_eventos where tipo = 'baixa') = 1, 'evento de baixa');
  perform pg_temp.ok((select t.status from pat_baixas x join tarefas t on t.id = x.tarefa_id where x.id = v_bx) = 'concluida', 'tarefa da baixa concluída');
  perform pg_temp.como('d1');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_editar_ficha(%L, '{"modelo":"x"}') $q$, pg_temp.barraca()), 'PAT_ENCERRADO');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_ocorrencia_registrar(jsonb_build_object('bem_id',%L,'tipo','avaria',
    'dt_ocorrencia',current_date,'descricao','Ocorrência em bem que já foi baixado')) $q$, pg_temp.barraca()), 'PAT_ENCERRADO');
end $$;

-- segregação e devolução
select pg_temp.como('c1');
do $$
declare r jsonb; v_bx uuid;
begin
  r := fn_pat_baixa_pedir(jsonb_build_object('bem_id', pg_temp.suporte(), 'motivo', 'doacao', 'destino', 'Escola da comunidade São Francisco',
       'justificativa', 'Suporte sem uso no projeto, útil para as apresentações da escola'));
  v_bx := (r->>'baixa_id')::uuid;
  perform set_config('request.jwt.claim.sub', '', false);
  perform pg_temp.deve_falhar(format('select fn_pat_baixa_decidir(%L, %L, %L, null, %L)', '00000000-0000-0000-0000-0000000000c1', v_bx, 'aprovar', fn_pat_baixa_hash(v_bx)), 'PAT_SEGREGACAO');
  perform pg_temp.deve_falhar(format('select fn_pat_baixa_decidir(%L, %L, %L, %L, %L)', '00000000-0000-0000-0000-0000000000a1', v_bx, 'devolver', 'curto', fn_pat_baixa_hash(v_bx)), '10 caracteres');
  r := fn_pat_baixa_decidir('00000000-0000-0000-0000-0000000000a1', v_bx, 'devolver', 'Falta o termo de doação assinado pela escola', fn_pat_baixa_hash(v_bx));
  perform pg_temp.ok((select situacao from pat_baixas where id = v_bx) = 'devolvida', 'devolvida');
  perform pg_temp.ok((select situacao from pat_bens where id = pg_temp.suporte()) = 'em_estoque', 'bem segue no patrimônio');
  perform pg_temp.ok((select count(*) from tarefas t join tarefa_participantes p on p.tarefa_id = t.id
                       where t.titulo like '%devolvida%' and p.usuario_id = '00000000-0000-0000-0000-0000000000c1') = 1, 'tarefa para quem pediu');
end $$;

-- ── 5. Furto → baixa com ocorrência ligada ──────────────────────────────────
select pg_temp.como('b1');   -- técnico que guarda a MS-1 registra o furto
do $$
declare r jsonb; v_oc uuid; v_bx uuid;
begin
  r := fn_pat_ocorrencia_registrar(jsonb_build_object('bem_id', pg_temp.bem('MS-1'), 'tipo', 'furto', 'dt_ocorrencia', current_date,
       'bo_numero', '12345/2026', 'descricao', 'Furtada do escritório da APA durante a madrugada'));
  v_oc := (r->>'ocorrencia_id')::uuid;
  perform pg_temp.ok((select situacao = 'extraviado' and responsavel_id = '00000000-0000-0000-0000-0000000000b1' from pat_bens where id = pg_temp.bem('MS-1')), 'extraviado, responsável mantido');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_baixa_pedir(jsonb_build_object('bem_id',%L,'motivo','furto_roubo',
    'justificativa','Furto registrado em boletim, sem recuperação após apuração')) $q$, pg_temp.bem('MS-1')), 'PAT_SEM_PERMISSAO');
  perform pg_temp.como('d1');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_baixa_pedir(jsonb_build_object('bem_id',%L,'motivo','inservivel',
    'justificativa','Furto registrado em boletim, sem recuperação após apuração')) $q$, pg_temp.bem('MS-1')), 'só vai para baixa por extravio');
  r := fn_pat_baixa_pedir(jsonb_build_object('bem_id', pg_temp.bem('MS-1'), 'motivo', 'furto_roubo', 'ocorrencia_id', v_oc,
       'justificativa', 'Furto registrado em boletim, sem recuperação após 30 dias de apuração'));
  v_bx := (r->>'baixa_id')::uuid;
  perform set_config('request.jwt.claim.sub', '', false);
  perform fn_pat_baixa_decidir('00000000-0000-0000-0000-0000000000c1', v_bx, 'aprovar', null, fn_pat_baixa_hash(v_bx));
  perform pg_temp.ok((select situacao = 'baixado' and responsavel_id is null from pat_bens where id = pg_temp.bem('MS-1')), 'baixado e sem responsável');
  perform pg_temp.ok((select situacao = 'concluida' and desfecho = 'baixa' from pat_ocorrencias where id = v_oc), 'ocorrência concluída pela baixa');
end $$;

select pg_temp.ok(not has_function_privilege('authenticated', 'public.fn_pat_baixa_decidir(uuid,uuid,text,text,text,text,text)', 'execute'), 'decidir baixa só service_role');
select pg_temp.ok(not has_function_privilege('anon', 'public.fn_pat_ocorrencia_registrar(jsonb)', 'execute'), 'anon não registra');

\echo 'Patrimônio (fase 3): todos os testes passaram.'
