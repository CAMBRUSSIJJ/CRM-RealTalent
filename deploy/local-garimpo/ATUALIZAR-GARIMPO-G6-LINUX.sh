#!/usr/bin/env bash
# G6 — updates only the local research modules; does not reinstall services.
set -euo pipefail
umask 077
echo "===== REALTALENT GARIMPO G6 — PESQUISA INTELIGENTE ====="
for tool in curl git node npm; do
  command -v "$tool" >/dev/null || { echo "ERRO: ferramenta ausente: $tool"; exit 1; }
done
ROOT=""
for env_file in "$HOME"/Downloads/RealTalent-Garimpo-Conexao-*/deploy/local-garimpo/garimpo.env; do
  [[ -f "$env_file" ]] || continue
  if [[ -n "$ROOT" ]]; then echo "ERRO: mais de um conector encontrado."; exit 1; fi
  ROOT="$(dirname "$(dirname "$(dirname "$env_file")")")"
done
if [[ -z "$ROOT" || ! -f "$ROOT/deploy/local-garimpo/staged-research.mjs" ||
      ! -d "$ROOT/deploy/local-garimpo/node_modules" ]]; then
  echo "ERRO: conector local por etapas não encontrado; nada foi modificado."
  exit 1
fi
REV="768e36034f6233018ffc6b438c90f17cc8ee5226"
FILES=(
  "deploy/local-garimpo/research-g6.mjs|d6c877478316a98f18965615fe1fa67ed7c95f18"
  "deploy/local-garimpo/staged-research.mjs|08337f216a8acb232bdc8b0492674d52afb51c5c"
  "deploy/local-garimpo/research-g6-check.mjs|f524d61b16a43abf1afc02469fe5ac2df3693e90"
  "deploy/local-garimpo/package.json|2615632b32c1fd9007048c9da6c266a0f95941b9"
  "deploy/local-garimpo/G6-LEIA-ME.md|2add5305eb80595f01a2c6f5a4f7dd2c73493f1d"
)
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
BACKUP="$HOME/Downloads/Backups-Garimpo/antes-g6-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
declare -A existed
echo "===== BAIXANDO E CONFERINDO INTEGRIDADE ====="
for entry in "${FILES[@]}"; do
  IFS='|' read -r relative expected <<< "$entry"
  mkdir -p "$TEMP/$(dirname "$relative")" "$BACKUP/$(dirname "$relative")"
  url="https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/$REV/$relative"
  curl -fLsS --retry 3 --connect-timeout 12 --max-time 110 "$url" -o "$TEMP/$relative" || {
    echo "ERRO: falha no download de $relative. Instalação preservada."
    exit 1
  }
  if [[ "$(git hash-object "$TEMP/$relative")" != "$expected" ]]; then
    echo "ERRO: checksum inválido em $relative. Nada instalado."
    exit 1
  fi
  case "$relative" in
    *.mjs) node --check "$TEMP/$relative" ;;
    *.json) node -e "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))" "$TEMP/$relative" ;;
  esac
  echo "✓ $(basename "$relative")"
done
echo "===== BACKUP DA VERSÃO ATUAL ====="
for entry in "${FILES[@]}"; do
  IFS='|' read -r relative expected <<< "$entry"
  if [[ -f "$ROOT/$relative" ]]; then
    cp -p "$ROOT/$relative" "$BACKUP/$relative"
    existed["$relative"]=yes
  else
    existed["$relative"]=no
  fi
done
rollback() {
  echo "Restaurando a versão anterior..."
  for entry in "${FILES[@]}"; do
    IFS='|' read -r relative expected <<< "$entry"
    if [[ "${existed[$relative]}" == yes ]]; then
      cp -p "$BACKUP/$relative" "$ROOT/$relative" || true
    else
      rm -f "$ROOT/$relative" || true
    fi
  done
}
echo "===== ATUALIZANDO APENAS O MOTOR DE PESQUISA ====="
for entry in "${FILES[@]}"; do
  IFS='|' read -r relative expected <<< "$entry"
  if ! cp "$TEMP/$relative" "$ROOT/$relative"; then
    rollback
    exit 1
  fi
done
echo "===== EXECUTANDO TESTES DO GARIMPO ====="
if ! (cd "$ROOT/deploy/local-garimpo" && npm test); then
  rollback
  echo "ERRO: testes falharam. A instalação anterior foi restaurada."
  exit 1
fi
echo "✓ G6 instalado: planejamento, fontes direcionadas, leitura profunda, briefing."
echo "✓ Docker, Ollama, banco, WhatsApp e garimpo.env preservados."
echo "✓ Backup: $BACKUP"
echo "Pare apenas o conector anterior com Ctrl+C, se estiver aberto."
echo "Depois inicie: bash ~/Downloads/INICIAR-GARIMPO-LOCAL.sh"
