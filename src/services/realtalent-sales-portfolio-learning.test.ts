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
import type { SalesLearningOutcome } from './realtalent-sales-learning-engine'
import { analyzeSalesPortfolioOutcomes } from './realtalent-sales-portfolio-learning'

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

const leadIds = DEMO_LEADS.slice(0, 3).map((item) => item.id)

const makeOutcome = (
  id: string,
  leadId: string,
  action: SalesLearningOutcome['recommendedAction'],
  outcome: SalesLearningOutcome['outcome'],
  stageName = 'Proposta',
  riskKeys = ['stale'],
  score = outcome === 'positive' ? 40 : -35,
): SalesLearningOutcome => ({
  id,
  workspaceId: DEMO_WORKSPACE.id,
  recommendationId: `rec:${id}`,
  leadId,
  recommendationCapabilityId: 'sales.next_best_action',
  recommendedAction: action,
  riskKeys,
  healthLevel: 'attention',
  momentum: 'stable',
  stageName,
  outcome,
  outcomeScore: score,
  healthDelta: outcome === 'positive' ? 12 : -10,
  probabilityDelta: outcome === 'positive' ? 9 : -8,
  momentumDelta: outcome === 'positive' ? 1 : -1,
  stageDelta: outcome === 'positive' ? 1 : 0,
  executedCapabilities: action === 'call' ? ['calls.log_outcome'] : ['activities.create_followup'],
  evidence: outcome === 'positive' ? ['oportunidade avançou de etapa'] : ['Deal Health caiu 10 ponto(s)'],
  receiptId: `receipt:${id}`,
  createdAt: `2026-10-${String(10 + Number(id.replace(/\D/g, '') || 0)).padStart(2, '0')}T12:00:00.000Z`,
})

describe('RealTalent Sales Portfolio Learning', () => {
  it('agrega ações e só trata amostras maiores como evidência confiável', () => {
    const outcomes: SalesLearningOutcome[] = [
      makeOutcome('1', leadIds[0], 'followup', 'positive'),
      makeOutcome('2', leadIds[0], 'followup', 'positive'),
      makeOutcome('3', leadIds[1], 'followup', 'positive'),
      makeOutcome('4', leadIds[1], 'followup', 'negative'),
      makeOutcome('5', leadIds[2], 'followup', 'positive'),
      makeOutcome('6', leadIds[2], 'call', 'positive'),
      makeOutcome('7', leadIds[2], 'call', 'negative'),
    ]

    const analysis = analyzeSalesPortfolioOutcomes(outcomes, snapshot)
    const followup = analysis.actionPatterns.find((item) => item.key === 'followup')!
    const call = analysis.actionPatterns.find((item) => item.key === 'call')!

    expect(followup.samples).toBe(5)
    expect(followup.positive).toBe(4)
    expect(followup.successRate).toBe(80)
    expect(followup.strength).toBe('reliable')
    expect(call.samples).toBe(2)
    expect(call.strength).toBe('insufficient')
  })

  it('respeita visibleLeadIds e não usa resultados de negócios fora do escopo', () => {
    const outcomes: SalesLearningOutcome[] = [
      makeOutcome('1', leadIds[0], 'followup', 'positive'),
      makeOutcome('2', leadIds[1], 'call', 'positive'),
      makeOutcome('3', leadIds[1], 'call', 'positive'),
    ]

    const analysis = analyzeSalesPortfolioOutcomes(outcomes, snapshot, { visibleLeadIds: new Set([leadIds[0]]) })

    expect(analysis.samples).toBe(1)
    expect(analysis.actionPatterns).toHaveLength(1)
    expect(analysis.actionPatterns[0].key).toBe('followup')
  })

  it('ignora correções como evidência positiva ou negativa', () => {
    const corrected = { ...makeOutcome('9', leadIds[0], 'call', 'positive'), outcome: 'corrected' as const, correction: 'não foi isso' }
    const analysis = analyzeSalesPortfolioOutcomes([
      makeOutcome('1', leadIds[0], 'followup', 'positive'),
      corrected,
    ], snapshot)

    expect(analysis.samples).toBe(1)
    expect(analysis.correctedIgnored).toBe(1)
    expect(analysis.actionPatterns.some((item) => item.key === 'call')).toBe(false)
  })

  it('permite comparar ações dentro de uma etapa específica', () => {
    const outcomes: SalesLearningOutcome[] = [
      makeOutcome('1', leadIds[0], 'followup', 'positive', 'Proposta'),
      makeOutcome('2', leadIds[1], 'followup', 'positive', 'Proposta'),
      makeOutcome('3', leadIds[2], 'followup', 'positive', 'Proposta'),
      makeOutcome('4', leadIds[0], 'call', 'negative', 'Proposta'),
      makeOutcome('5', leadIds[1], 'call', 'positive', 'Qualificação'),
    ]

    const analysis = analyzeSalesPortfolioOutcomes(outcomes, snapshot, { stageQuery: 'Proposta' })

    expect(analysis.samples).toBe(4)
    expect(analysis.actionPatterns[0].key).toBe('followup')
    expect(analysis.stageActionPatterns.some((item) => item.contextLabel === 'Qualificação')).toBe(false)
  })

  it('cruza risco com ação sem copiar nomes ou identificadores do cliente para o padrão', () => {
    const outcomes: SalesLearningOutcome[] = [
      makeOutcome('1', leadIds[0], 'map_stakeholder', 'positive', 'Negociação', ['missing-decision-maker']),
      makeOutcome('2', leadIds[1], 'map_stakeholder', 'positive', 'Negociação', ['missing-decision-maker']),
      makeOutcome('3', leadIds[2], 'map_stakeholder', 'positive', 'Negociação', ['missing-decision-maker']),
    ]

    const analysis = analyzeSalesPortfolioOutcomes(outcomes, snapshot, { riskQuery: 'missing-decision-maker' })
    const pattern = analysis.riskActionPatterns[0]

    expect(pattern.action).toBe('map_stakeholder')
    expect(pattern.contextLabel).toBe('missing-decision-maker')
    for (const lead of DEMO_LEADS) {
      expect(JSON.stringify(pattern)).not.toContain(lead.name)
      if (lead.company) expect(JSON.stringify(pattern)).not.toContain(lead.company)
    }
  })
})
