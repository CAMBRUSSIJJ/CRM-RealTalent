#!/usr/bin/env bash
# Launch local RealTalent while recording failures and keeping the terminal open.
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$HOME/RealTalent-Agent-V56-Teste/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/inicializacao-$(date +%Y%m%d-%H%M%S).log"

printf '\nRealTalent V5.6 — execução com diagnóstico\n'
printf 'Log: %s\n' "$LOG_FILE"
printf 'Se algo falhar, esta janela exibirá o motivo e o log será preservado.\n\n'

set +e
bash "$SCRIPT_DIR/abrir-local.sh" 2>&1 | tee -a "$LOG_FILE"
status=${PIPESTATUS[0]}
set -e

printf '\n'
if (( status == 0 )); then
  echo "RealTalent encerrado normalmente."
else
  echo "RealTalent finalizou com erro (código $status)."
  echo "Diagnóstico rápido:"
  echo "  Node: $(node --version 2>/dev/null || echo 'ausente')"
  echo "  Ollama: $(command -v ollama || echo 'ausente')"
  echo "  Memória:"
  free -h 2>/dev/null || true
  if command -v ss >/dev/null 2>&1; then
    echo "  Portas relevantes:"
    ss -ltn 2>/dev/null | grep -E ':(4188|4189|8791|8792|8793|11434|8888)[[:space:]]' || true
  fi
  if command -v nvidia-smi >/dev/null 2>&1; then
    echo "  NVIDIA:"
    nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader 2>/dev/null || true
  fi
  echo "  Últimas mensagens do gateway:"
  tail -n 15 "$LOG_DIR/gateway.log" 2>/dev/null || true
fi
printf '\nLog salvo: %s\n' "$LOG_FILE"
printf 'Não apague a pasta de logs; ela ajuda a identificar o erro.\n'
if [[ -t 0 ]]; then
  read -r -p 'Pressione ENTER para fechar este diagnóstico...' _ || true
fi
exit "$status"
