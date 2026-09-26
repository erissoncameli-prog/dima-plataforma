-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 06 — Encarregado de Dados no aviso da v1
--
-- Decisão de 26/09/2026: Encarregada de Dados = Luciana Cristina Rôla de
-- Souza; contato para os titulares SÓ por e-mail (divbioac@gmail.com).
-- A v1 ainda é rascunho, então o aviso pode ser corrigido sem nova versão.
-- Se já estiver publicada, esta migration falha de propósito: aviso de
-- versão publicada é imutável (a correção seria a v2).
-- ════════════════════════════════════════════════════════════════════════
do $$
declare v_status text;
begin
  select status into v_status from public.diag_questionarios where codigo = 'DSA' and versao = 1;
  if v_status is distinct from 'rascunho' then
    raise exception 'diag:questionario_publicado: v1 não está em rascunho (status %); crie a v2', v_status;
  end if;
  update public.diag_questionarios
     set aviso_entrevistado = replace(aviso_entrevistado,
           '[canal do Encarregado de Dados da SEMA — A DEFINIR]',
           'Luciana Rôla, Encarregada de Dados da SEMA/AC, pelo e-mail divbioac@gmail.com')
   where codigo = 'DSA' and versao = 1
     and aviso_entrevistado like '%[canal do Encarregado de Dados da SEMA — A DEFINIR]%';
end $$;
