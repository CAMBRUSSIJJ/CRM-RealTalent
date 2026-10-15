#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/realtalent-agent"
PID_FILE="$CONFIG_DIR/agent.pid"
LOG_FILE="$CONFIG_DIR/agent.log"
mkdir -p "$CONFIG_DIR"
if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "RealTalent Agent já está rodando (PID $OLD_PID)."
    exit 0
  fi
  rm -f "$PID_FILE"
fi
nohup "$HERE/start-agent-linux.sh" >>"$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"
for _ in {1..30}; do
  if curl -fsS http://127.0.0.1:8791/health >/dev/null 2>&1; then
    echo "RealTalent Agent iniciado (PID $PID)."
    echo "Log: $LOG_FILE"
    exit 0
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo 'O Agent encerrou durante a inicialização.' >&2
    tail -n 20 "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE"
    exit 1
  fi
  sleep .2
done
echo 'O Agent iniciou, mas o health check não respondeu.' >&2
exit 1
