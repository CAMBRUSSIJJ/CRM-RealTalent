#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Este configurador foi unificado na V101.0."
exec "$ROOT/configure-google-maps.sh"
