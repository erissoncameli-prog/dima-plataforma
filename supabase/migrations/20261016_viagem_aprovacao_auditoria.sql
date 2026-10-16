-- ════════════════════════════════════════════════════════════════════════
-- Auditor: aprovação de viagem por quem está no protocolo (16/10/2026)
-- Regras do agente de viagens que dependem da segregação ficam no banco
-- (mesma fn_viagem_participa da aprovação), como fn_auditoria_orcamento.
--   • aprovado antes da trava (20261016_viagem_aprovacao_segregada, 18:55 UTC) por quem
--     pediu ou viaja ⇒ 'info' (histórico: registra, não há o que desfazer);
--   • aprovado depois da trava sem passar pela aprovação com senha
--     (sem linha 'aprovar' em viagem_decisoes) ou por quem está no protocolo ⇒
--     'critico' (a trava foi contornada).
-- Título começa com "Viagem: aprovação" — a IA do supervisor não muda a severidade.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.fn_auditoria_viagens()
returns table(severidade text, titulo text, descricao text, recomendacao text,
              referencia_tabela text, referencia_id uuid, referencia_label text)
language sql stable security definer set search_path to 'public' as $$
  with base as (
    select p.id, p.numero, p.destino_principal, p.situacao, p.aprovado_em,
           u.nome_completo as aprovador,
           fn_viagem_participa(p.id, p.aprovado_por) as papel,
           p.aprovado_em < timestamptz '2026-10-16 18:55:57+00' as antes_da_trava,  -- hora em que a trava entrou (schema_migrations)
           exists (select 1 from viagem_decisoes d
                    where d.protocolo_id = p.id and d.decisao = 'aprovar'
                      and d.usuario_id = p.aprovado_por) as com_senha
      from viagem_protocolos p
      left join usuarios u on u.id = p.aprovado_por
     where p.aprovado_por is not null
  )
  select 'info',
         'Viagem: aprovação pelo próprio ' || case when papel = 'viajante' then 'viajante' else 'solicitante' end
           || ' — protocolo ' || coalesce(numero, '—') || ' (antes da trava)',
         'O protocolo ' || coalesce(numero, '—') || ' (' || coalesce(destino_principal, '—') || ', situação "' || situacao
           || '") foi aprovado em ' || to_char(aprovado_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY')
           || ' por ' || coalesce(aprovador, 'usuário não identificado') || ', que '
           || case when papel = 'viajante' then 'viaja no protocolo' else 'pediu a viagem' end
           || '. Foi antes da regra de 16/10/2026 (15h55) que impede quem está no protocolo de aprovar; desde então isso é barrado no banco.',
         'Registro histórico de segregação de funções. Se necessário para a prestação de contas, anexar ao processo SEI a ratificação da aprovação por outro super_admin.',
         'viagem_protocolos', id, 'Viagem ' || coalesce(numero, '—')
    from base
   where antes_da_trava and papel is not null
  union all
  select 'critico',
         'Viagem: aprovação fora do fluxo com senha — protocolo ' || coalesce(numero, '—'),
         'O protocolo ' || coalesce(numero, '—') || ' foi aprovado em '
           || to_char(aprovado_em at time zone 'America/Rio_Branco', 'DD/MM/YYYY HH24:MI') || ' por '
           || coalesce(aprovador, 'usuário não identificado')
           || case when papel is not null then ', que está no protocolo,' else '' end
           || case when not com_senha then ' sem registro da aprovação com senha (viagem_decisoes).' else '.' end
           || ' Desde 16/10/2026 (15h55) só a aprovação com senha, por quem não está no protocolo, pode aprovar.',
         'Verificar no audit_log como a aprovação foi gravada (trava contornada), devolver o protocolo para correção e aprovar de novo pelo fluxo com senha.',
         'viagem_protocolos', id, 'Viagem ' || coalesce(numero, '—')
    from base
   where not antes_da_trava and (papel is not null or not com_senha)
$$;

revoke all on function public.fn_auditoria_viagens() from public, anon, authenticated;
grant execute on function public.fn_auditoria_viagens() to service_role;
-- fn_viagem_participa é chamada dentro da função SECURITY DEFINER (dono postgres): não precisa de grant
