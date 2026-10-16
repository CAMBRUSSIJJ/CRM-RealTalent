import type { WorkspaceSnapshot } from '../domain/types'
import {
  buildDealIntelligence,
  type DealActionKind,
  type DealIntelligence,
  type DealNextBestAction,
} from './deal-intelligence'
import {
  analyzeSalesPortfolioLearning,
  type SalesActionPattern,
  type SalesLearningEvidenceStrength,
  type SalesLearningPattern,
  type SalesPortfolioLearningAnalysis,
} from './realtalent-sales-portfolio-learning'

export type SalesRecommendationEvidenceSource = 'risk' | 'stage' | 'profile' | 'global'

export interface SalesRecommendationEvidence {
  source: SalesRecommendationEvidenceSource
  contextLabel: string
  action: DealActionKind
  samples: number
  adjustedSuccessRate: number
  averageHealthDelta: number
  averageProbabilityDelta: number
  strength: SalesLearningEvidenceStrength
  weight: number
}

export interface SalesActionLearningScore {
  action: DealActionKind
  samples: number
  adjustedSuccessRate: number
  learningScore: number
  strength: SalesLearningEvidenceStrength | 'none'
  evidence: SalesRecommendationEvidence[]
}

export interface SalesRecommendation {
  leadId: string
  baseAction: DealNextBestAction
  recommendedAction: DealNextBestAction
  actionChanged: boolean
  actionGuardrailLocked: boolean
  basePriorityScore: number
  learningAdjustment: number
  finalPriorityScore: number
  actionLearning: SalesActionLearningScore
  explanation: string
}

export interface SalesRecommendationOptions {
  visibleLeadIds?: Set<string>
  requestedAction?: DealActionKind
  analysis?: SalesPortfolioLearningAnalysis
}

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const strengthRank: Record<SalesLearningEvidenceStrength | 'none', number> = {
  none: 0,
  insufficient: 1,
  emerging: 2,
  reliable: 3,
}

const actionTemplate: Record<DealActionKind, Omit<DealNextBestAction, 'urgency'>> = {
  call: {
    kind: 'call',
    title: 'Ligar agora',
    explanation: 'O histórico verificado favorece contato por ligação neste contexto.',
    objective: 'Avançar o negócio em conversa direta e registrar o próximo compromisso.',
    route: 'calls',
  },
  followup: {
    kind: 'followup',
    title: 'Fazer follow-up',
    explanation: 'O histórico verificado favorece continuidade por follow-up neste contexto.',
    objective: 'Retomar o contato e obter um próximo passo claro.',
    route: 'leads',
  },
  meeting: {
    kind: 'meeting',
    title: 'Avançar para reunião',
    explanation: 'O histórico verificado favorece reunião neste contexto.',
    objective: 'Concentrar diagnóstico, decisão e próximos passos em uma reunião.',
    route: 'agenda',
  },
  map_stakeholder: {
    kind: 'map_stakeholder',
    title: 'Mapear stakeholder/decisor',
    explanation: 'O histórico verificado favorece ampliar a cobertura da conta neste contexto.',
    objective: 'Identificar influência, decisão e reduzir dependência de um único contato.',
    route: 'leads',
  },
  proposal: {
    kind: 'proposal',
    title: 'Formalizar proposta',
    explanation: 'O histórico verificado favorece formalização de proposta neste contexto.',
    objective: 'Transformar o interesse em escopo, valor e compromisso comercial.',
    route: 'proposals',
  },
  review_proposal: {
    kind: 'review_proposal',
    title: 'Revisar proposta',
    explanation: 'O histórico verificado favorece revisar a proposta antes do próximo avanço.',
    objective: 'Remover dúvidas, bloqueios e alinhar condições comerciais.',
    route: 'proposals',
  },
  update_close_date: {
    kind: 'update_close_date',
    title: 'Revisar previsão de fechamento',
    explanation: 'O histórico verificado favorece corrigir previsão e compromisso de fechamento.',
    objective: 'Alinhar forecast, riscos e data provável de decisão.',
    route: 'pipeline',
  },
  review: {
    kind: 'review',
    title: 'Revisar oportunidade',
    explanation: 'O histórico ainda não justifica substituir os sinais atuais por uma ação mais específica.',
    objective: 'Revalidar contexto, risco e próximo compromisso.',
    route: 'pipeline',
  },
}

const deterministicPriorityScore = (deal: DealIntelligence) => {
  const severity = deal.risks.reduce((sum, risk) => sum + (risk.severity === 'critical' ? 28 : risk.severity === 'high' ? 18 : risk.severity === 'medium' ? 9 : 3), 0)
  const valueBoost = Math.min(24, Math.log10(Math.max(10, deal.commercialValue)) * 5)
  const healthPenalty = (100 - deal.healthScore) * 0.45
  const urgency = deal.nextBestAction.urgency === 'now' ? 24 : deal.nextBestAction.urgency === 'today' ? 12 : 0
  return severity + valueBoost + healthPenalty + urgency
}

const companyForDeal = (deal: DealIntelligence, snapshot: WorkspaceSnapshot) => deal.lead.companyId
  ? snapshot.companies.find((item) => item.id === deal.lead.companyId) ?? null
  : null

const profileLabelsForDeal = (deal: DealIntelligence, snapshot: WorkspaceSnapshot) => {
  const company = companyForDeal(deal, snapshot)
  const labels = [
    company?.segment ? `segmento ${company.segment}` : '',
    deal.lead.source ? `origem ${deal.lead.source}` : '',
    deal.lead.temperature ? `temperatura ${deal.lead.temperature}` : '',
  ]
  return labels.map(normalize).filter(Boolean)
}

const patternEvidence = (
  pattern: SalesLearningPattern | SalesActionPattern,
  source: SalesRecommendationEvidenceSource,
  contextLabel: string,
  action: DealActionKind,
  weight: number,
): SalesRecommendationEvidence => ({
  source,
  contextLabel,
  action,
  samples: pattern.samples,
  adjustedSuccessRate: pattern.adjustedSuccessRate,
  averageHealthDelta: pattern.averageHealthDelta,
  averageProbabilityDelta: pattern.averageProbabilityDelta,
  strength: pattern.strength,
  weight,
})

const bestPattern = (patterns: SalesActionPattern[], action: DealActionKind, contexts: string[]) => {
  const wanted = new Set(contexts.map(normalize))
  return patterns
    .filter((item) => item.action === action && wanted.has(normalize(item.contextLabel)) && item.samples >= 3 && item.strength !== 'insufficient')
    .sort((a, b) => strengthRank[b.strength] - strengthRank[a.strength] || b.samples - a.samples || b.adjustedSuccessRate - a.adjustedSuccessRate)[0] ?? null
}

const globalPattern = (analysis: SalesPortfolioLearningAnalysis, action: DealActionKind) => analysis.actionPatterns
  .filter((item) => item.key === action && item.samples >= 3 && item.strength !== 'insufficient')
  .sort((a, b) => strengthRank[b.strength] - strengthRank[a.strength] || b.samples - a.samples)[0] ?? null

export const scoreSalesActionLearning = (
  deal: DealIntelligence,
  snapshot: WorkspaceSnapshot,
  analysis: SalesPortfolioLearningAnalysis,
  action: DealActionKind,
): SalesActionLearningScore => {
  const evidence: SalesRecommendationEvidence[] = []
  const riskPattern = bestPattern(analysis.riskActionPatterns, action, deal.risks.map((item) => item.key))
  const stagePattern = deal.stage ? bestPattern(analysis.stageActionPatterns, action, [deal.stage.name]) : null
  const profilePattern = bestPattern(analysis.profileActionPatterns, action, profileLabelsForDeal(deal, snapshot))
  const global = globalPattern(analysis, action)

  if (riskPattern) evidence.push(patternEvidence(riskPattern, 'risk', riskPattern.contextLabel, action, 1))
  if (stagePattern) evidence.push(patternEvidence(stagePattern, 'stage', stagePattern.contextLabel, action, 0.8))
  if (profilePattern) evidence.push(patternEvidence(profilePattern, 'profile', profilePattern.contextLabel, action, 0.55))
  if (global) evidence.push(patternEvidence(global, 'global', global.label, action, 0.35))

  if (!evidence.length) return { action, samples: 0, adjustedSuccessRate: 50, learningScore: 0, strength: 'none', evidence: [] }

  const totalWeight = evidence.reduce((sum, item) => sum + item.weight, 0)
  const adjustedSuccessRate = evidence.reduce((sum, item) => sum + item.adjustedSuccessRate * item.weight, 0) / totalWeight
  const deltaSignal = evidence.reduce((sum, item) => sum + (item.averageHealthDelta * 0.25 + item.averageProbabilityDelta * 0.18) * item.weight, 0) / totalWeight
  const strongest = evidence.reduce<SalesLearningEvidenceStrength>((current, item) => strengthRank[item.strength] > strengthRank[current] ? item.strength : current, 'insufficient')
  const strengthFactor = strongest === 'reliable' ? 1 : 0.58
  const sampleFactor = Math.min(1, Math.max(...evidence.map((item) => item.samples)) / 8)
  const learningScore = clamp(((adjustedSuccessRate - 50) / 5 + deltaSignal / 4) * strengthFactor * sampleFactor, -10, 10)

  return {
    action,
    samples: Math.max(...evidence.map((item) => item.samples)),
    adjustedSuccessRate: Number(adjustedSuccessRate.toFixed(1)),
    learningScore: Number(learningScore.toFixed(1)),
    strength: strongest,
    evidence,
  }
}

const actionAllowedByCurrentState = (deal: DealIntelligence, action: DealActionKind) => {
  if (action === deal.nextBestAction.kind || action === 'review' || action === 'followup') return true
  if (action === 'call') return Boolean(deal.lead.phone && !deal.lead.doNotContact)
  if (action === 'meeting') return deal.stakeholderCount > 0 || deal.positiveSignals.some((item) => item.key === 'buying-signal' || item.key === 'meeting')
  if (action === 'map_stakeholder') return deal.stakeholderCount <= 1 || deal.risks.some((item) => item.key === 'missing-decision-maker' || item.key === 'single-threaded')
  if (action === 'proposal') return !deal.proposal && (deal.stage ? /proposta|negocia|decis|fech/i.test(deal.stage.name) : false)
  if (action === 'review_proposal') return Boolean(deal.proposal)
  if (action === 'update_close_date') return deal.risks.some((item) => ['close-overdue', 'close-soon-risk', 'probability-gap'].includes(item.key))
  return false
}

const actionGuardrailLocked = (deal: DealIntelligence) => deal.nextBestAction.urgency === 'now'
  || deal.risks.some((risk) => risk.severity === 'critical' || risk.key === 'overdue-next-step')

const actionOverrideLocked = (deal: DealIntelligence) => actionGuardrailLocked(deal)
  || deal.risks.some((risk) => risk.severity === 'high')

const candidateActions = (deal: DealIntelligence): DealActionKind[] => {
  const actions: DealActionKind[] = ['call', 'followup', 'meeting', 'map_stakeholder', 'proposal', 'review_proposal', 'update_close_date', 'review']
  return actions.filter((action) => actionAllowedByCurrentState(deal, action))
}

const learnedAction = (
  deal: DealIntelligence,
  snapshot: WorkspaceSnapshot,
  analysis: SalesPortfolioLearningAnalysis,
): { action: DealNextBestAction; score: SalesActionLearningScore; changed: boolean } => {
  const base = scoreSalesActionLearning(deal, snapshot, analysis, deal.nextBestAction.kind)
  if (actionOverrideLocked(deal)) return { action: deal.nextBestAction, score: base, changed: false }

  const alternatives = candidateActions(deal)
    .filter((action) => action !== deal.nextBestAction.kind)
    .map((action) => scoreSalesActionLearning(deal, snapshot, analysis, action))
    .filter((item) => item.strength === 'reliable' && item.samples >= 5 && item.adjustedSuccessRate >= 65 && item.evidence.some((evidence) => evidence.source !== 'global'))
    .sort((a, b) => b.learningScore - a.learningScore || b.adjustedSuccessRate - a.adjustedSuccessRate || b.samples - a.samples)

  const best = alternatives[0]
  if (!best) return { action: deal.nextBestAction, score: base, changed: false }

  const baseComparable = base.samples >= 3 ? base.learningScore : 0
  if (best.learningScore < baseComparable + 2.5 || best.adjustedSuccessRate < base.adjustedSuccessRate + (base.samples >= 3 ? 8 : 0)) {
    return { action: deal.nextBestAction, score: base, changed: false }
  }

  const template = actionTemplate[best.action]
  const strongest = best.evidence[0]
  const context = strongest ? ` em ${strongest.contextLabel}` : ''
  return {
    action: {
      ...template,
      explanation: `${template.explanation} Foram ${best.samples} caso(s) comparáveis${context}, com taxa ajustada de ${best.adjustedSuccessRate}%.`,
      urgency: deal.nextBestAction.urgency === 'today' ? 'today' : 'planned',
    },
    score: best,
    changed: true,
  }
}

export const buildSalesRecommendationFromAnalysis = (
  deal: DealIntelligence,
  snapshot: WorkspaceSnapshot,
  analysis: SalesPortfolioLearningAnalysis,
  options: Pick<SalesRecommendationOptions, 'requestedAction'> = {},
): SalesRecommendation => {
  const learned = learnedAction(deal, snapshot, analysis)
  const scoredAction = options.requestedAction ?? learned.action.kind
  const actionLearning = scoreSalesActionLearning(deal, snapshot, analysis, scoredAction)
  const locked = actionGuardrailLocked(deal)
  let learningAdjustment = Math.round(actionLearning.learningScore)
  if (locked && learningAdjustment < 0) learningAdjustment = 0
  learningAdjustment = clamp(learningAdjustment, -10, 10)
  const basePriorityScore = deterministicPriorityScore(deal)
  const finalPriorityScore = basePriorityScore + learningAdjustment
  const explanation = actionLearning.samples >= 3
    ? `Aprendizado verificado: ${actionLearning.samples} caso(s) comparáveis, taxa ajustada ${actionLearning.adjustedSuccessRate}%, impacto de ${learningAdjustment >= 0 ? '+' : ''}${learningAdjustment} no ranking.`
    : 'Sem amostra histórica suficiente: ranking permanece essencialmente determinístico.'

  return {
    leadId: deal.lead.id,
    baseAction: deal.nextBestAction,
    recommendedAction: learned.action,
    actionChanged: learned.changed,
    actionGuardrailLocked: locked,
    basePriorityScore: Number(basePriorityScore.toFixed(1)),
    learningAdjustment,
    finalPriorityScore: Number(finalPriorityScore.toFixed(1)),
    actionLearning,
    explanation,
  }
}

export const buildSalesRecommendation = (
  deal: DealIntelligence,
  snapshot: WorkspaceSnapshot,
  options: SalesRecommendationOptions = {},
): SalesRecommendation => {
  const analysis = options.analysis ?? analyzeSalesPortfolioLearning(snapshot.workspace.id, snapshot, {
    visibleLeadIds: options.visibleLeadIds,
    minSamples: 3,
    limit: 20,
  })
  return buildSalesRecommendationFromAnalysis(deal, snapshot, analysis, options)
}

export const rankDealsWithSalesLearning = (
  deals: DealIntelligence[],
  snapshot: WorkspaceSnapshot,
  options: SalesRecommendationOptions = {},
) => {
  const analysis = options.analysis ?? analyzeSalesPortfolioLearning(snapshot.workspace.id, snapshot, {
    visibleLeadIds: options.visibleLeadIds,
    minSamples: 3,
    limit: 20,
  })
  return deals
    .map((deal) => ({ deal, recommendation: buildSalesRecommendationFromAnalysis(deal, snapshot, analysis, options) }))
    .sort((a, b) => b.recommendation.finalPriorityScore - a.recommendation.finalPriorityScore || b.deal.commercialValue - a.deal.commercialValue)
}

export const salesLearningAdjustmentForLead = (
  leadId: string,
  snapshot: WorkspaceSnapshot,
  options: SalesRecommendationOptions = {},
) => {
  const lead = snapshot.leads.find((item) => item.id === leadId)
  if (!lead || lead.status !== 'active') return { adjustment: 0, explanation: '', recommendation: null as SalesRecommendation | null }
  const deal = buildDealIntelligence(lead, snapshot)
  const recommendation = buildSalesRecommendation(deal, snapshot, options)
  return {
    adjustment: recommendation.learningAdjustment,
    explanation: recommendation.actionLearning.samples >= 3 ? recommendation.explanation : '',
    recommendation,
  }
}
