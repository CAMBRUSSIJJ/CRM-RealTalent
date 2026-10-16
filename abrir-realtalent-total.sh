#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BRANCH="preview/v3.5-h1-semantic-agent"
AGENT_URL="http://127.0.0.1:8791"
CRM_URL="http://127.0.0.1:4188"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
MODEL="${REALTALENT_OLLAMA_MODEL:-qwen3:4b}"
MATRIX_FILE="src/services/realtalent-ollama-crm-matrix.integration.test.ts"
LAUNCH_LOG="$ROOT/.realtalent-total.log"
AGENT_LOG="$ROOT/.realtalent-agent-ollama.log"
VITE_LOG="$ROOT/.realtalent-vite.log"
OLLAMA_RECOVERY_LOG="$ROOT/.realtalent-ollama-recovery.log"
MATRIX_LOG="$ROOT/.realtalent-matrix-batch.log"

say() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }

dump_failure_logs() {
  echo
  echo "================ DIAGNÓSTICO AUTOMÁTICO ================" >&2
  for file in "$MATRIX_LOG" "$LAUNCH_LOG" "$AGENT_LOG" "$VITE_LOG" "$OLLAMA_RECOVERY_LOG"; do
    if [[ -s "$file" ]]; then
      echo >&2
      echo "--- $(basename "$file") · últimas 140 linhas ---" >&2
      tail -n 140 "$file" >&2 || true
    fi
  done
  echo "=========================================================" >&2
  echo
}

wait_http() {
  local url="$1"; local label="$2"; local attempts="${3:-240}"
  for ((i=1; i<=attempts; i++)); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  dump_failure_logs
  fail "$label não ficou pronto em $url."
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

ensure_ollama_ready() {
  if ! curl -fsS --max-time 3 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
    say "↻ Ollama saiu do ar; reiniciando antes de continuar a matriz"
    nohup ollama serve >>"$OLLAMA_RECOVERY_LOG" 2>&1 &
    for ((i=1; i<=60; i++)); do
      if curl -fsS --max-time 2 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then break; fi
      sleep 1
      if [[ $i -eq 60 ]]; then dump_failure_logs; fail "Ollama não voltou após a tentativa de recuperação."; fi
    done
  fi

  local payload
  payload="$(printf '{\"model\":\"%s\",\"prompt\":\"Responda somente OK.\",\"stream\":false,\"think\":false,\"keep_alive\":\"10m\",\"options\":{\"num_predict\":8}}' "$MODEL")"
  curl -fsS --max-time 300 "$OLLAMA_URL/api/generate" -H 'content-type: application/json' --data-binary "$payload" >/dev/null \
    || { dump_failure_logs; fail "Ollama respondeu ao health, mas o modelo $MODEL não conseguiu aquecer."; }
}

say "RealTalent CRM — Universal Control com Ollama"
command -v git >/dev/null 2>&1 || fail "git não está instalado."
command -v curl >/dev/null 2>&1 || fail "curl não está instalado."
command -v npm >/dev/null 2>&1 || fail "npm não está instalado."
command -v ollama >/dev/null 2>&1 || fail "Ollama não está instalado. Rode o launcher principal uma vez para instalar."

say "1/8 — Sincronizando a versão universal"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "✓ Commit $(git rev-parse --short HEAD)"

# Cada rodada começa com logs limpos para não misturar evidência antiga com o erro atual.
: > "$LAUNCH_LOG"
: > "$AGENT_LOG"
: > "$VITE_LOG"
: > "$OLLAMA_RECOVERY_LOG"
: > "$MATRIX_LOG"

say "2/8 — Habilitando Universal CRM Control"
node scripts/enable-universal-agent.mjs
node scripts/harden-universal-agent.mjs
node scripts/preserve-agent-entities.mjs
grep -q "realtalent-crm-universal-executor" src/features/assistant/assistant-drawer.tsx || fail "O Assistant não foi ligado ao executor universal."
grep -q "realtalent-crm-universal-registry" src/services/realtalent-crm-capability-runtime-client.ts || fail "O planner não foi ligado ao catálogo universal."
grep -q "semanticDomainAnchor" runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs || fail "O roteador híbrido não foi habilitado."
grep -q "semanticCapabilityAnchor" runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs || fail "O roteador fino de capabilities não foi habilitado."
grep -q "preserveExplicitEntityReference" runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs || fail "A preservação de entidades explícitas não foi habilitada."
grep -q "return pick('leads', 'relação entre contatos explícita')" runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs || fail "O roteador de Contatos não foi alinhado ao AppRoute leads."
echo "✓ Planner, Assistant, catálogo, executor, roteamento e preservação de entidade ligados"

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
  if ! kill -0 "$MAIN_PID" 2>/dev/null; then
    set +e
    wait "$MAIN_PID"
    MAIN_CODE=$?
    set -e
    dump_failure_logs
    fail "O launcher principal encerrou com código $MAIN_CODE antes do CRM ficar pronto. A causa está impressa acima."
  fi
  sleep 1
  if [[ $i -eq 360 ]]; then dump_failure_logs; fail "CRM não ficou pronto a tempo."; fi
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
grep -qi '^access-control-allow-origin: http://127.0.0.1:4188' "$CORS_HEADERS" || { cat "$CORS_HEADERS"; rm -f "$CORS_HEADERS"; dump_failure_logs; fail "O navegador do CRM não está autorizado a acessar o Agent."; }
rm -f "$CORS_HEADERS"
echo "✓ Browser 4188 → Agent 8791 autorizado"

say "7/8 — Rodando matriz semântica UNIVERSAL do Ollama em lotes"
if [[ -f "$MATRIX_FILE" ]]; then
  MATRIX_CASES="$(grep -c "^  { name:" "$MATRIX_FILE" || true)"
  [[ "$MATRIX_CASES" =~ ^[0-9]+$ ]] && (( MATRIX_CASES > 0 )) || fail "Não consegui contar os casos da matriz universal."
  BATCH_SIZE=6
  for ((start=0; start<MATRIX_CASES; start+=BATCH_SIZE)); do
    end=$((start + BATCH_SIZE))
    (( end > MATRIX_CASES )) && end="$MATRIX_CASES"
    ensure_ollama_ready
    : > "$MATRIX_LOG"
    echo
    echo "🧠 Matriz Ollama: casos $((start + 1))-$end de $MATRIX_CASES"
    if ! REALTALENT_OLLAMA_MATRIX=1 \
      REALTALENT_AGENT_TEST_URL="$AGENT_URL" \
      REALTALENT_MATRIX_FROM="$start" \
      REALTALENT_MATRIX_TO="$end" \
        npx vitest run "$MATRIX_FILE" 2>&1 | tee "$MATRIX_LOG"; then
      dump_failure_logs
      fail "A matriz semântica falhou no lote $((start + 1))-$end. A asserção exata está impressa acima."
    fi
  done
  ensure_ollama_ready
  echo "✓ Matriz semântica universal aprovada: $MATRIX_CASES/$MATRIX_CASES"
else
  echo "△ Matriz universal não está presente nesta revisão."
fi

say "8/8 — Abrindo RealTalent CRM"
echo "✓ Ollama online"
echo "✓ Agent Universal online"
echo "✓ Roteamento híbrido + narrowing de capability ativos"
echo "✓ Preservação de entidades explícitas ativa"
echo "✓ Catálogo universal auditado"
echo "✓ Execução + persistência/readback verificadas estruturalmente"
echo "✓ CRM: $CRM_URL/#/goals"
echo
echo "Tudo é mantido por este único terminal. Para encerrar, pressione Ctrl+C."

if command -v xdg-open >/dev/null 2>&1; then xdg-open "$CRM_URL/#/goals" >/dev/null 2>&1 || true; fi
wait "$MAIN_PID"
