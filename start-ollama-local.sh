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

say "1/6 — Iniciando Ollama"
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

say "2/6 — Garantindo o modelo semântico $MODEL"
if ! ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -Fxq "$MODEL"; then
  ollama pull "$MODEL"
fi
echo "✓ Modelo $MODEL disponível"

say "3/6 — Preparando CRM"
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
npx vitest run src/services/realtalent-ollama-semantic.integration.test.ts

say "4/6 — Iniciando RealTalent Agent com Ollama"
pkill -f "$AGENT_DIR/gateway-ollama.mjs" 2>/dev/null || true
sleep 1

export REALTALENT_AI_PROVIDER=ollama
export REALTALENT_OLLAMA_MODEL="$MODEL"
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

say "5/6 — Testando linguagem natural REAL com o catálogo REAL"
REALTALENT_OLLAMA_E2E=1 REALTALENT_AGENT_TEST_URL="$AGENT_URL" \
  npx vitest run src/services/realtalent-ollama-semantic.integration.test.ts

echo "✓ Meta entendida pelo Ollama"
echo "✓ Reunião entendida pelo Ollama"
echo "✓ Rota /goals não bloqueia intenção de Agenda"

say "6/6 — Iniciando interface somente após todos os gates"
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
echo "✓ Nenhuma chamada OpenAI faz parte deste fluxo"
echo

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$CRM_URL/#/goals" >/dev/null 2>&1 || true
fi

wait "$VITE_PID"
