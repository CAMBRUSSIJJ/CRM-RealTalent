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
ROUTER_TEST="runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-semantic-router.test.mjs"
LEARNING_TEST="src/services/realtalent-learning-engine.test.ts"
LAUNCH_LOG="$ROOT/.realtalent-total.log"
AGENT_LOG="$ROOT/.realtalent-agent-ollama.log"
VITE_LOG="$ROOT/.realtalent-vite.log"
OLLAMA_RECOVERY_LOG="$ROOT/.realtalent-ollama-recovery.log"
MATRIX_LOG="$ROOT/.realtalent-matrix-batch.log"

say() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }
warn() { printf '\n\033[1;33mAVISO: %s\033[0m\n' "$*" >&2; }

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
    say "↻ Ollama saiu do ar; tentando reativar para a certificação"
    nohup ollama serve >>"$OLLAMA_RECOVERY_LOG" 2>&1 &
    local recovered=0
    for ((i=1; i<=60; i++)); do
      if curl -fsS --max-time 2 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then recovered=1; break; fi
      sleep 1
    done
    if [[ "$recovered" != "1" ]]; then
      warn "Ollama não voltou para a certificação. O CRM permanecerá aberto."
      return 1
    fi
  fi

  local payload
  payload="$(printf '{\"model\":\"%s\",\"prompt\":\"Responda somente OK.\",\"stream\":false,\"think\":false,\"keep_alive\":\"10m\",\"options\":{\"num_predict\":8}}' "$MODEL")"
  if ! curl -fsS --max-time 300 "$OLLAMA_URL/api/generate" -H 'content-type: application/json' --data-binary "$payload" >/dev/null; then
    warn "O modelo $MODEL não aqueceu para a certificação. O CRM permanecerá aberto."
    return 1
  fi
  return 0
}

say "RealTalent CRM — Universal Control estável com Ollama"
command -v git >/dev/null 2>&1 || fail "git não está instalado."
command -v curl >/dev/null 2>&1 || fail "curl não está instalado."
command -v node >/dev/null 2>&1 || fail "Node.js não está instalado."
command -v npm >/dev/null 2>&1 || fail "npm não está instalado."
command -v ollama >/dev/null 2>&1 || fail "Ollama não está instalado."

say "1/8 — Sincronizando a versão universal"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "✓ Commit $(git rev-parse --short HEAD)"

: > "$LAUNCH_LOG"
: > "$AGENT_LOG"
: > "$VITE_LOG"
: > "$OLLAMA_RECOVERY_LOG"
: > "$MATRIX_LOG"

say "2/8 — Validando fonte definitiva antes de iniciar Ollama"
# Wiring transitório limitado a imports/executor/readback e persistência de sessão do Assistant.
node scripts/enable-universal-agent.mjs
node scripts/fix-assistant-execution-session.mjs

node --check runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-semantic-router.mjs
node --check runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs
node --check runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-capability-planner.mjs

grep -q "crm-semantic-router.mjs" runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs || fail "Gateway não usa a fonte definitiva do roteador."
grep -q "routeCapability" runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs || fail "Narrowing de capability não está ligado."
grep -q "verifiedLearningHint" runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs || fail "Roteador não está aceitando aprendizado local verificado."
grep -q "preserveExplicitPlannerArguments" runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs || fail "Preservação de entidades explícitas não está ligada."
grep -q "realtalent-crm-universal-executor" src/features/assistant/assistant-drawer.tsx || fail "Assistant não está ligado ao executor universal."
grep -q "executedPlanId })" src/features/assistant/assistant-drawer.tsx || fail "Assistant não está persistindo o plano executado na sessão."
grep -q "realtalent-learning-engine" src/services/realtalent-ai-gateway.ts || fail "AI Gateway não está ligado ao Learning Engine."
grep -q "realtalent-crm-universal-registry" src/services/realtalent-crm-capability-runtime-client.ts || fail "Runtime client não está usando o catálogo universal completo."
grep -q "REALTALENT_MATRIX_FROM" "$MATRIX_FILE" || fail "Matriz real ainda depende de patch de boot."

# Gates baratos: roteamento conhecido + aprendizado verificado, sem chamar Ollama.
npx vitest run "$ROUTER_TEST" "$LEARNING_TEST"
echo "✓ Roteador determinístico e Learning Engine aprovados antes de iniciar Ollama"

say "3/8 — Encerrando somente instâncias antigas do RealTalent"
stop_realtalent_port 4188
stop_realtalent_port 8791
stop_realtalent_port 8792
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
  src/services/realtalent-assistant-provider-routing.test.ts \
  "$LEARNING_TEST"

echo "✓ Superfície operacional, executores, Execution Truth e aprendizado local auditados"

say "6/8 — Validando o mesmo caminho usado pelo navegador"
CORS_HEADERS="$(mktemp)"
curl -sS -D "$CORS_HEADERS" -o /dev/null -X OPTIONS \
  -H 'Origin: http://127.0.0.1:4188' \
  -H 'Access-Control-Request-Method: POST' \
  "$AGENT_URL/capabilities/plan"
grep -qi '^access-control-allow-origin: http://127.0.0.1:4188' "$CORS_HEADERS" || { cat "$CORS_HEADERS"; rm -f "$CORS_HEADERS"; dump_failure_logs; fail "O navegador do CRM não está autorizado a acessar o Agent."; }
rm -f "$CORS_HEADERS"
echo "✓ Browser 4188 → Agent 8791 autorizado"

say "7/8 — Abrindo CRM e certificando a linguagem natural"
echo "✓ Núcleo operacional pronto; o CRM será aberto agora."
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$CRM_URL/#/goals" >/dev/null 2>&1 || true; fi

echo "A certificação Ollama continua neste terminal sem derrubar o CRM se algum caso falhar."
MATRIX_CASES="$(grep -c "^  { name:" "$MATRIX_FILE" || true)"
[[ "$MATRIX_CASES" =~ ^[0-9]+$ ]] && (( MATRIX_CASES > 0 )) || fail "Não consegui contar os casos da matriz universal."
BATCH_SIZE=6
MATRIX_OK=1
MATRIX_FAILED_BATCH=""

for ((start=0; start<MATRIX_CASES; start+=BATCH_SIZE)); do
  end=$((start + BATCH_SIZE))
  (( end > MATRIX_CASES )) && end="$MATRIX_CASES"

  if ! ensure_ollama_ready; then
    MATRIX_OK=0
    MATRIX_FAILED_BATCH="$((start + 1))-$end"
    break
  fi

  : > "$MATRIX_LOG"
  echo
  echo "🧠 Matriz Ollama: casos $((start + 1))-$end de $MATRIX_CASES"
  if ! REALTALENT_OLLAMA_MATRIX=1 \
    REALTALENT_AGENT_TEST_URL="$AGENT_URL" \
    REALTALENT_MATRIX_FROM="$start" \
    REALTALENT_MATRIX_TO="$end" \
      npx vitest run "$MATRIX_FILE" 2>&1 | tee "$MATRIX_LOG"; then
    MATRIX_OK=0
    MATRIX_FAILED_BATCH="$((start + 1))-$end"
    dump_failure_logs
    warn "A certificação semântica falhou no lote $MATRIX_FAILED_BATCH. O CRM continuará aberto para uso e o erro ficou isolado no log acima."
    break
  fi
done

if [[ "$MATRIX_OK" == "1" ]]; then
  echo "✓ Matriz semântica universal aprovada: $MATRIX_CASES/$MATRIX_CASES"
else
  echo "△ CRM aberto e núcleo operacional validado; certificação Ollama 38/38 ainda pendente no lote $MATRIX_FAILED_BATCH."
fi

say "8/8 — RealTalent em execução"
echo "✓ Fonte semântica definitiva validada"
echo "✓ Roteador determinístico validado antes do boot"
echo "✓ Learning Engine local: experiências verificadas + correções do usuário"
echo "✓ Ollama online no fluxo principal"
echo "✓ Agent Universal online"
echo "✓ Browser autorizado a acessar o Agent"
echo "✓ Catálogo/executor/readback auditados"
echo "✓ CRM: $CRM_URL/#/goals"
if [[ "$MATRIX_OK" == "1" ]]; then
  echo "✓ Certificação semântica real: $MATRIX_CASES/$MATRIX_CASES"
else
  echo "△ Certificação semântica real incompleta; não estou declarando 38/38."
fi

echo
echo "O CRM permanece aberto. Para encerrar os serviços deste terminal, pressione Ctrl+C."
wait "$MAIN_PID"
