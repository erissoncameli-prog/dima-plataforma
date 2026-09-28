-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico Socioambiental · 17 — transcrição assistida por IA LOCAL
--
-- Pedido de 28/09/2026: na mesa, "Sugerir transcrição" roda um modelo Whisper
-- NO NAVEGADOR da coordenação (transformers.js; o modelo é baixado uma vez).
-- A voz não sai do computador — a frase do aviso continua verdadeira.
-- A IA só preenche um rascunho; quem SALVA é a pessoa, depois de ouvir e
-- corrigir. O registro guarda a origem, para se saber depois quais textos
-- passaram por IA:
--   diag_audios.transcricao_origem ∈ manual | ia_local (sugestão conferida)
--   diag_audios.transcricao_modelo  = modelo usado (só em ia_local)
-- diag_transcrever_audio ganha p_origem/p_modelo (a versão de 2 argumentos
-- sai para não haver duas funções com o mesmo nome).
-- ════════════════════════════════════════════════════════════════════════

alter table public.diag_audios add column if not exists transcricao_origem text
  check (transcricao_origem is null or transcricao_origem in ('manual', 'ia_local'));
alter table public.diag_audios add column if not exists transcricao_modelo text;
comment on column public.diag_audios.transcricao_origem is
  'manual = digitada; ia_local = sugerida por IA no navegador da mesa e conferida por quem salvou (transcrito_por).';

drop function if exists public.diag_transcrever_audio(uuid, text);
create or replace function public.diag_transcrever_audio(
  p_audio_id uuid, p_texto text, p_origem text default 'manual', p_modelo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a      diag_audios;
  f      diag_fichas;
  q      diag_questionarios;
  v_txt  text := btrim(coalesce(p_texto, ''));
  v_max  int;
begin
  if not fn_diag_pode_gerir() then
    raise exception 'diag:nao_autorizado: só coordenação e super_admin transcrevem na mesa';
  end if;
  select * into a from diag_audios where id = p_audio_id;
  if a.id is null then raise exception 'diag:nao_encontrada'; end if;
  select * into f from diag_fichas where id = a.ficha_id for update;
  if f.status not in ('enviada', 'devolvida') then
    raise exception 'diag:transicao_invalida: ficha % não aceita transcrição', f.status;
  end if;
  select * into q from diag_questionarios where id = f.questionario_id;
  v_max := coalesce((q.estrutura->>'texto_max_len')::int, 2000);
  if v_txt = '' then raise exception 'diag:parametro_invalido: transcrição vazia'; end if;
  if coalesce(p_origem, 'manual') not in ('manual', 'ia_local') then
    raise exception 'diag:parametro_invalido: origem da transcrição %', p_origem;
  end if;
  if length(v_txt) > v_max then raise exception 'diag:parametro_invalido: transcrição acima de % caracteres', v_max; end if;

  update diag_fichas
     set respostas = jsonb_set(respostas, array[a.pergunta_chave], to_jsonb(v_txt), true)
   where id = f.id;
  update diag_fichas
     set alertas = fn_diag_alertas_audio(alertas, f.id, q.estrutura)
   where id = f.id;
  update diag_audios set transcrito_por = auth.uid(), transcrito_em = now(),
         transcricao_origem = coalesce(p_origem, 'manual'),
         transcricao_modelo = case when p_origem = 'ia_local' then left(nullif(btrim(p_modelo), ''), 120) end
   where id = a.id;
  return jsonb_build_object('chave', a.pergunta_chave, 'texto', v_txt,
                            'pendentes', to_jsonb(fn_diag_audios_pendentes(f.id)));
end $$;

revoke execute on function public.diag_transcrever_audio(uuid, text, text, text) from public, anon;
grant execute on function public.diag_transcrever_audio(uuid, text, text, text) to authenticated;

-- ROPA: transparência sobre a transcrição assistida (sem novo operador)
update public.lgpd_tratamentos
   set medidas_seguranca = medidas_seguranca || ' Transcrição de áudio assistida por IA executada localmente no navegador da mesa: a voz não é enviada a terceiros; o texto sugerido é conferido por quem salva.',
       atualizado_em = now()
 where codigo = 'TRAT-001' and medidas_seguranca not like '%assistida por IA%';
