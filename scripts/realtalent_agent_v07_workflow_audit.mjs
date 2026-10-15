import fs from 'node:fs'
const text=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const client=text('src/services/realtalent-agent-client.ts')
const drawer=text('src/features/assistant/assistant-drawer.tsx')
const assistant=text('src/services/realtalent-assistant.ts')
const css=text('src/styles/realtalent-assistant-v10067.css')
const notes=text('REALTALENT_AGENT_V0.7.md')
const checks=[
 ['6 tools CRM preservadas',['crm.create_followup','crm.move_opportunity','crm.create_task','crm.update_lead_profile','crm.create_goal','crm.create_proposal'].every(t=>client.includes(t))],
 ['system.run_workflow tipado',client.includes("tool: 'system.run_workflow'")&&assistant.includes("kind: 'run_workflow'")],
 ['modo WORKFLOW aceito',client.includes("'WORKFLOW'")],
 ['workflow start usa contexto compacto',client.includes('startCrmWorkflow')&&client.includes('compactContext(snapshot, context)')],
 ['advance envia contexto atual',client.includes('/advance')&&client.includes('allowed_tools: CRM_ALLOWED_TOOLS')],
 ['reattach workflow ativo',client.includes('getActiveCrmWorkflow')&&drawer.includes('getActiveCrmWorkflow')],
 ['checkpoint business usa planFromAction',drawer.includes('planFromAction(workflow.pendingAction, snapshot)')],
 ['checkpoint executa ação local revalidada',drawer.includes('const success = await executePlan(plan)')&&drawer.includes('completeCrmWorkflowStep')],
 ['Builder de workflow aprovado separadamente',drawer.includes("workflow.pendingAction.tool === 'system.run_builder'")&&drawer.includes('approveCrmWorkflowStep')],
 ['workflow retomável',client.includes('resumeCrmWorkflow')&&drawer.includes('handleResumeWorkflow')],
 ['workflow cancelável',client.includes('cancelCrmWorkflow')&&drawer.includes('handleCancelWorkflow')],
 ['UI mostra progresso',drawer.includes('workflow.progress.completed')&&drawer.includes('workflow.progress.percent')],
 ['UI mostra todas etapas',drawer.includes('workflow.steps.map')&&css.includes('.assistant-workflow__step')],
 ['workflow cross-product bloqueado no CRM',drawer.includes("plan.product !== 'crm'")],
 ['escrita ainda confirmada',drawer.includes('confirmAction')&&drawer.includes("confirmLabel: 'Iniciar workflow'")],
 ['Builder tradicional preservado',drawer.includes('runUnifiedBuilder')&&drawer.includes("plan.kind === 'run_builder'")],
 ['QA tradicional preservado',drawer.includes('runUnifiedBrowserQa')&&drawer.includes("plan.kind === 'run_qa'")],
 ['sem delete tools',!client.includes('crm.delete_')],
 ['doc declara snapshot não persistido',notes.includes('snapshots do CRM não são persistidos')],
 ['branding único',drawer.includes('<strong>RealTalent Agent</strong>')],
]
let ok=0;for(const [l,p] of checks){console.log(`${p?'OK  ':'FAIL'} ${l}`);if(p)ok++}
console.log(`\nCRM Agent V0.7: ${ok}/${checks.length} contratos aprovados.`);if(ok!==checks.length)process.exit(1)
