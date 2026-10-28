#!/usr/bin/env bash
# RealTalent SearXNG local search. No system package installation or open LAN ports.
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
  response="$(curl -fsS --max-time 9 "$SEARCH_TEST" 2>/dev/null)" || return 1
  [[ "$response" == *'"results"'* ]]
}

if search_healthy; then
  echo "Pesquisa já está ativa e retorna JSON em $SEARCH_URL"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não encontrado. A pesquisa necessita Docker; o CRM e o Ollama continuam funcionando." >&2
  echo "Consulte: https://docs.docker.com/engine/install/debian/" >&2
  exit 2
fi
if ! docker info >/dev/null 2>&1; then
  echo "O Docker existe, mas o usuário não consegue acessar o daemon." >&2
  echo "Inicie o Docker e ajuste permissões conforme a documentação oficial; não usarei sudo automaticamente." >&2
  exit 2
fi

# Refuse to overwrite an unrelated service at 8888.
if command -v ss >/dev/null 2>&1 && ss -ltn '( sport = :8888 )' | grep -q LISTEN; then
  echo "A porta 8888 está ocupada, mas não respondeu como SearXNG JSON. Verifique o serviço atual." >&2
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

if docker container inspect "$SERVICE_NAME" >/dev/null 2>&1; then
  if [[ "$(docker inspect -f '{{.State.Running}}' "$SERVICE_NAME")" != 'true' ]]; then
    echo "Reiniciando SearXNG existente..."
    docker start "$SERVICE_NAME" >/dev/null
  fi
else
  echo "Baixando a imagem oficial SearXNG e criando serviço local..."
  docker run -d --name "$SERVICE_NAME" --restart unless-stopped \
    --security-opt no-new-privileges \
    -p 127.0.0.1:8888:8080 \
    -e SEARXNG_BIND_ADDRESS=0.0.0.0 \
    -e SEARXNG_PORT=8080 \
    -v "$CONFIG:/etc/searxng" \
    -v "$CACHE:/var/cache/searxng" \
    docker.io/searxng/searxng:latest >/dev/null
fi

for attempt in $(seq 1 40); do
  if search_healthy; then
    echo "✓ Pesquisa pública SearXNG pronta: $SEARCH_URL (somente localhost)"
    exit 0
  fi
  sleep 1
done

echo "SearXNG iniciou, mas a API JSON ainda não está pronta." >&2
echo "Confira: docker logs --tail 80 $SERVICE_NAME" >&2
exit 3
