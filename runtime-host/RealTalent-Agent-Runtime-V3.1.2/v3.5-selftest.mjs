import fs from 'node:fs'
import path from 'node:path'

const runtimeDir = path.dirname(new URL(import.meta.url).pathname)
const root = path.dirname(runtimeDir)
const crm = fs.readdirSync(root).find((name) => name.startsWith('RealTalent-CRM-'))
if (!crm) throw new Error('CRM source not found')
const read = (p) => fs.readFileSync(path.join(root, crm, p), 'utf8')
let pass = 0, fail = 0
const test = (name, condition) => { if (condition) { pass++; console.log(`PASS ${name}`) } else { fail++; console.error(`FAIL ${name}`) } }

const truth = read('src/services/realtalent-crm-execution-truth.ts')
const drawer = read('src/features/assistant/assistant-drawer.tsx')
const context = read('src/app/app-context.tsx')
const executor = read('src/services/realtalent-crm-capability-executor.ts')
const client = read('src/services/realtalent-agent-client.ts')
const pkg = JSON.parse(fs.readFileSync(path.join(root, crm, 'package.json'), 'utf8'))

test('execution truth service exists', truth.includes('CrmExecutionReceipt'))
test('receipt storage uses v35 namespace', truth.includes('agent-execution-receipts:v35'))
test('verified and partial are distinct', truth.includes("'verified'") && truth.includes("'partial'"))
test('snapshot slices are reread from repository', context.includes('loadSnapshotPatch(repository, currentWorkspace.id, requested)'))
test('fresh snapshot is applied to UI', context.includes('setSnapshot(fresh)'))
test('drawer verifies each step', drawer.includes('verifyCrmCapabilityExecution(step, result'))
test('drawer exposes receipt id', drawer.includes('Recibo de execução: ${receipt.id}'))
test('drawer refuses full verified wording on partial readback', drawer.includes('não estou tratando isso como conclusão totalmente verificada'))
test('rollback receipt exists', drawer.includes("'rolled_back'"))
test('tasks are reread after write', truth.includes('loadWorkManagement'))
test('communications use gateway evidence', executor.includes("source: 'gateway'"))
test('notifications use local state evidence', executor.includes("source: 'local_state'"))
test('prospecting async job stays running', executor.includes("state: 'running'"))
test('generic processed fallback removed', !client.includes('Consegui processar seu pedido.'))
test('V3.5 audit script is registered', Boolean(pkg.scripts?.['qa:agent:v3.5']))

console.log(`V3.5 SELFTEST ${pass}/${pass + fail} passed`)
if (fail) process.exit(1)
