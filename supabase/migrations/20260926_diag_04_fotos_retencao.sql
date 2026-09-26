-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 04 — bucket de fotos e retenção de 2 anos
--
-- Fotos (decisão de 26/09): moradia e entorno, nunca pessoas; tratadas como
-- IDENTIFICAÇÃO (a foto da casa localiza a família) → consultor externo não vê.
-- Bucket privado desde o nascimento; leitura sempre por URL assinada.
-- Caminho: <uuid_cliente da ficha>/<uuid_cliente da foto>.jpg — usa o
-- uuid_cliente porque a foto é tirada offline, antes de a ficha ter id no
-- servidor. As policies leem a 1ª pasta (mesmo padrão de tarefas-anexos).
--
-- Retenção (decisão de 26/09): nome do entrevistado, nomes dos moradores,
-- GPS e fotos apagados 2 anos após a VALIDAÇÃO (ou o descarte). O prazo é
-- lido de lgpd_tratamentos (TRAT-001) — sem segunda constante.
-- Arquivo do Storage só se apaga pela API: a rotina põe o caminho em
-- diag_expurgo_arquivos, drenada por Edge Function (entrega da Fase 3).
-- ════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diagnostico-fotos', 'diagnostico-fotos', false, 3145728,
        array['image/jpeg','image/webp','image/png'])
on conflict (id) do update set public = false;

-- uuid_cliente da ficha a partir do caminho (NULL se a 1ª pasta não for uuid)
create or replace function public.fn_diag_uuid_do_path(p_name text)
returns uuid language sql immutable set search_path = public as $$
  select case when (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(p_name))[1])::uuid end
$$;

-- ler: coordenação/super_admin, ou o entrevistador dono da ficha.
-- Foto que subiu antes de a ficha chegar ao servidor: só quem subiu.
create or replace function public.fn_diag_foto_pode_ler(p_name text, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when fn_diag_pode_gerir() then true
    when exists (select 1 from diag_fichas f where f.uuid_cliente = fn_diag_uuid_do_path(p_name))
      then exists (select 1 from diag_fichas f
                   where f.uuid_cliente = fn_diag_uuid_do_path(p_name)
                     and f.entrevistador_id = auth.uid() and fn_diag_pode_aplicar())
    else p_owner = auth.uid() and fn_diag_pode_aplicar()
  end
$$;

-- enviar: quem aplica, para ficha ainda não enviada ou própria e editável
create or replace function public.fn_diag_foto_pode_enviar(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select fn_diag_pode_aplicar()
     and fn_diag_uuid_do_path(p_name) is not null
     and (
       not exists (select 1 from diag_fichas f where f.uuid_cliente = fn_diag_uuid_do_path(p_name))
       or exists (select 1 from diag_fichas f
                  where f.uuid_cliente = fn_diag_uuid_do_path(p_name)
                    and f.entrevistador_id = auth.uid() and f.status in ('enviada','devolvida')))
$$;

drop policy if exists "diag_fotos_obj_select" on storage.objects;
drop policy if exists "diag_fotos_obj_insert" on storage.objects;
drop policy if exists "diag_fotos_obj_delete" on storage.objects;

create policy "diag_fotos_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'diagnostico-fotos' and public.fn_diag_foto_pode_ler(name, owner));
create policy "diag_fotos_obj_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'diagnostico-fotos' and public.fn_diag_foto_pode_enviar(name));
create policy "diag_fotos_obj_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'diagnostico-fotos' and public.fn_diag_pode_gerir());
-- sem UPDATE: foto não é sobrescrita; reenvio usa o mesmo caminho só se não existir

-- ── Retenção ────────────────────────────────────────────────────────────
create or replace function public.fn_diag_aplicar_retencao()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_prazo interval;
  v_ids   uuid[];
begin
  select retencao_prazo into v_prazo from lgpd_tratamentos
  where modulo = 'diagnostico' and ativo order by codigo limit 1;
  if v_prazo is null then
    raise exception 'diag:retencao_sem_prazo: TRAT-001 sem retencao_prazo em lgpd_tratamentos';
  end if;

  select array_agg(id) into v_ids from diag_fichas
  where identificacao_apagada_em is null
    and ( (status = 'validada'   and validado_em   < now() - v_prazo)
       or (status = 'descartada' and descartado_em < now() - v_prazo) );
  if v_ids is null then return 0; end if;

  perform set_config('diag.motivo', 'retencao_2_anos', true);
  delete from diag_fichas_identificacao where ficha_id = any(v_ids);
  delete from diag_moradores_identificacao mi using diag_moradores m
   where mi.morador_id = m.id and m.ficha_id = any(v_ids);
  delete from diag_fotos where ficha_id = any(v_ids);         -- arquivos → diag_expurgo_arquivos
  update diag_fichas set identificacao_apagada_em = now() where id = any(v_ids);
  return array_length(v_ids, 1);
end $$;

-- ficha com identificação já apagada não volta a receber identificação
create or replace function public.fn_diag_bloqueia_ident_apos_retencao() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ficha uuid;
begin
  -- to_jsonb: as três tabelas têm colunas diferentes (morador_id × ficha_id)
  v_ficha := case tg_table_name
               when 'diag_moradores_identificacao'
                 then (select ficha_id from diag_moradores where id = (to_jsonb(new)->>'morador_id')::uuid)
               else (to_jsonb(new)->>'ficha_id')::uuid end;
  if exists (select 1 from diag_fichas where id = v_ficha and identificacao_apagada_em is not null) then
    raise exception 'diag:identificacao_expirada: prazo de retenção já aplicado a esta ficha';
  end if;
  return new;
end $$;

drop trigger if exists trg_diag_ident_bloqueio on public.diag_fichas_identificacao;
create trigger trg_diag_ident_bloqueio before insert or update on public.diag_fichas_identificacao
  for each row execute function public.fn_diag_bloqueia_ident_apos_retencao();
drop trigger if exists trg_diag_mor_ident_bloqueio on public.diag_moradores_identificacao;
create trigger trg_diag_mor_ident_bloqueio before insert or update on public.diag_moradores_identificacao
  for each row execute function public.fn_diag_bloqueia_ident_apos_retencao();
drop trigger if exists trg_diag_fotos_bloqueio on public.diag_fotos;
create trigger trg_diag_fotos_bloqueio before insert or update on public.diag_fotos
  for each row execute function public.fn_diag_bloqueia_ident_apos_retencao();

revoke execute on function public.fn_diag_uuid_do_path(text), public.fn_diag_foto_pode_ler(text, uuid),
  public.fn_diag_foto_pode_enviar(text) from public, anon;
grant execute on function public.fn_diag_uuid_do_path(text), public.fn_diag_foto_pode_ler(text, uuid),
  public.fn_diag_foto_pode_enviar(text) to authenticated;
-- retenção: só o cron (postgres) roda
revoke execute on function public.fn_diag_aplicar_retencao(), public.fn_diag_bloqueia_ident_apos_retencao()
  from public, anon, authenticated;

-- diário, 06:17 UTC (01:17 no Acre)
select cron.schedule('diag-retencao-diaria', '17 6 * * *', 'select public.fn_diag_aplicar_retencao()');
