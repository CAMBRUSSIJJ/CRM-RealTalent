#!/usr/bin/env bash
set -u -o pipefail
umask 077
echo "===== ATUALIZANDO GARIMPO LOCAL — FONTES E INSTAGRAM ====="
for cmd in curl git node; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Falta: $cmd"; exit 1; }
done
ROOT=""
for config in "$HOME"/Downloads/RealTalent-Garimpo-Conexao-*/deploy/local-garimpo/garimpo.env; do
  [[ -f "$config" ]] || continue
  if [[ -n "$ROOT" ]]; then
    echo "Ha mais de uma instalacao. Nenhum arquivo alterado."
    exit 1
  fi
  ROOT="$(dirname "$(dirname "$(dirname "$config")")")"
done
if [[ -z "$ROOT" || ! -f "$ROOT/deploy/local-garimpo/bridge.mjs" || ! -f "$ROOT/supabase/functions/_shared/prospecting-ai.ts" || ! -f "$ROOT/supabase/functions/_shared/firecrawl-research.ts" ]]; then
  echo "Instalacao do conector nao localizada. Nenhum arquivo alterado."
  exit 1
fi
REV=a9ad6318dfede02c7f581344d5424ac51908c3c1
TMP="$(mktemp -d)" || exit 1
trap 'rm -rf "$TMP"' EXIT
BACKUP="$HOME/Downloads/Backups-Garimpo/motor-antes-instagram-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP" || exit 1
chmod 700 "$BACKUP"
FILES=(
  "deploy/local-garimpo/bridge.mjs|84e2159cbe51073526770ce9c389b76b66b8d35c"
  "supabase/functions/_shared/prospecting-ai.ts|5fd4a4c633d96bc4d06ff1fa0816d4eea717cadc"
  "supabase/functions/_shared/firecrawl-research.ts|b76c4eb67e9b97b68c7c2cdba2b9ddfef5a8c336"
)
echo "===== DOWNLOAD E CHECAGEM ====="
for pair in "${FILES[@]}"; do
  IFS='|' read -r file sha <<< "$pair"
  mkdir -p "$TMP/$(dirname "$file")" "$BACKUP/$(dirname "$file")"
  url="https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/$REV/$file"
  if ! curl -fLsS --retry 3 --max-time 120 "$url" -o "$TMP/$file"; then echo "Falha ao baixar $file. Nada alterado."; exit 1; fi
  if [[ "$(git hash-object "$TMP/$file")" != "$sha" ]]; then echo "Falha de integridade: $file. Nada alterado."; exit 1; fi
  echo "✓ $file"
done
node --check "$TMP/deploy/local-garimpo/bridge.mjs" || { echo "Sintaxe invalida. Nada alterado."; exit 1; }
for pair in "${FILES[@]}"; do
  IFS='|' read -r file sha <<< "$pair"
  cp -p "$ROOT/$file" "$BACKUP/$file" || { echo "Falha no backup. Nada alterado."; exit 1; }
done
echo "===== INSTALANDO APENAS MODULOS DE PESQUISA ====="
for pair in "${FILES[@]}"; do
  IFS='|' read -r file sha <<< "$pair"
  if ! cp "$TMP/$file" "$ROOT/$file"; then
    echo "Falha ao copiar $file. Restaurando backup..."
    for old in "${FILES[@]}"; do IFS='|' read -r previous sha <<< "$old"; cp -p "$BACKUP/$previous" "$ROOT/$previous" || true; done
    exit 1
  fi
done
echo "✓ Atualizacao concluida. Sem reinstalar Docker, Ollama, banco ou CRM."
echo "✓ Backup: $BACKUP"
echo "Encerre o terminal antigo do conector com Ctrl+C e reinicie:"
echo "bash ~/Downloads/INICIAR-GARIMPO-LOCAL.sh"
