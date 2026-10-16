import type { Lead, WorkspaceSnapshot } from '../domain/types'
import { buildDealIntelligence, buildDealPortfolio, type DealHealthLevel, type DealIntelligence, type DealMomentum, type DealRiskSeverity } from './deal-intelligence'
import { buildSalesRecommendation } from './realtalent-sales-recommendation-engine'

export interface SalesAgentContext {
  entity: {
    id: string
    name: string
    company: string | null
    status: Lead['status']
    priority: Lead['priority']
    temperature: Lead['temperature']
  }
  commercial: {
    stage: { id: string; name: string; probability: number } | null
    opportunityId: string | null
    proposal: { id: string; title: string; status: string } | null
    value: number
    expectedCloseAt: string | null
    lastInteractionAt: string | null
    inactivityDays: number | null
    stakeholderCount: number
  }
  health: {
    score: number
    level: DealHealthLevel
    label: string
    momentum: DealMomentum
    momentumScore: number
    sellerProbability: number
    realTalentProbability: number
    probabilityGap: number
    accountCoverage: number
    relationshipScore: number
  }
  risks: Array<{
    key: string
    severity: DealRiskSeverity
    title: string
    detail: string
    suggestedAction: string
  }>
  positiveSignals: Array<{
    key: string
    label: string
    detail: string
  }>
  nextBestAction: {
    kind: string
    title: string
    explanation: string
    objective: string
    route: string
    urgency: 'now' | 'today' | 'planned'
  }
  learning: {
    adjustment: number
    samples: number
    adjustedSuccessRate: number
    strength: string
    actionChanged: boolean
    guardrailLocked: boolean
    explanation: string
  }
  generatedAt: string
}

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
const date = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'não definida'
const severityLabel: Record<DealRiskSeverity, string> = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo' }
const momentumLabel: Record<DealMomentum, string> = { accelerating: 'acelerando', stable: 'estável', cooling: 'esfriando' }
const urgencyLabel = { now: 'agora', today: 'hoje', planned: 'planejada' } as const

const visibleLeadIdsForRecommendation = (lead: Lead, snapshot: WorkspaceSnapshot) => {
  if (snapshot.workspace.role === 'owner' || snapshot.workspace.role === 'admin') return new Set(snapshot.leads.map((item) => item.id))
  return new Set(snapshot.leads.filter((item) => item.ownerId === lead.ownerId).map((item) => item.id))
}

export const buildSalesAgentContext = (lead: Lead, snapshot: WorkspaceSnapshot, now = new Date()): SalesAgentContext => {
  const insight = buildDealIntelligence(lead, snapshot, undefined, now)
  const recommendation = buildSalesRecommendation(insight, snapshot, {
    visibleLeadIds: visibleLeadIdsForRecommendation(lead, snapshot),
  })
  return {
    entity: {
      id: lead.id,
      name: lead.name,
      company: lead.company || null,
      status: lead.status,
      priority: lead.priority,
      temperature: lead.temperature,
    },
    commercial: {
      stage: insight.stage ? { id: insight.stage.id, name: insight.stage.name, probability: insight.stage.probability } : null,
      opportunityId: insight.opportunity?.id ?? null,
      proposal: insight.proposal ? { id: insight.proposal.id, title: insight.proposal.title, status: insight.proposal.status } : null,
      value: insight.commercialValue,
      expectedCloseAt: insight.expectedCloseAt,
      lastInteractionAt: insight.lastInteractionAt,
      inactivityDays: insight.inactivityDays,
      stakeholderCount: insight.stakeholderCount,
    },
    health: {
      score: insight.healthScore,
      level: insight.healthLevel,
      label: insight.healthLabel,
      momentum: insight.momentum,
      momentumScore: insight.momentumScore,
      sellerProbability: insight.sellerProbability,
      realTalentProbability: insight.realTalentProbability,
      probabilityGap: insight.probabilityGap,
      accountCoverage: insight.accountCoverage,
      relationshipScore: insight.relationshipScore,
    },
    risks: insight.risks.slice(0, 8).map((risk) => ({
      key: risk.key,
      severity: risk.severity,
      title: risk.title,
      detail: risk.detail,
      suggestedAction: risk.suggestedAction,
    })),
    positiveSignals: insight.positiveSignals.slice(0, 8).map((signal) => ({
      key: signal.key,
      label: signal.label,
      detail: signal.detail,
    })),
    nextBestAction: { ...recommendation.recommendedAction },
    learning: {
      adjustment: recommendation.learningAdjustment,
      samples: recommendation.actionLearning.samples,
      adjustedSuccessRate: recommendation.actionLearning.adjustedSuccessRate,
      strength: recommendation.actionLearning.strength,
      actionChanged: recommendation.actionChanged,
      guardrailLocked: recommendation.actionGuardrailLocked,
      explanation: recommendation.explanation,
    },
    generatedAt: insight.generatedAt,
  }
}

const entityLabel = (context: SalesAgentContext) => context.entity.company && context.entity.company !== context.entity.name
  ? `${context.entity.name} · ${context.entity.company}`
  : context.entity.name

const riskText = (context: SalesAgentContext, limit = 3) => context.risks.length
  ? context.risks.slice(0, limit).map((risk) => `${severityLabel[risk.severity]}: ${risk.title} — ${risk.detail}`).join(' | ')
  : 'Nenhum risco comercial relevante detectado.'

const signalText = (context: SalesAgentContext, limit = 3) => context.positiveSignals.length
  ? context.positiveSignals.slice(0, limit).map((signal) => `${signal.label} — ${signal.detail}`).join(' | ')
  : 'Ainda há poucos sinais positivos registrados.'

const learningText = (context: SalesAgentContext) => context.learning.samples >= 3
  ? `Aprendizado da carteira: ${context.learning.samples} caso(s) comparáveis, taxa ajustada ${context.learning.adjustedSuccessRate}%, ajuste ${context.learning.adjustment >= 0 ? '+' : ''}${context.learning.adjustment}. ${context.learning.actionChanged ? 'O histórico confiável alterou a ação sugerida dentro dos guardrails atuais.' : 'O histórico reforçou ou reduziu a confiança sem substituir os sinais atuais.'}`
  : 'Aprendizado da carteira: amostra ainda insuficiente; a recomendação permanece determinística.'

export const formatSalesAgentDealAnalysis = (lead: Lead, snapshot: WorkspaceSnapshot, now = new Date()) => {
  const context = buildSalesAgentContext(lead, snapshot, now)
  const inactivity = context.commercial.inactivityDays === null ? 'sem interação concluída registrada' : `última interação há ${context.commercial.inactivityDays} dia(s)`
  const stage = context.commercial.stage?.name ?? 'sem etapa definida'
  return [
    `Análise comercial de ${entityLabel(context)}.`,
    `Saúde: ${context.health.score}/100 (${context.health.label}); momentum ${momentumLabel[context.health.momentum]} (${context.health.momentumScore}/100).`,
    `Contexto: etapa ${stage}; valor ${money(context.commercial.value)}; ${inactivity}; fechamento ${date(context.commercial.expectedCloseAt)}; ${context.commercial.stakeholderCount} stakeholder(s).`,
    `Probabilidade: vendedor ${context.health.sellerProbability}% × RealTalent ${context.health.realTalentProbability}% (gap ${context.health.probabilityGap >= 0 ? '+' : ''}${context.health.probabilityGap} p.p.).`,
    `Cobertura da conta: ${context.health.accountCoverage}/100; relacionamento ${context.health.relationshipScore}/100.`,
    `Riscos principais: ${riskText(context)}.`,
    `Sinais positivos: ${signalText(context)}.`,
    `Próxima melhor ação: ${context.nextBestAction.title} (${urgencyLabel[context.nextBestAction.urgency]}). ${context.nextBestAction.explanation} Objetivo: ${context.nextBestAction.objective}`,
    learningText(context),
  ].join('\n')
}

export const formatSalesAgentNextBestAction = (lead: Lead, snapshot: WorkspaceSnapshot, now = new Date()) => {
  const context = buildSalesAgentContext(lead, snapshot, now)
  return [
    `Próxima melhor ação para ${entityLabel(context)}: ${context.nextBestAction.title}.`,
    `Urgência: ${urgencyLabel[context.nextBestAction.urgency]}.`,
    `Por quê: ${context.nextBestAction.explanation}`,
    `Objetivo: ${context.nextBestAction.objective}`,
    `Contexto de decisão: saúde ${context.health.score}/100 (${context.health.label}), momentum ${momentumLabel[context.health.momentum]}, probabilidade RealTalent ${context.health.realTalentProbability}%.`,
    `Riscos que sustentam a recomendação: ${riskText(context, 4)}.`,
    learningText(context),
  ].join('\n')
}


export type SalesPortfolioFocus = 'priorities' | 'calls' | 'risk' | 'cooling' | 'decision_maker' | 'closing_risk'

const sameMonth = (value: string | null, now: Date) => {
  if (!value) return false
  const candidate = new Date(value)
  return Number.isFinite(candidate.getTime()) && candidate.getUTCFullYear() === now.getUTCFullYear() && candidate.getUTCMonth() === now.getUTCMonth()
}

const closingRisk = (deal: DealIntelligence, now: Date) => sameMonth(deal.expectedCloseAt, now) && (
  deal.healthLevel === 'attention' ||
  deal.healthLevel === 'critical' ||
  deal.momentum === 'cooling' ||
  deal.realTalentProbability < 50 ||
  deal.probabilityGap <= -15
)

const dealPortfolioLine = (deal: DealIntelligence, index: number) => {
  const label = deal.lead.company || deal.lead.name
  const risks = deal.risks.slice(0, 2).map((risk) => risk.title).join(', ') || 'sem risco crítico explícito'
  return `${index + 1}. ${label} — saúde ${deal.healthScore}/100 (${deal.healthLabel}), ${money(deal.commercialValue)}, probabilidade RealTalent ${deal.realTalentProbability}%, momentum ${momentumLabel[deal.momentum]}. Riscos: ${risks}. Próxima ação: ${deal.nextBestAction.title} (${urgencyLabel[deal.nextBestAction.urgency]}).`
}

export const buildSalesPortfolioSelection = (snapshot: WorkspaceSnapshot, focus: SalesPortfolioFocus = 'priorities', now = new Date()) => {
  const portfolio = buildDealPortfolio(snapshot, undefined, now)
  const ordered = portfolio.priorities
  const deals = focus === 'calls'
    ? ordered.filter((deal) => deal.nextBestAction.kind === 'call' && deal.nextBestAction.urgency !== 'planned')
    : focus === 'risk'
    ? ordered.filter((deal) => deal.healthLevel === 'attention' || deal.healthLevel === 'critical')
    : focus === 'cooling'
      ? ordered.filter((deal) => deal.momentum === 'cooling')
      : focus === 'decision_maker'
        ? ordered.filter((deal) => deal.risks.some((risk) => risk.key === 'missing-decision-maker'))
        : focus === 'closing_risk'
          ? ordered.filter((deal) => closingRisk(deal, now))
          : ordered
  return { portfolio, deals }
}

export const formatSalesPortfolio = (snapshot: WorkspaceSnapshot, focus: SalesPortfolioFocus = 'priorities', now = new Date(), limit = 7) => {
  const { portfolio, deals } = buildSalesPortfolioSelection(snapshot, focus, now)
  const title = focus === 'calls'
    ? 'Prioridades de ligação para hoje'
    : focus === 'risk'
    ? 'Negócios em risco'
    : focus === 'cooling'
      ? 'Oportunidades esfriando'
      : focus === 'decision_maker'
        ? 'Negócios sem decisor mapeado'
        : focus === 'closing_risk'
          ? 'Fechamentos do mês sob risco'
          : 'Prioridades comerciais da carteira'
  const visible = deals.slice(0, Math.max(1, Math.min(limit, 10)))
  const header = `${title}. Carteira ativa: ${portfolio.deals.length} negócio(s), saúde média ${portfolio.averageHealth}/100, valor ativo ${money(portfolio.activeValue)}, valor previsto ${money(portfolio.predictedValue)}.`
  const riskSummary = `Risco da carteira: ${portfolio.critical} crítico(s), ${portfolio.attention} em atenção, ${portfolio.cooling} esfriando, ${portfolio.missingDecisionMaker} sem decisor e ${money(portfolio.atRiskValue)} em valor sob risco.`
  if (!visible.length) return `${header}\n${riskSummary}\nNenhum negócio corresponde a esse recorte com os dados atuais do CRM.`
  return [header, riskSummary, ...visible.map(dealPortfolioLine)].join('\n')
}
