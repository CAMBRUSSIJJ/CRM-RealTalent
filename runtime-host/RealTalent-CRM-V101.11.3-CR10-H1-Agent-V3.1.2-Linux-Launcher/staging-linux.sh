#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -f .env.cr10 ]]; then
  cp .env.cr10.example .env.cr10
  chmod 600 .env.cr10
  echo "Criado .env.cr10 com segurança 600. Preencha os dados do projeto Supabase de STAGING e execute novamente:" >&2
  echo "  nano .env.cr10" >&2
  echo "  ./staging-linux.sh" >&2
  exit 2
fi
chmod 600 .env.cr10
set -a
# shellcheck disable=SC1091
source .env.cr10
set +a
node scripts/commercial_readiness_cr10_staging_preflight.mjs
node scripts/commercial_readiness_cr10_staging_orchestrator.mjs
