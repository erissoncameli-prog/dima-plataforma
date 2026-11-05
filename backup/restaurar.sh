#!/usr/bin/env bash
# DIMA · restaura o backup em um Postgres local.
#
#   ./restaurar.sh                                 # Postgres do docker-compose (porta 5433)
#   PGHOST=localhost PGPORT=5432 ./restaurar.sh    # Postgres já instalado
#
# Variáveis: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
PGDATABASE="${PGDATABASE:-dima_local}"
export PGPASSWORD

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
run() { psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -q "$@"; }

aplica() { # <rótulo> <arquivo base>
  local rotulo="$1" base="$2"
  if   [ -f "$DIR/$base" ];    then echo "→ $rotulo"; run -f "$DIR/$base" > /dev/null
  elif [ -f "$DIR/$base.gz" ]; then echo "→ $rotulo (descompactando)"; gunzip -c "$DIR/$base.gz" | run -f - > /dev/null
  else echo "→ $rotulo — arquivo ausente, pulando"; return 1; fi
}

echo "→ Alvo: $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
echo "→ Recriando o banco $PGDATABASE"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS $PGDATABASE WITH (FORCE);" \
  -c "CREATE DATABASE $PGDATABASE;"

aplica "1/3 estrutura (01_schema.sql)"          01_schema.sql
aplica "2/3 dados (02_dados.sql)"               02_dados.sql || true
aplica "3/3 geodados (03_geodados.sql, ~50 MB)" 03_geodados.sql || true

echo
echo "→ Conferência:"
run -tAc "
select 'tabelas:  '||count(*) from pg_tables  where schemaname='public'
union all select 'views:    '||count(*) from pg_views   where schemaname='public'
union all select 'funcoes:  '||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p')
union all select 'policies: '||count(*) from pg_policies where schemaname='public'
union all select 'triggers: '||count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
union all select 'linhas:   '||coalesce(sum((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint),0)
  from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relkind='r';"
echo
echo "→ Esperado: 140 tabelas · 23 views · 325 funcoes · 254 policies · 141 triggers · 63183 linhas"
echo
echo "Conecte com:"
echo "  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE"
