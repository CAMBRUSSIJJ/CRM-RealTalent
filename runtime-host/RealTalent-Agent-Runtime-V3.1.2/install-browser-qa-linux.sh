#!/usr/bin/env bash
set -euo pipefail
PY="${PYTHON:-python3}"
if ! command -v "$PY" >/dev/null 2>&1; then echo 'ERRO: Python 3 não encontrado.' >&2; exit 1; fi
if ! "$PY" - <<'PY' >/dev/null 2>&1
import playwright
PY
then
  echo 'Instalando Playwright Python no usuário...'
  "$PY" -m pip install --user playwright
fi
BROWSER=''
for c in chromium chromium-browser google-chrome google-chrome-stable; do
  if command -v "$c" >/dev/null 2>&1; then BROWSER="$(command -v "$c")"; break; fi
done
if [[ -z "$BROWSER" ]]; then
  echo 'Chromium/Chrome do sistema não encontrado.' >&2
  echo 'No Ubuntu/Debian, instale com: sudo apt install chromium-browser  (ou chromium, conforme a distribuição)' >&2
  exit 2
fi
export REALTALENT_AGENT_CHROMIUM="$BROWSER"
echo "Browser detectado: $BROWSER"
"$PY" "$(dirname "$0")/browser_qa.py" --self-test
