#!/usr/bin/env bash
set -euo pipefail
PRODUCT="${1:-crm}"
RUN="${XDG_RUNTIME_DIR:-/tmp}/realtalent-agent"; PIDFILE="$RUN/browser-$PRODUCT.pid"
[[ -f "$PIDFILE" ]] || exit 0
PID="$(cat "$PIDFILE" 2>/dev/null || true)"; rm -f "$PIDFILE"
[[ "$PID" =~ ^[0-9]+$ ]] || exit 0
if [[ -r "/proc/$PID/cmdline" ]]; then
  CMD="$(tr '\0' ' ' < "/proc/$PID/cmdline")"
  if [[ "$CMD" != *"realtalent-agent/browser-profiles/$PRODUCT"* ]]; then echo 'PID não corresponde ao browser gerenciado; nada encerrado.' >&2; exit 0; fi
fi
kill "$PID" 2>/dev/null || true
for _ in $(seq 1 20); do kill -0 "$PID" 2>/dev/null || exit 0; sleep .1; done
kill -KILL "$PID" 2>/dev/null || true
