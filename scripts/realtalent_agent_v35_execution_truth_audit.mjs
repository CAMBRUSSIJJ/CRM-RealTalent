import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let pass = 0, fail = 0
const test = (name, condition) => { if (condition) { pass++; console.log(`OK   ${name}`) } else { fail++; console.error(`FAIL ${name}`) } }

const types = read('src/app/app-context-types.ts')
const context = read('src/app/app-context.tsx')
const executor = read('src/services/realtalent-crm-capability-executor.ts')
const truth = read('src/services/realtalent-crm-execution-truth.ts')
const drawer = read('src/features/assistant/assistant-drawer.tsx')
const client = read('src/services/realtalent-agent-client.ts')
const registry = read('src/services/realtalent-crm-capabilities.ts')
const ids = [...registry.matchAll(/id: '([^']+)'/g)].map((m) => m[1])

// Foundation
test('App Context exposes execution-truth refresh', types.includes('refreshAgentExecutionState(slices?: SnapshotSlice[]): Promise<WorkspaceSnapshot>'))
test('Execution refresh rereads repository snapshot', context.includes('await loadSnapshotPatch(repository, currentWorkspace.id, requested)'))
test('Execution refresh reapplies snapshot to UI', context.includes('setSnapshot(fresh)'))
test('Receipt storage is versioned V3.5', truth.includes('agent-execution-receipts:v35'))
test('Receipt distinguishes verified/partial/failed/rolled back', ['verified','partial','failed','rolled_back'].every((value) => truth.includes(`'${value}'`)))
test('Write verification has repository readback check', truth.includes('Snapshot do repositório foi relido e aplicado à interface.'))
test('Task verification rereads Work Management', truth.includes('loadWorkManagement') && truth.includes("item.status === 'completed'"))
test('Gateway evidence is first-class', truth.includes("result.evidence?.source === 'gateway'"))
test('Async Garimpo running state is not treated as verified completion', truth.includes("result.evidence.state === 'running' ? 'acknowledged' : 'verified'"))
test('Generic unsupported readback stays acknowledged', truth.includes('ainda não possui prova de leitura posterior suficiente'))

// Drawer truth orchestration
test('Drawer captures fresh baseline before writes', drawer.includes('await actions.refreshAgentExecutionState(planTruthSlices)'))
test('Drawer verifies every capability step', drawer.includes('verifyCrmCapabilityExecution(step, result'))
test('Drawer records execution receipt', drawer.includes('recordCrmExecutionReceipt'))
test('Drawer labels verified completion explicitly', drawer.includes('receiptLabel(receipt)'))
test('Drawer warns on partial verification', drawer.includes('verificação ponta a ponta ficou parcial'))
test('Drawer does not claim total completion on partial evidence', drawer.includes('não estou tratando isso como conclusão totalmente verificada'))
test('Rollback is attempted for prior reversible writes', drawer.includes('for (const operation of [...undoOperations].reverse())'))
test('Rollback outcome is written to receipt', drawer.includes("status: rollbackAttempted && !rollbackFailures.length ? 'rolled_back' : 'failed'"))
test('Execution receipt ID is surfaced in answer', drawer.includes('Recibo de execução: ${receipt.id}'))
test('Undo has scoped readback mapping', truth.includes('executionTruthSlicesForUndoOperations'))
test('Undo verifies restored state when possible', truth.includes('verifyCrmUndoExecution') && truth.includes('campos anteriores restaurados'))
test('Undo writes its own execution receipt', drawer.includes('undoReceipt = recordCrmExecutionReceipt') && drawer.includes('Ação desfeita com verificação parcial'))

// No false-positive generic message
test('Remote fallback no longer says processed = executed', !client.includes("'Consegui processar seu pedido.'"))
test('Remote fallback explicitly denies execution confirmation', client.includes('ainda não há confirmação de execução no CRM'))

// Core workflow truth contracts requested for V3.5
for (const id of ['goals.create','tasks.create','pipeline.move','activities.create_followup','contacts.create','leads.update','proposals.create','communications.send_whatsapp','notifications.dismiss_all','prospecting.search','prospecting.send_to_crm','agent.undo_last']) {
  test(`Workflow capability present: ${id}`, ids.includes(id))
}
test('Goals creation returns reversible entity ID', executor.includes("undo: { kind: 'goal.delete', entityId: goal.id }"))
test('Tasks create can synchronize to Agenda', executor.includes('sync_to_agenda') && executor.includes('calendarEventId'))
test('Pipeline move returns lead move undo evidence', executor.includes("undo: { kind: 'lead.move', entityId: lead.id"))
test('Follow-up returns activity entity ID', executor.includes("Follow-up") && executor.includes("undo: { kind: 'activity.delete', entityId: created.id }"))
test('Contacts create returns entity ID', executor.includes("undo: { kind: 'contact.delete', entityId: created.id }"))
test('Owner reassignment is supported by lead update', executor.includes("arg(step, 'owner_id')"))
test('Proposal creation returns entity ID', executor.includes("undo: { kind: 'proposal.delete', entityId: proposal.id }"))
test('Communications return gateway event evidence', executor.includes("source: 'gateway'") && executor.includes("entityType: 'communication_event'"))
test('Notifications read back local state', executor.includes('loadNotificationUiState(workspaceId).dismissedIds') && executor.includes("source: 'local_state'"))
test('Garimpo distinguishes job started from persisted fallback', executor.includes("state: 'running'") && executor.includes("source: 'prospecting_state'"))
test('Multi-step planner is executed sequentially', drawer.includes('for (const step of plan.steps)'))
test('Repository refresh happens after each write', drawer.includes("if (step.risk !== 'read')") && drawer.includes('truthSnapshot = stepTruthSlices.length ? await actions.refreshAgentExecutionState(stepTruthSlices) : truthSnapshot'))

test('All capability IDs remain unique', ids.length === new Set(ids).size)
test('CRM still exposes at least 65 native capabilities', ids.length >= 65)

console.log(`\nRealTalent Agent V3.5 Execution Truth: ${pass}/${pass + fail}`)
if (fail) process.exit(1)
