#!/usr/bin/env bash
set -euo pipefail
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/realtalent-agent"
PID_FILE="$CONFIG_DIR/agent.pid"
if [[ ! -f "$PID_FILE" ]]; then
  echo 'RealTalent Agent não está registrado como processo em segundo plano.'
  exit 0
fi
PID="$(cat "$PID_FILE" 2>/dev/null || true)"
if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  for _ in {1..20}; do kill -0 "$PID" 2>/dev/null || break; sleep .1; done
  kill -0 "$PID" 2>/dev/null && kill -9 "$PID" 2>/dev/null || true
  echo "RealTalent Agent parado (PID $PID)."
else
  echo 'O processo já não estava rodando.'
fi
rm -f "$PID_FILE"
