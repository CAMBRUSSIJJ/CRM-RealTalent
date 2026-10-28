#!/usr/bin/env bash
# RealTalent SearXNG local search. Privileged changes require explicit approval; ports remain on localhost.
set -Eeuo pipefail

SERVICE_NAME="realtalent-searxng-local"
SEARCH_URL='http://127.0.0.1:8888'
SEARCH_TEST="$SEARCH_URL/search?q=Thiago%20Reis%20scripts%20vendas&format=json"
BASE="$HOME/.local/share/realtalent-agent/searxng"
CONFIG="$BASE/config"
CACHE="$BASE/cache"
mkdir -p "$CONFIG" "$CACHE"

search_healthy() {
  local response
  response="$(curl -fsS --max-time 22 "$SEARCH_TEST" 2>/dev/null)" || return 1
  [[ "$response" == *'"results"'* ]]
}

if search_healthy; then
  echo "Pesquisa já está ativa e retorna JSON em $SEARCH_URL"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  if [[ ! -t 0 ]] || ! command -v apt-get >/dev/null 2>&1; then
    echo "Docker não instalado. Instale no Debian/Ubuntu com: sudo apt-get update && sudo apt-get install docker.io" >&2
    exit 2
  fi
  echo "Docker é necessário apenas para a pesquisa. Ollama e CRM continuam disponíveis sem ele."
  read -r -p "Autoriza instalar Docker com sudo apt-get? [s/N] " choice
  if [[ "$choice" != 's' && "$choice" != 'S' && "$choice" != 'sim' ]]; then
    echo "Pesquisa não instalada; nenhuma alteração administrativa realizada." >&2; exit 2
  fi
  sudo apt-get update
  sudo apt-get install -y docker.io
fi

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if [[ ! -t 0 ]]; then
    echo "Docker sem acesso. Execute: sudo systemctl start docker; confira as permissões." >&2
    exit 2
  fi
  read -r -p "Autoriza iniciar/acessar Docker via sudo? [s/N] " choice
  if [[ "$choice" != 's' && "$choice" != 'S' && "$choice" != 'sim' ]]; then
    echo "Acesso ao Docker não autorizado." >&2; exit 2
  fi
  sudo systemctl start docker || true
  if ! docker info >/dev/null 2>&1; then
    if sudo docker info >/dev/null 2>&1; then
      DOCKER=(sudo docker)
    else
      echo "Docker não respondeu. Verifique: sudo systemctl status docker" >&2; exit 2
    fi
  fi
fi

# Refuse to overwrite an unrelated service at 8888.
if command -v ss >/dev/null 2>&1 && ss -ltn '( sport = :8888 )' | grep -q LISTEN &&
   ! "${DOCKER[@]}" container inspect "$SERVICE_NAME" >/dev/null 2>&1; then
  echo "A porta 8888 está ocupada por outro serviço. Não será modificado." >&2
  exit 2
fi

if [[ ! -f "$CONFIG/settings.yml" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -hex 32)"
  else
    secret="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  fi
  cat > "$CONFIG/settings.yml" <<YAML
use_default_settings: true
general:
  instance_name: "RealTalent Local Search"
search:
  formats:
    - html
    - json
server:
  secret_key: "$secret"
  limiter: false
  public_instance: false
  bind_address: "0.0.0.0"
YAML
  chmod 600 "$CONFIG/settings.yml"
fi

if "${DOCKER[@]}" container inspect "$SERVICE_NAME" >/dev/null 2>&1; then
  if [[ "$("${DOCKER[@]}" inspect -f '{{.State.Running}}' "$SERVICE_NAME")" != 'true' ]]; then
    echo "Reiniciando SearXNG existente..."
    "${DOCKER[@]}" start "$SERVICE_NAME" >/dev/null
  fi
else
  echo "Baixando a imagem oficial SearXNG e criando serviço local..."
  "${DOCKER[@]}" run -d --name "$SERVICE_NAME" --restart unless-stopped \
    --security-opt no-new-privileges \
    -p 127.0.0.1:8888:8080 \
    -e SEARXNG_BIND_ADDRESS=0.0.0.0 \
    -e SEARXNG_PORT=8080 \
    -v "$CONFIG:/etc/searxng" \
    -v "$CACHE:/var/cache/searxng" \
    docker.io/searxng/searxng:latest >/dev/null
fi

for attempt in $(seq 1 6); do
  if search_healthy; then
    echo "✓ Pesquisa pública SearXNG pronta: $SEARCH_URL (somente localhost)"
    exit 0
  fi
  sleep 1
done

echo "SearXNG iniciou, mas a API JSON ainda não está pronta." >&2
echo "Confira: ${DOCKER[*]} logs --tail 80 $SERVICE_NAME" >&2
exit 3
