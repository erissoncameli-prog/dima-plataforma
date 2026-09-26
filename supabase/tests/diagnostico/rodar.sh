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
         "$RAIZ"/supabase/migrations/20260926_diag_[0-9][0-9]_*.sql; do
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
echo "· teste cruzado das regras (js/diag-regras.js × SQL)"
DIR="$(cd "$(dirname "$0")" && pwd)"
node "$DIR/regras_cruzadas.js" gerar "$TMP/casos.jsonl"
# carrega linha a linha (sem \copy: o formato texto do COPY mexeria nas barras invertidas do JSON)
python3 - "$TMP/casos.jsonl" > "$TMP/casos.sql" <<'PY'
import sys
for l in open(sys.argv[1], encoding='utf-8'):
    l = l.strip()
    if l: print("insert into casos values ($j$" + l + "$j$::jsonb);")
PY
{ echo "create temp table casos (l jsonb);"; cat "$TMP/casos.sql";
  cat <<'SQL'
create function pg_temp.t_resultado(c jsonb) returns jsonb language plpgsql as $$
declare est jsonb := (select estrutura from public.diag_questionarios where codigo = 'DSA' and versao = 1);
        n jsonb;
begin
  n := public.fn_diag_normalizar_respostas(est, c->'resp', c->'mor');
  return jsonb_build_object('resp', n,
    'alertas', public.fn_diag_calcular_alertas(est, n, c->'mor', false, false),
    'apl', to_jsonb(public.fn_diag_aplicaveis(est, n)));
exception when others then
  return jsonb_build_object('erro', sqlerrm);
end $$;
select jsonb_build_object('id', l->'id', 'r', pg_temp.t_resultado(l))::text from casos order by (l->>'id')::int;
SQL
} | "${PSQL[@]}" -At > "$TMP/saida_sql.jsonl"
node "$DIR/regras_cruzadas.js" comparar "$TMP/casos.jsonl" "$TMP/saida_sql.jsonl"

echo "OK — todos os testes passaram"
