-- PATRIMÔNIO · ROPA: acrescenta as tabelas das fases 2 e 3 ao TRAT-006 (aplicado à parte do apply_migration)
update public.lgpd_tratamentos
   set tabelas = (select array_agg(distinct x order by x) from unnest(tabelas || array['pat_termos','pat_termo_itens','pat_ocorrencias','pat_baixas']) x)
 where codigo = 'TRAT-006';

