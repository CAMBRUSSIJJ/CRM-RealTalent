import fs from 'node:fs'
const text=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const drawer=text('src/features/assistant/assistant-drawer.tsx')
const settings=text('src/features/settings/realtalent-ai-panel.tsx')
const client=text('src/services/realtalent-agent-client.ts')
const checks=[
 ['branding V1.1',drawer.includes('Local AI Runtime V1.1')&&drawer.includes('V1.1 local-first')],
 ['drawer não exige OpenAI',!drawer.includes("export OPENAI_API_KEY='...'")],
 ['provider neutro no drawer',drawer.includes('Provider controlado pelo Runtime')],
 ['settings local-first',settings.includes('Ollama local-first')&&settings.includes('Sem cobrança por token no modo local')],
 ['OpenAI opcional',settings.includes('OpenAI é opcional')],
 ['client aceita provider/model remoto',client.includes('provider?: string')&&client.includes('model?: string')],
 ['fallback de modelo local',client.includes("payload.model || 'IA Local'")],
 ['Program preservado',client.includes("tool: 'system.run_program'")&&drawer.includes('getActiveCrmProgram')],
 ['Mission preservada',client.includes("tool: 'system.run_mission'")&&drawer.includes('getActiveCrmMission')],
 ['Workflow preservado',client.includes("tool: 'system.run_workflow'")&&drawer.includes('getActiveCrmWorkflow')],
 ['Builder e QA preservados',drawer.includes('runUnifiedBuilder')&&drawer.includes('runUnifiedBrowserQa')],
 ['Governance preservada',drawer.includes('Governança')&&drawer.includes('awaiting_acceptance')],
 ['escrita continua confirmada',drawer.includes('Confirmação obrigatória para escrita')],
]
let ok=0;for(const [l,p] of checks){console.log(`${p?'OK  ':'FAIL'} ${l}`);if(p)ok++}
console.log(`\nCRM Agent V1.1 Local AI Runtime: ${ok}/${checks.length}`);if(ok!==checks.length)process.exit(1)
