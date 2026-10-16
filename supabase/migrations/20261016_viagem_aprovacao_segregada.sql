-- ════════════════════════════════════════════════════════════════════════
-- Viagens: aprovação segregada e com senha (16/10/2026)
-- Regras:
--   1. protocolo 'solicitado': aprova, devolve ou rejeita só super_admin ativo;
--      a coordenação deixa de decidir (segue com SPDs, aviso à UNESCO e realizado);
--   2. protocolo 'aprovado': super_admin ou financeiro podem DEVOLVER para correção;
--      os lançamentos a pagar da aprovação são cancelados e os itens voltam a 'solicitado';
--   3. em nenhuma hipótese decide quem está no protocolo: quem criou, o solicitante
--      (e-mail) ou qualquer viajante (e-mail do viajante/beneficiário ou nome completo);
--   4. a decisão é com a SENHA de login, reconfirmada no servidor: Edge Function
--      assinar-remanejamento, acao 'decidir_viagem' → fn_viagem_decidir (só service_role);
--   5. o protocolo decidido é o que a pessoa viu: fn_viagem_hash (protocolo + viajantes +
--      trechos + diárias); mudou ⇒ DOCUMENTO_ALTERADO.
-- Travas no banco: o protocolo só sai de 'solicitado' para aprovado/rejeitado/rascunho,
-- e de 'aprovado' de volta, pela função (chave dima.viagem = 'decidir'); aprovado_por e
-- aprovado_em idem; item de viajante só vira 'aprovado' pela função (é o que gera o
-- lançamento a pagar). Cada decisão fica em viagem_decisoes (só inclusão).
-- ════════════════════════════════════════════════════════════════════════

-- ── registro das decisões (imutável: sem policy de escrita) ─────────────
create table if not exists public.viagem_decisoes (
  id                  uuid primary key default gen_random_uuid(),
  protocolo_id        uuid not null,           -- sem FK: o registro sobrevive à exclusão do protocolo
  protocolo_numero    text,
  usuario_id          uuid not null references public.usuarios(id),
  decisao             text not null check (decisao in ('aprovar','devolver','rejeitar')),
  situacao_de         text not null,
  situacao_para       text not null,
  motivo              text,
  hash                text not null,
  lancamentos_cancelados int not null default 0,
  senha_verificada_em timestamptz not null default now(),
  criado_em           timestamptz not null default now()
);
create index if not exists idx_viagem_decisoes_prot on public.viagem_decisoes(protocolo_id);
alter table public.viagem_decisoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'viagem_decisoes'
                  and policyname = 'viagem_decisoes_select') then
    create policy viagem_decisoes_select on public.viagem_decisoes for select to authenticated
      using (exists (select 1 from public.viagem_protocolos p where p.id = viagem_decisoes.protocolo_id));
  end if;
end $$;
revoke all on public.viagem_decisoes from anon;
grant select on public.viagem_decisoes to authenticated;

-- ── nome comparável: minúsculas, sem acento, espaços simples ────────────
create or replace function public.fn_viagem_norm(t text)
returns text language sql immutable set search_path to 'public' as $$
  select nullif(btrim(regexp_replace(translate(lower(coalesce(t, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '\s+', ' ', 'g')), '')
$$;

-- ── a pessoa está no protocolo? 'solicitante' | 'viajante' | null ────────
create or replace function public.fn_viagem_participa(p_protocolo uuid, p_usuario uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when p.criado_por = u.id then 'solicitante'
    when lower(btrim(p.email_solicitante)) = lower(btrim(u.email)) then 'solicitante'
    when exists (select 1 from public.viagem_viajantes v
                   left join public.beneficiarios b on b.id = v.beneficiario_id
                  where v.protocolo_id = p.id
                    and (   lower(btrim(v.email)) = lower(btrim(u.email))
                         or lower(btrim(b.email)) = lower(btrim(u.email))
                         or public.fn_viagem_norm(v.nome) = public.fn_viagem_norm(u.nome_completo)
                         or public.fn_viagem_norm(b.nome) = public.fn_viagem_norm(u.nome_completo)))
      then 'viajante'
  end
  from public.viagem_protocolos p, public.usuarios u
  where p.id = p_protocolo and u.id = p_usuario
$$;

-- ── regra única: o que a pessoa pode decidir neste protocolo ────────────
create or replace function public.fn_viagem_regra(p_protocolo uuid, p_usuario uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_sit    text;
  v_perfil text;
  v_dec    text[] := '{}';
  v_part   text;
begin
  select situacao into v_sit from viagem_protocolos where id = p_protocolo;
  select perfil::text into v_perfil from usuarios where id = p_usuario and ativo;
  if v_sit is null or v_perfil is null then return jsonb_build_object('decisoes', '[]'::jsonb); end if;
  if v_sit = 'solicitado' and v_perfil = 'super_admin' then
    v_dec := array['aprovar','devolver','rejeitar'];
  elsif v_sit = 'aprovado' and v_perfil in ('super_admin','financeiro') then
    v_dec := array['devolver'];
  end if;
  if cardinality(v_dec) = 0 then return jsonb_build_object('decisoes', '[]'::jsonb); end if;
  v_part := fn_viagem_participa(p_protocolo, p_usuario);
  if v_part is not null then
    return jsonb_build_object('decisoes', '[]'::jsonb, 'bloqueio', v_part);
  end if;
  return jsonb_build_object('decisoes', to_jsonb(v_dec));
end $$;

-- ── o documento que se decide ───────────────────────────────────────────
create or replace function public.fn_viagem_hash(p_protocolo uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'id', p.id, 'numero', p.numero, 'situacao', p.situacao, 'objetivo', p.objetivo,
    'destino', p.destino_principal, 'saida', p.dt_saida, 'retorno', p.dt_retorno,
    'atividade', p.atividade_id, 'sei', p.numero_sei, 'solicitante', p.email_solicitante,
    'viajantes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'nome', v.nome, 'cpf', v.cpf, 'email', v.email,
        'passagem', v.tem_passagem, 'diaria', v.tem_diaria,
        'trechos', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'origem', t.origem, 'destino', t.destino,
                                               'saida', t.dt_saida, 'valor', t.valor) order by t.id)
                               from public.viagem_trechos t where t.viajante_id = v.id), '[]'::jsonb),
        'diarias', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo_diaria,
                                               'qtd', d.quantidade, 'valor', d.valor_unitario) order by d.id)
                               from public.viagem_diarias_v2 d where d.viajante_id = v.id), '[]'::jsonb)
      ) order by v.id) from public.viagem_viajantes v where v.protocolo_id = p.id), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.viagem_protocolos p
  where p.id = p_protocolo
    and (auth.uid() is null
         or coalesce(public.fn_perfil_atual()::text in ('super_admin','coordenacao','financeiro'), false)
         or p.criado_por = auth.uid()
         or public.tem_permissao('viagens'))
$$;

-- ── a tela pergunta o que a pessoa logada pode decidir (só exibição) ─────
create or replace function public.fn_viagem_pode_decidir(p_protocolo uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('decisoes', '[]'::jsonb); end if;
  r := fn_viagem_regra(p_protocolo, auth.uid());
  if jsonb_array_length(r->'decisoes') > 0 then
    r := r || jsonb_build_object('hash', fn_viagem_hash(p_protocolo));
  end if;
  return r;
end $$;

-- ── decisão (só service_role, depois da senha na Edge Function) ─────────
create or replace function public.fn_viagem_decidir(p_usuario_id uuid, p_protocolo uuid, p_decisao text,
                                                    p_motivo text, p_hash text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  p        viagem_protocolos%rowtype;
  r        jsonb;
  v_agora  timestamptz := now();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_para   text;
  v_canc   int := 0;
begin
  if p_decisao not in ('aprovar','devolver','rejeitar') then
    raise exception 'VIAGEM: decisão inválida (%).', p_decisao;
  end if;
  select * into p from viagem_protocolos where id = p_protocolo for update;
  if p.id is null then raise exception 'VIAGEM: protocolo não encontrado.'; end if;

  r := fn_viagem_regra(p.id, p_usuario_id);
  if r->>'bloqueio' = 'solicitante' then
    raise exception 'SEGREGACAO: quem pediu a viagem não decide o próprio protocolo.';
  elsif r->>'bloqueio' = 'viajante' then
    raise exception 'SEGREGACAO: quem viaja neste protocolo não pode decidir sobre ele.';
  end if;
  if not ((r->'decisoes') ? p_decisao) then
    raise exception 'SEM_PERMISSAO: com o protocolo %, esta decisão não cabe ao seu perfil (aprovar/rejeitar: super_admin; devolver depois de aprovado: super_admin ou financeiro).', p.situacao;
  end if;
  if p_hash is distinct from fn_viagem_hash(p.id) then
    raise exception 'DOCUMENTO_ALTERADO: o protocolo, os viajantes ou os valores mudaram depois que você abriu. Recarregue e confira.';
  end if;
  if p_decisao in ('devolver','rejeitar') and coalesce(length(v_motivo), 0) < 10 then
    raise exception 'VIAGEM: escreva o motivo (mínimo 10 caracteres).';
  end if;

  perform set_config('dima.viagem', 'decidir', true);

  if p_decisao = 'aprovar' then
    v_para := 'aprovado';
    update viagem_protocolos
       set situacao = 'aprovado', aprovado_por = p_usuario_id, aprovado_em = v_agora, atualizado_em = v_agora
     where id = p.id;
    -- itens aprovados: fn_financeiro_viajante cria o lançamento a pagar
    update viagem_viajantes set
           sit_passagem      = case when tem_passagem then 'aprovado'   else sit_passagem end,
           aprovado_pass_por = case when tem_passagem then p_usuario_id else aprovado_pass_por end,
           aprovado_pass_em  = case when tem_passagem then v_agora      else aprovado_pass_em end,
           sit_diaria        = case when tem_diaria   then 'aprovado'   else sit_diaria end,
           aprovado_diar_por = case when tem_diaria   then p_usuario_id else aprovado_diar_por end,
           aprovado_diar_em  = case when tem_diaria   then v_agora      else aprovado_diar_em end,
           atualizado_em     = v_agora
     where protocolo_id = p.id and (tem_passagem or tem_diaria);
    if p.criado_por is not null then
      insert into notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      values (p.criado_por, 'viagem_aprovada', 'Protocolo ' || coalesce(p.numero, '') || ' aprovado',
              'Sua solicitação de viagem para ' || coalesce(p.destino_principal, '—') || ' (' || coalesce(p.numero, '') ||
              ') foi aprovada. Aguarde a emissão dos SPDs pela UNESCO.',
              false, 'viagens.html', 'viagem_protocolos', p.id);
    end if;

  elsif p_decisao = 'rejeitar' then
    v_para := 'rejeitado';
    update viagem_protocolos
       set situacao = 'rejeitado', rejeitado_por = p_usuario_id, rejeitado_em = v_agora,
           rejeitado_motivo = v_motivo, atualizado_em = v_agora
     where id = p.id;
    if p.criado_por is not null then
      insert into notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      values (p.criado_por, 'viagem_rejeitada', 'Protocolo ' || coalesce(p.numero, '') || ' rejeitado',
              'Motivo: ' || left(v_motivo, 300), false, 'viagens.html', 'viagem_protocolos', p.id);
    end if;

  else -- devolver para correção (volta a rascunho)
    v_para := 'rascunho';
    if p.situacao = 'aprovado' then
      if exists (select 1 from execucao_financeira ef
                  where ef.id in (select lancamento_id from viagem_viajantes where protocolo_id = p.id)
                    and ef.situacao = 'pago') then
        raise exception 'VIAGEM: já há pagamento lançado para este protocolo; não dá para devolver.';
      end if;
      update execucao_financeira set situacao = 'cancelado', atualizado_em = v_agora
       where id in (select lancamento_id from viagem_viajantes where protocolo_id = p.id and lancamento_id is not null)
         and situacao <> 'cancelado';
      get diagnostics v_canc = row_count;
      update viagem_viajantes set
             sit_passagem      = case when tem_passagem then 'solicitado' else sit_passagem end,
             sit_diaria        = case when tem_diaria   then 'solicitado' else sit_diaria end,
             aprovado_pass_por = null, aprovado_pass_em = null,
             aprovado_diar_por = null, aprovado_diar_em = null,
             lancamento_id     = null,
             atualizado_em     = v_agora
       where protocolo_id = p.id;
    end if;
    update viagem_protocolos
       set situacao = 'rascunho', aprovado_por = null, aprovado_em = null,
           rejeitado_por = p_usuario_id, rejeitado_em = v_agora, rejeitado_motivo = v_motivo,
           atualizado_em = v_agora
     where id = p.id;
    if p.criado_por is not null then
      insert into notificacoes (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
      values (p.criado_por, 'viagem_rejeitada', 'Protocolo ' || coalesce(p.numero, '') || ' devolvido para correção',
              'Motivo: ' || left(v_motivo, 300), false, 'viagens.html', 'viagem_protocolos', p.id);
    end if;
  end if;

  perform set_config('dima.viagem', '', true);

  insert into viagem_decisoes (protocolo_id, protocolo_numero, usuario_id, decisao, situacao_de, situacao_para,
                               motivo, hash, lancamentos_cancelados, senha_verificada_em)
  values (p.id, p.numero, p_usuario_id, p_decisao, p.situacao, v_para, v_motivo, p_hash, v_canc, v_agora);

  return jsonb_build_object('situacao', v_para, 'de', p.situacao, 'lancamentos_cancelados', v_canc);
end $$;

-- ── trava: decisão do protocolo só pela função ──────────────────────────
create or replace function public.fn_trg_viagem_guarda_decisao()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if coalesce(current_setting('dima.viagem', true), '') = 'decidir' then return new; end if;
  if tg_op = 'INSERT' then
    if new.situacao not in ('rascunho','solicitado') or new.aprovado_por is not null or new.aprovado_em is not null then
      raise exception 'VIAGEM_DECISAO: protocolo novo nasce como rascunho ou solicitado.';
    end if;
    return new;
  end if;
  if new.situacao is distinct from old.situacao and (
       (old.situacao = 'solicitado' and new.situacao in ('aprovado','rejeitado','rascunho'))
    or (new.situacao = 'aprovado' and old.situacao is distinct from 'em_prestacao')
    or new.situacao = 'rejeitado'
    or (old.situacao in ('aprovado','em_prestacao','realizado') and new.situacao in ('rascunho','solicitado'))
  ) then
    raise exception 'VIAGEM_DECISAO: aprovar, devolver ou rejeitar o protocolo só pela tela de Viagens, com a senha — e nunca por quem pediu ou viaja.';
  end if;
  if new.aprovado_por is distinct from old.aprovado_por or new.aprovado_em is distinct from old.aprovado_em then
    raise exception 'VIAGEM_DECISAO: quem aprovou e quando só são gravados pela aprovação.';
  end if;
  return new;
end $$;
create or replace trigger trg_viagem_guarda_decisao
  before insert or update on public.viagem_protocolos
  for each row execute function public.fn_trg_viagem_guarda_decisao();

-- ── trava: item de viajante só vira 'aprovado' pela função ──────────────
create or replace function public.fn_trg_viagem_viaj_guarda()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if coalesce(current_setting('dima.viagem', true), '') = 'decidir' then return new; end if;
  if tg_op = 'INSERT' then
    if new.sit_passagem = 'aprovado' or new.sit_diaria = 'aprovado'
       or new.aprovado_pass_por is not null or new.aprovado_diar_por is not null then
      raise exception 'VIAGEM_DECISAO: viajante novo entra como solicitado; a aprovação é do protocolo.';
    end if;
    return new;
  end if;
  if (new.sit_passagem = 'aprovado' and old.sit_passagem is distinct from 'aprovado')
     or (new.sit_diaria = 'aprovado' and old.sit_diaria is distinct from 'aprovado')
     or new.aprovado_pass_por is distinct from old.aprovado_pass_por
     or new.aprovado_diar_por is distinct from old.aprovado_diar_por
     or new.aprovado_pass_em is distinct from old.aprovado_pass_em
     or new.aprovado_diar_em is distinct from old.aprovado_diar_em then
    raise exception 'VIAGEM_DECISAO: passagem e diária só são aprovadas pela aprovação do protocolo, com a senha.';
  end if;
  return new;
end $$;
create or replace trigger trg_viagem_viaj_guarda
  before insert or update on public.viagem_viajantes
  for each row execute function public.fn_trg_viagem_viaj_guarda();

-- ── viaj_upd liberava edição a qualquer logado: passa a seguir o protocolo ──
alter policy viaj_upd on public.viagem_viajantes to authenticated
  using (exists (select 1 from public.viagem_protocolos p
                  where p.id = viagem_viajantes.protocolo_id
                    and (coalesce((select public.fn_perfil_atual())::text in ('super_admin','coordenacao','financeiro'), false)
                         or p.criado_por = auth.uid())));

-- ── aviso de protocolo novo: não avisa quem criou ───────────────────────
create or replace function public.fn_notificar_protocolo_criado()
returns trigger language plpgsql as $function$
DECLARE
  v_uid record;
BEGIN
  FOR v_uid IN
    SELECT id FROM public.usuarios
     WHERE perfil = 'super_admin' AND ativo = true AND id IS DISTINCT FROM NEW.criado_por
  LOOP
    INSERT INTO public.notificacoes
      (usuario_id, tipo, titulo, mensagem, lida, link, entidade_tipo, entidade_id)
    VALUES (
      v_uid.id,
      'viagem_solicitada',
      'Nova solicitação — ' || COALESCE(NEW.numero,'') || ' — ' || COALESCE(NEW.destino_principal,''),
      'Protocolo ' || COALESCE(NEW.numero,'') || ' aguarda aprovação. Destino: ' ||
        COALESCE(NEW.destino_principal,'—') ||
        CASE WHEN NEW.dt_saida IS NOT NULL
          THEN ' · ' || to_char(NEW.dt_saida,'DD/MM/YYYY') ELSE '' END,
      false, 'viagens.html', 'viagem_protocolos', NEW.id
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- ── permissões ───────────────────────────────────────────────────────────
revoke all on function public.fn_viagem_norm(text) from public, anon;
grant execute on function public.fn_viagem_norm(text) to authenticated, service_role;
revoke all on function public.fn_viagem_participa(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_viagem_regra(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_viagem_hash(uuid) from public, anon;
grant execute on function public.fn_viagem_hash(uuid) to authenticated, service_role;
revoke all on function public.fn_viagem_pode_decidir(uuid) from public, anon;
grant execute on function public.fn_viagem_pode_decidir(uuid) to authenticated;
revoke all on function public.fn_viagem_decidir(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_viagem_decidir(uuid, uuid, text, text, text) to service_role;
revoke all on function public.fn_trg_viagem_guarda_decisao() from public, anon, authenticated;
revoke all on function public.fn_trg_viagem_viaj_guarda() from public, anon, authenticated;

notify pgrst, 'reload schema';
