import type { CrmCapabilityArgument, CrmCapabilityPlan, CrmCapabilityPlanStep, CrmCapabilityPlanningContext, CrmCapabilityPlanningResult } from './realtalent-crm-capability-planner'
import { universalCrmCapabilityById } from './realtalent-crm-universal-registry'
import {
  crmCapabilitySlotRulesForModel as baseRulesForModel,
  validateAndEnrichCapabilitySlots as baseValidate,
  genericPendingIntent,
  pendingCapabilityContext,
  continuationPrompt,
  type CrmPendingCapability,
} from './realtalent-crm-slot-filling'

export { genericPendingIntent, pendingCapabilityContext, continuationPrompt }
export type { CrmPendingCapability }

type UniversalSlotRule = { key: string; accepts: string[]; question: string; choices?: string[]; anyOf?: string[] }
const slot = (key: string, question: string, accepts: string[] = [key], choices?: string[]): UniversalSlotRule => ({ key, accepts, question, choices })
const target = (question: string, accepts = ['record_id','record_query']): UniversalSlotRule => slot('record', question, accepts)
const changes = (accepts: string[], question = 'O que você quer alterar?'): UniversalSlotRule => ({ key: 'changes', accepts, anyOf: accepts, question })

const EXTRA_RULES: Record<string, UniversalSlotRule[]> = {
  'contacts.relationship_create': [slot('from_contact', 'Qual é o primeiro contato da relação?', ['from_contact_query']), slot('to_contact', 'Qual é o segundo contato da relação?', ['to_contact_query']), slot('relationship_type', 'Qual é o tipo de relação entre esses contatos?', ['relationship_type'])],
  'contacts.relationship_update': [target('Qual relação entre contatos você quer alterar?'), changes(['relationship_type','strength','notes'])],
  'contacts.relationship_delete': [target('Qual relação entre contatos você quer excluir?')],
  'leads.bulk_move': [slot('records', 'Quais leads/oportunidades você quer mover?', ['record_queries']), slot('stage', 'Para qual etapa do pipeline?', ['stage_query'])],
  'leads.merge': [slot('primary', 'Qual é o lead principal que deve permanecer?', ['primary_query']), slot('duplicate', 'Qual é o lead duplicado que deve ser mesclado?', ['duplicate_query'])],
  'leads.bulk_update': [slot('records', 'Quais leads você quer atualizar?', ['record_queries']), changes(['priority','temperature','owner_id','owner_name','next_action_at','status','notes'])],
  'leads.reclassify': [slot('records', 'Quais leads você quer reclassificar?', ['record_queries']), changes(['priority','temperature'], 'Qual prioridade ou temperatura deve ser aplicada?')],
  'leads.bulk_tag': [slot('records', 'Quais leads devem receber a tag?', ['record_queries']), slot('tag', 'Qual tag deve ser adicionada?', ['tag'])],
  'leads.bulk_delete': [slot('records', 'Quais leads você quer excluir?', ['record_queries'])],
  'activities.update': [target('Qual atividade/follow-up você quer alterar?'), changes(['title','description','due_at','assigned_to','resolution_status','resolution_reason'])],
  'activities.register_outcome': [target('Qual atividade/follow-up recebeu um resultado?'), slot('outcome', 'Qual foi o resultado comercial?', ['outcome'])],
  'cadences.create': [slot('records', 'Quais leads devem entrar na cadência?', ['record_queries'])],
  'cadences.update_state': [slot('cadence_id', 'Qual é a cadência?', ['cadence_id']), slot('action', 'Você quer pausar, retomar ou encerrar a cadência?', ['action'], ['pause','resume','stop'])],
  'calls.register_outcome': [target('Para qual lead/contato foi a ligação?', ['record_query','lead_query','contact_query']), slot('outcome', 'Qual foi o resultado da ligação?', ['outcome'])],
  'calls.delete': [target('Qual registro de ligação você quer excluir?')],
  'calls.recording_url': [target('Qual ligação possui a gravação que você quer abrir?')],
  'proposals.update': [target('Qual proposta você quer alterar?'), changes(['title','probability','valid_until','expected_close_at','contract_start_at','contract_end_at','contract_term_months','auto_renew','notes','terms'])],
  'proposals.create_revision': [target('Qual proposta deve receber uma nova revisão?')],
  'catalog.reconcile_proposal_items': [slot('legacy_name', 'Qual é o nome legado do item?', ['legacy_name']), slot('product', 'Qual produto real do catálogo substitui esse item?', ['product_query'])],
  'buyer_rooms.create': [slot('proposal', 'Para qual proposta você quer criar a Buyer Room?', ['proposal_query','record_query'])],
  'buyer_rooms.update': [target('Qual Buyer Room você quer alterar?'), changes(['title','welcome_message','status','share_enabled','expires_at'])],
  'buyer_rooms.rotate_token': [target('Qual Buyer Room deve receber um novo link?')],
  'buyer_rooms.delete': [target('Qual Buyer Room você quer excluir?')],
  'automations.create': [slot('name', 'Qual é o nome da automação?', ['name']), slot('trigger', 'Qual evento deve disparar a automação?', ['trigger_type'])],
  'automations.update': [target('Qual automação você quer alterar?'), changes(['name','trigger_type','enabled','conditions_json','actions_json'])],
  'automations.simulate': [target('Qual automação você quer simular?'), slot('lead', 'Para qual lead você quer simular?', ['lead_query'])],
  'automations.run_checks': [],
  'automations.undo_run': [slot('run', 'Qual execução de automação deve ser desfeita?', ['run_query'])],
  'teams.create_member': [slot('display_name', 'Qual é o nome do novo membro?', ['display_name']), slot('role', 'Qual papel esse membro terá?', ['role'], ['admin','member','viewer'])],
  'teams.revoke_invite': [slot('invite', 'Qual convite você quer revogar?', ['invite_query'])],
  'workspace.create': [slot('name', 'Qual será o nome do novo workspace?', ['name'])],
  'workspace.select': [slot('workspace_id', 'Qual workspace você quer selecionar?', ['workspace_id'])],
  'workspace.members': [],
  'workspace.invites': [],
  'workspace.audit_logs': [],
  'workspace.sync_structure': [],
  'workspace.clear_operational_data': [],
}

const hasArg = (step: CrmCapabilityPlanStep, names: string[]) => names.some((name) => step.args.some((item) => item.name === name && item.value.trim()))
const missingRules = (step: CrmCapabilityPlanStep) => (EXTRA_RULES[step.capabilityId] ?? []).filter((rule) => rule.anyOf ? !hasArg(step, rule.anyOf) : !hasArg(step, rule.accepts))

export const crmCapabilitySlotRulesForModel = (capabilityId: string) => {
  const extra = EXTRA_RULES[capabilityId]
  if (!extra) return baseRulesForModel(capabilityId)
  return extra.map((rule) => ({ key: rule.key, accepts: [...rule.accepts], question: rule.question, choices: rule.choices ?? [] }))
}

export function validateAndEnrichCapabilitySlots(result: CrmCapabilityPlanningResult, context: CrmCapabilityPlanningContext): CrmCapabilityPlanningResult {
  if (!result.plan.steps.some((step) => Object.prototype.hasOwnProperty.call(EXTRA_RULES, step.capabilityId))) return baseValidate(result, context)
  for (const step of result.plan.steps) {
    if (!Object.prototype.hasOwnProperty.call(EXTRA_RULES, step.capabilityId)) continue
    const missing = missingRules(step)
    if (!missing.length) continue
    const first = missing[0]
    return {
      ...result,
      decision: 'clarify',
      plan: {
        ...result.plan,
        confidence: Math.max(result.plan.confidence, 0.8),
        needsClarification: true,
        clarification: first.choices?.length ? `${first.question} ${first.choices.join(', ')} ou outra opção.` : first.question,
        pendingCapabilityId: step.capabilityId,
        missingSlots: missing.map((item) => item.key),
        knownArgs: step.args.filter((item) => item.value.trim()),
      },
    }
  }
  return baseValidate(result, context)
}

export function pendingCapabilityFromPlan(plan: CrmCapabilityPlan, seed: string, context: CrmCapabilityPlanningContext): CrmPendingCapability | null {
  if (!plan.needsClarification) return null
  const capabilityId = plan.pendingCapabilityId || plan.steps[0]?.capabilityId || '__pending_intent__'
  const definition = universalCrmCapabilityById(capabilityId)
  const step = plan.steps.find((item) => item.capabilityId === capabilityId) ?? plan.steps[0]
  const knownArgs: CrmCapabilityArgument[] = plan.knownArgs?.length ? plan.knownArgs : step?.args ?? []
  return {
    version: '3.4', capabilityId, capabilityTitle: definition?.title || 'Ação em andamento no CRM', seed: seed.trim().slice(0, 5000),
    knownArgs: knownArgs.filter((item) => item.value.trim()).slice(0, 24), missingSlots: (plan.missingSlots?.length ? plan.missingSlots : ['clarification']).slice(0, 12),
    clarification: plan.clarification || 'Qual informação está faltando para concluir esta ação?', currentRoute: context.currentRoute ?? null, createdAt: new Date().toISOString(),
  }
}

export function crmClarificationSuggestions(capabilityId: string, missingSlot?: string) {
  const rule = (EXTRA_RULES[capabilityId] ?? []).find((item) => !missingSlot || item.key === missingSlot)
  return (rule?.choices ?? []).slice(0, 8)
}
