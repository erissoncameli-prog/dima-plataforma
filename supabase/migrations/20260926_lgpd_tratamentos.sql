-- ════════════════════════════════════════════════════════════════════════
-- LGPD · ROPA vivo no banco (lgpd_tratamentos)
--
-- Registro das operações de tratamento (LGPD, art. 37) como TABELA, não como
-- documento solto: a coluna `tabelas` aponta as tabelas reais que
-- materializam cada tratamento, o que permite auditar o registro contra o
-- schema em vez de acreditar nele. Molde: SIGUC-AC, migration 211.
--
-- Regra: tabela nova com dado pessoal ganha entrada aqui NA MESMA ENTREGA.
-- Decisão de 26/09/2026: nasce só com a entrada do Diagnóstico
-- Socioambiental; os demais tratamentos do DIMA entram quando cada um for
-- revisado.
--
-- base_legal é text + CHECK (não enum) para não exigir migration a cada
-- hipótese nova; 'a_definir' é aceito e fica visível como pendência.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.lgpd_tratamentos (
  id                   uuid primary key default gen_random_uuid(),
  codigo               text not null unique,
  nome                 text not null,
  modulo               text,
  finalidade           text not null,
  controlador          text not null default 'SEMA/AC',
  operadores           text,
  base_legal           text not null check (base_legal in (
                         'a_definir',
                         'art7_ii_obrigacao_legal', 'art7_iii_politica_publica',
                         'art7_iv_estudo_pesquisa', 'art7_v_contrato',
                         'art11_ii_b_politica_publica', 'art11_ii_c_estudo_pesquisa')),
  base_legal_detalhe   text not null,
  categorias_titulares text[] not null default '{}',
  categorias_dados     text[] not null default '{}',
  dado_sensivel        boolean not null default false,
  dado_de_menor        boolean not null default false,
  tabelas              text[] not null default '{}',
  compartilhamento     text not null,
  transferencia_internacional text,
  -- NULL em retencao_prazo = guarda permanente. O critério textual é
  -- obrigatório justamente para não confundir com "sem política definida".
  retencao_prazo       interval,
  retencao_criterio    text not null,
  medidas_seguranca    text,
  ripd                 text,
  ativo                boolean not null default true,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

comment on table public.lgpd_tratamentos is
  'ROPA (LGPD art. 37). Uma linha por tratamento; `tabelas` aponta o schema real. Tabela nova com dado pessoal = linha nova aqui na mesma entrega.';

alter table public.lgpd_tratamentos enable row level security;
revoke all on public.lgpd_tratamentos from anon;
grant select, insert, update on public.lgpd_tratamentos to authenticated;

drop policy if exists lgpd_trat_select on public.lgpd_tratamentos;
create policy lgpd_trat_select on public.lgpd_tratamentos for select to authenticated
  using (exists (select 1 from public.usuarios u
                 where u.id = auth.uid() and u.ativo
                   and u.perfil in ('super_admin','coordenacao')));

drop policy if exists lgpd_trat_insert on public.lgpd_tratamentos;
create policy lgpd_trat_insert on public.lgpd_tratamentos for insert to authenticated
  with check (exists (select 1 from public.usuarios u
                      where u.id = auth.uid() and u.ativo and u.perfil = 'super_admin'));

drop policy if exists lgpd_trat_update on public.lgpd_tratamentos;
create policy lgpd_trat_update on public.lgpd_tratamentos for update to authenticated
  using (exists (select 1 from public.usuarios u
                 where u.id = auth.uid() and u.ativo and u.perfil = 'super_admin'))
  with check (exists (select 1 from public.usuarios u
                      where u.id = auth.uid() and u.ativo and u.perfil = 'super_admin'));
-- Sem DELETE: tratamento encerrado vira ativo = false.

create or replace function public.fn_lgpd_trat_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.atualizado_em := now(); return new; end $$;
revoke execute on function public.fn_lgpd_trat_touch() from public, anon, authenticated;

drop trigger if exists trg_lgpd_trat_touch on public.lgpd_tratamentos;
create trigger trg_lgpd_trat_touch before update on public.lgpd_tratamentos
  for each row execute function public.fn_lgpd_trat_touch();

drop trigger if exists trg_audit_lgpd_tratamentos on public.lgpd_tratamentos;
create trigger trg_audit_lgpd_tratamentos after insert or update or delete on public.lgpd_tratamentos
  for each row execute function public.fn_trg_audit();

-- ── Entrada do Diagnóstico Socioambiental ───────────────────────────────
-- retencao_prazo é LIDO pela rotina de retenção do módulo
-- (fn_diag_aplicar_retencao): mudar o prazo aqui muda o comportamento,
-- sem segunda constante no código.
insert into public.lgpd_tratamentos (
  codigo, nome, modulo, finalidade, operadores,
  base_legal, base_legal_detalhe,
  categorias_titulares, categorias_dados, dado_sensivel, dado_de_menor,
  tabelas, compartilhamento, transferencia_internacional,
  retencao_prazo, retencao_criterio, medidas_seguranca, ripd
) values (
  'TRAT-001',
  'Diagnóstico Socioambiental de comunidades (questionário domiciliar)',
  'diagnostico',
  'Subsidiar o planejamento e a prestação de contas do Projeto 218BRA2001 (Fundo Brasil-ONU/UNESCO) por meio de indicadores agregados. Uso interno da SEMA.',
  'Supabase (banco e arquivos); Vercel (hospedagem); consultores externos contratados, com termo de confidencialidade e LGPD',
  'a_definir',
  'A definir com o jurídico. Candidatas: art. 7º III ou IV (dados comuns); art. 11 II "b" ou "c" (filiação sindical, saúde); art. 14 (menores). Não usar consentimento.',
  array['entrevistados','moradores dos domicílios (inclui crianças e adolescentes)','técnicos entrevistadores'],
  array['nome (opcional)','nome dos moradores (opcional)','idade','sexo/gênero','composição domiciliar',
        'localização (GPS da casa)','fotos da moradia e do entorno','condição socioeconômica',
        'dinâmica familiar','filiação a organizações e sindicato (sensível)','problemas de saúde da comunidade','percepções'],
  true, true,
  array['diag_fichas','diag_fichas_identificacao','diag_moradores','diag_moradores_identificacao',
        'diag_fotos','diag_fichas_historico','storage:diagnostico-fotos'],
  'Nenhum. Uso interno da SEMA; para UNESCO/financiador vão apenas indicadores agregados lançados na Matriz de Resultados.',
  'Supabase/Vercel (art. 33) — pendência geral do DIMA',
  interval '2 years',
  'Nome do entrevistado, nomes dos moradores, GPS e fotos apagados 2 anos após a validação da ficha (ou do descarte). Ficha, respostas e indicadores permanecem sem identificação.',
  'RLS por perfil + permissão com prazo; identificação em tabelas separadas; consultor externo sem acesso à identificação e às fotos; supressão de agregados com menos de 5 fichas; bucket privado; auditoria redigida; PIN no app de campo.',
  'Rascunho em docs/diagnostico/ripd-rascunho.md'
) on conflict (codigo) do nothing;
