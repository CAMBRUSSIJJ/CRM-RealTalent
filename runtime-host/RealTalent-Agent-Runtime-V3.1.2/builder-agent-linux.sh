#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PRODUCT="${1:-}"; WORKSPACE="${2:-}"
[[ "$PRODUCT" == "crm" || "$PRODUCT" == "blue_ocean" ]] || { echo 'Uso: builder-agent-linux.sh <crm|blue_ocean> <workspace> [--apply] [--no-browser-qa] "objetivo"' >&2; exit 2; }
[[ -d "$WORKSPACE" ]] || { echo "Workspace não encontrado: $WORKSPACE" >&2; exit 2; }
shift 2
FLAGS=()
while [[ $# -gt 0 && "${1:-}" == --* ]]; do
  case "$1" in
    --apply|--yes|--no-browser-qa) FLAGS+=("$1"); shift ;;
    *) echo "Opção não permitida no wrapper: $1" >&2; exit 2 ;;
  esac
done
OBJECTIVE="$*"
[[ -n "${OBJECTIVE// /}" ]] || { echo 'Informe o objetivo do Builder.' >&2; exit 2; }
"$HERE/start-agent-background-linux.sh"
exec python3 "$HERE/builder_agent.py" --product "$PRODUCT" --workspace "$WORKSPACE" --objective "$OBJECTIVE" "${FLAGS[@]}"
