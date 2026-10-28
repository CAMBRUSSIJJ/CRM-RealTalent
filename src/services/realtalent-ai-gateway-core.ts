import type { WorkspaceSnapshot } from '../domain/types'
import { appendRealTalentAiAudit } from './realtalent-ai-audit'
import { buildRealTalentAiContext, type RealTalentAiContextEnvelope } from './realtalent-ai-context'
import { hybridRealTalentAssistantProvider } from './realtalent-assistant-provider'
import { answerConversationalPrompt } from './realtalent-agent-v54-chat'
import { runAgentToolsV5 } from './realtalent-agent-v5-cognitive'
import type { AssistantAnswer, AssistantContext } from './realtalent-assistant'
import { lastCrmExecutionReceipt } from './realtalent-crm-execution-truth'
import {
  findRelevantLearningExperiences,
  formatLearningContext,
  isLearningCorrection,
  recordLearningCorrection,
  rememberLearningPlan,
  syncVerifiedLearningFromReceipt,
} from './realtalent-learning-engine'
import {
  formatSalesLearningContextForPrompt,
  linkSalesRecommendationToActionPlan,
  recordSalesLearningCorrection,
  stageSalesRecommendationsFromPlan,
  syncSalesLearningFromReceipt,
} from './realtalent-sales-learning-engine'
import {
  buildSalesAgentContext,
  formatSalesAgentDealAnalysis,
  formatSalesAgentNextBestAction,
} from './realtalent-sales-intelligence-agent'
import { buildSalesCoachingPlan, formatSalesCoachingPlan } from './realtalent-sales-coaching'
import {
  formatSalesActionEffectiveness,
  formatSalesPortfolioLearningSummary,
  type SalesPortfolioLearningFilters,
} from './realtalent-sales-portfolio-learning'

export interface RealTalentAiGatewayResult {
  answer: AssistantAnswer
  context: RealTalentAiContextEnvelope
  trace: {
    providerId: string
    mode: 'local-orchestration' | 'openai-planning'
    sendsDataExternally: boolean
    durationMs: number
    writeAuthority: false
  }
}

const toolsForAnswer = (answer: AssistantAnswer) => {
  if (answer.toolOutput?.kind === 'calculation') return ['calculator:verified-v4.1']
  if (answer.toolOutput?.kind === 'script') return ['scripts:grounded-v4.1']
  if (answer.plan?.kind === 'crm_capabilities') return [...new Set(answer.plan.steps.map((step) => step.capabilityId))]
  if (answer.plan?.kind === 'move_opportunity') return ['read_pipeline', 'move_opportunity']
  if (answer.plan?.kind === 'create_task') return ['read_pipeline', 'create_task']
  if (answer.plan?.kind === 'complete_task') return ['read_tasks', 'complete_task']
  if (answer.plan?.kind === 'update_lead_profile') return ['read_pipeline', 'update_lead_profile']
  if (answer.plan?.kind === 'create_goal') return ['read_goals', 'create_goal']
  if (answer.plan?.kind === 'create_proposal') return ['read_pipeline', 'read_catalog', 'create_proposal']
  if (answer.intent === 'create_followups') return ['read_pipeline', 'create_followup']
  if (answer.intent === 'best_contacts') return ['read_contacts', 'lead_scoring']
  if (answer.intent === 'prepare_call') return ['read_pipeline', 'read_history', 'read_account', 'prepare_call']
  if (answer.intent === 'suggest_message') return ['read_history', 'draft_message']
  if (answer.intent === 'forecast') return ['read_forecast']
  if (answer.intent === 'meeting_summary' || answer.intent === 'activity_summary') return ['read_history']
  return ['read_pipeline']
}

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9@.+\-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const isPortfolioLearningQuestion = (prompt: string) => {
  const text = normalize(prompt)
  return /\b(aprendizado comercial|aprendemos (?:com|sobre)|o que aprendemos|padroes? (?:de vendas?|comerciais?|que mais avancam|que mais pioram)|historico de recomendacoes?|acoes? que mais funcionam|acao que mais funciona|eficacia das acoes?|taxa de sucesso das acoes?|melhor acao por etapa|melhores acoes por etapa|o que funciona melhor|qual acao funciona melhor|compare as acoes|comparar acoes|perfis? de (?:lead|cliente|oportunidade)s? que (?:mais )?avancam|tipos? de oportunidades? que (?:mais )?avancam|negocios? que (?:mais )?(?:avancam|pioram)|riscos? (?:dos|nos|em) padroes?)\b/.test(text)
}

const isActionEffectivenessQuestion = (prompt: string) => {
  const text = normalize(prompt)
  return /\b(eficacia|taxa de sucesso|funciona melhor|qual acao|melhores acoes|compare as acoes|comparar acoes)\b/.test(text)
}

const isDealNextActionQuestion = (prompt: string) => {
  const text = normalize(prompt)
  return /\b(proxima melhor acao|qual a proxima acao|qual e a proxima acao|o que devo fazer|o que eu deveria fazer|o que fazer com|melhor acao para)\b/.test(text)
}

const isDealAnalysisQuestion = (prompt: string) => {
  const text = normalize(prompt)
  return /\b(analise a oportunidade|analise o negocio|analisar oportunidade|analisar negocio|saude da oportunidade|saude do negocio|como esta a oportunidade|como esta o negocio|riscos da oportunidade|risco da oportunidade)\b/.test(text)
}

const isDealCoachingQuestion = (prompt: string) => {
  const text = normalize(prompt)
  return /\b(me prepare|prepare me|preparar (?:para )?(?:a )?(?:ligacao|reuniao)|como conduzir|como devo conduzir|como abordar|como devo abordar|o que perguntar|quais perguntas|como responder obje|objecoes? (?:provaveis|possiveis|para preparar)|roteiro (?:para|da|de) (?:ligacao|reuniao)|coaching (?:de vendas?|comercial)?|como falar com|me ajude (?:na|com a) (?:ligacao|reuniao))\b/.test(text)
}

const visibleLearningLeadIds = (snapshot: WorkspaceSnapshot, context: AssistantContext) => {
  const role = snapshot.workspace.role
  if (role === 'owner' || role === 'admin') return new Set(snapshot.leads.map((lead) => lead.id))
  if (!context.currentUserId) return new Set<string>()
  return new Set(snapshot.leads.filter((lead) => lead.ownerId === context.currentUserId).map((lead) => lead.id))
}

const bestVisibleLeadForPrompt = (prompt: string, snapshot: WorkspaceSnapshot, context: AssistantContext) => {
  const visibleIds = visibleLearningLeadIds(snapshot, context)
  const visible = snapshot.leads.filter((lead) => visibleIds.has(lead.id))
  if (!visible.length) return null

  const text = normalize(prompt)
  let best: { lead: (typeof visible)[number]; score: number } | null = null
  for (const lead of visible) {
    const fields = [lead.id, lead.name, lead.company, lead.email, lead.phone]
      .filter(Boolean)
      .map((value) => normalize(String(value)))
      .filter((value) => value.length >= 3)
    let score = 0
    for (const field of fields) {
      if (text.includes(field)) score = Math.max(score, 100 + Math.min(40, field.length))
      const tokens = field.split(' ').filter((token) => token.length >= 4)
      const matched = tokens.filter((token) => text.includes(token)).length
      if (tokens.length && matched) score = Math.max(score, Math.round((matched / tokens.length) * 80))
    }
    if (!best || score > best.score) best = { lead, score }
  }
  if (best && best.score >= 55) return best.lead

  if (context.focusLeadId) {
    const focused = visible.find((lead) => lead.id === context.focusLeadId)
    if (focused) return focused
  }
  if (context.previousLeadIds?.length === 1) {
    const previous = visible.find((lead) => lead.id === context.previousLeadIds?.[0])
    if (previous) return previous
  }
  return null
}

const inferPortfolioFilters = (prompt: string, snapshot: WorkspaceSnapshot, context: AssistantContext): SalesPortfolioLearningFilters => {
  const text = normalize(prompt)
  const filters: SalesPortfolioLearningFilters = {
    visibleLeadIds: visibleLearningLeadIds(snapshot, context),
    minSamples: 3,
    limit: 8,
  }
  const stage = snapshot.stages.find((item) => {
    const key = normalize(item.name)
    return key.length >= 3 && text.includes(key)
  })
  if (stage) filters.stageQuery = stage.name

  const source = [...new Set(snapshot.leads.map((lead) => lead.source).filter(Boolean))].find((item) => {
    const key = normalize(item)
    return key.length >= 4 && text.includes(key)
  })
  if (source) filters.sourceQuery = source

  const segment = [...new Set(snapshot.companies.map((company) => company.segment).filter(Boolean))].find((item) => {
    const key = normalize(item)
    return key.length >= 3 && text.includes(key)
  })
  if (segment) filters.segmentQuery = segment

  if (/\b(ligar|ligacao|telefonar|telefonema)\b/.test(text)) filters.actionQuery = 'call'
  else if (/\b(follow ?up|retorno|acompanhar|acompanhamento)\b/.test(text)) filters.actionQuery = 'followup'
  else if (/\b(reuniao|agendar reuniao|marcar reuniao)\b/.test(text)) filters.actionQuery = 'meeting'
  else if (/\b(mapear decisor|mapear stakeholder|identificar decisor|identificar stakeholder)\b/.test(text)) filters.actionQuery = 'map_stakeholder'
  else if (/\b(enviar proposta|mandar proposta|criar proposta)\b/.test(text)) filters.actionQuery = 'proposal'
  else if (/\b(revisar proposta|rever proposta)\b/.test(text)) filters.actionQuery = 'review_proposal'
  else if (/\b(atualizar fechamento|revisar fechamento|data de fechamento)\b/.test(text)) filters.actionQuery = 'update_close_date'

  if (/\b(decisor|economic buyer)\b/.test(text) && !filters.actionQuery) filters.riskQuery = 'missing-decision-maker'
  else if (/\b(proxima acao vencida|proximo passo vencido|follow ?up atrasado)\b/.test(text)) filters.riskQuery = 'overdue-next-step'
  else if (/\b(sem proximo passo|sem proxima acao)\b/.test(text)) filters.riskQuery = 'no-next-step'
  else if (/\b(negocio parado|oportunidade parada|muito tempo sem contato)\b/.test(text)) filters.riskQuery = 'stale-critical'
  else if (/\b(esfriando|engajamento esfriando|sem contato)\b/.test(text)) filters.riskQuery = 'stale'
  else if (/\b(um stakeholder|um contato|single threaded|relacionamento concentrado)\b/.test(text)) filters.riskQuery = 'single-threaded'
  else if (/\b(blocker|bloqueador|stakeholder contrario)\b/.test(text)) filters.riskQuery = 'blocker'
  else if (/\b(sem proposta|proposta nao criada)\b/.test(text)) filters.riskQuery = 'proposal-missing'
  else if (/\b(proposta em rascunho|rascunho da proposta)\b/.test(text)) filters.riskQuery = 'proposal-draft'

  return filters
}

const portfolioLearningAnswer = (prompt: string, snapshot: WorkspaceSnapshot, context: AssistantContext): AssistantAnswer => {
  const filters = inferPortfolioFilters(prompt, snapshot, context)
  const compare = isActionEffectivenessQuestion(prompt)
  const text = compare
    ? formatSalesActionEffectiveness(snapshot.workspace.id, snapshot, filters)
    : formatSalesPortfolioLearningSummary(snapshot.workspace.id, snapshot, filters)
  const scopeLabel = snapshot.workspace.role === 'owner' || snapshot.workspace.role === 'admin'
    ? 'workspace permitido'
    : 'negócios sob sua responsabilidade'
  return {
    id: `sales-learning:${Date.now()}`,
    intent: 'priorities',
    title: compare ? 'Eficácia das ações comerciais' : 'Aprendizado comercial da carteira',
    text,
    items: [],
    facts: [
      `Escopo analisado: ${scopeLabel}.`,
      'Somente resultados positive/negative derivados de execução verificada entram na comparação; correções do usuário são excluídas.',
      'Amostras pequenas são marcadas como provisórias e recebem penalização no ranking.',
    ],
    suggestedPrompts: [
      'Qual ação funciona melhor na etapa de proposta?',
      'Quais perfis de lead avançam mais?',
      'O que aprendemos sobre os negócios que avançam?',
    ],
    generatedAt: (context.now ?? new Date()).toISOString(),
  }
}

const dealIntelligenceAnswer = (prompt: string, snapshot: WorkspaceSnapshot, context: AssistantContext) => {
  if (!isDealAnalysisQuestion(prompt) && !isDealNextActionQuestion(prompt)) return null
  const lead = bestVisibleLeadForPrompt(prompt, snapshot, context)
  if (!lead) return null
  const nextAction = isDealNextActionQuestion(prompt)
  const sales = buildSalesAgentContext(lead, snapshot, context.now ?? new Date())
  const text = nextAction
    ? formatSalesAgentNextBestAction(lead, snapshot, context.now ?? new Date())
    : formatSalesAgentDealAnalysis(lead, snapshot, context.now ?? new Date())
  const capabilityId = nextAction ? 'sales.next_best_action' : 'sales.analyze_deal'
  const planId = `direct-sales:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`
  stageSalesRecommendationsFromPlan(snapshot.workspace.id, prompt, {
    id: planId,
    steps: [{
      id: `${planId}:read`,
      capabilityId,
      title: nextAction ? 'Calcular próxima melhor ação' : 'Analisar saúde da oportunidade',
      reason: 'Leitura determinística dos sinais comerciais atuais do CRM.',
      risk: 'read',
      args: [
        { name: 'record_query', value: lead.id },
        { name: 'recommended_action', value: sales.nextBestAction.kind },
        { name: 'recommended_action_title', value: sales.nextBestAction.title },
        { name: 'recommended_action_route', value: sales.nextBestAction.route },
      ],
    }],
  }, snapshot, lead.id)

  const answer: AssistantAnswer = {
    id: planId,
    intent: nextAction ? 'next_action' : 'lead_summary',
    title: nextAction ? `Próxima ação · ${lead.company || lead.name}` : `Saúde da oportunidade · ${lead.company || lead.name}`,
    text,
    items: [{
      id: `deal:${lead.id}`,
      kind: 'deal',
      leadId: lead.id,
      title: lead.company || lead.name,
      subtitle: `${lead.name} · ${sales.health.score}/100 · ${sales.commercial.stage?.name ?? 'sem etapa'}`,
      score: sales.health.score,
      value: sales.commercial.value,
      reason: sales.nextBestAction.explanation,
      route: 'pipeline',
      action: sales.nextBestAction.kind,
      proposalId: sales.commercial.proposal?.id,
    }],
    facts: [
      `Deal Health ${sales.health.score}/100 (${sales.health.label}).`,
      `Probabilidade RealTalent ${sales.health.realTalentProbability}% e momentum ${sales.health.momentum}.`,
      `Cobertura da conta ${sales.health.accountCoverage}/100; relacionamento ${sales.health.relationshipScore}/100.`,
    ],
    suggestedPrompts: nextAction
      ? ['Por que você recomenda isso?', 'Faça isso', 'Analise a saúde completa desta oportunidade']
      : ['Qual é a próxima melhor ação?', 'Por que este negócio está em risco?', 'Faça a ação recomendada'],
    focus: {
      leadId: lead.id,
      title: lead.company || lead.name,
      subtitle: lead.name,
      stageName: sales.commercial.stage?.name ?? 'Sem etapa',
      healthScore: sales.health.score,
      value: sales.commercial.value,
      route: 'pipeline',
      proposalId: sales.commercial.proposal?.id,
    },
    generatedAt: (context.now ?? new Date()).toISOString(),
  }
  return { answer, capabilityId }
}

const dealCoachingAnswer = (prompt: string, snapshot: WorkspaceSnapshot, context: AssistantContext) => {
  if (!isDealCoachingQuestion(prompt)) return null
  const lead = bestVisibleLeadForPrompt(prompt, snapshot, context)
  if (!lead) return null
  const now = context.now ?? new Date()
  const coaching = buildSalesCoachingPlan(lead, snapshot, prompt, now)
  const sales = buildSalesAgentContext(lead, snapshot, now)
  const planId = `sales-coaching:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`
  const answer: AssistantAnswer = {
    id: planId,
    intent: 'prepare_call',
    title: `${coaching.conversationType === 'meeting' ? 'Coaching de reunião' : 'Coaching de ligação'} · ${lead.company || lead.name}`,
    text: formatSalesCoachingPlan(lead, snapshot, prompt, now),
    items: [{
      id: `deal:${lead.id}`,
      kind: 'deal',
      leadId: lead.id,
      title: lead.company || lead.name,
      subtitle: `${lead.name} · ${sales.health.score}/100 · ${coaching.stageName}`,
      score: sales.health.score,
      value: sales.commercial.value,
      reason: coaching.coachingFocus,
      route: coaching.conversationType === 'call' ? 'calls' : 'agenda',
      action: coaching.conversationType,
      proposalId: sales.commercial.proposal?.id,
    }],
    facts: [
      `Objetivo mínimo: ${coaching.objective}`,
      `${coaching.stakeholders.length} stakeholder(s) estruturado(s) considerados no coaching.`,
      coaching.matchedPlaybooks.length ? `Playbooks aplicáveis: ${coaching.matchedPlaybooks.join(' · ')}.` : 'Nenhum Playbook estruturado compatível foi encontrado; foram usados sinais atuais e perguntas seguras de descoberta.',
      coaching.learningSummary,
    ],
    suggestedPrompts: coaching.conversationType === 'call'
      ? ['Abra a ligação para este contato', 'Quais objeções devo preparar?', 'Qual é a próxima melhor ação depois da ligação?']
      : ['Agende o próximo compromisso', 'Quais perguntas são indispensáveis nesta reunião?', 'Qual é a próxima melhor ação depois da reunião?'],
    focus: {
      leadId: lead.id,
      title: lead.company || lead.name,
      subtitle: lead.name,
      stageName: coaching.stageName,
      healthScore: sales.health.score,
      value: sales.commercial.value,
      route: coaching.conversationType === 'call' ? 'calls' : 'agenda',
      proposalId: sales.commercial.proposal?.id,
    },
    generatedAt: now.toISOString(),
  }
  return { answer, capabilityId: 'sales.coach_conversation' }
}

const learningAwareContext = (workspaceId: string, prompt: string, snapshot: WorkspaceSnapshot, assistantContext: AssistantContext) => {
  const receipt = lastCrmExecutionReceipt(workspaceId)
  syncVerifiedLearningFromReceipt(workspaceId, receipt)
  syncSalesLearningFromReceipt(workspaceId, receipt, snapshot)

  const correction = isLearningCorrection(prompt) ? recordLearningCorrection(workspaceId, prompt) : null
  if (correction) recordSalesLearningCorrection(workspaceId, prompt)

  const retrievalPrompt = correction ? `${correction.prompt} ${prompt}` : prompt
  const learningContext = formatLearningContext(findRelevantLearningExperiences(workspaceId, retrievalPrompt, 5))
  const learningFocusLeadId = assistantContext.focusLeadId
    ?? (assistantContext.previousLeadIds?.length === 1 ? assistantContext.previousLeadIds[0] : null)
  const salesLearningContext = formatSalesLearningContextForPrompt(workspaceId, prompt, snapshot, learningFocusLeadId)
  const conversationContext = [assistantContext.conversationContext?.trim(), learningContext, salesLearningContext]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 6500)
  return { context: { ...assistantContext, conversationContext }, correction }
}

export const realTalentAiGateway = {
  id: 'realtalent-ai-gateway-v5-cognitive-tools',
  async answer(prompt: string, snapshot: WorkspaceSnapshot, assistantContext: AssistantContext = {}): Promise<RealTalentAiGatewayResult> {
    const started = Date.now()
    const workspaceId = snapshot.workspace.id
    const learned = learningAwareContext(workspaceId, prompt, snapshot, assistantContext)
    const effectiveContext = learned.context
    const context = buildRealTalentAiContext(snapshot, effectiveContext)
    try {
      if (isPortfolioLearningQuestion(prompt)) {
        const answer = portfolioLearningAnswer(prompt, snapshot, effectiveContext)
        const durationMs = Math.max(0, Date.now() - started)
        appendRealTalentAiAudit({
          id: `ai:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          workspaceId,
          providerId: 'sales-learning:portfolio-v1',
          intent: answer.intent,
          focusLeadId: context.focusLeadId,
          route: context.route,
          toolIds: ['sales_learning_portfolio'],
          outcome: 'success',
          durationMs,
          generatedAt: new Date().toISOString(),
        })
        return { answer, context, trace: { providerId: 'sales-learning:portfolio-v1', mode: 'local-orchestration', sendsDataExternally: false, durationMs, writeAuthority: false } }
      }

      const toolAnswer = await runAgentToolsV5(prompt, snapshot, effectiveContext)
      if (toolAnswer) {
        const durationMs = Math.max(0, Date.now() - started)
        const providerId = toolAnswer.toolOutput?.kind === 'calculation' ? 'tools:calculator-v5' : 'tools:cognitive-script-v5'
        appendRealTalentAiAudit({
          id: `ai:${Date.now()}:tool`, workspaceId, providerId, intent: toolAnswer.intent,
          focusLeadId: context.focusLeadId, route: context.route,
          toolIds: toolsForAnswer(toolAnswer), outcome:'success', durationMs, generatedAt:new Date().toISOString(),
        })
        return { answer:toolAnswer, context, trace:{providerId,mode:'local-orchestration',sendsDataExternally:false,durationMs,writeAuthority:false} }
      }

      const directCoaching = dealCoachingAnswer(prompt, snapshot, effectiveContext)
      if (directCoaching) {
        const durationMs = Math.max(0, Date.now() - started)
        appendRealTalentAiAudit({
          id: `ai:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          workspaceId,
          providerId: 'sales-coaching:grounded-v1',
          intent: directCoaching.answer.intent,
          focusLeadId: directCoaching.answer.focus?.leadId ?? context.focusLeadId,
          route: context.route,
          toolIds: [directCoaching.capabilityId],
          outcome: 'success',
          durationMs,
          generatedAt: new Date().toISOString(),
        })
        return { answer: directCoaching.answer, context, trace: { providerId: 'sales-coaching:grounded-v1', mode: 'local-orchestration', sendsDataExternally: false, durationMs, writeAuthority: false } }
      }

      const directDeal = dealIntelligenceAnswer(prompt, snapshot, effectiveContext)
      if (directDeal) {
        const durationMs = Math.max(0, Date.now() - started)
        appendRealTalentAiAudit({
          id: `ai:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          workspaceId,
          providerId: 'sales-intelligence:deterministic-v1',
          intent: directDeal.answer.intent,
          focusLeadId: directDeal.answer.focus?.leadId ?? context.focusLeadId,
          route: context.route,
          toolIds: [directDeal.capabilityId],
          outcome: 'success',
          durationMs,
          generatedAt: new Date().toISOString(),
        })
        return { answer: directDeal.answer, context, trace: { providerId: 'sales-intelligence:deterministic-v1', mode: 'local-orchestration', sendsDataExternally: false, durationMs, writeAuthority: false } }
      }

      // General questions use the read-only model chat; operational requests
      // keep the existing capability planner and CRM permission boundary.
      const conversational = await answerConversationalPrompt(prompt,effectiveContext)
      if (conversational) {
        const durationMs=Math.max(0,Date.now()-started)
        appendRealTalentAiAudit({
          id:`ai:${Date.now()}:chat`,workspaceId,providerId:conversational.id.startsWith('chat:ollama:')?'ollama:chat-v5.4':'ollama:chat-unavailable',
          intent:conversational.intent,focusLeadId:context.focusLeadId,route:context.route,
          toolIds:[],outcome:conversational.id.startsWith('chat:ollama:')?'success':'fallback',durationMs,
          generatedAt:new Date().toISOString(),
        })
        return {answer:conversational,context,trace:{
          providerId:'ollama:chat-v5.4',mode:'local-orchestration',sendsDataExternally:false,durationMs,writeAuthority:false,
        }}
      }
      const providerResult = await hybridRealTalentAssistantProvider.answer(prompt, snapshot, effectiveContext)
      const answer = providerResult.answer
      if (answer.plan?.kind === 'crm_capabilities' && answer.plan.steps.length) {
        const learningPrompt = learned.correction
          ? `${learned.correction.prompt} | CORREÇÃO: ${prompt}`
          : prompt
        const learningFocusLeadId = effectiveContext.focusLeadId
          ?? (effectiveContext.previousLeadIds?.length === 1 ? effectiveContext.previousLeadIds[0] : null)

        stageSalesRecommendationsFromPlan(workspaceId, learningPrompt, { id: answer.plan.id, steps: answer.plan.steps }, snapshot, learningFocusLeadId)
        linkSalesRecommendationToActionPlan(workspaceId, prompt, { id: answer.plan.id, steps: answer.plan.steps }, snapshot, learningFocusLeadId)
        rememberLearningPlan(workspaceId, learningPrompt, { id: answer.plan.id, steps: answer.plan.steps })
      }
      const durationMs = Math.max(0, Date.now() - started)
      appendRealTalentAiAudit({
        id: `ai:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        workspaceId,
        providerId: providerResult.providerId,
        intent: answer.intent,
        focusLeadId: context.focusLeadId,
        route: context.route,
        toolIds: toolsForAnswer(answer),
        outcome: 'success',
        durationMs,
        generatedAt: new Date().toISOString(),
      })
      return { answer, context, trace: { providerId: providerResult.providerId, mode: providerResult.mode, sendsDataExternally: providerResult.sendsDataExternally, durationMs, writeAuthority: false } }
    } catch (error) {
      const durationMs = Math.max(0, Date.now() - started)
      appendRealTalentAiAudit({ id: `ai:${Date.now()}:error`, workspaceId, providerId: hybridRealTalentAssistantProvider.id, intent: 'error', focusLeadId: context.focusLeadId, route: context.route, toolIds: [], outcome: 'error', durationMs, generatedAt: new Date().toISOString(), note: error instanceof Error ? error.message.slice(0, 180) : 'Falha desconhecida' })
      throw error
    }
  },
}
