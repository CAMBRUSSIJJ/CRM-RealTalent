#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PRODUCT="${1:-crm}"; shift || true
OBJECTIVE="${*:-Verifique se a aplicação está carregada sem erro visível.}"
case "$PRODUCT" in
  crm) URL="${REALTALENT_CRM_URL:-http://127.0.0.1:4188/}"; CDP="http://127.0.0.1:9223";;
  blue_ocean) URL="${BLUE_OCEAN_URL:-http://127.0.0.1:4173/}"; CDP="http://127.0.0.1:9224";;
  *) echo 'Use crm ou blue_ocean.' >&2; exit 2;;
esac
"$HERE/start-agent-background-linux.sh" >/dev/null
exec python3 "$HERE/browser_qa.py" --product "$PRODUCT" --base-url "$URL" --objective "$OBJECTIVE" --mode observe --cdp-url "$CDP"
