import fs from 'node:fs'
const text=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const client=text('src/services/realtalent-agent-client.ts')
const drawer=text('src/features/assistant/assistant-drawer.tsx')
const assistant=text('src/services/realtalent-assistant.ts')
const notes=text('REALTALENT_AGENT_V0.9.md')
const checks=[
 ['system.run_program tipado',client.includes("tool: 'system.run_program'")&&assistant.includes("kind: 'run_program'")],
 ['modo PROGRAM aceito',client.includes("'PROGRAM'")],
 ['start Program usa contexto compacto',client.includes('startCrmProgram')&&client.includes('compactContext(snapshot, context)')],
 ['advance Program identifica CRM',client.includes("product: 'crm'")&&client.includes('/programs/${encodeURIComponent(current.id)}/advance')],
 ['Program reattach implementado',client.includes('getActiveCrmProgram')&&drawer.includes('getActiveCrmProgram')],
 ['Program precede Mission no reattach',drawer.indexOf('void getActiveCrmProgram') < drawer.indexOf('void getActiveCrmMission')],
 ['handoff Blue Ocean exposto',drawer.includes("program.requestedProduct === 'blue_ocean'")],
 ['progresso do Program exposto',drawer.includes('program.progress.completed')&&drawer.includes('program.progress.percent')],
 ['marcos do Program expostos',drawer.includes('program.stages.map')],
 ['prioridade dos marcos exposta',drawer.includes('stage.priority')],
 ['gate de aceite humano visível',drawer.includes('awaiting_acceptance')&&drawer.includes('Control Center')],
 ['confirmação inicial do Program',drawer.includes("confirmLabel: 'Iniciar programa'")],
 ['Mission V0.8 preservada',client.includes('startCrmMission')&&drawer.includes("plan.kind === 'run_mission'")],
 ['Workflow V0.7 preservado',client.includes('startCrmWorkflow')&&drawer.includes("plan.kind === 'run_workflow'")],
 ['checkpoint ACT preservado',drawer.includes('planFromAction(workflow.pendingAction, snapshot)')],
 ['checkpoint Builder preservado',drawer.includes("workflow.pendingAction.tool === 'system.run_builder'")],
 ['Builder preservado',drawer.includes('runUnifiedBuilder')],
 ['QA preservado',drawer.includes('runUnifiedBrowserQa')],
 ['sem delete CRM',!client.includes('crm.delete_')],
 ['snapshot não persistido documentado',notes.includes('snapshots do CRM não são persistidos')||notes.includes('Snapshots do CRM não são persistidos')],
 ['Program não aceita marco silenciosamente no app',!client.includes('/accept')&&!client.includes('/reject')],
 ['Control Center preservado',drawer.includes('127.0.0.1:8791/control')],
 ['branding V0.9',drawer.includes('V0.9')&&drawer.includes('Autonomous Programs')],
 ['uma única IA preservada',drawer.includes('uma única conversa')||drawer.includes('Unified Agent Core')||drawer.includes('mesma IA')],
]
let ok=0;for(const [l,p] of checks){console.log(`${p?'OK  ':'FAIL'} ${l}`);if(p)ok++}
console.log(`\nCRM Agent V0.9 Programs: ${ok}/${checks.length} contratos aprovados.`);if(ok!==checks.length)process.exit(1)
