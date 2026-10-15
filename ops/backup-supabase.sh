#!/usr/bin/env bash
set -euo pipefail
umask 077
DB_URL="${SUPABASE_DB_URL:-}"
OUT_DIR="${CR7_BACKUP_DIR:-./backups}"
if [[ -z "$DB_URL" ]]; then echo "BLOCKED: defina SUPABASE_DB_URL (connection string do banco)." >&2; exit 2; fi
if ! command -v pg_dump >/dev/null 2>&1; then echo "BLOCKED: pg_dump não encontrado." >&2; exit 2; fi
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/realtalent-${STAMP}.dump"
pg_dump "$DB_URL" --format=custom --no-owner --no-privileges --file="$OUT"
sha256sum "$OUT" > "$OUT.sha256"
chmod 600 "$OUT" "$OUT.sha256"
echo "PASS backup criado: $OUT"
echo "PASS checksum: $OUT.sha256"
