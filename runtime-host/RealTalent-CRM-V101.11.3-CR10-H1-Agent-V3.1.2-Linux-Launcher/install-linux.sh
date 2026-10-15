#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale Node.js 22.x."
  echo "Com nvm: nvm install 22 && nvm use 22"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" != "22" ]; then echo "Esta versão requer Node.js 22.x. Encontrado: $(node -v)"; exit 1; fi
if ! command -v npm >/dev/null 2>&1; then echo "npm não encontrado."; exit 1; fi

if [ ! -f .env.local ]; then
  cat > .env.local <<'ENVEOF'
VITE_DATA_MODE=local
VITE_RELEASE_CHANNEL=consolidation-runtime-qa
REALTALENT_CONNECT_PROVIDER=twilio_bridge
REALTALENT_CONNECT_PORT=3001
# Execute ./configure-realtalent-connect.sh para habilitar chamadas reais.
# GOOGLE_MAPS_SERVER_KEY=
# Execute ./configure-google-maps.sh para Geocoding + Places.
ENVEOF
fi

npm ci --no-audit --no-fund || npm install --no-audit --no-fund
node scripts/linux-release-preflight.mjs
echo "Instalação concluída. Execute: ./start-linux.sh"
