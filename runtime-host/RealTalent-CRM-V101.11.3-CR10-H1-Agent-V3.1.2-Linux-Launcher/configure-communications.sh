#!/usr/bin/env bash
set -euo pipefail

say(){ printf '\n%s\n' "$*"; }
need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERRO: instale '$1' antes de continuar."; exit 1; }; }
read_secret(){ local __var="$1" __label="$2"; read -rsp "$__label: " __value; echo; printf -v "$__var" '%s' "$__value"; }

need supabase
say "RealTalent CRM V101.8.4 — Configuração de Comunicações Oficiais"
read -rp "Supabase project ref: " PROJECT_REF
read -rp "URL pública do CRM (ex.: https://crm.seudominio.com): " APP_PUBLIC_URL
read -rp "Google OAuth Client ID (deixe vazio se não usar Gmail): " GOOGLE_CLIENT_ID
if [[ -n "$GOOGLE_CLIENT_ID" ]]; then read_secret GOOGLE_CLIENT_SECRET "Google OAuth Client Secret"; else GOOGLE_CLIENT_SECRET=""; fi
read -rp "Microsoft OAuth Client ID (deixe vazio se não usar Outlook): " MICROSOFT_CLIENT_ID
if [[ -n "$MICROSOFT_CLIENT_ID" ]]; then read_secret MICROSOFT_CLIENT_SECRET "Microsoft OAuth Client Secret"; else MICROSOFT_CLIENT_SECRET=""; fi
read -rp "Meta App ID (deixe vazio se não usar WhatsApp Cloud): " META_CLIENT_ID
if [[ -n "$META_CLIENT_ID" ]]; then read_secret META_CLIENT_SECRET "Meta App Secret"; read_secret META_APP_SECRET "Meta App Secret para assinatura de webhook (normalmente o mesmo App Secret)"; read_secret WHATSAPP_VERIFY "Token de verificação do webhook WhatsApp (crie uma senha longa)"; else META_CLIENT_SECRET=""; META_APP_SECRET=""; WHATSAPP_VERIFY=""; fi

read_secret TOKEN_KEY "Chave de criptografia OAuth (mínimo 32 caracteres)"
read_secret INTEGRATION_WORKER_SECRET "Segredo do worker de integrações (mínimo 32 caracteres)"
read_secret COMMUNICATION_WORKER_SECRET "Segredo do worker de comunicações (mínimo 32 caracteres)"

[[ ${#TOKEN_KEY} -ge 32 && ${#INTEGRATION_WORKER_SECRET} -ge 32 && ${#COMMUNICATION_WORKER_SECRET} -ge 32 ]] || { echo "ERRO: os segredos internos precisam ter pelo menos 32 caracteres."; exit 1; }

supabase link --project-ref "$PROJECT_REF"
ARGS=("APP_PUBLIC_URL=$APP_PUBLIC_URL" "INTEGRATION_TOKEN_ENCRYPTION_KEY=$TOKEN_KEY" "INTEGRATION_WORKER_SECRET=$INTEGRATION_WORKER_SECRET" "COMMUNICATION_WORKER_SECRET=$COMMUNICATION_WORKER_SECRET")
[[ -n "$GOOGLE_CLIENT_ID" ]] && ARGS+=("GOOGLE_OAUTH_CLIENT_ID=$GOOGLE_CLIENT_ID" "GOOGLE_OAUTH_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET")
[[ -n "$MICROSOFT_CLIENT_ID" ]] && ARGS+=("MICROSOFT_OAUTH_CLIENT_ID=$MICROSOFT_CLIENT_ID" "MICROSOFT_OAUTH_CLIENT_SECRET=$MICROSOFT_CLIENT_SECRET")
[[ -n "$META_CLIENT_ID" ]] && ARGS+=("META_OAUTH_CLIENT_ID=$META_CLIENT_ID" "META_OAUTH_CLIENT_SECRET=$META_CLIENT_SECRET" "META_APP_SECRET=$META_APP_SECRET" "WHATSAPP_WEBHOOK_VERIFY_TOKEN=$WHATSAPP_VERIFY")
supabase secrets set "${ARGS[@]}"

say "Aplicando migrations..."
supabase db push

say "Publicando funções de comunicação e OAuth..."
for fn in integration-oauth-start integration-oauth-callback integration-account-test integration-account-revoke integration-diagnostics official-communication-send communication-dispatch-worker communication-sync-now integration-google-worker integration-microsoft-worker integration-whatsapp-worker integration-token-worker integration-health-worker integration-maintenance-worker gmail-pubsub-webhook microsoft-communications-webhook whatsapp-webhook; do
  [[ -d "supabase/functions/$fn" ]] && supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done

say "Configuração de backend concluída."
echo "Ainda falta configurar os Redirect URIs/Webhooks nos consoles Google, Microsoft e Meta e habilitar os runners de supabase/cron/CONFIGURAR-COMMUNICATION-RUNNERS.sql."
echo "Veja COMMUNICATIONS_SETUP_V101.8.4.md."
