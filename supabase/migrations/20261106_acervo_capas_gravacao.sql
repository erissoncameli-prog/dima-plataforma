-- ═══════════════════════════════════════════════════════════════════════
-- ACERVO — quem grava capa, e títulos dos produtos já na Galeria pública
-- ═══════════════════════════════════════════════════════════════════════
-- 1. Capas (acervo_capas + bucket acervo-capas). Antes, qualquer usuário logado
--    gravava qualquer linha e qualquer arquivo (policies WITH CHECK true / só
--    bucket_id) — e a capa de produto liberado vai para o site público
--    (Edge Function publico-capa). Agora:
--      • grava só quem enxerga o produto (vw_acervo_obras é security_invoker:
--        a RLS de contratos decide) e só a capa da edição vigente
--        (capa_midia_id), no caminho que js/acervo-capas.js monta;
--      • capa de arquivo liberado no portal (vw_acervo_publicacoes.valida) só o
--        super_admin troca.
--    A geração automática do Acervo (o 1º que rola o pôster gera) segue igual
--    para quem vê o produto. As policies do bucket ficam em
--    20261106_acervo_capas_gravacao_sql_editor.sql (storage.objects pede o SQL
--    Editor na Cloud).
-- 2. Títulos: os Produtos 3 e 5 do contrato de análises geoespaciais da APA
--    Lago do Amapá, liberados na Galeria em 09/10, estavam cadastrados como
--    "Produto 03"/"Produto 05". Título tirado da capa do próprio documento.
-- ═══════════════════════════════════════════════════════════════════════

-- Pode gravar a capa desta mídia desta obra?
create or replace function public.fn_acervo_capa_pode_gravar(p_obra_id uuid, p_midia_id text)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select exists (
           select 1 from vw_acervo_obras o
           where o.obra_id = p_obra_id and o.capa_midia_id = p_midia_id)
     and (fn_perfil_atual() = 'super_admin'
          or not exists (select 1 from vw_acervo_publicacoes p
                         where p.midia_id = p_midia_id and p.valida))
$function$;

-- Mesma regra pelo nome do arquivo no bucket (<obra_id>/<midia_id saneado>.jpg)
create or replace function public.fn_acervo_capa_objeto_pode_gravar(p_nome text)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select exists (
    select 1 from vw_acervo_obras o
    where o.obra_id::text = split_part(p_nome, '/', 1)
      and o.capa_midia_id is not null
      and p_nome = o.obra_id::text || '/' || regexp_replace(o.capa_midia_id, '[^a-zA-Z0-9._-]', '_', 'g') || '.jpg'
      and public.fn_acervo_capa_pode_gravar(o.obra_id, o.capa_midia_id))
$function$;

revoke all on function public.fn_acervo_capa_pode_gravar(uuid, text) from public, anon;
revoke all on function public.fn_acervo_capa_objeto_pode_gravar(text) from public, anon;
grant execute on function public.fn_acervo_capa_pode_gravar(uuid, text) to authenticated, service_role;
grant execute on function public.fn_acervo_capa_objeto_pode_gravar(text) to authenticated, service_role;

-- Tabela acervo_capas: ALTER POLICY (troca a regra sem apagar a policy)
alter policy acervo_capas_insert on public.acervo_capas
  to authenticated
  with check (
    public.fn_acervo_capa_pode_gravar(obra_id, midia_id)
    and (arquivo_url is null
         or arquivo_url like '%/acervo-capas/' || obra_id::text || '/'
                             || regexp_replace(midia_id, '[^a-zA-Z0-9._-]', '_', 'g') || '.jpg'));

alter policy acervo_capas_update on public.acervo_capas
  to authenticated
  using (public.fn_acervo_capa_pode_gravar(obra_id, midia_id))
  with check (
    public.fn_acervo_capa_pode_gravar(obra_id, midia_id)
    and (arquivo_url is null
         or arquivo_url like '%/acervo-capas/' || obra_id::text || '/'
                             || regexp_replace(midia_id, '[^a-zA-Z0-9._-]', '_', 'g') || '.jpg'));

-- Títulos dos dois produtos já publicados (só se ainda estiverem genéricos)
update public.contratos_produtos
   set descricao = 'Produto 03 – Classificação temática de uso e cobertura do solo da Área de Proteção Ambiental Lago do Amapá'
 where id = '5a33c67d-8273-4911-99b3-dbbb9ca04c71' and descricao = 'Produto 03';

update public.contratos_produtos
   set descricao = 'Produto 05 – Mapeamento e análise da dinâmica de uso e cobertura do solo no entorno da Área de Proteção Ambiental Lago do Amapá'
 where id = 'ac85d200-e54c-455f-bab6-77137a07b466' and descricao = 'Produto 05';
