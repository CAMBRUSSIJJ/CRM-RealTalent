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
import type { Lead, WorkspaceSnapshot } from '../domain/types'
import type { CrmCapabilityPlanStep } from './realtalent-crm-capability-planner'
import type { CrmExecutionReceipt } from './realtalent-crm-execution-truth'
import {
  clearSalesLearning,
  formatSalesLearningContextForLead,
  linkSalesRecommendationToActionPlan,
  listPendingSalesRecommendations,
  listSalesLearningOutcomes,
  recordSalesLearningCorrection,
  stageSalesRecommendationsFromPlan,
  syncSalesLearningFromReceipt,
} from './realtalent-sales-learning-engine'

const WORKSPACE = DEMO_WORKSPACE.id
const activeStages = DEFAULT_STAGES.filter((stage) => !stage.isWon && !stage.isLost).sort((a, b) => a.order - b.order)
const sourceLead: Lead = { ...DEMO_LEADS[0], stageId: activeStages[0]?.id ?? DEMO_LEADS[0].stageId, status: 'active' }

const snapshot = (lead: Lead = sourceLead): WorkspaceSnapshot => ({
  workspace: DEMO_WORKSPACE,
  stages: DEFAULT_STAGES,
  leads: DEMO_LEADS.map((item) => item.id === lead.id ? lead : item),
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
})

const recommendationStep = (): CrmCapabilityPlanStep => ({
  id: 'sales-rec-step', capabilityId: 'sales.next_best_action', title: 'Próxima melhor ação', reason: 'teste', risk: 'read',
  args: [{ name: 'record_query', value: sourceLead.name }],
})

const actionStep = (capabilityId = 'pipeline.move'): CrmCapabilityPlanStep => ({
  id: 'sales-action-step', capabilityId, title: 'Executar ação', reason: 'teste', risk: 'medium',
  args: [{ name: 'record_query', value: sourceLead.name }, { name: 'stage_query', value: activeStages[1]?.name ?? activeStages[0]?.name ?? '' }],
})

const receipt = (status: CrmExecutionReceipt['status'] = 'verified', capabilityId = 'pipeline.move'): CrmExecutionReceipt => ({
  id: 'receipt:sales-action:1', workspaceId: WORKSPACE, planId: 'plan:action:1', goal: 'Executar recomendação', repositoryMode: 'local',
  startedAt: '2026-10-15T12:00:00.000Z', completedAt: '2026-10-15T12:01:00.000Z', status, uiRefresh: 'confirmed',
  steps: [{ stepId: 'sales-action-step', capabilityId, title: 'Executar ação', risk: 'medium', status: status === 'verified' ? 'verified' : 'acknowledged', summary: 'ação executada', checks: [] }],
})

const stageAndLink = (base = snapshot()) => {
  expect(stageSalesRecommendationsFromPlan(WORKSPACE, `o que devo fazer com ${sourceLead.name}?`, { id: 'plan:recommendation:1', steps: [recommendationStep()] }, base, sourceLead.id)).toBe(1)
  const linked = linkSalesRecommendationToActionPlan(WORKSPACE, 'faça isso', { id: 'plan:action:1', steps: [actionStep()] }, base, sourceLead.id)
  expect(linked?.leadId).toBe(sourceLead.id)
  expect(linked?.actionPlanId).toBe('plan:action:1')
  return linked!
}

describe('RealTalent Agent — Sales Learning Loop', () => {
  beforeEach(() => clearSalesLearning(WORKSPACE))

  it('fotografa a recomendação e vincula a ação posterior ao mesmo negócio', () => {
    stageAndLink()
    const pending = listPendingSalesRecommendations(WORKSPACE)
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ leadId: sourceLead.id, recommendationPlanId: 'plan:recommendation:1', actionPlanId: 'plan:action:1' })
    expect(pending[0].baseline.healthScore).toBeGreaterThanOrEqual(0)
    expect(pending[0].riskKeys).toEqual(expect.any(Array))
  })

  it('não aprende resultado comercial a partir de recibo parcial ou não verificado', () => {
    stageAndLink()
    const moved = { ...sourceLead, stageId: activeStages[1]?.id ?? sourceLead.stageId }
    expect(syncSalesLearningFromReceipt(WORKSPACE, receipt('partial'), snapshot(moved))).toBe(0)
    expect(listSalesLearningOutcomes(WORKSPACE)).toHaveLength(0)
    expect(listPendingSalesRecommendations(WORKSPACE)).toHaveLength(1)
  })

  it('aprende positivamente quando ação verificada é seguida por avanço real no mesmo negócio', () => {
    stageAndLink()
    const nextStage = activeStages[1] ?? activeStages[0]
    expect(nextStage).toBeTruthy()
    const moved = { ...sourceLead, stageId: nextStage!.id, updatedAt: '2026-10-15T12:01:00.000Z' }
    expect(syncSalesLearningFromReceipt(WORKSPACE, receipt(), snapshot(moved))).toBe(1)
    const outcomes = listSalesLearningOutcomes(WORKSPACE)
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0].outcome).toBe('positive')
    expect(outcomes[0].stageDelta).toBeGreaterThan(0)
    expect(outcomes[0].evidence.some((item) => item.includes('avançou de etapa'))).toBe(true)
    expect(listPendingSalesRecommendations(WORKSPACE)).toHaveLength(0)
  })

  it('não transforma perda verificada em exemplo positivo', () => {
    stageAndLink()
    const lostStage = DEFAULT_STAGES.find((stage) => stage.isLost)
    const lost = { ...sourceLead, status: 'lost' as const, stageId: lostStage?.id ?? sourceLead.stageId }
    expect(syncSalesLearningFromReceipt(WORKSPACE, receipt(), snapshot(lost))).toBe(1)
    expect(listSalesLearningOutcomes(WORKSPACE)[0]?.outcome).toBe('negative')
  })

  it('não duplica o mesmo recibo comercial', () => {
    stageAndLink()
    const moved = { ...sourceLead, stageId: (activeStages[1] ?? activeStages[0])!.id }
    const current = snapshot(moved)
    expect(syncSalesLearningFromReceipt(WORKSPACE, receipt(), current)).toBe(1)
    expect(syncSalesLearningFromReceipt(WORKSPACE, receipt(), current)).toBe(0)
    expect(listSalesLearningOutcomes(WORKSPACE)).toHaveLength(1)
  })

  it('reutiliza somente o padrão agregado e não vaza o nome do cliente histórico', () => {
    stageAndLink()
    const moved = { ...sourceLead, stageId: (activeStages[1] ?? activeStages[0])!.id }
    syncSalesLearningFromReceipt(WORKSPACE, receipt(), snapshot(moved))
    const context = formatSalesLearningContextForLead(WORKSPACE, sourceLead, snapshot())
    expect(context).toContain('RT_SALES_LEARNING')
    expect(context).toContain('PADRÃO POSITIVO')
    expect(context).not.toContain(sourceLead.name)
    expect(context).toContain('Nunca reutilize nomes, valores, datas ou identificadores')
  })

  it('uma correção do usuário despromove o último resultado comercial positivo', () => {
    stageAndLink()
    const moved = { ...sourceLead, stageId: (activeStages[1] ?? activeStages[0])!.id }
    syncSalesLearningFromReceipt(WORKSPACE, receipt(), snapshot(moved))
    expect(recordSalesLearningCorrection(WORKSPACE, 'não foi isso, eu queria outra ação')).toBe(true)
    expect(listSalesLearningOutcomes(WORKSPACE)[0]?.outcome).toBe('corrected')
    expect(formatSalesLearningContextForLead(WORKSPACE, sourceLead, snapshot())).toBe('')
  })
})
