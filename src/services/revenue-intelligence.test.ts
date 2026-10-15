import { describe, expect, it } from 'vitest'
import { DEMO_GOALS, DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PROPOSALS, DEMO_REVENUE_ENTRIES, DEMO_WORKSPACE, DEFAULT_STAGES, DEMO_ACTIVITIES, DEMO_CALLS, DEMO_EVENTS, DEMO_PLAYBOOKS, DEMO_AUTOMATION_RULES, DEMO_AUTOMATION_RUNS, DEMO_COMPANIES, DEMO_CONTACTS, DEMO_CONTACT_RELATIONSHIPS, DEMO_SOCIAL_PROFILES, DEMO_PRODUCTS } from '../domain/defaults'
import type { WorkspaceSnapshot } from '../domain/types'
import { calculateRevenueIntelligence, suggestedRevenueCategory } from './revenue-intelligence'
import { buildDealIntelligence } from './deal-intelligence'

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
  buyerRooms: [],
  revenueEntries: DEMO_REVENUE_ENTRIES,
}

describe('Revenue Intelligence', () => {
  it('mantém cenários ordenados sem ultrapassar o pipeline total', () => {
    const reference = new Date('2026-07-16T15:00:00.000Z')
    const result = calculateRevenueIntelligence(snapshot, reference)
    expect(result.commitForecast).toBeLessThanOrEqual(result.fullPipelineForecast)
    expect(result.bestCaseForecast).toBeLessThanOrEqual(result.fullPipelineForecast)
    expect(result.bestCaseForecast).toBeGreaterThanOrEqual(result.realTalentForecast)
    expect(result.realTalentForecast).toBeGreaterThanOrEqual(result.closedBookings)
    expect(result.scenarios).toHaveLength(4)
  })

  it('calcula contribuição esperada com probabilidade RealTalent', () => {
    const reference = new Date('2026-07-16T15:00:00.000Z')
    const result = calculateRevenueIntelligence(snapshot, reference)
    result.deals.forEach((deal) => expect(deal.expectedContribution).toBeCloseTo(deal.value * deal.realTalentProbability / 100, 4))
  })

  it('não promove negócio fraco diretamente para commit', () => {
    const lead = snapshot.leads.find((item) => item.status === 'active')!
    const deal = buildDealIntelligence(lead, snapshot, undefined, new Date('2026-07-16T15:00:00.000Z'))
    const category = suggestedRevenueCategory({ ...deal, healthScore: 20, realTalentProbability: 30, momentum: 'cooling' })
    expect(category).toBe('pipeline')
  })

  it('separa receita prevista cadastrada de receita reconhecida', () => {
    const reference = new Date('2026-07-16T12:00:00')
    const lead = snapshot.leads[0]
    const custom = {
      ...snapshot,
      revenueEntries: [
        ...snapshot.revenueEntries,
        { id: 'ri-recognized', workspaceId: snapshot.workspace.id, proposalId: null, leadId: lead.id, opportunityId: null, revenueType: 'one_time' as const, status: 'recognized' as const, amount: 1200, recurringMonthlyAmount: 0, recognizedAt: '2026-07-10T12:00:00.000Z', competenceDate: '2026-07-10', servicePeriodStart: null, servicePeriodEnd: null, adjustmentReason: '', description: 'Reconhecida teste', ownerId: lead.ownerId, createdAt: '2026-07-10T12:00:00.000Z', updatedAt: '2026-07-10T12:00:00.000Z' },
        { id: 'ri-forecast', workspaceId: snapshot.workspace.id, proposalId: null, leadId: lead.id, opportunityId: null, revenueType: 'one_time' as const, status: 'forecast' as const, amount: 850, recurringMonthlyAmount: 0, recognizedAt: '2026-07-20T12:00:00.000Z', competenceDate: '2026-07-20', servicePeriodStart: null, servicePeriodEnd: null, adjustmentReason: '', description: 'Prevista teste', ownerId: lead.ownerId, createdAt: '2026-07-20T12:00:00.000Z', updatedAt: '2026-07-20T12:00:00.000Z' },
      ],
    }
    const result = calculateRevenueIntelligence(custom, reference)
    expect(result.recognizedRevenue).toBeGreaterThanOrEqual(1200)
    expect(result.scheduledRevenue).toBeGreaterThanOrEqual(850)
    expect(result.sources.find((item) => item.label === lead.source)?.recognizedRevenue ?? 0).toBeGreaterThanOrEqual(1200)
  })

  it('mantém competência YYYY-MM-DD no mês informado sem deslocamento UTC', () => {
    const lead = snapshot.leads[0]
    const custom = {
      ...snapshot,
      revenueEntries: [{ id: 'ri-month-boundary', workspaceId: snapshot.workspace.id, proposalId: null, leadId: lead.id, opportunityId: null, revenueType: 'one_time' as const, status: 'recognized' as const, amount: 777, recurringMonthlyAmount: 0, recognizedAt: '2026-09-01T03:00:00.000Z', competenceDate: '2026-09-01', servicePeriodStart: null, servicePeriodEnd: null, adjustmentReason: '', description: 'Virada de mês', ownerId: lead.ownerId, createdAt: '2026-09-01T03:00:00.000Z', updatedAt: '2026-09-01T03:00:00.000Z' }],
    }
    expect(calculateRevenueIntelligence(custom, new Date(2026, 8, 15, 12)).recognizedRevenue).toBe(777)
  })

  it('calcula win rate somente sobre negócios encerrados no mês', () => {
    const base = snapshot.leads[0]
    const custom = {
      ...snapshot,
      leads: [
        ...snapshot.leads.filter((lead) => !['ri-won', 'ri-lost'].includes(lead.id)),
        { ...base, id: 'ri-won', status: 'won' as const, opportunityId: null, updatedAt: '2026-08-12T12:00:00.000Z' },
        { ...base, id: 'ri-lost', status: 'lost' as const, opportunityId: null, updatedAt: '2026-08-13T12:00:00.000Z' },
      ],
    }
    const result = calculateRevenueIntelligence(custom, new Date(2026, 7, 15, 12))
    expect(result.closedWonDeals).toBeGreaterThanOrEqual(1)
    expect(result.closedLostDeals).toBeGreaterThanOrEqual(1)
    expect(result.winRate).not.toBeNull()
  })

})
