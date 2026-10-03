#!/usr/bin/env bash
# Testa as migrations do remanejamento (rem_*) num Postgres 16 LOCAL e descartável.
# Nada aqui toca o Supabase de produção.
#   uso: supabase/tests/remanejamento/rodar.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
TMP="$(mktemp -d)"; chmod 755 "$TMP"; chown postgres "$TMP"
PORTA=54330
trap 'su postgres -c "$BIN/pg_ctl -D $TMP/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

su postgres -c "$BIN/initdb -D $TMP/data -A trust -U postgres" >/dev/null
su postgres -c "$BIN/pg_ctl -D $TMP/data -o '-p $PORTA -k $TMP' -l $TMP/log -w start" >/dev/null

export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -h "$TMP" -p "$PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$DIR/00_stub_supabase.sql"
"${PSQL[@]}" -f "$DIR/10_testes.sql"
