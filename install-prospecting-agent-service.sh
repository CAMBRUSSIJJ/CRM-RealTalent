#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/realtalent-prospecting-agent.service"
PORT="${REALTALENT_PROSPECTING_AGENT_PORT:-4319}"
mkdir -p "$UNIT_DIR"
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "ERRO: Node.js não encontrado. Instale Node 22.x antes."
  exit 1
fi
cat > "$UNIT" <<UNIT
[Unit]
Description=RealTalent Prospecting Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
ExecStart=$NODE_BIN $ROOT/scripts/realtalent-prospecting-agent.mjs
Environment=REALTALENT_PROSPECTING_AGENT_HOST=127.0.0.1
Environment=REALTALENT_PROSPECTING_AGENT_PORT=$PORT
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now realtalent-prospecting-agent.service
sleep 1
if systemctl --user is-active --quiet realtalent-prospecting-agent.service; then
  echo "✓ RealTalent Prospecting Agent instalado e ativo"
  echo "  API: http://127.0.0.1:$PORT"
  echo "  Status: systemctl --user status realtalent-prospecting-agent"
  echo "  Logs: journalctl --user -u realtalent-prospecting-agent -f"
else
  echo "ERRO: o serviço não ficou ativo."
  systemctl --user status realtalent-prospecting-agent.service --no-pager || true
  exit 1
fi
