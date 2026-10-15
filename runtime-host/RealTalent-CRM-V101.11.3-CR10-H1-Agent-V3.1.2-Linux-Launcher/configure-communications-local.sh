#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

printf '\nRealTalent CRM V101.8.4-H2 — Configuração do Gateway Local\n'
printf '=========================================================\n'
printf 'Este assistente configura Gmail/Outlook OAuth no computador.\n'
printf 'O WhatsApp Cloud é conectado dentro do CRM em Configurações → WhatsApp.\n\n'

read -r -p 'Google OAuth Client ID (Enter para não usar Gmail): ' GOOGLE_ID
GOOGLE_SECRET=''
if [ -n "$GOOGLE_ID" ]; then
  read -r -s -p 'Google OAuth Client Secret (pode ficar vazio para cliente público): ' GOOGLE_SECRET
  echo
fi
read -r -p 'Microsoft OAuth Client ID (Enter para não usar Outlook): ' MICROSOFT_ID
MICROSOFT_SECRET=''
MICROSOFT_TENANT='common'
if [ -n "$MICROSOFT_ID" ]; then
  read -r -s -p 'Microsoft OAuth Client Secret (pode ficar vazio para cliente público): ' MICROSOFT_SECRET
  echo
  read -r -p 'Tenant [common]: ' MICROSOFT_TENANT_INPUT
  MICROSOFT_TENANT="${MICROSOFT_TENANT_INPUT:-common}"
fi
read -r -p 'Versão da Meta Graph API [v23.0]: ' META_GRAPH_VERSION
META_GRAPH_VERSION="${META_GRAPH_VERSION:-v23.0}"
read -r -s -p 'Meta App Secret (opcional; recomendado para validar webhooks): ' META_APP_SECRET
echo

VERIFY_TOKEN="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
export GOOGLE_ID GOOGLE_SECRET MICROSOFT_ID MICROSOFT_SECRET MICROSOFT_TENANT META_GRAPH_VERSION META_APP_SECRET VERIFY_TOKEN
node <<'NODE'
const fs=require('fs')
const cfg={
  googleClientId:process.env.GOOGLE_ID||'',
  googleClientSecret:process.env.GOOGLE_SECRET||'',
  microsoftClientId:process.env.MICROSOFT_ID||'',
  microsoftClientSecret:process.env.MICROSOFT_SECRET||'',
  microsoftTenant:process.env.MICROSOFT_TENANT||'common',
  metaGraphVersion:process.env.META_GRAPH_VERSION||'v23.0',
  metaAppSecret:process.env.META_APP_SECRET||'',
  whatsappWebhookVerifyToken:process.env.VERIFY_TOKEN||''
}
fs.writeFileSync('.realtalent-communications-config.json',JSON.stringify(cfg,null,2),{mode:0o600})
try{fs.chmodSync('.realtalent-communications-config.json',0o600)}catch{}
NODE

printf '\n✓ Configuração local salva com permissão 600.\n\n'
printf 'Redirect URI do Google:\n  http://127.0.0.1:3002/oauth/google/callback\n\n'
printf 'Redirect URI da Microsoft:\n  http://localhost:3002/oauth/microsoft/callback\n\n'
printf 'Webhook WhatsApp do gateway:\n  http://127.0.0.1:3002/webhooks/whatsapp\n'
printf 'Token de verificação gerado:\n  %s\n\n' "$VERIFY_TOKEN"
printf 'Para RECEBER WhatsApp da internet, publique esse endpoint por HTTPS com URL estável\n'
printf 'e use a mesma URL/token no painel Meta. Para ENVIAR pelo CRM isso não é necessário.\n\n'
printf 'Reinicie o CRM com ./start-linux.sh e depois:\n'
printf '  • Configurações → Integrações → Conectar Google/Microsoft\n'
printf '  • Configurações → WhatsApp → Configurar WhatsApp Cloud\n'
