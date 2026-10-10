-- 10/10/2026 · Fornecedores: CPF/CNPJ, endereço, e-mail e telefone deixam de ser legíveis por
-- qualquer pessoa logada.
--
-- Lê a linha de `fornecedores` quem:
--   · é super_admin/coordenação/financeiro (ativo) ou tem o acesso extra 'fornecedores',
--     'financeiro', 'contratos' ou 'relatorios_fornecedores';
--   · enxerga um contrato, TDR, lançamento, tarefa ou subtarefa ligado ao fornecedor
--     (as subconsultas rodam com a RLS de quem lê, então herdam as regras de cada tabela).
-- Listas de escolha (Painel de Tarefas, filtro da Visão Geral) usam fn_fornecedores_diretorio():
-- só id, nome, tipo e se há e-mail — nunca o documento nem o contato.

alter policy forn_select_all on public.fornecedores
  to authenticated
  using (
    public.fn_perfil_atual() in ('super_admin','coordenacao','financeiro')
    or public.tem_permissao('fornecedores')
    or public.tem_permissao('financeiro')
    or public.tem_permissao('contratos')
    or public.tem_permissao('relatorios_fornecedores')
    or exists (select 1 from public.contratos c where c.fornecedor_id = fornecedores.id)
    or exists (select 1 from public.tdrs t where t.fornecedor_id = fornecedores.id)
    or exists (select 1 from public.execucao_financeira e where e.fornecedor_id = fornecedores.id)
    or exists (select 1 from public.tarefas k where k.fornecedor_id = fornecedores.id)
    or exists (select 1 from public.tarefa_checklist s where s.responsavel_fornecedor_id = fornecedores.id)
  );

create or replace function public.fn_fornecedores_diretorio()
returns table (id uuid, nome text, tipo varchar, ativo boolean, tem_email boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select f.id, f.nome, f.tipo, f.ativo, nullif(trim(f.email), '') is not null
    from public.fornecedores f
   where public.fn_perfil_atual() is not null
   order by f.nome;
$function$;

revoke all on function public.fn_fornecedores_diretorio() from public, anon;
grant execute on function public.fn_fornecedores_diretorio() to authenticated;
