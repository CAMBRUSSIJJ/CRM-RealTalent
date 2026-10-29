#!/usr/bin/env bash
set -Eeuo pipefail
trap 'rc=$?; echo "Falha na inicialização do RealTalent: linha $LINENO, código $rc. Logs: $HOME/RealTalent-Garimpo-G1G2-Teste/logs" >&2' ERR

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="$HOME/RealTalent-Garimpo-G1G2-Teste/logs"
PROSPECTING_STATE_DIR="$HOME/RealTalent-Garimpo-G1G2-Teste/garimpo-agent-state"
PROSPECTING_PORT=4320
mkdir -p "$LOG_DIR" "$PROSPECTING_STATE_DIR"
cd "$ROOT"

for required in node npm curl ollama; do
  if ! command -v "$required" >/dev/null 2>&1; then
    echo "Programa ausente: $required. Instale antes de abrir o RealTalent." >&2; exit 2
  fi
done
if (( $(node -p 'Number(process.versions.node.split(".")[0])') < 22 )); then
  echo 'É necessário Node.js 22 ou superior.' >&2; exit 2
fi
for port in 4197 8804 8805; do
  if command -v ss >/dev/null 2>&1 && ss -ltn "( sport = :$port )" | grep -q LISTEN; then
    echo "Porta $port ocupada. A instalação não interromperá outros serviços." >&2; exit 2
  fi
done

LOCAL_OLLAMA_PID=''
GATEWAY_PID=''
PROSPECTING_PID=''
cleanup() {
  if [[ -n "$GATEWAY_PID" ]]; then kill "$GATEWAY_PID" 2>/dev/null || true; fi
  if [[ -n "$PROSPECTING_PID" ]]; then kill "$PROSPECTING_PID" 2>/dev/null || true; fi
  if [[ -n "$LOCAL_OLLAMA_PID" ]]; then kill "$LOCAL_OLLAMA_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if ! curl -fsS --max-time 3 http://127.0.0.1:11434/api/tags >/dev/null; then
  echo 'Inicializando Ollama local em 127.0.0.1:11434'
  OLLAMA_HOST=127.0.0.1:11434 OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_CONTEXT_LENGTH=4096 \
    ollama serve >"$LOG_DIR/ollama.log" 2>&1 &
  LOCAL_OLLAMA_PID=$!
  for i in $(seq 1 30); do
    if curl -fsS --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi
curl -fsS --max-time 5 http://127.0.0.1:11434/api/tags >/dev/null || {
  echo "Ollama não respondeu. Veja $LOG_DIR/ollama.log" >&2; exit 2;
}
if ! ollama list | grep -Eq '^qwen3:8b[[:space:]]'; then
  echo 'Baixando Qwen3 8B (~5,2 GB).'
  ollama pull qwen3:8b
fi
if [[ ! -x node_modules/.bin/vite ]] || [[ package-lock.json -nt node_modules/.package-lock.json ]]; then
  echo 'Instalando dependências com package-lock.json...'
  npm ci --include=dev
else
  echo 'Dependências já instaladas: evitando reinstalação desnecessária.'
fi

# G1/G2 possui motor de garimpo isolado: nao interfere na porta 4319 nem nos dados da V6.4.
PROSPECTING_URL="http://127.0.0.1:$PROSPECTING_PORT"
is_prospecting_ready() {
  curl -fsS --max-time 3 "$PROSPECTING_URL/api/prospecting-agent/health" 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",v=>s+=v);process.stdin.on("end",()=>{try{const v=JSON.parse(s);process.exit(v.ok===true&&v.port===Number(process.argv[1])?0:1)}catch{process.exit(1)}})' "$PROSPECTING_PORT" \
    >/dev/null 2>&1
}
if is_prospecting_ready; then
  echo "Garimpo local já ativo em $PROSPECTING_URL. Reutilizando sem encerrá-lo."
else
  if command -v ss >/dev/null 2>&1 && ss -ltn "( sport = :$PROSPECTING_PORT )" | grep -q LISTEN; then
    echo "Porta $PROSPECTING_PORT ocupada por outro serviço. Verifique antes de iniciar; nenhum processo será interrompido." >&2
    exit 2
  fi
  echo "Inicializando motor de Garimpo em $PROSPECTING_URL"
  REALTALENT_PROSPECTING_AGENT_HOST=127.0.0.1 \
    REALTALENT_PROSPECTING_AGENT_PORT="$PROSPECTING_PORT" \
    REALTALENT_PROSPECTING_AGENT_STATE_DIR="$PROSPECTING_STATE_DIR" \
    node scripts/realtalent-prospecting-agent.mjs >"$LOG_DIR/prospecting-agent.log" 2>&1 &
  PROSPECTING_PID=$!
  for i in $(seq 1 30); do
    if is_prospecting_ready; then break; fi
    if ! kill -0 "$PROSPECTING_PID" 2>/dev/null; then
      echo "Motor do Garimpo parou. Últimas mensagens:" >&2
      tail -n 30 "$LOG_DIR/prospecting-agent.log" >&2
      exit 2
    fi
    sleep 1
  done
  if ! is_prospecting_ready; then
    echo "Motor do Garimpo não respondeu. Veja $LOG_DIR/prospecting-agent.log" >&2
    exit 2
  fi
fi
echo "Garimpo conectado e pronto para busca."

SEARCH_URL=''
# Capture the entire response: grep -q can close the pipe early and make curl
# exit with SIGPIPE under pipefail even though the search API is healthy.
is_search_ready() {
  local result
  result="$(curl -fsS --max-time 22 'http://127.0.0.1:8888/search?q=servicos&format=json' 2>/dev/null)" || return 1
  [[ "$result" == *'"results"'* ]]
}
if ! is_search_ready; then
  echo 'Iniciando pesquisa local, se o Docker estiver disponível...'
  bash scripts/agent-v56-linux/iniciar-pesquisa.sh || echo 'Pesquisa indisponível; Ollama e CRM permanecem ativos.'
fi
if is_search_ready; then
  SEARCH_URL='http://127.0.0.1:8888'
  echo 'Pesquisa SearXNG conectada ao RealTalent.'
fi

export OLLAMA_URL=http://127.0.0.1:11434
export REALTALENT_OLLAMA_MODEL=qwen3:8b
export REALTALENT_AGENT_HOST=127.0.0.1
export REALTALENT_AGENT_PORT=8804
export REALTALENT_AGENT_INNER_PORT=8805
export REALTALENT_RESEARCH_SEARXNG_URL="$SEARCH_URL"
export VITE_AGENT_GATEWAY_URL=http://127.0.0.1:8804
export VITE_PROSPECTING_GATEWAY_URL="$PROSPECTING_URL"
export VITE_DATA_MODE=local

node runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs >"$LOG_DIR/gateway.log" 2>&1 &
GATEWAY_PID=$!
for i in $(seq 1 25); do
  if curl -fsS --max-time 3 http://127.0.0.1:8804/tools/health >/dev/null 2>&1; then break; fi
  if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
    tail -n 30 "$LOG_DIR/gateway.log" >&2; exit 2
  fi
  sleep 1
done
curl -fsS --max-time 5 http://127.0.0.1:8804/tools/health || {
  echo "Gateway indisponível. Veja $LOG_DIR/gateway.log" >&2; exit 2;
}
echo
echo 'RealTalent Garimpo G1/G2 pronto: CRM 4197 | Busca 4320 | IA 8804'
echo 'A V6.4 na porta 4196 e o motor 4319 permanecem intactos. Ctrl+C encerra apenas os serviços desta sessão.'
if command -v xdg-open >/dev/null 2>&1; then
  ( sleep 3; xdg-open 'http://127.0.0.1:4197' >/dev/null 2>&1 || true ) &
fi
./node_modules/.bin/vite --host 127.0.0.1 --port 4197 --strictPort
