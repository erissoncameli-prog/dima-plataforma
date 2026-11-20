-- Contrato rescindido (distrato) — 3/3: regularização do contrato 4500563116 (consultor individual).
--
-- O contrato foi encerrado em 12/10/2026 (antes do fluxo de distrato) devolvendo à atividade 2.1.4 todo o não
-- executado (produtos 3, 4 e 5 = R$ 57.000,00). O Termo de Distrato e Quitação Final (UNESCO, DocuSign
-- C8BF3E78-F679-87CB-81AD-E21006A49B3C, assinado em 27/10/2026) fixa a indenização ao contratado em
-- R$ 2.956,43 (5% da diária implícita R$ 394,19 × 150 dias restantes; teto 30% = R$ 28.500,00), que sai do
-- projeto. Decisão do super_admin (20/11/2026):
--   1) estornar a liberação de R$ 57.000,00 (status revertido — nada é apagado);
--   2) lançar nova liberação de R$ 54.043,57 com a MESMA cotação da original (PTAX de 09/10/2026), para o US$
--      não mudar só pela data;
--   3) lançar a indenização A PAGAR no Financeiro (a UNESCO efetiva com o câmbio dela);
--   4) contrato passa a `rescindido`. O termo de distrato vira tarefa "Anexar termo" (PDF pelo Contratos).
-- Idempotente: se o contrato já está rescindido, não faz nada.

do $$
declare
  v_admin uuid := (select id from public.usuarios where nome_completo = 'Erisson Cameli Santiago' and perfil = 'super_admin' and ativo limit 1);
  c       public.contratos%rowtype;
  e_old   public.contrato_encerramentos%rowtype;
  v_ind   numeric := 2956.43;
  v_lib   numeric;
  v_lanc  uuid;
  v_enc   uuid;
begin
  select * into c from public.contratos where numero = '4500563116';
  if c.id is null then raise notice 'contrato 4500563116 não encontrado — nada a fazer'; return; end if;
  if c.status = 'rescindido' then raise notice 'contrato 4500563116 já regularizado'; return; end if;
  if v_admin is null then raise exception 'super_admin da regularização não encontrado'; end if;

  select * into e_old from public.contrato_encerramentos
   where contrato_id = c.id and tipo = 'encerramento_contrato' and status = 'ativo';
  if e_old.id is null or e_old.valor_liberado_brl <> 57000 then
    raise exception 'liberação original de R$ 57.000,00 não encontrada — conferir antes de regularizar';
  end if;
  v_lib := e_old.valor_liberado_brl - v_ind;   -- 54.043,57

  perform set_config('dima.encerramento', 'efetivar', true);

  update public.contrato_encerramentos
     set status = 'revertido', revertido_por = v_admin, revertido_em = now(),
         motivo_reversao = 'Regularização do distrato (Termo de Distrato UNESCO de 27/10/2026): a indenização de R$ 2.956,43 '
                        || 'ao contratado não volta à atividade. Substituída por liberação de R$ 54.043,57.'
   where id = e_old.id;

  v_lanc := public.fn_rescisao_lancar_indenizacao(c.id, v_ind, v_admin,
    'Termo de Distrato e Quitação Final (UNESCO, DocuSign C8BF3E78-F679-87CB-81AD-E21006A49B3C, 27/10/2026). '
    || 'Termination Indemnity: 5% da diária implícita (R$ 394,19) × 150 dias restantes = R$ 2.956,43. '
    || 'Lançado na regularização do contrato rescindido.');

  perform set_config('dima.encerramento_resp_termo', v_admin::text, true);
  insert into public.contrato_encerramentos (contrato_id, atividade_id, tipo, valor_liberado_brl, valor_liberado_usd,
         cotacao, cotacao_data, motivo, produtos_afetados, autorizado_por,
         forma, indenizacao_brl, indenizacao_lancamento_id)
  values (c.id, e_old.atividade_id, 'encerramento_contrato', v_lib, round(v_lib / e_old.cotacao, 2),
          e_old.cotacao, e_old.cotacao_data,
          'Rescisão por distrato (Termo de Distrato e Quitação Final, UNESCO, 27/10/2026). Produtos 3, 4 e 5 cancelados '
          || '(R$ 57.000,00 não executados); indenização de R$ 2.956,43 ao contratado; R$ 54.043,57 devolvidos à atividade. '
          || 'Justificativa original: ' || e_old.motivo,
          e_old.produtos_afetados, v_admin,
          'distrato', v_ind, v_lanc)
  returning id into v_enc;
  perform set_config('dima.encerramento_resp_termo', '', true);

  update public.contratos set status = 'rescindido' where id = c.id;
  perform set_config('dima.encerramento', '', true);

  raise notice 'contrato 4500563116 rescindido: liberação % estornada, nova % (R$ %), indenização %', e_old.id, v_enc, v_lib, v_lanc;
end $$;
