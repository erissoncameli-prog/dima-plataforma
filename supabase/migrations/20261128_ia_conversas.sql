-- ═══════════════════════════════════════════════════════════════════
-- DIMA · Assistente de IA — Fase 2: conversas gravadas, limite de uso e retenção
--
-- ia_conversas / ia_mensagens guardam o que cada pessoa perguntou ao
-- assistente (chat-auditor) e o que ele respondeu, com as consultas feitas e
-- os tokens. Servem para: histórico da própria pessoa, limite de uso por
-- pessoa e trilha de quem perguntou o quê.
--
-- Regras:
--  - Escrita SÓ pela Edge Function (service_role). Sem policy nem grant de
--    escrita para o cliente — não criar.
--  - Leitura: cada pessoa lê só as próprias conversas (usuario_id = auth.uid()).
--  - Retenção (TRAT-009): depois do prazo do ROPA o TEXTO é apagado por UPDATE
--    (conteudo/titulo), ficando quem, quando, consultas e tokens. Nenhuma linha é removida.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.ia_conversas (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references public.usuarios(id),
  origem          text not null default 'auditoria' check (origem in ('auditoria')),
  execucao_id     uuid references public.auditoria_execucoes(id),
  titulo          text not null default 'Conversa',
  n_perguntas     integer not null default 0,
  tokens_entrada  bigint not null default 0,
  tokens_saida    bigint not null default 0,
  tokens_cache    bigint not null default 0,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  expurgado_em    timestamptz
);
comment on table public.ia_conversas is
  'Conversas com o assistente de IA (chat-auditor). Escrita só pela Edge Function (service_role); '
  'leitura só da própria pessoa. Texto apagado pela retenção (fn_ia_aplicar_retencao, TRAT-009).';

create index if not exists ia_conversas_usuario_idx on public.ia_conversas (usuario_id, atualizado_em desc);

create table if not exists public.ia_mensagens (
  id              uuid primary key default gen_random_uuid(),
  conversa_id     uuid not null references public.ia_conversas(id),
  usuario_id      uuid not null references public.usuarios(id),  -- dono da conversa (limite e RLS)
  papel           text not null check (papel in ('user', 'assistant')),
  conteudo        text not null,
  ferramentas     text[] not null default '{}',
  modelo          text,
  parada          text,
  tokens_entrada  integer,
  tokens_saida    integer,
  tokens_cache    integer,
  criado_em       timestamptz not null default now(),
  expurgado_em    timestamptz
);
comment on table public.ia_mensagens is
  'Perguntas e respostas do assistente de IA. ferramentas = consultas que o assistente fez. '
  'Escrita só pela Edge Function; leitura só da própria pessoa.';

create index if not exists ia_mensagens_conversa_idx on public.ia_mensagens (conversa_id, criado_em);
create index if not exists ia_mensagens_limite_idx on public.ia_mensagens (usuario_id, criado_em desc) where papel = 'user';

alter table public.ia_conversas enable row level security;
alter table public.ia_mensagens enable row level security;

revoke all on public.ia_conversas, public.ia_mensagens from public, anon, authenticated;
grant select on public.ia_conversas, public.ia_mensagens to authenticated;
grant all on public.ia_conversas, public.ia_mensagens to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ia_conversas'
                 and policyname = 'ia_conversas_select_proprio') then
    create policy ia_conversas_select_proprio on public.ia_conversas
      for select to authenticated using (usuario_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ia_mensagens'
                 and policyname = 'ia_mensagens_select_proprio') then
    create policy ia_mensagens_select_proprio on public.ia_mensagens
      for select to authenticated using (usuario_id = auth.uid());
  end if;
end $$;

-- ── Retenção: apaga o texto, mantém o registro ─────────────────────────
create or replace function public.fn_ia_aplicar_retencao()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prazo interval;
  v_msgs  integer;
  v_conv  integer;
begin
  select retencao_prazo into v_prazo from public.lgpd_tratamentos where codigo = 'TRAT-009' and ativo;
  v_prazo := coalesce(v_prazo, interval '1 year');

  update public.ia_mensagens
     set conteudo = '[apagado pela retenção]', expurgado_em = now()
   where expurgado_em is null and criado_em < now() - v_prazo;
  get diagnostics v_msgs = row_count;

  update public.ia_conversas c
     set titulo = '[apagado pela retenção]', expurgado_em = now()
   where c.expurgado_em is null and c.atualizado_em < now() - v_prazo;
  get diagnostics v_conv = row_count;

  return jsonb_build_object('prazo', v_prazo::text, 'mensagens', v_msgs, 'conversas', v_conv);
end $$;

revoke execute on function public.fn_ia_aplicar_retencao() from public, anon, authenticated;
grant execute on function public.fn_ia_aplicar_retencao() to service_role;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'ia-retencao') then
    perform cron.schedule('ia-retencao', '17 9 * * *', 'select public.fn_ia_aplicar_retencao()');
  end if;
end $$;

-- ── ROPA ───────────────────────────────────────────────────────────────
insert into public.lgpd_tratamentos
  (codigo, nome, modulo, finalidade, controlador, operadores, base_legal, base_legal_detalhe,
   categorias_titulares, categorias_dados, tabelas, compartilhamento, transferencia_internacional,
   retencao_prazo, retencao_criterio, medidas_seguranca)
values ('TRAT-009', 'Assistente de IA da Auditoria — conversas', 'auditoria',
  'Guardar as perguntas feitas ao assistente de IA e as respostas, para a própria pessoa retomar a conversa, '
  || 'limitar o uso por pessoa e registrar quem consultou o quê.',
  'SEMA/AC',
  'Supabase (banco e funções); Anthropic (processa a pergunta e os dados consultados, sem guardar para treino); '
  || 'Vercel (hospedagem)',
  'art7_iii_politica_publica',
  'Art. 7º, III (execução de políticas públicas — gestão e auditoria do Projeto 218BRA2001) e art. 46 (segurança). '
  || 'Não usa consentimento.',
  array['servidores da coordenação e administradores que usam o assistente'],
  array['texto das perguntas e respostas (pode citar nomes de fornecedores ou pessoas digitados pela própria pessoa)',
        'data e hora, consultas feitas e quantidade de tokens'],
  array['ia_conversas', 'ia_mensagens'],
  'Anthropic recebe a pergunta e o resultado das consultas, com CPF/CNPJ e e-mail mascarados antes do envio. '
  || 'Cada pessoa vê só as próprias conversas.',
  'Supabase/Vercel/Anthropic (art. 33) — pendência geral do DIMA',
  interval '1 year',
  'Texto das conversas apagado 1 ano após a última mensagem (fn_ia_aplicar_retencao, diária); ficam quem, quando, '
  || 'consultas e tokens.',
  'Escrita só pela Edge Function (sem policy nem grant de escrita); leitura só da própria pessoa; ferramentas do '
  || 'assistente só leem e respeitam a RLS de quem pergunta; CPF/CNPJ/e-mail mascarados antes de ir à IA; limite de uso por pessoa.')
on conflict do nothing;
