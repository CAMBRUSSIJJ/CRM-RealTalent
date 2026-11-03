#!/usr/bin/env bash
# RealTalent AI Local Connect — one-command launcher (no paid inference).
set -Eeuo pipefail
umask 077
ROOT="$HOME/.local/share/realtalent-ai"
CONF="$HOME/.config/realtalent-ai"
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ACTION="${1:-start}"

case "$ACTION" in
  start|status|pair|test|stop|install|help|--help) ;;
  *) echo "Uso: realtalent-ia [start|status|pair|test|stop|install]" >&2;exit 2 ;;
esac
if [[ "$ACTION" == help || "$ACTION" == --help ]];then
  echo "realtalent-ia           inicia Ollama + Agente + ponte; exibe pareamento"
  echo "realtalent-ia status    verifica serviços e modelo"
  echo "realtalent-ia pair      gera novo código de 6 dígitos"
  echo "realtalent-ia test      verifica uma geração real no Ollama"
  echo "realtalent-ia stop      para Agent e ponte (não afeta outros serviços)"
  echo "realtalent-ia install   instala ou atualiza os serviços"
  exit 0
fi
if [[ "$(uname -s)" != Linux ]];then echo 'Disponível somente para Linux.' >&2;exit 2;fi
for bin in curl node systemctl;do
  command -v "$bin" >/dev/null 2>&1 || { echo "Instale $bin antes de usar o conector." >&2;exit 2; }
done
installer="$ROOT/repo/scripts/realtalent-ai-linux/start-linux.sh"
if [[ -f "$SCRIPT_DIR/start-linux.sh" ]];then installer="$SCRIPT_DIR/start-linux.sh";fi
if [[ "$ACTION" == install ]] || [[ ! -s "$ROOT/secure-bridge.mjs" ]] ||
  ! systemctl --user list-unit-files realtalent-ai-agent.service --no-legend 2>/dev/null | grep -q realtalent-ai-agent;then
  if [[ ! -f "$installer" ]];then
    echo 'Baixe a branch atual do RealTalent e execute:' >&2
    echo '  bash scripts/realtalent-ai-linux/ativar-ia-no-crm.sh' >&2
    exit 2
  fi
  echo 'Configurando RealTalent AI no Linux...'
  bash "$installer"
  if [[ "$ACTION" == install ]];then exit 0;fi
fi
if [[ "$ACTION" == stop ]];then
  systemctl --user stop realtalent-ai-bridge.service realtalent-ai-agent.service 2>/dev/null || true
  echo 'Agente e ponte local desligados. Configuração preservada.'
  exit 0
fi
if [[ "$ACTION" == start || "$ACTION" == test ]];then
  if systemctl --user list-unit-files realtalent-ollama.service --no-legend 2>/dev/null | grep -q realtalent-ollama;then
    systemctl --user start realtalent-ollama.service
  fi
  systemctl --user start realtalent-ai-agent.service realtalent-ai-bridge.service
fi
echo ''
echo 'RealTalent AI — status'
for unit in realtalent-ai-agent realtalent-ai-bridge realtalent-ai-watchdog.timer;do
  if systemctl --user is-active --quiet "$unit";then echo "  OK  $unit";else echo "  --  $unit (offline)";fi
done
model='qwen3:8b'
if [[ -f "$CONF/agent.env" ]];then
  set -a
  source "$CONF/agent.env"
  set +a
  model="${REALTALENT_OLLAMA_MODEL:-qwen3:8b}"
fi
if curl -fsS --max-time 4 http://127.0.0.1:11434/api/tags >/dev/null 2>&1;then
  echo '  OK  Ollama em 127.0.0.1:11434'
else
  echo '  --  Ollama indisponível'
fi
if command -v ollama >/dev/null 2>&1 && ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -Fxq "$model";then
  echo "  OK  Modelo instalado: $model"
else
  echo "  --  Modelo $model ausente. Execute: ollama pull $model"
fi
bridge_online=false
if curl -fsS --max-time 4 -H 'Origin: https://crm-real-talent.vercel.app' \
  'http://127.0.0.1:8798/browser/ping' >/dev/null 2>&1;then
  bridge_online=true
  echo '  OK  Ponte autenticada do navegador (porta 8798)'
else
  echo '  --  Ponte offline. Consulte: journalctl --user -u realtalent-ai-bridge -n 30'
fi
if [[ "$ACTION" == test ]];then
  echo "Executando inferência real com $model, sem API externa..."
  request="$(node -e 'process.stdout.write(JSON.stringify({model:process.argv[1],prompt:"Responda somente OK.",stream:false,options:{num_predict:12}}))' "$model")"
  response="$(curl --fail --silent --show-error --max-time 180 -H 'Content-Type: application/json' \
    -d "$request" http://127.0.0.1:11434/api/generate)" || exit 1
  printf '%s' "$response" | node -e '
    let raw="";process.stdin.on("data",x=>raw+=x);
    process.stdin.on("end",()=>{try{const x=JSON.parse(raw);
      if(x.error||!String(x.response||"").trim())throw Error("inference_failed");
      console.log("OK: modelo respondeu localmente; sem tokens pagos.");
    }catch{console.error("Falha na geração local.");process.exitCode=1}})
  '
  exit $?
fi
if [[ "$ACTION" == start || "$ACTION" == pair ]];then
  if [[ "$bridge_online" != true ]];then
    echo 'A ponte não respondeu. O código não será gerado até o serviço ficar online.' >&2
    exit 1
  fi
  node "$ROOT/pair-local.mjs"
  echo 'Abra o CRM NESTE computador: Configurações → RealTalent IA → IA deste computador.'
  echo 'Se já estiver pareado, não precisa digitar o código novamente.'
  echo 'Ollama permanece local: sem Cloudflare Tunnel e sem inferência paga.'
fi
