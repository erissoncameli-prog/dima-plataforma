-- Agenda o digest diário de tarefas às 08:00 do Acre (13:00 UTC).
-- Mesmo padrão do cron-prestacao-diario (net.http_post + anon key).
select cron.unschedule('cron-tarefas-digest')
where exists (select 1 from cron.job where jobname = 'cron-tarefas-digest');

select cron.schedule(
  'cron-tarefas-digest',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://wfymnmlinonvdqfucjya.supabase.co/functions/v1/cron-tarefas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmeW1ubWxpbm9udmRxZnVjanlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MzM1NzksImV4cCI6MjA5MDMwOTU3OX0.eC6T9VQ6OzF9mISEGy_pgbIbrOAnG4xp2z6WN-sCMt8'
    ),
    body := '{}'::jsonb
  );
  $$
);
