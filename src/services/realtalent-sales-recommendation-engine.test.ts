import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STAGES,
  DEMO_ACTIVITIES,
  DEMO_AUTOMATION_RULES,
  DEMO_AUTOMATION_RUNS,
  DEMO_CALLS,
  DEMO_COMPANIES,
  DEMO_CONTACT_RELATIONSHIPS,
  DEMO_CONTACTS,
  DEMO_EVENTS,
  DEMO_GOALS,
  DEMO_LEADS,
  DEMO_OPPORTUNITIES,
  DEMO_PLAYBOOKS,
  DEMO_PRODUCTS,
  DEMO_PROPOSALS,
  DEMO_REVENUE_ENTRIES,
  DEMO_SOCIAL_PROFILES,
  DEMO_WORKSPACE,
} from '../domain/defaults'
import type { WorkspaceSnapshot } from '../domain/types'
import { buildDealIntelligence, type DealIntelligence } from './deal-intelligence'
import type { SalesLearningOutcome } from './realtalent-sales-learning-engine'
import { analyzeSalesPortfolioOutcomes } from './realtalent-sales-portfolio-learning'
import {
  buildSalesRecommendationFromAnalysis,
  rankDealsWithSalesLearning,
  scoreSalesActionLearning,
} from './realtalent-sales-recommendation-engine'

const snapshot: WorkspaceSnapshot = {
  workspace: DEMO_WORKSPACE,
  stages: DEFAULT_STAGES,
  leads: DEMO_LEADS,
  activities: DEMO_ACTIVITIES,
  calls: DEMO_CALLS,
  events: DEMO_EVENTS,
  playbooks: DEMO_PLAYBOOKS,
  goals: DEMO_GOALS,
  automationRules: DEMO_AUTOMATION_RULES,
  automationRuns: DEMO_AUTOMATION_RUNS,
  companies: DEMO_COMPANIES,
  contacts: DEMO_CONTACTS,
  contactRelationships: DEMO_CONTACT_RELATIONSHIPS,
  opportunities: DEMO_OPPORTUNITIES,
  socialProfiles: DEMO_SOCIAL_PROFILES,
  products: DEMO_PRODUCTS,
  proposals: DEMO_PROPOSALS,
  revenueEntries: DEMO_REVENUE_ENTRIES,
}

const makeOutcome = (
  id: string,
  leadId: string,
  action: SalesLearningOutcome['recommendedAction'],
  outcome: 'positive' | 'negative',
  stageName: string,
  riskKeys: string[] = [],
): SalesLearningOutcome => ({
  id,
  workspaceId: DEMO_WORKSPACE.id,
  recommendationId: `rec:${id}`,
  leadId,
  recommendationCapabilityId: 'sales.next_best_action',
  recommendedAction: action,
  riskKeys,
  healthLevel: 'healthy',
  momentum: 'stable',
  stageName,
  outcome,
  outcomeScore: outcome === 'positive' ? 45 : -35,
  healthDelta: outcome === 'positive' ? 11 : -9,
  probabilityDelta: outcome === 'positive' ? 10 : -8,
  momentumDelta: outcome === 'positive' ? 1 : -1,
  stageDelta: outcome === 'positive' ? 1 : 0,
  executedCapabilities: action === 'call' ? ['calls.log_outcome'] : ['activities.create_followup'],
  evidence: outcome === 'positive' ? ['oportunidade avançou de etapa'] : ['Deal Health caiu'],
  receiptId: `receipt:${id}`,
  createdAt: '2026-10-16T12:00:00.000Z',
})

const neutralDeal = (leadIndex = 3): DealIntelligence => {
  const base = buildDealIntelligence(DEMO_LEADS[leadIndex], snapshot, undefined, new Date('2026-07-16T15:00:00.000Z'))
  return {
    ...base,
    risks: [],
    nextBestAction: {
      kind: 'review',
      title: 'Revisar oportunidade',
      explanation: 'Sem urgência determinística protegida.',
      objective: 'Revalidar próximo passo.',
      route: 'pipeline',
      urgency: 'planned',
    },
  }
}

describe('RealTalent Sales Recommendation Engine V2', () => {
  it('não usa amostra insuficiente para alterar ranking', () => {
    const deal = neutralDeal()
    const stage = deal.stage?.name ?? 'Novo lead'
    const outcomes = [
      makeOutcome('1', deal.lead.id, 'call', 'positive', stage),
      makeOutcome('2', deal.lead.id, 'call', 'positive', stage),
    ]
    const analysis = analyzeSalesPortfolioOutcomes(outcomes, snapshot)
    const scored = scoreSalesActionLearning(deal, snapshot, analysis, 'call')
    const recommendation = buildSalesRecommendationFromAnalysis(deal, snapshot, analysis, { requestedAction: 'call' })

    expect(scored.strength).toBe('none')
    expect(scored.learningScore).toBe(0)
    expect(recommendation.learningAdjustment).toBe(0)
    expect(recommendation.actionChanged).toBe(false)
  })

  it('permite que evidência confiável mude uma ação genérica quando não há risco protegido', () => {
    const deal = neutralDeal()
    const stage = deal.stage?.name ?? 'Novo lead'
    const outcomes = Array.from({ length: 6 }, (_, index) => makeOutcome(`p${index}`, deal.lead.id, 'call', 'positive', stage))
    const analysis = analyzeSalesPortfolioOutcomes(outcomes, snapshot)
    const recommendation = buildSalesRecommendationFromAnalysis(deal, snapshot, analysis)

    expect(recommendation.actionChanged).toBe(true)
    expect(recommendation.recommendedAction.kind).toBe('call')
    expect(recommendation.actionLearning.strength).toBe('reliable')
    expect(recommendation.learningAdjustment).toBeGreaterThan(0)
  })

  it('não troca a ação quando Deal Health aponta urgência ou risco crítico', () => {
    const base = neutralDeal()
    const locked: DealIntelligence = {
      ...base,
      risks: [{
        key: 'overdue-next-step',
        severity: 'critical',
        title: 'Próxima ação vencida',
        detail: 'Compromisso vencido.',
        impact: 24,
        suggestedAction: 'Executar contato agora',
        source: 'activity',
      }],
      nextBestAction: {
        kind: 'call',
        title: 'Executar contato planejado',
        explanation: 'A próxima ação venceu.',
        objective: 'Cumprir o compromisso.',
        route: 'calls',
        urgency: 'now',
      },
    }
    const stage = locked.stage?.name ?? 'Novo lead'
    const outcomes = [
      ...Array.from({ length: 6 }, (_, index) => makeOutcome(`f${index}`, locked.lead.id, 'followup', 'positive', stage, ['overdue-next-step'])),
      ...Array.from({ length: 5 }, (_, index) => makeOutcome(`c${index}`, locked.lead.id, 'call', 'negative', stage, ['overdue-next-step'])),
    ]
    const analysis = analyzeSalesPortfolioOutcomes(outcomes, snapshot)
    const recommendation = buildSalesRecommendationFromAnalysis(locked, snapshot, analysis)

    expect(recommendation.actionGuardrailLocked).toBe(true)
    expect(recommendation.actionChanged).toBe(false)
    expect(recommendation.recommendedAction.kind).toBe('call')
    expect(recommendation.learningAdjustment).toBeGreaterThanOrEqual(0)
  })

  it('reordena negócios usando ajuste pequeno sem apagar o score determinístico', () => {
    const first = neutralDeal(2)
    const second = neutralDeal(3)
    const stage = second.stage?.name ?? 'Novo lead'
    const outcomes = Array.from({ length: 6 }, (_, index) => makeOutcome(`r${index}`, second.lead.id, 'call', 'positive', stage))
    const analysis = analyzeSalesPortfolioOutcomes(outcomes, snapshot, { visibleLeadIds: new Set([second.lead.id]) })
    const ranked = rankDealsWithSalesLearning([first, second], snapshot, {
      analysis,
      requestedAction: 'call',
    })

    for (const item of ranked) {
      expect(Math.abs(item.recommendation.learningAdjustment)).toBeLessThanOrEqual(10)
      expect(item.recommendation.finalPriorityScore).toBeCloseTo(item.recommendation.basePriorityScore + item.recommendation.learningAdjustment, 1)
    }
  })
})
