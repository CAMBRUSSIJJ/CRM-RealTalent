import fs from 'node:fs'
const drawer=fs.readFileSync(new URL('../src/features/assistant/assistant-drawer.tsx',import.meta.url),'utf8')
const client=fs.readFileSync(new URL('../src/services/realtalent-agent-client.ts',import.meta.url),'utf8')
const checks=[
 ['drawer RealTalent Agent preservado',drawer.includes('RealTalent Agent')],
 ['V1.8 visível',drawer.includes('V1.8')],
 ['Deep Visual QA visível',drawer.includes('Deep Visual QA')],
 ['Project Brain preservado',drawer.includes('Project Brain')],
 ['Conversation Intelligence preservada',drawer.includes('Conversation Intelligence')],
 ['Explique esta tela preservado',drawer.includes('Explique esta tela')],
 ['contexto inclui rota atual',drawer.includes('window.location.pathname')],
 ['gateway local 8791',drawer.includes('127.0.0.1:8791')],
 ['modo técnico preservado',drawer.includes('127.0.0.1:8791/control')],
 ['Builder preservado',drawer.includes('Sandbox Builder')],
 ['Governance preservada',drawer.includes('Governance')],
 ['cliente Agent local preservado',client.includes('127.0.0.1:8791')||client.includes('REALTALENT_AGENT')],
 ['sem remoção de confirmação de escrita',drawer.includes('Confirmação obrigatória para escrita')],
 ['memória compartilhada preservada',drawer.includes('Memória compartilhada CRM + Blue Ocean')],
 ['programa autônomo preservado',drawer.includes('Programa autônomo')],
]
let ok=0;for(const [name,pass] of checks){console.log(`${pass?'OK  ':'FAIL'} ${name}`);if(pass)ok++}
console.log(`\nCRM Agent V1.8 Deep Visual: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exit(1)
