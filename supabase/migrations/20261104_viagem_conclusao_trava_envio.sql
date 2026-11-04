-- Trava do e-mail de conclusão à UNESCO (Edge Function notificar-unesco-conclusao).
-- Em 04/11/2026 o VGM-2026-024 foi enviado duas vezes (clique duplo). A tela já
-- desativa o botão; esta trava vale também entre abas e pessoas diferentes:
--   * enquanto um envio está em andamento, outro para o mesmo protocolo é recusado;
--   * depois de um envio bem-sucedido, novo envio só após 2 minutos.
-- A reserva é um UPDATE condicional (atômico). Só service_role executa.

alter table public.viagem_protocolos
  add column if not exists conclusao_envio_trava_ate timestamptz;

comment on column public.viagem_protocolos.conclusao_envio_trava_ate is
  'Trava do e-mail de conclusão à UNESCO: até quando um novo envio é recusado (em andamento ou intervalo após envio). Gravada só por fn_viagem_conclusao_reservar/_liberar.';

create or replace function public.fn_viagem_conclusao_reservar(p_protocolo_id uuid, p_segundos int default 300)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok uuid;
  v_ate timestamptz;
begin
  update viagem_protocolos
     set conclusao_envio_trava_ate = now() + make_interval(secs => greatest(p_segundos, 30))
   where id = p_protocolo_id
     and (conclusao_envio_trava_ate is null or conclusao_envio_trava_ate <= now())
  returning id into v_ok;

  if v_ok is not null then
    return jsonb_build_object('ok', true);
  end if;

  select conclusao_envio_trava_ate into v_ate from viagem_protocolos where id = p_protocolo_id;
  return jsonb_build_object('ok', false, 'ate', v_ate,
    'existe', exists (select 1 from viagem_protocolos where id = p_protocolo_id));
end;
$$;

-- p_segundos > 0: mantém a trava por esse intervalo (após envio bem-sucedido); 0: solta (falha).
create or replace function public.fn_viagem_conclusao_liberar(p_protocolo_id uuid, p_segundos int default 0)
returns void
language sql
security definer
set search_path = public
as $$
  update viagem_protocolos
     set conclusao_envio_trava_ate = case when p_segundos > 0 then now() + make_interval(secs => p_segundos) else null end
   where id = p_protocolo_id;
$$;

revoke execute on function public.fn_viagem_conclusao_reservar(uuid, int) from public, anon, authenticated;
revoke execute on function public.fn_viagem_conclusao_liberar(uuid, int) from public, anon, authenticated;
grant execute on function public.fn_viagem_conclusao_reservar(uuid, int) to service_role;
grant execute on function public.fn_viagem_conclusao_liberar(uuid, int) to service_role;
