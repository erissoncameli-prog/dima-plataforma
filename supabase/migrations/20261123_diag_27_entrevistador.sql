-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 27 — acesso próprio de ENTREVISTADOR
--
-- Pedido de 16/11/2026: a caixa "Diagnóstico Socioambiental" misturava duas
-- coisas — ver os dados e ser entrevistador. Agora:
--   · 'diagnostico'               = ver os dados (coordenação pelo perfil; técnico
--                                   vê números; consultor lê fichas sem identificação);
--   · 'diagnostico_entrevistador' = faz entrevista real no app (conta na meta e entra
--                                   na lista de designação). QUALQUER perfil pode
--                                   receber, mas SÓ o super_admin concede (trigger);
--                                   não dá a mesa (decisão do usuário);
--   · 'diagnostico_treino'        = segue igual (técnico/outros: junto com entrevistador;
--                                   coordenação: só treino).
-- Coordenação pode ser entrevistadora; por isso quem fez a entrevista não valida,
-- devolve nem descarta a própria ficha (diag:segregacao).
-- Em 16/11/2026 não havia técnico com 'diagnostico', designação nem ficha real:
-- nada a migrar.
-- ════════════════════════════════════════════════════════════════════════

-- ── Quem aplica ─────────────────────────────────────────────────────────
create or replace function public.fn_diag_pode_aplicar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    fn_diag_perfil_ativo() = 'super_admin'
    or (fn_diag_perfil_ativo() is not null and tem_permissao('diagnostico_entrevistador')),
  false)
$$;

create or replace function public.fn_diag_pode_aplicar_uid(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(exists (
    select 1 from usuarios u
    where u.id = p_uid and u.ativo and (u.perfil = 'super_admin' or exists (
      select 1 from usuario_permissoes up where up.usuario_id = u.id and up.modulo = 'diagnostico_entrevistador'
        and up.ativo and up.valido_de <= now() and (up.valido_ate is null or up.valido_ate > now())))), false)
$$;

create or replace function public.fn_diag_pode_treinar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    fn_diag_perfil_ativo() = 'super_admin'
    or (tem_permissao('diagnostico_treino')
        and (tem_permissao('diagnostico_entrevistador') or fn_diag_perfil_ativo() = 'coordenacao')),
  false)
$$;

-- técnico com 'diagnostico' (sem ser entrevistador) continua vendo os números
create or replace function public.fn_diag_pode_ver_numeros()
returns boolean language sql stable security definer set search_path = public as $$
  select fn_diag_pode_aplicar() or fn_diag_pode_gerir() or fn_diag_pode_consultar()
         or coalesce(fn_diag_perfil_ativo() = 'visualizador', false)
         or coalesce(fn_diag_perfil_ativo() = 'tecnico' and tem_permissao('diagnostico'), false)
$$;

-- lista de designação = quem tem o acesso de entrevistador valendo (qualquer perfil)
create or replace function public.diag_campo_entrevistadores()
returns table (id uuid, nome_completo text, perfil text, acesso_ate timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_diag_pode_gerir() then raise exception 'diag:nao_autorizado: só coordenação e super_admin'; end if;
  return query
    select u.id, u.nome_completo, u.perfil::text, max(up.valido_ate)
    from usuarios u join usuario_permissoes up on up.usuario_id = u.id
    where u.ativo and up.modulo = 'diagnostico_entrevistador' and up.ativo
      and up.valido_de <= now() and (up.valido_ate is null or up.valido_ate > now())
    group by u.id, u.nome_completo, u.perfil
    order by u.nome_completo;
end $$;
revoke execute on function public.diag_campo_entrevistadores() from public, anon;
grant execute on function public.diag_campo_entrevistadores() to authenticated;

-- ── Só o super_admin concede ou muda o acesso de entrevistador ──────────
create or replace function public.fn_trg_uperm_entrevistador()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.modulo = 'diagnostico_entrevistador' or (tg_op = 'UPDATE' and old.modulo = 'diagnostico_entrevistador'))
     and auth.uid() is not null
     and not exists (select 1 from usuarios where id = auth.uid() and perfil = 'super_admin' and ativo) then
    raise exception 'diag:so_super_admin: só o super_admin define quem é entrevistador do Diagnóstico';
  end if;
  return new;
end $$;
revoke execute on function public.fn_trg_uperm_entrevistador() from public, anon, authenticated;
create or replace trigger trg_uperm_entrevistador before insert or update on public.usuario_permissoes
  for each row execute function public.fn_trg_uperm_entrevistador();

-- ── Troca pontual no corpo ATUAL (aborta se o trecho não aparecer 1×) ───
create or replace function pg_temp.diag27_trocar(p_assin text, p_de text, p_para text)
returns void language plpgsql as $$
declare v_def text; v_n int;
begin
  v_def := pg_get_functiondef(p_assin::regprocedure);
  if position(p_para in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_de, ''))) / length(p_de);
  if v_n <> 1 then raise exception 'diag27: trecho aparece % vez(es) em %', v_n, p_assin; end if;
  execute replace(v_def, p_de, p_para);
end $$;

-- envio: entrevistador de qualquer perfil; a carência de 15 dias vale para o acesso novo
do $t$ begin perform pg_temp.diag27_trocar('public.diag_enviar_ficha(jsonb,jsonb,jsonb)',
  $a$  -- coordenação NÃO aplica ficha real; só treina (decisão de 26/09)
  if v_perfil is null or not (v_perfil in ('tecnico','super_admin') or (v_perfil = 'coordenacao' and v_treino)) then$a$,
  $b$  -- ficha real: super_admin ou quem tem o acesso de entrevistador (diag_27, qualquer perfil);
  -- treino: conferido logo abaixo por fn_diag_pode_treinar
  if v_perfil is null or not (v_perfil = 'super_admin' or v_treino or exists (select 1 from usuario_permissoes up
       where up.usuario_id = v_uid and up.ativo and up.modulo = 'diagnostico_entrevistador')) then$b$); end $t$;
do $t$ begin perform pg_temp.diag27_trocar('public.diag_enviar_ficha(jsonb,jsonb,jsonb)',
  $a$  if not v_treino and v_perfil = 'tecnico' and not tem_permissao('diagnostico') then$a$,
  $b$  if not v_treino and v_perfil <> 'super_admin' and not tem_permissao('diagnostico_entrevistador') then$b$); end $t$;
do $t$ begin perform pg_temp.diag27_trocar('public.diag_enviar_ficha(jsonb,jsonb,jsonb)',
  $a$up.modulo = 'diagnostico' and up.ativo$a$,
  $b$up.modulo = 'diagnostico_entrevistador' and up.ativo$b$); end $t$;
do $t$ begin perform pg_temp.diag27_trocar('public.diag_enviar_ficha(jsonb,jsonb,jsonb)',
  $a$'diag:sem_permissao: acesso ao Diagnóstico vencido; peça renovação ao super_admin'$a$,
  $b$'diag:sem_permissao: seu acesso de entrevistador do Diagnóstico não vale; peça ao super_admin'$b$); end $t$;

do $t$ begin perform pg_temp.diag27_trocar('public.diag_enviar_ficha(jsonb,jsonb,jsonb)',
  $a$'diag:nao_autorizado: perfil sem acesso para aplicar questionário'$a$,
  $b$'diag:nao_autorizado: sem o acesso de entrevistador do Diagnóstico (o super_admin concede em Usuários)'$b$); end $t$;

-- validação: quem fez a entrevista não decide sobre ela
do $t$ begin perform pg_temp.diag27_trocar('public.diag_mudar_status(uuid,text,text)',
  $a$  if p_status in ('devolvida','descartada') and nullif(btrim(p_motivo),'') is null then$a$,
  $b$  -- segregação (diag_27): a coordenação pode ser entrevistadora, mas não decide a própria ficha
  if v_f.entrevistador_id = auth.uid() and not v_f.treino then
    raise exception 'diag:segregacao: você fez esta entrevista — outra pessoa da coordenação valida, devolve ou descarta';
  end if;
  if p_status in ('devolvida','descartada') and nullif(btrim(p_motivo),'') is null then$b$); end $t$;
