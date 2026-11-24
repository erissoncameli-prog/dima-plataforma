-- Viagem: a saída tem de ser pelo menos 5 dias depois da data do protocolo (criado_em, hora do Acre).
-- Vale ao criar, ao mudar a data de saída/retorno (rascunho ou solicitado) e ao enviar para aprovação.
-- Protocolos antigos não são revistos: só são conferidos quando a data muda ou quando voltam a ser enviados.
create or replace function public.fn_trg_viagem_antecedencia()
returns trigger language plpgsql set search_path = public as $$
declare
  v_base date := (coalesce(new.criado_em, now()) at time zone 'America/Rio_Branco')::date;
  v_conferir boolean;
begin
  if new.situacao not in ('rascunho','solicitado') then return new; end if;
  v_conferir := tg_op = 'INSERT'
    or new.dt_saida is distinct from old.dt_saida
    or new.dt_retorno is distinct from old.dt_retorno
    or (new.situacao = 'solicitado' and old.situacao is distinct from 'solicitado');
  if not v_conferir then return new; end if;

  if new.situacao = 'solicitado' and new.dt_saida is null then
    raise exception 'VIAGEM_SEM_DATA: informe a data de saída antes de enviar para aprovação.';
  end if;
  if new.dt_saida is not null and new.dt_saida < v_base + 5 then
    raise exception 'VIAGEM_ANTECEDENCIA: a data de saída (%) tem de ser pelo menos 5 dias depois da data do protocolo (%); a primeira data possível é %.',
      to_char(new.dt_saida,'DD/MM/YYYY'), to_char(v_base,'DD/MM/YYYY'), to_char(v_base + 5,'DD/MM/YYYY');
  end if;
  if new.dt_saida is not null and new.dt_retorno is not null and new.dt_retorno < new.dt_saida then
    raise exception 'VIAGEM_RETORNO_ANTES: a data de retorno não pode ser anterior à data de saída.';
  end if;
  return new;
end $$;

revoke execute on function public.fn_trg_viagem_antecedencia() from public, anon, authenticated;

create or replace trigger trg_viagem_antecedencia
  before insert or update on public.viagem_protocolos
  for each row execute function public.fn_trg_viagem_antecedencia();
