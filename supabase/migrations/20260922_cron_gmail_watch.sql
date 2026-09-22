-- Renovação diária do Gmail users.watch (expira em ~7 dias). 05:30 UTC.
select cron.unschedule('gmail-watch-diario')
where exists (select 1 from cron.job where jobname = 'gmail-watch-diario');

select cron.schedule(
  'gmail-watch-diario',
  '30 5 * * *',
  $$
  select net.http_post(
    url := 'https://wfymnmlinonvdqfucjya.supabase.co/functions/v1/gmail-watch-renovar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmeW1ubWxpbm9udmRxZnVjanlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MzM1NzksImV4cCI6MjA5MDMwOTU3OX0.eC6T9VQ6OzF9mISEGy_pgbIbrOAnG4xp2z6WN-sCMt8'
    ),
    body := '{}'::jsonb
  );
  $$
);
