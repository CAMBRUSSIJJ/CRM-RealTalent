#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
[ -f .env.local ] || printf 'VITE_DATA_MODE=local\nVITE_RELEASE_CHANNEL=territory-ui-system\n' > .env.local
printf '\nGoogle Maps Platform — Território + Garimpo\n'
printf 'Ative na mesma chave: Geocoding API e Places API (New).\n'
read -rsp "Cole a GOOGLE_MAPS_SERVER_KEY (não será exibida): " KEY
printf '\n'
if [ -z "$KEY" ]; then echo "Nenhuma chave informada; nada foi alterado."; exit 1; fi
python - "$KEY" <<'PY'
from pathlib import Path
import sys
p=Path('.env.local'); key=sys.argv[1]; lines=p.read_text().splitlines() if p.exists() else []
found=False; out=[]
for line in lines:
    if line.startswith('GOOGLE_MAPS_SERVER_KEY='):
        out.append(f'GOOGLE_MAPS_SERVER_KEY={key}'); found=True
    else: out.append(line)
if not found: out.append(f'GOOGLE_MAPS_SERVER_KEY={key}')
p.write_text('\n'.join(out).rstrip()+'\n')
PY
chmod 600 .env.local 2>/dev/null || true
echo "✓ Chave salva localmente em .env.local."
echo "Reinicie com: ./start-linux.sh"
