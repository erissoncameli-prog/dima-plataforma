// ── DIMA · Cliente Supabase do site público ──────────────────
// Chave pública anon (a mesma do painel interno): só leitura, via funções
// fn_publico_* SECURITY DEFINER e tabelas liberadas pro anon.
// Esta é a versão de PRODUÇÃO (Supabase Cloud). No ambiente local e no
// servidor self-hosted, o nginx entrega no lugar deste arquivo a cópia
// renderizada de docker/site-publico-supabase.local.js (ver entrypoint.sh),
// apontando pro gateway próprio definido no .env.
const SUPABASE_URL = 'https://wfymnmlinonvdqfucjya.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmeW1ubWxpbm9udmRxZnVjanlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MzM1NzksImV4cCI6MjA5MDMwOTU3OX0.eC6T9VQ6OzF9mISEGy_pgbIbrOAnG4xp2z6WN-sCMt8';
const db = window.supabase ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
