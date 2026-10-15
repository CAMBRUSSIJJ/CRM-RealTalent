#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BRANCH="preview/v3.5-h1-semantic-agent"
AGENT_URL="http://127.0.0.1:8791"
CRM_URL="http://127.0.0.1:4188"
MATRIX_FILE="src/services/realtalent-ollama-crm-matrix.integration.test.ts"
LAUNCH_LOG="$ROOT/.realtalent-total.log"

say() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }

wait_http() {
  local url="$1"; local label="$2"; local attempts="${3:-240}"
  for ((i=1; i<=attempts; i++)); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  fail "$label não ficou pronto em $url. Veja $LAUNCH_LOG"
}

stop_realtalent_port() {
  local port="$1"
  local pids=""
  if command -v fuser >/dev/null 2>&1; then
    pids="$(fuser -n tcp "$port" 2>/dev/null | tr -cd '0-9 \n' || true)"
  elif command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  else
    return 0
  fi
  [ -n "$pids" ] || return 0
  for pid in $pids; do
    local cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    case "$cmd" in
      *RealTalent*|*realtalent*|*vite*4188*|*gateway-ollama*|*.gateway-ollama-runtime.generated.mjs*) echo "↻ Encerrando instância antiga na porta $port (PID $pid)"; kill "$pid" 2>/dev/null || true ;;
      *) fail "A porta $port está ocupada por outro programa: $cmd" ;;
    esac
  done
}

say "RealTalent CRM — Universal Control com Ollama"
command -v git >/dev/null 2>&1 || fail "git não está instalado."
command -v curl >/dev/null 2>&1 || fail "curl não está instalado."
command -v npm >/dev/null 2>&1 || fail "npm não está instalado."

say "1/8 — Sincronizando a versão universal"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "✓ Commit $(git rev-parse --short HEAD)"

say "2/8 — Habilitando Universal CRM Control"
node scripts/enable-universal-agent.mjs
grep -q "realtalent-crm-universal-executor" src/features/assistant/assistant-drawer.tsx || fail "O Assistant não foi ligado ao executor universal."
grep -q "realtalent-crm-universal-registry" src/services/realtalent-crm-capability-runtime-client.ts || fail "O planner não foi ligado ao catálogo universal."
echo "✓ Planner, Assistant, catálogo e executor universal ligados"

say "3/8 — Encerrando somente instâncias antigas do RealTalent"
stop_realtalent_port 4188
stop_realtalent_port 8791
sleep 2

say "4/8 — Subindo Ollama + Agent + gates + CRM"
chmod +x start-ollama-local.sh
REALTALENT_NO_AUTO_OPEN=1 ./start-ollama-local.sh > >(tee "$LAUNCH_LOG") 2>&1 &
MAIN_PID=$!

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if [[ $code -ne 0 ]] && kill -0 "$MAIN_PID" 2>/dev/null; then kill "$MAIN_PID" 2>/dev/null || true; fi
  exit "$code"
}
trap cleanup EXIT INT TERM

for ((i=1; i<=360; i++)); do
  if curl -fsS --max-time 2 "$CRM_URL" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$MAIN_PID" 2>/dev/null; then wait "$MAIN_PID" || true; fail "O launcher principal encerrou antes do CRM ficar pronto. Veja $LAUNCH_LOG"; fi
  sleep 1
  if [[ $i -eq 360 ]]; then fail "CRM não ficou pronto a tempo. Veja $LAUNCH_LOG"; fi
done
wait_http "$AGENT_URL/health" "RealTalent Agent" 60

echo "✓ Agent online"
echo "✓ CRM online"

say "5/8 — Auditando cobertura + execução + readback universal"
npx vitest run \
  src/services/realtalent-crm-capability-coverage.test.ts \
  src/services/realtalent-crm-universal-audit.test.ts \
  src/services/realtalent-crm-universal-readback.test.ts \
  src/services/realtalent-assistant-provider-routing.test.ts

echo "✓ Superfície operacional, executores e Execution Truth auditados"

say "6/8 — Validando o mesmo caminho usado pelo navegador"
CORS_HEADERS="$(mktemp)"
curl -sS -D "$CORS_HEADERS" -o /dev/null -X OPTIONS \
  -H 'Origin: http://127.0.0.1:4188' \
  -H 'Access-Control-Request-Method: POST' \
  "$AGENT_URL/capabilities/plan"
grep -qi '^access-control-allow-origin: http://127.0.0.1:4188' "$CORS_HEADERS" || { cat "$CORS_HEADERS"; rm -f "$CORS_HEADERS"; fail "O navegador do CRM não está autorizado a acessar o Agent."; }
rm -f "$CORS_HEADERS"
echo "✓ Browser 4188 → Agent 8791 autorizado"

say "7/8 — Rodando matriz semântica UNIVERSAL do Ollama"
if [[ -f "$MATRIX_FILE" ]]; then
  REALTALENT_OLLAMA_MATRIX=1 REALTALENT_AGENT_TEST_URL="$AGENT_URL" npx vitest run "$MATRIX_FILE"
  echo "✓ Matriz semântica universal aprovada"
else
  echo "△ Matriz universal não está presente nesta revisão."
fi

say "8/8 — Abrindo RealTalent CRM"
echo "✓ Ollama online"
echo "✓ Agent Universal online"
echo "✓ Catálogo universal auditado"
echo "✓ Execução + persistência/readback verificadas estruturalmente"
echo "✓ CRM: $CRM_URL/#/goals"
echo
echo "Tudo é mantido por este único terminal. Para encerrar, pressione Ctrl+C."

if command -v xdg-open >/dev/null 2>&1; then xdg-open "$CRM_URL/#/goals" >/dev/null 2>&1 || true; fi
wait "$MAIN_PID"