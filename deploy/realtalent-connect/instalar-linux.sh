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
cp "$ROOT/app.mjs" "$ROOT/index.html" "$ROOT/compose.yaml" "$INSTALL_DIR/"
# QR codes supplied as raw WhatsApp pairing strings must be rendered entirely
# on this computer. Never send pairing tokens to third-party QR websites.
if command -v npm >/dev/null 2>&1; then
  echo "Preparando gerador seguro de QR Code no Linux..."
  npm install --prefix "$INSTALL_DIR" --no-save --ignore-scripts --no-audit --no-fund qrcode@1.5.4 ||
    echo "Aviso: QR local não instalado. Verifique a conexão do npm e repita o instalador."
else
  echo "Aviso: npm indisponível. Necessário para gerar imagens QR locais."
fi
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
Description=RealTalent Connect WhatsApp (local, protegido)
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

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo ""
  echo "Docker Compose não está instalado: precisamos prepará-lo uma única vez."
  echo "O aplicativo continuará abrindo normalmente para vincular o computador."
  if [[ -f /etc/debian_version ]] && command -v apt-get >/dev/null 2>&1; then
    echo ""
    read -r -p "Instalar Docker agora com permissão de administrador? [s/N]: " answer
    if [[ "$answer" == [sS] ]]; then
      echo "O Linux solicitará sua senha administrativa para instalar pacotes."
      sudo apt-get update
      sudo apt-get install -y docker.io
      if ! sudo apt-get install -y docker-compose-v2; then
        if ! sudo apt-get install -y docker-compose-plugin; then
          echo "O plugin Docker Compose v2 não está disponível neste repositório."
          echo "Instale o plugin Compose por meio dos pacotes oficiais da sua distribuição."
        fi
      fi
      sudo systemctl enable --now docker
      sudo groupadd -f docker
      sudo usermod -aG docker "$USER"
      echo "IMPORTANTE: saia da sua conta Linux e entre novamente para obter a permissão de Docker."
      echo "O grupo docker dá poderes administrativos; use apenas neste computador de confiança."
    fi
  else
    echo "Em outros Linux, instale Docker Engine + plugin Compose pelo gerenciador da distribuição."
  fi
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://127.0.0.1:4375/ >/dev/null 2>&1 || true
fi
echo ""
echo "Abra: http://127.0.0.1:4375/"
echo "Depois: no CRM, Configurações → WhatsApp → Gerar código."
