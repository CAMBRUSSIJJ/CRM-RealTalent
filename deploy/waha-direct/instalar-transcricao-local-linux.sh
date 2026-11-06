#!/usr/bin/env bash
set -euo pipefail
# Instala somente no Linux atual: não altera Docker/WAHA nem o Ollama.
ROOT="$HOME/.local/share/realtalent-whisper"
MODEL="${REALTALENT_WHISPER_MODEL:-base}"
case "$MODEL" in tiny|base|small) ;; *) echo "Modelo inválido. Use tiny, base ou small."; exit 1;; esac
command -v python3 >/dev/null || { echo "Instale python3 e python3-venv."; exit 1; }
mkdir -p "$ROOT/models"
chmod 700 "$ROOT"
if [[ ! -x "$ROOT/venv/bin/python" ]]; then
  python3 -m venv "$ROOT/venv" || {
    echo "Ambiente Python indisponível. No Debian: sudo apt install python3-venv"
    exit 1
  }
fi
echo "Instalando faster-whisper isolado (CPU/int8), sem API paga..."
"$ROOT/venv/bin/python" -m pip install --disable-pip-version-check "faster-whisper>=1.1,<2"
echo "Baixando SOMENTE o modelo público $MODEL para cache local (primeira vez)..."
REALTALENT_WHISPER_MODEL="$MODEL" "$ROOT/venv/bin/python" - <<'PY'
import os
from faster_whisper import WhisperModel
model = os.environ["REALTALENT_WHISPER_MODEL"]
root = os.path.expanduser("~/.local/share/realtalent-whisper/models")
WhisperModel(model, device="cpu", compute_type="int8", cpu_threads=4, download_root=root)
print("Modelo local", model, "pronto.")
PY
echo "Transcrição instalada. Áudios recebidos e transcrições não são enviados à nuvem."
echo "Reinicie a ponte local do CRM para testar na aba IA local."
