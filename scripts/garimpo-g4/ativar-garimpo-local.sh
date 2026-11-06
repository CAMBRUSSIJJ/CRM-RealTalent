#!/usr/bin/env bash
# Starts or safely upgrades only the Prospecting Agent from this checkout.
# Preserves WAHA, CRM and all other services and never replaces unidentified PIDs.
set -euo pipefail
ROOT="$(cd -- "$(dirname "$0")/../.." && pwd)"
HEALTH="http://127.0.0.1:4319/api/prospecting-agent/health"
RESEARCH="http://127.0.0.1:4319/api/prospecting-agent/company/research"
cd "$ROOT"

probe_contract() {
  [[ "$(curl --noproxy '*' -sS --max-time 3 -o /dev/null -w '%{http_code}' \
      -X POST -H 'Content-Type: application/json' \
      -d '{"company":"x","city":"Rio Grande"}' "$RESEARCH" 2>/dev/null || true)" == "400" ]]
}
health_json="$(curl --noproxy '*' -fsS --max-time 3 "$HEALTH" 2>/dev/null || true)"
if [[ "$health_json" == *'"companyResearchVersion":"g45-company-focus-v1"'* ]] && probe_contract; then
  echo "✓ Prospecting Agent com pesquisa por empresa ativo em 4319."
  exit 0
fi
if ss -H -ltn '( sport = :4319 )' | grep -q .; then
  pid="$(ss -H -ltnp '( sport = :4319 )' | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1)"
  if [[ -z "$pid" || ! -d "/proc/$pid" ]]; then
    echo "AVISO: porta 4319 ocupada e dono não identificado. Nada foi interrompido."
    exit 2
  fi
  command_line="$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null || true)"
  working_dir="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  if [[ "$working_dir" != "$ROOT" || "$command_line" != *"scripts/realtalent-prospecting-agent.mjs"* ]]; then
    echo "AVISO: processo em 4319 não pertence a este checkout. Nada foi interrompido."
    exit 3
  fi
  if [[ -z "$health_json" ]]; then
    echo "AVISO: Agent anterior não respondeu ao health. Preservei o processo para inspeção."
    exit 4
  fi
  # Do not interrupt active discovery runs or queued campaigns.
  if ! printf '%s' "$health_json" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{try{const x=JSON.parse(s);process.exit(x.ok===true&&x.running===0&&x.queued===0?0:1)}catch{process.exit(1)}})"; then
    echo "AVISO: Garimpo ocupado ou estado desconhecido. Não reiniciei uma busca ativa."
    exit 5
  fi
  echo "↻ Atualizando somente o Agent de Garimpo identificado (PID $pid), sem apagar sua fila..."
  kill -TERM "$pid"
  for attempt in $(seq 1 24); do
    if ! ss -H -ltn '( sport = :4319 )' | grep -q .; then break; fi
    sleep .25
  done
  if ss -H -ltn '( sport = :4319 )' | grep -q .; then
    echo "AVISO: porta 4319 não liberou. Nenhuma interrupção adicional foi feita."
    exit 6
  fi
fi
echo "Iniciando o motor de Garimpo do checkout atual..."
nohup env REALTALENT_PROSPECTING_AGENT_HOST=127.0.0.1 \
  REALTALENT_PROSPECTING_AGENT_PORT=4319 \
  node scripts/realtalent-prospecting-agent.mjs \
  >> "$ROOT/.realtalent-prospecting-agent.log" 2>&1 </dev/null &
for attempt in $(seq 1 30); do
  sleep .3
  if curl --noproxy '*' -fsS --max-time 2 "$HEALTH" >/dev/null 2>&1 && probe_contract; then
    echo "✓ Garimpo G4.4 com pesquisa pública de empresas pronto em 4319."
    exit 0
  fi
done
echo "AVISO: motor não ficou pronto. Veja o log de Garimpo deste checkout."
exit 7
