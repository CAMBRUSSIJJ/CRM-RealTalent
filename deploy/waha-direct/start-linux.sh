#!/usr/bin/env bash
set -euo pipefail
APP="$HOME/.local/share/realtalent-waha-direct"
WAHA="$HOME/.local/share/realtalent-waha-gows/.env"
mkdir -p "$APP"
chmod 700 "$APP"
echo "==============================================="
echo " RealTalent WAHA Direct — sem Supabase"
echo "==============================================="
if ! command -v node >/dev/null 2>&1;then echo "ERRO: Node.js 22+ necessário.";exit 1;fi
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { echo "Instale Node.js 22+";exit 1; }
if [[ ! -f "$WAHA" ]];then echo "ERRO: instalação WAHA não encontrada em $WAHA";exit 1;fi
echo "Consultando WAHA local..."
if ! curl -fsS --max-time 4 http://127.0.0.1:4385/health >/dev/null 2>&1;then
  echo "O WAHA ainda não responde na porta 4385. Abra o Docker primeiro."
  exit 1
fi
echo "Instalando conector oficial do repositório RealTalent..."
curl -fL --retry 2 --max-time 30 \
 "https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/feat/waha-direct-communications-20261105/deploy/waha-direct/server.mjs" \
 -o "$APP/server.mjs"
chmod 600 "$APP/server.mjs"
node --check "$APP/server.mjs"
echo
echo "Conector local: http://127.0.0.1:4390"
echo "Copie a chave local nessa página e abra Comunicações no RealTalent CRM."
echo "Sua WAHA_API_KEY original não será exibida nem enviada ao navegador."
echo "As notificações de tarefas permanecem desativadas."
echo "Este terminal deve ficar aberto. Ctrl+C encerra somente esta ponte."
echo
xdg-open http://127.0.0.1:4390/ >/dev/null 2>&1 || true
exec node "$APP/server.mjs"
