#!/usr/bin/env bash
set -euo pipefail
PRODUCT="${1:-}"
WORKSPACE="${2:-}"
[[ "$PRODUCT" == "crm" || "$PRODUCT" == "blue_ocean" ]] || { echo 'Uso: register-workspace-linux.sh <crm|blue_ocean> <workspace>' >&2; exit 2; }
[[ -d "$WORKSPACE" ]] || { echo "Workspace não encontrado: $WORKSPACE" >&2; exit 2; }
WORKSPACE="$(cd "$WORKSPACE" && pwd -P)"
EXPECTED="realtalent-crm"; [[ "$PRODUCT" == "blue_ocean" ]] && EXPECTED="blue-ocean-service-studio"
ACTUAL="$(node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(p.name||""))' "$WORKSPACE/package.json")"
[[ "$ACTUAL" == "$EXPECTED" ]] || { echo "Workspace rejeitado: package name '$ACTUAL', esperado '$EXPECTED'." >&2; exit 2; }
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/realtalent-agent"
FILE="$CONFIG_DIR/workspaces.json"
mkdir -p "$CONFIG_DIR"
node - "$FILE" "$PRODUCT" "$WORKSPACE" <<'NODE'
const fs=require('fs'); const path=require('path');
const [file,product,workspace]=process.argv.slice(2);
let data={}; try{data=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}
data[product]=workspace;
const tmp=file+'.'+process.pid+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600}); fs.renameSync(tmp,file); fs.chmodSync(file,0o600);
NODE
echo "Workspace registrado: $PRODUCT -> $WORKSPACE"
