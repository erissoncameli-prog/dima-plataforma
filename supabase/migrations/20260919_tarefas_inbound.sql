-- Fase 3 (2) — base para "resposta de e-mail vira comentário".
-- Marca a origem do comentário e cria a RPC de sistema (service_role) que
-- insere um comentário atribuído a um autor específico, SEM sessão de login
-- (o fluxo de entrada de e-mail não tem auth.uid()).

alter table public.tarefa_comentarios
  add column if not exists origem text not null default 'painel'; -- painel | email

-- RPC de sistema: NÃO pode ser chamada por usuários logados (deixaria alguém
-- forjar autoria). Apenas service_role (usado pela Edge Function de entrada).
create or replace function fn_comentar_tarefa_sistema(
  p_tarefa_id uuid, p_autor_id uuid, p_corpo text, p_origem text default 'email'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cod text; v_alvo uuid[];
begin
  if coalesce(btrim(p_corpo),'') = '' then raise exception 'comentário vazio'; end if;
  if p_autor_id is null then raise exception 'autor obrigatório'; end if;

  insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem)
  values (p_tarefa_id, p_autor_id, btrim(p_corpo), coalesce(p_origem,'email'))
  returning id into v_id;

  select codigo into v_cod from tarefas where id = p_tarefa_id;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
  values (p_tarefa_id, p_autor_id, 'comentario', left(btrim(p_corpo), 80));

  -- notifica criador + participantes (menos o autor)
  select array_agg(distinct uid) into v_alvo from (
    select criado_por uid from tarefas where id = p_tarefa_id
    union
    select usuario_id from tarefa_participantes where tarefa_id = p_tarefa_id
  ) s;
  perform fn_tarefa_notificar(v_alvo, 'tarefa_comentario',
    'Novo comentário: ' || coalesce(v_cod,''), left(btrim(p_corpo), 120), p_tarefa_id, p_autor_id);

  return v_id;
end $$;

revoke execute on function fn_comentar_tarefa_sistema(uuid,uuid,text,text) from public;
-- service_role executa (Edge Function de entrada); authenticated NÃO.
grant execute on function fn_comentar_tarefa_sistema(uuid,uuid,text,text) to service_role;
