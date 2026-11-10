#!/usr/bin/env bash
# Garimpo G5.4 — isolated UI preview only.
# Does NOT run scripts/start.mjs and does NOT start/stop WhatsApp, WAHA,
# Communications, Supabase, Prospecting Agent, or the Ollama service.
set -uo pipefail
ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$ROOT" || exit 2

echo "=========================================================="
echo " RealTalent Garimpo G5.4 — prévia isolada em 4197"
echo "=========================================================="
echo "Esta prévia usa os serviços JÁ ATIVOS em 8791 (IA) e 4319 (busca)."
echo "Não substitui o inicializador oficial do CRM nem sua verificação de Comunicação."

if [[ ! -f node_modules/vite/bin/vite.js ]]; then
  echo "ERRO: dependências do Vite não instaladas neste checkout. Execute npm ci." >&2
  exit 3
fi

if ! command -v ss >/dev/null 2>&1; then
  echo "ERRO: comando ss não encontrado; não posso garantir isolamento da porta 4197." >&2
  exit 4
fi
if ss -H -ltn '( sport = :4197 )' | grep -q .; then
  echo "ERRO: porta 4197 já está em uso. Não encerrei o serviço existente." >&2
  ss -H -ltnp '( sport = :4197 )' || true
  exit 5
fi

if ! node --input-type=module -e '
  const url="http://127.0.0.1:8791/tools/prospect-investigate/status";
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(5000)});
    const v=await r.json();
    if(!r.ok||v.investigationReaderBuild!=="g54-evidence-review"||!v.openSourceEnabled){
      console.error("Agent G5.4 não confirmado; status:",JSON.stringify(v));
      process.exit(1);
    }
    console.log("✓ Agent G5.4 com Crawl4AI ativo na porta 8791.");
  }catch(e){
    console.error("Agent não acessível em 8791:",e?.cause?.code||e?.message);
    process.exit(1);
  }
'; then
  echo "ERRO: ative o Agent G5.4 antes de abrir a prévia." >&2
  exit 6
fi

if curl --noproxy '*' -fsS --max-time 5 \
  http://127.0.0.1:4319/api/prospecting-agent/health >/dev/null; then
  echo "✓ Motor de Garimpo já ativo na porta 4319."
else
  echo "AVISO: motor de Garimpo em 4319 não confirmou saúde; a busca poderá falhar."
fi

# Keep browser data separate from the official CRM origin. No edits to .env.local.
export VITE_DATA_MODE=local
export VITE_AGENT_GATEWAY_URL=http://127.0.0.1:8791
export VITE_PROSPECTING_GATEWAY_URL=http://127.0.0.1:4319
export VITE_WAHA_DIRECT_PREVIEW=0
echo
echo "Acesse http://127.0.0.1:4197 no navegador."
echo "Esta prévia NÃO gerencia nem reinicia WhatsApp/WAHA ou serviços do CRM."
echo "Use apenas Garimpo → Revisar → Guiada para avaliar G5.4."
echo "Para fechar somente a interface desta prévia, pressione Ctrl+C."
echo
exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4197 --strictPort
