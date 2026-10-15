import { describe, expect, it } from 'vitest'
import {
  DEMO_ACTIVITIES, DEMO_AUTOMATION_RULES, DEMO_AUTOMATION_RUNS, DEMO_CALLS, DEMO_COMPANIES, DEMO_CONTACTS, DEMO_CONTACT_RELATIONSHIPS,
  DEMO_EVENTS, DEMO_GOALS, DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PLAYBOOKS, DEMO_PRODUCTS, DEMO_PROPOSALS, DEMO_REVENUE_ENTRIES,
  DEMO_SOCIAL_PROFILES, DEMO_WORKSPACE, DEFAULT_STAGES,
} from '../../domain/defaults'
import type { WorkspaceSnapshot } from '../../domain/types'
import { normalizeSnapshotForRender } from '../../services/snapshot-safety'
import { fieldRegistry } from './field-registry'
import { inspectMetadataFoundation } from './metadata-inspector'
import { objectRegistry } from './object-registry'
import { relationRegistry } from './relation-registry'
import { getLatestMetadataInspection } from '../records/workspace-snapshot-adapter'
import { leadAdapter, workspaceSnapshotToPlatformRecords } from '../records/core-adapters'
import { inspectWorkspaceMetadata } from '../validation/metadata-validator'

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

describe('V101.9.0 Core Metadata Foundation', () => {
  it('registra os quatro objetos-base sem alterar os modelos legados', () => {
    expect(objectRegistry.list().map((item) => item.key)).toEqual(['lead', 'contact', 'company', 'opportunity'])
    expect(objectRegistry.get('lead').legacy).toBe(true)
    expect(objectRegistry.get('contact').sourceCollection).toBe('contacts')
    expect(fieldRegistry.list().length).toBeGreaterThan(30)
    expect(relationRegistry.list().length).toBeGreaterThanOrEqual(9)
  })

  it('adapta Lead para PlatformRecord preservando o registro legado', () => {
    const lead = DEMO_LEADS[0]
    const record = leadAdapter.toPlatformRecord(lead)
    expect(record.objectKey).toBe('lead')
    expect(record.id).toBe(lead.id)
    expect(record.workspaceId).toBe(lead.workspaceId)
    expect(record.relationIds.companyId).toBe(lead.companyId)
    expect(record.relationIds.primaryContactId).toBe(lead.primaryContactId)
    expect(leadAdapter.toLegacyRecord(record)).toBe(lead)
  })

  it('projeta o snapshot atual nos quatro objetos sem duplicar ou remover registros', () => {
    const value = snapshot()
    const records = workspaceSnapshotToPlatformRecords(value)
    expect(records.lead).toHaveLength(value.leads.length)
    expect(records.contact).toHaveLength(value.contacts.length)
    expect(records.company).toHaveLength(value.companies.length)
    expect(records.opportunity).toHaveLength(value.opportunities.length)
  })

  it('valida IDs, workspace e relações sem reescrever os dados', () => {
    const value = snapshot()
    const before = JSON.stringify(value)
    const inspection = inspectWorkspaceMetadata(value)
    expect(inspection.version).toBe('101.9.0')
    expect(inspection.objectCount).toBe(4)
    expect(inspection.errorCount).toBe(0)
    expect(JSON.stringify(value)).toBe(before)
  })

  it('detecta relação órfã e preserva o ID legado', () => {
    const value = snapshot()
    value.leads[0] = { ...value.leads[0], companyId: 'company-nao-existe' }
    const inspection = inspectWorkspaceMetadata(value)
    expect(inspection.issues.some((issue) => issue.code === 'missing_relation' && issue.relationId === 'lead-company')).toBe(true)
    expect(value.leads[0].companyId).toBe('company-nao-existe')
  })

  it('a normalização usada pela UI passa pelo adapter metadata e mantém o shape legado', () => {
    const value = snapshot()
    const normalized = normalizeSnapshotForRender(value)
    expect(normalized.leads.map((item) => item.id)).toEqual(value.leads.map((item) => item.id))
    expect(normalized.contacts.map((item) => item.id)).toEqual(value.contacts.map((item) => item.id))
    expect(normalized.companies.map((item) => item.id)).toEqual(value.companies.map((item) => item.id))
    expect(normalized.opportunities.map((item) => item.id)).toEqual(value.opportunities.map((item) => item.id))
    expect(getLatestMetadataInspection()?.recordCounts.lead).toBe(value.leads.length)
  })

  it('expõe inspector interno somente leitura com registries e diagnóstico', () => {
    const value = snapshot()
    const inspection = inspectMetadataFoundation(value)
    expect(inspection.objects).toHaveLength(4)
    expect(inspection.fields.length).toBeGreaterThan(30)
    expect(inspection.relations.length).toBeGreaterThanOrEqual(9)
    expect(inspection.snapshot?.version).toBe('101.9.0')
  })
})
