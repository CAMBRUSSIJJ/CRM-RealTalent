#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
"$HERE/start-agent-background-linux.sh" >/dev/null
URL="http://127.0.0.1:${REALTALENT_AGENT_PORT:-8791}/qa"
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 & else echo "$URL"; fi
