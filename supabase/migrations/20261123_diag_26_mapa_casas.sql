-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 26 — mapa das casas entrevistadas
--
-- Pedido de 16/11/2026: no app, o entrevistador vê no mapa as casas já
-- entrevistadas (e as recusas) do setor dele e a própria posição; na mesa, a
-- coordenação vê onde cada entrevista foi feita.
--
-- Muda a decisão da diag_21 ("a mesa vê só quadrículas"), com limites:
--   · o ponto é a posição do INÍCIO da entrevista (na falta, a do fim), já
--     gravada em diag_fichas_campo_gps — nada novo é coletado;
--   · app: só os setores em que a pessoa tem designação; das casas dos
--     colegas vai só ponto, data e se foi recusa — sem número, nome, código
--     nem resposta; das próprias, também o número e o uuid_cliente (para
--     não duplicar com as fichas do aparelho);
--   · mesa: só coordenação/super_admin (diag_campo_painel já exige gerir);
--     o consultor externo continua sem ver;
--   · treino e descartada ficam fora; depois da retenção (2 anos) o ponto
--     some e só a quadrícula fica;
--   · o trajeto continua não saindo do aparelho.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.fn_diag_campo_casas(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'setor_id', fc.setor_id,
      'lat', case when g.ini_lat is not null then g.ini_lat else g.fim_lat end,
      'lon', case when g.ini_lat is not null then g.ini_lon else g.fim_lon end,
      'data', f.dt_entrevista,
      'recusa', not f.aceitou_participar,
      'propria', f.entrevistador_id = p_uid,
      'numero', case when f.entrevistador_id = p_uid and f.aceitou_participar then fc.numero_designado end,
      'uuid_cliente', case when f.entrevistador_id = p_uid then f.uuid_cliente end)
      order by f.dt_entrevista, f.finalizada_em), '[]'::jsonb)
  from diag_fichas_campo fc
  join diag_fichas f on f.id = fc.ficha_id
  join diag_fichas_campo_gps g on g.ficha_id = f.id
  where not f.treino and f.status <> 'descartada'
    and coalesce(g.ini_lat, g.fim_lat) is not null
    and fc.setor_id in (select d.setor_id from diag_designacoes d
                         where d.entrevistador_id = p_uid and d.ativo
                           and (d.dt_fim is null or d.dt_fim >= current_date - 15))
$$;
revoke execute on function public.fn_diag_campo_casas(uuid) from public, anon, authenticated;

create or replace function public.fn_diag_campo_casas_mesa(p_comunidade_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'ficha_id', f.id, 'codigo', f.codigo, 'status', f.status, 'comunidade_id', f.comunidade_id,
      'setor_id', fc.setor_id, 'setor_codigo', s.codigo,
      'entrevistador_id', f.entrevistador_id, 'entrevistador', u.nome_completo,
      'numero', case when f.aceitou_participar then fc.numero_designado end,
      'recusa', not f.aceitou_participar, 'situacao', fc.situacao,
      'data', f.dt_entrevista,
      'lat', case when g.ini_lat is not null then g.ini_lat else g.fim_lat end,
      'lon', case when g.ini_lat is not null then g.ini_lon else g.fim_lon end,
      'precisao_m', case when g.ini_lat is not null then g.ini_precisao_m else g.fim_precisao_m end)
      order by f.dt_entrevista, f.finalizada_em), '[]'::jsonb)
  from diag_fichas_campo fc
  join diag_fichas f on f.id = fc.ficha_id
  join diag_fichas_campo_gps g on g.ficha_id = f.id
  join usuarios u on u.id = f.entrevistador_id
  left join diag_setores s on s.id = fc.setor_id
  where not f.treino and f.status <> 'descartada'
    and coalesce(g.ini_lat, g.fim_lat) is not null
    and (p_comunidade_id is null or f.comunidade_id = p_comunidade_id)
$$;
revoke execute on function public.fn_diag_campo_casas_mesa(uuid) from public, anon, authenticated;

-- Troca pontual no corpo ATUAL (aborta se o trecho não aparecer exatamente 1×)
create or replace function pg_temp.diag26_trocar(p_assin text, p_de text, p_para text)
returns void language plpgsql as $$
declare v_def text; v_n int;
begin
  v_def := pg_get_functiondef(p_assin::regprocedure);
  if position(p_para in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_de, ''))) / length(p_de);
  if v_n <> 1 then raise exception 'diag26: trecho aparece % vez(es) em %', v_n, p_assin; end if;
  execute replace(v_def, p_de, p_para);
end $$;

do $t$ begin perform pg_temp.diag26_trocar('public.diag_campo_pacote()',
  '''ocupacao'', coalesce(',
  '''casas'', fn_diag_campo_casas(v_uid), ''ocupacao'', coalesce('); end $t$;

do $t$ begin perform pg_temp.diag26_trocar('public.diag_campo_painel(uuid)',
  '''celulas'', coalesce(',
  '''casas'', fn_diag_campo_casas_mesa(p_comunidade_id), ''celulas'', coalesce('); end $t$;

-- ROPA: o ponto da casa passa a aparecer no mapa do entrevistador e da mesa
update public.lgpd_tratamentos
   set medidas_seguranca = replace(medidas_seguranca,
         'A mesa vê quadrículas de dispersão, nunca o ponto da casa.',
         'Mapa das casas (diag_26): o entrevistador vê, nos setores em que está designado, o ponto de início de cada entrevista e recusa — dos colegas só ponto, data e se foi recusa, sem número, nome nem resposta; a coordenação vê os pontos de todas as entrevistas da APA; o consultor externo não vê ponto nenhum. Treino fica fora e o ponto some com a retenção.')
 where codigo = 'TRAT-001'
   and medidas_seguranca like '%A mesa vê quadrículas de dispersão, nunca o ponto da casa.%';
