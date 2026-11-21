-- Observador não é avisado de mudança de prazo (só de início, envio para revisão e conclusão).
-- Troca pontual no corpo ATUAL de produção de fn_editar_tarefa e fn_reagendar_tarefa
-- (aborta se o trecho não aparecer exatamente 1 vez) — nunca recopiando o corpo antigo.
do $$
declare f text; d text; antes text := 'from tarefa_participantes where tarefa_id = p_tarefa_id;';
begin
  foreach f in array array['public.fn_editar_tarefa', 'public.fn_reagendar_tarefa'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.oid = (
      select oid from pg_proc where proname = split_part(f, '.', 2) and pronamespace = 'public'::regnamespace);
    if (length(d) - length(replace(d, antes, ''))) / length(antes) <> 1 then
      raise exception '% : trecho encontrado % vezes', f, (length(d) - length(replace(d, antes, ''))) / length(antes);
    end if;
    execute replace(d, antes, 'from tarefa_participantes where tarefa_id = p_tarefa_id and papel = ''responsavel'';');
  end loop;
end $$;
