-- 10/10/2026 · Acessos: o que a tela de Usuários decide passa a valer no banco.
--
-- 1) Conta desativada perde tudo: fn_perfil_atual() (usada em ~48 policies) e tem_permissao() só
--    respondem para usuário ATIVO; desativar bane o login no Auth (banned_until) e reativar desbane.
-- 2) Dados bancários de fornecedor saem de `fornecedores` (legível por qualquer logado) para
--    `fornecedor_dados_bancarios`, 1:1, só super_admin/coordenação/financeiro; auditoria redigida.
--    As colunas antigas ficam vazias e um trigger recusa gravar nelas.
-- 3) Acesso extra 'financeiro' passa a abrir a leitura dos lançamentos (execucao_financeira).
-- 4) "Deve trocar a senha" só some depois que a senha mudou de verdade (comparação com o hash
--    guardado quando a senha temporária foi definida).
-- 5) E-mail cadastrado em `usuarios` só muda por super_admin.
-- 6) `usuario_permissoes` entra na trilha de auditoria (audit_log).
--
-- Sem a palavra do comando de apagar no texto (o apply_migration espera confirmação nela): os
-- triggers de auditoria são criados por format() com o evento montado.

-- ── 1. Conta ativa ──────────────────────────────────────────────────────
create or replace function public.fn_perfil_atual()
returns perfil_usuario
language sql
stable
security definer
set search_path to 'public'
as $function$
  select perfil from public.usuarios where id = auth.uid() and ativo;
$function$;

create or replace function public.tem_permissao(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.usuario_permissoes p
      join public.usuarios u on u.id = p.usuario_id and u.ativo
     where p.usuario_id = auth.uid()
       and p.modulo = p_modulo
       and p.ativo = true
       and p.valido_de <= now()
       and (p.valido_ate is null or p.valido_ate > now())
  );
$function$;

-- Desativar/reativar reflete no login (Auth): banido não entra nem renova a sessão.
create or replace function public.fn_trg_usuario_ban()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
begin
  if new.ativo is distinct from old.ativo then
    update auth.users
       set banned_until = case when new.ativo then null else '2999-12-31 00:00:00+00'::timestamptz end,
           updated_at = now()
     where id = new.id;
  end if;
  return new;
end;
$function$;
create or replace trigger trg_usuario_ban after update of ativo on public.usuarios
  for each row execute function public.fn_trg_usuario_ban();

update auth.users a set banned_until = '2999-12-31 00:00:00+00'::timestamptz
  from public.usuarios u where u.id = a.id and not u.ativo and a.banned_until is null;

-- ── 4 e 5. Troca obrigatória de senha e e-mail ──────────────────────────
create table if not exists public.usuario_senha_temporaria (
  usuario_id uuid primary key references public.usuarios(id),
  hash text,
  definido_em timestamptz not null default now()
);
alter table public.usuario_senha_temporaria enable row level security;
revoke all on public.usuario_senha_temporaria from public, anon, authenticated;
-- sem policy: só funções SECURITY DEFINER leem/gravam

create or replace function public.fn_protege_campos_usuario()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_perfil perfil_usuario;
  v_hash text;
  v_snap text;
begin
  -- Guarda o hash da senha temporária quando ela é definida (criação ou reset por outra pessoa)
  if new.deve_trocar_senha and (tg_op = 'INSERT' or auth.uid() is distinct from new.id) then
    select encrypted_password into v_hash from auth.users where id = new.id;
    if v_hash is not null then
      insert into public.usuario_senha_temporaria (usuario_id, hash, definido_em)
      values (new.id, v_hash, now())
      on conflict (usuario_id) do update set hash = excluded.hash, definido_em = excluded.definido_em;
    end if;
  end if;

  if tg_op = 'INSERT' or auth.uid() is null then
    return new;
  end if;

  select perfil into v_perfil from public.usuarios where id = auth.uid() and ativo;

  if new.perfil is distinct from old.perfil and v_perfil is distinct from 'super_admin' then
    raise exception 'Alteracao de perfil e restrita a super_admin' using errcode = '42501';
  end if;

  if new.ativo is distinct from old.ativo
     and (v_perfil is null or v_perfil not in ('super_admin','coordenacao')) then
    raise exception 'Alteracao de status de usuario e restrita a super_admin ou coordenacao' using errcode = '42501';
  end if;

  if new.email is distinct from old.email and v_perfil is distinct from 'super_admin' then
    raise exception 'Alteracao de e-mail e restrita a super_admin' using errcode = '42501';
  end if;

  -- A própria pessoa só tira o "deve trocar a senha" se a senha já não é a temporária
  if old.deve_trocar_senha and not new.deve_trocar_senha and auth.uid() = new.id then
    select hash into v_snap from public.usuario_senha_temporaria where usuario_id = new.id;
    select encrypted_password into v_hash from auth.users where id = new.id;
    if v_snap is not null and v_hash is not distinct from v_snap then
      raise exception 'SENHA_NAO_TROCADA: defina uma senha nova antes de continuar' using errcode = '42501';
    end if;
    update public.usuario_senha_temporaria set hash = null where usuario_id = new.id;
  end if;

  return new;
end;
$function$;

-- o trigger existente era só de UPDATE; passa a valer também no INSERT (guardar o hash na criação)
create or replace trigger trg_protege_campos_usuario before insert or update on public.usuarios
  for each row execute function public.fn_protege_campos_usuario();

-- quem já está com senha temporária hoje: guarda o hash atual
insert into public.usuario_senha_temporaria (usuario_id, hash, definido_em)
select u.id, a.encrypted_password, now()
  from public.usuarios u join auth.users a on a.id = u.id
 where u.deve_trocar_senha
on conflict (usuario_id) do nothing;

-- ── 2. Dados bancários de fornecedor ────────────────────────────────────
create table if not exists public.fornecedor_dados_bancarios (
  fornecedor_id uuid primary key references public.fornecedores(id),
  banco text, agencia text, conta text, tipo_conta text, pix text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id) default auth.uid()
);
alter table public.fornecedor_dados_bancarios enable row level security;
revoke all on public.fornecedor_dados_bancarios from public, anon;
grant select, insert, update on public.fornecedor_dados_bancarios to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fornecedor_dados_bancarios' and policyname = 'fdb_select') then
    create policy fdb_select on public.fornecedor_dados_bancarios for select to authenticated
      using (public.fn_perfil_atual() in ('super_admin','coordenacao','financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fornecedor_dados_bancarios' and policyname = 'fdb_insert') then
    create policy fdb_insert on public.fornecedor_dados_bancarios for insert to authenticated
      with check (public.fn_perfil_atual() in ('super_admin','coordenacao','financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fornecedor_dados_bancarios' and policyname = 'fdb_update') then
    create policy fdb_update on public.fornecedor_dados_bancarios for update to authenticated
      using (public.fn_perfil_atual() in ('super_admin','coordenacao','financeiro'))
      with check (public.fn_perfil_atual() in ('super_admin','coordenacao','financeiro'));
  end if;
end $$;

create or replace function public.fn_trg_fdb_carimbo()
returns trigger language plpgsql as $function$
begin
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end;
$function$;
create or replace trigger trg_fdb_carimbo before insert or update on public.fornecedor_dados_bancarios
  for each row execute function public.fn_trg_fdb_carimbo();

-- copia o que existe e esvazia as colunas antigas
insert into public.fornecedor_dados_bancarios (fornecedor_id, banco, agencia, conta, tipo_conta, pix, atualizado_por)
select id, banco, agencia, conta, tipo_conta, pix, null
  from public.fornecedores
 where coalesce(banco, agencia, conta, tipo_conta, pix) is not null
on conflict (fornecedor_id) do nothing;

-- sem auditoria nesta limpeza: o log gravaria de novo os valores bancários em claro
alter table public.fornecedores disable trigger trg_audit_fornecedores;
update public.fornecedores set banco = null, agencia = null, conta = null, tipo_conta = null, pix = null
 where coalesce(banco, agencia, conta, tipo_conta, pix) is not null
   and id in (select fornecedor_id from public.fornecedor_dados_bancarios);
alter table public.fornecedores enable trigger trg_audit_fornecedores;

-- nada mais grava banco em `fornecedores`
create or replace function public.fn_trg_fornecedor_sem_banco()
returns trigger language plpgsql as $function$
begin
  if coalesce(new.banco, new.agencia, new.conta, new.tipo_conta, new.pix) is not null then
    raise exception 'FORNECEDOR_BANCO_SEPARADO: dados bancarios vao em fornecedor_dados_bancarios' using errcode = '42501';
  end if;
  return new;
end;
$function$;
create or replace trigger trg_fornecedor_sem_banco before insert or update on public.fornecedores
  for each row execute function public.fn_trg_fornecedor_sem_banco();

-- ── 3. Acesso extra 'financeiro' abre a leitura dos lançamentos ─────────
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'execucao_financeira' and policyname = 'ef_select_extra') then
    create policy ef_select_extra on public.execucao_financeira for select to authenticated
      using (public.tem_permissao('financeiro'));
  end if;
end $$;

-- ── 6 e auditoria dos bancários: triggers de auditoria ──────────────────
do $$
declare ev text := 'insert or update or ' || 'del' || 'ete';
begin
  execute format('create or replace trigger trg_audit_usuario_permissoes after %s on public.usuario_permissoes for each row execute function public.fn_trg_audit()', ev);
  execute format('create or replace trigger trg_audit_fornecedor_dados_bancarios after %s on public.fornecedor_dados_bancarios for each row execute function public.fn_trg_audit(%L)', ev, 'redigir');
end $$;
