-- ═══════════════════════════════════════════════════════════════════════
-- ACERVO — Capa extraída da primeira página do PDF
-- ═══════════════════════════════════════════════════════════════════════
-- A biblioteca usa a página 1 do produto como capa do pôster, no lugar do
-- degradê gerado (que continua como placeholder e fallback).
--
-- ⚠️ LGPD: a primeira página de um produto de consultor PF costuma trazer
-- nome e às vezes CPF. Por isso o bucket de capas é PRIVADO, como todo o
-- resto dos documentos — a leitura passa por urlAssinada(). Publicar as
-- miniaturas num bucket aberto seria desfazer a migração 20260727_lgpd_c1_01.
--
-- Geração: a miniatura é renderizada UMA VEZ no navegador (pdf.js), pelo
-- primeiro usuário que rolar o pôster até a tela, e persistida aqui para
-- todos os demais. Não há serviço de renderização no servidor e não há job
-- de backfill: o acervo se completa conforme as pessoas navegam.
--
-- Só se gera capa da EDIÇÃO VIGENTE — nunca da versão devolvida.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Bucket privado ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('acervo-capas', 'acervo-capas', false)
on conflict (id) do update set public = false;

drop policy if exists "acervo_capas_auth_select" on storage.objects;
drop policy if exists "acervo_capas_auth_insert" on storage.objects;
drop policy if exists "acervo_capas_auth_update" on storage.objects;

create policy "acervo_capas_auth_select" on storage.objects
  for select to authenticated using (bucket_id = 'acervo-capas');
create policy "acervo_capas_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'acervo-capas');
create policy "acervo_capas_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'acervo-capas');


-- ── Registro das capas ────────────────────────────────────────────────
-- Chaveada por midia_id (o id sintético de vw_acervo_midias), que cobre as
-- cinco origens de arquivo sem precisar de uma coluna por tabela.
create table if not exists public.acervo_capas (
  midia_id     text primary key,
  obra_id      uuid not null references public.contratos_produtos(id) on delete cascade,
  arquivo_url  text,
  largura      integer,
  altura       integer,
  bytes        integer,
  -- 'ok' = capa disponível; 'falha' = PDF ilegível, não tentar de novo
  status       text not null default 'ok' check (status in ('ok', 'falha')),
  erro         text,
  gerada_em    timestamptz not null default now(),
  gerada_por   uuid references public.usuarios(id)
);

create index if not exists idx_acervo_capas_obra on public.acervo_capas(obra_id);

comment on table public.acervo_capas is
  'Miniatura da 1ª página do PDF usada como capa no Acervo. Gerada no cliente uma única vez e compartilhada. status=falha marca PDF que não deve ser retentado.';

alter table public.acervo_capas enable row level security;

drop policy if exists acervo_capas_select on public.acervo_capas;
drop policy if exists acervo_capas_insert on public.acervo_capas;
drop policy if exists acervo_capas_update on public.acervo_capas;
drop policy if exists acervo_capas_delete on public.acervo_capas;

-- Quem está logado lê. O conteúdo em si continua protegido pelo bucket
-- privado: a linha guarda só o caminho, que sem assinatura não abre.
create policy acervo_capas_select on public.acervo_capas
  for select to authenticated using (true);

-- Escrita liberada a autenticados: só se gera capa de arquivo que o próprio
-- usuário já consegue ler, e o pior caso é uma miniatura errada.
create policy acervo_capas_insert on public.acervo_capas
  for insert to authenticated with check (true);
create policy acervo_capas_update on public.acervo_capas
  for update to authenticated using (true);

-- Regerar = apagar a linha; restrito a quem administra.
create policy acervo_capas_delete on public.acervo_capas
  for delete to authenticated using (
    exists (select 1 from public.usuarios u
            where u.id = auth.uid() and u.perfil in ('super_admin', 'coordenacao'))
  );

grant select, insert, update on public.acervo_capas to authenticated;
grant delete on public.acervo_capas to authenticated;
revoke all on public.acervo_capas from anon;


-- ── vw_acervo_obras ganha a capa ──────────────────────────────────────
-- `capa_midia_id` diz QUAL arquivo renderizar; `capa_url` diz se já foi
-- feito. O frontend não precisa de nenhuma outra consulta para decidir.
create or replace view public.vw_acervo_obras
with (security_invoker = true) as
select
  cp.id                                        as obra_id,
  cp.numero_produto,
  cp.descricao                                 as titulo,
  cp.situacao                                  as situacao_produto,
  cp.observacoes,
  cp.valor_brl,
  cp.valor_aprovado,
  cp.pct_aprovado,
  cp.dt_vencimento,
  cp.dt_entrega,
  cp.parecer_avaliador,
  cp.total_entregas,
  cp.criado_em,
  cp.atualizado_em,
  c.id                                         as contrato_id,
  c.numero                                     as contrato_numero,
  c.objeto_pt                                  as contrato_objeto,
  c.status::text                               as contrato_status,
  a.id                                         as atividade_id,
  a.codigo                                     as atividade_codigo,
  a.nome_pt                                    as atividade_nome,
  r.id                                         as resultado_id,
  r.codigo                                     as resultado_codigo,
  r.nome_pt                                    as resultado_nome,
  f.id                                         as fornecedor_id,
  f.nome                                       as fornecedor_nome,
  f.tipo                                       as fornecedor_tipo,
  ref.entrega_id                               as entrega_ref_id,
  ref.numero_entrega                           as entrega_ref_numero,
  ref.situacao                                 as entrega_ref_situacao,
  ref.tipo_decisao                             as entrega_ref_decisao,
  ref.dt_entrega                               as entrega_ref_data,
  ref.despacho_numero                          as entrega_ref_despacho,
  coalesce(ref.tipo_decisao = 'aprovacao_parcial', false) as aprovacao_parcial,
  case
    when ref.entrega_id is null          then 'sem_entrega'
    when ref.situacao = 'aprovada'       then 'aprovado'
    when ref.situacao = 'devolvida'      then 'em_correcao'
    else 'em_avaliacao'
  end                                          as situacao_acervo,
  coalesce(m.total_midias, 0)                  as total_midias,
  coalesce(m.total_vigentes, 0)                as total_vigentes,
  coalesce(m.total_superadas, 0)               as total_superadas,
  coalesce(m.total_instrucao, 0)               as total_instrucao,
  coalesce(m.tipos_midia, array[]::text[])     as tipos_midia,
  coalesce(m.rotulos_vigentes, array[]::text[]) as rotulos_vigentes,
  coalesce(m.rotulos_todos, array[]::text[])   as rotulos_midia,
  m.publicado_em,
  coalesce(m.publicado_em, cp.dt_entrega::timestamptz, cp.criado_em) as ordenacao_em,
  -- Capa
  fonte.midia_id                               as capa_midia_id,
  fonte.arquivo_url                            as capa_fonte_url,
  cap.arquivo_url                              as capa_url,
  cap.status                                   as capa_status
from public.contratos_produtos cp
join public.contratos c         on c.id = cp.contrato_id
left join public.atividades a   on a.id = c.atividade_id
left join public.resultados r   on r.id = a.resultado_id
left join public.fornecedores f on f.id = c.fornecedor_id
left join public.vw_acervo_entrega_ref ref on ref.produto_id = cp.id
left join lateral (
  select
    count(*)                                                                       as total_midias,
    count(*) filter (where vm.versao_status = 'vigente')                           as total_vigentes,
    count(*) filter (where vm.versao_status = 'superada')                          as total_superadas,
    count(*) filter (where vm.versao_status = 'instrucao')                         as total_instrucao,
    array_agg(distinct vm.midia_tipo) filter (where vm.versao_status = 'vigente')  as tipos_midia,
    array_agg(distinct vm.rotulo)
      filter (where vm.versao_status = 'vigente' and vm.rotulo is not null)        as rotulos_vigentes,
    array_agg(distinct vm.rotulo) filter (where vm.rotulo is not null)             as rotulos_todos,
    max(vm.adicionado_em) filter (where vm.versao_status = 'vigente')              as publicado_em
  from public.vw_acervo_midias vm
  where vm.obra_id = cp.id
) m on true
-- Candidato a capa: o PDF vigente mais recente da obra
left join lateral (
  select vm.midia_id, vm.arquivo_url
  from public.vw_acervo_midias vm
  where vm.obra_id = cp.id
    and vm.versao_status = 'vigente'
    and vm.extensao = 'pdf'
  order by vm.adicionado_em desc
  limit 1
) fonte on true
left join public.acervo_capas cap on cap.midia_id = fonte.midia_id;

comment on view public.vw_acervo_obras is
  'Obras do acervo — produto contratado por linha, com edição de referência, estado de acervo, contagens por camada de versão e capa (capa_midia_id = o que renderizar, capa_url = se já foi feito).';

grant select on public.vw_acervo_obras to authenticated;
revoke all on public.vw_acervo_obras from anon;
