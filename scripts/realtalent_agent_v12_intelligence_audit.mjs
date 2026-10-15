import fs from 'node:fs'
const text=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const drawer=text('src/features/assistant/assistant-drawer.tsx')
const settings=text('src/features/settings/realtalent-ai-panel.tsx')
const client=text('src/services/realtalent-agent-client.ts')
const checks=[
 ['branding V1.3',drawer.includes('V1.3 Chat Experience')&&drawer.includes('V1.3 · Chat Experience')],
 ['Conversa principal',drawer.includes('V3.1.3 Embedded Agent')|| (drawer.includes('http://127.0.0.1:8791/chat')&&drawer.includes('Abrir Agent'))],
 ['Control Center preservado',drawer.includes('http://127.0.0.1:8791/control')],
 ['provider neutro',drawer.includes('Provider controlado pelo Runtime')],
 ['IA local-first settings',settings.includes('Ollama local-first')&&settings.includes('Sem cobrança por token no modo local')],
 ['OpenAI opcional',settings.includes('OpenAI é opcional')],
 ['Program preservado',client.includes("tool: 'system.run_program'")&&drawer.includes('getActiveCrmProgram')],
 ['Mission preservada',client.includes("tool: 'system.run_mission'")&&drawer.includes('getActiveCrmMission')],
 ['Workflow preservado',client.includes("tool: 'system.run_workflow'")&&drawer.includes('getActiveCrmWorkflow')],
 ['Builder preservado',drawer.includes('runUnifiedBuilder')],
 ['Browser QA preservado',drawer.includes('runUnifiedBrowserQa')],
 ['Governance preservada',drawer.includes('Governance')&&drawer.includes('awaiting_acceptance')],
 ['checkpoint escrita preservado',drawer.includes('Confirmação obrigatória para escrita')],
 ['sem chave OpenAI obrigatória',!drawer.includes("export OPENAI_API_KEY='...' ")],
]
let ok=0;for(const [l,p] of checks){console.log(`${p?'OK  ':'FAIL'} ${l}`);if(p)ok++}
console.log(`\nCRM Agent V1.2 regression on V1.3: ${ok}/${checks.length}`);if(ok!==checks.length)process.exit(1)
