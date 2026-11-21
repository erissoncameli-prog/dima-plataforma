-- 26/11/2026 · Acessos (parte C): cron dos e-mails de acesso + regras do Auditor.
-- O cron chama a Edge Function acesso-emails com o mesmo cabeçalho do cron remanejamento-emails
-- (copiado do próprio job, para nenhuma chave ficar escrita no repositório).
-- Sem palavra de comando de apagar no texto (o apply_migration espera confirmação nela).

do $$
declare v_cmd text;
begin
  if not exists (select 1 from cron.job where jobname = 'acesso-emails') then
    select replace(replace(command, '/functions/v1/assinar-remanejamento', '/functions/v1/acesso-emails'),
                   '{"acao":"drenar"}', '{}')
      into v_cmd from cron.job where jobname = 'remanejamento-emails';
    if v_cmd is not null then
      perform cron.schedule('acesso-emails', '*/15 * * * *', v_cmd);
    end if;
  end if;
end $$;

-- Regras do Auditor para o controle de acesso (agente de acessos do auditor-ia; grava como qualidade_dados,
-- título "Acessos: …"). Regra nova de auditoria de acesso entra aqui, não no TypeScript.
create or replace function public.fn_auditoria_acessos()
returns table(severidade text, titulo text, descricao text, recomendacao text,
              referencia_tabela text, referencia_id uuid, referencia_label text)
language sql stable security definer set search_path to 'public' as $function$
  -- menos de 2 super_admins ativos (o banco recusa chegar a isso; se acontecer, é grave)
  select 'critico', 'Acessos: menos de 2 super_admins ativos',
         'A plataforma tem ' || count(*) || ' super_admin(s) ativo(s). Sem pelo menos dois, um esquecimento tranca a administração.',
         'Promova outra pessoa de confiança a super_admin em Usuários.', 'usuarios', null::uuid, 'Super Admin'
    from usuarios where perfil = 'super_admin' and ativo
  having count(*) < 2
  union all
  -- revisão da migração parada: pessoa com acessos em revisão a menos de 5 dias de cair
  select 'medio', 'Acessos: revisão pendente — ' || u.nome_completo,
         count(*) || ' acesso(s) de ' || u.nome_completo || ' (' || u.perfil || ') estão em revisão e saem em '
           || to_char(min(p.valido_ate) at time zone 'America/Rio_Branco', 'DD/MM/YYYY') || ' se não forem confirmados.',
         'Em Usuários, abra a pessoa, confira os módulos e marque "Revisei: confirmar os acessos marcados".',
         'usuarios', u.id, u.nome_completo
    from usuario_permissoes p join usuarios u on u.id = p.usuario_id and u.ativo
   where p.ativo and p.em_revisao and p.valido_ate > now() and p.valido_ate < now() + interval '5 days'
   group by u.id, u.nome_completo, u.perfil
  union all
  -- revisão vencida sem decisão: o acesso caiu sozinho
  select 'baixo', 'Acessos: revisão não feita — acesso caiu (' || u.nome_completo || ')',
         count(*) || ' módulo(s) de ' || u.nome_completo || ' saíram porque a revisão não foi feita no prazo.',
         'Se a pessoa ainda precisa, libere de novo em Usuários; se não, desmarque para limpar o registro.',
         'usuarios', u.id, u.nome_completo
    from usuario_permissoes p join usuarios u on u.id = p.usuario_id and u.ativo
   where p.ativo and p.em_revisao and p.valido_ate <= now()
   group by u.id, u.nome_completo
  union all
  -- liberação vencida que continua marcada (limpeza)
  select 'info', 'Acessos: liberação vencida ainda marcada (' || u.nome_completo || ')',
         count(*) || ' liberação(ões) de ' || u.nome_completo || ' venceram e continuam marcadas.',
         'Renove o prazo ou desmarque o módulo em Usuários.', 'usuarios', u.id, u.nome_completo
    from usuario_permissoes p join usuarios u on u.id = p.usuario_id and u.ativo
   where p.ativo and not p.em_revisao and p.valido_ate is not null and p.valido_ate <= now()
   group by u.id, u.nome_completo
  union all
  -- conta suspensa por inatividade há mais de 60 dias: candidata a desativar
  select 'baixo', 'Acessos: suspenso por inatividade há mais de 60 dias — ' || u.nome_completo,
         u.nome_completo || ' está com a entrada suspensa desde '
           || to_char(u.bloqueado_inatividade_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY') || '.',
         'Se a pessoa saiu do projeto, desative a conta em Usuários; se ainda vai trabalhar, libere a entrada.',
         'usuarios', u.id, u.nome_completo
    from usuarios u
   where u.ativo and u.bloqueado_inatividade_em < now() - interval '60 days'
  union all
  -- pedido de acesso parado há mais de 7 dias
  select 'medio', 'Acessos: pedido sem resposta há mais de 7 dias — ' || u.nome_completo,
         u.nome_completo || ' pediu ' || case when a.tipo = 'liberacao' then 'a liberação da entrada'
           else 'o módulo ' || coalesce(m.rotulo, a.modulo) end || ' em '
           || to_char(a.criado_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY') || ' e ainda não teve resposta.',
         'Em Usuários › Pedidos de acesso, libere ou recuse.', 'usuario_pedidos_acesso', a.id, u.nome_completo
    from usuario_pedidos_acesso a join usuarios u on u.id = a.usuario_id
    left join acesso_modulos m on m.modulo = a.modulo
   where a.status = 'pendente' and a.criado_em < now() - interval '7 days'
  union all
  -- e-mail de acesso que não saiu
  select 'baixo', 'Acessos: e-mail não enviado',
         count(*) || ' aviso(s) de acesso por e-mail falharam 5 vezes (último erro: ' || coalesce(max(erro), '—') || ').',
         'Confira a senha de app do Gmail (GMAIL_APP_PASSWORD) da Edge Function acesso-emails.',
         'acesso_notificacoes', null::uuid, 'Fila de e-mail de acesso'
    from acesso_notificacoes where enviado_em is null and tentativas >= 5
  having count(*) > 0
$function$;
revoke execute on function public.fn_auditoria_acessos() from public, anon, authenticated;
