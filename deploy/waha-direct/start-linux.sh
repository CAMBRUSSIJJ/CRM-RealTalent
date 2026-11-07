#!/usr/bin/env bash
set -euo pipefail
APP="$HOME/.local/share/realtalent-waha-direct"
WAHA="$HOME/.local/share/realtalent-waha-gows/.env"
mkdir -p "$APP"
chmod 700 "$APP"
echo "RealTalent WAHA Direct — ponte local com transcrição de voz"
command -v node >/dev/null || { echo "Node.js 22+ necessário."; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])!==22)process.exit(1)' || { echo "Use Node.js 22."; exit 1; }
[[ -f "$WAHA" ]] || { echo "Configuração WAHA não encontrada."; exit 1; }
KEY=$(sed -n 's/^WAHA_API_KEY=//p' "$WAHA")
[[ -n "$KEY" ]] || { echo "WAHA_API_KEY não localizada."; exit 1; }
curl --noproxy '*' -fsS --max-time 10 -H "X-Api-Key: $KEY" http://127.0.0.1:4385/api/sessions/realtalent | grep -q '"WORKING"' || {
  echo "WAHA deve estar WORKING em http://127.0.0.1:4385/dashboard"
  exit 1
}
unset KEY
BASE="https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/feat/garimpo-trigger-intelligence-g43-supabase-20261106/deploy/waha-direct"
echo "Atualizando ponte e dependências do mesmo commit/branch..."
for name in server.mjs tools.mjs conversation-intelligence.mjs audio-transcription.mjs group-senders.mjs inline-voice.mjs auto-reply.mjs task-notifications.mjs transcribe-audio.py instalar-transcricao-local-linux.sh;do
  curl -fL --retry 2 --max-time 40 "$BASE/$name" -o "$APP/$name"
  chmod 600 "$APP/$name"
done
# The standalone bridge runs outside the Git checkout; install the canonical scheduler.
mkdir -p "$APP/notifications"
SCRIPT_BASE="https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/feat/garimpo-trigger-intelligence-g43-supabase-20261106/scripts"
curl -fL --retry 2 "$SCRIPT_BASE/local-task-whatsapp-scheduler.mjs" -o "$APP/local-task-whatsapp-scheduler.mjs"
curl -fL --retry 2 "$SCRIPT_BASE/notifications/notification-event-contract.mjs" -o "$APP/notifications/notification-event-contract.mjs"
chmod 600 "$APP/local-task-whatsapp-scheduler.mjs" "$APP/notifications/notification-event-contract.mjs"
node --check "$APP/task-notifications.mjs"
chmod 700 "$APP/instalar-transcricao-local-linux.sh"
node --check "$APP/server.mjs"
node --check "$APP/audio-transcription.mjs"
echo "Conector: http://127.0.0.1:4392"
echo "Chave local: http://127.0.0.1:4392/ (não compartilhe)"
if [[ ! -x "$HOME/.local/share/realtalent-whisper/venv/bin/python" ]];then
  echo "Para transcrever áudios: bash '$APP/instalar-transcricao-local-linux.sh'"
fi
echo "Ctrl+C encerra apenas a ponte. O WAHA Docker permanece conectado."
(sleep 2; xdg-open http://127.0.0.1:4392/ >/dev/null 2>&1 || true) &
exec env REALTALENT_WAHA_BRIDGE_PORT=4392 node "$APP/server.mjs"
