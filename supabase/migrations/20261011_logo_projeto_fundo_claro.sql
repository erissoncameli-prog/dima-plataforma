-- A versão do Resiliência com letras escuras (para fundo claro) foi enviada na Zona A (topo) e aparecia duas vezes no
-- cabeçalho do A4 (no topo e, sobre placa, como logo do projeto). Vira a versão de fundo claro da logo do projeto
-- (que já tinha a de fundo escuro) e sai do topo. Só dado; idempotente.
update configuracoes_sistema c set
  logo_projeto = jsonb_set(coalesce(c.logo_projeto, '{}'::jsonb), '{url}', to_jsonb(r.l->>'url')),
  logos_topo = coalesce((select jsonb_agg(x order by (x->>'ordem')::int nulls last)
                          from jsonb_array_elements(c.logos_topo) x where x->>'url' is distinct from r.l->>'url'), '[]'::jsonb)
from (select projeto_id, x as l from configuracoes_sistema, jsonb_array_elements(logos_topo) x
       where x->>'url' like '%/plataforma-assets/logos/1791662965299_2ny75jqoevy.png') r
where c.projeto_id = r.projeto_id and c.projeto_id = 'default';
