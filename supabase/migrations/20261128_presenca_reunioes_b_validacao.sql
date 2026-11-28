-- 28/11/2026 · Lista de presença (parte B): validação de campo vazio.
-- Na assinatura, `(p_dados->>'x') not in (...)` com o campo ausente dá NULL e o `if` deixava passar (armadilha
-- "NULL não barra" do CLAUDE.md); a gravação era recusada pelo NOT NULL, mas com erro técnico em vez da mensagem
-- da tela. Agora uso de imagem, sexo/gênero e cor ou raça vazios caem nas mensagens presenca:*_obrigatori*.
create or replace function public.fn_publico_presenca_assinar(p_lista_token text, p_convite text, p_dados jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  l public.presenca_listas; c public.presenca_convites; tm public.presenca_termos_imagem; u public.usuarios;
  v_uid uuid; v_origem text; v_email text; v_nome text; v_tel text; v_img boolean; v_n int;
begin
  if nullif(p_convite, '') is not null then
    select * into c from public.presenca_convites where token_hash = public.fn_presenca_hash(p_convite) for update;
    if not found then raise exception 'presenca:link_invalido'; end if;
    select * into l from public.presenca_listas where id = c.lista_id for update;
    v_uid := c.usuario_id; v_origem := 'convite';
  else
    select * into l from public.presenca_listas where token = coalesce(p_lista_token, '') for update;
    if not found then raise exception 'presenca:lista_inexistente'; end if;
    v_origem := 'qr';
    if auth.uid() is not null and public.fn_perfil_atual() is not null then v_uid := auth.uid(); end if;
  end if;
  if not public.fn_presenca_aberta(l) then raise exception 'presenca:lista_fechada'; end if;

  -- termo: tem de ser o vigente que a pessoa leu
  select * into tm from public.presenca_termos_imagem where vigente;
  if tm.id is null or (p_dados->>'termo_id') is distinct from tm.id::text then raise exception 'presenca:termo_mudou'; end if;
  if coalesce(p_dados->>'imagem_autoriza', '') not in ('true', 'false') then raise exception 'presenca:imagem_obrigatoria'; end if;
  v_img := (p_dados->>'imagem_autoriza')::boolean;

  v_nome := btrim(regexp_replace(coalesce(p_dados->>'nome', ''), '\s+', ' ', 'g'));
  v_email := lower(btrim(coalesce(p_dados->>'email', '')));
  v_tel := nullif(regexp_replace(coalesce(p_dados->>'telefone', ''), '\D', '', 'g'), '');
  if length(v_nome) < 3 then raise exception 'presenca:nome_invalido'; end if;
  if v_tel is not null and length(v_tel) not between 10 and 13 then raise exception 'presenca:telefone_invalido'; end if;

  if v_uid is not null then
    -- usuário da plataforma assina como ele mesmo: o e-mail é o do cadastro
    select * into u from public.usuarios where id = v_uid;
    v_email := lower(u.email);
  else
    if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'presenca:email_invalido'; end if;
    -- e-mail de um usuário ativo: conta como a assinatura dele (uma por pessoa)
    select id into v_uid from public.usuarios where lower(email) = v_email and ativo limit 1;
  end if;

  if coalesce(p_dados->>'sexo_genero', '') not in ('mulher','homem','outro','prefere_nao_responder') then raise exception 'presenca:sexo_obrigatorio'; end if;
  if coalesce(p_dados->>'cor_raca', '') not in ('branca','preta','parda','amarela','indigena','prefere_nao_responder') then raise exception 'presenca:raca_obrigatoria'; end if;

  select count(*) into v_n from public.presenca_assinaturas where lista_id = l.id;
  if v_n >= 1000 then raise exception 'presenca:lista_cheia'; end if;

  begin
    insert into public.presenca_assinaturas (lista_id, usuario_id, nome, email, telefone, sexo_genero, sexo_genero_outro,
      cor_raca, origem, imagem_autoriza, termo_id, termo_sha256)
    values (l.id, v_uid, v_nome, v_email, v_tel, p_dados->>'sexo_genero',
      case when p_dados->>'sexo_genero' = 'outro' then left(nullif(btrim(p_dados->>'sexo_genero_outro'), ''), 60) end,
      p_dados->>'cor_raca', v_origem, v_img, tm.id, tm.sha256);
  exception when unique_violation then
    raise exception 'presenca:ja_assinou';
  end;
  if c.id is not null then update public.presenca_convites set usado_em = now() where id = c.id; end if;
  return jsonb_build_object('ok', true, 'nome', v_nome);
end $$;
revoke execute on function public.fn_publico_presenca_assinar(text, text, jsonb) from public;
grant execute on function public.fn_publico_presenca_assinar(text, text, jsonb) to anon, authenticated;
