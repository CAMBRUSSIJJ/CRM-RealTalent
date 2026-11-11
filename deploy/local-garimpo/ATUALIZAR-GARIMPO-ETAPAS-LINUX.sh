#!/usr/bin/env bash
# RealTalent Garimpo: pesquisa local em etapas. Nunca edita Docker/banco/tokens.
set -u -o pipefail
umask 077
echo "===== GARIMPO: ATUALIZAÇÃO DA INVESTIGAÇÃO POR ETAPAS ====="
for tool in curl git node npm; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Falta: $tool"; exit 1; }
done
ROOT=""
for config in "$HOME"/Downloads/RealTalent-Garimpo-Conexao-*/deploy/local-garimpo/garimpo.env; do
  [[ -f "$config" ]] || continue
  [[ -z "$ROOT" ]] || { echo "Mais de um conector localizado; nada foi alterado."; exit 1; }
  ROOT="$(dirname "$(dirname "$(dirname "$config")")")"
done
if [[ -z "$ROOT" || ! -f "$ROOT/deploy/local-garimpo/bridge.mjs" ||
      ! -f "$ROOT/supabase/functions/_shared/prospecting-ai.ts" ||
      ! -d "$ROOT/deploy/local-garimpo/node_modules" ]]; then
  echo "Instalação antiga não encontrada. Nenhuma alteração."
  exit 1
fi
REV="9f1de60f5d7fb134bbe322a14ea7559d6169c18b"
FILES=(
  "deploy/local-garimpo/bridge.mjs|a568690a83783429c28dada74e47ca313376b0a4"
  "deploy/local-garimpo/staged-research.mjs|61b091c09db91b2e079cd9749f66d495c2f8a7be"
  "deploy/local-garimpo/bridge-check.mjs|c9a0ef4031916f756e31c9085766176eadcba5ed"
  "deploy/local-garimpo/staged-research-check.mjs|2c5ecbc787eb70485313b1db2a779a3f3e42c2bb"
  "deploy/local-garimpo/package.json|131128006be97090d99302bb0aa67b8c3d222d64"
  "supabase/functions/_shared/prospecting-ai.ts|5fd4a4c633d96bc4d06ff1fa0816d4eea717cadc"
  "supabase/functions/_shared/firecrawl-research.ts|b76c4eb67e9b97b68c7c2cdba2b9ddfef5a8c336"
)
TMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMP"' EXIT
BACKUP="$HOME/Downloads/Backups-Garimpo/antes-investigacao-etapas-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP" || exit 1
chmod 700 "$BACKUP"

echo "===== DOWNLOAD VERIFICADO ====="
for entry in "${FILES[@]}"; do
  IFS='|' read -r relative expected <<< "$entry"
  mkdir -p "$TMP/$(dirname "$relative")" "$BACKUP/$(dirname "$relative")"
  url="https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/$REV/$relative"
  if ! curl -fLsS --retry 3 --connect-timeout 12 --max-time 110 "$url" -o "$TMP/$relative"; then
    echo "Falha no download: $relative. Nenhum arquivo alterado."
    exit 1
  fi
  if [[ "$(git hash-object "$TMP/$relative")" != "$expected" ]]; then
    echo "Arquivo alterado ou corrompido: $relative. Instalação preservada."
    exit 1
  fi
  echo "✓ $relative"
done
for file in deploy/local-garimpo/bridge.mjs deploy/local-garimpo/staged-research.mjs deploy/local-garimpo/staged-research-check.mjs; do
  if ! node --check "$TMP/$file"; then
    echo "Sintaxe inválida: $file. Nenhuma alteração."
    exit 1
  fi
done
echo "===== BACKUP DA VERSÃO ANTIGA ====="
for entry in "${FILES[@]}"; do
  IFS='|' read -r relative expected <<< "$entry"
  if [[ -f "$ROOT/$relative" ]]; then
    cp -p "$ROOT/$relative" "$BACKUP/$relative" || { echo "Falha no backup. Nada alterado."; exit 1; }
  fi
done
rollback() {
  echo "Restaurando versão anterior..."
  for entry in "${FILES[@]}"; do
    IFS='|' read -r relative expected <<< "$entry"
    if [[ -f "$BACKUP/$relative" ]]; then
      cp -p "$BACKUP/$relative" "$ROOT/$relative" || true
    else
      rm -f "$ROOT/$relative"
    fi
  done
}
echo "===== INSTALANDO E TESTANDO ====="
for entry in "${FILES[@]}"; do
  IFS='|' read -r relative expected <<< "$entry"
  mkdir -p "$ROOT/$(dirname "$relative")"
  if ! cp "$TMP/$relative" "$ROOT/$relative"; then
    rollback
    echo "Falha na instalação de $relative."
    exit 1
  fi
done
if ! (cd "$ROOT/deploy/local-garimpo" && npm test); then
  echo "Testes falharam. Restaurando arquivos."
  rollback
  exit 1
fi
echo "✓ Motor por etapas instalado e testado."
echo "✓ Backup em: $BACKUP"
echo "✓ Banco, Docker, Ollama, WAHA e garimpo.env preservados."
echo
echo "Encerre apenas o conector antigo com Ctrl+C e execute:"
echo "bash ~/Downloads/INICIAR-GARIMPO-LOCAL.sh"
