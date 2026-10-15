#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || printf 'VITE_DATA_MODE=local\n' > "$ENV_FILE"

printf '\nRealTalent Connect — configurar telefonia real\n'
printf '============================================\n'
read -r -p "Twilio Account SID (AC...): " SID
read -r -s -p "Twilio Auth Token: " TOKEN; echo
read -r -p "Número Twilio de saída (E.164, ex. +15551234567): " FROM
read -r -p "Seu telefone/agente que deve tocar primeiro (E.164, ex. +5551999999999): " AGENT
read -r -p "Código do país padrão dos leads [55]: " COUNTRY
COUNTRY="${COUNTRY:-55}"

if [[ -z "$SID" || -z "$TOKEN" || -z "$FROM" || -z "$AGENT" ]]; then
  echo "ERRO: Account SID, Auth Token, número Twilio e telefone do agente são obrigatórios."
  exit 1
fi
if [[ ! "$SID" =~ ^AC[[:alnum:]]{32}$ ]]; then
  echo "ERRO: o Account SID da Twilio deve começar com AC e ter o formato esperado."
  exit 1
fi
if [[ ! "$FROM" =~ ^\+[1-9][0-9]{7,14}$ ]]; then
  echo "ERRO: informe o número Twilio no formato E.164, por exemplo +15551234567."
  exit 1
fi
if [[ ! "$AGENT" =~ ^\+[1-9][0-9]{7,14}$ ]]; then
  echo "ERRO: informe o telefone do agente no formato E.164, por exemplo +5551999999999."
  exit 1
fi
if [[ ! "$COUNTRY" =~ ^[1-9][0-9]{0,3}$ ]]; then
  echo "ERRO: código de país inválido. Para Brasil use 55."
  exit 1
fi

RT_SID="$SID" RT_TOKEN="$TOKEN" RT_FROM="$FROM" RT_AGENT="$AGENT" RT_COUNTRY="$COUNTRY" \
python3 - "$ENV_FILE" <<'PY'
import os, sys, pathlib
path=pathlib.Path(sys.argv[1])
values={
  'REALTALENT_CONNECT_PROVIDER':'twilio_bridge',
  'REALTALENT_CONNECT_PORT':'3001',
  'REALTALENT_CONNECT_HOST':'0.0.0.0',
  'REALTALENT_DEFAULT_COUNTRY_CODE':os.environ['RT_COUNTRY'],
  'TWILIO_ACCOUNT_SID':os.environ['RT_SID'],
  'TWILIO_AUTH_TOKEN':os.environ['RT_TOKEN'],
  'TWILIO_FROM_NUMBER':os.environ['RT_FROM'],
  'REALTALENT_AGENT_PHONE_NUMBER':os.environ['RT_AGENT'],
}
lines=path.read_text().splitlines() if path.exists() else []
out=[]; seen=set()
for line in lines:
    key=line.split('=',1)[0].strip() if '=' in line and not line.lstrip().startswith('#') else None
    if key in values:
        if key not in seen:
            out.append(f"{key}={values[key]}"); seen.add(key)
    else:
        out.append(line)
for key,value in values.items():
    if key not in seen: out.append(f"{key}={value}")
path.write_text('\n'.join(out).rstrip()+'\n')
PY

chmod 600 "$ENV_FILE" 2>/dev/null || true
unset TOKEN RT_TOKEN 2>/dev/null || true

echo
echo "✓ RealTalent Connect configurado em $ENV_FILE"
echo "Fluxo: RealTalent → toca seu telefone → ao atender, conecta o lead."
echo "Leads sem +código do país usarão +${COUNTRY} quando o número for compatível."
echo "Execute ./start-linux.sh para iniciar CRM + bridge local."
