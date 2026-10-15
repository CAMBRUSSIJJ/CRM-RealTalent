#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cmd="${1:-status}"; shift || true
case "$cmd" in
  status) exec node "$HERE/model-calibration.mjs" status ;;
  arena|run) exec node "$HERE/model-calibration.mjs" arena "${1:-all}" ;;
  recomendar|recommend) exec node "$HERE/model-calibration.mjs" recommend ;;
  humano|human) exec node "$HERE/model-calibration.mjs" human ;;
  aplicar|apply) exec node "$HERE/model-calibration.mjs" apply ;;
  completo|full)
    node "$HERE/model-calibration.mjs" arena all
    echo
    node "$HERE/model-calibration.mjs" recommend
    echo
    read -r -p 'Executar comparação humana A/B dos dois melhores modelos gerais? [s/N]: ' HUMAN
    if [[ "${HUMAN,,}" == s || "${HUMAN,,}" == sim ]]; then
      if ! node "$HERE/model-calibration.mjs" human; then
        echo 'A/B humano não foi executado (é necessário ter pelo menos dois modelos gerais).' >&2
      fi
    fi
    echo
    node "$HERE/model-calibration.mjs" recommend
    echo
    read -r -p 'Aplicar esta calibração ao agent.env? [s/N]: ' APPLY
    if [[ "${APPLY,,}" == s || "${APPLY,,}" == sim ]]; then node "$HERE/model-calibration.mjs" apply; else echo 'Nenhuma configuração foi alterada.'; fi
    ;;
  selftest) exec node "$HERE/model-calibration.mjs" selftest ;;
  *) cat <<'HELP'
RealTalent Agent V3.1.1 — Model & Human Quality Calibration

Uso:
  model-calibration-linux.sh status
  model-calibration-linux.sh arena [all|general|reasoning|coder|vision]
  model-calibration-linux.sh recomendar
  model-calibration-linux.sh humano
  model-calibration-linux.sh aplicar
  model-calibration-linux.sh completo
  model-calibration-linux.sh selftest

A arena usa somente modelos já instalados no Ollama. Não baixa modelos e não altera agent.env.
O comando aplicar cria backup do agent.env antes de trocar os papéis calibrados.
HELP
  ;;
esac
