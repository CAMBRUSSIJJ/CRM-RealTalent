#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/CAMBRUSSIJJ/CRM-RealTalent.git"
BRANCH="feat/waha-local-audio-transcription-20261106"
APP="$HOME/Downloads/RealTalent-CRM-V101-WAHA"

echo "==============================================="
echo " RealTalent WAHA + Mídias + Whisper Local"
echo "==============================================="
echo "Instalação em prévia. Não altera o Docker WAHA nem Production."

for cmd in git node npm curl; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Comando necessário ausente: $cmd"
    exit 1
  }
done

node -e 'if(Number(process.versions.node.split(".")[0])!==22)process.exit(1)' || {
  echo "Para esta versão, é necessário Node.js 22."
  exit 1
}

if curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:5174/ >/dev/null 2>&1; then
  echo "O CRM antigo ainda ocupa a porta 5174."
  echo "Feche somente o terminal dessa prévia com Ctrl+C e execute novamente."
  exit 1
fi

if curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:4392/health >/dev/null 2>&1; then
  TOKEN_FILE="$HOME/.local/share/realtalent-waha-direct/access-token"
  if [[ ! -f "$TOKEN_FILE" ]]; then
    echo "A ponte 4392 está ativa, mas sua chave local não foi encontrada."
    echo "Feche somente o terminal da ponte antiga e tente novamente."
    exit 1
  fi
  FEATURE_INFO=$(curl --noproxy '*' -fsS --max-time 5 \
    -H "Authorization: Bearer $(cat "$TOKEN_FILE")" \
    http://127.0.0.1:4392/v1/features || true)
  if [[ "$FEATURE_INFO" != *'voice-transcription-v2.1-media'* ]]; then
    echo "A ponte antiga está em execução na porta 4392."
    echo "Encerre a ponte antiga com Ctrl+C. NÃO desligue o Docker WAHA."
    exit 1
  fi
fi

mkdir -p "$HOME/Downloads"
if [[ -e "$APP" && ! -d "$APP/.git" ]]; then
  echo "Existe uma pasta com esse nome, mas ela não é um repositório Git:"
  echo "$APP"
  echo "Para preservar seus arquivos, nada será sobrescrito."
  exit 1
fi

if [[ ! -d "$APP/.git" ]]; then
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP"
else
  if [[ -n "$(git -C "$APP" status --porcelain)" ]]; then
    echo "Foram encontradas alterações locais em $APP."
    echo "Nenhum arquivo foi sobrescrito. Faça backup ou commit antes de atualizar."
    exit 1
  fi
  git -C "$APP" fetch --depth 1 origin "$BRANCH"
  git -C "$APP" checkout -B "$BRANCH" FETCH_HEAD
fi

cd "$APP"

if [[ ! -x "$HOME/.local/share/realtalent-whisper/venv/bin/python" ]]; then
  echo "Instalando transcrição Whisper local..."
  bash deploy/waha-direct/instalar-transcricao-local-linux.sh
else
  echo "Whisper já está instalado. Mantendo a instalação existente."
fi

exec bash deploy/waha-direct/abrir-crm-v101-waha-linux.sh
