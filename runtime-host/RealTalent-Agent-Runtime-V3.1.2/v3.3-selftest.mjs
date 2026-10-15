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
  { id:'goals.create', title:'Criar meta', risk:'medium' },
  { id:'prospecting.search', title:'Garimpar empresas', risk:'medium' },
  { id:'prospecting.send_to_crm', title:'Enviar ao CRM', risk:'high' },
]
const normalized = normalizeCrmCapabilityPlan({ goal:'meta de ligações', confidence:.98, needsClarification:false, clarification:'', steps:[{ id:'1', capabilityId:'goals.create', title:'Meta', reason:'pedido', risk:'read', args:[{name:'metric',value:'calls'},{name:'target_value',value:'40'}] }] }, catalog)

test('planner version 3.3 or successor', Number(crmCapabilityPlannerInfo.version) >= 3.3)
test('risk always comes from catalog', normalized.steps[0]?.risk === 'medium')
test('planner executes trusted goal plan', crmCapabilityDecision(normalized) === 'execute')
test('sales execution instructions normalize goal metrics', /normalize a métrica/.test(crmCapabilityPlannerInstructions) && /goals\.create/.test(crmCapabilityPlannerInstructions))
test('prospecting search has semantic planning rules', /prospecting\.search/.test(crmCapabilityPlannerInstructions) && /use_icp=true/.test(crmCapabilityPlannerInstructions))
test('prospecting multi-step approval to CRM is explicit', /prospecting\.approve_top \+ prospecting\.send_to_crm/.test(crmCapabilityPlannerInstructions))

const registry = read('src/services/realtalent-crm-capabilities.ts')
const ids = [...registry.matchAll(/id: '([^']+)'/g)].map((m) => m[1])
test('capability registry expanded beyond V3.2', ids.length >= 65)
for (const id of ['goals.create','prospecting.search','prospecting.build_icp','prospecting.rank','prospecting.analyze','prospecting.approve_top','prospecting.discard_low','prospecting.send_to_crm']) test(`registry includes ${id}`, ids.includes(id))

test('capability ids remain unique', new Set(ids).size === ids.length)

const plannerClient = read('src/services/realtalent-crm-capability-planner.ts')
test('offline sales fast path understands goal creation', plannerClient.includes("return make('goals.create'") && plannerClient.includes("scope', value: 'user'"))
test('offline goal parser understands tomorrow', plannerClient.includes("/\\bamanha\\b/") && plannerClient.includes("period_start"))
test('offline prospecting fast path can start search', plannerClient.includes("return make('prospecting.search'") && plannerClient.includes("category_mode"))
test('semantic planner remains universal path', plannerClient.includes('/capabilities/plan'))

const executor = read('src/services/realtalent-crm-capability-executor.ts')
test('goal creation writes through native AppActions', executor.includes('await actions.createGoal') && executor.includes("runtime.navigate('goals')"))
test('goal creation defaults to current seller scope', executor.includes("arg(step, 'scope') || 'user'") && executor.includes('runtime.currentUserId'))
test('prospecting search uses Linux agent when available', executor.includes('createProspectingAgentJob') && executor.includes('getProspectingAgentHealth'))
test('prospecting search has provider fallback', executor.includes('runProspectingSearchAutomation'))
test('prospecting ranking uses CRM-grounded intelligence', executor.includes('rankProspects(state.prospects, snapshot)'))
test('prospecting approval respects data quality', executor.includes("prospectDataQuality(item.prospect).readiness !== 'blocked'"))
test('prospecting CRM conversion creates canonical company', executor.includes('await actions.createCompany') && executor.includes('await actions.createLead'))
test('prospecting can assign owner and first activity', executor.includes('owner_query') && executor.includes('await actions.createActivity'))
test('prospecting send requires contacts and pipeline permissions', executor.includes("canTeamAccess('create', 'contacts')") && executor.includes("canTeamAccess('create', 'pipeline')"))

const intel = read('src/services/prospecting-intelligence.ts')
test('ICP learns from won customers first', intel.includes("lead.status === 'won'") && intel.includes("source: won.length ? 'won_customers'"))
test('prospect score is explainable by dimensions', ['fit','potential','contactability','timing','dataQuality'].every((field) => intel.includes(field)))
test('prospect score exposes reasons and opportunity signals', intel.includes('reasons') && intel.includes('opportunitySignals'))

const page = read('src/features/prospecting/prospecting-page.tsx')
test('Garimpo displays Prospecting Intelligence panel', page.includes('ProspectingIntelligencePanel') && page.includes('Prospecting Intelligence'))
test('Garimpo can prefill search from learned ICP', page.includes('onUseIcp') && page.includes('setSegment') && page.includes('changeProspectingCity'))
test('Garimpo explains natural Agent examples', page.includes('Encontre 30 empresas parecidas com meus melhores clientes'))

const provider = read('src/services/realtalent-assistant-provider.ts')
test('provider identifies V3.3 or successor', /hybrid-realtalent-agent-v3\.[3-9]/.test(provider))
const gateway = runtimeRead('gateway.mjs')
test('gateway reports capability version 3.3 or successor', /version:'3\.[3-9]'/.test(gateway))

console.log(`V3.3 SELFTEST ${pass}/${pass + fail} passed`)
if (fail) process.exit(1)
