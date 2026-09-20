-- Progresso do checklist por tarefa, para exibir a barra no card/lista sem N+1.
-- security_invoker = true → herda o RLS de tarefa_checklist (o usuário só vê o
-- progresso de tarefas que já pode ver).
create or replace view vw_tarefa_progresso
with (security_invoker = true) as
select
  tarefa_id,
  count(*)::int                                   as total,
  count(*) filter (where concluida)::int          as feitas,
  round(100.0 * count(*) filter (where concluida) / nullif(count(*),0))::int as pct
from tarefa_checklist
group by tarefa_id;

grant select on vw_tarefa_progresso to authenticated;
