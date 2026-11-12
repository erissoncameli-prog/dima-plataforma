-- ═══════════════════════════════════════════════════════════════════════
-- SITE PÚBLICO — áreas do mapa sob demanda (Produto 4: desempenho e monitoramento)
-- ═══════════════════════════════════════════════════════════════════════
-- fn_publico_camadas devolve as 11 áreas com a geometria inteira (7 MB) a
-- cada visita ao Mapa, mas só 2 aparecem ligadas ao abrir. Com 3 ou mais
-- visitas ao mesmo tempo, o banco de produção interrompe a consulta pelo
-- tempo-limite (57014) e o mapa abre sem as áreas.
--
-- Agora o site pede a lista (sem geometria, poucos KB) e a geometria de cada
-- área só quando ela está ligada. fn_publico_camadas continua igual, para
-- compatibilidade.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_publico_camadas_lista()
returns table(id uuid, nome text, apa_key text, cor text, visivel boolean, feature_colors jsonb)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select a.id, a.nome, a.apa_key, a.cor, a.visivel, coalesce(a.feature_colors, '{}'::jsonb)
  from public.apa_demarcacoes a
  order by a.created_at;
$function$;

create or replace function public.fn_publico_camada_geojson(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(p.geojson, a.geojson)
  from public.apa_demarcacoes a
  left join public.apa_demarcacoes_publico p on p.id = a.id
  where a.id = p_id;
$function$;

revoke all on function public.fn_publico_camadas_lista() from public;
revoke all on function public.fn_publico_camada_geojson(uuid) from public;
grant execute on function public.fn_publico_camadas_lista() to anon, authenticated, service_role;
grant execute on function public.fn_publico_camada_geojson(uuid) to anon, authenticated, service_role;

comment on function public.fn_publico_camadas_lista() is
  'Site público (Mapa): lista das áreas sem geometria. A geometria vem de fn_publico_camada_geojson, só para as áreas ligadas.';
comment on function public.fn_publico_camada_geojson(uuid) is
  'Site público (Mapa): geometria de uma área (6 casas decimais, de apa_demarcacoes_publico).';

notify pgrst, 'reload schema';
