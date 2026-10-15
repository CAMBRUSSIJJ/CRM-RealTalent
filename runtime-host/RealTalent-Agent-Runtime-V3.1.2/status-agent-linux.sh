#!/usr/bin/env bash
set -euo pipefail
if curl -fsS http://127.0.0.1:8791/health; then
  echo
  exit 0
fi
echo 'RealTalent Agent indisponível em 127.0.0.1:8791.' >&2
exit 1
