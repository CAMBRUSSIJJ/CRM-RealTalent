#!/usr/bin/env bash
set -euo pipefail
BASE="${REALTALENT_AGENT_GATEWAY_URL:-http://127.0.0.1:8791}"
cmd="${1:-status}"; shift || true
json(){ python3 -m json.tool; }
case "$cmd" in
  status|list) curl -fsS "$BASE/execution" | json ;;
  show)
    id="${1:-}"; [ -n "$id" ] || { echo 'Uso: execution-agent-linux.sh show <plan-id>' >&2; exit 2; }
    curl -fsS "$BASE/execution/plans/$id" | json ;;
  confirm)
    id="${1:-}"; [ -n "$id" ] || { echo 'Uso: execution-agent-linux.sh confirm <plan-id>' >&2; exit 2; }
    curl -fsS -X POST -H 'content-type: application/json' -d '{"stepIds":"all","note":"confirmado via CLI"}' "$BASE/execution/plans/$id/confirm" | json ;;
  run|execute)
    id="${1:-}"; [ -n "$id" ] || { echo 'Uso: execution-agent-linux.sh run <plan-id>' >&2; exit 2; }
    curl -fsS -X POST -H 'content-type: application/json' -d '{}' "$BASE/execution/plans/$id/execute" | json ;;
  verify)
    id="${1:-}"; [ -n "$id" ] || { echo 'Uso: execution-agent-linux.sh verify <plan-id>' >&2; exit 2; }
    curl -fsS -X POST -H 'content-type: application/json' -d '{}' "$BASE/execution/plans/$id/verify" | json ;;
  rollback)
    id="${1:-}"; [ -n "$id" ] || { echo 'Uso: execution-agent-linux.sh rollback <plan-id>' >&2; exit 2; }
    curl -fsS -X POST -H 'content-type: application/json' -d '{}' "$BASE/execution/plans/$id/rollback-preview" | json ;;
  cancel)
    id="${1:-}"; shift || true; reason="${*:-cancelado via CLI}"; [ -n "$id" ] || { echo 'Uso: execution-agent-linux.sh cancel <plan-id> [motivo]' >&2; exit 2; }
    python3 - "$BASE" "$id" "$reason" <<'PY2'
import json,sys,urllib.request
base,id,reason=sys.argv[1:4]
r=urllib.request.Request(f'{base}/execution/plans/{id}/cancel',data=json.dumps({'reason':reason}).encode(),headers={'content-type':'application/json'},method='POST')
print(json.dumps(json.load(urllib.request.urlopen(r)),ensure_ascii=False,indent=2))
PY2
    ;;
  selftest) exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/execution-intelligence-selftest.mjs" ;;
  *) echo 'Uso: execution-agent-linux.sh status|list|show|confirm|run|verify|rollback|cancel|selftest' >&2; exit 2 ;;
esac
