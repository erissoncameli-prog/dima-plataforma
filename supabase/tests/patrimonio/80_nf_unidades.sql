-- Testes do Patrimônio · Fase 7 (uma ficha por unidade, números em sequência, nota fiscal lida)
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
create or replace function pg_temp.url(p text) returns text language sql as $$ select 'https://x.supabase.co/storage/v1/object/public/patrimonio-docs/' || p $$;
create or replace function pg_temp.inc(p_id text, p_extra jsonb) returns jsonb language sql as $$
  select fn_pat_incorporar(jsonb_build_object('id', p_id, 'origem', 'cessao', 'origem_detalhe', 'Cedido pela SEMA, termo 22/2026',
    'dt_aquisicao', '2026-09-01', 'local_id', (select id from pat_locais where nome = 'Depósito do projeto'),
    'itens', jsonb_build_array(jsonb_build_object('categoria', 'estruturas', 'descricao', 'Tenda 3x3', 'quantidade', 3, 'valor_total', 1000,
      'fotos', jsonb_build_array(jsonb_build_object('slot', 'frente', 'url', pg_temp.url('incorporacoes/' || p_id || '/fotos/f.jpg')))))) || p_extra)
$$;

-- ── 1. Sem lote ─────────────────────────────────────────────────────────────
select pg_temp.ok(not exists (select 1 from pat_categorias where controle <> 'individual'), 'categorias todas por unidade');
select pg_temp.como('c1');
select pg_temp.deve_falhar($q$ select fn_pat_salvar_categoria('{"codigo":"estruturas","nome":"Tendas","vida_util_meses":60,"controle":"lote"}') $q$, 'não há mais controle em lote');

insert into storage.objects (bucket_id, name) values ('patrimonio-docs', 'incorporacoes/00000000-0000-0000-0000-00000000ac01/fotos/f.jpg'),
  ('patrimonio-docs', 'incorporacoes/00000000-0000-0000-0000-00000000ac02/fotos/f.jpg');
do $$
declare r jsonb; ns int[];
begin
  r := pg_temp.inc('00000000-0000-0000-0000-00000000ac01', jsonb_build_object('nf_chave', '1226 1005 9284 2000 0156 5500 1000 0231 2610 7106 5594',
       'leitura_origem', 'pdf', 'leitura_itens', '[{"descricao":"Tenda 3x3","quantidade":3,"valor_total":1000}]', 'leitura_alterada', false));
  perform pg_temp.ok(jsonb_array_length(r->'bens') = 3, '3 unidades = 3 fichas');
  select array_agg(substring(x->>'numero' from 5)::int order by x->>'numero') into ns from jsonb_array_elements(r->'bens') x;
  perform pg_temp.ok(ns[2] = ns[1] + 1 and ns[3] = ns[2] + 1, 'números em sequência');
  perform pg_temp.ok((select bool_and(quantidade = 1) and sum(valor_aquisicao_brl) = 1000 and max(valor_aquisicao_brl) = 333.34
                       from pat_bens where incorporacao_id = '00000000-0000-0000-0000-00000000ac01'), 'quantidade 1 cada; centavo na última');
  perform pg_temp.ok((select count(*) from pat_documentos d join pat_bens b on b.id = d.bem_id
                       where b.incorporacao_id = '00000000-0000-0000-0000-00000000ac01' and d.slot = 'frente') = 3, 'foto de frente em cada ficha');
  perform pg_temp.ok((select nf_chave = '12261005928420000156550010000231261071065594' and leitura_origem = 'pdf' and not leitura_alterada
                       from pat_incorporacoes where id = '00000000-0000-0000-0000-00000000ac01'), 'chave e leitura gravadas');
end $$;

-- ── 2. Mesma nota não entra duas vezes ──────────────────────────────────────
select pg_temp.deve_falhar($q$ select pg_temp.inc('00000000-0000-0000-0000-00000000ac02', '{"nf_chave":"12261005928420000156550010000231261071065594"}') $q$, 'PAT_NF_REPETIDA');
select pg_temp.deve_falhar($q$ select pg_temp.inc('00000000-0000-0000-0000-00000000ac02', '{"nf_chave":"123"}') $q$, '44 dígitos');
select pg_temp.deve_falhar($q$ select pg_temp.inc('00000000-0000-0000-0000-00000000ac02', '{"leitura_origem":"ia"}') $q$, 'origem da leitura');

-- ── 3. Conferência da nota (sem mostrar o CNPJ) ─────────────────────────────
select pg_temp.como('d1');
do $$
declare r jsonb; v_prod uuid := (select cp.id from contratos_produtos cp join contratos c on c.id = cp.contrato_id
                                  join fornecedores f on f.id = c.fornecedor_id limit 1);
begin
  update fornecedores set cpf_cnpj = '05.928.420/0001-56' where id = (select c.fornecedor_id from contratos_produtos cp join contratos c on c.id = cp.contrato_id where cp.id = v_prod);
  r := fn_pat_nf_conferir(v_prod, '05928420000156', '1226 1005 9284 2000 0156 5500 1000 0231 2610 7106 5594');
  perform pg_temp.ok((r->>'cnpj_confere')::boolean and r->'chave_usada'->>'bens' like 'PAT-%', 'CNPJ confere e chave já usada');
  r := fn_pat_nf_conferir(v_prod, '11.111.111/0001-11', '00000000000000000000000000000000000000000000');
  perform pg_temp.ok(not (r->>'cnpj_confere')::boolean and r->>'chave_usada' is null, 'CNPJ diferente; chave livre');
  perform pg_temp.ok(not r ? 'cnpj', 'o CNPJ do fornecedor não sai');
end $$;
select pg_temp.como('b1');
select pg_temp.deve_falhar($q$ select fn_pat_nf_conferir(null, '', '') $q$, 'PAT_SEM_PERMISSAO');
select pg_temp.ok(not has_function_privilege('anon', 'public.fn_pat_nf_conferir(uuid,text,text)', 'execute'), 'anon não confere');
\echo 'Patrimônio (fase 7 — unidades e NF): todos os testes passaram.'
