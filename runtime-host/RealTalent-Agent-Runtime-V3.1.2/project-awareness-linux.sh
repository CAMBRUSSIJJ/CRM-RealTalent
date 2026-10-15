#!/usr/bin/env bash
set -euo pipefail
BASE="${REALTALENT_AGENT_URL:-http://127.0.0.1:8791}"
cmd="${1:-status}"; shift || true
json(){ python3 -m json.tool; }
case "$cmd" in
  status) curl -fsS "$BASE/project-awareness/status" | json ;;
  index) product="${1:-all}"; curl -fsS -X POST "$BASE/project-awareness/index" -H 'content-type: application/json' -d "{\"product\":\"$product\"}" | json ;;
  sync) product="${1:-all}"; curl -fsS -X POST "$BASE/project-brain/sync" -H 'content-type: application/json' -d "{\"product\":\"$product\"}" | json ;;
  graph) product="${1:-crm}"; type="${2:-architecture}"; python3 - "$BASE" "$product" "$type" <<'PY'
import sys,urllib.parse,urllib.request,json
base,product,kind=sys.argv[1:]
url=base+'/project-brain/graph?'+urllib.parse.urlencode({'product':product,'type':kind,'limit':200})
with urllib.request.urlopen(url) as r: print(json.dumps(json.load(r),ensure_ascii=False,indent=2))
PY
    ;;
  search) product="${1:-crm}"; shift || true; q="$*"; [[ -n "$q" ]] || { echo 'Uso: project-awareness-linux.sh search <crm|blue_ocean> <consulta>' >&2; exit 2; }; python3 - "$BASE" "$product" "$q" <<'PY'
import sys,urllib.parse,urllib.request,json
base,product,q=sys.argv[1:]
with urllib.request.urlopen(base+'/project-awareness/search?'+urllib.parse.urlencode({'product':product,'q':q,'limit':10})) as r: print(json.dumps(json.load(r),ensure_ascii=False,indent=2))
PY
    ;;
  health) product="${1:-crm}"; curl -fsS "$BASE/project-awareness/health?product=$product" | json ;;
  impact) product="${1:-crm}"; target="${2:-}"; [[ -n "$target" ]] || { echo 'Uso: project-awareness-linux.sh impact <crm|blue_ocean> <arquivo|símbolo|módulo>' >&2; exit 2; }; python3 - "$BASE" "$product" "$target" <<'PY'
import sys,urllib.request,json
base,product,target=sys.argv[1:]
data=json.dumps({'product':product,'target':target,'depth':2}).encode();req=urllib.request.Request(base+'/project-awareness/impact',data=data,headers={'content-type':'application/json'},method='POST')
with urllib.request.urlopen(req) as r: print(json.dumps(json.load(r),ensure_ascii=False,indent=2))
PY
    ;;
  root-cause) product="${1:-crm}"; shift || true; symptom="$*"; [[ -n "$symptom" ]] || { echo 'Uso: project-awareness-linux.sh root-cause <crm|blue_ocean> <sintoma>' >&2; exit 2; }; python3 - "$BASE" "$product" "$symptom" <<'PY'
import sys,urllib.request,json
base,product,symptom=sys.argv[1:]
data=json.dumps({'product':product,'symptom':symptom}).encode();req=urllib.request.Request(base+'/project-awareness/root-cause',data=data,headers={'content-type':'application/json'},method='POST')
with urllib.request.urlopen(req) as r: print(json.dumps(json.load(r),ensure_ascii=False,indent=2))
PY
    ;;
  history) curl -fsS "$BASE/project-awareness/history" | json ;;
  *) echo 'Project Brain V1.9 — comandos: status | sync [all|crm|blue_ocean] | index [all|crm|blue_ocean] | graph <produto> <architecture|routes|data|ui|supabase|features|history> | search <produto> <consulta> | health <produto> | impact <produto> <target> | root-cause <produto> <sintoma> | history' >&2; exit 2 ;;
esac
