import { describe, expect, it } from 'vitest'
import type { Lead, WorkspaceSnapshot } from '../../domain/types'
import { buildContactPersonRecordPageModel } from './contact-person-record-adapter'
import { contactPersonRecordPageDefinition, recordPageRegistry } from './record-page-registry'

const lead = {
  id: 'lead-1', workspaceId: 'ws-1', name: 'Carlos Almeida', company: 'ACME', phone: '555', email: 'carlos@acme.test', city: 'Rio Grande',
  source: 'manual', companyId: 'company-1', primaryContactId: 'contact-1', opportunityId: 'opp-1', stageId: 'stage-1', status: 'active',
  temperature: 'warm', priority: 'high', ownerId: 'owner-1', ownerName: 'Ana', value: 25000, nextActionAt: null, notes: '', tags: [],
  createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
} satisfies Lead

const snapshot = {
  workspace: { id: 'ws-1', name: 'Workspace', slug: 'workspace', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' },
  stages: [], leads: [lead], activities: [], calls: [], events: [], playbooks: [], goals: [], automationRules: [], automationRuns: [],
  companies: [{ id: 'company-1', workspaceId: 'ws-1', name: 'ACME', legalName: 'ACME', cnpj: '', domain: '', website: '', segment: '', phone: '', city: '', state: '', status: 'prospect', leadIds: ['lead-1'], createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }],
  contacts: [{ id: 'contact-1', workspaceId: 'ws-1', companyId: 'company-1', name: 'Carlos Almeida', jobTitle: 'CEO', phone: '555', email: 'carlos@acme.test', decisionRole: 'decision_maker', influenceLevel: 90, consentStatus: 'unknown', doNotContact: false, doNotContactReason: '', leadIds: ['lead-1'], isPrimary: true, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }],
  contactRelationships: [],
  opportunities: [{ id: 'opp-1', workspaceId: 'ws-1', companyId: 'company-1', primaryContactId: 'contact-1', leadId: 'lead-1', title: 'Projeto', stageId: 'stage-1', status: 'active', value: 25000, ownerId: 'owner-1', expectedCloseAt: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }],
  socialProfiles: [], products: [], proposals: [], revenueEntries: [],
} as unknown as WorkspaceSnapshot

describe('V101.9.2 Universal Record Page', () => {
  it('registra Contato/Pessoa com shell, tabs e widgets universais', () => {
    expect(recordPageRegistry.get('contact-person-record-v10192')).toBe(contactPersonRecordPageDefinition)
    expect(contactPersonRecordPageDefinition.canonicalObjectKey).toBe('contact')
    expect(contactPersonRecordPageDefinition.acceptedObjectKeys).toEqual(['contact', 'lead'])
    expect(contactPersonRecordPageDefinition.tabs.map((item) => item.id)).toEqual(['overview', 'activities', 'notes', 'account'])
    expect(contactPersonRecordPageDefinition.widgets.map((item) => item.kind)).toEqual(expect.arrayContaining(['fields', 'timeline', 'related-records', 'quick-actions', 'communication']))
  })

  it('resolve a Pessoa canônica sem perder o Lead de compatibilidade', () => {
    const model = buildContactPersonRecordPageModel(lead, snapshot)
    expect(model.source.objectKey).toBe('lead')
    expect(model.source.id).toBe('lead-1')
    expect(model.canonical?.objectKey).toBe('contact')
    expect(model.canonical?.id).toBe('contact-1')
    expect(model.relationCounts.opportunities).toBe(1)
    expect(model.diagnostics).toHaveLength(0)
  })

  it('mantém fallback legado quando ainda não existe ContactRecord', () => {
    const legacySnapshot = { ...snapshot, contacts: [] } as WorkspaceSnapshot
    const model = buildContactPersonRecordPageModel({ ...lead, primaryContactId: null }, legacySnapshot)
    expect(model.canonical).toBeNull()
    expect(model.source.objectKey).toBe('lead')
    expect(model.diagnostics.some((issue) => issue.code === 'legacy_lead_source')).toBe(true)
  })
})
