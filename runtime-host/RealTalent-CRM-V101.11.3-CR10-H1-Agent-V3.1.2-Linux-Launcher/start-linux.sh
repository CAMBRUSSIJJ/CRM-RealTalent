#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# RealTalent CRM V101.11.3-CR1 — Build & Dependency Closure
# O comportamento de runtime vive em scripts/start.mjs.
# O launcher anterior permanece disponível em start-linux-legacy.sh.
if [ "${1:-}" = "--legacy" ]; then
  shift
  exec "$ROOT/start-linux-legacy.sh" "$@"
fi

exec node "$ROOT/scripts/start.mjs" "$@"
