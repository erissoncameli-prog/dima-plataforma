-- ⚠️ COLAR NO SQL EDITOR do Supabase (o apply_migration trava em texto com DELETE).
-- apagar_tdr: o teste antigo `fn_perfil_atual() <> 'super_admin'` deixava passar quem não tinha perfil (NULL):
-- sem login ou com a conta desativada. Agora só super_admin ATIVO (NOT EXISTS, como fn_resetar_senha_usuario).
-- O EXECUTE de anon/public já foi retirado em 20261011_seg_funcoes_publicas.sql; este arquivo fecha o caso de
-- conta desativada com sessão ainda válida. O resto do corpo é igual ao anterior.
create or replace function public.apagar_tdr(p_tdr_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tem_contrato boolean;
  v_tem_financeiro boolean;
begin
  if not exists (select 1 from usuarios where id = auth.uid() and perfil = 'super_admin' and ativo) then
    raise exception 'Apenas super_admin pode apagar um TDR.' using errcode = '42501';
  end if;

  select exists(select 1 from contratos where tdr_id = p_tdr_id) into v_tem_contrato;
  select exists(select 1 from execucao_financeira where tdr_id = p_tdr_id) into v_tem_financeiro;

  if v_tem_contrato then
    raise exception 'TDR possui contrato vinculado — desvincule ou apague o contrato antes.';
  end if;
  if v_tem_financeiro then
    raise exception 'TDR possui execução financeira vinculada — não pode ser apagado.';
  end if;

  delete from tdr_versoes where tdr_id = p_tdr_id;
  delete from tdr_comentarios where tdr_id = p_tdr_id;
  delete from tdr_produtos_previstos where tdr_id = p_tdr_id;
  delete from tdr_responsaveis where tdr_id = p_tdr_id;
  delete from tdr_confirmacoes where tdr_id = p_tdr_id;
  delete from tdr_versoes_editor where tdr_id = p_tdr_id;
  delete from tdr_anexos where tdr_id = p_tdr_id;
  update produtos_entregues set tdr_id = null where tdr_id = p_tdr_id;

  alter table tdr_acoes disable rule tdr_acoes_no_delete;
  delete from tdr_acoes where tdr_id = p_tdr_id;
  alter table tdr_acoes enable rule tdr_acoes_no_delete;

  delete from tdrs where id = p_tdr_id;
end;
$function$;

revoke execute on function public.apagar_tdr(uuid) from public, anon;
grant execute on function public.apagar_tdr(uuid) to authenticated;
