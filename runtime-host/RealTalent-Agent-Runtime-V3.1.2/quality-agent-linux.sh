#!/usr/bin/env bash
set -euo pipefail
BASE="${REALTALENT_AGENT_GATEWAY_URL:-http://127.0.0.1:8791}"
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cmd="${1:-status}"; shift || true
pretty(){ python3 -m json.tool; }
case "$cmd" in
  status) curl -fsS "$BASE/v3.1/quality" | pretty ;;
  inspect)
    prompt="${*:-}"; [[ -n "$prompt" ]] || { echo 'Uso: quality-agent-linux.sh inspect "pergunta"' >&2; exit 2; }
    python3 - "$BASE" "$prompt" <<'PY'
import json,sys,urllib.request
base,prompt=sys.argv[1:3]
data=json.dumps({'message':prompt,'product':'auto'}).encode()
r=urllib.request.Request(base+'/v3.1/quality/inspect',data=data,headers={'content-type':'application/json'},method='POST')
print(json.dumps(json.load(urllib.request.urlopen(r)),ensure_ascii=False,indent=2))
PY
    ;;
  selftest) exec node "$HERE/intelligence-quality-selftest.mjs" ;;
  memory-selftest) exec node "$HERE/memory-quality-selftest.mjs" ;;
  benchmark) exec node "$HERE/real-world-quality-benchmark.mjs" ;;
  calibration) exec "$HERE/model-calibration-linux.sh" "${1:-status}" "${@:2}" ;;
  rubric) cat "$HERE/HUMAN_EVALUATION_RUBRIC_V3.1.md" ;;
  *)
    cat <<HELP
RealTalent Agent V3.1.1 — Intelligence Quality + Model Calibration
Uso: ./quality-agent-linux.sh <comando>
  status                 resumo da camada de qualidade
  inspect "pergunta"      mostra estilo/contexto/tools/latência previstos
  selftest               testa Intelligence Quality
  memory-selftest        testa Semantic Memory/RAG 2.0
  benchmark              roda dataset real-world de 40 casos
  calibration ...        calibração de modelos V3.1.1
  rubric                 mostra rubric de avaliação humana
HELP
    ;;
esac
