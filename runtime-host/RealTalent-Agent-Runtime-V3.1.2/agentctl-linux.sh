#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cmd="${1:-help}"; shift || true
case "$cmd" in
  start) exec "$ROOT/start-agent-linux.sh" "$@" ;;
  background) exec "$ROOT/start-agent-background-linux.sh" "$@" ;;
  stop) exec "$ROOT/stop-agent-linux.sh" "$@" ;;
  status) exec "$ROOT/status-agent-linux.sh" "$@" ;;
  control) exec "$ROOT/open-control-center-linux.sh" "$@" ;;
  technical) exec "$ROOT/open-technical-center-linux.sh" "$@" ;;
  qa) exec "$ROOT/browser-qa-linux.sh" "$@" ;;
  builder) exec "$ROOT/builder-agent-linux.sh" "$@" ;;
  audit) exec node "$ROOT/audit.mjs" "$@" ;;
  selftest) exec node "$ROOT/v2-selftest.mjs" "$@" ;;
  readiness) exec node "$ROOT/production-readiness.mjs" "$@" ;;
  learning) exec "$ROOT/learning-agent-linux.sh" "$@" ;;
  reasoning) exec "$ROOT/reasoning-agent-linux.sh" "$@" ;;
  execution) exec "$ROOT/execution-agent-linux.sh" "$@" ;;
  quality) exec "$ROOT/quality-agent-linux.sh" "$@" ;;
  *) cat <<EOF
RealTalent Agent V3.1.1 — agentctl
Uso: ./agentctl-linux.sh <comando>
  start | background | stop | status | control | technical
  qa | builder | audit | selftest | readiness | learning | reasoning | execution | quality
EOF
  ;;
esac
