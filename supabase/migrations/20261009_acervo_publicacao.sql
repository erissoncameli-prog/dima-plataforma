-- ═══════════════════════════════════════════════════════════════════════
-- ACERVO — Marcação de arquivos para o portal público
-- ═══════════════════════════════════════════════════════════════════════
-- O super_admin escolhe, ARQUIVO POR ARQUIVO, o que do acervo poderá
-- aparecer no portal público (a página pública ainda não existe; quando
-- existir, ela mostra só o que estiver marcado aqui e for `valida`).
--
-- Regras:
--   • só super_admin ativo marca/desmarca, e só pela RPC
--     fn_acervo_definir_publico (SECURITY DEFINER). A tabela não tem
--     policy nem grant de escrita para o cliente — não criar.
--   • só entra arquivo VIGENTE, de classe `produto` (nunca Nota Técnica,
--     comprovante, contrato/aditivo nem versão devolvida), de produto
--     com entrega de referência aprovada.
--   • desmarcar = publico=false (a linha fica; quem/quando registrado).
--   • se o produto for reentregue e o arquivo marcado deixar de ser
--     vigente, `vw_acervo_publicacoes.valida` vira false sozinha: nada
--     novo vai ao público sem nova marcação.
--   • auditoria em audit_log (fn_trg_audit).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.acervo_publicacoes (
  id             uuid primary key default gen_random_uuid(),
  midia_id       text not null unique,          -- = vw_acervo_midias.midia_id
  obra_id        uuid not null references public.contratos_produtos(id),
  publico        boolean not null default true,
  marcado_por    uuid references public.usuarios(id),
  marcado_em     timestamptz,
  desmarcado_por uuid references public.usuarios(id),
  desmarcado_em  timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists idx_acervo_publicacoes_obra on public.acervo_publicacoes(obra_id);

comment on table public.acervo_publicacoes is
  'Arquivos do acervo marcados pelo super_admin para o portal público (1 linha por midia_id). Escrita só por fn_acervo_definir_publico.';

alter table public.acervo_publicacoes enable row level security;

-- Leitura: quem enxerga o produto (RLS de contratos_produtos decide).
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'acervo_publicacoes'
                   and policyname = 'acervo_publicacoes_select') then
    create policy acervo_publicacoes_select on public.acervo_publicacoes
      for select to authenticated
      using (exists (select 1 from public.contratos_produtos cp where cp.id = obra_id));
  end if;
end $$;

revoke all on public.acervo_publicacoes from anon, authenticated;
grant select on public.acervo_publicacoes to authenticated;

create or replace trigger trg_audit_acervo_publicacoes
  after insert or update on public.acervo_publicacoes
  for each row execute function public.fn_trg_audit();


-- ── Situação efetiva da marcação ──────────────────────────────────────
-- `valida` = marcado E ainda é arquivo vigente de produto aprovado.
-- A futura página pública lê SÓ `where valida`.
create or replace view public.vw_acervo_publicacoes
with (security_invoker = true) as
select
  p.id,
  p.midia_id,
  p.obra_id,
  p.publico,
  p.marcado_por,
  p.marcado_em,
  p.desmarcado_por,
  p.desmarcado_em,
  m.versao_status,
  m.classe,
  m.origem,
  ref.situacao as entrega_ref_situacao,
  coalesce(
    p.publico
    and m.versao_status = 'vigente'
    and m.classe = 'produto'
    and m.origem <> 'nota_tecnica'
    and ref.situacao = 'aprovada',
    false) as valida
from public.acervo_publicacoes p
left join public.vw_acervo_midias m        on m.midia_id = p.midia_id
left join public.vw_acervo_entrega_ref ref on ref.produto_id = p.obra_id;

comment on view public.vw_acervo_publicacoes is
  'Marcações do portal público com a situação efetiva: valida = marcado e ainda vigente/aprovado. O portal público só mostra valida.';

revoke all on public.vw_acervo_publicacoes from anon, authenticated;
grant select on public.vw_acervo_publicacoes to authenticated;


-- ── RPC: marcar / desmarcar ───────────────────────────────────────────
create or replace function public.fn_acervo_definir_publico(p_midia_id text, p_publico boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_m    record;
  v_ref  text;
  v_obra uuid;
begin
  if v_uid is null or not exists (
       select 1 from public.usuarios u
        where u.id = v_uid and u.ativo and u.perfil = 'super_admin') then
    raise exception 'acervo:sem_permissao' using
      detail = 'Só super_admin marca arquivos para o portal público.';
  end if;

  if p_midia_id is null or p_publico is null then
    raise exception 'acervo:parametro_invalido';
  end if;

  select vm.midia_id, vm.obra_id, vm.versao_status, vm.classe, vm.origem
    into v_m
    from public.vw_acervo_midias vm
   where vm.midia_id = p_midia_id;

  if p_publico then
    if v_m.midia_id is null then
      raise exception 'acervo:arquivo_inexistente';
    end if;
    if v_m.origem = 'nota_tecnica' or v_m.classe <> 'produto' then
      raise exception 'acervo:arquivo_administrativo' using
        detail = 'Nota Técnica, comprovante e contrato não vão ao portal público.';
    end if;
    if v_m.versao_status <> 'vigente' then
      raise exception 'acervo:arquivo_nao_vigente' using
        detail = 'Só a versão vigente do produto pode ser marcada.';
    end if;
    select ref.situacao into v_ref
      from public.vw_acervo_entrega_ref ref where ref.produto_id = v_m.obra_id;
    if v_ref is distinct from 'aprovada' then
      raise exception 'acervo:produto_nao_aprovado';
    end if;

    insert into public.acervo_publicacoes as p (midia_id, obra_id, publico, marcado_por, marcado_em)
    values (p_midia_id, v_m.obra_id, true, v_uid, now())
    on conflict (midia_id) do update
      set publico = true, marcado_por = v_uid, marcado_em = now(),
          desmarcado_por = null, desmarcado_em = null, atualizado_em = now()
      where p.publico is distinct from true;
  else
    -- Desmarcar vale sempre, mesmo que o arquivo já não exista/seja vigente.
    update public.acervo_publicacoes
       set publico = false, desmarcado_por = v_uid, desmarcado_em = now(), atualizado_em = now()
     where midia_id = p_midia_id and publico;
  end if;

  select obra_id into v_obra from public.acervo_publicacoes where midia_id = p_midia_id;
  return jsonb_build_object('midia_id', p_midia_id, 'obra_id', v_obra, 'publico', p_publico);
end $$;

revoke all on function public.fn_acervo_definir_publico(text, boolean) from public, anon;
grant execute on function public.fn_acervo_definir_publico(text, boolean) to authenticated;
