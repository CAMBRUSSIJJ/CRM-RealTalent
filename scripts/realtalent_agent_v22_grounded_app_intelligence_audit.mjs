import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd()
const client=fs.readFileSync(path.join(root,'src/services/realtalent-agent-client.ts'),'utf8')
const drawer=fs.readFileSync(path.join(root,'src/features/assistant/assistant-drawer.tsx'),'utf8')
const checks=[
 ['App Context client',client.includes('syncCrmAppContext')&&client.includes('/app-context/sync')],
 ['CRM context payload',client.includes("product:'crm'")&&client.includes('screenState')&&client.includes('actionsAllowed')&&client.includes('data:{ stages:raw.stages')],
 ['route atual sincronizada',drawer.includes('currentRoute: route')&&drawer.includes('syncCrmAppContext(snapshot, context)')],
 ['entidade selecionada sincronizada',client.includes("type:'lead'")&&client.includes("type:'proposal'")],
 ['V2.2 visível no Agent',drawer.includes('V2.2 Grounded App Intelligence')&&drawer.includes('V2.2 · Grounded App Intelligence')],
]
let ok=0;for(const [name,pass] of checks){console.log(`${pass?'OK  ':'FAIL'} ${name}`);if(pass)ok++}
console.log(`\nCRM Agent V2.2 structural audit: ${ok}/${checks.length} PASS`);if(ok!==checks.length)process.exit(1)
