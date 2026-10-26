-- ════════════════════════════════════════════════════════════════════════
-- Bucket entregas-docs — acesso por produto (parte 2: policies)
-- Colar inteiro no SQL Editor do Supabase e executar. Idempotente.
-- Depende de 20261026_produto_entrega_fornecedor.sql (fn_produto_id_do_path,
-- fn_entregas_docs_pode_enviar).
--
-- Antes: qualquer usuário logado lia, enviava e substituía qualquer arquivo do
-- bucket (policies só com bucket_id), passando por cima da restrição de Produtos.
--
--   Ler        = quem enxerga o produto (consulta a contratos_produtos passa pela RLS
--                cp_readonly → contratos_select). Arquivo fora do padrão
--                produtos/<produto_id>/ = só super_admin/coordenação.
--   Enviar     = quem registra entrega do produto (fornecedor do contrato, responsável,
--                substituto, super_admin) ou coordenação/financeiro — nunca o fornecedor
--                fora do próprio contrato.
--   Substituir = os mesmos (a tela envia com upsert).
--   Remover    = sem policy (a tela não remove arquivo de entrega).
-- ════════════════════════════════════════════════════════════════════════
begin;

drop policy if exists "Authenticated update entregas-docs" on storage.objects;
drop policy if exists "Authenticated upload entregas-docs" on storage.objects;
drop policy if exists entregas_docs_auth_select on storage.objects;

drop policy if exists entregas_docs_ler on storage.objects;
create policy entregas_docs_ler on storage.objects for select to authenticated
  using (bucket_id = 'entregas-docs' and (
    exists (select 1 from public.contratos_produtos cp where cp.id = public.fn_produto_id_do_path(name))
    or public.fn_perfil_atual() in ('super_admin', 'coordenacao')));

drop policy if exists entregas_docs_enviar on storage.objects;
create policy entregas_docs_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'entregas-docs' and public.fn_entregas_docs_pode_enviar(name));

drop policy if exists entregas_docs_substituir on storage.objects;
create policy entregas_docs_substituir on storage.objects for update to authenticated
  using (bucket_id = 'entregas-docs' and public.fn_entregas_docs_pode_enviar(name))
  with check (bucket_id = 'entregas-docs' and public.fn_entregas_docs_pode_enviar(name));

commit;
