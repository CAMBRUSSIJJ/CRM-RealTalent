import { beforeEach, describe, expect, it } from 'vitest'
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
import type { CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'
import {
  clearSalesLearning,
  listPendingSalesRecommendations,
  stageSalesRecommendationsFromPlan,
} from './realtalent-sales-learning-engine'

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

describe('RealTalent Agent — learned action attribution', () => {
  beforeEach(() => clearSalesLearning(DEMO_WORKSPACE.id))

  it('stores the action actually recommended by Recommendation Engine V2', () => {
    const lead = DEMO_LEADS[0]
    const step: CrmCapabilityPlanStep = {
      id: 'sales-attribution-step',
      capabilityId: 'sales.next_best_action',
      title: 'Próxima melhor ação',
      reason: 'Recommendation Engine V2',
      risk: 'read',
      args: [
        { name: 'record_query', value: lead.id },
        { name: 'recommended_action', value: 'call' },
        { name: 'recommended_action_title', value: 'Ligar agora' },
        { name: 'recommended_action_route', value: 'calls' },
      ],
    }

    expect(stageSalesRecommendationsFromPlan(
      DEMO_WORKSPACE.id,
      `qual a próxima melhor ação para ${lead.name}?`,
      { id: 'plan:learned-attribution', steps: [step] },
      snapshot,
      lead.id,
    )).toBe(1)

    expect(listPendingSalesRecommendations(DEMO_WORKSPACE.id)).toEqual([
      expect.objectContaining({
        leadId: lead.id,
        recommendationPlanId: 'plan:learned-attribution',
        actionKind: 'call',
        actionTitle: 'Ligar agora',
        actionRoute: 'calls',
      }),
    ])
  })
})
