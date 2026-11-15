#!/usr/bin/env bash
set -Eeuo pipefail
PACKAGE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$PACKAGE_DIR/update-g8.mjs" "$@"
