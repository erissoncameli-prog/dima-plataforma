-- Teste de 20261026_seg_responsaveis_notificacoes (colar no SQL Editor).
-- Tudo é desfeito: o bloco termina com raise exception e mostra o resultado na mensagem.
-- Esperado: TEC recusado/0 linhas em tudo, exceto "notif p/ si: ok"; COORD ok e 1 linha; ANON recusado.
do $$
declare
  v_tec uuid; v_coord uuid; v_sa uuid; v_atv uuid; v_resp uuid; v_n int;
  r text := '';
begin
  select id into v_tec   from usuarios where perfil='tecnico' and ativo limit 1;
  select id into v_coord from usuarios where perfil='coordenacao' and ativo limit 1;
  select id into v_sa    from usuarios where perfil='super_admin' and ativo limit 1;
  select a.id into v_atv from atividades a
   where not exists (select 1 from atividade_responsaveis ar where ar.atividade_id=a.id and ar.usuario_id=v_tec and ar.ativo) limit 1;
  select id into v_resp from atividade_responsaveis where ativo limit 1;

  -- técnico
  perform set_config('request.jwt.claims', json_build_object('sub',v_tec,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    insert into atividade_responsaveis(atividade_id,usuario_id,papel,designado_por) values (v_atv,v_tec,'responsavel',v_tec);
    r := r || 'TEC insert responsavel: PASSOU (FALHA) | ';
  exception when others then r := r || 'TEC insert responsavel: recusado | '; end;
  begin
    insert into atividade_responsaveis(atividade_id,usuario_id,papel,designado_por) values (v_atv,v_tec,'substituto',v_tec);
    r := r || 'TEC insert substituto: PASSOU (FALHA) | ';
  exception when others then r := r || 'TEC insert substituto: recusado | '; end;
  update atividade_responsaveis set usuario_id=v_tec where id=v_resp; get diagnostics v_n=row_count;
  r := r || 'TEC update: '||v_n||' linhas | ';
  delete from atividade_responsaveis where id=v_resp; get diagnostics v_n=row_count;
  r := r || 'TEC exclusao: '||v_n||' linhas | ';
  begin
    insert into notificacoes(usuario_id,tipo,titulo,mensagem,lida) values (v_sa,'tarefa_observador','forjado','x',false);
    r := r || 'TEC notif p/ outro: PASSOU (FALHA) | ';
  exception when others then r := r || 'TEC notif p/ outro: recusado | '; end;
  begin
    insert into notificacoes(usuario_id,tipo,titulo,mensagem,lida) values (v_tec,'tarefa_observador','proprio','x',false);
    r := r || 'TEC notif p/ si: ok | ';
  exception when others then r := r || 'TEC notif p/ si: recusado ('||sqlerrm||') | '; end;

  -- coordenação
  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub',v_coord,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    insert into atividade_responsaveis(atividade_id,usuario_id,papel,designado_por) values (v_atv,v_tec,'substituto',v_coord) returning id into v_resp;
    r := r || 'COORD insert: ok | ';
    update atividade_responsaveis set ativo=false, dt_fim=current_date where id=v_resp; get diagnostics v_n=row_count;
    r := r || 'COORD desativar: '||v_n||' linhas | ';
  exception when others then r := r || 'COORD insert: recusado ('||sqlerrm||') | '; end;

  -- sem login
  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role','anon', true);
  begin
    insert into notificacoes(usuario_id,tipo,titulo,mensagem,lida) values (v_sa,'tarefa_observador','anon','x',false);
    r := r || 'ANON notif: PASSOU (FALHA)';
  exception when others then r := r || 'ANON notif: recusado'; end;

  raise exception 'RESULTADO (desfeito): %', r;
end $$;
