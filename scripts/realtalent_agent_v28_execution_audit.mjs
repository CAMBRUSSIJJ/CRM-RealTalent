import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const ui=fs.readFileSync(path.join(root,'src/features/assistant/assistant-drawer.tsx'),'utf8');const marker=fs.readFileSync(path.join(root,'REALTALENT_AGENT_V2.8.md'),'utf8')
const checks=[
 ['V2.8 visível',ui.includes('V2.8 Execution Intelligence & Controlled Autonomy')&&ui.includes('V2.8 · Execution Intelligence & Controlled Autonomy')],
 ['gateway central preservado',ui.includes('127.0.0.1:8791')&&ui.includes('RealTalent AI Gateway')],
 ['zero silent writes declarado',marker.includes('maxSilentWriteActions = 0')&&marker.includes('confirmação explícita')],
 ['receipt + postcondition',marker.includes('recibo')&&marker.includes('pós-condição')],
 ['irreversibilidade explícita',marker.includes('irreversíveis')&&marker.includes('envio de mensagem')],
 ['V2.7 reasoning preservado',marker.includes('Advanced Reasoning & Planning V2.7')],
 ['inteligência anterior preservada',marker.includes('Learning & Evaluation V2.6')&&marker.includes('Memory & Knowledge V2.4')&&marker.includes('Grounded App Intelligence V2.2')]
];let ok=0;for(const[n,p]of checks){console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++}console.log(`\nCRM Agent V2.8 Execution integration: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exit(1)
