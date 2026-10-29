#!/usr/bin/env bash
# Abre o RealTalent e mantem a janela visivel em caso de falha.
# O servico principal roda em um processo filho: seu exit nao encerra o shell do usuario.
set -uo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="$HOME/RealTalent-Garimpo-G1G2-Teste/logs"
mkdir -p "$LOG_DIR"
SESSION_LOG="$LOG_DIR/ultimo-inicio.log"
STATUS=0

echo "============================================================"
echo " RealTalent Garimpo Intelligence G1 + G2"
echo " Diagnostico da inicializacao"
echo "============================================================"
echo "Log desta execucao: $SESSION_LOG"
echo

if [[ ! -f "$ROOT/scripts/garimpo-g1g2-linux/abrir-local.sh" ]]; then
  echo "ERRO: nao foi encontrado o inicializador em $ROOT" | tee "$SESSION_LOG"
  STATUS=2
else
  (
    cd "$ROOT" || exit 2
    bash scripts/garimpo-g1g2-linux/abrir-local.sh
  ) 2>&1 | tee "$SESSION_LOG"
  STATUS=${PIPESTATUS[0]}
fi

echo
if (( STATUS == 0 )); then
  echo "RealTalent encerrado normalmente."
elif (( STATUS == 130 || STATUS == 143 )); then
  echo "RealTalent interrompido pelo usuario (codigo $STATUS)."
else
  echo "ATENCAO: o RealTalent terminou com erro (codigo $STATUS)."
  echo "Confira o log em: $SESSION_LOG"
  for file in prospecting-agent.log gateway.log ollama.log; do
    if [[ -s "$LOG_DIR/$file" ]]; then
      echo
      echo "----- Ultimas mensagens: $file -----"
      tail -n 15 "$LOG_DIR/$file" || true
    fi
  done
  echo
  echo "Portas a conferir: CRM 4197, busca 4320, IA 8804/8805, Ollama 11434."
  echo "A V6.4 nao e encerrada por este diagnostico."
fi

if [[ -r /dev/tty && -w /dev/tty ]]; then
  printf '\nPressione Enter para fechar este inicializador... ' >/dev/tty
  IFS= read -r _ </dev/tty || true
fi
exit "$STATUS"
