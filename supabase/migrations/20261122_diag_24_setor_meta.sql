-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 24 — meta do setor ajustada no painel
--
-- A META do shapefile é o ponto de partida; quem manda depois é a
-- coordenação, no painel (aba Equipe de campo → Ajustar). Pedido de 15/11/2026.
--   · diag_setor_meta(setor, meta, motivo): só coordenação/super_admin,
--     motivo obrigatório; grava quem, quando e por quê (e o audit_log, pelo
--     gatilho fn_trg_audit agora ligado em diag_setores).
--   · recarregar o shape (fn_diag_setor_carregar) NÃO desfaz meta ajustada.
-- Um entrevistador em vários setores (inclusive de APAs diferentes) já era
-- permitido desde a diag_21 — a regra única é uma designação ativa por
-- setor × pessoa; a tela passou a designar vários setores de uma vez.
-- ════════════════════════════════════════════════════════════════════════

alter table public.diag_setores add column if not exists meta_ajustada_em  timestamptz;
alter table public.diag_setores add column if not exists meta_ajustada_por uuid references public.usuarios(id);
alter table public.diag_setores add column if not exists meta_motivo       text;

create or replace trigger trg_diag_setores_audit after insert or update on public.diag_setores
  for each row execute function fn_trg_audit();

create or replace function public.fn_diag_setor_carregar(p_comunidade uuid, p_codigo text, p_numero integer,
  p_nome text, p_tipo text, p_meta integer, p_area_ha numeric, p_celula_m integer,
  p_geojson jsonb, p_atributos jsonb, p_bbox numeric[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into diag_setores (comunidade_id, codigo, numero, nome, tipo, meta_sugerida, area_ha, geojson, bbox, atributos, celula_m)
  values (p_comunidade, upper(p_codigo), p_numero, p_nome, p_tipo, p_meta, p_area_ha, p_geojson, p_bbox, coalesce(p_atributos, '{}'), p_celula_m)
  on conflict on constraint uq_diag_setores_codigo do update set
    comunidade_id = excluded.comunidade_id, numero = excluded.numero, nome = excluded.nome, tipo = excluded.tipo,
    -- meta ajustada no painel vence a do arquivo (diag_24)
    meta_sugerida = case when diag_setores.meta_ajustada_em is null then excluded.meta_sugerida else diag_setores.meta_sugerida end,
    area_ha = excluded.area_ha, geojson = excluded.geojson, bbox = excluded.bbox, atributos = excluded.atributos
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.fn_diag_setor_carregar(uuid,text,integer,text,text,integer,numeric,integer,jsonb,jsonb,numeric[])
  from public, anon, authenticated;

create or replace function public.diag_setor_meta(p_setor_id uuid, p_meta integer, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_diag_pode_gerir() then raise exception 'diag:nao_autorizado: só coordenação e super_admin'; end if;
  if p_meta is null or p_meta < 1 or p_meta > 1000 then raise exception 'diag:meta_invalida: a meta vai de 1 a 1000'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'diag:motivo_obrigatorio: diga por que a meta mudou'; end if;
  update diag_setores set meta_sugerida = p_meta, meta_ajustada_em = now(), meta_ajustada_por = auth.uid(), meta_motivo = btrim(p_motivo)
   where id = p_setor_id;
  if not found then raise exception 'diag:setor_invalido: setor inexistente'; end if;
end $$;
revoke execute on function public.diag_setor_meta(uuid, integer, text) from public, anon;
grant execute on function public.diag_setor_meta(uuid, integer, text) to authenticated;

-- o painel mostra quem ajustou a meta e por quê
create or replace function pg_temp.diag24_trocar(p_assin text, p_de text, p_para text)
returns void language plpgsql as $$
declare v_def text; v_n int;
begin
  v_def := pg_get_functiondef(p_assin::regprocedure);
  if position(p_para in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_de, ''))) / length(p_de);
  if v_n <> 1 then raise exception 'diag24: trecho aparece % vez(es) em %', v_n, p_assin; end if;
  execute replace(v_def, p_de, p_para);
end $$;
do $t$ begin perform pg_temp.diag24_trocar('public.diag_campo_painel(uuid)',
  '''atributos'', s.atributos, ''ativo'', s.ativo)',
  '''atributos'', s.atributos, ''ativo'', s.ativo, ''meta_ajustada_em'', s.meta_ajustada_em, ''meta_motivo'', s.meta_motivo)'); end $t$;
