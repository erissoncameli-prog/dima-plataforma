-- 10/10/2026 · Logos: cada uma passa a ter versão para fundo claro (`url`) e, opcional, para fundo
-- escuro (`url_escuro`) — regra em js/logos.js e supabase/functions/_shared/logos-email.ts.
-- Só dados: as colunas jsonb já existem. Acerta o que estava cadastrado:
--   · Governo do Acre (topo) foi enviado na versão de texto branco ⇒ vira `url_escuro`; `url` = versão
--     verde do repositório (/assets/3-vertical-verde-conjunto-1024x805.png).
--   · SEMA (topo) está na versão verde ⇒ ganha `url_escuro` = /assets/sema-branco.png.
--   · Logo do projeto: hoje só aparece sobre fundo escuro (entrada) ⇒ vira `url_escuro`.
--   · Nomes (alt) legíveis no lugar do nome do arquivo.

update public.configuracoes_sistema c
   set logos_topo = (
         select coalesce(jsonb_agg(
           case
             when e->>'alt' ilike '%acre%' and e->>'alt' ilike '%branco%'
               then e || jsonb_build_object('alt', 'Governo do Acre', 'url_escuro', e->>'url',
                                            'url', '/assets/3-vertical-verde-conjunto-1024x805.png')
             when e->>'alt' ilike '%horizontal-verde%' and coalesce(e->>'url_escuro', '') = ''
               then e || jsonb_build_object('alt', 'SEMA/AC', 'url_escuro', '/assets/sema-branco.png')
             else e
           end order by n), '[]'::jsonb)
           from jsonb_array_elements(c.logos_topo) with ordinality as t(e, n)),
       logo_projeto = case
         when coalesce(c.logo_projeto->>'url', '') <> '' and coalesce(c.logo_projeto->>'url_escuro', '') = ''
           then c.logo_projeto || jsonb_build_object('url', '', 'url_escuro', c.logo_projeto->>'url', 'alt', 'Projeto DIMA')
         else c.logo_projeto end,
       logos_parceiros = (
         select coalesce(jsonb_agg(
           e || jsonb_build_object('alt',
             case
               when e->>'alt' ilike 'UNCT%' then 'ONU Brasil'
               when e->>'alt' ilike 'UNESCO%' then 'UNESCO'
               when e->>'alt' ilike 'Fundo_Brasil%' then 'Fundo Brasil-ONU'
               when e->>'alt' ilike '%Cons_rcio%' then 'Consórcio Amazônia Legal'
               else e->>'alt'
             end) order by n), '[]'::jsonb)
           from jsonb_array_elements(c.logos_parceiros) with ordinality as t(e, n)),
       atualizado_em = now()
 where c.projeto_id = 'default';
