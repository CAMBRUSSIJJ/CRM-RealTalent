// V3.3 regression lineage marker: hybrid-realtalent-agent-v3.3
import type { WorkspaceSnapshot } from '../domain/types'
import { runRealTalentAssistant, type AssistantAnswer, type AssistantContext, type AssistantIntent } from './realtalent-assistant'
import { askRemoteRealTalentAgent } from './realtalent-agent-client'
import { interpretSalesLanguage } from './realtalent-semantic-language-client'
import { localCapabilityFallback, planCrmCapabilities, type CrmCapabilityPlanningResult } from './realtalent-crm-capability-planner'
import { crmClarificationSuggestions, genericPendingIntent, pendingCapabilityFromPlan, pendingCapabilityContext, validateAndEnrichCapabilitySlots } from './realtalent-crm-slot-filling'

export interface RealTalentAssistantProviderResult {
  answer: AssistantAnswer
  providerId: string
  sendsDataExternally: boolean
  mode: 'local-orchestration' | 'openai-planning'
}

export interface RealTalentAssistantProvider {
  readonly id: string
  answer(prompt: string, snapshot: WorkspaceSnapshot, context?: AssistantContext): Promise<RealTalentAssistantProviderResult>
}


const capabilityPlanAnswer = (result: CrmCapabilityPlanningResult, context: AssistantContext, seed = ''): AssistantAnswer => {
  const { plan } = result
  if (result.decision === 'clarify') return {
    id: `capability-clarify:${Date.now()}`,
    intent: 'crm_capability',
    title: 'Só preciso confirmar uma coisa',
    text: plan.clarification || 'Entendi a ação, mas falta uma informação para executá-la com segurança.',
    items: [],
    facts: plan.knownArgs.length ? ['Mantive as informações que você já informou; só falta completar o ponto abaixo.'] : [],
    suggestedPrompts: crmClarificationSuggestions(plan.pendingCapabilityId || plan.steps[0]?.capabilityId || '', plan.missingSlots[0]),
    pendingCapability: pendingCapabilityFromPlan(plan, seed, {
      currentRoute: context.currentRoute ?? null,
      focusLeadId: context.focusLeadId ?? null,
      focusProposalId: context.focusProposalId ?? null,
      previousLeadIds: context.previousLeadIds ?? [],
      now: context.now,
      conversationContext: context.conversationContext ?? '',
      pendingCapability: pendingCapabilityContext(context.pendingCapability),
    }),
    generatedAt: (context.now ?? new Date()).toISOString(),
  }

  return {
    id: `capability-plan:${Date.now()}`,
    intent: 'crm_capability',
    title: plan.steps.length > 1 ? 'Plano preparado no CRM' : (plan.steps[0]?.title || 'Ação preparada no CRM'),
    text: plan.goal || 'Entendi o que você quer fazer e preparei a ação usando as capacidades nativas do CRM.',
    items: [],
    facts: plan.steps.map((step) => step.reason ? `${step.title} — ${step.reason}` : step.title),
    suggestedPrompts: plan.steps.some((step) => step.capabilityId === 'agent.undo_last') ? [] : ['Desfaça a última ação'],
    pendingCapability: null,
    generatedAt: (context.now ?? new Date()).toISOString(),
    plan: {
      id: `crm-capabilities:${Date.now()}`,
      kind: 'crm_capabilities',
      title: plan.steps.length > 1 ? 'Executar plano no CRM' : (plan.steps[0]?.title || 'Executar ação no CRM'),
      description: plan.goal || 'Plano criado a partir do pedido em linguagem natural.',
      goal: plan.goal,
      steps: plan.steps,
      preview: plan.steps.map((step, index) => `${index + 1}. ${step.title}${step.reason ? ` — ${step.reason}` : ''}`),
    },
  }
}

const semanticClarification = (semantic: NonNullable<Awaited<ReturnType<typeof interpretSalesLanguage>>>['interpretation'], context: AssistantContext, seed: string): AssistantAnswer => {
  const clarification = semantic.clarification || 'Falta uma informação para eu executar isso com segurança. Pode completar o pedido?'
  const planningContext = {
    currentRoute: context.currentRoute ?? null,
    focusLeadId: context.focusLeadId ?? null,
    focusProposalId: context.focusProposalId ?? null,
    previousLeadIds: context.previousLeadIds ?? [],
    now: context.now,
    conversationContext: context.conversationContext ?? '',
    pendingCapability: pendingCapabilityContext(context.pendingCapability),
  }
  return {
    id: `semantic-clarify:${Date.now()}`,
    intent: (semantic.intent === 'unknown' ? 'unknown' : semantic.intent) as AssistantIntent,
    title: 'Só preciso confirmar uma coisa',
    text: clarification,
    items: [],
    facts: ['Mantive o pedido em andamento; você pode responder apenas com a informação que falta.'],
    suggestedPrompts: [],
    pendingCapability: genericPendingIntent(context.pendingCapability?.seed || seed, clarification, planningContext, 'Pedido em andamento'),
    generatedAt: (context.now ?? new Date()).toISOString(),
  }
}

export const hybridRealTalentAssistantProvider: RealTalentAssistantProvider = {
  id: 'hybrid-realtalent-agent-v3.4',
  async answer(prompt, snapshot, context = {}) {
    // Preserve the zero-latency path only when the request already produced a safe native plan.
    // Everything else gets a semantic interpretation before lexical compatibility fallbacks.
    const immediate = runRealTalentAssistant(prompt, snapshot, context)
    if (immediate.plan) {
      return {
        answer: immediate,
        providerId: 'local-fast-actions-v3.1.5',
        sendsDataExternally: false,
        mode: 'local-orchestration',
      }
    }

    // V3.3 semantic fast/resilience path for a deliberately tiny set of unequivocal
    // operational actions. It is not the universal router; all other language still
    // goes through semantic/model planning.
    const capabilityContext = {
      currentRoute: context.currentRoute ?? null,
      focusLeadId: context.focusLeadId ?? null,
      focusProposalId: context.focusProposalId ?? null,
      previousLeadIds: context.previousLeadIds ?? [],
      now: context.now,
      conversationContext: context.conversationContext ?? '',
      pendingCapability: pendingCapabilityContext(context.pendingCapability),
    }
    const localOperationalRaw = localCapabilityFallback(prompt, capabilityContext)
    const localOperational = localOperationalRaw ? validateAndEnrichCapabilitySlots(localOperationalRaw, capabilityContext) : null
    if (localOperational) return {
      answer: capabilityPlanAnswer(localOperational, context, context.pendingCapability?.seed || prompt),
      providerId: 'capability:local-resilience-v3.4',
      sendsDataExternally: false,
      mode: 'local-orchestration',
    }

    const semantic = await interpretSalesLanguage(prompt, context)
    if (semantic?.decision === 'clarify' && semantic.interpretation.intent !== 'unknown') {
      return {
        answer: semanticClarification(semantic.interpretation, context, prompt),
        providerId: `semantic:${semantic.model}`,
        sendsDataExternally: semantic.provider === 'openai',
        mode: 'local-orchestration',
      }
    }

    if (semantic?.decision === 'execute') {
      let semanticContext: AssistantContext = { ...context, semanticInterpretation: semantic.interpretation }
      if (semantic.interpretation.intent === 'create_task' && semantic.interpretation.entities.assignee_query && !semanticContext.workspaceMembers && context.loadWorkspaceMembers) {
        semanticContext = { ...semanticContext, workspaceMembers: await context.loadWorkspaceMembers().catch(() => []) }
      }
      if (semantic.interpretation.intent === 'complete_task' && !semanticContext.workTasks && context.loadWorkTasks) {
        semanticContext = { ...semanticContext, workTasks: await context.loadWorkTasks().catch(() => []) }
      }
      const interpreted = runRealTalentAssistant(prompt, snapshot, semanticContext)
      if (interpreted.intent !== 'unknown' && interpreted.intent !== 'help') {
        return {
          answer: interpreted,
          providerId: `semantic:${semantic.model}`,
          sendsDataExternally: semantic.provider === 'openai',
          mode: 'local-orchestration',
        }
      }
    }

    // V3.3 CRM Agent Operating Layer + Sales Execution + Prospecting Intelligence: when the sales-language layer does not own the request,
    // ask the model to plan against the capabilities the CRM actually exposes. This is the
    // universal path for notifications, contacts, pipeline, tasks, agenda, proposals, goals,
    // teams, automations, navigation and cross-module actions.
    const capabilityRaw = await planCrmCapabilities(prompt, capabilityContext)
    const capability = capabilityRaw ? validateAndEnrichCapabilitySlots(capabilityRaw, capabilityContext) : null
    if (capability && capability.decision !== 'fallback') {
      return {
        answer: capabilityPlanAnswer(capability, context, context.pendingCapability?.seed || prompt),
        providerId: `capability:${capability.model}`,
        sendsDataExternally: capability.provider === 'openai',
        mode: 'local-orchestration',
      }
    }

    // V3.1.4-H3 compatibility marker: localFast.intent !== 'unknown' && localFast.intent !== 'help'
    // Compatibility fallback: keep H3 lexical families available if the local model/runtime is offline.
    if (immediate.intent !== 'unknown' && immediate.intent !== 'help') {
      return {
        answer: immediate,
        providerId: 'local-language-fallback-v3.1.5',
        sendsDataExternally: false,
        mode: 'local-orchestration',
      }
    }

    const remote = await askRemoteRealTalentAgent(prompt, snapshot, context)
    if (remote) return {
      answer: remote.answer,
      providerId: `agent:${remote.model}`,
      sendsDataExternally: true,
      mode: 'openai-planning',
    }
    return {
      answer: runRealTalentAssistant(prompt, snapshot, context),
      providerId: 'local-deterministic-v3-realtalent-ai',
      sendsDataExternally: false,
      mode: 'local-orchestration',
    }
  },
}
