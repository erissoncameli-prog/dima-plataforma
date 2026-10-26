-- Já aplicado em 26/10/2026 (execute_sql). Mantido para reaplicar num banco novo: colar no SQL Editor (o apply_migration espera confirmação em texto com a palavra de exclusão).
-- Complemento de 20261026_seg_responsaveis_notificacoes.sql.
-- A policy de exclusão de atividade_responsaveis era `true` para qualquer logado.
-- Responsável se desativa (ativo = false, dt_fim); excluir a linha só super_admin ativo.
alter policy ativ_resp_delete on public.atividade_responsaveis
  to authenticated
  using (public.fn_perfil_atual() = 'super_admin');
