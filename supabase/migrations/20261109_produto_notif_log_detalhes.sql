-- Histórico de e-mails de produto: resultado por destinatário.
-- Antes só havia contagens (total_enviados/falhas) e o erro ficava vazio quando parte dos envios
-- funcionava — não dava para saber quem ficou sem o e-mail (caso Contrato 4500571659, Produto 2,
-- 29/10/2026: "4 enviados · 1 falha", UNESCO sem o produto aprovado).
-- A Edge Function enviar-email-produto passa a gravar o log (service_role) com:
--   detalhes = [{ tipo: responsavel|fornecedor|unesco, para, ok, erro, tentativas }]
-- O e-mail do fornecedor (dado pessoal) NÃO é gravado em `para` — só o tipo.
alter table public.produto_notif_log
  add column if not exists detalhes jsonb;

comment on column public.produto_notif_log.detalhes is
  'Resultado por destinatário [{tipo, para, ok, erro, tentativas}]; e-mail do fornecedor omitido. Gravado pela Edge Function enviar-email-produto.';
