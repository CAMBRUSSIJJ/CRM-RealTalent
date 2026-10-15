#!/usr/bin/env bash
set -euo pipefail
PRODUCT="${1:-crm}"; URL="${2:-}"; PORT="${3:-}"
[[ -n "$URL" && -n "$PORT" ]] || { echo "Uso: $0 <crm|blue_ocean> <url-local> <cdp-port>" >&2; exit 2; }
case "$PRODUCT" in crm|blue_ocean) ;; *) echo 'Produto inválido.' >&2; exit 2;; esac
case "$URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo 'Somente URL local é permitida.' >&2; exit 2;; esac
CFG="${XDG_CONFIG_HOME:-$HOME/.config}/realtalent-agent/browser-profiles/$PRODUCT"
RUN="${XDG_RUNTIME_DIR:-/tmp}/realtalent-agent"
mkdir -p "$CFG" "$RUN"; chmod 700 "$CFG" "$RUN" 2>/dev/null || true
BROWSER="${REALTALENT_AGENT_CHROMIUM:-}"
if [[ -z "$BROWSER" ]]; then for c in chromium chromium-browser google-chrome google-chrome-stable; do command -v "$c" >/dev/null 2>&1 && { BROWSER="$(command -v "$c")"; break; }; done; fi
[[ -x "$BROWSER" ]] || { echo 'ERRO: Chromium/Chrome não encontrado. Rode ./install-browser-qa-linux.sh' >&2; exit 3; }
if command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  "$BROWSER" --user-data-dir="$CFG" --remote-debugging-address=127.0.0.1 --remote-debugging-port="$PORT" --no-first-run --no-default-browser-check "$URL" >/dev/null 2>&1 &
  exit 0
fi
LOG="$RUN/browser-$PRODUCT.log"; PIDFILE="$RUN/browser-$PRODUCT.pid"
EXTRA=()
if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then EXTRA+=(--headless=new --disable-gpu); fi
if [[ "$(id -u)" == "0" ]]; then EXTRA+=(--no-sandbox); fi
"$BROWSER" "${EXTRA[@]}" --user-data-dir="$CFG" --remote-debugging-address=127.0.0.1 --remote-debugging-port="$PORT" --no-first-run --no-default-browser-check "$URL" >"$LOG" 2>&1 &
PID=$!; printf '%s\n' "$PID" > "$PIDFILE"
for _ in $(seq 1 50); do
  if command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then echo "Browser QA $PRODUCT pronto em CDP 127.0.0.1:$PORT (PID $PID)."; exit 0; fi
  kill -0 "$PID" 2>/dev/null || { echo "ERRO: browser encerrou. Veja $LOG" >&2; exit 4; }
  sleep .2
done
echo "ERRO: CDP não respondeu na porta $PORT. Veja $LOG" >&2; exit 5
