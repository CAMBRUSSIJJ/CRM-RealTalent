#!/usr/bin/env bash
set -euo pipefail
BASE="${REALTALENT_AGENT_GATEWAY_URL:-http://127.0.0.1:8791}"
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cmd="${1:-status}"; shift || true
pretty(){ python3 -m json.tool; }
post(){ curl -fsS -H 'content-type: application/json' -X POST "$1" -d "${2:-{}}"; }
case "$cmd" in
  status) curl -fsS "$BASE/learning" | pretty ;;
  run) post "$BASE/learning/regression/run" '{}' | pretty ;;
  replay) REALTALENT_AGENT_GATEWAY_URL="$BASE" exec node "$HERE/learning-regression-benchmark.mjs" "$@" ;;
  accept) post "$BASE/learning/regression/baseline/accept" '{}' | pretty ;;
  gate)
    curl -fsS "$BASE/learning" | python3 -c 'import json,sys; x=json.load(sys.stdin)["learning"]["regression"]["gate"]; print(json.dumps(x,indent=2,ensure_ascii=False)); raise SystemExit(0 if x.get("pass") else 1)'
    ;;
  failures)
    curl -fsS "$BASE/learning" | python3 -c 'import json,sys; x=json.load(sys.stdin)["learning"]; print(json.dumps({"summary":x.get("failureMemory"),"failures":x.get("failures",[])},indent=2,ensure_ascii=False))'
    ;;
  cases)
    curl -fsS "$BASE/learning" | python3 -c 'import json,sys; x=json.load(sys.stdin)["learning"]; print(json.dumps({"dataset":x.get("dataset"),"cases":x.get("cases",[])},indent=2,ensure_ascii=False))'
    ;;
  resolve)
    id="${1:-}"; [[ -n "$id" ]] || { echo "Uso: $0 resolve <failure-id> [nota]" >&2; exit 2; }; shift || true
    note="${*:-corrigida e verificada}"
    payload="$(python3 -c 'import json,sys; print(json.dumps({"resolution":sys.argv[1]}))' "$note")"
    post "$BASE/learning/failures/${id}/resolve" "$payload" | pretty
    ;;
  selftest) exec node "$HERE/learning-evaluation-selftest.mjs" ;;
  *)
    cat <<HELP
RealTalent Agent V2.6 — Learning & Evaluation
Uso: ./learning-agent-linux.sh <comando>
  status            estado de Failure Memory + dataset + gate
  run               dispara replay das falhas conhecidas no gateway
  replay            executa replay síncrono no terminal
  gate              retorna PASS/BLOCKED (exit code 0/1)
  accept            aceita explicitamente o último baseline V2.6
  failures          lista falhas registradas
  cases             lista dataset de regressão
  resolve ID [nota] marca uma falha como corrigida
  selftest          testa o núcleo Learning & Evaluation
HELP
    ;;
esac
