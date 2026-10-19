#!/usr/bin/env bash
set -euo pipefail
echo "REAL TALENT — Edge Functions: comandos apenas informativos"
for name in integration-oauth-start integration-oauth-callback integration-account-test integration-calendar-catalog official-communication-send automation-webhook-dispatch; do
 if [[ -f "supabase/functions/$name/index.ts" ]];then
  printf 'Fonte OK: %-36s | implantação futura: npx supabase functions deploy %s --project-ref <REF-TESTE>\n' "$name" "$name"
 else echo "FONTE AUSENTE: $name";fi
done
echo "Nenhuma função foi implantada. Não use o Supabase de Production para teste."
