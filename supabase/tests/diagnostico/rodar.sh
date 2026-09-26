#!/usr/bin/env bash
# Testa as migrations do Diagnóstico num Postgres 16 LOCAL e descartável.
# Nada aqui toca o Supabase de produção.
#   uso: supabase/tests/diagnostico/rodar.sh
# Requer os binários do Postgres 16 (initdb/pg_ctl) e o usuário "postgres".
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
TMP="$(mktemp -d)"; chmod 755 "$TMP"; chown postgres "$TMP"
PORTA=54329
trap 'su postgres -c "$BIN/pg_ctl -D $TMP/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

su postgres -c "$BIN/initdb -D $TMP/data -A trust -U postgres" >/dev/null
su postgres -c "$BIN/pg_ctl -D $TMP/data -o '-p $PORTA -k $TMP' -l $TMP/log -w start" >/dev/null

export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -h "$TMP" -p "$PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$RAIZ/supabase/tests/diagnostico/00_stub_supabase.sql"
for f in "$RAIZ"/supabase/migrations/20260926_lgpd_tratamentos.sql \
         "$RAIZ"/supabase/migrations/20260926_diag_0*.sql; do
  echo "· aplicando $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
# idempotência: reaplicar não pode falhar nem duplicar
for f in "$RAIZ"/supabase/migrations/20260926_diag_05_questionario_v1.sql \
         "$RAIZ"/supabase/migrations/20260926_lgpd_tratamentos.sql; do
  "${PSQL[@]}" -f "$f"
done

echo "· rodando testes"
"${PSQL[@]}" -f "$RAIZ/supabase/tests/diagnostico/10_testes.sql"
echo "OK — todos os testes passaram"
