-- Varredura única das respostas antigas de fornecedores (e-mails sem o código da tarefa no endereço).
-- A receber-email-tarefa só aceita chamada com a chave do Pub/Sub; em vez de expor a chave,
-- o pedido fica nesta fila e a função o executa na próxima vez que rodar, gravando o resultado.
-- simular = true só lista o que seria lançado. Só service_role (sem policy).
create table if not exists public.tarefa_email_varreduras (
  id         bigint generated always as identity primary key,
  simular    boolean not null default true,
  pedido_em  timestamptz not null default now(),
  feito_em   timestamptz,
  resultado  jsonb
);
alter table public.tarefa_email_varreduras enable row level security;
revoke all on public.tarefa_email_varreduras from public, anon, authenticated;
insert into public.tarefa_email_varreduras (simular) values (true);
