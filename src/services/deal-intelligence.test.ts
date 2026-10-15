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
import { buildDealIntelligence, buildDealPortfolio, DEFAULT_DEAL_INTELLIGENCE_CONFIG } from './deal-intelligence'

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

const now = new Date('2026-07-16T15:00:00.000Z')

describe('deal intelligence', () => {
  it('calcula Deal Health explicável com seis componentes', () => {
    const lead = DEMO_LEADS.find((item) => item.id === 'lead-alpha')!
    const insight = buildDealIntelligence(lead, snapshot, DEFAULT_DEAL_INTELLIGENCE_CONFIG, now)
    expect(insight.components).toHaveLength(6)
    expect(insight.healthScore).toBeGreaterThanOrEqual(0)
    expect(insight.healthScore).toBeLessThanOrEqual(100)
    expect(insight.realTalentProbability).toBeGreaterThanOrEqual(0)
    expect(insight.realTalentProbability).toBeLessThanOrEqual(100)
    expect(insight.nextBestAction.title.length).toBeGreaterThan(0)
  })

  it('detecta cobertura de decisão insuficiente quando o negócio relevante avança sem decisor', () => {
    const lead = { ...DEMO_LEADS.find((item) => item.id === 'lead-bronx')!, value: 12_000, stageId: 'stage-negotiation' }
    const custom: WorkspaceSnapshot = { ...snapshot, leads: snapshot.leads.map((item) => item.id === lead.id ? lead : item) }
    const insight = buildDealIntelligence(lead, custom, DEFAULT_DEAL_INTELLIGENCE_CONFIG, now)
    expect(insight.risks.some((risk) => risk.key === 'missing-decision-maker')).toBe(true)
    expect(insight.nextBestAction.kind).toBe('map_stakeholder')
  })

  it('detecta próxima ação vencida como risco crítico', () => {
    const source = DEMO_LEADS.find((item) => item.id === 'lead-diamond')!
    const lead = { ...source, nextActionAt: '2026-07-14T12:00:00.000Z' }
    const custom: WorkspaceSnapshot = { ...snapshot, leads: snapshot.leads.map((item) => item.id === lead.id ? lead : item) }
    const insight = buildDealIntelligence(lead, custom, DEFAULT_DEAL_INTELLIGENCE_CONFIG, now)
    expect(insight.risks.find((risk) => risk.key === 'overdue-next-step')?.severity).toBe('critical')
    expect(insight.nextBestAction.urgency).toBe('now')
  })

  it('considera horário vencido no mesmo dia, não apenas diferença inteira em dias', () => {
    const source = DEMO_LEADS.find((item) => item.id === 'lead-diamond')!
    const lead = { ...source, nextActionAt: '2026-07-16T12:00:00.000Z' }
    const custom: WorkspaceSnapshot = { ...snapshot, leads: snapshot.leads.map((item) => item.id === lead.id ? lead : item) }
    const insight = buildDealIntelligence(lead, custom, DEFAULT_DEAL_INTELLIGENCE_CONFIG, now)
    expect(insight.risks.some((risk) => risk.key === 'overdue-next-step')).toBe(true)
    expect(insight.components.find((component) => component.key === 'nextStep')?.score).toBe(0)
  })

  it('resume a carteira e ordena prioridades', () => {
    const portfolio = buildDealPortfolio(snapshot, DEFAULT_DEAL_INTELLIGENCE_CONFIG, now)
    expect(portfolio.deals.length).toBe(DEMO_LEADS.filter((lead) => lead.status === 'active').length)
    expect(portfolio.priorities.length).toBe(portfolio.deals.length)
    expect(portfolio.activeValue).toBeGreaterThan(0)
    expect(portfolio.predictedValue).toBeGreaterThanOrEqual(0)
    expect(portfolio.averageHealth).toBeGreaterThanOrEqual(0)
  })
})
