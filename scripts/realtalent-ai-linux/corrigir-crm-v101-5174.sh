#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="$HOME/.local/share/realtalent-ai"
TARGET="$ROOT/browser-connector.mjs"
ORIGIN="http://127.0.0.1:5174"

echo "=== RealTalent IA local: liberar somente a prévia CRM V101.11.3 ==="
[[ "$(uname -s)" == Linux ]] || { echo "Este diagnóstico é exclusivo do Linux."; exit 1; }
command -v node >/dev/null || { echo "Node.js não encontrado."; exit 1; }
command -v systemctl >/dev/null || { echo "systemctl não encontrado."; exit 1; }
if [[ ! -s "$TARGET" ]]; then
  echo "Conector da IA ainda não instalado em $TARGET."
  echo "Instale primeiro o Agent local existente; não alterei nenhum arquivo."
  exit 1
fi
echo "Verificando permissão de origem restrita..."
node - "$TARGET" <<'JS'
const fs=require('node:fs')
const path=require('node:path')
const {randomBytes}=require('node:crypto')
const file=process.argv[2]
const before=fs.readFileSync(file,'utf8')
if(before.includes("'http://127.0.0.1:5174'")&&before.includes("'http://localhost:5174'")){
  console.log('Origem 5174 já autorizada, sem necessidade de atualizar.')
  process.exit(0)
}
const anchor="  'http://127.0.0.1:4197','http://localhost:4197',"
if(!before.includes(anchor)){
  console.error('Formato do conector diferente do esperado. Nenhuma alteração foi feita.')
  process.exit(2)
}
const after=before.replace(anchor, anchor+"\n  'http://127.0.0.1:5174','http://localhost:5174',")
if(after===before||after.includes("http://0.0.0.0")||after.includes("'*'")){
  console.error('Revisão de segurança falhou. Nenhuma alteração aplicada.')
  process.exit(2)
}
const backup=file+'.backup-before-5174-'+Date.now()
fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL)
fs.chmodSync(backup,0o600)
const tmp=path.join(path.dirname(file),'.browser-connector-'+randomBytes(6).toString('hex')+'.tmp')
fs.writeFileSync(tmp,after,{mode:0o600,flag:'wx'})
fs.renameSync(tmp,file)
console.log('Ponte atualizada; backup local preservado.')
JS
node --check "$TARGET" >/dev/null
echo
echo "Iniciando os serviços locais existentes (sem modificar Ollama ou WAHA Docker)..."
systemctl --user start realtalent-ai-agent.service 2>/dev/null || true
if ! systemctl --user restart realtalent-ai-bridge.service; then
  echo "A ponte não iniciou pelo systemd. Verifique o serviço realtalent-ai-bridge."
  exit 1
fi
sleep 2
echo
echo "=== Diagnóstico da IA ==="
for unit in realtalent-ai-agent realtalent-ai-bridge; do
  if systemctl --user is-active --quiet "$unit.service";then
    echo "OK: $unit.service ativo"
  else
    echo "ATENÇÃO: $unit.service não está ativo"
  fi
done
if curl --noproxy '*' -fsS --max-time 4 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "OK: Ollama respondeu em 11434"
else
  echo "ATENÇÃO: Ollama não respondeu em 11434; inicie seu Ollama local"
fi
if curl --noproxy '*' -fsS --max-time 5 http://127.0.0.1:8792/tools/health >/dev/null 2>&1; then
  echo "OK: Agent respondeu em 8792"
else
  echo "ATENÇÃO: Agent ainda não responde em 8792"
fi
CODE="$(curl --noproxy '*' -s -o /dev/null -w '%{http_code}' --max-time 5 -H "Origin: $ORIGIN" http://127.0.0.1:8798/browser/ping || true)"
if [[ "$CODE" != 200 ]];then
  echo "ATENÇÃO: Pareamento em 8798 não respondeu com HTTP 200 (retornou $CODE)"
  echo "Confira se a bridge está ativa; não é problema de código de seis dígitos."
  exit 1
fi
echo "OK: Firefox na origem $ORIGIN está autorizado pela ponte 8798."
echo
echo "Gere agora um novo código temporário no terminal e use-o no CRM:"
if [[ -f "$ROOT/pair-local.mjs" ]];then
  node "$ROOT/pair-local.mjs"
else
  echo "Arquivo pair-local.mjs não encontrado; execute realtalent-ia pair."
fi
echo "No CRM: Configurações > RealTalent IA > Conectar IA local."
echo "Não compartilhe o código de seis dígitos nem os tokens."
