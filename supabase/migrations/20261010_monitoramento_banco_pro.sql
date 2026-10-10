-- 10/10/2026 · Armazenamento: a lista de pastas vinha sempre vazia.
-- A consulta somava dentro de outra soma (jsonb_agg(... count(*) ...) com GROUP BY), o Postgres
-- recusava ("aggregate function calls cannot be nested") e o EXCEPTION engolia o erro.
-- Agora agrupa numa subconsulta, parte de storage.buckets (pasta vazia aparece com 0) e devolve o
-- limite por arquivo e se a pasta é pública. Só super_admin ATIVO consulta.

create or replace function public.get_monitoramento_banco()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'storage', 'pg_catalog'
as $function$
declare
  v_tabelas jsonb;
  v_storage jsonb;
begin
  if not exists (select 1 from public.usuarios where id = auth.uid() and perfil = 'super_admin' and ativo) then
    raise exception 'Acesso negado: apenas super_admin pode consultar métricas do banco' using errcode = '42501';
  end if;

  select jsonb_agg(jsonb_build_object(
           'tabela', relname,
           'linhas', coalesce(n_live_tup, 0),
           'tamanho_bytes', pg_total_relation_size(relid)
         ) order by pg_total_relation_size(relid) desc)
    into v_tabelas
    from pg_stat_user_tables
   where schemaname = 'public';

  -- só agregados por pasta: nenhum caminho ou nome de arquivo sai daqui
  select jsonb_agg(jsonb_build_object(
           'bucket_id', b.id,
           'publico', b.public,
           'limite_arquivo_bytes', b.file_size_limit,
           'total_arquivos', coalesce(o.n, 0),
           'tamanho_bytes', coalesce(o.bytes, 0)
         ) order by coalesce(o.bytes, 0) desc, b.id)
    into v_storage
    from storage.buckets b
    left join (
      select bucket_id, count(*) as n, sum((metadata->>'size')::bigint) as bytes
        from storage.objects
       group by bucket_id
    ) o on o.bucket_id = b.id;

  return jsonb_build_object(
    'db_size_bytes',   pg_database_size(current_database()),
    'tabelas',         coalesce(v_tabelas, '[]'::jsonb),
    'storage_buckets', coalesce(v_storage, '[]'::jsonb),
    'consultado_em',   now()
  );
end;
$function$;

revoke all on function public.get_monitoramento_banco() from public, anon;
grant execute on function public.get_monitoramento_banco() to authenticated;
