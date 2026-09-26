-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 09 — questionário v2: escolaridade fechada
--
-- Decisão de 26/09/2026: a Escolaridade da tabela de moradores (P9) deixa de
-- ser texto livre com sugestões e passa a lista fechada, do "Não
-- alfabetizado" ao "Mestrado completo", com completo/incompleto.
-- A v1 publicada é IMUTÁVEL (trigger) → a mudança é a v2, cópia fiel da v1
-- (mesmo aviso ao entrevistado) com só essa coluna trocada. A v1 é arquivada:
-- ficha começada nela no aparelho continua sendo aceita (o envio recusa só
-- versão em rascunho) e é validada pela estrutura da v1.
--
-- fn_diag_validar_moradores passa a conferir QUALQUER coluna 'unica' da
-- tabela de moradores contra as opções da versão da ficha (antes, só
-- sexo/gênero).
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.fn_diag_validar_moradores(p_estrutura jsonb, p_moradores jsonb)
returns void language plpgsql immutable set search_path = public as $$
declare
  v_m      jsonb;
  v_col    jsonb;
  v_ords   int[] := '{}';
begin
  if jsonb_typeof(coalesce(p_moradores,'[]')) <> 'array' or jsonb_array_length(coalesce(p_moradores,'[]')) > 30 then
    raise exception 'diag:morador_invalido: lista de moradores inválida';
  end if;
  for v_m in select * from jsonb_array_elements(coalesce(p_moradores,'[]')) loop
    if not ((v_m->>'ordem') ~ '^\d+$') or (v_m->>'ordem')::int = any(v_ords) then
      raise exception 'diag:morador_invalido: ordem ausente ou repetida';
    end if;
    v_ords := v_ords || (v_m->>'ordem')::int;
    -- toda coluna de lista fechada: valor das opções, "_nr" ou vazio
    for v_col in select c from jsonb_array_elements(p_estrutura->'moradores'->'colunas') c
                 where c->>'tipo' = 'unica' loop
      if v_m ? (v_col->>'chave') and v_m->(v_col->>'chave') not in ('null'::jsonb, '""'::jsonb, '"_nr"'::jsonb)
         and not exists (select 1 from jsonb_array_elements(v_col->'opcoes') o
                         where o->'v' = v_m->(v_col->>'chave')) then
        raise exception 'diag:morador_invalido: % fora das opções', lower(v_col->>'rotulo');
      end if;
    end loop;
    if nullif(v_m->>'sexo_genero_outro','') is not null and coalesce(v_m->>'sexo_genero','') <> 'outro' then
      raise exception 'diag:morador_invalido: especifique sem a opção Outro';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(coalesce(p_moradores,'[]')) m
      where coalesce((m->>'e_entrevistado')::boolean, false)) > 1 then
    raise exception 'diag:morador_invalido: mais de um morador marcado como entrevistado';
  end if;
end $$;

-- v2 = v1 com a coluna escolaridade trocada (idempotente: só cria se não existe)
do $$
declare
  v1   diag_questionarios;
  est  jsonb;
  idx  int;
  esc  jsonb := $j${"chave":"escolaridade","rotulo":"Escolaridade","tipo":"unica","opcoes":[
    {"v":"nao_se_aplica_menor_4","r":"Não se aplica (menor de 4 anos)","g":"Sem escolarização"},
    {"v":"nao_alfabetizado","r":"Não alfabetizado(a)","g":"Sem escolarização"},
    {"v":"alfabetizado_sem_escola","r":"Alfabetizado(a), sem estudo formal","g":"Sem escolarização"},
    {"v":"educacao_infantil","r":"Educação infantil (creche/pré-escola)","g":"Sem escolarização"},
    {"v":"fundamental_incompleto","r":"Fundamental incompleto","g":"Educação básica"},
    {"v":"fundamental_completo","r":"Fundamental completo","g":"Educação básica"},
    {"v":"medio_incompleto","r":"Médio incompleto","g":"Educação básica"},
    {"v":"medio_completo","r":"Médio completo","g":"Educação básica"},
    {"v":"superior_incompleto","r":"Superior incompleto","g":"Ensino superior"},
    {"v":"superior_completo","r":"Superior completo","g":"Ensino superior"},
    {"v":"especializacao_incompleta","r":"Especialização incompleta","g":"Ensino superior"},
    {"v":"especializacao_completa","r":"Especialização completa","g":"Ensino superior"},
    {"v":"mestrado_incompleto","r":"Mestrado incompleto","g":"Ensino superior"},
    {"v":"mestrado_completo","r":"Mestrado completo","g":"Ensino superior"},
    {"v":"nao_sabe","r":"Não sabe informar","g":"Outro"}]}$j$::jsonb;
begin
  if exists (select 1 from diag_questionarios where codigo = 'DSA' and estrutura->>'mudanca_v2' is not null) then
    return;
  end if;
  select * into v1 from diag_questionarios where codigo = 'DSA' and versao = 1;
  if v1.id is null then raise exception 'questionário DSA v1 não encontrado'; end if;
  select i - 1 into idx
    from jsonb_array_elements(v1.estrutura->'moradores'->'colunas') with ordinality as c(col, i)
   where col->>'chave' = 'escolaridade';
  est := jsonb_set(v1.estrutura, array['moradores','colunas', idx::text], esc);
  est := est || jsonb_build_object('versao', 2,
           'mudanca_v2', 'P9: escolaridade em lista fechada (26/09/2026)');

  insert into diag_questionarios (codigo, versao, titulo, estrutura, aviso_entrevistado)
  values ('DSA', 2, v1.titulo, est, v1.aviso_entrevistado);
  -- em produção a v1 já está publicada: publica a v2 e arquiva a v1.
  -- (no banco de teste local a v1 ainda é rascunho; a v2 fica rascunho também)
  if v1.status = 'publicado' then
    update diag_questionarios set status = 'publicado' where codigo = 'DSA' and versao = 2;
    update diag_questionarios set status = 'arquivado' where id = v1.id;
  end if;
end $$;
