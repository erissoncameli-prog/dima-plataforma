-- ════════════════════════════════════════════════════════════════════════
-- Responsáveis da atividade — remoção física (parte 2 de 20261026_seg_responsaveis_avisos)
-- Colar inteiro no SQL Editor do projeto Projeto-SEMA-UNESCO (wfymnmlinonvdqfucjya). Idempotente.
-- O nome da policy tem a palavra que trava o apply_migration, por isso fica aqui.
--
-- Antes: qualquer logado apagava qualquer responsável (USING true).
-- Agora: só super_admin ativo. A tela não apaga — remover = ativo false (update).
-- ════════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('public.atividade_responsaveis') is null then
    raise exception 'Projeto errado: selecione Projeto-SEMA-UNESCO no topo do SQL Editor.';
  end if;
end $$;

alter policy ativ_resp_delete on public.atividade_responsaveis
  to authenticated
  using (public.fn_perfil_atual() = 'super_admin');
