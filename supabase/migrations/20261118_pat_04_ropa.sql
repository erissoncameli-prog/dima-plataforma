-- PATRIMÔNIO · ROPA: acrescenta as tabelas do inventário (fase 4) ao TRAT-006 (aplicado à parte do apply_migration)
update public.lgpd_tratamentos
   set tabelas = (select array_agg(distinct x order by x) from unnest(tabelas || array['pat_inventarios','pat_inventario_comissao',
                  'pat_inventario_itens','pat_inventario_assinaturas']) x)
 where codigo = 'TRAT-006';
