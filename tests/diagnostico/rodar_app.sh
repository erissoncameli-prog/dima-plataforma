#!/usr/bin/env bash
# Teste de ponta a ponta do app de campo do Diagnóstico:
#   Chromium (Playwright) abre pages/diagnostico-app.html de verdade, e as
#   chamadas ao Supabase que importam para o contrato (diag_enviar_ficha,
#   leitura do questionário, sugestões) vão para um Postgres 16 LOCAL com as
#   migrations reais (mesmo stub de supabase/tests/diagnostico).
# Nada aqui toca o Supabase de produção.
#   uso: tests/diagnostico/rodar_app.sh
# Requer: Postgres 16 (initdb/pg_ctl), python3, node e o pacote "playwright"
# (NODE_PATH apontando para um node_modules com ele) + Chromium em /opt/pw-browsers.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
TMP="$(mktemp -d)"; chmod 755 "$TMP"; chown postgres "$TMP"
PORTA_PG=54331; PORTA_HTTP=5511
cleanup() {
  [ -n "${HTTP_PID:-}" ] && kill "$HTTP_PID" 2>/dev/null || true
  su postgres -c "$BIN/pg_ctl -D $TMP/data -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

su postgres -c "$BIN/initdb -D $TMP/data -A trust -U postgres" >/dev/null
su postgres -c "$BIN/pg_ctl -D $TMP/data -o '-p $PORTA_PG -k $TMP' -l $TMP/log -w start" >/dev/null
export PGHOST="$TMP" PGPORT="$PORTA_PG" PGUSER=postgres PGDATABASE=postgres PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$RAIZ/supabase/tests/diagnostico/00_stub_supabase.sql"
for f in "$RAIZ"/supabase/migrations/20260926_lgpd_tratamentos.sql "$RAIZ"/supabase/migrations/20260926_diag_[0-9][0-9]_*.sql; do
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" <<'SQL'
insert into public.usuarios (id, nome_completo, email, perfil, ativo) values
 ('00000000-0000-0000-0000-0000000000e1','Técnica de Campo','tec@x','tecnico',true);
insert into public.usuario_permissoes (usuario_id, modulo, valido_de, valido_ate)
 values ('00000000-0000-0000-0000-0000000000e1','diagnostico', now()-interval '1 day', now()+interval '60 days');
-- coordenação: uma com "modo treino", outra sem (só entra a primeira, e só em treino)
insert into public.usuarios (id, nome_completo, email, perfil, ativo) values
 ('00000000-0000-0000-0000-0000000000c1','Coordenadora Treino','coord@x','coordenacao',true),
 ('00000000-0000-0000-0000-0000000000c2','Coordenadora Sem Treino','coord2@x','coordenacao',true);
insert into public.usuario_permissoes (usuario_id, modulo, valido_de, valido_ate) values
 ('00000000-0000-0000-0000-0000000000c1','diagnostico', now()-interval '1 day', null),
 ('00000000-0000-0000-0000-0000000000c1','diagnostico_treino', now()-interval '1 day', now()+interval '30 days'),
 ('00000000-0000-0000-0000-0000000000c2','diagnostico', now()-interval '1 day', null);
-- como em produção: v1 publicada e depois arquivada; v2 (escolaridade fechada) publicada
update public.diag_questionarios set status = 'publicado' where codigo = 'DSA' and versao in (1, 2);
update public.diag_questionarios set status = 'arquivado' where codigo = 'DSA' and versao = 1;
insert into public.diag_comunidades (id, municipio_ibge, nome)
 values ('11111111-1111-1111-1111-111111111111', 1200708, 'Seringal Cachoeira');
insert into public.diag_localidades (id, comunidade_id, nome)
 values ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Colocação Rio Branco');
SQL

(cd "$RAIZ" && python3 -m http.server "$PORTA_HTTP" --bind 127.0.0.1 >/dev/null 2>&1) & HTTP_PID=$!
sleep 1
BASE="http://127.0.0.1:$PORTA_HTTP" node "$RAIZ/tests/diagnostico/app_fluxo.js"
