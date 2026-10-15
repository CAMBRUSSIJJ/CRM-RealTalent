#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
"$HERE/start-agent-background-linux.sh" >/dev/null
URL="http://127.0.0.1:8791/chat"
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 & else echo "$URL"; fi
echo "RealTalent Agent: $URL"
