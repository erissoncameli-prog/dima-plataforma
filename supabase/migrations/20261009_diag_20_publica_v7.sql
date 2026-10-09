-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 20 — publica a v7 (questionário FINAL)
--
-- Pedido de 09/10/2026: a v7 (migração 19) passa a ser a versão aplicada em
-- campo. A v5 (publicada até aqui) e a v6 (rascunho superado pela v7) são
-- arquivadas. Daqui em diante a v7 é imutável (trg_diag_questionario_guarda),
-- inclusive o texto "O que é uma APA?" (estrutura.leituras.apa); correção =
-- nova versão. Fichas já enviadas seguem ligadas à versão em que foram feitas.
-- Idempotente: só age se a v7 ainda estiver em rascunho e a v5 publicada
-- (no banco de teste local as versões seguem em rascunho e os testes as
-- publicam um a um — mesmo padrão das migrações 09, 12 e 15).
-- ════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from diag_questionarios where codigo = 'DSA' and versao = 7 and status = 'rascunho')
     or not exists (select 1 from diag_questionarios where codigo = 'DSA' and versao = 5 and status = 'publicado') then
    return;
  end if;
  update diag_questionarios set status = 'arquivado'
   where codigo = 'DSA' and versao in (5, 6) and status <> 'arquivado';
  update diag_questionarios set status = 'publicado'
   where codigo = 'DSA' and versao = 7;
end $$;
