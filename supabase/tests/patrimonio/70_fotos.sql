-- Testes do Patrimônio · Fase 6 (fotos do bem nas 3 posições e fotos da ocorrência)
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
create or replace function pg_temp.url(p text) returns text language sql as $$ select 'https://x.supabase.co/storage/v1/object/public/patrimonio-docs/' || p $$;
create or replace function pg_temp.arq(p text) returns void language sql as $$ insert into storage.objects (bucket_id, name) values ('patrimonio-docs', p) $$;
create or replace function pg_temp.inc(p_id text, p_fotos jsonb) returns jsonb language sql as $$
  select fn_pat_incorporar(jsonb_build_object('id', p_id, 'origem', 'cessao', 'origem_detalhe', 'Cedido pela SEMA, termo 15/2026',
    'dt_aquisicao', '2026-09-01', 'local_id', (select id from pat_locais where nome = 'Sede da SEMA/AC'),
    'itens', jsonb_build_array(jsonb_build_object('categoria', 'audio_video', 'descricao', 'Projetor portátil', 'numeros_serie', jsonb_build_array('PJ-1'),
      'quantidade', 1, 'valor_total', 3200, 'fotos', p_fotos))))
$$;

-- ── 1. Entrada exige a foto de frente ───────────────────────────────────────
select pg_temp.como('c1');
select pg_temp.arq('incorporacoes/00000000-0000-0000-0000-00000000ab01/fotos/frente.jpg');
select pg_temp.arq('incorporacoes/00000000-0000-0000-0000-00000000ab01/fotos/placa.jpg');
select pg_temp.deve_falhar($q$ select pg_temp.inc('00000000-0000-0000-0000-00000000ab01', '[]') $q$, 'PAT_FOTO_OBRIGATORIA');
select pg_temp.deve_falhar(format($q$ select pg_temp.inc('00000000-0000-0000-0000-00000000ab01', jsonb_build_array(
  jsonb_build_object('slot','placa','url',%L))) $q$, pg_temp.url('incorporacoes/00000000-0000-0000-0000-00000000ab01/fotos/placa.jpg')), 'foto de frente');
select pg_temp.deve_falhar(format($q$ select pg_temp.inc('00000000-0000-0000-0000-00000000ab01', jsonb_build_array(
  jsonb_build_object('slot','frente','url',%L), jsonb_build_object('slot','frente','url',%L))) $q$,
  pg_temp.url('incorporacoes/00000000-0000-0000-0000-00000000ab01/fotos/frente.jpg'), pg_temp.url('incorporacoes/00000000-0000-0000-0000-00000000ab01/fotos/placa.jpg')), 'uma foto por posição');
select pg_temp.deve_falhar(format($q$ select pg_temp.inc('00000000-0000-0000-0000-00000000ab01', jsonb_build_array(
  jsonb_build_object('slot','lateral','url',%L))) $q$, pg_temp.url('incorporacoes/00000000-0000-0000-0000-00000000ab01/fotos/frente.jpg')), 'posição de foto inválida');
select pg_temp.deve_falhar(format($q$ select pg_temp.inc('00000000-0000-0000-0000-00000000ab01', jsonb_build_array(
  jsonb_build_object('slot','frente','url',%L))) $q$, pg_temp.url('incorporacoes/00000000-0000-0000-0000-00000000ab01/fotos/nao-existe.jpg')), 'PAT_ARQUIVO');
select pg_temp.deve_falhar(format($q$ select pg_temp.inc('00000000-0000-0000-0000-00000000ab01', jsonb_build_array(
  jsonb_build_object('slot','frente','url',%L))) $q$, pg_temp.url('bens/x/frente.jpg')), 'PAT_ARQUIVO');
do $$
declare r jsonb; v_b uuid;
begin
  r := pg_temp.inc('00000000-0000-0000-0000-00000000ab01', jsonb_build_array(
    jsonb_build_object('slot','frente','url', pg_temp.url('incorporacoes/00000000-0000-0000-0000-00000000ab01/fotos/frente.jpg'), 'nome', 'frente.jpg', 'tamanho', 120000),
    jsonb_build_object('slot','placa','url', pg_temp.url('incorporacoes/00000000-0000-0000-0000-00000000ab01/fotos/placa.jpg'))));
  v_b := (r->'bens'->0->>'id')::uuid;
  perform pg_temp.ok((select count(*) from pat_documentos where bem_id = v_b and tipo = 'foto' and ativo) = 2, '2 fotos gravadas');
  perform pg_temp.ok((select foto_url like '%frente.jpg' and n_fotos = 2 from vw_pat_bens where id = v_b), 'capa = frente');
end $$;

-- ── 2. Trocar e completar depois ────────────────────────────────────────────
do $$
declare v_b uuid := pg_temp.bem('PJ-1'); v_antes uuid;
begin
  perform pg_temp.arq('bens/' || v_b || '/frente2.jpg');
  perform pg_temp.arq('bens/' || v_b || '/detalhe.jpg');
  v_antes := (select id from pat_documentos where bem_id = v_b and slot = 'frente' and ativo);
  perform fn_pat_foto_definir(v_b, 'frente', pg_temp.url('bens/' || v_b || '/frente2.jpg'), 'frente2.jpg');
  perform pg_temp.ok((select not ativo and motivo_remocao like 'Substituída%' from pat_documentos where id = v_antes), 'a antiga fica no histórico');
  perform pg_temp.ok((select foto_url like '%frente2.jpg' from vw_pat_bens where id = v_b), 'capa trocada');
  perform fn_pat_anexar(v_b, 'foto', pg_temp.url('bens/' || v_b || '/detalhe.jpg'), 'detalhe.jpg');
  perform pg_temp.ok((select slot from pat_documentos where bem_id = v_b and url like '%detalhe.jpg' and ativo) = 'detalhe', 'anexo de foto vai para a posição livre');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_anexar(%L, 'foto', %L, 'x.jpg') $q$, v_b, pg_temp.url('bens/' || v_b || '/detalhe.jpg')), 'PAT_FOTO_LIMITE');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_remover_anexo(%L, 'foto ruim') $q$,
    (select id from pat_documentos where bem_id = v_b and slot = 'frente' and ativo)), 'PAT_FOTO_OBRIGATORIA');
  perform fn_pat_remover_anexo((select id from pat_documentos where bem_id = v_b and slot = 'detalhe' and ativo), 'Foto tremida');
  perform pg_temp.ok((select n_fotos from vw_pat_bens where id = v_b) = 2, 'detalhe removido');
  perform pg_temp.deve_falhar(format($q$ select fn_pat_foto_definir(%L, 'frente', %L, 'x') $q$, v_b, pg_temp.url('bens/outro/frente.jpg')), 'PAT_ARQUIVO');
end $$;

-- ── 3. Quem fotografa ───────────────────────────────────────────────────────
select pg_temp.arq('bens/' || pg_temp.bem('CX-2') || '/placa.jpg');
select pg_temp.como('f1');   -- guarda a CX-2
select pg_temp.ok(fn_pat_doc_pode_enviar('bens/' || pg_temp.bem('CX-2') || '/a.jpg'), 'quem guarda envia foto');
select pg_temp.ok(not fn_pat_doc_pode_enviar('bens/' || pg_temp.bem('MIC-1') || '/a.jpg'), 'bem de outro: não');
select pg_temp.ok(not fn_pat_doc_pode_enviar('incorporacoes/x/fotos/a.jpg'), 'entrada: só quem gere');
select fn_pat_foto_definir(pg_temp.bem('CX-2'), 'placa', pg_temp.url('bens/' || pg_temp.bem('CX-2') || '/placa.jpg'), 'placa.jpg');
select pg_temp.deve_falhar(format($q$ select fn_pat_foto_definir(%L, 'frente', 'x', 'x') $q$, pg_temp.bem('MIC-1')), 'PAT_SEM_PERMISSAO');
select pg_temp.como('b1');
select pg_temp.ok(not fn_pat_pode_fotografar(pg_temp.bem('MIC-1')), 'técnico sem vínculo: não');
select pg_temp.como('d1');
select fn_pat_inv_abrir(jsonb_build_object('titulo', 'Inventário do depósito', 'locais', jsonb_build_array((select id from pat_locais where nome = 'Depósito do projeto')),
  'comissao', jsonb_build_array(pg_temp.u('b1'), pg_temp.u('a2'))));
select pg_temp.como('b1');
select pg_temp.ok(fn_pat_pode_fotografar(pg_temp.bem('MIC-1')), 'comissão do inventário aberto fotografa');
select pg_temp.ok(fn_pat_doc_pode_enviar('bens/' || pg_temp.bem('MIC-1') || '/a.jpg'), 'e envia ao bucket');
select pg_temp.ok(not fn_pat_pode_fotografar(pg_temp.bem('CX-2')), 'bem fora do inventário: não');

-- ── 4. Ocorrência com fotos ─────────────────────────────────────────────────
select pg_temp.como('f1');
select pg_temp.arq('bens/' || pg_temp.bem('CX-2') || '/oc1.jpg');
select pg_temp.arq('bens/' || pg_temp.bem('CX-2') || '/oc2.jpg');
select pg_temp.deve_falhar(format($q$ select fn_pat_ocorrencia_registrar(jsonb_build_object('bem_id',%L,'tipo','defeito','dt_ocorrencia',current_date,
  'descricao','Caixa parou de ligar depois da chuva','fotos',jsonb_build_array(jsonb_build_object('url','a'),jsonb_build_object('url','b'),jsonb_build_object('url','c'),jsonb_build_object('url','d')))) $q$,
  pg_temp.bem('CX-2')), 'PAT_FOTO_LIMITE');
select pg_temp.deve_falhar(format($q$ select fn_pat_ocorrencia_registrar(jsonb_build_object('bem_id',%L,'tipo','defeito','dt_ocorrencia',current_date,
  'descricao','Caixa parou de ligar depois da chuva','fotos',jsonb_build_array(jsonb_build_object('url',%L)))) $q$,
  pg_temp.bem('CX-2'), pg_temp.url('bens/' || pg_temp.bem('CX-2') || '/nao.jpg')), 'PAT_ARQUIVO');
do $$
declare r jsonb;
begin
  r := fn_pat_ocorrencia_registrar(jsonb_build_object('bem_id', pg_temp.bem('CX-2'), 'tipo', 'defeito', 'dt_ocorrencia', current_date,
       'descricao', 'Caixa parou de ligar depois da chuva', 'fotos', jsonb_build_array(
         jsonb_build_object('url', pg_temp.url('bens/' || pg_temp.bem('CX-2') || '/oc1.jpg'), 'nome', 'oc1.jpg'),
         jsonb_build_object('url', pg_temp.url('bens/' || pg_temp.bem('CX-2') || '/oc2.jpg')))));
  perform pg_temp.ok((select count(*) from pat_documentos where ocorrencia_id = (r->>'ocorrencia_id')::uuid and tipo = 'foto') = 2, '2 fotos na ocorrência');
  perform pg_temp.ok((select n_fotos from vw_pat_bens where id = pg_temp.bem('CX-2')) = 1, 'foto da ocorrência não conta no quadro do bem');
end $$;

select pg_temp.ok(not has_function_privilege('anon', 'public.fn_pat_foto_definir(uuid,text,text,text,bigint)', 'execute'), 'anon não fotografa');
\echo 'Patrimônio (fase 6 — fotos): todos os testes passaram.'
