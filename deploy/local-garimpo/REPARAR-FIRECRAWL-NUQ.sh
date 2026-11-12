#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
DB=realtalent-garimpo-nuq-postgres-1
API=realtalent-garimpo-api-1
REV=603d3ec4a7f7ef7e0b1c3e5c8ec5a514bca8e1b7
SQL_BLOB=d20080e37be9b4ad30828c8ddd8049b0e1328829

for tool in docker curl git awk; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Falta o programa: $tool"; exit 1; }
done
getenv() {
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1" | awk -F= -v k="$2" '$1 == k {sub(/^[^=]*=/, ""); print; exit}'
}
DB_NAME="$(getenv "$DB" POSTGRES_DB)"; DB_NAME="${DB_NAME:-postgres}"
API_DB="$(getenv "$API" POSTGRES_DB)"; API_DB="${API_DB:-postgres}"
API_HOST="$(getenv "$API" POSTGRES_HOST)"; API_HOST="${API_HOST:-nuq-postgres}"
DB_USER="$(getenv "$DB" POSTGRES_USER)"; DB_USER="${DB_USER:-postgres}"
API_USER="$(getenv "$API" POSTGRES_USER)"; API_USER="${API_USER:-postgres}"
if [[ "$API_DB" != "$DB_NAME" || "$API_USER" != "$DB_USER" || "$API_HOST" != nuq-postgres ]]; then
  echo "Configuração de banco divergente. Parando sem alterar nada."
  echo "Banco da API: $API_DB; banco do PostgreSQL: $DB_NAME; host da API: $API_HOST"
  exit 1
fi
# Runs within the Postgres container; does not print passwords or tokens.
psql_nuq() {
  docker exec -i "$DB" sh -c 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}"' 
}
TABLES="$(printf 'SELECT count(*) FROM pg_tables WHERE schemaname = '\''nuq'\'';\n' | psql_nuq | tr -d '[:space:]')"
if [[ "$TABLES" == 4 ]]; then
  echo 'As quatro tabelas NUQ já existem. Verifique a conexão da API antes de migrar.'
  exit 0
fi
if [[ "$TABLES" != 0 ]]; then
  echo "Esquema NUQ parcial ($TABLES tabelas). Não vou aplicar mudanças automaticamente."
  exit 1
fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
URL="https://raw.githubusercontent.com/firecrawl/firecrawl/$REV/apps/nuq-postgres/nuq.sql"
echo 'Baixando esquema oficial da revisão fixada...'
curl --fail --location --silent --show-error --connect-timeout 15 --max-time 90 "$URL" -o "$TMP/nuq.sql"
[[ "$(git hash-object "$TMP/nuq.sql")" == "$SQL_BLOB" ]] || { echo 'Esquema recebido não corresponde à revisão fixada. Abortado.'; exit 1; }
# Avoid upstream 16GB WAL / aggressive checkpoint changes on this 7GB machine.
awk '!/^[[:space:]]*ALTER SYSTEM SET / && !/^[[:space:]]*SELECT pg_reload_conf\(\);/' "$TMP/nuq.sql" > "$TMP/nuq-safe.sql"
BACKUPS="$HOME/Downloads/Backups-Garimpo"; mkdir -p "$BACKUPS"; chmod 700 "$BACKUPS"
BACKUP="$BACKUPS/nuq-antes-$(date +%Y%m%d-%H%M%S).dump"
echo 'Fazendo backup do PostgreSQL antes da correção...'
if ! docker exec "$DB" sh -c 'exec pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" --format=custom --no-owner --no-acl' > "$BACKUP"; then
  rm -f "$BACKUP"; echo 'Backup falhou; nada foi modificado.'; exit 1
fi
chmod 600 "$BACKUP"
echo "Backup preservado em: $BACKUP"
echo 'Criando as filas NUQ pelo SQL oficial (sem alterar configurações de memória/WAL)...'
# Transaction all-or-nothing: no partial tables on SQL error.
docker exec -i "$DB" sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -f -' < "$TMP/nuq-safe.sql"
printf "SELECT to_regclass('nuq.queue_scrape'), to_regclass('nuq.queue_crawl_finished');\n" | psql_nuq
echo 'Iniciando somente a API Firecrawl...'
docker start "$API" >/dev/null
sleep 12
docker ps -a --filter "name=$API" --format 'table {{.Names}}\t{{.Status}}'
curl --max-time 12 -s -o /dev/null -w 'Firecrawl HTTP: %{http_code}\n' http://127.0.0.1:3002/ || true
