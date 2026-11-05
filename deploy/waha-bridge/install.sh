#!/usr/bin/env bash
set -euo pipefail
APP="$HOME/.local/share/realtalent-waha-bridge"
CFG="$HOME/.config/realtalent-waha-bridge"
WAHA="$HOME/.local/share/realtalent-waha-gows/.env"
mkdir -p "$APP" "$CFG"
chmod 700 "$CFG"
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(+process.versions.node.split(".")[0]>=22?0:1)';then
  echo 'Necessário Node.js 22+.';exit 1
fi
if [[ ! -f "$WAHA" ]];then echo 'WAHA local não localizado. Conecte-o primeiro.';exit 1;fi
curl -fsSL --retry 2 --max-time 25 \
  'https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/feat/waha-local-bridge-20261105/deploy/waha-bridge/local-status-bridge.mjs' \
  -o "$APP/local-status-bridge.mjs"
chmod 600 "$APP/local-status-bridge.mjs"
node --check "$APP/local-status-bridge.mjs"
if [[ ! -f "$CFG/.env" ]];then
  echo 'Ponte segura: precisamos da chave service_role do seu Supabase.'
  echo 'Não cole a chave nesta conversa; digite-a apenas neste terminal Linux.'
  read -r -s -p 'SUPABASE_SERVICE_ROLE_KEY: ' SK
  echo
  if [[ ${#SK} -lt 30 ]];then echo 'Chave inválida. Operação cancelada.';exit 1;fi
  umask 077
  printf 'SUPABASE_URL=https://bacdqruzxklfqdydijjn.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=%s\nWAHA_SESSION=realtalent\nREALTALENT_ENABLE_WA_NOTIFICATIONS=0\n' "$SK" > "$CFG/.env"
  unset SK
  FOUND=$(node --input-type=module - "$CFG/.env" <<'JS'
import fs from 'node:fs';
const c=Object.fromEntries(fs.readFileSync(process.argv[2],'utf8').split('\n')
  .filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)]}));
try{
 const r=await fetch(c.SUPABASE_URL+'/rest/v1/whatsapp_local_bridge?select=organization_id&limit=2',{headers:{apikey:c.SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+c.SUPABASE_SERVICE_ROLE_KEY},signal:AbortSignal.timeout(12000)});
 if(!r.ok)process.exit(3);
 const data=await r.json();if(data.length===1)console.log(data[0].organization_id);
}catch{process.exit(3)}
JS
  ) || { echo 'Não foi possível acessar o Supabase. Confira sua chave.';exit 1; }
  if [[ ! "$FOUND" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]];then
    echo 'Não foi possível determinar o workspace automaticamente.'
    read -r -p 'Cole o UUID do workspace no CRM: ' FOUND
  fi
  if [[ ! "$FOUND" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]];then echo 'UUID inválido';exit 1;fi
  printf 'ORGANIZATION_ID=%s\n' "$FOUND" >> "$CFG/.env"
  chmod 600 "$CFG/.env"
fi
echo
echo '=== TESTE DE CONEXÃO (sem revelar credenciais) ==='
node "$APP/local-status-bridge.mjs" --check
echo
echo '=== PONTE WAHA → CRM ATIVA ==='
echo 'Mantenha este terminal aberto. Ctrl+C encerra só a ponte, sem desligar WAHA.'
exec node "$APP/local-status-bridge.mjs"
