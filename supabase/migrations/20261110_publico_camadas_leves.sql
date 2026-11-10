-- ═══════════════════════════════════════════════════════════════════════
-- SITE PÚBLICO — camadas do mapa mais leves (Produto 4, TdR 4.2: desempenho)
-- ═══════════════════════════════════════════════════════════════════════
-- fn_publico_camadas devolvia as geometrias de apa_demarcacoes como foram
-- importadas, com 15 a 17 casas decimais por coordenada (precisão de
-- nanômetros): 11,5 MB de texto, 4,1 MB comprimidos a cada visita ao mapa.
-- Com 6 casas (≈ 0,1 m, invisível em qualquer zoom) ficam 7 MB / 1,7 MB.
--
-- O arredondamento não é feito a cada chamada (custaria processar 11 MB por
-- visita): a versão leve fica em apa_demarcacoes_publico, 1 linha por camada,
-- mantida por trigger sempre que a geometria é gravada ou alterada na
-- plataforma (Mapa Interativo). A tabela original não muda.
-- Sem policy nem grant: só a função SECURITY DEFINER e o trigger leem/gravam.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.apa_demarcacoes_publico (
  id          uuid primary key references public.apa_demarcacoes(id) on delete cascade,
  geojson     jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.apa_demarcacoes_publico enable row level security;
revoke all on public.apa_demarcacoes_publico from public, anon, authenticated;

comment on table public.apa_demarcacoes_publico is
  'Geometrias de apa_demarcacoes com 6 casas decimais, para o mapa do site público (fn_publico_camadas). Mantida por trg_apa_demarcacoes_publico; não editar.';

-- Arredonda todo número com mais de 6 casas decimais (coordenadas e bbox)
create or replace function public.fn_geojson_6_casas(g jsonb)
returns jsonb
language sql
immutable
set search_path to 'public'
as $function$
  select case when g is null then null
         else regexp_replace(g::text, '(-?[0-9]+\.[0-9]{6})[0-9]+', '\1', 'g')::jsonb end
$function$;

revoke all on function public.fn_geojson_6_casas(jsonb) from public, anon;

create or replace function public.fn_trg_apa_demarcacoes_publico()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.apa_demarcacoes_publico (id, geojson, atualizado_em)
  values (new.id, public.fn_geojson_6_casas(new.geojson), now())
  on conflict (id) do update set geojson = excluded.geojson, atualizado_em = excluded.atualizado_em;
  return new;
end
$function$;

revoke all on function public.fn_trg_apa_demarcacoes_publico() from public, anon, authenticated;

create or replace trigger trg_apa_demarcacoes_publico
  after insert or update of geojson on public.apa_demarcacoes
  for each row execute function public.fn_trg_apa_demarcacoes_publico();

-- Carga inicial (e reprocessamento, se a migração rodar de novo)
insert into public.apa_demarcacoes_publico (id, geojson, atualizado_em)
select a.id, public.fn_geojson_6_casas(a.geojson), now()
from public.apa_demarcacoes a
on conflict (id) do update set geojson = excluded.geojson, atualizado_em = excluded.atualizado_em;

-- Mesma assinatura e mesma ordem de antes: o site não muda
create or replace function public.fn_publico_camadas()
returns table(id uuid, nome text, apa_key text, cor text, geojson jsonb, visivel boolean, feature_colors jsonb)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select a.id, a.nome, a.apa_key, a.cor, coalesce(p.geojson, a.geojson), a.visivel, coalesce(a.feature_colors, '{}'::jsonb)
  from public.apa_demarcacoes a
  left join public.apa_demarcacoes_publico p on p.id = a.id
  order by a.created_at;
$function$;

revoke all on function public.fn_publico_camadas() from public;
grant execute on function public.fn_publico_camadas() to anon, authenticated, service_role;
