-- ═══════════════════════════════════════════════════════════════════════
-- SITE PÚBLICO — Linha do Tempo (fn_publico_linha_tempo)
-- ═══════════════════════════════════════════════════════════════════════
-- Alimenta site-publico/linha-do-tempo.html (TdR 3.2/3.3). Decisões da
-- coordenação (pauta do Produto 3):
--   • c1: entram só ENTREGAS / PRODUTOS APROVADOS (nada de TDR, contrato,
--     licitação);
--   • c2: o texto de cada evento é escrito e aprovado pelo RESPONSÁVEL da
--     atividade — o evento só vai ao site depois que ele publica (decisão do
--     usuário em 06/11: sem texto publicado, não aparece);
--   • c3: começa na assinatura do acordo — data em
--     configuracoes_sistema.projeto_data_acordo (Dados do sistema); sem ela, a
--     linha começa no primeiro evento.
--
-- Escrita só por fn_linha_tempo_salvar (SECURITY DEFINER): quem avalia o
-- produto (fn_pode_avaliar_contrato: super_admin ou responsável/substituto
-- ativo da atividade, nunca o fornecedor do contrato), só produto aprovado.
-- A tabela não tem policy nem grant de escrita para o cliente — não criar.
-- Nunca nome de fornecedor/consultor no título ou no texto (recusado), nem CPF/CNPJ.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.configuracoes_sistema add column if not exists projeto_data_acordo date;
comment on column public.configuracoes_sistema.projeto_data_acordo is
  'Data de assinatura do acordo do projeto — marco inicial da Linha do Tempo do site público.';

create table if not exists public.linha_tempo_eventos (
  obra_id        uuid primary key references public.contratos_produtos(id),
  id             uuid not null default gen_random_uuid() unique,  -- registro_id do audit_log (fn_trg_audit lê 'id')
  titulo         text not null check (char_length(btrim(titulo)) between 5 and 120),
  texto          text not null check (char_length(btrim(texto)) between 20 and 600),
  publicado      boolean not null default false,
  criado_por     uuid references public.usuarios(id),
  criado_em      timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id),
  atualizado_em  timestamptz not null default now(),
  publicado_por  uuid references public.usuarios(id),
  publicado_em   timestamptz
);

comment on table public.linha_tempo_eventos is
  'Texto público de cada produto aprovado na Linha do Tempo do site. Escrita só por fn_linha_tempo_salvar.';

alter table public.linha_tempo_eventos enable row level security;

-- Leitura: quem enxerga o produto (RLS de contratos_produtos decide)
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'linha_tempo_eventos'
                   and policyname = 'linha_tempo_eventos_select') then
    create policy linha_tempo_eventos_select on public.linha_tempo_eventos
      for select to authenticated
      using (exists (select 1 from public.contratos_produtos cp where cp.id = obra_id));
  end if;
end $$;

revoke all on public.linha_tempo_eventos from anon, authenticated;
grant select on public.linha_tempo_eventos to authenticated;

alter table public.linha_tempo_eventos add column if not exists id uuid not null default gen_random_uuid() unique;

create or replace trigger trg_audit_linha_tempo_eventos
  after insert or update on public.linha_tempo_eventos
  for each row execute function public.fn_trg_audit();

-- Pode escrever o texto deste produto? (a tela usa para mostrar o formulário)
create or replace function public.fn_linha_tempo_pode_editar(p_obra_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((
    select public.fn_pode_avaliar_contrato(cp.contrato_id)
    from public.contratos_produtos cp where cp.id = p_obra_id), false)
$function$;

revoke all on function public.fn_linha_tempo_pode_editar(uuid) from public, anon;
grant execute on function public.fn_linha_tempo_pode_editar(uuid) to authenticated;

-- Grava (e publica ou tira do site) o texto do evento
create or replace function public.fn_linha_tempo_salvar(
  p_obra_id uuid, p_titulo text, p_texto text, p_publicar boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_obra record;
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_texto  text := btrim(coalesce(p_texto, ''));
  v_ant    boolean;
begin
  if v_uid is null then raise exception 'linha_tempo:sem_login'; end if;

  select o.obra_id, o.contrato_id, o.situacao_acervo, o.fornecedor_nome
    into v_obra from public.vw_acervo_obras o where o.obra_id = p_obra_id;
  if not found then raise exception 'linha_tempo:produto_nao_encontrado'; end if;
  if v_obra.situacao_acervo is distinct from 'aprovado' then raise exception 'linha_tempo:produto_nao_aprovado'; end if;
  if not coalesce(public.fn_pode_avaliar_contrato(v_obra.contrato_id), false) then
    raise exception 'linha_tempo:sem_permissao';
  end if;

  if char_length(v_titulo) not between 5 and 120 then raise exception 'linha_tempo:titulo_tamanho'; end if;
  if char_length(v_texto) not between 20 and 600 then raise exception 'linha_tempo:texto_tamanho'; end if;
  -- Nada que identifique fornecedor ou pessoa
  if v_obra.fornecedor_nome is not null and char_length(btrim(v_obra.fornecedor_nome)) >= 4
     and position(lower(btrim(v_obra.fornecedor_nome)) in lower(v_titulo || ' ' || v_texto)) > 0 then
    raise exception 'linha_tempo:nome_fornecedor';
  end if;
  if (v_titulo || ' ' || v_texto) ~ '\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}' then
    raise exception 'linha_tempo:documento';
  end if;

  select publicado into v_ant from public.linha_tempo_eventos where obra_id = p_obra_id;

  insert into public.linha_tempo_eventos as e
    (obra_id, titulo, texto, publicado, criado_por, atualizado_por, publicado_por, publicado_em)
  values (p_obra_id, v_titulo, v_texto, coalesce(p_publicar, false), v_uid, v_uid,
          case when p_publicar then v_uid end, case when p_publicar then now() end)
  on conflict (obra_id) do update set
    titulo = excluded.titulo,
    texto = excluded.texto,
    publicado = excluded.publicado,
    atualizado_por = v_uid,
    atualizado_em = now(),
    publicado_por = case when excluded.publicado and not coalesce(v_ant, false) then v_uid
                         when excluded.publicado then e.publicado_por end,
    publicado_em  = case when excluded.publicado and not coalesce(v_ant, false) then now()
                         when excluded.publicado then e.publicado_em end;

  return jsonb_build_object('obra_id', p_obra_id, 'publicado', coalesce(p_publicar, false));
end
$function$;

revoke all on function public.fn_linha_tempo_salvar(uuid, text, text, boolean) from public, anon;
grant execute on function public.fn_linha_tempo_salvar(uuid, text, text, boolean) to authenticated;

-- Pública: marco do acordo + eventos publicados de produto ainda aprovado
create or replace function public.fn_publico_linha_tempo()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'inicio', (select projeto_data_acordo from configuracoes_sistema where projeto_id = 'default'),
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data',              o.entrega_ref_data,
               'titulo',            e.titulo,
               'texto',             e.texto,
               'numero_produto',    o.numero_produto,
               'resultado_codigo',  r.codigo,
               'resultado_nome_pt', r.nome_pt,
               'resultado_nome_en', r.nome_en,
               'resultado_nome_es', r.nome_es,
               'atividade_codigo',  a.codigo
             ) order by o.entrega_ref_data, a.codigo, o.numero_produto)
      from linha_tempo_eventos e
      join vw_acervo_obras o on o.obra_id = e.obra_id and o.situacao_acervo = 'aprovado'
      join atividades a on a.id = o.atividade_id
      join resultados r on r.id = a.resultado_id
      where e.publicado
    ), '[]'::jsonb)
  )
$function$;

revoke all on function public.fn_publico_linha_tempo() from public;
grant execute on function public.fn_publico_linha_tempo() to anon, authenticated, service_role;
