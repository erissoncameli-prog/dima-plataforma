-- ═══════════════════════════════════════════════════════════════════════════
-- LGPD · Camada 0 (Contenção) · 03 — Mascaramento irreversível do CPF/CNPJ do CAR
--
-- CONTEXTO
-- `car_dados_locais` armazenava CPF/CNPJ em texto puro de 53.594 proprietários
-- e possuidores rurais, importados do SICAR. O SICAR público NÃO expõe CPF —
-- não há base legal para a plataforma republicá-lo, e o dado não é necessário
-- a nenhuma funcionalidade (art. 6º, III — necessidade).
--
-- O `mapa.html` apenas exibia o valor mascarado em tela; o dado bruto trafegava
-- até o navegador. Máscara no cliente é cosmética — esta migração remove o dado
-- na origem.
--
-- FORMATO DOS DADOS
-- 45.972 linhas com 1 CPF · 4.436 com 1 CNPJ · 3.186 linhas de copropriedade
-- com múltiplos documentos separados por vírgula (até 47 numa mesma linha).
-- Cada documento da lista é mascarado individualmente.
--
-- ⚠️ IRREVERSÍVEL no banco. O dado original permanece disponível na fonte
--    (SICAR), caso um dia haja base legal e necessidade para reimportá-lo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Função de mascaramento (reutilizável em futuras importações) ───────
create or replace function public.fn_mascara_doc(p_doc text)
returns text
language sql
immutable
as $$
  select case
    when p_doc is null or btrim(p_doc) = '' then null
    else (
      select string_agg(
               case
                 when length(d) = 11 then '***.***.***-'      || right(d, 2)
                 when length(d) = 14 then '**.***.***/****-'  || right(d, 2)
                 when length(d) >= 3 then repeat('*', length(d) - 2) || right(d, 2)
                 else '***'
               end, ', ' order by ord)
      from (
        select regexp_replace(t, '\D', '', 'g') as d, ord
        from unnest(string_to_array(p_doc, ',')) with ordinality as u(t, ord)
      ) x
      where d <> ''
    )
  end;
$$;

comment on function public.fn_mascara_doc(text) is
  'Mascara CPF/CNPJ preservando apenas os 2 últimos dígitos. Aceita listas '
  'separadas por vírgula (copropriedade). Usar em toda importação do SICAR.';

-- ── 2. Substitui a coluna sensível pela versão mascarada ──────────────────
alter table public.car_dados_locais add column if not exists cpf_cnpj_mascara text;

update public.car_dados_locais
   set cpf_cnpj_mascara = public.fn_mascara_doc(cpf_cnpj)
 where cpf_cnpj is not null;

alter table public.car_dados_locais drop column if exists cpf_cnpj;

comment on column public.car_dados_locais.cpf_cnpj_mascara is
  'CPF/CNPJ mascarado de forma irreversível (apenas 2 últimos dígitos). '
  'Destina-se a conferência visual, não a cruzamento de dados. LGPD art. 6º, III.';
