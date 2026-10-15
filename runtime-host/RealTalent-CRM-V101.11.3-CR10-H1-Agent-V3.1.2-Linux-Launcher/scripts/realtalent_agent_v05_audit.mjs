import fs from 'node:fs'
const text=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const client=text('src/services/realtalent-agent-client.ts')
const provider=text('src/services/realtalent-assistant-provider.ts')
const drawer=text('src/features/assistant/assistant-drawer.tsx')
const assistant=text('src/services/realtalent-assistant.ts')
const notes=text('REALTALENT_AGENT_V0.5.md')
const checks=[
 ['provider híbrido legado preservado',provider.includes('hybrid-realtalent-agent-v0.3')],
 ['6 tools CRM preservadas',['crm.create_followup','crm.move_opportunity','crm.create_task','crm.update_lead_profile','crm.create_goal','crm.create_proposal'].every(t=>client.includes(t))],
 ['system.run_builder tipado',client.includes("tool: 'system.run_builder'")],
 ['system.run_qa tipado',client.includes("tool: 'system.run_qa'")],
 ['surface crm enviado',client.includes("surface: 'crm'")],
 ['plano run_builder no domínio',assistant.includes("kind: 'run_builder'")],
 ['plano run_qa no domínio',assistant.includes("kind: 'run_qa'")],
 ['ação system vira plano builder',client.includes("kind: 'run_builder'")&&client.includes('agent-builder:')],
 ['ação system vira plano qa',client.includes("kind: 'run_qa'")&&client.includes('agent-qa:')],
 ['drawer executa Builder no mesmo chat',drawer.includes('runUnifiedBuilder')&&drawer.includes("plan.kind === 'run_builder'")],
 ['drawer executa QA no mesmo chat',drawer.includes('runUnifiedBrowserQa')&&drawer.includes("plan.kind === 'run_qa'")],
 ['Builder exige confirmação',drawer.includes("confirmLabel: 'Executar Builder'")],
 ['Builder descreve backup/gates/rollback',drawer.includes('backup, executa gates e faz rollback')],
 ['QA não exige mutação comercial',drawer.includes("if (plan.kind === 'run_qa')")],
 ['job Builder usa /builder/run',client.includes("`${AGENT_URL}/builder/run`")],
 ['job Builder acompanha /builder/jobs',client.includes('/builder/jobs/')],
 ['QA usa /qa/run',client.includes("`${AGENT_URL}/qa/run`")],
 ['QA acompanha /qa/jobs',client.includes('/qa/jobs/')],
 ['branding único RealTalent Agent',drawer.includes('<strong>RealTalent Agent</strong>')],
 ['modos visíveis no trust strip',['ASK','ANALYZE','ACT','BUILD','QA'].every(x=>drawer.includes(x))],
 ['memória compartilhada comunicada',drawer.includes('Memória compartilhada CRM + Blue Ocean')],
 ['sem delete tools',!client.includes('crm.delete_')],
 ['doc memória não usa snapshot completo',notes.includes('Não persiste snapshots completos')],
 ['doc CDP CRM 9223',notes.includes('9223')],
]
let ok=0
for(const [label,pass] of checks){console.log(`${pass?'OK  ':'FAIL'} ${label}`);if(pass)ok++}
console.log(`\nCRM Agent V0.5: ${ok}/${checks.length} contratos aprovados.`)
if(ok!==checks.length)process.exit(1)
