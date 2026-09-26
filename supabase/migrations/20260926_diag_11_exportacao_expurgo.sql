-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 11 — exportação registrada e expurgo de fotos
--
-- Exportação (plano §2.2, §2.6, §4.1):
--   · diag_exportar() é a ÚNICA saída de ficha individual para planilha.
--     Monta o recorte no banco e grava o registro na MESMA transação: não
--     existe exportação sem linha em diag_exportacoes.
--   · padrão (pseudonimizada): sem nome do entrevistado, sem nomes dos
--     moradores, sem GPS — comunidade é o nível de localização;
--   · identificada (nome, GPS, nomes dos moradores): só gerir;
--   · consultor externo: além de sem identificação, sem TEXTO ABERTO
--     (texto/texto_longo, "especifique" *_outro) — a P55 (sindicato) é texto
--     aberto e nunca sai para ele;
--   · treino nunca sai.
--
-- Expurgo: cron diário chama a Edge Function diag-expurgo, que drena
-- diag_expurgo_arquivos pela API do Storage (SQL não apaga arquivo).
-- ════════════════════════════════════════════════════════════════════════

-- ── Registro de exportações ─────────────────────────────────────────────
create table if not exists public.diag_exportacoes (
  id            bigserial primary key,
  usuario_id    uuid not null references public.usuarios(id),
  perfil        text not null,
  identificada  boolean not null,
  com_texto     boolean not null,
  filtros       jsonb not null default '{}'::jsonb,
  n_fichas      integer not null,
  n_moradores   integer not null,
  criado_em     timestamptz not null default now()
);
create index if not exists idx_diag_exportacoes_criado on public.diag_exportacoes (criado_em desc);

alter table public.diag_exportacoes enable row level security;
revoke all on public.diag_exportacoes from anon, authenticated;
revoke all on sequence public.diag_exportacoes_id_seq from anon, authenticated;
grant select on public.diag_exportacoes to authenticated;
drop policy if exists diag_exportacoes_select on public.diag_exportacoes;
create policy diag_exportacoes_select on public.diag_exportacoes for select to authenticated
  using (fn_diag_pode_gerir());

-- ROPA vivo: tabela nova do tratamento entra na linha do TRAT-001
update public.lgpd_tratamentos
   set tabelas = array_append(tabelas, 'diag_exportacoes'),
       medidas_seguranca = medidas_seguranca || ' Toda exportação de ficha é registrada (diag_exportacoes); exportação identificada só para a coordenação.'
 where codigo = 'TRAT-001' and not ('diag_exportacoes' = any(tabelas));

-- ── Fila de expurgo: rastro de tentativa ────────────────────────────────
alter table public.diag_expurgo_arquivos add column if not exists tentativas integer not null default 0;
alter table public.diag_expurgo_arquivos add column if not exists ultimo_erro text;
create index if not exists idx_diag_expurgo_pendente on public.diag_expurgo_arquivos (id) where removido_em is null;

-- ── RPC de exportação ───────────────────────────────────────────────────
-- p_status: estados a incluir (padrão: só validadas).
create or replace function public.diag_exportar(
  p_identificada   boolean default false,
  p_status         text[]  default array['validada'],
  p_municipio_ibge integer default null,
  p_comunidade_id  uuid    default null,
  p_questionario_id uuid   default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_gerir  boolean := fn_diag_pode_gerir();
  v_cons   boolean := fn_diag_pode_consultar();
  v_ident  boolean := coalesce(p_identificada, false);
  v_status text[]  := coalesce(p_status, array['validada']);
  v_ids    uuid[];
  v_fichas jsonb;
  v_mor    jsonb;
  v_quest  jsonb;
  v_id     bigint;
  v_nmor   int;
begin
  if not (v_gerir or v_cons) then
    raise exception 'diag:nao_autorizado';
  end if;
  if v_ident and not v_gerir then
    raise exception 'diag:nao_autorizado: exportação identificada só para a coordenação';
  end if;
  if cardinality(v_status) = 0
     or not v_status <@ array['enviada','devolvida','validada','descartada'] then
    raise exception 'diag:parametro_invalido: status %', v_status;
  end if;

  select coalesce(array_agg(f.id order by f.codigo), '{}') into v_ids
  from diag_fichas f
  where not f.treino
    and f.status = any(v_status)
    and (p_municipio_ibge is null or f.municipio_ibge = p_municipio_ibge)
    and (p_comunidade_id is null or f.comunidade_id = p_comunidade_id)
    and (p_questionario_id is null or f.questionario_id = p_questionario_id);

  -- respostas: consultor sem texto aberto (texto/texto_longo e *_outro)
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'codigo', f.codigo,
           'questionario_id', f.questionario_id,
           'status', f.status,
           'municipio', m.nome,
           'comunidade', coalesce(c.nome, f.comunidade_nova),
           'comunidade_nova', f.comunidade_id is null,
           'localidade', coalesce(l.nome, f.localidade_nova),
           'dt_entrevista', f.dt_entrevista,
           'aceitou_participar', f.aceitou_participar,
           'enviado_em', f.enviado_em,
           'validado_em', f.validado_em,
           'usou_carencia', f.usou_carencia,
           'identificacao_apagada', f.identificacao_apagada_em is not null,
           'alertas', f.alertas,
           'entrevistador', case when v_gerir then u.nome_completo end,
           'motivo_devolucao', case when v_gerir then f.motivo_devolucao end,
           'entrevistado_nome', case when v_ident then i.entrevistado_nome end,
           'lat', case when v_ident then i.lat end,
           'lon', case when v_ident then i.lon end,
           'gps_precisao_m', case when v_ident then i.gps_precisao_m end,
           'obs_localizacao', case when v_ident then i.obs_localizacao end,
           'respostas', case when v_gerir then f.respostas else (
              select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
              from jsonb_each(f.respostas) e
              where e.key not like '%\_outro'
                and e.key not in (select p.pergunta->>'chave' from fn_diag_perguntas(q.estrutura) p
                                  where p.pergunta->>'tipo' in ('texto','texto_longo'))) end
         )) order by f.codigo), '[]'::jsonb)
    into v_fichas
  from diag_fichas f
  join diag_questionarios q on q.id = f.questionario_id
  join diag_municipios m on m.ibge = f.municipio_ibge
  left join diag_comunidades c on c.id = f.comunidade_id
  left join diag_localidades l on l.id = f.localidade_id
  left join usuarios u on u.id = f.entrevistador_id
  left join diag_fichas_identificacao i on i.ficha_id = f.id
  where f.id = any(v_ids);

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'codigo', f.codigo,
           'ordem', mo.ordem,
           'e_entrevistado', mo.e_entrevistado,
           'idade', mo.idade,
           'sexo_genero', mo.sexo_genero,
           'sexo_genero_outro', case when v_gerir then mo.sexo_genero_outro end,
           'parentesco', mo.parentesco,
           'escolaridade', mo.escolaridade,
           'atividade_principal', mo.atividade_principal,
           'nome', case when v_ident then mi.nome end
         )) order by f.codigo, mo.ordem), '[]'::jsonb), count(*)
    into v_mor, v_nmor
  from diag_moradores mo
  join diag_fichas f on f.id = mo.ficha_id
  left join diag_moradores_identificacao mi on mi.morador_id = mo.id
  where mo.ficha_id = any(v_ids);

  -- estrutura das versões presentes: rótulos saem dela, nunca do código
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'codigo', q.codigo, 'versao', q.versao,
           'hash_sha256', q.hash_sha256, 'estrutura', q.estrutura) order by q.versao), '[]'::jsonb)
    into v_quest
  from diag_questionarios q
  where q.id in (select f.questionario_id from diag_fichas f where f.id = any(v_ids));

  insert into diag_exportacoes (usuario_id, perfil, identificada, com_texto, filtros, n_fichas, n_moradores)
  values (auth.uid(), fn_diag_perfil_ativo(), v_ident, v_gerir,
          jsonb_strip_nulls(jsonb_build_object('status', v_status, 'municipio_ibge', p_municipio_ibge,
            'comunidade_id', p_comunidade_id, 'questionario_id', p_questionario_id)),
          cardinality(v_ids), v_nmor)
  returning id into v_id;

  return jsonb_build_object(
    'exportacao_id', v_id,
    'gerado_em', now(),
    'identificada', v_ident,
    'com_texto', v_gerir,
    'questionarios', v_quest,
    'fichas', v_fichas,
    'moradores', v_mor);
end $$;

revoke execute on function public.diag_exportar(boolean, text[], integer, uuid, uuid) from public, anon;
grant execute on function public.diag_exportar(boolean, text[], integer, uuid, uuid) to authenticated;

-- ── Cron: drena a fila de expurgo depois da retenção (06:17 UTC) ────────
-- Mesmo padrão de cron-tarefas-digest (net.http_post + anon key). A função
-- só apaga o que já está na fila, então chamá-la a mais é inofensivo.
select cron.unschedule('diag-expurgo-diario')
where exists (select 1 from cron.job where jobname = 'diag-expurgo-diario');

select cron.schedule(
  'diag-expurgo-diario',
  '37 6 * * *',
  $$
  select net.http_post(
    url := 'https://wfymnmlinonvdqfucjya.supabase.co/functions/v1/diag-expurgo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmeW1ubWxpbm9udmRxZnVjanlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MzM1NzksImV4cCI6MjA5MDMwOTU3OX0.eC6T9VQ6OzF9mISEGy_pgbIbrOAnG4xp2z6WN-sCMt8'
    ),
    body := '{}'::jsonb
  );
  $$
);
