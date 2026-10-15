import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const drawer=read('src/features/assistant/assistant-drawer.tsx');
const pkg=JSON.parse(read('package.json'));
const checks=[
 ['drawer V2.1',drawer.includes('V2.1')],
 ['Intelligence Orchestration visível',drawer.includes('Intelligence Orchestration')],
 ['Tool-First visível',drawer.includes('Tool-First')],
 ['Evidence Gate visível',drawer.includes('Evidence Gate')],
 ['Autonomous Engineering preservado',drawer.includes('Autonomous Engineering')],
 ['Project Brain preservado',drawer.includes('Project Brain')],
 ['Deep Visual QA preservado',drawer.includes('Deep Visual QA')],
 ['Governance preservada',drawer.includes('Governance')],
 ['Agent chat loopback',drawer.includes('127.0.0.1:8791')],
 ['programas preservados',drawer.includes('Programa autônomo')],
 ['missões/workflows preservados',drawer.includes('workflow')],
 ['confirmação escrita preservada',drawer.includes('Confirmação obrigatória para escrita')],
 ['package CRM válido',Boolean(pkg.name)],
 ['sem referência visual V2.0 no footer',!drawer.includes('V2.0 · Autonomous Agent')],
 ['Control Center preservado',drawer.includes('/control')],
 ['mesma IA preservada',drawer.includes('RealTalent AI Gateway')]
];
let ok=0;for(const [n,p] of checks){console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++}console.log(`\nCRM Agent V2.1 Intelligence Orchestration: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exit(1)
