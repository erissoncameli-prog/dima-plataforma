-- ════════════════════════════════════════════════════════════════════════
-- LGPD · tela do ROPA (pages/ropa.html): conferência das tabelas declaradas
--
-- lgpd_tratamentos.tabelas diz ONDE o dado pessoal mora. Esta função confere
-- cada nome contra o banco real, para a tela mostrar tabela renomeada ou
-- apagada como pendência em vez de acreditar no registro.
--   • 'storage:<bucket>' → existe em storage.buckets
--   • 'schema.tabela'     → to_regclass direto
--   • 'tabela'            → public.tabela
--
-- SECURITY DEFINER porque storage.buckets não é legível pelo authenticated;
-- a mesma regra de leitura do ROPA (super_admin/coordenação) é checada aqui.
-- Só leitura: devolve nomes que já estão no próprio ROPA, nenhum dado.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.fn_lgpd_conferir_tabelas()
returns table (codigo text, tabela text, ordem integer, existe boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.usuarios u
                 where u.id = auth.uid() and u.ativo
                   and u.perfil in ('super_admin','coordenacao')) then
    raise exception 'lgpd:sem_acesso' using errcode = '42501';
  end if;

  return query
  select t.codigo, x.tab, x.ord::integer,
         case
           when x.tab like 'storage:%' then
             exists (select 1 from storage.buckets b where b.id = substr(x.tab, 9))
           when position('.' in x.tab) > 0 then to_regclass(x.tab) is not null
           else to_regclass('public.' || x.tab) is not null
         end
  from public.lgpd_tratamentos t
  cross join lateral unnest(t.tabelas) with ordinality as x(tab, ord)
  where t.ativo
  order by t.codigo, x.ord;
end $$;

comment on function public.fn_lgpd_conferir_tabelas() is
  'ROPA: confere cada lgpd_tratamentos.tabelas contra o schema (tabela ou storage:<bucket>). Leitura do ROPA = super_admin/coordenação.';

revoke execute on function public.fn_lgpd_conferir_tabelas() from public, anon;
grant execute on function public.fn_lgpd_conferir_tabelas() to authenticated;
