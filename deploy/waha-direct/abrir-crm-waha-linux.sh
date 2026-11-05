#!/usr/bin/env bash
set -euo pipefail
echo "RealTalent CRM + WAHA — prévia sem Supabase para WhatsApp"
command -v git >/dev/null || { echo 'Git não instalado (sudo apt install git).';exit 1; }
command -v npm >/dev/null || { echo 'Node.js/npm não instalado.';exit 1; }
node -e 'if(+process.versions.node.split(".")[0]<22)process.exit(1)' || { echo 'Necessário Node.js 22+';exit 1; }
WAHA="$HOME/.local/share/realtalent-waha-gows/.env"
if [[ ! -f "$WAHA" ]];then echo 'WAHA não localizado. Nenhuma sessão foi alterada.';exit 1;fi
KEY=$(sed -n 's/^WAHA_API_KEY=//p' "$WAHA")
if [[ -z "$KEY" ]];then echo 'A chave WAHA não foi localizada.';exit 1;fi
echo 'Conferindo sessão WAHA existente...'
STATUS=$(curl -fsS --max-time 8 -H "X-Api-Key: $KEY" http://127.0.0.1:4385/api/sessions/realtalent || true)
unset KEY
if [[ "$STATUS" != *'"WORKING"'* ]];then echo 'Sessão realtalent não está WORKING. Confira WAHA primeiro.';exit 1;fi
unset STATUS
ROOT="$HOME/Downloads/RealTalent-WAHA-CRM-Preview"
BRANCH='feat/waha-direct-communications-20261105'
URL='https://github.com/CAMBRUSSIJJ/CRM-RealTalent.git'
if [[ -d "$ROOT/.git" ]];then
  if [[ -n "$(git -C "$ROOT" status --porcelain)" ]];then
    echo "Há mudanças locais em $ROOT; não serão sobrescritas."
    ROOT="$ROOT-$(date +%Y%m%d%H%M%S)"
  fi
elif [[ -e "$ROOT" ]];then
  ROOT="$ROOT-$(date +%Y%m%d%H%M%S)"
fi
if [[ ! -d "$ROOT/.git" ]];then
  git clone --depth 1 --branch "$BRANCH" "$URL" "$ROOT"
else
  git -C "$ROOT" fetch --depth 1 origin "$BRANCH"
  git -C "$ROOT" checkout -B "$BRANCH" FETCH_HEAD
fi
cd "$ROOT"
if [[ ! -f .env.local ]];then
  printf 'VITE_DATA_MODE=local\nVITE_RELEASE_CHANNEL=waha-direct-preview\n' > .env.local
  chmod 600 .env.local
fi
echo 'Instalando dependências só da prévia...'
npm ci --include=dev --no-fund
BRIDGE_PID=''
if ! curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:4390/health >/dev/null 2>&1;then
  echo 'Iniciando ponte WAHA na porta 4390...'
  bash deploy/waha-direct/start-linux.sh &
  BRIDGE_PID=$!
  for i in $(seq 1 25);do
    if curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:4390/health >/dev/null 2>&1;then break;fi
    sleep 1
  done
  if ! curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:4390/health >/dev/null 2>&1;then
    echo 'Ponte WAHA não iniciou. Confira este terminal.';exit 1
  fi
else
  echo 'Ponte já ativa; será reutilizada.'
fi
trap 'if [[ -n "$BRIDGE_PID" ]];then kill "$BRIDGE_PID" 2>/dev/null || true;fi' EXIT
echo
echo 'Prévia: http://127.0.0.1:5173'
echo 'Chave local: http://127.0.0.1:4390'
echo 'Abra a aba Comunicações para testar conversas.'
echo 'Esta prévia usa dados locais para o restante do CRM; produção intacta.'
echo 'Ctrl+C encerra a prévia sem desconectar WAHA Docker.'
(sleep 3; xdg-open http://127.0.0.1:5173 >/dev/null 2>&1 || true) &
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
