-- Pulso da Equipe · ajuste: cadastrado também grava o hash do aparelho.
-- Sem isso, quem respondeu logado podia voltar no MESMO aparelho como
-- convidado e responder de novo. A checagem do convidado já procura o hash
-- em qualquer linha; o índice único do hash continua só para convidados,
-- então dois cadastrados num computador compartilhado seguem respondendo.
create or replace function public.fn_publico_pulso_responder(
  p_token text, p_respostas jsonb, p_dispositivo text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c        public.pulso_ciclos;
  v_grupo  text := public.fn_pulso_grupo_atual();
  v_hash   text;
  v_texto  text := nullif(btrim(coalesce(p_respostas->>'texto', '')), '');
  q        smallint[];
  k        int;
begin
  select * into c from public.pulso_ciclos where token = p_token for update;
  if not found then raise exception 'pulso:ciclo_inexistente'; end if;
  if not public.fn_pulso_aberto(c) then raise exception 'pulso:ciclo_encerrado'; end if;

  begin
    q := array[(p_respostas->>'q1')::smallint, (p_respostas->>'q2')::smallint,
               (p_respostas->>'q3')::smallint, (p_respostas->>'q4')::smallint,
               (p_respostas->>'q5')::smallint, (p_respostas->>'q6')::smallint];
  exception when others then raise exception 'pulso:resposta_invalida';
  end;
  for k in 1..5 loop
    if q[k] is null or q[k] not between 1 and 5 then raise exception 'pulso:resposta_invalida'; end if;
  end loop;
  if q[6] is null or q[6] not between 0 and 10 then raise exception 'pulso:resposta_invalida'; end if;
  if v_texto is not null and length(v_texto) > 1000 then raise exception 'pulso:texto_longo'; end if;

  if p_dispositivo is not null and length(p_dispositivo) between 16 and 100 then
    v_hash := public.fn_pulso_hash_disp(c.id, p_dispositivo);
  end if;

  if v_grupo <> 'convidado' then
    if exists (select 1 from public.pulso_participacoes
               where ciclo_id = c.id and usuario_id = auth.uid()) then
      raise exception 'pulso:ja_respondeu';
    end if;
    insert into public.pulso_participacoes (ciclo_id, usuario_id, dispositivo_hash) values (c.id, auth.uid(), v_hash);
  else
    if not c.aceita_convidados then raise exception 'pulso:convidado_nao_aceito'; end if;
    if v_hash is null then raise exception 'pulso:dispositivo_invalido'; end if;
    if exists (select 1 from public.pulso_participacoes
               where ciclo_id = c.id and dispositivo_hash = v_hash) then
      raise exception 'pulso:ja_respondeu';
    end if;
    if c.limite_convidados is not null
       and (select count(*) from public.pulso_participacoes
            where ciclo_id = c.id and usuario_id is null) >= c.limite_convidados then
      raise exception 'pulso:limite_convidados';
    end if;
    insert into public.pulso_participacoes (ciclo_id, dispositivo_hash) values (c.id, v_hash);
  end if;

  insert into public.pulso_respostas (ciclo_id, perfil_grupo, q1, q2, q3, q4, q5, q6, texto_livre)
  values (c.id, v_grupo, q[1], q[2], q[3], q[4], q[5], q[6], v_texto);

  return jsonb_build_object('ok', true, 'perfil_grupo', v_grupo);
end $$;
revoke execute on function public.fn_publico_pulso_responder(text, jsonb, text) from public;
grant execute on function public.fn_publico_pulso_responder(text, jsonb, text) to anon, authenticated;
