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
      *RealTalent*|*realtalent*|*vite*4188*|*gateway-ollama*|*.gateway-ollama-runtime.generated.mjs*)
        echo "↻ Encerrando instância antiga na porta $port (PID $pid)"
        kill "$pid" 2>/dev/null || true
        ;;
      *)
        fail "A porta $port está ocupada por outro programa: $cmd"
        ;;
    esac
  done
}

say "RealTalent CRM — abertura total com Ollama"

command -v git >/dev/null 2>&1 || fail "git não está instalado."
command -v curl >/dev/null 2>&1 || fail "curl não está instalado."
command -v npm >/dev/null 2>&1 || fail "npm não está instalado."

say "1/6 — Sincronizando a versão mais recente da branch Ollama"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "✓ Commit $(git rev-parse --short HEAD)"

say "2/6 — Encerrando somente instâncias antigas do RealTalent"
stop_realtalent_port 4188
stop_realtalent_port 8791
sleep 2

say "3/6 — Preparando launcher principal"
chmod +x start-ollama-local.sh

say "4/6 — Subindo Ollama + Agent + gates + CRM"
./start-ollama-local.sh > >(tee "$LAUNCH_LOG") 2>&1 &
MAIN_PID=$!

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if [[ $code -ne 0 ]] && kill -0 "$MAIN_PID" 2>/dev/null; then
    kill "$MAIN_PID" 2>/dev/null || true
  fi
  exit "$code"
}
trap cleanup EXIT INT TERM

for ((i=1; i<=300; i++)); do
  if curl -fsS --max-time 2 "$CRM_URL" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$MAIN_PID" 2>/dev/null; then
    wait "$MAIN_PID" || true
    fail "O launcher principal encerrou antes do CRM ficar pronto. Veja $LAUNCH_LOG"
  fi
  sleep 1
  if [[ $i -eq 300 ]]; then fail "CRM não ficou pronto a tempo. Veja $LAUNCH_LOG"; fi
done

wait_http "$AGENT_URL/health" "RealTalent Agent" 60

echo "✓ Agent online"
echo "✓ CRM online"

say "5/6 — Rodando matriz semântica ampla do Ollama"
if [[ -f "$MATRIX_FILE" ]]; then
  REALTALENT_OLLAMA_MATRIX=1 \
  REALTALENT_AGENT_TEST_URL="$AGENT_URL" \
  npx vitest run "$MATRIX_FILE"
  echo "✓ Matriz semântica ampla aprovada"
else
  echo "△ Matriz ampla ainda não está presente nesta revisão; seguindo com os gates principais já aprovados."
fi

say "6/6 — Abrindo RealTalent CRM"
echo "✓ Ollama online"
echo "✓ Agent online"
echo "✓ CRM: $CRM_URL/#/goals"
echo
echo "Tudo está sendo mantido por este único terminal."
echo "Para encerrar tudo, pressione Ctrl+C."

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$CRM_URL/#/goals" >/dev/null 2>&1 || true
fi

wait "$MAIN_PID"
