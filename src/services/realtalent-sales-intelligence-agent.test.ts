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
import { REALTALENT_UNIVERSAL_CAPABILITIES } from './realtalent-crm-universal-registry'
import { buildSalesAgentContext, buildSalesPortfolioSelection, formatSalesAgentDealAnalysis, formatSalesAgentNextBestAction, formatSalesPortfolio } from './realtalent-sales-intelligence-agent'

const baseSnapshot: WorkspaceSnapshot = {
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

describe('RealTalent Agent — Sales Intelligence V1', () => {
  it('transforma o motor de Deal Intelligence em contexto estruturado para a Agent', () => {
    const lead = DEMO_LEADS.find((item) => item.id === 'lead-alpha')!
    const context = buildSalesAgentContext(lead, baseSnapshot, now)

    expect(context.entity.id).toBe(lead.id)
    expect(context.health.score).toBeGreaterThanOrEqual(0)
    expect(context.health.score).toBeLessThanOrEqual(100)
    expect(context.health.realTalentProbability).toBeGreaterThanOrEqual(0)
    expect(context.nextBestAction.title.length).toBeGreaterThan(0)
    expect(context.generatedAt).toBe(now.toISOString())
  })

  it('preserva a recomendação determinística de mapear o decisor quando a cobertura é insuficiente', () => {
    const source = DEMO_LEADS.find((item) => item.id === 'lead-bronx')!
    const lead = { ...source, value: 12_000, stageId: 'stage-negotiation' }
    const snapshot: WorkspaceSnapshot = { ...baseSnapshot, leads: baseSnapshot.leads.map((item) => item.id === lead.id ? lead : item) }
    const context = buildSalesAgentContext(lead, snapshot, now)

    expect(context.risks.some((risk) => risk.key === 'missing-decision-maker')).toBe(true)
    expect(context.nextBestAction.kind).toBe('map_stakeholder')
    expect(formatSalesAgentNextBestAction(lead, snapshot, now)).toContain('Mapear decisor')
  })

  it('gera uma resposta comercial explicável, e não apenas um score solto', () => {
    const lead = DEMO_LEADS.find((item) => item.id === 'lead-alpha')!
    const summary = formatSalesAgentDealAnalysis(lead, baseSnapshot, now)

    expect(summary).toContain('Saúde:')
    expect(summary).toContain('Probabilidade: vendedor')
    expect(summary).toContain('Riscos principais:')
    expect(summary).toContain('Próxima melhor ação:')
  })

  it('publica as duas capacidades de leitura no catálogo semântico da Agent', () => {
    const analyze = REALTALENT_UNIVERSAL_CAPABILITIES.find((item) => item.id === 'sales.analyze_deal')
    const next = REALTALENT_UNIVERSAL_CAPABILITIES.find((item) => item.id === 'sales.next_best_action')

    expect(analyze).toMatchObject({ action: 'read', risk: 'read', execution: 'native', permissionAction: 'view' })
    expect(next).toMatchObject({ action: 'read', risk: 'read', execution: 'native', permissionAction: 'view' })
    expect(analyze?.argumentHints).toContain('record_query')
    expect(next?.argumentHints).toContain('record_query')
  })

  it('prioriza a carteira inteira usando o Deal Portfolio já existente', () => {
    const { portfolio, deals } = buildSalesPortfolioSelection(baseSnapshot, 'priorities', now)
    expect(portfolio.deals.length).toBeGreaterThan(0)
    expect(deals[0]?.lead.id).toBe(portfolio.priorities[0]?.lead.id)
    const text = formatSalesPortfolio(baseSnapshot, 'priorities', now)
    expect(text).toContain('Prioridades comerciais da carteira')
    expect(text).toContain('Próxima ação:')
  })

  it('recorta risco, cooling e ausência de decisor sem inventar negócios', () => {
    const risk = buildSalesPortfolioSelection(baseSnapshot, 'risk', now).deals
    const cooling = buildSalesPortfolioSelection(baseSnapshot, 'cooling', now).deals
    const missingDecision = buildSalesPortfolioSelection(baseSnapshot, 'decision_maker', now).deals
    expect(risk.every((deal) => deal.healthLevel === 'attention' || deal.healthLevel === 'critical')).toBe(true)
    expect(cooling.every((deal) => deal.momentum === 'cooling')).toBe(true)
    expect(missingDecision.every((deal) => deal.risks.some((item) => item.key === 'missing-decision-maker'))).toBe(true)
  })

  it('registra as capacidades de inteligência de carteira como somente leitura', () => {
    for (const id of ['sales.prioritize_pipeline', 'sales.call_priorities', 'sales.at_risk_deals', 'sales.cooling_deals', 'sales.missing_decision_maker', 'sales.closing_risk_this_month']) {
      const capability = REALTALENT_UNIVERSAL_CAPABILITIES.find((item) => item.id === id)
      expect(capability).toMatchObject({ action: 'read', risk: 'read', execution: 'native', resource: 'pipeline', permissionAction: 'view' })
    }
  })


  it('respeita um snapshot previamente filtrado por visibilidade', () => {
    const allowed = baseSnapshot.leads[0]
    const restrictedSnapshot: WorkspaceSnapshot = { ...baseSnapshot, leads: allowed ? [allowed] : [] }
    const { deals } = buildSalesPortfolioSelection(restrictedSnapshot, 'priorities', now)
    expect(deals.map((deal) => deal.lead.id)).toEqual(allowed ? [allowed.id] : [])
    const text = formatSalesPortfolio(restrictedSnapshot, 'priorities', now)
    for (const hidden of baseSnapshot.leads.filter((lead) => lead.id !== allowed?.id)) {
      expect(text).not.toContain(hidden.company || hidden.name)
    }
  })


  it('não chama de prioridade de ligação uma ação que não seja call', () => {
    const calls = buildSalesPortfolioSelection(baseSnapshot, 'calls', now).deals
    expect(calls.every((deal) => deal.nextBestAction.kind === 'call' && deal.nextBestAction.urgency !== 'planned')).toBe(true)
    const text = formatSalesPortfolio(baseSnapshot, 'calls', now)
    expect(text).toContain('Prioridades de ligação para hoje')
  })

})
