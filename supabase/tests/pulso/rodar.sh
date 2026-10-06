#!/usr/bin/env bash
# Testa a migration do Pulso da Equipe num Postgres 16 LOCAL e descartável.
#   uso: supabase/tests/pulso/rodar.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$DIR/../../.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
TMP="$(mktemp -d)"; chmod 755 "$TMP"; chown postgres "$TMP"
PORTA=54331
trap 'su postgres -c "$BIN/pg_ctl -D $TMP/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

su postgres -c "$BIN/initdb -D $TMP/data -A trust -U postgres" >/dev/null
su postgres -c "$BIN/pg_ctl -D $TMP/data -o '-p $PORTA -k $TMP' -l $TMP/log -w start" >/dev/null

export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -h "$TMP" -p "$PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$DIR/00_stub.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261006_pulso_equipe.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261006_pulso_equipe_b_aparelho.sql"
# v1 (colunas fixas) roda antes da migração c e deixa respostas "legadas" para a cópia
"${PSQL[@]}" -f "$DIR/05_testes_v1.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261006_pulso_equipe_c_perguntas.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261006_pulso_equipe_c_ropa_sql_editor.sql"
"${PSQL[@]}" -f "$DIR/20_testes_perguntas.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261006_pulso_equipe_d_exportacao.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261006_pulso_equipe_d_ropa_sql_editor.sql"
"${PSQL[@]}" -f "$DIR/30_testes_exportacao.sql"
