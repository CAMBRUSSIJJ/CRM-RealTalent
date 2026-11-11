#!/usr/bin/env bash
# RealTalent Garimpo — small batches, early fact preservation and partial status.
# Operates only on two research modules; never touches Docker, volumes or garimpo.env.
set -u -o pipefail
umask 077
echo "===== GARIMPO — CORREÇÃO DA EXTRAÇÃO LOCAL ====="
for tool in curl git node npm; do
  command -v "$tool" >/dev/null 2>&1 || { echo "ERRO: falta $tool."; exit 1; }
done
ROOT=""
for config in "$HOME"/Downloads/RealTalent-Garimpo-Conexao-*/deploy/local-garimpo/garimpo.env; do
  [[ -f "$config" ]] || continue
  if [[ -n "$ROOT" ]]; then
    echo "ERRO: mais de um conector encontrado. Nada será alterado."
    exit 1
  fi
  ROOT="$(dirname "$(dirname "$(dirname "$config")")")"
done
if [[ -z "$ROOT" || ! -f "$ROOT/deploy/local-garimpo/staged-research.mjs" ||
      ! -d "$ROOT/deploy/local-garimpo/node_modules" ]]; then
  echo "ERRO: a versão por etapas não está instalada. Nada foi alterado."
  exit 1
fi
REV="f2cbd4dec60b5ef4a37f1bd99823680f2f7c19c0"
FILES=(
  "deploy/local-garimpo/staged-research.mjs|b06aefd269eb254c87bf92a6c62237006cc674a5"
  "deploy/local-garimpo/staged-research-check.mjs|3edb19f485346c190afac318c98f67cb6ce48b15"
)
TEMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TEMP"' EXIT
BACKUP="$HOME/Downloads/Backups-Garimpo/antes-extracao-em-lotes-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP" || exit 1
chmod 700 "$BACKUP"

echo "===== BAIXANDO E CONFERINDO INTEGRIDADE ====="
for entry in "${FILES[@]}"; do
  IFS='|' read -r relative expected <<< "$entry"
  mkdir -p "$TEMP/$(dirname "$relative")" "$BACKUP/$(dirname "$relative")"
  url="https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/$REV/$relative"
  if ! curl -fLsS --retry 3 --connect-timeout 12 --max-time 110 "$url" -o "$TEMP/$relative"; then
    echo "Falha no download: $relative. Instalação preservada."
    exit 1
  fi
  if [[ "$(git hash-object "$TEMP/$relative")" != "$expected" ]]; then
    echo "Checksum inválido: $relative. Instalação preservada."
    exit 1
  fi
  node --check "$TEMP/$relative" || { echo "Sintaxe inválida: $relative. Instalação preservada."; exit 1; }
  echo "✓ $(basename "$relative")"
done
echo "===== SALVANDO VERSÃO ATUAL ====="
for entry in "${FILES[@]}"; do
  IFS='|' read -r relative expected <<< "$entry"
  cp -p "$ROOT/$relative" "$BACKUP/$relative" || { echo "Falha no backup. Nada alterado."; exit 1; }
done
rollback() {
  echo "Restaurando a versão anterior..."
  for entry in "${FILES[@]}"; do
    IFS='|' read -r relative expected <<< "$entry"
    cp -p "$BACKUP/$relative" "$ROOT/$relative" || true
  done
}
echo "===== ATUALIZANDO MOTOR E EXECUTANDO TESTES ====="
for entry in "${FILES[@]}"; do
  IFS='|' read -r relative expected <<< "$entry"
  if ! cp "$TEMP/$relative" "$ROOT/$relative"; then
    rollback
    echo "Falha de atualização: $relative"
    exit 1
  fi
done
if ! (cd "$ROOT/deploy/local-garimpo" && npm test); then
  rollback
  echo "Testes falharam. O motor anterior foi restaurado."
  exit 1
fi
echo "✓ Extração por lotes instalada e testes aprovados."
echo "✓ Dados, Docker, Ollama, WhatsApp e credenciais preservados."
echo "✓ Backup: $BACKUP"
echo
echo "Se o conector já estiver aberto, encerre apenas esse terminal com Ctrl+C."
echo "Depois execute: bash ~/Downloads/INICIAR-GARIMPO-LOCAL.sh"
