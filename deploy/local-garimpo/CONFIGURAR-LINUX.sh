#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Instale Node.js 22.18 ou superior e execute este configurador novamente.' >&2
  exit 1
fi
exec node configurar-linux.mjs "$@"
