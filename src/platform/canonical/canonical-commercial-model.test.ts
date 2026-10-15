import { describe, expect, it } from 'vitest'
import {
  DEMO_ACTIVITIES, DEMO_AUTOMATION_RULES, DEMO_AUTOMATION_RUNS, DEMO_CALLS, DEMO_COMPANIES, DEMO_CONTACTS, DEMO_CONTACT_RELATIONSHIPS,
  DEMO_EVENTS, DEMO_GOALS, DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PLAYBOOKS, DEMO_PRODUCTS, DEMO_PROPOSALS, DEMO_REVENUE_ENTRIES,
  DEMO_SOCIAL_PROFILES, DEMO_WORKSPACE, DEFAULT_STAGES,
} from '../../domain/defaults'
import type { WorkspaceSnapshot } from '../../domain/types'
import { normalizeSnapshotForRender } from '../../services/snapshot-safety'
import { buildCanonicalCommercialGraph, canonicalizeWorkspaceSnapshot } from './canonical-record-graph'

const snapshot = (): WorkspaceSnapshot => ({
  workspace: { ...DEMO_WORKSPACE },
  stages: DEFAULT_STAGES.map((item) => ({ ...item })),
  leads: DEMO_LEADS.map((item) => ({ ...item, tags: [...item.tags] })),
  activities: DEMO_ACTIVITIES.map((item) => ({ ...item })),
  calls: DEMO_CALLS.map((item) => ({ ...item })),
  events: DEMO_EVENTS.map((item) => ({ ...item })),
  playbooks: DEMO_PLAYBOOKS.map((item) => ({ ...item, tags: [...item.tags] })),
  goals: DEMO_GOALS.map((item) => ({ ...item })),
  automationRules: DEMO_AUTOMATION_RULES.map((item) => ({ ...item })),
  automationRuns: DEMO_AUTOMATION_RUNS.map((item) => ({ ...item })),
  companies: DEMO_COMPANIES.map((item) => ({ ...item, leadIds: [...item.leadIds] })),
  contacts: DEMO_CONTACTS.map((item) => ({ ...item, leadIds: [...item.leadIds] })),
  contactRelationships: DEMO_CONTACT_RELATIONSHIPS.map((item) => ({ ...item })),
  opportunities: DEMO_OPPORTUNITIES.map((item) => ({ ...item })),
  socialProfiles: DEMO_SOCIAL_PROFILES.map((item) => ({ ...item })),
  products: DEMO_PRODUCTS.map((item) => ({ ...item })),
  proposals: DEMO_PROPOSALS.map((item) => ({ ...item, items: item.items.map((line) => ({ ...line })) })),
  revenueEntries: DEMO_REVENUE_ENTRIES.map((item) => ({ ...item })),
})

describe('V101.9.3 Person / Company / Opportunity Canonical Model', () => {
  it('resolve Pessoa, Empresa e Oportunidade para cada Lead estruturado', () => {
    const value = snapshot()
    const graph = buildCanonicalCommercialGraph(value)
    const link = graph.links.get(value.leads[0].id)
    expect(link?.personId).toBeTruthy()
    expect(link?.companyId).toBeTruthy()
    expect(link?.opportunityId).toBeTruthy()
  })

  it('Pessoa canônica vence identidade divergente do Lead legado', () => {
    const value = snapshot()
    const lead = value.leads[0]
    const contact = value.contacts.find((item) => item.id === lead.primaryContactId)
    expect(contact).toBeTruthy()
    lead.name = 'Nome legado divergente'
    lead.email = 'legado@exemplo.com'
    contact!.name = 'Pessoa canônica'
    contact!.email = 'canonica@exemplo.com'
    const normalized = normalizeSnapshotForRender(value)
    const projected = normalized.leads.find((item) => item.id === lead.id)!
    expect(projected.name).toBe('Pessoa canônica')
    expect(projected.email).toBe('canonica@exemplo.com')
  })

  it('Empresa canônica vence identidade empresarial divergente do Lead', () => {
    const value = snapshot()
    const lead = value.leads[0]
    const company = value.companies.find((item) => item.id === lead.companyId)
    expect(company).toBeTruthy()
    lead.company = 'Empresa legado'
    lead.website = 'https://legado.example'
    company!.name = 'Empresa canônica'
    company!.website = 'https://canonica.example'
    const result = canonicalizeWorkspaceSnapshot(value)
    const projected = result.snapshot.leads.find((item) => item.id === lead.id)!
    expect(projected.company).toBe('Empresa canônica')
    expect(projected.website).toBe('https://canonica.example')
  })

  it('Oportunidade canônica vence stage/value divergentes do Lead', () => {
    const value = snapshot()
    const lead = value.leads[0]
    const opportunity = value.opportunities.find((item) => item.id === lead.opportunityId)
    expect(opportunity).toBeTruthy()
    lead.value = 10
    opportunity!.value = 98765
    const result = canonicalizeWorkspaceSnapshot(value)
    const projected = result.snapshot.leads.find((item) => item.id === lead.id)!
    expect(projected.value).toBe(98765)
    expect(projected.stageId).toBe(opportunity!.stageId)
  })

  it('mantém fallback legado sem apagar Lead quando um registro canônico falta', () => {
    const value = snapshot()
    const lead = value.leads[0]
    value.contacts = value.contacts.filter((item) => item.id !== lead.primaryContactId && !item.leadIds.includes(lead.id))
    lead.primaryContactId = null
    lead.email = ''
    lead.phone = ''
    const result = canonicalizeWorkspaceSnapshot(value)
    expect(result.snapshot.leads.find((item) => item.id === lead.id)?.name).toBe(lead.name)
    expect(result.inspection.issues.some((item) => item.code === 'missing_person' && item.leadId === lead.id)).toBe(true)
  })

  it('não modifica o snapshot de entrada', () => {
    const value = snapshot()
    value.leads[0].name = 'Projection antiga'
    const before = JSON.stringify(value)
    canonicalizeWorkspaceSnapshot(value)
    expect(JSON.stringify(value)).toBe(before)
  })

  it('expõe autoridade canônica explícita e Lead como legacy-projection', () => {
    const inspection = canonicalizeWorkspaceSnapshot(snapshot()).inspection
    expect(inspection.version).toBe('101.9.3')
    expect(inspection.authority.person).toBe('ContactRecord')
    expect(inspection.authority.company).toBe('CompanyRecord')
    expect(inspection.authority.opportunity).toBe('OpportunityRecord')
    expect(inspection.authority.lead).toBe('legacy-projection')
  })
})
