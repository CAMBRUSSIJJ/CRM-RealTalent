#!/usr/bin/env bash
set -euo pipefail
BASE="${REALTALENT_AGENT_GATEWAY_URL:-http://127.0.0.1:8791}"
cmd="${1:-status}"; shift || true
case "$cmd" in
  status)
    curl -fsS "$BASE/health" | python3 -c 'import json,sys;x=json.load(sys.stdin);print(json.dumps(x.get("advancedReasoning",{}),ensure_ascii=False,indent=2))'
    ;;
  classify|plan)
    prompt="${*:-}"; [ -n "$prompt" ] || { echo 'Uso: reasoning-agent-linux.sh plan "compare..."' >&2; exit 2; }
    python3 - "$BASE" "$prompt" <<'PY2'
import json,sys,urllib.request
base,prompt=sys.argv[1:3]
data=json.dumps({'message':prompt,'product':'auto'}).encode()
r=urllib.request.Request(base+'/advanced-reasoning/classify',data=data,headers={'content-type':'application/json'},method='POST')
print(json.dumps(json.load(urllib.request.urlopen(r)),ensure_ascii=False,indent=2))
PY2
    ;;
  selftest) exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/advanced-reasoning-selftest.mjs" ;;
  *) echo 'Uso: reasoning-agent-linux.sh status | plan "..." | selftest' >&2; exit 2 ;;
esac
