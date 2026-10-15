import fs from 'node:fs'
const text=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const client=text('src/services/realtalent-agent-client.ts')
const drawer=text('src/features/assistant/assistant-drawer.tsx')
const assistant=text('src/services/realtalent-assistant.ts')
const notes=text('REALTALENT_AGENT_V0.8.md')
const checks=[
 ['system.run_mission tipado',client.includes("tool: 'system.run_mission'")&&assistant.includes("kind: 'run_mission'")],
 ['modo MISSION aceito',client.includes("'MISSION'")],
 ['start mission usa contexto compacto',client.includes('startCrmMission')&&client.includes('compactContext(snapshot, context)')],
 ['advance mission envia produto CRM',client.includes("product: 'crm'")&&client.includes('/missions/${encodeURIComponent(current.id)}/advance')],
 ['mission reattach implementado',client.includes('getActiveCrmMission')&&drawer.includes('getActiveCrmMission')],
 ['mission tem handoff Blue Ocean',drawer.includes("mission.requestedProduct === 'blue_ocean'")],
 ['mission mostra progresso',drawer.includes('mission.progress.completed')&&drawer.includes('mission.progress.percent')],
 ['mission mostra blocos',drawer.includes('mission.legs.map')],
 ['workflow filho preservado',drawer.includes('currentWorkflow')&&drawer.includes('setWorkflow')],
 ['checkpoint ACT preservado',drawer.includes('planFromAction(workflow.pendingAction, snapshot)')&&drawer.includes('executePlan(plan)')],
 ['checkpoint Builder preservado',drawer.includes("workflow.pendingAction.tool === 'system.run_builder'")&&drawer.includes('approveCrmWorkflowStep')],
 ['missão exige confirmação inicial',drawer.includes("confirmLabel: 'Iniciar missão'")],
 ['workflow V0.7 preservado',client.includes('startCrmWorkflow')&&drawer.includes("plan.kind === 'run_workflow'")],
 ['Builder preservado',drawer.includes('runUnifiedBuilder')],
 ['QA preservado',drawer.includes('runUnifiedBrowserQa')],
 ['sem delete CRM',!client.includes('crm.delete_')],
 ['documenta snapshot não persistido',notes.includes('Snapshots do CRM não são persistidos')],
 ['branding V0.8',drawer.includes('Missions & Recovery V0.8')],
 ['Control Center preservado',drawer.includes('127.0.0.1:8791/control')],
 ['uma única IA declarada',drawer.includes('uma única conversa')||drawer.includes('Unified Agent Core')],
]
let ok=0;for(const [l,p] of checks){console.log(`${p?'OK  ':'FAIL'} ${l}`);if(p)ok++}
console.log(`\nCRM Agent V0.8 Missions: ${ok}/${checks.length} contratos aprovados.`);if(ok!==checks.length)process.exit(1)
