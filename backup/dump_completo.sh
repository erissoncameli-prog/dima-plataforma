#!/usr/bin/env bash
# DIMA · backup COMPLETO e oficial direto do Supabase, com pg_dump.
#
# Use este para a rotina. É superior aos .sql deste diretório porque leva
# também os schemas auth (usuários e senhas) e storage (metadados dos
# arquivos), que a API não expõe.
#
# Pré-requisitos:
#   - pg_dump 17+  (o servidor é PostgreSQL 17; um pg_dump 16 recusa)
#       macOS:  brew install postgresql@17
#       Ubuntu: sudo apt install postgresql-client-17
#       Docker: docker run --rm -i postgres:17 pg_dump ...
#   - Senha do banco: painel do Supabase → Project Settings → Database
set -euo pipefail

REF="wfymnmlinonvdqfucjya"
HOST="${HOST:-db.${REF}.supabase.co}"   # conexão direta (IPv6)
# Sem IPv6? Use o pooler (Session mode), no painel → Connect:
#   HOST=aws-0-sa-east-1.pooler.supabase.com PORT=5432 USER="postgres.${REF}" ./dump_completo.sh
PORT="${PORT:-5432}"
USER="${USER:-postgres}"
SAIDA="dima_backup_$(date +%Y%m%d_%H%M).dump"

read -rsp "Senha do banco Supabase: " PGPASSWORD; echo
export PGPASSWORD

echo "→ Gerando $SAIDA (formato custom, comprimido)"
pg_dump -h "$HOST" -p "$PORT" -U "$USER" -d postgres \
  --format=custom --compress=9 --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  --file="$SAIDA"

echo "→ Pronto: $(du -h "$SAIDA" | cut -f1)"
echo
echo "Restaurar num Postgres local:"
echo "  createdb -h localhost -p 5433 -U postgres dima_local"
echo "  pg_restore -h localhost -p 5433 -U postgres -d dima_local --no-owner --no-privileges $SAIDA"
