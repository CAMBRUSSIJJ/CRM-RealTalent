#!/usr/bin/env bash
# Recover a previously installed RealTalent Firecrawl API without rebuilding or
# modifying PostgreSQL, volumes, WAHA, Ollama or the RealTalent CRM.
set -u
API="realtalent-garimpo-api-1"
PROJECT="realtalent-garimpo"
say() { printf '\n%s\n' "$*"; }
fail() { printf 'ERRO: %s\n' "$*" >&2; return 1; }

say "===== REALTALENT: REPARAR INICIALIZAÇÃO DO FIRECRAWL ====="
for cmd in docker curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then fail "Programa ausente: $cmd"; exit 1; fi
done
if ! docker info >/dev/null 2>&1; then fail "Docker não acessível."; exit 1; fi
if ! docker inspect "$API" >/dev/null 2>&1; then
  fail "Contêiner anterior não encontrado: $API. Instalação preservada."
  exit 1
fi

actual_project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$API")"
if [[ "$actual_project" != "$PROJECT" ]]; then
  fail "Projeto inesperado: $actual_project. Não alterei nenhum contêiner."
  exit 1
fi
WORKDIR="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$API")"
COMPOSE_FILES="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$API")"
if [[ ! -d "$WORKDIR" || -z "$COMPOSE_FILES" || "$COMPOSE_FILES" == "<no value>" ]]; then
  fail "Não consegui localizar os arquivos Compose originais. Não fiz alterações."
  exit 1
fi
IFS=',' read -r -a files <<< "$COMPOSE_FILES"
args=()
for file in "${files[@]}"; do
  [[ -n "$file" ]] || continue
  [[ "$file" = /* ]] || file="$WORKDIR/$file"
  if [[ ! -f "$file" ]]; then fail "Compose original não encontrado: $file"; exit 1; fi
  args+=(-f "$file")
done
if [[ ${#args[@]} -lt 2 ]]; then
  fail "Arquivos Compose incompletos; nenhuma alteração feita."
  exit 1
fi

if [[ -f "$WORKDIR/garimpo/compose.low-memory.yaml" ]]; then
  echo "✓ Perfil de memória econômica localizado."
else
  echo "Aviso: perfil econômico original não localizado; o reparo aplicará limites apenas à API."
fi

# Keep the exact current Compose stack and add an API-only environment override.
# No passwords, API keys or tokens are stored in this file.
PATCH="$WORKDIR/garimpo/compose.startup-fix.yaml"
mkdir -p "$WORKDIR/garimpo" || exit 1
if [[ -f "$PATCH" ]]; then
  if ! grep -q '^# RealTalent Firecrawl startup override v1$' "$PATCH"; then
    fail "Existe um arquivo não reconhecido em $PATCH. Preserve-o e entre em contato antes de sobrescrever."
    exit 1
  fi
  cp -p "$PATCH" "$PATCH.backup.$(date +%Y%m%d-%H%M%S)" || exit 1
fi
cat > "$PATCH" <<'YAML'
# RealTalent Firecrawl startup override v1
# Verified against pinned Firecrawl source: 603d3ec4a7f7ef7e0b1c3e5c8ec5a514bca8e1b7
services:
  api:
    environment:
      NUQ_WORKER_COUNT: "1"
      HARNESS_STARTUP_TIMEOUT_MS: "180000"
      CRAWL_CONCURRENT_REQUESTS: "1"
      MAX_CONCURRENT_JOBS: "1"
      BROWSER_POOL_SIZE: "1"
YAML
chmod 644 "$PATCH"

# Docker Compose may need the .env in the original project root.
cd "$WORKDIR" || exit 1
all=( "${args[@]}" -f "$PATCH" )

say "===== VALIDANDO CONFIGURAÇÃO ====="
if ! docker compose -p "$PROJECT" "${all[@]}" config --quiet; then
  fail "Docker Compose recusou a configuração. API antiga preservada."
  exit 1
fi
echo "✓ Validação concluída: 1 NuQ worker e timeout interno de 180000 ms."

say "===== RECRIANDO APENAS A API ====="
if ! docker compose -p "$PROJECT" "${all[@]}" up -d --no-deps --no-build --force-recreate api; then
  fail "Falha ao recriar apenas a API. Outros contêineres e volumes não foram apagados."
  exit 1
fi

# The container must really have received the new variables.
envlines="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$API")"
if ! printf '%s\n' "$envlines" | grep -Fxq 'NUQ_WORKER_COUNT=1' || \
   ! printf '%s\n' "$envlines" | grep -Fxq 'HARNESS_STARTUP_TIMEOUT_MS=180000'; then
  fail "A API não recebeu a configuração esperada. Não iniciou o conector."
  exit 1
fi
echo "✓ Variáveis realmente aplicadas ao contêiner: NuQ=1; startup=180000 ms."

say "===== TESTANDO API FIRECRAWL ====="
success=false
for attempt in $(seq 1 75); do
  state="$(docker inspect --format '{{.State.Status}}' "$API" 2>/dev/null || true)"
  if [[ "$state" == "exited" || "$state" == "dead" ]]; then
    echo "A API saiu durante a inicialização (estado: $state)."
    break
  fi
  http="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/ 2>/dev/null || true)"
  if [[ "$http" == "200" ]]; then success=true; break; fi
  if (( attempt % 10 == 0 )); then
    echo "API em inicialização: contêiner=$state, HTTP=${http:-000}"
  fi
  sleep 3
done

if [[ "$success" == "true" ]]; then
  echo "✓ Firecrawl respondeu HTTP 200."
  docker stats --no-stream "$API" || true
  echo
  echo "Recuperação concluída. O Firecrawl e o Ollama continuam no Linux."
  echo "Agora inicie o conector com: bash ~/Downloads/INICIAR-GARIMPO-LOCAL.sh"
  exit 0
fi

echo
say "===== DIAGNÓSTICO DA API ====="
docker inspect "$API" --format 'Estado: {{.State.Status}} | Exit: {{.State.ExitCode}} | OOMKilled: {{.State.OOMKilled}}' 2>/dev/null || true
echo "Últimos logs (revise possíveis dados privados antes de compartilhar):"
docker logs --tail 45 "$API" 2>&1 || true
echo "Memória:"
free -h || true
fail "A API não respondeu HTTP 200. Não altere o banco; use os logs acima para diagnosticar."
exit 1
