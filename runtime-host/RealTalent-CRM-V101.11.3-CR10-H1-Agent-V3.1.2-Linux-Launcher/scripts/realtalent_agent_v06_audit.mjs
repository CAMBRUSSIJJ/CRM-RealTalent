import fs from 'node:fs'
const text=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const client=text('src/services/realtalent-agent-client.ts')
const drawer=text('src/features/assistant/assistant-drawer.tsx')
const notes=text('REALTALENT_AGENT_V0.6.md')
const checks=[
 ['6 tools CRM preservadas',['crm.create_followup','crm.move_opportunity','crm.create_task','crm.update_lead_profile','crm.create_goal','crm.create_proposal'].every(t=>client.includes(t))],
 ['Builder unificado preservado',drawer.includes('runUnifiedBuilder')&&drawer.includes("plan.kind === 'run_builder'")],
 ['QA unificado preservado',drawer.includes('runUnifiedBrowserQa')&&drawer.includes("plan.kind === 'run_qa'")],
 ['branding único',drawer.includes('<strong>RealTalent Agent</strong>')],
 ['Control Center no drawer',drawer.includes('http://127.0.0.1:8791/control')&&drawer.includes('Control Center')],
 ['Control Center abre nova aba segura',drawer.includes("'_blank'")&&drawer.includes('noopener,noreferrer')],
 ['V0.6 ou sucessora visível',drawer.includes('Production Agent V0.6')||drawer.includes('V0.7')||drawer.includes('Autonomous Workflows')],
 ['confirmação Builder preservada',drawer.includes("confirmLabel: 'Executar Builder'")],
 ['sem delete tools',!client.includes('crm.delete_')],
 ['doc explica mesma IA',notes.includes('mesma RealTalent Agent compartilhada com Blue Ocean')],
]
let ok=0;for(const [l,p] of checks){console.log(`${p?'OK  ':'FAIL'} ${l}`);if(p)ok++}
console.log(`\nCRM Agent V0.6: ${ok}/${checks.length} contratos aprovados.`);if(ok!==checks.length)process.exit(1)
