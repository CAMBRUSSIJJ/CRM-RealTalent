import fs from 'node:fs'
const text=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
const client=text('src/services/realtalent-agent-client.ts')
const drawer=text('src/features/assistant/assistant-drawer.tsx')
const assistant=text('src/services/realtalent-assistant.ts')
const notes=text('REALTALENT_AGENT_V1.0.md')
const checks=[
 ['modo GOVERNANCE aceito',client.includes("'GOVERNANCE'" )],
 ['Program V0.9 preservado',client.includes('startCrmProgram')&&drawer.includes('getActiveCrmProgram')],
 ['Mission preservada',client.includes('startCrmMission')&&drawer.includes('getActiveCrmMission')],
 ['Workflow preservado',client.includes('startCrmWorkflow')&&drawer.includes('getActiveCrmWorkflow')],
 ['Builder preservado',drawer.includes('runUnifiedBuilder')],
 ['Browser QA preservado',drawer.includes('runUnifiedBrowserQa')],
 ['Production Governance visível',drawer.includes('Production Governance V1.0')||drawer.includes('V1.0 governado')],
 ['botão Governança abre Control Center',drawer.includes('> Governança</button>')&&drawer.includes('127.0.0.1:8791/control')],
 ['modo GOVERNANCE na trust strip',drawer.includes('PROGRAM · GOVERNANCE')],
 ['marcos ainda exigem aceite no Control Center',drawer.includes('awaiting_acceptance')&&drawer.includes('Control Center')],
 ['app não aceita/rejeita marco silenciosamente',!client.includes('/accept')&&!client.includes('/reject')],
 ['checkpoint ACT preservado',drawer.includes('planFromAction(workflow.pendingAction, snapshot)')],
 ['checkpoint Builder preservado',drawer.includes("workflow.pendingAction.tool === 'system.run_builder'")],
 ['handoff Blue Ocean preservado',drawer.includes("program.requestedProduct === 'blue_ocean'")],
 ['contexto compacto no Program',client.includes('compactContext(snapshot, context)')],
 ['sem delete CRM',!client.includes('crm.delete_')],
 ['doc perfis governance',notes.includes('operator, manager e admin')],
 ['doc audit SHA-256',notes.includes('SHA-256')],
 ['doc orçamento 24h',notes.includes('24h')],
 ['doc fila persistente',notes.includes('fila persistente')],
 ['doc objetivos permanentes',notes.includes('objetivos permanentes')],
 ['doc snapshot CRM não persistido',notes.includes('Snapshots do CRM não são persistidos')],
 ['doc rollback não promete dados CRM',notes.includes('NÃO reverte dados de negócio')],
 ['doc Builder rollback próprio',notes.includes('rollback transacional próprio')],
 ['mesma IA preservada',drawer.includes('uma única conversa')||drawer.includes('Unified Agent Core')||drawer.includes('mesma IA')],
 ['compatibilidade V0.9 registrada',drawer.includes('V0.9 Autonomous Programs compatibility marker')],
 ['system.run_program tipado',client.includes("tool: 'system.run_program'")&&assistant.includes("kind: 'run_program'")],
 ['branding footer V1.0',drawer.includes('Production Governance V1.0 · Programs · Control Center')],
]
let ok=0;for(const [l,p] of checks){console.log(`${p?'OK  ':'FAIL'} ${l}`);if(p)ok++}
console.log(`\nCRM Agent V1.0 Production Governance: ${ok}/${checks.length} contratos aprovados.`);if(ok!==checks.length)process.exit(1)
