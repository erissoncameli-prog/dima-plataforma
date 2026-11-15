-- ════════════════════════════════════════════════════════════════════════════
-- PATRIMÔNIO · Fase 2 — guarda e movimentação (docs/patrimonio/plano.md §2.3, §11)
-- ════════════════════════════════════════════════════════════════════════════
-- Termo de responsabilidade (ou de empréstimo): o gestor monta o termo com os bens,
-- o responsável e o local; o RESPONSÁVEL aceita com a senha de login, reconfirmada
-- no servidor pela Edge Function `patrimonio-termo` → fn_pat_termo_decidir (só
-- service_role; hash do termo + bens ao vivo, mudou ⇒ DOCUMENTO_ALTERADO). Só o
-- aceite muda o responsável/local do bem. Empréstimo aceito ⇒ tarefa "Devolver"
-- com o prazo; devolução registrada pelo gestor conclui. Mudança de local sem troca
-- de responsável, saída/volta da manutenção: gestor, sem termo.
-- Bem em termo pendente não se movimenta. Correção de movimento = movimento novo.
-- Sem a palavra que remove linhas no texto (o apply_migration ficaria esperando).
-- ════════════════════════════════════════════════════════════════════════════

create sequence if not exists public.pat_termos_numero_seq;

create table if not exists public.pat_termos (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique,                 -- TR-2026-0001
  tipo             text not null check (tipo in ('responsabilidade','emprestimo')),
  responsavel_id   uuid not null references public.usuarios(id),
  local_id         uuid not null references public.pat_locais(id),
  devolver_ate     date,
  finalidade       text,
  situacao         text not null default 'aguardando_aceite'
                   check (situacao in ('aguardando_aceite','aceito','recusado','cancelado')),
  hash             text not null,
  criado_por       uuid not null references public.usuarios(id),
  criado_em        timestamptz not null default now(),
  decidido_em      timestamptz,
  decisao_ip       text,
  decisao_user_agent text,
  hash_aceito      text,
  motivo_decisao   text,
  cancelado_por    uuid references public.usuarios(id),
  cancelado_em     timestamptz,
  tarefa_aceite_id uuid references public.tarefas(id),
  tarefa_devolucao_id uuid references public.tarefas(id),
  devolvido_em     timestamptz,
  check (tipo <> 'emprestimo' or devolver_ate is not null)
);
create index if not exists pat_termos_resp_ix on public.pat_termos (responsavel_id, situacao);

create table if not exists public.pat_termo_itens (
  termo_id        uuid not null references public.pat_termos(id),
  bem_id          uuid not null references public.pat_bens(id),
  condicao        text not null,           -- condição no momento do termo (entra no hash)
  situacao_de     text not null,
  local_de        uuid references public.pat_locais(id),
  responsavel_de  uuid references public.usuarios(id),
  primary key (termo_id, bem_id)
);
create index if not exists pat_termo_itens_bem_ix on public.pat_termo_itens (bem_id);

-- termo só muda pelas funções; itens são só inclusão
create or replace function public.fn_pat_trg_termo_guarda()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('dima.pat_evento', true), '') <> '1' then
    raise exception 'PAT_TERMO_PROTEGIDO: o termo muda só pelas funções do patrimônio';
  end if;
  if new.numero is distinct from old.numero or new.tipo is distinct from old.tipo
     or new.responsavel_id is distinct from old.responsavel_id or new.criado_por is distinct from old.criado_por
     or new.criado_em is distinct from old.criado_em or (new.hash is distinct from old.hash and old.hash <> '-') then
    raise exception 'PAT_CAMPO_FIXO: o conteúdo do termo não muda (cancele e faça outro)';
  end if;
  if old.situacao in ('recusado','cancelado') and new.situacao is distinct from old.situacao then
    raise exception 'PAT_TERMO_ENCERRADO: termo recusado ou cancelado não volta';
  end if;
  return new;
end $$;
create or replace trigger trg_pat_termo_guarda before update on public.pat_termos
  for each row execute function public.fn_pat_trg_termo_guarda();
create or replace function public.fn_pat_trg_termo_item_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'PAT_TERMO_PROTEGIDO: itens do termo não se alteram'; end $$;
create or replace trigger trg_pat_termo_item_imutavel before update on public.pat_termo_itens
  for each row execute function public.fn_pat_trg_termo_item_imutavel();
create or replace trigger trg_audit_pat_termos after insert or update on public.pat_termos
  for each row execute function public.fn_trg_audit();

-- ── Leitura ─────────────────────────────────────────────────────────────────
alter table public.pat_termos      enable row level security;
alter table public.pat_termo_itens enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pat_termos' and policyname = 'pat_termos_select') then
    create policy pat_termos_select on public.pat_termos for select to authenticated
      using (public.fn_pat_pode_ver() or responsavel_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pat_termo_itens' and policyname = 'pat_termo_itens_select') then
    create policy pat_termo_itens_select on public.pat_termo_itens for select to authenticated
      using (exists (select 1 from public.pat_termos t where t.id = termo_id));
  end if;
  -- quem guarda um bem vê o próprio bem ("Meus bens"), mesmo sem acesso ao catálogo
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pat_bens' and policyname = 'pat_bens_responsavel') then
    create policy pat_bens_responsavel on public.pat_bens for select to authenticated
      using (responsavel_id = auth.uid());
  end if;
  -- catálogos sem dado pessoal: todo logado ativo (a view de bens faz join com eles)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pat_categorias' and policyname = 'pat_categorias_logado') then
    create policy pat_categorias_logado on public.pat_categorias for select to authenticated
      using (public.fn_perfil_atual() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pat_locais' and policyname = 'pat_locais_logado') then
    create policy pat_locais_logado on public.pat_locais for select to authenticated
      using (public.fn_perfil_atual() is not null);
  end if;
end $$;
revoke all on public.pat_termos, public.pat_termo_itens from anon, authenticated;
grant select on public.pat_termos, public.pat_termo_itens to authenticated;
revoke all on sequence public.pat_termos_numero_seq from anon, authenticated;

-- ── Hash do termo: termo + bens + estado atual de cada bem ──────────────────
create or replace function public.fn_pat_termo_hash(p_termo uuid)
returns text language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'numero', t.numero, 'tipo', t.tipo, 'responsavel', t.responsavel_id, 'local', t.local_id,
    'devolver_ate', t.devolver_ate, 'finalidade', t.finalidade,
    'bens', (select jsonb_agg(jsonb_build_object('bem', b.id, 'numero', b.numero, 'descricao', b.descricao,
                                                 'serie', b.numero_serie, 'quantidade', b.quantidade,
                                                 'condicao', b.condicao, 'situacao', b.situacao,
                                                 'responsavel', b.responsavel_id) order by b.numero)
               from pat_termo_itens i join pat_bens b on b.id = i.bem_id where i.termo_id = t.id)
  )::text, 'UTF8')), 'hex')
  from pat_termos t where t.id = p_termo
$$;

-- tarefa do sistema (aceite, devolução, termo recusado)
create or replace function public.fn_pat_criar_tarefa(p_titulo text, p_descricao text, p_resp uuid, p_criador uuid,
  p_prazo date, p_entidade_tipo text, p_entidade_id uuid, p_prioridade text default 'alta')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_resp is null then return null; end if;
  insert into tarefas (titulo, descricao, prioridade, dt_inicio, dt_prazo, entidade_tipo, entidade_id, criado_por, tipo)
  values (p_titulo, p_descricao, p_prioridade::prioridade_tarefa, current_date, p_prazo, p_entidade_tipo, p_entidade_id,
          coalesce(p_criador, p_resp), 'outras')
  returning id into v_id;
  insert into tarefa_participantes (tarefa_id, usuario_id, papel) values (v_id, p_resp, 'responsavel')
    on conflict (tarefa_id, usuario_id) do nothing;
  insert into tarefa_historico (tarefa_id, autor_id, tipo, para) values (v_id, coalesce(p_criador, p_resp), 'criacao', 'Criada pelo sistema (Patrimônio)');
  perform fn_tarefa_notificar(array[p_resp], 'tarefa_atribuida', 'Nova tarefa: ' || p_titulo, p_descricao, v_id, null);
  return v_id;
end $$;

-- bem livre para movimentar: ativo e fora de termo pendente
create or replace function public.fn_pat_bem_em_termo(p_bem uuid)
returns text language sql stable security definer set search_path = public as $$
  select t.numero from pat_termo_itens i join pat_termos t on t.id = i.termo_id
   where i.bem_id = p_bem and t.situacao = 'aguardando_aceite' limit 1
$$;

-- ── Criar termo ─────────────────────────────────────────────────────────────
-- p = { tipo: responsabilidade|emprestimo, responsavel_id, local_id, devolver_ate?, finalidade?, bens: [uuid] }
create or replace function public.fn_pat_termo_criar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_id uuid; v_num text; v_tipo text := coalesce(p->>'tipo', 'responsabilidade');
  v_resp uuid := nullif(p->>'responsavel_id', '')::uuid; v_local uuid := nullif(p->>'local_id', '')::uuid;
  v_ate date := nullif(p->>'devolver_ate', '')::date; v_bens uuid[]; b pat_bens%rowtype; v_n int := 0;
  v_nome text; v_tarefa uuid; v_t text;
begin
  if v_uid is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO: termos são do gestor patrimonial ou da coordenação'; end if;
  if v_tipo not in ('responsabilidade','emprestimo') then raise exception 'PAT_DADOS: tipo de termo inválido'; end if;
  select nome_completo into v_nome from usuarios where id = v_resp and ativo;
  if v_nome is null then raise exception 'PAT_DADOS: escolha um responsável com acesso ativo à plataforma'; end if;
  if v_local is null or not exists (select 1 from pat_locais where id = v_local and ativo) then raise exception 'PAT_DADOS: escolha o local'; end if;
  if v_tipo = 'emprestimo' then
    if v_ate is null or v_ate <= current_date then raise exception 'PAT_DADOS: empréstimo precisa de data de devolução depois de hoje'; end if;
    if v_ate > current_date + 366 then raise exception 'PAT_DADOS: empréstimo de no máximo um ano (para mais, use termo de responsabilidade)'; end if;
  else v_ate := null;
  end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into v_bens from jsonb_array_elements_text(coalesce(p->'bens', '[]'::jsonb)) x;
  if cardinality(v_bens) = 0 then raise exception 'PAT_DADOS: escolha ao menos um bem'; end if;
  if cardinality(v_bens) > 200 then raise exception 'PAT_DADOS: no máximo 200 bens por termo'; end if;

  v_num := 'TR-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.pat_termos_numero_seq')::text, 4, '0');
  perform set_config('dima.pat_evento', '1', true);
  insert into pat_termos (numero, tipo, responsavel_id, local_id, devolver_ate, finalidade, hash, criado_por)
  values (v_num, v_tipo, v_resp, v_local, v_ate, nullif(btrim(p->>'finalidade'), ''), '-', v_uid)
  returning id into v_id;
  for b in select * from pat_bens where id = any(v_bens) order by numero for update loop
    v_n := v_n + 1;
    if b.situacao not in ('em_estoque','em_uso') then
      raise exception 'PAT_SITUACAO: % está "%" — só bem em estoque ou em uso entra em termo', b.numero, b.situacao;
    end if;
    v_t := public.fn_pat_bem_em_termo(b.id);
    if v_t is not null then raise exception 'PAT_TERMO_PENDENTE: % já está no termo % aguardando aceite', b.numero, v_t; end if;
    if b.responsavel_id = v_resp and b.local_id = v_local then
      raise exception 'PAT_DADOS: % já está com % nesse local', b.numero, v_nome;
    end if;
    insert into pat_termo_itens (termo_id, bem_id, condicao, situacao_de, local_de, responsavel_de)
    values (v_id, b.id, b.condicao, b.situacao, b.local_id, b.responsavel_id);
  end loop;
  if v_n <> cardinality(v_bens) then raise exception 'PAT_DADOS: algum bem não foi encontrado'; end if;
  -- hash de registro (o aceite confere o hash ao vivo, com o estado atual dos bens)
  update pat_termos set hash = public.fn_pat_termo_hash(v_id) where id = v_id;

  v_tarefa := public.fn_pat_criar_tarefa(
    'Aceitar termo de ' || case when v_tipo = 'emprestimo' then 'empréstimo ' else 'responsabilidade ' end || v_num,
    'Você foi indicado(a) como responsável pela guarda de ' || v_n || ' bem(ns) do projeto. Confira os bens em Patrimônio › Meus bens '
      || '(ou pelo link do termo) e aceite com a sua senha. Se algo não confere, recuse explicando o motivo.',
    v_resp, v_uid, current_date + 5, 'pat_termo', v_id);
  update pat_termos set tarefa_aceite_id = v_tarefa where id = v_id;
  perform set_config('dima.pat_evento', '', true);
  return jsonb_build_object('termo_id', v_id, 'numero', v_num, 'bens', v_n);
end $$;

-- ── Detalhe do termo (gestor ou o responsável indicado) ─────────────────────
create or replace function public.fn_pat_termo_detalhe(p_termo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'numero', t.numero, 'tipo', t.tipo, 'situacao', t.situacao, 'devolver_ate', t.devolver_ate,
    'finalidade', t.finalidade, 'responsavel_id', t.responsavel_id, 'responsavel_nome', r.nome_completo,
    'local_id', t.local_id, 'local_nome', l.nome, 'criado_por_nome', c.nome_completo, 'criado_em', t.criado_em,
    'decidido_em', t.decidido_em, 'motivo_decisao', t.motivo_decisao, 'hash_aceito', t.hash_aceito,
    'cancelado_em', t.cancelado_em, 'devolvido_em', t.devolvido_em,
    'hash', case when t.situacao = 'aguardando_aceite' then public.fn_pat_termo_hash(t.id) else t.hash_aceito end,
    'bens', (select jsonb_agg(jsonb_build_object('id', b.id, 'numero', b.numero, 'descricao', b.descricao, 'marca', b.marca,
               'modelo', b.modelo, 'numero_serie', b.numero_serie, 'quantidade', b.quantidade, 'unidade', b.unidade,
               'categoria', cat.nome, 'condicao', i.condicao, 'situacao', b.situacao,
               'local_de', ld.nome, 'responsavel_de', rd.nome_completo) order by b.numero)
             from pat_termo_itens i join pat_bens b on b.id = i.bem_id join pat_categorias cat on cat.codigo = b.categoria_codigo
             left join pat_locais ld on ld.id = i.local_de left join usuarios rd on rd.id = i.responsavel_de
            where i.termo_id = t.id))
  from pat_termos t
  join usuarios r on r.id = t.responsavel_id
  join usuarios c on c.id = t.criado_por
  join pat_locais l on l.id = t.local_id
  where t.id = p_termo and auth.uid() is not null
    and (public.fn_pat_pode_ver() or t.responsavel_id = auth.uid())
$$;

-- ── Aceitar ou recusar (só service_role: Edge Function patrimonio-termo, depois da senha) ──
create or replace function public.fn_pat_termo_decidir(p_usuario_id uuid, p_termo uuid, p_decisao text, p_motivo text,
  p_hash text, p_ip text default null, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t pat_termos%rowtype; i record; b pat_bens%rowtype; v_hash text; v_ev text; v_dev uuid; v_n int := 0; v_tar uuid;
begin
  select * into t from pat_termos where id = p_termo for update;
  if t.id is null then raise exception 'PAT_DADOS: termo não encontrado'; end if;
  if t.situacao <> 'aguardando_aceite' then raise exception 'PAT_TERMO_ENCERRADO: o termo já foi %', t.situacao; end if;
  if p_usuario_id is distinct from t.responsavel_id then raise exception 'PAT_SEM_PERMISSAO: só a pessoa indicada no termo aceita ou recusa'; end if;
  if not exists (select 1 from usuarios where id = p_usuario_id and ativo) then raise exception 'PAT_SEM_PERMISSAO: usuário inativo'; end if;
  if p_decisao not in ('aceitar','recusar') then raise exception 'PAT_DADOS: decisão inválida'; end if;
  v_hash := public.fn_pat_termo_hash(t.id);
  if p_hash is distinct from v_hash then
    raise exception 'DOCUMENTO_ALTERADO: os bens do termo mudaram desde que você abriu. Abra o termo de novo.';
  end if;

  perform set_config('dima.pat_evento', '1', true);
  if p_decisao = 'recusar' then
    if length(coalesce(btrim(p_motivo), '')) < 10 then raise exception 'PAT_DADOS: explique a recusa com ao menos 10 caracteres'; end if;
    update pat_termos set situacao = 'recusado', decidido_em = now(), decisao_ip = p_ip, decisao_user_agent = p_user_agent,
           motivo_decisao = btrim(p_motivo) where id = t.id;
    perform fn_lic_fechar_tarefa(t.tarefa_aceite_id, 'cancelada', p_usuario_id, 'Termo ' || t.numero || ' recusado: ' || btrim(p_motivo));
    perform public.fn_pat_criar_tarefa('Termo ' || t.numero || ' recusado — rever a entrega dos bens',
      'O termo foi recusado por quem foi indicado. Motivo: ' || btrim(p_motivo) || '. Os bens continuam onde estavam. '
        || 'Confira e faça um novo termo, se for o caso (Patrimônio › Termos).',
      t.criado_por, t.criado_por, current_date + 5, 'pat_termo', t.id, 'media');
    perform set_config('dima.pat_evento', '', true);
    return jsonb_build_object('termo', t.numero, 'situacao', 'recusado');
  end if;

  for i in select * from pat_termo_itens where termo_id = t.id loop
    select * into b from pat_bens where id = i.bem_id for update;
    if b.situacao not in ('em_estoque','em_uso') or b.responsavel_id is distinct from i.responsavel_de then
      raise exception 'DOCUMENTO_ALTERADO: % mudou de situação ou de responsável desde o termo', b.numero;
    end if;
    v_ev := case when t.tipo = 'emprestimo' then 'emprestimo'
                 when b.responsavel_id is null then 'distribuicao' else 'transferencia_interna' end;
    update pat_bens set responsavel_id = t.responsavel_id, local_id = t.local_id,
           situacao = case when t.tipo = 'emprestimo' then 'emprestado' else 'em_uso' end,
           dt_inicio_uso = coalesce(dt_inicio_uso, current_date)
     where id = b.id;
    insert into pat_eventos (bem_id, tipo, local_de, local_para, responsavel_de, responsavel_para, detalhes, observacao, registrado_por)
    values (b.id, v_ev, b.local_id, t.local_id, b.responsavel_id, t.responsavel_id,
            jsonb_build_object('termo_id', t.id, 'termo', t.numero, 'devolver_ate', t.devolver_ate, 'situacao_antes', b.situacao,
                               'inicio_uso_no_aceite', b.dt_inicio_uso is null),
            'Termo ' || t.numero || ' aceito com senha' || coalesce(' · ' || t.finalidade, ''), p_usuario_id);
    v_n := v_n + 1;
  end loop;
  if t.tipo = 'emprestimo' then
    v_dev := public.fn_pat_criar_tarefa('Devolver bens emprestados — termo ' || t.numero,
      'Você recebeu ' || v_n || ' bem(ns) emprestado(s) até ' || to_char(t.devolver_ate, 'DD/MM/YYYY')
        || '. Entregue ao gestor patrimonial até essa data; a tarefa é concluída quando a devolução for registrada.',
      t.responsavel_id, t.criado_por, t.devolver_ate, 'pat_termo_devolucao', t.id, 'media');
  end if;
  update pat_termos set situacao = 'aceito', decidido_em = now(), decisao_ip = p_ip, decisao_user_agent = p_user_agent,
         hash_aceito = v_hash, tarefa_devolucao_id = v_dev where id = t.id;
  perform fn_lic_fechar_tarefa(t.tarefa_aceite_id, 'concluida', p_usuario_id, 'Termo ' || t.numero || ' aceito com senha.');
  perform set_config('dima.pat_evento', '', true);
  return jsonb_build_object('termo', t.numero, 'situacao', 'aceito', 'bens', v_n);
end $$;

-- ── Cancelar termo pendente ─────────────────────────────────────────────────
create or replace function public.fn_pat_termo_cancelar(p_termo uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare t pat_termos%rowtype;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  if length(coalesce(btrim(p_motivo), '')) < 10 then raise exception 'PAT_DADOS: explique o cancelamento com ao menos 10 caracteres'; end if;
  select * into t from pat_termos where id = p_termo for update;
  if t.id is null then raise exception 'PAT_DADOS: termo não encontrado'; end if;
  if t.situacao <> 'aguardando_aceite' then raise exception 'PAT_TERMO_ENCERRADO: só termo aguardando aceite se cancela'; end if;
  perform set_config('dima.pat_evento', '1', true);
  update pat_termos set situacao = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), motivo_decisao = btrim(p_motivo) where id = t.id;
  perform fn_lic_fechar_tarefa(t.tarefa_aceite_id, 'cancelada', auth.uid(), 'Termo ' || t.numero || ' cancelado: ' || btrim(p_motivo));
  perform set_config('dima.pat_evento', '', true);
end $$;

-- ── Devolução (registrada por quem recebe: gestor) ──────────────────────────
-- p = { local_id, data?, observacao?, itens: [{ bem_id, condicao }] }
create or replace function public.fn_pat_devolver(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_local uuid := nullif(p->>'local_id', '')::uuid; v_data date := coalesce(nullif(p->>'data', '')::date, current_date);
  it jsonb; b pat_bens%rowtype; v_cond text; v_n int := 0; t record; v_termos uuid[] := '{}';
begin
  if v_uid is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO: devolução é registrada pelo gestor patrimonial'; end if;
  if v_local is null or not exists (select 1 from pat_locais where id = v_local and ativo) then raise exception 'PAT_DADOS: escolha o local onde o bem fica guardado'; end if;
  if v_data > current_date then raise exception 'PAT_DADOS: data no futuro'; end if;
  if jsonb_typeof(p->'itens') is distinct from 'array' or jsonb_array_length(p->'itens') = 0 then raise exception 'PAT_DADOS: escolha os bens devolvidos'; end if;
  perform set_config('dima.pat_evento', '1', true);
  for it in select * from jsonb_array_elements(p->'itens') loop
    select * into b from pat_bens where id = (it->>'bem_id')::uuid for update;
    if b.id is null then raise exception 'PAT_DADOS: bem não encontrado'; end if;
    if b.responsavel_id is null or b.situacao not in ('em_uso','emprestado') then
      raise exception 'PAT_SITUACAO: % não está com ninguém (situação "%")', b.numero, b.situacao;
    end if;
    if public.fn_pat_bem_em_termo(b.id) is not null then raise exception 'PAT_TERMO_PENDENTE: % está num termo aguardando aceite', b.numero; end if;
    v_cond := coalesce(nullif(it->>'condicao', ''), b.condicao);
    if v_cond not in ('novo','bom','regular','ruim','inservivel') then raise exception 'PAT_DADOS: condição inválida'; end if;
    if v_cond = 'novo' and b.condicao <> 'novo' then raise exception 'PAT_DADOS: bem usado não volta a "novo"'; end if;
    update pat_bens set responsavel_id = null, local_id = v_local, situacao = 'em_estoque', condicao = v_cond where id = b.id;
    insert into pat_eventos (bem_id, tipo, dt_evento, local_de, local_para, responsavel_de, condicao_de, condicao_para, detalhes, observacao, registrado_por)
    values (b.id, 'devolucao', v_data, b.local_id, v_local, b.responsavel_id, b.condicao, v_cond,
            jsonb_build_object('situacao_antes', b.situacao), nullif(btrim(p->>'observacao'), ''), v_uid);
    v_n := v_n + 1;
    -- termo de empréstimo deste bem
    v_termos := v_termos || coalesce((select array_agg(t2.id) from pat_termo_itens i2 join pat_termos t2 on t2.id = i2.termo_id
      where i2.bem_id = b.id and t2.tipo = 'emprestimo' and t2.situacao = 'aceito' and t2.devolvido_em is null), '{}');
  end loop;
  -- empréstimo com todos os bens devolvidos: conclui a tarefa de devolução
  for t in select * from pat_termos where id = any(v_termos) loop
    if not exists (select 1 from pat_termo_itens i join pat_bens bb on bb.id = i.bem_id
                    where i.termo_id = t.id and bb.situacao = 'emprestado' and bb.responsavel_id = t.responsavel_id) then
      update pat_termos set devolvido_em = now() where id = t.id;
      perform fn_lic_fechar_tarefa(t.tarefa_devolucao_id, 'concluida', v_uid, 'Bens do termo ' || t.numero || ' devolvidos.');
    end if;
  end loop;
  perform set_config('dima.pat_evento', '', true);
  return jsonb_build_object('devolvidos', v_n);
end $$;

-- ── Mudar de local sem trocar o responsável ─────────────────────────────────
create or replace function public.fn_pat_mudar_local(p_bens uuid[], p_local uuid, p_observacao text)
returns int language plpgsql security definer set search_path = public as $$
declare b pat_bens%rowtype; v_n int := 0;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  if p_local is null or not exists (select 1 from pat_locais where id = p_local and ativo) then raise exception 'PAT_DADOS: escolha o local'; end if;
  if length(coalesce(btrim(p_observacao), '')) < 5 then raise exception 'PAT_DADOS: diga o motivo da mudança'; end if;
  perform set_config('dima.pat_evento', '1', true);
  for b in select * from pat_bens where id = any(p_bens) for update loop
    if b.situacao not in ('em_estoque','em_uso','emprestado') then raise exception 'PAT_SITUACAO: % está "%"', b.numero, b.situacao; end if;
    if public.fn_pat_bem_em_termo(b.id) is not null then raise exception 'PAT_TERMO_PENDENTE: % está num termo aguardando aceite', b.numero; end if;
    if b.local_id = p_local then continue; end if;
    update pat_bens set local_id = p_local where id = b.id;
    insert into pat_eventos (bem_id, tipo, local_de, local_para, responsavel_de, responsavel_para, detalhes, observacao, registrado_por)
    values (b.id, 'transferencia_interna', b.local_id, p_local, b.responsavel_id, b.responsavel_id,
            jsonb_build_object('so_local', true), btrim(p_observacao), auth.uid());
    v_n := v_n + 1;
  end loop;
  perform set_config('dima.pat_evento', '', true);
  return v_n;
end $$;

-- ── Manutenção ──────────────────────────────────────────────────────────────
create or replace function public.fn_pat_manutencao_saida(p_bem uuid, p_prestador text, p_motivo text, p_previsao date, p_data date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare b pat_bens%rowtype; v_ev uuid;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  select * into b from pat_bens where id = p_bem for update;
  if b.id is null then raise exception 'PAT_DADOS: bem não encontrado'; end if;
  if b.situacao not in ('em_estoque','em_uso') then raise exception 'PAT_SITUACAO: % está "%"', b.numero, b.situacao; end if;
  if public.fn_pat_bem_em_termo(b.id) is not null then raise exception 'PAT_TERMO_PENDENTE: o bem está num termo aguardando aceite'; end if;
  if length(coalesce(btrim(p_prestador), '')) < 3 then raise exception 'PAT_DADOS: informe a oficina ou assistência'; end if;
  if length(coalesce(btrim(p_motivo), '')) < 10 then raise exception 'PAT_DADOS: descreva o defeito ou o serviço (ao menos 10 caracteres)'; end if;
  if p_data is null or p_data > current_date then raise exception 'PAT_DADOS: data inválida'; end if;
  if p_previsao is not null and p_previsao < p_data then raise exception 'PAT_DADOS: previsão antes da saída'; end if;
  perform set_config('dima.pat_evento', '1', true);
  update pat_bens set situacao = 'em_manutencao' where id = b.id;
  insert into pat_eventos (bem_id, tipo, dt_evento, detalhes, observacao, registrado_por)
  values (b.id, 'manutencao_saida', p_data, jsonb_build_object('prestador', btrim(p_prestador), 'previsao', p_previsao,
          'situacao_antes', b.situacao), btrim(p_motivo), auth.uid()) returning id into v_ev;
  perform set_config('dima.pat_evento', '', true);
  return v_ev;
end $$;

create or replace function public.fn_pat_manutencao_retorno(p_bem uuid, p_condicao text, p_servico text, p_custo_brl numeric default null, p_data date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare b pat_bens%rowtype; s pat_eventos%rowtype; v_ev uuid; v_volta text;
begin
  if auth.uid() is null or not public.fn_pat_pode_gerir() then raise exception 'PAT_SEM_PERMISSAO'; end if;
  select * into b from pat_bens where id = p_bem for update;
  if b.id is null then raise exception 'PAT_DADOS: bem não encontrado'; end if;
  if b.situacao <> 'em_manutencao' then raise exception 'PAT_SITUACAO: o bem não está em manutenção'; end if;
  select * into s from pat_eventos where bem_id = b.id and tipo = 'manutencao_saida' order by registrado_em desc limit 1;
  if p_condicao not in ('bom','regular','ruim','inservivel','novo') then raise exception 'PAT_DADOS: condição inválida'; end if;
  if p_condicao = 'novo' and b.condicao <> 'novo' then raise exception 'PAT_DADOS: bem usado não volta a "novo"'; end if;
  if length(coalesce(btrim(p_servico), '')) < 10 then raise exception 'PAT_DADOS: descreva o que foi feito (ao menos 10 caracteres)'; end if;
  if p_custo_brl is not null and p_custo_brl < 0 then raise exception 'PAT_DADOS: custo inválido'; end if;
  if p_data is null or p_data > current_date or p_data < s.dt_evento then raise exception 'PAT_DADOS: data inválida'; end if;
  v_volta := coalesce(s.detalhes->>'situacao_antes', case when b.responsavel_id is null then 'em_estoque' else 'em_uso' end);
  perform set_config('dima.pat_evento', '1', true);
  update pat_bens set situacao = v_volta, condicao = p_condicao where id = b.id;
  insert into pat_eventos (bem_id, tipo, dt_evento, condicao_de, condicao_para, detalhes, observacao, registrado_por)
  values (b.id, 'manutencao_retorno', p_data, b.condicao, p_condicao,
          jsonb_build_object('custo_brl', p_custo_brl, 'prestador', s.detalhes->>'prestador', 'saida', s.dt_evento),
          btrim(p_servico), auth.uid()) returning id into v_ev;
  perform set_config('dima.pat_evento', '', true);
  return v_ev;
end $$;

-- ── View: acrescenta termo pendente e prazo do empréstimo (colunas no fim) ──
create or replace view public.vw_pat_bens with (security_invoker = true) as
select b.id, b.numero, b.numero_unesco, b.numero_sema, b.categoria_codigo, c.nome as categoria_nome,
       c.controle, c.icone as categoria_icone, b.descricao, b.marca, b.modelo, b.numero_serie, b.especificacao,
       b.quantidade, b.unidade, b.incorporacao_id, b.origem, b.contrato_produto_id, b.contrato_id,
       ct.numero as contrato_numero, b.fornecedor_id, f.nome as fornecedor_nome,
       b.atividade_id, a.codigo as atividade_codigo, b.tdr_id, t.numero as tdr_numero,
       b.dt_aquisicao, b.dt_inicio_uso, b.garantia_ate, b.garantia_obs, b.titularidade,
       b.situacao, b.condicao, b.local_id, l.nome as local_nome, b.responsavel_id,
       r.nome_completo as responsavel_nome, b.ultimo_inventario_em, b.dt_baixa, b.observacoes,
       b.criado_por, b.criado_em, b.atualizado_em,
       case when v.ok then (i.nf_url is null and b.origem = 'compra_projeto') end as nf_pendente,
       case when v.ok then i.nf_numero end as nf_numero,
       case when v.ok then i.nf_data end as nf_data,
       case when v.ok then i.nf_url end as nf_url,
       case when v.ok then i.nf_nome end as nf_nome,
       case when v.ok then b.valor_aquisicao_brl end as valor_aquisicao_brl,
       case when v.ok then b.vida_util_meses end as vida_util_meses,
       case when v.ok then b.residual_pct end as residual_pct,
       case when v.ok then d.meses end as meses_depreciados,
       case when v.ok then d.cota_mensal end as cota_mensal_brl,
       case when v.ok then d.depreciacao_acumulada end as depreciacao_acumulada_brl,
       case when v.ok then d.valor_contabil end as valor_contabil_brl,
       case when v.ok then d.valor_residual end as valor_residual_brl,
       case when v.ok then (d.meses >= b.vida_util_meses) end as totalmente_depreciado,
       case when v.ok then x.cotacao end as cotacao,
       case when v.ok then x.origem end as cotacao_origem,
       case when v.ok and x.cotacao > 0 then round(b.valor_aquisicao_brl / x.cotacao, 2) end as valor_aquisicao_usd,
       case when v.ok and x.cotacao > 0 then round(d.valor_contabil / x.cotacao, 2) end as valor_contabil_usd,
       (select count(*) from pat_documentos dc where dc.bem_id = b.id and dc.ativo and dc.tipo = 'foto')::int as n_fotos,
       (select dc.url from pat_documentos dc where dc.bem_id = b.id and dc.ativo and dc.tipo = 'foto'
         order by dc.enviado_em limit 1) as foto_url,
       public.fn_pat_bem_em_termo(b.id) as termo_pendente,
       (select tt.devolver_ate from pat_termo_itens ti join pat_termos tt on tt.id = ti.termo_id
         where ti.bem_id = b.id and tt.tipo = 'emprestimo' and tt.situacao = 'aceito' and tt.devolvido_em is null
           and b.situacao = 'emprestado' order by tt.decidido_em desc limit 1) as devolver_ate,
       (select tt.numero from pat_termo_itens ti join pat_termos tt on tt.id = ti.termo_id
         where ti.bem_id = b.id and tt.situacao = 'aceito' and b.responsavel_id = tt.responsavel_id
         order by tt.decidido_em desc limit 1) as termo_vigente
  from pat_bens b
  join pat_categorias c on c.codigo = b.categoria_codigo
  left join pat_incorporacoes i on i.id = b.incorporacao_id
  left join pat_locais l on l.id = b.local_id
  left join usuarios r on r.id = b.responsavel_id
  left join contratos ct on ct.id = b.contrato_id
  left join fornecedores f on f.id = b.fornecedor_id
  left join atividades a on a.id = b.atividade_id
  left join tdrs t on t.id = b.tdr_id
  cross join lateral (select public.fn_pat_pode_ver_valor() as ok) v
  cross join lateral public.fn_pat_depreciacao(b.valor_aquisicao_brl, b.residual_pct, b.vida_util_meses,
                                               b.dt_inicio_uso, current_date, b.dt_baixa) d
  cross join lateral public.fn_pat_cotacao_bem(b.id) x;
revoke all on public.vw_pat_bens from anon, authenticated;
grant select on public.vw_pat_bens to authenticated;

-- ── Permissões ──────────────────────────────────────────────────────────────
revoke execute on function public.fn_pat_termo_hash(uuid), public.fn_pat_criar_tarefa(text, text, uuid, uuid, date, text, uuid, text),
  public.fn_pat_bem_em_termo(uuid), public.fn_pat_termo_criar(jsonb), public.fn_pat_termo_detalhe(uuid),
  public.fn_pat_termo_decidir(uuid, uuid, text, text, text, text, text), public.fn_pat_termo_cancelar(uuid, text),
  public.fn_pat_devolver(jsonb), public.fn_pat_mudar_local(uuid[], uuid, text),
  public.fn_pat_manutencao_saida(uuid, text, text, date, date), public.fn_pat_manutencao_retorno(uuid, text, text, numeric, date)
  from public, anon;
grant execute on function public.fn_pat_bem_em_termo(uuid), public.fn_pat_termo_criar(jsonb), public.fn_pat_termo_detalhe(uuid),
  public.fn_pat_termo_cancelar(uuid, text), public.fn_pat_devolver(jsonb), public.fn_pat_mudar_local(uuid[], uuid, text),
  public.fn_pat_manutencao_saida(uuid, text, text, date, date), public.fn_pat_manutencao_retorno(uuid, text, text, numeric, date)
  to authenticated;
revoke execute on function public.fn_pat_termo_hash(uuid), public.fn_pat_criar_tarefa(text, text, uuid, uuid, date, text, uuid, text),
  public.fn_pat_termo_decidir(uuid, uuid, text, text, text, text, text) from authenticated;
grant execute on function public.fn_pat_termo_decidir(uuid, uuid, text, text, text, text, text) to service_role;
revoke execute on function public.fn_pat_trg_termo_guarda(), public.fn_pat_trg_termo_item_imutavel() from public, anon, authenticated;
