import fs from 'node:fs'
const text=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const drawer=text('src/features/assistant/assistant-drawer.tsx')
const client=text('src/services/realtalent-agent-client.ts')
const settings=text('src/features/settings/realtalent-ai-panel.tsx')
const checks=[
 ['V1.6 Conversation Intelligence',drawer.includes('V1.6 · Conversation Intelligence')],
 ['Conversa principal preservada',drawer.includes('assistant-drawer')&&(drawer.includes('http://127.0.0.1:8791/chat')||drawer.includes('V3.1.3 Embedded Agent'))],
 ['Explique esta tela preservado',drawer.includes('Explique esta tela')&&(drawer.includes('product=crm')||drawer.includes('explainCurrentScreen'))],
 ['Modo técnico preservado',drawer.includes('http://127.0.0.1:8791/control')],
 ['Project Awareness preservado',drawer.includes('Project Awareness')],
 ['Provider controlado pelo runtime',drawer.includes('Provider controlado pelo Runtime')||drawer.includes('Runtime {aiTrace?.trace.providerId')],
 ['Ollama local-first',settings.includes('Ollama local-first')],
 ['OpenAI opcional',settings.includes('OpenAI é opcional')],
 ['Program preservado',client.includes("tool: 'system.run_program'")&&drawer.includes('getActiveCrmProgram')],
 ['Mission preservada',client.includes("tool: 'system.run_mission'")&&drawer.includes('getActiveCrmMission')],
 ['Workflow preservado',client.includes("tool: 'system.run_workflow'")&&drawer.includes('getActiveCrmWorkflow')],
 ['Builder preservado',drawer.includes('runUnifiedBuilder')],
 ['Browser QA preservado',drawer.includes('runUnifiedBrowserQa')],
 ['Governance preservada',drawer.includes('awaiting_acceptance')&&drawer.includes('Governance')],
 ['Confirmação de escrita preservada',drawer.includes('Confirmação obrigatória para escrita')||drawer.includes('escrita exige confirmação')],
]
let ok=0;for(const [label,pass] of checks){console.log(`${pass?'OK  ':'FAIL'} ${label}`);if(pass)ok++}
console.log(`\nCRM Agent V1.6 Conversation Intelligence: ${ok}/${checks.length}`);if(ok!==checks.length)process.exit(1)
