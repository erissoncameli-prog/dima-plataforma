-- ════════════════════════════════════════════════════════════════════════
-- Testes do cancelamento de TDR (20261012_tdr_cancelamento*.sql).
-- Roda DEPOIS de 10_testes.sql (mesmo banco local: titulares, PTAX e helpers
-- t_erro/t_igual/t_login/t_ativ/t_livre/t_ptax/t_conferencia_ok já existem).
-- Usuários: c0 coordenação (titular solicitante) · f1 financeiro (titular UNESCO)
--           e1 técnico (responsável das atividades de teste) · 5a super_admin.
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
reset role;
select set_config('request.jwt.claim.sub', '', false);

\echo '· preparando o stub (storage, tdr_acoes, colunas de licitação do TDR)'
create schema if not exists storage;
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text
);
alter table storage.objects enable row level security;
alter table public.tdrs
  add column if not exists objeto_pt text,
  add column if not exists modalidade_licitacao text,
  add column if not exists numero_processo text,
  add column if not exists dt_licitacao date;
-- formato de produção (conferido em 12/10/2026): escrita só em nome de quem grava
create table if not exists public.tdr_acoes (
  id uuid primary key default gen_random_uuid(), tdr_id uuid references public.tdrs(id),
  usuario_id uuid, acao varchar, status_anterior varchar, status_novo varchar,
  comentario text, ip_address varchar, criado_em timestamptz default now()
);
alter table public.tdr_acoes enable row level security;
create policy tdr_acoes_escrita on public.tdr_acoes for insert to authenticated with check (usuario_id = auth.uid());
create policy tdr_acoes_leitura on public.tdr_acoes for select to authenticated using (true);

\echo '· aplicando o cancelamento de TDR (duas vezes: idempotência) + parte do SQL Editor'
\ir ../../migrations/20261012_tdr_cancelamento.sql
\ir ../../migrations/20261012_tdr_cancelamento.sql
\ir ../../migrations/20261012_tdr_cancelamento_sql_editor.sql

create function public.t_cass(u uuid, c uuid, d text, m text default null) returns jsonb language sql as
  $$ select fn_tcan_assinar(u, c, d, m, fn_tcan_hash(c), '127.0.0.1', 'teste') $$;
create function public.t_nota(p text) returns void language sql as
  $$ insert into storage.objects (bucket_id, name) values ('tdrs-arquivos', p) $$;
create function public.t_tdr(n text) returns uuid language sql as $$ select id from tdrs where numero = n $$;
create function public.t_tdr_status(n text) returns text language sql as $$ select status::text from tdrs where numero = n $$;
create function public.t_can(n text) returns public.tdr_cancelamentos language sql as
  $$ select * from tdr_cancelamentos where tdr_numero = n order by criado_em desc, numero desc limit 1 $$;
create function public.t_resp(c text, u uuid) returns void language sql as
  $$ insert into atividade_responsaveis (atividade_id, usuario_id, papel) select id, u, 'responsavel' from atividades where codigo = c $$;
create function public.t_just() returns text language sql as
  $$ select 'Licitação fracassada: as duas propostas recebidas foram desclassificadas por preço acima do estimado.' $$;

do $$ declare a uuid; begin
  a := t_ativ('C.1.1', 100);
  perform t_resp('C.1.1', '00000000-0000-0000-0000-0000000000e1');
  insert into tdrs (atividade_id, numero, status, valor_usd, valor_brl, objeto_pt, modalidade_licitacao, numero_processo, dt_licitacao)
  values (a, 'C.1.1-001', 'em_licitacao', 40, 40 * t_ptax(), 'Consultoria de teste', 'Pregão', 'PROC-1', '2026-09-01');
  insert into tdrs (atividade_id, numero, status, valor_usd, valor_brl, objeto_pt)
  values (a, 'C.1.1-002', 'aprovado', 20, 20 * t_ptax(), 'Outro TDR');
  insert into tdrs (atividade_id, numero, status, valor_usd, valor_brl, objeto_pt)
  values (a, 'C.1.1-003', 'rascunho', 10, 10 * t_ptax(), 'TDR em rascunho');
end $$;

\echo '· T20a cancelar direto é recusado (todas as fases)'
do $$ begin
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  perform t_erro($q$update tdrs set status = 'cancelado' where numero = 'C.1.1-002'$q$, 'TDR_CANCELAMENTO');
  perform t_erro($q$update tdrs set status = 'cancelado' where numero = 'C.1.1-003'$q$, 'TDR_CANCELAMENTO');
  perform t_login('00000000-0000-0000-0000-00000000005a');
  perform t_erro($q$update tdrs set status = 'cancelado' where numero = 'C.1.1-001'$q$, 'TDR_CANCELAMENTO');
end $$;

\echo '· T20b licitação sem êxito relançada (sem cadeia)'
do $$ declare v_livre numeric := t_livre('C.1.1'); begin
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  perform t_erro($q$select fn_tdr_licitacao_sem_exito(t_tdr('C.1.1-001'), 'deserta', 'Nenhuma proposta recebida')$q$, 'Sem permissão');
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  perform t_erro($q$select fn_tdr_licitacao_sem_exito(t_tdr('C.1.1-001'), 'deserta', 'curto')$q$, 'mínimo 10');
  perform t_erro($q$select fn_tdr_licitacao_sem_exito(t_tdr('C.1.1-001'), 'vazia', 'Nenhuma proposta recebida')$q$, 'Resultado inválido');
  perform t_erro($q$select fn_tdr_licitacao_sem_exito(t_tdr('C.1.1-002'), 'deserta', 'Nenhuma proposta recebida')$q$, 'não está em licitação');
  perform fn_tdr_licitacao_sem_exito(t_tdr('C.1.1-001'), 'deserta', 'Nenhuma proposta recebida no prazo do edital');
  if t_tdr_status('C.1.1-001') <> 'aprovado' then raise exception 'FALHOU: deveria voltar a aprovado'; end if;
  perform t_igual('dados da licitação limpos', (select count(*) from tdrs where numero = 'C.1.1-001'
    and modalidade_licitacao is null and numero_processo is null and dt_licitacao is null), 1);
  perform t_igual('tentativa gravada', (select count(*) from tdr_licitacoes where tdr_id = t_tdr('C.1.1-001')
    and rodada = 1 and resultado = 'deserta' and desfecho = 'relancada' and numero_processo = 'PROC-1'), 1);
  perform t_igual('ação no TDR', (select count(*) from tdr_acoes where tdr_id = t_tdr('C.1.1-001') and acao = 'licitacao_sem_exito'), 1);
  perform t_igual('relançar não mexe no saldo', t_livre('C.1.1'), v_livre);
  perform t_erro($q$update tdr_licitacoes set motivo = 'outro motivo qualquer'$q$, 'imutável');
  -- nova rodada
  update tdrs set status = 'em_licitacao', modalidade_licitacao = 'Pregão', numero_processo = 'PROC-2' where numero = 'C.1.1-001';
end $$;

\echo '· T20c rascunho do pedido e validação do envio'
do $$ declare v uuid; v2 uuid; c tdr_cancelamentos; begin
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  perform t_erro(format($q$select fn_tcan_salvar(null, '{"tdr_id":"%s"}')$q$, t_tdr('C.1.1-001')), 'Sem permissão');
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  v := fn_tcan_salvar(null, jsonb_build_object('tdr_id', t_tdr('C.1.1-001'), 'motivo_tipo', 'licitacao_fracassada',
         'uuid_cliente', 'cccccccc-0000-0000-0000-000000000001'));
  v2 := fn_tcan_salvar(null, jsonb_build_object('tdr_id', t_tdr('C.1.1-001'), 'uuid_cliente', 'cccccccc-0000-0000-0000-000000000001'));
  if v <> v2 then raise exception 'FALHOU: uuid_cliente deveria ser idempotente'; end if;
  perform t_erro(format($q$select fn_tcan_salvar(null, '{"tdr_id":"%s"}')$q$, t_tdr('C.1.1-001')), 'já tem o pedido');
  c := t_can('C.1.1-001');
  if c.numero not like 'CAN-____-___' then raise exception 'FALHOU: numeração %', c.numero; end if;
  perform t_igual('retrato do valor', c.valor_usd, 40);
  -- envio: justificativa, nota anexada e nota no armazenamento
  perform t_erro(format($q$select t_cass('00000000-0000-0000-0000-0000000000c0', '%s', 'aprovar')$q$, v), 'justificativa');
  perform fn_tcan_salvar(v, jsonb_build_object('justificativa', t_just()));
  perform t_erro(format($q$select t_cass('00000000-0000-0000-0000-0000000000c0', '%s', 'aprovar')$q$, v), 'anexe a nota');
  perform fn_tcan_salvar(v, jsonb_build_object('nota_caminho', 'cancelamentos/x/nota.pdf', 'nota_nome', 'Nota Técnica 12.pdf',
                                                'nota_sha256', repeat('ab', 32), 'nota_tamanho', 1234));
  perform t_erro(format($q$select t_cass('00000000-0000-0000-0000-0000000000c0', '%s', 'aprovar')$q$, v), 'não foi encontrada');
  perform t_nota('cancelamentos/x/nota.pdf');
  -- só o titular da coordenação envia
  perform t_erro(format($q$select t_cass('00000000-0000-0000-0000-00000000005a', '%s', 'aprovar')$q$, v), 'Só o titular');
  perform t_igual('envio', (t_cass('00000000-0000-0000-0000-0000000000c0', v, 'aprovar')->>'etapa_atual')::numeric, 2);
  c := t_can('C.1.1-001');
  if c.status <> 'em_aprovacao' then raise exception 'FALHOU: status %', c.status; end if;
  perform t_igual('cadeia de 3 etapas', (select count(*) from tdr_cancelamento_etapas where cancelamento_id = v), 3);
  perform t_igual('aviso só ao responsável', (select count(*) from tdr_cancelamento_notificacoes where cancelamento_id = v
    and evento = 'analisar' and usuario_id = '00000000-0000-0000-0000-0000000000e1'), 1);
  perform t_igual('sino', (select count(*) from notificacoes where entidade_id = v and tipo = 'tdr_cancelamento_analisar'), 1);
end $$;

\echo '· T20d TDR congelado enquanto o pedido está em aprovação; o valor segue comprometido'
do $$ declare v_livre numeric := t_livre('C.1.1'); begin
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  perform t_erro($q$update tdrs set status = 'contratado' where numero = 'C.1.1-001'$q$, 'TDR_EM_CANCELAMENTO');
  perform t_erro($q$update tdrs set valor_usd = 39 where numero = 'C.1.1-001'$q$, 'TDR_EM_CANCELAMENTO');
  perform t_erro($q$select fn_tdr_licitacao_sem_exito(t_tdr('C.1.1-001'), 'deserta', 'Nenhuma proposta recebida')$q$, 'TDR_EM_CANCELAMENTO');
  perform t_erro($q$insert into contratos (numero, tdr_id, atividade_id, valor_total_brl)
                    values ('CT-C1', t_tdr('C.1.1-001'), (select id from atividades where codigo = 'C.1.1'), 100)$q$, 'TDR_EM_CANCELAMENTO');
  update tdrs set objeto_pt = 'texto pode mudar' where numero = 'C.1.1-001';   -- só fase/valor/atividade travam
  perform t_igual('valor ainda comprometido', t_livre('C.1.1'), v_livre);
end $$;

\echo '· T20e cadeia: vez, hash, devolução, nova versão, efetivação'
do $$ declare c tdr_cancelamentos; v_livre numeric := t_livre('C.1.1'); v_hash text; begin
  c := t_can('C.1.1-001');
  perform t_erro(format($q$select t_cass('00000000-0000-0000-0000-0000000000f1', '%s', 'aprovar')$q$, c.id), 'NAO_E_SUA_VEZ');
  perform t_erro(format($q$select fn_tcan_assinar('00000000-0000-0000-0000-0000000000e1', '%s', 'aprovar', null, 'x')$q$, c.id), 'DOCUMENTO_ALTERADO');
  perform t_erro(format($q$select t_cass('00000000-0000-0000-0000-0000000000e1', '%s', 'devolver')$q$, c.id), 'Informe o motivo');
  perform t_igual('devolve à etapa 1', (t_cass('00000000-0000-0000-0000-0000000000e1', c.id, 'devolver', 'Anexe a ata da sessão')->>'etapa_atual')::numeric, 1);
  perform t_igual('aviso de devolução ao solicitante', (select count(*) from tdr_cancelamento_notificacoes where cancelamento_id = c.id
    and evento = 'devolvido' and usuario_id = '00000000-0000-0000-0000-0000000000c0'), 1);
  -- solicitante não devolve; edita → nova versão, assinaturas invalidadas
  perform t_erro(format($q$select t_cass('00000000-0000-0000-0000-0000000000c0', '%s', 'devolver', 'x')$q$, c.id), 'não devolve');
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  v_hash := fn_tcan_hash(c.id);
  perform fn_tcan_salvar(c.id, jsonb_build_object('justificativa', t_just() || ' Ata da sessão anexada à nota.'));
  if fn_tcan_hash(c.id) = v_hash then raise exception 'FALHOU: editar deveria mudar o hash'; end if;
  c := t_can('C.1.1-001');
  perform t_igual('nova versão', c.versao, 2);
  if c.status <> 'rascunho' then raise exception 'FALHOU: editar devolvido volta a rascunho'; end if;
  perform t_igual('assinaturas da versão 1 invalidadas', (select count(*) from tdr_cancelamento_assinaturas
    where cancelamento_id = c.id and versao = 1 and invalidada_em is null), 0);
  perform t_cass('00000000-0000-0000-0000-0000000000c0', c.id, 'aprovar');
  perform t_igual('responsável aprova', (t_cass('00000000-0000-0000-0000-0000000000e1', c.id, 'aprovar')->>'etapa_atual')::numeric, 3);
  perform t_igual('livre igual antes da última assinatura', t_livre('C.1.1'), v_livre);
  if (t_cass('00000000-0000-0000-0000-0000000000f1', c.id, 'aprovar')->>'status') <> 'efetivado' then
    raise exception 'FALHOU: UNESCO deveria efetivar';
  end if;
  if t_tdr_status('C.1.1-001') <> 'cancelado' then raise exception 'FALHOU: TDR deveria estar cancelado'; end if;
  perform t_igual('valor liberado no saldo livre', t_livre('C.1.1'), v_livre + 40);
  perform t_igual('evento no extrato', (select count(*) from orcamento_eventos where tdr_id = t_tdr('C.1.1-001') and evento = 'tdr_cancelado'), 1);
  perform t_igual('tentativa final gravada', (select count(*) from tdr_licitacoes where tdr_id = t_tdr('C.1.1-001')
    and rodada = 2 and resultado = 'fracassada' and desfecho = 'cancelamento' and cancelamento_id = c.id and numero_processo = 'PROC-2'), 1);
  perform t_igual('ação cancelado no TDR', (select count(*) from tdr_acoes where tdr_id = t_tdr('C.1.1-001') and acao = 'cancelado'), 1);
  perform t_igual('avisos de efetivação (solicitante, responsável, UNESCO)', (select count(*) from tdr_cancelamento_notificacoes
    where cancelamento_id = c.id and evento = 'efetivado'), 3);
  perform t_conferencia_ok('após cancelar TDR');
end $$;

\echo '· T20f TDR cancelado não volta nem recebe contrato; pedido efetivado não muda'
do $$ begin
  perform t_login('00000000-0000-0000-0000-00000000005a');
  perform t_erro($q$update tdrs set status = 'aprovado' where numero = 'C.1.1-001'$q$, 'TDR_CANCELADO');
  perform t_erro($q$insert into contratos (numero, tdr_id, atividade_id, valor_total_brl)
                    values ('CT-C2', t_tdr('C.1.1-001'), (select id from atividades where codigo = 'C.1.1'), 100)$q$, 'TDR_CANCELADO');
  perform t_erro(format($q$select fn_tcan_salvar(null, '{"tdr_id":"%s"}')$q$, t_tdr('C.1.1-001')), 'TDR_CANCELADO');
  perform t_erro($q$update tdr_cancelamentos set justificativa = 'outra' where tdr_numero = 'C.1.1-001'$q$, 'encerrado');
  perform t_erro($q$update tdr_cancelamento_historico set motivo = 'x'$q$, 'imutável');
  perform t_erro($q$update tdr_cancelamento_assinaturas set decisao = 'recusar'$q$, 'imutável');
end $$;

\echo '· T20g recusa: TDR segue como estava e aceita pedido novo'
do $$ declare v uuid; begin
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  v := fn_tcan_salvar(null, jsonb_build_object('tdr_id', t_tdr('C.1.1-002'), 'motivo_tipo', 'sem_necessidade',
         'justificativa', 'O objeto deixou de ser necessário: a atividade foi coberta pela consultoria do TDR C.1.1-001.',
         'nota_caminho', 'cancelamentos/y/nota.pdf', 'nota_nome', 'NT.pdf', 'nota_sha256', repeat('cd', 32)));
  perform t_nota('cancelamentos/y/nota.pdf');
  perform t_cass('00000000-0000-0000-0000-0000000000c0', v, 'aprovar');
  perform t_erro(format($q$select t_cass('00000000-0000-0000-0000-0000000000e1', '%s', 'recusar')$q$, v), 'Informe o motivo');
  if (t_cass('00000000-0000-0000-0000-0000000000e1', v, 'recusar', 'O TDR ainda é necessário')->>'status') <> 'recusado' then
    raise exception 'FALHOU: deveria recusar';
  end if;
  if t_tdr_status('C.1.1-002') <> 'aprovado' then raise exception 'FALHOU: TDR deveria seguir aprovado'; end if;
  update tdrs set valor_usd = 19, valor_brl = 19 * t_ptax() where numero = 'C.1.1-002';   -- descongelado
  perform fn_tcan_salvar(null, jsonb_build_object('tdr_id', t_tdr('C.1.1-002')));          -- pedido novo cabe
end $$;

\echo '· T20h cancelar o pedido (solicitante) e rascunho de TDR em rascunho'
do $$ declare c tdr_cancelamentos; v uuid; begin
  c := t_can('C.1.1-002');
  perform t_erro(format($q$select t_cass('00000000-0000-0000-0000-0000000000c0', '%s', 'cancelar')$q$, c.id), 'motivo');
  if (t_cass('00000000-0000-0000-0000-0000000000c0', c.id, 'cancelar', 'Aberto por engano')->>'status') <> 'cancelado' then
    raise exception 'FALHOU: deveria cancelar o pedido';
  end if;
  -- TDR ainda em rascunho também segue a cadeia
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  v := fn_tcan_salvar(null, jsonb_build_object('tdr_id', t_tdr('C.1.1-003'), 'motivo_tipo', 'substituido',
         'justificativa', 'Substituído pelo TDR C.1.1-002, que reúne o mesmo escopo com valor menor.',
         'nota_caminho', 'cancelamentos/z/nota.pdf', 'nota_nome', 'NT.pdf', 'nota_sha256', repeat('ef', 32)));
  perform t_nota('cancelamentos/z/nota.pdf');
  perform t_cass('00000000-0000-0000-0000-0000000000c0', v, 'aprovar');
  perform t_cass('00000000-0000-0000-0000-0000000000e1', v, 'aprovar');
  perform t_cass('00000000-0000-0000-0000-0000000000f1', v, 'aprovar');
  if t_tdr_status('C.1.1-003') <> 'cancelado' then raise exception 'FALHOU: rascunho cancelado pela cadeia'; end if;
  perform t_igual('sem tentativa de licitação para TDR fora de licitação',
    (select count(*) from tdr_licitacoes where tdr_id = t_tdr('C.1.1-003')), 0);
end $$;

\echo '· T20i sem signatário, segregação, TDR com contrato'
do $$ declare a uuid; v uuid; begin
  a := t_ativ('C.1.2', 100);
  insert into tdrs (atividade_id, numero, status, valor_usd, valor_brl) values (a, 'C.1.2-001', 'aprovado', 10, 10 * t_ptax());
  perform t_login('00000000-0000-0000-0000-0000000000c0');
  v := fn_tcan_salvar(null, jsonb_build_object('tdr_id', t_tdr('C.1.2-001'), 'justificativa', t_just(),
         'nota_caminho', 'cancelamentos/w/nota.pdf', 'nota_nome', 'NT.pdf', 'nota_sha256', repeat('01', 32)));
  perform t_nota('cancelamentos/w/nota.pdf');
  perform t_erro(format($q$select t_cass('00000000-0000-0000-0000-0000000000c0', '%s', 'aprovar')$q$, v), 'SEM_SIGNATARIO');
  -- responsável que é titular da cadeia não serve
  perform t_resp('C.1.2', '00000000-0000-0000-0000-0000000000f1');
  perform t_erro(format($q$select t_cass('00000000-0000-0000-0000-0000000000c0', '%s', 'aprovar')$q$, v), 'não seja titular');
  perform t_resp('C.1.2', '00000000-0000-0000-0000-0000000000e1');
  perform t_cass('00000000-0000-0000-0000-0000000000c0', v, 'aprovar');
  -- o titular da UNESCO, também responsável da atividade, não assina a etapa do responsável
  -- (assinaria duas etapas e a cadeia travaria na dele); assina só a UNESCO
  perform t_erro(format($q$select t_cass('00000000-0000-0000-0000-0000000000f1', '%s', 'aprovar')$q$, v), 'NAO_E_SUA_VEZ');
  perform t_cass('00000000-0000-0000-0000-0000000000e1', v, 'aprovar');
  if (t_cass('00000000-0000-0000-0000-0000000000f1', v, 'aprovar')->>'status') <> 'efetivado' then
    raise exception 'FALHOU: UNESCO deveria efetivar';
  end if;
  -- TDR com contrato não entra em pedido
  insert into tdrs (atividade_id, numero, status, valor_usd, valor_brl) values (a, 'C.1.2-002', 'em_licitacao', 10, 10 * t_ptax());
  insert into contratos (numero, tdr_id, atividade_id, valor_total_brl) values ('CT-C3', t_tdr('C.1.2-002'), a, 10 * t_ptax());
  perform t_erro(format($q$select fn_tcan_salvar(null, '{"tdr_id":"%s"}')$q$, t_tdr('C.1.2-002')), 'TDR_COM_CONTRATO');
end $$;

\echo '· T20j acesso'
do $$ begin
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  set local role authenticated;
  if (select count(*) from tdr_cancelamentos) = 0 then raise exception 'FALHOU: logado ativo lê os pedidos'; end if;
  if (select count(*) from tdr_licitacoes) = 0 then raise exception 'FALHOU: logado ativo lê as tentativas'; end if;
  perform t_erro('select * from tdr_cancelamento_notificacoes', 'permission denied');
  perform t_erro($q$insert into tdr_cancelamentos (numero, tdr_id, motivo_tipo, justificativa) values ('X', t_tdr('C.1.1-002'), 'outro', 'x')$q$, 'permission denied');
  perform t_erro($q$update tdr_cancelamentos set justificativa = 'x'$q$, 'permission denied');
  perform t_erro($q$select fn_tcan_assinar('00000000-0000-0000-0000-0000000000e1', (select id from tdr_cancelamentos limit 1), 'aprovar', null, 'x')$q$, 'permission denied');
  perform t_erro($q$select fn_tcan_efetivar((select id from tdr_cancelamentos limit 1), '00000000-0000-0000-0000-0000000000e1')$q$, 'permission denied');
  -- assinaturas: técnico só vê as próprias (IP/navegador); a visão sem IP é para todos
  perform t_igual('técnico vê só as próprias assinaturas',
    (select count(*) from tdr_cancelamento_assinaturas where usuario_id <> '00000000-0000-0000-0000-0000000000e1'), 0);
  if (select count(*) from vw_tdr_cancelamento_assinaturas where usuario_id <> '00000000-0000-0000-0000-0000000000e1') = 0 then
    raise exception 'FALHOU: visão sem IP deveria mostrar todas';
  end if;
end $$;
do $$ begin
  set local role anon;
  perform t_erro($q$select fn_tcan_salvar(null, '{}')$q$, 'permission denied');
  perform t_erro($q$select fn_tdr_licitacao_sem_exito(null, 'deserta', 'xxxxxxxxxxxx')$q$, 'permission denied');
  perform t_erro('select * from tdr_cancelamentos', 'permission denied');
end $$;
-- usuário desativado não lê nada (fn_perfil_atual devolve NULL só para inativo em produção; aqui, sem login)
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  perform t_igual('sem perfil não lê', (select count(*) from tdr_cancelamentos), 0);
end $$;

\echo '✔ todos os testes do cancelamento de TDR passaram'
