-- pgcrypto só confere bcrypt no formato $2a$ (com $2b$ ele cai em outro algoritmo e nunca bate).
-- O Auth grava $2a$; $2b$/$2y$ (mesmo algoritmo) viram $2a$ para comparar.
create or replace function public.fn_senha_ja_usada(p_uid uuid, p_senha text)
returns boolean language sql stable security definer set search_path to 'public', 'extensions' as $f$
  with h as (
    select regexp_replace(hash, '^\$2[by]\$', '$2a$') hash
      from (select hash, criado_em from public.usuario_senhas_historico
             where usuario_id = p_uid order by criado_em desc limit 12) x
    union
    select regexp_replace(encrypted_password, '^\$2[by]\$', '$2a$') from auth.users
     where id = p_uid and encrypted_password like '$2%'
  )
  select exists (select 1 from h where h.hash = extensions.crypt(p_senha, h.hash));
$f$;
revoke execute on function public.fn_senha_ja_usada(uuid, text) from public, anon, authenticated;
