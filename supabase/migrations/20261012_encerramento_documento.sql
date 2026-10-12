-- ════════════════════════════════════════════════════════════════════════
-- Encerramento de contrato — termo de encerramento (PDF) e tarefa de lembrete
--
-- contrato_encerramentos é imutável (trg_encerramento_guarda), então o documento
-- fica numa tabela própria, só de inclusão: contrato_encerramento_documentos
-- (um termo corrigido = novo anexo; o anterior continua no histórico).
--   • arquivo no bucket privado contratos-docs, em encerramentos/<contrato_id>/…,
--     com SHA-256 calculado no navegador; a RPC confere que o arquivo existe;
--   • escrita só pela RPC fn_encerramento_anexar_documento (super_admin/coordenação
--     ativos) — sem policy de escrita para o cliente;
--   • leitura = quem vê o contrato (herda contratos_select).
-- Tarefa de lembrete: todo encerramento_contrato novo cria uma tarefa
-- "Anexar termo de encerramento" (responsável = quem encerrou, prazo 15 dias,
-- vinculada à atividade e ao TDR do contrato). Anexar o termo conclui a tarefa.
-- A policy que impede apagar/sobrescrever o PDF está no _sql_editor.sql.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.contrato_encerramento_documentos (
  id               uuid primary key default gen_random_uuid(),
  encerramento_id  uuid not null references public.contrato_encerramentos(id),
  contrato_id      uuid not null references public.contratos(id),
  caminho          text not null,
  nome             text not null,
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  tamanho          bigint,
  criado_por       uuid not null references public.usuarios(id),
  criado_em        timestamptz not null default now()
);
create index if not exists idx_ced_encerramento on public.contrato_encerramento_documentos(encerramento_id);
create index if not exists idx_ced_contrato     on public.contrato_encerramento_documentos(contrato_id);

alter table public.contrato_encerramento_documentos enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='contrato_encerramento_documentos' and policyname='ced_select') then
    create policy ced_select on public.contrato_encerramento_documentos for select to authenticated
      using (exists (select 1 from public.contratos c where c.id = contrato_id));
  end if;
end $$;

revoke all on public.contrato_encerramento_documentos from anon, public;
grant select on public.contrato_encerramento_documentos to authenticated;

-- imutável: sem policy/grant de escrita para cliente; o trigger barra alteração até de quem tem acesso direto
-- (remoção de linha também não tem grant; a trava de arquivo está no _sql_editor.sql)
create or replace function public.fn_trg_ced_imutavel()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  raise exception 'ENCERRAMENTO_DOC: documento do encerramento não se altera nem se apaga — anexe uma nova versão.';
end $$;
create or replace trigger trg_ced_imutavel before update on public.contrato_encerramento_documentos
  for each row execute function public.fn_trg_ced_imutavel();

-- ── tarefa de lembrete ───────────────────────────────────────────────────
create or replace function public.fn_encerramento_criar_tarefa(p_enc uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  e  contrato_encerramentos%rowtype;
  c  contratos%rowtype;
  v_resp uuid;
  v_id   uuid;
  v_forn text;
begin
  select * into e from contrato_encerramentos where id = p_enc;
  if e.id is null or e.tipo <> 'encerramento_contrato' then return null; end if;
  -- já existe tarefa para este encerramento
  select id into v_id from tarefas
   where entidade_tipo = 'contrato_encerramento' and entidade_id = p_enc and ativo limit 1;
  if v_id is not null then return v_id; end if;
  -- já tem termo anexado: não precisa lembrar
  if exists (select 1 from contrato_encerramento_documentos where encerramento_id = p_enc) then return null; end if;

  select * into c from contratos where id = e.contrato_id;
  select nome into v_forn from fornecedores where id = c.fornecedor_id;
  v_resp := coalesce(
    (select id from usuarios where id = e.autorizado_por and ativo),
    (select x.usuario_id from rem_cargo_titulares x join usuarios u on u.id = x.usuario_id and u.ativo
      where x.cargo = 'coordenacao_solicitante' and x.vigencia_fim is null limit 1));
  if v_resp is null then return null; end if;

  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo, entidade_tipo, entidade_id,
                       atividade_id, criado_por, tipo)
  values ('Anexar termo de encerramento do contrato ' || c.numero,
          'O contrato ' || c.numero || coalesce(' (' || v_forn || ')', '') || ' foi encerrado em '
            || to_char(e.criado_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY')
            || ' com ' || 'R$ ' || replace(replace(replace(to_char(e.valor_liberado_brl, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.') || ' não executados devolvidos à atividade. '
            || 'Anexe o termo de encerramento (ou distrato) assinado em Contratos › contrato ' || c.numero
            || ' › Detalhes e documentos › Encerramento › "Anexar PDF". A tarefa é concluída sozinha quando o termo for anexado.',
          'alta', current_date, current_date + 15, 'contrato_encerramento', p_enc,
          e.atividade_id, v_resp, 'outras')
  returning id into v_id;

  insert into tarefa_participantes (tarefa_id, usuario_id, papel) values (v_id, v_resp, 'responsavel')
    on conflict (tarefa_id, usuario_id) do nothing;
  if c.tdr_id is not null and e.atividade_id is not null
     and exists (select 1 from tdrs where id = c.tdr_id and atividade_id = e.atividade_id) then
    insert into tarefa_tdrs (tarefa_id, tdr_id) values (v_id, c.tdr_id) on conflict do nothing;
  end if;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para)
    values (v_id, v_resp, 'criacao', 'Criada pelo sistema no encerramento do contrato ' || c.numero);
  perform fn_tarefa_notificar(array[v_resp], 'tarefa_atribuida',
    'Nova tarefa: anexar termo de encerramento', 'Contrato ' || c.numero, v_id, null);
  return v_id;
end $$;

create or replace function public.fn_trg_encerramento_tarefa()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.tipo = 'encerramento_contrato' then
    begin
      perform fn_encerramento_criar_tarefa(new.id);
    exception when others then
      raise warning 'tarefa do encerramento % não criada: %', new.id, sqlerrm;  -- o encerramento nunca falha por causa da tarefa
    end;
  end if;
  return new;
end $$;
create or replace trigger trg_encerramento_tarefa after insert on public.contrato_encerramentos
  for each row execute function public.fn_trg_encerramento_tarefa();

-- ── anexar o termo ───────────────────────────────────────────────────────
create or replace function public.fn_encerramento_anexar_documento(
  p_encerramento_id uuid, p_caminho text, p_nome text, p_sha256 text, p_tamanho bigint default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  e      contrato_encerramentos%rowtype;
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_tar  tarefas%rowtype;
begin
  if not exists (select 1 from usuarios where id = v_uid and ativo and perfil in ('super_admin','coordenacao')) then
    raise exception 'ENCERRAMENTO_DOC: só coordenação ou super_admin anexam o termo de encerramento.';
  end if;
  select * into e from contrato_encerramentos where id = p_encerramento_id;
  if e.id is null or e.tipo <> 'encerramento_contrato' then
    raise exception 'ENCERRAMENTO_DOC: encerramento não encontrado.';
  end if;
  if coalesce(p_caminho,'') not like 'encerramentos/' || e.contrato_id || '/%' or p_caminho like '%..%' then
    raise exception 'ENCERRAMENTO_DOC: caminho do arquivo fora da pasta do encerramento.';
  end if;
  if lower(coalesce(p_nome,'')) not like '%.pdf' then
    raise exception 'ENCERRAMENTO_DOC: o termo deve ser PDF.';
  end if;
  if coalesce(lower(p_sha256),'') !~ '^[0-9a-f]{64}$' then
    raise exception 'ENCERRAMENTO_DOC: impressão digital (SHA-256) inválida.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'contratos-docs' and name = p_caminho) then
    raise exception 'ENCERRAMENTO_DOC: arquivo não encontrado no armazenamento — envie de novo.';
  end if;

  insert into contrato_encerramento_documentos (encerramento_id, contrato_id, caminho, nome, sha256, tamanho, criado_por)
  values (e.id, e.contrato_id, p_caminho, left(p_nome, 200), lower(p_sha256), p_tamanho, v_uid)
  returning id into v_id;

  -- conclui a tarefa de lembrete (o sistema conclui; fica no histórico e nos comentários)
  for v_tar in select * from tarefas
     where entidade_tipo = 'contrato_encerramento' and entidade_id = e.id and ativo
       and status not in ('concluida','cancelada') loop
    perform set_config('dima.tarefa_status_rpc', '1', true);
    update tarefas set status = 'concluida', dt_conclusao = now() where id = v_tar.id;
    perform set_config('dima.tarefa_status_rpc', '', true);
    insert into tarefa_comentarios (tarefa_id, autor_id, corpo, origem)
      values (v_tar.id, v_uid, 'Conclusão: termo de encerramento anexado (' || left(p_nome,120) || ', SHA-256 ' || left(lower(p_sha256),12) || '…).', 'painel');
    insert into tarefa_historico (tarefa_id, autor_id, tipo, de, para, motivo)
      values (v_tar.id, v_uid, 'conclusao', v_tar.status::text, 'concluida', 'Termo de encerramento anexado no contrato.');
  end loop;
  return v_id;
end $$;

revoke all on function public.fn_encerramento_anexar_documento(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.fn_encerramento_anexar_documento(uuid, text, text, text, bigint) to authenticated;
revoke all on function public.fn_encerramento_criar_tarefa(uuid) from public, anon, authenticated;
revoke all on function public.fn_trg_encerramento_tarefa() from public, anon, authenticated;
revoke all on function public.fn_trg_ced_imutavel() from public, anon, authenticated;

-- encerramentos que já existem sem termo: cria a tarefa de lembrete agora
select public.fn_encerramento_criar_tarefa(x.id)
  from public.contrato_encerramentos x
 where x.tipo = 'encerramento_contrato' and x.status = 'ativo';

notify pgrst, 'reload schema';

-- (b) valor da tarefa no formato brasileiro (R$ 29.000,00) — aplicado como 20261012_encerramento_documento_b_valor
-- (c) authenticated só lê a tabela (o padrão do Supabase dava todos os direitos; RLS já barrava a escrita)
revoke all on public.contrato_encerramento_documentos from authenticated;
grant select on public.contrato_encerramento_documentos to authenticated;
