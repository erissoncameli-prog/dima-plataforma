-- Trava de saldo do TDR (trg_tdr_saldo) para TDR de execução direta.
--
-- O razão debita a execução direta como max(reserva dos TDRs execucao_direta, despesas realizadas sem contrato)
-- (vw_orcamento_debitos). A trava comparava o aumento inteiro do TDR com o livre, então recusava aumento que
-- não muda o débito (ex.: 2.1.7 — TDR de passagens absorvendo o de diárias, já com gasto acima da reserva
-- restante). Agora, para TDR de execução direta, o aumento considerado é o do débito real:
--   max(outros + depois, realizado) − max(outros + antes, realizado).
-- Demais TDRs seguem como antes.

create or replace function public.fn_trg_verificar_saldo()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_antes numeric := 0; v_depois numeric := 0; v_livre numeric; v_codigo text;
  v_delta numeric; v_outros numeric; v_real numeric;
begin
  if tg_op = 'UPDATE' then
    if new.status = 'cancelado' and old.status <> 'cancelado'
       and exists (select 1 from public.contratos c where c.tdr_id = new.id and c.status <> 'cancelado') then
      raise exception 'TDR_COM_CONTRATO: o TDR % tem contrato ativo — cancele/encerre o contrato antes.', new.numero;
    end if;
    if new.atividade_id is distinct from old.atividade_id
       and exists (select 1 from public.contratos c where c.tdr_id = new.id and c.status <> 'cancelado') then
      raise exception 'TDR_COM_CONTRATO: o TDR % tem contrato — não muda de atividade.', new.numero;
    end if;
    if old.status <> 'cancelado' and old.atividade_id = new.atividade_id then
      v_antes := coalesce(old.valor_usd, 0);
    end if;
  end if;
  if new.status <> 'cancelado' then v_depois := coalesce(new.valor_usd, 0); end if;
  if v_depois <= v_antes then return new; end if;

  perform 1 from public.atividades where id = new.atividade_id for update;

  v_delta := v_depois - v_antes;
  -- execução direta: só conta o que aumenta o débito real (reserva × realizado, o maior)
  if coalesce(new.execucao_direta, false)
     and (v_antes = 0 or (tg_op = 'UPDATE' and coalesce(old.execucao_direta, false))) then
    select coalesce(sum(x.valor_usd), 0) into v_outros
      from public.tdrs x
     where x.atividade_id = new.atividade_id and x.execucao_direta
       and x.status <> 'cancelado' and x.id <> new.id;
    select coalesce(d.execucao_direta_realizada_usd, 0) into v_real
      from public.vw_orcamento_debitos d where d.atividade_id = new.atividade_id;
    v_real := coalesce(v_real, 0);
    v_delta := greatest(v_outros + v_depois, v_real) - greatest(v_outros + v_antes, v_real);
    if v_delta <= 0 then return new; end if;
  end if;

  v_livre := fn_cob_livre(new.atividade_id);
  if v_delta > greatest(0, v_livre) then
    select codigo into v_codigo from public.atividades where id = new.atividade_id;
    raise exception 'SALDO_INSUFICIENTE: o TDR compromete US$ % e a atividade % tem US$ % livre '
                    '(descontados TDRs, contratos acima do TDR, execução direta e reservas de remanejamento). '
                    'Solicite remanejamento.',
      round(v_delta, 2), v_codigo, round(greatest(0, v_livre), 2);
  end if;
  return new;
end $function$;
