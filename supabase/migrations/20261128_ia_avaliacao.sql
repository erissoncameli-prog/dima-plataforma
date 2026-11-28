-- ═══════════════════════════════════════════════════════════════════
-- DIMA · Assistente de IA — custo por resposta e avaliação (útil / não útil)
--
-- custo_usd: estimativa gravada na própria resposta, pela mesma tabela de
-- preço de fn_ia_consumo (fn_ia_preco) — o trigger calcula, ninguém informa.
-- avaliacao: 1 = útil, -1 = não útil; só a dona da conversa avalia, pela RPC.
-- ═══════════════════════════════════════════════════════════════════

alter table public.ia_mensagens add column if not exists custo_usd numeric(12,6);
alter table public.ia_mensagens add column if not exists avaliacao smallint check (avaliacao in (-1, 1));
alter table public.ia_mensagens add column if not exists avaliado_em timestamptz;

create or replace function public.fn_ia_mensagem_custo()
returns trigger
language plpgsql
set search_path = public
as $$
declare p record;
begin
  if new.papel = 'assistant' then
    select * into p from public.fn_ia_preco(coalesce(new.modelo, 'claude-sonnet-5-5'));
    new.custo_usd := round((coalesce(new.tokens_entrada, 0) * p.entrada + coalesce(new.tokens_saida, 0) * p.saida
      + coalesce(new.tokens_cache, 0) * p.cache_leitura + coalesce(new.tokens_cache_escrita, 0) * p.cache_escrita) / 1e6, 6);
  end if;
  return new;
end $$;
revoke execute on function public.fn_ia_mensagem_custo() from public, anon, authenticated;

create or replace trigger trg_ia_mensagem_custo
  before insert on public.ia_mensagens
  for each row execute function public.fn_ia_mensagem_custo();

-- Respostas já gravadas
update public.ia_mensagens m
   set custo_usd = (select round((coalesce(m.tokens_entrada, 0) * p.entrada + coalesce(m.tokens_saida, 0) * p.saida
       + coalesce(m.tokens_cache, 0) * p.cache_leitura + coalesce(m.tokens_cache_escrita, 0) * p.cache_escrita) / 1e6, 6)
       from public.fn_ia_preco(coalesce(m.modelo, 'claude-sonnet-5-5')) p)
 where m.papel = 'assistant' and m.custo_usd is null;

-- Avaliar a própria resposta (null = tirar a avaliação)
create or replace function public.fn_ia_avaliar(p_mensagem uuid, p_avaliacao integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'ia:sem_sessao' using errcode = '42501'; end if;
  if p_avaliacao is not null and p_avaliacao not in (-1, 1) then
    raise exception 'ia:avaliacao_invalida' using errcode = '22023';
  end if;
  update public.ia_mensagens
     set avaliacao = p_avaliacao, avaliado_em = case when p_avaliacao is null then null else now() end
   where id = p_mensagem and usuario_id = auth.uid() and papel = 'assistant' and expurgado_em is null;
  if not found then raise exception 'ia:mensagem_nao_encontrada' using errcode = 'P0002'; end if;
end $$;

revoke execute on function public.fn_ia_avaliar(uuid, integer) from public, anon;
grant execute on function public.fn_ia_avaliar(uuid, integer) to authenticated;
