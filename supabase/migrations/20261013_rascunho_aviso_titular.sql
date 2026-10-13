-- Rascunho criado por quem não é o titular da coordenação solicitante: avisa o titular no sino.
-- Só o titular envia o pedido para a cadeia (fn_rem_assinar / fn_tcan_assinar, etapa 1); sem aviso
-- o rascunho ficava parado sem ninguém saber (caso CAN do TDR 1.1.1-002, 13/10/2026).
-- Vale para pedido de remanejamento e de cancelamento de TDR. Um aviso por versão do rascunho,
-- quando ele fica completo (cancelamento: nota técnica + justificativa ≥ 30; remanejamento:
-- justificativa preenchida e ao menos um item ativo). Só sino (o check da fila de e-mail não tem
-- o evento e mudá-lo exige DROP); reaproveita os tipos *_analisar já liberados em notificacoes.

create or replace function public.fn_rascunho_avisar_titular()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_tit   uuid := public.fn_rem_titular('coordenacao_solicitante');
  v_tipo  text;
  v_tit_txt text;
  v_msg   text;
  v_link  text;
  v_ent   text;
  v_nome  text;
begin
  if new.status <> 'rascunho' or v_tit is null or v_tit = new.criado_por then return new; end if;
  if not exists (select 1 from public.usuarios where id = v_tit and ativo) then return new; end if;
  select nome_completo into v_nome from public.usuarios where id = new.criado_por;

  if tg_table_name = 'tdr_cancelamentos' then
    if new.nota_caminho is null or length(btrim(coalesce(new.justificativa, ''))) < 30 then return new; end if;
    v_tipo := 'tdr_cancelamento_analisar';
    v_ent  := 'tdr_cancelamento';
    v_link := 'remanejamentos.html?can=' || new.id;
    v_tit_txt := 'Cancelamento do TDR ' || coalesce(new.tdr_numero, '?') || ' (' || new.numero || ') aguarda seu envio para aprovação';
  else
    if coalesce(btrim(new.justificativa), '') in ('', '(rascunho)')
       or not exists (select 1 from public.remanejamento_itens i where i.remanejamento_id = new.id and i.ativo) then
      return new;
    end if;
    v_tipo := 'remanejamento_analisar';
    v_ent  := 'remanejamento';
    v_link := 'remanejamentos.html?id=' || new.id;
    v_tit_txt := 'Remanejamento ' || new.numero || ' aguarda seu envio para aprovação';
  end if;

  v_msg := 'Rascunho preparado por ' || coalesce(v_nome, 'outra pessoa') || ' (versão ' || new.versao
        || '). Só o titular da coordenação solicitante envia o pedido para a cadeia, com a senha.';

  if exists (select 1 from public.notificacoes n
              where n.usuario_id = v_tit and n.entidade_id = new.id and n.tipo = v_tipo and n.mensagem = v_msg) then
    return new;
  end if;

  begin
    insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
    values (v_tit, v_tipo, v_tit_txt, v_msg, v_link, v_ent, new.id);
  exception when others then null;   -- aviso nunca impede salvar o rascunho
  end;
  return new;
end $$;

revoke execute on function public.fn_rascunho_avisar_titular() from public, anon, authenticated;

create or replace trigger trg_tcan_rascunho_aviso
  after insert or update on public.tdr_cancelamentos
  for each row execute function public.fn_rascunho_avisar_titular();

create or replace trigger trg_rem_rascunho_aviso
  after insert or update on public.remanejamentos
  for each row execute function public.fn_rascunho_avisar_titular();

-- rascunhos que já estão parados recebem o aviso agora
update public.tdr_cancelamentos set atualizado_em = atualizado_em where status = 'rascunho';
update public.remanejamentos    set atualizado_em = atualizado_em where status = 'rascunho';
