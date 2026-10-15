#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/realtalent-agent/agent.env"
if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi
export REALTALENT_AI_PROVIDER="${REALTALENT_AI_PROVIDER:-${OPENAI_API_KEY:+openai}}"
export REALTALENT_AI_PROVIDER="${REALTALENT_AI_PROVIDER:-ollama}"
export OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5-coder:3b}"
export OLLAMA_GENERAL_MODEL="${OLLAMA_GENERAL_MODEL:-qwen2.5:3b}"
export OLLAMA_FAST_MODEL="${OLLAMA_FAST_MODEL:-$OLLAMA_GENERAL_MODEL}"
export OLLAMA_CODER_MODEL="${OLLAMA_CODER_MODEL:-$OLLAMA_MODEL}"
export OLLAMA_REASONING_MODEL="${OLLAMA_REASONING_MODEL:-$OLLAMA_GENERAL_MODEL}"
export OLLAMA_VISION_MODEL="${OLLAMA_VISION_MODEL:-}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-}"
export OPENAI_MODEL="${OPENAI_MODEL:-gpt-5.6-sol}"

if [[ "$REALTALENT_AI_PROVIDER" == openai && -z "$OPENAI_API_KEY" ]]; then
  echo 'Modo OpenAI selecionado, mas OPENAI_API_KEY não está configurada.' >&2
  echo "Execute: $HERE/setup-agent-linux.sh" >&2
  exit 2
fi
if [[ "$REALTALENT_AI_PROVIDER" != openai ]]; then
  if ! curl -fsS --max-time 1 "${OLLAMA_URL%/}/api/tags" >/dev/null 2>&1; then
    echo "AVISO: Ollama ainda não respondeu em ${OLLAMA_URL%/}. O Runtime abrirá, mas a IA Local ficará offline até o Ollama iniciar." >&2
    echo "Execute: $HERE/install-local-ai-linux.sh" >&2
  fi
fi
exec node "$HERE/gateway.mjs"
