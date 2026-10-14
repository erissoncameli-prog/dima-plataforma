-- Aprovar produto (total ou parcial) exige a senha de login, reconfirmada no servidor.
-- A Edge Function conferir-nota-tecnica (acao 'confirmar_aprovacao') confere a senha (mesmo bloqueio do
-- remanejamento: 5 erros em 30 min) e grava aqui uma confirmação de uso único, válida por 10 minutos,
-- para a entrega, a pessoa e a decisão. A trava de aprovação consome a confirmação; sem ela, recusa.
-- A senha nunca é gravada. Devolução não pede senha.

create table if not exists public.entrega_aprovacao_senhas (
  id            uuid primary key default gen_random_uuid(),
  entrega_id    uuid not null references public.contratos_produtos_entregas(id),
  usuario_id    uuid not null references public.usuarios(id),
  tipo_decisao  text not null check (tipo_decisao in ('aprovacao_total', 'aprovacao_parcial')),
  confirmado_em timestamptz not null default now(),
  usado_em      timestamptz,
  ip            text,
  user_agent    text
);
create index if not exists eas_entrega_idx on public.entrega_aprovacao_senhas (entrega_id, usuario_id, confirmado_em desc);
alter table public.entrega_aprovacao_senhas enable row level security;
revoke all on public.entrega_aprovacao_senhas from public, anon, authenticated;

create or replace function public.fn_trg_entrega_exige_nota()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_cam text; v_ult record; v_senha uuid;
begin
  if new.situacao is distinct from 'aprovada' then return new; end if;
  if tg_op = 'UPDATE' and old.situacao = 'aprovada'
     and new.nota_tecnica_url is not distinct from old.nota_tecnica_url then
    return new;
  end if;
  if current_setting('dima.nota_tecnica', true) = 'dispensar' then return new; end if;

  -- 1. nota técnica conferida (a última da entrega, aprovada, recente)
  v_cam := public.fn_nt_caminho(new.nota_tecnica_url);
  if v_cam is null then
    raise exception 'NOTA_TECNICA_OBRIGATORIA: anexe a nota técnica (PDF do SEI) para aprovar o produto.';
  end if;
  select caminho, aprovada, conferido_em into v_ult
    from public.nota_tecnica_conferencias
   where entrega_id = new.id and origem = 'tela'
   order by conferido_em desc limit 1;
  if not found or not v_ult.aprovada or v_ult.caminho is distinct from v_cam
     or v_ult.conferido_em <= now() - interval '2 days' then
    raise exception 'NOTA_TECNICA_NAO_CONFERIDA: a nota técnica anexada não é a última conferida e aprovada desta entrega — anexe a nota corrigida.';
  end if;

  -- 2. senha de login confirmada há pouco, por quem está aprovando, para esta decisão (uso único)
  if tg_op = 'INSERT' or old.situacao is distinct from 'aprovada' then
    select id into v_senha from public.entrega_aprovacao_senhas
     where entrega_id = new.id and usuario_id = auth.uid() and usado_em is null
       and tipo_decisao = coalesce(new.tipo_decisao, 'aprovacao_total')
       and confirmado_em > now() - interval '10 minutes'
     order by confirmado_em desc limit 1;
    if v_senha is null then
      raise exception 'SENHA_NAO_CONFIRMADA: confirme a aprovação com a sua senha de login.';
    end if;
    update public.entrega_aprovacao_senhas set usado_em = now() where id = v_senha;
  end if;
  return new;
end $$;
revoke execute on function public.fn_trg_entrega_exige_nota() from public, anon, authenticated;
