-- 27/11/2026 · ROPA TRAT-007 (JÁ APLICADO em 21/11/2026 pelo execute_sql; fica como registro): histórico de senhas e links de acesso.
update public.lgpd_tratamentos
   set tabelas = (select array(select distinct unnest(coalesce(tabelas, '{}') || array['usuario_senhas_historico','acesso_links']))),
       categorias_dados = (select array(select distinct unnest(coalesce(categorias_dados, '{}')
         || array['histórico de senhas (só o resumo criptográfico, nunca a senha)', 'links de nova senha e de volta à entrada (só o resumo, 24 horas)']))),
       atualizado_em = now()
 where codigo = 'TRAT-007';
