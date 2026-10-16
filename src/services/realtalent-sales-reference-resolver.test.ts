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
import { buildSalesAgentContext } from './realtalent-sales-intelligence-agent'
import { resolveSalesReferenceContinuation } from './realtalent-sales-reference-resolver'

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

const now = new Date('2026-10-16T15:00:00.000Z')
const ids = DEMO_LEADS.slice(0, 4).map((lead) => lead.id)

const capabilityForAction = (action: ReturnType<typeof buildSalesAgentContext>['nextBestAction']['kind']) => ({
  call: 'calls.open',
  followup: 'activities.create_followup',
  meeting: 'calendar.create',
  map_stakeholder: 'tasks.create',
  proposal: 'proposals.create',
  review_proposal: 'navigation.open',
  update_close_date: 'tasks.create',
  review: 'navigation.open',
}[action])

describe('RealTalent Agent — ranked sales references', () => {
  it('recalcula e executa a próxima melhor ação quando o usuário diz “faça a primeira”', () => {
    const resolution = resolveSalesReferenceContinuation('faça a primeira', snapshot, { previousLeadIds: ids, now })
    expect(resolution?.kind).toBe('plan')
    if (!resolution || resolution.kind !== 'plan') return

    const lead = snapshot.leads.find((item) => item.id === ids[0])!
    const action = buildSalesAgentContext(lead, snapshot, now).nextBestAction.kind
    expect(resolution.leadIds).toEqual([ids[0]])
    expect(resolution.result.plan.steps[0]?.capabilityId).toBe(capabilityForAction(action))
    expect(resolution.result.plan.steps[0]?.args.some((arg) => arg.value === ids[0])).toBe(true)
  })

  it('permite sobrescrever a recomendação com “ligue para o segundo”', () => {
    const resolution = resolveSalesReferenceContinuation('ligue para o segundo', snapshot, { previousLeadIds: ids, now })
    expect(resolution?.kind).toBe('plan')
    if (!resolution || resolution.kind !== 'plan') return

    expect(resolution.leadIds).toEqual([ids[1]])
    expect(resolution.result.plan.steps).toHaveLength(1)
    expect(resolution.result.plan.steps[0]).toMatchObject({ capabilityId: 'calls.open', risk: 'read' })
    expect(resolution.result.plan.steps[0]?.args).toContainEqual({ name: 'record_query', value: ids[1] })
  })

  it('cria um plano em lote confirmado para os três primeiros follow-ups', () => {
    const resolution = resolveSalesReferenceContinuation('crie follow-up para os três primeiros', snapshot, { previousLeadIds: ids, now })
    expect(resolution?.kind).toBe('plan')
    if (!resolution || resolution.kind !== 'plan') return

    expect(resolution.leadIds).toEqual(ids.slice(0, 3))
    expect(resolution.result.plan.steps).toHaveLength(3)
    expect(resolution.result.plan.steps.every((step) => step.capabilityId === 'activities.create_followup')).toBe(true)
    expect(resolution.result.plan.steps.every((step) => step.risk === 'high')).toBe(true)
    expect(resolution.result.plan.steps.every((step) => step.args.some((arg) => arg.name === 'due_at' && Boolean(arg.value)))).toBe(true)
  })

  it('resolve referências numéricas explícitas sem perder a ordem da lista', () => {
    const resolution = resolveSalesReferenceContinuation('faça 1 e 2', snapshot, { previousLeadIds: ids, now })
    expect(resolution?.kind).toBe('plan')
    if (!resolution || resolution.kind !== 'plan') return
    expect(resolution.leadIds).toEqual(ids.slice(0, 2))
  })

  it('não inventa referência quando não há lista ativa', () => {
    const resolution = resolveSalesReferenceContinuation('faça a primeira', snapshot, { previousLeadIds: [], now })
    expect(resolution).toMatchObject({ kind: 'clarify' })
  })

  it('bloqueia referência stale quando o registro saiu do snapshot atual', () => {
    const staleId = ids[1]
    const current: WorkspaceSnapshot = { ...snapshot, leads: snapshot.leads.filter((lead) => lead.id !== staleId) }
    const resolution = resolveSalesReferenceContinuation('ligue para o segundo', current, { previousLeadIds: ids, now })
    expect(resolution).toMatchObject({ kind: 'clarify' })
    if (resolution?.kind === 'clarify') expect(resolution.message).toContain('#2')
  })

  it('substitui naturalmente o contexto antigo quando recebe uma nova ordem de referências', () => {
    const reversed = [...ids].reverse()
    const resolution = resolveSalesReferenceContinuation('abra o primeiro', snapshot, { previousLeadIds: reversed, now })
    expect(resolution?.kind).toBe('plan')
    if (!resolution || resolution.kind !== 'plan') return
    expect(resolution.leadIds).toEqual([reversed[0]])
    expect(resolution.result.plan.steps[0]?.capabilityId).toBe('navigation.open')
  })
})
