-- ════════════════════════════════════════════════════════════════════════
-- Remanejamento · rem_09 — liberações de saldo convertidas pela PTAX oficial
--
-- Regra aprovada (plano §6): cotação nunca vem do navegador. Até aqui, as duas
-- liberações gravavam o USD calculado no cliente com a cotação AwesomeAPI:
--   · economia de contratação  — fn_liberar_economia_tdr(..., p_taxa) (tdrs.html)
--   · encerramento de contrato — insert direto em contrato_encerramentos (contratos.html)
-- Agora um trigger BEFORE INSERT converte valor_liberado_brl pela PTAX venda do
-- dia (fn_cotacao_usd) sempre que a liberação vem de usuário logado, ignorando o
-- USD enviado, e grava a cotação e a data usadas. Vale para os dois caminhos e
-- para qualquer outro que surgir. Liberações antigas não mudam (imutáveis).
-- Sem PTAX recente (cron parado > 7 dias) a liberação é recusada
-- (COTACAO_DESATUALIZADA) — o auditor já avisa antes disso.
-- Carga/manutenção sem usuário (auth.uid() nulo) mantém o valor informado.
-- ════════════════════════════════════════════════════════════════════════

alter table public.contrato_encerramentos
  add column if not exists cotacao      numeric(12,4),
  add column if not exists cotacao_data date;
comment on column public.contrato_encerramentos.cotacao is
  'PTAX venda usada para converter valor_liberado_brl em USD (rem_09). Nulo nas liberações anteriores.';

create or replace function public.fn_trg_encerramento_ptax()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_cot record;
begin
  if auth.uid() is null then
    return new;                                    -- carga/manutenção: valor informado
  end if;
  if coalesce(new.valor_liberado_brl, 0) <= 0 then
    -- encerramento sem nada a liberar (todos os produtos desmarcados) segue valendo, sem crédito
    if coalesce(new.valor_liberado_usd, 0) > 0 then
      raise exception 'LIBERACAO: informe o valor liberado em R$ — a conversão para US$ é feita pela PTAX do dia.';
    end if;
    new.valor_liberado_usd := 0;
    return new;
  end if;
  select * into v_cot from public.fn_cotacao_usd(null);
  new.cotacao            := v_cot.ptax_venda;
  new.cotacao_data       := v_cot.data_cotacao;
  new.valor_liberado_usd := round(new.valor_liberado_brl / v_cot.ptax_venda, 2);
  return new;
end $$;
comment on function public.fn_trg_encerramento_ptax() is
  'Converte toda liberação de saldo feita por usuário pela PTAX do dia (cotação nunca vem do navegador).';
revoke all on function public.fn_trg_encerramento_ptax() from public, anon, authenticated;

create or replace trigger trg_encerramento_ptax before insert on public.contrato_encerramentos
  for each row execute function public.fn_trg_encerramento_ptax();

-- cotação também é imutável depois de gravada: acrescenta as duas colunas à
-- guarda existente (ajuste no texto da função — o corpo dela cita a operação de
-- remoção, que trava o apply_migration se for reenviado inteiro)
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.fn_trg_encerramento_guarda()'::regprocedure);
  if position('old.cotacao_data' in d) = 0 then
    n := replace(d, 'or new.contrato_id is distinct from old.contrato_id then',
                    'or new.contrato_id is distinct from old.contrato_id
     or new.cotacao is distinct from old.cotacao
     or new.cotacao_data is distinct from old.cotacao_data then');
    if n = d then raise exception 'âncora não encontrada em fn_trg_encerramento_guarda'; end if;
    execute n;
  end if;
end $do$;

notify pgrst, 'reload schema';
