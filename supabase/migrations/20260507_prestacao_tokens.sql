-- Tokens de acesso para upload público de prestação de contas via magic link
CREATE TABLE IF NOT EXISTS prestacao_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text        UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  viajante_id uuid        NOT NULL REFERENCES viagem_viajantes(id) ON DELETE CASCADE,
  protocolo_id uuid       NOT NULL REFERENCES viagem_protocolos(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  usado_em    timestamptz,
  criado_em   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prestacao_tokens_token_idx      ON prestacao_tokens(token);
CREATE INDEX IF NOT EXISTS prestacao_tokens_viajante_idx   ON prestacao_tokens(viajante_id);

-- Somente funções Edge com service role acessam esta tabela
ALTER TABLE prestacao_tokens ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy pública — acesso exclusivo via service_role key
