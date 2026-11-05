#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/share/realtalent-connect"
CONFIG_DIR="$HOME/.config/realtalent-connect"
SYSTEMD_DIR="$HOME/.config/systemd/user"
APP_DIR="$HOME/.local/share/applications"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js 22 não encontrado. Instale Node.js 22 e repita."
  exit 1
fi
node -e 'if(Number(process.versions.node.split(".")[0])!==22)process.exit(1)' || {
  echo "Este aplicativo requer Node.js 22."
  exit 1
}
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$SYSTEMD_DIR" "$APP_DIR"
chmod 700 "$CONFIG_DIR"
# Dependencies are installed BEFORE switching the running service, so a
# network failure leaves the previous working app untouched.
if ! command -v npm >/dev/null 2>&1; then
  echo "ERRO: npm não encontrado. Instale npm para Node.js 22."
  exit 1
fi
mkdir -p "$INSTALL_DIR/runtime"
cp "$ROOT/runtime-package.json" "$INSTALL_DIR/runtime/package.json"
echo "Instalando o motor WhatsApp Web nativo e o renderizador QR..."
if [[ -x /usr/bin/google-chrome-stable || -x /usr/bin/google-chrome || -x /usr/bin/chromium || -x /usr/bin/chromium-browser ]]; then
  PUPPETEER_SKIP_DOWNLOAD=1 npm install --prefix "$INSTALL_DIR/runtime" --no-audit --no-fund
else
  # Puppeteer downloads its compatible headless Chromium during install.
  npm install --prefix "$INSTALL_DIR/runtime" --no-audit --no-fund
fi
"$NODE_BIN" -e '
const {createRequire}=require("node:module");
const {join}=require("node:path");
const r=createRequire(join(process.argv[1],"package.json"));
if(!r("whatsapp-web.js").Client || !r("qrcode").toDataURL) process.exit(1);
' "$INSTALL_DIR/runtime" || {
  echo "ERRO: dependências do WhatsApp Web não estão disponíveis."
  exit 1
}
# Stop the old Evolution transport without modifying Docker volumes, Postgres,
# Redis, WhatsApp data or the secured RealTalent pairing token.
if command -v docker >/dev/null 2>&1 && [[ -f "$INSTALL_DIR/compose.yaml" && -f "$CONFIG_DIR/docker.env" ]]; then
  echo "Desativando apenas os serviços antigos da Evolution (sem apagar dados)..."
  docker compose --project-name realtalent-connect \
    --env-file "$CONFIG_DIR/docker.env" \
    -f "$INSTALL_DIR/compose.yaml" stop evolution postgres redis >/dev/null 2>&1 || true
fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl --user stop realtalent-connect.service >/dev/null 2>&1 || true
fi
cp "$ROOT/app.mjs" "$ROOT/whatsapp-web-engine.mjs" "$ROOT/index.html" "$INSTALL_DIR/"
chmod 700 "$CONFIG_DIR"
cat > "$INSTALL_DIR/abrir.sh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
if command -v systemctl >/dev/null && systemctl --user is-active --quiet realtalent-connect.service; then
  :
elif command -v systemctl >/dev/null; then
  systemctl --user start realtalent-connect.service || true
fi
xdg-open http://127.0.0.1:4375/ >/dev/null 2>&1 || true
EOF
chmod +x "$INSTALL_DIR/abrir.sh"
cat > "$INSTALL_DIR/logo.svg" <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
<rect width="128" height="128" rx="30" fill="#1155c7"/>
<path d="M37 34h28c16 0 26 9 26 23 0 11-6 18-15 21l18 21H72L56 81h-2v18H37V34zm17 16v16h11c6 0 10-3 10-8 0-6-4-8-10-8H54z" fill="#fff"/>
<circle cx="98" cy="29" r="12" fill="#20c997" stroke="#fff" stroke-width="4"/>
</svg>
EOF
cat > "$APP_DIR/realtalent-connect.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=RealTalent Connect
GenericName=WhatsApp do RealTalent
Comment=Vincular e iniciar WhatsApp no RealTalent CRM
Exec=$INSTALL_DIR/abrir.sh
Icon=$INSTALL_DIR/logo.svg
Terminal=false
Categories=Office;Network;
StartupNotify=true
EOF
cat > "$SYSTEMD_DIR/realtalent-connect.service" <<EOF
[Unit]
Description=RealTalent Connect WhatsApp Web (local, sem Docker)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$NODE_BIN $INSTALL_DIR/app.mjs
WorkingDirectory=$INSTALL_DIR
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
UMask=0077

[Install]
WantedBy=default.target
EOF
echo ""
echo "RealTalent Connect instalado em Aplicativos → RealTalent Connect."
if command -v systemctl >/dev/null && systemctl --user daemon-reload; then
  systemctl --user enable --now realtalent-connect.service
  systemctl --user restart realtalent-connect.service
else
  nohup "$NODE_BIN" "$INSTALL_DIR/app.mjs" >/dev/null 2>&1 &
  echo "Aviso: systemd --user indisponível. Aplicativo iniciado sem ativação automática."
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://127.0.0.1:4375/ >/dev/null 2>&1 || true
fi
echo ""
echo "Abra: http://127.0.0.1:4375/"
echo "Seu vínculo com o CRM foi preservado. Abra Configurações → WhatsApp → Gerar QR Code."
