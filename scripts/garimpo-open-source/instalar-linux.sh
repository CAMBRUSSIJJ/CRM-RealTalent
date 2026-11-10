#!/usr/bin/env bash
# Instala SOMENTE dependências opcionais do Garimpo em ambiente isolado do usuário.
set -euo pipefail
ROOT="$(cd -- "$(dirname "$0")/../.." && pwd)"
DATA="$HOME/.local/share/realtalent-open-source-garimpo"
VENV="$DATA/venv"
command -v python3 >/dev/null || { echo "Python 3 não encontrado."; exit 1; }
python3 -c 'import sys; assert sys.version_info >= (3,12), "Python 3.12 ou superior necessário"'
mkdir -p "$DATA"
chmod 700 "$DATA"
if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV" || {
    echo "Falha ao criar venv. Instale python3-venv e execute novamente."
    exit 2
  }
fi
echo "Instalando bibliotecas no ambiente isolado: $VENV"
"$VENV/bin/python" -m pip install --disable-pip-version-check \
  'crawl4ai==0.9.5' 'scrapegraphai==2.3.1'
echo "Configurando Chromium do Playwright (download pode ser grande)..."
"$VENV/bin/python" -m playwright install chromium
echo "Conferindo módulos..."
"$VENV/bin/python" "$ROOT/scripts/garimpo-open-source/worker.py" --health
echo "Executando teste offline real do Crawl4AI..."
"$VENV/bin/python" "$ROOT/scripts/garimpo-open-source/smoke.py"
echo
echo "✓ Dependências instaladas sem modificar Node, WAHA, banco ou Production."
echo "Ative APÓS reiniciar o Agent local deste checkout:"
echo "  export REALTALENT_GARIMPO_OPEN_SOURCE=1"
echo "  export REALTALENT_GARIMPO_SCRAPEGRAPH=0  # altere para 1 após validar Crawl4AI"
echo "  bash scripts/garimpo-g4/ativar-agente-local.sh"
