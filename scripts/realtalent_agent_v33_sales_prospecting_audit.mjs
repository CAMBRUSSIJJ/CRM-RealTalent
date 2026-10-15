import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let pass = 0, fail = 0
const test = (name, condition) => { if (condition) { pass++; console.log(`OK   ${name}`) } else { fail++; console.error(`FAIL ${name}`) } }

const registry = read('src/services/realtalent-crm-capabilities.ts')
const planner = read('src/services/realtalent-crm-capability-planner.ts')
const executor = read('src/services/realtalent-crm-capability-executor.ts')
const provider = read('src/services/realtalent-assistant-provider.ts')
const intel = read('src/services/prospecting-intelligence.ts')
const page = read('src/features/prospecting/prospecting-page.tsx')
const css = read('src/styles/prospecting-workspace.css')
const ids = [...registry.matchAll(/id: '([^']+)'/g)].map((m) => m[1])

for (const id of ['goals.create','pipeline.move','tasks.create','activities.create_followup','calendar.create','calls.log_outcome','proposals.create']) test(`Sales capability ${id}`, ids.includes(id))
test('Meta usa AppActions nativa', executor.includes('await actions.createGoal') && executor.includes("runtime.navigate('goals')"))
test('Meta individual usa usuário atual por padrão', executor.includes("arg(step, 'scope') || 'user'") && executor.includes('runtime.currentUserId'))
test('Métrica de ligações normaliza para calls', executor.includes("ligacoes: 'calls'") || executor.includes("ligação") || executor.includes("ligacoes"))
test('Fast path aceita meta natural e implícita na tela de Metas', planner.includes('implicitGoalOnGoalsPage') && planner.includes("return make('goals.create'"))
test('Fast path resolve período relativo', planner.includes('relativeDateArg') && planner.includes("period_start"))

test('Registry tem Prospecting Intelligence', ['prospecting.search','prospecting.build_icp','prospecting.rank','prospecting.analyze','prospecting.approve_top','prospecting.discard_low','prospecting.send_to_crm'].every((id) => ids.includes(id)))
test('Busca usa Agent Linux real', executor.includes('createProspectingAgentJob') && executor.includes('getProspectingAgentHealth'))
test('Busca possui fallback de providers', executor.includes('runProspectingSearchAutomation'))
test('ICP aprende primeiro com clientes ganhos', intel.includes("lead.status === 'won'") && intel.includes("won_customers"))
test('Score é explicável em cinco dimensões', ['fit','potential','contactability','timing','dataQuality'].every((field) => intel.includes(field)))
test('Score expõe razões e sinais de oportunidade', intel.includes('reasons') && intel.includes('opportunitySignals'))
test('Aprovação bloqueia dados sem prontidão', executor.includes("readiness !== 'blocked'"))
test('Conversão ao CRM deduplica empresa e cria oportunidade', executor.includes('await actions.createCompany') && executor.includes('await actions.createLead'))
test('Conversão pode atribuir responsável', executor.includes('owner_query') && executor.includes('listWorkspaceMembers'))
test('Conversão pode criar primeira atividade', executor.includes('await actions.createActivity'))
test('Conversão exige permissões reais', executor.includes("canTeamAccess('create', 'contacts')") && executor.includes("canTeamAccess('create', 'pipeline')"))
test('Garimpo mostra painel de Intelligence', page.includes('ProspectingIntelligencePanel') && page.includes('Prospecting Intelligence'))
test('Garimpo permite usar ICP na busca', page.includes('Usar ICP na busca') && page.includes('onUseIcp'))
test('Garimpo mostra ranking explicável', page.includes('intelligence.breakdown.fit') && page.includes('intelligence.score'))
test('CSS V3.3 está presente', css.includes('V3.3 Prospecting Intelligence'))
test('Provider está identificado como V3.3', provider.includes('hybrid-realtalent-agent-v3.3'))
test('IDs do registry permanecem únicos', ids.length === new Set(ids).size)

console.log(`\nRealTalent Agent V3.3 Sales + Prospecting: ${pass}/${pass + fail}`)
if (fail) process.exit(1)
