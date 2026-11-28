-- 28/11/2026 · Lista de presença (parte E): relatório A4 completo + resumo por reunião.
-- Pedido do usuário: o PDF A4 traz todos os campos (sexo, raça e faixa etária inclusive) e um resumo por sexo e idade
-- de cada reunião. Regra LGPD mantida: os campos sensíveis POR PESSOA só saem para quem os vê (fn_presenca_ve_sensivel =
-- coordenação/super_admin), em qualquer formato; os RESUMOS (contagens por reunião) saem para todo quem administra a lista.
-- Cada linha passa a trazer lista_id e o retorno ganha "resumos" (um por reunião: total, sexo, raça, faixa etária, convite).
create or replace function public.fn_presenca_exportar(p_listas uuid[], p_formato text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_sens boolean := public.fn_presenca_ve_sensivel(); v_rows jsonb; v_res jsonb; v_n int; x uuid;
begin
  if p_formato not in ('a4', 'xlsx', 'csv') or coalesce(array_length(p_listas, 1), 0) = 0 then raise exception 'presenca:pedido_invalido'; end if;
  foreach x in array p_listas loop
    if not public.fn_presenca_pode_gerir(x) then raise exception 'presenca:sem_permissao'; end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
      'lista_id', l.id, 'reuniao', t.codigo || ' — ' || t.titulo, 'data', l.inicio_reuniao, 'formato', t.dados_tipo->>'formato',
      'nome', a.nome, 'email', a.email, 'telefone', a.telefone, 'interno', a.usuario_id is not null, 'origem', a.origem,
      'convidado', a.convidado_inicial,
      'sexo_genero', case when v_sens then a.sexo_genero end, 'sexo_genero_outro', case when v_sens then a.sexo_genero_outro end,
      'cor_raca', case when v_sens then a.cor_raca end, 'faixa_etaria', case when v_sens then a.faixa_etaria end,
      'imagem', case when not a.imagem_autoriza then 'nao' when a.imagem_revogada_em is not null then 'retirada' else 'sim' end,
      'termo_versao', tm.versao, 'assinado_em', a.assinado_em) order by l.inicio_reuniao, a.assinado_em), '[]'::jsonb), count(*)
    into v_rows, v_n
  from public.presenca_assinaturas a join public.presenca_listas l on l.id = a.lista_id
  join public.tarefas t on t.id = l.tarefa_id join public.presenca_termos_imagem tm on tm.id = a.termo_id
  where a.lista_id = any(p_listas);

  select coalesce(jsonb_agg(r order by (r->>'data')), '[]'::jsonb) into v_res from (
    select jsonb_build_object(
      'lista_id', l.id, 'reuniao', t.codigo || ' — ' || t.titulo, 'data', l.inicio_reuniao,
      'formato', t.dados_tipo->>'formato', 'local', t.dados_tipo->>'local',
      'organizador', (select nome_completo from public.usuarios where id = t.criado_por),
      'total', (select count(*) from public.presenca_assinaturas a where a.lista_id = l.id),
      'convidados_externos', (select count(*) from public.presenca_assinaturas a where a.lista_id = l.id and not a.convidado_inicial),
      'sexo', coalesce((select jsonb_object_agg(k, n) from (select sexo_genero k, count(*) n from public.presenca_assinaturas a where a.lista_id = l.id group by 1) s), '{}'::jsonb),
      'faixa', coalesce((select jsonb_object_agg(k, n) from (select coalesce(faixa_etaria, 'sem_registro') k, count(*) n from public.presenca_assinaturas a where a.lista_id = l.id group by 1) s), '{}'::jsonb),
      'raca', coalesce((select jsonb_object_agg(k, n) from (select cor_raca k, count(*) n from public.presenca_assinaturas a where a.lista_id = l.id group by 1) s), '{}'::jsonb)) r
    from public.presenca_listas l join public.tarefas t on t.id = l.tarefa_id
    where l.id = any(p_listas)) q;

  insert into public.presenca_exportacoes (usuario_id, formato, listas, n_linhas, com_sensiveis)
  values (auth.uid(), p_formato, p_listas, v_n, v_sens);
  return jsonb_build_object('com_sensiveis', v_sens, 'linhas', v_rows, 'resumos', v_res,
    'exportado_por', (select nome_completo from public.usuarios where id = auth.uid()), 'exportado_em', now());
end $$;
revoke execute on function public.fn_presenca_exportar(uuid[], text) from public, anon;
grant execute on function public.fn_presenca_exportar(uuid[], text) to authenticated;

update public.lgpd_tratamentos
   set compartilhamento = 'Nenhum. Nome e presença aparecem para quem vê a reunião; telefone para quem a administra; sexo, raça e '
       || 'faixa etária por pessoa só para coordenação e super_admin (inclusive no PDF A4, Excel e CSV que eles exportam); os demais '
       || 'veem e exportam só os totais por reunião.'
 where codigo = 'TRAT-008';
