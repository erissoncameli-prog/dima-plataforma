-- Estado de sincronização do Gmail (inbound). Guarda o último historyId
-- processado, para o receptor buscar só o que é novo (startHistoryId).
-- Linha única (id='gmail'). Só o service_role toca — RLS ligada sem policy
-- (bloqueia authenticated/anon; service_role ignora RLS).
create table if not exists public.gmail_sync_state (
  id            text primary key default 'gmail',
  history_id    text,
  atualizado_em timestamptz not null default now()
);
alter table public.gmail_sync_state enable row level security;
-- sem policies: apenas service_role acessa
