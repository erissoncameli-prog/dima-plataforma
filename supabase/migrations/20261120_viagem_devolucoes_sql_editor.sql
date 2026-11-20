-- COLAR NO SQL EDITOR (o apply_migration trava com este comando).
-- Comprovantes de devolução de viagem (viagens-arquivos/devolucoes/...) não podem ser removidos por nenhum
-- cliente: a policy de remoção antiga do bucket vale para qualquer logado. Policy RESTRITIVA = soma por AND.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'viagens_devolucoes_nao_remove') then
    create policy viagens_devolucoes_nao_remove on storage.objects as restrictive for delete to public
      using (not (bucket_id = 'viagens-arquivos' and name like 'devolucoes/%'));
  end if;
end $$;

-- (20/11/2026, segunda parte) mesma proteção para os comprovantes da emissão (bilhetes e diárias)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'viagens_comprovantes_nao_remove') then
    create policy viagens_comprovantes_nao_remove on storage.objects as restrictive for delete to public
      using (not (bucket_id = 'viagens-arquivos' and name like 'comprovantes/%'));
  end if;
end $$;
