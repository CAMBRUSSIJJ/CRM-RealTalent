#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="$HOME/.local/share/realtalent-ai"
CONF="$HOME/.config/realtalent-ai"
UNITS="$HOME/.config/systemd/user"
REPO_URL="https://github.com/CAMBRUSSIJJ/CRM-RealTalent.git"
REPO_BRANCH="feat/realtalent-ai-persistent-cloudflare-20261031"

if [[ "$(uname -s)" != Linux ]];then echo 'Este instalador é apenas para Linux.' >&2;exit 2;fi
for bin in git curl node npm ollama systemctl;do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERRO: $bin não instalado." >&2;exit 2; }
done
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]] || {
  echo "ERRO: Node.js 22 necessário; encontrado: $(node --version)" >&2
  exit 2
}
# systemd --user does not inherit NVM/fnm PATH from the interactive shell.
# Pin the resolved executable directory to service Environment= at install time.
NODE_BIN="$(readlink -f "$(command -v node)")"
[[ -x "$NODE_BIN" ]] || { echo 'ERRO: executável Node.js não encontrado.' >&2; exit 2; }
NODE_DIR="$(dirname "$NODE_BIN")"
echo "Node.js dos serviços: $NODE_BIN"
systemctl --user show-environment >/dev/null 2>&1 || {
  echo 'ERRO: systemd --user inativo. Execute como seu usuário normal em uma sessão Linux.' >&2
  exit 2
}
mkdir -p "$ROOT" "$CONF" "$UNITS"
if [[ ! -e "$ROOT/repo/.git" ]];then
  echo 'Baixando código RealTalent em pasta permanente, sem alterar sua instalação atual...'
  git clone --depth 1 --single-branch --branch "$REPO_BRANCH" "$REPO_URL" "$ROOT/repo"
else
  if [[ -n "$(git -C "$ROOT/repo" status --porcelain)" ]];then
    echo 'ERRO: alterações locais detectadas na instalação anterior. Não sobrescreverei arquivos.'
    echo "Verifique: git -C $ROOT/repo status --short"
    exit 2
  fi
  echo 'Atualizando código do conector local RealTalent sem sobrescrever alterações...'
  git -C "$ROOT/repo" pull --ff-only origin "$REPO_BRANCH"
fi
if [[ ! -f "$ROOT/repo/runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs" ]];then
  echo 'ERRO: Agent Runtime não encontrado no repositório.' >&2;exit 2
fi
if [[ ! -x "$ROOT/repo/node_modules/.bin/vite" ]];then
  echo 'Preparando dependências...'
  (cd "$ROOT/repo" && npm ci --include=dev --no-audit --no-fund)
fi
BRIDGE_SRC="$ROOT/repo/scripts/realtalent-ai-linux/secure-bridge.mjs"
[[ -s "$BRIDGE_SRC" ]] || { echo 'ERRO: bridge não encontrado.' >&2;exit 2; }
install -m 600 "$BRIDGE_SRC" "$ROOT/secure-bridge.mjs"
install -m 600 "$ROOT/repo/scripts/realtalent-ai-linux/browser-connector.mjs" "$ROOT/browser-connector.mjs"
install -m 600 "$ROOT/repo/scripts/realtalent-ai-linux/pair-local.mjs" "$ROOT/pair-local.mjs"

ENV="$CONF/agent.env"
if [[ ! -s "$ENV" ]];then
  TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
  printf 'REALTALENT_AGENT_RUNTIME_TOKEN=%s\n' "$TOKEN" > "$ENV"
  unset TOKEN
fi
if ! grep -q '^REALTALENT_AGENT_RUNTIME_TOKEN=' "$ENV";then
  echo 'ERRO: agent.env existe sem token; preservado sem modificações.' >&2;exit 2
fi
chmod 600 "$ENV"
if ! grep -q '^REALTALENT_OLLAMA_MODEL=' "$ENV";then printf 'REALTALENT_OLLAMA_MODEL=qwen3:8b\n' >> "$ENV";fi
cat > "$ROOT/run-agent.sh" <<'RUN'
#!/usr/bin/env bash
set -Eeuo pipefail
set -a
source "$HOME/.config/realtalent-ai/agent.env"
set +a
export OLLAMA_URL=http://127.0.0.1:11434
export OLLAMA_MODEL="${REALTALENT_OLLAMA_MODEL:-qwen3:8b}"
export REALTALENT_AGENT_HOST=127.0.0.1
export REALTALENT_AGENT_PORT=8792
export REALTALENT_AGENT_INNER_PORT=8793
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_CONTEXT_LENGTH=4096
for i in {1..60};do
  curl -fsS --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
  sleep 2
done
cd "$HOME/.local/share/realtalent-ai/repo"
exec node runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs
RUN
cat > "$ROOT/run-bridge.sh" <<'RUN'
#!/usr/bin/env bash
set -Eeuo pipefail
set -a
source "$HOME/.config/realtalent-ai/agent.env"
set +a
export REALTALENT_AGENT_PORT=8792
export REALTALENT_BRIDGE_PORT=8798
exec node "$HOME/.local/share/realtalent-ai/secure-bridge.mjs"
RUN
cat > "$ROOT/watchdog.sh" <<'RUN'
#!/usr/bin/env bash
set -Eeuo pipefail
set -a
source "$HOME/.config/realtalent-ai/agent.env"
set +a
if ! curl -fsS --max-time 5 http://127.0.0.1:11434/api/tags >/dev/null 2>&1;then
  systemctl --user restart realtalent-ollama.service 2>/dev/null || true
  exit 0
fi
if ! curl -fsS --max-time 5 http://127.0.0.1:8792/tools/health >/dev/null 2>&1;then
  systemctl --user restart realtalent-ai-agent.service
  exit 0
fi
status=$(curl --max-time 8 --silent -o /dev/null -w '%{http_code}' -H "x-realtalent-agent-token: $REALTALENT_AGENT_RUNTIME_TOKEN" http://127.0.0.1:8798/tools/health || true)
if [[ "$status" != 200 ]];then systemctl --user restart realtalent-ai-bridge.service;fi
RUN
cat > "$ROOT/run-tunnel.sh" <<'RUN'
#!/usr/bin/env bash
set -Eeuo pipefail
TOKEN_FILE="$HOME/.config/realtalent-ai/tunnel.token"
[[ -s "$TOKEN_FILE" ]] || { echo 'Tunnel não configurado.' >&2;exit 1; }
exec cloudflared tunnel --no-autoupdate run --token-file "$TOKEN_FILE"
RUN
chmod 700 "$ROOT/"*.sh
create_unit(){
  local name="$1" cmd="$2" options="$3"
  cat > "$UNITS/$name.service" <<UNIT
[Unit]
Description=RealTalent AI $name (local)
After=network.target
[Service]
Type=simple
ExecStart=$cmd
Restart=always
RestartSec=10
Environment="PATH=$NODE_DIR:/usr/local/bin:/usr/bin:/bin"
$options
[Install]
WantedBy=default.target
UNIT
}
if ! systemctl is-active --quiet ollama;then
  cat > "$UNITS/realtalent-ollama.service" <<UNIT
[Unit]
Description=RealTalent local Ollama
After=network.target
[Service]
Type=simple
Environment=OLLAMA_HOST=127.0.0.1:11434
Environment=OLLAMA_NUM_PARALLEL=1
Environment=OLLAMA_MAX_LOADED_MODELS=1
Environment=OLLAMA_CONTEXT_LENGTH=4096
ExecStart=$(command -v ollama) serve
Restart=always
RestartSec=8
[Install]
WantedBy=default.target
UNIT
fi
create_unit realtalent-ai-agent "$ROOT/run-agent.sh" "WorkingDirectory=$ROOT/repo"
create_unit realtalent-ai-bridge "$ROOT/run-bridge.sh" ''
create_unit realtalent-ai-tunnel "$ROOT/run-tunnel.sh" ''
cat > "$UNITS/realtalent-ai-watchdog.service" <<UNIT
[Unit]
Description=RealTalent AI health monitor
[Service]
Type=oneshot
ExecStart=$ROOT/watchdog.sh
UNIT
cat > "$UNITS/realtalent-ai-watchdog.timer" <<UNIT
[Unit]
Description=RealTalent AI health checks every 5 minutes
[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl --user daemon-reload
if ! systemctl is-active --quiet ollama;then
  systemctl --user enable --now realtalent-ollama.service
fi
systemctl --user enable --now realtalent-ai-agent.service realtalent-ai-bridge.service realtalent-ai-watchdog.timer
# Existing active units must restart to load the updated browser connector.
systemctl --user restart realtalent-ai-agent.service realtalent-ai-bridge.service
if [[ -s "$CONF/tunnel.token" ]] && command -v cloudflared >/dev/null 2>&1;then
  systemctl --user enable --now realtalent-ai-tunnel.service
fi
if command -v loginctl >/dev/null 2>&1 && ! loginctl show-user "$USER" -p Linger 2>/dev/null | grep -q 'Linger=yes';then
  echo 'Serviços iniciam ao entrar no Linux. Para iniciar também antes de fazer login, execute:'
  echo "  sudo loginctl enable-linger $USER"
fi
if curl -fsS --max-time 5 http://127.0.0.1:11434/api/tags >/dev/null 2>&1;then
  if ! ollama list | grep -Eq '^qwen3:8b[[:space:]]';then
    echo 'Baixando qwen3:8b (vários GB) na primeira instalação...'
    ollama pull qwen3:8b || echo 'Download não concluído. Execute depois: ollama pull qwen3:8b'
  fi
fi
echo
echo '=== STATUS ==='
systemctl --user --no-pager is-active realtalent-ai-agent realtalent-ai-bridge realtalent-ai-watchdog.timer || true
echo 'Ollama:'
curl -fsS --max-time 5 http://127.0.0.1:11434/api/tags >/dev/null && echo 'Online' || echo 'Offline'
echo 'Ponte sem token (HTTP 401 esperado):'
curl -sS --max-time 5 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8798/tools/health || true
echo
echo 'Pronto. Agent e bridge funcionam sem manter o terminal aberto.'
echo 'Para parear o Firefox/CRM local (válido por 5 min):'
echo "  node $ROOT/pair-local.mjs"
echo 'Cloudflare Access, domínio e variáveis Vercel ainda precisam ser configurados.'
echo 'Logs: journalctl --user -u realtalent-ai-agent -u realtalent-ai-bridge -n 40 --no-pager'
