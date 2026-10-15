import fs from 'node:fs'
import path from 'node:path'
import { crmCapabilityPlannerInfo, crmCapabilityPlannerInstructions, normalizeCrmCapabilityPlan, crmCapabilityDecision } from './crm-capability-planner.mjs'

const runtimeDir = path.dirname(new URL(import.meta.url).pathname)
const root = path.dirname(runtimeDir)
const crm = path.join(root, 'RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher')
const read = (p) => fs.readFileSync(path.join(crm, p), 'utf8')
const runtimeRead = (p) => fs.readFileSync(path.join(runtimeDir, p), 'utf8')
let pass = 0, fail = 0
const test = (name, condition) => { if (condition) { pass++; console.log(`PASS ${name}`) } else { fail++; console.error(`FAIL ${name}`) } }

const catalog = [
  { id:'notifications.dismiss_all', title:'Limpar notificações', risk:'low' },
  { id:'crm.query', title:'Consultar', risk:'read' },
  { id:'communications.send_email', title:'Enviar e-mail', risk:'high' },
]
const normalized = normalizeCrmCapabilityPlan({ goal:'limpar avisos', confidence:.97, needsClarification:false, clarification:'', steps:[{ id:'1', capabilityId:'notifications.dismiss_all', title:'Limpar', reason:'pedido', risk:'read', args:[] }] }, catalog)
const unknown = normalizeCrmCapabilityPlan({ goal:'x', confidence:.99, needsClarification:false, clarification:'', steps:[{ id:'1', capabilityId:'danger.fake', title:'x', reason:'x', risk:'read', args:[] }] }, catalog)

test('planner version V3.2+', Number(crmCapabilityPlannerInfo.version) >= 3.2)
test('risk comes from trusted catalog', normalized.steps[0]?.risk === 'low')
test('unknown capability is rejected', unknown.steps.length === 0)
test('execute threshold', crmCapabilityDecision(normalized) === 'execute')
test('clarification threshold', crmCapabilityDecision({ confidence:.7, needsClarification:true, steps:[] }) === 'clarify')
test('semantic instruction avoids invented capabilities', /Nunca invente ids/.test(crmCapabilityPlannerInstructions))
test('undo language is explicitly understood', /agent\.undo_last/.test(crmCapabilityPlannerInstructions))
test('external sends forbid invented commercial promises', /promessa comercial/.test(crmCapabilityPlannerInstructions))

const gateway = runtimeRead('gateway.mjs')
test('gateway exposes capability status', gateway.includes("'/capabilities/status'"))
test('gateway exposes capability planner endpoint', gateway.includes("'/capabilities/plan'"))

const registry = read('src/services/realtalent-crm-capabilities.ts')
const ids = [...registry.matchAll(/id: '([^']+)'/g)].map((m) => m[1])
test('registry has broad CRM coverage', ids.length >= 58)
test('registry capability ids are unique', new Set(ids).size === ids.length)
for (const id of ['crm.query','notifications.dismiss_all','contacts.create','leads.create','pipeline.move','pipeline.create_stage','tasks.create','calendar.create','calls.log_outcome','communications.send_email','communications.send_whatsapp','proposals.create','goals.create','teams.invite','automations.run','revenue.create','agent.undo_last']) test(`registry includes ${id}`, ids.includes(id))

const executor = read('src/services/realtalent-crm-capability-executor.ts')
test('executor enforces capability permissions', executor.includes('ensurePermission(runtime, step)'))
test('executor enforces record scope', executor.includes('assertRecordAccess(runtime'))
test('executor protects sensitive fields', executor.includes('assertSensitiveCapabilityField'))
test('notifications mutate real notification state', executor.includes('dismissNotifications(workspaceId'))
test('universal CRM query is native', executor.includes("step.capabilityId === 'crm.query'"))
test('task plus agenda undo is coordinated', executor.includes('calendarEventId') && executor.includes("operation.kind === 'task.delete'"))
test('external messages use official communication services', executor.includes('sendOfficialEmail') && executor.includes('sendOfficialWhatsApp'))
test('proposal draft uses catalog pricing', executor.includes('createProposalLineFromProduct') && executor.includes('calculateProposalTotals'))

const provider = read('src/services/realtalent-assistant-provider.ts')
test('unknown sales clarification falls through to universal planner', provider.includes("semantic.interpretation.intent !== 'unknown'"))
test('capability planner runs before lexical fallback', provider.indexOf('planCrmCapabilities(prompt') < provider.indexOf('Compatibility fallback'))

const drawer = read('src/features/assistant/assistant-drawer.tsx')
test('drawer executes CRM capability plans', drawer.includes("plan.kind === 'crm_capabilities'"))
test('read plans auto execute without confirmation', drawer.includes("result.plan.steps.every((step) => step.risk === 'read')"))
test('high-risk plans use reinforced confirmation', drawer.includes("writeSteps.length && maxRisk === 'high'") && drawer.includes('Confirmar ação crítica'))
test('multi-step failure performs rollback', drawer.includes('As etapas anteriores foram revertidas'))
test('undo transaction is exposed to user', drawer.includes('Ação desfeita'))

const notificationEngine = read('src/services/notification-engine.ts')
test('notification engine filters dismissed alerts', notificationEngine.includes('dismissedNotificationIds'))
const plannerClient = read('src/services/realtalent-crm-capability-planner.ts')
test('offline resilience covers clear notifications', plannerClient.includes("notifications.dismiss_all") && plannerClient.includes('local-resilience'))
const assistant = read('src/services/realtalent-assistant.ts')
test('old unknown-command copy is gone', !assistant.includes('Não reconheci esse comando'))

console.log(`V3.2 SELFTEST ${pass}/${pass + fail} passed`)
if (fail) process.exit(1)
