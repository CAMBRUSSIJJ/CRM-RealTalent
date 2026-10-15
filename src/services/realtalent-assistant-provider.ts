// V3.7 regression lineage marker: ollama-capabilities-first+operational-firewall
import type { WorkspaceSnapshot } from '../domain/types'
import { runRealTalentAssistant, type AssistantAnswer, type AssistantContext, type AssistantIntent } from './realtalent-assistant'
import { interpretSalesLanguage } from './realtalent-semantic-language-client'
import { localCapabilityFallback, type CrmCapabilityPlanningResult } from './realtalent-crm-capability-planner'
import { planCrmCapabilitiesViaAgent } from './realtalent-crm-capability-runtime-client'
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

const normalizePrompt = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const looksLikeOperationalRequest = (prompt: string) => {
  const text = normalizePrompt(prompt)
  return /\b(faca|faz|crie|criar|adicione|adicionar|marque|marcar|agende|agendar|reagende|reagendar|mova|mover|atualize|atualizar|altere|alterar|exclua|excluir|apague|apagar|conclua|concluir|envie|enviar|mande|mandar|registre|registrar|ative|ativar|desative|desativar|convide|convidar|garimpe|garimpar|busque|buscar|procure|procurar|defina|definir|estabeleca|estabelecer|lance|lancar|execute|executar|rode|rodar|abra|abrir|ligue|ligar)\b/.test(text)
}

const operationalPlannerUnavailable = (prompt: string, context: AssistantContext): AssistantAnswer => ({
  id: `capability-unavailable:${Date.now()}`,
  intent: 'crm_capability',
  title: 'Ação não executada',
  text: 'Entendi que você pediu uma ação no CRM, mas o Ollama não devolveu um plano executável nesta tentativa. Não vou substituir seu pedido por outra ação ou análise. Tente novamente; se faltar alguma informação, eu vou pedir somente o dado necessário.',
  items: [],
  facts: [`Pedido preservado: ${prompt.trim().slice(0, 220)}`],
  suggestedPrompts: [],
  pendingCapability: null,
  generatedAt: (context.now ?? new Date()).toISOString(),
})

export const hybridRealTalentAssistantProvider: RealTalentAssistantProvider = {
  id: 'realtalent-agent-v3.7-ollama-operational-firewall',
  async answer(prompt, snapshot, context = {}) {
    const capabilityContext = {
      currentRoute: context.currentRoute ?? null,
      focusLeadId: context.focusLeadId ?? null,
      focusProposalId: context.focusProposalId ?? null,
      previousLeadIds: context.previousLeadIds ?? [],
      now: context.now,
      conversationContext: context.conversationContext ?? '',
      pendingCapability: pendingCapabilityContext(context.pendingCapability),
    }

    // Primary path: every native CRM action is planned by Ollama against the real
    // capability catalog before any legacy assistant interpretation can run.
    const capabilityRaw = await planCrmCapabilitiesViaAgent(prompt, capabilityContext)
    const capability = capabilityRaw ? validateAndEnrichCapabilitySlots(capabilityRaw, capabilityContext) : null
    if (capability && capability.decision !== 'fallback') {
      return {
        answer: capabilityPlanAnswer(capability, context, context.pendingCapability?.seed || prompt),
        providerId: `capability:${capability.model}`,
        sendsDataExternally: false,
        mode: 'local-orchestration',
      }
    }

    // Resilience must also come before legacy analysis. This prevents a temporary
    // browser/runtime failure from turning "crie uma meta de ligações" into
    // "melhores contatos agora" or any other unrelated legacy intent.
    const localOperationalRaw = localCapabilityFallback(prompt, capabilityContext)
    const localOperational = localOperationalRaw ? validateAndEnrichCapabilitySlots(localOperationalRaw, capabilityContext) : null
    if (localOperational) return {
      answer: capabilityPlanAnswer(localOperational, context, context.pendingCapability?.seed || prompt),
      providerId: 'capability:local-resilience-v3.7',
      sendsDataExternally: false,
      mode: 'local-orchestration',
    }

    // If the user clearly asked the CRM to DO something and both capability paths
    // failed, fail closed. Never answer with an unrelated analytical legacy intent.
    if (looksLikeOperationalRequest(prompt)) {
      return {
        answer: operationalPlannerUnavailable(prompt, context),
        providerId: 'capability:operational-firewall-v3.7',
        sendsDataExternally: false,
        mode: 'local-orchestration',
      }
    }

    // Specialized sales-language interpretation remains only for analytical/read
    // experiences that intentionally do not map to a native mutation capability.
    const semantic = await interpretSalesLanguage(prompt, context)
    if (semantic?.decision === 'clarify' && semantic.interpretation.intent !== 'unknown') {
      return {
        answer: semanticClarification(semantic.interpretation, context, prompt),
        providerId: `semantic:${semantic.model}`,
        sendsDataExternally: false,
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
          sendsDataExternally: false,
          mode: 'local-orchestration',
        }
      }
    }

    // Final compatibility layer is restricted to genuine read/analysis requests.
    const immediate = runRealTalentAssistant(prompt, snapshot, context)
    return {
      answer: immediate,
      providerId: immediate.intent === 'unknown' ? 'local-deterministic-v3-realtalent-ai' : 'local-language-fallback-v3.1.5',
      sendsDataExternally: false,
      mode: 'local-orchestration',
    }
  },
}