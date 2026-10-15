#!/usr/bin/env bash
set -euo pipefail
umask 077
DUMP="${1:-}"
DB_URL="${SUPABASE_DB_URL:-}"
CONFIRM="${CR7_ALLOW_RESTORE:-NO}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then echo "Uso: CR7_ALLOW_RESTORE=YES_I_UNDERSTAND SUPABASE_DB_URL=... npm run restore:production -- caminho.dump" >&2; exit 2; fi
if [[ "$CONFIRM" != "YES_I_UNDERSTAND" ]]; then echo "BLOCKED: restore é destrutivo. Defina CR7_ALLOW_RESTORE=YES_I_UNDERSTAND para prosseguir." >&2; exit 2; fi
if [[ -z "$DB_URL" ]]; then echo "BLOCKED: defina SUPABASE_DB_URL." >&2; exit 2; fi
if ! command -v pg_restore >/dev/null 2>&1; then echo "BLOCKED: pg_restore não encontrado." >&2; exit 2; fi
if [[ -f "$DUMP.sha256" ]]; then (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256") ; fi
pg_restore --dbname="$DB_URL" --clean --if-exists --no-owner --no-privileges "$DUMP"
echo "PASS restore concluído. Execute migrations:verify e CR7 production probe imediatamente."
