-- 28/11/2026 · Lista de presença (parte D): marca convidado_inicial nas assinaturas feitas antes da parte C.
-- A coluna nasceu com padrão false; as assinaturas já existentes (3, da TR-090, feitas pela manhã) recebem o valor pela
-- lista de convidados atual da reunião (melhor aproximação disponível). Assinaturas novas já gravam o valor na hora.
update public.presenca_assinaturas a
   set convidado_inicial = true
  from public.presenca_listas l
 where l.id = a.lista_id
   and a.assinado_em < '2026-11-28 15:00:00+00'
   and a.usuario_id is not null
   and not a.convidado_inicial
   and exists (select 1 from public.fn_presenca_convidados(l.tarefa_id) x where x.uid = a.usuario_id);
