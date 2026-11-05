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
WAHA_KEY=$(sed -n 's/^WAHA_API_KEY=//p' "$WAHA")
if [[ -z "$WAHA_KEY" ]];then echo "WAHA_API_KEY não localizada.";exit 1;fi
if ! curl -fsS --max-time 7 -H "X-Api-Key: $WAHA_KEY" \
  http://127.0.0.1:4385/api/sessions/realtalent |
  grep -q '"WORKING"';then
  echo "WAHA não está WORKING. Abra o painel do WAHA antes de iniciar a ponte."
  exit 1
fi
unset WAHA_KEY
echo "Instalando conector oficial do repositório RealTalent..."
curl -fL --retry 2 --max-time 30 \
 "https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/feat/waha-direct-communications-20261105/deploy/waha-direct/server.mjs" \
 -o "$APP/server.mjs"
chmod 600 "$APP/server.mjs"
node --check "$APP/server.mjs"
echo
echo "Conector local: http://127.0.0.1:4392"
echo "Copie a chave local nessa página e abra Comunicações no RealTalent CRM."
echo "Sua WAHA_API_KEY original não será exibida nem enviada ao navegador."
echo "As notificações de tarefas permanecem desativadas."
echo "Este terminal deve ficar aberto. Ctrl+C encerra somente esta ponte."
echo
(sleep 2; xdg-open http://127.0.0.1:4392/ >/dev/null 2>&1 || true) &
exec env REALTALENT_WAHA_BRIDGE_PORT=4392 node "$APP/server.mjs"
