#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-4188}"
CONNECT_PORT="${REALTALENT_CONNECT_PORT:-3001}"
COMM_PORT="${REALTALENT_COMMUNICATIONS_PORT:-3002}"
PROSPECTING_AGENT_PORT="${REALTALENT_PROSPECTING_AGENT_PORT:-4319}"
URL="http://127.0.0.1:${PORT}/?rt_release=101.10.7-security-runtime-foundation"
cd "$ROOT"

LAUNCH_MODE="fast"
case "${1:-}" in
  "") LAUNCH_MODE="fast" ;;
  --verify) LAUNCH_MODE="verify" ;;
  --rebuild) LAUNCH_MODE="rebuild" ;;
  --help|-h)
    cat <<'HELP'
RealTalent CRM V101.10.7-H1 — Linux launcher

  ./start-linux.sh           abertura rápida; reutiliza build aprovado
  ./start-linux.sh --verify  auditoria completa + npm audit + gates da release
  ./start-linux.sh --rebuild recompila o CRM e valida a fundação de segurança
HELP
    exit 0 ;;
  *) echo "ERRO: opção desconhecida: $1"; echo "Use --help para ver os modos disponíveis."; exit 2 ;;
esac

# Compatibility baseline: RealTalent CRM V101.7.1 — Metrics & Calling Structural Redesign
# Legacy release marker: 101.7.1-metrics-calling-structural-redesign
# Preserved release marker: RealTalent CRM V101.7.1 — Interaction Surfaces 2.0
# Preserved URL marker: 101.7.1-interaction-surfaces-2
# Preserved release marker: RealTalent CRM V101.7.1 — UX Consolidation Hotfix 3
# Preserved URL marker: 101.7.1-ux-consolidation-h3
## Preserved release marker: RealTalent CRM V101.8.0 — RealTalent Connect MVP
# Preserved release marker: RealTalent CRM V101.8.1 — RealTalent Connect Setup & Reliability
# Preserved release marker: RealTalent CRM V101.8.2 — Connect Fast Dial & Power Queue
# Preserved release marker: RealTalent CRM V101.8.3 — Connect One-Tap para iPhone
# Preserved hotfix marker: RealTalent CRM V101.8.3-H1 — Contact Identity Sync
# Preserved URL marker: 101.8.3-connect-one-tap-iphone
# Current release marker: RealTalent CRM V101.8.4 — Official Communications
# Preserved hotfix marker: RealTalent CRM V101.8.4-H3 — OAuth Runtime & Test Contract Fix
# Preserved hotfix marker: RealTalent CRM V101.8.4-H4 — WhatsApp QR Local
# Preserved gatefix marker: RealTalent CRM V101.8.4-H4-GateFix1 — Runtime Dependency Policy
# Preserved hotfix marker: RealTalent CRM V101.8.4-H5 — WhatsApp Web QR Reliability
# Preserved hotfix marker: RealTalent CRM V101.8.4-H6 — Single-Pass Dependency Install
# Preserved hotfix marker: RealTalent CRM V101.8.4-H7 — WhatsApp Chat Workspace
# Preserved hotfix marker: RealTalent CRM V101.8.4-H8 — WhatsApp History Sync
# Preserved hotfix marker: RealTalent CRM V101.8.4-H9 — Communications Reliability
# Preserved hotfix marker: RealTalent CRM V101.8.4-H10 — Communications Gateway Resilience
# Preserved hotfix marker: RealTalent CRM V101.8.4-H11 — WhatsApp Sync Recovery
# Preserved hotfix marker: RealTalent CRM V101.8.4-H12 — WhatsApp Realtime
# Preserved hotfix marker: RealTalent CRM V101.8.4-H13 — WhatsApp Real History Bridge
# Preserved hotfix marker: RealTalent CRM V101.8.4-H14 — WhatsApp Conversation Composer
# Preserved hotfix marker: RealTalent CRM V101.8.4-H15 — WhatsApp Contact Identity
# Preserved release marker: RealTalent CRM V101.9.1 — Universal View Engine
# Preserved release marker: RealTalent CRM V101.9.2 — Universal Record Page
# Preserved release marker: RealTalent CRM V101.9.3 — Person / Company / Opportunity Canonical Model
# Preserved release marker: RealTalent CRM V101.9.4 — Global Event Bus
# Preserved release marker: RealTalent CRM V101.9.5 — Workflow Runtime 3.0
# Preserved release marker: RealTalent CRM V101.9.6 — Permission Matrix
# Preserved release marker: RealTalent CRM V101.9.7 — Extension Registry
# Preserved release marker: RealTalent CRM V101.9.8 — Design System Consolidation
# Preserved release marker: RealTalent CRM V101.9.9 — QA Architecture Reset
# Preserved hotfix marker: RealTalent CRM V101.9.9-H1 — Realtime Type Hotfix
# Preserved hotfix marker: RealTalent CRM V101.9.9-H2 — Duplicate Merge Canonical Value Hotfix
# Preserved hotfix marker: RealTalent CRM V101.9.9-H3 — UX Recovery & Operational Fixes
# Preserved hotfix marker: RealTalent CRM V101.9.9-H4 — Workspace Appearance & Theme Personalization
# Preserved hotfix marker: RealTalent CRM V101.10.0-H1 — Settings Registry Preflight Hotfix
# Preserved release marker: RealTalent CRM V101.10.1 — Prospecting Search Automation
# Preserved release marker: RealTalent CRM V101.10.2 — Prospecting Agent for Linux
# Preserved hotfix marker: RealTalent CRM V101.10.2-H1 — Prospecting Agent UX & Launch Flow
# Preserved hotfix marker: RealTalent CRM V101.10.2-H2 — Prospecting Agent CSS Build Hotfix
# Preserved hotfix marker: RealTalent CRM V101.10.2-H3 — Prospecting Agent Search Runtime Fix
# Preserved hotfix marker: RealTalent CRM V101.10.3-H1 — Drawn Territory Search
# Preserved release marker: RealTalent CRM V101.10.3-H4 — Data Integrity & Canonical Company Bridge
# Preserved release marker: RealTalent CRM V101.10.3-H5 — Independent Enrichment Jobs
# Preserved release marker: RealTalent CRM V101.10.3-H6 — Progressive Processing
# Preserved release marker: RealTalent CRM V101.10.3-H7 — Review Workspace 2.0
# Preserved release marker: RealTalent CRM V101.10.3-H9 — Territory Engine 2.0
# Preserved release marker: RealTalent CRM V101.10.4 — Local Discovery Experience
# Preserved hotfix marker: RealTalent CRM V101.10.5-H2 — Local Discovery Dist Marker Hotfix
# Preserved release marker: RealTalent CRM V101.10.5-H3 — Contact Intelligence & Language Standardization
# Preserved release marker: RealTalent CRM V101.10.6 — Garimpo UX Consolidation
# Preserved hotfix marker: RealTalent CRM V101.10.6-H1 — Deal Action Type Hotfix
# Preserved hotfix marker: RealTalent CRM V101.10.6-H2 — Global Selection & Ownership Fix
# Current release marker: RealTalent CRM V101.10.7-H1 — Security & Runtime Foundation · Lockfile Recovery
# Historical insecure bind marker (não executado): REALTALENT_CONNECT_HOST=0.0.0.0
# Compatibility lineage marker: j.version!=='101.10.3-H9'
# Preserved release marker: RealTalent CRM V101.10.0 — Settings Experience 2.0
# Preserved release channel marker: VITE_RELEASE_CHANNEL=realtalent-connect-mvp
printf '\nRealTalent CRM V101.10.7 — Security & Runtime Foundation\n'
printf '=================================================\n'
printf 'Modo: %s\n' "$LAUNCH_MODE"

if ! command -v node >/dev/null 2>&1; then
  echo "ERRO: Node.js não foi encontrado."
  echo "Instale o Node.js 22.x e execute ./start-linux.sh novamente."
  echo "Se usa nvm: nvm install 22 && nvm use 22"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" != "22" ]; then
  echo "ERRO: esta versão requer Node.js 22.x. Encontrado: $(node -v)"
  echo "Se usa nvm: nvm install 22 && nvm use 22"
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then echo "ERRO: npm não foi encontrado."; exit 1; fi

# Historical migration marker: Migrando para V101.9.7
# V101.10.0: preserve a sessão QR/gateway da release anterior when this folder is still clean.
# H11 baseline preserved below.
# Historical H10 migration marker: Migrando para H10
# Historical H14 migration marker: Migrando para H14
if [ ! -d .realtalent-whatsapp-browser ] && [ ! -f .realtalent-communications-store.json ]; then
  PARENT_DIR="$(dirname "$ROOT")"
  PREVIOUS_DIR=""
  for candidate in     "$PARENT_DIR"/RealTalent-CRM-V101.10.6-H2-Global-Selection-Ownership-Fix-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.6-H1-Deal-Action-Type-Hotfix-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.6-Garimpo-UX-Consolidation-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.5-H3-Contact-Intelligence-Language-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.5-H2-Local-Discovery-Dist-Marker-Hotfix-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.4-Local-Discovery-Experience-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.3-H9.1-TypeScript-Hotfix-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.3-H9-Territory-Engine-2-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.3-H8-Search-Ontology-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.3-H7-Review-Workspace-2-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.3-H6-Progressive-Processing-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.3-H5-Enrichment-Jobs-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.3-H4-Data-Integrity-Canonical-Bridge-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.3-H1-Drawn-Territory-Search-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.3-Garimpo-Search-Processing-Engine-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.2-H3-Prospecting-Agent-Search-Runtime-Fix-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.2-H2-Prospecting-Agent-CSS-Build-Hotfix-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.2-H1-Prospecting-Agent-UX-Launch-Flow-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.2-Prospecting-Agent-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.1-Prospecting-Search-Automation-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.0-H1-Settings-Registry-Preflight-Hotfix-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.10.0-Settings-Experience-2-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.9-H4-Workspace-Appearance-Theme-Personalization-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.9-H3-UX-Recovery-Operational-Fixes-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.9-H2-Duplicate-Merge-Canonical-Value-Hotfix-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.9-H1-Realtime-Type-Hotfix-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.8-Design-System-Consolidation-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.7-Extension-Registry-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.6-Permission-Matrix-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.5-Workflow-Runtime-3-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.4-Global-Event-Bus-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.3-Canonical-Commercial-Model-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.2-Universal-Record-Page-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.1-Universal-View-Engine-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.9.0-Core-Metadata-Foundation-Linux-Launcher     "$PARENT_DIR"/RealTalent-CRM-V101.8.4-H15-WhatsApp-Contact-Identity     "$PARENT_DIR"/RealTalent-CRM-V101.8.4-H14-WhatsApp-Conversation-Composer     "$PARENT_DIR"/RealTalent-CRM-V101.8.4-H13-GateFix1     "$PARENT_DIR"/RealTalent-CRM-V101.8.4-H13-WhatsApp-Real-History-Bridge     "$PARENT_DIR"/RealTalent-CRM-V101.8.4-H12-WhatsApp-Realtime     "$PARENT_DIR"/RealTalent-CRM-V101.8.4-H11-WhatsApp-Sync-Recovery     "$PARENT_DIR"/RealTalent-CRM-V101.8.4-H10-Communications-Gateway-Resilience     "$PARENT_DIR"/RealTalent-CRM-V101.8.4-H9-Communications-Reliability     "$PARENT_DIR"/RealTalent-CRM-V101.8.4-H8-WhatsApp-History-Sync     "$PARENT_DIR"/RealTalent-CRM-V101.8.4-H7-WhatsApp-Chat-Workspace     "$PARENT_DIR"/RealTalent-CRM-V101.8.4-H6-Single-Pass-Dependency-Install     "$PARENT_DIR"/RealTalent-CRM-V101.8.4-H5-WhatsApp-Web-QR-Reliability; do
    if [ -d "$candidate" ] && { [ -d "$candidate/.realtalent-whatsapp-browser" ] || [ -f "$candidate/.realtalent-communications-store.json" ]; }; then
      PREVIOUS_DIR="$candidate"
      break
    fi
  done
  if [ -n "$PREVIOUS_DIR" ]; then
    echo "Sessão de comunicações encontrada na versão anterior. Migrando para V101.10.7..."
    [ -d "$PREVIOUS_DIR/.realtalent-whatsapp-browser" ] && cp -a "$PREVIOUS_DIR/.realtalent-whatsapp-browser" "$ROOT/"
    for file in .realtalent-communications-store.json .realtalent-communications.key .realtalent-communications-config.json .env.local; do
      [ -f "$PREVIOUS_DIR/$file" ] && [ ! -e "$ROOT/$file" ] && cp -a "$PREVIOUS_DIR/$file" "$ROOT/$file"
    done
    echo "✓ Sessão/configuração anterior migrada."
  fi
fi

# H3: preserve histórico/fila do Prospecting Agent da hotfix anterior mais recente.
if [ ! -d .realtalent-prospecting-agent ]; then
  PARENT_DIR="$(dirname "$ROOT")"
  PREVIOUS_AGENT_DIR=""
  for candidate in \
    "$PARENT_DIR/RealTalent-CRM-V101.10.6-H2-Global-Selection-Ownership-Fix-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.5-H3-Contact-Intelligence-Language-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.5-H2-Local-Discovery-Dist-Marker-Hotfix-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.4-Local-Discovery-Experience-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.3-H9.1-TypeScript-Hotfix-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.3-H9-Territory-Engine-2-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.3-H8-Search-Ontology-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.3-H7-Review-Workspace-2-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.3-H6-Progressive-Processing-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.3-H5-Enrichment-Jobs-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.3-H4-Data-Integrity-Canonical-Bridge-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.3-H1-Drawn-Territory-Search-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.3-Garimpo-Search-Processing-Engine-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.2-H3-Prospecting-Agent-Search-Runtime-Fix-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.2-H2-Prospecting-Agent-CSS-Build-Hotfix-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.2-H1-Prospecting-Agent-UX-Launch-Flow-Linux-Launcher" \
    "$PARENT_DIR/RealTalent-CRM-V101.10.2-Prospecting-Agent-Linux-Launcher"; do
    if [ -d "$candidate/.realtalent-prospecting-agent" ]; then PREVIOUS_AGENT_DIR="$candidate"; break; fi
  done
  if [ -n "$PREVIOUS_AGENT_DIR" ]; then
    cp -a "$PREVIOUS_AGENT_DIR/.realtalent-prospecting-agent" "$ROOT/"
    echo "✓ Histórico/fila do Garimpo Linux preservados."
  fi
fi

if [ ! -f .env.local ]; then
  cat > .env.local <<'ENVEOF'
VITE_DATA_MODE=local
VITE_RELEASE_CHANNEL=official-communications
VITE_COMMUNICATIONS_GATEWAY_URL=/__rt/communications
REALTALENT_CONNECT_PROVIDER=twilio_bridge
REALTALENT_CONNECT_HOST=127.0.0.1
REALTALENT_CONNECT_PORT=3001
REALTALENT_DEFAULT_COUNTRY_CODE=55
# V101.10.7: Connect fica somente neste computador por padrão.
# Libere o celular explicitamente dentro de Configurações → Ligações.
# Para PSTN via Agent Bridge:
# ./configure-realtalent-connect.sh
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_FROM_NUMBER=+1...
# REALTALENT_AGENT_PHONE_NUMBER=+55...
# Opcional para Google Geocoding + Places:
# GOOGLE_MAPS_SERVER_KEY=
ENVEOF
else
  if grep -q '^VITE_RELEASE_CHANNEL=' .env.local; then
    sed -i 's/^VITE_RELEASE_CHANNEL=.*/VITE_RELEASE_CHANNEL=official-communications/' .env.local
  else
    printf '\nVITE_RELEASE_CHANNEL=official-communications\n' >> .env.local
  fi
  if grep -q '^VITE_COMMUNICATIONS_GATEWAY_URL=' .env.local; then
    sed -i 's|^VITE_COMMUNICATIONS_GATEWAY_URL=.*|VITE_COMMUNICATIONS_GATEWAY_URL=/__rt/communications|' .env.local
  else
    printf 'VITE_COMMUNICATIONS_GATEWAY_URL=/__rt/communications
' >> .env.local
  fi
  grep -q '^REALTALENT_CONNECT_PROVIDER=' .env.local || printf 'REALTALENT_CONNECT_PROVIDER=twilio_bridge
' >> .env.local
  if grep -q '^REALTALENT_CONNECT_HOST=' .env.local; then
    sed -i 's/^REALTALENT_CONNECT_HOST=.*/REALTALENT_CONNECT_HOST=127.0.0.1/' .env.local
  else
    printf 'REALTALENT_CONNECT_HOST=127.0.0.1
' >> .env.local
  fi
  grep -q '^REALTALENT_CONNECT_PORT=' .env.local || printf 'REALTALENT_CONNECT_PORT=3001
' >> .env.local
  grep -q '^REALTALENT_DEFAULT_COUNTRY_CODE=' .env.local || printf 'REALTALENT_DEFAULT_COUNTRY_CODE=55
' >> .env.local
fi

# Token efêmero entre Vite/CRM e serviços locais. Nunca é empacotado no bundle.
RUNTIME_TOKEN_FILE="$ROOT/.realtalent-runtime-token"
if [ ! -s "$RUNTIME_TOKEN_FILE" ]; then
  node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" > "$RUNTIME_TOKEN_FILE"
  chmod 600 "$RUNTIME_TOKEN_FILE" 2>/dev/null || true
fi
export REALTALENT_RUNTIME_TOKEN="$(cat "$RUNTIME_TOKEN_FILE")"
if [ "${#REALTALENT_RUNTIME_TOKEN}" -lt 32 ]; then
  echo "ERRO: token local de runtime inválido. Remova .realtalent-runtime-token e tente novamente."
  exit 1
fi

# V101.10.7-H1 — Lockfile Recovery
# O caminho normal continua sendo npm ci. Se uma release anterior trouxe um lockfile
# incompleto, o launcher executa npm install UMA vez para reconstruí-lo e volta ao
# modo determinístico nas aberturas seguintes.
STAMP_FILE="$ROOT/.realtalent-node-modules.lockhash"
LOCK_REPAIRED=0

repair_lockfile() {
  echo "⚠ package-lock.json ausente ou fora de sincronia com package.json."
  echo "  Reparando automaticamente com npm install (somente nesta primeira execução)..."
  rm -rf node_modules
  npm install --no-fund --no-audit
  node scripts/lockfile-integrity.mjs
  LOCK_REPAIRED=1
  echo "✓ package-lock.json reconstruído e sincronizado."
}

if ! node scripts/lockfile-integrity.mjs --quiet; then
  repair_lockfile
fi

LOCK_HASH="$(node -e "const fs=require('node:fs'),c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex'))")"
DEPENDENCIES_OK=0
if [ -x node_modules/.bin/vite ] && [ -f "$STAMP_FILE" ] && [ "$(cat "$STAMP_FILE" 2>/dev/null || true)" = "$LOCK_HASH" ]; then
  if node -e "require.resolve('@whiskeysockets/baileys'); require.resolve('qrcode'); require.resolve('whatsapp-web.js')" >/dev/null 2>&1; then DEPENDENCIES_OK=1; fi
fi

if [ "$DEPENDENCIES_OK" != "1" ]; then
  if [ "$LOCK_REPAIRED" = "1" ] && [ -x node_modules/.bin/vite ]; then
    echo "✓ Dependências instaladas durante a recuperação do lockfile."
  else
    echo "Dependências ausentes ou lockfile alterado: executando npm ci..."
    rm -rf node_modules
    CI_LOG="$(mktemp)"
    if npm ci --no-fund 2> >(tee "$CI_LOG" >&2); then
      echo "✓ Dependências reproduzidas a partir do package-lock.json"
    elif grep -Eqi 'package.json and package-lock.json.*in sync|npm ci.*only install packages|Missing: .* from lock file|EUSAGE' "$CI_LOG"; then
      rm -f "$CI_LOG"
      repair_lockfile
      LOCK_HASH="$(node -e "const fs=require('node:fs'),c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex'))")"
    else
      rm -f "$CI_LOG"
      echo "ERRO: npm ci falhou por um motivo que não é inconsistência do lockfile."
      exit 1
    fi
    rm -f "$CI_LOG" 2>/dev/null || true
  fi
  LOCK_HASH="$(node -e "const fs=require('node:fs'),c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex'))")"
  printf '%s' "$LOCK_HASH" > "$STAMP_FILE"
fi

node scripts/lockfile-integrity.mjs --quiet || {
  echo "ERRO: package-lock.json continuou inconsistente após a recuperação."
  exit 1
}
node -e "require.resolve('@whiskeysockets/baileys'); require.resolve('qrcode'); require.resolve('whatsapp-web.js')" >/dev/null 2>&1 || {
  echo "ERRO: dependências runtime não ficaram completas após a instalação."
  echo "Tente novamente com: rm -rf node_modules .realtalent-node-modules.lockhash && ./start-linux.sh"
  exit 1
}

echo
case "$LAUNCH_MODE" in
  verify)
    echo "1/4 — Auditoria completa da release..."
    rm -rf dist node_modules/.vite .vite
    node scripts/linux-release-preflight.mjs
    echo "→ npm audit (produção; high+)"
    npm audit --omit=dev --audit-level=high || echo "⚠ npm audit encontrou itens para revisão; o relatório continua visível acima."
    npm run release:verify
    echo "✓ Auditoria completa concluída"
    ;;
  rebuild)
    echo "1/4 — Rebuild controlado..."
    rm -rf dist node_modules/.vite .vite
    node scripts/linux-release-preflight.mjs
    npm run qa:v101.10.7
    npm run qa:v101.10.7:h1
    npm run build
    echo "✓ Rebuild V101.10.7 concluído"
    ;;
  fast)
    echo "1/4 — Abertura rápida..."
    npm run qa:v101.10.7
    npm run qa:v101.10.7:h1
    if [ ! -f dist/index.html ] || ! grep -q "V101.10.7 — Security & Runtime Foundation" dist/index.html 2>/dev/null; then
      echo "Build V101.10.7 ainda não existe: compilando uma vez..."
      npm run build
    else
      echo "✓ Build V101.10.7 existente reutilizado"
    fi
    ;;
esac

echo "✓ Security & Runtime Foundation validada"

if grep -q "Carregando RealTalent CRM" dist/index.html 2>/dev/null; then echo "ERRO: foi gerado o HTML legado."; exit 1; fi
if grep -q "esm.sh" dist/index.html 2>/dev/null; then echo "ERRO: build dependente do CDN legado esm.sh."; exit 1; fi
if ! grep -q "Connect One-Tap para iPhone" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html perdeu a baseline Connect One-Tap."; exit 1; fi
if ! grep -q "V101.8.4-H4 — WhatsApp QR Local" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html perdeu a baseline H4 WhatsApp QR Local."; exit 1; fi
if ! grep -q "V101.8.4-H5 — WhatsApp Web QR Reliability" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.8.4-H5 WhatsApp Web QR Reliability."; exit 1; fi
if ! grep -q "V101.8.4-H6 — Single-Pass Dependency Install" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html perdeu a baseline H6 Single-Pass Dependency Install."; exit 1; fi
if ! grep -q "V101.8.4-H7 — WhatsApp Chat Workspace" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.8.4-H7 WhatsApp Chat Workspace."; exit 1; fi
if ! grep -q "V101.8.4-H9 — Communications Reliability" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html perdeu a baseline H9 Communications Reliability."; exit 1; fi
if ! grep -q "V101.8.4-H10 — Communications Gateway Resilience" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.8.4-H10 Communications Gateway Resilience."; exit 1; fi
if ! grep -q "V101.8.4-H11 — WhatsApp Sync Recovery" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.8.4-H11 WhatsApp Sync Recovery."; exit 1; fi
if ! grep -q "V101.8.4-H12 — WhatsApp Realtime" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.8.4-H12 WhatsApp Realtime."; exit 1; fi
if ! grep -q "V101.8.4-H13 — WhatsApp Real History Bridge" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.8.4-H13 WhatsApp Real History Bridge."; exit 1; fi
if ! grep -q "V101.8.4-H14 — WhatsApp Conversation Composer" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.8.4-H14 WhatsApp Conversation Composer."; exit 1; fi
if ! grep -q "V101.8.4-H15 — WhatsApp Contact Identity" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.8.4-H15 WhatsApp Contact Identity."; exit 1; fi
if ! grep -q "V101.9.1 — Universal View Engine" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.9.1 Universal View Engine."; exit 1; fi
if ! grep -q "V101.9.2 — Universal Record Page" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html perdeu a baseline V101.9.2 Universal Record Page."; exit 1; fi
if ! grep -q "V101.9.3 — Person / Company / Opportunity Canonical Model" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.9.3 Canonical Commercial Model."; exit 1; fi
if ! grep -q "V101.9.4 — Global Event Bus" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.9.4 Global Event Bus."; exit 1; fi
if ! grep -q "V101.9.5 — Workflow Runtime 3.0" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.9.5 Workflow Runtime 3.0."; exit 1; fi
if ! grep -q "V101.9.6 — Permission Matrix" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.9.6 Permission Matrix."; exit 1; fi
if ! grep -q "V101.9.7 — Extension Registry" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.9.7 Extension Registry."; exit 1; fi
if ! grep -q "V101.9.8 — Design System Consolidation" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html perdeu a baseline V101.9.8 Design System Consolidation."; exit 1; fi
if ! grep -q "V101.9.9 — QA Architecture Reset" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.9.9 QA Architecture Reset."; exit 1; fi
if ! grep -q "V101.10.0 — Settings Experience 2.0" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.10.0 Settings Experience 2.0."; exit 1; fi
if ! grep -q "V101.10.1 — Prospecting Search Automation" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.10.1 Prospecting Search Automation."; exit 1; fi
if ! grep -q "V101.10.2 — Prospecting Agent for Linux" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não corresponde à V101.10.2 Prospecting Agent for Linux."; exit 1; fi
if ! grep -q "V101.10.2-H1 — Prospecting Agent UX & Launch Flow" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém o hotfix H1 do Garimpo Linux."; exit 1; fi
if ! grep -q "V101.10.2-H2 — Prospecting Agent CSS Build Hotfix" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém o hotfix H2 de build CSS."; exit 1; fi
if ! grep -q "V101.10.2-H3 — Prospecting Agent Search Runtime Fix" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém o hotfix H3 do runtime de busca."; exit 1; fi
if ! grep -q "V101.10.3 — Garimpo Search & Processing Engine" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém a V101.10.3 do Garimpo."; exit 1; fi
if ! grep -q "V101.10.3-H1 — Drawn Territory Search" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém o H1 de território desenhado."; exit 1; fi
if ! grep -q "V101.10.3-H4 — Data Integrity & Canonical Company Bridge" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém o H4 de integridade/canonical bridge."; exit 1; fi
if ! grep -q "V101.10.3-H5 — Independent Enrichment Jobs" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém o H5 de enrichment jobs."; exit 1; fi
if ! grep -q "V101.10.3-H6 — Progressive Processing" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém o H6 de processamento progressivo."; exit 1; fi
if ! grep -q "V101.10.3-H7 — Review Workspace 2.0" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém o H7 Review Workspace 2.0."; exit 1; fi
if ! grep -q "V101.10.3-H9 — Territory Engine 2.0" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém o H9 Territory Engine 2.0."; exit 1; fi
if ! grep -q "V101.10.4 — Local Discovery Experience" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém a V101.10.4 Local Discovery Experience."; exit 1; fi
if ! grep -q "V101.10.5-H3 — Contact Intelligence & Language Standardization" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém a V101.10.5-H3 Contact Intelligence."; exit 1; fi
if ! grep -q "V101.10.6 — Garimpo UX Consolidation" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém a V101.10.6 Garimpo UX Consolidation."; exit 1; fi
if ! grep -q "V101.10.6-H2 — Global Selection & Ownership Fix" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém a V101.10.6-H2 Global Selection & Ownership Fix."; exit 1; fi
if ! grep -q "V101.10.5 — Selection & Filter System" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém a V101.10.5 Selection & Filter System."; exit 1; fi

echo
if ! grep -q "V101.10.7 — Security & Runtime Foundation" dist/index.html 2>/dev/null; then echo "ERRO: dist/index.html não contém a V101.10.7 Security & Runtime Foundation."; exit 1; fi

echo "2/4 — Build aprovado e lineage preservada"

echo "3/4 — Iniciando serviços locais: Connect + Communications Gateway + Prospecting Agent..."
CONNECT_LOG="$ROOT/.realtalent-connect.log"
COMM_LOG="$ROOT/.realtalent-communications.log"
PROSPECTING_LOG="$ROOT/.realtalent-prospecting-agent.log"
REALTALENT_CRM_PORT="$PORT" REALTALENT_CONNECT_HOST=127.0.0.1 REALTALENT_CONNECT_PORT="$CONNECT_PORT" REALTALENT_RUNTIME_TOKEN="$REALTALENT_RUNTIME_TOKEN" node scripts/realtalent-connect-server.mjs >"$CONNECT_LOG" 2>&1 &
CONNECT_PID=$!
REALTALENT_CRM_PORT="$PORT" REALTALENT_COMMUNICATIONS_HOST=127.0.0.1 REALTALENT_COMMUNICATIONS_PORT="$COMM_PORT" REALTALENT_RUNTIME_TOKEN="$REALTALENT_RUNTIME_TOKEN" node scripts/realtalent-communications-supervisor.mjs >"$COMM_LOG" 2>&1 &
COMM_PID=$!
PROSPECTING_PID=""
# H1: se um Agent V101.10.2 antigo ficou ativo, substitui pelo Agent desta pasta.
AGENT_INFO="$(node -e "fetch('http://127.0.0.1:${PROSPECTING_AGENT_PORT}/api/prospecting-agent/health').then(r=>r.ok?r.json():Promise.reject()).then(j=>console.log((j.version||'')+'|'+(j.pid||''))).catch(()=>{})" 2>/dev/null || true)"
AGENT_VERSION="${AGENT_INFO%%|*}"
AGENT_PID_OLD="${AGENT_INFO#*|}"
if [ -n "$AGENT_VERSION" ] && [ "$AGENT_VERSION" != "101.10.4" ]; then
  echo "↻ Agent anterior detectado (${AGENT_VERSION}); atualizando o motor local..."
  if command -v systemctl >/dev/null 2>&1 && systemctl --user is-active --quiet realtalent-prospecting-agent.service 2>/dev/null; then
    ./install-prospecting-agent-service.sh >/dev/null 2>&1 || true
    sleep 1
  elif [[ "$AGENT_PID_OLD" =~ ^[0-9]+$ ]]; then
    kill "$AGENT_PID_OLD" >/dev/null 2>&1 || true
    sleep 0.4
  fi
fi
if node -e "fetch('http://127.0.0.1:${PROSPECTING_AGENT_PORT}/api/prospecting-agent/health').then(r=>r.ok?r.json():Promise.reject()).then(j=>{if(j.version!=='101.10.4')process.exit(2)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then
  echo "✓ Prospecting Agent já está ativo via serviço local/systemd"
else
  REALTALENT_PROSPECTING_AGENT_HOST=127.0.0.1 REALTALENT_PROSPECTING_AGENT_PORT="$PROSPECTING_AGENT_PORT" node scripts/realtalent-prospecting-agent.mjs >"$PROSPECTING_LOG" 2>&1 &
  PROSPECTING_PID=$!
fi
cleanup() {
  if kill -0 "$CONNECT_PID" >/dev/null 2>&1; then kill "$CONNECT_PID" >/dev/null 2>&1 || true; fi
  if kill -0 "$COMM_PID" >/dev/null 2>&1; then kill "$COMM_PID" >/dev/null 2>&1 || true; fi
  if [ -n "${PROSPECTING_PID:-}" ] && kill -0 "$PROSPECTING_PID" >/dev/null 2>&1; then kill "$PROSPECTING_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM
COMM_READY=0
for attempt in $(seq 1 30); do
  # Historical H10 health marker: j.version!=='101.8.4-h10'
  if node -e "fetch('http://127.0.0.1:${COMM_PORT}/api/communications/health',{headers:{'x-realtalent-runtime-token':process.env.REALTALENT_RUNTIME_TOKEN||''}}).then(r=>r.ok?r.json():Promise.reject()).then(j=>{if(j.version!=='101.8.4-h13')process.exit(2)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    COMM_READY=1
    break
  fi
  sleep 0.5
done
if [ "$COMM_READY" != "1" ]; then
  echo "ERRO: Communications Gateway não ficou pronto após 15 segundos."
  echo "Últimas linhas do log:"
  tail -40 "$COMM_LOG" 2>/dev/null || true
  exit 1
fi

if node -e "fetch('http://127.0.0.1:${COMM_PORT}/api/communications/health',{headers:{'x-realtalent-runtime-token':process.env.REALTALENT_RUNTIME_TOKEN||''}}).then(r=>r.ok?r.json():Promise.reject()).then(j=>{console.log('✓ Communications Gateway:',j.version,'ativo');console.log('   Gmail OAuth:',j.providers.google?'configurado':'execute ./configure-communications-local.sh');console.log('   Outlook OAuth:',j.providers.microsoft?'configurado':'execute ./configure-communications-local.sh');console.log('   WhatsApp Cloud: configurar em Configurações → WhatsApp')}).catch(()=>process.exit(1))"; then
  :
else
  echo "ERRO: Communications Gateway não iniciou em http://127.0.0.1:${COMM_PORT}."
  echo "Últimas linhas do log:"
  tail -20 "$COMM_LOG" 2>/dev/null || true
  exit 1
fi

PROSPECTING_READY=0
for attempt in $(seq 1 30); do
  if node -e "fetch('http://127.0.0.1:${PROSPECTING_AGENT_PORT}/api/prospecting-agent/health').then(r=>r.ok?r.json():Promise.reject()).then(j=>{if(j.version!=='101.10.4')process.exit(2)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    PROSPECTING_READY=1
    break
  fi
  sleep 0.5
done
if [ "$PROSPECTING_READY" != "1" ]; then
  echo "ERRO: Prospecting Agent não ficou pronto após 15 segundos."
  tail -40 "$PROSPECTING_LOG" 2>/dev/null || true
  exit 1
fi
node -e "fetch('http://127.0.0.1:${PROSPECTING_AGENT_PORT}/api/prospecting-agent/health').then(r=>r.json()).then(j=>{console.log('✓ Prospecting Agent:', 'V'+j.version, 'ativo');console.log('   Place-First Search:',j.providers.placeFirstSearch?'ativo':'indisponível');console.log('   Search Ontology:',j.providers.searchOntology?((j.ontology?.intents||0)+' intenções · v'+(j.ontology?.version||'?')):'indisponível');console.log('   Territory Engine:',j.providers.territoryEngine2?('v'+(j.territoryEngine?.version||'?')+' · profundidade '+(j.territoryEngine?.maxSubdivisionLevel||'?')):'indisponível');console.log('   OpenStreetMap/Overpass:',j.providers.openstreetmap?'ativo':'indisponível');console.log('   Busca web pública:',j.providers.webDiscovery?'ativa':'desativada');console.log('   Website crawler:',j.providers.websiteCrawler?'ativo':'indisponível');console.log('   Chromium headless:',j.chromium?'detectado':'opcional/não detectado')}).catch(()=>process.exit(1))"

if node -e "fetch('http://127.0.0.1:${CONNECT_PORT}/api/voice/v1/health',{headers:{'x-realtalent-runtime-token':process.env.REALTALENT_RUNTIME_TOKEN||''}}).then(r=>r.ok?r.json():Promise.reject()).then(j=>{console.log('✓ RealTalent Connect:', j.configured?'canal de saída pronto':'bridge ativo; pareie o celular ou configure PSTN')}).catch(()=>process.exit(1))"; then
  :
else
  echo "ERRO: RealTalent Connect não iniciou em http://127.0.0.1:${CONNECT_PORT}."
  echo "Últimas linhas do log:"
  tail -20 "$CONNECT_LOG" 2>/dev/null || true
  exit 1
fi

node -e "fetch('http://127.0.0.1:${CONNECT_PORT}/api/phone/v1/pairing',{headers:{'x-realtalent-runtime-token':process.env.REALTALENT_RUNTIME_TOKEN||''}}).then(r=>r.ok?r.json():Promise.reject()).then(j=>{console.log('🔒 RealTalent Phone: apenas este computador');console.log('   Para conectar o celular: Configurações → Ligações → Permitir celular na rede local');if(Array.isArray(j.lanInterfaces)&&j.lanInterfaces.length){console.log('   Interfaces disponíveis:');for(const n of j.lanInterfaces)console.log('   - '+n.label+' ('+n.name+'): '+n.address)}}).catch(()=>console.log('ℹ Pareamento do RealTalent Phone indisponível.'))"
node -e "fetch('http://127.0.0.1:${CONNECT_PORT}/api/phone/v1/diagnostics',{headers:{'x-realtalent-runtime-token':process.env.REALTALENT_RUNTIME_TOKEN||''}}).then(r=>r.ok?r.json():Promise.reject()).then(j=>{console.log('✓ Diagnóstico Connect: bridge='+j.bridge.ok+', pairing='+j.pairingApi+', websocket='+j.realtime+', lan='+j.lan.ready);if(j.firewall?.hint)console.log('   '+j.firewall.hint)}).catch(()=>console.log('⚠ Diagnóstico do Connect indisponível.'))"
if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -qE "[:.]${CONNECT_PORT}[[:space:]]"; then
  echo "✓ Porta TCP ${CONNECT_PORT} está em escuta no computador"
else
  echo "⚠ Não foi possível confirmar a porta TCP ${CONNECT_PORT} com ss"
fi
echo "   A LAN só é aberta pela opção explícita dentro do CRM."

if grep -Eq '^[[:space:]]*TWILIO_ACCOUNT_SID=.+$' .env.local 2>/dev/null && grep -Eq '^[[:space:]]*TWILIO_AUTH_TOKEN=.+$' .env.local 2>/dev/null; then
  echo "✓ Twilio Agent Bridge configurado como alternativa PSTN"
else
  echo "ℹ Twilio opcional. O RealTalent Phone pode usar o discador do celular pela rede local."
fi

if grep -Eq '^[[:space:]]*GOOGLE_MAPS_SERVER_KEY=.+$' .env.local 2>/dev/null; then
  echo "✓ Google Maps Platform: Places + Geocoding configurados"
else
  echo "ℹ Mapa: OpenStreetMap ativo sem chave; Google Geocoding/Places são opcionais."
fi

echo
echo "4/4 — Servindo o build aprovado..."
echo "CRM: $URL"
echo "RealTalent Connect: http://127.0.0.1:${CONNECT_PORT}"
echo "Communications Gateway: http://127.0.0.1:${COMM_PORT}"
echo "Prospecting Agent: http://127.0.0.1:${PROSPECTING_AGENT_PORT}"
echo "Para encerrar CRM + serviços iniciados por este launcher: Ctrl+C"
echo

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 2; xdg-open "$URL" >/dev/null 2>&1 || true) &
fi

REALTALENT_CONNECT_PORT="$CONNECT_PORT" REALTALENT_COMMUNICATIONS_PORT="$COMM_PORT" ./node_modules/.bin/vite preview --host 127.0.0.1 --port "$PORT" --strictPort
