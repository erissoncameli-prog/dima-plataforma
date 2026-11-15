-- Testes do Patrimônio · Fase 4 (inventário por campanha, comissão e assinatura com senha)
-- Continua do estado deixado por 40_ocorrencias.sql: na Sede ficam CX-2 (em uso, bom, com f1),
-- MIC-1 e o suporte (em estoque, novos); MS-1 e a barraca já foram baixados.
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
create or replace function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
create or replace function pg_temp.bem(p_serie text) returns uuid language sql as $$ select id from pat_bens where numero_serie = p_serie $$;
create or replace function pg_temp.suporte() returns uuid language sql as $$ select id from pat_bens where descricao = 'Suporte de caixa' $$;
create or replace function pg_temp.loc(p text) returns uuid language sql as $$ select id from pat_locais where nome = p $$;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- ── 1. Abrir ────────────────────────────────────────────────────────────────
select pg_temp.como('b1');
select pg_temp.deve_falhar($q$ select fn_pat_inv_abrir('{"titulo":"Inventário da sede","comissao":[]}') $q$, 'PAT_SEM_PERMISSAO');
select pg_temp.como('d1');
select pg_temp.deve_falhar(format($q$ select fn_pat_inv_abrir(jsonb_build_object('titulo','Inventário da sede','comissao',jsonb_build_array(%L))) $q$,
  pg_temp.u('b1')), 'ao menos 2');
select pg_temp.deve_falhar(format($q$ select fn_pat_inv_abrir(jsonb_build_object('titulo','Inventário da sede','comissao',jsonb_build_array(%L,%L))) $q$,
  pg_temp.u('b1'), pg_temp.u('b1')), 'duas vezes');
do $$
declare r jsonb;
begin
  r := fn_pat_inv_abrir(jsonb_build_object('titulo', 'Inventário anual 2026 — sede', 'tipo', 'anual',
       'locais', jsonb_build_array(pg_temp.loc('Sede da SEMA/AC')), 'comissao', jsonb_build_array(pg_temp.u('b1'), pg_temp.u('f1'))));
  insert into ctx values ('inv', (r->>'inventario_id')::uuid);
  perform pg_temp.ok(r->>'numero' like 'INV-%-0001', 'número');
  perform pg_temp.ok((r->>'bens')::int = 3, '3 bens esperados na sede');
  perform pg_temp.ok((select papel from pat_inventario_comissao where inventario_id = (r->>'inventario_id')::uuid and usuario_id = pg_temp.u('b1')) = 'presidente', '1º = presidente');
  perform pg_temp.ok((select count(*) from pat_inventario_comissao c join tarefas t on t.id = c.tarefa_id
                       where c.inventario_id = (r->>'inventario_id')::uuid and t.entidade_tipo = 'pat_inventario') = 2, 'tarefa para cada membro');
end $$;
select pg_temp.deve_falhar(format($q$ select fn_pat_inv_abrir(jsonb_build_object('titulo','Outro inventário','comissao',jsonb_build_array(%L,%L))) $q$,
  pg_temp.u('b1'), pg_temp.u('c1')), 'PAT_INV_SOBREPOSTO');

-- ── 2. Conferir ─────────────────────────────────────────────────────────────
select pg_temp.deve_falhar(format($q$ select fn_pat_inv_conferir(jsonb_build_object('inventario_id',%L,'numero','PAT-000002',
  'local_id',%L,'condicao','bom','metodo','qr')) $q$, (select v from ctx where k = 'inv'), pg_temp.loc('Sede da SEMA/AC')), 'só a comissão');
select pg_temp.como('b1');
do $$
declare r jsonb; v_inv uuid := (select v from ctx where k = 'inv');
begin
  r := fn_pat_inv_conferir(jsonb_build_object('inventario_id', v_inv, 'numero', 'https://x/pages/patrimonio.html?bem=pat-000002',
       'local_id', pg_temp.loc('Sede da SEMA/AC'), 'condicao', 'bom', 'metodo', 'qr'));
  perform pg_temp.ok(r->>'resultado' = 'conferido' and r->>'numero' = 'PAT-000002', 'CX-2 pelo endereço do QR');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_inv_conferir(jsonb_build_object('inventario_id',%L,'numero','PAT-999999',
    'local_id',%L,'condicao','bom')) $q$, v_inv, pg_temp.loc('Sede da SEMA/AC')), 'PAT_NAO_ACHADO');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_inv_conferir(jsonb_build_object('inventario_id',%L,'bem_id',%L,
    'local_id',%L,'condicao','bom')) $q$, v_inv, pg_temp.bem('MS-1'), pg_temp.loc('Sede da SEMA/AC')), 'PAT_ENCERRADO');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_inv_conferir(jsonb_build_object('inventario_id',%L,'bem_id',%L,
    'local_id',%L,'condicao','otimo')) $q$, v_inv, pg_temp.bem('MIC-1'), pg_temp.loc('Sede da SEMA/AC')), 'condição inválida');
end $$;
select pg_temp.como('f1');
do $$
declare r jsonb; v_inv uuid := (select v from ctx where k = 'inv');
begin
  r := fn_pat_inv_conferir(jsonb_build_object('inventario_id', v_inv, 'bem_id', pg_temp.bem('MIC-1'),
       'local_id', pg_temp.loc('Depósito do projeto'), 'condicao', 'novo', 'metodo', 'busca'));
  perform pg_temp.ok(r->>'resultado' = 'local_divergente', 'MIC-1 achado no depósito');
  -- desfazer e refazer
  perform fn_pat_inv_desfazer(v_inv, pg_temp.bem('MIC-1'));
  perform pg_temp.ok((select resultado from pat_inventario_itens where inventario_id = v_inv and bem_id = pg_temp.bem('MIC-1')) = 'pendente', 'desfeito');
  perform fn_pat_inv_conferir(jsonb_build_object('inventario_id', v_inv, 'bem_id', pg_temp.bem('MIC-1'),
       'local_id', pg_temp.loc('Depósito do projeto'), 'condicao', 'novo', 'metodo', 'busca'));
  perform pg_temp.ok((select count(*) from pat_inventario_itens where inventario_id = v_inv and conferido_em is not null) = 2, '2 conferidos');
  perform pg_temp.deve_falhar(format('select fn_pat_inv_enviar(%L)', v_inv), 'presidente');
end $$;
select pg_temp.deve_falhar($q$ update pat_inventario_itens set resultado = 'conferido' $q$, 'PAT_PROTEGIDO');
select pg_temp.deve_falhar($q$ update pat_inventarios set situacao = 'concluido' $q$, 'PAT_PROTEGIDO');

-- ── 3. Enviar e assinar ─────────────────────────────────────────────────────
select pg_temp.como('b1');
do $$
declare r jsonb; v_inv uuid := (select v from ctx where k = 'inv'); v_h text;
begin
  r := fn_pat_inv_enviar(v_inv);
  v_h := r->>'hash';
  perform pg_temp.ok((select situacao from pat_inventarios where id = v_inv) = 'em_assinatura', 'em assinatura');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_inv_conferir(jsonb_build_object('inventario_id',%L,'bem_id',%L,
    'local_id',%L,'condicao','novo')) $q$, v_inv, pg_temp.suporte(), pg_temp.loc('Sede da SEMA/AC')), 'PAT_INV_FECHADO');
  perform set_config('request.jwt.claim.sub', '', false);   -- service_role (Edge Function)
  perform pg_temp.deve_falhar(format('select fn_pat_inv_assinar(%L, %L, %L)', pg_temp.u('e1'), v_inv, v_h), 'PAT_SEM_PERMISSAO');
  perform pg_temp.deve_falhar(format('select fn_pat_inv_assinar(%L, %L, %L)', pg_temp.u('b1'), v_inv, 'x'), 'DOCUMENTO_ALTERADO');
  r := fn_pat_inv_assinar(pg_temp.u('b1'), v_inv, v_h, '10.0.0.1', 'teste');
  perform pg_temp.ok((r->>'faltam')::int = 1, 'falta 1 assinatura');
  perform pg_temp.deve_falhar(format('select fn_pat_inv_assinar(%L, %L, %L)', pg_temp.u('b1'), v_inv, v_h), 'já assinou');
  perform pg_temp.ok((select t.status from pat_inventario_comissao c join tarefas t on t.id = c.tarefa_id
                       where c.inventario_id = v_inv and c.usuario_id = pg_temp.u('b1')) = 'concluida', 'tarefa de b1 concluída');
end $$;
select pg_temp.deve_falhar($q$ update pat_inventario_assinaturas set hash = 'x' $q$, 'PAT_IMUTAVEL');

-- f1 vê um erro, reabre, corrige a observação: a assinatura de b1 perde efeito
select pg_temp.como('f1');
select pg_temp.deve_falhar(format($q$ select fn_pat_inv_reabrir(%L, 'curto') $q$, (select v from ctx where k = 'inv')), '10+');
do $$
declare v_inv uuid := (select v from ctx where k = 'inv'); v_h text; r jsonb;
begin
  perform fn_pat_inv_reabrir(v_inv, 'Faltou anotar onde o microfone estava guardado');
  perform pg_temp.ok((select situacao = 'em_andamento' and hash is null from pat_inventarios where id = v_inv), 'reaberto');
  perform fn_pat_inv_conferir(jsonb_build_object('inventario_id', v_inv, 'bem_id', pg_temp.bem('MIC-1'),
       'local_id', pg_temp.loc('Depósito do projeto'), 'condicao', 'novo', 'metodo', 'busca', 'observacao', 'Na caixa do palco'));
  perform pg_temp.como('d1');   -- o gestor também envia
  v_h := fn_pat_inv_enviar(v_inv)->>'hash';
  perform pg_temp.ok(not (fn_pat_inv_detalhe(v_inv)->'comissao'->0 ? 'x') and (fn_pat_inv_detalhe(v_inv)->'comissao'->0->>'assinado_em') is null,
                     'assinatura antiga de b1 não vale');
  perform pg_temp.ok((fn_pat_inv_detalhe(v_inv)->>'assinaturas_anteriores')::int = 1, 'histórico guarda a anterior');
  perform set_config('request.jwt.claim.sub', '', false);
  r := fn_pat_inv_assinar(pg_temp.u('f1'), v_inv, v_h);
  perform pg_temp.ok((r->>'faltam')::int = 1, 'b1 precisa assinar de novo');
  r := fn_pat_inv_assinar(pg_temp.u('b1'), v_inv, v_h);
  perform pg_temp.ok(r->>'situacao' = 'concluido', 'concluído');
  perform pg_temp.ok((r->>'conferidos')::int = 2 and (r->>'divergencias')::int = 1 and (r->>'extravios')::int = 1, 'totais');
end $$;

-- ── 4. Efeitos ──────────────────────────────────────────────────────────────
select pg_temp.ok((select ultimo_inventario_em = current_date from pat_bens where id = pg_temp.bem('CX-2')), 'CX-2 inventariada hoje');
select pg_temp.ok((select local_id = pg_temp.loc('Depósito do projeto') and ultimo_inventario_em = current_date
                     from pat_bens where id = pg_temp.bem('MIC-1')), 'MIC-1 passou para o depósito');
select pg_temp.ok((select count(*) from pat_eventos where tipo = 'inventario') = 2, '2 eventos de inventário');
select pg_temp.ok((select situacao from pat_bens where id = pg_temp.suporte()) = 'extraviado', 'suporte não localizado = extraviado');
select pg_temp.ok((select count(*) from pat_ocorrencias o join tarefas t on t.id = o.tarefa_id
                    where o.bem_id = pg_temp.suporte() and o.tipo = 'extravio' and o.descricao like '%INV-%') = 1, 'ocorrência de extravio com tarefa');
select pg_temp.ok((select t.titulo like 'Regularizar%' and t.descricao like '%PAT-000006%'
                     from pat_inventarios v join tarefas t on t.id = v.tarefa_regularizacao_id
                    where v.id = (select v from ctx where k = 'inv')), 'tarefa de regularização');

-- ── 5. Leitura ──────────────────────────────────────────────────────────────
select pg_temp.como('a2');   -- visualizador: lê, sem valor
select pg_temp.ok(jsonb_array_length(fn_pat_inv_detalhe((select v from ctx where k = 'inv'))->'itens') = 3, 'visualizador lê os 3 itens');
select pg_temp.ok((fn_pat_inv_detalhe((select v from ctx where k = 'inv'))->'itens'->0->>'valor_contabil_brl') is null, 'sem valor');
select pg_temp.como('e1');   -- consultor externo fora da comissão
select pg_temp.deve_falhar(format('select fn_pat_inv_detalhe(%L)', (select v from ctx where k = 'inv')), 'PAT_SEM_PERMISSAO');
select pg_temp.ok(jsonb_array_length(fn_pat_inv_lista()) = 0, 'consultor não lista');
select pg_temp.como('d1');
select pg_temp.ok((fn_pat_inv_detalhe((select v from ctx where k = 'inv'))->'itens'->0->>'valor_contabil_brl') is not null, 'gestor vê valor');

-- ── 6. Cancelar (o extraviado entra e fica "ausente por registro") ──────────
do $$
declare r jsonb; v_inv uuid;
begin
  r := fn_pat_inv_abrir(jsonb_build_object('titulo', 'Inventário extraordinário', 'tipo', 'extraordinario',
       'comissao', jsonb_build_array(pg_temp.u('c1'), pg_temp.u('d1'))));
  v_inv := (r->>'inventario_id')::uuid;
  perform pg_temp.ok((r->>'bens')::int = 3, 'todos os locais: 3 ativos (com o extraviado)');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_inv_cancelar(%L, 'curto') $q$, v_inv), '10+');
  perform fn_pat_inv_cancelar(v_inv, 'Aberto por engano, sem a comissão certa');
  perform pg_temp.ok((select situacao from pat_inventarios where id = v_inv) = 'cancelado', 'cancelado');
  perform pg_temp.ok((select count(*) from pat_inventario_comissao c join tarefas t on t.id = c.tarefa_id
                       where c.inventario_id = v_inv and t.status = 'cancelada') = 2, 'tarefas canceladas');
end $$;

select pg_temp.ok(not has_function_privilege('authenticated', 'public.fn_pat_inv_assinar(uuid,uuid,text,text,text)', 'execute'), 'assinar só service_role');
select pg_temp.ok(not has_function_privilege('anon', 'public.fn_pat_inv_conferir(jsonb)', 'execute'), 'anon não confere');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.fn_pat_inv_hash(uuid)', 'execute'), 'hash não exposto');

\echo 'Patrimônio (fase 4): todos os testes passaram.'
