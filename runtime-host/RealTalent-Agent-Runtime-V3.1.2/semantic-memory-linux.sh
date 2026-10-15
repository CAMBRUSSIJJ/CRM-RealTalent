#!/usr/bin/env bash
set -euo pipefail
BASE="${REALTALENT_AGENT_URL:-http://127.0.0.1:8791}"
cmd="${1:-status}"
case "$cmd" in
  status) curl -fsS "$BASE/memory" | python3 -m json.tool ;;
  search)
    product="${2:-crm}"; shift 2 || true; q="$*"; python3 - "$BASE" "$product" "$q" <<'PY'
import json,sys,urllib.parse,urllib.request
b,p,q=sys.argv[1:];print(json.dumps(json.load(urllib.request.urlopen(b+'/memory/semantic/search?product='+urllib.parse.quote(p)+'&q='+urllib.parse.quote(q))),ensure_ascii=False,indent=2))
PY
    ;;
  add)
    product="${2:-crm}"; kind="${3:-decision}"; shift 3 || true; text="$*"; python3 - "$BASE" "$product" "$kind" "$text" <<'PY'
import json,sys,urllib.request
b,p,k,t=sys.argv[1:];d=json.dumps({'product':p,'kind':k,'text':t,'source':'explicit'},ensure_ascii=False).encode();r=urllib.request.Request(b+'/memory/semantic',data=d,headers={'Content-Type':'application/json'},method='POST');print(json.dumps(json.load(urllib.request.urlopen(r)),ensure_ascii=False,indent=2))
PY
    ;;
  reset)
    product="${2:-}"; python3 - "$BASE" "$product" <<'PY'
import json,sys,urllib.request
b,p=sys.argv[1:];d=json.dumps({'product':p or None}).encode();r=urllib.request.Request(b+'/memory/semantic/reset',data=d,headers={'Content-Type':'application/json'},method='POST');print(json.dumps(json.load(urllib.request.urlopen(r)),ensure_ascii=False,indent=2))
PY
    ;;
  *) echo 'Uso: semantic-memory-linux.sh [status|search <produto> <consulta>|add <produto> <kind> <texto>|reset [produto]]' >&2; exit 2 ;;
esac
