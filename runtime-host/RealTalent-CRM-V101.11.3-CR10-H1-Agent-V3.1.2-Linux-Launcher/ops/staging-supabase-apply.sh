#!/usr/bin/env bash
set -euo pipefail

need=(SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD CR10_PROJECT_REF)
missing=()
for k in "${need[@]}"; do [[ -n "${!k:-}" ]] || missing+=("$k"); done
if ((${#missing[@]})); then
  echo "CR10 MIGRATIONS BLOCKED: faltam ${missing[*]}" >&2
  exit 2
fi

if command -v supabase >/dev/null 2>&1; then
  SUPA=(supabase)
elif command -v npx >/dev/null 2>&1; then
  SUPA=(npx --yes supabase@2.120.0)
else
  echo "CR10 MIGRATIONS BLOCKED: instale Supabase CLI ou Node/npx." >&2
  exit 2
fi

export SUPABASE_DB_PASSWORD

echo "CR10: vinculando projeto de staging ${CR10_PROJECT_REF}"
"${SUPA[@]}" link --project-ref "$CR10_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"

echo "CR10: migration history antes do push"
"${SUPA[@]}" migration list --linked

echo "CR10: dry-run obrigatório"
"${SUPA[@]}" db push --linked --dry-run --password "$SUPABASE_DB_PASSWORD"

if [[ "${CR10_APPLY_MIGRATIONS:-NO}" != "YES_APPLY_STAGING" ]]; then
  echo "CR10 MIGRATIONS DRY-RUN PASS: nenhuma migration aplicada. Para aplicar em staging, use CR10_APPLY_MIGRATIONS=YES_APPLY_STAGING."
  exit 3
fi

echo "CR10: aplicando migrations pendentes no STAGING"
"${SUPA[@]}" db push --linked --password "$SUPABASE_DB_PASSWORD"

echo "CR10: migration history depois do push"
"${SUPA[@]}" migration list --linked

echo "CR10: lint remoto"
"${SUPA[@]}" db lint --linked --fail-on error

if [[ "${CR10_PUSH_CONFIG:-NO}" == "YES_PUSH_STAGING_CONFIG" ]]; then
  echo "CR10: enviando config.toml ao staging"
  "${SUPA[@]}" config push --project-ref "$CR10_PROJECT_REF"
fi

if [[ "${CR10_DEPLOY_FUNCTIONS:-NO}" == "YES_DEPLOY_STAGING_FUNCTIONS" ]]; then
  echo "CR10: deploy de Edge Functions ao staging"
  "${SUPA[@]}" functions deploy --project-ref "$CR10_PROJECT_REF" --use-api
fi

echo "CR10 MIGRATIONS PASS: migrations aplicadas e lint remoto sem erro."
