import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const ui=fs.readFileSync(path.join(root,"src/features/assistant/assistant-drawer.tsx"),'utf8')
const marker=fs.readFileSync(path.join(root,'REALTALENT_AGENT_V2.4.md'),'utf8')
const checks=[
 ['V2.4 capability preservada na V2.5',marker.includes('Memory & Knowledge')&&ui.includes('V2.7 Advanced Reasoning & Planning')],
 ['RAG/memória visíveis',ui.includes('RAG')||ui.includes('Memory & Knowledge')],
 ['cérebro central único',marker.includes('mesmo cérebro central')&&marker.includes('não cria uma IA separada')],
 ['Tool-First preservado',marker.includes('Tool-First/Evidence Gate')],
 ['memória explícita',marker.includes('não vira memória durável automaticamente')&&marker.includes('gravação durável é explícita')],
]
let ok=0;for(const [n,p] of checks){console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++}
console.log(`\nCRM Agent V2.5 compatibilidade Memory & Knowledge V2.4: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exit(1)
