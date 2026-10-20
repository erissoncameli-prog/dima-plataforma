-- TDR sem valor não compromete saldo e passa pelas travas de orçamento sem ser contado.
-- Valor (R$ e US$) passa a ser obrigatório: TDR novo não nasce sem valor e TDR sem valor
-- não muda de fase (exceto para cancelado). TDRs antigos sem valor continuam editáveis
-- para receber o valor.
create or replace function public.fn_trg_tdr_exige_valor()
returns trigger language plpgsql as $$
begin
  if coalesce(new.valor_brl, 0) <= 0 or coalesce(new.valor_usd, 0) <= 0 then
    if tg_op = 'INSERT'
       or (old.valor_brl is not null and new.valor_brl is distinct from old.valor_brl)
       or (new.status is distinct from old.status and new.status <> 'cancelado') then
      raise exception 'TDR_SEM_VALOR: informe o valor do TDR (R$ e US$) antes de salvar ou mudar de fase.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.fn_trg_tdr_exige_valor() from public, anon;

create or replace trigger trg_tdr_exige_valor
  before insert or update of valor_brl, valor_usd, status on public.tdrs
  for each row execute function public.fn_trg_tdr_exige_valor();
