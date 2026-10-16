// V3.7 regression lineage marker: ollama-capabilities-first+operational-firewall
import type { Lead, WorkspaceSnapshot } from '../domain/types'
import { runRealTalentAssistant, type AssistantAnswer, type AssistantContext, type AssistantIntent, type AssistantResultItem } from './realtalent-assistant'
import { interpretSalesLanguage } from './realtalent-semantic-language-client'
import { localCapabilityFallback, localPendingCapabilityReplyFallback, type CrmCapabilityPlanningResult } from './realtalent-crm-capability-planner'
import { planCrmCapabilitiesViaAgent } from './realtalent-crm-capability-runtime-client'
import { crmClarificationSuggestions, genericPendingIntent, pendingCapabilityFromPlan, pendingCapabilityContext, validateAndEnrichCapabilitySlots } from './realtalent-crm-slot-filling'
import { buildDealIntelligence, type DealActionKind, type DealIntelligence } from './deal-intelligence'
import { buildSalesRecommendation, rankDealsWithSalesLearning } from './realtalent-sales-recommendation-engine'
import { formatSalesAgentNextBestAction } from './realtalent-sales-intelligence-agent'
import { buildLiveSalesCoachAssistantAnswer } from './realtalent-live-sales-coach'

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
  text: 'Entendi que você pediu uma ação no CRM, mas o planejador não devolveu um plano executável nesta tentativa. Não vou substituir seu pedido por outra ação ou análise. Tente novamente; se faltar alguma informação, eu vou pedir somente o dado necessário.',
  items: [],
  facts: [`Pedido preservado: ${prompt.trim().slice(0, 220)}`],
  suggestedPrompts: [],
  pendingCapability: null,
  generatedAt: (context.now ?? new Date()).toISOString(),
})

const visibleLeadIdsForContext = (snapshot: WorkspaceSnapshot, context: AssistantContext) => {
  if (snapshot.workspace.role === 'owner' || snapshot.workspace.role === 'admin') return new Set(snapshot.leads.map((lead) => lead.id))
  if (!context.currentUserId) return new Set<string>()
  return new Set(snapshot.leads.filter((lead) => lead.ownerId === context.currentUserId).map((lead) => lead.id))
}

const dealItem = (deal: DealIntelligence, recommendation: ReturnType<typeof buildSalesRecommendation>, callOnly = false): AssistantResultItem => ({
  id: `deal:${deal.lead.id}`,
  kind: 'deal',
  leadId: deal.lead.id,
  title: deal.lead.company || deal.lead.name,
  subtitle: `${deal.lead.name} · Health ${deal.healthScore}/100 · Prob. ${deal.realTalentProbability}%`,
  score: Math.round(recommendation.finalPriorityScore),
  value: deal.commercialValue,
  reason: recommendation.actionLearning.samples >= 3
    ? `${recommendation.recommendedAction.explanation} · ${recommendation.explanation}`
    : recommendation.recommendedAction.explanation,
  route: callOnly ? 'calls' : recommendation.recommendedAction.route,
  action: callOnly ? 'call' : recommendation.recommendedAction.kind,
  proposalId: deal.proposal?.id,
})

const applySalesRecommendationRanking = (answer: AssistantAnswer, snapshot: WorkspaceSnapshot, context: AssistantContext): AssistantAnswer => {
  const visibleLeadIds = visibleLeadIdsForContext(snapshot, context)
  const now = context.now ?? new Date()

  if (answer.intent === 'next_action' && answer.items[0]?.leadId && visibleLeadIds.has(answer.items[0].leadId)) {
    const lead = snapshot.leads.find((item) => item.id === answer.items[0].leadId)
    if (lead) {
      const deal = buildDealIntelligence(lead, snapshot, undefined, now)
      const recommendation = buildSalesRecommendation(deal, snapshot, { visibleLeadIds })
      return {
        ...answer,
        text: formatSalesAgentNextBestAction(lead, snapshot, now),
        items: answer.items.map((item) => item.leadId === lead.id ? {
          ...item,
          score: deal.healthScore,
          reason: recommendation.recommendedAction.explanation,
          route: recommendation.recommendedAction.route,
          action: recommendation.recommendedAction.kind,
        } : item),
        facts: [...answer.facts, recommendation.explanation].slice(0, 8),
      }
    }
  }

  if (answer.intent === 'priorities' || answer.intent === 'call_now') {
    const callOnly = answer.intent === 'call_now'
    const requestedAction: DealActionKind | undefined = callOnly ? 'call' : undefined
    const deals = snapshot.leads
      .filter((lead) => lead.status === 'active' && visibleLeadIds.has(lead.id) && (!callOnly || Boolean(lead.phone && !lead.doNotContact)))
      .map((lead) => buildDealIntelligence(lead, snapshot, undefined, now))
    const ranked = rankDealsWithSalesLearning(deals, snapshot, { visibleLeadIds, requestedAction }).slice(0, 7)
    const items = ranked.map(({ deal, recommendation }) => dealItem(deal, recommendation, callOnly))
    const learnedCount = ranked.filter((item) => item.recommendation.actionLearning.samples >= 3).length
    return {
      ...answer,
      text: items.length
        ? (callOnly
          ? `Encontrei ${items.length} contato(s) priorizados pela combinação de urgência atual, risco, potencial e aprendizado comercial verificado.`
          : `Estas são as ${items.length} oportunidades que eu trabalharia primeiro agora, combinando sinais atuais com aprendizado comercial verificado.`)
        : (callOnly ? 'Não encontrei nenhum contato elegível para ligação agora.' : 'Não há negócios ativos para priorizar.'),
      items,
      facts: learnedCount
        ? [...answer.facts, `${learnedCount} prioridade(s) receberam ajuste histórico limitado a ±10 pontos.`].slice(0, 8)
        : answer.facts,
    }
  }

  if (answer.intent !== 'best_contacts' || !answer.items.length) return answer
  const visibleItems = answer.items.filter((item) => visibleLeadIds.has(item.leadId))
  const deals = visibleItems
    .map((item) => snapshot.leads.find((lead) => lead.id === item.leadId))
    .filter((lead): lead is Lead => Boolean(lead))
    .map((lead) => buildDealIntelligence(lead, snapshot, undefined, now))
  if (!deals.length) return { ...answer, items: [] }

  const ranked = rankDealsWithSalesLearning(deals, snapshot, { visibleLeadIds })
  const itemByLead = new Map(visibleItems.map((item) => [item.leadId, item]))
  const items = ranked.map(({ deal, recommendation }) => {
    const item = itemByLead.get(deal.lead.id)!
    return {
      ...item,
      score: Math.round(recommendation.finalPriorityScore),
      reason: recommendation.actionLearning.samples >= 3
        ? `${item.reason} · ${recommendation.explanation}`
        : item.reason,
      action: recommendation.recommendedAction.kind,
      route: recommendation.recommendedAction.route,
    }
  })
  return { ...answer, items }
}

export const hybridRealTalentAssistantProvider: RealTalentAssistantProvider = {
  id: 'realtalent-agent-v3.8-sales-recommendation-v2',
  async answer(prompt, snapshot, context = {}) {
    const liveSalesCoach = buildLiveSalesCoachAssistantAnswer(prompt, snapshot, context)
    if (liveSalesCoach) return { answer: liveSalesCoach, providerId: 'sales-coaching:live-grounded-v1', sendsDataExternally: false, mode: 'local-orchestration' }

    const capabilityContext = {
      currentRoute: context.currentRoute ?? null,
      focusLeadId: context.focusLeadId ?? null,
      focusProposalId: context.focusProposalId ?? null,
      previousLeadIds: context.previousLeadIds ?? [],
      now: context.now,
      conversationContext: context.conversationContext ?? '',
      pendingCapability: pendingCapabilityContext(context.pendingCapability),
    }

    const pendingReplyRaw = localPendingCapabilityReplyFallback(prompt, capabilityContext)
    const pendingReply = pendingReplyRaw ? validateAndEnrichCapabilitySlots(pendingReplyRaw, capabilityContext) : null
    if (pendingReply) {
      return {
        answer: capabilityPlanAnswer(pendingReply, context, context.pendingCapability?.seed || prompt),
        providerId: `capability:${pendingReply.model}`,
        sendsDataExternally: false,
        mode: 'local-orchestration',
      }
    }

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

    const localOperationalRaw = localCapabilityFallback(prompt, capabilityContext)
    const localOperational = localOperationalRaw ? validateAndEnrichCapabilitySlots(localOperationalRaw, capabilityContext) : null
    if (localOperational) return {
      answer: capabilityPlanAnswer(localOperational, context, context.pendingCapability?.seed || prompt),
      providerId: 'capability:local-resilience-v3.7',
      sendsDataExternally: false,
      mode: 'local-orchestration',
    }

    if (looksLikeOperationalRequest(prompt)) {
      return {
        answer: operationalPlannerUnavailable(prompt, context),
        providerId: 'capability:operational-firewall-v3.8',
        sendsDataExternally: false,
        mode: 'local-orchestration',
      }
    }

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
      const interpreted = applySalesRecommendationRanking(runRealTalentAssistant(prompt, snapshot, semanticContext), snapshot, semanticContext)
      if (interpreted.intent !== 'unknown' && interpreted.intent !== 'help') {
        return {
          answer: interpreted,
          providerId: `semantic:${semantic.model}`,
          sendsDataExternally: false,
          mode: 'local-orchestration',
        }
      }
    }

    const immediate = applySalesRecommendationRanking(runRealTalentAssistant(prompt, snapshot, context), snapshot, context)
    return {
      answer: immediate,
      providerId: immediate.intent === 'unknown' ? 'local-deterministic-v3-realtalent-ai' : 'local-language-fallback-v3.8-sales-recommendation',
      sendsDataExternally: false,
      mode: 'local-orchestration',
    }
  },
}