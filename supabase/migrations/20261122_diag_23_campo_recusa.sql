-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 23 — recusa não gasta número nem quadrícula
--
-- A meta do setor é de ENTREVISTAS feitas. A recusa continua registrada (e a
-- posição dela também, para a mesa ver que a casa foi visitada), mas não
-- recebe número da designação, não conta na quadrícula de dispersão e não
-- entra como "acima da meta" na fila de atenção nem na trava da validação.
-- Troca pontual no corpo atual (mesma técnica da diag_21).
-- ════════════════════════════════════════════════════════════════════════

create or replace function pg_temp.diag23_trocar(p_assin text, p_de text, p_para text)
returns void language plpgsql as $$
declare v_def text; v_n int;
begin
  v_def := pg_get_functiondef(p_assin::regprocedure);
  if position(p_para in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_de, ''))) / length(p_de);
  if v_n <> 1 then raise exception 'diag23: trecho aparece % vez(es) em %', v_n, p_assin; end if;
  execute replace(v_def, p_de, p_para);
end $$;

-- número: recusa fica sem
do $t$ begin perform pg_temp.diag23_trocar('public.fn_diag_campo_registrar(uuid,jsonb,boolean)',
  '    if v_c.numero_designado is not null and v_c.designacao_id = v_d.id and not (v_c.numero_designado = any(v_ocup)) then',
  '    if not v_f.aceitou_participar then
      v_num := null;                                     -- recusa (diag_23): não gasta número
    elsif v_c.numero_designado is not null and v_c.designacao_id = v_d.id and not (v_c.numero_designado = any(v_ocup)) then'); end $t$;

-- quadrícula: recusa não conta
do $t$ begin perform pg_temp.diag23_trocar('public.fn_diag_campo_registrar(uuid,jsonb,boolean)',
  '  if v_s.id is not null then
    if v_g.ini_lat is not null',
  '  if v_s.id is not null and v_f.aceitou_participar then      -- recusa (diag_23): fora da dispersão
    if v_g.ini_lat is not null'); end $t$;

-- validação e fila de atenção: "sem número" só pesa em entrevista aceita
do $t$ begin perform pg_temp.diag23_trocar('public.diag_mudar_status(uuid,text,text)',
  'or (c.designacao_id is not null and c.numero_designado is null))) then',
  'or (c.designacao_id is not null and c.numero_designado is null
                 and exists (select 1 from diag_fichas f2 where f2.id = c.ficha_id and f2.aceitou_participar)))) then'); end $t$;

do $t$ begin perform pg_temp.diag23_trocar('public.diag_campo_painel(uuid)',
  'or (fc.designacao_id is not null and fc.numero_designado is null))',
  'or (fc.designacao_id is not null and fc.numero_designado is null and f.aceitou_participar))'); end $t$;

-- andamento por designação: "feitas" = entrevistas aceitas (recusa à parte)
do $t$ begin perform pg_temp.diag23_trocar('public.diag_campo_painel(uuid)',
  '''feitas'', count(f.id) filter (where f.status <> ''descartada''),',
  '''feitas'', count(f.id) filter (where f.status <> ''descartada'' and f.aceitou_participar),
          ''recusas'', count(f.id) filter (where f.status <> ''descartada'' and not f.aceitou_participar),'); end $t$;
