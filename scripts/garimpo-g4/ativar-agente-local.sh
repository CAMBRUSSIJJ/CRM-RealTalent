#!/usr/bin/env bash
# Starts G4 only if the standard Agent port is unused. Never replaces another process.
set -euo pipefail
ROOT="$(cd -- "$(dirname "$0")/../.." && pwd)"
HOST="http://127.0.0.1:8791"
MODEL="$(printenv REALTALENT_OLLAMA_MODEL || echo qwen3:8b)"
DATA="$HOME/.local/share/realtalent-garimpo-g4"
mkdir -p "$DATA"
chmod 700 "$DATA"
probe(){
  curl --noproxy '*' -sS --max-time 4 -X POST \
    -H 'Content-Type: application/json' -d '{}' "$HOST/tools/trigger-events" 2>/dev/null || true
}
RESULT="$(probe)"
if [[ "$RESULT" == *'"invalid_source_or_excerpt"'* ]];then
  echo "✓ G4 pronto no Agent local. Nenhum processo foi substituído."
  exit 0
fi
if curl --noproxy '*' --silent --max-time 3 "$HOST/tools/health" >/dev/null 2>&1 || \
  curl --noproxy '*' --silent --max-time 3 "$HOST/health" >/dev/null 2>&1;then
  echo "AVISO: um Agent antigo ocupa 8791 sem o endpoint G4."
  echo "Nenhum serviço foi interrompido. Reinicie o Agent manualmente"
  echo "usando o gateway-ollama.mjs desta branch. O CRM continuará disponível."
  exit 2
fi
if ! curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:11434/api/tags >/dev/null;then
  echo "AVISO: Ollama indisponível em 11434. Inicie-o para habilitar G4."
  exit 3
fi
if ! curl --noproxy '*' -fsS --max-time 4 http://127.0.0.1:11434/api/tags | \
  node -e "let x='';process.stdin.on('data',d=>x+=d).on('end',()=>{let m=JSON.parse(x).models||[];process.exit(m.some(v=>v.name===process.argv[1]||v.model===process.argv[1])?0:1)})" "$MODEL";then
  echo "AVISO: modelo $MODEL não encontrado. Confira: ollama list"
  echo "Nenhum download de modelo foi feito automaticamente."
  exit 4
fi
RUNTIME="$ROOT/runtime-host/RealTalent-Agent-Runtime-V3.1.2"
[[ -f "$RUNTIME/gateway-ollama.mjs" ]] || { echo "Agent G4 ausente neste checkout."; exit 5; }
INNER_PORT=""
for candidate in 8792 8892 8893 8894 8895; do
  if ! ss -H -ltn "( sport = :$candidate )" 2>/dev/null | grep -q .; then
    INNER_PORT="$candidate"
    break
  fi
done
if [[ -z "$INNER_PORT" ]]; then
  echo "AVISO: portas internas do Agent ocupadas; nenhum processo foi encerrado."
  exit 7
fi
echo "Iniciando Agent G4 em 8791 com runtime interno em $INNER_PORT..."
(
  cd "$RUNTIME"
  nohup env REALTALENT_AGENT_HOST=127.0.0.1 REALTALENT_AGENT_PORT=8791 \
    REALTALENT_AGENT_INNER_PORT="$INNER_PORT" REALTALENT_OLLAMA_MODEL="$MODEL" \
    REALTALENT_AI_PROVIDER=ollama OLLAMA_URL=http://127.0.0.1:11434 \
    node gateway-ollama.mjs >>"$DATA/agent.log" 2>&1 </dev/null &
  echo "$!" > "$DATA/agent.pid"
)
for attempt in $(seq 1 25);do
  sleep .4
  RESULT="$(probe)"
  if [[ "$RESULT" == *'"invalid_source_or_excerpt"'* ]];then
    echo "✓ G4 ativado em 8791 (Ollama $MODEL)."
    exit 0
  fi
done
echo "AVISO: G4 não confirmado. Confira: tail -n 50 '$DATA/agent.log'"
exit 6
