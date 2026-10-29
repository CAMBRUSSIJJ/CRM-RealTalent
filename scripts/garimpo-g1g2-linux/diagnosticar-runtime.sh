#!/usr/bin/env bash
# Safe, read-only diagnosis for the isolated RealTalent Garimpo runtime.
# Reports HTTP status only; never prints tokens, credentials or raw logs.
set -u

echo "===== RealTalent Garimpo — Diagnóstico de serviços ====="
echo "CRM: 4197 | Garimpo: 4320 | IA: 8804 | Connect: 3011 | WhatsApp: 3012 | Controle: 3013"
echo

check_http() {
  local name="$1" url="$2" expected="${3:-200}" result
  result="$(curl --silent --show-error --max-time 4 --output /dev/null --write-out '%{http_code}' "$url" 2>/dev/null)" || result="000"
  if [[ "$result" == "$expected" ]]; then
    printf 'OK       %-19s HTTP %s\n' "$name" "$result"
  else
    printf 'ATENÇÃO  %-19s HTTP %s (esperado %s)\n' "$name" "$result" "$expected"
  fi
}

for port in 4197 4320 8804 3011 3012 3013; do
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "( sport = :$port )" 2>/dev/null | grep -q LISTEN; then
      printf 'Escutando: porta %s\n' "$port"
    else
      printf 'Sem listener: porta %s\n' "$port"
    fi
  fi
done

echo
check_http "CRM" "http://127.0.0.1:4197"
check_http "Garimpo" "http://127.0.0.1:4320/api/prospecting-agent/health"
check_http "IA" "http://127.0.0.1:8804/tools/health"
# Proxy forwards a private runtime token configured by the managed launcher.
# Do not access 3012/3013 directly: token-free requests legitimately get 401.
check_http "Gateway via CRM" "http://127.0.0.1:4197/__rt/communications/api/communications/health"
check_http "Controle via CRM" "http://127.0.0.1:4197/__rt/runtime/status"

echo
echo 'Se CRM está OK e WhatsApp offline: confirme que a sessão foi iniciada pelo launcher S3.5 (não por Vite avulso).'
echo 'Se uma porta 3011, 3012 ou 3013 já estiver ocupada, o launcher preserva a outra instalação e abre em modo degradado.'
echo "Log de inicialização: $HOME/RealTalent-Garimpo-G1G2-Teste/logs/ultimo-inicio.log"
echo 'O diagnóstico não lê credenciais nem altera processos.'
