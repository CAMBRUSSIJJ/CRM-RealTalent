import fs from 'node:fs'
import path from 'node:path'
import { crmCapabilityPlannerInfo, crmCapabilityPlannerInstructions, crmCapabilityPlannerSchema, normalizeCrmCapabilityPlan, crmCapabilityDecision } from './crm-capability-planner.mjs'

const runtimeDir = path.dirname(new URL(import.meta.url).pathname)
const root = path.dirname(runtimeDir)
const crm = path.join(root, 'RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher')
const read = (p) => fs.readFileSync(path.join(crm, p), 'utf8')
const runtimeRead = (p) => fs.readFileSync(path.join(runtimeDir, p), 'utf8')
let pass = 0, fail = 0
const test = (name, condition) => { if (condition) { pass++; console.log(`PASS ${name}`) } else { fail++; console.error(`FAIL ${name}`) } }

const catalog = [
  { id:'goals.create', title:'Criar meta', risk:'medium', requiredSlots:[{key:'metric',accepts:['metric']},{key:'target_value',accepts:['target_value']},{key:'period',accepts:['period_start','period_end']}] },
  { id:'communications.send_email', title:'Enviar e-mail', risk:'high', requiredSlots:[{key:'record',accepts:['lead_id','lead_query']},{key:'subject',accepts:['subject']},{key:'body',accepts:['body']}] },
]
const clarify = normalizeCrmCapabilityPlan({ version:'3.4', goal:'criar meta de 40 amanhã', confidence:.96, needsClarification:true, clarification:'Qual tipo de meta?', pendingCapabilityId:'goals.create', missingSlots:['metric'], knownArgs:[{name:'target_value',value:'40'},{name:'period_start',value:'2026-10-15'},{name:'period_end',value:'2026-10-15'}], steps:[{id:'1',capabilityId:'goals.create',title:'Criar meta',reason:'métrica ausente',risk:'read',args:[{name:'target_value',value:'40'}]}] }, catalog)

test('planner version 3.4', crmCapabilityPlannerInfo.version === '3.4')
test('architecture includes conversational slot filling', crmCapabilityPlannerInfo.architecture.includes('conversational-slot-filling'))
test('schema requires pending capability id', crmCapabilityPlannerSchema.required.includes('pendingCapabilityId'))
test('schema requires missing slots', crmCapabilityPlannerSchema.required.includes('missingSlots'))
test('schema requires known args', crmCapabilityPlannerSchema.required.includes('knownArgs'))
test('clarification decision survives normalization', crmCapabilityDecision(clarify) === 'clarify')
test('pending capability is preserved', clarify.pendingCapabilityId === 'goals.create')
test('missing metric is preserved', clarify.missingSlots.includes('metric'))
test('known target is preserved', clarify.knownArgs.some((item) => item.name === 'target_value' && item.value === '40'))
test('planner instructs universal slot filling', /SLOT FILLING UNIVERSAL/.test(crmCapabilityPlannerInstructions))
test('planner preserves partial intent', /NÃO descarte a intenção/.test(crmCapabilityPlannerInstructions))
test('planner accepts short slot answers', /“ligações”.*“amanhã”.*“Marcelo”/s.test(crmCapabilityPlannerInstructions))
test('planner uses pending capability context', /context\.pending_capability/.test(crmCapabilityPlannerInstructions))
test('goal ambiguity example exists', /crie 40 metas amanhã/.test(crmCapabilityPlannerInstructions))
test('all CRM areas are named in universal policy', ['contatos','empresas','pipeline','tarefas','agenda','ligações','comunicações','propostas','catálogo','metas','automações','equipes','receita','Garimpo'].every((term) => crmCapabilityPlannerInstructions.includes(term)))

const slotFile = read('src/services/realtalent-crm-slot-filling.ts')
const registry = read('src/services/realtalent-crm-capabilities.ts')
const ids = [...registry.matchAll(/id: '([^']+)'/g)].map((m) => m[1])
const ruleIds = [...slotFile.matchAll(/^\s*'([^']+)': \[/gm)].map((m) => m[1])
test('65 native capabilities remain registered', ids.length >= 65)
test('slot rules cover every registered capability', ids.every((id) => ruleIds.includes(id)))
test('slot rule ids do not invent capabilities', ruleIds.every((id) => ids.includes(id)))
test('goal slots include metric target and period', /'goals\.create': \[slot\('metric'.*slot\('target_value'.*slot\('period'/s.test(slotFile))
test('email slots require target subject and body', /'communications\.send_email': \[target\(.*slot\('subject'.*slot\('body'/s.test(slotFile))
test('pipeline move requires opportunity and stage', /'pipeline\.move': \[target\(.*slot\('stage'/s.test(slotFile))
test('updates require actual changes', slotFile.includes("const changes =") && slotFile.includes("key: 'changes'"))
test('route context can satisfy focused lead target', slotFile.includes('targetCanUseRouteContext') && slotFile.includes('focusLeadId'))
test('route context injects lead id before execution', slotFile.includes("{ name: 'lead_id', value: context.focusLeadId }"))
test('clarification suggestions expose natural choices', slotFile.includes('crmClarificationSuggestions'))
test('pending state stores original seed', slotFile.includes('seed: seed.trim()'))
test('continuation preserves original request', slotFile.includes('Continue a mesma ação'))
test('ambiguous capability clarification is preserved generically', slotFile.includes("'__pending_intent__'") && slotFile.includes('genericPendingIntent'))

const plannerClient = read('src/services/realtalent-crm-capability-planner.ts')
test('client sends required slot schemas to model', plannerClient.includes('requiredSlots: crmCapabilitySlotRulesForModel'))
test('client sends pending capability to runtime', plannerClient.includes('pending_capability: context.pendingCapability'))
test('offline goal parser accepts plural metas', plannerClient.includes('metas?'))
test('offline incomplete goal clarifies metric', plannerClient.includes("clarify('goals.create'") && plannerClient.includes("['metric']"))

const provider = read('src/services/realtalent-assistant-provider.ts')
test('provider validates slots after model planning', provider.includes('validateAndEnrichCapabilitySlots'))
test('provider exposes pending capability in clarification answer', provider.includes('pendingCapabilityFromPlan'))
test('semantic clarification also preserves pending intent', provider.includes('genericPendingIntent') && provider.includes('Pedido em andamento'))
test('provider uses V3.4 identity', provider.includes('hybrid-realtalent-agent-v3.4'))

const drawer = read('src/features/assistant/assistant-drawer.tsx')
test('drawer persists pending capability', drawer.includes('pendingCapability') && drawer.includes('sessionStorage.setItem'))
test('drawer builds continuation from short reply', drawer.includes('continuationPrompt(pendingCapability, userPrompt)'))
test('drawer can cancel pending action', drawer.includes('Ação pendente cancelada'))
test('drawer forwards pending context', drawer.includes('pendingCapability,'))
test('drawer clears pending after completion', drawer.includes('setPendingCapability(null)'))

const gateway = runtimeRead('gateway.mjs')
test('gateway forwards pending capability to model', gateway.includes('pending_capability:context?.pending_capability'))
test('gateway reports capability planner V3.4', gateway.includes("version:'3.4'"))

console.log(`V3.4 SELFTEST ${pass}/${pass + fail} passed`)
if (fail) process.exit(1)
