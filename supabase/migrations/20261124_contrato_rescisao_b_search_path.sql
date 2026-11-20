-- Contrato rescindido: search_path fixo nas duas funções de gatilho recriadas (aviso do painel de segurança).
alter function public.fn_trg_encerramento_guarda() set search_path = public;
alter function public.fn_trg_encp_guarda() set search_path = public;
