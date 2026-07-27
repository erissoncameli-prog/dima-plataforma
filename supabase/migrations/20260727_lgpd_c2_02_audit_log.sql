-- ═══════════════════════════════════════════════════════════════════════════
-- LGPD · Camada 2 · 02 — Ativação da trilha de auditoria
--
-- CONTEXTO
-- A tabela `audit_log` existia mas estava VAZIA (0 linhas): nada a alimentava.
-- O art. 37 da LGPD obriga controlador e operador a manter registro das
-- operações de tratamento, e o art. 46 exige medidas capazes de demonstrar a
-- proteção do dado. Sem isso, não há como responder à pergunta que uma
-- fiscalização ou um incidente sempre faz: "quem acessou/alterou o dado de
-- fulano, e quando?".
--
-- ESCOPO
-- Auditadas as tabelas que contêm dado pessoal:
--   usuarios · beneficiarios · beneficiario_dados_bancarios ·
--   fornecedores · viagem_viajantes
--
-- REDAÇÃO
-- `beneficiario_dados_bancarios` é auditada em modo redigido: registra-se QUE
-- a conta ou o PIX mudou, nunca o valor. Do contrário o log viraria uma
-- segunda cópia, menos protegida, do dado que se quer proteger.
--
-- IMUTABILIDADE
-- `audit_log` tem RLS ativa com policy apenas de SELECT (super_admin e
-- coordenação). Não há policy de UPDATE nem DELETE, então nenhum usuário
-- consegue alterar o log. A trigger é SECURITY DEFINER e grava como owner.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Redação de valores para tabelas sensíveis ──────────────────────────
create or replace function public.fn_redigir_jsonb(p jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p is null then null
    else (
      select jsonb_object_agg(k, to_jsonb('[redigido]'::text))
      from jsonb_object_keys(p) as k
    )
  end;
$$;

comment on function public.fn_redigir_jsonb(jsonb) is
  'Substitui todos os valores de um jsonb por [redigido], preservando as '
  'chaves. Usado na auditoria de tabelas com dado financeiro.';

-- ── 2. Trigger genérica de auditoria ──────────────────────────────────────
-- Uso: create trigger ... execute function fn_trg_audit();            (normal)
--      create trigger ... execute function fn_trg_audit('redigir');   (redigido)
create or replace function public.fn_trg_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes   jsonb;
  v_depois  jsonb;
  v_campos  jsonb;
  v_redigir boolean := (tg_nargs > 0 and tg_argv[0] = 'redigir');
begin
  if tg_op = 'DELETE' then
    v_antes := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    v_depois := to_jsonb(new);
  else
    v_antes  := to_jsonb(old);
    v_depois := to_jsonb(new);
  end if;

  -- Em UPDATE, isola o que realmente mudou e ignora no-ops
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, v_depois -> key)
      into v_campos
      from jsonb_object_keys(v_depois) as key
     where (v_depois -> key) is distinct from (v_antes -> key)
       and key not in ('atualizado_em');

    if v_campos is null or v_campos = '{}'::jsonb then
      return new;
    end if;
  end if;

  if v_redigir then
    v_antes  := fn_redigir_jsonb(v_antes);
    v_depois := fn_redigir_jsonb(v_depois);
    v_campos := fn_redigir_jsonb(v_campos);
  end if;

  insert into public.audit_log (
    usuario_id, operacao, tabela, registro_id,
    dados_antes, dados_depois, campos_alterados
  ) values (
    auth.uid(),
    tg_op::operacao_audit,
    tg_table_name,
    coalesce(
      to_jsonb(coalesce(new, old)) ->> 'id',
      to_jsonb(coalesce(new, old)) ->> 'beneficiario_id'
    ),
    v_antes, v_depois, v_campos
  );

  return coalesce(new, old);
end;
$$;

comment on function public.fn_trg_audit() is
  'Trilha de auditoria genérica (LGPD art. 37). Passe o argumento "redigir" '
  'para registrar apenas quais campos mudaram, sem os valores.';

-- ── 3. Ligação nas tabelas com dado pessoal ───────────────────────────────
drop trigger if exists trg_audit_usuarios on public.usuarios;
create trigger trg_audit_usuarios
  after insert or update or delete on public.usuarios
  for each row execute function public.fn_trg_audit();

drop trigger if exists trg_audit_beneficiarios on public.beneficiarios;
create trigger trg_audit_beneficiarios
  after insert or update or delete on public.beneficiarios
  for each row execute function public.fn_trg_audit();

drop trigger if exists trg_audit_fornecedores on public.fornecedores;
create trigger trg_audit_fornecedores
  after insert or update or delete on public.fornecedores
  for each row execute function public.fn_trg_audit();

drop trigger if exists trg_audit_viagem_viajantes on public.viagem_viajantes;
create trigger trg_audit_viagem_viajantes
  after insert or update or delete on public.viagem_viajantes
  for each row execute function public.fn_trg_audit();

-- Dado financeiro: audita a mudança, nunca o valor
drop trigger if exists trg_audit_dados_bancarios on public.beneficiario_dados_bancarios;
create trigger trg_audit_dados_bancarios
  after insert or update or delete on public.beneficiario_dados_bancarios
  for each row execute function public.fn_trg_audit('redigir');

-- ── 4. Índices para consulta da trilha ────────────────────────────────────
create index if not exists idx_audit_log_tabela_registro
  on public.audit_log (tabela, registro_id, criado_em desc);
create index if not exists idx_audit_log_usuario
  on public.audit_log (usuario_id, criado_em desc);
