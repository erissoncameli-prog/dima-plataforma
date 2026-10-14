-- Nota técnica: depois de conferida e aprovada, a entrega fica com ESSA nota.
-- A Edge Function recusa outra nota (só super_admin troca) e a trava de aprovação passa a exigir que a
-- nota gravada na entrega seja a da ÚLTIMA conferência da entrega (qualquer arquivo), aprovada e recente.
create or replace function public.fn_trg_entrega_exige_nota()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_cam text; v_ult record;
begin
  if new.situacao is distinct from 'aprovada' then return new; end if;
  if tg_op = 'UPDATE' and old.situacao = 'aprovada'
     and new.nota_tecnica_url is not distinct from old.nota_tecnica_url then
    return new;   -- já aprovada antes; nada mudou na nota
  end if;
  if current_setting('dima.nota_tecnica', true) = 'dispensar' then return new; end if;

  v_cam := public.fn_nt_caminho(new.nota_tecnica_url);
  if v_cam is null then
    raise exception 'NOTA_TECNICA_OBRIGATORIA: anexe a nota técnica (PDF do SEI) para aprovar o produto.';
  end if;
  select caminho, aprovada, conferido_em into v_ult
    from public.nota_tecnica_conferencias
   where entrega_id = new.id and origem = 'tela'
   order by conferido_em desc limit 1;
  if not found or not v_ult.aprovada or v_ult.caminho is distinct from v_cam
     or v_ult.conferido_em <= now() - interval '2 days' then
    raise exception 'NOTA_TECNICA_NAO_CONFERIDA: a nota técnica anexada não é a última conferida e aprovada desta entrega — anexe a nota corrigida.';
  end if;
  return new;
end $$;
revoke execute on function public.fn_trg_entrega_exige_nota() from public, anon, authenticated;
