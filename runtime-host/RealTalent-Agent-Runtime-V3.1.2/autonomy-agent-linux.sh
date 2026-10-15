#!/usr/bin/env bash
set -euo pipefail
BASE="${REALTALENT_AGENT_GATEWAY_URL:-http://127.0.0.1:8791}"
cmd="${1:-status}"; shift || true
json(){ python3 -m json.tool; }
post(){ local url="$1" body="${2:-{}}"; curl -fsS -X POST -H 'content-type: application/json' -d "$body" "$BASE$url" | json; }
case "$cmd" in
  status|list) curl -fsS "$BASE/autonomy" | json ;;
  show) id="${1:-}"; [ -n "$id" ] || { echo 'Uso: autonomy-agent-linux.sh show <run-id>' >&2; exit 2; }; curl -fsS "$BASE/autonomy/runs/$id" | json ;;
  advance|avancar) id="${1:-}"; [ -n "$id" ] || exit 2; post "/autonomy/runs/$id/advance" '{}' ;;
  heartbeat) id="${1:-}"; [ -n "$id" ] || exit 2; post "/autonomy/runs/$id/heartbeat" '{}' ;;
  pause|pausar) id="${1:-}"; [ -n "$id" ] || exit 2; post "/autonomy/runs/$id/pause" '{"reason":"pausado via CLI"}' ;;
  resume|retomar) id="${1:-}"; [ -n "$id" ] || exit 2; post "/autonomy/runs/$id/resume" '{}' ;;
  recover|recuperar) id="${1:-}"; [ -n "$id" ] || exit 2; post "/autonomy/runs/$id/recover" '{}' ;;
  cancel|cancelar) id="${1:-}"; [ -n "$id" ] || exit 2; post "/autonomy/runs/$id/cancel" '{"reason":"cancelado via CLI"}' ;;
  approve|aprovar) id="${1:-}"; cp="${2:-}"; [ -n "$id" ]&&[ -n "$cp" ] || { echo 'Uso: ... approve <run-id> <checkpoint-id>' >&2; exit 2; }; post "/autonomy/runs/$id/checkpoints/$cp/approve" '{"actor":"cli","note":"aprovado via CLI"}' ;;
  complete|concluir) id="${1:-}"; st="${2:-}"; [ -n "$id" ]&&[ -n "$st" ] || { echo 'Uso: ... complete <run-id> <stage-id>' >&2; exit 2; }; post "/autonomy/runs/$id/stages/$st/complete" '{"ok":true,"evidence":["concluído via CLI"]}' ;;
  selftest) exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/long-horizon-intelligence-selftest.mjs" ;;
  *) echo 'Uso: autonomy-agent-linux.sh status|show|advance|heartbeat|pause|resume|recover|cancel|approve|complete|selftest' >&2; exit 2 ;;
esac
