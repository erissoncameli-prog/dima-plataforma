-- ════════════════════════════════════════════════════════════════════════
-- Pulso da Equipe · exportação do resultado + dados do painel
--
-- · Exporta SÓ agregados (o mesmo que fn_pulso_resultado devolve à tela):
--   nenhuma resposta individual sai. Ciclo com < 5 respostas não exporta.
-- · Toda exportação é registrada em pulso_exportacoes (quem, ciclo, formato,
--   quando) NA MESMA TRANSAÇÃO que devolve os dados — padrão diag_exportar.
-- · fn_pulso_ciclos ganha 'ultima_resposta' (só o DIA) e 'n_textos' para o painel.
-- ROPA: a inclusão de pulso_exportacoes no TRAT-002 está em
-- 20261006_pulso_equipe_d_ropa_sql_editor.sql (colar no SQL Editor).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.pulso_exportacoes (
  id          uuid primary key default gen_random_uuid(),
  ciclo_id    uuid references public.pulso_ciclos(id),   -- null = lista de ciclos
  usuario_id  uuid not null references public.usuarios(id),
  formato     text not null check (formato in ('xlsx','a4','pptx','lista_xlsx')),
  criado_em   timestamptz not null default now()
);
comment on table public.pulso_exportacoes is
  'Registro imutável de cada exportação do Pulso (só agregados saem). Escrita só por fn_pulso_exportar*.';
create index if not exists idx_pulso_exp_ciclo on public.pulso_exportacoes (ciclo_id);
alter table public.pulso_exportacoes enable row level security;
revoke all on public.pulso_exportacoes from anon, authenticated, public;

-- Resultado de UM ciclo para exportar (xlsx | a4 | pptx) + registro.
create or replace function public.fn_pulso_exportar(p_ciclo uuid, p_formato text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; c public.pulso_ciclos;
begin
  if p_formato is null or p_formato not in ('xlsx','a4','pptx') then raise exception 'pulso:formato_invalido'; end if;
  select * into c from public.pulso_ciclos where id = p_ciclo;
  if not found then raise exception 'pulso:ciclo_inexistente'; end if;
  if not public.fn_pulso_pode_ver(c) then raise exception 'pulso:sem_permissao'; end if;
  r := public.fn_pulso_resultado(p_ciclo);
  if (r->>'suprimido')::boolean then raise exception 'pulso:exportacao_suprimida'; end if;
  insert into public.pulso_exportacoes (ciclo_id, usuario_id, formato) values (p_ciclo, auth.uid(), p_formato);
  return r || jsonb_build_object(
    'autor', (select u.nome_completo from public.usuarios u where u.id = c.criado_por),
    'exportado_por', (select u.nome_completo from public.usuarios u where u.id = auth.uid()),
    'exportado_em', now());
end $$;
revoke execute on function public.fn_pulso_exportar(uuid, text) from public, anon;
grant execute on function public.fn_pulso_exportar(uuid, text) to authenticated;

-- Lista dos ciclos visíveis (painel) para exportar + registro.
create or replace function public.fn_pulso_exportar_lista()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb;
begin
  r := public.fn_pulso_ciclos();   -- já checa usuário ativo e visibilidade
  insert into public.pulso_exportacoes (ciclo_id, usuario_id, formato) values (null, auth.uid(), 'lista_xlsx');
  return r;
end $$;
revoke execute on function public.fn_pulso_exportar_lista() from public, anon;
grant execute on function public.fn_pulso_exportar_lista() to authenticated;

-- Lista para o painel: + última resposta (dia) e nº de perguntas de texto.
create or replace function public.fn_pulso_ciclos()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.fn_pulso_usuario_ativo() then raise exception 'pulso:sem_permissao'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'criado_em' desc) from (
      select jsonb_build_object(
        'id', c.id, 'titulo', c.titulo, 'token', c.token, 'status', c.status,
        'aberto', public.fn_pulso_aberto(c),
        'aceita_convidados', c.aceita_convidados, 'limite_convidados', c.limite_convidados,
        'fecha_em', c.fecha_em, 'criado_em', c.criado_em,
        'meu', c.criado_por = auth.uid(),
        'autor', (select u.nome_completo from public.usuarios u where u.id = c.criado_por),
        'n_perguntas', jsonb_array_length(c.perguntas),
        'n_respostas', p.n, 'n_cadastrados', p.cad, 'n_convidados', p.conv,
        'ultima_resposta', (select max(dia) from public.pulso_respostas_v2 where ciclo_id = c.id),
        'n_exportacoes', (select count(*) from public.pulso_exportacoes where ciclo_id = c.id),
        'indices', case when p.n >= 5 then (
            select jsonb_build_object('comprometimento', mt->'comprometimento', 'sintonia', mt->'sintonia', 'enps', mt->'enps')
            from public.fn_pulso_metricas(c.id, null) mt) end
      ) x
      from public.pulso_ciclos c
      cross join lateral (
        select count(*) n, count(usuario_id) cad, count(*) - count(usuario_id) conv
        from public.pulso_participacoes where ciclo_id = c.id) p
      where public.fn_pulso_pode_ver(c)
    ) s), '[]'::jsonb);
end $$;
revoke execute on function public.fn_pulso_ciclos() from public, anon;
grant execute on function public.fn_pulso_ciclos() to authenticated;
