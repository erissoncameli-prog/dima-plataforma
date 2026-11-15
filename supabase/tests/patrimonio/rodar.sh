#!/usr/bin/env bash
# Testa as migrações do Patrimônio (pat_*) num Postgres 16 LOCAL e descartável.
# Nada aqui toca o Supabase de produção.
#   uso: supabase/tests/patrimonio/rodar.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$DIR/../../.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
TMP="$(mktemp -d)"; chmod 755 "$TMP"; chown postgres "$TMP"
PORTA=54334
trap 'su postgres -c "$BIN/pg_ctl -D $TMP/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

su postgres -c "$BIN/initdb -D $TMP/data -A trust -U postgres" >/dev/null
su postgres -c "$BIN/pg_ctl -D $TMP/data -o '-p $PORTA -k $TMP' -l $TMP/log -w start" >/dev/null

export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -h "$TMP" -p "$PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -o /dev/null)

"${PSQL[@]}" -f "$DIR/00_stub.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261115_pat_01_cadastro.sql"
"${PSQL[@]}" -f "$DIR/10_testes.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261116_pat_02_guarda.sql"
"${PSQL[@]}" -f "$DIR/30_guarda.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261117_pat_03_ocorrencias.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261117_pat_03_ropa.sql"
"${PSQL[@]}" -f "$DIR/40_ocorrencias.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261118_pat_04_inventario.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261118_pat_04_ropa.sql"
"${PSQL[@]}" -f "$DIR/50_inventario.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261119_pat_05_relatorios_auditor.sql"
"${PSQL[@]}" -f "$DIR/60_relatorios_auditor.sql"
