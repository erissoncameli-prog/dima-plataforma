-- Nota técnica: retirar a nota conferida ANTES de aprovar a entrega.
-- Depois de aprovada na conferência, a nota ficava travada na entrega (só super_admin trocava; _b_unica).
-- Agora quem anexou a nota (ou um super_admin) pode retirá-la, com motivo, enquanto a entrega está em
-- análise — pela Edge Function conferir-nota-tecnica (acao 'retirar', service_role). Nada é apagado:
-- a conferência fica com retirada_em/por/motivo e o PDF segue no armazenamento.
-- Conferência retirada não trava a troca (Edge Function), não conta como "nota já usada em outro
-- produto" e não serve para aprovar (trigger abaixo).

alter table public.nota_tecnica_conferencias
  add column if not exists retirada_em     timestamptz,
  add column if not exists retirada_por    uuid,
  add column if not exists retirada_motivo text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'nt_conf_retirada_por_fkey') then
    alter table public.nota_tecnica_conferencias
      add constraint nt_conf_retirada_por_fkey foreign key (retirada_por) references public.usuarios(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nt_conf_retirada_coerente') then
    alter table public.nota_tecnica_conferencias
      add constraint nt_conf_retirada_coerente check (
        (retirada_em is null and retirada_por is null and retirada_motivo is null)
        or (retirada_em is not null and retirada_por is not null and length(btrim(retirada_motivo)) >= 10));
  end if;
end $$;

comment on column public.nota_tecnica_conferencias.retirada_em is
  'Nota retirada antes da aprovação (quem anexou ou super_admin, pela Edge Function). Não vale mais para aprovar.';

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

  -- 1. nota técnica conferida (a última da entrega, aprovada, recente e não retirada)
  v_cam := public.fn_nt_caminho(new.nota_tecnica_url);
  if v_cam is null then
    raise exception 'NOTA_TECNICA_OBRIGATORIA: anexe a nota técnica (PDF do SEI) para aprovar o produto.';
  end if;
  select caminho, aprovada, conferido_em, retirada_em into v_ult
    from public.nota_tecnica_conferencias
   where entrega_id = new.id and origem = 'tela'
   order by conferido_em desc limit 1;
  if found and v_ult.retirada_em is not null then
    raise exception 'NOTA_TECNICA_RETIRADA: a nota técnica desta entrega foi retirada — anexe a nova nota para aprovar.';
  end if;
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
