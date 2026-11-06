#!/usr/bin/env bash
set -euo pipefail
echo "==========================================="
echo " RealTalent V101.11.3 + WAHA IA + Áudios locais"
echo " Preserva a Central Pure Chat e o WhatsApp"
echo "==========================================="
command -v git >/dev/null || { echo "Instale git: sudo apt install git"; exit 1; }
command -v npm >/dev/null || { echo "Node/npm indisponíveis."; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])!==22)process.exit(1)' || { echo "É necessário Node.js 22."; exit 1; }
APP="$HOME/Downloads/RealTalent-CRM-V101-WAHA"
REPO="https://github.com/CAMBRUSSIJJ/CRM-RealTalent.git"
BRANCH="feat/garimpo-trigger-intelligence-g43-supabase-20261106"
WAHA_ENV="$HOME/.local/share/realtalent-waha-gows/.env"
[[ -f "$WAHA_ENV" ]] || { echo "WAHA local não encontrado. Nenhuma sessão foi alterada."; exit 1; }
KEY=$(sed -n 's/^WAHA_API_KEY=//p' "$WAHA_ENV")
[[ -n "$KEY" ]] || { echo "WAHA_API_KEY não encontrada em sua instalação."; exit 1; }
echo "Confirmando sessão WAHA realtalent..."
RESPONSE=$(curl --noproxy '*' -fsS --max-time 12 -H "X-Api-Key: $KEY" http://127.0.0.1:4385/api/sessions/realtalent || true)
unset KEY
if [[ "$RESPONSE" != *'"WORKING"'* ]]; then
  echo "Sessão WAHA não está WORKING. Confira o painel em http://127.0.0.1:4385/dashboard."
  exit 1
fi
unset RESPONSE
# Avoid replacing running services or conflicting with old preview.
if curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:5174/ >/dev/null 2>&1; then
  echo "O CRM V101 está aberto na porta 5174."
  echo "Feche o terminal da prévia anterior com Ctrl+C e execute este instalador novamente."
  exit 1
fi
if curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:4392/health >/dev/null 2>&1; then
  TOKEN_FILE="$HOME/.local/share/realtalent-waha-direct/access-token"
  if [[ ! -f "$TOKEN_FILE" ]]; then
    echo "Ponte 4392 ativa, mas token local não encontrado. Encerre a ponte antiga antes de continuar."
    exit 1
  fi
  BRIDGE_TOKEN=$(cat "$TOKEN_FILE")
  TOOLS_STATUS=$(curl --noproxy '*' -s -o /dev/null -w '%{http_code}' --max-time 5 -H "Authorization: Bearer $BRIDGE_TOKEN" http://127.0.0.1:4392/v1/preferences || true)
  if [[ "$TOOLS_STATUS" != "200" ]]; then
    echo "A ponte WAHA anterior está ativa. Encerre seu terminal para atualizar sem tocar no WhatsApp."
    exit 1
  fi
  FEATURE_STATUS=$(curl --noproxy '*' -s -H "Authorization: Bearer $BRIDGE_TOKEN" --max-time 5 http://127.0.0.1:4392/v1/features || true)
  # A chave local nunca deve ser exibida ou enviada para o chat.
  unset BRIDGE_TOKEN
  if [[ "$FEATURE_STATUS" != *'"task-notifications-waha-v5"'* || "$FEATURE_STATUS" != *'inline-reply-g411'* ]];then
    echo "A ponte WAHA antiga ainda está na porta 4392. Feche a prévia anterior (Ctrl+C) e execute novamente."
    exit 1
  fi
fi
if [[ -e "$APP" && ! -d "$APP/.git" ]]; then
  echo "O destino já existe e não contém o repositório: $APP"
  echo "Nada foi sobrescrito. Renomeie a pasta ou mova os seus arquivos antes."
  exit 1
fi
if [[ ! -d "$APP/.git" ]]; then
  echo "Baixando a base atual do CRM V101.11.3..."
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP"
else
  if [[ -n "$(git -C "$APP" status --porcelain)" ]]; then
    echo "O CRM da prévia contém alterações locais. Nada será sobrescrito."
    exit 1
  fi
  git -C "$APP" fetch --depth 1 origin "$BRANCH"
  git -C "$APP" checkout -B "$BRANCH" FETCH_HEAD
fi
cd "$APP"
# This is an isolated UI preview: the WAHA transport itself never uses Supabase.
# Do not copy CRM production credentials into this preview.
if [[ ! -e .env.local ]]; then
  umask 077
  cat > .env.local <<'ENV'
VITE_DATA_MODE=local
VITE_WAHA_DIRECT_PREVIEW=1
VITE_RELEASE_CHANNEL=V101.11.3-WAHA-LOCAL
ENV
fi
echo "Instalando dependências da versão V101.11.3 (sem alterar o CRM principal)..."
npm ci --include=dev --no-fund
if [[ "$(node -p 'require("./package.json").version')" != "101.11.3" ]]; then
  echo "ERRO: versão de CRM inesperada. Instalação interrompida."
  exit 1
fi
echo "=== Garimpo: conferindo busca pública por empresa (preservando WAHA) ==="
if ! bash scripts/garimpo-g4/ativar-garimpo-local.sh; then
  echo "A prévia CRM continuará. A investigação automática pode ficar indisponível; confira os avisos acima."
fi
echo "=== G4: conferindo a IA Qwen3 local (sem alterar agentes já ativos) ==="
if ! bash scripts/garimpo-g4/ativar-agente-local.sh;then
  echo "A prévia CRM continuará. Para usar G4, confira os avisos acima."
fi
BRIDGE_PID=''
if ! curl --noproxy '*' --silent --fail --max-time 2 http://127.0.0.1:4392/health >/dev/null 2>&1; then
  echo "Iniciando ponte WAHA local (127.0.0.1:4392)..."
  REALTALENT_WAHA_BRIDGE_PORT=4392 node deploy/waha-direct/server.mjs &
  BRIDGE_PID=$!
  for i in $(seq 1 35); do
    if curl --noproxy '*' --silent --fail --max-time 2 http://127.0.0.1:4392/health >/dev/null 2>&1; then break; fi
    sleep 1
  done
  if ! curl --noproxy '*' --silent --fail --max-time 2 http://127.0.0.1:4392/health >/dev/null 2>&1; then
    echo "Erro iniciando a ponte WAHA. Veja os logs acima."
    exit 1
  fi
fi
trap 'if [[ -n "$BRIDGE_PID" ]]; then kill "$BRIDGE_PID" 2>/dev/null || true; fi' EXIT
echo
echo "===== VERSÃO CORRETA ====="
node -p '"CRM V" + require("./package.json").version + " — Central Pure Chat preservada"'
echo "CRM V101.11.3: http://127.0.0.1:5174/"
echo "Chave da ponte: http://127.0.0.1:4392/"
echo "Entre em Comunicação > WAHA GOWS local > IA local > Análise comercial."
if [[ ! -x "$HOME/.local/share/realtalent-whisper/venv/bin/python" ]];then
  echo "Transcrição de áudio ainda não instalada (opcional para mensagens de texto)."
  echo "Para ativar: cd '$APP' && bash deploy/waha-direct/instalar-transcricao-local-linux.sh"
else
  echo "Transcritor local encontrado: faster-whisper CPU."
fi
echo "WAHA Docker e a prévia antiga em 5173 permanecem intactos."
echo "Ctrl+C para sair; WAHA Docker e o WhatsApp permanecem conectados."
echo
(sleep 3; xdg-open http://127.0.0.1:5174/ >/dev/null 2>&1 || true) &
./node_modules/.bin/vite --host 127.0.0.1 --port 5174 --strictPort
