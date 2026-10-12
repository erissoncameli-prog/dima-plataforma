-- Cancelamento de TDR — fixa o search_path dos gatilhos de guarda (aviso
-- function_search_path_mutable do painel de segurança). Sem mudança de lógica.
alter function public.fn_trg_tcan_imutavel()           set search_path to 'public';
alter function public.fn_trg_tcan_assinaturas_guarda() set search_path to 'public';
alter function public.fn_trg_tcan_etapas_guarda()      set search_path to 'public';
alter function public.fn_trg_tcan_pedido_guarda()      set search_path to 'public';
