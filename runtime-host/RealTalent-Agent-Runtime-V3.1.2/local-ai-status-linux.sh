#!/usr/bin/env bash
set -euo pipefail
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/realtalent-agent/agent.env"
[[ -f "$CONFIG_FILE" ]] && source "$CONFIG_FILE" || true
URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
MAIN="${OLLAMA_MODEL:-qwen2.5-coder:3b}"
echo "Provider: ${REALTALENT_AI_PROVIDER:-ollama}"
echo "Principal/código-base: $MAIN"
echo "Geral: ${OLLAMA_GENERAL_MODEL:-qwen2.5:3b}"
echo "Rápido: ${OLLAMA_FAST_MODEL:-$MAIN}"
echo "Código: ${OLLAMA_CODER_MODEL:-$MAIN}"
echo "Raciocínio: ${OLLAMA_REASONING_MODEL:-$MAIN}"
echo "Visão: ${OLLAMA_VISION_MODEL:-não configurado}"
if curl -fsS --max-time 2 "${URL%/}/api/tags" >/dev/null 2>&1; then
  echo 'Ollama: ONLINE'
  command -v ollama >/dev/null 2>&1 && ollama list || true
else
  echo "Ollama: OFFLINE ($URL)"
  exit 1
fi
