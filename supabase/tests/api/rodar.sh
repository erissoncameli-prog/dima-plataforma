#!/usr/bin/env bash
# Testa as migrações da API de dados e do pedido por e-mail num Postgres 16 LOCAL e descartável.
#   uso: supabase/tests/api/rodar.sh
# As funções de dados (fn_api_atividades/matriz/resumo) dependem do schema inteiro e são
# conferidas no banco real em transação desfeita; aqui o corpo delas não é validado.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$DIR/../../.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
TMP="$(mktemp -d)"; chmod 755 "$TMP"; chown postgres "$TMP"
PORTA=54332
trap 'su postgres -c "$BIN/pg_ctl -D $TMP/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

su postgres -c "$BIN/initdb -D $TMP/data -A trust -U postgres" >/dev/null
su postgres -c "$BIN/pg_ctl -D $TMP/data -o '-p $PORTA -k $TMP' -l $TMP/log -w start" >/dev/null

export PGOPTIONS="-c client_min_messages=warning -c check_function_bodies=off"
PSQL=(psql -h "$TMP" -p "$PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -o /dev/null)

"${PSQL[@]}" -f "$DIR/00_stub.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261031_api_dados.sql"
"${PSQL[@]}" -f "$RAIZ/supabase/migrations/20261101_api_pedidos_email.sql"
"${PSQL[@]}" -f "$DIR/10_testes_pedidos.sql"
echo "API: todos os testes passaram."
