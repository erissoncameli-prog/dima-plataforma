-- Criar usuário voltou a funcionar: FK de usuario_senha_temporaria conferida no fim da transação.
--
-- Desde 20261010_seg_usuarios_acessos, fn_protege_campos_usuario roda também no INSERT de usuarios
-- (trigger BEFORE) e guarda o hash da senha temporária em usuario_senha_temporaria. No INSERT a linha
-- de usuarios ainda não existe quando o trigger grava, e a FK (usuario_id → usuarios.id) recusava:
--   insert or update on table "usuario_senha_temporaria" violates foreign key constraint
--   "usuario_senha_temporaria_usuario_id_fkey"
-- Toda criação de usuário pela tela (fn_criar_usuario) falhava; o reset de senha (UPDATE) não, porque a
-- linha já existe. Na produção ninguém criou usuário depois de 10/10/2026, por isso não apareceu.
--
-- Com a FK diferida, a conferência é feita no COMMIT, quando a linha de usuarios já foi gravada. A regra
-- não muda: senha temporária sem usuário continua impossível (o COMMIT falha). Sem DROP (ALTER CONSTRAINT).
alter table public.usuario_senha_temporaria
  alter constraint usuario_senha_temporaria_usuario_id_fkey deferrable initially deferred;
