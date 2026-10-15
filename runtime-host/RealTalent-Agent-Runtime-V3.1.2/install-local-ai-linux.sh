#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/realtalent-agent/agent.env"
[[ -f "$CONFIG_FILE" ]] && source "$CONFIG_FILE" || true
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
MAIN="${OLLAMA_MODEL:-qwen2.5-coder:3b}"
GENERAL="${OLLAMA_GENERAL_MODEL:-qwen3:4b}"
FAST="${OLLAMA_FAST_MODEL:-qwen3:1.7b}"
CODER="${OLLAMA_CODER_MODEL:-qwen2.5-coder:3b}"
REASON="${OLLAMA_REASONING_MODEL:-qwen3:4b}"
VISION="${OLLAMA_VISION_MODEL:-}"
EMBED="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"

echo 'RealTalent Agent V3.1.1 — preparando IA Local'
node "$HERE/hardware-profiler.mjs" --write || true
printf 'Modelos configurados: geral=%s · rápido=%s · código=%s · raciocínio=%s · embeddings=%s' "$GENERAL" "$FAST" "$CODER" "$REASON" "$EMBED"
[[ -n "$VISION" ]] && printf ' · visão=%s' "$VISION"
printf '\n'

if ! command -v ollama >/dev/null 2>&1; then
  echo 'Ollama não está instalado.'
  echo 'A instalação oficial pode pedir sua senha de administrador.'
  read -r -p 'Instalar Ollama agora? [s/N]: ' ANSWER
  if [[ "${ANSWER,,}" != s && "${ANSWER,,}" != sim ]]; then
    echo 'Instalação cancelada. Instale o Ollama e execute este script novamente.'
    exit 3
  fi
  command -v curl >/dev/null 2>&1 || { echo 'curl não encontrado.' >&2; exit 4; }
  curl -fsSL https://ollama.com/install.sh | sh
fi

if ! curl -fsS --max-time 1 "${OLLAMA_URL%/}/api/tags" >/dev/null 2>&1; then
  echo 'Iniciando ollama serve em segundo plano...'
  STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/realtalent-agent"
  mkdir -p "$STATE_DIR"
  nohup ollama serve >"$STATE_DIR/ollama.log" 2>&1 &
  for _ in $(seq 1 40); do
    curl -fsS --max-time 1 "${OLLAMA_URL%/}/api/tags" >/dev/null 2>&1 && break
    sleep .25
  done
fi
curl -fsS --max-time 2 "${OLLAMA_URL%/}/api/tags" >/dev/null 2>&1 || { echo "Ollama não respondeu em $OLLAMA_URL" >&2; exit 5; }

mapfile -t MODELS < <(printf '%s\n' "$MAIN" "$GENERAL" "$FAST" "$CODER" "$REASON" "$VISION" "$EMBED" | awk 'NF && !seen[$0]++')
for MODEL in "${MODELS[@]}"; do
  echo "Baixando/validando $MODEL..."
  ollama pull "$MODEL"
done

echo
ollama list || true
echo 'IA Local V3.1.1 preparada. O Model Router escolherá o papel adequado por tarefa.\nPróximo passo recomendado: ./model-calibration-linux.sh completo'
