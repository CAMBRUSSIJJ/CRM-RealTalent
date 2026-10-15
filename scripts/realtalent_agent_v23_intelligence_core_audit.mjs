import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd()
const client=fs.readFileSync(path.join(root,'src/services/realtalent-agent-client.ts'),'utf8')
const drawer=fs.readFileSync(path.join(root,'src/features/assistant/assistant-drawer.tsx'),'utf8')
const marker=fs.readFileSync(path.join(root,'REALTALENT_AGENT_V2.3.md'),'utf8')
const checks=[
 ['integração central /agent preservada',client.includes('/agent')],
 ['App Context Bridge preservado',client.includes('syncCrmAppContext')&&client.includes('/app-context/sync')],
 ['contexto da tela continua sincronizado',drawer.includes('currentRoute: route')&&drawer.includes('syncCrmAppContext(snapshot, context)')],
 ['V2.3 Intelligence Core visível',drawer.includes('V2.3 Intelligence Core')&&drawer.includes('V2.3 · Intelligence Core')],
 ['arquitetura declara cérebro central único',marker.includes('cérebro central')&&marker.includes('V2.3')],
]
let ok=0;for(const [name,pass] of checks){console.log(`${pass?'OK  ':'FAIL'} ${name}`);if(pass)ok++}
console.log(`\nCRM Agent V2.3 Intelligence Core integration: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exit(1)
