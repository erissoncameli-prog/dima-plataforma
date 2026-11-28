-- ═══════════════════════════════════════════════════════════════════
-- DIMA · Assistente de IA — quadro de consumo (custo estimado por pessoa)
--
-- O custo real é cobrado pela Anthropic na conta dona da ANTHROPIC_API_KEY;
-- aqui é uma ESTIMATIVA pelos tokens gravados em ia_mensagens e pelo preço de
-- tabela do modelo (fn_ia_preco). Preço mudou ⇒ mudar fn_ia_preco.
-- ═══════════════════════════════════════════════════════════════════

alter table public.ia_mensagens add column if not exists tokens_cache_escrita integer;
alter table public.ia_conversas add column if not exists tokens_cache_escrita bigint not null default 0;

-- US$ por 1 milhão de tokens: entrada, saída, leitura de cache, escrita de cache (5 min = 1,25 × entrada)
create or replace function public.fn_ia_preco(p_modelo text,
  out entrada numeric, out saida numeric, out cache_leitura numeric, out cache_escrita numeric)
language sql immutable
as $$
  select case
    when p_modelo like 'claude-sonnet-5-5%' then 2.00
    when p_modelo like 'claude-sonnet-5%'   then 2.00
    when p_modelo like 'claude-haiku-5-5%'  then 0.10
    when p_modelo like 'claude-opus-5-5%'   then 4.00
    else 3.00 end,
  case
    when p_modelo like 'claude-sonnet-5-5%' then 10.00
    when p_modelo like 'claude-sonnet-5%'   then 10.00
    when p_modelo like 'claude-haiku-5-5%'  then 0.50
    when p_modelo like 'claude-opus-5-5%'   then 20.00
    else 15.00 end,
  case
    when p_modelo like 'claude-sonnet-5-5%' then 0.10
    when p_modelo like 'claude-sonnet-5%'   then 0.20
    when p_modelo like 'claude-haiku-5-5%'  then 0.01
    when p_modelo like 'claude-opus-5-5%'   then 0.20
    else 0.30 end,
  case
    when p_modelo like 'claude-sonnet-5-5%' then 2.50
    when p_modelo like 'claude-sonnet-5%'   then 2.50
    when p_modelo like 'claude-haiku-5-5%'  then 0.125
    when p_modelo like 'claude-opus-5-5%'   then 5.00
    else 3.75 end
$$;

-- Consumo no período: super_admin vê todas as pessoas; os demais, só o próprio.
create or replace function public.fn_ia_consumo(p_inicio date, p_fim date)
returns table (
  usuario_id uuid, nome text, perguntas bigint, conversas bigint,
  tokens_entrada bigint, tokens_saida bigint, tokens_cache bigint, tokens_cache_escrita bigint,
  custo_usd numeric, ultima timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_todos boolean;
begin
  if auth.uid() is null then raise exception 'ia:sem_sessao' using errcode = '42501'; end if;
  v_todos := exists (select 1 from public.usuarios u where u.id = auth.uid() and u.ativo and u.perfil = 'super_admin');

  return query
  select m.usuario_id,
         u.nome_completo::text,
         count(*) filter (where m.papel = 'user'),
         count(distinct m.conversa_id),
         coalesce(sum(m.tokens_entrada), 0)::bigint,
         coalesce(sum(m.tokens_saida), 0)::bigint,
         coalesce(sum(m.tokens_cache), 0)::bigint,
         coalesce(sum(m.tokens_cache_escrita), 0)::bigint,
         round(coalesce(sum(
           (coalesce(m.tokens_entrada, 0) * p.entrada + coalesce(m.tokens_saida, 0) * p.saida
            + coalesce(m.tokens_cache, 0) * p.cache_leitura + coalesce(m.tokens_cache_escrita, 0) * p.cache_escrita) / 1e6
         ) filter (where m.papel = 'assistant'), 0), 4),
         max(m.criado_em)
    from public.ia_mensagens m
    join public.usuarios u on u.id = m.usuario_id
    cross join lateral public.fn_ia_preco(coalesce(m.modelo, 'claude-sonnet-5-5')) p
   where m.criado_em >= p_inicio::timestamptz
     and m.criado_em < (p_fim + 1)::timestamptz
     and (v_todos or m.usuario_id = auth.uid())
   group by m.usuario_id, u.nome_completo
   order by 9 desc;
end $$;

revoke execute on function public.fn_ia_consumo(date, date) from public, anon;
grant execute on function public.fn_ia_consumo(date, date) to authenticated;
revoke execute on function public.fn_ia_preco(text) from public, anon;
grant execute on function public.fn_ia_preco(text) to authenticated, service_role;

-- O assistente passou a consultar tarefas e pessoas (nomes de colegas vão à IA)
update public.lgpd_tratamentos
   set categorias_dados = array[
         'texto das perguntas e respostas (pode citar nomes de fornecedores ou pessoas digitados pela própria pessoa)',
         'nomes de colegas responsáveis por tarefas e atividades, quando a pergunta é sobre eles',
         'data e hora, consultas feitas e quantidade de tokens'],
       compartilhamento = 'Anthropic recebe a pergunta e o resultado das consultas (inclusive nomes de responsáveis por '
         || 'tarefas e atividades), com CPF/CNPJ e e-mail mascarados antes do envio. Cada pessoa vê só as próprias conversas; '
         || 'o consumo por pessoa (sem o texto) é visto pelo super_admin.',
       atualizado_em = now()
 where codigo = 'TRAT-009';
