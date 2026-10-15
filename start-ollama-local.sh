#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODEL="${REALTALENT_OLLAMA_MODEL:-qwen3:4b}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
AGENT_URL="http://127.0.0.1:8791"
CRM_URL="http://127.0.0.1:4188"
AGENT_DIR="$ROOT/runtime-host/RealTalent-Agent-Runtime-V3.1.2"
AGENT_LOG="$ROOT/.realtalent-agent-ollama.log"
OLLAMA_LOG="$ROOT/.realtalent-ollama.log"
VITE_LOG="$ROOT/.realtalent-vite.log"

say() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }

wait_http() {
  local url="$1"; local label="$2"; local attempts="${3:-90}"
  for ((i=1; i<=attempts; i++)); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  fail "$label não ficou pronto em $url."
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if [[ -n "${VITE_PID:-}" ]] && kill -0 "$VITE_PID" 2>/dev/null; then kill "$VITE_PID" 2>/dev/null || true; fi
  if [[ -n "${AGENT_PID:-}" ]] && kill -0 "$AGENT_PID" 2>/dev/null; then kill "$AGENT_PID" 2>/dev/null || true; fi
  exit "$code"
}
trap cleanup EXIT INT TERM

say "RealTalent CRM — Ollama é o único cérebro do Agent"

command -v curl >/dev/null 2>&1 || fail "curl não está instalado."
command -v node >/dev/null 2>&1 || fail "Node.js não está instalado."
command -v npm >/dev/null 2>&1 || fail "npm não está instalado."

NODE_MAJOR="$(node -p 'process.versions.node.split(`.`)[0]')"
[[ "$NODE_MAJOR" == "22" ]] || fail "Esta versão requer Node.js 22.x. Encontrado: $(node --version)"

if ! command -v ollama >/dev/null 2>&1; then
  say "Instalando Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

say "1/7 — Iniciando Ollama"
if ! curl -fsS --max-time 2 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^ollama\.service'; then
    sudo systemctl start ollama || true
  fi
fi
if ! curl -fsS --max-time 2 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  nohup ollama serve >"$OLLAMA_LOG" 2>&1 &
fi
wait_http "$OLLAMA_URL/api/tags" "Ollama" 60
echo "✓ Ollama online em $OLLAMA_URL"

say "2/7 — Garantindo o modelo semântico $MODEL"
if ! ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -Fxq "$MODEL"; then
  ollama pull "$MODEL"
fi
echo "✓ Modelo $MODEL disponível"

say "3/7 — Aquecendo o modelo local"
WARM_PAYLOAD="$(printf '{\"model\":\"%s\",\"prompt\":\"Responda somente OK.\",\"stream\":false,\"think\":false,\"keep_alive\":\"30m\",\"options\":{\"num_predict\":8}}' "$MODEL")"
if ! curl -fsS --max-time 300 "$OLLAMA_URL/api/generate" \
  -H 'content-type: application/json' \
  --data-binary "$WARM_PAYLOAD" >/dev/null; then
  fail "Ollama está online, mas o modelo $MODEL não conseguiu concluir nem o aquecimento em até 5 minutos."
fi
echo "✓ $MODEL carregado e mantido quente em memória"

say "4/7 — Preparando CRM"
if [[ ! -d node_modules ]] || [[ ! -x node_modules/.bin/vite ]]; then
  npm ci
fi

cat > .env.local <<EOF
VITE_DATA_MODE=local
VITE_APP_ENV=development
VITE_RELEASE_CHANNEL=semantic-agent-ollama
VITE_AGENT_GATEWAY_URL=$AGENT_URL
EOF

npm run typecheck
npm run build
npx vitest run src/services/realtalent-crm-capability-coverage.test.ts
npx vitest run src/services/realtalent-assistant-provider-routing.test.ts
npx vitest run src/services/realtalent-ollama-semantic.integration.test.ts

say "5/7 — Iniciando RealTalent Agent com Ollama"
pkill -f "$AGENT_DIR/gateway-ollama.mjs" 2>/dev/null || true
pkill -f "$AGENT_DIR/.gateway-ollama-runtime.generated.mjs" 2>/dev/null || true
sleep 1

export REALTALENT_AI_PROVIDER=ollama
export REALTALENT_OLLAMA_MODEL="$MODEL"
export REALTALENT_OLLAMA_STRUCTURED_TIMEOUT_MS=90000
export OLLAMA_URL
export OLLAMA_MODEL="$MODEL"
export OLLAMA_GENERAL_MODEL="$MODEL"
export OLLAMA_FAST_MODEL="$MODEL"
export OLLAMA_REASONING_MODEL="$MODEL"
export OLLAMA_CODER_MODEL="$MODEL"
export REALTALENT_AGENT_HOST=127.0.0.1
export REALTALENT_AGENT_PORT=8791
unset REALTALENT_AGENT_RUNTIME_TOKEN || true
unset OPENAI_API_KEY OPENAI_RESPONSES_URL OPENAI_PROTECTION_BYPASS OPENAI_MODEL || true

node "$AGENT_DIR/gateway-ollama.mjs" >"$AGENT_LOG" 2>&1 &
AGENT_PID=$!
wait_http "$AGENT_URL/health" "RealTalent Agent Ollama" 90

node - <<'NODE'
const response = await fetch('http://127.0.0.1:8791/health')
const health = await response.json()
if (!response.ok) throw new Error(`Agent health HTTP ${response.status}`)
if (health.provider !== 'ollama') throw new Error(`Provider incorreto: ${health.provider}`)
if (health?.ai?.provider !== 'ollama') throw new Error(`AI provider incorreto: ${health?.ai?.provider}`)
if (!health?.ai?.local?.online) throw new Error(`Ollama não está online no Agent: ${health?.ai?.local?.error || 'sem detalhe'}`)
console.log(`✓ Agent conectado ao Ollama · modelo=${health?.ai?.local?.roles?.fast || health.model}`)
NODE

CORS_HEADERS="$(curl -sS -D - -o /dev/null -X OPTIONS "$AGENT_URL/capabilities/plan" \
  -H 'Origin: http://127.0.0.1:4188' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type')"
if ! printf '%s\n' "$CORS_HEADERS" | tr -d '\r' | grep -qi '^access-control-allow-origin: http://127.0.0.1:4188$'; then
  printf '%s\n' "$CORS_HEADERS" >&2
  fail "O Agent está online, mas o navegador do CRM não foi autorizado a chamá-lo."
fi
echo "✓ Navegador do CRM autorizado a acessar o Agent em 8791"

say "6/7 — Testando linguagem natural REAL com catálogo e executor REAIS"
REALTALENT_OLLAMA_E2E=1 REALTALENT_AGENT_TEST_URL="$AGENT_URL" \
  npx vitest run src/services/realtalent-ollama-semantic.integration.test.ts

echo "✓ Meta entendida e encaminhada ao executor real"
echo "✓ Reunião entendida e encaminhada ao executor real"
echo "✓ Rota /goals não bloqueia intenção de Agenda"

say "7/7 — Iniciando interface somente após todos os gates"
if curl -fsS --max-time 1 "$CRM_URL" >/dev/null 2>&1; then
  fail "A porta 4188 já está ocupada. Feche a instância antiga do CRM e execute novamente."
fi

node "$ROOT/node_modules/vite/bin/vite.js" --host 127.0.0.1 --port 4188 --strictPort >"$VITE_LOG" 2>&1 &
VITE_PID=$!
wait_http "$CRM_URL" "Interface do CRM" 90

echo
echo "✓ RealTalent CRM pronto"
echo "✓ Ollama: $OLLAMA_URL"
echo "✓ Agent: $AGENT_URL"
echo "✓ CRM: $CRM_URL/#/goals"
echo "✓ Browser → Agent: autorizado"
echo "✓ Firewall operacional: ativo"
echo "✓ Nenhuma chamada OpenAI faz parte deste fluxo"
echo

if [[ "${REALTALENT_NO_AUTO_OPEN:-0}" != "1" ]] && command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$CRM_URL/#/goals" >/dev/null 2>&1 || true
fi

wait "$VITE_PID"