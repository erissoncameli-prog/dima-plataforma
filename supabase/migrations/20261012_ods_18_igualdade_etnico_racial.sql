-- ODS 18 — Igualdade Étnico-Racial: objetivo voluntário do Brasil (proposto na 78ª AGNU,
-- set/2023; lançado no G20 Social, nov/2024; conduzido pela CNODS e pelo Ministério da
-- Igualdade Racial). Entra em ods_refs para poder ser vinculado aos indicadores da Matriz
-- e às atividades. Não é ODS da Agenda 2030 da ONU (17), por isso no_projeto = false.
-- Cor PROVISÓRIA (marrom-terra): o manual de identidade visual oficial não estava acessível;
-- trocar aqui quando houver o código oficial (update de ods_refs.cor).
insert into public.ods_refs (numero, titulo, emoji, cor, no_projeto, ordem, titulo_en, titulo_es)
values ('18', 'Igualdade Étnico-Racial', '✊', '#7B4B2A', false, 18, 'Ethnic-Racial Equality', 'Igualdad Étnico-Racial')
on conflict (numero) do nothing;
