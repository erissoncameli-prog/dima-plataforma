-- ═══════════════════════════════════════════════════════════════════════════
-- LGPD · Camada 2 · 01 — Segregação dos dados bancários de beneficiários
--
-- CONTEXTO
-- `beneficiarios` guardava, na mesma linha, identidade (nome, CPF, nascimento,
-- passaporte) e dados financeiros (banco, agência, conta, tipo_conta, PIX,
-- IBAN). A policy era `auth.role() = 'authenticated'`: QUALQUER perfil logado
-- — inclusive `visualizador` e `consultor_externo` — lia e alterava a conta
-- bancária dos 19 titulares.
--
-- A UI já escondia a aba de beneficiários de quem não é super_admin ou
-- coordenação, mas isso é cosmético: a tabela seguia acessível via API REST.
--
-- ESTRATÉGIA (princípio da necessidade — art. 6º, III)
-- Duas camadas de acesso, porque os públicos são diferentes:
--
--   · identidade  → quem opera Viagens (super_admin, coordenacao, financeiro,
--                   tecnico). O módulo embeda esses campos no protocolo.
--   · bancários   → apenas quem administra beneficiários (super_admin,
--                   coordenacao), espelhando o `isAdmin` de viagens.html.
--
-- RLS é row-level, não column-level — por isso os campos financeiros vão para
-- tabela própria, 1:1. Isso também isola o dado para auditoria e para uma
-- eventual criptografia futura, sem tocar no resto do cadastro.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tabela dedicada aos dados financeiros ──────────────────────────────
create table if not exists public.beneficiario_dados_bancarios (
  beneficiario_id uuid primary key
    references public.beneficiarios(id) on delete cascade,
  banco       text,
  agencia     text,
  conta       text,
  tipo_conta  text,
  pix         text,
  iban        text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.beneficiario_dados_bancarios is
  'Dados financeiros de beneficiários, segregados de public.beneficiarios. '
  'Acesso restrito a super_admin e coordenação (LGPD art. 6º, III).';

-- ── 2. Migra os dados existentes ──────────────────────────────────────────
insert into public.beneficiario_dados_bancarios
  (beneficiario_id, banco, agencia, conta, tipo_conta, pix, iban)
select id, banco, agencia, conta, tipo_conta, pix, iban
  from public.beneficiarios
 where coalesce(banco, agencia, conta, tipo_conta, pix, iban) is not null
on conflict (beneficiario_id) do nothing;

alter table public.beneficiarios
  drop column if exists banco,
  drop column if exists agencia,
  drop column if exists conta,
  drop column if exists tipo_conta,
  drop column if exists pix,
  drop column if exists iban;

-- ── 3. RLS da tabela financeira ───────────────────────────────────────────
alter table public.beneficiario_dados_bancarios enable row level security;

create policy benef_banc_select on public.beneficiario_dados_bancarios
  for select to authenticated
  using ((select fn_perfil_atual()) in ('super_admin','coordenacao'));

create policy benef_banc_insert on public.beneficiario_dados_bancarios
  for insert to authenticated
  with check ((select fn_perfil_atual()) in ('super_admin','coordenacao'));

create policy benef_banc_update on public.beneficiario_dados_bancarios
  for update to authenticated
  using ((select fn_perfil_atual()) in ('super_admin','coordenacao'))
  with check ((select fn_perfil_atual()) in ('super_admin','coordenacao'));

create policy benef_banc_delete on public.beneficiario_dados_bancarios
  for delete to authenticated
  using ((select fn_perfil_atual()) = 'super_admin');

revoke all on public.beneficiario_dados_bancarios from anon;
grant select, insert, update, delete
  on public.beneficiario_dados_bancarios to authenticated;

-- ── 4. Restringe também a tabela de identidade ────────────────────────────
-- Antes: qualquer autenticado lia e escrevia. Agora: leitura para quem opera
-- Viagens; escrita apenas para quem administra o cadastro.
drop policy if exists beneficiarios_select on public.beneficiarios;
drop policy if exists beneficiarios_insert on public.beneficiarios;
drop policy if exists beneficiarios_update on public.beneficiarios;

create policy beneficiarios_select on public.beneficiarios
  for select to authenticated
  using ((select fn_perfil_atual())
         in ('super_admin','coordenacao','financeiro','tecnico'));

create policy beneficiarios_insert on public.beneficiarios
  for insert to authenticated
  with check ((select fn_perfil_atual()) in ('super_admin','coordenacao'));

create policy beneficiarios_update on public.beneficiarios
  for update to authenticated
  using ((select fn_perfil_atual()) in ('super_admin','coordenacao'))
  with check ((select fn_perfil_atual()) in ('super_admin','coordenacao'));
