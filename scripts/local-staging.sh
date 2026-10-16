#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STATUS_FILE="$ROOT/.supabase-local-status.env"
CLI_VERSION="${REALTALENT_SUPABASE_CLI_VERSION:-2.119.0}"
EXCLUDE_SERVICES="${REALTALENT_SUPABASE_EXCLUDE_SERVICES:-}"
SKIP_RESET="${REALTALENT_SUPABASE_SKIP_RESET:-0}"

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || fail "comando obrigatório ausente: $1"
}

supabase_cli() {
  if command -v supabase >/dev/null 2>&1; then
    supabase "$@"
  else
    need npx
    npx --yes "supabase@${CLI_VERSION}" "$@"
  fi
}

check_local_endpoint() {
  local endpoint
  endpoint="$(grep -E '^(API_URL|SUPABASE_URL)=' "$STATUS_FILE" | head -n1 | cut -d= -f2- | tr -d '"\r' || true)"
  [[ -n "$endpoint" ]] || fail "não consegui ler API_URL do Supabase local"
  case "$endpoint" in
    http://127.0.0.1:*|http://localhost:*|http://[[]::1[]]:*) ;;
    *) fail "proteção acionada: endpoint não local recusado: $endpoint" ;;
  esac
}

write_status() {
  rm -f "$STATUS_FILE"
  if supabase_cli status -o env >"$STATUS_FILE" 2>/dev/null; then
    :
  elif supabase_cli status --output env >"$STATUS_FILE" 2>/dev/null; then
    :
  elif supabase_cli status --env --output-format text >"$STATUS_FILE" 2>/dev/null; then
    :
  else
    fail "não foi possível exportar o status/credenciais do Supabase local"
  fi
  chmod 600 "$STATUS_FILE"
  check_local_endpoint
}

check_prereqs() {
  need docker
  docker info >/dev/null 2>&1 || fail "Docker está instalado, mas o daemon não está ativo"
  need node
  node -e "const major=Number(process.versions.node.split('.')[0]); if(major<18) process.exit(1)" \
    || fail "Node 18+ é obrigatório"
  [[ -f supabase/config.toml ]] || fail "supabase/config.toml não encontrado"
  [[ -d supabase/migrations ]] || fail "supabase/migrations não encontrado"
}

start_stack() {
  check_prereqs
  if [[ -n "$EXCLUDE_SERVICES" ]]; then
    say "Subindo Supabase local isolado em modo enxuto"
    supabase_cli start -x "$EXCLUDE_SERVICES"
  else
    say "Subindo Supabase local isolado"
    supabase_cli start
  fi
  write_status
}

reset_database() {
  write_status
  say "Recriando banco local exclusivamente pelas migrations versionadas"
  supabase_cli db reset
  write_status
}

bootstrap() {
  write_status
  say "Criando workspace, perfis e contas QA locais"
  RT_LOCAL_SUPABASE_STATUS_FILE="$STATUS_FILE" node scripts/local-staging-bootstrap.mjs
  say "Criando fixture server-only de Comunicações"
  RT_LOCAL_SUPABASE_STATUS_FILE="$STATUS_FILE" node scripts/local-staging-communication-fixture.mjs
}

run_cr2() {
  [[ -f .env.cr2.local ]] || fail ".env.cr2.local não existe; rode bootstrap/all primeiro"
  say "Executando CR2: Auth + RLS + perfis"
  set -a
  # shellcheck disable=SC1091
  source .env.cr2.local
  set +a
  node scripts/commercial_readiness_cr2_staging_probe.mjs
}

run_security() {
  [[ -f .env.cr2.local ]] || fail ".env.cr2.local não existe; rode bootstrap/all primeiro"
  say "Executando gate SECURITY DEFINER: anon vs RPCs internas/públicas"
  set -a
  # shellcheck disable=SC1091
  source .env.cr2.local
  set +a
  node scripts/security_definer_anon_probe.mjs
}

run_cr3() {
  [[ -f .env.cr3.local ]] || fail ".env.cr3.local não existe; rode bootstrap/all primeiro"
  say "Executando CR3: fluxo comercial E2E com dados descartáveis"
  set -a
  # shellcheck disable=SC1091
  source .env.cr3.local
  set +a
  node scripts/commercial_readiness_cr3_staging_e2e_probe.mjs
}

run_qa() {
  run_cr2
  run_security
  run_cr3
}

run_crm() {
  [[ -f .env.staging.local ]] || fail ".env.staging.local não existe; rode bootstrap/all primeiro"
  say "Abrindo CRM local apontado somente para o Supabase local"
  set -a
  # shellcheck disable=SC1091
  source .env.staging.local
  set +a
  exec npm run dev
}

show_status() {
  write_status
  say "Supabase local"
  grep -E '^(API_URL|STUDIO_URL|DB_URL)=' "$STATUS_FILE" || true
  printf '\nCredenciais foram ocultadas deste resumo.\n'
}

stop_stack() {
  say "Parando Supabase local (dados locais preservados)"
  supabase_cli stop
  rm -f "$STATUS_FILE"
}

clean_stack() {
  say "Parando e removendo volumes do Supabase local"
  supabase_cli stop --no-backup
  rm -f "$STATUS_FILE" .env.cr2.local .env.cr3.local .env.staging.local
}

all() {
  start_stack
  if [[ "$SKIP_RESET" == "1" ]]; then
    say "Banco descartável já nasceu limpo no supabase start; reset redundante omitido"
  else
    reset_database
  fi
  bootstrap
  run_qa
  say "STAGING LOCAL PRONTO"
  printf '%s\n' "Para abrir o CRM: bash scripts/local-staging.sh crm"
  printf '%s\n' "Para ver o Studio: bash scripts/local-staging.sh status"
}

usage() {
  cat <<'EOF'
RealTalent CRM — staging local gratuito

Uso:
  bash scripts/local-staging.sh all        # sobe, reseta, cria QA e roda CR2 + segurança + CR3
  bash scripts/local-staging.sh up         # sobe o Supabase local
  bash scripts/local-staging.sh reset      # reseta migrations + bootstrap + gates
  bash scripts/local-staging.sh bootstrap  # recria apenas fixtures/contas QA
  bash scripts/local-staging.sh qa         # roda CR2 + segurança + CR3
  bash scripts/local-staging.sh cr2        # roda somente CR2
  bash scripts/local-staging.sh security   # roda somente o gate SECURITY DEFINER/anon
  bash scripts/local-staging.sh cr3        # roda somente CR3
  bash scripts/local-staging.sh crm        # inicia o CRM usando .env.staging.local
  bash scripts/local-staging.sh status     # mostra URLs locais, sem chaves
  bash scripts/local-staging.sh down       # para e preserva dados locais
  bash scripts/local-staging.sh clean      # para e remove volumes/arquivos QA locais

Modo enxuto para runner descartável (CI):
  REALTALENT_SUPABASE_EXCLUDE_SERVICES="realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor" \
  REALTALENT_SUPABASE_SKIP_RESET=1 \
    bash scripts/local-staging.sh all

Garantias:
  - não cria projeto/branch pago no Supabase;
  - não copia dados de produção;
  - bootstrap recusa endpoints que não sejam localhost/127.0.0.1;
  - sem as variáveis de CI, o Linux local continua subindo a stack completa e fazendo reset limpo;
  - o comando explícito `reset` sempre executa `supabase db reset`;
  - Production/Vercel/Railway não são alterados por este script.
EOF
}

cmd="${1:-all}"
case "$cmd" in
  all) all ;;
  up) start_stack ;;
  reset) start_stack; reset_database; bootstrap; run_qa ;;
  bootstrap) bootstrap ;;
  qa) run_qa ;;
  cr2) run_cr2 ;;
  security) run_security ;;
  cr3) run_cr3 ;;
  crm) run_crm ;;
  status) show_status ;;
  down) stop_stack ;;
  clean) clean_stack ;;
  help|-h|--help) usage ;;
  *) usage; fail "comando desconhecido: $cmd" ;;
esac
